// src/ui/app-debug.ts
// 取证面板：节点样式诊断工具。
// 每次点击节点时更新，实时显示该节点的 shape/border/size/weight/category，
// 帮助判断为什么视觉样式没有按预期生效。

import cytoscape from 'cytoscape';
import type { NodeSingular } from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';

export let debugOverlayActive = false;
let _prevSelectedNodeId: string | null = null;
let _prevSelectedNodeName: string | null = null;

export function isDebugActive(): boolean {
  return debugOverlayActive;
}

export function setDebugActive(v: boolean): void {
  debugOverlayActive = v;
}

export function getPrevSelectedNode(): { id: string | null; name: string | null } {
  return { id: _prevSelectedNodeId, name: _prevSelectedNodeName };
}

export function setPrevSelectedNode(id: string | null, name: string | null): void {
  _prevSelectedNodeId = id;
  _prevSelectedNodeName = name;
}

export function initDebugOverlay(renderer: Renderer): void {
  // ── Inject button into shortcuts sidebar ──────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'debug-toggle';
  btn.textContent = '取证面板 🔍';
  btn.addEventListener('click', () => {
    const active = btn.classList.toggle('active');
    const panel = document.getElementById('debug-panel');
    if (panel) panel.style.display = active ? '' : 'none';
    if (active) {
      debugOverlayActive = true;
      updateForensicPanel(renderer);
    } else {
      debugOverlayActive = false;
    }
  });
  document.querySelector('.shortcuts-list')?.appendChild(btn);

  // ── Build the forensic panel ────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  // Positioned via CSS in index.css
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="dbg-header">
      <span class="dbg-header__title">🔬 节点取证</span>
      <span class="dbg-header__hint">点击任意节点自动更新</span>
    </div>

    <!-- 当前选中节点 -->
    <div class="dbg-section" id="dbg-current-section">
      <div class="dbg-section__label">当前主角</div>
      <div class="dbg-node-card" id="dbg-current-card">
        <div class="dbg-node-card__name" id="dbg-node-name">—</div>
        <div class="dbg-node-card__meta" id="dbg-node-meta"></div>
        <div class="dbg-node-card__props" id="dbg-node-props"></div>
      </div>
    </div>

    <!-- 前一个主角 -->
    <div class="dbg-section" id="dbg-prev-section">
      <div class="dbg-section__label">前一个主角</div>
      <div class="dbg-node-card dbg-node-card--muted" id="dbg-prev-card">
        <div class="dbg-node-card__name" id="dbg-prev-name">—</div>
        <div class="dbg-node-card__props" id="dbg-prev-props"></div>
      </div>
    </div>

    <!-- 全局统计 -->
    <div class="dbg-section">
      <div class="dbg-section__label">图谱状态</div>
      <div class="dbg-stats-grid" id="dbg-stats-grid">
        <div class="dbg-stat">
          <div class="dbg-stat__val dbg-stat__val--accent" id="dbg-sel-count">0</div>
          <div class="dbg-stat__key">:selected</div>
        </div>
        <div class="dbg-stat">
          <div class="dbg-stat__val dbg-stat__val--red" id="dbg-dim-count">0</div>
          <div class="dbg-stat__key">.dimmed</div>
        </div>
        <div class="dbg-stat">
          <div class="dbg-stat__val dbg-stat__val--green" id="dbg-snode-count">0</div>
          <div class="dbg-stat__key">.sel-node</div>
        </div>
        <div class="dbg-stat">
          <div class="dbg-stat__val dbg-stat__val--yellow" id="dbg-hl-count">0</div>
          <div class="dbg-stat__key">.highlight</div>
        </div>
      </div>
    </div>

    <!-- Pipeline integrity — confirms parser→cy.add didn't drop anything -->
    <div class="dbg-section">
      <div class="dbg-section__label">数据流对照（buildGraph → cy）</div>
      <div class="dbg-stats-grid" id="dbg-pipeline-grid">
        <div class="dbg-stat">
          <div class="dbg-stat__val" id="dbg-cy-nodes">0</div>
          <div class="dbg-stat__key">cy 节点</div>
        </div>
        <div class="dbg-stat">
          <div class="dbg-stat__val" id="dbg-cy-edges">0</div>
          <div class="dbg-stat__key">cy 边</div>
        </div>
        <div class="dbg-stat">
          <div class="dbg-stat__val" id="dbg-orphan-nodes">0</div>
          <div class="dbg-stat__key">孤立节点<br>(degree=0)</div>
        </div>
        <div class="dbg-stat">
          <div class="dbg-stat__val" id="dbg-visible-edges">0</div>
          <div class="dbg-stat__key">可见边<br>(非 .dimmed)</div>
        </div>
        <div class="dbg-stat">
          <div class="dbg-stat__val" id="dbg-bad-edges">0</div>
          <div class="dbg-stat__key">orphan 边<br>(src/tgt missing)</div>
        </div>
      </div>
    </div>

    <!-- 样式规则对照表 -->
    <div class="dbg-section">
      <div class="dbg-section__label">type → shape 对照</div>
      <div class="dbg-rules-table" id="dbg-rules-table"></div>
    </div>

    <!-- 容器 filter -->
    <div class="dbg-section">
      <div class="dbg-section__label">容器 CSS filter</div>
      <div class="dbg-filter" id="dbg-filter">(无)</div>
    </div>

    <!-- 类型覆盖率 -->
    <div class="dbg-section">
      <div class="dbg-section__label">字段覆盖率</div>
      <div class="dbg-coverage" id="dbg-coverage"></div>
    </div>

    <!-- 冲突警告 -->
    <div class="dbg-conflict" id="dbg-conflict" style="display:none"></div>

    <!-- 帮助文字 -->
    <div class="dbg-help">
      <div class="dbg-help__row"><span class="dbg-help__key">S</span><span>= :selected</span></div>
      <div class="dbg-help__row"><span class="dbg-help__key">D</span><span>= .dimmed</span></div>
      <div class="dbg-help__row"><span class="dbg-help__key">N</span><span>= .selected-node</span></div>
      <div class="dbg-help__row"><span class="dbg-help__key">H</span><span>= .highlighted</span></div>
    </div>
  `;
  document.body.appendChild(panel);
}

function styleChip(label: string, value: string, ok: boolean): string {
  const color = ok ? '#4ade80' : '#f87171';
  return `<span class="dbg-chip" style="border-color:${color}"><span class="dbg-chip__k">${label}</span><span class="dbg-chip__v" style="color:${color}">${value}</span></span>`;
}

function classBadge(cls: string, active: boolean): string {
  const color = active ? '#4ade80' : '#475569';
  return `<span class="dbg-class-badge" style="color:${color};border-color:${color}">${cls}</span>`;
}

function buildRulesTable(cy: cytoscape.Core): string {
  const rows: string[] = [];
  cy.nodes().not('.layer-parent').forEach((n: NodeSingular) => {
    const t = n.data('type') ?? '?';
    const shape = n.style('shape') as string;
    const bc = n.style('border-color') as string;
    const bw = n.style('border-width') as string;
    const w = n.data('weight') ?? '?';
    const rw = n.renderedWidth().toFixed(1);
    const label = (n.data('label') || n.id()).slice(0, 12);
    const isSelected = n.hasClass('selected-node');
    rows.push(`<tr class="${isSelected ? 'dbg-rules-table__tr--active' : ''}">
      <td class="dbg-rules-table__td">${label}</td>
      <td class="dbg-rules-table__td dbg-rules-table__td--type">${t}</td>
      <td class="dbg-rules-table__td dbg-rules-table__td--shape">${shape}</td>
      <td class="dbg-rules-table__td dbg-rules-table__td--w">wt=${w} rw=${rw}</td>
      <td class="dbg-rules-table__td">${bc}</td>
    </tr>`);
  });
  return `<table class="dbg-rules-table__table">
    <thead><tr><th>节点</th><th>type</th><th>shape</th><th>weight</th><th>border-color</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
  <div class="dbg-rules-table__count">共 ${rows.length} 个节点</div>`;
}

function nodeProps(node: NodeSingular): string {
  const shape = node.style('shape') as string;
  const bc = node.style('border-color') as string;
  const bw = node.style('border-width') as string;
  const bg = node.style('background-color') as string;
  const w = node.data('weight') ?? '?';
  const rw = node.renderedWidth().toFixed(1);
  const rh = node.renderedHeight().toFixed(1);
  const type = node.data('type') ?? '?';
  const cat = node.data('category') ?? '?';
  const layer = node.data('layer') ?? '?';
  const opacity = node.renderedStyle('opacity') as string;
  const classes = (node.classes() as string[]).join(' ');

  const shapeOk = shape !== 'ellipse' || type === 'concept';
  const bcOk = !bc.includes('255,255,255') && !bc.includes('#ffffff');

  return [
    styleChip('shape', shape, shapeOk),
    styleChip('border', `${bc} / bw=${bw}`, bcOk),
    styleChip('bgColor', bg, bg !== 'rgba(0,0,0,1)'),
    styleChip('weight', `${w} → rw=${rw}`, true),
    styleChip('rendered', `${rw}×${rh}`, true),
    `<div class="dbg-props-row">`,
    classBadge('S', node.selected()),
    classBadge('D', node.hasClass('dimmed')),
    classBadge('N', node.hasClass('selected-node')),
    classBadge('H', node.hasClass('highlighted')),
    classBadge('V', node.hasClass('hovered')),
    `</div>`,
    `<div class="dbg-props-meta">type=${type} | category=${cat} | layer=${layer} | opacity=${opacity}</div>`,
    `<div class="dbg-props-classes">cls:[${classes || '∅'}]</div>`,
  ].join('');
}

export function updateForensicPanel(renderer: Renderer): void {
  if (!debugOverlayActive) return;
  const cy = renderer.getCy();
  const panel = document.getElementById('debug-panel');
  if (!panel) return;

  // ── Stats ──────────────────────────────────────────────────────────
  const el = (id: string) => document.getElementById(id) as HTMLElement | null;
  const setEl = (id: string, val: string) => { const e = el(id); if (e) e.textContent = val; };

  setEl('dbg-sel-count', String(cy.$(':selected').length));
  setEl('dbg-dim-count', String(cy.nodes('.dimmed').not('.layer-parent').length));
  setEl('dbg-snode-count', String(cy.nodes('.selected-node').length));
  setEl('dbg-hl-count', String(cy.nodes('.highlighted').length));

  // ── Pipeline integrity ──────────────────────────────────────────
  // Surface what cytoscape actually has vs what the user would expect.
  // This is the fastest way to tell whether "no edges on screen" is a
  // rendering issue (edges exist, are dimmed) or a data issue (edges
  // never made it past cy.add).
  const allNodes = cy.nodes().not('.layer-parent');
  const allEdges = cy.edges();
  const orphanNodes = allNodes.filter((n: NodeSingular) => n.degree(false) === 0);
  const visibleEdges = allEdges.not('.dimmed');
  // Orphan edge: edge whose source or target is a layer-parent or missing —
  // would render as a line floating in space, usually a parser bug.
  const badEdges = allEdges.filter((e: cytoscape.EdgeSingular) => {
    const s = e.source();
    const t = e.target();
    return s.empty() || t.empty() || s.hasClass('layer-parent') || t.hasClass('layer-parent');
  });
  setEl('dbg-cy-nodes', String(allNodes.length));
  setEl('dbg-cy-edges', String(allEdges.length));
  setEl('dbg-orphan-nodes', String(orphanNodes.length));
  setEl('dbg-visible-edges', String(visibleEdges.length));
  setEl('dbg-bad-edges', String(badEdges.length));
  // Recolor edge counters — red if 0 (data loss), green otherwise.
  const cyEdgesEl = el('dbg-cy-edges');
  if (cyEdgesEl) {
    cyEdgesEl.classList.toggle('dbg-stat__val--red', allEdges.length === 0);
    cyEdgesEl.classList.toggle('dbg-stat__val--green', allEdges.length > 0);
  }
  const visibleEdgesEl = el('dbg-visible-edges');
  if (visibleEdgesEl) {
    const expected = allEdges.length - badEdges.length;
    visibleEdgesEl.classList.toggle('dbg-stat__val--red', visibleEdges.length === 0 && expected > 0);
    visibleEdgesEl.classList.toggle('dbg-stat__val--green', visibleEdges.length > 0);
  }

  // ── Filter ────────────────────────────────────────────────────────
  const filterEl = el('dbg-filter');
  if (filterEl) filterEl.textContent = cy.container()?.style.filter || '(无)';

  // ── Rules table ───────────────────────────────────────────────────
  const rulesEl = el('dbg-rules-table');
  if (rulesEl) rulesEl.innerHTML = buildRulesTable(cy);

  // ── Current node ───────────────────────────────────────────────────
  const snodeEls = cy.nodes('.selected-node');
  const currentNodeId = snodeEls.length > 0 ? snodeEls[0].id() : null;
  const currentNode = currentNodeId ? cy.getElementById(currentNodeId) : null;

  setEl('dbg-node-name', currentNode
    ? (currentNode.data('label') || currentNode.id()).slice(0, 20)
    : '— (无 .selected-node)');

  const metaEl = el('dbg-node-meta');
  if (metaEl) metaEl.innerHTML = currentNode
    ? `id: <code>${currentNode.id()}</code>`
    : '';

  const propsEl = el('dbg-node-props');
  if (propsEl) propsEl.innerHTML = currentNode ? nodeProps(currentNode) : '<span style="color:#64748b">点击图谱中的节点以启动取证</span>';

  // ── Prev node ─────────────────────────────────────────────────────
  const prevNode = _prevSelectedNodeId ? cy.getElementById(_prevSelectedNodeId) : null;
  setEl('dbg-prev-name', prevNode
    ? (prevNodeName(_prevSelectedNodeId) || _prevSelectedNodeId!).slice(0, 20)
    : '—');

  const prevPropsEl = el('dbg-prev-props');
  if (prevPropsEl) prevPropsEl.innerHTML = prevNode
    ? nodeProps(prevNode)
    : '';

  // ── Conflict ───────────────────────────────────────────────────────
  const conflictNodes = cy.nodes('.dimmed').filter(':selected');
  const conflictEl = el('dbg-conflict');
  if (conflictEl) {
    conflictEl.style.display = conflictNodes.length > 0 ? '' : 'none';
    if (conflictNodes.length > 0) {
      conflictEl.textContent = `⚠ 冲突: .dimmed+:selected = ${conflictNodes.length} 个`;
    }
  }

  // ── Field coverage ─────────────────────────────────────────────────
  const coverageEl = el('dbg-coverage');
  if (coverageEl) {
    const allNodes = cy.nodes().not('.layer-parent');
    const noType   = allNodes.filter((n: NodeSingular) => !n.data('type') || n.data('type') === 'default').length;
    const noCat    = allNodes.filter((n: NodeSingular) => !n.data('category') || n.data('category') === 'default').length;
    const noLayer  = allNodes.filter((n: NodeSingular) => !n.data('layer')).length;
    const total    = allNodes.length;
    const typeWarn = noType > 0 ? `<span style="color:#f87171">⚠ type 缺失: ${noType}/${total}</span>` : `<span style="color:#4ade80">✓ type 全覆盖</span>`;
    const catWarn  = noCat  > 0 ? `<span style="color:#f87171">⚠ category 缺失: ${noCat}/${total}</span>`  : `<span style="color:#4ade80">✓ category 全覆盖</span>`;
    const layerWarn= noLayer> 0 ? `<span style="color:#f87171">⚠ layer 缺失: ${noLayer}/${total}</span>` : `<span style="color:#4ade80">✓ layer 全覆盖</span>`;
    coverageEl.innerHTML = `<div style="font-size:9px;line-height:1.8">${typeWarn}<br>${catWarn}<br>${layerWarn}</div>`;
  }

  _prevSelectedNodeId = null;
  _prevSelectedNodeName = null;
}

function prevNodeName(id: string | null): string | null {
  if (!id) return null;
  // accessed via renderer cy below — this fn is only called after renderer's cy is available
  return null; // name is stored in the closure via _prevSelectedNodeName
}

export function runDebugUpdate(renderer: Renderer, highlight: HighlightEngine): void {
  if (!debugOverlayActive || !renderer) return;
  updateForensicPanel(renderer);
}
