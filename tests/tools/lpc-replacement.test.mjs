import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLpcReplacementRegions } from '../../src/lpcReplacement.ts'
import { humanoid64Preset } from '../../src/presets.ts'

test('LPC clothing sheet sources overlay the body instead of punching replacement holes', () => {
  const recipe = makeRecipeWithSource('front_leg', 'lpc-pants')
  const regions = buildLpcReplacementRegions(recipe, [
    makeLpcPartCharacter('lpc-pants', '[LPC Revised] Character Basics/Clothing/Feminine, Thin/Pants 01 - Hose/Blue'),
  ], [])

  assert.deepEqual(regions, [])
})

test('LPC body sheet sources still replace the matching base body region', () => {
  const recipe = makeRecipeWithSource('head', 'lpc-head')
  const regions = buildLpcReplacementRegions(recipe, [
    makeLpcPartCharacter('lpc-head', '[LPC Revised] Character Basics/Body/Adult Heads/Head 01 - Feminine/Blue'),
  ], [])

  assert.deepEqual(regions, [humanoid64Preset.head, humanoid64Preset.face])
})

function makeRecipeWithSource(label, sourceCharacter) {
  return {
    layers: [
      {
        label,
        source_character: sourceCharacter,
        offset: [0, 0],
        visible: true,
      },
    ],
  }
}

function makeLpcPartCharacter(characterId, lpcPath) {
  return {
    character_id: characterId,
    class_type: 'lpc_character',
    labels: {
      lpc_role: 'part',
      lpc_path: lpcPath,
    },
  }
}
