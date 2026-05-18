import type { RagContextBundle, RagIndex, RagQuery, RagSearchResult, RagSourceDocument, RagSourceType } from './ragTypes'

const defaultChunkCharLimit = 900
const defaultQueryLimit = 6

export function buildRagIndex(documents: RagSourceDocument[], options: { generatedAt?: string } = {}): RagIndex {
  const chunks = documents.flatMap((document) => chunkDocument(document))
  return {
    format: 'pixel_creator_rag_index',
    version: 1,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    document_count: documents.length,
    chunk_count: chunks.length,
    chunks,
  }
}

export function queryRagIndex(index: RagIndex, query: RagQuery): RagSearchResult[] {
  const queryTerms = normalizeTerms(query.query)
  if (queryTerms.length === 0) return []
  const allowedTypes = new Set<RagSourceType>(query.sourceTypes ?? [])

  return index.chunks
    .filter((chunk) => allowedTypes.size === 0 || allowedTypes.has(chunk.source_type))
    .filter((chunk) => matchesMetadataFilters(chunk.metadata, query.metadataFilters ?? {}))
    .map((chunk) => {
      const matchedTerms = Array.from(new Set(queryTerms.filter((term) => chunk.terms.includes(term))))
      const titleBoost = normalizeTerms(chunk.title).filter((term) => queryTerms.includes(term)).length * 3
      const metadataBoost = Object.values(chunk.metadata).join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((term) => queryTerms.includes(term)).length
      return {
        chunk,
        score: matchedTerms.length * 10 + titleBoost + metadataBoost,
        matched_terms: matchedTerms,
      }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.chunk_id.localeCompare(right.chunk.chunk_id))
    .slice(0, query.limit ?? defaultQueryLimit)
}

export function buildRagContextBundle(index: RagIndex, query: RagQuery & { purpose: RagContextBundle['purpose'] }): RagContextBundle {
  const chunks = queryRagIndex(index, query)
  const contextText = chunks
    .map((result, index) => `[${index + 1}] ${result.chunk.title}\n${result.chunk.text}`)
    .join('\n\n')

  return {
    purpose: query.purpose,
    query: query.query,
    context_text: contextText,
    chunks,
    citations: chunks.map((result) => ({
      source_id: result.chunk.source_id,
      title: result.chunk.title,
      uri: result.chunk.uri,
    })),
  }
}

function chunkDocument(document: RagSourceDocument) {
  const paragraphs = document.text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph
    if (next.length > defaultChunkCharLimit && current) {
      chunks.push(current)
      current = paragraph
    } else {
      current = next
    }
  }
  if (current) chunks.push(current)

  return chunks.map((text, index) => ({
    chunk_id: `${document.source_id}#${String(index + 1).padStart(3, '0')}`,
    source_id: document.source_id,
    source_type: document.source_type,
    title: document.title,
    uri: document.uri,
    text,
    token_estimate: Math.ceil(text.length / 4),
    terms: normalizeTerms(`${document.title} ${text} ${Object.values(document.metadata).join(' ')}`),
    metadata: document.metadata,
  }))
}

function normalizeTerms(value: string) {
  return Array.from(new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3),
  ))
}

function matchesMetadataFilters(metadata: Record<string, string | number | boolean | null>, filters: Record<string, string | number | boolean>) {
  return Object.entries(filters).every(([key, value]) => metadata[key] === value)
}
