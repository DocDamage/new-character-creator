import type { CharacterManifest, KitbashRecipe } from './types'

export function getRecipeAnimationCoverage(baseCharacter: CharacterManifest, animationSourceCharacter?: CharacterManifest) {
  return animationSourceCharacter?.animation_names.length ? animationSourceCharacter.animation_names : baseCharacter.animation_names
}

export function getRecipeAnimationSourceCharacter(recipe: KitbashRecipe, characters: CharacterManifest[]) {
  return recipe.animation_source_character
    ? characters.find((character) => character.character_id === recipe.animation_source_character)
    : undefined
}

export function getActiveAnimationCharacter(
  selectedCharacter: CharacterManifest | undefined,
  characters: CharacterManifest[],
  animationSourceCharacterId: string,
) {
  if (!selectedCharacter) return undefined
  if (!animationSourceCharacterId || animationSourceCharacterId === selectedCharacter.character_id) return selectedCharacter
  const animationSource = characters.find((character) => character.character_id === animationSourceCharacterId)
  return animationSource && isCompatibleAnimationSource(selectedCharacter, animationSource) ? animationSource : selectedCharacter
}

export function getCompatibleAnimationSources(selectedCharacter: CharacterManifest | undefined, characters: CharacterManifest[]) {
  if (!selectedCharacter) return []
  return characters.filter((candidate) => isCompatibleAnimationSource(selectedCharacter, candidate))
}

function isCompatibleAnimationSource(selectedCharacter: CharacterManifest, candidate: CharacterManifest) {
  if (candidate.labels?.lpc_role === 'part') return false
  if (candidate.canvas_size.width !== selectedCharacter.canvas_size.width || candidate.canvas_size.height !== selectedCharacter.canvas_size.height) {
    return false
  }
  if (isLpcMannequinLike(selectedCharacter)) {
    return isLpcMannequinLike(candidate)
  }
  return candidate.class_type === selectedCharacter.class_type || candidate.character_id === selectedCharacter.character_id
}

function isLpcMannequinLike(character: CharacterManifest) {
  return character.class_type === 'lpc_character' && character.labels?.lpc_role !== 'part'
}
