// src/ui/layout-manager.ts
// Layout algorithm selection + parameter UI. Stats and legend rendering have
// moved to graph-stats.ts and legend-manager.ts; this file is responsible for
// running layouts and managing the params panel (desktop + bottom sheet).

import cytoscape from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';
import { LAYOUTS, DEFAULT_LAYOUT } from '../core/config.js';
import { pulseSelection } from './anim-pulse.js';
import { forEachStatic } from './dom-cache.js';

// ── Current layout state ────────────────────────────────────────────────────────

let _currentLayout = DEFAULT_LAYOUT;

// Display labels for the toolbar segmented switcher. Source of truth stays in
// LAYOUTS (key + cytoscape config); this map only carries the user-facing
// name shown on the segmented control.
const LAYOUT_LABELS: Record<string, string> = {
  cose: 'COSE',
  concentric: '同心圆',
  circle: '环形',
  grid: '网格',
  dagre: 'Dagre',
  breadthfirst: '广度',
  euler: 'Euler',
};

export function getCurrentLayout(): string {
  return _currentLayout;
}

export function setCurrentLayout(name: string): void {
  _currentLayout = name;
}

/**
 * Sync all DOM surfaces that display the currently-active layout name to the
 * given `name`, without running cytoscape. Called by `runLayout` after a
 * user-initiated switch, by `applyLayoutParams`/`resetLayoutParams`, and by
 * bootstrap (main.ts) so first paint shows the DEFAULT_LAYOUT, not whatever
 * literal was hardcoded in index.html.
 *
 * Surfaces updated:
 *   - `.layout-btn` active class (desktop dropdown items)
 *   - `#bs-btn-{name}` active class (mobile sheet)
 *   - `#layout-desc` description text (from LAYOUTS[name].description)
 *   - `#layout-switcher-current` label text (from LAYOUT_LABELS, fallback to name)
 *   - `aria-selected` on each `layout-switcher__item`
 *
 * Idle when `LAYOUTS[name]` is unknown (e.g. cytoscape built-ins used
 * downstream but not in our config) — we still update the label from
 * LAYOUT_LABELS but skip the description fetch.
 */
export function syncLayoutDisplay(name: string): void {
  forEachStatic((b) => b.classList.remove('active'), '.layout-btn');
  const btn = document.getElementById('btn-' + name);
  if (btn) btn.classList.add('active');
  const bsBtn = document.getElementById('bs-btn-' + name);
  if (bsBtn) bsBtn.classList.add('active');

  const layoutObj = LAYOUTS[name];
  if (layoutObj) {
    const desc = document.getElementById('layout-desc');
    if (desc) desc.textContent = layoutObj.description ?? '';
  }

  const current = document.getElementById('layout-switcher-current');
  if (current) current.textContent = LAYOUT_LABELS[name] ?? name;

  document.querySelectorAll<HTMLElement>('.layout-switcher__item').forEach((it) => {
    const active = it.dataset.name === name;
    it.classList.toggle('active', active);
    it.setAttribute('aria-selected', String(active));
  });
}

// ── Layout ──────────────────────────────────────────────────────────────────────

export function runLayout(name: string, renderer: Renderer): void {
  _currentLayout = name;
  syncLayoutDisplay(name);
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

// ── Param persistence (per-layout slider values) ────────────────────────────────
//
// Issue (清单 §8.2): before this change, switching layouts lost the slider
// values the user had just tuned because renderLayoutParams rebuilt the DOM
// from LAYOUTS[name].params every time. The fix is to write the current
// per-key value to localStorage on every input event, and read it back when
// (re)rendering the same layout.

const PARAMS_STORAGE_PREFIX = 'pharma-graph:layout-params:';

function loadStoredParams(name: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(PARAMS_STORAGE_PREFIX + name);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredParams(name: string, values: Record<string, string>): void {
  try {
    localStorage.setItem(PARAMS_STORAGE_PREFIX + name, JSON.stringify(values));
  } catch {
    /* localStorage blocked / quota — silently ignore */
  }
}

function clearStoredParams(name: string): void {
  try {
    localStorage.removeItem(PARAMS_STORAGE_PREFIX + name);
  } catch {
    /* ignore */
  }
}

/** Read the live values from the rendered slider DOM, keyed by data-key. */
function readLiveValues(container: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  container.querySelectorAll<HTMLInputElement>('.param-slider, .bs-param-slider').forEach((el) => {
    const k = el.dataset['key'];
    if (k) out[k] = el.value;
  });
  container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((el) => {
    const k = el.dataset['key'];
    if (k) out[k] = el.value;
  });
  container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    const k = cb.dataset['key'];
    if (k && cb.closest('.param-row, .bs-param-row')) out[k] = cb.checked ? '1' : '0';
  });
  return out;
}

export function renderLayoutParams(name: string): void {
  const container = document.getElementById('layout-params-rows');
  const applyBtn = document.getElementById('apply-params-btn');
  const params = LAYOUTS[name]?.params ?? [];
  if (!container) return;
  if (params.length === 0) {
    container.innerHTML = '<div class="no-params">此布局无可调参数</div>';
    if (applyBtn) applyBtn.style.display = 'none';
    return;
  }
  const stored = loadStoredParams(name);
  container.innerHTML = params.map((p) => renderParamRow(p, stored?.[p.key])).join('');
  container.addEventListener('input', (e) => {
    const slider = (e.target as HTMLElement).closest<HTMLInputElement>('.param-slider');
    if (slider) {
      const key = slider.dataset.key ?? '';
      const p = params.find((x) => x.key === key);
      if (!p || p.type === 'bool') return;
      const span = slider.parentElement?.querySelector('.param-label__val');
      if (span) span.textContent = fmt(parseFloat(slider.value), p.step ?? 1);
      const min = p.min ?? 0,
        max = p.max ?? 100;
      const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
      slider.style.background = `linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)`;
    }
    // Persist on every change: range drag, select change, checkbox toggle all fire `input`.
    saveStoredParams(name, readLiveValues(container));
  });
  if (applyBtn) applyBtn.style.display = '';
}

export function applyLayoutParams(renderer: Renderer): void {
  const container = document.getElementById('layout-params-rows');
  if (!container) return;
  const overrides = collectParamOverrides(container, '.param-slider');
  // Keep toolbar active state in sync (same as runLayout)
  forEachStatic((b) => b.classList.remove('active'), '.layout-btn');
  const btn = document.getElementById('btn-' + _currentLayout);
  if (btn) btn.classList.add('active');
  const bsBtn = document.getElementById('bs-btn-' + _currentLayout);
  if (bsBtn) bsBtn.classList.add('active');
  renderer.runLayout(_currentLayout, overrides);
}

export function renderBsLayoutParams(name: string): void {
  const container = document.getElementById('bs-layout-params');
  const applyBtn = document.getElementById('bs-apply-btn');
  const resetBtn = document.getElementById('bs-reset-btn');
  const params = LAYOUTS[name]?.params ?? [];
  if (!container) return;
  if (params.length === 0) {
    container.innerHTML =
      '<div style="font-size:0.7rem;color:var(--muted);padding:4px 0">此布局无可调参数</div>';
    if (applyBtn) applyBtn.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'none';
    return;
  }
  const stored = loadStoredParams(name);
  container.innerHTML = params.map((p) => renderBsParamRow(p, stored?.[p.key])).join('');
  container
    .querySelectorAll<HTMLInputElement>('.bs-param-slider:not(.param-select)')
    .forEach((slider) => {
      slider.addEventListener('input', () => {
        const key = slider.dataset.key ?? '';
        const p = params.find((x) => x.key === key);
        if (!p || p.type === 'bool') return;
        const span = document.getElementById(`bs-pv-${key}`);
        if (span) span.textContent = fmt(parseFloat(slider.value), p.step ?? 1);
        const min = p.min ?? 0,
          max = p.max ?? 100;
        const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)`;
      });
    });
  container.addEventListener('input', () => saveStoredParams(name, readLiveValues(container)));
  if (applyBtn) applyBtn.style.display = '';
  if (resetBtn) resetBtn.style.display = '';
}

export function toggleBsParams(): void {
  const block = document.getElementById('bs-params-block');
  const body = document.getElementById('bs-layout-params');
  const applyBtn = document.getElementById('bs-apply-btn');
  const resetBtn = document.getElementById('bs-reset-btn');
  if (!block || !body) return;
  const open = block.classList.toggle('open');
  body.style.display = open ? '' : 'none';
  if (applyBtn) applyBtn.style.display = open ? '' : 'none';
  if (resetBtn) resetBtn.style.display = open ? '' : 'none';
  if (open) renderBsLayoutParams(_currentLayout);
}

export function applyBsParams(renderer: Renderer): void {
  const container = document.getElementById('bs-layout-params');
  if (!container) return;
  const overrides = collectParamOverrides(container, '.bs-param-slider:not(.param-select)');
  renderer.runLayout(_currentLayout, overrides);
}

/**
 * Reset the current layout's sliders to LAYOUTS[name].params defaults. Wipes
 * the per-layout localStorage entry and re-renders both desktop + bottom-sheet
 * panels. Issue (清单 §1.2): gives the user a way back from slider ranges
 * that drift far from the library defaults (e.g. nodeRepulsion 1000 vs
 * cose-bilkent's 4500).
 */
export function resetLayoutParams(renderer: Renderer): void {
  clearStoredParams(_currentLayout);
  renderLayoutParams(_currentLayout);
  renderBsLayoutParams(_currentLayout);
  // Re-run with default cytoscape config (no overrides) so the visual reset
  // is actually applied, not just the slider DOM.
  renderer.runLayout(_currentLayout);
}

// ── Param row templates ─────────────────────────────────────────────────────────

/**
 * Per-param input renderer descriptor. Mirrors `LayoutParam` in config.ts but
 * with `default` widened to include `boolean` (the checkbox branch) — TS's
 * `Omit` plus an explicit field keeps the two types from drifting.
 *
 * Discriminated on `type`:
 *   - type='select' → must carry `options: string[]`
 *   - type='bool'   → renders a checkbox; default coerced to boolean
 *   - (omitted)     → numeric range slider; default coerced to number
 */
type RenderParam =
  | {
      type?: 'range';
      key: string;
      label: string;
      default: number;
      min?: number;
      max?: number;
      step?: number;
      description?: string;
    }
  | { type: 'bool'; key: string; label: string; default: boolean | number; description?: string }
  | {
      type: 'select';
      key: string;
      label: string;
      default: string;
      options: string[];
      description?: string;
    };

function renderParamRow(p: RenderParam, storedValue?: string): string {
  if (p.type === 'select') {
    const value = storedValue ?? String(p.default);
    const opts = p.options
      .map((o) => `<option value="${o}"${o === value ? ' selected' : ''}>${o}</option>`)
      .join('');
    return `<div class="param-row"${p.description ? ` title="${escAttr(p.description)}"` : ''}><div class="param-label">${p.label}</div><select class="param-select" data-key="${p.key}">${opts}</select></div>`;
  }
  if (p.type === 'bool') {
    const checked = storedValue !== undefined ? storedValue === '1' : Boolean(p.default);
    return `<div class="param-row"${p.description ? ` title="${escAttr(p.description)}"` : ''}><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.7rem;color:var(--muted)"><input type="checkbox" data-key="${p.key}" ${checked ? 'checked' : ''} style="accent-color:var(--accent);cursor:pointer">${p.label}</label></div>`;
  }
  const val = storedValue !== undefined ? parseFloat(storedValue) : p.default;
  if (Number.isNaN(val)) return '';
  const min = p.min ?? 0,
    max = p.max ?? 100;
  const pct = ((val - min) / (max - min)) * 100;
  const step = p.step ?? 1;
  return `<div class="param-row"${p.description ? ` title="${escAttr(p.description)}"` : ''}><div class="param-label">${p.label}<span class="param-label__val">${fmt(val, step)}</span></div><input type="range" class="param-slider" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${step}" value="${val}" style="background:linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)"></div>`;
}

function renderBsParamRow(p: RenderParam, storedValue?: string): string {
  if (p.type === 'select') {
    const value = storedValue ?? String(p.default);
    const opts = p.options
      .map((o) => `<option value="${o}"${o === value ? ' selected' : ''}>${o}</option>`)
      .join('');
    return `<div class="bs-param-row"${p.description ? ` title="${escAttr(p.description)}"` : ''}><div class="bs-param-label">${p.label}</div><select class="bs-param-slider param-select" data-key="${p.key}" style="height:32px;padding:4px 8px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.05);color:var(--text-2);font-size:0.72rem">${opts}</select></div>`;
  }
  if (p.type === 'bool') {
    const checked = storedValue !== undefined ? storedValue === '1' : Boolean(p.default);
    return `<div class="bs-param-row"${p.description ? ` title="${escAttr(p.description)}"` : ''}><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.7rem;color:var(--text-2)"><input type="checkbox" data-key="${p.key}" ${checked ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer">${p.label}</label></div>`;
  }
  const val = storedValue !== undefined ? parseFloat(storedValue) : p.default;
  if (Number.isNaN(val)) return '';
  const min = p.min ?? 0,
    max = p.max ?? 100;
  const pct = ((val - min) / (max - min)) * 100;
  const step = p.step ?? 1;
  return `<div class="bs-param-row"${p.description ? ` title="${escAttr(p.description)}"` : ''}><div class="bs-param-label">${p.label}<span class="bs-param-label__val" id="bs-pv-${p.key}">${fmt(val, step)}</span></div><input type="range" class="bs-param-slider" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${step}" value="${val}" style="background:linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)"></div>`;
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Collect slider/select/checkbox values into an overrides map.
// Desktop uses `.param-slider`, mobile uses `.bs-param-slider:not(.param-select)` —
// both branches share the same param-row markup, so we resolve by passing the
// slider selector.
function collectParamOverrides(
  container: HTMLElement,
  sliderSelector: string,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  container.querySelectorAll<HTMLInputElement>(sliderSelector).forEach((s) => {
    overrides[s.dataset.key ?? ''] = parseFloat(s.value);
  });
  container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((s) => {
    overrides[s.dataset.key ?? ''] = s.value;
  });
  container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    if (!cb.dataset.key) return;
    // Only count checkboxes that live inside a param-row (skip any other checkboxes)
    if (!cb.closest('.param-row, .bs-param-row')) return;
    overrides[cb.dataset.key] = cb.checked;
  });
  return overrides;
}

export function fitGraph(renderer: Renderer): void {
  renderer.fit();
}

// Fixed "world-space" random range. We deliberately do NOT use
// `cy.width()`/`cy.height()` here — those are the *viewport* dimensions,
// which depend on the user's device (mobile vs. desktop vs. resized
// window). Coupling the random spread to the viewport means the same
// logical layout looks radically different on a phone vs. a desktop
// monitor (issue #17), and resizing the window mid-session would also
// reshuffle the visual range.
//
// A constant ±1500 world units is wide enough that 200+ nodes don't
// visibly pile up, and it matches the magnitude that cose / dagre
// produce in their default configs — so subsequent `reset-all` and
// layout switches don't yank the camera around.
const RANDOMIZE_WORLD_SIZE = 1500;

export function randomize(renderer: Renderer, highlight: HighlightEngine): void {
  highlight.reset();
  const cy = renderer.getCy();
  cy.nodes()
    .not('.layer-parent')
    .forEach((node: cytoscape.NodeSingular) => {
      node.unlock();
    });
  const nodePanel = document.getElementById('node-panel');
  if (nodePanel) nodePanel.classList.remove('visible');
  const container = cy.container();
  if (container) container.style.filter = 'none';
  cy.nodes()
    .not('.layer-parent')
    .positions(() => ({
      x: (Math.random() - 0.5) * 2 * RANDOMIZE_WORLD_SIZE,
      y: (Math.random() - 0.5) * 2 * RANDOMIZE_WORLD_SIZE,
    }));
  // Fit so the user actually sees the new spread (previously the camera
  // stayed on its pre-randomize viewport and the new layout appeared as a
  // tiny clump in one corner).
  renderer.fit();
}

// ── Animation ──────────────────────────────────────────────────────────────────

export function animatePulse(renderer: Renderer): void {
  pulseSelection(renderer.getCy());
}
