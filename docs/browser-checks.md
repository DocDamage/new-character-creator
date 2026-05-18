# Browser Checks

Use these checks while running the local Vite app. The automated harness serves
the production bundle through Vite preview so it exercises release behavior.

## Start

```bash
npm run dev -- --host 127.0.0.1 --port 8002 --strictPort
npm run build:local-tools
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open `http://127.0.0.1:8002/`.

If you want the automated smoke pass instead of stepping through the UI manually, run:

```bash
npm run test:browser
```

That harness covers export/package downloads, standalone Godot SpriteFrames resources, credits/provenance report export, manual mask save persistence, recipe save/load, creator cockpit filtering/export-target persistence, Part Library bulk review actions, fake APES-part prevention, APES QA harness generation/import, APES fine-tune prep and Duelyst job-batch queueing, APES local-output image/mask package assets, Duelyst audit behavior, LPC inventory browse/select/label/import, LPC source picker canonical animations and compatible sheet parts, catalog-backed LPC selections, rendered-frame export, upstream credit readiness, right-click LPC source details, missing-animation queue visibility, oversize/custom-animation warnings, placeholder-mode manifest provenance, paged large Part Library imports, page-scoped visible export/review actions, and the portable local setup bundle download from `Settings`.

For optional local cross-browser smoke coverage after installing the full browser set:

```bash
npm run test:browser:install-all
npm run test:browser:all
```

Private Duelyst package harvesting is intentionally opt-in outside the release gate:

```bash
npm run test:private-assets
```

It runs the heavier private package path when `assets/Duelyst-Unit-Animations.unitypackage` is present and skips cleanly on machines without that ignored asset.

Latest verified automated run:

- `npm run lint`
- `npm run check:source-hygiene`
- `npm run test:tools`
- `npm run build`
- `npm run build:release`
- `npm run validate:release-package`
- `npm run test:preview-tools`
- `npm run test:browser` passed, 17 Chromium tests
- `npm run test:browser:all` passed, 51 Chromium/Firefox/WebKit tests
- `npm run test:private-assets` optional/private-machine only
- `npm run release:check` passed
- latest focused gate passed with lint, source hygiene, 49 tool tests, public release build/package validation, tokenized preview local-tool smoke, 17 Chromium browser tests, and 51-test cross-browser matrix
- latest LPC hybrid follow-up smoke passed with `npm run build`, 37 tool tests, and 17 Chromium browser regression tests

Latest verified local app state:

- `npm run build` passes
- `npm run build:release && npm run validate:release-package` passes with no private/local references in emitted text assets
- local APES/LPC/Duelyst/repair POST routes require the generated local session token and reject tokenless or cross-origin requests
- dev server verified at `http://127.0.0.1:8002/`
- Duelyst audit scanned 7145 assets, found 696 sprite sheets, staged candidates, and opened `duelyst_f1_elyxstormblade` in the workstation
- APES env preflight is ready in `apes-gpu-modern`
- Private Duelyst manifest generation stages 64 local candidates with `npm run duelyst:private-manifest -- --stage-count 64`
- Asset Audit auto-loads the private Duelyst manifest when present, renders 696 labeled candidates, and exposes 64 staged `Open in workstation` actions
- Default Duelyst filters show the staged APES-review subset, and `Queue APES jobs` creates APES Lab jobs for those filtered staged candidates
- Queued Duelyst APES jobs persist across reloads and APES Lab exposes `Run Duelyst queue` for prepared Duelyst jobs
- CLI Duelyst APES queue writes 60 ignored jobs with `npm run apes:prepare-duelyst-jobs`
- Real APES execution reaches vendored network/deformer on the RTX 3060. The latest full Duelyst APES run attempted 60 jobs, produced 57 successes, and recorded 3 sprite-specific APES segmentation rejects in the batch manifest.
- APES Lab exposes `Inventory APES outputs`, backed by `npm run apes:summarize-outputs`, to summarize completed local reports, show failed outputs, and import non-empty reports
- APES Lab exposes `Prepare fine-tune data`, backed by `tools/apes_bridge/prepare_finetune_data.py`, and shows the loaded prep artifact summary.
- APES Lab exposes `Prepare Duelyst jobs`, backed by `tools/apes_bridge/prepare_duelyst_apes_jobs.py`, and loads the generated job configs into `Run Duelyst queue`.
- Fine-tune prep writes `data/training/apes_finetune/finetune_manifest.json` and 64 Duelyst review folders.
- Source metadata is optional private debugging data and is not a browser-check release gate.
- LPC sheets are available as runtime `lpc_character` sources when the inventory is present. Canonical LPC action labels replace local folder aliases such as `magic` or `swing`, body base sheets are grouped into mannequin sources, and compatible LPC sheet parts only appear while an LPC mannequin/source pack context can use them. Catalog-backed LPC selections also persist in saved recipes, render through the shared preview/export path, list selected upstream credits in Exports, and feed the APES Lab missing-animation queue.

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
   - `credits_report`
   - optional local metadata such as source layer details
12. Click `Download full package zip`.
13. Confirm a file named like `<recipe>_full_package.zip` downloads.
14. Open the zip and confirm it contains:
   - `package_manifest.json`
   - `credits_report.json`
   - `exports/godot/*`
   - `exports/unity/*`
   - `exports/rpg_maker/*`
   - `exports/aseprite/*`
   - `rendered/frames/*.png`
   - `rendered/sheets/*.png`
   - selected `parts/<label>/<part_id>/` folders when reviewed parts are used in the recipe
15. Click `Download SpriteFrames resource`.
16. Confirm the `.tres` file contains real `Texture2D` frame resources pointing at `rendered/frames`.
17. Click `Download credits report`.
18. Confirm the JSON has `format: pixel_creator_credits_report`, selected part review status, selected LPC catalog item credits when catalog selections are enabled, LPC credit/license warnings when LPC parts are present, and APES visual QA notes when APES parts are present.

## LPC Catalog Selection Checks

1. Open `Fast Creator`.
2. Set the source pack to `LPC` and choose an LPC mannequin body.
3. Select a catalog-backed cape from the LPC catalog picker.
4. Save the recipe and open `Exports`.
5. Confirm `LPC credit readiness` shows the selected upstream item count and missing-credit count.
6. Click `Download rendered frame set` and confirm rendered frames download without canvas errors.
7. Click `Download credits report` and confirm `selected_lpc_catalog_items` includes the selected item, variant, authors, licenses, URLs, upstream repo, and upstream commit when available.
8. Return to `Fast Creator`, select a weapon catalog item with an oversize/custom-animation layer, and confirm the picker shows an oversize export-profile warning.
9. Open `APES Lab` and confirm `Missing animation queue` is visible for LPC catalog-backed recipes.
10. In `Asset Audit`, right-click an LPC sheet card, choose `View info`, and confirm the Details drawer opens.

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

## APES Output Inventory

1. Run `npm run apes:summarize-outputs` after APES jobs complete.
2. Open `APES Lab` and click `Inventory APES outputs`.
3. Confirm the inventory shows:
   - completed report count
   - failed output count
   - missing/low-confidence label summaries
   - import buttons for non-empty reports
4. For the latest full Duelyst batch, expect 3 failed outputs:
   - `apes_duelyst_neutral_mercsongweaver_010`
   - `apes_duelyst_neutral_mercarcanelimiter_038`
   - `apes_duelyst_neutral_mercsightlessfarseer_048`
5. Confirm the failed outputs are visible as APES/content failures, not hidden as a crashed batch.

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
   - `npm run validate:release-package`
   - `npm run test:browser`
   - `npm run release:check`
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
