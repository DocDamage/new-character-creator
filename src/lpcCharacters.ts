import type { AnimationName, AnimationManifest, CharacterManifest, Direction, FrameRef, LpcAssetInventory, PartLabel } from './types'

const lpcDirectionRows: Array<[Direction, number]> = [
  ['north', 0],
  ['east', 1],
  ['south', 2],
  ['west', 3],
]

const maxLpcBaseSheets = 360
const maxLpcPartSheetsPerLabel = 180

export function buildLpcCharacterManifests(inventory: LpcAssetInventory | null): CharacterManifest[] {
  if (!inventory) return []

  const selectableSheets = inventory.sheets
    .filter(isSelectableLpcSheet)
    .sort((left, right) => lpcSheetSortScore(left) - lpcSheetSortScore(right) || left.path.localeCompare(right.path))

  const baseSheets = selectableSheets
    .filter(isLpcBaseSheet)
    .slice(0, maxLpcBaseSheets)
  const partSheetsByLabel = new Map<PartLabel, LpcAssetInventory['sheets']>()
  for (const sheet of selectableSheets) {
    if (isLpcBaseSheet(sheet)) continue
    const label = inferLpcPartLabelForCharacter(sheet)
    const bucket = partSheetsByLabel.get(label) ?? []
    if (bucket.length >= maxLpcPartSheetsPerLabel) continue
    bucket.push(sheet)
    partSheetsByLabel.set(label, bucket)
  }
  const partSheets = Array.from(partSheetsByLabel.values()).flat()

  return [...baseSheets, ...partSheets]
    .map((sheet, index) => {
      const path = buildLpcSheetUrl(inventory, sheet.path) ?? sheet.path
      const animation = inferLpcAnimation(sheet)
      const role = isLpcBaseSheet(sheet) ? 'base' : 'part'
      const partLabel = inferLpcPartLabelForCharacter(sheet)
      const framesByDirection = Object.fromEntries(
        lpcDirectionRows.map(([direction, row]) => [
          direction,
          buildLpcFrames(path, sheet.file_name, sheet.frame_columns ?? 1, row, sheet.frame_width || 64, sheet.frame_height || 64),
        ]),
      ) as Partial<Record<Direction, FrameRef[]>>
      const animations: AnimationManifest[] = [{
        name: animation,
        source_names: [sheet.file_name],
        directions: framesByDirection,
        preview_gifs: [],
      }]
      const directionRecords = Object.fromEntries(
        lpcDirectionRows.map(([direction]) => [
          direction,
          {
            [animation]: {
              frame_count: framesByDirection[direction]?.length ?? 0,
              frames: framesByDirection[direction] ?? [],
            },
          },
        ]),
      ) as CharacterManifest['directions']
      const representativeFrame = framesByDirection.south?.[0]
      const displayName = `LPC ${sheet.path.replace(/\.png$/i, '').replaceAll('\\', '/').split('/').filter(Boolean).slice(-3).join(' / ')}`

      return {
        character_id: `lpc-${slugLpcId(sheet.path)}-${String(index + 1).padStart(3, '0')}`,
        display_name: displayName,
        class_type: 'lpc_character',
        labels: {
          source_pack: 'lpc',
          lpc_path: sheet.path,
          lpc_category: sheet.category,
          lpc_role: role,
          lpc_part_label: partLabel,
        },
        source_folder: path,
        canvas_size: { width: 64, height: 64 },
        directions: directionRecords,
        animations,
        animation_names: [animation],
        source_quality_warnings: [
          'LPC source sheet is used by cropping 64x64 cells; verify row/action mapping before production export.',
          'Verify LPC attribution/license metadata before release.',
        ],
        rotation_preview_paths: lpcDirectionRows.map(([direction]) => ({
          direction,
          path,
        })),
        representative_frame: representativeFrame?.path ?? path,
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
  if (!sheet.lpc_grid || sheet.frame_rows !== 4 || !sheet.frame_columns || sheet.frame_columns < 1) return false
  const normalized = [sheet.file_name, sheet.path, ...sheet.tags].join(' ').toLowerCase()
  if (normalized.includes('headless')) return false
  return isLpcBaseSheet(sheet) || /\b(hair|hairs|hat|hats|hood|hoods|helmet|helmets|shirt|shirts|pants|skirt|skirts|dress|dresses|shoe|shoes|boot|boots|armor|armour|weapon|weapons|sword|swords|bow|bows|shield|shields|cape|capes|cloak|cloaks|beard|beards|eyes|ears|glove|gloves)\b/.test(normalized)
}

export function isLpcBaseSheet(sheet: LpcAssetInventory['sheets'][number]) {
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

function inferLpcPartLabelForCharacter(sheet: LpcAssetInventory['sheets'][number]): PartLabel {
  const path = sheet.path.replaceAll('\\', '/').toLowerCase()
  const fileName = sheet.file_name.toLowerCase()
  if (path.includes('/feet_') || fileName.startsWith('feet_')) return 'front_leg'
  if (path.includes('/hands_') || fileName.startsWith('hands_')) return 'front_arm'
  if (path.includes('/legs_') || fileName.startsWith('legs_')) return 'front_leg'
  if (path.includes('/head_') || fileName.startsWith('head_')) return 'hair_hat_hood'
  if (path.includes('/torso_') || fileName.startsWith('torso_')) return 'torso'

  const normalized = [sheet.category, sheet.file_name, sheet.path, ...sheet.tags].join(' ').toLowerCase()
  return lpcPartLabelHints.find(([, hints]) => hints.some((hint) => normalized.includes(hint)))?.[0] ?? 'accessory'
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
  const normalizedSegments = sheet.path
    .replace(/\.png$/i, '')
    .replaceAll('\\', '/')
    .split('/')
    .flatMap((segment) => segment.toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean)
  const segmentSet = new Set(normalizedSegments)
  if (segmentSet.has('walkcycle')) return 'walkcycle'
  if (segmentSet.has('walk')) return 'walk'
  if (segmentSet.has('run')) return 'run'
  if (segmentSet.has('jump')) return 'jump'
  if (segmentSet.has('sitting') || segmentSet.has('sit')) return 'sitting'
  if (segmentSet.has('emotes') || segmentSet.has('emote')) return 'emotes'
  if (segmentSet.has('magic')) return 'magic'
  if (segmentSet.has('shoot')) return 'shoot'
  if (segmentSet.has('swing')) return 'swing'
  if (segmentSet.has('spellcast') || segmentSet.has('spell')) return 'spellcast'
  if (segmentSet.has('thrust')) return 'thrust'
  if (segmentSet.has('slash')) return 'slash'
  if (segmentSet.has('bow')) return 'bow'
  if (segmentSet.has('attack')) return 'attack'
  if (segmentSet.has('hurt')) return 'hurt'
  if (segmentSet.has('idle')) return 'idle'
  return 'idle'
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
