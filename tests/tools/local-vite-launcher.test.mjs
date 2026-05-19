import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildViteLaunchCommand } from '../../tools/localViteLauncher.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('local Vite launcher bypasses PowerShell and npm shims', () => {
  const launch = buildViteLaunchCommand(repoRoot, 'preview', ['--host', '127.0.0.1', '--port', '4173'])

  assert.equal(launch.command, process.execPath)
  assert.equal(launch.options.shell, false)
  assert.equal(launch.options.windowsHide, true)
  assert.match(launch.args[0], /node_modules[\\/]+vite[\\/]+bin[\\/]+vite\.js$/)
  assert.deepEqual(launch.args.slice(1), ['preview', '--host', '127.0.0.1', '--port', '4173'])
  assert.equal([...launch.args, launch.command].some((item) => /\.ps1$/i.test(item) || /\bnpm(?:\.cmd|\.ps1)?$/i.test(item)), false)
})

test('local Vite launcher rejects unsupported modes', () => {
  assert.throws(() => buildViteLaunchCommand(repoRoot, 'npm'), /Unsupported Vite mode/)
})

test('Playwright web server uses the local Node launcher instead of npm or npx', () => {
  const configText = readFileSync(path.join(repoRoot, 'playwright.config.ts'), 'utf8')
  assert.match(configText, /node tools\/build-and-preview\.js --host 127\.0\.0\.1 --port 4173 --strictPort/)
  assert.doesNotMatch(configText, /npm run build|npx vite/)
})
