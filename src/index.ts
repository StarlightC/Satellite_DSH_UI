/**
 * `satellite-ui` 的宿主半边。
 *
 * 它自己不做运行时业务，只负责两件事：
 * 1. 作为浏览器半边的挂载点（客户端模块按"裸包名"归属这一行）；
 * 2. **支持范围判断**：核对已安装的主插件 `satellite` 版本是否在本 UI 支持的区间内，
 *    不在区间就明确报错，避免界面与功能插件版本错配后出现难查的问题。
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

import { SUPPORTED_MAIN_RANGE, satisfiesRange } from './compat.js'
export { SUPPORTED_MAIN_RANGE, satisfiesRange } from './compat.js'

/**
 * 读取已安装的主插件版本；解析不到时返回 undefined。
 *
 * 依次尝试三种基准，覆盖三种真实安装形态：
 * 1. 从本包位置按包名解析（主插件作为普通依赖安装在 node_modules 时）；
 * 2. 仓库内的兄弟目录 `../Satellite_DSH`（开发时两个仓库并排；旧布局的 `../satellite` 也兼容）；
 * 3. profile 目录（profile 用 `link:` 链接本包时，只有 profile 的 node_modules 里才有 `satellite`）。
 */
export function readMainVersion(): string | undefined {
  const sibling = new URL('../../Satellite_DSH/package.json', import.meta.url).href
  const legacySibling = new URL('../../satellite/package.json', import.meta.url).href
  // 注意：`require()` 不接受 `file://` URL 字符串（会 MODULE_NOT_FOUND），必须转成绝对路径。
  const bases: Array<{ base: string; direct?: string }> = [
    { base: import.meta.url },
    { base: sibling, direct: fileURLToPath(sibling) },
    { base: legacySibling, direct: fileURLToPath(legacySibling) },
  ]
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir.length > 0) {
    bases.splice(0, bases.length, { base: pathToFileURL(join(profileDir, 'package.json')).href })
  }
  for (const { base, direct } of bases) {
    try {
      const require = createRequire(base)
      const manifest: unknown = direct === undefined ? require('satellite/package.json') : require(direct)
      const version = (manifest as { version?: unknown } | undefined)?.version
      if (typeof version === 'string') return version
    } catch {
      // 换下一种基准
    }
  }
  return undefined
}

export function apply(ctx: Context): void {
  const version = readMainVersion()
  if (version === undefined) {
    throw new Error(`satellite-ui: 未找到主插件 satellite（需要 ${SUPPORTED_MAIN_RANGE}）`)
  }
  if (!satisfiesRange(version)) {
    throw new Error(`satellite-ui: satellite@${version} 不在支持范围 ${SUPPORTED_MAIN_RANGE} 内`)
  }
  ctx.logger?.info?.(`satellite-ui: 已确认主插件 satellite@${version}（支持范围 ${SUPPORTED_MAIN_RANGE}）`)
}
