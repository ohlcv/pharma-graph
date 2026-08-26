// src/core/edge-types.ts
// Single source of truth for the edge-type vocabulary used across the
// application. Issue #9: previously this list was declared in three
// places (validate.ts, config.ts EDGE_TYPE_STYLE, config.ts
// EDGE_TYPE_LABEL) and silently kept in sync by hand. Any new edge
// type added to one map would briefly desynchronize the validator
// whitelist from the visible legend and the renderer style entries.
//
// This module exposes a single `EDGE_TYPES` readonly tuple. Everything
// else (the validator whitelist, the legend grid, the style sheet) is
// derived from it. Adding a new edge type is now a one-file change.

/**
 * The canonical edge-type vocabulary. Order is meaningful for the
 * legend grid and the mobile chip list — keep groups together the
 * way `EDGE_TYPE_STYLE` / `EDGE_TYPE_LABEL` group them in config.ts.
 */
export const EDGE_TYPES = [
  // 结构与组成
  'has', 'isa',
  // 药理机制
  'activates', 'inhibits', 'mechanism', 'metabolizes',
  // 临床关联
  'treats', 'causes', 'interacts', 'contraindicates',
  // 学习路径
  'prerequisite', 'relates', 'sibling',
  // 结构语义（知识组织）
  'contains',   // 模块/分类节点包含成员药物
  'part_of',    // 药物/概念属于某个分类
  'specializes', // 药物/概念专用于某临床场景
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

/**
 * The fallback edge type applied when a parsed edges_out entry omits
 * `type` or supplies an empty value. Kept here next to the canonical
 * list so the validator (which warns about unknown types) and the
 * parser (which silently applies a default) cannot drift apart.
 */
export const DEFAULT_EDGE_TYPE: EdgeType = 'relates';

/**
 * Type guard for incoming edge-type strings (e.g. from YAML).
 * Returns true only for canonically known types.
 */
export function isEdgeType(value: unknown): value is EdgeType {
  return typeof value === 'string' && (EDGE_TYPES as readonly string[]).includes(value);
}
