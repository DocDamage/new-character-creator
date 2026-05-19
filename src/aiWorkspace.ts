import type { AiProviderConnection, AiStudioMessage, CharacterManifest, KitbashRecipe, ToolConnectionSettings } from './types'
import type { RagIndex } from './ragTypes'
import { buildRagContextBundle } from './ragIndex.ts'

export const defaultAiProviderConnections: AiProviderConnection[] = [
  makeProvider('openai', 'OpenAI', 'openai', 'gpt-4.1', 'https://api.openai.com/v1'),
  makeProvider('anthropic', 'Anthropic', 'anthropic', 'claude-3-7-sonnet-latest', 'https://api.anthropic.com'),
  makeProvider('google', 'Google Gemini', 'google', 'gemini-2.5-pro', 'https://generativelanguage.googleapis.com'),
  makeProvider('mistral', 'Mistral', 'mistral', 'mistral-large-latest', 'https://api.mistral.ai/v1'),
  makeProvider('groq', 'Groq', 'groq', 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1'),
  makeProvider('openrouter', 'OpenRouter', 'openrouter', 'openrouter/auto', 'https://openrouter.ai/api/v1'),
  makeProvider('ollama', 'Ollama', 'ollama', 'llama3.1', 'http://127.0.0.1:11434', false),
  makeProvider('lm_studio', 'LM Studio', 'lm_studio', 'local-model', 'http://127.0.0.1:1234/v1', false),
  makeProvider('pixellab', 'PixelLab', 'pixellab', 'sprite-animation', 'http://127.0.0.1:8787'),
]

export const defaultToolConnections: ToolConnectionSettings = {
  aseprite: {
    enabled: false,
    executable_path: '',
    bridge_url: 'http://127.0.0.1:32123',
    script_folder: 'tools/aseprite',
  },
  pixellab: {
    enabled: false,
    endpoint_url: 'http://127.0.0.1:8787',
    mcp_server_url: '',
    preferred_model: 'sprite-animation',
  },
  local_llm: {
    enabled: false,
    endpoint_url: 'http://127.0.0.1:11434',
    provider: 'ollama',
    model: 'llama3.1',
  },
}

export function redactAiProviderConnections(connections: AiProviderConnection[]) {
  return connections.map((connection) => ({
    ...connection,
    secret_session_set: false,
    direct_browser_calls: false as const,
    local_proxy_required: true,
  }))
}

export function normalizeAiProviderConnections(value: unknown): AiProviderConnection[] {
  if (!Array.isArray(value)) return defaultAiProviderConnections
  const byId = new Map(defaultAiProviderConnections.map((provider) => [provider.provider_id, provider]))
  return defaultAiProviderConnections.map((fallback) => {
    const stored = value.find((item) => item?.provider_id === fallback.provider_id)
    return {
      ...fallback,
      ...(stored && typeof stored === 'object' ? stored : {}),
      secret_session_set: false,
      direct_browser_calls: false,
      local_proxy_required: true,
      secret_storage: fallback.secret_storage,
    }
  }).concat(
    value
      .filter((item) => item?.provider_id && !byId.has(item.provider_id))
      .map((item) => ({
        ...makeProvider(String(item.provider_id), String(item.name || item.provider_id), 'custom', String(item.model || 'custom-model'), String(item.base_url || '')),
        enabled: Boolean(item.enabled),
      })),
  )
}

export function normalizeToolConnections(value: unknown): ToolConnectionSettings {
  if (!value || typeof value !== 'object') return defaultToolConnections
  const stored = value as Partial<ToolConnectionSettings>
  return {
    aseprite: { ...defaultToolConnections.aseprite, ...(stored.aseprite ?? {}) },
    pixellab: { ...defaultToolConnections.pixellab, ...(stored.pixellab ?? {}) },
    local_llm: { ...defaultToolConnections.local_llm, ...(stored.local_llm ?? {}) },
  }
}

export function makeAiStudioMessage(role: AiStudioMessage['role'], content: string, extras: Partial<AiStudioMessage> = {}): AiStudioMessage {
  return {
    message_id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    created_at: new Date().toISOString(),
    content,
    ...extras,
  }
}

export function buildLocalAiStudioReply(options: {
  request: string
  selectedCharacter: CharacterManifest
  recipe: KitbashRecipe | null
  ragIndex: RagIndex | null
  providers: AiProviderConnection[]
  tools: ToolConnectionSettings
  lpcPublished: boolean
  localToolsAvailable: boolean
}) {
  const query = [
    options.request,
    options.selectedCharacter.display_name,
    options.recipe?.recipe_mode,
    options.recipe?.source_family,
  ].filter(Boolean).join(' ')
  const ragBundle = options.ragIndex
    ? buildRagContextBundle(options.ragIndex, {
      query,
      purpose: 'generation_prompt',
      limit: 5,
    })
    : null
  const configuredProviders = options.providers.filter((provider) => provider.enabled && (provider.secret_session_set || provider.type === 'ollama' || provider.type === 'lm_studio'))
  const toolHints = [
    options.localToolsAvailable ? 'local-tools' : 'static-pages',
    options.tools.aseprite.enabled ? 'aseprite-bridge' : 'aseprite-export-only',
    options.tools.pixellab.enabled ? 'pixellab-endpoint' : 'pixellab-not-configured',
    options.tools.local_llm.enabled ? 'local-llm' : 'local-llm-not-configured',
    options.lpcPublished ? 'lpc-pages-ready' : 'lpc-local-only',
  ]
  const content = [
    `I can help with "${options.request.trim()}".`,
    '',
    `Current source: ${options.selectedCharacter.display_name} (${options.selectedCharacter.character_id}).`,
    `Recipe mode: ${options.recipe?.recipe_mode ?? 'none'} / ${options.recipe?.source_family ?? 'none'}.`,
    `Provider route: ${configuredProviders.length > 0 ? configuredProviders.map((provider) => `${provider.name} ${provider.secret_session_set ? 'session key ready' : 'local endpoint'}`).join(', ') : 'manual or local planning until a session key/local endpoint is enabled'}.`,
    `Tool access: ${toolHints.join(', ')}.`,
    '',
    'Recommended next actions:',
    options.lpcPublished ? '- Use LPC sources directly from the hosted app.' : '- Publish the LPC public bundle before relying on LPC sources from GitHub Pages.',
    options.tools.aseprite.enabled ? '- Export the Aseprite package, then send/import through the configured Aseprite bridge.' : '- Use the Aseprite reference export until the bridge URL is enabled.',
    options.tools.pixellab.enabled ? '- Generate PixelLab jobs from missing animation queue items.' : '- Configure PixelLab endpoint if you want direct sprite generation.',
    options.tools.local_llm.enabled ? '- Use the local LLM endpoint for planning/prompt drafting through a local proxy.' : '- Enable Ollama or LM Studio for local LLM planning.',
    '',
    ragBundle ? `RAG context loaded: ${ragBundle.citations.map((citation) => citation.title).join('; ')}.` : 'RAG context is not loaded yet; run npm run rag:index and publish/load the index.',
  ].join('\n')
  return makeAiStudioMessage('assistant', content, {
    citations: ragBundle?.citations ?? [],
    tool_hints: toolHints,
  })
}

function makeProvider(provider_id: AiProviderConnection['provider_id'], name: string, type: AiProviderConnection['type'], model: string, base_url: string, needsSecret = true): AiProviderConnection {
  return {
    provider_id,
    name,
    type,
    enabled: false,
    model,
    base_url,
    secret_session_set: false,
    secret_storage: needsSecret ? 'session_only' : 'none',
    direct_browser_calls: false,
    local_proxy_required: true,
    capabilities: {
      text_chat: type !== 'pixellab',
      image_to_animation: type === 'pixellab',
      local_only: !needsSecret,
    },
    route_constraints: {
      requires_proxy: true,
      allowed_in_static_app: false,
    },
    notes: needsSecret
      ? 'Secret is accepted for the current browser session only. Use a local proxy for direct calls.'
      : 'Local endpoint; no provider secret is required.',
  }
}
