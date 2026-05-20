import { useMemo, useState } from 'react'
import { applyApprovedToolResult, buildAiAgentReply } from '../aiAgent'
import { requestAiProviderReply } from '../aiProviderClient'
import { summarizeAiActivitySnapshot, type AiActivitySnapshot } from '../aiActivityContext'
import type { AiToolProposal } from '../aiToolRegistry'
import { makeAiStudioMessage } from '../aiWorkspace'
import { localToolFetch, localToolPath } from '../localToolsClient'
import { buildRagContextBundle } from '../ragIndex'
import type { RagIndex } from '../ragTypes'
import type { AiProviderConnection, AiStudioMessage, AnimationName, CharacterManifest, Direction, KitbashRecipe, PartLabel, ToolConnectionSettings } from '../types'

type CreatorPanelId = 'fast' | 'workstation' | 'library' | 'batch' | 'audit' | 'ai' | 'apes' | 'exports' | 'settings'

type AIStudioPanelProps = {
  selectedCharacter: CharacterManifest
  recipe: KitbashRecipe | null
  ragIndex: RagIndex | null
  ragStatus: string
  providers: AiProviderConnection[]
  tools: ToolConnectionSettings
  messages: AiStudioMessage[]
  setMessages: (messages: AiStudioMessage[]) => void
  lpcPublished: boolean
  localToolsAvailable: boolean
  activitySnapshot: AiActivitySnapshot
  createApesJob: () => void
  createGenerationJobsFromQueue: () => void
  createPixelLabGenerationJob: (input: { prompt: string; animation: AnimationName; directions: Direction[]; layers: PartLabel[] }) => { jobId: string | null; message: string }
  importPixelLabGenerationOutputs: (jobId: string, rawOutput: unknown) => string
  downloadGenerationManifest: () => void
  openSettings: () => void
  openApesLab: () => void
  openExports: () => void
  openPanel: (panel: CreatorPanelId) => void
  getAiSessionSecret: (providerId: string) => string | null
  activateRag: (mode?: 'load' | 'rebuild') => Promise<void>
}

export function AIStudioPanel({
  selectedCharacter,
  recipe,
  ragIndex,
  ragStatus,
  providers,
  tools,
  messages,
  setMessages,
  lpcPublished,
  localToolsAvailable,
  activitySnapshot,
  createApesJob,
  createGenerationJobsFromQueue,
  createPixelLabGenerationJob,
  importPixelLabGenerationOutputs,
  downloadGenerationManifest,
  openSettings,
  openApesLab,
  openExports,
  openPanel,
  getAiSessionSecret,
  activateRag,
}: AIStudioPanelProps) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const enabledProviders = providers.filter((provider) => provider.enabled)
  const sessionReadyProviders = enabledProviders.filter((provider) => provider.secret_session_set || provider.type === 'ollama' || provider.type === 'lm_studio')
  const toolList = useMemo(() => [
    localToolsAvailable ? 'Local tool server' : 'Static Pages mode',
    tools.aseprite.enabled ? 'Aseprite bridge' : 'Aseprite export package',
    tools.pixellab.enabled ? 'PixelLab endpoint' : 'PixelLab not connected',
    tools.local_llm.enabled ? `${tools.local_llm.provider} local LLM` : 'Local LLM not connected',
    lpcPublished ? 'Hosted LPC bundle' : 'LPC local-only',
  ], [localToolsAvailable, lpcPublished, tools])

  async function sendMessage() {
    const request = draft.trim()
    if (!request || sending) return
    const userMessage = makeAiStudioMessage('user', request)
    const approvalTarget = isApprovalShortcut(request) ? findLatestPendingTool(messages) : null
    if (approvalTarget) {
      setDraft('')
      setSending(true)
      try {
        const result = await executeToolProposal(approvalTarget.proposal)
        setMessages([
          ...messages.map((message) => message.message_id === approvalTarget.messageId
            ? applyApprovedToolResult(message, approvalTarget.proposal.proposal_id, result)
            : message),
          userMessage,
        ])
      } finally {
        setSending(false)
      }
      return
    }
    if (isApprovalShortcut(request)) {
      setMessages([
        ...messages,
        userMessage,
        makeAiStudioMessage('assistant', 'There is no pending approval card to run. Ask for a PixelLab prompt, PixelLab handoff, or PixelLab setup first, then approve the specific card that appears.'),
      ])
      setDraft('')
      return
    }
    const fallbackMessage = buildAiAgentReply({
      request,
      selectedCharacter,
      recipe,
      ragIndex,
      providers,
      tools,
      lpcPublished,
      localToolsAvailable,
      activitySnapshot,
    })
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setDraft('')
    setSending(true)
    try {
      const providerReply = localToolsAvailable
        ? await requestAiProviderReply({
            request,
            selectedCharacter,
            recipe,
            ragIndex,
            providers,
            getSessionSecret: getAiSessionSecret,
            activitySnapshot,
          })
        : null
      setMessages([
        ...nextMessages,
        providerReply
          ? {
              ...fallbackMessage,
              tool_hints: mergeToolHints(fallbackMessage.tool_hints, providerReply.toolProposals),
              tool_proposals: mergeToolProposals(fallbackMessage.tool_proposals ?? [], providerReply.toolProposals),
              content: [
                `Provider reply from ${providerReply.provider.name}:`,
                '',
                providerReply.content,
                providerReply.toolProposals.length ? `\nProvider proposed ${providerReply.toolProposals.length} approval-gated tool call(s). Review them below before anything runs.` : '',
                '',
                'Deterministic guardrails:',
                fallbackMessage.content,
              ].join('\n'),
            }
          : fallbackMessage,
      ])
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          ...fallbackMessage,
          content: [
            `Provider call failed: ${error instanceof Error ? error.message : String(error)}`,
            '',
            fallbackMessage.content,
          ].join('\n'),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  async function approveTool(messageId: string, proposal: AiToolProposal) {
    const result = await executeToolProposal(proposal)
    setMessages(messages.map((message) => message.message_id === messageId
      ? applyApprovedToolResult(message, proposal.proposal_id, result)
      : message))
  }

  async function submitPixelLabPrompt(prompt: string, animation: AnimationName, jobId: string | null, directions: Direction[], layers: PartLabel[]) {
    if (!tools.pixellab.enabled) {
      return 'PixelLab is not enabled in Settings, so the job was queued for handoff instead of direct submission.'
    }
    if (!localToolsAvailable) {
      return 'Local tools are not available, so the job was queued for handoff instead of direct submission.'
    }
    try {
      const response = await localToolFetch(localToolPath('bridge/pixellab'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointUrl: tools.pixellab.endpoint_url,
          mcpServerUrl: tools.pixellab.mcp_server_url,
          model: tools.pixellab.preferred_model || 'sprite-animation',
          animation,
          directions,
          layers,
          prompt,
        }),
      })
      const payload = await response.json().catch(() => null) as {
        ok?: boolean
        content?: string
        error?: string
        raw?: unknown
        frames?: string[]
        spritesheet?: string | null
        warnings?: string[]
      } | null
      if (!response.ok || !payload?.ok) {
        return `PixelLab submission failed: ${payload?.error ?? `HTTP ${response.status}`}. The generation job is still queued for handoff.`
      }
      const importResult = jobId
        ? importPixelLabGenerationOutputs(jobId, payload.raw ?? payload)
        : 'PixelLab response did not include raw image output metadata to attach.'
      const imageCount = (payload.frames?.length ?? 0) + (payload.spritesheet ? 1 : 0)
      const warningText = payload.warnings?.length ? ` Warnings: ${payload.warnings.join(' ')}` : ''
      return `Sent to PixelLab through the local bridge. ${payload.content ?? 'PixelLab request accepted.'} Returned ${imageCount} image output(s). ${importResult}${warningText}`
    } catch (error) {
      return `PixelLab submission failed: ${error instanceof Error ? error.message : String(error)}. The generation job is still queued for handoff.`
    }
  }

  async function executeToolProposal(proposal: AiToolProposal) {
    let result = 'Approved and sent to the matching app action.'
    if (proposal.tool_id === 'create_apes_job') createApesJob()
    if (proposal.tool_id === 'queue_pixellab_generation') {
      const requestedDirections = stringArrayInput(proposal.input.directions)
      if (activitySnapshot.queues.missing_animation && activitySnapshot.queues.missing_animation.issue_count > 0 && requestedDirections.length === 0) {
        createGenerationJobsFromQueue()
        result = 'Queued PixelLab/manual generation handoff jobs from the current missing-animation queue.'
      } else {
        const prompt = prepareGenerationPrompt(activitySnapshot, 'pixellab', proposal.input)
        const animation = animationInput(proposal.input.animation, activitySnapshot.frame.animation)
        const layers = partLabelArrayInput(proposal.input.layers)
        const queued = createPixelLabGenerationJob({
          prompt,
          animation,
          directions: directionArrayInput(proposal.input.directions),
          layers,
        })
        const pixelLabResult = await submitPixelLabPrompt(prompt, animation, queued.jobId, directionArrayInput(proposal.input.directions), layers)
        result = [
          requestedDirections.length > 0
            ? 'Prepared a PixelLab directional-generation handoff.'
            : 'Prepared a PixelLab generation handoff.',
          queued.message,
          pixelLabResult,
          prompt,
        ].filter(Boolean).join(' ')
      }
    }
    if (proposal.tool_id === 'export_handoff') downloadGenerationManifest()
    if (proposal.tool_id === 'activate_rag') {
      await activateRag(proposal.input.mode === 'load' ? 'load' : 'rebuild')
      result = 'RAG activation requested.'
    }
    if (proposal.tool_id === 'rag_search') {
      if (!ragIndex) {
        await activateRag('load')
        result = 'RAG load requested. Re-approve search after the index is active.'
      } else {
        const bundle = buildRagContextBundle(ragIndex, {
          query: typeof proposal.input.query === 'string' ? proposal.input.query : draft,
          purpose: 'review_guidance',
          limit: typeof proposal.input.limit === 'number' ? proposal.input.limit : 5,
        })
        result = bundle.citations.length > 0
          ? `Found ${bundle.citations.length} cited result(s): ${bundle.citations.map((citation) => citation.title).join(', ')}.`
          : 'No matching RAG citations were found for this request.'
      }
    }
    if (proposal.tool_id === 'inspect_current_recipe') {
      result = [
        summarizeAiActivitySnapshot(activitySnapshot),
        recipe
          ? `Recipe for ${recipe.character_id} uses ${recipe.layers.length} layer(s), covers ${recipe.animation_coverage.join(', ') || 'no animations'}, and targets ${recipe.export_targets.join(', ') || 'no exports yet'}.`
        : `Selected character ${selectedCharacter.display_name} has no active recipe.`,
      ].join(' ')
    }
    if (proposal.tool_id === 'inspect_live_context') {
      result = [
        summarizeAiActivitySnapshot(activitySnapshot),
        activitySnapshot.warnings.length ? `Warnings: ${activitySnapshot.warnings.join(' | ')}.` : 'No live-context warnings are currently reported.',
        activitySnapshot.recent_actions.length ? `Recent: ${activitySnapshot.recent_actions.join(' | ')}.` : '',
      ].filter(Boolean).join(' ')
    }
    if (proposal.tool_id === 'explain_export_blockers') {
      result = explainExportBlockers(activitySnapshot)
    }
    if (proposal.tool_id === 'inspect_layer_stack') {
      result = inspectLayerStack(activitySnapshot, recipe)
    }
    if (proposal.tool_id === 'diagnose_sprite_alignment') {
      result = diagnoseSpriteAlignment(activitySnapshot)
    }
    if (proposal.tool_id === 'suggest_next_action') {
      result = suggestNextAction(activitySnapshot)
    }
    if (proposal.tool_id === 'open_relevant_panel') {
      const panel = isCreatorPanelId(proposal.input.panel) ? proposal.input.panel : 'ai'
      openPanel(panel)
      result = `Opened ${panel === 'ai' ? 'AI Studio' : panel}.`
    }
    if (proposal.tool_id === 'compare_current_frame_to_base') {
      result = `Current frame comparison context: ${activitySnapshot.frame.animation}/${activitySnapshot.frame.direction} frame ${activitySnapshot.frame.frame_number} of ${activitySnapshot.frame.frame_count || 'unknown'} on ${activitySnapshot.source.selected_character_name}. Selected layer ${activitySnapshot.layer.selected_layer}; selected part ${activitySnapshot.layer.selected_part_id ?? activitySnapshot.layer.selected_source_part_id ?? 'source/base'}. Use the alignment diagnostic if the composite appears offset.`
    }
    if (proposal.tool_id === 'validate_current_recipe') {
      result = activitySnapshot.recipe
        ? `Recipe validation: ${activitySnapshot.recipe.readiness_summary}. Release: ${activitySnapshot.release.blocker_summary}. Missing-animation queue: ${activitySnapshot.queues.missing_animation ? `${activitySnapshot.queues.missing_animation.issue_count} issue(s), ${activitySnapshot.queues.missing_animation.affected_frame_count} affected frame(s)` : 'no active issue summary'}.`
        : 'No active recipe is available to validate.'
    }
    if (proposal.tool_id === 'prepare_generation_prompt') {
      result = prepareGenerationPrompt(activitySnapshot, typeof proposal.input.target === 'string' ? proposal.input.target : undefined, proposal.input)
    }
    if (proposal.tool_id === 'inspect_rag_sources') {
      result = ragIndex
        ? `RAG is loaded with ${ragIndex.document_count} source document(s), ${ragIndex.chunk_count} chunk(s), generated ${ragIndex.generated_at}. Mode: ${activitySnapshot.knowledge.source_mode}. Confidence: ${describeRagConfidence(activitySnapshot.knowledge.source_mode)}.`
        : `RAG is not loaded. Status: ${ragStatus}`
    }
    if (proposal.tool_id === 'check_lpc_compatibility') {
      result = recipe
        ? `Compatibility check prepared for ${recipe.layers.length} recipe layer(s). Use APES Lab or Part Library for layer-level fixes.`
        : 'No active recipe is available for LPC compatibility checking.'
    }
    if (proposal.tool_id === 'search_assets') {
      result = await runLocalRagToolAction('search-assets', proposal.input)
    }
    if (proposal.tool_id === 'run_project_check') {
      result = await runLocalRagToolAction('project-check', proposal.input)
    }
    if (proposal.tool_id === 'run_lpc_render_matrix_audit') {
      result = await runLocalRagToolAction('render-matrix-audit')
    }
    if (proposal.tool_id === 'scan_pc_rag_assets') {
      result = await runLocalRagToolAction('scan-pc')
    }
    if (proposal.tool_id === 'fetch_web_rag_sources') {
      result = await runLocalRagToolAction('fetch-web')
    }
    if (proposal.tool_id === 'configure_pixellab_bridge' || proposal.tool_id === 'configure_aseprite_bridge') {
      openSettings()
      result = proposal.tool_id === 'configure_pixellab_bridge'
        ? 'Opened Settings so you can enable PixelLab defaults and run the PixelLab bridge check. Direct PixelLab calls require a local-tools session; GitHub Pages can still prepare prompts and handoff JSON.'
        : 'Opened Settings so you can finish the bridge connection with local values.'
    }
    return result
  }

  async function runLocalRagToolAction(action: string, input: Record<string, unknown> = {}) {
    if (!localToolsAvailable) return `This tool requires the local tool server; GitHub Pages can only use static-safe AI tools. Recovery: use the local preview/dev server started through tools/local-vite-server.js, then try the approval again.`
    try {
      const response = await localToolFetch(localToolPath('rag-tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...input }),
      })
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string; error?: string } | null
      if (!response.ok || !payload?.ok) return `${payload?.error ?? 'Local tool action failed.'} Recovery: check Settings bridge status, then run the lighter project check or RAG source inspection before retrying ${action}.`
      return payload.message ?? 'Local tool action completed.'
    } catch (error) {
      return `${error instanceof Error ? error.message : String(error)} Recovery: verify the local tool server is reachable and retry from AI Studio or Settings.`
    }
  }

  return (
    <section className="panel wide-panel ai-studio-panel">
      <div className="panel-heading">
        <div>
          <h3>AI Studio</h3>
          <p>Tell the assistant what you want to build, then use the connected local tools and release-safe handoff flows.</p>
        </div>
      </div>

      <div className="settings-grid">
        <article className="settings-card">
          <strong>Provider routing</strong>
          <span>{sessionReadyProviders.length > 0 ? sessionReadyProviders.map((provider) => provider.name).join(', ') : 'No direct provider session is armed.'}</span>
          <code>{enabledProviders.length} enabled provider(s); secrets are session-only and redacted from persisted config.</code>
        </article>
        <article className="settings-card">
          <strong>RAG brain</strong>
          <span>{ragStatus}</span>
          {ragIndex ? <code>{ragIndex.document_count} source document(s), {ragIndex.chunk_count} retrievable chunk(s)</code> : null}
          <div className="status-strip">
            <button data-testid="activate-rag" onClick={() => void activateRag('load')}>Activate RAG</button>
            <button data-testid="rebuild-rag" onClick={() => void activateRag('rebuild')} disabled={!localToolsAvailable}>Rebuild</button>
          </div>
        </article>
        <article className="settings-card">
          <strong>Tool access</strong>
          <code>{toolList.join('\n')}</code>
        </article>
        <article className="settings-card">
          <strong>Live context</strong>
          <span>{summarizeAiActivitySnapshot(activitySnapshot)}</span>
          {activitySnapshot.warnings.length ? <code>{activitySnapshot.warnings.join('\n')}</code> : null}
          {activitySnapshot.warnings.length ? (
            <div className="status-strip">
              <button type="button" onClick={() => setDraft(`Explain these current blockers and tell me the next concrete fix: ${activitySnapshot.warnings.join('; ')}`)}>
                Ask about blockers
              </button>
            </div>
          ) : null}
        </article>
      </div>

      <div className="ai-chat-shell">
        <div className="ai-chat-log" data-testid="ai-chat-log">
          {messages.length === 0 ? (
            <article className="ai-chat-message assistant">
              <strong>Assistant</strong>
              <p>Ask for a character, animation pass, cleanup plan, export package, prompt, RAG search, APES job, Aseprite handoff, PixelLab handoff, or local-LLM plan.</p>
            </article>
          ) : messages.map((message) => (
            <article key={message.message_id} className={`ai-chat-message ${message.role}`}>
              <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
              <pre>{message.content}</pre>
              {message.citations?.length ? <code>{message.citations.map((citation) => `${citation.title}: ${citation.uri}`).join('\n')}</code> : null}
              {message.tool_proposals?.length ? (
                <div className="tool-approval-list">
                  {message.tool_proposals.map((proposal) => (
                    <article key={proposal.proposal_id} className={`tool-approval-card ${proposal.status}`}>
                      <strong>{proposal.label}</strong>
                      <span>{proposal.permission_scope}</span>
                      <code>{JSON.stringify(proposal.input, null, 2)}</code>
                      {proposal.result ? <span>{proposal.result}</span> : null}
                      <div className="status-strip">
                        <button
                          onClick={() => void approveTool(message.message_id, proposal)}
                          disabled={proposal.status !== 'pending'}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setMessages(messages.map((item) => item.message_id === message.message_id ? {
                            ...item,
                            tool_proposals: item.tool_proposals?.map((candidate) => candidate.proposal_id === proposal.proposal_id ? { ...candidate, status: 'rejected' } : candidate),
                          } : item))}
                          disabled={proposal.status !== 'pending'}
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
        <label className="field">
          <span>Request</span>
          <textarea
            data-testid="ai-chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Example: make a Duelyst-inspired idle cleanup pass and package it for Aseprite"
          />
        </label>
        <div className="status-strip">
          <button className="primary" data-testid="ai-chat-send" onClick={() => void sendMessage()} disabled={!draft.trim() || sending}>{sending ? 'Sending' : 'Send'}</button>
          <button onClick={createApesJob}>Create APES job</button>
          <button onClick={createGenerationJobsFromQueue}>Queue AI missing layers</button>
          <button onClick={downloadGenerationManifest}>Download generation manifest</button>
          <button onClick={() => void activateRag('load')}>Activate RAG</button>
          <button onClick={openApesLab}>Open APES Lab</button>
          <button onClick={openExports}>Open Exports</button>
          <button onClick={openSettings}>Open Settings</button>
        </div>
      </div>

      <div className="settings-card settings-card-warning">
        <strong>Security boundary</strong>
        <span>Static GitHub Pages cannot make browser-held provider secrets impossible to inspect. This app keeps secrets session-only, redacts persisted config, and expects a local proxy/MCP bridge for direct provider calls.</span>
      </div>
    </section>
  )
}

function isCreatorPanelId(value: unknown): value is CreatorPanelId {
  return typeof value === 'string' && ['fast', 'workstation', 'library', 'batch', 'audit', 'ai', 'apes', 'exports', 'settings'].includes(value)
}

function isApprovalShortcut(request: string) {
  return /^(approve|approved|yes|ok|okay|run it|do it|confirm|send it|queue it)$/i.test(request.trim())
}

function findLatestPendingTool(messages: AiStudioMessage[]) {
  for (const message of [...messages].reverse()) {
    const proposal = (message.tool_proposals ?? []).find((candidate) => candidate.status === 'pending')
    if (proposal) return { messageId: message.message_id, proposal }
  }
  return null
}

function mergeToolProposals(localProposals: AiToolProposal[], providerProposals: AiToolProposal[]) {
  const seen = new Set(localProposals.map((proposal) => `${proposal.tool_id}:${JSON.stringify(proposal.input)}`))
  return [
    ...localProposals,
    ...providerProposals.filter((proposal) => {
      const key = `${proposal.tool_id}:${JSON.stringify(proposal.input)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  ]
}

function mergeToolHints(localHints: string[] | undefined, providerProposals: AiToolProposal[]) {
  return Array.from(new Set([
    ...(localHints ?? []),
    ...providerProposals.map((proposal) => `${proposal.permission_scope}:${proposal.tool_id}`),
  ]))
}

function describeRagConfidence(mode: AiActivitySnapshot['knowledge']['source_mode']) {
  if (mode === 'local_full') return 'highest available in-app confidence because private/local sources and local tools can participate.'
  if (mode === 'hosted_public') return 'public-safe confidence from the GitHub Pages index; private PC sources are not included.'
  return 'no retrieval confidence yet because no index is loaded.'
}

function explainExportBlockers(snapshot: AiActivitySnapshot) {
  const warnings = snapshot.warnings.length ? ` Warnings: ${snapshot.warnings.join(' | ')}.` : ''
  return snapshot.release.blocker_count > 0 || snapshot.recipe?.readiness_state !== 'ready'
    ? `Export is not clean yet. ${snapshot.release.blocker_summary}. Recipe: ${snapshot.recipe?.readiness_summary ?? 'no active recipe'}.${warnings} Fix reviewed parts, generation-job review gates, and missing animation issues before final export.`
    : 'No live export blockers are currently reported. Confirm credits and target profile before packaging.'
}

function inspectLayerStack(snapshot: AiActivitySnapshot, recipe: KitbashRecipe | null) {
  const layers = recipe?.layers.map((layer, index) => `${index + 1}. ${layer.label}: ${layer.source_part_id ? `part ${layer.source_part_id}` : `source ${layer.source_character}`}${layer.visible ? '' : ' hidden'}${layer.locked ? ' locked' : ''}`).join('\n') ?? 'No active recipe layer stack.'
  return `Selected layer: ${snapshot.layer.selected_layer}. Options: ${snapshot.layer.option_count}. Stack:\n${layers}`
}

function diagnoseSpriteAlignment(snapshot: AiActivitySnapshot) {
  return [
    `Alignment context: ${snapshot.frame.animation}/${snapshot.frame.direction} frame ${snapshot.frame.frame_number} of ${snapshot.frame.frame_count || 'unknown'}.`,
    `Layer ${snapshot.layer.selected_layer}; selected part ${snapshot.layer.selected_part_id ?? snapshot.layer.selected_source_part_id ?? 'source/base'}; ${snapshot.layer.option_count} option(s).`,
    snapshot.queues.missing_animation ? `Missing/unsupported animation issues: ${snapshot.queues.missing_animation.issue_count}, affected frames: ${snapshot.queues.missing_animation.affected_frame_count}.` : 'No missing-animation queue summary is active.',
    snapshot.warnings.length ? `Warnings: ${snapshot.warnings.join(' | ')}.` : 'No live warnings reported.',
  ].join(' ')
}

function suggestNextAction(snapshot: AiActivitySnapshot) {
  if (snapshot.release.blocker_count > 0) return `Next action: resolve release blockers first. ${snapshot.release.blocker_summary}`
  if (snapshot.queues.missing_animation && snapshot.queues.missing_animation.issue_count > 0) return `Next action: open APES Lab and queue/review ${snapshot.queues.missing_animation.issue_count} missing-animation issue(s).`
  if (snapshot.recipe?.readiness_state && snapshot.recipe.readiness_state !== 'ready') return `Next action: review selected parts until recipe readiness is ready. ${snapshot.recipe.readiness_summary}`
  if (!snapshot.knowledge.rag_loaded) return 'Next action: activate RAG so AI answers can cite project context.'
  return 'Next action: export a small reviewed package and inspect the result before broad batch generation.'
}

function prepareGenerationPrompt(snapshot: AiActivitySnapshot, requestedTarget = 'pixellab', input: Record<string, unknown> = {}) {
  const target = requestedTarget.toLowerCase()
  const requestedAnimation = typeof input.animation === 'string' && input.animation.trim()
    ? input.animation.trim()
    : snapshot.frame.animation
  const requestedDirections = stringArrayInput(input.directions)
  const requestedLayers = stringArrayInput(input.layers)
  const requestedPrompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  const directionText = requestedDirections.length > 0
    ? requestedDirections.join(', ')
    : snapshot.frame.direction
  const layerText = requestedLayers.length > 0
    ? requestedLayers.join(', ')
    : 'full character'
  const requestedScope = requestedDirections.length > 0
    ? `${snapshot.source.selected_character_name}; generate ${requestedAnimation} direction set for ${directionText}; layer scope ${layerText}.`
    : `${snapshot.source.selected_character_name}; ${requestedAnimation}/${directionText}; frame ${snapshot.frame.frame_number}; layer ${layerText}.`
  const shared = [
    requestedScope,
    `Canvas ${snapshot.render_evidence.canvas_size?.width ?? 64}x${snapshot.render_evidence.canvas_size?.height ?? 64}; source rect ${snapshot.render_evidence.source_rect ? `${snapshot.render_evidence.source_rect.x},${snapshot.render_evidence.source_rect.y},${snapshot.render_evidence.source_rect.w},${snapshot.render_evidence.source_rect.h}` : 'unknown'}; geometry ${snapshot.render_evidence.frame_geometry}.`,
    requestedDirections.length > 0 ? `Use the existing ${snapshot.frame.animation}/${snapshot.frame.direction} frame sequence only as visual reference; do not overwrite the requested ${requestedAnimation} ${directionText} target.` : '',
    requestedPrompt ? `User request: ${requestedPrompt}` : '',
    `Preserve RPG sprite proportions, clean alpha, stable floor contact, readable silhouette, and reusable layer boundaries.`,
    snapshot.queues.missing_animation ? `Cover missing/unsupported animation queue: ${snapshot.queues.missing_animation.issue_count} issue(s), ${snapshot.queues.missing_animation.affected_frame_count} affected frame(s).` : '',
    `Return candidates for manual review; do not imply release approval.`,
  ].filter(Boolean)
  if (target.includes('aseprite')) {
    return [`Aseprite cleanup brief: keep existing frame registration and layer names intact.`, ...shared, `Deliver edit notes for onion-skin comparison and per-layer cleanup.`].join(' ')
  }
  if (target.includes('apes')) {
    return [`APES segmentation brief: isolate only the requested layer with connected masks and transparent background.`, ...shared, `Prefer conservative masks over hallucinated edges.`].join(' ')
  }
  if (target.includes('lpc')) {
    return [`LPC part-generation brief: match LPC body alignment, z-order expectations, and animation-sheet cadence.`, ...shared, `Avoid body pixels unless the selected layer is a body/base layer.`].join(' ')
  }
  if (target.includes('duelyst')) {
    return [`Duelyst source-cleanup brief: preserve source identity while normalizing to the current app frame and review gates.`, ...shared, `Separate costume/equipment from body wherever possible.`].join(' ')
  }
  return [`PixelLab generation brief: create pixel-art sprite content that can be imported as a reviewed layer candidate.`, ...shared].join(' ')
}

function stringArrayInput(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : []
}

function animationInput(value: unknown, fallback: AnimationName): AnimationName {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function directionArrayInput(value: unknown): Direction[] {
  const validDirections = new Set<Direction>(['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'])
  return stringArrayInput(value).filter((item): item is Direction => validDirections.has(item as Direction))
}

function partLabelArrayInput(value: unknown): PartLabel[] {
  const validLabels = new Set<PartLabel>([
    'shadow',
    'back_item',
    'cloak_back',
    'back_arm',
    'back_leg',
    'torso',
    'front_leg',
    'front_arm',
    'neck',
    'head',
    'face',
    'hair_hat_hood',
    'weapon',
    'shield',
    'accessory',
    'aura_effect',
  ])
  return stringArrayInput(value).filter((item): item is PartLabel => validLabels.has(item as PartLabel))
}
