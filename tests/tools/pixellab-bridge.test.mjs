import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePixelLabSpriteOutput, submitPixelLabBridgeRequest, validatePixelLabBridgeRequest } from '../../tools/pixellabBridge.ts'

test('PixelLab bridge accepts loopback endpoint requests', () => {
  const request = validatePixelLabBridgeRequest({
    endpointUrl: 'http://127.0.0.1:8787',
    mcpServerUrl: 'https://api.pixellab.ai/mcp',
    prompt: 'idle animation',
    animation: 'idle',
  })
  assert.equal(request.endpointUrl, 'http://127.0.0.1:8787')
  assert.equal(request.mcpServerUrl, 'https://api.pixellab.ai/mcp')
})

test('PixelLab bridge rejects remote endpoints', () => {
  assert.throws(() => validatePixelLabBridgeRequest({ endpointUrl: 'https://example.com', prompt: 'idle' }), /loopback/)
})

test('PixelLab bridge rejects unexpected MCP hosts', () => {
  assert.throws(() => validatePixelLabBridgeRequest({
    endpointUrl: 'http://127.0.0.1:8787',
    mcpServerUrl: 'https://example.com/mcp',
    prompt: 'idle',
  }), /api\.pixellab\.ai/)
})

test('PixelLab bridge normalizes generated sprite outputs', () => {
  assert.deepEqual(normalizePixelLabSpriteOutput({ frames: ['a.png'], warnings: ['review'] }).warnings, ['review'])
})

test('PixelLab bridge forwards generation requests and returns image outputs', async () => {
  const request = validatePixelLabBridgeRequest({
    endpointUrl: 'http://127.0.0.1:8787',
    mcpServerUrl: 'https://api.pixellab.ai/mcp',
    prompt: 'make idle frames',
    animation: 'idle',
    model: 'sprite-animation',
    directions: ['south', 'east'],
    layers: ['head'],
  })
  let requestedUrl = ''
  let requestedBody = {}
  const result = await submitPixelLabBridgeRequest(request, {
    authHeader: 'Bearer test-token',
    fetchImpl: async (url, init) => {
      requestedUrl = String(url)
      requestedBody = JSON.parse(String(init.body))
      assert.equal(init.headers.Authorization, 'Bearer test-token')
      return new Response(JSON.stringify({
        message: 'created',
        output: { frames: ['https://example.test/frame-1.png'] },
        spritesheet_url: 'https://example.test/sheet.png',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })
  assert.equal(requestedUrl, 'http://127.0.0.1:8787/generate')
  assert.equal(requestedBody.prompt, 'make idle frames')
  assert.deepEqual(requestedBody.directions, ['south', 'east'])
  assert.deepEqual(result.frames, ['https://example.test/frame-1.png'])
  assert.equal(result.spritesheet, 'https://example.test/sheet.png')
})
