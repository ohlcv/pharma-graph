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
  SHAPE_BY_OWL2,
  getBorderColor,
  getBorderStyle,
  getBorderEffect,
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
  // stroke 特效类
  FLOW_BORDER: 'flow-border',
  GLOW_BORDER: 'glow-border',
} as const;

// Ripple colors — single source of truth; both graph-events.ts and
// anim-pulse.ts import from here so one edit propagates everywhere.
export const RIPPLE_COLORS = {
  NODE: '#818cf8',   // indigo-400, matches the default node color
  EDGE: '#fbbf24',   // amber-400, matches highlighted-edge line color
} as const;

// ── Stylesheet (computed once at module load) ───────────────────────────────────

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
  // Default fill when a fill has no explicit color mapping (safety net;
  // every fill defined in config.ts has its own color, so this only fires
  // for legacy/missing values).
  const FILL_DEFAULT = '#f8fafc';

  // ── Fill 规则 — 形状 + 背景色 ───────────────────────────────────────────────
  // fill 是领域顶层类，决定默认形状、背景色。
  const fillRules = Object.entries(FILL_CONFIG).map(([fill, cfg]) => ({
    selector: `node[fill = "${fill}"]`,
    style: {
      shape: cfg.shape as cytoscape.Css.NodeShape,
      'background-color': cfg.background,
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
  
  // stroke = flow：subtreeRoot 色 + 流光边框类
  const flowStrokeRule = {
    selector: `node[stroke = "flow"]`,
    style: {
      'border-color': '#3b82f6', // 备用色，实际颜色由 subtreeRoot 规则决定
      'border-width': 2,
      'border-style': 'solid' as cytoscape.Css.LineStyle,
    },
  };

  // stroke = glow：subtreeRoot 色 + 光晕边框类
  const glowStrokeRule = {
    selector: `node[stroke = "glow"]`,
    style: {
      'border-color': '#3b82f6', // 备用色，实际颜色由 subtreeRoot 规则决定
      'border-width': 2,
      'border-style': 'solid' as cytoscape.Css.LineStyle,
    },
  };

  // flow/glow 的 subtreeRoot 颜色规则（动态生成）
  const flowGlowSubtreeRules = Object.entries(subtreeColorMap)
    .filter(([, color]) => color !== '#9ca3af') // 跳过无色/透明
    .flatMap(([rootId, color]) => [
      {
        selector: `node[stroke = "flow"][subtreeRoot = "${rootId}"]`,
        style: { 'border-color': color },
      },
      {
        selector: `node[stroke = "glow"][subtreeRoot = "${rootId}"]`,
        style: { 'border-color': color },
      },
    ]);

  // Fill 边框色 fallback — stroke='auto' 或 'fallback' 时按 fill 取色
  //   - stroke='fallback'：不论有无 subtreeRoot，直接用 fill 兜底色
  //   - stroke='auto' + 无 subtreeRoot：用 fill 兜底色
  //   - stroke='auto' + 有 subtreeRoot：subtreeRoot 色优先（见下面的 subtreeColorMap 规则）
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
        selector: `node[fill = "${fill}"][!subtreeRoot][stroke = "auto"]`,
        style: { 'border-color': color, 'border-width': 2 },
      })),
    // ② 兜底：节点连 fill 都没有 → 用 FILL_BORDER_DEFAULT
    {
      selector: `node[!fill][stroke = "fallback"]`,
      style: { 'border-color': FILL_BORDER_DEFAULT, 'border-width': 2 },
    },
    {
      selector: `node[!fill][!subtreeRoot][stroke = "auto"]`,
      style: { 'border-color': FILL_BORDER_DEFAULT, 'border-width': 2 },
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
        'border-width': 1.5,
        'border-color': '#475569',
        'background-color': FILL_DEFAULT,
        'background-fill': 'solid',
        'background-blacken': 0,
        shape: 'ellipse',
        'text-events': 'yes',
        'transition-property': 'opacity, border-color, border-width, background-color',
        'transition-duration': '280ms',
        'transition-timing-function': 'ease-out',
      },
    },
    // ② fill 形状 + 背景色
    ...fillRules,
    // ②.b shape (OWL2 实体类型) 规则：显式填写时覆盖 fill 的默认形状（最高优先级）
    ...shapeOwlRules,
    // ③ stroke 边框色
    flowStrokeRule,
    glowStrokeRule,
    // ③.b flow/glow 的 subtreeRoot 颜色（覆盖上面的默认色）
    ...flowGlowSubtreeRules,
    // ③.c 显式 stroke 覆盖（stroke=auto 走 subtreeRoot，flow/glow 由上面规则处理）
    // ④ fill 边框色 fallback（stroke=auto 且无 subtreeRoot 时由 fill 决定）
    ...fillBorderRules,
    // ④.b subtree 边框色（stroke=auto 时生效，优先于 depth）
    ...Object.entries(subtreeColorMap).map(([rootId, color]) => ({
      // stroke=auto 时由 subtreeRoot 色接管（包括 fill 兜底的 auto）
      selector: `node[subtreeRoot = "${rootId}"][stroke = "auto"]`,
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
        'transition-property': 'line-color, opacity, width, target-arrow-color',
        'transition-duration': '400ms',
        'transition-timing-function': 'ease-out',
      },
    },
    // 边类型样式
    ...edgeTypeRules,
    // ── stroke 特效类 ───────────────────────────────────────────────────────
    // flow-border：流光动画
    {
      selector: '.flow-border',
      style: {
        // 流光效果通过 CSS 动画实现，这里设置基础样式
        'border-width': 2,
      },
    },
    // glow-border：光晕效果
    {
      selector: '.glow-border',
      style: {
        'border-width': 2,
      },
    },
    // ── 交互状态 ─────────────────────────────────────────────────────────────
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
    {
      selector: '.hovered',
      style: {
        opacity: 1,
        'border-width': 3,
        'border-color': '#818cf8',
      },
    },
    {
      selector: '.selected-node, .highlighted',
      style: {
        opacity: 1,
        'border-width': 4,
        'border-color': '#fbbf24',
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
      minZoom = 0.02,
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
    // 强制关闭 fit：所有布局都不自动 fit，完全由 main.ts 的 setInitialZoom
    // 和用户手动操作（适应/F键）控制摄像头，防止布局的 fit:true 覆盖 zoom。
    (base as Record<string, unknown>).fit = false;

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
      ...data.nodes.map((n) => {
        // stroke 字段解析（stroke 是**全量覆盖层**，与 fill 平行独立）：
        //   - 节点 stroke 字段有显式值（含 'auto'/'flow'/'glow'）→ 直接用
        //   - 节点 stroke 字段为空（undefined/null/字段缺失）→ 用 fill.defaultStroke 兜底
        //   - fill 也没 defaultStroke（如兜底节点）→ 'auto'
        //
        // 用户填 stroke="auto" 就是显式表达"我要 auto"，不应再被 fill.defaultStroke 覆盖。
        const userStroke = (n.stroke === 'auto' || n.stroke === 'flow' || n.stroke === 'glow')
          ? n.stroke
          : (n.stroke as string | undefined); // 兼容未来扩展值，原样传递
        const effectiveStroke = userStroke
          ?? (n.fill && FILL_CONFIG[n.fill]?.defaultStroke)
          ?? 'auto';

        // flow/glow 特效需要添加 CSS 类（按 effectiveStroke 判断，包含 fill 兜底）
        const classes = [];
        if (effectiveStroke === 'flow') classes.push(CLASSES.FLOW_BORDER);
        if (effectiveStroke === 'glow') classes.push(CLASSES.GLOW_BORDER);

        return {
          data: {
            id: n.id,
            label: n.label || n.id,
            // 语义层（基于 OWL2）
            fill: n.fill,
            stroke: effectiveStroke,
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
          classes: classes.join(' ') || undefined,
        };
      }),
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
