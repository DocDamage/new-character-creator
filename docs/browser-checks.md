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

That harness covers export/package downloads, manual mask save persistence, recipe save/load, and Part Library bulk review actions.

It now also covers APES QA harness generation and import, Duelyst audit behavior, and the portable local setup bundle download from `Settings`.

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