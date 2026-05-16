# Browser Checks

Use these checks while running the local Vite app.

## Start

```bash
npm run dev -- --host 127.0.0.1 --port 8002 --strictPort
```

Open `http://127.0.0.1:8002/`.

If you want the automated smoke pass instead of stepping through the UI manually, run:

```bash
npm run test:browser
```

That harness covers export/package downloads, manual mask save persistence, recipe save/load, Part Library bulk review actions, APES QA harness generation and import, Duelyst audit behavior, and the portable local setup bundle download from `Settings`.

Latest verified automated run:

- `npm run test:browser -- --reporter=line`
- 6 tests passed

Latest verified local app state:

- `npm run build` passes
- dev server verified at `http://127.0.0.1:8002/`
- Duelyst audit scanned 7145 assets, found 696 sprite sheets, staged candidates, and opened `duelyst_f1_elyxstormblade` in the workstation
- APES env preflight is ready in `apes-gpu-modern`
- Private Duelyst manifest generation stages 64 local candidates with `npm run duelyst:private-manifest -- --stage-count 64`
- Asset Audit auto-loads the private Duelyst manifest when present, renders 696 labeled candidates, and exposes 64 staged `Open in workstation` actions
- Default Duelyst filters show the staged APES-review subset, and `Queue APES jobs` creates APES Lab jobs for those filtered staged candidates
- Queued Duelyst APES jobs persist across reloads and APES Lab exposes `Run Duelyst queue` for prepared Duelyst jobs
- CLI Duelyst APES queue writes 60 ignored jobs with `npm run apes:prepare-duelyst-jobs`
- Real APES execution reaches vendored network/deformer on the RTX 3060; multi-frame Duelyst idle jobs can produce creator-sized review masks
- APES Lab exposes `Inventory APES outputs`, backed by `npm run apes:summarize-outputs`, to summarize completed local reports and import non-empty reports for review triage
- Fine-tune prep writes `data/training/apes_finetune/finetune_manifest.json` and 64 Duelyst review folders

## Export Panel

1. Open the `Fast Creator` screen and keep the default recipe or save a new one with at least one reviewed part selected.
2. Open the `Exports` screen.
3. Click `Download rendered frame set`.
4. Confirm a file named like `<recipe>_rendered_frame_set.json` downloads.
5. Inspect the JSON and confirm:
   - `format` is `pixel_creator_rendered_frame_set`
   - `frames` contains rendered PNG `data_url` entries
   - `spritesheets` contains rendered sheet `data_url` entries
   - `gif_previews` contains frame-rate metadata
6. Click `Download rendered frame zip`.
7. Confirm a file named like `<recipe>_rendered_frame_set.zip` downloads.
8. Open the zip and confirm it contains:
   - `rendered_frame_set.json`
   - `rendered/frames/*.png`
   - `rendered/sheets/*.png`
9. Click `Download full package manifest`.
10. Confirm a file named like `<recipe>_full_package_manifest.json` downloads.
11. Inspect the JSON and confirm it includes:
   - `manifest`
   - `rendered_outputs`
   - `engine_exports`
   - `reusable_part_folders`
   - `extraction_provenance`
12. Click `Download full package zip`.
13. Confirm a file named like `<recipe>_full_package.zip` downloads.
14. Open the zip and confirm it contains:
   - `package_manifest.json`
   - `exports/godot/*`
   - `exports/unity/*`
   - `exports/rpg_maker/*`
   - `exports/aseprite/*`
   - `rendered/frames/*.png`
   - `rendered/sheets/*.png`
   - selected `parts/<label>/<part_id>/` folders when reviewed parts are used in the recipe

## Manual Mask Save

1. Open `Art Workstation`.
2. Set extraction mode to `Preset regions`.
3. Click `Extract PNG + mask` for the current region.
4. In `Manual mask cleanup`, choose the new extracted part or `New manual part from current region`.
5. Paint or erase a few pixels, then click `Save cleanup as part`.
6. Open `Part Library` and confirm a `manual` part appears for that region.
7. Reload the browser.
8. Open `Part Library` again and confirm the saved manual part still exists and remains reviewed.

## APES Report Import

1. Open `APES Lab`.
2. Click `Generate local QA harness`.
3. Confirm APES Lab reports that the harness was generated and imported.
4. Open `Part Library`.
5. Filter by method `APES`.
6. Confirm imported parts exist with:
   - `confidence_*` tags
   - preserved bounds from the sample JSON
   - warnings from both the report and individual masks
7. Return to `APES Lab`.
8. Click `Load and replace QA sample report` and confirm it still imports cleanly from `public/data/qa/apes_report_harness.json`.
9. Paste the contents of `public/data/qa/apes_report_harness.json` into the textarea and click `Import pasted JSON`.
10. Confirm the import succeeds without console errors and APES parts remain selectable in `Fast Creator` and editable in `Art Workstation`.

## APES GPU Preflight

Run this on the home GPU PC:

```bash
micromamba run -n apes-gpu-modern python tools\apes_bridge\check_apes_env.py --json
```

Confirm:

- `ready` is `true`
- `pytorch3d`, `torch_cluster`, `torch_scatter`, and `tensorboard` are `true`
- `torch.cuda_available` is `true`
- the checkpoint path points at `checkpoints/train_cluster/model_best.pth.tar`
- the test folder points at `training data/okaysamurai_sheets`

## Duelyst Audit

1. Open `Asset Audit`.
2. Click `Analyze and stage Duelyst package`.
3. If `assets/Duelyst-Unit-Animations.unitypackage` is present, confirm candidate sheets appear with cropped previews and `Open in workstation` actions for staged entries.
4. Open one staged candidate and confirm the source character switches to a `duelyst_*` entry in the workstation.
5. If the package is not present on the machine, confirm the status card reports that the package was not found instead of failing silently.

## Settings Bundle

1. Open `Settings`.
2. Enter a target asset root and, if relevant, an APES Python path.
3. Click `Download local setup bundle`.
4. Confirm the downloaded markdown includes:
   - the asset root you entered
   - the APES interpreter you entered
   - repair, reindex, and sample export commands
   - `npm run test:browser`
   - `.\tools\apes_bridge\setup_home_pc.ps1`

## Export Package Contents

1. Open `Exports`.
2. Click `Download full package zip`.
3. Confirm the package includes:
   - `rendered/frames/*.png`
   - `rendered/sheets/*.png`
   - `exports/godot/*.tscn`
   - `exports/godot/*_sprite_frames.tres`
   - `exports/unity/*_unity_2d.json`
   - `exports/unity/*_animation_clips.json`
   - `exports/unity/Editor/*_PixelCreatorImporter.cs`
   - `exports/rpg_maker/$*.png`
   - `exports/rpg_maker/*_rpg_maker_mz.json`
   - `exports/aseprite/*_aseprite_reference.json`
   - `exports/aseprite/*_aseprite_import.js`
