import type { AnimationName, Direction, Rect } from './types.ts'

export type SourceFamilyId = 'lpc' | 'sprite_pack' | 'duelyst' | 'custom'
export type WorkspaceTabId = 'create' | 'parts' | 'sources' | 'workstation' | 'batch' | 'ai_apes' | 'export' | 'settings'
export type RecipeModeId = 'lpc_character' | 'sprite_kitbash' | 'duelyst_review'

export type SourceFamily = {
  family_id: SourceFamilyId
  label: string
  role: 'composition' | 'reference' | 'training' | 'review'
  compatible_recipe_modes: RecipeModeId[]
  can_provide_body: boolean
  can_provide_parts: boolean
  can_provide_motion: boolean
  default_tab: WorkspaceTabId
}

export type LpcCredit = {
  file: string
  notes: string
  authors: string[]
  licenses: string[]
  urls: string[]
}

export type LpcRecolor = {
  material: string
  palettes: string[]
}

export type LpcCatalogLayer = {
  layer_id: string
  z_pos: number
  custom_animation?: string
  paths_by_body_type: Record<string, string>
}

export type LpcCatalogItem = {
  item_id: string
  name: string
  type_name: string
  path: string[]
  tags: string[]
  required_tags: string[]
  excluded_tags: string[]
  required_body_types: string[]
  variants: string[]
  animations: string[]
  preview: { row: number; column: number; x_offset: number; y_offset: number }
  match_body_color: boolean
  recolors: LpcRecolor[]
  layers: LpcCatalogLayer[]
  credits: LpcCredit[]
}

export type LpcCategoryNode = {
  id: string
  label: string
  item_ids: string[]
  children: LpcCategoryNode[]
}

export type LpcAlias = {
  item_id: string
  path: string
}

export type LpcPaletteMetadata = {
  definition_count: number
  names: string[]
}

export type LpcCatalog = {
  format: 'pixel_creator_lpc_catalog'
  version: 1
  generated_at: string
  source: {
    repo: string
    reference_root: string
    commit: string | null
    has_upstream_sources: boolean
    has_spritesheets: boolean
    has_sheet_definitions: boolean
    has_palette_definitions: boolean
    has_credits_csv: boolean
  }
  summary: {
    item_count: number
    layer_count: number
    variant_count: number
    credit_count: number
    type_counts: Record<string, number>
  }
  items: Record<string, LpcCatalogItem>
  category_tree: LpcCategoryNode
  aliases: Record<string, LpcAlias>
  palettes: LpcPaletteMetadata
}

export type LpcRecipeSelection = {
  slot_id: string
  item_id: string
  variant: string
  type_name: string
  enabled: boolean
  palette_overrides?: Record<string, string>
}

export type LpcAnimationStatus = 'exact' | 'fallback' | 'missing' | 'unsupported'

export type LpcDrawRecord = {
  record_id: string
  item_id: string
  item_name: string
  variant: string
  type_name: string
  layer_id: string
  z_pos: number
  source_path: string | null
  source_rect: Rect | null
  dest_rect: Rect
  animation_status: LpcAnimationStatus
  requested_animation: AnimationName
  resolved_animation: string | null
  direction: Direction
  frame_index: number
  body_type: string
  credits: LpcCredit[]
  warnings: string[]
}
