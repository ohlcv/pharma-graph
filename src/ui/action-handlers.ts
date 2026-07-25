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
import {
  runLayout,
  applyLayoutParams,
  fitGraph,
  randomize,
  animatePulse,
  toggleBsParams,
  applyBsParams,
} from './layout-manager.js';
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
} from './layout-menu.js';

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
    renderer.runLayout('cose');
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

  registerAction('apply-bs-params', () => {
    applyBsParams(renderer);
  });

  // ── Layout picker (desktop dropdown + bottom-sheet row) ─────────────────────

  registerAction('run-layout', (_el, args) => {
    const name = args[0] ?? 'cose';
    runLayout(name, renderer);
  });

  registerAction('pick-layout', (el, args) => {
    const name = args[0] ?? el.dataset['name'] ?? 'cose';
    runLayout(name, renderer);

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

  // Close layout menu on outside click + Esc — installed once globally.
  installLayoutMenuDismissHandlers();
}
