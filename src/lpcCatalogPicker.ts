import type { AnimationName } from './types.ts'
import type { LpcCatalog, LpcCatalogItem, LpcRecipeSelection } from './lpcCatalog.ts'
import { lpcFrameGeometry } from './lpcAssetResolver.ts'

type PickerOptionsInput = {
  catalog: LpcCatalog
  slotId: string
  selections: Record<string, LpcRecipeSelection>
  bodyType: string
  animation: AnimationName
  query?: string
}

export type LpcCatalogPickerOption = {
  item_id: string
  name: string
  type_name: string
  variants: string[]
  credit_count: number
  compatibility_state: 'ready' | 'blocked' | 'degraded'
  warnings: string[]
}

export type LpcSelectionCreditReadiness = {
  selected_count: number
  ok_count: number
  needs_review_count: number
  missing_count: number
  custom_count: number
  release_blocking: boolean
  items: Array<{
    item_id: string
    item_name: string
    variant: string
    type_name: string
    status: 'ok' | 'needs_review' | 'missing' | 'custom'
    authors: string[]
    licenses: string[]
    urls: string[]
  }>
}

export function buildLpcCatalogPickerOptions({ catalog, slotId, selections, bodyType, animation, query = '' }: PickerOptionsInput): LpcCatalogPickerOption[] {
  const selectedTags = selectedCatalogTags(catalog, selections)
  const normalizedQuery = query.trim().toLowerCase()
  return Object.values(catalog.items)
    .filter((item) => itemMatchesSlot(item, slotId))
    .filter((item) => itemMatchesQuery(item, normalizedQuery))
    .map((item) => {
      const warnings = compatibilityWarnings(item, selectedTags, bodyType, animation)
      const compatibilityState: LpcCatalogPickerOption['compatibility_state'] = warnings.some((warning) => warning.startsWith('Requires') || warning.startsWith('Cannot')) ? 'blocked' : warnings.length > 0 ? 'degraded' : 'ready'
      return {
        item_id: item.item_id,
        name: item.name,
        type_name: item.type_name,
        variants: item.variants,
        credit_count: item.credits.length,
        compatibility_state: compatibilityState,
        warnings,
      }
    })
    .sort((left, right) =>
      compatibilityScore(left.compatibility_state) - compatibilityScore(right.compatibility_state) ||
      left.name.localeCompare(right.name) ||
      left.item_id.localeCompare(right.item_id),
    )
}

export function buildLpcSelectionCreditReadiness(catalog: LpcCatalog, selections: Record<string, LpcRecipeSelection>): LpcSelectionCreditReadiness {
  const items = Object.values(selections)
    .filter((selection) => selection.enabled)
    .map((selection) => {
      const item = catalog.items[selection.item_id]
      if (!item) return null
      const authors = unique(item.credits.flatMap((credit) => credit.authors))
      const licenses = unique(item.credits.flatMap((credit) => credit.licenses))
      const urls = unique(item.credits.flatMap((credit) => credit.urls))
      const status: LpcSelectionCreditReadiness['items'][number]['status'] = item.credits.length === 0 || authors.length === 0 || licenses.length === 0
        ? 'missing'
        : item.credits.some((credit) => /review|verify|check/i.test(credit.notes))
          ? 'needs_review'
          : 'ok'
      return {
        item_id: item.item_id,
        item_name: item.name,
        variant: selection.variant,
        type_name: item.type_name,
        status,
        authors,
        licenses,
        urls,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const okCount = items.filter((item) => item.status === 'ok').length
  const needsReviewCount = items.filter((item) => item.status === 'needs_review').length
  const missingCount = items.filter((item) => item.status === 'missing').length
  return {
    selected_count: items.length,
    ok_count: okCount,
    needs_review_count: needsReviewCount,
    missing_count: missingCount,
    custom_count: 0,
    release_blocking: missingCount > 0 || needsReviewCount > 0,
    items,
  }
}

function itemMatchesSlot(item: LpcCatalogItem, slotId: string) {
  if (item.type_name === slotId) return true
  if (slotId === 'hair_hat_hood') return item.type_name === 'hair' || item.tags.includes('hair') || item.tags.includes('hat') || item.tags.includes('hood')
  if (slotId === 'cloak_back') return item.type_name === 'cape' || item.type_name === 'cape_trim' || item.tags.includes('cape')
  if (slotId === 'back_item') return item.tags.includes('back') || item.type_name.includes('back')
  return item.tags.includes(slotId)
}

function itemMatchesQuery(item: LpcCatalogItem, normalizedQuery: string) {
  if (!normalizedQuery) return true
  return [
    item.item_id,
    item.name,
    item.type_name,
    ...item.path,
    ...item.tags,
    ...item.required_tags,
    ...item.excluded_tags,
    ...item.credits.flatMap((credit) => [...credit.authors, ...credit.licenses, ...credit.urls, credit.notes]),
  ].join(' ').toLowerCase().includes(normalizedQuery)
}

function selectedCatalogTags(catalog: LpcCatalog, selections: Record<string, LpcRecipeSelection>) {
  const tags = new Set<string>()
  for (const selection of Object.values(selections)) {
    if (!selection.enabled) continue
    const item = catalog.items[selection.item_id]
    if (!item) continue
    tags.add(item.type_name)
    item.tags.forEach((tag) => tags.add(tag))
  }
  return tags
}

function compatibilityWarnings(item: LpcCatalogItem, selectedTags: ReadonlySet<string>, bodyType: string, animation: string) {
  const warnings: string[] = []
  for (const tag of item.required_tags) {
    if (!selectedTags.has(tag)) warnings.push(`Requires ${tag}.`)
  }
  for (const tag of item.excluded_tags) {
    if (selectedTags.has(tag)) warnings.push(`Cannot be combined with ${tag}.`)
  }
  if (item.required_body_types.length > 0 && !item.required_body_types.includes(bodyType)) {
    warnings.push(`Body type falls back from ${bodyType}.`)
  }
  if (item.animations.length > 0 && !item.animations.includes(animation) && !(animation === 'idle' && item.animations.includes('walk'))) {
    warnings.push(`Uses animation fallback for ${animation}.`)
  }
  if (item.layers.some((layer) => layer.custom_animation && lpcFrameGeometry[layer.custom_animation]?.oversize)) {
    warnings.push('Contains oversize layers that require an oversize export profile.')
  }
  return warnings
}

function compatibilityScore(state: LpcCatalogPickerOption['compatibility_state']) {
  if (state === 'ready') return 0
  if (state === 'degraded') return 1
  return 2
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort()
}
