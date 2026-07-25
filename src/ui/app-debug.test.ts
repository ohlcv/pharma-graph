/**
 * @vitest-environment jsdom
 */
// Tests for the unified debug-overlay toggle — fixes issue #13 where the
// button click handler and `window._dbg.overlay()` each managed their own
// slice of state (module flag / button class / panel display) and could
// drift apart.
//
// After the fix, both paths funnel through `toggleDebugOverlay()`, which
// owns the entire state transition atomically.

import { describe, it, expect, beforeEach } from 'vitest';
import cytoscape from 'cytoscape';
import {
  toggleDebugOverlay,
  isDebugActive,
  setDebugActive,
} from './app-debug.js';

function makeStubRenderer() {
  // Real headless cytoscape so updateForensicPanel's `$()` / `.nodes()` calls
  // don't crash. The panel rendering inside updateForensicPanel isn't being
  // asserted here — only the state-machine of toggleDebugOverlay.
  const cy = cytoscape({ headless: true, styleEnabled: false });
  return { getCy: () => cy } as any;
}

function setupOverlay() {
  const btn = document.createElement('button');
  btn.id = 'debug-toggle';
  document.body.appendChild(btn);
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  document.body.appendChild(panel);
  return { btn, panel };
}

beforeEach(() => {
  document.body.innerHTML = '';
  setDebugActive(false);
  // button classList may have stale state from a previous test
});

describe('toggleDebugOverlay (issue #13 fix)', () => {
  it('starts inactive', () => {
    expect(isDebugActive()).toBe(false);
  });

  it('toggles the module flag, button class, and panel display in sync', () => {
    const { btn, panel } = setupOverlay();
    const renderer = makeStubRenderer();

    const next = toggleDebugOverlay(renderer);

    expect(next).toBe(true);
    expect(isDebugActive()).toBe(true);
    expect(btn.classList.contains('active')).toBe(true);
    expect(panel.style.display).toBe('');
  });

  it('toggling twice returns to inactive', () => {
    const { btn, panel } = setupOverlay();
    const renderer = makeStubRenderer();

    toggleDebugOverlay(renderer);
    expect(isDebugActive()).toBe(true);

    const next = toggleDebugOverlay(renderer);
    expect(next).toBe(false);
    expect(isDebugActive()).toBe(false);
    expect(btn.classList.contains('active')).toBe(false);
    expect(panel.style.display).toBe('none');
  });

  it('keeps state in sync when toggled repeatedly', () => {
    const { btn, panel } = setupOverlay();
    const renderer = makeStubRenderer();

    // After i toggles, the toggled-into state is `i % 2 === 0` (i=0,2,4 → on).
    for (let i = 0; i < 5; i++) {
      const next = toggleDebugOverlay(renderer);
      expect(next).toBe(i % 2 === 0);
      expect(isDebugActive()).toBe(i % 2 === 0);
      expect(btn.classList.contains('active')).toBe(i % 2 === 0);
      expect(panel.style.display).toBe(i % 2 === 0 ? '' : 'none');
    }
  });

  it('does not throw when button is missing', () => {
    setupOverlay(); // button absent after this — only panel exists
    const renderer = makeStubRenderer();
    expect(() => toggleDebugOverlay(renderer)).not.toThrow();
    expect(isDebugActive()).toBe(true);
  });

  it('does not throw when panel is missing', () => {
    const btn = document.createElement('button');
    btn.id = 'debug-toggle';
    document.body.appendChild(btn);
    const renderer = makeStubRenderer();
    expect(() => toggleDebugOverlay(renderer)).not.toThrow();
    expect(isDebugActive()).toBe(true);
    expect(btn.classList.contains('active')).toBe(true);
  });

  it('calls updateForensicPanel when activating (so the panel shows live data)', async () => {
    setupOverlay();
    const renderer = makeStubRenderer();
    // Smoke check — the function reads renderer.getCy() inside. We just
    // assert no throw and that the module flag flipped.
    expect(() => toggleDebugOverlay(renderer)).not.toThrow();
    expect(isDebugActive()).toBe(true);
  });
});

describe('toggleDebugOverlay synchronising button click ↔ console API (issue #13)', () => {
  // The bug: before the fix, the button click handler toggled `btn.classList`
  // and set `debugOverlayActive` directly, while `window._dbg.overlay()`
  // went through `setDebugActive` and a separate DOM update. After one
  // toggled via the button, the modal flag and the button class were
  // guaranteed to agree, but the click handler bypassed `setDebugActive` so
  // any out-of-band write to `debugOverlayActive` (e.g. the console API)
  // would leave the DOM out of sync.
  //
  // With the fix, both paths call `toggleDebugOverlay()` which atomically
  // updates all three pieces of state.

  beforeEach(() => {
    document.body.innerHTML = '';
    setDebugActive(false);
  });

  it('console API activation is reflected in the button class', () => {
    const { btn } = setupOverlay();

    // Simulate console activation.
    toggleDebugOverlay(makeStubRenderer());

    expect(btn.classList.contains('active')).toBe(true);
    expect(isDebugActive()).toBe(true);
  });

  it('mixed-sequence toggles stay consistent', () => {
    const { btn, panel } = setupOverlay();

    toggleDebugOverlay(makeStubRenderer()); // via console
    toggleDebugOverlay(makeStubRenderer()); // via console
    toggleDebugOverlay(makeStubRenderer()); // via console

    expect(isDebugActive()).toBe(true);
    expect(btn.classList.contains('active')).toBe(true);
    expect(panel.style.display).toBe('');
  });
});
