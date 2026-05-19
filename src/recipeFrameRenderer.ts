import { getRecipeAnimationSourceCharacter } from './animationSource'
import type { ExportTargetProfileId } from './creatorCockpit'
import type { LpcCatalog } from './lpcCatalog'
import { getCharacterLabelValue, isLpcMannequin } from './lpcPartCompatibility'
import { getLpcPartFrameRef } from './lpcPartFrames'
import { buildLpcReplacementRegions } from './lpcReplacement'
import { buildLpcRenderPlan, hasCatalogRenderSelections } from './lpcRenderPlan'
import { humanoid64Preset } from './presets'
import type { AnimationName, CharacterManifest, Direction, ExtractedPart, KitbashRecipe, Rect } from './types'
import { getFramePath, getFrameRef } from './utils'

export type ImageLoader = (src: string) => Promise<HTMLImageElement>

export type RenderRecipeFrameOptions = {
  context: CanvasRenderingContext2D
  recipe: KitbashRecipe
  characters: CharacterManifest[]
  partLibrary: ExtractedPart[]
  animation: AnimationName
  direction: Direction
  frameIndex: number
  lpcCatalog?: LpcCatalog | null
  exportTargetProfile?: ExportTargetProfileId
  scale?: number
  loadImage: ImageLoader
  isCancelled?: () => boolean
}

const fullFrameBounds: Rect = { x: 0, y: 0, w: 64, h: 64 }

export function createImageLoader(maxEntries = Number.POSITIVE_INFINITY, onCacheChange?: (size: number) => void): ImageLoader {
  const cache = new Map<string, Promise<HTMLImageElement>>()
  return (src: string) => {
    const cached = cache.get(src)
    if (cached) {
      cache.delete(src)
      cache.set(src, cached)
      return cached
    }

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`Could not load ${src}`))
      image.src = src
    })
    cache.set(src, promise)
    trimImageLoadCache(cache, maxEntries, onCacheChange)
    promise.catch(() => {
      cache.delete(src)
      onCacheChange?.(cache.size)
    })
    onCacheChange?.(cache.size)
    return promise
  }
}

export async function renderRecipeFrameToContext({
  context,
  recipe,
  characters,
  partLibrary,
  animation,
  direction,
  frameIndex,
  lpcCatalog,
  exportTargetProfile,
  scale = 1,
  loadImage,
  isCancelled = () => false,
}: RenderRecipeFrameOptions) {
  context.imageSmoothingEnabled = false
  const baseCharacter = characters.find((character) => character.character_id === recipe.base_character)
  const animationSourceCharacter = getRecipeAnimationSourceCharacter(recipe, characters) ?? baseCharacter
  const baseFrame = animationSourceCharacter
    ? getFrameRef(animationSourceCharacter, animation, direction, frameIndex) ??
      getFrameRef(animationSourceCharacter, animationSourceCharacter.animation_names[0] ?? animation, direction, frameIndex)
    : undefined

  if (hasCatalogRenderSelections(recipe, lpcCatalog) && lpcCatalog) {
    const plan = buildLpcRenderPlan({
      catalog: lpcCatalog,
      recipe,
      bodyType: inferLpcBodyType(baseCharacter),
      baseFrame,
      animation,
      direction,
      frameIndex,
      exportTargetProfile,
    })
    for (const record of plan.records) {
      if (isCancelled()) return
      if (!record.source_path) continue
      const image = await loadImage(record.source_path)
      if (isCancelled()) return
      drawLayer(context, image, undefined, record.dest_rect, [0, 0], scale, recipe, false, record.source_rect ?? undefined)
    }
    return
  }

  if (baseCharacter && isLpcMannequin(baseCharacter)) {
    await drawCharacterFrame(
      context,
      animationSourceCharacter ?? baseCharacter,
      animation,
      direction,
      frameIndex,
      scale,
      recipe,
      buildLpcReplacementRegions(recipe, characters, partLibrary),
      loadImage,
    )
  }

  const deferredCloakDraws: Array<() => void> = []
  const flushDeferredCloaks = () => {
    while (!isCancelled() && deferredCloakDraws.length > 0) {
      deferredCloakDraws.shift()?.()
    }
  }

  for (const layer of recipe.layers) {
    if (isCancelled()) return
    if (!layer.visible) {
      if (shouldFlushDeferredCloaksAfter(layer.label)) flushDeferredCloaks()
      continue
    }
    const sourceCharacter = characters.find((character) => character.character_id === layer.source_character) ?? characters[0]
    if (!sourceCharacter) continue

    const sourcePart = partLibrary.find((part) => part.part_id === layer.source_part_id)
    if (!sourcePart && isLpcBaseFallbackLayer(sourceCharacter, baseCharacter, recipe.base_character)) {
      if (shouldFlushDeferredCloaksAfter(layer.label)) flushDeferredCloaks()
      continue
    }

    const isLpcPartSource = !sourcePart && sourceCharacter.labels?.lpc_role === 'part'
    const bounds = isLpcPartSource ? fullFrameBounds : sourcePart?.bounds ?? humanoid64Preset[layer.label]
    const matchingFrame = getFrameRef(sourceCharacter, animation, direction, frameIndex)
    const sourceFrame = isLpcPartSource
      ? getLpcPartFrameRef(sourceCharacter, animation, direction, frameIndex, layer.label)
      : matchingFrame ?? getFrameRef(sourceCharacter, sourceCharacter.animation_names[0] ?? animation, direction, frameIndex)
    const fallbackFramePath = isLpcPartSource ? undefined : getFramePath(sourceCharacter, animation, direction, frameIndex)
    const source = sourcePart?.image_data_url ?? sourcePart?.source_frame_path ?? sourceFrame?.path ?? fallbackFramePath
    if (!source) continue

    const image = await loadImage(source)
    const maskImage = sourcePart?.mask_data_url ? await loadImage(sourcePart.mask_data_url) : undefined
    if (isCancelled()) return

    const drawCurrentLayer = () => drawLayer(context, image, maskImage, bounds, layer.offset, scale, recipe, Boolean(sourcePart?.image_data_url), sourcePart ? undefined : sourceFrame?.source_rect)
    if (shouldDeferLpcCloakLayer(layer.label, sourceCharacter, Boolean(sourcePart))) {
      deferredCloakDraws.push(drawCurrentLayer)
    } else {
      drawCurrentLayer()
    }
    if (shouldFlushDeferredCloaksAfter(layer.label)) flushDeferredCloaks()
  }
  flushDeferredCloaks()
}

async function drawCharacterFrame(
  context: CanvasRenderingContext2D,
  character: CharacterManifest,
  animation: AnimationName,
  direction: Direction,
  frameIndex: number,
  scale: number,
  recipe: KitbashRecipe,
  replacementRegions: Rect[],
  loadImage: ImageLoader,
) {
  const frame = getFrameRef(character, animation, direction, frameIndex) ??
    getFrameRef(character, character.animation_names[0] ?? animation, direction, frameIndex)
  if (!frame) return
  const image = await loadImage(frame.path)
  const scratch = document.createElement('canvas')
  scratch.width = 64
  scratch.height = 64
  const scratchContext = scratch.getContext('2d')
  if (!scratchContext) return
  scratchContext.imageSmoothingEnabled = false
  drawLayer(scratchContext, image, undefined, fullFrameBounds, [0, 0], 1, recipe, false, frame.source_rect)
  scratchContext.globalCompositeOperation = 'destination-out'
  for (const region of replacementRegions) {
    scratchContext.fillRect(region.x, region.y, region.w, region.h)
  }
  scratchContext.globalCompositeOperation = 'source-over'
  context.drawImage(scratch, 0, 0, 64 * scale, 64 * scale)
}

function isLpcBaseFallbackLayer(sourceCharacter: CharacterManifest, baseCharacter: CharacterManifest | undefined, baseCharacterId: string) {
  return Boolean(
    baseCharacter &&
    sourceCharacter.character_id === baseCharacterId &&
    isLpcMannequin(baseCharacter) &&
    getCharacterLabelValue(sourceCharacter, 'lpc_role') !== 'part',
  )
}

function shouldDeferLpcCloakLayer(layerLabel: string, sourceCharacter: CharacterManifest, hasSourcePart: boolean) {
  return !hasSourcePart &&
    getCharacterLabelValue(sourceCharacter, 'lpc_role') === 'part' &&
    (layerLabel === 'cloak_back' || getCharacterLabelValue(sourceCharacter, 'lpc_part_label') === 'cloak_back')
}

function shouldFlushDeferredCloaksAfter(layerLabel: string) {
  return layerLabel === 'front_arm'
}

function inferLpcBodyType(character: CharacterManifest | undefined) {
  const bodyLabel = [character?.display_name ?? '', String(character?.labels?.lpc_path ?? '')].join(' ').toLowerCase()
  if (bodyLabel.includes('female') || bodyLabel.includes('feminine') || bodyLabel.includes('woman')) return 'female'
  if (bodyLabel.includes('muscular')) return 'muscular'
  if (bodyLabel.includes('pregnant')) return 'pregnant'
  if (bodyLabel.includes('teen')) return 'teen'
  if (bodyLabel.includes('child')) return 'child'
  return 'male'
}

function drawLayer(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  maskImage: HTMLImageElement | undefined,
  bounds: Rect,
  offset: [number, number],
  scale: number,
  recipe: KitbashRecipe,
  isExtractedPart: boolean,
  frameSourceRect?: Rect,
) {
  context.save()
  context.imageSmoothingEnabled = false
  context.filter = `hue-rotate(${recipe.palette.hue_shift}deg) saturate(${recipe.palette.saturation}%) brightness(${recipe.palette.brightness}%)`
  if (isExtractedPart) {
    drawExtractedLayer(context, image, maskImage, bounds, offset, scale)
  } else if (frameSourceRect) {
    context.drawImage(
      image,
      frameSourceRect.x + bounds.x,
      frameSourceRect.y + bounds.y,
      bounds.w,
      bounds.h,
      (bounds.x + offset[0]) * scale,
      (bounds.y + offset[1]) * scale,
      bounds.w * scale,
      bounds.h * scale,
    )
  } else {
    context.drawImage(
      image,
      bounds.x,
      bounds.y,
      bounds.w,
      bounds.h,
      (bounds.x + offset[0]) * scale,
      (bounds.y + offset[1]) * scale,
      bounds.w * scale,
      bounds.h * scale,
    )
  }
  context.restore()
}

function drawExtractedLayer(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  maskImage: HTMLImageElement | undefined,
  bounds: Rect,
  offset: [number, number],
  scale: number,
) {
  const canCropFromBounds = image.naturalWidth >= bounds.x + bounds.w && image.naturalHeight >= bounds.y + bounds.h
  const sourceX = canCropFromBounds ? bounds.x : 0
  const sourceY = canCropFromBounds ? bounds.y : 0
  const sourceWidth = canCropFromBounds ? bounds.w : image.naturalWidth
  const sourceHeight = canCropFromBounds ? bounds.h : image.naturalHeight
  const destinationX = (bounds.x + offset[0]) * scale
  const destinationY = (bounds.y + offset[1]) * scale
  const destinationWidth = bounds.w * scale
  const destinationHeight = bounds.h * scale

  if (!maskImage) {
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      destinationX,
      destinationY,
      destinationWidth,
      destinationHeight,
    )
    return
  }

  const scratch = document.createElement('canvas')
  scratch.width = Math.max(1, bounds.w)
  scratch.height = Math.max(1, bounds.h)
  const scratchContext = scratch.getContext('2d')
  if (!scratchContext) return
  scratchContext.imageSmoothingEnabled = false
  scratchContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, scratch.width, scratch.height)
  scratchContext.globalCompositeOperation = 'destination-in'
  if (maskImage.naturalWidth === 64 && maskImage.naturalHeight === 64) {
    scratchContext.drawImage(maskImage, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, scratch.width, scratch.height)
  } else {
    scratchContext.drawImage(maskImage, 0, 0, maskImage.naturalWidth, maskImage.naturalHeight, 0, 0, scratch.width, scratch.height)
  }
  context.drawImage(scratch, destinationX, destinationY, destinationWidth, destinationHeight)
}

function trimImageLoadCache(cache: Map<string, Promise<HTMLImageElement>>, maxEntries: number, onCacheChange?: (size: number) => void) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) return
    cache.delete(oldestKey)
  }
  onCacheChange?.(cache.size)
}
