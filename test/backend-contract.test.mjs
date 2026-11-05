import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { SUPPORTED_MAIN_RANGE, satisfiesRange } from '../lib/index.js'

/**
 * 真实后端（satellite 0.2.x）的 headless 契约检查：直接读兄弟仓库已构建的 lib，
 * 不启动 Web server、不安装到 profile、不模拟设置页。
 *
 * 发布包与 CI 没有这个兄弟仓库时整组跳过；它只证实本机后端产物与 UI 读取的
 * `satellite-node` 配置面 / RoleCatalog 形状一致，不代替实时设置页验收。
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendDir = resolve(root, '..', 'Satellite_DSH')
const backendAvailable = await access(join(backendDir, 'package.json')).then(() => true, () => false)
const skip = backendAvailable ? false : 'sibling Satellite_DSH checkout unavailable'
const require = createRequire(import.meta.url)
const Schema = require('@deepseek-ai/schemastery')

const loadBackend = (relative) => import(pathToFileURL(join(backendDir, relative)).href)

const SANDBOXES = ['read-only', 'workspace-write', 'danger-full-access']
const PHASES = ['base', 'before', 'after']

/** 与浏览器半边 schema 读取相同的 Schemastery 路径语义。 */
function nodeAtPath(root, path) {
  let node = root
  for (const key of path) node = node?.type === 'object' ? node.dict?.[key] : undefined
  return node
}

test('本机的功能插件 satellite 在 UI 支持范围内', { skip }, async () => {
  const manifest = JSON.parse(await readFile(join(backendDir, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'satellite')
  assert.equal(satisfiesRange(manifest.version), true, `${manifest.version} 应满足 ${SUPPORTED_MAIN_RANGE}`)
})

test('后端设置 schema 仍提供本页读取的 volatile routes / declaredRoles', { skip }, async () => {
  const { Config } = await loadBackend('lib/node/index.js')
  const schema = new Schema(JSON.parse(JSON.stringify(Config)))
  const routes = nodeAtPath(schema, ['routes'])
  const declaredRoles = nodeAtPath(schema, ['declaredRoles'])
  assert.equal(routes?.type, 'array', 'satellite-node 必须声明 routes 数组')
  assert.equal(declaredRoles?.type, 'array', 'satellite-node 必须声明 declaredRoles 数组')

  const defaults = routes.meta?.default
  assert.ok(Array.isArray(defaults) && defaults.length > 0, 'routes 需要有代码默认值')
  const roles = new Set()
  for (const route of defaults) {
    assert.equal(typeof route?.role, 'string')
    assert.equal(typeof route?.provider, 'string')
    assert.equal(typeof route?.model, 'string')
    assert.ok(!roles.has(route.role), `routes 默认值角色重复: ${route.role}`)
    roles.add(route.role)
  }
  assert.deepEqual([...declaredRoles.meta?.default ?? []], [...roles], 'declaredRoles 应与默认 routes 角色一致')
})

test('后端 RoleCatalog 与 UI 解析契约一致', { skip }, async () => {
  const { DEFAULT_CONFIG, normalizeConfig } = await loadBackend('lib/node/lib/config.js')
  const { buildRoleCatalog } = await loadBackend('lib/node/lib/role-catalog.js')
  const normalized = normalizeConfig(DEFAULT_CONFIG)
  const catalog = buildRoleCatalog(normalized, [])

  assert.equal(catalog.version, 1)
  assert.equal(catalog.roles.length, Object.keys(normalized.roles).length)
  for (const role of catalog.roles) {
    assert.equal(typeof role.role, 'string')
    assert.ok(role.role.trim() !== '')
    assert.equal(typeof role.label, 'string')
    assert.equal(typeof role.description, 'string')
    assert.ok(SANDBOXES.includes(role.sandbox), `未知 sandbox: ${role.sandbox}`)
    assert.ok(Array.isArray(role.bindings))
    for (const binding of role.bindings) {
      assert.ok(typeof binding.node === 'string' && binding.node.trim() !== '')
      assert.ok(PHASES.includes(binding.phase), `未知 phase: ${binding.phase}`)
      assert.equal(typeof binding.condition, 'string')
    }
  }
})
