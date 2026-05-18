import type { CharacterManifest, ExtractedPart, PartLabel } from './types'

const lpcLayerAliases: Partial<Record<PartLabel, PartLabel[]>> = {
  back_arm: ['front_arm'],
  front_hand: ['front_arm'],
  back_hand: ['front_arm'],
  back_leg: ['front_leg'],
  legs: ['front_leg'],
  feet: ['front_leg'],
  head: ['face', 'hair_hat_hood'],
  face: ['head'],
  neck: ['head', 'torso'],
  cloak_back: ['back_item'],
  back_item: ['cloak_back', 'accessory'],
  aura_effect: ['accessory'],
}

export function getCompatibleLpcPartLabels(label: PartLabel): PartLabel[] {
  return Array.from(new Set([label, ...(lpcLayerAliases[label] ?? [])]))
}

export function getCharacterLabelValue(character: CharacterManifest, key: string) {
  const value = character.labels?.[key]
  return typeof value === 'string' ? value : ''
}

export function isLpcPartSourceForLayer(character: CharacterManifest, label: PartLabel) {
  return character.class_type === 'lpc_character' &&
    getCharacterLabelValue(character, 'lpc_role') === 'part' &&
    getCompatibleLpcPartLabels(label).includes(getCharacterLabelValue(character, 'lpc_part_label') as PartLabel)
}

export function isLpcMannequin(character: CharacterManifest | undefined) {
  return Boolean(character && character.class_type === 'lpc_character' && getCharacterLabelValue(character, 'lpc_role') !== 'part')
}

export function isLpcSourceCharacterId(characterId: string | undefined) {
  return Boolean(characterId?.startsWith('lpc-'))
}

export function isLpcExtractedPart(part: ExtractedPart | undefined) {
  if (!part) return false
  return part.tags.includes('lpc') ||
    part.tags.includes('lpc_character') ||
    part.character_id.startsWith('lpc-') ||
    part.source_frame_path?.includes('/lpc sprite generator stuff/') === true ||
    part.image_path.includes('/lpc sprite generator stuff/')
}

export function isPartCompatibleWithMannequin(part: ExtractedPart, mannequin: CharacterManifest | undefined) {
  return !isLpcExtractedPart(part) || isLpcMannequin(mannequin)
}

export function resolveCompatiblePartSelection(
  mannequin: CharacterManifest,
  selectedPart: ExtractedPart | undefined,
  selectedSourceCharacterId: string | undefined,
) {
  const compatibleSelectedPart = selectedPart && isPartCompatibleWithMannequin(selectedPart, mannequin) ? selectedPart : undefined
  const compatibleSelectedSource = selectedSourceCharacterId && (!isLpcSourceCharacterId(selectedSourceCharacterId) || isLpcMannequin(mannequin))
    ? selectedSourceCharacterId
    : undefined
  return { compatibleSelectedPart, compatibleSelectedSource }
}
