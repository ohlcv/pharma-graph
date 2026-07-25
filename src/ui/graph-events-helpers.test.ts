// Tests for the file-local helpers that used to live on Renderer before #19:
//   - `edgeMidpoint(edge)` — averages source/target rendered positions
//   - `setCytoscapeDragMode(cy, on)` — toggles `.dragging-simplified`
//
// These were originally `Renderer.getEdgeReason` / `Renderer.getEdgeMidpoint`
// / `Renderer.setDragMode`. After #19, Renderer dropped the convenience
// wrappers; the implementations moved into graph-events.ts because each had
// exactly one caller and the behaviour only made sense in the context of
// graph-event bindings.
//
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { CLASSES } from '../core/renderer.js';
import {
  initGraphEvents,
  type GraphEventDeps,
} from './graph-events.js';
import type { TourController } from './tour-controller.js';
import type cytoscape from 'cytoscape';

// The fake cy keeps a counter on trackedNode that reflects drag-mode toggles.
function makeFakeCytoscape() {
  const nodes: unknown[] = [];
  let dragClassCounter = 0;
  const trackedNode = {
    id: 'b',
    hasClass: (cls: string) => cls === CLASSES.DRAGGING_SIMPLIFIED && dragClassCounter > 0,
    addClass(cls: string) { if (cls === CLASSES.DRAGGING_SIMPLIFIED) dragClassCounter += 1; },
    removeClass(cls: string) { if (cls === CLASSES.DRAGGING_SIMPLIFIED) dragClassCounter = Math.max(0, dragClassCounter - 1); },
    // Test introspection:
    _isDragging: () => dragClassCounter > 0,
  };
  const events = new Map<string, Array<(evt: unknown) => void>>();
  const cy: cytoscape.Core = {
    _trackedNode: trackedNode,
    nodes: () => trackedNode as unknown as cytoscape.NodeCollection,
    edges: () => trackedNode as unknown as cytoscape.EdgeCollection,
    _isDragging: () => dragClassCounter > 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(...args: any[]) {
      // cytoscape.on accepts `on(eventName, handler)` or
      // `on(eventName, selector, handler)`. Normalise.
      const [evtOrFirst, secondOrSecond, handler] = args as [unknown, unknown?, unknown?];
      const evt = String(evtOrFirst);
      const sel = typeof secondOrSecond === 'function' ? undefined : secondOrSecond;
      const cb = (typeof secondOrSecond === 'function' ? secondOrSecond : handler) as (e: unknown) => void;
      const key = sel === undefined ? evt : `${evt}|${String(sel)}`;
      const list = events.get(key) ?? [];
      list.push(cb);
      events.set(key, list);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emit(...args: any[]) {
      const [evtOrFirst, sel, payload] = args as [unknown, unknown?, unknown?];
      const ev = String(evtOrFirst);
      const keyAny = events.get(ev) ?? [];
      const keySel = sel !== undefined ? (events.get(`${ev}|${String(sel)}`) ?? []) : [];
      [...keyAny, ...keySel].forEach((h) => h(payload));
    },
    layout: () => ({ run: () => {} }) as unknown as cytoscape.Layouts,
    fit: () => {},
    zoom: () => 1,
  } as unknown as cytoscape.Core;
  return cy;
}

function makeDeps(cy: cytoscape.Core): GraphEventDeps {
  const tour = { isRunning: () => false, stop: () => {} } as unknown as TourController;
  return {
    cy,
    renderer: {} as GraphEventDeps['renderer'],
    highlight: {} as GraphEventDeps['highlight'],
    detailPanel: {} as GraphEventDeps['detailPanel'],
    spawnNodeRipple: () => {},
    setPrevSelectedNode: () => {},
    showEdgeTooltip: () => {},
    hideEdgeTooltip: () => {},
    showZoomIndicator: () => {},
    isDebugOverlayActive: () => false,
    updateForensicPanel: () => {},
    tourController: tour,
    setDragging: () => {},
    // Issue #19: setDragMode removed.
  };
}

describe('graph-events post-#19 drag-mode helper', () => {
  it('adds and removes dragging-simplified on grab / free / dragfree', () => {
    const cy = makeFakeCytoscape();
    const deps = makeDeps(cy);
    initGraphEvents(deps);

    const cyx = cy as any;
    expect(cyx._trackedNode._isDragging()).toBe(false);
    cyx.emit('grab', 'node', { target: { id: 'b' } });
    expect(cyx._trackedNode._isDragging()).toBe(true);
    cyx.emit('free', 'node', { target: { id: 'b' } });
    expect(cyx._trackedNode._isDragging()).toBe(false);

    // Also exercised by dragfree (the fallback path when free is missed).
    cyx.emit('grab', 'node', { target: { id: 'b' } });
    cyx.emit('dragfree', { target: { id: 'b' } });
    expect(cyx._trackedNode._isDragging()).toBe(false);
  });
});

// Pure-logic test for the midpoint helper. We can't call the file-local
// `edgeMidpoint` directly, but its behaviour is exercised by every edge
// hover that fires `showEdgeTooltip` — so we use the same hook here.
describe('edge hover → tooltip', () => {
  it('shows tooltip with reason and midpoint coordinates', () => {
    const cy = makeFakeCytoscape();
    const deps = makeDeps(cy);
    let captured: { text: string; x: number; y: number } | null = null;
    deps.showEdgeTooltip = (text, x, y) => { captured = { text, x, y }; };
    initGraphEvents(deps);

    const fakeEdge = {
      data: (k: string) => (k === 'reason' ? '因为它很相关' : undefined),
      source: () => ({ renderedPosition: () => ({ x: 10, y: 20 }) }),
      target: () => ({ renderedPosition: () => ({ x: 30, y: 40 }) }),
    };
    const cyx = cy as any;
    cyx.emit('mouseover', 'edge', { target: fakeEdge });
    expect(captured).toEqual({ text: '因为它很相关', x: 20, y: 30 });
  });

  it('does not show the tooltip when reason is missing', () => {
    const cy = makeFakeCytoscape();
    const deps = makeDeps(cy);
    let called = false;
    deps.showEdgeTooltip = () => { called = true; };
    initGraphEvents(deps);

    const fakeEdge = {
      data: () => undefined,
      source: () => ({ renderedPosition: () => ({ x: 0, y: 0 }) }),
      target: () => ({ renderedPosition: () => ({ x: 0, y: 0 }) }),
    };
    (cy as any).emit('mouseover', 'edge', { target: fakeEdge });
    expect(called).toBe(false);
  });
});
