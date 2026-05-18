import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMissingAnimationQueue, filterMissingAnimationQueue } from '../../src/missingAnimationQueue.ts'

test('missing animation queue groups unsupported catalog draw records for AI/APES handoff', () => {
  const queue = buildMissingAnimationQueue({
    catalog: makeCatalog(),
    recipe: makeRecipe(),
    bodyType: 'male',
    animations: ['walk'],
    directions: ['south', 'east'],
    frameRange: [0, 1],
  })

  assert.equal(queue.summary.issue_count, 1)
  assert.equal(queue.summary.unsupported_count, 1)
  assert.equal(queue.summary.missing_count, 0)
  assert.deepEqual(queue.items.map((item) => ({
    item_id: item.item_id,
    layer_id: item.layer_id,
    status: item.status,
    requested_animation: item.requested_animation,
    affected_frame_count: item.affected_frames.length,
  })), [{
    item_id: 'weapon:weapon_sword_longsword',
    layer_id: 'layer_2',
    status: 'unsupported',
    requested_animation: 'walk',
    affected_frame_count: 4,
  }])
  assert.match(queue.items[0].warnings[0], /oversize export profile/)
})

test('missing animation queue ignores exact and fallback records', () => {
  const queue = buildMissingAnimationQueue({
    catalog: makeCatalog(),
    recipe: {
      ...makeRecipe(),
      lpc_selections: {
        cape: { slot_id: 'cape', item_id: 'cape:cape_solid', variant: 'black', type_name: 'cape', enabled: true },
      },
    },
    bodyType: 'male',
    animations: ['idle'],
    directions: ['south'],
    frameRange: [0, 0],
  })

  assert.equal(queue.summary.issue_count, 0)
  assert.deepEqual(queue.items, [])
})

test('missing animation queue filtering removes consumed items and recomputes summary', () => {
  const queue = buildMissingAnimationQueue({
    catalog: makeCatalog(),
    recipe: makeRecipe(),
    bodyType: 'male',
    animations: ['walk'],
    directions: ['south', 'east'],
    frameRange: [0, 1],
  })

  const filtered = filterMissingAnimationQueue(queue, new Set([queue.items[0].id]))

  assert.equal(filtered.summary.issue_count, 0)
  assert.equal(filtered.summary.affected_frame_count, 0)
  assert.deepEqual(filtered.items, [])
})

function makeRecipe() {
  return {
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
}

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
    summary: { item_count: 2, layer_count: 3, variant_count: 2, credit_count: 0, type_counts: {} },
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
        layers: [{ layer_id: 'layer_1', z_pos: 85, paths_by_body_type: { male: 'cape/solid/female/' } }],
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
