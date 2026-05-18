# AI And RAG System

The app uses AI as an explicit, review-gated workflow. Users can compose, edit, review, and export without running AI, but the AI/APES tab can prepare generation jobs for missing animation layers and enrich those jobs with local RAG context.

## Build The Knowledge Index

Run:

```bash
npm run rag:index
```

This writes `data/rag/knowledge_index.json` from project docs, release notes, APES notes, LPC catalog summaries, manifests, and local APES inventory when present.

## Use RAG Context

1. Open APES Lab.
2. Confirm AI Knowledge reports a loaded index.
3. Build or select an LPC catalog-backed recipe with missing or unsupported animation records.
4. Click Create generation jobs from queue.
5. Download the handoff JSON or individual job JSON.
6. Send the prompt, references, and cited context to PixelLab or another provider.
7. Import generated output for review.
8. Approve reviewed output before release export.

## Safety Rules

- AI runs are user-started.
- Generated output is not selected automatically.
- Generated output cannot overwrite upstream assets.
- Release export remains blocked until review is approved.
- Provider tokens stay outside the repo.
