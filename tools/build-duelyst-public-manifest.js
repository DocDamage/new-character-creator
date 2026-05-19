import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function getOption(name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}

function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node tools/build-duelyst-public-manifest.js [--in public/data/manifests/duelyst.private.json] [--out public/data/manifests/duelyst.json] [--asset-root public/data/duelyst/staged]')
    return
  }

  const privateManifestPath = path.resolve(appRoot, getOption('--in', path.join('public', 'data', 'manifests', 'duelyst.private.json')))
  const outPath = path.resolve(appRoot, getOption('--out', path.join('public', 'data', 'manifests', 'duelyst.json')))
  const publicAssetRoot = path.resolve(appRoot, getOption('--asset-root', path.join('public', 'data', 'duelyst', 'staged')))
  const privateManifest = JSON.parse(fs.readFileSync(privateManifestPath, 'utf8'))

  fs.rmSync(publicAssetRoot, { recursive: true, force: true })
  fs.mkdirSync(publicAssetRoot, { recursive: true })

  const pathMap = new Map()
  const publicManifest = {
    format: 'pixel_creator_duelyst_manifest',
    version: 1,
    generated_at: new Date().toISOString(),
    license: {
      license: 'CC0 1.0',
      attribution_required: false,
      file: 'assets/Duelyst license.txt',
      notes: 'Local Duelyst license file states CC0 1.0 public domain dedication; attribution is optional, not required.',
    },
    total_assets: privateManifest.total_assets ?? 0,
    extension_counts: privateManifest.extension_counts ?? {},
    label_schema: privateManifest.label_schema ?? {},
    candidate_units: sanitizeCandidates(privateManifest.candidate_units ?? [], pathMap, publicAssetRoot),
    staged_manifest: sanitizeStagedManifest(privateManifest.staged_manifest ?? {}, pathMap, publicAssetRoot),
    findings: privateManifest.findings ?? [],
    summary: privateManifest.summary ?? '',
    warnings: [
      'Public manifest contains staged PNG crops only, not the source Unity package or local extraction cache.',
      'Staged frames are whole-unit Duelyst crops intended for browser review and source-character selection.',
    ],
  }

  const rewrittenManifest = rewriteFsStrings(publicManifest, pathMap, publicAssetRoot)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(rewrittenManifest, null, 2)}\n`, 'utf8')
  console.log(`Wrote public Duelyst manifest: ${outPath}`)
  console.log(`Copied ${pathMap.size} staged asset(s) to ${publicAssetRoot}`)
}

function sanitizeCandidates(candidates, pathMap, publicAssetRoot) {
  return candidates.map((candidate) => ({
    ...candidate,
    sheet_url: '',
    preview_url: rewriteFsUrl(candidate.preview_url, pathMap, publicAssetRoot),
    staged_frame_url: rewriteFsUrl(candidate.staged_frame_url, pathMap, publicAssetRoot),
    labels: sanitizeLabels(candidate.labels),
  }))
}

function sanitizeStagedManifest(stagedManifest, pathMap, publicAssetRoot) {
  return {
    ...stagedManifest,
    package_path: '',
    characters: (stagedManifest.characters ?? []).map((character) => ({
      ...character,
      labels: sanitizeLabels(character.labels),
      source_folder: '/data/duelyst/staged',
      representative_frame: rewriteFsUrl(character.representative_frame, pathMap, publicAssetRoot),
      rotation_preview_paths: (character.rotation_preview_paths ?? []).map((preview) => ({
        ...preview,
        path: rewriteFsUrl(preview.path, pathMap, publicAssetRoot),
      })),
      animations: (character.animations ?? []).map((animation) => ({
        ...animation,
        directions: Object.fromEntries(Object.entries(animation.directions ?? {}).map(([direction, frames]) => [
          direction,
          Array.isArray(frames) ? frames.map((frame) => ({
            ...frame,
            path: rewriteFsUrl(frame.path, pathMap, publicAssetRoot),
          })) : frames,
        ])),
      })),
    })),
  }
}

function sanitizeLabels(labels) {
  if (!labels || typeof labels !== 'object') return labels
  const assetLabels = Array.isArray(labels.asset_labels)
    ? labels.asset_labels.filter((label) => label !== 'private_local_asset')
    : []
  return {
    ...labels,
    asset_labels: Array.from(new Set([...assetLabels, 'public_cc0_asset'])),
  }
}

function rewriteFsUrl(value, pathMap, publicAssetRoot) {
  if (typeof value !== 'string' || !value.startsWith('/@fs/')) return value
  const localPath = path.resolve(value.slice('/@fs/'.length))
  const cached = pathMap.get(localPath)
  if (cached) return cached

  const relativePublicPath = makePublicAssetPath(localPath, pathMap.size)
  const targetPath = path.resolve(publicAssetRoot, relativePublicPath.slice('/data/duelyst/staged/'.length))
  if (!fs.existsSync(localPath)) {
    throw new Error(`Referenced Duelyst staged asset is missing: ${localPath}`)
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(localPath, targetPath)
  pathMap.set(localPath, relativePublicPath)
  return relativePublicPath
}

function makePublicAssetPath(localPath, index) {
  const normalized = localPath.replaceAll('\\', '/')
  const marker = '/duelyst-stage/'
  const markerIndex = normalized.indexOf(marker)
  const suffix = markerIndex >= 0
    ? normalized.slice(markerIndex + marker.length)
    : `${String(index).padStart(5, '0')}-${path.basename(localPath)}`
  return `/data/duelyst/staged/${suffix.replace(/^\/+/, '')}`
}

function rewriteFsStrings(value, pathMap, publicAssetRoot) {
  if (typeof value === 'string') {
    return rewriteFsUrl(value, pathMap, publicAssetRoot)
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteFsStrings(item, pathMap, publicAssetRoot))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      rewriteFsStrings(item, pathMap, publicAssetRoot),
    ]))
  }
  return value
}

main()
