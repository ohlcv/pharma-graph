import cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';
import { LAYOUTS, SHAPE_LABEL } from '../core/config.js';

// ── Current layout state ────────────────────────────────────────────────────────

let _currentLayout = 'cose';

export function getCurrentLayout(): string {
  return _currentLayout;
}

export function setCurrentLayout(name: string): void {
  _currentLayout = name;
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export function updateStats(cy: Core): void {
  const set = (id: string, val: string) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const nodes = cy.nodes().not('.layer-parent');
  set('stat-nodes', String(nodes.length));
  set('stat-edges', String(cy.edges().length));
  set('stat-selected', String(cy.$(':selected').length));
  set('stat-layout', _currentLayout.toUpperCase());
  const countShape = (shape: string, elId: string) => {
    const el = document.getElementById(elId);
    if (el) { const count = nodes.filter(`[type = "${shape}"]`).length; el.textContent = count > 0 ? `${count}` : ''; }
  };
  countShape('concept', 'count-ellipse');
  countShape('drug', 'count-round-rectangle');
  countShape('disease', 'count-diamond');
  countShape('ingredient', 'count-barrel');
}

export function syncBottomSheetStats(cy: Core): void {
  const set = (id: string, val: string) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('bs-stat-nodes', String(cy.nodes().not('.layer-parent').length));
  set('bs-stat-edges', String(cy.edges().length));
  set('bs-stat-selected', String(cy.$(':selected').length));
  set('bs-stat-layout', _currentLayout.toUpperCase());
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
  const step = () => {
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
    sel.style('width', (n: cytoscape.NodeSingular) => String((n.data('weight') || 70) * scale));
    sel.style('height', (n: cytoscape.NodeSingular) => String((n.data('weight') || 70) * scale));
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

// ── Shape filter ───────────────────────────────────────────────────────────────

let activeShapeFilter: string | null = null;

export function getActiveShapeFilter(): string | null {
  return activeShapeFilter;
}

export function highlightShape(shape: string, highlight: HighlightEngine): void {
  if (activeShapeFilter === shape) {
    activeShapeFilter = null;
    document.querySelectorAll('.node-type-item, .shape-filter-item, .bs-chip').forEach((el) => el.classList.remove('active'));
    highlight.reset();
    return;
  }
  activeShapeFilter = shape;
  document.querySelectorAll('.node-type-item, .shape-filter-item, .bs-chip').forEach((el) => { el.classList.remove('active'); });
  highlight.highlightShape(shape);
  document.querySelectorAll('.shape-filter-item').forEach((el) => {
    const label = el.querySelector('.shape-filter-item__label')?.textContent ?? '';
    const shapeName = Object.entries(SHAPE_LABEL).find(([, v]) => v === label)?.[0] ?? label;
    if (shapeName === shape || label.toLowerCase().includes(shape)) el.classList.add('active');
  });
  document.querySelectorAll('.node-type-item').forEach((el) => {
    const dot = el.querySelector('.node-type-item__dot') as HTMLElement;
    if (!dot) return;
    const bg = dot.style.background;
    const matchesShape = (
      (shape === 'ellipse' && dot.style.borderRadius === '50%') ||
      (shape === 'round-rectangle' && bg.includes('67e8f9')) ||
      (shape === 'diamond' && bg.includes('rotate(45deg)')) ||
      (shape === 'barrel' && bg.includes('c4b5fd')) ||
      (shape === 'rectangle' && bg.includes('f59e0b'))
    );
    if (matchesShape) el.classList.add('active');
  });
  document.querySelectorAll('.bs-chip').forEach((el) => {
    const chipShape = (el as HTMLElement).dataset.shape ?? '';
    if (chipShape === shape) el.classList.add('active');
  });
}
