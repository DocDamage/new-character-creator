import type { AnimationName, LpcAssetInventory, PartLabel } from './types'

export type LpcSheet = LpcAssetInventory['sheets'][number]
export type LpcAnimationSlice = {
  name: AnimationName
  rowStart: number
  rowCount: number
  frameCount: number
}

export const animationOrder = ['idle', 'walk', 'run', 'jump', 'sitting', 'emotes', 'spellcast', 'shoot', 'slash', 'thrust', 'hurt', 'attack']

const lpcActionSegments = new Set([
  ...animationOrder,
  'walkcycle',
  'sit',
  'emote',
  'magic',
  'spell',
  'swing',
  'bow',
])

const classicLpcAnimationSlices: LpcAnimationSlice[] = [
  { name: 'spellcast', rowStart: 0, rowCount: 4, frameCount: 7 },
  { name: 'thrust', rowStart: 4, rowCount: 4, frameCount: 8 },
  { name: 'walk', rowStart: 8, rowCount: 4, frameCount: 9 },
  { name: 'slash', rowStart: 12, rowCount: 4, frameCount: 6 },
  { name: 'shoot', rowStart: 16, rowCount: 4, frameCount: 13 },
  { name: 'hurt', rowStart: 20, rowCount: 1, frameCount: 6 },
]

const lpcBodyBaseAliases = new Map<string, string>([
  ['bodyanimation', 'Human Male'],
  ['bodyhuman', 'Human Male'],
  ['bodymale', 'Human Male'],
  ['bodyskeleton', 'Skeleton'],
])

const lpcPartLabelHints: Array<[PartLabel, string[]]> = [
  ['hair_hat_hood', ['hair', 'hat', 'hood', 'helmet']],
  ['face', ['face', 'eyes', 'ears', 'nose', 'mouth', 'beard']],
  ['legs', ['leg', 'legs', 'pants', 'trousers', 'skirt']],
  ['feet', ['feet', 'boot', 'shoe']],
  ['front_arm', ['glove', 'hands']],
  ['shield', ['shield']],
  ['weapon', ['weapon', 'sword', 'bow', 'axe', 'staff', 'wand']],
  ['cloak_back', ['cloak', 'cape']],
  ['back_item', ['backpack', 'quiver', 'wings']],
  ['aura_effect', ['aura', 'effect', 'magic']],
  ['torso', ['torso', 'body', 'shirt', 'sleeve', 'armor', 'armour', 'dress', 'chest']],
  ['head', ['head', 'face_skin', 'skin']],
  ['accessory', ['accessory', 'jewelry', 'earring', 'belt']],
]

export function lpcSheetSortScore(sheet: LpcSheet) {
  const normalized = [sheet.category, sheet.file_name, sheet.path, ...sheet.tags].join(' ').toLowerCase()
  if (isLpcRevisedBodyBaseSheet(sheet)) return -3
  if (sheet.tags.includes('androgynous_bases')) return -2
  if (sheet.tags.includes('stand_walk_bases')) return -1
  if (isLpcBaseSheet(sheet)) return 0
  if (/\b(hair|hat|hood|helmet|shirt|pants|shoe|armor|weapon|shield|cape|cloak)\b/.test(normalized)) return 1
  return 2
}

export function isLpcBaseSheet(sheet: LpcSheet) {
  if (isLpcBodyBaseSheet(sheet)) return true
  if (isLpcRevisedBodyBaseSheet(sheet)) return true
  const normalized = [sheet.category, sheet.file_name, sheet.path, ...sheet.tags].join(' ').toLowerCase()
  const path = sheet.path.replaceAll('\\', '/').toLowerCase()
  const fileAndTags = [sheet.file_name, ...sheet.tags].join(' ').toLowerCase()
  if (/\b(clothes?|hair|hairs|helmet|helmets|weapon|weapons|shield|shields|armor|armour|pants|shirt|shirts|shoe|shoes|boot|boots|cape|capes|cloak|cloaks|hat|hats|hood|hoods|beard|beards|eyes|ears|glove|gloves)\b/.test(normalized)) return false
  return /\bbase\b/.test(fileAndTags) || path.includes('/bases/') || sheet.category.toLowerCase().includes('bases')
}

export function isLpcBodyBaseSheet(sheet: LpcSheet) {
  return Boolean(getLpcBodyBaseGroupKey(sheet))
}

export function isClassicLpcSheet(sheet: LpcSheet) {
  return (sheet.frame_columns ?? 0) >= 13 && (sheet.frame_rows ?? 0) >= 21
}

export function inferLpcAnimation(sheet: LpcSheet): AnimationName {
  const segments = sheet.path
    .replace(/\.png$/i, '')
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean)
  const fileAction = inferActionFromPathSegment(segments.at(-1) ?? '', true)
  if (fileAction) return fileAction
  for (const segment of segments.slice(0, -1).reverse()) {
    const parentAction = inferActionFromPathSegment(segment, false)
    if (parentAction) return parentAction
  }
  return 'idle'
}

export function getLpcAnimationSlices(sheet: LpcSheet): LpcAnimationSlice[] {
  if (isClassicLpcSheet(sheet)) {
    return classicLpcAnimationSlices
  }
  const animation = inferLpcAnimation(sheet)
  return [{
    name: animation,
    rowStart: 0,
    rowCount: sheet.frame_rows ?? 1,
    frameCount: getLpcFrameCount(sheet, animation),
  }]
}

export function buildLpcGroupKey(sheet: LpcSheet) {
  const bodyBaseKey = getLpcBodyBaseGroupKey(sheet)
  if (bodyBaseKey) return bodyBaseKey
  const normalizedPath = sheet.path.replaceAll('\\', '/')
  const pathWithoutExtension = normalizedPath.replace(/\.png$/i, '')
  const segments = pathWithoutExtension.split('/').filter(Boolean)
  const fileSegment = segments.at(-1) ?? ''
  if (isActionSegment(fileSegment)) {
    return segments.slice(0, -1).join('/')
  }
  const actionSegmentIndex = segments.findIndex((segment, index) => index < segments.length - 1 && isActionSegment(segment))
  if (actionSegmentIndex >= 0) {
    return segments.filter((_, index) => index !== actionSegmentIndex).join('/')
  }
  return pathWithoutExtension
}

export function inferLpcPartLabelForCharacter(sheet: LpcSheet): PartLabel {
  const path = sheet.path.replaceAll('\\', '/').toLowerCase()
  const fileName = sheet.file_name.toLowerCase()
  const normalized = [sheet.category, sheet.file_name, sheet.path, ...sheet.tags].join(' ').toLowerCase()
  if (/\b(face|eyes|eye|ears|ear|nose|mouth|beard)\b/.test(normalized)) return 'face'
  if (/\b(adult_heads?|child_heads?)\b/.test(normalized) || path.includes('/body/adult heads/') || path.includes('/body/child heads/')) return 'head'
  if (/\b(backa|backb|quiver|backpack|wings)\b/.test(normalized) || fileName.startsWith('behind_')) return 'back_item'
  if (fileName.startsWith('weapon_')) return fileName.includes('shield') ? 'shield' : 'weapon'
  if (fileName.startsWith('belt_') || fileName.startsWith('body_')) return 'accessory'
  if (path.includes('/feet_') || fileName.startsWith('feet_')) return 'feet'
  if (path.includes('/hands_') || fileName.startsWith('hands_')) return 'front_arm'
  if (path.includes('/legs_') || fileName.startsWith('legs_')) return 'legs'
  if (path.includes('/head_') || fileName.startsWith('head_')) return 'hair_hat_hood'
  if (path.includes('/torso_') || fileName.startsWith('torso_')) return 'torso'

  const tokens = getNormalizedTokens(normalized)
  return lpcPartLabelHints.find(([, hints]) => hints.some((hint) => matchesLpcHint(normalized, tokens, hint)))?.[0] ?? 'accessory'
}

export function animationSortScore(animation: AnimationName) {
  const index = animationOrder.indexOf(animation)
  return index >= 0 ? index : animationOrder.length
}

function getLpcFrameCount(sheet: LpcSheet, animation: AnimationName) {
  const columns = sheet.frame_columns ?? 1
  if (!hasTrailingPaletteColumn(sheet)) return columns

  const canonicalSplitCounts: Partial<Record<string, number>> = {
    idle: 1,
    walk: 8,
    spellcast: 7,
    shoot: 13,
    slash: 6,
    thrust: 8,
    hurt: 6,
  }
  return Math.min(columns, canonicalSplitCounts[animation] ?? Math.max(1, columns - 1))
}

function hasTrailingPaletteColumn(sheet: LpcSheet) {
  return sheet.tags.includes('androgynous_bases') || sheet.tags.includes('stand_walk_bases')
}

function isLpcRevisedBodyBaseSheet(sheet: LpcSheet) {
  const path = sheet.path.replaceAll('\\', '/').toLowerCase()
  if (!path.startsWith('[lpc revised] character basics/body/')) return false
  if (path.includes('/adult heads/') || path.includes('/child heads/')) return false
  if (path.includes('/_ guides & palettes/')) return false
  return sheet.tags.includes('body') && Boolean(inferActionFromPathSegment(sheet.file_name.replace(/\.png$/i, ''), true))
}

function getLpcBodyBaseGroupKey(sheet: LpcSheet) {
  const normalizedPath = sheet.path.replaceAll('\\', '/').toLowerCase()
  if (normalizedPath.includes('/combat_dummy/')) return undefined
  const normalizedFile = normalizeActionSegment(sheet.file_name.replace(/\.png$/i, ''))
  const alias = lpcBodyBaseAliases.get(normalizedFile)
  return alias ? `LPC Entry Bodies/${alias}` : undefined
}

function isActionSegment(segment: string) {
  return lpcActionSegments.has(normalizeActionSegment(segment))
}

function normalizeActionSegment(segment: string) {
  return segment.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function inferActionFromPathSegment(segment: string, allowTokenMatch: boolean): AnimationName | undefined {
  const exact = canonicalLpcAction(normalizeActionSegment(segment))
  if (exact) return exact
  if (!allowTokenMatch) return undefined
  for (const token of segment.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    const tokenAction = canonicalLpcAction(token)
    if (tokenAction) return tokenAction
  }
  return undefined
}

function canonicalLpcAction(value: string): AnimationName | undefined {
  if (value === 'walkcycle' || value === 'walk') return 'walk'
  if (value === 'run') return 'run'
  if (value === 'jump') return 'jump'
  if (value === 'sitting' || value === 'sit') return 'sitting'
  if (value === 'emotes' || value === 'emote') return 'emotes'
  if (value === 'magic' || value === 'spellcast' || value === 'spell') return 'spellcast'
  if (value === 'shoot' || value === 'bow') return 'shoot'
  if (value === 'swing' || value === 'slash') return 'slash'
  if (value === 'thrust') return 'thrust'
  if (value === 'attack') return 'attack'
  if (value === 'hurt') return 'hurt'
  if (value === 'idle') return 'idle'
  return undefined
}

function getNormalizedTokens(value: string) {
  return new Set(value.split(/[^a-z0-9]+/).filter(Boolean))
}

function matchesLpcHint(normalized: string, tokens: Set<string>, hint: string) {
  if (hint.includes('_')) {
    return normalized.includes(hint) || normalized.includes(hint.replaceAll('_', ' '))
  }
  return tokens.has(hint)
}
