import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const playwrightBin = path.resolve(appRoot, 'node_modules', '@playwright', 'test', 'cli.js')

const result = spawnSync(process.execPath, [playwrightBin, 'test'], {
  cwd: appRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PIXEL_CREATOR_BROWSER_MATRIX: '1',
  },
})

process.exitCode = result.status ?? 1
