import { useState, type Dispatch, type SetStateAction } from 'react'
import { CompositeCanvas } from '../CompositeCanvas'
import { isPartCompatibleWithMannequin } from '../lpcPartCompatibility'
import { partLabels } from '../presets'
import type { AnimationName, CharacterManifest, Direction, ExtractedPart, ExtractionMethod, KitbashRecipe, PartLabel } from '../types'
import { ContextMenuArea, ContextMenuButton, DetailsDrawer, type DetailsRecord } from '../uiDisclosure'
import { downloadJson, slugLabel } from '../utils'

type PartReviewFilter = 'all' | 'reviewed' | 'needs_review'

type PartLibraryPanelProps = {
  parts: ExtractedPart[]
  recipe: KitbashRecipe | null
  characters: CharacterManifest[]
  selectedPartIds: Partial<Record<PartLabel, string>>
  setSelectedPartIds: Dispatch<SetStateAction<Partial<Record<PartLabel, string>>>>
  activePartLabel: PartLabel
  setActivePartLabel: (label: PartLabel) => void
  currentAnimation: AnimationName
  currentDirection: Direction
  currentFrameIndex: number
  importLayerBundleJson: (text: string, sourceName: string) => void
  partLibraryStatus: string
  togglePartReviewed: (partId: string) => void
  setPartsReviewed: (partIds: string[], reviewed: boolean) => void
  deletePart: (partId: string) => void
  clearPartLibrary: () => void
  exportPartLibrary: () => void
}

export function PartLibraryPanel({
  parts,
  recipe,
  characters,
  selectedPartIds,
  setSelectedPartIds,
  activePartLabel,
  setActivePartLabel,
  currentAnimation,
  currentDirection,
  currentFrameIndex,
  importLayerBundleJson,
  partLibraryStatus,
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
  const [visibleLimit, setVisibleLimit] = useState(100)
  const [detailsRecord, setDetailsRecord] = useState<DetailsRecord | null>(null)
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
  const visibleParts = filteredParts.slice(0, visibleLimit)
  const visibleIds = visibleParts.map((part) => part.part_id)
  const recipeMannequin = characters.find((character) => character.character_id === recipe?.base_character)
  const reviewedPartsForActiveLabel = parts.filter((part) => part.reviewed && part.label === activePartLabel && isPartCompatibleWithMannequin(part, recipeMannequin))
  const selectedActivePart = selectedPartIds[activePartLabel]

  function selectActivePart(partId: string) {
    setSelectedPartIds((current) => {
      const next = { ...current }
      if (partId) {
        next[activePartLabel] = partId
      } else {
        delete next[activePartLabel]
      }
      return next
    })
  }

  function showPartDetails(part: ExtractedPart) {
    setDetailsRecord({
      title: part.part_id,
      subtitle: `${slugLabel(part.label)} / ${slugLabel(part.extraction_method)}`,
      fields: [
        { label: 'Source character', value: part.character_id },
        { label: 'Source frame', value: `${part.source_animation} / ${part.source_direction}${part.source_frame_path ? ` / ${part.source_frame_path}` : ''}` },
        { label: 'Bounds', value: `${part.bounds.w}x${part.bounds.h} at ${part.bounds.x},${part.bounds.y}` },
        { label: 'Anchor', value: `${part.anchor.x},${part.anchor.y}` },
        { label: 'Review state', value: part.reviewed ? 'reviewed' : 'needs review' },
        { label: 'Source family', value: part.source_family ?? 'unspecified' },
        { label: 'Recipe modes', value: part.compatible_recipe_modes?.join(', ') || 'unspecified' },
        { label: 'Compatibility', value: `${part.compatibility.animations.join(', ') || 'no animations'} / ${part.compatibility.directions.join(', ') || 'no directions'}` },
        { label: 'Image source', value: part.image_asset_key ? `IndexedDB asset: ${part.image_asset_key}` : part.image_path },
        { label: 'Mask source', value: part.mask_asset_key ? `IndexedDB asset: ${part.mask_asset_key}` : (part.mask_path ?? 'none') },
        { label: 'Tags', value: part.tags.join(', ') || 'none' },
        { label: 'Warnings', value: part.warnings.join(' ') || 'none' },
      ],
    })
  }

  function showPreviewDetails() {
    setDetailsRecord({
      title: 'Live composite preview',
      subtitle: `${currentAnimation} / ${currentDirection} / frame ${currentFrameIndex + 1}`,
      fields: [
        { label: 'Recipe', value: recipe ? `${recipe.character_id} / ${recipe.recipe_mode ?? 'unspecified mode'}` : 'none' },
        { label: 'Active layer', value: activePartLabel },
        { label: 'Selected active part', value: selectedActivePart ?? 'source character' },
        { label: 'Reviewed options', value: String(reviewedPartsForActiveLabel.length) },
        { label: 'Library size', value: `${parts.length} total part(s), ${reviewedCount} reviewed` },
        { label: 'Frame', value: `${currentAnimation} / ${currentDirection} / ${currentFrameIndex + 1}` },
      ],
    })
  }


  function buildPartActions(part: ExtractedPart) {
    const canUseForActiveLayer = part.reviewed && part.label === activePartLabel && isPartCompatibleWithMannequin(part, recipeMannequin)
    return [
      {
        id: 'view-details',
        label: 'View details',
        onSelect: () => showPartDetails(part),
      },
      {
        id: 'use-active-layer',
        label: 'Use for active layer',
        disabled: !canUseForActiveLayer,
        disabledReason: part.label !== activePartLabel
          ? `Switch the active layer to ${slugLabel(part.label)} first.`
          : !part.reviewed
            ? 'Review this part before using it in the live picker.'
            : 'This part is not compatible with the active mannequin.',
        onSelect: () => selectActivePart(part.part_id),
      },
      {
        id: 'toggle-review',
        label: part.reviewed ? 'Mark unreviewed' : 'Mark reviewed',
        onSelect: () => togglePartReviewed(part.part_id),
      },
      {
        id: 'download-metadata',
        label: 'Download metadata',
        onSelect: () => downloadJson(`${part.part_id}.json`, part),
      },
      {
        id: 'delete-part',
        label: 'Delete',
        onSelect: () => deletePart(part.part_id),
      },
    ]
  }

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div>
          <h3>Part Library</h3>
          <p>Reusable extraction records from APES, presets, connected-pixel selections, and manual cleanup.</p>
        </div>
        <div className="topbar-actions">
          <label className="file-import">
            <span>Import layer bundle JSON</span>
            <input
              data-testid="import-layer-bundle-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                file.text().then((text) => importLayerBundleJson(text, file.name))
                event.currentTarget.value = ''
              }}
            />
          </label>
          <button onClick={exportPartLibrary}>Export library JSON</button>
          <button onClick={clearPartLibrary}>Clear library</button>
        </div>
      </div>

      <div className="settings-card">
        <strong>Import status</strong>
        <span>{partLibraryStatus}</span>
      </div>

      <section className="part-picker-panel" aria-label="Live part picker">
        <div>
          <strong>Live part picker</strong>
          <span>Pick a reviewed part and watch the composite preview update immediately.</span>
        </div>
        <div className="part-picker-controls">
          <label className="field">
            <span>Layer</span>
            <select
              data-testid="library-live-layer"
              value={activePartLabel}
              onChange={(event) => setActivePartLabel(event.target.value as PartLabel)}
            >
              {partLabels.map((label) => (
                <option key={label} value={label}>{slugLabel(label)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reviewed part</span>
            <select
              data-testid="library-live-part"
              value={selectedActivePart ?? ''}
              onChange={(event) => selectActivePart(event.target.value)}
              disabled={reviewedPartsForActiveLabel.length === 0}
            >
              <option value="">{reviewedPartsForActiveLabel.length === 0 ? 'no reviewed parts for this layer' : 'use source character'}</option>
              {reviewedPartsForActiveLabel.map((part) => (
                <option key={part.part_id} value={part.part_id}>
                  {part.part_id} / {slugLabel(part.extraction_method)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {recipe ? (
          <ContextMenuArea
            label="Actions for live composite preview"
            actions={[{ id: 'view-details', label: 'View details', onSelect: showPreviewDetails }]}
          >
            <CompositeCanvas
              recipe={recipe}
              characters={characters}
              partLibrary={parts}
              animation={currentAnimation}
              direction={currentDirection}
              frameIndex={currentFrameIndex}
              scale={3}
              label={`live composite ${currentAnimation} ${currentDirection} frame ${currentFrameIndex + 1}`}
            />
          </ContextMenuArea>
        ) : null}
      </section>

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
          <span>filtered results</span>
        </article>
      </div>

      <div className="library-filters">
        <label className="field">
          <span>Search</span>
          <input value={query} onChange={(event) => {
            setQuery(event.target.value)
            setVisibleLimit(100)
          }} placeholder="part id, tag, character" />
        </label>
        <label className="field">
          <span>Method</span>
          <select data-testid="part-library-method-filter" value={methodFilter} onChange={(event) => {
            setMethodFilter(event.target.value as ExtractionMethod | 'all')
            setVisibleLimit(100)
          }}>
            <option value="all">all methods</option>
            <option value="apes">APES</option>
            <option value="preset_region">preset regions</option>
            <option value="connected_pixel">connected pixels</option>
            <option value="manual">manual cleanup</option>
          </select>
        </label>
        <label className="field">
          <span>Label</span>
          <select value={labelFilter} onChange={(event) => {
            setLabelFilter(event.target.value as PartLabel | 'all')
            setVisibleLimit(100)
          }}>
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
          <select data-testid="part-library-review-filter" value={reviewFilter} onChange={(event) => {
            setReviewFilter(event.target.value as PartReviewFilter)
            setVisibleLimit(100)
          }}>
            <option value="all">all review states</option>
            <option value="needs_review">needs review</option>
            <option value="reviewed">reviewed</option>
          </select>
        </label>
      </div>

      <div className="status-strip">
        <button data-testid="mark-visible-reviewed" onClick={() => setPartsReviewed(visibleIds, true)} disabled={visibleParts.length === 0}>Mark visible reviewed</button>
        <button data-testid="mark-visible-unreviewed" onClick={() => setPartsReviewed(visibleIds, false)} disabled={visibleParts.length === 0}>Mark visible unreviewed</button>
        <button
          onClick={() =>
            downloadJson('pixel_creator_filtered_parts.json', {
              exported_at: new Date().toISOString(),
              filters: { methodFilter, labelFilter, reviewFilter, query },
              filtered_part_count: filteredParts.length,
              visible_part_count: visibleParts.length,
              part_count: visibleParts.length,
              parts: visibleParts,
            })
          }
          disabled={visibleParts.length === 0}
        >
          Export visible JSON
        </button>
      </div>

      <div className="settings-card">
        <strong>Rendered results</strong>
        <span>Showing {visibleParts.length} of {filteredParts.length} filtered part(s).</span>
        {visibleParts.length < filteredParts.length ? (
          <button data-testid="show-more-parts" onClick={() => setVisibleLimit((current) => current + 100)}>Show 100 more</button>
        ) : null}
      </div>

      <div className="part-library-list">
        {visibleParts.map((part) => {
          const actions = buildPartActions(part)
          return (
            <ContextMenuArea key={part.part_id} label={`Actions for ${part.part_id}`} actions={actions}>
              <article className={part.reviewed ? 'reviewed' : ''}>
                <div>
                  <strong>{slugLabel(part.label)}</strong>
                  <span>{part.part_id}</span>
                  <ContextMenuButton label={`More actions for ${part.part_id}`} actions={actions} />
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
            </ContextMenuArea>
          )
        })}
        {parts.length === 0 ? <p className="empty">No parts in the library yet. Extract a region or connected cluster from the Art Workstation.</p> : null}
        {parts.length > 0 && filteredParts.length === 0 ? <p className="empty">No parts match the current filters.</p> : null}
      </div>
      <DetailsDrawer record={detailsRecord} onClose={() => setDetailsRecord(null)} />
    </section>
  )
}
