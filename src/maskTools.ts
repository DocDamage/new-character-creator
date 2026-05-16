import type { Rect } from './types'

const maskWidth = 64
const maskHeight = 64

export function createEmptyMask() {
  return new Uint8Array(maskWidth * maskHeight)
}

export function rectToMask(rect: Rect) {
  const mask = createEmptyMask()
  const startX = clamp(rect.x, 0, maskWidth)
  const startY = clamp(rect.y, 0, maskHeight)
  const endX = clamp(rect.x + rect.w, 0, maskWidth)
  const endY = clamp(rect.y + rect.h, 0, maskHeight)

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      mask[y * maskWidth + x] = 1
    }
  }

  return mask
}

export function paintMaskPixel(mask: Uint8Array, x: number, y: number, enabled: boolean, brushSize = 1) {
  const nextMask = mask.slice()
  const radius = Math.max(0, brushSize - 1)

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const px = x + offsetX
      const py = y + offsetY
      if (px < 0 || py < 0 || px >= maskWidth || py >= maskHeight) continue
      nextMask[py * maskWidth + px] = enabled ? 1 : 0
    }
  }

  return nextMask
}

export function fillMask(mask: Uint8Array, x: number, y: number, enabled: boolean) {
  if (x < 0 || y < 0 || x >= maskWidth || y >= maskHeight) return mask.slice()

  const startIndex = y * maskWidth + x
  const target = mask[startIndex]
  const replacement = enabled ? 1 : 0
  if (target === replacement) return mask.slice()

  const nextMask = mask.slice()
  const queue = [{ x, y }]
  const visited = new Uint8Array(maskWidth * maskHeight)

  while (queue.length > 0) {
    const point = queue.pop()
    if (!point) break
    if (point.x < 0 || point.y < 0 || point.x >= maskWidth || point.y >= maskHeight) continue

    const index = point.y * maskWidth + point.x
    if (visited[index]) continue
    visited[index] = 1
    if (nextMask[index] !== target) continue

    nextMask[index] = replacement
    queue.push({ x: point.x + 1, y: point.y })
    queue.push({ x: point.x - 1, y: point.y })
    queue.push({ x: point.x, y: point.y + 1 })
    queue.push({ x: point.x, y: point.y - 1 })
  }

  return nextMask
}

export function growMask(mask: Uint8Array) {
  const nextMask = mask.slice()

  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      const index = y * maskWidth + x
      if (mask[index]) continue
      if (hasFilledNeighbor(mask, x, y)) nextMask[index] = 1
    }
  }

  return nextMask
}

export function shrinkMask(mask: Uint8Array) {
  const nextMask = mask.slice()

  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      const index = y * maskWidth + x
      if (!mask[index]) continue
      if (hasEmptyNeighbor(mask, x, y)) nextMask[index] = 0
    }
  }

  return nextMask
}

export function invertMask(mask: Uint8Array) {
  const nextMask = mask.slice()
  for (let index = 0; index < nextMask.length; index += 1) {
    nextMask[index] = nextMask[index] ? 0 : 1
  }
  return nextMask
}

export function mirrorMask(mask: Uint8Array) {
  const nextMask = createEmptyMask()
  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      nextMask[y * maskWidth + x] = mask[y * maskWidth + (maskWidth - 1 - x)]
    }
  }
  return nextMask
}

export function nudgeMask(mask: Uint8Array, dx: number, dy: number) {
  const nextMask = createEmptyMask()
  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      const sourceX = x - dx
      const sourceY = y - dy
      if (sourceX < 0 || sourceY < 0 || sourceX >= maskWidth || sourceY >= maskHeight) continue
      nextMask[y * maskWidth + x] = mask[sourceY * maskWidth + sourceX]
    }
  }
  return nextMask
}

export function getMaskBounds(mask: Uint8Array): Rect | null {
  let minX = maskWidth
  let minY = maskHeight
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      if (!mask[y * maskWidth + x]) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) return null

  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  }
}

export function maskToDataUrl(mask: Uint8Array) {
  const canvas = document.createElement('canvas')
  canvas.width = maskWidth
  canvas.height = maskHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')
  const imageData = context.createImageData(maskWidth, maskHeight)

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue
    const offset = index * 4
    imageData.data[offset] = 255
    imageData.data[offset + 1] = 255
    imageData.data[offset + 2] = 255
    imageData.data[offset + 3] = 255
  }

  context.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

function hasFilledNeighbor(mask: Uint8Array, x: number, y: number) {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue
      const px = x + offsetX
      const py = y + offsetY
      if (px < 0 || py < 0 || px >= maskWidth || py >= maskHeight) continue
      if (mask[py * maskWidth + px]) return true
    }
  }
  return false
}

function hasEmptyNeighbor(mask: Uint8Array, x: number, y: number) {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue
      const px = x + offsetX
      const py = y + offsetY
      if (px < 0 || py < 0 || px >= maskWidth || py >= maskHeight) return true
      if (!mask[py * maskWidth + px]) return true
    }
  }
  return false
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}