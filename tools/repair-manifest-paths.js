import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const manifestPath = path.resolve(appRoot, 'public', 'data', 'manifests', 'characters.json');
const cliArgs = process.argv.slice(2);

function getOptionValue(name) {
  const inline = cliArgs.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = cliArgs.findIndex((arg) => arg === name);
  if (index >= 0) return cliArgs[index + 1];
  return undefined;
}

function normalizeFsUrl(filePath) {
  return `/@fs/${filePath.replaceAll(path.sep, '/')}`;
}

function replaceRootInString(value, fromRoot, toRoot) {
  const normalizedFromRoot = path.resolve(fromRoot);
  const normalizedToRoot = path.resolve(toRoot);
  const fromFsUrl = normalizeFsUrl(normalizedFromRoot);
  const toFsUrl = normalizeFsUrl(normalizedToRoot);

  if (value === normalizedFromRoot) return normalizedToRoot;
  if (value.startsWith(`${normalizedFromRoot}${path.sep}`)) {
    return path.resolve(normalizedToRoot, path.relative(normalizedFromRoot, value));
  }
  if (value === fromFsUrl) return toFsUrl;
  if (value.startsWith(`${fromFsUrl}/`)) {
    return `${toFsUrl}/${value.slice(fromFsUrl.length + 1)}`;
  }
  return value;
}

function repairValue(value, fromRoot, toRoot, stats) {
  if (typeof value === 'string') {
    const repaired = replaceRootInString(value, fromRoot, toRoot);
    if (repaired !== value) stats.replaced += 1;
    return repaired;
  }

  if (Array.isArray(value)) {
    return value.map((item) => repairValue(item, fromRoot, toRoot, stats));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, repairValue(childValue, fromRoot, toRoot, stats)]),
    );
  }

  return value;
}

function main() {
  if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
    console.log('Usage: node tools/repair-manifest-paths.js --asset-root <path>');
    console.log('Environment override: PIXEL_CREATOR_ASSET_ROOT=<path>');
    console.log('Rewrites asset_root and all manifest /@fs/ paths from the recorded root to the provided root.');
    return;
  }

  const nextAssetRoot = getOptionValue('--asset-root') ?? process.env.PIXEL_CREATOR_ASSET_ROOT;
  if (!nextAssetRoot) {
    throw new Error('No asset root provided. Pass --asset-root <path> or set PIXEL_CREATOR_ASSET_ROOT.');
  }

  const resolvedAssetRoot = path.resolve(nextAssetRoot);
  if (!fs.existsSync(resolvedAssetRoot)) {
    throw new Error(`Asset root not found: ${resolvedAssetRoot}`);
  }

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.asset_root) {
    throw new Error('Manifest does not contain asset_root.');
  }

  const currentAssetRoot = path.resolve(manifest.asset_root);
  const stats = { replaced: 0 };
  const repairedManifest = repairValue(manifest, currentAssetRoot, resolvedAssetRoot, stats);
  repairedManifest.generated_at = new Date().toISOString();
  repairedManifest.asset_root = resolvedAssetRoot;

  fs.writeFileSync(manifestPath, `${JSON.stringify(repairedManifest, null, 2)}\n`);
  console.log(`Repaired manifest root: ${currentAssetRoot} -> ${resolvedAssetRoot}`);
  console.log(`Updated ${stats.replaced} manifest path field(s) in ${manifestPath}`);
}

main();