import { aiToolSchemas, type JsonSchema } from './aiToolSchemas.ts'

export type AiToolPermissionScope = 'static_read' | 'local_tool' | 'download' | 'generation_queue' | 'knowledge'

export type AiToolDefinition = {
  tool_id: keyof typeof aiToolSchemas
  label: string
  description: string
  permission_scope: AiToolPermissionScope
  input_schema: JsonSchema
}

export type AiToolProposal = {
  proposal_id: string
  tool_id: AiToolDefinition['tool_id']
  label: string
  permission_scope: AiToolPermissionScope
  input: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'complete' | 'failed'
  result?: string
}

export const aiToolRegistry: AiToolDefinition[] = [
  {
    tool_id: 'create_apes_job',
    label: 'Create APES job',
    description: 'Prepare a reviewed segmentation job from the current character and recipe.',
    permission_scope: 'local_tool',
    input_schema: aiToolSchemas.create_apes_job,
  },
  {
    tool_id: 'queue_pixellab_generation',
    label: 'Queue PixelLab generation',
    description: 'Create a missing-animation generation handoff for PixelLab review.',
    permission_scope: 'generation_queue',
    input_schema: aiToolSchemas.queue_pixellab_generation,
  },
  {
    tool_id: 'activate_rag',
    label: 'Activate RAG',
    description: 'Load or rebuild the local project knowledge index for cited AI context.',
    permission_scope: 'knowledge',
    input_schema: aiToolSchemas.activate_rag,
  },
  {
    tool_id: 'rag_search',
    label: 'Search RAG',
    description: 'Search the loaded knowledge index and return cited project context.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.rag_search,
  },
  {
    tool_id: 'inspect_current_recipe',
    label: 'Inspect current recipe',
    description: 'Summarize selected character, recipe layers, missing animations, and blockers.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.inspect_current_recipe,
  },
  {
    tool_id: 'inspect_live_context',
    label: 'Inspect live context',
    description: 'Summarize the current screen, selected frame, layer, recipe readiness, queues, warnings, and tool mode.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.inspect_live_context,
  },
  {
    tool_id: 'explain_export_blockers',
    label: 'Explain export blockers',
    description: 'Explain release/export blockers from recipe readiness, generation jobs, and current export state.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.explain_export_blockers,
  },
  {
    tool_id: 'inspect_layer_stack',
    label: 'Inspect layer stack',
    description: 'Summarize current layer order, selected layer, selected part/source, and overlay/replacement risks.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.inspect_layer_stack,
  },
  {
    tool_id: 'diagnose_sprite_alignment',
    label: 'Diagnose sprite alignment',
    description: 'Inspect current frame, layer, part options, recipe warnings, and known geometry risks.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.diagnose_sprite_alignment,
  },
  {
    tool_id: 'suggest_next_action',
    label: 'Suggest next action',
    description: 'Recommend the next concrete production step from live context and blockers.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.suggest_next_action,
  },
  {
    tool_id: 'search_assets',
    label: 'Search local assets',
    description: 'Search local RAG asset inventory for matching sprites, sheets, animations, or references.',
    permission_scope: 'local_tool',
    input_schema: aiToolSchemas.search_assets,
  },
  {
    tool_id: 'open_relevant_panel',
    label: 'Open relevant panel',
    description: 'Navigate to the app panel most relevant to the requested fix or workflow.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.open_relevant_panel,
  },
  {
    tool_id: 'compare_current_frame_to_base',
    label: 'Compare frame to base',
    description: 'Summarize current composite frame against base/source context for visual mismatch triage.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.compare_current_frame_to_base,
  },
  {
    tool_id: 'validate_current_recipe',
    label: 'Validate current recipe',
    description: 'Run a structured current-recipe readiness and release-gate validation summary.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.validate_current_recipe,
  },
  {
    tool_id: 'prepare_generation_prompt',
    label: 'Prepare generation prompt',
    description: 'Build a PixelLab/APES-ready prompt from live context, selected layer, missing animations, and RAG status.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.prepare_generation_prompt,
  },
  {
    tool_id: 'inspect_rag_sources',
    label: 'Inspect RAG sources',
    description: 'Summarize active RAG source counts, hosted/local mode, and whether citations are available.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.inspect_rag_sources,
  },
  {
    tool_id: 'run_project_check',
    label: 'Run project check',
    description: 'Run an approved local project check such as lint, source hygiene, hosted RAG check, AI tool tests, or release build.',
    permission_scope: 'local_tool',
    input_schema: aiToolSchemas.run_project_check,
  },
  {
    tool_id: 'check_lpc_compatibility',
    label: 'Check LPC compatibility',
    description: 'Check selected layers and animation requests against loaded LPC manifests.',
    permission_scope: 'static_read',
    input_schema: aiToolSchemas.check_lpc_compatibility,
  },
  {
    tool_id: 'run_lpc_render_matrix_audit',
    label: 'Run LPC render matrix audit',
    description: 'Run the local exhaustive LPC geometry and render matrix audit.',
    permission_scope: 'local_tool',
    input_schema: aiToolSchemas.run_lpc_render_matrix_audit,
  },
  {
    tool_id: 'configure_pixellab_bridge',
    label: 'Configure PixelLab bridge',
    description: 'Open the guided setup path for PixelLab endpoint and model settings.',
    permission_scope: 'local_tool',
    input_schema: aiToolSchemas.configure_pixellab_bridge,
  },
  {
    tool_id: 'configure_aseprite_bridge',
    label: 'Configure Aseprite bridge',
    description: 'Open the guided setup path for Aseprite bridge URL and scripts.',
    permission_scope: 'local_tool',
    input_schema: aiToolSchemas.configure_aseprite_bridge,
  },
  {
    tool_id: 'scan_pc_rag_assets',
    label: 'Scan PC RAG assets',
    description: 'Scan approved local folders for deduplicated private RAG source candidates.',
    permission_scope: 'local_tool',
    input_schema: aiToolSchemas.scan_pc_rag_assets,
  },
  {
    tool_id: 'fetch_web_rag_sources',
    label: 'Fetch web RAG sources',
    description: 'Download curated public reference pages for local RAG ingestion.',
    permission_scope: 'download',
    input_schema: aiToolSchemas.fetch_web_rag_sources,
  },
  {
    tool_id: 'export_handoff',
    label: 'Export handoff',
    description: 'Download a release-safe JSON handoff for external tools.',
    permission_scope: 'download',
    input_schema: aiToolSchemas.export_handoff,
  },
]

export function getAiToolDefinition(toolId: string) {
  return aiToolRegistry.find((tool) => tool.tool_id === toolId) ?? null
}
