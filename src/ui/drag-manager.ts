import { Renderer } from '../core/renderer.js';
import { uiState } from './state.js';
import { UiToggle } from './ui-toggle.js';
import { renderLayoutParams } from './layout-manager.js';

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

// ── Desktop panel drag ─────────────────────────────────────────────────────────

let dragState: { startX: number; startY: number; startLeft: number; startTop: number; el: HTMLElement } | null = null;

export function initPanelDrag(): void {
  const panel = document.getElementById('node-panel');
  if (!panel) return;

  panel.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!panel.classList.contains('visible')) return;
    const closeBtn = panel.querySelector('.node-panel__close');
    if (closeBtn?.contains(e.target as Node)) return;
    dragState = { startX: e.clientX, startY: e.clientY, startLeft: panel.offsetLeft, startTop: panel.offsetTop, el: panel };
    panel.classList.add('dragging');
    document.addEventListener('pointermove', onPanelDrag);
    document.addEventListener('pointerup', stopPanelDrag);
  });
}

function onPanelDrag(e: PointerEvent): void {
  if (!dragState || uiState.isPanelPinned) return;
  const { el, startLeft, startTop } = dragState;
  const W = el.offsetWidth, H = el.offsetHeight;
  const vpW = window.innerWidth, vpH = window.innerHeight;
  const TOPBAR_H = 56, PAD = 8;
  let left = Math.max(PAD, Math.min(startLeft + (e.clientX - dragState.startX), vpW - W - PAD));
  let top = Math.max(TOPBAR_H + PAD, Math.min(startTop + (e.clientY - dragState.startY), vpH - H - PAD));
  el.style.left = left + 'px'; el.style.top = top + 'px';
}

function stopPanelDrag(): void {
  if (dragState) { dragState.el.classList.remove('dragging'); dragState = null; }
  document.removeEventListener('pointermove', onPanelDrag);
  document.removeEventListener('pointerup', stopPanelDrag);
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
  if (nowOpen && name === 'params') renderLayoutParams(uiState.layout.current);
}
