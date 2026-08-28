/**
 * @vitest-environment jsdom
 *
 * Reproduces the user-reported bug:
 *   "After entering bigscreen and exiting, the right-hand sidebar
 *    legend column disappears. Clicking the toolbar's show/hide
 *    toggle button does nothing."
 *
 * Strategy: stand up the real DOM the app uses, install a fake cy,
 * drive the actual `bigscreen.ts` module through enter → exit, and
 * assert the sidebar state at each step. This is an end-to-end
 * integration test for the sidebar pipeline.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock fullscreen so the async path doesn't hang. requestFullscreen
// just adds a class; exitFullscreen removes it.
function installFullscreenMock(): void {
  // jsdom doesn't ship fullscreen — we override the relevant
  // prototypes on Element.prototype / Document.prototype.
  const proto = Element.prototype as unknown as {
    requestFullscreen: () => Promise<void>;
  };
  proto.requestFullscreen = function () {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: this });
    return Promise.resolve();
  };
  (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = function () {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    return Promise.resolve();
  };
}

// jsdom doesn't ship ResizeObserver. The bigscreen module uses one
// to drive cy.resize() after layout changes — for these tests we
// only care about sidebar state, not viewport math, so a no-op
// observer is fine.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof NoopResizeObserver }).ResizeObserver = NoopResizeObserver;

describe('bigscreen sidebar round-trip', () => {
  let sidebar: HTMLElement;
  let btn: HTMLElement;
  let main: HTMLElement;
  let cyContainer: HTMLElement;
  let cy: {
    resize: () => void;
    container: () => HTMLElement;
    zoom: () => number;
    pan: () => { x: number; y: number };
    extent: () => { x1: number; y1: number; x2: number; y2: number };
    stop: () => void;
    zoom_set: number;
    pan_set: { x: number; y: number } | null;
  };

  beforeEach(async () => {
    vi.resetModules();
    installFullscreenMock();

    document.body.innerHTML = `
      <aside id="sidebar">
        <div class="sidebar-section" data-section="types" data-section-state="open">
          <div class="sidebar-section__head">
            <span class="sidebar-section__title">图例</span>
            <svg class="sidebar-section__chevron open"></svg>
          </div>
          <div class="sidebar-section__body" id="body-types">legend content</div>
        </div>
        <div class="sidebar-section" data-section="stats" data-section-state="open">
          <div class="sidebar-section__head">
            <span class="sidebar-section__title">统计</span>
            <svg class="sidebar-section__chevron open"></svg>
          </div>
          <div class="sidebar-section__body">stats content</div>
        </div>
      </aside>
      <div id="main">
        <button id="btn-sidebar-toggle" class="btn" data-action="toggle-sidebar"></button>
        <div id="cy"></div>
      </div>
    `;
    sidebar = document.getElementById('sidebar')!;
    btn = document.getElementById('btn-sidebar-toggle')!;
    main = document.getElementById('main')!;
    cyContainer = document.getElementById('cy')!;

    cy = {
      resize: vi.fn(),
      container: () => cyContainer,
      zoom: function () { return this.zoom_set; },
      pan: function () { return this.pan_set ?? { x: 0, y: 0 }; },
      extent: () => ({ x1: 0, y1: 0, x2: 100, y2: 100 }),
      stop: vi.fn(),
      zoom_set: 1,
      pan_set: null,
    };

    // jsdom doesn't run layout — stub clientWidth so cy.resize() and
    // ResizeObserver have realistic numbers to work with.
    Object.defineProperty(cyContainer, 'clientWidth', { configurable: true, get: () => 1200 });
    Object.defineProperty(cyContainer, 'clientHeight', { configurable: true, get: () => 800 });
    Object.defineProperty(sidebar, 'clientWidth', { configurable: true, get: () => 260 });

    // jsdom's getBoundingClientRect returns zeros; our pan formula
    // only reads clientWidth/Height (not bounds) — but captureSidebar
    // does read btn/strip too. We're fine there.
  });

  it('enter → exit leaves sidebar exactly as it was (default state)', async () => {
    const bs = await import('./bigscreen.js');
    bs.registerCyAccessor(() => cy as never);
    bs.initBigscreen();

    // Initial: sidebar visible.
    expect(sidebar.classList.contains('hidden')).toBe(false);

    await bs.enterBigscreen();
    // During bigscreen: class is still on <html>.
    expect(document.documentElement.classList.contains('bigscreen')).toBe(true);
    // Sidebar's own .hidden class should NOT be touched by bigscreen
    // (the snapshot mechanism explicitly says so).
    expect(sidebar.classList.contains('hidden')).toBe(false);

    await bs.exitBigscreen();
    expect(document.documentElement.classList.contains('bigscreen')).toBe(false);
    // Sidebar should still be visible — no spurious .hidden class.
    expect(sidebar.classList.contains('hidden')).toBe(false);
  });

  it('enter → exit preserves user-folded state (sidebar .hidden = true)', async () => {
    const bs = await import('./bigscreen.js');
    bs.registerCyAccessor(() => cy as never);
    bs.initBigscreen();

    // User folds sidebar by clicking the toggle (simulate via direct
    // UiToggle manipulation). For this test we just add the class.
    sidebar.classList.add('hidden');
    btn.classList.remove('active');

    expect(sidebar.classList.contains('hidden')).toBe(true);

    await bs.enterBigscreen();
    // .hidden still true (user preference preserved)
    expect(sidebar.classList.contains('hidden')).toBe(true);

    await bs.exitBigscreen();
    // Still true — round-trip preserved.
    expect(sidebar.classList.contains('hidden')).toBe(true);
  });

  it('toggleSidebar works after exiting bigscreen (the "没反应" bug)', async () => {
    const bs = await import('./bigscreen.js');
    const drag = await import('./drag-manager.js');

    bs.registerCyAccessor(() => cy as never);
    bs.initBigscreen();

    // Round-trip the bigscreen.
    await bs.enterBigscreen();
    await bs.exitBigscreen();

    // Now the user clicks the show/hide button.
    // We need a renderer — give a stub.
    const fakeRenderer = { getCy: () => cy } as never;
    // Initial state: sidebar visible (HTML default).
    expect(sidebar.classList.contains('hidden')).toBe(false);

    drag.toggleSidebar(fakeRenderer);

    // After one click, sidebar should be hidden.
    expect(sidebar.classList.contains('hidden')).toBe(true);

    // Click again — sidebar should come back.
    drag.toggleSidebar(fakeRenderer);
    expect(sidebar.classList.contains('hidden')).toBe(false);
  });

  it('toggleSidebar works after exit, even if user folded sidebar BEFORE bigscreen', async () => {
    const bs = await import('./bigscreen.js');
    const drag = await import('./drag-manager.js');

    bs.registerCyAccessor(() => cy as never);
    bs.initBigscreen();

    // Step 1: fold sidebar via toggle.
    const fakeRenderer = { getCy: () => cy } as never;
    drag.toggleSidebar(fakeRenderer);
    expect(sidebar.classList.contains('hidden')).toBe(true);

    // Step 2: enter + exit bigscreen.
    await bs.enterBigscreen();
    await bs.exitBigscreen();
    expect(sidebar.classList.contains('hidden')).toBe(true);

    // Step 3: click toggle — should UNFOLD.
    drag.toggleSidebar(fakeRenderer);
    expect(sidebar.classList.contains('hidden')).toBe(false);

    // Step 4: enter + exit again.
    await bs.enterBigscreen();
    await bs.exitBigscreen();
    expect(sidebar.classList.contains('hidden')).toBe(false);

    // Step 5: click toggle — should FOLD.
    drag.toggleSidebar(fakeRenderer);
    expect(sidebar.classList.contains('hidden')).toBe(true);
  });

  it('multiple enter/exit cycles preserve sidebar state', async () => {
    const bs = await import('./bigscreen.js');
    bs.registerCyAccessor(() => cy as never);
    bs.initBigscreen();

    // Fold it before everything starts.
    sidebar.classList.add('hidden');

    for (let i = 0; i < 3; i++) {
      await bs.enterBigscreen();
      await bs.exitBigscreen();
      expect(sidebar.classList.contains('hidden')).toBe(true);
    }

    // Unfold it; should stay unfolded across cycles.
    sidebar.classList.remove('hidden');
    for (let i = 0; i < 3; i++) {
      await bs.enterBigscreen();
      await bs.exitBigscreen();
      expect(sidebar.classList.contains('hidden')).toBe(false);
    }
  });
});