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
import { nodeColor, nodeColorDark } from './colors.js';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLESHEET: any[] = (() => {
  const nodeTypeRules = Object.entries(NODE_TYPE_SHAPE).map(([type, shape]) => ({
    selector: `node[type = "${type}"]`,
    style: {
      shape: shape as cytoscape.Css.NodeShape,
      'background-gradient-stop-colors': [nodeColor(type), nodeColorDark(type)],
      'background-gradient-stop-positions': [0, 100],
      'border-width': 1.5,
    },
  }));

  const categoryRules = Object.entries(CATEGORY_COLOR).map(([cat, color]) => ({
    selector: `node[category = "${cat}"]`,
    style: {
      'border-color': color,
      'border-width': 2.5,
    },
  }));

  const layerRules = Object.entries(NODE_LAYER_STYLE).map(([layer, style]) => {
    const s: Record<string, unknown> = {
      'border-width': style.borderWidth,
      'border-color': style.borderColor,
    };
    if (style.bgColor !== 'transparent') {
      s['background-color'] = style.bgColor;
    }
    return { selector: `node[layer = "${layer}"]`, style: s };
  });

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
        width: 'mapData(weight, 40, 100, 32, 64)',
        height: 'mapData(weight, 40, 100, 32, 64)',
        'font-size': 'mapData(weight, 40, 100, 10, 13)',
        'font-weight': 600,
        color: '#e2e8f0',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 6,
        'text-background-color': 'rgba(15,17,23,0.82)',
        'text-background-shape': 'roundrectangle',
        'text-background-padding': '3px',
        'border-width': 0,
        shape: 'ellipse',
        'text-events': 'yes',
      },
    },
    ...nodeTypeRules,
    ...layerRules,
    ...categoryRules,
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
      selector: '.selected-node',
      style: {
        opacity: 1,
        'border-width': 4,
        'border-color': '#ffffff',
      },
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
      'border-color': 'rgba(255,255,255,0.9)',
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

    this.cy = cytoscape({
      container,
      elements: this.buildElements(data),
      style: STYLESHEET,
      layout: { name: 'preset' },
      minZoom,
      maxZoom,
      wheelSensitivity: 3.0,
      boxSelectionEnabled: true,
      autounselectify: false,
      autoungrabify: false,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });

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
    return [
      ...data.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label || n.id,
          type: n.type,
          category: n.category ?? 'default',
          layer: n.layer,
          summary: n.summary,
          location: n.location,
          tags: n.tags ?? [],
          body: n.body,
          weight: n.weight ?? 60,
          color: nodeColor(n.type),
          colorDark: nodeColorDark(n.type),
        },
      })),
      ...data.edges.map((e, idx) => ({
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
