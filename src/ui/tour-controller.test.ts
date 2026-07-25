// Tests for the issue #12 fix: tour button double-triggering.
//
// Before the fix:
//   - HTML had `onclick="tourStop()"` etc.
//   - tour-controller.ts ALSO had its own `data-tour-action` click delegation.
//   - Both paths ran, so every click triggered the tour action twice.
//   - The window exposure in main.ts existed solely to please the inline handler.
//
// After the fix:
//   - HTML uses `data-tour-action="..."` only.
//   - main.ts no longer exposes tour* on window.
//   - tour-controller's delegator is the single source of truth.
//
// These tests verify the new `TourController.toggle()` method (added when
// removing the `toggleTour()` wrapper) by stubbing `start`/`stop` through
// replacing them on the instance.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { TourController } from './tour-controller.js';

function makeController() {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  cy.add({ group: 'nodes', data: { id: 'a', label: 'A' } });
  const fakePanel = { close: () => {}, show: () => {} } as any;
  const c = new TourController(cy, {} as any, fakePanel);
  // Replace engine-touching methods with no-ops so we never hit the real one.
  vi.spyOn(c, 'start').mockImplementation(() => {});
  vi.spyOn(c, 'stop').mockImplementation(() => {});
  return c;
}

describe('TourController.toggle() — issue #12 state machine', () => {
  let c: TourController;

  beforeEach(() => {
    c = makeController();
  });

  it('idle → calls start', () => {
    c.toggle();
    expect(c.start).toHaveBeenCalledTimes(1);
    expect(c.stop).not.toHaveBeenCalled();
  });

  it('running → calls stop', () => {
    // Mark controller as running without invoking start().
    (c as any).running = true;
    c.toggle();
    expect(c.stop).toHaveBeenCalledTimes(1);
    expect(c.start).not.toHaveBeenCalled();
  });

  it('paused → calls stop (preserves old toggleTour global behaviour)', () => {
    (c as any).running = true;
    (c as any).paused = true;
    c.toggle();
    expect(c.stop).toHaveBeenCalledTimes(1);
    expect(c.start).not.toHaveBeenCalled();
  });

  it('rapid click sequence: idle → running → idle → running', () => {
    c.toggle(); // idle → start
    expect(c.start).toHaveBeenCalledTimes(1);

    (c as any).running = true;
    c.toggle(); // running → stop
    expect(c.stop).toHaveBeenCalledTimes(1);

    (c as any).running = false;
    (c as any).paused = false;
    c.toggle(); // idle → start again
    expect(c.start).toHaveBeenCalledTimes(2);
  });
});

describe('TourController toggle method exposure', () => {
  it('TourController exposes toggle()', () => {
    const c = makeController();
    expect(typeof c.toggle).toBe('function');
  });
});
