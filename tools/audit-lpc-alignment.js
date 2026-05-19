import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLpcCharacterManifests } from '../src/lpcCharacters.ts'
import { alphaMaskHash, alphaOverlapRatio, alphaStats, readPngFile, rectInsideImage } from './png-alpha-utils.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultInventoryPath = path.join(repoRoot, 'data', 'lpc', 'lpc_asset_inventory.json')
const directions = ['north', 'east', 'south', 'west']
const bodyBoundLabels = new Set(['legs', 'torso', 'front_arm', 'feet'])
const minimumBodyOverlap = 0.12

export function runLpcAlignmentAudit(options = {}) {
  const inventoryPath = options.inventoryPath ?? defaultInventoryPath
  if (!existsSync(inventoryPath)) {
    return {
      skipped: true,
      reason: `LPC inventory not found at ${inventoryPath}`,
    }
  }

  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
  const characters = buildLpcCharacterManifests(inventory)
  const baseCharacters = characters.filter((character) => character.labels?.lpc_role === 'base')
  const partCharacters = characters.filter((character) => character.labels?.lpc_role === 'part')
  const pngCache = new Map()
  const criticalIssues = []
  const warnings = []
  const emptyCellsByAnimation = {}
  const baseMaskVariants = []
  const bodyOverlapIssues = []
  let partFrameCellsChecked = 0
  let bodyOverlapCellsChecked = 0
  let bodyOverlapEmptyCellsSkipped = 0
  let bodyOverlapNoSignatureSkipped = 0
  let bodyOverlapNoBaseSkipped = 0

  const baseRepresentatives = new Map()
  for (const baseCharacter of baseCharacters) {
    const signature = bodySignature(baseCharacter)
    if (signature === 'unknown') continue
    if (!baseRepresentatives.has(signature)) baseRepresentatives.set(signature, baseCharacter)
  }

  for (const [signature, signatureBases] of groupBy(baseCharacters, bodySignature)) {
    if (signature === 'unknown') continue
    const representative = signatureBases[0]
    for (const baseCharacter of signatureBases.slice(1)) {
      for (const animation of commonAnimations(representative, baseCharacter)) {
        for (const direction of directions) {
          const representativeFrames = representative.directions[direction]?.[animation]?.frames ?? []
          const baseFrames = baseCharacter.directions[direction]?.[animation]?.frames ?? []
          const frameCount = Math.min(representativeFrames.length, baseFrames.length)
          for (let index = 0; index < frameCount; index += 1) {
            const representativeHash = alphaMaskHash(readCachedPng(pngCache, representativeFrames[index].path), sourceRect(representativeFrames[index]))
            const baseHash = alphaMaskHash(readCachedPng(pngCache, baseFrames[index].path), sourceRect(baseFrames[index]))
            if (representativeHash !== baseHash) {
              baseMaskVariants.push({
                signature,
                representative: representative.labels.lpc_path,
                variant: baseCharacter.labels.lpc_path,
                animation,
                direction,
                frame: index,
              })
            }
          }
        }
      }
    }
  }

  for (const character of partCharacters) {
    const label = character.labels?.lpc_part_label ?? 'unknown'
    const signature = bodySignature(character)
    for (const animation of character.animation_names) {
      for (const direction of directions) {
        const frames = character.directions[direction]?.[animation]?.frames ?? []
        for (const frame of frames) {
          partFrameCellsChecked += 1
          const rect = sourceRect(frame)
          const png = readCachedPng(pngCache, frame.path)
          if (!rectInsideImage(rect, png)) {
            criticalIssues.push(`${character.labels.lpc_path} ${animation}/${direction}/${frame.index} crops outside ${png.width}x${png.height}`)
            continue
          }

          const stats = alphaStats(png, rect)
          if (stats.opaquePixels === 0) {
            emptyCellsByAnimation[animation] = (emptyCellsByAnimation[animation] ?? 0) + 1
            if (bodyBoundLabels.has(label)) bodyOverlapEmptyCellsSkipped += 1
            continue
          }

          if (!bodyBoundLabels.has(label)) continue
          if (signature === 'unknown') {
            bodyOverlapNoSignatureSkipped += 1
            continue
          }

          const baseCharacter = baseRepresentatives.get(signature)
          const baseFrame = baseCharacter?.directions[direction]?.[animation]?.frames?.[
            frame.index % (baseCharacter.directions[direction]?.[animation]?.frames?.length ?? 1)
          ]
          if (!baseCharacter || !baseFrame) {
            bodyOverlapNoBaseSkipped += 1
            continue
          }

          const overlap = alphaOverlapRatio(png, rect, readCachedPng(pngCache, baseFrame.path), sourceRect(baseFrame))
          bodyOverlapCellsChecked += 1
          if (overlap < minimumBodyOverlap) {
            bodyOverlapIssues.push({
              part: character.labels.lpc_path,
              base: baseCharacter.labels.lpc_path,
              label,
              animation,
              direction,
              frame: frame.index,
              overlap: Number(overlap.toFixed(3)),
              partBounds: stats.bounds,
            })
          }
        }
      }
    }
  }

  if (baseMaskVariants.length > 0) {
    warnings.push(`${baseMaskVariants.length} same-signature base frame(s) have different alpha silhouettes; representative overlap checks may need per-variant review.`)
  }
  if (bodyOverlapEmptyCellsSkipped > 0) {
    warnings.push(`${bodyOverlapEmptyCellsSkipped} body-bound part frame(s) were empty and skipped for overlap checks.`)
  }

  return {
    skipped: false,
    inventoryPath,
    sourceCharacters: characters.length,
    baseCharacters: baseCharacters.length,
    partCharacters: partCharacters.length,
    partFrameCellsChecked,
    bodyOverlapCellsChecked,
    bodyOverlapEmptyCellsSkipped,
    bodyOverlapNoSignatureSkipped,
    bodyOverlapNoBaseSkipped,
    emptyCellsByAnimation,
    criticalIssues,
    bodyOverlapIssues,
    baseMaskVariantCount: baseMaskVariants.length,
    baseMaskVariantSamples: baseMaskVariants.slice(0, 20),
    warnings,
  }
}

function readCachedPng(cache, browserPath) {
  const filePath = path.join(repoRoot, browserPath.replace(/^\/assets\//, 'assets/'))
  const cached = cache.get(filePath)
  if (cached) return cached
  const png = readPngFile(filePath)
  cache.set(filePath, png)
  return png
}

function sourceRect(frame) {
  return frame.source_rect ?? { x: 0, y: 0, w: 64, h: 64 }
}

function commonAnimations(left, right) {
  const rightAnimations = new Set(right.animation_names)
  return left.animation_names.filter((animation) => rightAnimations.has(animation))
}

function groupBy(values, keyForValue) {
  const groups = new Map()
  for (const value of values) {
    const key = keyForValue(value)
    const group = groups.get(key) ?? []
    group.push(value)
    groups.set(key, group)
  }
  return groups
}

function bodySignature(character) {
  const normalized = String(character.labels?.lpc_path ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  const signatures = [
    'feminine thin',
    'masculine thin',
    'feminine muscular',
    'masculine muscular',
    'androgynous',
    'pregnant',
    'muscular',
    'teen',
    'child',
    'human male',
    'skeleton',
  ]
  const match = signatures.find((signature) => normalized.includes(signature))
  return match ? match.replaceAll(' ', '_') : 'unknown'
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const audit = runLpcAlignmentAudit()
  console.log(JSON.stringify(audit, null, 2))
  if (!audit.skipped && (audit.criticalIssues.length > 0 || audit.bodyOverlapIssues.length > 0)) {
    process.exitCode = 1
  }
}
