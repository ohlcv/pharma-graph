// src/ui/legend-manager.ts
// Owns the four legend axes (essence/field/tier/edge) and the active filter
// state they expose. Pure UI/UI-state — no layout, no cytoscape binding.

import type { Core } from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { uiState } from './state.js';
import { staticEls } from './dom-cache.js';
import {
  SHAPE_LABEL,
  ESSENCE_LABEL,
  FIELD_COLOR,
  FIELD_LABEL,
  NODE_TIER_STYLE,
  TIER_LABEL,
  EDGE_TYPE_STYLE,
  EDGE_TYPE_LABEL,
  LEVEL_BORDER_COLOR,
  LEVEL_LABEL,
} from '../core/config.js';
import { buildLegend } from './legend-factory.js';

// ── Active filter state ────────────────────────────────────────────────────────
// All four axes share a single "active filter" slot — clicking a different
// legend row clears the previous one. This is implemented by clearAllFilters()
// below.

let activeShapeFilter: string | null = null;
let activeFieldFilter: string | null = null;
let activeTierFilter: string | null = null;
let activeEdgeFilter: string | null = null;
let activeLevelFilter: number | null = null;

export function getActiveShapeFilter(): string | null {
  return activeShapeFilter;
}

export function clearShapeFilter(): void {
  clearAllFilters();
  activeShapeFilter = null;
}

function clearAllFilters(): void {
  activeShapeFilter = null;
  activeFieldFilter = null;
  activeTierFilter = null;
  activeEdgeFilter = null;
  activeLevelFilter = null;
  staticEls(
    '.legend-row', '.legend-field-row', '.legend-tier-row', '.legend-edge-row', '.legend-level-row',
    '.shape-filter-item', '.bs-chip',
  ).forEach((el) => el.classList.remove('active'));
}

// ── Axis populators ────────────────────────────────────────────────────────────

// Module-level cy reference for filter functions that need direct access.
let legendCy: Core | null = null;

const NODE_TYPE_SHAPE_MAP: Record<string, string> = {
  module: 'round-rectangle',
  classification: 'hexagon',
  concept: 'octagon',
  medication: 'ellipse',
  illness: 'diamond',
  process: 'star',
  notion: 'tag',
  mnemonic: 'vee',
  summary: 'pentagon',
  table: 'rectangle',
  note: 'round-tag',
};

function makeShapeSwatch(shape: string): string {
  return `<span class="legend-node--shape shape-${shape}" style="background:#94a3b8"></span>`;
}

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
    desktopRow: (k, label) => `<div class="legend-row" data-type="${k}">${makeShapeSwatch(NODE_TYPE_SHAPE_MAP[k] ?? 'rectangle')}<span class="legend-row__label">${label}</span><span class="legend-row__count" id="legend-essence-count-${k}"></span></div>`,
    mobileChip: (k, label) => `<div class="bs-chip" data-type="${k}">${makeShapeSwatch(NODE_TYPE_SHAPE_MAP[k] ?? 'rectangle')}<span>${label}</span><span class="bs-chip__count" id="bs-essence-count-${k}"></span></div>`,
    onClick: (key, highlight) => highlightShape(key, highlight),
  });
}

// ── Field legend (border color) ─────────────────────────────────────────────────

export function populateFieldLegend(cy: Core): void {
  buildLegend(cy, {
    labels: FIELD_LABEL,
    countScope: 'nodes',
    countSelector: '[field = "${key}"]',
    desktopContainerId: 'legend-field-grid',
    mobileContainerId: 'bs-field-chips',
    desktopCountPrefix: 'legend-field-count-',
    mobileCountPrefix: 'bs-field-count-',
    rowClass: 'legend-field-row',
    dataKey: 'data-field',
    desktopRow: (k, label) => `<div class="legend-field-row" data-field="${k}"><span class="legend-swatch" style="background:#ffffff;border:2px solid ${FIELD_COLOR[k] ?? '#94a3b8'}"></span><span class="legend-row__label">${label}</span><span class="legend-row__count" id="legend-field-count-${k}"></span></div>`,
    mobileChip: (k, label) => `<div class="bs-chip bs-chip--field" data-field="${k}"><span class="bs-chip__swatch" style="background:#ffffff;border:2px solid ${FIELD_COLOR[k] ?? '#94a3b8'}"></span><span>${label}</span><span class="bs-chip__count" id="bs-field-count-${k}"></span></div>`,
    onClick: (key, highlight) => highlightField(key, highlight),
  });
}

// ── Tier legend (fill color) ───────────────────────────────────────────────────

export function populateTierLegend(cy: Core): void {
  buildLegend(cy, {
    labels: TIER_LABEL,
    countScope: 'nodes',
    countSelector: '[tier = "${key}"]',
    desktopContainerId: 'legend-tier-grid',
    mobileContainerId: 'bs-tier-chips',
    desktopCountPrefix: 'legend-tier-count-',
    mobileCountPrefix: 'bs-tier-count-',
    rowClass: 'legend-tier-row',
    dataKey: 'data-tier',
    desktopRow: (k, label) => `<div class="legend-tier-row" data-tier="${k}"><span class="legend-swatch" style="background:${NODE_TIER_STYLE[k]?.bgColor ?? '#f1f5f9'};border:2px solid #ffffff"></span><span class="legend-row__label">${label}</span><span class="legend-row__count" id="legend-tier-count-${k}"></span></div>`,
    mobileChip: (k, label) => `<div class="bs-chip bs-chip--tier" data-tier="${k}"><span class="bs-chip__swatch" style="background:${NODE_TIER_STYLE[k]?.bgColor ?? '#f1f5f9'};border:2px solid #ffffff"></span><span>${label}</span><span class="bs-chip__count" id="bs-tier-count-${k}"></span></div>`,
    onClick: (key, highlight) => highlightTier(key, highlight),
  });
}

// ── Level legend (结构级别 → 边框色) ────────────────────────────────────────────

export function populateLevelLegend(cy: Core): void {
  legendCy = cy;
  buildLegend(cy, {
    labels: LEVEL_LABEL,
    countScope: 'nodes',
    countSelector: '[level = ${key}]',
    desktopContainerId: 'legend-level-grid',
    mobileContainerId: 'bs-level-chips',
    desktopCountPrefix: 'legend-level-count-',
    mobileCountPrefix: 'bs-level-count-',
    rowClass: 'legend-level-row',
    dataKey: 'data-level',
    desktopRow: (k, label) => `<div class="legend-level-row" data-level="${k}"><span class="legend-swatch" style="background:#f8fafc;border:2px solid ${LEVEL_BORDER_COLOR[Number(k)] ?? '#94a3b8'}"></span><span class="legend-row__label">${label}</span><span class="legend-row__count" id="legend-level-count-${k}"></span></div>`,
    mobileChip: (k, label) => `<div class="bs-chip bs-chip--level" data-level="${k}"><span class="bs-chip__swatch" style="background:#f8fafc;border:2px solid ${LEVEL_BORDER_COLOR[Number(k)] ?? '#94a3b8'}"></span><span>${label}</span><span class="bs-chip__count" id="bs-level-count-${k}"></span></div>`,
    onClick: (key, highlight) => highlightLevel(String(key), highlight),
  });
}

// ── Edge legend (边类型) ────────────────────────────────────────────────────────

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

// Imported above; helper kept local to keep the descriptor self-contained.
function EDGE_TYPE_STYLE_FALLBACK(k: string) {
  return EDGE_TYPE_STYLE[k] ?? defaultEdgeStyle();
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
  // Convert essence key to Cytoscape shape value before passing to the engine.
  // highlightEngine.highlightShape() compares n.style('shape'), which holds the
  // Cytoscape shape name (octagon, ellipse, diamond …), not the essence key.
  const shape = NODE_TYPE_SHAPE_MAP[essence] ?? essence;
  highlight.highlightShape(shape);

  // Activate legend-row by data-type
  staticEls('.legend-row[data-type]').forEach((el) => {
    if (el.dataset.type === essence) el.classList.add('active');
  });
  // Activate mobile chips by data-type
  staticEls('.bs-chip[data-type]').forEach((el) => {
    if (el.dataset.type === essence) el.classList.add('active');
  });
  // Legacy shape-filter-item (older side panel that hasn't been removed yet)
  staticEls('.shape-filter-item').forEach((el) => {
    const label = el.querySelector('.shape-filter-item__label')?.textContent ?? '';
    const shapeName = Object.entries(SHAPE_LABEL).find(([, v]) => v === label)?.[0] ?? label;
    if (shapeName === essence || label.toLowerCase().includes(essence)) el.classList.add('active');
  });
}

export function highlightField(field: string, highlight: HighlightEngine): void {
  if (activeFieldFilter === field) {
    clearAllFilters();
    highlight.reset();
    return;
  }
  clearAllFilters();
  activeFieldFilter = field;
  highlight.highlightField(field);
  activateAxis('.legend-field-row[data-field]', 'data-field', field);
  activateAxis('.bs-chip[data-field]', 'data-field', field);
}

export function highlightTier(tier: string, highlight: HighlightEngine): void {
  if (activeTierFilter === tier) {
    clearAllFilters();
    highlight.reset();
    return;
  }
  clearAllFilters();
  activeTierFilter = tier;
  highlight.highlightTier(tier);
  activateAxis('.legend-tier-row[data-tier]', 'data-tier', tier);
  activateAxis('.bs-chip[data-tier]', 'data-tier', tier);
}

export function highlightLevel(level: string, highlight: HighlightEngine): void {
  if (activeLevelFilter === Number(level)) {
    clearAllFilters();
    highlight.reset();
    return;
  }
  clearAllFilters();
  activeLevelFilter = Number(level);
  const cy = legendCy;
  if (cy) {
    cy.nodes(`[level = "${level}"]`).addClass('highlighted');
    cy.nodes(`[level != "${level}"]`).addClass('dimmed');
    cy.edges().addClass('dimmed');
  }
  activateAxis('.legend-level-row[data-level]', 'data-level', level);
  activateAxis('.bs-chip[data-level]', 'data-level', level);
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