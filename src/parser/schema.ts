// src/parser/schema.ts
// Single source of truth for frontmatter *value-list* whitelists.
//
// What goes here: any value-list whitelist the parser or one of the two
// scripts checks against. NOT here: structural / cross-reference checks
// (those live in frontmatter.ts and in validate.ts's edge-id phase 2) and
// the edge-type vocabulary (that lives in core/edge-types.ts).

import { EDGE_TYPES } from '../core/edge-types.js';
import { FILL_CONFIG } from '../core/config.js';

/**
 * Canonical fill values — derived from FILL_CONFIG (the visual single source of
 * truth) so the validator can never drift from what the renderer knows.
 * (The hand-written list used to miss cls-disease / cls-biomolecule / cls-feature
 * and contain a cls-table that FILL_CONFIG doesn't define.)
 */
export const VALID_FILL: readonly string[] = Object.keys(FILL_CONFIG);

/**
 * Canonical edge-type vocabulary. Re-exported from edge-types.ts
 * (single source of truth, issue #9).
 */
export const VALID_EDGE_TYPES: readonly string[] = EDGE_TYPES;

/** True iff `value` is one of the canonical fill literals. */
export function isValidFill(value: string | undefined): boolean {
  return value !== undefined && (VALID_FILL as readonly string[]).includes(value);
}

/** True iff `value` is one of the canonical edge-type literals. */
export function isValidEdgeType(value: string | undefined): boolean {
  return value !== undefined && (VALID_EDGE_TYPES as readonly string[]).includes(value);
}
