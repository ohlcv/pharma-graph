// src/parser/schema.ts
// Single source of truth for frontmatter *value-list* whitelists.
//
// What goes here: any value-list whitelist the parser or one of the two
// scripts checks against. NOT here: structural / cross-reference checks
// (those live in frontmatter.ts and in validate.ts's edge-id phase 2) and
// the edge-type vocabulary (that lives in core/edge-types.ts).

import { EDGE_TYPES } from '../core/edge-types.js';

/**
 * Canonical fill values (decide node visual class — colour + shape in CSS).
 * Replaces the deprecated `essence` field (removed in commit 4e64d6b).
 */
export const VALID_FILL: readonly string[] = [
  'cls-structure',      // 结构入口 — 书本/章节根节点
  'cls-classification', // 分类节点 — umbrella / strict class
  'cls-concept',        // 概念/术语
  'cls-drug',           // 药物节点
  'cls-adverse',        // ADR / 禁忌 / 相互作用
  'cls-mnemonic',       // 记忆口诀
  'cls-summary',        // 总结归纳
  'cls-table',          // 表格对比
] as const;

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
