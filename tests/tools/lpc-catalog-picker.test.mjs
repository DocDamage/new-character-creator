import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLpcCatalogPickerOptions,
  buildLpcSelectionCreditReadiness,
} from '../../src/lpcCatalogPicker.ts'

test('LPC catalog picker filters by slot and marks unmet required tags', () => {
  const catalog = makeCatalog()
  const options = buildLpcCatalogPickerOptions({
    catalog,
    slotId: 'cape_trim',
    selections: {
      cape_trim: { slot_id: 'cape_trim', item_id: 'cape_trim:cape_trim', variant: 'white', type_name: 'cape_trim', enabled: true },
    },
    bodyType: 'male',
    animation: 'walk',
  })

  assert.deepEqual(options.map((option) => option.item_id), ['cape_trim:cape_trim'])
  assert.equal(options[0].compatibility_state, 'blocked')
  assert.deepEqual(options[0].warnings, ['Requires cape.'])
})

test('LPC catalog picker clears required-tag warnings when compatible base is selected', () => {
  const catalog = makeCatalog()
  const options = buildLpcCatalogPickerOptions({
    catalog,
    slotId: 'cape_trim',
    selections: {
      cape: { slot_id: 'cape', item_id: 'cape:cape_solid', variant: 'black', type_name: 'cape', enabled: true },
      cape_trim: { slot_id: 'cape_trim', item_id: 'cape_trim:cape_trim', variant: 'white', type_name: 'cape_trim', enabled: true },
    },
    bodyType: 'male',
    animation: 'walk',
  })

  assert.equal(options[0].compatibility_state, 'ready')
  assert.deepEqual(options[0].warnings, [])
})

test('LPC catalog picker marks oversize custom animation layers as degraded in standard export', () => {
  const catalog = makeCatalog()
  const options = buildLpcCatalogPickerOptions({
    catalog,
    slotId: 'weapon',
    selections: {},
    bodyType: 'male',
    animation: 'walk',
  })

  const longsword = options.find((option) => option.item_id === 'weapon:weapon_sword_longsword')
  assert.equal(longsword.compatibility_state, 'degraded')
  assert.match(longsword.warnings.join(' '), /oversize export profile/)
})

test('LPC selected-item credit readiness reports missing and review-needed credits', () => {
  const catalog = makeCatalog()
  const readiness = buildLpcSelectionCreditReadiness(catalog, {
    cape: { slot_id: 'cape', item_id: 'cape:cape_solid', variant: 'black', type_name: 'cape', enabled: true },
    hair: { slot_id: 'hair', item_id: 'hair:hair_xlong', variant: 'raven', type_name: 'hair', enabled: true },
    weapon: { slot_id: 'weapon', item_id: 'weapon:weapon_sword_longsword', variant: 'longsword', type_name: 'weapon', enabled: false },
  })

  assert.equal(readiness.selected_count, 2)
  assert.equal(readiness.ok_count, 1)
  assert.equal(readiness.missing_count, 1)
  assert.equal(readiness.release_blocking, true)
  assert.deepEqual(readiness.items.map((item) => [item.item_id, item.status]), [
    ['cape:cape_solid', 'ok'],
    ['hair:hair_xlong', 'missing'],
  ])
})

function makeCatalog() {
  return {
    format: 'pixel_creator_lpc_catalog',
    version: 1,
    generated_at: '2026-05-18T00:00:00.000Z',
    source: {
      repo: 'https://example.test',
      reference_root: '/tmp/lpc',
      commit: 'abc123',
      has_upstream_sources: false,
      has_spritesheets: true,
      has_sheet_definitions: true,
      has_palette_definitions: false,
      has_credits_csv: true,
    },
    summary: { item_count: 4, layer_count: 5, variant_count: 4, credit_count: 2, type_counts: {} },
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
        layers: [{ layer_id: 'layer_1', z_pos: 85, paths_by_body_type: { male: 'cape/solid/female/' } }],
        credits: [{ file: 'cape/solid', notes: '', authors: ['Artist'], licenses: ['OGA-BY 3.0'], urls: ['https://example.test'] }],
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
        layers: [{ layer_id: 'layer_1', z_pos: 90, paths_by_body_type: { male: 'cape/trim/female/' } }],
        credits: [{ file: 'cape/trim', notes: 'review attribution', authors: ['Artist'], licenses: ['GPL 3.0'], urls: [] }],
      },
      'hair:hair_xlong': {
        item_id: 'hair:hair_xlong',
        name: 'Xlong',
        type_name: 'hair',
        path: ['hair'],
        tags: ['hair'],
        required_tags: [],
        excluded_tags: [],
        required_body_types: ['male'],
        variants: ['raven'],
        animations: ['walk'],
        preview: { row: 0, column: 0, x_offset: 0, y_offset: 0 },
        match_body_color: false,
        recolors: [],
        layers: [{ layer_id: 'layer_1', z_pos: 120, paths_by_body_type: { male: 'hair/xlong/adult/fg/' } }],
        credits: [],
      },
      'weapon:weapon_sword_longsword': {
        item_id: 'weapon:weapon_sword_longsword',
        name: 'Longsword',
        type_name: 'weapon',
        path: ['weapons'],
        tags: ['weapon'],
        required_tags: [],
        excluded_tags: [],
        required_body_types: ['male'],
        variants: ['longsword'],
        animations: ['walk', 'slash_oversize'],
        preview: { row: 0, column: 0, x_offset: 0, y_offset: 0 },
        match_body_color: false,
        recolors: [],
        layers: [
          { layer_id: 'layer_1', z_pos: 140, paths_by_body_type: { male: 'weapon/sword/longsword/' } },
          { layer_id: 'layer_2', z_pos: -1, custom_animation: 'slash_oversize', paths_by_body_type: { male: 'weapon/sword/longsword/attack_slash/behind/' } },
        ],
        credits: [{ file: 'weapon/sword/longsword', notes: '', authors: [], licenses: [], urls: [] }],
      },
    },
    category_tree: { id: 'root', label: 'LPC Catalog', item_ids: [], children: [] },
    aliases: {},
    palettes: { definition_count: 0, names: [] },
  }
}
