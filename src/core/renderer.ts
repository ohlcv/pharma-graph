// src/core/renderer.ts
// Cytoscape instance management — imported by src/ui/main.ts

import cytoscape from 'cytoscape';

// Register layout extensions
import coseBilkent from 'cytoscape-cose-bilkent';
import dagre from 'cytoscape-dagre';
import euler from 'cytoscape-euler';

cytoscape.use(coseBilkent);
cytoscape.use(dagre);
cytoscape.use(euler);

import { GraphData } from './graph.js';
import { NODE_TYPE_SHAPE, EDGE_TYPE_STYLE } from './config.js';

export interface RendererOptions {
  container: HTMLElement;
  data: GraphData;
  layoutName?: string;
  minZoom?: number;
  maxZoom?: number;
}

export class Renderer {
  private cy: cytoscape.Core;
  private currentLayout: string;

  constructor(options: RendererOptions) {
    const {
      container,
      data,
      layoutName = 'cose',
      minZoom = 0.2,
      maxZoom = 4.0,
    } = options;

    const elements = this.buildElements(data);

    this.cy = cytoscape({
      container,
      elements,
      style: this.buildStyle(),
      layout: { name: 'preset' },
      minZoom,
      maxZoom,
      wheelSensitivity: 0.25,
      boxSelectionEnabled: true,
      autounselectify: false,
      autoungrabify: false,
    });

    this.currentLayout = layoutName;
    this.runLayout(layoutName);
  }

  render(data: GraphData, layoutName?: string): void {
    const elements = this.buildElements(data);
    this.cy.elements().remove();
    this.cy.add(elements);
    this.runLayout(layoutName ?? this.currentLayout);
  }

  destroy(): void {
    this.cy.destroy();
  }

  runLayout(name: string): void {
    const configs: Record<string, cytoscape.LayoutOptions> = {
      cose: {
        name: 'cose-bilkent',
        animate: true,
        animationDuration: 1200,
        animationEasing: 'ease-out-cubic',
        randomize: true,
        nodeRepulsion: 9000,
        idealEdgeLength: 130,
        edgeElasticity: 100,
        gravity: 0.1,
        numIter: 1500,
        tile: true,
        tilingPaddingVertical: 15,
        tilingPaddingHorizontal: 15,
        fit: true,
        padding: 60,
        nodeDimensionsIncludeLabels: true,
      } as any,
      concentric: {
        name: 'concentric',
        concentric: (node: cytoscape.NodeSingular) => node.data('weight') || 0,
        levelWidth: () => 1,
        minNodeSpacing: 50,
        padding: 50,
        animate: true,
        animationDuration: 800,
        animationEasing: 'ease-out-cubic',
        fit: true,
        avoidOverlap: true,
      },
      circle: {
        name: 'circle',
        radius: 200,
        padding: 50,
        animate: true,
        animationDuration: 700,
        fit: true,
        clockwise: true,
      } as any,
      grid: {
        name: 'grid',
        condense: false,
        rows: undefined,
        cols: undefined,
        padding: 50,
        animate: true,
        animationDuration: 600,
        fit: true,
      },
      dagre: {
        name: 'dagre',
        rankDir: 'TB',
        rankSep: 100,
        edgeSep: 50,
        nodeSep: 50,
        padding: 60,
        animate: 'end' as const,
        animationDuration: 800,
        fit: true,
      } as any,
      breadthfirst: {
        name: 'breadthfirst',
        directed: true,
        padding: 50,
        animate: true,
        animationDuration: 700,
        fit: true,
      },
      euler: {
        name: 'euler',
        animate: true,
        animationDuration: 600,
        fit: true,
        padding: 30,
        randomize: true,
        maxIterations: 1000,
        maxSimulationTime: 4000,
        refresh: 10,
      } as any,
    };

    const cfg = configs[name] ?? { name, fit: true, animate: true, animationDuration: 600 };
    this.currentLayout = name;
    this.cy.layout(cfg).run();
  }

  fit(): void {
    this.cy.fit(undefined, 50);
  }

  getCy(): cytoscape.Core {
    return this.cy;
  }

  private buildElements(data: GraphData) {
    return [
      ...data.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label || n.id,
          type: n.type,
          category: n.category,
          summary: n.summary,
          location: n.location,
          weight: n.weight ?? 60,
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

  private hexAlpha(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private nodeColor(type: string): string {
    const colors: Record<string, string> = {
      concept: '#6366f1',
      drug: '#22d3ee',
      mechanism: '#f87171',
      disease: '#fbbf24',
      ingredient: '#a78bfa',
    };
    return colors[type] ?? '#94a3b8';
  }

  private buildStyle(): any {
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
          'border-width': 1.5,
          'border-color': 'rgba(255,255,255,0.12)',
          shape: 'ellipse',
          'text-events': 'yes',
        },
      },
      ...Object.entries(NODE_TYPE_SHAPE).map(([type, shape]) => ({
        selector: `node[type = "${type}"]`,
        style: { shape: shape as cytoscape.Css.NodeShape },
      })),
      ...Object.entries(NODE_TYPE_SHAPE).map(([type]) => {
        const color = this.nodeColor(type);
        return {
          selector: `node[type = "${type}"]`,
          style: {
            'background-color': color,
            'border-color': this.hexAlpha(color, 0.67),
            'border-width': 2,
          },
        };
      }),
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
      ...Object.entries(EDGE_TYPE_STYLE).map(([type, s]) => ({
        selector: `edge[edgeType = "${type}"]`,
        style: {
          'line-color': s.color,
          'target-arrow-color': s.color,
          'line-style': s.lineStyle as cytoscape.Css.LineStyle,
          'target-arrow-shape': (s.arrow === 'none' ? 'none' : 'triangle') as cytoscape.Css.ArrowShape,
        },
      })),
      {
        selector: ':selected',
        style: {
          'border-width': 3,
          'border-color': '#ffffff',
          'overlay-color': 'rgba(99,102,241,0.2)',
          'overlay-padding': 5,
          'overlay-opacity': 0,
        },
      },
      {
        selector: '.dimmed',
        style: { opacity: 0.12 },
      },
      {
        selector: '.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#fbbf24',
          'overlay-color': 'rgba(0,0,0,0)',
          'overlay-opacity': 0,
        },
      },
      {
        selector: '.highlighted-edge',
        style: {
          opacity: 1,
          width: 2.5,
          'line-color': '#fbbf24',
          'target-arrow-color': '#fbbf24',
        },
      },
      {
        selector: '.pulse',
        style: {
          'border-width': 3,
          'border-color': '#fbbf24',
          width: 'mapData(weight, 40, 100, 38, 72)',
          height: 'mapData(weight, 40, 100, 38, 72)',
        },
      },
    ];
  }
}
