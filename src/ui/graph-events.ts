// src/ui/graph-events.ts
// All Cytoscape event bindings live here. The graph itself doesn't bind any
// events (it stays a pure rendering/positioning engine); this module owns the
// mapping from cytoscape events to UI actions.

import type cytoscape from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';
import { DetailPanel } from './detail-panel.js';
import { updateStats, syncBottomSheetStats } from './graph-stats.js';
import { clearShapeFilter } from './legend-manager.js';

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
  onCanvasTapWhileTour: () => boolean;
  onCanvasTapWhileTourClear: () => void;
  setDragging: (dragging: boolean) => void;
  setDragMode: (dragMode: boolean) => void;
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
      if (deps.onCanvasTapWhileTour()) deps.onCanvasTapWhileTourClear();
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
    const reason = deps.renderer.getEdgeReason(evt.target);
    if (!reason) return;
    const mid = deps.renderer.getEdgeMidpoint(evt.target);
    deps.showEdgeTooltip(reason, mid.x, mid.y);
  });

  cy.on('mouseout', 'edge', () => { deps.hideEdgeTooltip(); });

  cy.on('grab', 'node', () => { deps.setDragging(true); deps.setDragMode(true); });
  cy.on('free', 'node', () => { deps.setDragging(false); deps.setDragMode(false); });
  cy.on('dragfree', () => {
    deps.setDragging(false);
    deps.setDragMode(false);
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