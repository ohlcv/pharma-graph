// src/ui/main.ts
// Application entry — assembles all modules and wires up event handlers.
// All heavy logic has been moved to dedicated modules:
//   - renderer.ts       : Cytoscape instance + stylesheet + layout
//   - highlight-engine.ts: node highlighting, search highlighting, shape filter
//   - detail-panel.ts  : detail panel rendering + positioning
//   - search.ts        : search input + keyboard navigation
//   - graph-manager.ts : Markdown → GraphData loading

import './styles/main.css';
import cytoscape from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { GraphManager } from '../core/graph-manager.js';
import { TourEngine } from '../core/tour.js';
import { HighlightEngine } from './highlight-engine.js';
import { DetailPanel } from './detail-panel.js';
import { Search } from './search.js';
import { LAYOUTS, SHAPE_LABEL } from '../core/config.js';
import { brandCarousel } from './carousel.js';

const MD_FILES = import.meta.glob('../../content/**/*.md', { query: '?raw', import: 'default', eager: true });

// ── App state ───────────────────────────────────────────────────────────────────

let renderer: Renderer;
let highlight: HighlightEngine;
let detailPanel: DetailPanel;
let search: Search;
let tourEngine: TourEngine | null = null;
let currentLayout = 'cose';
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let edgeTooltip: HTMLElement | null = null;
let tourPathHistory: string[] = [];
let activeShapeFilter: string | null = null;

// ── Edge tooltip ───────────────────────────────────────────────────────────────

function initEdgeTooltip(): void {
  if (edgeTooltip) return;
  edgeTooltip = document.createElement('div');
  edgeTooltip.id = 'edge-tooltip';
  edgeTooltip.style.cssText = `
    position:fixed;z-index:9999;background:rgba(15,17,23,0.92);
    border:1px solid rgba(255,255,255,0.12);border-radius:8px;
    padding:6px 10px;font-size:0.72rem;color:#e2e8f0;
    pointer-events:none;max-width:240px;white-space:pre-wrap;
    word-break:break-word;opacity:0;transition:opacity 0.15s;
    font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,0.4);`;
  document.body.appendChild(edgeTooltip);
}

function showEdgeTooltip(text: string, x: number, y: number): void {
  if (!edgeTooltip) return;
  edgeTooltip.textContent = text;
  edgeTooltip.style.left = (x + 12) + 'px';
  edgeTooltip.style.top = (y - 12) + 'px';
  edgeTooltip.style.opacity = '1';
}

function hideEdgeTooltip(): void {
  if (!edgeTooltip) return;
  edgeTooltip.style.opacity = '0';
}

// ── Ripple effect ─────────────────────────────────────────────────────────────

function spawnNodeRipple(x: number, y: number, color: string): void {
  const ripple = document.createElement('div');
  ripple.className = 'node-ripple';
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  ripple.style.border = `2px solid ${color}`;
  document.body.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function updateStats(): void {
  const cy = renderer.getCy();
  const set = (id: string, val: string) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const nodes = cy.nodes().not('.layer-parent');
  set('stat-nodes', String(nodes.length));
  set('stat-edges', String(cy.edges().length));
  set('stat-selected', String(cy.$(':selected').length));
  set('stat-layout', currentLayout.toUpperCase());
  const countShape = (shape: string, elId: string) => {
    const el = document.getElementById(elId);
    if (el) { const count = nodes.filter(`[type = "${shape}"]`).length; el.textContent = count > 0 ? `${count}` : ''; }
  };
  countShape('concept', 'count-ellipse');
  countShape('drug', 'count-round-rectangle');
  countShape('disease', 'count-diamond');
  countShape('ingredient', 'count-barrel');
}

function syncBottomSheetStats(): void {
  const cy = renderer.getCy();
  const set = (id: string, val: string) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('bs-stat-nodes', String(cy.nodes().not('.layer-parent').length));
  set('bs-stat-edges', String(cy.edges().length));
  set('bs-stat-selected', String(cy.$(':selected').length));
  set('bs-stat-layout', currentLayout.toUpperCase());
}

function clearTourPath(): void { /* SVG removed */ }
function drawTourPathSegment(_from: string, _to: string): void { /* SVG removed */ }

// ── Layout ─────────────────────────────────────────────────────────────────────

function runLayout(name: string): void {
  if (!renderer) return;
  currentLayout = name;
  document.querySelectorAll('.layout-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + name);
  if (btn) btn.classList.add('active');
  const bsBtn = document.getElementById('bs-btn-' + name);
  if (bsBtn) bsBtn.classList.add('active');
  const desc = document.getElementById('layout-desc');
  const layout = LAYOUTS[name];
  if (desc) desc.textContent = layout?.description ?? '';
  renderLayoutParams(name);
  renderer.runLayout(name);
}

function fmt(val: number, step: number): string {
  return step < 1 ? val.toFixed(2) : String(val);
}

function renderLayoutParams(name: string): void {
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

function applyLayoutParams(): void {
  if (!renderer) return;
  const container = document.getElementById('layout-params-rows');
  if (!container) return;
  const overrides: Record<string, unknown> = {};
  container.querySelectorAll<HTMLInputElement>('.param-slider').forEach((s) => { overrides[s.dataset.key ?? ''] = parseFloat(s.value); });
  container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((s) => { overrides[s.dataset.key ?? ''] = s.value; });
  container.querySelectorAll<HTMLInputElement>('.param-row input[type="checkbox"]').forEach((cb) => { overrides[cb.dataset.key ?? ''] = cb.checked; });
  const base = { ...(LAYOUTS[currentLayout]?.cytoscape ?? {}) };
  Object.assign(base, overrides);
  document.querySelectorAll('.layout-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + currentLayout);
  if (btn) btn.classList.add('active');
  const bsBtn = document.getElementById('bs-btn-' + currentLayout);
  if (bsBtn) bsBtn.classList.add('active');
  const l = renderer.getCy().layout(base as unknown as cytoscape.LayoutOptions);
  l.run();
}

function renderBsLayoutParams(name: string): void {
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

function toggleBsParams(): void {
  const block = document.getElementById('bs-params-block');
  const body = document.getElementById('bs-params-body');
  if (!block || !body) return;
  const open = block.classList.toggle('open');
  body.style.display = open ? '' : 'none';
  if (open) renderBsLayoutParams(currentLayout);
}

function applyBsParams(): void {
  if (!renderer) return;
  const container = document.getElementById('bs-layout-params');
  if (!container) return;
  const overrides: Record<string, unknown> = {};
  container.querySelectorAll<HTMLInputElement>('.bs-param-slider:not(.param-select)').forEach((s) => { overrides[s.dataset.key ?? ''] = parseFloat(s.value); });
  container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((s) => { overrides[s.dataset.key ?? ''] = s.value; });
  container.querySelectorAll<HTMLInputElement>('.bs-param-row input[type="checkbox"]').forEach((cb) => { overrides[cb.dataset.key ?? ''] = cb.checked; });
  const base = { ...(LAYOUTS[currentLayout]?.cytoscape ?? {}) };
  Object.assign(base, overrides);
  const l = renderer.getCy().layout(base as unknown as cytoscape.LayoutOptions);
  l.run();
}

function fitGraph(): void { if (renderer) renderer.fit(); }

function randomize(): void {
  if (!renderer) return;
  highlight.reset();
  const cy = renderer.getCy();
  cy.nodes().not('.layer-parent').forEach((node: cytoscape.NodeSingular) => { node.unlock(); });
  const nodePanel = document.getElementById('node-panel');
  if (nodePanel) nodePanel.classList.remove('visible');
  const container = cy.container();
  if (container) container.style.filter = 'none';
  cy.nodes().not('.layer-parent').positions(() => ({ x: Math.random() * cy.width(), y: Math.random() * cy.height() }));
  updateStats();
  syncBottomSheetStats();
}

// ── Animation ──────────────────────────────────────────────────────────────────

function animatePulse(): void {
  if (!renderer) return;
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
      updateStats();
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

function highlightShape(shape: string): void {
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

// ── Zoom indicator ─────────────────────────────────────────────────────────────

let zoomIndicatorTimer: ReturnType<typeof setTimeout> | null = null;

function showZoomIndicator(): void {
  const el = document.getElementById('zoom-indicator');
  if (!el || !renderer) return;
  const pct = Math.round(renderer.getCy().zoom() * 100);
  el.textContent = `${pct}%`;
  el.style.display = '';
  el.style.opacity = '1';
  if (zoomIndicatorTimer) clearTimeout(zoomIndicatorTimer);
  zoomIndicatorTimer = setTimeout(() => {
    if (el) { el.style.opacity = '0'; setTimeout(() => { if (el) el.style.display = 'none'; }, 400); }
  }, 2500);
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast__dot"></span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'toast-out 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ── Bottom sheet ───────────────────────────────────────────────────────────────

function toggleBottomSheet(): void {
  const sheet = document.getElementById('bottom-sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  const bar = document.getElementById('sheet-expand-bar');
  const app = document.getElementById('app');
  if (!sheet) return;
  const open = sheet.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('visible', open);
  if (bar) bar.classList.toggle('sheet-open', open);
  if (app) app.classList.toggle('sheet-open', open);
  detailPanel.setSheetOpen(open);
  syncTourBarPosition();
}

function closeBottomSheet(): void {
  const sheet = document.getElementById('bottom-sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  const bar = document.getElementById('sheet-expand-bar');
  const app = document.getElementById('app');
  if (!sheet) return;
  sheet.classList.remove('open');
  if (backdrop) backdrop.classList.remove('visible');
  if (bar) bar.classList.remove('sheet-open');
  if (app) app.classList.remove('sheet-open');
  detailPanel.setSheetOpen(false);
  syncTourBarPosition();
}

function syncTourBarPosition(): void {
  const tourBar = document.getElementById('tour-status');
  if (!tourBar) return;
  if (window.innerWidth > 640) { tourBar.style.top = ''; tourBar.style.bottom = ''; }
}

// ── Mobile sheet drag ─────────────────────────────────────────────────────────

let sheetDragState: { startY: number; startTime: number; lastY: number; lastTime: number } | null = null;

function startSheetDrag(e: PointerEvent): void {
  const sheet = document.getElementById('bottom-sheet');
  const closeBar = document.getElementById('sheet-close-bar');
  if (!sheet || !sheet.classList.contains('open')) return;
  if (closeBar && !closeBar.contains(e.target as Node) && e.target !== closeBar) return;
  e.preventDefault();
  const now = performance.now();
  sheetDragState = { startY: e.clientY, startTime: now, lastY: e.clientY, lastTime: now };
  sheet.style.overflowY = 'hidden';

  const onMove = (me: PointerEvent) => {
    if (!sheetDragState) return;
    const delta = me.clientY - sheetDragState.startY;
    const rubberDelta = delta > 0 ? delta * 0.5 : delta;
    sheet.style.transform = `translateY(${Math.max(0, rubberDelta)}px)`;
    sheet.style.transition = 'none';
    sheetDragState.lastY = me.clientY;
    sheetDragState.lastTime = performance.now();
  };

  const onUp = (ue: PointerEvent) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (!sheetDragState) return;
    const { startY, startTime, lastY, lastTime } = sheetDragState;
    sheetDragState = null;
    const delta = ue.clientY - startY;
    const velocity = Math.abs((ue.clientY - lastY) / (performance.now() - lastTime || 1));
    sheet.style.transform = '';
    sheet.style.overflowY = '';
    if (delta > 80 || (delta > 0 && velocity > 0.5)) { sheet.style.transition = ''; closeBottomSheet(); }
    else { sheet.style.transition = 'transform 0.35s cubic-bezier(0.34,1.4,0.64,1)'; void sheet.offsetHeight; sheet.style.transform = ''; }
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

// ── Tour bar drag ─────────────────────────────────────────────────────────────

const TOPBAR_H = 72;
let tourDragState: { startX: number; startY: number; startLeft: number; startTop: number; el: HTMLElement } | null = null;

function startTourBarDrag(e: PointerEvent): void {
  const bar = document.getElementById('tour-status');
  if (!bar) return;
  if (window.innerWidth > 640) return;
  const target = e.target as HTMLElement;
  if (target.closest('button')) return;
  e.preventDefault();
  const rect = bar.getBoundingClientRect();
  tourDragState = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top, el: bar };
  bar.style.cursor = 'grabbing';
  bar.style.transition = 'none';
  document.addEventListener('pointermove', onTourDrag, { passive: false });
  document.addEventListener('pointerup', stopTourDrag);
}

function onTourDrag(e: PointerEvent): void {
  if (!tourDragState) return;
  e.preventDefault();
  const { el, startX, startY, startLeft, startTop } = tourDragState;
  const deltaX = e.clientX - startX;
  const deltaY = e.clientY - startY;
  const PAD = 8;
  const newLeft = Math.max(PAD, Math.min(startLeft + deltaX, window.innerWidth - el.offsetWidth - PAD));
  const newTop = Math.max(TOPBAR_H, Math.min(startTop + deltaY, window.innerHeight - el.offsetHeight - PAD));
  el.style.left = newLeft + 'px'; el.style.top = newTop + 'px'; el.style.bottom = 'auto'; el.style.transform = 'none';
}

function stopTourDrag(): void {
  if (!tourDragState) return;
  const { el } = tourDragState;
  tourDragState = null;
  el.style.cursor = '';
  el.style.transition = 'top 0.3s cubic-bezier(0.34,1.4,0.64,1),left 0.3s cubic-bezier(0.34,1.4,0.64,1),transform 0.3s cubic-bezier(0.34,1.4,0.64,1)';
  document.removeEventListener('pointermove', onTourDrag);
  document.removeEventListener('pointerup', stopTourDrag);
  const elRef = el;
  setTimeout(() => { elRef.style.transition = ''; }, 350);
}

// ── Panel drag ────────────────────────────────────────────────────────────────

let dragState: { startX: number; startY: number; startLeft: number; startTop: number; el: HTMLElement } | null = null;

function startPanelDrag(e: PointerEvent): void {
  if (window.innerWidth <= 640) return;
  const panel = document.getElementById('node-panel');
  if (!panel || !panel.classList.contains('visible')) return;
  dragState = { startX: e.clientX, startY: e.clientY, startLeft: panel.offsetLeft, startTop: panel.offsetTop, el: panel };
  panel.classList.add('dragging');
  document.addEventListener('pointermove', onPanelDrag);
  document.addEventListener('pointerup', stopPanelDrag);
}

function onPanelDrag(e: PointerEvent): void {
  if (!dragState) return;
  const { el, startLeft, startTop } = dragState;
  const W = el.offsetWidth, H = el.offsetHeight;
  const vpW = window.innerWidth, vpH = window.innerHeight;
  const TOPBAR_H = 56, PAD = 8;
  let left = Math.max(PAD, Math.min(startLeft + (e.clientX - dragState.startX), vpW - W - PAD));
  let top = Math.max(TOPBAR_H + PAD, Math.min(startTop + (e.clientY - dragState.startY), vpH - H - PAD));
  el.style.left = left + 'px'; el.style.top = top + 'px';
}

function stopPanelDrag(): void {
  if (dragState) { dragState.el.classList.remove('dragging'); dragState = null; }
  document.removeEventListener('pointermove', onPanelDrag);
  document.removeEventListener('pointerup', stopPanelDrag);
}

// ── Section collapse ───────────────────────────────────────────────────────────

function toggleSection(name: string): void {
  const section = document.querySelector(`[data-section="${name}"]`);
  const head = document.querySelector(`[data-section="${name}"] .sidebar-section__chevron`);
  if (!section) return;
  const open = section.getAttribute('data-section-state') === 'open';
  section.setAttribute('data-section-state', open ? 'closed' : 'open');
  if (head) head.classList.toggle('open', !open);
}

// ── Tour ───────────────────────────────────────────────────────────────────────

function initTourSlider(): void {
  const intervalSlider = document.getElementById('tour-interval') as HTMLInputElement;
  const depthSlider = document.getElementById('tour-maxdepth') as HTMLInputElement;
  const intervalVal = document.getElementById('tour-interval-val');
  const depthVal = document.getElementById('tour-depth-val');
  if (intervalSlider) {
    intervalSlider.addEventListener('input', () => {
      const v = parseInt(intervalSlider.value);
      if (intervalVal) intervalVal.textContent = (v / 1000).toFixed(1) + 's';
      const pct = ((v - 1000) / (10000 - 1000)) * 100;
      intervalSlider.style.background = `linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)`;
    });
    intervalSlider.addEventListener('change', () => { tourEngine?.setInterval(parseInt(intervalSlider.value)); });
  }
  if (depthSlider) {
    depthSlider.value = '10';
    depthSlider.addEventListener('input', () => {
      const v = parseInt(depthSlider.value);
      if (depthVal) depthVal.textContent = v === 10 ? '不限' : `第 ${v} 层`;
      const pct = ((v - 1) / (10 - 1)) * 100;
      depthSlider.style.background = `linear-gradient(to right,var(--accent)${pct}%,var(--border)${pct}%)`;
    });
    depthSlider.addEventListener('change', () => { const v = parseInt(depthSlider.value); tourEngine?.setMaxDepth(v >= 10 ? -1 : v); });
    depthSlider.style.background = `linear-gradient(to right,var(--accent)100%,var(--border)100%)`;
  }
}

function startTour(): void {
  if (!renderer) return;
  // Stop any existing tour first to avoid duplicate engines
  if (tourEngine && (tourEngine.isRunning() || tourEngine.isPaused())) tourStop();
  const cy = renderer.getCy();
  clearTourPath();
  tourPathHistory = [];
  const selected = cy.nodes('.node-selected').not('.layer-parent');
  let rootId: string;
  if (selected.length > 0) { rootId = selected[0].id(); }
  else {
    let best: cytoscape.NodeSingular = cy.nodes().not('.layer-parent')[0];
    let maxDegree = 0;
    cy.nodes().not('.layer-parent').forEach((n) => { const d = n.degree(); if (d > maxDegree) { maxDegree = d; best = n; } });
    rootId = best?.id() ?? '';
  }
  const intervalSlider = document.getElementById('tour-interval') as HTMLInputElement;
  const depthSlider = document.getElementById('tour-maxdepth') as HTMLInputElement;
  const interval = parseInt(intervalSlider?.value ?? '3000');
  const maxDepth = parseInt(depthSlider?.value ?? '10');
  const tourBtn = document.getElementById('btn-tour');
  const bsTourBtn = document.getElementById('bs-btn-tour');
  if (tourBtn) { tourBtn.classList.add('active'); void tourBtn.offsetWidth; }
  if (bsTourBtn) { bsTourBtn.classList.add('active'); void bsTourBtn.offsetWidth; }
  const playIcon = document.getElementById('tour-badge-play');
  const pauseIcon = document.getElementById('tour-badge-pause');
  const badgeText = document.getElementById('tour-badge-text');
  if (playIcon) playIcon.style.display = '';
  if (pauseIcon) pauseIcon.style.display = 'none';
  if (badgeText) badgeText.textContent = '漫游中';
  const bsTourPlay = document.getElementById('bs-tour-icon-play');
  const bsTourStop = document.getElementById('bs-tour-icon-stop');
  if (bsTourPlay) bsTourPlay.style.display = 'none';
  if (bsTourStop) bsTourStop.style.display = '';
  tourEngine = new TourEngine(cy);
  tourEngine.start(rootId, {
    interval, maxDepth: maxDepth >= 10 ? -1 : maxDepth,
    onStep: (info) => {
      const prevNodes = info.path.slice(0, -1);
      const currNode = info.path[info.path.length - 1];
      if (prevNodes.length > 0) {
        const prev = prevNodes[prevNodes.length - 1];
        drawTourPathSegment(prev, currNode);
        tourPathHistory.push(prev, currNode);
      } else { tourPathHistory.push(currNode); }
      detailPanel.show(info.nodeId);
      const status = document.getElementById('tour-status');
      const depthBadge = document.getElementById('tour-depth-badge');
      const countBadge = document.getElementById('tour-count-badge');
      const cycleBadge = document.getElementById('tour-cycle-badge');
      if (status) status.style.display = '';
      if (depthBadge) depthBadge.textContent = `第 ${info.depth + 1} 层`;
      if (countBadge) countBadge.textContent = `已探索 ${info.totalExplored} 个节点`;
      const progressBar = document.getElementById('tour-progress-bar');
      if (progressBar && info.totalToExplore > 0) { const pct = Math.round((info.totalExplored / info.totalToExplore) * 100); progressBar.style.width = `${pct}%`; }
      if (cycleBadge) { cycleBadge.style.display = info.cycleCount > 0 ? '' : 'none'; if (info.cycleCount > 0) cycleBadge.textContent = `第 ${info.cycleCount + 1} 轮`; }
    },
    onComplete: () => {
      clearTourPath();
      const depthBadge = document.getElementById('tour-depth-badge');
      const badgeText = document.getElementById('tour-badge-text');
      if (depthBadge) depthBadge.textContent = '完成!';
      if (badgeText) badgeText.textContent = '完成!';
      const tourBtn = document.getElementById('btn-tour');
      const bsTourBtn = document.getElementById('bs-btn-tour');
      if (tourBtn) tourBtn.classList.remove('active');
      if (bsTourBtn) bsTourBtn.classList.remove('active');
      const status = document.getElementById('tour-status');
      if (status && !tourEngine?.isRunning()) setTimeout(() => { if (status) status.style.display = 'none'; }, 2000);
    },
  });
  // 立即显示 tour bar，不等第一次 onStep
  const status = document.getElementById('tour-status');
  if (status) status.style.display = '';
}

function tourPause(): void {
  if (!tourEngine) return;
  const playIcon = document.getElementById('tour-badge-play');
  const pauseIcon = document.getElementById('tour-badge-pause');
  const badgeText = document.getElementById('tour-badge-text');
  const bsTourPlay = document.getElementById('bs-tour-icon-play');
  const bsTourStop = document.getElementById('bs-tour-icon-stop');
  if (tourEngine.isPaused()) {
    tourEngine.resume();
    if (playIcon) playIcon.style.display = '';
    if (pauseIcon) pauseIcon.style.display = 'none';
    if (badgeText) badgeText.textContent = '漫游中';
    if (bsTourPlay) bsTourPlay.style.display = '';
    if (bsTourStop) bsTourStop.style.display = 'none';
  } else {
    tourEngine.pause();
    if (playIcon) playIcon.style.display = 'none';
    if (pauseIcon) pauseIcon.style.display = '';
    if (badgeText) badgeText.textContent = '已暂停';
    if (bsTourPlay) bsTourPlay.style.display = 'none';
    if (bsTourStop) bsTourStop.style.display = '';
  }
}

function tourStop(): void {
  if (!tourEngine) return;
  tourEngine.stop();
  tourEngine = null;
  clearTourPath();
  const tourBtn = document.getElementById('btn-tour');
  const bsTourBtn = document.getElementById('bs-btn-tour');
  if (tourBtn) tourBtn.classList.remove('active');
  if (bsTourBtn) bsTourBtn.classList.remove('active');
  const bsTourPlay = document.getElementById('bs-tour-icon-play');
  const bsTourStop = document.getElementById('bs-tour-icon-stop');
  if (bsTourPlay) bsTourPlay.style.display = '';
  if (bsTourStop) bsTourStop.style.display = 'none';
  const status = document.getElementById('tour-status');
  if (status) status.style.display = 'none';
}

function toggleTour(): void {
  if (tourEngine?.isRunning() || tourEngine?.isPaused()) tourStop();
  else startTour();
}

// ── Keyboard shortcuts ──────────────────────────────────────────────────────────

function initShortcuts(): void {
  const cy = renderer.getCy();
  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    switch (e.key) {
      case 'Delete': case 'Backspace': cy.$(':selected').remove(); highlight.reset(); updateStats(); break;
      case 'Escape': cy.$(':selected').unselect(); highlight.reset(); detailPanel.close(); if (tourEngine?.isRunning() || tourEngine?.isPaused()) tourStop(); break;
      case 'f': case 'F': fitGraph(); break;
      case 'r': case 'R': randomize(); break;
      case 't': case 'T': toggleTour(); break;
      case 'a': case 'A': if (e.ctrlKey || e.metaKey) { e.preventDefault(); cy.nodes().not('.layer-parent').select(); } break;
      case 'p': case 'P': if (tourEngine?.isRunning() || tourEngine?.isPaused()) tourPause(); break;
    }
  });
}

// ── Debug overlay ─────────────────────────────────────────────────────────────

function initDebugOverlay(): void {
  const btn = document.createElement('button');
  btn.id = 'debug-toggle';
  btn.textContent = '调试状态 🔍';
  btn.addEventListener('click', () => {
    const active = btn.classList.toggle('active');
    const panel = document.getElementById('debug-panel');
    if (panel) panel.style.display = active ? '' : 'none';
    if (active) {
      if (!document.getElementById('debug-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'debug-overlay';
        renderer?.getCy().container()?.appendChild(overlay);
      }
      runDebugUpdate();
    } else {
      if (debugRafId !== null) { cancelAnimationFrame(debugRafId); debugRafId = null; }
      const ov = document.getElementById('debug-overlay');
      if (ov) ov.innerHTML = '';
    }
  });
  document.querySelector('.shortcuts-list')?.appendChild(btn);
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <h4>🔬 取证面板</h4>
    <div id="dbg-raw-data" style="font-size:9px;color:#fbbf24;background:rgba(251,191,36,0.08);border-radius:4px;padding:4px 6px;margin-bottom:8px;line-height:1.6"></div>
    <div style="margin-bottom:8px"><span style="color:#94a3b8;font-size:10px">容器 filter</span><div id="dbg-filter" style="font-size:10px;color:#e2e8f0;word-break:break-all"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;margin-bottom:8px">
      <div style="text-align:center;background:rgba(99,102,241,0.1);border-radius:6px;padding:4px 6px"><div style="font-size:9px;color:#64748b">:selected</div><div id="dbg-sel-count" style="font-size:14px;color:#818cf8;font-weight:700">0</div></div>
      <div style="text-align:center;background:rgba(239,68,68,0.1);border-radius:6px;padding:4px 6px"><div style="font-size:9px;color:#64748b">.dimmed</div><div id="dbg-dim-count" style="font-size:14px;color:#f87171;font-weight:700">0</div></div>
      <div style="text-align:center;background:rgba(34,197,94,0.1);border-radius:6px;padding:4px 6px"><div style="font-size:9px;color:#64748b">.sel-node</div><div id="dbg-snode-count" style="font-size:14px;color:#4ade80;font-weight:700">0</div></div>
      <div style="text-align:center;background:rgba(251,191,36,0.1);border-radius:6px;padding:4px 6px"><div style="font-size:9px;color:#64748b">.highlight</div><div id="dbg-hl-count" style="font-size:14px;color:#fbbf24;font-weight:700">0</div></div>
    </div>
    <div style="margin-bottom:8px"><span style="color:#94a3b8;font-size:10px">所有 :selected</span><div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px" id="dbg-all-selected"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
      <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:6px;padding:6px 8px"><div style="font-size:10px;color:#4ade80;font-weight:700;margin-bottom:4px">✨ 新主角</div><div id="dbg-new-name" style="font-size:10px;color:#e2e8f0;font-weight:700;margin-bottom:4px">—</div><div style="font-size:9px;color:#94a3b8;line-height:1.6" id="dbg-new-props"></div></div>
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:6px 8px"><div style="font-size:10px;color:#f87171;font-weight:700;margin-bottom:4px">⏮ 旧主角</div><div id="dbg-old-name" style="font-size:10px;color:#e2e8f0;font-weight:700;margin-bottom:4px">—</div><div style="font-size:9px;color:#94a3b8;line-height:1.6" id="dbg-old-props"></div></div>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;margin-bottom:6px"><div style="font-size:10px;color:#64748b;margin-bottom:4px">🔸 所有 .dimmed 节点（逐行）</div><div id="dbg-all-dimmed" style="font-size:9px;line-height:1.7;max-height:180px;overflow-y:auto"></div></div>
    <div class="debug-conflict" id="dbg-conflict" style="display:none"></div>`;
  document.body.appendChild(panel);
}

let debugOverlayActive = false;
let debugRafId: number | null = null;
let _prevSelectedNodeId: string | null = null;
let _prevSelectedNodeName: string | null = null;
let debugLastState = '';

function runDebugUpdate(): void {
  if (!debugOverlayActive || !renderer) { debugRafId = null; return; }
  const cy = renderer.getCy();
  const panel = document.getElementById('debug-panel');
  if (!panel) { debugRafId = null; return; }

  const selIds = cy.$(':selected').nodes().map((n: cytoscape.NodeSingular) => n.id()).sort().join(',');
  const dimIds = cy.nodes('.dimmed').not('.layer-parent').map((n: cytoscape.NodeSingular) => n.id()).sort().join(',');
  const snodeEls = cy.nodes('.selected-node');
  const currentNodeId = snodeEls.length > 0 ? snodeEls[0].id() : '';
  const stateKey = `${selIds}||${dimIds}||${currentNodeId}`;
  if (stateKey === debugLastState) {
    const overlay = document.getElementById('debug-overlay');
    if (overlay) {
      overlay.querySelectorAll<HTMLElement>('.debug-badge').forEach((badge) => {
        const nodeId = badge.dataset.nodeId;
        if (!nodeId) return;
        const node = cy.getElementById(nodeId);
        if (node.empty()) return;
        const pos = node.renderedPosition();
        const nodeH = node.renderedHeight();
        badge.style.left = pos.x + 'px'; badge.style.top = (pos.y - nodeH / 2 - 2) + 'px';
      });
    }
    if (document.getElementById('dbg-sel-count')) (document.getElementById('dbg-sel-count') as HTMLElement).textContent = String(cy.$(':selected').length);
    if (document.getElementById('dbg-dim-count')) (document.getElementById('dbg-dim-count') as HTMLElement).textContent = String(cy.nodes('.dimmed').not('.layer-parent').length);
    if (document.getElementById('dbg-snode-count')) (document.getElementById('dbg-snode-count') as HTMLElement).textContent = String(cy.nodes('.selected-node').length);
    debugRafId = requestAnimationFrame(() => runDebugUpdate());
    return;
  }
  debugLastState = stateKey;

  const filterText = cy.container()?.style.filter || '(无)';
  const filterEl = document.getElementById('dbg-filter');
  if (filterEl) filterEl.textContent = filterText;

  const allSelected = cy.$(':selected');
  const allDimmed = cy.nodes('.dimmed').not('.layer-parent');

  const rawEl = document.getElementById('dbg-raw-data');
  if (rawEl) rawEl.innerHTML = [`snodeCnt=${snodeEls.length}`, `selCnt=${allSelected.length}`, `dimCnt=${allDimmed.length}`, `sel=${allSelected.map((n: cytoscape.NodeSingular) => n.id()).join(',') || '∅'}`, `snode=${snodeEls.map((n: cytoscape.NodeSingular) => n.id()).join(',') || '∅'}`, `dimIds=${cy.nodes('.dimmed').map((n: cytoscape.NodeSingular) => n.id()).sort().join(',') || '∅'}`].join(' | ');

  if (document.getElementById('dbg-sel-count')) (document.getElementById('dbg-sel-count') as HTMLElement).textContent = String(allSelected.length);
  if (document.getElementById('dbg-dim-count')) (document.getElementById('dbg-dim-count') as HTMLElement).textContent = String(allDimmed.length);
  if (document.getElementById('dbg-snode-count')) (document.getElementById('dbg-snode-count') as HTMLElement).textContent = String(snodeEls.length);
  if (document.getElementById('dbg-hl-count')) (document.getElementById('dbg-hl-count') as HTMLElement).textContent = String(cy.nodes('.highlighted').length);

  const allSelectedEl = document.getElementById('dbg-all-selected');
  if (allSelectedEl) allSelectedEl.innerHTML = allSelected.length === 0 ? '<span style="font-size:9px;color:#64748b">无</span>' : allSelected.map((n: cytoscape.NodeSingular) => { const label = n.data('label') || n.id(); const dimmed = n.hasClass('dimmed'); const color = dimmed ? '#f87171' : '#818cf8'; const bg = dimmed ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)'; return `<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:${bg};color:${color}">${label.slice(0,10)}${dimmed ? ' ⚠' : ''}</span>`; }).join('');

  const snodeFirstId = snodeEls.length > 0 ? snodeEls[0].id() : null;
  const currentNode = snodeFirstId ? cy.getElementById(snodeFirstId) : null;
  const prevNodeId = _prevSelectedNodeId;
  const prevNode = prevNodeId ? cy.getElementById(prevNodeId) : null;
  _prevSelectedNodeId = null; _prevSelectedNodeName = null;

  const allDimmedEl = document.getElementById('dbg-all-dimmed');
  if (allDimmedEl) allDimmedEl.innerHTML = allDimmed.length === 0 ? '<span style="color:#64748b">无 dimmed 节点</span>' : allDimmed.map((n: cytoscape.NodeSingular) => { const label = (n.data('label') || n.id()).slice(0, 10); const bc = n.renderedStyle('border-color') as string; const bw = n.renderedStyle('border-width') as string; const isWhite = bc === '#ffffff' || bc === 'rgb(255,255,255)' || bc === 'rgba(255,255,255,1)'; const warn: string[] = []; if (n.selected()) warn.push('S'); if (isWhite) warn.push('白边'); if ((parseFloat(bw) || 0) >= 2.5) warn.push('粗边'); const warnTag = warn.length > 0 ? `<span style="color:#f87171"> ⚠${warn.join(',')}</span>` : ''; const isCurrent = currentNode && n.id() === currentNode.id(); const isPrev = prevNode && n.id() === prevNode.id(); const tag = isCurrent ? '✨' : isPrev ? '⏮' : '  '; return `<div>${tag}<b>${label}</b> bw=${bw} bc=${isWhite ? '⚠白' : 'ok'} ${warnTag}</div>`; }).join('');

  const newNameEl = document.getElementById('dbg-new-name');
  const newPropsEl = document.getElementById('dbg-new-props');
  const oldNameEl = document.getElementById('dbg-old-name');
  const oldPropsEl = document.getElementById('dbg-old-props');
  const conflictEl = document.getElementById('dbg-conflict');
  if (currentNode) { if (newNameEl) newNameEl.textContent = (currentNode.data('label') || currentNode.id()).slice(0, 12); if (newPropsEl) newPropsEl.textContent = nodeForensicProps(currentNode); }
  else { if (newNameEl) newNameEl.textContent = '—'; if (newPropsEl) newPropsEl.innerHTML = '<span style="color:#f87171">⚠ 无 .selected-node</span>'; }
  if (prevNode) { if (oldNameEl) oldNameEl.textContent = (_prevSelectedNodeName || prevNode.id()).slice(0, 12); if (oldPropsEl) { const props = nodeForensicProps(prevNode); oldPropsEl.textContent = props; if (isDimmedAndSelected(prevNode)) oldPropsEl.innerHTML += '<br><span style="color:#f87171;font-weight:700">⚠ dimmed+:selected 冲突!</span>'; } }
  else { if (oldNameEl) oldNameEl.textContent = '—'; if (oldPropsEl) oldPropsEl.textContent = ''; }

  const conflictNodes = cy.nodes('.dimmed').filter(':selected');
  if (conflictEl) { conflictEl.style.display = conflictNodes.length > 0 ? '' : 'none'; if (conflictNodes.length > 0) conflictEl.textContent = `⚠ 冲突: .dimmed+:selected = ${conflictNodes.length} 个`; }

  const overlay = document.getElementById('debug-overlay');
  if (overlay) {
    overlay.innerHTML = '';
    cy.nodes().not('.layer-parent').forEach((node: cytoscape.NodeSingular) => {
      const pos = node.renderedPosition();
      if (!pos) return;
      const nodeH = node.renderedHeight();
      const hasSelected = node.selected();
      const hasDimmed = node.hasClass('dimmed');
      const hasSNode = node.hasClass('selected-node');
      const hasHighlight = node.hasClass('highlighted');
      const hasHovered = node.hasClass('hovered');
      const parts: string[] = [];
      if (hasSelected) parts.push('S'); if (hasDimmed) parts.push('D'); if (hasSNode) parts.push('N'); if (hasHighlight) parts.push('H'); if (hasHovered) parts.push('V');
      const text = parts.length > 0 ? parts.join('+') : '·';
      const label = (node.data('label') || node.id()).slice(0, 6);
      let cls = 'debug-badge debug-badge--none';
      if (hasSelected && hasDimmed) cls = 'debug-badge debug-badge--selected';
      else if (hasDimmed) cls = 'debug-badge debug-badge--dimmed';
      else if (hasSelected) cls = 'debug-badge debug-badge--selected';
      else if (hasSNode) cls = 'debug-badge debug-badge--sel-node';
      else if (hasHighlight) cls = 'debug-badge debug-badge--highlight';
      else if (hasHovered) cls = 'debug-badge debug-badge--hovered';
      const badge = document.createElement('div');
      badge.className = cls; badge.dataset.nodeId = node.id(); badge.textContent = `${label}[${text}]`;
      badge.style.left = pos.x + 'px'; badge.style.top = (pos.y - nodeH / 2 - 2) + 'px';
      overlay.appendChild(badge);
      if (hasSelected && hasDimmed) {
        const c = document.createElement('div'); c.className = 'debug-badge debug-badge--selected'; c.textContent = 'CONFLICT!';
        c.style.left = pos.x + 'px'; c.style.top = (pos.y - nodeH / 2 - 28) + 'px';
        overlay.appendChild(c);
      }
    });
  }
  debugRafId = requestAnimationFrame(runDebugUpdate);
}
(runDebugUpdate as any)._lastState = '';

function nodeForensicProps(node: cytoscape.NodeSingular): string {
  if (node.removed()) return '<span style="color:#64748b">⚠ 节点已移除</span>';
  const bc = node.renderedStyle('border-color') as string;
  const bw = node.renderedStyle('border-width') as string;
  const isWhite = bc === '#ffffff' || bc === 'rgb(255,255,255)' || bc === 'rgba(255,255,255,1)' || bc === 'white';
  const isSelectedBorderWidth = typeof bw === 'number' && bw >= 2.5;
  const flag = (cond: boolean, t: string, ok: string, fail: string) => cond ? `<span style="color:#4ade80">${t}${ok}</span>` : `<span style="color:#64748b">${t}${fail}</span>`;
  const borderStatus = isWhite ? `<span style="color:#f87171">⚠ 白边!</span>` : `<span style="color:#4ade80">✓</span>`;
  const bwStatus = isSelectedBorderWidth ? `<span style="color:#fbbf24">⚠ 粗边(${bw})</span>` : bw;
  const classes = (node.classes() as string[]).join(' ');
  return [flag(node.selected(), 'S:', '✓', '✗'), flag(node.hasClass('dimmed'), 'D:', '✓', '✗'), flag(node.hasClass('selected-node'), 'N:', '✓', '✗'), flag(node.hasClass('highlighted'), 'H:', '✓', '✗'), flag(node.hasClass('hovered'), 'V:', '✓', '✗'), `opacity:${node.renderedStyle('opacity')}`, `bw:${bwStatus}`, `bc:${bc} ${borderStatus}`, `cls:[${classes}]`].join(' | ');
}

function isDimmedAndSelected(node: cytoscape.NodeSingular): boolean { return node.hasClass('dimmed') && node.selected(); }

// ── Music player ───────────────────────────────────────────────────────────────

(function () {
  const btn = document.getElementById('btn-music');
  const bsBtn = document.getElementById('bs-btn-music');
  const audioEl = document.getElementById('bgm');
  const iconPlay = document.getElementById('music-icon-play');
  const iconPause = document.getElementById('music-icon-pause');
  const bsIconPlay = document.getElementById('bs-music-icon-play');
  const bsIconPause = document.getElementById('bs-music-icon-pause');
  if (!audioEl || !btn) return;
  const audio = audioEl as HTMLAudioElement;
  const TRACKS = ['Echoes of the Eye - Travelers Encore.mp3'];
  let queue: string[] = [], trackIdx = 0, playing = false;
  function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function buildQueue() { queue = shuffle(TRACKS); trackIdx = 0; }
  function setPlaying(v: boolean) {
    playing = v;
    const musicLabel = document.getElementById('music-label');
    if (musicLabel) musicLabel.textContent = v ? '暂停' : '播放';
    const toggle = (b: HTMLElement | null, ip: HTMLElement | null, ipa: HTMLElement | null) => { if (!b || !ip || !ipa) return; b.classList.toggle('active', v); ip.style.display = v ? 'none' : 'block'; ipa.style.display = v ? 'block' : 'none'; };
    toggle(btn, iconPlay, iconPause);
    if (bsBtn) toggle(bsBtn, bsIconPlay, bsIconPause);
  }
  function playNext() { if (!queue.length) return; trackIdx = (trackIdx + 1) % queue.length; if (trackIdx === 0) buildQueue(); audio.src = '/audio/' + queue[trackIdx]; audio.load(); audio.play().catch(() => {}); }
  audio.volume = 0.45;
  audio.addEventListener('ended', playNext);
  buildQueue(); audio.src = '/audio/' + queue[0]; audio.load();
  function toggleMusic() { if (playing) { audio.pause(); setPlaying(false); } else { audio.play().then(() => setPlaying(true)).catch(() => {}); } }
  btn.addEventListener('click', toggleMusic);
  if (bsBtn) bsBtn.addEventListener('click', toggleMusic);
})();

// ── Tour button click (unified JS event binding for mobile) ────────────────────
(function () {
  const tourBtn = document.getElementById('btn-tour');
  const bsTourBtn = document.getElementById('bs-btn-tour');
  if (tourBtn) tourBtn.addEventListener('click', toggleTour);
  if (bsTourBtn) bsTourBtn.addEventListener('click', toggleTour);
})();

// ── Boot ───────────────────────────────────────────────────────────────────────

const graphManager = new GraphManager(MD_FILES as Record<string, string>);
const data = graphManager.build();
const container = document.getElementById('cy');
if (!container) throw new Error('#cy container not found');

try {
  // 1. Renderer first (pure: just renders + layouts)
  renderer = new Renderer({
    container,
    data,
    layoutName: 'cose',
    layoutConfigs: LAYOUTS,
  });

  // 2. Engines (need renderer.getCy() to exist first)
  highlight = new HighlightEngine(renderer.getCy());
  detailPanel = new DetailPanel(renderer.getCy(), highlight, {
    onNodeClick: (nodeId) => {
      const node = renderer.getCy().getElementById(nodeId);
      if (!node.empty()) {
        highlight.highlightNode(nodeId);
        detailPanel.show(nodeId);
        renderer.getCy().animate({ center: { eles: node }, zoom: 1.5, duration: 400, easing: 'ease-out-cubic' });
      }
    },
    onClose: () => {
      highlight.reset();
    },
  });
  search = new Search(renderer.getCy(), highlight);

  // 3. Event subscriptions (after engines exist)
  const cy = renderer.getCy();

  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
    const dbgBtn = document.getElementById('debug-toggle');
    if (dbgBtn) {
      dbgBtn.style.transition = 'none';
      dbgBtn.style.background = '#4338ca';
      dbgBtn.style.color = '#fff';
      requestAnimationFrame(() => {
        dbgBtn.style.transition = 'background 0.5s, color 0.5s';
        dbgBtn.style.background = '';
        dbgBtn.style.color = '';
      });
    }
    const cont = node.cy().container();
    if (cont) {
      const pos = node.renderedPosition();
      const rect = cont.getBoundingClientRect();
      spawnNodeRipple(rect.left + pos.x, rect.top + pos.y, node.data('color') || '#818cf8');
    }
    const prev = highlight.highlightNode(node.id());
    _prevSelectedNodeId = prev.prevNodeId;
    _prevSelectedNodeName = prev.prevNodeName;
    detailPanel.show(node.id());
    updateStats();
    syncBottomSheetStats();
  });

  cy.on('tap', 'edge', (evt) => {
    highlight.highlightEdgeOnly(evt.target.id());
    updateStats();
    syncBottomSheetStats();
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      highlight.reset();
      detailPanel.close();
      if (tourEngine?.isRunning() || tourEngine?.isPaused()) tourStop();
    }
  });

  cy.on('mouseover', 'node', (evt) => {
    const node = evt.target;
    if (node.hasClass('dimmed')) return;
    node.addClass('hovered');
    if (tourPathHistory.length > 1) {
      const nodeId = node.id();
      const idx = tourPathHistory.indexOf(nodeId);
      if (idx >= 0) {
        for (let i = 0; i < tourPathHistory.length - 1; i++) {
          const from = tourPathHistory[i];
          const to = tourPathHistory[i + 1];
          cy.edges().forEach((e: cytoscape.EdgeSingular) => {
            if (e.source().id() === from && e.target().id() === to) e.addClass('tour-path-preview');
          });
        }
      }
    }
  });

  cy.on('mouseout', 'node', (evt) => {
    const node = evt.target;
    if (node.hasClass('dimmed') || node.hasClass('highlighted')) return;
    node.removeClass('hovered');
    cy.edges().removeClass('tour-path-preview');
  });

  cy.on('mouseover', 'edge', (evt) => {
    const reason = renderer.getEdgeReason(evt.target);
    if (!reason) return;
    const mid = renderer.getEdgeMidpoint(evt.target);
    showEdgeTooltip(reason, mid.x, mid.y);
  });

  cy.on('mouseout', 'edge', () => { hideEdgeTooltip(); });

  cy.on('grab', 'node', () => { renderer.setDragMode(true); });
  cy.on('free', 'node', () => { renderer.setDragMode(false); });
  cy.on('dragfree', () => { renderer.setDragMode(false); updateStats(); syncBottomSheetStats(); });
  cy.on('layoutstop', () => { updateStats(); syncBottomSheetStats(); });
  cy.on('select', () => { updateStats(); syncBottomSheetStats(); });
  cy.on('unselect', () => { updateStats(); syncBottomSheetStats(); });

  cy.on('zoom', () => {
    const zoom = cy.zoom();
    if (zoom < 0.05) cy.zoom(0.05);
    if (zoom > 5.0) cy.zoom(5.0);
    showZoomIndicator();
  });

  // 4. UI init
  initEdgeTooltip();
  initShortcuts();
  initDebugOverlay();
  initTourSlider();
  updateStats();
  syncBottomSheetStats();

  const badgeDot = document.getElementById('badge-dot');
  if (badgeDot) badgeDot.classList.remove('topbar__badge-dot--loading');

  brandCarousel.start();

  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-sidebar-toggle');
  if (sidebar && btn) btn.classList.toggle('active', !sidebar.classList.contains('hidden'));

  const bar = document.getElementById('sheet-expand-bar');
  if (bar) bar.addEventListener('click', toggleBottomSheet);
  const sheet = document.getElementById('bottom-sheet');
  if (sheet) sheet.addEventListener('pointerdown', startSheetDrag);
  const tourBar = document.getElementById('tour-status');
  if (tourBar) tourBar.addEventListener('pointerdown', startTourBarDrag);

} catch (err) {
  const n = document.getElementById('stat-nodes');
  const e = document.getElementById('stat-edges');
  if (n) n.textContent = 'error';
  if (e) e.textContent = (err as Error).message;
}

window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (renderer) fitGraph(); syncTourBarPosition(); }, 150);
});

const desktopSearch = document.getElementById('toolbar-search') as HTMLInputElement;
if (desktopSearch) {
  desktopSearch.addEventListener('input', () => {
    const results = search.search(desktopSearch.value);
    if (results.length > 0) { renderer.getCy().animate({ center: { eles: renderer.getCy().getElementById(results[0]) }, zoom: 1.5, duration: 400, easing: 'ease-out-cubic' }); }
    updateStats();
  });
  desktopSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { desktopSearch.value = ''; search.clear(); updateStats(); e.preventDefault(); }
    if (search.getResults().length === 0) return;
    if (e.key === 'ArrowDown') { const id = search.navigateNext(); if (id) detailPanel.show(id); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { const id = search.navigatePrev(); if (id) detailPanel.show(id); e.preventDefault(); }
    else if (e.key === 'Enter') { const results = search.getResults(); const idx = search.getCurrentIndex(); if (results[idx]) { detailPanel.show(results[idx]); highlight.highlightNode(results[idx]); } e.preventDefault(); }
  });
}
const mobileSearch = document.getElementById('bs-search-input') as HTMLInputElement;
if (mobileSearch) {
  mobileSearch.addEventListener('input', () => { search.search(mobileSearch.value); updateStats(); });
  mobileSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { mobileSearch.value = ''; search.clear(); updateStats(); e.preventDefault(); }
    if (search.getResults().length === 0) return;
    if (e.key === 'ArrowDown') { const id = search.navigateNext(); if (id) detailPanel.show(id); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { const id = search.navigatePrev(); if (id) detailPanel.show(id); e.preventDefault(); }
    else if (e.key === 'Enter') { const results = search.getResults(); const idx = search.getCurrentIndex(); if (results[idx]) { detailPanel.show(results[idx]); highlight.highlightNode(results[idx]); } e.preventDefault(); }
  });
}

function toggleSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-sidebar-toggle');
  const strip = document.getElementById('sidebar-strip');
  if (!sidebar) return;
  const hidden = sidebar.classList.toggle('hidden');
  if (btn) btn.classList.toggle('active', !hidden);
  if (strip) { strip.classList.toggle('visible', hidden); strip.style.right = hidden ? '0' : ''; }
  if (renderer) renderer.getCy().resize();
}

// ── Global function exposure ───────────────────────────────────────────────────

(window as any).toggleTour = toggleTour;
(window as any).tourPause = tourPause;
(window as any).tourStop = tourStop;
(window as any).startPanelDrag = startPanelDrag;
(window as any).closeNodePanel = () => detailPanel?.close();
(window as any).startSheetDrag = startSheetDrag;
(window as any).fitGraph = fitGraph;
(window as any).randomize = randomize;
(window as any).resetAll = () => { highlight?.reset(); detailPanel?.close(); if (renderer) renderer.runLayout('cose'); updateStats(); syncBottomSheetStats(); };
(window as any).animatePulse = animatePulse;
(window as any).toggleSidebar = toggleSidebar;
(window as any).closeBottomSheet = closeBottomSheet;
(window as any).toggleBottomSheet = toggleBottomSheet;
(window as any).highlightShape = highlightShape;
(window as any).toggleSection = toggleSection;
(window as any).applyLayoutParams = applyLayoutParams;
(window as any).runLayout = runLayout;
(window as any)._dbg = {
  overlay: () => { debugOverlayActive = !debugOverlayActive; const btn = document.getElementById('debug-toggle'); if (btn) btn.classList.toggle('active', debugOverlayActive); const panel = document.getElementById('debug-panel'); if (panel) panel.style.display = debugOverlayActive ? '' : 'none'; if (debugOverlayActive) { if (!document.getElementById('debug-overlay')) { const ov = document.createElement('div'); ov.id = 'debug-overlay'; renderer?.getCy().container()?.appendChild(ov); } runDebugUpdate(); } else { if (debugRafId !== null) { cancelAnimationFrame(debugRafId); debugRafId = null; } const ov = document.getElementById('debug-overlay'); if (ov) ov.innerHTML = ''; } },
  node: (id: string) => { const cy = renderer?.getCy(); if (!cy) return 'no renderer'; const n = cy.getElementById(id); if (n.empty()) return `节点 "${id}" 不存在`; return { id: n.id(), label: n.data('label'), selected: n.selected(), dimmed: n.hasClass('dimmed'), selectedNode: n.hasClass('selected-node'), highlighted: n.hasClass('highlighted'), hovered: n.hasClass('hovered'), opacity: n.renderedStyle('opacity'), borderWidth: n.renderedStyle('border-width'), borderColor: n.renderedStyle('border-color'), backgroundColor: n.renderedStyle('background-color') }; },
  filter: () => { return renderer?.getCy().container()?.style.filter || '(无)'; },
  selected: () => { const cy = renderer?.getCy(); if (!cy) return []; return cy.$(':selected').nodes().map((n: cytoscape.NodeSingular) => ({ id: n.id(), label: n.data('label'), dimmed: n.hasClass('dimmed') })); },
  carousel: brandCarousel,
};
