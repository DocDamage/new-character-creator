import assert from 'node:assert/strict'
import test from 'node:test'
import { scanTextForSecrets } from '../../tools/scan-secrets.js'

test('secret scanner flags provider-looking keys', () => {
  const findings = scanTextForSecrets('OPENAI_API_KEY=sk-test-1234567890abcdef')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].kind, 'possible_secret')
})

test('secret scanner ignores redacted placeholders', () => {
  assert.deepEqual(scanTextForSecrets('Authorization: [redacted]'), [])
})
