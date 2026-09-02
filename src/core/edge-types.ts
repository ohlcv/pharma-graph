// src/core/edge-types.ts
// Single source of truth for the edge-type vocabulary.
// 6 种边类型，对应纸质思维导图的 6 种关系家族。
// 具体药学语义（治疗/导致/抑制...）放进 reason，不再各占一个 type。

/**
 * The canonical edge-type vocabulary. Order is meaningful for the
 * legend grid and the mobile chip list.
 */
export const EDGE_TYPES = [
  // 结构关系
  'parent',     // 层级归属：子→父，纸质思维导图的树结构
  'branch',     // 分支展开：纸图中的分支结构
  // 知识关系
  'link',       // 明确关系：由 reason 承载具体药学语义（治疗/导致/抑制...）
  'relate',     // 一般关联：弱联系，兜底
  // 辅助关系
  'support',    // 学习辅助：主知识→口诀/总结/表格/注意
  'contrast',   // 对比区分：横向比较
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

/**
 * The fallback edge type applied when a parsed edges_out entry omits
 * `type` or supplies an empty value.
 */
export const DEFAULT_EDGE_TYPE: EdgeType = 'link';

/**
 * Type guard for incoming edge-type strings (e.g. from YAML).
 */
export function isEdgeType(value: unknown): value is EdgeType {
  return typeof value === 'string' && (EDGE_TYPES as readonly string[]).includes(value);
}
