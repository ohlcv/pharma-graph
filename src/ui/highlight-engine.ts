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

  /** Dim edges that are not connected to any highlighted node.
   *
   *  Was a per-edge `forEach` with an `addClass` inside: on a graph with a
   *  few thousand edges that's a few thousand separate class mutations, each
   *  invalidating style and emitting a `class` event. `edgesWith()` does the
   *  same "both endpoints highlighted" test as a single collection op, so the
   *  whole thing becomes two class mutations instead of E of them. */
  private dimUnhighlightedEdges(): void {
    const highlighted = this.cy.nodes(`.${CLASSES.HIGHLIGHTED}`);
    highlighted
      .edgesWith(highlighted)
      .removeClass(CLASSES.DIMMED)
      .addClass(CLASSES.HIGHLIGHTED_EDGE);
    this.cy.edges().not(`.${CLASSES.HIGHLIGHTED_EDGE}`).addClass(CLASSES.DIMMED);
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

    const node = this.cy.getElementById(nodeId);
    if (node.empty()) {
      this.resetClasses();
      return prev;
    }

    // One batch for the whole re-highlight: cytoscape defers style
    // recalculation and redraw to the end instead of running them after each
    // of the ~4 collection-wide class mutations below.
    this.cy.batch(() => {
      this.resetClasses();

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

      this.dimUnhighlightedNodes();
      this.dimUnhighlightedEdges();
    });

    return prev;
  }

  highlightNeighbors(nodeId: string): void {
    const node = this.cy.getElementById(nodeId);
    if (node.empty()) return;
    this.cy.batch(() => {
      node.neighborhood('node').not(`.${CLASSES.LAYER_PARENT}`).addClass(CLASSES.HIGHLIGHTED);
      node.connectedEdges().addClass(CLASSES.HIGHLIGHTED_EDGE);
      // 修复: 与 highlightNode 保持一致，确保邻居外的节点都被 dim
      this.dimUnhighlightedNodes();
      this.dimUnhighlightedEdges();
    });
  }

  highlightSearch(query: string): string[] {
    const results: string[] = [];
    this.resetClasses();

    if (!query.trim()) return results;

    const q = query.toLowerCase();
    this.cy.batch(() => {
      const candidates = this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`);
      // Partition first, then mutate each half once, instead of one
      // addClass/select per node.
      const hits = candidates.filter((n: cytoscape.NodeSingular) =>
        ((n.data('label') ?? '') as string).toLowerCase().includes(q),
      );
      const misses = candidates.not(hits);

      hits.addClass(CLASSES.HIGHLIGHTED).select();
      misses.addClass(CLASSES.DIMMED).unselect();
      hits.forEach((n: cytoscape.NodeSingular) => {
        results.push(n.id());
      });

      this.dimUnhighlightedEdges();
    });

    return results;
  }

  /**
   * Highlight nodes by their `fill` value (领域顶层类), e.g. `cls-drug`, `cls-feature`.
   */
  highlightFill(fill: string): void {
    this.cy.batch(() => {
      this.resetClasses();

      const candidates = this.cy.nodes().not(`.${CLASSES.LAYER_PARENT}`);
      const hits = candidates.filter((n: cytoscape.NodeSingular) => n.data('fill') === fill);
      hits.addClass(CLASSES.HIGHLIGHTED);
      candidates.not(hits).addClass(CLASSES.DIMMED);

      this.dimUnhighlightedEdges();
    });
  }

  highlightEdgeType(edgeType: string): void {
    this.cy.batch(() => {
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
    });
  }

  dimAll(): void {
    this.cy.elements().addClass(CLASSES.DIMMED);
  }

  highlightEdgeOnly(edgeId: string): void {
    const edge = this.cy.getElementById(edgeId);
    if (edge.empty()) return;
    this.cy.batch(() => {
      this.cy.elements().addClass(CLASSES.DIMMED);
      this.cy.elements().unselect();
      edge.removeClass(CLASSES.DIMMED).addClass(CLASSES.HIGHLIGHTED_EDGE);
      const ends = edge.source().union(edge.target());
      ends.removeClass(CLASSES.DIMMED).addClass(CLASSES.SELECTED_NODE).select();
    });
  }

  reset(): void {
    this.cy.batch(() => {
      this.resetClasses();
      // Clear any inline border styles set by highlightNode() (border-width,
      // border-color were set via style() to override CSS for selected nodes).
      // Without this, the inline style persists after reset() and blocks
      // CSS-based dimming/highlighting from taking effect.
      this.clearNodeInlineBorders();
    });
  }

  clearAllNodeInlineStyles(): void {
    this.cy.batch(() => this.clearNodeInlineBorders());
  }

  /** style() applies to a whole collection — no need to walk node by node. */
  private clearNodeInlineBorders(): void {
    this.cy.nodes().style({ 'border-width': null, 'border-color': null });
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
