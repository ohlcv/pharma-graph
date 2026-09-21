// src/ui/layout/layout-engine.ts
// Core layout state + cytoscape runner + DOM surface sync.
//
// Responsibilities
//   1. Store the current layout name (module-level, not in uiState)
//   2. `runLayout()` — cancel force-drag, update state, sync DOM, call renderer
//   3. `syncLayoutDisplay()` — update all DOM surfaces showing the active layout
//
// Everything else (params, toolbar, bottom-sheet) is in its own module.

import { Renderer } from '../../core/renderer.js';
import { LAYOUTS, DEFAULT_LAYOUT } from '../../core/config.js';
import { cancel as cancelForceDrag } from '../../core/force-drag.js';
import { forEachStatic } from '../dom-cache.js';
import { loadStoredParams } from './layout-store.js';

// ── Current layout state ────────────────────────────────────────────────────────

let _currentLayout = DEFAULT_LAYOUT;

export function getCurrentLayout(): string {
  return _currentLayout;
}

export function setCurrentLayout(name: string): void {
  _currentLayout = name;
}

/**
 * Sync all DOM surfaces that display the currently-active layout name to `name`,
 * without running cytoscape. Called by `runLayout()` after a user-initiated
 * switch and by bootstrap (main.ts) so the first paint shows DEFAULT_LAYOUT.
 *
 * Surfaces updated:
 *   - `.layout-btn` active class  (desktop dropdown items)
 *   - `#bs-btn-{name}` active class  (mobile sheet)
 *   - `#layout-desc` description text  (from LAYOUTS[name].description)
 *   - `#layout-switcher-current` label text  (from LAYOUT_LABELS, fallback to name)
 *   - `aria-selected` on each `.layout-switcher__item`
 */
export function syncLayoutDisplay(name: string): void {
  forEachStatic((b) => b.classList.remove('active'), '.layout-btn');
  const btn = document.getElementById('btn-' + name);
  if (btn) btn.classList.add('active');
  const bsBtn = document.getElementById('bs-btn-' + name);
  if (bsBtn) bsBtn.classList.add('active');

  const layoutObj = LAYOUTS[name];
  if (layoutObj) {
    const desc = document.getElementById('layout-desc');
    if (desc) desc.textContent = layoutObj.description ?? '';
  }

  const current = document.getElementById('layout-switcher-current');
  if (current) current.textContent = LAYOUT_LABELS[name] ?? name;

  document.querySelectorAll<HTMLElement>('.layout-switcher__item').forEach((it) => {
    const active = it.dataset.name === name;
    it.classList.toggle('active', active);
    it.setAttribute('aria-selected', String(active));
  });
}

/**
 * User-facing labels for the toolbar segmented switcher. The source of truth
 * stays in LAYOUTS; this map only carries the short display name.
 */
export const LAYOUT_LABELS: Record<string, string> = {
  cose: 'COSE',
  concentric: '同心圆',
  circle: '环形',
  grid: '网格',
  dagre: 'Dagre',
  breadthfirst: '广度',
  euler: 'Euler',
};

// ── Layout runner ────────────────────────────────────────────────────────────────

/**
 * localStorage 里的参数全是字符串（滑块 "80000"、复选框 "1"/"0"）。
 * 直接 Object.assign 进 cytoscape 配置会得到 tile: "0"（truthy）、
 * nodeRepulsion: "80000" 这类错误类型，所以按 LAYOUTS 里声明的 type 还原。
 */
export function coerceStoredParams(
  name: string,
  stored: Record<string, string> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!stored) return out;
  for (const p of LAYOUTS[name]?.params ?? []) {
    const raw = stored[p.key];
    if (raw === undefined) continue;
    if (p.type === 'bool') {
      out[p.key] = raw === '1' || raw === 'true';
    } else if (p.type === 'select') {
      out[p.key] = raw;
    } else {
      const n = parseFloat(raw);
      if (!Number.isNaN(n)) out[p.key] = n;
    }
  }
  return out;
}

export function runLayout(name: string, renderer: Renderer): void {
  _currentLayout = name;
  syncLayoutDisplay(name);
  cancelForceDrag();
  // 透传该布局在 localStorage 中保存的用户参数，否则 cytoscape 会退回默认值，
  // 用户调好的滑杆数值在切换布局后就不再生效。
  const overrides = coerceStoredParams(name, loadStoredParams(name));
  renderer.runLayout(name, overrides);
}