import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canShowCharacterInRecipeMode,
  sourceFamilyForRecipeMode,
} from '../../src/sourceFamilyRegistry.ts'

test('source family registry maps recipe modes to their composition family', () => {
  assert.equal(sourceFamilyForRecipeMode('lpc_character'), 'lpc')
  assert.equal(sourceFamilyForRecipeMode('sprite_kitbash'), 'sprite_pack')
  assert.equal(sourceFamilyForRecipeMode('duelyst_review'), 'duelyst')
})

test('recipe mode source pickers hide cross-family characters and LPC pseudo-parts', () => {
  const lpcBody = makeCharacter('lpc-body', 'lpc_character', { lpc_role: 'body' })
  const lpcPart = makeCharacter('lpc-hair', 'lpc_character', { lpc_role: 'part' })
  const spriteCharacter = makeCharacter('sprite-hero', 'character')
  const duelystCharacter = makeCharacter('duelyst-stage', 'duelyst_staged')

  assert.equal(canShowCharacterInRecipeMode(lpcBody, 'lpc_character'), true)
  assert.equal(canShowCharacterInRecipeMode(lpcPart, 'lpc_character'), false)
  assert.equal(canShowCharacterInRecipeMode(spriteCharacter, 'lpc_character'), false)
  assert.equal(canShowCharacterInRecipeMode(duelystCharacter, 'lpc_character'), false)

  assert.equal(canShowCharacterInRecipeMode(spriteCharacter, 'sprite_kitbash'), true)
  assert.equal(canShowCharacterInRecipeMode(lpcBody, 'sprite_kitbash'), false)
  assert.equal(canShowCharacterInRecipeMode(duelystCharacter, 'sprite_kitbash'), false)

  assert.equal(canShowCharacterInRecipeMode(duelystCharacter, 'duelyst_review'), true)
  assert.equal(canShowCharacterInRecipeMode(spriteCharacter, 'duelyst_review'), false)
})

function makeCharacter(characterId, classType, labels = {}) {
  return {
    character_id: characterId,
    display_name: characterId,
    source_folder: `/fixtures/${characterId}`,
    class_type: classType,
    labels,
    width: 64,
    height: 64,
    frame_width: 64,
    frame_height: 64,
    animation_names: ['idle'],
    animations: {},
  }
}
