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
import { CLASSES } from '@/core/renderer';
import {
  initGraphEvents,
  type GraphEventDeps,
} from '@/ui/graph-events';
import type { TourController } from '@/ui/tour-controller';
import type cytoscape from 'cytoscape';

// The fake cy returns two nodes — `_trackedNode` mimics the user-grabbed
// node (must be EXCLUDED from dragging-simplified, otherwise the grabbed
// node's border is overwritten by the dimmed style); a second `otherNode`
// stands for the rest of the graph (gets the class so the perf-simplification
// kicks in). A nodeSet selectors route accordingly so `cy.nodes(':grabbed')`
// and `cy.nodes()` behave like the real cytoscape would.
function makeFakeCytoscape() {
  let grabbedId: string | null = null;
  let dragClassCounter = 0;
  const trackedNode = {
    id: 'b',
    grabbed: () => grabbedId === 'b',
    hasClass: (cls: string) => cls === CLASSES.DRAGGING_SIMPLIFIED && false,
    addClass() {},
    removeClass() {},
  };
  const otherNode = {
    id: 'a',
    grabbed: () => grabbedId === 'a',
    addClass(cls: string) { if (cls === CLASSES.DRAGGING_SIMPLIFIED) dragClassCounter += 1; },
    removeClass(cls: string) { if (cls === CLASSES.DRAGGING_SIMPLIFIED) dragClassCounter = Math.max(0, dragClassCounter - 1); },
    _isDragging: () => dragClassCounter > 0,
  };
  const events = new Map<string, Array<(evt: unknown) => void>>();
  // Tiny collection helper: just enough of cytoscape's Collection surface
  // for graph-events.ts to drive — `.not(selector)` to negate a selector,
  // plus `addClass`/`removeClass` that fan out to every node in the
  // collection. We don't need full set algebra; only `.not` is called.
  const makeCollection = (list: typeof trackedNode[]) => ({
    not(selector: string) {
      if (selector === ':grabbed') {
        return makeCollection(list.filter((n) => !n.grabbed()));
      }
      return makeCollection(list);
    },
    addClass(cls: string) { list.forEach((n) => n.addClass(cls)); },
    removeClass(cls: string) { list.forEach((n) => n.removeClass(cls)); },
  });
  const allNodes = () => [trackedNode, otherNode] as unknown as ReturnType<typeof makeCollection>;
  const cy: cytoscape.Core = {
    _trackedNode: trackedNode,
    _otherNode: otherNode,
    nodes: (sel?: string) => {
      const list = [trackedNode, otherNode];
      if (sel === ':grabbed') return makeCollection(list.filter((n) => n.grabbed())) as unknown as cytoscape.NodeCollection;
      return makeCollection(list) as unknown as cytoscape.NodeCollection;
    },
    edges: () => makeCollection([otherNode] as unknown as ReturnType<typeof makeCollection>) as unknown as cytoscape.EdgeCollection,
    _isDragging: () => dragClassCounter > 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(...args: any[]) {
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
      // Keep fake grabbed-id in sync so cy.nodes(':grabbed') and the
      // .not(':grabbed') filter return the right slice during this event.
      const grabId = (payload as { target?: { id?: string } } | undefined)?.target?.id;
      if (ev === 'grab') grabbedId = grabId ?? grabbedId;
      else if (ev === 'free' || ev === 'dragfree') grabbedId = null;
      const keyAny = events.get(ev) ?? [];
      const keySel = sel !== undefined ? (events.get(`${ev}|${String(sel)}`) ?? []) : [];
      [...keyAny, ...keySel].forEach((h) => h(payload));
    },
    layout: () => ({ run: () => {} }) as unknown as cytoscape.Layouts,
    fit: () => {},
    zoom: () => 1,
  } as unknown as cytoscape.Core;
  // Suppress the unused-allNodes helper warning while keeping it for
  // readers who want to see how the real cy.nodes() contract is mocked.
  void allNodes;
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
    showZoomIndicator: () => {},
    isDebugOverlayActive: () => false,
    updateForensicPanel: () => {},
    tourController: tour,
    setDragging: () => {},
  };
}

describe('graph-events post-#19 drag-mode helper', () => {
  it('enters dragging-simplified on first drag (not grab), exits on free / dragfree', () => {
    const cy = makeFakeCytoscape();
    const deps = makeDeps(cy);
    initGraphEvents(deps);

    const cyx = cy as any;
    // `_trackedNode` plays the role of the user-grabbed node. It must NEVER
    // receive the simplified class — that's what was killing its border
    // before the fix. `_otherNode` plays the rest of the graph and IS the
    // one we expect to see gain/lose the class.
    cyx.emit('grab', 'node', { target: { id: 'b' } });
    // grab 只开始 force-drag；等第一个 drag 事件来了才开 simplified（区分拖动与点击）。
    cyx.emit('drag', { target: { id: 'b' } });
    expect(cyx._otherNode._isDragging()).toBe(true);
    cyx.emit('free', 'node', { target: { id: 'b' } });
    expect(cyx._otherNode._isDragging()).toBe(false);

    // Also exercised by dragfree (the fallback path when free is missed).
    cyx.emit('grab', 'node', { target: { id: 'b' } });
    cyx.emit('drag', { target: { id: 'b' } });
    cyx.emit('dragfree', { target: { id: 'b' } });
    expect(cyx._otherNode._isDragging()).toBe(false);
  });
});
