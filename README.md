# Animated Pixel Character Creator

Local Vite + React + TypeScript app for building a kitbash-oriented pixel character creator from indexed sprite folders, extracted reusable parts, APES masks, Duelyst staged source sheets, and deterministic kitbash recipes.

## Current status

- Frontend build passes with `npm run build`.
- Browser regression harness passes with `npm run test:browser`.
- Local dev server has been verified at `http://127.0.0.1:8002/`.
- APES GPU preflight passes in `apes-gpu-modern` with CUDA PyTorch, PyTorch3D, PyG extensions, OpenCV, checkpoints, and okaysamurai test data available.
- The only APES preflight warning is that upstream APES originally targeted Python 3.7 while the working local environment uses Python 3.10.
- Duelyst package unpacking, detector labeling, staging, and in-app browsing has been verified against `assets/Duelyst-Unit-Animations.unitypackage`: 7145 assets scanned, 696 sprite sheets labeled/viewable in Asset Audit, and 64 staged candidates openable in the workstation.

## Commands

```bash
npm install
npm run index:assets
npm run duelyst:private-manifest
npm run apes:prepare-finetune
npm run export:character -- 1-warrior-woman
npm run dev -- --host 127.0.0.1 --port 8002 --strictPort
npm run build
npm run test:browser
```

APES GPU verification on the home PC:

```bash
micromamba run -n apes-gpu-modern python tools\apes_bridge\check_apes_env.py --json
```

Full APES/PyTorch3D rebuild notes live in `docs/apes-gpu-rebuild.md`.

If the sprite pack lives somewhere other than `../Animated-Pixel-Pack-Characters-V1`, override it with `PIXEL_CREATOR_ASSET_ROOT` or `--asset-root`:

```bash
$env:PIXEL_CREATOR_ASSET_ROOT = 'D:\sprite-packs\Animated-Pixel-Pack-Characters-V1'
npm run index:assets
npm run export:character -- 1-warrior-woman --asset-root 'D:\sprite-packs\Animated-Pixel-Pack-Characters-V1'
```

If you prefer not to remember the commands, open the `Settings` screen in the app. It has buttons that copy the repair, reindex, and sample export commands with your chosen asset-pack path filled in.

When the app is running with `npm run dev`, the same `Settings` screen can also run the repair and reindex actions directly through the local Vite dev server. APES Lab uses that same local dev flow for APES preflight checks, local bridge runs, and the no-CUDA QA harness generator.

The `Settings` screen now also exposes a `Copy browser regression command` action for the local Playwright harness. That harness validates two non-APES workflows end to end:

- rendered/full-package export downloads
- manual mask save persistence after reload
- recipe save/load state
- Part Library bulk review actions
- APES QA harness generation plus report reload and pasted JSON import
- Duelyst audit behavior, including the no-package warning path and staged-workstation opening path when the local unitypackage is available
- portable local setup bundle export from `Settings`

`Settings` also exposes a `Download local setup bundle` action. It writes a machine-ready markdown checklist with your current asset root, APES interpreter, setup commands, and browser regression command filled in so you can move the workflow to another PC without rebuilding the commands by hand.

## What is implemented

- Asset indexer that scans all 50 character folders and writes `public/data/manifests/characters.json`.
- Normalized animation names:
  - `walking` / `walking-4-frames` -> `walk`
  - `attack` / `attack-1` -> `attack`
  - `running-jump` -> `running_jump`
- Pixel-perfect canvas preview for real source frames.
- Fast Creator for part-source selection and recipe export.
- Art Workstation with preset regions, APES/preset/connected/manual mode comparison, region controls, and cleanup tool surface.
- Manual mask cleanup with persisted reviewed manual parts.
- Part Library with filtering, reviewed/unreviewed state, JSON export, visible JSON export, and APES QA cleanup.
- Batch Generator with deterministic seeded variants.
- Asset Audit with class counts, source warnings, and Duelyst unitypackage inspection/staging.
- Duelyst Asset Audit filters for search, body class, source family, training role, and staged state, plus batch APES job creation for staged review candidates.
- APES Lab with first-class job creation, local preflight/bridge actions, a one-click local QA harness generator, logs, job config export, failure surfacing, file import, pasted JSON import, and APES-to-part-library conversion.
- Export panel for generic manifests, rendered frame/package downloads, Godot scene stubs, SpriteFrames stubs, and batch queues.
- Production-oriented full package zip with rendered PNGs, Godot 4 `SpriteFrames` resources, Unity import settings and Editor importer script, RPG Maker MZ single-character sheet, Aseprite import script/spec, and extraction provenance.
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

The manifest records every candidate unit sheet, staged review frames, source paths, warnings, and detector labels. The labels combine Duelyst path/name/animation metadata with a lightweight alpha-silhouette detector that measures the representative crop's bounds, fill, mass distribution, edge contact, and color footprint. Those labels are meant for filtering and review triage; they are not APES ground-truth body-part correspondence labels. The extracted assets and private manifest are not committed.

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
- Duelyst private runtime data: 64 staged character folders generated from the private manifest, each with a copied frame, alpha mask, and `label.json`.

The generated `finetune_manifest.json` includes ready-to-run commands for:

- Creative Flow corrnet fine-tuning
- Okay Samurai corrnet fine-tuning
- Okay Samurai fullnet fine-tuning from existing checkpoints
- Duelyst APES pseudo-label/review preparation

Duelyst staged frames now include detector/metadata labels such as `source_family`, `body_class`, `detector_class`, `combat_role`, `training_role`, `animation_labels`, and detector metrics. In Asset Audit, the default Duelyst filters show staged APES-review candidates and the `Queue APES jobs` action creates APES Lab jobs for the filtered staged set. These labels still are not ground-truth correspondence labels, so run/review APES outputs and promote accepted masks before mixing them into supervised fine-tuning.

## APES bridge

APES is treated as a first-class extraction path. The UI produces APES job configs and expects inputs/outputs under:

```text
data/apes/input/
data/apes/output/
```

`tools/apes_bridge/run_apes_extract.py` now has two practical modes:

- real bridge mode for a CUDA-capable APES machine: prepares a temporary APES dataset from job frames, runs the vendored `inference_os.py`, and writes `status.json`, `preflight.json`, and `apes_report.json`
- placeholder mode for local harness work on this machine when `--allow-placeholder` is explicitly enabled

For a non-GPU Windows machine, the useful workflow is in the app:

1. Start `npm run dev`.
2. Open `Settings` and set the APES Python path only if you are pointing at a dedicated APES environment on another machine.
3. Open `APES Lab`.
4. Click `Generate local QA harness` to regenerate and import the static sample APES parts without using the terminal.
5. Click `Run APES preflight` to see why the full runtime is unavailable on that machine, or to validate the home GPU machine.

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
- APES QA harness generation, reload, and pasted JSON import
- Duelyst package audit status and staged source opening when available
- portable setup bundle download from `Settings`

## Source assets

The original sprite packs and training/checkpoint data are read-only inputs. Generated manifests, bridge output, exports, staged Duelyst crops, browser test artifacts, and APES caches live under ignored local folders inside this repo.
