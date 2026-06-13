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
  essence?: string;  // 节点本质：药/疾病/概念/机制...
  field?: string;   // 学科归属：pharmaceutics/pharmacology/medicinal_chemistry
  tier?: string;    // 知识层次：basic/drug/disease/management/service/legal
  layer?: string;   // knowledge layer: foundation / system / clinical / service
  summary?: string;   // full summary text
  location?: NodeLocation;
  tags?: string[];
  body?: string;      // 正文内容（md 文件中 frontmatter 后的部分）
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
