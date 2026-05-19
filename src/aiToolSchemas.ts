export type JsonSchema = {
  type: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: string[]
  items?: JsonSchema
  additionalProperties?: boolean
}

export const aiToolSchemas = {
  create_apes_job: {
    type: 'object',
    properties: {
      animation: { type: 'string' },
      directions: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  export_handoff: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['generation_manifest', 'aseprite_reference', 'full_package'] },
    },
    required: ['format'],
    additionalProperties: false,
  },
  queue_pixellab_generation: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      animation: { type: 'string' },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
  activate_rag: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['load', 'rebuild'] },
    },
    additionalProperties: false,
  },
  rag_search: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      purpose: { type: 'string', enum: ['generation_prompt', 'provider_selection', 'review_guidance', 'troubleshooting', 'evaluation'] },
      limit: { type: 'number' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  inspect_current_recipe: {
    type: 'object',
    properties: {
      include_layers: { type: 'boolean' },
      include_missing_animations: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  inspect_live_context: {
    type: 'object',
    properties: {
      include_warnings: { type: 'boolean' },
      include_recent_actions: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  explain_export_blockers: {
    type: 'object',
    properties: { include_fix_steps: { type: 'boolean' } },
    additionalProperties: false,
  },
  inspect_layer_stack: {
    type: 'object',
    properties: { selected_layer: { type: 'string' }, include_order: { type: 'boolean' } },
    additionalProperties: false,
  },
  diagnose_sprite_alignment: {
    type: 'object',
    properties: { animation: { type: 'string' }, direction: { type: 'string' }, layer: { type: 'string' } },
    additionalProperties: false,
  },
  suggest_next_action: {
    type: 'object',
    properties: { goal: { type: 'string' } },
    additionalProperties: false,
  },
  search_assets: {
    type: 'object',
    properties: { query: { type: 'string' }, limit: { type: 'number' } },
    required: ['query'],
    additionalProperties: false,
  },
  open_relevant_panel: {
    type: 'object',
    properties: { panel: { type: 'string', enum: ['fast', 'workstation', 'library', 'batch', 'audit', 'ai', 'apes', 'exports', 'settings'] } },
    required: ['panel'],
    additionalProperties: false,
  },
  compare_current_frame_to_base: {
    type: 'object',
    properties: { animation: { type: 'string' }, direction: { type: 'string' }, frame_index: { type: 'number' } },
    additionalProperties: false,
  },
  validate_current_recipe: {
    type: 'object',
    properties: { include_release_gates: { type: 'boolean' } },
    additionalProperties: false,
  },
  prepare_generation_prompt: {
    type: 'object',
    properties: { target: { type: 'string', enum: ['pixellab', 'apes', 'aseprite', 'lpc', 'duelyst'] }, include_rag_context: { type: 'boolean' } },
    additionalProperties: false,
  },
  inspect_rag_sources: {
    type: 'object',
    properties: { include_private_status: { type: 'boolean' } },
    additionalProperties: false,
  },
  run_project_check: {
    type: 'object',
    properties: {
      check: { type: 'string', enum: ['lint', 'source_hygiene', 'rag_hosted_check', 'ai_tools_tests', 'release_build'] },
    },
    required: ['check'],
    additionalProperties: false,
  },
  check_lpc_compatibility: {
    type: 'object',
    properties: {
      animation: { type: 'string' },
      layers: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  run_lpc_render_matrix_audit: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['sample', 'full'] },
    },
    additionalProperties: false,
  },
  configure_pixellab_bridge: {
    type: 'object',
    properties: {
      endpoint_url: { type: 'string' },
      preferred_model: { type: 'string' },
    },
    additionalProperties: false,
  },
  configure_aseprite_bridge: {
    type: 'object',
    properties: {
      bridge_url: { type: 'string' },
      script_folder: { type: 'string' },
    },
    additionalProperties: false,
  },
  scan_pc_rag_assets: {
    type: 'object',
    properties: {
      dedupe: { type: 'boolean' },
      include_private_sources: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  fetch_web_rag_sources: {
    type: 'object',
    properties: {
      source_set: { type: 'string', enum: ['curated', 'expanded'] },
      dedupe: { type: 'boolean' },
    },
    additionalProperties: false,
  },
} satisfies Record<string, JsonSchema>
