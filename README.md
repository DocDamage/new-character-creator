# Animated Pixel Character Creator

Local Vite + React + TypeScript app for building a kitbash-oriented pixel character creator from indexed sprite folders, extracted reusable parts, APES masks, Duelyst staged source sheets, and deterministic kitbash recipes.

## Current status

- Frontend build passes with `npm run build`.
- Lint, tool tests, production build, release package validation, production-preview local-tool smoke, and browser regression pass through `npm run release:check`.
- Local dev server has been verified at `http://127.0.0.1:8002/`.
- APES GPU preflight passes in `apes-gpu-modern` with CUDA PyTorch, PyTorch3D, PyG extensions, OpenCV, checkpoints, and okaysamurai test data available.
- APES real bridge execution reaches the vendored network/deformer on the RTX 3060. The full 60-job Duelyst APES batch completed with 57 successful jobs and 3 sprite-specific APES rejects that are now recorded as failed outputs instead of crashing the whole batch.
- The only APES preflight warning is that upstream APES originally targeted Python 3.7 while the working local environment uses Python 3.10.
- Duelyst package unpacking, detector labeling, multi-frame atlas staging, and in-app browsing has been verified against `assets/Duelyst-Unit-Animations.unitypackage`: 7145 assets scanned, 696 sprite sheets labeled/viewable in Asset Audit, and 64 staged candidates with idle/run/attack/etc. frames openable in the workstation.
- LPC intake is now usable as source content, not just audit metadata: local 64x64 LPC sheets are grouped by source/action into selectable `lpc_character` manifests, canonical LPC animations are exposed in the app, body bases are represented as mannequins, compatible LPC sheet parts can be picked directly in Fast Creator, and catalog-backed LPC selections can drive preview, rendered exports, credits, and missing-animation handoff.
- Source metadata is kept as optional private debugging data. It is not a release gate for this private tool.

## Commands

```bash
npm install
npm run index:assets
npm run lpc:inventory
npm run duelyst:private-manifest
npm run apes:prepare-finetune
npm run apes:prepare-duelyst-jobs
npm run apes:run-duelyst-jobs
npm run apes:summarize-outputs
npm run export:character -- 1-warrior-woman
npm run dev -- --host 127.0.0.1 --port 8002 --strictPort
npm run lint
npm run check:source-hygiene
npm run test:tools
npm run build
npm run validate:release-package
npm run test:preview-tools
npm run test:browser
npm run test:private-assets
npm run release:check
```

APES GPU verification on the home PC:

```bash
micromamba run -n apes-gpu-modern python tools\apes_bridge\check_apes_env.py --json
```

Full APES/PyTorch3D rebuild notes live in `docs/apes-gpu-rebuild.md`.
The current release verification summary lives in `docs/release-readiness.md`.

If the sprite pack lives somewhere other than `../Animated-Pixel-Pack-Characters-V1`, override it with `PIXEL_CREATOR_ASSET_ROOT` or `--asset-root`:

```bash
$env:PIXEL_CREATOR_ASSET_ROOT = 'D:\sprite-packs\Animated-Pixel-Pack-Characters-V1'
npm run index:assets
npm run export:character -- 1-warrior-woman --asset-root 'D:\sprite-packs\Animated-Pixel-Pack-Characters-V1'
```

`npm run index:assets` writes `public/data/manifests/characters.local.json` for ignored in-repo asset packs and external asset roots so local scans do not overwrite the checked-in fallback manifest. To intentionally refresh `public/data/manifests/characters.json`, pass `--public-manifest`.

`npm run lpc:inventory` scans the ignored local LPC asset dump at `assets/lpc sprite generator stuff`, records 64x64 sheet-grid metadata, credit/license files, and cached upstream Universal LPC reference data into `data/lpc/lpc_asset_inventory.json`. The app uses that inventory in two ways: Asset Audit can browse/import selected sheets into the Part Library, and Fast Creator can use grouped LPC base sheets and compatible LPC sheet parts as live source choices. LPC art is mixed-license, so keep that inventory for local reference and do not copy the raw dump into the release bundle.

If you prefer not to remember the commands, open the `Settings` screen in the app. It has buttons that copy the repair, reindex, and sample export commands with your chosen asset-pack path filled in.

When the app is running through the local Vite server (`npm run dev` or `npm run preview` after a build), the same `Settings` screen can also run the repair and reindex actions directly. APES Lab uses that same local tool flow for APES preflight checks, local bridge runs, and the no-CUDA QA harness generator.

The `Settings` screen now also exposes a `Copy browser regression command` action for the local Playwright harness. That harness validates these workflows end to end:

- rendered/full-package export downloads
- manual mask save persistence after reload
- recipe save/load state
- Part Library bulk review actions
- APES QA harness generation plus report reload and pasted JSON import
- APES local-output report import, reusable image/mask serving, and full-package zip part assets
- Workstation APES mode refusing to create fake rectangular APES parts
- Duelyst audit behavior, including the no-package warning path and staged-workstation opening path when the local unitypackage is available
- LPC picker behavior, including canonical animation labels, body-base coverage, compatible sheet-part choices for mannequin sources, catalog-backed recipe persistence, rendered-frame export, upstream credit readiness, and oversize/custom-animation warnings
- portable local setup bundle export from `Settings`
- placeholder-mode export provenance and core accessible controls
- large Part Library layer-bundle imports staying paged instead of rendering every part at once

Use `npm run release:check` before handoff. It runs lint, source-hygiene checks, tool tests, production build, release package validation, preview local-tool smoke, and the browser regression harness in order.
The checked-in GitHub Actions workflow runs the same release gate on push and pull request for `main`.
Public release builds use `npm run build:release` and do not install the private local-tool middleware. Private machine workflows use `npm run build:local-tools` or `npm run dev`; those builds inject the generated `.local-tools-token` so APES, Duelyst, LPC, repair, and reindex POST requests can pass the loopback/same-origin/token checks. `npm run test:preview-tools` builds the local-tools preview bundle and verifies tokenless requests fail while authorized local requests still reach the tool handlers. `npm run test:private-assets` is available for machines that have `assets/Duelyst-Unit-Animations.unitypackage`; it runs the heavier private Duelyst audit path explicitly and skips cleanly when the package is absent.
For an optional local cross-browser smoke pass after installing all Playwright browsers, run `npm run test:browser:install-all` once and then `npm run test:browser:all`.

`Settings` also exposes a `Download local setup bundle` action. It writes a machine-ready markdown checklist with your current asset root, APES interpreter, setup commands, and browser regression command filled in so you can move the workflow to another PC without rebuilding the commands by hand.

## What is implemented

- Asset indexer that scans local character folders, writes `characters.local.json` for ignored/external roots, and only refreshes the checked-in `characters.json` when `--public-manifest` is passed.
- Normalized animation names:
  - `walking` / `walking-4-frames` -> `walk`
  - `attack` / `attack-1` -> `attack`
  - `running-jump` -> `running_jump`
- Pixel-perfect canvas preview for real source frames.
- Fast Creator with source-pack filtering, reviewed-part search/method filters, recipe readiness, target export hints, recipe export, and LPC-compatible sheet-part pickers when an LPC mannequin is selected.
- Art Workstation with preset regions, APES/preset/connected/manual mode comparison, region controls, and cleanup tool surface.
- Manual mask cleanup with persisted reviewed manual parts.
- Part Library with filtering, reviewed/unreviewed state, paged rendering for large imports, JSON export, page-scoped visible JSON export/review actions, and APES QA cleanup.
- IndexedDB-backed imported part asset persistence that keeps large imported data URLs out of localStorage while hydrating them back into the app on reload.
- Batch Generator with deterministic seeded variants.
- Asset Audit with class counts, source warnings, and Duelyst unitypackage inspection/staging.
- Asset Audit LPC browser with sheet previews, search/category/grid filters, selected/visible import, inferred or explicit part labels, reviewed-on-import, and credit/license provenance warnings.
- Runtime LPC character builder that groups action-specific sheets into canonical animation manifests, keeps classic LPC sheet row mappings intact, exposes body bases as mannequins, and limits part choices to compatible LPC layers.
- Universal LPC catalog bridge that parses upstream-style item metadata, preserves multi-layer z positions, required/excluded tags, variants, body paths, custom animations, and selected-item credits, then uses catalog-backed selections in saved recipes.
- Shared LPC render planning for preview and rendered exports, with catalog layers sorted by upstream z position around the base body and legacy pseudo-character drawing retained as a degraded fallback.
- LPC catalog picker with required-tag/body/animation warnings, visible oversize/custom-animation export-profile warnings, selected-item credit readiness, and persisted `lpc_selections`.
- Duelyst Asset Audit filters for search, body class, source family, training role, and staged state, plus batch APES job creation for staged candidates.
- APES Lab with first-class job creation, local preflight/bridge actions, one-click fine-tune prep, one-click Duelyst job-batch prep, a local QA harness generator, logs, job config export, LPC missing-animation queue handoff, explicit placeholder-mode provenance in exports, failed-output surfacing, file import, pasted JSON import, inventory import, and APES-to-part-library conversion.
- APES CLI bridge tools for preparing and running private Duelyst job batches from `data/apes/input/`, including partial-failure recording and strict opt-in failure mode.
- Export panel for generic manifests, rendered frame/package downloads, Godot scenes, SpriteFrames resources, batch queues, selected upstream LPC credit readiness, and a credits/provenance report for selected parts and catalog items.
- Production-oriented full package zip with rendered PNGs, Godot 4 `SpriteFrames` resources, Unity import settings and Editor importer script, RPG Maker MZ single-character sheet, Aseprite import script/spec, credits report, and useful local metadata.
- Release package validator that rejects private manifests, local `/@fs/` and `/__local/` references anywhere in emitted text assets, Windows absolute paths, private asset-root names, and missing bundled manifest assets.
- Browser-side spritesheet downloads for the current animation/direction and all directions of the current action.
- CLI character export under `data/exports/<character_id>/` with `package_manifest.json`, rendered frames/sheets, engine metadata, and source-frame references.
- APES bridge contract under `tools/apes_bridge/`.
- Settings screen with asset-root repair/reindex commands, local dev-server repair/reindex actions, APES interpreter configuration, placeholder bridge toggle, APES preflight summary, browser regression command copy, and portable setup bundle download.

## Data and asset handling

Large local assets are intentionally ignored by git:

```text
assets/checkpoints/
assets/creative_flow/
assets/okay_samurai/
assets/okaysamurai_sheets/
assets/Animated-Pixel-Pack-Characters-V1/
assets/Duelyst-Unit-Animations.unitypackage
checkpoints/
training data/
data/cache/
```

The APES runtime expects historical paths under the repo root. On this machine those paths are junctions into ignored asset folders:

```text
checkpoints -> assets/checkpoints
training data/okaysamurai_sheets -> assets/okaysamurai_sheets
```

## Private Duelyst manifest

Duelyst package extraction is local/private. Generate the private manifest with:

```bash
npm run duelyst:private-manifest -- --stage-count 64
```

This writes ignored local data:

```text
public/data/manifests/duelyst.private.json
data/cache/duelyst-package/
data/cache/duelyst-stage/
```

The app auto-loads this private manifest when it exists. The Asset Audit screen shows all labeled candidate sheets and exposes staged entries with `Open in workstation`.

The manifest records every candidate unit sheet, staged frames, source paths, warnings, and detector labels. The labels combine Duelyst path/name/animation metadata with a lightweight alpha-silhouette detector that measures the representative crop's bounds, fill, mass distribution, edge contact, and color footprint. The extracted assets and private manifest are not committed.

## Training and fine-tuning path

Prepare the APES fine-tune manifest and Duelyst review dataset with:

```bash
npm run apes:prepare-finetune
```

This writes ignored local data under:

```text
data/training/apes_finetune/
```

Current local inventory:

- Okay Samurai supervised APES data: 3000 train pairs, 700 val pairs, 900 test pairs, with split HDF5 files present.
- Creative Flow supervised corrnet data: 8058 train pairs, 1165 val pairs, 1078 test pairs.
- Okay Samurai sheet runtime data: 20 character folders for APES inference/preflight.
- Duelyst private runtime data: 64 staged character folders generated from the private manifest, each with a copied frame, alpha mask, and `label.json`; the app/private manifest also stages multi-frame atlas animations for workstation/APES review.

The generated `finetune_manifest.json` includes ready-to-run commands for:

- Creative Flow corrnet fine-tuning
- Okay Samurai corrnet fine-tuning
- Okay Samurai fullnet fine-tuning from existing checkpoints
- Duelyst APES pseudo-label/output preparation

Duelyst staged frames now include detector/metadata labels such as `source_family`, `body_class`, `detector_class`, `combat_role`, `training_role`, `animation_labels`, and detector metrics. In Asset Audit, the default Duelyst filters show staged APES candidates and the `Queue APES jobs` action creates persisted APES Lab jobs for the filtered staged set. APES Lab includes `Run Duelyst queue` to run the prepared Duelyst jobs one at a time. The queue now uses real staged idle atlas frames when available and only falls back to duplication for one-frame sources.

For a repeatable command-line queue, run `npm run apes:prepare-duelyst-jobs`. It writes ignored job configs under `data/apes/input/`. The APES Lab `Prepare Duelyst jobs` button runs the same prep path through the local tool server and loads the generated job configs into the in-browser queue. `npm run apes:run-duelyst-jobs` executes that batch through the APES bridge and records content-specific APES rejects in `data/apes/input/duelyst_job_batch.json`; add `-- --fail-on-job-error` when you need strict non-zero behavior. The latest full local run attempted 60 Duelyst jobs, produced 57 successful job results, and recorded 3 APES segmentation rejects: `apes_duelyst_neutral_mercsongweaver_010`, `apes_duelyst_neutral_mercarcanelimiter_038`, and `apes_duelyst_neutral_mercsightlessfarseer_048`. `npm run apes:summarize-outputs` scans completed ignored reports plus failed output statuses and writes `data/apes/output/apes_output_inventory.json` for review triage. In APES Lab, `Inventory APES outputs` shows the same inventory, highlights failed outputs, and can import non-empty local reports into the Part Library.

## APES bridge

APES is treated as a first-class extraction path. The UI produces APES job configs and expects inputs/outputs under:

```text
data/apes/input/
data/apes/output/
```

`tools/apes_bridge/run_apes_extract.py` now has two practical modes:

- real bridge mode for a CUDA-capable APES machine: prepares a temporary APES dataset from job frames, runs the vendored `inference_os.py`, and writes `status.json`, `preflight.json`, and `apes_report.json`
- placeholder mode for local harness work on this machine when `--allow-placeholder` is explicitly enabled
- output inventory mode: summarizes report status, labels, missing expected labels, low-confidence masks, warnings, and review state across `data/apes/output`

The Windows APES bridge includes compatibility fixes for the modern `apes-gpu-modern` environment: Vite `/@fs/` path resolution, absolute runtime output paths, 256x256 APES runtime normalization, `torch_batch_svd` fallback via `torch.linalg.svd`, `torch.symeig` replacement with `torch.linalg.eigh`, current scikit-image `slic` arguments, and Windows-safe APES character path handling. `tensorboard` is required because APES imports training utilities during inference startup.

If APES runs but selects no masks, the bridge writes a completed empty report with warnings instead of treating it as an environment failure. If APES itself rejects a sprite during segmentation, the batch manifest records the failed job and the inventory surfaces the failed output. Multi-frame Duelyst idle jobs can produce useful masks, but output quality is sprite-specific.

For a non-GPU Windows machine, the useful workflow is in the app:

1. Start `npm run dev`.
2. Open `Settings` and set the APES Python path only if you are pointing at a dedicated APES environment on another machine.
3. Open `APES Lab`.
4. Click `Prepare fine-tune data` or `Prepare Duelyst jobs` to run the ignored local prep scripts without leaving the app.
5. Click `Generate local QA harness` to regenerate and import the static sample APES parts without using the terminal.
6. Click `Run APES preflight` to see why the full runtime is unavailable on that machine, or to validate the home GPU machine.

For the home GPU PC, the APES runtime is now verified. Use:

```bash
micromamba run -n apes-gpu-modern python tools\apes_bridge\check_apes_env.py --json
```

If that ever regresses, rebuild from `docs/apes-gpu-rebuild.md`.

You can still regenerate the harness from the terminal when needed:

```bash
npm run qa:apes-harness
```

## Browser regression harness

Use the Playwright harness when you want a repeatable local smoke test instead of stepping through every browser check by hand:

```bash
npm run test:browser
```

The first run may require the Playwright browser install:

```bash
npm run test:browser:install
```

The browser harness now covers:

- manual cleanup save persistence after reload
- rendered frame and full-package export downloads
- recipe save/load and bulk review actions
- creator cockpit part filtering, export target persistence, and LPC source/part compatibility
- Workstation APES mode fake-part prevention
- APES QA harness generation, reload, and pasted JSON import
- APES local-output part image/mask inclusion in full-package zip exports
- credits/provenance report export and inclusion in full-package zips
- Duelyst package audit status and staged source opening when available
- portable setup bundle download from `Settings`
- placeholder-mode manifest provenance and accessible release controls
- paged rendering for large Part Library imports

## Source assets

The original sprite packs and training/checkpoint data are read-only inputs. Generated manifests, bridge output, exports, staged Duelyst crops, browser test artifacts, and APES caches live under ignored local folders inside this repo.
