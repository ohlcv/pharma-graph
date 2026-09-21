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
import {
  onDragStart as forceDragStart,
  onDrag as forceDrag,
  onDragEnd as forceDragEnd,
  cancel as cancelForceDrag,
} from '../core/force-drag.js';

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

  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
    // 按需查找：#debug-toggle 是 initDebugOverlay() 才注入的，而它在 initGraphEvents() 之后执行，
    // 在这里提前缓存拿到的永远是 null。
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
      deps.spawnNodeRipple(rect.left + pos.x, rect.top + pos.y, node.data('color') || RIPPLE_COLORS.NODE);
    }
    const prev = deps.highlight.highlightNode(node.id());
    deps.setPrevSelectedNode(prev.prevNodeId, prev.prevNodeName);
    // `.selected-node` is added by highlightNode(); the tour bar's generic
    // `class` listener used to catch that, but it fired for every class
    // change on every node (O(N²)). Now we tell it explicitly — the call is
    // coalesced into one rAF on the controller side.
    deps.tourController.refreshStartHintFromHighlight();
    deps.detailPanel.show(node.id(), true); // 用户手动点击节点
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
      deps.tourController.refreshStartHintFromHighlight();
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
    // 无条件摘掉 hovered。原来遇到 dimmed / highlighted 就 return，而 resetClasses()
    // 又不清 hovered，悬停过的高亮邻居在取消选中后会一直带着悬停描边。
    node.removeClass('hovered');
    // 只清除当前节点的关联边上的 tour 预览，而非全图所有边
    node.connectedEdges().removeClass('tour-path-preview');
  });

  // Whether the simplified-visual class is currently applied. Tracked so a
  // plain tap never pays for it: cytoscape fires `grab`/`free` for a tap on a
  // node too, not just for a real drag, and `setCytoscapeDragMode` touches a
  // class on EVERY node. Flipping it on grab meant a single click cost two
  // full-graph class sweeps (plus the listener storm each sweep triggers).
  let dragModeOn = false;

  cy.on('grab', 'node', () => {
    deps.setDragging(true);
    // Begin the force-drag gesture: defer building the simulation until the
    // first drag event, so a plain tap never pays for a BFS + d3-force setup.
    const grabbed = cy.nodes(':grabbed');
    if (grabbed.length > 0) forceDragStart(grabbed);
  });
  // Position-tracked force-drag: cytoscape fires `drag` (with no selector) on
  // every mouse-move while ANY node is being dragged. The d3-force simulation
  // pinned to the grabbed nodes then pulls neighbours along via edge springs.
  cy.on('drag', () => {
    // Issue #19: was `deps.setDragMode(true)`, a passthrough to Renderer.
    // Toggling the simplified class is meaningful only while a node is
    // actually moving, so it's done inline here — and only once the first
    // `drag` arrives, which is what distinguishes a drag from a tap.
    if (!dragModeOn) {
      dragModeOn = true;
      setCytoscapeDragMode(cy, true);
    }
    forceDrag();
  });
  cy.on('free', 'node', () => {
    deps.setDragging(false);
    if (dragModeOn) {
      setCytoscapeDragMode(cy, false);
      dragModeOn = false;
    }
    // Release the grabbed nodes from the cursor. The simulation keeps
    // running with the dropped positions pinned and decays naturally
    // (~1s after release); we drop it synchronously here so the settling
    // starts the moment the user releases, even if `dragfree` hasn't
    // fired yet.
    forceDragEnd();
  });
  // Any layout start (manual switch, hotkey, programmatic) must abort
  // an in-flight force-drag session — otherwise the simulation's tick
  // would overwrite the new layout's positions frame-by-frame.
  cy.on('layoutstart', () => cancelForceDrag());
  cy.on('dragfree', () => {
    deps.setDragging(false);
    // `free` already reset drag mode; doing it again here was a second
    // redundant full-graph class sweep.
    if (dragModeOn) {
      setCytoscapeDragMode(cy, false);
      dragModeOn = false;
    }
    updateStats(cy);
    syncBottomSheetStats(cy);
  });
  cy.on('layoutstop', () => { updateStats(cy); syncBottomSheetStats(cy); });
  cy.on('select', () => { updateStats(cy); syncBottomSheetStats(cy); });
  cy.on('unselect', () => { updateStats(cy); syncBottomSheetStats(cy); });

  // Keep stats + bottom-sheet counters in sync while streaming is still
  // pumping batches through `cy.add()`. Without this hook the counters stay
  // stuck at "0" until boot() resumes after `await loadContentStreaming()` —
  // the loading pill in the corner tells users "30 / 50" but the stats bar
  // keeps showing 0/0, which reads as a broken UI. `add` fires for both the
  // initial `cy.add()` inside initGraphFromManager and every batch in
  // appendBatchToGraph; both `updateStats` and `syncBottomSheetStats` are
  // debounced so we won't thrash when a batch adds hundreds of nodes at once.
  cy.on('add', () => { updateStats(cy); syncBottomSheetStats(cy); });

  // 缩放上下限由 cytoscape 自己的 minZoom / maxZoom 保证（见 Renderer 选项）；
  // 这里原来的 5.0 钳制和 maxZoom=4.0 对不上，且永远不会生效。
  cy.on('zoom', () => {
    deps.showZoomIndicator(cy);
  });
}