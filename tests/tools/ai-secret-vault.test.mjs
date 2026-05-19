import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAiSecretVault,
  redactSecretValue,
  serializeProviderConfigForStorage,
} from '../../src/aiSecretVault.ts'

test('secret vault stores secrets only in memory and returns redacted snapshots', () => {
  const vault = createAiSecretVault()
  vault.set('openai', 'sk-test-secret')
  assert.equal(vault.has('openai'), true)
  assert.equal(vault.get('openai'), 'sk-test-secret')
  assert.deepEqual(vault.snapshot(), { openai: true })
  assert.equal(JSON.stringify(vault.snapshot()).includes('sk-test-secret'), false)
})

test('redaction removes key-shaped strings', () => {
  assert.equal(redactSecretValue('sk-test-secret'), '[redacted]')
  assert.equal(redactSecretValue(''), '')
})

test('stored provider config never includes browser-call or secret fields', () => {
  const serialized = serializeProviderConfigForStorage([{
    provider_id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    enabled: true,
    model: 'gpt-4.1',
    base_url: 'https://api.openai.com/v1',
    secret_session_set: true,
    secret_storage: 'session_only',
    direct_browser_calls: true,
    local_proxy_required: false,
    notes: 'secret sk-test-secret',
  }])

  assert.equal(serialized[0].secret_session_set, false)
  assert.equal(serialized[0].direct_browser_calls, false)
  assert.equal(serialized[0].local_proxy_required, true)
  assert.equal(JSON.stringify(serialized).includes('sk-test-secret'), false)
})
