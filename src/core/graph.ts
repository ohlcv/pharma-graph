// src/core/graph.ts
// 图谱数据类型定义，对应 Cytoscape.js 的 data 字段

export interface NodeData {
  weight: number;
  id: string;
  label: string;
  type: string;
  category: string;
  layer?: string;  // knowledge layer: foundation / system / clinical / service
  summary?: string;
  location: string; // 相对 content/ 的路径，如 "药学专业知识一/药剂学/第七章/口服固体制剂/缓释剂.md"
}

export interface EdgeData {
  id: string;
  source: string; // 源节点 id（相对于 content/ 的路径去掉 .md）
  target: string; // 目标节点 id
  type: string;   // 关系类型，如 "isa"、"mechanism"、"has"
  reason?: string; // 建边原因说明
}

export interface GraphData {
  nodes: NodeData[];
  edges: EdgeData[];
}
