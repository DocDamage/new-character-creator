import { isLoopbackUrl } from './localProxyProviders.ts'
import { normalizePixelLabSpriteOutput } from '../src/pixellabOutput.ts'

export type PixelLabBridgeRequest = {
  endpointUrl: string
  prompt: string
  animation?: string
  mcpServerUrl?: string
  model?: string
  directions?: string[]
  layers?: string[]
}

export type PixelLabBridgeResponse = {
  ok: true
  bridge: 'pixellab'
  content: string
  frames: string[]
  spritesheet: string | null
  warnings: string[]
  raw: unknown
}

export function validatePixelLabBridgeRequest(body: unknown): PixelLabBridgeRequest {
  if (!body || typeof body !== 'object') throw new Error('Expected JSON body.')
  const payload = body as Record<string, unknown>
  const endpointUrl = typeof payload.endpointUrl === 'string' ? payload.endpointUrl.trim() : ''
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  const animation = typeof payload.animation === 'string' ? payload.animation.trim() : undefined
  const mcpServerUrl = typeof payload.mcpServerUrl === 'string' ? payload.mcpServerUrl.trim() : undefined
  const model = typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : undefined
  const directions = arrayOfStrings(payload.directions)
  const layers = arrayOfStrings(payload.layers)
  if (!isLoopbackUrl(endpointUrl)) throw new Error('PixelLab endpoint must be a loopback URL.')
  if (mcpServerUrl) {
    let parsed: URL
    try {
      parsed = new URL(mcpServerUrl)
    } catch {
      throw new Error('PixelLab MCP server URL is invalid.')
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.pixellab.ai') {
      throw new Error('PixelLab MCP server URL must use https://api.pixellab.ai.')
    }
  }
  if (!prompt) throw new Error('PixelLab prompt is required.')
  return { endpointUrl, prompt, animation, mcpServerUrl, model, directions, layers }
}

export async function submitPixelLabBridgeRequest(
  request: PixelLabBridgeRequest,
  options: { fetchImpl?: typeof fetch; authHeader?: string } = {},
): Promise<PixelLabBridgeResponse> {
  const fetchImpl = options.fetchImpl ?? fetch
  const authHeader = options.authHeader ?? pixelLabAuthHeader()
  const response = await fetchImpl(joinUrl(request.endpointUrl, 'generate'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({
      prompt: request.prompt,
      model: request.model ?? 'sprite-animation',
      animation: request.animation,
      directions: request.directions ?? [],
      layers: request.layers ?? [],
      mcp_server_url: request.mcpServerUrl,
    }),
  })
  const raw = await readJsonResponse(response)
  const normalized = normalizePixelLabSpriteOutput(raw)
  const acceptedMessage = stringFromPath(raw, ['content']) ||
    stringFromPath(raw, ['message']) ||
    stringFromPath(raw, ['status']) ||
    'PixelLab request accepted.'
  return {
    ok: true,
    bridge: 'pixellab',
    content: acceptedMessage,
    frames: normalized.frames,
    spritesheet: normalized.spritesheet,
    warnings: normalized.warnings,
    raw,
  }
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : undefined
}

function joinUrl(baseUrl: string, route: string) {
  const trimmedBase = baseUrl.replace(/\/+$/, '')
  if (trimmedBase.endsWith(route)) return trimmedBase
  return `${trimmedBase}/${route.replace(/^\/+/, '')}`
}

async function readJsonResponse(response: Response) {
  const text = await response.text()
  const payload = text ? JSON.parse(text) as unknown : {}
  if (!response.ok) {
    const message = stringFromPath(payload, ['error', 'message']) || stringFromPath(payload, ['error']) || response.statusText
    throw new Error(`PixelLab bridge request failed (${response.status}): ${message}`)
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

function pixelLabAuthHeader() {
  const explicit = process.env.PIXELLAB_AUTH_HEADER?.trim()
  if (explicit) return explicit
  const token = process.env.PIXELLAB_API_TOKEN?.trim()
  return token ? `Bearer ${token}` : ''
}

export { normalizePixelLabSpriteOutput }
