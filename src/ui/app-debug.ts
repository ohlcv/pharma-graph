// src/ui/app-debug.ts
// 取证面板：节点样式诊断工具。
// 每次点击节点时更新，实时显示该节点的 shape/border/size/weight/category，
// 帮助判断为什么视觉样式没有按预期生效。

import cytoscape from 'cytoscape';
import type { NodeSingular } from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';
import { uiState } from './state.js';
import { PANEL_BOUNDS_KEY, clearPanelBounds } from './drag-manager.js';

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
      <div class="dbg-section__label">essence → shape 对照</div>
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

    <!-- 节点详情面板诊断（DOM / z-index / containing block / 事件监听 / saved bounds） -->
    <div class="dbg-section">
      <div class="dbg-section__label">📋 节点详情面板诊断</div>
      <div id="dbg-panel-diag" style="font-size:10.5px;line-height:1.65;color:#cbd5e1;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">—</div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button id="dbg-btn-refresh-diag" class="btn btn--ghost btn--sm" type="button">🔄 刷新诊断</button>
        <button id="dbg-btn-reset-panel-bounds" class="btn btn--ghost btn--sm" type="button" style="color:#f87171;border-color:rgba(248,113,113,0.35)">♻ 重置面板位置</button>
        <button id="dbg-btn-reposition-panel" class="btn btn--ghost btn--sm" type="button">⤴ 强制重新定位</button>
      </div>
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

  // ── Node panel diagnostic buttons ─────────────────────────────────
  panel.querySelector<HTMLButtonElement>('#dbg-btn-refresh-diag')
    ?.addEventListener('click', () => updateNodePanelDiagnostics());
  panel.querySelector<HTMLButtonElement>('#dbg-btn-reset-panel-bounds')
    ?.addEventListener('click', () => {
      clearPanelBounds();
      updateNodePanelDiagnostics();
      // Also nudge the panel back into default positioning on next open.
      const np = document.getElementById('node-panel');
      if (np) {
        np.style.left = '';
        np.style.top = '';
        np.style.right = '';
      }
    });
  panel.querySelector<HTMLButtonElement>('#dbg-btn-reposition-panel')
    ?.addEventListener('click', () => {
      clearPanelBounds();
      uiState.detailPanel?.repositionCurrent();
      updateNodePanelDiagnostics();
    });
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
  // results that don't reflect the essence mapping.
  const visible = cy.nodes().not('.layer-parent').filter((n: NodeSingular) => !n.hasClass('dimmed'));
  visible.forEach((n: NodeSingular) => {
    const t = n.data('essence') ?? '?';
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
      <td class="dbg-rules-table__td" style="font-size:9px">
        <span title="border-color: ${bc}">${bc}</span>
        <div style="color:#64748b">bc=${bc} bw=${bw}</div>
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
  const essence = node.data('essence') ?? '?';
  const opacity = node.renderedStyle('opacity') as string;
  const classes = (node.classes() as string[]).join(' ');

  const shapeOk = shape !== 'ellipse' || essence === 'medication';
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
    `<div class="dbg-props-meta">essence=${essence} | opacity=${opacity}</div>`,
    `<div class="dbg-props-classes">cls:[${classes || '∅'}]</div>`,
  ].join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// Node panel diagnostics — walks the DOM / CSS / event chain to figure out
// why the detail panel looks wrong or can't be dragged. Results are shown
// inside the 取证面板 so users on production (vercel) can self-serve.
// ═══════════════════════════════════════════════════════════════════════════

function ok(v: string): string { return `<span style="color:#4ade80">✓ ${v}</span>`; }
function warn(v: string): string { return `<span style="color:#fbbf24">⚠ ${v}</span>`; }
function bad(v: string): string { return `<span style="color:#f87171">✗ ${v}</span>`; }
function info(v: string): string { return `<span style="color:#94a3b8">${v}</span>`; }
const L = (k: string, v: string) => `<div><span style="color:#64748b">${k}</span> ${v}</div>`;

/** Walk upward from #node-panel looking for any ancestor whose CSS would
 *  trap `position: fixed` (transform / filter / will-change / perspective /
 *  contain:paint). If any is found, `position:fixed` is effectively
 *  `position:absolute` relative to that ancestor → panel is clipped /
 *  misscaled. Returns list of `[{elem, reason, value}]`. */
function findAncestorContainingBlocks(start: Element | null):
    Array<{ tag: string; id: string; reason: string; value: string }> {
  const out: Array<{ tag: string; id: string; reason: string; value: string }> = [];
  let el: Element | null = start;
  while (el && el.tagName !== 'HTML') {
    el = el.parentElement;
    if (!el) break;
    const cs = getComputedStyle(el);
    const checks: Array<[string, (v: string) => boolean]> = [
      ['transform',      (v) => v !== 'none' && v !== 'matrix(1, 0, 0, 1, 0, 0)'],
      ['filter',         (v) => v !== 'none'],
      ['will-change',    (v) => /transform|perspective|filter/.test(v) && v !== 'auto'],
      ['perspective',    (v) => v !== 'none'],
      ['contain',        (v) => /paint|layout|strict|content/.test(v) && v !== 'none'],
    ];
    for (const [name, badFn] of checks) {
      const val = (cs as any)[name];
      if (val && badFn(val)) {
        out.push({
          tag: el.tagName.toLowerCase(),
          id: (el as HTMLElement).id || '',
          reason: name,
          value: val.slice(0, 80),
        });
      }
    }
  }
  return out;
}

export function updateNodePanelDiagnostics(): void {
  const out = document.getElementById('dbg-panel-diag') as HTMLElement | null;
  if (!out) return;
  const p = document.getElementById('node-panel');
  if (!p) { out.innerHTML = bad('#node-panel 不存在于 DOM'); return; }
  const h = document.getElementById('node-panel-header');
  const cs = getComputedStyle(p);
  const hcs = h ? getComputedStyle(h) : null;
  const r = p.getBoundingClientRect();
  const hr = h ? h.getBoundingClientRect() : null;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const MIN_TOP = 56 + 44 + 8;  // topbar(56) + toolbar(44) + pad(8) = 108px

  const rows: string[] = [];

  // — 1) DOM tree position —
  const parentId = p.parentElement?.id || p.parentElement?.tagName || '?';
  const correctParent = parentId === 'app';
  rows.push(L('DOM 父级', correctParent ? ok(`#${parentId} ✓ (在 #main 外)`) : bad(`#${parentId} → 不应在 #main 内`)));

  // — 2) Containing block — position:fixed must be relative to viewport.
  const traps = findAncestorContainingBlocks(p);
  if (traps.length === 0) {
    rows.push(L('containing block', ok('viewport (无祖先 transform/filter)')));
  } else {
    rows.push(L('containing block', bad('被祖先困住 → position:fixed 实际是 absolute')));
    for (const t of traps) {
      rows.push('  ' + info(`<${t.tag}>${t.id ? '#' + t.id : ''} — ${t.reason}: ${t.value}`));
    }
  }

  // — 3) Positioning —
  const topOK = r.top >= MIN_TOP - 0.5;
  const overlapTB = r.top < 56;        // overlaps topbar (y<56 means above bottom of topbar)
  const overlapTool = r.top < (56 + 44) && r.top + r.height > 56;  // overlaps toolbar band
  const leftOK = r.left >= 0 && r.left + r.width <= vpW + 0.5;
  const topInfo = `${r.top.toFixed(0)}px (需要≥${MIN_TOP}px, topbar底=56 toolbar底=100)`;
  rows.push(L('rect.top',    topOK ? ok(topInfo) : (overlapTB ? bad(topInfo + ' ⚠ 与topbar重叠!') : warn(topInfo + ' 与toolbar重叠'))));
  rows.push(L('rect.left',   leftOK ? ok(`${r.left.toFixed(0)}px`) : warn(`${r.left.toFixed(0)}px (超出viewport左)`)));
  rows.push(L('rect size',   info(`${r.width.toFixed(0)} × ${r.height.toFixed(0)}`)));
  rows.push(L('viewport',    info(`${vpW} × ${vpH}`)));
  rows.push(L('computed position/z-index', info(`${cs.position} / z=${cs.zIndex}`)));
  rows.push(L('left/top explicit', info(`left=${cs.left} top=${cs.top} right=${cs.right}`)));

  // — 4) Classes / visibility —
  const cls = Array.from(p.classList).join('.');
  rows.push(L('classList', info(cls || '(空)')));
  rows.push(L('visibility',
    cs.visibility === 'visible' ? ok('visible') : bad(cs.visibility)));
  rows.push(L('pointer-events',
    cs.pointerEvents === 'none' ? bad('none (整面板无法接收指针!)') : ok(cs.pointerEvents)));

  // — 5) Header pointer capture test (the user drags from here) —
  if (hcs && hr) {
    rows.push(L('header 可见性',
      hcs.visibility === 'visible' ? ok('visible') : bad(hcs.visibility)));
    rows.push(L('header pointer-events',
      hcs.pointerEvents === 'none' ? bad('none → 无法拖!') : ok(hcs.pointerEvents)));
    rows.push(L('header cursor',
      /grab|grabbing|move/.test(hcs.cursor) ? ok(hcs.cursor) : warn(`${hcs.cursor} (未设置拖拽提示)`)));
    rows.push(L('header 顶部y',
      hr.top >= MIN_TOP - 0.5 ? ok(`${hr.top.toFixed(0)}px`) :
        bad(`${hr.top.toFixed(0)}px < ${MIN_TOP} → 头部在工具栏下!`)));
    rows.push(L('header 区域',
      info(`${hr.width.toFixed(0)} × ${hr.height.toFixed(0)}  (拖动手柄)`)));
    // Check if header's bounding rect overlaps topbar (0..56) / toolbar (56..100)
    if (hr.top < 56) rows.push('  ' + bad('header 伸进 topbar! topbar z-index=10 → pointerdown 会被toolbar上面元素拦截'));
    else if (hr.top < 100) rows.push('  ' + warn('header 伸进 toolbar (z-index=25) 区域 — 可能被toolbar按钮拦截'));
  }

  // — 6) localStorage saved bounds —
  try {
    const raw = localStorage.getItem(PANEL_BOUNDS_KEY);
    if (!raw) {
      rows.push(L('saved bounds', ok('(无) 每次打开都会重新定位')));
    } else {
      const v = JSON.parse(raw);
      rows.push(L('saved bounds', info(`v5: left=${v.left} top=${v.top} w=${v.width} h=${v.height}`)));
      if (typeof v.top === 'number' && v.top < MIN_TOP) {
        rows.push('  ' + bad(`saved top=${v.top} < ${MIN_TOP} → 打开时会放在工具栏区域! 点"重置面板位置"清除`));
      }
    }
  } catch (e: any) {
    rows.push(L('saved bounds', bad(`解析失败: ${e?.message || e}`)));
  }

  // — 7) Stacking context vs top bars —
  const tb = document.querySelector<HTMLElement>('.topbar');
  const tl = document.querySelector<HTMLElement>('.toolbar');
  const tbs = tb ? getComputedStyle(tb) : null;
  const tls = tl ? getComputedStyle(tl) : null;
  const pz = parseInt(cs.zIndex || '0', 10) || 0;
  const tbz = tbs ? (parseInt(tbs.zIndex || '0', 10) || 0) : 0;
  const tlz = tls ? (parseInt(tls.zIndex || '0', 10) || 0) : 0;
  rows.push(L('z-index 对比',
    `panel(z=${pz}) vs topbar(z=${tbz})${pz > tbz ? ' ✓' : ' ✗'}  vs toolbar(z=${tlz})${pz > tlz ? ' ✓' : ' ✗'}`));
  if (pz <= tlz) rows.push('  ' + bad('panel z-index ≤ toolbar → toolbar 会盖住header → 拖不动!'));

  out.innerHTML = rows.join('');
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
    const noEssence = allNodes.filter((n: NodeSingular) => !n.data('essence')).length;
    const total     = allNodes.length;
    const essenceWarn = noEssence > 0 ? `<span style="color:#f87171">⚠ essence 缺失: ${noEssence}/${total}</span>` : `<span style="color:#4ade80">✓ essence 全覆盖</span>`;
    coverageEl.innerHTML = `<div style="font-size:9px;line-height:1.8">${essenceWarn}</div>`;
  }

  // ── Node panel diagnostics ─────────────────────────────────────────
  updateNodePanelDiagnostics();

  _prevSelectedNodeId = null;
  _prevSelectedNodeName = null;
}

export function runDebugUpdate(renderer: Renderer, highlight: HighlightEngine): void {
  if (!debugOverlayActive || !renderer) return;
  updateForensicPanel(renderer);
}
