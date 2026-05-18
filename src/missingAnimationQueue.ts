import { buildLpcDrawRecords } from './lpcComposition.ts'
import type { LpcCatalog, LpcDrawRecord } from './lpcCatalog.ts'
import type { AnimationName, Direction, KitbashRecipe } from './types.ts'

export type MissingAnimationQueueItem = {
  id: string
  item_id: string
  item_name: string
  type_name: string
  layer_id: string
  variant: string
  status: 'missing' | 'unsupported'
  requested_animation: string
  resolved_animation: string | null
  body_type: string
  warnings: string[]
  affected_frames: Array<{
    animation: AnimationName
    direction: Direction
    frame_index: number
  }>
}

export type MissingAnimationQueue = {
  format: 'pixel_creator_missing_animation_queue'
  version: 1
  recipe_id: string
  summary: {
    issue_count: number
    missing_count: number
    unsupported_count: number
    affected_frame_count: number
  }
  items: MissingAnimationQueueItem[]
}

type BuildMissingAnimationQueueOptions = {
  catalog: LpcCatalog
  recipe: KitbashRecipe
  bodyType: string
  animations: AnimationName[]
  directions: Direction[]
  frameRange: [number, number]
  availablePaths?: ReadonlySet<string>
}

export function buildMissingAnimationQueue({
  catalog,
  recipe,
  bodyType,
  animations,
  directions,
  frameRange,
  availablePaths,
}: BuildMissingAnimationQueueOptions): MissingAnimationQueue {
  const [start, end] = frameRange[0] <= frameRange[1] ? frameRange : [frameRange[1], frameRange[0]]
  const grouped = new Map<string, MissingAnimationQueueItem>()

  for (const animation of animations) {
    for (const direction of directions) {
      for (let frameIndex = start; frameIndex <= end; frameIndex += 1) {
        const records = buildLpcDrawRecords({
          catalog,
          selections: recipe.lpc_selections ?? {},
          bodyType,
          animation,
          direction,
          frameIndex,
          availablePaths,
          exportProfile: 'standard_64',
        })
        for (const record of records) {
          if (record.animation_status !== 'missing' && record.animation_status !== 'unsupported') continue
          const key = queueKey(record)
          const item = grouped.get(key) ?? makeQueueItem(record)
          item.affected_frames.push({ animation, direction, frame_index: frameIndex })
          item.warnings = unique([...item.warnings, ...record.warnings])
          grouped.set(key, item)
        }
      }
    }
  }

  const items = Array.from(grouped.values()).sort((left, right) =>
    statusScore(left.status) - statusScore(right.status) ||
    left.item_id.localeCompare(right.item_id) ||
    left.layer_id.localeCompare(right.layer_id),
  )
  return {
    format: 'pixel_creator_missing_animation_queue',
    version: 1,
    recipe_id: recipe.character_id,
    summary: summarizeQueueItems(items),
    items,
  }
}

export function filterMissingAnimationQueue(queue: MissingAnimationQueue, excludedItemIds: ReadonlySet<string>): MissingAnimationQueue {
  const items = queue.items.filter((item) => !excludedItemIds.has(item.id))
  return {
    ...queue,
    summary: summarizeQueueItems(items),
    items,
  }
}

function summarizeQueueItems(items: MissingAnimationQueueItem[]): MissingAnimationQueue['summary'] {
  return {
    issue_count: items.length,
    missing_count: items.filter((item) => item.status === 'missing').length,
    unsupported_count: items.filter((item) => item.status === 'unsupported').length,
    affected_frame_count: items.reduce((total, item) => total + item.affected_frames.length, 0),
  }
}

function queueKey(record: LpcDrawRecord) {
  return [
    record.item_id,
    record.layer_id,
    record.variant,
    record.animation_status,
    record.requested_animation,
    record.resolved_animation ?? '',
    record.body_type,
  ].join('|')
}

function makeQueueItem(record: LpcDrawRecord): MissingAnimationQueueItem {
  return {
    id: queueKey(record),
    item_id: record.item_id,
    item_name: record.item_name,
    type_name: record.type_name,
    layer_id: record.layer_id,
    variant: record.variant,
    status: record.animation_status === 'unsupported' ? 'unsupported' : 'missing',
    requested_animation: record.requested_animation,
    resolved_animation: record.resolved_animation,
    body_type: record.body_type,
    warnings: unique(record.warnings),
    affected_frames: [],
  }
}

function statusScore(status: MissingAnimationQueueItem['status']) {
  return status === 'unsupported' ? 0 : 1
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort()
}
