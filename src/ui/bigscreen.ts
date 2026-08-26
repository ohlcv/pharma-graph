// src/ui/bigscreen.ts
// Cinema / bigscreen mode: hide all chrome UI + request fullscreen.
// Single root class is on <html> (not #app) to avoid cytoscape overlay pollution.

import { cancelSidebarAnim, restoreSectionState } from './drag-manager';

const STORAGE_KEY = 'pharma-graph:bigscreen';

/** DOM element that holds the hint toast. Reused on every mode switch. */
function hintContainer(): HTMLElement {
  let el = document.getElementById('bigscreen-hint-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bigscreen-hint-root';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:200;pointer-events:none';
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
  stripVisible: boolean;
  stripRight: string;
  sections: SidebarSectionSnapshot[];
}

let _preBigscreenSidebar: SidebarSnapshot | null = null;

function captureSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  const btn     = document.getElementById('btn-sidebar-toggle');
  const strip   = document.getElementById('sidebar-strip');
  if (!sidebar) return;
  _preBigscreenSidebar = {
    hidden: sidebar.classList.contains('hidden'),
    btnActive: btn?.classList.contains('active') ?? false,
    stripVisible: strip?.classList.contains('visible') ?? false,
    stripRight: strip?.style.right ?? '',
    sections: Array.from(
      document.querySelectorAll<HTMLElement>('.sidebar-section, .legend-block'),
    ).map((el) => ({
      state: el.getAttribute('data-section-state'),
      chevronOpen: el.querySelector<HTMLElement>('.sidebar-section__chevron')?.classList.contains('open') ?? false,
    })),
  };
}

export function restoreSidebar(): void {
  const snap = _preBigscreenSidebar;
  if (!snap) return;
  _preBigscreenSidebar = null;

  const sidebar = document.getElementById('sidebar');
  const btn     = document.getElementById('btn-sidebar-toggle');
  const strip   = document.getElementById('sidebar-strip');

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
  if (btn)     btn.classList.toggle('active', snap.btnActive);
  if (strip) {
    strip.classList.toggle('visible', snap.stripVisible);
    strip.style.right = snap.stripRight;
  }

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

  cy.zoom(vp.zoom);
  const w = container.clientWidth;
  const h = container.clientHeight;
  cy.pan({
    x: w / 2 - vp.centerModel.x * vp.zoom,
    y: h / 2 - vp.centerModel.y * vp.zoom,
  });
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
  cancelSidebarAnim();

  if (_isTourActive()) {
    captureViewport();
  }

  document.documentElement.classList.add('bigscreen');
  showHint();
  await tryFullscreen(document.documentElement);

  // ResizeObserver (registered in installResizeBridge) fires once the
  // browser has laid out the new fullscreen dimensions; it will call
  // cy.resize() for us. We deliberately do NOT call cy.resize() here —
  // the observer knows the true container size at the moment it fires,
  // whereas we would have to guess via rAF/setTimeout gymnastics.
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ }
}

/** Exit bigscreen: remove class, exit fullscreen, remove preference. */
export async function exitBigscreen(): Promise<void> {
  if (!isBigscreen()) return;

  cancelSidebarAnim();

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

  if (_isTourActive()) {
    captureViewport();
  }

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
  // cy.resize() AND, if a tour is active, applies the cached viewport
  // snapshot. We deliberately do NOT call cy.resize() here — calling
  // it on a still-big-screen container would measure the wrong width.
  //
  // For the non-tour path we want a fit-to-viewport after the resize.
  // We can't fit now (container hasn't resized yet — calling fit here
  // would compute pan against the bigscreen dimensions). Schedule the
  // fit to run *after* the ResizeObserver has had its turn.
  if (!_isTourActive()) {
    requestAnimationFrame(() => requestAnimationFrame(() => runFitIfAvailable()));
  }
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

/** Calls fitGraph(renderer) if the renderer singleton is reachable at init time.
 *  Safe no-op if called before boot. */
let _fitRenderer: (() => void) | null = null;

function runFitIfAvailable(): void {
  _fitRenderer?.();
}

/** Must be called once during boot with a callable that runs `fitGraph(renderer)`. */
export function registerFitFn(fn: () => void): void {
  _fitRenderer = fn;
}

// ── Global listeners (idempotent) ─────────────────────────────────────────────

let _installed = false;

/** ResizeObserver watching the cy container. Fires after every layout
 * change that affects the container's width/height. We use it as the
 * single source of truth for "cy needs to resize + pan restore".
 *
 * Why this is more reliable than the old setTimeout/rAF dance:
 *  - ResizeObserver fires AFTER layout and BEFORE paint, so clientWidth
 *    and clientHeight are accurate at the moment the callback runs.
 *  - We never have to guess "how many rAFs is enough" — the spec says
 *    the callback runs at the natural resize point.
 *  - The observer handles ALL container resizes (bigscreen enter,
 *    bigscreen exit, sidebar collapse, window resize, devtools open)
 *    uniformly — no special-casing per path. */
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
      // ResizeObserver fires once on install with the current size and
      // then on every actual change. We only react to real changes to
      // avoid spurious cy.resize() loops during boot.
      if (width === _lastObservedW && height === _lastObservedH) continue;
      _lastObservedW = width;
      _lastObservedH = height;

      cy2.resize();
      // If we have a pending viewport snapshot (we just exited
      // bigscreen and need to restore the saved center), apply it now
      // — the container has the new size, so the pan formula reads
      // the right numbers.
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
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
      if (!_isTourActive()) {
        // Same deferred-fit as exitBigscreen — fit only after the
        // ResizeObserver has resized cy to the new container size.
        requestAnimationFrame(() => requestAnimationFrame(() => runFitIfAvailable()));
      }
    }
  });
}
