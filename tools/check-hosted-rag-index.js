import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeRagIndexHealth, validateHostedRagIndex } from '../src/ragHealth.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const indexPath = path.join(repoRoot, 'public', 'data', 'rag', 'knowledge_index.json')

try {
  const payload = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  const health = validateHostedRagIndex(payload)
  console.log(describeRagIndexHealth(health))
  if (!health.ready || health.severity === 'warning') {
    process.exitCode = 1
  }
} catch (error) {
  console.error(`Hosted RAG index check failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
