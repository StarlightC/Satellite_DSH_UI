import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createHarness, findAll, text } from './render.mjs'

/** 本包根目录（test/ 的上一级）。 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const Schema = require('@deepseek-ai/schemastery')
const schemaEnvelope = (routes) => JSON.parse(JSON.stringify(Schema.object({ routes: Schema.array(Schema.any()).default(routes) }).toJSON()))
/** Android 命名空间的 schema 封套：只声明 `execution` 这一个 volatile 对象。 */
const androidSchemaEnvelope = (defaults = {}, declareExecution = true) => JSON.parse(JSON.stringify(Schema.object(declareExecution ? {
  execution: Schema.object({
    enabled: Schema.boolean().default(defaults.enabled ?? false),
    operationTimeoutMs: Schema.number().default(defaults.operationTimeoutMs ?? 600000),
    outputMaxBytes: Schema.number().default(defaults.outputMaxBytes ?? 262144),
  }).default({ enabled: false, operationTimeoutMs: 600000, outputMaxBytes: 262144 }),
} : {}).toJSON()))
const schemaService = {
  Schema,
  rehydrate(serialized) { return new this.Schema(serialized) },
  nodeAtPath(root, path) {
    let node = root
    for (const key of path) node = node?.type === 'object' ? node.dict?.[key] : undefined
    return node
  },
}
const bundle = await readFile(join(root, 'lib/client.js'), 'utf8')

/**
 * 浏览器半边是宿主注入的模块工厂，不能在 node 里直接 import（没有 window、
 * 也没有宿主 require）。这里按宿主的方式跑一遍：造一个 window.__ModuleLoader__，
 * 在沙箱里求值产物，再调用工厂拿到它的返回值。
 * 传 `harness` 时 `react` 与 `react/jsx-runtime` 换成测试替身，才能把元素树渲染出来。
 * @returns {{ exports: Record<string, unknown>, id: string }}
 */
function loadFactory(harness) {
  const loaded = []
  const sandbox = {
    console,
    // 产物在没有 subscribe 的设置面上会退回 setInterval 轮询；unref 避免测试进程被它挂住。
    setInterval: (...args) => {
      const handle = setInterval(...args)
      handle.unref?.()
      return handle
    },
    clearInterval,
    setTimeout,
    clearTimeout,
    window: {
      __ModuleLoader__: {
        load: (entry) => {
          loaded.push(entry)
        },
      },
    },
  }
  vm.runInNewContext(bundle, sandbox, { filename: 'lib/client.js' })
  assert.equal(loaded.length, 1, '产物只调用一次 load')
  assert.equal(loaded[0].id, 'satellite-ui')
  const local = harness === undefined
    ? require
    : (id) => (id === 'react' ? harness.react : id === 'react/jsx-runtime' ? harness.jsxRuntime : require(id))
  return { exports: loaded[0].factory(local), id: loaded[0].id }
}

/** 造一个最小宿主 ctx：记录 effect/注册事件，并可注入 configForms 与 remote。 */
function host({ configForms, remote } = {}) {
  const events = []
  const disposers = []
  const registrations = []
  const ctx = {
    effect: (run, label) => {
      events.push(label)
      const dispose = run()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    locale: {
      register: (ns, lang) => { events.push(`locale:${ns}:${lang}`) },
      bind: (ns) => (key) => `${ns}:${key}`,
    },
    slots: {
      inject: (_name, register) => { register() },
      register: (options, component) => { registrations.push({ options, component }) },
    },
    get: (name) => {
      if (name === 'slots') return ctx.slots
      if (name === 'configForms') return configForms
      if (name === 'settingsSchema') return schemaService
      if (name === 'remote.satelliteRoles') return remote?.satelliteRoles
      if (name === 'remote') return remote
      if (name === 'remote.pluginManager') return remote?.pluginManager ?? { listBundles: async () => ({ ok: true, value: [{ name: 'satellite', version: '0.1.0', installed: true, enabled: true }] }) }
      return undefined
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }
  if (configForms !== undefined) ctx.configForms = configForms
  return { ctx, events, disposers, registrations }
}

/** 让挂起的目录/写回 promise 结算。 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** patch 里预置的默认形状：两个声明的角色 + 它们各自的生效 provider/model。 */
const DEFAULT_VALUE = {
  declaredRoles: ['validation', 'android-context'],
  routes: [
    { role: 'validation', provider: 'deepseek-official', model: 'deepseek-flash' },
    { role: 'android-context', provider: 'deepseek-official', model: 'deepseek-v4-pro' },
  ],
}

/** Plugin-owned fixtures, deliberately independent of declaredRoles. */
const pluginRole = (role, bindings = [{ node: 'validate', phase: 'base', condition: 'Always for validation' }]) => ({
  role, label: `Friendly ${role}`, description: `Responsibility for ${role}`,
  skill: `skill-${role}`, sandbox: 'read-only', bindings,
})
const ROLE_CATALOG = { version: 1, roles: DEFAULT_VALUE.declaredRoles.map((role) => pluginRole(role)) }
const rolesCatalog = (...roles) => ({ version: 1, roles: roles.map((role) => pluginRole(role)) })

/** 一组可用的目录：两个 provider，其中一个有多个模型。 */
const CATALOG = {
  ok: true,
  value: {
    groups: [
      {
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [{ id: 'deepseek-flash', name: 'Flash' }, { id: 'deepseek-v4-pro', name: 'V4 Pro' }],
      },
      { id: 'anthropic', name: 'Anthropic', models: [{ id: 'claude-sonnet', name: 'Sonnet' }] },
    ],
    failures: [],
  },
}

/**
 * 造一个只服务 `satellite-node` 的设置服务，并记录写操作。
 *
 * `whileServed` 按官方实现（`dsh-client-ui-settings/lib/client.js:1330-1346`）复刻：watch 一个命名空间
 * 集合，命中才调 `register`、并把它的 disposer 收起来；不再服务或整体卸载时跑该 disposer。
 * 返回的 `configForms.trigger()` 模拟"宿主开始服务该命名空间"（官方是共享镜像的订阅回调），
 * 不调用它时 `configForms.get` 仍会给出表单——因此测试能区分"门控没开"与"门控开了才注册"。
 * @param value - `satellite-node` 命名空间的值。
 * @param options - `{ writable, revision, writes, namespaces }`。
 */
function configFormsHost(value, { writable = true, revision = 7, writes = [], namespaces = ['satellite-node'], base = value, user = value, status = 'ready', accepted = true, defaults = base?.routes ?? [], android } = {}) {
  const mirrorListeners = new Set()
  class Controller {
    snapshot = { status, writable, revision, value, base, user }
    listeners = new Set()
    accepted = accepted
    schema = schemaEnvelope(defaults)
    getSnapshot() { return this.snapshot }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
    publish(change) {
      this.snapshot = { ...this.snapshot, ...change }
      for (const listener of this.listeners) listener()
      for (const listener of mirrorListeners) listener()
    }
    mutate(ops, nextRevision) {
      writes.push({ ops, revision: nextRevision })
      if (!this.accepted || nextRevision !== this.snapshot.revision) return false
      const routes = ops[0].op === 'unset' ? undefined : ops[0].value
      const user = { ...this.snapshot.user }
      if (routes === undefined) delete user.routes
      else user.routes = routes
      this.publish({ user, value: { ...this.snapshot.base, ...user }, revision: this.snapshot.revision + 1 })
      return true
    }
  }
  /**
   * Android 执行配置那一格：`mutate` 按路径 set/unset（与真实 configForms 的
   * 稀疏覆盖语义一致），而不是像 routes 那样整段替换。
   */
  class AndroidController {
    constructor(options) {
      this.snapshot = {
        status: options.status ?? 'ready',
        writable: options.writable ?? true,
        revision: options.revision ?? 11,
        value: options.value ?? {},
        base: options.base ?? { execution: { enabled: false } },
        user: options.user ?? {},
      }
      this.listeners = new Set()
      this.accepted = options.accepted ?? true
      this.schema = androidSchemaEnvelope(options.defaults, options.declareExecution !== false)
    }
    getSnapshot() { return this.snapshot }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
    publish(change) {
      this.snapshot = { ...this.snapshot, ...change }
      for (const listener of this.listeners) listener()
      for (const listener of mirrorListeners) listener()
    }
    mutate(ops, nextRevision) {
      writes.push({ ops, revision: nextRevision })
      if (!this.accepted || nextRevision !== this.snapshot.revision) return false
      const user = structuredClone(this.snapshot.user ?? {})
      for (const op of ops) {
        const [head, field] = op.path
        assert.equal(head, 'execution', 'android ops only touch the execution object')
        const target = { ...(user.execution ?? {}) }
        if (op.op === 'unset') delete target[field]
        else target[field] = op.value
        if (Object.keys(target).length === 0) delete user.execution
        else user.execution = target
      }
      this.publish({ user, value: { ...(this.snapshot.base ?? {}), ...user }, revision: this.snapshot.revision + 1 })
      return true
    }
  }
  const scope = new Controller()
  const androidScope = android === undefined ? undefined : new AndroidController(android)
  const calls = []
  const syncs = []
  const configForms = {
    calls,
    describe() {
      const view = { namespaces: [{ ns: 'satellite-node', revision: scope.snapshot.revision, schema: scope.schema }] }
      if (androidScope !== undefined) {
        view.namespaces.push({ ns: 'satellite-android', revision: androidScope.snapshot.revision, schema: androidScope.schema })
      }
      return {
        getSnapshot: () => ({ status: 'ready', error: null, view }),
        subscribe(listener) { mirrorListeners.add(listener); return () => mirrorListeners.delete(listener) },
      }
    },
    get: (namespace) => {
      if (namespace === 'satellite-node') return scope
      if (namespace === 'satellite-android') return androidScope
      return undefined
    },
    whileServed: (watched, register) => {
      calls.push([...watched])
      let off
      let done = false
      const start = () => {
        if (done || off !== undefined) return
        // 与官方实现一致：只有本镜像确实服务了被 watch 的命名空间才会注册。
        if (![...watched].some((namespace) => namespaces.includes(namespace))) return
        off = register(new Set(namespaces))
      }
      syncs.push(start)
      return () => {
        done = true
        off?.()
        off = undefined
      }
    },
    /** 模拟宿主开始服务被 watch 的命名空间（官方是共享镜像的订阅回调）。 */
    trigger: () => { for (const start of syncs) start() },
  }
  return {
    configForms, writes, calls, scope, androidScope,
    trigger: () => { for (const start of syncs) start() },
    publishSchema(schema) { scope.schema = schema; for (const listener of mirrorListeners) listener() },
  }
}

/** 上面那套设置服务的简写。 */
function settingsHost(value, options) {
  return configFormsHost(value, options)
}

/**
 * 跑 apply 并模拟宿主开始服务 `satellite-node`：取注入面、渲染元素树，并等目录结算。
 * 传 `{ trigger: false }` 可停在"门控没开"的状态，用来断言此时一个注册都没有。
 */
async function mount({ configForms, remote } = {}, { trigger = true, readRoles = async () => ROLE_CATALOG } = {}) {
  const harness = createHarness()
  const { exports } = loadFactory(harness)
  const { ctx, registrations } = host({ configForms, remote })
  exports.apply(ctx)
  if (trigger === true) configForms?.trigger?.()
  assert.equal(registrations.length, trigger === true ? 1 : 0, trigger === true ? '门控开启后已注册设置页一节' : '门控未开启时不应有注册')
  const face = registrations[0].options.inject()
  // Exercise the component seam independently of the parent-owned native transport.
  if (readRoles !== null) face.surface.readRoles = readRoles
  harness.render(registrations[0].component, face)
  await tick()
  return { harness, face, registrations, tree: () => harness.tree }
}

/** 角色卡片：角色列表是 `<ul>`，每行一张带 `data-role` 的 `<li>`（取代原来的表格行）。 */
const roleCards = (tree) => findAll(tree, 'li').filter((node) => node.props?.['data-role'] !== undefined)
const removeButtons = (tree) => findAll(tree, 'button').filter((node) => text(node) === 'satellite-ui:cleanup')
const buttons = (tree) => findAll(tree, 'button')
const buttonByText = (tree, value) => buttons(tree).find((node) => text(node) === value)
// 展开成测试域自己的数组：产物里的 children 数组来自另一个 vm 上下文，原型不同。
const optionValues = (select) => [...(select.props.children ?? [])].map((option) => option.props.value)
const optionLabels = (select) => [...(select.props.children ?? [])].map((option) => text(option))
const inputValues = (row) => findAll(row, 'input').map((input) => input.props.value)

test('native role reader mounts its own contribution once and reloads the live namespace', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  const mounts = []
  let reads = 0
  const remote = {
    session: { modelCatalog: async () => CATALOG },
    async $mount(contribution) { mounts.push(JSON.parse(JSON.stringify(contribution))); return async () => {} },
    satelliteRoles: { async describe() { reads += 1; return { ok: true, value: ROLE_CATALOG } } },
  }
  const app = await mount({ configForms: state.configForms, remote }, { readRoles: null })
  assert.deepEqual(mounts, [{ package: 'satellite', descriptors: [{
    id: 'satellite#satelliteRoles/describe', service: 'satelliteRoles', namespace: 'satelliteRoles',
    method: 'describe', invocation: { kind: 'direct' }, parameters: [], result: { mode: 'src-json' },
  }] }])
  assert.ok(text(app.tree()).includes('Friendly validation'))
  assert.ok(text(app.tree()).includes('satellite-ui:roleScopeNotice'))
  assert.equal(reads, 1)
  remote.satelliteRoles = { async describe() { reads += 1; return { ok: true, value: { version: 1, roles: [pluginRole('validation', [])] } } } }
  buttonByText(app.tree(), 'satellite-ui:retryRoles').props.onClick()
  await tick()
  assert.equal(mounts.length, 1)
  assert.equal(reads, 2)
  assert.ok(text(app.tree()).includes('satellite-ui:noBindings'))
  assert.ok(text(app.tree()).includes('satellite-ui:orphan'))
  assert.equal(state.writes.length, 0)
})

test('native role reader retries a failed mount and fails closed on Remote errors or an old Host', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  let attempts = 0
  let ok = true
  const remote = {
    session: { modelCatalog: async () => CATALOG },
    async $mount() { if (++attempts === 1) throw new Error('mount failed'); return async () => {} },
    satelliteRoles: { async describe() { return { ok, value: ROLE_CATALOG } } },
  }
  const app = await mount({ configForms: state.configForms, remote }, { readRoles: null })
  assert.ok(text(app.tree()).includes('satellite-ui:rolesUnavailable'))
  assert.equal(buttonByText(app.tree(), 'satellite-ui:save').props.disabled, true)
  buttonByText(app.tree(), 'satellite-ui:retryRoles').props.onClick()
  await tick()
  assert.equal(attempts, 2)
  assert.ok(text(app.tree()).includes('Friendly validation'))
  ok = false
  buttonByText(app.tree(), 'satellite-ui:retryRoles').props.onClick()
  await tick()
  assert.ok(text(app.tree()).includes('satellite-ui:rolesUnavailable'))
  assert.equal(attempts, 2)
  assert.equal(state.writes.length, 0)
  const legacy = await mount({ configForms: settingsHost(DEFAULT_VALUE).configForms, remote: { session: remote.session } }, { readRoles: null })
  assert.ok(text(legacy.tree()).includes('satellite-ui:rolesUnavailable'))
  assert.equal(removeButtons(legacy.tree()).length, 0)
})

test('lib/client.js 开头就是宿主模块工厂包装，id 为 satellite-ui', () => {
  const head = bundle.split('\n').slice(0, 3).join('\n')
  assert.ok(bundle.startsWith('window.__ModuleLoader__.load({'), '第一行是工厂包装')
  assert.match(head, /id: "satellite-ui"/)
  assert.match(bundle, /factory: \(require\) => \{/)
  assert.match(bundle.trimEnd(), /return module\.exports;?\s*\}\s*\}\);$/, '结尾收回工厂返回值')
})

test('工厂导出 apply 与插槽声明，且只外置 react', () => {
  const { exports } = loadFactory()
  assert.equal(exports.name, 'satellite-ui/client')
  // `remote` 与 `remote.session` 都是硬依赖：模型目录挂在 session 命名空间上，
  // 只注入 `remote` 拿不到 `modelCatalog`（会一直降级为文本输入）；
  // 只有**调用级**失败（目录抛错/为空）才降级。
  assert.equal(
    JSON.stringify(exports.inject),
    JSON.stringify(['slots', 'locale', 'configForms', 'settingsSchema', 'remote', 'remote.session', 'remote.pluginManager']),
  )
  assert.equal(typeof exports.apply, 'function')
  assert.ok(!/require\(["']\.\/client-styles/.test(bundle), 'styles 应内联进产物')
  assert.ok(!/require\(["']@deepseek-ai\//.test(bundle), 'dsh 包只允许类型引用，不应留在产物里')
  assert.ok(bundle.includes('require("react")'), 'react 保持外置')
})

test('宿主不服务 satellite-node 时整节都不注册（功能插件未安装的形态）', () => {
  const { exports } = loadFactory()
  const { ctx, registrations, events } = host({ configForms: { get: () => undefined } })
  exports.apply(ctx)
  assert.equal(registrations.length, 0, '没有服务就不提供界面')
  assert.ok(!events.some((label) => label.includes('settings.section')), '连挂载门控都不进')
})

test('whileServed 未触发时 settings.section 一个注册都没有', async () => {
  const { exports } = loadFactory()
  const { configForms, calls } = settingsHost(DEFAULT_VALUE)
  const { ctx, events, registrations } = host({ configForms })
  exports.apply(ctx)
  // 整页只挂一个设置节，同时跟随两个命名空间：任一被服务就注册，页面内部再决定有哪几页。
  assert.deepEqual(calls, [['satellite-node', 'satellite-android']], 'apply 只跟随这两个命名空间')
  assert.equal(registrations.length, 0, '门控没开就没有任何 settings.section 注册')
  assert.ok(events.includes('satellite-ui: settings section'), '门控 effect 本身已经回来了')
  configForms.trigger()
  assert.equal(registrations.length, 1, '只服务 satellite-node 时也注册整页（只有角色模型页）')
  assert.deepEqual(registrations.map((entry) => entry.options.id), ['satellite'])
})

test('apply 在无 DOM、无插槽服务的最小宿主上不抛错，且注册设置页一节', () => {
  const { exports } = loadFactory()
  const { configForms } = settingsHost({})
  const { ctx, events, disposers, registrations } = host({ configForms })
  exports.apply(ctx)
  assert.ok(events.includes('satellite-ui: English'))
  assert.ok(events.includes('satellite-ui: Chinese'))
  assert.ok(events.includes('satellite-ui: stylesheet'))
  assert.ok(events.includes('satellite-ui: settings section'))
  assert.equal(registrations.length, 0, '触发前不注册')
  configForms.trigger()
  assert.equal(registrations.length, 1)
  const { options } = registrations[0]
  assert.equal(options.name, 'settings.section')
  assert.equal(options.id, 'satellite')
  assert.equal(options.order, 30)
  assert.equal(options.locale, 'satellite-ui')
  assert.equal(options.label(), 'satellite-ui:sectionLabel')
  assert.equal(typeof registrations[0].component, 'function')
  const face = options.inject()
  assert.equal(typeof face.surface.read, 'function')
  assert.equal(typeof face.surface.readRoles, 'function')
  assert.equal(typeof face.catalog.load, 'function', '目录读取面随注入面一起给出')
  // 无 DOM：样式 effect 是 no-op，清理函数仍可调用。
  for (const dispose of disposers) dispose()
})

test('configForms 缺失时只装字典与样式，不注册也不抛错', async () => {
  const { exports } = loadFactory()
  const { ctx, events, registrations } = host(undefined)
  exports.apply(ctx)
  assert.ok(events.includes('satellite-ui: English'))
  assert.ok(events.includes('satellite-ui: stylesheet'))
  assert.equal(registrations.length, 0, '没有设置服务就没有可挂载的一节')
  assert.ok(!events.some((label) => label.includes('settings.section')))
})

test('configForms 形状异常（get 抛错）时不抛错，写操作以失败结束', async () => {
  const { exports } = loadFactory()
  const { configForms, trigger } = settingsHost(DEFAULT_VALUE)
  configForms.get = () => { throw new Error('namespace is not served') }
  const { ctx, registrations } = host({ configForms })
  exports.apply(ctx)
  trigger()
  assert.equal(registrations.length, 1)
  const face = registrations[0].options.inject()
  assert.throws(() => face.surface.read(), /not served/)
  await assert.rejects(async () => face.surface.mutate([]))
})

test('固定命名空间通过真实schema封套核验默认值，并按revision写回', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  assert.ok(state.scope.schema.refs, '真实toJSON引用封套')
  assert.equal(app.face.surface.read().inheritance, 'supported')
  assert.equal(state.scope.listeners.size, 1)
  assert.equal(await app.face.surface.mutate([{ role: 'validation', provider: 'p', model: 'm' }], 7), true)
  assert.equal(state.writes[0].revision, 7)
  app.harness.unmount()
  assert.equal(state.scope.listeners.size, 0)
})

test('有效目录定义角色，旧 declaredRoles 不能阻止孤儿 routes 清理', async () => {
  const value = {
    declaredRoles: ['validation', 'extra'],
    routes: [DEFAULT_VALUE.routes[0], { role: 'extra', provider: 'anthropic', model: 'claude-sonnet' }],
  }
  const state = settingsHost(value)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote }, { readRoles: async () => rolesCatalog('validation') })
  const rows = roleCards(app.tree())
  assert.equal(rows.length, 2)
  assert.equal(removeButtons(rows[0]).length, 0)
  assert.equal(removeButtons(rows[1]).length, 1)
  assert.ok(text(rows[0]).includes('satellite-ui:originDeclared'))
  assert.ok(text(rows[1]).includes('satellite-ui:orphan'))
  assert.ok(!text(rows[1]).includes('satellite-ui:fixed'))
  removeButtons(rows[1])[0].props.onClick()
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes), { op: 'set', path: ['routes'], value: [DEFAULT_VALUE.routes[0]] })
  assert.deepEqual(state.scope.snapshot.user.declaredRoles, value.declaredRoles)
})

test('目录可用时 provider/model 用 select，且选项来自目录', async () => {
  const { configForms } = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms, remote: { session: { modelCatalog: async () => CATALOG } } })
  const selects = findAll(app.tree(), 'select')
  assert.equal(selects.length, 4, '两行各一个 provider 与 model 下拉')
  assert.equal(selects[0].props.value, 'deepseek-official')
  assert.deepEqual(optionValues(selects[0]), ['', 'deepseek-official', 'anthropic'])
  assert.deepEqual(optionLabels(selects[0]), ['satellite-ui:unset', 'DeepSeek', 'Anthropic'])
  assert.deepEqual(optionValues(selects[1]), ['', 'deepseek-flash', 'deepseek-v4-pro'])
  assert.deepEqual(optionValues(selects[3]), ['', 'deepseek-flash', 'deepseek-v4-pro'], '第二行按自己的 provider 取模型')
  assert.equal(findAll(app.tree(), 'input').length, 0, '目录可用时不再画文本输入')
})

test('目录里没有当前值时不再有保底选项，当前值显示为未配置', async () => {
  const value = {
    declaredRoles: ['validation'],
    routes: [{ role: 'validation', provider: 'retired-provider', model: 'retired-model' }],
  }
  const { configForms } = settingsHost(value)
  const app = await mount({ configForms, remote: { session: { modelCatalog: async () => CATALOG } } })
  const [provider, model] = findAll(app.tree(), 'select')
  assert.equal(provider.props.value, '', '目录外的 provider 按未配置显示')
  assert.deepEqual(optionValues(provider), ['', 'deepseek-official', 'anthropic'], '选项只来自目录')
  assert.equal(model.props.value, '', 'provider 未配置，model 也是未配置')
  assert.deepEqual(optionValues(model), [''], '没有 provider 就没有可选 model')
  const labels = [...optionLabels(provider), ...optionLabels(model)]
  assert.ok(!labels.some((label) => /keepCurrent/.test(label)), '不再有"当前值不在目录中"的保底标注')
  assert.equal(provider.props['data-state'], undefined, '不再有 stale 状态标注')
  assert.equal(model.props['data-state'], undefined)
})

test('provider 在目录内而 model 不在时，只把 model 显示为未配置', async () => {
  const value = {
    declaredRoles: ['validation'],
    routes: [{ role: 'validation', provider: 'deepseek-official', model: 'retired-model' }],
  }
  const { configForms } = settingsHost(value)
  const app = await mount({ configForms, remote: { session: { modelCatalog: async () => CATALOG } } })
  const [provider, model] = findAll(app.tree(), 'select')
  assert.equal(provider.props.value, 'deepseek-official')
  assert.equal(model.props.value, '', '目录外的 model 按未配置显示')
  assert.deepEqual(optionValues(model), ['', 'deepseek-flash', 'deepseek-v4-pro'])
})

test('切换 provider 时 model 清空，除非该 model 属于新 provider', async () => {
  const { configForms } = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms, remote: { session: { modelCatalog: async () => CATALOG } } })
  const before = findAll(app.tree(), 'select')
  assert.equal(before[1].props.value, 'deepseek-flash')
  before[0].props.onChange({ target: { value: 'anthropic' } })
  const after = findAll(app.tree(), 'select')
  assert.equal(after[0].props.value, 'anthropic')
  assert.equal(after[1].props.value, '', '旧 provider 的 model 被清空')
  assert.deepEqual(optionValues(after[1]), ['', 'claude-sonnet'], 'model 选项跟着新 provider')

  // model 恰好也在新 provider 目录里时保留。
  const shared = {
    ok: true,
    value: {
      groups: [
        { id: 'a', name: 'A', models: [{ id: 'm1', name: 'M1' }] },
        { id: 'b', name: 'B', models: [{ id: 'm1', name: 'M1' }, { id: 'm2', name: 'M2' }] },
      ],
      failures: [],
    },
  }
  const value = { declaredRoles: ['validation'], routes: [{ role: 'validation', provider: 'a', model: 'm1' }] }
  const kept = await mount({
    configForms: settingsHost(value).configForms,
    remote: { session: { modelCatalog: async () => shared } },
  })
  findAll(kept.tree(), 'select')[0].props.onChange({ target: { value: 'b' } })
  const keptAfter = findAll(kept.tree(), 'select')
  assert.equal(keptAfter[0].props.value, 'b')
  assert.equal(keptAfter[1].props.value, 'm1', '新 provider 目录里也有 m1，保留')
})

test('空选项按未配置保存：该行不写入 routes', async () => {
  const { configForms, writes } = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms, remote: { session: { modelCatalog: async () => CATALOG } } })
  // 第 0 行（validate）的 model 选回空选项，即未配置。
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: '' } })
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(writes.length, 1)
  assert.equal(JSON.stringify(writes[0].ops[0].path), JSON.stringify(['routes']))
  assert.equal(JSON.stringify(writes[0].ops[0].value), JSON.stringify([DEFAULT_VALUE.routes[1]]),
    '未配置的行不写出')

  // 完整目录外的覆盖按既定规则清除，且显示清除提示。
  const stale = {
    declaredRoles: ['validation', 'android-context'],
    routes: [
      { role: 'validation', provider: 'retired-provider', model: 'retired-model' },
      DEFAULT_VALUE.routes[1],
    ],
  }
  const other = settingsHost(stale)
  const second = await mount({ configForms: other.configForms, remote: { session: { modelCatalog: async () => CATALOG } } })
  assert.ok(text(second.tree()).includes('satellite-ui:catalogClears'))
  buttonByText(second.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(other.writes.length, 1)
  assert.equal(JSON.stringify(other.writes[0].ops[0].value), JSON.stringify([DEFAULT_VALUE.routes[1]]))
})

test('缺少 declaredRoles 仍由权威目录展示角色与只读名称', async () => {
  const value = { routes: [DEFAULT_VALUE.routes[0]], roles: { 'android-context': { agentOptions: { provider: 'anthropic', model: 'claude-sonnet' } } } }
  const app = await mount({ configForms: settingsHost(value).configForms, remote: catalogRemote })
  const rows = roleCards(app.tree())
  assert.equal(rows.length, 2)
  assert.ok(text(rows[0]).includes('Friendly validation'))
  assert.ok(text(rows[1]).includes('Responsibility for android-context'))
  assert.equal(findAll(app.tree(), 'input').length, 0)
  assert.equal(removeButtons(app.tree()).length, 0)
  assert.ok(!text(app.tree()).includes('satellite-ui:rolesUnavailable'))
})

test('目录调用抛错时降级为文本输入，页面仍完整渲染', async () => {
  const { configForms } = settingsHost(DEFAULT_VALUE)
  const remote = { session: { modelCatalog: () => { throw new Error('host refused') } } }
  const app = await mount({ configForms, remote })
  const tree = app.tree()
  assert.equal(findAll(tree, 'select').length, 0)
  const inputs = findAll(tree, 'input')
  assert.equal(inputs.length, 4, '两行仍是 provider + model 两个文本输入')
  assert.equal(inputs[0].props.value, 'deepseek-official')
  assert.ok(text(tree).includes('satellite-ui:catalogFailed'))
  assert.ok(roleCards(tree).length > 0, '角色卡片与其余内容都还在')
})

test('remote 服务缺失或没有 modelCatalog 时同样降级为文本输入', async () => {
  const { configForms } = settingsHost(DEFAULT_VALUE)
  for (const remote of [undefined, {}, { session: {} }]) {
    const app = await mount({ configForms, remote })
    assert.equal(findAll(app.tree(), 'select').length, 0, JSON.stringify(remote))
    assert.equal(findAll(app.tree(), 'input').length, 4, JSON.stringify(remote))
  }
})

test('目录为空（没有 provider）时降级为文本输入，避免无法录入', async () => {
  const { configForms } = settingsHost(DEFAULT_VALUE)
  const empty = { ok: true, value: { groups: [], failures: [] } }
  const app = await mount({ configForms, remote: { session: { modelCatalog: async () => empty } } })
  assert.equal(findAll(app.tree(), 'select').length, 0)
  assert.equal(findAll(app.tree(), 'input').length, 4)
})

test('目录只取到部分 provider 时给出提示，但仍是下拉', async () => {
  const { configForms } = settingsHost(DEFAULT_VALUE)
  const partial = {
    ok: true,
    value: { groups: CATALOG.value.groups, failures: [{ id: 'x', name: 'X', message: 'boom' }] },
  }
  const app = await mount({ configForms, remote: { session: { modelCatalog: async () => partial } } })
  assert.ok(text(app.tree()).includes('satellite-ui:catalogPartial'))
  assert.equal(findAll(app.tree(), 'select').length, 4)
})

test('目录加载失败后可以重新加载，成功后换成下拉', async () => {
  const { configForms } = settingsHost(DEFAULT_VALUE)
  let calls = 0
  const remote = {
    session: {
      modelCatalog: async () => {
        calls += 1
        if (calls === 1) throw new Error('flaky host')
        return CATALOG
      },
    },
  }
  const app = await mount({ configForms, remote })
  assert.equal(calls, 1)
  assert.equal(findAll(app.tree(), 'select').length, 0)
  buttonByText(app.tree(), 'satellite-ui:retryCatalog').props.onClick()
  await tick()
  assert.equal(calls, 2)
  assert.equal(findAll(app.tree(), 'select').length, 4)
})

test('插件角色没有新增入口，任何角色名都不可编辑', async () => {
  const value = { ...DEFAULT_VALUE, routes: [...DEFAULT_VALUE.routes, { role: 'legacy', provider: 'p', model: 'm' }] }
  const app = await mount({ configForms: settingsHost(value).configForms, remote: catalogRemote })
  assert.equal(buttonByText(app.tree(), 'satellite-ui:add'), undefined)
  assert.equal(findAll(app.tree(), 'input').length, 0)
  const rows = roleCards(app.tree())
  assert.equal(rows.length, 3)
  assert.equal(removeButtons(rows[0]).length, 0)
  assert.equal(removeButtons(rows[1]).length, 0)
  assert.equal(removeButtons(rows[2]).length, 1)
  assert.equal(findAll(rows[2], 'select').length, 0)
  assert.equal(removeButtons(rows[2])[0].props['aria-label'], 'satellite-ui:cleanup legacy')
})

test('固定行的 provider/model 初值取自 routes', async () => {
  const { configForms } = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms, remote: { session: { modelCatalog: async () => CATALOG } } })
  const rows = roleCards(app.tree())
  const [provider, model] = findAll(rows[1], 'select')
  assert.equal(provider.props.value, 'deepseek-official')
  assert.equal(model.props.value, 'deepseek-v4-pro')
  assert.ok(text(rows[1]).includes('android-context'))
})

test('角色列表是卡片：一个角色一张，名称/来源/说明在头部，字段区仍是带标签的 provider/model', async () => {
  const value = { ...DEFAULT_VALUE, routes: [...DEFAULT_VALUE.routes, { role: 'legacy', provider: 'p', model: 'm' }] }
  const app = await mount({ configForms: settingsHost(value).configForms, remote: catalogRemote })
  const tree = app.tree()
  assert.equal(findAll(tree, 'table').length, 0, '不再有表格布局')
  const cards = roleCards(tree)
  assert.deepEqual(cards.map((card) => card.props['data-role']), ['validation', 'android-context', 'legacy'], '每行一张卡片且不重不漏')
  const [validation] = cards
  // 第一块就是卡片头部：名称、来源徽标与说明都在这里，先于字段区。
  const [head] = validation.props.children
  assert.ok(text(head).includes('Friendly validation'))
  assert.ok(text(head).includes('satellite-ui:originDeclared'))
  assert.ok(text(head).includes('satellite-ui:originOverride'))
  assert.ok(text(validation).includes('Responsibility for validation'))
  assert.equal(findAll(validation, 'details').length, 1, '原生 details 仍保留')
  assert.deepEqual(findAll(validation, 'label').map((label) => text(label)), ['satellite-ui:provider', 'satellite-ui:model'])
  assert.deepEqual(findAll(validation, 'select').map((node) => node.props.value), ['deepseek-official', 'deepseek-flash'])
  // 字段区之后才是操作：覆盖时给"跟随默认"，已声明的角色不能清理。
  assert.ok(buttonByText(validation, 'satellite-ui:inherit') !== undefined, '覆盖的已声明角色可恢复继承')
  assert.ok(text(validation).includes('satellite-ui:fixed'))
})

test('保存只写 routes，并过滤普通角色未填完整的模型覆盖', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  findAll(roleCards(app.tree())[1], 'select')[1].props.onChange({ target: { value: '' } })
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes), { op: 'set', path: ['routes'], value: [DEFAULT_VALUE.routes[0]] })
  assert.equal(state.writes[0].revision, 7)
  assert.ok(text(app.tree()).includes('satellite-ui:saved'))
})

test('放弃模型修改丢弃草稿，回到当前已保存值', async () => {
  const app = await mount({ configForms: settingsHost(DEFAULT_VALUE).configForms, remote: catalogRemote })
  const discardButton = () => buttonByText(app.tree(), 'satellite-ui:discard')
  assert.equal(discardButton().props.disabled, true)
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  assert.equal(discardButton().props.disabled, false)
  discardButton().props.onClick()
  assert.equal(findAll(app.tree(), 'select')[1].props.value, 'deepseek-flash')
  assert.equal(discardButton().props.disabled, true)
})

test('普通 roles 不伪造模型默认值，降级输入仍不允许编辑角色名', async () => {
  const value = { routes: [DEFAULT_VALUE.routes[0]], roles: { 'android-context': { agentOptions: { provider: 'anthropic', model: 'claude-sonnet' } } } }
  const app = await mount({ configForms: settingsHost(value).configForms })
  const rows = roleCards(app.tree())
  assert.equal(rows.length, 2)
  assert.deepEqual(inputValues(rows[0]), ['deepseek-official', 'deepseek-flash'])
  assert.deepEqual(inputValues(rows[1]), ['', ''])
  assert.equal(removeButtons(rows[1]).length, 0)
})

test('只读快照不画表单', async () => {
  const { configForms } = settingsHost(DEFAULT_VALUE, { writable: false })
  const app = await mount({ configForms, remote: { session: { modelCatalog: async () => CATALOG } } })
  const tree = app.tree()
  assert.equal(roleCards(tree).length, 0)
  assert.equal(findAll(tree, 'select').length, 0)
  assert.ok(text(tree).includes('satellite-ui:readOnly'))
})

test('命名空间被服务但值里没有 routes/roles 时，只提示能力/版本不匹配', async () => {
  const { configForms } = settingsHost({ someOtherField: true })
  const app = await mount({ configForms, remote: { session: { modelCatalog: async () => CATALOG } } })
  const tree = app.tree()
  assert.equal(roleCards(tree).length, 0)
  assert.ok(text(tree).includes('satellite-ui:unsupported'))
  assert.ok(!text(tree).includes('satellite-ui:notServed'), '不再有"没找到设置项"')
  assert.equal(buttonByText(tree, 'satellite-ui:retry'), undefined, '没有"重新检查"按钮')
})

test('页面用到的文案键都在 en 与 zh 字典里，且两份键集合一致', async () => {
  const source = await readFile(join(root, 'src/client.tsx'), 'utf8')
  const locales = await readFile(join(root, 'src/client-locales.ts'), 'utf8')
  const used = [...new Set([...source.matchAll(/\bt\('([A-Za-z]+)'\)/g)].map((match) => match[1]))]
  const [enPart, zhPart] = locales.split('export const zh')
  const enKeys = new Set([...enPart.matchAll(/^ {2}([A-Za-z]+):/gm)].map((match) => match[1]))
  const zhKeys = new Set([...zhPart.matchAll(/^ {2}([A-Za-z]+):/gm)].map((match) => match[1]))
  assert.ok(used.length > 15, `至少要用到十几条文案，实际 ${used.length}`)
  for (const key of used) assert.ok(enKeys.has(key), `en 缺 ${key}`)
  assert.equal(JSON.stringify([...enKeys].sort()), JSON.stringify([...zhKeys].sort()))
})


const catalogRemote = { session: { modelCatalog: async () => CATALOG }, satelliteRoles: { describe: async () => ({ ok: true, value: ROLE_CATALOG }) }, $mount: async () => async () => {} }
const savedPayload = (writes) => JSON.parse(JSON.stringify(writes.at(-1).ops[0]))

test('native receiver, false refusal and subscription preserve draft', async () => {
  const state = settingsHost(DEFAULT_VALUE, { accepted: false })
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  assert.equal(state.scope.listeners.size, 1)
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(state.writes.length, 1)
  assert.ok(text(app.tree()).includes('satellite-ui:failed'))
  assert.ok(!text(app.tree()).includes('satellite-ui:saved'))
  assert.equal(findAll(app.tree(), 'select')[1].props.value, 'deepseek-v4-pro')
  assert.equal(buttonByText(app.tree(), 'satellite-ui:discard').props.disabled, false)
  app.harness.unmount()
  assert.equal(state.scope.listeners.size, 0)
})

test('draft uses original revision rather than blessing concurrent changes', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  state.scope.publish({ revision: 8 })
  await tick()
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(state.writes[0].revision, 7)
  assert.ok(text(app.tree()).includes('satellite-ui:failed'))
})

test('unmodified defaults are not frozen, and new code roles show inherited routes', async () => {
  const future = { role: 'future-role', provider: 'anthropic', model: 'claude-sonnet' }
  const base = { declaredRoles: [...DEFAULT_VALUE.declaredRoles, future.role], routes: [...DEFAULT_VALUE.routes, future] }
  const user = { routes: [{ ...DEFAULT_VALUE.routes[0], model: 'deepseek-v4-pro' }] }
  const state = settingsHost({ ...base, ...user }, { base, user })
  const app = await mount({ configForms: state.configForms, remote: catalogRemote }, { readRoles: async () => ({ version: 1, roles: [...ROLE_CATALOG.roles, pluginRole('future-role')] }) })
  assert.equal(roleCards(app.tree()).length, 3)
  assert.equal(findAll(roleCards(app.tree())[2], 'select')[1].props.value, 'claude-sonnet')
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes).value, user.routes)
  assert.ok(text(roleCards(app.tree())[2]).includes('satellite-ui:inherited'))
})

test('empty profile routes inherit defaults and no-op save unsets rather than snapshots them', async () => {
  const state = settingsHost({ ...DEFAULT_VALUE, routes: [] }, { base: DEFAULT_VALUE, user: { routes: [] } })
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  assert.equal(findAll(app.tree(), 'select')[1].props.value, 'deepseek-flash')
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes), { op: 'unset', path: ['routes'] })
})

test('clearing or resetting an override returns to inherited display and preserves other overrides', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: '' } })
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes).value, [DEFAULT_VALUE.routes[1]])
  assert.equal(findAll(app.tree(), 'select')[1].props.value, 'deepseek-flash')
  buttonByText(roleCards(app.tree())[1], 'satellite-ui:inherit').props.onClick()
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(savedPayload(state.writes).op, 'unset')
})

test('advanced fields round-trip while editing a different role and while changing a model', async () => {
  const advanced = { ...DEFAULT_VALUE.routes[0], reasoningEffort: 'high', maxTokens: 1024 }
  const value = { ...DEFAULT_VALUE, routes: [advanced, DEFAULT_VALUE.routes[1]] }
  const state = settingsHost(value)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  findAll(app.tree(), 'select')[3].props.onChange({ target: { value: 'deepseek-flash' } })
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes).value[0], advanced)
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes).value[0], { ...advanced, model: 'deepseek-v4-pro' })
})

test('partial catalogue never removes an unchanged unavailable provider override', async () => {
  const custom = { role: 'android-context', provider: 'unavailable', model: 'kept', maxTokens: 500 }
  const value = { ...DEFAULT_VALUE, routes: [DEFAULT_VALUE.routes[0], custom] }
  const state = settingsHost(value)
  const partial = { ok: true, value: { groups: CATALOG.value.groups, failures: [{ id: 'unavailable' }] } }
  const app = await mount({ configForms: state.configForms, remote: { session: { modelCatalog: async () => partial } } })
  assert.ok(buttonByText(app.tree(), 'satellite-ui:retryCatalog'))
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes).value[1], custom)
})

test('多绑定全部展示插件元数据，不在 UI 推断触发条件', async () => {
  const bindings = [
    { node: 'implement', phase: 'before', extension: 'mobile-check', skill: 'extension-skill', objective: 'Inspect mobile task', condition: 'When projectKind is android' },
    { node: 'review', phase: 'after', extension: 'mobile-review', condition: 'When review is requested' },
    { node: 'validate', phase: 'base', condition: 'Always' },
  ]
  const metadata = pluginRole('validation', bindings)
  const app = await mount({ configForms: settingsHost(DEFAULT_VALUE).configForms, remote: catalogRemote }, { readRoles: async () => ({ version: 1, roles: [metadata] }) })
  const row = roleCards(app.tree())[0]
  assert.equal(findAll(row, 'details').length, 1)
  const rendered = text(row)
  for (const value of ['Friendly validation', 'Responsibility for validation', 'skill-validation', 'read-only', 'implement', 'before', 'mobile-check', 'extension-skill', 'Inspect mobile task', 'When projectKind is android', 'review', 'after', 'mobile-review', 'When review is requested', 'validate', 'base', 'Always']) assert.ok(rendered.includes(value), value)
  const bindingList = findAll(row, 'ul').find((node) => String(node.props?.className ?? '').includes('satellite-ui__bindings'))
  assert.equal(findAll(bindingList, 'li').length, 3, '三个绑定各占一条')
})

test('loading and unavailable settings are not reported as version errors', async () => {
  for (const status of ['loading', 'unavailable']) {
    const state = settingsHost(DEFAULT_VALUE, { status })
    const app = await mount({ configForms: state.configForms, remote: catalogRemote })
    assert.equal(roleCards(app.tree()).length, 0)
    assert.ok(text(app.tree()).includes(status === 'loading' ? 'satellite-ui:settingsLoading' : 'satellite-ui:settingsUnavailable'))
  }
})

test('real installed bundle version gates the editor, with retry after lookup failure', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  let version = '0.2.0'
  const remote = { ...catalogRemote, pluginManager: { listBundles: async () => ({ ok: true, value: [{ name: 'satellite', installed: true, enabled: true, version }] }) } }
  const app = await mount({ configForms: state.configForms, remote })
  assert.equal(roleCards(app.tree()).length, 0)
  assert.ok(text(app.tree()).includes('satellite-ui:compatFailed'))
  version = '0.1.1'
  buttonByText(app.tree(), 'satellite-ui:retryCompatibility').props.onClick()
  await tick()
  assert.ok(roleCards(app.tree()).length > 0)
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  version = '0.1.1-beta.1'
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(state.writes.length, 0, 'save rechecks version')
  assert.ok(text(app.tree()).includes('satellite-ui:compatFailed'))
  assert.equal(roleCards(app.tree()).length, 0)
  version = '0.1.1'
  buttonByText(app.tree(), 'satellite-ui:retryCompatibility').props.onClick()
  await tick()
  assert.equal(findAll(app.tree(), 'select')[1].props.value, 'deepseek-v4-pro')
})


test('offline version lookup blocks editing and retries without any settings write', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  let offline = true
  const remote = { ...catalogRemote, pluginManager: { listBundles: async () => {
    if (offline) throw new Error('offline')
    return { ok: true, value: [{ name: 'satellite', version: '0.1.0', installed: true, enabled: true }] }
  } } }
  const app = await mount({ configForms: state.configForms, remote })
  assert.ok(text(app.tree()).includes('satellite-ui:compatFailed'))
  assert.equal(roleCards(app.tree()).length, 0)
  offline = false
  buttonByText(app.tree(), 'satellite-ui:retryCompatibility').props.onClick()
  await tick()
  assert.ok(roleCards(app.tree()).length > 0)
  assert.equal(state.writes.length, 0)
})

test('pending save locks editable fields until settlement', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  let finish
  const original = state.scope.mutate
  state.scope.mutate = function (ops, revision) {
    return new Promise((resolve) => { finish = () => resolve(original.call(this, ops, revision)) })
  }
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  for (const select of findAll(app.tree(), 'select')) assert.equal(select.props.disabled, true)
  assert.equal(buttonByText(app.tree(), 'satellite-ui:retryRoles').props.disabled, true)
  finish()
  await tick()
  assert.ok(text(app.tree()).includes('satellite-ui:saved'))
})


test('custom lower routes fail closed for every model parameter and route membership', async () => {
  const defaults = [{ ...DEFAULT_VALUE.routes[0], reasoningEffort: 'high', maxTokens: 1024 }]
  const differences = [
    [{ ...defaults[0], provider: 'different' }],
    [{ ...defaults[0], model: 'different' }],
    [{ ...defaults[0], reasoningEffort: 'low' }],
    [{ ...defaults[0], maxTokens: 2048 }],
    [{ ...DEFAULT_VALUE.routes[0], maxTokens: 1024 }],
    [],
    [...defaults, DEFAULT_VALUE.routes[1]],
  ]
  for (const routes of differences) {
    const base = { ...DEFAULT_VALUE, routes }
    const state = settingsHost(base, { base, user: {}, defaults })
    const app = await mount({ configForms: state.configForms, remote: catalogRemote })
    assert.equal(roleCards(app.tree()).length, 0)
    assert.ok(text(app.tree()).includes('satellite-ui:layeredRoutes'))
    assert.equal(await app.face.surface.mutate([], 7), false)
    assert.equal(state.writes.length, 0)
  }
})

test('route and object key reorder is equivalent without losing advanced fields', async () => {
  const defaults = [{ ...DEFAULT_VALUE.routes[0], reasoningEffort: 'high', maxTokens: 1024 }, DEFAULT_VALUE.routes[1]]
  const routes = [...defaults].reverse().map((route) => Object.fromEntries(Object.entries(route).reverse()))
  const base = { ...DEFAULT_VALUE, routes }
  const state = settingsHost(base, { base, user: {}, defaults })
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  assert.equal(app.face.surface.read().inheritance, 'supported')
  assert.ok(roleCards(app.tree()).length > 0)
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(savedPayload(state.writes).op, 'unset')
})

test('missing, malformed and ambiguous schema defaults fail closed', async () => {
  const noDefault = schemaEnvelope(DEFAULT_VALUE.routes)
  for (const node of Object.values(noDefault.refs)) if (node.type === 'array') delete node.meta.default
  const cases = [undefined, null, {}, { uid: 999, refs: {} }, noDefault, schemaEnvelope([DEFAULT_VALUE.routes[0], DEFAULT_VALUE.routes[0]])]
  for (const schema of cases) {
    const state = settingsHost(DEFAULT_VALUE)
    state.scope.schema = schema
    const app = await mount({ configForms: state.configForms, remote: catalogRemote })
    assert.ok(text(app.tree()).includes('satellite-ui:defaultsUnavailable'))
    assert.equal(roleCards(app.tree()).length, 0)
    assert.equal(await app.face.surface.mutate([], 7), false)
    assert.equal(state.writes.length, 0)
  }
})

test('old draft cannot write when inherited routes change before the click is observed', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  // No notification: exercise the saving boundary, not just the disabled UI.
  state.scope.snapshot = { ...state.scope.snapshot, base: { ...DEFAULT_VALUE, routes: [] } }
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(state.writes.length, 0)
  assert.ok(text(app.tree()).includes('satellite-ui:layeredRoutes'))
  state.scope.publish({ base: DEFAULT_VALUE })
  await tick()
  assert.equal(findAll(app.tree(), 'select')[1].props.value, 'deepseek-v4-pro', 'draft remains after deployment recovery')
})

test('schema-only invalidation blocks editing, and recovery preserves draft', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  const original = state.scope.schema
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  state.publishSchema(undefined)
  assert.equal(roleCards(app.tree()).length, 0)
  assert.ok(text(app.tree()).includes('satellite-ui:defaultsUnavailable'))
  state.publishSchema(original)
  assert.equal(findAll(app.tree(), 'select')[1].props.value, 'deepseek-v4-pro')
  assert.equal(state.writes.length, 0)
})

test('missing user override is legal; absent inherited routes are not guessed', async () => {
  const state = settingsHost(DEFAULT_VALUE)
  state.scope.publish({ user: undefined })
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  assert.equal(app.face.surface.read().inheritance, 'supported')
  assert.ok(roleCards(app.tree()).length > 0)
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(savedPayload(state.writes).op, 'unset')
  state.scope.publish({ base: { declaredRoles: DEFAULT_VALUE.declaredRoles } })
  assert.ok(text(app.tree()).includes('satellite-ui:defaultsUnavailable'))
  assert.equal(roleCards(app.tree()).length, 0)
})


test('undeclared custom defaults are explicitly unknown, not invented provider/model values', async () => {
  const value = { ...DEFAULT_VALUE, declaredRoles: [...DEFAULT_VALUE.declaredRoles, 'custom-role'] }
  const state = settingsHost(value, { user: {} })
  const app = await mount({ configForms: state.configForms, remote: catalogRemote }, { readRoles: async () => ({ version: 1, roles: [...ROLE_CATALOG.roles, pluginRole('custom-role')] }) })
  const row = roleCards(app.tree())[2]
  assert.ok(text(row).includes('satellite-ui:deploymentDefault'))
  assert.deepEqual(findAll(row, 'select').map((field) => field.props.value), ['', ''])
})

test('孤儿路由普通保存逐字保持未知模型和所有高级字段，只有清理删除 routes', async () => {
  const orphan = { role: 'legacy', provider: ' retired provider ', model: ' unknown model ', reasoningEffort: 'custom', maxTokens: 123, future: { keep: ['a', 2] } }
  const roles = { legacy: { agentOptions: { model: 'ordinary-model' }, untouched: true } }
  const value = { ...DEFAULT_VALUE, declaredRoles: [...DEFAULT_VALUE.declaredRoles, 'legacy'], routes: [orphan, ...DEFAULT_VALUE.routes], roles }
  const state = settingsHost(value)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote })
  const orphanRow = () => roleCards(app.tree()).find((row) => text(row).includes('legacy'))
  assert.ok(text(orphanRow()).includes(' unknown model '))
  assert.equal(findAll(orphanRow(), 'select').length, 0)
  assert.equal(findAll(orphanRow(), 'input').length, 0)
  assert.equal(buttonByText(orphanRow(), 'satellite-ui:inherit'), undefined)
  assert.ok(!text(app.tree()).includes('satellite-ui:catalogClears'))
  findAll(roleCards(app.tree())[0], 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes).value[0], orphan)
  removeButtons(orphanRow())[0].props.onClick()
  assert.equal(state.writes.length, 1, 'cleanup waits for Save')
  buttonByText(app.tree(), 'satellite-ui:discard').props.onClick()
  assert.ok(orphanRow(), 'discard restores legacy route')
  removeButtons(orphanRow())[0].props.onClick()
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(savedPayload(state.writes).value.some((route) => route.role === 'legacy'), false)
  assert.deepEqual(state.scope.snapshot.user.roles, roles)
  assert.deepEqual(state.writes.map((write) => [...write.ops[0].path]), [['routes'], ['routes']])
})

test('清理最后一条孤儿 routes 使用 unset，不删除普通 roles', async () => {
  const value = { declaredRoles: ['old'], routes: [{ role: 'old', provider: 'p', model: 'm', unknown: true }], roles: { old: { keep: true } } }
  const state = settingsHost(value)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote }, { readRoles: async () => ({ version: 1, roles: [] }) })
  removeButtons(app.tree())[0].props.onClick()
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes), { op: 'unset', path: ['routes'] })
  assert.deepEqual(state.scope.snapshot.user.roles, value.roles)
})

test('缺失或非法角色目录不把角色当孤儿，不规范模型也不写回', async () => {
  const invalid = [undefined, null, {}, { roles: [] }, { version: 2, roles: [] }, { version: 1, roles: null },
    { version: 1, roles: [pluginRole('validation'), pluginRole('validation')] },
    { version: 1, roles: [{ ...pluginRole('validation'), sandbox: 'invalid' }] },
    { version: 1, roles: [{ ...pluginRole('validation'), sandbox: ['read-only'] }] },
    { version: 1, roles: [{ ...pluginRole('validation'), bindings: [{ node: 'review', phase: 'base', condition: {} }] }] },
    { version: 1, roles: [{ ...pluginRole('validation'), bindings: [{ node: 'review', phase: 'bad', condition: 'Always' }] }] },
    { version: 1, roles: [{ ...pluginRole('validation'), bindings: [{ node: 'review', phase: 'base' }] }] }]
  for (const raw of invalid) {
    const value = { ...DEFAULT_VALUE, routes: [{ ...DEFAULT_VALUE.routes[0], provider: 'unknown', model: 'unknown-model', future: 42 }] }
    const state = settingsHost(value)
    const app = await mount({ configForms: state.configForms, remote: catalogRemote }, { readRoles: async () => raw })
    assert.ok(text(app.tree()).includes('satellite-ui:rolesUnavailable'))
    assert.ok(text(app.tree()).includes('satellite-ui:bindingsUnverified'))
    assert.ok(!text(app.tree()).includes('satellite-ui:orphan'))
    assert.ok(!text(app.tree()).includes('satellite-ui:catalogClears'))
    assert.ok(text(app.tree()).includes('unknown-model'))
    assert.equal(removeButtons(app.tree()).length, 0)
    assert.equal(findAll(app.tree(), 'select').length, 0)
    assert.equal(buttonByText(app.tree(), 'satellite-ui:save').props.disabled, true)
    buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
    await tick()
    assert.equal(state.writes.length, 0)
    assert.deepEqual(state.scope.snapshot.user.routes, value.routes)
  }
})

test('角色目录失败可重试；空 bindings 是已定义角色，不是孤儿', async () => {
  let calls = 0
  const state = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote }, { readRoles: async () => {
    if (++calls === 1) throw new Error('offline')
    return { version: 1, roles: [pluginRole('validation', [])] }
  } })
  assert.ok(text(app.tree()).includes('satellite-ui:rolesUnavailable'))
  buttonByText(app.tree(), 'satellite-ui:retryRoles').props.onClick()
  await tick()
  const row = roleCards(app.tree())[0]
  assert.equal(calls, 2)
  assert.ok(text(row).includes('satellite-ui:noBindings'))
  assert.ok(!text(row).includes('satellite-ui:orphan'))
  assert.equal(removeButtons(row).length, 0)
  assert.equal(findAll(row, 'select').length, 2)
  assert.equal(state.writes.length, 0)
})

test('目录加载中不分类孤儿，重新核验失败保留模型草稿直到恢复', async () => {
  let finish
  let response = new Promise((resolve) => { finish = resolve })
  const state = settingsHost(DEFAULT_VALUE)
  const app = await mount({ configForms: state.configForms, remote: catalogRemote }, { readRoles: () => response })
  assert.ok(text(app.tree()).includes('satellite-ui:rolesLoading'))
  assert.ok(!text(app.tree()).includes('satellite-ui:orphan'))
  assert.equal(removeButtons(app.tree()).length, 0)
  assert.equal(buttonByText(app.tree(), 'satellite-ui:save').props.disabled, true)
  finish(ROLE_CATALOG)
  await tick()
  findAll(app.tree(), 'select')[1].props.onChange({ target: { value: 'deepseek-v4-pro' } })
  response = Promise.resolve(undefined)
  buttonByText(app.tree(), 'satellite-ui:retryRoles').props.onClick()
  await tick()
  assert.ok(text(app.tree()).includes('satellite-ui:rolesUnavailable'))
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  assert.equal(state.writes.length, 0)
  response = Promise.resolve(ROLE_CATALOG)
  buttonByText(app.tree(), 'satellite-ui:retryRoles').props.onClick()
  await tick()
  assert.equal(findAll(app.tree(), 'select')[1].props.value, 'deepseek-v4-pro')
  assert.equal(buttonByText(app.tree(), 'satellite-ui:discard').props.disabled, false)
})

test('目录包含 declaredRoles 外的普通自定义角色，可配置模型且仅保存 routes', async () => {
  const metadata = pluginRole('ordinary-custom', [])
  const roles = { 'ordinary-custom': { agentOptions: { provider: 'private', model: 'not-a-schema-default' } } }
  const value = { ...DEFAULT_VALUE, roles }
  const state = settingsHost(value, { user: { roles } })
  const app = await mount({ configForms: state.configForms, remote: catalogRemote }, { readRoles: async () => ({ version: 1, roles: [...ROLE_CATALOG.roles, metadata] }) })
  const row = roleCards(app.tree()).find((row) => text(row).includes('Friendly ordinary-custom'))
  assert.ok(row)
  assert.ok(text(row).includes('satellite-ui:noBindings'))
  assert.ok(text(row).includes('satellite-ui:deploymentDefault'))
  assert.deepEqual(findAll(row, 'select').map((select) => select.props.value), ['', ''])
  findAll(row, 'select')[0].props.onChange({ target: { value: 'anthropic' } })
  const updated = roleCards(app.tree()).find((row) => text(row).includes('Friendly ordinary-custom'))
  findAll(updated, 'select')[1].props.onChange({ target: { value: 'claude-sonnet' } })
  buttonByText(app.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(savedPayload(state.writes), { op: 'set', path: ['routes'], value: [{ role: 'ordinary-custom', provider: 'anthropic', model: 'claude-sonnet' }] })
  assert.deepEqual(state.scope.snapshot.user.roles, roles)
})

/* ---------------------------------------------------------------------------------
 * Android 执行设置（第二页）
 * -------------------------------------------------------------------------------*/

/**
 * 挂载 Satellite 设置页并切到 Android 执行那一页。
 *
 * Android 执行不是独立一节：它作为分页出现在同一个 `satellite` 设置节里，
 * 所以这里先渲染容器，再点 `data-page="android"` 的页签。
 */
async function mountAndroidSection(android, { namespaces = ['satellite-node', 'satellite-android'], value = DEFAULT_VALUE, options = {} } = {}) {
  const settings = settingsHost(value, { ...options, namespaces, android })
  const harness = createHarness()
  const { exports } = loadFactory(harness)
  const { ctx, registrations } = host({ configForms: settings.configForms })
  exports.apply(ctx)
  settings.trigger()
  const registration = registrations.find((entry) => entry.options.id === 'satellite')
  assert.ok(registration, '服务任一命名空间后注册这一节')
  const face = registration.options.inject()
  harness.render(registration.component, face)
  await tick()
  const tree = () => harness.tree
  const tab = () => findAll(tree(), 'button').find((node) => node.props?.['data-page'] === 'android')
  const androidTab = tab()
  assert.ok(androidTab, '服务了 satellite-android 就应出现 Android 执行页签')
  androidTab.props.onClick()
  await tick()
  return { harness, face, registrations, settings, tree, writes: settings.writes }
}

// 产物跑在另一个 vm 上下文里，嵌套数组/对象的原型不同：比较前先落到本域。
const plain = (value) => JSON.parse(JSON.stringify(value))
const field = (tree, name) => findAll(tree, 'input').find((node) => node.props?.['data-field'] === name)
const selectField = (tree, name) => findAll(tree, 'select').find((node) => node.props?.['data-field'] === name)

test('Android 执行：只服务 satellite-node 时只有角色模型页，没有 Android 页签', async () => {
  const harness = createHarness()
  const { exports } = loadFactory(harness)
  const { configForms } = settingsHost(DEFAULT_VALUE)
  const { ctx, registrations } = host({ configForms })
  exports.apply(ctx)
  configForms.trigger()
  assert.deepEqual(registrations.map((entry) => entry.options.id), ['satellite'])
  harness.render(registrations[0].component, registrations[0].options.inject())
  const tabs = findAll(harness.tree, 'button')
    .filter((node) => node.props?.role === 'tab')
    .map((node) => node.props?.['data-page'])
  assert.deepEqual(tabs, ['roles'], 'Android 行未启用时不出现这一页')
})

test('Android 执行：服务后注册独立一节，并接受 volatile {get} 句柄', async () => {
  const { tree } = await mountAndroidSection({
    value: { execution: { get: () => ({ enabled: true, adbPath: '/opt/adb' }) } },
    base: { execution: { enabled: false } },
    user: {},
  })
  const enabled = field(tree(), 'enabled')
  assert.equal(enabled.props.type, 'checkbox')
  assert.equal(enabled.props.checked, true)
  assert.equal(field(tree(), 'adbPath').props.value, '/opt/adb')
})

test('Android 执行：未声明 execution 的旧插件不画表单', async () => {
  const { tree } = await mountAndroidSection({ declareExecution: false })
  assert.match(text(tree()), /satellite-ui:androidUnsupported/)
  assert.equal(field(tree(), 'adbPath'), undefined)
})

test('Android 执行：保存只写改过的字段（set 与 unset 各一条）', async () => {
  const { tree, writes } = await mountAndroidSection({
    user: { execution: { adbPath: '/old/adb', emulatorPath: '/old/emu' } },
    base: { execution: { enabled: false } },
    value: { execution: { adbPath: '/old/adb', emulatorPath: '/old/emu' } },
  })
  field(tree(), 'adbPath').props.onChange({ target: { value: '/new/adb' } })
  field(tree(), 'emulatorPath').props.onChange({ target: { value: '  ' } })
  await tick()
  buttonByText(tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(writes.length, 1)
  assert.deepEqual(plain(writes[0].ops), [
    { op: 'set', path: ['execution', 'adbPath'], value: '/new/adb' },
    { op: 'unset', path: ['execution', 'emulatorPath'] },
  ])
  assert.equal(writes[0].revision, 11, '草稿记住原始 revision')
})

test('Android 执行：草稿 revision 过期时拒绝写，草稿保留', async () => {
  const { tree, settings, writes } = await mountAndroidSection({
    user: { execution: { adbPath: '/old/adb' } },
    base: { execution: { enabled: false } },
    value: { execution: { adbPath: '/old/adb' } },
  })
  field(tree(), 'adbPath').props.onChange({ target: { value: '/draft/adb' } })
  await tick()
  // 另一处写入把 revision 推走了。
  settings.androidScope.publish({ revision: 42 })
  await tick()
  buttonByText(tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.equal(writes.length, 1)
  assert.equal(writes[0].revision, 11, '仍然用草稿记下的旧 revision')
  assert.equal(field(tree(), 'adbPath').props.value, '/draft/adb', '草稿没有被丢弃')
  assert.match(text(tree()), /satellite-ui:failed/)
})

test('Android 执行：非法数字阻止保存且不发写请求', async () => {
  const { tree, writes } = await mountAndroidSection({ user: {}, base: { execution: { enabled: false } }, value: {} })
  field(tree(), 'operationTimeoutMs').props.onChange({ target: { value: '5' } })
  await tick()
  assert.match(text(tree()), /satellite-ui:androidInvalidTimeout/)
  assert.equal(buttonByText(tree(), 'satellite-ui:save').props.disabled, true)
  field(tree(), 'operationTimeoutMs').props.onChange({ target: { value: '600000' } })
  field(tree(), 'outputMaxBytes').props.onChange({ target: { value: '1024.5' } })
  await tick()
  assert.match(text(tree()), /satellite-ui:androidInvalidOutput/)
  assert.equal(buttonByText(tree(), 'satellite-ui:save').props.disabled, true)
  assert.equal(writes.length, 0)
})

test('Android 执行：非法 privacy 阻止保存', async () => {
  const { tree, writes } = await mountAndroidSection({ user: {}, base: { execution: { enabled: false } }, value: {} })
  selectField(tree(), 'privacy').props.onChange({ target: { value: 'bogus' } })
  await tick()
  assert.match(text(tree()), /satellite-ui:androidInvalidPrivacy/)
  assert.equal(buttonByText(tree(), 'satellite-ui:save').props.disabled, true)
  assert.equal(writes.length, 0)
})

test('Android 执行：enabled 开关往返（开启 set，关闭时 unset 回默认）', async () => {
  const on = await mountAndroidSection({ user: {}, base: { execution: { enabled: false } }, value: {} })
  field(on.tree(), 'enabled').props.onChange({ target: { checked: true } })
  await tick()
  buttonByText(on.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(plain(on.writes[0].ops), [{ op: 'set', path: ['execution', 'enabled'], value: true }])

  const off = await mountAndroidSection({
    user: { execution: { enabled: true } },
    base: { execution: { enabled: false } },
    value: { execution: { enabled: true } },
  })
  assert.equal(field(off.tree(), 'enabled').props.checked, true)
  field(off.tree(), 'enabled').props.onChange({ target: { checked: false } })
  await tick()
  buttonByText(off.tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(plain(off.writes[0].ops), [{ op: 'unset', path: ['execution', 'enabled'] }])
})

test('Android 执行：与默认相同的数字不会写进覆盖', async () => {
  const { tree, writes } = await mountAndroidSection({ user: {}, base: { execution: { enabled: false } }, value: {} })
  field(tree(), 'operationTimeoutMs').props.onChange({ target: { value: '600000' } })
  await tick()
  assert.equal(buttonByText(tree(), 'satellite-ui:save').props.disabled, true, '与默认一致就没有可写的改动')
  field(tree(), 'operationTimeoutMs').props.onChange({ target: { value: '120000' } })
  await tick()
  buttonByText(tree(), 'satellite-ui:save').props.onClick()
  await tick()
  assert.deepEqual(plain(writes[0].ops), [{ op: 'set', path: ['execution', 'operationTimeoutMs'], value: 120000 }])
})

test('Android 执行：非绝对路径给出警告但允许保存；只读部署不画表单', async () => {
  const { tree } = await mountAndroidSection({ user: {}, base: { execution: { enabled: false } }, value: {} })
  field(tree(), 'adbPath').props.onChange({ target: { value: 'tools/adb' } })
  await tick()
  assert.match(text(tree()), /satellite-ui:androidPathWarning/)
  assert.equal(buttonByText(tree(), 'satellite-ui:save').props.disabled, false)

  const readOnly = await mountAndroidSection({
    user: {}, base: { execution: { enabled: false } }, value: {}, writable: false,
  })
  assert.match(text(readOnly.tree()), /satellite-ui:readOnly/)
  assert.equal(field(readOnly.tree(), 'adbPath'), undefined)
})

test('Android 分组：启用与隐私、工具路径、连接与限制，字段不重不漏', async () => {
  const { tree } = await mountAndroidSection({ user: {}, base: { execution: { enabled: false } }, value: {} })
  const groups = findAll(tree(), 'fieldset')
  assert.deepEqual(groups.map((group) => text(findAll(group, 'legend')[0])), [
    'satellite-ui:androidGroupEnable', 'satellite-ui:androidGroupPaths', 'satellite-ui:androidGroupLimits',
  ])
  // 每个分组里的控件按渲染顺序列出（input 与 select 各取一次，不重复计数）。
  const names = (group) => findAll(group, 'input').concat(findAll(group, 'select')).map((node) => node.props['data-field'])
  assert.deepEqual(names(groups[0]), ['enabled', 'privacy'])
  assert.deepEqual(names(groups[1]), ['androidCli', 'adbPath', 'emulatorPath', 'avdmanagerPath', 'javaHome'])
  assert.deepEqual(names(groups[2]), ['serverEndpoint', 'operationTimeoutMs', 'outputMaxBytes'])
  const all = groups.flatMap(names)
  assert.equal(new Set(all).size, all.length, '同一个字段不会出现在两个分组')
  assert.equal(all.length, 10, '所有可编辑字段都被分进某个分组')
})

test('设置页分页：两页都在时用 tablist 切换，且页签带 aria 关联', async () => {
  const settings = settingsHost(DEFAULT_VALUE, { namespaces: ['satellite-node', 'satellite-android'], android: { execution: {} } })
  const harness = createHarness()
  const { exports } = loadFactory(harness)
  const { ctx, registrations } = host({ configForms: settings.configForms })
  exports.apply(ctx)
  settings.trigger()
  const registration = registrations[0]
  harness.render(registration.component, registration.options.inject())
  await tick()

  const tabs = () => findAll(harness.tree, 'button').filter((node) => node.props?.role === 'tab')
  assert.deepEqual(tabs().map((node) => node.props?.['data-page']), ['roles', 'android'])
  // 默认第一页：角色模型，且 tablist 有可读标签。
  const tablist = findAll(harness.tree, 'div').find((node) => node.props?.role === 'tablist')
  assert.equal(tablist.props['aria-label'], 'satellite-ui:tabsLabel')
  assert.equal(tabs()[0].props['aria-selected'], true)
  assert.equal(tabs()[1].props['aria-selected'], false)
  assert.equal(roleCards(harness.tree).length > 0, true, '默认渲染角色模型页')

  // 切到 Android 页：只渲染那一页的表单。
  tabs()[1].props.onClick()
  await tick()
  assert.equal(findAll(harness.tree, 'input').some((node) => node.props?.['data-field'] === 'adbPath'), true)
  const panel = findAll(harness.tree, 'div').find((node) => node.props?.role === 'tabpanel')
  assert.equal(panel.props['data-active-page'], 'android')
  assert.equal(panel.props['aria-labelledby'], tabs()[1].props.id)
})

test('设置页分页：只有 Android 行被服务时也能单独显示该页', async () => {
  const settings = settingsHost(DEFAULT_VALUE, { namespaces: ['satellite-android'], android: { execution: {} } })
  const harness = createHarness()
  const { exports } = loadFactory(harness)
  const { ctx, registrations } = host({ configForms: settings.configForms })
  exports.apply(ctx)
  settings.trigger()
  assert.equal(registrations.length, 1, '任一命名空间被服务就注册整页')
  harness.render(registrations[0].component, registrations[0].options.inject())
  await tick()
  const tabs = findAll(harness.tree, 'button').filter((node) => node.props?.role === 'tab')
  assert.deepEqual(tabs.map((node) => node.props?.['data-page']), ['android'])
  assert.equal(findAll(harness.tree, 'input').some((node) => node.props?.['data-field'] === 'adbPath'), true)
})
