import JSZip from 'jszip'
import { humanoid64Preset } from './presets'
import type { AnimationName, ApesJob, CharacterManifest, Direction, ExtractedPart, KitbashRecipe, Rect } from './types'
import {
  buildAsepriteReference,
  buildExportManifest,
  buildRpgMakerMzMetadata,
  buildUnity2DMetadata,
  downloadBlob,
  getFramePath,
  getFrames,
} from './utils'

const exportDirections: Direction[] = ['south', 'east', 'north', 'west']

type RenderRecipeFrameOptions = {
  recipe: KitbashRecipe
  characters: CharacterManifest[]
  partLibrary: ExtractedPart[]
  animation: AnimationName
  direction: Direction
  frameIndex: number
}

type RenderedFrameRecord = {
  animation: AnimationName
  direction: Direction
  frame_index: number
  file_name: string
  data_url: string
}

type RenderedSpriteSheetRecord = {
  animation: AnimationName
  direction: Direction
  frame_count: number
  columns: number
  file_name: string
  data_url: string
}

type RenderedFrameSet = {
  format: string
  version: number
  generated_at: string
  character_id: string
  source_character: string
  frame_count: number
  spritesheet_count: number
  frames: RenderedFrameRecord[]
  spritesheets: RenderedSpriteSheetRecord[]
  gif_previews: Array<{
    animation: AnimationName
    direction: Direction
    frame_count: number
    frame_rate: number
    loop: boolean
    spritesheet_file: string
    note: string
  }>
}

export async function renderRecipeFrameToDataUrl({
  recipe,
  characters,
  partLibrary,
  animation,
  direction,
  frameIndex,
}: RenderRecipeFrameOptions) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')

  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)

  for (const layer of recipe.layers) {
    if (!layer.visible) continue
    const sourceCharacter = characters.find((character) => character.character_id === layer.source_character) ?? characters[0]
    if (!sourceCharacter) continue

    const sourcePart = partLibrary.find((part) => part.part_id === layer.source_part_id)
    const bounds = sourcePart?.bounds ?? humanoid64Preset[layer.label]
    const sourceFrame = sourcePart?.source_frame_path ?? getFramePath(sourceCharacter, animation, direction, frameIndex)
    const source = sourcePart?.image_data_url ?? sourceFrame
    if (!source) continue

    const image = await loadImage(source)
    drawLayer(context, image, bounds, layer.offset, recipe, Boolean(sourcePart?.image_data_url))
  }

  return canvas.toDataURL('image/png')
}

export async function buildRenderedFrameSet(
  character: CharacterManifest,
  recipe: KitbashRecipe,
  characters: CharacterManifest[],
  partLibrary: ExtractedPart[],
): Promise<RenderedFrameSet> {
  const frames: RenderedFrameRecord[] = []
  const spritesheets: RenderedSpriteSheetRecord[] = []

  for (const animation of character.animation_names) {
    for (const direction of exportDirections) {
      const sourceFrames = getFrames(character, animation, direction)
      if (sourceFrames.length === 0) continue

      const renderedFrames = await Promise.all(
        sourceFrames.map(async (frame) => ({
          animation,
          direction,
          frame_index: frame.index,
          file_name: `${recipe.character_id}_${animation}_${direction}_${String(frame.index).padStart(3, '0')}.png`,
          data_url: await renderRecipeFrameToDataUrl({
            recipe,
            characters,
            partLibrary,
            animation,
            direction,
            frameIndex: frame.index,
          }),
        })),
      )

      frames.push(...renderedFrames)
      spritesheets.push({
        animation,
        direction,
        frame_count: renderedFrames.length,
        columns: renderedFrames.length,
        file_name: `${recipe.character_id}_${animation}_${direction}_rendered_sheet.png`,
        data_url: await renderSpriteSheetToDataUrl(renderedFrames.map((frame) => frame.data_url)),
      })
    }
  }

  return {
    format: 'pixel_creator_rendered_frame_set',
    version: 1,
    generated_at: new Date().toISOString(),
    character_id: recipe.character_id,
    source_character: character.character_id,
    frame_count: frames.length,
    spritesheet_count: spritesheets.length,
    frames,
    spritesheets,
    gif_previews: spritesheets.map((sheet) => ({
      animation: sheet.animation,
      direction: sheet.direction,
      frame_count: sheet.frame_count,
      frame_rate: sheet.animation === 'attack' ? 10 : 7,
      loop: sheet.animation !== 'attack',
      spritesheet_file: sheet.file_name,
      note: 'GIF preview metadata only. Use the rendered spritesheet frames to encode previews in your preferred pipeline.',
    })),
  }
}

export async function buildFullPackageManifest(
  character: CharacterManifest,
  recipe: KitbashRecipe,
  characters: CharacterManifest[],
  partLibrary: ExtractedPart[],
  apesJobs: ApesJob[],
  renderedFrameSet?: RenderedFrameSet,
) {
  const resolvedRenderedFrameSet = renderedFrameSet ?? (await buildRenderedFrameSet(character, recipe, characters, partLibrary))

  return {
    format: 'pixel_creator_full_package',
    version: 1,
    generated_at: new Date().toISOString(),
    character_id: recipe.character_id,
    source_character: character.character_id,
    manifest: buildExportManifest(character, recipe, apesJobs),
    rendered_outputs: resolvedRenderedFrameSet,
    engine_exports: {
      godot_4: {
        scene_file: `${recipe.character_id}.tscn`,
        scene_text: buildGodotSceneText(recipe),
        sprite_frames_file: `${recipe.character_id}_sprite_frames.tres`,
        sprite_frames_text: buildGodotSpriteFramesResource(recipe, resolvedRenderedFrameSet, 'rendered/frames'),
      },
      unity_2d: {
        file: `${recipe.character_id}_unity_2d.json`,
        metadata: buildUnity2DMetadata(character, recipe),
        importer_file: `${recipe.character_id}_PixelCreatorImporter.cs`,
        importer_text: buildUnityEditorImporter(recipe),
        animation_specs_file: `${recipe.character_id}_animation_clips.json`,
        animation_specs: buildUnityAnimationSpecs(recipe, resolvedRenderedFrameSet),
      },
      rpg_maker_mz: {
        file: `${recipe.character_id}_rpg_maker_mz.json`,
        metadata: buildRpgMakerMzMetadata(character, recipe),
        sheet_file: `$${recipe.character_id}.png`,
        sheet_layout: 'single-character 3x4 walking sheet',
      },
      aseprite_reference: {
        file: `${recipe.character_id}_aseprite_reference.json`,
        metadata: buildAsepriteReference(character, recipe),
        script_file: `${recipe.character_id}_aseprite_import.js`,
        script_text: buildAsepriteImportScript(recipe, resolvedRenderedFrameSet),
      },
    },
    reusable_part_folders: buildReusablePartFolders(recipe, partLibrary),
    extraction_provenance: recipe.layers.map((layer) => {
      const part = partLibrary.find((item) => item.part_id === layer.source_part_id)
      return {
        label: layer.label,
        extraction_method: layer.extraction_method,
        source_character: layer.source_character,
        source_part_id: layer.source_part_id,
        offset: layer.offset,
        visible: layer.visible,
        locked: layer.locked,
        tags: part?.tags ?? [],
        warnings: part?.warnings ?? [],
        bounds: part?.bounds,
      }
    }),
  }
}

export async function downloadRenderedFrameSetZip(
  character: CharacterManifest,
  recipe: KitbashRecipe,
  characters: CharacterManifest[],
  partLibrary: ExtractedPart[],
) {
  const renderedFrameSet = await buildRenderedFrameSet(character, recipe, characters, partLibrary)
  const zip = new JSZip()
  const rootPath = recipe.character_id

  zip.file(`${rootPath}/rendered_frame_set.json`, JSON.stringify(makeRenderedFrameSetFileIndex(renderedFrameSet, rootPath), null, 2))

  for (const frame of renderedFrameSet.frames) {
    await addDataUrlFile(zip, `${rootPath}/rendered/frames/${frame.file_name}`, frame.data_url)
  }

  for (const sheet of renderedFrameSet.spritesheets) {
    await addDataUrlFile(zip, `${rootPath}/rendered/sheets/${sheet.file_name}`, sheet.data_url)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(`${recipe.character_id}_rendered_frame_set.zip`, blob)

  return {
    frame_count: renderedFrameSet.frame_count,
    spritesheet_count: renderedFrameSet.spritesheet_count,
  }
}

export async function downloadFullPackageZip(
  character: CharacterManifest,
  recipe: KitbashRecipe,
  characters: CharacterManifest[],
  partLibrary: ExtractedPart[],
  apesJobs: ApesJob[],
) {
  const renderedFrameSet = await buildRenderedFrameSet(character, recipe, characters, partLibrary)
  const packageManifest = await buildFullPackageManifest(character, recipe, characters, partLibrary, apesJobs, renderedFrameSet)
  const zip = new JSZip()
  const rootPath = recipe.character_id
  const selectedParts = recipe.layers
    .map((layer) => partLibrary.find((part) => part.part_id === layer.source_part_id))
    .filter((part): part is ExtractedPart => Boolean(part))

  zip.file(`${rootPath}/package_manifest.json`, JSON.stringify(makeFullPackageFileIndex(packageManifest, rootPath), null, 2))
  zip.file(`${rootPath}/exports/generic_manifest.json`, JSON.stringify(buildExportManifest(character, recipe, apesJobs), null, 2))
  zip.file(`${rootPath}/exports/godot/${recipe.character_id}.tscn`, buildGodotSceneText(recipe))
  zip.file(`${rootPath}/exports/godot/${recipe.character_id}_sprite_frames.tres`, buildGodotSpriteFramesResource(recipe, renderedFrameSet, 'rendered/frames'))
  zip.file(`${rootPath}/exports/unity/${recipe.character_id}_unity_2d.json`, JSON.stringify(buildUnity2DMetadata(character, recipe), null, 2))
  zip.file(`${rootPath}/exports/unity/${recipe.character_id}_animation_clips.json`, JSON.stringify(buildUnityAnimationSpecs(recipe, renderedFrameSet), null, 2))
  zip.file(`${rootPath}/exports/unity/Editor/${recipe.character_id}_PixelCreatorImporter.cs`, buildUnityEditorImporter(recipe))
  zip.file(`${rootPath}/exports/rpg_maker/${recipe.character_id}_rpg_maker_mz.json`, JSON.stringify(buildRpgMakerMzMetadata(character, recipe), null, 2))
  await addDataUrlFile(zip, `${rootPath}/exports/rpg_maker/$${recipe.character_id}.png`, await renderRpgMakerCharacterSheetToDataUrl(renderedFrameSet))
  zip.file(`${rootPath}/exports/aseprite/${recipe.character_id}_aseprite_reference.json`, JSON.stringify(buildAsepriteReference(character, recipe), null, 2))
  zip.file(`${rootPath}/exports/aseprite/${recipe.character_id}_aseprite_import.js`, buildAsepriteImportScript(recipe, renderedFrameSet))
  zip.file(`${rootPath}/rendered/rendered_frame_set.json`, JSON.stringify(makeRenderedFrameSetFileIndex(renderedFrameSet, rootPath), null, 2))

  for (const frame of renderedFrameSet.frames) {
    await addDataUrlFile(zip, `${rootPath}/rendered/frames/${frame.file_name}`, frame.data_url)
  }

  for (const sheet of renderedFrameSet.spritesheets) {
    await addDataUrlFile(zip, `${rootPath}/rendered/sheets/${sheet.file_name}`, sheet.data_url)
  }

  for (const part of selectedParts) {
    const partFolder = `${rootPath}/parts/${part.label}/${part.part_id}`
    zip.file(`${partFolder}/part.json`, JSON.stringify(stripPartInlineAssets(part), null, 2))
    if (part.image_data_url) {
      await addDataUrlFile(zip, `${partFolder}/${part.image_path || `${part.part_id}.png`}`, part.image_data_url)
    }
    if (part.mask_data_url && part.mask_path) {
      await addDataUrlFile(zip, `${partFolder}/${part.mask_path}`, part.mask_data_url)
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(`${recipe.character_id}_full_package.zip`, blob)

  return {
    frame_count: renderedFrameSet.frame_count,
    spritesheet_count: renderedFrameSet.spritesheet_count,
    part_count: selectedParts.length,
  }
}

export function buildGodotSceneText(recipe: KitbashRecipe) {
  return `[gd_scene load_steps=2 format=3]\n\n[ext_resource type="SpriteFrames" path="res://${recipe.character_id}_sprite_frames.tres" id="1"]\n\n[node name="${recipe.character_id}" type="AnimatedSprite2D"]\nsprite_frames = ExtResource("1")\nanimation = "idle_south"\ncentered = true\n`
}

function buildGodotSpriteFramesResource(recipe: KitbashRecipe, renderedFrameSet: RenderedFrameSet, frameBasePath: string) {
  const extResources: string[] = []
  const atlasResources: string[] = []
  const animations = renderedFrameSet.spritesheets.map((sheet) => {
    const frames = renderedFrameSet.frames
      .filter((frame) => frame.animation === sheet.animation && frame.direction === sheet.direction)
      .sort((left, right) => left.frame_index - right.frame_index)
      .map((frame) => {
        const resourceId = `tex_${extResources.length + 1}`
        const atlasId = `atlas_${extResources.length + 1}`
        extResources.push(`[ext_resource type="Texture2D" path="res://${frameBasePath}/${frame.file_name}" id="${resourceId}"]`)
        atlasResources.push(`[sub_resource type="AtlasTexture" id="${atlasId}"]\natlas = ExtResource("${resourceId}")\nregion = Rect2(0, 0, 64, 64)`)
        return {
          duration: 1.0,
          texture: `SubResource("${atlasId}")`,
        }
      })

    return {
      frames,
      loop: sheet.animation !== 'attack',
      name: `&"${sheet.animation}_${sheet.direction}"`,
      speed: sheet.animation === 'attack' ? 10.0 : 7.0,
    }
  })

  const serializedAnimations = JSON.stringify(animations)
    .replaceAll('"texture":"', '"texture":')
    .replaceAll(')"}', ')}')
    .replaceAll('"name":"&\\"', '"name": &"')
    .replaceAll('\\""', '"')

  return `[gd_resource type="SpriteFrames" load_steps=${extResources.length + atlasResources.length + 1} format=3]\n\n${extResources.join('\n')}\n\n${atlasResources.join('\n\n')}\n\n[resource]\nmetadata/provenance = "${recipe.character_id}"\nanimations = ${serializedAnimations}\n`
}

function buildUnityAnimationSpecs(recipe: KitbashRecipe, renderedFrameSet: RenderedFrameSet) {
  return {
    format: 'pixel_creator_unity_animation_specs',
    version: 1,
    character_id: recipe.character_id,
    import_root: `Assets/${recipe.character_id}`,
    sprites_folder: 'Sprites',
    clips_folder: 'Animations',
    clips: renderedFrameSet.spritesheets.map((sheet) => ({
      clip_name: `${sheet.animation}_${sheet.direction}`,
      loop_time: sheet.animation !== 'attack',
      sample_rate: sheet.animation === 'attack' ? 10 : 7,
      sprite_files: renderedFrameSet.frames
        .filter((frame) => frame.animation === sheet.animation && frame.direction === sheet.direction)
        .sort((left, right) => left.frame_index - right.frame_index)
        .map((frame) => `Sprites/${frame.file_name}`),
    })),
  }
}

function buildUnityEditorImporter(recipe: KitbashRecipe) {
  return `// Place this file under Assets/${recipe.character_id}/Editor, then run Tools/Pixel Creator/Import ${recipe.character_id}.\nusing System.IO;\nusing UnityEditor;\nusing UnityEditor.Animations;\nusing UnityEngine;\n\npublic static class ${toPascalIdentifier(recipe.character_id)}PixelCreatorImporter\n{\n    [MenuItem("Tools/Pixel Creator/Import ${recipe.character_id}")]\n    public static void Import()\n    {\n        var root = "Assets/${recipe.character_id}";\n        var spriteRoot = root + "/Sprites";\n        var clipRoot = root + "/Animations";\n        Directory.CreateDirectory(clipRoot);\n        foreach (var png in Directory.GetFiles(spriteRoot, "*.png"))\n        {\n            var importer = AssetImporter.GetAtPath(png) as TextureImporter;\n            if (importer == null) continue;\n            importer.textureType = TextureImporterType.Sprite;\n            importer.spritePixelsPerUnit = 64;\n            importer.filterMode = FilterMode.Point;\n            importer.textureCompression = TextureImporterCompression.Uncompressed;\n            importer.SaveAndReimport();\n        }\n        Debug.Log("Pixel Creator sprites imported for ${recipe.character_id}. Use ${recipe.character_id}_animation_clips.json to create AnimationClips or wire clips through your local controller generator.");\n    }\n}\n`
}

async function renderRpgMakerCharacterSheetToDataUrl(renderedFrameSet: RenderedFrameSet) {
  const directions: Direction[] = [
    'south',
    'west',
    'east',
    'north',
  ]
  const canvas = document.createElement('canvas')
  canvas.width = 64 * 3
  canvas.height = 64 * 4
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)

  for (const [row, direction] of directions.entries()) {
    const frames = selectRpgMakerFrames(renderedFrameSet, direction)
    const images = await Promise.all(frames.map((frame) => loadImage(frame.data_url)))
    for (const [column, image] of images.entries()) {
      context.drawImage(image, column * 64, row * 64, 64, 64)
    }
  }

  return canvas.toDataURL('image/png')
}

function selectRpgMakerFrames(renderedFrameSet: RenderedFrameSet, direction: Direction) {
  const preferredAnimation = renderedFrameSet.frames.some((frame) => frame.animation === 'walk' && frame.direction === direction)
    ? 'walk'
    : renderedFrameSet.frames.some((frame) => frame.animation === 'idle' && frame.direction === direction)
      ? 'idle'
      : renderedFrameSet.frames.find((frame) => frame.direction === direction)?.animation
  const frames = renderedFrameSet.frames
    .filter((frame) => frame.animation === preferredAnimation && frame.direction === direction)
    .sort((left, right) => left.frame_index - right.frame_index)
  const fallback = frames[0] ?? renderedFrameSet.frames[0]
  if (!fallback) {
    throw new Error('No rendered frames are available for RPG Maker export.')
  }
  return [frames[0] ?? fallback, frames[1] ?? fallback, frames[2] ?? frames[0] ?? fallback]
}

function buildAsepriteImportScript(recipe: KitbashRecipe, renderedFrameSet: RenderedFrameSet) {
  const tags = renderedFrameSet.spritesheets.map((sheet) => ({
    name: `${sheet.animation}_${sheet.direction}`,
    frame_count: sheet.frame_count,
    frame_rate: sheet.animation === 'attack' ? 10 : 7,
    loop: sheet.animation !== 'attack',
  }))
  return `-- Aseprite import helper for ${recipe.character_id}\n-- Open the rendered PNG sequence folder, then use these tags as the authoritative timing map.\nlocal tags = ${JSON.stringify(tags, null, 2)}\nprint("Pixel Creator package: ${recipe.character_id}")\nfor _, tag in ipairs(tags) do\n  print(tag.name .. " frames=" .. tag.frame_count .. " fps=" .. tag.frame_rate)\nend\n`
}

function toPascalIdentifier(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, ' ').trim()
  const pascal = cleaned.split(/\s+/).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join('')
  return pascal || 'GeneratedCharacter'
}

function buildReusablePartFolders(recipe: KitbashRecipe, partLibrary: ExtractedPart[]) {
  return recipe.layers
    .map((layer) => partLibrary.find((part) => part.part_id === layer.source_part_id))
    .filter((part): part is ExtractedPart => Boolean(part))
    .map((part) => ({
      folder: `parts/${part.label}/${part.part_id}`,
      metadata_file: 'part.json',
      image_file: part.image_path || `${part.part_id}.png`,
      mask_file: part.mask_path || `${part.part_id}_mask.png`,
      metadata: part,
      assets: {
        image_data_url: part.image_data_url,
        mask_data_url: part.mask_data_url,
      },
    }))
}

async function renderSpriteSheetToDataUrl(frameDataUrls: string[]) {
  if (frameDataUrls.length === 0) {
    throw new Error('No rendered frames are available for spritesheet export.')
  }

  const images = await Promise.all(frameDataUrls.map(loadImage))
  const canvas = document.createElement('canvas')
  canvas.width = frameDataUrls.length * 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')

  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)
  images.forEach((image, index) => {
    context.drawImage(image, index * 64, 0, 64, 64)
  })
  return canvas.toDataURL('image/png')
}

function drawLayer(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  bounds: Rect,
  offset: [number, number],
  recipe: KitbashRecipe,
  isExtractedPart: boolean,
) {
  context.save()
  context.imageSmoothingEnabled = false
  context.filter = `hue-rotate(${recipe.palette.hue_shift}deg) saturate(${recipe.palette.saturation}%) brightness(${recipe.palette.brightness}%)`
  if (isExtractedPart) {
    context.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
      bounds.x + offset[0],
      bounds.y + offset[1],
      bounds.w,
      bounds.h,
    )
  } else {
    context.drawImage(
      image,
      bounds.x,
      bounds.y,
      bounds.w,
      bounds.h,
      bounds.x + offset[0],
      bounds.y + offset[1],
      bounds.w,
      bounds.h,
    )
  }
  context.restore()
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

async function addDataUrlFile(zip: JSZip, path: string, dataUrl: string) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  zip.file(path, blob)
}

function makeRenderedFrameSetFileIndex(renderedFrameSet: RenderedFrameSet, rootPath: string) {
  return {
    ...renderedFrameSet,
    frames: renderedFrameSet.frames.map((frame) => ({
      animation: frame.animation,
      direction: frame.direction,
      frame_index: frame.frame_index,
      file_name: frame.file_name,
      path: `${rootPath}/rendered/frames/${frame.file_name}`,
    })),
    spritesheets: renderedFrameSet.spritesheets.map((sheet) => ({
      animation: sheet.animation,
      direction: sheet.direction,
      frame_count: sheet.frame_count,
      columns: sheet.columns,
      file_name: sheet.file_name,
      path: `${rootPath}/rendered/sheets/${sheet.file_name}`,
    })),
  }
}

function makeFullPackageFileIndex(packageManifest: Awaited<ReturnType<typeof buildFullPackageManifest>>, rootPath: string) {
  return {
    ...packageManifest,
    rendered_outputs: makeRenderedFrameSetFileIndex(packageManifest.rendered_outputs, rootPath),
    engine_exports: {
      godot_4: {
        scene_file: `${rootPath}/exports/godot/${packageManifest.character_id}.tscn`,
        sprite_frames_file: `${rootPath}/exports/godot/${packageManifest.character_id}_sprite_frames.tres`,
      },
      unity_2d: {
        file: `${rootPath}/exports/unity/${packageManifest.character_id}_unity_2d.json`,
      },
      rpg_maker_mz: {
        file: `${rootPath}/exports/rpg_maker/${packageManifest.character_id}_rpg_maker_mz.json`,
      },
      aseprite_reference: {
        file: `${rootPath}/exports/aseprite/${packageManifest.character_id}_aseprite_reference.json`,
      },
    },
    reusable_part_folders: packageManifest.reusable_part_folders.map((part) => ({
      folder: `${rootPath}/${part.folder}`,
      metadata_file: `${rootPath}/${part.folder}/${part.metadata_file}`,
      image_file: part.assets.image_data_url ? `${rootPath}/${part.folder}/${part.image_file}` : null,
      mask_file: part.assets.mask_data_url && part.mask_file ? `${rootPath}/${part.folder}/${part.mask_file}` : null,
      metadata: stripPartInlineAssets(part.metadata),
    })),
  }
}

function stripPartInlineAssets(part: ExtractedPart) {
  return {
    part_id: part.part_id,
    character_id: part.character_id,
    label: part.label,
    source_animation: part.source_animation,
    source_direction: part.source_direction,
    source_frame_path: part.source_frame_path,
    image_path: part.image_path,
    mask_path: part.mask_path,
    anchor: part.anchor,
    bounds: part.bounds,
    extraction_method: part.extraction_method,
    compatibility: part.compatibility,
    reviewed: part.reviewed,
    tags: part.tags,
    warnings: part.warnings,
  }
}
