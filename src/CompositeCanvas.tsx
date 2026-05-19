import { useEffect, useRef, useState } from 'react'
import type { ExportTargetProfileId } from './creatorCockpit'
import type { LpcCatalog } from './lpcCatalog'
import { performanceBudget } from './performanceBudget'
import { createImageLoader, renderRecipeFrameToContext } from './recipeFrameRenderer'
import type { AnimationName, CharacterManifest, Direction, ExtractedPart, KitbashRecipe } from './types'

type CompositeCanvasProps = {
  recipe: KitbashRecipe
  characters: CharacterManifest[]
  partLibrary: ExtractedPart[]
  animation: AnimationName
  direction: Direction
  frameIndex: number
  lpcCatalog?: LpcCatalog | null
  exportTargetProfile?: ExportTargetProfileId
  scale?: number
  label?: string
}

const loadImage = createImageLoader(performanceBudget.imageCacheMaxEntries, updateDiagnostics)

export function CompositeCanvas({
  recipe,
  characters,
  partLibrary,
  animation,
  direction,
  frameIndex,
  lpcCatalog,
  exportTargetProfile,
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

    let cancelled = false
    canvas.width = 64 * scale
    canvas.height = 64 * scale
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvas.width, canvas.height)
    drawChecker(context, canvas.width, canvas.height, scale)
    setRenderError('')

    renderRecipeFrameToContext({
      context,
      recipe,
      characters,
      partLibrary,
      animation,
      direction,
      frameIndex,
      lpcCatalog,
      exportTargetProfile,
      scale,
      loadImage,
      isCancelled: () => cancelled,
    }).catch((error) => {
      if (!cancelled) {
        setRenderError(`Could not render composite preview: ${error instanceof Error ? error.message : String(error)}`)
      }
    })

    return () => {
      cancelled = true
    }
  }, [recipe, characters, partLibrary, animation, direction, frameIndex, lpcCatalog, exportTargetProfile, scale])

  return (
    <figure className="pixel-stage composite-stage" aria-label={label}>
      <canvas ref={canvasRef} />
      {label ? <figcaption>{label}</figcaption> : null}
      {renderError ? <span className="canvas-error" role="status">{renderError}</span> : null}
    </figure>
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

function updateDiagnostics(cacheSize: number) {
  if (import.meta.env.DEV || import.meta.env.MODE === 'local-tools') {
    window.__spriteCreatorDiagnostics = {
      ...(window.__spriteCreatorDiagnostics ?? {}),
      imageCacheSize: cacheSize,
    }
  }
}
