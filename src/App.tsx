import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  apesAllowPlaceholderStorageKey,
  apesHarnessGeneratedAtStorageKey,
  apesJobsStorageKey,
  apesPreflightStorageKey,
  apesPythonPathStorageKey,
  aiSecretSessionStorageKey,
  aiToolConnectionsStorageKey,
  apesQaHarnessJobId,
  assetRootInputStorageKey,
  aiProviderConfigStorageKey,
  aiProviderConnectionsStorageKey,
  loadSessionSecretStatus,
  composerRecipesStorageKey,
  exportTargetProfileStorageKey,
  filenameTemplateStorageKey,
  generationJobsStorageKey,
  loadStoredAiProviderConfig,
  loadStoredAiProviderConnections,
  loadStoredApesPreflight,
  loadStoredApesJobs,
  loadStoredBoolean,
  loadStoredComposerRecipes,
  loadStoredGenerationJobs,
  loadStoredPartLibrary,
  loadStoredString,
  loadStoredToolConnections,
  loadStoredTrainingInboxDrafts,
  loadStoredTrainingLibraryRecords,
  loadStoredVariationPresets,
  makeDraftRecipeId,
  partLibraryStorageKey,
  storeAiProviderConnections,
  storeBoolean,
  storeJson,
  storeSessionSecretStatus,
  storeString,
  trainingInboxStorageKey,
  trainingLibraryStorageKey,
  variationPresetsStorageKey,
  type SavedComposerRecipe,
} from './appPersistence'
import type { ManualMaskSaveRequest } from './appViewTypes'
import { getActiveAnimationCharacter, getCompatibleAnimationSources } from './animationSource'
import {
  buildRecipeReadiness,
  defaultExportTargetProfileId,
  getExportTargetProfile,
  isExportTargetProfileId,
  type ExportTargetProfileId,
} from './creatorCockpit'
import { defaultFilenameTemplate } from './filenameTemplates'
import { buildGenerationManifest } from './generationManifest'
import { buildGenerationJobsHandoffPayload, createGenerationJobFromAiStudioRequest, createGenerationJobsFromMissingAnimationQueue, generationJobBlocksRelease } from './generationJobs'
import { buildAiGenerationContextQuery } from './aiContext'
import { createAiSecretVault } from './aiSecretVault'
import { buildAiActivitySnapshot } from './aiActivityContext'
import { buildRagContextBundle } from './ragIndex'
import { describeRagIndexHealth, validateHostedRagIndex } from './ragHealth'
import { layerBundleToExtractedParts, lpcSheetsToExtractedParts, parseLayerBundleManifest, type LpcSheetImportOptions } from './layerBundle'
import { localToolFetch, localToolPath, publicAssetPath } from './localToolsClient'
import { canUseLpcPartForAnimation, getCharacterLabelValue, isLpcExtractedPart, isLpcMannequin, isLpcPartSourceForLayer, isLpcSourceCharacterId, isPartCompatibleWithMannequin } from './lpcPartCompatibility'
import { buildManualMaskPart } from './manualParts'
import { buildLpcCharacterManifests } from './lpcCharacters'
import { buildLpcSelectionCreditReadiness } from './lpcCatalogPicker'
import type { LpcCatalog, LpcRecipeSelection, RecipeModeId } from './lpcCatalog'
import { buildMissingAnimationQueue, filterMissingAnimationQueue, type MissingAnimationQueue } from './missingAnimationQueue'
import { compactPartLibraryAssets, deletePartLibraryAssets, hydratePartLibraryAssets, persistPartLibraryAssets } from './partAssetStore'
import { normalizePixelLabSpriteOutput } from './pixellabOutput'
import { CompositeCanvas } from './CompositeCanvas'
import { PixelCanvas } from './PixelCanvas'
import { humanoid64Preset, layerOrder, palettePresets } from './presets'
import { ApesLabPanel } from './screens/ApesLabPanel'
import { AIStudioPanel } from './screens/AIStudioPanel'
import { AssetAuditPanel } from './screens/AssetAuditPanel'
import { BatchGeneratorPanel } from './screens/BatchGeneratorPanel'
import { ExportsPanel } from './screens/ExportsPanel'
import { FastCreatorPanel } from './screens/FastCreatorPanel'
import { PartLibraryPanel } from './screens/PartLibraryPanel'
import { SettingsPanel } from './screens/SettingsPanel'
import { WorkstationPanel } from './screens/WorkstationPanel'
import { canShowCharacterInRecipeMode, sourceFamilyForRecipeMode } from './sourceFamilyRegistry'
import { validateApesReport } from './apesReportValidation'
import { approveTrainingDraft, classifyTrainingInboxDraft, type ClassifyTrainingInboxInput } from './trainingLibrary'
import type { RagIndex } from './ragTypes'
import type { AiProviderConfig, AiProviderConnection, AiStudioMessage, AnimationName, ApesBridgeStatus, ApesFinetuneManifest, ApesJob, ApesOutputInventory, ApesPreflightReport, ApesReport, AssetManifest, CharacterManifest, ComposerLayerSettings, Direction, DuelystApesJobBatch, DuelystPackageAudit, ExtractedPart, ExtractionMethod, GenerationJob, LpcAssetInventory, PaletteRules, PartLabel, Rect, ToolConnectionSettings, TrainingInboxDraft, TrainingLibraryRecord, VariationPreset } from './types'
import {
  buildExportManifest,
  buildAsepriteReference,
  buildRpgMakerMzMetadata,
  buildUnity2DMetadata,
  downloadCroppedPng,
  downloadAllDirectionSpriteSheets,
  downloadConnectedPixelPart,
  downloadJson,
  downloadRegionMask,
  downloadSpriteSheet,
  downloadText,
  getFrameRef,
  getFramePath,
  getFrames,
  makeApesJob,
  makeRecipe,
  seededRandom,
  slugLabel,
} from './utils'
import { normalizeDuelystAudit } from './duelystManifest'

type Screen = 'fast' | 'workstation' | 'library' | 'batch' | 'audit' | 'ai' | 'apes' | 'exports' | 'settings'

const screens: Array<{ id: Screen; label: string }> = [
  { id: 'fast', label: 'Fast Creator' },
  { id: 'workstation', label: 'Art Workstation' },
  { id: 'library', label: 'Part Library' },
  { id: 'batch', label: 'Batch Generator' },
  { id: 'audit', label: 'Asset Audit' },
  { id: 'ai', label: 'AI Studio' },
  { id: 'apes', label: 'APES Lab' },
  { id: 'exports', label: 'Exports' },
  { id: 'settings', label: 'Settings' },
]

const mainDirections: Direction[] = ['south', 'east', 'north', 'west']
const apesCoreLabels: PartLabel[] = ['head', 'torso', 'front_arm', 'back_arm', 'front_leg', 'back_leg']
const defaultPaletteRules: Omit<PaletteRules, 'team_color'> = { hue_shift: 0, saturation: 100, brightness: 100 }
const tabTransitionSheets = [
  'assets/transitions/alenia/spritesheet/wipe_cuadros_30f.png',
  'assets/transitions/alenia/spritesheet/wipe_puertas_30f.png',
  'assets/transitions/alenia/spritesheet/wipe_circular_30f_320x180.png',
  'assets/transitions/alenia/spritesheet/wipe_persiana_30f.png',
  'assets/transitions/alenia/spritesheet/wipe_radial_30f.png',
]

type ExportPackageModule = typeof import('./exportPackage')

function loadExportPackage(): Promise<ExportPackageModule> {
  return import('./exportPackage')
}

type LocalApesToolPayload = {
  action: 'preflight' | 'run-job' | 'generate-harness' | 'summarize-outputs' | 'load-report' | 'prepare-finetune' | 'prepare-duelyst-jobs'
  pythonPath: string
  statusCode: number
  stdout: string
  stderr: string
  preflight?: ApesPreflightReport | null
  status?: ApesBridgeStatus | null
  report?: ApesReport | null
  inventory?: ApesOutputInventory | null
  finetuneManifest?: ApesFinetuneManifest | null
  duelystJobBatch?: DuelystApesJobBatch | null
  outputDir?: string | null
  error?: string
}

type LocalAssetToolPayload = {
  action: 'repair' | 'reindex' | 'duelyst-audit' | 'lpc-inventory' | 'lpc-catalog'
  stdout?: string
  stderr?: string
  status?: number
  error?: string
  duelyst?: DuelystPackageAudit | null
  lpcInventory?: LpcAssetInventory | null
  lpcCatalog?: LpcCatalog | null
}

type SourcePackFilter = 'all' | 'sprite' | 'duelyst' | 'lpc'

function sourcePackForRecipeMode(recipeMode: RecipeModeId): SourcePackFilter {
  if (recipeMode === 'lpc_character') return 'lpc'
  if (recipeMode === 'duelyst_review') return 'duelyst'
  return 'sprite'
}

type ImportApesReportOptions = {
  replaceQaHarnessExisting?: boolean
  statusSource?: 'pasted-json' | 'file-import'
  sourceLabel?: string
}

function isApesQaHarnessReport(report: ApesReport) {
  return report.job_id === apesQaHarnessJobId || report.warnings.some((warning) => warning.toLowerCase().includes('qa harness'))
}

function isApesQaHarnessPart(part: ExtractedPart) {
  return part.extraction_method === 'apes' && (part.tags.includes('qa_harness') || part.part_id.startsWith(`${apesQaHarnessJobId}_`))
}

function toBrowserAssetUrl(assetPath: string | undefined) {
  if (!assetPath) return undefined
  if (assetPath.startsWith('data:') || assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
    return assetPath
  }
  if (assetPath.startsWith(localToolPath(''))) return assetPath
  const normalized = assetPath.replaceAll('\\', '/')
  const apesOutputMarker = 'data/apes/output/'
  const apesOutputIndex = normalized.indexOf(apesOutputMarker)
  if (apesOutputIndex >= 0) {
    return localToolPath(`apes-output/${normalized.slice(apesOutputIndex + apesOutputMarker.length)}`)
  }
  return publicAssetPath(normalized)
}

function isLocalApesOutputPath(assetPath: string | undefined) {
  if (!assetPath) return false
  return assetPath.replaceAll('\\', '/').includes('data/apes/output/') || assetPath.startsWith(localToolPath('apes-output/'))
}

function getSourcePackFilter(character: CharacterManifest): SourcePackFilter {
  const normalizedId = character.character_id.toLowerCase()
  const normalizedSource = `${character.source_folder} ${character.representative_frame}`.replaceAll('\\', '/').toLowerCase()
  if (character.class_type === 'lpc_character' || character.character_id.startsWith('lpc-')) return 'lpc'
  if (
    normalizedId.startsWith('duelyst-') ||
    normalizedId.startsWith('duelyst_') ||
    normalizedSource.includes('/duelyst/') ||
    normalizedSource.includes('data/duelyst/') ||
    normalizedSource.includes(localToolPath('duelyst').toLowerCase())
  ) return 'duelyst'
  return 'sprite'
}

function isMainSourceCharacter(character: CharacterManifest) {
  return getSourcePackFilter(character) !== 'lpc' || getCharacterLabelValue(character, 'lpc_role') !== 'part'
}

function isLpcPartSourceCharacter(character: CharacterManifest, label: PartLabel) {
  return getSourcePackFilter(character) === 'lpc' && isLpcPartSourceForLayer(character, label)
}

function sortLpcPartSources(left: CharacterManifest, right: CharacterManifest, currentAnimation: AnimationName) {
  return lpcPartAnimationScore(left, currentAnimation) - lpcPartAnimationScore(right, currentAnimation) ||
    lpcPartTemplateScore(left) - lpcPartTemplateScore(right) ||
    lpcPartVisualScore(left) - lpcPartVisualScore(right) ||
    left.display_name.localeCompare(right.display_name)
}

function getAvailableDirections(character: CharacterManifest | undefined, animation: AnimationName): Direction[] {
  if (!character) return mainDirections
  const animationEntry = character.animations.find((item) => item.name === animation)
  const directionNames = new Set<Direction>()
  for (const direction of Object.keys(animationEntry?.directions ?? {}) as Direction[]) {
    if ((animationEntry?.directions[direction]?.length ?? 0) > 0) directionNames.add(direction)
  }
  for (const direction of Object.keys(character.directions ?? {}) as Direction[]) {
    if ((character.directions[direction]?.[animation]?.frames.length ?? 0) > 0) directionNames.add(direction)
  }
  const ordered: Direction[] = ['south', 'east', 'north', 'west', 'southeast', 'southwest', 'northeast', 'northwest']
  const available = ordered.filter((name) => directionNames.has(name))
  return available.length > 0 ? available : mainDirections
}

function directionLabel(direction: Direction) {
  return direction.replace(/(north|south)(east|west)/, '$1 $2')
}

function lpcPartAnimationScore(character: CharacterManifest, currentAnimation: AnimationName) {
  if (character.animation_names.includes(currentAnimation)) return 0
  if (character.animation_names.includes('idle')) return 1
  if (character.animation_names.includes('walk')) return 2
  return 3
}

function lpcPartTemplateScore(character: CharacterManifest) {
  const path = getCharacterLabelValue(character, 'lpc_path').replaceAll('\\', '/').toLowerCase()
  const lastSegment = path.split('/').filter(Boolean).at(-1) ?? ''
  if (path.includes('/hair/') && !path.includes('/_behind/') && !path.includes('/_front/')) return 1
  return /^(pants|shirt|shoes|hair)\b/.test(lastSegment) ? 1 : 0
}

function lpcPartVisualScore(character: CharacterManifest) {
  const path = getCharacterLabelValue(character, 'lpc_path').replaceAll('\\', '/').toLowerCase()
  const colorScore = lpcColorPriority.findIndex((color) => path.includes(`/${color}/`) || path.endsWith(`/${color}`))
  return (path.includes('/_behind/') ? 20 : 0) + (colorScore >= 0 ? colorScore : 12)
}

const lpcColorPriority = [
  'black',
  'blue',
  'navy',
  'red',
  'green',
  'forest',
  'purple',
  'gray',
  'white',
  'gold',
  'brown',
  'ash brown',
  'amber',
]

function fileNameFromAssetPath(assetPath: string | undefined, fallback: string) {
  if (!assetPath) return fallback
  const normalized = assetPath.replaceAll('\\', '/')
  return normalized.split('/').filter(Boolean).at(-1) ?? fallback
}

function normalizeManifestAssetUrls(manifest: AssetManifest): AssetManifest {
  return {
    ...manifest,
    characters: manifest.characters.map((character) => ({
      ...character,
      source_folder: publicAssetPath(character.source_folder),
      representative_frame: publicAssetPath(character.representative_frame),
      rotation_preview_paths: character.rotation_preview_paths.map((item) => ({
        ...item,
        path: publicAssetPath(item.path),
      })),
      directions: Object.fromEntries(
        Object.entries(character.directions).map(([directionName, animations]) => [
          directionName,
          Object.fromEntries(
            Object.entries(animations ?? {}).map(([animationName, record]) => [
              animationName,
              {
                ...record,
                frames: record.frames.map((frame) => ({
                  ...frame,
                  path: publicAssetPath(frame.path),
                })),
              },
            ]),
          ),
        ]),
      ) as CharacterManifest['directions'],
      animations: character.animations.map((animationEntry) => ({
        ...animationEntry,
        directions: Object.fromEntries(
          Object.entries(animationEntry.directions).map(([directionName, frames]) => [
            directionName,
            (frames ?? []).map((frame) => ({
              ...frame,
              path: publicAssetPath(frame.path),
            })),
          ]),
        ) as CharacterManifest['animations'][number]['directions'],
        preview_gifs: animationEntry.preview_gifs.map(publicAssetPath),
      })),
    })),
  }
}

function App() {
  const [manifest, setManifest] = useState<AssetManifest | null>(null)
  const [manifestStatus, setManifestStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [manifestError, setManifestError] = useState('')
  const [screen, setScreen] = useState<Screen>('fast')
  const [tabTransition, setTabTransition] = useState<{ key: number; sheet: string } | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [animationSourceId, setAnimationSourceId] = useState('')
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
  const [apesJobs, setApesJobs] = useState<ApesJob[]>(loadStoredApesJobs)
  const [aiProviderConfig, setAiProviderConfig] = useState<AiProviderConfig>(loadStoredAiProviderConfig)
  const [aiProviders, setAiProviders] = useState<AiProviderConnection[]>(loadStoredAiProviderConnections)
  const [toolConnections, setToolConnections] = useState<ToolConnectionSettings>(loadStoredToolConnections)
  const [sessionSecretStatus, setSessionSecretStatusState] = useState<Record<string, boolean>>(loadSessionSecretStatus)
  const aiSecretVaultRef = useRef(createAiSecretVault())
  const playbackTimerRef = useRef<number | null>(null)
  const manualFrameStepUntilRef = useRef(0)
  const previousScreenRef = useRef<Screen | null>(null)
  const tabTransitionTimerRef = useRef<number | null>(null)
  const [sessionSecretMemoryCount, setSessionSecretMemoryCount] = useState(0)
  const [aiStudioMessages, setAiStudioMessages] = useState<AiStudioMessage[]>([])
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>(loadStoredGenerationJobs)
  const [ragIndex, setRagIndex] = useState<RagIndex | null>(null)
  const [ragStatus, setRagStatus] = useState('RAG index not loaded. Run npm run rag:index to build local AI knowledge.')
  const [trainingInboxDrafts, setTrainingInboxDrafts] = useState<TrainingInboxDraft[]>(loadStoredTrainingInboxDrafts)
  const [trainingLibraryRecords, setTrainingLibraryRecords] = useState<TrainingLibraryRecord[]>(loadStoredTrainingLibraryRecords)
  const [batchSeed, setBatchSeed] = useState('ash-ronin-001')
  const [batchCount, setBatchCount] = useState(8)
  const [palette, setPalette] = useState(palettePresets[0])
  const [paletteRules, setPaletteRules] = useState<Omit<PaletteRules, 'team_color'>>(defaultPaletteRules)
  const [extractionHistory, setExtractionHistory] = useState<string[]>([])
  const [connectedSeed, setConnectedSeed] = useState<{ x: number; y: number } | undefined>()
  const [partLibrary, setPartLibrary] = useState<ExtractedPart[]>(loadStoredPartLibrary)
  const [partLibraryStatus, setPartLibraryStatus] = useState('Import APES reports, layer bundles, LPC sheets, or workstation extractions to build reusable parts.')
  const [apesAnimations, setApesAnimations] = useState<AnimationName[]>(['idle', 'walk'])
  const [apesDirections, setApesDirections] = useState<Direction[]>(mainDirections)
  const [apesLabels, setApesLabels] = useState<PartLabel[]>(apesCoreLabels)
  const [apesFrameRange, setApesFrameRange] = useState<[number, number]>([0, 7])
  const [exportStatus, setExportStatus] = useState('Ready to export package data.')
  const [assetRootInput, setAssetRootInput] = useState('')
  const [settingsStatus, setSettingsStatus] = useState('Copy a command from here when you move the project to another machine.')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [persistenceWarnings, setPersistenceWarnings] = useState<Record<string, string>>({})
  const [duelystBusy, setDuelystBusy] = useState(false)
  const [duelystAudit, setDuelystAudit] = useState<DuelystPackageAudit | null>(null)
  const [duelystStatus, setDuelystStatus] = useState('Loading the private Duelyst manifest if it exists. You can also rebuild it from the local unitypackage.')
  const [lpcBusy, setLpcBusy] = useState(false)
  const [lpcInventory, setLpcInventory] = useState<LpcAssetInventory | null>(null)
  const [lpcCatalog, setLpcCatalog] = useState<LpcCatalog | null>(null)
  const [lpcStatus, setLpcStatus] = useState('Build an LPC inventory from the local asset folder to plan import, credits, and generator compatibility.')
  const [lpcImportStatus, setLpcImportStatus] = useState('No LPC sheets imported this session.')
  const [apesPythonPath, setApesPythonPath] = useState(() => loadStoredString(apesPythonPathStorageKey))
  const [apesAllowPlaceholder, setApesAllowPlaceholder] = useState(() => loadStoredBoolean(apesAllowPlaceholderStorageKey))
  const [apesBridgeStatus, setApesBridgeStatus] = useState('Set the APES Python path in Settings, then run preflight from APES Lab.')
  const [apesBridgeBusy, setApesBridgeBusy] = useState(false)
  const [apesPreflight, setApesPreflight] = useState<ApesPreflightReport | null>(loadStoredApesPreflight)
  const [apesOutputInventory, setApesOutputInventory] = useState<ApesOutputInventory | null>(null)
  const [apesFinetuneManifest, setApesFinetuneManifest] = useState<ApesFinetuneManifest | null>(null)
  const [duelystApesJobBatch, setDuelystApesJobBatch] = useState<DuelystApesJobBatch | null>(null)
  const [apesHarnessGeneratedAt, setApesHarnessGeneratedAt] = useState(() => loadStoredString(apesHarnessGeneratedAtStorageKey))
  const [localToolsAvailable, setLocalToolsAvailable] = useState(false)
  const [recentActivity, setRecentActivity] = useState<string[]>([])
  const [variationPresets, setVariationPresets] = useState<VariationPreset[]>(loadStoredVariationPresets)
  const [activeVariationPresetId, setActiveVariationPresetId] = useState('')
  const [filenameTemplate, setFilenameTemplate] = useState(() => loadStoredString(filenameTemplateStorageKey, defaultFilenameTemplate))
  const [exportTargetProfile, setExportTargetProfileState] = useState<ExportTargetProfileId>(() => {
    const stored = loadStoredString(exportTargetProfileStorageKey, defaultExportTargetProfileId)
    return isExportTargetProfileId(stored) ? stored : defaultExportTargetProfileId
  })
  const [generationStyleNotes, setGenerationStyleNotes] = useState('Readable 64x64 RPG character parts with clean alpha, consistent floor contact, and reusable layer boundaries.')
  const [sourcePackFilter, setSourcePackFilter] = useState<SourcePackFilter>('all')
  const [recipeMode, setRecipeMode] = useState<RecipeModeId>('sprite_kitbash')
  const [lpcSelections, setLpcSelections] = useState<Record<string, LpcRecipeSelection>>({})
  const persistenceWarning = Object.values(persistenceWarnings).filter(Boolean).join(' ')

  const setPersistenceResult = useCallback((storageKey: string, ok: boolean, warning: string) => {
    setPersistenceWarnings((current) => {
      if (ok) {
        if (!(storageKey in current)) return current
        const next = { ...current }
        delete next[storageKey]
        return next
      }
      return { ...current, [storageKey]: warning }
    })
  }, [])

  const setSessionSecretStatus = useCallback((status: Record<string, boolean>) => {
    setSessionSecretStatusState(status)
    setPersistenceResult(aiSecretSessionStorageKey, storeSessionSecretStatus(status), 'Could not persist session AI secret status.')
  }, [setPersistenceResult])

  const setAiSessionSecret = useCallback((providerId: string, secret: string) => {
    aiSecretVaultRef.current.set(providerId, secret)
    setSessionSecretMemoryCount(aiSecretVaultRef.current.count())
    setSessionSecretStatus({
      ...sessionSecretStatus,
      [providerId]: secret.trim().length > 0,
    })
  }, [sessionSecretStatus, setSessionSecretStatus])

  async function fetchManifest(signal?: AbortSignal) {
    const manifestUrls = import.meta.env.DEV
      ? [publicAssetPath(`data/manifests/${['characters', 'local', 'json'].join('.')}`), publicAssetPath('data/manifests/characters.json')]
      : [publicAssetPath('data/manifests/characters.json')]

    let lastStatus: number | null = null
    for (const [index, manifestUrl] of manifestUrls.entries()) {
      const isLastManifestUrl = index === manifestUrls.length - 1
      const response = await fetch(manifestUrl, { signal })
      if (response.ok) {
        const contentType = response.headers.get('content-type') || ''
        const responseText = await response.text()

        try {
          const parsed = JSON.parse(responseText) as AssetManifest
          if (!parsed.characters || !Array.isArray(parsed.characters)) {
            throw new Error('Manifest payload is missing a characters array.')
          }
          return normalizeManifestAssetUrls(parsed)
        } catch (error) {
          const looksLikeHtml = contentType.includes('text/html') || responseText.trimStart().startsWith('<!DOCTYPE html') || responseText.trimStart().startsWith('<html')
          if (looksLikeHtml && !isLastManifestUrl) {
            continue
          }

          throw new Error(`Failed to parse manifest ${manifestUrl}: ${error instanceof Error ? error.message : String(error)}`, {
            cause: error,
          })
        }
      }

      lastStatus = response.status
      if (response.status !== 404 || isLastManifestUrl) {
        throw new Error(`Failed to load manifest: ${response.status}`)
      }
    }

    throw new Error(`Failed to load manifest: ${lastStatus ?? 'unknown'}`)
  }

  const applyManifest = useCallback((data: AssetManifest, preferredCharacterId?: string) => {
    if (data.characters.length === 0) {
      throw new Error('The active manifest does not contain any characters. Reindex the asset pack or switch back to a valid manifest root in Settings.')
    }

    setManifest(data)
    const nextCharacterId =
      preferredCharacterId && data.characters.some((character) => character.character_id === preferredCharacterId)
        ? preferredCharacterId
        : data.characters[0]?.character_id ?? ''
    setSelectedId(nextCharacterId)
    setAssetRootInput((current) => current || loadStoredString(assetRootInputStorageKey, data.asset_root || ''))
  }, [])

  const loadManifest = useCallback(async (preferredCharacterId?: string, signal?: AbortSignal) => {
    setManifestStatus('loading')
    setManifestError('')

    try {
      const data = await fetchManifest(signal)
      if (signal?.aborted) return
      applyManifest(data, preferredCharacterId)
      setManifestStatus('ready')
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      setManifest(null)
      setManifestError(message)
      setManifestStatus('error')
    }
  }, [applyManifest])

  useEffect(() => {
    const controller = new AbortController()
    void loadManifest(undefined, controller.signal)
    return () => {
      controller.abort()
    }
  }, [loadManifest])

  useEffect(() => {
    const controller = new AbortController()
    fetch(localToolPath('health'), { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          setLocalToolsAvailable(false)
          return
        }

        const payload = await response.json().catch(() => null) as { ok?: unknown; server?: unknown } | null
        setLocalToolsAvailable(payload?.ok === true && payload.server === 'vite-local-tools')
      })
      .catch(() => {
        setLocalToolsAvailable(false)
      })
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(publicAssetPath('data/lpc/lpc_asset_inventory.json'), { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return
        const payload = await response.json() as LpcAssetInventory
        if (payload?.format === 'pixel_creator_lpc_asset_inventory') {
          setLpcInventory(payload)
          setLpcStatus(
            `Loaded ${payload.summary.png_count} LPC PNG sheet(s), including ${payload.summary.lpc_grid_count} 64x64 grid sheet(s).`,
          )
        }
      })
      .catch(() => {})
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(publicAssetPath('data/rag/knowledge_index.json'), { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return
        const payload = await response.json() as RagIndex
        const health = validateHostedRagIndex(payload)
        if (health.ready && payload?.format === 'pixel_creator_rag_index') {
          setRagIndex(payload)
          setRagStatus(describeRagIndexHealth(health))
        } else if (health.severity === 'error') {
          setRagStatus(describeRagIndexHealth(health))
        }
      })
      .catch(() => {})
    return () => {
      controller.abort()
    }
  }, [])

  async function activateRag(mode: 'load' | 'rebuild' = 'load') {
    setRagStatus(mode === 'rebuild' ? 'Rebuilding RAG knowledge index...' : 'Activating RAG knowledge index...')
    try {
      if (localToolsAvailable) {
        const response = await localToolFetch(localToolPath('rag-tools'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: mode }),
        })
        const payload = await response.json().catch(() => null) as { ok?: boolean; index?: RagIndex; error?: string } | null
        if (!response.ok || !payload?.ok || payload.index?.format !== 'pixel_creator_rag_index') {
          throw new Error(payload?.error ?? 'Local RAG tool did not return a knowledge index.')
        }
        setRagIndex(payload.index)
        setRagStatus(`RAG active with ${payload.index.chunk_count} knowledge chunk(s) from ${payload.index.document_count} source document(s).`)
        return
      }

      const response = await fetch(publicAssetPath('data/rag/knowledge_index.json'), { cache: 'no-store' })
      if (!response.ok) throw new Error('Hosted RAG index is not available.')
      const payload = await response.json() as RagIndex
      const health = validateHostedRagIndex(payload)
      if (!health.ready || payload?.format !== 'pixel_creator_rag_index') throw new Error(describeRagIndexHealth(health))
      setRagIndex(payload)
      setRagStatus(`RAG active from hosted data. ${describeRagIndexHealth(health)}`)
    } catch (error) {
      setRagStatus(`RAG activation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch(publicAssetPath('data/lpc/lpc_catalog.json'), { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return
        const payload = await response.json() as LpcCatalog
        if (payload?.format === 'pixel_creator_lpc_catalog') {
          setLpcCatalog(payload)
          setLpcStatus((current) => current.startsWith('Build an LPC inventory')
            ? `Loaded LPC catalog with ${payload.summary.item_count} item(s), ${payload.summary.layer_count} layer(s), and ${payload.summary.credit_count} credit record(s).`
            : current)
        }
      })
      .catch(() => {})
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadPrivateDuelystManifest(controller.signal)
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    hydratePartLibraryAssets(loadStoredPartLibrary()).then((hydratedParts) => {
      if (!cancelled) setPartLibrary(hydratedParts)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    persistPartLibraryAssets(partLibrary).then((persistableParts) => {
      if (cancelled) return
      setPersistenceResult(partLibraryStorageKey, storeJson(partLibraryStorageKey, persistableParts), 'Could not persist the Part Library in browser storage. Export the library JSON before reloading.')
    })
    return () => {
      cancelled = true
    }
  }, [partLibrary, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(composerRecipesStorageKey, storeJson(composerRecipesStorageKey, savedRecipes), 'Could not persist saved recipes in browser storage. Download or export recipe data before reloading.')
  }, [savedRecipes, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(apesJobsStorageKey, storeJson(apesJobsStorageKey, apesJobs), 'Could not persist APES jobs in browser storage. Download job configs before reloading.')
  }, [apesJobs, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(aiProviderConfigStorageKey, storeJson(aiProviderConfigStorageKey, aiProviderConfig), 'Could not persist AI provider configuration in browser storage. Download handoff JSON before reloading.')
  }, [aiProviderConfig, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(aiProviderConnectionsStorageKey, storeAiProviderConnections(aiProviders), 'Could not persist redacted AI provider settings.')
  }, [aiProviders, setPersistenceResult])

  useEffect(() => {
    setAiProviders((current) => current.map((provider) => ({
      ...provider,
      secret_session_set: Boolean(sessionSecretStatus[provider.provider_id]),
    })))
  }, [sessionSecretStatus])

  useEffect(() => {
    setPersistenceResult(aiToolConnectionsStorageKey, storeJson(aiToolConnectionsStorageKey, toolConnections), 'Could not persist AI tool connection settings.')
  }, [setPersistenceResult, toolConnections])

  useEffect(() => {
    setPersistenceResult(generationJobsStorageKey, storeJson(generationJobsStorageKey, generationJobs), 'Could not persist generation jobs in browser storage. Download handoff JSON before reloading.')
  }, [generationJobs, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(trainingInboxStorageKey, storeJson(trainingInboxStorageKey, trainingInboxDrafts), 'Could not persist Training Inbox drafts in browser storage. Download handoff JSON before reloading.')
  }, [trainingInboxDrafts, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(trainingLibraryStorageKey, storeJson(trainingLibraryStorageKey, trainingLibraryRecords), 'Could not persist Training Library records in browser storage. Download handoff JSON before reloading.')
  }, [trainingLibraryRecords, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(assetRootInputStorageKey, storeString(assetRootInputStorageKey, assetRootInput), 'Could not persist the asset root setting in browser storage.')
  }, [assetRootInput, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(apesPythonPathStorageKey, storeString(apesPythonPathStorageKey, apesPythonPath.trim()), 'Could not persist the APES Python path in browser storage.')
  }, [apesPythonPath, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(apesAllowPlaceholderStorageKey, storeBoolean(apesAllowPlaceholderStorageKey, apesAllowPlaceholder), 'Could not persist the APES placeholder fallback setting in browser storage.')
  }, [apesAllowPlaceholder, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(apesPreflightStorageKey, storeJson(apesPreflightStorageKey, apesPreflight), 'Could not persist the APES preflight report in browser storage.')
  }, [apesPreflight, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(apesHarnessGeneratedAtStorageKey, storeString(apesHarnessGeneratedAtStorageKey, apesHarnessGeneratedAt), 'Could not persist the APES QA harness timestamp in browser storage.')
  }, [apesHarnessGeneratedAt, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(variationPresetsStorageKey, storeJson(variationPresetsStorageKey, variationPresets), 'Could not persist variation presets in browser storage.')
  }, [variationPresets, setPersistenceResult])

  useEffect(() => {
    setPersistenceResult(filenameTemplateStorageKey, storeString(filenameTemplateStorageKey, filenameTemplate), 'Could not persist the export filename template in browser storage.')
  }, [filenameTemplate, setPersistenceResult])

  const lpcCharacters = useMemo(() => buildLpcCharacterManifests(lpcInventory), [lpcInventory])
  const characters = useMemo(() => [...(manifest?.characters ?? []), ...(duelystAudit?.staged_manifest.characters ?? []), ...lpcCharacters], [manifest, duelystAudit, lpcCharacters])
  const selectedCharacter = characters.find((character) => character.character_id === selectedId) ?? characters[0]
  const animationSourceOptions = useMemo(() => getCompatibleAnimationSources(selectedCharacter, characters), [characters, selectedCharacter])
  const animationSourceCharacter = getActiveAnimationCharacter(selectedCharacter, animationSourceOptions, animationSourceId) ?? selectedCharacter
  const hasBorrowedAnimationSource = Boolean(animationSourceCharacter && selectedCharacter && animationSourceCharacter.character_id !== selectedCharacter.character_id)
  const sourceCharacterOptions = useMemo(
    () => characters.filter((character) =>
      isMainSourceCharacter(character) &&
      (sourcePackFilter === 'all'
        ? canShowCharacterInRecipeMode(character, recipeMode)
        : getSourcePackFilter(character) === sourcePackFilter),
    ),
    [characters, recipeMode, sourcePackFilter],
  )
  const frameCharacter = screen === 'workstation' ? selectedCharacter : animationSourceCharacter
  const availableDirections = useMemo(() => getAvailableDirections(animationSourceCharacter, animation), [animationSourceCharacter, animation])
  const frame = getFrameRef(frameCharacter, animation, direction, frameIndex)
  const onionFrame = getFrameRef(frameCharacter, animation, direction, Math.max(frameIndex - 1, 0))
  const framePath = frame?.path ?? getFramePath(frameCharacter, animation, direction, frameIndex)
  const onionPath = onionFrame?.path ?? getFramePath(frameCharacter, animation, direction, Math.max(frameIndex - 1, 0))
  const frames = getFrames(animationSourceCharacter, animation, direction)
  const recipe = useMemo(
    () => selectedCharacter
      ? {
          ...makeRecipe(selectedCharacter, selectedParts, partLibrary, selectedPartIds, layerSettings, recipeId, palette, paletteRules, animationSourceCharacter),
          recipe_mode: recipeMode,
          source_family: sourceFamilyForRecipeMode(recipeMode),
          lpc_selections: recipeMode === 'lpc_character' ? lpcSelections : undefined,
        }
      : null,
    [animationSourceCharacter, layerSettings, lpcSelections, palette, paletteRules, partLibrary, recipeId, recipeMode, selectedCharacter, selectedPartIds, selectedParts],
  )
  const recipeReadiness = useMemo(
    () => buildRecipeReadiness({ selectedPartIds, partLibrary, layerLabels: layerOrder }),
    [selectedPartIds, partLibrary],
  )
  const activeExportTargetProfile = getExportTargetProfile(exportTargetProfile)
  const currentGenerationReleaseBlockers = useMemo(
    () => recipe && selectedCharacter
      ? generationJobs.filter((job) => (
          job.recipe_id === recipe.character_id &&
          job.character_id === selectedCharacter.character_id &&
          job.target_profile === exportTargetProfile &&
          generationJobBlocksRelease(job)
        ))
      : [],
    [exportTargetProfile, generationJobs, recipe, selectedCharacter],
  )
  const currentMissingAnimationQueue = useMemo(() => {
    if (!lpcCatalog || !recipe || !selectedCharacter || recipeMode !== 'lpc_character') return null
    try {
      const consumedItemIds = new Set(
        generationJobs
          .filter((job) => (
            job.recipe_id === recipe.character_id &&
            job.character_id === selectedCharacter.character_id &&
            job.target_profile === exportTargetProfile
          ))
          .flatMap((job) => job.source_queue_item_ids),
      )
      return filterMissingAnimationQueue(
        buildMissingAnimationQueue({
          catalog: lpcCatalog,
          recipe,
          bodyType: inferLpcBodyTypeForCharacter(selectedCharacter),
          animations: apesAnimations.length > 0 ? apesAnimations : selectedCharacter.animation_names,
          directions: apesDirections.length > 0 ? apesDirections : availableDirections,
          frameRange: apesFrameRange,
        }),
        consumedItemIds,
      )
    } catch {
      return null
    }
  }, [apesAnimations, apesDirections, apesFrameRange, availableDirections, exportTargetProfile, generationJobs, lpcCatalog, recipe, recipeMode, selectedCharacter])
  const previewLibraryPartOptions = useMemo(
    () => partLibrary
      .filter((part) => part.label === selectedRegion && isPartCompatibleWithMannequin(part, selectedCharacter))
      .sort((left, right) => Number(right.reviewed) - Number(left.reviewed) || left.part_id.localeCompare(right.part_id)),
    [partLibrary, selectedCharacter, selectedRegion],
  )
  const previewLpcPartOptions = useMemo(
    () => recipeMode === 'lpc_character' && isLpcMannequin(selectedCharacter) ? characters
      .filter((character) => isLpcPartSourceCharacter(character, selectedRegion))
      .filter((character) => canUseLpcPartForAnimation(character, selectedRegion, animation))
      .sort((left, right) => sortLpcPartSources(left, right, animation))
      .slice(0, 180) : [],
    [animation, characters, recipeMode, selectedCharacter, selectedRegion],
  )
  const previewSelectedSourceCharacter = selectedParts[selectedRegion]
    ? characters.find((character) => character.character_id === selectedParts[selectedRegion])
    : undefined
  const previewPickerValue = selectedPartIds[selectedRegion]
    ? `library:${selectedPartIds[selectedRegion]}`
    : selectedParts[selectedRegion] &&
        previewSelectedSourceCharacter &&
        isLpcPartSourceCharacter(previewSelectedSourceCharacter, selectedRegion) &&
        canUseLpcPartForAnimation(previewSelectedSourceCharacter, selectedRegion, animation)
      ? `source:${selectedParts[selectedRegion]}`
      : ''

  useEffect(() => {
    if (!selectedCharacter) return
    const nextEntry = `${screenLabel(screen)}: ${selectedCharacter.display_name}, ${animation}/${direction}, layer ${selectedRegion}`
    setRecentActivity((current) => current[0] === nextEntry ? current : [nextEntry, ...current].slice(0, 8))
  }, [animation, direction, screen, selectedCharacter, selectedRegion])

  const aiToolHistory = useMemo(() => aiStudioMessages
    .flatMap((message) => message.tool_proposals ?? [])
    .filter((proposal) => proposal.status !== 'pending')
    .slice(-8)
    .map((proposal) => ({
      tool_id: proposal.tool_id,
      status: proposal.status,
      result: proposal.result ?? '',
    })), [aiStudioMessages])

  const aiActivitySnapshot = useMemo(() => selectedCharacter ? buildAiActivitySnapshot({
    screen,
    screenLabel: screenLabel(screen),
    sourcePackFilter,
    recipeMode,
    selectedCharacter,
    animationSourceCharacter,
    currentAnimation: animation,
    currentDirection: direction,
    currentFrameIndex: frameIndex,
    currentFrameCount: frames.length,
    currentFrameSourceRect: frame?.source_rect ?? null,
    currentFrameCanvasSize: frameCharacter?.canvas_size ?? selectedCharacter.canvas_size,
    playing,
    selectedLayer: selectedRegion,
    selectedPartId: selectedPartIds[selectedRegion] ?? null,
    selectedSourcePartId: selectedParts[selectedRegion] ?? null,
    selectedPartOptionCount: previewLibraryPartOptions.length + previewLpcPartOptions.length,
    recipe,
    recipeReadiness,
    missingAnimationQueueSummary: currentMissingAnimationQueue?.summary ?? null,
    generationJobCount: generationJobs.length,
    releaseBlockerCount: currentGenerationReleaseBlockers.length,
    ragStatus,
    ragIndex,
    ragSourceMode: ragIndex ? (localToolsAvailable ? 'local_full' : 'hosted_public') : 'not_loaded',
    localToolsAvailable,
    localToolCapabilities: [
      'scan_pc_rag_assets',
      'fetch_web_rag_sources',
      'search_assets',
      'lint',
      'source_hygiene',
      'rag_hosted_check',
      'ai_tools_tests',
      'release_build',
      'lpc_render_matrix_audit',
    ],
    lpcPublished: Boolean(lpcInventory),
    toolStatus: {
      aseprite: toolConnections.aseprite.enabled ? 'connected' : 'export_package',
      pixellab: toolConnections.pixellab.enabled ? 'connected' : 'not_connected',
      local_llm: toolConnections.local_llm.enabled ? 'connected' : 'not_connected',
    },
    visibleStatuses: {
      manifest: manifestStatus === 'ready' ? '' : manifestError || manifestStatus,
      part_library: partLibraryStatus,
      apes: apesBridgeStatus,
      export: exportStatus,
      lpc: lpcStatus,
      duelyst: duelystStatus,
      settings: settingsStatus,
      persistence: persistenceWarning,
    },
    recentActions: recentActivity,
    toolHistory: aiToolHistory,
  }) : null, [
    aiToolHistory,
    animation,
    animationSourceCharacter,
    apesBridgeStatus,
    currentGenerationReleaseBlockers.length,
    currentMissingAnimationQueue?.summary,
    direction,
    duelystStatus,
    exportStatus,
    frame?.source_rect,
    frameCharacter?.canvas_size,
    frameIndex,
    frames.length,
    generationJobs.length,
    lpcInventory,
    lpcStatus,
    localToolsAvailable,
    manifestError,
    manifestStatus,
    partLibraryStatus,
    persistenceWarning,
    playing,
    previewLibraryPartOptions.length,
    previewLpcPartOptions.length,
    ragIndex,
    ragStatus,
    recentActivity,
    recipe,
    recipeMode,
    recipeReadiness,
    screen,
    selectedCharacter,
    selectedPartIds,
    selectedParts,
    selectedRegion,
    settingsStatus,
    sourcePackFilter,
    toolConnections,
  ])

  function selectPreviewPart(value: string) {
    const [kind, id] = value.split(':', 2)
    setSelectedPartIds((current) => {
      const next = { ...current }
      if (kind === 'library' && id) {
        next[selectedRegion] = id
      } else {
        delete next[selectedRegion]
      }
      return next
    })
    setSelectedParts((current) => {
      const next = { ...current }
      if (kind === 'source' && id) {
        next[selectedRegion] = id
      } else if (!value) {
        delete next[selectedRegion]
      }
      return next
    })
  }

  useEffect(() => {
    if (!availableDirections.includes(direction)) {
      setDirection(availableDirections[0] ?? 'south')
      setFrameIndex(0)
    }
  }, [availableDirections, direction])

  useEffect(() => {
    if (!selectedCharacter) return
    if (animationSourceId && !animationSourceOptions.some((character) => character.character_id === animationSourceId)) {
      setAnimationSourceId('')
      return
    }
    if (!animationSourceCharacter?.animation_names.includes(animation)) {
      setAnimation(animationSourceCharacter?.animation_names[0] ?? 'idle')
    }
    setFrameIndex(0)
  }, [animation, animationSourceCharacter, animationSourceId, animationSourceOptions, selectedCharacter])

  useEffect(() => {
    if (!selectedCharacter || isLpcMannequin(selectedCharacter)) return
    setSelectedParts((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([, characterId]) => !isLpcSourceCharacterId(characterId)),
      ) as Record<PartLabel, string>
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
    setSelectedPartIds((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([, partId]) => {
          const part = partLibrary.find((item) => item.part_id === partId)
          return !isLpcExtractedPart(part)
        }),
      ) as Partial<Record<PartLabel, string>>
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [partLibrary, selectedCharacter])

  useEffect(() => {
    if (!selectedCharacter || !isLpcMannequin(selectedCharacter)) return
    setSelectedParts((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([label, characterId]) => {
          if (!isLpcSourceCharacterId(characterId)) return true
          const sourceCharacter = characters.find((character) => character.character_id === characterId)
          return sourceCharacter ? isLpcPartSourceCharacter(sourceCharacter, label as PartLabel) : false
        }),
      ) as Record<PartLabel, string>
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [characters, selectedCharacter])

  useEffect(() => {
    if (sourcePackFilter === 'all' || sourceCharacterOptions.length === 0) return
    if (!sourceCharacterOptions.some((character) => character.character_id === selectedCharacter?.character_id)) {
      setSelectedId(sourceCharacterOptions[0].character_id)
      setDirection('south')
      setFrameIndex(0)
    }
  }, [selectedCharacter, sourceCharacterOptions, sourcePackFilter])

  useEffect(() => {
    const expectedPack = sourcePackForRecipeMode(recipeMode)
    if (sourcePackFilter !== expectedPack) {
      setSourcePackFilter(expectedPack)
    }
  }, [recipeMode, sourcePackFilter])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      if (Date.now() < manualFrameStepUntilRef.current) return
      setFrameIndex((current) => (frames.length > 0 ? (current + 1) % frames.length : 0))
    }, animation === 'attack' ? 110 : 150)
    playbackTimerRef.current = timer
    return () => {
      window.clearInterval(timer)
      if (playbackTimerRef.current === timer) playbackTimerRef.current = null
    }
  }, [animation, frames.length, playing])

  useEffect(() => {
    if (previousScreenRef.current === null) {
      previousScreenRef.current = screen
      return
    }
    if (previousScreenRef.current === screen) return
    previousScreenRef.current = screen
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (tabTransitionTimerRef.current !== null) {
      window.clearTimeout(tabTransitionTimerRef.current)
    }
    const screenIndex = screens.findIndex((item) => item.id === screen)
    const sheet = tabTransitionSheets[Math.max(0, screenIndex) % tabTransitionSheets.length]
    setTabTransition({
      key: Date.now(),
      sheet: publicAssetPath(sheet),
    })
    tabTransitionTimerRef.current = window.setTimeout(() => {
      setTabTransition(null)
      tabTransitionTimerRef.current = null
    }, 620)
    return () => {
      if (tabTransitionTimerRef.current !== null) {
        window.clearTimeout(tabTransitionTimerRef.current)
        tabTransitionTimerRef.current = null
      }
    }
  }, [screen])

  function stepFrame(delta: -1 | 1) {
    manualFrameStepUntilRef.current = Date.now() + 1000
    if (playbackTimerRef.current !== null) {
      window.clearInterval(playbackTimerRef.current)
      playbackTimerRef.current = null
    }
    setPlaying(false)
    setFrameIndex((current) => {
      if (frames.length <= 0) return 0
      return (current + delta + frames.length) % frames.length
    })
  }

  function stepSourceCharacter(delta: -1 | 1) {
    if (sourceCharacterOptions.length <= 1) return
    const currentIndex = Math.max(0, sourceCharacterOptions.findIndex((character) => character.character_id === selectedCharacter.character_id))
    const nextCharacter = sourceCharacterOptions[(currentIndex + delta + sourceCharacterOptions.length) % sourceCharacterOptions.length]
    setSelectedId(nextCharacter.character_id)
    setDirection('south')
    setFrameIndex(0)
    setPlaying(false)
  }

  const classCounts = useMemo(() => {
    return characters.reduce<Record<string, number>>((acc, character) => {
      acc[character.class_type] = (acc[character.class_type] ?? 0) + 1
      return acc
    }, {})
  }, [characters])

  const batchVariants = useMemo(() => {
    if (!selectedCharacter || characters.length === 0) return []
    const random = seededRandom(batchSeed)
    const batchRecipeMode = recipeMode === 'duelyst_review' ? 'sprite_kitbash' : recipeMode
    const baseCandidates = characters.filter((character) =>
      isMainSourceCharacter(character) &&
      canShowCharacterInRecipeMode(character, batchRecipeMode) &&
      getSourcePackFilter(character) !== 'duelyst',
    )
    const fallbackBaseCandidates = characters.filter((character) =>
      isMainSourceCharacter(character) &&
      canShowCharacterInRecipeMode(character, 'sprite_kitbash') &&
      getSourcePackFilter(character) !== 'duelyst',
    )
    const basePool = baseCandidates.length > 0 ? baseCandidates : fallbackBaseCandidates
    const reviewedParts = partLibrary.filter((part) =>
      part.reviewed &&
      (!isLpcExtractedPart(part) || batchRecipeMode === 'lpc_character'),
    )
    const activePreset = variationPresets.find((preset) => preset.preset_id === activeVariationPresetId)
    return Array.from({ length: batchCount }, (_, index) => {
      const presetBase = activePreset ? basePool.find((character) => character.character_id === activePreset.base_character) : undefined
      const baseCharacter = presetBase ?? basePool[Math.floor(random() * basePool.length)] ?? selectedCharacter
      const parts = layerOrder.map((label) => {
        const presetPartId = activePreset?.selected_part_ids[label]
        const presetPart = presetPartId ? partLibrary.find((part) => part.part_id === presetPartId) : undefined
        if (presetPart) {
          return {
            label,
            source_character: presetPart.character_id,
            method: presetPart.extraction_method,
            source_part_id: presetPart.part_id,
            reviewed: presetPart.reviewed,
          }
        }

        const approvedCandidates = reviewedParts.filter((part) =>
          part.label === label && isPartCompatibleWithMannequin(part, baseCharacter),
        )
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

        return {
          label,
          source_character: baseCharacter.character_id,
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
      const resolvedPalette = activePreset?.palette ?? variantPalette
      return {
        id: `variant_${String(index + 1).padStart(3, '0')}`,
        base: baseCharacter.character_id,
        palette: resolvedPalette,
        parts,
        recipe: {
          ...makeRecipe(
            baseCharacter,
            selectedSourceParts,
            partLibrary,
            selectedPartIds,
            activePreset?.layer_settings ?? {},
            `batch_${batchSeed}_${String(index + 1).padStart(3, '0')}`,
            resolvedPalette,
            activePreset?.palette_rules ?? defaultPaletteRules,
          ),
          recipe_mode: batchRecipeMode,
          source_family: sourceFamilyForRecipeMode(batchRecipeMode),
        },
      }
    })
  }, [activeVariationPresetId, batchCount, batchSeed, characters, partLibrary, recipeMode, selectedCharacter, variationPresets])

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
      recipe_mode: recipeMode,
      source_family: sourceFamilyForRecipeMode(recipeMode),
      base_character: selectedCharacter.character_id,
      animation_source_character: hasBorrowedAnimationSource ? animationSourceCharacter?.character_id : undefined,
      lpc_selections: recipeMode === 'lpc_character' ? { ...lpcSelections } : undefined,
      selected_parts: { ...selectedParts },
      selected_part_ids: { ...selectedPartIds },
      layer_settings: { ...layerSettings },
      palette,
      palette_rules: { ...paletteRules },
      saved_at: new Date().toISOString(),
    }
    setSavedRecipes((current) => [savedRecipe, ...current.filter((item) => item.recipe_id !== recipeId)])
  }

  function saveVariationPreset() {
    if (!selectedCharacter) return
    const preset: VariationPreset = {
      preset_id: `variation_${recipeId}_${Date.now()}`,
      name: `${recipeName.trim() || selectedCharacter.display_name} variation`,
      base_character: selectedCharacter.character_id,
      selected_part_ids: { ...selectedPartIds },
      selected_parts: { ...selectedParts },
      layer_settings: { ...layerSettings },
      palette,
      palette_rules: { ...paletteRules },
      tags: ['saved_from_creator'],
      saved_at: new Date().toISOString(),
    }
    setVariationPresets((current) => [preset, ...current])
    setActiveVariationPresetId(preset.preset_id)
  }

  function loadSavedRecipe(recipeToLoadId: string) {
    const savedRecipe = savedRecipes.find((item) => item.recipe_id === recipeToLoadId)
    if (!savedRecipe) return
    if (characters.some((character) => character.character_id === savedRecipe.base_character)) {
      setSelectedId(savedRecipe.base_character)
    }
    setRecipeId(savedRecipe.recipe_id)
    setRecipeName(savedRecipe.name)
    setRecipeMode(savedRecipe.recipe_mode ?? (getSourcePackFilter(characters.find((character) => character.character_id === savedRecipe.base_character) ?? selectedCharacter) === 'lpc' ? 'lpc_character' : 'sprite_kitbash'))
    setLpcSelections(savedRecipe.lpc_selections ?? {})
    setSelectedParts(savedRecipe.selected_parts)
    setSelectedPartIds(savedRecipe.selected_part_ids)
    setLayerSettings(savedRecipe.layer_settings ?? {})
    setPalette(savedRecipe.palette)
    setPaletteRules(savedRecipe.palette_rules ?? defaultPaletteRules)
    setAnimationSourceId(savedRecipe.animation_source_character ?? '')
  }

  function startNewRecipe() {
    const nextCharacterId = selectedCharacter?.character_id ?? selectedId
    setRecipeId(makeDraftRecipeId(nextCharacterId))
    setRecipeName('Draft kitbash')
    setSelectedParts({} as Record<PartLabel, string>)
    setSelectedPartIds({})
    setLpcSelections({})
    setLayerSettings({})
    setAnimationSourceId('')
    setPaletteRules(defaultPaletteRules)
  }

  function updatePaletteRules(patch: Partial<Omit<PaletteRules, 'team_color'>>) {
    setPaletteRules((current) => ({ ...current, ...patch }))
  }

  function setExportTargetProfile(value: ExportTargetProfileId) {
    setExportTargetProfileState(value)
    storeString(exportTargetProfileStorageKey, value)
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
      apesDirections.length > 0 ? apesDirections : availableDirections,
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

  function createGenerationJobsFromQueue(queue: MissingAnimationQueue) {
    if (!selectedCharacter || !recipe) return
    const existingQueueItemIds = new Set(
      generationJobs
        .filter((job) => (
          job.recipe_id === recipe.character_id &&
          job.character_id === selectedCharacter.character_id &&
          job.target_profile === exportTargetProfile
        ))
        .flatMap((job) => job.source_queue_item_ids),
    )
    const newQueue = {
      ...queue,
      items: queue.items.filter((item) => !existingQueueItemIds.has(item.id)),
    }
    const jobs = createGenerationJobsFromMissingAnimationQueue(newQueue, {
      recipeId: recipe.character_id,
      characterId: selectedCharacter.character_id,
      targetProfile: exportTargetProfile,
      provider: aiProviderConfig,
      settings: {
        filename_template: filenameTemplate,
        style_notes: generationStyleNotes,
      },
      contextForItem: ragIndex
        ? (item) => buildRagContextBundle(ragIndex, {
            purpose: 'generation_prompt',
            query: buildAiGenerationContextQuery(item, {
              characterId: selectedCharacter.character_id,
              targetProfile: exportTargetProfile,
            }),
            limit: 5,
          })
        : undefined,
    })
    if (jobs.length === 0) {
      setApesBridgeStatus('No new generation jobs were queued; every current missing-animation item already has a job.')
      setScreen('apes')
      return
    }
    setGenerationJobs((current) => [...jobs, ...current])
    setApesBridgeStatus(`Queued ${jobs.length} manual generation handoff job(s). Outputs remain blocked until review and are not selected automatically.`)
    setScreen('apes')
  }

  function createGenerationJobsFromCurrentMissingQueue() {
    if (!recipe || recipe.recipe_mode !== 'lpc_character' || !lpcCatalog) {
      setApesBridgeStatus('Missing-animation generation jobs require an LPC recipe and the LPC catalog. Load LPC locally first, then queue the jobs.')
      setScreen('apes')
      return
    }
    const consumedItemIds = new Set(
      generationJobs
        .filter((job) => (
          job.recipe_id === recipe.character_id &&
          job.character_id === selectedCharacter.character_id &&
          job.target_profile === exportTargetProfile
        ))
        .flatMap((job) => job.source_queue_item_ids),
    )
    const queue = filterMissingAnimationQueue(
      buildMissingAnimationQueue({
        catalog: lpcCatalog,
        recipe,
        bodyType: inferLpcBodyTypeForCharacter(selectedCharacter),
        animations: apesAnimations.length > 0 ? apesAnimations : selectedCharacter.animation_names,
        directions: apesDirections.length > 0 ? apesDirections : availableDirections,
        frameRange: apesFrameRange,
      }),
      consumedItemIds,
    )
    if (queue.items.length === 0) {
      setApesBridgeStatus('No missing LPC animation layers were found for the current recipe, animation, direction, and frame selection.')
      setScreen('apes')
      return
    }
    createGenerationJobsFromQueue(queue)
  }

  function createPixelLabGenerationJob(input: {
    prompt: string
    animation: AnimationName
    directions: Direction[]
    layers: PartLabel[]
  }): { jobId: string | null; message: string } {
    if (!selectedCharacter) return { jobId: null, message: 'No selected character is available for PixelLab generation.' }
    const provider: AiProviderConfig = {
      provider_id: 'pixellab',
      name: 'PixelLab',
      type: 'pixellab',
      configured: toolConnections.pixellab.enabled,
      capabilities: {
        text_to_sprite: true,
        image_to_animation: true,
        animation_cleanup: true,
        direct_api: toolConnections.pixellab.enabled,
        mcp_available: Boolean(toolConnections.pixellab.mcp_server_url),
      },
      manual_handoff: {
        enabled: true,
        status: toolConnections.pixellab.enabled ? 'available' : 'required',
        notes: toolConnections.pixellab.enabled
          ? 'PixelLab local proxy is enabled; direct submission is attempted from AI Studio approvals.'
          : 'PixelLab is not enabled; export the generation job handoff or enable PixelLab in Settings.',
      },
      settings: {
        endpoint_url: toolConnections.pixellab.endpoint_url,
        preferred_model: toolConnections.pixellab.preferred_model,
      },
    }
    const job = createGenerationJobFromAiStudioRequest({
      recipeId: recipe?.character_id ?? selectedCharacter.character_id,
      characterId: selectedCharacter.character_id,
      targetAnimation: input.animation,
      targetDirections: input.directions,
      targetProfile: exportTargetProfile,
      prompt: input.prompt,
      provider,
      targetLayers: input.layers,
      settings: {
        filename_template: filenameTemplate,
        style_notes: generationStyleNotes,
        source: 'ai_studio',
      },
    })
    setGenerationJobs((current) => [job, ...current])
    setApesBridgeStatus(`Queued PixelLab generation job ${job.job_id}. Outputs remain blocked until review and are not selected automatically.`)
    return { jobId: job.job_id, message: `Queued PixelLab generation job ${job.job_id} in APES Lab.` }
  }

  function importPixelLabGenerationOutputs(jobId: string, rawOutput: unknown) {
    const normalized = normalizePixelLabSpriteOutput(rawOutput)
    const uris = [
      ...normalized.frames.filter((frame): frame is string => typeof frame === 'string' && frame.trim().length > 0),
      ...(normalized.spritesheet ? [normalized.spritesheet] : []),
    ]
    if (uris.length === 0) return `PixelLab returned no image URI output to attach. ${normalized.warnings.join(' ')}`
    const importedAt = new Date().toISOString()
    setGenerationJobs((current) => current.map((job) => {
      if (job.job_id !== jobId) return job
      const outputs = job.outputs.map((output, index) => ({
        ...output,
        uri: uris[index] ?? output.uri,
        reviewed: false,
        release_blocked: true,
      }))
      return {
        ...job,
        updated_at: importedAt,
        status: 'review_required' as const,
        outputs,
        logs: [
          ...job.logs,
          `PixelLab returned ${uris.length} image output(s) at ${importedAt}.`,
          ...normalized.warnings.map((warning) => `PixelLab warning: ${warning}`),
        ],
        review_gate: {
          ...job.review_gate,
          status: 'ready_for_review' as const,
          release_blocked: true,
        },
      }
    }))
    setApesBridgeStatus(`PixelLab returned ${uris.length} image output(s) for ${jobId}. Review is still required before export.`)
    return `Attached ${uris.length} PixelLab image output(s) to ${jobId} for review.`
  }

  function downloadGenerationJobsHandoff() {
    if (generationJobs.length === 0) return
    const payload = buildGenerationJobsHandoffPayload(generationJobs)
    setGenerationJobs(payload.jobs)
    setAiProviderConfig((current) => ({
      ...current,
      manual_handoff: {
        ...current.manual_handoff,
        status: 'exported',
        exported_at: payload.exported_at,
      },
    }))
    downloadJson(`${recipe?.character_id ?? selectedCharacter?.character_id ?? 'character'}_generation_jobs_handoff.json`, payload)
    setApesBridgeStatus(`Generation handoff exported with ${payload.job_count} job(s). Import generated files only after review.`)
  }

  function createTrainingInboxDraft(input: Omit<ClassifyTrainingInboxInput, 'provenance'>) {
    const draft = classifyTrainingInboxDraft({
      ...input,
      provenance: {
        created_at: new Date().toISOString(),
        created_by: 'APES Lab wizard',
        source: 'training-inbox-wizard',
      },
    })
    setTrainingInboxDrafts((current) => [draft, ...current.filter((item) => item.draft_id !== draft.draft_id)])
    const redCount = draft.validation_findings.filter((finding) => finding.level === 'red').length
    setApesBridgeStatus(
      redCount > 0
        ? `Training draft saved with ${redCount} red finding(s). It is not selectable for export or training.`
        : 'Training draft saved for review. Approve it to move it into the Training Library.',
    )
    setScreen('apes')
  }

  function approveTrainingInboxDraft(draftId: string) {
    const draft = trainingInboxDrafts.find((item) => item.draft_id === draftId)
    if (!draft) return
    try {
      const record = approveTrainingDraft(draft, { approved_by: 'APES Lab reviewer' })
      setTrainingLibraryRecords((current) => [record, ...current.filter((item) => item.record_id !== record.record_id)])
      setTrainingInboxDrafts((current) => current.filter((item) => item.draft_id !== draftId))
      setApesBridgeStatus('Training Library record approved. It remains separate from selectable frame parts.')
    } catch (error) {
      setApesBridgeStatus(`Training draft approval blocked. ${error instanceof Error ? error.message : String(error)}`)
    }
    setScreen('apes')
  }

  function openPartReview() {
    setScreen('library')
    setPartLibraryStatus('Review the selected or unreviewed parts before packaging this recipe.')
  }

  function openBatchGenerator() {
    setScreen('batch')
  }

  function openExports() {
    setScreen('exports')
    setExportStatus(`${activeExportTargetProfile.label} selected. ${activeExportTargetProfile.hint}`)
  }

  function openSettingsRepair() {
    setScreen('settings')
    setSettingsStatus('Check the indexed root and local tool availability before repairing or reindexing assets.')
  }

  function createDuelystApesJobs(characterIds: string[]) {
    const stagedCharacters = duelystAudit?.staged_manifest.characters ?? []
    const requestedIds = new Set(characterIds)
    const existingCharacterIds = new Set(apesJobs.map((job) => job.character_id))
    const now = Date.now()
    const jobs = stagedCharacters
      .filter((character) => requestedIds.has(character.character_id) && !existingCharacterIds.has(character.character_id))
      .map((character, index) => {
        const idleFrameCount = character.directions.south?.idle?.frames.length ?? 0
        const job = makeApesJob(character, ['idle'], ['south'], apesCoreLabels, [0, Math.max(0, Math.min(7, idleFrameCount - 1))])
        const jobId = `apes_${character.character_id}_${now}_${index + 1}`
        const inputFrames = job.input_frames.length === 1
          ? [
              job.input_frames[0],
              {
                ...job.input_frames[0],
                frame_index: 1,
              },
            ]
          : job.input_frames
        return {
          ...job,
          job_id: jobId,
          input_frames: inputFrames,
          output_root: `data/apes/output/${jobId}`,
          logs: [
            'Prepared APES input manifest from staged Duelyst atlas frames.',
            ...(job.input_frames.length === 1 ? ['Duplicated the staged source frame so the APES bridge has the minimum two-frame runtime input. Review output masks carefully.'] : []),
            ...job.logs,
          ],
        }
      })
      .filter((job) => job.input_frames.length > 0)

    if (jobs.length === 0) {
      setDuelystStatus('No new Duelyst APES jobs were queued. The filtered staged entries may already have jobs or may not contain frame references.')
      setScreen('apes')
      return
    }

    setApesJobs((current) => [...jobs, ...current])
    setApesBridgeStatus(`Queued ${jobs.length} Duelyst APES review job(s). Run them from APES Lab, then import/review the masks before using them for training.`)
    setDuelystStatus(`Queued ${jobs.length} Duelyst APES review job(s). Existing jobs for the same staged character were skipped.`)
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

  function mergePreparedApesJobsFromBatch(batch: DuelystApesJobBatch | null | undefined) {
    const batchJobs = batch?.job_configs ?? []
    if (batchJobs.length === 0) return 0

    let addedCount = 0
    setApesJobs((current) => {
      const existingIds = new Set(current.map((job) => job.job_id))
      const newJobs = batchJobs
        .filter((job) => !existingIds.has(job.job_id))
        .map((job): ApesJob => {
          const status: ApesJob['status'] = job.status === 'complete' || job.status === 'failed' || job.status === 'running' ? job.status : 'prepared'
          return {
            ...job,
            status,
            created_at: job.created_at || new Date().toISOString(),
            logs: job.logs.length > 0 ? job.logs : ['Prepared from private Duelyst staged atlas frames.'],
          }
        })
      addedCount = newJobs.length
      return newJobs.length > 0 ? [...newJobs, ...current] : current
    })
    return addedCount
  }

  async function runApesPreflight() {
    if (!localToolsAvailable) {
      setApesBridgeStatus('APES preflight needs the local tool server. Start with npm run dev or serve the built app with npm run preview on the APES machine.')
      return
    }

    setApesBridgeBusy(true)
    setApesBridgeStatus('Running APES preflight through the local tool server...')
    try {
      const response = await localToolFetch(localToolPath('apes-tools'), {
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
    if (!localToolsAvailable) {
      setApesBridgeStatus('APES job execution needs the local tool server. Start with npm run dev or npm run preview on the APES machine.')
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
              logs: [...item.logs, `Launching local APES bridge with ${apesPythonPath.trim() || 'the local server Python interpreter'}.`],
            }
          : item,
      ),
    )

    try {
      const response = await localToolFetch(localToolPath('apes-tools'), {
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
    if (!localToolsAvailable) {
      setApesBridgeStatus('Local QA harness generation needs the local tool server. Start with npm run dev or npm run preview on this machine.')
      return
    }

    setApesBridgeBusy(true)
    setApesBridgeStatus('Generating the local APES QA harness through the local tool server...')
    try {
      const response = await localToolFetch(localToolPath('apes-tools'), {
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

  async function summarizeApesOutputs() {
    if (!localToolsAvailable) {
      setApesBridgeStatus('APES output inventory needs the local tool server. Start with npm run dev or npm run preview on the APES machine.')
      return
    }

    setApesBridgeBusy(true)
    setApesBridgeStatus('Scanning APES output reports...')
    try {
      const response = await localToolFetch(localToolPath('apes-tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize-outputs', pythonPath: apesPythonPath.trim() }),
      })
      const payload = await response.json() as LocalApesToolPayload
      if (!response.ok) {
        throw new Error(payload.stderr || payload.error || `APES output inventory failed with status ${payload.statusCode}`)
      }

      const inventory = payload.inventory
      if (!inventory) {
        setApesBridgeStatus('APES output inventory completed, but the inventory file could not be loaded.')
        return
      }

      setApesOutputInventory(inventory)
      setApesBridgeStatus(
        `Inventoried ${inventory.report_count} APES report(s): ${inventory.summary.needs_review} need review, ${inventory.summary.empty_reports} empty, ${inventory.summary.failed_outputs} failed output(s), ${inventory.summary.reviewed_reports} fully reviewed. Wrote ${inventory.output_root}/apes_output_inventory.json.`,
      )
    } catch (error) {
      setApesBridgeStatus(`APES output inventory failed. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setApesBridgeBusy(false)
    }
  }

  async function prepareApesFinetuneData() {
    if (!localToolsAvailable) {
      setApesBridgeStatus('APES fine-tune prep needs the local tool server. Start with npm run dev or npm run preview on the APES machine.')
      return
    }

    setApesBridgeBusy(true)
    setApesBridgeStatus('Preparing APES fine-tune manifest and Duelyst review dataset...')
    try {
      const response = await localToolFetch(localToolPath('apes-tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare-finetune', pythonPath: apesPythonPath.trim() }),
      })
      const payload = await response.json() as LocalApesToolPayload
      if (!response.ok) {
        throw new Error(payload.stderr || payload.error || `APES fine-tune prep failed with status ${payload.statusCode}`)
      }
      if (!payload.finetuneManifest) {
        setApesBridgeStatus('APES fine-tune prep ran, but the manifest could not be loaded back into the app.')
        return
      }

      setApesFinetuneManifest(payload.finetuneManifest)
      const datasetCount = Object.keys(payload.finetuneManifest.datasets ?? {}).length
      const warningCount = payload.finetuneManifest.warnings?.length ?? 0
      setApesBridgeStatus(`Prepared APES fine-tune manifest with ${datasetCount} dataset section(s) and ${warningCount} warning(s).`)
    } catch (error) {
      setApesBridgeStatus(`APES fine-tune prep failed. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setApesBridgeBusy(false)
    }
  }

  async function prepareDuelystApesJobs() {
    if (!localToolsAvailable) {
      setApesBridgeStatus('Duelyst APES job prep needs the local tool server. Start with npm run dev or npm run preview on the APES machine.')
      return
    }

    setApesBridgeBusy(true)
    setApesBridgeStatus('Preparing Duelyst APES jobs from the private staged manifest...')
    try {
      const response = await localToolFetch(localToolPath('apes-tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare-duelyst-jobs', pythonPath: apesPythonPath.trim() }),
      })
      const payload = await response.json() as LocalApesToolPayload
      if (!response.ok) {
        throw new Error(payload.stderr || payload.error || `Duelyst APES job prep failed with status ${payload.statusCode}`)
      }
      if (!payload.duelystJobBatch) {
        setApesBridgeStatus('Duelyst APES job prep ran, but the job batch manifest could not be loaded back into the app.')
        return
      }

      setDuelystApesJobBatch(payload.duelystJobBatch)
      const addedCount = mergePreparedApesJobsFromBatch(payload.duelystJobBatch)
      setApesBridgeStatus(
        `Prepared ${payload.duelystJobBatch.job_count} Duelyst APES job(s) from disk and queued ${addedCount} new job(s) in APES Lab.`,
      )
    } catch (error) {
      setApesBridgeStatus(`Duelyst APES job prep failed. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setApesBridgeBusy(false)
    }
  }

  async function importApesInventoryReport(reportPath: string) {
    if (!localToolsAvailable) {
      setApesBridgeStatus('APES report import from inventory needs the local tool server. Start with npm run dev or npm run preview on the APES machine.')
      return
    }

    setApesBridgeBusy(true)
    setApesBridgeStatus(`Loading APES report ${reportPath}...`)
    try {
      const response = await localToolFetch(localToolPath('apes-tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'load-report',
          pythonPath: apesPythonPath.trim(),
          reportPath,
        }),
      })
      const payload = await response.json() as LocalApesToolPayload
      if (!response.ok) {
        throw new Error(payload.stderr || payload.error || `APES report load failed with status ${payload.statusCode}`)
      }
      if (!payload.report) {
        setApesBridgeStatus(`APES report ${reportPath} loaded, but it did not contain importable report data.`)
        return
      }

      const importedCount = importApesReport(payload.report, { statusSource: 'file-import', sourceLabel: reportPath })
      setApesBridgeStatus(`Imported ${importedCount} mask(s) from ${reportPath}. Review them in the Part Library before training/export.`)
    } catch (error) {
      setApesBridgeStatus(`APES report import failed. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setApesBridgeBusy(false)
    }
  }

  async function loadApesQaHarnessReport() {
    try {
      const response = await fetch(publicAssetPath('data/qa/apes_report_harness.json'))
      if (!response.ok) {
        throw new Error(`QA harness report request failed with status ${response.status}`)
      }

      const report = await response.json() as ApesReport
      importApesReport(report, { replaceQaHarnessExisting: true })
      setApesBridgeStatus(`Loaded and replaced the APES QA sample report with ${report.masks.length} sample mask(s).`)
    } catch (error) {
      setApesBridgeStatus(`Could not load the APES QA sample report. ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function importApesReport(report: ApesReport, options: ImportApesReportOptions = {}) {
    const validation = validateApesReport(report)
    if (!validation.ok) {
      setApesBridgeStatus(`APES report import rejected: ${validation.errors.slice(0, 4).join(' ')}`)
      return 0
    }
    report = validation.report
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
      const imageFileName = fileNameFromAssetPath(mask.image_path, `${mask.label}.png`)
      const maskFileName = fileNameFromAssetPath(mask.path, `${mask.label}_mask.png`)
      const imageDataUrl = toBrowserAssetUrl(mask.image_path)
      const maskDataUrl = toBrowserAssetUrl(mask.path)
      return {
        part_id: `${report.job_id}_${mask.label}_${String(index).padStart(3, '0')}`,
        character_id: characterId,
        label: mask.label,
        source_animation: input?.animation ?? animations[0] ?? 'idle',
        source_direction: input?.direction ?? directions[0] ?? 'south',
        source_frame_path: input?.path,
        image_path: imageFileName,
        mask_path: maskFileName,
        image_data_url: imageDataUrl,
        mask_data_url: maskDataUrl,
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
          !imageDataUrl && isLocalApesOutputPath(mask.image_path) ? 'Image asset is local-only and only renderable while the local tool server is available.' : '',
          !maskDataUrl && isLocalApesOutputPath(mask.path) ? 'Mask asset is local-only and only renderable while the local tool server is available.' : '',
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

    return importedParts.length
  }

  function importApesReportText(reportText: string, options: ImportApesReportOptions = {}) {
    try {
      const validation = validateApesReport(JSON.parse(reportText) as unknown)
      if (!validation.ok) {
        setApesBridgeStatus(`APES report import rejected: ${validation.errors.slice(0, 4).join(' ')}`)
        return false
      }
      const report = validation.report
      const importedCount = importApesReport(report, options)
      if (options.statusSource === 'pasted-json') {
        setApesBridgeStatus(`Imported APES report from pasted JSON with ${importedCount} mask(s).`)
      } else if (options.statusSource === 'file-import') {
        const sourceLabel = options.sourceLabel ? ` ${options.sourceLabel}` : ''
        setApesBridgeStatus(`Imported APES report file${sourceLabel} with ${importedCount} mask(s).`)
      }
      return true
    } catch (error) {
      const sourceLabel = options.statusSource === 'file-import' && options.sourceLabel ? ` ${options.sourceLabel}` : ''
      setApesBridgeStatus(`Could not import APES report${sourceLabel}. ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  function downloadLocalSetupBundle() {
    const normalizedAssetRoot = assetRootInput.trim() || manifest?.asset_root || ''
    const normalizedPythonPath = apesPythonPath.trim()
    const escapedAssetRoot = normalizedAssetRoot.replaceAll('"', '\\"')
    const escapedPythonPath = normalizedPythonPath.replaceAll('"', '\\"')
    const repairCommand = normalizedAssetRoot ? `npm run repair:manifest-paths -- --asset-root "${escapedAssetRoot}"` : 'npm run repair:manifest-paths -- --asset-root "<path-to-sprite-pack>"'
    const reindexCommand = normalizedAssetRoot ? `npm run index:assets -- --asset-root "${escapedAssetRoot}"` : 'npm run index:assets -- --asset-root "<path-to-sprite-pack>"'
    const exportCommand = normalizedAssetRoot ? `npm run export:character -- 1-warrior-woman --asset-root "${escapedAssetRoot}"` : 'npm run export:character -- 1-warrior-woman --asset-root "<path-to-sprite-pack>"'
    const preflightCommand = normalizedPythonPath
      ? `"${escapedPythonPath}" tools/apes_bridge/check_apes_env.py --json`
      : 'python tools/apes_bridge/check_apes_env.py --json'
    const bundleText = [
      '# Pixel Creator local setup bundle',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Paths',
      '',
      `- Asset root: ${normalizedAssetRoot || '<set this before running repair, reindex, or export>'}`,
      `- APES Python: ${normalizedPythonPath || 'use the Python interpreter that starts npm run dev'}`,
      '',
      '## First-time setup',
      '',
      '```powershell',
      'npm install',
      repairCommand,
      reindexCommand,
      'npm run dev -- --host 127.0.0.1 --port 8002 --strictPort',
      '# or after npm run build:',
      'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
      '```',
      '',
      '## Validation',
      '',
      '```powershell',
      exportCommand,
      'npm run build',
      'npm run validate:release-package',
      'npm run test:browser',
      'npm run release:check',
      '```',
      '',
      '## APES machine checks',
      '',
      '```powershell',
      'micromamba env update -n apes-gpu-modern -f tools/apes_bridge/environment.gpu.yml',
      preflightCommand,
      '```',
      '',
      '## Notes',
      '',
      '- Direct repair, reindex, Duelyst audit, LPC inventory, and APES bridge actions work when the app is served by the local Vite dev or preview server.',
      '- The APES QA harness is available in-app from APES Lab and is safe to use on non-GPU machines.',
      '- If the manifest asset root and your target asset root differ, use Settings to repair or reindex before exporting.',
    ].join('\n')

    downloadText('pixel_creator_local_setup.md', `${bundleText}\n`, 'text/markdown')
    setSettingsStatus('Local setup bundle downloaded with the current asset and APES settings.')
  }

  function clearApesQaHarnessParts() {
    let removedCount = 0
    const removedAssetKeys: Array<string | undefined> = []
    setPartLibrary((current) => {
      const next = current.filter((part) => {
        const shouldRemove = isApesQaHarnessPart(part)
        if (shouldRemove) {
          removedCount += 1
          removedAssetKeys.push(part.image_asset_key, part.mask_asset_key)
        }
        return !shouldRemove
      })
      return next
    })
    void deletePartLibraryAssets(removedAssetKeys)
    setApesBridgeStatus(
      removedCount > 0
        ? `Removed ${removedCount} APES QA harness part(s) from the Part Library.`
        : 'No APES QA harness parts were present in the Part Library.',
    )
  }

  async function extractCurrentRegion() {
    if (!selectedCharacter || !framePath) return
    if (extractionMethod === 'apes') {
      setExtractionHistory((current) => [
        'Create an APES job from APES Lab or the top bar to run the bridge; Workstation APES mode does not create rectangular placeholder parts.',
        ...current,
      ].slice(0, 8))
      setApesBridgeStatus('Create an APES job from APES Lab or the top bar, then run/import the bridge output before reviewing APES parts.')
      return
    }

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
    const deleted = partLibrary.find((part) => part.part_id === partId)
    setPartLibrary((current) => current.filter((part) => part.part_id !== partId))
    void deletePartLibraryAssets([deleted?.image_asset_key, deleted?.mask_asset_key, `${partId}:image`, `${partId}:mask`])
  }

  function clearPartLibrary() {
    setPartLibrary([])
    void compactPartLibraryAssets([])
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

  function importLayerBundleJson(text: string, sourceName: string) {
    try {
      const bundle = parseLayerBundleManifest(text)
      const importedParts = layerBundleToExtractedParts(bundle)
      setPartLibrary((current) => [
        ...importedParts,
        ...current.filter((part) => !importedParts.some((imported) => imported.part_id === part.part_id)),
      ])
      setPartLibraryStatus(`Imported ${importedParts.length} part(s) from ${sourceName}. Review them before release export.`)
    } catch (error) {
      setPartLibraryStatus(`Layer bundle import failed for ${sourceName}. ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function importLpcSheetsAsParts(sheetPaths: string[], options: Omit<LpcSheetImportOptions, 'sheetPaths'> = {}) {
    if (!lpcInventory) {
      setLpcImportStatus('Run or load the LPC inventory before importing sheets.')
      return
    }
    if (sheetPaths.length === 0) {
      setLpcImportStatus('Choose at least one LPC sheet before importing.')
      return
    }

    const importedParts = lpcSheetsToExtractedParts(lpcInventory, { ...options, sheetPaths })
    setPartLibrary((current) => [
      ...importedParts,
      ...current.filter((part) => !importedParts.some((imported) => imported.part_id === part.part_id)),
    ])
    const labelNote = options.labelOverride && options.labelOverride !== 'infer' ? ` as ${options.labelOverride}` : ' with inferred labels'
    setLpcImportStatus(`Imported ${importedParts.length} LPC sheet part(s)${labelNote} into the Part Library.`)
    setPartLibraryStatus(`Imported ${importedParts.length} LPC sheet part(s). Filter by manual or tag "lpc" to select and review them in the creator.`)
    setScreen('library')
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

  function blockReleaseExportForLpcCredits() {
    if (!recipe || recipe.recipe_mode !== 'lpc_character' || !lpcCatalog) return false
    const readiness = buildLpcSelectionCreditReadiness(lpcCatalog, recipe.lpc_selections ?? {})
    if (!readiness.release_blocking) return false
    setExportStatus(`Release export blocked: resolve ${readiness.missing_count} missing and ${readiness.needs_review_count} review-needed LPC credit item(s), or download the credits report for details.`)
    return true
  }

  function blockReleaseExportForPlaceholderMode() {
    if (!apesAllowPlaceholder) return false
    setExportStatus('Release export blocked: turn off placeholder APES fallback before release export.')
    return true
  }

  function getCurrentGenerationReleaseBlockers() {
    return currentGenerationReleaseBlockers
  }

  function blockReleaseExport() {
    if (blockReleaseExportForPlaceholderMode()) return true
    if (blockReleaseExportForLpcCredits()) return true
    const blockers = getCurrentGenerationReleaseBlockers()
    if (blockers.length === 0) return false
    setExportStatus(`Release export blocked: review ${blockers.length} manual generation handoff job(s) for ${activeExportTargetProfile.label} before downloading release exports.`)
    return true
  }

  function exportGeneric() {
    if (!recipe || !selectedCharacter) return
    if (blockReleaseExport()) return
    downloadJson(`${recipe.character_id}_manifest.json`, buildExportManifest(selectedCharacter, recipe, apesJobs, { placeholderModeEnabled: apesAllowPlaceholder }))
  }

  async function exportGodotScene() {
    if (!recipe) return
    if (blockReleaseExport()) return
    const { buildGodotSceneText } = await loadExportPackage()
    downloadText(`${recipe.character_id}.tscn`, buildGodotSceneText(recipe))
  }

  async function exportSpriteFrames() {
    if (!recipe || !selectedCharacter) return
    if (blockReleaseExport()) return
    setExportStatus('Building Godot SpriteFrames resource...')
    try {
      const { buildGodotSpriteFramesResource, buildRenderedFrameSet } = await loadExportPackage()
      const renderedFrameSet = await buildRenderedFrameSet(selectedCharacter, recipe, characters, partLibrary, lpcCatalog, exportTargetProfile)
      downloadText(`${recipe.character_id}_sprite_frames.tres`, buildGodotSpriteFramesResource(recipe, renderedFrameSet, 'rendered/frames'))
      setExportStatus(`Godot SpriteFrames resource ready with ${renderedFrameSet.frame_count} rendered frame(s).`)
    } catch (error) {
      setExportStatus(`Godot SpriteFrames export failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function exportUnityMetadata() {
    if (!recipe || !selectedCharacter) return
    if (blockReleaseExport()) return
    downloadJson(`${recipe.character_id}_unity_2d.json`, buildUnity2DMetadata(selectedCharacter, recipe))
  }

  function exportRpgMakerMetadata() {
    if (!recipe || !selectedCharacter) return
    if (blockReleaseExport()) return
    downloadJson(`${recipe.character_id}_rpg_maker_mz.json`, buildRpgMakerMzMetadata(selectedCharacter, recipe))
  }

  function exportAsepriteReference() {
    if (!recipe || !selectedCharacter) return
    if (blockReleaseExport()) return
    downloadJson(`${recipe.character_id}_aseprite_reference.json`, buildAsepriteReference(selectedCharacter, recipe))
  }

  async function exportCurrentSpriteSheet() {
    if (!animationSourceCharacter) return
    if (blockReleaseExport()) return
    const currentFrames = getFrames(animationSourceCharacter, animation, direction)
    await downloadSpriteSheet(
      `${recipe?.character_id ?? selectedCharacter.character_id}_${animation}_${direction}_sheet.png`,
      currentFrames.map((frame) => frame.path),
      currentFrames.length,
    )
  }

  async function exportAnimationSheets() {
    if (!animationSourceCharacter) return
    if (blockReleaseExport()) return
    await downloadAllDirectionSpriteSheets(animationSourceCharacter, animation)
  }

  async function exportRenderedFrameSet() {
    if (!recipe || !selectedCharacter) return
    if (blockReleaseExport()) return
    setExportStatus('Rendering full frame set...')
    try {
      const { buildRenderedFrameSet } = await loadExportPackage()
      const renderedFrameSet = await buildRenderedFrameSet(selectedCharacter, recipe, characters, partLibrary, lpcCatalog, exportTargetProfile)
      downloadJson(`${recipe.character_id}_rendered_frame_set.json`, renderedFrameSet)
      setExportStatus(`Rendered ${renderedFrameSet.frame_count} frame(s) and ${renderedFrameSet.spritesheet_count} spritesheet record(s).`)
    } catch (error) {
      setExportStatus(`Rendered frame set failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function downloadGenerationManifest() {
    if (!selectedCharacter) return
    const generationManifest = buildGenerationManifest({
      character: selectedCharacter,
      animations: apesAnimations,
      directions: apesDirections,
      frameRange: apesFrameRange,
      labels: apesLabels,
      filenameTemplate,
      styleNotes: generationStyleNotes,
      layerBundleTargets: layerOrder,
    })
    downloadJson(`${selectedCharacter.character_id}_generation_manifest.json`, generationManifest)
    setApesBridgeStatus(`Generation manifest ready with ${generationManifest.frame_references.length} frame reference(s) and ${generationManifest.output_labels.length} output label(s).`)
  }

  async function exportFullPackageManifest() {
    if (!recipe || !selectedCharacter) return
    if (blockReleaseExport()) return
    setExportStatus('Building full package manifest...')
    try {
      const { buildFullPackageManifest } = await loadExportPackage()
      const packageManifest = {
        ...(await buildFullPackageManifest(selectedCharacter, recipe, characters, partLibrary, apesJobs, undefined, lpcCatalog, { placeholderModeEnabled: apesAllowPlaceholder, exportTargetProfile })),
        filename_template: filenameTemplate,
      }
      downloadJson(`${recipe.character_id}_full_package_manifest.json`, packageManifest)
      setExportStatus(`Full package manifest ready with ${packageManifest.rendered_outputs.frame_count} rendered frame(s).`)
    } catch (error) {
      setExportStatus(`Full package export failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function exportRenderedFrameSetZip() {
    if (!recipe || !selectedCharacter) return
    if (blockReleaseExport()) return
    setExportStatus('Building rendered frame zip...')
    try {
      const { downloadRenderedFrameSetZip } = await loadExportPackage()
      const summary = await downloadRenderedFrameSetZip(selectedCharacter, recipe, characters, partLibrary, lpcCatalog, exportTargetProfile)
      setExportStatus(`Rendered frame zip ready with ${summary.frame_count} frame(s) and ${summary.spritesheet_count} spritesheet(s).`)
    } catch (error) {
      setExportStatus(`Rendered frame zip failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function exportFullPackageZip() {
    if (!recipe || !selectedCharacter) return
    if (blockReleaseExport()) return
    setExportStatus('Building full package zip...')
    try {
      const { downloadFullPackageZip } = await loadExportPackage()
      const summary = await downloadFullPackageZip(selectedCharacter, recipe, characters, partLibrary, apesJobs, lpcCatalog, { placeholderModeEnabled: apesAllowPlaceholder, exportTargetProfile })
      setExportStatus(`Full package zip ready with ${summary.frame_count} frame(s), ${summary.spritesheet_count} spritesheet(s), and ${summary.part_count} selected part folder(s).`)
    } catch (error) {
      setExportStatus(`Full package zip failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function exportCreditsReport() {
    if (!selectedCharacter) return
    const { downloadCreditsReport } = await loadExportPackage()
    downloadCreditsReport(selectedCharacter, recipe, partLibrary, lpcCatalog)
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
      try {
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
      } finally {
        input.remove()
      }
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
    setSettingsStatus(action === 'repair' ? 'Running manifest repair through the local tool server...' : 'Running manifest reindex through the local tool server...')
    try {
      const response = await localToolFetch(localToolPath('asset-tools'), {
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
      setSettingsStatus(`Local ${action} failed. Start the app with npm run dev or npm run preview, or use the copy-command buttons instead. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSettingsBusy(false)
    }
  }

  async function runDuelystAudit() {
    if (!localToolsAvailable) {
      setDuelystStatus('Duelyst package inspection needs the local tool server because the app stages local preview files. Start with npm run dev or npm run preview.')
      return
    }

    setDuelystBusy(true)
    setDuelystStatus('Analyzing the Duelyst unitypackage, labeling candidates, and staging 64 review frames...')
    try {
      const response = await localToolFetch(localToolPath('asset-tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duelyst-audit', stageTopCount: 64, candidateLimit: 'all' }),
      })
      const payload = await response.json() as LocalAssetToolPayload
      if (!response.ok || !payload.duelyst) {
        throw new Error(payload.error || payload.stderr || `Duelyst audit failed with status ${response.status}`)
      }

      const duelyst = normalizeDuelystAudit(payload.duelyst, publicAssetPath)
      setDuelystAudit(duelyst)
      setDuelystStatus(`${duelyst.summary} Staged candidates now appear in the source-character picker and can be opened directly in the workstation.`)
    } catch (error) {
      setDuelystStatus(`Duelyst audit failed. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setDuelystBusy(false)
    }
  }

  async function runLpcInventory() {
    if (lpcBusy) return
    if (!localToolsAvailable) {
      setLpcStatus('LPC inventory rebuild needs the local tool server. Start with npm run dev or npm run preview, or run `npm run lpc:inventory` from the terminal.')
      return
    }

    setLpcBusy(true)
    setLpcStatus('Scanning local LPC assets and upstream reference metadata...')
    try {
      const response = await localToolFetch(localToolPath('asset-tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lpc-inventory' }),
      })
      const payload = await response.json() as LocalAssetToolPayload
      if (!response.ok) {
        throw new Error(payload.error || payload.stderr || `LPC inventory failed with status ${response.status}`)
      }

      if (!payload.lpcInventory) {
        setLpcStatus('LPC inventory completed, but the inventory file could not be loaded.')
        return
      }

      setLpcInventory(payload.lpcInventory)
      setLpcStatus(
        `Indexed ${payload.lpcInventory.summary.png_count} LPC PNG sheet(s), ${payload.lpcInventory.summary.lpc_grid_count} on a 64x64 grid, with ${payload.lpcInventory.summary.credit_file_count} credit/license file(s).`,
      )
    } catch (error) {
      setLpcStatus(`LPC inventory failed. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLpcBusy(false)
    }
  }

  async function runLpcCatalog() {
    if (lpcBusy) return
    if (!localToolsAvailable) {
      setLpcStatus('LPC catalog rebuild needs the local tool server. Start with npm run dev or npm run preview, or run `npm run lpc:catalog` from the terminal.')
      return
    }

    setLpcBusy(true)
    setLpcStatus('Building compact LPC catalog from upstream sheet definitions...')
    try {
      const response = await localToolFetch(localToolPath('asset-tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lpc-catalog' }),
      })
      const payload = await response.json() as LocalAssetToolPayload
      if (!response.ok) {
        throw new Error(payload.error || payload.stderr || `LPC catalog failed with status ${response.status}`)
      }

      if (!payload.lpcCatalog) {
        setLpcStatus('LPC catalog completed, but the catalog file could not be loaded.')
        return
      }

      setLpcCatalog(payload.lpcCatalog)
      setLpcStatus(
        `Built LPC catalog with ${payload.lpcCatalog.summary.item_count} item(s), ${payload.lpcCatalog.summary.layer_count} layer(s), and ${payload.lpcCatalog.summary.credit_count} credit record(s).`,
      )
    } catch (error) {
      setLpcStatus(`LPC catalog failed. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLpcBusy(false)
    }
  }

  async function runPreparedDuelystJobs() {
    if (apesBridgeBusy) return
    const prepared = apesJobs.filter((job) => job.character_id.startsWith('duelyst_') && job.status === 'prepared')
    if (prepared.length === 0) {
      setApesBridgeStatus('No prepared Duelyst APES jobs are queued.')
      return
    }

    setApesBridgeStatus(`Running ${prepared.length} prepared Duelyst APES job(s) one at a time. This can take a while on the 3060.`)
    for (const job of prepared) {
      await runApesJob(job.job_id)
    }
  }


  async function loadPrivateDuelystManifest(signal?: AbortSignal) {
    setDuelystBusy(true)
    try {
      const manifestCandidates = [
        { url: publicAssetPath(`data/manifests/${['duelyst', 'private', 'json'].join('.')}`), label: 'private manifest' },
        { url: publicAssetPath('data/manifests/duelyst.json'), label: 'public manifest' },
      ]
      let payload: DuelystPackageAudit | null = null
      let label = ''
      for (const candidate of manifestCandidates) {
        const candidateResponse = await fetch(candidate.url, { signal, cache: 'no-store' })
        if (signal?.aborted) return
        if (candidateResponse.status === 404) continue
        if (!candidateResponse.ok) {
          if (candidate.label === 'private manifest') continue
          throw new Error(`${candidate.label} request failed with status ${candidateResponse.status}`)
        }
        try {
          payload = await candidateResponse.json() as DuelystPackageAudit
        } catch (error) {
          if (candidate.label === 'private manifest') continue
          throw new Error(`${candidate.label} did not return usable JSON. ${error instanceof Error ? error.message : String(error)}`, { cause: error })
        }
        label = candidate.label
        break
      }
      if (signal?.aborted) return
      if (!payload) {
        setDuelystStatus('No Duelyst manifest found yet. Run the local audit or `npm run duelyst:private-manifest -- --stage-count 64`, then `npm run duelyst:public-manifest` for a public Pages bundle.')
        return
      }

      const audit = normalizeDuelystAudit(payload, publicAssetPath)
      setDuelystAudit(audit)
      setDuelystStatus(`${audit.summary} Loaded from ${label}; staged entries are available in the picker and workstation.`)
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
      setDuelystStatus(`Duelyst manifest could not be loaded. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (!signal?.aborted) setDuelystBusy(false)
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

  if (manifestStatus === 'loading') {
    return <main className="loading">Indexing the character forge...</main>
  }

  if (manifestStatus === 'error') {
    return (
      <main className="loading">
        <section className="boot-panel" data-testid="manifest-load-error">
          <h1>Manifest load failed</h1>
          <p>The app could not load a usable character manifest, so the editor has not started.</p>
          <code>{manifestError}</code>
          <div className="status-strip">
            <button className="primary" onClick={() => void loadManifest(selectedId)}>Retry manifest load</button>
          </div>
          <p>In dev, the app checks `local character manifest` first and then falls back to `characters.json`. Reindex the asset pack or start the app from the correct project folder if the error persists.</p>
        </section>
      </main>
    )
  }

  if (!manifest || !selectedCharacter) {
    return (
      <main className="loading">
        <section className="boot-panel" data-testid="manifest-empty-state">
          <h1>No source characters available</h1>
          <p>The manifest loaded, but there are no usable source characters to display.</p>
          <div className="status-strip">
            <button className="primary" onClick={() => void loadManifest(selectedId)}>Reload manifest</button>
          </div>
        </section>
      </main>
    )
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
          <label htmlFor="source-pack">Source family</label>
          <select
            id="source-pack"
            data-testid="source-pack-filter"
            value={sourcePackFilter}
            onChange={(event) => {
              const nextPack = event.target.value as SourcePackFilter
              setSourcePackFilter(nextPack)
              if (nextPack === 'lpc') setRecipeMode('lpc_character')
              if (nextPack === 'duelyst') setRecipeMode('duelyst_review')
              if (nextPack === 'sprite') setRecipeMode('sprite_kitbash')
            }}
          >
            <option value="sprite">Sprite pack</option>
            <option value="duelyst">Duelyst</option>
            <option value="lpc">LPC</option>
          </select>
          <label htmlFor="character">Source character</label>
          <select
            id="character"
            value={selectedCharacter.character_id}
            onChange={(event) => {
              setSelectedId(event.target.value)
              setDirection('south')
              setFrameIndex(0)
            }}
          >
            {sourceCharacterOptions.map((character) => (
              <option key={character.character_id} value={character.character_id}>
                {character.display_name}
              </option>
            ))}
          </select>
          {sourceCharacterOptions.length === 0 ? <span>No sources in this pack yet.</span> : null}
        </section>

        {selectedCharacter.source_quality_warnings.length > 0 ? (
          <section className="sidebar-block stats stats-warning" aria-label="Source warnings">
            <span>{sourceCharacterOptions.length} sources</span>
            <span>{animationSourceCharacter?.animation_names.length ?? selectedCharacter.animation_names.length} actions</span>
            <span>{selectedCharacter.source_quality_warnings.length} warnings</span>
          </section>
        ) : null}
      </aside>

      <section className="workspace">
        <section className="screen-window" aria-label={`${screenLabel(screen)} window`}>
          <header className="topbar">
            <div>
              <p className="section-label">{screenLabel(screen)}</p>
              <h2>{selectedCharacter.display_name}</h2>
              {persistenceWarning ? <p className="topbar-warning" role="status">{persistenceWarning}</p> : null}
            </div>
            <div className="topbar-actions">
              <button onClick={createApesJob}>Prepare APES Job</button>
              <button className="primary" onClick={exportGeneric}>Export Manifest</button>
            </div>
          </header>

          <div className="main-grid">
            <section className="preview-panel">
              <div className="preview-stage-grid">
                <div className="preview-stage-main">
                  <div className="preview-character-stepper" aria-label="Character navigation">
                    <button
                      type="button"
                      className="preview-character-arrow"
                      aria-label="Previous character"
                      title="Previous character"
                      onClick={() => stepSourceCharacter(-1)}
                      disabled={sourceCharacterOptions.length <= 1}
                    >
                      ‹
                    </button>
                    <span>{selectedCharacter.display_name}</span>
                    <button
                      type="button"
                      className="preview-character-arrow"
                      aria-label="Next character"
                      title="Next character"
                      onClick={() => stepSourceCharacter(1)}
                      disabled={sourceCharacterOptions.length <= 1}
                    >
                      ›
                    </button>
                  </div>
                  <div className="preview-frame-stepper">
                    <button
                      type="button"
                      className="preview-frame-arrow"
                      aria-label="Previous frame"
                      title="Previous frame"
                      onClick={() => stepFrame(-1)}
                      disabled={frames.length <= 1}
                    >
                      ‹
                    </button>
                    <div className="preview-frame-canvas">
                      {recipe && screen !== 'workstation' ? (
                        <CompositeCanvas
                          recipe={recipe}
                          characters={characters}
                          partLibrary={partLibrary}
                          animation={animation}
                          direction={direction}
                          frameIndex={frameIndex}
                          lpcCatalog={lpcCatalog}
                          label={`${animation} ${direction} frame ${frameIndex + 1}`}
                        />
                      ) : (
                        <PixelCanvas
                          src={framePath}
                          sourceRect={frame?.source_rect}
                          onionSrc={screen === 'workstation' ? onionPath : undefined}
                          onionSourceRect={screen === 'workstation' ? onionFrame?.source_rect : undefined}
                          region={screen === 'workstation' ? regions[selectedRegion] : undefined}
                          seed={screen === 'workstation' ? connectedSeed : undefined}
                          onPixelClick={screen === 'workstation' ? setConnectedSeed : undefined}
                          label={`${animation} ${direction} frame ${frameIndex + 1}`}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      className="preview-frame-arrow"
                      aria-label="Next frame"
                      title="Next frame"
                      onClick={() => stepFrame(1)}
                      disabled={frames.length <= 1}
                    >
                      ›
                    </button>
                  </div>
                </div>
                <section className="preview-part-picker" aria-label="Preview part picker">
                  <strong>Part picker</strong>
                  <label className="field">
                    <span>Layer</span>
                    <select
                      data-testid="preview-live-layer"
                      value={selectedRegion}
                      onChange={(event) => setSelectedRegion(event.target.value as PartLabel)}
                    >
                      {layerOrder.map((label) => (
                        <option key={label} value={label}>{slugLabel(label)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Part</span>
                    <select
                      data-testid="preview-live-part"
                      value={previewPickerValue}
                      onChange={(event) => selectPreviewPart(event.target.value)}
                      disabled={previewLibraryPartOptions.length === 0 && previewLpcPartOptions.length === 0}
                    >
                      <option value="">{previewLibraryPartOptions.length === 0 && previewLpcPartOptions.length === 0 ? 'no parts for this layer' : 'use source character'}</option>
                      {previewLpcPartOptions.length > 0 ? (
                        <optgroup label="LPC sheet parts">
                          {previewLpcPartOptions.map((character) => (
                            <option key={character.character_id} value={`source:${character.character_id}`}>
                              {character.display_name} / {character.animation_names.slice(0, 4).join(', ')}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {previewLibraryPartOptions.length > 0 ? (
                        <optgroup label="Imported and extracted parts">
                          {previewLibraryPartOptions.map((part) => (
                            <option key={part.part_id} value={`library:${part.part_id}`}>
                              {part.reviewed ? 'reviewed' : 'needs review'} / {slugLabel(part.extraction_method)} / {part.part_id}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </label>
                  <span>{previewLibraryPartOptions.length + previewLpcPartOptions.length} part option(s) for {slugLabel(selectedRegion)}</span>
                </section>
              </div>
              <div className="transport">
                <button onClick={() => setPlaying((value) => !value)}>{playing ? 'Pause' : 'Play'}</button>
                <select aria-label="Animation" value={animation} onChange={(event) => setAnimation(event.target.value)}>
                  {animationSourceCharacter?.animation_names.map((name) => (
                    <option key={name} value={name}>
                      {slugLabel(name)}
                    </option>
                  ))}
                </select>
                <select aria-label="Direction" value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>
                  {availableDirections.map((name) => (
                    <option key={name} value={name}>
                      {directionLabel(name)}
                    </option>
                  ))}
                </select>
                <label className="field compact motion-source-field">
                  <span>Motion source</span>
                  <select
                    data-testid="animation-source"
                    aria-label="Motion source"
                    value={animationSourceCharacter?.character_id ?? selectedCharacter.character_id}
                    onChange={(event) => setAnimationSourceId(event.target.value === selectedCharacter.character_id ? '' : event.target.value)}
                    disabled={animationSourceOptions.length <= 1}
                  >
                    {animationSourceOptions.map((character) => (
                      <option key={character.character_id} value={character.character_id}>
                        {character.character_id === selectedCharacter.character_id ? 'current body' : character.display_name} / {character.animation_names.length} actions
                      </option>
                    ))}
                  </select>
                </label>
                <input aria-label="Frame index" type="range" min={0} max={Math.max(frames.length - 1, 0)} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} />
                {hasBorrowedAnimationSource ? (
                  <span className="motion-source-note">Motion source drives pose and frame count; selected parts still define the character look.</span>
                ) : null}
              </div>
            </section>
          {screen === 'fast' ? (
            <FastCreatorPanel
              selectedCharacter={selectedCharacter}
              animationSourceCharacter={animationSourceCharacter}
              characters={characters}
              selectedParts={selectedParts}
              setSelectedParts={setSelectedParts}
              selectedPartIds={selectedPartIds}
              setSelectedPartIds={setSelectedPartIds}
              layerSettings={layerSettings}
              updateLayerSetting={updateLayerSetting}
              partLibrary={partLibrary}
              activePartLabel={selectedRegion}
              setActivePartLabel={setSelectedRegion}
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
              mainDirections={availableDirections}
              recipeReadiness={recipeReadiness}
              exportTargetProfile={exportTargetProfile}
              setExportTargetProfile={setExportTargetProfile}
              openPartReview={openPartReview}
              openBatchGenerator={openBatchGenerator}
              openExports={openExports}
              openSettingsRepair={openSettingsRepair}
              createApesJob={createApesJob}
              localToolsAvailable={localToolsAvailable}
              recipeMode={recipeMode}
              setRecipeMode={setRecipeMode}
              lpcCatalog={lpcCatalog}
              lpcSelections={lpcSelections}
              setLpcSelections={setLpcSelections}
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
              recipe={recipe}
              characters={characters}
              selectedPartIds={selectedPartIds}
              setSelectedPartIds={setSelectedPartIds}
              activePartLabel={selectedRegion}
              setActivePartLabel={setSelectedRegion}
              currentAnimation={animation}
              currentDirection={direction}
              currentFrameIndex={frameIndex}
              importLayerBundleJson={importLayerBundleJson}
              partLibraryStatus={partLibraryStatus}
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
              variationPresets={variationPresets}
              activeVariationPresetId={activeVariationPresetId}
              setActiveVariationPresetId={setActiveVariationPresetId}
              saveVariationPreset={saveVariationPreset}
            />
          ) : null}
          {screen === 'audit' ? (
            <AssetAuditPanel
              manifest={manifest}
              classCounts={classCounts}
              duelystAudit={duelystAudit}
              duelystBusy={duelystBusy}
              duelystStatus={duelystStatus}
              lpcInventory={lpcInventory}
              lpcCatalog={lpcCatalog}
              lpcBusy={lpcBusy}
              lpcStatus={lpcStatus}
              runDuelystAudit={runDuelystAudit}
              runLpcInventory={runLpcInventory}
              runLpcCatalog={runLpcCatalog}
              loadPrivateDuelystManifest={() => loadPrivateDuelystManifest()}
              openDuelystStageCharacter={openDuelystStageCharacter}
              createDuelystApesJobs={createDuelystApesJobs}
              localToolsAvailable={localToolsAvailable}
              importLpcSheetsAsParts={importLpcSheetsAsParts}
              lpcImportStatus={lpcImportStatus}
            />
          ) : null}
          {screen === 'ai' ? (
            <AIStudioPanel
              selectedCharacter={selectedCharacter}
              recipe={recipe}
              ragIndex={ragIndex}
              ragStatus={ragStatus}
              providers={aiProviders}
              tools={toolConnections}
              messages={aiStudioMessages}
              setMessages={setAiStudioMessages}
              lpcPublished={Boolean(lpcInventory)}
              localToolsAvailable={localToolsAvailable}
              activitySnapshot={aiActivitySnapshot!}
              createApesJob={createApesJob}
              createGenerationJobsFromQueue={createGenerationJobsFromCurrentMissingQueue}
              createPixelLabGenerationJob={createPixelLabGenerationJob}
              importPixelLabGenerationOutputs={importPixelLabGenerationOutputs}
              downloadGenerationManifest={downloadGenerationManifest}
              openSettings={() => setScreen('settings')}
              openApesLab={() => setScreen('apes')}
              openExports={() => setScreen('exports')}
              openPanel={(panel) => setScreen(panel)}
              getAiSessionSecret={(providerId) => aiSecretVaultRef.current.get(providerId)}
              activateRag={activateRag}
            />
          ) : null}
          {screen === 'apes' ? (
            <ApesLabPanel
              jobs={apesJobs}
              aiProviderConfig={aiProviderConfig}
              generationJobs={generationJobs}
              ragStatus={ragStatus}
              ragIndex={ragIndex}
              exportTargetProfile={exportTargetProfile}
              trainingInboxDrafts={trainingInboxDrafts}
              trainingLibraryRecords={trainingLibraryRecords}
              createApesJob={createApesJob}
              createGenerationJobsFromQueue={createGenerationJobsFromQueue}
              downloadGenerationJobsHandoff={downloadGenerationJobsHandoff}
              createTrainingInboxDraft={createTrainingInboxDraft}
              approveTrainingInboxDraft={approveTrainingInboxDraft}
              runApesPreflight={runApesPreflight}
              runApesJob={runApesJob}
              runPreparedDuelystJobs={runPreparedDuelystJobs}
              summarizeApesOutputs={summarizeApesOutputs}
              prepareApesFinetuneData={prepareApesFinetuneData}
              prepareDuelystApesJobs={prepareDuelystApesJobs}
              importApesInventoryReport={importApesInventoryReport}
              generateApesQaHarness={generateApesQaHarness}
              loadApesQaHarnessReport={loadApesQaHarnessReport}
              clearApesQaHarnessParts={clearApesQaHarnessParts}
              selectedCharacter={selectedCharacter}
              recipe={recipe}
              lpcCatalog={lpcCatalog}
              partLibrary={partLibrary}
              apesAnimations={apesAnimations}
              apesDirections={apesDirections}
              apesLabels={apesLabels}
              apesFrameRange={apesFrameRange}
              setApesFrameRange={setApesFrameRange}
              toggleApesAnimation={toggleApesAnimation}
              toggleApesDirection={toggleApesDirection}
              toggleApesLabel={toggleApesLabel}
              importApesReport={importApesReportText}
              apesPythonPath={apesPythonPath}
              apesAllowPlaceholder={apesAllowPlaceholder}
              apesBridgeBusy={apesBridgeBusy}
              apesBridgeStatus={apesBridgeStatus}
              apesPreflight={apesPreflight}
              apesOutputInventory={apesOutputInventory}
              apesFinetuneManifest={apesFinetuneManifest}
              duelystApesJobBatch={duelystApesJobBatch}
              apesHarnessGeneratedAt={apesHarnessGeneratedAt}
              mainDirections={availableDirections}
              apesCoreLabels={apesCoreLabels}
              localToolsAvailable={localToolsAvailable}
              generationStyleNotes={generationStyleNotes}
              setGenerationStyleNotes={setGenerationStyleNotes}
              downloadGenerationManifest={downloadGenerationManifest}
            />
          ) : null}
          {screen === 'exports' ? (
            <ExportsPanel
              recipe={recipe}
              selectedCharacter={selectedCharacter}
              animationSourceCharacter={animationSourceCharacter}
              characters={characters}
              partLibrary={partLibrary}
              lpcCatalog={lpcCatalog}
              mainDirections={availableDirections}
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
              exportCreditsReport={exportCreditsReport}
              exportStatus={exportStatus}
              batchVariants={batchVariants}
              filenameTemplate={filenameTemplate}
              setFilenameTemplate={setFilenameTemplate}
              exportTargetProfile={exportTargetProfile}
              setExportTargetProfile={setExportTargetProfile}
              recipeReadiness={recipeReadiness}
              apesAllowPlaceholder={apesAllowPlaceholder}
              generationReleaseBlockCount={currentGenerationReleaseBlockers.length}
              generationReleaseBlockSummary={
                currentGenerationReleaseBlockers.length > 0
                  ? `Review ${currentGenerationReleaseBlockers.length} manual generation handoff job(s) for ${activeExportTargetProfile.label} before downloading release exports.`
                  : ''
              }
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
              downloadLocalSetupBundle={downloadLocalSetupBundle}
              runLocalAssetTool={runLocalAssetTool}
              apesPythonPath={apesPythonPath}
              setApesPythonPath={setApesPythonPath}
              apesAllowPlaceholder={apesAllowPlaceholder}
              setApesAllowPlaceholder={setApesAllowPlaceholder}
              apesPreflight={apesPreflight}
              localToolsAvailable={localToolsAvailable}
              aiProviders={aiProviders}
              setAiProviders={setAiProviders}
              toolConnections={toolConnections}
              setToolConnections={setToolConnections}
              sessionSecretStatus={sessionSecretStatus}
              sessionSecretMemoryCount={sessionSecretMemoryCount}
              setAiSessionSecret={setAiSessionSecret}
            />
          ) : null}
          </div>
        </section>
      </section>
      {tabTransition ? (
        <div key={tabTransition.key} className="tab-transition-overlay" aria-hidden="true">
          <div className="tab-transition-frame" style={{ backgroundImage: `url(${tabTransition.sheet})` }} />
        </div>
      ) : null}
    </main>
  )
}

function screenLabel(screen: Screen) {
  return screens.find((item) => item.id === screen)?.label ?? 'Creator'
}

function inferLpcBodyTypeForCharacter(character: CharacterManifest) {
  const bodyLabel = [character.display_name, String(character.labels?.lpc_path ?? '')].join(' ').toLowerCase()
  if (bodyLabel.includes('female') || bodyLabel.includes('feminine') || bodyLabel.includes('woman')) return 'female'
  if (bodyLabel.includes('muscular')) return 'muscular'
  if (bodyLabel.includes('pregnant')) return 'pregnant'
  if (bodyLabel.includes('teen')) return 'teen'
  if (bodyLabel.includes('child')) return 'child'
  return 'male'
}

export default App
