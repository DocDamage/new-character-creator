import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  apesAllowPlaceholderStorageKey,
  apesHarnessGeneratedAtStorageKey,
  apesPreflightStorageKey,
  apesPythonPathStorageKey,
  apesQaHarnessJobId,
  assetRootInputStorageKey,
  composerRecipesStorageKey,
  loadStoredApesPreflight,
  loadStoredBoolean,
  loadStoredComposerRecipes,
  loadStoredPartLibrary,
  loadStoredString,
  makeDraftRecipeId,
  partLibraryStorageKey,
  storeBoolean,
  storeJson,
  storeString,
  type SavedComposerRecipe,
} from './appPersistence'
import type { ManualMaskSaveRequest } from './appViewTypes'
import {
  buildFullPackageManifest,
  buildGodotSceneText,
  buildRenderedFrameSet,
  downloadFullPackageZip,
  downloadRenderedFrameSetZip,
} from './exportPackage'
import { buildManualMaskPart } from './manualParts'
import { PixelCanvas } from './PixelCanvas'
import { humanoid64Preset, layerOrder, palettePresets } from './presets'
import { ApesLabPanel } from './screens/ApesLabPanel'
import { AssetAuditPanel } from './screens/AssetAuditPanel'
import { BatchGeneratorPanel } from './screens/BatchGeneratorPanel'
import { ExportsPanel } from './screens/ExportsPanel'
import { FastCreatorPanel } from './screens/FastCreatorPanel'
import { PartLibraryPanel } from './screens/PartLibraryPanel'
import { SettingsPanel } from './screens/SettingsPanel'
import { WorkstationPanel } from './screens/WorkstationPanel'
import type { AnimationName, ApesBridgeStatus, ApesJob, ApesPreflightReport, ApesReport, AssetManifest, ComposerLayerSettings, Direction, DuelystPackageAudit, ExtractedPart, ExtractionMethod, PaletteRules, PartLabel, Rect } from './types'
import {
  buildExportManifest,
  buildAsepriteReference,
  buildGodotSpriteFrames,
  buildRpgMakerMzMetadata,
  buildUnity2DMetadata,
  downloadCroppedPng,
  downloadAllDirectionSpriteSheets,
  downloadConnectedPixelPart,
  downloadJson,
  downloadRegionMask,
  downloadSpriteSheet,
  downloadText,
  getFramePath,
  getFrames,
  makeApesJob,
  makeRecipe,
  seededRandom,
  slugLabel,
} from './utils'

type Screen = 'fast' | 'workstation' | 'library' | 'batch' | 'audit' | 'apes' | 'exports' | 'settings'

const screens: Array<{ id: Screen; label: string }> = [
  { id: 'fast', label: 'Fast Creator' },
  { id: 'workstation', label: 'Art Workstation' },
  { id: 'library', label: 'Part Library' },
  { id: 'batch', label: 'Batch Generator' },
  { id: 'audit', label: 'Asset Audit' },
  { id: 'apes', label: 'APES Lab' },
  { id: 'exports', label: 'Exports' },
  { id: 'settings', label: 'Settings' },
]

const mainDirections: Direction[] = ['south', 'east', 'north', 'west']
const apesCoreLabels: PartLabel[] = ['head', 'torso', 'front_arm', 'back_arm', 'front_leg', 'back_leg']
const defaultPaletteRules: Omit<PaletteRules, 'team_color'> = { hue_shift: 0, saturation: 100, brightness: 100 }

type LocalApesToolPayload = {
  action: 'preflight' | 'run-job' | 'generate-harness'
  pythonPath: string
  statusCode: number
  stdout: string
  stderr: string
  preflight?: ApesPreflightReport | null
  status?: ApesBridgeStatus | null
  report?: ApesReport | null
  outputDir?: string | null
  error?: string
}

type LocalAssetToolPayload = {
  action: 'repair' | 'reindex' | 'duelyst-audit'
  stdout?: string
  stderr?: string
  status?: number
  error?: string
  duelyst?: DuelystPackageAudit | null
}

function isApesQaHarnessReport(report: ApesReport) {
  return report.job_id === apesQaHarnessJobId || report.warnings.some((warning) => warning.toLowerCase().includes('qa harness'))
}

function isApesQaHarnessPart(part: ExtractedPart) {
  return part.extraction_method === 'apes' && (part.tags.includes('qa_harness') || part.part_id.startsWith(`${apesQaHarnessJobId}_`))
}

function App() {
  const [manifest, setManifest] = useState<AssetManifest | null>(null)
  const [screen, setScreen] = useState<Screen>('fast')
  const [selectedId, setSelectedId] = useState('')
  const [animation, setAnimation] = useState<AnimationName>('idle')
  const [direction, setDirection] = useState<Direction>('south')
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState<PartLabel>('head')
  const [regions, setRegions] = useState<Record<PartLabel, Rect>>(humanoid64Preset)
  const [selectedParts, setSelectedParts] = useState<Record<PartLabel, string>>({} as Record<PartLabel, string>)
  const [selectedPartIds, setSelectedPartIds] = useState<Partial<Record<PartLabel, string>>>({})
  const [layerSettings, setLayerSettings] = useState<Partial<Record<PartLabel, ComposerLayerSettings>>>({})
  const [recipeId, setRecipeId] = useState(makeDraftRecipeId)
  const [recipeName, setRecipeName] = useState('Draft kitbash')
  const [savedRecipes, setSavedRecipes] = useState<SavedComposerRecipe[]>(loadStoredComposerRecipes)
  const [extractionMethod, setExtractionMethod] = useState<ExtractionMethod>('apes')
  const [apesJobs, setApesJobs] = useState<ApesJob[]>([])
  const [batchSeed, setBatchSeed] = useState('ash-ronin-001')
  const [batchCount, setBatchCount] = useState(8)
  const [palette, setPalette] = useState(palettePresets[0])
  const [paletteRules, setPaletteRules] = useState<Omit<PaletteRules, 'team_color'>>(defaultPaletteRules)
  const [extractionHistory, setExtractionHistory] = useState<string[]>([])
  const [connectedSeed, setConnectedSeed] = useState<{ x: number; y: number } | undefined>()
  const [partLibrary, setPartLibrary] = useState<ExtractedPart[]>(loadStoredPartLibrary)
  const [apesAnimations, setApesAnimations] = useState<AnimationName[]>(['idle', 'walk'])
  const [apesDirections, setApesDirections] = useState<Direction[]>(mainDirections)
  const [apesLabels, setApesLabels] = useState<PartLabel[]>(apesCoreLabels)
  const [apesFrameRange, setApesFrameRange] = useState<[number, number]>([0, 7])
  const [exportStatus, setExportStatus] = useState('Ready to export package data.')
  const [assetRootInput, setAssetRootInput] = useState('')
  const [settingsStatus, setSettingsStatus] = useState('Copy a command from here when you move the project to another machine.')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [duelystBusy, setDuelystBusy] = useState(false)
  const [duelystAudit, setDuelystAudit] = useState<DuelystPackageAudit | null>(null)
  const [duelystStatus, setDuelystStatus] = useState('Analyze the Duelyst unitypackage to preview candidate sheets and stage cropped frames into the current workstation flow.')
  const [apesPythonPath, setApesPythonPath] = useState(() => loadStoredString(apesPythonPathStorageKey))
  const [apesAllowPlaceholder, setApesAllowPlaceholder] = useState(() => loadStoredBoolean(apesAllowPlaceholderStorageKey))
  const [apesBridgeStatus, setApesBridgeStatus] = useState('Set the APES Python path in Settings, then run preflight from APES Lab.')
  const [apesBridgeBusy, setApesBridgeBusy] = useState(false)
  const [apesPreflight, setApesPreflight] = useState<ApesPreflightReport | null>(loadStoredApesPreflight)
  const [apesHarnessGeneratedAt, setApesHarnessGeneratedAt] = useState(() => loadStoredString(apesHarnessGeneratedAtStorageKey))

  async function fetchManifest() {
    const response = await fetch('/data/manifests/characters.json')
    if (!response.ok) {
      throw new Error(`Failed to load manifest: ${response.status}`)
    }

    return await response.json() as AssetManifest
  }

  function applyManifest(data: AssetManifest, preferredCharacterId?: string) {
    setManifest(data)
    const nextCharacterId =
      preferredCharacterId && data.characters.some((character) => character.character_id === preferredCharacterId)
        ? preferredCharacterId
        : data.characters[0]?.character_id ?? ''
    setSelectedId(nextCharacterId)
    setAssetRootInput((current) => current || window.localStorage.getItem(assetRootInputStorageKey) || data.asset_root || '')
  }

  useEffect(() => {
    fetchManifest()
      .then((data) => {
        applyManifest(data)
      })
      .catch((error) => {
        console.error('Failed to load manifest', error)
      })
  }, [])

  useEffect(() => {
    storeJson(partLibraryStorageKey, partLibrary)
  }, [partLibrary])

  useEffect(() => {
    storeJson(composerRecipesStorageKey, savedRecipes)
  }, [savedRecipes])

  useEffect(() => {
    storeString(assetRootInputStorageKey, assetRootInput)
  }, [assetRootInput])

  useEffect(() => {
    storeString(apesPythonPathStorageKey, apesPythonPath.trim())
  }, [apesPythonPath])

  useEffect(() => {
    storeBoolean(apesAllowPlaceholderStorageKey, apesAllowPlaceholder)
  }, [apesAllowPlaceholder])

  useEffect(() => {
    storeJson(apesPreflightStorageKey, apesPreflight)
  }, [apesPreflight])

  useEffect(() => {
    storeString(apesHarnessGeneratedAtStorageKey, apesHarnessGeneratedAt)
  }, [apesHarnessGeneratedAt])

  const characters = useMemo(() => [...(manifest?.characters ?? []), ...(duelystAudit?.staged_manifest.characters ?? [])], [manifest, duelystAudit])
  const selectedCharacter = characters.find((character) => character.character_id === selectedId) ?? characters[0]
  const framePath = getFramePath(selectedCharacter, animation, direction, frameIndex)
  const onionPath = getFramePath(selectedCharacter, animation, direction, Math.max(frameIndex - 1, 0))
  const frames = getFrames(selectedCharacter, animation, direction)
  const recipe = selectedCharacter ? makeRecipe(selectedCharacter, { ...selectedParts, [selectedRegion]: selectedId }, partLibrary, selectedPartIds, layerSettings, recipeId, palette, paletteRules) : null

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (frames.length > 0 ? (current + 1) % frames.length : 0))
    }, animation === 'attack' ? 110 : 150)
    return () => window.clearInterval(timer)
  }, [animation, frames.length, playing])

  const classCounts = useMemo(() => {
    return characters.reduce<Record<string, number>>((acc, character) => {
      acc[character.class_type] = (acc[character.class_type] ?? 0) + 1
      return acc
    }, {})
  }, [characters])

  const batchVariants = useMemo(() => {
    if (!selectedCharacter || characters.length === 0) return []
    const random = seededRandom(batchSeed)
    const reviewedParts = partLibrary.filter((part) => part.reviewed)
    return Array.from({ length: batchCount }, (_, index) => {
      const baseCharacter = characters[Math.floor(random() * characters.length)]
      const parts = layerOrder.map((label) => {
        const approvedCandidates = reviewedParts.filter((part) => part.label === label)
        if (approvedCandidates.length > 0) {
          const sourcePart = approvedCandidates[Math.floor(random() * approvedCandidates.length)]
          return {
            label,
            source_character: sourcePart.character_id,
            method: sourcePart.extraction_method,
            source_part_id: sourcePart.part_id,
            reviewed: true,
          }
        }

        const source = characters[Math.floor(random() * characters.length)]
        return {
          label,
          source_character: source.character_id,
          method: apesCoreLabels.includes(label) ? 'apes' : random() > 0.5 ? 'preset_region' : 'connected_pixel',
          reviewed: false,
        }
      })
      const selectedPartIds = Object.fromEntries(
        parts.filter((part) => part.source_part_id).map((part) => [part.label, part.source_part_id]),
      ) as Partial<Record<PartLabel, string>>
      const selectedSourceParts = Object.fromEntries(
        parts.map((part) => [part.label, part.source_character]),
      ) as Record<PartLabel, string>
      const variantPalette = palettePresets[Math.floor(random() * palettePresets.length)]
      return {
        id: `variant_${String(index + 1).padStart(3, '0')}`,
        base: baseCharacter.character_id,
        palette: variantPalette,
        parts,
        recipe: makeRecipe(
          baseCharacter,
          selectedSourceParts,
          partLibrary,
          selectedPartIds,
          {},
          `batch_${batchSeed}_${String(index + 1).padStart(3, '0')}`,
          variantPalette,
          defaultPaletteRules,
        ),
      }
    })
  }, [batchCount, batchSeed, characters, partLibrary, selectedCharacter])

  function updateRegion(key: keyof Rect, value: number) {
    setRegions((current) => ({
      ...current,
      [selectedRegion]: {
        ...current[selectedRegion],
        [key]: value,
      },
    }))
  }

  function saveCurrentRecipe() {
    if (!selectedCharacter) return
    const savedRecipe: SavedComposerRecipe = {
      recipe_id: recipeId,
      name: recipeName.trim() || recipeId,
      base_character: selectedCharacter.character_id,
      selected_parts: { ...selectedParts },
      selected_part_ids: { ...selectedPartIds },
      layer_settings: { ...layerSettings },
      palette,
      palette_rules: { ...paletteRules },
      saved_at: new Date().toISOString(),
    }
    setSavedRecipes((current) => [savedRecipe, ...current.filter((item) => item.recipe_id !== recipeId)])
  }

  function loadSavedRecipe(recipeToLoadId: string) {
    const savedRecipe = savedRecipes.find((item) => item.recipe_id === recipeToLoadId)
    if (!savedRecipe) return
    if (characters.some((character) => character.character_id === savedRecipe.base_character)) {
      setSelectedId(savedRecipe.base_character)
    }
    setRecipeId(savedRecipe.recipe_id)
    setRecipeName(savedRecipe.name)
    setSelectedParts(savedRecipe.selected_parts)
    setSelectedPartIds(savedRecipe.selected_part_ids)
    setLayerSettings(savedRecipe.layer_settings ?? {})
    setPalette(savedRecipe.palette)
    setPaletteRules(savedRecipe.palette_rules ?? defaultPaletteRules)
  }

  function startNewRecipe() {
    const nextCharacterId = selectedCharacter?.character_id ?? selectedId
    setRecipeId(makeDraftRecipeId(nextCharacterId))
    setRecipeName('Draft kitbash')
    setSelectedParts({} as Record<PartLabel, string>)
    setSelectedPartIds({})
    setLayerSettings({})
    setPaletteRules(defaultPaletteRules)
  }

  function updatePaletteRules(patch: Partial<Omit<PaletteRules, 'team_color'>>) {
    setPaletteRules((current) => ({ ...current, ...patch }))
  }

  function updateLayerSetting(label: PartLabel, patch: Partial<ComposerLayerSettings>) {
    setLayerSettings((current) => {
      const existing = current[label] ?? { offset: [0, 0], visible: true, locked: false }
      return {
        ...current,
        [label]: {
          ...existing,
          ...patch,
        },
      }
    })
  }

  function createApesJob() {
    if (!selectedCharacter) return
    const selectedAnimations = apesAnimations.filter((name) => selectedCharacter.animation_names.includes(name))
    const job = makeApesJob(
      selectedCharacter,
      selectedAnimations.length > 0 ? selectedAnimations : [selectedCharacter.animation_names[0] ?? 'idle'],
      apesDirections.length > 0 ? apesDirections : mainDirections,
      apesLabels.length > 0 ? apesLabels : apesCoreLabels,
      apesFrameRange,
    )
    if (job.input_frames.length === 0) {
      setApesBridgeStatus('APES job not created because the current animation, direction, and frame-range selection produced no source frames.')
      setScreen('apes')
      return
    }
    setApesJobs((current) => [job, ...current])
    setScreen('apes')
  }

  function toggleApesAnimation(name: AnimationName) {
    setApesAnimations((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]))
  }

  function toggleApesDirection(name: Direction) {
    setApesDirections((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]))
  }

  function toggleApesLabel(name: PartLabel) {
    setApesLabels((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]))
  }

  function syncApesJobStatus(jobId: string, status: ApesBridgeStatus) {
    setApesJobs((current) =>
      current.map((job) =>
        job.job_id === jobId
          ? {
              ...job,
              status: status.status,
              failure_details: status.failure_details,
              logs: status.logs.length > 0 ? status.logs : job.logs,
            }
          : job,
      ),
    )
  }

  async function runApesPreflight() {
    if (!import.meta.env.DEV) {
      setApesBridgeStatus('APES preflight only works through the local dev server. Start the app with npm run dev on the machine that has the APES environment.')
      return
    }

    setApesBridgeBusy(true)
    setApesBridgeStatus('Running APES preflight through the local dev server...')
    try {
      const response = await fetch('/__local/apes-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preflight', pythonPath: apesPythonPath.trim() }),
      })
      const payload = await response.json() as LocalApesToolPayload
      const report = payload.preflight ?? null
      setApesPreflight(report)
      if (!response.ok) {
        throw new Error(payload.stderr || payload.error || `APES preflight failed with status ${payload.statusCode}`)
      }

      if (!report) {
        setApesBridgeStatus('APES preflight returned no report.')
        return
      }

      setApesBridgeStatus(
        report.ready
          ? `APES ready. Using ${report.python.executable}.`
          : `APES not ready: ${report.findings[0] ?? 'see findings below.'}`,
      )
    } catch (error) {
      setApesBridgeStatus(`APES preflight failed. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setApesBridgeBusy(false)
    }
  }

  async function runApesJob(jobId: string) {
    const job = apesJobs.find((item) => item.job_id === jobId)
    if (!job) return
    if (!import.meta.env.DEV) {
      setApesBridgeStatus('APES job execution only works through the local dev server. Start the app with npm run dev on the APES machine.')
      return
    }

    setApesBridgeBusy(true)
    setApesBridgeStatus(`Running APES bridge for ${job.job_id}...`)
    setApesJobs((current) =>
      current.map((item) =>
        item.job_id === jobId
          ? {
              ...item,
              status: 'running',
              failure_details: undefined,
              logs: [...item.logs, `Launching local APES bridge with ${apesPythonPath.trim() || 'the dev server Python interpreter'}.`],
            }
          : item,
      ),
    )

    try {
      const response = await fetch('/__local/apes-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run-job',
          pythonPath: apesPythonPath.trim(),
          allowPlaceholder: apesAllowPlaceholder,
          job,
        }),
      })
      const payload = await response.json() as LocalApesToolPayload
      if (payload.preflight) {
        setApesPreflight(payload.preflight)
      }
      if (payload.status) {
        syncApesJobStatus(jobId, payload.status)
      }
      if (!response.ok) {
        throw new Error(payload.status?.failure_details || payload.stderr || payload.error || `APES job failed with status ${payload.statusCode}`)
      }

      if (payload.report) {
        importApesReport(payload.report)
        setApesBridgeStatus(`APES job ${job.job_id} completed and imported ${payload.report.masks.length} mask(s) into the Part Library.`)
        return
      }

      setApesBridgeStatus(`APES job ${job.job_id} finished without an importable report.`)
    } catch (error) {
      setApesBridgeStatus(`APES run failed. ${error instanceof Error ? error.message : String(error)}`)
      setApesJobs((current) =>
        current.map((item) =>
          item.job_id === jobId
            ? {
                ...item,
                status: 'failed',
                failure_details: error instanceof Error ? error.message : String(error),
              }
            : item,
        ),
      )
    } finally {
      setApesBridgeBusy(false)
    }
  }

  async function generateApesQaHarness() {
    if (!import.meta.env.DEV) {
      setApesBridgeStatus('Local QA harness generation only works through the dev server. Start the app with npm run dev on this machine.')
      return
    }

    setApesBridgeBusy(true)
    setApesBridgeStatus('Generating the local APES QA harness through the dev server...')
    try {
      const response = await fetch('/__local/apes-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-harness' }),
      })
      const payload = await response.json() as LocalApesToolPayload
      if (!response.ok) {
        throw new Error(payload.stderr || payload.error || `APES QA harness generation failed with status ${payload.statusCode}`)
      }

      if (!payload.report) {
        setApesBridgeStatus('APES QA harness generated, but the report could not be loaded back into the app.')
        return
      }

      setApesHarnessGeneratedAt(new Date().toISOString())
      importApesReport(payload.report, { replaceQaHarnessExisting: true })
      setApesBridgeStatus(`Generated and imported the local APES QA harness with ${payload.report.masks.length} sample mask(s).`)
    } catch (error) {
      setApesBridgeStatus(`APES QA harness generation failed. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setApesBridgeBusy(false)
    }
  }

  async function loadApesQaHarnessReport() {
    try {
      const response = await fetch('/data/qa/apes_report_harness.json')
      if (!response.ok) {
        throw new Error(`QA harness report request failed with status ${response.status}`)
      }

      const report = await response.json() as ApesReport
      importApesReport(report, { replaceQaHarnessExisting: true })
      setApesBridgeStatus(`Loaded and replaced the APES QA sample report with ${report.masks.length} sample mask(s).`)
    } catch (error) {
      window.alert(`Could not load QA APES report: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function importApesReport(report: ApesReport, options: { replaceQaHarnessExisting?: boolean } = {}) {
    const job = apesJobs.find((item) => item.job_id === report.job_id)
    const fallbackInput = job?.input_frames[0]
    const characterId = job?.character_id ?? selectedCharacter?.character_id ?? 'unknown_character'
    const animations = job?.animations ?? [fallbackInput?.animation ?? animation]
    const directions = job?.directions ?? [fallbackInput?.direction ?? direction]
    const isQaHarness = isApesQaHarnessReport(report)
    const replaceQaHarnessExisting = options.replaceQaHarnessExisting ?? isQaHarness
    const importedParts = report.masks.map((mask, index): ExtractedPart => {
      const input = job?.input_frames.find((frame) => frame.animation === 'idle' && frame.direction === 'south') ?? fallbackInput
      const region = mask.bounds ?? humanoid64Preset[mask.label]
      return {
        part_id: `${report.job_id}_${mask.label}_${String(index).padStart(3, '0')}`,
        character_id: characterId,
        label: mask.label,
        source_animation: input?.animation ?? animations[0] ?? 'idle',
        source_direction: input?.direction ?? directions[0] ?? 'south',
        source_frame_path: input?.path,
        image_path: mask.image_path ?? `data/apes/output/${report.job_id}/parts/${mask.label}.png`,
        mask_path: mask.path,
        bounds: region,
        anchor: { x: region.x + Math.round(region.w / 2), y: region.y + Math.round(region.h / 2) },
        extraction_method: 'apes',
        compatibility: { animations, directions },
        tags: [
          'apes',
          'report_import',
          mask.label,
          `confidence_${Math.round(mask.confidence * 100)}`,
          `report_${report.job_id}`,
          ...(isQaHarness ? ['qa_harness'] : []),
        ],
        reviewed: mask.reviewed,
        warnings: [
          ...report.warnings,
          ...(mask.warnings ?? []),
          mask.confidence < 0.65 ? `Low APES confidence for ${mask.label}: ${mask.confidence}.` : '',
        ].filter(Boolean),
      }
    })

    setPartLibrary((current) => [
      ...importedParts,
      ...current.filter((part) => {
        if (importedParts.some((imported) => imported.part_id === part.part_id)) {
          return false
        }
        if (replaceQaHarnessExisting && isApesQaHarnessPart(part)) {
          return false
        }
        return true
      }),
    ])
    setApesJobs((current) =>
      current.map((item) =>
        item.job_id === report.job_id
          ? {
              ...item,
              status: 'complete',
              logs: [...item.logs, `Imported external APES report with ${importedParts.length} mask(s).`],
            }
          : item,
      ),
    )
  }

  function clearApesQaHarnessParts() {
    let removedCount = 0
    setPartLibrary((current) => {
      const next = current.filter((part) => {
        const shouldRemove = isApesQaHarnessPart(part)
        if (shouldRemove) {
          removedCount += 1
        }
        return !shouldRemove
      })
      return next
    })
    setApesBridgeStatus(
      removedCount > 0
        ? `Removed ${removedCount} APES QA harness part(s) from the Part Library.`
        : 'No APES QA harness parts were present in the Part Library.',
    )
  }

  async function extractCurrentRegion() {
    if (!selectedCharacter || !framePath) return
    const region = regions[selectedRegion]
    const baseName = `${selectedCharacter.character_id}_${animation}_${direction}_frame_${String(frameIndex).padStart(3, '0')}_${selectedRegion}`
    const connectedResult =
      extractionMethod === 'connected_pixel' && connectedSeed
        ? await downloadConnectedPixelPart(baseName, framePath, connectedSeed)
        : undefined
    let croppedResult: Awaited<ReturnType<typeof downloadCroppedPng>> | undefined
    let maskResult: Awaited<ReturnType<typeof downloadRegionMask>> | undefined

    if (!connectedResult) {
      croppedResult = await downloadCroppedPng(`${baseName}.png`, framePath, region)
      maskResult = await downloadRegionMask(`${baseName}_mask.png`, region)
    }

    const partRecord = makePartRecord(baseName, connectedResult, croppedResult, maskResult, region, framePath)
    downloadJson(`${baseName}_part.json`, partRecord)
    setPartLibrary((current) => [partRecord, ...current.filter((item) => item.part_id !== partRecord.part_id)])
    setExtractionHistory((current) => [
      connectedResult ? `${baseName} connected cluster (${connectedResult.pixel_count} px)` : `${baseName} exported`,
      ...current,
    ].slice(0, 8))
  }

  function togglePartReviewed(partId: string) {
    setPartLibrary((current) =>
      current.map((part) => (part.part_id === partId ? { ...part, reviewed: !part.reviewed } : part)),
    )
  }

  function setPartsReviewed(partIds: string[], reviewed: boolean) {
    const partIdSet = new Set(partIds)
    setPartLibrary((current) => current.map((part) => (partIdSet.has(part.part_id) ? { ...part, reviewed } : part)))
  }

  function deletePart(partId: string) {
    setPartLibrary((current) => current.filter((part) => part.part_id !== partId))
  }

  function clearPartLibrary() {
    setPartLibrary([])
  }

  function saveEditedMask({ sourcePartId, maskDataUrl, bounds }: ManualMaskSaveRequest) {
    const sourcePart = sourcePartId ? partLibrary.find((part) => part.part_id === sourcePartId) : undefined
    const manualPart = buildManualMaskPart({
      sourcePart,
      selectedCharacterId: selectedCharacter.character_id,
      selectedCharacterClassType: selectedCharacter.class_type,
      selectedRegion,
      animation,
      direction,
      frameIndex,
      framePath,
      bounds,
      maskDataUrl,
    })

    setPartLibrary((current) => [manualPart, ...current.filter((part) => part.part_id !== manualPart.part_id)])
    setExtractionHistory((current) => [`${manualPart.part_id} saved as a reviewed manual part`, ...current].slice(0, 8))
  }

  function exportPartLibrary() {
    downloadJson('pixel_creator_part_library.json', {
      exported_at: new Date().toISOString(),
      part_count: partLibrary.length,
      reviewed_count: partLibrary.filter((part) => part.reviewed).length,
      parts: partLibrary,
    })
  }

  function makePartRecord(
    baseName: string,
    connectedResult: Awaited<ReturnType<typeof downloadConnectedPixelPart>> | undefined,
    croppedResult: Awaited<ReturnType<typeof downloadCroppedPng>> | undefined,
    maskResult: Awaited<ReturnType<typeof downloadRegionMask>> | undefined,
    region: Rect,
    sourceFramePath: string,
  ): ExtractedPart {
    if (!selectedCharacter) {
      throw new Error('No selected character is available.')
    }

    return {
      part_id: baseName,
      character_id: selectedCharacter.character_id,
      label: selectedRegion,
      source_animation: animation,
      source_direction: direction,
      source_frame_path: sourceFramePath,
      image_path: connectedResult?.image_path ?? croppedResult?.image_path ?? `${baseName}.png`,
      mask_path: connectedResult?.mask_path ?? maskResult?.mask_path ?? `${baseName}_mask.png`,
      image_data_url: connectedResult?.image_data_url ?? croppedResult?.image_data_url,
      mask_data_url: connectedResult?.mask_data_url ?? maskResult?.mask_data_url,
      bounds: connectedResult?.bounds ?? region,
      anchor: connectedResult
        ? { x: connectedResult.seed.x, y: connectedResult.seed.y }
        : { x: region.x + Math.round(region.w / 2), y: region.y + Math.round(region.h / 2) },
      extraction_method: extractionMethod,
      compatibility: {
        animations: [animation],
        directions: [direction],
      },
      tags: [selectedCharacter.class_type, selectedRegion, extractionMethod],
      reviewed: extractionMethod === 'manual',
      warnings: [
        ...(extractionMethod === 'apes' ? ['APES regions should be reviewed before production export.'] : []),
        ...(connectedResult ? [`Connected cluster contains ${connectedResult.pixel_count} opaque pixels.`] : []),
      ],
    }
  }

  function exportGeneric() {
    if (!recipe || !selectedCharacter) return
    downloadJson(`${recipe.character_id}_manifest.json`, buildExportManifest(selectedCharacter, recipe, apesJobs))
  }

  function exportGodotScene() {
    if (!recipe) return
    downloadText(`${recipe.character_id}.tscn`, buildGodotSceneText(recipe))
  }

  function exportSpriteFrames() {
    if (!recipe || !selectedCharacter) return
    downloadText(`${recipe.character_id}_sprite_frames.tres`, buildGodotSpriteFrames(selectedCharacter, recipe))
  }

  function exportUnityMetadata() {
    if (!recipe || !selectedCharacter) return
    downloadJson(`${recipe.character_id}_unity_2d.json`, buildUnity2DMetadata(selectedCharacter, recipe))
  }

  function exportRpgMakerMetadata() {
    if (!recipe || !selectedCharacter) return
    downloadJson(`${recipe.character_id}_rpg_maker_mz.json`, buildRpgMakerMzMetadata(selectedCharacter, recipe))
  }

  function exportAsepriteReference() {
    if (!recipe || !selectedCharacter) return
    downloadJson(`${recipe.character_id}_aseprite_reference.json`, buildAsepriteReference(selectedCharacter, recipe))
  }

  async function exportCurrentSpriteSheet() {
    if (!selectedCharacter) return
    const currentFrames = getFrames(selectedCharacter, animation, direction)
    await downloadSpriteSheet(
      `${selectedCharacter.character_id}_${animation}_${direction}_sheet.png`,
      currentFrames.map((frame) => frame.path),
      currentFrames.length,
    )
  }

  async function exportAnimationSheets() {
    if (!selectedCharacter) return
    await downloadAllDirectionSpriteSheets(selectedCharacter, animation)
  }

  async function exportRenderedFrameSet() {
    if (!recipe || !selectedCharacter) return
    setExportStatus('Rendering full frame set...')
    try {
      const renderedFrameSet = await buildRenderedFrameSet(selectedCharacter, recipe, characters, partLibrary)
      downloadJson(`${recipe.character_id}_rendered_frame_set.json`, renderedFrameSet)
      setExportStatus(`Rendered ${renderedFrameSet.frame_count} frame(s) and ${renderedFrameSet.spritesheet_count} spritesheet record(s).`)
    } catch (error) {
      setExportStatus(`Rendered frame set failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function exportFullPackageManifest() {
    if (!recipe || !selectedCharacter) return
    setExportStatus('Building full package manifest...')
    try {
      const packageManifest = await buildFullPackageManifest(selectedCharacter, recipe, characters, partLibrary, apesJobs)
      downloadJson(`${recipe.character_id}_full_package_manifest.json`, packageManifest)
      setExportStatus(`Full package manifest ready with ${packageManifest.rendered_outputs.frame_count} rendered frame(s).`)
    } catch (error) {
      setExportStatus(`Full package export failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function exportRenderedFrameSetZip() {
    if (!recipe || !selectedCharacter) return
    setExportStatus('Building rendered frame zip...')
    try {
      const summary = await downloadRenderedFrameSetZip(selectedCharacter, recipe, characters, partLibrary)
      setExportStatus(`Rendered frame zip ready with ${summary.frame_count} frame(s) and ${summary.spritesheet_count} spritesheet(s).`)
    } catch (error) {
      setExportStatus(`Rendered frame zip failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function exportFullPackageZip() {
    if (!recipe || !selectedCharacter) return
    setExportStatus('Building full package zip...')
    try {
      const summary = await downloadFullPackageZip(selectedCharacter, recipe, characters, partLibrary, apesJobs)
      setExportStatus(`Full package zip ready with ${summary.frame_count} frame(s), ${summary.spritesheet_count} spritesheet(s), and ${summary.part_count} selected part folder(s).`)
    } catch (error) {
      setExportStatus(`Full package zip failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function copyCommand(command: string, successMessage: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command)
        setSettingsStatus(successMessage)
        return
      }

      const input = document.createElement('textarea')
      input.value = command
      input.setAttribute('readonly', 'true')
      input.style.position = 'absolute'
      input.style.left = '-9999px'
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setSettingsStatus(successMessage)
    } catch (error) {
      setSettingsStatus(`Could not copy command: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function runLocalAssetTool(action: 'repair' | 'reindex') {
    const assetRoot = assetRootInput.trim() || manifest?.asset_root || ''
    if (!assetRoot) {
      setSettingsStatus('Set an asset root before running a local repair or reindex action.')
      return
    }

    setSettingsBusy(true)
    setSettingsStatus(action === 'repair' ? 'Running manifest repair through the local dev server...' : 'Running manifest reindex through the local dev server...')
    try {
      const response = await fetch('/__local/asset-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, assetRoot }),
      })
      const payload = await response.json() as LocalAssetToolPayload
      if (!response.ok) {
        throw new Error(payload.stderr || payload.error || `Tool exited with status ${payload.status ?? response.status}`)
      }

      const data = await fetchManifest()
      applyManifest(data, selectedId)
      const summary = (payload.stdout || '').trim().split('\n').filter(Boolean).slice(-1)[0]
      setSettingsStatus(summary || (action === 'repair' ? 'Manifest repaired and reloaded.' : 'Manifest reindexed and reloaded.'))
    } catch (error) {
      setSettingsStatus(`Local ${action} failed. Start the app with npm run dev or use the copy-command buttons instead. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSettingsBusy(false)
    }
  }

  async function runDuelystAudit() {
    if (!import.meta.env.DEV) {
      setDuelystStatus('Duelyst package inspection only works through the local dev server because the app stages local /@fs previews.')
      return
    }

    setDuelystBusy(true)
    setDuelystStatus('Analyzing the Duelyst unitypackage and staging cropped review frames...')
    try {
      const response = await fetch('/__local/asset-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duelyst-audit', stageTopCount: 8 }),
      })
      const payload = await response.json() as LocalAssetToolPayload
      if (!response.ok || !payload.duelyst) {
        throw new Error(payload.error || payload.stderr || `Duelyst audit failed with status ${response.status}`)
      }

      setDuelystAudit(payload.duelyst)
      setDuelystStatus(`${payload.duelyst.summary} Staged candidates now appear in the source-character picker and can be opened directly in the workstation.`)
    } catch (error) {
      setDuelystStatus(`Duelyst audit failed. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setDuelystBusy(false)
    }
  }

  function openDuelystStageCharacter(characterId: string) {
    if (!duelystAudit?.staged_manifest.characters.some((character) => character.character_id === characterId)) {
      setDuelystStatus(`Staged Duelyst source ${characterId} is not currently available.`)
      return
    }

    setSelectedId(characterId)
    setAnimation('idle')
    setDirection('south')
    setFrameIndex(0)
    setPlaying(false)
    setScreen('workstation')
    setDuelystStatus(`Opened ${characterId} in the workstation. Use preset, manual, or APES extraction from the staged crop.`)
  }

  if (!manifest || !selectedCharacter) {
    return <main className="loading">Indexing the character forge...</main>
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">AP</span>
          <div>
            <h1>Pixel Creator</h1>
            <p>First-class APES kitbash lab</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Creator screens">
          {screens.map((item) => (
            <button key={item.id} data-testid={`nav-${item.id}`} className={screen === item.id ? 'active' : ''} onClick={() => setScreen(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        <section className="sidebar-block">
          <label htmlFor="character">Source character</label>
          <select id="character" value={selectedCharacter.character_id} onChange={(event) => setSelectedId(event.target.value)}>
            {characters.map((character) => (
              <option key={character.character_id} value={character.character_id}>
                {character.display_name}
              </option>
            ))}
          </select>
        </section>

        <section className="sidebar-block stats">
          <span>{characters.length} sources</span>
          <span>{selectedCharacter.animation_names.length} actions</span>
          <span>{selectedCharacter.source_quality_warnings.length} warnings</span>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="section-label">{screenLabel(screen)}</p>
            <h2>{selectedCharacter.display_name}</h2>
          </div>
          <div className="topbar-actions">
            <button onClick={createApesJob}>Prepare APES Job</button>
            <button className="primary" onClick={exportGeneric}>Export Manifest</button>
          </div>
        </header>

        <div className="main-grid">
          <section className="preview-panel">
            <PixelCanvas
              src={framePath}
              onionSrc={screen === 'workstation' ? onionPath : undefined}
              region={screen === 'workstation' ? regions[selectedRegion] : undefined}
              seed={screen === 'workstation' ? connectedSeed : undefined}
              onPixelClick={screen === 'workstation' ? setConnectedSeed : undefined}
              label={`${animation} ${direction} frame ${frameIndex + 1}`}
            />
            <div className="transport">
              <button onClick={() => setPlaying((value) => !value)}>{playing ? 'Pause' : 'Play'}</button>
              <select aria-label="Animation" value={animation} onChange={(event) => setAnimation(event.target.value)}>
                {selectedCharacter.animation_names.map((name) => (
                  <option key={name} value={name}>
                    {slugLabel(name)}
                  </option>
                ))}
              </select>
              <select aria-label="Direction" value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>
                {mainDirections.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input aria-label="Frame index" type="range" min={0} max={Math.max(frames.length - 1, 0)} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} />
            </div>
          </section>

          {screen === 'fast' ? (
            <FastCreatorPanel
              selectedCharacter={selectedCharacter}
              characters={characters}
              selectedParts={selectedParts}
              setSelectedParts={setSelectedParts}
              selectedPartIds={selectedPartIds}
              setSelectedPartIds={setSelectedPartIds}
              layerSettings={layerSettings}
              updateLayerSetting={updateLayerSetting}
              partLibrary={partLibrary}
              recipeId={recipeId}
              recipeName={recipeName}
              setRecipeName={setRecipeName}
              savedRecipes={savedRecipes}
              saveCurrentRecipe={saveCurrentRecipe}
              loadSavedRecipe={loadSavedRecipe}
              startNewRecipe={startNewRecipe}
              currentAnimation={animation}
              currentDirection={direction}
              currentFrameIndex={frameIndex}
              recipe={recipe}
              palette={palette}
              setPalette={setPalette}
              paletteRules={paletteRules}
              updatePaletteRules={updatePaletteRules}
              mainDirections={mainDirections}
            />
          ) : null}
          {screen === 'workstation' ? (
            <WorkstationPanel
              selectedRegion={selectedRegion}
              setSelectedRegion={setSelectedRegion}
              regions={regions}
              updateRegion={updateRegion}
              extractionMethod={extractionMethod}
              setExtractionMethod={setExtractionMethod}
              extractCurrentRegion={extractCurrentRegion}
              extractionHistory={extractionHistory}
              connectedSeed={connectedSeed}
              setConnectedSeed={setConnectedSeed}
              parts={partLibrary}
              sourceFramePath={framePath}
              saveEditedMask={saveEditedMask}
            />
          ) : null}
          {screen === 'library' ? (
            <PartLibraryPanel
              parts={partLibrary}
              togglePartReviewed={togglePartReviewed}
              setPartsReviewed={setPartsReviewed}
              deletePart={deletePart}
              clearPartLibrary={clearPartLibrary}
              exportPartLibrary={exportPartLibrary}
            />
          ) : null}
          {screen === 'batch' ? (
            <BatchGeneratorPanel
              batchSeed={batchSeed}
              setBatchSeed={setBatchSeed}
              batchCount={batchCount}
              setBatchCount={setBatchCount}
              batchVariants={batchVariants}
              characters={characters}
              partLibrary={partLibrary}
              currentAnimation={animation}
              currentDirection={direction}
              currentFrameIndex={frameIndex}
            />
          ) : null}
          {screen === 'audit' ? (
            <AssetAuditPanel
              manifest={manifest}
              classCounts={classCounts}
              duelystAudit={duelystAudit}
              duelystBusy={duelystBusy}
              duelystStatus={duelystStatus}
              runDuelystAudit={runDuelystAudit}
              openDuelystStageCharacter={openDuelystStageCharacter}
            />
          ) : null}
          {screen === 'apes' ? (
            <ApesLabPanel
              jobs={apesJobs}
              createApesJob={createApesJob}
              runApesPreflight={runApesPreflight}
              runApesJob={runApesJob}
              generateApesQaHarness={generateApesQaHarness}
              loadApesQaHarnessReport={loadApesQaHarnessReport}
              clearApesQaHarnessParts={clearApesQaHarnessParts}
              selectedCharacter={selectedCharacter}
              partLibrary={partLibrary}
              apesAnimations={apesAnimations}
              apesDirections={apesDirections}
              apesLabels={apesLabels}
              apesFrameRange={apesFrameRange}
              setApesFrameRange={setApesFrameRange}
              toggleApesAnimation={toggleApesAnimation}
              toggleApesDirection={toggleApesDirection}
              toggleApesLabel={toggleApesLabel}
              importApesReport={importApesReport}
              apesPythonPath={apesPythonPath}
              apesAllowPlaceholder={apesAllowPlaceholder}
              apesBridgeBusy={apesBridgeBusy}
              apesBridgeStatus={apesBridgeStatus}
              apesPreflight={apesPreflight}
              apesHarnessGeneratedAt={apesHarnessGeneratedAt}
              mainDirections={mainDirections}
              apesCoreLabels={apesCoreLabels}
            />
          ) : null}
          {screen === 'exports' ? (
            <ExportsPanel
              recipe={recipe}
              selectedCharacter={selectedCharacter}
              characters={characters}
              partLibrary={partLibrary}
              mainDirections={mainDirections}
              currentAnimation={animation}
              currentDirection={direction}
              currentFrameIndex={frameIndex}
              exportGeneric={exportGeneric}
              exportGodotScene={exportGodotScene}
              exportSpriteFrames={exportSpriteFrames}
              exportUnityMetadata={exportUnityMetadata}
              exportRpgMakerMetadata={exportRpgMakerMetadata}
              exportAsepriteReference={exportAsepriteReference}
              exportCurrentSpriteSheet={exportCurrentSpriteSheet}
              exportAnimationSheets={exportAnimationSheets}
              exportRenderedFrameSet={exportRenderedFrameSet}
              exportFullPackageManifest={exportFullPackageManifest}
              exportRenderedFrameSetZip={exportRenderedFrameSetZip}
              exportFullPackageZip={exportFullPackageZip}
              exportStatus={exportStatus}
              batchVariants={batchVariants}
            />
          ) : null}
          {screen === 'settings' ? (
            <SettingsPanel
              manifestAssetRoot={manifest?.asset_root ?? ''}
              assetRootInput={assetRootInput}
              setAssetRootInput={setAssetRootInput}
              settingsStatus={settingsStatus}
              settingsBusy={settingsBusy}
              copyCommand={copyCommand}
              runLocalAssetTool={runLocalAssetTool}
              apesPythonPath={apesPythonPath}
              setApesPythonPath={setApesPythonPath}
              apesAllowPlaceholder={apesAllowPlaceholder}
              setApesAllowPlaceholder={setApesAllowPlaceholder}
              apesPreflight={apesPreflight}
            />
          ) : null}
        </div>
      </section>
    </main>
  )
}

function screenLabel(screen: Screen) {
  return screens.find((item) => item.id === screen)?.label ?? 'Creator'
}

export default App
