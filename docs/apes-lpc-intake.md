# APES LPC Intake

Date: 2026-05-17

## Scope

Local source folder:

```text
assets/lpc sprite generator stuff
```

Reference upstream:

```text
https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator
```

Reference clone used for intake only:

```text
%TEMP%/Universal-LPC-Spritesheet-Character-Generator-intake
```

## Intake Summary

This source should not be treated as a plain APES-only pixel extraction batch.
Universal LPC already carries structured metadata that is more valuable than
inference for many files: layer definitions, z positions, body-type variants,
animation support, recolor palettes, and per-item credits.

Recommended split:

- Use LPC metadata import for canonical LPC/ULPC/LPCR sheets.
- Use APES for unlabeled sheets, loose packs, generated compositions, and QA
  review where part masks are missing.
- Keep credits and license metadata available for local reference and release
  validation. Missing shipped license coverage is release-blocking.

## Local Asset Inventory

Current local folder shape:

- 16,200 PNG files.
- 2 JSON files.
- 9 text or markdown-like files.
- About 128 MB of PNG data.
- Dominant PNG sheet sizes:
  - 192x256: 6,253 files.
  - 512x256: 4,246 files.
  - 384x256: 2,113 files.
  - 320x256: 798 files.
  - 128x256: 466 files.
  - 832x1344: 460 files.

Largest local top-level buckets by PNG count:

- `[LPC Revised] Character Basics`: 12,606
- `Clothes`: 378
- `memao-assets`: 319
- `lpc-helmets`: 318
- `Bases`: 200
- `Adult Female`: 175
- `Adult Female, Pregnant`: 175
- `Teen`: 175
- `lpc_entry`: 164
- `Hair`: 160
- `Adult Male`: 145
- `Androgynous Long-Sleeve Shirt`: 140
- `Androgynous Pants`: 140

Current handling: the LPC folder is a source asset input. The production branch
now allows curated LPC source files and nearby per-folder `license.txt` files to
be tracked when they are explicitly part of the release package. Loose root
files were moved into `Randoms/`, and every shipped LPC asset must resolve to
nearest-folder license metadata.

Use:

```powershell
npm run lpc:inventory
npm run lpc:catalog
npm run license:audit
```

`data/lpc/lpc_asset_inventory.json` and `data/lpc/lpc_catalog.json` carry
`license_file`, `license_scope`, `license_text_hash`, `license_status`, and
`source_folder` metadata. `docs/asset-license-audit.md` is regenerated from
that metadata and the release validator fails if shipped LPC catalog entries are
not covered.

## Upstream Repo Findings

Upstream HEAD inspected:

```text
34d62814547dd93b2cba7f94d98e15ec3ae9e945
2026-05-15 08:44:45 -0400
feat: Migrate the final components to ts
```

Useful upstream folders:

- `sheet_definitions/`: 767 JSON definitions.
- `palette_definitions/`: palette materials and variants.
- `spritesheets/`: 145,452 PNG files.
- `CREDITS.csv`: full attribution table.
- `scripts/generate_sources.js`: metadata generator entrypoint.
- `scripts/generateSources/items.js`: parser for item definitions.
- `scripts/generateSources/state.js`: emits item, layer, credit, palette, and
  index metadata modules.
- `sources/custom-animations.ts`: animation row/frame layout definitions.

The key item JSON shape includes:

- `name`
- `priority`
- `type_name`
- `layer_1` through `layer_9`
- per-layer `zPos`
- body-type path mappings such as `male`, `female`, `teen`, `child`
- `animations`
- `credits`
- `recolors`
- tags and variant metadata

This maps closely to this app's part library, layer order, local export
metadata, and APES review metadata.

## APES Fit

Good APES candidates:

- Loose sheets without metadata.
- Memao and other mixed packs where body part labels are absent.
- Generated composite characters where APES can create review masks.
- QA comparisons between inferred masks and metadata-derived layer bounds.

Weak APES candidates:

- LPC sheets with exact upstream `sheet_definitions`.
- Recolor variants where palette metadata already describes the change.
- Source packs where credits should remain available as local reference
  metadata.

## Import Strategy

1. Add a metadata-first LPC importer.
   - Read `sheet_definitions/**/*.json`.
   - Normalize layers into local part/layer records.
   - Preserve z position, type name, supported animations, body types, variants,
     recolor material, and credits.

2. Add a local asset-root mode for LPC.
   - Keep source files under ignored local storage.
   - Write a small manifest into `public/data/manifests/*.local.json` or another
     ignored runtime path.
   - Store absolute `/@fs/...` URLs for local preview, not committed asset paths.

3. Add APES review only where metadata is absent.
   - Stage selected composed frames into `data/apes/input/<job_id>/frames`.
   - Run APES bridge.
   - Import APES masks as parts with confidence/warning metadata.

APES Lab now exposes the local preparation scripts directly:

- `Prepare fine-tune data` writes and reloads
  `data/training/apes_finetune/finetune_manifest.json`.
- `Prepare Duelyst jobs` writes `data/apes/input/duelyst_job_batch.json`,
  reloads the generated job configs, and queues them for `Run Duelyst queue`.

4. Keep credits attached to every imported layer.
   - Use upstream `CREDITS.csv` or item `credits` blocks.
   - Export credit manifests alongside generated character packages.

## Parallel Work Guidance

Yes, you can keep ingesting while this intake work exists. The safest split is:

- You can work on raw asset organization and ingest experiments under
  `assets/lpc sprite generator stuff`.
- I should avoid editing that folder directly while you are moving files.
- I can work on docs, importer code, tests, and manifest generation.
- We should avoid both editing `tools/index-assets.js`,
  `public/data/manifests/*`, or the same new importer file at the same time.

If you run an ingest that regenerates manifests, tell me which command and
output path, because this repo already has local-manifest behavior that may
choose `characters.local.json` for ignored or external assets.

## Current Progress

- `/assets/lpc sprite generator stuff/` is now ignored so the raw 16k-file dump
  does not get staged accidentally.
- `npm run lpc:inventory` builds an ignored local inventory at
  `data/lpc/lpc_asset_inventory.json`.
- Asset Audit can run the inventory, browse sheet previews, filter by search,
  category, and LPC grid compatibility, select visible or individual sheets,
  choose inferred or explicit part labels, mark imported parts reviewed, and
  import them into the Part Library as selectable manual parts.
- The same inventory now feeds runtime LPC source manifests. Selectable LPC
  sheets are grouped by source/action path so walk, spellcast, slash, shoot,
  thrust, hurt, and related rows become canonical app animations instead of
  scattered folder aliases.
- Classic 13-column/21-row LPC sheets keep their row-slice animation mapping.
  Separate body base sheets such as Human Male and Skeleton are grouped into
  mannequin sources, while action-specific equipment sheets remain part sources.
- Fast Creator only exposes LPC sheet parts when the current source context can
  use them. Part labels include compatibility aliases such as front/back arms,
  front/back legs, head/face/hair, cloak/back items, and accessory-like effects.
- The tool and browser test suites cover LPC inventory fixture behavior and the
  browse/select/label/import UI workflow alongside the asset indexer
  local-manifest regression. Browser coverage also checks canonical LPC
  animation labels, body-base coverage, and compatible sheet-part picker
  behavior.
- A compact Universal LPC catalog path now exists beside the inventory path.
  Catalog-backed selections preserve upstream item IDs, variants, credits,
  multi-layer z positions, required/excluded tags, body paths, and custom
  animation metadata in saved recipes.
- Catalog-backed LPC selections render through the shared preview/export path.
  The renderer sorts catalog layers by upstream z position around the base body,
  while the older pseudo-character LPC sheet path remains as a degraded fallback.
- Exported credits reports include `selected_lpc_catalog_items`, and the Exports
  screen surfaces selected upstream item counts, missing credits, and
  review-needed credit states before download.
- APES Lab now exposes a missing-animation queue for LPC catalog-backed recipes.
  It groups missing or unsupported catalog draw records for later AI/APES handoff
  without selecting generated output automatically.
- LPC source cards in Asset Audit support shared context-menu actions by
  right-click, keyboard, and the visible action button. `View info` opens the
  Details drawer.
- Oversize/custom-animation catalog items are visibly marked as degraded in the
  standard 64x64 export profile instead of being treated as normal weapon layers.
- LPC credits/license data is production metadata. Selected catalog credits are
  exported, and shipped LPC catalog entries must report `license_status:
  "covered"`.
- The generated audit currently reports 655 covered LPC catalog entries and 0
  missing entries after the Randoms/per-folder-license cleanup.
- `npm run production:check` includes secret scanning, license audit, RAG
  evaluation, tool tests, release validation, preview local-tools smoke, and
  browser regression.

## Remaining Next Steps

- Expand metadata-first catalog usage across more UI surfaces so fewer workflows
  depend on legacy pseudo-character LPC sheet parts.
- Add richer LPC composition validation so mixed body types, equipment anchors,
  palette/recolor metadata, and per-animation offsets can be reviewed before
  export.
- Continue expanding provider output intake for PixelLab/future AI backends that
  consume the missing-animation queue. Provider calls must stay behind the
  session-only secret vault and local proxy/backend boundary.
- Add guided Training Inbox / Training Library records for dropped or generated
  animation sets, with validation and review gates before frames become
  selectable.
- Add oversize/custom-animation export profiles when the app is ready to emit
  larger canvases instead of only warning in the standard 64x64 profile.
- Keep APES focused on unknown packs and review masks, not on replacing LPC's
  existing layer metadata.
