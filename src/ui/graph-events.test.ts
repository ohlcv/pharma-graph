/**
 * @vitest-environment jsdom
 */
// Tests for the canvas-tap-while-tour path in graph-events.ts.
//
// Issue #11: previously the canvas-tap handler received closures that
// dereferenced `tourController`, which was `undefined` until later in boot.
// We now pass the TourController reference directly, so the handler can
// safely call `tourController.isRunning()` / `.stop()` at any time after
// boot reaches initGraphEvents().
//
// These tests use a minimal stub controller that records calls, plus a
// headless cytoscape graph so the `tap` event has a real target.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { initGraphEvents } from './graph-events.js';
import type { TourController } from './tour-controller.js';
import { Renderer } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';
import { DetailPanel } from './detail-panel.js';

/** Minimal fake — only the methods the canvas-tap path touches. */
function makeFakeTourController(): Pick<TourController, 'isRunning' | 'isPaused' | 'stop'> & {
  isRunning: ReturnType<typeof vi.fn>;
  isPaused: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  return {
    isRunning: vi.fn().mockReturnValue(false),
    isPaused: vi.fn().mockReturnValue(false),
    stop: vi.fn(),
  };
}

function makeStubCy() {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  return cy;
}

/**
 * The canvas-tap path under test only needs a handful of methods on each
 * injected dependency. `Pick<>` the precise subset so that future changes
 * to Renderer/HighlightEngine/DetailPanel surface here at compile time
 * rather than as silently-skipped test assertions. Each stub is cast via
 * `unknown` to widen the narrow mock shape into the wider interface.
 */
function makeStubRenderer() {
  return {} as unknown as Renderer;
}
function makeStubHighlight() {
  return { reset: () => {}, highlightNode: () => ({}) } as unknown as HighlightEngine;
}
function makeStubDetailPanel() {
  return { close: () => {}, show: () => {} } as unknown as DetailPanel;
}

describe('initGraphEvents — canvas tap + tour (issue #11 fix)', () => {
  let cy: cytoscape.Core;
  let tour: ReturnType<typeof makeFakeTourController>;

  beforeEach(() => {
    cy = makeStubCy();
    tour = makeFakeTourController();
  });

  it('does not call tourController.stop() when no tour is running', () => {
    // Stub the other deps — we only care that tourController is wired right.
    initGraphEvents({
      cy,
      renderer: makeStubRenderer(),
      highlight: makeStubHighlight(),
      detailPanel: makeStubDetailPanel(),
      spawnNodeRipple: () => {},
      setPrevSelectedNode: () => {},
      showEdgeTooltip: () => {},
      hideEdgeTooltip: () => {},
      showZoomIndicator: () => {},
      isDebugOverlayActive: () => false,
      updateForensicPanel: () => {},
      tourController: tour as unknown as TourController,
      setDragging: () => {},
      // Issue #19: setDragMode mock removed — Renderer.setDragMode and
      // GraphEventDeps.setDragMode were both removed. Drag-mode styling
      // now happens inside graph-events.ts via a file-local helper.
    });

    // Tap the empty canvas (target = cy itself).
    cy.emit('tap', { target: cy } as any);
    expect(tour.isRunning).toHaveBeenCalled();
    expect(tour.stop).not.toHaveBeenCalled();
  });

  it('stops the tour when canvas is tapped while running', () => {
    tour.isRunning.mockReturnValue(true);

    initGraphEvents({
      cy,
      renderer: makeStubRenderer(),
      highlight: makeStubHighlight(),
      detailPanel: makeStubDetailPanel(),
      spawnNodeRipple: () => {},
      setPrevSelectedNode: () => {},
      showEdgeTooltip: () => {},
      hideEdgeTooltip: () => {},
      showZoomIndicator: () => {},
      isDebugOverlayActive: () => false,
      updateForensicPanel: () => {},
      tourController: tour as unknown as TourController,
      setDragging: () => {},
      // Issue #19: setDragMode mock removed — Renderer.setDragMode and
      // GraphEventDeps.setDragMode were both removed. Drag-mode styling
      // now happens inside graph-events.ts via a file-local helper.
    });

    cy.emit('tap', { target: cy } as any);
    expect(tour.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the tour when canvas is tapped while paused (running + paused)', () => {
    tour.isRunning.mockReturnValue(true);
    tour.isPaused.mockReturnValue(true);

    initGraphEvents({
      cy,
      renderer: makeStubRenderer(),
      highlight: makeStubHighlight(),
      detailPanel: makeStubDetailPanel(),
      spawnNodeRipple: () => {},
      setPrevSelectedNode: () => {},
      showEdgeTooltip: () => {},
      hideEdgeTooltip: () => {},
      showZoomIndicator: () => {},
      isDebugOverlayActive: () => false,
      updateForensicPanel: () => {},
      tourController: tour as unknown as TourController,
      setDragging: () => {},
      // Issue #19: setDragMode mock removed — Renderer.setDragMode and
      // GraphEventDeps.setDragMode were both removed. Drag-mode styling
      // now happens inside graph-events.ts via a file-local helper.
    });

    cy.emit('tap', { target: cy } as any);
    expect(tour.stop).toHaveBeenCalledTimes(1);
  });

  it('does not crash when canvas tap fires immediately after init (race fixed)', () => {
    // Regression for issue #11: before the fix, the closure dereferenced
    // `tourController` (undefined at that moment) and threw.
    initGraphEvents({
      cy,
      renderer: makeStubRenderer(),
      highlight: makeStubHighlight(),
      detailPanel: makeStubDetailPanel(),
      spawnNodeRipple: () => {},
      setPrevSelectedNode: () => {},
      showEdgeTooltip: () => {},
      hideEdgeTooltip: () => {},
      showZoomIndicator: () => {},
      isDebugOverlayActive: () => false,
      updateForensicPanel: () => {},
      tourController: tour as unknown as TourController,
      setDragging: () => {},
      // Issue #19: setDragMode mock removed — Renderer.setDragMode and
      // GraphEventDeps.setDragMode were both removed. Drag-mode styling
      // now happens inside graph-events.ts via a file-local helper.
    });

    // Fire a tap right away — the controller is provided, not deferred.
    expect(() => cy.emit('tap', { target: cy } as any)).not.toThrow();
    // isRunning was called (handler ran), stop was not (tour not running).
    expect(tour.isRunning).toHaveBeenCalled();
    expect(tour.stop).not.toHaveBeenCalled();
  });

  it('does NOT touch tourController when tap target is a node, not the canvas', () => {
    tour.isRunning.mockReturnValue(true);

    let canvasTapCalls = 0;
    initGraphEvents({
      cy,
      renderer: {} as any,
      highlight: { reset: () => {}, highlightNode: () => ({}) } as any,
      detailPanel: { close: () => {}, show: () => {} } as any,
      spawnNodeRipple: () => {},
      setPrevSelectedNode: () => {},
      showEdgeTooltip: () => {},
      hideEdgeTooltip: () => {},
      showZoomIndicator: () => {},
      isDebugOverlayActive: () => false,
      updateForensicPanel: () => {},
      tourController: tour as unknown as TourController,
      setDragging: () => {},
      // Issue #19: setDragMode mock removed — Renderer.setDragMode and
      // GraphEventDeps.setDragMode were both removed. Drag-mode styling
      // now happens inside graph-events.ts via a file-local helper.
    });

    // Add a second listener that counts canvas-tap calls so we can prove
    // the `target === cy` guard works (cytoscape may emit node taps to BOTH
    // the element listener and the cy-level listener — only the cy-level
    // guard is what stops a node tap from triggering `stop()`).
    cy.on('tap', (e) => { if (e.target === cy) canvasTapCalls++; });

    const node = cy.add({ group: 'nodes', data: { id: 'n1', label: 'N1' } });
    // Node taps go through the element-level event, not cy.emit. We dispatch
    // it via `node.emit('tap')` and let cytoscape propagate it to the matching
    // element-level listener. (cy.emit alone would simulate a canvas tap.)
    node.emit('tap', { target: node } as any);

    // The canvas-tap handler must NOT have fired (target was a node).
    expect(canvasTapCalls).toBe(0);
    expect(tour.stop).not.toHaveBeenCalled();
  });
});