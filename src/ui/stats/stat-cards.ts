// src/ui/stats/stat-cards.ts
// "图谱状态" sidebar section: node/edge/selected/highlighted counts + layout
// badge. Count-up animation lives in stat-animation.ts.
//
// This module replaces the `doUpdateStats` / `updateStats` / `syncBottomSheetStats`
// exports that previously lived in graph-stats.ts. graph-stats.ts now re-exports
// from here for backward compatibility.

import type { Core } from 'cytoscape';
import { isElementShown } from '../../core/element-visibility.js';
import { setStat } from './stat-animation.js';
import { populateEssenceLegend, populateEdgeLegend } from '../legend-manager.js';
import { getCurrentLayout } from '../layout/layout-engine.js';
import { init as startPerfMonitor } from './perf-monitor.js';

let _statsRaf: number | null = null;
let _statsDebounce: ReturnType<typeof setTimeout> | null = null;
let _statsPending = false;
let _sheetStatsDebounce: ReturnType<typeof setTimeout> | null = null;
/** Node/edge count signature of the last legend rebuild. */
let _legendSignature = '';

// Auto-start perf monitoring when this module is imported (boot-time init).
startPerfMonitor();

/**
 * Legend counts are grouped by static node/edge attributes (`fill`, `edgeType`),
 * so they only change when the graph gains or loses elements — not on every
 * highlight/selection change. Rebuilding them on each stats tick used to run
 * ~20 full-graph selector scans per keystroke (`match` was the second largest
 * entry in the CPU profile), all of which returned the same numbers.
 */
function refreshLegendCounts(cy: Core): void {
  const signature = `${cy.nodes().length}/${cy.edges().length}`;
  if (signature === _legendSignature) return;
  _legendSignature = signature;
  populateEssenceLegend(cy);
  populateEdgeLegend(cy);
}

function doUpdateStats(cy: Core): void {
  _statsPending = true;
  if (_statsRaf !== null) return;
  _statsRaf = requestAnimationFrame(() => {
    _statsRaf = null;
    if (!_statsPending) return;
    _statsPending = false;
    // 空间隔离时只数当前空间：藏起来的宇宙不该出现在"图谱状态"里。
    // 图例（essence / 边类型）保持全图口径——它是静态钥匙，不随取景变化。
    //
    // 口径用 isElementShown（display + 尺寸）而不是 ':visible'：后者含
    // opacity !== 0，会把 opacity: 0 的装饰奇观与传送门一并排除，全图计数
    // 凭空少 5 个、奇观空间显示 0 个节点。见 core/element-visibility.ts。
    const nodes = cy.nodes().not('.layer-parent').filter(isElementShown);
    setStat('stat-nodes', String(nodes.length));
    setStat('stat-edges', String(cy.edges().filter(isElementShown).length));
    setStat('stat-selected', String(cy.$(':selected').length));
    setStat('stat-highlighted', String(cy.nodes('.highlighted').not('.layer-parent').filter(isElementShown).length));
    const el = document.getElementById('stat-layout');
    if (el) el.textContent = getCurrentLayout().toUpperCase();

    refreshLegendCounts(cy);
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
    setStat('bs-stat-nodes', String(cy.nodes().not('.layer-parent').filter(isElementShown).length));
    setStat('bs-stat-edges', String(cy.edges().filter(isElementShown).length));
    setStat('bs-stat-selected', String(cy.$(':selected').length));
    setStat(
      'bs-stat-highlighted',
      String(cy.nodes('.highlighted').not('.layer-parent').filter(isElementShown).length),
    );
    const el = document.getElementById('bs-stat-layout');
    if (el) el.textContent = getCurrentLayout().toUpperCase();
    _sheetStatsDebounce = null;
  }, 100);
}
