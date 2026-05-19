import type { AiProviderConnection } from './types'

export type AiSecretVault = {
  set: (providerId: string, secret: string) => void
  get: (providerId: string) => string | null
  has: (providerId: string) => boolean
  clear: (providerId: string) => void
  clearAll: () => void
  snapshot: () => Record<string, boolean>
  count: () => number
}

const secretLikePattern = /(?:sk|pk|key|token|secret)[A-Za-z0-9_\-.:/+=]{6,}/gi

export function createAiSecretVault(): AiSecretVault {
  const secrets = new Map<string, string>()
  return {
    set(providerId, secret) {
      const trimmed = secret.trim()
      if (trimmed) secrets.set(providerId, trimmed)
      else secrets.delete(providerId)
    },
    get(providerId) {
      return secrets.get(providerId) ?? null
    },
    has(providerId) {
      return secrets.has(providerId)
    },
    clear(providerId) {
      secrets.delete(providerId)
    },
    clearAll() {
      secrets.clear()
    },
    snapshot() {
      return Object.fromEntries([...secrets.keys()].map((key) => [key, true]))
    },
    count() {
      return secrets.size
    },
  }
}

export function redactSecretValue(value: string): string {
  return value.trim() ? '[redacted]' : ''
}

export function redactSecretText(value: string): string {
  return value.replace(secretLikePattern, '[redacted]')
}

export function serializeProviderConfigForStorage(providers: AiProviderConnection[]): AiProviderConnection[] {
  return providers.map((provider) => ({
    ...provider,
    secret_session_set: false,
    direct_browser_calls: false,
    local_proxy_required: true,
    notes: redactSecretText(provider.notes),
  }))
}
