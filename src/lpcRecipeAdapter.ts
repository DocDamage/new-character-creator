import type { CharacterManifest, KitbashRecipe } from './types.ts'
import type { LpcCatalog, LpcRecipeSelection } from './lpcCatalog.ts'
import { inferRecipeCompatibility } from './sourceFamilyRegistry.ts'

export function migrateRecipeToLpcSelections(recipe: KitbashRecipe, characters: CharacterManifest[], catalog?: LpcCatalog): KitbashRecipe {
  const compatibility = inferRecipeCompatibility(recipe, characters)
  if (compatibility.source_family !== 'lpc') {
    return {
      ...recipe,
      recipe_mode: recipe.recipe_mode ?? compatibility.recipe_mode,
      source_family: recipe.source_family ?? compatibility.source_family,
    }
  }

  const lpcSelections = {
    ...recipe.lpc_selections,
    ...legacyLayersToSelections(recipe, characters, catalog),
  }

  return {
    ...recipe,
    recipe_mode: recipe.recipe_mode ?? 'lpc_character',
    source_family: recipe.source_family ?? 'lpc',
    lpc_selections: lpcSelections,
  }
}

function legacyLayersToSelections(recipe: KitbashRecipe, characters: CharacterManifest[], catalog?: LpcCatalog): Record<string, LpcRecipeSelection> {
  const selections: Record<string, LpcRecipeSelection> = {}
  for (const layer of recipe.layers) {
    const sourceCharacter = characters.find((character) => character.character_id === layer.source_character)
    if (sourceCharacter?.labels?.lpc_role !== 'part') continue
    const sourcePath = typeof sourceCharacter.labels.lpc_path === 'string' ? sourceCharacter.labels.lpc_path : ''
    const item = findCatalogItemForLegacyPath(sourcePath, catalog)
    if (!item) continue
    selections[layer.label] = {
      slot_id: layer.label,
      item_id: item.item_id,
      variant: item.variants[0] ?? '',
      type_name: item.type_name,
      enabled: layer.visible,
    }
  }
  return selections
}

function findCatalogItemForLegacyPath(sourcePath: string, catalog?: LpcCatalog) {
  if (!catalog || !sourcePath) return null
  const normalized = sourcePath.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const alias = catalog.aliases[normalized]
  if (alias) return catalog.items[alias.item_id] ?? null
  return Object.values(catalog.items).find((item) => normalized.includes(item.type_name) && normalized.includes(item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'))) ?? null
}
