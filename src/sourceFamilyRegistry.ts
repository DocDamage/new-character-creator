import type { CharacterManifest, ExtractedPart, KitbashRecipe, PartLabel } from './types.ts'
import type { RecipeModeId, SourceFamily, SourceFamilyId } from './lpcCatalog.ts'

export const sourceFamilies: Record<SourceFamilyId, SourceFamily> = {
  lpc: {
    family_id: 'lpc',
    label: 'LPC Catalog',
    role: 'composition',
    compatible_recipe_modes: ['lpc_character'],
    can_provide_body: true,
    can_provide_parts: true,
    can_provide_motion: true,
    default_tab: 'create',
  },
  sprite_pack: {
    family_id: 'sprite_pack',
    label: 'Sprite Pack',
    role: 'composition',
    compatible_recipe_modes: ['sprite_kitbash'],
    can_provide_body: true,
    can_provide_parts: true,
    can_provide_motion: true,
    default_tab: 'create',
  },
  duelyst: {
    family_id: 'duelyst',
    label: 'Duelyst',
    role: 'review',
    compatible_recipe_modes: ['duelyst_review'],
    can_provide_body: false,
    can_provide_parts: false,
    can_provide_motion: false,
    default_tab: 'sources',
  },
  custom: {
    family_id: 'custom',
    label: 'Custom/Imported',
    role: 'composition',
    compatible_recipe_modes: ['lpc_character', 'sprite_kitbash'],
    can_provide_body: false,
    can_provide_parts: true,
    can_provide_motion: false,
    default_tab: 'parts',
  },
}

export function inferSourceFamilyForCharacter(character: CharacterManifest | undefined): SourceFamilyId {
  if (!character) return 'sprite_pack'
  const assetLabels = character.labels?.asset_labels
  if (character.class_type === 'lpc_character' || character.labels?.lpc_role) return 'lpc'
  if (
    character.class_type === 'duelyst_staged' ||
    character.character_id.startsWith('duelyst_') ||
    character.labels?.duelyst_unit ||
    (Array.isArray(assetLabels) && assetLabels.includes('duelyst_public_review_candidate'))
  ) return 'duelyst'
  return 'sprite_pack'
}

export function inferRecipeModeForFamily(sourceFamily: SourceFamilyId): RecipeModeId {
  if (sourceFamily === 'lpc') return 'lpc_character'
  if (sourceFamily === 'duelyst') return 'duelyst_review'
  return 'sprite_kitbash'
}

export function sourceFamilyForRecipeMode(recipeMode: RecipeModeId): SourceFamilyId {
  if (recipeMode === 'lpc_character') return 'lpc'
  if (recipeMode === 'duelyst_review') return 'duelyst'
  return 'sprite_pack'
}

export function canShowCharacterInRecipeMode(character: CharacterManifest, recipeMode: RecipeModeId) {
  if (character.class_type === 'lpc_character' && character.labels?.lpc_role === 'part') return false
  return inferSourceFamilyForCharacter(character) === sourceFamilyForRecipeMode(recipeMode)
}

export function inferRecipeCompatibility(recipe: KitbashRecipe, characters: CharacterManifest[]) {
  const baseCharacter = characters.find((character) => character.character_id === recipe.base_character)
  const sourceFamily = recipe.source_family ?? inferSourceFamilyForCharacter(baseCharacter)
  const recipeMode = recipe.recipe_mode ?? inferRecipeModeForFamily(sourceFamily)
  const mismatches: Array<{ label: PartLabel; source_character: string; source_family: SourceFamilyId }> = []
  for (const layer of recipe.layers) {
      const character = characters.find((candidate) => candidate.character_id === layer.source_character)
      const layerFamily = inferSourceFamilyForCharacter(character)
      if (layerFamily !== sourceFamily && layerFamily !== 'custom') {
        mismatches.push({ label: layer.label, source_character: layer.source_character, source_family: layerFamily })
      }
  }

  return {
    recipe_mode: recipeMode,
    source_family: sourceFamily,
    compatibility_state: mismatches.length > 0 ? 'review_required' : 'compatible',
    mismatches,
  }
}

export function canUseCustomPartInRecipeMode(part: ExtractedPart, recipeMode: RecipeModeId) {
  const modes = part.compatible_recipe_modes
  if (!modes) return false
  return part.reviewed && modes.includes(recipeMode)
}
