export type Direction = 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest'

export type AnimationName = 'idle' | 'walk' | 'running_jump' | 'attack' | string

export type FrameRef = {
  index: number
  path: string
  file_name: string
  width: number
  height: number
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
  base_canvas: [number, number]
  base_character: string
  layers: KitbashLayer[]
  palette: PaletteRules
  animation_coverage: AnimationName[]
  export_targets: string[]
}
