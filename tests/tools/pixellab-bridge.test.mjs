import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePixelLabSpriteOutput, validatePixelLabBridgeRequest } from '../../tools/pixellabBridge.ts'

test('PixelLab bridge accepts loopback endpoint requests', () => {
  const request = validatePixelLabBridgeRequest({
    endpointUrl: 'http://127.0.0.1:8787',
    prompt: 'idle animation',
    animation: 'idle',
  })
  assert.equal(request.endpointUrl, 'http://127.0.0.1:8787')
})

test('PixelLab bridge rejects remote endpoints', () => {
  assert.throws(() => validatePixelLabBridgeRequest({ endpointUrl: 'https://example.com', prompt: 'idle' }), /loopback/)
})

test('PixelLab bridge normalizes generated sprite outputs', () => {
  assert.deepEqual(normalizePixelLabSpriteOutput({ frames: ['a.png'], warnings: ['review'] }).warnings, ['review'])
})
