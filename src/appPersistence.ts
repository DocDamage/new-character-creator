import type { ApesJob, ApesPreflightReport, ComposerLayerSettings, ExtractedPart, PaletteRules, PartLabel } from './types'

export type SavedComposerRecipe = {
  recipe_id: string
  name: string
  base_character: string
  selected_parts: Record<PartLabel, string>
  selected_part_ids: Partial<Record<PartLabel, string>>
  layer_settings: Partial<Record<PartLabel, ComposerLayerSettings>>
  palette: string
  palette_rules?: Omit<PaletteRules, 'team_color'>
  saved_at: string
}

export const partLibraryStorageKey = 'pixel_creator_part_library'
export const composerRecipesStorageKey = 'pixel_creator_saved_recipes'
export const assetRootInputStorageKey = 'pixel_creator_asset_root_input'
export const apesPythonPathStorageKey = 'pixel_creator_apes_python_path'
export const apesAllowPlaceholderStorageKey = 'pixel_creator_apes_allow_placeholder'
export const apesPreflightStorageKey = 'pixel_creator_apes_preflight'
export const apesJobsStorageKey = 'pixel_creator_apes_jobs'
export const apesHarnessGeneratedAtStorageKey = 'pixel_creator_apes_harness_generated_at'
export const apesQaHarnessJobId = 'apes_harness_job'

function parseStoredJson<T>(storageKey: string, fallback: T) {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(storageKey)
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function loadStoredPartLibrary() {
  return parseStoredJson<ExtractedPart[]>(partLibraryStorageKey, [])
}

export function loadStoredComposerRecipes() {
  return parseStoredJson<SavedComposerRecipe[]>(composerRecipesStorageKey, [])
}

export function loadStoredApesPreflight() {
  return parseStoredJson<ApesPreflightReport | null>(apesPreflightStorageKey, null)
}

export function loadStoredApesJobs() {
  return parseStoredJson<ApesJob[]>(apesJobsStorageKey, [])
}

export function loadStoredString(storageKey: string, fallback = '') {
  if (typeof window === 'undefined') return fallback
  return window.localStorage.getItem(storageKey) || fallback
}

export function loadStoredBoolean(storageKey: string) {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(storageKey) === 'true'
}

export function storeJson(storageKey: string, value: unknown | null) {
  if (typeof window === 'undefined') return
  if (value === null) {
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, JSON.stringify(value))
}

export function storeString(storageKey: string, value: string) {
  if (typeof window === 'undefined') return
  if (!value) {
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, value)
}

export function storeBoolean(storageKey: string, value: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey, String(value))
}

export function makeDraftRecipeId(characterId = 'character') {
  return `generated_${characterId}_${Date.now()}`
}
