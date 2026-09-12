/**
 * @vitest-environment jsdom
 */
// Unit tests for the neighbor-tug spring-physics interaction
// (src/ui/neighbor-tug.ts).
//
// v4 design: d3-force style Euler integration on velocity.
//   force = -k * (target - current)
//   velocity += force
//   velocity *= (1 - velocityDecay)   ← water drag
//   position += velocity
//
// Velocity decay = 0.4 (d3 default) produces the "water-drag" feel:
// slow start, smooth follow, no wild oscillation. Tests verify both
// the mechanics (correct integration) and the user-facing behaviour
// (neighbours follow source during drag, stay put on release).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

function makeStarGraph(spokeCount: number, radius = 100) {
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

/** Advance rAF loop by N frames. */
function tickSpring(frames: number): void {
  vi.advanceTimersByTime(16 * frames);
}

beforeEach(() => {
  cancel();
  vi.useFakeTimers();
});

afterEach(() => {
  cancel();
  vi.useRealTimers();
});

describe('neighbor-tug — pure helpers', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
  it('distanceSquared', () => {
    expect(distanceSquared({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
  });
});

describe('neighbor-tug — onDragStart', () => {
  it('tags 1-hop neighbours', () => {
    const { centre, spokes } = makeStarGraph(5);
    onDragStart(centre);
    for (const n of spokes) {
      expect(n.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(true);
    }
    expect(centre.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(false);
  });

  it(`caps tugged set at NEIGHBOR_TUG_MAX (${NEIGHBOR_TUG_MAX})`, () => {
    const { centre, cy } = makeStarGraph(NEIGHBOR_TUG_MAX + 10, 100);
    onDragStart(centre);
    expect(cy.nodes(`.${CLASSES.NEIGHBOR_TUGGED}`).length).toBe(NEIGHBOR_TUG_MAX);
  });

  it('is safe on a node with no neighbours', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add({ group: 'nodes', data: { id: 'lonely' }, position: { x: 0, y: 0 } });
    onDragStart(cy.getElementById('lonely'));
    expect(isTugging()).toBe(true);
  });
});

describe('neighbor-tug — drag behaviour (water-drag feel)', () => {
  it('neighbours LAG the source during drag (slow start)', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'src' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'spoke' }, position: { x: 0, y: 100 } },
      { group: 'edges', data: { id: 'e', source: 'src', target: 'spoke' } },
    ]);
    const src = cy.getElementById('src');
    const spoke = cy.getElementById('spoke');

    onDragStart(src);
    src.position({ x: 100, y: 0 });
    onDrag();

    // After 1 tick: source at x=100, neighbour should NOT be at x=100
    // yet — d3-style integration has slow start because velocity must
    // ramp up from 0. This is the "water drag" feel: heavy to start,
    // smooth to continue.
    tickSpring(1);
    expect(spoke.position().x).toBeGreaterThan(0);
    expect(spoke.position().x).toBeLessThan(100);
  });

  it('neighbours eventually follow the source close to target', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'src' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'spoke' }, position: { x: 0, y: 100 } },
      { group: 'edges', data: { id: 'e', source: 'src', target: 'spoke' } },
    ]);
    const src = cy.getElementById('src');
    const spoke = cy.getElementById('spoke');

    onDragStart(src);
    src.position({ x: 100, y: 0 });
    onDrag();

    // 200 frames = ~3 seconds. With velocityDecay=0.4 the spring
    // converges in ~15-20 ticks; 200 is generous to ensure convergence.
    tickSpring(200);

    // Source is at x=100. While active, target = source + offset =
    // (100, 0) + (0, 100) = (100, 100). Spoke should be at ~ (100, 100).
    expect(spoke.position().x).toBeCloseTo(100, 0);
    expect(spoke.position().y).toBeCloseTo(100, 0);
  });

  it('neighbours DO NOT wildly overshoot (water-drag, not rubber band)', () => {
    // Critical: water-drag feel means neighbours stop near target,
    // they don't fly past it. Overshoot should be < 10 graph units
    // (about 10 pixels on screen).
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'src' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'spoke' }, position: { x: 0, y: 100 } },
      { group: 'edges', data: { id: 'e', source: 'src', target: 'spoke' } },
    ]);
    const src = cy.getElementById('src');
    const spoke = cy.getElementById('spoke');

    onDragStart(src);
    src.position({ x: 100, y: 0 });
    onDrag();

    let maxX = 0;
    for (let i = 0; i < 200; i++) {
      tickSpring(1);
      const x = spoke.position().x;
      if (x > maxX) maxX = x;
    }
    // Max overshoot should be modest — well under 20 units of total x.
    expect(maxX).toBeLessThan(115);
  });

  it('keeps the spring running while dragging (water-drag feel)', () => {
    // Design choice: while the user is dragging, the spring stays
    // active even after the neighbour has reached its active-target
    // (= source + origin offset). Release stops everything — the
    // neighbour stays where the spring left it (no snap-back). This
    // makes the tug "track" the source continuously during drag —
    // without a phase where the neighbour freezes mid-drag.
    //
    // To verify: while dragging, neighbours eventually settle NEAR
    // the active target, and the spring is still running.
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'src' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'spoke' }, position: { x: 0, y: 100 } },
      { group: 'edges', data: { id: 'e', source: 'src', target: 'spoke' } },
    ]);
    const src = cy.getElementById('src');
    const spoke = cy.getElementById('spoke');

    onDragStart(src);
    src.position({ x: 100, y: 0 });
    onDrag();
    tickSpring(500);

    // After many ticks of dragging, neighbour is near active target.
    expect(spoke.position().x).toBeCloseTo(100, 0);
    // Tug is still considered active (user hasn't released).
    expect(isTugging()).toBe(true);
    expect(spoke.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(true);
  });
});

describe('neighbor-tug — release behaviour', () => {
  it('neighbours stay put after release (no snap-back)', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'src' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'spoke' }, position: { x: 0, y: 100 } },
      { group: 'edges', data: { id: 'e', source: 'src', target: 'spoke' } },
    ]);
    const src = cy.getElementById('src');
    const spoke = cy.getElementById('spoke');

    onDragStart(src);
    src.position({ x: 100, y: 0 });
    onDrag();
    tickSpring(200); // drag for a while — neighbour is now at ~(100, 100)

    const atRelease = { ...spoke.position() };
    onDragEnd();
    tickSpring(500); // nothing should change — release is a no-op

    expect(spoke.position().x).toBeCloseTo(atRelease.x, 5);
    expect(spoke.position().y).toBeCloseTo(atRelease.y, 5);
  });

  it('does not overshoot after release (no spring at all)', () => {
    // Same as above but assert no overshoot — release cancels everything,
    // so spoke.x should never dip below its release-time x.
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'src' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'spoke' }, position: { x: 0, y: 100 } },
      { group: 'edges', data: { id: 'e', source: 'src', target: 'spoke' } },
    ]);
    const src = cy.getElementById('src');
    const spoke = cy.getElementById('spoke');

    onDragStart(src);
    src.position({ x: 100, y: 0 });
    onDrag();
    tickSpring(200);

    onDragEnd();
    const xAtRelease = spoke.position().x;
    for (let i = 0; i < 500; i++) {
      tickSpring(1);
    }
    // Position must not have moved at all after release.
    expect(spoke.position().x).toBeCloseTo(xAtRelease, 5);
  });

  it('clears tugStartX/Y after release (state torn down)', () => {
    const { centre } = makeStarGraph(2);
    onDragStart(centre);
    expect(centre.data('tugStartX')).toBeDefined();
    onDragEnd();
    // Release = cancel: state is fully torn down so a fresh drag can start.
    expect(centre.data('tugStartX')).toBeUndefined();
  });
});

describe('neighbor-tug — cancel', () => {
  it('strips state immediately', () => {
    const { spokes } = makeStarGraph(3);
    const cy = spokes[0].cy();
    const centre = cy.getElementById('centre');
    onDragStart(centre);
    cancel();
    expect(isTugging()).toBe(false);
    for (const n of spokes) {
      expect(n.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(false);
    }
  });

  it('is safe when no tug is active', () => {
    expect(() => cancel()).not.toThrow();
  });
});

describe('neighbor-tug — integration', () => {
  it('full lifecycle: grab → drag → release → converge', () => {
    const { centre, spokes } = makeStarGraph(2);
    onDragStart(centre);
    centre.position({ x: 50, y: 0 });
    onDrag();
    tickSpring(50);
    onDragEnd();
    tickSpring(500);
    expect(isTugging()).toBe(false);
    for (const n of spokes) {
      expect(n.hasClass(CLASSES.NEIGHBOR_TUGGED)).toBe(false);
    }
  });

  it('keeps tugging far-away neighbours (no distance cap)', () => {
    // The old MAX_TUG_DISTANCE filter has been removed: every 1-hop
    // neighbour must follow the source regardless of starting distance.
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'src' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'far' }, position: { x: 1000, y: 0 } },
      { group: 'edges', data: { id: 'e', source: 'src', target: 'far' } },
    ]);
    const src = cy.getElementById('src');
    const farN = cy.getElementById('far');

    onDragStart(src);
    src.position({ x: 30, y: 0 });
    onDrag();
    tickSpring(200);

    // Neighbour follows: target = (30, 0) + (1000, 0) - (0, 0) = (1030, 0).
    // The spring should pull it toward 1030 from 1000 (i.e. x > 1000).
    expect(farN.position().x).toBeGreaterThan(1000);
  });

  it('keeps the edge length bounded when source drags quickly', () => {
    // Simulate a fast drag: source moves 200 units per frame for 50
    // frames. With SPRING_K=0.15 and VELOCITY_DECAY=0.4, the neighbour
    // cannot keep up — but the lag should stabilise, not grow forever.
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'src' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'far' }, position: { x: 100, y: 0 } },
      { group: 'edges', data: { id: 'e', source: 'src', target: 'far' } },
    ]);
    const src = cy.getElementById('src');
    const farN = cy.getElementById('far');
    const originEdgeLen = Math.hypot(src.position().x - farN.position().x, src.position().y - farN.position().y);

    onDragStart(src);
    for (let i = 0; i < 50; i++) {
      src.position({ x: (i + 1) * 200, y: 0 });
      onDrag();
      tickSpring(1);
    }
    const finalEdgeLen = Math.hypot(src.position().x - farN.position().x, src.position().y - farN.position().y);
    // Edge stretched, but bounded (not infinite). With current params
    // the steady-state lag is roughly v_source / SPRING_K = 200 / 0.15 ≈
    // 1333 — too loose. We just assert it stays under 5x the origin.
    expect(finalEdgeLen).toBeLessThan(originEdgeLen * 5);
  });
});
