// src/ui/action-handlers.ts
// All `data-action="..."` registrations live here. This is the single source
// of truth for "which HTML buttons call which function".
//
// To wire a new button:
//   1. Add `data-action="my-action"` (and optional `data-arg="..."`) to its HTML.
//   2. Add a `registerAction('my-action', (el, [arg]) => { ... })` call below.
// No global pollution, no inline handlers, no `as any` casts.

import { Renderer } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';
import { DetailPanel } from './detail-panel.js';
import { registerAction } from './action-dispatcher.js';
import { DEFAULT_LAYOUT } from '../core/config.js';
import { runLayout } from './layout/layout-engine.js';
import {
  renderLayoutParams,
  renderBsLayoutParams,
  applyLayoutParams,
  resetLayoutParams,
  toggleBsParams,
  toggleBsLayout,
  toggleBsAdvanced,
  applyBsParams,
} from './layout/layout-params.js';
import { fitGraph, randomize, animatePulse } from './layout/toolbar-actions.js';
import { highlightShape, clearShapeFilter } from './legend-manager.js';
import {
  toggleBottomSheet,
  closeBottomSheet,
  toggleSidebar,
  toggleSection,
} from './drag-manager.js';
import { updateStats, syncBottomSheetStats } from './graph-stats.js';
import {
  closeLayoutMenu,
  toggleLayoutMenu,
  installLayoutMenuDismissHandlers,
} from './layout/layout-switcher.js';
import { toggleBigscreen } from './bigscreen.js';

/**
 * Switch layout through the single entry point every UI path should use:
 * runLayout() updates the current-layout state + switcher/labels and runs the
 * layout; the two params panels then re-render for the new layout. Without
 * the re-render, switching from Euler to COSE left Euler's sliders on screen
 * (and "应用参数" would apply them to COSE).
 */
function switchLayout(name: string, renderer: Renderer): void {
  runLayout(name, renderer);
  renderLayoutParams(name);
  renderBsLayoutParams(name);
}

export function registerAppActions(
  renderer: Renderer,
  highlight: HighlightEngine,
  detailPanel: DetailPanel,
): void {
  // ── Toolbar (desktop + bottom-sheet share these action names) ───────────────

  registerAction('fit', () => {
    fitGraph(renderer);
  });

  registerAction('randomize', () => {
    randomize(renderer, highlight);
    updateStats(renderer.getCy());
    syncBottomSheetStats(renderer.getCy());
  });

  registerAction('reset-all', () => {
    clearShapeFilter();
    highlight.reset();
    detailPanel.close();
    // Was `renderer.runLayout(DEFAULT_LAYOUT)`, which bypassed the layout
    // state: after 重置 the switcher label and getCurrentLayout() still
    // pointed at the previous layout.
    switchLayout(DEFAULT_LAYOUT, renderer);
    updateStats(renderer.getCy());
    syncBottomSheetStats(renderer.getCy());
  });

  registerAction('pulse', () => {
    animatePulse(renderer);
  });

  registerAction('toggle-sidebar', () => {
    toggleSidebar(renderer);
  });

  registerAction('close-node-panel', () => {
    detailPanel.close();
  });

  registerAction('apply-layout-params', () => {
    applyLayoutParams(renderer);
  });

  registerAction('reset-layout-params', () => {
    resetLayoutParams(renderer);
  });

  // ── Bottom sheet (mobile) ───────────────────────────────────────────────────

  registerAction('close-bottom-sheet', () => {
    closeBottomSheet();
  });

  registerAction('toggle-bottom-sheet', () => {
    toggleBottomSheet();
  });

  registerAction('toggle-bs-params', () => {
    toggleBsParams();
  });

  registerAction('toggle-bs-layout', () => {
    toggleBsLayout();
  });

  registerAction('toggle-bs-advanced', () => {
    toggleBsAdvanced();
  });

  registerAction('apply-bs-params', () => {
    applyBsParams(renderer);
  });

  // ── Layout picker (desktop dropdown + bottom-sheet row) ─────────────────────

  registerAction('run-layout', (_el, args) => {
    const name = args[0] ?? 'cose';
    switchLayout(name, renderer);
  });

  registerAction('pick-layout', (el, args) => {
    const name = args[0] ?? el.dataset['name'] ?? 'cose';
    switchLayout(name, renderer);

    // Sync button label + active item highlight
    const label = el.textContent?.trim() ?? '';
    const current = document.getElementById('layout-switcher-current');
    if (current) current.textContent = label;
    document.querySelectorAll<HTMLElement>('.layout-switcher__item').forEach((it) => {
      const active = it === el;
      it.classList.toggle('active', active);
      it.setAttribute('aria-selected', String(active));
    });

    closeLayoutMenu();
  });

  registerAction('toggle-layout-menu', () => {
    toggleLayoutMenu();
  });

  // ── Sidebar collapse panels ─────────────────────────────────────────────────

  registerAction('toggle-section', (_el, args) => {
    toggleSection(args[0] ?? '');
  });

  // ── Legend shape filter (called from JS, not currently from any HTML button) ─

  registerAction('highlight-shape', (_el, args) => {
    highlightShape(args[0] ?? '', highlight);
  });

  registerAction('toggle-bigscreen', () => {
    void toggleBigscreen();
  });

  // Close layout menu on outside click + Esc — installed once globally.
  installLayoutMenuDismissHandlers();
}
