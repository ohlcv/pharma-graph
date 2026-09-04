// src/core/renderer.ts
// Cytoscape instance management — pure renderer, no config duplication.
// All visual configuration comes from config.ts (single source of truth).

import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import dagre from 'cytoscape-dagre';
import euler from 'cytoscape-euler';
import { GraphData } from './graph.js';
import {
  NODE_TYPE_SHAPE,
  NODE_TYPE_COLOR,
  NODE_TYPE_COLOR_DARK,
  EDGE_TYPE_STYLE,
  getSubtreeBorderColor,
  LAYOUTS,
  LayoutConfig,
  DEFAULT_LAYOUT,
} from './config.js';

cytoscape.use(coseBilkent);
cytoscape.use(dagre);
cytoscape.use(euler);

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
} as const;

// ── Stylesheet (computed once at module load) ───────────────────────────────────

// 视觉层级（从上到下依次展开）：
//   ① 节点基础样式（默认椭圆、权重决定大小、文字底对齐）
//   ② essence → 形状 + 填充色（节点本质；9 种颜色一一对应）
//   ③ depth → 边框色（思维导图结构深度，0=中心节点）
//   ④ 边、选中/悬停等交互状态

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLESHEET: (maxDepth: number, subtreeColorMap: Record<string, string>) => any[] = (maxDepth, subtreeColorMap) => {
  // Default fill when an essence has no explicit color mapping (safety net;
  // every essence defined in config.ts has its own color, so this only fires
  // for legacy/missing values). Halo/glow was removed in Batch G —
  // cytoscape's underlay can only be ellipse or round-rectangle and looks
  // inconsistent across node shapes.
  const ESSENCE_DEFAULT_FILL = '#f8fafc';

  // Essence 规则 — 形状 + 填充色（节点本质；9 种颜色一一对应）
  const nodeTypeRules = Object.entries(NODE_TYPE_SHAPE).map(([key, shape]) => ({
    selector: `node[essence = "${key}"]`,
    style: {
      shape: shape as cytoscape.Css.NodeShape,
      'background-color': NODE_TYPE_COLOR[key] ?? ESSENCE_DEFAULT_FILL,
    },
  }));

  // Depth 规则 — 边框色（只覆盖**没有** subtreeRoot 的节点，作为中性灰 fallback）
  //
  // 改回去之前的两套光谱，原因是：subtree 色环已经表达"分类归属"，
  // 没有 subtreeRoot 的节点用什么色都不该再传达"depth 信息"——depth 只
  // 是渲染时凑巧有的字段，并不携带用户可感知的语义。
  // 这里用 slate-灰阶：depth 越大灰越浅，让"靠近中心"的节点视觉权重自然高。
  const NEUTRAL_FALLBACK_BORDER: Record<number, string> = {
    0: '#f59e0b', // 金色锚（中心节点，无论有无 subtreeRoot 都保留）
    1: '#64748b',
    2: '#94a3b8',
    3: '#cbd5e1',
    4: '#e2e8f0',
    5: '#f1f5f9',
  };
  const depthRules = [];
  for (let d = 0; d <= maxDepth; d++) {
    const color = NEUTRAL_FALLBACK_BORDER[d] ?? '#cbd5e1';
    depthRules.push({
      // [!subtreeRoot] 表示"未分配子树"的节点；中心节点 (d=0) 例外，
      // 即使有子树也是金色锚——所以单独写一条规则
      selector: d === 0
        ? `node[depth = 0]`
        : `node[depth = ${d}][!subtreeRoot]`,
      style: { 'border-color': color, 'border-width': 2 },
    });
  }

  // edge-type rules — 让边自带"源亮 → 目的暗"的渐变, 但 cytoscape 的
  // `line-gradient-stop-colors` 接受空格分隔的多颜色 token, 且
  // color 解析走 util.color2tuple() — 它只支持 6 位 hex / rgb() /
  // rgba().  *不允许 stop 各自 alpha*, 所以源亮目的暗必须用**两个
  // 不同 hex** (lightColor 和 darkColor).
  const darken = (hex: string, amount: number) => {
    const h = hex.replace('#', '');
    const r = Math.max(0, parseInt(h.slice(0, 2), 16) - amount);
    const g = Math.max(0, parseInt(h.slice(2, 4), 16) - amount);
    const b = Math.max(0, parseInt(h.slice(4, 6), 16) - amount);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const edgeTypeRules = Object.entries(EDGE_TYPE_STYLE).map(([type, s]) => {
    // 对称关系（disjoint_with / equivalent_to）渲染为双向
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
        'text-background-color': 'rgba(15,17,23,0.82)',
        'text-background-shape': 'roundrectangle',
        'text-background-padding': '3px',
        // No underlay halo — cytoscape 3.20+ underlay can only be
        // round-rectangle or ellipse (per `underlay-shape` enum), which
        // doesn't track per-node shapes (hexagon / star / tag etc.) and
        // looks inconsistent. Halo was removed in Batch G; we lean on
        // border-color + opacity for the visual emphasis instead.
        'border-width': 1.5,
        'border-color': '#475569',
        'background-color': ESSENCE_DEFAULT_FILL,
        'background-fill': 'solid',
        'background-blacken': 0,
        shape: 'ellipse',
        'text-events': 'yes',
        // Stagger entrance: when the `.entering` class is removed, opacity
        // fades back in over ~280ms with ease-out. Width/height are NOT
        // transitioned (cy's transition machinery doesn't scale up node
        // radii smoothly without layout races — see anim-pulse.ts for
        // the dedicated width/height pipeline).
        'transition-property': 'opacity, border-color, border-width, background-color',
        'transition-duration': '280ms',
        'transition-timing-function': 'ease-out',
      },
    },
    // ② depth 边框色（思维导图结构深度，0=中心节点）
    ...depthRules,
    // ②.b subtree 边框色（按分类子树统一色，优先于 depth 色）
    // 一棵子树（其分类根及所有后代）共享一个色。每个分类根 id → 一个色。
    ...Object.entries(subtreeColorMap).map(([rootId, color]) => ({
      selector: `node[subtreeRoot = "${rootId}"]`,
      style: { 'border-color': color },
    })),
    // ③ essence 形状 + 填充色（节点本质决定）
    ...nodeTypeRules,
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
        // cytoscape 3.34 仅支持 node background gradient 的 direction;
        // edge 的 line-fill gradient 方向永远沿 source→target 走, 所以
        // 只设 stop-colors 与 stop-positions 即可, 不设 direction.
        'line-fill': 'linear-gradient',
        'line-gradient-stop-positions': '0% 100%',
        'line-gradient-stop-colors': 'rgba(100,116,139,0.55) rgba(100,116,139,0.15)',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': 'rgba(100,116,139,0.45)',
        'arrow-scale': 0.7,
        opacity: 0.85,
        'haystack-radius': 0,
        // Edge entrance: when the `.entering` class is removed on a per-edge
        // delay, opacity eases 0 → 0.85 over 400ms. Matches the wider node
        // stagger so the graph "lights up like a constellation" rather
        // than popping on as a static network.
        'transition-property': 'line-color, opacity, width, target-arrow-color',
        'transition-duration': '400ms',
        'transition-timing-function': 'ease-out',
      },
    },
    // 边类型样式
    ...edgeTypeRules,
    // ── 交互状态 ──────────────────────────────────────────────────────────────
    // .selected-node, .hovered, .highlighted are defined above with
    // overlay-* support (cytoscape 3.20+). Don't redefine them here —
    // duplicate selectors work but bloat the stylesheet.
    {
      selector: '.dimmed',
      style: {
        opacity: 0.1,
        'border-color': 'rgba(255,255,255,0.06)',
        'text-background-color': 'rgba(15,17,23,0.5)',
        'line-color': 'transparent',
        'line-opacity': 0.1,
        'source-arrow-color': 'transparent',
        'target-arrow-color': 'transparent',
        color: 'rgba(226,232,240,0.25)',
      },
    },
    { selector: '.entering', style: { opacity: 0 } },
    // Hover / select / highlight all use border-color + border-width
    // (Batch G). overlay-* and underlay-* were both removed because
    // cytoscape's overlay/underlay-shape only supports round-rectangle
    // and ellipse, which look inconsistent on the 8 essence shapes
    // (hexagon, star, tag, etc.). Border tracks the node shape exactly.
    {
      selector: '.hovered',
      style: {
        opacity: 1,
        'border-width': 3,
        'border-color': '#818cf8', // indigo-400
      },
    },
    {
      // 选中节点 + 邻居高亮共用边框色 + opacity 增强。
      // 原来两套规则（.selected-node / .highlighted）除了 border-width 差 1px
      // 完全重复，合并成一套：border-width: 4，邻居也变粗一点（视觉上邻居
      // 和选中节点统一，参考 A1 方案「中性化」思路）。
      selector: '.selected-node, .highlighted',
      style: {
        opacity: 1,
        'border-width': 4,
        'border-color': '#fbbf24', // amber-400
      },
    },
    {
      selector: '.highlighted',
      style: {
        opacity: 0.95,
      },
    },
    {
      selector: '.highlighted-edge',
      style: {
        opacity: 1,
        width: 2.5,
        'line-color': '#fbbf24',
        'target-arrow-color': '#fbbf24',
        'text-background-color': 'rgba(15,17,23,0.85)',
        'text-background-shape': 'roundrectangle',
        'text-background-padding': '2px 4px',
        label: 'data(reason)',
        'font-size': 10,
        color: '#f1f5f9',
        'text-margin-y': 8,
      },
    },
    {
      selector: '.pulse',
      style: {
        // width/height intentionally omitted — anim-pulse.ts animates them via
        // inline styles using the base formula, then clears them at end.
        // border is what makes the pulse visually obvious.
        'border-width': 2.5,
        'border-color': '#fbbf24',
      },
    },
    {
      selector: '.dragging-simplified',
      style: {
        'border-width': 1,
        'border-color': 'rgba(255,255,255,0.06)',
        'text-background-color': 'rgba(0,0,0,0)',
      },
    },
    {
      selector: '.dimmed.dragging-simplified',
      style: {
        opacity: 0.22,
        'border-color': 'rgba(255,255,255,0.06)',
        'border-width': 1,
        'text-background-color': 'rgba(15,17,23,0.5)',
        'line-opacity': 0.08,
        color: 'rgba(226,232,240,0.25)',
      },
    },
    {
      selector: '.tour-path-preview',
      style: {
        width: 2,
        'line-color': '#fbbf24',
        'target-arrow-color': '#fbbf24',
        opacity: 0.85,
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
}

// ── Renderer ──────────────────────────────────────────────────────────────────

export class Renderer {
  private cy: cytoscape.Core;
  private currentLayout = DEFAULT_LAYOUT;
  private layoutConfigs: Record<string, LayoutConfig>;
  private currentLayoutInstance: cytoscape.Layouts | null = null;
  private maxDepth: number;
  private subtreeColorMap: Record<string, string> = {};

  constructor(options: RendererOptions) {
    const {
      container,
      data,
      layoutName = DEFAULT_LAYOUT,
      layoutConfigs = LAYOUTS,
      minZoom = 0.2,
      maxZoom = 4.0,
      maxDepth = 6,
    } = options;
    this.maxDepth = maxDepth;

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
      renderer: { name: 'canvas' } as unknown as { name: string },
      minZoom,
      maxZoom,
      wheelSensitivity: 3.0,
      boxSelectionEnabled: true,
      autounselectify: false,
      autoungrabify: false,
      // 将 devicePixelRatio 限制在 2 以内，避免高分屏上 Canvas 像素过多导致内存占用过高
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    };
    this.cy = cytoscape(cyOptions);

    this.runLayout(layoutName);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  render(data: GraphData, layoutName?: string): void {
    this.cy.elements().remove();
    this.cy.add(this.buildElements(data));
    this.runLayout(layoutName ?? this.currentLayout);
  }

  destroy(): void {
    this.cy.destroy();
  }

  fit(): void {
    this.cy.fit(undefined, 50);
  }

  getCy(): cytoscape.Core {
    return this.cy;
  }

  runLayout(name: string, overrides?: Record<string, unknown>): void {
    this.currentLayout = name;
    const preset = this.layoutConfigs[name]?.cytoscape;
    const base = preset ? { ...preset } : {};
    if (overrides) Object.assign(base, overrides);
    if (!base.name) (base as Record<string, unknown>).name = name;

    const nodes = this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`);

    nodes.addClass(CLASSES.ENTERING);
    this.cy.edges().addClass(CLASSES.ENTERING);

    nodes.forEach((node: cytoscape.NodeSingular, i: number) => {
      const delay = 80 + i * 16;
      setTimeout(() => {
        node.removeClass(CLASSES.ENTERING);
      }, delay + 300);
    });

    const edgeDelay = 80 + nodes.length * 16 + 150;
    this.cy.edges().forEach((edge: cytoscape.EdgeSingular, i: number) => {
      setTimeout(
        () => {
          edge.removeClass(CLASSES.ENTERING);
        },
        edgeDelay + i * 10 + 200,
      );
    });

    this.currentLayoutInstance?.stop();
    const layoutInstance = this.cy.layout(base as unknown as cytoscape.LayoutOptions);
    layoutInstance.run();
    // Re-resolve after layout settles — nodes may have shifted to overlapping positions
    this.resolveOverlaps();
  }

  currentLayoutName(): string {
    return this.currentLayout;
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

  private buildElements(data: GraphData) {
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    return [
      ...data.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label || n.id,
          essence: n.essence || 'default',
          depth: n.depth,
          subtreeRoot: n.subtreeRoot,
          shortSummary: n.shortSummary,
          fullSummary: n.fullSummary,
          summary: n.summary,
          location: n.location,
          tags: n.tags ?? [],
          body: n.body,
          weight: n.weight ?? 60,
          color: n.essence
            ? (NODE_TYPE_COLOR[n.essence] ?? NODE_TYPE_COLOR.default)
            : NODE_TYPE_COLOR.default,
          colorDark: n.essence
            ? (NODE_TYPE_COLOR_DARK[n.essence] ?? NODE_TYPE_COLOR_DARK.default)
            : NODE_TYPE_COLOR_DARK.default,
        },
      })),
      ...data.edges
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e, idx) => ({
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
