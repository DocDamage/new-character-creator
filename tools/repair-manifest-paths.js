import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const manifestPath = path.resolve(appRoot, 'public', 'data', 'manifests', 'characters.json');
const localManifestPath = path.resolve(appRoot, 'public', 'data', 'manifests', 'characters.local.json');
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

function isWithinRoot(filePath, rootPath) {
  const relativePath = path.relative(rootPath, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function serializeAssetRoot(assetRoot, mode) {
  return mode === 'repo' && isWithinRoot(assetRoot, appRoot)
    ? path.relative(appRoot, assetRoot).replaceAll(path.sep, '/')
    : assetRoot;
}

function manifestUrl(filePath, mode) {
  if (mode === 'repo' && isWithinRoot(filePath, appRoot)) {
    return `/${path.relative(appRoot, filePath).replaceAll(path.sep, '/')}`;
  }
  return normalizeFsUrl(filePath);
}

function resolveAssetRootValue(assetRoot) {
  return path.isAbsolute(assetRoot) ? path.resolve(assetRoot) : path.resolve(appRoot, assetRoot.replaceAll('/', path.sep));
}

function resolveManifestFilePath(value) {
  if (!value.startsWith('/')) return null;
  if (value.startsWith('/@fs/')) {
    return path.resolve(decodeURI(value.slice('/@fs/'.length)));
  }
  return path.resolve(appRoot, `.${value}`);
}

function getActiveManifestPath() {
  return fs.existsSync(localManifestPath) ? localManifestPath : manifestPath;
}

function replaceRootInString(value, fromRoot, toRoot, outputMode) {
  const normalizedFromRoot = resolveAssetRootValue(fromRoot);
  const normalizedToRoot = path.resolve(toRoot);
  const fromFsUrl = normalizeFsUrl(normalizedFromRoot);
  const toFsUrl = manifestUrl(normalizedToRoot, outputMode);
  const fromRepoValue = serializeAssetRoot(normalizedFromRoot, 'repo');
  const toRepoValue = serializeAssetRoot(normalizedToRoot, outputMode);
  const resolvedFilePath = resolveManifestFilePath(value);

  if (value === normalizedFromRoot || value === fromRepoValue) return serializeAssetRoot(normalizedToRoot, outputMode);
  if (value.startsWith(`${normalizedFromRoot}${path.sep}`)) {
    const nextPath = path.resolve(normalizedToRoot, path.relative(normalizedFromRoot, value));
    return outputMode === 'repo' && isWithinRoot(nextPath, appRoot) ? path.relative(appRoot, nextPath).replaceAll(path.sep, '/') : nextPath;
  }
  if (value === fromFsUrl) return toFsUrl;
  if (value.startsWith(`${fromFsUrl}/`)) {
    return `${toFsUrl}/${value.slice(fromFsUrl.length + 1)}`;
  }
  if (value === manifestUrl(normalizedFromRoot, 'repo')) return manifestUrl(normalizedToRoot, outputMode);
  if (value.startsWith(`${manifestUrl(normalizedFromRoot, 'repo')}/`)) {
    return `${manifestUrl(normalizedToRoot, outputMode)}/${value.slice(manifestUrl(normalizedFromRoot, 'repo').length + 1)}`;
  }
  if (resolvedFilePath && isWithinRoot(resolvedFilePath, normalizedFromRoot)) {
    return manifestUrl(path.resolve(normalizedToRoot, path.relative(normalizedFromRoot, resolvedFilePath)), outputMode);
  }
  return value;
}

function repairValue(value, fromRoot, toRoot, stats, outputMode) {
  if (typeof value === 'string') {
    const repaired = replaceRootInString(value, fromRoot, toRoot, outputMode);
    if (repaired !== value) stats.replaced += 1;
    return repaired;
  }

  if (Array.isArray(value)) {
    return value.map((item) => repairValue(item, fromRoot, toRoot, stats, outputMode));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, repairValue(childValue, fromRoot, toRoot, stats, outputMode)]),
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

  const activeManifestPath = getActiveManifestPath();
  if (!fs.existsSync(activeManifestPath)) {
    throw new Error(`Manifest not found: ${activeManifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(activeManifestPath, 'utf8'));
  if (!manifest.asset_root) {
    throw new Error('Manifest does not contain asset_root.');
  }

  const currentAssetRoot = resolveAssetRootValue(manifest.asset_root);
  const outputMode = isWithinRoot(resolvedAssetRoot, appRoot) ? 'repo' : 'local';
  const outputPath = outputMode === 'repo' ? manifestPath : localManifestPath;
  const stats = { replaced: 0 };
  const repairedManifest = repairValue(manifest, currentAssetRoot, resolvedAssetRoot, stats, outputMode);
  repairedManifest.generated_at = new Date().toISOString();
  repairedManifest.asset_root = serializeAssetRoot(resolvedAssetRoot, outputMode);

  fs.writeFileSync(outputPath, `${JSON.stringify(repairedManifest, null, 2)}\n`);
  if (outputMode === 'repo') {
    fs.rmSync(localManifestPath, { force: true });
  }
  console.log(`Repaired manifest root: ${currentAssetRoot} -> ${resolvedAssetRoot}`);
  console.log(`Updated ${stats.replaced} manifest path field(s) in ${outputPath}`);
}

main();