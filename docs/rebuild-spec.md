# Sprite Character Creator Rebuild Specification

This document is the ground-up rebuild brief for Sprite Character Creator. A new implementation should be considered complete only when it can satisfy the product behavior, data contracts, local tooling, export formats, release gates, and verification criteria described here.

## 1. Product Definition

Sprite Character Creator is a local-first production workflow app for building reusable 64x64 pixel-character recipes from sprite sheets, reviewed extracted parts, APES segmentation masks, LPC catalog sheets, and private Duelyst source assets.

The app is not only a visual editor. It is a workflow shell that must let a user:

- Load indexed source characters from public, private, Duelyst, and LPC manifests.
- Preview source animation frames by animation, direction, and frame index.
- Extract reusable character parts by preset rectangle, connected opaque pixels, manual mask cleanup, imported layer bundles, promoted LPC sheets, and validated APES reports.
- Review, filter, select, persist, delete, bulk-update, and export extracted parts.
- Compose a layered character recipe with source-character layers, reviewed part overrides, LPC catalog selections, palette rules, per-layer visibility, locking, and offsets.
- Detect export readiness, credits readiness, APES placeholder risk, AI generation review blockers, and LPC missing-animation gaps.
- Render composed frames and sprite sheets.
- Export package manifests, rendered PNG sets, zipped release packages, and engine metadata for generic, Godot 4, Unity 2D, RPG Maker MZ, Aseprite, and LPC oversize/custom-animation workflows.
- Run local private workflows through gated loopback-only Vite middleware without leaking private asset paths into public release builds.

## 2. Required Technology Shape

The current app is a React/Vite/TypeScript application. A rebuild may change libraries, but must preserve the following architectural properties:

- Static public release build works without local private assets or local-tool middleware.
- Local dev and local-tools preview builds can call private filesystem-backed actions through a Vite-compatible local server layer.
- Pixel rendering uses canvas with `imageSmoothingEnabled = false`.
- Large extracted part images and masks are stored outside localStorage, using IndexedDB or an equivalent browser-local blob store.
- Public release builds must strip private manifests and rewrite the bundled public character manifest from checked release exports.
- All mutable local tool actions require loopback host, same-origin metadata, and a generated local session token.

Baseline package commands to preserve:

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 8002 --strictPort
npm run build
npm run build:release
npm run build:local-tools
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
npm run release:check
npm run production:check
npm run security:scan
npm run license:audit
npm run rag:evaluate
npm run test:tools
npm run test:browser
npm run test:performance
npm run test:memory
npm run test:browser:all
npm run test:private-assets
npm run validate:release-package
```

Asset and APES commands to preserve:

```powershell
npm run index:assets
npm run repair:manifest-paths
npm run lpc:inventory
npm run lpc:catalog
npm run rag:index
npm run rag:evaluate
npm run export:character
npm run duelyst:private-manifest -- --stage-count 64
npm run qa:apes-harness
npm run apes:prepare-finetune
npm run apes:prepare-duelyst-jobs
npm run apes:run-duelyst-jobs
npm run apes:summarize-outputs
```

## 3. Core Screens

The rebuild must provide these screens and workflows.

### Fast Creator

Primary composition screen.

Required controls and behavior:

- Source pack filter: `All`, `Sprite`, `LPC`, `Duelyst`.
- Recipe mode: `sprite_kitbash`, `lpc_character`, `duelyst_review`.
- Source character select filtered by source pack and recipe mode.
- Optional compatible animation source character for borrowed motion.
- Animation, direction, frame index, and play/pause preview controls.
- Full recipe layer list in canonical layer order.
- For each layer: source character selection, approved part selection, visibility, locked state, x/y offset, and context details.
- Locked layers disable source, part, visibility, and offset edits.
- Reviewed part picker supports label, method, and text filtering, while preserving selected-outside-filter visibility.
- Recipe readiness panel reports selected, reviewed, unreviewed, missing, warnings, and state.
- Export target profile chooser persists across reload.
- Save recipe, load recipe, and start new recipe.
- LPC catalog-backed selections are supported and persisted in recipes.

### Art Workstation

Source-frame extraction and mask cleanup screen.

Required behavior:

- Shows current selected frame and onion/previous frame when relevant.
- Region selector uses canonical part labels.
- Region rectangle editor updates `x`, `y`, `w`, and `h`.
- Extraction modes:
  - `preset_region`: crop configured rectangle and generate 64x64 mask.
  - `connected_pixel`: flood-fill contiguous alpha from a user seed and crop to bounds.
  - `manual`: save current edited mask as reviewed manual part.
  - `apes`: must not create fake rectangular APES parts. APES parts only come from validated APES reports or explicit QA harness output.
- Keyboard access: canvas focus, arrow-key seed movement, Enter/Space paint or place.
- Manual mask editor supports save-as-part and save-over-selected-part flows.

### Part Library

Part review, import, and selection screen.

Required behavior:

- Filter by extraction method, review state, label, and search text.
- Paginate large libraries in 100-part pages.
- Bulk mark visible reviewed/unreviewed, scoped to rendered page.
- Export visible parts as JSON.
- Delete individual parts.
- Clear library with associated large asset cleanup.
- Import layer-bundle JSON.
- Show warnings and selected recipe usage.
- Live part picker mirrors the active layer/part selection workflow.
- Persist part metadata in localStorage and large image/mask data in IndexedDB.

### Batch Generator

Variant planning screen.

Required behavior:

- User sets seed and count.
- Deterministically generate variants from reviewed parts and palette presets.
- Save and apply variation presets.
- Persist variation presets across reload.

### Asset Audit

Source, Duelyst, and LPC inspection screen.

Required behavior:

- Show public/private manifest stats and class counts.
- Run or load private Duelyst audit.
- Inspect staged Duelyst candidates.
- Open staged Duelyst character in the workstation.
- Create APES jobs from selected Duelyst staged characters.
- Run LPC inventory and LPC catalog builders.
- Browse LPC sheets and source alpha/floor/pivot analysis.
- Promote selected or visible LPC sheets as parts with inferred or explicit labels, source tags, credit-file tags, reviewed-on-import option, and cropped source bounds.

### APES Lab

APES, AI handoff, RAG, training, and missing-animation screen.

Required behavior:

- Create APES jobs for selected source character, animations, directions, labels, and frame range.
- Run APES preflight through local tool middleware.
- Run a prepared APES job.
- Generate and import local APES QA harness report.
- Load APES QA harness report from disk.
- Import pasted APES report JSON only after schema validation.
- Summarize APES output inventory, including failed output folders with `status.json` and no report.
- Prepare APES fine-tune data.
- Prepare Duelyst APES job batch and merge prepared job configs into the visible queue.
- Show APES job status, logs, failures, inventory, and harness status.
- Build missing-animation queue from LPC catalog-backed recipes.
- Create generation jobs from missing-animation queue with RAG context when available.
- Download generation job handoff JSON.
- Generated outputs stay release-blocked until explicitly reviewed.
- Create training inbox drafts and approve them into training library records.

### Exports

Release packaging screen.

Required behavior:

- Export target profiles:
  - `generic`
  - `godot_4`
  - `unity_2d`
  - `rpg_maker_mz`
  - `aseprite`
  - `lpc_oversize`
- Block release exports when:
  - APES placeholder mode is enabled.
  - Any generation job required by the current recipe/profile is unreviewed.
  - Selected parts are missing or unreviewed.
  - LPC catalog credits are missing or need review.
- Exports:
  - Generic manifest JSON.
  - Godot 4 scene text.
  - Godot 4 SpriteFrames resource using rendered frames.
  - Unity 2D metadata JSON.
  - RPG Maker MZ metadata JSON.
  - Aseprite reference JSON.
  - Current source sprite sheet.
  - All-direction source sprite sheets.
  - Rendered frame-set JSON.
  - Rendered frame-set ZIP.
  - Full package manifest JSON.
  - Full package ZIP.
  - Credits report JSON.

### Settings

Local setup and private tool screen.

Required behavior:

- Show current manifest asset root.
- Accept custom asset root input.
- Copy setup/repair/reindex commands.
- Download local setup bundle.
- Run local asset repair and reindex through token-gated local middleware.
- Set and persist APES Python path.
- Toggle and persist APES placeholder mode with visible release warning.
- Show APES preflight summary and local-tool availability.
- Show enabled providers, volatile secret count, local proxy status, Aseprite bridge status, PixelLab status, local LLM status, APES bridge status, and the production check command.
- Accept provider configuration without persisting raw provider secrets.
- Clear session-only secrets and keep stored provider config redacted.

## 4. Domain Model

The following contracts are required. Names may change in a rewrite, but JSON shape compatibility should be preserved where user data or exported artifacts are involved.

### Directions And Animations

Supported directions:

```text
north, south, east, west, northeast, northwest, southeast, southwest
```

Canonical public sprite animations:

```text
idle, walk, running_jump, attack
```

LPC canonical animation aliases must map upstream names such as `magic`, `swing`, `walkcycle`, and `sit` into app-supported animation names where applicable. LPC base mannequins expose canonical app animations such as `idle`, `walk`, `spellcast`, `shoot`, `slash`, `thrust`, and `hurt`.

### Part Labels

Canonical render order:

```text
shadow
back_item
cloak_back
back_arm
back_leg
torso
front_leg
front_arm
neck
head
face
hair_hat_hood
weapon
shield
accessory
aura_effect
```

Additional selectable labels:

```text
front_hand
back_hand
legs
feet
```

Default 64x64 humanoid rectangles:

```json
{
  "shadow": { "x": 18, "y": 50, "w": 28, "h": 8 },
  "back_item": { "x": 12, "y": 10, "w": 40, "h": 42 },
  "cloak_back": { "x": 14, "y": 18, "w": 36, "h": 42 },
  "back_arm": { "x": 40, "y": 22, "w": 12, "h": 24 },
  "back_leg": { "x": 32, "y": 38, "w": 12, "h": 22 },
  "torso": { "x": 20, "y": 22, "w": 24, "h": 18 },
  "front_leg": { "x": 20, "y": 38, "w": 12, "h": 22 },
  "front_arm": { "x": 12, "y": 22, "w": 12, "h": 24 },
  "neck": { "x": 27, "y": 19, "w": 10, "h": 6 },
  "head": { "x": 20, "y": 4, "w": 24, "h": 18 },
  "face": { "x": 24, "y": 10, "w": 16, "h": 10 },
  "hair_hat_hood": { "x": 16, "y": 0, "w": 32, "h": 20 },
  "weapon": { "x": 0, "y": 12, "w": 18, "h": 48 },
  "shield": { "x": 44, "y": 20, "w": 18, "h": 30 },
  "accessory": { "x": 0, "y": 0, "w": 64, "h": 64 },
  "aura_effect": { "x": 0, "y": 0, "w": 64, "h": 64 },
  "front_hand": { "x": 13, "y": 36, "w": 10, "h": 10 },
  "back_hand": { "x": 41, "y": 36, "w": 10, "h": 10 },
  "legs": { "x": 20, "y": 38, "w": 24, "h": 22 },
  "feet": { "x": 18, "y": 48, "w": 28, "h": 10 }
}
```

### Asset Manifest

`public/data/manifests/characters.json` is the public fallback manifest. Local private scans may write `characters.local.json`, but public release builds must not ship it.

Required shape:

```ts
type AssetManifest = {
  generated_at: string
  asset_root: string
  total_characters: number
  canonical_directions: Direction[]
  canonical_animations: AnimationName[]
  characters: CharacterManifest[]
}
```

`CharacterManifest` must include `character_id`, `display_name`, `class_type`, optional `labels`, `source_folder`, `canvas_size`, `directions`, `animations`, `animation_names`, `source_quality_warnings`, `rotation_preview_paths`, `representative_frame`, and `extraction_status`.

Frame records must include `index`, `path`, `file_name`, `width`, `height`, and optional `source_rect` and `source_name`.

### Extracted Part

Required shape:

```ts
type ExtractedPart = {
  part_id: string
  character_id: string
  label: PartLabel
  source_animation: AnimationName
  source_direction: Direction
  source_frame_path?: string
  image_path: string
  mask_path?: string
  image_asset_key?: string
  mask_asset_key?: string
  image_data_url?: string
  mask_data_url?: string
  anchor: { x: number; y: number }
  bounds: Rect
  extraction_method: 'apes' | 'preset_region' | 'connected_pixel' | 'manual'
  compatibility: { animations: AnimationName[]; directions: Direction[] }
  reviewed: boolean
  source_family?: 'lpc' | 'sprite_pack' | 'duelyst' | 'custom'
  compatible_recipe_modes?: RecipeModeId[]
  tags: string[]
  warnings: string[]
}
```

Large `image_data_url` and `mask_data_url` values above 16 KB should be moved into IndexedDB and replaced with stable asset keys. Hydration must restore data URLs after reload. Deletion and clear operations should clean unused IndexedDB keys best-effort.

### Recipe

Required shape:

```ts
type KitbashRecipe = {
  character_id: string
  recipe_mode?: RecipeModeId
  source_family?: SourceFamilyId
  base_canvas: [number, number]
  base_character: string
  animation_source_character?: string
  lpc_selections?: Record<string, LpcRecipeSelection>
  layers: KitbashLayer[]
  palette: {
    hue_shift: number
    saturation: number
    brightness: number
    team_color: string
  }
  animation_coverage: AnimationName[]
  export_targets: string[]
}
```

Each layer must contain label, source character, optional source part ID, offset, visible, locked, and extraction method.

Default palette presets:

```text
charcoal, ash_black, dried_blood, indigo, sickly_gold, rusted_iron, moon_blue, plague_green, bone_white, ember_orange
```

Default palette rules:

```json
{ "hue_shift": 0, "saturation": 100, "brightness": 100 }
```

### APES Job And Report

APES jobs must contain job ID, character ID, animations, directions, frame range, output labels, status, input frames, logs, output root, and optional failure details.

APES report validation is mandatory before mutation. A valid report:

- Is an object.
- Has non-empty `job_id`.
- Has `masks` array.
- Each mask has supported part label, relative `path`, optional relative `image_path`, valid `bounds`, `confidence` from 0 to 1, boolean `reviewed`, and optional string warnings.
- Rejects Windows absolute paths, traversal paths, `/@fs/`, `/__local/`, and remote URLs inside report mask paths.
- Supplies default `{}` semantic mapping and `[]` warnings when absent.

Imported APES masks become extracted parts with:

- `extraction_method: "apes"`
- APES tags.
- confidence/review warnings.
- local output paths mapped to browser-safe local tool URLs when needed.

### LPC Catalog

The LPC catalog must preserve:

- Source repo/reference metadata.
- Item dictionary.
- Category tree.
- Aliases.
- Palette metadata.
- Per-item variants, animations, tags, required/excluded tags, required body types, preview metadata, recolors, layers, credits.

Catalog selections must persist in recipes:

```ts
type LpcRecipeSelection = {
  slot_id: string
  item_id: string
  variant: string
  type_name: string
  enabled: boolean
  palette_overrides?: Record<string, string>
}
```

LPC rendering must:

- Build draw records by animation, direction, frame, body type, variant, and export profile.
- Resolve exact, fallback, missing, and unsupported animation statuses.
- Surface oversize/custom-animation warnings under standard 64x64 export profiles.
- Preserve z-order from catalog layers.
- Include selected upstream credits in credits report and full package manifest.
- Preserve per-asset license provenance from inventory/catalog records:
  `license_file`, `license_scope`, `license_status`, `license_text_hash`, and
  `source_folder`.
- Treat missing shipped license coverage as a release blocker.

### AI, RAG, And Training

Provider and secret boundary:

- Provider connections may include capability metadata and route constraints.
- OpenAI-compatible, Anthropic, Gemini, Mistral, Groq, OpenRouter, PixelLab, and other remote providers require a trusted local proxy/backend for direct calls.
- Ollama and LM Studio may use loopback local endpoints, but public static builds must not depend on hidden browser secrets.
- Raw provider secrets live only in an in-memory vault for the current page session.
- Persisted provider config must set `secret_session_set: false`, `direct_browser_calls: false`, and `local_proxy_required: true`.
- Redaction helpers must remove key-shaped strings from notes, logs, handoffs, audit records, and generated manifests.

RAG index format:

```ts
type RagIndex = {
  format: 'pixel_creator_rag_index'
  version: 1
  generated_at: string
  document_count: number
  chunk_count: number
  chunks: RagChunk[]
}
```

Each chunk must include stable `chunk_id`, `content_hash`,
`token_estimate`, `trust_level`, `license_tags`, lexical terms, source ID, URI,
title, text, and metadata.

The rebuild must also provide `data/rag/eval_queries.json` and
`tools/evaluate-rag-index.js`. `npm run rag:evaluate` must fail when required
source citations or required terms are missing.

`npm run rag:index` must produce both:

- `data/rag/knowledge_index.json`: full local index for local-tools sessions.
- `public/data/rag/knowledge_index.json`: public-safe hosted index for the static app's `Activate RAG` flow.

AI Studio messages:

- Chat transcript supports user and assistant messages.
- Assistant messages can include RAG citations.
- Assistant messages can include pending tool proposals.
- Tool proposals must show input, permission scope, status, and result/failure.
- Tool proposals execute only after explicit user approval.
- AI Studio must be able to activate RAG from the UI. Hosted builds load the public index; local-tools builds may load or rebuild the full local index.

Generation jobs must:

- Be created from missing-animation queue items.
- Include prompt, provider config, RAG context if available, output placeholders, logs, provenance, and review gate.
- Default to manual handoff provider if no configured provider exists.
- Export as `pixel_creator_generation_jobs_handoff`.
- Block release until review gate is approved.
- Never auto-select generated outputs.

Tool registry:

- Tools have IDs, labels, permission scopes, and JSON-like input schemas.
- Required first-class tool proposals include APES job creation, PixelLab
  generation queueing, RAG activation, and export handoff.
- Rejected or failed tools must leave visible recovery text.
- Settings must expose default-and-check controls for Aseprite, PixelLab, and local LLM loopback connections so those tools can be made available to AI Studio on request.

Training inbox drafts and approved records must preserve source kind, source names, goal, animation, directions, frame layout, frame size, export profile, source-family compatibility, validation findings, review state, and provenance.

## 5. Persistence

Browser localStorage keys to preserve:

```text
pixel_creator_part_library
pixel_creator_saved_recipes
pixel_creator_asset_root_input
pixel_creator_apes_python_path
pixel_creator_apes_allow_placeholder
pixel_creator_apes_preflight
pixel_creator_apes_jobs
pixel_creator_ai_provider_config
pixel_creator_ai_provider_connections
pixel_creator_ai_tool_connections
pixel_creator_ai_session_secret_status
pixel_creator_generation_jobs
pixel_creator_apes_harness_generated_at
pixel_creator_variation_presets
pixel_creator_filename_template
pixel_creator_export_target_profile
pixel_creator_training_inbox
pixel_creator_training_library
```

Part asset IndexedDB:

```text
database: pixel_creator_part_assets
object store: assets
large asset threshold: 16384 characters
```

Storage failures must not crash the UI. Reads fall back to safe defaults. Writes return success/failure and surface warnings per storage key so one successful write does not hide another failed write.

`pixel_creator_ai_session_secret_status` may only store boolean armed-state
metadata. It must never store raw secrets. The raw secret vault is volatile
memory only and is cleared by page/session lifetime or explicit clear actions.

## 6. Rendering Rules

All app rendering and export rendering must use crisp 64x64 pixel output.

Frame rendering algorithm:

1. Create 64x64 canvas.
2. Disable image smoothing.
3. Resolve base character and optional animation source character.
4. If recipe has LPC catalog render selections, build an LPC render plan and draw each catalog record in z-order.
5. If rendering an LPC mannequin without catalog-only output, draw the base body and cut replacement regions for selected replacement parts.
6. Iterate recipe layers in canonical order.
7. Skip invisible layers.
8. Resolve source part, source character, source frame, LPC part frame, and fallback frame path.
9. Load source image and optional mask.
10. Draw cropped bounds with layer offset and palette rules.
11. Defer LPC back cloak layers until after front arm where required.
12. Return PNG data URL.

Palette rules must support at least hue shift, saturation, brightness, and team-color metadata. Rendering should never use interpolation.

## 7. Export Contracts

### Generic Export Manifest

Required shape:

```json
{
  "export_version": 1,
  "created_at": "...",
  "character_id": "...",
  "source_character": "...",
  "canvas_size": [64, 64],
  "animations": [],
  "recipe": {},
  "apes": {
    "first_class": true,
    "placeholder_mode_enabled": false,
    "jobs": []
  },
  "extraction_provenance": []
}
```

### Rendered Frame Set

Must export as:

```text
format: pixel_creator_rendered_frame_set
version: 1
```

It must include generated timestamp, character ID, source character, frame count, spritesheet count, individual frame records with PNG data URLs, spritesheet records with PNG data URLs, and GIF-preview metadata.

### Full Package Manifest

Must export as:

```text
format: pixel_creator_full_package
version: 1
```

It must include:

- Recipe.
- Rendered output summary.
- Reusable part folders.
- Extraction provenance.
- Credits report.
- Engine exports for Godot, Unity, RPG Maker, and Aseprite.
- Selected LPC catalog credits and readiness information when applicable.
- APES placeholder flag when enabled.

### Full Package ZIP

Required entries:

```text
package_manifest.json
credits_report.json
exports/godot/*.tscn
exports/godot/*_sprite_frames.tres
exports/unity/*.json
exports/rpg_maker/*.json
exports/aseprite/*.json
rendered/frames/**/*.png
rendered/sheets/**/*.png
parts/**/*
```

### Engine Metadata

Godot 4:

- Scene text contains `[gd_scene`.
- SpriteFrames resource contains `[gd_resource type="SpriteFrames"` and rendered-frame `ext_resource` entries.
- Should reference rendered frame paths, not raw source sheets.

Unity 2D:

- `format: unity_2d_sprite_metadata`
- pixels per unit 64.
- pivot 0.5/0.5.
- point filtering, no compression, multiple sprite mode.
- loop time false for attack, true otherwise.

RPG Maker MZ:

- `format: rpg_maker_mz_character_sheet`
- cell size 64x64.
- layout 12 columns, 8 rows, down/left/right/up directions, 3 frames per step.

Aseprite:

- `format: aseprite_reference_package`
- canvas 64x64.
- tags for animation/direction combinations.
- layer order with source/provenance metadata.

Credits:

- `format: pixel_creator_credits_report`
- Summary must count selected parts, selected LPC catalog items, LPC parts, APES parts, unreviewed parts, missing/review LPC credits, credit warnings, and release-blocking status.
- Include release notes, selected LPC catalog items, selected parts, unreviewed IDs, and credit warnings.

## 8. Local Tool Server

Local tool routes must exist only in dev and local-tools preview builds, not public release mode.

Allowed local routes:

```text
GET  /__local/health
POST /__local/apes-tools
POST /__local/asset-tools
GET  /__local/apes-output/*
GET  /assets/*
GET  /data/lpc/*
GET  /@fs/*
```

Security requirements:

- `/__local/*` and `/@fs/*` require loopback host: `127.0.0.1`, `localhost`, `::1`, or `[::1]`.
- Origin and referer, when present, must match request host.
- POST local mutations require `X-Pixel-Creator-Local-Token`.
- Token comes from `PIXEL_CREATOR_LOCAL_TOOLS_TOKEN` or a generated `.local-tools-token`.
- Public release builds define an empty token and do not install middleware.
- `/@fs/*` serving is restricted to app-root-approved private roots.
- APES report loading must only accept `apes_report.json` inside `data/apes/output`.

APES tool actions:

```text
preflight
run-job
generate-harness
summarize-outputs
load-report
prepare-finetune
prepare-duelyst-jobs
```

Asset tool actions:

```text
repair
reindex
duelyst-audit
lpc-inventory
lpc-catalog
```

Python path validation must accept only `python`, `py`, or an existing Python executable path.

## 9. Asset And Data Locations

Public release-safe inputs:

```text
public/data/manifests/characters.json
data/exports/*/individual_frames/**
public/data/qa/**
```

Private/local ignored inputs:

```text
assets/Animated-Pixel-Pack-Characters-V1/
assets/Duelyst-Unit-Animations.unitypackage
assets/lpc sprite generator stuff/
assets/checkpoints/
checkpoints/
training data/
data/cache/
data/apes/input/
data/apes/output/
data/training/
public/data/manifests/characters.local.json
public/data/manifests/duelyst.private.json
data/lpc/
```

Public release build must remove:

```text
characters.local.json
duelyst.private.json
private asset root names
Windows absolute paths
/@fs/ references
/__local/ references
```

## 10. Quality Gates

The release gate must include:

```powershell
npm run lint
npm run check:source-hygiene
npm run test:tools
npm run build:release
npm run validate:release-package
npm run test:preview-tools
npm run test:browser
```

Cross-browser optional gate:

```powershell
npm run test:browser:install-all
npm run test:browser:all
```

Private machine optional gate:

```powershell
npm run test:private-assets
```

Browser regression coverage must include:

- Startup without console errors.
- Manual cleanup save and reload persistence.
- Rendered frame-set export structure.
- Full package manifest and ZIP structure.
- Godot SpriteFrames resource references rendered frames.
- Credits report export.
- Recipe save/load.
- Part Library bulk review actions.
- Creator cockpit filtering, selected-outside-filter behavior, locked layer disabling, details drawer, and export target persistence.
- LPC picker canonical animations and compatible sheet parts.
- Catalog-backed LPC recipe persistence and rendered export.
- APES QA harness generation/import.
- APES output image/mask serving into full package ZIP.
- Duelyst audit behavior.
- Settings setup bundle export.
- Layer-bundle import.
- Variation presets.
- Editable export filename templates.
- Generation manifest download.
- Source alpha/floor/pivot analysis.
- Placeholder APES mode provenance and export blocking.
- LPC inventory browser/import workflow.
- Paged large Part Library behavior.
- APES fine-tune and Duelyst prep actions.
- Credits/provenance report exports.
- Missing-animation queue visibility.
- Oversize/custom-animation warnings.

Tool/unit tests must cover:

- Manifest indexing and repair.
- LPC inventory/catalog behavior.
- LPC composition and render planning.
- Layer-bundle validation.
- Generation jobs and handoff payloads.
- Missing-animation queue.
- RAG index and RAG evaluation.
- AI agent/tool proposal registry and secret-vault serialization.
- Local proxy, Aseprite bridge, PixelLab bridge, and redacted audit log helpers.
- Secret scanner and license audit scanner.
- Training library classification/approval.
- App persistence fallbacks.
- Export credits report.
- Release package validation.
- Source family registry.

## 11. Accessibility And UX Requirements

- Main screens are reachable by clear navigation buttons.
- Controls use semantic labels and test IDs for regression stability.
- Context menus are available by right-click, keyboard, and visible action button where used.
- Details dialogs are accessible and closable.
- Canvas tools must expose keyboard operation.
- Buttons should use exact labels that describe the action; release blockers must be visible before export.
- Text must not overlap or overflow at common desktop and mobile widths.
- UI should be dense and work-focused, not a landing page.

## 12. Rebuild Completion Checklist

A rebuild is complete when all items below are true:

- The app opens from the public manifest with no private assets.
- Private asset workflows work through local-tools preview only.
- All screens listed in this spec exist and preserve their required workflows.
- All JSON contracts are loadable from old saved data and exported in compatible shapes.
- Part images/masks survive reload without exhausting localStorage.
- APES report imports validate before mutating state.
- APES placeholder mode visibly blocks release exports.
- Generated AI outputs cannot ship until reviewed.
- LPC catalog selections render, persist, produce credits, and expose missing/oversize warnings.
- Shipped LPC assets and catalog entries have covered license metadata.
- Secret scan, license audit, and RAG evaluation pass.
- AI Studio chat shows provider/RAG/tool status and approval-gated tool proposals.
- Local proxy, Aseprite, and PixelLab bridge routes are loopback-only, token-gated, path/body validated, and audit logged.
- Full package ZIP contains rendered frames, sheets, engine metadata, reusable parts, package manifest, and credits report.
- Release validator rejects private/local references.
- `npm run production:check` passes.
- Browser regression passes in Chromium, with cross-browser suite available.
- Optional private-asset tests pass on a machine with private Duelyst/LPC/sprite assets.

## 13. Implementation Blueprint

This section is intentionally prescriptive. If the app must be rewritten from nothing, rebuild it in this order so each slice has a testable surface before the next slice depends on it.

### Phase 1: Data Contracts And Fixtures

Build pure TypeScript modules first:

- `types`: domain contracts from this document.
- `presets`: part labels, layer order, default rectangles, extraction modes, palette presets.
- `appPersistence`: storage keys, load/store helpers, saved recipe shape, draft ID helper.
- `inputUtils`: numeric clamping for offsets, unsigned values, signed values, and APES frame ranges.
- `utils`: frame lookup, download helpers, sprite-sheet drawing, connected-pixel extraction, recipe construction, APES job construction, and engine metadata builders.

Acceptance criteria:

- A checked-in `public/data/manifests/characters.json` fixture opens the app with at least one character.
- Pure tests can build a recipe from a character and selected parts.
- Pure tests can build an APES job and verify its input frame list is clipped to the requested frame range.
- Invalid localStorage JSON returns fallbacks instead of throwing.

### Phase 2: Static App Shell

Build the React shell:

- App-level screen nav.
- Manifest fetch and fallback behavior.
- Selected character, animation, direction, frame index, and play/pause state.
- Source pack filter and recipe mode switching.
- Pixel preview canvas.
- Global top controls shared by all screens.

Acceptance criteria:

- App starts with no console errors.
- The character select is populated from the manifest.
- Animation and direction options are derived from the active character and animation source.
- Frame range slider wraps by available frame count.
- Missing or failed image loads show visible status text rather than console-only errors.

### Phase 3: Part Extraction

Build `PixelCanvas`, `MaskEditor`, `maskTools`, and the Workstation screen.

Part extraction algorithms:

- `preset_region`: crop the selected 64x64 source frame to the active rectangle and make a 64x64 white mask for the same rectangle.
- `connected_pixel`: read the source frame into a 64x64 canvas, flood-fill four-neighbor pixels whose alpha is above threshold, compute bounds, export cropped part image, and export a 64x64 mask.
- `manual`: start from selected part mask or current region rectangle, let the user edit a `Uint8Array(4096)` mask, compute non-empty bounds, and save as a reviewed manual part.
- `apes`: reject direct fake creation from Workstation. Only APES Lab imports create APES parts.

Mask operations:

- Pencil writes a square brush of size 1-4.
- Eraser clears with the same brush.
- Fill flood-fills from the chosen pixel.
- Grow expands mask to adjacent pixels.
- Shrink removes edge pixels.
- Invert flips all 4096 mask pixels.
- Mirror flips horizontally.
- Nudge moves the mask by one pixel in the requested direction and drops pixels that leave the 64x64 canvas.
- Empty masks cannot be saved.

Acceptance criteria:

- Pointer and keyboard editing both work.
- Shift+arrow moves keyboard cursor four pixels; arrow moves one pixel.
- Enter/Space paints or places seed.
- Saved manual part is reviewed by default and persists after reload.
- Existing part mask can be edited into a reviewed manual variant without corrupting the source part.

### Phase 4: Part Library And Large Asset Storage

Build the Part Library as a separate subsystem, not as a passive list.

Required state transformations:

- `persistPartLibraryAssets(parts)` stores large image/mask data URLs in IndexedDB, sets stable asset keys, and strips inline data from localStorage payload.
- `hydratePartLibraryAssets(parts)` reads asset keys back into image/mask data URLs after startup.
- `deletePartLibraryAssets(keys)` deletes image and mask keys for removed parts.
- `compactPartLibraryAssets(activeParts)` removes orphaned IndexedDB records not referenced by active part metadata.

Import layer-bundle flow:

1. User pastes or loads JSON.
2. Parser verifies `format: "pixel_creator_layer_bundle"`.
3. Parser verifies numeric version.
4. Every part must have known label, safe ID, safe image path/source, optional safe mask path/source, optional bounds, optional anchor.
5. Reject duplicate part IDs in the bundle.
6. Reject `..`, Windows absolute paths, `/@fs/`, `/__local/`, and unknown local-tool paths.
7. Convert each bundle part into `ExtractedPart` with source `custom`, extraction method `manual`, and review state false unless explicitly known reviewed.
8. Persist metadata and assets atomically from the UI perspective.

Paging:

- Render at most 100 part cards per page.
- Bulk visible review acts only on current page.
- Visible export includes only current page.
- Search/filter state must not destroy selected recipe part state.

Acceptance criteria:

- Importing a huge layer bundle remains responsive.
- Deleting a part selected in a recipe removes that selection or marks it missing in readiness.
- Reload after imports hydrates visible images and masks.
- Corrupt IndexedDB or missing asset keys degrade gracefully with visible warnings.

### Phase 5: Recipe Composer

Build the recipe composer around stable part labels and immutable updates.

Selection precedence for a layer:

1. If `selectedPartIds[label]` resolves to a compatible reviewed part, use that part.
2. Else if `selectedParts[label]` resolves to a compatible source character, use that character.
3. Else use the base character as fallback.

Compatibility checks:

- Part label must match layer.
- Part source family must be compatible with current recipe mode.
- LPC custom parts must match the selected mannequin/body context.
- LPC part-source characters must support the current animation or an allowed fallback.
- For active filters, selected outside filter must stay visible in the picker so the user never loses track of current state.

Recipe save/load behavior:

- Save stores recipe ID, name, mode, source family, base character, optional animation source, selected source characters, selected part IDs, layer settings, LPC selections, palette, palette rules, and timestamp.
- Load restores all compatible values and falls back safely if a character or part is no longer present.
- New recipe resets to draft name, selected parts, source picks, layer settings, palette rules, and new draft ID.

Readiness algorithm:

- `selectedPartCount`: count selected part IDs.
- `reviewedSelectedPartCount`: selected parts found and reviewed.
- `unreviewedSelectedPartCount`: selected parts found and not reviewed.
- `missingPartCount`: selected IDs that no longer resolve.
- `warningCount`: sum warnings across selected parts.
- `missingReviewedLayerCount`: labels with no reviewed selected part.
- State is `incomplete` if missing parts exist or no layer has a reviewed selected part.
- State is `needs_review` if any selected part is unreviewed, warned, or some layer lacks a reviewed part.
- State is `ready` otherwise.

Acceptance criteria:

- Locked layer disables all layer controls except unlock.
- Offsets clamp to safe signed values.
- Palette fields clamp to valid ranges.
- Recipe readiness updates immediately after review toggles, deletion, or selection changes.
- Saved recipe reloads after browser reload.

### Phase 6: LPC Integration

Treat LPC as its own source family with two independent workflows:

- Inventory/sheet promotion: scan local LPC assets and promote sheets as manual parts.
- Catalog-backed composition: use catalog metadata for item/layer/variant rendering.

Inventory builder requirements:

- Scan local asset root for PNG sheets.
- Detect 64x64-compatible LPC grids and non-standard grids.
- Record dimensions, frame width/height, columns/rows, tags, category, and credit-file excerpts.
- Read upstream reference repo status when available: commit, sheet definition count, spritesheet count, credits CSV availability.
- Write `data/lpc/lpc_asset_inventory.json`.

Catalog builder requirements:

- Read upstream Universal LPC sheet definitions when available.
- Normalize aliases into app animation names.
- Preserve item path, type, tags, variants, layers, z positions, recolors, preview cells, required/excluded tags, body types, and credits.
- Write `data/lpc/lpc_catalog.json`.

Runtime LPC character manifests:

- Build body-base mannequin characters from inventory.
- Build part-source characters from compatible sheets.
- Each character exposes animation names and directions through normal `CharacterManifest` shape.
- Label metadata should include role, LPC path, body type, part label, source row/slice info, and source family.

Catalog picker algorithm:

1. Filter items by active slot.
2. Slot match rules:
   - exact `type_name === slotId`
   - `hair_hat_hood` matches hair, hat, or hood tags/types
   - `cloak_back` matches cape and cape trim
   - `back_item` matches back tags/types
   - otherwise item tags include slot ID
3. Filter by query across ID, name, type, path, tags, required/excluded tags, and credit text.
4. Build selected tag set from enabled selections.
5. Add warnings for unmet required tags.
6. Add warnings for excluded tags already selected.
7. Add body-type fallback warnings.
8. Add animation fallback warnings when exact animation is absent, except idle can use walk.
9. Add oversize warnings for custom animation geometry requiring oversize profile.
10. Sort ready before degraded before blocked, then by name and ID.

Credit readiness:

- Missing if no credits, no authors, or no licenses.
- Needs review if credit notes include review/verify/check.
- OK otherwise.
- Release-blocking if any selected catalog item is missing or needs review.

Missing-animation queue:

- Build draw records for selected catalog items across requested animations, directions, and frame range.
- Group records by item ID, layer ID, variant, status, requested animation, resolved animation, and body type.
- Only include records with status `missing` or `unsupported`.
- Sort unsupported before missing, then item ID, then layer ID.
- Summary counts issue count, missing count, unsupported count, and affected frame count.
- Filter out queue items already consumed by generation jobs for the same recipe, character, and export target.

Acceptance criteria:

- LPC source picker shows canonical animation names, not raw upstream aliases.
- Catalog selections persist in saved recipes.
- Catalog-backed preview and export use the same render plan.
- Standard 64x64 profile shows degraded oversize warnings.
- LPC oversize profile suppresses the standard oversize blocker where appropriate.
- Credits report includes selected upstream LPC catalog item attribution.

### Phase 7: APES Bridge

APES is a first-class local extraction workflow, not a fake segmentation mode.

APES preflight contract:

- Reports Python executable and version.
- Reports checkpoint, vendor root, and test folder paths.
- Reports data existence, character count, sample character, PNG count, and mask count.
- Reports required module booleans and module errors.
- Reports torch installed/version/CUDA status and errors.
- Reports conda/mamba/micromamba/nvidia-smi availability.
- Reports findings and boolean `ready`.

APES job lifecycle:

- `draft`: created but not yet prepared.
- `prepared`: input manifest is ready.
- `running`: bridge execution started.
- `failed`: bridge or content failure; show failure details.
- `complete`: report exists and can be imported.

Run-job behavior:

1. Write temporary job JSON under `data/apes/output/{job_id}.job.json`.
2. Execute bridge script with selected Python path.
3. Read `status.json`, `preflight.json`, and `apes_report.json` from output folder when present.
4. Merge status into visible job logs.
5. If report is valid and complete, allow import as APES parts.
6. If no report but status exists, keep failed output visible in inventory.

QA harness:

- `Generate local QA harness` creates fixture part/mask PNGs and report JSON under `public/data/qa`.
- Imported harness parts are tagged `qa_harness`.
- User can clear harness parts without clearing real APES parts.
- Re-import can replace existing harness parts.

APES report import:

- Validate JSON before mutating state.
- For each mask:
  - Use `image_path` if present, otherwise use mask path as source image fallback only when appropriate.
  - Convert disk paths under `data/apes/output` to `/__local/apes-output/...`.
  - Use mask bounds if present, otherwise default to configured label rectangle.
  - Reviewed state follows report mask reviewed flag.
  - Low confidence or warnings become part warnings.
  - Source character links to matching job character when possible.
- Update matching APES job status when report imports from a known job.

Acceptance criteria:

- Invalid report never changes jobs or part library.
- APES image/mask data can render from local output folders in local-tools preview.
- APES inventory shows failed outputs and does not crash on missing reports.
- Placeholder APES fallback is visibly marked and blocks release exports.

### Phase 8: AI Handoff, RAG, And Training

AI generation is optional and must stay review-gated.

RAG index builder:

- Gather project docs, README, release docs, APES notes, LPC summaries,
  license audit, PixelLab docs, manifests, APES inventory, training records,
  and generation jobs when present.
- Chunk into documents with source ID, source type, title, URI, text, stable
  chunk ID, content hash, token estimate, trust level, license tags, terms, and
  metadata.
- Write `data/rag/knowledge_index.json`.

RAG search:

- Tokenize query into search terms.
- Score chunks by matched terms and metadata filters.
- Return context bundle with purpose, query, context text, scored chunks, matched terms, and citations.
- Evaluate query quality with `tools/evaluate-rag-index.js`.
- Fail production readiness when expected source families or expected terms are
  missing from evaluation bundles.

AI Studio:

- Show chat transcript, request box, provider status, RAG status, tool status,
  citations, pending tool approvals, and failed-action recovery text.
- Produce local assistant replies that cite RAG context when available.
- Propose tool actions instead of silently mutating app state.
- Apply approved tool results back into the transcript.

Secret vault:

- Store raw secrets only in an in-memory `Map`.
- Snapshot only boolean provider armed state.
- Redact key-shaped strings before storage/export/logging.
- Serialize provider config with direct browser calls disabled and proxy
  required.

Generation job creation:

- Input is missing-animation queue.
- One job per queue item.
- Job ID format should be deterministic enough to inspect: `gen_{character}_{timestamp}_{index}_{slug}`.
- Prompt includes item name/ID, layer, variant, body, target animation, status, first affected frames, warnings, and pixel constraints.
- Provider defaults to manual/local handoff unless a session-only or local
  endpoint provider is armed.
- If provider is unconfigured, status is `handoff_ready`.
- Each job has one output placeholder with `release_blocked: true`, `auto_selected: false`, and `selected_part_id: null`.
- Review gate starts `blocked`, required, release-blocking, and not auto-selected.

Handoff export:

- Format is `pixel_creator_generation_jobs_handoff`.
- Export marks handoff status exported and adds exported timestamp to logs.
- Export does not approve or unblock outputs.

Training draft classification:

- User supplies source names, source kind, goal, animation, directions, frame layout, frame size, export profile, and requested source family.
- Classifier detects source-family compatibility and validation findings.
- Red findings block use for export/train.
- Approval writes immutable approved training library record with source draft ID, approved timestamp, reviewer, and provenance.

Acceptance criteria:

- Generation jobs for consumed missing-animation queue items disappear from the active queue.
- Release export remains blocked until generation job review gates are approved.
- RAG absence does not block job creation; it only reduces context.
- Training library records survive reload and can be included in RAG index.
- Typed sentinel secrets do not appear in localStorage, sessionStorage,
  downloads, visible DOM after clearing, dist, logs, or generated manifests.

### Phase 9: Export System

Build exports last, after recipe rendering and readiness are stable.

Filename templates:

- Default template must be stable and editable.
- Supported tokens should include character, animation, direction, frame, and label.
- Preview updates with current animation/direction/frame.
- Invalid or empty template falls back to default.

Release blocker aggregator:

- `placeholderBlocker`: true when APES placeholder mode enabled.
- `generationBlocker`: any relevant generation job has required review gate not approved.
- `lpcCreditBlocker`: selected LPC catalog credit readiness is release-blocking.
- `partReviewBlocker`: selected parts are missing or unreviewed.
- Release exports disabled if any blocker is true.
- Non-release reference exports may remain available where safe, but their status must make blockers obvious.

Rendered frame set builder:

1. Resolve animation source character from recipe.
2. Iterate every animation on animation source.
3. Iterate export directions that have frames.
4. Render every frame to PNG data URL.
5. Build per-frame records:
   - animation
   - direction
   - frame index
   - file name
   - data URL
6. Build sprite sheets per animation/direction:
   - columns equal frame count unless a target-specific layout requires otherwise.
   - rows computed from columns.
   - data URL is PNG.
7. Build GIF preview metadata. Actual GIF generation is not required by current app; metadata references sprite sheets.

Full package ZIP builder:

- Convert every data URL to binary.
- Write rendered individual frames under `rendered/frames/{animation}/{direction}/frame_XXX.png`.
- Write rendered sprite sheets under `rendered/sheets/{animation}_{direction}.png`.
- Write selected reusable part images/masks under `parts/{label}/{part_id}/`.
- Write engine exports under their folders.
- Write package manifest and credits report at root.
- Preserve stable entry ordering for test readability.

Godot resource builder:

- Scene text should reference AnimatedSprite2D or equivalent Godot 4 node setup.
- SpriteFrames resource should declare rendered frame textures as external resources.
- Animation names should combine animation and direction, such as `walk_south`.
- Loop attack false; other common locomotion/idle animations true.

Acceptance criteria:

- Exported JSON parses.
- ZIP entries exist exactly where browser tests expect.
- Rendered PNGs are not blank.
- Godot SpriteFrames resource references rendered frames, not local filesystem or source-only frames.
- Full package manifest and ZIP include identical credits report content.

## 14. App State Map

The original app keeps most state in the root app component and passes narrow props into screens. A rewrite may use reducers or state machines, but it must preserve these state categories and update semantics.

### Manifest And Navigation State

```ts
manifest: AssetManifest | null
manifestStatus: 'loading' | 'ready' | 'error'
manifestError: string
screen: 'fast' | 'workstation' | 'library' | 'batch' | 'audit' | 'apes' | 'exports' | 'settings'
selectedId: string
animationSourceId: string
animation: AnimationName
direction: Direction
frameIndex: number
playing: boolean
sourcePackFilter: 'all' | 'sprite' | 'duelyst' | 'lpc'
recipeMode: RecipeModeId
```

State rules:

- Manifest load first tries local/private manifest when available, then public fallback.
- Applying a manifest chooses preferred character ID when supplied, otherwise current ID if still valid, otherwise first character.
- Changing selected character resets invalid animation/direction/frame combinations.
- Animation source must come from compatible source options.
- Direction list is derived from selected animation source and ordered south, east, north, west, southeast, southwest, northeast, northwest.

### Workstation State

```ts
selectedRegion: PartLabel
regions: Record<PartLabel, Rect>
extractionMethod: ExtractionMethod
extractionHistory: string[]
connectedSeed?: { x: number; y: number }
```

State rules:

- Region edits clamp to 0-64 canvas bounds.
- Connected seed defaults to click/key position and clamps 0-63.
- Extraction history is append-only user feedback and may be capped for UI compactness.

### Recipe State

```ts
selectedParts: Record<PartLabel, string>
selectedPartIds: Partial<Record<PartLabel, string>>
layerSettings: Partial<Record<PartLabel, ComposerLayerSettings>>
recipeId: string
recipeName: string
savedRecipes: SavedComposerRecipe[]
palette: string
paletteRules: Omit<PaletteRules, 'team_color'>
lpcSelections: Record<string, LpcRecipeSelection>
```

State rules:

- `selectedParts` stores source character IDs.
- `selectedPartIds` stores extracted part IDs.
- A layer may have a source character and a part ID in memory, but recipe resolution prefers compatible part ID.
- Layer settings default to offset `[0, 0]`, visible true, locked false.
- Palette stores team color by name; palette rules store numeric transforms.

### Library And Persistence State

```ts
partLibrary: ExtractedPart[]
partLibraryStatus: string
persistenceWarnings: Record<string, string>
variationPresets: VariationPreset[]
activeVariationPresetId: string
filenameTemplate: string
exportTargetProfile: ExportTargetProfileId
```

State rules:

- Mutating part library must persist metadata and large assets.
- Any failed persistence should leave UI state updated but warn user.
- Deleting part cleans selected part IDs referencing it.
- Export target profile persists and is shared between Fast Creator and Exports.

### APES, AI, And Training State

```ts
apesJobs: ApesJob[]
aiProviderConfig: AiProviderConfig
generationJobs: GenerationJob[]
ragIndex: RagIndex | null
ragStatus: string
trainingInboxDrafts: TrainingInboxDraft[]
trainingLibraryRecords: TrainingLibraryRecord[]
apesAnimations: AnimationName[]
apesDirections: Direction[]
apesLabels: PartLabel[]
apesFrameRange: [number, number]
apesPythonPath: string
apesAllowPlaceholder: boolean
apesBridgeStatus: string
apesBridgeBusy: boolean
apesPreflight: ApesPreflightReport | null
apesOutputInventory: ApesOutputInventory | null
apesFinetuneManifest: ApesFinetuneManifest | null
duelystApesJobBatch: DuelystApesJobBatch | null
apesHarnessGeneratedAt: string
generationStyleNotes: string
```

State rules:

- Toggle arrays add/remove items and never allow impossible labels outside known part labels.
- Frame range order is normalized only when building jobs; UI may show either order.
- Bridge busy disables bridge actions.
- Preflight and APES jobs persist; inventories and manifests may be session-only unless explicitly saved.
- Generation style notes feed generation manifest and generation job prompt prefix.

### Asset Audit And Local Tool State

```ts
assetRootInput: string
settingsStatus: string
settingsBusy: boolean
duelystBusy: boolean
duelystAudit: DuelystPackageAudit | null
duelystStatus: string
lpcBusy: boolean
lpcInventory: LpcAssetInventory | null
lpcCatalog: LpcCatalog | null
lpcStatus: string
lpcImportStatus: string
localToolsAvailable: boolean
```

State rules:

- Local tools availability comes from `/__local/health`, not from dev-mode flags.
- Local tool errors should show stdout/stderr excerpts where useful.
- Duelyst audit loaded from private manifest should normalize missing arrays and summary.
- LPC inventory/catalog actions should load generated JSON from disk response when available.

## 15. Exact File And Module Responsibilities

The original file layout is a useful decomposition target. A rewrite does not need identical filenames, but should keep equivalent responsibilities.

### UI Components

- `App`: root state owner, manifest loader, screen router, command handlers.
- `PixelCanvas`: source frame preview with optional source rect, onion frame, highlighted region, seed crosshair, keyboard/pointer seed placement, visible load errors.
- `CompositeCanvas`: recipe preview using the same render rules as exports; visible render errors.
- `DirectionPreviewGrid`: compact multi-direction preview for current animation.
- `MaskEditor`: manual mask editing, load existing mask, draw source background, paint tools, mask transforms, save validation.
- `uiDisclosure`: reusable context menu area/button, details drawer, tooltip.

### Screens

- `FastCreatorPanel`: recipe controls, part picker, LPC catalog picker, readiness, palette, saved recipes, target profile.
- `WorkstationPanel`: source extraction, region editing, APES mode guard, mask editor.
- `PartLibraryPanel`: filters, paging, review/delete/export/import.
- `BatchGeneratorPanel`: deterministic variants and variation presets.
- `AssetAuditPanel`: manifest stats, Duelyst audit, LPC inventory/catalog, sheet promotion.
- `ApesLabPanel`: APES jobs, bridge actions, QA harness, inventory, missing-animation queue, generation jobs, training drafts.
- `ExportsPanel`: previews, release blockers, export action list, credits readiness, target profile.
- `SettingsPanel`: setup commands, local tools, APES Python and placeholder setting.

### Pure Domain Modules

- `animationSource`: compatible motion-source selection and recipe animation coverage.
- `aiContext`: prompt/query construction for RAG.
- `aiAgent`: provider routing, RAG citation packing, tool proposal creation, and approved tool result application.
- `aiOutputIntake`: generated output import and validation if implemented.
- `aiSecretVault`: volatile secret storage, redaction, and safe provider config serialization.
- `aiToolRegistry`: app tool definitions with permission scopes.
- `aiToolSchemas`: JSON-like schemas for AI tool inputs and outputs.
- `apesReportValidation`: strict APES JSON validation.
- `creatorCockpit`: export target profiles, recipe readiness, reviewed-part filtering.
- `creditsReport`: selected part and LPC catalog attribution report.
- `exportPackage`: rendered frame set, full package manifest, ZIPs, Godot resources.
- `filenameTemplates`: template rendering and default template.
- `generationJobs`: missing-animation queue to review-gated job records.
- `generationManifest`: manual AI generation manifest export.
- `inputUtils`: all numeric input clamps.
- `layerBundle`: layer-bundle parser and conversion to extracted parts.
- `lpcAssetResolver`: LPC frame geometry and export profile resolution.
- `lpcCatalogPicker`: picker options and selected credit readiness.
- `lpcCharacters`: inventory to runtime character manifests.
- `lpcComposition`: catalog selections to draw records.
- `lpcPartCompatibility`: source family, mode, and body compatibility.
- `lpcPartFrames`: pick correct frame from LPC sheet-part character.
- `lpcRenderPlan`: draw plan for catalog-backed rendering.
- `lpcReplacement`: base mannequin cutout regions for replaced layers.
- `lpcRecipeAdapter`: saved recipe/catalog selection bridge.
- `manualParts`: mask save request to reviewed manual extracted part.
- `maskTools`: mask array algorithms.
- `missingAnimationQueue`: catalog draw record gap aggregation.
- `partAssetStore`: IndexedDB image/mask storage.
- `performanceBudget`: shared load/search/render/export/cache budget constants.
- `ragIndex`: local search and context bundle builder.
- `sourceAnalysis`: alpha bounds, floor, pivot analysis for source images.
- `sourceFamilyRegistry`: mode/source-family compatibility matrix.
- `trainingLibrary`: draft classification, approval, export/train eligibility.
- `utils`: general rendering/export/download helpers.

### Node Tooling

- `tools/index-assets.js`: scan sprite asset root and build character manifests.
- `tools/repair-manifest-paths.js`: fix manifest paths for moved asset roots.
- `tools/build-lpc-local-inventory.js`: scan local LPC dump.
- `tools/build-lpc-catalog.js`: build catalog from upstream LPC definitions and preserve license coverage metadata.
- `tools/build-rag-index.js`: build knowledge index with stable chunk IDs, content hashes, trust levels, and license tags.
- `tools/evaluate-rag-index.js`: score RAG regression queries for citation and term coverage.
- `tools/export-character.js`: create checked release export inputs.
- `tools/build-duelyst-private-manifest.js`: inspect unitypackage and stage candidate frames.
- `tools/localToolsServer.ts`: Vite middleware for private local routes.
- `tools/localProxyProviders.ts`: validate and normalize trusted local proxy provider requests.
- `tools/asepriteBridge.ts`: validate Aseprite bridge commands and project-relative paths.
- `tools/pixellabBridge.ts`: validate PixelLab loopback requests and normalize generated output metadata.
- `tools/toolAuditLog.ts`: append redacted JSONL audit records for privileged tool calls.
- `tools/check-preview-local-tools.js`: smoke test built local-tools preview.
- `tools/check-source-hygiene.js`: fail if private/generated folders are tracked.
- `tools/scan-secrets.js`: scan source/docs/data/public/dist for provider-looking secrets.
- `tools/audit-licenses.js`: regenerate `docs/asset-license-audit.md` and fail on missing shipped license coverage.
- `tools/validate-release-package.js`: scan dist for private leaks, blocked files, missing assets, and missing LPC license coverage.
- `tools/run-memory-smoke.js`: execute the Playwright performance/memory smoke.
- `tools/run-browser-matrix.js`: cross-browser Playwright runner.
- `tools/run-private-asset-tests.js`: private asset test wrapper.

### APES Bridge Tooling

- `tools/apes_bridge/check_apes_env.py`: preflight.
- `tools/apes_bridge/run_apes_extract.py`: run one APES job.
- `tools/apes_bridge/summarize_apes_outputs.py`: inventory complete and failed outputs.
- `tools/apes_bridge/prepare_finetune_data.py`: create fine-tune manifest/datasets.
- `tools/apes_bridge/prepare_duelyst_apes_jobs.py`: create and optionally run Duelyst APES batch.
- `tools/apes_bridge/convert_apes_output.py`: normalize output if needed.
- `tools/apes_bridge/environment.gpu.yml`: GPU environment reference.
- `tools/apes_bridge/setup_home_pc.ps1`: local Windows setup helper.

## 16. Detailed Algorithms And Pseudocode

### Connected Pixel Extraction

```ts
function extractConnectedPixel(src, seed, alphaThreshold = 8) {
  image = loadImage(src)
  canvas = drawImageTo64(image)
  data = canvas.getImageData(0, 0, 64, 64)
  if alpha(seed) <= threshold:
    throw "selected pixel is transparent"

  visited = Uint8Array(4096)
  stack = [seed]
  pixels = []
  bounds = seed

  while stack not empty:
    point = stack.pop()
    if point outside 64x64: continue
    index = point.y * 64 + point.x
    if visited[index]: continue
    visited[index] = 1
    if alpha(point) <= threshold: continue
    pixels.push(point)
    expand bounds
    push four neighbors

  partCanvas = bounds.w x bounds.h
  maskCanvas = 64 x 64
  copy source RGBA for each pixel into local part coordinates
  write white opaque pixel in mask
  return bounds, pixel count, seed, image data URL, mask data URL
}
```

### Manual Mask Save

```ts
function saveEditedMask(sourcePartId, maskDataUrl, bounds) {
  if sourcePartId exists:
    source = find existing part
    newPart = {
      ...source,
      part_id: `${source.part_id}_manual`,
      extraction_method: 'manual',
      reviewed: true,
      mask_data_url: maskDataUrl,
      bounds,
      warnings: source.warnings without transient edit warnings
    }
  else:
    newPart = buildManualMaskPart({
      selected character,
      active label,
      current animation/direction/frame,
      current source frame path,
      mask data URL,
      bounds
    })
  append or replace same manual ID
  persist library assets and metadata
}
```

### Source Character Filtering

```ts
function getSourcePackFilter(character) {
  if class_type is lpc_character or id starts lpc-: return 'lpc'
  if id starts duelyst- or source folder includes local duelyst path: return 'duelyst'
  return 'sprite'
}

function canShowCharacter(character, sourcePackFilter, recipeMode) {
  if sourcePackFilter != 'all' and getSourcePackFilter(character) != sourcePackFilter:
    return false
  return sourceFamilyForRecipeMode(recipeMode) allows character source family
}
```

### APES Report Validation

```ts
function validateApesReport(value) {
  errors = []
  require object
  require non-empty job_id
  require masks array
  semantic_mapping optional object
  warnings optional string[]
  for each mask:
    require object
    require supported label
    require safe relative path or data URL
    optional image_path must be safe relative path or data URL
    optional bounds must be finite positive rect
    require confidence finite 0..1
    require reviewed boolean
    optional warnings string[]
  return ok ? normalized report : errors
}
```

### Render Layer With Mask

```ts
function drawLayer(context, image, maskImage, bounds, offset, recipe, sourceIsCroppedPart, sourceRect) {
  scratch = 64x64 transparent canvas
  if sourceIsCroppedPart:
    draw image at bounds.x + offset.x, bounds.y + offset.y with image natural size
  else if sourceRect:
    draw sourceRect from image into 64x64 frame
    crop bounds from normalized frame into destination bounds + offset
  else:
    draw bounds from image into destination bounds + offset

  if maskImage:
    maskScratch = 64x64
    draw mask image
    scratch.globalCompositeOperation = 'destination-in'
    draw maskScratch

  apply palette transforms if implemented
  context.drawImage(scratch)
}
```

### Full Release Block Check

```ts
function blockReleaseExport() {
  if apesAllowPlaceholder:
    return "Turn off placeholder APES fallback before release export."
  if current generation jobs contain release blockers:
    return "Review manual generation handoff jobs."
  if lpc credit readiness is release blocking:
    return "Resolve missing/review-needed LPC credits."
  if selected parts missing or unreviewed:
    return "Review selected parts."
  return ""
}
```

## 17. JSON Artifact Examples

These are compact examples. The real app should include all fields listed earlier.

### Minimal Character Manifest

```json
{
  "character_id": "1-warrior-woman",
  "display_name": "1 Warrior Woman",
  "class_type": "warrior_woman",
  "source_folder": "/assets/Animated-Pixel-Pack-Characters-V1/1-warrior-woman",
  "canvas_size": { "width": 64, "height": 64 },
  "directions": {
    "south": {
      "idle": {
        "frame_count": 4,
        "frames": [
          {
            "index": 0,
            "path": "/assets/Animated-Pixel-Pack-Characters-V1/1-warrior-woman/animations/idle/south/frame_000.png",
            "file_name": "frame_000.png",
            "width": 64,
            "height": 64
          }
        ]
      }
    }
  },
  "animations": [
    {
      "name": "idle",
      "source_names": ["idle"],
      "directions": {
        "south": [
          {
            "index": 0,
            "path": "/assets/Animated-Pixel-Pack-Characters-V1/1-warrior-woman/animations/idle/south/frame_000.png",
            "file_name": "frame_000.png",
            "width": 64,
            "height": 64
          }
        ]
      },
      "preview_gifs": []
    }
  ],
  "animation_names": ["idle"],
  "source_quality_warnings": [],
  "rotation_preview_paths": [{ "direction": "south", "path": "/assets/Animated-Pixel-Pack-Characters-V1/1-warrior-woman/animations/idle/south/frame_000.png" }],
  "representative_frame": "/assets/Animated-Pixel-Pack-Characters-V1/1-warrior-woman/animations/idle/south/frame_000.png",
  "extraction_status": {
    "frame_chopped": true,
    "preset_regions_available": true,
    "connected_pixel_pass_available": true,
    "apes_pass_available": false,
    "manual_cleanup_complete": false
  }
}
```

### Minimal APES Report

```json
{
  "job_id": "apes_1-warrior-woman_1779150000000",
  "status": "complete",
  "masks": [
    {
      "label": "head",
      "path": "apes_1-warrior-woman_1779150000000/masks/head_mask.png",
      "image_path": "apes_1-warrior-woman_1779150000000/parts/head.png",
      "bounds": { "x": 20, "y": 4, "w": 24, "h": 18 },
      "confidence": 0.94,
      "reviewed": false,
      "warnings": []
    }
  ],
  "semantic_mapping": { "head": "head" },
  "warnings": []
}
```

### Minimal Layer Bundle

```json
{
  "format": "pixel_creator_layer_bundle",
  "version": 1,
  "bundle_id": "custom-warrior-bits",
  "generated_at": "2026-05-18T00:00:00.000Z",
  "source": "manual import",
  "parts": [
    {
      "id": "custom_head_001",
      "label": "head",
      "source_character": "custom",
      "animation": "idle",
      "direction": "south",
      "tags": ["custom", "cleanup"],
      "warnings": [],
      "image": {
        "data_url": "data:image/png;base64,...",
        "bounds": { "x": 20, "y": 4, "w": 24, "h": 18 },
        "anchor": { "x": 20, "y": 4 }
      },
      "mask": {
        "data_url": "data:image/png;base64,..."
      }
    }
  ]
}
```

### Minimal Generation Handoff

```json
{
  "format": "pixel_creator_generation_jobs_handoff",
  "version": 1,
  "exported_at": "2026-05-18T00:00:00.000Z",
  "job_count": 1,
  "jobs": [
    {
      "job_id": "gen_lpc-character_20260518000000_01_steel_sword_slash",
      "status": "exported",
      "target_animation": "slash",
      "prompt": "Generate pixel-art animation layer frames\nItem: Steel Sword...",
      "outputs": [
        {
          "output_id": "gen_lpc-character_20260518000000_01_steel_sword_slash_output_1",
          "uri": null,
          "reviewed": false,
          "auto_selected": false,
          "selected_part_id": null,
          "release_blocked": true
        }
      ],
      "review_gate": {
        "required": true,
        "status": "blocked",
        "release_blocked": true,
        "outputs_auto_selected": false
      }
    }
  ]
}
```

## 18. Error Handling Requirements

The rebuild should treat errors as workflow state, not as crashes.

Manifest errors:

- Public manifest missing: show load error and disable workflow controls.
- Private manifest missing: silently fall back to public manifest.
- Malformed manifest: show parse error and fall back when possible.

Image errors:

- Canvas previews show `Could not load frame: {src}`.
- Composite previews show `Could not render composite preview: {message}`.
- Export rendering should reject with actionable status and not produce partial ZIP downloads.

Storage errors:

- localStorage read parse errors use fallback.
- localStorage write quota errors show a persistent warning.
- IndexedDB failures keep inline data when possible.
- IndexedDB cleanup failures do not block UI.

Local tool errors:

- Health failure disables local buttons and tells user to use local dev/preview server.
- 403 token/origin failures mention local token or loopback requirement.
- Child process non-zero exit shows status, stdout, stderr, and action name.
- APES failures are written into job logs and inventory rather than being hidden.

Import errors:

- APES report validation errors list all field errors.
- Layer bundle errors identify part index and field.
- LPC promotion errors distinguish missing source files from unsupported geometry.

Export errors:

- Release blockers should appear before the user clicks export.
- Unexpected render/build errors should update export status with the failed artifact name.
- No export should include private paths if release validation would reject them.

## 19. Security And Privacy Requirements

The rebuild must assume private art assets are sensitive.

Never ship these in public release:

- `characters.local.json`
- `duelyst.private.json`
- raw Duelyst extraction cache
- raw LPC local dump
- APES output folders
- Windows absolute paths
- `/@fs/` paths
- `/__local/` paths
- `.local-tools-token`
- raw provider API keys
- redacted audit source material that still contains key-shaped strings
- blocked executables or scripts such as `.exe`, `.ps1`, `.bat`, or `.cmd`

Local server hardening:

- Middleware should early-return for all routes outside its known prefixes.
- Loopback checks happen before filesystem path resolution.
- Path resolution must use `path.resolve` and parent containment checks.
- Never pass user strings through a shell command. Use `spawnSync` or equivalent with argv arrays.
- Python path must be validated before execution.
- Report loading must restrict basename to `apes_report.json`.
- `/@fs/` must be limited to project-approved directories only.
- AI proxy and bridge endpoints must require the same loopback, same-origin,
  token, and body-size controls as APES/local asset mutations.
- Aseprite bridge requests must validate executable path and project-relative
  input/output paths.
- PixelLab bridge requests must validate loopback endpoint settings.
- Privileged tool calls must write redacted audit records.

Release validation:

- Scan `.html`, `.js`, `.css`, `.json`, `.svg`, `.txt`, and `.map`.
- Reject private manifest names, private asset root names, Windows drive paths, `/@fs/`, `/__local/`.
- Verify every manifest asset referenced in release output exists in `dist`.
- Reject blocked executable/script/private files in `dist`.
- Reject shipped LPC catalog entries without `license_status: "covered"`.
- Run `npm run security:scan`, `npm run license:audit`, and
  `npm run rag:evaluate` before calling a release production ready.

## 20. Test Plan By Slice

### Pure Unit Tests

Write tests for:

- `buildRecipeReadiness` all three states.
- `filterReviewedPartsForLayer` query/method/selected-outside-filter behavior.
- `validateApesReport` success, unsupported label, traversal path, Windows absolute path, bad confidence, missing reviewed flag.
- `buildGenerationJobsFromMissingAnimationQueue` prompt, IDs, blocked review gate, provider statuses.
- `buildGenerationJobsHandoffPayload` exported timestamps and log updates.
- `buildMissingAnimationQueue` grouping and summaries.
- `buildLpcCatalogPickerOptions` required tags, excluded tags, body fallback, animation fallback, oversize warning, sorting.
- `buildLpcSelectionCreditReadiness` OK/missing/needs-review.
- `buildCreditsReport` release-blocking summary.
- `filenameTemplates` token substitution and fallback.
- `partAssetStore` can be integration-tested with fake IndexedDB or browser test.

### Node Tool Tests

Write tests for:

- Asset indexer does not overwrite public manifest unless explicitly requested.
- Repair script rewrites stale asset roots correctly.
- LPC inventory fixture detects grid and non-grid sheets.
- LPC catalog fixture preserves credits and aliases.
- RAG index builder emits documents/chunks with source metadata.
- RAG evaluator fails when expected citations or expected terms are missing.
- Release validator rejects private/local references.
- Source hygiene rejects tracked generated/private paths.
- Secret scanner flags provider-looking keys and ignores redacted placeholders.
- License audit reports covered and missing counts.
- Local proxy rejects non-loopback local provider routes.
- Aseprite and PixelLab bridge validators reject traversal/remote endpoints.
- Tool audit logging redacts secret-looking values.

### Browser Tests

Use production preview for browser regression where possible:

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4173 --strictPort
npx playwright test
```

Required UI tests:

- First load: no console errors, character select available.
- Workstation: pause, preset extraction, manual cleanup save, reload, part still visible.
- Mask editor: pencil, eraser, grow, shrink, invert, mirror, nudge, empty save guard.
- Library: method filter, search, mark visible reviewed/unreviewed, delete.
- Fast Creator: reviewed part filter, locked layer disabled state, details drawer, save/load/new recipe, target profile persistence.
- LPC: source pack filter, mannequin selection, canonical animation list, compatible sheet parts, catalog item warning display.
- APES: QA harness generate/import/clear, invalid JSON rejection, local server unavailable state.
- APES inventory: failed outputs displayed from fixture.
- AI: missing-animation queue, generation job creation, handoff download, release blocker visible.
- AI Studio: chat replies, provider/RAG/tool status, citations when available,
  approval-gated tool proposals, and no persisted raw secrets.
- Settings: volatile secret count, local proxy status, production check command,
  and bridge health controls.
- Asset Audit: license readiness and missing-license status.
- Exports: all JSON downloads parse, ZIP entries present, SpriteFrames contains rendered frame references, blocked export disabled when placeholder/generation/LPC credit blockers active.
- Settings: local setup bundle download, APES Python path persistence, placeholder toggle persistence.
- Performance: large catalog browsing keeps image cache at or below the shared
  image-cache budget.

### Private Asset Tests

Run only on a machine with private assets:

- Duelyst package audit finds candidates.
- Duelyst private manifest stages frames.
- Staged character opens in Workstation.
- Prepared Duelyst APES jobs merge into visible queue.
- LPC inventory scans real local dump.
- LPC catalog picks real upstream credits.
- Full private flow still passes source hygiene because generated private outputs are ignored.

## 21. Rebuild Risks And Non-Negotiables

These are the places a rewrite is most likely to accidentally lose important behavior.

- Do not simplify APES into rectangular masks. That breaks the product promise and release semantics.
- Do not keep large imported data URLs only in localStorage. Real imports can exceed browser quota.
- Do not let generated AI outputs auto-select or unblock release.
- Do not render preview and export with different compositing logic. The user must see what they export.
- Do not ship local tool routes in release mode.
- Do not allow `/@fs/` or `/__local/` references into public artifacts.
- Do not treat LPC credits as informational only; missing/review-needed credits block release.
- Do not flatten LPC catalog z-order into normal part label order when catalog render records exist.
- Do not drop selected-outside-filter picker behavior; otherwise users will think selections vanished.
- Do not make failed APES outputs disappear; failed content results are part of the workflow.
- Do not use browser dev mode checks to detect local tools; probe `/__local/health`.
- Do not make release package validation, secret scanning, license auditing, RAG
  evaluation, or browser regression optional for production readiness.

## 22. Definition Of "100% Rewritten"

A rewrite is not feature-complete because it can display sprites and export PNGs. It is feature-complete only if it can reproduce these end-to-end stories:

1. Public user opens the static build, chooses a bundled character, extracts a preset part, manually edits the mask, reviews it, composes a recipe, exports a full package ZIP, and the ZIP contains rendered frames, sheets, metadata, manifest, parts, and credits.
2. Private user runs local-tools preview, reindexes an external sprite asset root, reloads the manifest, and sees local characters without public release leakage.
3. Private user audits Duelyst assets, stages a character, opens it in Workstation, prepares APES jobs, runs/summarizes outputs, and imports only valid APES reports.
4. LPC user builds inventory/catalog, selects a mannequin, chooses catalog items, sees credit readiness and oversize warnings, persists recipe, renders previews, exports full package, and receives a release block if credits need review.
5. AI handoff user builds a catalog-backed recipe with missing animation layers, creates RAG-enriched generation jobs, downloads handoff JSON, and remains blocked from release until reviewed outputs are approved.
6. AI Studio user asks for a plan, receives cited context and pending tool
   approvals, approves only the intended actions, and sees results/failures in
   the transcript.
7. Security reviewer types a sentinel provider key, clears it, and confirms it
   does not appear in browser storage, downloads, generated manifests, dist,
   logs, or git.
8. Release engineer runs `npm run production:check` and gets a public `dist`
   with no private manifests, no local-tool URLs, no absolute private paths, no
   raw provider keys, no blocked files, no missing manifest assets, and no
   shipped LPC catalog entries without covered license metadata.
