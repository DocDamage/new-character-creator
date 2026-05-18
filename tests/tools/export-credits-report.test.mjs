import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCreditsReport } from '../../src/creditsReport.ts'

test('credits report includes selected LPC catalog item attribution', () => {
  const report = buildCreditsReport(makeCharacter(), makeRecipe({
    cape: { slot_id: 'cape', item_id: 'cape:cape_solid', variant: 'black', type_name: 'cape', enabled: true },
  }), [], makeCatalog())

  assert.equal(report.summary.selected_lpc_catalog_item_count, 1)
  assert.equal(report.summary.missing_lpc_catalog_credit_count, 0)
  assert.equal(report.summary.release_blocking, false)
  assert.deepEqual(report.selected_lpc_catalog_items.map((item) => ({
    item_id: item.item_id,
    variant: item.variant,
    authors: item.authors,
    licenses: item.licenses,
    urls: item.urls,
    status: item.status,
  })), [{
    item_id: 'cape:cape_solid',
    variant: 'black',
    authors: ['Artist'],
    licenses: ['OGA-BY 3.0'],
    urls: ['https://example.test/cape'],
    status: 'ok',
  }])
})

test('credits report blocks release for selected LPC catalog items without attribution', () => {
  const report = buildCreditsReport(makeCharacter(), makeRecipe({
    hair: { slot_id: 'hair', item_id: 'hair:hair_xlong', variant: 'raven', type_name: 'hair', enabled: true },
  }), [], makeCatalog())

  assert.equal(report.summary.selected_lpc_catalog_item_count, 1)
  assert.equal(report.summary.missing_lpc_catalog_credit_count, 1)
  assert.equal(report.summary.release_blocking, true)
  assert.deepEqual(report.selected_lpc_catalog_items.map((item) => [item.item_id, item.status]), [
    ['hair:hair_xlong', 'missing'],
  ])
})

function makeCharacter() {
  return {
    character_id: 'lpc-body',
    display_name: 'LPC Body',
    source_folder: '/fixtures/lpc-body',
    class_type: 'lpc_character',
    labels: { lpc_role: 'body' },
    width: 64,
    height: 64,
    frame_width: 64,
    frame_height: 64,
    animation_names: ['walk'],
    animations: {},
  }
}

function makeRecipe(lpcSelections) {
  return {
    character_id: 'recipe_1',
    recipe_mode: 'lpc_character',
    source_family: 'lpc',
    base_canvas: [64, 64],
    base_character: 'lpc-body',
    lpc_selections: lpcSelections,
    layers: [],
    palette: { hue_shift: 0, saturation: 100, brightness: 100, team_color: 'default' },
    animation_coverage: ['walk'],
    export_targets: [],
  }
}

function makeCatalog() {
  return {
    format: 'pixel_creator_lpc_catalog',
    version: 1,
    generated_at: '2026-05-18T00:00:00.000Z',
    source: {
      repo: 'https://example.test/repo',
      reference_root: '/tmp/lpc',
      commit: 'abc123',
      has_upstream_sources: false,
      has_spritesheets: true,
      has_sheet_definitions: true,
      has_palette_definitions: false,
      has_credits_csv: true,
    },
    summary: { item_count: 2, layer_count: 2, variant_count: 2, credit_count: 1, type_counts: {} },
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
        layers: [{ layer_id: 'layer_1', z_pos: 85, paths_by_body_type: { male: 'cape/solid/' } }],
        credits: [{ file: 'cape/solid', notes: '', authors: ['Artist'], licenses: ['OGA-BY 3.0'], urls: ['https://example.test/cape'] }],
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
        layers: [{ layer_id: 'layer_1', z_pos: 120, paths_by_body_type: { male: 'hair/xlong/' } }],
        credits: [],
      },
    },
    category_tree: { id: 'root', label: 'LPC Catalog', item_ids: [], children: [] },
    aliases: {},
    palettes: { definition_count: 0, names: [] },
  }
}
