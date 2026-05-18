# Release Readiness

Date: 2026-05-18

## Status

The app/tooling release is conditionally GO for the public static package after
the May 18, 2026 hardening pass. Private/local tool flows are now a separate
local-tools build path and are not part of the distributable static bundle.

Source metadata is optional private debugging data. It is kept in exports where
useful, but it is not a release gate, browser-test requirement, or blocker for
using generated packages.

## Verified Commands

Latest verification after the release hardening pass:

- `npm run lint`: passed
- `npm run check:source-hygiene`: passed
- `npm run test:tools`: passed, 49 tests
- `npm run build`: passed
- `npm run build:release`: passed
- `npm run validate:release-package`: passed
- `npm run test:preview-tools`: passed
- `npm run test:browser`: passed, 18 Chromium tests
- `npm run test:browser:all`: passed, 54 tests across Chromium, Firefox, and WebKit
- `npm run test:private-assets`: optional/private-machine only
- `npm run release:check`: passed

Latest LPC hybrid follow-up verification after the catalog renderer, credits,
context-menu, missing-animation queue, and oversize-warning slices:

- `npm run build`: passed
- `npm run test:tools`: passed, 37 tests
- `npx playwright test tests/browser/regression.spec.ts`: passed, 18 Chromium tests

```powershell
npm run lint
npm run check:source-hygiene
npm run test:tools
npm run build
npm run validate:release-package
npm run test:preview-tools
npm run test:browser -- --reporter=line
npm run test:private-assets
npm run release:check
npm run index:assets
npm run lpc:inventory
npm run export:character -- 1-warrior-woman
npm run qa:apes-harness
micromamba run -n apes-gpu-modern python tools\apes_bridge\check_apes_env.py --json
npm run duelyst:private-manifest -- --stage-count 64
npm run apes:prepare-finetune
npm run apes:prepare-duelyst-jobs
npm run apes:run-duelyst-jobs
npm run apes:summarize-outputs
```

The full browser regression currently covers manual cleanup persistence, export
downloads, creator cockpit filtering/export-target persistence, recipe save/load,
Part Library bulk review actions, fake APES-part prevention in the workstation,
APES QA harness generation/import, local
`data/apes/output` APES image/mask serving into full-package zip exports,
Duelyst audit behavior, and Settings setup bundle export.
It also covers the GitHub sprite-parts harvest workflow surfaces: layer-bundle
JSON import, saved variation presets, export filename templates, generation
manifest download, and source alpha/floor/pivot analysis.
The harness now also covers placeholder-mode export provenance, accessible
release controls, a usable LPC inventory browser/import workflow, and paged
rendering for large layer-bundle imports in the Part Library, including
page-scoped visible export and bulk review behavior. It also verifies APES
fine-tune/Duelyst prep actions, credits/provenance report exports, LPC source
picker canonical animations, LPC body-base mannequin coverage, compatible
LPC sheet-part selection, catalog-backed LPC recipe persistence, rendered-frame
export, selected upstream credit readiness in Exports, right-click `View info`
details on LPC source cards, missing-animation queue visibility in APES Lab, and
oversize/custom-animation warnings in the LPC catalog picker. Private Duelyst package harvesting is available through
`npm run test:private-assets` and is intentionally opt-in outside the standard
release gate.
Browser regression is served from `npm run build && npx vite preview` so the
suite exercises the production bundle rather than the Vite dev transform path.

## Implemented Release Fixes

- Generated/runtime lint folders are ignored by ESLint.
- `npm run release:check` now runs the release gate in one command: lint,
  source-hygiene checks, tool tests, production build, release-package
  validation, preview local-tool smoke, and browser regression.
- `npm run build:release` creates the public static package without installing
  local tool middleware. `npm run build:local-tools` creates the private preview
  bundle used only for local APES/LPC/Duelyst/repair workflows.
- Local tool POST endpoints require a loopback host, same-origin request
  metadata where present, and the generated `.local-tools-token` session token.
  The token is injected only into dev/local-tools builds and is ignored by the
  public release build.
- GitHub Actions runs the same release gate on pushes and pull requests to
  `main`.
- `npm run test:browser:all` is available for optional local Chromium, Firefox,
  and WebKit smoke coverage after running `npm run test:browser:install-all`.
- `npm run check:source-hygiene` fails if private/local/generated inputs such
  as `duelyst.private.json`, `characters.local.json`, raw Duelyst/LPC dumps,
  APES outputs, caches, training data, `dist`, or Playwright artifacts are
  tracked by git.
- Production builds rewrite the release manifest from bundled public assets and
  remove private/local manifests from `dist`.
- `npm run validate:release-package` rejects private manifests, local `/@fs/`
  and `/__local/` references anywhere in emitted text assets, Windows absolute
  paths, private manifest names, private asset-root names, and missing manifest
  assets.
- `npm run index:assets` preserves the checked-in fallback
  `public/data/manifests/characters.json` when scanning ignored in-repo assets
  or external asset roots. Local scans write `characters.local.json` unless
  `--public-manifest` is passed.
- Tool tests cover local-manifest preservation and LPC inventory fixture
  behavior, plus release-package validation.
- Workstation APES mode now refuses to create rectangular placeholder APES
  parts; APES parts must come from APES Lab reports or the explicit bridge
  harness.
- Imported APES report assets under `data/apes/output` are served through a
  local dev route, rendered with masks, and included as image/mask files in
  full-package zip exports.
- The standalone `Download SpriteFrames resource` action now uses the same
  rendered-frame-backed Godot resource builder as full-package exports.
- Export System now emits a `pixel_creator_credits_report` JSON download and
  full-package zips include `credits_report.json` with selected part review,
  LPC credit/license warning, and APES QA provenance signals.
- Canvas preview and manual mask editor image failures now surface visible UI
  status instead of console-only errors.
- Canvas seed placement and manual mask cleanup are keyboard reachable through
  focusable canvases, arrow-key movement, and Enter/Space paint/place actions.
- Browser-storage read failures fall back to safe defaults, and write failures
  are tracked per storage key so a later successful write does not hide an
  unrelated failed write.
- APES report imports are schema-validated before they mutate APES jobs or the
  Part Library.
- APES batch execution records per-job success/failure counts and failure
  kinds. The default batch command completes with recorded content failures;
  `-- --fail-on-job-error` restores strict non-zero behavior.
- APES output inventory includes failed output folders that have `status.json`
  but no `apes_report.json`.
- APES Lab surfaces failed outputs in the inventory UI.
- Export UI no longer treats APES source metadata as required; APES parts are
  optional.
- Documentation now describes source metadata as private local metadata, not a
  release blocker.
- GitHub sprite-parts harvest planning is now represented by app behavior:
  layer-bundle JSON files import into the Part Library, raw LPC sheets can be
  browsed, filtered, selected, labeled, and promoted from the LPC inventory as
  selectable manual parts, source alpha bounds/floor/pivot analysis is visible
  in Asset Audit, variation presets are saved and applied by Batch Generator,
  export filename templates are editable, and APES Lab downloads generation
  manifests.
- Local APES, Duelyst, LPC, repair, and reindex actions are no longer tied to
  `import.meta.env.DEV`; the app probes `/__local/health` and enables actions
  whenever the Vite local tool server is present, including `npm run preview`
  after a production build. APES Lab also exposes the local fine-tune manifest
  prep and Duelyst job-batch prep scripts through this path, then loads prepared
  Duelyst job configs into the visible APES queue.
- `npm run release:check` now includes a production-preview local-tool smoke
  that verifies `/__local/health`, `/__local/asset-tools`, and
  `/__local/apes-tools` are reachable from a built app served with Vite preview.
- Vite preview now serves app-root-only `/@fs/...` files so local preview can
  display staged Duelyst/cache images returned by local asset tools without
  exposing paths outside this project.
- Local tool middleware is isolated in `tools/localToolsServer.ts`, so `dev` and
  `preview` share the same implementation for `/__local/*` routes and the
  restricted project-local `/@fs/...` preview route.
- Layer-bundle import validation rejects unknown part labels, duplicate part
  IDs, unsafe local-tool paths, traversal paths, Windows absolute paths, and
  invalid extraction bounds before data reaches the Part Library.
- LPC sheet promotion now preserves source/credit-file tags, supports selected
  or visible imports, inferred or explicit labels, reviewed-on-import, and
  exports cropped source bounds instead of squeezing a whole spritesheet into
  one part image.
- LPC inventory data now also builds runtime `lpc_character` manifests. The
  builder groups source/action sheet variants, maps LPC aliases such as
  `magic`, `swing`, `walkcycle`, and `sit` onto canonical app animation names,
  exposes body base sheets as mannequin sources, preserves classic LPC row
  slices, and filters compatible sheet parts by active layer/source context.
- Large imported part images and masks are persisted in IndexedDB by asset key
  so localStorage stores lightweight part metadata and reloads hydrate the real
  assets back into the app.
- Deleted and cleared Part Library records now trigger best-effort IndexedDB
  asset deletion/compaction so orphaned large image records do not accumulate.
- Part Library results are paged in 100-part batches so large imports stay
  usable without rendering every imported part card at once. Visible bulk review
  and visible JSON export are scoped to the currently rendered page.
- Placeholder APES mode is visibly warned in Settings and recorded in generic
  and full-package manifests as `apes.placeholder_mode_enabled`.
- Catalog-backed LPC selections are persisted in recipes and now feed shared
  preview/export rendering, selected upstream credit reports, Exports readiness
  counts, and APES Lab missing-animation queue downloads.
- LPC source cards expose shared context-menu actions by right-click, keyboard,
  and the visible action button; `View info` opens the Details drawer.
- LPC catalog picker options now surface oversize/custom-animation items as
  degraded in the standard 64x64 export profile instead of pretending they are
  normal weapon layers.

## APES Batch Result

The latest full Duelyst APES batch attempted 60 jobs:

- 57 successful job results
- 3 sprite-specific APES segmentation rejects

Failed outputs:

- `apes_duelyst_neutral_mercsongweaver_010`
- `apes_duelyst_neutral_mercarcanelimiter_038`
- `apes_duelyst_neutral_mercsightlessfarseer_048`

Failure kind:

```text
apes_segmentation_empty_sample
```

These are content-level upstream APES rejects, not app infrastructure failures.
They are excluded from promotable/generated APES masks by virtue of having no
report, and they remain visible in the inventory for inspection.

## Remaining Risks

- APES upstream originally targeted Python 3.7. The verified local runtime is
  Python 3.10.20 and works, but the preflight still reports this compatibility
  warning.
- APES mask quality is sprite-specific. Low-confidence masks and missing-label
  reports should be inspected before using them in character assembly.
- The private Duelyst package and LPC asset dumps remain local ignored inputs
  and should not be staged into git.
- Full release checks include browser export/package workflows and can take a
  few minutes on slower machines because they generate downloadable PNG/zip
  artifacts.

## Go / No-Go

GO for app/tooling release.

GO for APES workflow with failed outputs surfaced and excluded from generated
mask use.
