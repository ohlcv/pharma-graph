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

const PANEL_BOUNDS_KEY = 'detailPanel.bounds';
const PANEL_DEFAULT_W = 360;
const PANEL_DEFAULT_H = 360;
const PANEL_MIN_W = 280;
const PANEL_MIN_H = 240;
/** Gap from viewport edges / top bar — also the gap inside which the panel
 *  is snapped back if dragged outside. */
const PANEL_PAD = 8;
const TOPBAR_H = 56;

interface PanelBounds { left: number; top: number; width: number; height: number; }

let dragState: { startX: number; startY: number; startLeft: number; startTop: number; el: HTMLElement } | null = null;
let resizeState: { startX: number; startY: number; startW: number; startH: number; el: HTMLElement } | null = null;

function clampBounds(b: PanelBounds): PanelBounds {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  // Constrain size first so the left/top clamp below accounts for the actual
  // rendered width/height (panel may have been resized below its CSS default).
  const w = Math.max(PANEL_MIN_W, Math.min(b.width, vpW - PANEL_PAD * 2));
  const h = Math.max(PANEL_MIN_H, Math.min(b.height, vpH - TOPBAR_H - PANEL_PAD * 2));
  const left = Math.max(PANEL_PAD, Math.min(b.left, vpW - w - PANEL_PAD));
  const top = Math.max(TOPBAR_H + PANEL_PAD, Math.min(b.top, vpH - h - PANEL_PAD));
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
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: panel.offsetLeft,
      startTop: panel.offsetTop,
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
  el.style.left = next.left + 'px';
  el.style.top = next.top + 'px';
}

function stopPanelDrag(): void {
  document.removeEventListener('pointermove', onPanelDrag);
  document.removeEventListener('pointerup', stopPanelDrag);
  if (dragState) {
    dragState.el.classList.remove('dragging');
    savePanelBounds({
      left: dragState.el.offsetLeft,
      top: dragState.el.offsetTop,
      width: dragState.el.offsetWidth,
      height: dragState.el.offsetHeight,
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
  const next = clampBounds({
    left: el.offsetLeft,
    top: el.offsetTop,
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
    savePanelBounds({
      left: resizeState.el.offsetLeft,
      top: resizeState.el.offsetTop,
      width: resizeState.el.offsetWidth,
      height: resizeState.el.offsetHeight,
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

export function toggleSidebar(renderer: Renderer): void {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-sidebar-toggle');
  const strip = document.getElementById('sidebar-strip');
  if (!sidebar) return;
  if (!sidebarToggle) {
    sidebarToggle = new UiToggle({
      initial: sidebar.classList.contains('hidden'),
      persist: 'sidebar.hidden',
      cssClass: 'hidden',
      applyTo: sidebar,
      onChange: (hidden) => {
        if (btn) btn.classList.toggle('active', !hidden);
        if (strip) {
          strip.classList.toggle('visible', hidden);
          strip.style.right = hidden ? '0' : '';
        }
        renderer.getCy().resize();
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

export function toggleSection(name: string): void {
  const section = document.querySelector(`[data-section="${name}"]`);
  const head = document.querySelector(`[data-section="${name}"] .sidebar-section__chevron`);
  if (!section) return;
  const wasOpen = section.getAttribute('data-section-state') === 'open';
  const nowOpen = !wasOpen;
  section.setAttribute('data-section-state', nowOpen ? 'open' : 'closed');
  if (head) head.classList.toggle('open', nowOpen);
  if (nowOpen && name === 'params') renderLayoutParams(getCurrentLayout());
}
