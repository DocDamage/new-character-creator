import { PixelCanvas } from './PixelCanvas'
import type { AnimationName, CharacterManifest, Direction } from './types'
import { getFrameRef, slugLabel } from './utils'

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
        {directions.map((direction) => {
          const frame = getFrameRef(character, animation, direction, frameIndex)
          return (
            <PixelCanvas
              key={direction}
              src={frame?.path ?? character.representative_frame}
              sourceRect={frame?.source_rect}
              scale={2}
              label={direction}
            />
          )
        })}
      </div>
    </section>
  )
}
