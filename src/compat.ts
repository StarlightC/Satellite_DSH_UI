/** Supported stable Satellite releases; shared by Host and browser checks. */
export const SUPPORTED_MAIN_RANGE = '>=0.1.0 <0.2.0'

/** Strict comparator ranges only. Invalid clauses and prereleases fail closed. */
export function satisfiesRange(version: unknown, range = SUPPORTED_MAIN_RANGE): boolean {
  const parse = (value: unknown): number[] | undefined => {
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) return undefined
    const parts = value.split('+')[0]!.split('.').map(Number)
    return parts.every(Number.isSafeInteger) ? parts : undefined
  }
  const actual = parse(version)
  if (!actual || !range.trim()) return false
  return range.trim().split(/\s+/).every((clause) => {
    const match = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(clause)
    const expected = match && parse(match[2])
    if (!match || !expected) return false
    let order = 0
    for (let i = 0; i < 3; i++) {
      if (actual[i] !== expected[i]) { order = actual[i]! < expected[i]! ? -1 : 1; break }
    }
    switch (match[1] ?? '=') {
      case '>=': return order >= 0
      case '<=': return order <= 0
      case '>': return order > 0
      case '<': return order < 0
      default: return order === 0
    }
  })
}
