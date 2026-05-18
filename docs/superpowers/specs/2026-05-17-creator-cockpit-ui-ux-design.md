# Creator Cockpit UI/UX Upgrade Design

## Status Update

Implemented. Fast Creator now includes reviewed-part search/method filters,
recipe readiness, export target profile persistence, next-action navigation, and
LPC-aware source/part picker behavior. Browser regression coverage verifies the
creator cockpit workflow, export target persistence, and the current LPC picker
compatibility path.

## Context

The Animated Pixel Character Creator already has a deep local workflow: Fast Creator, Art Workstation, Part Library, Batch Generator, Asset Audit, APES Lab, Exports, and Settings. Recent work has made the APES, LPC, Duelyst, export, and browser-regression paths reliable, but the daily creation loop still asks the user to synthesize state from several screens.

The approved direction is a focused hybrid UI/UX pass. It should make character creation faster first, while surfacing enough QA and export readiness that the user can see whether a recipe is safe to package.

## Goals

- Make Fast Creator easier to use when the Part Library contains many reviewed parts.
- Surface recipe readiness in the main workflow without forcing the user to visit Part Library or Exports for every check.
- Let the user choose an export target context so labels, readiness copy, and next actions match the intended handoff.
- Add contextual next actions that help the user move between creation, review, batch generation, and export.
- Preserve the current screen architecture, persistence model, and release gates.

## Non-Goals

- No full navigation rewrite.
- No new global state library.
- No change to APES bridge execution, LPC inventory generation, Duelyst staging, or export package formats in this pass.
- No replacement of the existing Part Library review system with a new queue yet.

## Recommended Approach

Add a creator cockpit layer using existing data already held by `App.tsx`, `FastCreatorPanel`, `PartLibraryPanel`, `BatchGeneratorPanel`, and `ExportsPanel`.

The cockpit is not a new top-level screen. It is a set of focused improvements:

1. Reviewed-part discovery inside Fast Creator.
2. Recipe readiness summaries near the active creator controls.
3. Export target profile selection.
4. Contextual next-action buttons that navigate to existing screens or trigger existing actions.

This keeps the change bounded while making the app feel more guided.

## Feature Design

### Reviewed-Part Search In Fast Creator

Fast Creator should gain a compact part search/filter control that applies to the approved-part selectors.

The filter should support:

- Text search over part id, character id, extraction method, tags, and warnings.
- Optional method filter for APES, manual, preset, connected-pixel, and imported layer-bundle/LPC parts when those methods exist.
- Per-layer option counts so the user can see why a layer has few or no approved parts.

The existing source-character fallback remains available. Filtering should never hide the currently selected approved part; if the selected part does not match the active filter, keep it visible and mark it as selected outside the current filter.

### Recipe Readiness Strip

Add a small readiness strip to the Fast Creator area, derived from existing recipe and part-library state.

It should show:

- Selected approved parts count.
- Missing reviewed parts count across `layerOrder`.
- Unreviewed selected parts count, if any selected part is not reviewed.
- Warning count from selected parts.
- Export readiness state: ready, needs review, or incomplete.

This is an advisory UI, not a blocking gate. Existing exports should continue to work unless later release policy adds explicit blocking behavior.

### Export Target Profile Cue

Add a lightweight export target profile state with options:

- Generic package
- Godot 4
- Unity 2D
- RPG Maker MZ
- Aseprite

The selected target should update copy and readiness hints in Fast Creator and Exports. It should not remove any export buttons. It should help the user understand which export action is the likely next step.

Persist the selected export target in local storage with the app's existing persistence helper style.

### Contextual Next Actions

Add a compact next-actions block near the creator workflow.

Candidate actions:

- Review selected parts: opens Part Library. The first pass does not need to preconfigure Part Library filters.
- Generate variants: opens Batch Generator.
- Prepare APES job: reuses the existing top-bar action.
- Open export target: opens Exports and emphasizes the currently selected target.
- Open Settings repair: opens Settings when manifest or local tool state suggests setup friction.

The first implementation keeps these as navigation/action buttons without adding cross-screen filter synchronization. Any action that cannot yet apply destination context should use clear status text rather than pretending to do so.

## UI/UX Requirements

- Keep the restrained production-tool visual style already present in `App.css`.
- Avoid a landing-page or marketing-style redesign.
- Keep the persistent left navigation and preview panel.
- Make added controls dense but readable, with stable dimensions to avoid layout shift.
- Use existing button, select, input, panel, status, and validation-card patterns where possible.
- Maintain keyboard and screen-reader access for new controls through labels, roles, and existing focus styling.
- Ensure mobile layout stacks cleanly under the current `980px` and `560px` breakpoints.

## Data Flow

- `App.tsx` continues to own top-level state.
- Add an `exportTargetProfile` state value loaded from local storage.
- Compute selected recipe parts from `selectedPartIds` and `partLibrary`.
- Compute readiness as derived data, not persisted data.
- Pass readiness and export target props into `FastCreatorPanel` and `ExportsPanel`.
- Keep part search/filter state local to `FastCreatorPanel` unless another screen needs it later.

## Components And Boundaries

### `App.tsx`

- Own export target profile state and persistence.
- Derive selected-part readiness data.
- Provide screen navigation handlers to next-action UI.

### `FastCreatorPanel`

- Render reviewed-part search/filter controls.
- Apply filters to approved-part selects.
- Render readiness strip and next actions.
- Keep layer controls compatible with existing recipe save/load behavior.

### `ExportsPanel`

- Render selected export target profile and target-specific hint text.
- Keep all current export actions visible.
- Highlight the recommended export action for the current target.

### CSS

- Add scoped cockpit/readiness styles to `App.css`.
- Reuse existing colors and spacing tokens.
- Avoid nested cards and excessive decorative treatment.

## Error Handling

- If local storage access fails, fall back to the generic export target and keep the app usable.
- If a selected part is missing from the Part Library, show incomplete readiness rather than throwing.
- If filters produce zero options for a layer, preserve the source-character fallback and show a clear zero-count state.

## Testing

Add focused browser regression coverage for:

- Fast Creator part filtering keeps the current selected part usable.
- Readiness strip updates after saving or selecting reviewed parts.
- Export target selection persists after reload.
- Exports screen reflects the selected target while keeping all export buttons accessible.

Run at least:

```bash
npm run lint
npm run build
npm run test:browser
```

For handoff or release confidence, run `npm run release:check`.

## Open Decisions

- Whether next actions should immediately set filters on destination screens is deferred. The first pass can navigate and show status text only.
- Whether export readiness should become a hard blocker is deferred. This design keeps it advisory.
- Whether to add a full review queue is deferred to a later QA-focused upgrade.
