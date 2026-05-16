# Finish Character Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the local Animated Pixel Character Creator so reviewed extracted parts can be edited, composed, batch-rendered, and exported with first-class APES provenance.

**Architecture:** Keep the app local/offline-first. Add focused renderer and persistence modules instead of growing `App.tsx` further; use canvas for pixel-perfect composition and mask editing. Keep original sprite assets read-only, while generated part data, recipes, and exports are represented as app data and downloadable packages.

**Tech Stack:** Vite, React, TypeScript, browser Canvas APIs, localStorage for UI/session state, downloadable JSON/PNG artifacts, Python APES bridge contracts under `tools/apes_bridge`.

**Implementation Status:** Completed and extended. Composite rendering, persistent extracted payloads, manual mask cleanup, deterministic batch recipe previews/package manifests, APES report import/status bridge support, Duelyst package staging/private manifests, production-oriented engine package exports, Settings setup bundles, APES GPU preflight support, and APES fine-tuning inventory prep are implemented. Verified with `npm run build`, `npm run test:browser -- --reporter=line`, browser checks at `http://127.0.0.1:8002/`, Duelyst staging, and APES GPU preflight in `apes-gpu-modern`.

**APES GPU Status:** PyTorch3D is now fixed on the home RTX 3060 PC. The working env uses Python 3.10, PyTorch `2.5.1+cu124`, PyTorch3D `0.7.8`, matching PyG CUDA wheels, headless OpenCV, and NumPy `1.26.4`. Rebuild instructions are documented in `docs/apes-gpu-rebuild.md`.

**Training/Fine-Tuning Status:** `tools/apes_bridge/prepare_finetune_data.py` inventories the local Okay Samurai and Creative Flow supervised datasets, creates a local Duelyst APES review dataset from the private manifest, and writes `data/training/apes_finetune/finetune_manifest.json` with quoted Windows-safe training commands.

---

## File Structure

- Create `src/CompositeCanvas.tsx`: draws kitbash recipes from layer order, reviewed parts, offsets, visibility, locks, and palette rules.
- Create `src/maskTools.ts`: pure mask operations for pencil, eraser, fill, grow, shrink, invert, mirror, and nudge.
- Create `src/exportPackage.ts`: zip-like manifest builders and multi-file download helpers for batch/export metadata.
- Modify `src/App.tsx`: wire composite preview, manual cleanup state, batch render/export controls, and full package export controls.
- Modify `src/utils.ts`: add part image data URL extraction helpers, rendered spritesheet helpers, GIF placeholder metadata builder, and APES output import hooks.
- Modify `src/types.ts`: add persisted part image/mask payload fields, cleanup project state, batch render manifest, and package manifest types.
- Modify `src/App.css`: style composite previews, cleanup canvas, package export status, and batch render queue.
- Modify `tools/apes_bridge/convert_apes_output.py`: ensure APES output reports match app metadata fields, including mask bounds and semantic labels.
- Test with `npm run build` and browser verification at `http://127.0.0.1:8002/`.

---

### Task 1: Composite Renderer

**Files:**
- Create: `src/CompositeCanvas.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [x] **Step 1: Add a composite renderer component**

Create `src/CompositeCanvas.tsx` that:
- Receives `recipe`, `characters`, `partLibrary`, `animation`, `direction`, and `frameIndex`.
- Draws a transparent checker background.
- Iterates recipe layers in order.
- For each visible layer, chooses the source character frame for the current animation/direction/frame.
- Uses the reviewed part bounds when `source_part_id` exists, otherwise uses `humanoid64Preset[label]`.
- Applies layer offset and recipe palette CSS canvas filter.
- Uses nearest-neighbor drawing.

- [x] **Step 2: Show composite preview in Fast Creator and Exports**

Render `CompositeCanvas` beside the all-direction source preview so the user sees the generated kitbash result.

- [x] **Step 3: Verify**

Run: `npm run build`

Browser check:
- Open Fast Creator.
- Confirm a canvas labelled `composite idle south frame`.
- Toggle a layer visibility or offset and confirm the composite changes without console errors.

---

### Task 2: Persistent Extracted Image/Mask Payloads

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils.ts`
- Modify: `src/App.tsx`

- [x] **Step 1: Extend `ExtractedPart`**

Add optional fields:
- `image_data_url?: string`
- `mask_data_url?: string`
- `source_frame_path?: string`

- [x] **Step 2: Update extraction helpers**

Change preset and connected extraction helpers to return PNG data URLs while still downloading files.

- [x] **Step 3: Store payloads in Part Library**

When extracting a region or connected cluster, save data URLs into the `ExtractedPart` record so parts can survive reload and render without relying on downloaded files.

- [x] **Step 4: Verify**

Extract a connected-pixel part, reload, and confirm it still appears in the Part Library and can be selected in Fast Creator.

---

### Task 3: Manual Cleanup Mask Workstation

**Files:**
- Create: `src/maskTools.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [x] **Step 1: Add pure mask operations**

Implement functions:
- `paintMaskPixel(mask, x, y, enabled)`
- `fillMask(mask, x, y, enabled)`
- `growMask(mask)`
- `shrinkMask(mask)`
- `invertMask(mask)`
- `mirrorMask(mask)`
- `nudgeMask(mask, dx, dy)`

- [x] **Step 2: Add editable cleanup canvas**

In Art Workstation, when manual mode is selected, display an editable 64x64 mask canvas with pencil, eraser, fill, grow, shrink, invert, mirror, and nudge controls.

- [x] **Step 3: Save reviewed cleaned mask**

Allow `Save cleanup as part` to create/update an `ExtractedPart` with `extraction_method: "manual"` and a persisted mask data URL.

- [x] **Step 4: Verify**

Paint a mask pixel, save a manual part, reload, and confirm the manual part remains in Part Library.

---

### Task 4: Batch Rendered Variants

**Files:**
- Modify: `src/CompositeCanvas.tsx`
- Create: `src/exportPackage.ts`
- Modify: `src/App.tsx`

- [x] **Step 1: Add offscreen renderer**

Export a helper that renders a recipe/layer set to a PNG data URL for a given animation/direction/frame.

- [x] **Step 2: Add batch render action**

Batch Generator should render deterministic variant preview thumbnails and download a batch queue manifest including recipe settings, source part ids, and APES provenance.

- [x] **Step 3: Verify**

Generate batch variants with a fixed seed twice and confirm identical variant IDs, parts, palettes, and rendered preview count.

---

### Task 5: Full Package Exports

**Files:**
- Create: `src/exportPackage.ts`
- Modify: `src/App.tsx`
- Modify: `src/utils.ts`

- [x] **Step 1: Add package manifest builder**

Build a package manifest with:
- individual frames
- spritesheets
- GIF preview metadata
- Godot 4 files
- Unity metadata
- RPG Maker MZ metadata
- Aseprite reference package
- reusable part folders
- extraction provenance

- [x] **Step 2: Add export package button**

Add `Download full package manifest` and `Download rendered frame set` to Exports.

- [x] **Step 3: Verify**

Click package export buttons and ensure no console errors. Confirm downloaded JSON includes APES `source_part_id` entries.

---

### Task 6: Real APES Bridge Import

**Files:**
- Modify: `tools/apes_bridge/convert_apes_output.py`
- Modify: `tools/apes_bridge/README.md`
- Modify: `src/App.tsx`

- [x] **Step 1: Normalize APES report schema**

Ensure reports include:
- `job_id`
- `masks[]`
- `label`
- `path`
- `bounds`
- `confidence`
- `warnings`

- [x] **Step 2: Import pasted/uploaded report JSON**

Add an APES Lab text import area so users can paste a real APES report and convert masks into library parts.

- [x] **Step 3: Verify**

Paste the expected report template and confirm APES parts import with labels, bounds, warnings, and review status.

---

## Execution Order

1. Composite renderer.
2. Persistent extracted payloads.
3. Manual cleanup canvas.
4. Batch rendered variants.
5. Full package exports.
6. Real APES report import.

Each task must pass `npm run build` and one browser verification loop before moving to the next.
