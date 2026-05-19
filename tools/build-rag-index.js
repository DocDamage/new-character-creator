import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRagIndex } from '../src/ragIndex.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(repoRoot, 'data', 'rag', 'knowledge_index.json')
const outArgIndex = process.argv.indexOf('--out')
const resolvedOutputPath = outArgIndex >= 0 ? path.resolve(process.argv[outArgIndex + 1]) : outputPath
const publicOutArgIndex = process.argv.indexOf('--public-out')
const resolvedPublicOutputPath = publicOutArgIndex >= 0
  ? path.resolve(process.argv[publicOutArgIndex + 1])
  : (outArgIndex >= 0 ? null : path.join(repoRoot, 'public', 'data', 'rag', 'knowledge_index.json'))
const limitDocsArgIndex = process.argv.indexOf('--limit-docs')
const limitDocs = limitDocsArgIndex >= 0 ? Number(process.argv[limitDocsArgIndex + 1]) || Infinity : Infinity

const sourceSpecs = [
  { source_type: 'readme', path: 'README.md', title: 'README' },
  { source_type: 'doc', path: 'docs/pixellab-mcp.md', title: 'PixelLab MCP animation bridge' },
  { source_type: 'doc', path: 'docs/apes-lpc-intake.md', title: 'APES LPC Intake' },
  { source_type: 'doc', path: 'docs/apes-gpu-rebuild.md', title: 'APES GPU Rebuild Runbook' },
  { source_type: 'doc', path: 'docs/release-readiness.md', title: 'Release Readiness' },
  { source_type: 'doc', path: 'docs/ai-rag-system.md', title: 'AI RAG System' },
  { source_type: 'license_audit', path: 'docs/asset-license-audit.md', title: 'Asset License Audit' },
  { source_type: 'doc', path: 'docs/browser-checks.md', title: 'Browser Checks' },
  { source_type: 'asset_manifest', path: 'public/data/manifests/characters.json', title: 'Public Character Manifest' },
  { source_type: 'lpc_catalog', path: 'data/lpc/lpc_catalog.json', title: 'Local LPC Catalog' },
  { source_type: 'apes_inventory', path: 'data/apes/output/apes_output_inventory.json', title: 'APES Output Inventory' },
]

const publicSourceSpecs = [
  { source_type: 'doc', path: 'docs/pixellab-mcp.md', title: 'PixelLab MCP animation bridge' },
  { source_type: 'doc', path: 'docs/ai-rag-system.md', title: 'AI RAG System' },
  { source_type: 'asset_manifest', path: 'public/data/manifests/characters.json', title: 'Public Character Manifest' },
  { source_type: 'duelyst_manifest', path: 'public/data/manifests/duelyst.json', title: 'Public Duelyst Manifest' },
]

const documents = loadDocuments(sourceSpecs, limitDocs)
writeIndex(documents, resolvedOutputPath)

if (resolvedPublicOutputPath) {
  const publicDocuments = loadDocuments(publicSourceSpecs, limitDocs, sanitizePublicText)
  writeIndex(publicDocuments, resolvedPublicOutputPath)
}

function loadDocuments(specs, documentLimit, sanitizeText = (value) => value) {
  const loaded = []
  for (const spec of specs) {
    if (loaded.length >= documentLimit) break
    const absolutePath = path.join(repoRoot, spec.path)
    if (!fs.existsSync(absolutePath)) continue
    const raw = fs.readFileSync(absolutePath, 'utf8')
    loaded.push({
      source_id: spec.path.replaceAll('\\', '/'),
      source_type: spec.source_type,
      title: spec.title,
      uri: spec.path.replaceAll('\\', '/'),
      text: sanitizeText(normalizeSourceText(raw, spec.path)),
      metadata: {
        path: spec.path.replaceAll('\\', '/'),
        workflow: inferWorkflow(spec.path),
      },
    })
  }
  return loaded
}

function writeIndex(documentsToIndex, targetPath) {
  const index = buildRagIndex(documentsToIndex)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${index.chunk_count} RAG chunk(s) from ${index.document_count} source document(s) to ${path.relative(repoRoot, targetPath)}.`)
}

function sanitizePublicText(text) {
  return text
    .replaceAll('/__local/', '/local-bridge/')
    .replaceAll('/@fs/', '/local-file/')
    .replaceAll('duelyst.private.json', 'private Duelyst manifest')
    .replaceAll('characters.local.json', 'local character manifest')
    .replace(/Duelyst-Unit-Animations/gi, 'Duelyst source package')
    .replace(/lpc sprite generator stuff/gi, 'LPC source assets')
    .replace(/[A-Z]:[\\/](?![rn][\\/])[A-Za-z0-9_.()[\] -]+[\\/]/g, 'local-path/')
}

function normalizeSourceText(raw, sourcePath) {
  if (!sourcePath.endsWith('.json')) return raw
  try {
    const parsed = JSON.parse(raw)
    return JSON.stringify(summarizeJson(parsed), null, 2)
  } catch {
    return raw
  }
}

function summarizeJson(value) {
  if (Array.isArray(value)) return value.slice(0, 40).map(summarizeJson)
  if (!value || typeof value !== 'object') return value
  if (typeof value.character_id === 'string' && value.directions && typeof value.directions === 'object') {
    return summarizeCharacterManifest(value)
  }
  const output = {}
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      output[key] = child.slice(0, 40).map(summarizeJson)
    } else if (child && typeof child === 'object') {
      output[key] = summarizeJson(child)
    } else {
      output[key] = child
    }
  }
  return output
}

function summarizeCharacterManifest(character) {
  return {
    character_id: character.character_id,
    display_name: character.display_name,
    class_type: character.class_type,
    labels: character.labels,
    source_folder: character.source_folder,
    canvas_size: character.canvas_size,
    animation_names: character.animation_names,
    source_quality_warnings: character.source_quality_warnings,
    representative_frame: character.representative_frame,
    rotation_preview_paths: Array.isArray(character.rotation_preview_paths) ? character.rotation_preview_paths.slice(0, 4) : [],
    animations: Array.isArray(character.animations)
      ? character.animations.map((animation) => ({
          name: animation.name,
          directions: Object.fromEntries(Object.entries(animation.directions ?? {}).map(([direction, frames]) => [
            direction,
            Array.isArray(frames) ? frames.length : 0,
          ])),
        }))
      : [],
  }
}

function inferWorkflow(sourcePath) {
  if (sourcePath.includes('apes')) return 'apes'
  if (sourcePath.includes('lpc')) return 'lpc'
  if (sourcePath.includes('pixellab')) return 'ai_generation'
  if (sourcePath.includes('release')) return 'release'
  return 'general'
}
