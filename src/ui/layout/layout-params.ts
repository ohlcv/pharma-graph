// src/ui/layout/layout-params.ts
// Layout parameter panel rendering for desktop sidebar and mobile bottom sheet.
// All HTML templates are delegated to layout-params-template.ts so the
// desktop + mobile variants share the same markup-generation logic.
//
// Visibility contract (see components.css header): this module never writes
// `style.display`. Collapsible blocks are driven by their `.open` class (CSS
// hides the body / action row when `.open` is absent); one-off "nothing to
// show" cases use the `.u-hidden` utility class.

import { Renderer } from '../../core/renderer.js';
import { LAYOUTS } from '../../core/config.js';
import { renderParamRow, collectParamOverrides, type RenderParam } from './layout-params-template.js';
import {
  loadStoredParams,
  saveStoredParams,
  clearStoredParams,
  getMobileLayoutOpen,
  setMobileLayoutOpen,
  getMobileAdvancedOpen,
  setMobileAdvancedOpen,
} from './layout-store.js';
import { getCurrentLayout } from './layout-engine.js';
import { forEachStatic } from '../dom-cache.js';

// Re-export the RenderParam type so callers can import it from here without
// knowing about the template module.
export type { RenderParam } from './layout-params-template.js';

const HIDDEN_CLASS = 'u-hidden';

function setHidden(el: HTMLElement | null, hidden: boolean): void {
  el?.classList.toggle(HIDDEN_CLASS, hidden);
}

const DESKTOP_SLIDER = '.param-slider';
const MOBILE_SLIDER = '.bs-param-slider:not(.param-select)';

// ── Desktop params panel ─────────────────────────────────────────────────────────

/**
 * One delegated `input` handler for the desktop params container.
 *
 * `renderLayoutParams` runs on every layout switch but the container element
 * (`#layout-params-rows`) is never replaced — only its innerHTML is. Binding a
 * fresh closure each time stacked one listener per switch, and every stale
 * listener kept the OLD layout name, so a slider drag also overwrote the
 * previous layouts' stored params with the current DOM values.
 *
 * This is a stable module-level function, so `addEventListener` de-duplicates
 * it, and it resolves the layout name at event time from `data-layout` on the
 * container (written by `renderLayoutParams`).
 */
function onDesktopParamsInput(e: Event): void {
  const container = e.currentTarget as HTMLElement;
  const name = container.dataset['layout'];
  if (!name) return;

  const slider = (e.target as HTMLElement).closest<HTMLInputElement>(DESKTOP_SLIDER);
  if (slider) {
    const key = slider.dataset['key'] ?? '';
    const p = (LAYOUTS[name]?.params ?? []).find((x) => x.key === key);
    if (!p || p.type === 'bool') return;
    const span = slider.parentElement?.querySelector('.param-label__val');
    if (span) span.textContent = String(parseFloat(slider.value));
    const min = p.min ?? 0;
    const max = p.max ?? 100;
    const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)`;
  }
  saveStoredParams(name, readLiveValues(container, DESKTOP_SLIDER));
}

export function renderLayoutParams(name: string): void {
  const container = document.getElementById('layout-params-rows');
  const applyBtn = document.getElementById('apply-params-btn');
  const params = LAYOUTS[name]?.params ?? [];
  if (!container) return;

  // Which layout the rows below belong to — read by onDesktopParamsInput.
  container.dataset['layout'] = name;
  container.addEventListener('input', onDesktopParamsInput); // idempotent (same fn ref)

  if (params.length === 0) {
    container.innerHTML = '<div class="no-params">此布局无可调参数</div>';
    setHidden(applyBtn, true);
    return;
  }
  const stored = loadStoredParams(name);
  container.innerHTML = params.map((p) => renderParamRow(p as RenderParam, stored?.[p.key], 'desktop')).join('');
  setHidden(applyBtn, false);
}

export function applyLayoutParams(renderer: Renderer): void {
  const container = document.getElementById('layout-params-rows');
  if (!container) return;
  const overrides = collectParamOverrides(container, DESKTOP_SLIDER);
  syncActiveLayoutBtn();
  renderer.runLayout(getCurrentLayout(), overrides);
}

export function resetLayoutParams(renderer: Renderer): void {
  const name = getCurrentLayout();
  clearStoredParams(name);
  renderLayoutParams(name);
  renderBsLayoutParams(name);
  renderer.runLayout(name);
}

function syncActiveLayoutBtn(): void {
  const name = getCurrentLayout();
  forEachStatic((b) => b.classList.remove('active'), '.layout-btn');
  const btn = document.getElementById('btn-' + name);
  if (btn) btn.classList.add('active');
  const bsBtn = document.getElementById('bs-btn-' + name);
  if (bsBtn) bsBtn.classList.add('active');
}

function readLiveValues(container: HTMLElement, sliderSelector: string): Record<string, string> {
  const out: Record<string, string> = {};
  container.querySelectorAll<HTMLInputElement>(sliderSelector).forEach((el) => {
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

// ── Mobile bottom-sheet params panel ───────────────────────────────────────────

/**
 * Delegated `input` handler for the mobile params container. Same rationale as
 * `onDesktopParamsInput`: `renderBsLayoutParams` runs on every open / reset /
 * layout switch, so a per-render closure (and per-slider listeners) would pile
 * up. Sliders are replaced with the innerHTML, so delegation costs nothing.
 */
function onBsParamsInput(e: Event): void {
  const container = e.currentTarget as HTMLElement;
  const name = container.dataset['layout'];
  if (!name) return;

  const slider = (e.target as HTMLElement).closest<HTMLInputElement>(MOBILE_SLIDER);
  if (slider) {
    const key = slider.dataset['key'] ?? '';
    const p = (LAYOUTS[name]?.params ?? []).find((x) => x.key === key);
    if (p && p.type !== 'bool') {
      const span = document.getElementById(`bs-pv-${key}`);
      if (span) span.textContent = String(parseFloat(slider.value));
      const min = p.min ?? 0;
      const max = p.max ?? 100;
      const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
      slider.style.background = `linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)`;
    }
  }
  saveStoredParams(name, readLiveValues(container, MOBILE_SLIDER));
}

export function renderBsLayoutParams(name: string): void {
  const container = document.getElementById('bs-layout-params');
  const applyBtn = document.getElementById('bs-apply-btn');
  const resetBtn = document.getElementById('bs-reset-btn');
  const params = LAYOUTS[name]?.params ?? [];
  if (!container) return;

  container.dataset['layout'] = name;
  container.addEventListener('input', onBsParamsInput); // idempotent (same fn ref)

  if (params.length === 0) {
    container.innerHTML =
      '<div style="font-size:0.7rem;color:var(--muted);padding:4px 0">此布局无可调参数</div>';
    setHidden(applyBtn, true);
    setHidden(resetBtn, true);
    return;
  }
  const stored = loadStoredParams(name);
  container.innerHTML = params.map((p) => renderParamRow(p as RenderParam, stored?.[p.key], 'mobile')).join('');
  setHidden(applyBtn, false);
  setHidden(resetBtn, false);
}

export function applyBsParams(renderer: Renderer): void {
  const container = document.getElementById('bs-layout-params');
  if (!container) return;
  const overrides = collectParamOverrides(container, MOBILE_SLIDER);
  renderer.runLayout(getCurrentLayout(), overrides);
}

export function toggleBsParams(): void {
  const block = document.getElementById('bs-params-block');
  if (!block) return;
  // Open/closed is CSS-driven by `.open` (body + action row are hidden via
  // `.bs-params-block:not(.open)`). Rows are rendered lazily on first open.
  const open = block.classList.toggle('open');
  if (open) renderBsLayoutParams(getCurrentLayout());
}

// ── Mobile bottom-sheet layout accordion ───────────────────────────────────────

export function toggleBsLayout(): void {
  const block = document.getElementById('bs-layout-block');
  if (!block) return;
  const open = block.classList.toggle('open');
  setMobileLayoutOpen(open);
}

export function toggleBsAdvanced(): void {
  const adv = document.getElementById('bs-advanced');
  const head = document.getElementById('bs-advanced-toggle');
  if (!adv) return;
  const willOpen = adv.classList.contains('collapsed'); // currently collapsed → about to expand
  adv.classList.toggle('collapsed', !willOpen);
  head?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  setMobileAdvancedOpen(willOpen);
}

export function restoreBsAdvancedPrefs(): void {
  if (getMobileAdvancedOpen()) {
    const adv = document.getElementById('bs-advanced');
    const head = document.getElementById('bs-advanced-toggle');
    adv?.classList.remove('collapsed');
    head?.setAttribute('aria-expanded', 'true');
  }
  if (getMobileLayoutOpen()) {
    document.getElementById('bs-layout-block')?.classList.add('open');
  }
}

export function resetBsAdvancedPrefs(): void {
  setMobileLayoutOpen(false);
  setMobileAdvancedOpen(false);
}
