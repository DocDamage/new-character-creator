import type { AssetManifest, DuelystPackageAudit } from '../types'
import { slugLabel } from '../utils'

type AssetAuditPanelProps = {
  manifest: AssetManifest
  classCounts: Record<string, number>
  duelystAudit: DuelystPackageAudit | null
  duelystBusy: boolean
  duelystStatus: string
  runDuelystAudit: () => Promise<void>
  loadPrivateDuelystManifest: () => Promise<void>
  openDuelystStageCharacter: (characterId: string) => void
}

export function AssetAuditPanel({
  manifest,
  classCounts,
  duelystAudit,
  duelystBusy,
  duelystStatus,
  runDuelystAudit,
  loadPrivateDuelystManifest,
  openDuelystStageCharacter,
}: AssetAuditPanelProps) {
  const warnings = manifest.characters.flatMap((character) => character.source_quality_warnings.map((warning) => ({ character: character.character_id, warning })))
  const duelystExtensionCounts = duelystAudit
    ? Object.entries(duelystAudit.extension_counts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 6)
    : []

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
            disabled={!import.meta.env.DEV || duelystBusy}
          >
            {duelystBusy ? 'Working on Duelyst assets...' : 'Rebuild and stage 64'}
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

          <div data-testid="duelyst-candidate-list" className="duelyst-candidate-list">
            {duelystAudit.candidate_units.map((candidate) => (
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
