import type { AnimationName, Direction } from './types.ts'
import type { LpcCatalog, LpcDrawRecord, LpcRecipeSelection } from './lpcCatalog.ts'
import { resolveLpcLayerAsset, type LpcExportProfile } from './lpcAssetResolver.ts'

export type BuildLpcDrawRecordsOptions = {
  catalog: LpcCatalog
  selections: Record<string, LpcRecipeSelection>
  bodyType: string
  animation: AnimationName
  direction: Direction
  frameIndex: number
  availablePaths?: ReadonlySet<string>
  exportProfile?: LpcExportProfile
}

export function buildLpcDrawRecords({
  catalog,
  selections,
  bodyType,
  animation,
  direction,
  frameIndex,
  availablePaths,
  exportProfile = 'standard_64',
}: BuildLpcDrawRecordsOptions): LpcDrawRecord[] {
  const enabledSelections = Object.values(selections).filter((selection) => selection.enabled)
  const selectedTags = new Set(enabledSelections.flatMap((selection) => {
    const item = catalog.items[selection.item_id]
    return item ? [...item.tags, item.type_name] : []
  }))
  const records: LpcDrawRecord[] = []

  for (const selection of enabledSelections) {
    const item = catalog.items[selection.item_id]
    if (!item) continue
    const compatibilityWarnings = compatibilityWarningsFor(item.required_tags, item.excluded_tags, selectedTags)
    for (const layer of item.layers) {
      const resolved = resolveLpcLayerAsset({
        item,
        layer,
        variant: selection.variant || item.variants[0] || '',
        bodyType,
        animation,
        direction,
        frameIndex,
        availablePaths,
        exportProfile,
      })
      records.push({
        record_id: `${selection.slot_id}:${item.item_id}:${layer.layer_id}`,
        item_id: item.item_id,
        item_name: item.name,
        variant: selection.variant || item.variants[0] || '',
        type_name: item.type_name,
        layer_id: layer.layer_id,
        z_pos: layer.z_pos,
        source_path: resolved.source_path,
        source_rect: resolved.source_rect,
        dest_rect: resolved.dest_rect,
        animation_status: compatibilityWarnings.length > 0 ? 'unsupported' : resolved.animation_status,
        requested_animation: animation,
        resolved_animation: resolved.resolved_animation,
        direction,
        frame_index: frameIndex,
        body_type: resolved.body_type,
        credits: item.credits,
        warnings: [...compatibilityWarnings, ...resolved.warnings],
      })
    }
  }

  return records.sort((left, right) =>
    left.z_pos - right.z_pos ||
    left.item_id.localeCompare(right.item_id) ||
    left.layer_id.localeCompare(right.layer_id),
  )
}

function compatibilityWarningsFor(requiredTags: string[], excludedTags: string[], selectedTags: ReadonlySet<string>) {
  const warnings: string[] = []
  for (const tag of requiredTags) {
    if (!selectedTags.has(tag)) warnings.push(`Requires ${tag}.`)
  }
  for (const tag of excludedTags) {
    if (selectedTags.has(tag)) warnings.push(`Cannot be combined with ${tag}.`)
  }
  return warnings
}
