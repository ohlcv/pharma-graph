// src/core/config.ts
// 全局配置：节点 fill/shape/stroke → 形状/填充色/边框，边类型 → 颜色/线型
// 视觉配置的单一来源（Single Source of Truth）
//
// 视觉语义分离设计（shape/stroke 覆盖 fill 默认值）：
//   fill（领域顶层类）  → 形状 + 背景色 + 边框色（配置中心）
//   shape（几何形状）   → 显式填写时覆盖 fill 的默认形状
//   stroke（边框样式）  → 显式填写时覆盖 fill 的默认边框
//   subtreeRoot        → 自动计算的分类归属色（fallback）
//
// 兼容旧字段：essence → fill（前端自动映射）

import cytoscape from 'cytoscape';
import { EDGE_TYPES, type EdgeType } from './edge-types.js';

// ── 类型别名（与 graph.ts 同步）─────────────────────────────────────────────
export type StrokeType = 'auto' | 'flow' | 'glow' | 'fallback';

/** OWL2 实体类型枚举（shape 取值）
 *  每个类型对应一个固定的 Cytoscape 几何形状（见 SHAPE_BY_OWL2） */
export type ShapeType =
  | 'auto'
  | 'class'
  | 'named_individual'
  | 'object_property'
  | 'data_property'
  | 'annotation_property';

// ── Shape (OWL2 实体类型) → Cytoscape 几何形状 ───────────────────────────────
//
// 每个 OWL2 实体类型对应一个固定的 Cytoscape 几何形状（一对一）。
// shape 留空时，节点使用 fill（FILL_CONFIG）配置的默认形状。
//
// 设计意图：
//   - 简单场景：填 shape（如 named_individual），立即得到圆形
//   - 复杂场景：不填 shape，让 fill 的扩展形状生效（如 cls-mnemonic 的 vee、cls-summary 的 round-rectangle）
//
export const SHAPE_BY_OWL2: Record<Exclude<ShapeType, 'auto'>, cytoscape.Css.NodeShape> = {
  class:              'round-rectangle',  // 类：圆角矩形（适合分类/概念集合）
  named_individual:   'ellipse',          // 具名个体：椭圆（适合具体药物/疾病）
  object_property:    'hexagon',          // 对象属性：六边形（适合关系实体化）
  data_property:      'rectangle',        // 数据属性：矩形（适合数值属性）
  annotation_property:'tag',              // 注释属性：标签形（适合定义/口诀/总结）
};

// ── Stroke → 边框样式配置（新增）─────────────────────────────────────────────
//
// 边框色计算优先级：
//   stroke 显式声明 → 优先
//   stroke = auto → subtreeRoot 色（自动计算）
//   无 subtreeRoot → depth 灰阶 fallback

export const STROKE_CONFIG: Record<StrokeType, {
  color: string;
  lineStyle: 'solid' | 'dashed';
  effect?: 'flow' | 'glow';
  description: string;
}> = {
  auto:     { color: 'inherit', lineStyle: 'solid', description: 'subtreeRoot 色（无则走 fill fallback）' },
  fallback: { color: 'inherit', lineStyle: 'solid', description: 'fill 兜底边框色（FILL_BORDER_HINTS[fill]）' },
  flow:     { color: '#3b82f6', lineStyle: 'solid', effect: 'flow', description: 'subtreeRoot 色 + 流光动画（重点药/分类）' },
  glow:     { color: '#3b82f6', lineStyle: 'solid', effect: 'glow', description: 'subtreeRoot 色 + 光晕效果（跨节总结）' },
};

// ── Fill → 形状 + 背景色配置 ────────────────────────────────────────────────
//
// fill 是领域顶层类 IRI，决定节点的默认形状和背景色。
// 新 fill 值与旧 essence 值的映射关系：
//   cls-structure    → module
//   cls-classification → strict-class / umbrella-class
//   cls-drug         → medication / drug
//   cls-disease      → illness
//   cls-feature      → notion（部分）
//   cls-adverse      → notion（部分）
//   cls-concept      → concept
//   cls-summary      → summary
//   cls-mnemonic     → mnemonic
//   cls-biomolecule  → (预留)
//
// ── fill 配置 ────────────────────────────────────────────────────────────────
//
// 字段说明：
//   shape       — Cytoscape 几何形状（fill 的默认形状；显式填 shape 时由 SHAPE_BY_OWL2 覆盖）
//   background  — 节点背景色
//   backgroundDark — 暗色主题下的备用背景色（当前实现同 background，预留扩展）
//   label       — 中文标签（用于文档/UI 显示）
//   description — 配置说明
//
// ⚠️ fill 不管边框色，但**默认 stroke** 由 fill 提供（见 FILL_CONFIG[fill].defaultStroke）：
//   - 节点显式 stroke（flow/glow）→ STROKE_CONFIG[stroke].color
//   - 节点未填 stroke → FILL_CONFIG[fill].defaultStroke
//   - stroke=auto → STROKE_CONFIG.auto.color（子树色或 depth 灰阶）
// 边框色最终由 STROKE_CONFIG / getSubtreeBorderColor 决定。
//
export const FILL_CONFIG: Record<string, {
  shape: string;
  background: string;
  backgroundDark: string;
  /** 默认 stroke 行为，节点不填 stroke 时启用
   *  - auto: 子树统一色（subtreeRoot），无子树时降级到 fill 兜底边框色
   *  - fallback: 直接用 fill 兜底边框色（按 fill 类型着色，不跟随子树）
   *  - flow: subtreeRoot 色 + 流光动画
   *  - glow: subtreeRoot 色 + 光晕效果 */
  defaultStroke: StrokeType;
  label: string;
  description: string;
}> = {
  // ── 结构入口 ────────────────────────────────────────────────────────────
  // round-pentagon：五边形（柔），区别于章的矩形
  'cls-structure': {
    shape: 'round-pentagon',
    background: '#fae8e3',         // 柔奶杏粉
    backgroundDark: '#f5d0c5',
    defaultStroke: 'auto',
    label: '组织结构',
    description: '书/篇/章/节入口',
  },
  // ── 分类 ──────────────────────────────────────────────────────────────────
  // octagon：八边形，明显的"分类"层级感
  'cls-classification': {
    shape: 'octagon',
    background: '#ffe4b5',         // 柔莫兰迪黄
    backgroundDark: '#ffcc80',
    defaultStroke: 'auto',
    label: '药物分类',
    description: '粗分类/细分类/亚类',
  },
  // ── 药物 ──────────────────────────────────────────────────────────────────
  // ellipse：椭圆，最通用的具体物形状
  'cls-drug': {
    shape: 'ellipse',
    background: '#dbeafe',         // 柔天空蓝
    backgroundDark: '#bfdbfe',
    defaultStroke: 'flow',
    label: '药物',
    description: '具体药物（重点+普通）',
  },
  // ── 疾病 ──────────────────────────────────────────────────────────────────
  // diamond：菱形，"病症"的尖锐感
  'cls-disease': {
    shape: 'diamond',
    background: '#fce7f3',         // 柔樱花粉
    backgroundDark: '#fbcfe8',
    defaultStroke: 'auto',
    label: '疾病',
    description: '疾病/症状/综合征',
  },
  // ── 生物实体 ──────────────────────────────────────────────────────────────
  // round-octagon：圆角八边形，柔化"靶点"感
  'cls-biomolecule': {
    shape: 'round-octagon',
    background: '#d1fae5',         // 柔薄荷绿
    backgroundDark: '#a7f3d0',
    defaultStroke: 'auto',
    label: '生物实体',
    description: '靶点/受体/酶/转运体/基因',
  },
  // ── 作用特点/临床评价 ────────────────────────────────────────────────────
  // heptagon：七边形，独特形状
  'cls-feature': {
    shape: 'heptagon',
    background: '#cffafe',         // 柔湖青
    backgroundDark: '#a5f3fc',
    defaultStroke: 'auto',
    label: '作用特点',
    description: '作用特点/临床用药评价/选药原则',
  },
  // ── 不良反应/禁忌 ────────────────────────────────────────────────────────
  // triangle：三角形，警示感
  'cls-adverse': {
    shape: 'triangle',
    background: '#ffe4e6',         // 柔玫瑰粉
    backgroundDark: '#fecdd3',
    defaultStroke: 'auto',
    label: '不良反应',
    description: '典型不良反应/禁忌/毒性',
  },
  // ── 抽象概念/总论 ────────────────────────────────────────────────────────
  // round-triangle：圆角三角形，柔化抽象感
  'cls-concept': {
    shape: 'round-triangle',
    background: '#e0e7ff',         // 柔雾紫蓝
    backgroundDark: '#c7d2fe',
    defaultStroke: 'auto',
    label: '概念',
    description: '定义性概念/总论/术语',
  },
  // ── 总结 ──────────────────────────────────────────────────────────────────
  // bottom-round-rectangle：下圆矩形，像"汇总底栏"
  'cls-summary': {
    shape: 'bottom-round-rectangle',
    background: '#fef9c3',         // 柔麦穗黄
    backgroundDark: '#fef08a',
    defaultStroke: 'glow',
    label: '总结',
    description: '节内总结/跨节大总结/表格',
  },
  // ── 口诀 ──────────────────────────────────────────────────────────────────
  // tag：标签形，像"附加的口诀便签"
  'cls-mnemonic': {
    shape: 'tag',
    background: '#fed7aa',         // 柔蜜桃橙
    backgroundDark: '#fdba74',
    defaultStroke: 'auto',
    label: '口诀',
    description: '记忆口诀/顺口溜',
  },
};

// ── 旧字段兼容：essence → fill 映射表 ──────────────────────────────────────
// 保留向后兼容，新的 fill 配置优先

export const ESSENCE_TO_FILL: Record<string, string> = {
  module: 'cls-structure',
  'strict-class': 'cls-classification',
  'umbrella-class': 'cls-classification',
  concept: 'cls-concept',
  medication: 'cls-drug',
  drug: 'cls-drug',
  illness: 'cls-disease',
  notion: 'cls-feature',   // notion 映射到 feature（部分 notion 是不良反应，用 cls-adverse）
  mnemonic: 'cls-mnemonic',
  summary: 'cls-summary',
  table: 'cls-summary',
  note: 'cls-feature',
  // 预留
  'cls-disease': 'cls-disease',
  'cls-biomolecule': 'cls-biomolecule',
};

// ── 旧字段兼容：essence → 形状/颜色（保留给 renderer.ts 使用）────────────────

/** @deprecated 使用 FILL_CONFIG 代替 */
export const NODE_TYPE_SHAPE: Record<string, string> = {
  module: 'round-rectangle',
  'strict-class': 'pentagon',
  'umbrella-class': 'hexagon',
  concept: 'rectangle',
  medication: 'ellipse',
  drug: 'ellipse',
  illness: 'diamond',
  notion: 'tag',
  mnemonic: 'vee',
  summary: 'octagon',
};

/** @deprecated 使用 FILL_CONFIG['cls-drug'].background 代替 */
export const NODE_TYPE_COLOR: Record<string, string> = {
  module: '#fafafa',
  'umbrella-class': '#fde68a',
  'strict-class': '#fef9c3',
  concept: '#67e8f9',
  medication: '#fb923c',
  drug: '#7dd3fc',
  illness: '#fca5a5',
  notion: '#d8b4fe',
  mnemonic: '#86efac',
  summary: '#f9a8d4',
  default: '#94a3b8',
};

/** @deprecated 使用 FILL_CONFIG['cls-drug'].backgroundDark 代替 */
export const NODE_TYPE_COLOR_DARK: Record<string, string> = {
  module: '#e5e7eb',
  'umbrella-class': '#d97706',
  'strict-class': '#ca8a04',
  concept: '#0891b2',
  medication: '#ea580c',
  drug: '#0284c7',
  illness: '#dc2626',
  notion: '#9333ea',
  mnemonic: '#16a34a',
  summary: '#db2777',
  default: '#64748b',
};

/** @deprecated 使用 FILL_CONFIG 代替 */
export const ESSENCE_LABEL: Record<string, string> = {
  module: '模块',
  'strict-class': '细分类',
  'umbrella-class': '粗分类',
  concept: '概念',
  medication: '重点药',
  drug: '普通药',
  illness: '疾病',
  notion: '认知',
  mnemonic: '口诀',
  summary: '总结',
};

// ── 边框色计算函数 ───────────────────────────────────────────────────────────

/** 中心节点边框色（视觉锚，不参与光谱） */
const CENTER_BORDER_COLOR = '#f59e0b';

/**
 * 计算节点的实际边框色。
 *
 * 完整链路（按优先级）：
 *   1. stroke 显式声明（flow/glow）→ STROKE_CONFIG[stroke].color
 *   2. stroke = auto + subtreeRoot 存在 → subtreeRoot 色
 *   3. stroke = auto + 无 subtreeRoot → FILL_BORDER_HINTS[fill]（fill 兜底）
 *   4. stroke = fallback（不论有无 subtreeRoot）→ FILL_BORDER_HINTS[fill]
 *   5. 节点连 fill 都没有 → FILL_BORDER_DEFAULT
 */
export function getBorderColor(
  stroke: string | undefined,
  subtreeRoot: string | undefined,
  depth: number | undefined,
  fill?: string,  // ← 新增：节点 fill，决定 fallback 兜底色
): string {
  // 1. stroke 显式声明（flow/glow）
  if (stroke && stroke !== 'auto' && stroke !== 'fallback') {
    const cfg = STROKE_CONFIG[stroke as StrokeType];
    if (cfg && cfg.color !== 'inherit') {
      return cfg.color;
    }
  }

  // 4. stroke = fallback → 直接用 fill 兜底，跳过 subtreeRoot
  if (stroke === 'fallback') {
    return FILL_BORDER_HINTS[fill ?? ''] ?? FILL_BORDER_DEFAULT;
  }

  // 2. auto + subtreeRoot 存在 → subtreeRoot 色
  if (subtreeRoot) {
    return getSubtreeBorderColor(subtreeRoot);
  }

  // 3. auto + 无 subtreeRoot → fill 兜底
  return FILL_BORDER_HINTS[fill ?? ''] ?? FILL_BORDER_DEFAULT;
}

/** 获取 stroke 的线型（solid/dashed）*/
export function getBorderStyle(stroke: string | undefined): 'solid' | 'dashed' {
  if (stroke) {
    const cfg = STROKE_CONFIG[stroke as StrokeType];
    if (cfg) return cfg.lineStyle;
  }
  return 'solid';
}

/** 获取 stroke 的特效（flow/glow）*/
export function getBorderEffect(stroke: string | undefined): 'flow' | 'glow' | undefined {
  if (stroke) {
    const cfg = STROKE_CONFIG[stroke as StrokeType];
    return cfg?.effect;
  }
  return undefined;
}

// ── Subtree 色（自动计算，保留现有逻辑）─────────────────────────────────────

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
      animate: 'end',
      animationDuration: 600,
      fit: false,
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

// ── FILL_BORDER_HINTS ───────────────────────────────────────────────────────
// fill 的**默认边框色**。当 stroke='auto' 且节点无 subtreeRoot 时，渲染器按
// FILL_BORDER_HINTS[fill] 取边框色（替代旧的 depth 灰阶 fallback）。
//
// 设计原则：每个 fill 的边框色与背景色系协调、取同一色相的中等明度版本，
// 既保持"色块是这类内容"的视觉记忆，又不抢主体内容。
//
// 完整 stroke 链路：
//   - stroke 显式填写（flow/glow）→ STROKE_CONFIG[stroke].color
//   - stroke='auto' + 有 subtreeRoot → subtreeRoot 色
//   - stroke='auto' + 无 subtreeRoot → FILL_BORDER_HINTS[fill]
//
// 修改此表会直接影响 stroke=auto 节点的边框色。如需自定义，优先改 STROKE_CONFIG，
// 此表作为"按 fill 类型给的中性边框"。
export const FILL_BORDER_HINTS: Record<string, string> = {
  'cls-structure':       '#c89b8a',  // 浅棕（柔奶杏粉背景的中等明度版）
  'cls-classification':  '#c9a06a',  // 莫兰迪棕黄
  'cls-drug':            '#7aa8d9',  // 浅蓝
  'cls-disease':         '#e89bb8',  // 浅粉
  'cls-biomolecule':     '#6dbfa0',  // 浅绿
  'cls-feature':         '#7db8c4',  // 浅青
  'cls-adverse':         '#d4868f',  // 浅玫
  'cls-concept':         '#818cf8',  // 浅紫
  'cls-summary':         '#c9b96a',  // 浅黄
  'cls-mnemonic':        '#d4884e',  // 浅橙
};

// FILL_BORDER_HINTS 没列到的 fill 时使用此兜底色（节点连合法 fill 都没有的情况）
export const FILL_BORDER_DEFAULT = '#9ca3af';

export const DEFAULT_LAYOUT = 'euler';
