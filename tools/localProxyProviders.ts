export type LocalProxyProviderRequest = {
  provider: string
  baseUrl: string
  model: string
  messages: Array<{ role: string; content: string }>
}

const allowedLoopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])

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
  return { provider, baseUrl, model, messages }
}

export function providerRequiresProxy(provider: string) {
  return !['ollama', 'lm_studio'].includes(provider)
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
