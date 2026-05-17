import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const cliArgs = process.argv.slice(2)
const privateManifestNames = new Set(['characters.local.json', 'duelyst.private.json'])

function getOptionValue(name, fallback) {
  const inline = cliArgs.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = cliArgs.findIndex((arg) => arg === name)
  if (index >= 0) return cliArgs[index + 1]
  return fallback
}

function main() {
  const distRoot = path.resolve(appRoot, getOptionValue('--dist', 'dist'))
  const failures = validateReleasePackage(distRoot)
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure)
    }
    process.exitCode = 1
    return
  }

  console.log(`Release package validation passed: ${distRoot}`)
}

function validateReleasePackage(distRoot) {
  const failures = []
  const manifestRoot = path.resolve(distRoot, 'data', 'manifests')

  for (const manifestName of privateManifestNames) {
    const manifestPath = path.resolve(manifestRoot, manifestName)
    if (fs.existsSync(manifestPath)) {
      failures.push(`Private manifest must not ship: ${path.relative(distRoot, manifestPath).replaceAll(path.sep, '/')}`)
    }
  }

  const releaseManifestPath = path.resolve(manifestRoot, 'characters.json')
  if (!fs.existsSync(releaseManifestPath)) {
    failures.push(`Release manifest is missing: ${path.relative(distRoot, releaseManifestPath).replaceAll(path.sep, '/')}`)
    return failures
  }

  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(releaseManifestPath, 'utf8'))
  } catch (error) {
    failures.push(`Release manifest could not be parsed: ${error instanceof Error ? error.message : String(error)}`)
    return failures
  }

  const assetPaths = collectManifestAssetPaths(manifest)
  for (const assetPath of assetPaths) {
    if (assetPath.includes('/@fs/') || assetPath.includes('/__local/') || /^[A-Z]:[\\/]/i.test(assetPath)) {
      failures.push(`Manifest asset must be release-relative, not local: ${assetPath}`)
      continue
    }

    const resolved = resolveDistAssetPath(distRoot, assetPath)
    if (!resolved || !fs.existsSync(resolved)) {
      failures.push(`Missing manifest asset: ${assetPath}`)
    }
  }

  return failures
}

function collectManifestAssetPaths(manifest) {
  const paths = new Set()
  for (const character of manifest.characters ?? []) {
    addPath(paths, character.representative_frame)
    for (const item of character.rotation_preview_paths ?? []) {
      addPath(paths, item.path)
    }
    for (const animation of character.animations ?? []) {
      for (const frames of Object.values(animation.directions ?? {})) {
        if (!Array.isArray(frames)) continue
        for (const frame of frames) {
          addPath(paths, frame.path)
        }
      }
    }
  }
  return [...paths]
}

function addPath(paths, value) {
  if (typeof value === 'string' && value.trim()) {
    paths.add(value.trim())
  }
}

function resolveDistAssetPath(distRoot, assetPath) {
  if (!assetPath.startsWith('/')) return null
  const resolved = path.resolve(distRoot, `.${assetPath}`)
  const relative = path.relative(distRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return resolved
}

main()
