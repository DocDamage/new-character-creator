import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildRagIndex,
  queryRagIndex,
  buildRagContextBundle,
} from '../../src/ragIndex.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ragOutputPath = path.join(repoRoot, 'data', 'rag', 'knowledge_index.json')

test('RAG index retrieves project context by query terms', () => {
  const index = buildRagIndex([
    {
      source_id: 'docs/pixellab-mcp.md',
      source_type: 'doc',
      title: 'PixelLab MCP animation bridge',
      uri: 'docs/pixellab-mcp.md',
      text: 'PixelLab can generate missing animation layers. Generated output must be reviewed before release.',
      metadata: { workflow: 'ai_generation' },
    },
    {
      source_id: 'docs/apes-lpc-intake.md',
      source_type: 'doc',
      title: 'APES LPC Intake',
      uri: 'docs/apes-lpc-intake.md',
      text: 'LPC metadata should be preferred over APES for canonical LPC sheets.',
      metadata: { workflow: 'lpc' },
    },
  ], { generatedAt: '2026-05-18T12:00:00.000Z' })

  const results = queryRagIndex(index, {
    query: 'PixelLab missing animation review release',
    limit: 3,
  })

  assert.equal(results[0].chunk.source_id, 'docs/pixellab-mcp.md')
  assert.ok(results[0].score > 0)
})

test('RAG context bundle caps chunks and records citations', () => {
  const index = buildRagIndex([
    {
      source_id: 'docs/pixellab-mcp.md',
      source_type: 'doc',
      title: 'PixelLab MCP animation bridge',
      uri: 'docs/pixellab-mcp.md',
      text: 'PixelLab generated assets must return through manual review.',
      metadata: {},
    },
  ], { generatedAt: '2026-05-18T12:00:00.000Z' })

  const bundle = buildRagContextBundle(index, {
    query: 'generated assets review',
    limit: 2,
    purpose: 'generation_prompt',
  })

  assert.equal(bundle.purpose, 'generation_prompt')
  assert.equal(bundle.chunks.length, 1)
  assert.equal(bundle.citations[0].source_id, 'docs/pixellab-mcp.md')
  assert.match(bundle.context_text, /manual review/)
})

test('RAG index CLI writes a local knowledge index', () => {
  rmSync(ragOutputPath, { force: true })

  const result = spawnSync(process.execPath, ['tools/build-rag-index.js', '--limit-docs', '4'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(existsSync(ragOutputPath), true)

  const payload = JSON.parse(readFileSync(ragOutputPath, 'utf8'))
  assert.equal(payload.format, 'pixel_creator_rag_index')
  assert.ok(payload.chunk_count > 0)
})
