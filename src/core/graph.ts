// src/core/graph.ts
// 图谱数据类型定义，对应 Cytoscape.js 的 data 字段

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
  essence?: string;  // 节点本质：module/strict-class/umbrella-class/concept/medication/illness/notion/mnemonic/summary/table/note
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
