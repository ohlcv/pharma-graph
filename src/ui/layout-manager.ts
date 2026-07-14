// src/ui/layout-manager.ts
// Layout algorithm selection + parameter UI. Stats and legend rendering have
// moved to graph-stats.ts and legend-manager.ts; this file is responsible for
// running layouts and managing the params panel (desktop + bottom sheet).

import cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';
import { LAYOUTS } from '../core/config.js';
import { pulseSelection } from './anim-pulse.js';
import { forEachStatic } from './dom-cache.js';

// ── Current layout state ────────────────────────────────────────────────────────

let _currentLayout = 'cose';

export function getCurrentLayout(): string {
  return _currentLayout;
}

export function setCurrentLayout(name: string): void {
  _currentLayout = name;
}

// ── Layout ──────────────────────────────────────────────────────────────────────

export function runLayout(name: string, renderer: Renderer): void {
  _currentLayout = name;
  forEachStatic((b) => b.classList.remove('active'), '.layout-btn');
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
  if (params.length === 0) {
    container.innerHTML = '<div class="no-params">此布局无可调参数</div>';
    if (applyBtn) applyBtn.style.display = 'none';
    return;
  }
  container.innerHTML = params.map(renderParamRow).join('');
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
  const params = LAYOUTS[name]?.params ?? [];
  if (!container) return;
  if (params.length === 0) {
    container.innerHTML = '<div style="font-size:0.7rem;color:var(--muted);padding:4px 0">此布局无可调参数</div>';
    if (applyBtn) applyBtn.style.display = 'none';
    return;
  }
  container.innerHTML = params.map(renderBsParamRow).join('');
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
  const overrides = collectParamOverrides(container, '.bs-param-slider:not(.param-select)');
  renderer.runLayout(_currentLayout, overrides);
}

// ── Param row templates ─────────────────────────────────────────────────────────

interface ParamDescriptor {
  key: string;
  label: string;
  type?: 'range' | 'select' | 'bool';
  default?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

function renderParamRow(p: ParamDescriptor): string {
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
}

function renderBsParamRow(p: ParamDescriptor): string {
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

export function randomize(renderer: Renderer, highlight: HighlightEngine): void {
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
  pulseSelection(renderer.getCy());
}