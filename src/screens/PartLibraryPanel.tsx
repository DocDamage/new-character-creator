import { useState } from 'react'
import { partLabels } from '../presets'
import type { ExtractedPart, ExtractionMethod, PartLabel } from '../types'
import { downloadJson, slugLabel } from '../utils'

type PartReviewFilter = 'all' | 'reviewed' | 'needs_review'

type PartLibraryPanelProps = {
  parts: ExtractedPart[]
  togglePartReviewed: (partId: string) => void
  setPartsReviewed: (partIds: string[], reviewed: boolean) => void
  deletePart: (partId: string) => void
  clearPartLibrary: () => void
  exportPartLibrary: () => void
}

export function PartLibraryPanel({
  parts,
  togglePartReviewed,
  setPartsReviewed,
  deletePart,
  clearPartLibrary,
  exportPartLibrary,
}: PartLibraryPanelProps) {
  const [methodFilter, setMethodFilter] = useState<ExtractionMethod | 'all'>('all')
  const [labelFilter, setLabelFilter] = useState<PartLabel | 'all'>('all')
  const [reviewFilter, setReviewFilter] = useState<PartReviewFilter>('all')
  const [query, setQuery] = useState('')
  const reviewedCount = parts.filter((part) => part.reviewed).length
  const byMethod = parts.reduce<Record<string, number>>((acc, part) => {
    acc[part.extraction_method] = (acc[part.extraction_method] ?? 0) + 1
    return acc
  }, {})
  const normalizedQuery = query.trim().toLowerCase()
  const filteredParts = parts.filter((part) => {
    const matchesMethod = methodFilter === 'all' || part.extraction_method === methodFilter
    const matchesLabel = labelFilter === 'all' || part.label === labelFilter
    const matchesReview =
      reviewFilter === 'all' || (reviewFilter === 'reviewed' ? part.reviewed : !part.reviewed)
    const searchable = [part.part_id, part.character_id, part.label, part.extraction_method, ...part.tags].join(' ').toLowerCase()
    return matchesMethod && matchesLabel && matchesReview && (!normalizedQuery || searchable.includes(normalizedQuery))
  })
  const filteredIds = filteredParts.map((part) => part.part_id)

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div>
          <h3>Part Library</h3>
          <p>Reusable extraction records from APES, presets, connected-pixel selections, and manual cleanup.</p>
        </div>
        <div className="topbar-actions">
          <button onClick={exportPartLibrary}>Export library JSON</button>
          <button onClick={clearPartLibrary}>Clear library</button>
        </div>
      </div>

      <div className="validation-grid">
        <article className="pass">
          <strong>{parts.length}</strong>
          <span>total parts</span>
        </article>
        <article className={reviewedCount === parts.length && parts.length > 0 ? 'pass' : 'warn'}>
          <strong>{reviewedCount}</strong>
          <span>reviewed</span>
        </article>
        {Object.entries(byMethod).map(([method, count]) => (
          <article key={method} className="pass">
            <strong>{count}</strong>
            <span>{slugLabel(method)}</span>
          </article>
        ))}
        <article className={filteredParts.length > 0 ? 'pass' : 'warn'}>
          <strong>{filteredParts.length}</strong>
          <span>visible results</span>
        </article>
      </div>

      <div className="library-filters">
        <label className="field">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="part id, tag, character" />
        </label>
        <label className="field">
          <span>Method</span>
          <select data-testid="part-library-method-filter" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as ExtractionMethod | 'all')}>
            <option value="all">all methods</option>
            <option value="apes">APES</option>
            <option value="preset_region">preset regions</option>
            <option value="connected_pixel">connected pixels</option>
            <option value="manual">manual cleanup</option>
          </select>
        </label>
        <label className="field">
          <span>Label</span>
          <select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value as PartLabel | 'all')}>
            <option value="all">all labels</option>
            {partLabels.map((label) => (
              <option key={label} value={label}>
                {slugLabel(label)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Review</span>
          <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as PartReviewFilter)}>
            <option value="all">all review states</option>
            <option value="needs_review">needs review</option>
            <option value="reviewed">reviewed</option>
          </select>
        </label>
      </div>

      <div className="status-strip">
        <button data-testid="mark-visible-reviewed" onClick={() => setPartsReviewed(filteredIds, true)} disabled={filteredParts.length === 0}>Mark visible reviewed</button>
        <button data-testid="mark-visible-unreviewed" onClick={() => setPartsReviewed(filteredIds, false)} disabled={filteredParts.length === 0}>Mark visible unreviewed</button>
        <button
          onClick={() =>
            downloadJson('pixel_creator_filtered_parts.json', {
              exported_at: new Date().toISOString(),
              filters: { methodFilter, labelFilter, reviewFilter, query },
              part_count: filteredParts.length,
              parts: filteredParts,
            })
          }
          disabled={filteredParts.length === 0}
        >
          Export visible JSON
        </button>
      </div>

      <div className="part-library-list">
        {filteredParts.map((part) => (
          <article key={part.part_id} className={part.reviewed ? 'reviewed' : ''}>
            <div>
              <strong>{part.label}</strong>
              <span>{part.part_id}</span>
            </div>
            <div className="part-meta">
              <span>{part.character_id}</span>
              <span>{slugLabel(part.extraction_method)}</span>
              <span>{part.source_animation} / {part.source_direction}</span>
              <span>{part.bounds.w}x{part.bounds.h} at {part.bounds.x},{part.bounds.y}</span>
            </div>
            <div className="part-meta">
              {part.tags.map((tag) => (
                <span key={tag}>{slugLabel(tag)}</span>
              ))}
            </div>
            {part.warnings.length > 0 ? (
              <p>{part.warnings.join(' ')}</p>
            ) : null}
            <div className="job-actions">
              <button onClick={() => togglePartReviewed(part.part_id)}>{part.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}</button>
              <button onClick={() => downloadJson(`${part.part_id}.json`, part)}>Download metadata</button>
              <button onClick={() => deletePart(part.part_id)}>Delete</button>
            </div>
          </article>
        ))}
        {parts.length === 0 ? <p className="empty">No parts in the library yet. Extract a region or connected cluster from the Art Workstation.</p> : null}
        {parts.length > 0 && filteredParts.length === 0 ? <p className="empty">No parts match the current filters.</p> : null}
      </div>
    </section>
  )
}