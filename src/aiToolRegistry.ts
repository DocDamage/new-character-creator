import { aiToolSchemas, type JsonSchema } from './aiToolSchemas.ts'

export type AiToolPermissionScope = 'local_tool' | 'download' | 'generation_queue' | 'knowledge'

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
