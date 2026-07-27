// src/ui/bigscreen.ts
// Cinema / bigscreen mode: hide all chrome UI + request fullscreen.
// Single root class is on <html> (not #app) to avoid cytoscape overlay pollution.

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

// ── Public API ────────────────────────────────────────────────────────────────

/** True when bigscreen mode is active (class on <html>). */
export function isBigscreen(): boolean {
  return document.documentElement.classList.contains('bigscreen');
}

/** Snapshot of the viewport as saved before entering bigscreen mode.
 *  pan/zoom are scene coordinates — independent of canvas size — so they survive
 *  canvas resize without the camera drifting to a different graph region. */
interface ViewportSnapshot {
  centerScene: { x: number; y: number };
  zoom: number;
}

/** Stores the viewport snapshot captured before entering bigscreen mode.
 *  Valid only while bigscreen is active. */
let _preBigscreenViewport: ViewportSnapshot | null = null;

/** Tracks whether the post-exit viewport restoration has already been applied.
 *  Used to avoid re-applying on subsequent resize events (e.g. user manually resizes
 *  the window after exiting bigscreen — those should not trigger a restore). */
let _bigscreenRestorePending = false;

/** Caches the current viewport (center in scene coords + zoom) into _preBigscreenViewport.
 *  When a tour is running, stops any in-flight cy.animate() first so we capture a
 *  stable position rather than a mid-animation frame. */
function captureViewport(): void {
  const cy = _getCy();
  if (!cy) return;

  // Stop any running tour animation so the node lands at a stable position.
  // Without this, exitBigscreen triggers capture while cy.animate() is still
  // running, causing the viewport to be captured mid-flight.
  if (_isTourActive()) {
    cy.stop();
  }

  const ext = cy.extent(); // { x1, y1, x2, y2 } in scene coords
  _preBigscreenViewport = {
    centerScene: {
      x: (ext.x1 + ext.x2) / 2,
      y: (ext.y1 + ext.y2) / 2,
    },
    zoom: cy.zoom(),
  };
}

/** Applies the cached viewport snapshot to the live cy instance.
 *  Uses cy.center() semantics: adjust pan so the scene center lands at canvas center.
 *  Robust against canvas repositioning caused by toolbar/show-hide transitions.
 *  The double-setTimeout defers the restore past the cy.resize() that fires when
 *  the toolbar reappears after exiting fullscreen, so we restore from the correct
 *  post-resize viewport rather than fighting with cy.resize()'s internal reset. */
function restoreViewport(): void {
  if (!_preBigscreenViewport) return;
  const vp = _preBigscreenViewport;
  _bigscreenRestorePending = true;

  const doRestore = () => {
    const cy2 = _getCy();
    if (!_bigscreenRestorePending || !cy2 || !vp) return;
    _bigscreenRestorePending = false;
    _preBigscreenViewport = null;

    // Set zoom first, then pan so the center lands at the same scene coordinate.
    // canvasBounds reflects the post-resize / post-repositioned canvas position.
    cy2.zoom(vp.zoom);
    const bounds = cy2.container()!.getBoundingClientRect();
    cy2.pan({
      x: (bounds.left + bounds.width / 2) - vp.centerScene.x * vp.zoom,
      y: (bounds.top + bounds.height / 2) - vp.centerScene.y * vp.zoom,
    });
  };

  // Double macrotask: fullscreenchange fires → outer callback → inner callback.
  // By then the browser has laid out the toolbar, resized/repositioned the canvas,
  // fired cy.resize(), and painted.  Restore after all that settles.
  setTimeout(() => setTimeout(doRestore, 0), 0);
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

  if (_isTourActive()) {
    captureViewport();
  }

  document.documentElement.classList.add('bigscreen');
  showHint();
  await tryFullscreen(document.documentElement);
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ }

  if (_isTourActive()) {
    // Canvas has resized; restore the exact pan/zoom we captured above so the
    // tour camera is not disturbed.  The restore is async (cy.resize() may
    // fire on the next tick) so we defer it slightly.
    setTimeout(restoreViewport, 0);
  } else {
    runFitIfAvailable();
  }
}

/** Exit bigscreen: remove class, exit fullscreen, remove preference. */
export async function exitBigscreen(): Promise<void> {
  if (!isBigscreen()) return;

  if (_isTourActive()) {
    captureViewport();
  }

  document.documentElement.classList.remove('bigscreen');
  await tryExitFullscreen();
  dismissHint();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }

  if (_isTourActive()) {
    setTimeout(restoreViewport, 0);
  } else {
    runFitIfAvailable();
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

/** Register keydown + fullscreenchange listeners. Idempotent — safe to call twice. */
export function initBigscreen(): void {
  if (_installed) return;
  _installed = true;

  // ESC: in CSS-only mode (fullscreen denied) the browser doesn't intercept ESC,
  // so we need to handle it ourselves.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isBigscreen()) {
      e.preventDefault();
      void exitBigscreen();
    }
  });

  // If the browser forces an exit (user pressed browser chrome Esc, or OS shortcut),
  // sync the JS state back to match.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isBigscreen()) {
      // Browser forced an exit (e.g. user pressed browser chrome Esc).
      // Remove bigscreen class before restoring viewport so canvas dims are correct.
      document.documentElement.classList.remove('bigscreen');
      dismissHint();
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
      if (_isTourActive()) {
        // Restore the viewport captured at the start of the bigscreen session.
        // Do NOT capture again — _preBigscreenViewport holds the correct snapshot.
        setTimeout(restoreViewport, 0);
      } else {
        runFitIfAvailable();
      }
    }
  });
}
