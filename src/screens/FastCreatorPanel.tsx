import type { Dispatch, SetStateAction } from 'react'
import { CompositeCanvas } from '../CompositeCanvas'
import { DirectionPreviewGrid } from '../DirectionPreviewGrid'
import type { SavedComposerRecipe } from '../appPersistence'
import { clampOffsetInput, clampSignedInput, clampUnsignedInput } from '../inputUtils'
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
}: FastCreatorPanelProps) {
  const reviewedParts = partLibrary.filter((part) => part.reviewed)
  const selectedReviewedParts = layerOrder
    .map((label) => reviewedParts.find((part) => part.part_id === selectedPartIds[label]))
    .filter(Boolean)

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
          const approvedOptions = reviewedParts.filter((part) => part.label === label)
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
                <span>Approved part</span>
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