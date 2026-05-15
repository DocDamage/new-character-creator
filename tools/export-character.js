import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const manifestPath = path.resolve(appRoot, 'public', 'data', 'manifests', 'characters.json');
const exportRoot = path.resolve(appRoot, 'data', 'exports');
const directions = ['south', 'east', 'north', 'west'];

function fromFsUrl(url) {
  if (!url.startsWith('/@fs/')) return url;
  return decodeURI(url.slice('/@fs/'.length));
}

function ensureDir(folder) {
  fs.mkdirSync(folder, { recursive: true });
}

function copyFrames(character, outRoot) {
  for (const animation of character.animations) {
    for (const direction of directions) {
      const frames = animation.directions[direction] ?? [];
      const frameOut = path.resolve(outRoot, 'individual_frames', animation.name, direction);
      ensureDir(frameOut);
      for (const frame of frames) {
        fs.copyFileSync(fromFsUrl(frame.path), path.resolve(frameOut, frame.file_name));
      }
    }
  }
}

function buildGenericManifest(character) {
  return {
    export_version: 1,
    created_at: new Date().toISOString(),
    character_id: character.character_id,
    source_character: character.character_id,
    canvas_size: character.canvas_size,
    animations: character.animations.map((animation) => ({
      name: animation.name,
      directions: directions.map((direction) => ({
        direction,
        frame_count: animation.directions[direction]?.length ?? 0,
        frames: (animation.directions[direction] ?? []).map((frame) => `individual_frames/${animation.name}/${direction}/${frame.file_name}`),
      })),
    })),
    apes: {
      first_class: true,
      expected_labels: ['head', 'torso', 'front_arm', 'back_arm', 'front_leg', 'back_leg'],
      bridge: 'tools/apes_bridge',
    },
  };
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
  const id = process.argv[2] ?? '1-warrior-woman';
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const character = manifest.characters.find((item) => item.character_id === id);
  if (!character) {
    throw new Error(`Unknown character "${id}". Run npm run index:assets first.`);
  }

  const outRoot = path.resolve(exportRoot, character.character_id);
  ensureDir(outRoot);
  ensureDir(path.resolve(outRoot, 'godot_4'));
  copyFrames(character, outRoot);
  fs.writeFileSync(path.resolve(outRoot, 'manifest.json'), JSON.stringify(buildGenericManifest(character), null, 2) + '\n');
  fs.writeFileSync(path.resolve(outRoot, 'godot_4', `${character.character_id}.tscn`), buildGodotScene(character));
  fs.writeFileSync(path.resolve(outRoot, 'godot_4', `${character.character_id}_sprite_frames.tres`), buildSpriteFrames(character));
  console.log(`Exported ${character.character_id} -> ${outRoot}`);
}

main();
