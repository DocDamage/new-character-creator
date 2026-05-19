import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const userHome = os.homedir()
const outputDir = path.join(repoRoot, 'docs', 'rag-sources', 'private')
const jsonOutputPath = path.join(repoRoot, 'data', 'rag', 'pc-asset-inventory.json')
const markdownOutputPath = path.join(outputDir, 'pc-asset-inventory.md')
const maxFileBytes = getNumberArg('--max-mb', 250) * 1024 * 1024
const maxUniqueRows = getNumberArg('--max-rows', 100000)
const roots = getRoots()

const assetExtensions = new Set([
  '.ase',
  '.aseprite',
  '.bmp',
  '.csv',
  '.doc',
  '.docx',
  '.gif',
  '.jpeg',
  '.jpg',
  '.json',
  '.kra',
  '.log',
  '.md',
  '.pdf',
  '.png',
  '.psb',
  '.psd',
  '.sprite',
  '.svg',
  '.tmj',
  '.tsx',
  '.txt',
  '.unitypackage',
  '.webp',
  '.xml',
])

const ignoredDirNames = new Set([
  '$recycle.bin',
  '.cache',
  '.git',
  '.gradle',
  '.next',
  '.nuget',
  '.pnpm-store',
  '.venv',
  '.worktrees',
  'appdata',
  'application data',
  'cache',
  'dist',
  'node_modules',
  'packages',
  'program files',
  'program files (x86)',
  'programdata',
  'site-packages',
  'system volume information',
  'test-results',
  'windows',
])

const ignoredFileNames = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])

const startedAt = new Date()
const stats = {
  scanned_roots: roots,
  started_at: startedAt.toISOString(),
  max_file_mb: Math.round(maxFileBytes / 1024 / 1024),
  candidate_count: 0,
  unique_count: 0,
  duplicate_count: 0,
  skipped_count: 0,
  inaccessible_count: 0,
  oversize_count: 0,
}

const candidates = []
const inaccessible = []

for (const root of roots) {
  scanRoot(root)
}

const byHash = processCandidates(candidates)
const groups = Array.from(byHash.values()).sort((left, right) => right.size_bytes - left.size_bytes || left.canonical_path.localeCompare(right.canonical_path))
stats.unique_count = groups.length
stats.duplicate_count = groups.reduce((sum, group) => sum + Math.max(0, group.duplicates.length - 1), 0)
stats.finished_at = new Date().toISOString()

fs.mkdirSync(outputDir, { recursive: true })
fs.mkdirSync(path.dirname(jsonOutputPath), { recursive: true })
const payload = {
  format: 'pixel_creator_pc_asset_inventory',
  version: 1,
  generated_at: stats.finished_at,
  repo_root: repoRoot,
  stats,
  roots,
  inaccessible: inaccessible.slice(0, 200),
  groups,
}
fs.writeFileSync(jsonOutputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
fs.writeFileSync(markdownOutputPath, buildMarkdown(payload), 'utf8')

console.log(`Scanned ${stats.candidate_count} candidate asset(s).`)
console.log(`Wrote ${groups.length} unique asset group(s), ${stats.duplicate_count} duplicate file(s), ${stats.oversize_count} oversize skip(s).`)
console.log(`RAG source: ${path.relative(repoRoot, markdownOutputPath)}`)

function getRoots() {
  const rootArgIndex = process.argv.indexOf('--root')
  if (rootArgIndex >= 0 && process.argv[rootArgIndex + 1]) {
    return process.argv[rootArgIndex + 1].split(';').map((item) => path.resolve(item)).filter(fs.existsSync)
  }
  const preferred = [
    path.join(userHome, 'Desktop'),
    path.join(userHome, 'Documents'),
    path.join(userHome, 'Downloads'),
    path.join(userHome, 'Pictures'),
    path.join(userHome, 'OneDrive'),
    path.join(userHome, 'dev'),
  ]
  return Array.from(new Set(preferred.map((item) => path.resolve(item)).filter(fs.existsSync)))
}

function getNumberArg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) return fallback
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function scanRoot(root) {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch (error) {
      stats.inaccessible_count += 1
      inaccessible.push({ path: current, reason: error.message })
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      const lowerName = entry.name.toLowerCase()
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(fullPath, lowerName)) continue
        stack.push(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      if (ignoredFileNames.has(lowerName)) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!assetExtensions.has(ext)) continue
      addCandidate(fullPath, ext)
    }
  }
}

function shouldSkipDirectory(fullPath, lowerName) {
  if (ignoredDirNames.has(lowerName)) return true
  const normalized = fullPath.replaceAll('\\', '/').toLowerCase()
  return normalized.includes('/node_modules/') ||
    normalized.includes('/.git/') ||
    normalized.includes('/dist/') ||
    normalized.includes('/test-results/') ||
    normalized.includes('/data/rag/')
}

function addCandidate(fullPath, ext) {
  stats.candidate_count += 1
  let stat
  try {
    stat = fs.statSync(fullPath)
  } catch (error) {
    stats.skipped_count += 1
    inaccessible.push({ path: fullPath, reason: error.message })
    return
  }
  if (stat.size > maxFileBytes) {
    stats.oversize_count += 1
    return
  }
  const relativeToHome = path.relative(userHome, fullPath)
  candidates.push({
    path: fullPath,
    home_relative_path: relativeToHome.startsWith('..') ? fullPath : relativeToHome.replaceAll('\\', '/'),
    extension: ext,
    size_bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
  })
}

function processCandidates(records) {
  const bySize = new Map()
  for (const record of records) {
    const sizeGroup = bySize.get(record.size_bytes) ?? []
    sizeGroup.push(record)
    bySize.set(record.size_bytes, sizeGroup)
  }

  const groupsByHash = new Map()
  for (const [sizeBytes, sizeGroup] of bySize.entries()) {
    if (sizeGroup.length === 1) {
      const record = sizeGroup[0]
      groupsByHash.set(`unique-size:${sizeBytes}:${record.path}`, makeGroup(`size-${sizeBytes}`, record))
      continue
    }
    for (const record of sizeGroup) {
      let hash
      try {
        hash = hashFile(record.path)
      } catch (error) {
        stats.skipped_count += 1
        inaccessible.push({ path: record.path, reason: error.message })
        continue
      }
      const existing = groupsByHash.get(hash)
      if (existing) {
        existing.duplicates.push(record)
        existing.extensions = Array.from(new Set([...existing.extensions, record.extension])).sort()
        continue
      }
      groupsByHash.set(hash, makeGroup(hash, record))
    }
  }
  return groupsByHash
}

function makeGroup(hash, record) {
  return {
    content_hash: hash,
    canonical_path: record.path,
    canonical_home_relative_path: record.home_relative_path,
    extensions: [record.extension],
    size_bytes: record.size_bytes,
    modified_at: record.modified_at,
    duplicate_count: 0,
    duplicates: [record],
  }
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256')
  const buffer = fs.readFileSync(filePath)
  hash.update(buffer)
  return hash.digest('hex')
}

function buildMarkdown(payload) {
  const topGroups = payload.groups.slice(0, maxUniqueRows)
  const rows = topGroups.map((group) => {
    const duplicateNote = group.duplicates.length > 1 ? ` duplicate_count=${group.duplicates.length - 1}` : ''
    return `- ${group.canonical_home_relative_path} | ${group.extensions.join(', ')} | ${formatBytes(group.size_bytes)} | sha256=${group.content_hash.slice(0, 16)}${duplicateNote}`
  })
  const duplicateRows = payload.groups
    .filter((group) => group.duplicates.length > 1)
    .slice(0, 300)
    .map((group) => [
      `- ${group.canonical_home_relative_path}`,
      ...group.duplicates.slice(1, 8).map((duplicate) => `  - duplicate: ${duplicate.home_relative_path}`),
    ].join('\n'))

  return [
    '# PC Asset Inventory For Local RAG',
    '',
    `Generated: ${payload.generated_at}`,
    '',
    'This file is generated from local filesystem paths and is ignored by git. It lets the local RAG index know what reusable art, documents, manifests, and references exist on this PC without copying those assets into the repository.',
    '',
    '## Summary',
    '',
    `- Candidate assets scanned: ${payload.stats.candidate_count}`,
    `- Unique asset groups: ${payload.stats.unique_count}`,
    `- Duplicate files removed from primary listing: ${payload.stats.duplicate_count}`,
    `- Oversize files skipped: ${payload.stats.oversize_count}`,
    `- Inaccessible folders/files: ${payload.stats.inaccessible_count}`,
    '',
    '## Scanned Roots',
    '',
    ...payload.roots.map((root) => `- ${root}`),
    '',
    '## Unique Assets',
    '',
    ...rows,
    '',
    '## Duplicate Groups',
    '',
    ...(duplicateRows.length ? duplicateRows : ['No duplicate content groups found.']),
    '',
    '## Notes',
    '',
    '- Deduplication uses SHA-256 content hashes.',
    '- The canonical path is the first unique content record found during scanning.',
    '- Use the JSON sidecar for full duplicate lists and machine-readable metadata.',
    '',
  ].join('\n')
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes / 1024 / 1024)} MB`
}
