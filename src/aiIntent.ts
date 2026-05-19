import type { AnimationName, PartLabel } from './types.ts'

export type AiRequestIntent = {
  actions: Array<'plan' | 'segment' | 'generate' | 'export' | 'review' | 'rag_search' | 'cleanup' | 'inspect' | 'compatibility' | 'audit' | 'bridge_setup' | 'source_ingestion'>
  providerHint?: 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'openrouter' | 'ollama' | 'lm_studio' | 'pixellab' | 'local'
  outputFormat?: 'aseprite_reference' | 'generation_manifest' | 'full_package'
  animations: AnimationName[]
  layers: PartLabel[]
  reviewRequired: boolean
  prompt: string
}

const animationNames: AnimationName[] = ['idle', 'walk', 'run', 'jump', 'sitting', 'emotes', 'spellcast', 'shoot', 'slash', 'thrust', 'hurt', 'attack']
const layerNames: PartLabel[] = [
  'shadow',
  'back_item',
  'cloak_back',
  'back_arm',
  'back_leg',
  'torso',
  'front_leg',
  'front_arm',
  'neck',
  'head',
  'face',
  'hair_hat_hood',
  'weapon',
  'shield',
  'accessory',
  'aura_effect',
]

export function parseAiRequestIntent(request: string): AiRequestIntent {
  const normalized = request.toLowerCase()
  const actions = new Set<AiRequestIntent['actions'][number]>()
  if (/\b(apes|segment|mask|extract)\b/.test(normalized)) actions.add('segment')
  if (/\b(generate|pixellab|missing animation|animate|sprite)\b/.test(normalized)) actions.add('generate')
  if (/\b(export|aseprite|package|manifest|handoff)\b/.test(normalized)) actions.add('export')
  if (/\b(review|validate|qa|check|approve)\b/.test(normalized)) actions.add('review')
  if (/\b(rag|cite|context|docs?)\b/.test(normalized)) actions.add('rag_search')
  if (/\b(cleanup|clean up|polish|fix)\b/.test(normalized)) actions.add('cleanup')
  if (/\b(inspect|summarize|current recipe|selected character|recipe|what am i|right now|current work|doing now)\b/.test(normalized)) actions.add('inspect')
  if (/\b(lpc|compatib|alignment|align|layer order|layering|layer)\b/.test(normalized)) actions.add('compatibility')
  if (/\b(audit|matrix|exhaustive|every combination|render matrix)\b/.test(normalized)) actions.add('audit')
  if (/\b(hook up|hooking up|connect|configure|setup|bridge)\b/.test(normalized)) actions.add('bridge_setup')
  if (/\b(scan pc|pc assets|web rag|fetch web|download sources|source ingestion|feed (the )?rag)\b/.test(normalized)) actions.add('source_ingestion')
  if (actions.size === 0) actions.add('plan')

  return {
    actions: Array.from(actions),
    providerHint: inferProviderHint(normalized),
    outputFormat: inferOutputFormat(normalized),
    animations: animationNames.filter((animation) => normalized.includes(animation)),
    layers: layerNames.filter((layer) => normalized.includes(layer) || normalized.includes(layer.replaceAll('_', ' '))),
    reviewRequired: !/\b(skip review|auto approve|auto-approve)\b/.test(normalized),
    prompt: request.trim(),
  }
}

export function summarizeAiIntent(intent: AiRequestIntent) {
  return [
    `actions=${intent.actions.join(',')}`,
    intent.providerHint ? `provider=${intent.providerHint}` : '',
    intent.outputFormat ? `output=${intent.outputFormat}` : '',
    intent.animations.length > 0 ? `animations=${intent.animations.join(',')}` : '',
    intent.layers.length > 0 ? `layers=${intent.layers.join(',')}` : '',
    `review=${intent.reviewRequired ? 'required' : 'not_requested'}`,
  ].filter(Boolean).join('; ')
}

function inferProviderHint(normalized: string): AiRequestIntent['providerHint'] {
  if (normalized.includes('pixellab')) return 'pixellab'
  if (normalized.includes('ollama')) return 'ollama'
  if (normalized.includes('lm studio') || normalized.includes('lm_studio')) return 'lm_studio'
  if (normalized.includes('openai') || normalized.includes('gpt')) return 'openai'
  if (normalized.includes('anthropic') || normalized.includes('claude')) return 'anthropic'
  if (normalized.includes('gemini') || normalized.includes('google')) return 'google'
  if (normalized.includes('mistral')) return 'mistral'
  if (normalized.includes('groq')) return 'groq'
  if (normalized.includes('openrouter')) return 'openrouter'
  if (normalized.includes('local')) return 'local'
  return undefined
}

function inferOutputFormat(normalized: string): AiRequestIntent['outputFormat'] {
  if (normalized.includes('aseprite')) return 'aseprite_reference'
  if (normalized.includes('full package')) return 'full_package'
  if (normalized.includes('manifest') || normalized.includes('handoff') || normalized.includes('export')) return 'generation_manifest'
  return undefined
}
