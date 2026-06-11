// src/ui/highlight-engine.ts
// Highlighting, search highlighting, shape filtering, and reset logic.
// Consumes Renderer.CLASSES constants; operates directly on the Cytoscape core.

import cytoscape from 'cytoscape';
import { CLASSES } from '../core/renderer.js';

export class HighlightEngine {
  private prevSelectedNodeId: string | null = null;
  private prevSelectedNodeName: string | null = null;

  constructor(private cy: cytoscape.Core) {}

  highlightNode(nodeId: string): {
    prevNodeId: string | null;
    prevNodeName: string | null;
  } {
    const prev = this.getSelectedNodeInfo();

    this.cy.elements().removeClass(
      [CLASSES.DIMMED, CLASSES.SELECTED_NODE, CLASSES.HIGHLIGHTED, CLASSES.HIGHLIGHTED_EDGE].join(' '),
    );
    this.cy.elements().unselect();

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
    node.neighborhood('node').not(`.${CLASSES.LAYER_PARENT}`).addClass(CLASSES.HIGHLIGHTED);
    node.connectedEdges().addClass(CLASSES.HIGHLIGHTED_EDGE);

    this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`).not(`.${CLASSES.SELECTED_NODE}`).not(`.${CLASSES.HIGHLIGHTED}`).addClass(CLASSES.DIMMED);
    // Also dim edges that are not connected to the selected node.
    this.cy.edges().not(`.${CLASSES.HIGHLIGHTED_EDGE}`).addClass(CLASSES.DIMMED);

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
    this.cy.elements().removeClass(
      [CLASSES.DIMMED, CLASSES.SELECTED_NODE, CLASSES.HIGHLIGHTED, CLASSES.HIGHLIGHTED_EDGE].join(' '),
    );
    this.cy.elements().unselect();

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

    return results;
  }

  highlightShape(shape: string): void {
    this.cy.elements().removeClass(
      [CLASSES.DIMMED, CLASSES.HIGHLIGHTED, CLASSES.SELECTED_NODE, CLASSES.HIGHLIGHTED_EDGE].join(' '),
    );

    this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`).forEach((n: cytoscape.NodeSingular) => {
      if (n.style('shape') === shape) {
        n.addClass(CLASSES.HIGHLIGHTED);
      } else {
        n.addClass(CLASSES.DIMMED);
      }
    });
  }

  highlightField(field: string): void {
    this.cy.elements().removeClass(
      [CLASSES.DIMMED, CLASSES.HIGHLIGHTED, CLASSES.SELECTED_NODE, CLASSES.HIGHLIGHTED_EDGE].join(' '),
    );

    this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`).forEach((n: cytoscape.NodeSingular) => {
      if (n.data('field') === field) {
        n.addClass(CLASSES.HIGHLIGHTED);
      } else {
        n.addClass(CLASSES.DIMMED);
      }
    });
  }

  highlightTier(tier: string): void {
    this.cy.elements().removeClass(
      [CLASSES.DIMMED, CLASSES.HIGHLIGHTED, CLASSES.SELECTED_NODE, CLASSES.HIGHLIGHTED_EDGE].join(' '),
    );

    this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`).forEach((n: cytoscape.NodeSingular) => {
      if (n.data('tier') === tier) {
        n.addClass(CLASSES.HIGHLIGHTED);
      } else {
        n.addClass(CLASSES.DIMMED);
      }
    });
  }

  highlightEdgeType(edgeType: string): void {
    this.cy.elements().removeClass(
      [CLASSES.DIMMED, CLASSES.HIGHLIGHTED, CLASSES.SELECTED_NODE, CLASSES.HIGHLIGHTED_EDGE].join(' '),
    );

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
    this.cy.elements().removeClass(
      [CLASSES.DIMMED, CLASSES.SELECTED_NODE, CLASSES.HIGHLIGHTED, CLASSES.HIGHLIGHTED_EDGE].join(' '),
    );
    this.cy.elements().unselect();
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
