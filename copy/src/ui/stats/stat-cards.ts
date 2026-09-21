// src/ui/stats/stat-cards.ts
// "图谱状态" sidebar section: node/edge/selected/highlighted counts + layout
// badge. Count-up animation lives in stat-animation.ts.
//
// This module replaces the `doUpdateStats` / `updateStats` / `syncBottomSheetStats`
// exports that previously lived in graph-stats.ts. graph-stats.ts now re-exports
// from here for backward compatibility.

import type { Core } from 'cytoscape';
import { setStat } from './stat-animation.js';
import { populateEssenceLegend, populateEdgeLegend } from '../legend-manager.js';
import { getCurrentLayout } from '../layout/layout-engine.js';
import { init as startPerfMonitor } from './perf-monitor.js';

let _statsRaf: number | null = null;
let _statsDebounce: ReturnType<typeof setTimeout> | null = null;
let _statsPending = false;
let _sheetStatsDebounce: ReturnType<typeof setTimeout> | null = null;

// Auto-start perf monitoring when this module is imported (boot-time init).
startPerfMonitor();

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
    setStat('stat-highlighted', String(cy.nodes('.highlighted').not('.layer-parent').length));
    const el = document.getElementById('stat-layout');
    if (el) el.textContent = getCurrentLayout().toUpperCase();

    populateEssenceLegend(cy);
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
    setStat('bs-stat-highlighted', String(cy.nodes('.highlighted').not('.layer-parent').length));
    const el = document.getElementById('bs-stat-layout');
    if (el) el.textContent = getCurrentLayout().toUpperCase();
    _sheetStatsDebounce = null;
  }, 100);
}
