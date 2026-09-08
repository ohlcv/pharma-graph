// src/core/graph.ts
// 图谱数据类型定义，对应 Cytoscape.js 的 data 字段
//
// 视觉语义分离设计（基于 OWL2）：
//   fill（领域顶层类）  → 形状 + 背景色
//   stroke（边框样式）  → 边框色 + 效果（auto/flow/glow）
//   subtreeRoot        → 自动计算的分类归属色（fallback）
//
// 兼容旧字段：essence → fill（前端自动映射）

// ── 类型定义 ────────────────────────────────────────────────────────────────

/** 边框样式枚举（stroke 取值） */
export type StrokeType = 'auto' | 'flow' | 'glow';

/** OWL2 实体类型枚举（shape 取值）
 *  每个类型对应一个固定的 Cytoscape 几何形状（见 SHAPE_BY_OWL2）
 *  如需使用 FILL_CONFIG 中的扩展形状（vee/tag/barrel 等），不填 shape 即可 */
export type ShapeType =
  | 'auto'
  | 'class'
  | 'named_individual'
  | 'object_property'
  | 'data_property'
  | 'annotation_property';

// ── 旧字段兼容 ────────────────────────────────────────────────────────────

/** @deprecated 使用 fill 代替，保留向后兼容 */
export type EssenceType = string;

export interface NodeLocation {
  book?: string;
  part?: string;
  chapter?: string;
  section?: string;
  subsection?: string;
  item?: string;
}

export interface NodeData {
  weight: number;
  id: string;
  label: string;
  
  // ── 语义层（基于 OWL2）───────────────────────────────────────────────
  /** 领域顶层类 IRI（如 cls-drug, cls-classification, cls-adverse 等）*/
  fill?: string;
  
  /** 边框样式：auto（默认）| flow（彩色流光）| glow（多层光晕）。
   *  显式填写时覆盖 fill 的默认边框（边框色由 subtreeRoot 决定）*/
  stroke?: StrokeType;

  /** OWL2 实体类型（显式填写时覆盖 fill 的默认几何形状）。
   *  留空时使用 fill 的默认形状（可访问 FILL_CONFIG 中的扩展形状如 vee/tag/barrel 等）*/
  shape?: ShapeType;
  
  // ── 兼容旧字段（向后兼容）────────────────────────────────────────────
  /** @deprecated 使用 fill 代替 */
  essence?: string;
  
  /** @deprecated 使用 stroke 代替 */
  flowBorder?: boolean;
  
  depth?: number;   // 思维导图深度级别（从中心节点往下第 N 层，0=中心节点）
  /** 节点所属的分类子树根 ID。若为空则该节点不属于任何 subtree（使用 depth 色）。 */
  subtreeRoot?: string;
  /** 简短摘要 */
  shortSummary?: string;
  /** 完整摘要 */
  fullSummary?: string;
  summary?: string; // 摘要（shortSummary 优先，否则 fullSummary）
  location?: NodeLocation;
  tags?: string[];
  body?: string;      // 正文内容（md 文件中 frontmatter 后的部分）
  /** Manifest-style path to the source file (e.g. `药学专业知识二/第一章 .../COMT抑制剂.md`).
    *  Used by the detail panel to resolve relative image references against
    *  `/content/<dir>/`. Empty string when the source is unknown (CLI tools). */
  sourcePath?: string;
  /** Raw outgoing edges as declared in the source frontmatter, e.g.
    *  `[{ id, type, target, reason }]`. Preserved so traversal code (tour
    *  builder, debug panels) can reason about parent/child semantics
    *  without having to reverse-walk cytoscape's edge store. */
  edges_out?: Array<{ id?: string; type: string; target: string; reason?: string }>;
}

export interface EdgeData {
  id: string;
  source: string; // 源节点 id
  target: string; // 目标节点 id
  type: string;   // 关系类型：subclass_of / part_of / instance_of / disjoint_with / equivalent_to
  reason?: string; // 建边原因说明
}

export interface GraphData {
  nodes: NodeData[];
  edges: EdgeData[];
}
