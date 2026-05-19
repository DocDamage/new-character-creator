export type LocalProxyProviderRequest = {
  provider: string
  baseUrl: string
  model: string
  messages: Array<{ role: string; content: string }>
  apiKey?: string
  temperature?: number
  maxTokens?: number
}

const allowedLoopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])
const openAiCompatibleProviders = new Set(['openai', 'mistral', 'groq', 'openrouter', 'lm_studio', 'custom'])

export function normalizeLocalProxyProviderRequest(body: unknown): LocalProxyProviderRequest {
  if (!body || typeof body !== 'object') throw new Error('Expected JSON body.')
  const payload = body as Record<string, unknown>
  const provider = stringField(payload.provider, 'provider')
  const baseUrl = stringField(payload.baseUrl ?? payload.base_url, 'baseUrl')
  const model = stringField(payload.model, 'model')
  const messages = Array.isArray(payload.messages) ? payload.messages.map((message) => {
    if (!message || typeof message !== 'object') throw new Error('messages must contain objects.')
    const item = message as Record<string, unknown>
    return {
      role: stringField(item.role, 'message.role'),
      content: stringField(item.content, 'message.content'),
    }
  }) : []
  if (messages.length === 0) throw new Error('Expected at least one message.')
  if ((provider === 'ollama' || provider === 'lm_studio' || provider === 'pixellab') && !isLoopbackUrl(baseUrl)) {
    throw new Error(`${provider} routes must use a loopback URL.`)
  }
  const apiKey = optionalStringField(payload.apiKey ?? payload.api_key)
  if (providerRequiresProxy(provider) && provider !== 'pixellab' && !apiKey) {
    throw new Error(`${provider} routes require a session API key for local proxy forwarding.`)
  }
  return {
    provider,
    baseUrl,
    model,
    messages,
    apiKey,
    temperature: optionalNumberField(payload.temperature),
    maxTokens: optionalNumberField(payload.maxTokens ?? payload.max_tokens),
  }
}

export function providerRequiresProxy(provider: string) {
  return !['ollama', 'lm_studio'].includes(provider)
}

export async function forwardLocalProxyProviderRequest(request: LocalProxyProviderRequest) {
  if (request.provider === 'ollama') return forwardOllamaRequest(request)
  if (request.provider === 'anthropic') return forwardAnthropicRequest(request)
  if (request.provider === 'google') return forwardGoogleRequest(request)
  if (request.provider === 'pixellab') return forwardPixelLabRequest(request)
  if (openAiCompatibleProviders.has(request.provider)) return forwardOpenAiCompatibleRequest(request)
  throw new Error(`Unsupported provider route: ${request.provider}`)
}

async function forwardOpenAiCompatibleRequest(request: LocalProxyProviderRequest) {
  const response = await fetch(joinUrl(request.baseUrl, 'chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(request.apiKey ? { Authorization: `Bearer ${request.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 900,
    }),
  })
  const payload = await readProviderJson(response)
  return {
    content: stringFromPath(payload, ['choices', 0, 'message', 'content']) || stringFromPath(payload, ['choices', 0, 'text']),
    raw: payload,
  }
}

async function forwardOllamaRequest(request: LocalProxyProviderRequest) {
  const response = await fetch(joinUrl(request.baseUrl, 'api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: false,
      options: { temperature: request.temperature ?? 0.2 },
    }),
  })
  const payload = await readProviderJson(response)
  return {
    content: stringFromPath(payload, ['message', 'content']) || stringFromPath(payload, ['response']),
    raw: payload,
  }
}

async function forwardAnthropicRequest(request: LocalProxyProviderRequest) {
  const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
  const messages = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }))
  const response = await fetch(joinUrl(request.baseUrl, 'v1/messages'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': request.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens ?? 900,
      temperature: request.temperature ?? 0.2,
      ...(system ? { system } : {}),
      messages,
    }),
  })
  const payload = await readProviderJson(response)
  const content = Array.isArray((payload as { content?: unknown }).content)
    ? (payload as { content: Array<{ text?: unknown }> }).content.map((part) => typeof part.text === 'string' ? part.text : '').join('')
    : ''
  return { content, raw: payload }
}

async function forwardGoogleRequest(request: LocalProxyProviderRequest) {
  const apiKey = request.apiKey ?? ''
  const response = await fetch(`${joinUrl(request.baseUrl, `v1beta/models/${encodeURIComponent(request.model)}:generateContent`)}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: request.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
      systemInstruction: {
        parts: request.messages
          .filter((message) => message.role === 'system')
          .map((message) => ({ text: message.content })),
      },
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens ?? 900,
      },
    }),
  })
  const payload = await readProviderJson(response)
  const parts = (((payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> }).candidates ?? [])[0]?.content?.parts ?? [])
  return { content: parts.map((part) => typeof part.text === 'string' ? part.text : '').join(''), raw: payload }
}

async function forwardPixelLabRequest(request: LocalProxyProviderRequest) {
  const response = await fetch(joinUrl(request.baseUrl, 'generate'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(request.apiKey ? { Authorization: `Bearer ${request.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: request.model,
      prompt: request.messages.map((message) => `${message.role}: ${message.content}`).join('\n\n'),
    }),
  })
  const payload = await readProviderJson(response)
  return {
    content: stringFromPath(payload, ['content']) || stringFromPath(payload, ['message']) || stringFromPath(payload, ['status']) || 'PixelLab request accepted.',
    raw: payload,
  }
}

export function isLoopbackUrl(value: string) {
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) && allowedLoopbackHosts.has(parsed.hostname)
  } catch {
    return false
  }
}

function stringField(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Expected ${label}.`)
  return value.trim()
}

function optionalStringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function optionalNumberField(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function joinUrl(baseUrl: string, route: string) {
  const trimmedBase = baseUrl.replace(/\/+$/, '')
  if (trimmedBase.endsWith(route)) return trimmedBase
  return `${trimmedBase}/${route.replace(/^\/+/, '')}`
}

async function readProviderJson(response: Response) {
  const text = await response.text()
  const payload = text ? JSON.parse(text) as unknown : {}
  if (!response.ok) {
    const message = stringFromPath(payload, ['error', 'message']) || stringFromPath(payload, ['error']) || response.statusText
    throw new Error(`Provider request failed (${response.status}): ${message}`)
  }
  return payload
}

function stringFromPath(value: unknown, path: Array<string | number>) {
  let current = value
  for (const segment of path) {
    if (current === null || current === undefined) return ''
    current = (current as Record<string | number, unknown>)[segment]
  }
  return typeof current === 'string' ? current : ''
}
