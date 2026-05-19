import { isLoopbackUrl } from './localProxyProviders.ts'

export type PixelLabBridgeRequest = {
  endpointUrl: string
  prompt: string
  animation?: string
}

export function validatePixelLabBridgeRequest(body: unknown): PixelLabBridgeRequest {
  if (!body || typeof body !== 'object') throw new Error('Expected JSON body.')
  const payload = body as Record<string, unknown>
  const endpointUrl = typeof payload.endpointUrl === 'string' ? payload.endpointUrl.trim() : ''
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  const animation = typeof payload.animation === 'string' ? payload.animation.trim() : undefined
  if (!isLoopbackUrl(endpointUrl)) throw new Error('PixelLab endpoint must be a loopback URL.')
  if (!prompt) throw new Error('PixelLab prompt is required.')
  return { endpointUrl, prompt, animation }
}

export function normalizePixelLabSpriteOutput(value: unknown) {
  if (!value || typeof value !== 'object') return { frames: [], warnings: ['PixelLab returned no JSON object.'] }
  const payload = value as Record<string, unknown>
  return {
    frames: Array.isArray(payload.frames) ? payload.frames : [],
    spritesheet: typeof payload.spritesheet === 'string' ? payload.spritesheet : null,
    warnings: Array.isArray(payload.warnings) ? payload.warnings.filter((item) => typeof item === 'string') : [],
  }
}
