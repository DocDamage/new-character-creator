import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'

import { renderExportFilenameTemplate } from '../../src/filenameTemplates.ts'
import { buildGenerationManifest } from '../../src/generationManifest.ts'
import { layerBundleToExtractedParts, lpcSheetsToExtractedParts, parseLayerBundleManifest } from '../../src/layerBundle.ts'
import { buildLpcCharacterManifests } from '../../src/lpcCharacters.ts'
import { resolveCompatiblePartSelection } from '../../src/lpcPartCompatibility.ts'
import { analyzeAlphaData } from '../../src/sourceAnalysis.ts'
import { getRecipeAnimationCoverage } from '../../src/animationSource.ts'
import {
  buildRecipeReadiness,
  exportTargetProfiles,
  filterReviewedPartsForLayer,
  getExportTargetProfile,
} from '../../src/creatorCockpit.ts'

const realLpcInventoryUrl = new URL('../../data/lpc/lpc_asset_inventory.json', import.meta.url)
const realLpcInventorySkip = existsSync(realLpcInventoryUrl)
  ? false
  : 'real LPC inventory is an ignored local asset; run npm run lpc:inventory to enable this test locally'

test('source alpha analysis reports opaque bounds, floor, and pivot', () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4)
  setAlpha(pixels, 4, 1, 1, 255)
  setAlpha(pixels, 4, 2, 2, 255)

  const analysis = analyzeAlphaData(pixels, 4, 4)

  assert.equal(analysis.opaque_pixel_count, 2)
  assert.deepEqual(analysis.alpha_bounds, { x: 1, y: 1, w: 2, h: 2 })
  assert.equal(analysis.floor_y, 2)
  assert.deepEqual(analysis.pivot, { x: 2, y: 2 })
})

test('filename templates sanitize generated export names', () => {
  assert.equal(
    renderExportFilenameTemplate('{character}_{animation}_{direction}_{frame}_{label}', {
      character: 'Ash Ronin',
      animation: 'running jump',
      direction: 'south/east',
      frame: '003',
      label: 'front arm',
    }),
    'Ash_Ronin_running_jump_south_east_003_front_arm',
  )
})

test('generation manifests preserve frame references and requested output labels', () => {
  const manifest = buildGenerationManifest({
    character: makeCharacterManifest(),
    animations: ['idle'],
    directions: ['south'],
    frameRange: [1, 0],
    labels: ['head', 'torso'],
    filenameTemplate: '{character}_{label}',
    styleNotes: ' clean alpha ',
    layerBundleTargets: ['head', 'torso'],
  })

  assert.equal(manifest.format, 'pixel_creator_generation_manifest')
  assert.equal(manifest.source_character, 'source_hero')
  assert.equal(manifest.frame_references.length, 2)
  assert.deepEqual(manifest.output_labels, ['head', 'torso'])
  assert.equal(manifest.style_notes, 'clean alpha')
})

test('layer bundle JSON imports as selectable Part Library records', () => {
  const bundle = parseLayerBundleManifest(JSON.stringify({
    format: 'pixel_creator_layer_bundle',
    version: 1,
    bundle_id: 'github_harvest',
    parts: [
      {
        id: 'github_harvest_head',
        label: 'head',
        source_character: 'sheet_001',
        image: {
          path: '/assets/github/head.png',
          bounds: { x: 18, y: 6, w: 28, h: 22 },
        },
      },
    ],
  }))
  const parts = layerBundleToExtractedParts(bundle)

  assert.equal(parts.length, 1)
  assert.equal(parts[0].part_id, 'github_harvest_head')
  assert.equal(parts[0].label, 'head')
  assert.equal(parts[0].extraction_method, 'manual')
  assert.ok(parts[0].tags.includes('layer_bundle'))
})

test('layer bundle validation rejects unsafe or malformed parts', () => {
  assert.throws(
    () => parseLayerBundleManifest(JSON.stringify(makeLayerBundle({ label: 'not_a_real_label' }))),
    /invalid label/i,
  )
  assert.throws(
    () => parseLayerBundleManifest(JSON.stringify(makeLayerBundle({ id: 'duplicate' }, { id: 'duplicate' }))),
    /duplicate part id/i,
  )
  assert.throws(
    () => parseLayerBundleManifest(JSON.stringify(makeLayerBundle({ image: { path: 'C:/private/head.png' } }))),
    /Windows absolute path/i,
  )
  assert.throws(
    () => parseLayerBundleManifest(JSON.stringify(makeLayerBundle({ image: { path: '../private/head.png' } }))),
    /path traversal/i,
  )
  assert.throws(
    () => parseLayerBundleManifest(JSON.stringify(makeLayerBundle({ image: { path: '/assets/head.png', bounds: { x: 0, y: 0, w: 0, h: 64 } } }))),
    /unsupported size/i,
  )
})

test('LPC inventory sheets can be promoted into manual parts with browser asset URLs', () => {
  const parts = lpcSheetsToExtractedParts({
    format: 'pixel_creator_lpc_asset_inventory',
    generated_at: '2026-05-17T00:00:00.000Z',
    source: {
      kind: 'local',
      asset_root: 'C:/repo/assets/lpc sprite generator stuff',
      upstream_repo: '',
      upstream_reference: { available: false, root: '' },
    },
    summary: {
      png_count: 1,
      lpc_grid_count: 1,
      non_lpc_grid_count: 0,
      categories: { hair: 1 },
      frame_grids: { '64x64': 1 },
      credit_file_count: 0,
    },
    credit_files: [],
    sheets: [
      {
        path: 'hair/long.png',
        category: 'hair',
        file_name: 'long.png',
        width: 832,
        height: 1344,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 13,
        frame_rows: 21,
        lpc_grid: true,
        tags: ['hair'],
      },
    ],
  }, 1)

  assert.equal(parts.length, 1)
  assert.equal(parts[0].label, 'hair_hat_hood')
  assert.equal(parts[0].image_data_url, '/assets/lpc sprite generator stuff/hair/long.png')
  assert.ok(parts[0].tags.includes('lpc'))
  assert.ok(parts[0].tags.includes('lpc_source_hair_long_png'))
  assert.equal(parts[0].reviewed, false)
})

test('LPC inventory import supports selected sheets, explicit labels, and reviewed state', () => {
  const inventory = {
    format: 'pixel_creator_lpc_asset_inventory',
    generated_at: '2026-05-17T00:00:00.000Z',
    source: {
      kind: 'local_lpc_asset_dump',
      asset_root: 'C:/repo/assets/lpc sprite generator stuff',
      upstream_repo: 'https://example.test/lpc',
      upstream_reference: { available: false, root: 'C:/repo/cache' },
    },
    summary: {
      png_count: 2,
      lpc_grid_count: 2,
      non_lpc_grid_count: 0,
      categories: { hair: 1, weapon: 1 },
      frame_grids: { '13x21': 2 },
      credit_file_count: 1,
    },
    credit_files: [{ path: 'CREDITS.txt', excerpt: 'credit text' }],
    sheets: [
      {
        path: 'hair/long.png',
        category: 'hair',
        file_name: 'long.png',
        width: 832,
        height: 1344,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 13,
        frame_rows: 21,
        lpc_grid: true,
        tags: ['hair', 'long'],
      },
      {
        path: 'weapon/sword.png',
        category: 'weapon',
        file_name: 'sword.png',
        width: 832,
        height: 1344,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 13,
        frame_rows: 21,
        lpc_grid: true,
        tags: ['weapon', 'sword'],
      },
    ],
  }

  const parts = lpcSheetsToExtractedParts(inventory, {
    sheetPaths: ['weapon/sword.png'],
    labelOverride: 'weapon',
    reviewed: true,
  })

  assert.equal(parts.length, 1)
  assert.equal(parts[0].part_id, 'lpc_weapon_sword_png_001')
  assert.equal(parts[0].label, 'weapon')
  assert.equal(parts[0].reviewed, true)
  assert.ok(parts[0].tags.includes('lpc_source_weapon_sword_png'))
  assert.ok(parts[0].warnings.some((warning) => warning.includes('credit/license')))
})

test('LPC inventory sheets can be exposed as cropped source characters', () => {
  const characters = buildLpcCharacterManifests({
    format: 'pixel_creator_lpc_asset_inventory',
    generated_at: '2026-05-17T00:00:00.000Z',
    source: {
      kind: 'local_lpc_asset_dump',
      asset_root: 'C:/repo/assets/lpc sprite generator stuff',
      upstream_repo: 'https://example.test/lpc',
      upstream_reference: { available: false, root: 'C:/repo/cache' },
    },
    summary: {
      png_count: 1,
      lpc_grid_count: 1,
      non_lpc_grid_count: 0,
      categories: { 'Adult Female': 1 },
      frame_grids: { '5x4': 1 },
      credit_file_count: 0,
    },
    credit_files: [],
    sheets: [
      {
        path: 'Adult Female/Base, Adult Female.png',
        category: 'Adult Female',
        file_name: 'Base, Adult Female.png',
        width: 320,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 5,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['adult_female', 'base'],
      },
      {
        path: 'Clothes/Blue/Shirt, Long-Sleeved.png',
        category: 'Clothes',
        file_name: 'Shirt, Long-Sleeved.png',
        width: 320,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 5,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['shirt', 'blue'],
      },
      {
        path: 'Clothes/Blue/Shirt/Run.png',
        category: 'Clothes',
        file_name: 'Run.png',
        width: 320,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 5,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['shirt', 'blue'],
      },
      {
        path: 'lpc_entry/png/bow/WEAPON_bow.png',
        category: 'lpc_entry',
        file_name: 'WEAPON_bow.png',
        width: 832,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 13,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['weapon', 'bow'],
      },
      {
        path: 'Long ears/LongEars_female_d.png',
        category: 'Long ears',
        file_name: 'LongEars_female_d.png',
        width: 832,
        height: 1344,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 13,
        frame_rows: 21,
        lpc_grid: true,
        tags: ['d', 'female', 'long_ears', 'longears'],
      },
      {
        path: 'Androgynous Bases/Copper/magic.png',
        category: 'Androgynous Bases',
        file_name: 'magic.png',
        width: 832,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 13,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['base'],
      },
      {
        path: 'Androgynous Bases/Copper/idle.png',
        category: 'Androgynous Bases',
        file_name: 'idle.png',
        width: 832,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 13,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['base'],
      },
      {
        path: 'Androgynous Bases/Copper/shoot.png',
        category: 'Androgynous Bases',
        file_name: 'shoot.png',
        width: 832,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 13,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['base'],
      },
      {
        path: 'Androgynous Bases/Copper/swing.png',
        category: 'Androgynous Bases',
        file_name: 'swing.png',
        width: 448,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 7,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['base'],
      },
      {
        path: 'Androgynous Bases/Copper/thrust.png',
        category: 'Androgynous Bases',
        file_name: 'thrust.png',
        width: 576,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 9,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['base'],
      },
      {
        path: 'Androgynous Bases/Copper/walk.png',
        category: 'Androgynous Bases',
        file_name: 'walk.png',
        width: 576,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 9,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['base'],
      },
      {
        path: 'Androgynous Bases/Copper/hurt.png',
        category: 'Androgynous Bases',
        file_name: 'hurt.png',
        width: 448,
        height: 64,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 7,
        frame_rows: 1,
        lpc_grid: true,
        tags: ['base'],
      },
      {
        path: 'Stand & Walk Bases/Copper/idle.png',
        category: 'Stand & Walk Bases',
        file_name: 'idle.png',
        width: 128,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 2,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['base'],
      },
      {
        path: 'Stand & Walk Bases/Copper/walk.png',
        category: 'Stand & Walk Bases',
        file_name: 'walk.png',
        width: 576,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 9,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['base'],
      },
      {
        path: 'lpc_entry/png/spellcast/BODY_male.png',
        category: 'lpc_entry',
        file_name: 'BODY_male.png',
        width: 448,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 7,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['body', 'male', 'spellcast'],
      },
      {
        path: 'lpc_entry/png/thrust/BODY_animation.png',
        category: 'lpc_entry',
        file_name: 'BODY_animation.png',
        width: 512,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 8,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['body', 'thrust'],
      },
      {
        path: 'lpc_entry/png/walkcycle/BODY_male.png',
        category: 'lpc_entry',
        file_name: 'BODY_male.png',
        width: 576,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 9,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['body', 'male', 'walkcycle'],
      },
      {
        path: 'lpc_entry/png/slash/BODY_human.png',
        category: 'lpc_entry',
        file_name: 'BODY_human.png',
        width: 384,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 6,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['body', 'human', 'slash'],
      },
      {
        path: 'lpc_entry/png/bow/BODY_animation.png',
        category: 'lpc_entry',
        file_name: 'BODY_animation.png',
        width: 832,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 13,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['body', 'bow'],
      },
      {
        path: 'lpc_entry/png/hurt/BODY_male.png',
        category: 'lpc_entry',
        file_name: 'BODY_male.png',
        width: 384,
        height: 64,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 6,
        frame_rows: 1,
        lpc_grid: true,
        tags: ['body', 'male', 'hurt'],
      },
      {
        path: 'lpc_entry/png/combat_dummy/BODY_animation.png',
        category: 'lpc_entry',
        file_name: 'BODY_animation.png',
        width: 512,
        height: 64,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 8,
        frame_rows: 1,
        lpc_grid: true,
        tags: ['body', 'combat_dummy'],
      },
      {
        path: 'Bases/Androgynous/Recolors/Copper/Sitting - Chair.png',
        category: 'Bases',
        file_name: 'Sitting - Chair.png',
        width: 64,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 1,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['base', 'sitting'],
      },
      {
        path: 'Clothes/Blue/Pants/Idle.png',
        category: 'Clothes',
        file_name: 'Idle.png',
        width: 320,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 5,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['pants', 'blue'],
      },
      {
        path: 'Clothes/Blue/Pants/Run.png',
        category: 'Clothes',
        file_name: 'Run.png',
        width: 320,
        height: 256,
        frame_width: 64,
        frame_height: 64,
        frame_columns: 5,
        frame_rows: 4,
        lpc_grid: true,
        tags: ['pants', 'blue'],
      },
    ],
  })

  assert.equal(characters.length, 9)
  const shirtPart = characters.find((character) => character.labels.lpc_path === 'Clothes/Blue/Shirt, Long-Sleeved')
  const runPart = characters.find((character) => character.labels.lpc_path === 'Clothes/Blue/Shirt')
  const pantsPart = characters.find((character) => character.labels.lpc_path === 'Clothes/Blue/Pants')
  const bowPart = characters.find((character) => character.labels.lpc_path === 'lpc_entry/png/WEAPON_bow')
  const longEarsPart = characters.find((character) => character.labels.lpc_path === 'Long ears/LongEars_female_d')
  const magicBase = characters.find((character) => character.labels.lpc_path === 'Androgynous Bases/Copper')
  const standWalkBase = characters.find((character) => character.labels.lpc_path === 'Stand & Walk Bases/Copper')
  const lpcBodyBase = characters.find((character) => character.labels.lpc_path === 'LPC Entry Bodies/Human Male')
  const combatDummyBody = characters.find((character) => character.labels.lpc_path === 'lpc_entry/png/combat_dummy/BODY_animation')
  const partialSittingBase = characters.find((character) => character.labels.lpc_path === 'Bases/Androgynous/Recolors/Copper/Sitting - Chair')
  assert.equal(characters[0].class_type, 'lpc_character')
  assert.equal(characters[0].labels.lpc_role, 'base')
  assert.equal(shirtPart?.labels.lpc_role, 'part')
  assert.equal(shirtPart?.labels.lpc_part_label, 'torso')
  assert.deepEqual(runPart?.animation_names, ['run'])
  assert.equal(pantsPart?.labels.lpc_part_label, 'legs')
  assert.deepEqual(pantsPart?.animation_names, ['idle', 'run'])
  assert.deepEqual(bowPart?.animation_names, ['shoot'])
  assert.equal(longEarsPart?.labels.lpc_part_label, 'face')
  assert.deepEqual(longEarsPart?.animation_names, ['spellcast', 'thrust', 'walk', 'slash', 'shoot', 'hurt'])
  assert.equal(longEarsPart?.directions.south.walk.frame_count, 9)
  assert.deepEqual(longEarsPart?.directions.south.walk.frames[0].source_rect, { x: 0, y: 640, w: 64, h: 64 })
  assert.deepEqual(longEarsPart?.directions.north.hurt.frames[0].source_rect, { x: 0, y: 1280, w: 64, h: 64 })
  assert.deepEqual(magicBase?.animation_names, ['idle', 'walk', 'spellcast', 'shoot', 'slash', 'thrust', 'hurt'])
  assert.deepEqual(standWalkBase?.animation_names, ['idle', 'walk'])
  assert.deepEqual(lpcBodyBase?.animation_names, ['walk', 'spellcast', 'shoot', 'slash', 'thrust', 'hurt'])
  assert.equal(lpcBodyBase?.directions.south.walk.frame_count, 9)
  assert.equal(lpcBodyBase?.directions.south.shoot.frame_count, 13)
  assert.deepEqual(lpcBodyBase?.directions.south.thrust.frames[0].source_rect, { x: 0, y: 128, w: 64, h: 64 })
  assert.equal(combatDummyBody, undefined)
  assert.equal(partialSittingBase, undefined)
  assert.equal(characters[0].directions.south.idle.frame_count, 5)
  assert.deepEqual(characters[0].directions.east.idle.frames[0].source_rect, { x: 0, y: 64, w: 64, h: 64 })
  assert.deepEqual(characters[0].directions.south.idle.frames[0].source_rect, { x: 0, y: 128, w: 64, h: 64 })
  assert.equal(magicBase?.directions.north.hurt.frame_count, 7)
  assert.deepEqual(magicBase?.directions.north.hurt.frames[0].source_rect, { x: 0, y: 0, w: 64, h: 64 })
  assert.deepEqual(magicBase?.directions.south.hurt.frames[0].source_rect, { x: 0, y: 0, w: 64, h: 64 })
  assert.equal(characters[0].representative_frame, '/assets/lpc sprite generator stuff/Adult Female/Base, Adult Female.png')
})

test('real LPC inventory exposes all available base animation families', { skip: realLpcInventorySkip }, async () => {
  const inventory = JSON.parse(await readFile(realLpcInventoryUrl, 'utf8'))
  const characters = buildLpcCharacterManifests(inventory)

  const humanBody = characters.find((character) => character.labels.lpc_path === 'LPC Entry Bodies/Human Male')
  const skeletonBody = characters.find((character) => character.labels.lpc_path === 'LPC Entry Bodies/Skeleton')
  const copperAndrogynous = characters.find((character) => character.labels.lpc_path === 'Androgynous Bases/Copper')
  const cometAndrogynous = characters.find((character) => character.labels.lpc_path === 'Androgynous Bases/Comet')
  const copperStandWalk = characters.find((character) => character.labels.lpc_path === 'Stand & Walk Bases/Copper')
  const cometStandWalk = characters.find((character) => character.labels.lpc_path === 'Stand & Walk Bases/Comet')
  const feminineAmber = characters.find((character) => character.labels.lpc_path === '[LPC Revised] Character Basics/Body/Feminine, Thin/Amber')
  const masculineAmber = characters.find((character) => character.labels.lpc_path === '[LPC Revised] Character Basics/Body/Masculine, Thin/Amber')
  const chairFragments = characters.filter((character) => String(character.labels.lpc_path).includes('Sitting - Chair'))
  const lpcPartGroups = characters.filter((character) => character.labels.lpc_role === 'part')
  const slashPartLabels = new Set(
    lpcPartGroups
      .filter((character) => character.animation_names.includes('slash'))
      .map((character) => character.labels.lpc_part_label),
  )

  assert.deepEqual(humanBody?.animation_names, ['walk', 'spellcast', 'shoot', 'slash', 'thrust', 'hurt'])
  assert.equal(humanBody?.directions.south.walk.frame_count, 9)
  assert.equal(humanBody?.directions.south.spellcast.frame_count, 7)
  assert.equal(humanBody?.directions.south.shoot.frame_count, 13)
  assert.equal(humanBody?.directions.south.slash.frame_count, 6)
  assert.equal(humanBody?.directions.south.thrust.frame_count, 8)
  assert.equal(humanBody?.directions.south.hurt.frame_count, 6)
  assert.deepEqual(skeletonBody?.animation_names, ['walk', 'spellcast', 'shoot', 'slash', 'hurt'])
  assert.deepEqual(copperAndrogynous?.animation_names, ['idle', 'walk', 'spellcast', 'shoot', 'slash', 'thrust', 'hurt'])
  assert.deepEqual(cometAndrogynous?.animation_names, ['idle', 'walk', 'spellcast', 'shoot', 'slash', 'thrust', 'hurt'])
  assert.equal(cometAndrogynous?.directions.south.idle.frame_count, 1)
  assert.equal(cometAndrogynous?.directions.south.walk.frame_count, 8)
  assert.equal(cometAndrogynous?.directions.south.spellcast.frame_count, 7)
  assert.equal(cometAndrogynous?.directions.south.shoot.frame_count, 13)
  assert.equal(cometAndrogynous?.directions.south.slash.frame_count, 6)
  assert.equal(cometAndrogynous?.directions.south.thrust.frame_count, 8)
  assert.equal(cometAndrogynous?.directions.south.hurt.frame_count, 6)
  assert.equal(cometAndrogynous?.directions.south.walk.frames.at(-1).source_rect.x, 448)
  assert.equal(cometAndrogynous?.directions.south.shoot.frames.at(-1).source_rect.x, 768)
  assert.deepEqual(copperStandWalk?.animation_names, ['idle', 'walk'])
  assert.equal(cometStandWalk?.directions.south.idle.frame_count, 1)
  assert.equal(cometStandWalk?.directions.south.walk.frame_count, 8)
  assert.deepEqual(feminineAmber?.animation_names, ['idle', 'walk', 'run', 'jump', 'sitting', 'emotes'])
  assert.deepEqual(masculineAmber?.animation_names, ['idle', 'walk', 'run', 'jump', 'sitting', 'emotes'])
  assert.equal(feminineAmber?.directions.south.idle.frame_count, 3)
  assert.equal(feminineAmber?.directions.south.walk.frame_count, 8)
  assert.equal(feminineAmber?.directions.south.run.frame_count, 8)
  assert.equal(feminineAmber?.directions.south.jump.frame_count, 6)
  assert.equal(feminineAmber?.directions.south.sitting.frame_count, 3)
  assert.equal(feminineAmber?.directions.south.emotes.frame_count, 3)
  assert.equal(slashPartLabels.has('torso'), true)
  assert.equal(slashPartLabels.has('legs'), true)
  assert.equal(slashPartLabels.has('accessory'), true)
  assert.equal(slashPartLabels.has('weapon'), true)
  assert.equal(chairFragments.length, 0)
})

test('every revised LPC body base file maps to its matching animation label', { skip: realLpcInventorySkip }, async () => {
  const inventory = JSON.parse(await readFile(realLpcInventoryUrl, 'utf8'))
  const characters = buildLpcCharacterManifests(inventory).filter((character) => character.labels.lpc_role === 'base')
  const baseCharactersByPath = new Map(characters.map((character) => [character.labels.lpc_path, character]))
  const revisedBodySheets = inventory.sheets.filter(isRevisedBodyBaseSheet)
  const revisedBodyGroups = new Map()
  const issues = []

  for (const sheet of revisedBodySheets) {
    const groupPath = sheet.path.replaceAll('\\', '/').replace(/\/[^/]+\.png$/i, '')
    const expectedAnimation = expectedAnimationFromLpcPath(sheet.path)
    const character = baseCharactersByPath.get(groupPath)
    const animation = character?.animations.find((item) => item.name === expectedAnimation)
    const expectedFrameCount = sheet.frame_columns
    revisedBodyGroups.set(groupPath, (revisedBodyGroups.get(groupPath) ?? 0) + 1)

    if (!character) {
      issues.push(`${sheet.path} did not produce an LPC base character`)
      continue
    }
    if (!animation) {
      issues.push(`${sheet.path} did not produce ${expectedAnimation}`)
      continue
    }
    if (!animation.source_names.includes(sheet.path)) {
      issues.push(`${sheet.path} was not recorded as the source for ${expectedAnimation}`)
    }

    for (const [direction, expectedRow] of [['north', 0], ['east', 1], ['south', 2], ['west', 3]]) {
      const frames = animation.directions[direction] ?? []
      if (frames.length !== expectedFrameCount) {
        issues.push(`${sheet.path} ${expectedAnimation}/${direction} has ${frames.length} frame(s), expected ${expectedFrameCount}`)
      }
      for (const frame of frames) {
        const rect = frame.source_rect
        if (!rect) {
          issues.push(`${sheet.path} ${expectedAnimation}/${direction}/${frame.index} is missing a source rect`)
          continue
        }
        if (rect.x !== frame.index * sheet.frame_width || rect.y !== expectedRow * sheet.frame_height || rect.w !== sheet.frame_width || rect.h !== sheet.frame_height) {
          issues.push(`${sheet.path} ${expectedAnimation}/${direction}/${frame.index} uses ${JSON.stringify(rect)}, expected row ${expectedRow}`)
        }
      }
    }
  }

  assert.equal(revisedBodySheets.length, 552)
  assert.equal(revisedBodyGroups.size, 92)
  assert.deepEqual(issues, [])
})

test('all generated LPC base frames are valid cropped animation cells', { skip: realLpcInventorySkip }, async () => {
  const inventory = JSON.parse(await readFile(realLpcInventoryUrl, 'utf8'))
  const baseCharacters = buildLpcCharacterManifests(inventory).filter((character) => character.labels.lpc_role === 'base')
  const pngCache = new Map()
  const allowedAnimations = new Set(['idle', 'walk', 'run', 'jump', 'sitting', 'emotes', 'spellcast', 'shoot', 'slash', 'thrust', 'hurt', 'attack'])
  const issues = []

  for (const character of baseCharacters) {
    for (const animation of character.animation_names) {
      if (!allowedAnimations.has(animation)) {
        issues.push(`${character.labels.lpc_path} has non-canonical animation label ${animation}`)
      }
      for (const sourcePath of character.animations.find((item) => item.name === animation)?.source_names ?? []) {
        const expectedAnimation = expectedAnimationFromLpcPath(sourcePath)
        if (expectedAnimation && expectedAnimation !== animation) {
          issues.push(`${character.labels.lpc_path} maps ${sourcePath} to ${animation}, expected ${expectedAnimation}`)
        }
      }

      for (const direction of ['north', 'east', 'south', 'west']) {
        const frames = character.directions[direction]?.[animation]?.frames ?? []
        if (frames.length === 0) {
          issues.push(`${character.labels.lpc_path} ${animation}/${direction} has no frames`)
        }

        for (const frame of frames) {
          const rect = frame.source_rect ?? { x: 0, y: 0, w: 64, h: 64 }
          const png = await readCachedPng(pngCache, frame.path)
          if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > png.width || rect.y + rect.h > png.height) {
            issues.push(`${character.labels.lpc_path} ${animation}/${direction}/${frame.index} crops outside ${png.width}x${png.height}`)
            continue
          }
          const alphaPixels = countOpaquePixels(png, rect)
          if (alphaPixels === 0) {
            issues.push(`${character.labels.lpc_path} ${animation}/${direction}/${frame.index} is empty`)
          }
          if (alphaPixels === rect.w * rect.h) {
            issues.push(`${character.labels.lpc_path} ${animation}/${direction}/${frame.index} is a fully opaque cell`)
          }
        }
      }
    }
  }

  assert.deepEqual(issues, [])
})

test('creator cockpit readiness summarizes selected reviewed parts and warnings', () => {
  const parts = [
    makeExtractedPart({ part_id: 'reviewed_head', label: 'head', reviewed: true, warnings: ['credit/license missing'] }),
    makeExtractedPart({ part_id: 'draft_torso', label: 'torso', reviewed: false }),
  ]

  const readiness = buildRecipeReadiness({
    selectedPartIds: { head: 'reviewed_head', torso: 'draft_torso' },
    partLibrary: parts,
    layerLabels: ['head', 'torso', 'front_arm'],
  })

  assert.equal(readiness.selectedPartCount, 2)
  assert.equal(readiness.reviewedSelectedPartCount, 1)
  assert.equal(readiness.unreviewedSelectedPartCount, 1)
  assert.equal(readiness.missingReviewedLayerCount, 2)
  assert.equal(readiness.warningCount, 1)
  assert.equal(readiness.state, 'needs_review')
})

test('compatibility filtering ignores stale LPC part selections on non-LPC mannequins', () => {
  const spriteCharacter = makeCharacterManifest()
  const lpcCharacter = {
    ...spriteCharacter,
    character_id: 'lpc-base-copper',
    class_type: 'lpc_character',
    labels: { lpc_role: 'base' },
  }
  const lpcPart = makeExtractedPart({
    part_id: 'lpc_torso_sheet',
    character_id: 'lpc-torso-sheet',
    label: 'torso',
    tags: ['lpc'],
  })
  const lpcSelection = resolveCompatiblePartSelection(lpcCharacter, lpcPart, 'lpc-source-torso')
  const spriteSelection = resolveCompatiblePartSelection(spriteCharacter, lpcPart, 'lpc-source-torso')

  assert.equal(lpcSelection.compatibleSelectedPart?.part_id, 'lpc_torso_sheet')
  assert.equal(lpcSelection.compatibleSelectedSource, 'lpc-source-torso')
  assert.equal(spriteSelection.compatibleSelectedPart, undefined)
  assert.equal(spriteSelection.compatibleSelectedSource, undefined)
})

test('creator cockpit filters reviewed parts while keeping the selected part visible', () => {
  const parts = [
    makeExtractedPart({ part_id: 'apes_head', label: 'head', extraction_method: 'apes', tags: ['qa_harness'] }),
    makeExtractedPart({ part_id: 'manual_head', label: 'head', extraction_method: 'manual', tags: ['cleanup'] }),
    makeExtractedPart({ part_id: 'manual_torso', label: 'torso', extraction_method: 'manual' }),
  ]

  const filtered = filterReviewedPartsForLayer({
    reviewedParts: parts,
    label: 'head',
    query: 'qa',
    method: 'manual',
    selectedPartId: 'manual_head',
  })

  assert.deepEqual(filtered.map((part) => part.part_id), ['manual_head'])
})

test('creator cockpit export target lookup falls back to generic profile', () => {
  assert.equal(exportTargetProfiles.length, 6)
  assert.equal(getExportTargetProfile('godot_4').recommendedActionTestId, 'export-full-package-zip')
  assert.equal(getExportTargetProfile('lpc_oversize').lpcExportProfile, 'oversize')
  assert.equal(getExportTargetProfile('not-real').id, 'generic')
})

test('recipes can borrow animation coverage from a motion source character', () => {
  const baseCharacter = makeCharacterManifest()
  const motionSource = {
    ...makeCharacterManifest(),
    character_id: 'attack_driver',
    display_name: 'Attack Driver',
    animation_names: ['idle', 'slash'],
  }

  assert.deepEqual(getRecipeAnimationCoverage(baseCharacter, motionSource), ['idle', 'slash'])
  assert.deepEqual(getRecipeAnimationCoverage(baseCharacter, undefined), ['idle'])
})

function setAlpha(pixels, width, x, y, alpha) {
  pixels[(y * width + x) * 4 + 3] = alpha
}

function isRevisedBodyBaseSheet(sheet) {
  const normalizedPath = sheet.path.replaceAll('\\', '/').toLowerCase()
  return sheet.lpc_grid &&
    normalizedPath.startsWith('[lpc revised] character basics/body/') &&
    !normalizedPath.includes('/adult heads/') &&
    !normalizedPath.includes('/child heads/') &&
    sheet.tags.includes('body') &&
    Boolean(expectedAnimationFromLpcPath(sheet.path))
}

function expectedAnimationFromLpcPath(sourcePath) {
  const segments = String(sourcePath)
    .replace(/\.png$/i, '')
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean)
  for (const segment of segments.slice().reverse()) {
    const normalized = segment.toLowerCase().replace(/[^a-z0-9]+/g, '')
    if (normalized === 'walkcycle' || normalized === 'walk') return 'walk'
    if (normalized === 'run') return 'run'
    if (normalized === 'jump') return 'jump'
    if (normalized === 'sitting' || normalized === 'sit') return 'sitting'
    if (normalized === 'emotes' || normalized === 'emote') return 'emotes'
    if (normalized === 'magic' || normalized === 'spellcast' || normalized === 'spell') return 'spellcast'
    if (normalized === 'shoot' || normalized === 'bow') return 'shoot'
    if (normalized === 'swing' || normalized === 'slash') return 'slash'
    if (normalized === 'thrust') return 'thrust'
    if (normalized === 'attack') return 'attack'
    if (normalized === 'hurt') return 'hurt'
    if (normalized === 'idle') return 'idle'
  }
  return undefined
}

async function readCachedPng(cache, browserPath) {
  const filePath = path.join(process.cwd(), browserPath.replace(/^\/assets\//, 'assets/'))
  const cached = cache.get(filePath)
  if (cached) return cached
  const png = PNG.sync.read(await readFile(filePath))
  cache.set(filePath, png)
  return png
}

function countOpaquePixels(png, rect) {
  let count = 0
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] > 0) count += 1
    }
  }
  return count
}

function makeLayerBundle(...parts) {
  return {
    format: 'pixel_creator_layer_bundle',
    version: 1,
    bundle_id: 'validation_bundle',
    parts: parts.map((part, index) => ({
      id: `validation_part_${index}`,
      label: 'head',
      image: { path: '/assets/head.png', bounds: { x: 0, y: 0, w: 64, h: 64 } },
      ...part,
    })),
  }
}

function makeExtractedPart(overrides = {}) {
  return {
    part_id: overrides.part_id ?? 'part_head',
    character_id: overrides.character_id ?? 'source_hero',
    label: overrides.label ?? 'head',
    source_animation: 'idle',
    source_direction: 'south',
    image_path: '/parts/head.png',
    mask_path: '/parts/head_mask.png',
    anchor: { x: 0, y: 0 },
    bounds: { x: 0, y: 0, w: 16, h: 16 },
    extraction_method: overrides.extraction_method ?? 'manual',
    compatibility: {
      animations: ['idle'],
      directions: ['south'],
    },
    reviewed: overrides.reviewed ?? true,
    tags: overrides.tags ?? [],
    warnings: overrides.warnings ?? [],
  }
}

function makeCharacterManifest() {
  return {
    character_id: 'source_hero',
    display_name: 'Source Hero',
    class_type: 'hero',
    source_folder: '/assets/source_hero',
    canvas_size: { width: 64, height: 64 },
    directions: {
      south: {
        idle: {
          frame_count: 2,
          frames: [
            { index: 0, path: '/assets/source_hero/idle/south/0.png', file_name: '0.png', width: 64, height: 64 },
            { index: 1, path: '/assets/source_hero/idle/south/1.png', file_name: '1.png', width: 64, height: 64 },
          ],
        },
      },
    },
    animations: [
      {
        name: 'idle',
        source_names: ['idle'],
        directions: {
          south: [
            { index: 0, path: '/assets/source_hero/idle/south/0.png', file_name: '0.png', width: 64, height: 64 },
            { index: 1, path: '/assets/source_hero/idle/south/1.png', file_name: '1.png', width: 64, height: 64 },
          ],
        },
        preview_gifs: [],
      },
    ],
    animation_names: ['idle'],
    source_quality_warnings: [],
    rotation_preview_paths: [],
    representative_frame: '/assets/source_hero/idle/south/0.png',
    extraction_status: {
      frame_chopped: true,
      preset_regions_available: true,
      connected_pixel_pass_available: true,
      apes_pass_available: true,
      manual_cleanup_complete: false,
    },
  }
}
