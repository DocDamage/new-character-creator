import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLpcRenderPlan } from '../../src/lpcRenderPlan.ts'

test('LPC render plan places low z catalog records behind the legacy body and high z records above it', () => {
  const recipe = {
    character_id: 'recipe_1',
    recipe_mode: 'lpc_character',
    source_family: 'lpc',
    base_canvas: [64, 64],
    base_character: 'lpc-body',
    lpc_selections: {
      cape: { slot_id: 'cape', item_id: 'cape:cape_solid', variant: 'black', type_name: 'cape', enabled: true },
    },
    layers: [],
    palette: { hue_shift: 0, saturation: 100, brightness: 100, team_color: 'default' },
    animation_coverage: ['walk'],
    export_targets: [],
  }
  const plan = buildLpcRenderPlan({
    catalog: makeCatalog(),
    recipe,
    bodyType: 'male',
    baseFrame: { path: '/body.png', source_rect: { x: 0, y: 0, w: 64, h: 64 } },
    animation: 'walk',
    direction: 'south',
    frameIndex: 0,
  })

  assert.deepEqual(plan.records.map((record) => record.kind), ['catalog', 'base_body', 'catalog'])
  assert.deepEqual(plan.records.map((record) => record.z_pos), [5, 50, 85])
})

test('LPC render plan converts catalog source paths into local reference URLs', () => {
  const recipe = {
    character_id: 'recipe_1',
    recipe_mode: 'lpc_character',
    source_family: 'lpc',
    base_canvas: [64, 64],
    base_character: 'lpc-body',
    lpc_selections: {
      cape: { slot_id: 'cape', item_id: 'cape:cape_solid', variant: 'black', type_name: 'cape', enabled: true },
    },
    layers: [],
    palette: { hue_shift: 0, saturation: 100, brightness: 100, team_color: 'default' },
    animation_coverage: ['walk'],
    export_targets: [],
  }
  const plan = buildLpcRenderPlan({
    catalog: makeCatalog(),
    recipe,
    bodyType: 'male',
    baseFrame: { path: '/body.png' },
    animation: 'walk',
    direction: 'south',
    frameIndex: 0,
  })

  const catalogRecord = plan.records.find((record) => record.kind === 'catalog')
  assert.equal(catalogRecord.source_path, '/@fs/C:/repo/data/cache/universal-lpc-generator/spritesheets/cape/solid_behind/walk/black.png')
})

test('LPC render plan uses oversize profile for oversize export targets', () => {
  const recipe = {
    character_id: 'recipe_1',
    recipe_mode: 'lpc_character',
    source_family: 'lpc',
    base_canvas: [64, 64],
    base_character: 'lpc-body',
    lpc_selections: {
      weapon: { slot_id: 'weapon', item_id: 'weapon:weapon_sword_longsword', variant: 'longsword', type_name: 'weapon', enabled: true },
    },
    layers: [],
    palette: { hue_shift: 0, saturation: 100, brightness: 100, team_color: 'default' },
    animation_coverage: ['walk'],
    export_targets: [],
  }
  const plan = buildLpcRenderPlan({
    catalog: makeCatalog(),
    recipe,
    bodyType: 'male',
    exportTargetProfile: 'lpc_oversize',
    animation: 'walk',
    direction: 'south',
    frameIndex: 0,
  })

  const oversizeRecord = plan.records.find((record) => record.draw_record?.layer_id === 'layer_2')
  assert.equal(oversizeRecord.draw_record.animation_status, 'exact')
  assert.deepEqual(oversizeRecord.source_rect, { x: 0, y: 0, w: 192, h: 192 })
  assert.deepEqual(oversizeRecord.dest_rect, { x: -64, y: -64, w: 192, h: 192 })
  assert.deepEqual(plan.warnings, [])
})

function makeCatalog() {
  return {
    format: 'pixel_creator_lpc_catalog',
    version: 1,
    generated_at: '2026-05-18T00:00:00.000Z',
    source: {
      repo: 'https://example.test',
      reference_root: 'C:/repo/data/cache/universal-lpc-generator',
      commit: 'abc123',
      has_upstream_sources: false,
      has_spritesheets: true,
      has_sheet_definitions: true,
      has_palette_definitions: false,
      has_credits_csv: true,
    },
    summary: { item_count: 2, layer_count: 4, variant_count: 2, credit_count: 0, type_counts: {} },
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
    },
    category_tree: { id: 'root', label: 'LPC Catalog', item_ids: [], children: [] },
    aliases: {},
    palettes: { definition_count: 0, names: [] },
  }
}
