// src/ui/graph-events.ts
// All Cytoscape event bindings live here. The graph itself doesn't bind any
// events (it stays a pure rendering/positioning engine); this module owns the
// mapping from cytoscape events to UI actions.

import type cytoscape from 'cytoscape';
import { Renderer, CLASSES } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';
import { DetailPanel } from './detail-panel.js';
import { TourController } from './tour-controller.js';
import { updateStats, syncBottomSheetStats } from './graph-stats.js';
import { clearShapeFilter } from './legend-manager.js';
import { isBigscreen, exitBigscreen } from './bigscreen.js';

export interface GraphEventDeps {
  cy: cytoscape.Core;
  renderer: Renderer;
  highlight: HighlightEngine;
  detailPanel: DetailPanel;
  spawnNodeRipple: (x: number, y: number, color: string) => void;
  setPrevSelectedNode: (id: string | null, label: string | null) => void;
  showEdgeTooltip: (text: string, x: number, y: number) => void;
  hideEdgeTooltip: () => void;
  showZoomIndicator: (cy: cytoscape.Core) => void;
  isDebugOverlayActive: () => boolean;
  updateForensicPanel: (renderer: Renderer) => void;
  /** Tour controller — must be constructed BEFORE this is called. Required so
   *  the canvas-tap handler can ask "is a tour running?" without racing against
   *  the boot sequence (issue #11). */
  tourController: TourController;
  setDragging: (dragging: boolean) => void;
}

/**
 * Issue #19 (removed): Renderer previously exposed
 * `getEdgeReason` / `getEdgeMidpoint` / `setDragMode` — three single-purpose
 * helpers that only ever had one caller (this file). The reason lookup was a
 * one-liner over `edge.data('reason')`; the midpoint was a pure geometry
 * calc; the drag-mode toggle was a class flip meaningful only in the
 * context of node-drag events. All three now live here, next to the
 * bindings that use them, so Renderer is reduced to "container +
 * stylesheet + layout".
 */
function edgeMidpoint(edge: cytoscape.EdgeSingular): { x: number; y: number } {
  const src = edge.source().renderedPosition();
  const tgt = edge.target().renderedPosition();
  if (!src || !tgt) return { x: 0, y: 0 };
  return { x: (src.x + tgt.x) / 2, y: (src.y + tgt.y) / 2 };
}

function setCytoscapeDragMode(cy: cytoscape.Core, on: boolean): void {
  // Adds/removes the simplified-visual CSS class on every node. Lives next
  // to the `grab`/`free`/`dragfree` event bindings below because the toggle
  // is meaningful only while a node is being dragged through cytoscape's
  // own gesture pipeline.
  const op = on ? 'addClass' : 'removeClass';
  cy.nodes()[op](CLASSES.DRAGGING_SIMPLIFIED);
}

export function initGraphEvents(deps: GraphEventDeps): void {
  const { cy } = deps;

  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
    const dbgBtn = document.getElementById('debug-toggle');
    if (dbgBtn) {
      dbgBtn.style.transition = 'none';
      dbgBtn.style.background = '#4338ca';
      dbgBtn.style.color = '#fff';
      requestAnimationFrame(() => {
        dbgBtn.style.transition = 'background 0.5s, color 0.5s';
        dbgBtn.style.background = '';
        dbgBtn.style.color = '';
      });
    }
    const cont = node.cy().container();
    if (cont) {
      const pos = node.renderedPosition();
      const rect = cont.getBoundingClientRect();
      deps.spawnNodeRipple(rect.left + pos.x, rect.top + pos.y, node.data('color') || '#818cf8');
    }
    const prev = deps.highlight.highlightNode(node.id());
    deps.setPrevSelectedNode(prev.prevNodeId, prev.prevNodeName);
    deps.detailPanel.show(node.id());
    updateStats(cy);
    syncBottomSheetStats(cy);

    if (deps.isDebugOverlayActive()) {
      deps.updateForensicPanel(deps.renderer);
    }
  });

  cy.on('tap', 'edge', (evt) => {
    deps.highlight.highlightEdgeOnly(evt.target.id());
    updateStats(cy);
    syncBottomSheetStats(cy);
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      clearShapeFilter();
      deps.highlight.reset();
      deps.detailPanel.close();
      // Tapping the empty canvas while a tour is active stops the tour.
      // (Issue #11: tourController is guaranteed non-null here because
      // main.ts constructs it before calling initGraphEvents.)
      if (deps.tourController.isRunning() || deps.tourController.isPaused()) {
        deps.tourController.stop();
      }
    }
  });

  // Double-tap the canvas background → exit bigscreen mode.
  cy.on('dbltap', (evt) => {
    if (evt.target === cy && isBigscreen()) {
      void exitBigscreen();
    }
  });

  cy.on('mouseover', 'node', (evt) => {
    const node = evt.target;
    if (node.hasClass('dimmed')) return;
    node.addClass('hovered');
  });

  cy.on('mouseout', 'node', (evt) => {
    const node = evt.target;
    if (node.hasClass('dimmed') || node.hasClass('highlighted')) return;
    node.removeClass('hovered');
    cy.edges().removeClass('tour-path-preview');
  });

  cy.on('mouseover', 'edge', (evt) => {
    // Issue #19: was `deps.renderer.getEdgeReason(evt.target)` and
    // `deps.renderer.getEdgeMidpoint(...)`; both helpers only existed
    // for this single caller, so the logic moved file-local.
    const reason = evt.target.data('reason') as string | undefined;
    if (!reason) return;
    const mid = edgeMidpoint(evt.target);
    deps.showEdgeTooltip(reason, mid.x, mid.y);
  });

  cy.on('mouseout', 'edge', () => { deps.hideEdgeTooltip(); });

  cy.on('grab', 'node', () => {
    deps.setDragging(true);
    // Issue #19: was `deps.setDragMode(true)`, a passthrough to
    // Renderer. Toggling the simplified class is meaningful only in the
    // context of cytoscape's grab/free gesture, so it's done inline here.
    setCytoscapeDragMode(cy, true);
  });
  cy.on('free', 'node', () => {
    deps.setDragging(false);
    setCytoscapeDragMode(cy, false);
  });
  cy.on('dragfree', () => {
    deps.setDragging(false);
    setCytoscapeDragMode(cy, false);
    updateStats(cy);
    syncBottomSheetStats(cy);
  });
  cy.on('layoutstop', () => { updateStats(cy); syncBottomSheetStats(cy); });
  cy.on('select', () => { updateStats(cy); syncBottomSheetStats(cy); });
  cy.on('unselect', () => { updateStats(cy); syncBottomSheetStats(cy); });

  cy.on('zoom', () => {
    const zoom = cy.zoom();
    if (zoom < 0.05) cy.zoom(0.05);
    if (zoom > 5.0) cy.zoom(5.0);
    deps.showZoomIndicator(cy);
  });
}