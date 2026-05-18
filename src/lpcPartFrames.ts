import { isLpcCloakSourceForLayer } from './lpcPartCompatibility'
import type { AnimationName, CharacterManifest, Direction, FrameRef, PartLabel } from './types'
import { getFrameRef } from './utils'

export function getLpcPartFrameRef(
  character: CharacterManifest,
  animation: AnimationName,
  direction: Direction,
  frameIndex: number,
  layerLabel: PartLabel,
): FrameRef | undefined {
  const exactFrame = getFrameRef(character, animation, direction, frameIndex)
  if (exactFrame || !isLpcCloakSourceForLayer(character, layerLabel)) return exactFrame

  for (const fallbackAnimation of getFallbackAnimations(character)) {
    const fallbackFrame = getFrameRef(character, fallbackAnimation, direction, frameIndex)
    if (fallbackFrame) return fallbackFrame
  }
  return undefined
}

function getFallbackAnimations(character: CharacterManifest) {
  return Array.from(new Set(['walk', 'idle', ...character.animation_names]))
}
