import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { duelystLabelSchema, inspectDuelystPackage } from './duelyst-package.js'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function getOption(name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node tools/build-duelyst-private-manifest.js [--package assets/Duelyst-Unit-Animations.unitypackage] [--stage-count 64] [--out public/data/manifests/duelyst.private.json]')
    return
  }

  const packagePath = getOption('--package', path.resolve(appRoot, 'assets', 'Duelyst-Unit-Animations.unitypackage'))
  const outPath = path.resolve(appRoot, getOption('--out', path.join('public', 'data', 'manifests', 'duelyst.private.json')))
  const stageTopCount = Number(getOption('--stage-count', '64'))
  const duelyst = await inspectDuelystPackage(appRoot, { packagePath, stageTopCount, candidateLimit: 'all' })

  const payload = {
    format: 'pixel_creator_duelyst_private_manifest',
    version: 1,
    generated_at: new Date().toISOString(),
    package_path: duelyst.package_path,
    available: duelyst.available,
    extraction_root: duelyst.extraction_root,
    total_assets: duelyst.total_assets,
    extension_counts: duelyst.extension_counts,
    label_schema: duelystLabelSchema(),
    candidate_units: duelyst.candidate_units,
    staged_manifest: duelyst.staged_manifest,
    findings: duelyst.findings,
    warnings: [
      'Private local manifest only. Do not commit or redistribute extracted Duelyst assets unless you have the rights to do so.',
      'Staged frames are whole-unit crops intended for local review, APES extraction, and private experimentation.',
    ],
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Wrote private Duelyst manifest: ${outPath}`)
  console.log(duelyst.summary)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
