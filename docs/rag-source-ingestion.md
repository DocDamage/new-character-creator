# RAG Source Ingestion

The sprite character creator builds a lightweight local RAG index with:

```bash
npm run rag:index
```

The index builder reads known project documents, generated manifests, APES/LPC summaries, and optional local source folders. It writes:

```txt
data/rag/knowledge_index.json
public/data/rag/knowledge_index.json
```

The public index is sanitized and only includes public-safe source specs.

## Supported Source Formats

The RAG source extractor supports:

```txt
.txt
.md
.markdown
.json
.csv
.tsv
.log
.pdf
.docx
.doc
.png
.jpg
.jpeg
.bmp
.gif
```

## Source Extraction Files

Primary implementation files:

```txt
tools/build-rag-index.js
tools/rag-source-extractor.js
src/ragIndex.ts
src/ragTypes.ts
```

`tools/build-rag-index.js` owns the source list and optional folder discovery.

`tools/rag-source-extractor.js` owns text extraction, DOCX extraction, legacy DOC conversion hooks, image metadata extraction, and optional OCR.

`src/ragIndex.ts` owns chunking, term normalization, scoring, context bundles, and citation objects.

`src/ragTypes.ts` owns the typed source and chunk shapes.

## Optional Local Source Folders

The index builder discovers extra source files from these folders when they exist:

```txt
docs/rag-sources/private/
docs/rag-sources/visual/
docs/rag-sources/office/
```

Use these folders for source material that should feed local RAG but may not be part of the normal curated docs.

## Private Local Sources

Path:

```txt
docs/rag-sources/private/
```

Use for local-only notes, draft specs, temporary planning docs, and private RAG material.

Supported examples:

```txt
docs/rag-sources/private/local-notes.md
docs/rag-sources/private/asset-review.txt
docs/rag-sources/private/provider-notes.json
```

Private sources are included in the full local index, not the public-safe source list.

## Visual Sources

Path:

```txt
docs/rag-sources/visual/
```

Use for images and GIFs that contain useful visual reference information.

Supported examples:

```txt
docs/rag-sources/visual/ui-flow.png
docs/rag-sources/visual/error-state.jpg
docs/rag-sources/visual/animation-reference.gif
docs/rag-sources/visual/old-tool-capture.bmp
```

Visual ingestion records:

- source path
- source format
- image dimensions when detectable
- GIF frame count when detectable
- optional OCR text when `tesseract.js` is installed
- diagnostic warnings when OCR is unavailable

Visual ingestion is not true image-vector search. It creates text and metadata chunks that can be searched by the existing RAG index.

## Office Sources

Path:

```txt
docs/rag-sources/office/
```

Use for Word documents that contain useful design specs, tool notes, or animation requirements.

Supported examples:

```txt
docs/rag-sources/office/animation-spec.docx
docs/rag-sources/office/legacy-workflow.doc
```

DOCX extraction uses the existing `jszip` dependency to read Word XML text directly.

Legacy DOC extraction supports two paths:

1. A sidecar text file named like `legacy-workflow.doc.txt`.
2. LibreOffice headless conversion through `soffice` when available on PATH.

If legacy DOC conversion fails, the index receives a diagnostic chunk rather than silently dropping the source.

## PDF Sources

PDF is registered as a source format, but this repo does not currently bundle a PDF text extractor.

For important PDFs, convert them to Markdown and place them in a curated docs folder or `docs/rag-sources/private/`.

PDF entries currently produce a diagnostic chunk unless a future extractor is added.

## OCR Behavior

OCR is optional.

If `tesseract.js` is installed, visual sources attempt OCR.

If `tesseract.js` is not installed, visual sources still produce metadata chunks with dimensions and warnings.

Recommended install if OCR is needed:

```bash
npm install tesseract.js
```

OCR should be treated as noisy. Important visual text should be reviewed and converted into Markdown when it becomes canonical.

## Public Index Behavior

The public index is intentionally narrower than the local index.

Public source specs include curated docs and public manifests only. Optional private, visual, and office folders are not included in the public source list by default.

## Build Commands

Build the local and public indexes:

```bash
npm run rag:index
```

Scan local PC asset folders into an ignored private RAG inventory:

```bash
npm run rag:scan-pc
npm run rag:index
```

By default, `rag:scan-pc` scans asset-heavy user folders such as Downloads,
Documents, OneDrive Pictures, GameMakerProjects, this project's `assets`, and
known RPG Maker/dev asset folders. Use `--root "path1;path2"` for a custom
scan set, or `--all-profile` when you really want a broader profile crawl.

The scanner deduplicates by content for files that share the same byte size,
keeps unique-size files without hashing their full contents, writes a compact
Markdown source for RAG, and writes the full JSON sidecar under ignored
`data/rag/` for local inspection.

Fetch curated web sources into an ignored private RAG source:

```bash
npm run rag:fetch-web
npm run rag:index
```

The web fetcher reads `docs/rag-web-sources.json`, downloads only configured
seed URLs, optionally crawls same-origin links that match each source's
`allow_patterns`, deduplicates by extracted text hash, and writes:

```txt
docs/rag-sources/private/web-sources.md
data/rag/web-source-manifest.json
```

Fetched web text stays private by default. Promote only reviewed summaries or
properly licensed material into public docs.

Useful overrides:

```bash
npm run rag:fetch-web -- --config docs/rag-web-sources.json --max-pages 80
```

Evaluate RAG quality:

```bash
npm run rag:evaluate
```

Run the tool tests:

```bash
npm run test:tools
```

Run the production gate:

```bash
npm run production:check
```

## Current Limits

- DOCX extraction is text-only and does not preserve rich formatting.
- DOC conversion depends on sidecar text or LibreOffice.
- PDF extraction is registered but diagnostic-only until a parser is added.
- Image/GIF OCR is optional and depends on `tesseract.js`.
- GIF ingestion records metadata and optional OCR, not every animation frame as separate chunks.
- The current RAG index is keyword/metadata based, not dense vector based.

## Best Practice

Use optional source folders to ingest messy raw sources, then promote important discoveries into clean Markdown docs.

Canonical facts should live in reviewed Markdown, not only in OCR output, Office files, or converted legacy documents.
