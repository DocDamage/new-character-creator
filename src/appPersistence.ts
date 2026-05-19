import { defaultAiProviderConfig } from './generationJobs.ts'
import { defaultAiProviderConnections, defaultToolConnections, normalizeAiProviderConnections, normalizeToolConnections, redactAiProviderConnections } from './aiWorkspace.ts'
import type { AiProviderConfig, AiProviderConnection, ApesJob, ApesPreflightReport, ComposerLayerSettings, ExtractedPart, GenerationJob, PaletteRules, PartLabel, RecipeModeId, SourceFamilyId, ToolConnectionSettings, TrainingInboxDraft, TrainingLibraryRecord, VariationPreset } from './types'
import type { LpcRecipeSelection } from './lpcCatalog'

export type SavedComposerRecipe = {
  recipe_id: string
  name: string
  recipe_mode?: RecipeModeId
  source_family?: SourceFamilyId
  base_character: string
  animation_source_character?: string
  lpc_selections?: Record<string, LpcRecipeSelection>
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
export const aiProviderConfigStorageKey = 'pixel_creator_ai_provider_config'
export const aiProviderConnectionsStorageKey = 'pixel_creator_ai_provider_connections'
export const aiToolConnectionsStorageKey = 'pixel_creator_ai_tool_connections'
export const aiSecretSessionStorageKey = 'pixel_creator_ai_session_secret_status'
export const generationJobsStorageKey = 'pixel_creator_generation_jobs'
export const apesHarnessGeneratedAtStorageKey = 'pixel_creator_apes_harness_generated_at'
export const variationPresetsStorageKey = 'pixel_creator_variation_presets'
export const filenameTemplateStorageKey = 'pixel_creator_filename_template'
export const exportTargetProfileStorageKey = 'pixel_creator_export_target_profile'
export const trainingInboxStorageKey = 'pixel_creator_training_inbox'
export const trainingLibraryStorageKey = 'pixel_creator_training_library'
export const apesQaHarnessJobId = 'apes_harness_job'

function parseStoredJson<T>(storageKey: string, fallback: T) {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function parseSessionJson<T>(storageKey: string, fallback: T) {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return fallback
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

export function loadStoredAiProviderConfig() {
  return parseStoredJson<AiProviderConfig>(aiProviderConfigStorageKey, defaultAiProviderConfig)
}

export function loadStoredAiProviderConnections() {
  return normalizeAiProviderConnections(parseStoredJson<AiProviderConnection[]>(aiProviderConnectionsStorageKey, defaultAiProviderConnections))
}

export function loadStoredToolConnections() {
  return normalizeToolConnections(parseStoredJson<ToolConnectionSettings>(aiToolConnectionsStorageKey, defaultToolConnections))
}

export function storeAiProviderConnections(connections: AiProviderConnection[]) {
  return storeJson(aiProviderConnectionsStorageKey, redactAiProviderConnections(connections))
}

export function loadSessionSecretStatus() {
  return parseSessionJson<Record<string, boolean>>(aiSecretSessionStorageKey, {})
}

export function storeSessionSecretStatus(status: Record<string, boolean>) {
  if (typeof window === 'undefined') return true
  try {
    window.sessionStorage.setItem(aiSecretSessionStorageKey, JSON.stringify(status))
    return true
  } catch {
    return false
  }
}

export function loadStoredGenerationJobs() {
  return parseStoredJson<GenerationJob[]>(generationJobsStorageKey, [])
}

export function loadStoredVariationPresets() {
  return parseStoredJson<VariationPreset[]>(variationPresetsStorageKey, [])
}

export function loadStoredTrainingInboxDrafts() {
  return parseStoredJson<TrainingInboxDraft[]>(trainingInboxStorageKey, [])
}

export function loadStoredTrainingLibraryRecords() {
  return parseStoredJson<TrainingLibraryRecord[]>(trainingLibraryStorageKey, [])
}

export function loadStoredString(storageKey: string, fallback = '') {
  if (typeof window === 'undefined') return fallback
  try {
    return window.localStorage.getItem(storageKey) || fallback
  } catch {
    return fallback
  }
}

export function loadStoredBoolean(storageKey: string) {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(storageKey) === 'true'
  } catch {
    return false
  }
}

export function storeJson(storageKey: string, value: unknown | null) {
  if (typeof window === 'undefined') return true
  try {
    if (value === null) {
      window.localStorage.removeItem(storageKey)
      return true
    }
    window.localStorage.setItem(storageKey, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function storeString(storageKey: string, value: string) {
  if (typeof window === 'undefined') return true
  try {
    if (!value) {
      window.localStorage.removeItem(storageKey)
      return true
    }
    window.localStorage.setItem(storageKey, value)
    return true
  } catch {
    return false
  }
}

export function storeBoolean(storageKey: string, value: boolean) {
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(storageKey, String(value))
    return true
  } catch {
    return false
  }
}

export function makeDraftRecipeId(characterId = 'character') {
  return `generated_${characterId}_${Date.now()}`
}
