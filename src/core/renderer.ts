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
  CATEGORY_COLOR,
  EDGE_TYPE_STYLE,
  NODE_LAYER_STYLE,
  LAYOUTS,
  LayoutConfig,
} from './config.js';

cytoscape.use(coseBilkent);
cytoscape.use(dagre);
cytoscape.use(euler);

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodeColor(type: string): string {
  return NODE_TYPE_COLOR[type] ?? NODE_TYPE_COLOR.default;
}

function nodeColorDark(type: string): string {
  return NODE_TYPE_COLOR_DARK[type] ?? NODE_TYPE_COLOR_DARK.default;
}

// ── Stylesheet ────────────────────────────────────────────────────────────────

function buildStylesheet(): any {
  const nodeTypeRules = Object.entries(NODE_TYPE_SHAPE).flatMap(([type, shape]) => {
    const main = nodeColor(type);
    const dark = nodeColorDark(type);
    return [
      {
        selector: `node[type = "${type}"]`,
        style: { shape: shape as cytoscape.Css.NodeShape },
      },
      {
        selector: `node[type = "${type}"]`,
        style: {
          'background-gradient-stop-colors': [main, dark],
          'border-width': 1.5,
        },
      },
    ];
  });

  // Category → colored border overlay (applied on top of type rules)
  const categoryRules = Object.entries(CATEGORY_COLOR).map(([cat, color]) => ({
    selector: `node[category = "${cat}"]`,
    style: {
      'border-color': color,
      'border-width': 2.5,
    } as any,
  }));

  // Layer → border thickness + background tint (overrides type default border-width)
  const layerRules = Object.entries(NODE_LAYER_STYLE).map(([layer, style]) => ({
    selector: `node[layer = "${layer}"]`,
    style: {
      'border-width': style.borderWidth,
      'border-color': style.borderColor,
      'background-color': style.bgColor === 'transparent' ? undefined : style.bgColor,
    } as any,
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
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        width:  'mapData(weight, 40, 100, 32, 64)',
        height: 'mapData(weight, 40, 100, 32, 64)',
        'font-size':   'mapData(weight, 40, 100, 10, 13)',
        'font-weight': 600,
        color:         '#e2e8f0',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 6,
        'text-background-color': 'rgba(15,17,23,0.82)',
        'text-background-shape': 'roundrectangle',
        'text-background-padding': '3px',
        'border-width': 1.5,
        'border-color': 'rgba(255,255,255,0.12)',
        shape: 'ellipse',
        'text-events': 'yes',
      },
    },
    ...nodeTypeRules,
    ...categoryRules,
    ...layerRules,
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
    ...edgeTypeRules,
    {
      selector: ':selected',
      style: {
        opacity: 1,
        'border-width': 3,
        'border-color': '#ffffff',
        'overlay-color': 'rgba(99,102,241,0)',
        'overlay-padding': 6,
        'overlay-opacity': 0,
      },
    },
    // 选中节点（主角）：白色粗描边 + 紫色外发光（由 CSS drop-shadow 在 canvas 容器层实现）
    {
      selector: '.selected-node',
      style: {
        opacity: 1,
        'border-width': 4,
        'border-color': '#ffffff',
        'overlay-color': 'rgba(99,102,241,0)',
        'overlay-padding': 0,
        'overlay-opacity': 0,
      },
    },
    // 暗淡节点：背景 + 文字都压暗（opacity 影响整节点含文字）
    { selector: '.dimmed',       style: {
      opacity: 0.22,
      'border-color': 'rgba(255,255,255,0.06)',
      'text-background-color': 'rgba(15,17,23,0.5)',
      'line-opacity': 0.08,
      'color': 'rgba(226,232,240,0.25)',
    }},
    // 当 .dimmed 与 :selected 冲突时（切换主角时旧主角仍有 :selected），dimmed 优先
    { selector: '.dimmed:selected', style: {
      opacity: 0.22,
    }},
    // 入场动画：布局开始前设为透明，配合 runLayout 中的 stagger 淡入
    { selector: '.entering',     style: { opacity: 0 } },
    // Hover 态：描边变亮（overlay 关闭避免遮盖标签文字）
    { selector: '.hovered',      style: {
      opacity: 1,
      'border-width': 3,
      'border-color': 'rgba(255,255,255,0.9)',
      'overlay-color': 'rgba(99,102,241,0)',
      'overlay-padding': 6,
      'overlay-opacity': 0,
    }},
    // 关联节点（配角）：橙色描边，opacity 0.8
    { selector: '.highlighted',  style: {
      opacity: 0.8,
      'border-width': 2.5,
      'border-color': '#fbbf24',
      'overlay-color': 'rgba(0,0,0,0)',
      'overlay-opacity': 0,
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
        width:  'mapData(weight, 40, 100, 38, 72)',
        height: 'mapData(weight, 40, 100, 38, 72)',
      },
    },
    // 拖拽时简化：关闭渐变/阴影，移除文字背景，减少 GPU 绘制成本
    {
      selector: '.dragging-simplified',
      style: {
        'background-gradient-stop-colors': 'rgba(0,0,0,0)',
        'border-width': 1,
        'text-background-color': 'rgba(0,0,0,0)',
        'text-background-shape': 'none',
        'overlay-opacity': 0,
      },
    },
    // 漫游路径预览：hover 节点时高亮整条路径边
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
}

// ── Renderer ──────────────────────────────────────────────────────────────────

export interface RendererOptions {
  container: HTMLElement;
  data: GraphData;
  layoutName?: string;
  layoutConfigs?: Record<string, LayoutConfig>;
  minZoom?: number;
  maxZoom?: number;
  onEdgeHover?: (edge: cytoscape.EdgeSingular | null, x: number, y: number) => void;
}

const DEFAULT_LAYOUT = 'cose';

export class Renderer {
  private cy: cytoscape.Core;
  private currentLayout = DEFAULT_LAYOUT;
  private layoutConfigs: Record<string, LayoutConfig>;

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

    this.cy = cytoscape({
      container,
      elements: this.buildElements(data),
      style: buildStylesheet(),
      layout: { name: 'preset' },
      minZoom,
      maxZoom,
      wheelSensitivity: 3.0,
      boxSelectionEnabled: true,
      autounselectify: false,
      autoungrabify: false,
      // 启用画布级别优化：减少不必要的像素重绘
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });

    this.runLayout(layoutName);
    this.attachEdgeTooltip(options.onEdgeHover);

    // 视口缩放节流：限制极端缩放，减少频繁重绘
    this.cy.on('zoom', () => {
      const zoom = this.cy.zoom();
      if (zoom < 0.05) this.cy.zoom(0.05);
      if (zoom > 5.0) this.cy.zoom(5.0);
    });
  }

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

  // 拖拽时简化节点样式，减少重绘成本；结束后恢复
  setDragMode(on: boolean): void {
    if (on) {
      this.cy.nodes().addClass('dragging-simplified');
    } else {
      this.cy.nodes().removeClass('dragging-simplified');
    }
  }

  runLayout(name: string, overrides?: Record<string, unknown>): void {
    this.currentLayout = name;
    const preset = this.layoutConfigs[name]?.cytoscape;
    const base = preset ? { ...preset } : {};
    if (overrides) Object.assign(base, overrides);
    if (!base.name) (base as any).name = name;

    const nodes = this.cy.nodes().not('.layer-parent');

    // 入场透明状态
    nodes.addClass('entering');
    this.cy.edges().addClass('entering');

    // 逐帧 stagger 入场动画
    nodes.forEach((node: cytoscape.NodeSingular, i: number) => {
      const delay = 80 + i * 16;
      setTimeout(() => {
        node.removeClass('entering');
      }, delay + 300);
    });

    const edgeDelay = 80 + nodes.length * 16 + 150;
    this.cy.edges().forEach((edge: cytoscape.EdgeSingular, i: number) => {
      setTimeout(() => {
        edge.removeClass('entering');
      }, edgeDelay + i * 10 + 200);
    });

    const layout = this.cy.layout(base as unknown as cytoscape.LayoutOptions);
    layout.run();
  }

  private buildElements(data: GraphData) {
    return [
      ...data.nodes.map((n) => ({
        data: {
          id:       n.id,
          label:    n.label || n.id,
          type:     n.type,
          category: n.category ?? 'default',
          layer:    n.layer,
          summary:  n.summary,
          location: n.location,
          weight:   n.weight ?? 60,
          color:    nodeColor(n.type),
          colorDark: nodeColorDark(n.type),
        },
      })),
      ...data.edges.map((e, idx) => ({
        data: {
          id:       e.id ?? `edge-${idx}`,
          source:   e.source,
          target:   e.target,
          edgeType: e.type,
          reason:   e.reason,
        },
      })),
    ];
  }

  private attachEdgeTooltip(
    cb: RendererOptions['onEdgeHover']
  ): void {
    let tooltip: HTMLElement | null = null;

    this.cy.on('mouseover', 'edge', (evt) => {
      const edge = evt.target;
      const reason = edge.data('reason');
      if (!reason || !cb) return;

      const x = edge.source().renderedPosition().x + (edge.target().renderedPosition().x - edge.source().renderedPosition().x) / 2;
      const y = edge.source().renderedPosition().y + (edge.target().renderedPosition().y - edge.source().renderedPosition().y) / 2;
      cb(edge, x, y);
    });

    this.cy.on('mouseout', 'edge', () => {
      if (cb) cb(null, 0, 0);
    });
  }
}
