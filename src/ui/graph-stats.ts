// src/ui/graph-stats.ts
// Counters in the bottom bar and the bottom-sheet panel. Pure DOM updates,
// debounced + RAF-gated so rapid layout/zoom events don't thrash.

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

function doUpdateStats(cy: Core): void {
  _statsPending = true;
  if (_statsRaf !== null) return;
  _statsRaf = requestAnimationFrame(() => {
    _statsRaf = null;
    if (!_statsPending) return;
    _statsPending = false;
    const set = (id: string, val: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    const nodes = cy.nodes().not('.layer-parent');
    set('stat-nodes', String(nodes.length));
    set('stat-edges', String(cy.edges().length));
    set('stat-selected', String(cy.$(':selected').length));
    set('stat-layout', getCurrentLayout().toUpperCase());

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
    const set = (id: string, val: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('bs-stat-nodes', String(cy.nodes().not('.layer-parent').length));
    set('bs-stat-edges', String(cy.edges().length));
    set('bs-stat-selected', String(cy.$(':selected').length));
    set('bs-stat-layout', getCurrentLayout().toUpperCase());
    _sheetStatsDebounce = null;
  }, 100);
}