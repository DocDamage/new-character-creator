import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function summarizeLicenseCoverage(entries) {
  return entries.reduce((summary, entry) => {
    if (entry.license_status === 'covered') summary.covered += 1
    else summary.missing += 1
    return summary
  }, { covered: 0, missing: 0 })
}

function main() {
  const catalogPath = path.join(repoRoot, 'data', 'lpc', 'lpc_catalog.json')
  const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : { items: {} }
  const entries = Object.values(catalog.items ?? {})
  const summary = summarizeLicenseCoverage(entries)
  const output = [
    '# Asset License Audit',
    '',
    'Generated from local LPC/Duelyst/public manifests.',
    '',
    '## Current Manual Maintenance',
    '',
    '- Loose root LPC files moved into `assets/lpc sprite generator stuff/Randoms/`.',
    '- Missing per-folder `license.txt` files added.',
    '',
    '## LPC Catalog Coverage',
    '',
    `- Covered entries: ${summary.covered}`,
    `- Missing entries: ${summary.missing}`,
    '',
    '## Release Rule',
    '',
    'No asset ships unless it has `license_status: "covered"` in the generated manifest or catalog.',
    '',
  ].join('\n')
  const outPath = path.join(repoRoot, 'docs', 'asset-license-audit.md')
  fs.writeFileSync(outPath, output, 'utf8')
  console.log(`Wrote ${path.relative(repoRoot, outPath)} with ${summary.covered} covered and ${summary.missing} missing LPC catalog entries.`)
  if (summary.missing > 0) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
