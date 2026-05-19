import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runLpcAlignmentAudit } from '../../tools/audit-lpc-alignment.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const realLpcInventoryPath = path.join(repoRoot, 'data', 'lpc', 'lpc_asset_inventory.json')

test('local LPC pseudo-part frames align to matching base silhouettes', { skip: existsSync(realLpcInventoryPath) ? false : 'local LPC inventory is not available' }, () => {
  const audit = runLpcAlignmentAudit({ inventoryPath: realLpcInventoryPath })

  assert.equal(audit.skipped, false)
  assert.equal(audit.partCharacters, 850)
  assert.equal(audit.partFrameCellsChecked, 121004)
  assert.equal(audit.bodyOverlapCellsChecked, 44096)
  assert.equal(audit.bodyOverlapEmptyCellsSkipped, 0)
  assert.deepEqual(audit.emptyCellsByAnimation, {})
  assert.deepEqual(audit.criticalIssues, [])
  assert.deepEqual(audit.bodyOverlapIssues, [])
  assert.deepEqual(audit.warnings, [])
})
