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
 * 层级边：source = 子，target = 父。深度 BFS / 叶子判定 / 子树归属 / 漫游
 * 体系边界只沿这些边走。对称边（disjoint_with / equivalent_to）没有父子语义，
 * 沿着它们走会把无关分支带进层级计算（ARD-004 附录 A 的体系隔离问题）。
 *
 * 单一事实来源：build-graph.ts / build-content.ts / tour.ts / tour-controller.ts
 * 都应从这里 import，而不是各自维护一份 Set。
 */
export const HIERARCHY_EDGE_TYPES: ReadonlySet<string> = new Set([
  'subclass_of',
  'part_of',
  'instance_of',
]);

/**
 * Type guard for incoming edge-type strings (e.g. from YAML).
 */
export function isEdgeType(value: unknown): value is EdgeType {
  return typeof value === 'string' && (EDGE_TYPES as readonly string[]).includes(value);
}
