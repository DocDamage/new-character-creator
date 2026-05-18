# Release Polish Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the remaining non-blocking release risks: local server organization, import validation, LPC sheet usability, large part persistence, large library rendering, placeholder provenance, accessibility coverage, and private-asset testing.

**Architecture:** Keep app behavior unchanged where possible while moving risky logic into focused modules with tests. Browser-only storage remains optional with safe localStorage fallback. Local-machine tooling stays available only through explicit local Vite middleware and never ships private assets in the release package.

**Tech Stack:** React 19, TypeScript, Vite middleware, IndexedDB, Node test runner, Playwright.

**Implementation Status:** Completed and extended. Local tool middleware is shared by dev/preview, project-local file serving is restricted, layer-bundle validation is hardened, large part payloads use IndexedDB-backed storage, Part Library paging is implemented, placeholder APES provenance is exported, private-asset testing is opt-in, and LPC usability now includes runtime source manifests with canonical animation labels and compatible sheet-part choices.

---

### Task 1: Split Local Tool Middleware

**Files:**
- Create: `tools/localToolsServer.ts`
- Modify: `vite.config.ts`
- Test: `tools/check-preview-local-tools.js`

- [ ] **Step 1: Move local middleware and helpers from `vite.config.ts` into `tools/localToolsServer.ts`**

Export `createLocalAssetToolsPlugin(appRoot: string)` and keep the existing route behavior for `/assets`, `/__local/health`, `/__local/asset-tools`, `/__local/apes-tools`, `/__local/apes-output`, and `/@fs`.

- [ ] **Step 2: Restrict `/@fs` serving**

Only serve project-root files under `data/cache`, `data/apes/output`, `public/data/qa`, and `assets`. Return 403 for any other app-root path.

- [ ] **Step 3: Update `vite.config.ts`**

Import `createLocalAssetToolsPlugin` and remove the duplicated server implementation.

- [ ] **Step 4: Verify preview local tools**

Run: `npm run build && npm run test:preview-tools`

Expected: PASS.

### Task 2: Harden Layer Bundle Validation

**Files:**
- Modify: `src/layerBundle.ts`
- Modify: `tests/tools/harvest-helpers.test.mjs`

- [ ] **Step 1: Add validation**

`parseLayerBundleManifest` must reject malformed JSON shape, invalid labels, duplicate ids, missing image sources, invalid bounds, path traversal, and Windows absolute paths.

- [ ] **Step 2: Add tests**

Add assertions for valid bundles, duplicate ids, invalid labels, bad bounds, and unsafe paths.

- [ ] **Step 3: Verify**

Run: `npm run test:tools`

Expected: PASS.

### Task 3: Make LPC Imported Parts Render as Frames

**Files:**
- Modify: `src/layerBundle.ts`
- Modify: `src/CompositeCanvas.tsx`
- Modify: `src/exportPackage.ts`
- Modify: `tests/tools/harvest-helpers.test.mjs`

- [ ] **Step 1: Use the first LPC frame as the default source crop**

Generated LPC parts should use `bounds: { x: 0, y: 0, w: frame_width, h: frame_height }`, tags for credit review, and warnings that keep license review visible.

- [ ] **Step 2: Render sheet crops correctly**

When an imported part image is larger than the part bounds, crop from `bounds.x/y` instead of squeezing the entire sheet into the destination.

- [ ] **Step 3: Verify**

Run: `npm run test:tools && npm run test:browser -- --reporter=line`

Expected: PASS.

### Task 4: Move Large Part Assets to IndexedDB

**Files:**
- Create: `src/partAssetStore.ts`
- Modify: `src/types.ts`
- Modify: `src/appPersistence.ts`
- Modify: `src/App.tsx`
- Test: `tests/tools/harvest-helpers.test.mjs`

- [ ] **Step 1: Add optional asset-key fields**

Add `image_asset_key?: string` and `mask_asset_key?: string` to `ExtractedPart`.

- [ ] **Step 2: Add IndexedDB helpers**

Create `persistPartLibraryAssets(parts)` and `hydratePartLibraryAssets(parts)`. Large `data:` URLs go into IndexedDB and metadata stores only keys. If IndexedDB is unavailable, keep inline assets.

- [ ] **Step 3: Wire persistence**

Hydrate the loaded Part Library on startup. Persist metadata with stripped large assets after imports/edits.

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run test:browser -- --reporter=line`

Expected: PASS.

### Task 5: Page the Part Library

**Files:**
- Modify: `src/screens/PartLibraryPanel.tsx`
- Modify: `tests/browser/regression.spec.ts`

- [ ] **Step 1: Add visible limit**

Render the first 100 filtered parts, with a `Show 100 more` button and status text.

- [ ] **Step 2: Reset on filters**

Changing method, label, review, or query resets the visible limit to 100.

- [ ] **Step 3: Verify**

Run: `npm run test:browser -- --reporter=line`

Expected: PASS.

### Task 6: Add Placeholder Mode Provenance

**Files:**
- Modify: `src/screens/SettingsPanel.tsx`
- Modify: `src/utils.ts`
- Modify: `src/exportPackage.ts`
- Modify: `src/App.tsx`
- Modify: `tests/browser/regression.spec.ts`

- [ ] **Step 1: Strengthen UI warning**

Settings must visibly state that placeholder APES mode is UI-only and export provenance will record it.

- [ ] **Step 2: Add export provenance**

Generic and full package manifests must include `placeholder_mode_enabled`.

- [ ] **Step 3: Verify**

Run: `npm run test:browser -- --reporter=line`

Expected: PASS.

### Task 7: Add Accessibility and Private Asset Coverage

**Files:**
- Modify: `tests/browser/regression.spec.ts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add keyboard/accessibility smoke**

Verify primary nav buttons, source selector, and export controls are reachable by role/name.

- [ ] **Step 2: Add private asset script**

Add `test:private-assets`, intended for machines with the private Duelyst package. It runs the existing Duelyst UI test with `PIXEL_CREATOR_PRIVATE_ASSETS=1`.

- [ ] **Step 3: Verify**

Run: `npm run test:browser -- --reporter=line`

Expected: PASS.

### Task 8: Final Release Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/browser-checks.md`
- Modify: `docs/release-readiness.md`

- [ ] **Step 1: Update docs**

Document source hygiene, preview local tools, `/@fs` restrictions, IndexedDB part-asset storage, and private asset test.

- [ ] **Step 2: Run full gate**

Run: `npm run release:check`

Expected: PASS.
