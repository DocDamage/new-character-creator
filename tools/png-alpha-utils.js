import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

export function readPngFile(filePath) {
  return PNG.sync.read(readFileSync(filePath))
}

export function rectInsideImage(rect, png) {
  return rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0 && rect.x + rect.w <= png.width && rect.y + rect.h <= png.height
}

export function alphaStats(png, rect) {
  let opaquePixels = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (alphaAt(png, x, y) > 0) {
        opaquePixels += 1
        minX = Math.min(minX, x - rect.x)
        minY = Math.min(minY, y - rect.y)
        maxX = Math.max(maxX, x - rect.x)
        maxY = Math.max(maxY, y - rect.y)
      }
    }
  }
  return {
    opaquePixels,
    bounds: opaquePixels > 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null,
  }
}

export function alphaMaskHash(png, rect) {
  let hash = 2166136261
  for (let y = 0; y < rect.h; y += 1) {
    for (let x = 0; x < rect.w; x += 1) {
      const opaque = alphaAt(png, rect.x + x, rect.y + y) > 0 ? 1 : 0
      hash ^= opaque
      hash = Math.imul(hash, 16777619)
    }
  }
  return hash >>> 0
}

export function alphaOverlapRatio(partPng, partRect, basePng, baseRect) {
  let partPixels = 0
  let overlappingPixels = 0
  const width = Math.min(partRect.w, baseRect.w)
  const height = Math.min(partRect.h, baseRect.h)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const partOpaque = alphaAt(partPng, partRect.x + x, partRect.y + y) > 0
      if (!partOpaque) continue
      partPixels += 1
      const baseOpaque = alphaAt(basePng, baseRect.x + x, baseRect.y + y) > 0
      if (baseOpaque) overlappingPixels += 1
    }
  }
  return partPixels > 0 ? overlappingPixels / partPixels : 1
}

export function findEmptyCellKeys(png, frameWidth, frameHeight, frameColumns, frameRows) {
  const cells = []
  for (let row = 0; row < frameRows; row += 1) {
    for (let column = 0; column < frameColumns; column += 1) {
      const rect = {
        x: column * frameWidth,
        y: row * frameHeight,
        w: frameWidth,
        h: frameHeight,
      }
      if (!rectInsideImage(rect, png)) continue
      if (alphaStats(png, rect).opaquePixels === 0) cells.push(`${row}:${column}`)
    }
  }
  return cells
}

function alphaAt(png, x, y) {
  return png.data[(y * png.width + x) * 4 + 3]
}
