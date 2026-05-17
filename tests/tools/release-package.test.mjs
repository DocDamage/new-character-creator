import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const validatorPath = path.join(repoRoot, 'tools', 'validate-release-package.js')

test('release validator rejects private manifests and missing manifest assets', async () => {
  const distRoot = await mkdtemp(path.join(tmpdir(), 'pixel-creator-release-bad-'))
  try {
    await mkdir(path.join(distRoot, 'data', 'manifests'), { recursive: true })
    await writeFile(path.join(distRoot, 'data', 'manifests', 'duelyst.private.json'), '{}\n', 'utf8')
    await writeFile(path.join(distRoot, 'data', 'manifests', 'characters.json'), JSON.stringify({
      characters: [
        {
          character_id: 'fixture',
          representative_frame: '/data/sprites/fixture/missing.png',
          rotation_preview_paths: [
            {
              path: '/__local/apes-output/fixture/missing.png',
            },
          ],
          animations: [
            {
              name: 'idle',
              directions: {
                south: [
                  {
                    path: '/data/sprites/fixture/missing.png',
                  },
                ],
              },
            },
          ],
        },
      ],
    }), 'utf8')

    const result = spawnSync(process.execPath, [validatorPath, '--dist', distRoot], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Private manifest must not ship/)
    assert.match(result.stderr, /Manifest asset must be release-relative, not local/)
    assert.match(result.stderr, /Missing manifest asset/)
  } finally {
    await rm(distRoot, { recursive: true, force: true })
  }
})

test('release validator accepts bundled manifest assets', async () => {
  const distRoot = await mkdtemp(path.join(tmpdir(), 'pixel-creator-release-good-'))
  try {
    await mkdir(path.join(distRoot, 'data', 'manifests'), { recursive: true })
    await mkdir(path.join(distRoot, 'data', 'sprites', 'fixture'), { recursive: true })
    await writeFile(path.join(distRoot, 'data', 'sprites', 'fixture', 'frame.png'), 'png', 'utf8')
    await writeFile(path.join(distRoot, 'data', 'manifests', 'characters.json'), JSON.stringify({
      characters: [
        {
          character_id: 'fixture',
          representative_frame: '/data/sprites/fixture/frame.png',
          rotation_preview_paths: [
            {
              path: '/data/sprites/fixture/frame.png',
            },
          ],
          animations: [
            {
              name: 'idle',
              directions: {
                south: [
                  {
                    path: '/data/sprites/fixture/frame.png',
                  },
                ],
              },
            },
          ],
        },
      ],
    }), 'utf8')

    const result = spawnSync(process.execPath, [validatorPath, '--dist', distRoot], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /Release package validation passed/)
  } finally {
    await rm(distRoot, { recursive: true, force: true })
  }
})
