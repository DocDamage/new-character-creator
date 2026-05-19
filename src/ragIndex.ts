import type { RagChunk, RagContextBundle, RagIndex, RagQuery, RagSearchResult, RagSourceDocument, RagSourceType } from './ragTypes'

const defaultChunkCharLimit = 900
const defaultQueryLimit = 6
const stopTerms = new Set([
  'about',
  'after',
  'all',
  'also',
  'and',
  'any',
  'are',
  'can',
  'for',
  'from',
  'has',
  'have',
  'how',
  'into',
  'not',
  'the',
  'this',
  'that',
  'use',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
])

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
    chunk_id: makeChunkId(document.source_id, index, text),
    source_id: document.source_id,
    source_type: document.source_type,
    title: document.title,
    uri: document.uri,
    text,
    content_hash: stableHash(text),
    token_estimate: Math.ceil(text.length / 4),
    trust_level: document.trust_level ?? inferTrustLevel(document.source_type),
    license_tags: document.license_tags ?? inferLicenseTags(text),
    terms: normalizeTerms(`${document.title} ${text} ${Object.values(document.metadata).join(' ')}`),
    metadata: document.metadata,
  }))
}

function makeChunkId(sourceId: string, index: number, text: string) {
  return `${sourceId.replace(/[^a-z0-9]+/gi, '_')}_${stableHash(`${sourceId}\n${index}\n${text}`).slice(0, 16)}`
}

function stableHash(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0').repeat(8).slice(0, 64)
}

function inferTrustLevel(sourceType: RagSourceDocument['source_type']): RagChunk['trust_level'] {
  if (sourceType === 'asset_manifest' || sourceType === 'lpc_catalog') return 'generated_manifest'
  if (sourceType === 'apes_inventory' || sourceType === 'training_record' || sourceType === 'generation_job') return 'local_report'
  return 'project_doc'
}

function inferLicenseTags(text: string) {
  return Array.from(new Set((text.match(/CC0|CC-BY-SA|OGA-BY|MIT|Apache-2\.0/gi) ?? []).map((tag) => tag.toUpperCase()))).sort()
}

function normalizeTerms(value: string) {
  return Array.from(new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3 && !stopTerms.has(term)),
  ))
}

function matchesMetadataFilters(metadata: Record<string, string | number | boolean | null>, filters: Record<string, string | number | boolean>) {
  return Object.entries(filters).every(([key, value]) => metadata[key] === value)
}
