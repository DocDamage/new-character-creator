import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import './App.css'
import { CompositeCanvas } from './CompositeCanvas'
import { MaskEditor } from './MaskEditor'
import { PixelCanvas } from './PixelCanvas'
import { extractionModes, humanoid64Preset, layerOrder, palettePresets, partLabels } from './presets'
import type { AnimationName, ApesJob, ApesReport, AssetManifest, CharacterManifest, ComposerLayerSettings, Direction, ExtractedPart, ExtractionMethod, KitbashRecipe, PaletteRules, PartLabel, Rect } from './types'
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

type Screen = 'fast' | 'workstation' | 'library' | 'batch' | 'audit' | 'apes' | 'exports'
type BatchPart = {
  label: PartLabel
  source_character: string
  method: string
  source_part_id?: string
  reviewed?: boolean
}
type BatchVariant = { id: string; base: string; palette: string; parts: BatchPart[]; recipe: KitbashRecipe }
type PartReviewFilter = 'all' | 'reviewed' | 'needs_review'
type SavedComposerRecipe = {
  recipe_id: string
  name: string
  base_character: string
  selected_parts: Record<PartLabel, string>
  selected_part_ids: Partial<Record<PartLabel, string>>
  layer_settings: Partial<Record<PartLabel, ComposerLayerSettings>>
  palette: string
  palette_rules?: Omit<PaletteRules, 'team_color'>
  saved_at: string
}

const screens: Array<{ id: Screen; label: string }> = [
  { id: 'fast', label: 'Fast Creator' },
  { id: 'workstation', label: 'Art Workstation' },
  { id: 'library', label: 'Part Library' },
  { id: 'batch', label: 'Batch Generator' },
  { id: 'audit', label: 'Asset Audit' },
  { id: 'apes', label: 'APES Lab' },
  { id: 'exports', label: 'Exports' },
]

const mainDirections: Direction[] = ['south', 'east', 'north', 'west']
const apesCoreLabels: PartLabel[] = ['head', 'torso', 'front_arm', 'back_arm', 'front_leg', 'back_leg']
const partLibraryStorageKey = 'pixel_creator_part_library'
const composerRecipesStorageKey = 'pixel_creator_saved_recipes'
const defaultPaletteRules: Omit<PaletteRules, 'team_color'> = { hue_shift: 0, saturation: 100, brightness: 100 }

function loadStoredPartLibrary(): ExtractedPart[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(partLibraryStorageKey)
  if (!raw) return []

  try {
    return JSON.parse(raw) as ExtractedPart[]
  } catch {
    return []
  }
}

function loadStoredComposerRecipes(): SavedComposerRecipe[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(composerRecipesStorageKey)
  if (!raw) return []

  try {
    return JSON.parse(raw) as SavedComposerRecipe[]
  } catch {
    return []
  }
}

function makeDraftRecipeId(characterId = 'character') {
  return `generated_${characterId}_${Date.now()}`
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

  useEffect(() => {
    fetch('/data/manifests/characters.json')
      .then((response) => response.json())
      .then((data: AssetManifest) => {
        setManifest(data)
        setSelectedId(data.characters[0]?.character_id ?? '')
      })
      .catch((error) => {
        console.error('Failed to load manifest', error)
      })
  }, [])

  useEffect(() => {
    window.localStorage.setItem(partLibraryStorageKey, JSON.stringify(partLibrary))
  }, [partLibrary])

  useEffect(() => {
    window.localStorage.setItem(composerRecipesStorageKey, JSON.stringify(savedRecipes))
  }, [savedRecipes])

  const characters = manifest?.characters ?? []
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

  function markJobFailed(jobId: string) {
    setApesJobs((current) =>
      current.map((job) =>
        job.job_id === jobId
          ? {
              ...job,
              status: 'failed',
              failure_details: 'APES executable has not been connected yet. Run tools/apes_bridge/run_apes_extract.py after installing the APES backend.',
              logs: [...job.logs, 'Bridge call failed: missing APES backend executable.'],
            }
          : job,
      ),
    )
  }

  function markJobComplete(jobId: string) {
    const job = apesJobs.find((item) => item.job_id === jobId)
    if (job) {
      const apesParts = makeApesPartsFromJob(job)
      setPartLibrary((current) => [
        ...apesParts,
        ...current.filter((part) => !apesParts.some((apesPart) => apesPart.part_id === part.part_id)),
      ])
    }

    setApesJobs((current) =>
      current.map((job) =>
        job.job_id === jobId
          ? {
              ...job,
              status: 'complete',
              logs: [...job.logs, `Imported APES report and converted ${job.output_labels.length} masks into editable parts.`],
            }
          : job,
      ),
    )
  }

  function importApesReport(report: ApesReport) {
    const job = apesJobs.find((item) => item.job_id === report.job_id)
    const fallbackInput = job?.input_frames[0]
    const characterId = job?.character_id ?? selectedCharacter?.character_id ?? 'unknown_character'
    const animations = job?.animations ?? [fallbackInput?.animation ?? animation]
    const directions = job?.directions ?? [fallbackInput?.direction ?? direction]
    const importedParts = report.masks.map((mask, index): ExtractedPart => {
      const input = job?.input_frames.find((frame) => frame.animation === 'idle' && frame.direction === 'south') ?? fallbackInput
      const region = humanoid64Preset[mask.label]
      return {
        part_id: `${report.job_id}_${mask.label}_${String(index).padStart(3, '0')}`,
        character_id: characterId,
        label: mask.label,
        source_animation: input?.animation ?? animations[0] ?? 'idle',
        source_direction: input?.direction ?? directions[0] ?? 'south',
        source_frame_path: input?.path,
        image_path: `data/apes/output/${report.job_id}/parts/${mask.label}.png`,
        mask_path: mask.path,
        bounds: region,
        anchor: { x: region.x + Math.round(region.w / 2), y: region.y + Math.round(region.h / 2) },
        extraction_method: 'apes',
        compatibility: { animations, directions },
        tags: ['apes', 'report_import', mask.label, `confidence_${Math.round(mask.confidence * 100)}`],
        reviewed: mask.reviewed,
        warnings: [
          ...report.warnings,
          mask.confidence < 0.65 ? `Low APES confidence for ${mask.label}: ${mask.confidence}.` : '',
        ].filter(Boolean),
      }
    })

    setPartLibrary((current) => [
      ...importedParts,
      ...current.filter((part) => !importedParts.some((imported) => imported.part_id === part.part_id)),
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

  function saveEditedMask(partId: string, maskDataUrl: string) {
    setPartLibrary((current) =>
      current.map((part) =>
        part.part_id === partId
          ? {
              ...part,
              mask_data_url: maskDataUrl,
              reviewed: true,
              tags: Array.from(new Set([...part.tags, 'manual_cleanup'])),
              warnings: Array.from(new Set([...part.warnings, 'Mask reviewed in the manual cleanup workstation.'])),
            }
          : part,
      ),
    )
    setExtractionHistory((current) => [`${partId} mask saved and marked reviewed`, ...current].slice(0, 8))
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

  function makeApesPartsFromJob(job: ApesJob): ExtractedPart[] {
    const fallbackInput = job.input_frames[0]
    return job.output_labels.map((label) => {
      const input = job.input_frames.find((frame) => frame.animation === 'idle' && frame.direction === 'south') ?? fallbackInput
      const region = humanoid64Preset[label]
      return {
        part_id: `${job.job_id}_${label}`,
        character_id: job.character_id,
        label,
        source_animation: input?.animation ?? job.animations[0] ?? 'idle',
        source_direction: input?.direction ?? job.directions[0] ?? 'south',
        source_frame_path: input?.path,
        image_path: `${job.output_root}/parts/${label}.png`,
        mask_path: `${job.output_root}/masks/${label}_mask.png`,
        bounds: region,
        anchor: { x: region.x + Math.round(region.w / 2), y: region.y + Math.round(region.h / 2) },
        extraction_method: 'apes',
        compatibility: {
          animations: job.animations,
          directions: job.directions,
        },
        tags: ['apes', 'pose_aware', label, job.character_id],
        reviewed: false,
        warnings: [
          'Imported from APES report template. Review the mask in Art Workstation before production export.',
          `APES job ${job.job_id} source frames: ${job.input_frames.length}.`,
        ],
      }
    })
  }

  function exportGeneric() {
    if (!recipe || !selectedCharacter) return
    downloadJson(`${recipe.character_id}_manifest.json`, buildExportManifest(selectedCharacter, recipe, apesJobs))
  }

  function exportGodotScene() {
    if (!recipe) return
    const scene = `[gd_scene load_steps=2 format=3]\n\n[ext_resource type="SpriteFrames" path="res://${recipe.character_id}_sprite_frames.tres" id="1"]\n\n[node name="${recipe.character_id}" type="AnimatedSprite2D"]\nsprite_frames = ExtResource("1")\nanimation = "idle_south"\ncentered = true\n`
    downloadText(`${recipe.character_id}.tscn`, scene)
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
            <button key={item.id} className={screen === item.id ? 'active' : ''} onClick={() => setScreen(item.id)}>
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
          <span>{manifest.total_characters} characters</span>
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
              <select value={animation} onChange={(event) => setAnimation(event.target.value)}>
                {selectedCharacter.animation_names.map((name) => (
                  <option key={name} value={name}>
                    {slugLabel(name)}
                  </option>
                ))}
              </select>
              <select value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>
                {mainDirections.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <input type="range" min={0} max={Math.max(frames.length - 1, 0)} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} />
            </div>
          </section>

          {screen === 'fast' ? (
            <FastCreator
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
            />
          ) : null}
          {screen === 'workstation' ? (
            <Workstation
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
              saveEditedMask={saveEditedMask}
            />
          ) : null}
          {screen === 'library' ? (
            <PartLibrary
              parts={partLibrary}
              togglePartReviewed={togglePartReviewed}
              setPartsReviewed={setPartsReviewed}
              deletePart={deletePart}
              clearPartLibrary={clearPartLibrary}
              exportPartLibrary={exportPartLibrary}
            />
          ) : null}
          {screen === 'batch' ? (
            <BatchGenerator
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
          {screen === 'audit' ? <AssetAudit manifest={manifest} classCounts={classCounts} /> : null}
          {screen === 'apes' ? (
            <ApesLab
              jobs={apesJobs}
              createApesJob={createApesJob}
              markJobFailed={markJobFailed}
              markJobComplete={markJobComplete}
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
            />
          ) : null}
          {screen === 'exports' ? (
            <Exports
              recipe={recipe}
              selectedCharacter={selectedCharacter}
              characters={characters}
              partLibrary={partLibrary}
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
              batchVariants={batchVariants}
            />
          ) : null}
        </div>
      </section>
    </main>
  )
}

function FastCreator({
  selectedCharacter,
  characters,
  selectedParts,
  setSelectedParts,
  selectedPartIds,
  setSelectedPartIds,
  layerSettings,
  updateLayerSetting,
  partLibrary,
  recipeId,
  recipeName,
  setRecipeName,
  savedRecipes,
  saveCurrentRecipe,
  loadSavedRecipe,
  startNewRecipe,
  currentAnimation,
  currentDirection,
  currentFrameIndex,
  recipe,
  palette,
  setPalette,
  paletteRules,
  updatePaletteRules,
}: {
  selectedCharacter: CharacterManifest
  characters: CharacterManifest[]
  selectedParts: Record<PartLabel, string>
  setSelectedParts: Dispatch<SetStateAction<Record<PartLabel, string>>>
  selectedPartIds: Partial<Record<PartLabel, string>>
  setSelectedPartIds: Dispatch<SetStateAction<Partial<Record<PartLabel, string>>>>
  layerSettings: Partial<Record<PartLabel, ComposerLayerSettings>>
  updateLayerSetting: (label: PartLabel, patch: Partial<ComposerLayerSettings>) => void
  partLibrary: ExtractedPart[]
  recipeId: string
  recipeName: string
  setRecipeName: (name: string) => void
  savedRecipes: SavedComposerRecipe[]
  saveCurrentRecipe: () => void
  loadSavedRecipe: (recipeId: string) => void
  startNewRecipe: () => void
  currentAnimation: AnimationName
  currentDirection: Direction
  currentFrameIndex: number
  recipe: ReturnType<typeof makeRecipe> | null
  palette: string
  setPalette: (palette: string) => void
  paletteRules: Omit<PaletteRules, 'team_color'>
  updatePaletteRules: (patch: Partial<Omit<PaletteRules, 'team_color'>>) => void
}) {
  const reviewedParts = partLibrary.filter((part) => part.reviewed)
  const selectedReviewedParts = layerOrder
    .map((label) => reviewedParts.find((part) => part.part_id === selectedPartIds[label]))
    .filter(Boolean)

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div>
          <h3>Fast Creator</h3>
          <p>Swap semantic parts, keep animation compatibility visible, then export a recipe.</p>
        </div>
        <div className="topbar-actions">
          <button onClick={startNewRecipe}>New recipe</button>
          <button className="primary" onClick={saveCurrentRecipe}>Save recipe</button>
        </div>
      </div>
      <div className="recipe-controls">
        <label className="field">
          <span>Recipe name</span>
          <input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} />
        </label>
        <label className="field">
          <span>Load saved recipe</span>
          <select value="" onChange={(event) => loadSavedRecipe(event.target.value)} disabled={savedRecipes.length === 0}>
            <option value="">{savedRecipes.length === 0 ? 'no saved recipes' : 'choose recipe'}</option>
            {savedRecipes.map((savedRecipe) => (
              <option key={savedRecipe.recipe_id} value={savedRecipe.recipe_id}>
                {savedRecipe.name} / {savedRecipe.base_character}
              </option>
            ))}
          </select>
        </label>
        <span className="recipe-id">{recipeId}</span>
      </div>
      <DirectionPreviewGrid character={selectedCharacter} animation={currentAnimation} frameIndex={currentFrameIndex} />
      {recipe ? (
        <section className="composite-preview-panel">
          <div>
            <strong>Composite preview</strong>
            <span>{slugLabel(currentAnimation)} / {currentDirection} / frame {currentFrameIndex + 1}</span>
          </div>
          <CompositeCanvas
            recipe={recipe}
            characters={characters}
            partLibrary={partLibrary}
            animation={currentAnimation}
            direction={currentDirection}
            frameIndex={currentFrameIndex}
            scale={3}
            label={`composite ${currentAnimation} ${currentDirection} frame ${currentFrameIndex + 1}`}
          />
        </section>
      ) : null}
      <div className="part-grid">
        {layerOrder.map((label) => {
          const approvedOptions = reviewedParts.filter((part) => part.label === label)
          const settings = layerSettings[label] ?? { offset: [0, 0], visible: true, locked: false }
          return (
            <div key={label} className="composer-layer">
              <label className="field">
                <span>{slugLabel(label)} source</span>
                <select
                  value={selectedParts[label] ?? selectedCharacter.character_id}
                  onChange={(event) => setSelectedParts((current) => ({ ...current, [label]: event.target.value }))}
                >
                  {characters.map((character) => (
                    <option key={character.character_id} value={character.character_id}>
                      {character.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Approved part</span>
                <select
                  value={selectedPartIds[label] ?? ''}
                  onChange={(event) =>
                    setSelectedPartIds((current) => ({
                      ...current,
                      [label]: event.target.value || undefined,
                    }))
                  }
                  disabled={approvedOptions.length === 0}
                >
                  <option value="">{approvedOptions.length === 0 ? 'no reviewed parts' : 'use source character'}</option>
                  {approvedOptions.map((part) => (
                    <option key={part.part_id} value={part.part_id}>
                      {slugLabel(part.extraction_method)} / {part.character_id} / {part.part_id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="layer-controls">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.visible}
                    onChange={(event) => updateLayerSetting(label, { visible: event.target.checked })}
                  />
                  <span>Visible</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.locked}
                    onChange={(event) => updateLayerSetting(label, { locked: event.target.checked })}
                  />
                  <span>Locked</span>
                </label>
                <label>
                  <span>X</span>
                  <input
                    aria-label={`${slugLabel(label)} x offset`}
                    type="text"
                    inputMode="numeric"
                    value={settings.offset[0]}
                    onChange={(event) => updateLayerSetting(label, { offset: [clampOffsetInput(event.target.value), settings.offset[1]] })}
                  />
                </label>
                <label>
                  <span>Y</span>
                  <input
                    aria-label={`${slugLabel(label)} y offset`}
                    type="text"
                    inputMode="numeric"
                    value={settings.offset[1]}
                    onChange={(event) => updateLayerSetting(label, { offset: [settings.offset[0], clampOffsetInput(event.target.value)] })}
                  />
                </label>
              </div>
            </div>
          )
        })}
      </div>
      <div className="status-strip">
        <label className="field compact">
          <span>Team color</span>
          <select value={palette} onChange={(event) => setPalette(event.target.value)}>
            {palettePresets.map((name) => (
              <option key={name} value={name}>
                {slugLabel(name)}
              </option>
            ))}
          </select>
        </label>
        <label className="field compact slider-field">
          <span>Hue: {paletteRules.hue_shift}</span>
          <input
            type="text"
            inputMode="numeric"
            value={paletteRules.hue_shift}
            onChange={(event) => updatePaletteRules({ hue_shift: clampSignedInput(event.target.value, -180, 180) })}
          />
        </label>
        <label className="field compact slider-field">
          <span>Saturation: {paletteRules.saturation}%</span>
          <input
            type="text"
            inputMode="numeric"
            value={paletteRules.saturation}
            onChange={(event) => updatePaletteRules({ saturation: clampUnsignedInput(event.target.value, 0, 200) })}
          />
        </label>
        <label className="field compact slider-field">
          <span>Brightness: {paletteRules.brightness}%</span>
          <input
            type="text"
            inputMode="numeric"
            value={paletteRules.brightness}
            onChange={(event) => updatePaletteRules({ brightness: clampUnsignedInput(event.target.value, 0, 200) })}
          />
        </label>
        <span>Core limbs default to APES masks</span>
        <span>{reviewedParts.length} reviewed library parts available</span>
        <span>{selectedReviewedParts.length} approved parts selected in recipe</span>
        <span>{savedRecipes.length} saved recipe(s)</span>
      </div>
    </section>
  )
}

function DirectionPreviewGrid({
  character,
  animation,
  frameIndex,
}: {
  character: CharacterManifest
  animation: AnimationName
  frameIndex: number
}) {
  return (
    <section className="direction-preview" aria-label="All direction preview">
      <div>
        <strong>All-direction preview</strong>
        <span>{slugLabel(animation)} frame {frameIndex + 1}</span>
      </div>
      <div className="direction-preview-grid">
        {mainDirections.map((direction) => (
          <PixelCanvas
            key={direction}
            src={getFramePath(character, animation, direction, frameIndex)}
            scale={2}
            label={direction}
          />
        ))}
      </div>
    </section>
  )
}

function Workstation({
  selectedRegion,
  setSelectedRegion,
  regions,
  updateRegion,
  extractionMethod,
  setExtractionMethod,
  extractCurrentRegion,
  extractionHistory,
  connectedSeed,
  setConnectedSeed,
  parts,
  saveEditedMask,
}: {
  selectedRegion: PartLabel
  setSelectedRegion: (label: PartLabel) => void
  regions: Record<PartLabel, Rect>
  updateRegion: (key: keyof Rect, value: number) => void
  extractionMethod: ExtractionMethod
  setExtractionMethod: (method: ExtractionMethod) => void
  extractCurrentRegion: () => void
  extractionHistory: string[]
  connectedSeed?: { x: number; y: number }
  setConnectedSeed: (seed: { x: number; y: number } | undefined) => void
  parts: ExtractedPart[]
  saveEditedMask: (partId: string, maskDataUrl: string) => void
}) {
  const region = regions[selectedRegion]
  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <h3>Art Workstation</h3>
        <p>Compare APES, preset, connected-pixel, and manual masks on the same 64x64 source frame.</p>
      </div>
      <div className="workstation-grid">
        <div className="tool-bank">
          {extractionModes.map((mode) => (
            <button key={mode.id} className={extractionMethod === mode.id ? 'active' : ''} onClick={() => setExtractionMethod(mode.id)}>
              <strong>{mode.name}</strong>
              <span>{mode.description}</span>
            </button>
          ))}
        </div>
        <div className="region-editor">
          <label className="field">
            <span>Region</span>
            <select value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value as PartLabel)}>
              {partLabels.map((label) => (
                <option key={label} value={label}>
                  {slugLabel(label)}
                </option>
              ))}
            </select>
          </label>
          {(['x', 'y', 'w', 'h'] as Array<keyof Rect>).map((key) => (
            <label key={key} className="field slider-field">
              <span>{key.toUpperCase()}: {region[key]}</span>
              <input min={0} max={64} type="range" value={region[key]} onChange={(event) => updateRegion(key, Number(event.target.value))} />
            </label>
          ))}
        </div>
        <div className="tool-list">
          {['Pencil', 'Eraser', 'Fill', 'Lasso', 'Magic wand', 'Grow', 'Shrink', 'Mirror', 'Nudge', 'Copy to next frame', 'Mark reviewed'].map((tool) => (
            <button key={tool}>{tool}</button>
          ))}
          <button className="primary" onClick={extractCurrentRegion}>Extract PNG + mask</button>
          <div className="seed-panel">
            <strong>Connected seed</strong>
            <span>{connectedSeed ? `x ${connectedSeed.x}, y ${connectedSeed.y}` : 'Click the canvas in connected-pixel mode.'}</span>
            <button onClick={() => setConnectedSeed(undefined)}>Clear seed</button>
          </div>
          <div className="history-list">
            {extractionHistory.map((item) => (
              <span key={item}>{item}</span>
            ))}
            {extractionHistory.length === 0 ? <span>No local extractions yet.</span> : null}
          </div>
        </div>
        <MaskEditor parts={parts} selectedRegion={selectedRegion} onSaveMask={saveEditedMask} />
      </div>
    </section>
  )
}

function PartLibrary({
  parts,
  togglePartReviewed,
  setPartsReviewed,
  deletePart,
  clearPartLibrary,
  exportPartLibrary,
}: {
  parts: ExtractedPart[]
  togglePartReviewed: (partId: string) => void
  setPartsReviewed: (partIds: string[], reviewed: boolean) => void
  deletePart: (partId: string) => void
  clearPartLibrary: () => void
  exportPartLibrary: () => void
}) {
  const [methodFilter, setMethodFilter] = useState<ExtractionMethod | 'all'>('all')
  const [labelFilter, setLabelFilter] = useState<PartLabel | 'all'>('all')
  const [reviewFilter, setReviewFilter] = useState<PartReviewFilter>('all')
  const [query, setQuery] = useState('')
  const reviewedCount = parts.filter((part) => part.reviewed).length
  const byMethod = parts.reduce<Record<string, number>>((acc, part) => {
    acc[part.extraction_method] = (acc[part.extraction_method] ?? 0) + 1
    return acc
  }, {})
  const normalizedQuery = query.trim().toLowerCase()
  const filteredParts = parts.filter((part) => {
    const matchesMethod = methodFilter === 'all' || part.extraction_method === methodFilter
    const matchesLabel = labelFilter === 'all' || part.label === labelFilter
    const matchesReview =
      reviewFilter === 'all' || (reviewFilter === 'reviewed' ? part.reviewed : !part.reviewed)
    const searchable = [part.part_id, part.character_id, part.label, part.extraction_method, ...part.tags].join(' ').toLowerCase()
    return matchesMethod && matchesLabel && matchesReview && (!normalizedQuery || searchable.includes(normalizedQuery))
  })
  const filteredIds = filteredParts.map((part) => part.part_id)

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div>
          <h3>Part Library</h3>
          <p>Reusable extraction records from APES, presets, connected-pixel selections, and manual cleanup.</p>
        </div>
        <div className="topbar-actions">
          <button onClick={exportPartLibrary}>Export library JSON</button>
          <button onClick={clearPartLibrary}>Clear library</button>
        </div>
      </div>

      <div className="validation-grid">
        <article className="pass">
          <strong>{parts.length}</strong>
          <span>total parts</span>
        </article>
        <article className={reviewedCount === parts.length && parts.length > 0 ? 'pass' : 'warn'}>
          <strong>{reviewedCount}</strong>
          <span>reviewed</span>
        </article>
        {Object.entries(byMethod).map(([method, count]) => (
          <article key={method} className="pass">
            <strong>{count}</strong>
            <span>{slugLabel(method)}</span>
          </article>
        ))}
        <article className={filteredParts.length > 0 ? 'pass' : 'warn'}>
          <strong>{filteredParts.length}</strong>
          <span>visible results</span>
        </article>
      </div>

      <div className="library-filters">
        <label className="field">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="part id, tag, character" />
        </label>
        <label className="field">
          <span>Method</span>
          <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as ExtractionMethod | 'all')}>
            <option value="all">all methods</option>
            <option value="apes">APES</option>
            <option value="preset_region">preset regions</option>
            <option value="connected_pixel">connected pixels</option>
            <option value="manual">manual cleanup</option>
          </select>
        </label>
        <label className="field">
          <span>Label</span>
          <select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value as PartLabel | 'all')}>
            <option value="all">all labels</option>
            {partLabels.map((label) => (
              <option key={label} value={label}>
                {slugLabel(label)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Review</span>
          <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as PartReviewFilter)}>
            <option value="all">all review states</option>
            <option value="needs_review">needs review</option>
            <option value="reviewed">reviewed</option>
          </select>
        </label>
      </div>

      <div className="status-strip">
        <button onClick={() => setPartsReviewed(filteredIds, true)} disabled={filteredParts.length === 0}>Mark visible reviewed</button>
        <button onClick={() => setPartsReviewed(filteredIds, false)} disabled={filteredParts.length === 0}>Mark visible unreviewed</button>
        <button
          onClick={() =>
            downloadJson('pixel_creator_filtered_parts.json', {
              exported_at: new Date().toISOString(),
              filters: { methodFilter, labelFilter, reviewFilter, query },
              part_count: filteredParts.length,
              parts: filteredParts,
            })
          }
          disabled={filteredParts.length === 0}
        >
          Export visible JSON
        </button>
      </div>

      <div className="part-library-list">
        {filteredParts.map((part) => (
          <article key={part.part_id} className={part.reviewed ? 'reviewed' : ''}>
            <div>
              <strong>{part.label}</strong>
              <span>{part.part_id}</span>
            </div>
            <div className="part-meta">
              <span>{part.character_id}</span>
              <span>{slugLabel(part.extraction_method)}</span>
              <span>{part.source_animation} / {part.source_direction}</span>
              <span>{part.bounds.w}x{part.bounds.h} at {part.bounds.x},{part.bounds.y}</span>
            </div>
            <div className="part-meta">
              {part.tags.map((tag) => (
                <span key={tag}>{slugLabel(tag)}</span>
              ))}
            </div>
            {part.warnings.length > 0 ? (
              <p>{part.warnings.join(' ')}</p>
            ) : null}
            <div className="job-actions">
              <button onClick={() => togglePartReviewed(part.part_id)}>{part.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}</button>
              <button onClick={() => downloadJson(`${part.part_id}.json`, part)}>Download metadata</button>
              <button onClick={() => deletePart(part.part_id)}>Delete</button>
            </div>
          </article>
        ))}
        {parts.length === 0 ? <p className="empty">No parts in the library yet. Extract a region or connected cluster from the Art Workstation.</p> : null}
        {parts.length > 0 && filteredParts.length === 0 ? <p className="empty">No parts match the current filters.</p> : null}
      </div>
    </section>
  )
}

function BatchGenerator({
  batchSeed,
  setBatchSeed,
  batchCount,
  setBatchCount,
  batchVariants,
  characters,
  partLibrary,
  currentAnimation,
  currentDirection,
  currentFrameIndex,
}: {
  batchSeed: string
  setBatchSeed: (seed: string) => void
  batchCount: number
  setBatchCount: (count: number) => void
  batchVariants: BatchVariant[]
  characters: CharacterManifest[]
  partLibrary: ExtractedPart[]
  currentAnimation: AnimationName
  currentDirection: Direction
  currentFrameIndex: number
}) {
  const reviewedParts = partLibrary.filter((part) => part.reviewed)
  const reviewedApesParts = reviewedParts.filter((part) => part.extraction_method === 'apes')
  const libraryBackedPartCount = batchVariants.reduce(
    (total, variant) => total + variant.parts.filter((part) => part.source_part_id).length,
    0,
  )

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <h3>Batch Generator</h3>
        <p>Deterministic variants from APES-approved limbs, preset regions, connected masks, palettes, and tags.</p>
      </div>
      <div className="batch-controls">
        <label className="field">
          <span>Seed</span>
          <input value={batchSeed} onChange={(event) => setBatchSeed(event.target.value)} />
        </label>
        <label className="field">
          <span>Export count</span>
          <input min={1} max={32} type="number" value={batchCount} onChange={(event) => setBatchCount(Number(event.target.value))} />
        </label>
      </div>
      <div className="validation-grid">
        <article className={reviewedApesParts.length > 0 ? 'pass' : 'warn'}>
          <strong>{reviewedApesParts.length}</strong>
          <span>reviewed APES parts</span>
        </article>
        <article className={reviewedParts.length > 0 ? 'pass' : 'warn'}>
          <strong>{reviewedParts.length}</strong>
          <span>approved library pool</span>
        </article>
        <article className={libraryBackedPartCount > 0 ? 'pass' : 'warn'}>
          <strong>{libraryBackedPartCount}</strong>
          <span>library picks in queue</span>
        </article>
      </div>
      <div className="status-strip">
        <button
          onClick={() =>
            downloadJson('pixel_creator_batch_package_manifest.json', {
              exported_at: new Date().toISOString(),
              seed: batchSeed,
              count: batchVariants.length,
              variants: batchVariants.map((variant) => ({
                id: variant.id,
                base: variant.base,
                palette: variant.palette,
                recipe: variant.recipe,
                validation: {
                  has_library_parts: variant.parts.some((part) => part.source_part_id),
                  apes_part_count: variant.parts.filter((part) => part.method === 'apes').length,
                  deterministic_seed: batchSeed,
                },
              })),
            })
          }
          disabled={batchVariants.length === 0}
        >
          Download batch package manifest
        </button>
      </div>
      <div className="variant-list">
        {batchVariants.map((variant) => (
          <article key={variant.id}>
            <strong>{variant.id}</strong>
            <span>{variant.base}</span>
            <span>{slugLabel(variant.palette)}</span>
            <CompositeCanvas
              recipe={variant.recipe}
              characters={characters}
              partLibrary={partLibrary}
              animation={currentAnimation}
              direction={currentDirection}
              frameIndex={currentFrameIndex}
              scale={2}
              label={variant.id}
            />
            <small>
              {variant.parts.filter((part) => part.method === 'apes').length} APES parts / {variant.parts.filter((part) => part.source_part_id).length} approved picks
            </small>
          </article>
        ))}
      </div>
    </section>
  )
}

function AssetAudit({ manifest, classCounts }: { manifest: AssetManifest; classCounts: Record<string, number> }) {
  const warnings = manifest.characters.flatMap((character) => character.source_quality_warnings.map((warning) => ({ character: character.character_id, warning })))
  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <h3>Asset Audit</h3>
        <p>Canonical manifest generated from the real source folder. Original assets stay read-only.</p>
      </div>
      <div className="audit-grid">
        {Object.entries(classCounts).map(([name, count]) => (
          <article key={name}>
            <strong>{count}</strong>
            <span>{slugLabel(name)}</span>
          </article>
        ))}
      </div>
      <div className="warning-list">
        {warnings.slice(0, 16).map((item) => (
          <p key={`${item.character}-${item.warning}`}>
            <strong>{item.character}</strong> {item.warning}
          </p>
        ))}
        {warnings.length === 0 ? <p>No source warnings found.</p> : null}
      </div>
    </section>
  )
}

function ApesLab({
  jobs,
  createApesJob,
  markJobFailed,
  markJobComplete,
  selectedCharacter,
  partLibrary,
  apesAnimations,
  apesDirections,
  apesLabels,
  apesFrameRange,
  setApesFrameRange,
  toggleApesAnimation,
  toggleApesDirection,
  toggleApesLabel,
  importApesReport,
}: {
  jobs: ApesJob[]
  createApesJob: () => void
  markJobFailed: (jobId: string) => void
  markJobComplete: (jobId: string) => void
  selectedCharacter: CharacterManifest
  partLibrary: ExtractedPart[]
  apesAnimations: AnimationName[]
  apesDirections: Direction[]
  apesLabels: PartLabel[]
  apesFrameRange: [number, number]
  setApesFrameRange: (range: [number, number]) => void
  toggleApesAnimation: (name: AnimationName) => void
  toggleApesDirection: (name: Direction) => void
  toggleApesLabel: (name: PartLabel) => void
  importApesReport: (report: ApesReport) => void
}) {
  const apesParts = partLibrary.filter((part) => part.extraction_method === 'apes')
  const reviewedApesParts = apesParts.filter((part) => part.reviewed)
  const expectedInputCount = apesAnimations.reduce(
    (total, animation) =>
      total +
      apesDirections.reduce((directionTotal, direction) => {
        const [start, end] = apesFrameRange[0] <= apesFrameRange[1] ? apesFrameRange : [apesFrameRange[1], apesFrameRange[0]]
        return directionTotal + getFrames(selectedCharacter, animation, direction).filter((frame) => frame.index >= start && frame.index <= end).length
      }, 0),
    0,
  )

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <h3>APES Lab</h3>
        <p>APES is a first-class extraction workflow: create jobs, review logs, import masks, and convert outputs into editable parts.</p>
      </div>
      <div className="apes-summary">
        <article>
          <strong>Input</strong>
          <span>{selectedCharacter.character_id} / {apesAnimations.length} animation(s) / {apesDirections.length} direction(s)</span>
        </article>
        <article>
          <strong>Outputs</strong>
          <span>{apesLabels.map(slugLabel).join(', ') || 'select labels'}</span>
        </article>
        <article>
          <strong>Storage</strong>
          <span>data/apes/input and data/apes/output</span>
        </article>
        <article>
          <strong>Readiness</strong>
          <span>{selectedCharacter.source_quality_warnings.length === 0 ? 'source frames clean' : `${selectedCharacter.source_quality_warnings.length} source warning(s)`}</span>
        </article>
        <article>
          <strong>Library</strong>
          <span>{apesParts.length} APES part(s), {reviewedApesParts.length} reviewed</span>
        </article>
        <article>
          <strong>Job size</strong>
          <span>{expectedInputCount} frame reference(s), range {apesFrameRange[0]}-{apesFrameRange[1]}</span>
        </article>
      </div>

      <div className="apes-config">
        <fieldset>
          <legend>Animations</legend>
          {selectedCharacter.animation_names.map((name) => (
            <label key={name}>
              <input type="checkbox" checked={apesAnimations.includes(name)} onChange={() => toggleApesAnimation(name)} />
              <span>{slugLabel(name)}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Directions</legend>
          {mainDirections.map((name) => (
            <label key={name}>
              <input type="checkbox" checked={apesDirections.includes(name)} onChange={() => toggleApesDirection(name)} />
              <span>{name}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>APES labels</legend>
          {apesCoreLabels.map((name) => (
            <label key={name}>
              <input type="checkbox" checked={apesLabels.includes(name)} onChange={() => toggleApesLabel(name)} />
              <span>{slugLabel(name)}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Frame range</legend>
          <label>
            <span>Start</span>
            <input
              type="text"
              inputMode="numeric"
              value={apesFrameRange[0]}
              onChange={(event) => setApesFrameRange([clampFrameInput(event.target.value), apesFrameRange[1]])}
            />
          </label>
          <label>
            <span>End</span>
            <input
              type="text"
              inputMode="numeric"
              value={apesFrameRange[1]}
              onChange={(event) => setApesFrameRange([apesFrameRange[0], clampFrameInput(event.target.value)])}
            />
          </label>
        </fieldset>
      </div>
      <div className="status-strip">
        <button className="primary" onClick={createApesJob}>Create APES job</button>
        <label className="file-import">
          <span>Import APES report JSON</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              file
                .text()
                .then((text) => importApesReport(JSON.parse(text) as ApesReport))
                .catch((error) => {
                  window.alert(`Could not import APES report: ${error instanceof Error ? error.message : String(error)}`)
                })
              event.currentTarget.value = ''
            }}
          />
        </label>
      </div>
      <div className="job-list">
        {jobs.map((job) => (
          <article key={job.job_id} className={`job ${job.status}`}>
            <div>
              <strong>{job.job_id}</strong>
              <span>{job.status}</span>
            </div>
            <p>{job.animations.join(', ')} across {job.directions.join(', ')}</p>
            <p>{job.input_frames.length} input frame references prepared for APES.</p>
            {job.failure_details ? <p className="error-text">{job.failure_details}</p> : null}
            <div className="job-actions">
              <button onClick={() => downloadJson(`${job.job_id}.json`, job)}>Download job config</button>
              <button
                onClick={() =>
                  downloadJson(`${job.job_id}_expected_report.json`, {
                    job_id: job.job_id,
                    status: 'complete',
                    masks: job.output_labels.map((label) => ({
                      label,
                      path: `data/apes/output/${job.job_id}/masks/${label}_mask.png`,
                      confidence: 0,
                      reviewed: false,
                    })),
                    semantic_mapping: {
                      head: 'head',
                      torso: 'torso',
                      left_arm: 'front_arm',
                      right_arm: 'back_arm',
                      left_leg: 'front_leg',
                      right_leg: 'back_leg',
                    },
                    warnings: ['Masks must be reviewed in the Art Workstation before final export.'],
                  })
                }
              >
                Download report template
              </button>
              <button onClick={() => markJobFailed(job.job_id)}>Simulate bridge error</button>
              <button onClick={() => markJobComplete(job.job_id)}>Import report to library</button>
            </div>
            {job.status === 'complete' ? (
              <p>{job.output_labels.length} APES mask records are now available in the Part Library for review.</p>
            ) : null}
          </article>
        ))}
        {jobs.length === 0 ? <p className="empty">No APES jobs yet. Create one from this screen or the top bar.</p> : null}
      </div>
    </section>
  )
}

function Exports({
  recipe,
  selectedCharacter,
  characters,
  partLibrary,
  currentAnimation,
  currentDirection,
  currentFrameIndex,
  exportGeneric,
  exportGodotScene,
  exportSpriteFrames,
  exportUnityMetadata,
  exportRpgMakerMetadata,
  exportAsepriteReference,
  exportCurrentSpriteSheet,
  exportAnimationSheets,
  batchVariants,
}: {
  recipe: ReturnType<typeof makeRecipe> | null
  selectedCharacter: CharacterManifest
  characters: CharacterManifest[]
  partLibrary: ExtractedPart[]
  currentAnimation: AnimationName
  currentDirection: Direction
  currentFrameIndex: number
  exportGeneric: () => void
  exportGodotScene: () => void
  exportSpriteFrames: () => void
  exportUnityMetadata: () => void
  exportRpgMakerMetadata: () => void
  exportAsepriteReference: () => void
  exportCurrentSpriteSheet: () => void
  exportAnimationSheets: () => void
  batchVariants: BatchVariant[]
}) {
  const directionCoverage = selectedCharacter.animation_names.flatMap((name) =>
    mainDirections.map((item) => getFrames(selectedCharacter, name, item).length > 0),
  )
  const validation = [
    { label: 'Manifest', value: selectedCharacter.animation_names.length > 0 ? 'pass' : 'reject' },
    { label: '4-direction frames', value: directionCoverage.every(Boolean) ? 'pass' : 'needs cleanup' },
    { label: 'APES provenance', value: recipe?.layers.some((layer) => layer.extraction_method === 'apes') ? 'pass' : 'needs APES' },
    { label: 'Godot target', value: recipe?.export_targets.includes('godot_4') ? 'pass' : 'defer' },
  ]
  const frameSummary = selectedCharacter.animation_names.flatMap((name) =>
    mainDirections.map((item) => ({
      label: `${slugLabel(name)} ${item}`,
      count: getFrames(selectedCharacter, name, item).length,
    })),
  )

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <h3>Export System</h3>
        <p>Game-ready outputs with extraction provenance, APES metadata, generic JSON, and Godot 4 resources.</p>
      </div>
      <div className="validation-grid">
        {validation.map((item) => (
          <article key={item.label} className={item.value === 'pass' ? 'pass' : 'warn'}>
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </article>
        ))}
      </div>
      <div className="export-grid">
        <button className="primary" onClick={exportGeneric}>Download generic manifest</button>
        <button onClick={exportCurrentSpriteSheet}>Download current spritesheet</button>
        <button onClick={exportAnimationSheets}>Download current action sheets</button>
        <button onClick={exportGodotScene}>Download Godot scene</button>
        <button onClick={() => downloadJson(`${selectedCharacter.character_id}_batch_queue.json`, batchVariants)}>Download batch queue</button>
        <button onClick={exportSpriteFrames}>Download SpriteFrames resource</button>
        <button onClick={exportUnityMetadata}>Download Unity 2D metadata</button>
        <button onClick={exportRpgMakerMetadata}>Download RPG Maker MZ metadata</button>
        <button onClick={exportAsepriteReference}>Download Aseprite reference</button>
      </div>
      <DirectionPreviewGrid character={selectedCharacter} animation={currentAnimation} frameIndex={currentFrameIndex} />
      {recipe ? (
        <section className="composite-preview-panel">
          <div>
            <strong>Composite export preview</strong>
            <span>{slugLabel(currentAnimation)} / {currentDirection} / frame {currentFrameIndex + 1}</span>
          </div>
          <CompositeCanvas
            recipe={recipe}
            characters={characters}
            partLibrary={partLibrary}
            animation={currentAnimation}
            direction={currentDirection}
            frameIndex={currentFrameIndex}
            scale={3}
            label={`composite ${currentAnimation} ${currentDirection} frame ${currentFrameIndex + 1}`}
          />
        </section>
      ) : null}
      <div className="frame-summary">
        <strong>Current sheet</strong>
        <span>{slugLabel(currentAnimation)} / {currentDirection} / {getFrames(selectedCharacter, currentAnimation, currentDirection).length} frames</span>
        {frameSummary.map((item) => (
          <span key={item.label}>{item.label}: {item.count}</span>
        ))}
      </div>
      <pre className="recipe-preview">{JSON.stringify(recipe, null, 2)}</pre>
    </section>
  )
}

function screenLabel(screen: Screen) {
  return screens.find((item) => item.id === screen)?.label ?? 'Creator'
}

function clampFrameInput(value: string) {
  const parsed = Number(value.replace(/[^0-9]/g, ''))
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(31, parsed))
}

function clampOffsetInput(value: string) {
  const parsed = Number(value.replace(/(?!^-)[^0-9]/g, ''))
  if (!Number.isFinite(parsed)) return 0
  return Math.max(-32, Math.min(32, parsed))
}

function clampSignedInput(value: string, min: number, max: number) {
  const parsed = Number(value.replace(/(?!^-)[^0-9]/g, ''))
  if (!Number.isFinite(parsed)) return 0
  return Math.max(min, Math.min(max, parsed))
}

function clampUnsignedInput(value: string, min: number, max: number) {
  const parsed = Number(value.replace(/[^0-9]/g, ''))
  if (!Number.isFinite(parsed)) return min
  return Math.max(min, Math.min(max, parsed))
}

export default App
