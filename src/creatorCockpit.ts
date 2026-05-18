import type { ExtractionMethod, ExtractedPart, PartLabel } from './types'
import type { LpcExportProfile } from './lpcAssetResolver'

export type ExportTargetProfileId = 'generic' | 'godot_4' | 'unity_2d' | 'rpg_maker_mz' | 'aseprite' | 'lpc_oversize'

export type ExportTargetProfile = {
  id: ExportTargetProfileId
  label: string
  hint: string
  recommendedActionTestId: string
  lpcExportProfile: LpcExportProfile
}

export type RecipeReadinessState = 'ready' | 'needs_review' | 'incomplete'

export type RecipeReadiness = {
  selectedPartCount: number
  reviewedSelectedPartCount: number
  unreviewedSelectedPartCount: number
  missingReviewedLayerCount: number
  warningCount: number
  missingPartCount: number
  state: RecipeReadinessState
}

export type BuildRecipeReadinessInput = {
  selectedPartIds: Partial<Record<PartLabel, string>>
  partLibrary: ExtractedPart[]
  layerLabels: PartLabel[]
}

export type FilterReviewedPartsInput = {
  reviewedParts: ExtractedPart[]
  label: PartLabel
  query: string
  method: ExtractionMethod | 'all'
  selectedPartId?: string
}

export const defaultExportTargetProfileId: ExportTargetProfileId = 'generic'

export const exportTargetProfiles: ExportTargetProfile[] = [
  {
    id: 'generic',
    label: 'Generic package',
    hint: 'Use the full package zip or generic manifest when the target engine is not fixed yet.',
    recommendedActionTestId: 'export-full-package-zip',
    lpcExportProfile: 'standard_64',
  },
  {
    id: 'godot_4',
    label: 'Godot 4',
    hint: 'Use the full package zip for rendered PNGs plus Godot scene and SpriteFrames resources.',
    recommendedActionTestId: 'export-full-package-zip',
    lpcExportProfile: 'standard_64',
  },
  {
    id: 'unity_2d',
    label: 'Unity 2D',
    hint: 'Use the full package zip for PNGs plus Unity import metadata.',
    recommendedActionTestId: 'export-full-package-zip',
    lpcExportProfile: 'standard_64',
  },
  {
    id: 'rpg_maker_mz',
    label: 'RPG Maker MZ',
    hint: 'Use RPG Maker metadata after checking the current sheet and rendered frame outputs.',
    recommendedActionTestId: 'export-rpg-maker-metadata',
    lpcExportProfile: 'standard_64',
  },
  {
    id: 'aseprite',
    label: 'Aseprite',
    hint: 'Use the Aseprite reference with rendered frames when preparing editable art files.',
    recommendedActionTestId: 'export-aseprite-reference',
    lpcExportProfile: 'standard_64',
  },
  {
    id: 'lpc_oversize',
    label: 'LPC oversize/custom animation',
    hint: 'Use this for Universal LPC custom-animation catalog layers such as oversize slash/thrust records. Standard engine PNG exports still stay 64x64 unless the target pipeline consumes the catalog geometry metadata.',
    recommendedActionTestId: 'export-full-package-manifest',
    lpcExportProfile: 'oversize',
  },
]

export function isExportTargetProfileId(value: string): value is ExportTargetProfileId {
  return exportTargetProfiles.some((profile) => profile.id === value)
}

export function getExportTargetProfile(value: string): ExportTargetProfile {
  return exportTargetProfiles.find((profile) => profile.id === value) ?? exportTargetProfiles[0]
}

export function getLpcExportProfileForTarget(value: string): LpcExportProfile {
  return getExportTargetProfile(value).lpcExportProfile
}

export function buildRecipeReadiness({ selectedPartIds, partLibrary, layerLabels }: BuildRecipeReadinessInput): RecipeReadiness {
  const selectedIds = layerLabels
    .map((label) => selectedPartIds[label])
    .filter((partId): partId is string => Boolean(partId))
  const selectedParts = selectedIds
    .map((partId) => partLibrary.find((part) => part.part_id === partId))
    .filter((part): part is ExtractedPart => Boolean(part))
  const missingPartCount = selectedIds.length - selectedParts.length
  const reviewedSelectedPartCount = selectedParts.filter((part) => part.reviewed).length
  const unreviewedSelectedPartCount = selectedParts.filter((part) => !part.reviewed).length
  const warningCount = selectedParts.reduce((count, part) => count + part.warnings.length, 0)
  const missingReviewedLayerCount = layerLabels.filter((label) => {
    const selectedPartId = selectedPartIds[label]
    if (!selectedPartId) return true
    return !partLibrary.some((part) => part.part_id === selectedPartId && part.reviewed)
  }).length
  const state: RecipeReadinessState =
    missingPartCount > 0 || missingReviewedLayerCount === layerLabels.length
      ? 'incomplete'
      : unreviewedSelectedPartCount > 0 || warningCount > 0 || missingReviewedLayerCount > 0
        ? 'needs_review'
        : 'ready'

  return {
    selectedPartCount: selectedIds.length,
    reviewedSelectedPartCount,
    unreviewedSelectedPartCount,
    missingReviewedLayerCount,
    warningCount,
    missingPartCount,
    state,
  }
}

export function filterReviewedPartsForLayer({ reviewedParts, label, query, method, selectedPartId }: FilterReviewedPartsInput) {
  const normalizedQuery = query.trim().toLowerCase()
  const matches = reviewedParts.filter((part) => {
    if (part.label !== label) return false
    if (method !== 'all' && part.extraction_method !== method) return false
    if (!normalizedQuery) return true
    const searchable = [
      part.part_id,
      part.character_id,
      part.extraction_method,
      ...part.tags,
      ...part.warnings,
    ].join(' ').toLowerCase()
    return searchable.includes(normalizedQuery)
  })
  const selectedPart = selectedPartId ? reviewedParts.find((part) => part.part_id === selectedPartId && part.label === label) : undefined
  if (selectedPart && !matches.some((part) => part.part_id === selectedPart.part_id)) {
    return [selectedPart, ...matches]
  }
  return matches
}
