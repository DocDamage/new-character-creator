export type RagSourceType =
  | 'doc'
  | 'readme'
  | 'lpc_catalog'
  | 'asset_manifest'
  | 'apes_inventory'
  | 'training_record'
  | 'generation_job'
  | 'license_audit'
  | 'security_doc'

export type RagSourceDocument = {
  source_id: string
  source_type: RagSourceType
  title: string
  uri: string
  text: string
  metadata: Record<string, string | number | boolean | null>
  trust_level?: RagChunk['trust_level']
  license_tags?: string[]
}

export type RagChunk = {
  chunk_id: string
  source_id: string
  source_type: RagSourceType
  title: string
  uri: string
  text: string
  content_hash: string
  token_estimate: number
  trust_level: 'project_doc' | 'generated_manifest' | 'local_report' | 'external_reference'
  license_tags: string[]
  terms: string[]
  metadata: Record<string, string | number | boolean | null>
}

export type RagIndex = {
  format: 'pixel_creator_rag_index'
  version: 1
  generated_at: string
  document_count: number
  chunk_count: number
  chunks: RagChunk[]
}

export type RagQuery = {
  query: string
  limit?: number
  sourceTypes?: RagSourceType[]
  metadataFilters?: Record<string, string | number | boolean>
}

export type RagSearchResult = {
  chunk: RagChunk
  score: number
  matched_terms: string[]
}

export type RagEvaluationResult = {
  query_id: string
  passed: boolean
  score: number
  matched_source_ids: string[]
  missing_source_ids: string[]
  matched_terms: string[]
  missing_terms: string[]
}

export type RagContextPurpose = 'generation_prompt' | 'provider_selection' | 'review_guidance' | 'troubleshooting' | 'evaluation'

export type RagContextBundle = {
  purpose: RagContextPurpose
  query: string
  context_text: string
  chunks: RagSearchResult[]
  citations: Array<{
    source_id: string
    title: string
    uri: string
  }>
}
