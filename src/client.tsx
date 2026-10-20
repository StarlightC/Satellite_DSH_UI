/**
 * `satellite-ui` 的浏览器半边：在**设置页**新增一个 "Satellite 角色模型" 页面。
 *
 * 设置页插槽不提供表单，因此这里自己接设置服务：
 *   ctx.configForms.get(命名空间) → scope.getSnapshot() 读值 {status, writable, revision, value}
 *   scope.subscribe(listener) 跟随快照更新，保留原生方法 receiver
 *   scope.mutate([{ op: 'set', path: ['routes'], value }], revision) 是唯一写入口
 * （用法与官方 `ui-settings-subagent` 页面一致。）
 *
 * 角色说明与绑定来自功能插件的版本化 RoleCatalog，不在界面硬编码。
 * 角色名称只读，不提供新增角色；有效目录中未定义的旧路由仅允许显式清理 routes。
 * 缺失或非法目录不能证明角色是否绑定，保留所有配置并禁止写入。
 *
 * provider/model 的候选来自宿主的实时模型目录 `remote.session.modelCatalog()`：
 *   成功 → response.value.groups（分组） / response.value.failures（部分 provider 取不到）
 *   失败 → response.ok === false
 * 目录不可用（服务缺失、抛错、空目录）时降级为文本输入；下拉的选项**只来自目录**，外加一个
 * "未配置"空选项：目录里查不到的当前值一律按未配置显示，不再塞回选项里做保底。
 *
 * 命名空间为 Loader entry id；base/user 区分继承默认与显式覆盖。
 * 保存只写覆盖；空行恢复继承，且保留未编辑路由的高级字段。
 *
 * **挂载门控**：整节只在宿主确实服务 `satellite-node` 这个设置命名空间时注册
 * （`configForms.whileServed`，官方设置页同款用法）。功能插件 `satellite` 未安装、未激活或
 * 已停用 `satellite-node` 行时，宿主不服务该命名空间，设置页里就不会有 Satellite 这一节
 * ——没有服务就不提供界面，而不是挂上去显示"没找到设置项"。
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { satisfiesRange } from './compat.js'
import { css } from './client-styles.js'
import { createRoleReader } from './role-remote.js'
import { en, zh, type Translate } from './client-locales.js'

export const name = 'satellite-ui/client'
/**
 * 硬依赖。`remote` 是目录提供方：本页的 provider/model 下拉要用它，因此**进 inject**，
 * 与官方设置页（`ui-settings-subagent` 的 `['slots','locale','remote','remote.session','configForms']`）
 * 同一原则——目录只有调用级失败时才降级为文本输入，服务本身缺失时不该退化成文本输入。
 */
// `remote.session` 是官方设置页同款的依赖：模型目录挂在 session 命名空间上，
// 只注入 `remote` 拿不到它（会一直降级为文本输入）。
export const inject = ['slots', 'locale', 'configForms', 'settingsSchema', 'remote', 'remote.session', 'remote.pluginManager']

/** 本页面的字典命名空间，也是设置页条目的 locale。 */
const NS = 'satellite-ui'
/** 设置页里这一节的 id 与位置。 */
const SECTION_ID = 'satellite'
const SECTION_ORDER = 30
/** 本页依赖的设置命名空间：主插件 `satellite-node` 行的 Loader 条目 id。 */
const SETTINGS_NS = 'satellite-node'
/** Android 执行配置所在的设置命名空间：`satellite/android` 行的 Loader 条目 id。 */
const ANDROID_NS = 'satellite-android'
/** Android 执行设置的设置页条目 id 与位置（排在角色模型之后）。 */
// Settings namespaces are Loader entry ids. ConfigForms owns the subscribed controller.

/** 本页依赖的设置命名空间值（由主插件 `satellite/node` 声明）。 */
interface SatelliteSettings {
  routes?: unknown
  declaredRoles?: unknown
  roles?: Record<string, { agentOptions?: { provider?: unknown; model?: unknown } } | undefined>
}

/** 一格设置表单快照的最小面。 */
interface ScopeSnapshot {
  status?: 'loading' | 'ready' | 'unavailable'
  writable?: boolean
  revision?: number | undefined
  value?: SatelliteSettings | undefined
  base?: SatelliteSettings | undefined
  user?: SatelliteSettings | undefined
}

/** 一格设置表单的最小面（只用到读快照、订阅、原子写）。 */
interface Scope {
  getSnapshot(): ScopeSnapshot
  subscribe(listener: () => void): () => void
  mutate(
    ops: ReadonlyArray<{ op: 'set'; path: readonly string[]; value: unknown } | { op: 'unset'; path: readonly string[] }>,
    revision?: number,
  ): Promise<boolean> | boolean
}

interface RouteEntry {
  role: string
  provider: string
  model: string
  reasoningEffort?: string
  maxTokens?: number
}

/** A route row; role identity is immutable and comes from plugin metadata/settings. */
interface RouteRow {
  role: string
  provider: string
  model: string
  explicit: boolean
  original?: RouteEntry | undefined
}

/** 模型目录里的一格 provider 分组。 */
interface CatalogModel {
  id: string
  name: string
}
interface CatalogGroup {
  id: string
  name: string
  models: CatalogModel[]
}

/** 目录加载结果：loading 时不填选项，error 时整页降级为文本输入。 */
type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; groups: CatalogGroup[]; partial: boolean }
  | { status: 'error' }

/**
 * 宿主模型目录的最小面。`undefined` 或抛错都当作目录不可用，
 * 由调用方降级为文本输入。
 */
interface Catalog {
  load(): Promise<CatalogState>
}

/**
 * 本页对设置服务的适配：固定命名空间、跟随快照、原子写。
 * 组件只拿它的方法，不直接接触 ctx。
 */
interface Surface {
  readRoles(): Promise<unknown>
  compatible(): Promise<boolean>
  read(): Reading | undefined
  mutate(value: RouteEntry[], revision: number | undefined): Promise<boolean>
  subscribe(listener: () => void): () => void
}

/** Plugin-owned metadata. sandbox/condition are displayed, never interpreted as authority. */
interface RoleBinding {
  node: string
  phase: 'base' | 'before' | 'after'
  extension?: string
  skill?: string
  objective?: string
  condition: string
}
interface PluginRole {
  role: string
  label: string
  description: string
  skill?: string
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  bindings: RoleBinding[]
}
interface RoleCatalog { version: 1; roles: PluginRole[] }
type RolesState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; catalog: RoleCatalog }

/** Reject an incomplete catalogue as a whole: partial evidence cannot classify orphan routes. */
function parseRoleCatalog(raw: unknown): RoleCatalog | undefined {
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
  const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''
  const optionalText = (value: unknown) => value === undefined || typeof value === 'string'
  if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.roles)) return undefined
  const seen = new Set<string>()
  for (const role of raw.roles) {
    if (!record(role) || !nonempty(role.role) || seen.has(role.role)
      || !nonempty(role.label) || typeof role.description !== 'string' || !optionalText(role.skill)
      || typeof role.sandbox !== 'string' || !['read-only', 'workspace-write', 'danger-full-access'].includes(role.sandbox)
      || !Array.isArray(role.bindings)) return undefined
    seen.add(role.role)
    for (const binding of role.bindings) {
      if (!record(binding) || !nonempty(binding.node)
        || typeof binding.phase !== 'string' || !['base', 'before', 'after'].includes(binding.phase)
        || !optionalText(binding.extension) || !optionalText(binding.skill)
        || !optionalText(binding.objective) || typeof binding.condition !== 'string') return undefined
    }
  }
  return raw as unknown as RoleCatalog
}

/** 一次探测结果：设置服务里那一格表单 + 它所在的命名空间。 */
interface Reading {
  namespace: string
  snapshot: ScopeSnapshot
  inheritance: 'supported' | 'different' | 'unavailable'
}

/**
 * 设置服务里本页用到的那一小面：只用到挂载门控 `whileServed`
 * （读/写经由 {@link createSurface}）。
 */
interface ConfigFormsService {
  whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => (() => void) | void): () => void
}

/** 该行的配置里是否存在本页依赖的字段面。 */
function hasRouteSurface(values: unknown): boolean {
  if (values === null || typeof values !== 'object') return false
  return 'routes' in values || 'roles' in values || 'declaredRoles' in values
}

function routeEntries(values: SatelliteSettings): RouteEntry[] {
  return (Array.isArray(values.routes) ? values.routes : [])
    .filter((entry): entry is RouteEntry => entry !== null && typeof entry === 'object'
      && typeof entry.role === 'string' && typeof entry.provider === 'string' && typeof entry.model === 'string')
    .map((entry) => ({ ...entry }))
}

function declaredRoleNames(values: SatelliteSettings): string[] {
  const raw: unknown = values.declaredRoles
  const names = (Array.isArray(raw) ? raw : [])
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
  return [...new Set(names)]
}

/** 行顺序：插件声明的角色在前，其余（routes / 行配置里出现的）按出现次序追加。 */
function roleNames(values: SatelliteSettings): string[] {
  const declared = declaredRoleNames(values)
  const seen = new Set(declared)
  const rest: string[] = []
  for (const role of [...routeEntries(values).map((entry) => entry.role), ...Object.keys(values.roles ?? {})]) {
    if (seen.has(role)) continue
    seen.add(role)
    rest.push(role)
  }
  return [...declared, ...rest]
}

/**
 * Profile overrides are sparse. Missing roles display the inherited schema defaults.
 * Ordinary role configuration is not exposed as editable settings.
 */
function initialRows(snapshot: ScopeSnapshot, catalog?: RoleCatalog): RouteRow[] {
  const values = snapshot.value ?? {}
  const base = snapshot.base ?? {}
  const overrides = routeEntries(snapshot.user ?? {})
  const inherited = routeEntries(base)
  const names = [...new Set([...(catalog?.roles.map((role) => role.role) ?? []), ...roleNames(base), ...roleNames(values), ...overrides.map((route) => route.role)])]
  return names.map((role) => {
    const original = overrides.find((entry) => entry.role === role)
    const route = original ?? inherited.find((entry) => entry.role === role)
    return {
      role,
      provider: route?.provider ?? '',
      model: route?.model ?? '',
      explicit: original !== undefined,
      original,
    }
  })
}

/**
 * 把行规范到目录内：provider 不在目录里（或未选）时该行 provider/model 都算未配置；
 * provider 有效但 model 不在它名下时只清 model。值本来就在目录里时原样返回（保持引用，
 * 草稿不会因此被无谓地新建）。目录不可用（降级为文本输入）时调用方不调它——
 * 那时选项不是目录，没有"目录内"这回事。
 */
function normalizeRows(rows: RouteRow[], groups: CatalogGroup[], roles?: RoleCatalog): RouteRow[] {
  return rows.map((row) => {
    // Unknown role metadata is not permission to normalize or erase legacy routes.
    if (!roles?.roles.some((role) => role.role === row.role)) return row
    const group = groups.find((entry) => entry.id === row.provider)
    if (group === undefined) {
      return row.provider === '' && row.model === '' ? row : { ...row, provider: '', model: '' }
    }
    if (row.model !== '' && !group.models.some((model) => model.id === row.model)) {
      return { ...row, model: '' }
    }
    return row
  })
}

/** Compare complete JSON route records; object keys and role ordering are not semantic. */
function routeFingerprint(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const roles = new Set<string>()
  for (const route of value) {
    if (!route || typeof route !== 'object' || Array.isArray(route)
      || !['role', 'provider', 'model'].every((key) => typeof route[key] === 'string' && route[key].trim())) return undefined
    if (roles.has(route.role)) return undefined
    roles.add(route.role)
  }
  const canonical = (entry: unknown): unknown => {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return entry
    if (typeof entry === 'number' && Number.isFinite(entry)) return entry
    if (Array.isArray(entry)) return entry.map(canonical)
    if (typeof entry === 'object' && entry !== null) {
      return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, child]) => [key, canonical(child)]))
    }
    throw new Error('Expected JSON route metadata')
  }
  try {
    return JSON.stringify([...value].sort((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0).map(canonical))
  } catch {
    return undefined
  }
}

/** Native ConfigForms owns subscription and serialization. Preserve method receivers. */
function createSurface(ctx: Context): Surface {
  const scope = () => (ctx.configForms as unknown as { get(namespace: string): Scope }).get(SETTINGS_NS)
  const read = (): Reading => {
    const snapshot = scope().getSnapshot()
    let inheritance: Reading['inheritance'] = 'unavailable'
    try {
      const descriptor = ctx.configForms.describe().getSnapshot().view?.namespaces.find((entry) => entry.ns === SETTINGS_NS)
      const schema = ctx.get('settingsSchema')
      if (descriptor && schema && descriptor.revision === snapshot.revision) {
        // The wire is Schemastery's {uid, refs} envelope, not a JSON-schema dictionary.
        const node = schema.nodeAtPath(schema.rehydrate(descriptor.schema), ['routes'])
        const defaults = node?.type === 'array' ? routeFingerprint(node.meta.default) : undefined
        const inherited = routeFingerprint(snapshot.base?.routes)
        if (defaults !== undefined && inherited !== undefined) inheritance = defaults === inherited ? 'supported' : 'different'
      }
    } catch {
      // Missing/malformed schema metadata is not evidence of a supported deployment.
    }
    return { namespace: SETTINGS_NS, snapshot, inheritance }
  }
  return {
    readRoles: createRoleReader(ctx),
    async compatible() {
      const manager = ctx.get('remote.pluginManager') as { listBundles(): Promise<{ ok: boolean; value?: Array<{ name: string; version?: string; installed: boolean; enabled: boolean }> }> } | undefined
      if (!manager) return false
      const response = await manager.listBundles()
      const main = response.ok ? response.value?.find((entry) => entry.name === 'satellite') : undefined
      return main?.installed === true && main.enabled === true && satisfiesRange(main.version)
    },
    read,
    subscribe(listener) {
      const offForm = scope().subscribe(listener)
      const offSchema = ctx.configForms.describe().subscribe(listener)
      return () => { offForm(); offSchema() }
    },
    async mutate(value, revision) {
      // Recheck immediately before enqueueing; an old draft cannot authorize a new layer.
      if (read().inheritance !== 'supported') return false
      return scope().mutate(value.length
        ? [{ op: 'set', path: ['routes'], value }]
        : [{ op: 'unset', path: ['routes'] }], revision)
    },
  }
}

/** 目录响应里的一组 provider：形状不符的条目被丢弃，而不是让整页失败。 */
function normalizeGroups(raw: unknown): CatalogGroup[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((group): CatalogGroup[] => {
    if (group === null || typeof group !== 'object') return []
    const id = (group as { id?: unknown }).id
    if (typeof id !== 'string' || id === '') return []
    const groupName = (group as { name?: unknown }).name
    const rawModels: unknown = (group as { models?: unknown }).models
    const models = (Array.isArray(rawModels) ? rawModels : []).flatMap((model): CatalogModel[] => {
      if (model === null || typeof model !== 'object') return []
      const modelId = (model as { id?: unknown }).id
      if (typeof modelId !== 'string' || modelId === '') return []
      const modelName = (model as { name?: unknown }).name
      return [{ id: modelId, name: typeof modelName === 'string' && modelName !== '' ? modelName : modelId }]
    })
    return [{ id, name: typeof groupName === 'string' && groupName !== '' ? groupName : id, models }]
  })
}

/**
 * 用给定的 ctx 建一个目录读取面。
 *
 * `remote` 服务或 `remote.session.modelCatalog` 方法不存在、抛错、返回形状不符，
 * 以及目录里一个 provider 都没有时，都返回 `{status:'error'}`，调用方据此降级为
 * 文本输入——空目录的 `<select>` 会让人无法录入新值，所以也算不可用。
 */
function createCatalog(ctx: Context): Catalog {
  return {
    async load(): Promise<CatalogState> {
      try {
        const nested = (ctx.get('remote') as { session?: { modelCatalog?: unknown } } | undefined)?.session
        const direct = ctx.get('remote.session') as { modelCatalog?: unknown } | undefined
        const session = direct ?? nested
        const call = session?.modelCatalog
        if (typeof call !== 'function') return { status: 'error' }
        const response = (await (call as () => Promise<unknown>).call(session)) as
          | { ok?: unknown; value?: { groups?: unknown; failures?: unknown } }
          | undefined
        if (response === null || typeof response !== 'object' || response.ok !== true) return { status: 'error' }
        const groups = normalizeGroups(response.value?.groups)
        if (groups.length === 0) return { status: 'error' }
        const failures: unknown = response.value?.failures
        return { status: 'ready', groups, partial: Array.isArray(failures) && failures.length > 0 }
      } catch {
        return { status: 'error' }
      }
    },
  }
}

/** `<select>` 的一个候选：空值是"未配置"，其余一律来自目录。 */
interface Option {
  value: string
  label: string
}/**
 * 候选 = "未配置" + 目录里拿到的项（去重）。
 *
 * 目录里没有的当前值不再回填成选项：调用方先把手上的行规范到目录内
 * （{@link normalizeRows}），不在目录里就是未配置，因此 `<select>` 不会显示一个目录外的值。
 */
function selectOptions(
  known: ReadonlyArray<{ value: string; label: string }>,
  none: string,
): Option[] {
  const seen = new Set<string>([''])
  const options: Option[] = [{ value: '', label: none }]
  for (const entry of known) {
    if (seen.has(entry.value)) continue
    seen.add(entry.value)
    options.push({ value: entry.value, label: entry.label })
  }
  return options
}

function SatelliteRoutesSection(
  props: { t: Translate; surface: Surface; catalog: Catalog },
): React.ReactElement {
  const { t, surface, catalog } = props
  // 同步探一次：设置服务在挂载时通常已经就绪，首帧就能画对（SSR 也不会画成"未提供"）。
  const [reading, setReading] = useState<Reading | undefined>(() => {
    try {
      return surface.read()
    } catch {
      return undefined
    }
  })
  const [draft, setDraft] = useState<RouteRow[]>()
  const draftRevision = useRef<number | undefined>(undefined)
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle')
  const [models, setModels] = useState<CatalogState>({ status: 'loading' })
  const [catalogAgain, setCatalogAgain] = useState(0)
  const [roles, setRoles] = useState<RolesState>({ status: 'loading' })
  const [rolesAgain, setRolesAgain] = useState(0)
  const [compatible, setCompatible] = useState<boolean | undefined>()
  const [compatAgain, setCompatAgain] = useState(0)
  const mounted = useRef(false)
  const acting = useRef(false)
  const fresh = useId()

  const served = reading !== undefined

  useEffect(() => {
    mounted.current = true
    const sync = () => {
      if (!mounted.current) return
      try {
        setReading(surface.read())
      } catch {
        setReading(undefined)
      }
    }
    sync()
    const unsubscribe = surface.subscribe(sync)
    return () => {
      mounted.current = false
      unsubscribe()
    }
  }, [surface])

  // 目录只在页面真的被服务时拉取；宿主那边没有这个方法就当不可用。
  useEffect(() => {
    if (!served) return undefined
    let live = true
    void catalog.load().then(
      (next) => {
        if (live) setModels(next)
      },
      () => {
        if (live) setModels({ status: 'error' })
      },
    )
    return () => {
      live = false
    }
  }, [catalog, served, catalogAgain])

  useEffect(() => {
    if (!served) return undefined
    let live = true
    setRoles({ status: 'loading' })
    void surface.readRoles().then((raw) => {
      if (!live) return
      const catalog = parseRoleCatalog(raw)
      setRoles(catalog ? { status: 'ready', catalog } : { status: 'error' })
    }, () => { if (live) setRoles({ status: 'error' }) })
    return () => { live = false }
  }, [surface, served, rolesAgain])

  useEffect(() => {
    let live = true
    setCompatible(undefined)
    void surface.compatible().then((ok) => { if (live) setCompatible(ok) }, () => { if (live) setCompatible(false) })
    return () => { live = false }
  }, [surface, reading?.snapshot.revision, compatAgain])

  const write = useCallback(async (value: RouteEntry[], revision: number | undefined) => {
    if (acting.current) return
    acting.current = true
    setState('busy')
    try {
      if (!await surface.compatible().catch(() => false)) {
        if (mounted.current) setCompatible(false)
        throw new Error('Unsupported Satellite version')
      }
      if (!await surface.mutate(value, revision)) throw new Error('Settings write refused')
      if (mounted.current) {
        setDraft(undefined)
        draftRevision.current = undefined
        setState('saved')
      }
    } catch {
      if (mounted.current) setState('failed')
    } finally {
      acting.current = false
      if (mounted.current) setReading(surface.read())
    }
  }, [surface])

  const snapshot = reading?.snapshot
  const values: SatelliteSettings = snapshot?.value ?? {}
  const busy = state === 'busy'
  const groups = models.status === 'ready' ? models.groups : []
  const selectable = models.status !== 'error'
  // 目录就绪时把手上的行规范到目录内：目录外的当前值按未配置显示，也按未配置保存。
  const roleCatalog = roles.status === 'ready' ? roles.catalog : undefined
  const baseRows = draft ?? initialRows(snapshot ?? {}, roleCatalog)
  const rows = models.status === 'ready' ? normalizeRows(baseRows, groups, roleCatalog) : baseRows
  const roleDefinition = (role: string) => roleCatalog?.roles.find((entry) => entry.role === role)
  const metadataReady = roleCatalog !== undefined
  const modelIds = (provider: string) =>
    (groups.find((group) => group.id === provider)?.models ?? []).map((model) => model.id)

  const edit = (next: RouteRow[]) => {
    if (draft === undefined) draftRevision.current = snapshot?.revision
    setDraft(next)
    if (state !== 'idle') setState('idle')
  }
  const update = (index: number, field: 'provider' | 'model', value: string) =>
    edit(baseRows.map((row, i) => {
      if (i !== index) return row
      if (field !== 'provider') return { ...row, [field]: value, explicit: true }
      // 换 provider 后 model 默认未配置；只有新 provider 目录里确有同名 model 时才保留。
      const kept = row.model !== '' && modelIds(value).includes(row.model)
      return { ...row, provider: value, model: kept ? row.model : '', explicit: true }
    }))
  const remove = (index: number) => {
    const row = baseRows[index]
    if (!metadataReady || busy || !row?.explicit || roleDefinition(row.role)) return
    // Staged cleanup only touches routes on Save; ordinary role configuration is never mutated.
    edit(baseRows.filter((_, i) => i !== index))
  }
  const discard = () => {
    setDraft(undefined)
    draftRevision.current = undefined
    setState('idle')
  }

  const roleKeys = baseRows.map((row) => row.role.trim()).filter(Boolean)
  const duplicate = new Set(roleKeys).size !== roleKeys.length
  const payloadRows = models.status === 'ready' && !models.partial ? normalizeRows(baseRows, groups, roleCatalog) : baseRows
  const clearedRoles = baseRows.filter((row, index) => row.explicit && row.provider && row.model
    && (!payloadRows[index]?.provider || !payloadRows[index]?.model)).map((row) => row.role)
  const payload = (): RouteEntry[] => {
    const changed = payloadRows
      .filter((row) => roleDefinition(row.role) && row.explicit && row.provider.trim() && row.model.trim())
      .map(({ original, role, provider, model }) => ({ ...original, role, provider: provider.trim(), model: model.trim() }))
    const pending = new Map(changed.map((route) => [route.role, route]))
    // Retain untouched orphan records verbatim, including whitespace and unknown advanced fields.
    // Iterate original records to keep their order (and any legacy duplicate records) intact.
    const result = routeEntries(snapshot?.user ?? {}).flatMap((original) => {
      if (!roleDefinition(original.role)) return baseRows.some((row) => row.role === original.role) ? [original] : []
      const route = pending.get(original.role)
      pending.delete(original.role)
      return route ? [route] : []
    })
    return [...result, ...pending.values()]
  }
  const reset = (index: number) => edit(baseRows.map((row, i) => {
    if (i !== index) return row
    const inherited = routeEntries(snapshot?.base ?? {}).find((entry) => entry.role === row.role)
    return { ...row, provider: inherited?.provider ?? '', model: inherited?.model ?? '', explicit: false, original: undefined }
  }))

  const none = t('unset')
  const providerOptions = () =>
    selectOptions(groups.map((group) => ({ value: group.id, label: group.name })), none)
  const modelOptions = (row: RouteRow) =>
    selectOptions(
      (groups.find((group) => group.id === row.provider)?.models ?? [])
        .map((model) => ({ value: model.id, label: model.name })),
      none,
    )

  const header = [
    <h2 className="satellite-ui__title" key="title">{t('title')}</h2>,
    <p className="satellite-ui__intro" key="intro">{t('intro')}</p>,
  ]
  const panel = (state: string, message: string, variant: string) => <div className="satellite-ui">
    {header}
    <div className="satellite-ui__panel" data-state={state}>
      <p className={variant}>{message}</p>
    </div>
  </div>

  // Loading/availability and schema compatibility are distinct failure states.
  if (snapshot?.status === 'loading') return panel('loading', t('settingsLoading'), 'satellite-ui__notice')
  if (reading === undefined || snapshot?.status !== 'ready') return panel('unavailable', t('settingsUnavailable'), 'satellite-ui__notice')
  if (!hasRouteSurface(values) || snapshot.base === undefined) return panel('unavailable', t('unsupported'), 'satellite-ui__notice')
  if (reading.inheritance !== 'supported') return panel('unsupported-inheritance', t(reading.inheritance === 'different' ? 'layeredRoutes' : 'defaultsUnavailable'), 'satellite-ui__error')
  if (compatible === undefined) return panel('loading', t('compatLoading'), 'satellite-ui__notice')
  if (!compatible) return <div className="satellite-ui">{header}<p role="alert">{t('compatFailed')}</p><button type="button" onClick={() => setCompatAgain((value) => value + 1)}>{t('retryCompatibility')}</button></div>
  if (snapshot?.writable === false) return panel('read-only', t('readOnly'), 'satellite-ui__notice')

  const status = state === 'saved'
    ? <span className="satellite-ui__status" data-state="saved" role="status">{t('saved')}</span>
    : state === 'failed'
      ? <span className="satellite-ui__status" data-state="failed" role="alert">{t('failed')}</span>
      : state === 'busy'
        ? <span className="satellite-ui__status" data-state="busy" role="status">{t('saving')}</span>
        : null

  const catalogNotice = models.status === 'loading'
    ? <span className="satellite-ui__notice" role="status">{t('catalogLoading')}</span>
    : models.status === 'error'
      ? <span className="satellite-ui__notice satellite-ui__error" role="status">{t('catalogFailed')}</span>
      : models.partial
        ? <span className="satellite-ui__notice" role="status">{t('catalogPartial')}</span>
        : null

  return <div className="satellite-ui">
    {header}
    <div className="satellite-ui__catalog" data-state={roles.status}>
      {roles.status !== 'ready' ? <p className="satellite-ui__notice" data-state="missing" role="status">{t(roles.status === 'loading' ? 'rolesLoading' : 'rolesUnavailable')}</p> : null}
      <button className="satellite-ui__button" type="button" disabled={busy || roles.status === 'loading'}
        onClick={() => setRolesAgain((count) => count + 1)}>{t('retryRoles')}</button>
    </div>
    <div className="satellite-ui__catalog" data-state={models.status}>
      {catalogNotice}
      {clearedRoles.length ? <p role="status">{t('catalogClears')} {clearedRoles.join(', ')}</p> : null}
      {models.status === 'error' || (models.status === 'ready' && models.partial)
        ? <button className="satellite-ui__button" type="button" disabled={busy}
            onClick={() => { setModels({ status: 'loading' }); setCatalogAgain((count) => count + 1) }}>
            {t('retryCatalog')}
          </button>
        : null}
    </div>
    <ul className="satellite-ui__roles" aria-label={t('title')}>
      {rows.map((row, index) => {
        const field = (name: 'role' | 'provider' | 'model') => `${fresh}-${index}-${name}`
        const providers = providerOptions()
        const modelsForRow = modelOptions(row)
        const definition = roleDefinition(row.role)
        const orphan = metadataReady && definition === undefined
        const editable = definition !== undefined && !busy
        const origin = !metadataReady ? 'unverified' : orphan ? 'orphan' : 'declared'
        const originLabel = !metadataReady ? t('bindingsUnverified') : orphan ? t('orphan') : t('originDeclared')
        const originDetail = row.explicit
          ? t('originOverride')
          : routeEntries(snapshot.base ?? {}).some((entry) => entry.role === row.role) ? t('inherited') : t('deploymentDefault')
        return <li className="satellite-ui__role-card" data-state={origin} data-role={row.role} key={index}>
          <div className="satellite-ui__card-head">
            <div className="satellite-ui__card-identity">
              <h3 className="satellite-ui__role">{definition?.label ?? row.role}</h3>
              {definition ? <code className="satellite-ui__role-id">{row.role}</code> : null}
            </div>
            <span className="satellite-ui__badge" data-state={origin}>{originLabel} · {originDetail}</span>
          </div>
          {definition ? <>
            <p className="satellite-ui__description">{definition.description}</p>
            <details className="satellite-ui__details">
              <summary>{t('roleDetails')}</summary>
              <p className="satellite-ui__notice">{t('roleScopeNotice')}</p>
              <dl className="satellite-ui__metadata">
                <dt>{t('skill')}</dt><dd>{definition.skill ?? t('notProvided')}</dd>
                <dt>{t('sandbox')}</dt><dd><code>{definition.sandbox}</code></dd>
              </dl>
              {definition.bindings.length === 0 ? <p className="satellite-ui__notice">{t('noBindings')}</p> :
                <ul className="satellite-ui__bindings">{definition.bindings.map((binding, bindingIndex) => <li key={bindingIndex}>
                  <strong>{binding.node} · {binding.phase}</strong>
                  <dl className="satellite-ui__metadata">
                    {binding.extension !== undefined ? <><dt>{t('extension')}</dt><dd>{binding.extension}</dd></> : null}
                    {binding.skill !== undefined ? <><dt>{t('skill')}</dt><dd>{binding.skill}</dd></> : null}
                    {binding.objective !== undefined ? <><dt>{t('objective')}</dt><dd>{binding.objective}</dd></> : null}
                    <dt>{t('condition')}</dt><dd><code>{binding.condition}</code></dd>
                  </dl>
                </li>)}</ul>}
            </details>
          </> : <p className="satellite-ui__notice" data-state="missing">{originLabel}</p>}
          <div className="satellite-ui__fields">
            <div className="satellite-ui__field">
              <label className="satellite-ui__label" htmlFor={field('provider')}>{t('provider')}</label>
              {!definition ? <span className="satellite-ui__raw-model">{row.provider || t('unset')}</span> : selectable
                ? <select className="satellite-ui__input satellite-ui__select" id={field('provider')}
                    value={row.provider} disabled={!editable || models.status === 'loading'}
                    onChange={(event) => update(index, 'provider', event.target.value)}>
                    {providers.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                : <input className="satellite-ui__input" id={field('provider')} value={row.provider}
                    placeholder="deepseek-official" spellCheck={false} autoComplete="off" disabled={busy}
                    onChange={(event) => update(index, 'provider', event.target.value)} />}
            </div>
            <div className="satellite-ui__field">
              <label className="satellite-ui__label" htmlFor={field('model')}>{t('model')}</label>
              {!definition ? <span className="satellite-ui__raw-model">{row.model || t('unset')}</span> : selectable
                ? <select className="satellite-ui__input satellite-ui__select" id={field('model')}
                    value={row.model} disabled={!editable || models.status === 'loading'}
                    onChange={(event) => update(index, 'model', event.target.value)}>
                    {modelsForRow.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                : <input className="satellite-ui__input" id={field('model')} value={row.model}
                    placeholder="deepseek-flash" spellCheck={false} autoComplete="off" disabled={busy}
                    onChange={(event) => update(index, 'model', event.target.value)} />}
            </div>
          </div>
          <div className="satellite-ui__actions">
            {definition && row.explicit ? <button className="satellite-ui__button" type="button" disabled={busy} onClick={() => reset(index)}>{t('inherit')}</button> : null}
            {orphan && row.explicit
              ? <button className="satellite-ui__button satellite-ui__button--quiet" type="button" disabled={busy}
                  aria-label={`${t('cleanup')} ${row.role}`}
                  onClick={() => remove(index)}>{t('cleanup')}</button>
              : definition ? <span className="satellite-ui__badge" data-state="fixed">{t('fixed')}</span> : null}
          </div>
        </li>
      })}
    </ul>
    <div className="satellite-ui__actions satellite-ui__actions--footer">
      <button className="satellite-ui__button satellite-ui__button--primary" type="button" disabled={busy || !metadataReady || duplicate || snapshot?.writable !== true || models.status === 'loading'}
        onClick={() => { if (metadataReady && !busy && models.status !== 'loading' && !duplicate) void write(payload(), draft === undefined ? snapshot?.revision : draftRevision.current) }}>{busy ? t('saving') : t('save')}</button>
      <button className="satellite-ui__button" type="button" disabled={busy || draft === undefined}
        onClick={discard}>{t('discard')}</button>
      {duplicate ? <span role="alert">{t('duplicate')}</span> : null}
      {status}
    </div>
  </div>
}

/* --------------------------------------------------- Android 执行配置（第二页） */

/** 可编辑字段，与功能包 `execution` 的 schema 一一对应。 */
const EXECUTION_FIELDS = [
  'enabled', 'androidCli', 'privacy', 'adbPath', 'emulatorPath', 'avdmanagerPath',
  'javaHome', 'serverEndpoint', 'operationTimeoutMs', 'outputMaxBytes',
] as const
type ExecutionField = (typeof EXECUTION_FIELDS)[number]
/** 非空时必须写成绝对路径的字段；`serverEndpoint`/`privacy` 不是路径。 */
const PATH_FIELDS: readonly ExecutionField[] = ['androidCli', 'adbPath', 'emulatorPath', 'avdmanagerPath', 'javaHome']
/** 数字字段的允许区间，与功能包 `resolveExecutionConfig` 的收窄保持一致。 */
const NUMBER_FIELDS = {
  operationTimeoutMs: [1_000, 3_600_000],
  outputMaxBytes: [1_024, 4_194_304],
} as const
type NumberField = keyof typeof NUMBER_FIELDS
const PRIVACY_VALUES = ['verified-disabled', 'explicit-user-opt-in'] as const
/**
 * 功能包里的代码默认值。`schema` 元数据可用时优先用 schema 的默认值；
 * 这里只是兜底，保证"等于默认值就 unset"这条稀疏写规则仍然成立。
 */
const EXECUTION_DEFAULTS = { enabled: false, operationTimeoutMs: 600_000, outputMaxBytes: 262_144 } as const

/** 表单草稿：数字按字符串编辑，布尔保持布尔。 */
type ExecutionDraft = Record<ExecutionField, string | boolean>

type ScopeOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }

/** `execution` 在快照里可能是 volatile 句柄 `{get}`，也可能是普通对象。 */
function readExecution(container: unknown): Record<string, unknown> {
  if (container === null || typeof container !== 'object') return {}
  const raw = (container as { execution?: unknown }).execution
  const getter = raw !== null && typeof raw === 'object' ? (raw as { get?: unknown }).get : undefined
  const live = typeof getter === 'function' ? (getter as () => unknown).call(raw) : raw
  if (live === null || typeof live !== 'object' || Array.isArray(live)) return {}
  return { ...(live as Record<string, unknown>) }
}

function fieldText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function executionDraft(values: Record<string, unknown>): ExecutionDraft {
  const number = (field: NumberField) =>
    typeof values[field] === 'number' && Number.isFinite(values[field] as number) ? String(values[field]) : ''
  return {
    enabled: values.enabled === true,
    androidCli: fieldText(values.androidCli),
    privacy: fieldText(values.privacy),
    adbPath: fieldText(values.adbPath),
    emulatorPath: fieldText(values.emulatorPath),
    avdmanagerPath: fieldText(values.avdmanagerPath),
    javaHome: fieldText(values.javaHome),
    serverEndpoint: fieldText(values.serverEndpoint),
    operationTimeoutMs: number('operationTimeoutMs'),
    outputMaxBytes: number('outputMaxBytes'),
  }
}

interface AndroidReading {
  snapshot: ScopeSnapshot
  /** 继承层（部署默认）。 */
  inherited: Record<string, unknown>
  /** 用户显式覆盖层：只有这里的值会被本页改动。 */
  user: Record<string, unknown>
  /** 当前生效值。 */
  effective: Record<string, unknown>
  /** 功能包是否声明了 `execution`：旧版本没有这个字段时本页不画表单。 */
  declaresExecution: boolean
}

/** 一格的默认值：优先 schema 元数据，其次功能包的代码默认。 */
function fieldDefault(field: ExecutionField, defaults: Record<string, unknown>): unknown {
  if (Object.hasOwn(defaults, field)) return defaults[field]
  return (EXECUTION_DEFAULTS as Record<string, unknown>)[field]
}

interface ExecutionPlan {
  ops: ScopeOp[]
  error?: 'timeout' | 'output' | 'privacy'
}

/**
 * 把草稿折算成稀疏的 set/unset 操作。
 *
 * 只写**与默认不同**的值：等于默认就 unset（profile 保持稀疏，插件升级后的新默认值仍然生效）。
 * 字符串清空、数字清空都表示 unset。非法数字/非法 privacy 直接拒绝，不发写请求。
 */
function planExecution(
  draft: ExecutionDraft,
  user: Record<string, unknown>,
  defaults: Record<string, unknown>,
): ExecutionPlan {
  const ops: ScopeOp[] = []
  const path = (field: ExecutionField) => ['execution', field]
  const unsetIfPresent = (field: ExecutionField) => {
    if (Object.hasOwn(user, field)) ops.push({ op: 'unset', path: path(field) })
  }
  const same = (field: ExecutionField, desired: unknown) =>
    Object.hasOwn(user, field) && user[field] === desired

  // enabled：布尔，默认 false；与默认相同就 unset。
  const enabled = draft.enabled === true
  if (enabled === (fieldDefault('enabled', defaults) === true)) unsetIfPresent('enabled')
  else if (!same('enabled', enabled)) ops.push({ op: 'set', path: path('enabled'), value: enabled })

  // privacy：空 = 未声明（unset）；其余必须是两个取值之一。
  const privacy = String(draft.privacy).trim()
  if (privacy === '') unsetIfPresent('privacy')
  else if (!(PRIVACY_VALUES as readonly string[]).includes(privacy)) return { ops, error: 'privacy' }
  else if (!same('privacy', privacy)) ops.push({ op: 'set', path: path('privacy'), value: privacy })

  // 字符串字段：空 = unset。
  for (const field of ['androidCli', 'adbPath', 'emulatorPath', 'avdmanagerPath', 'javaHome', 'serverEndpoint'] as const) {
    const value = String(draft[field]).trim()
    if (value === '') unsetIfPresent(field)
    else if (!same(field, value)) ops.push({ op: 'set', path: path(field), value })
  }

  // 数字字段：空 = unset；必须是区间内的整数；等于默认就 unset。
  for (const field of ['operationTimeoutMs', 'outputMaxBytes'] as const) {
    const raw = String(draft[field]).trim()
    if (raw === '') { unsetIfPresent(field); continue }
    const [min, max] = NUMBER_FIELDS[field]
    if (!/^\d+$/u.test(raw)) return { ops, error: field === 'operationTimeoutMs' ? 'timeout' : 'output' }
    const value = Number(raw)
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      return { ops, error: field === 'operationTimeoutMs' ? 'timeout' : 'output' }
    }
    if (value === fieldDefault(field, defaults)) unsetIfPresent(field)
    else if (!same(field, value)) ops.push({ op: 'set', path: path(field), value })
  }

  return { ops }
}

/** 非空但不是绝对路径的字段（只提示，不阻止保存：后端会在调用时明确失败）。 */
function pathWarnings(draft: ExecutionDraft): ExecutionField[] {
  return PATH_FIELDS.filter((field) => {
    const value = String(draft[field]).trim()
    return value !== '' && !value.startsWith('/')
  })
}

interface AndroidSurface {
  compatible(): Promise<boolean>
  read(): AndroidReading | undefined
  mutate(ops: readonly ScopeOp[], revision: number | undefined): Promise<boolean>
  subscribe(listener: () => void): () => void
}

/** 已安装 bundle 的版本门，两节共用。 */
async function bundleCompatible(ctx: Context): Promise<boolean> {
  const manager = ctx.get('remote.pluginManager') as { listBundles(): Promise<{ ok: boolean; value?: Array<{ name: string; version?: string; installed: boolean; enabled: boolean }> }> } | undefined
  if (!manager) return false
  const response = await manager.listBundles()
  const main = response.ok ? response.value?.find((entry) => entry.name === 'satellite') : undefined
  return main?.installed === true && main.enabled === true && satisfiesRange(main.version)
}

function createAndroidSurface(ctx: Context): AndroidSurface {
  const scope = () => (ctx.configForms as unknown as { get(namespace: string): Scope }).get(ANDROID_NS)
  const read = (): AndroidReading => {
    const snapshot = scope().getSnapshot()
    let declaresExecution = false
    try {
      const descriptor = ctx.configForms.describe().getSnapshot().view?.namespaces.find((entry) => entry.ns === ANDROID_NS)
      const schema = ctx.get('settingsSchema')
      if (descriptor && schema && descriptor.revision === snapshot.revision) {
        declaresExecution = schema.nodeAtPath(schema.rehydrate(descriptor.schema), ['execution']) !== undefined
      }
    } catch {
      // 缺 schema 元数据时按"未声明"处理：没有服务就不提供界面，不猜字段。
    }
    return {
      snapshot,
      inherited: readExecution(snapshot.base),
      user: readExecution(snapshot.user),
      effective: readExecution(snapshot.value),
      declaresExecution,
    }
  }
  return {
    compatible: () => bundleCompatible(ctx),
    read,
    subscribe(listener) {
      const offForm = scope().subscribe(listener)
      const offSchema = ctx.configForms.describe().subscribe(listener)
      return () => { offForm(); offSchema() }
    },
    async mutate(ops, revision) {
      if (read().snapshot.status !== 'ready') return false
      return scope().mutate(ops, revision)
    },
  }
}

function AndroidExecutionSection(
  props: { t: Translate; surface: AndroidSurface },
): React.ReactElement {
  const { t, surface } = props
  const [reading, setReading] = useState<AndroidReading | undefined>(() => {
    try {
      return surface.read()
    } catch {
      return undefined
    }
  })
  const [draft, setDraft] = useState<ExecutionDraft>()
  const draftRevision = useRef<number | undefined>(undefined)
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle')
  const [compatible, setCompatible] = useState<boolean | undefined>()
  const [compatAgain, setCompatAgain] = useState(0)
  const mounted = useRef(false)
  const acting = useRef(false)
  const fresh = useId()

  const served = reading !== undefined

  useEffect(() => {
    mounted.current = true
    const sync = () => {
      if (!mounted.current) return
      try {
        setReading(surface.read())
      } catch {
        setReading(undefined)
      }
    }
    sync()
    const unsubscribe = surface.subscribe(sync)
    return () => {
      mounted.current = false
      unsubscribe()
    }
  }, [surface])

  useEffect(() => {
    let live = true
    setCompatible(undefined)
    void surface.compatible().then((ok) => { if (live) setCompatible(ok) }, () => { if (live) setCompatible(false) })
    return () => { live = false }
  }, [surface, reading?.snapshot.revision, compatAgain])

  const write = useCallback(async (ops: readonly ScopeOp[], revision: number | undefined) => {
    if (acting.current) return
    acting.current = true
    setState('busy')
    try {
      if (!await surface.compatible().catch(() => false)) {
        if (mounted.current) setCompatible(false)
        throw new Error('Unsupported Satellite version')
      }
      if (!await surface.mutate(ops, revision)) throw new Error('Settings write refused')
      if (mounted.current) {
        setDraft(undefined)
        draftRevision.current = undefined
        setState('saved')
      }
    } catch {
      if (mounted.current) setState('failed')
    } finally {
      acting.current = false
      if (mounted.current) setReading(surface.read())
    }
  }, [surface])

  const snapshot = reading?.snapshot
  const busy = state === 'busy'
  const user = reading?.user ?? {}
  const defaults = reading?.inherited ?? {}
  // 显示**生效值**（value 层，含继承默认），写操作只与用户覆盖层（user）比对：
  // 这样"未设置"的字段会显示它实际继承到的值，而不是显示成空白。
  const saved = executionDraft(reading?.effective ?? {})
  const current = draft ?? saved
  const plan = planExecution(current, user, defaults)
  const warnings = pathWarnings(current)
  const changed = plan.ops.length > 0

  const edit = (field: ExecutionField, value: string | boolean) => {
    if (draft === undefined) draftRevision.current = snapshot?.revision
    setDraft({ ...current, [field]: value })
    if (state !== 'idle') setState('idle')
  }
  const discard = () => {
    setDraft(undefined)
    draftRevision.current = undefined
    setState('idle')
  }

  const header = [
    <h2 className="satellite-ui__title" key="title">{t('androidTitle')}</h2>,
    <p className="satellite-ui__intro" key="intro">{t('androidIntro')}</p>,
  ]
  const panel = (stateName: string, message: string, variant: string) => <div className="satellite-ui">
    {header}
    <div className="satellite-ui__panel" data-state={stateName}>
      <p className={variant}>{message}</p>
    </div>
  </div>

  if (!served) return panel('unavailable', t('settingsUnavailable'), 'satellite-ui__notice')
  if (snapshot?.status === 'loading') return panel('loading', t('settingsLoading'), 'satellite-ui__notice')
  if (snapshot?.status !== 'ready') return panel('unavailable', t('settingsUnavailable'), 'satellite-ui__notice')
  if (reading.declaresExecution !== true) return panel('unsupported', t('androidUnsupported'), 'satellite-ui__notice')
  if (compatible === undefined) return panel('loading', t('compatLoading'), 'satellite-ui__notice')
  if (!compatible) {
    return <div className="satellite-ui">
      {header}
      <p role="alert">{t('compatFailed')}</p>
      <button type="button" onClick={() => setCompatAgain((value) => value + 1)}>{t('retryCompatibility')}</button>
    </div>
  }
  if (snapshot.writable !== true) return panel('read-only', t('readOnly'), 'satellite-ui__notice')

  const error = plan.error === 'timeout' ? t('androidInvalidTimeout')
    : plan.error === 'output' ? t('androidInvalidOutput')
      : plan.error === 'privacy' ? t('androidInvalidPrivacy')
        : undefined

  const status = state === 'saved'
    ? <span className="satellite-ui__status" data-state="saved" role="status">{t('saved')}</span>
    : state === 'failed'
      ? <span className="satellite-ui__status" data-state="failed" role="alert">{t('failed')}</span>
      : state === 'busy'
        ? <span className="satellite-ui__status" data-state="busy" role="status">{t('saving')}</span>
        : null

  const fieldId = (field: ExecutionField) => `${fresh}-${field}`
  const textInput = (field: ExecutionField, labelKey: Parameters<Translate>[0]) =>
    <div className="satellite-ui__field">
      <label className="satellite-ui__label" htmlFor={fieldId(field)}>{t(labelKey)}</label>
      <input className="satellite-ui__input" id={fieldId(field)} data-field={field}
        value={String(current[field])} spellCheck={false} autoComplete="off"
        placeholder={t('androidEmpty')} disabled={busy}
        onChange={(event) => edit(field, event.target.value)} />
    </div>
  const numberInput = (field: NumberField, labelKey: Parameters<Translate>[0]) =>
    <div className="satellite-ui__field">
      <label className="satellite-ui__label" htmlFor={fieldId(field)}>{t(labelKey)}</label>
      <input className="satellite-ui__input" id={fieldId(field)} data-field={field}
        inputMode="numeric" value={String(current[field])} spellCheck={false} autoComplete="off"
        placeholder={`${NUMBER_FIELDS[field][0]}–${NUMBER_FIELDS[field][1]}`} disabled={busy}
        onChange={(event) => edit(field, event.target.value)} />
    </div>

  return <div className="satellite-ui">
    {header}
    <div className="satellite-ui__groups">
      <fieldset className="satellite-ui__group">
        <legend className="satellite-ui__group-title">{t('androidGroupEnable')}</legend>
        <div className="satellite-ui__group-body">
          <div className="satellite-ui__field satellite-ui__field--check">
            <label className="satellite-ui__label" htmlFor={fieldId('enabled')}>
              <input id={fieldId('enabled')} data-field="enabled" type="checkbox" checked={current.enabled === true}
                disabled={busy} onChange={(event) => edit('enabled', event.target.checked)} /> {t('androidEnabled')}
            </label>
            <span className="satellite-ui__notice">{t('androidEnabledHint')}</span>
            <span className="satellite-ui__badge">
              {t('androidEffective')} {reading.effective.enabled === true ? t('androidOn') : t('androidOff')}
            </span>
          </div>
          <div className="satellite-ui__field">
            <label className="satellite-ui__label" htmlFor={fieldId('privacy')}>{t('androidPrivacy')}</label>
            <select className="satellite-ui__input satellite-ui__select" id={fieldId('privacy')} data-field="privacy"
              value={String(current.privacy)} disabled={busy}
              onChange={(event) => edit('privacy', event.target.value)}>
              <option value="">{t('androidPrivacyUnset')}</option>
              {PRIVACY_VALUES.map((value) => <option key={value} value={value}>{t(value === 'verified-disabled' ? 'androidPrivacyVerifiedDisabled' : 'androidPrivacyOptIn')}</option>)}
            </select>
          </div>
        </div>
      </fieldset>
      <fieldset className="satellite-ui__group">
        <legend className="satellite-ui__group-title">{t('androidGroupPaths')}</legend>
        <div className="satellite-ui__group-body">
          {textInput('androidCli', 'androidCli')}
          {textInput('adbPath', 'androidAdb')}
          {textInput('emulatorPath', 'androidEmulator')}
          {textInput('avdmanagerPath', 'androidAvdmanager')}
          {textInput('javaHome', 'androidJavaHome')}
        </div>
      </fieldset>
      <fieldset className="satellite-ui__group">
        <legend className="satellite-ui__group-title">{t('androidGroupLimits')}</legend>
        <div className="satellite-ui__group-body">
          {textInput('serverEndpoint', 'androidServerEndpoint')}
          {numberInput('operationTimeoutMs', 'androidTimeout')}
          {numberInput('outputMaxBytes', 'androidOutput')}
        </div>
      </fieldset>
    </div>
    <p className="satellite-ui__notice">{t('androidMachineHint')}</p>
    {warnings.length > 0
      ? <p className="satellite-ui__notice" data-state="missing" role="status">{t('androidPathWarning')}: {warnings.join(', ')}</p>
      : null}
    {error ? <p className="satellite-ui__error" role="alert">{error}</p> : null}
    <div className="satellite-ui__actions satellite-ui__actions--footer">
      <button className="satellite-ui__button satellite-ui__button--primary" type="button"
        disabled={busy || error !== undefined || !changed}
        onClick={() => { if (error === undefined && changed) void write(plan.ops, draft === undefined ? snapshot.revision : draftRevision.current) }}>
        {busy ? t('saving') : t('save')}
      </button>
      <button className="satellite-ui__button" type="button" disabled={busy || draft === undefined}
        onClick={discard}>{t('discard')}</button>
      {status}
    </div>
  </div>
}

/* ------------------------------------------------------------ 设置页容器（分页） */

type SettingsPage = 'roles' | 'android'

/**
 * Satellite 设置页：一个 settings.section，内部按"插件能力"分页。
 *
 * 页签只随**宿主实际服务**的命名空间出现：角色模型要 `satellite-node`，
 * Android 执行要 `satellite-android`。某个插件没装/停用时它那一页就不存在，
 * 不会留一张空页；以后再加插件只是多一个 page 条目。
 */
function SatelliteSettingsSection(
  props: {
    t: Translate
    surface: Surface
    catalog: Catalog
    androidSurface: AndroidSurface
    /** 宿主当前实际服务的命名空间集合（由 whileServed 传入，不在组件里再猜）。 */
    served: ReadonlySet<string>
  },
): React.ReactElement {
  const { t, surface, catalog, androidSurface, served } = props
  const [selected, setSelected] = useState<SettingsPage | undefined>(undefined)
  const fresh = useId()

  const pages: SettingsPage[] = []
  if (served.has(SETTINGS_NS)) pages.push('roles')
  if (served.has(ANDROID_NS)) pages.push('android')
  // 只在仍存在时才沿用用户选择，否则回到第一页。
  const active = selected !== undefined && pages.includes(selected) ? selected : pages[0]

  if (active === undefined) {
    return <div className="satellite-ui">
      <h2 className="satellite-ui__title">{t('sectionLabel')}</h2>
      <p className="satellite-ui__notice">{t('settingsUnavailable')}</p>
    </div>
  }

  const tabId = (page: SettingsPage) => `${fresh}-tab-${page}`
  const panelId = (page: SettingsPage) => `${fresh}-panel-${page}`

  return <div className="satellite-ui">
    <h2 className="satellite-ui__title">{t('sectionLabel')}</h2>
    <div role="tablist" aria-label={t('tabsLabel')} className="satellite-ui__tabs">
      {pages.map((page) => <button key={page} type="button" role="tab" id={tabId(page)}
        data-page={page} aria-selected={active === page} aria-controls={panelId(page)}
        className={active === page ? 'satellite-ui__tab satellite-ui__tab--active' : 'satellite-ui__tab'}
        onClick={() => setSelected(page)}>{t(page === 'roles' ? 'pageRoles' : 'pageAndroid')}</button>)}
    </div>
    <div role="tabpanel" id={panelId(active)} aria-labelledby={tabId(active)} data-active-page={active}>
      {active === 'roles'
        ? <SatelliteRoutesSection t={t} surface={surface} catalog={catalog} />
        : <AndroidExecutionSection t={t} surface={androidSurface} />}
    </div>
  </div>
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, 'en', en), 'satellite-ui: English')
  ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'satellite-ui: Chinese')
  const t = ctx.locale.bind(NS) as unknown as Translate
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const tag = document.createElement('style')
    tag.dataset.plugin = NS
    tag.textContent = css
    document.head.appendChild(tag)
    return () => tag.remove()
  }, 'satellite-ui: stylesheet')
  const surface = createSurface(ctx)
  const androidSurface = createAndroidSurface(ctx)
  const catalog = createCatalog(ctx)
  const slots = ctx.get('slots') as {
    inject(name: string, register: () => unknown): void
    register(options: object, component: typeof SatelliteSettingsSection): unknown
  }
  const configForms = ctx.get('configForms') as ConfigFormsService | undefined

  // 挂载门控：宿主开始服务 `satellite-node` 时才注册这一节（缺服务时整块都不注册）。
  // 官方用法见 dsh-client-ui-settings-subagent/lib/client.js:839
  //   ctx.effect(() => ctx.configForms.whileServed([NS…], () => ctx.slots.inject(…, () => ctx.slots.register({…}, Card))), '…: page')
  // 实现见 dsh-client-ui-settings/lib/client.js:1330-1346（watch 共享镜像的 namespaces；命中才 register，
  // 不再服务时跑它的 disposer）。因此功能插件未安装/未激活时，设置页里没有 Satellite 一节。
  if (typeof configForms?.whileServed !== 'function') return
  // 一个 settings.section 覆盖整个 Satellite：内部按宿主实际服务的命名空间分页
  // （角色模型 -> satellite-node，Android 执行 -> satellite-android）。
  // 只服务其中一个时这一节仍然存在，只显示对应的那一页。
  ctx.effect(() => configForms.whileServed([SETTINGS_NS, ANDROID_NS], (served) => slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: SECTION_ID,
    order: SECTION_ORDER,
    label: () => t('sectionLabel'),
    locale: NS,
    inject: () => ({ t, surface, catalog, androidSurface, served }),
  }, SatelliteSettingsSection))), 'satellite-ui: settings section')
}
