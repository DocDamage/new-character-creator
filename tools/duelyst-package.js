import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const defaultPackagePath = path.resolve('assets', 'Duelyst-Unit-Animations.unitypackage')
const positiveHumanoidPattern = /general|sister|siren|pyromancer|guard|guardian|mage|mancer|vanguard|dragoon|seeker|weaver|caligrapher|champion|heir|kage|blade|raider|tracker|hunter|warrior|priest|templar|knight|soldier|windslicer|ritualist|herald/i
const negativeCreaturePattern = /golem|mech|crawler|crab|beast|hound|wing|dragon|wisp|obelysk|cannon|quillbeast|flumposaur|owlbear|beholder|serpenti|spelljammer|trinitywing|monster|artifact|magma|horror|demon|burrower|mecha/i
const preferredAnimationNames = ['idle', 'breathing', 'run', 'attack', 'hit', 'death']

export async function inspectDuelystPackage(appRoot, options = {}) {
  const packagePath = path.resolve(appRoot, options.packagePath || defaultPackagePath)
  const stageTopCount = clampStageCount(options.stageTopCount)

  if (!fs.existsSync(packagePath)) {
    return {
      generated_at: new Date().toISOString(),
      package_path: packagePath,
      available: false,
      extraction_root: '',
      total_assets: 0,
      extension_counts: {},
      candidate_units: [],
      staged_manifest: {
        generated_at: new Date().toISOString(),
        package_path: packagePath,
        character_count: 0,
        characters: [],
      },
      findings: [`Package not found at ${packagePath}.`],
      summary: 'Duelyst package not found.',
    }
  }

  const extractionRoot = ensurePackageExtraction(appRoot, packagePath)
  const entries = readExtractedEntries(extractionRoot)
  const extensionCounts = countExtensions(entries)
  const stageRoot = path.resolve(appRoot, 'data', 'cache', 'duelyst-stage')
  fs.mkdirSync(stageRoot, { recursive: true })

  const units = buildUnitRecords(entries, packagePath)
  const scoredCandidates = scoreAndStageCandidates(units, stageRoot).sort((left, right) => right.score - left.score || left.display_name.localeCompare(right.display_name))
  const stagedCandidates = scoredCandidates.filter((candidate) => candidate.staged_frame_url).slice(0, stageTopCount)
  const stagedIds = new Set(stagedCandidates.map((candidate) => candidate.unit_id))
  const candidateUnits = scoredCandidates.map((candidate) => ({
    ...candidate,
    staged: stagedIds.has(candidate.unit_id),
    stage_character_id: stagedIds.has(candidate.unit_id) ? `duelyst_${candidate.unit_id}` : '',
  }))
  const stagedManifest = buildStagedManifest(packagePath, stagedCandidates)

  return {
    generated_at: new Date().toISOString(),
    package_path: packagePath,
    available: true,
    extraction_root: extractionRoot,
    total_assets: entries.length,
    extension_counts: extensionCounts,
    candidate_units: candidateUnits.slice(0, Math.max(stageTopCount, 12)),
    staged_manifest: stagedManifest,
    findings: [
      `${extensionCounts['.png'] ?? 0} sprite sheets detected under Duelyst unit spritesheets.`,
      `${extensionCounts['.plist'] ?? 0} atlas metadata files detected for frame slicing.`,
      `${stagedManifest.character_count} staged character frame(s) prepared for the current review workflow.`,
    ],
    summary: `Analyzed ${entries.length} Duelyst assets, found ${extensionCounts['.png'] ?? 0} sprite sheets, and staged ${stagedManifest.character_count} candidate frame(s).`,
  }
}

function clampStageCount(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 8
  return Math.max(1, Math.min(256, Math.floor(parsed)))
}

function ensurePackageExtraction(appRoot, packagePath) {
  const cacheRoot = path.resolve(appRoot, 'data', 'cache', 'duelyst-package')
  const extractionRoot = path.join(cacheRoot, 'extract')
  const metadataPath = path.join(cacheRoot, 'metadata.json')
  const packageStat = fs.statSync(packagePath)
  const cacheMetadata = readJsonSafe(metadataPath)

  if (
    cacheMetadata?.package_path === packagePath
    && cacheMetadata?.package_size === packageStat.size
    && cacheMetadata?.package_mtime_ms === packageStat.mtimeMs
    && fs.existsSync(extractionRoot)
  ) {
    return extractionRoot
  }

  fs.rmSync(extractionRoot, { recursive: true, force: true })
  fs.mkdirSync(extractionRoot, { recursive: true })

  const extraction = spawnSync('tar', ['-zxf', packagePath, '-C', extractionRoot], {
    cwd: appRoot,
    encoding: 'utf8',
  })

  if (extraction.status !== 0) {
    throw new Error(extraction.stderr?.trim() || extraction.stdout?.trim() || 'Could not extract the Duelyst unitypackage.')
  }

  fs.mkdirSync(cacheRoot, { recursive: true })
  fs.writeFileSync(
    metadataPath,
    `${JSON.stringify({
      package_path: packagePath,
      package_size: packageStat.size,
      package_mtime_ms: packageStat.mtimeMs,
      extracted_at: new Date().toISOString(),
    }, null, 2)}\n`,
    'utf8',
  )

  return extractionRoot
}

function readExtractedEntries(extractionRoot) {
  return fs.readdirSync(extractionRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const entryRoot = path.join(extractionRoot, entry.name)
      const pathnamePath = path.join(entryRoot, 'pathname')
      if (!fs.existsSync(pathnamePath)) {
        return null
      }

      const pathnameValue = fs.readFileSync(pathnamePath, 'utf8').trim()
      return {
        guid: entry.name,
        pathname: pathnameValue,
        extension: path.extname(pathnameValue).toLowerCase(),
        asset_path: path.join(entryRoot, 'asset'),
        preview_path: path.join(entryRoot, 'preview.png'),
      }
    })
    .filter(Boolean)
}

function countExtensions(entries) {
  return entries.reduce((counts, entry) => {
    const key = entry.extension || '[none]'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function buildUnitRecords(entries, packagePath) {
  const units = new Map()

  for (const entry of entries) {
    if (!entry.pathname.startsWith('Assets/Duelyst-Sprites/')) {
      continue
    }

    if (entry.extension === '.png' && entry.pathname.includes('/Spritesheets/Units/')) {
      const unitId = path.basename(entry.pathname, '.png')
      const unit = getOrCreateUnit(units, unitId)
      unit.sheet_path = entry.asset_path
      unit.sheet_source_path = entry.pathname
      unit.preview_path = fs.existsSync(entry.preview_path) ? entry.preview_path : null
      continue
    }

    if (entry.extension === '.plist' && entry.pathname.includes('/Scripts/XMLS/')) {
      const unitId = path.basename(entry.pathname, '.plist')
      const unit = getOrCreateUnit(units, unitId)
      unit.plist_path = entry.asset_path
      unit.plist_source_path = entry.pathname
      continue
    }

    const animationPrefix = 'Assets/Duelyst-Sprites/Animations/Units/'
    if (!entry.pathname.startsWith(animationPrefix)) {
      continue
    }

    const relativePath = entry.pathname.slice(animationPrefix.length)
    const [unitId] = relativePath.split('/')
    if (!unitId) {
      continue
    }

    const unit = getOrCreateUnit(units, unitId)
    if (entry.extension === '.anim') {
      unit.animation_clip_count += 1
      const animationName = normalizeAnimationName(unitId, path.basename(entry.pathname, '.anim'))
      if (animationName) {
        unit.animation_names.add(animationName)
      }
      continue
    }

    if (entry.extension === '.controller') {
      unit.controller_count += 1
    }
  }

  return Array.from(units.values()).filter((unit) => unit.sheet_path)
}

function getOrCreateUnit(units, unitId) {
  const existing = units.get(unitId)
  if (existing) {
    return existing
  }

  const created = {
    unit_id: unitId,
    display_name: prettifyUnitName(unitId),
    sheet_path: '',
    sheet_source_path: '',
    preview_path: null,
    plist_path: '',
    plist_source_path: '',
    animation_names: new Set(),
    animation_clip_count: 0,
    controller_count: 0,
  }
  units.set(unitId, created)
  return created
}

function normalizeAnimationName(unitId, baseName) {
  if (baseName === unitId) return ''
  const prefix = `${unitId}_`
  if (baseName.startsWith(prefix)) {
    return baseName.slice(prefix.length)
  }
  return baseName.split('_').slice(1).join('_') || baseName
}

function prettifyUnitName(unitId) {
  return unitId
    .replace(/^f\d+_/, '')
    .replace(/^neutral_/, '')
    .replace(/^boss_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function scoreAndStageCandidates(units, stageRoot) {
  return units.map((unit) => {
    const sheetSize = readPngDimensions(unit.sheet_path)
    const atlasFrames = unit.plist_path ? parsePlistFrames(unit.plist_path) : []
    const estimatedFrameSize = chooseTypicalFrameSize(atlasFrames)
    const representativeFrame = atlasFrames.length > 0 ? chooseRepresentativeFrame(atlasFrames, estimatedFrameSize) : null
    const stagedFramePath = representativeFrame
      ? path.join(stageRoot, `${unit.unit_id}_stage.png`)
      : ''

    if (representativeFrame) {
      writeFrameCrop(unit.sheet_path, representativeFrame, stagedFramePath)
    }

    const animationNames = Array.from(unit.animation_names).sort((left, right) => animationSortIndex(left) - animationSortIndex(right) || left.localeCompare(right))
    const reasons = []
    const warnings = []
    let score = 0

    if (estimatedFrameSize) {
      reasons.push(`atlas frames cluster around ${estimatedFrameSize.width}x${estimatedFrameSize.height}`)
      score += 12
      if (Math.abs(estimatedFrameSize.width - 64) <= 16 && Math.abs(estimatedFrameSize.height - 64) <= 16) {
        reasons.push('frame size is close to the 64x64 target')
        score += 18
      }
    } else {
      warnings.push('No plist frame rectangles were found, so staging falls back to the full sheet.')
      score -= 8
    }

    if (sheetSize.width >= 128 || sheetSize.height >= 128) {
      reasons.push('sheet packs multiple animation frames')
      score += 6
    }

    for (const animationName of preferredAnimationNames) {
      if (animationNames.includes(animationName)) {
        score += 4
      }
    }
    if (animationNames.length > 0) {
      reasons.push(`${animationNames.slice(0, 4).join(', ')}${animationNames.length > 4 ? ', ...' : ''} clips are present`)
    }

    if (positiveHumanoidPattern.test(unit.unit_id)) {
      reasons.push('name looks closer to a humanoid fighter/caster than a creature')
      score += 16
    }
    if (negativeCreaturePattern.test(unit.unit_id)) {
      warnings.push('name looks creature-, mech-, or monster-focused')
      score -= 24
    }

    const previewFilePath = representativeFrame ? stagedFramePath : unit.preview_path && fs.existsSync(unit.preview_path) ? unit.preview_path : unit.sheet_path
    const previewSize = representativeFrame
      ? { width: representativeFrame.w, height: representativeFrame.h }
      : estimatedFrameSize || sheetSize

    return {
      unit_id: unit.unit_id,
      display_name: unit.display_name,
      sheet_source_path: unit.sheet_source_path,
      sheet_url: toFsUrl(unit.sheet_path),
      sheet_size: sheetSize,
      plist_source_path: unit.plist_source_path || '',
      estimated_frame_size: estimatedFrameSize,
      animation_names: animationNames,
      animation_clip_count: unit.animation_clip_count,
      controller_count: unit.controller_count,
      preview_url: toFsUrl(previewFilePath),
      staged_frame_url: representativeFrame ? toFsUrl(stagedFramePath) : '',
      staged_frame_size: previewSize,
      staged: false,
      stage_character_id: '',
      score,
      reasons,
      warnings,
    }
  })
}

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath)
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function parsePlistFrames(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const frameRegex = /<key>([^<]+)<\/key>[\s\S]*?<key>frame<\/key>\s*<string>\{\{(-?\d+),(-?\d+)\},\{(\d+),(\d+)\}\}<\/string>[\s\S]*?(?:<key>rotated<\/key>\s*<(true|false)\/>|<key>offset<\/key>)/g
  const frames = []
  for (const match of source.matchAll(frameRegex)) {
    frames.push({
      name: match[1],
      x: Number(match[2]),
      y: Number(match[3]),
      w: Number(match[4]),
      h: Number(match[5]),
      rotated: match[6] === 'true',
    })
  }
  return frames
}

function chooseTypicalFrameSize(frames) {
  if (frames.length === 0) return null
  const counts = new Map()
  for (const frame of frames) {
    const key = `${frame.w}x${frame.h}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const [sizeKey, occurrences] = Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]
  const [width, height] = sizeKey.split('x').map(Number)
  return {
    width,
    height,
    occurrences,
    frame_count: frames.length,
  }
}

function chooseRepresentativeFrame(frames, estimatedFrameSize) {
  const preferred = frames
    .filter((frame) => frame.w > 0 && frame.h > 0)
    .sort((left, right) => representativeFrameScore(right, estimatedFrameSize) - representativeFrameScore(left, estimatedFrameSize))
  return preferred[0] ?? null
}

function representativeFrameScore(frame, estimatedFrameSize) {
  let score = 0
  if (estimatedFrameSize) {
    score -= Math.abs(frame.w - estimatedFrameSize.width) + Math.abs(frame.h - estimatedFrameSize.height)
  }
  if (/idle|breathing/i.test(frame.name)) score += 24
  if (/run|walk/i.test(frame.name)) score += 10
  if (/attack|hit|death/i.test(frame.name)) score -= 6
  return score
}

function writeFrameCrop(sheetPath, frame, outputPath) {
  const source = PNG.sync.read(fs.readFileSync(sheetPath))
  const crop = new PNG({ width: frame.w, height: frame.h })
  PNG.bitblt(source, crop, frame.x, frame.y, frame.w, frame.h, 0, 0)
  fs.writeFileSync(outputPath, PNG.sync.write(crop))
}

function animationSortIndex(name) {
  const index = preferredAnimationNames.indexOf(name)
  return index === -1 ? preferredAnimationNames.length : index
}

function buildStagedManifest(packagePath, stagedCandidates) {
  const generatedAt = new Date().toISOString()
  return {
    generated_at: generatedAt,
    package_path: packagePath,
    character_count: stagedCandidates.length,
    characters: stagedCandidates.map((candidate) => {
      const framePath = candidate.staged_frame_url || candidate.preview_url
      const frameSize = candidate.staged_frame_size || candidate.estimated_frame_size || candidate.sheet_size
      const frameRef = {
        index: 0,
        path: framePath,
        file_name: path.basename(framePath),
        width: frameSize.width,
        height: frameSize.height,
      }

      return {
        character_id: `duelyst_${candidate.unit_id}`,
        display_name: `Duelyst ${candidate.display_name}`,
        class_type: 'duelyst_stage',
        source_folder: packagePath,
        canvas_size: { width: frameSize.width, height: frameSize.height },
        directions: {
          south: {
            idle: {
              frame_count: 1,
              frames: [frameRef],
            },
          },
        },
        animations: [
          {
            name: 'idle',
            source_names: ['duelyst_stage'],
            directions: { south: [frameRef] },
            preview_gifs: [],
          },
        ],
        animation_names: ['idle'],
        source_quality_warnings: [
          'Staged from a Duelyst whole-unit sprite sheet, not a modular part pack.',
          'Use manual, preset-region, or APES extraction after selecting this staged source frame.',
          ...candidate.warnings,
        ],
        rotation_preview_paths: [{ direction: 'south', path: framePath }],
        representative_frame: framePath,
        extraction_status: {
          frame_chopped: Boolean(candidate.staged_frame_url),
          preset_regions_available: false,
          connected_pixel_pass_available: true,
          apes_pass_available: false,
          manual_cleanup_complete: false,
        },
      }
    }),
  }
}

function toFsUrl(filePath) {
  return `/@fs/${filePath.replaceAll('\\', '/')}`
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}
