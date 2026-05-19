import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLpcDrawRecords } from '../../src/lpcComposition.ts'

test('LPC composition sorts cape and xlong hair records by upstream z position', () => {
  const catalog = makeCatalog()
  const records = buildLpcDrawRecords({
    catalog,
    selections: {
      cape: { slot_id: 'cape', item_id: 'cape:cape_solid', variant: 'black', type_name: 'cape', enabled: true },
      hair: { slot_id: 'hair', item_id: 'hair:hair_xlong', variant: 'raven', type_name: 'hair', enabled: true },
    },
    bodyType: 'male',
    animation: 'walk',
    direction: 'south',
    frameIndex: 0,
  })

  assert.deepEqual(
    records.map((record) => `${record.item_id}:${record.layer_id}:${record.z_pos}`),
    [
      'cape:cape_solid:layer_2:5',
      'hair:hair_xlong:layer_2:9',
      'cape:cape_solid:layer_1:85',
      'hair:hair_xlong:layer_1:120',
    ],
  )
  assert.equal(records[0].source_path, 'spritesheets/cape/solid_behind/walk/black.png')
  assert.equal(records[3].source_path, 'spritesheets/hair/xlong/adult/fg/walk/raven.png')
})

test('LPC composition keeps required-tag failures visible and non-rendering', () => {
  const catalog = makeCatalog()
  const [record] = buildLpcDrawRecords({
    catalog,
    selections: {
      cape_trim: { slot_id: 'cape_trim', item_id: 'cape_trim:cape_trim', variant: 'white', type_name: 'cape_trim', enabled: true },
    },
    bodyType: 'male',
    animation: 'walk',
    direction: 'south',
    frameIndex: 0,
  })

  assert.equal(record.animation_status, 'unsupported')
  assert.deepEqual(record.warnings, ['Requires cape.'])
})

test('LPC composition classifies oversize weapon layers as unsupported for standard export', () => {
  const catalog = makeCatalog()
  const records = buildLpcDrawRecords({
    catalog,
    selections: {
      weapon: { slot_id: 'weapon', item_id: 'weapon:weapon_sword_longsword', variant: 'longsword', type_name: 'weapon', enabled: true },
    },
    bodyType: 'male',
    animation: 'walk',
    direction: 'south',
    frameIndex: 0,
    exportProfile: 'standard_64',
  })

  const oversize = records.find((record) => record.layer_id === 'layer_2')
  assert.equal(oversize.animation_status, 'unsupported')
  assert.equal(oversize.source_path, null)
  assert.match(oversize.warnings[0], /oversize export profile/)
})

test('LPC composition resolves oversize weapon layers exactly for oversize export', () => {
  const catalog = makeCatalog()
  const records = buildLpcDrawRecords({
    catalog,
    selections: {
      weapon: { slot_id: 'weapon', item_id: 'weapon:weapon_sword_longsword', variant: 'longsword', type_name: 'weapon', enabled: true },
    },
    bodyType: 'male',
    animation: 'walk',
    direction: 'south',
    frameIndex: 0,
    exportProfile: 'oversize',
  })

  const oversize = records.find((record) => record.layer_id === 'layer_2')
  assert.equal(oversize.animation_status, 'exact')
  assert.equal(oversize.source_path, 'spritesheets/weapon/sword/longsword/attack_slash/behind/slash_oversize/longsword.png')
  assert.deepEqual(oversize.source_rect, { x: 0, y: 0, w: 192, h: 192 })
  assert.deepEqual(oversize.dest_rect, { x: -64, y: -64, w: 192, h: 192 })
  assert.deepEqual(oversize.warnings, [])
})

test('LPC composition clamps eight-frame plate toe shoot sheets', () => {
  const catalog = makeCatalog()
  const [record] = buildLpcDrawRecords({
    catalog,
    selections: {
      toe: { slot_id: 'toe', item_id: 'shoes_toe:feet_plate_toe', variant: 'steel', type_name: 'shoes_toe', enabled: true },
    },
    bodyType: 'male',
    animation: 'shoot',
    direction: 'south',
    frameIndex: 12,
    availablePaths: new Set(['spritesheets/feet/accessory/plate_toe/male/shoot/steel.png']),
  })

  assert.equal(record.animation_status, 'exact')
  assert.equal(record.source_path, 'spritesheets/feet/accessory/plate_toe/male/shoot/steel.png')
  assert.deepEqual(record.source_rect, { x: 448, y: 0, w: 64, h: 64 })
})

function makeCatalog() {
  return {
    format: 'pixel_creator_lpc_catalog',
    version: 1,
    generated_at: '2026-05-18T00:00:00.000Z',
    source: {
      repo: 'https://example.test',
      reference_root: '/tmp/lpc',
      commit: null,
      has_upstream_sources: false,
      has_spritesheets: true,
      has_sheet_definitions: true,
      has_palette_definitions: false,
      has_credits_csv: false,
    },
    summary: { item_count: 5, layer_count: 8, variant_count: 5, credit_count: 0, type_counts: {} },
    items: {
      'cape:cape_solid': {
        item_id: 'cape:cape_solid',
        name: 'Solid',
        type_name: 'cape',
        path: ['torso', 'cape'],
        tags: ['cape'],
        required_tags: [],
        excluded_tags: [],
        required_body_types: ['male'],
        variants: ['black'],
        animations: ['walk'],
        preview: { row: 0, column: 0, x_offset: 0, y_offset: 0 },
        match_body_color: false,
        recolors: [],
        credits: [],
        layers: [
          { layer_id: 'layer_1', z_pos: 85, paths_by_body_type: { male: 'cape/solid/female/' } },
          { layer_id: 'layer_2', z_pos: 5, paths_by_body_type: { male: 'cape/solid_behind/' } },
        ],
      },
      'cape_trim:cape_trim': {
        item_id: 'cape_trim:cape_trim',
        name: 'Cape Trim',
        type_name: 'cape_trim',
        path: ['torso', 'cape'],
        tags: ['cape_trim'],
        required_tags: ['cape'],
        excluded_tags: [],
        required_body_types: ['male'],
        variants: ['white'],
        animations: ['walk'],
        preview: { row: 0, column: 0, x_offset: 0, y_offset: 0 },
        match_body_color: false,
        recolors: [],
        credits: [],
        layers: [{ layer_id: 'layer_1', z_pos: 90, paths_by_body_type: { male: 'cape/trim/female/' } }],
      },
      'hair:hair_xlong': {
        item_id: 'hair:hair_xlong',
        name: 'Xlong',
        type_name: 'hair',
        path: ['hair', 'xlong'],
        tags: ['hair'],
        required_tags: [],
        excluded_tags: [],
        required_body_types: ['male'],
        variants: ['raven'],
        animations: ['walk'],
        preview: { row: 0, column: 0, x_offset: 0, y_offset: 0 },
        match_body_color: false,
        recolors: [],
        credits: [],
        layers: [
          { layer_id: 'layer_1', z_pos: 120, paths_by_body_type: { male: 'hair/xlong/adult/fg/' } },
          { layer_id: 'layer_2', z_pos: 9, paths_by_body_type: { male: 'hair/xlong/adult/bg/' } },
        ],
      },
      'weapon:weapon_sword_longsword': {
        item_id: 'weapon:weapon_sword_longsword',
        name: 'Longsword',
        type_name: 'weapon',
        path: ['weapons', 'sword'],
        tags: ['weapon'],
        required_tags: [],
        excluded_tags: [],
        required_body_types: ['male'],
        variants: ['longsword'],
        animations: ['walk', 'slash_oversize'],
        preview: { row: 0, column: 0, x_offset: 0, y_offset: 0 },
        match_body_color: false,
        recolors: [],
        credits: [],
        layers: [
          { layer_id: 'layer_1', z_pos: 140, paths_by_body_type: { male: 'weapon/sword/longsword/' } },
          { layer_id: 'layer_2', z_pos: -1, custom_animation: 'slash_oversize', paths_by_body_type: { male: 'weapon/sword/longsword/attack_slash/behind/' } },
        ],
      },
      'shoes_toe:feet_plate_toe': {
        item_id: 'shoes_toe:feet_plate_toe',
        name: 'Plate Toe',
        type_name: 'shoes_toe',
        path: ['feet', 'accessory'],
        tags: ['shoes_toe'],
        required_tags: [],
        excluded_tags: [],
        required_body_types: ['male'],
        variants: ['steel'],
        animations: ['shoot'],
        preview: { row: 0, column: 0, x_offset: 0, y_offset: 0 },
        match_body_color: false,
        recolors: [],
        credits: [],
        layers: [{ layer_id: 'layer_1', z_pos: 60, paths_by_body_type: { male: 'feet/accessory/plate_toe/male/' } }],
      },
    },
    category_tree: { id: 'root', label: 'LPC Catalog', item_ids: [], children: [] },
    aliases: {},
    palettes: { definition_count: 0, names: [] },
  }
}
