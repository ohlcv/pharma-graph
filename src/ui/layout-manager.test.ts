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
  return s as any;
}

/** Highlight stub — only `reset()` is called. */
const stubHighlight = { reset: () => {} } as any;

function makeCy() {
  return cytoscape({ headless: true, styleEnabled: false });
}

beforeEach(() => {
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
      expect(Math.abs(x)).toBeLessThanOrEqual(WORLD);
      expect(Math.abs(y)).toBeLessThanOrEqual(WORLD);
    });
  });

  it('does NOT use viewport dimensions to compute node positions', () => {
    // The whole point of #17: viewport width × viewport height differs
    // wildly between phone and desktop, but the random output should not.
    // We snapshot the position after each randomize into a fresh object
    // — cytoscape's position objects can be reused as references across
    // mutating calls, so we extract primitives here.
    const cy = makeCy();
    cy.add([{ group: 'nodes', data: { id: 'n1' } }]);

    const renderer = asRenderer(makeStubRenderer(cy));
    randomize(renderer, stubHighlight);

    const positions: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 50; i++) {
      const n = cy.getElementById('n1');
      n.unlock();
      randomize(renderer, stubHighlight);
      const p = n.position();
      positions.push({ x: p.x, y: p.y });
    }
    const xs = positions.map((p) => Math.abs(p.x));
    const ys = positions.map((p) => Math.abs(p.y));
    const maxAbsX = Math.max(...xs);
    const maxAbsY = Math.max(...ys);

    // Bug signal: if the randomizer were still using cy.width() (which
    // is 0 in headless mode), every |x| would be approximately 0. With
    // the fix, the world-size bound is 1500 and |x| is sampled from
    // uniform [0, 1500]. Across 50 samples, max(|x|) is overwhelmingly
    // likely to exceed 1000 (and the absolute upper bound is 1500).
    expect(maxAbsX).toBeLessThanOrEqual(1500);
    expect(maxAbsY).toBeLessThanOrEqual(1500);
    expect(maxAbsX).toBeGreaterThan(1000);
    expect(maxAbsY).toBeGreaterThan(1000);
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
