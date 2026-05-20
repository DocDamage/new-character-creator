import type { AnimationName, Direction, PartLabel } from './types.ts'

export type AiRequestIntent = {
  actions: Array<'plan' | 'segment' | 'generate' | 'export' | 'review' | 'rag_search' | 'cleanup' | 'inspect' | 'compatibility' | 'audit' | 'bridge_setup' | 'source_ingestion'>
  providerHint?: 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'openrouter' | 'kimi' | 'ollama' | 'lm_studio' | 'pixellab' | 'local'
  outputFormat?: 'aseprite_reference' | 'generation_manifest' | 'full_package'
  animations: AnimationName[]
  directions: Direction[]
  layers: PartLabel[]
  reviewRequired: boolean
  prompt: string
}

const animationAliases: Array<{ animation: AnimationName; aliases: string[] }> = [
  { animation: 'idle', aliases: ['idle', 'standing', 'stand', 'breathing', 'rest', 'ready pose', 'neutral pose'] },
  { animation: 'walk', aliases: ['walk', 'walking', 'step', 'steps', 'walk cycle', 'moving'] },
  { animation: 'run', aliases: ['run', 'running', 'sprint', 'sprinting', 'dash', 'dashing', 'charge', 'charging'] },
  { animation: 'jump', aliases: ['jump', 'jumping', 'leap', 'leaping', 'hop', 'hopping'] },
  { animation: 'slide', aliases: ['slide', 'sliding', 'skid', 'skidding', 'dodge slide', 'dash slide'] },
  { animation: 'sitting', aliases: ['sitting', 'sit', 'seated', 'sit down', 'sitting down'] },
  { animation: 'emotes', aliases: ['emotes', 'emote', 'emoting', 'gesture', 'gestures', 'wave', 'waving', 'cheer', 'taunt', 'celebrate'] },
  { animation: 'spellcast', aliases: ['spellcast', 'spell cast', 'cast', 'casting', 'cast spell', 'magic', 'summon', 'channel', 'channeling'] },
  { animation: 'shoot', aliases: ['shoot', 'shooting', 'fire', 'firing', 'ranged attack', 'bow shot', 'arrow shot', 'gun shot', 'projectile'] },
  { animation: 'slash', aliases: ['slash', 'slashing', 'swing', 'swinging', 'sword swing', 'blade swing', 'melee swing'] },
  { animation: 'thrust', aliases: ['thrust', 'thrusting', 'stab', 'stabbing', 'poke', 'pierce', 'piercing', 'spear attack'] },
  { animation: 'hurt', aliases: ['hurt', 'hit reaction', 'take damage', 'taking damage', 'damage', 'damaged', 'flinch', 'flinching', 'recoil', 'stagger'] },
  { animation: 'attack', aliases: ['attack', 'attacks', 'attacking', 'strike', 'striking', 'melee attack', 'melee attacks', 'combat', 'fight', 'fighting'] },
  { animation: 'death', aliases: ['death', 'die', 'dying', 'dead', 'defeat', 'defeated', 'ko', 'knockout', 'fall down'] },
  { animation: 'block', aliases: ['block', 'blocking', 'guard', 'guarding', 'parry', 'parrying', 'defend', 'defending'] },
  { animation: 'roll', aliases: ['roll', 'rolling', 'dodge roll', 'tumble', 'tumbling', 'evade', 'evading'] },
]
const directionNames: Direction[] = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest']
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
  if (/\b(apes|segment|segmentation|mask|masks|extract|cut out|cutout|isolate|separate|split out|pull out|crop out|outline|trace|detect part|make a mask)\b/.test(normalized)) actions.add('segment')
  if (/\b(generate|generation|pixellab|pixel lab|pixel-lab|missing animation|missing frame|fill gap|animate|animation pass|sprite|make art|make a part|draw|create art|produce|synthesize|inbetween|in-between|variation|ai art|keyframe|keyframes|frame set|frames|pose|poses|motion|action cycle|animation cycle)\b/.test(normalized) || /\b(make|create|build|add|produce|draw|finish|fill in)\b.*\b(animation|cycle|frames?|poses?|motions?|actions?|attacks?)\b/.test(normalized)) actions.add('generate')
  if (/\b(export|download|save out|save as|aseprite|package|bundle|zip|manifest|handoff|hand off|send to|godot|unity|rpg maker|release file|json file)\b/.test(normalized)) actions.add('export')
  if (/\b(review|validate|qa|check|approve|accept|verify|test|confirm|ready|mark good|mark reviewed|is this ok|is it ok|good to go)\b/.test(normalized)) actions.add('review')
  if (/\b(rag|cite|citation|citations|context|docs?|documentation|knowledge|knowledge base|sources?|references?|look up|lookup|search docs|what do we know|what does .* know|according to)\b/.test(normalized)) actions.add('rag_search')
  if (/\b(cleanup|clean up|polish|fix|repair|tidy|refine|improve|correct|touch up|cleanup pass|make better|smooth out)\b/.test(normalized)) actions.add('cleanup')
  if (/\b(inspect|summarize|current recipe|selected character|recipe|what am i|right now|current work|doing now|what is this|what's this|where am i|status|state|show me what|tell me about|explain current|what am i looking at)\b/.test(normalized)) actions.add('inspect')
  if (/\b(lpc|compatib|alignment|align|line up|lining up|offset|wrong spot|wrong place|misplaced|layer order|layer stack|layering|wrong layer|z-order|z order|render order|fit|fits|work with|match body|body type)\b/.test(normalized)) actions.add('compatibility')
  if (/\b(audit|matrix|exhaustive|every combination|all combinations|render matrix|deep scan|full scan|sweep|verify all|check everything|all combos)\b/.test(normalized)) actions.add('audit')
  if (/\b(hook up|hooking up|connect|configure|setup|set up|bridge|wire up|wire|link|integrate|integration|endpoint|enable|turn on|use defaults|health check)\b/.test(normalized)) actions.add('bridge_setup')
  if (/\b(scan pc|scan computer|scan my computer|scan my pc|pc assets|local assets|find assets|look for assets|asset inventory|web rag|fetch web|crawl web|download sources|add sources|source ingestion|feed (the )?rag|feed (the )?knowledge|index sources|index assets)\b/.test(normalized)) actions.add('source_ingestion')
  if (actions.size === 0) actions.add('plan')

  return {
    actions: Array.from(actions),
    providerHint: inferProviderHint(normalized),
    outputFormat: inferOutputFormat(normalized),
    animations: inferAnimations(normalized),
    directions: inferDirections(normalized),
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
    intent.directions.length > 0 ? `directions=${intent.directions.join(',')}` : '',
    intent.layers.length > 0 ? `layers=${intent.layers.join(',')}` : '',
    `review=${intent.reviewRequired ? 'required' : 'not_requested'}`,
  ].filter(Boolean).join('; ')
}

function inferDirections(normalized: string): Direction[] {
  const directions = directionNames.filter((direction) => normalized.includes(direction))
  if (/\ball directions\b|\bevery direction\b|\b4 directions\b|\bfour directions\b/.test(normalized)) {
    return ['south', 'east', 'north', 'west']
  }
  return directions
}

function inferAnimations(normalized: string): AnimationName[] {
  const found: AnimationName[] = []
  for (const entry of animationAliases) {
    if (entry.aliases.some((alias) => hasPhrase(normalized, alias))) {
      found.push(entry.animation)
    }
  }
  return found
}

function hasPhrase(normalized: string, phrase: string) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`\\b${escaped}\\b`).test(normalized)
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
  if (normalized.includes('kimi') || normalized.includes('moonshot')) return 'kimi'
  if (normalized.includes('local')) return 'local'
  return undefined
}

function inferOutputFormat(normalized: string): AiRequestIntent['outputFormat'] {
  if (normalized.includes('aseprite')) return 'aseprite_reference'
  if (normalized.includes('full package')) return 'full_package'
  if (normalized.includes('manifest') || normalized.includes('handoff') || normalized.includes('export')) return 'generation_manifest'
  return undefined
}
