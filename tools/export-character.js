import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const manifestPath = path.resolve(appRoot, 'public', 'data', 'manifests', 'characters.json');
const exportRoot = path.resolve(appRoot, 'data', 'exports');
const directions = ['south', 'east', 'north', 'west'];
const cliArgs = process.argv.slice(2);

function fromFsUrl(url) {
  if (!url.startsWith('/@fs/')) return url;
  return decodeURI(url.slice('/@fs/'.length));
}

function getOptionValue(name) {
  const inline = cliArgs.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = cliArgs.findIndex((arg) => arg === name);
  if (index >= 0) return cliArgs[index + 1];
  return undefined;
}

function getCharacterId() {
  return cliArgs.find((arg) => !arg.startsWith('--')) ?? '1-warrior-woman';
}

function getConfiguredAssetRoot() {
  const override = getOptionValue('--asset-root') ?? process.env.PIXEL_CREATOR_ASSET_ROOT;
  return override ? path.resolve(override) : undefined;
}

function resolveSourcePath(url, recordedAssetRoot, configuredAssetRoot) {
  const sourcePath = fromFsUrl(url);
  if (fs.existsSync(sourcePath) || !configuredAssetRoot || !recordedAssetRoot) return sourcePath;

  const normalizedRecordedRoot = path.resolve(recordedAssetRoot);
  if (!sourcePath.toLowerCase().startsWith(normalizedRecordedRoot.toLowerCase())) return sourcePath;

  const relativeSourcePath = path.relative(normalizedRecordedRoot, sourcePath);
  return path.resolve(configuredAssetRoot, relativeSourcePath);
}

function ensureDir(folder) {
  fs.mkdirSync(folder, { recursive: true });
}

function resetDir(folder) {
  fs.rmSync(folder, { recursive: true, force: true });
  ensureDir(folder);
}

function buildGenericManifest(character, frameRecords, warnings, resolveFrameSourcePath, exportContext) {
  return {
    export_version: 1,
    created_at: new Date().toISOString(),
    character_id: character.character_id,
    source_character: character.character_id,
    canvas_size: character.canvas_size,
    manifest_asset_root: exportContext.manifestAssetRoot,
    resolved_asset_root: exportContext.resolvedAssetRoot,
    animations: character.animations.map((animation) => ({
      name: animation.name,
      directions: directions.map((direction) => ({
        direction,
        frame_count: frameRecords.filter((frame) => frame.animation === animation.name && frame.direction === direction).length,
        frames: frameRecords
          .filter((frame) => frame.animation === animation.name && frame.direction === direction)
          .map((frame) => `../${frame.export_path}`),
        source_frames: (animation.directions[direction] ?? []).map((frame) => ({
          file_name: frame.file_name,
          source_path: frame.path,
          source_fs_path: resolveFrameSourcePath(frame.path),
          available: fs.existsSync(resolveFrameSourcePath(frame.path)),
        })),
      })),
    })),
    apes: {
      first_class: true,
      expected_labels: ['head', 'torso', 'front_arm', 'back_arm', 'front_leg', 'back_leg'],
      bridge: 'tools/apes_bridge',
    },
    warnings,
  };
}

function buildUnityMetadata(character) {
  return {
    format: 'unity_2d_sprite_metadata',
    version: 1,
    character_id: character.character_id,
    source_character: character.character_id,
    pixels_per_unit: 64,
    pivot: { x: 0.5, y: 0.5 },
    filter_mode: 'Point',
    compression: 'None',
    sprite_mode: 'Multiple',
    animations: character.animations.flatMap((animation) =>
      directions.map((direction) => ({
        clip_name: `${animation.name}_${direction}`,
        frame_count: animation.directions[direction]?.length ?? 0,
        frame_size: { width: 64, height: 64 },
        loop_time: animation.name !== 'attack',
        sample_rate: animation.name === 'attack' ? 10 : 7,
        spritesheet: `../../rendered/sheets/${character.character_id}_${animation.name}_${direction}_sheet.png`,
      })),
    ),
  };
}

function buildRpgMakerMetadata(character) {
  return {
    format: 'rpg_maker_mz_character_sheet',
    version: 1,
    character_id: character.character_id,
    source_character: character.character_id,
    cell_size: { width: 64, height: 64 },
    sheet_layout: {
      columns: 12,
      rows: 8,
      directions: ['down', 'left', 'right', 'up'],
      frames_per_step: 3,
      note: 'Use walk frames as the RPG Maker movement source; crop or duplicate frames if your project expects 48x48 cells.',
    },
    suggested_source_animation: character.animation_names.includes('walk') ? 'walk' : character.animation_names[0],
    rendered_sheet_root: '../../rendered/sheets',
  };
}

function buildAsepriteReference(character) {
  return {
    format: 'aseprite_reference_package',
    version: 1,
    character_id: character.character_id,
    source_character: character.character_id,
    canvas: { width: 64, height: 64 },
    tags: character.animation_names.flatMap((animation) =>
      directions.map((direction) => ({
        name: `${animation}_${direction}`,
        direction: 'forward',
        frame_count: character.animations.find((item) => item.name === animation)?.directions[direction]?.length ?? 0,
      })),
    ),
    notes: [
      'Rendered source frames are exported under ../../rendered/frames.',
      'Rendered spritesheets are exported under ../../rendered/sheets.',
      'Use source frame references in exports/generic_manifest.json when tracing back to original assets.',
    ],
  };
}

function copyRenderedFrames(character, outRoot, resolveFrameSourcePath) {
  const records = [];
  const warnings = [];

    for (const animation of character.animations) {
      for (const direction of directions) {
        const frames = animation.directions[direction] ?? [];
        const frameOut = path.resolve(outRoot, 'rendered', 'frames', animation.name, direction);
        ensureDir(frameOut);
        for (const frame of frames) {
          const sourcePath = resolveFrameSourcePath(frame.path);
          if (!fs.existsSync(sourcePath)) {
            warnings.push(`Missing source frame: ${sourcePath}`);
            continue;
          }
          const targetPath = path.resolve(frameOut, frame.file_name);
          fs.copyFileSync(sourcePath, targetPath);
          records.push({
            animation: animation.name,
            direction,
            frame_index: frame.index,
            file_name: frame.file_name,
            export_path: path.relative(outRoot, targetPath).replaceAll('\\', '/'),
            source_path: frame.path,
            source_fs_path: sourcePath,
          });
        }
      }
    }

    return { records, warnings };
}

  function writeRenderedSheets(character, outRoot, frameRecords) {
  const sheets = [];
    const warnings = [];
  const sheetOut = path.resolve(outRoot, 'rendered', 'sheets');
  ensureDir(sheetOut);

    for (const animation of character.animations) {
      for (const direction of directions) {
        const frames = frameRecords.filter((frame) => frame.animation === animation.name && frame.direction === direction);
        if (frames.length === 0) {
          if ((animation.directions[direction] ?? []).length > 0) {
            warnings.push(`Skipped spritesheet for ${animation.name}/${direction}: no exported frames were available.`);
          }
          continue;
        }
        const framePaths = frames.map((frame) => path.resolve(outRoot, frame.export_path));
        const sheetName = `${character.character_id}_${animation.name}_${direction}_sheet.png`;
        const sheetPath = path.resolve(sheetOut, sheetName);
        writeSpriteSheet(framePaths, sheetPath);
        sheets.push({
          animation: animation.name,
          direction,
          frame_count: frames.length,
          file_name: sheetName,
          export_path: path.relative(outRoot, sheetPath).replaceAll('\\', '/'),
        });
      }
    }

    return { sheets, warnings };
}

  function buildRenderedFrameSet(character, frameRecords, sheetRecords, warnings) {
  return {
    format: 'pixel_creator_rendered_frame_set',
    version: 1,
    generated_at: new Date().toISOString(),
    character_id: character.character_id,
    source_character: character.character_id,
    frame_count: frameRecords.length,
    spritesheet_count: sheetRecords.length,
    frames: frameRecords,
    spritesheets: sheetRecords,
    gif_previews: sheetRecords.map((sheet) => ({
      animation: sheet.animation,
      direction: sheet.direction,
      frame_count: sheet.frame_count,
      frame_rate: sheet.animation === 'attack' ? 10 : 7,
      loop: sheet.animation !== 'attack',
      spritesheet_file: sheet.export_path,
      note: 'CLI export writes spritesheets and frame references only. Encode GIF previews in downstream tooling.',
    })),
    warnings,
  };
}

function buildPackageManifest(character, renderedFrameSet, warnings, exportContext) {
  return {
    format: 'pixel_creator_cli_package',
    version: 1,
    generated_at: new Date().toISOString(),
    character_id: character.character_id,
    source_character: character.character_id,
    canvas_size: character.canvas_size,
    manifest_asset_root: exportContext.manifestAssetRoot,
    resolved_asset_root: exportContext.resolvedAssetRoot,
    manifest_file: 'exports/generic_manifest.json',
    rendered_outputs: {
      frame_set_file: 'rendered/rendered_frame_set.json',
      frame_count: renderedFrameSet.frame_count,
      spritesheet_count: renderedFrameSet.spritesheet_count,
    },
    engine_exports: {
      godot_4: {
        scene_file: `exports/godot/${character.character_id}.tscn`,
        sprite_frames_file: `exports/godot/${character.character_id}_sprite_frames.tres`,
      },
      unity_2d: {
        file: `exports/unity/${character.character_id}_unity_2d.json`,
      },
      rpg_maker_mz: {
        file: `exports/rpg_maker/${character.character_id}_rpg_maker_mz.json`,
      },
      aseprite_reference: {
        file: `exports/aseprite/${character.character_id}_aseprite_reference.json`,
      },
    },
    source_frames: character.animations.flatMap((animation) =>
      directions.map((direction) => ({
        animation: animation.name,
        direction,
        frames: (animation.directions[direction] ?? []).map((frame) => ({
          file_name: frame.file_name,
          source_path: frame.path,
          source_fs_path: fromFsUrl(frame.path),
        })),
      })),
    ),
    warnings,
  };
}

function writeSpriteSheet(framePaths, outPath) {
  const pngs = framePaths.map((filePath) => PNG.sync.read(fs.readFileSync(filePath)));
  const frameWidth = pngs[0]?.width ?? 64;
  const frameHeight = pngs[0]?.height ?? 64;
  const sheet = new PNG({ width: frameWidth * pngs.length, height: frameHeight });

    pngs.forEach((png, index) => {
      blitPng(png, sheet, index * frameWidth, 0);
    });

  fs.writeFileSync(outPath, PNG.sync.write(sheet));
}

function blitPng(source, target, offsetX, offsetY) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceIndex = (source.width * y + x) * 4;
      const targetIndex = (target.width * (offsetY + y) + (offsetX + x)) * 4;
      source.data.copy(target.data, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
}
function buildGodotScene(character) {
  return `[gd_scene load_steps=2 format=3]

[ext_resource type="SpriteFrames" path="res://${character.character_id}_sprite_frames.tres" id="1"]

[node name="${character.character_id}" type="AnimatedSprite2D"]
sprite_frames = ExtResource("1")
animation = "idle_south"
centered = true
`;
}

function buildSpriteFrames(character) {
  const animations = character.animations.flatMap((animation) =>
    directions.map((direction) => ({
      name: `${animation.name}_${direction}`,
      speed: animation.name === 'attack' ? 10 : 7,
      loop: animation.name !== 'attack',
      frame_count: animation.directions[direction]?.length ?? 0,
    })),
  );

  return `[gd_resource type="SpriteFrames" format=3]

[resource]
metadata/source_character = "${character.character_id}"
metadata/extraction_methods = "APES,preset_region,connected_pixel,manual"
animations = ${JSON.stringify(animations).replaceAll('"', '\\"')}
`;
}

function main() {
  if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
    console.log('Usage: node tools/export-character.js [character-id] [--asset-root <path>]');
    console.log('Environment override: PIXEL_CREATOR_ASSET_ROOT=<path>');
    return;
  }

  const id = getCharacterId();
  const configuredAssetRoot = getConfiguredAssetRoot();
  if (configuredAssetRoot && !fs.existsSync(configuredAssetRoot)) {
    throw new Error(`Configured asset root not found: ${configuredAssetRoot}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const character = manifest.characters.find((item) => item.character_id === id);
  if (!character) {
    throw new Error(`Unknown character "${id}". Run npm run index:assets first.`);
  }

  const resolveFrameSourcePath = (framePath) => resolveSourcePath(framePath, manifest.asset_root, configuredAssetRoot);
  const exportContext = {
    manifestAssetRoot: manifest.asset_root,
    resolvedAssetRoot: configuredAssetRoot ?? manifest.asset_root,
  };

  const outRoot = path.resolve(exportRoot, character.character_id);
  resetDir(outRoot);
  ensureDir(path.resolve(outRoot, 'exports', 'godot'));
  ensureDir(path.resolve(outRoot, 'exports', 'unity'));
  ensureDir(path.resolve(outRoot, 'exports', 'rpg_maker'));
  ensureDir(path.resolve(outRoot, 'exports', 'aseprite'));

  const { records: frameRecords, warnings: frameWarnings } = copyRenderedFrames(character, outRoot, resolveFrameSourcePath);
  const { sheets: sheetRecords, warnings: sheetWarnings } = writeRenderedSheets(character, outRoot, frameRecords);
  const exportWarnings = [...frameWarnings, ...sheetWarnings];
  const renderedFrameSet = buildRenderedFrameSet(character, frameRecords, sheetRecords, exportWarnings);

  fs.writeFileSync(path.resolve(outRoot, 'package_manifest.json'), JSON.stringify(buildPackageManifest(character, renderedFrameSet, exportWarnings, exportContext), null, 2) + '\n');
  fs.writeFileSync(path.resolve(outRoot, 'rendered', 'rendered_frame_set.json'), JSON.stringify(renderedFrameSet, null, 2) + '\n');
  fs.writeFileSync(path.resolve(outRoot, 'exports', 'generic_manifest.json'), JSON.stringify(buildGenericManifest(character, frameRecords, exportWarnings, resolveFrameSourcePath, exportContext), null, 2) + '\n');
  fs.writeFileSync(path.resolve(outRoot, 'exports', 'godot', `${character.character_id}.tscn`), buildGodotScene(character));
  fs.writeFileSync(path.resolve(outRoot, 'exports', 'godot', `${character.character_id}_sprite_frames.tres`), buildSpriteFrames(character));
  fs.writeFileSync(path.resolve(outRoot, 'exports', 'unity', `${character.character_id}_unity_2d.json`), JSON.stringify(buildUnityMetadata(character), null, 2) + '\n');
  fs.writeFileSync(path.resolve(outRoot, 'exports', 'rpg_maker', `${character.character_id}_rpg_maker_mz.json`), JSON.stringify(buildRpgMakerMetadata(character), null, 2) + '\n');
  fs.writeFileSync(path.resolve(outRoot, 'exports', 'aseprite', `${character.character_id}_aseprite_reference.json`), JSON.stringify(buildAsepriteReference(character), null, 2) + '\n');
  if (exportWarnings.length > 0) {
    fs.writeFileSync(path.resolve(outRoot, 'export_warnings.json'), JSON.stringify(exportWarnings, null, 2) + '\n');
  }
  console.log(`Exported ${character.character_id} -> ${outRoot}`);
}

main();
