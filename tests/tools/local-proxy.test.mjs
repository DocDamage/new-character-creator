import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeLocalProxyProviderRequest, providerRequiresProxy } from '../../tools/localProxyProviders.ts'

test('local proxy normalizes provider requests', () => {
  const request = normalizeLocalProxyProviderRequest({
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'llama3.1',
    messages: [{ role: 'user', content: 'hello' }],
  })
  assert.equal(request.provider, 'ollama')
  assert.equal(request.messages.length, 1)
})

test('local provider routes reject non-loopback endpoints', () => {
  assert.throws(() => normalizeLocalProxyProviderRequest({
    provider: 'ollama',
    baseUrl: 'https://example.com',
    model: 'llama3.1',
    messages: [{ role: 'user', content: 'hello' }],
  }), /loopback/)
})

test('remote API providers require the trusted proxy boundary', () => {
  assert.equal(providerRequiresProxy('openai'), true)
  assert.equal(providerRequiresProxy('ollama'), false)
})
