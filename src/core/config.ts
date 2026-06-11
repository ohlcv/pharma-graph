// src/core/config.ts
// 全局配置：节点类型→形状/颜色映射、关系类型→颜色/线型映射、布局配置
// 这是视觉配置的单一来源（Single Source of Truth）

import cytoscape from 'cytoscape';

// ── Node type → visual style ────────────────────────────────────────────────

export const NODE_TYPE_SHAPE: Record<string, string> = {
  concept:    'ellipse',
  drug:       'round-rectangle',
  disease:    'diamond',
  ingredient: 'barrel',
  bridge:     'round-rectangle',
  service:    'barrel',
  mechanism:  'diamond',
  pathogen:   'diamond',
  pathway:    'rectangle',
  indicator:  'ellipse',
  default:    'ellipse',
};

export const NODE_TYPE_COLOR: Record<string, string> = {
  concept:    '#818cf8',
  drug:       '#67e8f9',
  disease:    '#fca5a5',
  ingredient: '#c4b5fd',
  bridge:     '#9c27b0',
  service:    '#c4b5fd',
  mechanism:  '#f87171',
  pathogen:   '#dc2626',
  pathway:    '#16a34a',
  indicator:  '#475569',
  default:    '#94a3b8',
};

// Category → border color (used as overlay on top of type fill)
// 17 种系统归属，用于边框着色 — 同一颜色 = 同一系统领域
export const CATEGORY_COLOR: Record<string, string> = {
  // 系统归属（药学专业知识对应）
  cardiovascular:      '#ef4444',  // 红 — 心血管系统
  respiratory:         '#3b82f6',  // 蓝 — 呼吸系统
  digestive:           '#22c55e',  // 绿 — 消化系统
  endocrine:          '#f97316',  // 橙 — 内分泌系统
  musculoskeletal:     '#06b6d4',  // 青 — 肌肉骨骼系统
  anti_infective:      '#a855f7',  // 紫 — 抗感染（抗菌/抗病毒/抗真菌）
  anti_tumor:          '#ec4899',  // 粉 — 抗肿瘤
  blood:               '#f43f5e',  // 玫瑰红 — 血液系统
  immunology:          '#eab308',  // 金 — 免疫与抗过敏
  dermatology:         '#a16207',  // 棕 — 皮肤疾病
  antipyretic:         '#7dd3fc',  // 浅蓝 — 解热镇痛抗炎
  anti_rheumatic:      '#ea580c',  // 深橙 — 抗风湿
  anti_gout:           '#9333ea',  // 紫红 — 抗痛风
  nutrition:           '#6b7280',  // 灰绿 — 营养与维生素
  diagnostic:          '#9ca3af',  // 灰 — 诊断与检验
  pharmacy_practice:   '#94a3b8',  // 灰蓝 — 药学综合知识与技能
  pharmacy_service:   '#94a3b8',  // 灰蓝 — 药学服务（与 pharmacy_practice 同色）
  // 向后兼容旧值
  '第一篇 药剂学':    '#fb923c',
  '第二篇 药理与毒理学': '#a78bfa',
  '第三篇 药物化学':    '#34d399',
  '第四篇 药动学':      '#fbbf24',
  '第五篇 生命药学':    '#60a5fa',
  '药剂学':            '#fb923c',
  '药理学':            '#a78bfa',
  '心血管药物':        '#f87171',
};

// 深色变体 — 用于节点径向渐变的内层，模拟立体感
export const NODE_TYPE_COLOR_DARK: Record<string, string> = {
  concept:    '#4f46e5',
  drug:       '#0891b2',
  disease:    '#dc2626',
  ingredient: '#7c3aed',
  bridge:     '#6a1080',
  service:    '#7c3aed',
  mechanism:  '#dc2626',
  pathogen:   '#7f1d1d',
  pathway:    '#14532d',
  indicator:  '#1e293b',
  default:    '#475569',
};

export const NODE_TYPE_LABEL: Record<string, string> = {
  concept:    '概念',
  drug:       '药物',
  disease:    '疾病',
  ingredient: '成分',
  bridge:     '靶点',
  service:    '服务',
  mechanism:  '机制',
  pathogen:   '病原体',
  pathway:    '通路',
  indicator:  '指标',
  default:    '默认',
};

export const SHAPE_LABEL: Record<string, string> = {
  ellipse:         '椭圆',
  'round-rectangle': '圆角矩形',
  rectangle:       '矩形',
  diamond:         '菱形',
  barrel:          '六边形',
};

// ── Knowledge layer → border style (thickness + background tint) ─────────────

// layer 决定节点视觉层次（边框粗细 + 背景色）
// foundation（基础层：生理/病理/药理基础）→ 细边框 + 浅灰底
// system  （药物系统层：具体药物/制剂/成分）→ 中边框 + 无底色
// clinical（临床层：疾病/治疗方案）      → 粗边框 + 无底色
// service（服务层：用药管理/合理用药）  → 细边框 + 浅青底
export const NODE_LAYER_STYLE: Record<string, { borderWidth: number; bgColor: string; borderColor: string }> = {
  foundation: { borderWidth: 1,   bgColor: '#f8fafc', borderColor: '#94a3b8' },
  system:     { borderWidth: 2,   bgColor: 'transparent', borderColor: '#475569' },
  clinical:   { borderWidth: 3,   bgColor: 'transparent', borderColor: '#1e293b' },
  service:    { borderWidth: 1,   bgColor: '#f0fdfa', borderColor: '#14b8a6' },
};

// ── Edge type → visual style ────────────────────────────────────────────────

export const EDGE_TYPE_STYLE: Record<string, { color: string; lineStyle: string; arrow: string }> = {
  isa:       { color: '#4a90e2', lineStyle: 'solid',  arrow: 'triangle' },
  part_of:   { color: '#50c878', lineStyle: 'solid',  arrow: 'triangle' },
  mechanism: { color: '#e27c3e', lineStyle: 'solid',  arrow: 'triangle' },
  causes:    { color: '#c0392b', lineStyle: 'solid',  arrow: 'triangle' },
  treats:    { color: '#27ae60', lineStyle: 'solid',  arrow: 'triangle' },
  has:       { color: '#95a5a6', lineStyle: 'solid',  arrow: 'none' },
  relates:   { color: '#95a5a6', lineStyle: 'dashed', arrow: 'none' },
  default:   { color: '#bdc3c7', lineStyle: 'solid',  arrow: 'none' },
};

// ── Layout configs ───────────────────────────────────────────────────────────

export interface LayoutParam {
  key: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  default: number | string;
  type?: 'select' | 'bool';
  options?: string[];
}

export interface LayoutConfig {
  name: string;
  description: string;
  params: LayoutParam[];
  cytoscape: Record<string, unknown>;
}

export const LAYOUTS: Record<string, LayoutConfig> = {
  cose: {
    name: 'cose-bilkent',
    description: 'COSE — 力学弹簧布局，模拟物理排斥与吸引，自动产生紧凑聚类结构。',
    params: [
      { key: 'nodeRepulsion',      label: '节点斥力',   min: 1000, max: 50000, step: 100,  default: 30000 },
      { key: 'idealEdgeLength',   label: '理想边长',   min: 20,   max: 500,   step: 5,    default: 350 },
      { key: 'edgeElasticity',    label: '边弹性',     min: 1,    max: 500,   step: 1,    default: 60 },
      { key: 'gravity',            label: '重力',        min: 0,    max: 1,     step: 0.01, default: 0.01 },
      { key: 'tile',              label: '平铺',        type: 'bool',           default: 1 },
      { key: 'animationDuration', label: '动画时长',   min: 100,  max: 3000,  step: 50,   default: 1200 },
      { key: 'spacingFactor',     label: '间距倍增',   min: 0.1,  max: 5,     step: 0.05, default: 1.8 },
    ],
    cytoscape: {
      name: 'cose-bilkent',
      animate: true,
      animationDuration: 1200,
      animationEasing: 'ease-out-cubic',
      randomize: true,
      nodeRepulsion: 30000,
      idealEdgeLength: 350,
      edgeElasticity: 60,
      gravity: 0.01,
      numIter: 2500,
      tile: true,
      tilingPaddingVertical: 25,
      tilingPaddingHorizontal: 25,
      fit: true,
      padding: 100,
      nodeDimensionsIncludeLabels: true,
      minNodeSpacing: 120,
      avoidOverlap: true,
      spacingFactor: 1.8,
      refreshInterval: 50,
      rStep: 0.1,
      quality: 'default',
    },
  },
  concentric: {
    name: 'concentric',
    description: '同心圆 — 节点按权重从中心向外分层排列，适合展示层次重要性。',
    params: [
      { key: 'minNodeSpacing',    label: '节点间距',   min: 10,   max: 200,   step: 5,    default: 50 },
      { key: 'animationDuration', label: '动画时长',   min: 100,  max: 3000,  step: 50,   default: 800 },
    ],
    cytoscape: {
      name: 'concentric',
      concentric: (n: cytoscape.NodeSingular) => n.data('weight') || 0,
      levelWidth: () => 1,
      minNodeSpacing: 50,
      padding: 50,
      animate: true,
      animationDuration: 800,
      animationEasing: 'ease-out-cubic',
      fit: true,
      avoidOverlap: true,
    },
  },
  circle: {
    name: 'circle',
    description: '环形 — 所有节点沿圆周均匀分布，适合展示循环关系。',
    params: [
      { key: 'radius',            label: '圆半径',     min: 50,   max: 600,   step: 10,   default: 200 },
      { key: 'animationDuration', label: '动画时长',   min: 100,  max: 3000,  step: 50,   default: 700 },
    ],
    cytoscape: {
      name: 'circle',
      radius: 200,
      padding: 50,
      animate: true,
      animationDuration: 700,
      fit: true,
      clockwise: true,
    },
  },
  grid: {
    name: 'grid',
    description: '网格 — 节点按行列整齐排列，适合结构化展示。',
    params: [
      { key: 'padding',           label: '间距',        min: 5,    max: 150,   step: 5,    default: 50 },
      { key: 'animationDuration', label: '动画时长',   min: 100,  max: 3000,  step: 50,   default: 600 },
    ],
    cytoscape: {
      name: 'grid',
      condense: false,
      rows: undefined,
      cols: undefined,
      padding: 50,
      animate: true,
      animationDuration: 600,
      fit: true,
    },
  },
  dagre: {
    name: 'dagre',
    description: 'Dagre — 有向无环图布局，适合 DAG 结构的层次展示。',
    params: [
      { key: 'rankDir',           label: '方向',        type: 'select', options: ['TB', 'BT', 'LR', 'RL'], default: 'TB' },
      { key: 'rankSep',           label: '层间距',      min: 20,   max: 300,   step: 5,    default: 100 },
      { key: 'nodeSep',           label: '节点间距',    min: 5,    max: 150,   step: 5,    default: 50 },
      { key: 'edgeSep',           label: '边间距',      min: 5,    max: 100,   step: 5,    default: 50 },
      { key: 'animationDuration', label: '动画时长',  min: 100,  max: 3000,  step: 50,   default: 800 },
    ],
    cytoscape: {
      name: 'dagre',
      rankDir: 'TB',
      rankSep: 100,
      edgeSep: 50,
      nodeSep: 50,
      padding: 60,
      animate: 'end',
      animationDuration: 800,
      fit: true,
    },
  },
  breadthfirst: {
    name: 'breadthfirst',
    description: '广度优先 — 从根节点按层级向外扩散，适合树状结构。',
    params: [
      { key: 'padding',           label: '间距',        min: 5,    max: 150,   step: 5,    default: 50 },
      { key: 'animationDuration', label: '动画时长',   min: 100,  max: 3000,  step: 50,   default: 700 },
    ],
    cytoscape: {
      name: 'breadthfirst',
      directed: true,
      padding: 50,
      animate: true,
      animationDuration: 700,
      fit: true,
    },
  },
  euler: {
    name: 'euler',
    description: 'Euler — 基于图论力学的布局，优化边交叉和长度。',
    params: [
      { key: 'springLength',      label: '弹簧长度',    min: 50,   max: 500,  step: 5,    default: 250 },
      { key: 'springStrength',    label: '弹簧强度',    min: 0.001,max: 0.5,  step: 0.001,default: 0.02 },
      { key: 'gravity',            label: '重力',        min: 0,    max: 0.5,  step: 0.005,default: 0.01 },
      { key: 'refresh',            label: '刷新间隔',    min: 1,    max: 100,  step: 1,    default: 30 },
      { key: 'maxIterations',     label: '最大迭代',    min: 100,  max: 5000, step: 50,   default: 2000 },
      { key: 'maxSimulationTime', label: '模拟时长',    min: 500,  max: 10000,step: 100,  default: 4000 },
      { key: 'animationDuration', label: '动画时长',    min: 0,    max: 3000, step: 50,   default: 0 },
    ],
    cytoscape: {
      name: 'euler',
      animate: true,
      animationDuration: 600,
      fit: true,
      padding: 30,
      randomize: true,
    },
  },
};

export const DEFAULT_LAYOUT = 'cose';
