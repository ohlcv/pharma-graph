// src/ui/layout/layout-params.ts
// Layout parameter panel rendering for desktop sidebar and mobile bottom sheet.
// All HTML templates are delegated to layout-params-template.ts so the
// desktop + mobile variants share the same markup-generation logic.

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
import { _currentLayout } from './layout-engine-reexport.js';
import { forEachStatic } from '../dom-cache.js';

// Re-export the RenderParam type so callers can import it from here without
// knowing about the template module.
export type { RenderParam } from './layout-params-template.js';

// ── Desktop params panel ─────────────────────────────────────────────────────────

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
  container.innerHTML = params.map((p) => renderParamRow(p as RenderParam, stored?.[p.key], 'desktop')).join('');
  container.addEventListener('input', (e) => {
    const slider = (e.target as HTMLElement).closest<HTMLInputElement>('.param-slider');
    if (slider) {
      const key = slider.dataset.key ?? '';
      const p = params.find((x) => x.key === key);
      if (!p || p.type === 'bool') return;
      const span = slider.parentElement?.querySelector('.param-label__val');
      if (span) span.textContent = String(parseFloat(slider.value));
      const min = p.min ?? 0;
      const max = p.max ?? 100;
      const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
      slider.style.background = `linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)`;
    }
    saveStoredParams(name, readLiveValues(container, '.param-slider'));
  });
  if (applyBtn) applyBtn.style.display = '';
}

export function applyLayoutParams(renderer: Renderer): void {
  const container = document.getElementById('layout-params-rows');
  if (!container) return;
  const overrides = collectParamOverrides(container, '.param-slider');
  syncActiveLayoutBtn();
  renderer.runLayout(_currentLayout(), overrides);
}

export function resetLayoutParams(renderer: Renderer): void {
  const name = _currentLayout();
  clearStoredParams(name);
  renderLayoutParams(name);
  renderBsLayoutParams(name);
  renderer.runLayout(name);
}

function syncActiveLayoutBtn(): void {
  const name = _currentLayout();
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
  container.innerHTML = params.map((p) => renderParamRow(p as RenderParam, stored?.[p.key], 'mobile')).join('');
  container
    .querySelectorAll<HTMLInputElement>('.bs-param-slider:not(.param-select)')
    .forEach((slider) => {
      slider.addEventListener('input', () => {
        const key = slider.dataset.key ?? '';
        const p = params.find((x) => x.key === key);
        if (!p || p.type === 'bool') return;
        const span = document.getElementById(`bs-pv-${key}`);
        if (span) span.textContent = String(parseFloat(slider.value));
        const min = p.min ?? 0;
        const max = p.max ?? 100;
        const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)`;
      });
    });
  container.addEventListener('input', () => saveStoredParams(name, readLiveValues(container, '.bs-param-slider:not(.param-select)')));
  if (applyBtn) applyBtn.style.display = '';
  if (resetBtn) resetBtn.style.display = '';
}

export function applyBsParams(renderer: Renderer): void {
  const container = document.getElementById('bs-layout-params');
  if (!container) return;
  const overrides = collectParamOverrides(container, '.bs-param-slider:not(.param-select)');
  renderer.runLayout(_currentLayout(), overrides);
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
  if (open) renderBsLayoutParams(_currentLayout());
}

// ── Mobile bottom-sheet layout accordion ───────────────────────────────────────

export function toggleBsLayout(): void {
  const block = document.getElementById('bs-layout-block');
  const body = document.getElementById('bs-layout-body');
  if (!block || !body) return;
  const open = block.classList.toggle('open');
  body.style.display = open ? '' : 'none';
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
    const block = document.getElementById('bs-layout-block');
    const body = document.getElementById('bs-layout-body');
    block?.classList.add('open');
    if (body) body.style.display = '';
  }
}

export function resetBsAdvancedPrefs(): void {
  setMobileLayoutOpen(false);
  setMobileAdvancedOpen(false);
}
