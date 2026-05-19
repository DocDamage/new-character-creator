import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { appendToolAuditRecord, redactAuditPayload } from '../../tools/toolAuditLog.ts'

test('tool audit redacts secret-looking values', () => {
  const redacted = redactAuditPayload({ token: 'sk-test-1234567890', nested: { text: 'Bearer abcdefghijklmnop' } })
  assert.equal(JSON.stringify(redacted).includes('sk-test'), false)
  assert.equal(JSON.stringify(redacted).includes('abcdefghijklmnop'), false)
})

test('tool audit writes append-only JSONL', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pixel-creator-audit-'))
  try {
    const auditPath = path.join(root, 'audit.jsonl')
    await appendToolAuditRecord(auditPath, { route: '/__local/test', apiKey: 'secret-123456789' })
    const text = await readFile(auditPath, 'utf8')
    assert.match(text, /"route":"\/__local\/test"/)
    assert.equal(text.includes('secret-123456789'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
