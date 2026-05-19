import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildViteLaunchCommand } from './localViteLauncher.js'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const previewArgs = process.argv.slice(2)

function runNodeTool(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: appRoot,
    stdio: 'inherit',
    windowsHide: true,
    shell: false,
  })
  if (result.signal) process.kill(process.pid, result.signal)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

runNodeTool([path.resolve(appRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-b'])
runNodeTool([path.resolve(appRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'])

const launch = buildViteLaunchCommand(appRoot, 'preview', previewArgs)
const child = spawn(launch.command, launch.args, launch.options)
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exitCode = code ?? 0
})
