import { useState } from 'react'
import { apesQaHarnessJobId } from '../appPersistence'
import { clampFrameInput } from '../inputUtils'
import { humanoid64Preset } from '../presets'
import type { AnimationName, ApesFinetuneManifest, ApesJob, ApesOutputInventory, ApesPreflightReport, CharacterManifest, Direction, DuelystApesJobBatch, ExtractedPart, PartLabel } from '../types'
import { downloadJson, getFrames, slugLabel } from '../utils'

type ApesLabPanelProps = {
  jobs: ApesJob[]
  createApesJob: () => void
  runApesPreflight: () => Promise<void>
  runApesJob: (jobId: string) => Promise<void>
  runPreparedDuelystJobs: () => Promise<void>
  summarizeApesOutputs: () => Promise<void>
  prepareApesFinetuneData: () => Promise<void>
  prepareDuelystApesJobs: () => Promise<void>
  importApesInventoryReport: (reportPath: string) => Promise<void>
  generateApesQaHarness: () => Promise<void>
  loadApesQaHarnessReport: () => Promise<void>
  clearApesQaHarnessParts: () => void
  selectedCharacter: CharacterManifest
  partLibrary: ExtractedPart[]
  apesAnimations: AnimationName[]
  apesDirections: Direction[]
  apesLabels: PartLabel[]
  apesFrameRange: [number, number]
  setApesFrameRange: (range: [number, number]) => void
  toggleApesAnimation: (name: AnimationName) => void
  toggleApesDirection: (name: Direction) => void
  toggleApesLabel: (name: PartLabel) => void
  importApesReport: (reportText: string, options?: { replaceQaHarnessExisting?: boolean; statusSource?: 'pasted-json' | 'file-import'; sourceLabel?: string }) => boolean
  apesPythonPath: string
  apesAllowPlaceholder: boolean
  apesBridgeBusy: boolean
  apesBridgeStatus: string
  apesPreflight: ApesPreflightReport | null
  apesOutputInventory: ApesOutputInventory | null
  apesFinetuneManifest: ApesFinetuneManifest | null
  duelystApesJobBatch: DuelystApesJobBatch | null
  apesHarnessGeneratedAt: string
  mainDirections: Direction[]
  apesCoreLabels: PartLabel[]
  localToolsAvailable: boolean
  generationStyleNotes: string
  setGenerationStyleNotes: (value: string) => void
  downloadGenerationManifest: () => void
}

export function ApesLabPanel({
  jobs,
  createApesJob,
  runApesPreflight,
  runApesJob,
  runPreparedDuelystJobs,
  summarizeApesOutputs,
  prepareApesFinetuneData,
  prepareDuelystApesJobs,
  importApesInventoryReport,
  generateApesQaHarness,
  loadApesQaHarnessReport,
  clearApesQaHarnessParts,
  selectedCharacter,
  partLibrary,
  apesAnimations,
  apesDirections,
  apesLabels,
  apesFrameRange,
  setApesFrameRange,
  toggleApesAnimation,
  toggleApesDirection,
  toggleApesLabel,
  importApesReport,
  apesPythonPath,
  apesAllowPlaceholder,
  apesBridgeBusy,
  apesBridgeStatus,
  apesPreflight,
  apesOutputInventory,
  apesFinetuneManifest,
  duelystApesJobBatch,
  apesHarnessGeneratedAt,
  mainDirections,
  apesCoreLabels,
  localToolsAvailable,
  generationStyleNotes,
  setGenerationStyleNotes,
  downloadGenerationManifest,
}: ApesLabPanelProps) {
  const [reportText, setReportText] = useState('')
  const apesParts = partLibrary.filter((part) => part.extraction_method === 'apes')
  const reviewedApesParts = apesParts.filter((part) => part.reviewed)
  const qaHarnessParts = apesParts.filter((part) => part.tags.includes('qa_harness') || part.part_id.startsWith(`${apesQaHarnessJobId}_`))
  const preparedDuelystJobs = jobs.filter((job) => job.character_id.startsWith('duelyst_') && job.status === 'prepared')
  const expectedInputCount = apesAnimations.reduce(
    (total, animation) =>
      total +
      apesDirections.reduce((directionTotal, direction) => {
        const [start, end] = apesFrameRange[0] <= apesFrameRange[1] ? apesFrameRange : [apesFrameRange[1], apesFrameRange[0]]
        return directionTotal + getFrames(selectedCharacter, animation, direction).filter((frame) => frame.index >= start && frame.index <= end).length
      }, 0),
    0,
  )
  const installedModules = apesPreflight ? Object.values(apesPreflight.modules).filter(Boolean).length : 0
  const totalModules = apesPreflight ? Object.keys(apesPreflight.modules).length : 0
  const envToolAvailable = Boolean(apesPreflight?.tools.conda || apesPreflight?.tools.mamba || apesPreflight?.tools.micromamba)
  const harnessLabel = apesHarnessGeneratedAt ? new Date(apesHarnessGeneratedAt).toLocaleString() : 'not generated in this browser yet'
  const finetuneDatasetCount = Object.keys(apesFinetuneManifest?.datasets ?? {}).length
  const finetuneCommandCount = Object.keys(apesFinetuneManifest?.commands ?? {}).length
  const duelystBatchQueuedCount = duelystApesJobBatch?.job_configs?.length ?? 0
  const preflightChecks = apesPreflight
    ? [
        { label: 'Python', value: apesPreflight.python.version, status: apesPreflight.python.version.startsWith('3.7') ? 'pass' : 'warn' },
        { label: 'Torch', value: apesPreflight.torch.installed ? `torch ${apesPreflight.torch.version ?? 'installed'}` : 'missing', status: apesPreflight.torch.installed ? 'pass' : 'warn' },
        { label: 'CUDA', value: apesPreflight.torch.cuda_available ? 'available' : 'unavailable', status: apesPreflight.torch.cuda_available ? 'pass' : 'warn' },
        { label: 'Modules', value: `${installedModules}/${totalModules} installed`, status: installedModules === totalModules ? 'pass' : 'warn' },
        { label: 'Dataset', value: apesPreflight.data.exists ? `${apesPreflight.data.character_count} chars` : 'missing', status: apesPreflight.data.exists && apesPreflight.data.character_count > 0 ? 'pass' : 'warn' },
        { label: 'Env tools', value: envToolAvailable ? 'available' : 'missing', status: envToolAvailable ? 'pass' : 'warn' },
        { label: 'nvidia-smi', value: apesPreflight.tools.nvidia_smi ? 'available' : 'missing', status: apesPreflight.tools.nvidia_smi ? 'pass' : 'warn' },
      ]
    : []

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <h3>APES Lab</h3>
        <p>APES is a first-class extraction workflow: create jobs, review logs, import masks, and convert outputs into editable parts.</p>
      </div>
      <div className="apes-summary">
        <article>
          <strong>Input</strong>
          <span>{selectedCharacter.character_id} / {apesAnimations.length} animation(s) / {apesDirections.length} direction(s)</span>
        </article>
        <article>
          <strong>Outputs</strong>
          <span>{apesLabels.map(slugLabel).join(', ') || 'select labels'}</span>
        </article>
        <article>
          <strong>Storage</strong>
          <span>data/apes/input and data/apes/output</span>
        </article>
        <article>
          <strong>Readiness</strong>
          <span>{selectedCharacter.source_quality_warnings.length === 0 ? 'source frames clean' : `${selectedCharacter.source_quality_warnings.length} source warning(s)`}</span>
        </article>
        <article>
          <strong>Library</strong>
          <span>{apesParts.length} APES part(s), {reviewedApesParts.length} reviewed</span>
        </article>
        <article>
          <strong>Job size</strong>
          <span>{expectedInputCount} frame reference(s), range {apesFrameRange[0]}-{apesFrameRange[1]}</span>
        </article>
        <article>
          <strong>Runtime</strong>
          <span>{localToolsAvailable ? (apesPreflight ? (apesPreflight.ready ? 'preflight passed' : 'preflight failed') : 'local server available') : 'local server unavailable'}</span>
        </article>
        <article>
          <strong>Interpreter</strong>
          <span>{apesPythonPath.trim() || 'local server default Python'}</span>
        </article>
        <article>
          <strong>Harness</strong>
          <span>{harnessLabel}</span>
        </article>
        <article>
          <strong>Harness parts</strong>
          <span>{qaHarnessParts.length} imported</span>
        </article>
        <article>
          <strong>Fine-tune prep</strong>
          <span>{apesFinetuneManifest ? `${finetuneDatasetCount} dataset section(s)` : 'not prepared in this browser yet'}</span>
        </article>
        <article>
          <strong>Duelyst batch</strong>
          <span>{duelystApesJobBatch ? `${duelystApesJobBatch.job_count} disk job(s), ${duelystBatchQueuedCount} loaded` : 'not prepared in this browser yet'}</span>
        </article>
      </div>

      <div className="apes-config">
        <fieldset>
          <legend>Animations</legend>
          {selectedCharacter.animation_names.map((name) => (
            <label key={name}>
              <input type="checkbox" checked={apesAnimations.includes(name)} onChange={() => toggleApesAnimation(name)} />
              <span>{slugLabel(name)}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Directions</legend>
          {mainDirections.map((name) => (
            <label key={name}>
              <input type="checkbox" checked={apesDirections.includes(name)} onChange={() => toggleApesDirection(name)} />
              <span>{name}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>APES labels</legend>
          {apesCoreLabels.map((name) => (
            <label key={name}>
              <input type="checkbox" checked={apesLabels.includes(name)} onChange={() => toggleApesLabel(name)} />
              <span>{slugLabel(name)}</span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Frame range</legend>
          <label>
            <span>Start</span>
            <input
              type="text"
              inputMode="numeric"
              value={apesFrameRange[0]}
              onChange={(event) => setApesFrameRange([clampFrameInput(event.target.value), apesFrameRange[1]])}
            />
          </label>
          <label>
            <span>End</span>
            <input
              type="text"
              inputMode="numeric"
              value={apesFrameRange[1]}
              onChange={(event) => setApesFrameRange([apesFrameRange[0], clampFrameInput(event.target.value)])}
            />
          </label>
        </fieldset>
      </div>
      <div className="status-strip">
        <button className="primary" data-testid="create-apes-job" onClick={createApesJob}>Create APES job</button>
        <button className="primary" data-testid="run-apes-preflight" onClick={() => void runApesPreflight()} disabled={apesBridgeBusy || !localToolsAvailable}>Run APES preflight</button>
        <button data-testid="run-prepared-duelyst-apes-jobs" onClick={() => void runPreparedDuelystJobs()} disabled={apesBridgeBusy || !localToolsAvailable || preparedDuelystJobs.length === 0}>
          Run Duelyst queue ({preparedDuelystJobs.length})
        </button>
        <button data-testid="prepare-apes-finetune" onClick={() => void prepareApesFinetuneData()} disabled={apesBridgeBusy || !localToolsAvailable}>Prepare fine-tune data</button>
        <button data-testid="prepare-duelyst-apes-jobs" onClick={() => void prepareDuelystApesJobs()} disabled={apesBridgeBusy || !localToolsAvailable}>Prepare Duelyst jobs</button>
        <button data-testid="summarize-apes-outputs" onClick={() => void summarizeApesOutputs()} disabled={apesBridgeBusy || !localToolsAvailable}>Inventory APES outputs</button>
        <button data-testid="generate-apes-qa-harness" onClick={() => void generateApesQaHarness()} disabled={apesBridgeBusy || !localToolsAvailable}>Generate local QA harness</button>
        <button data-testid="clear-apes-qa-harness-parts" onClick={clearApesQaHarnessParts} disabled={qaHarnessParts.length === 0}>Clear QA harness parts</button>
        <button data-testid="load-apes-qa-report" onClick={() => void loadApesQaHarnessReport()}>
          Load and replace QA sample report
        </button>
        <button
          data-testid="import-apes-report-json"
          onClick={() => {
            if (!reportText.trim()) return
            if (importApesReport(reportText, { statusSource: 'pasted-json' })) {
              setReportText('')
            }
          }}
          disabled={!reportText.trim()}
        >
          Import pasted JSON
        </button>
        <label className="file-import">
          <span>Import APES report JSON</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              file
                .text()
                .then((text) => {
                  importApesReport(text, { statusSource: 'file-import', sourceLabel: file.name })
                })
              event.currentTarget.value = ''
            }}
          />
        </label>
      </div>
      <div className="settings-card">
        <strong>Generation manifest</strong>
        <label className="field">
          <span>Style notes</span>
          <textarea data-testid="generation-style-notes" value={generationStyleNotes} onChange={(event) => setGenerationStyleNotes(event.target.value)} />
        </label>
        <button data-testid="download-generation-manifest" onClick={downloadGenerationManifest}>Download generation manifest</button>
      </div>
      <div data-testid="apes-bridge-status" className={`settings-card ${apesPreflight && !apesPreflight.ready ? 'settings-card-warning' : ''}`}>
        <strong>Bridge status</strong>
        <span>{apesBridgeStatus}</span>
        {apesPreflight ? <code>{apesPreflight.findings.length > 0 ? apesPreflight.findings.join('\n') : `Ready with ${apesPreflight.python.executable}`}</code> : null}
        {apesAllowPlaceholder ? <span>Placeholder fallback is enabled for this machine. Leave it off on the home GPU PC unless you are testing the UI only.</span> : null}
      </div>
      {(apesFinetuneManifest || duelystApesJobBatch) ? (
        <div className="settings-card" data-testid="apes-prep-artifacts">
          <strong>APES prep artifacts</strong>
          {apesFinetuneManifest ? (
            <span>
              Fine-tune manifest: {finetuneDatasetCount} dataset section(s), {finetuneCommandCount} command(s), {apesFinetuneManifest.warnings?.length ?? 0} warning(s)
            </span>
          ) : null}
          {duelystApesJobBatch ? (
            <span>
              Duelyst job batch: {duelystApesJobBatch.job_count} job(s), {duelystApesJobBatch.failure_count ?? 0} recorded failure(s), {duelystBatchQueuedCount} config(s) loaded into this browser
            </span>
          ) : null}
          {duelystApesJobBatch?.warnings?.length ? <code>{duelystApesJobBatch.warnings.join('\n')}</code> : null}
        </div>
      ) : null}
      {apesPreflight ? (
        <div className="apes-health-grid">
          {preflightChecks.map((item) => (
            <article key={item.label} className={item.status === 'pass' ? 'pass' : 'warn'}>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </article>
          ))}
        </div>
      ) : null}
      {apesOutputInventory ? (
        <div className="settings-card">
          <strong>APES output inventory</strong>
          <span>
            {apesOutputInventory.report_count} report(s), {apesOutputInventory.summary.needs_review} need review, {apesOutputInventory.summary.empty_reports} empty, {apesOutputInventory.summary.failed_outputs} failed
          </span>
          {apesOutputInventory.failed_outputs.length > 0 ? (
            <div className="job-list compact-list">
              {apesOutputInventory.failed_outputs.slice(0, 4).map((failure) => (
                <article key={failure.output_dir} className="job failed">
                  <div>
                    <strong>{failure.job_id}</strong>
                    <span>{failure.failure_kind}</span>
                  </div>
                  <p>{failure.logs.at(-1) || 'APES did not produce a report for this output.'}</p>
                </article>
              ))}
            </div>
          ) : null}
          <div className="job-list compact-list">
            {apesOutputInventory.reports.slice(0, 8).map((report) => (
              <article key={`${report.output_dir}-${report.report_path}`} className={`job ${report.needs_review ? 'prepared' : 'complete'}`}>
                <div>
                  <strong>{report.job_id}</strong>
                  <span>{report.review_state}</span>
                </div>
                <p>{report.mask_count} mask(s): {report.labels.join(', ') || 'no labels'}</p>
                {report.missing_labels.length > 0 ? <p>Missing {report.missing_labels.join(', ')}</p> : null}
                {report.low_confidence_labels.length > 0 ? <p>Low confidence {report.low_confidence_labels.join(', ')}</p> : null}
                <div className="job-actions">
                  <button onClick={() => void importApesInventoryReport(report.report_path)} disabled={apesBridgeBusy || report.mask_count === 0 || !localToolsAvailable}>
                    Import report
                  </button>
                </div>
              </article>
            ))}
          </div>
          {apesOutputInventory.reports.length > 8 ? <span>Showing first 8 reports. Use the JSON inventory for the full local list.</span> : null}
        </div>
      ) : null}
      <label className="field apes-import">
        <span>Paste APES report JSON</span>
        <textarea
          data-testid="apes-report-json-input"
          value={reportText}
          onChange={(event) => setReportText(event.target.value)}
          placeholder={JSON.stringify(
            {
              job_id: 'apes_example_job',
              masks: [
                {
                  label: 'head',
                  path: 'data/apes/output/apes_example_job/masks/head_mask.png',
                  bounds: { x: 18, y: 6, w: 28, h: 24 },
                  confidence: 0.94,
                  reviewed: false,
                  warnings: ['Hairline overlaps the hood edge on north-facing frames.'],
                },
              ],
              semantic_mapping: { head: 'head' },
              warnings: ['Review imported APES masks in the Art Workstation before final export.'],
            },
            null,
            2,
          )}
        />
      </label>
      <div className="job-list">
        {jobs.map((job) => (
          <article key={job.job_id} className={`job ${job.status}`}>
            <div>
              <strong>{job.job_id}</strong>
              <span>{job.status}</span>
            </div>
            <p>{job.animations.join(', ')} across {job.directions.join(', ')}</p>
            <p>{job.input_frames.length} input frame references prepared for APES.</p>
            {job.failure_details ? <p className="error-text">{job.failure_details}</p> : null}
            <div className="job-actions">
              <button onClick={() => downloadJson(`${job.job_id}.json`, job)}>Download job config</button>
              <button
                onClick={() =>
                  downloadJson(`${job.job_id}_expected_report.json`, {
                    job_id: job.job_id,
                    status: 'complete',
                    masks: job.output_labels.map((label) => ({
                      label,
                      path: `data/apes/output/${job.job_id}/masks/${label}_mask.png`,
                      bounds: humanoid64Preset[label],
                      confidence: 0,
                      reviewed: false,
                      warnings: [],
                    })),
                    semantic_mapping: {
                      head: 'head',
                      torso: 'torso',
                      left_arm: 'front_arm',
                      right_arm: 'back_arm',
                      left_leg: 'front_leg',
                      right_leg: 'back_leg',
                    },
                    warnings: ['Masks must be reviewed in the Art Workstation before final export.'],
                  })
                }
              >
                Download report template
              </button>
              <button className="primary" onClick={() => void runApesJob(job.job_id)} disabled={apesBridgeBusy || !localToolsAvailable}>Run local bridge</button>
            </div>
            {job.status === 'complete' ? (
              <p>{job.output_labels.length} APES mask records are now available in the Part Library for review.</p>
            ) : null}
          </article>
        ))}
        {jobs.length === 0 ? <p className="empty">No APES jobs yet. Create one from this screen or the top bar.</p> : null}
      </div>
    </section>
  )
}
