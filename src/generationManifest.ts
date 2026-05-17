import type { AnimationName, CharacterManifest, Direction, GenerationManifest, PartLabel } from './types'

export function buildGenerationManifest(options: {
  character: CharacterManifest
  animations: AnimationName[]
  directions: Direction[]
  frameRange: [number, number]
  labels: PartLabel[]
  filenameTemplate: string
  styleNotes: string
  layerBundleTargets: string[]
}): GenerationManifest {
  const [start, end] = options.frameRange[0] <= options.frameRange[1]
    ? options.frameRange
    : [options.frameRange[1], options.frameRange[0]]
  const frameReferences = options.animations.flatMap((animation) =>
    options.directions.flatMap((direction) =>
      getCharacterFrames(options.character, animation, direction)
        .filter((frame) => frame.index >= start && frame.index <= end)
        .map((frame) => ({
          animation,
          direction,
          frame_index: frame.index,
          path: frame.path,
        })),
    ),
  )

  return {
    format: 'pixel_creator_generation_manifest',
    version: 1,
    generated_at: new Date().toISOString(),
    style_notes: options.styleNotes.trim(),
    source_character: options.character.character_id,
    frame_references: frameReferences,
    output_labels: options.labels,
    filename_template: options.filenameTemplate,
    layer_bundle_targets: options.layerBundleTargets,
  }
}

function getCharacterFrames(character: CharacterManifest, animation: AnimationName, direction: Direction) {
  const animationSet = character.animations.find((item) => item.name === animation)
  return animationSet?.directions[direction] ?? []
}
