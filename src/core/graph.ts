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
  type: string;
  category: string;
  essence?: string;  // 节点本质：药/疾病/概念/机制/口诀...
  field?: string;   // 学科归属：pharmaceutics/pharmacology/medicinal_chemistry
  tier?: string;    // 知识层次：basic/drug/disease/management/service/legal
  level?: number;   // 思维导图结构级别 1-6（决定边框色）
  layer?: string;   // knowledge layer: foundation / system / clinical / service (legacy)
  summary?: string;   // full summary text
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
  type: string;   // 关系类型：isa / has / mechanism / causes / treats / has / relates
  reason?: string; // 建边原因说明
}

export interface GraphData {
  nodes: NodeData[];
  edges: EdgeData[];
}
