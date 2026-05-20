export function normalizePixelLabSpriteOutput(value: unknown) {
  if (!value || typeof value !== 'object') return { frames: [], spritesheet: null, warnings: ['PixelLab returned no JSON object.'] }
  const payload = value as Record<string, unknown>
  const discovered = collectImageUris(payload)
  const explicitFrames = arrayOfStrings(payload.frames)
  const nestedFrames = [
    ...arrayOfStrings((payload.output as Record<string, unknown> | undefined)?.frames),
    ...arrayOfStrings((payload.result as Record<string, unknown> | undefined)?.frames),
    ...arrayOfStrings((payload.data as Record<string, unknown> | undefined)?.frames),
  ]
  const spritesheet =
    stringValue(payload.spritesheet) ||
    stringValue(payload.spriteSheet) ||
    stringValue(payload.spritesheet_url) ||
    stringValue(payload.sprite_sheet) ||
    stringValue((payload.output as Record<string, unknown> | undefined)?.spritesheet) ||
    stringValue((payload.output as Record<string, unknown> | undefined)?.spritesheet_url) ||
    stringValue((payload.result as Record<string, unknown> | undefined)?.spritesheet) ||
    stringValue((payload.result as Record<string, unknown> | undefined)?.spritesheet_url) ||
    stringValue((payload.data as Record<string, unknown> | undefined)?.spritesheet) ||
    stringValue((payload.data as Record<string, unknown> | undefined)?.spritesheet_url) ||
    null
  const frames = uniqueStrings([
    ...explicitFrames,
    ...nestedFrames,
    ...arrayOfStrings(payload.images),
    ...arrayOfStrings(payload.image_urls),
    ...arrayOfStrings(payload.urls),
    ...discovered.filter((uri) => uri !== spritesheet),
  ])
  return {
    frames,
    spritesheet,
    warnings: plainStrings(payload.warnings),
  }
}

function arrayOfStrings(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string' && isImageUri(item)) return [item]
    if (item && typeof item === 'object') return collectImageUris(item)
    return []
  })
}

function plainStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : []
}

function collectImageUris(value: unknown, depth = 0): string[] {
  if (depth > 5) return []
  if (typeof value === 'string') return isImageUri(value) ? [value] : []
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap((item) => collectImageUris(item, depth + 1))
  const payload = value as Record<string, unknown>
  return Object.entries(payload).flatMap(([key, item]) => {
    const lowerKey = key.toLowerCase()
    if (typeof item === 'string' && (lowerKey.includes('image') || lowerKey.includes('frame') || lowerKey.includes('sprite') || lowerKey.includes('url'))) {
      return isImageUri(item) ? [item] : []
    }
    return collectImageUris(item, depth + 1)
  })
}

function isImageUri(value: string) {
  return /^data:image\//.test(value) ||
    /^https?:\/\/.+\.(png|webp|gif|jpg|jpeg)(\?|#|$)/i.test(value) ||
    /^blob:/.test(value) ||
    /^(\/|\.\/|\.\.\/)?[^?#]+\.(png|webp|gif|jpg|jpeg)(\?|#|$)/i.test(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && isImageUri(value) ? value : ''
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}
