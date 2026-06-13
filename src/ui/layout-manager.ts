import cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';
import { uiState } from './state.js';
import {
  LAYOUTS,
  SHAPE_LABEL,
  ESSENCE_LABEL,
  FIELD_COLOR,
  FIELD_LABEL,
  NODE_TIER_STYLE,
  TIER_LABEL,
  EDGE_TYPE_STYLE,
} from '../core/config.js';

// ── Debounce utility ────────────────────────────────────────────────────────────

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { fn(...args); timer = null; }, ms);
  }) as unknown as T;
}

// ── Current layout state ────────────────────────────────────────────────────────

let _currentLayout = 'cose';

export function getCurrentLayout(): string {
  return _currentLayout;
}

export function setCurrentLayout(name: string): void {
  _currentLayout = name;
}

// ── Stats ──────────────────────────────────────────────────────────────────────

// RAF-gated + debounced stats update — prevents layout thrashing from frequent events
let _statsRaf: number | null = null;
let _statsDebounce: ReturnType<typeof setTimeout> | null = null;
let _statsPending = false;

function doUpdateStats(cy: Core): void {
  _statsPending = true;
  if (_statsRaf !== null) return;
  _statsRaf = requestAnimationFrame(() => {
    _statsRaf = null;
    if (!_statsPending) return;
    _statsPending = false;
    const set = (id: string, val: string) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const nodes = cy.nodes().not('.layer-parent');
    set('stat-nodes', String(nodes.length));
    set('stat-edges', String(cy.edges().length));
    set('stat-selected', String(cy.$(':selected').length));
    set('stat-layout', _currentLayout.toUpperCase());

    // Three orthogonal visual legends (Essence→shape, Field→border, Tier→fill)
    populateEssenceLegend(cy);
    populateFieldLegend(cy);
    populateTierLegend(cy);
    populateEdgeLegend(cy);
  });
}

/**
 * Populate category legend (sidebar grid + mobile chips) from CATEGORY_COLOR.
 * Call once after graph load; runs on every stats update to sync counts.
 */
function populateCategoryLegend(cy: Core): void {
  // Import at runtime to avoid circular deps (config is plain, no side effects)
  const CATEGORY_COLOR: Record<string, string> = {
    cardiovascular:    '#ef4444', respiratory:       '#3b82f6',
    digestive:         '#22c55e', endocrine:         '#f97316',
    musculoskeletal:   '#06b6d4', anti_infective:    '#a855f7',
    anti_tumor:       '#ec4899', blood:             '#f43f5e',
    immunology:       '#eab308', dermatology:       '#a16207',
    antipyretic:      '#7dd3fc', anti_rheumatic:    '#ea580c',
    anti_gout:        '#9333ea', nutrition:          '#6b7280',
    diagnostic:       '#9ca3af', pharmacy_practice: '#94a3b8',
    pharmacy_service: '#94a3b8', pharmacology:      '#ec4899',
  };
  const CATEGORY_LABEL: Record<string, string> = {
    cardiovascular:    '心血管', respiratory:       '呼吸',
    digestive:         '消化',   endocrine:         '内分泌',
    musculoskeletal:   '骨骼',   anti_infective:    '抗感染',
    anti_tumor:       '抗肿瘤', blood:             '血液',
    immunology:       '免疫',   dermatology:       '皮肤',
    antipyretic:      '解热镇痛', anti_rheumatic:  '抗风湿',
    anti_gout:        '抗痛风', nutrition:          '营养',
    diagnostic:       '诊断',   pharmacy_practice: '药学知识一',
    pharmacy_service: '药学服务', pharmacology:    '药学知识二',
  };

  const sidebarGrid = document.getElementById('legend-category-grid');
  const mobileChips = document.getElementById('bs-category-chips');
  if (!sidebarGrid || !mobileChips) return;

  const usedCats = new Set<string>();
  cy.nodes().not('.layer-parent').forEach((n: cytoscape.NodeSingular) => {
    const cat = n.data('category') as string;
    if (cat && cat in CATEGORY_COLOR) usedCats.add(cat);
  });

  // Sort by display label
  const sorted = [...usedCats].sort((a, b) =>
    (CATEGORY_LABEL[a] ?? a).localeCompare(CATEGORY_LABEL[b] ?? b)
  );

  // Build sidebar HTML
  if (sidebarGrid.children.length === 0) {
    sidebarGrid.innerHTML = sorted.map((cat) => {
      const color = CATEGORY_COLOR[cat];
      const label = CATEGORY_LABEL[cat] ?? cat;
      return `<div class="legend-row">
        <span class="legend-cat-dot" style="background:${color}"></span>
        <span class="legend-row__label">${label}</span>
        <span class="legend-row__count" id="legend-cat-count-${cat}"></span>
      </div>`;
    }).join('');
  }

  // Build mobile chips HTML (initial build only)
  if (mobileChips.children.length === 0) {
    mobileChips.innerHTML = sorted.map((cat) => {
      const color = CATEGORY_COLOR[cat];
      const label = CATEGORY_LABEL[cat] ?? cat;
      return `<div class="bs-chip">
        <div class="bs-chip__dot bs-chip__dot--cat" style="background:${color}"></div>
        <span>${label}</span>
      </div>`;
    }).join('');
  }

  // Update counts on both
  sorted.forEach((cat) => {
    const count = cy.nodes().not('.layer-parent').filter(`[category = "${cat}"]`).length;
    const sidebarCountEl = document.getElementById(`legend-cat-count-${cat}`);
    if (sidebarCountEl) sidebarCountEl.textContent = count > 0 ? `${count}` : '';
  });
}

// ── Essence legend (shape) ───────────────────────────────────────────────────────
// Fills: #legend-essence-grid (desktop sidebar) + #bs-essence-chips (mobile)

export function populateEssenceLegend(cy: Core): void {
  const desktopGrid = document.getElementById('legend-essence-grid');
  const mobileChips = document.getElementById('bs-essence-chips');
  if (!desktopGrid || !mobileChips) return;

  // Build once
  if (desktopGrid.children.length === 0) {
    const rows = Object.entries(ESSENCE_LABEL).map(([key, label]) => {
      const shape = NODE_TYPE_SHAPE_MAP[key] ?? 'rectangle';
      return `<div class="legend-row" data-type="${key}">
        <span class="legend-node--shape shape-${shape}" style="background:#94a3b8"></span>
        <span class="legend-row__label">${label}</span>
        <span class="legend-row__count" id="legend-essence-count-${key}"></span>
      </div>`;
    });
    desktopGrid.innerHTML = rows.join('');

    // Attach click → highlightShape (uses uiState.highlight internally)
    desktopGrid.querySelectorAll<HTMLElement>('.legend-row[data-type]').forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        highlightShape(row.dataset.type ?? '', uiState.highlight!);
      });
    });
  }

  if (mobileChips.children.length === 0) {
    mobileChips.innerHTML = Object.entries(ESSENCE_LABEL).map(([key, label]) => {
      const shape = NODE_TYPE_SHAPE_MAP[key] ?? 'rectangle';
      return `<div class="bs-chip" data-type="${key}">
        <span class="bs-chip__shape shape-${shape}" style="background:#94a3b8"></span>
        <span>${label}</span>
        <span class="bs-chip__count" id="bs-essence-count-${key}"></span>
      </div>`;
    }).join('');

    mobileChips.querySelectorAll<HTMLElement>('.bs-chip[data-type]').forEach((chip) => {
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', () => {
        highlightShape(chip.dataset.type ?? '', uiState.highlight!);
      });
    });
  }

  // Update counts
  Object.keys(ESSENCE_LABEL).forEach((key) => {
    const count = cy.nodes().not('.layer-parent').filter(`[essence = "${key}"]`).length;
    const dEl = document.getElementById(`legend-essence-count-${key}`);
    const mEl = document.getElementById(`bs-essence-count-${key}`);
    if (dEl) dEl.textContent = count > 0 ? `${count}` : '';
    if (mEl) mEl.textContent = count > 0 ? `${count}` : '';
  });
}

// ── Field legend (border color) ─────────────────────────────────────────────────

export function populateFieldLegend(cy: Core): void {
  const desktopGrid = document.getElementById('legend-field-grid');
  const mobileChips = document.getElementById('bs-field-chips');
  if (!desktopGrid || !mobileChips) return;

  if (desktopGrid.children.length === 0) {
    desktopGrid.innerHTML = Object.entries(FIELD_LABEL).map(([key, label]) => {
      const color = FIELD_COLOR[key] ?? '#94a3b8';
      return `<div class="legend-field-row" data-field="${key}">
        <span class="legend-swatch" style="background:#ffffff;border:2px solid ${color}"></span>
        <span class="legend-row__label">${label}</span>
        <span class="legend-row__count" id="legend-field-count-${key}"></span>
      </div>`;
    }).join('');

    desktopGrid.querySelectorAll<HTMLElement>('.legend-field-row[data-field]').forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        highlightField(row.dataset.field ?? '', uiState.highlight!);
      });
    });
  }

  if (mobileChips.children.length === 0) {
    mobileChips.innerHTML = Object.entries(FIELD_LABEL).map(([key, label]) => {
      const color = FIELD_COLOR[key] ?? '#94a3b8';
      return `<div class="bs-chip bs-chip--field" data-field="${key}">
        <span class="bs-chip__swatch" style="background:#ffffff;border:2px solid ${color}"></span>
        <span>${label}</span>
        <span class="bs-chip__count" id="bs-field-count-${key}"></span>
      </div>`;
    }).join('');

    mobileChips.querySelectorAll<HTMLElement>('.bs-chip[data-field]').forEach((chip) => {
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', () => {
        highlightField(chip.dataset.field ?? '', uiState.highlight!);
      });
    });
  }

  Object.keys(FIELD_LABEL).forEach((key) => {
    const count = cy.nodes().not('.layer-parent').filter(`[field = "${key}"]`).length;
    const dEl = document.getElementById(`legend-field-count-${key}`);
    const mEl = document.getElementById(`bs-field-count-${key}`);
    if (dEl) dEl.textContent = count > 0 ? `${count}` : '';
    if (mEl) mEl.textContent = count > 0 ? `${count}` : '';
  });
}

// ── Tier legend (fill color) ───────────────────────────────────────────────────

export function populateTierLegend(cy: Core): void {
  const desktopGrid = document.getElementById('legend-tier-grid');
  const mobileChips = document.getElementById('bs-tier-chips');
  if (!desktopGrid || !mobileChips) return;

  if (desktopGrid.children.length === 0) {
    desktopGrid.innerHTML = Object.entries(TIER_LABEL).map(([key, label]) => {
      const bgColor = NODE_TIER_STYLE[key]?.bgColor ?? '#f1f5f9';
      return `<div class="legend-tier-row" data-tier="${key}">
        <span class="legend-swatch" style="background:${bgColor};border:2px solid #ffffff"></span>
        <span class="legend-row__label">${label}</span>
        <span class="legend-row__count" id="legend-tier-count-${key}"></span>
      </div>`;
    }).join('');

    desktopGrid.querySelectorAll<HTMLElement>('.legend-tier-row[data-tier]').forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        highlightTier(row.dataset.tier ?? '', uiState.highlight!);
      });
    });
  }

  if (mobileChips.children.length === 0) {
    mobileChips.innerHTML = Object.entries(TIER_LABEL).map(([key, label]) => {
      const bgColor = NODE_TIER_STYLE[key]?.bgColor ?? '#f1f5f9';
      return `<div class="bs-chip bs-chip--tier" data-tier="${key}">
        <span class="bs-chip__swatch" style="background:${bgColor};border:2px solid #ffffff"></span>
        <span>${label}</span>
        <span class="bs-chip__count" id="bs-tier-count-${key}"></span>
      </div>`;
    }).join('');

    mobileChips.querySelectorAll<HTMLElement>('.bs-chip[data-tier]').forEach((chip) => {
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', () => {
        highlightTier(chip.dataset.tier ?? '', uiState.highlight!);
      });
    });
  }

  Object.keys(TIER_LABEL).forEach((key) => {
    const count = cy.nodes().not('.layer-parent').filter(`[tier = "${key}"]`).length;
    const dEl = document.getElementById(`legend-tier-count-${key}`);
    const mEl = document.getElementById(`bs-tier-count-${key}`);
    if (dEl) dEl.textContent = count > 0 ? `${count}` : '';
    if (mEl) mEl.textContent = count > 0 ? `${count}` : '';
  });
}

// ── Edge legend (边类型) ────────────────────────────────────────────────────────
export function populateEdgeLegend(cy: Core): void {
  const desktopGrid = document.getElementById('legend-edge-grid');
  const mobileChips = document.getElementById('bs-edge-chips');
  if (!desktopGrid && !mobileChips) return;

  if (desktopGrid && desktopGrid.children.length === 0) {
    desktopGrid.innerHTML = Object.entries(EDGE_LABEL).map(([key, label]) => {
      const style = EDGE_TYPE_STYLE[key] ?? { color: '#95a5a6', lineStyle: 'solid', arrow: 'none' };
      const dash = style.lineStyle === 'dashed' ? 'stroke-dasharray="5 3"'
        : style.lineStyle === 'dotted' ? 'stroke-dasharray="1 3"'
        : '';
      const arrowDef = style.arrow === 'triangle'
        ? `<polygon points="26,5 21,2 21,8" fill="${style.color}"/>`
        : style.arrow === 'tee'
        ? `<line x1="24" y1="2" x2="26" y2="5" stroke="${style.color}" stroke-width="2"/><line x1="24" y1="8" x2="26" y2="5" stroke="${style.color}" stroke-width="2"/>`
        : '';
      return `<div class="legend-edge-row" data-edge="${key}">
        <svg width="28" height="10" viewBox="0 0 28 10">
          <line x1="2" y1="5" x2="26" y2="5" stroke="${style.color}" stroke-width="2" ${dash}/>
          ${arrowDef}
        </svg>
        <span class="legend-edge-row__label">${label}</span>
        <span class="legend-edge-row__count" id="legend-edge-count-${key}"></span>
      </div>`;
    }).join('');
  }

  // Attach click handlers via event delegation (handles static + dynamic rows in one place)
  const attachEdgeHandlers = (container: HTMLElement, selector: string) => {
    if ((container as HTMLElement & { _edgeDelegated?: boolean })._edgeDelegated) return;
    (container as HTMLElement & { _edgeDelegated?: boolean })._edgeDelegated = true;
    container.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>(selector);
      if (!row) return;
      const edge = row.dataset.edge ?? '';
      highlightEdgeTypeFilter(edge, uiState.highlight!);
    });
  };

  if (desktopGrid) attachEdgeHandlers(desktopGrid, '.legend-edge-row[data-edge]');
  if (mobileChips) attachEdgeHandlers(mobileChips, '.bs-chip[data-edge]');

  Object.keys(EDGE_LABEL).forEach((key) => {
    const count = cy.edges(`[edgeType = "${key}"]`).length;
    // Dynamic IDs (populated from dynamic HTML generation)
    const dEl = document.getElementById(`legend-edge-count-${key}`);
    const mEl = document.getElementById(`bs-edge-count-${key}`);
    // Static HTML IDs (desktop sidebar static rows)
    const staticEl = document.getElementById(`count-edge-${key}`);
    const text = count > 0 ? `${count}` : '';
    if (dEl) dEl.textContent = text;
    if (mEl) mEl.textContent = text;
    if (staticEl) staticEl.textContent = text;
  });
}

// ── Field filter ───────────────────────────────────────────────────────────────

export function highlightField(field: string, highlight: HighlightEngine): void {
  if (activeFieldFilter === field) {
    clearAllFilters();
    highlight.reset();
    return;
  }
  clearAllFilters();
  activeFieldFilter = field;
  highlight.highlightField(field);

  // Activate desktop legend rows
  document.querySelectorAll('.legend-field-row[data-field]').forEach((el) => {
    if ((el as HTMLElement).dataset.field === field) el.classList.add('active');
  });
  // Activate mobile chips
  document.querySelectorAll('.bs-chip[data-field]').forEach((el) => {
    if ((el as HTMLElement).dataset.field === field) el.classList.add('active');
  });
}

// ── Tier filter ───────────────────────────────────────────────────────────────

export function highlightTier(tier: string, highlight: HighlightEngine): void {
  if (activeTierFilter === tier) {
    clearAllFilters();
    highlight.reset();
    return;
  }
  clearAllFilters();
  activeTierFilter = tier;
  highlight.highlightTier(tier);

  // Activate desktop legend rows
  document.querySelectorAll('.legend-tier-row[data-tier]').forEach((el) => {
    if ((el as HTMLElement).dataset.tier === tier) el.classList.add('active');
  });
  // Activate mobile chips
  document.querySelectorAll('.bs-chip[data-tier]').forEach((el) => {
    if ((el as HTMLElement).dataset.tier === tier) el.classList.add('active');
  });
}

// ── Edge type filter ───────────────────────────────────────────────────────────

export function highlightEdgeTypeFilter(edge: string, highlight: HighlightEngine): void {
  if (activeEdgeFilter === edge) {
    clearAllFilters();
    highlight.reset();
    return;
  }
  clearAllFilters();
  activeEdgeFilter = edge;
  highlight.highlightEdgeType(edge);

  // Activate desktop legend rows
  document.querySelectorAll('.legend-edge-row[data-edge]').forEach((el) => {
    if ((el as HTMLElement).dataset.edge === edge) el.classList.add('active');
  });
  // Activate mobile chips
  document.querySelectorAll('.bs-chip[data-edge]').forEach((el) => {
    if ((el as HTMLElement).dataset.edge === edge) el.classList.add('active');
  });
}

// ── Edge label ─────────────────────────────────────────────────────────────────
const EDGE_LABEL: Record<string, string> = {
  has:             '包含',
  isa:             '属于',
  activates:       '激动',
  inhibits:       '抑制',
  mechanism:       '机制',
  metabolizes:     '代谢',
  treats:          '治疗',
  causes:          '致因',
  interacts:       '相互作用',
  contraindicates: '禁忌',
  prerequisite:    '前置',
};

// ── Active filter state ────────────────────────────────────────────────────────
let activeFieldFilter: string | null = null;
let activeTierFilter: string | null = null;
let activeEdgeFilter: string | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

const NODE_TYPE_SHAPE_MAP: Record<string, string> = {
  notion: 'octagon',
  medication: 'ellipse',
  illness: 'diamond',
  route: 'triangle',
  substance: 'pentagon',
  process: 'star',
  module: 'round-rectangle',
  section: 'tag',
};

export function updateStats(cy: Core): void {
  if (_statsDebounce !== null) clearTimeout(_statsDebounce);
  _statsDebounce = setTimeout(() => {
    doUpdateStats(cy);
    _statsDebounce = null;
  }, 100);
}


let _sheetStatsDebounce: ReturnType<typeof setTimeout> | null = null;

export function syncBottomSheetStats(cy: Core): void {
  if (_sheetStatsDebounce !== null) clearTimeout(_sheetStatsDebounce);
  _sheetStatsDebounce = setTimeout(() => {
    const set = (id: string, val: string) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('bs-stat-nodes', String(cy.nodes().not('.layer-parent').length));
    set('bs-stat-edges', String(cy.edges().length));
    set('bs-stat-selected', String(cy.$(':selected').length));
    set('bs-stat-layout', _currentLayout.toUpperCase());
    _sheetStatsDebounce = null;
  }, 100);
}

// ── Layout ──────────────────────────────────────────────────────────────────────

export function runLayout(name: string, renderer: Renderer): void {
  _currentLayout = name;
  document.querySelectorAll('.layout-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + name);
  if (btn) btn.classList.add('active');
  const bsBtn = document.getElementById('bs-btn-' + name);
  if (bsBtn) bsBtn.classList.add('active');
  const desc = document.getElementById('layout-desc');
  const layout = LAYOUTS[name];
  if (desc) desc.textContent = layout?.description ?? '';
  renderLayoutParams(name);
  // Keep bottom-sheet params in sync if the panel is open
  const paramsBlock = document.getElementById('bs-params-block');
  if (paramsBlock?.classList.contains('open')) {
    renderBsLayoutParams(name);
  }
  renderer.runLayout(name);
}

function fmt(val: number, step: number): string {
  return step < 1 ? val.toFixed(2) : String(val);
}

export function renderLayoutParams(name: string): void {
  const container = document.getElementById('layout-params-rows');
  const applyBtn = document.getElementById('apply-params-btn');
  const params = LAYOUTS[name]?.params ?? [];
  if (!container) return;
  if (params.length === 0) { container.innerHTML = '<div class="no-params">此布局无可调参数</div>'; if (applyBtn) applyBtn.style.display = 'none'; return; }
  container.innerHTML = params.map((p) => {
    if (p.type === 'select') {
      const opts = (p.options ?? []).map((o) => `<option value="${o}">${o}</option>`).join('');
      return `<div class="param-row"><div class="param-label">${p.label}</div><select class="param-select" data-key="${p.key}">${opts}</select></div>`;
    }
    if (p.type === 'bool') {
      return `<div class="param-row"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.7rem;color:var(--muted)"><input type="checkbox" data-key="${p.key}" ${p.default ? 'checked' : ''} style="accent-color:var(--accent);cursor:pointer">${p.label}</label></div>`;
    }
    const val = p.default as number;
    const min = p.min ?? 0, max = p.max ?? 100;
    const pct = ((val - min) / (max - min)) * 100;
    return `<div class="param-row"><div class="param-label">${p.label}<span class="param-label__val">${fmt(val, p.step ?? 1)}</span></div><input type="range" class="param-slider" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${val}" style="background:linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)"></div>`;
  }).join('');
  container.addEventListener('input', (e) => {
    const slider = (e.target as HTMLInputElement).closest<HTMLInputElement>('.param-slider');
    if (!slider) return;
    const key = slider.dataset.key ?? '';
    const p = params.find((x) => x.key === key);
    if (!p) return;
    const span = slider.parentElement?.querySelector('.param-label__val');
    if (span) span.textContent = fmt(parseFloat(slider.value), p.step ?? 1);
    const min = p.min ?? 0, max = p.max ?? 100;
    const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)`;
  });
  if (applyBtn) applyBtn.style.display = '';
}

export function applyLayoutParams(renderer: Renderer): void {
  const container = document.getElementById('layout-params-rows');
  if (!container) return;
  const overrides: Record<string, unknown> = {};
  container.querySelectorAll<HTMLInputElement>('.param-slider').forEach((s) => { overrides[s.dataset.key ?? ''] = parseFloat(s.value); });
  container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((s) => { overrides[s.dataset.key ?? ''] = s.value; });
  container.querySelectorAll<HTMLInputElement>('.param-row input[type="checkbox"]').forEach((cb) => { overrides[cb.dataset.key ?? ''] = cb.checked; });
  const base = { ...(LAYOUTS[_currentLayout]?.cytoscape ?? {}) };
  Object.assign(base, overrides);
  document.querySelectorAll('.layout-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + _currentLayout);
  if (btn) btn.classList.add('active');
  const bsBtn = document.getElementById('bs-btn-' + _currentLayout);
  if (bsBtn) bsBtn.classList.add('active');
  const l = renderer.getCy().layout(base as unknown as cytoscape.LayoutOptions);
  l.run();
}

export function renderBsLayoutParams(name: string): void {
  const container = document.getElementById('bs-layout-params');
  const applyBtn = document.getElementById('bs-apply-btn');
  const params = LAYOUTS[name]?.params ?? [];
  if (!container) return;
  if (params.length === 0) { container.innerHTML = '<div style="font-size:0.7rem;color:var(--muted);padding:4px 0">此布局无可调参数</div>'; if (applyBtn) applyBtn.style.display = 'none'; return; }
  container.innerHTML = params.map((p) => {
    if (p.type === 'select') {
      const opts = (p.options ?? []).map((o) => `<option value="${o}">${o}</option>`).join('');
      return `<div class="bs-param-row"><div class="bs-param-label">${p.label}</div><select class="bs-param-slider param-select" data-key="${p.key}" style="height:32px;padding:4px 8px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.05);color:var(--text-2);font-size:0.72rem">${opts}</select></div>`;
    }
    if (p.type === 'bool') {
      return `<div class="bs-param-row"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.7rem;color:var(--text-2)"><input type="checkbox" data-key="${p.key}" ${p.default ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer">${p.label}</label></div>`;
    }
    const val = p.default as number;
    const min = p.min ?? 0, max = p.max ?? 100;
    const pct = ((val - min) / (max - min)) * 100;
    return `<div class="bs-param-row"><div class="bs-param-label">${p.label}<span class="bs-param-label__val" id="bs-pv-${p.key}">${fmt(val, p.step ?? 1)}</span></div><input type="range" class="bs-param-slider" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${val}" style="background:linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)"></div>`;
  }).join('');
  container.querySelectorAll<HTMLInputElement>('.bs-param-slider:not(.param-select)').forEach((slider) => {
    slider.addEventListener('input', () => {
      const key = slider.dataset.key ?? '';
      const p = params.find((x) => x.key === key);
      if (!p) return;
      const span = document.getElementById(`bs-pv-${key}`);
      if (span) span.textContent = fmt(parseFloat(slider.value), p.step ?? 1);
      const min = p.min ?? 0, max = p.max ?? 100;
      const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
      slider.style.background = `linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)`;
    });
  });
  if (applyBtn) applyBtn.style.display = '';
}

export function toggleBsParams(): void {
  const block = document.getElementById('bs-params-block');
  const body = document.getElementById('bs-layout-params');
  if (!block || !body) return;
  const open = block.classList.toggle('open');
  body.style.display = open ? '' : 'none';
  if (open) renderBsLayoutParams(_currentLayout);
}

export function applyBsParams(renderer: Renderer): void {
  const container = document.getElementById('bs-layout-params');
  if (!container) return;
  const overrides: Record<string, unknown> = {};
  container.querySelectorAll<HTMLInputElement>('.bs-param-slider:not(.param-select)').forEach((s) => { overrides[s.dataset.key ?? ''] = parseFloat(s.value); });
  container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((s) => { overrides[s.dataset.key ?? ''] = s.value; });
  container.querySelectorAll<HTMLInputElement>('.bs-param-row input[type="checkbox"]').forEach((cb) => { overrides[cb.dataset.key ?? ''] = cb.checked; });
  const base = { ...(LAYOUTS[_currentLayout]?.cytoscape ?? {}) };
  Object.assign(base, overrides);
  const l = renderer.getCy().layout(base as unknown as cytoscape.LayoutOptions);
  l.run();
}

export function fitGraph(renderer: Renderer): void {
  renderer.fit();
}

export function randomize(renderer: Renderer, highlight: HighlightEngine): void {
  clearShapeFilter();
  highlight.reset();
  const cy = renderer.getCy();
  cy.nodes().not('.layer-parent').forEach((node: cytoscape.NodeSingular) => { node.unlock(); });
  const nodePanel = document.getElementById('node-panel');
  if (nodePanel) nodePanel.classList.remove('visible');
  const container = cy.container();
  if (container) container.style.filter = 'none';
  cy.nodes().not('.layer-parent').positions(() => ({ x: Math.random() * cy.width(), y: Math.random() * cy.height() }));
}

// ── Animation ──────────────────────────────────────────────────────────────────

export function animatePulse(renderer: Renderer): void {
  const cy = renderer.getCy();
  const sel = cy.$(':selected').length > 0 ? cy.$(':selected') : cy.nodes().not('.layer-parent');
  if (sel.length === 0) return;
  let scale = 1, dir = 1;
  let raf: number;
  let frame = 0;
  const step = () => {
    frame++;
    scale += 0.03 * dir;
    if (scale >= 1.25) dir = -1;
    if (scale <= 0.95) {
      scale = 1;
      sel.removeClass('pulse');
      sel.style('width', '');
      sel.style('height', '');
      cancelAnimationFrame(raf);
      return;
    }
    sel.addClass('pulse');
    // Throttle style computation: only update every other frame
    if (frame % 2 === 0) {
      sel.style('width', (n: cytoscape.NodeSingular) => String((n.data('weight') || 70) * scale));
      sel.style('height', (n: cytoscape.NodeSingular) => String((n.data('weight') || 70) * scale));
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

// ── Shared filter clear ───────────────────────────────────────────────────────

function clearAllFilters(): void {
  activeShapeFilter = null;
  activeFieldFilter = null;
  activeTierFilter = null;
  activeEdgeFilter = null;
  document.querySelectorAll(
    '.legend-row,.legend-field-row,.legend-tier-row,.legend-edge-row,.shape-filter-item,.bs-chip'
  ).forEach((el) => el.classList.remove('active'));
}

// ── Shape filter ───────────────────────────────────────────────────────────────

let activeShapeFilter: string | null = null;

export function clearShapeFilter(): void {
  clearAllFilters();
}

export function getActiveShapeFilter(): string | null {
  return activeShapeFilter;
}

export function highlightShape(essence: string, highlight: HighlightEngine): void {
  if (activeShapeFilter === essence) {
    clearShapeFilter();
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
  document.querySelectorAll('.legend-row[data-type]').forEach((el) => {
    if ((el as HTMLElement).dataset.type === essence) el.classList.add('active');
  });
  // Activate mobile chips by data-type
  document.querySelectorAll('.bs-chip[data-type]').forEach((el) => {
    if ((el as HTMLElement).dataset.type === essence) el.classList.add('active');
  });
  // Legacy shape-filter-item
  document.querySelectorAll('.shape-filter-item').forEach((el) => {
    const label = el.querySelector('.shape-filter-item__label')?.textContent ?? '';
    const shapeName = Object.entries(SHAPE_LABEL).find(([, v]) => v === label)?.[0] ?? label;
    if (shapeName === essence || label.toLowerCase().includes(essence)) el.classList.add('active');
  });
}
