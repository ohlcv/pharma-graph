// src/ui/bigscreen.ts
// Cinema / bigscreen mode: hide all chrome UI + request fullscreen.
// Single root class is on <html> (not #app) to avoid cytoscape overlay pollution.

import { cancelSidebarAnimAndClear, restoreSectionState } from './drag-manager';

const STORAGE_KEY = 'pharma-graph:bigscreen';

/** DOM element that holds the hint toast. Reused on every mode switch. */
function hintContainer(): HTMLElement {
  let el = document.getElementById('bigscreen-hint-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bigscreen-hint-root';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:200;pointer-events:none';
    document.body.appendChild(el);
  }
  return el;
}

/** Remove any existing hint DOM. */
function dismissHint(): void {
  hintContainer().innerHTML = '';
}

/** Inject the "press ESC or double-click to exit" pill, auto-removed after 2 s. */
function showHint(): void {
  dismissHint();
  const pill = document.createElement('div');
  pill.className = 'bigscreen-hint';
  pill.textContent = '按 ESC 或双击画布退出大屏';
  hintContainer().appendChild(pill);
  setTimeout(() => dismissHint(), 2200);
}

async function tryFullscreen(el: Element): Promise<void> {
  try {
    await (el as HTMLElement).requestFullscreen();
  } catch {
    // Browser may deny fullscreen without user gesture or on iOS — CSS still applies.
  }
}

async function tryExitFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      // ignore
    }
  }
}

// ── Sidebar state snapshot ────────────────────────────────────────────────────
// We snapshot every visual toggle on sidebar / sections BEFORE entering
// bigscreen, then restore them on exit. This guarantees "exit bigscreen"
// looks identical to "before entering bigscreen" — no more "legend
// disappeared" surprises.
//
// Snapshot fields (per-section): data-section-state, chevron .open class.
// Snapshot fields (sidebar): .hidden class, button .active class, strip
// .visible class & inline right style. Anything else that might affect
// the sidebar's visible state is preserved by simply not touching it.

interface SidebarSectionSnapshot {
  state: string | null;
  chevronOpen: boolean;
}

interface SidebarSnapshot {
  hidden: boolean;
  btnActive: boolean;
  sections: SidebarSectionSnapshot[];
}

let _preBigscreenSidebar: SidebarSnapshot | null = null;

function captureSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-sidebar-toggle');
  if (!sidebar) return;
  _preBigscreenSidebar = {
    hidden: sidebar.classList.contains('hidden'),
    btnActive: btn?.classList.contains('active') ?? false,
    sections: Array.from(
      document.querySelectorAll<HTMLElement>('.sidebar-section, .legend-block'),
    ).map((el) => ({
      state: el.getAttribute('data-section-state'),
      chevronOpen:
        el.querySelector<HTMLElement>('.sidebar-section__chevron')?.classList.contains('open') ??
        false,
    })),
  };
}

export function restoreSidebar(): void {
  const snap = _preBigscreenSidebar;
  if (!snap) return;
  _preBigscreenSidebar = null;

  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-sidebar-toggle');

  // Clean up any stale sidebar-overlay from an in-flight toggle animation
  // that was interrupted by bigscreen exit. Without this, the sidebar
  // could remain position:absolute after exit, detached from the grid.
  sidebar?.classList.remove('sidebar-overlay');

  // Force-clear any in-flight transform/opacity transition on the
  // sidebar before writing the new state. Without this, a pending
  // transition from a previous toggle (or from the bigscreen hide)
  // can leave the sidebar in a stale intermediate state — it looks
  // hidden even though the DOM `.hidden` class is gone. We disable
  // the transition, sync the DOM, force a reflow, then re-enable.
  if (sidebar) {
    sidebar.style.transition = 'none';
    sidebar.classList.toggle('hidden', snap.hidden);
    // Force a reflow so the browser commits the new transform.
    void sidebar.offsetWidth;
    sidebar.style.transition = '';
  }
  // Keep #main.sidebar-hidden in sync — see drag-manager.ts onChange.
  document.getElementById('main')?.classList.toggle('sidebar-hidden', snap.hidden);
  document.getElementById('node-panel')?.classList.toggle('sidebar-hidden-adjust', snap.hidden);
  if (btn) btn.classList.toggle('active', snap.btnActive);

  const sectionEls = document.querySelectorAll<HTMLElement>('.sidebar-section, .legend-block');
  sectionEls.forEach((el, i) => {
    const s = snap.sections[i];
    if (!s) return;
    const isOpen = s.state === 'open';
    // Use restoreSectionState so the inline max-height style stays in sync
    // with the data-section-state attribute — needed because toggleSection
    // now manages max-height via JS for smooth animations.
    const name = el.getAttribute('data-section');
    if (name) {
      restoreSectionState(name, isOpen);
    } else {
      el.setAttribute('data-section-state', s.state ?? 'closed');
      const chev = el.querySelector<HTMLElement>('.sidebar-section__chevron');
      if (chev) chev.classList.toggle('open', s.chevronOpen);
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** True when bigscreen mode is active (class on <html>). */
export function isBigscreen(): boolean {
  return document.documentElement.classList.contains('bigscreen');
}

/** Snapshot of the viewport captured before entering bigscreen mode.
 *
 * We deliberately store the model-coordinate center of the *visible*
 * viewport (cy.extent()) rather than the cytoscape pan/x/y values.
 * Reason: `cy.pan()` is a container-local rendered-pixel offset that
 * depends on the container's current width/height. When the container
 * resizes (entering or exiting bigscreen), the same pan value produces
 * a completely different visual framing. Saving/loading the raw pan
 * would therefore drift the view every time the layout changes.
 *
 * Model coordinates are independent of canvas size, so they survive
 * any resize. To restore, we translate back to a pan value using the
 * post-resize container size — see restoreViewport(). */
interface ViewportSnapshot {
  centerModel: { x: number; y: number };
  zoom: number;
}

let _preBigscreenViewport: ViewportSnapshot | null = null;

/** Captures the current viewport (center in model coords + zoom).
 *
 * If a tour is active, stops any in-flight cy.animate() first so we
 * capture a stable position rather than a mid-animation frame. The
 * center is read from `cy.extent()`, which returns the model-space
 * bounding box of all *visible* elements — i.e. the current viewport
 * center, not the bounding box of the whole graph. This matches what
 * the user was looking at before bigscreen. */
function captureViewport(): void {
  const cy = _getCy();
  if (!cy) return;

  if (_isTourActive()) {
    cy.stop();
  }

  const ext = cy.extent(); // model-space { x1, y1, x2, y2 } of visible elements
  _preBigscreenViewport = {
    centerModel: {
      x: (ext.x1 + ext.x2) / 2,
      y: (ext.y1 + ext.y2) / 2,
    },
    zoom: cy.zoom(),
  };
}

/** Applies the cached viewport snapshot to the live cy instance.
 *
 * Uses the **container-local** pan formula:
 *   pan.x = containerW/2 - centerModel.x * zoom
 *   pan.y = containerH/2 - centerModel.y * zoom
 *
 * This places `centerModel` at the center of the cy container,
 * regardless of where the container sits on the page (topbar /
 * toolbar / sidebar don't factor in — they're outside the container).
 *
 * The previous version used screen-absolute coordinates
 * (`bounds.left + bounds.width/2` and `bounds.top + bounds.height/2`)
 * which were wrong for two reasons:
 *  1. cy.pan uses container-local pixels, not screen pixels.
 *  2. In normal layout, bounds.top = topbar+toolbar ≈ 100px, which
 *     added 100px of vertical offset to every restore — making the
 *     "saved view" appear noticeably lower than where it was.
 *
 * Called by the ResizeObserver in installResizeBridge AFTER cy.resize
 * has been issued — so clientWidth/clientHeight here reflect the
 * post-bigscreen dimensions, and the pan we compute lands at the
 * container's true center. */
function restoreViewport(): void {
  const vp = _preBigscreenViewport;
  if (!vp) return;
  const cy = _getCy();
  const container = cy?.container();
  if (!cy || !container) return;
  _preBigscreenViewport = null;

  // Stop any in-flight cy animation. Both tour.ts highlightAndFocus and
  // focus-node.ts use cy.animate({ pan, zoom }) with durations up to
  // 600-1200ms. If the user exited bigscreen while such an animation
  // was still running (rare but possible — clicking through bigscreen
  // before tour pauses complete), the animation would override our
  // restored zoom a few frames later, producing the "zoomed out to
  // ~3% right after exit" symptom. Stop first, then apply the
  // snapshot.
  cy.stop();

  cy.zoom(vp.zoom);
  const w = container.clientWidth;
  const h = container.clientHeight;
  cy.pan({
    x: w / 2 - vp.centerModel.x * vp.zoom,
    y: h / 2 - vp.centerModel.y * vp.zoom,
  });

  // macOS-specific guard: macOS fullscreen mode is implemented as a
  // separate Space, and the browser window is *animated* across Space
  // boundaries (rather than resized in place like Windows/Linux). The
  // animation fires ResizeObserver multiple times — container widths
  // like 440→768→1024 over ~200ms — and each tick calls cy.resize().
  // We have observed (issue: 24% → 4% zoom collapse on first bigscreen
  // exit) that something in the cytoscape pipeline reacts to the
  // mid-flight viewport extent and re-fits the zoom a few frames
  // after the final resize tick. cytoscape's official behaviour is
  // that cy.resize() doesn't touch zoom (cytoscape/cytoscape.js#1769),
  // so the culprit is likely a project-level handler running off a
  // viewport event or a residual animation that survives cy.stop().
  //
  // To make the exit deterministic on macOS, we re-assert the saved
  // zoom for ~500ms (≈30 animation frames at 60Hz) — long enough to
  // ride out the macOS Space-transition animation. After that we
  // release so any genuine post-exit zoom gesture from the user
  // (immediate scroll-wheel, click on a node, etc.) is honoured.
  let guardFrames = 0;
  const guard = (): void => {
    if (++guardFrames > 5) return;
    if (Math.abs(cy.zoom() - vp.zoom) > 1e-4) {
      cy.zoom(vp.zoom);
    }
    requestAnimationFrame(guard);
  };
  requestAnimationFrame(guard);
}

/** Returns the current cytoscape Core instance. */
let _getCy: () => cytoscape.Core | null = () => null;

/** Must be called once during boot so bigscreen can snapshot the live cy. */
export function registerCyAccessor(fn: () => cytoscape.Core | null): void {
  _getCy = fn;
}

/** Enter bigscreen: add class, fullscreen, hint, persist preference. */
export async function enterBigscreen(): Promise<void> {
  if (isBigscreen()) return;

  captureSidebar();
  cancelSidebarAnimAndClear();

  // Snapshot the viewport (zoom + pan center in model space) so we can
  // restore the EXACT camera state on exit. Used to be gated on
  // _isTourActive(), which meant non-tour users lost their zoom/pan on
  // every bigscreen round-trip — fit() would dump them back to "see all
  // 100 nodes" instead of the 10 they'd zoomed in to. The tour case
  // additionally calls cy.stop() to freeze any in-flight pan animation
  // before reading extent(); for the non-tour case this is a no-op
  // (no animation is running from this entry point) so we just call it
  // unconditionally.
  captureViewport();

  document.documentElement.classList.add('bigscreen');
  showHint();
  await tryFullscreen(document.documentElement);

  // ResizeObserver (registered in installResizeBridge) fires once the
  // browser has laid out the new fullscreen dimensions; it will call
  // cy.resize() for us. We deliberately do NOT call cy.resize() here —
  // the observer knows the true container size at the moment it fires,
  // whereas we would have to guess via rAF/setTimeout gymnastics.
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* private mode */
  }
}

/** Exit bigscreen: remove class, exit fullscreen, remove preference. */
export async function exitBigscreen(): Promise<void> {
  if (!isBigscreen()) return;

  cancelSidebarAnimAndClear();

  // We do NOT call captureSidebar() here. The snapshot was taken at
  // enterBigscreen() time, which is the correct "before bigscreen"
  // baseline. Calling captureSidebar() here would re-read the DOM
  // mid-bigscreen, but the user can't interact with the sidebar during
  // bigscreen (toolbar / sidebar-strip are display:none), so the DOM
  // is unchanged anyway — but if any future code path ever does touch
  // the sidebar mid-bigscreen, we'd accidentally bake that change into
  // the post-exit state. The whole point of the snapshot is that
  // "exit bigscreen looks identical to before entering bigscreen".
  // Trust the snapshot.

  // Same principle for the viewport: the snapshot was taken in
  // enterBigscreen() against the PRE-bigscreen camera. Calling
  // captureViewport() here would re-read the current (mid-bigscreen)
  // extent, which is exactly what we DON'T want to restore. The
  // ResizeObserver below applies the cached _preBigscreenViewport
  // against the post-restore container size, giving us the user's
  // original 10-node zoomed view instead of a fit-to-100-nodes view.

  document.documentElement.classList.remove('bigscreen');

  // Force a synchronous reflow so the grid template change is committed
  // before we touch section DOM.
  void document.documentElement.offsetWidth;

  // Restore sidebar state to exactly what it was before bigscreen.
  restoreSidebar();

  await tryExitFullscreen();
  dismissHint();

  // ResizeObserver (registered in installResizeBridge) fires once the
  // browser has laid out the post-bigscreen dimensions; it calls
  // cy.resize() AND applies the cached viewport snapshot
  // (restoreViewport) for BOTH tour and non-tour paths — we always
  // capture in enterBigscreen() now. We deliberately do NOT call
  // cy.resize() here — calling it on a still-big-screen container
  // would measure the wrong width.
  //
  // We previously scheduled a fit() for the non-tour path here. That
  // was wrong: fit() forces every node back into the viewport, which
  // wipes out the user's pre-bigscreen zoom (e.g. they'd zoomed in
  // to see 10 of 100 nodes, fit would zoom out to show all 100).
  // restoreViewport() instead re-applies the saved zoom + center, so
  // exit bigscreen looks identical to before entering bigscreen.
}

/** Toggle bigscreen mode. */
export async function toggleBigscreen(): Promise<void> {
  return isBigscreen() ? exitBigscreen() : enterBigscreen();
}

// ── Tour bridge ────────────────────────────────────────────────────────────────

/** True when a guided tour is active (running or paused). */
let _isTourActive: () => boolean = () => false;

/** Must be called once during boot with the actual TourController check. */
export function registerTourController(isActive: () => boolean): void {
  _isTourActive = isActive;
}

// ── Fit bridge ────────────────────────────────────────────────────────────────
//
// We previously exposed a one-shot _pendingFit flag here that triggered
// fit() after a bigscreen round-trip for non-tour users. That was wrong:
// fit() forces every node back into the viewport, which erased the user's
// pre-bigscreen zoom (e.g. they'd zoomed in to see 10 of 100 nodes, and
// fit() would zoom out to show all 100 on exit). The correct behaviour
// for both tour and non-tour is to restore the pre-bigscreen zoom +
// pan via restoreViewport() in the ResizeObserver — which already
// runs from _preBigscreenViewport, now captured unconditionally in
// enterBigscreen().
//
// _fitRenderer is kept as a public registration point in case future
// code paths need an explicit "fit now" trigger (e.g. "reset view"
// button). It is no longer called by the bigscreen round-trip itself.

/** Registered fitGraph call. No-op until registerFitFn() runs at boot. */
let _fitRenderer: (() => void) | null = null;

/** Must be called once during boot with a callable that runs `fitGraph(renderer)`. */
export function registerFitFn(fn: () => void): void {
  _fitRenderer = fn;
}

/** Force an immediate fit (e.g. for a future "reset view" button).
 *  Bigscreen round-trip no longer calls this — it uses viewport
 *  restoration instead. */
export function fitGraphNow(): void {
  _fitRenderer?.();
}

// ── Global listeners (idempotent) ─────────────────────────────────────────────

let _installed = false;

/** ResizeObserver watching the cy container. Fires after every layout
 * change that affects the container's width/height. We use it as the
 * single source of truth for "cy needs to resize + pan restore".
 *
 * macOS fullscreen note: macOS implements fullscreen as a separate
 * Space, and the browser window is *animated* across Space boundaries
 * (≈200-300ms) rather than resized in place like Windows/Linux. During
 * this transition the ResizeObserver fires roughly every animation
 * frame with intermediate widths like 440→768→1024→1366.
 *
 * Each tick calls cy.resize() immediately. cytoscape's official
 * behaviour is that cy.resize() doesn't touch zoom or pan
 * (cytoscape/cytoscape.js#1769), so the rapid-fire resizes are
 * harmless — they're just wasted redraws. We previously tried
 * debouncing the resizes to 80ms to "collapse" the burst, but that
 * made the canvas render against a stale width during the wait and
 * produced a visible "node jump" on bigscreen entry as cytoscape
 * re-aligned. The redraw churn is the lesser evil.
 *
 * Sidebar toggles never fire this observer (sidebar stays in flex
 * flow so #cy dimensions are unchanged).
 */
let _cyResizeObserver: ResizeObserver | null = null;
let _lastObservedW = 0;
let _lastObservedH = 0;

function installResizeBridge(): void {
  const cy = _getCy();
  const container = cy?.container();
  if (!container) return;
  if (_cyResizeObserver) _cyResizeObserver.disconnect();
  _lastObservedW = container.clientWidth;
  _lastObservedH = container.clientHeight;

  _cyResizeObserver = new ResizeObserver((entries) => {
    const cy2 = _getCy();
    if (!cy2) return;
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width === _lastObservedW && height === _lastObservedH) continue;
      _lastObservedW = width;
      _lastObservedH = height;

      cy2.resize();
      if (_preBigscreenViewport) {
        restoreViewport();
      }
    }
  });
  _cyResizeObserver.observe(container);
}

/** Register keydown + fullscreenchange listeners. Idempotent — safe to call twice. */
export function initBigscreen(): void {
  if (_installed) return;
  _installed = true;

  // Install the resize bridge as soon as we know where cy is mounted.
  // This must run *after* registerCyAccessor has been called by main.ts.
  // We retry on the next rAF if cy isn't ready yet (boot ordering).
  requestAnimationFrame(() => {
    installResizeBridge();
  });

  // ESC: in CSS-only mode (fullscreen denied) the browser doesn't intercept ESC,
  // so we need to handle it ourselves.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isBigscreen()) {
      e.preventDefault();
      void exitBigscreen();
    }
  });

  // If the browser forces an exit (user pressed browser chrome Esc, or OS shortcut),
  // sync the JS state back to match. The actual canvas resize + viewport
  // restoration is handled by the ResizeObserver installed above.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isBigscreen()) {
      // We do NOT captureSidebar() here either — see exitBigscreen()
      // for the same rationale: the snapshot was taken at
      // enterBigscreen() time and must be the source of truth.
      document.documentElement.classList.remove('bigscreen');
      dismissHint();
      // Force a reflow + restore sidebar synchronously so the resize
      // observer fires against the post-restore layout.
      void document.documentElement.offsetWidth;
      restoreSidebar();
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* private mode */
      }
      // Viewport restoration (zoom + pan) is handled by the
      // ResizeObserver below via restoreViewport(), which applies the
      // _preBigscreenViewport snapshot against the restored container
      // size — same path as exitBigscreen(). No fit() here, on either
      // tour or non-tour: fit() would erase the user's pre-bigscreen
      // zoom (e.g. the 10-of-100-nodes zoom) and dump them back to a
      // full-graph view.
    }
  });
}
