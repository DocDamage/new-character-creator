# AI And RAG System

The app uses AI as an explicit, review-gated workflow. Users can compose, edit, review, and export without running AI, but AI Studio and APES Lab can prepare generation jobs for missing animation layers, cite local RAG context, and propose approval-gated tool actions.

## Build The Knowledge Index

Run:

```bash
npm run rag:index
```

This writes the full local index to `data/rag/knowledge_index.json` from project docs, release notes, APES notes, LPC catalog summaries, manifests, and local APES inventory when present. It also writes a public-safe hosted index to `public/data/rag/knowledge_index.json` so AI Studio can activate RAG in the static app without requiring the local tools server.

GitHub Pages serves that public-safe index at `/data/rag/knowledge_index.json` under the configured Vite base path. The app autoloads it on startup and the `Activate RAG` button reloads it on demand when local tools are unavailable. GitHub Pages cannot scan your PC, fetch web pages, or rebuild the index at runtime; those source-ingestion steps must happen locally or in CI before the static site is deployed.

Run this before publishing when you specifically want to validate the hosted index:

```bash
npm run rag:hosted-check
```

The production gate runs `npm run rag:evaluate` first, which regenerates the local and hosted indexes, then runs `npm run rag:hosted-check` to fail the build if the public index is missing, empty, malformed, or stale.

## Use RAG Context

1. Run `npm run rag:index` or `npm run rag:evaluate` before publishing a hosted build. In a local-tools session, AI Studio can also rebuild the full local index from the app.
2. Open AI Studio or APES Lab.
3. Click `Activate RAG` and confirm AI Knowledge reports a loaded or active index.
4. Build or select an LPC catalog-backed recipe with missing or unsupported animation records.
5. Ask AI Studio for a plan or click Create generation jobs from queue in APES Lab.
6. Review citations and any proposed tool actions.
7. Approve only the tool actions you want to execute.
8. Download the handoff JSON or individual job JSON.
9. Send the prompt, references, and cited context to PixelLab or another provider through a trusted local proxy/MCP/backend workflow.
10. Import generated output for review.
11. Approve reviewed output before release export.

## Safety Rules

- AI runs are user-started.
- Generated output is not selected automatically.
- Generated output cannot overwrite upstream assets.
- Release export remains blocked until review is approved.
- Provider tokens stay outside the repo, browser storage, generated manifests, and release bundles.
- Provider API keys are session-only when typed into the app, redacted from handoffs, and direct provider calls go through a trusted local proxy.
- Tool calls are proposed first and execute only after user approval.
- Local proxy, Aseprite, and PixelLab bridge actions write redacted audit records.
- Public static builds cannot depend on hidden browser secrets, but they can load the shipped public RAG index.

## AI Tool Tiers

AI Studio separates tools by where they are safe to run:

- Static-safe tools work on GitHub Pages because they only inspect loaded app data: RAG search with citations, current recipe inspection, and LPC compatibility checks.
- Local-only tools require the loopback local tool server and approval: RAG rebuilds, PC asset scans, web source fetches, LPC render matrix audits, APES jobs, Aseprite bridge actions, and PixelLab bridge actions.
- Download and generation-queue tools remain explicit handoffs: the assistant can propose an export or PixelLab generation job, but the user approves before anything leaves the app workflow.

The assistant prompt includes the registry of available approval-gated tools, and deterministic fallback planning proposes matching tool cards even when no provider is configured.

## Live Activity Context

Every AI Studio request now includes a structured live activity snapshot. The snapshot is deliberately compact, but it gives the assistant enough app state to answer questions about the current work without guessing:

- active screen and source pack
- selected character and borrowed animation source
- current animation, direction, frame index, and play state
- current source rectangle, canvas size, and frame geometry evidence for alignment triage
- selected preview layer, selected part/source part, and available part option count
- active recipe mode, source family, layer count, selected layers, animation coverage, and export targets
- recipe readiness counts and release blockers
- missing-animation queue summary and generation-job counts
- RAG health, hosted/local source mode, local tool capabilities, and LPC publication status
- Aseprite, PixelLab, and local LLM connection status
- visible app statuses, warnings, recent high-level activity, and recent completed/rejected tool history

Provider calls receive the full JSON snapshot through the local proxy prompt. The deterministic fallback assistant receives the same snapshot summary and warning list. Provider-suggested tools are schema-validated against the app registry and merged into the same approval cards as deterministic tools. This lets questions like "what am I doing?", "why is export blocked?", "which layer am I editing?", and "what should I fix next?" answer from current app state instead of only from the typed message.

The snapshot is prompt-safe:

- local filesystem paths are replaced with `local-path`
- secret-shaped tokens are replaced with `redacted-secret`
- status, warning, and recent-action lists are capped before they enter AI prompts
- the `Inspect live context` tool is static-safe and can run on GitHub Pages because it only summarizes already-loaded app state
- local-only tool failures return recovery guidance instead of silent dead ends

## Expanded Tool Set

AI Studio can now propose these additional approval-gated production tools:

- `explain_export_blockers`: explains recipe, generation-job, and release blockers with next fix targets.
- `inspect_layer_stack`: reports current recipe layer order, selected layer, selected part/source, hidden/locked state, and layer-stack risks.
- `diagnose_sprite_alignment`: summarizes frame, selected layer, selected part, missing-animation queue, and warnings for alignment triage.
- `suggest_next_action`: chooses the next concrete production action from live context.
- `search_assets`: local-only search over the private PC asset inventory.
- `open_relevant_panel`: navigates to APES Lab, Exports, Settings, or AI Studio.
- `compare_current_frame_to_base`: summarizes the current frame against base/source context for mismatch triage.
- `validate_current_recipe`: reports recipe readiness, generation blockers, and missing-animation queue status.
- `prepare_generation_prompt`: builds PixelLab, APES, Aseprite, LPC, or Duelyst-oriented prompts from live context.
- `inspect_rag_sources`: reports active RAG source counts, hosted/local mode, and retrieval confidence.
- `run_project_check`: local-only approved checks for lint, source hygiene, hosted RAG check, AI tool tests, or release build.

Local-only project checks use direct Node/script paths through the local tool server rather than PowerShell or npm shims.

AI Studio also exposes a small "Ask about blockers" affordance when the live snapshot has warnings. It simply pre-fills the chat with the relevant warning context; it does not execute tools.

## Evaluate RAG Quality

Run:

```bash
npm run rag:evaluate
```

The evaluator fails when required citation sources or required terms are missing. Release candidates must pass this check before the AI Studio can be considered production ready. The regression set covers Randoms license provenance, PixelLab missing-animation guidance, and the session-only secret policy with redacted local proxy routing.

## Production Acceptance

The production gate is:

```bash
npm run production:check
```

That gate includes `npm run rag:evaluate` and `npm run rag:hosted-check`, so stale local citations or a broken GitHub Pages RAG index block production readiness.
