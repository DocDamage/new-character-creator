import { useEffect, useRef, useState } from 'react'
import { humanoid64Preset } from './presets'
import type { AnimationName, CharacterManifest, Direction, ExtractedPart, KitbashRecipe, Rect } from './types'
import { getFrameRef } from './utils'

type CompositeCanvasProps = {
  recipe: KitbashRecipe
  characters: CharacterManifest[]
  partLibrary: ExtractedPart[]
  animation: AnimationName
  direction: Direction
  frameIndex: number
  scale?: number
  label?: string
}

const imageLoadCache = new Map<string, Promise<HTMLImageElement>>()

export function CompositeCanvas({
  recipe,
  characters,
  partLibrary,
  animation,
  direction,
  frameIndex,
  scale = 5,
  label,
}: CompositeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [renderError, setRenderError] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const drawContext = context

    let cancelled = false
    canvas.width = 64 * scale
    canvas.height = 64 * scale
    drawContext.imageSmoothingEnabled = false
    drawContext.clearRect(0, 0, canvas.width, canvas.height)
    drawChecker(drawContext, canvas.width, canvas.height, scale)
    setRenderError('')

    async function drawComposite() {
      for (const layer of recipe.layers) {
        if (cancelled || !layer.visible) continue
        const sourceCharacter = characters.find((character) => character.character_id === layer.source_character) ?? characters[0]
        if (!sourceCharacter) continue

        const sourcePart = partLibrary.find((part) => part.part_id === layer.source_part_id)
        const isLpcPartSource = !sourcePart && sourceCharacter.labels?.lpc_role === 'part'
        const bounds = isLpcPartSource ? fullFrameBounds : sourcePart?.bounds ?? humanoid64Preset[layer.label]
        const matchingFrame = getFrameRef(sourceCharacter, animation, direction, frameIndex)
        const sourceFrame = isLpcPartSource
          ? matchingFrame
          : matchingFrame ?? getFrameRef(sourceCharacter, sourceCharacter.animation_names[0] ?? animation, direction, frameIndex)
        const source = sourcePart?.image_data_url ?? sourceFrame?.path
        if (!source) continue

        const image = await loadImage(source)
        const maskImage = sourcePart?.mask_data_url ? await loadImage(sourcePart.mask_data_url) : undefined
        if (cancelled) return

        drawLayer(drawContext, image, maskImage, bounds, layer.offset, scale, recipe, Boolean(sourcePart?.image_data_url), sourcePart ? undefined : sourceFrame?.source_rect)
      }
    }

    drawComposite().catch((error) => {
      if (!cancelled) {
        setRenderError(`Could not render composite preview: ${error instanceof Error ? error.message : String(error)}`)
      }
    })

    return () => {
      cancelled = true
    }
  }, [recipe, characters, partLibrary, animation, direction, frameIndex, scale])

  return (
    <figure className="pixel-stage composite-stage" aria-label={label}>
      <canvas ref={canvasRef} />
      {label ? <figcaption>{label}</figcaption> : null}
      {renderError ? <span className="canvas-error" role="status">{renderError}</span> : null}
    </figure>
  )
}

const fullFrameBounds: Rect = { x: 0, y: 0, w: 64, h: 64 }

function drawLayer(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  maskImage: HTMLImageElement | undefined,
  bounds: Rect,
  offset: [number, number],
  scale: number,
  recipe: KitbashRecipe,
  isExtractedPart: boolean,
  frameSourceRect?: Rect,
) {
  context.save()
  context.imageSmoothingEnabled = false
  context.filter = `hue-rotate(${recipe.palette.hue_shift}deg) saturate(${recipe.palette.saturation}%) brightness(${recipe.palette.brightness}%)`
  if (isExtractedPart) {
    drawExtractedLayer(context, image, maskImage, bounds, offset, scale)
  } else if (frameSourceRect) {
    context.drawImage(
      image,
      frameSourceRect.x + bounds.x,
      frameSourceRect.y + bounds.y,
      bounds.w,
      bounds.h,
      (bounds.x + offset[0]) * scale,
      (bounds.y + offset[1]) * scale,
      bounds.w * scale,
      bounds.h * scale,
    )
  } else {
    context.drawImage(
      image,
      bounds.x,
      bounds.y,
      bounds.w,
      bounds.h,
      (bounds.x + offset[0]) * scale,
      (bounds.y + offset[1]) * scale,
      bounds.w * scale,
      bounds.h * scale,
    )
  }
  context.restore()
}

function drawExtractedLayer(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  maskImage: HTMLImageElement | undefined,
  bounds: Rect,
  offset: [number, number],
  scale: number,
) {
  const canCropFromBounds = image.naturalWidth >= bounds.x + bounds.w && image.naturalHeight >= bounds.y + bounds.h
  const sourceX = canCropFromBounds ? bounds.x : 0
  const sourceY = canCropFromBounds ? bounds.y : 0
  const sourceWidth = canCropFromBounds ? bounds.w : image.naturalWidth
  const sourceHeight = canCropFromBounds ? bounds.h : image.naturalHeight
  const destinationX = (bounds.x + offset[0]) * scale
  const destinationY = (bounds.y + offset[1]) * scale
  const destinationWidth = bounds.w * scale
  const destinationHeight = bounds.h * scale

  if (!maskImage) {
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      destinationX,
      destinationY,
      destinationWidth,
      destinationHeight,
    )
    return
  }

  const scratch = document.createElement('canvas')
  scratch.width = Math.max(1, bounds.w)
  scratch.height = Math.max(1, bounds.h)
  const scratchContext = scratch.getContext('2d')
  if (!scratchContext) return
  scratchContext.imageSmoothingEnabled = false
  scratchContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, scratch.width, scratch.height)
  scratchContext.globalCompositeOperation = 'destination-in'
  if (maskImage.naturalWidth === 64 && maskImage.naturalHeight === 64) {
    scratchContext.drawImage(maskImage, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, scratch.width, scratch.height)
  } else {
    scratchContext.drawImage(maskImage, 0, 0, maskImage.naturalWidth, maskImage.naturalHeight, 0, 0, scratch.width, scratch.height)
  }
  context.drawImage(scratch, destinationX, destinationY, destinationWidth, destinationHeight)
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

function loadImage(src: string) {
  const cached = imageLoadCache.get(src)
  if (cached) return cached

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${src}`))
    image.src = src
  })
  imageLoadCache.set(src, promise)
  promise.catch(() => {
    imageLoadCache.delete(src)
  })
  return promise
}
