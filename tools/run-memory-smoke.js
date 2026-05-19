import { spawnSync } from 'node:child_process'

const result = spawnSync('npx', ['playwright', 'test', 'tests/browser/performance.spec.ts', '--reporter=line'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
