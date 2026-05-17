import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const indexerPath = path.join(repoRoot, 'tools', 'index-assets.js')

test('default ignored in-repo asset scans write local manifest and preserve public manifest', async () => {
  const appRoot = await mkdtemp(path.join(tmpdir(), 'pixel-creator-index-'))
  try {
    const manifestDir = path.join(appRoot, 'public', 'data', 'manifests')
    await mkdir(manifestDir, { recursive: true })
    const publicManifestPath = path.join(manifestDir, 'characters.json')
    const publicManifest = '{ "format": "committed-fallback" }\n'
    await writeFile(publicManifestPath, publicManifest, 'utf8')

    const assetRoot = path.join(appRoot, 'assets', 'Animated-Pixel-Pack-Characters-V1')
    await writeCharacterFixture(assetRoot)

    const result = spawnSync(process.execPath, [indexerPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PIXEL_CREATOR_INDEX_APP_ROOT: appRoot,
      },
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(await readFile(publicManifestPath, 'utf8'), publicManifest)

    const localManifest = JSON.parse(await readFile(path.join(manifestDir, 'characters.local.json'), 'utf8'))
    assert.equal(localManifest.total_characters, 1)
    assert.equal(localManifest.asset_root, 'assets/Animated-Pixel-Pack-Characters-V1')
    assert.match(result.stdout, /Left .*characters\.json untouched/)
  } finally {
    await rm(appRoot, { recursive: true, force: true })
  }
})

async function writeCharacterFixture(assetRoot) {
  const characterRoot = path.join(assetRoot, '1-test-hero')
  const animations = ['idle', 'walking', 'running-jump', 'attack']
  const directions = ['north', 'south', 'east', 'west']

  for (const animation of animations) {
    for (const direction of directions) {
      const frameDir = path.join(characterRoot, 'animations', animation, direction)
      await mkdir(frameDir, { recursive: true })
      await writeFile(path.join(frameDir, 'frame_000.png'), makePngHeader())
    }
  }

  const rotationDir = path.join(characterRoot, 'rotations')
  await mkdir(rotationDir, { recursive: true })
  await writeFile(path.join(rotationDir, 'south.png'), makePngHeader())
}

function makePngHeader() {
  const buffer = Buffer.alloc(24)
  buffer[0] = 0x89
  buffer.write('PNG', 1, 'ascii')
  buffer.writeUInt32BE(64, 16)
  buffer.writeUInt32BE(64, 20)
  return buffer
}
