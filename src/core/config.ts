// src/core/config.ts
// 全局配置：节点类型→形状映射、关系类型→颜色/线型映射、默认布局名称

export const NODE_TYPE_SHAPE: Record<string, string> = {
  concept: "ellipse",
  drug: "round-rectangle",
  mechanism: "diamond",
  disease: "round-rectangle",
  ingredient: "barrel",
  default: "ellipse",
};

export const EDGE_TYPE_STYLE: Record<string, { color: string; lineStyle: string; arrow: string }> = {
  isa:       { color: "#4a90e2", lineStyle: "solid",   arrow: "triangle" },
  part_of:   { color: "#50c878", lineStyle: "solid",   arrow: "triangle" },
  mechanism: { color: "#e27c3e", lineStyle: "solid",   arrow: "triangle" },
  causes:    { color: "#c0392b", lineStyle: "solid",   arrow: "triangle" },
  treats:    { color: "#27ae60", lineStyle: "solid",   arrow: "triangle" },
  has:       { color: "#95a5a6", lineStyle: "solid",   arrow: "none" },
  relates:   { color: "#95a5a6", lineStyle: "dashed",  arrow: "none" },
  default:   { color: "#bdc3c7", lineStyle: "solid",   arrow: "none" },
};

export const DEFAULT_LAYOUT = "cose";
