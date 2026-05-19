import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workflowDir = path.join(repoRoot, '.github', 'workflows')

test('GitHub workflows use Node 24-ready official action majors', () => {
  const workflows = readdirSync(workflowDir).filter((file) => /\.ya?ml$/i.test(file))
  const combined = workflows.map((file) => readFileSync(path.join(workflowDir, file), 'utf8')).join('\n')

  assert.doesNotMatch(combined, /actions\/checkout@v4\b/)
  assert.doesNotMatch(combined, /actions\/setup-node@v4\b/)
  assert.doesNotMatch(combined, /actions\/configure-pages@v5\b/)
  assert.doesNotMatch(combined, /actions\/upload-pages-artifact@v3\b/)
  assert.doesNotMatch(combined, /actions\/deploy-pages@v4\b/)
  assert.match(combined, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24:\s*'true'/)
})
