import type { Direction, ExtractedPart, LayerBundleManifest, LpcAssetInventory, PartLabel, Rect } from './types'
import { localFsPathPrefix, localToolPath } from './localToolsClient.ts'

export type LpcSheetImportOptions = {
  sheetPaths?: string[]
  labelOverride?: PartLabel | 'infer'
  reviewed?: boolean
}

const defaultBounds: Rect = { x: 0, y: 0, w: 64, h: 64 }
const validPartLabels = new Set<string>([
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
  'feet',
  'front_hand',
  'back_hand',
  'legs',
])
const labelHints: Array<[PartLabel, string[]]> = [
  ['hair_hat_hood', ['hair', 'hat', 'hood', 'helmet']],
  ['head', ['head', 'face_skin', 'skin']],
  ['face', ['face', 'eyes', 'nose', 'mouth', 'beard']],
  ['torso', ['torso', 'body', 'shirt', 'armor', 'dress', 'chest']],
  ['front_arm', ['arm', 'sleeve', 'glove']],
  ['legs', ['leg', 'pants', 'trousers']],
  ['feet', ['feet', 'boot', 'shoe']],
  ['weapon', ['weapon', 'sword', 'bow', 'axe', 'staff', 'wand']],
  ['shield', ['shield']],
  ['cloak_back', ['cloak', 'cape']],
  ['back_item', ['backpack', 'quiver', 'wings']],
  ['aura_effect', ['aura', 'effect', 'magic']],
  ['accessory', ['accessory', 'jewelry', 'earring', 'belt']],
]

export function parseLayerBundleManifest(text: string): LayerBundleManifest {
  const parsed = JSON.parse(text) as unknown
  if (!isRecord(parsed) || parsed.format !== 'pixel_creator_layer_bundle' || !Array.isArray(parsed.parts)) {
    throw new Error('Expected a pixel_creator_layer_bundle JSON file with a parts array.')
  }
  if (typeof parsed.bundle_id !== 'string' || !parsed.bundle_id.trim()) {
    throw new Error('Layer bundle is missing a non-empty bundle_id.')
  }
  if (typeof parsed.version !== 'number' || parsed.version < 1) {
    throw new Error('Layer bundle is missing a valid numeric version.')
  }
  const bundle = parsed as LayerBundleManifest
  validateLayerBundleParts(bundle)
  return bundle
}

export function layerBundleToExtractedParts(bundle: LayerBundleManifest): ExtractedPart[] {
  return bundle.parts.map((part, index) => {
    const bounds = part.image.bounds ?? part.mask?.bounds ?? defaultBounds
    const partId = part.id || `${bundle.bundle_id}_${part.label}_${String(index + 1).padStart(3, '0')}`
    return {
      part_id: partId,
      character_id: part.source_character || bundle.source || bundle.bundle_id,
      label: part.label,
      source_animation: part.animation ?? 'idle',
      source_direction: part.direction ?? 'south',
      source_frame_path: part.image.path,
      image_path: part.image.path || `${partId}.png`,
      mask_path: part.mask?.path,
      image_data_url: part.image.data_url ?? part.image.url ?? part.image.path,
      mask_data_url: part.mask?.data_url ?? part.mask?.url ?? part.mask?.path,
      anchor: part.image.anchor ?? part.mask?.anchor ?? { x: bounds.x + Math.round(bounds.w / 2), y: bounds.y + Math.round(bounds.h / 2) },
      bounds,
      extraction_method: 'manual',
      compatibility: { animations: [part.animation ?? 'idle'], directions: [part.direction ?? 'south'] },
      reviewed: false,
      tags: ['layer_bundle', bundle.bundle_id, ...(part.tags ?? [])],
      warnings: ['Imported from a layer bundle; review fit and source license before release.', ...(part.warnings ?? [])],
    }
  })
}

function validateLayerBundleParts(bundle: LayerBundleManifest) {
  const seenIds = new Set<string>()
  bundle.parts.forEach((part, index) => {
    if (!validPartLabels.has(part.label)) {
      throw new Error(`Layer bundle part ${index + 1} has invalid label "${String(part.label)}".`)
    }
    const partId = part.id || `${bundle.bundle_id}_${part.label}_${String(index + 1).padStart(3, '0')}`
    if (seenIds.has(partId)) {
      throw new Error(`Layer bundle contains duplicate part id "${partId}".`)
    }
    seenIds.add(partId)
    if (!isRecord(part.image)) {
      throw new Error(`Layer bundle part ${partId} is missing an image object.`)
    }
    const imageSource = part.image.data_url ?? part.image.url ?? part.image.path
    if (typeof imageSource !== 'string' || !imageSource.trim()) {
      throw new Error(`Layer bundle part ${partId} is missing an image path, URL, or data URL.`)
    }
    validateSafeSource(imageSource, `image source for ${partId}`)
    if (part.mask) {
      const maskSource = part.mask.data_url ?? part.mask.url ?? part.mask.path
      if (maskSource) validateSafeSource(maskSource, `mask source for ${partId}`)
    }
    validateRect(part.image.bounds, `image bounds for ${partId}`)
    validateRect(part.mask?.bounds, `mask bounds for ${partId}`)
  })
}

function validateRect(rect: Rect | undefined, label: string) {
  if (!rect) return
  const values = [rect.x, rect.y, rect.w, rect.h]
  if (!values.every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error(`Layer bundle ${label} must contain non-negative integer x, y, w, and h values.`)
  }
  if (rect.w < 1 || rect.h < 1 || rect.w > 2048 || rect.h > 2048) {
    throw new Error(`Layer bundle ${label} has an unsupported size ${rect.w}x${rect.h}.`)
  }
}

function validateSafeSource(source: string, label: string) {
  if (source.startsWith('data:image/')) return
  if (source.startsWith('http://') || source.startsWith('https://')) return
  const normalized = source.replaceAll('\\', '/')
  if (/^[a-zA-Z]:\//.test(normalized)) {
    throw new Error(`Layer bundle ${label} must not use a Windows absolute path.`)
  }
  if (normalized.split('/').includes('..')) {
    throw new Error(`Layer bundle ${label} must not contain path traversal segments.`)
  }
  if (normalized.startsWith(localFsPathPrefix()) || normalized.startsWith(localToolPath(''))) {
    throw new Error(`Layer bundle ${label} must not use local server-only paths.`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function lpcSheetsToExtractedParts(inventory: LpcAssetInventory, limitOrOptions: number | LpcSheetImportOptions = 12): ExtractedPart[] {
  const options: LpcSheetImportOptions = typeof limitOrOptions === 'number' ? {} : limitOrOptions
  const requestedPaths = new Set(options.sheetPaths ?? [])
  const sourceSheets = requestedPaths.size > 0
    ? inventory.sheets.filter((sheet) => requestedPaths.has(sheet.path))
    : inventory.sheets.slice(0, typeof limitOrOptions === 'number' ? limitOrOptions : 12)

  return sourceSheets.map((sheet, index) => {
    const label = options.labelOverride && options.labelOverride !== 'infer'
      ? options.labelOverride
      : inferLpcPartLabel(sheet)
    const imagePath = buildLpcSheetUrl(inventory, sheet.path) ?? sheet.path
    const creditTag = `credit_files_${inventory.summary.credit_file_count}`
    return {
      part_id: `lpc_${slugPath(sheet.path)}_${String(index + 1).padStart(3, '0')}`,
      character_id: 'lpc_imported_sheet',
      label,
      source_animation: 'idle',
      source_direction: 'south' as Direction,
      source_frame_path: imagePath,
      image_path: imagePath,
      image_data_url: imagePath,
      anchor: { x: 32, y: 32 },
      bounds: { x: 0, y: 0, w: Math.min(sheet.frame_width || 64, 64), h: Math.min(sheet.frame_height || 64, 64) },
      extraction_method: 'manual',
      compatibility: { animations: ['idle', 'walk'], directions: ['south', 'east', 'north', 'west'] },
      reviewed: options.reviewed === true,
      tags: ['lpc', sheet.category, `lpc_source_${slugPath(sheet.path)}`, sheet.lpc_grid ? 'lpc_grid' : 'non_lpc_grid', creditTag, ...sheet.tags],
      warnings: [
        'Imported from an LPC sheet; select/review the intended frame and credit/license metadata before production export.',
        inventory.summary.credit_file_count > 0 ? `${inventory.summary.credit_file_count} LPC credit/license file(s) are present in the inventory; verify attribution before release.` : 'No LPC credit/license files were found in the inventory; verify attribution before release.',
        sheet.lpc_grid ? '' : 'Sheet does not match the expected LPC grid dimensions.',
      ].filter(Boolean),
    }
  })
}

export function buildLpcSheetUrl(inventory: LpcAssetInventory, sheetPath: string) {
  const assetRoot = inventory.source.asset_root.replaceAll('\\', '/')
  const assetsIndex = assetRoot.toLowerCase().lastIndexOf('/assets/')
  if (assetsIndex < 0) return undefined
  const assetsRelativeRoot = assetRoot.slice(assetsIndex + '/assets/'.length)
  return `/assets/${assetsRelativeRoot}/${sheetPath.replaceAll('\\', '/')}`.replaceAll('//', '/')
}

export function inferLpcPartLabel(sheet: LpcAssetInventory['sheets'][number]): PartLabel {
  const normalized = [sheet.category, sheet.file_name, ...sheet.tags].join(' ').toLowerCase()
  return labelHints.find(([, hints]) => hints.some((hint) => normalized.includes(hint)))?.[0] ?? 'accessory'
}

function slugPath(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'sheet'
}
