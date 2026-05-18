# Universal LPC Hybrid Engine Design

Date: 2026-05-18

## Decision

Use the Universal LPC Spritesheet Character Generator as the authoritative LPC data and composition engine inside this app, while keeping this app as the character workflow, export, APES, PixelLab, and AI-generation shell.

This is a hybrid migration, not a full replacement. The upstream generator solves LPC-specific problems that this app has been approximating: item definitions, multi-layer parts, z-position ordering, animation support, palettes, and attribution. This app should own the surrounding production workflow: recipe management, reviewed/generated parts, motion-source borrowing, exports, credits packaging, and AI-assisted missing-animation work.

## Goals

- Replace filename/tag inference for LPC layer semantics with upstream sheet definitions and generated metadata.
- Render LPC parts using upstream layer/z-position metadata, including multi-layer items like capes, hair, weapons, tails, and accessories.
- Preserve existing app workflows: Fast Creator, preview part picker, exports, part library, APES Lab, PixelLab integration notes, and saved recipes.
- Keep generated and imported non-LPC parts working through the current `ExtractedPart` path.
- Improve credits by linking selected LPC items to upstream credit metadata instead of broad inventory warnings.
- Make missing-animation handling explicit: use known fallback rules first, and reserve AI generation for cases where upstream data truly lacks artwork.

## Non-Goals

- Do not embed the full upstream Mithril UI as the primary app.
- Do not replace APES or custom part review.
- Do not immediately support every upstream UI control, palette workflow, or URL-hash option.
- Do not hand-copy upstream generated `dist` modules into this repository as source of truth.
- Do not use AI to invent LPC-compatible animations before the deterministic upstream metadata pipeline is integrated.

## Architecture

Add a local LPC engine boundary with three main modules:

- `lpcCatalog`: loads and normalizes upstream LPC metadata from the local cached repository or generated inventory.
- `lpcComposition`: turns a selected body plus selected LPC items into ordered drawable layer records.
- `lpcRecipeAdapter`: maps between this app's recipes and upstream LPC item selections.

The current `CharacterManifest`, `KitbashRecipe`, and `ExtractedPart` types remain the app-facing interface. LPC recipes gain a structured selection list that can reference upstream item ids, variants, layer records, credits, palette choices, and supported animations. The current `selectedParts[label] = character_id` model can remain as a compatibility shim during migration, but new LPC selections should store stable upstream item references.

## Data Flow

1. `tools/build-lpc-local-inventory.js` continues to index local LPC assets, but it should also discover upstream `sheet_definitions`, `palette_definitions`, and credit records from `data/cache/universal-lpc-generator`.
2. The app loads a richer LPC catalog payload that includes item metadata, layer metadata, animation support, credits, and sprite paths.
3. The picker shows LPC items from catalog categories instead of pseudo-character manifests built only from PNG paths.
4. A recipe stores selected LPC items and variants.
5. The renderer asks `lpcComposition` for draw records sorted by upstream z-position.
6. `CompositeCanvas` and `exportPackage` draw those records using the same composition output, so preview and exported sprites cannot diverge.
7. Credits export reads selected item credits from the same catalog records.

## Rendering Rules

The renderer should stop treating LPC as one app layer per semantic label. Upstream items can produce multiple drawable layers. Each draw record should include:

- item id and variant
- source PNG path
- source frame rectangle
- animation and direction support
- z-position
- optional palette/recolor metadata
- credit ids

The final draw list should be sorted by upstream z-position, then by a stable tie-breaker. This removes the need for special cases like "draw cloak after front arm" and should correctly handle parts with foreground/background sheets.

If the selected animation is missing for a chosen LPC item, the composition layer should expose a fallback status:

- `exact`: item has the selected animation
- `fallback`: item uses a deterministic fallback animation, such as walk for idle
- `missing`: item has no usable frame and should be visible in the UI as incomplete

## UI Behavior

Keep the current Fast Creator layout. Change the LPC picker contents:

- Show upstream LPC categories/items with search and animation support indicators.
- Keep layer quick filters, but treat them as filters over catalog categories rather than the only source of truth.
- Allow selecting an item even when the current animation needs fallback, but label it clearly.
- Surface credit/license warnings near selected LPC items and in export readiness.
- Add a compact "LPC engine" status in Asset Audit showing catalog source, upstream commit, item count, layer count, and credit count.

## Exports

Rendered frame exports, spritesheets, Godot, RPG Maker, Unity, and Aseprite references should use the same `lpcComposition` draw records as the preview. The export manifest should include:

- upstream LPC repo URL and commit
- selected LPC item ids and variants
- per-item credits/license metadata
- fallback animation decisions per item, when any are used
- custom generated parts and APES provenance as separate sections

## Error Handling

- If upstream metadata is missing, fall back to the current inventory-only path with a visible warning.
- If a selected item points to a missing PNG, keep the recipe loadable and mark that item as missing.
- If two selected items conflict by category or z-position, render deterministically and show a non-blocking readiness warning.
- If credit metadata is absent for a selected upstream item, mark the export as needing review.

## Migration Plan

Phase 1: Catalog bridge

- Extend the LPC inventory builder to read upstream sheet definitions, layer definitions, animation lists, palette metadata, and credits.
- Add tests proving cape, hair, and weapon definitions expose multiple draw layers where applicable.

Phase 2: Composition engine

- Add `lpcComposition` and route preview/export LPC drawing through ordered draw records.
- Keep current pseudo-character part selection as compatibility input.
- Add regression tests for capes, hair, weapons, missing animations, and exported spritesheet parity.

Phase 3: Picker upgrade

- Replace pseudo-character dropdown options with catalog-backed item options.
- Add animation support and fallback indicators.
- Keep the current semantic layer dropdown as a filter.

Phase 4: Recipe and credits upgrade

- Store stable upstream item references in recipes.
- Add compatibility migration for existing saved recipes.
- Replace broad LPC credit warnings with selected-item credit output.

Phase 5: AI extension point

- Add a clear "missing animation" queue that can send selected item frames to PixelLab or another generation provider.
- Generated outputs return as reviewed custom parts, not as silent replacements for upstream art.

## Testing

- Tool tests for catalog parsing from representative upstream definitions.
- Tool tests for composition ordering, including a multi-layer cape or hair definition.
- Browser tests for picker selectability across idle/walk/slash and for fallback labels.
- Pixel-sampling regression tests for cape/hair/weapon layering.
- Export tests that compare preview and rendered frame pixels for the same recipe.
- Credits tests confirming selected upstream credits appear in exported manifests.

## Acceptance Criteria

- The maroon cape, long hair, and at least one weapon render correctly without renderer-specific special cases.
- LPC items remain selectable when the current animation requires an allowed fallback.
- Preview and rendered exports share one composition path.
- Existing saved recipes load without data loss.
- Exported credits list selected LPC item credits, not just generic warnings.
- The app can still run when upstream metadata is unavailable, with clear degraded-mode messaging.

## Implementation Decisions

- Generate this app's own compact catalog JSON from upstream source files first. This gives the app a stable local API and avoids coupling the runtime directly to upstream generated `dist` modules.
- Defer full upstream palette recoloring until composition ordering and credits are stable. Phase 1 should preserve current palette controls and carry upstream recolor metadata through the catalog without building the final recolor UI.
- The first picker upgrade should expose a searchable, grouped list of catalog items filtered by the current semantic layer. A full upstream category tree can come later after recipes store stable upstream item ids.
