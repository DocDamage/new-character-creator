import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const forbiddenTrackedPatterns = [
  /^public\/data\/manifests\/characters\.local\.json$/i,
  /^public\/data\/manifests\/duelyst\.private\.json$/i,
  /^data\/apes\//i,
  /^data\/cache\//i,
  /^data\/lpc\//i,
  /^data\/training\//i,
  /^assets\/Animated-Pixel-Pack-Characters-V1\//i,
  /^assets\/lpc sprite generator stuff\//i,
  /^assets\/Duelyst-Unit-Animations\.unitypackage$/i,
  /^assets\/checkpoints\//i,
  /^test-results\//i,
  /^dist\//i,
]

function main() {
  const trackedFiles = runGit(['ls-files'])
  const failures = trackedFiles
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((filePath) => forbiddenTrackedPatterns.some((pattern) => pattern.test(normalizePath(filePath))))

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Forbidden local/private/generated file is tracked: ${failure}`)
    }
    process.exitCode = 1
    return
  }

  console.log('Source hygiene check passed: no forbidden private/generated files are tracked.')
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: appRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`)
  }
  return result.stdout
}

function normalizePath(filePath) {
  return filePath.replaceAll(path.sep, '/')
}

main()
