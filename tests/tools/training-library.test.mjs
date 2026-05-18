import test from 'node:test'
import assert from 'node:assert/strict'

import {
  approveTrainingDraft,
  canUseTrainingRecordForExportOrTrain,
  classifyTrainingInboxDraft,
} from '../../src/trainingLibrary.ts'
import {
  loadStoredTrainingInboxDrafts,
  loadStoredTrainingLibraryRecords,
  trainingInboxStorageKey,
  trainingLibraryStorageKey,
} from '../../src/appPersistence.ts'

test('classification creates an unapproved Training Inbox draft from generated animation sources', () => {
  const draft = classifyTrainingInboxDraft({
    sourceNames: [
      'generated/ash_ronin/walk/south/frame_000.png',
      'generated/ash_ronin/walk/east/frame_000.png',
      'generated/ash_ronin/walk/north/frame_000.png',
      'generated/ash_ronin/walk/west/frame_000.png',
    ],
    goal: 'fine-tune reusable walk cycle',
    animation: 'walk',
    directions: ['south', 'east', 'north', 'west'],
    frameSize: { width: 64, height: 64 },
    frameLayout: { columns: 4, rows: 1, frame_count: 4 },
    exportProfile: 'godot_4',
    sourceFamily: 'sprite_pack',
    files: [
      { source_name: 'generated/ash_ronin/walk/south/frame_000.png', kind: 'generated', width: 64, height: 64, has_transparency: true, pivot: { x: 32, y: 56 }, labels: ['body'], source_family: 'sprite_pack' },
    ],
    provenance: { created_at: '2026-05-18T12:00:00.000Z', created_by: 'test' },
  })

  assert.equal(draft.source_kind, 'generated')
  assert.equal(draft.review_state, 'draft')
  assert.equal(draft.source_names.length, 4)
  assert.equal(draft.validation_findings.some((finding) => finding.level === 'red'), false)
})

test('red validation blocks export and train readiness', () => {
  const draft = classifyTrainingInboxDraft({
    sourceNames: ['dropped/hero/idle/south/frame_000.png'],
    goal: 'train idle',
    animation: 'idle',
    directions: ['south'],
    frameSize: { width: 64, height: 64 },
    frameLayout: { columns: 1, rows: 1, frame_count: 1 },
    exportProfile: 'generic',
    sourceFamily: 'lpc',
    files: [
      { source_name: 'dropped/hero/idle/south/frame_000.png', kind: 'dropped', width: 64, height: 64, has_transparency: false, source_family: 'sprite_pack' },
    ],
    requiredDirections: ['south', 'east', 'north', 'west'],
    provenance: { created_at: '2026-05-18T12:00:00.000Z', created_by: 'test' },
  })

  assert.deepEqual(draft.validation_findings.filter((finding) => finding.level === 'red').map((finding) => finding.code), [
    'missing_transparency',
    'source_family_mismatch',
  ])
  assert.equal(canUseTrainingRecordForExportOrTrain(draft), false)
})

test('approval preserves draft provenance and produces a reviewed Training Library record', () => {
  const draft = classifyTrainingInboxDraft({
    sourceNames: ['baked/hero/attack/south/frame_000.png'],
    goal: 'library attack set',
    animation: 'attack',
    directions: ['south', 'east', 'north', 'west'],
    frameSize: { width: 64, height: 64 },
    frameLayout: { columns: 4, rows: 1, frame_count: 4 },
    exportProfile: 'aseprite',
    sourceFamily: 'custom',
    files: [
      { source_name: 'baked/hero/attack/south/frame_000.png', kind: 'baked', width: 64, height: 64, has_transparency: true, pivot: { x: 32, y: 56 }, labels: ['weapon'], source_family: 'custom' },
    ],
    provenance: { created_at: '2026-05-18T12:00:00.000Z', created_by: 'test', source: 'wizard' },
  })

  const record = approveTrainingDraft(draft, { approved_at: '2026-05-18T12:05:00.000Z', approved_by: 'reviewer' })

  assert.equal(record.review_state, 'approved')
  assert.equal(record.provenance.created_at, '2026-05-18T12:00:00.000Z')
  assert.equal(record.provenance.approved_at, '2026-05-18T12:05:00.000Z')
  assert.equal(record.provenance.source_draft_id, draft.draft_id)
  assert.equal(canUseTrainingRecordForExportOrTrain(record), true)
})

test('training draft ids include validation-critical metadata', () => {
  const baseInput = {
    sourceNames: ['generated/ash_ronin/walk/south/frame_000.png'],
    goal: 'fine-tune reusable walk cycle',
    animation: 'walk',
    directions: ['south', 'east', 'north', 'west'],
    frameSize: { width: 64, height: 64 },
    frameLayout: { columns: 4, rows: 1, frame_count: 4 },
    exportProfile: 'godot_4',
    sourceFamily: 'sprite_pack',
    provenance: { created_at: '2026-05-18T12:00:00.000Z', created_by: 'test' },
  }

  const standardDraft = classifyTrainingInboxDraft(baseInput)
  const oversizeDraft = classifyTrainingInboxDraft({
    ...baseInput,
    frameSize: { width: 192, height: 192 },
    exportProfile: 'lpc_oversize',
  })

  assert.notEqual(standardDraft.draft_id, oversizeDraft.draft_id)
})

test('training draft ids distinguish repeated wizard captures', () => {
  const baseInput = {
    sourceNames: ['generated/ash_ronin/run/south/frame_000.png'],
    goal: 'fine-tune reusable run cycle',
    animation: 'run',
    directions: ['south'],
    frameSize: { width: 64, height: 64 },
    frameLayout: { columns: 1, rows: 1, frame_count: 1 },
    exportProfile: 'generic',
    sourceFamily: 'custom',
  }

  const firstDraft = classifyTrainingInboxDraft({
    ...baseInput,
    provenance: { created_at: '2026-05-18T12:00:00.000Z' },
  })
  const secondDraft = classifyTrainingInboxDraft({
    ...baseInput,
    provenance: { created_at: '2026-05-18T12:01:00.000Z' },
  })

  assert.notEqual(firstDraft.draft_id, secondDraft.draft_id)
})

test('training storage loaders fall back when localStorage reads are unavailable', () => {
  const originalWindow = globalThis.window
  globalThis.window = {
    localStorage: {
      getItem(key) {
        assert.ok([trainingInboxStorageKey, trainingLibraryStorageKey].includes(key))
        throw new Error('localStorage blocked')
      },
    },
  }

  try {
    assert.deepEqual(loadStoredTrainingInboxDrafts(), [])
    assert.deepEqual(loadStoredTrainingLibraryRecords(), [])
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = originalWindow
    }
  }
})
