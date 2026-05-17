import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = path.resolve(appRoot, 'assets', 'Duelyst-Unit-Animations.unitypackage')

if (!fs.existsSync(packagePath)) {
  console.log(`Private asset test skipped: ${packagePath} is not present.`)
  process.exit(0)
}

const playwrightBin = path.resolve(appRoot, 'node_modules', '@playwright', 'test', 'cli.js')
const result = spawnSync(process.execPath, [playwrightBin, 'test', 'regression.spec.ts', '-g', 'Duelyst audit', '--reporter=line'], {
  cwd: appRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PIXEL_CREATOR_PRIVATE_ASSETS: '1',
  },
})

process.exitCode = result.status ?? 1
