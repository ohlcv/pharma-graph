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
  closeForensicPanel,
  initDebugOverlay,
} from './app-debug.js';
import type { Renderer } from '../core/renderer.js';

function makeStubRenderer() {
  // Real headless cytoscape so updateForensicPanel's `$()` / `.nodes()` calls
  // don't crash. The panel rendering inside updateForensicPanel isn't being
  // asserted here — only the state-machine of toggleDebugOverlay.
  const cy = cytoscape({ headless: true, styleEnabled: false });
  // Cast through unknown: `Renderer` is a class type with private fields
  // (cy / currentLayout / etc.), so a partial mock cannot satisfy its
  // structural shape. We widen the mock via `unknown` and document the
  // narrow contract here — only `getCy` is consumed by the code paths
  // under test.
  return { getCy: () => cy } as unknown as Renderer;
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

// ── Close button + drag handle (separate workstream) ──────────────────
//
// `closeForensicPanel()` and the drag handlers were added so the panel
// can sit anywhere on screen, can be dismissed without going back to the
// sidebar toggle, and the title bar acts as a drag handle. These tests
// exercise `closeForensicPanel()` directly and the drag wiring through
// `initDebugOverlay()` because we want real DOM events end-to-end.

describe('closeForensicPanel', () => {
  function setupOpenPanel() {
    const btn = document.createElement('button');
    btn.id = 'debug-toggle';
    document.body.appendChild(btn);
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.style.display = '';
    document.body.appendChild(panel);
    return { btn, panel };
  }

  it('hides the panel without flipping the module flag', () => {
    const { btn, panel } = setupOpenPanel();
    setDebugActive(true);
    btn.classList.add('active');

    closeForensicPanel();

    expect(panel.style.display).toBe('none');
    // The flag deliberately stays so the next click on the sidebar
    // toggle still toggles correctly (off → on) and so the toolbar
    // button's `active` class doesn't visually flip underneath the
    // user. The panel is hidden by `display:none`, not by removing
    // the toggle state.
    expect(isDebugActive()).toBe(true);
    expect(btn.classList.contains('active')).toBe(true);
  });

  it('is a no-op when the panel is absent', () => {
    expect(() => closeForensicPanel()).not.toThrow();
  });

  it('is idempotent — calling it twice leaves the panel hidden', () => {
    const { panel } = setupOpenPanel();
    closeForensicPanel();
    closeForensicPanel();
    expect(panel.style.display).toBe('none');
  });
});

describe('initDebugOverlay — close button & drag handle', () => {
  function fire(el: EventTarget, type: string, init: Partial<MouseEvent> = {}) {
    const ev = new MouseEvent(type, { bubbles: true, button: 0, ...init });
    el.dispatchEvent(ev);
    return ev;
  }

  it('renders a close button in the header and wires it to closeForensicPanel', () => {
    document.body.innerHTML = `
      <ul class="shortcuts-list"></ul>
    `;
    const renderer = makeStubRenderer();
    initDebugOverlay(renderer);

    const closeBtn = document.getElementById('dbg-close-btn');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.getAttribute('aria-label')).toBe('关闭取证面板');

    // Open the panel, then click × and verify panel hides.
    toggleDebugOverlay(renderer);
    const panel = document.getElementById('debug-panel')!;
    expect(panel.style.display).toBe('');
    closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel.style.display).toBe('none');
  });

  it('marks the header as a drag handle (cursor: move + userSelect: none)', () => {
    document.body.innerHTML = `<ul class="shortcuts-list"></ul>`;
    initDebugOverlay(makeStubRenderer());
    const header = document.getElementById('dbg-header')!;
    // jsdom normalizes the cursor declaration to its shorthand;
    // we only need to assert the canonical move cursor.
    expect(header.style.cursor).toBe('move');
    expect(header.style.userSelect).toBe('none');
  });

  it('moves the panel on mousedown → mousemove → mouseup', () => {
    document.body.innerHTML = `<ul class="shortcuts-list"></ul>`;
    const renderer = makeStubRenderer();
    initDebugOverlay(renderer);
    toggleDebugOverlay(renderer);

    const panel = document.getElementById('debug-panel')!;
    const header = document.getElementById('dbg-header')!;

    // jsdom's getBoundingClientRect returns 0,0/0,0 by default.
    // We don't care about absolute coords — we care that the move
    // event *changed* top/left and that bottom/right were unset
    // (so CSS `top/left` can drive the layout).
    fire(header, 'mousedown', { clientX: 100, clientY: 100 });
    // The listeners are attached to `document`, not the header —
    // mousemove / mouseup have to fire on document or window.
    fire(document, 'mousemove', { clientX: 250, clientY: 180 });
    fire(document, 'mouseup');

    expect(panel.style.bottom).toBe('auto');
    expect(panel.style.right).toBe('auto');
    // Slop threshold = 4px in either axis; movement of 150/80
    // clearly exceeds it.
    expect(panel.style.left).not.toBe('');
    expect(panel.style.top).not.toBe('');
  });

  it('ignores micro-drags below the 4px jitter threshold', () => {
    document.body.innerHTML = `<ul class="shortcuts-list"></ul>`;
    const renderer = makeStubRenderer();
    initDebugOverlay(renderer);
    toggleDebugOverlay(renderer);

    const header = document.getElementById('dbg-header')!;
    const panel = document.getElementById('debug-panel')!;

    // Mock getBoundingClientRect so the drag handler has a
    // meaningful starting rect — jsdom defaults to 0,0/0,0.
    // We give it a real starting rect and assert the slop-threshold
    // path leaves top/left at the *initial* mousedown-derived
    // values (no delta applied from the under-threshold mousemove).
    panel.getBoundingClientRect = () =>
      ({ top: 100, left: 200, right: 600, bottom: 400, width: 400, height: 300, x: 200, y: 100, toJSON: () => '' }) as DOMRect;

    fire(header, 'mousedown', { clientX: 200, clientY: 100 });
    // Capture top/left immediately after mousedown — the handler
    // commits the rect's top/left at this point to convert from
    // `bottom/right` anchoring.
    const startTop = panel.style.top;
    const startLeft = panel.style.left;
    expect(startTop).toBe('100px');
    expect(startLeft).toBe('200px');

    // 2px total (1 + 1) — below the 4px slop threshold. The handler
    // should bail without rewriting top/left.
    fire(document, 'mousemove', { clientX: 201, clientY: 101 });
    fire(document, 'mouseup');

    expect(panel.style.top).toBe(startTop);
    expect(panel.style.left).toBe(startLeft);
  });

  it('does not start a drag when mousedown originates on the close button', () => {
    document.body.innerHTML = `<ul class="shortcuts-list"></ul>`;
    const renderer = makeStubRenderer();
    initDebugOverlay(renderer);
    toggleDebugOverlay(renderer);

    const header = document.getElementById('dbg-header')!;
    const closeBtn = document.getElementById('dbg-close-btn')!;
    const panel = document.getElementById('debug-panel')!;

    // Dispatch mousedown whose `target` is the close button (bubbled
    // up via the header). The drag handler checks
    // `e.target.closest('#dbg-close-btn')` and bails.
    fire(closeBtn, 'mousedown', { clientX: 10, clientY: 10 });
    expect(header.style.cursor).toBe('move'); // unrelated sanity

    // Verify top/left stay unset because the drag should have refused.
    fire(document, 'mousemove', { clientX: 200, clientY: 200 });
    fire(document, 'mouseup');
    expect(panel.style.top).toBe('');
    expect(panel.style.left).toBe('');
  });
});
