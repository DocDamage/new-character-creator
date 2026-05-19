import { buildRagContextBundle } from './ragIndex.ts'
import { parseAiRequestIntent, summarizeAiIntent } from './aiIntent.ts'
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
  const intent = parseAiRequestIntent(options.request)
  const provider = chooseAiProvider(options.providers, intent.providerHint)
  const ragBundle = options.ragIndex
    ? buildRagContextBundle(options.ragIndex, {
      query: `${options.request} ${summarizeAiIntent(intent)} ${options.selectedCharacter.display_name} ${options.recipe?.recipe_mode ?? ''}`,
      purpose: 'generation_prompt',
      limit: 5,
    })
    : null
  const proposals = proposeTools(options, intent)
  const content = [
    `Plan for "${options.request.trim()}".`,
    `Intent: ${summarizeAiIntent(intent)}.`,
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

export function chooseAiProvider(providers: AiProviderConnection[], providerHint?: string) {
  const enabled = providers.filter((provider) => provider.enabled && (provider.secret_session_set || provider.secret_storage === 'none'))
  if (providerHint) {
    const hinted = enabled.find((provider) => provider.provider_id === providerHint || provider.type === providerHint)
    if (hinted) return hinted
    if (providerHint === 'local') {
      const local = enabled.find((provider) => provider.type === 'ollama' || provider.type === 'lm_studio')
      if (local) return local
    }
  }
  return enabled[0] ?? null
}

function proposeTools(options: AiAgentRequest, intent = parseAiRequestIntent(options.request)): AiToolProposal[] {
  const proposals: AiToolProposal[] = []
  if (intent.actions.includes('segment')) {
    proposals.push(makeProposal('create_apes_job', { animation: intent.animations[0] ?? options.recipe?.animation_coverage[0] ?? 'idle', layers: intent.layers }))
  }
  if (intent.actions.includes('generate')) {
    proposals.push(makeProposal('queue_pixellab_generation', { prompt: options.request, animation: intent.animations[0] ?? options.recipe?.animation_coverage[0] ?? 'idle', layers: intent.layers }))
  }
  if (intent.actions.includes('export')) {
    proposals.push(makeProposal('export_handoff', { format: intent.outputFormat ?? 'generation_manifest' }))
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
