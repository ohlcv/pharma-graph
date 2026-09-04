// src/parser/schema.ts
// Single source of truth for frontmatter *value-list* whitelists.
//
// What goes here: any value-list whitelist the parser or one of the two
// scripts checks against. NOT here: structural / cross-reference checks
// (those live in frontmatter.ts and in validate.ts's edge-id phase 2) and
// the edge-type vocabulary (that lives in core/edge-types.ts).

import { EDGE_TYPES } from '../core/edge-types.js';

/** Canonical essence values (decide node shape). */
export const VALID_ESSENCE: readonly string[] = [
  'module',          // 结构模块/入口 — round-rectangle
  'strict-class',    // 严格分类（细分类）— pentagon
  'umbrella-class',  // 伞形分类（粗分类）— hexagon
  'concept',         // 概念/术语 — rectangle（最接近正方形）
  'medication',      // 具体药物/制剂 — ellipse
  'drug',            // 重点药物 — ellipse（更醒目柔橙色）
  'illness',         // 疾病/病理状态 — diamond
  'notion',          // 学习性认知单元 — tag
  'mnemonic',        // 记忆口诀 — vee
  'summary',         // 总结/归纳 — octagon
] as const;

/**
 * Canonical edge-type vocabulary. Re-exported from edge-types.ts
 * (single source of truth, issue #9).
 */
export const VALID_EDGE_TYPES: readonly string[] = EDGE_TYPES;

/** True iff `value` is one of the canonical essence literals. */
export function isValidEssence(value: string | undefined): boolean {
  return value !== undefined && (VALID_ESSENCE as readonly string[]).includes(value);
}

/** True iff `value` is one of the canonical edge-type literals. */
export function isValidEdgeType(value: string | undefined): boolean {
  return value !== undefined && (VALID_EDGE_TYPES as readonly string[]).includes(value);
}
