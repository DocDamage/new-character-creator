import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const forbiddenTrackedPatterns = [
  /^public\/data\/manifests\/characters\.local\.json$/i,
  /^public\/data\/manifests\/duelyst\.private\.json$/i,
  /^data\/apes\//i,
  /^data\/cache\//i,
  /^data\/training\//i,
  /^assets\/Animated-Pixel-Pack-Characters-V1\//i,
  /^assets\/Duelyst-Unit-Animations\.unitypackage$/i,
  /^assets\/checkpoints\//i,
  /^test-results\//i,
  /^dist\//i,
]

const forbiddenSecretPatterns = [
  /PIXELLAB_API_KEY\s*=/i,
  /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/i,
]

const textFilePattern = /\.(css|cjs|html|js|json|jsx|md|mjs|ps1|py|sh|ts|tsx|txt|yml|yaml)$/i

function main() {
  const trackedFiles = runGit(['ls-files'])
  const trackedFileList = trackedFiles
    .split(/\r?\n/)
    .filter(Boolean)
  const failures = trackedFileList.filter((filePath) => forbiddenTrackedPatterns.some((pattern) => pattern.test(normalizePath(filePath))))
  const secretFailures = findSecretFailures(trackedFileList)

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Forbidden local/private/generated file is tracked: ${failure}`)
    }
    process.exitCode = 1
    return
  }

  if (secretFailures.length > 0) {
    for (const failure of secretFailures) {
      console.error(`Forbidden provider secret pattern found in tracked source: ${failure}`)
    }
    process.exitCode = 1
    return
  }

  console.log('Source hygiene check passed: no forbidden private/generated files or provider secrets are tracked.')
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: appRoot,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`)
  }
  return result.stdout
}

function normalizePath(filePath) {
  return filePath.replaceAll(path.sep, '/')
}

function findSecretFailures(trackedFiles) {
  const failures = []
  for (const filePath of trackedFiles) {
    const normalizedPath = normalizePath(filePath)
    if (normalizedPath === 'package-lock.json' || !textFilePattern.test(normalizedPath)) continue
    const absolutePath = path.resolve(appRoot, filePath)
    let text = ''
    try {
      text = fs.readFileSync(absolutePath, 'utf8')
    } catch {
      continue
    }
    if (forbiddenSecretPatterns.some((pattern) => pattern.test(text))) {
      failures.push(filePath)
    }
  }
  return failures
}

main()
