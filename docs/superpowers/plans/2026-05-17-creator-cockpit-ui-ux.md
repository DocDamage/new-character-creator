# Creator Cockpit UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a focused creator cockpit pass that improves reviewed-part discovery, recipe readiness visibility, export target context, and next-action flow.

**Architecture:** Add a small shared cockpit model module for derived readiness and export-target metadata, then thread that derived state through `App.tsx` into `FastCreatorPanel` and `ExportsPanel`. Keep search/filter state local to Fast Creator, and keep exports advisory instead of blocking existing download actions.

**Tech Stack:** React 19, TypeScript 6, Vite 8, localStorage persistence helpers, Node test runner, Playwright browser regression tests.

**Implementation Status:** Completed and extended. The cockpit model, reviewed-part filters, recipe readiness strip, export target profile persistence, next-action navigation, export target highlighting, and browser coverage are implemented. The same picker surface now respects the LPC runtime source model, including canonical LPC animations and compatible LPC sheet parts.

---

## Scope Check

The approved spec spans one UI/UX subsystem: the creator cockpit layer. It touches three existing UI surfaces and one shared derived-data module, but it does not change APES execution, LPC inventory generation, Duelyst staging, or export package formats. This can remain one plan.

## File Structure

- Create `src/creatorCockpit.ts`: shared types and pure helpers for export target metadata, selected-part readiness, and part search matching.
- Modify `src/appPersistence.ts`: add one localStorage key for the selected export target profile.
- Modify `src/App.tsx`: own/persist export target state, derive readiness, and pass next-action handlers to panels.
- Modify `src/screens/FastCreatorPanel.tsx`: render part search/filter controls, readiness strip, export target cue, and next actions.
- Modify `src/screens/ExportsPanel.tsx`: render export target selector/hints and highlight the recommended target action while preserving all current export buttons.
- Modify `src/App.css`: add scoped cockpit, readiness, filtered layer, and export target styles using existing tokens.
- Modify `tests/tools/harvest-helpers.test.mjs`: add pure helper tests for readiness/search/export metadata.
- Modify `tests/browser/regression.spec.ts`: add browser coverage for filtering, readiness visibility, export target persistence, and export screen accessibility.

## Task 1: Shared Cockpit Model

**Files:**
- Create: `src/creatorCockpit.ts`
- Modify: `tests/tools/harvest-helpers.test.mjs`

- [ ] **Step 1: Write failing helper tests**

Append this test block near the other helper tests in `tests/tools/harvest-helpers.test.mjs`:

```js
import {
  buildRecipeReadiness,
  exportTargetProfiles,
  filterReviewedPartsForLayer,
  getExportTargetProfile,
} from '../../src/creatorCockpit.ts'
```

Then add these tests before `function setAlpha`:

```js
test('creator cockpit readiness summarizes selected reviewed parts and warnings', () => {
  const parts = [
    makeExtractedPart({ part_id: 'reviewed_head', label: 'head', reviewed: true, warnings: ['credit/license missing'] }),
    makeExtractedPart({ part_id: 'draft_torso', label: 'torso', reviewed: false }),
  ]

  const readiness = buildRecipeReadiness({
    selectedPartIds: { head: 'reviewed_head', torso: 'draft_torso' },
    partLibrary: parts,
    layerLabels: ['head', 'torso', 'front_arm'],
  })

  assert.equal(readiness.selectedPartCount, 2)
  assert.equal(readiness.reviewedSelectedPartCount, 1)
  assert.equal(readiness.unreviewedSelectedPartCount, 1)
  assert.equal(readiness.missingReviewedLayerCount, 1)
  assert.equal(readiness.warningCount, 1)
  assert.equal(readiness.state, 'needs_review')
})

test('creator cockpit filters reviewed parts while keeping the selected part visible', () => {
  const parts = [
    makeExtractedPart({ part_id: 'apes_head', label: 'head', extraction_method: 'apes', tags: ['qa_harness'] }),
    makeExtractedPart({ part_id: 'manual_head', label: 'head', extraction_method: 'manual', tags: ['cleanup'] }),
    makeExtractedPart({ part_id: 'manual_torso', label: 'torso', extraction_method: 'manual' }),
  ]

  const filtered = filterReviewedPartsForLayer({
    reviewedParts: parts,
    label: 'head',
    query: 'qa',
    method: 'manual',
    selectedPartId: 'manual_head',
  })

  assert.deepEqual(filtered.map((part) => part.part_id), ['manual_head'])
})

test('creator cockpit export target lookup falls back to generic profile', () => {
  assert.equal(exportTargetProfiles.length, 5)
  assert.equal(getExportTargetProfile('godot_4').recommendedActionTestId, 'export-full-package-zip')
  assert.equal(getExportTargetProfile('not-real').id, 'generic')
})
```

Add this helper after `makeLayerBundle`:

```js
function makeExtractedPart(overrides = {}) {
  return {
    part_id: overrides.part_id ?? 'part_head',
    character_id: overrides.character_id ?? 'source_hero',
    label: overrides.label ?? 'head',
    source_animation: 'idle',
    source_direction: 'south',
    image_path: '/parts/head.png',
    mask_path: '/parts/head_mask.png',
    anchor: { x: 0, y: 0 },
    bounds: { x: 0, y: 0, w: 16, h: 16 },
    extraction_method: overrides.extraction_method ?? 'manual',
    compatibility: {
      animations: ['idle'],
      directions: ['south'],
    },
    reviewed: overrides.reviewed ?? true,
    tags: overrides.tags ?? [],
    warnings: overrides.warnings ?? [],
  }
}
```

- [ ] **Step 2: Run helper tests to verify failure**

Run:

```bash
npm run test:tools -- tests/tools/harvest-helpers.test.mjs
```

Expected: FAIL because `src/creatorCockpit.ts` does not exist.

- [ ] **Step 3: Implement `src/creatorCockpit.ts`**

Create `src/creatorCockpit.ts`:

```ts
import type { ExtractionMethod, ExtractedPart, PartLabel } from './types'

export type ExportTargetProfileId = 'generic' | 'godot_4' | 'unity_2d' | 'rpg_maker_mz' | 'aseprite'

export type ExportTargetProfile = {
  id: ExportTargetProfileId
  label: string
  hint: string
  recommendedActionTestId: string
}

export type RecipeReadinessState = 'ready' | 'needs_review' | 'incomplete'

export type RecipeReadiness = {
  selectedPartCount: number
  reviewedSelectedPartCount: number
  unreviewedSelectedPartCount: number
  missingReviewedLayerCount: number
  warningCount: number
  missingPartCount: number
  state: RecipeReadinessState
}

export type BuildRecipeReadinessInput = {
  selectedPartIds: Partial<Record<PartLabel, string>>
  partLibrary: ExtractedPart[]
  layerLabels: PartLabel[]
}

export type FilterReviewedPartsInput = {
  reviewedParts: ExtractedPart[]
  label: PartLabel
  query: string
  method: ExtractionMethod | 'all'
  selectedPartId?: string
}

export const defaultExportTargetProfileId: ExportTargetProfileId = 'generic'

export const exportTargetProfiles: ExportTargetProfile[] = [
  {
    id: 'generic',
    label: 'Generic package',
    hint: 'Use the full package zip or generic manifest when the target engine is not fixed yet.',
    recommendedActionTestId: 'export-full-package-zip',
  },
  {
    id: 'godot_4',
    label: 'Godot 4',
    hint: 'Use the full package zip for rendered PNGs plus Godot scene and SpriteFrames resources.',
    recommendedActionTestId: 'export-full-package-zip',
  },
  {
    id: 'unity_2d',
    label: 'Unity 2D',
    hint: 'Use the full package zip for PNGs plus Unity import metadata.',
    recommendedActionTestId: 'export-full-package-zip',
  },
  {
    id: 'rpg_maker_mz',
    label: 'RPG Maker MZ',
    hint: 'Use RPG Maker metadata after checking the current sheet and rendered frame outputs.',
    recommendedActionTestId: 'export-rpg-maker-metadata',
  },
  {
    id: 'aseprite',
    label: 'Aseprite',
    hint: 'Use the Aseprite reference with rendered frames when preparing editable art files.',
    recommendedActionTestId: 'export-aseprite-reference',
  },
]

export function isExportTargetProfileId(value: string): value is ExportTargetProfileId {
  return exportTargetProfiles.some((profile) => profile.id === value)
}

export function getExportTargetProfile(value: string): ExportTargetProfile {
  return exportTargetProfiles.find((profile) => profile.id === value) ?? exportTargetProfiles[0]
}

export function buildRecipeReadiness({ selectedPartIds, partLibrary, layerLabels }: BuildRecipeReadinessInput): RecipeReadiness {
  const selectedIds = layerLabels
    .map((label) => selectedPartIds[label])
    .filter((partId): partId is string => Boolean(partId))
  const selectedParts = selectedIds
    .map((partId) => partLibrary.find((part) => part.part_id === partId))
    .filter((part): part is ExtractedPart => Boolean(part))
  const missingPartCount = selectedIds.length - selectedParts.length
  const reviewedSelectedPartCount = selectedParts.filter((part) => part.reviewed).length
  const unreviewedSelectedPartCount = selectedParts.filter((part) => !part.reviewed).length
  const warningCount = selectedParts.reduce((count, part) => count + part.warnings.length, 0)
  const missingReviewedLayerCount = layerLabels.filter((label) => {
    const selectedPartId = selectedPartIds[label]
    if (!selectedPartId) return true
    return !partLibrary.some((part) => part.part_id === selectedPartId && part.reviewed)
  }).length
  const state: RecipeReadinessState =
    missingPartCount > 0 || missingReviewedLayerCount === layerLabels.length
      ? 'incomplete'
      : unreviewedSelectedPartCount > 0 || warningCount > 0 || missingReviewedLayerCount > 0
        ? 'needs_review'
        : 'ready'

  return {
    selectedPartCount: selectedIds.length,
    reviewedSelectedPartCount,
    unreviewedSelectedPartCount,
    missingReviewedLayerCount,
    warningCount,
    missingPartCount,
    state,
  }
}

export function filterReviewedPartsForLayer({ reviewedParts, label, query, method, selectedPartId }: FilterReviewedPartsInput) {
  const normalizedQuery = query.trim().toLowerCase()
  const matches = reviewedParts.filter((part) => {
    if (part.label !== label) return false
    if (method !== 'all' && part.extraction_method !== method) return false
    if (!normalizedQuery) return true
    const searchable = [
      part.part_id,
      part.character_id,
      part.extraction_method,
      ...part.tags,
      ...part.warnings,
    ].join(' ').toLowerCase()
    return searchable.includes(normalizedQuery)
  })
  const selectedPart = selectedPartId ? reviewedParts.find((part) => part.part_id === selectedPartId && part.label === label) : undefined
  if (selectedPart && !matches.some((part) => part.part_id === selectedPart.part_id)) {
    return [selectedPart, ...matches]
  }
  return matches
}
```

- [ ] **Step 4: Run helper tests to verify pass**

Run:

```bash
npm run test:tools -- tests/tools/harvest-helpers.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/creatorCockpit.ts tests/tools/harvest-helpers.test.mjs
git commit -m "Add creator cockpit helper model"
```

## Task 2: Persist Export Target And Derive Readiness In App

**Files:**
- Modify: `src/appPersistence.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add storage key**

In `src/appPersistence.ts`, add this near the other storage keys:

```ts
export const exportTargetProfileStorageKey = 'pixel_creator_export_target_profile'
```

- [ ] **Step 2: Wire imports and state in `App.tsx`**

Update imports in `src/App.tsx`:

```ts
import {
  buildRecipeReadiness,
  defaultExportTargetProfileId,
  getExportTargetProfile,
  isExportTargetProfileId,
  type ExportTargetProfileId,
} from './creatorCockpit'
```

Add `exportTargetProfileStorageKey` to the `appPersistence` import list.

Add this state near `filenameTemplate`:

```ts
const [exportTargetProfile, setExportTargetProfileState] = useState<ExportTargetProfileId>(() => {
  const stored = loadStoredString(exportTargetProfileStorageKey, defaultExportTargetProfileId)
  return isExportTargetProfileId(stored) ? stored : defaultExportTargetProfileId
})
```

Add this setter near other small state helper functions:

```ts
function setExportTargetProfile(value: ExportTargetProfileId) {
  setExportTargetProfileState(value)
  storeString(exportTargetProfileStorageKey, value)
}
```

Add this derived state after `recipe` is computed:

```ts
const recipeReadiness = useMemo(
  () => buildRecipeReadiness({ selectedPartIds, partLibrary, layerLabels: layerOrder }),
  [selectedPartIds, partLibrary],
)
const activeExportTargetProfile = getExportTargetProfile(exportTargetProfile)
```

- [ ] **Step 3: Add next-action handlers**

In `App.tsx`, add:

```ts
function openPartReview() {
  setScreen('library')
  setPartLibraryStatus('Review the selected or unreviewed parts before packaging this recipe.')
}

function openBatchGenerator() {
  setScreen('batch')
}

function openExports() {
  setScreen('exports')
  setExportStatus(`${activeExportTargetProfile.label} selected. ${activeExportTargetProfile.hint}`)
}

function openSettingsRepair() {
  setScreen('settings')
  setSettingsStatus('Check the indexed root and local tool availability before repairing or reindexing assets.')
}
```

- [ ] **Step 4: Pass props into panels**

Add these props to `FastCreatorPanel`:

```tsx
recipeReadiness={recipeReadiness}
exportTargetProfile={exportTargetProfile}
setExportTargetProfile={setExportTargetProfile}
openPartReview={openPartReview}
openBatchGenerator={openBatchGenerator}
openExports={openExports}
openSettingsRepair={openSettingsRepair}
createApesJob={createApesJob}
localToolsAvailable={localToolsAvailable}
```

Add these props to `ExportsPanel`:

```tsx
exportTargetProfile={exportTargetProfile}
setExportTargetProfile={setExportTargetProfile}
recipeReadiness={recipeReadiness}
```

- [ ] **Step 5: Run TypeScript to verify expected prop errors**

Run:

```bash
npm run build
```

Expected: FAIL because `FastCreatorPanelProps` and `ExportsPanelProps` do not define the new props yet. This confirms the App wiring is reaching the intended components.

Do not commit this task until Task 3 and Task 4 add the component props and the build passes.

## Task 3: Fast Creator Cockpit Controls

**Files:**
- Modify: `src/screens/FastCreatorPanel.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Update Fast Creator imports and props**

In `src/screens/FastCreatorPanel.tsx`, update imports:

```ts
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  exportTargetProfiles,
  filterReviewedPartsForLayer,
  getExportTargetProfile,
  type ExportTargetProfileId,
  type RecipeReadiness,
} from '../creatorCockpit'
```

Add these props to `FastCreatorPanelProps`:

```ts
recipeReadiness: RecipeReadiness
exportTargetProfile: ExportTargetProfileId
setExportTargetProfile: (value: ExportTargetProfileId) => void
openPartReview: () => void
openBatchGenerator: () => void
openExports: () => void
openSettingsRepair: () => void
createApesJob: () => void
localToolsAvailable: boolean
```

Destructure those props in the component parameter list.

- [ ] **Step 2: Add local filter state and metadata**

Inside `FastCreatorPanel`, after `reviewedParts`, add:

```ts
const [partSearch, setPartSearch] = useState('')
const [partMethodFilter, setPartMethodFilter] = useState<ExtractedPart['extraction_method'] | 'all'>('all')
const activeExportTarget = getExportTargetProfile(exportTargetProfile)
const availableMethods = useMemo(
  () => Array.from(new Set(reviewedParts.map((part) => part.extraction_method))).sort(),
  [reviewedParts],
)
```

- [ ] **Step 3: Render readiness and filters**

After the `recipe-controls` block, insert:

```tsx
<section className="cockpit-panel" aria-label="Recipe readiness">
  <div className={`readiness-strip ${recipeReadiness.state}`}>
    <span>
      <strong>{recipeReadiness.reviewedSelectedPartCount}</strong>
      reviewed selected
    </span>
    <span>
      <strong>{recipeReadiness.missingReviewedLayerCount}</strong>
      layers need reviewed parts
    </span>
    <span>
      <strong>{recipeReadiness.warningCount}</strong>
      warning(s)
    </span>
    <span>
      <strong>{activeExportTarget.label}</strong>
      target
    </span>
  </div>
  <div className="cockpit-controls">
    <label className="field">
      <span>Find approved parts</span>
      <input
        data-testid="fast-part-search"
        value={partSearch}
        onChange={(event) => setPartSearch(event.target.value)}
        placeholder="Search part id, source, method, tag, warning"
      />
    </label>
    <label className="field">
      <span>Method</span>
      <select
        data-testid="fast-part-method-filter"
        value={partMethodFilter}
        onChange={(event) => setPartMethodFilter(event.target.value as ExtractedPart['extraction_method'] | 'all')}
      >
        <option value="all">all methods</option>
        {availableMethods.map((method) => (
          <option key={method} value={method}>{slugLabel(method)}</option>
        ))}
      </select>
    </label>
    <label className="field">
      <span>Export target</span>
      <select
        data-testid="export-target-profile"
        value={exportTargetProfile}
        onChange={(event) => setExportTargetProfile(event.target.value as ExportTargetProfileId)}
      >
        {exportTargetProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>{profile.label}</option>
        ))}
      </select>
    </label>
  </div>
  <div className="next-actions" aria-label="Next actions">
    <button onClick={openPartReview}>Review parts</button>
    <button onClick={openBatchGenerator}>Generate variants</button>
    <button onClick={createApesJob}>Prepare APES job</button>
    <button className="primary" onClick={openExports}>Open {activeExportTarget.label}</button>
    <button onClick={openSettingsRepair} disabled={localToolsAvailable}>Check setup</button>
  </div>
</section>
```

- [ ] **Step 4: Apply filtering to each approved-part selector**

Replace:

```ts
const approvedOptions = reviewedParts.filter((part) => part.label === label)
```

with:

```ts
const approvedOptions = filterReviewedPartsForLayer({
  reviewedParts,
  label,
  query: partSearch,
  method: partMethodFilter,
  selectedPartId: selectedPartIds[label],
})
const totalApprovedOptions = reviewedParts.filter((part) => part.label === label).length
```

Replace the approved part `<span>` label with:

```tsx
<span>Approved part ({approvedOptions.length}/{totalApprovedOptions})</span>
```

- [ ] **Step 5: Add scoped styles**

Append to `src/App.css` before the media queries:

```css
.cockpit-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(12, 17, 24, 0.38);
}

.readiness-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.readiness-strip span {
  min-height: 48px;
  display: grid;
  align-content: center;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--control);
  color: var(--text-muted);
  font-size: 12px;
}

.readiness-strip strong {
  color: var(--text-strong);
  font-size: 14px;
}

.readiness-strip.ready span {
  border-color: rgba(108, 214, 143, 0.46);
}

.readiness-strip.needs_review span {
  border-color: rgba(246, 207, 120, 0.5);
}

.readiness-strip.incomplete span {
  border-color: rgba(255, 154, 154, 0.45);
}

.cockpit-controls {
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) minmax(150px, 0.7fr) minmax(180px, 0.8fr);
  gap: 10px;
}

.next-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

Inside the existing `@media (max-width: 980px)` block, add:

```css
  .cockpit-controls,
  .readiness-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
```

Inside the existing `@media (max-width: 560px)` block, add:

```css
  .cockpit-controls,
  .readiness-strip {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 6: Run build to check Task 2 and Task 3 integration**

Run:

```bash
npm run build
```

Expected: FAIL only on `ExportsPanel` missing new props if Task 4 is not done yet, or PASS if Task 4 has already been completed.

Do not commit until Task 4 completes and the build passes.

## Task 4: Export Target UI

**Files:**
- Modify: `src/screens/ExportsPanel.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Update Exports imports and props**

In `src/screens/ExportsPanel.tsx`, add:

```ts
import {
  exportTargetProfiles,
  getExportTargetProfile,
  type ExportTargetProfileId,
  type RecipeReadiness,
} from '../creatorCockpit'
```

Add these props to `ExportsPanelProps`:

```ts
exportTargetProfile: ExportTargetProfileId
setExportTargetProfile: (value: ExportTargetProfileId) => void
recipeReadiness: RecipeReadiness
```

Destructure them in the component parameter list.

- [ ] **Step 2: Add active profile and recommended helper**

Inside `ExportsPanel`, after `filenamePreview`, add:

```ts
const activeExportTarget = getExportTargetProfile(exportTargetProfile)

function targetButtonClass(testId: string, baseClass = '') {
  return [baseClass, activeExportTarget.recommendedActionTestId === testId ? 'recommended-export' : '']
    .filter(Boolean)
    .join(' ')
}
```

- [ ] **Step 3: Render target selector**

After the validation grid, insert:

```tsx
<section className="export-target-panel" aria-label="Export target profile">
  <label className="field">
    <span>Export target</span>
    <select
      data-testid="exports-target-profile"
      value={exportTargetProfile}
      onChange={(event) => setExportTargetProfile(event.target.value as ExportTargetProfileId)}
    >
      {exportTargetProfiles.map((profile) => (
        <option key={profile.id} value={profile.id}>{profile.label}</option>
      ))}
    </select>
  </label>
  <div>
    <strong>{activeExportTarget.label}</strong>
    <span>{activeExportTarget.hint}</span>
    <span>{recipeReadiness.state === 'ready' ? 'Recipe readiness is clean.' : `Recipe readiness is ${recipeReadiness.state.replace('_', ' ')}.`}</span>
  </div>
</section>
```

- [ ] **Step 4: Mark recommended export buttons without hiding any actions**

Update button class names in the export grid:

```tsx
<button className={targetButtonClass('export-generic-manifest', 'primary')} data-testid="export-generic-manifest" onClick={exportGeneric}>Download generic manifest</button>
<button className={targetButtonClass('export-full-package-manifest', 'primary')} data-testid="export-full-package-manifest" onClick={() => void exportFullPackageManifest()}>Download full package manifest</button>
<button className={targetButtonClass('export-rendered-frame-set')} data-testid="export-rendered-frame-set" onClick={() => void exportRenderedFrameSet()}>Download rendered frame set</button>
<button className={targetButtonClass('export-full-package-zip', 'primary')} data-testid="export-full-package-zip" onClick={() => void exportFullPackageZip()}>Download full package zip</button>
<button className={targetButtonClass('export-rendered-frame-zip')} data-testid="export-rendered-frame-zip" onClick={() => void exportRenderedFrameSetZip()}>Download rendered frame zip</button>
```

Add missing test ids to target-specific buttons:

```tsx
<button data-testid="export-godot-scene" onClick={exportGodotScene}>Download Godot scene</button>
<button data-testid="export-sprite-frames" onClick={() => void exportSpriteFrames()}>Download SpriteFrames resource</button>
<button data-testid="export-unity-metadata" onClick={exportUnityMetadata}>Download Unity 2D metadata</button>
<button data-testid="export-rpg-maker-metadata" className={targetButtonClass('export-rpg-maker-metadata')} onClick={exportRpgMakerMetadata}>Download RPG Maker MZ metadata</button>
<button data-testid="export-aseprite-reference" className={targetButtonClass('export-aseprite-reference')} onClick={exportAsepriteReference}>Download Aseprite reference</button>
```

- [ ] **Step 5: Add export target styles**

Append to `src/App.css` near the cockpit styles:

```css
.export-target-panel {
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(12, 17, 24, 0.38);
}

.export-target-panel > div {
  display: grid;
  gap: 4px;
}

.export-target-panel strong {
  color: var(--text-strong);
}

.export-target-panel span {
  color: var(--text-muted);
  font-size: 12px;
}

button.recommended-export {
  border-color: rgba(108, 214, 143, 0.72);
  box-shadow: inset 0 0 0 1px rgba(108, 214, 143, 0.18);
}
```

Inside `@media (max-width: 560px)`, add:

```css
  .export-target-panel {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Tasks 2-4 together**

```bash
git add src/appPersistence.ts src/App.tsx src/screens/FastCreatorPanel.tsx src/screens/ExportsPanel.tsx src/App.css
git commit -m "Add creator cockpit UI"
```

## Task 5: Browser Regression Coverage

**Files:**
- Modify: `tests/browser/regression.spec.ts`

- [ ] **Step 1: Add browser regression test**

Append this test after `recipe save-load and bulk review actions stay usable`:

```ts
test('creator cockpit filters parts and persists export target profile', async ({ page }) => {
  await page.getByTestId('nav-workstation').click()
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByRole('button', { name: /Preset regions/i }).click()
  await page.getByTestId('extract-current-region').click()

  await page.getByTestId('nav-library').click()
  await page.getByTestId('part-library-method-filter').selectOption('preset_region')
  await page.getByTestId('mark-visible-reviewed').click()

  await page.getByTestId('nav-fast').click()
  await expect(page.getByRole('region', { name: 'Recipe readiness' })).toBeVisible()
  await expect(page.getByTestId('fast-part-search')).toBeVisible()
  await page.getByTestId('fast-part-method-filter').selectOption('preset_region')
  await page.getByTestId('fast-part-search').fill('manual-only-no-match')
  await expect(page.getByText(/Approved part \(0\/1\)/).first()).toBeVisible()
  await page.getByTestId('fast-part-search').fill('preset')
  await expect(page.getByText(/Approved part \(1\/1\)/).first()).toBeVisible()

  await page.getByTestId('export-target-profile').selectOption('rpg_maker_mz')
  await page.getByRole('button', { name: /Open RPG Maker MZ/i }).click()
  await expect(page.getByTestId('exports-target-profile')).toHaveValue('rpg_maker_mz')
  await expect(page.getByTestId('export-rpg-maker-metadata')).toBeVisible()
  await expect(page.getByTestId('export-rpg-maker-metadata')).toHaveClass(/recommended-export/)
  await expect(page.getByTestId('export-full-package-zip')).toBeVisible()

  await page.reload()
  await page.locator('#character').waitFor()
  await page.getByTestId('nav-exports').click()
  await expect(page.getByTestId('exports-target-profile')).toHaveValue('rpg_maker_mz')
})
```

- [ ] **Step 2: Run browser test to verify behavior**

Run:

```bash
npm run test:browser -- --grep "creator cockpit"
```

Expected: PASS.

- [ ] **Step 3: Commit browser coverage**

```bash
git add tests/browser/regression.spec.ts
git commit -m "Cover creator cockpit workflow"
```

## Task 6: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 2: Run tool tests**

Run:

```bash
npm run test:tools
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run targeted browser test**

Run:

```bash
npm run test:browser -- --grep "creator cockpit"
```

Expected: PASS.

- [ ] **Step 5: Check git status**

Run:

```bash
git status --short
```

Expected: only intentional untracked companion scratch files remain, or a clean working tree if `.superpowers/` has been removed or ignored.

Do not commit `.superpowers/`.
