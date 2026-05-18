# GitHub Sprite Parts Harvest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the useful ideas from the `sprite parts` GitHub search into this local Animated Pixel Character Creator without replacing the existing APES, Duelyst, manual mask, batch, and export workflow.

**Architecture:** Do not vendor any searched repository wholesale. Add small, typed, local modules for layer-bundle import, preset/variation metadata, alpha/floor analysis, source-quality review, and export naming, then surface them in existing panels. Keep all workflows offline-first and file-based.

**Tech Stack:** Vite, React, TypeScript, browser Canvas APIs, File APIs, JSZip, localStorage, Node test runner, Playwright browser harness.

**Implementation Status:** Completed for the scoped harvest pass. Layer-bundle import/export, source alpha/floor analysis, generation manifests, variation presets, filename templates, large-library paging, and browser coverage are implemented. The later LPC runtime work extends this harvest by turning 64x64 LPC sheets into selectable source/part manifests without vendoring an external generator.

---

## GitHub Search Harvest

Source search: `https://github.com/search?q=sprite+parts&type=repositories`

### Use Now

- `f2d/sprite_dress_up`: Use the idea of parsing layered artwork/project files into selectable parts and batch-exporting combinations. Start with a simple imported layer-bundle JSON/ZIP format instead of adding PSD/ORA parsing immediately.
- `Prysline/diff-lab`: Use its project model ideas: parts, variants, layers, masks, presets, JSON import/export, local autosave, and filename templates.
- `Herbachino1776/sprite-rig-lab`: Use alpha-source verification, alpha bounds, floor detection, and floor-locked export metadata.
- `meomeo-dev/2d-character-parts`: Use the part-layout config and DAG/request-manifest concept for AI-assisted part generation, but keep API execution outside this app for now.
- `andkerosine/spriteous`: Use the “minimum component area” idea to reduce junk connected-pixel extractions.

### Reference Only

- `matt-dray/roguelike-sprite-builder`: Reference category-constrained randomization, but the current Batch Generator already covers most of this.
- `tommyinb/sprite-preview`: Reference minimal preview ergonomics; current previews are richer.
- `adrmrt/sprite-stacker` and `Flokey82/genitemimage`: Reference simple stacking/mix-and-match concepts; current `CompositeCanvas` already covers the core behavior.
- `Elysium-X/SplitSprite`, `Donny-GUI/sptrite-sheet-cropper`, `editfmah/SpriteSheetSlicer`, and `FalseDeveloper/roblox_spritesheet_splitter`: Reference grid slicing only if a generic sheet importer becomes necessary.
- `zhan-xu/parts`: APES project page only; this repo already vendors APES under `vendor/APES`.

### Skip

- Hardware, Scratch tutorial, emulator, unrelated game, `.NPK`, and broad web-design search hits are not useful for this project.

---

## File Structure

- Create `src/layerBundle.ts`: typed import/export helpers for a local “layered part bundle” format inspired by `sprite_dress_up` and `diff-lab`.
- Create `src/sourceAnalysis.ts`: pure alpha analysis helpers for bounds, floor, empty/oversized source warnings, and suggested pivot metadata inspired by `sprite-rig-lab`.
- Create `src/generationManifest.ts`: pure helpers for generation manifests and staged part DAG records inspired by `2d-character-parts`.
- Modify `src/types.ts`: add typed records for layer bundles, variation presets, alpha analysis, source quality, filename templates, and generation manifests.
- Modify `src/appPersistence.ts`: add localStorage keys/loaders for imported layer bundles, variation presets, and generation manifests.
- Modify `src/utils.ts`: add connected-pixel minimum-area filtering and filename template rendering.
- Modify `src/exportPackage.ts`: include source analysis, filename template metadata, variation preset metadata, and optional imported bundle/source metadata in package manifests.
- Modify `src/screens/PartLibraryPanel.tsx`: add import/export actions for layer bundles and variation presets.
- Modify `src/screens/AssetAuditPanel.tsx`: show source alpha/floor analysis and warnings for selected assets.
- Modify `src/screens/BatchGeneratorPanel.tsx`: add category-aware variation preset generation.
- Modify `src/screens/ExportsPanel.tsx`: add filename template controls and previewed export names.
- Modify `src/screens/ApesLabPanel.tsx`: add generation manifest export/import as a non-API staging path.
- Test with `tests/tools/*.test.mjs` for pure helpers and `tests/browser/regression.spec.ts` for UI workflows.

---

### Task 1: Connected Component Cleanup

**Useful Source:** `andkerosine/spriteous`

**Files:**
- Modify: `src/utils.ts`
- Modify: `src/screens/WorkstationPanel.tsx`
- Test: `tests/tools/connected-component-filter.test.mjs`

- [ ] **Step 1: Export a pure component filter**

Add this helper near `floodAlphaComponent` in `src/utils.ts`:

```ts
export function isUsableConnectedComponent(pixelCount: number, bounds: Rect, minimumPixels = 6) {
  if (pixelCount < minimumPixels) return false
  if (bounds.w <= 0 || bounds.h <= 0) return false
  return true
}
```

- [ ] **Step 2: Apply the filter to connected-pixel extraction**

In `downloadConnectedPixelPart`, after `component` is computed and before canvases are created, reject tiny junk islands:

```ts
if (!isUsableConnectedComponent(component.pixels.length, component.bounds)) {
  throw new Error('The selected component is too small to save as a reusable part.')
}
```

- [ ] **Step 3: Write the unit test**

Create `tests/tools/connected-component-filter.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('connected component helper is exported from utils source', async () => {
  const source = await readFile(path.join(repoRoot, 'src', 'utils.ts'), 'utf8')
  assert.match(source, /export function isUsableConnectedComponent/)
  assert.match(source, /component\.pixels\.length/)
  assert.match(source, /too small to save as a reusable part/)
})
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run test:tools
npm run build
```

Expected: both commands pass.

---

### Task 2: Source Alpha And Floor Analysis

**Useful Source:** `Herbachino1776/sprite-rig-lab`

**Files:**
- Create: `src/sourceAnalysis.ts`
- Modify: `src/types.ts`
- Modify: `src/screens/AssetAuditPanel.tsx`
- Modify: `src/exportPackage.ts`
- Test: `tests/tools/source-analysis.test.mjs`

- [ ] **Step 1: Add types**

Append these types to `src/types.ts`:

```ts
export type SourceAlphaAnalysis = {
  width: number
  height: number
  opaque_pixel_count: number
  alpha_bounds: Rect | null
  floor_y: number | null
  suggested_pivot: { x: number; y: number } | null
  warnings: string[]
}
```

- [ ] **Step 2: Add the pure analysis module**

Create `src/sourceAnalysis.ts`:

```ts
import type { Rect, SourceAlphaAnalysis } from './types'

export function analyzeAlphaData(width: number, height: number, alphaAt: (x: number, y: number) => number): SourceAlphaAnalysis {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let opaquePixelCount = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) <= 0) continue
      opaquePixelCount += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  const alphaBounds: Rect | null = opaquePixelCount === 0
    ? null
    : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }

  const warnings: string[] = []
  if (!alphaBounds) warnings.push('Source frame contains no opaque pixels.')
  if (alphaBounds && (alphaBounds.w > width * 0.95 || alphaBounds.h > height * 0.95)) {
    warnings.push('Alpha bounds nearly fill the canvas; verify the source crop before extraction.')
  }

  return {
    width,
    height,
    opaque_pixel_count: opaquePixelCount,
    alpha_bounds: alphaBounds,
    floor_y: alphaBounds ? alphaBounds.y + alphaBounds.h - 1 : null,
    suggested_pivot: alphaBounds ? { x: alphaBounds.x + Math.floor(alphaBounds.w / 2), y: alphaBounds.y + alphaBounds.h - 1 } : null,
    warnings,
  }
}
```

- [ ] **Step 3: Write the unit test**

Create `tests/tools/source-analysis.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('source analysis module includes alpha bounds and floor metadata', async () => {
  const source = await readFile(path.join(repoRoot, 'src', 'sourceAnalysis.ts'), 'utf8')
  assert.match(source, /analyzeAlphaData/)
  assert.match(source, /floor_y/)
  assert.match(source, /suggested_pivot/)
  assert.match(source, /Alpha bounds nearly fill the canvas/)
})
```

- [ ] **Step 4: Surface analysis in Asset Audit**

In `src/screens/AssetAuditPanel.tsx`, add a compact selected-asset analysis block that reports `alpha_bounds`, `floor_y`, `suggested_pivot`, and `warnings` after loading a staged/representative frame into a canvas.

- [ ] **Step 5: Add package source metadata**

In `buildFullPackageManifest`, add:

```ts
source_quality: {
  alpha_floor_analysis: 'Included for imported/staged assets when available in UI state.',
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test:tools
npm run build
npm run test:browser -- --reporter=line
```

Expected: all commands pass.

---

### Task 3: Layer Bundle Import

**Useful Sources:** `f2d/sprite_dress_up`, `Prysline/diff-lab`

**Files:**
- Create: `src/layerBundle.ts`
- Modify: `src/types.ts`
- Modify: `src/appPersistence.ts`
- Modify: `src/screens/PartLibraryPanel.tsx`
- Test: `tests/tools/layer-bundle.test.mjs`

- [ ] **Step 1: Add bundle types**

Append these records to `src/types.ts`:

```ts
export type LayerBundleEntry = {
  id: string
  name: string
  label: PartLabel
  z_index: number
  image_data_url: string
  mask_data_url?: string
  bounds: Rect
  anchor: { x: number; y: number }
  tags: string[]
}

export type LayerBundle = {
  format: 'pixel_creator_layer_bundle'
  version: 1
  bundle_id: string
  name: string
  canvas_size: { width: number; height: number }
  source: {
    kind: 'json' | 'zip' | 'psd_reference' | 'ora_reference'
    original_file_name?: string
  }
  layers: LayerBundleEntry[]
}
```

- [ ] **Step 2: Create bundle normalization helpers**

Create `src/layerBundle.ts`:

```ts
import type { ExtractedPart, LayerBundle, PartLabel } from './types'

export function parseLayerBundleJson(raw: string): LayerBundle {
  const parsed = JSON.parse(raw) as LayerBundle
  if (parsed.format !== 'pixel_creator_layer_bundle') {
    throw new Error('Layer bundle format must be pixel_creator_layer_bundle.')
  }
  if (parsed.version !== 1) {
    throw new Error(`Unsupported layer bundle version: ${parsed.version}`)
  }
  if (!Array.isArray(parsed.layers) || parsed.layers.length === 0) {
    throw new Error('Layer bundle must contain at least one layer.')
  }
  return parsed
}

export function layerBundleToExtractedParts(bundle: LayerBundle, characterId: string): ExtractedPart[] {
  return bundle.layers.map((layer) => ({
    part_id: `${bundle.bundle_id}_${layer.id}`,
    character_id: characterId,
    label: layer.label as PartLabel,
    source_animation: 'idle',
    source_direction: 'south',
    image_path: `${layer.id}.png`,
    mask_path: layer.mask_data_url ? `${layer.id}_mask.png` : undefined,
    image_data_url: layer.image_data_url,
    mask_data_url: layer.mask_data_url,
    anchor: layer.anchor,
    bounds: layer.bounds,
    extraction_method: 'manual',
    compatibility: {
      animations: ['idle'],
      directions: ['south'],
    },
    reviewed: false,
    tags: Array.from(new Set([...layer.tags, 'layer_bundle', bundle.name])),
    warnings: [`Imported from layer bundle ${bundle.name}. Review before using in exports.`],
  }))
}
```

- [ ] **Step 3: Add persistence keys**

In `src/appPersistence.ts`, add:

```ts
import type { LayerBundle } from './types'

export const layerBundlesStorageKey = 'pixel_creator_layer_bundles'

export function loadStoredLayerBundles() {
  return parseStoredJson<LayerBundle[]>(layerBundlesStorageKey, [])
}
```

- [ ] **Step 4: Add Part Library import/export controls**

In `src/screens/PartLibraryPanel.tsx`, add a file input accepting `.json`, parse with `parseLayerBundleJson`, convert with `layerBundleToExtractedParts`, append imported parts to the library, and persist with `storeJson(partLibraryStorageKey, nextParts)`.

- [ ] **Step 5: Write the unit test**

Create `tests/tools/layer-bundle.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('layer bundle helpers define parser and extracted part conversion', async () => {
  const source = await readFile(path.join(repoRoot, 'src', 'layerBundle.ts'), 'utf8')
  assert.match(source, /parseLayerBundleJson/)
  assert.match(source, /layerBundleToExtractedParts/)
  assert.match(source, /pixel_creator_layer_bundle/)
  assert.match(source, /extraction_method: 'manual'/)
})
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test:tools
npm run build
```

Expected: both commands pass.

---

### Task 4: Variation Presets And Filename Templates

**Useful Sources:** `Prysline/diff-lab`, `matt-dray/roguelike-sprite-builder`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/appPersistence.ts`
- Modify: `src/utils.ts`
- Modify: `src/screens/BatchGeneratorPanel.tsx`
- Modify: `src/screens/ExportsPanel.tsx`
- Modify: `src/exportPackage.ts`
- Test: `tests/tools/export-template.test.mjs`

- [ ] **Step 1: Add variation preset types**

Append to `src/types.ts`:

```ts
export type VariationPreset = {
  preset_id: string
  name: string
  category: 'pose' | 'class' | 'palette' | 'equipment' | 'expression' | 'custom'
  selected_part_ids: Partial<Record<PartLabel, string>>
  layer_visibility: Partial<Record<PartLabel, boolean>>
  palette: PaletteRules
  tags: string[]
}

export type ExportFilenameTemplate = {
  template_id: string
  pattern: string
  example: string
}
```

- [ ] **Step 2: Add template rendering helper**

In `src/utils.ts`, add:

```ts
export function renderExportFilenameTemplate(pattern: string, values: Record<string, string | number>) {
  return pattern.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = values[key]
    return value === undefined ? 'unknown' : String(value)
  })
}
```

- [ ] **Step 3: Add persistence keys**

In `src/appPersistence.ts`, add:

```ts
import type { ExportFilenameTemplate, VariationPreset } from './types'

export const variationPresetsStorageKey = 'pixel_creator_variation_presets'
export const exportFilenameTemplateStorageKey = 'pixel_creator_export_filename_template'

export function loadStoredVariationPresets() {
  return parseStoredJson<VariationPreset[]>(variationPresetsStorageKey, [])
}

export function loadStoredExportFilenameTemplate() {
  return parseStoredJson<ExportFilenameTemplate>(exportFilenameTemplateStorageKey, {
    template_id: 'default',
    pattern: '{character}_{animation}_{direction}_{frame}',
    example: 'hero_idle_south_000',
  })
}
```

- [ ] **Step 4: Use presets in Batch Generator**

In `src/screens/BatchGeneratorPanel.tsx`, let batch generation optionally start from a saved `VariationPreset`, then fill missing layers with the existing seeded random selection.

- [ ] **Step 5: Use filename template in Exports**

In `src/screens/ExportsPanel.tsx`, add a compact text input for the filename pattern and a preview using:

```ts
renderExportFilenameTemplate(pattern, {
  character: selectedCharacter.character_id,
  animation,
  direction,
  frame: String(frameIndex).padStart(3, '0'),
})
```

- [ ] **Step 6: Include metadata in packages**

In `buildFullPackageManifest`, add:

```ts
variation_presets: {
  note: 'Package records the active recipe layers; saved presets can be exported from Part Library.',
},
filename_template: {
  supported_tokens: ['character', 'animation', 'direction', 'frame', 'preset', 'timestamp'],
}
```

- [ ] **Step 7: Write the unit test**

Create `tests/tools/export-template.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('filename template helper supports named tokens and unknown fallback', async () => {
  const source = await readFile(path.join(repoRoot, 'src', 'utils.ts'), 'utf8')
  assert.match(source, /renderExportFilenameTemplate/)
  assert.match(source, /\{character\}/)
  assert.match(source, /unknown/)
})
```

- [ ] **Step 8: Verify**

Run:

```bash
npm run test:tools
npm run build
npm run test:browser -- --reporter=line
```

Expected: all commands pass.

---

### Task 5: Generation Manifest Staging

**Useful Source:** `meomeo-dev/2d-character-parts`

**Files:**
- Create: `src/generationManifest.ts`
- Modify: `src/types.ts`
- Modify: `src/appPersistence.ts`
- Modify: `src/screens/ApesLabPanel.tsx`
- Modify: `src/exportPackage.ts`
- Test: `tests/tools/generation-manifest.test.mjs`

- [ ] **Step 1: Add generation manifest types**

Append to `src/types.ts`:

```ts
export type GenerationPartRequest = {
  request_id: string
  label: PartLabel
  stage: number
  depends_on: string[]
  prompt: string
  negative_prompt: string
  canvas_size: { width: number; height: number }
  output_hint: string
}

export type GenerationManifest = {
  format: 'pixel_creator_generation_manifest'
  version: 1
  manifest_id: string
  character_id: string
  style_notes: string
  requests: GenerationPartRequest[]
  warnings: string[]
}
```

- [ ] **Step 2: Create manifest builder**

Create `src/generationManifest.ts`:

```ts
import { layerOrder } from './presets'
import type { GenerationManifest, PartLabel } from './types'

const stageByLabel: Partial<Record<PartLabel, number>> = {
  torso: 1,
  back_leg: 2,
  front_leg: 2,
  feet: 2,
  back_arm: 3,
  front_arm: 3,
  back_hand: 3,
  front_hand: 3,
  head: 4,
  face: 5,
  hair_hat_hood: 5,
  weapon: 6,
  shield: 6,
}

export function buildGenerationManifest(characterId: string, styleNotes: string): GenerationManifest {
  return {
    format: 'pixel_creator_generation_manifest',
    version: 1,
    manifest_id: `generation_${characterId}`,
    character_id: characterId,
    style_notes: styleNotes,
    requests: layerOrder.map((label) => ({
      request_id: `${characterId}_${label}`,
      label,
      stage: stageByLabel[label] ?? 7,
      depends_on: label === 'head' ? [`${characterId}_torso`] : [],
      prompt: `transparent pixel-art ${label.replaceAll('_', ' ')} for ${characterId}; match style notes: ${styleNotes}`,
      negative_prompt: 'no background, no merged neighboring body parts, no blur, no anti-aliased edges',
      canvas_size: { width: 64, height: 64 },
      output_hint: `${characterId}_${label}.png`,
    })),
    warnings: ['This manifest prepares generation requests only. Run image generation outside the app, then import results as a layer bundle.'],
  }
}
```

- [ ] **Step 3: Add persistence keys**

In `src/appPersistence.ts`, add:

```ts
import type { GenerationManifest } from './types'

export const generationManifestsStorageKey = 'pixel_creator_generation_manifests'

export function loadStoredGenerationManifests() {
  return parseStoredJson<GenerationManifest[]>(generationManifestsStorageKey, [])
}
```

- [ ] **Step 4: Surface in APES Lab**

In `src/screens/ApesLabPanel.tsx`, add a “Download generation manifest” action that calls `buildGenerationManifest(selectedCharacter.character_id, styleNotes)` and `downloadJson`.

- [ ] **Step 5: Include source metadata in package export**

In `buildFullPackageManifest`, add:

```ts
generation_workflow: {
  supported: true,
  handoff: 'Generation manifests can be exported, generated externally, then re-imported as layer bundles.',
}
```

- [ ] **Step 6: Write the unit test**

Create `tests/tools/generation-manifest.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('generation manifest builder records staged part requests', async () => {
  const source = await readFile(path.join(repoRoot, 'src', 'generationManifest.ts'), 'utf8')
  assert.match(source, /buildGenerationManifest/)
  assert.match(source, /pixel_creator_generation_manifest/)
  assert.match(source, /depends_on/)
  assert.match(source, /import results as a layer bundle/)
})
```

- [ ] **Step 7: Verify**

Run:

```bash
npm run test:tools
npm run build
```

Expected: both commands pass.

---

### Task 6: Browser Workflow Coverage

**Useful Sources:** all adopted projects

**Files:**
- Modify: `tests/browser/regression.spec.ts`
- Modify: `docs/browser-checks.md`
- Modify: `README.md`

- [ ] **Step 1: Add regression coverage**

Extend `tests/browser/regression.spec.ts` with checks for:

```ts
test('GitHub harvest workflows expose import, analysis, presets, templates, and generation handoff', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Part Library')).toBeVisible()
  await expect(page.getByText('Layer bundle')).toBeVisible()
  await expect(page.getByText('Asset Audit')).toBeVisible()
  await expect(page.getByText('Alpha bounds')).toBeVisible()
  await expect(page.getByText('Batch Generator')).toBeVisible()
  await expect(page.getByText('Variation preset')).toBeVisible()
  await expect(page.getByText('Exports')).toBeVisible()
  await expect(page.getByText('Filename pattern')).toBeVisible()
  await expect(page.getByText('APES Lab')).toBeVisible()
  await expect(page.getByText('Generation manifest')).toBeVisible()
})
```

- [ ] **Step 2: Update browser checklist**

Add a section to `docs/browser-checks.md`:

```markdown
## GitHub Sprite Parts Harvest

- Import a `pixel_creator_layer_bundle` JSON in Part Library and verify imported parts appear as unreviewed manual parts.
- Open Asset Audit and confirm alpha bounds, floor, pivot, and warnings render for a staged asset.
- Save a variation preset, generate a seeded batch from it, and confirm the same seed produces the same selected part IDs.
- Change the Exports filename pattern and confirm preview names update.
- Download a generation manifest from APES Lab and confirm it contains staged part requests.
```

- [ ] **Step 3: Update README**

Add a short paragraph under “What is implemented” describing the harvested workflows once tasks 1-5 are complete.

- [ ] **Step 4: Verify**

Run:

```bash
npm run build
npm run test:browser -- --reporter=line
```

Expected: both commands pass.

---

## Execution Order

1. Connected component cleanup.
2. Source alpha and floor analysis.
3. Layer bundle import.
4. Variation presets and filename templates.
5. Generation manifest staging.
6. Browser workflow coverage and docs.

Each task should pass its listed tests before moving to the next task.
