# Release Execution Plan

> Status update, 2026-05-19: this plan has been superseded by the production-readiness implementation on branch `codex/aaa-production-readiness`, commit `7363392b3`. The living production gate is now `npm run production:check`, which adds secret scanning, license audit generation, RAG evaluation, release validation, preview local-tools smoke, and browser regression. Keep this file as historical execution context; use `README.md`, `docs/release-readiness.md`, and `docs/rebuild-spec.md` for current rebuild/release requirements.

This plan converts the production-readiness audit into ordered implementation work. It is structured so a developer or coding agent can complete tasks one by one without guessing.

## Phase 0 - Build Blockers And App-Breaking Issues

### Task P0-01 - Add A Top-Level Runtime Error Boundary

- **Files to edit:** `src/main.tsx`, new `src/ErrorBoundary.tsx`
- **Files to inspect:** `index.html`, `src/App.tsx`
- **Dependencies:** None
- **Risk level:** Medium

**Exact implementation steps:**

1. Create a React error boundary component with fallback UI and reset/reload action.
2. Replace the non-null `document.getElementById('root')!` assertion with a guarded root lookup.
3. Wrap `<App />` in the error boundary inside `StrictMode`.
4. Ensure fallback is styled minimally and does not depend on app state.

**Acceptance criteria:**

- Uncaught render errors show recoverable UI instead of a blank screen.
- Missing `#root` fails with a clear console/runtime message.

**Verification command or manual test:**

```powershell
npm run build
```

Manually throw from `App` temporarily or add a targeted test harness.

### Task P0-02 - Secure Local Tool Execution Endpoints

- **Files to edit:** `tools/localToolsServer.ts`, `vite.config.ts`, `tools/check-preview-local-tools.js`
- **Files to inspect:** `src/App.tsx`, `src/screens/SettingsPanel.tsx`, `src/screens/ApesLabPanel.tsx`
- **Dependencies:** None
- **Risk level:** High

**Exact implementation steps:**

1. Require loopback Host validation for `/__local/*`.
2. Generate or configure a local session token and require it on mutating `/__local/apes-tools` and `/__local/asset-tools` requests.
3. Validate `Origin` and `Referer` where present.
4. Restrict `pythonPath` to an allowlist, project config, or explicit user-set local setting validated server-side.
5. Update client fetch calls to include the token/header.
6. Update preview smoke test to prove unauthorized calls fail and authorized calls pass.

**Acceptance criteria:**

- Cross-origin or tokenless POST requests fail.
- Authorized app requests still work.

**Verification command or manual test:**

```powershell
npm run test:preview-tools
npm run test:browser
```

## Phase 1 - Unwired UI, Routes, Handlers, And Feature Surfaces

### Task P1-01 - Make Layer Lock Controls Enforce Read-Only Behavior

- **Files to edit:** `src/screens/FastCreatorPanel.tsx`
- **Files to inspect:** `src/App.tsx`, `src/creatorCockpit.ts`, `tests/browser/regression.spec.ts`
- **Dependencies:** None
- **Risk level:** Medium

**Exact implementation steps:**

1. For each layer card, compute `isLocked` from `settings.locked`.
2. Disable source select, approved part select, visible checkbox, and offset inputs when locked.
3. Keep the unlock control available.
4. Guard context-menu actions that mutate locked layers except unlock/view details.
5. Add visible disabled reasons/tooltips.

**Acceptance criteria:**

- Locked layers cannot be modified until unlocked.

**Verification command or manual test:**

Add Playwright coverage, then run:

```powershell
npm run test:browser
```

### Task P1-02 - Complete Or Explicitly Downgrade PixelLab/Future AI Provider Flow

- **Files to edit:** `src/generationJobs.ts`, `src/screens/ApesLabPanel.tsx`, `src/App.tsx`, `src/types.ts`
- **Files to inspect:** `src/missingAnimationQueue.ts`, `src/appPersistence.ts`, docs referencing PixelLab
- **Dependencies:** None
- **Risk level:** High

**Exact implementation steps:**

1. Decide implementation scope: manual-only release or real provider integration.
2. If manual-only, rename UI copy to "manual generation handoff" and remove "future provider" ambiguity.
3. Add import path for reviewed generated outputs or make the lack of import explicit.
4. Add status transitions for handoff exported, output imported, reviewed, rejected.
5. Ensure release blocking clears only after explicit review.

**Acceptance criteria:**

- Generation flow has a complete, understandable lifecycle from queue to reviewed output, or is clearly marked manual-only with no implied provider automation.

**Verification command or manual test:**

```powershell
npm run test:tools
npm run test:browser
```

### Task P1-03 - Support Or Explicitly Reject Diagonal Directions

- **Files to edit:** `src/App.tsx`, `src/exportPackage.ts`, `src/DirectionPreviewGrid.tsx`
- **Files to inspect:** `src/types.ts`, `src/utils.ts`, manifests under `public/data/manifests`
- **Dependencies:** None
- **Risk level:** Medium

**Exact implementation steps:**

1. Derive available directions from selected character/animation instead of fixed `mainDirections`.
2. Update preview, APES direction selection, and export direction iteration.
3. If diagonal directions are out of scope, add manifest validation and UI warnings that they are unsupported.
4. Add tests for a fixture with diagonal directions.

**Acceptance criteria:**

- Diagonal directions are either reachable/exported or blocked with explicit warnings.

**Verification command or manual test:**

```powershell
npm run test:tools
npm run test:browser
```

## Phase 2 - Incomplete Implementations, Stubs, Placeholders, Mock Data

### Task P2-01 - Replace Hardcoded One-Character Release Packaging

- **Files to edit:** `vite.config.ts`, `tools/validate-release-package.js`, `package.json` if needed
- **Files to inspect:** `tools/index-assets.js`, `tools/export-character.js`, `public/data/manifests/characters.json`, `data/exports/`
- **Dependencies:** P0-02 recommended first
- **Risk level:** High

**Exact implementation steps:**

1. Define release asset input: checked-in manifest, generated release manifest, or explicit release config.
2. Remove hardcoded `1-warrior-woman` assumptions from `releasePackagePlugin`.
3. Copy all approved release assets into `dist/data/sprites` or equivalent.
4. Generate release manifest from approved inputs.
5. Validate expected character count and asset completeness.

**Acceptance criteria:**

- Release build packages the approved production content set, not a single fixture.

**Verification command or manual test:**

```powershell
npm run build:release
npm run validate:release-package
```

### Task P2-02 - Reclassify Placeholder APES Mode As Non-Release-Only

- **Files to edit:** `src/screens/SettingsPanel.tsx`, `src/App.tsx`, `src/utils.ts`, `src/exportPackage.ts`
- **Files to inspect:** `tools/apes_bridge/run_apes_extract.py`, tests for placeholder provenance
- **Dependencies:** None
- **Risk level:** Medium

**Exact implementation steps:**

1. Ensure placeholder mode is unavailable or clearly blocked in release-target export profiles.
2. Keep provenance fields in all manifests.
3. Add release export blocker when placeholder mode is enabled unless explicitly exporting a dev/test package.

**Acceptance criteria:**

- QA cannot accidentally create a production-labeled package with placeholder APES mode enabled.

**Verification command or manual test:**

```powershell
npm run test:browser
```

## Phase 3 - Error Handling, Validation, Loading States, Empty States

### Task P3-01 - Add Runtime Schema Validation For APES Report Imports

- **Files to edit:** `src/App.tsx`, new `src/apesReportValidation.ts`
- **Files to inspect:** `src/types.ts`, `public/data/qa/apes_report_harness.json`, `tools/apes_bridge/*`
- **Dependencies:** None
- **Risk level:** High

**Exact implementation steps:**

1. Create validation for `job_id`, `masks`, valid part labels, paths, bounds, confidence, reviewed, and warnings.
2. Return structured validation errors.
3. Use validator in pasted JSON, file import, local report import, and QA harness load.
4. Prevent state mutation on invalid payloads.

**Acceptance criteria:**

- Invalid reports show actionable errors and do not alter jobs or part library.

**Verification command or manual test:**

Add Node tests, then run:

```powershell
npm run test:tools
npm run test:browser
```

### Task P3-02 - Handle APES Report File Read Failures

- **Files to edit:** `src/screens/ApesLabPanel.tsx`
- **Files to inspect:** `src/App.tsx` import status flow
- **Dependencies:** P3-01 preferred
- **Risk level:** Low

**Exact implementation steps:**

1. Replace bare `file.text().then(...)` with async try/catch or `.catch`.
2. Surface failure through `apesBridgeStatus`.
3. Keep input reset behavior after handled completion.

**Acceptance criteria:**

- File read failure displays a visible error and creates no unhandled promise rejection.

**Verification command or manual test:**

Browser test with mocked file read rejection, then:

```powershell
npm run test:browser
```

### Task P3-03 - Add Keyboard-Accessible Canvas Interactions

- **Files to edit:** `src/PixelCanvas.tsx`, `src/MaskEditor.tsx`, `src/screens/WorkstationPanel.tsx`
- **Files to inspect:** `src/maskTools.ts`, `tests/browser/regression.spec.ts`
- **Dependencies:** None
- **Risk level:** Medium

**Exact implementation steps:**

1. Make canvases focusable when interactive.
2. Add keyboard seed movement/placement in `PixelCanvas`.
3. Add keyboard paint/nudge controls in `MaskEditor`.
4. Add ARIA labels/instructions and visible focus states.
5. Test keyboard-only workflow for seed selection and saving a mask.

**Acceptance criteria:**

- Core workstation and mask cleanup actions are usable without a mouse.

**Verification command or manual test:**

```powershell
npm run test:browser
```

Also perform a manual keyboard pass.

## Phase 4 - Persistence/API/Storage/Data Integrity

### Task P4-01 - Remove Unsafe Direct localStorage Access

- **Files to edit:** `src/App.tsx`
- **Files to inspect:** `src/appPersistence.ts`, `tests/tools/app-persistence.test.mjs`
- **Dependencies:** None
- **Risk level:** Medium

**Exact implementation steps:**

1. Replace direct `window.localStorage.getItem(assetRootInputStorageKey)` with `loadStoredString`.
2. Add or extend test for blocked localStorage during manifest application.

**Acceptance criteria:**

- App state initializes when localStorage reads throw.

**Verification command or manual test:**

```powershell
npm run test:tools
npm run test:browser
```

### Task P4-02 - Track Persistence Warnings Per Storage Key

- **Files to edit:** `src/App.tsx`, optionally `src/appPersistence.ts`
- **Files to inspect:** All `storeJson`, `storeString`, `storeBoolean` call sites
- **Dependencies:** P4-01
- **Risk level:** Medium

**Exact implementation steps:**

1. Replace single `persistenceWarning` string with keyed warning map.
2. Each persistence effect sets or clears only its own key.
3. Render aggregated warning text in the topbar.
4. Add tests/mocks for simultaneous failures.

**Acceptance criteria:**

- A successful write cannot hide an unrelated failed write.

**Verification command or manual test:**

```powershell
npm run test:browser
```

### Task P4-03 - Garbage Collect IndexedDB Part Assets

- **Files to edit:** `src/partAssetStore.ts`, `src/App.tsx`, `src/screens/PartLibraryPanel.tsx` if needed
- **Files to inspect:** `src/types.ts`, part delete/clear/import flows
- **Dependencies:** None
- **Risk level:** Medium

**Exact implementation steps:**

1. Add `deletePartLibraryAssets(keys)` and/or `compactPartLibraryAssets(activeParts)`.
2. Call deletion when a part is deleted.
3. Call compaction when the library is cleared or after large imports.
4. Preserve assets still referenced by remaining parts.

**Acceptance criteria:**

- Deleted parts no longer leave orphaned image/mask records in IndexedDB.

**Verification command or manual test:**

Add browser test using IndexedDB inspection, then run:

```powershell
npm run test:browser
```

## Phase 5 - Asset, Manifest, Packaging, And Release-Readiness Fixes

### Task P5-01 - Expand Release Package Validation To Scan All Dist Text Assets

- **Files to edit:** `tools/validate-release-package.js`, `tests/tools/release-package.test.mjs`
- **Files to inspect:** `dist` output after `build:release`
- **Dependencies:** P2-01 preferred
- **Risk level:** Medium

**Exact implementation steps:**

1. Recursively scan `.html`, `.js`, `.css`, `.json`, `.svg`, `.txt`, and `.map` if emitted.
2. Fail on forbidden private/local references: `/@fs/`, `/__local/`, Windows absolute paths, private manifest names, and private asset roots.
3. Add fixture tests proving non-manifest forbidden strings fail.
4. Document any intentional allowlist.

**Acceptance criteria:**

- Forbidden local/private references anywhere in `dist` fail validation.

**Verification command or manual test:**

```powershell
npm run test:tools
npm run build:release
npm run validate:release-package
```

### Task P5-02 - Separate Private Local-Tool Build From Distributable Static Build

- **Files to edit:** `vite.config.ts`, `package.json`, docs
- **Files to inspect:** `tools/localToolsServer.ts`, `tools/check-preview-local-tools.js`
- **Dependencies:** P0-02, P5-01
- **Risk level:** High

**Exact implementation steps:**

1. Add distinct modes/scripts for local tool preview and public static release.
2. Ensure public static release does not install local tool middleware.
3. Keep private workflow tests on local-tool preview mode.
4. Keep release package validator aligned with public mode.

**Acceptance criteria:**

- Public release build has no executable local tool server dependency.
- Private local preview still works.

**Verification command or manual test:**

```powershell
npm run build:release
npm run validate:release-package
npm run test:preview-tools
```

### Task P5-03 - Update Release Documentation After Packaging/Security Changes

- **Files to edit:** `README.md`, `docs/release-readiness.md`, `docs/browser-checks.md`
- **Files to inspect:** `package.json`, final scripts
- **Dependencies:** P2-01, P5-01, P5-02
- **Risk level:** Low

**Exact implementation steps:**

1. Document public vs private/local release paths.
2. Document local tool security model and setup.
3. Update verified command list only after commands pass.
4. Remove stale "GO" claims if any gate is optional or private-only.

**Acceptance criteria:**

- Docs match actual scripts and release behavior.

**Verification command or manual test:**

Manual doc review plus:

```powershell
npm run release:check
```

## Phase 6 - Tests, Regression Coverage, And Final Verification

### Task P6-01 - Make Cross-Browser Release Gating Mandatory For Release Branches

- **Files to edit:** `.github/workflows/*`, `package.json`, `playwright.config.ts` if needed
- **Files to inspect:** Existing `test:browser:all` script
- **Dependencies:** Stabilize P0-P5 changes first
- **Risk level:** Medium

**Exact implementation steps:**

1. Add CI job with `PIXEL_CREATOR_BROWSER_MATRIX=1`.
2. Install Chromium, Firefox, and WebKit dependencies.
3. Decide whether this runs on every PR, release branches, or nightly.
4. Document policy.

**Acceptance criteria:**

- Firefox/WebKit regressions are visible before release approval.

**Verification command or manual test:**

```powershell
npm run test:browser:install-all
npm run test:browser:all
```

### Task P6-02 - Add Targeted Regression Tests For All Fixed Audit Issues

- **Files to edit:** `tests/browser/regression.spec.ts`, `tests/tools/*.test.mjs`
- **Files to inspect:** Existing test helpers in `tests/browser/regression.spec.ts`
- **Dependencies:** All implementation tasks
- **Risk level:** Medium

**Exact implementation steps:**

1. Add APES invalid import tests.
2. Add locked layer immutability test.
3. Add localStorage blocked initialization test.
4. Add IndexedDB garbage collection test.
5. Add release validator forbidden-dist-string test.
6. Add keyboard canvas workflow smoke test.

**Acceptance criteria:**

- Each major audit fix has a failing-before/passing-after test.

**Verification command or manual test:**

```powershell
npm run test:tools
npm run test:browser
```

### Task P6-03 - Run Final Release Certification Gate

- **Files to edit:** None unless failures are found
- **Files to inspect:** `dist`, `test-results`, docs
- **Dependencies:** P6-01, P6-02
- **Risk level:** Low

**Exact implementation steps:**

1. Run lint.
2. Run source hygiene.
3. Run all tool tests.
4. Run release build and release package validation.
5. Run preview local-tool smoke.
6. Run Chromium browser tests.
7. Run cross-browser matrix.
8. Run private asset tests on a machine with private assets.
9. Update release readiness doc with exact date and command results.

**Acceptance criteria:**

- All required gates pass.
- Optional/private gates are clearly labeled.
- Docs reflect the actual result.

**Verification command or manual test:**

```powershell
npm run lint
npm run check:source-hygiene
npm run test:tools
npm run build:release
npm run validate:release-package
npm run test:preview-tools
npm run test:browser
npm run test:browser:all
npm run test:private-assets
npm run release:check
```
