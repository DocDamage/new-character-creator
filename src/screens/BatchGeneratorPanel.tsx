import { CompositeCanvas } from '../CompositeCanvas'
import type { BatchVariant } from '../appViewTypes'
import type { AnimationName, CharacterManifest, Direction, ExtractedPart, VariationPreset } from '../types'
import { downloadJson, slugLabel } from '../utils'

type BatchGeneratorPanelProps = {
  batchSeed: string
  setBatchSeed: (seed: string) => void
  batchCount: number
  setBatchCount: (count: number) => void
  batchVariants: BatchVariant[]
  characters: CharacterManifest[]
  partLibrary: ExtractedPart[]
  currentAnimation: AnimationName
  currentDirection: Direction
  currentFrameIndex: number
  variationPresets: VariationPreset[]
  activeVariationPresetId: string
  setActiveVariationPresetId: (presetId: string) => void
  saveVariationPreset: () => void
}

export function BatchGeneratorPanel({
  batchSeed,
  setBatchSeed,
  batchCount,
  setBatchCount,
  batchVariants,
  characters,
  partLibrary,
  currentAnimation,
  currentDirection,
  currentFrameIndex,
  variationPresets,
  activeVariationPresetId,
  setActiveVariationPresetId,
  saveVariationPreset,
}: BatchGeneratorPanelProps) {
  const reviewedParts = partLibrary.filter((part) => part.reviewed)
  const reviewedApesParts = reviewedParts.filter((part) => part.extraction_method === 'apes')
  const libraryBackedPartCount = batchVariants.reduce(
    (total, variant) => total + variant.parts.filter((part) => part.source_part_id).length,
    0,
  )

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <h3>Batch Generator</h3>
        <p>Deterministic variants from APES-approved limbs, preset regions, connected masks, palettes, and tags.</p>
      </div>
      <div className="batch-controls">
        <label className="field">
          <span>Seed</span>
          <input value={batchSeed} onChange={(event) => setBatchSeed(event.target.value)} />
        </label>
        <label className="field">
          <span>Export count</span>
          <input min={1} max={32} type="number" value={batchCount} onChange={(event) => setBatchCount(Number(event.target.value))} />
        </label>
        <label className="field">
          <span>Variation preset</span>
          <select data-testid="variation-preset-select" value={activeVariationPresetId} onChange={(event) => setActiveVariationPresetId(event.target.value)}>
            <option value="">seeded library mix</option>
            {variationPresets.map((preset) => (
              <option key={preset.preset_id} value={preset.preset_id}>{preset.name}</option>
            ))}
          </select>
        </label>
        <button data-testid="save-variation-preset" onClick={saveVariationPreset}>Save current as preset</button>
      </div>
      <div className="validation-grid">
        <article className={reviewedApesParts.length > 0 ? 'pass' : 'warn'}>
          <strong>{reviewedApesParts.length}</strong>
          <span>reviewed APES parts</span>
        </article>
        <article className={reviewedParts.length > 0 ? 'pass' : 'warn'}>
          <strong>{reviewedParts.length}</strong>
          <span>approved library pool</span>
        </article>
        <article className={libraryBackedPartCount > 0 ? 'pass' : 'warn'}>
          <strong>{libraryBackedPartCount}</strong>
          <span>library picks in queue</span>
        </article>
        <article className={variationPresets.length > 0 ? 'pass' : 'warn'}>
          <strong>{variationPresets.length}</strong>
          <span>saved variation presets</span>
        </article>
      </div>
      <div className="status-strip">
        <button
          onClick={() =>
            downloadJson('pixel_creator_batch_package_manifest.json', {
              exported_at: new Date().toISOString(),
              seed: batchSeed,
              count: batchVariants.length,
              variants: batchVariants.map((variant) => ({
                id: variant.id,
                base: variant.base,
                palette: variant.palette,
                recipe: variant.recipe,
                validation: {
                  has_library_parts: variant.parts.some((part) => part.source_part_id),
                  apes_part_count: variant.parts.filter((part) => part.method === 'apes').length,
                  deterministic_seed: batchSeed,
                },
              })),
            })
          }
          disabled={batchVariants.length === 0}
        >
          Download batch package manifest
        </button>
      </div>
      <div className="variant-list">
        {batchVariants.map((variant) => (
          <article key={variant.id}>
            <strong>{variant.id}</strong>
            <span>{variant.base}</span>
            <span>{slugLabel(variant.palette)}</span>
            <CompositeCanvas
              recipe={variant.recipe}
              characters={characters}
              partLibrary={partLibrary}
              animation={currentAnimation}
              direction={currentDirection}
              frameIndex={currentFrameIndex}
              scale={2}
              label={variant.id}
            />
            <small>
              {variant.parts.filter((part) => part.method === 'apes').length} APES parts / {variant.parts.filter((part) => part.source_part_id).length} approved picks
            </small>
          </article>
        ))}
      </div>
    </section>
  )
}
