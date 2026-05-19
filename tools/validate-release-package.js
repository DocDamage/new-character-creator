import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const cliArgs = process.argv.slice(2)
const privateManifestNames = new Set(['characters.local.json', 'duelyst.private.json'])
const textAssetExtensions = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.map'])
const forbiddenTextPatterns = [
  { pattern: /\/@fs\//, label: '/@fs/' },
  { pattern: /\/__local\//, label: '/__local/' },
  { pattern: /[A-Z]:[\\/](?![rn][\\/])[A-Za-z0-9_.()[\] -]+[\\/]/i, label: 'Windows absolute path' },
  { pattern: /characters\.local\.json|duelyst\.private\.json/, label: 'private manifest name' },
  { pattern: /Duelyst-Unit-Animations|lpc sprite generator stuff/i, label: 'private asset root' },
  { pattern: /\.ps1|setup_home_pc/i, label: 'local PowerShell setup script' },
]

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
  if (!fs.existsSync(distRoot)) {
    return [`Release dist folder is missing: ${distRoot}`]
  }

  for (const failure of scanDistTextAssets(distRoot)) {
    failures.push(failure)
  }

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

  failures.push(...validateLpcInventory(distRoot))

  return failures
}

function validateLpcInventory(distRoot) {
  const failures = []
  const inventoryPath = path.resolve(distRoot, 'data', 'lpc', 'lpc_asset_inventory.json')
  if (!fs.existsSync(inventoryPath)) return failures

  let inventory
  try {
    inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  } catch (error) {
    return [`LPC inventory could not be parsed: ${error instanceof Error ? error.message : String(error)}`]
  }

  const assetRoot = inventory?.source?.asset_root
  if (assetRoot !== '/assets/lpc') {
    failures.push(`LPC inventory asset root must be release public path /assets/lpc, got ${String(assetRoot)}`)
  }
  const forbiddenPaths = [
    inventory?.source?.asset_root,
    inventory?.source?.upstream_reference?.root,
  ].filter(Boolean).join('\n')
  if (/\/@fs\/|\/__local\/|[A-Z]:[\\/]|lpc sprite generator stuff/i.test(forbiddenPaths)) {
    failures.push('LPC inventory contains a local/private source root.')
  }

  const sheets = Array.isArray(inventory?.sheets) ? inventory.sheets : []
  if (sheets.length === 0) {
    failures.push('LPC inventory is present but has no sheets.')
    return failures
  }

  for (const sheet of sheets.slice(0, 25)) {
    if (!sheet || typeof sheet.path !== 'string') continue
    const publicPath = `/assets/lpc/${sheet.path.replaceAll('\\', '/')}`
    const resolved = resolveDistAssetPath(distRoot, publicPath)
    if (!resolved || !fs.existsSync(resolved)) {
      failures.push(`Missing LPC inventory sheet asset: ${publicPath}`)
    }
  }

  const lpcAssetRoot = path.resolve(distRoot, 'assets', 'lpc')
  if (!fs.existsSync(lpcAssetRoot)) {
    failures.push('LPC inventory is present but dist/assets/lpc is missing.')
    return failures
  }

  const blockedLpcEntries = walkFiles(lpcAssetRoot)
    .filter((filePath) => /\.(exe)$/i.test(filePath) || /[\\/](__MACOSX|\.git)[\\/]|[\\/]\.DS_Store$/i.test(filePath))
    .map((filePath) => path.relative(distRoot, filePath).replaceAll(path.sep, '/'))
  for (const filePath of blockedLpcEntries) {
    failures.push(`Forbidden LPC release asset: ${filePath}`)
  }

  return failures
}

function scanDistTextAssets(distRoot) {
  const failures = []
  for (const filePath of walkFiles(distRoot)) {
    if (!textAssetExtensions.has(path.extname(filePath).toLowerCase())) continue
    const relativePath = path.relative(distRoot, filePath).replaceAll(path.sep, '/')
    const text = fs.readFileSync(filePath, 'utf8')
    for (const rule of forbiddenTextPatterns) {
      if (rule.pattern.test(text)) {
        failures.push(`Forbidden ${rule.label} reference in dist text asset: ${relativePath}`)
      }
    }
  }
  return failures
}

function walkFiles(root) {
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.resolve(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }
  return files
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
