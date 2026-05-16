import type { AnimationName, Direction, ExtractedPart, PartLabel, Rect } from './types'

type BuildManualMaskPartOptions = {
  sourcePart?: ExtractedPart
  selectedCharacterId: string
  selectedCharacterClassType: string
  selectedRegion: PartLabel
  animation: AnimationName
  direction: Direction
  frameIndex: number
  framePath?: string
  bounds: Rect
  maskDataUrl: string
}

export function buildManualMaskPart({
  sourcePart,
  selectedCharacterId,
  selectedCharacterClassType,
  selectedRegion,
  animation,
  direction,
  frameIndex,
  framePath,
  bounds,
  maskDataUrl,
}: BuildManualMaskPartOptions): ExtractedPart {
  const partId = sourcePart?.extraction_method === 'manual'
    ? sourcePart.part_id
    : sourcePart?.part_id
      ? `${sourcePart.part_id}_manual`
      : `${selectedCharacterId}_${animation}_${direction}_frame_${String(frameIndex).padStart(3, '0')}_${selectedRegion}_manual`

  return {
    part_id: partId,
    character_id: sourcePart?.character_id ?? selectedCharacterId,
    label: sourcePart?.label ?? selectedRegion,
    source_animation: sourcePart?.source_animation ?? animation,
    source_direction: sourcePart?.source_direction ?? direction,
    source_frame_path: sourcePart?.source_frame_path ?? framePath,
    image_path: sourcePart?.image_path ?? `${partId}.png`,
    mask_path: sourcePart?.mask_path ?? `${partId}_mask.png`,
    image_data_url: sourcePart?.image_data_url,
    mask_data_url: maskDataUrl,
    anchor: sourcePart?.anchor ?? { x: bounds.x + Math.round(bounds.w / 2), y: bounds.y + Math.round(bounds.h / 2) },
    bounds,
    extraction_method: 'manual',
    compatibility: sourcePart?.compatibility ?? {
      animations: [animation],
      directions: [direction],
    },
    tags: Array.from(
      new Set([
        ...(sourcePart?.tags ?? [selectedCharacterClassType]),
        sourcePart?.label ?? selectedRegion,
        'manual',
        'manual_cleanup',
      ]),
    ),
    reviewed: true,
    warnings: Array.from(new Set([...(sourcePart?.warnings ?? []), 'Mask reviewed in the manual cleanup workstation.'])),
  }
}