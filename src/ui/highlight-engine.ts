// src/ui/highlight-engine.ts
// Highlighting, search highlighting, shape filtering, and reset logic.
// Consumes Renderer.CLASSES constants; operates directly on the Cytoscape core.

import cytoscape from 'cytoscape';
import { CLASSES } from '../core/renderer.js';

export class HighlightEngine {
  private prevSelectedNodeId: string | null = null;
  private prevSelectedNodeName: string | null = null;

  constructor(private cy: cytoscape.Core) {}

  /** Expose the cytoscape instance for callers that need raw selection. */
  getCy(): cytoscape.Core {
    return this.cy;
  }

  // ── Private helpers: extract common patterns ──────────────────────────────────

  /** Clear all highlighting classes and selections. */
  private resetClasses(): void {
    this.cy.elements().removeClass(
      [CLASSES.DIMMED, CLASSES.SELECTED_NODE, CLASSES.HIGHLIGHTED, CLASSES.HIGHLIGHTED_EDGE].join(' '),
    );
    this.cy.elements().unselect();
  }

  /** Dim edges that are not connected to any highlighted node. */
  private dimUnhighlightedEdges(): void {
    this.cy.edges().not(`.${CLASSES.HIGHLIGHTED_EDGE}`).addClass(CLASSES.DIMMED);
    this.cy.edges(`[source][target]`).forEach((e: cytoscape.EdgeSingular) => {
      const src = e.source();
      const tgt = e.target();
      if (src.hasClass(CLASSES.HIGHLIGHTED) && tgt.hasClass(CLASSES.HIGHLIGHTED)) {
        e.removeClass(CLASSES.DIMMED).addClass(CLASSES.HIGHLIGHTED_EDGE);
      }
    });
  }

  /** Dim all nodes that are not highlighted. */
  private dimUnhighlightedNodes(): void {
    this.cy.nodes()
      .not(`.${CLASSES.LAYER_PARENT}`)
      .not(`.${CLASSES.SELECTED_NODE}`)
      .not(`.${CLASSES.HIGHLIGHTED}`)
      .addClass(CLASSES.DIMMED);
  }

  // ── Public highlight methods ─────────────────────────────────────────────────

  highlightNode(nodeId: string): {
    prevNodeId: string | null;
    prevNodeName: string | null;
  } {
    const prev = this.getSelectedNodeInfo();
    this.resetClasses();

    const node = this.cy.getElementById(nodeId);
    if (node.empty()) return prev;

    // Clear inline border styles from the previously selected node only
    if (prev.prevNodeId) {
      const prevNode = this.cy.getElementById(prev.prevNodeId);
      if (!prevNode.empty()) {
        prevNode.style({ 'border-width': null, 'border-color': null });
      }
    }

    node.addClass(CLASSES.SELECTED_NODE);
    node.select();
    
    // DEBUG: Log neighborhood info
    const neighbors = node.neighborhood('node').not(`.${CLASSES.LAYER_PARENT}`);
    const neighborsIds = neighbors.map((n: cytoscape.NodeSingular) => n.id());
    const connectedEdges = node.connectedEdges().map((e: cytoscape.EdgeSingular) => `${e.source().id()} -> ${e.target().id()}`);
    console.log('[DEBUG highlightNode]', {
      nodeId,
      neighbors: neighborsIds,
      connectedEdges,
    });
    
    node.neighborhood('node').not(`.${CLASSES.LAYER_PARENT}`).addClass(CLASSES.HIGHLIGHTED);
    node.connectedEdges().addClass(CLASSES.HIGHLIGHTED_EDGE);

    this.dimUnhighlightedNodes();
    this.dimUnhighlightedEdges();

    return prev;
  }

  highlightNeighbors(nodeId: string): void {
    const node = this.cy.getElementById(nodeId);
    if (node.empty()) return;
    node.neighborhood('node').not(`.${CLASSES.LAYER_PARENT}`).addClass(CLASSES.HIGHLIGHTED);
    node.connectedEdges().addClass(CLASSES.HIGHLIGHTED_EDGE);
  }

  highlightSearch(query: string): string[] {
    const results: string[] = [];
    this.resetClasses();

    if (!query.trim()) return results;

    const q = query.toLowerCase();
    this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`).forEach((n: cytoscape.NodeSingular) => {
      const label = (n.data('label') ?? '').toLowerCase();
      if (label.includes(q)) {
        n.addClass(CLASSES.HIGHLIGHTED);
        n.select();
        results.push(n.id());
      } else {
        n.addClass(CLASSES.DIMMED);
        n.unselect();
      }
    });

    this.dimUnhighlightedEdges();

    return results;
  }

  highlightShape(shape: string): void {
    this.resetClasses();

    // shape here is the Cytoscape shape name (ellipse, octagon …) that maps to
    // an essence key via NODE_TYPE_SHAPE_MAP.  We match against n.data('essence')
    // rather than n.style('shape') so that nodes with no explicit shape style
    // (and therefore inheriting the default 'ellipse') are still correctly
    // filtered by their essence attribute — which is what the legend counts use.
    // 反查表：cytoscape shape → essence
    // 注意：ellipse 对应两种 essence（重点药/普通药），无法用形状区分，需用 fill 颜色区分
    const essenceMap: Record<string, string> = {
      ellipse:           'medication',  // 重点药（普通药也用 ellipse，见下）
      octagon:           'summary',
      diamond:           'illness',
      rectangle:         'concept',
      pentagon:          'strict-class',     // 五边形 — 严格分类
      hexagon:           'umbrella-class',   // 六边形 — 伞形分类
      'round-rectangle': 'module',
      tag:               'notion',
      vee:               'mnemonic',         // V形 — 口诀
    };
    const essence = essenceMap[shape] ?? null;

    this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`).forEach((n: cytoscape.NodeSingular) => {
      if (essence !== null && n.data('essence') === essence) {
        n.addClass(CLASSES.HIGHLIGHTED);
      } else {
        n.addClass(CLASSES.DIMMED);
      }
    });

    this.dimUnhighlightedEdges();
  }

  highlightEssence(essence: string): void {
    this.resetClasses();

    this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`).forEach((n: cytoscape.NodeSingular) => {
      if (n.data('essence') === essence) {
        n.addClass(CLASSES.HIGHLIGHTED);
      } else {
        n.addClass(CLASSES.DIMMED);
      }
    });

    this.dimUnhighlightedEdges();
  }

  highlightEdgeType(edgeType: string): void {
    this.resetClasses();

    const matchingEdges = this.cy.edges(`[edgeType = "${edgeType}"]`);
    if (matchingEdges.length === 0) {
      this.cy.elements().addClass(CLASSES.DIMMED);
      return;
    }

    matchingEdges.addClass(CLASSES.HIGHLIGHTED_EDGE);
    matchingEdges.connectedNodes().not(`.${CLASSES.LAYER_PARENT}`).addClass(CLASSES.HIGHLIGHTED);
    this.cy.nodes().not(`.${CLASSES.HIGHLIGHTED}`).not(`.${CLASSES.LAYER_PARENT}`).addClass(CLASSES.DIMMED);
    this.cy.edges().not(`.${CLASSES.HIGHLIGHTED_EDGE}`).addClass(CLASSES.DIMMED);
  }

  dimAll(): void {
    this.cy.elements().addClass(CLASSES.DIMMED);
  }

  highlightEdgeOnly(edgeId: string): void {
    const edge = this.cy.getElementById(edgeId);
    if (edge.empty()) return;
    this.cy.elements().addClass(CLASSES.DIMMED);
    this.cy.elements().unselect();
    edge.removeClass(CLASSES.DIMMED).addClass(CLASSES.HIGHLIGHTED_EDGE);
    edge.source().removeClass(CLASSES.DIMMED).addClass(CLASSES.SELECTED_NODE);
    edge.target().removeClass(CLASSES.DIMMED).addClass(CLASSES.SELECTED_NODE);
    edge.source().select();
    edge.target().select();
  }

  reset(): void {
    this.resetClasses();
    // Clear any inline border styles set by highlightNode() (border-width,
    // border-color were set via style() to override CSS for selected nodes).
    // Without this, the inline style persists after reset() and blocks
    // CSS-based dimming/highlighting from taking effect.
    this.cy.nodes().forEach((n: cytoscape.NodeSingular) => {
      n.style({ 'border-width': null, 'border-color': null });
    });
  }

  clearAllNodeInlineStyles(): void {
    this.cy.nodes().forEach((n: cytoscape.NodeSingular) => {
      n.style({
        'border-width': null,
        'border-color': null,
      });
    });
  }

  getSelectedNodeInfo(): {
    prevNodeId: string | null;
    prevNodeName: string | null;
  } {
    const sel = this.cy.nodes(`.${CLASSES.SELECTED_NODE}`);
    if (sel.length > 0) {
      return {
        prevNodeId: sel[0].id(),
        prevNodeName: sel[0].data('label') || sel[0].id(),
      };
    }
    return { prevNodeId: null, prevNodeName: null };
  }

  getAllHighlighted(): string[] {
    return this.cy.nodes(`.${CLASSES.HIGHLIGHTED}`).map((n: cytoscape.NodeSingular) => n.id());
  }

  getAllDimmed(): string[] {
    return this.cy.nodes(`.${CLASSES.DIMMED}`).not(`.${CLASSES.LAYER_PARENT}`).map((n: cytoscape.NodeSingular) => n.id());
  }
}
