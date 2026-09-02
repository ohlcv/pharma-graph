// src/core/config.ts
// 全局配置：节点 essence → 形状映射、level → 边框色、tier → 填充色、边类型 → 颜色/线型
// 视觉配置的单一来源（Single Source of Truth）
//
// 视觉维度与知识语义一一对应：
//
//   Essence（本质）  → 形状            → 回答"这是什么"（药/病/概念/机制/口诀...）
//   Level（层级）    → 边框色           → 回答"在纸图第几级"（1-6 级结构）
//   Tier（层次）    → 填充色           → 回答"在药学知识哪一层"（基础→法规）
//   EdgeType（边类型）→ 边颜色/线型      → 回答"和谁怎么连"（6 种关系家族）
//
// 禁止用字体、字号、字重、阴影、透明度、渐变、节点大小等额外视觉变量承载语义。

import cytoscape from 'cytoscape';
import { EDGE_TYPES, type EdgeType } from './edge-types.js';

// ── Essence → 形状（节点本质决定形状）──────────────────────────────────────────

export const NODE_TYPE_SHAPE: Record<string, string> = {
  module: 'round-rectangle',          // 结构模块/入口 — 圆角矩形
  classification: 'hexagon',         // 分类/分组标准 — 六边形
  concept: 'octagon',               // 概念/术语 — 八边形
  medication: 'ellipse',            // 具体药物/制剂 — 椭圆
  illness: 'diamond',               // 疾病/病理状态 — 菱形
  process: 'star',                  // 机制/过程 — 星形
  notion: 'tag',                    // 学习性认知单元 — 标签形
  mnemonic: 'vee',                   // 记忆口诀 — V形
  summary: 'pentagon',              // 总结/归纳 — 五边形
  table: 'rectangle',              // 表格/对照表 — 矩形
  note: 'round-tag',               // 注意/提示/笔记 — 圆角标签形
  // 历史兼容
  section: 'tag',
  route: 'triangle',
  substance: 'pentagon',
};

export const NODE_TYPE_COLOR: Record<string, string> = {
  module: '#67e8f9',               // 青色 — 结构模块
  classification: '#818cf8',       // 靛蓝 — 分类
  concept: '#818cf8',              // 靛蓝 — 概念
  medication: '#67e8f9',           // 青色 — 药物
  illness: '#fca5a5',             // 浅红 — 疾病
  process: '#f87171',             // 红色 — 过程/机制
  notion: '#d1d5db',              // 淡灰 — 学习认知
  mnemonic: '#fbbf24',            // 黄色 — 口诀
  summary: '#fde68a',             // 浅黄 — 总结
  table: '#94a3b8',               // 灰蓝 — 表格
  note: '#fca5a5',               // 浅红 — 注意/提示
  // 历史兼容
  section: '#d1d5db',
  route: '#22d3ee',
  substance: '#c4b5fd',
  default: '#94a3b8',
};

export const NODE_TYPE_COLOR_DARK: Record<string, string> = {
  module: '#0891b2',
  classification: '#4f46e5',
  concept: '#4f46e5',
  medication: '#0891b2',
  illness: '#dc2626',
  process: '#dc2626',
  notion: '#94a3b8',
  mnemonic: '#d97706',
  summary: '#ca8a04',
  table: '#64748b',
  note: '#dc2626',
  // 历史兼容
  section: '#94a3b8',
  route: '#0891b2',
  substance: '#7c3aed',
  default: '#64748b',
};

// ── Essence → 中文标签 ───────────────────────────────────────────────────────

export const ESSENCE_LABEL: Record<string, string> = {
  module: '模块',
  classification: '分类',
  concept: '概念',
  medication: '药物',
  illness: '疾病',
  process: '过程',
  notion: '认知',
  mnemonic: '口诀',
  summary: '总结',
  table: '表格',
  note: '注意',
  // 历史兼容
  section: '标签',
  route: '通路',
  substance: '成分',
};

// ── Level → 边框色（思维导图结构级别 1-6）──────────────────────────────────────

export const LEVEL_BORDER_COLOR: Record<number, string> = {
  1: '#1e293b',   // 一级 — 最深结构色（slate-800）
  2: '#334155',   // 二级 — 深结构色（slate-700）
  3: '#475569',   // 三级 — 中结构色（slate-600）
  4: '#64748b',   // 四级 — 中浅结构色（slate-500）
  5: '#94a3b8',   // 五级 — 浅结构色（slate-400）
  6: '#cbd5e1',   // 六级 — 最浅结构色（slate-300）
};

export const LEVEL_LABEL: Record<number, string> = {
  1: '一级',
  2: '二级',
  3: '三级',
  4: '四级',
  5: '五级',
  6: '六级',
};

// ── Field → 学科领域边框色 ───────────────────────────────────────────────────
// field 回答"属于哪门学科"——边框色区分学科归属
// 注意：level 也决定边框色，两者通过不同优先级叠加：
//   level → border-color（主边框色）
//   field → 保留用于详情面板/图例，不再直接覆盖边框色

export const FIELD_COLOR: Record<string, string> = {
  pharmaceutics: '#fb923c', // 橙 — 药剂学
  pharmacokinetics: '#fbbf24', // 黄 — 药代动力学
  medicinal_chemistry: '#34d399', // 绿 — 药物化学
  pharmacology: '#a78bfa', // 紫 — 药理学
  toxicology: '#7c3aed', // 深紫 — 毒理学
  biopharmaceutics: '#fbbf24', // 黄 — 生物药剂学
  clinical_pharmacy: '#94a3b8', // 灰蓝 — 临床药学
  pharmacy_service: '#818cf8', // 靛蓝 — 药学服务
};

export const FIELD_LABEL: Record<string, string> = {
  pharmaceutics: '药剂学',
  pharmacokinetics: '药代动力学',
  medicinal_chemistry: '药物化学',
  pharmacology: '药理学',
  toxicology: '毒理学',
  biopharmaceutics: '生物药剂学',
  clinical_pharmacy: '临床药学',
  pharmacy_service: '药学服务',
};

// ── Tier → 填充色（知识层级）─────────────────────────────────────────────────
// tier 回答"在药学知识世界哪一层"——填充色区分知识自然层级

export const NODE_TIER_STYLE: Record<string, { bgColor: string }> = {
  basic: { bgColor: '#cbd5e1' }, // 灰蓝 — 基础层
  drug: { bgColor: '#93c5fd' }, // 浅蓝 — 药物层
  disease: { bgColor: '#fca5a5' }, // 浅红 — 疾病层
  management: { bgColor: '#fde68a' }, // 浅黄 — 管理层
  service: { bgColor: '#6ee7b7' }, // 浅青 — 服务层
  legal: { bgColor: '#d8b4fe' }, // 浅紫 — 法规层
};

export const TIER_LABEL: Record<string, string> = {
  basic: '基础层',
  drug: '药物层',
  disease: '疾病层',
  management: '管理层',
  service: '服务层',
  legal: '法规层',
};

// ── Edge type → visual style ────────────────────────────────────────────────
// 6 种边类型，每种对应一种关系家族。
// 具体药学语义（治疗/导致/抑制...）放进 reason，不再各占一个 type。

export const EDGE_TYPE_STYLE: Record<string, { color: string; lineStyle: string; arrow: string }> =
  {
    // 结构关系
    parent: { color: '#94a3b8', lineStyle: 'solid', arrow: 'none' },      // 灰色实线 — 层级归属
    branch: { color: '#3b82f6', lineStyle: 'solid', arrow: 'none' },       // 蓝色实线 — 分支展开
    // 知识关系
    link: { color: '#22c55e', lineStyle: 'solid', arrow: 'triangle' },     // 绿色实线箭头 — 明确关系
    relate: { color: '#a78bfa', lineStyle: 'dotted', arrow: 'none' },      // 灰紫点线 — 一般关联
    // 辅助关系
    support: { color: '#f97316', lineStyle: 'dashed', arrow: 'triangle' },  // 橙色虚线箭头 — 学习辅助
    contrast: { color: '#a855f7', lineStyle: 'dashed', arrow: 'triangle' },   // 紫色虚线 — 对比区分（cytoscape 不支持 dash-dot，用 dashed+紫色区分）
    default: { color: '#bdc3c7', lineStyle: 'solid', arrow: 'none' },
  };

// ── Edge type → 中文标签 ─────────────────────────────────────────────────────

export const EDGE_TYPE_LABEL: Record<EdgeType, string> = {
  parent: '层级',
  branch: '分支',
  link: '关系',
  relate: '关联',
  support: '辅助',
  contrast: '对比',
};

// ── Shape → 中文标签 ─────────────────────────────────────────────────────────

export const SHAPE_LABEL: Record<string, string> = {
  ellipse: '椭圆',
  'round-rectangle': '圆角矩形',
  rectangle: '矩形',
  diamond: '菱形',
  triangle: '三角形',
  pentagon: '五边形',
  octagon: '八边形',
  star: '星形',
  tag: '标签形',
  'round-tag': '圆角标签形',
  'round-triangle': '圆角三角形',
  'bottom-round-rectangle': '底圆矩形',
  'cut-rectangle': '切角矩形',
  barrel: '桶形',
  rhomboid: '菱形（横向）',
  'right-rhomboid': '右斜菱形',
  'round-diamond': '圆角菱形',
  'round-pentagon': '圆角五边形',
  hexagon: '六边形',
  'round-hexagon': '圆角六边形',
  'concave-hexagon': '凹六边形',
  heptagon: '七边形',
  'round-heptagon': '圆角七边形',
  'round-octagon': '圆角八边形',
  vee: 'V形',
};

// ── Layout configs ───────────────────────────────────────────────────────────

export interface LayoutParam {
  key: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  type?: 'select' | 'bool';
  options?: string[];
  /** Tooltip shown on hover — explains what the slider actually controls. */
  description?: string;
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
      {
        key: 'nodeRepulsion',
        label: '节点斥力',
        min: 1000,
        max: 100000,
        step: 500,
        default: 80000,
        description:
          '节点间库仑斥力倍数。cose-bilkent 官方默认 4500；为 224 节点密度上调 ×18。值越大节点越不易重叠，但过大图会很散。',
      },
      {
        key: 'idealEdgeLength',
        label: '理想边长',
        min: 20,
        max: 500,
        step: 5,
        default: 400,
        description: '弹簧静止长度。官方默认 50；为 224 节点上调 ×8 让布局更展开。',
      },
      {
        key: 'edgeElasticity',
        label: '边弹性',
        min: 0.1,
        max: 10,
        step: 0.05,
        default: 0.45,
        description:
          '弹簧刚度系数（springConstant）。cose-bilkent 官方默认 0.45。值越大弹簧越硬——过强会让节点紧贴理想边长但无法对斥力做微调，**反而加剧重叠**。',
      },
      {
        key: 'gravity',
        label: '重力',
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.05,
        description: '把节点拉向中心。0=无；官方默认 0.25。本项目调小到 0.05 以免压缩中心节点。',
      },
      {
        key: 'tile',
        label: '平铺',
        type: 'bool',
        default: 1,
        description: '把无连接的孤立节点平铺到四周。',
      },
      {
        key: 'animationDuration',
        label: '动画时长',
        min: 100,
        max: 3000,
        step: 50,
        default: 1200,
        description:
          'cytoscape core layoutPositions 的 from→to 插值时长。不是 cose-bilkent 的物理迭代时长。',
      },
    ],
    cytoscape: {
      name: 'cose-bilkent',
      animate: 'end',
      animationDuration: 1200,
      animationEasing: 'ease-out-cubic',
      randomize: true,
      nodeRepulsion: 80000,
      idealEdgeLength: 400,
      edgeElasticity: 0.45,
      gravity: 0.05,
      numIter: 5000,
      quality: 'proof',
      tile: true,
      tilingPaddingVertical: 30,
      tilingPaddingHorizontal: 30,
      fit: true,
      padding: 100,
      nodeDimensionsIncludeLabels: true,
    },
  },
  concentric: {
    name: 'concentric',
    description: '同心圆 — 节点按权重从中心向外分层排列，适合展示层次重要性。',
    params: [
      { key: 'minNodeSpacing', label: '节点间距', min: 10, max: 200, step: 5, default: 50 },
      { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 800 },
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
      { key: 'radius', label: '圆半径', min: 50, max: 600, step: 10, default: 200 },
      { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 700 },
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
      { key: 'padding', label: '间距', min: 5, max: 150, step: 5, default: 50 },
      { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 600 },
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
      {
        key: 'rankDir',
        label: '方向',
        type: 'select',
        options: ['TB', 'BT', 'LR', 'RL'],
        default: 'TB',
      },
      { key: 'rankSep', label: '层间距', min: 20, max: 300, step: 5, default: 100 },
      { key: 'nodeSep', label: '节点间距', min: 5, max: 150, step: 5, default: 50 },
      { key: 'edgeSep', label: '边间距', min: 5, max: 100, step: 5, default: 50 },
      {
        key: 'align',
        label: '层内对齐',
        type: 'select',
        options: ['UL', 'UR', 'DL', 'DR'],
        default: 'UL',
        description: '节点在层内的对齐方式（上左/上右/下左/下右）。UL=上左对齐。',
      },
      {
        key: 'ranker',
        label: '分层算法',
        type: 'select',
        options: ['tight-tree', 'longest-path', 'network-simplex'],
        default: 'tight-tree',
        description: 'tight-tree 快速、longest-path 简单但质量低、network-simplex 最慢但质量最高。',
      },
      {
        key: 'acyclicer',
        label: '环处理',
        type: 'select',
        options: ['greedy'],
        default: 'greedy',
        description:
          '本图谱有对称/反向边，必须设 acyclicer 才能避免 dagre 报错；greedy 是官方推荐策略。',
      },
      { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 800 },
    ],
    cytoscape: {
      name: 'dagre',
      rankDir: 'TB',
      rankSep: 100,
      edgeSep: 50,
      nodeSep: 50,
      acyclicer: 'greedy',
      align: 'UL',
      ranker: 'tight-tree',
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
      { key: 'padding', label: '间距', min: 5, max: 150, step: 5, default: 50 },
      { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 700 },
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
      {
        key: 'springCoeff',
        label: '弹簧系数',
        min: 0.00005,
        max: 0.05,
        step: 0.0001,
        default: 0.0002,
        description: '胡克定律系数（springCoeff）。值越大弹簧越紧。0.0001-0.0003 适合稀疏布局。',
      },
      { key: 'springLength', label: '弹簧长度', min: 20, max: 1000, step: 5, default: 140 },
      {
        key: 'gravity',
        label: '重力（斥力）',
        min: -100,
        max: 5,
        step: 0.5,
        default: -15,
        description: '库仑斥力系数。负数 = 节点互相排斥推开，正数 = 互相吸引（一般不用）。',
      },
      {
        key: 'pull',
        label: '中心引力',
        min: -0.005,
        max: 0.05,
        step: 0.0005,
        default: 0,
        description:
          '正系数 = 节点被拉向 origin (0,0); euler 默认 0.001 会把布局收紧到中心。0 = 关闭。',
      },
      { key: 'refresh', label: '刷新间隔', min: 1, max: 200, step: 1, default: 30 },
      {
        key: 'maxIterations',
        label: '最大迭代',
        min: 100,
        max: 30000,
        step: 100,
        default: 5000,
      },
      {
        key: 'maxSimulationTime',
        label: '模拟时长',
        min: 500,
        max: 120000,
        step: 500,
        default: 20000,
      },
      {
        key: 'animationDuration',
        label: '动画时长',
        min: 0,
        max: 10000,
        step: 100,
        default: 0,
        description: '仅 animate="end" 时生效；当前默认连续动画忽略此值。',
      },
    ],
    cytoscape: {
      name: 'euler',
      animate: true,
      animationDuration: 600,
      fit: true,
      padding: 30,
      randomize: true,
      springCoeff: 0.0002,
      springLength: 140,
      gravity: -15,
      pull: 0,
      maxIterations: 5000,
      maxSimulationTime: 20000,
    },
  },
};

export const DEFAULT_LAYOUT = 'euler';
