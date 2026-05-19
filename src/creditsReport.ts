import type { CharacterManifest, ExtractedPart, KitbashRecipe } from './types.ts'
import type { LpcCatalog } from './lpcCatalog.ts'

type LpcCatalogCreditStatus = 'ok' | 'needs_review' | 'missing'

export function buildCreditsReport(
  character: CharacterManifest,
  recipe: KitbashRecipe | null,
  partLibrary: ExtractedPart[],
  lpcCatalog?: LpcCatalog | null,
) {
  const selectedParts = recipe
    ? recipe.layers
        .map((layer) => partLibrary.find((part) => part.part_id === layer.source_part_id))
        .filter((part): part is ExtractedPart => Boolean(part))
    : []
  const selectedLpcCatalogItems = buildSelectedLpcCatalogCredits(recipe, lpcCatalog)
  const lpcParts = selectedParts.filter((part) => part.tags.includes('lpc'))
  const apesParts = selectedParts.filter((part) => part.extraction_method === 'apes')
  const unreviewedParts = selectedParts.filter((part) => !part.reviewed)
  const creditWarnings = selectedParts.flatMap((part) =>
    part.warnings.filter((warning) => /credit|license|attribution/i.test(warning)),
  )
  const missingLpcCatalogCreditCount = selectedLpcCatalogItems.filter((item) => item.status === 'missing').length
  const reviewLpcCatalogCreditCount = selectedLpcCatalogItems.filter((item) => item.status === 'needs_review').length

  return {
    format: 'pixel_creator_credits_report',
    version: 1,
    generated_at: new Date().toISOString(),
    character_id: recipe?.character_id ?? character.character_id,
    source_character: character.character_id,
    summary: {
      selected_part_count: selectedParts.length,
      selected_lpc_catalog_item_count: selectedLpcCatalogItems.length,
      lpc_part_count: lpcParts.length,
      apes_part_count: apesParts.length,
      unreviewed_part_count: unreviewedParts.length,
      missing_lpc_catalog_credit_count: missingLpcCatalogCreditCount,
      review_lpc_catalog_credit_count: reviewLpcCatalogCreditCount,
      credit_warning_count: creditWarnings.length,
      release_blocking: unreviewedParts.length > 0 || creditWarnings.length > 0 || missingLpcCatalogCreditCount > 0 || reviewLpcCatalogCreditCount > 0,
    },
    release_notes: [
      'Review every selected part before public release.',
      'LPC-derived parts require final attribution/license verification against the source inventory before distribution.',
      'APES-derived masks require visual QA; low-confidence or failed outputs should not ship as final content.',
    ],
    selected_lpc_catalog_items: selectedLpcCatalogItems,
    selected_parts: selectedParts.map((part) => ({
      part_id: part.part_id,
      label: part.label,
      source_character: part.character_id,
      extraction_method: part.extraction_method,
      reviewed: part.reviewed,
      source_animation: part.source_animation,
      source_direction: part.source_direction,
      source_frame_path: part.source_frame_path,
      image_path: part.image_path,
      mask_path: part.mask_path,
      lpc_source_tags: part.tags.filter((tag) => tag.startsWith('lpc_source_')),
      credit_tags: part.tags.filter((tag) => tag.startsWith('credit_files_')),
      tags: part.tags,
      credit_warnings: part.warnings.filter((warning) => /credit|license|attribution/i.test(warning)),
      warnings: part.warnings,
    })),
    unreviewed_part_ids: unreviewedParts.map((part) => part.part_id),
    credit_warnings: creditWarnings,
  }
}

function buildSelectedLpcCatalogCredits(recipe: KitbashRecipe | null, lpcCatalog?: LpcCatalog | null) {
  if (!recipe?.lpc_selections || !lpcCatalog) return []
  return Object.values(recipe.lpc_selections)
    .filter((selection) => selection.enabled)
    .map((selection) => {
      const item = lpcCatalog.items[selection.item_id]
      const credits = item?.credits ?? []
      const authors = unique(credits.flatMap((credit) => credit.authors))
      const licenses = unique(credits.flatMap((credit) => credit.licenses))
      const urls = unique(credits.flatMap((credit) => credit.urls))
      const notes = unique(credits.map((credit) => credit.notes).filter(Boolean))
      const attributionOptional = licenses.some((license) => /CC0|public domain/i.test(license))
      const status: LpcCatalogCreditStatus = credits.length === 0 || licenses.length === 0 || (!attributionOptional && authors.length === 0)
        ? 'missing'
        : credits.some((credit) => /review|verify|check/i.test(credit.notes))
          ? 'needs_review'
          : 'ok'
      return {
        slot_id: selection.slot_id,
        item_id: selection.item_id,
        item_name: item?.name ?? selection.item_id,
        variant: selection.variant,
        type_name: selection.type_name,
        status,
        authors,
        licenses,
        urls,
        notes,
        source_files: unique(credits.map((credit) => credit.file).filter(Boolean)),
        upstream_repo: lpcCatalog.source.repo,
        upstream_commit: lpcCatalog.source.commit,
      }
    })
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}
