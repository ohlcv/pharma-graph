// src/ui/detail-panel.ts
// Node detail panel rendering and positioning.
// Consumes HighlightEngine for interactive navigation.

import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { nodeColor } from '../core/colors.js';
import { NODE_TYPE_LABEL } from '../core/config.js';

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

interface BodyQuestion {
  label: string;
  answer: string;
}

export class DetailPanel {
  private sheetOpen = false;

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

    const d = node.data();
    const color = nodeColor(d.type);
    const panel = document.getElementById('node-panel');
    if (!panel) return;

    this.renderTypeBadge(d.type, color);
    this.renderLayerBadge(d.layer as string | undefined);
    this.renderNodeName(d.label || d.id);
    this.renderLocation(d.location as Record<string, string> | undefined);
    this.renderSummary(d.summary as string | undefined);
    this.renderTags(d.tags as string[] | undefined);
    this.renderEdges(node);
    this.renderCategoryBadge(d.category as string | undefined);
    this.renderBody(d.body as string | undefined);

    panel.classList.add('visible');
    panel.style.display = 'flex';
    void panel.offsetHeight;

    this.reposition(nodeId);
  }

  close(): void {
    const panel = document.getElementById('node-panel');
    if (panel) panel.classList.remove('visible');
    this.onClose();
  }

  onClose(): void {
    this.highlight.reset();
    this.callbacks?.onClose?.();
  }

  reposition(nodeId: string): void {
    const panel = document.getElementById('node-panel');
    if (!panel || !panel.classList.contains('visible')) return;
    if (window.innerWidth <= 640) return; // Mobile uses CSS drawer positioning

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

    this.attachEdgeClickHandlers();
  }

  setSheetOpen(open: boolean): void {
    this.sheetOpen = open;
  }

  // ── Private render helpers ────────────────────────────────────────────────

  private renderTypeBadge(type: string, color: string): void {
    const badge = document.getElementById('lp-type-badge');
    if (badge) {
      badge.textContent = NODE_TYPE_LABEL[type] ?? type ?? '—';
      badge.style.color = color;
      badge.style.borderColor = color + '66';
      badge.style.background = color + '1a';
    }
  }

  private renderLayerBadge(layer: string | undefined): void {
    const badge = document.getElementById('lp-layer-badge');
    if (badge) {
      if (layer) {
        badge.textContent = LAYER_LABELS[layer] ?? layer;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  private renderNodeName(name: string): void {
    const el = document.getElementById('lp-node-name');
    if (el) el.textContent = name;
  }

  private renderLocation(loc: Record<string, string> | undefined): void {
    const el = document.getElementById('lp-location');
    if (!el) return;
    if (!loc) { el.style.display = 'none'; return; }
    const parts = [loc.book, loc.part, loc.chapter, loc.section, loc.subsection, loc.item].filter(Boolean);
    const text = parts.join(' / ');
    el.textContent = text;
    el.style.display = text ? '' : 'none';
  }

  private renderSummary(summary: string | undefined): void {
    const section = document.getElementById('lp-summary-section');
    const el = document.getElementById('lp-summary');
    const toggle = document.getElementById('lp-summary-toggle');
    if (!section || !el || !toggle) return;

    if (summary) {
      section.style.display = '';
      el.textContent = summary;
      // Wire collapsible (default: expanded)
      const newToggle = toggle.cloneNode(true) as HTMLElement;
      toggle.parentNode?.replaceChild(newToggle, toggle);
      newToggle.addEventListener('click', () => {
        const expanded = newToggle.classList.toggle('expanded');
        el.style.display = expanded ? '' : 'none';
        newToggle.querySelector('.np-section__toggle-arrow')?.classList.toggle('rotated', expanded);
      });
      newToggle.classList.add('expanded');
    } else {
      section.style.display = 'none';
    }
  }

  private renderTags(tags: string[] | undefined): void {
    const section = document.getElementById('lp-tags-section');
    const el = document.getElementById('lp-tags');
    const toggle = document.getElementById('lp-tags-toggle');
    if (!section || !el || !toggle) return;
    const list = tags ?? [];
    if (list.length > 0) {
      section.style.display = '';
      el.innerHTML = list.map((t) => `<span class="np-tag">${t}</span>`).join('');
      // Collapsible (default: expanded)
      const newToggle = toggle.cloneNode(true) as HTMLElement;
      toggle.parentNode?.replaceChild(newToggle, toggle);
      newToggle.addEventListener('click', () => {
        const expanded = newToggle.classList.toggle('expanded');
        el.style.display = expanded ? '' : 'none';
        newToggle.querySelector('.np-section__toggle-arrow')?.classList.toggle('rotated', expanded);
      });
      newToggle.classList.add('expanded');
    } else {
      section.style.display = 'none';
    }
  }

  private renderEdges(node: cytoscape.NodeSingular): void {
    const section = document.getElementById('lp-edges-section');
    const el = document.getElementById('lp-edges');
    if (!section || !el) return;

    const outEdges = this.cy.edges(`[source = "${node.id()}"]`);
    const inEdges = this.cy.edges(`[target = "${node.id()}"]`);

    if (outEdges.length === 0 && inEdges.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';

    const outHtml = outEdges.map((edge: cytoscape.EdgeSingular) => {
      const targetId = edge.data('target') as string;
      const targetNode = this.cy.getElementById(targetId);
      const targetLabel = targetNode.empty() ? targetId : (targetNode.data('label') || targetId);
      const edgeType = (edge.data('edgeType') as string) ?? 'relates';
      const reason = edge.data('reason') as string | undefined;
      return `<div class="np-edge-item" data-target="${targetId}">
        <span class="np-edge-item__type">${EDGE_TYPE_LABELS[edgeType] ?? edgeType}</span>
        <div class="np-edge-item__body">
          <div class="np-edge-item__target">${targetLabel}</div>
          ${reason ? `<div class="np-edge-item__reason">${reason}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    const inHtml = inEdges.map((edge: cytoscape.EdgeSingular) => {
      const srcId = edge.data('source') as string;
      const srcNode = this.cy.getElementById(srcId);
      const srcLabel = srcNode.empty() ? srcId : (srcNode.data('label') || srcId);
      return `<span class="np-neighbor np-neighbor--incoming" data-id="${srcId}">${srcLabel}</span>`;
    }).join('');

    const outLabel = outEdges.length > 0 ? `关联 <span class="np-count">${outEdges.length}</span>` : '';
    const inLabel = inEdges.length > 0 ? `被关联 <span class="np-count">${inEdges.length}</span>` : '';

    el.innerHTML =
      `<div class="np-edges-group">${outLabel ? `<div class="np-edges-group__label">${outLabel}</div>` : ''}${outHtml}</div>` +
      `<div class="np-edges-group">${inLabel ? `<div class="np-edges-group__label">${inLabel}</div>` : ''}${inHtml}</div>`;

    // Collapsible toggle
    const toggle = document.getElementById('lp-edges-toggle');
    const edgesContent = document.getElementById('lp-edges');
    if (toggle && edgesContent) {
      edgesContent.style.display = 'none';
      const newToggle = toggle.cloneNode(true) as HTMLElement;
      toggle.parentNode?.replaceChild(newToggle, toggle);
      newToggle.addEventListener('click', () => {
        const expanded = newToggle.classList.toggle('expanded');
        edgesContent.style.display = expanded ? '' : 'none';
        newToggle.querySelector('.np-section__toggle-arrow')?.classList.toggle('rotated', expanded);
      });
    }
  }

  private renderCategoryBadge(category: string | undefined): void {
    const badge = document.getElementById('lp-category-badge');
    if (!badge) return;
    if (category) {
      badge.textContent = CATEGORY_LABELS[category] ?? category;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  private renderBody(body: string | undefined): void {
    const section = document.getElementById('lp-body-section');
    const content = document.getElementById('lp-body-content');
    const toggle = document.getElementById('lp-body-toggle');
    if (!section || !content || !toggle) return;

    if (!body) { section.style.display = 'none'; return; }

    const questions = this.parseBodyQuestions(body);
    if (questions.length === 0) { section.style.display = 'none'; return; }

    section.style.display = '';
    content.innerHTML = questions.map((q) =>
      `<div class="np-question">
        <div class="np-question__label">${q.label}</div>
        <div class="np-question__answer">${q.answer}</div>
      </div>`
    ).join('');

    content.style.display = 'none';
    const newToggle = toggle.cloneNode(true) as HTMLElement;
    toggle.parentNode?.replaceChild(newToggle, toggle);
    newToggle.addEventListener('click', () => {
      const expanded = newToggle.classList.toggle('expanded');
      content.style.display = expanded ? '' : 'none';
      newToggle.querySelector('.np-section__toggle-arrow')?.classList.toggle('rotated', expanded);
    });
  }

  private parseBodyQuestions(body: string): BodyQuestion[] {
    const SKIP_LABELS = new Set(['它在整套框架里属于哪一层、放在哪一块？']);
    const sections = body.split(/^## /m).slice(1);
    return sections
      .map((section) => {
        const nlIdx = section.indexOf('\n');
        if (nlIdx === -1) return null;
        const label = section.slice(0, nlIdx).trim();
        const answer = section.slice(nlIdx + 1).trim();
        if (SKIP_LABELS.has(label)) return null;
        return { label, answer };
      })
      .filter(Boolean) as BodyQuestion[];
  }

  private attachEdgeClickHandlers(): void {
    const el = document.getElementById('lp-edges');
    if (!el) return;
    el.querySelectorAll<HTMLElement>('.np-edge-item, .np-neighbor').forEach((item) => {
    item.addEventListener('click', () => {
      const targetId = (item as HTMLElement).dataset['target']
        ?? (item as HTMLElement).dataset['id'];
      if (!targetId) return;
      this.callbacks?.onNodeClick?.(targetId);
    });
    });
  }
}
