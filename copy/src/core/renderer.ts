// src/core/renderer.ts
// Cytoscape instance management — pure renderer, no config duplication.
// All visual configuration comes from config.ts (single source of truth).

import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import dagre from 'cytoscape-dagre';
import euler from 'cytoscape-euler';
import { GraphData } from './graph.js';
import {
  EDGE_TYPE_STYLE,
  getSubtreeBorderColor,
  LAYOUTS,
  LayoutConfig,
  DEFAULT_LAYOUT,
  FILL_CONFIG,
  FILL_BORDER_HINTS,
  FILL_BORDER_DEFAULT,
  STROKE_CONFIG,
  STROKE_MERGE_MODE,
  SHAPE_BY_OWL2,
  getBorderColor,
  getBorderStyle,
  getBorderEffect,
} from './config.js';
import { GlowOverlay } from './glow-overlay.js';
import { readThemeColors, themeKey } from './theme-colors.js';

cytoscape.use(coseBilkent);
cytoscape.use(dagre);
cytoscape.use(euler);

// ── Label auto-wrap utilities ───────────────────────────────────────────────────

/**
 * Auto-wrap label for node display.
 *
 * Priority (first match wins):
 *   1. '｜' — explicit YAML block scalar separator
 *   2. '第X章' / '第X节' followed by space and more text
 *   3. ASCII '|' — pipe char followed by text
 *   4. Punctuation breakpoints — Chinese/ASCII separators
 *   5. Long text truncation (≥28 chars → first line only, ellipsis)
 *
 * Two-line split lets the chapter/section ordinal ("第一节") sit on its own
 * line above the rest of the label. Returns unchanged if no pattern fires.
 */
export function formatNodeLabel(label: string): string {
  // 1. Explicit block scalar separator (｜ — fullwidth U+FF5C)
  const pipeIdx = label.indexOf('｜');
  if (pipeIdx !== -1) {
    const first = label.slice(0, pipeIdx).trim();
    const rest = label.slice(pipeIdx + 1).trim();
    return `${first}\n${rest}`;
  }

  // 2. Chapter/section ordinal followed by a space and more content
  //    e.g. "第一节 镇咳药" → "第一节\n镇咳药"
  const ordinalMatch = label.match(/^(第[一二三四五六七八九十百零\d]+[章节])\s+(.+)$/);
  if (ordinalMatch) {
    return `${ordinalMatch[1]}\n${ordinalMatch[2]}`;
  }

  // 3. ASCII pipe (manual notation)
  const asciiPipe = label.indexOf('|');
  if (asciiPipe !== -1) {
    const first = label.slice(0, asciiPipe).trim();
    const rest = label.slice(asciiPipe + 1).trim();
    if (first && rest) return `${first}\n${rest}`;
  }

  // 4. Punctuation breakpoints — split at the last separator
  //    Chinese: ，、；：？！…—
  //    ASCII:   ,;:?!...-
  const BREAK_CHARS = '，、；：？！…—、,;:?!…-';
  let splitIdx = -1;
  for (let i = label.length - 1; i >= 0; i--) {
    if (BREAK_CHARS.includes(label[i])) {
      splitIdx = i;
      break;
    }
  }
  if (splitIdx !== -1) {
    const first = label.slice(0, splitIdx).trim();
    const rest = label.slice(splitIdx + 1).trim();
    if (first && rest) return `${first}\n${rest}`;
  }

  // 5. Long text truncation (≥28 chars → keep first 25 + ellipsis)
  //    e.g. "笨蛋儿子坐着三轮去西洋；天长地久很浮夸"
  //         → "笨蛋儿子坐着三轮去西洋；天长…"
  if (label.length >= 28) {
    return label.slice(0, 25) + '…';
  }

  return label;
}

// ── CSS class name constants — exposed for external modules ─────────────────────

export const CLASSES = {
  SELECTED_NODE: 'selected-node',
  DIMMED: 'dimmed',
  HIGHLIGHTED: 'highlighted',
  HIGHLIGHTED_EDGE: 'highlighted-edge',
  HOVERED: 'hovered',
  PULSE: 'pulse',
  ENTERING: 'entering',
  DRAGGING_SIMPLIFIED: 'dragging-simplified',
  TOUR_PATH_PREVIEW: 'tour-path-preview',
  LAYER_PARENT: 'layer-parent',
  // TOUR_PULSING: 漫游当前节点。呼吸强光由 glow-overlay.ts 的强调层绘制，
  //   不再用 rAF 每帧改 cytoscape 样式（那会让整张画布 60fps 重绘）。
  TOUR_PULSING: 'tour-pulsing',
  // ── Neighbor-tug interaction (lightweight "pull" feedback on drag) ──────────
  // NEIGHBOR_TUGGED: added to 1-hop neighbours of a node while it is being
  //   dragged. Drives the CSS transition that nudges neighbours a few px
  //   toward the dragged node (release snaps them back via transition).
  // NEIGHBOR_TUG_ORIGIN_X/Y: stored absolute coordinates each tugged neighbour
  //   was sitting at when the drag started. The tug module writes these as
  //   data attributes so the CSS layer can compute offsets without invoking
  //   JS on every frame (perf: 1100-node graph must NOT animate via JS rAF).
  NEIGHBOR_TUGGED: 'neighbor-tugged',
} as const;

// Ripple fallback colors — used only when a node/edge carries no color of its
// own (graph-events.ts normally passes the node's fill / the edge type's color).
// Getters, not constants: they follow the active theme (accent / accent2).
export const RIPPLE_COLORS = {
  get NODE(): string { return readThemeColors().accent; },
  get EDGE(): string { return readThemeColors().accent2; },
};

// ── Stylesheet (built per Renderer, and again on theme change / new subtree) ────

// 视觉层级（从上到下依次展开）：
//   ① 节点基础样式（默认椭圆、权重决定大小、文字底对齐）
//   ② fill → 形状 + 背景色 + **默认 stroke 兜底**
//   ③ stroke（节点显式 / fill 兜底后） → 边框色 + 效果
//   ④ subtreeRoot → 边框色（stroke=auto 时生效）
//   ⑤ depth → 边框色（无 subtreeRoot 时 fallback）
//   ⑥ 边、选中/悬停等交互状态
//
// fill 兜底逻辑在 buildElements()：节点 stroke 字段未填时按 fill 查 FILL_CONFIG[fill].defaultStroke。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLESHEET: (maxDepth: number, subtreeColorMap: Record<string, string>) => any[] = (maxDepth, subtreeColorMap) => {
  // 交互状态色跟主题走（canvas 样式表写不了 var()，所以在这里读出来）：
  //   accent  → 悬停、glow 兜底；accent2 → 选中 / 高亮 / 脉冲 / 高亮边 / 路径预览。
  // 节点填充、子树边框、边类型色是语义色，保持固定。
  const { accent, accent2 } = readThemeColors();

  // Default fill when a fill has no explicit color mapping (safety net;
  // every fill defined in config.ts has its own color, so this only fires
  // for legacy/missing values).
  const FILL_DEFAULT = '#f8fafc';

  // ── Fill 规则 — 形状 + 背景色 ───────────────────────────────────────────────
  // fill 是领域顶层类，决定默认形状、背景色。
  //
  // 背景从纯色改成径向渐变：FILL_CONFIG 里本来就有 background（亮）和
  // backgroundDark（暗）一对颜色，中心用亮色、边缘落到暗色，节点立刻有体积感，
  // 不再是一片死板的色块。配色没有新增，只是把已有的两个值用起来。
  //
  // 性能：渐变是静态样式，cytoscape 的元素纹理缓存会把每个节点的绘制结果
  // 缓存成一张小位图，同形状同大小同配色的节点共用，所以 1000+ 节点下
  // 增量很小 —— 但这是"很小"不是"零"，上线前用 trace 量一次。
  // 想回退就删掉下面三行 background-* ，留 background-color 即可。
  const fillRules = Object.entries(FILL_CONFIG).map(([fill, cfg]) => ({
    selector: `node[fill = "${fill}"]`,
    style: {
      shape: cfg.shape as cytoscape.Css.NodeShape,
      'background-color': cfg.background,
      'background-fill': 'radial-gradient',
      'background-gradient-stop-colors': `${cfg.background} ${cfg.background} ${cfg.backgroundDark}`,
      // 内 55% 保持纯亮色，外圈才开始压暗 —— 避免整个节点都灰扑扑的。
      'background-gradient-stop-positions': '0% 55% 100%',
      'border-width': 2,
    },
  }));

  // ── Shape (OWL2 实体类型) 规则：显式填写 shape 时覆盖 fill 的默认形状 ──────
  // 每个 OWL2 类型对应一个固定形状（SHAPE_BY_OWL2）。
  // 不填 shape 时使用 fill 的默认形状（可为 FILL_CONFIG 中的扩展形状）。
  const shapeOwlRules = (Object.entries(SHAPE_BY_OWL2) as [string, cytoscape.Css.NodeShape][])
    .map(([owlType, shape]) => ({
      selector: `node[shape = "${owlType}"]`,
      style: { shape },
    }));

  // ── Stroke 规则 — 边框色 + 效果 ────────────────────────────────────────────
  // stroke 显式声明时覆盖 fill/subtreeRoot 的默认边框色。
  // stroke = auto（默认）：边框色由 subtreeRoot 或 depth 自动决定。
  
  // stroke = glow：呼吸光晕
  //
  // 分工：
  //   stylesheet（这里）— 节点本体的 border，静态，参与 cytoscape 的纹理
  //                       缓存，零逐帧成本。
  //   glow-overlay.ts    — 外围呼吸的弥散光 + flow 的旋转光弧，画在独立
  //                       canvas 上，颜色直接读这里渲染出来的 border-color，
  //                       不需要额外的 outline 层。
  //
  // 原来这里还有一圈单独的 outline（静态描边），和 border、覆盖层的呼吸光晕
  // 叠在一起等于同一个节点画了三层边——视觉冗余，删掉，只留 border 一层。
  const glowStrokeRule = {
    selector: `node[stroke = "glow"]`,
    style: {
      'border-color': accent,
      'border-width': 2,
      'border-style': 'solid' as cytoscape.Css.LineStyle,
      'border-opacity': 1,
      // 注意：这里不能再写 border-color 的 transition。
      // glow 现在是所有节点的默认 stroke，这条规则会命中全图节点，而且它写的
      // transition-property 会覆盖基础样式里的 'opacity'。后果有两个：
      //   1) 漫游/点选时节点从 .dimmed（border-color 是近乎纯白的
      //      rgba(255,255,255,0.06)）切到 .selected-node，边框色会在 200ms 内
      //      从白色渐变到主题辅色；glow-overlay 的选中强光每帧读 border-color，
      //      于是整个节点闪一下白（"选中节点瞬间变白"）。
      //   2) 全图变暗时几百个节点同时跑 border-color 插值，违背了基础样式里
      //      "只过渡 opacity"的性能约定。
      // 不写 transition-* 就会继承基础样式的 opacity 过渡，边框色瞬时切换。
    },
  };

  // glow 的 subtreeRoot 颜色规则（动态生成）：有子树时覆盖固定的光晕紫。
  const glowSubtreeRules = Object.entries(subtreeColorMap)
    .filter(([, color]) => color !== '#9ca3af') // 跳过无色/透明
    .flatMap(([rootId, color]) => [
      {
        selector: `node[stroke = "glow"][subtreeRoot = "${rootId}"]`,
        style: { 'border-color': color },
      },
    ]);

  // stroke = double：双线边框。取色完全沿用 auto（子树色/fill 兜底），
  // 只把线型改成 double 并加粗到足够看清两条线。
  const doubleStrokeRule = {
    selector: `node[stroke = "double"]`,
    style: {
      'border-style': 'double' as cytoscape.Css.LineStyle,
      'border-width': 4,
      'border-color': FILL_BORDER_DEFAULT,
    },
  };

  // Fill 边框色 fallback — stroke='auto'/'flow' 或 'fallback' 时按 fill 取色
  //   - stroke='fallback'：不论有无 subtreeRoot，直接用 fill 兜底色
  //   - stroke='auto'/'flow' + 无 subtreeRoot：用 fill 兜底色
  //   - stroke='auto'/'flow' + 有 subtreeRoot：subtreeRoot 色优先（见下面的 subtreeColorMap 规则）
  //   flow 和 auto 共用同一套取色规则——flow 的边框色本来就该等于这个节点
  //   "本应该有"的边框色，只是外面多一圈旋转的光弧，取色逻辑没有理由分叉。
  const fillBorderRules = [
    // ① 节点有合法 fill → 用 FILL_BORDER_HINTS[fill]
    ...Object.entries(FILL_BORDER_HINTS)
      .filter(([, color]) => color && color !== 'transparent')
      .map(([fill, color]) => ({
        selector: `node[fill = "${fill}"][stroke = "fallback"]`,
        style: { 'border-color': color, 'border-width': 2 },
      })),
    ...Object.entries(FILL_BORDER_HINTS)
      .filter(([, color]) => color && color !== 'transparent')
      .map(([fill, color]) => ({
        selector: `node[fill = "${fill}"][!subtreeRoot][stroke = "auto"], node[fill = "${fill}"][!subtreeRoot][stroke = "flow"]`,
        style: { 'border-color': color, 'border-width': 2 },
      })),
    // ② 兜底：节点连 fill 都没有 → 用 FILL_BORDER_DEFAULT
    {
      selector: `node[!fill][stroke = "fallback"]`,
      style: { 'border-color': FILL_BORDER_DEFAULT, 'border-width': 2 },
    },
    {
      selector: `node[!fill][!subtreeRoot][stroke = "auto"], node[!fill][!subtreeRoot][stroke = "flow"]`,
      style: { 'border-color': FILL_BORDER_DEFAULT, 'border-width': 2 },
    },
    // double 复用 auto 的取色逻辑，这里只补颜色——宽度/线型由 doubleStrokeRule 决定。
    ...Object.entries(FILL_BORDER_HINTS)
      .filter(([, color]) => color && color !== 'transparent')
      .map(([fill, color]) => ({
        selector: `node[fill = "${fill}"][!subtreeRoot][stroke = "double"]`,
        style: { 'border-color': color },
      })),
    {
      selector: `node[!fill][!subtreeRoot][stroke = "double"]`,
      style: { 'border-color': FILL_BORDER_DEFAULT },
    },
  ];

  // edge-type rules — 让边自带"源亮 → 目的暗"的渐变
  const darken = (hex: string, amount: number) => {
    const h = hex.replace('#', '');
    const r = Math.max(0, parseInt(h.slice(0, 2), 16) - amount);
    const g = Math.max(0, parseInt(h.slice(2, 4), 16) - amount);
    const b = Math.max(0, parseInt(h.slice(4, 6), 16) - amount);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const edgeTypeRules = Object.entries(EDGE_TYPE_STYLE).map(([type, s]) => {
    const isBidirectional = type === 'disjoint_with' || type === 'equivalent_to';
    return {
      selector: `edge[edgeType = "${type}"]`,
      style: {
        'line-color': s.color,
        'line-fill': 'linear-gradient',
        'line-gradient-stop-positions': '0% 100%',
        'line-gradient-stop-colors': `${s.color} ${darken(s.color, 80)}`,
        'target-arrow-color': s.color,
        'line-style': s.lineStyle as cytoscape.Css.LineStyle,
        'target-arrow-shape': (s.arrow === 'none' ? 'none' : 'triangle') as cytoscape.Css.ArrowShape,
        ...(isBidirectional ? { 'source-arrow-shape': 'triangle' as cytoscape.Css.ArrowShape, 'source-arrow-color': s.color } : {}),
      },
    };
  });

  return [
    // ① 节点基础样式
    //   border 完全由 fill/stroke 规则接管（不再在基础样式里写死 border-width/color）
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        width: 'mapData(weight, 1, 10, 36, 76)',
        height: 'mapData(weight, 1, 10, 36, 76)',
        'font-size': 'mapData(weight, 1, 10, 10, 15)',
        'font-weight': 600,
        color: '#e2e8f0',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 6,
        'text-wrap': 'wrap',
        'text-max-width': '120px',
        // 星图式标注：细描边代替实心背景块。text-outline 只沿字形描边，
        // 不额外画圆角矩形，标签更轻、更贴合"星图标注"的观感。
        'text-outline-width': 2,
        'text-outline-color': 'rgba(15,17,23,0.85)',
        // 缩小到屏幕字号小于 9px 时 cytoscape 直接跳过整个标签绘制，
        // 全图俯视时的重绘成本能掉一大截。
        'min-zoomed-font-size': 9,
        'border-width': 1,
        'border-color': '#475569',
        'background-color': FILL_DEFAULT,
        'background-fill': 'solid',
        'background-blacken': 0,
        shape: 'ellipse',
        'text-events': 'yes',
        // 只过渡 opacity。原来还过渡 border-color / border-width /
        // background-color：一次 highlightNode 会同时改动几百个节点，
        // 每多一个过渡属性就多一路逐帧插值，rendererAnimationStep 会占满
        // 主线程（实测约占单次点击卡顿的一半）。边框和填充色瞬时切换，
        // 视觉上几乎察觉不到，明暗变化仍然是渐变的。
        'transition-property': 'opacity',
        'transition-duration': '180ms',
        'transition-timing-function': 'ease-out',
      },
    },
    // ② fill 形状 + 背景色
    ...fillRules,
    // ②.b shape (OWL2 实体类型) 规则：显式填写时覆盖 fill 的默认形状（最高优先级）
    ...shapeOwlRules,
    // ③ stroke 边框色
    glowStrokeRule,
    // ③.b glow 的 subtreeRoot 颜色（覆盖上面的默认色）
    ...glowSubtreeRules,
    // ③.d double 边框样式（颜色由 fill/subtree 规则补齐）
    doubleStrokeRule,
    // ③.c 显式 stroke 覆盖（stroke=auto/flow 走 subtreeRoot，glow 由上面规则处理）
    // ④ fill 边框色 fallback（stroke=auto/flow 且无 subtreeRoot 时由 fill 决定）
    ...fillBorderRules,
    // ④.b subtree 边框色（stroke=auto/flow 时生效，优先于 depth）
    ...Object.entries(subtreeColorMap).map(([rootId, color]) => ({
      // stroke=auto/flow 时由 subtreeRoot 色接管（包括 fill 兜底的情形）。
      // flow 和 auto 拿同一个颜色源——flow 只是外面多一圈旋转光弧，边框本身
      // 该是什么色不该因为多了个动效就分叉出第二套取色逻辑。
      selector: `node[subtreeRoot = "${rootId}"][stroke = "auto"], node[subtreeRoot = "${rootId}"][stroke = "flow"], node[subtreeRoot = "${rootId}"][stroke = "double"]`,
      style: { 'border-color': color },
    })),
    // 虚拟层父节点
    {
      selector: '.layer-parent',
      style: {
        'background-color': 'rgba(0,0,0,0)',
        'border-width': 0,
        label: '',
        width: 1,
        height: 1,
        padding: 0,
        shape: 'rectangle' as cytoscape.Css.NodeShape,
      },
    },
    // 边默认样式
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': 'rgba(100,116,139,0.45)',
        'line-fill': 'linear-gradient',
        'line-gradient-stop-positions': '0% 100%',
        'line-gradient-stop-colors': 'rgba(100,116,139,0.55) rgba(100,116,139,0.15)',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': 'rgba(100,116,139,0.45)',
        'arrow-scale': 0.7,
        opacity: 0.85,
        'haystack-radius': 0,
        // 边不做过渡。边的数量通常比节点多一个量级，而 `.dimmed` 会同时
        // 改 line-color / line-opacity / target-arrow-color —— 几千条边
        // 同时插值是主线程被打满的主要来源之一。边的明暗只是背景信息，
        // 瞬时切换可以接受。
        'transition-duration': 0,
      },
    },
    // 边类型样式
    ...edgeTypeRules,
    // 注：光晕效果由 stroke="glow" 规则直接控制
    //   - border-width 3 + solid 样式
    //   - overlay-color + overlay-opacity 模拟光晕外圈
    //   - transition-property 让状态变化时平滑过渡
    // ── 交互状态 ─────────────────────────────────────────────────────────────
    {
      selector: '.dimmed',
      style: {
        // 变暗瞬时完成，不做 180ms 淡出：淡出到一半的节点是灰蒙蒙的半透明，
        // 漫游每步都会撞见上一步的节点还"亮着"，看起来很突兀。
        // （cytoscape 用新状态的 transition 配置，所以只影响「进入 dimmed」；
        //  恢复时走基础样式的 180ms 淡入，不受影响。）
        'transition-duration': 0,
        opacity: 0.1,
        'border-color': 'rgba(255,255,255,0.06)',
        'text-outline-color': 'rgba(15,17,23,0.5)',
        'line-color': 'transparent',
        'line-opacity': 0.1,
        'source-arrow-color': 'transparent',
        'target-arrow-color': 'transparent',
        color: 'rgba(226,232,240,0.25)',
      },
    },
    { selector: '.entering', style: { opacity: 0 } },
    {
      selector: '.hovered',
      style: {
        opacity: 1,
        'border-width': 3,
        'border-color': accent,
      },
    },
    {
      selector: '.selected-node, .highlighted',
      style: {
        opacity: 1,
        'border-width': 4,
        'border-color': accent2,
      },
    },
    {
      selector: '.highlighted',
      style: {
        opacity: 0.95,
      },
    },
    // 选中节点瞬时到位，不做 opacity 淡入：它的强光由 glow-overlay 立即画出，
    // 如果节点本体还在从 0.1 淡入，会出现"光先亮、节点后出现"的错位。
    // （cytoscape 用「新状态」的 transition 配置，所以这条只影响进入选中态；
    //  离开选中态走 dimmed/基础样式的 180ms 淡出，不受影响。）
    {
      selector: '.selected-node',
      style: {
        'transition-duration': 0,
      },
    },
    {
      selector: '.highlighted-edge',
      style: {
        opacity: 1,
        width: 2.5,
        'line-color': accent2,
        'target-arrow-color': accent2,
        'text-outline-width': 2,
        'text-outline-color': 'rgba(15,17,23,0.85)',
        label: 'data(reason)',
        'font-size': 10,
        color: '#f1f5f9',
        'text-margin-y': 8,
      },
    },
    {
      selector: '.pulse',
      style: {
        'border-width': 2.5,
        'border-color': accent2,
      },
    },
    {
      selector: '.dragging-simplified',
      style: {
        'border-width': 1,
        'border-color': 'rgba(255,255,255,0.06)',
        'text-outline-width': 0,
      },
    },
    {
      selector: '.dimmed.dragging-simplified',
      style: {
        opacity: 0.22,
        'border-color': 'rgba(255,255,255,0.06)',
        'border-width': 1,
        'text-outline-color': 'rgba(15,17,23,0.5)',
        'line-opacity': 0.08,
        color: 'rgba(226,232,240,0.25)',
      },
    },
    {
      selector: '.tour-path-preview',
      style: {
        width: 2,
        'line-color': accent2,
        'target-arrow-color': accent2,
        opacity: 0.85,
      },
    },
    // ── Neighbor tug (drag-pull feedback) ────────────────────────────────────
    // While a node is being dragged, its 1-hop neighbours get the
    // `.neighbor-tugged` class added by src/ui/neighbor-tug.ts. During the
    // drag we move them with direct `position()` writes (no animation, no
    // rAF — cytoscape Canvas redraws them in the same frame as the dragged
    // node, so neighbours appear to follow the cursor). On release we
    // animate them back to their original positions via `node.animate()`
    // to create the elastic snap-back effect.
    //
    // This selector only owns the visual styling — dim tugged neighbours
    // slightly so they read as "secondary" vs. the node the user is holding.
    // The position animation is handled in JS because cytoscape stylesheet
    // `transition-property` doesn't include `position` in all versions.
    {
      selector: `.${'neighbor-tugged'}`,
      style: {
        opacity: 0.85,
        'border-width': 2,
        'transition-property': 'opacity, border-width, border-color',
        'transition-duration': '180ms',
        'transition-timing-function': 'ease-out',
      },
    },
  ];
};

// ── Options & Types ────────────────────────────────────────────────────────────

export interface RendererOptions {
  container: HTMLElement;
  data: GraphData;
  layoutName?: string;
  layoutConfigs?: Record<string, LayoutConfig>;
  minZoom?: number;
  maxZoom?: number;
  /** Maximum depth in the graph; if omitted, depth rules cover 0–6 (legacy fallback). */
  maxDepth?: number;
  /**
   * 启用 WebGL 渲染器（cytoscape ≥ 3.31 实验性功能）。
   *
   * WebGL 后端用 sprite sheet 复用 canvas 节点样式，**所有 stroke / border / outline
   * 规则 100% 兼容**——视觉效果与默认 canvas 完全一致，区别只在 GPU 加速性能。
   *
   * 当前评估（2026.9）：
   *   - 代码已合并 1.5+ 年（v3.31 → v3.34.3），稳定存在
   *   - 官方仍未明确宣布 stable（API 默认 false）
   *   - 在 689 节点规模下与 canvas 性能差异肉眼难辨
   *   - 已知不支持：复合节点 z-order 边、复杂箭头形状
   *
   * 建议：默认 false（安全）；节点 > 2000 或拖拽卡顿时切 true。
   */
  webgl?: boolean;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

export interface AddElementsResult {
  /** ids of the nodes newly added to cytoscape. */
  addedNodeIds: string[];
  /** ids of the edges newly added to cytoscape (excluding those that failed). */
  addedEdgeIds: string[];
  /** edges cytoscape rejected (e.g. dangling endpoint) and that were not added. */
  skippedEdges: Array<{ id: string; source: string; target: string; err: string }>;
}

export class Renderer {
  private cy: cytoscape.Core;
  private currentLayout = DEFAULT_LAYOUT;
  private layoutConfigs: Record<string, LayoutConfig>;
  private currentLayoutInstance: cytoscape.Layouts | null = null;
  private maxDepth: number;
  private subtreeColorMap: Record<string, string> = {};
  // stroke=glow 的呼吸光晕 + stroke=flow 的旋转光弧，都画在这一张独立
  // 覆盖层 canvas 上，不参与 cytoscape 的重绘管线。详见 glow-overlay.ts。
  private glowOverlay: GlowOverlay | null = null;
  // 上一次套用样式表时的主题色指纹 + 监听 <html> 主题切换的观察器。
  private appliedThemeKey = '';
  private themeObserver: MutationObserver | null = null;
  // Whether the WebGL renderer is enabled (opt-in via RendererOptions.webgl).
  private useWebgl: boolean = false;

  constructor(options: RendererOptions) {
    const {
      container,
      data,
      layoutName = DEFAULT_LAYOUT,
      layoutConfigs = LAYOUTS,
      minZoom = 0.02,
      maxZoom = 4.0,
      maxDepth = 6,
      webgl = false,
    } = options;
    this.maxDepth = maxDepth;
    this.useWebgl = webgl;

    // Build subtree color map: assign one color per distinct subtreeRoot found
    // across all nodes. Order by first-seen so colors are deterministic.
    // 把 subtreeRoot id 映射到稳定颜色——使用 id 自身的 hash 保证同一棵子树
    // 跨刷新、跨节点遍历顺序都拿到同一个色，避免"调一下文件顺序就全变色"的踩雷。
    for (const n of data.nodes) {
      if (n.subtreeRoot) {
        this.subtreeColorMap[n.subtreeRoot] ??= getSubtreeBorderColor(n.subtreeRoot);
      }
    }

    this.layoutConfigs = layoutConfigs;
    this.currentLayout = layoutName;

    // Canvas renderer: 200+ 节点时比默认 SVG 快 3~5 倍，所有节点/边作为像素绘制而非 DOM 元素，
    // 大幅降低 CPU 绘制开销。Cytoscape API（addClass/removeClass/style）完全兼容，无需改动业务逻辑。
    //
    // cytoscape's TypeScript types don't declare `renderer` on
    // CytoscapeOptions, so we narrow through `unknown` rather than
    // `any`: the value is a `{ name: 'canvas' }` literal at the call
    // site, so a structural cast can't lie to a later reader.
    const cyOptions = {
      container,
      elements: this.buildElements(data),
      style: STYLESHEET(this.maxDepth, this.subtreeColorMap),
      layout: { name: 'preset' },
      // Cast through unknown because cytoscape's `CytoscapeOptions` type
      // omits the `renderer` field (it's only documented in their JS API).
      renderer: {
        name: 'canvas',
        // cytoscape 3.31+ 实验性 WebGL 后端。当 useWebgl=true 时切换。
        // WebGL 复用 canvas sprite sheet 渲染节点 → 样式 100% 兼容（border / outline
        // / dash-offset 动画等都不变），仅获得 GPU 加速。当前默认 false（689 节点规模下
        // canvas 完全够用），节点 > 2000 时建议切 true。
        ...(this.useWebgl ? { webgl: true } : {}),
      } as unknown as { name: string },
      minZoom,
      maxZoom,
      // wheelSensitivity: 3.0  // 默认 1.0 即可（cytoscape 不推荐自定义）
      boxSelectionEnabled: true,
      autounselectify: false,
      autoungrabify: false,
      // 将 devicePixelRatio 限制在 2 以内，避免高分屏上 Canvas 像素过多导致内存占用过高
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      // 注：textureOnViewport / hideEdgesOnViewport 曾经开过，已经关掉。
      // 二者会在拖动/缩放期间把画面冻结成手势开始那一刻的静态截图（边也
      // 直接不画），松手才补一次完整重绘 —— 代价是手势中新进入视野的节点
      // 和所有的边都会消失，观感比省下的那点重绘成本更糟。1000+ 节点还没
      // 到必须用这个换流畅度的规模（官方建议是几千往上、已经明显卡顿时再
      // 开）。如果以后节点数上去了确实卡，再按需打开：
      //   textureOnViewport: true,
      //   hideEdgesOnViewport: true,
      //   motionBlur: false,
    };
    this.cy = cytoscape(cyOptions);
    this.appliedThemeKey = themeKey();
    this.observeTheme();

    // Skip automatic layout when caller passes 'preset' (streaming boot
    // path): cytoscape's preset layout just keeps the position we set
    // on the element, which is exactly what we want before the streaming
    // manifest finishes. The final layout is kicked explicitly from main.ts
    // via `finishStreamingLayout()` so all nodes settle at once.
    if (layoutName !== 'preset') {
      this.runLayout(layoutName);
    }
    this.startGlowAnimations(container);
  }

  /**
   * 启动 stroke=glow / stroke=flow 节点的动效覆盖层。
   *
   * 原实现是一个 rAF 循环，每帧对 `cy.nodes('[stroke="glow"]')` 调
   * `.style('outline-width', ...)`。它有两个问题：
   *
   *   1. 不动。集合是构造时快照一次的，而流式加载路径下构造时图还是空的
   *      （layoutName === 'preset'），`length === 0` 直接 return，rAF 根本没起来。
   *      即使起来了，后续 `cy.add()` 进来的节点也不在那个快照里。
   *   2. 就算修好也不能用。改任何元素的样式都会让 cytoscape 整张画布失效，
   *      于是 1000+ 节点会被 60fps 无限重绘 —— 一个永久占满主线程的任务。
   *
   * 现在改为独立覆盖层 canvas + 自己的 rAF，完全绕开 cytoscape 的重绘。
   * glow 的呼吸光晕和 flow 的旋转光弧都由同一个 GlowOverlay 实例负责，
   * 颜色统一读该节点当前渲染出来的 border-color——所以边框色的取色逻辑
   * 只在 stylesheet 那一处维护，覆盖层不重复判断子树/fill 兜底。
   */
  private startGlowAnimations(container: HTMLElement): void {
    if (!this.cy) return;
    this.stopGlowAnimations();
    this.glowOverlay = new GlowOverlay({ container, cy: this.cy });
    this.glowOverlay.start();
  }

  /**
   * 监听 <html> 上 data-theme（或 theme-x class）的变化，切主题时自动重建样式表。
   * 这样切换主题的入口仍然只是改 <html data-theme="…">，别的模块不需要知道。
   * 只认主题相关的变化：bigscreen / tour-state 等 class 的切换不会触发重建。
   */
  private observeTheme(): void {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const themeClass = (s: string | null): string => /\btheme-[a-z]\b/.exec(s ?? '')?.[0] ?? '';
    const root = document.documentElement;
    this.themeObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const changed =
          m.attributeName === 'data-theme' ||
          (m.attributeName === 'class' && themeClass(m.oldValue) !== themeClass(root.className));
        if (changed) {
          this.refreshTheme();
          return;
        }
      }
    });
    this.themeObserver.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
      attributeOldValue: true,
    });
  }

  /**
   * 主题色变了就重建样式表并让光晕覆盖层重画；没变什么都不做。
   * 切主题时由观察器自动调用，也可以手动调（比如动态改了 --accent）。
   */
  refreshTheme(): void {
    if (this.cy.destroyed()) return;
    const key = themeKey();
    if (key === this.appliedThemeKey) return;
    this.appliedThemeKey = key;
    this.cy.style(STYLESHEET(this.maxDepth, this.subtreeColorMap));
    this.glowOverlay?.redraw();
  }

  /**
   * 停止 glow/flow 覆盖层（在 destroy() 里调用，避免 rAF 在 cytoscape 销毁后继续跑）。
   */
  private stopGlowAnimations(): void {
    this.glowOverlay?.destroy();
    this.glowOverlay = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  render(data: GraphData, layoutName?: string): void {
    this.cy.elements().remove();
    this.cy.add(this.buildElements(data));
    this.runLayout(layoutName ?? this.currentLayout);
    // 覆盖层自己会监听 add/remove，这里只需要让它立刻重新查询集合。
    this.glowOverlay?.refresh();
  }

  /**
   * Incrementally merge a graph snapshot into cytoscape, reusing the exact
   * same element normalization as the constructor (`buildElements`) so the
   * streaming path can never drift from the initial path (stroke fallback,
   * color fields, subtreeRoot, etc.).
   *
   * Also grows `subtreeColorMap` and re-applies the stylesheet when a new
   * subtreeRoot shows up — otherwise streaming nodes would never pick up
   * their `node[subtreeRoot=...]` border-color rule and would fall back to
   * the default border.
   */
  addElements(data: GraphData): AddElementsResult {
    const existingNodeIds = new Set<string>();
    for (const n of this.cy.nodes()) existingNodeIds.add(n.id());
    const existingEdgeIds = new Set<string>();
    for (const e of this.cy.edges()) existingEdgeIds.add(e.id());

    // Grow the subtree color map first so a (re)generated stylesheet below
    // already covers every root present in this batch.
    let subtreeRootsChanged = false;
    for (const n of data.nodes) {
      if (n.subtreeRoot && !(n.subtreeRoot in this.subtreeColorMap)) {
        this.subtreeColorMap[n.subtreeRoot] = getSubtreeBorderColor(n.subtreeRoot);
        subtreeRootsChanged = true;
      }
    }

    const elements = this.buildElements(data);
    const newNodes = elements.filter(
      (el): el is cytoscape.NodeDefinition =>
        el.group === 'nodes' && !existingNodeIds.has(el.data.id ?? ''),
    );
    const newEdges = elements.filter(
      (el): el is cytoscape.EdgeDefinition =>
        el.group === 'edges' && !existingEdgeIds.has(el.data.id ?? ''),
    );

    // Sync global per-node metadata for nodes that are already present.
    // depth / subtreeRoot / weight are recomputed against the full graph on
    // every `buildGraph`, so a node added in an earlier batch would otherwise
    // keep the stale partial-graph values it was born with (e.g. depth=0 →
    // the detail panel shows "中心" for everything).
    this.cy.batch(() => {
      for (const n of data.nodes) {
        const existing = this.cy.getElementById(n.id);
        if (existing.empty()) continue;
        const cur = existing.data();
        if (
          cur.depth !== n.depth ||
          cur.subtreeRoot !== n.subtreeRoot ||
          cur.weight !== n.weight
        ) {
          existing.data({
            depth: n.depth,
            subtreeRoot: n.subtreeRoot,
            weight: n.weight,
          });
        }
      }
    });

    if (newNodes.length > 0) {
      try {
        this.cy.add(newNodes);
      } catch (err) {
        console.warn('[renderer.addElements] failed to add nodes:', err);
      }
    }

    const skippedEdges: AddElementsResult['skippedEdges'] = [];
    for (const el of newEdges) {
      try {
        this.cy.add(el);
      } catch (err) {
        skippedEdges.push({
          id: el.data.id ?? '',
          source: el.data.source,
          target: el.data.target,
          err: String(err),
        });
      }
    }

    // Only re-style when a new subtree root actually appeared — replacing the
    // whole stylesheet is a full restyle and must not run on every batch.
    if (subtreeRootsChanged) {
      this.cy.style(STYLESHEET(this.maxDepth, this.subtreeColorMap));
    }

    return {
      addedNodeIds: newNodes.map((el) => el.data.id ?? ''),
      addedEdgeIds: newEdges
        .filter((el) => !skippedEdges.some((s) => s.id === el.data.id))
        .map((el) => el.data.id ?? ''),
      skippedEdges,
    };
  }

  destroy(): void {
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.stopGlowAnimations();
    this.cy.destroy();
  }

  fit(): void {
    this.cy.fit(undefined, 50);
  }

  getCy(): cytoscape.Core {
    return this.cy;
  }

  /** CSS class name for the entering-animation fade-in (used by main.ts
   *  streaming loader to mark newly-streamed nodes so they fade in
   *  progressively). Mirrors `CLASSES.ENTERING` from internal state. */
  get CLASSES_ENTERING(): string {
    return CLASSES.ENTERING;
  }

  runLayout(
    name: string,
    overrides?: Record<string, unknown>,
    opts?: { skipEntering?: boolean; onLayoutStop?: () => void },
  ): void {
    this.currentLayout = name;
    const preset = this.layoutConfigs[name]?.cytoscape;
    const base = preset ? { ...preset } : {};
    if (overrides) Object.assign(base, overrides);
    if (!base.name) (base as Record<string, unknown>).name = name;
    // 强制关闭 fit：所有布局都不自动 fit，完全由 main.ts 的 setInitialZoom
    // 和用户手动操作（适应/F键）控制摄像头，防止布局的 fit:true 覆盖 zoom。
    (base as Record<string, unknown>).fit = false;
    // 默认打开 animate：让 euler/cose 等模拟退火布局走平滑过渡，
    // 而不是把节点瞬间贴到收敛位置造成"啪"地一下全到位。
    (base as Record<string, unknown>).animate = true;

    const nodes = this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`);
    const nodeCount = nodes.length;

    // `skipEntering` — 给流式加载完结路径用：
    // 因为 streaming 期间已经手动给节点做了"从原点飞出"动画，
    // 此时再叠加 stagger 渐入会和 euler 的位置动画打架。
    if (opts?.skipEntering) {
      // 不做进入动画，只跑布局
    } else if (nodeCount > 500) {
      // 性能优化：当节点数量超过 500 时，简化入场动画
      // 减少 setTimeout 调用次数，避免大量定时器开销
      const batchSize = 50;
      const batches = Math.ceil(nodeCount / batchSize);

      nodes.addClass(CLASSES.ENTERING);
      this.cy.edges().addClass(CLASSES.ENTERING);

      for (let b = 0; b < batches; b++) {
        const batchDelay = b * 100;
        setTimeout(() => {
          const start = b * batchSize;
          const end = Math.min(start + batchSize, nodeCount);
          const batch = nodes.slice(start, end);
          batch.removeClass(CLASSES.ENTERING);
        }, batchDelay);
      }

      // 边在所有节点之后延迟出现
      const totalEdgeDelay = batches * 100 + 300;
      setTimeout(() => {
        this.cy.edges().removeClass(CLASSES.ENTERING);
      }, totalEdgeDelay);
    } else {
      // 小图谱保持原有精细动画
      nodes.addClass(CLASSES.ENTERING);
      this.cy.edges().addClass(CLASSES.ENTERING);

      nodes.forEach((node: cytoscape.NodeSingular, i: number) => {
        const delay = 80 + i * 16;
        setTimeout(() => {
          node.removeClass(CLASSES.ENTERING);
        }, delay + 300);
      });

      const edgeDelay = 80 + nodeCount * 16 + 150;
      this.cy.edges().forEach((edge: cytoscape.EdgeSingular, i: number) => {
        setTimeout(
          () => {
            edge.removeClass(CLASSES.ENTERING);
          },
          edgeDelay + i * 10 + 200,
        );
      });
    }

    this.currentLayoutInstance?.stop();
    const layoutInstance = this.cy.layout(base as unknown as cytoscape.LayoutOptions);
    this.currentLayoutInstance = layoutInstance;
    // Re-resolve after layout settles — nodes may have shifted to overlapping
    // positions once the physical animation has converged. With `animate: true`
    // (the default for euler / cose), layoutInstance.run() returns immediately
    // while the layout is still animating, so we MUST wait for `layoutstop`
    // before reading node positions — otherwise resolveOverlaps would snapshot
    // transient mid-flight positions and produce wrong overlap groups.
    //
    // Listen on the layout INSTANCE rather than `cy` so this callback is bound
    // 1:1 to the just-launched layout. If the user switches layouts mid-flight,
    // the stopped instance may still emit layoutstop, but the identity check
    // below ignores it — no stale resolveOverlaps or completion callback.
    layoutInstance.one('layoutstop', () => {
      // A newer layout may have replaced this one while it was running.
      // Ignore the old instance's stop event: it must not settle the loading
      // state or overwrite overlap data for the active layout.
      if (this.currentLayoutInstance !== layoutInstance) return;
      this.resolveOverlaps();
      opts?.onLayoutStop?.();
    });
    layoutInstance.run();
  }

  currentLayoutName(): string {
    return this.currentLayout;
  }

  /**
   * The currently-running layout instance, or null if no layout is in
   * flight. Used by main.ts to force-stop a layout when the hard timeout
   * fires — `cytoscape.Layouts.stop()` halts the simulation and emits
   * `layoutstop`, which triggers our completion callback with whatever
   * positions the nodes are currently at.
   */
  getCurrentLayoutInstance(): cytoscape.Layouts | null {
    return this.currentLayoutInstance;
  }

  private resolveOverlaps(): void {
    const seen = new Map<string, cytoscape.NodeSingular[]>();
    const nodes = this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`);
    nodes.forEach((n: cytoscape.NodeSingular) => {
      const p = n.position();
      const key = `${Math.round(p.x)},${Math.round(p.y)}`;
      const arr = seen.get(key) ?? [];
      arr.push(n);
      seen.set(key, arr);
    });
    seen.forEach((group) => {
      if (group.length < 2) return;
      group.forEach((n: cytoscape.NodeSingular, i: number) => {
        const angle = (2 * Math.PI * i) / group.length;
        const r = 80;
        n.position({
          x: n.position().x + Math.cos(angle) * r,
          y: n.position().y + Math.sin(angle) * r,
        });
      });
    });
  }

  // ── Element builder ─────────────────────────────────────────────────────────

  private buildElements(data: GraphData): cytoscape.ElementDefinition[] {
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    return [
      ...data.nodes.map((n) => {
        // stroke 字段解析：
        //   - effectiveStroke 决定"边框本体"（线型/颜色）：md 填了就用 md，否则用 defaultStroke
        //   - defaultStroke 是否同时驱动覆盖层特效，由 STROKE_MERGE_MODE 控制：
        //       coexist（默认）→ 单独存 defaultStroke，glow/flow 特效与 md 的 stroke 并存
        //       override        → 不存 defaultStroke，md 的 stroke 完全接管
        const userStroke = n.stroke;
        const defaultStroke = (n.fill && FILL_CONFIG[n.fill]?.defaultStroke) ?? 'auto';
        const effectiveStroke = userStroke ?? defaultStroke;

        // 注：cytoscape stylesheet 中用 stroke="glow" 规则直接控制光晕的
        // border / outline / ghost 属性，无需额外的 class。

        return {
          group: 'nodes' as const,
          data: {
            id: n.id,
            label: formatNodeLabel(n.label) || n.id,
            // 语义层（基于 OWL2）
            fill: n.fill,
            stroke: effectiveStroke,
            ...(STROKE_MERGE_MODE === 'coexist' ? { defaultStroke } : {}),
            shape: n.shape,
            depth: n.depth,
            subtreeRoot: n.subtreeRoot,
            shortSummary: n.shortSummary,
            fullSummary: n.fullSummary,
            summary: n.summary,
            location: n.location,
            tags: n.tags ?? [],
            body: n.body,
            weight: n.weight ?? 60,
            edges_out: n.edges_out ?? [],
            // 颜色（基于 FILL_CONFIG）
            color: FILL_CONFIG[n.fill ?? '']?.background ?? FILL_CONFIG['']?.background ?? '#f9fafb',
            colorDark: FILL_CONFIG[n.fill ?? '']?.backgroundDark ?? FILL_CONFIG['']?.backgroundDark ?? '#94a3b8',
          },
          // Pass through preset position so the 'preset' layout / layoutless
          // init can scatter streaming-arrived nodes without overlapping.
          ...(n.position ? { position: n.position } : {}),
        };
      }),
      ...data.edges
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e, idx) => ({
          group: 'edges' as const,
          data: {
            id: e.id ?? `edge-${idx}`,
            source: e.source,
            target: e.target,
            edgeType: e.type,
            reason: e.reason,
          },
        })),
    ];
  }
}
