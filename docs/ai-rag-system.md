# AI And RAG System

The app uses AI as an explicit, review-gated workflow. Users can compose, edit, review, and export without running AI, but AI Studio and APES Lab can prepare generation jobs for missing animation layers, cite local RAG context, and propose approval-gated tool actions.

## Build The Knowledge Index

Run:

```bash
npm run rag:index
```

This writes the full local index to `data/rag/knowledge_index.json` from project docs, release notes, APES notes, LPC catalog summaries, manifests, and local APES inventory when present. It also writes a public-safe hosted index to `public/data/rag/knowledge_index.json` so AI Studio can activate RAG in the static app without requiring the local tools server.

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

That gate includes `npm run rag:evaluate`, so stale or missing RAG citations block production readiness.
