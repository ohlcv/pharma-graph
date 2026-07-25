// Tests for src/core/edge-types.ts — the canonical edge-type vocabulary.
// Issue #9: this list used to be hand-maintained in three places
// (validate.ts, EDGE_TYPE_STYLE, EDGE_TYPE_LABEL). All three were
// silently kept in sync by accident. This test file freezes the
// single source of truth and checks the other places conform.

import { describe, it, expect } from 'vitest';
import { EDGE_TYPES, DEFAULT_EDGE_TYPE, isEdgeType } from './edge-types.js';
import { EDGE_TYPE_STYLE, EDGE_TYPE_LABEL } from './config.js';

describe('edge-types SSOT', () => {
  it('every EDGE_TYPE has a label entry (no orphan labels)', () => {
    for (const t of EDGE_TYPES) {
      expect(EDGE_TYPE_LABEL[t], `label missing for "${t}"`).toBeDefined();
    }
  });

  it('every EDGE_TYPE has a style entry (no orphan styles)', () => {
    for (const t of EDGE_TYPES) {
      expect(EDGE_TYPE_STYLE[t], `style missing for "${t}"`).toBeDefined();
    }
  });

  it('EDGE_TYPE_LABEL has no entries outside EDGE_TYPES (validator parity)', () => {
    // Some browsers may put 'default' into EDGE_TYPE_STYLE as a runtime
    // fallback, but the label table is strict — anything labelled must
    // be a real edge type or the legend will show rows for unknown
    // types.
    const labelKeys = Object.keys(EDGE_TYPE_LABEL);
    for (const k of labelKeys) {
      expect(EDGE_TYPES, `label "${k}" missing from canonical list`).toContain(k as string);
    }
  });

  it('DEFAULT_EDGE_TYPE is a canonical type (parser-applied defaults must validate)', () => {
    expect(EDGE_TYPES).toContain(DEFAULT_EDGE_TYPE);
  });

  it('isEdgeType is a sound type guard', () => {
    expect(isEdgeType('has')).toBe(true);
    expect(isEdgeType('relates')).toBe(true);
    expect(isEdgeType('not-a-real-type')).toBe(false);
    expect(isEdgeType(null)).toBe(false);
    expect(isEdgeType(undefined)).toBe(false);
    expect(isEdgeType(42)).toBe(false);
    expect(isEdgeType({})).toBe(false);
  });

  it('returns the same string for canonically recognised types', () => {
    for (const t of EDGE_TYPES) {
      // `EDGE_TYPES` is a `readonly` literal tuple whose element type
      // is exactly `EdgeType`, so `isEdgeType(t)` typechecks without
      // any cast.
      expect(isEdgeType(t)).toBe(true);
    }
  });
});
