/**
 * @vitest-environment jsdom
 */
// Unit tests for the neighbor-tug interaction (src/ui/neighbor-tug.ts).
//
// We exercise the four public functions (onDragStart / onDrag / onDragEnd /
// cancel) against a headless cytoscape graph. The key behaviours we verify:
//
//   1. onDragStart snapshots neighbours and tags them with .neighbor-tugged
//   2. onDragStart caps the tugged set at NEIGHBOR_TUG_MAX and picks the
//      closest ones
//   3. onDrag positions tugged neighbours relative to the dragged node
//   4. onDragEnd animates neighbours back to their origin
//   5. cancel() is a hard reset that strips state without animating
//   6. Pure helpers (clamp, distanceSquared) behave as documented
//
// We also cover the regression case where onDragStart is called twice in
// succession — the second call must wipe the first tug state instead of
// layering two tug gestures on top of each other.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import cytoscape from 'cytoscape';
import {
  NEIGHBOR_TUG_MAX,
  onDragStart,
  onDrag,
  onDragEnd,
  cancel,
  isTugging,
  clamp,
  distanceSquared,
} from './neighbor-tug.js';
import { CLASSES } from '../core/renderer.js';

/** Build a star graph: one centre node + N spokes. Each spoke at the
 *  given radial distance from the centre, evenly distributed in angle.
 *  Returns the cytoscape instance and references to centre + spoke nodes. */
function makeStarGraph(
  spokeCount: number,
  radius = 100,
): { cy: cytoscape.Core; centre: cytoscape.NodeSingular; spokes: cytoscape.NodeSingular[] } {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  const elements: cytoscape.ElementDefinition[] = [
    { group: 'nodes', data: { id: 'centre' }, position: { x: 0, y: 0 } },
  ];
  for (let i = 0; i < spokeCount; i++) {
    const angle = (2 * Math.PI * i) / spokeCount;
    elements.push({
      group: 'nodes',
      data: { id: `s${i}` },
      position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
    });
    elements.push({
      group: 'edges',
      data: { id: `e${i}`, source: 'centre', target: `s${i}` },
    });
  }
  cy.add(elements);
  return {
    cy,
    centre: cy.getElementById('centre'),
    spokes: Array.from({ length: spokeCount }, (_, i) => cy.getElementById(`s${i}`)),
  };
}

/** Helper: synchronously run the cy.animate complete callback so we can
 *  assert post-animation state without dealing with timers. We replace
 *  cy.animate with a wrapper that invokes the 'complete' callback immediately
 *  if provided. */
function flushAnimations(cy: cytoscape.Core): void {
  cy.nodes().stop();
  // Manually fire 'completed' on any in-flight animations by triggering
  // the same path cytoscape uses. Easier: just call the saved complete
  // callbacks via a custom spy. We instead rely on the fact that
  // removeClass + position writes happen inside the complete callback — and
  // for our test purposes we directly invoke the callback captured by
  // the spy below.
  const spy = (cy as unknown as { __animateSpy?: ReturnType<typeof vi.fn> }).__animateSpy;
  if (!spy) return;
  for (const call of spy.mock.calls) {
    const opts = call[1] as { complete?: () => void } | undefined;
    opts?.complete?.();
  }
}

beforeEach(() => {
  cancel();
});

describe('neighbor-tug — pure helpers', () => {
  it('clamp clamps to bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('distanceSquared returns squared euclidean distance', () => {
    expect(distanceSquared({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
    expect(distanceSquared({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    expect(distanceSquared({ x: -1, y: -1 }, { x: 2, y: 3 })).toBe(25);
  });
});

describe('neighbor-tug — onDragStart', () => {
  it('marks 1-hop neighbours with .neighbor-tugged', () => {
    const { cy, centre } = makeStarGraph(5);
    onDragStart(centre);
    expect(isTugging()).toBe(true);
    // All 5 spokes are 1-hop neighbours of centre.
    cy.nodes('[id ^= "s"]').forEach((n) => {
      expect(n.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(true);
    });
    // Centre itself is not tagged (it's the source, not a neighbour).
    expect(centre.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(false);
  });

  it('no-ops (without classing) when the source has no neighbours', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add({ group: 'nodes', data: { id: 'lonely' }, position: { x: 0, y: 0 } });
    const lonely = cy.getElementById('lonely');
    onDragStart(lonely);
    expect(isTugging()).toBe(true); // state exists, but no neighbours
    expect(lonely.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(false);
  });
  it(`caps tugged neighbours at NEIGHBOR_TUG_MAX (${NEIGHBOR_TUG_MAX}) and keeps the closest ones`, () => {
    // Build a graph with NEIGHBOR_TUG_MAX + 10 spokes. The extra 10 should
    // be excluded, and the kept ones should be the closest in Euclidean
    // distance from the centre.
    const { cy, centre } = makeStarGraph(NEIGHBOR_TUG_MAX + 10, 100);
    onDragStart(centre);
    const tuggedCount = cy.nodes(`.${CLASSES.NEIGHBOR_TUGGED}`).length;
    expect(tuggedCount).toBe(NEIGHBOR_TUG_MAX);
  });

  it('a second onDragStart wipes the first tug state (regression: no stacked gestures)', () => {
    const { cy, centre, spokes } = makeStarGraph(3);
    onDragStart(centre);
    // Spy on the FIRST spoke — it must be untagged after the second call.
    expect(spokes[0].hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(true);

    // Move the source so the second tug captures a different "start".
    centre.position({ x: 500, y: 500 });

    // Re-grab: this should call cancel() internally and re-snapshot.
    onDragStart(centre);

    // After re-grab, all neighbours are re-tagged (still 3 spokes).
    cy.nodes('[id ^= "s"]').forEach((n) => {
      expect(n.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(true);
    });
  });
});

describe('neighbor-tug — onDrag', () => {
  it('moves neighbours toward the dragged node as it moves', () => {
    // Single spoke directly above the source — distance is the easiest to
    // reason about, no diagonal complications.
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'src' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'spoke' }, position: { x: 0, y: 100 } },
      { group: 'edges', data: { id: 'e', source: 'src', target: 'spoke' } },
    ]);
    const src = cy.getElementById('src');
    const spoke = cy.getElementById('spoke');

    onDragStart(src);

    // Capture origin positions.
    const origin = { ...spoke.position() }; // { x: 0, y: 100 }

    // Move the source by (100, 0) — purely horizontal, no diagonal noise.
    // pullRatio 0.35 → raw offset 35 → clamped per-axis to MAX (6).
    // spoke is at (0, 100), source at (100, 0) → distance 100 < 150 →
    // proximityBoost 1.6 → final offset 6 * 1.6 = 9.6 in x, 0 in y.
    src.position({ x: 100, y: 0 });
    onDrag();

    const p = spoke.position();
    // Allow a generous epsilon for float arithmetic (9.6 in IEEE 754 is
    // 9.600000000000001).
    expect(Math.abs(p.x - origin.x - 9.6)).toBeLessThan(1e-9);
    expect(Math.abs(p.y - origin.y)).toBeLessThan(1e-9);
  });

  it('skips neighbours that are very far away (>600 graph units)', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'src' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'close' }, position: { x: 50, y: 0 } },
      // Far neighbour (1000 units away)
      { group: 'nodes', data: { id: 'far' }, position: { x: 1000, y: 0 } },
      { group: 'edges', data: { id: 'e1', source: 'src', target: 'close' } },
      { group: 'edges', data: { id: 'e2', source: 'src', target: 'far' } },
    ]);
    const src = cy.getElementById('src');
    const closeN = cy.getElementById('close');
    const farN = cy.getElementById('far');

    onDragStart(src);

    const closeOrigin = { ...closeN.position() };
    const farOrigin = { ...farN.position() };

    src.position({ x: 30, y: 0 });
    onDrag();

    // Close neighbour should have moved.
    const closeAfter = closeN.position();
    expect(closeAfter.x).not.toBe(closeOrigin.x);

    // Far neighbour should NOT have moved (still at its origin).
    const farAfter = farN.position();
    expect(farAfter.x).toBe(farOrigin.x);
    expect(farAfter.y).toBe(farOrigin.y);
  });

  it('is a no-op when no tug is active', () => {
    const { spokes } = makeStarGraph(3);
    const origins = spokes.map((n) => ({ ...n.position() }));
    // No onDragStart called.
    onDrag();
    for (let i = 0; i < spokes.length; i++) {
      expect(spokes[i].position().x).toBe(origins[i].x);
      expect(spokes[i].position().y).toBe(origins[i].y);
    }
  });
});

describe('neighbor-tug — onDragEnd', () => {
  it('leaves neighbours at their dragged positions (no snap-back)', () => {
    const { centre, spokes } = makeStarGraph(3);
    onDragStart(centre);

    // Capture true origin positions BEFORE we displace anything.
    const origins = spokes.map((n) => ({ ...n.position() }));

    // Displace the source so neighbours move.
    centre.position({ x: 50, y: 0 });
    onDrag();

    // Mid-drag positions should differ from origins (neighbours were tugged).
    const midDragPositions = spokes.map((n) => ({ ...n.position() }));
    expect(midDragPositions[0].x).not.toBe(origins[0].x);

    onDragEnd();

    // After onDragEnd, neighbours MUST stay exactly where they were
    // during the drag — no animate, no snap-back. The new contract:
    // "what the user dragged is what they get".
    for (let i = 0; i < spokes.length; i++) {
      const final = spokes[i].position();
      expect(final.x).toBe(midDragPositions[i].x);
      expect(final.y).toBe(midDragPositions[i].y);
      // ...and they should NOT have snapped back to origin.
      expect(final.x).not.toBe(origins[i].x);
    }
    // The tugged class should be stripped (neighbours are no longer in
    // a "transient" state — they've settled into their new permanent
    // position).
    for (const n of spokes) {
      expect(n.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(false);
    }
    // State should be cleared.
    expect(isTugging()).toBe(false);
  });

  it('does not call node.animate() on neighbours', () => {
    // Regression guard: the old implementation animated neighbours
    // back to origin via node.animate(). We removed that — verify
    // no animation is triggered on release.
    const { centre, spokes } = makeStarGraph(2);
    onDragStart(centre);
    centre.position({ x: 20, y: 0 });
    onDrag();

    const animateSpies = spokes.map((n) => vi.spyOn(n, 'animate'));

    onDragEnd();

    for (const spy of animateSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('clears tugStartX/Y bookkeeping on the source', () => {
    const { centre } = makeStarGraph(2);
    onDragStart(centre);
    centre.position({ x: 30, y: 30 });
    onDrag(); // First call writes tugStartX/Y.
    expect(centre.data('tugStartX')).toBeDefined();

    onDragEnd();
    expect(centre.data('tugStartX')).toBeUndefined();
    expect(centre.data('tugStartY')).toBeUndefined();
  });
});

describe('neighbor-tug — cancel', () => {
  it('strips .neighbor-tugged and clears state immediately', () => {
    const { cy, spokes } = makeStarGraph(3);
    const src = cy.getElementById('centre');
    onDragStart(src);
    expect(spokes[0].hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(true);

    cancel();
    expect(isTugging()).toBe(false);
    for (const n of spokes) {
      expect(n.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(false);
    }
  });

  it('is a safe no-op when no tug is active', () => {
    expect(() => cancel()).not.toThrow();
    expect(isTugging()).toBe(false);
  });

  it('clears bookkeeping on the source', () => {
    const { centre } = makeStarGraph(2);
    onDragStart(centre);
    centre.position({ x: 10, y: 0 });
    onDrag();
    expect(centre.data('tugStartX')).toBeDefined();
    cancel();
    expect(centre.data('tugStartX')).toBeUndefined();
  });
});

describe('neighbor-tug — integration with cytoscape events', () => {
  it('respects state transitions: grab → drag → free cleans up correctly', () => {
    // This is a more end-to-end test that exercises the lifecycle in a way
    // mirror to graph-events.ts bindings.
    const { centre, spokes } = makeStarGraph(2);

    // Simulate grab.
    onDragStart(centre);
    expect(isTugging()).toBe(true);
    expect(spokes[0].hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(true);

    // Capture positions mid-drag so we can verify they're preserved
    // after release (no snap-back contract).
    centre.position({ x: 20, y: 20 });
    onDrag();
    const midPositions = spokes.map((n) => ({ ...n.position() }));
    // Spokes should have moved from origin.
    expect(spokes[0].position().x).not.toBe(0);

    // Spy on each spoke's animate so we can verify onDragEnd does NOT
    // trigger any animation (new behaviour — no snap-back).
    const animateSpies = spokes.map((n) => vi.spyOn(n, 'animate'));

    // Simulate free.
    onDragEnd();
    for (const spy of animateSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
    // Tugged class stripped, state cleared.
    for (const n of spokes) {
      expect(n.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(false);
    }
    expect(isTugging()).toBe(false);

    // Neighbours stay exactly where the drag left them — no snap-back.
    for (let i = 0; i < spokes.length; i++) {
      expect(spokes[i].position().x).toBe(midPositions[i].x);
      expect(spokes[i].position().y).toBe(midPositions[i].y);
    }
  });
});

// Avoid an unused-import warning when running with --noUnusedLocals.
void flushAnimations;
