import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'test-results'])
const ignoredRelativePrefixes = ['public/data/rag/', 'data/rag/']
const checkedExtensions = new Set(['.md', '.js', '.mjs', '.ts', '.tsx', '.json'])
const forbiddenPatterns = [
  /Start-Process\s+-FilePath\s+npm\b/i,
  /Start-Process\s+npm\b/i,
  /powershell(?:\.exe)?[^"\n\r]*(npm\s+run|npm\.ps1)/i,
  /pwsh(?:\.exe)?[^"\n\r]*(npm\s+run|npm\.ps1)/i,
]

test('repo automation docs avoid PowerShell npm launch anti-patterns', () => {
  const offenders = []
  for (const filePath of walk(repoRoot)) {
    const text = readFileSync(filePath, 'utf8')
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text)) {
        offenders.push(path.relative(repoRoot, filePath))
        break
      }
    }
  }

  assert.deepEqual(offenders, [])
})

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      yield* walk(fullPath)
      continue
    }
    if (!entry.isFile()) continue
    const relativePath = path.relative(repoRoot, fullPath).replaceAll('\\', '/')
    if (ignoredRelativePrefixes.some((prefix) => relativePath.startsWith(prefix))) continue
    if (!checkedExtensions.has(path.extname(entry.name).toLowerCase())) continue
    if (statSync(fullPath).size > 2_000_000) continue
    yield fullPath
  }
}
