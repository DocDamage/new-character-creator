import test from 'node:test'
import assert from 'node:assert/strict'

import { renderExportFilenameTemplate } from '../../src/filenameTemplates.ts'
import { buildGenerationManifest } from '../../src/generationManifest.ts'
import { layerBundleToExtractedParts, lpcSheetsToExtractedParts, parseLayerBundleManifest } from '../../src/layerBundle.ts'
import { buildLpcCharacterManifests } from '../../src/lpcCharacters.ts'
import { resolveCompatiblePartSelection } from '../../src/lpcPartCompatibility.ts'
import { analyzeAlphaData } from '../../src/sourceAnalysis.ts'
import {
  buildRecipeReadiness,
  exportTargetProfiles,
  filterReviewedPartsForLayer,
  getExportTargetProfile,
} from '../../src/creatorCockpit.ts'

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

  assert.equal(characters.length, 8)
  const shirtPart = characters.find((character) => character.labels.lpc_path === 'Clothes/Blue/Shirt, Long-Sleeved')
  const runPart = characters.find((character) => character.labels.lpc_path === 'Clothes/Blue/Shirt')
  const pantsPart = characters.find((character) => character.labels.lpc_path === 'Clothes/Blue/Pants')
  const bowPart = characters.find((character) => character.labels.lpc_path === 'lpc_entry/png/WEAPON_bow')
  const longEarsPart = characters.find((character) => character.labels.lpc_path === 'Long ears/LongEars_female_d')
  const magicBase = characters.find((character) => character.labels.lpc_path === 'Androgynous Bases/Copper')
  const standWalkBase = characters.find((character) => character.labels.lpc_path === 'Stand & Walk Bases/Copper')
  const partialSittingBase = characters.find((character) => character.labels.lpc_path === 'Bases/Androgynous/Recolors/Copper/Sitting - Chair')
  assert.equal(characters[0].class_type, 'lpc_character')
  assert.equal(characters[0].labels.lpc_role, 'base')
  assert.equal(shirtPart?.labels.lpc_role, 'part')
  assert.equal(shirtPart?.labels.lpc_part_label, 'torso')
  assert.deepEqual(runPart?.animation_names, ['run'])
  assert.deepEqual(pantsPart?.animation_names, ['idle', 'run'])
  assert.deepEqual(bowPart?.animation_names, ['shoot'])
  assert.equal(longEarsPart?.labels.lpc_part_label, 'face')
  assert.deepEqual(longEarsPart?.animation_names, ['spellcast', 'thrust', 'walk', 'slash', 'shoot', 'hurt'])
  assert.equal(longEarsPart?.directions.south.walk.frame_count, 9)
  assert.deepEqual(longEarsPart?.directions.south.walk.frames[0].source_rect, { x: 0, y: 640, w: 64, h: 64 })
  assert.deepEqual(longEarsPart?.directions.north.hurt.frames[0].source_rect, { x: 0, y: 1280, w: 64, h: 64 })
  assert.deepEqual(magicBase?.animation_names, ['idle', 'walk', 'spellcast', 'shoot', 'slash', 'thrust', 'hurt'])
  assert.deepEqual(standWalkBase?.animation_names, ['idle', 'walk'])
  assert.equal(partialSittingBase, undefined)
  assert.equal(characters[0].directions.south.idle.frame_count, 5)
  assert.deepEqual(characters[0].directions.east.idle.frames[0].source_rect, { x: 0, y: 64, w: 64, h: 64 })
  assert.deepEqual(characters[0].directions.south.idle.frames[0].source_rect, { x: 0, y: 128, w: 64, h: 64 })
  assert.equal(magicBase?.directions.north.hurt.frame_count, 7)
  assert.deepEqual(magicBase?.directions.north.hurt.frames[0].source_rect, { x: 0, y: 0, w: 64, h: 64 })
  assert.deepEqual(magicBase?.directions.south.hurt.frames[0].source_rect, { x: 0, y: 0, w: 64, h: 64 })
  assert.equal(characters[0].representative_frame, '/assets/lpc sprite generator stuff/Adult Female/Base, Adult Female.png')
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
  assert.equal(exportTargetProfiles.length, 5)
  assert.equal(getExportTargetProfile('godot_4').recommendedActionTestId, 'export-full-package-zip')
  assert.equal(getExportTargetProfile('not-real').id, 'generic')
})

function setAlpha(pixels, width, x, y, alpha) {
  pixels[(y * width + x) * 4 + 3] = alpha
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
