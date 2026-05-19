import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const inventoryPath = path.join(repoRoot, 'tools', 'build-lpc-local-inventory.js')

test('LPC inventory records sheet grids, categories, and credit files without copying assets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pixel-creator-lpc-'))
  try {
    const assetRoot = path.join(root, 'lpc assets')
    const outPath = path.join(root, 'inventory.json')
    await mkdir(path.join(assetRoot, 'Body', 'Human'), { recursive: true })
    await mkdir(path.join(assetRoot, '__MACOSX'), { recursive: true })
    await writeFile(path.join(assetRoot, 'Credits.txt'), 'Licensed CC-by-SA 3.0\nArtist Example\n', 'utf8')
    await writeFile(path.join(assetRoot, 'Body', 'Human', 'walk.png'), makePngHeader(576, 256))
    await writeFile(path.join(assetRoot, '__MACOSX', 'ignored.png'), makePngHeader(64, 64))
    await writeFile(path.join(assetRoot, '._ignored.png'), makePngHeader(64, 64))

    const result = spawnSync(process.execPath, [inventoryPath, '--asset-root', assetRoot, '--out', outPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const inventory = JSON.parse(await readFile(outPath, 'utf8'))
    assert.equal(inventory.summary.png_count, 1)
    assert.equal(inventory.summary.lpc_grid_count, 1)
    assert.equal(inventory.summary.categories.Body, 1)
    assert.equal(inventory.summary.credit_file_count, 1)
    assert.equal(inventory.sheets[0].frame_columns, 9)
    assert.equal(inventory.sheets[0].frame_rows, 4)
    assert.match(inventory.credit_files[0].excerpt, /CC-by-SA/)
    assert.equal(inventory.source.local_license.basis, 'unknown_or_mixed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('LPC inventory summarizes local CC0 license files as attribution optional', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pixel-creator-lpc-license-'))
  try {
    const assetRoot = path.join(root, 'lpc assets')
    const outPath = path.join(root, 'inventory.json')
    await mkdir(path.join(assetRoot, 'Body'), { recursive: true })
    await writeFile(path.join(assetRoot, 'license.txt'), 'Public Domain Dedication (CC0 1.0)\nUse without attribution.\n', 'utf8')
    await writeFile(path.join(assetRoot, 'Body', 'walk.png'), makePngHeader(576, 256))

    const result = spawnSync(process.execPath, [inventoryPath, '--asset-root', assetRoot, '--out', outPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)
    const inventory = JSON.parse(await readFile(outPath, 'utf8'))
    assert.equal(inventory.source.local_license.license, 'CC0 1.0')
    assert.equal(inventory.source.local_license.attribution_required, false)
    assert.deepEqual(inventory.source.local_license.files, ['license.txt'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function makePngHeader(width, height) {
  const buffer = Buffer.alloc(24)
  buffer[0] = 0x89
  buffer.write('PNG', 1, 'ascii')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}
