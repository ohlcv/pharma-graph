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
import { EDGE_TYPES, type EdgeType } from './edge-types.js';

// ── Essence → visual style（节点本质决定形状）──────────────────────────────────
// 8 种本质，与 frontmatter.md 的 essence 枚举一一对应

export const NODE_TYPE_SHAPE: Record<string, string> = {
  concept: 'octagon', // 概念 — 八边形，分类聚集
  medication: 'ellipse', // 具体药物或制剂 — 圆形，规整具体
  illness: 'diamond', // 疾病或病理状态 — 菱形，警示感强
  route: 'triangle', // 信号通路、受体家族 — 三角形，方向汇聚
  substance: 'pentagon', // 成分、辅料、指标 — 五边形，化学基础感
  process: 'star', // 过程、机制、体内行为 — 星形
  module: 'round-rectangle', // 模块、入口、章节 — 圆角矩形，结构感
  section: 'tag', // 标签型知识点 — 标签形，入口标识
};

export const NODE_TYPE_COLOR: Record<string, string> = {
  concept: '#818cf8', // 靛蓝 — 概念
  medication: '#67e8f9', // 青色 — 具体药物或制剂
  illness: '#fca5a5', // 浅红 — 疾病或病理状态
  route: '#22d3ee', // 青色 — 信号通路、受体家族
  substance: '#c4b5fd', // 紫色 — 成分、辅料、指标
  process: '#f87171', // 红色 — 过程、机制、体内行为
  module: '#67e8f9', // 青色 — 模块、入口、章节
  section: '#d1d5db', // 淡灰 — 标签型知识点
  default: '#94a3b8', // 未知类型的兜底色
};

export const NODE_TYPE_COLOR_DARK: Record<string, string> = {
  concept: '#4f46e5',
  medication: '#0891b2',
  illness: '#dc2626',
  route: '#0891b2',
  substance: '#7c3aed',
  process: '#dc2626',
  module: '#0891b2',
  section: '#94a3b8',
  default: '#64748b',
};

// ── Essence → 中文标签 ───────────────────────────────────────────────────────

export const ESSENCE_LABEL: Record<string, string> = {
  concept: '概念',
  medication: '药物',
  illness: '疾病',
  route: '通路',
  substance: '成分',
  process: '过程',
  module: '入口',
  section: '标签',
};

// ── Field → 学科领域边框色 ───────────────────────────────────────────────────
// 8 门学科，每门一色，色相间隔清晰
// field 回答"属于哪门学科"——边框色区分学科归属

export const FIELD_COLOR: Record<string, string> = {
  pharmaceutics: '#fb923c', // 橙 — 药剂学
  pharmacokinetics: '#fbbf24', // 黄 — 药代动力学
  medicinal_chemistry: '#34d399', // 绿 — 药物化学
  pharmacology: '#a78bfa', // 紫 — 药理学
  toxicology: '#7c3aed', // 深紫 — 毒理学
  biopharmaceutics: '#fbbf24', // 黄 — 生物药剂学（与药代同族）
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

// ── Tier → 填充色（从大众到稀有）─────────────────────────────────────────────
// tier 回答"在哪一层"——基础层最大众、法规层最稀有
// 填充色辅助识别层次

// `bgColor` is the only visual property tiers control now — halo/glow
// fields were removed in Batch G alongside the underlay styles. Node
// shapes vary (hexagon, star, tag, etc.) and cytoscape's underlay can
// only be ellipse or round-rectangle, so a uniform halo looked
// inconsistent across essence types.
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
// Style lookup keyed by EdgeType. The `default` entry is a *separate*
// fallback for unknown type strings the runtime may encounter — it is
// NOT part of the canonical vocabulary (see edge-types.ts).

export const EDGE_TYPE_STYLE: Record<string, { color: string; lineStyle: string; arrow: string }> =
  {
    // 结构与组成
    has: { color: '#95a5a6', lineStyle: 'solid', arrow: 'none' },
    isa: { color: '#4a90e2', lineStyle: 'solid', arrow: 'triangle' },
    // 药理机制
    activates: { color: '#27ae60', lineStyle: 'solid', arrow: 'triangle' },
    inhibits: { color: '#c0392b', lineStyle: 'solid', arrow: 'tee' },
    mechanism: { color: '#e27c3e', lineStyle: 'solid', arrow: 'triangle' },
    metabolizes: { color: '#8e44ad', lineStyle: 'solid', arrow: 'triangle' },
    // 临床关联
    treats: { color: '#2ecc71', lineStyle: 'solid', arrow: 'triangle' },
    causes: { color: '#e74c3c', lineStyle: 'solid', arrow: 'triangle' },
    interacts: { color: '#f39c12', lineStyle: 'dashed', arrow: 'none' },
    contraindicates: { color: '#c0392b', lineStyle: 'dashed', arrow: 'none' },
    // 学习路径
    prerequisite: { color: '#9b59b6', lineStyle: 'dotted', arrow: 'triangle' },
    relates: { color: '#7f8c8d', lineStyle: 'dashed', arrow: 'none' },
    sibling: { color: '#16a085', lineStyle: 'dotted', arrow: 'none' },
    // 结构语义（知识组织）
    contains: { color: '#95a3b8', lineStyle: 'solid', arrow: 'triangle' },
    part_of: { color: '#4a90e2', lineStyle: 'solid', arrow: 'triangle' },
    has_couplet: { color: '#f39c12', lineStyle: 'dashed', arrow: 'none' },
    describes: { color: '#f39c12', lineStyle: 'dashed', arrow: 'none' },
    specializes: { color: '#27ae60', lineStyle: 'dotted', arrow: 'triangle' },
    default: { color: '#bdc3c7', lineStyle: 'solid', arrow: 'none' },
  };

// ── Edge type → 中文标签 ─────────────────────────────────────────────────────
// Single source of truth: 详情面板、图例、节点关联都查这里。
// Keys must be a subset of EDGE_TYPES; the validator (validate.ts) reads
// the canonical list from edge-types.ts so these two cannot drift.

export const EDGE_TYPE_LABEL: Record<EdgeType, string> = {
  has: '包含',
  isa: '属于',
  activates: '激动',
  inhibits: '抑制',
  mechanism: '机制',
  metabolizes: '代谢',
  treats: '治疗',
  causes: '致因',
  interacts: '相互作用',
  contraindicates: '禁忌',
  prerequisite: '前置',
  relates: '相关',
  sibling: '兄弟',
  // 结构语义（知识组织）
  contains: '包含',
  part_of: '属于',
  has_couplet: '含口诀',
  describes: '描述',
  specializes: '专治',
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
      // Issue (清单 §12.1): 在 224 节点密度下 quality='default' 的自适应冷却
      // 经常过早收敛（节点仍有重叠就停）。proof 模式使用固定 numIter 迭代
      // （无自适应冷却），5000 次配合弱弹簧 0.45 + 高斥力 80000 + 中心重力
      // 0.05 让重叠率从 1.07% 降到 0.08%（probe: scripts/measure-overlap.ts
      // 的旧草稿版本）。
      numIter: 5000,
      quality: 'proof',
      tile: true,
      tilingPaddingVertical: 30,
      tilingPaddingHorizontal: 30,
      fit: true,
      padding: 100,
      nodeDimensionsIncludeLabels: true,
      // minNodeSpacing / avoidOverlap 是 cytoscape core 内置 cose 的字段，
      // cose-bilkent 不读（src/index.js:84-122 的 getUserOptions 不出现这两个 key），
      // cytoscape core 也不对扩展布局跑 layoutPositions 后处理。这里保留仅为
      // 兼容旧 cytoscape 内置 cose（项目已弃用）。
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
      // Issue (清单 §5): 图谱有 relates/sibling/interacts 等对称边，
      // 以及 treats 同对多向引用；默认 undefined 时 dagre 遇到环会直接报错。
      // 'greedy' 让 dagre 先用贪心策略去掉反馈弧，再做层次布局。
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
      // Issue (清单 §7): cytoscape-euler 读 springCoeff 不读 springStrength。
      // 之前 slider 改值无效（key 名错），且 default=0.02 比官方 0.0008 大 25 倍。
      // optFn 接受标量与函数两种值（euler/index.js:34-40），slider 写数字合入
      // 后 euler 会在每条边上直接用作弹簧系数。
      //
      // Issue (清单 §12.3): springCoeff 调到 0.0002 才能让 bbox 接近 COSE 的
      // 2695×2962（0.0005 / 0.0008 时 bbox 都 ≤ 2500）。0.0001 时虽然 overlap
      // 0 但 bbox 3700+ 过大（满天星）。0.0002 是甜点位。
      // §12.5 (2026-07): 滑块范围 0.0001~0.01 → 0.00005~0.05 让用户探索极端
      // 值（小到接近 0 即"无弹簧"、大到 0.05 让图高度黏着）。
      {
        key: 'springCoeff',
        label: '弹簧系数',
        min: 0.00005,
        max: 0.05,
        step: 0.0001,
        default: 0.0002,
        description: '胡克定律系数（springCoeff）。值越大弹簧越紧。0.0001-0.0003 适合稀疏布局。',
      },
      // §12.5 (2026-07): springLength 50~500 → 20~1000,N=10 winner=140
      // 仍在合法区。允许拉到 20 模拟"边长极小"全图聚集,或拉到 1000 模拟
      // "边长极大"大散点稀疏网。
      { key: 'springLength', label: '弹簧长度', min: 20, max: 1000, step: 5, default: 140 },
      // Issue (清单 §7/§12.1/§12.3): euler 默认 gravity = -1.2（负值斥力）。原
      // min/max 全为正。2026-07 三轮 probe 显示 euler 在 224 节点下要同时
      // 拿到 0% overlap + COSE 量级 bbox (2700×3000) 必须用 gravity=-15 +
      // springCoeff=0.0002 + pull=0（关闭默认 0.001 中心引力）。单改 gravity
      // 即使推到 -40 也只能让 bbox ~3000，但 overlap 仍 ≥ 0.3%。
      //
      // §12.5: gravity -30~0 → -100~5,允许探索极限斥力(>30)或反向"吸力
      // 主导"(>0)用 max=5 反向吸。
      {
        key: 'gravity',
        label: '重力（斥力）',
        min: -100,
        max: 5,
        step: 0.5,
        default: -15,
        description: '库仑斥力系数。负数 = 节点互相排斥推开，正数 = 互相吸引（一般不用）。',
      },
      // §12.5: pull 0~0.01 → -0.005~0.05。允许负 pull（centrifugal-like 中心
      // 排斥）和较大正 pull（高强度中心收束）。
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
      // §12.5: refresh 1~100 → 1~200,允许更慢的视觉迭代（适合动画长链）。
      { key: 'refresh', label: '刷新间隔', min: 1, max: 200, step: 1, default: 30 },
      // §12.5: maxIterations 100~10000 → 100~30000,允许超长迭代（10000+
      // 在调试极端参数时收敛更稳）。
      {
        key: 'maxIterations',
        label: '最大迭代',
        min: 100,
        max: 30000,
        step: 100,
        default: 5000,
      },
      // §12.5: maxSimulationTime 500~40000 → 500~120000,从 40s 扩到 2min,
      // 让超过 10000 迭代的场景能跑完。
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
      // 2026-07 §12.4 终极配:N=10 三选手 + COSE head-to-head
      // - springCoeff 0.0002: 弱弹簧保持(无变化,前轮已收)
      // - springLength 140: N=10 均值 overlap=1.6, worst=3, bbox=3122×2869
      //   (vs current default overlap=1.7, worst=4, bbox=2809×3008)
      //   len 140 比 len 100：bbox +11% 接近 COSE 2845×2714,
      //   最差情况从 4 降到 3 (用户首屏重叠体验更可靠)
      // - gravity -15 / pull 0: 沿用 §12.3 配
      // - COSE N=10: overlap=21.3, worst=34  → Euler 比 COSE overlap 低 13×
      springCoeff: 0.0002,
      springLength: 140,
      gravity: -15,
      pull: 0,
      maxIterations: 5000,
      maxSimulationTime: 20000,
    },
  },
};

// 2026-07: change default COSE -> Euler (清单 §12.4). Euler head-to-head:
// COSE    N=10  overlap mean=21.3, worst=34, bbox 2845×2714
// Euler   N=10  overlap mean=1.6,  worst=3,  bbox 3122×2869 (with springLength=140)
// Euler 比 COSE overlap 低 13×，worst 低 11×，首屏加载视觉更稳定。
export const DEFAULT_LAYOUT = 'euler';
