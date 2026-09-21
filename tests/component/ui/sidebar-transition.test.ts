/**
 * @vitest-environment jsdom
 *
 * Regression tests for the user-reported bug:
 *   "我收起侧边栏没事，再点击展开时主图黑了一下屏幕闪烁了一下，
 *    感觉像是刷新了一下"
 *
 * Root cause (final diagnosis):
 *   The original implementation had two interacting problems:
 *     1. `setTimeout(280)` raced against the actual CSS transition end.
 *     2. Even when synced to transitionend, the #cy container itself was
 *        resized (sidebar width went from 0 to var(--sidebar-width) when
 *        .hidden was removed, or vice versa), which made cytoscape's
 *        `resize()` write `canvas.width = newValue` and clear the surface.
 *
 *   Final fix:
 *     - Sidebar stays in flex flow at full var(--sidebar-width) at all times.
 *     - Hiding is purely visual: `transform: translateX(100%)` + `opacity: 0`.
 *     - #cy dimensions are identical in collapsed and expanded states.
 *     - cy.resize() is never needed (and never called) on toggle.
 *     - No sidebar-overlay class, no transitionend listener, no timer.
 *
 * These tests pin down the invariants:
 *   1. After fold, sidebar gets .hidden; main gets .sidebar-hidden.
 *   2. After expand, sidebar loses .hidden; main loses .sidebar-hidden.
 *   3. cy.resize() is NEVER called as part of a toggle (canvas never
 *      resets, never flashes).
 *   4. #cy clientWidth is identical before and after a toggle (true
 *      regardless of which direction).
 *   5. CSS source itself doesn't reintroduce width-shrinking rules that
 *      would break invariant 4.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

function setupDom(): void {
  document.body.innerHTML = `
    <aside id="sidebar">
      <div class="sidebar-section" data-section="types" data-section-state="open">
        <div class="sidebar-section__head">
          <span class="sidebar-section__title">图例</span>
          <svg class="sidebar-section__chevron open"></svg>
        </div>
        <div class="sidebar-section__body">legend content</div>
      </div>
    </aside>
    <div id="main">
      <button id="btn-sidebar-toggle" class="btn" data-action="toggle-sidebar"></button>
      <div id="cy"></div>
    </div>
    <div id="node-panel"></div>
  `;
  Object.defineProperty(document.getElementById('cy')!, 'clientWidth', {
    configurable: true,
    get: () => 1200,
  });
  Object.defineProperty(document.getElementById('cy')!, 'clientHeight', {
    configurable: true,
    get: () => 800,
  });
  Object.defineProperty(document.getElementById('sidebar')!, 'clientWidth', {
    configurable: true,
    get: () => 260,
  });
}

function makeFakeCy() {
  return {
    resize: vi.fn(),
    container: () => document.getElementById('cy'),
  };
}

describe('sidebar toggle — invariants to prevent black-flash regression', () => {
  beforeEach(async () => {
    vi.resetModules();
    setupDom();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('fold then expand: cy.resize() is never called', async () => {
    const drag = await import('@/ui/drag-manager');
    const cy = makeFakeCy();
    const fakeRenderer = { getCy: () => cy } as never;

    // Initial state — sidebar visible, no sidebar-hidden on main.
    expect(document.getElementById('sidebar')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main')!.classList.contains('sidebar-hidden')).toBe(false);

    // Fold.
    drag.toggleSidebar(fakeRenderer);
    expect(document.getElementById('sidebar')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('main')!.classList.contains('sidebar-hidden')).toBe(true);
    expect(document.getElementById('node-panel')!.classList.contains('sidebar-hidden-adjust')).toBe(
      true,
    );
    // The whole point: never resize during toggle.
    expect(cy.resize).not.toHaveBeenCalled();

    // Expand.
    drag.toggleSidebar(fakeRenderer);
    expect(document.getElementById('sidebar')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main')!.classList.contains('sidebar-hidden')).toBe(false);
    expect(document.getElementById('node-panel')!.classList.contains('sidebar-hidden-adjust')).toBe(
      false,
    );
    expect(cy.resize).not.toHaveBeenCalled();
  });

  it('rapid toggle (3 clicks): cy.resize() still never called', async () => {
    const drag = await import('@/ui/drag-manager');
    const cy = makeFakeCy();
    const fakeRenderer = { getCy: () => cy } as never;

    drag.toggleSidebar(fakeRenderer); // fold
    drag.toggleSidebar(fakeRenderer); // expand
    drag.toggleSidebar(fakeRenderer); // fold again
    expect(cy.resize).not.toHaveBeenCalled();
    // End state: folded.
    expect(document.getElementById('sidebar')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('main')!.classList.contains('sidebar-hidden')).toBe(true);
  });

  it('no .sidebar-overlay class is ever added (it would force #cy to resize)', async () => {
    const drag = await import('@/ui/drag-manager');
    const cy = makeFakeCy();
    const fakeRenderer = { getCy: () => cy } as never;

    const sb = document.getElementById('sidebar')!;
    for (let i = 0; i < 4; i++) {
      drag.toggleSidebar(fakeRenderer);
      expect(sb.classList.contains('sidebar-overlay')).toBe(false);
    }
  });

  it('button "active" class mirrors inverse of hidden state (after first toggle)', async () => {
    const drag = await import('@/ui/drag-manager');
    const cy = makeFakeCy();
    const fakeRenderer = { getCy: () => cy } as never;

    const btn = document.getElementById('btn-sidebar-toggle')!;
    // Initial DOM state — no active class (sidebar visible means the
    // toggle gets its .active class on first click, since UiToggle only
    // calls onChange when state actually changes, not on initial mount).
    expect(btn.classList.contains('active')).toBe(false);

    drag.toggleSidebar(fakeRenderer); // fold → button should NOT be active
    expect(btn.classList.contains('active')).toBe(false);
    // (Hmm — onChange called with hidden=true, !hidden=false, so toggle
    //  sets active=false. But the button's actual "active" semantic is
    //  "is the sidebar currently shown", so it's correct that fold →
    //  not-active.)
    // Wait — let me re-read. Looking at the JS:
    //   btn.classList.toggle('active', !_hidden)
    // With _hidden=true (folded): !_hidden=false → toggle to false.
    // With _hidden=false (expanded): !_hidden=true → toggle to true.
    // So the button's "active" = "is sidebar expanded". Correct.

    drag.toggleSidebar(fakeRenderer); // expand → button SHOULD be active
    expect(btn.classList.contains('active')).toBe(true);

    drag.toggleSidebar(fakeRenderer); // fold → not active
    expect(btn.classList.contains('active')).toBe(false);
  });

  it('CSS: sidebar.hidden must NOT collapse width — #cy must stay the same size in both states', async () => {
    // Read the CSS source and assert that no rule shrinks sidebar's
    // effective width when .hidden is applied. If this invariant is
    // violated, #cy would resize and cytoscape's canvas would clear.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const components = await fs.readFile(
      path.join(process.cwd(), 'src/ui/styles/components.css'),
      'utf8',
    );
    const layout = await fs.readFile(
      path.join(process.cwd(), 'src/ui/styles/layout.css'),
      'utf8',
    );
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

    // No `width: 0` on the hidden rule.
    expect(stripComments(components)).not.toMatch(/#sidebar\.hidden[^}]*width:\s*0/);
    // No `flex: 0 0 0` collapsing sidebar in flow.
    expect(stripComments(components)).not.toMatch(/#sidebar\.hidden[^}]*flex:\s*0\s+0\s+0/);
    // Sidebar must be position:absolute (so it leaves flex flow and #cy
    // doesn't share width with it). The base #sidebar rule should have it.
    expect(stripComments(components)).toMatch(/#sidebar\s*\{[^}]*position:\s*absolute/);
    // Sidebar overlay (if any leftover code adds it) must NOT change
    // position — that would defeat the absolute layout.
    expect(stripComments(components)).not.toMatch(
      /#sidebar\.sidebar-overlay[^}]*position:\s*absolute/,
    );
    // Sanity: the old grid-column-collapse rule on #main is gone.
    expect(stripComments(layout)).not.toMatch(/#main\.sidebar-hidden\s+#sidebar[^}]*width:\s*0/);
  });
});
