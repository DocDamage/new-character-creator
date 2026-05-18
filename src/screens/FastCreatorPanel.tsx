import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { CompositeCanvas } from '../CompositeCanvas'
import { DirectionPreviewGrid } from '../DirectionPreviewGrid'
import type { SavedComposerRecipe } from '../appPersistence'
import {
  exportTargetProfiles,
  filterReviewedPartsForLayer,
  getExportTargetProfile,
  type ExportTargetProfileId,
  type RecipeReadiness,
} from '../creatorCockpit'
import { clampOffsetInput, clampSignedInput, clampUnsignedInput } from '../inputUtils'
import { canUseLpcPartForAnimation, isLpcMannequin, isLpcPartSourceForLayer, isPartCompatibleWithMannequin } from '../lpcPartCompatibility'
import { buildLpcCatalogPickerOptions, buildLpcSelectionCreditReadiness } from '../lpcCatalogPicker'
import { layerOrder, palettePresets } from '../presets'
import type { AnimationName, CharacterManifest, ComposerLayerSettings, Direction, ExtractedPart, KitbashRecipe, PaletteRules, PartLabel, RecipeModeId } from '../types'
import type { LpcCatalog, LpcRecipeSelection } from '../lpcCatalog'
import { ContextMenuArea, ContextMenuButton, DetailsDrawer, Tooltip, type DetailsRecord } from '../uiDisclosure'
import { slugLabel } from '../utils'

type FastCreatorPanelProps = {
  selectedCharacter: CharacterManifest
  animationSourceCharacter: CharacterManifest
  characters: CharacterManifest[]
  selectedParts: Record<PartLabel, string>
  setSelectedParts: Dispatch<SetStateAction<Record<PartLabel, string>>>
  selectedPartIds: Partial<Record<PartLabel, string>>
  setSelectedPartIds: Dispatch<SetStateAction<Partial<Record<PartLabel, string>>>>
  layerSettings: Partial<Record<PartLabel, ComposerLayerSettings>>
  updateLayerSetting: (label: PartLabel, patch: Partial<ComposerLayerSettings>) => void
  partLibrary: ExtractedPart[]
  activePartLabel: PartLabel
  setActivePartLabel: (label: PartLabel) => void
  recipeId: string
  recipeName: string
  setRecipeName: (name: string) => void
  savedRecipes: SavedComposerRecipe[]
  saveCurrentRecipe: () => void
  loadSavedRecipe: (recipeId: string) => void
  startNewRecipe: () => void
  currentAnimation: AnimationName
  currentDirection: Direction
  currentFrameIndex: number
  recipe: KitbashRecipe | null
  palette: string
  setPalette: (palette: string) => void
  paletteRules: Omit<PaletteRules, 'team_color'>
  updatePaletteRules: (patch: Partial<Omit<PaletteRules, 'team_color'>>) => void
  mainDirections: Direction[]
  recipeReadiness: RecipeReadiness
  exportTargetProfile: ExportTargetProfileId
  setExportTargetProfile: (value: ExportTargetProfileId) => void
  openPartReview: () => void
  openBatchGenerator: () => void
  openExports: () => void
  openSettingsRepair: () => void
  createApesJob: () => void
  localToolsAvailable: boolean
  recipeMode: RecipeModeId
  setRecipeMode: (mode: RecipeModeId) => void
  lpcCatalog: LpcCatalog | null
  lpcSelections: Record<string, LpcRecipeSelection>
  setLpcSelections: Dispatch<SetStateAction<Record<string, LpcRecipeSelection>>>
}

function partMatchesActiveFilter(
  part: ExtractedPart,
  label: PartLabel,
  query: string,
  method: ExtractedPart['extraction_method'] | 'all',
) {
  if (part.label !== label) return false
  if (method !== 'all' && part.extraction_method !== method) return false
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  const searchable = [
    part.part_id,
    part.character_id,
    part.extraction_method,
    ...part.tags,
    ...part.warnings,
  ].join(' ').toLowerCase()
  return searchable.includes(normalizedQuery)
}

function inferLpcBodyType(character: CharacterManifest) {
  const bodyLabel = [character.display_name, String(character.labels?.lpc_path ?? '')].join(' ').toLowerCase()
  if (bodyLabel.includes('female') || bodyLabel.includes('feminine') || bodyLabel.includes('woman')) return 'female'
  if (bodyLabel.includes('muscular')) return 'muscular'
  if (bodyLabel.includes('pregnant')) return 'pregnant'
  if (bodyLabel.includes('teen')) return 'teen'
  if (bodyLabel.includes('child')) return 'child'
  return 'male'
}

const recipeModeHints: Record<RecipeModeId, string> = {
  lpc_character: 'Universal LPC bodies, catalog parts, and LPC-compatible custom parts',
  sprite_kitbash: 'Use sprite-pack bodies and reviewed extracted parts',
  duelyst_review: 'Review staged Duelyst frames and prepare APES jobs',
}

export function FastCreatorPanel({
  selectedCharacter,
  animationSourceCharacter,
  characters,
  selectedParts,
  setSelectedParts,
  selectedPartIds,
  setSelectedPartIds,
  layerSettings,
  updateLayerSetting,
  partLibrary,
  activePartLabel,
  setActivePartLabel,
  recipeId,
  recipeName,
  setRecipeName,
  savedRecipes,
  saveCurrentRecipe,
  loadSavedRecipe,
  startNewRecipe,
  currentAnimation,
  currentDirection,
  currentFrameIndex,
  recipe,
  palette,
  setPalette,
  paletteRules,
  updatePaletteRules,
  mainDirections,
  recipeReadiness,
  exportTargetProfile,
  setExportTargetProfile,
  openPartReview,
  openBatchGenerator,
  openExports,
  openSettingsRepair,
  createApesJob,
  localToolsAvailable,
  recipeMode,
  setRecipeMode,
  lpcCatalog,
  lpcSelections,
  setLpcSelections,
}: FastCreatorPanelProps) {
  const reviewedParts = partLibrary.filter((part) => part.reviewed && isPartCompatibleWithMannequin(part, selectedCharacter))
  const [partSearch, setPartSearch] = useState('')
  const [lpcCatalogSearch, setLpcCatalogSearch] = useState('')
  const [partMethodFilter, setPartMethodFilter] = useState<ExtractedPart['extraction_method'] | 'all'>('all')
  const [detailsRecord, setDetailsRecord] = useState<DetailsRecord | null>(null)
  const activeExportTarget = getExportTargetProfile(exportTargetProfile)
  const lpcBodyType = inferLpcBodyType(selectedCharacter)
  const lpcCatalogOptions = useMemo(
    () => lpcCatalog && recipeMode === 'lpc_character'
      ? buildLpcCatalogPickerOptions({
          catalog: lpcCatalog,
          slotId: activePartLabel,
          selections: lpcSelections,
          bodyType: lpcBodyType,
          animation: currentAnimation,
          query: lpcCatalogSearch,
        }).slice(0, 160)
      : [],
    [activePartLabel, currentAnimation, lpcBodyType, lpcCatalog, lpcCatalogSearch, lpcSelections, recipeMode],
  )
  const activeLpcSelection = lpcSelections[activePartLabel]
  const activeLpcItem = activeLpcSelection && lpcCatalog ? lpcCatalog.items[activeLpcSelection.item_id] : undefined
  const activeLpcOption = activeLpcSelection
    ? lpcCatalogOptions.find((option) => option.item_id === activeLpcSelection.item_id)
    : undefined
  const activeLpcWarnings = activeExportTarget.lpcExportProfile === 'oversize'
    ? (activeLpcOption?.warnings ?? []).filter((warning) => !/oversize export profile/i.test(warning))
    : (activeLpcOption?.warnings ?? [])
  const activeLpcStatus = activeLpcSelection && activeLpcItem
    ? activeExportTarget.lpcExportProfile === 'oversize'
      ? 'Oversize enabled for catalog draw records.'
      : activeLpcWarnings.length > 0
        ? 'Standard 64x64 profile needs review.'
        : 'Standard 64x64 profile ready.'
    : ''
  const lpcCreditReadiness = useMemo(
    () => lpcCatalog ? buildLpcSelectionCreditReadiness(lpcCatalog, lpcSelections) : null,
    [lpcCatalog, lpcSelections],
  )
  const availableMethods = useMemo(
    () => Array.from(new Set(reviewedParts.map((part) => part.extraction_method))).sort(),
    [reviewedParts],
  )
  const selectedReviewedParts = layerOrder
    .map((label) => reviewedParts.find((part) => part.part_id === selectedPartIds[label]))
    .filter(Boolean)
  const reviewedPartsForActiveLabel = reviewedParts.filter((part) => part.label === activePartLabel)
  const selectedActivePart = selectedPartIds[activePartLabel]
  const lpcPartsForActiveLabel = useMemo(
    () => recipeMode === 'lpc_character' && isLpcMannequin(selectedCharacter) ? characters
      .filter((character) => isLpcPartSourceForLayer(character, activePartLabel))
      .filter((character) => canUseLpcPartForAnimation(character, activePartLabel, currentAnimation))
      .sort((left, right) => left.display_name.localeCompare(right.display_name))
      .slice(0, 180) : [],
    [activePartLabel, characters, currentAnimation, recipeMode, selectedCharacter],
  )
  const selectedActiveSource = selectedParts[activePartLabel]
  const selectedActiveSourceCharacter = selectedActiveSource
    ? characters.find((character) => character.character_id === selectedActiveSource)
    : undefined
  const activePickerValue = selectedActivePart
    ? `library:${selectedActivePart}`
    : selectedActiveSource &&
        selectedActiveSourceCharacter &&
        isLpcPartSourceForLayer(selectedActiveSourceCharacter, activePartLabel) &&
        canUseLpcPartForAnimation(selectedActiveSourceCharacter, activePartLabel, currentAnimation)
      ? `source:${selectedActiveSource}`
      : ''

  function selectActivePart(value: string) {
    const [kind, id] = value.split(':', 2)
    setSelectedPartIds((current) => {
      const next = { ...current }
      if (kind === 'library' && id) {
        next[activePartLabel] = id
      } else {
        delete next[activePartLabel]
      }
      return next
    })
    setSelectedParts((current) => {
      const next = { ...current }
      if (kind === 'source' && id) {
        next[activePartLabel] = id
      } else if (!value) {
        delete next[activePartLabel]
      }
      return next
    })
  }

  function selectLpcCatalogItem(itemId: string) {
    setLpcSelections((current) => {
      const next = { ...current }
      if (!itemId || !lpcCatalog) {
        delete next[activePartLabel]
        return next
      }
      const item = lpcCatalog.items[itemId]
      if (!item) return current
      next[activePartLabel] = {
        slot_id: activePartLabel,
        item_id: item.item_id,
        variant: item.variants[0] ?? '',
        type_name: item.type_name,
        enabled: true,
      }
      return next
    })
  }

  function updateActiveLpcSelection(patch: Partial<LpcRecipeSelection>) {
    setLpcSelections((current) => {
      const existing = current[activePartLabel]
      if (!existing) return current
      return {
        ...current,
        [activePartLabel]: { ...existing, ...patch },
      }
    })
  }

  function setLayerSelectedPart(label: PartLabel, partId: string) {
    setSelectedPartIds((current) => ({
      ...current,
      [label]: partId || undefined,
    }))
  }

  function clearLayerSelection(label: PartLabel) {
    setSelectedPartIds((current) => {
      const next = { ...current }
      delete next[label]
      return next
    })
    setSelectedParts((current) => {
      const next = { ...current }
      delete next[label]
      return next
    })
  }

  function showLayerDetails(label: PartLabel) {
    const selectedPartId = selectedPartIds[label]
    const selectedPart = selectedPartId ? partLibrary.find((part) => part.part_id === selectedPartId) : undefined
    const sourceCharacterId = selectedParts[label] ?? selectedCharacter.character_id
    const sourceCharacter = characters.find((character) => character.character_id === sourceCharacterId)
    const lpcSelection = lpcSelections[label]
    const lpcItem = lpcSelection && lpcCatalog ? lpcCatalog.items[lpcSelection.item_id] : undefined
    const settings = layerSettings[label] ?? { offset: [0, 0], visible: true, locked: false }
    const selectedPartAnimations = selectedPart?.compatibility?.animations ?? []
    const selectedPartDirections = selectedPart?.compatibility?.directions ?? []
    const selectedPartWarnings = selectedPart?.warnings ?? []
    const sourceWarnings = sourceCharacter?.source_quality_warnings ?? []
    const lpcCreditCount = lpcItem?.credits?.length ?? 0
    const warnings = [
      ...selectedPartWarnings,
      ...sourceWarnings,
      ...(lpcItem && lpcCreditCount === 0 ? ['LPC catalog item has no credit records.'] : []),
    ]

    setDetailsRecord({
      title: `${slugLabel(label)} layer`,
      subtitle: selectedPart ? selectedPart.part_id : (sourceCharacter?.display_name ?? sourceCharacterId),
      fields: [
        { label: 'Layer label', value: label },
        { label: 'Selected part', value: selectedPart ? selectedPart.part_id : 'none; using source character' },
        { label: 'Source character', value: sourceCharacter ? `${sourceCharacter.display_name} (${sourceCharacter.character_id})` : sourceCharacterId },
        { label: 'Review state', value: selectedPart ? (selectedPart.reviewed ? 'reviewed' : 'needs review') : 'source character' },
        { label: 'Compatibility', value: selectedPart ? `${selectedPartAnimations.join(', ') || 'no animations'} / ${selectedPartDirections.join(', ') || 'no directions'}` : `${sourceCharacter?.animation_names.join(', ') || 'unknown animations'} / source sheet` },
        { label: 'Recipe mode', value: recipeMode },
        { label: 'Source family', value: selectedPart?.source_family ?? String(sourceCharacter?.labels?.source_family ?? 'unspecified') },
        { label: 'LPC catalog selection', value: lpcSelection ? `${lpcSelection.enabled ? 'enabled' : 'disabled'} / ${lpcSelection.item_id} / ${lpcSelection.variant || 'default'}` : 'none' },
        { label: 'LPC item', value: lpcItem ? `${lpcItem.name} / ${lpcItem.type_name} / ${lpcItem.layers.length} layer record(s)` : 'none' },
        { label: 'Layer controls', value: `${settings.visible ? 'visible' : 'hidden'}, ${settings.locked ? 'locked' : 'unlocked'}, offset ${settings.offset[0]},${settings.offset[1]}` },
        { label: 'Recipe readiness', value: `${recipeReadiness.state}; ${recipeReadiness.missingReviewedLayerCount} layer(s) need reviewed parts; ${recipeReadiness.warningCount} warning(s)` },
        { label: 'Warnings', value: warnings.join(' ') || 'none' },
      ],
    })
  }

  function showPreviewDetails(kind: 'direction' | 'composite') {
    setDetailsRecord({
      title: kind === 'direction' ? 'All-direction preview' : 'Composite preview',
      subtitle: `${slugLabel(currentAnimation)} / ${currentDirection} / frame ${currentFrameIndex + 1}`,
      fields: [
        { label: 'Source character', value: `${animationSourceCharacter.display_name} (${animationSourceCharacter.character_id})` },
        { label: 'Base character', value: `${selectedCharacter.display_name} (${selectedCharacter.character_id})` },
        { label: 'Recipe', value: recipe ? `${recipe.character_id} / ${recipe.recipe_mode ?? 'unspecified mode'}` : 'none' },
        { label: 'Source family', value: recipe?.source_family ?? 'unspecified' },
        { label: 'Directions', value: mainDirections.join(', ') },
        { label: 'Frame count', value: String(animationSourceCharacter.directions[currentDirection]?.[currentAnimation]?.frame_count ?? 0) },
        { label: 'Selected reviewed parts', value: String(selectedReviewedParts.length) },
        { label: 'LPC selections', value: String(Object.values(lpcSelections).filter((selection) => selection.enabled).length) },
        { label: 'Readiness', value: `${recipeReadiness.state}; ${recipeReadiness.warningCount} warning(s)` },
      ],
    })
  }

  function buildLayerActions(label: PartLabel, settings: ComposerLayerSettings) {
    const selectedPartId = selectedPartIds[label]
    const selectedSourceId = selectedParts[label]
    return [
      {
        id: 'view-details',
        label: 'View details',
        onSelect: () => showLayerDetails(label),
      },
      {
        id: 'activate-layer',
        label: 'Activate layer',
        disabled: activePartLabel === label,
        disabledReason: 'This layer is already active in the live picker.',
        onSelect: () => setActivePartLabel(label),
      },
      {
        id: 'clear-layer-selection',
        label: 'Clear layer selection',
        disabled: !selectedPartId && !selectedSourceId,
        disabledReason: 'This layer is already using the base source character.',
        onSelect: () => clearLayerSelection(label),
      },
      {
        id: 'toggle-visible',
        label: settings.visible ? 'Hide layer' : 'Show layer',
        onSelect: () => updateLayerSetting(label, { visible: !settings.visible }),
      },
      {
        id: 'toggle-locked',
        label: settings.locked ? 'Unlock layer' : 'Lock layer',
        onSelect: () => updateLayerSetting(label, { locked: !settings.locked }),
      },
    ]
  }

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div>
          <h3>Fast Creator</h3>
          <p>Swap semantic parts, keep animation compatibility visible, then export a recipe.</p>
        </div>
        <div className="topbar-actions">
          <button data-testid="new-recipe-button" onClick={startNewRecipe}>New recipe</button>
          <button className="primary" data-testid="save-recipe-button" onClick={saveCurrentRecipe}>Save recipe</button>
        </div>
      </div>
      <div className="tab-row recipe-mode-tabs" role="tablist" aria-label="Recipe modes">
        {[
          ['lpc_character', 'LPC Character'],
          ['sprite_kitbash', 'Sprite Kitbash'],
          ['duelyst_review', 'Duelyst Review'],
        ].map(([id, label]) => {
          const modeId = id as RecipeModeId
          return (
            <Tooltip key={id} content={recipeModeHints[modeId]}>
              <button
                type="button"
                role="tab"
                aria-selected={recipeMode === id}
                className={recipeMode === id ? 'active' : ''}
                onClick={() => setRecipeMode(modeId)}
              >
                {label}
              </button>
            </Tooltip>
          )
        })}
      </div>
      {recipeMode === 'duelyst_review' ? (
        <p className="mode-note">Duelyst Review keeps staged units in review/training space. They can feed APES and extraction, but they are not LPC bodies or LPC catalog parts.</p>
      ) : recipeMode === 'lpc_character' ? (
        <p className="mode-note">LPC Character mode scopes bodies, parts, and motion to LPC-compatible sources. Non-LPC parts must be reviewed as compatible custom content before use.</p>
      ) : (
        <p className="mode-note">Sprite Kitbash mode uses sprite-pack sources and reviewed extracted parts. LPC catalog items stay in the LPC workflow.</p>
      )}
      {recipeMode === 'lpc_character' ? (
        <section className="lpc-catalog-picker-panel" aria-label="LPC catalog picker">
          <div>
            <strong>Catalog-backed selection</strong>
            <span>{lpcCatalog ? `${lpcCatalog.summary.item_count} catalog item(s) loaded` : 'No catalog loaded. Build it from Asset Audit.'}</span>
          </div>
          <div className="lpc-catalog-controls">
            <label className="field">
              <span>Search catalog</span>
              <input
                data-testid="lpc-catalog-search"
                value={lpcCatalogSearch}
                onChange={(event) => setLpcCatalogSearch(event.target.value)}
                placeholder="cape, hair, sword, author, license"
                disabled={!lpcCatalog}
              />
            </label>
            <label className="field">
              <span>{slugLabel(activePartLabel)} catalog item</span>
              <select
                data-testid="lpc-catalog-item-select"
                aria-label="LPC catalog item"
                value={activeLpcSelection?.item_id ?? ''}
                onChange={(event) => selectLpcCatalogItem(event.target.value)}
                disabled={!lpcCatalog || lpcCatalogOptions.length === 0}
              >
                <option value="">{lpcCatalogOptions.length === 0 ? 'no compatible catalog items' : 'no catalog item selected'}</option>
                {lpcCatalogOptions.map((option) => (
                  <option key={option.item_id} value={option.item_id}>
                    {option.name} / {option.type_name} / {option.compatibility_state}
                    {option.warnings.length > 0 ? ` / ${option.warnings[0]}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Variant</span>
              <select
                data-testid="lpc-catalog-variant-select"
                aria-label="LPC catalog variant"
                value={activeLpcSelection?.variant ?? ''}
                onChange={(event) => updateActiveLpcSelection({ variant: event.target.value })}
                disabled={!activeLpcItem}
              >
                {(activeLpcItem?.variants ?? []).map((variant) => (
                  <option key={variant} value={variant}>{variant || 'default'}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-field lpc-reviewed-toggle">
              <input
                type="checkbox"
                checked={activeLpcSelection?.enabled ?? false}
                onChange={(event) => updateActiveLpcSelection({ enabled: event.target.checked })}
                disabled={!activeLpcSelection}
              />
              <span>Enabled</span>
            </label>
          </div>
          <div className="part-meta">
            <Tooltip content="Catalog draw records are persisted now; renderer migration follows after parity tests."><span>metadata-backed</span></Tooltip>
            <Tooltip content={activeExportTarget.hint}><span>{activeExportTarget.lpcExportProfile === 'oversize' ? 'oversize LPC export' : 'standard 64 LPC export'}</span></Tooltip>
            <Tooltip content="Current body key used for catalog filtering"><span>{lpcBodyType}</span></Tooltip>
            <Tooltip content="Release-blocking selected-item credits"><span>{lpcCreditReadiness?.missing_count ?? 0} missing credits</span></Tooltip>
            <Tooltip content="Selected item credits needing attribution review"><span>{lpcCreditReadiness?.needs_review_count ?? 0} needs review</span></Tooltip>
            <Tooltip content="Enabled catalog selections"><span>{lpcCreditReadiness?.selected_count ?? 0} selected</span></Tooltip>
          </div>
          {activeLpcSelection && activeLpcItem ? (
            <p className="mode-note">
              {activeLpcItem.name} stores {activeLpcItem.layers.length} upstream layer record(s), {activeLpcItem.credits.length} credit record(s), and {activeLpcItem.animations.length || 'fallback'} animation hint(s).
            </p>
          ) : null}
          {activeLpcStatus ? (
            <p className="mode-note" data-testid="lpc-catalog-selection-status">{activeLpcStatus}</p>
          ) : null}
          {activeLpcWarnings.length ? (
            <div className="warning-list compact-warning-list" data-testid="lpc-catalog-selection-warnings">
              {activeLpcWarnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          ) : null}
        </section>
      ) : null}
      <div className="recipe-controls">
        <label className="field">
          <span>Recipe name</span>
          <input data-testid="recipe-name-input" value={recipeName} onChange={(event) => setRecipeName(event.target.value)} />
        </label>
        <label className="field">
          <span>Load saved recipe</span>
          <select data-testid="load-saved-recipe-select" value="" onChange={(event) => loadSavedRecipe(event.target.value)} disabled={savedRecipes.length === 0}>
            <option value="">{savedRecipes.length === 0 ? 'no saved recipes' : 'choose recipe'}</option>
            {savedRecipes.map((savedRecipe) => (
              <option key={savedRecipe.recipe_id} value={savedRecipe.recipe_id}>
                {savedRecipe.name} / {savedRecipe.base_character}
              </option>
            ))}
          </select>
        </label>
        <span className="recipe-id">{recipeId}</span>
      </div>
      <section className="part-picker-panel compact-picker" aria-label="Live part picker">
        <div>
          <strong>Live part picker</strong>
          <span>Select a reviewed layer part and see it in the composite preview below.</span>
        </div>
        <div className="part-picker-controls">
          <label className="field">
            <span>Layer</span>
            <select
              data-testid="fast-live-layer"
              value={activePartLabel}
              onChange={(event) => setActivePartLabel(event.target.value as PartLabel)}
            >
              {layerOrder.map((label) => (
                <option key={label} value={label}>{slugLabel(label)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reviewed part</span>
            <select
              data-testid="fast-live-part"
              value={activePickerValue}
              onChange={(event) => selectActivePart(event.target.value)}
              disabled={reviewedPartsForActiveLabel.length === 0 && lpcPartsForActiveLabel.length === 0}
            >
              <option value="">{reviewedPartsForActiveLabel.length === 0 && lpcPartsForActiveLabel.length === 0 ? 'no parts for this layer' : 'use source character'}</option>
              {lpcPartsForActiveLabel.length > 0 ? (
                <optgroup label="LPC sheet parts">
                  {lpcPartsForActiveLabel.map((character) => (
                    <option key={character.character_id} value={`source:${character.character_id}`}>
                      {character.display_name} / {character.animation_names.slice(0, 4).join(', ')}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {reviewedPartsForActiveLabel.map((part) => (
                <option key={part.part_id} value={`library:${part.part_id}`}>
                  {part.part_id} / {slugLabel(part.extraction_method)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="cockpit-panel" aria-label="Recipe readiness">
        <div className={`readiness-strip ${recipeReadiness.state}`}>
          <span>
            <strong>{recipeReadiness.reviewedSelectedPartCount}</strong>
            reviewed selected
          </span>
          <span>
            <strong>{recipeReadiness.missingReviewedLayerCount}</strong>
            layers need reviewed parts
          </span>
          <span>
            <strong>{recipeReadiness.warningCount}</strong>
            warning(s)
          </span>
          <span>
            <strong>{activeExportTarget.label}</strong>
            target
          </span>
        </div>
        <div className="cockpit-controls">
          <label className="field">
            <span>Find approved parts</span>
            <input
              data-testid="fast-part-search"
              value={partSearch}
              onChange={(event) => setPartSearch(event.target.value)}
              placeholder="Search part id, source, method, tag, warning"
            />
          </label>
          <label className="field">
            <span>Method</span>
            <select
              data-testid="fast-part-method-filter"
              value={partMethodFilter}
              onChange={(event) => setPartMethodFilter(event.target.value as ExtractedPart['extraction_method'] | 'all')}
            >
              <option value="all">all methods</option>
              {availableMethods.map((method) => (
                <option key={method} value={method}>{slugLabel(method)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Export target</span>
            <select
              data-testid="export-target-profile"
              aria-label="Export target profile"
              value={exportTargetProfile}
              onChange={(event) => setExportTargetProfile(event.target.value as ExportTargetProfileId)}
            >
              {exportTargetProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="next-actions" aria-label="Next actions">
          <button onClick={openPartReview}>Review parts</button>
          <button onClick={openBatchGenerator}>Generate variants</button>
          <button onClick={createApesJob}>Prepare APES job</button>
          <button className="primary" onClick={openExports}>Open {activeExportTarget.label}</button>
          <button onClick={openSettingsRepair} disabled={localToolsAvailable}>Check setup</button>
        </div>
      </section>
      <ContextMenuArea
        label="Actions for all-direction preview"
        actions={[{ id: 'view-details', label: 'View details', onSelect: () => showPreviewDetails('direction') }]}
      >
        <DirectionPreviewGrid character={animationSourceCharacter} animation={currentAnimation} frameIndex={currentFrameIndex} directions={mainDirections} />
      </ContextMenuArea>
      {recipe ? (
        <ContextMenuArea
          label="Actions for composite preview"
          actions={[{ id: 'view-details', label: 'View details', onSelect: () => showPreviewDetails('composite') }]}
        >
          <section className="composite-preview-panel">
            <div>
              <strong>Composite preview</strong>
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
      <div className="part-grid">
        {layerOrder.map((label) => {
          const approvedOptions = filterReviewedPartsForLayer({
            reviewedParts,
            label,
            query: partSearch,
            method: partMethodFilter,
            selectedPartId: selectedPartIds[label],
          })
          const totalApprovedOptions = reviewedParts.filter((part) => part.label === label).length
          const settings = layerSettings[label] ?? { offset: [0, 0], visible: true, locked: false }
          const layerActions = buildLayerActions(label, settings)
          return (
            <ContextMenuArea key={label} label={`Actions for ${slugLabel(label)} recipe layer`} actions={layerActions}>
              <article className="composer-layer" data-testid={`fast-layer-card-${label}`}>
                <div className="part-meta">
                  <span>{slugLabel(label)}</span>
                  <span>{selectedPartIds[label] ? 'approved part selected' : 'source character'}</span>
                  <ContextMenuButton label={`More actions for ${slugLabel(label)} recipe layer`} actions={layerActions} />
                </div>
                <label className="field">
                  <span>{slugLabel(label)} source</span>
                  <select
                    value={selectedParts[label] ?? selectedCharacter.character_id}
                    onChange={(event) => setSelectedParts((current) => ({ ...current, [label]: event.target.value }))}
                  >
                    {characters.map((character) => (
                      <option key={character.character_id} value={character.character_id}>
                        {character.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Approved part ({approvedOptions.length}/{totalApprovedOptions})</span>
                  <select
                    value={selectedPartIds[label] ?? ''}
                    onChange={(event) => setLayerSelectedPart(label, event.target.value)}
                    disabled={approvedOptions.length === 0}
                  >
                    <option value="">{approvedOptions.length === 0 ? 'no reviewed parts' : 'use source character'}</option>
                    {approvedOptions.map((part) => (
                      <option key={part.part_id} value={part.part_id}>
                        {slugLabel(part.extraction_method)} / {part.character_id} / {part.part_id}
                        {part.part_id === selectedPartIds[label] && !partMatchesActiveFilter(part, label, partSearch, partMethodFilter) ? ' / selected outside filter' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="layer-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.visible}
                      onChange={(event) => updateLayerSetting(label, { visible: event.target.checked })}
                    />
                    <span>Visible</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.locked}
                      onChange={(event) => updateLayerSetting(label, { locked: event.target.checked })}
                    />
                    <span>Locked</span>
                  </label>
                  <label>
                    <span>X</span>
                    <input
                      aria-label={`${slugLabel(label)} x offset`}
                      type="text"
                      inputMode="numeric"
                      value={settings.offset[0]}
                      onChange={(event) => updateLayerSetting(label, { offset: [clampOffsetInput(event.target.value), settings.offset[1]] })}
                    />
                  </label>
                  <label>
                    <span>Y</span>
                    <input
                      aria-label={`${slugLabel(label)} y offset`}
                      type="text"
                      inputMode="numeric"
                      value={settings.offset[1]}
                      onChange={(event) => updateLayerSetting(label, { offset: [settings.offset[0], clampOffsetInput(event.target.value)] })}
                    />
                  </label>
                </div>
              </article>
            </ContextMenuArea>
          )
        })}
      </div>
      <div className="status-strip">
        <label className="field compact">
          <span>Team color</span>
          <select value={palette} onChange={(event) => setPalette(event.target.value)}>
            {palettePresets.map((name) => (
              <option key={name} value={name}>
                {slugLabel(name)}
              </option>
            ))}
          </select>
        </label>
        <label className="field compact slider-field">
          <span>Hue: {paletteRules.hue_shift}</span>
          <input
            type="text"
            inputMode="numeric"
            value={paletteRules.hue_shift}
            onChange={(event) => updatePaletteRules({ hue_shift: clampSignedInput(event.target.value, -180, 180) })}
          />
        </label>
        <label className="field compact slider-field">
          <span>Saturation: {paletteRules.saturation}%</span>
          <input
            type="text"
            inputMode="numeric"
            value={paletteRules.saturation}
            onChange={(event) => updatePaletteRules({ saturation: clampUnsignedInput(event.target.value, 0, 200) })}
          />
        </label>
        <label className="field compact slider-field">
          <span>Brightness: {paletteRules.brightness}%</span>
          <input
            type="text"
            inputMode="numeric"
            value={paletteRules.brightness}
            onChange={(event) => updatePaletteRules({ brightness: clampUnsignedInput(event.target.value, 0, 200) })}
          />
        </label>
        <span>Core limbs default to APES masks</span>
        <span>{reviewedParts.length} reviewed library parts available</span>
        <span>{selectedReviewedParts.length} approved parts selected in recipe</span>
        <span>{savedRecipes.length} saved recipe(s)</span>
      </div>
      <DetailsDrawer record={detailsRecord} onClose={() => setDetailsRecord(null)} />
    </section>
  )
}
