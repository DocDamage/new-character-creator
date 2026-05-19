import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { validateAsepriteBridgeRequest } from '../../tools/asepriteBridge.ts'

const appRoot = path.resolve('.')

test('Aseprite bridge accepts health checks without executing a tool', () => {
  const request = validateAsepriteBridgeRequest({ action: 'check', executablePath: '' }, appRoot)
  assert.equal(request.action, 'check')
})

test('Aseprite bridge rejects traversal paths', () => {
  assert.throws(() => validateAsepriteBridgeRequest({ action: 'check', executablePath: '', projectPath: '../outside.aseprite' }, appRoot), /project-relative/)
})
