// src/ui/graph-events.ts
// All Cytoscape event bindings live here. The graph itself doesn't bind any
// events (it stays a pure rendering/positioning engine); this module owns the
// mapping from cytoscape events to UI actions.

import type cytoscape from 'cytoscape';
import { Renderer, CLASSES, RIPPLE_COLORS } from '../core/renderer.js';
import { EDGE_TYPE_STYLE } from '../core/config.js';
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
  const dbgBtn = document.getElementById('debug-toggle');

  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
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
      deps.spawnNodeRipple(rect.left + pos.x, rect.top + pos.y, node.data('color') || RIPPLE_COLORS.NODE);
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
    const edge = evt.target;
    const edgeType = edge.data('edgeType') as string | undefined;
    const edgeStyle = edgeType ? (EDGE_TYPE_STYLE[edgeType] ?? EDGE_TYPE_STYLE.default) : EDGE_TYPE_STYLE.default;
    const rippleColor = edgeStyle.color;
    const src = edge.source().renderedPosition();
    const tgt = edge.target().renderedPosition();
    const cont = edge.cy().container();
    if (src && tgt && cont) {
      const midX = (src.x + tgt.x) / 2;
      const midY = (src.y + tgt.y) / 2;
      const rect = cont.getBoundingClientRect();
      deps.spawnNodeRipple(rect.left + midX, rect.top + midY, rippleColor);
    }
    updateStats(cy);
    syncBottomSheetStats(cy);
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      clearShapeFilter();
      deps.highlight.reset();
      deps.detailPanel.close();
      // Tapping the empty canvas while a tour is active stops the tour.
      // 但如果点击目标是漫游条内部元素（如滑块、按钮），则不停止漫游。
      // 检查 originalEvent.target 是否是漫游条相关元素
      const originalTarget = evt.originalEvent?.target as HTMLElement | null;
      const isTourInteraction = originalTarget?.closest?.(
        '[data-tour-action], .tour-mob__range, .tour-dt__range, .tour-mob__cell, .tour-mob__track'
      );
      if (!isTourInteraction) {
        if (deps.tourController.isRunning() || deps.tourController.isPaused()) {
          deps.tourController.stop();
        }
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
    // 只清除当前节点的关联边上的 tour 预览，而非全图所有边
    node.connectedEdges().removeClass('tour-path-preview');
  });

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
    if (zoom < 0.02) cy.zoom(0.02);
    if (zoom > 5.0) cy.zoom(5.0);
    deps.showZoomIndicator(cy);
  });
}