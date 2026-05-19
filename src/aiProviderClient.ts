import { chooseAiProvider } from './aiAgent.ts'
import { parseAiRequestIntent, summarizeAiIntent } from './aiIntent.ts'
import { localToolFetch, localToolPath } from './localToolsClient.ts'
import type { AiProviderConnection, CharacterManifest, KitbashRecipe } from './types.ts'
import type { RagIndex } from './ragTypes.ts'
import { buildRagContextBundle } from './ragIndex.ts'
import { aiToolRegistry } from './aiToolRegistry.ts'
import type { AiToolProposal } from './aiToolRegistry.ts'
import { summarizeAiActivitySnapshot, type AiActivitySnapshot } from './aiActivityContext.ts'

export type AiProviderCallOptions = {
  request: string
  selectedCharacter: CharacterManifest
  recipe: KitbashRecipe | null
  ragIndex: RagIndex | null
  providers: AiProviderConnection[]
  getSessionSecret: (providerId: string) => string | null
  activitySnapshot?: AiActivitySnapshot
}

export type AiProviderCallResult = {
  provider: AiProviderConnection
  content: string
  toolProposals: AiToolProposal[]
}

export async function requestAiProviderReply(options: AiProviderCallOptions): Promise<AiProviderCallResult | null> {
  const intent = parseAiRequestIntent(options.request)
  const provider = chooseAiProvider(options.providers, intent.providerHint)
  if (!provider) return null
  const apiKey = options.getSessionSecret(provider.provider_id)
  if (provider.secret_storage === 'session_only' && !apiKey) return null

  const ragBundle = options.ragIndex
    ? buildRagContextBundle(options.ragIndex, {
      query: `${options.request} ${summarizeAiIntent(intent)} ${options.selectedCharacter.display_name} ${options.recipe?.recipe_mode ?? ''} ${options.activitySnapshot ? summarizeAiActivitySnapshot(options.activitySnapshot) : ''}`,
      purpose: 'generation_prompt',
      limit: 5,
    })
    : null

  const response = await localToolFetch(localToolPath('ai/proxy'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: provider.type,
      baseUrl: provider.base_url,
      model: provider.model,
      apiKey,
      temperature: 0.2,
      maxTokens: 900,
      messages: [
        {
          role: 'system',
          content: [
            'You are the Pixel Creator production assistant.',
            'Give concise, actionable sprite-production guidance.',
            'Respect review gates: generated or segmented output must be reviewed before release.',
            'Prefer exact LPC/APES layer, animation, direction, and frame language.',
            `Available approval-gated tools: ${aiToolRegistry.map((tool) => `${tool.tool_id}: ${tool.description}`).join(' | ')}`,
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `Request: ${options.request}`,
            `Intent: ${summarizeAiIntent(intent)}`,
            `Character: ${options.selectedCharacter.display_name} (${options.selectedCharacter.character_id})`,
            `Recipe: ${options.recipe?.character_id ?? 'none'} / ${options.recipe?.recipe_mode ?? 'none'} / ${options.recipe?.source_family ?? 'none'}`,
            options.activitySnapshot ? `Live activity snapshot:\n${JSON.stringify(options.activitySnapshot, null, 2)}` : 'Live activity snapshot: unavailable.',
            ragBundle?.context_text ? `Context:\n${ragBundle.context_text}` : 'Context: no RAG context loaded.',
          ].join('\n\n'),
        },
      ],
    }),
  })
  const payload = await response.json().catch(() => null) as { ok?: boolean; content?: string; error?: string } | null
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `AI provider proxy failed with HTTP ${response.status}.`)
  }
  return {
    provider,
    content: payload.content?.trim() || 'Provider returned an empty response.',
    toolProposals: parseProviderToolProposals((payload as { tool_proposals?: unknown }).tool_proposals ?? extractToolProposalJson(payload.content ?? '')),
  }
}

export function parseProviderToolProposals(value: unknown): AiToolProposal[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as { tool_id?: unknown; input?: unknown }
    if (typeof candidate.tool_id !== 'string') return []
    const definition = aiToolRegistry.find((tool) => tool.tool_id === candidate.tool_id)
    if (!definition) return []
    const input = candidate.input && typeof candidate.input === 'object' && !Array.isArray(candidate.input)
      ? candidate.input as Record<string, unknown>
      : {}
    if (!matchesSchema(input, definition.input_schema)) return []
    return [{
      proposal_id: `provider_tool_${Date.now()}_${index}`,
      tool_id: definition.tool_id,
      label: definition.label,
      permission_scope: definition.permission_scope,
      input,
      status: 'pending' as const,
    }]
  })
}

function extractToolProposalJson(content: string) {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = match?.[1] ?? content
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? (parsed as { tool_proposals?: unknown }).tool_proposals : null)
  } catch {
    return null
  }
}

function matchesSchema(input: Record<string, unknown>, schema: { properties?: Record<string, { enum?: string[] }>; required?: string[]; additionalProperties?: boolean }) {
  for (const key of schema.required ?? []) {
    if (!(key in input)) return false
  }
  const properties = schema.properties ?? {}
  if (schema.additionalProperties === false && Object.keys(input).some((key) => !(key in properties))) return false
  return Object.entries(input).every(([key, value]) => {
    const field = properties[key]
    if (!field?.enum) return true
    return typeof value === 'string' && field.enum.includes(value)
  })
}
