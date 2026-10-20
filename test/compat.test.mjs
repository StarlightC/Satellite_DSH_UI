import test from 'node:test'
import assert from 'node:assert/strict'

import { SUPPORTED_MAIN_RANGE, readMainVersion, satisfiesRange } from '../lib/index.js'

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

test('readMainVersion 能从仓库兄弟目录解析出主插件版本', () => {
  // test/ 的上一级是包根，包根的同级目录就是主插件 satellite。
  assert.equal(readMainVersion(), '0.1.0')
})

test('解析到的主插件版本落在支持范围内', () => {
  const version = readMainVersion()
  assert.ok(version !== undefined, '开发布局下应能读到 satellite/package.json')
  assert.equal(satisfiesRange(version), true, String(version))
})

test('invalid versions and ranges fail closed', () => {
  for (const v of ['0.1.0garbage', '00.1.0', '0.1.01', '0.1.0-beta.2', '99999999999999999.1.0']) assert.equal(satisfiesRange(v), false)
  for (const r of ['*', '^0.1.0', '>=0.1.0 garbage']) assert.equal(satisfiesRange('0.1.0', r), false)
  assert.equal(satisfiesRange('0.1.0+build.1'), true)
})
