import { CompositeCanvas } from '../CompositeCanvas'
import { DirectionPreviewGrid } from '../DirectionPreviewGrid'
import type { BatchVariant } from '../appViewTypes'
import { defaultFilenameTemplate, renderExportFilenameTemplate } from '../filenameTemplates'
import type { AnimationName, CharacterManifest, Direction, ExtractedPart, KitbashRecipe } from '../types'
import { downloadJson, getFrames, slugLabel } from '../utils'

type ExportsPanelProps = {
  recipe: KitbashRecipe | null
  selectedCharacter: CharacterManifest
  characters: CharacterManifest[]
  partLibrary: ExtractedPart[]
  mainDirections: Direction[]
  currentAnimation: AnimationName
  currentDirection: Direction
  currentFrameIndex: number
  exportGeneric: () => void
  exportGodotScene: () => void
  exportSpriteFrames: () => Promise<void>
  exportUnityMetadata: () => void
  exportRpgMakerMetadata: () => void
  exportAsepriteReference: () => void
  exportCurrentSpriteSheet: () => void
  exportAnimationSheets: () => void
  exportRenderedFrameSet: () => Promise<void>
  exportFullPackageManifest: () => Promise<void>
  exportRenderedFrameSetZip: () => Promise<void>
  exportFullPackageZip: () => Promise<void>
  exportStatus: string
  batchVariants: BatchVariant[]
  filenameTemplate: string
  setFilenameTemplate: (value: string) => void
}

export function ExportsPanel({
  recipe,
  selectedCharacter,
  characters,
  partLibrary,
  mainDirections,
  currentAnimation,
  currentDirection,
  currentFrameIndex,
  exportGeneric,
  exportGodotScene,
  exportSpriteFrames,
  exportUnityMetadata,
  exportRpgMakerMetadata,
  exportAsepriteReference,
  exportCurrentSpriteSheet,
  exportAnimationSheets,
  exportRenderedFrameSet,
  exportFullPackageManifest,
  exportRenderedFrameSetZip,
  exportFullPackageZip,
  exportStatus,
  batchVariants,
  filenameTemplate,
  setFilenameTemplate,
}: ExportsPanelProps) {
  const directionCoverage = selectedCharacter.animation_names.flatMap((name) =>
    mainDirections.map((item) => getFrames(selectedCharacter, name, item).length > 0),
  )
  const validation = [
    { label: 'Manifest', value: selectedCharacter.animation_names.length > 0 ? 'pass' : 'reject' },
    { label: '4-direction frames', value: directionCoverage.every(Boolean) ? 'pass' : 'needs cleanup' },
    { label: 'APES parts', value: recipe?.layers.some((layer) => layer.extraction_method === 'apes') ? 'available' : 'optional' },
    { label: 'Godot target', value: recipe?.export_targets.includes('godot_4') ? 'pass' : 'defer' },
  ]
  const frameSummary = selectedCharacter.animation_names.flatMap((name) =>
    mainDirections.map((item) => ({
      label: `${slugLabel(name)} ${item}`,
      count: getFrames(selectedCharacter, name, item).length,
    })),
  )
  const filenamePreview = `${renderExportFilenameTemplate(filenameTemplate, {
    character: recipe?.character_id ?? selectedCharacter.character_id,
    animation: currentAnimation,
    direction: currentDirection,
    frame: String(currentFrameIndex).padStart(3, '0'),
    label: 'head',
  })}.png`

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <h3>Export System</h3>
        <p>Game-ready outputs with rendered PNGs, APES metadata, generic JSON, and Godot 4 resources.</p>
      </div>
      <div className="validation-grid">
        {validation.map((item) => (
          <article key={item.label} className={item.value === 'reject' || item.value === 'needs cleanup' ? 'warn' : 'pass'}>
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </article>
        ))}
      </div>
      <div className="export-grid">
        <button className="primary" data-testid="export-generic-manifest" onClick={exportGeneric}>Download generic manifest</button>
        <button className="primary" data-testid="export-full-package-manifest" onClick={() => void exportFullPackageManifest()}>Download full package manifest</button>
        <button data-testid="export-rendered-frame-set" onClick={() => void exportRenderedFrameSet()}>Download rendered frame set</button>
        <button className="primary" data-testid="export-full-package-zip" onClick={() => void exportFullPackageZip()}>Download full package zip</button>
        <button data-testid="export-rendered-frame-zip" onClick={() => void exportRenderedFrameSetZip()}>Download rendered frame zip</button>
        <button onClick={exportCurrentSpriteSheet}>Download current spritesheet</button>
        <button onClick={exportAnimationSheets}>Download current action sheets</button>
        <button onClick={exportGodotScene}>Download Godot scene</button>
        <button onClick={() => downloadJson(`${selectedCharacter.character_id}_batch_queue.json`, batchVariants)}>Download batch queue</button>
        <button onClick={() => void exportSpriteFrames()}>Download SpriteFrames resource</button>
        <button onClick={exportUnityMetadata}>Download Unity 2D metadata</button>
        <button onClick={exportRpgMakerMetadata}>Download RPG Maker MZ metadata</button>
        <button onClick={exportAsepriteReference}>Download Aseprite reference</button>
      </div>
      <div className="settings-card">
        <strong>Filename pattern</strong>
        <label className="field">
          <span>Template</span>
          <input
            data-testid="filename-template-input"
            value={filenameTemplate}
            onChange={(event) => setFilenameTemplate(event.target.value)}
            placeholder={defaultFilenameTemplate}
          />
        </label>
        <span>Preview: {filenamePreview}</span>
      </div>
      <div className="export-status-card">
        <strong>Package workflow</strong>
        <span>{exportStatus}</span>
        <span>Use the zip exports when you want actual PNG files plus engine metadata, and the JSON exports when you want one inspectable artifact.</span>
      </div>
      <DirectionPreviewGrid character={selectedCharacter} animation={currentAnimation} frameIndex={currentFrameIndex} directions={mainDirections} />
      {recipe ? (
        <section className="composite-preview-panel">
          <div>
            <strong>Composite export preview</strong>
            <span>{slugLabel(currentAnimation)} / {currentDirection} / frame {currentFrameIndex + 1}</span>
          </div>
          <CompositeCanvas
            recipe={recipe}
            characters={characters}
            partLibrary={partLibrary}
            animation={currentAnimation}
            direction={currentDirection}
            frameIndex={currentFrameIndex}
            scale={3}
            label={`composite ${currentAnimation} ${currentDirection} frame ${currentFrameIndex + 1}`}
          />
        </section>
      ) : null}
      <div className="frame-summary">
        <strong>Current sheet</strong>
        <span>{slugLabel(currentAnimation)} / {currentDirection} / {getFrames(selectedCharacter, currentAnimation, currentDirection).length} frames</span>
        {frameSummary.map((item) => (
          <span key={item.label}>{item.label}: {item.count}</span>
        ))}
      </div>
      <pre className="recipe-preview">{JSON.stringify(recipe, null, 2)}</pre>
    </section>
  )
}
