// src/ui/detail-panel.ts
// Node detail panel rendering and positioning.

import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import {
  NODE_TYPE_COLOR,
  ESSENCE_LABEL,
  FIELD_COLOR,
  FIELD_LABEL,
  TIER_LABEL,
  NODE_TIER_STYLE,
  EDGE_TYPE_LABEL,
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
      if (content) content.style.display = uiState.sectionState[key] ? '' : 'none';
    });
  }

  show(nodeId: string): void {
    const node = this.cy.getElementById(nodeId);
    if (node.empty()) return;

    this._currentNodeId = nodeId;
    const d = node.data();
    const sourcePath = typeof d.sourcePath === 'string' ? d.sourcePath : '';

    this.overviewPage.innerHTML =
      buildHeroHtml(d) + buildSummaryHtml(d) + buildTagsHtml(d) + buildEdgesHtml(node, this.cy);
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
    this.panel.classList.remove('visible');
    this._currentNodeId = null;
    this.onClose();
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
    if (window.innerWidth <= 768) return;

    if (!this.panel.classList.contains('visible') || uiState.isPanelPinned) return;

    const pW = this.panel.offsetWidth;
    const pH = this.panel.offsetHeight;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const PAD = 8;
    const SIDEBAR_W = 260;
    // Must sit below topbar(56) + toolbar(44) = 100px so panel header never
    // overlaps the top bars visually or event-wise.
    const MIN_TOP = 108;

    // Once the user has dragged or resized the panel, leave it where they
    // put it. We only reposition when no saved bounds exist — i.e. the
    // very first open of the session.
    if (hasSavedBounds()) return;

    const sbW = (document.getElementById('sidebar')?.classList.contains('hidden') ?? true) ? 0 : SIDEBAR_W;
    const left = vpW - pW - PAD - sbW;
    const top = Math.max(MIN_TOP, Math.round((vpH - pH) / 2));

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
      if (content) content.style.display = uiState.sectionState[key] ? '' : 'none';
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
  if (overviewPage) overviewPage.style.display = tab === 'overview' ? '' : 'none';
  if (bodyPage) bodyPage.style.display = tab === 'body' ? '' : 'none';
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
  const essenceVal = (d.essence as string) || '';
  const color = essenceVal ? (NODE_TYPE_COLOR[essenceVal] ?? NODE_TYPE_COLOR.default) : '#94a3b8';
  const nodeName = (d.label as string) || (d.id as string);
  const essenceText = essenceVal ? (ESSENCE_LABEL[essenceVal] ?? essenceVal) : '—';
  const fieldColor = d.field ? (FIELD_COLOR[d.field as string] ?? '#a78bfa') : '';
  const fieldText = d.field ? (FIELD_LABEL[d.field as string] ?? (d.field as string)) : '';
  const tierText = d.tier ? (TIER_LABEL[d.tier as string] ?? (d.tier as string)) : '';
  const tierColor = d.tier ? (NODE_TIER_STYLE[d.tier as string]?.bgColor ?? '#fbbf24') : '';

  let location = '';
  if (d.location) {
    const loc = d.location as Record<string, string>;
    const parts = [loc.book, loc.part, loc.chapter, loc.section, loc.subsection, loc.item].filter(
      Boolean,
    );
    if (parts.length > 0) location = `<div class="np-hero__location">${parts.join(' / ')}</div>`;
  }

  return `<div class="np-hero">
  <div class="np-hero__badges">
    <span class="np-badge np-badge--type" style="color:${color};border-color:${rgba(color, 0.4)};background:${rgba(color, 0.12)}">${escHtml(essenceText)}</span>
    ${fieldText ? `<span class="np-badge np-badge--field" style="color:${fieldColor};border-color:${rgba(fieldColor, 0.4)};background:${rgba(fieldColor, 0.1)}">${escHtml(fieldText)}</span>` : ''}
    ${tierText && tierColor ? `<span class="np-badge np-badge--tier" style="color:${tierColor};border-color:${rgba(tierColor, 0.4)};background:${rgba(tierColor, 0.12)}">${escHtml(tierText)}</span>` : ''}
  </div>
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

  // 根据当前模式决定显示哪个摘要
  const currentSummary =
    (uiState.summaryMode === 'full' && hasFull) ? fullSummary : shortSummary;

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

function buildTagsHtml(d: cytoscape.NodeDataDefinition): string {
  if (!d.tags || (d.tags as string[]).length === 0) return '';
  return `<div class="np-section" data-section-key="tags">
  <div class="np-section__toggle" data-section-key="tags">
    <svg class="np-section__toggle-arrow rotated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="np-section__label">标签</span>
  </div>
  <div class="np-section__content">
    <div class="np-tags">${(d.tags as string[]).map((t) => `<span class="np-tag">${escHtml(t)}</span>`).join('')}</div>
  </div>
</div>`;
}

function buildEdgesHtml(node: cytoscape.NodeSingular, cy: cytoscape.Core): string {
  const outEdges = cy.edges(`[source = "${node.id()}"]`);
  const inEdges = cy.edges(`[target = "${node.id()}"]`);
  if (outEdges.length === 0 && inEdges.length === 0) return '';

  const outHtml = outEdges
    .map((edge: cytoscape.EdgeSingular) => {
      const targetId = edge.data('target') as string;
      const targetNode = cy.getElementById(targetId);
      const targetLabel = targetNode.empty() ? targetId : targetNode.data('label') || targetId;
      const edgeType = (edge.data('edgeType') as string) ?? DEFAULT_EDGE_TYPE;
      const reason = edge.data('reason') as string | undefined;
      const edgeTypeLabel = isEdgeType(edgeType) ? EDGE_TYPE_LABEL[edgeType] : edgeType;
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
      const edgeTypeLabel = isEdgeType(edgeType) ? EDGE_TYPE_LABEL[edgeType] : edgeType;
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

function escAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
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
