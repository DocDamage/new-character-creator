import { humanoid64Preset } from './presets.ts'
import type { CharacterManifest, ExtractedPart, KitbashRecipe, PartLabel, Rect } from './types'
import { getCharacterLabelValue, isLpcExtractedPart } from './lpcPartCompatibility.ts'

const replacementLabels: Record<PartLabel, PartLabel[]> = {
  shadow: [],
  back_item: [],
  cloak_back: [],
  back_arm: ['back_arm', 'back_hand'],
  back_leg: ['back_leg'],
  torso: ['torso'],
  front_leg: ['front_leg', 'back_leg', 'legs'],
  front_arm: ['front_arm', 'front_hand'],
  neck: ['neck'],
  head: ['head', 'face'],
  face: [],
  hair_hat_hood: [],
  weapon: [],
  shield: [],
  accessory: [],
  aura_effect: [],
  feet: ['feet'],
  front_hand: ['front_hand'],
  back_hand: ['back_hand'],
  legs: ['front_leg', 'back_leg', 'legs'],
}

export function buildLpcReplacementRegions(
  recipe: KitbashRecipe,
  characters: CharacterManifest[],
  partLibrary: ExtractedPart[],
) {
  const regions: Rect[] = []
  for (const layer of recipe.layers) {
    if (!layer.visible) continue
    const sourcePart = partLibrary.find((part) => part.part_id === layer.source_part_id)
    const sourceCharacter = characters.find((character) => character.character_id === layer.source_character)
    const isReplacement = sourcePart
      ? isLpcExtractedPart(sourcePart)
      : sourceCharacter ? isLpcBodyReplacementSource(sourceCharacter) : false
    if (!isReplacement) continue

    for (const label of replacementLabels[layer.label] ?? [layer.label]) {
      regions.push(humanoid64Preset[label])
    }
  }
  return regions
}

function isLpcBodyReplacementSource(character: CharacterManifest) {
  if (getCharacterLabelValue(character, 'lpc_role') !== 'part') return false
  const lpcPath = getCharacterLabelValue(character, 'lpc_path').replaceAll('\\', '/').toLowerCase()
  return lpcPath.includes('/body/')
}
