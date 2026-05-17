# Release Readiness

Date: 2026-05-17

## Status

The app/tooling release is GO for private use as of the latest full release
check.

Source metadata is optional private debugging data. It is kept in exports where
useful, but it is not a release gate, browser-test requirement, or blocker for
using generated packages.

## Verified Commands

Latest verification after the release hardening pass:

- `npm run lint`: passed
- `npm run check:source-hygiene`: passed
- `npm run test:tools`: passed, 12 tests
- `npm run build`: passed
- `npm run validate:release-package`: passed
- `npm run test:preview-tools`: passed
- `npm run test:browser`: passed, 12 tests
- `npm run release:check`: passed

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
downloads, recipe save/load, Part Library bulk review actions, fake APES-part
prevention in the workstation, APES QA harness generation/import, local
`data/apes/output` APES image/mask serving into full-package zip exports,
Duelyst audit behavior, and Settings setup bundle export.
It also covers the GitHub sprite-parts harvest workflow surfaces: layer-bundle
JSON import, saved variation presets, export filename templates, generation
manifest download, and source alpha/floor/pivot analysis.
The harness now also covers placeholder-mode export provenance, accessible
release controls, a usable LPC inventory browser/import workflow, and paged
rendering for large layer-bundle imports in the Part Library, including
page-scoped visible export and bulk review behavior. Private Duelyst package harvesting is available through
`npm run test:private-assets` and is intentionally opt-in outside the standard
release gate.
Browser regression is served from `npm run build && npx vite preview` so the
suite exercises the production bundle rather than the Vite dev transform path.

## Implemented Release Fixes

- Generated/runtime lint folders are ignored by ESLint.
- `npm run release:check` now runs the release gate in one command: lint,
  source-hygiene checks, tool tests, production build, release-package
  validation, preview local-tool smoke, and browser regression.
- `npm run check:source-hygiene` fails if private/local/generated inputs such
  as `duelyst.private.json`, `characters.local.json`, raw Duelyst/LPC dumps,
  APES outputs, caches, training data, `dist`, or Playwright artifacts are
  tracked by git.
- Production builds rewrite the release manifest from bundled public assets and
  remove private/local manifests from `dist`.
- `npm run validate:release-package` rejects private manifests, local `/@fs/`
  and `/__local/` asset paths, Windows absolute manifest paths, and missing
  manifest assets.
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
- Canvas preview and manual mask editor image failures now surface visible UI
  status instead of console-only errors.
- Browser-storage read failures fall back to safe defaults, and write failures
  surface a visible persistence warning so users can export library/job data
  before reload.
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
- Large imported part images and masks are persisted in IndexedDB by asset key
  so localStorage stores lightweight part metadata and reloads hydrate the real
  assets back into the app.
- Part Library results are paged in 100-part batches so large imports stay
  usable without rendering every imported part card at once. Visible bulk review
  and visible JSON export are scoped to the currently rendered page.
- Placeholder APES mode is visibly warned in Settings and recorded in generic
  and full-package manifests as `apes.placeholder_mode_enabled`.

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
