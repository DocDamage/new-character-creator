import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const defaultPackagePath = path.resolve('assets', 'Duelyst-Unit-Animations.unitypackage')
const positiveHumanoidPattern = /general|sister|siren|pyromancer|guard|guardian|mage|mancer|vanguard|dragoon|seeker|weaver|caligrapher|champion|heir|kage|blade|raider|tracker|hunter|warrior|priest|templar|knight|soldier|windslicer|ritualist|herald/i
const negativeCreaturePattern = /golem|mech|crawler|crab|beast|hound|wing|dragon|wisp|obelysk|cannon|quillbeast|flumposaur|owlbear|beholder|serpenti|spelljammer|trinitywing|monster|artifact|magma|horror|demon|burrower|mecha/i
const mechPattern = /mech|mecha|golem|construct|cannon|artifact|obelisk|obelysk|walker|warbird/i
const structurePattern = /obelisk|obelysk|artifact|wall|portal|egg|structure|pillar|prism|monument/i
const casterPattern = /mage|mancer|siren|priest|ritualist|prophet|oracle|shaman|seer|sorcerer|witch|wizard|pyromancer|necromancer|summoner/i
const rangedPattern = /archer|hunter|tracker|sniper|gunner|sharpshooter|ranger|marksman|cannon|turret/i
const preferredAnimationNames = ['idle', 'breathing', 'run', 'attack', 'hit', 'death']
const duelystSourceFamilies = {
  f1: 'lyonar',
  f2: 'songhai',
  f3: 'vetruvian',
  f4: 'abyssian',
  f5: 'magmar',
  f6: 'vanar',
  neutral: 'neutral',
  boss: 'boss',
}

export async function inspectDuelystPackage(appRoot, options = {}) {
  const packagePath = path.resolve(appRoot, options.packagePath || defaultPackagePath)
  const stageTopCount = clampStageCount(options.stageTopCount)
  const candidateLimit = clampCandidateLimit(options.candidateLimit, stageTopCount)

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
  const stagedCandidates = scoredCandidates
    .filter((candidate) => candidate.staged_frame_url)
    .slice(0, stageTopCount)
    .map((candidate) => ({
      ...candidate,
      staged_animations: stageAnimationFrames(candidate, stageRoot),
    }))
  const stagedIds = new Set(stagedCandidates.map((candidate) => candidate.unit_id))
  const candidateUnits = scoredCandidates.map((candidate) => ({
    ...stripInternalCandidateFields(candidate),
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
    candidate_units: candidateUnits.slice(0, candidateLimit),
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

function clampCandidateLimit(value, stageTopCount) {
  if (value === 'all' || value === Infinity) return Number.POSITIVE_INFINITY
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Math.max(stageTopCount, 12)
  return Math.max(stageTopCount, Math.min(5000, Math.floor(parsed)))
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
    const detector = representativeFrame ? detectSpriteFrame(unit.sheet_path, representativeFrame) : detectSpriteSheet(unit.sheet_path)
    const labels = buildUnitLabels(unit, animationNames, atlasFrames, estimatedFrameSize, detector)
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
    if (labels.detector_class === 'humanoid') {
      reasons.push('silhouette detector suggests humanoid proportions')
      score += 10
    }
    if (negativeCreaturePattern.test(unit.unit_id)) {
      warnings.push('name looks creature-, mech-, or monster-focused')
      score -= 24
    }
    if (['creature', 'mech', 'structure'].includes(labels.detector_class)) {
      warnings.push(`silhouette detector suggests ${labels.detector_class} proportions`)
      score -= 8
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
      labels,
      animation_clip_count: unit.animation_clip_count,
      controller_count: unit.controller_count,
      preview_url: toFsUrl(previewFilePath),
      staged_frame_url: representativeFrame ? toFsUrl(stagedFramePath) : '',
      staged_frame_size: previewSize,
      staged_animations: {},
      staged: false,
      stage_character_id: '',
      local_sheet_path: unit.sheet_path,
      atlas_frames: atlasFrames,
      score,
      reasons,
      warnings,
    }
  })
}

function stripInternalCandidateFields(candidate) {
  const { local_sheet_path, atlas_frames, ...publicCandidate } = candidate
  void local_sheet_path
  void atlas_frames
  return publicCandidate
}

export function duelystLabelSchema() {
  return {
    label_scope: 'unit_identity_visual_detector_and_training_triage',
    warning: 'These labels combine filename/path/animation metadata with a lightweight alpha-silhouette detector. They are not APES ground-truth body-part correspondence labels.',
    fields: {
      source_family: 'Duelyst faction/source prefix inferred from the unit file name.',
      body_class: 'Final broad visual class after combining filename hints with detector evidence.',
      detector_class: 'Broad visual class inferred from the representative sprite silhouette.',
      detector_metrics: 'Alpha-mask geometry and color-footprint measurements used by the detector.',
      combat_role: 'Very coarse filename-derived role: general, caster, ranged, melee, or unknown.',
      training_role: 'How this asset should enter the local fine-tuning/review path.',
      animation_labels: 'Animation names normalized from Unity animation clips.',
      asset_labels: 'Flat tags useful for filtering manifests and review batches.',
      label_confidence: 'high/medium/low confidence for broad triage labels.',
      needs_manual_review: 'True because these are review labels, not supervised segmentation truth.',
    },
  }
}

function buildUnitLabels(unit, animationNames, atlasFrames, estimatedFrameSize, detector) {
  const sourceFamily = inferSourceFamily(unit.unit_id)
  const heuristicClass = inferHeuristicBodyClass(unit.unit_id)
  const bodyClass = combineBodyClass(heuristicClass, detector.class_name)
  const combatRole = inferCombatRole(unit.unit_id)
  const trainingRole = inferTrainingRole(bodyClass)
  const assetLabels = [
    'duelyst',
    'private_local_asset',
    `source_${sourceFamily}`,
    `body_${bodyClass}`,
    `detector_${detector.class_name}`,
    `role_${combatRole}`,
    `training_${trainingRole}`,
  ]

  if (animationNames.includes('idle') || animationNames.includes('breathing')) assetLabels.push('has_idle_or_breathing')
  if (animationNames.includes('attack')) assetLabels.push('has_attack')
  if (atlasFrames.length > 0) assetLabels.push('has_atlas_frames')

  return {
    label_source: 'filename_path_animation_plus_alpha_silhouette_detector',
    source_family: sourceFamily,
    unit_slug: unit.unit_id,
    unit_title: unit.display_name,
    heuristic_body_class: heuristicClass,
    detector_class: detector.class_name,
    body_class: bodyClass,
    combat_role: combatRole,
    training_role: trainingRole,
    animation_labels: animationNames,
    asset_labels: assetLabels,
    detector_metrics: detector.metrics,
    atlas_summary: {
      frame_count: atlasFrames.length,
      typical_frame_size: estimatedFrameSize
        ? { width: estimatedFrameSize.width, height: estimatedFrameSize.height }
        : null,
    },
    label_confidence: inferLabelConfidence(heuristicClass, detector.class_name),
    needs_manual_review: true,
  }
}

function inferSourceFamily(unitId) {
  const prefix = unitId.split('_')[0]
  return duelystSourceFamilies[prefix] ?? 'unknown'
}

function inferHeuristicBodyClass(unitId) {
  if (structurePattern.test(unitId)) return 'structure'
  if (mechPattern.test(unitId)) return 'mech'
  if (positiveHumanoidPattern.test(unitId)) return 'humanoid'
  if (negativeCreaturePattern.test(unitId)) return 'creature'
  return 'unknown'
}

function combineBodyClass(heuristicClass, detectorClass) {
  if (heuristicClass !== 'unknown' && heuristicClass === detectorClass) return heuristicClass
  if (heuristicClass === 'structure' || heuristicClass === 'mech') return heuristicClass
  if (detectorClass === 'structure') return detectorClass
  if (heuristicClass === 'humanoid' && detectorClass !== 'structure') return heuristicClass
  if (detectorClass !== 'unknown') return detectorClass
  return heuristicClass
}

function inferCombatRole(unitId) {
  if (/general/i.test(unitId)) return 'general'
  if (casterPattern.test(unitId)) return 'caster'
  if (rangedPattern.test(unitId)) return 'ranged'
  if (positiveHumanoidPattern.test(unitId)) return 'melee'
  return 'unknown'
}

function inferTrainingRole(bodyClass) {
  if (bodyClass === 'humanoid') return 'apes_humanoid_review_candidate'
  if (bodyClass === 'unknown') return 'apes_uncertain_review_candidate'
  if (bodyClass === 'creature') return 'creature_reference_or_negative'
  if (bodyClass === 'mech') return 'mech_reference_or_negative'
  if (bodyClass === 'structure') return 'structure_reference_or_negative'
  return 'private_reference_only'
}

function inferLabelConfidence(heuristicClass, detectorClass) {
  if (heuristicClass !== 'unknown' && heuristicClass === detectorClass) return 'high'
  if (heuristicClass !== 'unknown' || detectorClass !== 'unknown') return 'medium'
  return 'low'
}

function detectSpriteSheet(sheetPath) {
  const sheetSize = readPngDimensions(sheetPath)
  return {
    class_name: 'unknown',
    metrics: {
      detection_source: 'sheet_fallback',
      width: sheetSize.width,
      height: sheetSize.height,
      reason: 'No representative atlas frame was available for silhouette detection.',
    },
  }
}

function detectSpriteFrame(sheetPath, frame) {
  const source = PNG.sync.read(fs.readFileSync(sheetPath))
  const bounds = { minX: frame.w, minY: frame.h, maxX: -1, maxY: -1 }
  const buckets = new Set()
  let alphaPixels = 0
  let lowerMass = 0
  let topMass = 0
  let edgePixels = 0

  for (let y = 0; y < frame.h; y += 1) {
    for (let x = 0; x < frame.w; x += 1) {
      const sourceIndex = ((frame.y + y) * source.width + frame.x + x) * 4
      const alpha = source.data[sourceIndex + 3]
      if (alpha <= 12) continue

      alphaPixels += 1
      bounds.minX = Math.min(bounds.minX, x)
      bounds.minY = Math.min(bounds.minY, y)
      bounds.maxX = Math.max(bounds.maxX, x)
      bounds.maxY = Math.max(bounds.maxY, y)
      if (y >= frame.h * 0.58) lowerMass += 1
      if (y <= frame.h * 0.28) topMass += 1
      if (x <= 1 || y <= 1 || x >= frame.w - 2 || y >= frame.h - 2) edgePixels += 1

      const r = source.data[sourceIndex]
      const g = source.data[sourceIndex + 1]
      const b = source.data[sourceIndex + 2]
      buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}`)
    }
  }

  if (alphaPixels === 0 || bounds.maxX < bounds.minX || bounds.maxY < bounds.minY) {
    return {
      class_name: 'unknown',
      metrics: {
        detection_source: 'representative_frame_alpha',
        width: frame.w,
        height: frame.h,
        alpha_pixels: alphaPixels,
        reason: 'No opaque silhouette pixels were found.',
      },
    }
  }

  const bboxWidth = bounds.maxX - bounds.minX + 1
  const bboxHeight = bounds.maxY - bounds.minY + 1
  const bboxArea = bboxWidth * bboxHeight
  const aspectRatio = Number((bboxWidth / bboxHeight).toFixed(3))
  const fillRatio = Number((alphaPixels / bboxArea).toFixed(3))
  const lowerMassRatio = Number((lowerMass / alphaPixels).toFixed(3))
  const topMassRatio = Number((topMass / alphaPixels).toFixed(3))
  const edgeTouchRatio = Number((edgePixels / alphaPixels).toFixed(3))
  const colorBucketCount = buckets.size
  let className = 'unknown'

  if (edgeTouchRatio > 0.18 || fillRatio > 0.62) {
    className = 'structure'
  } else if (aspectRatio >= 0.45 && aspectRatio <= 1.25 && lowerMassRatio >= 0.3 && topMassRatio >= 0.08) {
    className = 'humanoid'
  } else if (aspectRatio > 1.25 || lowerMassRatio > 0.55) {
    className = 'creature'
  } else if (colorBucketCount <= 7 && fillRatio > 0.42) {
    className = 'mech'
  }

  return {
    class_name: className,
    metrics: {
      detection_source: 'representative_frame_alpha',
      width: frame.w,
      height: frame.h,
      bbox_width: bboxWidth,
      bbox_height: bboxHeight,
      alpha_pixels: alphaPixels,
      aspect_ratio: aspectRatio,
      fill_ratio: fillRatio,
      lower_mass_ratio: lowerMassRatio,
      top_mass_ratio: topMassRatio,
      edge_touch_ratio: edgeTouchRatio,
      color_bucket_count: colorBucketCount,
    },
  }
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
  const frameRegex = /<key>([^<]+\.png)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g
  const frames = []
  for (const match of source.matchAll(frameRegex)) {
    const body = match[2]
    const frameMatch = body.match(/<key>frame<\/key>\s*<string>\{\{(-?\d+),(-?\d+)\},\{(\d+),(\d+)\}\}<\/string>/)
    if (!frameMatch) continue
    frames.push({
      name: match[1],
      x: Number(frameMatch[1]),
      y: Number(frameMatch[2]),
      w: Number(frameMatch[3]),
      h: Number(frameMatch[4]),
      rotated: /<key>rotated<\/key>\s*<true\/>/.test(body),
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

function stageAnimationFrames(candidate, stageRoot) {
  const stageUnitRoot = path.join(stageRoot, candidate.unit_id)
  fs.rmSync(stageUnitRoot, { recursive: true, force: true })
  fs.mkdirSync(stageUnitRoot, { recursive: true })
  const groups = groupAtlasFramesByAnimation(candidate.unit_id, candidate.atlas_frames || [], candidate.estimated_frame_size)
  const staged = {}

  for (const [animationName, frames] of Object.entries(groups)) {
    const animationRoot = path.join(stageUnitRoot, animationName)
    fs.mkdirSync(animationRoot, { recursive: true })
    staged[animationName] = frames.map((frame, index) => {
      const outputPath = path.join(animationRoot, `${String(index).padStart(3, '0')}.png`)
      writeFrameCrop(candidate.local_sheet_path, frame, outputPath)
      return {
        index,
        path: toFsUrl(outputPath),
        file_name: path.basename(outputPath),
        width: frame.w,
        height: frame.h,
        source_name: frame.name,
      }
    })
  }

  return staged
}

function groupAtlasFramesByAnimation(unitId, atlasFrames, estimatedFrameSize) {
  const groups = new Map()
  for (const frame of atlasFrames) {
    if (estimatedFrameSize && (frame.w !== estimatedFrameSize.width || frame.h !== estimatedFrameSize.height)) {
      continue
    }
    const animationName = animationNameFromFrame(unitId, frame.name)
    if (!animationName) continue
    if (!groups.has(animationName)) groups.set(animationName, [])
    groups.get(animationName).push(frame)
  }

  const ordered = {}
  for (const animationName of preferredAnimationNames) {
    const frames = groups.get(animationName)
    if (!frames?.length) continue
    ordered[animationName] = frames
      .sort((left, right) => frameSequenceIndex(left.name) - frameSequenceIndex(right.name) || left.name.localeCompare(right.name))
      .slice(0, 16)
  }
  return ordered
}

function animationNameFromFrame(unitId, frameName) {
  const baseName = path.basename(frameName, '.png')
  const withoutIndex = baseName.replace(/_\d+$/, '')
  return normalizeAnimationName(unitId, withoutIndex)
}

function frameSequenceIndex(frameName) {
  const match = frameName.match(/_(\d+)\.png$/)
  return match ? Number(match[1]) : 0
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
      const stagedAnimations = candidate.staged_animations || {}
      const animationNames = Object.keys(stagedAnimations)
      const fallbackFrameRef = {
        index: 0,
        path: framePath,
        file_name: path.basename(framePath),
        width: frameSize.width,
        height: frameSize.height,
      }
      const directions = Object.fromEntries(
        (animationNames.length > 0 ? animationNames : ['idle']).map((animationName) => {
          const frames = stagedAnimations[animationName] || [fallbackFrameRef]
          return [animationName, { frame_count: frames.length, frames }]
        }),
      )
      const animations = (animationNames.length > 0 ? animationNames : ['idle']).map((animationName) => {
        const frames = stagedAnimations[animationName] || [fallbackFrameRef]
        return {
          name: animationName,
          source_names: frames.map((frame) => frame.source_name || 'duelyst_stage'),
          directions: { south: frames },
          preview_gifs: [],
        }
      })
      return {
        character_id: `duelyst_${candidate.unit_id}`,
        display_name: `Duelyst ${candidate.display_name}`,
        class_type: candidate.labels?.training_role || 'duelyst_stage',
        labels: candidate.labels,
        source_folder: packagePath,
        canvas_size: { width: frameSize.width, height: frameSize.height },
        directions: {
          south: directions,
        },
        animations,
        animation_names: animations.map((animation) => animation.name),
        source_quality_warnings: [
          'Staged from a Duelyst whole-unit sprite sheet, not a modular part pack.',
          `${animations.reduce((total, animation) => total + (animation.directions.south?.length || 0), 0)} staged atlas frame(s) are available across ${animations.length} animation(s).`,
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
