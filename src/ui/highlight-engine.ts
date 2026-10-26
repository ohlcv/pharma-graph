// src/ui/highlight-engine.ts
// Highlighting, search highlighting, shape filtering, and reset logic.
// Consumes Renderer.CLASSES constants; operates directly on the Cytoscape core.

import cytoscape from 'cytoscape';
import { CLASSES } from '../core/renderer.js';

export class HighlightEngine {
  private prevSelectedNodeId: string | null = null;
  private prevSelectedNodeName: string | null = null;
  /** Ids of the current search hit set. `null` = no active search. */
  private searchHits: Set<string> | null = null;
  /** Cached lowercase `label` of every non-layer-parent node. */
  private labelRows: { count: number; rows: Array<{ id: string; text: string }> } | null = null;
  /** Elements currently dimmed by the active search via inline bypass. */
  private searchDimmed: cytoscape.CollectionReturnValue | null = null;

  constructor(private cy: cytoscape.Core) {}

  /** Expose the cytoscape instance for callers that need raw selection. */
  getCy(): cytoscape.Core {
    return this.cy;
  }

  // ── Private helpers: extract common patterns ──────────────────────────────────

  /**
   * Clear every interaction-state class from the graph and drop any selection.
   * Scoped to elements that actually carry one of these classes: cytoscape
   * re-runs style resolution for *every* element passed to `removeClass`, even
   * when the element doesn't have that class — a whole-graph sweep cost
   * ~860ms on this graph while the affected set is usually a few dozen nodes.
   */
  private resetClasses(): void {
    this.cy.batch(() => {
      this.cy
        .elements(
          [
            CLASSES.DIMMED,
            CLASSES.SELECTED_NODE,
            CLASSES.HIGHLIGHTED,
            CLASSES.HIGHLIGHTED_EDGE,
          ]
            .map((c) => `.${c}`)
            .join(', '),
        )
        .removeClass(
          [CLASSES.DIMMED, CLASSES.SELECTED_NODE, CLASSES.HIGHLIGHTED, CLASSES.HIGHLIGHTED_EDGE].join(
            ' ',
          ),
        );
      this.cy.$(':selected').unselect();
    });
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
    this.cy
      .nodes()
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
    this.searchHits = null;
    this.clearSearchDim();
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
    this.searchHits = null;
    this.clearSearchDim();
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

  /**
   * Lowercase label index, rebuilt only when the node count changes. Searching
   * used to call `data('label').toLowerCase()` for every node on every
   * keystroke — 2.7k allocations plus 2.7k cytoscape `data()` lookups per key,
   * which showed up as the single largest `dataImpl` cost in the CPU profile.
   */
  private getLabelRows(): Array<{ id: string; text: string }> {
    const count = this.cy.nodes().length;
    if (this.labelRows && this.labelRows.count === count) return this.labelRows.rows;
    const rows: Array<{ id: string; text: string }> = [];
    this.cy.nodes().forEach((n: cytoscape.NodeSingular) => {
      if (n.hasClass(CLASSES.LAYER_PARENT)) return;
      rows.push({ id: n.id(), text: String(n.data('label') ?? '').toLowerCase() });
    });
    this.labelRows = { count, rows };
    return rows;
  }

  highlightSearch(query: string): string[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      this.searchHits = null;
      this.clearSearchDim();
      this.cy.batch(() => this.resetClasses());
      return [];
    }

    const hits: string[] = [];
    for (const row of this.getLabelRows()) {
      if (row.text.includes(q)) hits.push(row.id);
    }
    const next = new Set(hits);

    const prev = this.searchHits;
    const prevLive = prev !== null && this.cy.nodes(`.${CLASSES.HIGHLIGHTED}`).length === prev.size;

    // Narrowing a query often leaves the hit set untouched (extra characters
    // that match nothing, or the same single drug). In that case skip the whole
    // restyle: cytoscape re-renders the viewport on any style change, and a
    // no-op keystroke would otherwise pay for the whole graph.
    if (
      prevLive &&
      prev.size === next.size &&
      // Self-check: another code path (focusOnNode on commit, a legend filter)
      // may have replaced `.highlighted` since the last search. Counting the
      // live class set is one selector pass and keeps the cache honest.
      [...next].every((id) => prev.has(id))
    ) {
      return hits;
    }

    if (!prevLive) {
      // Fresh search session. Hits get the `.highlighted` class; everything
      // else is dimmed with an *inline bypass* instead of `.dimmed`. Both end
      // up looking the same, but a class change forces cytoscape to re-match
      // the stylesheet (~0.2ms per element, ~750ms for this graph), while a
      // bypass only overrides one property (~0.02ms per element). That
      // difference is the typing freeze users hit on the first character.
      this.clearSearchDim();
      const hitNodes = this.nodesById(next);
      const hitEdges = hitNodes.edgesWith(hitNodes);
      this.cy.batch(() => {
        this.resetClasses();
        hitNodes.addClass(CLASSES.HIGHLIGHTED);
        hitEdges.addClass(CLASSES.HIGHLIGHTED_EDGE);
        this.dimElements(
          this.cy
            .elements()
            .not(hitNodes)
            .not(hitEdges)
            .not(`.${CLASSES.LAYER_PARENT}`),
        );
      });
      this.searchHits = next;
      return hits;
    }

    // Same search session — only touch the elements whose state actually
    // changed, so a keystroke costs O(delta) instead of O(graph).
    const added: string[] = [];
    for (const id of hits) if (!prev.has(id)) added.push(id);
    const removed: string[] = [];
    for (const id of prev) if (!next.has(id)) removed.push(id);

    this.cy.batch(() => {
      const addedNodes = this.nodesById(new Set(added));
      addedNodes.removeClass(CLASSES.DIMMED).removeStyle('opacity').addClass(CLASSES.HIGHLIGHTED);

      const removedNodes = this.nodesById(new Set(removed));
      removedNodes.removeClass(CLASSES.HIGHLIGHTED);
      this.dimElements(removedNodes);

      // Edges are only lit while both endpoints are hits, so every edge
      // touching a changed node needs re-evaluating.
      const touchedEdges = addedNodes.union(removedNodes).connectedEdges();
      const internalEdges = touchedEdges.filter(
        (e: cytoscape.EdgeSingular) => next.has(e.source().id()) && next.has(e.target().id()),
      );
      internalEdges.removeStyle('opacity').addClass(CLASSES.HIGHLIGHTED_EDGE);
      this.dimElements(touchedEdges.not(internalEdges).removeClass(CLASSES.HIGHLIGHTED_EDGE));
    });

    this.searchHits = next;
    return hits;
  }

  /**
   * Collect nodes by id with a plain JS filter — avoids generating a compound
   * selector (string escaping + selector engine) every keystroke.
   */
  private nodesById(ids: Set<string>): cytoscape.CollectionReturnValue {
    return this.cy.nodes().filter((n: cytoscape.NodeSingular) => ids.has(n.id()));
  }

  /** Opacity used for non-matches while a search is active (mirrors `.dimmed`). */
  private static readonly SEARCH_DIM_OPACITY = 0.1;

  /**
   * Dim elements with an inline bypass and remember them, so the whole set can
   * be restored in one go when the search ends or another highlight takes over.
   */
  private dimElements(elements: cytoscape.CollectionReturnValue): void {
    if (elements.empty()) return;
    elements.style('opacity', HighlightEngine.SEARCH_DIM_OPACITY);
    this.searchDimmed = this.searchDimmed ? this.searchDimmed.union(elements) : elements;
  }

  /** Restore every element dimmed by the current search. */
  private clearSearchDim(): void {
    if (!this.searchDimmed) return;
    this.cy.batch(() => this.searchDimmed?.removeStyle('opacity'));
    this.searchDimmed = null;
  }

  /**
   * Highlight nodes by their `fill` value (领域顶层类), e.g. `cls-drug`, `cls-feature`.
   */
  highlightFill(fill: string): void {
    this.searchHits = null;
    this.clearSearchDim();
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
    this.searchHits = null;
    this.clearSearchDim();
    this.cy.batch(() => {
      this.resetClasses();

      const matchingEdges = this.cy.edges(`[edgeType = "${edgeType}"]`);
      if (matchingEdges.length === 0) {
        this.cy.elements().addClass(CLASSES.DIMMED);
        return;
      }

      matchingEdges.addClass(CLASSES.HIGHLIGHTED_EDGE);
      matchingEdges.connectedNodes().not(`.${CLASSES.LAYER_PARENT}`).addClass(CLASSES.HIGHLIGHTED);
      this.cy
        .nodes()
        .not(`.${CLASSES.HIGHLIGHTED}`)
        .not(`.${CLASSES.LAYER_PARENT}`)
        .addClass(CLASSES.DIMMED);
      this.cy.edges().not(`.${CLASSES.HIGHLIGHTED_EDGE}`).addClass(CLASSES.DIMMED);
    });
  }

  dimAll(): void {
    this.searchHits = null;
    this.clearSearchDim();
    this.cy.elements().addClass(CLASSES.DIMMED);
  }

  highlightEdgeOnly(edgeId: string): void {
    this.searchHits = null;
    this.clearSearchDim();
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
    this.searchHits = null;
    this.clearSearchDim();
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
    return this.cy
      .nodes(`.${CLASSES.DIMMED}`)
      .not(`.${CLASSES.LAYER_PARENT}`)
      .map((n: cytoscape.NodeSingular) => n.id());
  }
}
