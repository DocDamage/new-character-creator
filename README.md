# Animated Pixel Character Creator

Local Vite + React + TypeScript app for building a kitbash-oriented character creator from the 50 sprite folders in `../Animated-Pixel-Pack-Characters-V1`.

## Commands

```bash
npm install
npm run index:assets
npm run export:character -- 1-warrior-woman
npm run dev -- --host 127.0.0.1 --port 8002 --strictPort
npm run build
```

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
- APES Lab with first-class job creation, logs, job config export, failure surfacing, and report import state.
- Export panel for generic manifests, Godot scene stubs, SpriteFrames stubs, and batch queues.
- Browser-side spritesheet downloads for the current animation/direction and all directions of the current action.
- CLI character export under `data/exports/<character_id>/` with copied frames, generic manifest, and Godot files.
- APES bridge contract under `tools/apes_bridge/`.

## APES bridge

APES is treated as a first-class extraction path. The UI produces APES job configs and expects inputs/outputs under:

```text
data/apes/input/
data/apes/output/
```

`tools/apes_bridge/run_apes_extract.py` currently provides the APES service contract and deterministic placeholder masks. Replace the placeholder generator with the real APES runtime when available.

## Source assets

The original sprite pack is read-only. Generated manifests, bridge output, exports, and screenshots live under `character-creator/`.
