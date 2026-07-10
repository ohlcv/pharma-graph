// src/ui/mobile-panel.ts
// Standalone mobile bottom-drawer for node details.
// Completely independent from the desktop #node-panel.

import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { NODE_TYPE_COLOR, ESSENCE_LABEL, FIELD_COLOR, FIELD_LABEL, TIER_LABEL, NODE_TIER_STYLE } from '../core/config.js';
import { uiState } from './state.js';

const EDGE_TYPE_LABELS: Record<string, string> = {
  has: '包含', treats: '治疗', relates: '关联', isa: '属于',
};

let currentCy: cytoscape.Core | null = null;
let currentHighlight: HighlightEngine | null = null;
let onCloseCallback: (() => void) | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function showMobilePanel(
  nodeId: string,
  cy: cytoscape.Core,
  highlight: HighlightEngine,
  onClose: () => void
): void {
  currentCy = cy;
  currentHighlight = highlight;
  onCloseCallback = onClose;

  const node = cy.getElementById(nodeId);
  if (node.empty()) return;

  const overviewPage = document.getElementById('mnp-overview-page');
  const bodyPage = document.getElementById('mnp-body-page');
  if (!overviewPage || !bodyPage) return;

  const d = node.data();

  overviewPage.innerHTML = buildOverviewContent(d, node, cy, true);
  bodyPage.innerHTML = buildBodyContent(d);

  // Tab switching
  const overviewTab = document.getElementById('mnp-tab-overview');
  const bodyTab = document.getElementById('mnp-tab-body');
  overviewTab?.addEventListener('click', () => switchTab('overview'));
  bodyTab?.addEventListener('click', () => switchTab('body'));
  switchTab('overview');

  // Wire collapsible section toggles (读/写 uiState.sectionState)
  overviewPage.querySelectorAll<HTMLElement>('.np-section__toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const label = toggle.querySelector('.np-section__label')?.textContent;
      if (!label) return;
      const key = label === '摘要' ? 'summary' : label === '标签' ? 'tags' : label === '关联' ? 'edges' : null;
      if (!key) return;
      uiState.sectionState[key] = !uiState.sectionState[key];
      const arrow = toggle.querySelector('.np-section__toggle-arrow');
      const content = toggle.closest('.np-section')?.querySelector<HTMLElement>('.np-section__content');
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

  // Wire edge/neighbor clicks
  overviewPage.querySelectorAll<HTMLElement>('.np-edge-item, .np-neighbor').forEach((item) => {
    item.addEventListener('click', () => {
      const targetId = item.dataset['target'] ?? item.dataset['id'];
      if (!targetId || !currentCy) return;
      const nextNode = currentCy.getElementById(targetId);
      if (nextNode.empty()) return;
      currentHighlight?.highlightNode(targetId);
      currentCy.animate({ center: { eles: nextNode }, zoom: 1.8, duration: 350, easing: 'ease-out-cubic' });
      showMobilePanel(targetId, currentCy!, currentHighlight!, onCloseCallback!);
    });
  });

  const panel = document.getElementById('mobile-node-panel');
  if (!panel) return;

  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
  // panGraphToUpperThird removed: tour engine's onAfterCenter already handles
  // the mobile offset (pan.y + panelH * 0.4) in the 600ms animation complete callback.
}

function switchTab(tab: 'overview' | 'body'): void {
  const overviewTab = document.getElementById('mnp-tab-overview');
  const bodyTab = document.getElementById('mnp-tab-body');
  const overviewPage = document.getElementById('mnp-overview-page');
  const bodyPage = document.getElementById('mnp-body-page');

  overviewTab?.classList.toggle('active', tab === 'overview');
  bodyTab?.classList.toggle('active', tab === 'body');
  if (overviewPage) overviewPage.style.display = tab === 'overview' ? '' : 'none';
  if (bodyPage) bodyPage.style.display = tab === 'body' ? '' : 'none';
}

export function closeMobilePanel(): void {
  const panel = document.getElementById('mobile-node-panel');
  if (panel) {
    panel.classList.remove('open');
    panel.addEventListener('transitionend', () => {
      if (!panel.classList.contains('open')) {
        const overviewPage = document.getElementById('mnp-overview-page');
        const bodyPage = document.getElementById('mnp-body-page');
        if (overviewPage) overviewPage.innerHTML = '';
        if (bodyPage) bodyPage.innerHTML = '';
        currentHighlight?.reset();
        onCloseCallback?.();
      }
    }, { once: true });
  }
  document.body.style.overflow = '';
  currentCy = null;
  currentHighlight = null;
}

(window as any).closeMobileNodePanel = closeMobilePanel;

// ── Graph pan: focus node at upper 1/3 of viewport ────────────────────────────

function panGraphToUpperThird(cy: cytoscape.Core, node: cytoscape.NodeSingular): void {
  if (!node || node.empty()) return;
  const vh = cy.container()!.clientHeight;
  const panelH = vh * 0.85;
  const availableH = vh - panelH;
  const targetY = availableH / 3;

  cy.animate({
    center: { eles: node },
    zoom: 1.8,
    duration: 350,
    easing: 'ease-out-cubic',
  }, {
    done: () => {
      const nodePos = node.renderedPosition();
      const offsetY = targetY - nodePos.y;
      const pan = cy.pan();
      cy.pan({ x: pan.x, y: pan.y + offsetY });
    },
  } as cytoscape.AnimationOptions);
}

// ── Backdrop click to close ───────────────────────────────────────────────────

export function initMobilePanelBackdrop(): void {
  const backdrop = document.getElementById('mnp-backdrop');
  if (!backdrop) return;
  backdrop.addEventListener('click', closeMobilePanel);
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

// ── Content builders ─────────────────────────────────────────────────────────

function sectionToggleHtml(label: string): string {
  return `<div class="np-section__toggle">
  <svg class="np-section__toggle-arrow rotated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
  <span class="np-section__label">${label}</span>
</div>
<div class="np-section__content">`;
}

function buildOverviewContent(
  d: cytoscape.NodeDataDefinition,
  node: cytoscape.NodeSingular,
  cy: cytoscape.Core,
  collapsible = false,
): string {
  const essenceVal = (d.essence as string) || '';
  const color = essenceVal ? (NODE_TYPE_COLOR[essenceVal] ?? NODE_TYPE_COLOR.default) : '#94a3b8';

  const heroBadges = [
    badgeHtml(essenceVal ? (ESSENCE_LABEL[essenceVal] ?? essenceVal) : '—', 'np-badge--type', color),
    d.field ? badgeHtml(FIELD_LABEL[d.field as string] ?? (d.field as string), 'np-badge--field', FIELD_COLOR[d.field as string] ?? '#a78bfa') : '',
    d.tier  ? badgeHtml(TIER_LABEL[d.tier  as string] ?? (d.tier  as string), 'np-badge--tier',  NODE_TIER_STYLE[d.tier as string]?.bgColor ?? '#fbbf24') : '',
  ].join('');

  const nodeName = (d.label as string) || (d.id as string);

  let location = '';
  if (d.location) {
    const loc = d.location as Record<string, string>;
    const parts = [loc.book, loc.part, loc.chapter, loc.section, loc.subsection, loc.item].filter(Boolean);
    if (parts.length > 0) location = `<div class="np-hero__location">${parts.join(' / ')}</div>`;
  }

  let summaryHtml = '';
  if (d.summary) {
    summaryHtml = `<div class="np-section">
  ${collapsible ? sectionToggleHtml('摘要') : `<div class="np-section__label">摘要</div>`}
  ${collapsible ? '' : `<div class="np-section__content">`}
  <div class="np-summary">${escHtml(d.summary as string)}</div>
  ${collapsible ? '</div>' : '</div>'}
</div>`;
  }

  let tagsHtml = '';
  if (d.tags && (d.tags as string[]).length > 0) {
    tagsHtml = `<div class="np-section">
  ${collapsible ? sectionToggleHtml('标签') : `<div class="np-section__label">标签</div>`}
  ${collapsible ? '' : `<div class="np-section__content">`}
  <div class="np-tags">${(d.tags as string[]).map((t: string) => `<span class="np-tag">${escHtml(t)}</span>`).join('')}</div>
  ${collapsible ? '</div>' : '</div>'}
</div>`;
  }

  let edgesHtml = '';
  const outEdges = cy.edges(`[source = "${node.id()}"]`);
  const inEdges = cy.edges(`[target = "${node.id()}"]`);
  if (outEdges.length > 0 || inEdges.length > 0) {
    const outItems = outEdges.map((edge: cytoscape.EdgeSingular) => {
      const targetId = edge.data('target') as string;
      const targetNode = cy.getElementById(targetId);
      const targetLabel = targetNode.empty() ? targetId : (targetNode.data('label') || targetId);
      const edgeType = (edge.data('edgeType') as string) ?? 'relates';
      const reason = edge.data('reason') as string | undefined;
      return `<div class="np-edge-item" data-target="${escAttr(targetId)}">
  <span class="np-edge-item__type">${EDGE_TYPE_LABELS[edgeType] ?? edgeType}</span>
  <div>
    <div class="np-edge-item__target">${escHtml(targetLabel)}</div>
    ${reason ? `<div class="np-edge-item__reason">${escHtml(reason)}</div>` : ''}
  </div>
</div>`;
    }).join('');

    const inItems = inEdges.map((edge: cytoscape.EdgeSingular) => {
      const srcId = edge.data('source') as string;
      const srcNode = cy.getElementById(srcId);
      const srcLabel = srcNode.empty() ? srcId : (srcNode.data('label') || srcId);
      return `<span class="np-neighbor" data-id="${escAttr(srcId)}">${escHtml(srcLabel)}</span>`;
    }).join('');

    edgesHtml = `<div class="np-section">
  ${collapsible ? sectionToggleHtml('关联') : `<div class="np-section__label">关联</div>`}
  ${collapsible ? '' : `<div class="np-section__content">`}
  ${outItems ? `<div class="np-edges-group__label">关联 <span class="np-count">${outEdges.length}</span></div>${outItems}` : ''}
  ${inItems ? `<div class="np-edges-group__label">被关联 <span class="np-count">${inEdges.length}</span></div>${inItems}` : ''}
  ${collapsible ? '</div>' : '</div>'}
</div>`;
  }

  return `<div class="np-hero">
  <div class="np-hero__badges">${heroBadges}</div>
  <div class="np-hero__name">${escHtml(nodeName)}</div>
  ${location}
</div>
${summaryHtml}
${tagsHtml}
${edgesHtml}`;
}

function buildBodyContent(d: cytoscape.NodeDataDefinition): string {
  if (!d.body) return '';
  const questions = parseBodyQuestions(d.body as string);
  if (questions.length === 0) return '';
  return `<div class="np-section np-section--body">
  ${questions.map((q) => `<div class="np-question">
  <div class="np-question__label">${escHtml(q.label)}</div>
  <div class="np-question__answer">${escHtml(q.answer)}</div>
</div>`).join('')}
</div>`;
}

function badgeHtml(text: string, cssClass: string, color: string): string {
  return `<span class="np-badge ${cssClass}" style="color:${color};border-color:${rgba(color,0.4)};background:${rgba(color,0.12)}">${escHtml(text)}</span>`;
}

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
