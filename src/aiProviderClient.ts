import { chooseAiProvider } from './aiAgent.ts'
import { parseAiRequestIntent, summarizeAiIntent } from './aiIntent.ts'
import { localToolFetch, localToolPath } from './localToolsClient.ts'
import type { AiProviderConnection, CharacterManifest, KitbashRecipe } from './types.ts'
import type { RagIndex } from './ragTypes.ts'
import { buildRagContextBundle } from './ragIndex.ts'
import { aiToolRegistry } from './aiToolRegistry.ts'

export type AiProviderCallOptions = {
  request: string
  selectedCharacter: CharacterManifest
  recipe: KitbashRecipe | null
  ragIndex: RagIndex | null
  providers: AiProviderConnection[]
  getSessionSecret: (providerId: string) => string | null
}

export type AiProviderCallResult = {
  provider: AiProviderConnection
  content: string
}

export async function requestAiProviderReply(options: AiProviderCallOptions): Promise<AiProviderCallResult | null> {
  const intent = parseAiRequestIntent(options.request)
  const provider = chooseAiProvider(options.providers, intent.providerHint)
  if (!provider) return null
  const apiKey = options.getSessionSecret(provider.provider_id)
  if (provider.secret_storage === 'session_only' && !apiKey) return null

  const ragBundle = options.ragIndex
    ? buildRagContextBundle(options.ragIndex, {
      query: `${options.request} ${summarizeAiIntent(intent)} ${options.selectedCharacter.display_name} ${options.recipe?.recipe_mode ?? ''}`,
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
  }
}
