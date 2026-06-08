// src/ui/main.ts
// Frontend entry — imported by index.html via Vite HMR

import './styles/main.css';
import { Renderer } from '../core/renderer.js';
import { GraphData } from '../core/graph.js';

// ── Theme ────────────────────────────────────────────────────────────────────

const THEME: Record<string, { color: string; shape: string }> = {
  concept:   { color: '#818cf8', shape: 'ellipse' },
  drug:      { color: '#67e8f9', shape: 'round-rectangle' },
  disease:   { color: '#fca5a5', shape: 'diamond' },
  ingredient:{ color: '#c4b5fd', shape: 'barrel' },
  foundation:{ color: '#00A5B5', shape: 'round-rectangle' },
  bridge:    { color: '#9C27B0', shape: 'rectangle' },
  clinical:  { color: '#818cf8', shape: 'ellipse' },
  service:   { color: '#c4b5fd', shape: 'barrel' },
  default:   { color: '#94a3b8', shape: 'ellipse' },
};

const TYPE_LABELS: Record<string, string> = {
  foundation: '基础层', bridge: '靶点层', clinical: '临床层', service: '服务层',
  concept: '概念', drug: '药物', disease: '疾病', ingredient: '成分',
};

const SHAPE_LABELS: Record<string, string> = {
  ellipse: '椭圆', 'round-rectangle': '圆角矩形', rectangle: '矩形',
  diamond: '菱形', barrel: '六边形',
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
  circle: { name: 'circle', radius: 200, padding: 50, animate: true, animationDuration: 700, fit: true, clockwise: true },
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
    { key: 'radius', label: '圆半径', min: 50, max: 600, step: 10, default: 200 },
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

function nodeColor(type: string): string {
  return THEME[type]?.color ?? THEME.default.color;
}

// ── Section collapse/expand ─────────────────────────────────────────────────

function toggleSection(name: string): void {
  const body = document.getElementById('body-' + name);
  const head = document.querySelector(`[data-section="${name}"] .sidebar-section__chevron`);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (head) head.classList.toggle('open', !open);
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadGraphData(): Promise<GraphData> {
  const res = await fetch('/graph-data.json');
  if (!res.ok) throw new Error('无法加载 dist/graph-data.json');
  const data = await res.json();
  const nodes = (data.nodes ?? []).length;
  const edges = (data.edges ?? []).length;

  const badgeText = document.getElementById('badge-text');
  const badgeDot = document.getElementById('badge-dot');
  if (badgeText) badgeText.innerHTML = '<span class="badge-by">by</span> <span class="badge-meow">meow</span>';
  if (badgeDot) badgeDot.classList.remove('topbar__badge-dot--loading');

  return { nodes: data.nodes ?? [], edges: data.edges ?? [] };
}

// ── Stats ────────────────────────────────────────────────────────────────────

function updateStats(): void {
  const cy = renderer.getCy();
  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('stat-nodes', String(cy.nodes().not('.layer-parent').length));
  set('stat-edges', String(cy.edges().length));
  set('stat-selected', String(cy.$(':selected').length));
  set('stat-layout', currentLayout.toUpperCase());
}

// ── Node detail panel ─────────────────────────────────────────────────────────

let panelLastLeft = 16;
let panelLastTop = 72;

function showNodeDetail(node: cytoscape.NodeSingular): void {
  const d = node.data();
  const typeLabel = TYPE_LABELS[d.type] || d.type || '—';
  const color = nodeColor(d.type);

  const panel = document.getElementById('node-panel');
  if (!panel) return;

  const badge = document.getElementById('lp-type-badge');
  const name = document.getElementById('lp-node-name');
  const fields = document.getElementById('lp-fields');
  const adjLabel = document.getElementById('lp-adj-label');
  const adjEl = document.getElementById('lp-adj');

  if (badge) {
    badge.textContent = typeLabel;
    badge.style.color = color;
    badge.style.borderColor = color + '66';
    badge.style.background = color + '1a';
  }
  if (name) name.textContent = d.label || d.id;

  if (fields) {
    fields.innerHTML = `
      <div class="lp-field"><span class="lp-field-key">分类</span><span class="lp-field-val">${d.category || '—'}</span></div>
      <div class="lp-field"><span class="lp-field-key">度数</span><span class="lp-field-val">${node.degree()}</span></div>
      <div class="lp-field"><span class="lp-field-key">路径</span><span class="lp-field-val lp-field-val--mono">${d.location || '—'}</span></div>
      ${d.summary ? `<div class="lp-field"><span class="lp-field-key">摘要</span><span class="lp-field-val">${d.summary}</span></div>` : ''}
    `;
  }

  const adj = node.neighborhood('node').not('.layer-parent');
  if (adjLabel) adjLabel.style.display = adj.length > 0 ? 'flex' : 'none';
  if (adjEl) {
    adjEl.innerHTML = adj.map((n: cytoscape.NodeSingular) =>
      `<span class="tag">${n.data('label') || n.id()}</span>`
    ).join('');
  }

  panel.classList.add('visible');

  const rect = panel.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const TOPBAR_H = 56;
  const PAD = 12;

  const nodePos = node.renderedPosition();
  let left = nodePos.x + 28;
  let top  = nodePos.y - H / 2;

  if (left + W + PAD > vpW)      left = nodePos.x - W - 16;
  if (left < PAD)                left = PAD;
  if (top + H + PAD > vpH)      top  = vpH - H - PAD;
  if (top  < TOPBAR_H + PAD)     top  = TOPBAR_H + PAD;

  panel.style.left = left + 'px';
  panel.style.top  = top  + 'px';
  panelLastLeft = left;
  panelLastTop  = top;
}

function closeNodePanel(): void {
  const panel = document.getElementById('node-panel');
  if (panel) panel.classList.remove('visible');
  if (renderer) {
    renderer.getCy().elements().removeClass('dimmed highlighted highlighted-edge');
  }
}

function showMobileOverlay(d: Record<string, unknown>, typeLabel: string, color: string): void {
  const existing = document.getElementById('node-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'node-overlay';
  overlay.className = 'node-overlay';
  overlay.innerHTML = `
    <div class="node-overlay-card">
      <button class="node-overlay-close" id="overlay-close-btn" aria-label="关闭">×</button>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;padding:3px 8px;border-radius:6px;border:1px solid;color:${color};background:${color}1a">${typeLabel}</span>
        <span style="font-size:1rem;font-weight:700;color:var(--text);letter-spacing:-0.01em">${String(d.label || d.id)}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="font-size:0.72rem;color:var(--muted)">分类 <span style="color:var(--text-2);font-weight:500;margin-left:8px">${String(d.category || '—')}</span></div>
        <div style="font-size:0.72rem;color:var(--muted)">度数 <span style="color:var(--text-2);font-weight:500;margin-left:8px">${String(d.degree || '—')}</span></div>
        ${d.summary ? `<div style="font-size:0.73rem;color:var(--text-2);margin-top:4px;line-height:1.55">${String(d.summary)}</div>` : ''}
        ${d.location ? `<div style="font-size:0.66rem;color:var(--muted);margin-top:6px;word-break:break-all;font-family:monospace">📄 ${String(d.location)}</div>` : ''}
      </div>
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
  const nodePanel = document.getElementById('node-panel');
  if (nodePanel) nodePanel.classList.remove('visible');
  const overlay = document.getElementById('node-overlay');
  if (overlay) overlay.remove();
  runLayout('cose');
  updateStats();
  syncBottomSheetStats();
}

// ── Layout ──────────────────────────────────────────────────────────────────

function runLayout(name: string): void {
  if (!renderer) return;
  currentLayout = name;
  document.querySelectorAll('.btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + name);
  if (btn) btn.classList.add('active');

  // Sync bottom sheet layout buttons
  document.querySelectorAll('.bs-layout-btn').forEach((b) => b.classList.remove('active'));
  const bsBtn = document.getElementById('bs-btn-' + name);
  if (bsBtn) bsBtn.classList.add('active');

  const desc = document.getElementById('layout-desc');
  if (desc) desc.textContent = LAYOUT_DESCS[name] || '';
  const cfg = { ...(LAYOUT_CONFIGS[name] ?? {}) };
  renderLayoutParams(name, cfg);
  renderer.runLayout(name);
}

function renderLayoutParams(name: string, cfg: Record<string, unknown>): void {
  // layout-params is now inside #body-params
  const container = document.getElementById('layout-params');
  const applyBtn = document.getElementById('apply-params-btn');
  const params = LAYOUT_PARAMS[name];
  if (!container) return;

  if (!params || params.length === 0) {
    container.innerHTML = '<div class="no-params">此布局无可调参数</div>';
    if (applyBtn) applyBtn.style.display = 'none';
    return;
  }

  const valToPercent = (key: string, p: typeof params[0]) => {
    const v = cfg[key] ?? p.default;
    const min = p.min ?? 0, max = p.max ?? 100;
    return ((Number(v) - min) / (max - min)) * 100 + '%';
  };

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
    const fill = valToPercent(p.key, p);
    return `<div class="param-row">
      <div class="param-label">${p.label}<span class="param-label__val">${fmt(Number(val), p.step ?? 1)}</span></div>
      <input type="range" class="param-slider" data-key="${p.key}"
        min="${p.min}" max="${p.max}" step="${p.step}" value="${val}"
        style="background:linear-gradient(to right, var(--accent) ${fill}, var(--border) ${fill})">
    </div>`;
  }).join('');

  container.querySelectorAll<HTMLInputElement>('.param-slider').forEach((slider) => {
    slider.addEventListener('input', () => {
      const key = slider.dataset.key ?? '';
      const p = params.find((x) => x.key === key);
      if (!p) return;
      const span = slider.parentElement?.querySelector('.param-label__val');
      if (span) span.textContent = fmt(parseFloat(slider.value), p.step ?? 1);
      const min = p.min ?? 0, max = p.max ?? 100;
      const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
      slider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
    });
  });

  if (applyBtn) applyBtn.style.display = '';
}

function applyLayoutParams(): void {
  if (!renderer) return;
  const container = document.getElementById('layout-params');
  if (!container) return;

  const overrides: Record<string, unknown> = {};
  container.querySelectorAll<HTMLInputElement>('.param-slider').forEach((s) => { overrides[s.dataset.key ?? ''] = parseFloat(s.value); });
  container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((s) => { overrides[s.dataset.key ?? ''] = s.value; });
  container.querySelectorAll<HTMLInputElement>('.param-row input[type="checkbox"]').forEach((cb) => { overrides[cb.dataset.key ?? ''] = cb.checked; });

  const base = { ...(LAYOUT_CONFIGS[currentLayout] ?? {}) };
  Object.assign(base, overrides);
  base.name = currentLayout;

  document.querySelectorAll('.btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + currentLayout);
  if (btn) btn.classList.add('active');

  renderer.getCy().layout(base as unknown as cytoscape.LayoutOptions).run();
}

function fitGraph(): void { if (renderer) renderer.fit(); }

function randomize(): void {
  if (!renderer) return;
  const cy = renderer.getCy();
  cy.elements().removeClass('dimmed highlighted highlighted-edge');
  cy.nodes().not('.layer-parent').forEach((node: cytoscape.NodeSingular) => {
    const t = THEME[node.data('type')] || THEME.default;
    node.style('shape', t.shape as cytoscape.Css.NodeShape);
    node.unlock();
  });
  const nodePanel = document.getElementById('node-panel');
  if (nodePanel) nodePanel.classList.remove('visible');
  cy.nodes().not('.layer-parent').positions(() => ({ x: Math.random() * cy.width(), y: Math.random() * cy.height() }));
  updateStats();
  syncBottomSheetStats();
}

// ── Animation ───────────────────────────────────────────────────────────────

function animatePulse(): void {
  if (!renderer) return;
  const cy = renderer.getCy();
  const sel = cy.$(':selected').length > 0 ? cy.$(':selected') : cy.nodes().not('.layer-parent');
  if (sel.length === 0) return;

  let scale = 1, dir = 1;
  let raf: number;

  function step(): void {
    scale += 0.03 * dir;
    if (scale >= 1.25) dir = -1;
    if (scale <= 0.95) {
      scale = 1;
      sel.removeClass('pulse');
      sel.style('width',  (n: cytoscape.NodeSingular) => n.data('weight') || 70);
      sel.style('height', (n: cytoscape.NodeSingular) => n.data('weight') || 70);
      cancelAnimationFrame(raf);
      updateStats();
      return;
    }
    sel.addClass('pulse');
    sel.style('width',  (n: cytoscape.NodeSingular) => (n.data('weight') || 70) * scale);
    sel.style('height', (n: cytoscape.NodeSingular) => (n.data('weight') || 70) * scale);
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);
}

// ── Shape / type highlight ──────────────────────────────────────────────────

let activeShapeFilter: string | null = null;

function highlightShape(shape: string): void {
  resetAll();
  if (!renderer) return;
  const cy = renderer.getCy();

  // Toggle off if same
  if (activeShapeFilter === shape) {
    activeShapeFilter = null;
    document.querySelectorAll('.node-type-item, .shape-filter-item').forEach((el) => el.classList.remove('active'));
    return;
  }
  activeShapeFilter = shape;

  // Update node type card active states
  document.querySelectorAll('.node-type-item').forEach((el) => {
    el.classList.remove('active');
    const dot = el.querySelector('.node-type-item__dot');
    if (dot) {
      const style = dot as HTMLElement;
      const shapeOfDot = style.style.borderRadius === '50%' ? 'ellipse'
        : style.style.transform.includes('rotate(45deg)') ? 'diamond'
        : shape;
      if (style.style.borderRadius !== '50%' && !style.style.transform.includes('rotate(45deg)')) {
        // Could be round-rectangle or barrel, check bg color
      }
    }
  });

  document.querySelectorAll('.node-type-item, .shape-filter-item').forEach((el) => {
    el.classList.toggle('active', false);
  });

  // Mark matching type items and shape filter items
  cy.nodes().not('.layer-parent').forEach((n: cytoscape.NodeSingular) => {
    if (n.style('shape') === shape) n.addClass('highlighted');
    else n.addClass('dimmed');
  });

  // Mark sidebar items that match
  document.querySelectorAll('.shape-filter-item').forEach((el) => {
    const label = el.querySelector('.shape-filter-item__label')?.textContent ?? '';
    const shapeName = Object.entries(SHAPE_LABELS).find(([, v]) => v === label)?.[0] ?? label;
    if (shapeName === shape || label.toLowerCase().includes(shape)) {
      el.classList.add('active');
    }
  });

  document.querySelectorAll('.node-type-item').forEach((el) => {
    const label = el.querySelector('.node-type-item__label')?.textContent ?? '';
    const dot = el.querySelector('.node-type-item__dot') as HTMLElement;
    if (!dot) return;
    const bg = dot.style.background;
    const matchesShape = (
      (shape === 'ellipse' && dot.style.borderRadius === '50%') ||
      (shape === 'round-rectangle' && bg.includes('67e8f9')) ||
      (shape === 'diamond' && dot.style.transform.includes('rotate(45deg)')) ||
      (shape === 'barrel' && bg.includes('c4b5fd')) ||
      (shape === 'rectangle' && bg.includes('f59e0b'))
    );
    if (matchesShape) el.classList.add('active');
  });
}

// ── Color swatch ────────────────────────────────────────────────────────────

function setHighlightColor(color: string): void {
  if (!renderer) return;
  highlightColor = color;
  renderer.getCy().style()
    .selector('.highlighted')       .style('border-color', color).style('border-width', 3)
    .selector('.highlighted-edge')  .style({ 'line-color': color, 'target-arrow-color': color })
    .selector('.pulse')             .style('border-color', color)
    .update();
}

// ── Events ──────────────────────────────────────────────────────────────────

function initEvents(): void {
  const cy = renderer.getCy();

  cy.on('tap', 'node', (evt) => {
    highlightNode(evt.target);
    showNodeDetail(evt.target);
    if (window.innerWidth <= 1024) {
      showBottomSheetDetail(evt.target);
    }
    updateStats();
    syncBottomSheetStats();
  });

  cy.on('tap', 'edge', (evt) => {
    const edge = evt.target;
    cy.elements().addClass('dimmed');
    edge.removeClass('dimmed').addClass('highlighted-edge');
    edge.source().removeClass('dimmed').addClass('highlighted');
    edge.target().removeClass('dimmed').addClass('highlighted');
    updateStats();
    syncBottomSheetStats();
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      resetAll();
      const nodePanel = document.getElementById('node-panel');
      if (nodePanel) nodePanel.classList.remove('visible');
      const bsDetail = document.getElementById('bs-detail');
      if (bsDetail) bsDetail.style.display = 'none';
    }
  });

  cy.on('cxtap', 'node', (evt) => { evt.target.remove(); resetAll(); updateStats(); syncBottomSheetStats(); });

  cy.on('dbltap', 'node', (evt) => {
    evt.target.lock();
    (evt.target as any).flash('#ffffff', 150, 3);
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

  cy.on('dragfree', () => { updateStats(); syncBottomSheetStats(); });
  cy.on('layoutstop', () => { updateStats(); syncBottomSheetStats(); });
  cy.on('select', () => { updateStats(); syncBottomSheetStats(); });
  cy.on('unselect', () => { updateStats(); syncBottomSheetStats(); });
}

function initShortcuts(): void {
  const cy = renderer.getCy();
  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        cy.$(':selected').remove(); resetAll(); updateStats();
        break;
      case 'Escape':
        cy.elements().unselect(); resetAll();
        break;
      case 'f': case 'F': fitGraph(); break;
      case 'r': case 'R': randomize(); break;
      case 'a': case 'A':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); cy.nodes().not('.layer-parent').select(); }
        break;
    }
  });
}

// ── Boot ────────────────────────────────────────────────────────────────────

let sheetOpen = false;

function toggleBottomSheet(): void {
  const sheet = document.getElementById('bottom-sheet');
  const fab = document.getElementById('fab');
  const fabIcon = document.getElementById('fab-icon');
  if (!sheet || !fab) return;
  sheetOpen = !sheetOpen;
  sheet.classList.toggle('open', sheetOpen);
  fab.classList.toggle('active', sheetOpen);
}

function closeBottomSheet(): void {
  const sheet = document.getElementById('bottom-sheet');
  const fab = document.getElementById('fab');
  if (!sheet || !fab) return;
  sheetOpen = false;
  sheet.classList.remove('open');
  fab.classList.remove('active');
}

// ── Drag to close bottom sheet ─────────────────────────────────────────────
function startSheetDrag(e: PointerEvent): void {
  const sheet = document.getElementById('bottom-sheet');
  const handle = document.getElementById('sheet-handle');
  if (!sheet || !handle) return;

  const startY = e.clientY;
  const startTransform = sheet.style.transform;
  let dragged = false;

  const onMove = (me: PointerEvent) => {
    const delta = me.clientY - startY;
    if (Math.abs(delta) > 5) dragged = true;
    if (delta > 0) {
      sheet.style.transform = `translateY(${delta}px)`;
      sheet.style.transition = 'none';
    }
  };

  const onUp = (ue: PointerEvent) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    const delta = ue.clientY - startY;
    sheet.style.transform = '';
    sheet.style.transition = '';
    if (delta > 80 || dragged && delta > 30) {
      closeBottomSheet();
    }
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

// ── Bottom sheet: show node detail ─────────────────────────────────────────
function showBottomSheetDetail(node: cytoscape.NodeSingular): void {
  const d = node.data();
  const typeLabel = TYPE_LABELS[d.type] || d.type || '—';
  const color = nodeColor(d.type);

  const badge = document.getElementById('bs-type-badge');
  const name = document.getElementById('bs-node-name');
  const info = document.getElementById('bs-node-info');
  const container = document.getElementById('bs-detail');

  if (badge) {
    badge.textContent = typeLabel;
    badge.style.color = color;
    badge.style.borderColor = color + '66';
    badge.style.background = color + '1a';
  }
  if (name) name.textContent = d.label || d.id;

  const adj = node.neighborhood('node').not('.layer-parent');
  const adjHtml = adj.length > 0
    ? adj.map((n: cytoscape.NodeSingular) =>
        `<span class="tag">${n.data('label') || n.id()}</span>`
      ).join('')
    : '';

  if (info) {
    info.innerHTML = `
      <div class="bs-node-info-row"><span class="bs-node-info-row__key">分类</span><span class="bs-node-info-row__val">${d.category || '—'}</span></div>
      <div class="bs-node-info-row"><span class="bs-node-info-row__key">度数</span><span class="bs-node-info-row__val">${node.degree()}</span></div>
      ${d.summary ? `<div class="bs-node-info-row" style="flex-direction:column;gap:2px"><span class="bs-node-info-row__key" style="margin-bottom:2px">摘要</span><span class="bs-node-info-row__val">${d.summary}</span></div>` : ''}
      ${adjHtml ? `<div class="bs-tag-list">${adjHtml}</div>` : ''}
    `;
  }

  if (container) {
    container.style.display = '';
    // Auto-open bottom sheet when node selected on mobile
    if (!sheetOpen) toggleBottomSheet();
  }
}

// ── Bottom sheet: sync stats ────────────────────────────────────────────────
function syncBottomSheetStats(): void {
  const cy = renderer.getCy();
  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('bs-stat-nodes', String(cy.nodes().not('.layer-parent').length));
  set('bs-stat-edges', String(cy.edges().length));
  set('bs-stat-selected', String(cy.$(':selected').length));
  set('bs-stat-layout', currentLayout.toUpperCase());
}

loadGraphData()
  .then((data) => {
    const container = document.getElementById('cy');
    if (!container) throw new Error('#cy container not found');
    renderer = new Renderer({ container, data, layoutName: 'cose' });
    initEvents();
    initShortcuts();
    updateStats();
    syncBottomSheetStats();
  })
  .catch((err) => {
    const n = document.getElementById('stat-nodes');
    const e = document.getElementById('stat-edges');
    if (n) n.textContent = 'error';
    if (e) e.textContent = err.message;
  });

window.addEventListener('resize', () => { if (renderer) fitGraph(); });

// Expose inline onclick handlers
(window as any).runLayout = runLayout;
(window as any).fitGraph = fitGraph;
(window as any).randomize = randomize;
(window as any).animatePulse = animatePulse;
(window as any).resetAll = resetAll;
(window as any).highlightShape = highlightShape;
(window as any).setHighlightColor = setHighlightColor;
(window as any).applyLayoutParams = applyLayoutParams;
(window as any).toggleSection = toggleSection;
(window as any).toggleBottomSheet = toggleBottomSheet;
(window as any).startSheetDrag = startSheetDrag;
(window as any).startPanelDrag = startPanelDrag;
(window as any).closeNodePanel = closeNodePanel;
(window as any).toggleSidebar = toggleSidebar;

let dragState: { startX: number; startY: number; startLeft: number; startTop: number; el: HTMLElement } | null = null;

function startPanelDrag(e: MouseEvent): void {
  const panel = document.getElementById('node-panel');
  if (!panel || !panel.classList.contains('visible')) return;
  dragState = {
    startX: e.clientX,
    startY: e.clientY,
    startLeft: panel.offsetLeft,
    startTop: panel.offsetTop,
    el: panel,
  };
  panel.classList.add('dragging');
  document.addEventListener('mousemove', onPanelDrag);
  document.addEventListener('mouseup', stopPanelDrag);
}

function onPanelDrag(e: MouseEvent): void {
  if (!dragState) return;
  const { el } = dragState;
  const W = el.offsetWidth;
  const H = el.offsetHeight;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const TOPBAR_H = 56;
  const PAD = 8;

  let left = dragState.startLeft + (e.clientX - dragState.startX);
  let top  = dragState.startTop  + (e.clientY - dragState.startY);

  left = Math.max(PAD, Math.min(left, vpW - W - PAD));
  top  = Math.max(TOPBAR_H + PAD, Math.min(top, vpH - H - PAD));

  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
  panelLastLeft = left;
  panelLastTop  = top;
}

function stopPanelDrag(): void {
  if (dragState) {
    dragState.el.classList.remove('dragging');
    dragState = null;
  }
  document.removeEventListener('mousemove', onPanelDrag);
  document.removeEventListener('mouseup', stopPanelDrag);
}

function toggleSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-sidebar-toggle');
  const strip = document.getElementById('sidebar-strip');
  if (!sidebar) return;
  const hidden = sidebar.classList.toggle('hidden');
  if (btn) btn.classList.toggle('active', !hidden);
  if (strip) {
    strip.classList.toggle('visible', hidden);
    strip.style.right = hidden ? '0' : '';
  }
  if (renderer) renderer.getCy().resize();
}
