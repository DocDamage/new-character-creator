import test from 'node:test'
import assert from 'node:assert/strict'

import {
  loadStoredAiProviderConfig,
  loadStoredBoolean,
  loadStoredGenerationJobs,
  loadStoredPartLibrary,
  loadStoredString,
} from '../../src/appPersistence.ts'

test('storage loaders fall back when localStorage reads are unavailable', () => {
  const originalWindow = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem() {
        throw new Error('localStorage blocked')
      },
    },
  }

  try {
    assert.deepEqual(loadStoredPartLibrary(), [])
    assert.deepEqual(loadStoredGenerationJobs(), [])
    assert.equal(loadStoredAiProviderConfig().provider_id, 'pixellab_manual_handoff')
    assert.equal(loadStoredString('blocked_key', 'fallback value'), 'fallback value')
    assert.equal(loadStoredBoolean('blocked_boolean'), false)
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})
