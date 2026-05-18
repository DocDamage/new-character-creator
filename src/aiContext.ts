import type { MissingAnimationQueueItem } from './missingAnimationQueue'

export function buildAiGenerationContextQuery(
  item: MissingAnimationQueueItem,
  options: { characterId: string; targetProfile: string },
) {
  return [
    'AI generation context for missing animation layer',
    `Character: ${options.characterId}`,
    `Target profile: ${options.targetProfile}`,
    `Item: ${item.item_name} ${item.item_id}`,
    `Layer: ${item.layer_id}`,
    `Animation: ${item.requested_animation}`,
    `Body: ${item.body_type}`,
    `Warnings: ${item.warnings.join('; ')}`,
    'Need provider prompt guidance, review requirements, compatible LPC/APES context, and release blockers.',
  ].filter(Boolean).join('\n')
}
