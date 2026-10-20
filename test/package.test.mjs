import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 本包根目录（test/ 的上一级）。 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))

/** npm 生命周期钩子：本包只用于安装到 profile，不允许在安装时执行代码。 */
const HOOKS = [
  'preinstall', 'install', 'postinstall', 'prepare', 'prepack',
  'prepublish', 'prepublishOnly', 'publish',
]

/** 与功能插件 `satellite` 同版本区间；两处必须一致，否则界面与功能会错配。 */
const MAIN_RANGE = '>=0.1.0 <0.2.0'

test('不声明任何安装/发布生命周期钩子', () => {
  for (const hook of HOOKS) {
    assert.equal(manifest.scripts?.[hook], undefined, hook)
  }
})

test('scripts 只保留 build / typecheck / test', () => {
  assert.deepEqual(Object.keys(manifest.scripts ?? {}).sort(), ['build', 'test', 'typecheck'])
})

test('不声明 dependencies：运行时依赖一律走 peerDependencies', () => {
  assert.equal(manifest.dependencies, undefined)
  assert.equal(manifest.optionalDependencies, undefined)
})

test('dsh 依赖：devDependencies 钉死版本，peerDependencies 用区间', () => {
  const dev = manifest.devDependencies ?? {}
  assert.ok(Object.keys(dev).length > 0, 'devDependencies 不能为空')
  for (const [name, range] of Object.entries(dev)) {
    if (!name.startsWith('@deepseek-ai/')) continue
    assert.match(String(range), /^\d+\.\d+\.\d+/, `${name}@${range} 应为固定版本`)
  }
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    assert.doesNotMatch(String(range), /^\d+\.\d+\.\d+$/, `${name}@${range} 不应钉死单版本`)
  }
  assert.equal(manifest.peerDependencies?.satellite, MAIN_RANGE)
  // `satellite` 由 GitHub 分发、不在 npm 上：标记为 optional peer 只让安装可缺省，
  // 运行时 Host 半边仍强制校验，缺失或越界都会拒绝加载。
  assert.equal(manifest.peerDependenciesMeta?.satellite?.optional, true, 'satellite 应为 optional peer（安装可缺省，运行时必需）')
  // 其他 peer 保持必需，不能被顺手标成 optional。
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (name === 'satellite') continue
    assert.notEqual(manifest.peerDependenciesMeta?.[name]?.optional, true, `${name} 必须是必需 peer`)
  }
  // manifest 与 lock 根条目的 peer 元数据须一致，两处声明不能相互背离。
  assert.deepEqual(
    manifest.peerDependenciesMeta ?? {},
    lock.packages?.['']?.peerDependenciesMeta ?? {},
    'package.json 与 package-lock.json 根 peerDependenciesMeta 必须一致',
  )
  // 每个 dsh 运行时依赖都要同时出现在 peer 与 dev 里，且版本可对齐。
  for (const name of Object.keys(dev).filter((entry) => entry.startsWith('@deepseek-ai/'))) {
    assert.ok(manifest.peerDependencies?.[name] !== undefined, `${name} 缺少 peer 声明`)
  }
})

test('main / exports / dsh 指向的文件真实存在（通配符按 glob 展开）', async () => {
  const patterns = [manifest.main, manifest.dsh?.bundle?.patch]
  for (const value of Object.values(manifest.exports ?? {})) patterns.push(value)
  for (const pattern of patterns) {
    assert.equal(typeof pattern, 'string', String(pattern))
    const target = join(root, pattern)
    if (pattern.includes('*')) {
      const dir = join(root, dirname(pattern))
      const suffix = pattern.slice(pattern.lastIndexOf('*') + 1)
      const entries = await readdir(dir)
      const hits = entries.filter((entry) => entry.endsWith(suffix))
      assert.ok(hits.length > 0, `${pattern} 没有匹配到文件`)
      for (const hit of hits) await access(join(dir, hit))
      continue
    }
    await access(target)
  }
  assert.equal(manifest.exports['.'], `./${manifest.main}`)
})

test('files 含 lib，且不含源码与测试', () => {
  assert.ok(manifest.files?.includes('lib'), 'files 应含 lib')
  assert.ok(manifest.files?.includes('cordis.patch.yml'))
  assert.ok(manifest.files?.includes('icon.svg'))
  assert.ok(!manifest.files?.some((entry) => entry.startsWith('src') || entry.startsWith('test')))
  assert.equal(manifest.private, undefined)
  assert.equal(manifest.type, 'module')
})

test('dsh.client 声明 web 平台与设置页依赖', () => {
  assert.equal(manifest.dsh?.client?.platform, 'web')
  const inject = manifest.dsh?.client?.inject ?? []
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-settings'), '需要设置服务')
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-slots'), '需要插槽服务')
  assert.ok(inject.includes('@deepseek-ai/dsh-client-locale'), '需要字典服务')
})

test('cordis.patch.yml 以裸包名挂载浏览器半边', async () => {
  const patch = await readFile(join(root, manifest.dsh.bundle.patch), 'utf8')
  assert.match(patch, /id: satellite-ui/)
  assert.match(patch, /name: 'satellite-ui'/)
})
