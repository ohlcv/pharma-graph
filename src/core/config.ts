// src/core/config.ts
// 全局配置：节点 essence → 形状/填充色，level → 边框色，边类型 → 颜色/线型
// 视觉配置的单一来源（Single Source of Truth）
//
// 视觉维度与知识语义一一对应：
//
//   Essence（本质）  → 形状 + 填充色     → 回答"这是什么"（药/病/概念/机制/口诀...，9 种颜色一一对应）
//   Level（层级）    → 边框色           → 回答"在纸图第几级"（1-6 级结构）
//   EdgeType（边类型）→ 边颜色/线型      → 回答"和谁怎么连"（6 种关系家族）
//
// 禁止用字体、字号、字重、阴影、透明度、渐变、节点大小等额外视觉变量承载语义。
//
// 9 种 essence 填充色选择逻辑（柔和马卡龙 · 降饱和 + 提亮度，温柔不刺眼）：
//   module         浅白  #fafafa — 中性骨架
//   umbrella-class 柔黄  #fde68a — 粗分类
//   strict-class   浅黄  #fef9c3 — 细分类
//   medication     柔蓝  #93c5fd — 药物
//   illness        柔红  #fca5a5 — 疾病
//   notion         柔紫  #d8b4fe — 认知
//   mnemonic       柔绿  #86efac — 口诀
//   concept        柔青  #67e8f9 — 概念
//   summary        柔粉  #f9a8d4 — 总结

import cytoscape from 'cytoscape';
import { EDGE_TYPES, type EdgeType } from './edge-types.js';

// ── Essence → 形状（节点本质决定形状）──────────────────────────────────────────

export const NODE_TYPE_SHAPE: Record<string, string> = {
  module: 'round-rectangle',          // 结构模块/入口 — 圆角矩形
  'strict-class': 'pentagon',         // 严格分类（细分类）— 五边形
  'umbrella-class': 'hexagon',        // 伞形分类（粗分类）— 六边形
  concept: 'rectangle',               // 概念/术语 — 正方形（rectangle 是 cytoscape 中最接近正方形的形状）
  medication: 'ellipse',              // 具体药物/制剂 — 椭圆
  illness: 'diamond',                 // 疾病/病理状态 — 菱形
  notion: 'tag',                      // 学习性认知单元 — 标签形
  mnemonic: 'vee',                    // 记忆口诀 — V形
  summary: 'octagon',                 // 总结/归纳 — 八边形
};

export const NODE_TYPE_COLOR: Record<string, string> = {
  module: '#fafafa',               // 浅白 — 结构模块骨架
  'umbrella-class': '#fde68a',     // 柔黄 — 粗分类
  'strict-class': '#fef9c3',       // 浅黄 — 细分类
  concept: '#67e8f9',               // 柔青 — 概念/术语
  medication: '#93c5fd',            // 柔蓝 — 具体药物
  illness: '#fca5a5',              // 柔红 — 疾病/病理状态
  notion: '#d8b4fe',               // 柔紫 — 学习认知单元
  mnemonic: '#86efac',              // 柔绿 — 记忆口诀
  summary: '#f9a8d4',              // 柔粉 — 总结/归纳
  default: '#94a3b8',
};

export const NODE_TYPE_COLOR_DARK: Record<string, string> = {
  module: '#e5e7eb',               // 浅白→更白
  'umbrella-class': '#d97706',      // 柔黄→深黄
  'strict-class': '#ca8a04',        // 浅黄→深黄
  concept: '#0891b2',               // 柔青→深青
  medication: '#2563eb',             // 柔蓝→深蓝
  illness: '#dc2626',               // 柔红→深红
  notion: '#9333ea',               // 柔紫→深紫
  mnemonic: '#16a34a',             // 柔绿→深绿
  summary: '#db2777',              // 柔粉→深粉
  default: '#64748b',
};

// ── Essence → 中文标签 ───────────────────────────────────────────────────────

export const ESSENCE_LABEL: Record<string, string> = {
  module: '模块',
  'strict-class': '细分类',
  'umbrella-class': '粗分类',
  concept: '概念',
  medication: '药物',
  illness: '疾病',
  notion: '认知',
  mnemonic: '口诀',
  summary: '总结',
};

// ── 节点边框色（单套语义：subtree 色环 + 中性灰 fallback）───────────────────────
//
// 之前两套色环并存（depth 色环 hue 0°/37°/... + subtree 色环 hue 200°/24°/...），
// 用户没法一眼分清"这条边的色是来自 subtree 还是 depth"——两套语义互相覆盖但没图例说清。
//
// 现在的设计：
//   - 唯一语义色 = subtree 色环（按 id hash 稳定映射到 15 个色相桶）
//   - 没有 subtreeRoot 的节点 → 用**中性灰阶**做 fallback（depth 越深灰越深）
//   - 中心节点 (depth 0) 保留金色作为视觉锚点——不是颜色环的一部分，是品牌色
//
// 这样视觉上一眼就能区分"这棵子树 vs 游离节点"两态，subtree 色不再被 depth 色稀释。

/** 中心节点边框色（视觉锚，不参与光谱） */
const CENTER_BORDER_COLOR = '#f59e0b';

/** Subtree 色起点（避开暖色红橙区，从冷蓝紫开始） */
const SUBTREE_HUE_START_DEG = 200;
/** Subtree 色相步进（15 桶循环，够覆盖大多数图谱） */
const SUBTREE_HUE_STEP_DEG = 24;
const SUBTREE_BORDER_SATURATION = 80;
const SUBTREE_BORDER_LIGHTNESS = 50;

/**
 * 把任意字符串稳定 hash 到 0..2^32-1（djb2）。
 * 用于给 subtree id 映射一个与节点遍历顺序无关的颜色桶号，
 * 保证同一棵树跨刷新、跨加载顺序都拿到同一个色。
 */
function stableHash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * 给定子树 id 返回边框色。
 *
 * 设计权衡：
 *   - 用 id 自身的稳定 hash 决定色相，**与节点遍历顺序无关**——
 *     同一棵子树跨刷新、跨加载顺序永远拿同一个色。
 *   - 桶号 = hash % 15，限制实际使用的色相数（避免 360° 全用上导致相邻色相难辨）。
 *   - 15 这个数字选得不重要——subtree 数超 15 时本来就要循环，调色一致性更重要。
 */
export function getSubtreeBorderColor(subtreeId: string): string {
  const bucket = stableHash(subtreeId) % 15;
  const hue = (SUBTREE_HUE_START_DEG + bucket * SUBTREE_HUE_STEP_DEG) % 360;
  return hslToHex(hue, SUBTREE_BORDER_SATURATION, SUBTREE_BORDER_LIGHTNESS);
}

/**
 * 给定 depth 返回**中性灰**边框色——只给没有 subtreeRoot 的节点用。
 *
 * 设计权衡：
 *   - 不参与色环，所以不能用色相——否则会跟 subtree 色撞车。
 *   - depth 越深灰越深，让"靠近中心"的视觉权重自然高于"远端游离节点"。
 *   - 用离散查找表（8 档灰）而不是线性 lightness 公式：lightness 在
 *     30%-70% 区间内人眼区分度本来就低，离散表反而更稳。
 */
const NEUTRAL_GRAY_BY_DEPTH: Record<number, string> = {
  0: CENTER_BORDER_COLOR, // 中心节点保留金色锚
  1: '#64748b', // slate-500
  2: '#94a3b8', // slate-400
  3: '#cbd5e1', // slate-300
  4: '#e2e8f0', // slate-200
  5: '#f1f5f9', // slate-100
};
const NEUTRAL_GRAY_FALLBACK = '#cbd5e1'; // 超出 depth 5 的都用这个

export function getNeutralBorderColor(depth: number): string {
  if (depth <= 0) return CENTER_BORDER_COLOR;
  return NEUTRAL_GRAY_BY_DEPTH[depth] ?? NEUTRAL_GRAY_FALLBACK;
}

/** HSL → #RRGGBB（仅用于边框色——饱和/明度固定，转换是纯数学） */
function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * depth → 中文层级名（detail-panel 还在用，与边框色语义无关）。
 *
 * LEVEL_BORDER_COLOR 已废弃：A1 方案后，所有 depth 边框色都经由
 * getNeutralBorderColor() 按需生成，不再需要一张静态表。
 */
export const LEVEL_LABEL: Record<number, string> = {
  0: '中心',
  1: '一级',
  2: '二级',
  3: '三级',
  4: '四级',
  5: '五级',
  6: '六级',
};
// ── Edge type → visual style ────────────────────────────────────────────────
// 5 种 OWL/RDF 风格边类型，每种对应一种关系家族。
// 具体药学语义（治疗/导致/抑制...）放进 reason，不再各占一个 type。

export const EDGE_TYPE_STYLE: Record<string, { color: string; lineStyle: string; arrow: string }> =
  {
    // 类-类 / 个体-类 / 局部-整体 — 都用三角箭头表示方向
    subclass_of: { color: '#3b82f6', lineStyle: 'solid', arrow: 'triangle' },   // 蓝色实线箭头 — 类-类层级
    part_of: { color: '#22c55e', lineStyle: 'solid', arrow: 'triangle' },       // 绿色实线箭头 — 局部-整体
    instance_of: { color: '#f97316', lineStyle: 'solid', arrow: 'triangle' },   // 橙色实线箭头 — 个体-类
    // 对称关系 — 点线 + 双向箭头
    disjoint_with: { color: '#a855f7', lineStyle: 'dashed', arrow: 'triangle' }, // 紫色虚线 — 互斥（cytoscape 不支持 dash-dot，用 dashed+紫色区分）
    equivalent_to: { color: '#a78bfa', lineStyle: 'dotted', arrow: 'triangle' }, // 灰紫点线 — 等价
    default: { color: '#bdc3c7', lineStyle: 'solid', arrow: 'none' },
  };

// ── Edge type → 中文标签 ─────────────────────────────────────────────────────

export const EDGE_TYPE_LABEL: Record<EdgeType, string> = {
  subclass_of: '子类→父类',
  part_of: '局部→整体',
  instance_of: '实例→类别',
  disjoint_with: '互斥',
  equivalent_to: '等价',
};

// ── Shape → 中文标签 ─────────────────────────────────────────────────────────

export const SHAPE_LABEL: Record<string, string> = {
  ellipse: '椭圆',
  'round-rectangle': '圆角矩形',
  rectangle: '矩形 / 正方形',
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
