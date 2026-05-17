import type { Rect, SourceAlphaAnalysis } from './types'

export function analyzeAlphaData(alphaValues: Uint8ClampedArray | number[], width: number, height: number): SourceAlphaAnalysis {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let opaquePixelCount = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = alphaValues[(y * width + x) * 4 + 3] ?? 0
      if (alpha <= 0) continue
      opaquePixelCount += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  const alphaBounds: Rect | null = opaquePixelCount > 0
    ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
    : null
  const floorY = alphaBounds ? maxY : null
  const pivot = alphaBounds ? { x: Math.round((minX + maxX) / 2), y: floorY ?? maxY } : null
  const warnings = [
    opaquePixelCount === 0 ? 'Source frame has no opaque pixels.' : '',
    alphaBounds && (alphaBounds.w > 64 || alphaBounds.h > 64) ? 'Opaque bounds exceed the expected 64x64 creator frame.' : '',
    alphaBounds && floorY !== null && floorY < Math.floor(height * 0.55) ? 'Detected floor is unusually high; source may be cropped or floating.' : '',
  ].filter(Boolean)

  return {
    format: 'pixel_creator_source_alpha_analysis',
    version: 1,
    width,
    height,
    opaque_pixel_count: opaquePixelCount,
    alpha_bounds: alphaBounds,
    floor_y: floorY,
    pivot,
    warnings,
  }
}

export async function analyzeImageSource(src: string): Promise<SourceAlphaAnalysis> {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable for source analysis.')
  context.imageSmoothingEnabled = false
  context.drawImage(image, 0, 0)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  return analyzeAlphaData(imageData.data, canvas.width, canvas.height)
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${src}`))
    image.src = src
  })
}
