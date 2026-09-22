// src/ui/detail-panel.ts
// Node detail panel rendering and positioning.

import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import {
  FILL_CONFIG,
  EDGE_TYPE_LABEL,
  LEVEL_LABEL,
  getLevelLabel,
  getNeutralBorderColor,
  getSubtreeBorderColor,
} from '../core/config.js';
import { DEFAULT_EDGE_TYPE, isEdgeType } from '../core/edge-types.js';
import { uiState, registerPinToggle } from './state.js';
import { forEachStatic } from './dom-cache.js';
import { UiToggle } from './ui-toggle.js';
import { restorePanelBounds, hasSavedBounds } from './drag-manager.js';
import { renderMarkdown } from './markdown.js';

// ── Public API ────────────────────────────────────────────────────────────────

export class DetailPanel {
  private _currentNodeId: string | null = null;

  private panel!: HTMLElement;
  private overviewPage!: HTMLElement;
  private bodyPage!: HTMLElement;
  private overviewTab!: HTMLElement;
  private bodyTab!: HTMLElement;
  private pinBtn!: HTMLElement;
  private pinToggle!: UiToggle;

  /**
   * Must match the `@media (max-width: 768px)` breakpoint used by
   * components.css / tour.css / glass.css for the mobile layout switch.
   * There is no CSS-custom-media in plain CSS, so this is the one place
   * that breakpoint is allowed to be a literal — every other consumer
   * (this file included) should import it from here rather than
   * re-typing 768.
   */
  private static readonly MOBILE_BREAKPOINT_PX = 768;

  /** Reads a length CSS custom property off :root as a px number.
   *  Falls back to `fallback` if the property is unset/unparsable —
   *  keeps this file working even if base.css's token block moves. */
  private static readVar(name: string, fallback: number): number {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const px = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(px) ? px : fallback;
  }

  constructor(
    private cy: cytoscape.Core,
    private highlight: HighlightEngine,
    private callbacks?: {
      onNodeClick?: (nodeId: string) => void;
      onClose?: () => void;
    },
  ) {
    const panel = document.getElementById('node-panel');
    const overviewPage = document.getElementById('lp-overview-page');
    const bodyPage = document.getElementById('lp-body-page');
    const overviewTab = document.getElementById('lp-tab-overview');
    const bodyTab = document.getElementById('lp-tab-body');
    const pinBtn = document.getElementById('lp-btn-pin');

    if (!panel || !overviewPage || !bodyPage || !overviewTab || !bodyTab || !pinBtn) {
      return;
    }

    this.panel = panel;
    this.overviewPage = overviewPage;
    this.bodyPage = bodyPage;
    this.overviewTab = overviewTab;
    this.bodyTab = bodyTab;
    this.pinBtn = pinBtn;

    // Centralised boolean toggle — owns the pin button's `active` class,
    // persistence to localStorage, and the *sole* source of truth for the
    // pinned state. Issue #6: previously this toggle also mirrored its
    // value into `uiState.isPanelPinned` and the click handler wrote the
    // mirror again, giving two write paths to keep in sync. Now the
    // toggle is registered with uiState so reads (`uiState.isPanelPinned`)
    // proxy through it, and the click handler just calls `toggle()`.
    this.pinToggle = new UiToggle({
      persist: 'detailPanel.pinned',
      cssClass: 'active',
      applyTo: this.pinBtn,
    });
    registerPinToggle(this.pinToggle);

    this.overviewTab.addEventListener('click', () => switchDesktopTab('overview'));
    this.bodyTab.addEventListener('click', () => switchDesktopTab('body'));

    this.pinBtn.addEventListener('click', () => {
      this.pinToggle.toggle();
    });

    // Summary toggle button
    this.panel.addEventListener('click', (e) => {
      const toggleBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-summary-toggle]');
      if (!toggleBtn) return;
      uiState.summaryMode = uiState.summaryMode === 'short' ? 'full' : 'short';
      if (this._currentNodeId) {
        this.show(this._currentNodeId);
      }
    });

    this.panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest<HTMLElement>('.np-edge-item, .np-neighbor');
      if (!item) return;
      const targetId = item.dataset['target'] ?? item.dataset['id'];
      if (!targetId) return;
      this.callbacks?.onNodeClick?.(targetId);
    });

    this.panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // Ignore summary toggle button — it has its own handler
      if (target.closest('[data-summary-toggle]')) return;

      const toggle = target.closest<HTMLElement>('.np-section__toggle');
      if (!toggle) return;
      const section = toggle.closest('.np-section');
      if (!section) return;
      // Read the section key from a data-attribute rather than the visible
      // label text — keeps the toggle in sync with i18n and prevents a label
      // rename from silently breaking the collapse/expand state.
      const key = (toggle.dataset['sectionKey'] ??
        toggle.closest<HTMLElement>('.np-section')?.dataset['sectionKey']) as
        'summary' | 'tags' | 'edges' | null;
      if (!key) return;
      uiState.sectionState[key] = !uiState.sectionState[key];
      const arrow = toggle.querySelector<HTMLElement>('.np-section__toggle-arrow');
      const content = section.querySelector<HTMLElement>('.np-section__content');
      if (arrow) arrow.classList.toggle('rotated', uiState.sectionState[key]);
      if (content) content.classList.toggle('u-hidden', !uiState.sectionState[key]);
    });
  }

  /**
   * 显示节点详情面板。
   * @param userInitiated - 是否为用户手动触发（点击节点/面板内邻居等）。
   *                         用户触发时重置 panelClosedByUser 标记，允许漫游自动跟随。
   *                         程序自动调用（如漫游切节点）时不应重置标记。
   */
  show(nodeId: string, userInitiated = false): void {
    const node = this.cy.getElementById(nodeId);
    if (node.empty()) return;

    this._currentNodeId = nodeId;
    // 只有用户手动触发打开面板时才重置"用户关闭过"的标记，
    // 程序自动调用（如漫游切节点）不应重置，否则用户关面板后漫游仍会弹出
    if (userInitiated) {
      uiState.panelClosedByUser = false;
    }
    const d = node.data();
    const sourcePath = typeof d.sourcePath === 'string' ? d.sourcePath : '';

    this.overviewPage.innerHTML =
      buildHeroHtml(d) + buildSummaryHtml(d) + buildEdgesHtml(node, this.cy);
    this.bodyPage.innerHTML = buildBodyHtml(d, sourcePath);

    this.applySectionState();

    const wasVisible = this.panel.classList.contains('visible');
    this.panel.classList.add('visible');

    if (!uiState.isPanelPinned) {
      // First show: pull saved bounds (if any) so the panel reopens where the
      // user left it. Subsequent shows (e.g. jumping from neighbor to neighbor)
      // keep the panel where it is — reposition would only re-clamp edges.
      if (!wasVisible) restorePanelBounds(this.panel);
      this.reposition(nodeId);
    }
  }

  close(): void {
    uiState.panelClosedByUser = true;
    this.panel.classList.remove('visible');
    this._currentNodeId = null;
    this.onClose();
  }

  /**
   * 供外部（tour prev/next）调用，漫游导航时关闭面板。
   * 不设置 panelClosedByUser，避免误标记为"用户主动关闭"。
   * 注意：这不会触发 onClose() 回调。
   */
  closeSilently(): void {
    this.panel.classList.remove('visible');
    this._currentNodeId = null;
    // 漫游导航时也需要清除图上高亮，但不走 close() 流程
    this.highlight.reset();
  }

  onClose(): void {
    forEachStatic((el) => el.classList.remove('active'), '.legend-row', '.bs-chip');
    this.highlight.reset();
    this.callbacks?.onClose?.();
  }

  reposition(nodeId: string, _W?: number, _H?: number): void {
    // Mobile: skip reposition — CSS already positions the panel correctly
    // (left: 8px, right: auto) and the reposition logic calculates wrong
    // left values for width:auto panels, causing the panel to appear
    // off-screen on first open.
    if (window.innerWidth <= DetailPanel.MOBILE_BREAKPOINT_PX) return;

    if (!this.panel.classList.contains('visible') || uiState.isPanelPinned) return;

    const pW = this.panel.offsetWidth;
    const pH = this.panel.offsetHeight;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    // glass 皮肤侧栏离右边缘 10px，面板要比侧栏左缘再留 16px 间隙。
    // CSS 默认 right: calc(var(--sidebar-width) + var(--chrome-gap) + 16px) 的构成
    // = --chrome-gap(glass 边距) + 16px(panel gap)。JS 读 --chrome-gap 跟随 token。
    const GLASS_MARGIN = DetailPanel.readVar('--chrome-gap', 10);
    const PANEL_GAP = 16;
    // 从 CSS 变量读真实侧栏宽度（components.css 的 --sidebar-width:
    // clamp(280px, 6vw + 248px, 320px)）。原来硬编码 260 在窄屏/glass 皮肤下
    // 会压到侧栏 30–70px。JS 读 CSS 变量而非复制数值，避免再次脱节。
    const SIDEBAR_W = DetailPanel.readVar('--sidebar-width', 260);
    // Must sit below the fixed topbar+toolbar chrome — read from the same
    // --chrome-h-gapped token components.css / glass.css both position off
    // of, so a future change to bar height never needs a second edit here.
    const MIN_TOP = DetailPanel.readVar('--chrome-h-gapped', 110);

    // Once the user has dragged or resized the panel, leave it where they
    // put it. We only reposition when no saved bounds exist — i.e. the
    // very first open of the session.
    if (hasSavedBounds()) return;

    const sidebarHidden = document.getElementById('sidebar')?.classList.contains('hidden') ?? true;
    const sbW = sidebarHidden ? 0 : SIDEBAR_W;
    const glassOffset = sidebarHidden ? 0 : GLASS_MARGIN;
    const left = vpW - pW - PANEL_GAP - glassOffset - sbW;
    // 默认位置：右上角——水平已经贴 viewport 右边缘 (PAD 见 --chrome-gap)，垂直贴
    // toolbar 下方(顶栏 + 工具栏 + 间距，见 --chrome-h-gapped)。
    // 不再做垂直居中，避免面板在小屏幕上盖住中心图，也跟用户预期"右上"一致。
    const top = MIN_TOP;

    this.panel.style.right = 'auto';
    this.panel.style.left = left + 'px';
    this.panel.style.top = top + 'px';
  }

  repositionCurrent(): void {
    if (this._currentNodeId) this.reposition(this._currentNodeId);
  }

  private applySectionState(): void {
    this.overviewPage.querySelectorAll<HTMLElement>('.np-section__toggle').forEach((toggle) => {
      const key = (toggle.dataset['sectionKey'] ??
        toggle.closest<HTMLElement>('.np-section')?.dataset['sectionKey']) as
        'summary' | 'tags' | 'edges' | null;
      if (!key) return;
      const arrow = toggle
        .closest('.np-section')
        ?.querySelector<HTMLElement>('.np-section__toggle-arrow');
      const content = toggle
        .closest('.np-section')
        ?.querySelector<HTMLElement>('.np-section__content');
      if (arrow) arrow.classList.toggle('rotated', uiState.sectionState[key]);
      if (content) content.classList.toggle('u-hidden', !uiState.sectionState[key]);
    });
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchDesktopTab(tab: 'overview' | 'body'): void {
  uiState.activeTab = tab;
  const overviewTab = document.getElementById('lp-tab-overview');
  const bodyTab = document.getElementById('lp-tab-body');
  const overviewPage = document.getElementById('lp-overview-page');
  const bodyPage = document.getElementById('lp-body-page');

  overviewTab?.classList.toggle('active', tab === 'overview');
  bodyTab?.classList.toggle('active', tab === 'body');
  overviewPage?.classList.toggle('u-hidden', tab !== 'overview');
  bodyPage?.classList.toggle('u-hidden', tab !== 'body');
}

// ── Color utilities ──────────────────────────────────────────────────────────

function rgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length === 6) {
    const [r, g, b] = h.match(/.{2}/g)!.map((v) => parseInt(v, 16));
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hex;
}

// ── Build helpers ─────────────────────────────────────────────────────────────

function buildHeroHtml(d: cytoscape.NodeDataDefinition): string {
  const fillVal = (d.fill as string) || '';
  const color = fillVal
    ? (FILL_CONFIG[fillVal]?.background ?? '#94a3b8')
    : '#94a3b8';
  const nodeName = (d.label as string) || (d.id as string);
  const fillText = fillVal
    ? (FILL_CONFIG[fillVal]?.label ?? fillVal)
    : '—';
  const depthVal = typeof d.depth === 'number' ? d.depth : 0;
  const depthLabel = getLevelLabel(depthVal);
  // A1：徽章色不再按 depth 取，而是按"是否属于某个子树"——
  // 有子树时用子树色（与图上一致），游离节点用中性灰 fallback。
  const subtreeRoot = typeof d.subtreeRoot === 'string' ? d.subtreeRoot : '';
  const depthColor = subtreeRoot
    ? getSubtreeBorderColor(subtreeRoot)
    : getNeutralBorderColor(depthVal);

  let location = '';
  if (d.location) {
    const loc = d.location as Record<string, string>;
    const parts = [loc.book, loc.part, loc.chapter, loc.section, loc.subsection, loc.item].filter(
      Boolean,
    );
    if (parts.length > 0) location = `<div class="np-hero__location">${parts.join(' / ')}</div>`;
  }

  // 标签渲染到徽章区域，过滤掉与 label 重复的标签
  const rawTags = d.tags as string[] | undefined;
  const filteredTags = rawTags?.filter(
    (t) => t !== nodeName && !(fillVal === 'cls-mnemonic' && t === '口诀')
  );
  const tagsHtml = filteredTags?.length
    ? filteredTags.map((t) => `<span class="np-tag np-tag--inline">${escHtml(t)}</span>`).join('')
    : '';

  return `<div class="np-hero">
  <div class="np-hero__badges">
    <span class="np-badge np-badge--type" style="color:${color};border-color:${rgba(color, 0.4)};background:${rgba(color, 0.12)}">${escHtml(fillText)}</span>
    <span class="np-badge np-badge--depth" style="color:${depthColor};border-color:${rgba(depthColor, 0.4)};background:${rgba(depthColor, 0.12)}">${escHtml(depthLabel)}</span>
  </div>
  ${tagsHtml ? `<div class="np-hero__tags">${tagsHtml}</div>` : ''}
  <div class="np-hero__name">${escHtml(nodeName)}</div>
  ${location}
</div>`;
}

function buildSummaryHtml(d: cytoscape.NodeDataDefinition): string {
  const shortSummary = d.shortSummary as string | undefined;
  const fullSummary = d.fullSummary as string | undefined;
  const hasShort = Boolean(shortSummary);
  const hasFull = Boolean(fullSummary);
  const hasBoth = hasShort && hasFull;

  // 根据当前模式决定显示哪个摘要：优先 short，没有则 fallback 到 full
  let currentSummary: string | undefined;
  if (uiState.summaryMode === 'full') {
    currentSummary = hasFull ? fullSummary : shortSummary;
  } else {
    currentSummary = hasShort ? shortSummary : fullSummary;
  }

  if (!currentSummary) return '';

  const toggleBtn = hasBoth
    ? `<button class="np-summary__toggle" data-summary-toggle>${uiState.summaryMode === 'short' ? '简短' : '详细'}</button>`
    : '';

  return `<div class="np-section" data-section-key="summary">
  <div class="np-section__toggle" data-section-key="summary">
    <svg class="np-section__toggle-arrow rotated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="np-section__label">摘要</span>
    ${toggleBtn}
  </div>
  <div class="np-section__content">
    <div class="np-summary np-markdown">${renderMarkdown(currentSummary)}</div>
  </div>
</div>`;
}

function buildEdgesHtml(node: cytoscape.NodeSingular, cy: cytoscape.Core): string {
  // Filter by data instead of building `[source = "<id>"]` selectors: node ids
  // containing quotes / backslashes would produce a malformed selector. Going
  // through connectedEdges() also makes this O(degree) instead of O(E).
  const id = node.id();
  const connected = node.connectedEdges();
  const outEdges = connected.filter((e: cytoscape.EdgeSingular) => e.data('source') === id);
  const inEdges = connected.filter((e: cytoscape.EdgeSingular) => e.data('target') === id);
  if (outEdges.length === 0 && inEdges.length === 0) return '';

  const outHtml = outEdges
    .map((edge: cytoscape.EdgeSingular) => {
      const targetId = edge.data('target') as string;
      const targetNode = cy.getElementById(targetId);
      const targetLabel = targetNode.empty() ? targetId : targetNode.data('label') || targetId;
      const edgeType = (edge.data('edgeType') as string) ?? DEFAULT_EDGE_TYPE;
      const reason = edge.data('reason') as string | undefined;
      const edgeTypeLabel = escHtml(isEdgeType(edgeType) ? EDGE_TYPE_LABEL[edgeType] : edgeType);
      return `<div class="np-edge-item" data-target="${escAttr(targetId)}">
  <span class="np-edge-item__type">${edgeTypeLabel}</span>
  <div class="np-edge-item__body">
    <div class="np-edge-item__target">${escHtml(targetLabel)}</div>
    ${reason ? `<div class="np-edge-item__reason">${escHtml(reason)}</div>` : ''}
  </div>
</div>`;
    })
    .join('');

  const inHtml = inEdges
    .map((edge: cytoscape.EdgeSingular) => {
      const srcId = edge.data('source') as string;
      const srcNode = cy.getElementById(srcId);
      const srcLabel = srcNode.empty() ? srcId : srcNode.data('label') || srcId;
      const edgeType = (edge.data('edgeType') as string) ?? DEFAULT_EDGE_TYPE;
      const reason = edge.data('reason') as string | undefined;
      const edgeTypeLabel = escHtml(isEdgeType(edgeType) ? EDGE_TYPE_LABEL[edgeType] : edgeType);
      return `<div class="np-edge-item np-edge-item--incoming" data-target="${escAttr(srcId)}">
  <span class="np-edge-item__type">${edgeTypeLabel}</span>
  <div class="np-edge-item__body">
    <div class="np-edge-item__target">${escHtml(srcLabel)}</div>
    ${reason ? `<div class="np-edge-item__reason">${escHtml(reason)}</div>` : ''}
  </div>
</div>`;
    })
    .join('');

  const outLabel =
    outEdges.length > 0 ? `关联 <span class="np-count">${outEdges.length}</span>` : '';
  const inLabel =
    inEdges.length > 0 ? `被关联 <span class="np-count">${inEdges.length}</span>` : '';

  return `<div class="np-section" data-section-key="edges">
  <div class="np-section__toggle" data-section-key="edges">
    <svg class="np-section__toggle-arrow rotated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="np-section__label">关联</span>
  </div>
  <div class="np-section__content">
    ${outHtml ? `<div class="np-edges-group"><div class="np-edges-group__label">${outLabel}</div>${outHtml}</div>` : ''}
    ${inHtml ? `<div class="np-edges-group np-edges-group--incoming"><div class="np-edges-group__label">${inLabel}</div>${inHtml}</div>` : ''}
  </div>
</div>`;
}

function buildBodyHtml(d: cytoscape.NodeDataDefinition, sourcePath: string): string {
  if (!d.body) return '';
  const questions = parseBodyQuestions(d.body as string);
  if (questions.length === 0) return '';
  return questions
    .map(
      (q) =>
        `<div class="np-question">
  <div class="np-question__label">${escHtml(q.label)}</div>
  <div class="np-question__answer np-markdown">${renderMarkdown(q.answer, sourcePath)}</div>
</div>`,
    )
    .join('');
}

// ── Shared utils ──────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Attribute values (always double-quoted in this file) need exactly the same
// escapes as element text, so there is one implementation and one alias —
// nothing to keep "in sync" by hand.
function escAttr(s: string): string {
  return escHtml(s);
}

// Sentinel placed on its own line immediately before an H2 to mark it as
// hidden from the node detail panel. Authors opt in by inserting:
//
//     <!-- @np-skip -->
//     ## 它在整套框架里属于哪一层、放在哪一块？
//     这个章节的回答...
//
// Issue #8: replacing the previous hard-coded Chinese title match.
// Coincidentally-named user sections used to be silently dropped; now the
// only way to skip is to drop this explicit marker, which is invisible in
// rendered Markdown and impossible to trigger by accident.
const PANEL_SKIP_SENTINEL = /^[ \t]*<!--\s*@np-skip\s*-->[ \t]*$/m;

export function parseBodyQuestions(body: string): Array<{ label: string; answer: string }> {
  // Find every H2 boundary and walk the body in one pass. The split+filter
  // approach loses the position information needed to check the line that
  // precedes each H2 for the sentinel.
  const out: Array<{ label: string; answer: string }> = [];
  // `re` matches "## <title>" at the start of a line. Lookahead ensures we
  // start at H2 boundaries, not arbitrary "## " inside a paragraph.
  const h2 = /^## (.*)$/gm;
  const matches: { label: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = h2.exec(body)) !== null) {
    matches.push({ label: m[1].trim(), start: m.index, end: h2.lastIndex });
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    // Answer text spans from the end of the current H2 line to the start
    // of the next H2 (or the end of the body).
    const answerStart = cur.end;
    const answerEnd = next ? next.start : body.length;
    const answer = body.slice(answerStart, answerEnd).trim();

    // Detect the sentinel on the line just before this H2.
    // The text between the previous H2's end (or body start) and this
    // H2's start is the "preamble"; if it contains the sentinel, the
    // author has flagged this section as hidden.
    const prevEnd = i === 0 ? 0 : matches[i - 1].end;
    const preamble = body.slice(prevEnd, cur.start);
    if (PANEL_SKIP_SENTINEL.test(preamble)) continue;

    out.push({ label: cur.label, answer });
  }
  return out;
}
