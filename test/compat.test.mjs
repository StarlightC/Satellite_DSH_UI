import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SUPPORTED_MAIN_RANGE, readMainVersion, satisfiesRange } from '../lib/index.js'

/**
 * 在临时 profile 里放一个受控的 `satellite` 版本，并临时指向 `DSH_PROFILE_DIR`。
 *
 * `readMainVersion` 在 `DSH_PROFILE_DIR` 存在时只从该 profile 解析，因此结果不依赖
 * 开发机的兄弟目录或已安装插件；无论断言成败，fixture 与环境变量都会还原。
 */
async function withProfileFixture(version, run) {
  const dir = await mkdtemp(join(tmpdir(), 'satellite-ui-compat-'))
  const previous = process.env.DSH_PROFILE_DIR
  try {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'test-profile', version: '0.0.0' }))
    if (version !== undefined) {
      const satelliteDir = join(dir, 'node_modules', 'satellite')
      await mkdir(satelliteDir, { recursive: true })
      await writeFile(join(satelliteDir, 'package.json'), JSON.stringify({ name: 'satellite', version }))
    }
    process.env.DSH_PROFILE_DIR = dir
    await run()
  } finally {
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
    await rm(dir, { recursive: true, force: true })
  }
}

test('默认支持范围是 >=0.1.0 <0.2.0', () => {
  assert.equal(SUPPORTED_MAIN_RANGE, '>=0.1.0 <0.2.0')
})

test('范围内的版本通过', () => {
  for (const version of ['0.1.0', '0.1.5', '0.1.99']) {
    assert.equal(satisfiesRange(version), true, version)
  }
})

test('越界、过低与非法版本被拒绝', () => {
  for (const version of ['0.2.0', '0.3.1', '1.0.0', '0.0.9', '', 'abc', undefined, null]) {
    assert.equal(satisfiesRange(version), false, String(version))
  }
})

test('支持自定义比较子句', () => {
  assert.equal(satisfiesRange('1.2.3', '>=1.2.0 <1.3.0'), true)
  assert.equal(satisfiesRange('1.3.0', '>=1.2.0 <1.3.0'), false)
  assert.equal(satisfiesRange('2.0.0', '>=1.2.0'), true)
  assert.equal(satisfiesRange('1.2.3', '=1.2.3'), true)
  assert.equal(satisfiesRange('1.2.4', '=1.2.3'), false)
})

test('拒绝预发布与非法版本，仅接受稳定版本', () => {
  assert.equal(satisfiesRange('0.1.0-beta.1'), false)
  assert.equal(satisfiesRange('v0.1.2'), false) // v 前缀不是本实现支持的形状
  assert.equal(satisfiesRange('0.1', undefined), false)
})

test('空区间与非法子句失败关闭', () => {
  assert.equal(satisfiesRange('9.9.9', ''), false)
  assert.equal(satisfiesRange('9.9.9', '   '), false)
})

test('readMainVersion 从受控 profile 读取主插件版本', async () => {
  await withProfileFixture('0.1.7', () => {
    assert.equal(readMainVersion(), '0.1.7')
    assert.equal(satisfiesRange('0.1.7'), true)
  })
})

test('readMainVersion 读取不兼容版本，由支持范围守卫拒绝', async () => {
  await withProfileFixture('0.2.0', () => {
    assert.equal(readMainVersion(), '0.2.0')
    assert.equal(satisfiesRange('0.2.0'), false)
  })
})

test('readMainVersion 在 profile 没有主插件时返回 undefined', async () => {
  await withProfileFixture(undefined, () => {
    assert.equal(readMainVersion(), undefined)
  })
})

test('invalid versions and ranges fail closed', () => {
  for (const v of ['0.1.0garbage', '00.1.0', '0.1.01', '0.1.0-beta.2', '99999999999999999.1.0']) assert.equal(satisfiesRange(v), false)
  for (const r of ['*', '^0.1.0', '>=0.1.0 garbage']) assert.equal(satisfiesRange('0.1.0', r), false)
  assert.equal(satisfiesRange('0.1.0+build.1'), true)
})
