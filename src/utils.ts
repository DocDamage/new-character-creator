import type { AnimationName, ApesJob, CharacterManifest, ComposerLayerSettings, Direction, ExtractedPart, KitbashRecipe, PaletteRules, PartLabel, Rect } from './types'
import { layerOrder, palettePresets } from './presets'
import { resolveCompatiblePartSelection } from './lpcPartCompatibility'

export function getFrameRef(
  character: CharacterManifest | undefined,
  animation: AnimationName,
  direction: Direction,
  frameIndex: number,
) {
  const frames = getFrames(character, animation, direction)
  return frames.length > 0 ? frames[frameIndex % frames.length] : undefined
}

export function getFrames(character: CharacterManifest | undefined, animation: AnimationName, direction: Direction) {
  if (!character) return []
  const animationSet = character.animations.find((item) => item.name === animation)
  return animationSet?.directions[direction] ?? []
}

export function getFramePath(
  character: CharacterManifest | undefined,
  animation: AnimationName,
  direction: Direction,
  frameIndex: number,
) {
  return getFrameRef(character, animation, direction, frameIndex)?.path ?? character?.representative_frame ?? ''
}

export function slugLabel(value: string) {
  return value.replaceAll('_', ' ').replaceAll('-', ' ')
}

export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  downloadBlob(filename, blob)
}

export function downloadText(filename: string, payload: string, type = 'text/plain') {
  const blob = new Blob([payload], { type })
  downloadBlob(filename, blob)
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadCroppedPng(filename: string, src: string, region: Rect) {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = region.w
  canvas.height = region.h
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, region.w, region.h)
  context.drawImage(image, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h)
  const imageDataUrl = await downloadCanvas(canvas, filename)
  return {
    image_path: filename,
    image_data_url: imageDataUrl,
  }
}

export async function downloadRegionMask(filename: string, region: Rect) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')
  context.clearRect(0, 0, 64, 64)
  context.fillStyle = '#fff'
  context.fillRect(region.x, region.y, region.w, region.h)
  const maskDataUrl = await downloadCanvas(canvas, filename)
  return {
    mask_path: filename,
    mask_data_url: maskDataUrl,
  }
}

export async function downloadConnectedPixelPart(
  baseName: string,
  src: string,
  seed: { x: number; y: number },
  alphaThreshold = 8,
) {
  const image = await loadImage(src)
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = 64
  sourceCanvas.height = 64
  const sourceContext = sourceCanvas.getContext('2d')
  if (!sourceContext) throw new Error('Canvas is unavailable.')
  sourceContext.imageSmoothingEnabled = false
  sourceContext.clearRect(0, 0, 64, 64)
  sourceContext.drawImage(image, 0, 0, 64, 64)

  const imageData = sourceContext.getImageData(0, 0, 64, 64)
  const component = floodAlphaComponent(imageData, seed, alphaThreshold)
  if (component.pixels.length === 0) {
    throw new Error('The selected pixel is transparent; choose an opaque pixel.')
  }

  const partCanvas = document.createElement('canvas')
  partCanvas.width = component.bounds.w
  partCanvas.height = component.bounds.h
  const partContext = partCanvas.getContext('2d')
  if (!partContext) throw new Error('Canvas is unavailable.')
  const partImageData = partContext.createImageData(component.bounds.w, component.bounds.h)

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = 64
  maskCanvas.height = 64
  const maskContext = maskCanvas.getContext('2d')
  if (!maskContext) throw new Error('Canvas is unavailable.')
  const maskData = maskContext.createImageData(64, 64)

  for (const pixel of component.pixels) {
    const sourceOffset = (pixel.y * 64 + pixel.x) * 4
    const localX = pixel.x - component.bounds.x
    const localY = pixel.y - component.bounds.y
    const partOffset = (localY * component.bounds.w + localX) * 4
    partImageData.data[partOffset] = imageData.data[sourceOffset]
    partImageData.data[partOffset + 1] = imageData.data[sourceOffset + 1]
    partImageData.data[partOffset + 2] = imageData.data[sourceOffset + 2]
    partImageData.data[partOffset + 3] = imageData.data[sourceOffset + 3]

    maskData.data[sourceOffset] = 255
    maskData.data[sourceOffset + 1] = 255
    maskData.data[sourceOffset + 2] = 255
    maskData.data[sourceOffset + 3] = 255
  }

  partContext.putImageData(partImageData, 0, 0)
  maskContext.putImageData(maskData, 0, 0)

  const imageDataUrl = await downloadCanvas(partCanvas, `${baseName}.png`)
  const maskDataUrl = await downloadCanvas(maskCanvas, `${baseName}_mask.png`)

  return {
    bounds: component.bounds,
    pixel_count: component.pixels.length,
    seed,
    image_path: `${baseName}.png`,
    mask_path: `${baseName}_mask.png`,
    image_data_url: imageDataUrl,
    mask_data_url: maskDataUrl,
  }
}

function floodAlphaComponent(imageData: ImageData, seed: { x: number; y: number }, alphaThreshold: number) {
  const width = 64
  const height = 64
  const startOffset = (seed.y * width + seed.x) * 4
  if (imageData.data[startOffset + 3] <= alphaThreshold) {
    return { pixels: [], bounds: { x: seed.x, y: seed.y, w: 0, h: 0 } }
  }

  const visited = new Uint8Array(width * height)
  const stack = [seed]
  const pixels: Array<{ x: number; y: number }> = []
  let minX = seed.x
  let minY = seed.y
  let maxX = seed.x
  let maxY = seed.y

  while (stack.length > 0) {
    const point = stack.pop()
    if (!point) break
    if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) continue
    const index = point.y * width + point.x
    if (visited[index]) continue
    visited[index] = 1
    const offset = index * 4
    if (imageData.data[offset + 3] <= alphaThreshold) continue

    pixels.push(point)
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)

    stack.push({ x: point.x + 1, y: point.y })
    stack.push({ x: point.x - 1, y: point.y })
    stack.push({ x: point.x, y: point.y + 1 })
    stack.push({ x: point.x, y: point.y - 1 })
  }

  return {
    pixels,
    bounds: {
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
    },
  }
}

export async function downloadSpriteSheet(filename: string, framePaths: string[], columns = framePaths.length) {
  if (framePaths.length === 0) {
    throw new Error('No frames available for spritesheet export.')
  }

  const images = await Promise.all(framePaths.map(loadImage))
  const safeColumns = Math.max(1, Math.min(columns, framePaths.length))
  const rows = Math.ceil(images.length / safeColumns)
  const canvas = document.createElement('canvas')
  canvas.width = safeColumns * 64
  canvas.height = rows * 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)

  images.forEach((image, index) => {
    const x = (index % safeColumns) * 64
    const y = Math.floor(index / safeColumns) * 64
    context.drawImage(image, x, y, 64, 64)
  })

  await downloadCanvas(canvas, filename)
}

export async function downloadAllDirectionSpriteSheets(character: CharacterManifest, animation: AnimationName) {
  for (const direction of ['south', 'east', 'north', 'west'] as Direction[]) {
    const frames = getFrames(character, animation, direction)
    if (frames.length > 0) {
      await downloadSpriteSheet(
        `${character.character_id}_${animation}_${direction}_sheet.png`,
        frames.map((frame) => frame.path),
        frames.length,
      )
    }
  }
}

async function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not export PNG.')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return dataUrl
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${src}`))
    image.src = src
  })
}

export function makeRecipe(
  character: CharacterManifest,
  selectedParts: Record<PartLabel, string>,
  partLibrary: ExtractedPart[] = [],
  selectedPartIds: Partial<Record<PartLabel, string>> = {},
  layerSettings: Partial<Record<PartLabel, ComposerLayerSettings>> = {},
  recipeId = `generated_${character.character_id}`,
  paletteName = palettePresets[0],
  paletteRules: Omit<PaletteRules, 'team_color'> = { hue_shift: 0, saturation: 100, brightness: 100 },
): KitbashRecipe {
  return {
    character_id: recipeId,
    base_canvas: [64, 64],
    base_character: character.character_id,
    layers: layerOrder.map((label) => {
      const selectedPart = partLibrary.find((part) => part.part_id === selectedPartIds[label])
      const { compatibleSelectedPart, compatibleSelectedSource } = resolveCompatiblePartSelection(character, selectedPart, selectedParts[label])
      const settings = layerSettings[label]
      return {
        label,
        source_character: compatibleSelectedPart?.character_id ?? compatibleSelectedSource ?? character.character_id,
        source_part_id: compatibleSelectedPart?.part_id,
        offset: settings?.offset ?? [0, 0],
        visible: settings?.visible ?? true,
        locked: settings?.locked ?? false,
        extraction_method:
          compatibleSelectedPart?.extraction_method ??
          (label === 'head' || label === 'torso' || label.includes('arm') || label.includes('leg') ? 'apes' : 'preset_region'),
      }
    }),
    palette: {
      hue_shift: paletteRules.hue_shift,
      saturation: paletteRules.saturation,
      brightness: paletteRules.brightness,
      team_color: paletteName,
    },
    animation_coverage: character.animation_names,
    export_targets: ['generic_json', 'godot_4', 'sprite_sheets', 'gif_previews'],
  }
}

export function makeApesJob(
  character: CharacterManifest,
  animations: AnimationName[],
  directions: Direction[],
  labels: PartLabel[],
  frameRange: [number, number] = [0, 7],
): ApesJob {
  const [frameStart, frameEnd] = frameRange[0] <= frameRange[1] ? frameRange : [frameRange[1], frameRange[0]]
  const jobId = `apes_${character.character_id}_${Date.now()}`
  const input_frames = animations.flatMap((animation) =>
    directions.flatMap((direction) =>
      getFrames(character, animation, direction)
        .filter((frame) => frame.index >= frameStart && frame.index <= frameEnd)
        .map((frame) => ({
          animation,
          direction,
          frame_index: frame.index,
          path: frame.path,
        })),
    ),
  )

  return {
    job_id: jobId,
    character_id: character.character_id,
    animations,
    directions,
    frame_range: [frameStart, frameEnd],
    output_labels: labels,
    status: 'prepared',
    created_at: new Date().toISOString(),
    input_frames,
    output_root: `data/apes/output/${jobId}`,
    logs: [
      'Prepared APES input manifest.',
      `Prepared ${input_frames.length} normalized 64x64 frame reference(s).`,
      'Awaiting local APES bridge execution.',
    ],
  }
}

export function buildExportManifest(character: CharacterManifest, recipe: KitbashRecipe, apesJobs: ApesJob[], options: { placeholderModeEnabled?: boolean } = {}) {
  return {
    export_version: 1,
    created_at: new Date().toISOString(),
    character_id: recipe.character_id,
    source_character: character.character_id,
    canvas_size: recipe.base_canvas,
    animations: character.animation_names.map((animation) => ({
      name: animation,
      directions: ['south', 'east', 'north', 'west'].map((direction) => ({
        direction,
        frame_count: getFrames(character, animation, direction as Direction).length,
      })),
    })),
    recipe,
    apes: {
      first_class: true,
      placeholder_mode_enabled: options.placeholderModeEnabled === true,
      jobs: apesJobs.map((job) => ({
        job_id: job.job_id,
        status: job.status,
        character_id: job.character_id,
        input_frame_count: job.input_frames.length,
        output_labels: job.output_labels,
        failure_details: job.failure_details,
      })),
    },
    extraction_provenance: recipe.layers.map((layer) => ({
      label: layer.label,
      source_character: layer.source_character,
      source_part_id: layer.source_part_id,
      method: layer.extraction_method,
      offset: layer.offset,
    })),
  }
}

export function buildUnity2DMetadata(character: CharacterManifest, recipe: KitbashRecipe) {
  return {
    format: 'unity_2d_sprite_metadata',
    version: 1,
    character_id: recipe.character_id,
    source_character: character.character_id,
    pixels_per_unit: 64,
    pivot: { x: 0.5, y: 0.5 },
    filter_mode: 'Point',
    compression: 'None',
    sprite_mode: 'Multiple',
    animations: character.animation_names.flatMap((animation) =>
      ['south', 'east', 'north', 'west'].map((direction) => ({
        clip_name: `${animation}_${direction}`,
        frame_count: getFrames(character, animation, direction as Direction).length,
        frame_size: { width: 64, height: 64 },
        loop_time: animation !== 'attack',
        sample_rate: animation === 'attack' ? 10 : 7,
        spritesheet: `${character.character_id}_${animation}_${direction}_sheet.png`,
      })),
    ),
    layers: recipe.layers.map((layer) => ({
      label: layer.label,
      source_character: layer.source_character,
      source_part_id: layer.source_part_id,
      extraction_method: layer.extraction_method,
      offset: layer.offset,
      visible: layer.visible,
      locked: layer.locked,
    })),
  }
}

export function buildRpgMakerMzMetadata(character: CharacterManifest, recipe: KitbashRecipe) {
  return {
    format: 'rpg_maker_mz_character_sheet',
    version: 1,
    character_id: recipe.character_id,
    source_character: character.character_id,
    cell_size: { width: 64, height: 64 },
    sheet_layout: {
      columns: 12,
      rows: 8,
      directions: ['down', 'left', 'right', 'up'],
      frames_per_step: 3,
      note: 'Use walk frames as the RPG Maker movement source; crop or duplicate frames if your project expects 48x48 cells.',
    },
    suggested_source_animation: character.animation_names.includes('walk') ? 'walk' : character.animation_names[0],
    provenance: recipe.layers.map((layer) => ({
      label: layer.label,
      method: layer.extraction_method,
      source_character: layer.source_character,
      source_part_id: layer.source_part_id,
    })),
  }
}

export function buildAsepriteReference(character: CharacterManifest, recipe: KitbashRecipe) {
  return {
    format: 'aseprite_reference_package',
    version: 1,
    character_id: recipe.character_id,
    source_character: character.character_id,
    canvas: { width: 64, height: 64 },
    tags: character.animation_names.flatMap((animation) =>
      ['south', 'east', 'north', 'west'].map((direction) => ({
        name: `${animation}_${direction}`,
        direction: 'forward',
        frame_count: getFrames(character, animation, direction as Direction).length,
      })),
    ),
    layer_order: recipe.layers.map((layer, index) => ({
      index,
      name: layer.label,
      visible: layer.visible,
      locked: layer.locked,
      offset: layer.offset,
      source_character: layer.source_character,
      source_part_id: layer.source_part_id,
      extraction_method: layer.extraction_method,
    })),
    notes: [
      'Import original source frames as reference layers.',
      'Import APES, preset, connected-pixel, and manual masks as editable mask layers.',
      'Keep hard pixel edges and disable interpolation while editing.',
    ],
  }
}

export function seededRandom(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += h << 13
    h ^= h >>> 7
    h += h << 3
    h ^= h >>> 17
    h += h << 5
    return (h >>> 0) / 4294967295
  }
}
