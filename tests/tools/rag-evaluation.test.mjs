import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import test from 'node:test'

test('RAG evaluation set passes', () => {
  const build = spawnSync(process.execPath, ['tools/build-rag-index.js'], {
    encoding: 'utf8',
  })
  assert.equal(build.status, 0, build.stdout + build.stderr)
  const result = spawnSync(process.execPath, ['tools/evaluate-rag-index.js'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
