import { PixelCanvas } from './PixelCanvas'
import type { AnimationName, CharacterManifest, Direction } from './types'
import { getFramePath, slugLabel } from './utils'

type DirectionPreviewGridProps = {
  character: CharacterManifest
  animation: AnimationName
  frameIndex: number
  directions: Direction[]
}

export function DirectionPreviewGrid({ character, animation, frameIndex, directions }: DirectionPreviewGridProps) {
  return (
    <section className="direction-preview" aria-label="All direction preview">
      <div>
        <strong>All-direction preview</strong>
        <span>{slugLabel(animation)} frame {frameIndex + 1}</span>
      </div>
      <div className="direction-preview-grid">
        {directions.map((direction) => (
          <PixelCanvas
            key={direction}
            src={getFramePath(character, animation, direction, frameIndex)}
            scale={2}
            label={direction}
          />
        ))}
      </div>
    </section>
  )
}