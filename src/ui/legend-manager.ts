// src/ui/legend-manager.ts
// Owns the two remaining legend axes (essence/edge) and the active filter
// state they expose. Pure UI/UI-state — no layout, no cytoscape binding.
//
// （A1 方案：第三轴 depth legend 已删除。无 subtreeRoot 节点用中性灰 fallback，
//  不再向用户展示"depth 颜色"这条线索——depth 仍可在 detail-panel 看到，但
//  只作为拓扑文字，不带颜色语义。）

import type { Core } from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { staticEls } from './dom-cache.js';
import {
  SHAPE_LABEL,
  ESSENCE_LABEL,
  NODE_TYPE_COLOR,
  EDGE_TYPE_STYLE,
  EDGE_TYPE_LABEL,
} from '../core/config.js';
import { buildLegend } from './legend-factory.js';

// ── Active filter state ────────────────────────────────────────────────────────

let activeShapeFilter: string | null = null;
let activeEdgeFilter: string | null = null;

export function getActiveShapeFilter(): string | null {
  return activeShapeFilter;
}

export function clearShapeFilter(): void {
  clearAllFilters();
  activeShapeFilter = null;
}

function clearAllFilters(): void {
  activeShapeFilter = null;
  activeEdgeFilter = null;
  staticEls(
    '.legend-row', '.legend-edge-row',
    '.shape-filter-item', '.bs-chip',
  ).forEach((el) => el.classList.remove('active'));
}

// ── Axis populators ────────────────────────────────────────────────────────────

const NODE_TYPE_SHAPE_MAP: Record<string, string> = {
  module: 'round-rectangle',
  'strict-class': 'pentagon',
  'umbrella-class': 'hexagon',
  concept: 'rectangle',
  medication: 'ellipse',
  illness: 'diamond',
  notion: 'tag',
  mnemonic: 'triangle',
  summary: 'octagon',
};

function makeShapeSwatch(shape: string): string {
  return `<span class="legend-node--shape shape-${shape}" style="background:#94a3b8"></span>`;
}

function makeEssenceSwatch(essenceKey: string, shape: string): string {
  const fill = NODE_TYPE_COLOR[essenceKey] ?? '#94a3b8';
  return `<span class="legend-node--shape shape-${shape}" style="background:${fill}"></span>`;
}

// ── Essence legend ─────────────────────────────────────────────────────────────

export function populateEssenceLegend(cy: Core): void {
  buildLegend(cy, {
    labels: ESSENCE_LABEL,
    countScope: 'nodes',
    countSelector: '[essence = "${key}"]',
    desktopContainerId: 'legend-essence-grid',
    mobileContainerId: 'bs-essence-chips',
    desktopCountPrefix: 'legend-essence-count-',
    mobileCountPrefix: 'bs-essence-count-',
    rowClass: 'legend-row',
    dataKey: 'data-type',
    desktopRow: (k, label) => `<div class="legend-row" data-type="${k}">${makeEssenceSwatch(k, NODE_TYPE_SHAPE_MAP[k] ?? 'rectangle')}<span class="legend-row__label">${label}</span><span class="legend-row__count" id="legend-essence-count-${k}"></span></div>`,
    mobileChip: (k, label) => `<div class="bs-chip" data-type="${k}">${makeEssenceSwatch(k, NODE_TYPE_SHAPE_MAP[k] ?? 'rectangle')}<span>${label}</span><span class="bs-chip__count" id="bs-essence-count-${k}"></span></div>`,
    onClick: (key, highlight) => highlightShape(key, highlight),
  });
}

// ── Edge legend (边类型) ──────────────────────────────────────────────────────

function dashAttr(lineStyle: string): string {
  if (lineStyle === 'dashed') return 'stroke-dasharray="5 3"';
  if (lineStyle === 'dotted') return 'stroke-dasharray="1 3"';
  return '';
}

function arrowSvg(style: { color: string; arrow: string }, xMax: number): string {
  if (style.arrow === 'triangle') {
    return `<polygon points="${xMax},5 ${xMax - 4},2 ${xMax - 4},8" fill="${style.color}"/>`;
  }
  if (style.arrow === 'tee') {
    return `<line x1="${xMax - 2}" y1="2" x2="${xMax}" y2="5" stroke="${style.color}" stroke-width="2"/><line x1="${xMax - 2}" y1="8" x2="${xMax}" y2="5" stroke="${style.color}" stroke-width="2"/>`;
  }
  return '';
}

function defaultEdgeStyle(): { color: string; lineStyle: string; arrow: string } {
  return { color: '#95a5a6', lineStyle: 'solid', arrow: 'none' };
}

function EDGE_TYPE_STYLE_FALLBACK(k: string) {
  return EDGE_TYPE_STYLE[k] ?? defaultEdgeStyle();
}

export function populateEdgeLegend(cy: Core): void {
  buildLegend(cy, {
    labels: EDGE_TYPE_LABEL,
    countScope: 'edges',
    countSelector: '[edgeType = "${key}"]',
    desktopContainerId: 'legend-edge-grid',
    mobileContainerId: 'bs-edge-chips',
    desktopCountPrefix: 'legend-edge-count-',
    mobileCountPrefix: 'bs-edge-count-',
    rowClass: 'legend-edge-row',
    dataKey: 'data-edge',
    desktopRow: (k, label) => {
      const style = EDGE_TYPE_STYLE_FALLBACK(k);
      return `<div class="legend-edge-row" data-edge="${k}"><svg width="28" height="10" viewBox="0 0 28 10"><line x1="2" y1="5" x2="26" y2="5" stroke="${style.color}" stroke-width="2" ${dashAttr(style.lineStyle)}/>${arrowSvg(style, 26)}</svg><span class="legend-edge-row__label">${label}</span><span class="legend-edge-row__count" id="legend-edge-count-${k}"></span></div>`;
    },
    mobileChip: (k, label) => {
      const style = EDGE_TYPE_STYLE_FALLBACK(k);
      return `<div class="bs-chip" data-edge="${k}"><svg width="24" height="10" viewBox="0 0 24 10" style="flex-shrink:0"><line x1="2" y1="5" x2="22" y2="5" stroke="${style.color}" stroke-width="2" ${dashAttr(style.lineStyle)}/>${arrowSvg(style, 22)}</svg><span>${label}</span><span class="bs-chip__count" id="bs-edge-count-${k}"></span></div>`;
    },
    onClick: (key, highlight) => highlightEdgeTypeFilter(key, highlight),
  });
}

// ── Filter highlight handlers ──────────────────────────────────────────────────

export function highlightShape(essence: string, highlight: HighlightEngine): void {
  if (activeShapeFilter === essence) {
    clearAllFilters();
    highlight.reset();
    return;
  }
  clearAllFilters();
  activeShapeFilter = essence;
  const shape = NODE_TYPE_SHAPE_MAP[essence] ?? essence;
  highlight.highlightShape(shape);

  staticEls('.legend-row[data-type]').forEach((el) => {
    if (el.dataset.type === essence) el.classList.add('active');
  });
  staticEls('.bs-chip[data-type]').forEach((el) => {
    if (el.dataset.type === essence) el.classList.add('active');
  });
  staticEls('.shape-filter-item').forEach((el) => {
    const label = el.querySelector('.shape-filter-item__label')?.textContent ?? '';
    const shapeName = Object.entries(SHAPE_LABEL).find(([, v]) => v === label)?.[0] ?? label;
    if (shapeName === essence || label.toLowerCase().includes(essence)) el.classList.add('active');
  });
}

export function highlightEdgeTypeFilter(edge: string, highlight: HighlightEngine): void {
  if (activeEdgeFilter === edge) {
    clearAllFilters();
    highlight.reset();
    return;
  }
  clearAllFilters();
  activeEdgeFilter = edge;
  highlight.highlightEdgeType(edge);
  activateAxis('.legend-edge-row[data-edge]', 'data-edge', edge);
  activateAxis('.bs-chip[data-edge]', 'data-edge', edge);
}

function activateAxis(selector: string, attr: string, key: string): void {
  staticEls(selector).forEach((el) => {
    if (el.dataset[attr] === key) el.classList.add('active');
  });
}
