// src/ui/focus-node.ts
// Single source of truth for "navigate the camera to a node and update the
// visual selection state". Every entry point that opens a node funnels through
// here so a search-result confirm, a detail-panel neighbour click, a tour
// step, and a canvas tap all behave the same way.
//
// Modes:
//   - "commit" (default): select this one node, dim everything else, highlight
//     neighbours + their edges, and move the camera to the node.
//   - "preview": keep whatever visual state exists on the graph right now
//     (e.g. a batch of search matches already highlighted), and *only* move
//     the camera. Used by the search input's debounced auto-center so we can
//     preview the first result while the search list is still in view.

import cytoscape from 'cytoscape';

const LAYER_PARENT = 'layer-parent';
const SELECTED_NODE = 'selected-node';
const HIGHLIGHTED = 'highlighted';
const HIGHLIGHTED_EDGE = 'highlighted-edge';
const DIMMED = 'dimmed';

/** Default zoom level when focusing on a node from search / detail panels. */
const DEFAULT_FOCUS_ZOOM = 1.5;
/** Shorter animation for keyboard-driven navigation; roam uses 600ms elsewhere. */
const DEFAULT_FOCUS_DURATION = 400;

/** Options accepted by {@link focusOnNode}. */
export interface FocusOptions {
  /** Zoom level to land on. Defaults to {@link DEFAULT_FOCUS_ZOOM}. */
  zoom?: number;
  /** Animation duration in ms. Defaults to {@link DEFAULT_FOCUS_DURATION}. */
  duration?: number;
  /** Easing passthrough for `cy.animate`. */
  easing?: cytoscape.EasingFunction | string;
  /** Skip the camera animation (useful when callers want to chain their own). */
  skipCamera?: boolean;
  /** Skip resetting other selection state (e.g. during roam-managed steps). */
  preserveSelection?: boolean;
  /**
   * Move the camera but don't touch any classes. Useful for "preview" the
   * first search match while the result batch is still highlighted.
   */
  skipHighlight?: boolean;
}

/**
 * Focus the camera on `nodeId` and (unless {@link FocusOptions.skipHighlight})
 * mark it as the active selection:
 *   1. Stop any in-flight cy animation so queued moves don't fight each other.
 *   2. Clear the previous selected/dimmed/highlighted classes and unselect all.
 *   3. Add `.selected-node` to the target and call `node.select()`.
 *   4. Highlight neighbours + their connecting edges; dim the rest.
 *   5. Animate the camera to centre on the node (unless `skipCamera`).
 *
 * Returns `true` if the node exists and was focused, `false` otherwise.
 */
export function focusOnNode(
  cy: cytoscape.Core,
  nodeId: string,
  options: FocusOptions = {},
): boolean {
  const node = cy.getElementById(nodeId);
  if (node.empty()) return false;

  // 1. Cancel overlapping camera moves.
  cy.stop();

  if (options.skipHighlight) {
    if (!options.skipCamera) {
      cy.animate({
        center: { eles: node },
        zoom: options.zoom ?? DEFAULT_FOCUS_ZOOM,
        duration: options.duration ?? DEFAULT_FOCUS_DURATION,
        easing: options.easing ?? 'ease-out-cubic',
      });
    }
    return true;
  }

  // 2. Reset previous selection only when caller owns the state.
  if (!options.preserveSelection) {
    cy.elements().removeClass([DIMMED, SELECTED_NODE, HIGHLIGHTED, HIGHLIGHTED_EDGE].join(' '));
    cy.elements().unselect();
  }

  // 3. Promote the target.
  node.addClass(SELECTED_NODE);
  node.select();

  // 4. Re-apply highlight (only the target's neighbours).
  node.neighborhood('node').not(`.${LAYER_PARENT}`).addClass(HIGHLIGHTED);
  node.connectedEdges().addClass(HIGHLIGHTED_EDGE);

  // Dim everything else not promoted above.
  cy.nodes()
    .not(`.${LAYER_PARENT}`)
    .not(`.${SELECTED_NODE}`)
    .not(`.${HIGHLIGHTED}`)
    .addClass(DIMMED);
  cy.edges().not(`.${HIGHLIGHTED_EDGE}`).addClass(DIMMED);

  if (!options.skipCamera) {
    cy.animate({
      center: { eles: node },
      zoom: options.zoom ?? DEFAULT_FOCUS_ZOOM,
      duration: options.duration ?? DEFAULT_FOCUS_DURATION,
      easing: options.easing ?? 'ease-out-cubic',
    });
  }

  return true;
}
