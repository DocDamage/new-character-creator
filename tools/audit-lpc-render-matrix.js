import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lpcFrameGeometry, resolveLpcLayerAsset } from '../src/lpcAssetResolver.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultCatalogPath = path.join(repoRoot, 'data', 'lpc', 'lpc_catalog.json')
const directions = ['north', 'east', 'south', 'west']

export function runLpcRenderMatrixAudit(options = {}) {
  const catalogPath = options.catalogPath ?? defaultCatalogPath
  if (!existsSync(catalogPath)) {
    return { skipped: true, reason: `LPC catalog not found at ${catalogPath}` }
  }

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  const referenceRoot = catalog.source?.reference_root
  if (!referenceRoot || !existsSync(referenceRoot)) {
    return { skipped: true, reason: `LPC reference root not found at ${referenceRoot || '[missing]'}` }
  }

  const availablePaths = discoverPngPaths(path.join(referenceRoot, 'spritesheets'))
  const pngSizeCache = new Map()
  const sourceGeometryChecks = new Set()
  const criticalIssues = []
  const sourceRectIssues = []
  const destinationRectIssues = []
  const missingByAnimation = {}
  const unsupportedByAnimation = {}
  const fallbackByAnimation = {}
  const exactByAnimation = {}
  let drawRecordsChecked = 0
  let exactRecordsChecked = 0
  let fallbackRecordsChecked = 0
  let missingRecordsChecked = 0
  let unsupportedRecordsChecked = 0

  const animations = Object.keys(lpcFrameGeometry)
  const items = Object.values(catalog.items ?? {})
  for (const item of items) {
    const variants = item.variants?.length ? item.variants : ['']
    const bodyTypes = bodyTypesForItem(item)
    for (const variant of variants) {
      for (const bodyType of bodyTypes) {
        for (const animation of animations) {
          const geometry = lpcFrameGeometry[animation]
          const matrixCellCount = directionsForGeometry(geometry).length * geometry.frame_count
          for (const direction of directionsForGeometry(geometry)) {
            if (direction !== directionsForGeometry(geometry)[0]) continue
            for (let frameIndex = 0; frameIndex < 1; frameIndex += 1) {
              const records = (item.layers ?? []).map((layer) => ({
                record_id: `${item.item_id}:${layer.layer_id}`,
                ...resolveLpcLayerAsset({
                  item,
                  layer,
                  variant,
                  bodyType,
                  animation,
                  direction,
                  frameIndex,
                  availablePaths,
                  exportProfile: geometry.oversize ? 'oversize' : 'standard_64',
                }),
              }))
              for (const record of records) {
                drawRecordsChecked += matrixCellCount
                if (record.animation_status === 'exact') {
                  exactRecordsChecked += matrixCellCount
                  exactByAnimation[record.resolved_animation ?? animation] = (exactByAnimation[record.resolved_animation ?? animation] ?? 0) + matrixCellCount
                } else if (record.animation_status === 'fallback') {
                  fallbackRecordsChecked += matrixCellCount
                  fallbackByAnimation[record.resolved_animation ?? 'unknown'] = (fallbackByAnimation[record.resolved_animation ?? 'unknown'] ?? 0) + matrixCellCount
                } else if (record.animation_status === 'missing') {
                  missingRecordsChecked += matrixCellCount
                  missingByAnimation[record.resolved_animation ?? animation] = (missingByAnimation[record.resolved_animation ?? animation] ?? 0) + matrixCellCount
                  continue
                } else if (record.animation_status === 'unsupported') {
                  unsupportedRecordsChecked += matrixCellCount
                  unsupportedByAnimation[record.resolved_animation ?? animation] = (unsupportedByAnimation[record.resolved_animation ?? animation] ?? 0) + matrixCellCount
                  continue
                }

                if (!record.source_path || !record.source_rect) {
                  criticalIssues.push(`${record.record_id} ${animation}/${direction}/${frameIndex} resolved ${record.animation_status} without source geometry`)
                  continue
                }
                if (!availablePaths.has(record.source_path)) {
                  criticalIssues.push(`${record.record_id} ${animation}/${direction}/${frameIndex} points at missing ${record.source_path}`)
                  continue
                }
                const sourceGeometryKey = `${record.source_path}|${record.resolved_animation ?? animation}`
                if (!sourceGeometryChecks.has(sourceGeometryKey)) {
                  sourceGeometryChecks.add(sourceGeometryKey)
                  const png = readCachedPngSize(pngSizeCache, referenceRoot, record.source_path)
                  const sourceRect = maxSourceRectFor(record.resolved_animation ?? animation, record.source_path)
                  if (!rectInsideImage(sourceRect, png)) {
                    sourceRectIssues.push({
                      record_id: record.record_id,
                      source_path: record.source_path,
                      animation: record.resolved_animation ?? animation,
                      direction: 'max',
                      frame_index: 'max',
                      source_rect: sourceRect,
                      image: { width: png.width, height: png.height },
                    })
                  }
                }
                if (!validDestinationRect(record.dest_rect, geometry.oversize)) {
                  destinationRectIssues.push({
                    record_id: record.record_id,
                    animation,
                    direction,
                    frame_index: frameIndex,
                    dest_rect: record.dest_rect,
                  })
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    skipped: false,
    catalog_path: catalogPath,
    reference_root: referenceRoot,
    available_png_paths: availablePaths.size,
    unique_source_geometries_checked: sourceGeometryChecks.size,
    catalog_items_checked: items.length,
    draw_records_checked: drawRecordsChecked,
    exact_records_checked: exactRecordsChecked,
    fallback_records_checked: fallbackRecordsChecked,
    missing_records_checked: missingRecordsChecked,
    unsupported_records_checked: unsupportedRecordsChecked,
    exact_by_animation: exactByAnimation,
    fallback_by_animation: fallbackByAnimation,
    missing_by_animation: missingByAnimation,
    unsupported_by_animation: unsupportedByAnimation,
    critical_issues: criticalIssues.slice(0, 100),
    source_rect_issues: sourceRectIssues.slice(0, 100),
    destination_rect_issues: destinationRectIssues.slice(0, 100),
  }
}

function discoverPngPaths(root) {
  const paths = new Set()
  if (!existsSync(root)) return paths
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(child)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        paths.add(`spritesheets/${path.relative(root, child).replaceAll('\\', '/')}`)
      }
    }
  }
  return paths
}

function bodyTypesForItem(item) {
  const bodyTypes = new Set(item.required_body_types ?? [])
  for (const layer of item.layers ?? []) {
    for (const bodyType of Object.keys(layer.paths_by_body_type ?? {})) bodyTypes.add(bodyType)
  }
  return Array.from(bodyTypes).sort()
}

function directionsForGeometry(geometry) {
  return directions.filter((direction) => geometry.direction_rows.includes(direction))
}

function readCachedPngSize(cache, referenceRoot, sourcePath) {
  const filePath = path.join(referenceRoot, sourcePath.replace(/^spritesheets\//, 'spritesheets/'))
  const cached = cache.get(filePath)
  if (cached) return cached
  const size = readPngSize(filePath)
  cache.set(filePath, size)
  return size
}

function readPngSize(filePath) {
  const fd = openSync(filePath, 'r')
  try {
    const buffer = Buffer.allocUnsafe(24)
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0)
    if (bytesRead < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
      return { width: 0, height: 0 }
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  } finally {
    closeSync(fd)
  }
}

function rectInsideImage(rect, image) {
  return rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0 && rect.x + rect.w <= image.width && rect.y + rect.h <= image.height
}

function maxSourceRectFor(animation, sourcePath) {
  const geometry = lpcFrameGeometry[animation] ?? lpcFrameGeometry.walk
  const frameCount = animation === 'shoot' && sourcePath.includes('/feet/accessory/plate_toe/')
    ? 8
    : geometry.frame_count
  return {
    x: (frameCount - 1) * geometry.frame_width,
    y: (geometry.direction_rows.length - 1) * geometry.frame_height,
    w: geometry.frame_width,
    h: geometry.frame_height,
  }
}

function validDestinationRect(rect, oversize) {
  if (!rect || rect.w <= 0 || rect.h <= 0) return false
  if (oversize) return rect.w >= 64 && rect.h >= 64
  return rect.x === 0 && rect.y === 0 && rect.w === 64 && rect.h === 64
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const audit = runLpcRenderMatrixAudit()
  console.log(JSON.stringify(audit, null, 2))
  if (!audit.skipped && (audit.critical_issues.length > 0 || audit.source_rect_issues.length > 0 || audit.destination_rect_issues.length > 0)) {
    process.exitCode = 1
  }
}
