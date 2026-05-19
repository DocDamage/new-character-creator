import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { buildLpcCatalog } from '../../tools/build-lpc-catalog.js'

test('LPC catalog parses contiguous layers, tags, variants, credits, and custom animations', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pixel-creator-lpc-catalog-'))
  const referenceRoot = path.join(root, 'universal-lpc')
  await mkdir(path.join(referenceRoot, 'sheet_definitions', 'torso', 'cape'), { recursive: true })
  await mkdir(path.join(referenceRoot, 'sheet_definitions', 'hair', 'xlong'), { recursive: true })
  await mkdir(path.join(referenceRoot, 'sheet_definitions', 'weapons', 'sword'), { recursive: true })
  await mkdir(path.join(referenceRoot, 'sheet_definitions', 'weapons', 'shields'), { recursive: true })
  await mkdir(path.join(referenceRoot, 'palette_definitions'), { recursive: true })
  await mkdir(path.join(referenceRoot, 'spritesheets'), { recursive: true })
  await writeFile(path.join(referenceRoot, 'CREDITS.csv'), 'file,authors,licenses\n')
  await writeFile(path.join(referenceRoot, 'palette_definitions', 'meta_ulpc.json'), '{}')
  await writeDefinition(referenceRoot, 'torso/cape/cape_solid.json', {
    name: 'Solid',
    tags: ['back', 'cape'],
    layer_1: { zPos: 85, male: 'cape/solid/female/' },
    layer_2: { zPos: 5, male: 'cape/solid_behind/' },
    variants: ['black', 'blue'],
    credits: [{ file: 'cape/solid', notes: '', authors: ['Artist'], licenses: ['OGA-BY 3.0'], urls: ['https://example.test'] }],
    type_name: 'cape',
  })
  await writeDefinition(referenceRoot, 'torso/cape/cape_trim.json', {
    name: 'Cape Trim',
    tags: ['back', 'cape_trim'],
    required_tags: ['cape'],
    layer_1: { zPos: 90, male: 'cape/trim/female/' },
    variants: ['black'],
    type_name: 'cape_trim',
  })
  await writeDefinition(referenceRoot, 'hair/xlong/hair_xlong.json', {
    name: 'Xlong',
    layer_1: { zPos: 120, male: 'hair/xlong/adult/fg/' },
    layer_2: { zPos: 9, male: 'hair/xlong/adult/bg/' },
    recolors: { material: 'hair', palettes: ['ulpc'] },
    type_name: 'hair',
  })
  await writeDefinition(referenceRoot, 'weapons/sword/weapon_sword_longsword.json', {
    name: 'Longsword',
    layer_1: { zPos: 140, male: 'weapon/sword/longsword/' },
    layer_2: { zPos: -1, custom_animation: 'slash_oversize', male: 'weapon/sword/longsword/attack_slash/behind/' },
    variants: ['longsword'],
    animations: ['walk', 'slash_oversize'],
    type_name: 'weapon',
  })
  await writeDefinition(referenceRoot, 'weapons/shields/shield_kite.json', {
    name: 'Kite',
    layer_1: { zPos: 110, male: 'shield/kite/male/' },
    variants: ['kite gray'],
    type_name: 'shield',
  })

  const catalog = buildLpcCatalog({ referenceRoot, generatedAt: '2026-05-18T00:00:00.000Z' })
  assert.equal(catalog.format, 'pixel_creator_lpc_catalog')
  assert.equal(catalog.summary.item_count, 5)
  assert.equal(catalog.summary.layer_count, 8)
  assert.equal(catalog.source.has_upstream_sources, false)
  assert.equal(catalog.source.has_spritesheets, true)
  assert.equal(catalog.source.has_credits_csv, true)

  const cape = catalog.items['cape:cape_solid']
  assert.deepEqual(cape.layers.map((layer) => layer.z_pos), [85, 5])
  assert.deepEqual(cape.variants, ['black', 'blue'])
  assert.equal(cape.credits[0].authors[0], 'Artist')

  const trim = catalog.items['cape_trim:cape_trim']
  assert.deepEqual(trim.required_tags, ['cape'])

  const hair = catalog.items['hair:hair_xlong']
  assert.deepEqual(hair.layers.map((layer) => layer.z_pos), [120, 9])
  assert.deepEqual(hair.recolors, [{ material: 'hair', palettes: ['ulpc'] }])

  const longsword = catalog.items['weapon:weapon_sword_longsword']
  assert.equal(longsword.layers[1].custom_animation, 'slash_oversize')
  assert.ok(longsword.animations.includes('slash_oversize'))
})

test('LPC catalog prefers local CC0 license over upstream sheet-definition credits', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pixel-creator-lpc-local-license-'))
  const referenceRoot = path.join(root, 'universal-lpc')
  const assetRoot = path.join(root, 'local-lpc')
  await mkdir(path.join(referenceRoot, 'sheet_definitions', 'torso', 'cape'), { recursive: true })
  await mkdir(assetRoot, { recursive: true })
  await writeFile(path.join(assetRoot, 'license.txt'), 'Public Domain Dedication (CC0 1.0)\nCredit optional.\n')
  await writeDefinition(referenceRoot, 'torso/cape/cape_solid.json', {
    name: 'Solid',
    tags: ['back', 'cape'],
    layer_1: { zPos: 85, male: 'cape/solid/female/' },
    credits: [{ file: 'cape/solid', notes: '', authors: ['Wrong Upstream Artist'], licenses: ['OGA-BY 3.0'], urls: ['https://example.test'] }],
    type_name: 'cape',
  })

  const catalog = buildLpcCatalog({ referenceRoot, assetRoot, generatedAt: '2026-05-18T00:00:00.000Z' })
  const cape = catalog.items['cape:cape_solid']

  assert.equal(catalog.source.credit_basis, 'local_asset_license')
  assert.equal(catalog.source.local_asset_license.license, 'CC0 1.0')
  assert.equal(cape.credits[0].licenses[0], 'CC0 1.0')
  assert.deepEqual(cape.credits[0].authors, [])
  assert.match(cape.credits[0].notes, /Attribution is optional/i)
})

async function writeDefinition(referenceRoot, relativePath, definition) {
  const filePath = path.join(referenceRoot, 'sheet_definitions', ...relativePath.split('/'))
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(definition, null, 2))
}
