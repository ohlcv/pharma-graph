// src/parser/schema.ts
// Single source of truth for frontmatter *value-list* whitelists.
//
// Issue #20: before this module, validate.ts and audit-frontmatter.ts each
// carried their own hand-maintained copies of VALID_ESSENCE / VALID_FIELD
// / VALID_TIER. The two lists had silently drifted (audit had 'part',
// validate had 'bridge' and 'section'; validate listed 'life_sciences' and
// 'biopharmaceutical', audit did not). With this module both callers
// import the same readonly tuples and the difference becomes a one-line
// diff when somebody legitimately wants to drop a legacy value.
//
// What goes here: any value-list whitelist the parser or one of the two
// scripts checks against. NOT here: structural / cross-reference checks
// (those live in frontmatter.ts and in validate.ts's edge-id phase 2) and
// the edge-type vocabulary (that lives in core/edge-types.ts, see
// issue #9 / 2026-07).
//
// Note: frontmatter.ts itself accepts any string for these fields; the
// lists below are warning-level checks ("value not in canonical list")
// not parse errors. Some historical values (e.g. 'part', 'bridge',
// 'life_sciences', 'biopharmaceutical') are no longer created by any
// current content but are still loaded here so older content keeps
// validating without spurious warnings. Drop them only after auditing
// the corpus.

import { EDGE_TYPES } from '../core/edge-types.js';

/** Canonical essence values (decide node shape). */
export const VALID_ESSENCE: readonly string[] = [
  'concept',
  'medication',
  'illness',
  'route',
  'substance',
  'process',
  'module',
  'section',
  'part',
  'concept',
  'drug',
  'disease',
  'ingredient',
  'mechanism',
  'bridge',
  'service',
  'pathogen',
  'pathway',
  'indicator',
  'book',
  'chapter',
] as const;

/** Canonical field / discipline values (decide node border colour). */
export const VALID_FIELD: readonly string[] = [
  'pharmaceutics',
  'pharmacokinetics',
  'medicinal_chemistry',
  'pharmacology',
  'toxicology',
  'biopharmaceutics',
  'clinical_pharmacy',
  'pharmacy_service',
  'cardiovascular',
  'respiratory',
  'digestive',
  'endocrine',
  'musculoskeletal',
  'anti_infective',
  'anti_tumor',
  'blood',
  'immunology',
  'dermatology',
  'antipyretic',
  'anti_rheumatic',
  'anti_gout',
  'nutrition',
  'diagnostic',
  'life_sciences',
  'biopharmaceutical',
  '药学专业知识二',
  'pharmacy_practice',
] as const;

/** Canonical tier / layer values (decide node emphasis). */
export const VALID_TIER: readonly string[] = [
  'basic',
  'drug',
  'disease',
  'management',
  'service',
  'legal',
  'foundation',
  'system',
  'clinical',
] as const;

/**
 * Canonical edge-type vocabulary. Re-exported under the same name both
 * scripts used locally so the diff stays at the import line. Source of
 * truth lives in core/edge-types.ts (issue #9).
 */
export const VALID_EDGE_TYPES: readonly string[] = EDGE_TYPES;

/** True iff `value` is one of the canonical essence literals. */
export function isValidEssence(value: string | undefined): boolean {
  return value !== undefined && (VALID_ESSENCE as readonly string[]).includes(value);
}

/** True iff `value` is one of the canonical field literals. */
export function isValidField(value: string | undefined): boolean {
  return value !== undefined && (VALID_FIELD as readonly string[]).includes(value);
}

/** True iff `value` is one of the canonical tier literals. */
export function isValidTier(value: string | undefined): boolean {
  return value !== undefined && (VALID_TIER as readonly string[]).includes(value);
}

/** True iff `value` is one of the canonical edge-type literals. */
export function isValidEdgeType(value: string | undefined): boolean {
  return value !== undefined && (VALID_EDGE_TYPES as readonly string[]).includes(value);
}
