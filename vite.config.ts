import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalAssetToolsPlugin } from './tools/localToolsServer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = __dirname

function releasePackagePlugin() {
  return {
    name: 'release-package',
    closeBundle() {
      const distRoot = path.resolve(appRoot, 'dist')
      const manifestRoot = path.resolve(distRoot, 'data', 'manifests')
      const privateManifests = ['characters.local.json', 'duelyst.private.json']
      for (const manifestName of privateManifests) {
        fs.rmSync(path.resolve(manifestRoot, manifestName), { force: true })
      }

      writeBundledReleaseManifest(distRoot)
    },
  }
}

function writeBundledReleaseManifest(distRoot: string) {
  const sourceRoot = path.resolve(appRoot, 'data', 'exports', '1-warrior-woman', 'individual_frames')
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Release sprite fixture is missing: ${sourceRoot}`)
  }

  const spriteRoot = path.resolve(distRoot, 'data', 'sprites', '1-warrior-woman')
  fs.rmSync(spriteRoot, { recursive: true, force: true })
  fs.cpSync(sourceRoot, path.resolve(spriteRoot, 'animations'), { recursive: true })

  const manifestRoot = path.resolve(distRoot, 'data', 'manifests')
  fs.mkdirSync(manifestRoot, { recursive: true })
  const character = buildBundledReleaseCharacter(path.resolve(spriteRoot, 'animations'))
  const manifest = {
    generated_at: new Date().toISOString(),
    asset_root: 'data/sprites',
    total_characters: 1,
    canonical_directions: ['north', 'south', 'east', 'west'],
    canonical_animations: ['idle', 'walk', 'running_jump', 'attack'],
    characters: [character],
  }
  fs.writeFileSync(path.resolve(manifestRoot, 'characters.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function buildBundledReleaseCharacter(animationRoot: string) {
  const directions: Record<string, Record<string, { frame_count: number; frames: Array<Record<string, unknown>> }>> = {}
  const animations = listDirectories(animationRoot).map((animationName) => {
    const directionFrames: Record<string, Array<Record<string, unknown>>> = {}
    for (const directionName of listDirectories(path.resolve(animationRoot, animationName))) {
      const frames = listPngFiles(path.resolve(animationRoot, animationName, directionName)).map((fileName, index) => {
        const publicPath = `/data/sprites/1-warrior-woman/animations/${animationName}/${directionName}/${fileName}`
        return {
          index,
          path: publicPath,
          file_name: fileName,
          width: 64,
          height: 64,
        }
      })
      directionFrames[directionName] = frames
      directions[directionName] ??= {}
      directions[directionName][animationName] = {
        frame_count: frames.length,
        frames,
      }
    }
    return {
      name: animationName,
      source_names: [animationName],
      directions: directionFrames,
      preview_gifs: [],
    }
  })
  const representativeFrame = directions.south?.idle?.frames[0]?.path as string | undefined

  return {
    character_id: '1-warrior-woman',
    display_name: '1 Warrior Woman',
    class_type: 'warrior_woman',
    source_folder: '/data/sprites/1-warrior-woman',
    canvas_size: { width: 64, height: 64 },
    directions,
    animations,
    animation_names: animations.map((animation) => animation.name).sort(),
    source_quality_warnings: [],
    rotation_preview_paths: [
      {
        direction: 'south',
        path: representativeFrame ?? '',
      },
    ],
    representative_frame: representativeFrame ?? '',
    extraction_status: {
      frame_chopped: true,
      preset_regions_available: true,
      connected_pixel_pass_available: true,
      apes_pass_available: false,
      manual_cleanup_complete: false,
    },
  }
}

function listDirectories(folder: string) {
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
}

function listPngFiles(folder: string) {
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), createLocalAssetToolsPlugin(appRoot), releasePackagePlugin()],
  server: {
    fs: {
      allow: [__dirname, path.resolve(__dirname, '..')],
    },
  },
})
