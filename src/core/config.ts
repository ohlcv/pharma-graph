// src/core/config.ts
// 全局配置：节点 essence → 形状映射、field → 边框色、tier → 填充色、关系类型 → 颜色/线型、布局配置
// 视觉配置的单一来源（Single Source of Truth）
//
// 视觉维度与知识语义一一对应：
//
//   Essence（本质）  → 形状            → 回答"这是什么"（药/病/概念/机制...）
//   Field（学科）   → 边框色           → 回答"属于哪门学科"（药剂/药理/药化...）
//   Tier（层次）    → 填充色           → 回答"在哪一层"（底层→高层，从大众到稀有）
//
// 颜色选取原则：
//   - Field 边框色：学科气质（药剂=工程橙、药理=权威紫、药化=理性绿）
//   - Tier 填充色：从大众到稀有（基础=灰蓝、药物=浅蓝、疾病=浅红、管理=浅黄、服务=浅青、法规=浅紫）

import cytoscape from 'cytoscape';

// ── Essence → visual style（节点本质决定形状）──────────────────────────────────
// 8 种本质，与 frontmatter.md 的 essence 枚举一一对应

export const NODE_TYPE_SHAPE: Record<string, string> = {
  notion:     'octagon',          // 概念 — 八边形，分类聚集
  medication: 'ellipse',          // 具体药物或制剂 — 圆形，规整具体
  illness:    'diamond',          // 疾病或病理状态 — 菱形，警示感强
  route:      'triangle',        // 信号通路、受体家族 — 三角形，方向汇聚
  substance:  'pentagon',         // 成分、辅料、指标 — 五边形，化学基础感
  process:    'star',             // 过程、机制、体内行为 — 星形
  module:     'round-rectangle',  // 模块、入口、章节 — 圆角矩形，结构感
  section:    'tag',              // 标签型知识点 — 标签形，入口标识
};

export const NODE_TYPE_COLOR: Record<string, string> = {
  notion:     '#818cf8',  // 靛蓝 — 概念
  medication: '#67e8f9',  // 青色 — 具体药物或制剂
  illness:    '#fca5a5',  // 浅红 — 疾病或病理状态
  route:      '#22d3ee',  // 青色 — 信号通路、受体家族
  substance:  '#c4b5fd',  // 紫色 — 成分、辅料、指标
  process:    '#f87171',  // 红色 — 过程、机制、体内行为
  module:     '#67e8f9',  // 青色 — 模块、入口、章节
  section:    '#d1d5db',  // 淡灰 — 标签型知识点
  default:    '#94a3b8',  // 未知类型的兜底色
};

export const NODE_TYPE_COLOR_DARK: Record<string, string> = {
  notion:     '#4f46e5',
  medication: '#0891b2',
  illness:    '#dc2626',
  route:      '#0891b2',
  substance:  '#7c3aed',
  process:    '#dc2626',
  module:     '#0891b2',
  section:    '#94a3b8',
  default:    '#64748b',
};

// ── Essence → 中文标签 ───────────────────────────────────────────────────────

export const ESSENCE_LABEL: Record<string, string> = {
  notion:     '概念',
  medication: '药物',
  illness:    '疾病',
  route:      '通路',
  substance:  '成分',
  process:    '过程',
  module:     '入口',
  section:    '标签',
};

// ── Field → 学科领域边框色 ───────────────────────────────────────────────────
// 8 门学科，每门一色，色相间隔清晰
// field 回答"属于哪门学科"——边框色区分学科归属

export const FIELD_COLOR: Record<string, string> = {
  pharmaceutics:      '#fb923c',  // 橙 — 药剂学
  pharmacokinetics:   '#fbbf24',  // 黄 — 药代动力学
  medicinal_chemistry:'#34d399',  // 绿 — 药物化学
  pharmacology:       '#a78bfa',  // 紫 — 药理学
  toxicology:         '#7c3aed',  // 深紫 — 毒理学
  biopharmaceutics:   '#fbbf24',  // 黄 — 生物药剂学（与药代同族）
  clinical_pharmacy:  '#94a3b8',  // 灰蓝 — 临床药学
  pharmacy_service:   '#818cf8',  // 靛蓝 — 药学服务
};

export const FIELD_LABEL: Record<string, string> = {
  pharmaceutics:      '药剂学',
  pharmacokinetics:   '药代动力学',
  medicinal_chemistry:'药物化学',
  pharmacology:       '药理学',
  toxicology:         '毒理学',
  biopharmaceutics:   '生物药剂学',
  clinical_pharmacy:  '临床药学',
  pharmacy_service:   '药学服务',
};

// ── Tier → 填充色（从大众到稀有）─────────────────────────────────────────────
// tier 回答"在哪一层"——基础层最大众、法规层最稀有
// 填充色辅助识别层次

export const NODE_TIER_STYLE: Record<string, { bgColor: string }> = {
  basic:      { bgColor: '#cbd5e1' },  // 灰蓝 — 基础层
  drug:       { bgColor: '#93c5fd' },  // 浅蓝 — 药物层
  disease:    { bgColor: '#fca5a5' },  // 浅红 — 疾病层
  management: { bgColor: '#fde68a' },  // 浅黄 — 管理层
  service:    { bgColor: '#6ee7b7' },  // 浅青 — 服务层
  legal:      { bgColor: '#d8b4fe' },  // 浅紫 — 法规层
};

export const TIER_LABEL: Record<string, string> = {
  basic: '基础层', drug: '药物层', disease: '疾病层',
  management: '管理层', service: '服务层', legal: '法规层',
};

// ── Edge type → visual style ────────────────────────────────────────────────

export const EDGE_TYPE_STYLE: Record<string, { color: string; lineStyle: string; arrow: string }> = {
  // 结构与组成
  has:       { color: '#95a5a6', lineStyle: 'solid',   arrow: 'none'     },
  isa:       { color: '#4a90e2', lineStyle: 'solid',   arrow: 'triangle' },
  // 药理机制
  activates: { color: '#27ae60', lineStyle: 'solid',   arrow: 'triangle' },
  inhibits:  { color: '#c0392b', lineStyle: 'solid',   arrow: 'tee'      },
  mechanism: { color: '#e27c3e', lineStyle: 'solid',   arrow: 'triangle' },
  metabolizes:{ color: '#8e44ad', lineStyle: 'solid',   arrow: 'triangle' },
  // 临床关联
  treats:     { color: '#2ecc71', lineStyle: 'solid',   arrow: 'triangle' },
  causes:     { color: '#e74c3c', lineStyle: 'solid',   arrow: 'triangle' },
  interacts:  { color: '#f39c12', lineStyle: 'dashed',  arrow: 'none'     },
  contraindicates: { color: '#c0392b', lineStyle: 'dashed', arrow: 'none' },
  // 学习路径
  prerequisite:{ color: '#9b59b6', lineStyle: 'dotted', arrow: 'triangle' },
  relates:    { color: '#7f8c8d', lineStyle: 'dashed',  arrow: 'none'     },
  sibling:    { color: '#16a085', lineStyle: 'dotted',  arrow: 'none'     },
  default:    { color: '#bdc3c7', lineStyle: 'solid',   arrow: 'none'     },
};

// ── Edge type → 中文标签 ─────────────────────────────────────────────────────
// Single source of truth: 详情面板、图例、节点关联都查这里。

export const EDGE_TYPE_LABEL: Record<string, string> = {
  has:              '包含',
  isa:              '属于',
  activates:        '激动',
  inhibits:         '抑制',
  mechanism:        '机制',
  metabolizes:      '代谢',
  treats:           '治疗',
  causes:           '致因',
  interacts:        '相互作用',
  contraindicates:  '禁忌',
  prerequisite:     '前置',
  relates:         '相关',
  sibling:         '兄弟',
};

// ── Shape → 中文标签 ─────────────────────────────────────────────────────────

export const SHAPE_LABEL: Record<string, string> = {
  ellipse:          '椭圆',
  'round-rectangle': '圆角矩形',
  rectangle:        '矩形',
  diamond:          '菱形',
  triangle:         '三角形',
  pentagon:         '五边形',
  octagon:          '八边形',
  star:             '星形',
  tag:              '标签形',
  'round-tag':      '圆角标签形',
  'round-triangle': '圆角三角形',
  'bottom-round-rectangle': '底圆矩形',
  'cut-rectangle':  '切角矩形',
  barrel:           '桶形',
  rhomboid:         '菱形（横向）',
  'right-rhomboid': '右斜菱形',
  'round-diamond':  '圆角菱形',
  'round-pentagon': '圆角五边形',
  hexagon:          '六边形',
  'round-hexagon':  '圆角六边形',
  'concave-hexagon':'凹六边形',
  heptagon:         '七边形',
  'round-heptagon': '圆角七边形',
  'round-octagon':  '圆角八边形',
  vee:              'V形',
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
      { key: 'nodeRepulsion',      label: '节点斥力',   min: 1000, max: 50000, step: 100,  default: 35000 },
      { key: 'idealEdgeLength',   label: '理想边长',   min: 20,   max: 500,   step: 5,    default: 400 },
      { key: 'edgeElasticity',    label: '边弹性',     min: 1,    max: 500,   step: 1,    default: 60 },
      { key: 'gravity',            label: '重力',        min: 0,    max: 1,     step: 0.01, default: 0.01 },
      { key: 'tile',              label: '平铺',        type: 'bool',           default: 1 },
      { key: 'animationDuration', label: '动画时长',   min: 100,  max: 3000,  step: 50,   default: 1200 },
      { key: 'spacingFactor',     label: '间距倍增',   min: 0.1,  max: 5,     step: 0.05, default: 2.2 },
    ],
    cytoscape: {
      name: 'cose-bilkent',
      animate: true,
      animationDuration: 1200,
      animationEasing: 'ease-out-cubic',
      randomize: true,
      nodeRepulsion: 35000,
      idealEdgeLength: 400,
      edgeElasticity: 60,
      gravity: 0.01,
      numIter: 2500,
      tile: true,
      tilingPaddingVertical: 30,
      tilingPaddingHorizontal: 30,
      fit: true,
      padding: 100,
      nodeDimensionsIncludeLabels: true,
      minNodeSpacing: 150,
      avoidOverlap: true,
      spacingFactor: 2.2,
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
