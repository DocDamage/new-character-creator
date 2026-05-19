import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeLicenseCoverage } from '../../tools/audit-licenses.js'

test('license audit reports missing and covered counts', () => {
  const summary = summarizeLicenseCoverage([
    { asset_path: 'a.png', license_status: 'covered' },
    { asset_path: 'b.png', license_status: 'missing' },
  ])
  assert.equal(summary.covered, 1)
  assert.equal(summary.missing, 1)
})
