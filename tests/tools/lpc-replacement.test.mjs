import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { buildLpcCharacterManifests } from '../../src/lpcCharacters.ts'
import { buildLpcReplacementRegions } from '../../src/lpcReplacement.ts'
import { humanoid64Preset } from '../../src/presets.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const realLpcInventoryPath = path.join(repoRoot, 'data', 'lpc', 'lpc_asset_inventory.json')

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

test('all local LPC non-body pseudo-parts overlay instead of erasing the base body', { skip: existsSync(realLpcInventoryPath) ? false : 'local LPC inventory is not available' }, () => {
  const inventory = JSON.parse(readFileSync(realLpcInventoryPath, 'utf8'))
  const lpcParts = buildLpcCharacterManifests(inventory)
    .filter((character) => character.labels?.lpc_role === 'part')

  assert.ok(lpcParts.length > 0)

  const unexpectedReplacementSources = lpcParts
    .filter((character) => !String(character.labels?.lpc_path ?? '').replaceAll('\\', '/').toLowerCase().includes('/body/'))
    .filter((character) => {
      const recipe = makeRecipeWithSource(character.labels.lpc_part_label, character.character_id)
      return buildLpcReplacementRegions(recipe, [character], []).length > 0
    })
    .map((character) => character.labels.lpc_path)

  assert.deepEqual(unexpectedReplacementSources, [])
})

test('all local LPC body pseudo-parts keep using body replacement regions', { skip: existsSync(realLpcInventoryPath) ? false : 'local LPC inventory is not available' }, () => {
  const inventory = JSON.parse(readFileSync(realLpcInventoryPath, 'utf8'))
  const bodyParts = buildLpcCharacterManifests(inventory)
    .filter((character) => character.labels?.lpc_role === 'part')
    .filter((character) => String(character.labels?.lpc_path ?? '').replaceAll('\\', '/').toLowerCase().includes('/body/'))

  assert.ok(bodyParts.length > 0)

  const missingReplacementSources = bodyParts
    .filter((character) => {
      const recipe = makeRecipeWithSource(character.labels.lpc_part_label, character.character_id)
      return buildLpcReplacementRegions(recipe, [character], []).length === 0
    })
    .map((character) => character.labels.lpc_path)

  assert.deepEqual(missingReplacementSources, [])
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
