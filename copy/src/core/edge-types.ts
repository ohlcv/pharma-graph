// src/core/edge-types.ts
// Single source of truth for the edge-type vocabulary.
// 5 种 OWL/RDF 风格边类型，对应知识图谱的 5 种关系家族。
// 具体药学语义（治疗/导致/抑制...）放进 reason，不再各占一个 type。

/**
 * The canonical edge-type vocabulary. Order is meaningful for the
 * legend grid and the mobile chip list.
 */
export const EDGE_TYPES = [
  // 类-类 / 个体-类 / 局部-整体
  'subclass_of',  // 是一种（类-类）：子类→父类
  'part_of',      // 是一部分（局部-整体）：局部→整体
  'instance_of',  // 是实例（个体-类）：实例→类别
  // 对称关系
  'disjoint_with', // 互斥（对称）：A↔B
  'equivalent_to', // 等价（对称）：A↔B
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

/**
 * The fallback edge type applied when a parsed edges_out entry omits
 * `type` or supplies an empty value.
 */
export const DEFAULT_EDGE_TYPE: EdgeType = 'instance_of';

/**
 * Type guard for incoming edge-type strings (e.g. from YAML).
 */
export function isEdgeType(value: unknown): value is EdgeType {
  return typeof value === 'string' && (EDGE_TYPES as readonly string[]).includes(value);
}
