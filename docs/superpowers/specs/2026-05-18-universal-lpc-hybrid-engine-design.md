# Universal LPC Hybrid Engine Design

Date: 2026-05-18

## Decision

Use the Universal LPC Spritesheet Character Generator as the authoritative LPC data source and composition model, while keeping this app as the production workflow shell for recipes, exports, APES, PixelLab, review, and AI-assisted missing-animation work.

This is not a full UI replacement. The upstream project already models the LPC domain more deeply than our current filename-based inventory: sheet definitions contain multi-layer entries, z-positions, supported animations, body-type-specific paths, variants, recolors, required/excluded tags, aliases, preview hints, and per-item credits. Our app should consume that information instead of rediscovering it through special cases.

References:

- Upstream repo: https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator
- Upstream contribution/metadata workflow: https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator/blob/master/CONTRIBUTING.md
- Upstream catalog API shape: https://raw.githubusercontent.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator/master/sources/state/catalog.ts
- Upstream item parser shape: https://raw.githubusercontent.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator/master/scripts/generateSources/items.js

## What Was Missing From The Earlier Plan

The first draft was directionally right but too vague. It did not name:

- the normalized data schema this app needs
- how upstream `layer_1` through `layer_9` become draw records
- how body types, variants, and animation-specific paths resolve to actual PNG files
- how `custom_animation` and oversize weapon frames fit our current 64x64 renderer
- how credits and licenses flow into export readiness
- how saved recipes survive the model change
- how the app behaves when the local cache has only definitions/assets but not upstream source scripts
- which special-case cloak fixes are temporary and when they can be deleted

This revision fixes those gaps.

## Current State

Our current LPC pipeline has three useful pieces:

- `tools/build-lpc-local-inventory.js` scans PNGs, dimensions, grids, categories, and broad credit files.
- `src/lpcCharacters.ts` turns selected PNG sheets into pseudo `CharacterManifest` entries.
- `CompositeCanvas` and `exportPackage` draw recipe layers with app-defined layer order plus small LPC exceptions.

That was enough to discover LPC assets, but it is not enough to compose them correctly. Examples from the upstream cache:

- `torso/cape/cape_solid.json` has two layers: foreground `zPos: 85` and behind `zPos: 5`.
- `hair/xlong/hair_xlong.json` has foreground `zPos: 120` and background `zPos: 9`.
- `weapons/sword/weapon_sword_longsword.json` has eight layers, including `custom_animation` entries for oversize slash, reverse slash, and thrust.
- `cape_trim.json` has `required_tags: ["cape"]`, so it is an add-on that should be selectable only with a compatible cape base.

Those relationships cannot be represented faithfully as one `cloak_back`, `hair_hat_hood`, or `weapon` layer.

## Target Architecture

Add a real LPC engine boundary:

- `lpcCatalog`: compact local catalog generated from upstream `sheet_definitions`, `palette_definitions`, `spritesheets`, and `CREDITS.csv`.
- `lpcAssetResolver`: resolves body type, variant, animation, direction, and layer path to a concrete PNG and frame geometry.
- `lpcComposition`: converts selected catalog items into sorted draw records.
- `lpcRecipeAdapter`: maps legacy pseudo-character selections and new catalog selections into one recipe model.
- `lpcCredits`: extracts selected-item authors, licenses, URLs, and warnings for export.

The renderer should know how to draw generic draw records. It should not know that capes need special layering or that long hair has a background layer. That belongs in `lpcComposition`.

## Catalog Schema

Generate `data/lpc/lpc_catalog.json` with a stable app-owned shape:

```ts
type LpcCatalog = {
  format: 'pixel_creator_lpc_catalog'
  version: 1
  generated_at: string
  source: {
    repo: string
    reference_root: string
    commit: string | null
    has_upstream_sources: boolean
    has_spritesheets: boolean
    has_sheet_definitions: boolean
    has_palette_definitions: boolean
    has_credits_csv: boolean
  }
  summary: {
    item_count: number
    layer_count: number
    variant_count: number
    credit_count: number
    type_counts: Record<string, number>
  }
  items: Record<string, LpcCatalogItem>
  category_tree: LpcCategoryNode
  aliases: Record<string, LpcAlias>
  palettes: LpcPaletteMetadata
}

type LpcCatalogItem = {
  item_id: string
  name: string
  type_name: string
  path: string[]
  tags: string[]
  required_tags: string[]
  excluded_tags: string[]
  required_body_types: string[]
  variants: string[]
  animations: string[]
  preview: { row: number; column: number; x_offset: number; y_offset: number }
  match_body_color: boolean
  recolors: LpcRecolor[]
  layers: LpcCatalogLayer[]
  credits: LpcCredit[]
}

type LpcCatalogLayer = {
  layer_id: string
  z_pos: number
  custom_animation?: string
  paths_by_body_type: Record<string, string>
}
```

The catalog builder must parse `layer_1` through `layer_9` contiguously, matching the upstream parser, and preserve all metadata fields needed by our app. If the local cache lacks upstream source folders such as `scripts/` or `sources/`, the builder should still parse JSON definitions directly instead of depending on upstream runtime imports.

## Body Type Mapping

Current app body sources must map onto upstream body keys. Initial supported keys:

- `male`
- `female`
- `muscular`
- `pregnant`
- `teen`
- `child`

If a selected body has no exact upstream key, resolve in this order:

1. exact body label from catalog metadata
2. recipe-selected motion/body source label
3. `male` for LPC Entry Human Male
4. `female` for feminine/revised bodies
5. first available body key on the item layer

Every fallback must be recorded in recipe readiness and export provenance.

## Asset Resolution

For each selected LPC item:

1. Pick the item variant.
2. Pick the body type.
3. For each item layer, read `paths_by_body_type[bodyType]`.
4. Resolve a concrete PNG under upstream `spritesheets/<layer path>/<animation>/<variant>.png`.
5. If a layer has `custom_animation`, use that animation key only for matching custom/oversize animations.
6. If no exact animation file exists, ask `lpcAnimationPolicy` for a deterministic fallback.
7. If no file exists after fallback, emit a `missing` draw record instead of silently dropping the item.

The resolver must support both current local asset dumps and upstream `spritesheets` layout. Current asset dump sheets can remain as a degraded fallback, but catalog-backed items should prefer upstream spritesheet paths.

## Animation And Frame Geometry

Our current renderer assumes normalized 64x64 cells. The upstream generator includes standard LPC sheets and oversize/custom animations.

Add an explicit frame geometry table:

- standard walk/spellcast/thrust/slash/shoot/hurt/idle rows and frame counts
- revised/expanded run/jump/sit/emote/combat/climb where present
- custom animation aliases such as `slash_oversize`, `slash_reverse_oversize`, and `thrust_oversize`
- per-animation frame size, frame count, direction row order, and output canvas offset

The first implementation should keep final exported frames on a 64x64 canvas for standard animations. For oversize animations, the engine should either:

- crop/position into the 64x64 output with recorded clipping warnings, or
- mark the animation as oversize and exclude it from standard exports until a larger export profile exists.

Recommendation: support standard 64x64 animations first, expose oversize items as selectable only when the current export profile supports them, and show a readiness warning otherwise.

## Composition Algorithm

Input:

- base body catalog item or current `CharacterManifest`
- selected catalog item references
- selected animation, direction, frame index
- palette/recolor rules
- export profile

Output:

```ts
type LpcDrawRecord = {
  record_id: string
  item_id: string
  item_name: string
  variant: string
  type_name: string
  layer_id: string
  z_pos: number
  source_path: string | null
  source_rect: Rect | null
  dest_rect: Rect
  animation_status: 'exact' | 'fallback' | 'missing' | 'unsupported'
  requested_animation: string
  resolved_animation: string | null
  direction: Direction
  frame_index: number
  body_type: string
  credits: LpcCredit[]
  warnings: string[]
}
```

Algorithm:

1. Build body draw records first.
2. Expand every selected catalog item into one or more layer records.
3. Resolve animation/frame data per layer.
4. Apply body replacement masks only for layers that truly replace body pixels.
5. Sort all drawable records by `z_pos`, then `item_id`, then `layer_id`.
6. Draw missing/unsupported records as nothing, but keep warnings visible.

This removes app-specific ordering like `cloak_back` after `front_arm`. Capes, hair, weapons, shields, and back items all sort from upstream metadata.

## Recipe Model

Add a new optional field while keeping the existing model:

```ts
type KitbashRecipe = {
  lpc_selections?: Record<string, LpcRecipeSelection>
}

type LpcRecipeSelection = {
  slot_id: string
  item_id: string
  variant: string
  type_name: string
  enabled: boolean
  palette_overrides?: Record<string, string>
}
```

`slot_id` should be stable but not limited to our current `PartLabel` list. Examples: `cape`, `cape_trim`, `hair`, `weapon`, `shield`, `neck`, `torso`, `legs`, `feet`.

Legacy migration:

- Existing `selectedParts[label] = lpc-character-id` recipes continue to load.
- On load, `lpcRecipeAdapter` attempts to map pseudo-character ids back to catalog item/variant.
- If mapping succeeds, populate `lpc_selections`.
- If mapping fails, keep the legacy selection and show a migration warning.
- Saving a recipe writes both the new selection and enough legacy data for rollback during the transition.

## Picker UX

Keep the current Fast Creator layout, but make the picker catalog-backed.

Required first version:

- layer/filter dropdown remains, but it filters by `type_name`, tags, and compatibility rules
- search box filters by name, type, variant, tags, author/license text
- grouped options show item name, variant, body support, animation state, and credit status
- selected items remain selected when switching animations if fallback is available
- required/excluded tag rules are shown and enforced gently
- missing animation state has a visible warning, not a disabled mystery

Concrete examples:

- Selecting `cape_solid` enables compatible `cape_trim`.
- Selecting `cape_trim` without a cape shows "requires cape" and does not render.
- Long hair renders foreground and background layers from one item selection.
- A longsword shows oversize/custom-animation status instead of pretending it is a regular 64x64 weapon.

## Credits And License Readiness

Export readiness should distinguish:

- `ok`: selected catalog items have credits and supported licenses
- `needs_review`: credits exist but license terms require manual attribution review
- `missing`: selected item has no credit metadata
- `custom`: APES/PixelLab/generated item needs local review metadata

The exported credits report should include:

- item id, item name, variant, type name
- every selected item's authors
- licenses
- URLs
- notes
- upstream repo URL and commit
- generated/custom item provenance separately

Release exports should be blocked only for missing/unreviewed credits, not merely because an item is LPC-derived.

## Palette And Recolor Policy

Phase 1 carries upstream recolor metadata through the catalog but does not implement the full recolor UI.

Phase 2 or later can add:

- material-aware palette selection
- body-color matching
- per-item palette overrides
- preview parity tests for recolored assets

Until then, the app should keep current hue/saturation/brightness controls and mark upstream palette support as "metadata available, UI pending".

## Local Tools And Cache Management

Asset Audit should expose an "LPC engine" panel:

- reference root path
- upstream commit
- whether `sheet_definitions`, `palette_definitions`, `spritesheets`, and `CREDITS.csv` are present
- whether upstream source scripts are present
- item/layer/variant/credit counts
- last catalog generation time
- rebuild button

The builder should not fail just because upstream `sources/` or `scripts/` are absent in the local cache. It should parse the JSON sources directly. If the upstream source scripts are present, they can be used as a validation reference, not as the app's runtime dependency.

## Migration Phases

Phase 0: Fixture and parity groundwork

- Add fixture JSON definitions for cape, cape trim, xlong hair, longsword, and one shield.
- Add expected compact catalog snapshots for those fixtures.
- Add pixel fixtures for at least one cape frame and one hair frame.

Phase 1: Catalog bridge

- Extend `tools/build-lpc-local-inventory.js` or add `tools/build-lpc-catalog.js`.
- Parse sheet definitions, meta category files, palette definitions, variants, tags, required/excluded tags, recolors, credits, and layer paths.
- Emit `data/lpc/lpc_catalog.json`.
- Keep existing `lpc_asset_inventory.json` for degraded fallback and compatibility.

Phase 2: Composition engine

- Add `src/lpcCatalog.ts`, `src/lpcAssetResolver.ts`, `src/lpcComposition.ts`, and `src/lpcRecipeAdapter.ts`.
- Route `CompositeCanvas` and `exportPackage` through the same draw-record output for catalog-backed LPC selections.
- Delete renderer cloak special-cases only after cape catalog parity tests pass.

Phase 3: Catalog-backed picker

- Replace pseudo-character LPC part options with catalog item/variant options.
- Keep semantic layer filters as an affordance, not as the storage model.
- Add required-tag prompts and animation/fallback badges.

Phase 4: Recipe and credits migration

- Add `lpc_selections` to persisted recipes.
- Migrate saved recipes on load without losing legacy selections.
- Replace broad LPC credit warnings with selected-item credit readiness.

Phase 5: Oversize and AI extension

- Add export profiles for oversize/custom animations.
- Add missing-animation queue.
- PixelLab/AI outputs become reviewed custom parts with provenance, never silent upstream replacements.

## Test Plan

Tool tests:

- parse contiguous `layer_N` objects and stop at the first missing layer
- preserve `zPos`, `custom_animation`, body path keys, variants, tags, required/excluded tags, recolors, aliases, preview hints, and credits
- generate stable catalog ids from fixture definitions
- resolve cape foreground/background draw records in z-order
- resolve xlong hair foreground/background draw records in z-order
- classify longsword oversize layers as unsupported for standard 64x64 export
- produce selected-item credits report entries

Browser tests:

- cape remains selectable on idle and renders with fallback
- cape trim requires cape
- xlong hair renders foreground over head and background behind body
- weapon oversize option shows warning instead of corrupting the frame
- preview and rendered export pixels match for the same catalog-backed recipe
- saved legacy recipe loads and migrates to `lpc_selections`

Visual/manual QA:

- screen capture for cape/hair/weapon ordering
- export a package and inspect Godot/RPG Maker metadata for selected item provenance

## Acceptance Criteria

- `cape_solid`, `cape_trim`, `hair_xlong`, and `weapon_sword_longsword` parse into catalog items with the expected layers, variants, animations, and credits.
- A cape recipe renders without hard-coded `cloak_back` draw-order logic.
- A long-hair recipe renders both foreground and background hair layers correctly.
- An oversize weapon is visible as unsupported/degraded in standard 64x64 export rather than silently misdrawn.
- The same composition function feeds preview and rendered exports.
- Existing saved recipes still load, and migrated LPC selections are saved with stable item ids.
- Exported credits list selected upstream item credits with authors, licenses, URLs, and upstream commit.
- The app runs in degraded mode if upstream metadata is missing, with clear warnings and no crash.

## Implementation Decisions

- Build an app-owned compact catalog JSON instead of importing upstream generated `dist` modules directly.
- Parse upstream JSON definitions directly because this local cache may not include upstream `sources/` and `scripts/`.
- Defer full upstream palette/recolor UI until catalog-backed composition and credits are stable.
- Treat oversize/custom animations as a separate export profile problem, not a quick crop hack.
- Keep the current pseudo-character LPC path only as a compatibility/degraded fallback.
