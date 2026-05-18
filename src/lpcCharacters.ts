import type { AnimationName, AnimationManifest, CharacterManifest, Direction, FrameRef, LpcAssetInventory, PartLabel } from './types'

const lpcDirectionRows: Array<[Direction, number]> = [
  ['north', 0],
  ['east', 1],
  ['south', 2],
  ['west', 3],
]

const maxLpcBaseSheets = 360
const maxLpcPartSheetsPerLabel = 180
const animationOrder = ['idle', 'walk', 'run', 'jump', 'sitting', 'emotes', 'spellcast', 'shoot', 'slash', 'thrust', 'hurt', 'attack']
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
type LpcSheet = LpcAssetInventory['sheets'][number]
type LpcAnimationSlice = {
  name: AnimationName
  rowStart: number
  rowCount: number
  frameCount: number
}
type LpcSheetGroup = {
  key: string
  role: 'base' | 'part'
  label: PartLabel
  sheets: LpcSheet[]
}

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

export function buildLpcCharacterManifests(inventory: LpcAssetInventory | null): CharacterManifest[] {
  if (!inventory) return []

  const selectableSheets = inventory.sheets
    .filter(isSelectableLpcSheet)
    .sort((left, right) => lpcSheetSortScore(left) - lpcSheetSortScore(right) || left.path.localeCompare(right.path))

  const sheetGroups = Array.from(groupLpcSheets(selectableSheets).values())
    .sort((left, right) => lpcSheetSortScore(left.sheets[0]) - lpcSheetSortScore(right.sheets[0]) || left.key.localeCompare(right.key))

  const baseGroups = sheetGroups
    .filter((group) => group.role === 'base' && isUsableLpcBaseGroup(group))
    .slice(0, maxLpcBaseSheets)
  const partGroupsByLabel = new Map<PartLabel, LpcSheetGroup[]>()
  for (const group of sheetGroups) {
    if (group.role === 'base') continue
    const bucket = partGroupsByLabel.get(group.label) ?? []
    bucket.push(group)
    partGroupsByLabel.set(group.label, bucket)
  }
  const partGroups = Array.from(partGroupsByLabel.values()).flatMap(limitLpcPartGroups)

  return [...baseGroups, ...partGroups]
    .map((group, index) => {
      const animations = buildLpcAnimations(inventory, group.sheets)
      const animationNames = animations.map((animation) => animation.name)
      const directionRecords = Object.fromEntries(
        lpcDirectionRows.map(([direction]) => [
          direction,
          Object.fromEntries(animations.map((animation) => [
            animation.name,
            {
              frame_count: animation.directions[direction]?.length ?? 0,
              frames: animation.directions[direction] ?? [],
            },
          ])),
        ]),
      ) as CharacterManifest['directions']
      const representativeFrame =
        getRepresentativeFrame(animations, 'idle') ??
        getRepresentativeFrame(animations, 'walk') ??
        animations[0]?.directions.south?.[0]
      const displayPath = group.key.replace(/\.png$/i, '').replaceAll('\\', '/').split('/').filter(Boolean).slice(-3).join(' / ')
      const displayName = displayPath.startsWith('LPC ') ? displayPath : `LPC ${displayPath}`

      return {
        character_id: `lpc-${slugLpcId(group.key)}-${String(index + 1).padStart(3, '0')}`,
        display_name: displayName,
        class_type: 'lpc_character',
        labels: {
          source_pack: 'lpc',
          lpc_path: group.key,
          lpc_category: group.sheets[0]?.category,
          lpc_role: group.role,
          lpc_part_label: group.label,
        },
        source_folder: buildLpcSheetUrl(inventory, group.sheets[0]?.path ?? group.key) ?? group.key,
        canvas_size: { width: 64, height: 64 },
        directions: directionRecords,
        animations,
        animation_names: animationNames,
        source_quality_warnings: [
          'LPC source sheet is used by cropping 64x64 cells; verify row/action mapping before production export.',
          'Verify LPC attribution/license metadata before release.',
        ],
        rotation_preview_paths: lpcDirectionRows.map(([direction]) => ({
          direction,
          path: representativeFrame?.path ?? buildLpcSheetUrl(inventory, group.sheets[0]?.path ?? group.key) ?? group.key,
        })),
        representative_frame: representativeFrame?.path ?? buildLpcSheetUrl(inventory, group.sheets[0]?.path ?? group.key) ?? group.key,
        extraction_status: {
          frame_chopped: true,
          preset_regions_available: true,
          connected_pixel_pass_available: true,
          apes_pass_available: false,
          manual_cleanup_complete: false,
        },
      }
    })
}

function isSelectableLpcSheet(sheet: LpcAssetInventory['sheets'][number]) {
  const animation = inferLpcAnimation(sheet)
  const isDirectionalSheet = sheet.frame_rows === 4
  const isSingleRowHurtSheet = animation === 'hurt' && sheet.frame_rows === 1
  const isClassicSheet = isClassicLpcSheet(sheet)
  if (!sheet.lpc_grid || (!isDirectionalSheet && !isSingleRowHurtSheet && !isClassicSheet) || !sheet.frame_columns || sheet.frame_columns < 1) return false
  const normalized = [sheet.file_name, sheet.path, ...sheet.tags].join(' ').toLowerCase()
  if (normalized.includes('headless')) return false
  return isLpcBaseSheet(sheet) || /\b(hair|hairs|hat|hats|hood|hoods|helmet|helmets|shirt|shirts|pants|skirt|skirts|dress|dresses|shoe|shoes|boot|boots|armor|armour|weapon|weapons|sword|swords|bow|bows|shield|shields|cape|capes|cloak|cloaks|quiver|quivers|backpack|backpacks|wings|beard|beards|eyes|ears|face|head|heads|glove|gloves|hand|hands|feet|backa|backb|accessory|accessories)\b/.test(normalized)
}

export function isLpcBaseSheet(sheet: LpcAssetInventory['sheets'][number]) {
  if (isLpcBodyBaseSheet(sheet)) return true
  const normalized = [sheet.category, sheet.file_name, sheet.path, ...sheet.tags].join(' ').toLowerCase()
  const path = sheet.path.replaceAll('\\', '/').toLowerCase()
  const fileAndTags = [sheet.file_name, ...sheet.tags].join(' ').toLowerCase()
  if (/\b(clothes?|hair|hairs|helmet|helmets|weapon|weapons|shield|shields|armor|armour|pants|shirt|shirts|shoe|shoes|boot|boots|cape|capes|cloak|cloaks|hat|hats|hood|hoods|beard|beards|eyes|ears|glove|gloves)\b/.test(normalized)) return false
  return /\bbase\b/.test(fileAndTags) || path.includes('/bases/') || sheet.category.toLowerCase().includes('bases')
}

function lpcSheetSortScore(sheet: LpcAssetInventory['sheets'][number]) {
  const normalized = [sheet.category, sheet.file_name, sheet.path, ...sheet.tags].join(' ').toLowerCase()
  if (isLpcBaseSheet(sheet)) return 0
  if (/\b(hair|hat|hood|helmet|shirt|pants|shoe|armor|weapon|shield|cape|cloak)\b/.test(normalized)) return 1
  return 2
}

function groupLpcSheets(sheets: LpcSheet[]) {
  const groups = new Map<string, LpcSheetGroup>()
  for (const sheet of sheets) {
    const role = isLpcBaseSheet(sheet) ? 'base' : 'part'
    const label = inferLpcPartLabelForCharacter(sheet)
    const key = buildLpcGroupKey(sheet)
    const group = groups.get(key) ?? { key, role, label, sheets: [] }
    group.sheets.push(sheet)
    groups.set(key, group)
  }
  return groups
}

function isUsableLpcBaseGroup(group: LpcSheetGroup) {
  const animations = new Set(group.sheets.map((sheet) => inferLpcAnimation(sheet)))
  return animations.has('idle') || animations.has('walk') || group.sheets.some(isClassicLpcSheet) || group.sheets.some(isLpcBodyBaseSheet)
}

function limitLpcPartGroups(groups: LpcSheetGroup[]) {
  if (groups.length <= maxLpcPartSheetsPerLabel) return groups
  const selected: LpcSheetGroup[] = []
  const selectedKeys = new Set<string>()
  const buckets = animationOrder.map((animation) => groups.filter((group) => groupHasAnimation(group, animation as AnimationName)))
  const maxBucketLength = Math.max(...buckets.map((bucket) => bucket.length))
  for (let index = 0; index < maxBucketLength && selected.length < maxLpcPartSheetsPerLabel; index += 1) {
    for (const bucket of buckets) {
      const group = bucket[index]
      if (!group || selectedKeys.has(group.key)) continue
      selected.push(group)
      selectedKeys.add(group.key)
      if (selected.length >= maxLpcPartSheetsPerLabel) break
    }
  }
  for (const group of groups) {
    if (selected.length >= maxLpcPartSheetsPerLabel) break
    if (selectedKeys.has(group.key)) continue
    selected.push(group)
    selectedKeys.add(group.key)
  }
  return selected
}

function groupHasAnimation(group: LpcSheetGroup, animation: AnimationName) {
  return group.sheets.some((sheet) => getLpcAnimationSlices(sheet).some((slice) => slice.name === animation))
}

function buildLpcAnimations(inventory: LpcAssetInventory, sheets: LpcSheet[]): AnimationManifest[] {
  const animationSheets = [...sheets].sort((left, right) => animationSortScore(getLpcAnimationSlices(left)[0]?.name ?? inferLpcAnimation(left)) - animationSortScore(getLpcAnimationSlices(right)[0]?.name ?? inferLpcAnimation(right)) || left.path.localeCompare(right.path))
  const usedAnimations = new Set<string>()
  const animations: AnimationManifest[] = []
  for (const sheet of animationSheets) {
    const path = buildLpcSheetUrl(inventory, sheet.path) ?? sheet.path
    for (const slice of getLpcAnimationSlices(sheet)) {
      if (usedAnimations.has(slice.name)) continue
      usedAnimations.add(slice.name)
      const framesByDirection = Object.fromEntries(
        lpcDirectionRows.map(([direction, row]) => [
          direction,
          buildLpcFrames(
            path,
            sheet.file_name,
            Math.min(slice.frameCount, sheet.frame_columns ?? slice.frameCount),
            slice.rowStart + Math.min(row, slice.rowCount - 1),
            sheet.frame_width || 64,
            sheet.frame_height || 64,
          ),
        ]),
      ) as Partial<Record<Direction, FrameRef[]>>
      animations.push({
        name: slice.name,
        source_names: [sheet.file_name],
        directions: framesByDirection,
        preview_gifs: [],
      })
    }
  }
  return animations
}

function getLpcAnimationSlices(sheet: LpcSheet): LpcAnimationSlice[] {
  if (isClassicLpcSheet(sheet)) {
    return classicLpcAnimationSlices
  }
  return [{
    name: inferLpcAnimation(sheet),
    rowStart: 0,
    rowCount: sheet.frame_rows ?? 1,
    frameCount: sheet.frame_columns ?? 1,
  }]
}

function isClassicLpcSheet(sheet: LpcSheet) {
  return (sheet.frame_columns ?? 0) >= 13 && (sheet.frame_rows ?? 0) >= 21
}

function isLpcBodyBaseSheet(sheet: LpcSheet) {
  return Boolean(getLpcBodyBaseGroupKey(sheet))
}

function getLpcBodyBaseGroupKey(sheet: LpcSheet) {
  const normalizedPath = sheet.path.replaceAll('\\', '/').toLowerCase()
  if (normalizedPath.includes('/combat_dummy/')) return undefined
  const normalizedFile = normalizeActionSegment(sheet.file_name.replace(/\.png$/i, ''))
  const alias = lpcBodyBaseAliases.get(normalizedFile)
  return alias ? `LPC Entry Bodies/${alias}` : undefined
}

function getRepresentativeFrame(animations: AnimationManifest[], animationName: AnimationName) {
  return animations.find((animation) => animation.name === animationName)?.directions.south?.[0]
}

function buildLpcGroupKey(sheet: LpcSheet) {
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

function isActionSegment(segment: string) {
  return lpcActionSegments.has(normalizeActionSegment(segment))
}

function normalizeActionSegment(segment: string) {
  return segment.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function animationSortScore(animation: AnimationName) {
  const index = animationOrder.indexOf(animation)
  return index >= 0 ? index : animationOrder.length
}

function inferLpcPartLabelForCharacter(sheet: LpcAssetInventory['sheets'][number]): PartLabel {
  const path = sheet.path.replaceAll('\\', '/').toLowerCase()
  const fileName = sheet.file_name.toLowerCase()
  const normalized = [sheet.category, sheet.file_name, sheet.path, ...sheet.tags].join(' ').toLowerCase()
  if (/\b(face|eyes|eye|ears|ear|nose|mouth|beard)\b/.test(normalized)) return 'face'
  if (/\b(adult_heads?|child_heads?)\b/.test(normalized) || path.includes('/body/adult heads/') || path.includes('/body/child heads/')) return 'head'
  if (/\b(backa|backb|quiver|backpack|wings)\b/.test(normalized) || fileName.startsWith('behind_')) return 'back_item'
  if (fileName.startsWith('weapon_')) return fileName.includes('shield') ? 'shield' : 'weapon'
  if (fileName.startsWith('belt_') || fileName.startsWith('body_')) return 'accessory'
  if (path.includes('/feet_') || fileName.startsWith('feet_')) return 'front_leg'
  if (path.includes('/hands_') || fileName.startsWith('hands_')) return 'front_arm'
  if (path.includes('/legs_') || fileName.startsWith('legs_')) return 'front_leg'
  if (path.includes('/head_') || fileName.startsWith('head_')) return 'hair_hat_hood'
  if (path.includes('/torso_') || fileName.startsWith('torso_')) return 'torso'

  const tokens = getNormalizedTokens(normalized)
  return lpcPartLabelHints.find(([, hints]) => hints.some((hint) => matchesLpcHint(normalized, tokens, hint)))?.[0] ?? 'accessory'
}

const lpcPartLabelHints: Array<[PartLabel, string[]]> = [
  ['hair_hat_hood', ['hair', 'hat', 'hood', 'helmet']],
  ['face', ['face', 'eyes', 'ears', 'nose', 'mouth', 'beard']],
  ['front_leg', ['leg', 'pants', 'trousers', 'feet', 'boot', 'shoe']],
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

function inferLpcAnimation(sheet: LpcAssetInventory['sheets'][number]): AnimationName {
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

function buildLpcSheetUrl(inventory: LpcAssetInventory, sheetPath: string) {
  const assetRoot = inventory.source.asset_root.replaceAll('\\', '/')
  const assetsIndex = assetRoot.toLowerCase().lastIndexOf('/assets/')
  if (assetsIndex < 0) return undefined
  const assetsRelativeRoot = assetRoot.slice(assetsIndex + '/assets/'.length)
  return `/assets/${assetsRelativeRoot}/${sheetPath.replaceAll('\\', '/')}`.replaceAll('//', '/')
}

function buildLpcFrames(path: string, fileName: string, columns: number, row: number, frameWidth: number, frameHeight: number): FrameRef[] {
  return Array.from({ length: columns }, (_, index) => ({
    index,
    path,
    file_name: `${fileName}#${row}-${index}`,
    width: 64,
    height: 64,
    source_rect: {
      x: index * frameWidth,
      y: row * frameHeight,
      w: frameWidth,
      h: frameHeight,
    },
  }))
}

function slugLpcId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'sheet'
}
