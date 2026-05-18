import type { RagContextBundle } from './ragTypes'

export type Direction = 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest'

export type AnimationName = 'idle' | 'walk' | 'running_jump' | 'attack' | string
export type SourceFamilyId = 'lpc' | 'sprite_pack' | 'duelyst' | 'custom'
export type RecipeModeId = 'lpc_character' | 'sprite_kitbash' | 'duelyst_review'

export type FrameRef = {
  index: number
  path: string
  file_name: string
  width: number
  height: number
  source_rect?: Rect
  source_name?: string
}

export type AnimationManifest = {
  name: AnimationName
  source_names: string[]
  directions: Partial<Record<Direction, FrameRef[]>>
  preview_gifs: string[]
}

export type CharacterManifest = {
  character_id: string
  display_name: string
  class_type: string
  labels?: Record<string, unknown>
  source_folder: string
  canvas_size: { width: number; height: number }
  directions: Partial<Record<Direction, Record<AnimationName, { frame_count: number; frames: FrameRef[] }>>>
  animations: AnimationManifest[]
  animation_names: string[]
  source_quality_warnings: string[]
  rotation_preview_paths: Array<{ direction: Direction | string; path: string }>
  representative_frame: string
  extraction_status: {
    frame_chopped: boolean
    preset_regions_available: boolean
    connected_pixel_pass_available: boolean
    apes_pass_available: boolean
    manual_cleanup_complete: boolean
  }
}

export type AssetManifest = {
  generated_at: string
  asset_root: string
  total_characters: number
  canonical_directions: Direction[]
  canonical_animations: AnimationName[]
  characters: CharacterManifest[]
}

export type DuelystPackageCandidate = {
  unit_id: string
  display_name: string
  sheet_source_path: string
  sheet_url: string
  sheet_size: { width: number; height: number }
  plist_source_path: string
  estimated_frame_size: { width: number; height: number; occurrences: number; frame_count: number } | null
  animation_names: string[]
  labels?: Record<string, unknown>
  animation_clip_count: number
  controller_count: number
  preview_url: string
  staged_frame_url: string
  staged_frame_size: { width: number; height: number }
  staged_animations?: Record<string, FrameRef[]>
  staged: boolean
  stage_character_id: string
  score: number
  reasons: string[]
  warnings: string[]
}

export type DuelystStagedManifest = {
  generated_at: string
  package_path: string
  character_count: number
  characters: CharacterManifest[]
}

export type DuelystPackageAudit = {
  format?: string
  version?: number
  generated_at: string
  package_path: string
  available: boolean
  extraction_root: string
  total_assets: number
  extension_counts: Record<string, number>
  candidate_units: DuelystPackageCandidate[]
  staged_manifest: DuelystStagedManifest
  findings: string[]
  summary: string
  warnings?: string[]
  label_schema?: Record<string, unknown>
}

export type LpcAssetInventory = {
  format: 'pixel_creator_lpc_asset_inventory'
  generated_at: string
  source: {
    kind: string
    asset_root: string
    upstream_repo: string
    upstream_reference: {
      available: boolean
      root: string
      commit?: string | null
      sheet_definition_count?: number
      spritesheet_png_count?: number
      credits_csv_available?: boolean
    }
  }
  summary: {
    png_count: number
    lpc_grid_count: number
    non_lpc_grid_count: number
    categories: Record<string, number>
    frame_grids: Record<string, number>
    credit_file_count: number
  }
  credit_files: Array<{
    path: string
    excerpt: string
  }>
  sheets: Array<{
    path: string
    category: string
    file_name: string
    width: number
    height: number
    frame_width: number
    frame_height: number
    frame_columns: number | null
    frame_rows: number | null
    lpc_grid: boolean
    tags: string[]
  }>
}

export type PartLabel =
  | 'shadow'
  | 'back_item'
  | 'cloak_back'
  | 'back_arm'
  | 'back_leg'
  | 'torso'
  | 'front_leg'
  | 'front_arm'
  | 'neck'
  | 'head'
  | 'face'
  | 'hair_hat_hood'
  | 'weapon'
  | 'shield'
  | 'accessory'
  | 'aura_effect'
  | 'feet'
  | 'front_hand'
  | 'back_hand'
  | 'legs'

export type Rect = { x: number; y: number; w: number; h: number }

export type ExtractionMethod = 'apes' | 'preset_region' | 'connected_pixel' | 'manual'

export type ComposerLayerSettings = {
  offset: [number, number]
  visible: boolean
  locked: boolean
}

export type PaletteRules = {
  hue_shift: number
  saturation: number
  brightness: number
  team_color: string
}

export type ExtractedPart = {
  part_id: string
  character_id: string
  label: PartLabel
  source_animation: AnimationName
  source_direction: Direction
  source_frame_path?: string
  image_path: string
  mask_path?: string
  image_asset_key?: string
  mask_asset_key?: string
  image_data_url?: string
  mask_data_url?: string
  anchor: { x: number; y: number }
  bounds: Rect
  extraction_method: ExtractionMethod
  compatibility: {
    animations: AnimationName[]
    directions: Direction[]
  }
  reviewed: boolean
  source_family?: SourceFamilyId
  compatible_recipe_modes?: RecipeModeId[]
  tags: string[]
  warnings: string[]
}

export type ApesJob = {
  job_id: string
  character_id: string
  animations: AnimationName[]
  directions: Direction[]
  frame_range: [number, number]
  output_labels: PartLabel[]
  status: 'draft' | 'prepared' | 'running' | 'failed' | 'complete'
  created_at: string
  input_frames: Array<{
    animation: AnimationName
    direction: Direction
    frame_index: number
    path: string
  }>
  logs: string[]
  output_root: string
  failure_details?: string
}

export type ApesFinetuneManifest = {
  format: string
  version?: number
  output_root?: string
  datasets?: Record<string, unknown>
  commands?: Record<string, string>
  warnings?: string[]
}

export type DuelystApesJobBatch = {
  format: string
  source_manifest?: string
  input_root?: string
  job_count: number
  success_count?: number
  failure_count?: number
  filters?: {
    role?: string
    body_class?: string
    limit?: number | null
  }
  jobs: Array<{
    job_id: string
    character_id: string
    job_path: string
    output_root: string
    training_role?: string | null
    body_class?: string | null
  }>
  run_results?: Array<Record<string, unknown>>
  warnings?: string[]
  job_configs?: ApesJob[]
}

export type ApesBridgeStatus = {
  status: ApesJob['status']
  logs: string[]
  failure_details?: string
}

export type ApesPreflightReport = {
  ready: boolean
  repo_root: string
  python: {
    version: string
    executable: string
  }
  paths: {
    checkpoint: string
    vendor_root: string
    test_folder: string
  }
  data: {
    exists: boolean
    character_count: number
    sample_character: string | null
    sample_png_count: number
    sample_mask_count: number
  }
  modules: Record<string, boolean>
  module_errors: Record<string, string>
  torch: {
    installed: boolean
    version?: string | null
    cuda_available: boolean
    error?: string
    cuda_error?: string
  }
  tools: {
    conda: string | null
    mamba: string | null
    micromamba: string | null
    nvidia_smi: string | null
  }
  findings: string[]
}

export type ApesReport = {
  job_id: string
  status?: 'complete' | 'failed' | 'running'
  masks: Array<{
    label: PartLabel
    path: string
    image_path?: string
    bounds?: Rect
    confidence: number
    reviewed: boolean
    warnings?: string[]
  }>
  semantic_mapping: Record<string, PartLabel>
  warnings: string[]
}

export type ApesOutputInventory = {
  generated_at: string
  output_root: string
  input_root: string
  report_count: number
  summary: {
    complete_reports: number
    empty_reports: number
    failed_outputs: number
    needs_review: number
    reviewed_reports: number
    label_counts: Partial<Record<PartLabel, number>> & Record<string, number | undefined>
  }
  reports: Array<{
    job_id: string
    status: string
    character_id: string | null
    output_dir: string
    report_path: string
    input_job_path: string | null
    mask_count: number
    labels: string[]
    missing_labels: string[]
    low_confidence_labels: string[]
    average_confidence: number | null
    min_confidence: number | null
    reviewed_count: number
    review_state: 'empty' | 'reviewed' | 'unreviewed' | 'mixed'
    warning_count: number
    warnings: string[]
    needs_review: boolean
  }>
  failed_outputs: Array<{
    job_id: string
    status: string
    character_id: string | null
    output_dir: string
    status_path: string
    input_job_path: string | null
    failure_kind: string
    failure_details: string
    logs: string[]
    needs_review: boolean
  }>
}

export type KitbashLayer = {
  label: PartLabel
  source_character: string
  source_part_id?: string
  offset: [number, number]
  visible: boolean
  locked: boolean
  extraction_method: ExtractionMethod
}

export type KitbashRecipe = {
  character_id: string
  recipe_mode?: RecipeModeId
  source_family?: SourceFamilyId
  base_canvas: [number, number]
  base_character: string
  animation_source_character?: string
  lpc_selections?: Record<string, {
    slot_id: string
    item_id: string
    variant: string
    type_name: string
    enabled: boolean
    palette_overrides?: Record<string, string>
  }>
  layers: KitbashLayer[]
  palette: PaletteRules
  animation_coverage: AnimationName[]
  export_targets: string[]
}

export type LayerBundleSource = {
  path?: string
  url?: string
  data_url?: string
  bounds?: Rect
  anchor?: { x: number; y: number }
}

export type LayerBundlePart = {
  id?: string
  label: PartLabel
  source_character?: string
  animation?: AnimationName
  direction?: Direction
  tags?: string[]
  warnings?: string[]
  image: LayerBundleSource
  mask?: LayerBundleSource
}

export type LayerBundleManifest = {
  format: 'pixel_creator_layer_bundle'
  version: number
  bundle_id: string
  generated_at?: string
  source?: string
  parts: LayerBundlePart[]
}

export type VariationPreset = {
  preset_id: string
  name: string
  base_character: string
  selected_part_ids: Partial<Record<PartLabel, string>>
  selected_parts: Partial<Record<PartLabel, string>>
  layer_settings: Partial<Record<PartLabel, ComposerLayerSettings>>
  palette: string
  palette_rules: Omit<PaletteRules, 'team_color'>
  tags: string[]
  saved_at: string
}

export type SourceAlphaAnalysis = {
  format: 'pixel_creator_source_alpha_analysis'
  version: number
  width: number
  height: number
  opaque_pixel_count: number
  alpha_bounds: Rect | null
  floor_y: number | null
  pivot: { x: number; y: number } | null
  warnings: string[]
}

export type GenerationManifest = {
  format: 'pixel_creator_generation_manifest'
  version: number
  generated_at: string
  style_notes: string
  source_character: string
  frame_references: Array<{
    animation: AnimationName
    direction: Direction
    frame_index: number
    path: string
  }>
  output_labels: PartLabel[]
  filename_template: string
  layer_bundle_targets: string[]
}

export type TrainingSourceKind =
  | 'dropped'
  | 'generated'
  | 'baked'
  | 'reference'
  | 'cleanup-pair'
  | 'missing-animation'
  | 'final-custom-animation'

export type TrainingReviewState = 'draft' | 'needs_changes' | 'ready_for_review' | 'approved'
export type TrainingValidationLevel = 'red' | 'yellow' | 'green'

export type TrainingValidationFinding = {
  level: TrainingValidationLevel
  code: string
  message: string
}

export type TrainingFrameLayout = {
  columns: number
  rows: number
  frame_count: number
}

export type TrainingFrameSize = {
  width: number
  height: number
}

export type TrainingSourceFileDescriptor = {
  source_name: string
  kind?: TrainingSourceKind
  animation?: AnimationName
  direction?: Direction
  frame_index?: number
  width?: number
  height?: number
  has_transparency?: boolean
  pivot?: { x: number; y: number } | null
  labels?: string[]
  source_family?: SourceFamilyId
}

export type TrainingSourceFamilyCompatibility = {
  requested: SourceFamilyId
  detected: SourceFamilyId[]
  compatible: boolean
  notes: string[]
}

export type TrainingProvenance = {
  created_at: string
  created_by: string
  source?: string
  source_draft_id?: string
  approved_at?: string
  approved_by?: string
}

export type TrainingInboxDraft = {
  draft_id: string
  source_kind: TrainingSourceKind
  source_names: string[]
  goal: string
  animation: AnimationName
  directions: Direction[]
  frame_layout: TrainingFrameLayout
  frame_size: TrainingFrameSize
  export_profile: string
  source_family_compatibility: TrainingSourceFamilyCompatibility
  validation_findings: TrainingValidationFinding[]
  review_state: Exclude<TrainingReviewState, 'approved'>
  provenance: TrainingProvenance
}

export type TrainingLibraryRecord = Omit<TrainingInboxDraft, 'draft_id' | 'review_state' | 'provenance'> & {
  record_id: string
  draft_id: string
  review_state: 'approved'
  provenance: TrainingProvenance & {
    source_draft_id: string
    approved_at: string
    approved_by: string
  }
}

export type AiProviderType = 'pixellab' | 'manual_handoff' | 'custom'

export type AiProviderConfig = {
  provider_id: string
  name: string
  type: AiProviderType
  configured: boolean
  capabilities?: {
    text_to_sprite: boolean
    image_to_animation: boolean
    animation_cleanup: boolean
    direct_api: boolean
    mcp_available: boolean
  }
  manual_handoff: {
    enabled: boolean
    status: 'available' | 'required' | 'exported' | 'imported'
    exported_at?: string
    imported_at?: string
    notes?: string
  }
  settings: Record<string, string | number | boolean | null>
}

export type GenerationJobStatus = 'draft' | 'handoff_ready' | 'exported' | 'running' | 'failed' | 'complete' | 'review_required' | 'reviewed'

export type GenerationJob = {
  job_id: string
  created_at: string
  updated_at: string
  source_queue_item_ids: string[]
  source_queue_item_labels: string[]
  recipe_id: string
  character_id: string
  target_animation: AnimationName
  target_profile: string
  prompt: string
  settings: Record<string, string | number | boolean | null>
  provider: AiProviderConfig
  rag_context?: RagContextBundle
  status: GenerationJobStatus
  logs: string[]
  outputs: Array<{
    output_id: string
    queue_item_id: string
    label: string
    animation: AnimationName
    profile: string
    uri: string | null
    reviewed: boolean
    auto_selected: false
    selected_part_id: null
    release_blocked: boolean
  }>
  provenance: {
    source: 'missing_animation_queue'
    queue_recipe_id: string
    queue_item_count: number
    affected_frame_count: number
    warnings: string[]
  }
  review_gate: {
    required: true
    status: 'blocked' | 'ready_for_review' | 'approved' | 'rejected'
    release_blocked: boolean
    outputs_auto_selected: false
    reviewed_at?: string
    reviewer?: string
    notes?: string
  }
}
