import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Rect } from './types'

type PixelCanvasProps = {
  src: string
  scale?: number
  region?: Rect
  sourceRect?: Rect
  onionSrc?: string
  onionSourceRect?: Rect
  label?: string
  seed?: { x: number; y: number }
  onPixelClick?: (point: { x: number; y: number }) => void
}

export function PixelCanvas({ src, scale = 5, region, sourceRect, onionSrc, onionSourceRect, label, seed, onPixelClick }: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [loadError, setLoadError] = useState<{ src: string; message: string } | null>(null)
  const visibleLoadError = src ? (loadError?.src === src ? loadError.message : '') : 'No frame is available for this character, animation, and direction.'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let cancelled = false
    canvas.width = 64 * scale
    canvas.height = 64 * scale
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvas.width, canvas.height)
    drawChecker(context, canvas.width, canvas.height, scale)

    if (!src) {
      return () => {
        cancelled = true
      }
    }

    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (cancelled) return
      setLoadError(null)
      context.imageSmoothingEnabled = false
      context.clearRect(0, 0, canvas.width, canvas.height)
      drawChecker(context, canvas.width, canvas.height, scale)

      if (onionSrc) {
        const onion = new Image()
        onion.crossOrigin = 'anonymous'
        onion.onload = () => {
          if (cancelled) return
          context.globalAlpha = 0.22
          drawFrameImage(context, onion, scale, onionSourceRect)
          context.globalAlpha = 1
          drawFrameImage(context, image, scale, sourceRect)
          drawRegion(context, scale, region)
          drawSeed(context, scale, seed)
        }
        onion.src = onionSrc
        return
      }

      drawFrameImage(context, image, scale, sourceRect)
      drawRegion(context, scale, region)
      drawSeed(context, scale, seed)
    }
    image.onerror = () => {
      if (cancelled) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      drawChecker(context, canvas.width, canvas.height, scale)
      setLoadError({ src, message: `Could not load frame: ${src}` })
    }
    image.src = src

    return () => {
      cancelled = true
    }
  }, [src, scale, region, sourceRect, onionSrc, onionSourceRect, seed])

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!onPixelClick) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(63, Math.floor(((event.clientX - rect.left) / rect.width) * 64)))
    const y = Math.max(0, Math.min(63, Math.floor(((event.clientY - rect.top) / rect.height) * 64)))
    onPixelClick({ x, y })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!onPixelClick) return
    const current = seed ?? { x: 32, y: 32 }
    const delta = event.shiftKey ? 4 : 1
    const next = { ...current }
    if (event.key === 'ArrowLeft') next.x -= delta
    else if (event.key === 'ArrowRight') next.x += delta
    else if (event.key === 'ArrowUp') next.y -= delta
    else if (event.key === 'ArrowDown') next.y += delta
    else if (event.key === 'Enter' || event.key === ' ') {
      onPixelClick(current)
      event.preventDefault()
      return
    } else {
      return
    }
    event.preventDefault()
    onPixelClick({
      x: Math.max(0, Math.min(63, next.x)),
      y: Math.max(0, Math.min(63, next.y)),
    })
  }

  return (
    <figure className="pixel-stage" aria-label={label}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={onPixelClick ? 0 : undefined}
        role={onPixelClick ? 'img' : undefined}
        aria-label={onPixelClick ? `${label ?? 'Pixel canvas'}; use arrow keys to move the seed and Enter to place it.` : undefined}
        className={onPixelClick ? 'clickable' : undefined}
      />
      {label ? <figcaption>{label}</figcaption> : null}
      {visibleLoadError ? <span className="canvas-error" role="status">{visibleLoadError}</span> : null}
    </figure>
  )
}

function drawFrameImage(context: CanvasRenderingContext2D, image: HTMLImageElement, scale: number, sourceRect?: Rect) {
  if (!sourceRect) {
    context.drawImage(image, 0, 0, 64 * scale, 64 * scale)
    return
  }

  context.drawImage(
    image,
    sourceRect.x,
    sourceRect.y,
    sourceRect.w,
    sourceRect.h,
    0,
    0,
    64 * scale,
    64 * scale,
  )
}

function drawChecker(context: CanvasRenderingContext2D, width: number, height: number, scale: number) {
  const size = scale * 2
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      context.fillStyle = (x / size + y / size) % 2 === 0 ? '#18202a' : '#243140'
      context.fillRect(x, y, size, size)
    }
  }
}

function drawRegion(context: CanvasRenderingContext2D, scale: number, region?: Rect) {
  if (!region) return
  context.save()
  context.strokeStyle = '#f8d36b'
  context.lineWidth = 2
  context.setLineDash([6, 4])
  context.strokeRect(region.x * scale, region.y * scale, region.w * scale, region.h * scale)
  context.fillStyle = 'rgba(248, 211, 107, 0.16)'
  context.fillRect(region.x * scale, region.y * scale, region.w * scale, region.h * scale)
  context.restore()
}

function drawSeed(context: CanvasRenderingContext2D, scale: number, seed?: { x: number; y: number }) {
  if (!seed) return
  const x = seed.x * scale
  const y = seed.y * scale
  context.save()
  context.strokeStyle = '#7ee787'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(x - 6, y)
  context.lineTo(x + scale + 6, y)
  context.moveTo(x, y - 6)
  context.lineTo(x, y + scale + 6)
  context.stroke()
  context.strokeRect(x, y, scale, scale)
  context.restore()
}
