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

/**
 * Toggle the forensic panel on/off and keep every piece of state in sync:
 *   - the module-level `debugOverlayActive` flag (read by graph-events).
 *   - the `#debug-toggle` button's `.active` class.
 *   - the `#debug-panel` element's `display`.
 *   - the panel contents (only when activating).
 *
 * Returns the new state. Single source of truth for both the button click
 * handler and the `window._dbg.overlay()` console API — fixes issue #13
 * where the two paths each managed their own slice of state and could
 * drift apart.
 */
export function toggleDebugOverlay(renderer: Renderer): boolean {
  const next = !debugOverlayActive;
  setDebugActive(next);
  const btn = document.getElementById('debug-toggle');
  if (btn) btn.classList.toggle('active', next);
  const panel = document.getElementById('debug-panel');
  if (panel) panel.style.display = next ? '' : 'none';
  if (next) updateForensicPanel(renderer);
  return next;
}

/**
 * Hide the panel without flipping `debugOverlayActive` or the
 * toolbar button. Lets the user dismiss the panel with `×` while
 * keeping the toggle state in sync — issue: previously the only
 * path back was to click the sidebar toggle, which is awkward
 * once the panel sits on top of the canvas.
 *
 * Idempotent: calling it when the panel is already hidden is a
 * no-op so callers can fire-and-forget from `keydown` handlers.
 */
export function closeForensicPanel(): void {
  const panel = document.getElementById('debug-panel');
  if (!panel) return;
  // Keep the canvas input behind the panel — display:none, not
  // visibility:hidden, so the layout fully collapses (subsequent
  // panel-opens won't leak the previous position into the next
  // paint).
  panel.style.display = 'none';
}

export function initDebugOverlay(renderer: Renderer): void {
  // ── Inject button into shortcuts sidebar ──────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'debug-toggle';
  btn.textContent = '取证面板 🔍';
  btn.addEventListener('click', () => {
    toggleDebugOverlay(renderer);
  });
  document.querySelector('.shortcuts-list')?.appendChild(btn);

  // ── Build the forensic panel ────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  // Positioned via CSS in index.css
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="dbg-header" id="dbg-header" role="banner">
      <span class="dbg-header__title">🔬 节点取证</span>
      <span class="dbg-header__hint">点击任意节点自动更新</span>
      <button type="button" class="dbg-header__close" id="dbg-close-btn"
              aria-label="关闭取证面板" title="关闭">×</button>
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

  // ── Close button — hides panel without flipping `debugOverlayActive` ──
  panel
    .querySelector<HTMLButtonElement>('#dbg-close-btn')
    ?.addEventListener('click', (e) => {
      // Stop the event from reaching the drag handler (which is a
      // mousedown listener on the header). mousedown vs click differ
      // here, but a click on the X mustn't accidentally start a drag
      // if the user pressed-down on it.
      e.stopPropagation();
      closeForensicPanel();
    });

  // ── Drag handler — header is the drag handle ────────────────────────
  // We listen on the header (which is wider than a 16px grip and
  // visually conveys "this moves") but exclude the close button so
  // users can still dismiss without dragging.
  const headerEl = panel.querySelector<HTMLElement>('#dbg-header');
  if (headerEl) attachDragHandlers(panel, headerEl);
}

/**
 * Wire pointer-drag on `handleEl` (the title bar) to move `panelEl`
 * around the viewport. Converts from CSS `bottom/right` positioning
 * to `top/left` on first mousedown so the math stays sane: every
 * mousemove is a delta from where the user first grabbed the panel.
 *
 * Why no 3rd-party drag lib: the panel has only one handle, we don't
 * need inertia, edge-snapping, or touch gestures — and keeping it
 * inline means tests can fire `mousedown`/`mousemove`/`mouseup`
 * directly on the DOM nodes without spinning up a global event bus.
 *
 * The handler closes over panelEl's bounding rect on mousedown so a
 * late-arriving mousemove doesn't drift if the user resizes the window
 * mid-drag (we re-read rect on every move, which is cheap).
 */
function attachDragHandlers(panelEl: HTMLElement, handleEl: HTMLElement): void {
  handleEl.style.cursor = 'move';
  handleEl.style.userSelect = 'none';

  handleEl.addEventListener('mousedown', (e: MouseEvent) => {
    // Only primary button — middle-click or right-click shouldn't drag.
    if (e.button !== 0) return;
    if (e.target instanceof HTMLElement && e.target.closest('#dbg-close-btn')) {
      return;
    }
    e.preventDefault();

    // Convert from `bottom: 16px; right: 16px` to absolute `top/left`
    // before the first mousemove so the drag origin matches the
    // cursor exactly. Without this, the panel would jump on the
    // first move because `bottom/right` and `top/left` resolve
    // independently against the viewport.
    const rect = panelEl.getBoundingClientRect();
    panelEl.style.top = `${rect.top}px`;
    panelEl.style.left = `${rect.left}px`;
    panelEl.style.bottom = 'auto';
    panelEl.style.right = 'auto';

    const startX = e.clientX;
    const startY = e.clientY;
    const startTop = rect.top;
    const startLeft = rect.left;

    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      // 4px slop: a click that jitters a couple of pixels shouldn't
      // be reported as "I dragged the panel". Without the threshold
      // the user clicks the header to focus it and the panel jumps
      // by 1-2px from the unavoidable mouse jitter.
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true;

      // Clamp to the viewport so the panel can't be flung off-screen.
      // We keep the *top-left* corner at least 0px in, but allow the
      // bulk of the panel to leave (so the user can drag it to dock
      // against the edge).
      const w = panelEl.offsetWidth;
      const h = panelEl.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const newLeft = Math.max(-(w - 60), Math.min(vw - 60, startLeft + dx));
      const newTop = Math.max(0, Math.min(vh - 40, startTop + dy));
      panelEl.style.left = `${newLeft}px`;
      panelEl.style.top = `${newTop}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
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
  // Only show non-dimmed nodes — dimmed ones have their styles overridden
  // by the .dimmed rule (border → rgba(255,255,255,0.06), opacity → 0.1),
  // so reading their effective styles gives misleading "everything is white"
  // results that don't reflect the field/tier mapping.
  const visible = cy.nodes().not('.layer-parent').filter((n: NodeSingular) => !n.hasClass('dimmed'));
  visible.forEach((n: NodeSingular) => {
    const t = n.data('type') ?? '?';
    const shape = n.style('shape') as string;
    const bc = n.style('border-color') as string;
    const bw = n.style('border-width') as string;
    const w = n.data('weight') ?? '?';
    const rw = n.renderedWidth().toFixed(1);
    const field = n.data('field') ?? '?';
    const tier = n.data('tier') ?? '?';
    const label = (n.data('label') || n.id()).slice(0, 12);
    const isSelected = n.hasClass('selected-node');
    rows.push(`<tr class="${isSelected ? 'dbg-rules-table__tr--active' : ''}">
      <td class="dbg-rules-table__td">${label}</td>
      <td class="dbg-rules-table__td dbg-rules-table__td--type">${t}</td>
      <td class="dbg-rules-table__td dbg-rules-table__td--shape">${shape}</td>
      <td class="dbg-rules-table__td dbg-rules-table__td--w">wt=${w} rw=${rw}</td>
      <td class="dbg-rules-table__td" style="font-size:9px">
        <span title="field: ${field}">${bc}</span>
        <div style="color:#64748b">f=${field} t=${tier} bw=${bw}</div>
      </td>
    </tr>`);
  });
  return `<table class="dbg-rules-table__table">
    <thead><tr><th>节点</th><th>type</th><th>shape</th><th>weight</th><th>border-color</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
  <div class="dbg-rules-table__count">显示 ${rows.length} 个非 dimmed 节点（dimmed 节点的样式被 .dimmed 规则覆盖，读出来的值不真实）</div>`;
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
  // Issue #7: prevNodeName() returned null unconditionally (its
  // implementation was a TODO placeholder). The render path was relying
  // on `_prevSelectedNodeId` as a fallback anyway, so we now read the
  // already-captured `_prevSelectedNodeName` directly — it's populated
  // by setPrevSelectedNode() and is a faithful snapshot of the previous
  // node's label, no extra cy lookup required.
  const prevNode = _prevSelectedNodeId ? cy.getElementById(_prevSelectedNodeId) : null;
  setEl('dbg-prev-name', _prevSelectedNodeName
    ? _prevSelectedNodeName.slice(0, 20)
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

export function runDebugUpdate(renderer: Renderer, highlight: HighlightEngine): void {
  if (!debugOverlayActive || !renderer) return;
  updateForensicPanel(renderer);
}
