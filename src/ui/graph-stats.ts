// src/ui/graph-stats.ts
// Counters in the bottom bar and the bottom-sheet panel. Pure DOM updates,
// debounced + RAF-gated so rapid layout/zoom events don't thrash.
//
// Stat values animate via a count-up interpolation (200ms ease-out) so each
// change feels physical rather than an instant snap.

import type { Core } from 'cytoscape';
import { getCurrentLayout } from './layout-manager.js';
import {
  populateEssenceLegend,
  populateFieldLegend,
  populateTierLegend,
  populateEdgeLegend,
} from './legend-manager.js';

let _statsRaf: number | null = null;
let _statsDebounce: ReturnType<typeof setTimeout> | null = null;
let _statsPending = false;
let _sheetStatsDebounce: ReturnType<typeof setTimeout> | null = null;

// ── Count-up animation ──────────────────────────────────────────────────────────

interface CountUpState {
  startTime: number;
  from: number;
  to: number;
  duration: number;
  el: HTMLElement;
  id: string;
}
const _activeAnimations = new Map<string, CountUpState>();

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function animateCountUp(id: string, to: number, el: HTMLElement, duration = 220): void {
  // Cancel any in-flight animation for this element.
  if (_activeAnimations.has(id)) _activeAnimations.delete(id);
  const from = parseInt(el.textContent ?? '0', 10) || 0;
  if (from === to) return;

  const state: CountUpState = { startTime: performance.now(), from, to, duration, el, id };
  _activeAnimations.set(id, state);

  function tick(now: number) {
    const s = _activeAnimations.get(id);
    if (!s || s !== state) return; // cancelled or overwritten

    const elapsed = now - s.startTime;
    const t = Math.min(elapsed / s.duration, 1);
    const value = Math.round(s.from + (s.to - s.from) * easeOut(t));
    s.el.textContent = String(value);

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      _activeAnimations.delete(id);
    }
  }
  requestAnimationFrame(tick);
}

function setStat(id: string, val: string, animate = true): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (animate) {
    const num = parseInt(val, 10);
    if (!isNaN(num)) animateCountUp(id, num, el);
  } else {
    el.textContent = val;
  }
}

function doUpdateStats(cy: Core): void {
  _statsPending = true;
  if (_statsRaf !== null) return;
  _statsRaf = requestAnimationFrame(() => {
    _statsRaf = null;
    if (!_statsPending) return;
    _statsPending = false;
    const nodes = cy.nodes().not('.layer-parent');
    setStat('stat-nodes', String(nodes.length));
    setStat('stat-edges', String(cy.edges().length));
    setStat('stat-selected', String(cy.$(':selected').length));
    const el = document.getElementById('stat-layout');
    if (el) el.textContent = getCurrentLayout().toUpperCase();

    populateEssenceLegend(cy);
    populateFieldLegend(cy);
    populateTierLegend(cy);
    populateEdgeLegend(cy);
  });
}

export function updateStats(cy: Core): void {
  if (_statsDebounce !== null) clearTimeout(_statsDebounce);
  _statsDebounce = setTimeout(() => {
    doUpdateStats(cy);
    _statsDebounce = null;
  }, 100);
}

export function syncBottomSheetStats(cy: Core): void {
  if (_sheetStatsDebounce !== null) clearTimeout(_sheetStatsDebounce);
  _sheetStatsDebounce = setTimeout(() => {
    setStat('bs-stat-nodes', String(cy.nodes().not('.layer-parent').length));
    setStat('bs-stat-edges', String(cy.edges().length));
    setStat('bs-stat-selected', String(cy.$(':selected').length));
    const el = document.getElementById('bs-stat-layout');
    if (el) el.textContent = getCurrentLayout().toUpperCase();
    _sheetStatsDebounce = null;
  }, 100);
}