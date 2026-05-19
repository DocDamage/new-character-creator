# Sprite Character Creator

Sprite Character Creator is a local React/Vite tool for building reusable pixel-character recipes from sprite sheets, reviewed parts, APES masks, LPC sheets, and private Duelyst source assets.

The app is meant to be used as a production workflow shell:

- index or load sprite sources
- extract and review reusable parts
- compose a character recipe
- validate credits, APES outputs, and generated-animation handoffs
- export rendered frames, engine metadata, and release packages

## Quick Start

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 8002 --strictPort
```

For Windows automation, launch Vite through Node instead of PowerShell `Start-Process` plus `npm`:

```bash
node tools/local-vite-server.js dev --host 127.0.0.1 --port 8002 --strictPort
```

Open:

```text
http://127.0.0.1:8002/
```

The checked-in public manifest is enough to open the app and try the main workflow. Private asset workflows need local ignored assets; see [Private Assets](#private-assets).

Production readiness is gated by:

```powershell
npm run production:check
```

That command runs source hygiene, secret scanning, license audit generation, RAG evaluation, hosted RAG validation, tool tests, release build validation, preview-tool checks, and browser regressions.

## Step-By-Step Guide

### 1. Choose A Source Character

1. Open `Fast Creator`.
2. Use `Source pack` to choose `Sprite`, `LPC`, `Duelyst`, or `All`.
3. Pick a source character from the top `Source character` dropdown.
4. Choose an animation, direction, and frame in the preview controls.

Use the all-direction preview to confirm the source has the motion coverage you expect.

### 2. Extract Parts

1. Open `Art Workstation`.
2. Click `Pause` so the current frame stays still.
3. Pick a region such as `head`, `torso`, `front arm`, or `weapon`.
4. Choose an extraction mode:
   - `Preset regions` for rectangular starter parts.
   - `Connected pixel` for seed-based clusters.
   - `Manual` for cleanup work.
   - `APES` only after importing real APES report output.
5. Click the extraction button to create a part.
6. Use `Manual mask cleanup` to paint or adjust the mask.
7. Click `Save cleanup as part` when the mask is good.

Keyboard notes:

- Focus the pixel canvas and use arrow keys to move the seed.
- Press `Enter` or `Space` to place or paint.
- Focus the mask canvas and use arrow keys plus `Enter`/`Space` for keyboard-only cleanup.

### 3. Review The Part Library

1. Open `Part Library`.
2. Filter by method, review state, label, or search text.
3. Inspect imported parts and warnings.
4. Mark good parts as reviewed.
5. Delete bad parts or clear QA harness parts when needed.

Reviewed parts become selectable in Fast Creator. Large imported image/mask data is stored in IndexedDB so localStorage stays small; deleting parts also cleans up their large stored assets.

### 4. Compose A Recipe

1. Open `Fast Creator`.
2. For each layer, choose either:
   - a source character layer, or
   - a reviewed approved part.
3. Use layer controls to hide, lock, or offset each layer.
4. Lock a layer when it should not change; locked layers disable source, part, visibility, and offset edits until unlocked.
5. Save the recipe if you want to reload it later.

The `Recipe readiness` panel shows whether selected parts are reviewed and export-ready.

### 5. Use LPC Catalog Parts

1. Run `npm run lpc:inventory` if you have the local LPC asset dump.
2. Open `Fast Creator`.
3. Set `Source pack` to `LPC`.
4. Select an LPC mannequin/body.
5. Choose compatible LPC sheet parts or catalog-backed selections.
6. Watch for oversize/custom-animation warnings.
7. Open `Exports` to review selected LPC credit readiness.

LPC assets are mixed-license. Keep raw LPC dumps local and ignored unless you have explicitly cleared the license path for distribution.

### 6. Use APES Lab

APES is the segmentation/mask workflow.

For a local non-GPU smoke test:

1. Open `APES Lab`.
2. Click `Generate local QA harness`.
3. Review the imported QA parts in `Part Library`.

For real APES work:

1. Open `Settings`.
2. Set the APES Python path if needed.
3. Open `APES Lab`.
4. Click `Run APES preflight`.
5. Create or prepare APES jobs.
6. Run the local bridge or import completed `apes_report.json` files.
7. Review imported APES parts before using them in release exports.

Invalid APES report JSON is rejected before it changes jobs or the Part Library.

Placeholder APES fallback is only for development. If it is enabled, release exports are blocked until you turn it off.

## AI And RAG

Run `npm run rag:index` to build the AI knowledge indexes, or `npm run rag:evaluate` to rebuild them and score the regression query set. The command writes the full local index to `data/rag/knowledge_index.json` and a public-safe hosted index to `public/data/rag/knowledge_index.json`, so AI Studio's `Activate RAG` button works in both local-tools previews and static hosted builds. APES Lab and AI Studio use that index to attach project, APES, LPC, provider, license, Duelyst, and release-review context to generation jobs and chat replies. `npm run rag:hosted-check` validates the GitHub Pages index before publishing. Generated output remains blocked from release until reviewed.

AI Studio can answer questions about the current work from a compact live activity snapshot: active screen, selected character, frame geometry, layer, recipe readiness, release blockers, RAG mode, tool status, warnings, recent activity, and recent tool results. It can propose tool actions, but privileged work is approval-gated. Provider-suggested tools are schema-validated before they become approval cards. Direct provider calls are routed through a trusted loopback proxy or backend; browser-entered provider secrets are held only in volatile memory and are never written to localStorage, sessionStorage, exports, generated manifests, logs, release bundles, or git. Settings includes one-click defaults and live checks for Aseprite, PixelLab, and local LLM loopback bridges.

AI Studio accepts direct tool names, but you can also speak normally. Examples that map to app functions include `cut out the cloak`, `make art in PixelLab`, `download a zip bundle`, `why can't I export`, `what am I looking at`, `the feet are floating`, `find helmet sprites on my PC`, `jump to Settings`, `wire up PixelLab`, and `run a production check`. If you type `approve`, `yes`, `run it`, or `do it` while an approval card is pending, the app runs that pending card instead of starting a new plan.

### 7. Handle Missing Animations

For LPC catalog-backed recipes:

1. Open `APES Lab`.
2. Review the `Missing animation queue`.
3. Download the queue JSON or create manual generation handoff jobs.
4. Export handoff JSON.
5. Generate missing outputs externally.
6. Import the reviewed outputs as parts or training records.

Generated outputs do not become release-ready automatically. They stay blocked until explicitly reviewed.

### 8. Export A Package

1. Open `Exports`.
2. Pick an export target profile:
   - Generic package
   - Godot 4
   - Unity 2D
   - RPG Maker MZ
   - Aseprite
   - LPC oversize/custom animation
3. Resolve any release blockers shown in the panel.
4. Download one of:
   - generic manifest
   - rendered frame set
   - rendered frame ZIP
   - full package manifest
   - full package ZIP
   - engine-specific metadata/resources
   - credits report

The full package ZIP includes rendered PNGs, engine metadata, reusable selected parts, and `credits_report.json`.

## Common Workflows

### Public Static Release Build

Use this for distributable static output:

```powershell
npm run build:release
npm run validate:release-package
```

Public release builds do not install private local-tool middleware.

### Private Local-Tools Preview

Use this on your own machine when APES, Duelyst, LPC, repair, or reindex actions need local filesystem access:

```powershell
npm run build:local-tools
node tools/local-vite-server.js preview --host 127.0.0.1 --port 4173 --strictPort
```

Local tool POST requests require:

- loopback host
- same-origin request metadata when present
- generated `.local-tools-token`

The token is ignored by public release builds.

### Aseprite, PixelLab, And Local LLM Setup

Open `Settings`, then use:

1. `Use Aseprite defaults`, `Use PixelLab defaults`, or `Use local LLM defaults`.
2. Adjust the executable path, endpoint URL, model, or script folder if your machine differs.
3. Run the matching `Check ...` button while using a dev/local-tools session.
4. Ask AI Studio for an Aseprite handoff, PixelLab generation queue, or local-LLM plan. The AI can propose those tool actions, but you approve them before execution.

### Release Gate

Run this before handoff:

```powershell
npm run production:check
```

It runs:

- lint
- source hygiene
- secret scanning
- license audit generation
- RAG evaluation
- hosted RAG validation
- tool tests
- release build
- release package validation
- local-tools preview smoke
- Chromium browser regression

For cross-browser local coverage:

```powershell
npm run test:browser:install-all
npm run test:browser:all
```

For private Duelyst asset coverage:

```powershell
npm run test:private-assets
```

## Commands

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 8002 --strictPort
npm run build
npm run build:release
npm run build:local-tools
npm run release:check
npm run production:check
npm run security:scan
npm run license:audit
npm run rag:evaluate
npm run rag:hosted-check
npm run test:performance
npm run test:memory
npm run test:browser
npm run test:browser:all
npm run test:private-assets
npm run validate:release-package
```

Asset and APES commands:

```powershell
npm run index:assets
npm run lpc:inventory
npm run lpc:catalog
npm run rag:index
npm run rag:scan-pc
npm run rag:fetch-web
npm run rag:hosted-check
npm run duelyst:private-manifest -- --stage-count 64
npm run qa:apes-harness
npm run apes:prepare-finetune
npm run apes:prepare-duelyst-jobs
npm run apes:run-duelyst-jobs
npm run apes:summarize-outputs
```

APES GPU preflight:

```powershell
micromamba run -n apes-gpu-modern python tools\apes_bridge\check_apes_env.py --json
```

## Private Assets

The app can use private/local assets, but they are intentionally ignored by git:

```text
assets/Animated-Pixel-Pack-Characters-V1/
assets/Duelyst-Unit-Animations.unitypackage
assets/lpc sprite generator stuff/
assets/checkpoints/
checkpoints/
training data/
data/cache/
data/apes/output/
data/training/
```

If your sprite pack lives elsewhere:

```powershell
$env:PIXEL_CREATOR_ASSET_ROOT = 'D:\sprite-packs\Animated-Pixel-Pack-Characters-V1'
npm run index:assets
```

`npm run index:assets` writes `public/data/manifests/characters.local.json` for ignored or external assets. It does not overwrite the checked-in public manifest unless you pass `--public-manifest`.

## Duelyst Workflow

Generate the private Duelyst manifest:

```powershell
npm run duelyst:private-manifest -- --stage-count 64
```

This writes ignored local data:

```text
public/data/manifests/duelyst.private.json
data/cache/duelyst-package/
data/cache/duelyst-stage/
```

Then:

1. Open `Asset Audit`.
2. Choose the `Duelyst` tab.
3. Run the audit or load the private manifest.
4. Inspect staged candidates.
5. Open a staged character in the workstation.
6. Queue APES jobs if you want mask extraction.

The public Duelyst manifest is also loaded on startup when present. Staged `duelyst_*` entries stay in the `Duelyst` source family, so choosing `Duelyst` in the source picker should show review candidates instead of mixing them into sprite-kitbash or LPC part layers.

## APES Notes

APES outputs live under:

```text
data/apes/input/
data/apes/output/
```

Useful docs:

- `docs/apes-gpu-rebuild.md`
- `docs/apes-lpc-intake.md`
- `docs/release-readiness.md`
- `docs/browser-checks.md`
- `docs/production-security-model.md`
- `docs/local-bridge-threat-model.md`
- `docs/asset-license-audit.md`
- `docs/rebuild-spec.md`

The latest verified private batch had 57 successful Duelyst APES jobs and 3 sprite-specific APES segmentation rejects. Failed outputs are surfaced in APES inventory instead of crashing the batch.

## What The Release Validator Blocks

`npm run validate:release-package` rejects release output that contains:

- private manifests
- `/@fs/` references
- `/__local/` references
- Windows absolute paths
- private asset-root names
- blocked executable or script files
- LPC catalog or inventory entries without `license_status: "covered"`
- missing manifest assets

This scan covers emitted `.html`, `.js`, `.css`, `.json`, `.svg`, `.txt`, and `.map` files.

## Troubleshooting

### The app opens but has no private characters

Run:

```powershell
npm run index:assets
```

Then restart the dev server.

### Local tool buttons are disabled

Run through the local Vite server:

```powershell
npm run dev -- --host 127.0.0.1 --port 8002 --strictPort
```

or:

```powershell
npm run build:local-tools
node tools/local-vite-server.js preview --host 127.0.0.1 --port 4173 --strictPort
```

### Release export is blocked

Check the Exports panel. Common blockers:

- placeholder APES fallback is enabled
- generated handoff jobs are not reviewed
- LPC selected items have missing or review-needed credits
- selected parts are unreviewed or missing

### APES preflight warns about Python

Upstream APES targeted Python 3.7. The verified local environment currently uses Python 3.10 with compatibility patches. CUDA/PyTorch/PyTorch3D readiness matters more than that historical warning.

### Browser tests fail because port 4173 is already in use

Stop the old preview server or kill the process listening on `127.0.0.1:4173`, then rerun the test.

## Current Release

Latest release tag:

```text
production-readiness-2026-05-19
```

Latest certified commit:

```text
277523fe4 Expand AI natural language triggers
```

Verified gates:

- `npm run production:check`: green
- `npm run test:tools`: 121 tests
- `npm run test:browser`: 23 Chromium tests
- `npm run test:memory`: green
- `npm run security:scan`: green
- `npm run license:audit`: 655 covered LPC catalog entries, 0 missing
- `npm run rag:evaluate`: 3/3 evaluation queries passed
- `npm run rag:hosted-check`: green public-safe GitHub Pages index
- GitHub Actions will run the production gate and security workflow after this branch is pushed.
