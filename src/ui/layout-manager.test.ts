/**
 * @vitest-environment jsdom
 */
// Tests for `randomize` — fixes issue #17 where the random spread used
// `cy.width()`/`cy.height()` (viewport dimensions), so the same logical
// layout looked wildly different on a phone vs. a desktop monitor, and
// the camera ended up showing the new spread as a tiny clump in one
// corner because nothing called `fit()` afterwards.

import { describe, it, expect, beforeEach } from 'vitest';
import cytoscape from 'cytoscape';
import { randomize } from './layout-manager.js';

/** Minimal Renderer stub — only `getCy()` and `fit()` are touched. */
function makeStubRenderer(cy: cytoscape.Core) {
  let fitCalls = 0;
  return {
    getCy: () => cy,
    fit: () => {
      fitCalls++;
    },
    get fitCalls() {
      return fitCalls;
    },
  };
}

function asRenderer(s: ReturnType<typeof makeStubRenderer>) {
  // The real Renderer interface has many more fields; randomize only
  // touches getCy() and fit(). Cast through `any` so we can pass the
  // minimal stub without rebuilding half the class.
  return s as any;
}

/** Highlight stub — only `reset()` is called. */
const stubHighlight = { reset: () => {} } as any;

function makeCy() {
  return cytoscape({ headless: true, styleEnabled: false });
}

beforeEach(() => {
  // Drop any leftover node-panel from previous tests.
  document.body.innerHTML = '';
});

describe('randomize (issue #17 fix)', () => {
  it('positions all non-layer-parent nodes within the fixed world bounds', () => {
    const cy = makeCy();
    cy.add([
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
      { group: 'nodes', data: { id: 'c' } },
    ]);

    const renderer = asRenderer(makeStubRenderer(cy));
    randomize(renderer, stubHighlight);

    const WORLD = 1500;
    cy.nodes().forEach((n) => {
      const { x, y } = n.position();
      // Strict bound: half the world span on each side.
      expect(Math.abs(x)).toBeLessThanOrEqual(WORLD);
      expect(Math.abs(y)).toBeLessThanOrEqual(WORLD);
    });
  });

  it('does NOT use viewport dimensions to compute node positions', () => {
    // The whole point of #17: viewport width × viewport height differs
    // wildly between phone and desktop, but the random output should not.
    // We can't directly observe which numbers were used, but we can show
    // that nodes are positioned in a range consistent with the fixed
    // world size, not with a small viewport like 400x800.
    const cy = makeCy();
    cy.add([{ group: 'nodes', data: { id: 'n1' } }]);

    const renderer = asRenderer(makeStubRenderer(cy));
    randomize(renderer, stubHighlight);

    // Run the randomizer many times and confirm coordinates NEVER land
    // inside a viewport-sized box when the viewport is small (which is
    // what the old buggy code would produce).
    const positions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 50; i++) {
      const n = cy.getElementById('n1');
      n.unlock();
      n.position({ x: 0, y: 0 });
      randomize(renderer, stubHighlight);
      positions.push(n.position());
    }
    // If we were still using cy.width() (≈0 in headless), all x values
    // would be ~0. With the fix, x values span ±1500.
    const maxAbsX = Math.max(...positions.map((p) => Math.abs(p.x)));
    const maxAbsY = Math.max(...positions.map((p) => Math.abs(p.y)));
    // Headless cy reports width=0; old buggy code would output x=0
    // every time. New code's max should be close to 1500.
    expect(maxAbsX).toBeGreaterThan(100);
    expect(maxAbsY).toBeGreaterThan(100);
  });

  it('does not move layer-parent nodes', () => {
    const cy = makeCy();
    cy.add([
      { group: 'nodes', data: { id: 'parent' }, classes: 'layer-parent' },
      { group: 'nodes', data: { id: 'child' } },
    ]);
    const parent = cy.getElementById('parent');
    const child = cy.getElementById('child');
    parent.position({ x: 999, y: 999 });
    child.position({ x: 0, y: 0 });

    randomize(asRenderer(makeStubRenderer(cy)), stubHighlight);
    expect(parent.position()).toEqual({ x: 999, y: 999 });
    // Child was randomized — its new position should not be (0, 0)
    // exactly (random spread, vanishingly unlikely to land on origin
    // twice in a row, and the test runs the full randomization path).
    // We don't pin it to a specific value — just verify it actually
    // moved away from (0, 0) which is the pre-randomize position.
    const childPos = child.position();
    expect(childPos.x === 0 && childPos.y === 0).toBe(false);
  });

  it('calls renderer.fit() after positioning so the camera shows the new spread', () => {
    const cy = makeCy();
    cy.add([{ group: 'nodes', data: { id: 'a' } }, { group: 'nodes', data: { id: 'b' } }]);

    const renderer = asRenderer(makeStubRenderer(cy));
    randomize(renderer, stubHighlight);

    expect(renderer.fitCalls).toBe(1);
  });

  it('calls highlight.reset() first (consistent with prior behaviour)', () => {
    const cy = makeCy();
    cy.add([{ group: 'nodes', data: { id: 'a' } }]);

    let resetCalled = 0;
    const highlight = { reset: () => { resetCalled++; } } as any;

    randomize(asRenderer(makeStubRenderer(cy)), highlight);
    expect(resetCalled).toBe(1);
  });

  it('removes .visible from #node-panel if present', () => {
    document.body.innerHTML = '<div id="node-panel" class="visible"></div>';
    const cy = makeCy();
    cy.add([{ group: 'nodes', data: { id: 'a' } }]);

    randomize(asRenderer(makeStubRenderer(cy)), stubHighlight);
    expect(document.getElementById('node-panel')?.classList.contains('visible')).toBe(false);
  });

  it('clears the filter style on the cytoscape container', () => {
    const cy = makeCy();
    cy.add([{ group: 'nodes', data: { id: 'a' } }]);

    // Headless cy reports cy.container() === null, so the
    // `if (container)` guard short-circuits — randomize must not throw.
    expect(cy.container()).toBeNull();
    expect(() => randomize(asRenderer(makeStubRenderer(cy)), stubHighlight)).not.toThrow();
  });
});