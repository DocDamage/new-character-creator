import { buildRagContextBundle } from './ragIndex.ts'
import { parseAiRequestIntent, summarizeAiIntent } from './aiIntent.ts'
import { makeAiStudioMessage } from './aiWorkspace.ts'
import { aiToolRegistry, type AiToolProposal } from './aiToolRegistry.ts'
import { summarizeAiActivitySnapshot, type AiActivitySnapshot } from './aiActivityContext.ts'
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
  activitySnapshot?: AiActivitySnapshot
}

export function buildAiAgentReply(options: AiAgentRequest): AiStudioMessage {
  const intent = parseAiRequestIntent(options.request)
  const provider = chooseAiProvider(options.providers, intent.providerHint)
  const ragBundle = options.ragIndex
    ? buildRagContextBundle(options.ragIndex, {
      query: `${options.request} ${summarizeAiIntent(intent)} ${options.selectedCharacter.display_name} ${options.recipe?.recipe_mode ?? ''} ${options.activitySnapshot ? summarizeAiActivitySnapshot(options.activitySnapshot) : ''}`,
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
    `Tool tiers: static-safe tools can inspect loaded app data on GitHub Pages; local-only tools require the local bridge and explicit approval.`,
    options.activitySnapshot ? `Live activity: ${summarizeAiActivitySnapshot(options.activitySnapshot)}.` : 'Live activity: limited to selected character and recipe props.',
    options.activitySnapshot?.warnings.length ? `Visible blockers/warnings: ${options.activitySnapshot.warnings.join(' | ')}.` : '',
    ragBundle ? `Citations: ${ragBundle.citations.map((citation) => citation.title).join('; ')}.` : 'Citations: RAG index not loaded.',
    `Available tools: ${aiToolRegistry.map((tool) => `${tool.tool_id} (${tool.permission_scope})`).join(', ')}.`,
    proposals.length > 0 ? `Pending approvals: ${proposals.map((proposal) => proposal.label).join(', ')}.` : 'No tool approval is needed for this reply.',
    'Recommended next actions: review citations, approve any proposed tool calls, then export or import generated output for manual review.',
  ].filter(Boolean).join('\n')

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
  const lowerRequest = options.request.toLowerCase()
  if (options.activitySnapshot && /\b(what am i|right now|current work|doing now|why .*blocked|what should i)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('inspect_live_context', { include_warnings: true, include_recent_actions: true }))
  }
  if (/\b(export blockers?|blocked|release blockers?|why .*export)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('explain_export_blockers', { include_fix_steps: true }))
  }
  if (/\b(layer stack|layer order|z-order|z order|render order)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('inspect_layer_stack', { selected_layer: options.activitySnapshot?.layer.selected_layer ?? intent.layers[0] ?? 'current', include_order: true }))
  }
  if (/\b(align|alignment|line up|lining up|misaligned|sprite alignment)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('diagnose_sprite_alignment', {
      animation: intent.animations[0] ?? options.activitySnapshot?.frame.animation ?? 'idle',
      direction: options.activitySnapshot?.frame.direction ?? 'south',
      layer: options.activitySnapshot?.layer.selected_layer ?? intent.layers[0] ?? 'current',
    }))
  }
  if (/\b(next action|what should i|next step|do next)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('suggest_next_action', { goal: options.request }))
  }
  if (/\b(search assets?|find assets?|asset search|look for .*assets?|find .*assets?|search .*assets?|search .*helmets?|find .*helmets?|look for .*helmets?|search .*sheets?|find .*sheets?)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('search_assets', { query: options.request, limit: 8 }))
  }
  if (/\b(open|go to|take me to|show me)\b/.test(lowerRequest) && /\b(fast creator|workstation|part library|library|batch|asset audit|audit|apes|exports?|settings|ai studio)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('open_relevant_panel', { panel: inferPanel(lowerRequest) }))
  }
  if (/\b(compare .*base|base .*compare|current frame to base|frame .*base)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('compare_current_frame_to_base', {
      animation: options.activitySnapshot?.frame.animation ?? intent.animations[0] ?? 'idle',
      direction: options.activitySnapshot?.frame.direction ?? 'south',
      frame_index: options.activitySnapshot?.frame.frame_index ?? 0,
    }))
  }
  if (/\b(validate .*recipe|recipe validation|check .*recipe|current recipe)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('validate_current_recipe', { include_release_gates: true }))
  }
  if (/\b(generation prompt|prepare prompt|pixellab prompt|apes prompt|aseprite prompt|lpc prompt|duelyst prompt)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('prepare_generation_prompt', { target: inferGenerationPromptTarget(lowerRequest), include_rag_context: Boolean(options.ragIndex) }))
  }
  if (/\b(rag sources?|what .*rag knows|inspect rag|rag status|citations?)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('inspect_rag_sources', { include_private_status: options.localToolsAvailable }))
  }
  if (/\b(run .*check|project check|run lint|lint|source hygiene|hosted rag check|release build|ai tool tests?)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('run_project_check', { check: inferProjectCheck(lowerRequest) }))
  }
  if (intent.actions.includes('rag_search') && !lowerRequest.includes('activate')) {
    proposals.push(makeProposal('rag_search', {
      query: options.request,
      purpose: intent.actions.includes('review') || intent.actions.includes('compatibility') ? 'review_guidance' : 'generation_prompt',
      limit: 5,
    }))
  }
  if (intent.actions.includes('inspect')) {
    proposals.push(makeProposal('inspect_current_recipe', { include_layers: true, include_missing_animations: true }))
  }
  if (intent.actions.includes('compatibility')) {
    proposals.push(makeProposal('check_lpc_compatibility', {
      animation: intent.animations[0] ?? options.recipe?.animation_coverage[0] ?? 'idle',
      layers: intent.layers,
    }))
  }
  if (intent.actions.includes('audit')) {
    proposals.push(makeProposal('run_lpc_render_matrix_audit', { scope: lowerRequest.includes('sample') ? 'sample' : 'full' }))
  }
  if (intent.actions.includes('segment')) {
    proposals.push(makeProposal('create_apes_job', { animation: intent.animations[0] ?? options.recipe?.animation_coverage[0] ?? 'idle', layers: intent.layers }))
  }
  if (intent.actions.includes('generate')) {
    proposals.push(makeProposal('queue_pixellab_generation', { prompt: options.request, animation: intent.animations[0] ?? options.recipe?.animation_coverage[0] ?? 'idle', layers: intent.layers }))
  }
  if ((intent.actions.includes('rag_search') && lowerRequest.includes('activate')) || (lowerRequest.includes('activate') && lowerRequest.includes('rag'))) {
    proposals.push(makeProposal('activate_rag', { mode: options.ragIndex ? 'load' : 'rebuild' }))
  }
  if (intent.actions.includes('bridge_setup')) {
    if (lowerRequest.includes('pixellab')) {
      proposals.push(makeProposal('configure_pixellab_bridge', {
        endpoint_url: options.tools.pixellab.endpoint_url,
        preferred_model: options.tools.pixellab.preferred_model,
      }))
    }
    if (lowerRequest.includes('aseprite')) {
      proposals.push(makeProposal('configure_aseprite_bridge', {
        bridge_url: options.tools.aseprite.bridge_url,
        script_folder: options.tools.aseprite.script_folder,
      }))
    }
  }
  if (intent.actions.includes('source_ingestion')) {
    if (/\b(scan pc|pc assets|feed (the )?rag)\b/.test(lowerRequest)) {
      proposals.push(makeProposal('scan_pc_rag_assets', { dedupe: true, include_private_sources: true }))
    }
    if (/\b(web rag|fetch web|download sources|sources)\b/.test(lowerRequest)) {
      proposals.push(makeProposal('fetch_web_rag_sources', { source_set: 'expanded', dedupe: true }))
    }
  }
  if (intent.actions.includes('export') && !/\b(blockers?|blocked|why .*export|explain .*export)\b/.test(lowerRequest)) {
    proposals.push(makeProposal('export_handoff', { format: intent.outputFormat ?? 'generation_manifest' }))
  }
  return proposals
}

function inferPanel(request: string) {
  if (request.includes('fast creator')) return 'fast'
  if (request.includes('workstation')) return 'workstation'
  if (request.includes('part library') || request.includes('library')) return 'library'
  if (request.includes('batch')) return 'batch'
  if (request.includes('asset audit') || request.includes('audit')) return 'audit'
  if (request.includes('apes')) return 'apes'
  if (request.includes('export')) return 'exports'
  if (request.includes('setting') || request.includes('bridge')) return 'settings'
  return 'ai'
}

function inferGenerationPromptTarget(request: string) {
  if (request.includes('aseprite')) return 'aseprite'
  if (request.includes('lpc')) return 'lpc'
  if (request.includes('duelyst')) return 'duelyst'
  if (request.includes('apes')) return 'apes'
  return 'pixellab'
}

function inferProjectCheck(request: string) {
  if (request.includes('source hygiene')) return 'source_hygiene'
  if (request.includes('hosted rag') || request.includes('rag check')) return 'rag_hosted_check'
  if (request.includes('release build') || request.includes('build')) return 'release_build'
  if (request.includes('ai tool') || request.includes('tool tests')) return 'ai_tools_tests'
  return 'lint'
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
