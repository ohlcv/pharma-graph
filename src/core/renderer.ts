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
  FIELD_COLOR,
  EDGE_TYPE_STYLE,
  NODE_TIER_STYLE,
  LAYOUTS,
  LayoutConfig,
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
//   ② field → 边框色（学科归属）
//   ③ essence → 形状（节点本质决定形状）
//   ④ tier → 纯色填充（层次感，均匀覆盖整节点）
//   ⑤ 边、选中/悬停等交互状态

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLESHEET: any[] = (() => {
  // Tier 填充色
  const TIER_DEFAULT_FILL = '#f8fafc';

  // Essence 规则 — 仅形状（填充色由 tier 统一管理）
  const nodeTypeRules = Object.entries(NODE_TYPE_SHAPE).map(([key, shape]) => {
    return {
      selector: `node[essence = "${key}"]`,
      style: {
        shape: shape as cytoscape.Css.NodeShape,
      },
    };
  });

  // Field 规则 — 边框色（区分学科归属）
  const fieldRules = Object.entries(FIELD_COLOR).map(([key, color]) => ({
    selector: `node[field = "${key}"]`,
    style: { 'border-color': color, 'border-width': 2 },
  }));

  const edgeTypeRules = Object.entries(EDGE_TYPE_STYLE).map(([type, s]) => ({
    selector: `edge[edgeType = "${type}"]`,
    style: {
      'line-color': s.color,
      'target-arrow-color': s.color,
      'line-style': s.lineStyle as cytoscape.Css.LineStyle,
      'target-arrow-shape': (s.arrow === 'none' ? 'none' : 'triangle') as cytoscape.Css.ArrowShape,
    },
  }));

  return [
    // ① 节点基础样式
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        width:  'mapData(weight, 1, 10, 36, 76)',
        height: 'mapData(weight, 1, 10, 36, 76)',
        'font-size': 'mapData(weight, 1, 10, 10, 15)',
        'font-weight': 600,
        color: '#e2e8f0',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 6,
        'text-background-color': 'rgba(15,17,23,0.82)',
        'text-background-shape': 'roundrectangle',
        'text-background-padding': '3px',
        'border-width': 0,
        'border-color': '#475569',
        'background-color': TIER_DEFAULT_FILL,
        'background-blacken': 0,
        shape: 'ellipse',
        'text-events': 'yes',
      },
    },
    // ② field 边框色
    ...fieldRules,
    // ③ essence 形状（节点本质决定形状）
    ...nodeTypeRules,
    // ④ tier 填充色（层次色均匀覆盖整节点）
    ...Object.entries(NODE_TIER_STYLE).map(([key, style]) => ({
      selector: `node[tier = "${key}"]`,
      style: { 'background-color': style.bgColor },
    })),
    // 虚拟层父节点
    {
      selector: '.layer-parent',
      style: {
        'background-color': 'rgba(0,0,0,0)',
        'border-width': 0,
        label: '',
        width: 1, height: 1, padding: 0,
        shape: 'rectangle' as cytoscape.Css.NodeShape,
      },
    },
    // 边默认样式
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': 'rgba(100,116,139,0.45)',
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': 'rgba(100,116,139,0.45)',
        'arrow-scale': 0.7,
        opacity: 0.6,
        'haystack-radius': 0,
        'transition-property': 'line-color, opacity, width',
        'transition-duration': '0.15s',
      },
    },
    // 边类型样式
    ...edgeTypeRules,
    // ── 交互状态 ──────────────────────────────────────────────────────────────
    {
      selector: '.selected-node',
      style: { opacity: 1, 'border-width': 4 },
    },
    { selector: '.dimmed', style: {
      opacity: 0.1,
      'border-color': 'rgba(255,255,255,0.06)',
      'text-background-color': 'rgba(15,17,23,0.5)',
      'line-color': 'transparent',
      'line-opacity': 0.1,
      'source-arrow-color': 'transparent',
      'target-arrow-color': 'transparent',
      'color': 'rgba(226,232,240,0.25)',
    }},
    { selector: '.entering', style: { opacity: 0 } },
    { selector: '.hovered', style: {
      opacity: 1,
      'border-width': 3,
    }},
    { selector: '.highlighted', style: {
      opacity: 0.8,
      'border-width': 2.5,
      'border-color': '#fbbf24',
    }},
    { selector: '.highlighted-edge', style: {
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
    }},
    {
      selector: '.pulse',
      style: {
        'border-width': 2.5,
        'border-color': '#fbbf24',
        width: 'mapData(weight, 40, 100, 38, 72)',
        height: 'mapData(weight, 40, 100, 38, 72)',
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
        'color': 'rgba(226,232,240,0.25)',
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
})();

// ── Options & Types ────────────────────────────────────────────────────────────

export interface RendererOptions {
  container: HTMLElement;
  data: GraphData;
  layoutName?: string;
  layoutConfigs?: Record<string, LayoutConfig>;
  minZoom?: number;
  maxZoom?: number;
}

const DEFAULT_LAYOUT = 'cose';

// ── Renderer ──────────────────────────────────────────────────────────────────

export class Renderer {
  private cy: cytoscape.Core;
  private currentLayout = DEFAULT_LAYOUT;
  private layoutConfigs: Record<string, LayoutConfig>;
  private currentLayoutInstance: cytoscape.Layouts | null = null;

  constructor(options: RendererOptions) {
    const {
      container,
      data,
      layoutName = DEFAULT_LAYOUT,
      layoutConfigs = LAYOUTS,
      minZoom = 0.2,
      maxZoom = 4.0,
    } = options;

    this.layoutConfigs = layoutConfigs;
    this.currentLayout = layoutName;

    // Canvas renderer: 200+ 节点时比默认 SVG 快 3~5 倍，所有节点/边作为像素绘制而非 DOM 元素，
    // 大幅降低 CPU 绘制开销。Cytoscape API（addClass/removeClass/style）完全兼容，无需改动业务逻辑。
    // 注意：renderer 不在 CytoscapeOptions 的 TypeScript 类型定义中，as unknown 绕过类型检查。
    const cyOptions = {
      container,
      elements: this.buildElements(data),
      style: STYLESHEET,
      layout: { name: 'preset' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderer: { name: 'canvas' } as any,
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
      setTimeout(() => {
        edge.removeClass(CLASSES.ENTERING);
      }, edgeDelay + i * 10 + 200);
    });

    this.currentLayoutInstance?.stop();
    const layoutInstance = this.cy.layout(base as unknown as cytoscape.LayoutOptions);

    // Resolve overlapping nodes before animation starts — prevents "invalid endpoints" warnings
    // from COSE placing two nodes at identical coordinates (e.g. randomize → COSE chain)
    const resolveOverlaps = () => {
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
    };

    resolveOverlaps();
    this.currentLayoutInstance = layoutInstance;
    layoutInstance.run();
  }

  setDragMode(on: boolean): void {
    if (on) {
      this.cy.nodes().addClass(CLASSES.DRAGGING_SIMPLIFIED);
    } else {
      this.cy.nodes().removeClass(CLASSES.DRAGGING_SIMPLIFIED);
    }
  }

  getEdgeReason(edge: cytoscape.EdgeSingular): string | undefined {
    return edge.data('reason');
  }

  getEdgeMidpoint(edge: cytoscape.EdgeSingular): { x: number; y: number } {
    const src = edge.source().renderedPosition();
    const tgt = edge.target().renderedPosition();
    if (!src || !tgt) return { x: 0, y: 0 };
    return {
      x: (src.x + tgt.x) / 2,
      y: (src.y + tgt.y) / 2,
    };
  }

  currentLayoutName(): string {
    return this.currentLayout;
  }

  // ── Element builder ─────────────────────────────────────────────────────────

  private buildElements(data: GraphData) {
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    return [
      ...data.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label || n.id,
          essence: n.essence || n.type || 'default',
          field: n.field || n.category || '',
          tier: n.tier || n.layer,
          summary: n.summary,
          location: n.location,
          tags: n.tags ?? [],
          body: n.body,
          weight: n.weight ?? 60,
          color: NODE_TYPE_COLOR[n.essence || n.type] ?? NODE_TYPE_COLOR.default,
          colorDark: NODE_TYPE_COLOR_DARK[n.essence || n.type] ?? NODE_TYPE_COLOR_DARK.default,
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
