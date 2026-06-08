// src/ui/main.ts
// Frontend entry — imported by index.html via Vite HMR

import './styles/main.css';
import { Renderer } from '../core/renderer.js';
import { GraphData } from '../core/graph.js';

// ── Theme ────────────────────────────────────────────────────────────────────

const THEME: Record<string, { color: string; shape: string }> = {
  concept: { color: '#6366f1', shape: 'ellipse' },
  drug:    { color: '#22d3ee', shape: 'round-rectangle' },
  disease: { color: '#f87171', shape: 'diamond' },
  foundation: { color: '#00A5B5', shape: 'round-rectangle' },
  bridge:     { color: '#9C27B0', shape: 'rectangle' },
  clinical:   { color: '#6366F1', shape: 'ellipse' },
  service:    { color: '#7C3AED', shape: 'barrel' },
  default:    { color: '#94a3b8', shape: 'ellipse' },
};

let highlightColor = '#fbbf24';
let currentLayout = 'cose';

// ── Layout configs ──────────────────────────────────────────────────────────

const LAYOUT_CONFIGS: Record<string, Record<string, unknown>> = {
  cose: {
    name: 'cose-bilkent', animate: true, animationDuration: 1200, animationEasing: 'ease-out-cubic',
    randomize: true, nodeRepulsion: 9000, idealEdgeLength: 130, edgeElasticity: 100,
    gravity: 0.1, numIter: 1500, tile: true, tilingPaddingVertical: 15,
    tilingPaddingHorizontal: 15, fit: true, padding: 60, nodeDimensionsIncludeLabels: true,
  },
  concentric: {
    name: 'concentric', concentric: (n: { data: (k: string) => number }) => n.data('weight') || 0,
    levelWidth: () => 1, minNodeSpacing: 50, padding: 50, animate: true,
    animationDuration: 800, animationEasing: 'ease-out-cubic', fit: true, avoidOverlap: true,
  },
  circle: { name: 'circle', radii: 200, divsFactor: 2, padding: 50, animate: true, animationDuration: 700, fit: true, clockwise: true },
  grid: { name: 'grid', condense: false, rows: undefined, cols: undefined, padding: 50, animate: true, animationDuration: 600, fit: true },
  dagre: { name: 'dagre', rankDir: 'TB', rankSep: 100, edgeSep: 50, nodeSep: 50, padding: 60, animate: 'end', animationDuration: 800, fit: true },
  breadthfirst: { name: 'breadthfirst', directed: true, padding: 50, animate: true, animationDuration: 700, fit: true },
  euler: { name: 'euler', animate: true, animationDuration: 600, fit: true, padding: 30, randomize: true, maxIterations: 1000, maxSimulationTime: 4000, refresh: 10 },
};

const LAYOUT_DESCS: Record<string, string> = {
  cose: 'COSE — 力学弹簧布局，模拟物理排斥与吸引，自动产生紧凑聚类结构。',
  concentric: '同心圆 — 节点按权重从中心向外分层排列，适合展示层次重要性。',
  circle: '环形 — 所有节点沿圆周均匀分布，适合展示循环关系。',
  grid: '网格 — 节点按行列整齐排列，适合结构化展示。',
  dagre: 'Dagre — 有向无环图布局，适合 DAG 结构的层次展示。',
  breadthfirst: '广度优先 — 从根节点按层级向外扩散，适合树状结构。',
  euler: 'Euler — 基于图论力学的布局，优化边交叉和长度。',
};

const LAYOUT_PARAMS: Record<string, { key: string; label: string; min?: number; max?: number; step?: number; default: number; type?: string; options?: string[] }[]> = {
  cose: [
    { key: 'nodeRepulsion', label: '节点斥力', min: 1000, max: 20000, step: 100, default: 9000 },
    { key: 'idealEdgeLength', label: '理想边长', min: 20, max: 300, step: 5, default: 130 },
    { key: 'edgeElasticity', label: '边弹性', min: 1, max: 500, step: 1, default: 100 },
    { key: 'gravity', label: '重力', min: 0, max: 1, step: 0.01, default: 0.1 },
    { key: 'tile', label: '平铺', type: 'bool', default: 1 },
    { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 1200 },
  ],
  concentric: [
    { key: 'minNodeSpacing', label: '节点间距', min: 10, max: 200, step: 5, default: 50 },
    { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 800 },
  ],
  circle: [
    { key: 'radii', label: '圆半径', min: 50, max: 600, step: 10, default: 200 },
    { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 700 },
  ],
  grid: [
    { key: 'padding', label: '间距', min: 5, max: 150, step: 5, default: 50 },
    { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 600 },
  ],
  dagre: [
    { key: 'rankDir', label: '方向', type: 'select', options: ['TB', 'BT', 'LR', 'RL'], default: 'TB' as unknown as number },
    { key: 'rankSep', label: '层间距', min: 20, max: 300, step: 5, default: 100 },
    { key: 'nodeSep', label: '节点间距', min: 5, max: 150, step: 5, default: 50 },
    { key: 'edgeSep', label: '边间距', min: 5, max: 100, step: 5, default: 50 },
    { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 800 },
  ],
  breadthfirst: [
    { key: 'padding', label: '间距', min: 5, max: 150, step: 5, default: 50 },
    { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 700 },
  ],
  euler: [
    { key: 'refresh', label: '刷新率', min: 1, max: 50, step: 1, default: 10 },
    { key: 'maxIterations', label: '最大迭代', min: 100, max: 5000, step: 50, default: 1000 },
    { key: 'maxSimulationTime', label: '模拟时长', min: 500, max: 10000, step: 100, default: 4000 },
    { key: 'animationDuration', label: '动画时长', min: 100, max: 3000, step: 50, default: 600 },
  ],
};

// ── State ─────────────────────────────────────────────────────────────────────

let renderer: Renderer;

// ── Utilities ────────────────────────────────────────────────────────────────

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmt(val: number, step: number): string {
  return step < 1 ? val.toFixed(2) : String(val);
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadGraphData(): Promise<GraphData> {
  const res = await fetch('dist/graph-data.json');
  if (!res.ok) throw new Error('无法加载 dist/graph-data.json');
  const data = await res.json();
  const nodes = (data.nodes ?? []).length;
  const edges = (data.edges ?? []).length;
  const badge = document.getElementById('badge');
  if (badge) badge.textContent = `${nodes} nodes / ${edges} edges`;
  return { nodes: data.nodes ?? [], edges: data.edges ?? [] };
}

// ── Stats ────────────────────────────────────────────────────────────────────

function updateStats(): void {
  const cy = renderer.getCy();
  const sel = document.getElementById('stat-nodes');
  const edge = document.getElementById('stat-edges');
  const ssel = document.getElementById('stat-selected');
  const lay = document.getElementById('stat-layout');
  if (sel) sel.textContent = String(cy.nodes().not('.layer-parent').length);
  if (edge) edge.textContent = String(cy.edges().length);
  if (ssel) ssel.textContent = String(cy.$(':selected').length);
  if (lay) lay.textContent = currentLayout.toUpperCase();
}

// ── Node detail panel ─────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  foundation: '基础层', bridge: '靶点层', clinical: '临床层', service: '服务层',
  concept: '概念', drug: '药物', disease: '疾病',
};

function showNodeDetail(node: cytoscape.NodeSingular): void {
  const d = node.data();
  const typeLabel = TYPE_LABELS[d.type] || d.type || '—';

  const name = document.getElementById('detail-name');
  const type = document.getElementById('detail-type');
  const cat = document.getElementById('detail-cat');
  const degree = document.getElementById('detail-degree');
  const loc = document.getElementById('detail-loc');
  const sum = document.getElementById('detail-sum');
  const adjLabel = document.getElementById('detail-adj-label');
  const adjEl = document.getElementById('detail-adj');
  const panel = document.getElementById('detail-panel');

  if (name) name.textContent = d.label || d.id;
  if (type) type.textContent = typeLabel;
  if (cat) cat.textContent = d.category || '—';
  if (degree) degree.textContent = String(node.degree());
  if (loc) loc.textContent = d.location || '—';
  if (sum) sum.textContent = d.summary || '—';

  const adj = node.neighborhood('node').not('.layer-parent');
  if (adjLabel) adjLabel.style.display = adj.length > 0 ? 'block' : 'none';
  if (adjEl) {
    adjEl.innerHTML = adj.map((n: cytoscape.NodeSingular) =>
      `<span class="tag">${n.data('label') || n.id()}</span>`
    ).join('');
  }

  if (panel) panel.classList.add('visible');

  // On mobile, show overlay instead
  if (window.innerWidth <= 480) {
    showMobileOverlay(d);
  }
}

function showMobileOverlay(d: Record<string, unknown>): void {
  const existing = document.getElementById('node-overlay');
  if (existing) existing.remove();

  const typeLabel = TYPE_LABELS[String(d.type)] || String(d.type) || '—';
  const overlay = document.createElement('div');
  overlay.id = 'node-overlay';
  overlay.className = 'node-overlay';
  overlay.innerHTML = `
    <div class="node-overlay-card" style="position:relative">
      <button class="node-overlay-close" id="overlay-close-btn" aria-label="关闭">×</button>
      <h3 class="text-[0.9rem] font-semibold mb-2" style="color:var(--text)">${String(d.label || d.id)}</h3>
      <div class="text-[0.73rem] mb-1" style="color:var(--muted)">类型: <span style="color:var(--text)">${typeLabel}</span></div>
      <div class="text-[0.73rem] mb-1" style="color:var(--muted)">分类: <span style="color:var(--text)">${String(d.category || '—')}</span></div>
      ${d.summary ? `<div class="text-[0.73rem] mt-2" style="color:var(--muted)">${String(d.summary)}</div>` : ''}
      ${d.location ? `<div class="text-[0.68rem] mt-2" style="color:var(--muted);word-break:break-all">📄 ${String(d.location)}</div>` : ''}
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target as HTMLElement).id === 'overlay-close-btn') {
      overlay.remove();
    }
  });
}

// ── Highlight ────────────────────────────────────────────────────────────────

function highlightNode(node: cytoscape.NodeSingular): void {
  const cy = renderer.getCy();
  cy.elements().addClass('dimmed');
  node.removeClass('dimmed').addClass('highlighted');
  node.connectedEdges().removeClass('dimmed').addClass('highlighted-edge');
  node.neighborhood('node').not('.layer-parent').removeClass('dimmed').addClass('highlighted');
}

function resetAll(): void {
  if (!renderer) return;
  const cy = renderer.getCy();
  cy.elements().removeClass('dimmed highlighted highlighted-edge');
  cy.nodes().not('.layer-parent').forEach((node: cytoscape.NodeSingular) => {
    const t = THEME[node.data('type')] || THEME.default;
    node.style('shape', t.shape as cytoscape.Css.NodeShape);
    node.unlock();
  });
  const panel = document.getElementById('detail-panel');
  if (panel) panel.classList.remove('visible');
  const overlay = document.getElementById('node-overlay');
  if (overlay) overlay.remove();
  runLayout('cose');
  updateStats();
}

// ── Layout ──────────────────────────────────────────────────────────────────

function runLayout(name: string): void {
  if (!renderer) return;
  currentLayout = name;
  document.querySelectorAll('.btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + name);
  if (btn) btn.classList.add('active');
  const desc = document.getElementById('layout-desc');
  if (desc) desc.textContent = LAYOUT_DESCS[name] || '';

  const cfg: Record<string, unknown> = { ...(LAYOUT_CONFIGS[name] ?? {}) };
  renderLayoutParams(name, cfg);
  renderer.runLayout(name);
}

function renderLayoutParams(name: string, cfg: Record<string, unknown>): void {
  const container = document.getElementById('layout-params');
  const applyBtn = document.getElementById('apply-params-btn');
  const params = LAYOUT_PARAMS[name];

  if (!container) return;

  if (!params || params.length === 0) {
    container.innerHTML = '<div class="no-params">此布局无可调参数</div>';
    if (applyBtn) applyBtn.style.display = 'none';
    return;
  }

  container.innerHTML = params.map((p) => {
    if (p.type === 'select') {
      const opts = (p.options ?? []).map((o) =>
        `<option value="${o}" ${(cfg[p.key] ?? p.default) === o ? 'selected' : ''}>${o}</option>`
      ).join('');
      return `<div class="param-row">
        <div class="param-label">${p.label}</div>
        <select class="param-select" data-key="${p.key}">${opts}</select>
      </div>`;
    }
    if (p.type === 'bool') {
      const checked = (cfg[p.key] ?? p.default) ? 'checked' : '';
      return `<div class="param-row">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.7rem;color:var(--muted)">
          <input type="checkbox" data-key="${p.key}" ${checked} style="accent-color:var(--accent);cursor:pointer">
          ${p.label}
        </label>
      </div>`;
    }
    const val = cfg[p.key] ?? p.default;
    return `<div class="param-row">
      <div class="param-label">${p.label}<span>${fmt(Number(val), p.step ?? 1)}</span></div>
      <input type="range" class="param-slider" data-key="${p.key}"
        min="${p.min}" max="${p.max}" step="${p.step}" value="${val}">
    </div>`;
  }).join('');

  // Live-update slider value display
  container.querySelectorAll<HTMLInputElement>('.param-slider').forEach((slider) => {
    slider.addEventListener('input', () => {
      const span = slider.previousElementSibling?.querySelector('span');
      if (span) {
        const p = params.find((x) => x.key === slider.dataset.key);
        span.textContent = fmt(parseFloat(slider.value), p?.step ?? 1);
      }
    });
  });

  if (applyBtn) applyBtn.style.display = '';
}

function applyLayoutParams(): void {
  if (!renderer) return;
  const container = document.getElementById('layout-params');
  if (!container) return;

  const overrides: Record<string, unknown> = {};

  container.querySelectorAll<HTMLInputElement>('.param-slider').forEach((slider) => {
    overrides[slider.dataset.key ?? ''] = parseFloat(slider.value);
  });
  container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((sel) => {
    overrides[sel.dataset.key ?? ''] = sel.value;
  });
  container.querySelectorAll<HTMLInputElement>('.param-row input[type="checkbox"]').forEach((cb) => {
    overrides[cb.dataset.key ?? ''] = cb.checked;
  });

  const base: Record<string, unknown> = { ...(LAYOUT_CONFIGS[currentLayout] ?? {}) };
  Object.assign(base, overrides);
  base.name = currentLayout;

  document.querySelectorAll('.btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + currentLayout);
  if (btn) btn.classList.add('active');

  renderer.getCy().layout(base as cytoscape.LayoutOptions).run();
}

function fitGraph(): void {
  if (!renderer) return;
  renderer.fit();
}

function randomize(): void {
  if (!renderer) return;
  const cy = renderer.getCy();
  cy.elements().removeClass('dimmed highlighted highlighted-edge');
  cy.nodes().not('.layer-parent').forEach((node: cytoscape.NodeSingular) => {
    const t = THEME[node.data('type')] || THEME.default;
    node.style('shape', t.shape as cytoscape.Css.NodeShape);
    node.unlock();
  });
  const panel = document.getElementById('detail-panel');
  if (panel) panel.classList.remove('visible');
  cy.nodes().not('.layer-parent').positions(() => ({
    x: Math.random() * cy.width(),
    y: Math.random() * cy.height(),
  }));
  updateStats();
}

// ── Animation ───────────────────────────────────────────────────────────────

function animatePulse(): void {
  if (!renderer) return;
  const cy = renderer.getCy();
  const sel = cy.$(':selected').length > 0 ? cy.$(':selected') : cy.nodes().not('.layer-parent');
  if (sel.length === 0) return;

  let scale = 1;
  let dir = 1;
  let raf: number;

  function step(): void {
    scale += 0.03 * dir;
    if (scale >= 1.25) dir = -1;
    if (scale <= 0.95) {
      scale = 1;
      sel.removeClass('pulse');
      sel.style('width', (n: cytoscape.NodeSingular) => n.data('weight') || 70);
      sel.style('height', (n: cytoscape.NodeSingular) => n.data('weight') || 70);
      cancelAnimationFrame(raf);
      updateStats();
      return;
    }
    sel.addClass('pulse');
    sel.style('width', (n: cytoscape.NodeSingular) => (n.data('weight') || 70) * scale);
    sel.style('height', (n: cytoscape.NodeSingular) => (n.data('weight') || 70) * scale);
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);
}

// ── Shape highlight ─────────────────────────────────────────────────────────

function highlightShape(shape: string): void {
  resetAll();
  if (!renderer) return;
  const cy = renderer.getCy();
  cy.nodes().not('.layer-parent').forEach((n: cytoscape.NodeSingular) => {
    if (n.style('shape') === shape) {
      n.addClass('highlighted');
    } else {
      n.addClass('dimmed');
    }
  });
}

// ── Color swatch ────────────────────────────────────────────────────────────

function setHighlightColor(color: string): void {
  if (!renderer) return;
  highlightColor = color;
  renderer.getCy().style()
    .selector('.highlighted')
    .style('border-color', color)
    .selector('.highlighted-edge')
    .style({ 'line-color': color, 'target-arrow-color': color })
    .selector('.pulse')
    .style('border-color', color)
    .update();
}

// ── Events ──────────────────────────────────────────────────────────────────

function initEvents(): void {
  const cy = renderer.getCy();

  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
    highlightNode(node);
    showNodeDetail(node);
    updateStats();
  });

  cy.on('tap', 'edge', (evt) => {
    const edge = evt.target;
    cy.elements().addClass('dimmed');
    edge.removeClass('dimmed').addClass('highlighted-edge');
    edge.source().removeClass('dimmed').addClass('highlighted');
    edge.target().removeClass('dimmed').addClass('highlighted');
    updateStats();
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) resetAll();
  });

  cy.on('cxtap', 'node', (evt) => {
    evt.target.remove();
    resetAll();
    updateStats();
  });

  cy.on('dbltap', 'node', (evt) => {
    const node = evt.target;
    node.lock();
    (node as any).flash('#ffffff', 150, 3);
  });

  cy.on('mouseover', 'node', (evt) => {
    const node = evt.target;
    if (!node.hasClass('dimmed')) node.style('border-color', '#ffffff');
  });

  cy.on('mouseout', 'node', (evt) => {
    const node = evt.target;
    if (!node.hasClass('dimmed') && !node.hasClass('highlighted')) {
      const t = THEME[node.data('type')];
      node.style('border-color', t ? hexAlpha(t.color, 0.67) : 'rgba(255,255,255,0.12)');
    }
  });

  cy.on('dragfree', 'node', () => updateStats());
  cy.on('layoutstop', () => updateStats());
  cy.on('select', () => updateStats());
  cy.on('unselect', () => updateStats());
}

function initShortcuts(): void {
  const cy = renderer.getCy();
  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        cy.$(':selected').remove();
        resetAll();
        updateStats();
        break;
      case 'Escape':
        cy.elements().unselect();
        resetAll();
        break;
      case 'f':
      case 'F':
        fitGraph();
        break;
      case 'r':
      case 'R':
        randomize();
        break;
      case 'a':
      case 'A':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          cy.nodes().not('.layer-parent').select();
        }
        break;
    }
  });
}

// ── Boot ────────────────────────────────────────────────────────────────────

loadGraphData()
  .then((data) => {
    const container = document.getElementById('cy');
    if (!container) throw new Error('#cy container not found');

    renderer = new Renderer({ container, data, layoutName: 'cose' });
    initEvents();
    initShortcuts();
    updateStats();
  })
  .catch((err) => {
    const sel = document.getElementById('stat-nodes');
    const edge = document.getElementById('stat-edges');
    if (sel) sel.textContent = 'error';
    if (edge) edge.textContent = err.message;
  });

window.addEventListener('resize', () => {
  if (renderer) fitGraph();
});

// Expose onclick handlers for HTML inline onclick attributes
(window as any).runLayout = runLayout;
(window as any).fitGraph = fitGraph;
(window as any).randomize = randomize;
(window as any).animatePulse = animatePulse;
(window as any).resetAll = resetAll;
(window as any).highlightShape = highlightShape;
(window as any).setHighlightColor = setHighlightColor;
(window as any).applyLayoutParams = applyLayoutParams;
