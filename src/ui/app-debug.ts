import cytoscape from 'cytoscape';
import type { NodeSingular, EdgeSingular } from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { HighlightEngine } from './highlight-engine.js';

let debugOverlayActive = false;
let debugRafId: number | null = null;
let _prevSelectedNodeId: string | null = null;
let _prevSelectedNodeName: string | null = null;
let debugLastState = '';

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

export function initDebugOverlay(): void {
  const btn = document.createElement('button');
  btn.id = 'debug-toggle';
  btn.textContent = '调试状态 🔍';
  btn.addEventListener('click', () => {
    const active = btn.classList.toggle('active');
    const panel = document.getElementById('debug-panel');
    if (panel) panel.style.display = active ? '' : 'none';
    if (active) {
      debugOverlayActive = true;
        if (!document.getElementById('debug-overlay')) {
          const overlay = document.createElement('div');
          overlay.id = 'debug-overlay';
          renderer?.getCy().container()?.appendChild(overlay);
        }
    } else {
      debugOverlayActive = false;
      if (debugRafId !== null) { cancelAnimationFrame(debugRafId); debugRafId = null; }
      const ov = document.getElementById('debug-overlay');
      if (ov) ov.innerHTML = '';
    }
  });
  document.querySelector('.shortcuts-list')?.appendChild(btn);
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <h4>🔬 取证面板</h4>
    <div id="dbg-raw-data" style="font-size:9px;color:#fbbf24;background:rgba(251,191,36,0.08);border-radius:4px;padding:4px 6px;margin-bottom:8px;line-height:1.6"></div>
    <div style="margin-bottom:8px"><span style="color:#94a3b8;font-size:10px">容器 filter</span><div id="dbg-filter" style="font-size:10px;color:#e2e8f0;word-break:break-all"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;margin-bottom:8px">
      <div style="text-align:center;background:rgba(99,102,241,0.1);border-radius:6px;padding:4px 6px"><div style="font-size:9px;color:#64748b">:selected</div><div id="dbg-sel-count" style="font-size:14px;color:#818cf8;font-weight:700">0</div></div>
      <div style="text-align:center;background:rgba(239,68,68,0.1);border-radius:6px;padding:4px 6px"><div style="font-size:9px;color:#64748b">.dimmed</div><div id="dbg-dim-count" style="font-size:14px;color:#f87171;font-weight:700">0</div></div>
      <div style="text-align:center;background:rgba(34,197,94,0.1);border-radius:6px;padding:4px 6px"><div style="font-size:9px;color:#64748b">.sel-node</div><div id="dbg-snode-count" style="font-size:14px;color:#4ade80;font-weight:700">0</div></div>
      <div style="text-align:center;background:rgba(251,191,36,0.1);border-radius:6px;padding:4px 6px"><div style="font-size:9px;color:#64748b">.highlight</div><div id="dbg-hl-count" style="font-size:14px;color:#fbbf24;font-weight:700">0</div></div>
    </div>
    <div style="margin-bottom:8px"><span style="color:#94a3b8;font-size:10px">所有 :selected</span><div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px" id="dbg-all-selected"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
      <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:6px;padding:6px 8px"><div style="font-size:10px;color:#4ade80;font-weight:700;margin-bottom:4px">✨ 新主角</div><div id="dbg-new-name" style="font-size:10px;color:#e2e8f0;font-weight:700;margin-bottom:4px">—</div><div style="font-size:9px;color:#94a3b8;line-height:1.6" id="dbg-new-props"></div></div>
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:6px 8px"><div style="font-size:10px;color:#f87171;font-weight:700;margin-bottom:4px">⏮ 旧主角</div><div id="dbg-old-name" style="font-size:10px;color:#e2e8f0;font-weight:700;margin-bottom:4px">—</div><div style="font-size:9px;color:#94a3b8;line-height:1.6" id="dbg-old-props"></div></div>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;margin-bottom:6px"><div style="font-size:10px;color:#64748b;margin-bottom:4px">🔸 所有 .dimmed 节点（逐行）</div><div id="dbg-all-dimmed" style="font-size:9px;line-height:1.7;max-height:180px;overflow-y:auto"></div></div>
    <div class="debug-conflict" id="dbg-conflict" style="display:none"></div>`;
  document.body.appendChild(panel);
}

function isDimmedAndSelected(node: NodeSingular): boolean {
  return node.hasClass('dimmed') && node.selected();
}

function nodeForensicProps(node: NodeSingular): string {
  if (node.removed()) return '<span style="color:#64748b">⚠ 节点已移除</span>';
  const bc = node.renderedStyle('border-color') as string;
  const bw = node.renderedStyle('border-width') as string;
  const isWhite = bc === '#ffffff' || bc === 'rgb(255,255,255)' || bc === 'rgba(255,255,255,1)' || bc === 'white';
  const isSelectedBorderWidth = typeof bw === 'number' && bw >= 2.5;
  const flag = (cond: boolean, t: string, ok: string, fail: string) =>
    cond ? `<span style="color:#4ade80">${t}${ok}</span>` : `<span style="color:#64748b">${t}${fail}</span>`;
  const borderStatus = isWhite ? `<span style="color:#f87171">⚠ 白边!</span>` : `<span style="color:#4ade80">✓</span>`;
  const bwStatus = isSelectedBorderWidth ? `<span style="color:#fbbf24">⚠ 粗边(${bw})</span>` : bw;
  const classes = (node.classes() as string[]).join(' ');
  return [
    flag(node.selected(), 'S:', '✓', '✗'),
    flag(node.hasClass('dimmed'), 'D:', '✓', '✗'),
    flag(node.hasClass('selected-node'), 'N:', '✓', '✗'),
    flag(node.hasClass('highlighted'), 'H:', '✓', '✗'),
    flag(node.hasClass('hovered'), 'V:', '✓', '✗'),
    `opacity:${node.renderedStyle('opacity')}`,
    `bw:${bwStatus}`,
    `bc:${bc} ${borderStatus}`,
    `cls:[${classes}]`,
  ].join(' | ');
}

export function runDebugUpdate(renderer: Renderer, highlight: HighlightEngine): void {
  if (!debugOverlayActive || !renderer) { debugRafId = null; return; }
  const cy = renderer.getCy();
  const panel = document.getElementById('debug-panel');
  if (!panel) { debugRafId = null; return; }

  const selIds = cy.$(':selected').nodes().map((n: NodeSingular) => n.id()).sort().join(',');
  const dimIds = cy.nodes('.dimmed').not('.layer-parent').map((n: NodeSingular) => n.id()).sort().join(',');
  const snodeEls = cy.nodes('.selected-node');
  const currentNodeId = snodeEls.length > 0 ? snodeEls[0].id() : '';
  const stateKey = `${selIds}||${dimIds}||${currentNodeId}`;

  if (stateKey === debugLastState) {
    // Only update badge positions — skip expensive DOM rebuild when nothing changed
    const overlay = document.getElementById('debug-overlay');
    if (overlay) {
      const batch: Array<{ el: HTMLElement; x: number; y: number }> = [];
      overlay.querySelectorAll<HTMLElement>('.debug-badge[data-node-id]').forEach((badge) => {
        const nodeId = badge.dataset.nodeId;
        if (!nodeId) return;
        const node = cy.getElementById(nodeId);
        if (node.empty()) return;
        const pos = node.renderedPosition();
        const nodeH = node.renderedHeight();
        batch.push({ el: badge, x: pos.x, y: pos.y - nodeH / 2 - 2 });
      });
      // Batch-apply positions in a single reflow
      batch.forEach(({ el, x, y }) => {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
      });
    }
    const el = (id: string) => document.getElementById(id) as HTMLElement | null;
    if (el('dbg-sel-count')) el('dbg-sel-count')!.textContent = String(cy.$(':selected').length);
    if (el('dbg-dim-count')) el('dbg-dim-count')!.textContent = String(cy.nodes('.dimmed').not('.layer-parent').length);
    if (el('dbg-snode-count')) el('dbg-snode-count')!.textContent = String(cy.nodes('.selected-node').length);
    debugRafId = requestAnimationFrame(() => runDebugUpdate(renderer, highlight));
    return;
  }
  debugLastState = stateKey;

  const filterText = cy.container()?.style.filter || '(无)';
  const filterEl = document.getElementById('dbg-filter');
  if (filterEl) filterEl.textContent = filterText;

  const allSelected = cy.$(':selected');
  const allDimmed = cy.nodes('.dimmed').not('.layer-parent');

  const rawEl = document.getElementById('dbg-raw-data');
  if (rawEl) rawEl.innerHTML = [
    `snodeCnt=${snodeEls.length}`, `selCnt=${allSelected.length}`, `dimCnt=${allDimmed.length}`,
    `sel=${allSelected.map((n: NodeSingular) => n.id()).join(',') || '∅'}`,
    `snode=${snodeEls.map((n: NodeSingular) => n.id()).join(',') || '∅'}`,
    `dimIds=${cy.nodes('.dimmed').map((n: NodeSingular) => n.id()).sort().join(',') || '∅'}`,
  ].join(' | ');

  const el = (id: string) => document.getElementById(id) as HTMLElement | null;
  if (el('dbg-sel-count')) el('dbg-sel-count')!.textContent = String(allSelected.length);
  if (el('dbg-dim-count')) el('dbg-dim-count')!.textContent = String(allDimmed.length);
  if (el('dbg-snode-count')) el('dbg-snode-count')!.textContent = String(snodeEls.length);
  if (el('dbg-hl-count')) el('dbg-hl-count')!.textContent = String(cy.nodes('.highlighted').length);

  const allSelectedEl = document.getElementById('dbg-all-selected');
  if (allSelectedEl) {
    allSelectedEl.innerHTML = allSelected.length === 0
      ? '<span style="font-size:9px;color:#64748b">无</span>'
      : allSelected.map((n: NodeSingular) => {
          const label = n.data('label') || n.id();
          const dimmed = n.hasClass('dimmed');
          const color = dimmed ? '#f87171' : '#818cf8';
          const bg = dimmed ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)';
          return `<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:${bg};color:${color}">${label.slice(0, 10)}${dimmed ? ' ⚠' : ''}</span>`;
        }).join('');
  }

  const snodeFirstId = snodeEls.length > 0 ? snodeEls[0].id() : null;
  const currentNode = snodeFirstId ? cy.getElementById(snodeFirstId) : null;
  const prevNodeId = _prevSelectedNodeId;
  const prevNodeName = _prevSelectedNodeName;
  const prevNode = prevNodeId ? cy.getElementById(prevNodeId) : null;
  _prevSelectedNodeId = null;
  _prevSelectedNodeName = null;

  const allDimmedEl = document.getElementById('dbg-all-dimmed');
  if (allDimmedEl) {
    allDimmedEl.innerHTML = allDimmed.length === 0
      ? '<span style="color:#64748b">无 dimmed 节点</span>'
      : allDimmed.map((n: NodeSingular) => {
          const label = (n.data('label') || n.id()).slice(0, 10);
          const bc = n.renderedStyle('border-color') as string;
          const bw = n.renderedStyle('border-width') as string;
          const isWhite = bc === '#ffffff' || bc === 'rgb(255,255,255)' || bc === 'rgba(255,255,255,1)';
          const warn: string[] = [];
          if (n.selected()) warn.push('S');
          if (isWhite) warn.push('白边');
          if ((parseFloat(bw) || 0) >= 2.5) warn.push('粗边');
          const warnTag = warn.length > 0 ? `<span style="color:#f87171"> ⚠${warn.join(',')}</span>` : '';
          const isCurrent = currentNode && n.id() === currentNode.id();
          const isPrev = prevNode && n.id() === prevNode.id();
          const tag = isCurrent ? '✨' : isPrev ? '⏮' : '  ';
          return `<div>${tag}<b>${label}</b> bw=${bw} bc=${isWhite ? '⚠白' : 'ok'} ${warnTag}</div>`;
        }).join('');
  }

  if (el('dbg-new-name')) {
    el('dbg-new-name')!.textContent = currentNode ? (currentNode.data('label') || currentNode.id()).slice(0, 12) : '—';
  }
  if (el('dbg-new-props')) {
    el('dbg-new-props')!.innerHTML = currentNode
      ? nodeForensicProps(currentNode)
      : '<span style="color:#f87171">⚠ 无 .selected-node</span>';
  }
  if (el('dbg-old-name')) {
    el('dbg-old-name')!.textContent = prevNode ? (prevNodeName || prevNode.id()).slice(0, 12) : '—';
  }
  if (el('dbg-old-props') && prevNode) {
    const props = nodeForensicProps(prevNode);
    el('dbg-old-props')!.innerHTML = props + (isDimmedAndSelected(prevNode) ? '<br><span style="color:#f87171;font-weight:700">⚠ dimmed+:selected 冲突!</span>' : '');
  }

  const conflictNodes = cy.nodes('.dimmed').filter(':selected');
  const conflictEl = document.getElementById('dbg-conflict');
  if (conflictEl) {
    conflictEl.style.display = conflictNodes.length > 0 ? '' : 'none';
    if (conflictNodes.length > 0) conflictEl.textContent = `⚠ 冲突: .dimmed+:selected = ${conflictNodes.length} 个`;
  }

  const overlay = document.getElementById('debug-overlay');
  if (overlay) {
    // Build all badges into a fragment, then do one replaceChild — O(1) reflow
    const fragment = document.createDocumentFragment();
    const existingBadges = new Map<string, HTMLElement>();
    overlay.querySelectorAll<HTMLElement>('.debug-badge[data-node-id]').forEach((b) => {
      existingBadges.set(b.dataset.nodeId!, b);
    });

    cy.nodes().not('.layer-parent').forEach((node: NodeSingular) => {
      const nid = node.id();
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
      const text = parts.length > 0 ? parts.join('+') : '\u00b7';
      const label = (node.data('label') || node.id()).slice(0, 6);
      let cls = 'debug-badge debug-badge--none';
      if (hasSelected && hasDimmed) cls = 'debug-badge debug-badge--selected';
      else if (hasDimmed) cls = 'debug-badge debug-badge--dimmed';
      else if (hasSelected) cls = 'debug-badge debug-badge--selected';
      else if (hasSNode) cls = 'debug-badge debug-badge--sel-node';
      else if (hasHighlight) cls = 'debug-badge debug-badge--highlight';
      else if (hasHovered) cls = 'debug-badge debug-badge--hovered';

      const existing = existingBadges.get(nid);
      if (existing && existing.className === cls) {
        existing.style.left = pos.x + 'px';
        existing.style.top = (pos.y - nodeH / 2 - 2) + 'px';
        existing.textContent = `${label}[${text}]`;
        fragment.appendChild(existing);
        existingBadges.delete(nid);
      } else {
        const badge = document.createElement('div');
        badge.className = cls;
        badge.dataset.nodeId = nid;
        badge.textContent = `${label}[${text}]`;
        badge.style.left = pos.x + 'px';
        badge.style.top = (pos.y - nodeH / 2 - 2) + 'px';
        fragment.appendChild(badge);
      }

      if (hasSelected && hasDimmed) {
        const existingC = existingBadges.get(`__conflict_${nid}`);
        if (existingC) {
          existingC.style.left = pos.x + 'px';
          existingC.style.top = (pos.y - nodeH / 2 - 28) + 'px';
          fragment.appendChild(existingC);
          existingBadges.delete(`__conflict_${nid}`);
        } else {
          const c = document.createElement('div');
          c.className = 'debug-badge debug-badge--selected';
          c.textContent = 'CONFLICT!';
          c.style.left = pos.x + 'px';
          c.style.top = (pos.y - nodeH / 2 - 28) + 'px';
          fragment.appendChild(c);
        }
      }
    });

    // Remove stale badges no longer in graph
    existingBadges.forEach((el) => el.remove());
    overlay.innerHTML = '';
    overlay.appendChild(fragment);
  }

  debugRafId = requestAnimationFrame(() => runDebugUpdate(renderer, highlight));
}
