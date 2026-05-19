import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runLpcRenderMatrixAudit } from '../../tools/audit-lpc-render-matrix.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const realLpcCatalogPath = path.join(repoRoot, 'data', 'lpc', 'lpc_catalog.json')
const hasRealLpcSources = existsSync(realLpcCatalogPath)
  ? existsSync(JSON.parse(readFileSync(realLpcCatalogPath, 'utf8')).source.reference_root)
  : false

test('all catalog LPC render matrix records resolve to valid source geometry', { skip: hasRealLpcSources ? false : 'local LPC catalog source root is not available' }, () => {
  const audit = runLpcRenderMatrixAudit({ catalogPath: realLpcCatalogPath })

  assert.equal(audit.skipped, false)
  assert.equal(audit.catalog_items_checked, 655)
  assert.ok(audit.draw_records_checked > 10_000_000, `expected a full-matrix audit, got ${audit.draw_records_checked}`)
  assert.ok(audit.exact_records_checked > 1_000_000, `expected exact records, got ${audit.exact_records_checked}`)
  assert.ok(audit.fallback_records_checked > 1_000_000, `expected fallback records, got ${audit.fallback_records_checked}`)
  assert.ok(audit.missing_records_checked > 1_000_000, `expected missing records to be classified, got ${audit.missing_records_checked}`)
  assert.ok(audit.unique_source_geometries_checked > 1_000, `expected source geometry checks, got ${audit.unique_source_geometries_checked}`)
  assert.equal(
    audit.draw_records_checked,
    audit.exact_records_checked + audit.fallback_records_checked + audit.missing_records_checked + audit.unsupported_records_checked,
  )
  assert.deepEqual(audit.critical_issues, [])
  assert.equal(audit.source_rect_issues.length, 0)
  assert.equal(audit.destination_rect_issues.length, 0)
})
