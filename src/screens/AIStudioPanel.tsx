import { useMemo, useState } from 'react'
import { buildLocalAiStudioReply, makeAiStudioMessage } from '../aiWorkspace'
import type { RagIndex } from '../ragTypes'
import type { AiProviderConnection, AiStudioMessage, CharacterManifest, KitbashRecipe, ToolConnectionSettings } from '../types'

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
  createApesJob: () => void
  createGenerationJobsFromQueue: () => void
  downloadGenerationManifest: () => void
  openSettings: () => void
  openApesLab: () => void
  openExports: () => void
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
  createApesJob,
  createGenerationJobsFromQueue,
  downloadGenerationManifest,
  openSettings,
  openApesLab,
  openExports,
}: AIStudioPanelProps) {
  const [draft, setDraft] = useState('')
  const enabledProviders = providers.filter((provider) => provider.enabled)
  const sessionReadyProviders = enabledProviders.filter((provider) => provider.secret_session_set || provider.type === 'ollama' || provider.type === 'lm_studio')
  const toolList = useMemo(() => [
    localToolsAvailable ? 'Local tool server' : 'Static Pages mode',
    tools.aseprite.enabled ? 'Aseprite bridge' : 'Aseprite export package',
    tools.pixellab.enabled ? 'PixelLab endpoint' : 'PixelLab not connected',
    tools.local_llm.enabled ? `${tools.local_llm.provider} local LLM` : 'Local LLM not connected',
    lpcPublished ? 'Hosted LPC bundle' : 'LPC local-only',
  ], [localToolsAvailable, lpcPublished, tools])

  function sendMessage() {
    const request = draft.trim()
    if (!request) return
    const userMessage = makeAiStudioMessage('user', request)
    const assistantMessage = buildLocalAiStudioReply({
      request,
      selectedCharacter,
      recipe,
      ragIndex,
      providers,
      tools,
      lpcPublished,
      localToolsAvailable,
    })
    setMessages([...messages, userMessage, assistantMessage])
    setDraft('')
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
        </article>
        <article className="settings-card">
          <strong>Tool access</strong>
          <code>{toolList.join('\n')}</code>
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
          <button className="primary" data-testid="ai-chat-send" onClick={sendMessage} disabled={!draft.trim()}>Send</button>
          <button onClick={createApesJob}>Create APES job</button>
          <button onClick={createGenerationJobsFromQueue}>Queue AI missing layers</button>
          <button onClick={downloadGenerationManifest}>Download generation manifest</button>
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
