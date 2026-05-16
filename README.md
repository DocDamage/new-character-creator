# Animated Pixel Character Creator

Local Vite + React + TypeScript app for building a kitbash-oriented character creator from the 50 sprite folders in `../Animated-Pixel-Pack-Characters-V1`.

## Commands

```bash
npm install
npm run index:assets
npm run export:character -- 1-warrior-woman
npm run dev -- --host 127.0.0.1 --port 8002 --strictPort
npm run build
npm run test:browser
```

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
- Batch Generator with deterministic seeded variants.
- Asset Audit with class counts and source warnings.
- APES Lab with first-class job creation, local preflight/bridge actions, a one-click local QA harness generator, logs, job config export, failure surfacing, and report import state.
- Export panel for generic manifests, rendered frame/package downloads, Godot scene stubs, SpriteFrames stubs, and batch queues.
- Browser-side spritesheet downloads for the current animation/direction and all directions of the current action.
- CLI character export under `data/exports/<character_id>/` with `package_manifest.json`, rendered frames/sheets, engine metadata, and source-frame references.
- APES bridge contract under `tools/apes_bridge/`.

## APES bridge

APES is treated as a first-class extraction path. The UI produces APES job configs and expects inputs/outputs under:

```text
data/apes/input/
data/apes/output/
```

`tools/apes_bridge/run_apes_extract.py` now has two practical modes:

- real bridge mode for a CUDA-capable APES machine: prepares a temporary APES dataset from job frames, runs the vendored `inference_os.py`, and writes `status.json`, `preflight.json`, and `apes_report.json`
- placeholder mode for local harness work on this machine when `--allow-placeholder` is explicitly enabled

For the current no-CUDA Windows machine, the useful workflow is in the app:

1. Start `npm run dev`.
2. Open `Settings` and set the APES Python path only if you are pointing at a dedicated APES environment on another machine.
3. Open `APES Lab`.
4. Click `Generate local QA harness` to regenerate and import the static sample APES parts without using the terminal.
5. Click `Run APES preflight` to see why the full runtime is unavailable on this machine, or to validate the home GPU machine later.

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

The original sprite pack is read-only. Generated manifests, bridge output, exports, and screenshots live under `character-creator/`.
