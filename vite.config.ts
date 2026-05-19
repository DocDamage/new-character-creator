import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalAssetToolsPlugin } from './tools/localToolsServer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = __dirname
const localToolsTokenPath = path.resolve(appRoot, '.local-tools-token')

function getBasePath() {
  if (process.env.VITE_BASE_PATH) return process.env.VITE_BASE_PATH
  if (process.env.GITHUB_PAGES === 'true' && process.env.GITHUB_REPOSITORY) {
    const repoName = process.env.GITHUB_REPOSITORY.split('/').at(-1)
    return repoName ? `/${repoName}/` : '/'
  }
  return '/'
}

function getLocalToolsToken() {
  if (process.env.PIXEL_CREATOR_LOCAL_TOOLS_TOKEN) {
    return process.env.PIXEL_CREATOR_LOCAL_TOOLS_TOKEN
  }
  try {
    const existing = fs.readFileSync(localToolsTokenPath, 'utf8').trim()
    if (existing) return existing
  } catch {
    // Generate once and reuse so built local-tool previews match the preview server token.
  }
  const token = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(localToolsTokenPath, `${token}\n`, { encoding: 'utf8', mode: 0o600 })
  return token
}

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

      if (!releaseManifestAssetsAvailable(distRoot)) {
        writeBundledReleaseManifest(distRoot)
      }
      writeBundledLpcAssets(distRoot)
    },
  }
}

function writeBundledLpcAssets(distRoot: string) {
  const lpcSourceRoot = path.resolve(appRoot, 'assets', 'lpc sprite generator stuff')
  const lpcInventoryPath = path.resolve(appRoot, 'data', 'lpc', 'lpc_asset_inventory.json')
  if (!fs.existsSync(lpcSourceRoot) || !fs.existsSync(lpcInventoryPath)) return

  const publicLpcAssetRoot = path.resolve(distRoot, 'assets', 'lpc')
  fs.rmSync(publicLpcAssetRoot, { recursive: true, force: true })
  copyReleaseDirectory(lpcSourceRoot, publicLpcAssetRoot)

  const lpcDataRoot = path.resolve(distRoot, 'data', 'lpc')
  fs.mkdirSync(lpcDataRoot, { recursive: true })
  const inventory = JSON.parse(fs.readFileSync(lpcInventoryPath, 'utf8'))
  inventory.source = {
    ...inventory.source,
    asset_root: '/assets/lpc',
    upstream_reference: {
      ...inventory.source?.upstream_reference,
      root: '',
    },
  }
  fs.writeFileSync(path.resolve(lpcDataRoot, 'lpc_asset_inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
}

function copyReleaseDirectory(sourceRoot: string, targetRoot: string) {
  fs.mkdirSync(targetRoot, { recursive: true })
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (shouldSkipReleaseAsset(entry.name)) continue
    const sourcePath = path.resolve(sourceRoot, entry.name)
    const targetPath = path.resolve(targetRoot, entry.name)
    if (entry.isDirectory()) {
      copyReleaseDirectory(sourcePath, targetPath)
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

function shouldSkipReleaseAsset(name: string) {
  const lowerName = name.toLowerCase()
  return lowerName === '.git' || lowerName === '__macosx' || lowerName === '.ds_store' || lowerName.endsWith('.exe')
}

function releaseManifestAssetsAvailable(distRoot: string) {
  const manifestPath = path.resolve(distRoot, 'data', 'manifests', 'characters.json')
  if (!fs.existsSync(manifestPath)) return false
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    for (const assetPath of collectManifestAssetPaths(manifest)) {
      const resolved = resolveDistPublicPath(distRoot, assetPath)
      if (!resolved || !fs.existsSync(resolved)) return false
    }
    return true
  } catch {
    return false
  }
}

function writeBundledReleaseManifest(distRoot: string) {
  const exportsRoot = path.resolve(appRoot, 'data', 'exports')
  const releaseInputs = listDirectories(exportsRoot)
    .map((characterId) => ({
      characterId,
      sourceRoot: path.resolve(exportsRoot, characterId, 'individual_frames'),
    }))
    .filter((item) => fs.existsSync(item.sourceRoot))
  if (releaseInputs.length === 0) {
    throw new Error(`No release sprite exports found under ${exportsRoot}`)
  }

  const manifestRoot = path.resolve(distRoot, 'data', 'manifests')
  fs.mkdirSync(manifestRoot, { recursive: true })
  const characters = releaseInputs.map((input) => {
    const spriteRoot = path.resolve(distRoot, 'data', 'sprites', input.characterId)
    fs.rmSync(spriteRoot, { recursive: true, force: true })
    fs.cpSync(input.sourceRoot, path.resolve(spriteRoot, 'animations'), { recursive: true })
    return buildBundledReleaseCharacter(input.characterId, path.resolve(spriteRoot, 'animations'))
  })
  const manifest = {
    generated_at: new Date().toISOString(),
    asset_root: 'data/sprites',
    total_characters: characters.length,
    canonical_directions: ['north', 'south', 'east', 'west'],
    canonical_animations: ['idle', 'walk', 'running_jump', 'attack'],
    characters,
  }
  fs.writeFileSync(path.resolve(manifestRoot, 'characters.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function buildBundledReleaseCharacter(characterId: string, animationRoot: string) {
  const directions: Record<string, Record<string, { frame_count: number; frames: Array<Record<string, unknown>> }>> = {}
  const animations = listDirectories(animationRoot).map((animationName) => {
    const directionFrames: Record<string, Array<Record<string, unknown>>> = {}
    for (const directionName of listDirectories(path.resolve(animationRoot, animationName))) {
      const frames = listPngFiles(path.resolve(animationRoot, animationName, directionName)).map((fileName, index) => {
        const publicPath = `/data/sprites/${characterId}/animations/${animationName}/${directionName}/${fileName}`
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
    character_id: characterId,
    display_name: characterId.split(/[-_]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
    class_type: characterId.replace(/^\d+[-_]?/, '').replaceAll('-', '_'),
    source_folder: `/data/sprites/${characterId}`,
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

function collectManifestAssetPaths(manifest: Record<string, unknown>) {
  const paths = new Set<string>()
  const characters = Array.isArray(manifest.characters) ? manifest.characters : []
  for (const character of characters) {
    if (!character || typeof character !== 'object') continue
    addManifestPath(paths, (character as { representative_frame?: unknown }).representative_frame)
    const rotationPaths = (character as { rotation_preview_paths?: unknown }).rotation_preview_paths
    if (Array.isArray(rotationPaths)) {
      for (const item of rotationPaths) {
        if (item && typeof item === 'object') addManifestPath(paths, (item as { path?: unknown }).path)
      }
    }
    const animations = (character as { animations?: unknown }).animations
    if (!Array.isArray(animations)) continue
    for (const animation of animations) {
      if (!animation || typeof animation !== 'object') continue
      const directions = (animation as { directions?: unknown }).directions
      if (!directions || typeof directions !== 'object') continue
      for (const frames of Object.values(directions)) {
        if (!Array.isArray(frames)) continue
        for (const frame of frames) {
          if (frame && typeof frame === 'object') addManifestPath(paths, (frame as { path?: unknown }).path)
        }
      }
    }
  }
  return Array.from(paths)
}

function addManifestPath(paths: Set<string>, value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    paths.add(value.trim())
  }
}

function resolveDistPublicPath(distRoot: string, assetPath: string) {
  if (!assetPath.startsWith('/')) return null
  const resolved = path.resolve(distRoot, `.${assetPath}`)
  const relative = path.relative(distRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return resolved
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const localToolsToken = getLocalToolsToken()
  const includeLocalTools = mode !== 'release'
  return {
  base: getBasePath(),
  plugins: [
    react(),
    ...(includeLocalTools ? [createLocalAssetToolsPlugin(appRoot, { sessionToken: localToolsToken })] : []),
    ...(mode === 'release' ? [releasePackagePlugin()] : []),
  ],
  define: {
    'import.meta.env.VITE_LOCAL_TOOLS_TOKEN': JSON.stringify(includeLocalTools ? localToolsToken : ''),
  },
  server: {
    fs: {
      allow: [__dirname, path.resolve(__dirname, '..')],
    },
  },
}})
