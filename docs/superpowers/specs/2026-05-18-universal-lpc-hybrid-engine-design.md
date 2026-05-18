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
- how LPC, non-LPC sprite-pack characters, Duelyst staged characters, and custom parts stay in separate compatibility spaces
- how the UI moves from one crowded workspace into task tabs without hiding important warnings
- how metadata, credits, file paths, and compatibility details move into contextual info surfaces instead of filling the main panels
- what right-click actions and tooltips must exist so the app feels fast without becoming mysterious

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

The current app also mixes incompatible source families too freely:

- `App.tsx` combines the base manifest, staged Duelyst manifest, and generated LPC characters into one `characters` list.
- The sidebar has a `Source pack` filter, including `All packs`, but the creation controls still share one global selected source.
- The live part picker can show "LPC sheet parts" next to imported/extracted parts, even when the selected body is not an LPC body.
- Duelyst entries are review/training sources, not body bases for LPC composition.
- Non-LPC sprite-pack characters can be useful source art, but their parts do not follow Universal LPC layer metadata, body types, animation rows, or credit rules.

The new design must make those boundaries visible in the data model and the UI. A filter is not enough.

## Target Architecture

Add a real LPC engine boundary:

- `lpcCatalog`: compact local catalog generated from upstream `sheet_definitions`, `palette_definitions`, `spritesheets`, and `CREDITS.csv`.
- `lpcAssetResolver`: resolves body type, variant, animation, direction, and layer path to a concrete PNG and frame geometry.
- `lpcComposition`: converts selected catalog items into sorted draw records.
- `lpcRecipeAdapter`: maps legacy pseudo-character selections and new catalog selections into one recipe model.
- `lpcCredits`: extracts selected-item authors, licenses, URLs, and warnings for export.
- `sourceFamilyRegistry`: separates LPC, sprite-pack, Duelyst, and custom/imported assets into compatible workspaces.
- `uiDisclosure`: shared context-menu, tooltip, and details-drawer primitives for hidden metadata and quick actions.

The renderer should know how to draw generic draw records. It should not know that capes need special layering or that long hair has a background layer. That belongs in `lpcComposition`.

## Source Family Boundaries

Treat source families as first-class compatibility domains:

```ts
type SourceFamilyId = 'lpc' | 'sprite_pack' | 'duelyst' | 'custom'
type WorkspaceTabId = 'create' | 'parts' | 'sources' | 'workstation' | 'batch' | 'ai_apes' | 'export' | 'settings'
type RecipeModeId = 'lpc_character' | 'sprite_kitbash' | 'duelyst_review'

type SourceFamily = {
  family_id: SourceFamilyId
  label: string
  role: 'composition' | 'reference' | 'training' | 'review'
  compatible_recipe_modes: RecipeModeId[]
  can_provide_body: boolean
  can_provide_parts: boolean
  can_provide_motion: boolean
  default_tab: WorkspaceTabId
}
```

Initial rules:

- LPC catalog items can compose only with LPC-compatible bodies and catalog-backed custom parts.
- Sprite-pack characters stay in the sprite kitbash workspace unless a part is explicitly extracted, reviewed, and tagged as custom compatible with a target recipe mode.
- Duelyst staged characters stay in a Duelyst review/training workspace. They can feed APES review jobs and custom extraction, but they are not shown as LPC bodies or LPC part options.
- Custom/imported parts live in the Part Library with explicit `source_family` and `compatible_recipe_modes`; they appear only in workspaces they have been reviewed for.
- The app may keep a read-only "All sources" view in Asset Audit, but composition pickers should never default to cross-family mixing.

Persisted recipes should record `recipe_mode` and `source_family`; the full recipe shape is defined in the Recipe Model section.

Legacy recipes with no mode should be inferred from the base character. If inference is ambiguous, load the recipe in a compatibility review state instead of silently mixing families.

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

## Future Rigging And Animation Authoring

Bone/rig-based animation authoring is a mandatory future capability, but it is gated behind a stable LPC engine, source-family separation, recipe migration, and export pipeline. It should not be implemented as part of the initial catalog/composition fix because it introduces a second animation model.

The rigging system should add:

- a 2D skeleton model with named bones, joints, pivots, constraints, and attachment points
- per-layer attachments so bodies, clothes, hair, weapons, capes, and custom parts can follow a rig without losing their source-family provenance
- keyframed pose editing with onion-skin previews
- animation-profile output so a newly authored action can become normal spritesheet frames
- frame baking that writes reviewed custom animation frames, not hidden procedural state
- optional AI/APES/PixelLab assistance for missing frames, cleanup, in-betweens, and consistency checks
- provenance for every generated or edited frame

The rigging system should not replace Universal LPC metadata. It should consume catalog-backed draw records and custom parts, then bake new frames into the same reviewed asset pipeline used by exports. Game exports should still receive spritesheets, frame metadata, and credits; they should not need this app's rig runtime.

Initial rigging scope after the stable foundation:

- create a new animation from an existing LPC-compatible body and selected parts
- clone timing from a reference animation such as slash, thrust, shoot, or walk
- edit key poses on a small number of frames
- bake to a named custom animation profile
- mark every missing, unsupported, generated, or manually edited frame for review

Deferred rigging scope:

- mesh deformation
- runtime skeletal export to game engines
- automatic rig extraction from arbitrary sprite sheets
- physics simulation for capes, hair, or cloth

This phase becomes eligible only when the prior phases meet their acceptance criteria and the preview/export renderer uses one shared composition path.

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
  recipe_mode?: RecipeModeId
  source_family?: SourceFamilyId
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
- Existing recipes infer `recipe_mode` and `source_family` from the base character and selected source ids.
- On load, `lpcRecipeAdapter` attempts to map pseudo-character ids back to catalog item/variant.
- If mapping succeeds, populate `lpc_selections`.
- If mapping fails, keep the legacy selection and show a migration warning.
- Saving a recipe writes both the new selection and enough legacy data for rollback during the transition.
- If a saved recipe mixes families in a way the new model does not support, load it in compatibility review mode with rendering disabled for incompatible selections until the user resolves them.

## Picker UX

Move the current crowded Fast Creator controls into a task-based tabbed interface, then make the picker catalog-backed inside the LPC workspace.

Top-level tabs:

- `Create`: active recipe workspace and composite preview.
- `Parts`: reviewed custom parts, extraction outputs, and compatibility review.
- `Sources`: source-family browsers for LPC catalog, sprite-pack sources, and Duelyst staged assets.
- `Workstation`: manual masks, region extraction, and pixel inspection.
- `Batch`: variant generation.
- `AI/APES`: APES jobs, PixelLab/AI missing-animation work, and training data.
- `Export`: package creation, credits, engine metadata, and readiness.
- `Settings`: local tool status, repair, and cache configuration.

Inside `Create`, use recipe-mode tabs:

- `LPC Character`: Universal LPC bodies, catalog parts, LPC-compatible custom parts, LPC animation/export rules.
- `Sprite Kitbash`: current non-LPC sprite-pack body/part workflow.
- `Duelyst Review`: staged Duelyst source review and APES preparation; this is not a general character composer.

Inside `Sources`, use family tabs:

- `LPC Catalog`
- `Sprite Pack`
- `Duelyst`
- `Custom/Imported`

The current left nav can become the tab rail, but the selected recipe mode must drive available source families, part options, motion sources, and export warnings. `All packs` can remain only in read-only audit/search contexts.

Required first version:

- layer/filter dropdown remains, but it filters by `type_name`, tags, and compatibility rules
- search box filters by name, type, variant, tags, author/license text
- grouped options show item name, variant, body support, animation state, and credit status
- selected items remain selected when switching animations if fallback is available
- required/excluded tag rules are shown and enforced gently
- missing animation state has a visible warning, not a disabled mystery
- non-LPC and Duelyst items do not appear in LPC catalog pickers unless they have been reviewed as custom LPC-compatible parts
- source-family tabs show empty states with a next action instead of leaking options from another family
- picker controls keep stable dimensions so warnings, badges, and long item names do not resize the preview

Concrete examples:

- Selecting `cape_solid` enables compatible `cape_trim`.
- Selecting `cape_trim` without a cape shows "requires cape" and does not render.
- Long hair renders foreground and background layers from one item selection.
- A longsword shows oversize/custom-animation status instead of pretending it is a regular 64x64 weapon.
- A Duelyst staged unit can be opened in Duelyst Review or queued for APES, but it is not an option in the LPC body or cloak picker.
- A sprite-pack character can be used in Sprite Kitbash, but its parts are not shown in LPC Character until extracted/reviewed as compatible custom parts.

## Metadata Disclosure And Polish

The main tabs should prioritize the task at hand. Operational data should be available, but not permanently visible.

Keep visible:

- selected recipe name and mode
- current animation, direction, and frame
- essential readiness badges: missing, unsupported, needs review, incompatible
- selected item names and counts
- primary actions for the active tab

Hide behind context menus, info buttons, or a details drawer:

- file paths
- source rects, frame geometry, z-position, and draw-record ids
- full credit/license blocks
- upstream commit and cache paths
- debug counts, category summaries, and warnings beyond the top status
- migration details and fallback provenance

Add a shared read-only `Details` drawer. Any context menu item named `View info` should open this drawer with the selected source, part, layer, recipe, or export record. The drawer should support copy buttons for ids/paths, but it must not be required for ordinary composition.

Warnings remain visible as compact badges. A hidden details surface should never be the only place where the user can learn that an export is blocked or a part is incompatible.

## Context Menus And Right-Click Actions

Add one shared context-menu system used by previews, source rows, part rows, recipe layers, and export records.

Behavior requirements:

- right click opens the menu at the pointer
- keyboard users can open the same menu with `Shift+F10`, the context-menu key, or a small visible menu button where needed
- `Escape` closes the menu
- clicking outside closes the menu
- menu stays within the viewport
- focus moves into the menu and returns to the invoking control on close
- destructive actions require confirmation or an undoable state
- unsupported actions are hidden or disabled with a tooltip explaining why

Initial preview actions:

- `View frame info`
- `Copy frame reference`
- `Toggle grid`
- `Toggle onion skin` when available
- `Reset zoom/pan` if zoom/pan is added
- `Open source in Workstation`
- `Prepare APES job` when the selected frame can be used as input

Initial part/source actions:

- `Select for active layer`
- `Replace current selection`
- `Clear from recipe`
- `View info`
- `Copy item id`
- `Copy source path`
- `Open in Workstation`
- `Mark reviewed` for custom/imported parts
- `Set compatible with current mode` for custom parts after review
- `Queue missing animation`
- `Hide incompatible in this picker`

Initial recipe-layer actions:

- `Solo layer`
- `Mute layer`
- `Lock layer`
- `Reset offset`
- `Duplicate selection to variant`
- `View draw order`
- `Remove layer selection`

Initial export/credits actions:

- `View credits`
- `Copy attribution`
- `Copy package path`
- `Open export profile`
- `Resolve readiness issue`

The first implementation should favor high-value actions over a long menu. If an action would duplicate a visible primary button, include it only when it is useful in-place.

## Tooltips

Every icon-only button, badge, compatibility indicator, readiness state, and disabled action needs a tooltip.

Tooltip rules:

- show on hover and keyboard focus
- attach with `aria-describedby`
- keep text short and actionable
- never require hover for critical warnings; critical warnings also appear as visible badges/status text
- explain disabled states directly, for example "Requires a cape base" or "Unsupported in 64x64 export"
- do not cover the sprite preview or active context menu
- respect reduced-motion settings

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

## Robustness Rules

The implementation should protect these invariants:

- A recipe has one active recipe mode. Parts from another mode must be blocked, migrated, or explicitly reviewed as compatible custom parts.
- Preview and export must use the same composition function and the same source-family rules.
- Unsupported animation, missing file, missing credit, missing body type, and family mismatch states must produce visible readiness records instead of silent drops.
- Context-menu actions must call the same underlying commands as visible buttons so right-click behavior cannot drift from normal behavior.
- Tooltips and hidden details are progressive disclosure only. They cannot be the only path to critical warnings or destructive actions.
- Any imported custom part must carry provenance: source family, source id/path if available, extraction method, reviewed state, and compatible recipe modes.
- Degraded mode must be explicit: if catalog metadata is unavailable, the app may use legacy sheet inventory, but should label the result as degraded and avoid pretending it has upstream layer/credit fidelity.

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

Phase 3: Source-family boundaries and tab shell

- Add `sourceFamilyRegistry` and recipe-mode inference.
- Split Create into LPC Character, Sprite Kitbash, and Duelyst Review modes.
- Split Sources into LPC Catalog, Sprite Pack, Duelyst, and Custom/Imported tabs.
- Remove `All packs` from composition pickers; keep it only for read-only audit/search.
- Add compatibility review state for legacy recipes that mix families.

Phase 4: Catalog-backed picker and disclosure UI

- Replace pseudo-character LPC part options with catalog item/variant options.
- Keep semantic layer filters as an affordance, not as the storage model.
- Add required-tag prompts and animation/fallback badges.
- Add shared context-menu and tooltip primitives.
- Move file paths, full metadata, and deep credit details into the Details drawer.
- Add first-pass right-click actions for preview frames, source rows, parts, recipe layers, and export records.

Phase 5: Recipe and credits migration

- Add `lpc_selections` to persisted recipes.
- Migrate saved recipes on load without losing legacy selections.
- Replace broad LPC credit warnings with selected-item credit readiness.
- Store selected recipe mode/family and custom-part compatibility modes.

Phase 6: Oversize and AI extension

- Add export profiles for oversize/custom animations.
- Add missing-animation queue.
- PixelLab/AI outputs become reviewed custom parts with provenance, never silent upstream replacements.

Phase 7: Mandatory future rigging and animation authoring

- Add a 2D skeleton model with bones, joints, pivots, constraints, and attachment points.
- Add a keyframe editor with onion-skin previews for creating new animation profiles.
- Bake rig output into reviewed custom spritesheet frames.
- Route baked frames through the same credits, provenance, readiness, preview, and export systems as catalog-backed assets.
- Keep game exports frame-based unless a later export profile explicitly supports runtime skeletons.
- Start only after the LPC engine, source-family boundaries, recipe migration, and export path are stable.

## Test Plan

Tool tests:

- parse contiguous `layer_N` objects and stop at the first missing layer
- preserve `zPos`, `custom_animation`, body path keys, variants, tags, required/excluded tags, recolors, aliases, preview hints, and credits
- generate stable catalog ids from fixture definitions
- infer `recipe_mode` and `source_family` for legacy recipes without mixing incompatible families
- reject or mark incompatible cross-family selections instead of rendering them as if they were LPC parts
- keep custom/imported parts hidden from a recipe mode until their compatible mode is reviewed
- resolve cape foreground/background draw records in z-order
- resolve xlong hair foreground/background draw records in z-order
- classify longsword oversize layers as unsupported for standard 64x64 export
- produce selected-item credits report entries
- serialize future rig definitions separately from baked spritesheet frames
- verify baked custom animation frames retain source-family provenance and review status

Browser tests:

- cape remains selectable on idle and renders with fallback
- cape trim requires cape
- xlong hair renders foreground over head and background behind body
- weapon oversize option shows warning instead of corrupting the frame
- preview and rendered export pixels match for the same catalog-backed recipe
- saved legacy recipe loads and migrates to `lpc_selections`
- LPC Character mode does not list Duelyst or non-LPC sprite-pack characters as bodies, parts, or motion sources
- Sprite Kitbash mode does not show LPC catalog items unless the user is intentionally browsing the LPC source tab
- Duelyst Review opens staged Duelyst entries and APES actions without making them LPC picker options
- source-family tabs keep empty states scoped to the selected family instead of falling back to another family
- context menus open by right click and keyboard, stay in the viewport, and return focus on close
- icon buttons, badges, and disabled actions expose tooltips on hover and focus
- metadata/details are hidden by default but available through `View info`
- after the rigging phase exists, a baked custom animation appears as a normal selectable/exportable animation profile with review warnings

Visual/manual QA:

- screen capture for cape/hair/weapon ordering
- screen capture for tab density at desktop and mobile widths
- verify long item names, warnings, and tooltip text do not overflow controls
- after the rigging phase exists, hand-check onion skin, pivots, baked frame alignment, and pixel cleanup
- export a package and inspect Godot/RPG Maker metadata for selected item provenance

## Acceptance Criteria

- `cape_solid`, `cape_trim`, `hair_xlong`, and `weapon_sword_longsword` parse into catalog items with the expected layers, variants, animations, and credits.
- A cape recipe renders without hard-coded `cloak_back` draw-order logic.
- A long-hair recipe renders both foreground and background hair layers correctly.
- An oversize weapon is visible as unsupported/degraded in standard 64x64 export rather than silently misdrawn.
- The same composition function feeds preview and rendered exports.
- Existing saved recipes still load, and migrated LPC selections are saved with stable item ids.
- LPC, sprite-pack, Duelyst, and custom/imported assets are displayed in separate task/family tabs.
- LPC composition pickers do not list Duelyst or non-LPC sprite-pack characters unless a part has been explicitly reviewed as compatible custom content.
- The main UI uses tabs for tasks and recipe modes instead of one crowded mixed screen.
- File paths, frame geometry, full credits, cache paths, and debug counts are hidden by default and available through `View info`.
- Right-click/context-menu actions exist for preview frames, source/part rows, recipe layers, and export/credit records.
- Every icon-only action, readiness badge, disabled menu item, and compatibility indicator has a hover/focus tooltip.
- Bone/rig-based animation authoring is present in the roadmap as a mandatory later phase, gated behind stable composition, family separation, recipe migration, and exports.
- Baked rig animations become reviewed custom animation frames with provenance and export readiness, not hidden procedural state.
- Exported credits list selected upstream item credits with authors, licenses, URLs, and upstream commit.
- The app runs in degraded mode if upstream metadata is missing, with clear warnings and no crash.

## Implementation Decisions

- Build an app-owned compact catalog JSON instead of importing upstream generated `dist` modules directly.
- Parse upstream JSON definitions directly because this local cache may not include upstream `sources/` and `scripts/`.
- Defer full upstream palette/recolor UI until catalog-backed composition and credits are stable.
- Treat oversize/custom animations as a separate export profile problem, not a quick crop hack.
- Keep the current pseudo-character LPC path only as a compatibility/degraded fallback.
- Treat LPC, sprite-pack, Duelyst, and custom/imported assets as separate source families, not as one filtered character list.
- Preserve a read-only all-source audit view, but keep composition pickers family-scoped.
- Build one shared context-menu, tooltip, and details-drawer system instead of one-off menus inside each panel.
- Hide deep metadata by default while keeping blocking readiness warnings visible.
- Make bone/rig animation authoring a required future phase, but do not begin it until catalog composition, family boundaries, migration, and exports are stable.
- Bake future rig output into spritesheet frames for export instead of requiring downstream games to run this app's rigging system.
