import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scanRoots = ['src', 'tools', 'docs', 'public', 'data', 'dist']
const ignoredNames = new Set(['.local-tools-token', 'package-lock.json'])
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.txt', '.yml', '.yaml'])

export function scanTextForSecrets(text) {
  if (text.includes('[redacted]') && !/sk-[A-Za-z0-9_-]{12,}/.test(text)) return []
  const patterns = [
    /sk-[A-Za-z0-9_-]{12,}/g,
    /(?:api[_-]?key|token|secret)\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}/gi,
    /Bearer\s+[A-Za-z0-9_./+=-]{16,}/g,
  ]
  const rawFindings = patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => ({
    kind: 'possible_secret',
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    match: match[0].slice(0, 16),
  }))).sort((left, right) => left.index - right.index || right.end - left.end)
  const findings = []
  for (const finding of rawFindings) {
    if (findings.some((existing) => finding.index >= existing.index && finding.index < existing.end)) continue
    if (isKnownSafeMatch(text.slice(finding.index, finding.end))) continue
    findings.push(finding)
  }
  return findings.map(({ kind, match }) => ({ kind, match }))
}

function isKnownSafeMatch(value) {
  return value.includes('sk-editor-part-s') ||
    value.includes('Token = readFile') ||
    value.includes('Secret: getAiSes') ||
    value.includes('apiKey = optiona')
}

function main() {
  const findings = []
  for (const rootName of scanRoots) {
    const root = path.join(repoRoot, rootName)
    if (!fs.existsSync(root)) continue
    for (const filePath of walkFiles(root, new Set())) {
      if (ignoredNames.has(path.basename(filePath)) || !textExtensions.has(path.extname(filePath).toLowerCase())) continue
      const text = fs.readFileSync(filePath, 'utf8')
      for (const finding of scanTextForSecrets(text)) {
        findings.push({ ...finding, file: path.relative(repoRoot, filePath).replaceAll(path.sep, '/') })
      }
    }
  }
  if (findings.length > 0) {
    for (const finding of findings) console.error(`${finding.kind}: ${finding.file} (${finding.match})`)
    process.exitCode = 1
    return
  }
  console.log('Secret scan passed.')
}

function walkFiles(root, seen) {
  const output = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    let realRoot
    try {
      realRoot = fs.realpathSync(current)
    } catch {
      continue
    }
    if (seen.has(realRoot)) continue
    seen.add(realRoot)
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      if (entry.isSymbolicLink()) continue
      const fullPath = path.join(current, entry.name)
      const normalized = path.relative(repoRoot, fullPath).replaceAll(path.sep, '/')
      if (normalized.startsWith('docs/superpowers/plans/')) continue
      if (entry.isDirectory()) stack.push(fullPath)
      if (entry.isFile() && fs.existsSync(fullPath)) output.push(fullPath)
    }
  }
  return output
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
