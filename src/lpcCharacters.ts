import type { AnimationName, AnimationManifest, CharacterManifest, Direction, FrameRef, LpcAssetInventory } from './types'

const lpcDirectionRows: Array<[Direction, number]> = [
  ['south', 0],
  ['west', 1],
  ['east', 2],
  ['north', 3],
]

const preferredLpcCategories = new Set([
  'Adult Female',
  'Adult Male',
  'Adult Female, Pregnant',
  'Adult Male, Muscular',
  'Teen',
  'Androgynous Bases',
  'Stand & Walk Bases',
  'Bases',
])

export function buildLpcCharacterManifests(inventory: LpcAssetInventory | null): CharacterManifest[] {
  if (!inventory) return []

  return inventory.sheets
    .filter(isSelectableLpcCharacterSheet)
    .slice(0, 320)
    .map((sheet, index) => {
      const path = buildLpcSheetUrl(inventory, sheet.path) ?? sheet.path
      const animation = inferLpcAnimation(sheet.file_name)
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

function isSelectableLpcCharacterSheet(sheet: LpcAssetInventory['sheets'][number]) {
  if (!sheet.lpc_grid || sheet.frame_rows !== 4 || !sheet.frame_columns || sheet.frame_columns < 1) return false
  if (!preferredLpcCategories.has(sheet.category)) return false
  const normalized = [sheet.file_name, sheet.path, ...sheet.tags].join(' ').toLowerCase()
  if (normalized.includes('headless')) return false
  return /\bbase\b|stand|walk|idle|man_|woman_|child_|teen|adult/.test(normalized)
}

function inferLpcAnimation(fileName: string): AnimationName {
  const normalized = fileName.toLowerCase()
  if (normalized.includes('walk')) return 'walk'
  if (normalized.includes('run')) return 'walk'
  if (normalized.includes('jump')) return 'running_jump'
  if (normalized.includes('slash') || normalized.includes('attack') || normalized.includes('hurt')) return 'attack'
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
