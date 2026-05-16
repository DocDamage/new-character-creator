export function clampFrameInput(value: string) {
  const parsed = Number(value.replace(/[^0-9]/g, ''))
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(31, parsed))
}

export function clampOffsetInput(value: string) {
  const parsed = Number(value.replace(/(?!^-)[^0-9]/g, ''))
  if (!Number.isFinite(parsed)) return 0
  return Math.max(-32, Math.min(32, parsed))
}

export function clampSignedInput(value: string, min: number, max: number) {
  const parsed = Number(value.replace(/(?!^-)[^0-9]/g, ''))
  if (!Number.isFinite(parsed)) return 0
  return Math.max(min, Math.min(max, parsed))
}

export function clampUnsignedInput(value: string, min: number, max: number) {
  const parsed = Number(value.replace(/[^0-9]/g, ''))
  if (!Number.isFinite(parsed)) return min
  return Math.max(min, Math.min(max, parsed))
}