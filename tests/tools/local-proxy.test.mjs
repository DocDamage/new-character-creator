import assert from 'node:assert/strict'
import test from 'node:test'
import { forwardLocalProxyProviderRequest, normalizeLocalProxyProviderRequest, providerRequiresProxy } from '../../tools/localProxyProviders.ts'

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
  assert.equal(providerRequiresProxy('kimi'), true)
  assert.equal(providerRequiresProxy('ollama'), false)
})

test('remote provider proxy requires session key', () => {
  assert.throws(() => normalizeLocalProxyProviderRequest({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1',
    messages: [{ role: 'user', content: 'hello' }],
  }), /session API key/)
})

test('local proxy forwards OpenAI-compatible requests and normalizes content', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/chat/completions')
    assert.equal(JSON.parse(init.body).model, 'gpt-4.1')
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hello from provider' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    const result = await forwardLocalProxyProviderRequest(normalizeLocalProxyProviderRequest({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'hello' }],
    }))
    assert.equal(result.content, 'hello from provider')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('local proxy forwards Kimi through the OpenAI-compatible route', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.moonshot.ai/v1/chat/completions')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'kimi-k2.6')
    assert.equal(init.headers.Authorization, 'Bearer sk-kimi-test')
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hello from kimi' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    const result = await forwardLocalProxyProviderRequest(normalizeLocalProxyProviderRequest({
      provider: 'kimi',
      baseUrl: 'https://api.moonshot.ai/v1',
      model: 'kimi-k2.6',
      apiKey: 'sk-kimi-test',
      messages: [{ role: 'user', content: 'hello' }],
    }))
    assert.equal(result.content, 'hello from kimi')
  } finally {
    globalThis.fetch = originalFetch
  }
})
