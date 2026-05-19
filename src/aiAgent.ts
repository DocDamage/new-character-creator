import { buildRagContextBundle } from './ragIndex.ts'
import { makeAiStudioMessage } from './aiWorkspace.ts'
import { aiToolRegistry, type AiToolProposal } from './aiToolRegistry.ts'
import type { RagIndex } from './ragTypes.ts'
import type { AiProviderConnection, AiStudioMessage, CharacterManifest, KitbashRecipe, ToolConnectionSettings } from './types.ts'

export type AiAgentRequest = {
  request: string
  selectedCharacter: CharacterManifest
  recipe: KitbashRecipe | null
  ragIndex: RagIndex | null
  providers: AiProviderConnection[]
  tools: ToolConnectionSettings
  lpcPublished: boolean
  localToolsAvailable: boolean
}

export function buildAiAgentReply(options: AiAgentRequest): AiStudioMessage {
  const provider = chooseProvider(options.providers)
  const ragBundle = options.ragIndex
    ? buildRagContextBundle(options.ragIndex, {
      query: `${options.request} ${options.selectedCharacter.display_name} ${options.recipe?.recipe_mode ?? ''}`,
      purpose: 'generation_prompt',
      limit: 5,
    })
    : null
  const proposals = proposeTools(options)
  const content = [
    `Plan for "${options.request.trim()}".`,
    `Provider route: ${provider ? `${provider.name} via ${provider.local_proxy_required ? 'local proxy' : 'local endpoint'}` : 'manual planning until a provider is enabled'}.`,
    `Current character: ${options.selectedCharacter.display_name}.`,
    `Tool mode: ${options.localToolsAvailable ? 'local approvals available' : 'static handoff only'}.`,
    ragBundle ? `Citations: ${ragBundle.citations.map((citation) => citation.title).join('; ')}.` : 'Citations: RAG index not loaded.',
    proposals.length > 0 ? `Pending approvals: ${proposals.map((proposal) => proposal.label).join(', ')}.` : 'No tool approval is needed for this reply.',
    'Recommended next actions: review citations, approve any proposed tool calls, then export or import generated output for manual review.',
  ].join('\n')

  return makeAiStudioMessage('assistant', content, {
    citations: ragBundle?.citations ?? [],
    tool_hints: proposals.map((proposal) => `${proposal.permission_scope}:${proposal.tool_id}`),
    tool_proposals: proposals,
  })
}

export function applyApprovedToolResult(message: AiStudioMessage, proposalId: string, result: string): AiStudioMessage {
  return {
    ...message,
    tool_proposals: message.tool_proposals?.map((proposal) => proposal.proposal_id === proposalId
      ? { ...proposal, status: 'complete', result }
      : proposal),
  }
}

function chooseProvider(providers: AiProviderConnection[]) {
  return providers.find((provider) => provider.enabled && (provider.secret_session_set || provider.secret_storage === 'none')) ?? null
}

function proposeTools(options: AiAgentRequest): AiToolProposal[] {
  const request = options.request.toLowerCase()
  const proposals: AiToolProposal[] = []
  if (request.includes('apes') || request.includes('segment')) {
    proposals.push(makeProposal('create_apes_job', { animation: options.recipe?.animation_coverage[0] ?? 'idle' }))
  }
  if (request.includes('pixellab') || request.includes('missing animation')) {
    proposals.push(makeProposal('queue_pixellab_generation', { prompt: options.request, animation: options.recipe?.animation_coverage[0] ?? 'idle' }))
  }
  if (request.includes('export') || request.includes('aseprite')) {
    proposals.push(makeProposal('export_handoff', { format: request.includes('aseprite') ? 'aseprite_reference' : 'generation_manifest' }))
  }
  return proposals
}

function makeProposal(toolId: AiToolProposal['tool_id'], input: Record<string, unknown>): AiToolProposal {
  const definition = aiToolRegistry.find((tool) => tool.tool_id === toolId)
  if (!definition) throw new Error(`Unknown AI tool: ${toolId}`)
  return {
    proposal_id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tool_id: toolId,
    label: definition.label,
    permission_scope: definition.permission_scope,
    input,
    status: 'pending',
  }
}
