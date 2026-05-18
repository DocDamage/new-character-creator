import { useState } from 'react'
import { CompositeCanvas } from '../CompositeCanvas'
import { DirectionPreviewGrid } from '../DirectionPreviewGrid'
import type { BatchVariant } from '../appViewTypes'
import {
  exportTargetProfiles,
  getExportTargetProfile,
  type ExportTargetProfileId,
  type RecipeReadiness,
} from '../creatorCockpit'
import { defaultFilenameTemplate, renderExportFilenameTemplate } from '../filenameTemplates'
import { buildLpcSelectionCreditReadiness } from '../lpcCatalogPicker'
import type { AnimationName, CharacterManifest, Direction, ExtractedPart, KitbashRecipe } from '../types'
import type { LpcCatalog } from '../lpcCatalog'
import { ContextMenuArea, ContextMenuButton, DetailsDrawer, type DetailsRecord } from '../uiDisclosure'
import { downloadJson, getFrames, slugLabel } from '../utils'

type ExportsPanelProps = {
  recipe: KitbashRecipe | null
  selectedCharacter: CharacterManifest
  animationSourceCharacter: CharacterManifest
  characters: CharacterManifest[]
  partLibrary: ExtractedPart[]
  lpcCatalog: LpcCatalog | null
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
  exportCreditsReport: () => Promise<void>
  exportStatus: string
  batchVariants: BatchVariant[]
  filenameTemplate: string
  setFilenameTemplate: (value: string) => void
  exportTargetProfile: ExportTargetProfileId
  setExportTargetProfile: (value: ExportTargetProfileId) => void
  recipeReadiness: RecipeReadiness
  apesAllowPlaceholder: boolean
  generationReleaseBlockCount: number
  generationReleaseBlockSummary: string
}

type ExportActionRecord = {
  id: string
  label: string
  className?: string
  testId?: string
  run: () => void
  disabled?: boolean
  describedBy?: string
  artifact: string
  filenameContext: string
  profileContext?: string
}

export function ExportsPanel({
  recipe,
  selectedCharacter,
  animationSourceCharacter,
  characters,
  partLibrary,
  lpcCatalog,
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
  exportCreditsReport,
  exportStatus,
  batchVariants,
  filenameTemplate,
  setFilenameTemplate,
  exportTargetProfile,
  setExportTargetProfile,
  recipeReadiness,
  apesAllowPlaceholder,
  generationReleaseBlockCount,
  generationReleaseBlockSummary,
}: ExportsPanelProps) {
  const [detailsRecord, setDetailsRecord] = useState<DetailsRecord | null>(null)
  const directionCoverage = animationSourceCharacter.animation_names.flatMap((name) =>
    mainDirections.map((item) => getFrames(animationSourceCharacter, name, item).length > 0),
  )
  const validation = [
    { label: 'Manifest', value: animationSourceCharacter.animation_names.length > 0 ? 'pass' : 'reject' },
    { label: '4-direction frames', value: directionCoverage.every(Boolean) ? 'pass' : 'needs cleanup' },
    { label: 'APES parts', value: recipe?.layers.some((layer) => layer.extraction_method === 'apes') ? 'available' : 'optional' },
    { label: 'Godot target', value: recipe?.export_targets.includes('godot_4') ? 'pass' : 'defer' },
  ]
  const frameSummary = animationSourceCharacter.animation_names.flatMap((name) =>
    mainDirections.map((item) => ({
      label: `${slugLabel(name)} ${item}`,
      count: getFrames(animationSourceCharacter, name, item).length,
    })),
  )
  const filenamePreview = `${renderExportFilenameTemplate(filenameTemplate, {
    character: recipe?.character_id ?? selectedCharacter.character_id,
    animation: currentAnimation,
    direction: currentDirection,
    frame: String(currentFrameIndex).padStart(3, '0'),
    label: 'head',
  })}.png`
  const activeExportTarget = getExportTargetProfile(exportTargetProfile)
  const lpcCreditReadiness = lpcCatalog && recipe?.recipe_mode === 'lpc_character'
    ? buildLpcSelectionCreditReadiness(lpcCatalog, recipe.lpc_selections ?? {})
    : null
  const releaseExportBlocked = Boolean(lpcCreditReadiness?.release_blocking) || generationReleaseBlockCount > 0 || apesAllowPlaceholder
  const releaseBlockSummary = [
    apesAllowPlaceholder
      ? 'Turn off placeholder APES fallback before release export.'
      : '',
    lpcCreditReadiness?.release_blocking
      ? `Resolve ${lpcCreditReadiness.missing_count} missing and ${lpcCreditReadiness.needs_review_count} review-needed LPC credit item(s).`
      : '',
    generationReleaseBlockSummary,
  ].filter(Boolean).join(' ')

  function targetButtonClass(testId: string, baseClass = '') {
    return [baseClass, activeExportTarget.recommendedActionTestId === testId ? 'recommended-export' : '']
      .filter(Boolean)
      .join(' ')
  }

  function releaseButtonClass(testId: string, baseClass = '') {
    return [targetButtonClass(testId, baseClass), releaseExportBlocked ? 'blocked-export' : '']
      .filter(Boolean)
      .join(' ')
  }

  function showCreditDetails(item: NonNullable<typeof lpcCreditReadiness>['items'][number]) {
    setDetailsRecord({
      title: item.item_name,
      subtitle: `${item.item_id} / ${item.variant}`,
      fields: [
        { label: 'Status', value: item.status },
        { label: 'Type', value: item.type_name },
        { label: 'Authors', value: item.authors.join(', ') || 'missing' },
        { label: 'Licenses', value: item.licenses.join(', ') || 'missing' },
        { label: 'URLs', value: item.urls.join('\n') || 'missing' },
      ],
    })
  }

  function copyAttribution(item: NonNullable<typeof lpcCreditReadiness>['items'][number]) {
    const attribution = [
      item.item_name,
      item.variant,
      item.authors.length > 0 ? `by ${item.authors.join(', ')}` : 'author missing',
      item.licenses.length > 0 ? `license ${item.licenses.join(', ')}` : 'license missing',
      item.urls.join(' '),
    ].filter(Boolean).join(' - ')
    void navigator.clipboard?.writeText(attribution)
  }

  function showExportDetails(action: ExportActionRecord) {
    setDetailsRecord({
      title: action.label,
      subtitle: action.profileContext ?? activeExportTarget.label,
      fields: [
        { label: 'Target profile', value: `${activeExportTarget.label} (${activeExportTarget.id})` },
        { label: 'Readiness', value: recipeReadiness.state === 'ready' ? 'ready' : recipeReadiness.state.replace('_', ' ') },
        { label: 'Blocked', value: action.disabled ? releaseBlockSummary || 'This export is currently unavailable.' : 'no' },
        { label: 'Filename/template', value: action.filenameContext },
        { label: 'Artifact', value: action.artifact },
      ],
    })
  }

  function showPreviewDetails(kind: 'direction' | 'composite') {
    setDetailsRecord({
      title: kind === 'direction' ? 'All-direction export preview' : 'Composite export preview',
      subtitle: `${slugLabel(currentAnimation)} / ${currentDirection} / frame ${currentFrameIndex + 1}`,
      fields: [
        { label: 'Target profile', value: `${activeExportTarget.label} (${activeExportTarget.id})` },
        { label: 'Recipe', value: recipe ? `${recipe.character_id} / ${recipe.recipe_mode ?? 'unspecified mode'}` : 'none' },
        { label: 'Source character', value: `${animationSourceCharacter.display_name} (${animationSourceCharacter.character_id})` },
        { label: 'Directions', value: mainDirections.join(', ') },
        { label: 'Frame count', value: String(getFrames(animationSourceCharacter, currentAnimation, currentDirection).length) },
        { label: 'Filename preview', value: filenamePreview },
        { label: 'Readiness', value: recipeReadiness.state === 'ready' ? 'ready' : recipeReadiness.state.replace('_', ' ') },
        { label: 'Blocked', value: releaseExportBlocked ? releaseBlockSummary : 'no' },
      ],
    })
  }


  function renderExportAction(action: ExportActionRecord) {
    const actions = [
      {
        id: 'run-export',
        label: action.label,
        disabled: action.disabled,
        disabledReason: releaseBlockSummary || 'This export is currently unavailable.',
        onSelect: action.run,
      },
      {
        id: 'view-details',
        label: 'View details',
        onSelect: () => showExportDetails(action),
      },
    ]

    return (
      <ContextMenuArea key={action.id} label={`Actions for ${action.label}`} actions={actions} allowInteractiveTargetEvents>
        <button
          className={action.className}
          data-testid={action.testId}
          onClick={action.run}
          disabled={action.disabled}
          aria-describedby={action.describedBy}
        >
          {action.label}
        </button>
      </ContextMenuArea>
    )
  }

  const releaseExportDescription = releaseExportBlocked ? 'release-export-blocker' : undefined
  const exportActions: ExportActionRecord[] = [
    {
      id: 'generic-manifest',
      label: 'Download generic manifest',
      className: releaseButtonClass('export-generic-manifest', 'primary'),
      testId: 'export-generic-manifest',
      run: exportGeneric,
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: 'Generic JSON manifest for the current recipe.',
      filenameContext: `${recipe?.character_id ?? selectedCharacter.character_id}_manifest.json`,
    },
    {
      id: 'full-package-manifest',
      label: 'Download full package manifest',
      className: releaseButtonClass('export-full-package-manifest', 'primary'),
      testId: 'export-full-package-manifest',
      run: () => void exportFullPackageManifest(),
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: 'Full package JSON manifest with rendered outputs, reusable part folders, credits, and engine export metadata.',
      filenameContext: `${recipe?.character_id ?? selectedCharacter.character_id}_full_package_manifest.json; template ${filenameTemplate || defaultFilenameTemplate}`,
    },
    {
      id: 'rendered-frame-set',
      label: 'Download rendered frame set',
      className: releaseButtonClass('export-rendered-frame-set'),
      testId: 'export-rendered-frame-set',
      run: () => void exportRenderedFrameSet(),
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: 'Rendered frame set JSON with frame records, spritesheet records, and GIF preview records.',
      filenameContext: `${recipe?.character_id ?? selectedCharacter.character_id}_rendered_frame_set.json`,
    },
    {
      id: 'full-package-zip',
      label: 'Download full package zip',
      className: releaseButtonClass('export-full-package-zip', 'primary'),
      testId: 'export-full-package-zip',
      run: () => void exportFullPackageZip(),
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: 'ZIP package containing rendered PNGs, package and credits manifests, reusable parts, and engine export files.',
      filenameContext: `Package filenames use ${filenameTemplate || defaultFilenameTemplate} for rendered output records.`,
    },
    {
      id: 'rendered-frame-zip',
      label: 'Download rendered frame zip',
      className: releaseButtonClass('export-rendered-frame-zip'),
      testId: 'export-rendered-frame-zip',
      run: () => void exportRenderedFrameSetZip(),
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: 'ZIP package containing rendered frame PNGs and rendered spritesheet PNGs.',
      filenameContext: `Rendered filenames use ${filenameTemplate || defaultFilenameTemplate} where package metadata needs a template.`,
    },
    {
      id: 'current-spritesheet',
      label: 'Download current spritesheet',
      run: () => void exportCurrentSpriteSheet(),
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: `PNG spritesheet for ${slugLabel(currentAnimation)} / ${currentDirection}.`,
      filenameContext: `${recipe?.character_id ?? selectedCharacter.character_id}_${currentAnimation}_${currentDirection}_sheet.png`,
    },
    {
      id: 'current-action-sheets',
      label: 'Download current action sheets',
      run: () => void exportAnimationSheets(),
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: `PNG spritesheets for every available direction in ${slugLabel(currentAnimation)}.`,
      filenameContext: `${animationSourceCharacter.character_id}_${currentAnimation}_{direction}_sheet.png`,
    },
    {
      id: 'godot-scene',
      label: 'Download Godot scene',
      testId: 'export-godot-scene',
      run: () => void exportGodotScene(),
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: 'Godot 4 .tscn scene text for the current recipe.',
      filenameContext: `${recipe?.character_id ?? selectedCharacter.character_id}.tscn`,
      profileContext: 'Godot 4 scene export',
    },
    {
      id: 'batch-queue',
      label: 'Download batch queue',
      run: () => downloadJson(`${selectedCharacter.character_id}_batch_queue.json`, batchVariants),
      artifact: 'JSON batch queue containing the currently configured batch variants.',
      filenameContext: `${selectedCharacter.character_id}_batch_queue.json`,
    },
    {
      id: 'sprite-frames',
      label: 'Download SpriteFrames resource',
      testId: 'export-sprite-frames',
      run: () => void exportSpriteFrames(),
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: 'Godot SpriteFrames .tres resource referencing rendered frame PNG paths.',
      filenameContext: `${recipe?.character_id ?? selectedCharacter.character_id}_sprite_frames.tres`,
      profileContext: 'Godot 4 SpriteFrames export',
    },
    {
      id: 'unity-metadata',
      label: 'Download Unity 2D metadata',
      testId: 'export-unity-metadata',
      run: exportUnityMetadata,
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: 'Unity 2D JSON metadata for animation clips, frame tags, and sprite slicing context.',
      filenameContext: `${recipe?.character_id ?? selectedCharacter.character_id}_unity_2d.json`,
      profileContext: 'Unity 2D metadata export',
    },
    {
      id: 'rpg-maker-metadata',
      label: 'Download RPG Maker MZ metadata',
      className: releaseButtonClass('export-rpg-maker-metadata'),
      testId: 'export-rpg-maker-metadata',
      run: exportRpgMakerMetadata,
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: 'RPG Maker MZ JSON metadata for character sheet placement and animation mapping.',
      filenameContext: `${recipe?.character_id ?? selectedCharacter.character_id}_rpg_maker_mz.json`,
      profileContext: 'RPG Maker MZ metadata export',
    },
    {
      id: 'aseprite-reference',
      label: 'Download Aseprite reference',
      className: releaseButtonClass('export-aseprite-reference'),
      testId: 'export-aseprite-reference',
      run: exportAsepriteReference,
      disabled: releaseExportBlocked,
      describedBy: releaseExportDescription,
      artifact: 'Aseprite JSON reference with animation tags, layer references, and frame context.',
      filenameContext: `${recipe?.character_id ?? selectedCharacter.character_id}_aseprite_reference.json`,
      profileContext: 'Aseprite reference export',
    },
    {
      id: 'credits-report',
      label: 'Download credits report',
      testId: 'export-credits-report',
      run: () => void exportCreditsReport(),
      artifact: 'Credits report JSON summarizing selected parts, LPC catalog credits, missing credits, and release notes.',
      filenameContext: `${selectedCharacter.character_id}_credits_report.json`,
    },
  ]

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
      <section className="export-target-panel" aria-label="Export target profile">
        <label className="field">
          <span>Export target</span>
          <select
            data-testid="exports-target-profile"
            value={exportTargetProfile}
            onChange={(event) => setExportTargetProfile(event.target.value as ExportTargetProfileId)}
          >
            {exportTargetProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
        </label>
        <div>
          <strong>{activeExportTarget.label}</strong>
          <span>{activeExportTarget.hint}</span>
          <span>{activeExportTarget.lpcExportProfile === 'oversize' ? 'LPC catalog draw records use oversize geometry; standard engine sheets remain 64x64 unless the downstream pipeline reads the catalog geometry metadata.' : 'LPC catalog draw records use the standard 64x64 profile.'}</span>
          <span>{recipeReadiness.state === 'ready' ? 'Recipe readiness is clean.' : `Recipe readiness is ${recipeReadiness.state.replace('_', ' ')}.`}</span>
        </div>
      </section>
      <div className="export-grid">
        {exportActions.map(renderExportAction)}
      </div>
      <div className={`settings-card ${releaseExportBlocked ? 'settings-card-warning' : ''}`} data-testid="export-lpc-credit-readiness">
        <strong>LPC credit readiness</strong>
        {lpcCreditReadiness ? (
          <>
            <span>
              {lpcCreditReadiness.selected_count} selected upstream item(s), {lpcCreditReadiness.ok_count} ready, {lpcCreditReadiness.needs_review_count} need review, {lpcCreditReadiness.missing_count} missing credits.
            </span>
            {releaseExportBlocked ? <span id="release-export-blocker">{releaseBlockSummary} {lpcCreditReadiness?.release_blocking ? 'Download the credits report for the unresolved item list.' : ''}</span> : null}
            {lpcCreditReadiness.items.length > 0 ? (
              <div className="credit-readiness-list">
                {lpcCreditReadiness.items.map((item) => {
                  const actions = [
                    {
                      id: 'view-credits',
                      label: 'View credits',
                      onSelect: () => showCreditDetails(item),
                    },
                    {
                      id: 'copy-attribution',
                      label: 'Copy attribution',
                      disabled: item.authors.length === 0 || item.licenses.length === 0,
                      disabledReason: 'Attribution needs authors and licenses first.',
                      onSelect: () => copyAttribution(item),
                    },
                  ]
                  return (
                    <ContextMenuArea key={`${item.item_id}-${item.variant}`} label={`Actions for ${item.item_name} credits`} actions={actions}>
                      <article className={`credit-readiness-item ${item.status}`}>
                        <div>
                          <strong>{item.item_name}</strong>
                          <span>{item.variant}: {item.status}</span>
                        </div>
                        <ContextMenuButton label={`More actions for ${item.item_name} credits`} actions={actions} />
                      </article>
                    </ContextMenuArea>
                  )
                })}
              </div>
            ) : (
              <span>No catalog-backed LPC selections are enabled for this recipe.</span>
            )}
          </>
        ) : (
          <span>Catalog-backed LPC selections will report selected upstream credits here.</span>
        )}
        {!lpcCreditReadiness && releaseExportBlocked ? <span id="release-export-blocker">{releaseBlockSummary}</span> : null}
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
      <ContextMenuArea
        label="Actions for all-direction export preview"
        actions={[{ id: 'view-details', label: 'View details', onSelect: () => showPreviewDetails('direction') }]}
      >
        <DirectionPreviewGrid character={animationSourceCharacter} animation={currentAnimation} frameIndex={currentFrameIndex} directions={mainDirections} />
      </ContextMenuArea>
      {recipe ? (
        <ContextMenuArea
          label="Actions for composite export preview"
          actions={[{ id: 'view-details', label: 'View details', onSelect: () => showPreviewDetails('composite') }]}
        >
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
              lpcCatalog={lpcCatalog}
              exportTargetProfile={exportTargetProfile}
              scale={3}
              label={`composite ${currentAnimation} ${currentDirection} frame ${currentFrameIndex + 1}`}
            />
          </section>
        </ContextMenuArea>
      ) : null}
      <div className="frame-summary">
        <strong>Current sheet</strong>
        <span>{slugLabel(currentAnimation)} / {currentDirection} / {getFrames(animationSourceCharacter, currentAnimation, currentDirection).length} frames</span>
        {frameSummary.map((item) => (
          <span key={item.label}>{item.label}: {item.count}</span>
        ))}
      </div>
      <pre className="recipe-preview">{JSON.stringify(recipe, null, 2)}</pre>
      <DetailsDrawer record={detailsRecord} onClose={() => setDetailsRecord(null)} />
    </section>
  )
}
