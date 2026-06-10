// src/ui/detail-panel.ts
// Node detail panel rendering and positioning.
// Pure build-function approach for consistency with mobile-panel.ts.

import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { nodeColor } from '../core/colors.js';
import { NODE_TYPE_LABEL } from '../core/config.js';
import { uiState } from './state.js';

const EDGE_TYPE_LABELS: Record<string, string> = {
  part_of: '包含',
  mechanism: '机制',
  causes: '致因',
  treats: '治疗',
  has: '含',
  relates: '关联',
  isa: '是个',
};

const LAYER_LABELS: Record<string, string> = {
  foundation: '基础层',
  system: '系统层',
  clinical: '临床层',
  service: '服务层',
};

const CATEGORY_LABELS: Record<string, string> = {
  pharmacy_practice: '药学实践',
  cardiovascular: '心血管',
  respiratory: '呼吸系统',
  digestive: '消化系统',
  endocrine: '内分泌',
  musculoskeletal: '肌肉骨骼',
  anti_infective: '抗感染',
  anti_tumor: '抗肿瘤',
  blood: '血液系统',
  immunology: '免疫系统',
  dermatology: '皮肤科',
  antipyretic: '解热镇痛',
  anti_rheumatic: '抗风湿',
  anti_gout: '抗痛风',
  nutrition: '营养',
  diagnostic: '诊断',
};

// ── Public API ────────────────────────────────────────────────────────────────

export class DetailPanel {
  private sheetOpen = false;
  private _currentNodeId: string | null = null;

  constructor(
    private cy: cytoscape.Core,
    private highlight: HighlightEngine,
    private callbacks?: {
      onNodeClick?: (nodeId: string) => void;
      onClose?: () => void;
    }
  ) {}

  show(nodeId: string): void {
    const node = this.cy.getElementById(nodeId);
    if (node.empty()) return;

    this._currentNodeId = nodeId;
    const d = node.data();
    const panel = document.getElementById('node-panel');
    if (!panel) return;

    // Build page contents
    const overviewPage = document.getElementById('lp-overview-page');
    const bodyPage = document.getElementById('lp-body-page');
    if (overviewPage) {
      overviewPage.innerHTML =
        buildHeroHtml(d) +
        buildSummaryHtml(d) +
        buildTagsHtml(d) +
        buildEdgesHtml(node, this.cy);
    }
    if (bodyPage) bodyPage.innerHTML = buildBodyHtml(d);

    // Wire tabs
    const overviewTab = document.getElementById('lp-tab-overview');
    const bodyTab = document.getElementById('lp-tab-body');
    overviewTab?.addEventListener('click', () => switchDesktopTab('overview'));
    bodyTab?.addEventListener('click', () => switchDesktopTab('body'));
    switchDesktopTab(uiState.activeTab);

    // Wire collapsible toggles (读/写 uiState.sectionState)
    overviewPage.querySelectorAll<HTMLElement>('.np-section__toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const section = toggle.closest('.np-section');
        if (!section) return;
        const label = toggle.querySelector('.np-section__label')?.textContent;
        if (!label) return;
        const key = label === '摘要' ? 'summary' : label === '标签' ? 'tags' : label === '关联' ? 'edges' : null;
        if (!key) return;
        uiState.sectionState[key] = !uiState.sectionState[key];
        const arrow = toggle.querySelector('.np-section__toggle-arrow');
        const content = section.querySelector<HTMLElement>('.np-section__content');
        if (arrow) arrow.classList.toggle('rotated', uiState.sectionState[key]);
        if (content) content.style.display = uiState.sectionState[key] ? '' : 'none';
      });
    });

    // Apply persisted section state
    overviewPage.querySelectorAll<HTMLElement>('.np-section__toggle').forEach((toggle) => {
      const label = toggle.querySelector('.np-section__label')?.textContent;
      if (!label) return;
      const key = label === '摘要' ? 'summary' : label === '标签' ? 'tags' : label === '关联' ? 'edges' : null;
      if (!key) return;
      const arrow = toggle.closest('.np-section')?.querySelector<HTMLElement>('.np-section__toggle-arrow');
      const content = toggle.closest('.np-section')?.querySelector<HTMLElement>('.np-section__content');
      if (arrow) arrow.classList.toggle('rotated', uiState.sectionState[key]);
      if (content) content.style.display = uiState.sectionState[key] ? '' : 'none';
    });

    // Wire pin button
    const pinBtn = document.getElementById('lp-btn-pin');
    pinBtn?.addEventListener('click', () => {
      uiState.isPanelPinned = !uiState.isPanelPinned;
      pinBtn.classList.toggle('active', uiState.isPanelPinned);
    });

    // Wire edge/neighbor clicks
    this.attachEdgeClickHandlers();

    panel.classList.add('visible');
    panel.style.display = 'flex';
    void panel.offsetHeight;

    if (!uiState.isPanelPinned) this.reposition(nodeId);
  }

  close(): void {
    const panel = document.getElementById('node-panel');
    if (panel) panel.classList.remove('visible');
    this._currentNodeId = null;
    this.onClose();
  }

  onClose(): void {
    this.highlight.reset();
    this.callbacks?.onClose?.();
  }

  reposition(nodeId: string): void {
    const panel = document.getElementById('node-panel');
    if (!panel || !panel.classList.contains('visible') || uiState.isPanelPinned) return;

    const node = this.cy.getElementById(nodeId);
    if (node.empty()) return;

    const W = panel.offsetWidth;
    const H = panel.offsetHeight;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const TOPBAR_H = 56;
    const PAD = 12;
    const SHEET_H = this.sheetOpen ? 56 : 0;
    const bottomReserve = SHEET_H;
    const nodePos = node.renderedPosition();
    const nodeHalfW = node.renderedWidth() / 2;
    const nodeHalfH = node.renderedHeight() / 2;
    const GAP = 12;

    const spaceRight = vpW - (nodePos.x + nodeHalfW);
    const spaceLeft = nodePos.x - nodeHalfW;
    const spaceAbove = nodePos.y - TOPBAR_H - nodeHalfH;
    const spaceBelow = vpH - nodePos.y - nodeHalfH - bottomReserve;

    const canRight = spaceRight - GAP >= W;
    const canLeft = spaceLeft - GAP >= W;
    const canAbove = spaceAbove - GAP >= H;
    const canBelow = spaceBelow - GAP >= H;

    let left: number;
    let top: number;

    if (canRight && spaceRight >= spaceLeft) {
      left = nodePos.x + nodeHalfW + GAP;
      top = Math.max(TOPBAR_H + PAD, Math.min(nodePos.y - H / 2, vpH - bottomReserve - H - PAD));
    } else if (canLeft) {
      left = nodePos.x - nodeHalfW - GAP - W;
      top = Math.max(TOPBAR_H + PAD, Math.min(nodePos.y - H / 2, vpH - bottomReserve - H - PAD));
    } else if (canAbove && spaceAbove >= spaceBelow) {
      left = Math.max(PAD, Math.min(nodePos.x - W / 2, vpW - W - PAD));
      top = nodePos.y - nodeHalfH - GAP - H;
    } else if (canBelow) {
      left = Math.max(PAD, Math.min(nodePos.x - W / 2, vpW - W - PAD));
      top = nodePos.y + nodeHalfH + GAP;
    } else {
      const scores = [
        { side: 'right', score: canRight ? spaceRight : -1 },
        { side: 'left', score: canLeft ? spaceLeft : -1 },
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

    if (left < PAD) left = PAD;
    if (left + W + PAD > vpW) left = vpW - W - PAD;
    if (top < TOPBAR_H + PAD) top = TOPBAR_H + PAD;
    if (top + H + PAD > vpH - bottomReserve) top = vpH - H - PAD - bottomReserve;

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  repositionCurrent(): void {
    if (this._currentNodeId) this.reposition(this._currentNodeId);
  }

  setSheetOpen(open: boolean): void {
    this.sheetOpen = open;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private attachEdgeClickHandlers(): void {
    const el = document.getElementById('lp-edges');
    if (!el) return;
    el.querySelectorAll<HTMLElement>('.np-edge-item, .np-neighbor').forEach((item) => {
      item.addEventListener('click', () => {
        const targetId = item.dataset['target'] ?? item.dataset['id'];
        if (!targetId) return;
        this.callbacks?.onNodeClick?.(targetId);
      });
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

// ── Build helpers ─────────────────────────────────────────────────────────────

function buildHeroHtml(d: cytoscape.NodeDataDefinition): string {
  const color = nodeColor(d.type);
  const nodeName = (d.label as string) || (d.id as string);
  const typeText = NODE_TYPE_LABEL[d.type as string] ?? (d.type as string) ?? '—';
  const layerText = d.layer ? (LAYER_LABELS[d.layer as string] ?? (d.layer as string)) : '';
  const categoryText = d.category ? (CATEGORY_LABELS[d.category as string] ?? (d.category as string)) : '';

  let location = '';
  if (d.location) {
    const loc = d.location as Record<string, string>;
    const parts = [loc.book, loc.part, loc.chapter, loc.section, loc.subsection, loc.item].filter(Boolean);
    if (parts.length > 0) location = `<div class="np-hero__location">${parts.join(' / ')}</div>`;
  }

  return `<div class="np-hero">
  <div class="np-hero__badges">
    <span class="np-badge np-badge--type" style="color:${color};border-color:${color}66;background:${color}1a">${escHtml(typeText)}</span>
    ${layerText ? `<span class="np-badge np-badge--layer">${escHtml(layerText)}</span>` : ''}
    ${categoryText ? `<span class="np-badge np-badge--category">${escHtml(categoryText)}</span>` : ''}
  </div>
  <div class="np-hero__name">${escHtml(nodeName)}</div>
  ${location}
</div>`;
}

function buildSummaryHtml(d: cytoscape.NodeDataDefinition): string {
  if (!d.summary) return '';
  return `<div class="np-section">
  <div class="np-section__toggle">
    <svg class="np-section__toggle-arrow rotated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="np-section__label">摘要</span>
  </div>
  <div class="np-section__content">
    <div class="np-summary">${escHtml(d.summary as string)}</div>
  </div>
</div>`;
}

function buildTagsHtml(d: cytoscape.NodeDataDefinition): string {
  if (!d.tags || (d.tags as string[]).length === 0) return '';
  return `<div class="np-section">
  <div class="np-section__toggle">
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

  const outHtml = outEdges.map((edge: cytoscape.EdgeSingular) => {
    const targetId = edge.data('target') as string;
    const targetNode = cy.getElementById(targetId);
    const targetLabel = targetNode.empty() ? targetId : (targetNode.data('label') || targetId);
    const edgeType = (edge.data('edgeType') as string) ?? 'relates';
    const reason = edge.data('reason') as string | undefined;
    return `<div class="np-edge-item" data-target="${escAttr(targetId)}">
  <span class="np-edge-item__type">${EDGE_TYPE_LABELS[edgeType] ?? edgeType}</span>
  <div class="np-edge-item__body">
    <div class="np-edge-item__target">${escHtml(targetLabel)}</div>
    ${reason ? `<div class="np-edge-item__reason">${escHtml(reason)}</div>` : ''}
  </div>
</div>`;
  }).join('');

  const inHtml = inEdges.map((edge: cytoscape.EdgeSingular) => {
    const srcId = edge.data('source') as string;
    const srcNode = cy.getElementById(srcId);
    const srcLabel = srcNode.empty() ? srcId : (srcNode.data('label') || srcId);
    return `<span class="np-neighbor np-neighbor--incoming" data-id="${escAttr(srcId)}">${escHtml(srcLabel)}</span>`;
  }).join('');

  const outLabel = outEdges.length > 0 ? `关联 <span class="np-count">${outEdges.length}</span>` : '';
  const inLabel = inEdges.length > 0 ? `被关联 <span class="np-count">${inEdges.length}</span>` : '';

  return `<div class="np-section">
  <div class="np-section__toggle">
    <svg class="np-section__toggle-arrow rotated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    <span class="np-section__label">关联</span>
  </div>
  <div class="np-section__content">
    ${outHtml ? `<div class="np-edges-group"><div class="np-edges-group__label">${outLabel}</div>${outHtml}</div>` : ''}
    ${inHtml ? `<div class="np-edges-group"><div class="np-edges-group__label">${inLabel}</div>${inHtml}</div>` : ''}
  </div>
</div>`;
}

function buildBodyHtml(d: cytoscape.NodeDataDefinition): string {
  if (!d.body) return '';
  const questions = parseBodyQuestions(d.body as string);
  if (questions.length === 0) return '';
  return questions.map((q) =>
    `<div class="np-question">
  <div class="np-question__label">${escHtml(q.label)}</div>
  <div class="np-question__answer">${escHtml(q.answer)}</div>
</div>`
  ).join('');
}

// ── Shared utils ──────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

function parseBodyQuestions(body: string): Array<{ label: string; answer: string }> {
  const SKIP = new Set(['它在整套框架里属于哪一层、放在哪一块？']);
  return body.split(/^## /m).slice(1)
    .map((section) => {
      const nlIdx = section.indexOf('\n');
      if (nlIdx === -1) return null;
      const label = section.slice(0, nlIdx).trim();
      const answer = section.slice(nlIdx + 1).trim();
      if (SKIP.has(label)) return null;
      return { label, answer };
    })
    .filter(Boolean) as Array<{ label: string; answer: string }>;
}
