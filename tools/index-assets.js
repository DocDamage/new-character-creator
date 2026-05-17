import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(process.env.PIXEL_CREATOR_INDEX_APP_ROOT || path.resolve(__dirname, '..'));
const projectRoot = path.resolve(appRoot, '..');
const manifestDir = path.resolve(appRoot, 'public', 'data', 'manifests');
const manifestPath = path.resolve(manifestDir, 'characters.json');
const localManifestPath = path.resolve(manifestDir, 'characters.local.json');
const cliArgs = process.argv.slice(2);

const directionAliases = new Map([
  ['north', 'north'],
  ['south', 'south'],
  ['east', 'east'],
  ['west', 'west'],
  ['north-east', 'northeast'],
  ['northwest', 'northwest'],
  ['north-west', 'northwest'],
  ['south-east', 'southeast'],
  ['south-west', 'southwest'],
]);

const animationAliases = new Map([
  ['walking', 'walk'],
  ['walking-4-frames', 'walk'],
  ['walk', 'walk'],
  ['attack', 'attack'],
  ['attack-1', 'attack'],
  ['idle', 'idle'],
  ['running-jump', 'running_jump'],
  ['running_jump', 'running_jump'],
  ['run', 'run'],
  ['jump', 'jump'],
  ['fall', 'fall'],
  ['block', 'block'],
  ['slide', 'slide'],
  ['get-up', 'get_up'],
  ['getup', 'get_up'],
]);

const canonicalDirections = ['north', 'south', 'east', 'west'];
const expectedAnimations = ['idle', 'walk', 'running_jump', 'attack'];

function getOptionValue(name) {
  const inline = cliArgs.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = cliArgs.findIndex((arg) => arg === name);
  if (index >= 0) return cliArgs[index + 1];
  return undefined;
}

function resolveAssetRoot() {
  const override = getOptionValue('--asset-root') ?? process.env.PIXEL_CREATOR_ASSET_ROOT;
  if (override) {
    return path.resolve(override);
  }

  const candidates = [
    path.resolve(appRoot, 'assets', 'Animated-Pixel-Pack-Characters-V1'),
    path.resolve(projectRoot, 'Animated-Pixel-Pack-Characters-V1'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function fsUrl(filePath) {
  return `/@fs/${filePath.replaceAll(path.sep, '/')}`;
}

function isWithinRoot(filePath, rootPath) {
  const relativePath = path.relative(rootPath, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isIgnoredInRepoAssetRoot(assetRoot) {
  return isWithinRoot(assetRoot, path.resolve(appRoot, 'assets'));
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
  return fsUrl(filePath);
}

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function listDirs(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function listPngFrames(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => path.resolve(folder, entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((filePath, index) => {
      const size = readPngSize(filePath);
      return {
        index,
        path: fsUrl(filePath),
        file_name: path.basename(filePath),
        width: size?.width ?? 0,
        height: size?.height ?? 0,
      };
    });
}

function titleize(slug) {
  return slug
    .replace(/^\d+-/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function classify(folderName) {
  const cleaned = folderName.replace(/^\d+-/, '');
  if (cleaned.includes('warrior-woman')) return 'warrior_woman';
  if (cleaned.includes('warrior-man')) return 'warrior_man';
  if (cleaned.includes('wizard')) return 'wizard';
  if (cleaned.includes('sorceress')) return 'sorceress';
  if (cleaned.includes('skeleton')) return 'skeleton';
  if (cleaned.includes('ogre')) return 'ogre_warrior';
  return cleaned.replaceAll('-', '_');
}

function collectGifs(characterPath, rawAnimationName, mode) {
  const gifRoot = path.resolve(characterPath, 'gifs', rawAnimationName);
  if (!fs.existsSync(gifRoot)) return [];
  return fs
    .readdirSync(gifRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gif'))
    .map((entry) => manifestUrl(path.resolve(gifRoot, entry.name), mode));
}

function buildCharacter(folderName, assetRoot, mode) {
  const characterPath = path.resolve(assetRoot, folderName);
  const warnings = [];
  const directions = {};
  const animations = {};
  const rawAnimations = listDirs(path.resolve(characterPath, 'animations'));

  for (const rawAnimation of rawAnimations) {
    const animationName = animationAliases.get(rawAnimation) ?? rawAnimation.replaceAll('-', '_');
    const animationPath = path.resolve(characterPath, 'animations', rawAnimation);
    animations[animationName] ??= {
      name: animationName,
      source_names: [],
      directions: {},
      preview_gifs: [],
    };

    animations[animationName].source_names.push(rawAnimation);
    animations[animationName].preview_gifs.push(...collectGifs(characterPath, rawAnimation, mode));

    for (const rawDirection of listDirs(animationPath)) {
      const directionName = directionAliases.get(rawDirection) ?? rawDirection.replaceAll('-', '');
      const frames = listPngFrames(path.resolve(animationPath, rawDirection)).map((frame) => ({
        ...frame,
        path: manifestUrl(path.resolve(animationPath, rawDirection, frame.file_name), mode),
      }));
      animations[animationName].directions[directionName] = frames;
      directions[directionName] ??= {};
      directions[directionName][animationName] = {
        frame_count: frames.length,
        frames,
      };

      const wrongSize = frames.filter((frame) => frame.width !== 64 || frame.height !== 64);
      if (wrongSize.length > 0) {
        warnings.push(`${animationName}/${directionName} has ${wrongSize.length} non-64x64 frame(s).`);
      }
    }
  }

  for (const animationName of expectedAnimations) {
    if (!animations[animationName]) {
      warnings.push(`Missing normalized animation: ${animationName}.`);
      continue;
    }

    for (const directionName of canonicalDirections) {
      if (!animations[animationName].directions[directionName]) {
        warnings.push(`Missing ${animationName}/${directionName} frames.`);
      }
    }
  }

  const rotationPath = path.resolve(characterPath, 'rotations');
  const rotation_preview_paths = fs.existsSync(rotationPath)
    ? fs
        .readdirSync(rotationPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
        .map((entry) => ({
          direction: directionAliases.get(path.basename(entry.name, '.png')) ?? path.basename(entry.name, '.png'),
          path: manifestUrl(path.resolve(rotationPath, entry.name), mode),
        }))
    : [];

  const representative = rotation_preview_paths.find((item) => item.direction === 'south')?.path
    ?? animations.idle?.directions.south?.[0]?.path
    ?? '';

  return {
    character_id: folderName,
    display_name: `${folderName.split('-')[0]} ${titleize(folderName)}`,
    class_type: classify(folderName),
    source_folder: manifestUrl(characterPath, mode),
    canvas_size: { width: 64, height: 64 },
    directions,
    animations: Object.values(animations),
    animation_names: Object.keys(animations).sort(),
    source_quality_warnings: [...new Set(warnings)],
    rotation_preview_paths,
    representative_frame: representative,
    extraction_status: {
      frame_chopped: true,
      preset_regions_available: true,
      connected_pixel_pass_available: true,
      apes_pass_available: false,
      manual_cleanup_complete: false,
    },
  };
}

function main() {
  if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
    console.log('Usage: node tools/index-assets.js [--asset-root <path>] [--public-manifest]');
    console.log('Environment override: PIXEL_CREATOR_ASSET_ROOT=<path>');
    console.log('By default, ignored in-repo assets and external asset roots write characters.local.json.');
    return;
  }

  const assetRoot = resolveAssetRoot();
  const forcePublicManifest = cliArgs.includes('--public-manifest');
  if (!fs.existsSync(assetRoot)) {
    throw new Error(`Asset root not found: ${assetRoot}`);
  }

  fs.mkdirSync(manifestDir, { recursive: true });
  const mode = isWithinRoot(assetRoot, appRoot) ? 'repo' : 'local';
  const writeLocalManifest = !forcePublicManifest && (mode === 'local' || isIgnoredInRepoAssetRoot(assetRoot));
  const characters = listDirs(assetRoot).map(name => buildCharacter(name, assetRoot, mode));
  const manifest = {
    generated_at: new Date().toISOString(),
    asset_root: serializeAssetRoot(assetRoot, mode),
    total_characters: characters.length,
    canonical_directions: canonicalDirections,
    canonical_animations: expectedAnimations,
    characters,
  };

  const outputPath = writeLocalManifest ? localManifestPath : manifestPath;
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (!writeLocalManifest) {
    fs.rmSync(localManifestPath, { force: true });
    console.log(`Indexed ${characters.length} characters -> ${manifestPath}`);
    return;
  }

  console.log(`Indexed ${characters.length} characters -> ${localManifestPath}`);
  console.log(`Left ${manifestPath} untouched because ${mode === 'local' ? 'the asset root is outside the repository root' : 'the asset root is ignored local runtime data'}.`);
}

main();
