import { Renderer } from '../core/renderer.js';
import { uiState } from './state.js';
import { UiToggle } from './ui-toggle.js';
import { getCurrentLayout, renderLayoutParams } from './layout-manager.js';

// ── Bottom sheet ───────────────────────────────────────────────────────────────

const SHEET_SNAP_VELOCITY = 0.4; // px/ms — threshold for velocity snap

let _sheetOpen = false;

export function toggleBottomSheet(): void {
  _sheetOpen = !_sheetOpen;
  applySheetState(_sheetOpen);
}

export function closeBottomSheet(): void {
  _sheetOpen = false;
  applySheetState(false);
}

function applySheetState(open: boolean): void {
  const sheet = document.getElementById('bottom-sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  const peekTab = document.getElementById('sheet-peek-tab');
  const app = document.getElementById('app');
  if (!sheet) return;

  sheet.classList.toggle('open', open);
  if (backdrop) backdrop.classList.toggle('visible', open);
  if (peekTab) peekTab.classList.toggle('visible', !open);
  if (app) app.classList.toggle('sheet-open', open);

  if (open) {
    sheet.addEventListener('transitionend', () => {
      if (typeof uiState.detailPanel?.repositionCurrent === 'function') {
        uiState.detailPanel!.repositionCurrent();
      }
    }, { once: true });
  }
  syncTourBarPosition();
}

export function syncTourBarPosition(): void {
  const tourBar = document.getElementById('tour-status');
  if (!tourBar) return;
  if (window.innerWidth > 640) { tourBar.style.top = ''; tourBar.style.bottom = ''; }
}

// ── Mobile sheet drag ─────────────────────────────────────────────────────────

interface SheetDragState {
  startY: number;
  startTime: number;
  lastY: number;
  lastTime: number;
  startOffset: number; // baseline translateY offset at drag start
  startedOpen: boolean; // sheet state when drag began
}
let sheetDrag: SheetDragState | null = null;

function sheetFullOffset(): number {
  return window.innerHeight; // 100dvh in px — hide sheet fully below viewport
}

function sheetCurrentOffset(): number {
  const sheet = document.getElementById('bottom-sheet');
  if (!sheet || !sheet.classList.contains('open')) return sheetFullOffset();
  return 0;
}

export function initSheetDrag(): void {
  const sheetEl = document.getElementById('bottom-sheet') as HTMLElement;
  const handle = sheetEl?.querySelector('.bs-drag-handle') as HTMLElement | null;
  const peekTab = document.getElementById('sheet-peek-tab');
  if (!sheetEl) return;

  // Tap peek tab → toggle sheet
  peekTab?.addEventListener('click', () => {
    toggleBottomSheet();
  });

  // Drag handle → start drag
  handle?.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    const now = performance.now();
    sheetDrag = {
      startY: e.clientY,
      startTime: now,
      lastY: e.clientY,
      lastTime: now,
      startOffset: sheetCurrentOffset(),
      startedOpen: sheetEl.classList.contains('open'),
    };
    sheetEl.style.transition = 'none';
    sheetEl.style.overflowY = 'hidden';
    document.addEventListener('pointermove', onSheetMove, { passive: false });
    document.addEventListener('pointerup', onSheetUp);
  });

  function onSheetMove(e: PointerEvent): void {
    if (!sheetDrag) return;
    e.preventDefault();
    const delta = e.clientY - sheetDrag.startY; // + = down, - = up
    const fullOffset = sheetFullOffset();

    let translate: number;
    if (sheetDrag.startedOpen) {
      // Sheet was open — snap anchor is 0
      if (delta >= 0) {
        // Dragging down: 0 → fullOffset (closing)
        translate = delta * 0.5; // rubber-band
      } else {
        // Dragging up: already at 0, no further open possible
        translate = 0;
      }
    } else {
      // Sheet was closed — snap anchor is fullOffset (below viewport)
      if (delta >= 0) {
        // Dragging down from closed: push further down (rubber-band)
        translate = fullOffset + delta * 0.5;
      } else {
        // Dragging up from closed: bring up toward 0 (opening)
        translate = Math.max(0, fullOffset + delta);
      }
    }

    sheetEl.style.transform = `translateY(${translate}px)`;
    sheetDrag.lastY = e.clientY;
    sheetDrag.lastTime = performance.now();
  }

  function onSheetUp(e: PointerEvent): void {
    document.removeEventListener('pointermove', onSheetMove);
    document.removeEventListener('pointerup', onSheetUp);
    if (!sheetDrag) return;

    const fullOffset = sheetFullOffset();
    const delta = e.clientY - sheetDrag.startY;
    const dt = performance.now() - sheetDrag.lastTime;
    const velocity = Math.abs((e.clientY - sheetDrag.lastY) / (dt || 1));

    // Reset to CSS transition
    sheetEl.style.transform = '';
    sheetEl.style.overflowY = '';
    sheetEl.style.transition = '';

    // ── Determine snap target ──────────────────────────────────────────────────
    if (sheetDrag.startedOpen) {
      // Was open: down-drag → close, up-drag → stay open
      if (delta > 0) {
        const threshold = fullOffset * 0.4;
        if (delta > threshold || (velocity > SHEET_SNAP_VELOCITY && delta > 20)) {
          _sheetOpen = false;
          applySheetState(false);
        } else {
          _sheetOpen = true;
          applySheetState(true);
        }
      } else {
        _sheetOpen = true;
        applySheetState(true);
      }
    } else {
      // Was closed: up-drag → open, down-drag → stay closed
      if (delta < 0) {
        const openThreshold = fullOffset * 0.35;
        if (-delta > openThreshold || velocity > SHEET_SNAP_VELOCITY) {
          _sheetOpen = true;
          applySheetState(true);
        } else {
          _sheetOpen = false;
          applySheetState(false);
        }
      } else {
        _sheetOpen = false;
        applySheetState(false);
      }
    }

    sheetDrag = null;
  }

  // Initialize sheet to closed state (show peek tab, hide backdrop)
  applySheetState(false);
}

// Tour bar collapse/expand was moved to TourController.bindMobileCollapse();
// this module now only owns the bottom-sheet drag and the desktop panel drag.

// ── Desktop panel drag + resize ───────────────────────────────────────────────

export const PANEL_BOUNDS_KEY = 'detailPanel.bounds.v5';
const PANEL_DEFAULT_W = 360;
const PANEL_DEFAULT_H = 360;
const PANEL_MIN_W = 280;
const PANEL_MIN_H = 240;
/** Gap from viewport edges / top bar — also the gap inside which the panel
 *  is snapped back if dragged outside. */
const PANEL_PAD = 8;
const TOPBAR_H = 56;
const TOOLBAR_H = 44;
// Header of the panel must sit below topbar(56px) + toolbar(44px) = 100px
// so it never overlaps either bar's visual area (they have native pointer
// capture for their own children).
const PANEL_MIN_TOP = TOPBAR_H + TOOLBAR_H + PANEL_PAD;  // = 108px

interface PanelBounds { left: number; top: number; width: number; height: number; }

let dragState: { startX: number; startY: number; startLeft: number; startTop: number; el: HTMLElement } | null = null;
let resizeState: { startX: number; startY: number; startW: number; startH: number; el: HTMLElement } | null = null;

function clampBounds(b: PanelBounds): PanelBounds {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  // Constrain size first so the left/top clamp below accounts for the actual
  // rendered width/height (panel may have been resized below its CSS default).
  const w = Math.max(PANEL_MIN_W, Math.min(b.width, vpW - PANEL_PAD * 2));
  const h = Math.max(PANEL_MIN_H, Math.min(b.height, vpH - PANEL_MIN_TOP - PANEL_PAD));
  const left = Math.max(PANEL_PAD, Math.min(b.left, vpW - w - PANEL_PAD));
  const top = Math.max(PANEL_MIN_TOP, Math.min(b.top, vpH - h - PANEL_PAD));
  return { left, top, width: w, height: h };
}

function loadPanelBounds(): PanelBounds | null {
  try {
    const raw = localStorage.getItem(PANEL_BOUNDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelBounds>;
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number'
        || typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return null;
    return clampBounds({ left: parsed.left, top: parsed.top, width: parsed.width, height: parsed.height });
  } catch { return null; }
}

function savePanelBounds(b: PanelBounds): void {
  try { localStorage.setItem(PANEL_BOUNDS_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

/**
 * Apply saved bounds (if any) so the panel pops open at the user's last
 * position. No-op when the panel is already visible at a non-default spot
 * (subsequent `show()` calls on the same node shouldn't jump the user).
 */
export function restorePanelBounds(panel: HTMLElement): void {
  const saved = loadPanelBounds();
  if (!saved) return;
  panel.style.right = 'auto';
  panel.style.left = saved.left + 'px';
  panel.style.top = saved.top + 'px';
  panel.style.width = saved.width + 'px';
  panel.style.minHeight = saved.height + 'px';
}

/** True iff the user has dragged or resized the panel at least once. */
export function hasSavedBounds(): boolean {
  return loadPanelBounds() !== null;
}

export function initPanelDrag(): void {
  const panel = document.getElementById('node-panel');
  const header = document.getElementById('node-panel-header');
  if (!panel || !header) return;

  // Drag must start on the header only — clicking the body, tabs, close,
  // or pin would otherwise double-trigger drag + click. Touch-action: none
  // on the header (CSS) keeps pointer events flowing on mobile.
  header.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!panel.classList.contains('visible')) return;
    const rect = panel.getBoundingClientRect();
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      el: panel,
    };
    panel.classList.add('dragging');
    document.addEventListener('pointermove', onPanelDrag);
    document.addEventListener('pointerup', stopPanelDrag);
  });
}

function onPanelDrag(e: PointerEvent): void {
  if (!dragState || uiState.isPanelPinned) return;
  const { el, startLeft, startTop } = dragState;
  const next = clampBounds({
    left: startLeft + (e.clientX - dragState.startX),
    top: startTop + (e.clientY - dragState.startY),
    width: el.offsetWidth,
    height: el.offsetHeight,
  });
  el.style.right = 'auto';
  el.style.left = next.left + 'px';
  el.style.top = next.top + 'px';
}

function stopPanelDrag(): void {
  document.removeEventListener('pointermove', onPanelDrag);
  document.removeEventListener('pointerup', stopPanelDrag);
  if (dragState) {
    dragState.el.classList.remove('dragging');
    const r = dragState.el.getBoundingClientRect();
    savePanelBounds({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    });
    dragState = null;
  }
}

export function initPanelResize(): void {
  const panel = document.getElementById('node-panel');
  const handle = document.getElementById('node-panel-resize');
  if (!panel || !handle) return;

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!panel.classList.contains('visible')) return;
    e.preventDefault();
    e.stopPropagation(); // don't bubble to header → no drag kickoff
    resizeState = {
      startX: e.clientX,
      startY: e.clientY,
      startW: panel.offsetWidth,
      startH: panel.offsetHeight,
      el: panel,
    };
    panel.classList.add('resizing');
    document.addEventListener('pointermove', onPanelResize);
    document.addEventListener('pointerup', stopPanelResize);
  });
}

function onPanelResize(e: PointerEvent): void {
  if (!resizeState || uiState.isPanelPinned) return;
  const { el, startW, startH } = resizeState;
  const r = el.getBoundingClientRect();
  const next = clampBounds({
    left: r.left,
    top: r.top,
    width: startW + (e.clientX - resizeState.startX),
    height: startH + (e.clientY - resizeState.startY),
  });
  el.style.width = next.width + 'px';
  el.style.minHeight = next.height + 'px';
}

function stopPanelResize(): void {
  document.removeEventListener('pointermove', onPanelResize);
  document.removeEventListener('pointerup', stopPanelResize);
  if (resizeState) {
    resizeState.el.classList.remove('resizing');
    const r = resizeState.el.getBoundingClientRect();
    savePanelBounds({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    });
    resizeState = null;
  }
}

/** Reset persisted bounds — used when the user wants to start fresh. */
export function clearPanelBounds(): void {
  try { localStorage.removeItem(PANEL_BOUNDS_KEY); } catch { /* ignore */ }
}


// ── Sidebar toggle ────────────────────────────────────────────────────────────

// Sidebar toggle — UiToggle owns the on/off state, persistence, and class
// application across sidebar / button / strip. Renderer is mutated via the
// `onChange` hook so the cytoscape instance resizes on every toggle.
let sidebarToggle: UiToggle | null = null;
// Tracks the in-flight sidebar overlay timeout so rapid toggles can cancel
// the previous one — prevents stale sidebar-overlay removal mid-animation.
let sidebarAnimTimer: ReturnType<typeof setTimeout> | null = null;

/** Cancel any in-flight sidebar animation timer and clean up overlay state.
 *  Called by bigscreen enter/exit to prevent stale cy.resize() calls and
 *  orphaned sidebar-overlay class during bigscreen transitions. */
export function cancelSidebarAnim(): void {
  if (sidebarAnimTimer) { clearTimeout(sidebarAnimTimer); sidebarAnimTimer = null; }
  document.getElementById('sidebar')?.classList.remove('sidebar-overlay');
}

export function toggleSidebar(renderer: Renderer): void {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-sidebar-toggle');
  if (!sidebar) return;
  if (!sidebarToggle) {
    sidebarToggle = new UiToggle({
      initial: sidebar.classList.contains('hidden'),
      persist: 'sidebar.hidden',
      cssClass: 'hidden',
      applyTo: sidebar,
      onChange: (hidden) => {
        if (btn) btn.classList.toggle('active', !hidden);
        // Strategy: make the sidebar position:absolute (overlay) during the
        // 0.28s transform/opacity animation so it can slide freely above
        // the canvas. The grid column change + cy.resize() happens either
        // immediately (collapse — behind the still-visible sidebar) or
        // after the animation (expand — behind the now-visible sidebar).
        // In both cases the canvas resize is hidden behind the sidebar's
        // opaque background, so there's no black flash or black curtain.
        const main = document.getElementById('main');
        const sb = document.getElementById('sidebar');
        const nodePanel = document.getElementById('node-panel');
        if (sb) sb.classList.add('sidebar-overlay');
        // Cancel any previous animation timer — rapid toggles would
        // otherwise fire stale timeouts that remove sidebar-overlay
        // mid-animation or call cy.resize() at the wrong moment.
        if (sidebarAnimTimer) { clearTimeout(sidebarAnimTimer); sidebarAnimTimer = null; }

        if (hidden) {
          // Collapse: grid column collapses now (canvas expands behind the
          // sidebar which is still visible at the start of the transition).
          main?.classList.add('sidebar-hidden');
          nodePanel?.classList.add('sidebar-hidden-adjust');
          renderer.getCy().resize();
          // After the sidebar finishes sliding out, restore normal flow.
          sidebarAnimTimer = setTimeout(() => {
            if (sb) sb.classList.remove('sidebar-overlay');
            sidebarAnimTimer = null;
          }, 280);
        } else {
          // Expand: keep grid collapsed, let the sidebar slide in as an
          // overlay. After it's visible, expand the grid + resize canvas
          // (the resize is hidden behind the now-opaque sidebar).
          sidebarAnimTimer = setTimeout(() => {
            main?.classList.remove('sidebar-hidden');
            nodePanel?.classList.remove('sidebar-hidden-adjust');
            renderer.getCy().resize();
            if (sb) sb.classList.remove('sidebar-overlay');
            sidebarAnimTimer = null;
          }, 280);
        }
      },
    });
  } else {
    // Resync the toggle's in-memory state to whatever the DOM says
    // right now. Reason: bigscreen.ts restores the sidebar DOM directly
    // (captureSidebar / restoreSidebar round-trip) so the DOM and the
    // UiToggle's `this.on` can drift apart. Without this resync, the
    // first toggle after bigscreen exit computes `set(!this.on)` based
    // on the stale memory state — which can flip the DOM in the
    // opposite direction the user expects, making it look like the
    // button "doesn't work".
    //
    // We resync by reaching into the private field via a thin helper
    // (UiToggle.resyncFromDom). See ui-toggle.ts.
    sidebarToggle.resyncFromDom();
  }
  sidebarToggle.toggle();
}

// ── Section collapse ───────────────────────────────────────────────────────────

/** Duration in ms matching the CSS max-height transition. */
const SECTION_ANIM_MS = 280;

export function toggleSection(name: string): void {
  const section = document.querySelector(`[data-section="${name}"]`);
  const head = document.querySelector(`[data-section="${name}"] .sidebar-section__chevron`);
  if (!section) return;
  const wasOpen = section.getAttribute('data-section-state') === 'open';
  const nowOpen = !wasOpen;

  // Find the body element (works for both .sidebar-section__body and
  // .legend-section__body — they share the same class suffix).
  const body = section.querySelector('.sidebar-section__body, .legend-section__body') as HTMLElement | null;

  if (nowOpen) {
    // Opening: animate max-height from 0 → measured → none
    if (body) {
      body.style.maxHeight = '0px';
      // Force reflow so the transition picks up the start value
      void body.offsetHeight;
      section.setAttribute('data-section-state', 'open');
      const h = body.scrollHeight;
      body.style.maxHeight = h + 'px';
      setTimeout(() => { body.style.maxHeight = 'none'; }, SECTION_ANIM_MS);
    } else {
      section.setAttribute('data-section-state', 'open');
    }
  } else {
    // Closing: animate max-height from measured → 0
    if (body) {
      const h = body.scrollHeight;
      body.style.maxHeight = h + 'px';
      // Force reflow
      void body.offsetHeight;
      section.setAttribute('data-section-state', 'closed');
      body.style.maxHeight = '0px';
    } else {
      section.setAttribute('data-section-state', 'closed');
    }
  }

  if (head) head.classList.toggle('open', nowOpen);
  if (nowOpen && name === 'params') renderLayoutParams(getCurrentLayout());
}

/** Restore a section to its saved open/closed state (used by bigscreen roundtrip). */
export function restoreSectionState(name: string, isOpen: boolean): void {
  const section = document.querySelector(`[data-section="${name}"]`);
  if (!section) return;
  const body = section.querySelector('.sidebar-section__body, .legend-section__body') as HTMLElement | null;
  const head = section.querySelector('.sidebar-section__chevron');

  if (isOpen) {
    section.setAttribute('data-section-state', 'open');
    if (body) {
      body.style.maxHeight = 'none';
    }
  } else {
    section.setAttribute('data-section-state', 'closed');
    if (body) {
      body.style.maxHeight = '0px';
    }
  }
  if (head) head.classList.toggle('open', isOpen);
}

/** Initialize max-height on all sections based on their data-section-state.
 *  Must be called once during boot, after the DOM is ready. */
export function initSectionHeights(): void {
  const sections = document.querySelectorAll<HTMLElement>('.sidebar-section, .legend-block');
  sections.forEach((section) => {
    const isOpen = section.getAttribute('data-section-state') === 'open';
    const body = section.querySelector('.sidebar-section__body, .legend-section__body') as HTMLElement | null;
    if (!body) return;
    if (isOpen) {
      body.style.maxHeight = 'none';
    } else {
      body.style.maxHeight = '0px';
    }
  });
}
