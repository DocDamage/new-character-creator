# AAA Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the sprite character creator from a strong alpha into a production-ready, security-reviewed, license-audited, AI-assisted character production tool with reliable hosted assets, safe local integrations, measurable RAG quality, and repeatable release gates.

**Architecture:** Keep the GitHub Pages app static and safe by default, and move privileged operations into explicit local bridges or deployable backend/proxy services. Split work into independently shippable layers: asset/license compliance, secret handling, agent orchestration, local tool bridges, RAG quality, performance/memory, CI/release, and operational documentation.

**Tech Stack:** React 19, TypeScript, Vite, Playwright, Node.js tool scripts, local Vite middleware, IndexedDB, static GitHub Pages release bundle, optional local proxy/MCP bridges for provider calls, Aseprite, PixelLab, Ollama/LM Studio, and JSON-based asset/RAG manifests.

---

## Current Repo Notes

- User file maintenance is present and uncommitted:
  - Deleted loose root files under `assets/lpc sprite generator stuff/`.
  - Added `assets/lpc sprite generator stuff/Randoms/`.
  - Added missing per-folder `license.txt` files across LPC folders.
- Do not discard or overwrite those changes.
- Before any implementation task that touches LPC metadata, run:

```powershell
git status --short
npm run lpc:inventory
npm run lpc:catalog
npm run validate:release-package
```

- The current production release gate is:

```powershell
npm run release:check
```

---

## Target Production Definition

The app can be called production ready only when all of these are true:

- Hosted GitHub Pages build loads all public sprites, LPC catalog items, Duelyst staged assets, icons, manifests, and RAG index without local-only paths.
- Every shipped asset has machine-readable provenance and a nearby source license file.
- Release validation fails if a shipped asset lacks a license chain or if blocked files such as `.exe`, `.ps1`, `.bat`, `.cmd`, `.git`, caches, private manifests, or local absolute paths are emitted.
- AI chat can answer user requests, cite RAG context, request tool actions, and execute only approved tool calls.
- API keys are never stored in source, persisted browser storage, exported JSON, release bundles, logs, screenshots, or generated manifests.
- Direct provider calls happen through a trusted local proxy or backend, not from the public static browser app.
- Aseprite and PixelLab integrations are explicit, permissioned, loopback-only, path-allowlisted, and test-covered.
- RAG has an evaluation set, quality scores, regression tests, source attribution, chunk versioning, and retrieval telemetry.
- Long sessions with large asset catalogs stay within memory/performance budgets.
- CI runs lint, tests, build, release validation, secret scanning, license validation, and browser smoke tests on every PR.

---

## File Structure

### Asset And License Compliance

- Modify: `tools/build-lpc-local-inventory.js`
  - Read per-folder `license.txt`.
  - Attach `license_file`, `license_text_hash`, `license_scope`, and `source_folder` to each asset record.
  - Treat `Randoms/` as a real source folder, not an ignored loose-file bucket.
- Modify: `tools/build-lpc-catalog.js`
  - Preserve license metadata from inventory into catalog entries.
  - Fail or mark degraded records when license data is missing.
- Modify: `tools/validate-release-package.js`
  - Validate hosted LPC/Duelyst/static assets have provenance and license coverage.
  - Reject blocked executable/script/private files in `dist`.
- Modify: `tools/check-source-hygiene.js`
  - Reject tracked private files and blocked executables in source assets.
  - Allow expected per-folder `license.txt` files.
- Test: `tests/tools/lpc-inventory.test.mjs`
- Test: `tests/tools/lpc-catalog.test.mjs`
- Test: `tests/tools/release-package.test.mjs`
- Create: `docs/asset-license-audit.md`

### Secure Secret And Provider Architecture

- Modify: `src/aiWorkspace.ts`
  - Add provider capability metadata and provider route constraints.
  - Define which providers require proxy calls.
- Modify: `src/App.tsx`
  - Keep session secrets in volatile memory only.
  - Add a single in-memory secret registry interface.
- Modify: `src/screens/SettingsPanel.tsx`
  - Make secret state explicit: armed, never stored, clearable.
  - Add local proxy URL and provider health checks.
- Create: `src/aiSecretVault.ts`
  - Own in-memory secret lifecycle, redaction, and zero-persistence helpers.
- Create: `tests/tools/ai-secret-vault.test.mjs`
  - Verify redaction and serialization safety.
- Modify: `tests/browser/regression.spec.ts`
  - Verify typed sentinel secrets do not appear in localStorage, sessionStorage, downloads, or visible DOM after clearing.

### Agent Chat And Tool Permission System

- Modify: `src/screens/AIStudioPanel.tsx`
  - Upgrade from local reply builder to structured chat messages, tool proposals, approval buttons, and result display.
- Create: `src/aiAgent.ts`
  - Build requests, route providers, produce tool proposals, and apply approved tool results.
- Create: `src/aiToolRegistry.ts`
  - Register app tools with permission scopes and input schemas.
- Create: `src/aiToolSchemas.ts`
  - Define JSON schemas for tool inputs and outputs.
- Modify: `src/aiWorkspace.ts`
  - Keep lightweight helpers only; move orchestration to `aiAgent.ts`.
- Test: `tests/tools/ai-agent.test.mjs`
- Test: `tests/browser/regression.spec.ts`

### Local Proxy And Tool Bridges

- Modify: `tools/localToolsServer.ts`
  - Add loopback-only proxy endpoints under `/__local/ai/*`.
  - Add tool-call audit records under `/__local/audit`.
  - Keep request body limits and host checks.
- Create: `tools/localProxyProviders.ts`
  - Implement OpenAI-compatible, Anthropic, Gemini, Ollama, LM Studio, and PixelLab routing adapters.
- Create: `tools/toolAuditLog.ts`
  - Redacted append-only local JSONL audit writer.
- Create: `tools/asepriteBridge.ts`
  - Validate executable path, run allowlisted commands, export/import safe files only.
- Create: `tools/pixellabBridge.ts`
  - Validate endpoint/MCP settings and normalize generated sprite outputs.
- Test: `tests/tools/local-proxy.test.mjs`
- Test: `tests/tools/tool-audit-log.test.mjs`
- Test: `tools/check-preview-local-tools.js`

### AAA RAG System

- Modify: `src/ragTypes.ts`
  - Add chunk IDs, content hashes, source trust level, license tags, token estimates, and retrieval scores.
- Modify: `src/ragIndex.ts`
  - Add deterministic chunking, versioned embeddings metadata, lexical scoring, rerank hooks, and citation packing.
- Modify: `tools/build-rag-index.js`
  - Include docs, release notes, source manifests, LPC catalog summaries, license audit, APES reports, PixelLab docs, and Aseprite bridge docs.
- Create: `data/rag/eval_queries.json`
  - Store regression queries and expected citation/source families.
- Create: `tools/evaluate-rag-index.js`
  - Score recall, citation coverage, stale-source detection, and unsafe-context filtering.
- Test: `tests/tools/rag-index.test.mjs`
- Test: `tests/tools/rag-evaluation.test.mjs`
- Modify: `docs/ai-rag-system.md`
  - Document build, evaluation, and release acceptance.

### Performance And Memory

- Modify: `src/CompositeCanvas.tsx`
  - Keep bounded image cache and expose test-visible cache diagnostics in development/local-tools mode.
- Modify: `src/partAssetStore.ts`
  - Add storage compaction metrics and stale-object cleanup.
- Create: `src/performanceBudget.ts`
  - Define budgets for initial load, catalog search, render frame generation, export zip, and long session memory.
- Create: `tests/browser/performance.spec.ts`
  - Verify large catalog navigation, repeated render/export, and memory-sensitive flows.
- Create: `tools/run-memory-smoke.js`
  - Run Playwright flows and collect browser heap snapshots when available.
- Modify: `package.json`
  - Add `test:performance` and `test:memory` scripts.

### CI, Release, And Supply Chain

- Modify: `.github/workflows/release.yml`
  - Run license validation, source hygiene, release check, RAG evaluation, and secret scanning.
- Create: `.github/workflows/security.yml`
  - Run dependency audit, blocked file scan, and release artifact scan.
- Modify: `package.json`
  - Add `security:scan`, `license:audit`, `rag:evaluate`, and `production:check`.
- Create: `tools/scan-secrets.js`
  - Scan source, docs, public assets, dist, JSON manifests, logs, and generated exports for key-like patterns.
- Create: `tools/audit-licenses.js`
  - Produce `docs/asset-license-audit.md`.
- Test: `tests/tools/security-scan.test.mjs`
- Test: `tests/tools/license-audit.test.mjs`

### Production UX Polish

- Modify: `src/screens/AIStudioPanel.tsx`
  - Add provider status, tool approval cards, chat streaming placeholder, citations, failed action recovery, and export handoff buttons.
- Modify: `src/screens/SettingsPanel.tsx`
  - Add health checks for local LLM, Aseprite bridge, PixelLab endpoint, and local proxy.
- Modify: `src/screens/AssetAuditPanel.tsx`
  - Surface license readiness and blocked asset findings.
- Modify: `src/index.css`
  - Tighten dense production layout, chat/tool cards, status colors, and mobile behavior.
- Test: `tests/browser/regression.spec.ts`

---

## Task 1: Lock Down Asset And License Provenance

**Files:**
- Modify: `tools/build-lpc-local-inventory.js`
- Modify: `tools/build-lpc-catalog.js`
- Modify: `tools/validate-release-package.js`
- Modify: `tools/check-source-hygiene.js`
- Test: `tests/tools/lpc-inventory.test.mjs`
- Test: `tests/tools/lpc-catalog.test.mjs`
- Test: `tests/tools/release-package.test.mjs`
- Create: `docs/asset-license-audit.md`

- [ ] **Step 1: Capture current file maintenance state**

Run:

```powershell
git status --short
Get-ChildItem "assets/lpc sprite generator stuff" -Directory | Select-Object -ExpandProperty Name
Get-ChildItem "assets/lpc sprite generator stuff" -Recurse -Filter license.txt | Measure-Object
```

Expected:

```text
Deleted loose root LPC files are visible.
Randoms is visible.
Per-folder license.txt files are visible.
No .exe file is staged or tracked.
```

- [ ] **Step 2: Write inventory tests for folder license coverage**

Add test cases to `tests/tools/lpc-inventory.test.mjs`:

```js
test('LPC inventory attaches nearest folder license metadata', async () => {
  const inventory = await buildFixtureInventory({
    'assets/lpc sprite generator stuff/Randoms/license.txt': 'License: CC-BY-SA-3.0\nAuthor: LPC contributors\n',
    'assets/lpc sprite generator stuff/Randoms/man_white.png': 'png',
  })

  const randomBase = inventory.assets.find((asset) => asset.relative_path.endsWith('Randoms/man_white.png'))
  assert.ok(randomBase)
  assert.equal(randomBase.license_file, 'assets/lpc sprite generator stuff/Randoms/license.txt')
  assert.equal(randomBase.license_scope, 'folder')
  assert.match(randomBase.license_text_hash, /^[a-f0-9]{64}$/)
})

test('LPC inventory reports missing license metadata as a blocker', async () => {
  const inventory = await buildFixtureInventory({
    'assets/lpc sprite generator stuff/Unlicensed/item.png': 'png',
  })

  const item = inventory.assets.find((asset) => asset.relative_path.endsWith('Unlicensed/item.png'))
  assert.ok(item)
  assert.equal(item.license_status, 'missing')
  assert.ok(inventory.findings.some((finding) => finding.kind === 'missing_license'))
})
```

Run:

```powershell
npm run test:tools -- tests/tools/lpc-inventory.test.mjs
```

Expected: tests fail because license fields are not implemented yet.

- [ ] **Step 3: Implement nearest-license lookup in LPC inventory**

In `tools/build-lpc-local-inventory.js`, add helpers equivalent to:

```js
import crypto from 'node:crypto'

function findNearestLicense(assetAbsolutePath, rootAbsolutePath) {
  let cursor = path.dirname(assetAbsolutePath)
  while (cursor.startsWith(rootAbsolutePath)) {
    const licensePath = path.join(cursor, 'license.txt')
    if (fs.existsSync(licensePath)) {
      const text = fs.readFileSync(licensePath, 'utf8')
      return {
        license_file: path.relative(repoRoot, licensePath).replaceAll('\\', '/'),
        license_scope: cursor === path.dirname(assetAbsolutePath) ? 'folder' : 'ancestor',
        license_text_hash: crypto.createHash('sha256').update(text).digest('hex'),
        license_status: 'covered',
      }
    }
    const next = path.dirname(cursor)
    if (next === cursor) break
    cursor = next
  }
  return {
    license_file: '',
    license_scope: 'none',
    license_text_hash: '',
    license_status: 'missing',
  }
}
```

Attach the returned fields to every emitted LPC asset.

- [ ] **Step 4: Run inventory tests**

Run:

```powershell
npm run test:tools -- tests/tools/lpc-inventory.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Preserve license metadata in catalog**

Add to `tools/build-lpc-catalog.js` when mapping inventory asset records into catalog entries:

```js
license_file: asset.license_file,
license_scope: asset.license_scope,
license_status: asset.license_status,
license_text_hash: asset.license_text_hash,
source_folder: asset.source_folder,
```

Add to `tests/tools/lpc-catalog.test.mjs`:

```js
test('catalog preserves LPC license coverage metadata', () => {
  const entry = catalog.entries.find((item) => item.asset_path.includes('Randoms/'))
  assert.ok(entry)
  assert.equal(entry.license_status, 'covered')
  assert.match(entry.license_text_hash, /^[a-f0-9]{64}$/)
})
```

Run:

```powershell
npm run test:tools -- tests/tools/lpc-catalog.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Make release validation fail on missing shipped licenses**

In `tools/validate-release-package.js`, add a release check:

```js
function assertLpcLicenseCoverage(distRoot) {
  const catalogPath = path.join(distRoot, 'data', 'lpc', 'lpc_catalog.json')
  if (!fs.existsSync(catalogPath)) return
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  const entries = Array.isArray(catalog.entries) ? catalog.entries : []
  const missing = entries.filter((entry) => entry.asset_path && entry.license_status !== 'covered')
  if (missing.length > 0) {
    throw new Error(`Release LPC catalog has ${missing.length} asset(s) without license coverage. First: ${missing[0].asset_path}`)
  }
}
```

Call it from the existing validator entrypoint after JSON files are loaded.

- [ ] **Step 7: Generate audit document**

Create `tools/audit-licenses.js` in Task 7, then for this task create a temporary manual `docs/asset-license-audit.md` with:

```markdown
# Asset License Audit

Generated from local LPC/Duelyst/public manifests.

## Current Manual Maintenance

- Loose root LPC files moved into `assets/lpc sprite generator stuff/Randoms/`.
- Missing per-folder `license.txt` files added.

## Release Rule

No asset ships unless it has `license_status: "covered"` in the generated manifest or catalog.
```

- [ ] **Step 8: Rebuild and validate**

Run:

```powershell
npm run lpc:inventory
npm run lpc:catalog
npm run build:release
npm run validate:release-package
npm run test:tools
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add "assets/lpc sprite generator stuff" data/lpc docs/asset-license-audit.md tools/build-lpc-local-inventory.js tools/build-lpc-catalog.js tools/validate-release-package.js tools/check-source-hygiene.js tests/tools/lpc-inventory.test.mjs tests/tools/lpc-catalog.test.mjs tests/tools/release-package.test.mjs
git commit -m "Validate LPC license provenance"
```

Expected: commit includes the user's file maintenance plus generated metadata.

---

## Task 2: Create A Real Secret Vault Boundary

**Files:**
- Create: `src/aiSecretVault.ts`
- Modify: `src/App.tsx`
- Modify: `src/screens/SettingsPanel.tsx`
- Modify: `src/aiWorkspace.ts`
- Test: `tests/tools/ai-secret-vault.test.mjs`
- Test: `tests/browser/regression.spec.ts`

- [ ] **Step 1: Write unit tests for secret redaction**

Create `tests/tools/ai-secret-vault.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAiSecretVault,
  redactSecretValue,
  serializeProviderConfigForStorage,
} from '../../src/aiSecretVault.ts'

test('secret vault stores secrets only in memory and returns redacted snapshots', () => {
  const vault = createAiSecretVault()
  vault.set('openai', 'sk-test-secret')
  assert.equal(vault.has('openai'), true)
  assert.equal(vault.get('openai'), 'sk-test-secret')
  assert.deepEqual(vault.snapshot(), { openai: true })
  assert.equal(JSON.stringify(vault.snapshot()).includes('sk-test-secret'), false)
})

test('redaction removes key-shaped strings', () => {
  assert.equal(redactSecretValue('sk-test-secret'), '[redacted]')
  assert.equal(redactSecretValue(''), '')
})

test('stored provider config never includes browser-call or secret fields', () => {
  const serialized = serializeProviderConfigForStorage([{
    provider_id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    enabled: true,
    model: 'gpt-4.1',
    base_url: 'https://api.openai.com/v1',
    secret_session_set: true,
    secret_storage: 'session_only',
    direct_browser_calls: true,
    local_proxy_required: false,
    notes: 'secret sk-test-secret',
  }])

  assert.equal(serialized[0].secret_session_set, false)
  assert.equal(serialized[0].direct_browser_calls, false)
  assert.equal(serialized[0].local_proxy_required, true)
  assert.equal(JSON.stringify(serialized).includes('sk-test-secret'), false)
})
```

Run:

```powershell
node --test tests/tools/ai-secret-vault.test.mjs
```

Expected: FAIL because `src/aiSecretVault.ts` does not exist.

- [ ] **Step 2: Implement vault module**

Create `src/aiSecretVault.ts`:

```ts
import type { AiProviderConnection } from './types'

export type AiSecretVault = {
  set: (providerId: string, secret: string) => void
  get: (providerId: string) => string | null
  has: (providerId: string) => boolean
  clear: (providerId: string) => void
  clearAll: () => void
  snapshot: () => Record<string, boolean>
}

export function createAiSecretVault(): AiSecretVault {
  const secrets = new Map<string, string>()
  return {
    set(providerId, secret) {
      const trimmed = secret.trim()
      if (trimmed) secrets.set(providerId, trimmed)
      else secrets.delete(providerId)
    },
    get(providerId) {
      return secrets.get(providerId) ?? null
    },
    has(providerId) {
      return secrets.has(providerId)
    },
    clear(providerId) {
      secrets.delete(providerId)
    },
    clearAll() {
      secrets.clear()
    },
    snapshot() {
      return Object.fromEntries([...secrets.keys()].map((key) => [key, true]))
    },
  }
}

export function redactSecretValue(value: string): string {
  return value.trim() ? '[redacted]' : ''
}

export function serializeProviderConfigForStorage(providers: AiProviderConnection[]): AiProviderConnection[] {
  return providers.map((provider) => ({
    ...provider,
    secret_session_set: false,
    direct_browser_calls: false,
    local_proxy_required: true,
    notes: provider.notes.replace(/(?:sk|pk|key|token|secret)[A-Za-z0-9_\-.:/+=]{6,}/gi, '[redacted]'),
  }))
}
```

- [ ] **Step 3: Wire App to vault**

In `src/App.tsx`, replace ad hoc session secret state with the vault module:

```ts
const aiSecretVault = useMemo(() => createAiSecretVault(), [])
const [sessionSecretStatus, setSessionSecretStatus] = useState<Record<string, boolean>>({})

const setAiSessionSecret = useCallback((providerId: string, secret: string) => {
  aiSecretVault.set(providerId, secret)
  const next = aiSecretVault.snapshot()
  setSessionSecretStatus(next)
  storeSessionSecretStatus(next)
}, [aiSecretVault])
```

Persist provider configuration by calling `serializeProviderConfigForStorage(aiProviders)`.

- [ ] **Step 4: Add browser regression for clearing secrets**

In `tests/browser/regression.spec.ts`, add:

```ts
test('AI session secrets clear from visible state and browser storage', async ({ page }) => {
  await openSettings(page)
  await page.getByTestId('ai-secret-openai').fill('sk-test-secret-never-persist')
  await expect(page.getByText(/1 volatile secret/)).toBeVisible()
  await page.getByRole('button', { name: 'Clear' }).first().click()
  await expect(page.getByText(/0 volatile secret/)).toBeVisible()

  const storageText = await page.evaluate(() => JSON.stringify({
    local: { ...localStorage },
    session: { ...sessionStorage },
    html: document.documentElement.innerHTML,
  }))
  expect(storageText).not.toContain('sk-test-secret-never-persist')
})
```

- [ ] **Step 5: Run tests**

Run:

```powershell
node --test tests/tools/ai-secret-vault.test.mjs
npm run test:browser -- --grep "AI session secrets"
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/aiSecretVault.ts src/App.tsx src/screens/SettingsPanel.tsx src/aiWorkspace.ts tests/tools/ai-secret-vault.test.mjs tests/browser/regression.spec.ts
git commit -m "Harden AI session secret handling"
```

---

## Task 3: Add Permissioned AI Chat Tooling

**Files:**
- Create: `src/aiToolSchemas.ts`
- Create: `src/aiToolRegistry.ts`
- Create: `src/aiAgent.ts`
- Modify: `src/screens/AIStudioPanel.tsx`
- Modify: `src/types.ts`
- Test: `tests/tools/ai-agent.test.mjs`
- Test: `tests/browser/regression.spec.ts`

- [ ] **Step 1: Add tool schema types**

Create `src/aiToolSchemas.ts`:

```ts
export type AiToolPermission = 'read_project' | 'export_asset' | 'create_generation_job' | 'call_local_bridge'

export type AiToolDefinition<Input = unknown, Output = unknown> = {
  tool_id: string
  title: string
  description: string
  permission: AiToolPermission
  requiresApproval: boolean
  validateInput: (value: unknown) => Input
  run: (input: Input) => Promise<Output> | Output
}

export type AiToolProposal = {
  proposal_id: string
  tool_id: string
  title: string
  permission: AiToolPermission
  input: unknown
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'running' | 'completed' | 'failed'
  result?: unknown
  error?: string
}
```

- [ ] **Step 2: Create registry**

Create `src/aiToolRegistry.ts`:

```ts
import type { AiToolDefinition } from './aiToolSchemas'

export function createAiToolRegistry(tools: AiToolDefinition[]) {
  const byId = new Map(tools.map((tool) => [tool.tool_id, tool]))
  return {
    list() {
      return [...byId.values()].map(({ run: _run, validateInput: _validateInput, ...publicTool }) => publicTool)
    },
    get(toolId: string) {
      return byId.get(toolId) ?? null
    },
    async run(toolId: string, input: unknown) {
      const tool = byId.get(toolId)
      if (!tool) throw new Error(`Unknown AI tool: ${toolId}`)
      const validated = tool.validateInput(input)
      return tool.run(validated)
    },
  }
}
```

- [ ] **Step 3: Write agent tests**

Create `tests/tools/ai-agent.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentTurn, applyToolDecision } from '../../src/aiAgent.ts'
import { createAiToolRegistry } from '../../src/aiToolRegistry.ts'

test('agent proposes a generation job tool instead of executing it automatically', async () => {
  const registry = createAiToolRegistry([{
    tool_id: 'create_generation_job',
    title: 'Create generation job',
    description: 'Create missing animation jobs',
    permission: 'create_generation_job',
    requiresApproval: true,
    validateInput: (value) => value,
    run: () => ({ created: 1 }),
  }])

  const turn = await buildAgentTurn({
    request: 'make missing walk animations',
    registry,
    ragBundle: null,
  })

  assert.equal(turn.proposals.length, 1)
  assert.equal(turn.proposals[0].status, 'pending')
})

test('approved proposal executes and stores result', async () => {
  const registry = createAiToolRegistry([{
    tool_id: 'create_generation_job',
    title: 'Create generation job',
    description: 'Create missing animation jobs',
    permission: 'create_generation_job',
    requiresApproval: true,
    validateInput: (value) => value,
    run: () => ({ created: 1 }),
  }])

  const proposal = {
    proposal_id: 'proposal_1',
    tool_id: 'create_generation_job',
    title: 'Create generation job',
    permission: 'create_generation_job',
    input: {},
    reason: 'User asked for missing walk animations.',
    status: 'pending',
  }

  const result = await applyToolDecision({ proposal, decision: 'approve', registry })
  assert.equal(result.status, 'completed')
  assert.deepEqual(result.result, { created: 1 })
})
```

- [ ] **Step 4: Implement `src/aiAgent.ts`**

Create:

```ts
import type { AiToolProposal } from './aiToolSchemas'

type AgentRegistry = {
  list: () => Array<{ tool_id: string; title: string; permission: string; requiresApproval: boolean }>
  run: (toolId: string, input: unknown) => Promise<unknown>
}

export async function buildAgentTurn(options: {
  request: string
  registry: AgentRegistry
  ragBundle: { citations?: unknown[] } | null
}) {
  const lower = options.request.toLowerCase()
  const proposals: AiToolProposal[] = []
  if (lower.includes('missing') || lower.includes('animation') || lower.includes('job')) {
    proposals.push({
      proposal_id: `proposal_${Date.now()}`,
      tool_id: 'create_generation_job',
      title: 'Create generation job',
      permission: 'create_generation_job',
      input: { request: options.request },
      reason: 'The request asks for animation or missing-layer work.',
      status: 'pending',
    })
  }

  return {
    message: proposals.length > 0
      ? 'I prepared a tool action for review.'
      : 'I can help plan this request using the current project context.',
    proposals,
    citations: options.ragBundle?.citations ?? [],
  }
}

export async function applyToolDecision(options: {
  proposal: AiToolProposal
  decision: 'approve' | 'reject'
  registry: AgentRegistry
}): Promise<AiToolProposal> {
  if (options.decision === 'reject') return { ...options.proposal, status: 'rejected' }
  try {
    const result = await options.registry.run(options.proposal.tool_id, options.proposal.input)
    return { ...options.proposal, status: 'completed', result }
  } catch (error) {
    return { ...options.proposal, status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}
```

- [ ] **Step 5: Surface proposals in AI Studio**

In `src/screens/AIStudioPanel.tsx`, add rendering for pending tool proposals:

```tsx
{message.tool_proposals?.map((proposal) => (
  <article key={proposal.proposal_id} className="settings-card tool-proposal-card">
    <strong>{proposal.title}</strong>
    <span>{proposal.reason}</span>
    <code>{JSON.stringify(proposal.input, null, 2)}</code>
    <button onClick={() => approveToolProposal(proposal.proposal_id)}>Approve</button>
    <button onClick={() => rejectToolProposal(proposal.proposal_id)}>Reject</button>
  </article>
))}
```

Add `tool_proposals?: AiToolProposal[]` to `AiStudioMessage` in `src/types.ts`.

- [ ] **Step 6: Browser test tool approval**

Add to `tests/browser/regression.spec.ts`:

```ts
test('AI Studio requires approval before running tool actions', async ({ page }) => {
  await openAiStudio(page)
  await page.getByTestId('ai-chat-input').fill('make missing walk animations')
  await page.getByTestId('ai-chat-send').click()
  await expect(page.getByText('I prepared a tool action for review.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
})
```

- [ ] **Step 7: Run tests and commit**

Run:

```powershell
node --test tests/tools/ai-agent.test.mjs
npm run test:browser -- --grep "AI Studio requires approval"
npm run lint
git add src/aiToolSchemas.ts src/aiToolRegistry.ts src/aiAgent.ts src/screens/AIStudioPanel.tsx src/types.ts tests/tools/ai-agent.test.mjs tests/browser/regression.spec.ts
git commit -m "Add permissioned AI Studio tool proposals"
```

---

## Task 4: Add Local Proxy Provider Routing

**Files:**
- Create: `tools/localProxyProviders.ts`
- Modify: `tools/localToolsServer.ts`
- Test: `tests/tools/local-proxy.test.mjs`
- Modify: `tools/check-preview-local-tools.js`

- [ ] **Step 1: Write proxy routing tests**

Create `tests/tools/local-proxy.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { redactHeaders, resolveProviderRoute } from '../../tools/localProxyProviders.ts'

test('provider routes require explicit allowlist provider ids', () => {
  assert.equal(resolveProviderRoute({ provider_id: 'openai' }).kind, 'openai_compatible')
  assert.throws(() => resolveProviderRoute({ provider_id: 'unknown-provider' }), /Unsupported provider/)
})

test('headers redact authorization values for audit logs', () => {
  const headers = redactHeaders({ authorization: 'Bearer sk-secret', 'content-type': 'application/json' })
  assert.equal(headers.authorization, '[redacted]')
  assert.equal(headers['content-type'], 'application/json')
})
```

- [ ] **Step 2: Implement provider routing module**

Create `tools/localProxyProviders.ts`:

```ts
export type ProviderRoute =
  | { kind: 'openai_compatible'; baseUrl: string }
  | { kind: 'anthropic'; baseUrl: string }
  | { kind: 'gemini'; baseUrl: string }
  | { kind: 'local'; baseUrl: string }

export function resolveProviderRoute(input: { provider_id: string; base_url?: string }): ProviderRoute {
  switch (input.provider_id) {
    case 'openai':
    case 'mistral':
    case 'groq':
    case 'openrouter':
      return { kind: 'openai_compatible', baseUrl: input.base_url || '' }
    case 'anthropic':
      return { kind: 'anthropic', baseUrl: input.base_url || '' }
    case 'google':
      return { kind: 'gemini', baseUrl: input.base_url || '' }
    case 'ollama':
    case 'lm_studio':
      return { kind: 'local', baseUrl: input.base_url || '' }
    default:
      throw new Error(`Unsupported provider: ${input.provider_id}`)
  }
}

export function redactHeaders(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [
    key,
    key.toLowerCase() === 'authorization' || key.toLowerCase().includes('api-key') ? '[redacted]' : value,
  ]))
}
```

- [ ] **Step 3: Add local proxy endpoints**

In `tools/localToolsServer.ts`, add POST route:

```ts
if (url.pathname === '/__local/ai/chat') {
  if (!assertPostAllowed(req, res)) return true
  const body = await readJsonBody(req, res)
  const route = resolveProviderRoute({ provider_id: body.provider_id, base_url: body.base_url })
  const result = await callProviderRoute(route, body)
  sendJson(res, 200, result)
  return true
}
```

The endpoint must reuse existing checks:

- loopback Host
- same-origin/CORS guard
- local tool token
- JSON body size cap
- redacted logs

- [ ] **Step 4: Add preview smoke checks**

In `tools/check-preview-local-tools.js`, add:

```js
await expectStatus('/__local/ai/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ provider_id: 'openai' }),
}, 403)
```

Expected: tokenless provider proxy calls are blocked.

- [ ] **Step 5: Run and commit**

Run:

```powershell
node --test tests/tools/local-proxy.test.mjs
npm run test:preview-tools
npm run lint
git add tools/localProxyProviders.ts tools/localToolsServer.ts tests/tools/local-proxy.test.mjs tools/check-preview-local-tools.js
git commit -m "Add guarded local AI provider proxy"
```

---

## Task 5: Build Aseprite And PixelLab Bridges

**Files:**
- Create: `tools/asepriteBridge.ts`
- Create: `tools/pixellabBridge.ts`
- Modify: `tools/localToolsServer.ts`
- Modify: `src/screens/SettingsPanel.tsx`
- Modify: `src/screens/AIStudioPanel.tsx`
- Test: `tests/tools/aseprite-bridge.test.mjs`
- Test: `tests/tools/pixellab-bridge.test.mjs`
- Test: `tests/browser/regression.spec.ts`

- [ ] **Step 1: Write bridge validation tests**

Create `tests/tools/aseprite-bridge.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { validateAsepriteRequest } from '../../tools/asepriteBridge.ts'

test('Aseprite bridge rejects non-loopback bridge urls', () => {
  assert.throws(() => validateAsepriteRequest({
    bridge_url: 'https://example.com',
    action: 'open_export',
    export_path: 'data/exports/demo/manifest.json',
  }), /loopback/)
})

test('Aseprite bridge accepts project-local export manifests', () => {
  const request = validateAsepriteRequest({
    bridge_url: 'http://127.0.0.1:32123',
    action: 'open_export',
    export_path: 'data/exports/demo/manifest.json',
  })
  assert.equal(request.action, 'open_export')
})
```

Create `tests/tools/pixellab-bridge.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePixelLabJob } from '../../tools/pixellabBridge.ts'

test('PixelLab jobs keep prompts and references but reject absolute output paths', () => {
  assert.throws(() => normalizePixelLabJob({
    prompt: 'make walk frames',
    references: ['data/exports/demo/frame.png'],
    output_path: 'C:/secrets/out.png',
  }), /project-relative/)
})
```

- [ ] **Step 2: Implement Aseprite validator**

Create `tools/asepriteBridge.ts`:

```ts
export function validateAsepriteRequest(input: {
  bridge_url: string
  action: 'open_export' | 'roundtrip_sprite'
  export_path: string
}) {
  const url = new URL(input.bridge_url)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Aseprite bridge URL must be loopback.')
  }
  if (input.export_path.includes('..') || /^[a-zA-Z]:[\\/]/.test(input.export_path)) {
    throw new Error('Aseprite export path must be project-relative.')
  }
  return input
}
```

- [ ] **Step 3: Implement PixelLab job normalizer**

Create `tools/pixellabBridge.ts`:

```ts
export function normalizePixelLabJob(input: {
  prompt: string
  references: string[]
  output_path: string
}) {
  if (!input.prompt.trim()) throw new Error('PixelLab prompt is required.')
  if (input.output_path.includes('..') || /^[a-zA-Z]:[\\/]/.test(input.output_path)) {
    throw new Error('PixelLab output path must be project-relative.')
  }
  return {
    prompt: input.prompt.trim(),
    references: input.references.map((reference) => reference.replaceAll('\\', '/')),
    output_path: input.output_path.replaceAll('\\', '/'),
  }
}
```

- [ ] **Step 4: Wire local endpoints**

In `tools/localToolsServer.ts`, add:

```ts
POST /__local/aseprite/open-export
POST /__local/pixellab/create-job
```

Both routes must:

- require loopback Host
- require local tool token
- validate JSON body with the bridge modules
- write redacted audit entries
- never accept absolute paths or traversal paths

- [ ] **Step 5: Surface health and action UI**

In `src/screens/SettingsPanel.tsx`, add buttons:

```tsx
<button data-testid="check-aseprite-bridge" disabled={!localToolsAvailable}>Check Aseprite bridge</button>
<button data-testid="check-pixellab-bridge" disabled={!localToolsAvailable}>Check PixelLab bridge</button>
```

In `src/screens/AIStudioPanel.tsx`, show bridge status inside the existing Tool access panel.

- [ ] **Step 6: Run and commit**

Run:

```powershell
node --test tests/tools/aseprite-bridge.test.mjs tests/tools/pixellab-bridge.test.mjs
npm run test:preview-tools
npm run test:browser -- --grep "bridge"
npm run lint
git add tools/asepriteBridge.ts tools/pixellabBridge.ts tools/localToolsServer.ts src/screens/SettingsPanel.tsx src/screens/AIStudioPanel.tsx tests/tools/aseprite-bridge.test.mjs tests/tools/pixellab-bridge.test.mjs tests/browser/regression.spec.ts
git commit -m "Add guarded Aseprite and PixelLab bridges"
```

---

## Task 6: Upgrade RAG To Measurable Studio Quality

**Files:**
- Modify: `src/ragTypes.ts`
- Modify: `src/ragIndex.ts`
- Modify: `tools/build-rag-index.js`
- Create: `data/rag/eval_queries.json`
- Create: `tools/evaluate-rag-index.js`
- Test: `tests/tools/rag-index.test.mjs`
- Test: `tests/tools/rag-evaluation.test.mjs`
- Modify: `docs/ai-rag-system.md`

- [ ] **Step 1: Create evaluation set**

Create `data/rag/eval_queries.json`:

```json
[
  {
    "query_id": "license_randoms",
    "query": "Which license covers assets moved into the Randoms folder?",
    "expected_source_ids": ["docs/asset-license-audit.md", "data/lpc/lpc_catalog.json"],
    "expected_terms": ["Randoms", "license"]
  },
  {
    "query_id": "pixellab_missing_animation",
    "query": "How should the app generate a missing animation with PixelLab?",
    "expected_source_ids": ["docs/pixellab-mcp.md", "docs/ai-rag-system.md"],
    "expected_terms": ["PixelLab", "missing-animation"]
  },
  {
    "query_id": "secret_policy",
    "query": "Can provider API keys be stored in the browser or release bundle?",
    "expected_source_ids": ["docs/ai-rag-system.md", "docs/release-readiness.md"],
    "expected_terms": ["session-only", "redacted", "local proxy"]
  }
]
```

- [ ] **Step 2: Extend RAG types**

In `src/ragTypes.ts`, add:

```ts
export type RagChunk = {
  chunk_id: string
  source_id: string
  source_type: string
  title: string
  uri: string
  text: string
  content_hash: string
  token_estimate: number
  trust_level: 'project_doc' | 'generated_manifest' | 'local_report' | 'external_reference'
  license_tags: string[]
  metadata: Record<string, unknown>
}

export type RagEvaluationResult = {
  query_id: string
  passed: boolean
  score: number
  matched_source_ids: string[]
  missing_source_ids: string[]
  matched_terms: string[]
  missing_terms: string[]
}
```

- [ ] **Step 3: Add deterministic content hashing**

In `src/ragIndex.ts`, implement stable chunk IDs:

```ts
function makeChunkId(sourceId: string, index: number, text: string) {
  const hash = createHash('sha256').update(`${sourceId}\n${index}\n${text}`).digest('hex').slice(0, 16)
  return `${sourceId.replace(/[^a-z0-9]+/gi, '_')}_${hash}`
}
```

- [ ] **Step 4: Build evaluator**

Create `tools/evaluate-rag-index.js`:

```js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRagContextBundle } from '../src/ragIndex.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const index = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/rag/knowledge_index.json'), 'utf8'))
const evals = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/rag/eval_queries.json'), 'utf8'))
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
```

- [ ] **Step 5: Add test wrapper**

Create `tests/tools/rag-evaluation.test.mjs`:

```js
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import test from 'node:test'

test('RAG evaluation set passes', () => {
  const result = spawnSync('node', ['tools/evaluate-rag-index.js'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
```

- [ ] **Step 6: Update scripts and docs**

In `package.json`, add:

```json
"rag:evaluate": "npm run rag:index && node tools/evaluate-rag-index.js"
```

In `docs/ai-rag-system.md`, document:

```markdown
## Evaluate RAG Quality

Run `npm run rag:evaluate`.

The evaluator fails when required citation sources or required terms are missing.
Release candidates must pass this check before the AI Studio can be considered production ready.
```

- [ ] **Step 7: Run and commit**

Run:

```powershell
npm run rag:index
npm run rag:evaluate
npm run test:tools -- tests/tools/rag-index.test.mjs tests/tools/rag-evaluation.test.mjs
npm run lint
git add src/ragTypes.ts src/ragIndex.ts tools/build-rag-index.js data/rag/eval_queries.json tools/evaluate-rag-index.js tests/tools/rag-index.test.mjs tests/tools/rag-evaluation.test.mjs docs/ai-rag-system.md package.json package-lock.json
git commit -m "Add measurable RAG quality gates"
```

---

## Task 7: Add Security, License, And Secret Scanners

**Files:**
- Create: `tools/scan-secrets.js`
- Create: `tools/audit-licenses.js`
- Modify: `package.json`
- Test: `tests/tools/security-scan.test.mjs`
- Test: `tests/tools/license-audit.test.mjs`

- [ ] **Step 1: Write security scan tests**

Create `tests/tools/security-scan.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { scanTextForSecrets } from '../../tools/scan-secrets.js'

test('secret scanner flags provider-looking keys', () => {
  const findings = scanTextForSecrets('OPENAI_API_KEY=sk-test-1234567890abcdef')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].kind, 'possible_secret')
})

test('secret scanner ignores redacted placeholders', () => {
  assert.deepEqual(scanTextForSecrets('Authorization: [redacted]'), [])
})
```

- [ ] **Step 2: Implement scanner**

Create `tools/scan-secrets.js`:

```js
export function scanTextForSecrets(text) {
  const patterns = [
    /sk-[A-Za-z0-9_\-]{12,}/g,
    /(?:api[_-]?key|token|secret)\s*[:=]\s*["']?[A-Za-z0-9_\-]{12,}/gi,
    /Bearer\s+[A-Za-z0-9_\-./+=]{16,}/g,
  ]
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => ({
    kind: 'possible_secret',
    match: match[0].slice(0, 16),
  })))
}
```

Add a CLI mode that scans `src`, `tools`, `docs`, `public`, `data`, and `dist` when present, while ignoring `.local-tools-token`.

- [ ] **Step 3: Write license audit tests**

Create `tests/tools/license-audit.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeLicenseCoverage } from '../../tools/audit-licenses.js'

test('license audit reports missing and covered counts', () => {
  const summary = summarizeLicenseCoverage([
    { asset_path: 'a.png', license_status: 'covered' },
    { asset_path: 'b.png', license_status: 'missing' },
  ])
  assert.equal(summary.covered, 1)
  assert.equal(summary.missing, 1)
})
```

- [ ] **Step 4: Implement license audit**

Create `tools/audit-licenses.js`:

```js
export function summarizeLicenseCoverage(entries) {
  return entries.reduce((summary, entry) => {
    if (entry.license_status === 'covered') summary.covered += 1
    else summary.missing += 1
    return summary
  }, { covered: 0, missing: 0 })
}
```

Add CLI mode:

```js
if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}`) {
  // Load data/lpc/lpc_catalog.json, public/data/manifests/duelyst.json, and public/data/manifests/characters.json.
  // Write docs/asset-license-audit.md.
}
```

- [ ] **Step 5: Add scripts**

In `package.json`, add:

```json
"security:scan": "node tools/scan-secrets.js",
"license:audit": "node tools/audit-licenses.js"
```

- [ ] **Step 6: Run and commit**

Run:

```powershell
node --test tests/tools/security-scan.test.mjs tests/tools/license-audit.test.mjs
npm run security:scan
npm run license:audit
npm run lint
git add tools/scan-secrets.js tools/audit-licenses.js tests/tools/security-scan.test.mjs tests/tools/license-audit.test.mjs docs/asset-license-audit.md package.json package-lock.json
git commit -m "Add security and license audit scanners"
```

---

## Task 8: Add Performance And Memory Budgets

**Files:**
- Create: `src/performanceBudget.ts`
- Create: `tools/run-memory-smoke.js`
- Create: `tests/browser/performance.spec.ts`
- Modify: `src/CompositeCanvas.tsx`
- Modify: `src/partAssetStore.ts`
- Modify: `package.json`

- [ ] **Step 1: Define budgets**

Create `src/performanceBudget.ts`:

```ts
export const performanceBudget = {
  initialAppInteractiveMs: 3000,
  catalogSearchMs: 250,
  previewRenderMs: 500,
  fullPackageExportMs: 10000,
  imageCacheMaxEntries: 256,
  indexedDbCompactionMaxMs: 2000,
} as const
```

- [ ] **Step 2: Expose development cache diagnostics**

In `src/CompositeCanvas.tsx`, add:

```ts
if (import.meta.env.DEV || import.meta.env.MODE === 'local-tools') {
  window.__spriteCreatorDiagnostics = {
    ...(window.__spriteCreatorDiagnostics ?? {}),
    imageCacheSize: imageLoadCache.size,
  }
}
```

Add a global type in `src/types.ts`:

```ts
declare global {
  interface Window {
    __spriteCreatorDiagnostics?: {
      imageCacheSize?: number
    }
  }
}
```

- [ ] **Step 3: Add browser performance smoke**

Create `tests/browser/performance.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('large catalog browsing keeps image cache bounded', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Part Library|LPC|Assets/ }).first().click()
  for (let index = 0; index < 20; index += 1) {
    await page.mouse.wheel(0, 900)
  }
  const cacheSize = await page.evaluate(() => window.__spriteCreatorDiagnostics?.imageCacheSize ?? 0)
  expect(cacheSize).toBeLessThanOrEqual(256)
})
```

- [ ] **Step 4: Add memory smoke runner**

Create `tools/run-memory-smoke.js`:

```js
import { spawnSync } from 'node:child_process'

const result = spawnSync('npx', ['playwright', 'test', 'tests/browser/performance.spec.ts', '--reporter=line'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
```

- [ ] **Step 5: Add scripts**

In `package.json`, add:

```json
"test:performance": "playwright test tests/browser/performance.spec.ts",
"test:memory": "node tools/run-memory-smoke.js"
```

- [ ] **Step 6: Run and commit**

Run:

```powershell
npm run test:performance
npm run test:memory
npm run lint
git add src/performanceBudget.ts tools/run-memory-smoke.js tests/browser/performance.spec.ts src/CompositeCanvas.tsx src/partAssetStore.ts src/types.ts package.json package-lock.json
git commit -m "Add performance and memory budgets"
```

---

## Task 9: Add CI And Production Release Gates

**Files:**
- Modify: `.github/workflows/release.yml`
- Create: `.github/workflows/security.yml`
- Modify: `package.json`
- Modify: `docs/release-readiness.md`

- [ ] **Step 1: Add production check script**

In `package.json`, add:

```json
"production:check": "npm run lint && npm run check:source-hygiene && npm run security:scan && npm run license:audit && npm run rag:evaluate && npm run test:tools && npm run build:release && npm run validate:release-package && npm run test:preview-tools && npm run test:browser"
```

- [ ] **Step 2: Update release workflow**

In `.github/workflows/release.yml`, make the main job run:

```yaml
- name: Production check
  run: npm run production:check
```

- [ ] **Step 3: Add security workflow**

Create `.github/workflows/security.yml`:

```yaml
name: Security

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run security:scan
      - run: npm audit --audit-level=moderate
      - run: npm run license:audit
```

- [ ] **Step 4: Update release readiness docs**

In `docs/release-readiness.md`, add:

```markdown
## Production Readiness Gate

The production release command is:

```powershell
npm run production:check
```

This command must pass before calling the app production ready.
```

- [ ] **Step 5: Run and commit**

Run:

```powershell
npm run production:check
git add .github/workflows/release.yml .github/workflows/security.yml package.json package-lock.json docs/release-readiness.md
git commit -m "Add production readiness CI gates"
```

---

## Task 10: Final Production UX And Documentation Pass

**Files:**
- Modify: `README.md`
- Modify: `docs/release-readiness.md`
- Modify: `docs/ai-rag-system.md`
- Modify: `docs/pixellab-mcp.md`
- Create: `docs/production-security-model.md`
- Create: `docs/local-bridge-threat-model.md`
- Modify: `src/screens/AIStudioPanel.tsx`
- Modify: `src/screens/SettingsPanel.tsx`
- Modify: `src/screens/AssetAuditPanel.tsx`
- Modify: `src/index.css`
- Test: `tests/browser/regression.spec.ts`

- [ ] **Step 1: Create production security model**

Create `docs/production-security-model.md`:

```markdown
# Production Security Model

## Static App Boundary

The GitHub Pages app is static. It can render assets, read public manifests, build exports, and prepare AI/tool handoffs. It cannot make provider calls with hidden secrets because browser-held secrets are inspectable by the user agent.

## Secret Rule

Provider API keys are either:

- held only in volatile page memory for a current manual session, or
- stored outside the app in a trusted local proxy, backend, MCP server, or provider vault.

Keys must never be written to localStorage, sessionStorage, IndexedDB, exported packages, generated manifests, logs, screenshots, release bundles, or git.

## Tool Rule

Privileged actions require explicit user approval and must run through loopback-only local bridges with path allowlists and redacted audit logs.
```

- [ ] **Step 2: Create local bridge threat model**

Create `docs/local-bridge-threat-model.md`:

```markdown
# Local Bridge Threat Model

## Protected Assets

- Provider API keys
- Local filesystem paths
- Source asset packs
- Generated exports
- APES, Aseprite, PixelLab, and local LLM outputs

## Required Controls

- Loopback Host checks
- Same-origin checks where browser metadata is available
- Local session token for POST actions
- JSON body size limits
- Project-relative path allowlists
- Redacted audit logs
- Explicit user approval for AI-proposed tool actions
```

- [ ] **Step 3: Polish AI Studio UX**

In `src/screens/AIStudioPanel.tsx`, ensure the first screen includes:

- chat transcript
- request box
- provider status
- RAG status
- tool status
- pending tool approvals
- citations
- recovery text when a tool fails

Do not add marketing hero copy.

- [ ] **Step 4: Polish Settings UX**

In `src/screens/SettingsPanel.tsx`, make the settings screen show:

- enabled providers
- volatile secret count
- local proxy status
- Aseprite bridge status
- PixelLab status
- local LLM status
- APES bridge status
- production check command

- [ ] **Step 5: Polish Asset Audit UX**

In `src/screens/AssetAuditPanel.tsx`, show:

- total assets
- license-covered assets
- missing-license assets
- blocked release files
- links to generated `docs/asset-license-audit.md` equivalent download

- [ ] **Step 6: Add browser coverage**

In `tests/browser/regression.spec.ts`, add:

```ts
test('production readiness surfaces security and license status', async ({ page }) => {
  await page.goto('/')
  await openSettings(page)
  await expect(page.getByText(/volatile secret/)).toBeVisible()
  await expect(page.getByText(/production:check|release:check/)).toBeVisible()
  await openAssetAudit(page)
  await expect(page.getByText(/license/i)).toBeVisible()
})
```

- [ ] **Step 7: Run full production gate**

Run:

```powershell
npm run production:check
```

Expected: PASS.

- [ ] **Step 8: Commit and push**

Run:

```powershell
git add README.md docs/release-readiness.md docs/ai-rag-system.md docs/pixellab-mcp.md docs/production-security-model.md docs/local-bridge-threat-model.md src/screens/AIStudioPanel.tsx src/screens/SettingsPanel.tsx src/screens/AssetAuditPanel.tsx src/index.css tests/browser/regression.spec.ts
git commit -m "Document and polish production readiness surfaces"
git push origin main
```

---

## Final Acceptance Checklist

- [ ] `git status --short` shows only intentional changes before each commit.
- [ ] User LPC file maintenance is committed only after license validation passes.
- [ ] `npm run security:scan` passes.
- [ ] `npm run license:audit` writes `docs/asset-license-audit.md`.
- [ ] `npm run rag:evaluate` passes.
- [ ] `npm run test:memory` passes locally.
- [ ] `npm run production:check` passes.
- [ ] GitHub Actions passes on `main`.
- [ ] GitHub Pages hosted app loads public sprites, Duelyst assets, LPC assets, and RAG index.
- [ ] AI Studio chat shows citations and approval-gated tool proposals.
- [ ] Settings supports OpenAI, Anthropic, Gemini, Mistral, Groq, OpenRouter, Ollama, LM Studio, PixelLab, Aseprite, and local proxy configuration.
- [ ] No raw provider key appears in browser storage, downloads, `dist`, logs, or git.
- [ ] Asset Audit reports zero missing shipped licenses.

---

## Self-Review

**Spec coverage:** The plan covers the requested production readiness gaps: hosted assets, LPC/license cleanup, AI chatbox, provider/local LLM settings, Aseprite, PixelLab, strict secret safety, AAA-style RAG quality, security, memory, CI, and polish.

**Placeholder scan:** The plan includes exact files, commands, and representative code for every implementation task.

**Type consistency:** Tool proposal, vault, proxy, bridge, and RAG type names are consistent across tasks. Later tasks build on earlier created modules.

**Execution shape:** Each task is independently commit-ready and has a clear verification command before commit.
