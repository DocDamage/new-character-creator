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
import { isLpcMannequin, isLpcPartSourceForLayer, isPartCompatibleWithMannequin } from '../lpcPartCompatibility'
import { layerOrder, palettePresets } from '../presets'
import type { AnimationName, CharacterManifest, ComposerLayerSettings, Direction, ExtractedPart, KitbashRecipe, PaletteRules, PartLabel } from '../types'
import { slugLabel } from '../utils'

type FastCreatorPanelProps = {
  selectedCharacter: CharacterManifest
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

export function FastCreatorPanel({
  selectedCharacter,
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
}: FastCreatorPanelProps) {
  const reviewedParts = partLibrary.filter((part) => part.reviewed && isPartCompatibleWithMannequin(part, selectedCharacter))
  const [partSearch, setPartSearch] = useState('')
  const [partMethodFilter, setPartMethodFilter] = useState<ExtractedPart['extraction_method'] | 'all'>('all')
  const activeExportTarget = getExportTargetProfile(exportTargetProfile)
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
    () => isLpcMannequin(selectedCharacter) ? characters
      .filter((character) => isLpcPartSourceForLayer(character, activePartLabel))
      .sort((left, right) => left.display_name.localeCompare(right.display_name))
      .slice(0, 180) : [],
    [activePartLabel, characters, selectedCharacter],
  )
  const selectedActiveSource = selectedParts[activePartLabel]
  const selectedActiveSourceCharacter = selectedActiveSource
    ? characters.find((character) => character.character_id === selectedActiveSource)
    : undefined
  const activePickerValue = selectedActivePart
    ? `library:${selectedActivePart}`
    : selectedActiveSource && selectedActiveSourceCharacter && isLpcPartSourceForLayer(selectedActiveSourceCharacter, activePartLabel)
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
      <DirectionPreviewGrid character={selectedCharacter} animation={currentAnimation} frameIndex={currentFrameIndex} directions={mainDirections} />
      {recipe ? (
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
            scale={3}
            label={`composite ${currentAnimation} ${currentDirection} frame ${currentFrameIndex + 1}`}
          />
        </section>
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
          return (
            <div key={label} className="composer-layer">
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
                  onChange={(event) =>
                    setSelectedPartIds((current) => ({
                      ...current,
                      [label]: event.target.value || undefined,
                    }))
                  }
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
            </div>
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
    </section>
  )
}
