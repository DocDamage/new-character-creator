import { useEffect, useMemo, useState } from 'react'
import { analyzeImageSource } from '../sourceAnalysis'
import type { AssetManifest, DuelystPackageAudit, DuelystPackageCandidate, LpcAssetInventory, SourceAlphaAnalysis } from '../types'
import { slugLabel } from '../utils'

type AssetAuditPanelProps = {
  manifest: AssetManifest
  classCounts: Record<string, number>
  duelystAudit: DuelystPackageAudit | null
  duelystBusy: boolean
  duelystStatus: string
  lpcInventory: LpcAssetInventory | null
  lpcBusy: boolean
  lpcStatus: string
  runDuelystAudit: () => Promise<void>
  runLpcInventory: () => Promise<void>
  loadPrivateDuelystManifest: () => Promise<void>
  openDuelystStageCharacter: (characterId: string) => void
  createDuelystApesJobs: (characterIds: string[]) => void
  localToolsAvailable: boolean
  importLpcSheetsAsParts: (limit: number) => void
  lpcImportStatus: string
}

export function AssetAuditPanel({
  manifest,
  classCounts,
  duelystAudit,
  duelystBusy,
  duelystStatus,
  lpcInventory,
  lpcBusy,
  lpcStatus,
  runDuelystAudit,
  runLpcInventory,
  loadPrivateDuelystManifest,
  openDuelystStageCharacter,
  createDuelystApesJobs,
  localToolsAvailable,
  importLpcSheetsAsParts,
  lpcImportStatus,
}: AssetAuditPanelProps) {
  const [duelystSearch, setDuelystSearch] = useState('')
  const [bodyFilter, setBodyFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [trainingFilter, setTrainingFilter] = useState('apes')
  const [stagedFilter, setStagedFilter] = useState('staged')
  const warnings = manifest.characters.flatMap((character) => character.source_quality_warnings.map((warning) => ({ character: character.character_id, warning })))
  const duelystExtensionCounts = duelystAudit
    ? Object.entries(duelystAudit.extension_counts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 6)
    : []
  const duelystFilterOptions = useMemo(() => {
    const candidates = duelystAudit?.candidate_units ?? []
    return {
      bodyClasses: uniqueLabels(candidates, 'body_class'),
      sourceFamilies: uniqueLabels(candidates, 'source_family'),
      trainingRoles: uniqueLabels(candidates, 'training_role'),
    }
  }, [duelystAudit])
  const filteredDuelystCandidates = useMemo(() => {
    const search = duelystSearch.trim().toLowerCase()
    return (duelystAudit?.candidate_units ?? []).filter((candidate) => {
      const labels = candidate.labels ?? {}
      const bodyClass = typeof labels.body_class === 'string' ? labels.body_class : 'unknown'
      const sourceFamily = typeof labels.source_family === 'string' ? labels.source_family : 'unknown'
      const trainingRole = typeof labels.training_role === 'string' ? labels.training_role : 'unknown'
      const matchesSearch = !search || [
        candidate.unit_id,
        candidate.display_name,
        candidate.sheet_source_path,
        bodyClass,
        sourceFamily,
        trainingRole,
      ].some((value) => value.toLowerCase().includes(search))

      return matchesSearch
        && (bodyFilter === 'all' || bodyClass === bodyFilter)
        && (sourceFilter === 'all' || sourceFamily === sourceFilter)
        && (trainingFilter === 'all' || (trainingFilter === 'apes' ? trainingRole.startsWith('apes_') : trainingRole === trainingFilter))
        && (stagedFilter === 'all' || (stagedFilter === 'staged' ? candidate.staged : !candidate.staged))
    })
  }, [bodyFilter, duelystAudit, duelystSearch, sourceFilter, stagedFilter, trainingFilter])
  const batchableDuelystCandidates = filteredDuelystCandidates.filter((candidate) => candidate.staged && candidate.stage_character_id && getStringLabel(candidate, 'training_role').startsWith('apes_'))
  const lpcTopCategories = lpcInventory ? Object.entries(lpcInventory.summary.categories).slice(0, 8) : []
  const lpcTopFrameGrids = lpcInventory ? Object.entries(lpcInventory.summary.frame_grids).slice(0, 6) : []
  const [sourceAnalysis, setSourceAnalysis] = useState<SourceAlphaAnalysis | null>(null)
  const [sourceAnalysisStatus, setSourceAnalysisStatus] = useState('Waiting for a representative source frame.')

  useEffect(() => {
    const representativeFrame = manifest.characters[0]?.representative_frame
    if (!representativeFrame) {
      window.setTimeout(() => {
        setSourceAnalysis(null)
        setSourceAnalysisStatus('No representative source frame is available for alpha analysis.')
      }, 0)
      return
    }

    let cancelled = false
    window.setTimeout(() => {
      if (!cancelled) setSourceAnalysisStatus('Analyzing source alpha, floor, and pivot...')
    }, 0)
    analyzeImageSource(representativeFrame)
      .then((analysis) => {
        if (cancelled) return
        setSourceAnalysis(analysis)
        setSourceAnalysisStatus(`Analyzed ${analysis.opaque_pixel_count} opaque pixel(s) from ${representativeFrame}.`)
      })
      .catch((error) => {
        if (cancelled) return
        setSourceAnalysis(null)
        setSourceAnalysisStatus(`Source alpha analysis failed. ${error instanceof Error ? error.message : String(error)}`)
      })
    return () => {
      cancelled = true
    }
  }, [manifest])

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <h3>Asset Audit</h3>
        <p>Canonical manifest generated from the real source folder. Original assets stay read-only.</p>
      </div>
      <div className="audit-grid">
        {Object.entries(classCounts).map(([name, count]) => (
          <article key={name}>
            <strong>{count}</strong>
            <span>{slugLabel(name)}</span>
          </article>
        ))}
      </div>
      <div className="warning-list">
        {warnings.slice(0, 16).map((item) => (
          <p key={`${item.character}-${item.warning}`}>
            <strong>{item.character}</strong> {item.warning}
          </p>
        ))}
        {warnings.length === 0 ? <p>No source warnings found.</p> : null}
      </div>

      <div className="settings-card">
        <strong>Source alpha analysis</strong>
        <span>{sourceAnalysisStatus}</span>
        {sourceAnalysis ? (
          <code>
            {`alpha bounds: ${sourceAnalysis.alpha_bounds ? `${sourceAnalysis.alpha_bounds.x},${sourceAnalysis.alpha_bounds.y} ${sourceAnalysis.alpha_bounds.w}x${sourceAnalysis.alpha_bounds.h}` : 'none'}\nfloor: ${sourceAnalysis.floor_y ?? 'n/a'}\npivot: ${sourceAnalysis.pivot ? `${sourceAnalysis.pivot.x},${sourceAnalysis.pivot.y}` : 'n/a'}\nwarnings: ${sourceAnalysis.warnings.join('; ') || 'none'}`}
          </code>
        ) : null}
      </div>

      <div className="panel-heading audit-subheading">
        <div>
          <h3>LPC Intake</h3>
          <p>Inventory the local LPC generator assets, upstream reference metadata, and credit files before promoting any sheets into project content.</p>
        </div>
        <div className="audit-actions">
          <button
            className="primary"
            data-testid="run-lpc-inventory"
            onClick={() => void runLpcInventory()}
            disabled={!localToolsAvailable || lpcBusy}
          >
            {lpcBusy ? 'Scanning LPC assets...' : 'Build LPC inventory'}
          </button>
        </div>
      </div>

      <div data-testid="lpc-status" className={`settings-card ${lpcInventory ? '' : 'settings-card-warning'}`}>
        <strong>LPC status</strong>
        <span>{lpcStatus}</span>
        {lpcInventory ? (
          <code>
            {`root: ${lpcInventory.source.asset_root}\nupstream: ${lpcInventory.source.upstream_reference.commit ?? 'not cached'}\ncredits: ${lpcInventory.summary.credit_file_count} local file(s)`}
          </code>
        ) : null}
      </div>

      {lpcInventory ? (
        <>
          <div className="audit-grid duelyst-summary-grid">
            <article>
              <strong>{lpcInventory.summary.png_count}</strong>
              <span>local PNG sheets</span>
            </article>
            <article>
              <strong>{lpcInventory.summary.lpc_grid_count}</strong>
              <span>64x64 LPC grids</span>
            </article>
            <article>
              <strong>{lpcInventory.summary.non_lpc_grid_count}</strong>
              <span>non-standard grids</span>
            </article>
            <article>
              <strong>{lpcInventory.summary.credit_file_count}</strong>
              <span>credit/license files</span>
            </article>
            <article>
              <strong>{lpcInventory.source.upstream_reference.sheet_definition_count ?? 0}</strong>
              <span>upstream definitions</span>
            </article>
            <article>
              <strong>{lpcInventory.source.upstream_reference.spritesheet_png_count ?? 0}</strong>
              <span>upstream PNGs cached</span>
            </article>
          </div>
          <div className="settings-card">
            <strong>LPC categories</strong>
            <div className="part-meta">
              {lpcTopCategories.map(([category, count]) => <span key={category}>{category}: {count}</span>)}
            </div>
            <strong>Common frame grids</strong>
            <div className="part-meta">
              {lpcTopFrameGrids.map(([grid, count]) => <span key={grid}>{grid}: {count}</span>)}
            </div>
            <div className="audit-actions">
              <button data-testid="import-lpc-sheets" onClick={() => importLpcSheetsAsParts(12)}>Import first 12 sheets as parts</button>
              <span>{lpcImportStatus}</span>
            </div>
          </div>
        </>
      ) : null}

      <div className="panel-heading audit-subheading">
        <div>
          <h3>Duelyst Package Audit</h3>
          <p>Inspect the Unity package, preview cropped candidate frames, and stage the strongest humanoid sheets into the current workstation flow.</p>
        </div>
        <div className="audit-actions">
          <button
            data-testid="load-duelyst-private-manifest"
            onClick={() => void loadPrivateDuelystManifest()}
            disabled={duelystBusy}
          >
            Load private manifest
          </button>
          <button
            className="primary"
            data-testid="run-duelyst-audit"
            onClick={() => void runDuelystAudit()}
            disabled={!localToolsAvailable || duelystBusy}
          >
            {duelystBusy ? 'Working on Duelyst assets...' : 'Rebuild and stage 64'}
          </button>
          <button
            data-testid="create-duelyst-apes-jobs"
            onClick={() => createDuelystApesJobs(batchableDuelystCandidates.map((candidate) => candidate.stage_character_id))}
            disabled={batchableDuelystCandidates.length === 0}
          >
            Queue APES jobs ({batchableDuelystCandidates.length})
          </button>
        </div>
      </div>

      <div data-testid="duelyst-status" className={`settings-card ${duelystAudit && duelystAudit.staged_manifest.character_count > 0 ? '' : 'settings-card-warning'}`}>
        <strong>Duelyst status</strong>
        <span>{duelystStatus}</span>
        {duelystAudit ? <code>{duelystAudit.summary}\n{duelystAudit.findings.join('\n')}</code> : null}
      </div>

      {duelystAudit ? (
        <>
          <div className="audit-grid duelyst-summary-grid">
            <article>
              <strong>{duelystAudit.candidate_units.length}</strong>
              <span>candidate sheets</span>
            </article>
            <article>
              <strong>{duelystAudit.staged_manifest.character_count}</strong>
              <span>staged review frames</span>
            </article>
            <article>
              <strong>{duelystAudit.total_assets}</strong>
              <span>package entries</span>
            </article>
            {duelystExtensionCounts.map(([name, count]) => (
              <article key={name}>
                <strong>{count}</strong>
                <span>{name}</span>
              </article>
            ))}
          </div>

          <div className="duelyst-filter-bar">
            <label>
              <span>Search</span>
              <input
                data-testid="duelyst-search"
                type="search"
                value={duelystSearch}
                onChange={(event) => setDuelystSearch(event.target.value)}
                placeholder="unit, faction, role"
              />
            </label>
            <label>
              <span>Body</span>
              <select value={bodyFilter} onChange={(event) => setBodyFilter(event.target.value)}>
                <option value="all">All</option>
                {duelystFilterOptions.bodyClasses.map((value) => <option key={value} value={value}>{slugLabel(value)}</option>)}
              </select>
            </label>
            <label>
              <span>Source</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">All</option>
                {duelystFilterOptions.sourceFamilies.map((value) => <option key={value} value={value}>{slugLabel(value)}</option>)}
              </select>
            </label>
            <label>
              <span>Training</span>
              <select value={trainingFilter} onChange={(event) => setTrainingFilter(event.target.value)}>
                <option value="apes">APES review</option>
                <option value="all">All</option>
                {duelystFilterOptions.trainingRoles.map((value) => <option key={value} value={value}>{slugLabel(value)}</option>)}
              </select>
            </label>
            <label>
              <span>Stage</span>
              <select value={stagedFilter} onChange={(event) => setStagedFilter(event.target.value)}>
                <option value="staged">Staged</option>
                <option value="all">All</option>
                <option value="unstaged">Unstaged</option>
              </select>
            </label>
            <p>{filteredDuelystCandidates.length} shown · {batchableDuelystCandidates.length} queueable</p>
          </div>

          <div data-testid="duelyst-candidate-list" className="duelyst-candidate-list">
            {filteredDuelystCandidates.map((candidate) => (
              <article key={candidate.unit_id} className="duelyst-candidate">
                <img className="duelyst-preview" src={candidate.preview_url} alt={candidate.display_name} />
                <div className="duelyst-copy">
                  <div>
                    <strong>{candidate.display_name}</strong>
                    <p>
                      score {candidate.score} · sheet {candidate.sheet_size.width}x{candidate.sheet_size.height}
                      {candidate.estimated_frame_size ? ` · typical ${candidate.estimated_frame_size.width}x${candidate.estimated_frame_size.height}` : ''}
                    </p>
                  </div>
                  <p>{candidate.reasons.join(' · ')}</p>
                  <div className="part-meta">
                    {typeof candidate.labels?.body_class === 'string' ? <span>{candidate.labels.body_class}</span> : null}
                    {typeof candidate.labels?.source_family === 'string' ? <span>{candidate.labels.source_family}</span> : null}
                    {typeof candidate.labels?.training_role === 'string' ? <span>{candidate.labels.training_role}</span> : null}
                    <span>{candidate.animation_clip_count} clips</span>
                    <span>{candidate.controller_count} controllers</span>
                    <span>{candidate.animation_names.slice(0, 4).join(', ') || 'no animation names'}</span>
                    <span>{candidate.staged ? 'staged for workstation' : 'preview only'}</span>
                  </div>
                  {candidate.warnings.length > 0 ? (
                    <div className="warning-list compact-warning-list">
                      {candidate.warnings.map((warning) => (
                        <p key={`${candidate.unit_id}-${warning}`}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                  <div className="audit-actions">
                    {candidate.staged ? (
                      <button data-testid={`open-duelyst-stage-${candidate.stage_character_id}`} onClick={() => openDuelystStageCharacter(candidate.stage_character_id)}>Open in workstation</button>
                    ) : null}
                    <code>{candidate.sheet_source_path}</code>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}

function uniqueLabels(candidates: DuelystPackageCandidate[], key: string) {
  return Array.from(new Set(candidates.map((candidate) => getStringLabel(candidate, key)))).filter(Boolean).sort()
}

function getStringLabel(candidate: DuelystPackageCandidate, key: string) {
  const value = candidate.labels?.[key]
  return typeof value === 'string' ? value : 'unknown'
}
