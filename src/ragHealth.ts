import type { RagIndex } from './ragTypes'

export type RagIndexHealth = {
  ready: boolean
  severity: 'ready' | 'warning' | 'error'
  message: string
  document_count: number
  chunk_count: number
  generated_at: string | null
  age_days: number | null
}

const defaultStaleAfterDays = 14

export function getHostedRagIndexUrl(basePath = '/'): string {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${normalizedBase}data/rag/knowledge_index.json`
}

export function validateHostedRagIndex(
  value: unknown,
  options: { now?: Date; staleAfterDays?: number } = {},
): RagIndexHealth {
  if (!isRagIndex(value)) {
    return makeHealth(false, 'error', 'Hosted RAG index is missing or malformed.', 0, 0, null, null)
  }

  const generatedAt = Date.parse(value.generated_at)
  const now = options.now ?? new Date()
  const ageDays = Number.isFinite(generatedAt)
    ? Math.max(0, (now.getTime() - generatedAt) / 86_400_000)
    : null

  if (value.document_count <= 0 || value.chunk_count <= 0) {
    return makeHealth(false, 'error', 'Hosted RAG index is empty. Run npm run rag:index before publishing.', value.document_count, value.chunk_count, value.generated_at, ageDays)
  }

  const staleAfterDays = options.staleAfterDays ?? defaultStaleAfterDays
  if (ageDays !== null && ageDays > staleAfterDays) {
    return makeHealth(true, 'warning', `Hosted RAG index is loaded but older than ${staleAfterDays} days.`, value.document_count, value.chunk_count, value.generated_at, ageDays)
  }

  return makeHealth(true, 'ready', 'Hosted RAG index is ready.', value.document_count, value.chunk_count, value.generated_at, ageDays)
}

export function describeRagIndexHealth(health: RagIndexHealth): string {
  const age = health.age_days === null ? '' : `, indexed ${Math.round(health.age_days)} day(s) ago`
  return `${health.message} ${health.document_count} source document(s), ${health.chunk_count} knowledge chunk(s)${age}.`
}

function makeHealth(
  ready: boolean,
  severity: RagIndexHealth['severity'],
  message: string,
  documentCount: number,
  chunkCount: number,
  generatedAt: string | null,
  ageDays: number | null,
): RagIndexHealth {
  return {
    ready,
    severity,
    message,
    document_count: documentCount,
    chunk_count: chunkCount,
    generated_at: generatedAt,
    age_days: ageDays,
  }
}

function isRagIndex(value: unknown): value is RagIndex {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RagIndex>
  return candidate.format === 'pixel_creator_rag_index'
    && candidate.version === 1
    && typeof candidate.generated_at === 'string'
    && typeof candidate.document_count === 'number'
    && typeof candidate.chunk_count === 'number'
    && Array.isArray(candidate.chunks)
}
