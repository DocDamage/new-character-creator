import { MaskEditor } from '../MaskEditor'
import { extractionModes, partLabels } from '../presets'
import type { ExtractedPart, ExtractionMethod, PartLabel, Rect } from '../types'
import type { ManualMaskSaveRequest } from '../appViewTypes'
import { slugLabel } from '../utils'

type WorkstationPanelProps = {
  selectedRegion: PartLabel
  setSelectedRegion: (label: PartLabel) => void
  regions: Record<PartLabel, Rect>
  updateRegion: (key: keyof Rect, value: number) => void
  extractionMethod: ExtractionMethod
  setExtractionMethod: (method: ExtractionMethod) => void
  extractCurrentRegion: () => void
  extractionHistory: string[]
  connectedSeed?: { x: number; y: number }
  setConnectedSeed: (seed: { x: number; y: number } | undefined) => void
  parts: ExtractedPart[]
  sourceFramePath?: string
  saveEditedMask: (request: ManualMaskSaveRequest) => void
}

export function WorkstationPanel({
  selectedRegion,
  setSelectedRegion,
  regions,
  updateRegion,
  extractionMethod,
  setExtractionMethod,
  extractCurrentRegion,
  extractionHistory,
  connectedSeed,
  setConnectedSeed,
  parts,
  sourceFramePath,
  saveEditedMask,
}: WorkstationPanelProps) {
  const region = regions[selectedRegion]

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <h3>Art Workstation</h3>
        <p>Compare APES, preset, connected-pixel, and manual masks on the same 64x64 source frame.</p>
      </div>
      <div className="workstation-grid">
        <div className="tool-bank">
          {extractionModes.map((mode) => (
            <button key={mode.id} className={extractionMethod === mode.id ? 'active' : ''} onClick={() => setExtractionMethod(mode.id)}>
              <strong>{mode.name}</strong>
              <span>{mode.description}</span>
            </button>
          ))}
        </div>
        <div className="region-editor">
          <label className="field">
            <span>Region</span>
            <select value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value as PartLabel)}>
              {partLabels.map((label) => (
                <option key={label} value={label}>
                  {slugLabel(label)}
                </option>
              ))}
            </select>
          </label>
          {(['x', 'y', 'w', 'h'] as Array<keyof Rect>).map((key) => (
            <label key={key} className="field slider-field">
              <span>{key.toUpperCase()}: {region[key]}</span>
              <input min={0} max={64} type="range" value={region[key]} onChange={(event) => updateRegion(key, Number(event.target.value))} />
            </label>
          ))}
        </div>
        <div className="tool-list">
          <div className="history-list">
            <strong>{extractionMethod === 'manual' ? 'Manual cleanup is active' : `${slugLabel(extractionMethod)} extraction is active`}</strong>
            <span>
              {extractionMethod === 'manual'
                ? 'Use the editor to paint, fill, grow, shrink, mirror, nudge, and save a reviewed manual part.'
                : 'Extract a source crop first, then switch to manual cleanup when you need to refine a saved mask.'}
            </span>
          </div>
          <button className="primary" data-testid="extract-current-region" onClick={extractCurrentRegion}>Extract PNG + mask</button>
          <div className="seed-panel">
            <strong>Connected seed</strong>
            <span>{connectedSeed ? `x ${connectedSeed.x}, y ${connectedSeed.y}` : 'Click the canvas in connected-pixel mode.'}</span>
            <button onClick={() => setConnectedSeed(undefined)}>Clear seed</button>
          </div>
          <div className="history-list">
            {extractionHistory.map((item) => (
              <span key={item}>{item}</span>
            ))}
            {extractionHistory.length === 0 ? <span>No local extractions yet.</span> : null}
          </div>
        </div>
        <MaskEditor parts={parts} selectedRegion={selectedRegion} region={region} sourceFramePath={sourceFramePath} onSaveMask={saveEditedMask} />
      </div>
    </section>
  )
}