import path from 'node:path'

export function buildViteLaunchCommand(appRoot, mode, args = []) {
  if (mode !== 'dev' && mode !== 'preview') {
    throw new Error(`Unsupported Vite mode: ${mode}`)
  }
  return {
    command: process.execPath,
    args: [
      path.resolve(appRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
      mode,
      ...args,
    ],
    options: {
      cwd: appRoot,
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    },
  }
}
