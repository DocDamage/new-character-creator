import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  describeRagIndexHealth,
  getHostedRagIndexUrl,
  validateHostedRagIndex,
} from '../../src/ragHealth.ts'

test('hosted RAG health accepts a populated public index', () => {
  const health = validateHostedRagIndex({
    format: 'pixel_creator_rag_index',
    version: 1,
    generated_at: '2026-05-19T04:00:00.000Z',
    document_count: 3,
    chunk_count: 12,
    chunks: [],
  }, { now: new Date('2026-05-19T05:00:00.000Z') })

  assert.equal(health.ready, true)
  assert.equal(health.severity, 'ready')
  assert.match(describeRagIndexHealth(health), /12 knowledge chunk/)
})

test('hosted RAG health rejects empty, stale, and malformed indexes', () => {
  const now = new Date('2026-05-19T05:00:00.000Z')

  assert.equal(validateHostedRagIndex(null, { now }).ready, false)
  assert.equal(validateHostedRagIndex({
    format: 'pixel_creator_rag_index',
    version: 1,
    generated_at: '2026-05-19T04:00:00.000Z',
    document_count: 0,
    chunk_count: 0,
    chunks: [],
  }, { now }).severity, 'error')
  assert.equal(validateHostedRagIndex({
    format: 'pixel_creator_rag_index',
    version: 1,
    generated_at: '2026-04-01T04:00:00.000Z',
    document_count: 3,
    chunk_count: 12,
    chunks: [],
  }, { now, staleAfterDays: 14 }).severity, 'warning')
})

test('hosted RAG URL respects Vite base paths used by GitHub Pages', () => {
  assert.equal(getHostedRagIndexUrl('/sprite-character-creator/'), '/sprite-character-creator/data/rag/knowledge_index.json')
  assert.equal(getHostedRagIndexUrl('/'), '/data/rag/knowledge_index.json')
})

test('hosted RAG check script validates the published static index', () => {
  const result = spawnSync(process.execPath, ['tools/check-hosted-rag-index.js'], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Hosted RAG index is ready/)
})
