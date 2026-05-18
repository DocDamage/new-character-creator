# AI And RAG System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the app's AI workflow from manual generation handoff into a review-safe AI orchestration system with a local RAG knowledge layer for better prompts, provider decisions, asset context, and troubleshooting.

**Architecture:** Keep AI optional per asset but first-class in the app. Add a local knowledge index that retrieves relevant project, LPC, APES, training, manifest, and provider context, then attach that context to generation jobs and AI/APES guidance without auto-mutating user assets.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Node tools, localStorage persistence, JSON knowledge index files, optional provider adapters, Node test runner, Playwright regression tests.

---

## Current System Map

The current app already has the right safety spine:

- `src/generationJobs.ts` creates generation jobs from missing-animation queue items.
- `src/screens/ApesLabPanel.tsx` exposes APES jobs, missing-animation queue actions, generation handoff downloads, and training inbox/library controls.
- `src/types.ts` defines `AiProviderConfig`, `GenerationJob`, training records, APES reports, and export-blocking review gates.
- `src/appPersistence.ts` persists provider config and generation jobs.
- `src/screens/ExportsPanel.tsx` blocks release export when generated output is unreviewed.
- `docs/pixellab-mcp.md` documents PixelLab as a manual/future provider.
- `tools/localToolsServer.ts` exposes local-only APES and asset routes behind loopback and token checks.

This plan builds on that instead of replacing it.

## Product Decisions

AI must stay explicit and review-gated:

- AI runs are started by the user.
- AI output never overwrites LPC, Duelyst, APES, or checked-in source assets.
- Generated frames are never selected automatically.
- Generated output cannot enter release exports until reviewed.
- RAG can suggest, enrich prompts, explain decisions, and prepare payloads, but it cannot silently change recipes or part selections.

RAG should answer practical project questions:

- Which source frames, catalog items, credits, and warnings matter for this generation job?
- What APES/LPC/training docs apply to this asset?
- What prompt context should PixelLab or a future provider receive?
- Which existing approved parts or training records are closest to this missing animation?
- What release blockers or review gates apply before export?

## File Structure

Create:

- `src/ragTypes.ts`: shared RAG document, chunk, query, retrieval result, and context bundle types.
- `src/ragIndex.ts`: pure index builder/query helpers for deterministic local retrieval.
- `src/aiContext.ts`: builds prompt context bundles for generation jobs from retrieved RAG chunks.
- `tools/build-rag-index.js`: Node CLI that builds `data/rag/knowledge_index.json` from docs, manifests, catalog summaries, APES inventories, and training records.
- `tests/tools/rag-index.test.mjs`: unit coverage for chunking, scoring, source allowlists, and context bundle output.
- `docs/ai-rag-system.md`: operator documentation for building the index and using RAG-backed AI handoff.

Modify:

- `package.json`: add `rag:index` script.
- `src/types.ts`: extend `GenerationJob` and provider types with RAG context metadata.
- `src/generationJobs.ts`: attach RAG context to jobs when provided.
- `src/appPersistence.ts`: add safe persistence for RAG settings if needed.
- `src/screens/ApesLabPanel.tsx`: add AI Knowledge status, query preview, and generation-job context summary.
- `src/App.tsx`: load RAG index, pass context helpers into APES Lab, and include RAG context when creating generation jobs.
- `tools/localToolsServer.ts`: optionally expose local-only RAG index build/load route after the file-based CLI is stable.
- `tests/browser/regression.spec.ts`: verify RAG status and generation job context surface.
- `README.md`: add the short operator path after implementation.

## Phase 1: Define The RAG Contract

### Task 1: Add RAG Types

**Files:**
- Create: `src/ragTypes.ts`
- Modify: `src/types.ts`
- Test: `tests/tools/rag-index.test.mjs`

- [ ] **Step 1: Write the failing type/import smoke test**

Create `tests/tools/rag-index.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRagIndex,
  queryRagIndex,
  buildRagContextBundle,
} from '../../src/ragIndex.ts'

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
```

Run: `npm run test:tools -- tests/tools/rag-index.test.mjs`

Expected: FAIL because `src/ragIndex.ts` does not exist.

- [ ] **Step 2: Add shared RAG types**

Create `src/ragTypes.ts`:

```ts
export type RagSourceType =
  | 'doc'
  | 'readme'
  | 'lpc_catalog'
  | 'asset_manifest'
  | 'apes_inventory'
  | 'training_record'
  | 'generation_job'

export type RagSourceDocument = {
  source_id: string
  source_type: RagSourceType
  title: string
  uri: string
  text: string
  metadata: Record<string, string | number | boolean | null>
}

export type RagChunk = {
  chunk_id: string
  source_id: string
  source_type: RagSourceType
  title: string
  uri: string
  text: string
  token_estimate: number
  terms: string[]
  metadata: Record<string, string | number | boolean | null>
}

export type RagIndex = {
  format: 'pixel_creator_rag_index'
  version: 1
  generated_at: string
  document_count: number
  chunk_count: number
  chunks: RagChunk[]
}

export type RagQuery = {
  query: string
  limit?: number
  sourceTypes?: RagSourceType[]
  metadataFilters?: Record<string, string | number | boolean>
}

export type RagSearchResult = {
  chunk: RagChunk
  score: number
  matched_terms: string[]
}

export type RagContextPurpose = 'generation_prompt' | 'provider_selection' | 'review_guidance' | 'troubleshooting'

export type RagContextBundle = {
  purpose: RagContextPurpose
  query: string
  context_text: string
  chunks: RagSearchResult[]
  citations: Array<{
    source_id: string
    title: string
    uri: string
  }>
}
```

- [ ] **Step 3: Extend generation job provenance**

In `src/types.ts`, import the context type:

```ts
import type { RagContextBundle } from './ragTypes'
```

Add this optional property to `GenerationJob`:

```ts
  rag_context?: RagContextBundle
```

Run: `npm run test:tools -- tests/tools/rag-index.test.mjs`

Expected: still FAIL because the implementation does not exist.

### Task 2: Implement Deterministic Local Retrieval

**Files:**
- Create: `src/ragIndex.ts`
- Test: `tests/tools/rag-index.test.mjs`

- [ ] **Step 1: Implement the pure index/query helpers**

Create `src/ragIndex.ts`:

```ts
import type { RagContextBundle, RagIndex, RagQuery, RagSearchResult, RagSourceDocument, RagSourceType } from './ragTypes'

const defaultChunkCharLimit = 900
const defaultQueryLimit = 6

export function buildRagIndex(documents: RagSourceDocument[], options: { generatedAt?: string } = {}): RagIndex {
  const chunks = documents.flatMap((document) => chunkDocument(document))
  return {
    format: 'pixel_creator_rag_index',
    version: 1,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    document_count: documents.length,
    chunk_count: chunks.length,
    chunks,
  }
}

export function queryRagIndex(index: RagIndex, query: RagQuery): RagSearchResult[] {
  const queryTerms = normalizeTerms(query.query)
  if (queryTerms.length === 0) return []
  const allowedTypes = new Set<RagSourceType>(query.sourceTypes ?? [])

  return index.chunks
    .filter((chunk) => allowedTypes.size === 0 || allowedTypes.has(chunk.source_type))
    .filter((chunk) => matchesMetadataFilters(chunk.metadata, query.metadataFilters ?? {}))
    .map((chunk) => {
      const matchedTerms = Array.from(new Set(queryTerms.filter((term) => chunk.terms.includes(term))))
      const titleBoost = normalizeTerms(chunk.title).filter((term) => queryTerms.includes(term)).length * 3
      const metadataBoost = Object.values(chunk.metadata).join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((term) => queryTerms.includes(term)).length
      return {
        chunk,
        score: matchedTerms.length * 10 + titleBoost + metadataBoost,
        matched_terms: matchedTerms,
      }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.chunk_id.localeCompare(right.chunk.chunk_id))
    .slice(0, query.limit ?? defaultQueryLimit)
}

export function buildRagContextBundle(index: RagIndex, query: RagQuery & { purpose: RagContextBundle['purpose'] }): RagContextBundle {
  const chunks = queryRagIndex(index, query)
  const contextText = chunks
    .map((result, index) => `[${index + 1}] ${result.chunk.title}\n${result.chunk.text}`)
    .join('\n\n')

  return {
    purpose: query.purpose,
    query: query.query,
    context_text: contextText,
    chunks,
    citations: chunks.map((result) => ({
      source_id: result.chunk.source_id,
      title: result.chunk.title,
      uri: result.chunk.uri,
    })),
  }
}

function chunkDocument(document: RagSourceDocument) {
  const paragraphs = document.text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph
    if (next.length > defaultChunkCharLimit && current) {
      chunks.push(current)
      current = paragraph
    } else {
      current = next
    }
  }
  if (current) chunks.push(current)

  return chunks.map((text, index) => ({
    chunk_id: `${document.source_id}#${String(index + 1).padStart(3, '0')}`,
    source_id: document.source_id,
    source_type: document.source_type,
    title: document.title,
    uri: document.uri,
    text,
    token_estimate: Math.ceil(text.length / 4),
    terms: normalizeTerms(`${document.title} ${text} ${Object.values(document.metadata).join(' ')}`),
    metadata: document.metadata,
  }))
}

function normalizeTerms(value: string) {
  return Array.from(new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3),
  ))
}

function matchesMetadataFilters(metadata: Record<string, string | number | boolean | null>, filters: Record<string, string | number | boolean>) {
  return Object.entries(filters).every(([key, value]) => metadata[key] === value)
}
```

- [ ] **Step 2: Run the focused test**

Run: `npm run test:tools -- tests/tools/rag-index.test.mjs`

Expected: PASS for the new RAG retrieval tests.

- [ ] **Step 3: Run the existing generation job tests**

Run: `npm run test:tools -- tests/tools/generation-jobs.test.mjs`

Expected: PASS, proving the optional `rag_context` field did not disturb current jobs.

- [ ] **Step 4: Commit**

```bash
git add src/ragTypes.ts src/ragIndex.ts src/types.ts tests/tools/rag-index.test.mjs
git commit -m "Add local RAG retrieval primitives"
```

## Phase 2: Build A Local Knowledge Index

### Task 3: Add The RAG Index CLI

**Files:**
- Create: `tools/build-rag-index.js`
- Modify: `package.json`
- Test: `tests/tools/rag-index.test.mjs`

- [ ] **Step 1: Extend tests to execute the CLI**

Append to `tests/tools/rag-index.test.mjs`:

```js
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ragOutputPath = path.join(repoRoot, 'data', 'rag', 'knowledge_index.json')

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
```

Run: `npm run test:tools -- tests/tools/rag-index.test.mjs`

Expected: FAIL because `tools/build-rag-index.js` does not exist.

- [ ] **Step 2: Add CLI script**

Create `tools/build-rag-index.js`:

```js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRagIndex } from '../src/ragIndex.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(repoRoot, 'data', 'rag', 'knowledge_index.json')
const limitDocsArgIndex = process.argv.indexOf('--limit-docs')
const limitDocs = limitDocsArgIndex >= 0 ? Number(process.argv[limitDocsArgIndex + 1]) || Infinity : Infinity

const sourceSpecs = [
  { source_type: 'readme', path: 'README.md', title: 'README' },
  { source_type: 'doc', path: 'docs/pixellab-mcp.md', title: 'PixelLab MCP animation bridge' },
  { source_type: 'doc', path: 'docs/apes-lpc-intake.md', title: 'APES LPC Intake' },
  { source_type: 'doc', path: 'docs/apes-gpu-rebuild.md', title: 'APES GPU Rebuild Runbook' },
  { source_type: 'doc', path: 'docs/release-readiness.md', title: 'Release Readiness' },
  { source_type: 'doc', path: 'docs/browser-checks.md', title: 'Browser Checks' },
  { source_type: 'asset_manifest', path: 'public/data/manifests/characters.json', title: 'Public Character Manifest' },
  { source_type: 'lpc_catalog', path: 'data/lpc/lpc_catalog.json', title: 'Local LPC Catalog' },
  { source_type: 'apes_inventory', path: 'data/apes/output/apes_output_inventory.json', title: 'APES Output Inventory' },
]

const documents = []
for (const spec of sourceSpecs) {
  if (documents.length >= limitDocs) break
  const absolutePath = path.join(repoRoot, spec.path)
  if (!fs.existsSync(absolutePath)) continue
  const raw = fs.readFileSync(absolutePath, 'utf8')
  documents.push({
    source_id: spec.path.replaceAll('\\', '/'),
    source_type: spec.source_type,
    title: spec.title,
    uri: spec.path.replaceAll('\\', '/'),
    text: normalizeSourceText(raw, spec.path),
    metadata: {
      path: spec.path.replaceAll('\\', '/'),
      workflow: inferWorkflow(spec.path),
    },
  })
}

const index = buildRagIndex(documents)
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(`Wrote ${index.chunk_count} RAG chunk(s) from ${index.document_count} source document(s) to ${path.relative(repoRoot, outputPath)}.`)

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

function inferWorkflow(sourcePath) {
  if (sourcePath.includes('apes')) return 'apes'
  if (sourcePath.includes('lpc')) return 'lpc'
  if (sourcePath.includes('pixellab')) return 'ai_generation'
  if (sourcePath.includes('release')) return 'release'
  return 'general'
}
```

- [ ] **Step 3: Add npm script**

In `package.json`, add:

```json
"rag:index": "node tools/build-rag-index.js"
```

Place it near the other local asset scripts.

- [ ] **Step 4: Run the CLI and test**

Run:

```bash
npm run rag:index
npm run test:tools -- tests/tools/rag-index.test.mjs
```

Expected: PASS and `data/rag/knowledge_index.json` exists locally.

- [ ] **Step 5: Commit**

```bash
git add package.json tools/build-rag-index.js tests/tools/rag-index.test.mjs
git commit -m "Add local RAG index builder"
```

## Phase 3: Attach RAG Context To Generation Jobs

### Task 4: Add AI Context Builder

**Files:**
- Create: `src/aiContext.ts`
- Modify: `src/generationJobs.ts`
- Test: `tests/tools/generation-jobs.test.mjs`

- [ ] **Step 1: Add failing generation context test**

Append to `tests/tools/generation-jobs.test.mjs`:

```js
import { buildAiGenerationContextQuery } from '../../src/aiContext.ts'

test('AI generation context query includes queue item and target details', () => {
  const queue = makeQueue()
  const query = buildAiGenerationContextQuery(queue.items[0], {
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
  })

  assert.match(query, /Long hair/)
  assert.match(query, /run/)
  assert.match(query, /standard_64/)
})
```

Run: `npm run test:tools -- tests/tools/generation-jobs.test.mjs`

Expected: FAIL because `src/aiContext.ts` does not exist.

- [ ] **Step 2: Implement query builder**

Create `src/aiContext.ts`:

```ts
import type { MissingAnimationQueueItem } from './missingAnimationQueue'

export function buildAiGenerationContextQuery(
  item: MissingAnimationQueueItem,
  options: { characterId: string; targetProfile: string },
) {
  return [
    'AI generation context for missing animation layer',
    `Character: ${options.characterId}`,
    `Target profile: ${options.targetProfile}`,
    `Item: ${item.item_name} ${item.item_id}`,
    `Layer: ${item.layer_id}`,
    `Animation: ${item.requested_animation}`,
    `Body: ${item.body_type}`,
    `Warnings: ${item.warnings.join('; ')}`,
    'Need provider prompt guidance, review requirements, compatible LPC/APES context, and release blockers.',
  ].filter(Boolean).join('\n')
}
```

- [ ] **Step 3: Let job creation accept RAG context**

In `src/generationJobs.ts`, import:

```ts
import type { RagContextBundle } from './ragTypes.ts'
```

Extend `CreateGenerationJobsOptions`:

```ts
  contextForItem?: (item: MissingAnimationQueueItem) => RagContextBundle | undefined
```

Inside each returned job, add:

```ts
      rag_context: options.contextForItem?.(item),
```

- [ ] **Step 4: Add focused assertion**

Append to the first generation job test:

```js
  const [contextJob] = createGenerationJobsFromMissingAnimationQueue(makeQueue(), {
    recipeId: 'recipe_1',
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
    now: '2026-05-18T12:00:00.000Z',
    contextForItem: () => ({
      purpose: 'generation_prompt',
      query: 'Long hair run',
      context_text: 'Generated output must be reviewed before release.',
      chunks: [],
      citations: [{ source_id: 'docs/pixellab-mcp.md', title: 'PixelLab MCP animation bridge', uri: 'docs/pixellab-mcp.md' }],
    }),
  })

  assert.match(contextJob.rag_context.context_text, /reviewed/)
```

Run: `npm run test:tools -- tests/tools/generation-jobs.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/aiContext.ts src/generationJobs.ts tests/tools/generation-jobs.test.mjs
git commit -m "Attach RAG context to generation jobs"
```

## Phase 4: Surface RAG In APES Lab

### Task 5: Load The Index And Show AI Knowledge Status

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/screens/ApesLabPanel.tsx`
- Test: `tests/browser/regression.spec.ts`

- [ ] **Step 1: Add browser expectation**

In `tests/browser/regression.spec.ts`, add assertions to the APES Lab flow:

```ts
await page.getByRole('button', { name: 'APES Lab' }).click()
await expect(page.getByTestId('ai-knowledge-status')).toBeVisible()
await expect(page.getByTestId('ai-knowledge-status')).toContainText(/AI Knowledge|RAG/)
```

Run: `npm run test:browser -- tests/browser/regression.spec.ts`

Expected: FAIL until the UI exists.

- [ ] **Step 2: Add index state to App**

In `src/App.tsx`, import:

```ts
import { buildRagContextBundle } from './ragIndex'
import type { RagIndex } from './ragTypes'
import { buildAiGenerationContextQuery } from './aiContext'
```

Add state:

```ts
  const [ragIndex, setRagIndex] = useState<RagIndex | null>(null)
  const [ragStatus, setRagStatus] = useState('RAG index not loaded. Run npm run rag:index to build local AI knowledge.')
```

Add effect:

```ts
  useEffect(() => {
    const controller = new AbortController()
    fetch('/data/rag/knowledge_index.json', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return
        const payload = await response.json() as RagIndex
        if (payload?.format === 'pixel_creator_rag_index') {
          setRagIndex(payload)
          setRagStatus(`RAG index loaded with ${payload.chunk_count} knowledge chunk(s).`)
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])
```

- [ ] **Step 3: Use RAG when creating generation jobs**

In `createGenerationJobsFromQueue`, pass:

```ts
      contextForItem: ragIndex
        ? (item) => buildRagContextBundle(ragIndex, {
            purpose: 'generation_prompt',
            query: buildAiGenerationContextQuery(item, {
              characterId: selected.character_id,
              targetProfile: exportTargetProfile,
            }),
            limit: 5,
          })
        : undefined,
```

- [ ] **Step 4: Pass RAG status to APES Lab**

Add props:

```ts
  ragStatus={ragStatus}
  ragIndex={ragIndex}
```

Update `ApesLabPanelProps`:

```ts
  ragStatus: string
  ragIndex: RagIndex | null
```

Import `RagIndex` in `ApesLabPanel.tsx`.

- [ ] **Step 5: Render AI Knowledge card**

In `ApesLabPanel.tsx`, near the manual generation handoff card:

```tsx
      <div className="settings-card" data-testid="ai-knowledge-status">
        <strong>AI Knowledge</strong>
        <span>{ragStatus}</span>
        {ragIndex ? <span>{ragIndex.document_count} source document(s), {ragIndex.chunk_count} retrievable chunk(s).</span> : null}
        <code>RAG context enriches generation jobs with project docs, LPC/APES rules, provider handoff notes, and release review requirements.</code>
      </div>
```

- [ ] **Step 6: Show context on each generation job**

Inside the generation job card:

```tsx
            {job.rag_context ? (
              <code>{job.rag_context.citations.map((citation) => `${citation.title}: ${citation.uri}`).join('\n')}</code>
            ) : null}
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test:tools -- tests/tools/generation-jobs.test.mjs tests/tools/rag-index.test.mjs
npm run test:browser -- tests/browser/regression.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/screens/ApesLabPanel.tsx tests/browser/regression.spec.ts
git commit -m "Surface RAG context in APES Lab"
```

## Phase 5: Provider Configuration And Future Adapters

### Task 6: Make Provider Configuration Explicit

**Files:**
- Modify: `src/types.ts`
- Modify: `src/generationJobs.ts`
- Modify: `src/screens/SettingsPanel.tsx`
- Modify: `src/screens/ApesLabPanel.tsx`
- Test: `tests/tools/generation-jobs.test.mjs`

- [ ] **Step 1: Add provider capability fields**

Extend `AiProviderConfig` in `src/types.ts`:

```ts
  capabilities?: {
    text_to_sprite: boolean
    image_to_animation: boolean
    animation_cleanup: boolean
    direct_api: boolean
    mcp_available: boolean
  }
```

Update `defaultAiProviderConfig` in `src/generationJobs.ts`:

```ts
  capabilities: {
    text_to_sprite: false,
    image_to_animation: false,
    animation_cleanup: false,
    direct_api: false,
    mcp_available: false,
  },
```

- [ ] **Step 2: Add provider config tests**

In `tests/tools/generation-jobs.test.mjs`, add:

```js
test('default provider is explicit manual handoff without direct API', () => {
  const [job] = createGenerationJobsFromMissingAnimationQueue(makeQueue(), {
    recipeId: 'recipe_1',
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
    now: '2026-05-18T12:00:00.000Z',
  })

  assert.equal(job.provider.type, 'manual_handoff')
  assert.equal(job.provider.capabilities.direct_api, false)
  assert.equal(job.provider.manual_handoff.enabled, true)
})
```

Run: `npm run test:tools -- tests/tools/generation-jobs.test.mjs`

Expected: PASS.

- [ ] **Step 3: Add settings copy**

In `SettingsPanel.tsx`, show a provider status card with:

```tsx
        <strong>AI provider</strong>
        <span>Default mode is manual handoff. Configure PixelLab or another provider outside the repo; never commit provider tokens.</span>
```

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/generationJobs.ts src/screens/SettingsPanel.tsx src/screens/ApesLabPanel.tsx tests/tools/generation-jobs.test.mjs
git commit -m "Clarify AI provider capabilities"
```

## Phase 6: Output Intake And Review Loop

### Task 7: Add Reviewed AI Output Intake Contract

**Files:**
- Create: `src/aiOutputIntake.ts`
- Modify: `src/types.ts`
- Test: `tests/tools/generation-jobs.test.mjs`

- [ ] **Step 1: Add failing intake test**

Append to `tests/tools/generation-jobs.test.mjs`:

```js
import { markGenerationOutputImportedForReview } from '../../src/aiOutputIntake.ts'

test('imported AI output moves job to review required without release approval', () => {
  const [job] = createGenerationJobsFromMissingAnimationQueue(makeQueue(), {
    recipeId: 'recipe_1',
    characterId: 'lpc-body',
    targetProfile: 'standard_64',
    now: '2026-05-18T12:00:00.000Z',
  })

  const updated = markGenerationOutputImportedForReview(job, {
    outputId: job.outputs[0].output_id,
    uri: 'data/generated/job/output.png',
    importedAt: '2026-05-18T12:10:00.000Z',
  })

  assert.equal(updated.status, 'review_required')
  assert.equal(updated.outputs[0].uri, 'data/generated/job/output.png')
  assert.equal(updated.outputs[0].reviewed, false)
  assert.equal(updated.review_gate.release_blocked, true)
})
```

Run: `npm run test:tools -- tests/tools/generation-jobs.test.mjs`

Expected: FAIL because `src/aiOutputIntake.ts` does not exist.

- [ ] **Step 2: Implement intake transition**

Create `src/aiOutputIntake.ts`:

```ts
import type { GenerationJob } from './types'

export function markGenerationOutputImportedForReview(
  job: GenerationJob,
  options: { outputId: string; uri: string; importedAt: string },
): GenerationJob {
  return {
    ...job,
    updated_at: options.importedAt,
    status: 'review_required',
    outputs: job.outputs.map((output) => output.output_id === options.outputId
      ? {
          ...output,
          uri: options.uri,
          reviewed: false,
          release_blocked: true,
        }
      : output),
    review_gate: {
      ...job.review_gate,
      status: 'ready_for_review',
      release_blocked: true,
    },
    logs: [...job.logs, `Output ${options.outputId} imported for review at ${options.importedAt}.`],
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test:tools -- tests/tools/generation-jobs.test.mjs`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/aiOutputIntake.ts tests/tools/generation-jobs.test.mjs
git commit -m "Add AI output review intake transition"
```

## Phase 7: Documentation And Release Gate

### Task 8: Document The AI/RAG Workflow

**Files:**
- Create: `docs/ai-rag-system.md`
- Modify: `README.md`
- Modify: `docs/browser-checks.md`

- [ ] **Step 1: Add operator doc**

Create `docs/ai-rag-system.md`:

```md
# AI And RAG System

The app uses AI as an explicit, review-gated workflow. Users can compose, edit, review, and export without running AI, but the AI/APES tab can prepare generation jobs for missing animation layers and enrich those jobs with local RAG context.

## Build The Knowledge Index

Run:

```bash
npm run rag:index
```

This writes `data/rag/knowledge_index.json` from project docs, release notes, APES notes, LPC catalog summaries, manifests, and local APES inventory when present.

## Use RAG Context

1. Open APES Lab.
2. Confirm AI Knowledge reports a loaded index.
3. Build or select an LPC catalog-backed recipe with missing or unsupported animation records.
4. Click Create generation jobs from queue.
5. Download the handoff JSON or individual job JSON.
6. Send the prompt, references, and cited context to PixelLab or another provider.
7. Import generated output for review.
8. Approve reviewed output before release export.

## Safety Rules

- AI runs are user-started.
- Generated output is not selected automatically.
- Generated output cannot overwrite upstream assets.
- Release export remains blocked until review is approved.
- Provider tokens stay outside the repo.
```

- [ ] **Step 2: Add README pointer**

Add a short section to `README.md`:

```md
## AI And RAG

Run `npm run rag:index` to build the local AI knowledge index. APES Lab uses that index to attach project, APES, LPC, provider, and release-review context to generation jobs. Generated output remains blocked from release until reviewed.
```

- [ ] **Step 3: Update browser checks**

In `docs/browser-checks.md`, add:

```md
- APES Lab shows AI Knowledge/RAG status and generation jobs include cited context when a local index is available.
```

- [ ] **Step 4: Commit**

```bash
git add docs/ai-rag-system.md README.md docs/browser-checks.md
git commit -m "Document AI RAG workflow"
```

### Task 9: Add Release Verification

**Files:**
- Modify: `package.json`
- Modify: `tools/check-source-hygiene.js` or add `tools/check-rag-index.js`
- Test: `npm run release:check`

- [ ] **Step 1: Decide release behavior**

Do not require `data/rag/knowledge_index.json` for public release builds, because it may include local private context. Instead, release checks should verify:

- RAG code compiles.
- No provider tokens are committed.
- Generated output remains release-blocked until reviewed.

- [ ] **Step 2: Add source hygiene check for provider secrets**

Extend `tools/check-source-hygiene.js` to fail if committed source contains obvious provider token names in public files:

```js
const forbiddenSecretPatterns = [
  /PIXELLAB_API_KEY\s*=/i,
  /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/i,
]
```

Scan only checked-in text paths, excluding `package-lock.json`.

- [ ] **Step 3: Run gates**

Run:

```bash
npm run lint
npm run test:tools
npm run build:release
npm run release:check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/check-source-hygiene.js package.json
git commit -m "Guard AI provider secrets in release checks"
```

## Phase 8: Later Provider Automation

These are deliberate follow-up projects after the local RAG and manual handoff path is stable:

- PixelLab MCP connector: keep tokens outside the repo and call it through the user's configured assistant/MCP environment, not through checked-in frontend code.
- Local provider adapter route: add a loopback-only `__local/ai-tools` route that prepares provider payloads and records logs, protected by the same token model as APES/local asset routes.
- Embedding index: add optional semantic embeddings for RAG once deterministic retrieval has proven useful. Store embeddings only in ignored `data/rag/` local files.
- Similarity search over images: add perceptual hash or CLIP-like local metadata for finding visually similar approved parts and training records.
- Prompt evaluation harness: save prompt/context/output/review records so the training library can improve provider prompts over time.

## Verification Matrix

Run these after the full plan:

```bash
npm run rag:index
npm run lint
npm run test:tools
npm run build:release
npm run test:browser
npm run release:check
```

Expected final state:

- APES Lab shows AI Knowledge status.
- Missing-animation generation jobs include cited RAG context.
- Manual handoff remains usable without a provider token.
- RAG index build is local and reproducible.
- Release exports stay blocked by unreviewed generated output.
- Public release builds do not require private RAG files.

## Self-Review

Spec coverage:

- AI improvement is covered by provider config, generation context, output intake, and review gates.
- RAG is covered by types, deterministic retrieval, local CLI index, UI status, and generation-job context.
- Existing safety rules are preserved by review gates and release-block behavior.

Placeholder scan:

- No task depends on unspecified implementation.
- Follow-up provider automation is explicitly out of scope for this implementation plan.

Type consistency:

- `RagContextBundle` is defined in `src/ragTypes.ts` and referenced by `GenerationJob`.
- `buildRagContextBundle` returns the same shape stored in generation jobs.
- `contextForItem` accepts a `MissingAnimationQueueItem`, matching `createGenerationJobsFromMissingAnimationQueue`.
