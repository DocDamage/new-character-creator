import type {
  AnimationName,
  Direction,
  SourceFamilyId,
  TrainingFrameLayout,
  TrainingFrameSize,
  TrainingInboxDraft,
  TrainingLibraryRecord,
  TrainingProvenance,
  TrainingSourceFamilyCompatibility,
  TrainingSourceFileDescriptor,
  TrainingSourceKind,
  TrainingValidationFinding,
} from './types'

export type ClassifyTrainingInboxInput = {
  sourceNames: string[]
  files?: TrainingSourceFileDescriptor[]
  goal: string
  animation: AnimationName
  directions: Direction[]
  frameLayout: TrainingFrameLayout
  frameSize: TrainingFrameSize
  exportProfile: string
  sourceFamily: SourceFamilyId
  requiredDirections?: Direction[]
  provenance?: Partial<TrainingProvenance>
}

export type ApproveTrainingDraftInput = {
  approved_at?: string
  approved_by?: string
}

const defaultRequiredDirections: Direction[] = ['south', 'east', 'north', 'west']

export function classifyTrainingInboxDraft(input: ClassifyTrainingInboxInput): TrainingInboxDraft {
  const sourceNames = uniqueCleanStrings(input.sourceNames)
  const files = input.files?.length
    ? input.files
    : sourceNames.map((sourceName) => ({ source_name: sourceName }))
  const sourceKind = inferSourceKind(files, sourceNames)
  const sourceFamilyCompatibility = buildSourceFamilyCompatibility(files, input.sourceFamily)
  const directions = uniqueDirections(input.directions)
  const frameLayout = normalizeFrameLayout(input.frameLayout)
  const frameSize = normalizeFrameSize(input.frameSize)
  const validationFindings = validateTrainingDraftFields({
    ...input,
    sourceNames,
    files,
    sourceFamilyCompatibility,
  })
  const hasRed = validationFindings.some((finding) => finding.level === 'red')

  return {
    draft_id: makeStableRecordId('training_draft', [
      sourceKind,
      input.goal,
      input.animation,
      directions.join(','),
      `${frameSize.width}x${frameSize.height}`,
      `${frameLayout.columns}x${frameLayout.rows}:${frameLayout.frame_count}`,
      input.exportProfile,
      input.sourceFamily,
      sourceNames.join('|'),
      input.provenance?.created_at ?? '',
    ]),
    source_kind: sourceKind,
    source_names: sourceNames,
    goal: input.goal.trim(),
    animation: input.animation,
    directions,
    frame_layout: frameLayout,
    frame_size: frameSize,
    export_profile: input.exportProfile,
    source_family_compatibility: sourceFamilyCompatibility,
    validation_findings: validationFindings,
    review_state: hasRed ? 'needs_changes' : 'draft',
    provenance: {
      created_at: input.provenance?.created_at ?? new Date().toISOString(),
      created_by: input.provenance?.created_by ?? 'local-wizard',
      source: input.provenance?.source ?? 'training-inbox-wizard',
    },
  }
}

export function approveTrainingDraft(draft: TrainingInboxDraft, input: ApproveTrainingDraftInput = {}): TrainingLibraryRecord {
  const redFindings = draft.validation_findings.filter((finding) => finding.level === 'red')
  if (redFindings.length > 0) {
    throw new Error(`Training draft has ${redFindings.length} red validation finding(s).`)
  }

  const approvedAt = input.approved_at ?? new Date().toISOString()
  const approvedBy = input.approved_by ?? 'local-reviewer'
  return {
    record_id: makeStableRecordId('training_record', [draft.draft_id, approvedAt, approvedBy]),
    draft_id: draft.draft_id,
    source_kind: draft.source_kind,
    source_names: draft.source_names,
    goal: draft.goal,
    animation: draft.animation,
    directions: draft.directions,
    frame_layout: draft.frame_layout,
    frame_size: draft.frame_size,
    export_profile: draft.export_profile,
    source_family_compatibility: draft.source_family_compatibility,
    validation_findings: draft.validation_findings,
    review_state: 'approved',
    provenance: {
      ...draft.provenance,
      source_draft_id: draft.draft_id,
      approved_at: approvedAt,
      approved_by: approvedBy,
    },
  }
}

export function canUseTrainingRecordForExportOrTrain(record: TrainingInboxDraft | TrainingLibraryRecord) {
  return record.review_state === 'approved' && !record.validation_findings.some((finding) => finding.level === 'red')
}

function validateTrainingDraftFields(input: ClassifyTrainingInboxInput & {
  sourceNames: string[]
  files: TrainingSourceFileDescriptor[]
  sourceFamilyCompatibility: TrainingSourceFamilyCompatibility
}): TrainingValidationFinding[] {
  const findings: TrainingValidationFinding[] = []
  const frameSize = normalizeFrameSize(input.frameSize)
  const frameLayout = normalizeFrameLayout(input.frameLayout)
  const directions = uniqueDirections(input.directions)
  const requiredDirections = input.requiredDirections ?? defaultRequiredDirections

  if (input.sourceNames.length === 0) {
    findings.push(red('missing_sources', 'Add at least one dropped, generated, or baked source file.'))
  }
  if (!input.goal.trim()) findings.push(yellow('missing_goal', 'Add a training goal before handoff.'))
  if (!String(input.animation).trim()) findings.push(red('missing_animation', 'Choose the animation represented by this set.'))
  if (directions.length === 0) findings.push(red('missing_directions', 'Choose at least one covered direction.'))
  if (frameSize.width <= 0 || frameSize.height <= 0) findings.push(red('invalid_frame_size', 'Frame width and height must be positive.'))
  if (frameLayout.columns <= 0 || frameLayout.rows <= 0 || frameLayout.frame_count <= 0) {
    findings.push(red('invalid_frame_layout', 'Frame layout must include positive columns, rows, and frame count.'))
  }
  if (input.files.some((file) => file.width !== undefined && file.height !== undefined && (file.width !== frameSize.width || file.height !== frameSize.height))) {
    findings.push(red('inconsistent_frame_size', 'One or more files do not match the selected frame size.'))
  }
  if (input.files.some((file) => file.has_transparency === false)) {
    findings.push(red('missing_transparency', 'One or more files do not preserve alpha transparency.'))
  }
  if (!input.sourceFamilyCompatibility.compatible) {
    findings.push(red('source_family_mismatch', 'Detected source family does not match the selected training family.'))
  }
  if (input.files.length > 0 && input.files.every((file) => !file.pivot)) {
    findings.push(yellow('missing_pivots', 'No pivot metadata was found; review floor contact before approval.'))
  }
  if (input.files.length > 0 && input.files.every((file) => !file.labels || file.labels.length === 0)) {
    findings.push(yellow('missing_labels', 'No semantic labels were found; label coverage should be reviewed.'))
  }

  const missingDirections = requiredDirections.filter((direction) => !directions.includes(direction))
  if (missingDirections.length > 0) {
    findings.push(yellow('partial_direction_coverage', `Missing ${missingDirections.join(', ')} direction coverage.`))
  }
  if (findings.length === 0) {
    findings.push(green('ready_for_review', 'Record is ready for human review and approval.'))
  }
  return findings
}

function buildSourceFamilyCompatibility(files: TrainingSourceFileDescriptor[], requested: SourceFamilyId): TrainingSourceFamilyCompatibility {
  const detected = Array.from(new Set(files.map((file) => file.source_family).filter((value): value is SourceFamilyId => Boolean(value))))
  const compatible = detected.length === 0 || detected.every((family) => family === requested || requested === 'custom')
  return {
    requested,
    detected,
    compatible,
    notes: compatible ? [] : detected.map((family) => `${family} source submitted for ${requested} training.`),
  }
}

function inferSourceKind(files: TrainingSourceFileDescriptor[], sourceNames: string[]): TrainingSourceKind {
  const explicitKind = files.find((file) => file.kind)?.kind
  if (explicitKind) return explicitKind
  const searchable = sourceNames.join(' ').toLowerCase()
  if (searchable.includes('final-custom-animation')) return 'final-custom-animation'
  if (searchable.includes('missing-animation')) return 'missing-animation'
  if (searchable.includes('cleanup-pair')) return 'cleanup-pair'
  if (searchable.includes('reference')) return 'reference'
  if (searchable.includes('baked')) return 'baked'
  if (searchable.includes('generated')) return 'generated'
  return 'dropped'
}

function makeStableRecordId(prefix: string, parts: string[]) {
  const text = parts.join('|').toLowerCase()
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return `${prefix}_${Math.abs(hash).toString(36)}`
}

function normalizeFrameSize(size: TrainingFrameSize): TrainingFrameSize {
  return { width: Number(size.width) || 0, height: Number(size.height) || 0 }
}

function normalizeFrameLayout(layout: TrainingFrameLayout): TrainingFrameLayout {
  return {
    columns: Number(layout.columns) || 0,
    rows: Number(layout.rows) || 0,
    frame_count: Number(layout.frame_count) || 0,
  }
}

function uniqueDirections(directions: Direction[]) {
  return Array.from(new Set(directions.filter(Boolean)))
}

function uniqueCleanStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function red(code: string, message: string): TrainingValidationFinding {
  return { level: 'red', code, message }
}

function yellow(code: string, message: string): TrainingValidationFinding {
  return { level: 'yellow', code, message }
}

function green(code: string, message: string): TrainingValidationFinding {
  return { level: 'green', code, message }
}
