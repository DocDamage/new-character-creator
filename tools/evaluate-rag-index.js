import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRagContextBundle } from '../src/ragIndex.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const indexPath = path.join(repoRoot, 'data', 'rag', 'knowledge_index.json')
const evalPath = path.join(repoRoot, 'data', 'rag', 'eval_queries.json')
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
const evals = JSON.parse(fs.readFileSync(evalPath, 'utf8'))

const results = evals.map((item) => {
  const bundle = buildRagContextBundle(index, { query: item.query, purpose: 'evaluation', limit: 8 })
  const sourceIds = new Set(bundle.citations.map((citation) => citation.source_id || citation.uri))
  const text = JSON.stringify(bundle).toLowerCase()
  const missingSourceIds = item.expected_source_ids.filter((sourceId) => !sourceIds.has(sourceId))
  const missingTerms = item.expected_terms.filter((term) => !text.includes(term.toLowerCase()))
  return {
    query_id: item.query_id,
    passed: missingSourceIds.length === 0 && missingTerms.length === 0,
    score: 1 - ((missingSourceIds.length + missingTerms.length) / (item.expected_source_ids.length + item.expected_terms.length)),
    matched_source_ids: item.expected_source_ids.filter((sourceId) => sourceIds.has(sourceId)),
    missing_source_ids: missingSourceIds,
    matched_terms: item.expected_terms.filter((term) => text.includes(term.toLowerCase())),
    missing_terms: missingTerms,
  }
})

const failed = results.filter((result) => !result.passed)
console.log(JSON.stringify({ passed: failed.length === 0, results }, null, 2))
if (failed.length > 0) process.exit(1)
