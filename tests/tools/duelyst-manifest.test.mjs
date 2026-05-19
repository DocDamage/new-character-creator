import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeDuelystAudit } from '../../src/duelystManifest.ts'

test('Duelyst audit URLs are normalized for GitHub Pages base paths', () => {
  const audit = normalizeDuelystAudit({
    generated_at: '2026-05-19T00:00:00.000Z',
    package_path: '',
    available: true,
    extraction_root: '',
    total_assets: 1,
    extension_counts: {},
    candidate_units: [
      {
        unit_id: 'f6_general',
        display_name: 'General',
        sheet_source_path: '',
        sheet_url: '',
        sheet_size: { width: 80, height: 80 },
        plist_source_path: '',
        estimated_frame_size: null,
        animation_names: ['idle'],
        animation_clip_count: 1,
        controller_count: 0,
        preview_url: '/data/duelyst/staged/f6_general_stage.png',
        staged_frame_url: '/data/duelyst/staged/f6_general_stage.png',
        staged_frame_size: { width: 80, height: 80 },
        staged_animations: {
          idle: [frame('/data/duelyst/staged/f6_general/idle/000.png')],
        },
        staged: true,
        stage_character_id: 'duelyst_f6_general',
        score: 1,
        reasons: [],
        warnings: [],
      },
    ],
    staged_manifest: {
      generated_at: '2026-05-19T00:00:00.000Z',
      package_path: '',
      character_count: 1,
      characters: [
        {
          character_id: 'duelyst_f6_general',
          display_name: 'Duelyst General',
          class_type: 'duelyst_staged',
          source_folder: '/data/duelyst/staged',
          canvas_size: { width: 80, height: 80 },
          directions: {
            south: {
              idle: {
                frame_count: 1,
                frames: [frame('/data/duelyst/staged/f6_general/idle/000.png')],
              },
            },
          },
          animations: [
            {
              name: 'idle',
              source_names: ['idle'],
              directions: {
                south: [frame('/data/duelyst/staged/f6_general/idle/000.png')],
              },
              preview_gifs: ['/data/duelyst/staged/f6_general/idle/preview.gif'],
            },
          ],
          animation_names: ['idle'],
          source_quality_warnings: [],
          rotation_preview_paths: [{ direction: 'south', path: '/data/duelyst/staged/f6_general/idle/000.png' }],
          representative_frame: '/data/duelyst/staged/f6_general/idle/000.png',
          extraction_status: {
            frame_chopped: true,
            preset_regions_available: false,
            connected_pixel_pass_available: true,
            apes_pass_available: true,
            manual_cleanup_complete: false,
          },
        },
      ],
    },
    findings: [],
    summary: '',
  }, (path) => path.startsWith('/') ? `/sprite-character-creator${path}` : path)

  assert.equal(audit.candidate_units[0].preview_url, '/sprite-character-creator/data/duelyst/staged/f6_general_stage.png')
  assert.equal(audit.candidate_units[0].staged_animations?.idle[0].path, '/sprite-character-creator/data/duelyst/staged/f6_general/idle/000.png')
  assert.equal(audit.staged_manifest.characters[0].representative_frame, '/sprite-character-creator/data/duelyst/staged/f6_general/idle/000.png')
  assert.equal(audit.staged_manifest.characters[0].animations[0].directions.south?.[0].path, '/sprite-character-creator/data/duelyst/staged/f6_general/idle/000.png')
  assert.equal(audit.staged_manifest.characters[0].directions.south?.idle.frames[0].path, '/sprite-character-creator/data/duelyst/staged/f6_general/idle/000.png')
})

function frame(path) {
  return {
    index: 0,
    path,
    file_name: '000.png',
    width: 80,
    height: 80,
  }
}
