import type { AnimationName, Direction, FrameRef, KitbashRecipe, Rect } from './types.ts'
import type { LpcCatalog, LpcDrawRecord } from './lpcCatalog.ts'
import { getLpcExportProfileForTarget, type ExportTargetProfileId } from './creatorCockpit.ts'
import { buildLpcDrawRecords } from './lpcComposition.ts'
import { localFsPathPrefix } from './localToolsClient.ts'
import type { LpcExportProfile } from './lpcAssetResolver.ts'

export type LpcRenderRecord = {
  kind: 'catalog' | 'base_body'
  z_pos: number
  source_path: string | null
  source_rect: Rect | null
  dest_rect: Rect
  warnings: string[]
  draw_record?: LpcDrawRecord
}

export type LpcRenderPlan = {
  records: LpcRenderRecord[]
  warnings: string[]
  export_profile: LpcExportProfile
}

type BuildLpcRenderPlanOptions = {
  catalog: LpcCatalog
  recipe: KitbashRecipe
  bodyType: string
  baseFrame?: Pick<FrameRef, 'path' | 'source_rect'>
  animation: AnimationName
  direction: Direction
  frameIndex: number
  exportProfile?: LpcExportProfile
  exportTargetProfile?: ExportTargetProfileId
}

const bodyZPosition = 50
const fullFrameRect: Rect = { x: 0, y: 0, w: 64, h: 64 }

export function buildLpcRenderPlan({
  catalog,
  recipe,
  bodyType,
  baseFrame,
  animation,
  direction,
  frameIndex,
  exportProfile,
  exportTargetProfile,
}: BuildLpcRenderPlanOptions): LpcRenderPlan {
  const lpcExportProfile = exportProfile ?? (exportTargetProfile ? getLpcExportProfileForTarget(exportTargetProfile) : 'standard_64')
  const catalogRecords = buildLpcDrawRecords({
    catalog,
    selections: recipe.lpc_selections ?? {},
    bodyType,
    animation,
    direction,
    frameIndex,
    exportProfile: lpcExportProfile,
  }).map((record): LpcRenderRecord => ({
    kind: 'catalog',
    z_pos: record.z_pos,
    source_path: record.source_path ? toLocalReferenceUrl(catalog.source.reference_root, record.source_path) : null,
    source_rect: record.source_rect,
    dest_rect: record.dest_rect,
    warnings: record.warnings,
    draw_record: record,
  }))

  const records = [
    ...catalogRecords,
    ...(baseFrame ? [{
      kind: 'base_body' as const,
      z_pos: bodyZPosition,
      source_path: baseFrame.path,
      source_rect: baseFrame.source_rect ?? null,
      dest_rect: fullFrameRect,
      warnings: [],
    }] : []),
  ].sort((left, right) =>
    left.z_pos - right.z_pos ||
    kindScore(left.kind) - kindScore(right.kind) ||
    (left.draw_record?.record_id ?? '').localeCompare(right.draw_record?.record_id ?? ''),
  )

  return {
    records,
    warnings: records.flatMap((record) => record.warnings),
    export_profile: lpcExportProfile,
  }
}

export function hasCatalogRenderSelections(recipe: KitbashRecipe | null | undefined, catalog: LpcCatalog | null | undefined) {
  return Boolean(catalog && recipe?.recipe_mode === 'lpc_character' && recipe.lpc_selections && Object.values(recipe.lpc_selections).some((selection) => selection.enabled))
}

function toLocalReferenceUrl(referenceRoot: string, sourcePath: string) {
  const normalizedRoot = referenceRoot.replaceAll('\\', '/').replace(/\/+$/, '')
  const normalizedSource = sourcePath.replaceAll('\\', '/').replace(/^\/+/, '')
  return `${localFsPathPrefix()}${normalizedRoot}/${normalizedSource}`
}

function kindScore(kind: LpcRenderRecord['kind']) {
  return kind === 'base_body' ? 1 : 0
}
