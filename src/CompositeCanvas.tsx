import { useEffect, useRef } from 'react'
import { humanoid64Preset } from './presets'
import type { AnimationName, CharacterManifest, Direction, ExtractedPart, KitbashRecipe, Rect } from './types'
import { getFramePath } from './utils'

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

    async function drawComposite() {
      for (const layer of recipe.layers) {
        if (cancelled || !layer.visible) continue
        const sourceCharacter = characters.find((character) => character.character_id === layer.source_character) ?? characters[0]
        if (!sourceCharacter) continue

        const sourcePart = partLibrary.find((part) => part.part_id === layer.source_part_id)
        const bounds = sourcePart?.bounds ?? humanoid64Preset[layer.label]
        const sourceFrame = sourcePart?.source_frame_path ?? getFramePath(sourceCharacter, animation, direction, frameIndex)
        const source = sourcePart?.image_data_url ?? sourceFrame
        if (!source) continue

        const image = await loadImage(source)
        if (cancelled) return

        drawLayer(drawContext, image, bounds, layer.offset, scale, recipe, Boolean(sourcePart?.image_data_url))
      }
    }

    drawComposite().catch((error) => {
      console.error('Could not render composite preview', error)
    })

    return () => {
      cancelled = true
    }
  }, [recipe, characters, partLibrary, animation, direction, frameIndex, scale])

  return (
    <figure className="pixel-stage composite-stage" aria-label={label}>
      <canvas ref={canvasRef} />
      {label ? <figcaption>{label}</figcaption> : null}
    </figure>
  )
}

function drawLayer(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  bounds: Rect,
  offset: [number, number],
  scale: number,
  recipe: KitbashRecipe,
  isExtractedPart: boolean,
) {
  context.save()
  context.imageSmoothingEnabled = false
  context.filter = `hue-rotate(${recipe.palette.hue_shift}deg) saturate(${recipe.palette.saturation}%) brightness(${recipe.palette.brightness}%)`
  if (isExtractedPart) {
    context.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
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
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${src}`))
    image.src = src
  })
}
