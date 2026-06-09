// src/ui/main.ts
// Frontend entry — imported by index.html via Vite HMR

import './styles/main.css';
import { Renderer } from '../core/renderer.js';
import { GraphData, NodeData, EdgeData } from '../core/graph.js';
import { TourEngine } from '../core/tour.js';
import { parseFrontmatter } from '../parser/frontmatter.js';
import {
  NODE_TYPE_COLOR,
  NODE_TYPE_COLOR_DARK,
  NODE_TYPE_LABEL,
  SHAPE_LABEL,
  LAYOUTS,
  LayoutConfig,
} from '../core/config.js';

// ── Vite glob: 打包时把所有 MD 文件内容读进来 ─────────────────────────────────
const MD_FILES = import.meta.glob('../../content/**/*.md', { query: '?raw', import: 'default', eager: true });

let currentLayout = 'cose';
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

// ── State ─────────────────────────────────────────────────────────────────────

let renderer: Renderer;
let sheetOpen = false;
let tourEngine: TourEngine | null = null;
let edgeTooltip: HTMLElement | null = null;
// 漫游路径追踪：存储已绘制的路径节点 ID 列表
let tourPathHistory: string[] = [];

// 呼吸光圈动画状态
let glowRafId: number | null = null;
let glowNode: cytoscape.NodeSingular | null = null;

// ── Utilities ────────────────────────────────────────────────────────────────

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmt(val: number, step: number): string {
  return step < 1 ? val.toFixed(2) : String(val);
}

function nodeColor(type: string): string {
  return NODE_TYPE_COLOR[type] ?? NODE_TYPE_COLOR.default;
}

function nodeColorDark(type: string): string {
  return NODE_TYPE_COLOR_DARK[type] ?? NODE_TYPE_COLOR_DARK.default;
}

// 节点点击涟漪效果
function spawnNodeRipple(x: number, y: number, color: string): void {
  const ripple = document.createElement('div');
  ripple.className = 'node-ripple';
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  ripple.style.border = `2px solid ${color}`;
  document.body.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

// 漫游路径绘制
let tourPathId = 0;

function drawTourPathSegment(fromNodeId: string, toNodeId: string): void {
  const svg = document.getElementById('tour-path-svg') as unknown as SVGElement | null;
  const cy = renderer?.getCy();
  if (!svg || !cy) return;

  const from = cy.getElementById(fromNodeId);
  const to = cy.getElementById(toNodeId);
  if (from.empty() || to.empty()) return;

  const fromPos = from.renderedPosition();
  const toPos = to.renderedPosition();
  if (!fromPos || !toPos) return;

  const pathId = `tour-path-${tourPathId++}`;
  // 使用二次贝塞尔曲线，向上微微拱起
  const mx = (fromPos.x + toPos.x) / 2;
  const my = Math.min(fromPos.y, toPos.y) - 20;
  const d = `M ${fromPos.x} ${fromPos.y} Q ${mx} ${my} ${toPos.x} ${toPos.y}`;

  const ns = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('id', pathId);
  path.setAttribute('d', d);
  path.classList.add('tour-path-active');
  svg.appendChild(path);
}

function clearTourPath(): void {
  const svg = document.getElementById('tour-path-svg') as unknown as SVGElement | null;
  if (svg) {
    svg.innerHTML = '';
  }
}

function nodeLabel(type: string): string {
  return NODE_TYPE_LABEL[type] ?? type ?? '—';
}

// ── Section collapse/expand ─────────────────────────────────────────────────

function toggleSection(name: string): void {
  const section = document.querySelector(`[data-section="${name}"]`);
  const head = document.querySelector(`[data-section="${name}"] .sidebar-section__chevron`);
  if (!section) return;
  const open = section.getAttribute('data-section-state') === 'open';
  section.setAttribute('data-section-state', open ? 'closed' : 'open');
  if (head) head.classList.toggle('open', !open);
}

// ── Data loading ─────────────────────────────────────────────────────────────

function toLocation(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  const idx = parts.findIndex((p) => p === 'content');
  if (idx === -1) return filePath;
  return parts.slice(idx).join('/');
}

async function buildGraphData(): Promise<GraphData> {
  const rawFiles = MD_FILES as Record<string, string>;
  const rawEdges: EdgeData[] = [];

  // First pass: collect all edges (and node ids encountered)
  const nodeIds = new Set<string>();
  for (const [, raw] of Object.entries(rawFiles)) {
    const fm = parseFrontmatter(raw, '');
    if (fm.id) nodeIds.add(fm.id);
    if (fm.edges_out) {
      for (const edge of fm.edges_out) {
        nodeIds.add(edge.target);
        rawEdges.push({
          id: `${fm.id}||${edge.target}||${edge.type}`,
          source: fm.id,
          target: edge.target,
          type: edge.type,
          reason: edge.reason,
        });
      }
    }
  }

  // Deduplicate edges
  const seen = new Set<string>();
  const edges = rawEdges.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // Compute degree = total connections (in + out) per node
  const degree: Record<string, number> = {};
  for (const id of nodeIds) degree[id] = 0;
  for (const e of edges) {
    degree[e.source] = (degree[e.source] ?? 0) + 1;
    degree[e.target] = (degree[e.target] ?? 0) + 1;
  }

  // Second pass: build nodes with weight from degree
  const nodes: NodeData[] = [];
  for (const [fp, raw] of Object.entries(rawFiles)) {
    const fm = parseFrontmatter(raw, fp);
    nodes.push({
      id: fm.id,
      label: fm.label,
      type: fm.type,
      category: fm.category,
      summary: fm.summary,
      location: toLocation(fp),
      weight: degree[fm.id] ?? 1,
    });
  }

  return { nodes, edges };
}

async function loadGraphData(): Promise<GraphData> {
  return buildGraphData();
}

// ── Stats ───────────────────────────────────────────────────────────────────

function updateStats(): void {
  const cy = renderer.getCy();
  const set = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  const nodes = cy.nodes().not('.layer-parent');
  set('stat-nodes', String(nodes.length));
  set('stat-edges', String(cy.edges().length));
  set('stat-selected', String(cy.$(':selected').length));
  set('stat-layout', currentLayout.toUpperCase());

  // 侧边栏节点类型数量徽章
  const countShape = (shape: string, elId: string) => {
    const el = document.getElementById(elId);
    if (el) {
      const count = nodes.filter(`[type = "${shape}"]`).length;
      el.textContent = count > 0 ? `${count}` : '';
    }
  };
  countShape('concept',  'count-ellipse');
  countShape('drug',     'count-round-rectangle');
  countShape('disease',  'count-diamond');
  countShape('ingredient','count-barrel');
}

// ── Edge tooltip ─────────────────────────────────────────────────────────────

function initEdgeTooltip(): void {
  if (edgeTooltip) return;
  edgeTooltip = document.createElement('div');
  edgeTooltip.id = 'edge-tooltip';
  edgeTooltip.style.cssText = `
    position: fixed;
    z-index: 9999;
    background: rgba(15,17,23,0.92);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 0.72rem;
    color: #e2e8f0;
    pointer-events: none;
    max-width: 240px;
    white-space: pre-wrap;
    word-break: break-word;
    opacity: 0;
    transition: opacity 0.15s;
    font-family: inherit;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  `;
  document.body.appendChild(edgeTooltip);
}

function showEdgeTooltip(edge: cytoscape.EdgeSingular, x: number, y: number): void {
  if (!edgeTooltip) return;
  const reason = edge.data('reason');
  if (!reason) return;
  edgeTooltip.textContent = reason;
  edgeTooltip.style.left = (x + 12) + 'px';
  edgeTooltip.style.top  = (y - 12) + 'px';
  edgeTooltip.style.opacity = '1';
}

function hideEdgeTooltip(): void {
  if (!edgeTooltip) return;
  edgeTooltip.style.opacity = '0';
}

// ── Node detail panel ─────────────────────────────────────────────────────────

function showNodeDetail(node: cytoscape.NodeSingular): void {
  const d = node.data();
  const color = nodeColor(d.type);

  const panel = document.getElementById('node-panel');
  if (!panel) return;

  const badge = document.getElementById('lp-type-badge');
  const name = document.getElementById('lp-node-name');
  const fields = document.getElementById('lp-fields');
  const adjLabel = document.getElementById('lp-adj-label');
  const adjEl = document.getElementById('lp-adj');

  if (badge) {
    badge.textContent = nodeLabel(d.type);
    badge.style.color = color;
    badge.style.borderColor = color + '66';
    badge.style.background = color + '1a';
  }
  if (name) name.textContent = d.label || d.id;

  if (fields) {
    fields.innerHTML = `
      <div class="lp-field"><span class="lp-field-key">分类</span><span class="lp-field-val">${d.category || '—'}</span></div>
      <div class="lp-field"><span class="lp-field-key">度数</span><span class="lp-field-val">${node.data('weight')}</span></div>
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
  panel.style.display = 'flex';

  void panel.offsetHeight;

  const W = panel.offsetWidth;
  const H = panel.offsetHeight;

  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const TOPBAR_H = 56;
  const PAD = 12;

  const isMobile = vpW <= 768;
  const SHEET_H = isMobile && sheetOpen ? 56 : 0;
  const tourBarH = isMobile ? 48 : 0;
  const bottomReserve = SHEET_H + tourBarH;

  const nodePos = node.renderedPosition();
  const nodeHalfW = node.renderedWidth() / 2;
  const nodeHalfH = node.renderedHeight() / 2;
  const GAP = 12;

  const spaceRight = vpW - (nodePos.x + nodeHalfW);
  const spaceLeft  = nodePos.x - nodeHalfW;
  const spaceAbove = nodePos.y - TOPBAR_H - nodeHalfH;
  const spaceBelow = vpH - nodePos.y - nodeHalfH - bottomReserve;

  const canRight = spaceRight - GAP >= W;
  const canLeft  = spaceLeft  - GAP >= W;
  const canAbove = spaceAbove - GAP >= H;
  const canBelow = spaceBelow - GAP >= H;

  let left: number;
  let top: number;

  if (canRight && spaceRight >= spaceLeft) {
    left = nodePos.x + nodeHalfW + GAP;
    top  = Math.max(TOPBAR_H + PAD, Math.min(nodePos.y - H / 2, vpH - bottomReserve - H - PAD));
  } else if (canLeft) {
    left = nodePos.x - nodeHalfW - GAP - W;
    top  = Math.max(TOPBAR_H + PAD, Math.min(nodePos.y - H / 2, vpH - bottomReserve - H - PAD));
  } else if (canAbove && spaceAbove >= spaceBelow) {
    left = Math.max(PAD, Math.min(nodePos.x - W / 2, vpW - W - PAD));
    top  = nodePos.y - nodeHalfH - GAP - H;
  } else if (canBelow) {
    left = Math.max(PAD, Math.min(nodePos.x - W / 2, vpW - W - PAD));
    top  = nodePos.y + nodeHalfH + GAP;
  } else {
    const scores = [
      { side: 'right', score: canRight ? spaceRight : -1 },
      { side: 'left',  score: canLeft  ? spaceLeft  : -1 },
      { side: 'above', score: canAbove ? spaceAbove : -1 },
      { side: 'below', score: canBelow ? spaceBelow : -1 },
    ];
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0].side;

    if (best === 'right') {
      left = nodePos.x + nodeHalfW + GAP;
    } else if (best === 'left') {
      left = nodePos.x - nodeHalfW - GAP - W;
    } else {
      left = Math.max(PAD, Math.min(nodePos.x - W / 2, vpW - W - PAD));
    }
    top = best === 'above'
      ? nodePos.y - nodeHalfH - GAP - H
      : best === 'below'
        ? nodePos.y + nodeHalfH + GAP
        : Math.max(TOPBAR_H + PAD, Math.min(nodePos.y - H / 2, vpH - bottomReserve - H - PAD));
  }

  if (left < PAD)               left = PAD;
  if (left + W + PAD > vpW)     left = vpW - W - PAD;
  if (top < TOPBAR_H + PAD)     top  = TOPBAR_H + PAD;
  if (top + H + PAD > vpH - bottomReserve) top = vpH - H - PAD - bottomReserve;

  panel.style.left = left + 'px';
  panel.style.top  = top  + 'px';
  panelLastLeft = left;
  panelLastTop  = top;
}

function closeNodePanel(): void {
  const panel = document.getElementById('node-panel');
  if (panel) panel.classList.remove('visible');
  if (renderer) {
    renderer.getCy().elements().removeClass('dimmed highlighted highlighted-edge selected-node');
  }
}

// ── Highlight ────────────────────────────────────────────────────────────────

// 停止呼吸光圈动画
function stopGlowBreath(): void {
  if (glowRafId !== null) {
    cancelAnimationFrame(glowRafId);
    glowRafId = null;
  }
  glowNode = null;
  const host = document.getElementById('glow-host');
  if (host) host.style.boxShadow = '';
}

// 启动呼吸光圈动画
function startGlowBreath(): void {
  let frame = 0;
  const animate = () => {
    if (!glowNode || glowNode.removed()) {
      glowRafId = null;
      return;
    }
    frame++;
    const t = frame / 60;
    const pulse = (Math.sin(t * Math.PI * 2) + 1) / 2; // 0→1→0
    const spread = 24 + pulse * 24;   // 24px → 48px
    const alpha = 0.4 + pulse * 0.6; // 0.4 → 1.0
    const host = document.getElementById('glow-host');
    if (host) host.style.boxShadow = `0 0 ${spread}px rgba(99,102,241,${alpha}), 0 0 ${spread * 1.5}px rgba(99,102,241,${alpha * 0.4})`;
    glowRafId = requestAnimationFrame(animate);
  };
  glowRafId = requestAnimationFrame(animate);
}

function highlightNode(node: cytoscape.NodeSingular): void {
  const cy = renderer.getCy();

  // 停止上一个呼吸动画
  stopGlowBreath();

  // 移除所有高亮态，防止前一个主角的边/邻居残留
  cy.elements().removeClass('selected-node highlighted highlighted-edge');
  // 清除 :selected 状态，防止 .dimmed 与 :selected 冲突导致旧主角仍亮
  cy.elements().unselect();

  // 暗淡所有元素（包括当前节点前身），再把当前主角拉亮
  cy.elements().addClass('dimmed');
  node.removeClass('dimmed').addClass('selected-node').select();

  // 邻居节点拉亮
  node.connectedEdges().targets().not('.layer-parent').removeClass('dimmed').addClass('highlighted');

  // 当前主角的所有边拉亮
  node.connectedEdges().removeClass('dimmed').addClass('highlighted-edge');

  // 启动呼吸光圈动画
  glowNode = node;
  startGlowBreath();
}

function resetAll(): void {
  if (!renderer) return;
  const cy = renderer.getCy();
  cy.elements().removeClass('dimmed highlighted highlighted-edge selected-node');
  cy.elements().unselect(); // 清除 :selected，防止残留导致节点仍亮
  cy.nodes().not('.layer-parent').forEach((node: cytoscape.NodeSingular) => {
    node.unlock();
  });
  stopGlowBreath();
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

function renderLayoutParams(name: string): void {
  const container = document.getElementById('layout-params-rows');
  const applyBtn = document.getElementById('apply-params-btn');
  const params = LAYOUTS[name]?.params ?? [];
  if (!container) return;

  if (params.length === 0) {
    container.innerHTML = '<div class="no-params">此布局无可调参数</div>';
    if (applyBtn) applyBtn.style.display = 'none';
    return;
  }

  container.innerHTML = params.map((p) => {
    if (p.type === 'select') {
      const opts = (p.options ?? []).map((o) =>
        `<option value="${o}">${o}</option>`
      ).join('');
      return `<div class="param-row">
        <div class="param-label">${p.label}</div>
        <select class="param-select" data-key="${p.key}">${opts}</select>
      </div>`;
    }
    if (p.type === 'bool') {
      return `<div class="param-row">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.7rem;color:var(--muted)">
          <input type="checkbox" data-key="${p.key}" ${p.default ? 'checked' : ''} style="accent-color:var(--accent);cursor:pointer">
          ${p.label}
        </label>
      </div>`;
    }
    const val = p.default as number;
    const min = p.min ?? 0, max = p.max ?? 100;
    const pct = ((val - min) / (max - min)) * 100;
    return `<div class="param-row">
      <div class="param-label">${p.label}<span class="param-label__val">${fmt(val, p.step ?? 1)}</span></div>
      <input type="range" class="param-slider" data-key="${p.key}"
        min="${p.min}" max="${p.max}" step="${p.step}" value="${val}"
        style="background:linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)">
    </div>`;
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
    slider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
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

  const l = renderer.getCy().layout(base as unknown as cytoscape.LayoutOptions);
  l.run();
}

// ── Mobile bottom sheet: collapsible layout params ──────────────────────────────

function renderBsLayoutParams(name: string): void {
  const container = document.getElementById('bs-layout-params');
  const applyBtn = document.getElementById('bs-apply-btn');
  const params = LAYOUTS[name]?.params ?? [];
  if (!container) return;

  if (params.length === 0) {
    container.innerHTML = '<div style="font-size:0.7rem;color:var(--muted);padding:4px 0">此布局无可调参数</div>';
    if (applyBtn) applyBtn.style.display = 'none';
    return;
  }

  container.innerHTML = params.map((p) => {
    if (p.type === 'select') {
      const opts = (p.options ?? []).map((o) =>
        `<option value="${o}">${o}</option>`
      ).join('');
      return `<div class="bs-param-row">
        <div class="bs-param-label">${p.label}</div>
        <select class="bs-param-slider param-select" data-key="${p.key}" style="height:32px;padding:4px 8px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.05);color:var(--text-2);font-size:0.72rem">${opts}</select>
      </div>`;
    }
    if (p.type === 'bool') {
      return `<div class="bs-param-row">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.7rem;color:var(--text-2)">
          <input type="checkbox" data-key="${p.key}" ${p.default ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer">
          ${p.label}
        </label>
      </div>`;
    }
    const val = p.default as number;
    const min = p.min ?? 0, max = p.max ?? 100;
    const pct = ((val - min) / (max - min)) * 100;
    return `<div class="bs-param-row">
      <div class="bs-param-label">${p.label}<span class="bs-param-label__val" id="bs-pv-${p.key}">${fmt(val, p.step ?? 1)}</span></div>
      <input type="range" class="bs-param-slider" data-key="${p.key}"
        min="${p.min}" max="${p.max}" step="${p.step}" value="${val}"
        style="background:linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)">
    </div>`;
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
      slider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
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
  container.querySelectorAll<HTMLInputElement>('.bs-param-slider:not(.param-select)').forEach((s) => {
    overrides[s.dataset.key ?? ''] = parseFloat(s.value);
  });
  container.querySelectorAll<HTMLSelectElement>('.param-select').forEach((s) => {
    overrides[s.dataset.key ?? ''] = s.value;
  });
  container.querySelectorAll<HTMLInputElement>('.bs-param-row input[type="checkbox"]').forEach((cb) => {
    overrides[cb.dataset.key ?? ''] = cb.checked;
  });

  const base = { ...(LAYOUTS[currentLayout]?.cytoscape ?? {}) };
  Object.assign(base, overrides);
  const l = renderer.getCy().layout(base as unknown as cytoscape.LayoutOptions);
  l.run();
}

function fitGraph(): void { if (renderer) renderer.fit(); }

function randomize(): void {
  if (!renderer) return;
  const cy = renderer.getCy();
  cy.elements().removeClass('dimmed highlighted highlighted-edge selected-node');
  cy.nodes().not('.layer-parent').forEach((node: cytoscape.NodeSingular) => {
    node.unlock();
  });
  const nodePanel = document.getElementById('node-panel');
  if (nodePanel) nodePanel.classList.remove('visible');
  // 清除外发光
  const container = cy.container();
  if (container) container.style.filter = 'none';
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
      sel.style('width',  '');
      sel.style('height', '');
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

// ── Search ───────────────────────────────────────────────────────────────────

// 搜索结果追踪（用于键盘 ↑↓ 导航）
let searchResults: string[] = [];
let searchIndex = -1;

function searchNodes(query: string): void {
  if (!renderer) return;
  const cy = renderer.getCy();
  cy.elements().removeClass('dimmed highlighted highlighted-edge selected-node');
  // 清除外发光
  const container = cy.container();
  if (container) container.style.filter = 'none';
  searchResults = [];
  searchIndex = -1;
  if (!query.trim()) { updateStats(); return; }
  const q = query.toLowerCase();
  let matched = false;
  cy.nodes().not('.layer-parent').forEach((n: cytoscape.NodeSingular) => {
    const label = (n.data('label') ?? '').toLowerCase();
    if (label.includes(q)) {
      n.addClass('highlighted');
      searchResults.push(n.id());
      matched = true;
    } else {
      n.addClass('dimmed');
    }
  });
  if (matched) {
    searchIndex = 0;
    focusSearchResult();
    updateStats();
  }
}

// 聚焦当前搜索结果（键盘 ↑↓ 使用）
function focusSearchResult(): void {
  if (!renderer || searchResults.length === 0) return;
  const cy = renderer.getCy();
  // 清除上一个焦点
  cy.nodes().removeClass('tour-path-preview');
  const nodeId = searchResults[searchIndex];
  const node = cy.getElementById(nodeId);
  if (!node.empty()) {
    node.select();
    cy.animate({
      center: { eles: node },
      zoom: 1.5,
      duration: 400,
      easing: 'ease-out-cubic',
    });
  }
}

// 键盘导航（附加到搜索输入框的 keydown 处理器）
function handleSearchKeydown(e: KeyboardEvent, inputEl: HTMLInputElement): void {
  if (!e.key) return;
  if (e.key === 'Escape') {
    inputEl.value = '';
    searchNodes('');
    e.preventDefault();
  }
  if (searchResults.length === 0) return;
  if (e.key === 'ArrowDown') {
    searchIndex = (searchIndex + 1) % searchResults.length;
    focusSearchResult();
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    searchIndex = (searchIndex - 1 + searchResults.length) % searchResults.length;
    focusSearchResult();
    e.preventDefault();
  } else if (e.key === 'Enter') {
    // 确认当前选中项
    const nodeId = searchResults[searchIndex];
    if (nodeId) {
      const cy = renderer!.getCy();
      const node = cy.getElementById(nodeId);
      if (!node.empty()) {
        showNodeDetail(node);
        highlightNode(node);
      }
    }
    e.preventDefault();
  }
}

// ── Shape / type highlight ──────────────────────────────────────────────────

let activeShapeFilter: string | null = null;

function highlightShape(shape: string): void {
  resetAll();
  if (!renderer) return;
  const cy = renderer.getCy();

  if (activeShapeFilter === shape) {
    activeShapeFilter = null;
    document.querySelectorAll('.node-type-item, .shape-filter-item').forEach((el) => el.classList.remove('active'));
    return;
  }
  activeShapeFilter = shape;

  document.querySelectorAll('.node-type-item, .shape-filter-item').forEach((el) => {
    el.classList.toggle('active', false);
  });

  cy.nodes().not('.layer-parent').forEach((n: cytoscape.NodeSingular) => {
    if (n.style('shape') === shape) n.addClass('highlighted');
    else n.addClass('dimmed');
  });

  document.querySelectorAll('.shape-filter-item').forEach((el) => {
    const label = el.querySelector('.shape-filter-item__label')?.textContent ?? '';
    const shapeName = Object.entries(SHAPE_LABEL).find(([, v]) => v === label)?.[0] ?? label;
    if (shapeName === shape || label.toLowerCase().includes(shape)) {
      el.classList.add('active');
    }
  });

  document.querySelectorAll('.node-type-item').forEach((el) => {
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

// ── Events ──────────────────────────────────────────────────────────────────

function initEvents(): void {
  const cy = renderer.getCy();

  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
    const cy_el = evt.target.cy();
    const container = cy_el.container();
    if (!container) return;

    // renderedPosition 是相对于 #cy 容器的坐标，
    // 涟漪是 position:fixed（相对视口），需要加上容器的视口偏移量
    const pos = node.renderedPosition();
    const rect = container.getBoundingClientRect();
    const vpX = rect.left + pos.x;
    const vpY = rect.top + pos.y;

    const color = node.data('color') || '#818cf8';
    spawnNodeRipple(vpX, vpY, color);
    highlightNode(node);
    showNodeDetail(node);
    updateStats();
    syncBottomSheetStats();
  });

  cy.on('tap', 'edge', (evt) => {
    const edge = evt.target;
    cy.elements().addClass('dimmed');
    edge.removeClass('dimmed').addClass('highlighted-edge');
    // 边两端节点：只有 selected-node（白色边 + 紫色辉光），不加 highlighted
    edge.source().removeClass('dimmed highlighted').addClass('selected-node').select();
    edge.target().removeClass('dimmed highlighted').addClass('selected-node').select();
    updateStats();
    syncBottomSheetStats();
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      resetAll();
      if (tourEngine?.isRunning() || tourEngine?.isPaused()) tourStop();
      const nodePanel = document.getElementById('node-panel');
      if (nodePanel) nodePanel.classList.remove('visible');
    }
  });

  cy.on('cxtap', 'node', (evt) => { evt.target.remove(); resetAll(); updateStats(); syncBottomSheetStats(); });

  cy.on('dbltap', 'node', (evt) => {
    evt.target.lock();
    const node = evt.target;
    node.animate({
      style: { 'border-width': 4, 'border-color': '#ffffff' },
      duration: 120,
      easing: 'ease-out',
      complete: () => {
        node.style('border-width', 2.5);
        node.style('border-color', '#fbbf24');
      },
    });
  });

  // Hover：使用 CSS 类切换，配合样式表中的 .hovered 规则，带 scale 聚焦感
  cy.on('mouseover', 'node', (evt) => {
    const node = evt.target;
    if (node.hasClass('dimmed')) return;
    node.stop(true, true).addClass('hovered');

    // 漫游进行中：hover 节点时预览整条漫游路径
    if (tourPathHistory.length > 1) {
      const nodeId = node.id();
      const idx = tourPathHistory.indexOf(nodeId);
      if (idx >= 0) {
        // 高亮路径上该节点的所有相邻边
        for (let i = 0; i < tourPathHistory.length - 1; i++) {
          const from = tourPathHistory[i];
          const to = tourPathHistory[i + 1];
          cy.edges().forEach((edge: cytoscape.EdgeSingular) => {
            if (edge.source().id() === from && edge.target().id() === to) {
              edge.addClass('tour-path-preview');
            }
          });
        }
      }
    }
  });

  cy.on('mouseout', 'node', (evt) => {
    const node = evt.target;
    if (node.hasClass('dimmed') || node.hasClass('highlighted')) return;
    node.stop(true, true).removeClass('hovered');
    // 移除路径预览高亮
    cy.edges().removeClass('tour-path-preview');
  });

  // 拖拽状态反馈
  cy.on('grab', 'node', (evt) => {
    const node = evt.target;
    node.style('opacity', 0.85);
    renderer.setDragMode(true);
  });

  cy.on('free', 'node', (evt) => {
    const node = evt.target;
    node.style('opacity', 1);
    renderer.setDragMode(false);
  });

  cy.on('dragfree', () => { renderer.setDragMode(false); updateStats(); syncBottomSheetStats(); });
  cy.on('layoutstop', () => { updateStats(); syncBottomSheetStats(); });
  cy.on('select', () => { updateStats(); syncBottomSheetStats(); });
  cy.on('unselect', () => { updateStats(); syncBottomSheetStats(); });
  cy.on('zoom', () => { showZoomIndicator(); });
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
        if (tourEngine?.isRunning() || tourEngine?.isPaused()) tourStop();
        break;
      case 'f': case 'F': fitGraph(); break;
      case 'r': case 'R': randomize(); break;
      case 't': case 'T': toggleTour(); break;
      case 'a': case 'A':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); cy.nodes().not('.layer-parent').select(); }
        break;
      case 'p': case 'P':
        if (tourEngine?.isRunning() || tourEngine?.isPaused()) tourPause();
        break;
    }
  });
}

// ── Utility: Zoom indicator ──────────────────────────────────────────────────
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
    if (el) el.style.opacity = '0';
    setTimeout(() => { if (el) el.style.display = 'none'; }, 400);
  }, 2500);
}

// ── Utility: Toast notification ─────────────────────────────────────────────
function showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast__dot"></span><span>${message}</span>`;
  container.appendChild(toast);
  // 自动消失
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Utility: Empty state ────────────────────────────────────────────────────
function updateEmptyState(): void {
  const el = document.getElementById('empty-state');
  if (!el || !renderer) return;
  const nodes = renderer.getCy().nodes().not('.layer-parent');
  el.style.display = nodes.length === 0 ? '' : 'none';
}

// ── Boot ───────────────────────────────────────────────────────────────────

function toggleBottomSheet(): void {
  const sheet = document.getElementById('bottom-sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  const bar = document.getElementById('sheet-expand-bar');
  const app = document.getElementById('app');
  if (!sheet) return;
  sheetOpen = !sheetOpen;
  sheet.classList.toggle('open', sheetOpen);
  if (backdrop) backdrop.classList.toggle('visible', sheetOpen);
  if (bar) bar.classList.toggle('sheet-open', sheetOpen);
  if (app) app.classList.toggle('sheet-open', sheetOpen);
  syncTourBarPosition();
}

function closeBottomSheet(): void {
  const sheet = document.getElementById('bottom-sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  const bar = document.getElementById('sheet-expand-bar');
  const app = document.getElementById('app');
  if (!sheet) return;
  sheetOpen = false;
  sheet.classList.remove('open');
  if (backdrop) backdrop.classList.remove('visible');
  if (bar) bar.classList.remove('sheet-open');
  if (app) app.classList.remove('sheet-open');
  syncTourBarPosition();
}

function syncTourBarPosition(): void {
  const tourBar = document.getElementById('tour-status');
  if (!tourBar) return;
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    tourBar.style.bottom = sheetOpen ? '0' : '';
  } else {
    tourBar.style.bottom = '';
  }
}

// ── Mobile expand bar ─────────────────────────────────────────────────────────

// ── Mobile bottom sheet drag ───────────────────────────────────────────────────

// 拖拽状态（模块级别，供 onMove/onUp 闭包共享）
let sheetDragState: {
  startY: number;
  currentY: number;
  startTime: number;
  lastY: number;
  lastTime: number;
} | null = null;

function startSheetDrag(e: PointerEvent): void {
  const sheet = document.getElementById('bottom-sheet');
  const closeBar = document.getElementById('sheet-close-bar');
  if (!sheet || !sheet.classList.contains('open')) return;
  if (closeBar && !closeBar.contains(e.target as Node) && e.target !== closeBar) return;

  e.preventDefault();
  const now = performance.now();
  sheetDragState = {
    startY: e.clientY,
    currentY: e.clientY,
    startTime: now,
    lastY: e.clientY,
    lastTime: now,
  };

  // 拖拽时禁止滚动穿透
  sheet.style.overflowY = 'hidden';

  const onMove = (me: PointerEvent) => {
    if (!sheetDragState) return;
    const delta = me.clientY - sheetDragState.startY;

    // 弹性效果：下拉超出时用 0.5 阻力系数，让手指感觉更有弹性
    const rubberDelta = delta > 0 ? delta * 0.5 : delta;
    // 禁止上拉超过原位
    sheet.style.transform = `translateY(${Math.max(0, rubberDelta)}px)`;
    sheet.style.transition = 'none';

    sheetDragState.currentY = me.clientY;
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
    const elapsed = (performance.now() - startTime) || 1;
    const velocity = Math.abs((ue.clientY - lastY) / (performance.now() - lastTime || 1));

    // 恢复到 CSS 默认位置（清除行内 transform，由 CSS transition 接管）
    sheet.style.transform = '';
    sheet.style.overflowY = '';

    // 关闭阈值：距离 > 80px 或 速度 > 0.5px/ms（快速上甩）
    const CLOSE_DIST = 80;
    const CLOSE_VELOCITY = 0.5;
    if (delta > CLOSE_DIST || (delta > 0 && velocity > CLOSE_VELOCITY)) {
      sheet.style.transition = '';
      closeBottomSheet();
    } else {
      // 弹回
      sheet.style.transition = 'transform 0.35s cubic-bezier(0.34,1.4,0.64,1)';
      // 强制重绘让 transition 生效
      void sheet.offsetHeight;
      sheet.style.transform = '';
    }
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
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

    initEdgeTooltip();

    renderer = new Renderer({
      container,
      data,
      layoutName: 'cose',
      layoutConfigs: LAYOUTS,
      onEdgeHover: (edge, x, y) => {
        if (edge) showEdgeTooltip(edge, x, y);
        else hideEdgeTooltip();
      },
    });

    initEvents();
    initShortcuts();
    initDebugOverlay();
    updateStats();
    syncBottomSheetStats();

    // 右上角 badge：加载完成后切为正常状态
    const badgeDot = document.getElementById('badge-dot');
    if (badgeDot) badgeDot.classList.remove('topbar__badge-dot--loading');

    // Sync sidebar toggle button state with actual sidebar class
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('btn-sidebar-toggle');
    if (sidebar && btn) {
      btn.classList.toggle('active', !sidebar.classList.contains('hidden'));
    }

    // Mobile expand bar & sheet drag
    const bar = document.getElementById('sheet-expand-bar');
    if (bar) bar.addEventListener('click', toggleBottomSheet);

    const sheet = document.getElementById('bottom-sheet');
    if (sheet) {
      sheet.addEventListener('pointerdown', startSheetDrag);
    }

    // Init tour sliders after graph loads
    initTourSlider();
  })
  .catch((err) => {
    const n = document.getElementById('stat-nodes');
    const e = document.getElementById('stat-edges');
    if (n) n.textContent = 'error';
    if (e) e.textContent = err.message;
  });

window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (renderer) fitGraph(); syncTourBarPosition(); }, 150);
});

// Search input listeners
const desktopSearch = document.getElementById('toolbar-search') as HTMLInputElement;
if (desktopSearch) {
  desktopSearch.addEventListener('input', () => searchNodes(desktopSearch.value));
  desktopSearch.addEventListener('keydown', (e) => handleSearchKeydown(e, desktopSearch));
}
const mobileSearch = document.getElementById('bs-search-input') as HTMLInputElement;
if (mobileSearch) {
  mobileSearch.addEventListener('input', () => searchNodes(mobileSearch.value));
  mobileSearch.addEventListener('keydown', (e) => handleSearchKeydown(e, mobileSearch));
}

let dragState: { startX: number; startY: number; startLeft: number; startTop: number; el: HTMLElement } | null = null;

function startPanelDrag(e: PointerEvent): void {
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
  document.addEventListener('pointermove', onPanelDrag);
  document.addEventListener('pointerup', stopPanelDrag);
}

function onPanelDrag(e: PointerEvent): void {
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
  document.removeEventListener('pointermove', onPanelDrag);
  document.removeEventListener('pointerup', stopPanelDrag);
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

// ── Tour ─────────────────────────────────────────────────────────────────────

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
      intervalSlider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
    });
    intervalSlider.addEventListener('change', () => {
      tourEngine?.setInterval(parseInt(intervalSlider.value));
    });
  }
  if (depthSlider) {
    depthSlider.value = '10';
    depthSlider.addEventListener('input', () => {
      const v = parseInt(depthSlider.value);
      if (depthVal) depthVal.textContent = v === 10 ? '不限' : `第 ${v} 层`;
      const pct = ((v - 1) / (10 - 1)) * 100;
      depthSlider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
    });
    depthSlider.addEventListener('change', () => {
      const v = parseInt(depthSlider.value);
      tourEngine?.setMaxDepth(v >= 10 ? -1 : v);
    });
    depthSlider.style.background = `linear-gradient(to right, var(--accent) 100%, var(--border) 100%)`;
  }
}

function startTour(): void {
  if (!renderer) return;

  const cy = renderer.getCy();
  clearTourPath(); // 漫游开始时清空路径
  tourPathHistory = []; // 重置路径历史

  const selected = cy.nodes('.node-selected').not('.layer-parent');
  let rootId: string;
  if (selected.length > 0) {
    rootId = selected[0].id();
  } else {
    const nodes = cy.nodes().not('.layer-parent');
    let best: cytoscape.NodeSingular = nodes[0];
    let maxDegree = 0;
    nodes.forEach((n) => {
      const d = n.degree();
      if (d > maxDegree) { maxDegree = d; best = n; }
    });
    rootId = best.id();
  }

  const intervalSlider = document.getElementById('tour-interval') as HTMLInputElement;
  const depthSlider = document.getElementById('tour-maxdepth') as HTMLInputElement;
  const interval = parseInt(intervalSlider?.value ?? '3000');
  const maxDepth = parseInt(depthSlider?.value ?? '10');

  const tourBtn = document.getElementById('btn-tour');
  const bsTourBtn = document.getElementById('bs-btn-tour');
  if (tourBtn) tourBtn.classList.add('active');
  if (bsTourBtn) bsTourBtn.classList.add('active');

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
    interval,
    maxDepth: maxDepth >= 10 ? -1 : maxDepth,
    onStep: (info) => {
      // 绘制从上一个节点到当前节点的路径段
      const prevNodes = info.path.slice(0, -1);
      const currNode = info.path[info.path.length - 1];
      if (prevNodes.length > 0) {
        const prev = prevNodes[prevNodes.length - 1];
        drawTourPathSegment(prev, currNode);
        // 追加到历史路径
        tourPathHistory.push(prev, currNode);
      } else {
        // 起点
        tourPathHistory.push(currNode);
      }

      showNodeDetail(cy.getElementById(info.nodeId));

      const status = document.getElementById('tour-status');
      const depthBadge = document.getElementById('tour-depth-badge');
      const countBadge = document.getElementById('tour-count-badge');
      const cycleBadge = document.getElementById('tour-cycle-badge');

      if (status) status.style.display = '';

      if (depthBadge) depthBadge.textContent = `第 ${info.depth} 层`;
      if (countBadge) countBadge.textContent = `已探索 ${info.totalExplored} 个节点`;

      // 进度条更新
      const progressBar = document.getElementById('tour-progress-bar');
      if (progressBar && info.totalToExplore > 0) {
        const pct = Math.round((info.totalExplored / info.totalToExplore) * 100);
        progressBar.style.width = `${pct}%`;
      }

      if (cycleBadge) {
        if (info.cycleCount > 0) {
          cycleBadge.style.display = '';
          cycleBadge.textContent = `第 ${info.cycleCount + 1} 轮`;
        } else {
          cycleBadge.style.display = 'none';
        }
      }
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
      if (status && !tourEngine?.isRunning()) {
        setTimeout(() => { if (status) status.style.display = 'none'; }, 2000);
      }
    },
  });

  const depthBadge = document.getElementById('tour-depth-badge');
  const countBadge = document.getElementById('tour-count-badge');
  if (depthBadge) depthBadge.textContent = '第 1 层';
  if (countBadge) countBadge.textContent = '已探索 1 个节点';
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
  if (tourEngine?.isRunning() || tourEngine?.isPaused()) {
    tourStop();
  } else {
    startTour();
  }
}

(window as any).toggleTour = toggleTour;
(window as any).tourPause = tourPause;
(window as any).tourStop = tourStop;

// ── Music player ─────────────────────────────────────────────────────────────────
(function () {
  const btn         = document.getElementById('btn-music');
  const bsBtn       = document.getElementById('bs-btn-music');
  const audioEl     = document.getElementById('bgm');
  const iconPlay    = document.getElementById('music-icon-play');
  const iconPause   = document.getElementById('music-icon-pause');
  const bsIconPlay  = document.getElementById('bs-music-icon-play');
  const bsIconPause = document.getElementById('bs-music-icon-pause');

  if (!audioEl || !btn) return;
  const audio = audioEl as HTMLAudioElement;

  // Add audio filenames from /public/audio/ here.
  const TRACKS = [
    'Echoes of the Eye - Travelers Encore.mp3',
  ];

  let queue: string[] = [], trackIdx = 0, playing = false;

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQueue() { queue = shuffle(TRACKS); trackIdx = 0; }

  function setPlaying(v: boolean) {
    playing = v;
    const musicLabel = document.getElementById('music-label');
    if (musicLabel) musicLabel.textContent = v ? '暂停' : '播放';
    const toggle = (b: HTMLElement | null, ip: HTMLElement | null, ipa: HTMLElement | null) => {
      if (!b || !ip || !ipa) return;
      b.classList.toggle('active', v);
      ip.style.display  = v ? 'none'  : 'block';
      ipa.style.display = v ? 'block' : 'none';
    };
    toggle(btn, iconPlay, iconPause);
    if (bsBtn) toggle(bsBtn, bsIconPlay, bsIconPause);
  }

  function playNext() {
    if (!queue.length) return;
    trackIdx = (trackIdx + 1) % queue.length;
    if (trackIdx === 0) buildQueue();
    audio.src = '/audio/' + queue[trackIdx];
    audio.load();
    audio.play().catch(() => {});
  }

  audio.volume = 0.45;
  audio.addEventListener('ended', playNext);

  buildQueue();
  audio.src = '/audio/' + queue[0];
  audio.load();

  function toggleMusic() {
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  }

  btn.addEventListener('click', toggleMusic);
  if (bsBtn) bsBtn.addEventListener('click', toggleMusic);
})();

// ── Debug overlay: full forensics panel ──────────────────────────────────
let debugOverlayActive = false;
let debugRafId: number | null = null;
let prevSelectedId: string | null = null; // 追踪上一个 :selected 节点 ID

function initDebugOverlay(): void {
  // Toggle button
  const btn = document.createElement('button');
  btn.id = 'debug-toggle';
  btn.textContent = '调试状态 🔍';
  btn.addEventListener('click', () => {
    debugOverlayActive = !debugOverlayActive;
    btn.classList.toggle('active', debugOverlayActive);
    const panel = document.getElementById('debug-panel');
    if (panel) panel.style.display = debugOverlayActive ? '' : 'none';
    if (debugOverlayActive) {
      if (!document.getElementById('debug-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'debug-overlay';
        const cyContainer = renderer?.getCy().container();
        if (cyContainer) cyContainer.appendChild(overlay);
      }
      runDebugUpdate();
    } else {
      if (debugRafId !== null) { cancelAnimationFrame(debugRafId); debugRafId = null; }
      const overlay = document.getElementById('debug-overlay');
      if (overlay) overlay.innerHTML = '';
    }
  });
  document.body.appendChild(btn);

  // Forensics panel
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <h4>🔬 取证面板</h4>
    <div style="margin-bottom:8px">
      <span style="color:#94a3b8;font-size:10px">容器级辉光</span>
      <div id="dbg-glow" style="font-size:10px;color:#e2e8f0;word-break:break-all;max-height:40px;overflow:hidden"></div>
    </div>
    <div style="margin-bottom:8px">
      <span style="color:#94a3b8;font-size:10px">容器 filter</span>
      <div id="dbg-filter" style="font-size:10px;color:#e2e8f0;word-break:break-all"></div>
    </div>
    <div id="dbg-sel-label" style="margin-bottom:4px">
      <span style="color:#94a3b8;font-size:10px">当前 :selected</span>
      <span id="dbg-sel-count" style="font-size:10px;color:#818cf8;font-weight:600;margin-left:4px">0 个</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
      <!-- 新主角 -->
      <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:6px;padding:6px 8px">
        <div style="font-size:10px;color:#4ade80;font-weight:700;margin-bottom:4px">✨ 新主角</div>
        <div id="dbg-new-name" style="font-size:10px;color:#e2e8f0;font-weight:700;margin-bottom:4px">—</div>
        <div style="font-size:9px;color:#94a3b8;line-height:1.6" id="dbg-new-props"></div>
      </div>
      <!-- 旧主角 -->
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:6px 8px">
        <div style="font-size:10px;color:#f87171;font-weight:700;margin-bottom:4px">⏮ 旧主角</div>
        <div id="dbg-old-name" style="font-size:10px;color:#e2e8f0;font-weight:700;margin-bottom:4px">—</div>
        <div style="font-size:9px;color:#94a3b8;line-height:1.6" id="dbg-old-props"></div>
      </div>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:6px">
      <div style="display:flex;gap:8px;flex-wrap:wrap" id="dbg-all-selected"></div>
    </div>
    <div class="debug-conflict" id="dbg-conflict" style="display:none"></div>
  `;
  document.body.appendChild(panel);
}

function nodeForensicProps(node: cytoscape.NodeSingular): string {
  const id = node.id();
  const label = node.data('label') || id;
  const sel = node.selected();
  const dimmed = node.hasClass('dimmed');
  const snode = node.hasClass('selected-node');
  const highlight = node.hasClass('highlighted');
  const hovered = node.hasClass('hovered');
  const rOpacity = node.renderedStyle('opacity') ?? '?';
  const bWidth = node.renderedStyle('border-width') ?? '?';
  const bColor = node.renderedStyle('border-color') ?? '?';
  const bgColor = node.renderedStyle('background-color') ?? '?';

  const flag = (cond: boolean, tag: string, ok: string, fail: string) =>
    cond ? `<span style="color:#4ade80">${tag}${ok}</span>` : `<span style="color:#64748b">${tag}${fail}</span>`;

  return [
    flag(sel,       'S:', '✓', '✗'),
    flag(dimmed,    'D:', '✓', '✗'),
    flag(snode,     'N:', '✓', '✗'),
    flag(highlight, 'H:', '✓', '✗'),
    flag(hovered,   'V:', '✓', '✗'),
    `opacity:${rOpacity}`,
    `bw:${bWidth}px`,
    `bc:${bColor}`,
    `bg:${bgColor}`,
  ].join('<br>');
}

function runDebugUpdate(): void {
  if (!debugOverlayActive || !renderer) {
    debugRafId = null;
    return;
  }
  const cy = renderer.getCy();
  const panel = document.getElementById('debug-panel');
  if (!panel) { debugRafId = null; return; }

  // ── Container glow ────────────────────────────────────────────────
  const glowHost = document.getElementById('glow-host');
  const glowText = glowHost ? glowHost.style.boxShadow || '(无)' : '(无 glow-host)';
  const filterText = cy.container()?.style.filter || '(无)';
  const glowEl = document.getElementById('dbg-glow');
  const filterEl = document.getElementById('dbg-filter');
  if (glowEl) glowEl.textContent = glowText;
  if (filterEl) filterEl.textContent = filterText;

  // ── Container glow active? ────────────────────────────────────────
  const glowActive = glowText && glowText !== '(无)' && glowText !== 'none' && glowText !== '';
  if (glowEl) {
    glowEl.style.color = glowActive ? '#4ade80' : '#64748b';
  }

  // ── All :selected nodes ────────────────────────────────────────────
  const allSelected = cy.$(':selected');
  const selCountEl = document.getElementById('dbg-sel-count');
  if (selCountEl) selCountEl.textContent = `${allSelected.length} 个`;

  const allSelectedEl = document.getElementById('dbg-all-selected');
  if (allSelectedEl) {
    if (allSelected.length === 0) {
      allSelectedEl.innerHTML = '<span style="font-size:9px;color:#64748b">无 :selected</span>';
    } else {
      allSelectedEl.innerHTML = allSelected.map((n: cytoscape.NodeSingular) => {
        const label = n.data('label') || n.id();
        const dimmed = n.hasClass('dimmed');
        const color = dimmed ? '#f87171' : '#818cf8';
        return `<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:${dimmed ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)'};color:${color}">${label.slice(0,10)}${dimmed ? ' ⚠' : ''}</span>`;
      }).join('');
    }
  }

  // ── Find current (new) protagonist ────────────────────────────────
  const snodeEls = cy.nodes('.selected-node');
  const currentNode = snodeEls.length > 0 ? snodeEls[0] : null;

  // ── Find previous protagonist ─────────────────────────────────────
  const allSels = cy.$(':selected').nodes();
  // previous = the selected node that is NOT the current protagonist
  let prevNode: cytoscape.NodeSingular | null = null;
  if (allSels.length > 0) {
    for (let i = 0; i < allSels.length; i++) {
      const n = allSels[i];
      if (currentNode && n.id() === currentNode.id()) continue;
      prevNode = n;
      break;
    }
  }

  const newNameEl = document.getElementById('dbg-new-name');
  const newPropsEl = document.getElementById('dbg-new-props');
  const oldNameEl = document.getElementById('dbg-old-name');
  const oldPropsEl = document.getElementById('dbg-old-props');
  const conflictEl = document.getElementById('dbg-conflict');

  if (currentNode) {
    if (newNameEl) newNameEl.textContent = (currentNode.data('label') || currentNode.id()).slice(0, 12);
    if (newPropsEl) newPropsEl.innerHTML = nodeForensicProps(currentNode);
  } else {
    if (newNameEl) newNameEl.textContent = '—';
    if (newPropsEl) newPropsEl.innerHTML = '<span style="color:#64748b">无主角</span>';
  }

  if (prevNode) {
    if (oldNameEl) oldNameEl.textContent = (prevNode.data('label') || prevNode.id()).slice(0, 12);
    if (oldPropsEl) oldPropsEl.innerHTML = nodeForensicProps(prevNode);
    // Highlight the problem: prev is dimmed BUT glow is still on
    const isDimmed = prevNode.hasClass('dimmed');
    const isSelected = prevNode.selected();
    if (oldPropsEl && isDimmed && isSelected) {
      oldPropsEl.innerHTML += '<br><span style="color:#f87171;font-weight:700">⚠ dimmed+:selected 冲突!</span>';
    } else if (oldPropsEl && isDimmed && glowActive) {
      oldPropsEl.innerHTML += `<br><span style="color:#fbbf24">⚠ 容器辉光残留!</span>`;
    }
  } else {
    if (oldNameEl) oldNameEl.textContent = '—';
    if (oldPropsEl) oldPropsEl.innerHTML = '<span style="color:#64748b">无旧主角</span>';
  }

  // ── Conflict detection ─────────────────────────────────────────────
  const conflictNodes = cy.nodes('.dimmed').filter(':selected');
  if (conflictEl) {
    if (conflictNodes.length > 0) {
      conflictEl.style.display = '';
      conflictEl.textContent = `⚠ 冲突: .dimmed+:selected = ${conflictNodes.length} 个`;
    } else {
      conflictEl.style.display = 'none';
    }
  }

  // ── Draw overlay badges (per-node) ─────────────────────────────────
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
      if (hasSelected) parts.push('S');
      if (hasDimmed) parts.push('D');
      if (hasSNode) parts.push('N');
      if (hasHighlight) parts.push('H');
      if (hasHovered) parts.push('V');
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
      badge.className = cls;
      badge.textContent = `${label}[${text}]`;
      badge.style.left = pos.x + 'px';
      badge.style.top = (pos.y - nodeH / 2 - 2) + 'px';
      overlay.appendChild(badge);

      if (hasSelected && hasDimmed) {
        const c = document.createElement('div');
        c.className = 'debug-badge debug-badge--selected';
        c.textContent = 'CONFLICT!';
        c.style.left = pos.x + 'px';
        c.style.top = (pos.y - nodeH / 2 - 28) + 'px';
        overlay.appendChild(c);
      }
    });
  }

  debugRafId = requestAnimationFrame(runDebugUpdate);
}

// 暴露所有 HTML onclick/onpointerdown 调用的函数到全局作用域
(window as any).startPanelDrag  = startPanelDrag;
(window as any).closeNodePanel = closeNodePanel;
(window as any).startSheetDrag  = startSheetDrag;
(window as any).fitGraph        = fitGraph;
(window as any).randomize       = randomize;
(window as any).resetAll        = resetAll;
(window as any).animatePulse    = animatePulse;
(window as any).toggleTour      = toggleTour;
(window as any).toggleSidebar   = toggleSidebar;
(window as any).closeBottomSheet    = closeBottomSheet;
(window as any).toggleBottomSheet   = toggleBottomSheet;
(window as any).highlightShape     = highlightShape;
(window as any).toggleSection      = toggleSection;
(window as any).applyLayoutParams = applyLayoutParams;
(window as any).tourPause          = tourPause;
(window as any).runLayout         = runLayout;
(window as any)._dbg = {
  overlay: () => {
    debugOverlayActive = !debugOverlayActive;
    const btn = document.getElementById('debug-toggle');
    if (btn) btn.classList.toggle('active', debugOverlayActive);
    const panel = document.getElementById('debug-panel');
    if (panel) panel.style.display = debugOverlayActive ? '' : 'none';
    if (debugOverlayActive) {
      if (!document.getElementById('debug-overlay')) {
        const ov = document.createElement('div');
        ov.id = 'debug-overlay';
        renderer?.getCy().container()?.appendChild(ov);
      }
      runDebugUpdate();
    } else {
      if (debugRafId !== null) { cancelAnimationFrame(debugRafId); debugRafId = null; }
      const ov = document.getElementById('debug-overlay');
      if (ov) ov.innerHTML = '';
    }
  },
  // 控制台取证：查任意节点
  node: (id: string) => {
    const cy = renderer?.getCy();
    if (!cy) return 'no renderer';
    const n = cy.getElementById(id);
    if (n.empty()) return `节点 "${id}" 不存在`;
    return {
      id: n.id(),
      label: n.data('label'),
      selected: n.selected(),
      dimmed: n.hasClass('dimmed'),
      selectedNode: n.hasClass('selected-node'),
      highlighted: n.hasClass('highlighted'),
      hovered: n.hasClass('hovered'),
      opacity: n.renderedStyle('opacity'),
      borderWidth: n.renderedStyle('border-width'),
      borderColor: n.renderedStyle('border-color'),
      backgroundColor: n.renderedStyle('background-color'),
    };
  },
  // 控制台取证：查 glow-host
  glow: () => {
    const h = document.getElementById('glow-host');
    return h ? h.style.boxShadow || '(空字符串)' : '(无 glow-host)';
  },
  // 控制台取证：查容器 filter
  filter: () => {
    return renderer?.getCy().container()?.style.filter || '(无)';
  },
  // 控制台取证：列出所有 :selected 节点
  selected: () => {
    const cy = renderer?.getCy();
    if (!cy) return [];
    return cy.$(':selected').nodes().map((n: cytoscape.NodeSingular) => ({
      id: n.id(),
      label: n.data('label'),
      dimmed: n.hasClass('dimmed'),
    }));
  },
};
