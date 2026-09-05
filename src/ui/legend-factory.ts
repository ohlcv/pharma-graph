// src/ui/legend-factory.ts
// Single source of truth for legend DOM construction. The four populateXLegend
// functions used to share ~80% of their structure — they each built a desktop
// row, a mobile chip, and a count updater for one classification axis. This
// factory collapses them into one declarative helper.
//
// Each axis is described by an EntryDescriptor: the keyed label map, the count
// selector expression, an HTML template for the desktop row, and one for the
// mobile chip. The factory does the rest — initial build (idempotent) + count
// update + click delegation.

import type { Core } from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { uiState } from './state.js';

export type ClickHandler = (key: string, highlight: HighlightEngine) => void;

export interface LegendAxisDescriptor {
  /** Which container (desktop row / mobile chip) holds counts. */
  readonly labels: Record<string, string>;
  /** Cytoscape selector used to count members — e.g. `[essence = "${key}"]`. */
  readonly countSelector: string;
  /** Cypress selector that yields the elements to count (cy.nodes() / cy.edges()). */
  readonly countScope: 'nodes' | 'edges';
  /** Returns the desktop-row HTML for a given key. */
  readonly desktopRow: (key: string, label: string) => string;
  /** Returns the mobile-chip HTML for a given key. */
  readonly mobileChip: (key: string, label: string) => string;
  /** Element id prefix used for the per-key count badge in the desktop grid. */
  readonly desktopCountPrefix: string;
  /** Element id prefix used for the per-key count badge in the mobile chips. */
  readonly mobileCountPrefix: string;
  /** Container id for desktop rows. */
  readonly desktopContainerId: string;
  /** Container id for mobile chips. */
  readonly mobileContainerId: string;
  /** CSS class applied to clickable rows. */
  readonly rowClass: string;
  /** Data-attribute name holding the key — e.g. 'data-type', 'data-depth', 'data-edge'. */
  readonly dataKey: string;
  /** Click handler dispatched with the row's key value. */
  readonly onClick: ClickHandler;
  /**
   * Optional: ArrowUp/Down handler — cycles through nodes within the row's
   * highlighted set instead of moving focus to a sibling row. Receives the
   * row's key and the direction (`+1` for ArrowDown, `-1` for ArrowUp).
   * When omitted, ArrowUp/Down falls back to moving focus to prev/next row.
   */
  readonly onCycle: (key: string, delta: -1 | 1, highlight: HighlightEngine) => void;
  /** Optional HTML class name applied to the row. */
  readonly rowExtraClass?: string;
  /**
   * Optional: only render labels whose key ≤ this value (numeric keys only).
   * Enables depth legends to show only the levels that actually exist in the graph.
   */
  readonly maxKey?: number;
}

/** Tracks whether a container has had its click handler attached. */
type Delegated = HTMLElement & { __legendDelegated?: boolean };

/**
 * Promote a legend row to be keyboard-activatable: adds role="button",
 * tabindex="0", and an aria-pressed attribute that mirrors the "active" class.
 * Idempotent — safe to call on rebuilt rows.
 */
function decorateRowA11y(row: HTMLElement): void {
  if (row.getAttribute('role') === 'button') return;
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  const syncAria = () => row.setAttribute('aria-pressed', row.classList.contains('active') ? 'true' : 'false');
  syncAria();
  // Stay in sync with subsequent toggleFilter() calls. Cheap: a single classList
  // read per mutation on a container that holds at most a few dozen rows.
  const observer = new MutationObserver(syncAria);
  observer.observe(row, { attributes: true, attributeFilter: ['class'] });
}

export function attachDelegated(
  container: HTMLElement,
  selector: string,
  dataKey: string,
  onClick: ClickHandler,
  onCycle: (key: string, delta: -1 | 1, highlight: HighlightEngine) => void,
): void {
  const host = container as Delegated;
  if (host.__legendDelegated) return;
  // The descriptor's `dataKey` carries the `data-` prefix (e.g. "data-type").
  // `dataset` strips that prefix, so we always index it with the bare name.
  const dsKey = dataKey.replace(/^data-/, '');
  host.__legendDelegated = true;
  container.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(selector);
    if (!row) return;
    const key = row.dataset[dsKey] ?? '';
    if (!key) return;
    onClick(key, uiState.highlight!);
  });
  // Keyboard parity: Enter/Space on a focused row activates the same handler.
  // Skip if the user is typing in an inner editable element (none today, but
  // future-proof — legend rows don't host inputs).
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const row = (e.target as HTMLElement).closest<HTMLElement>(selector);
      if (!row) return;
      const key = row.dataset[dsKey] ?? '';
      if (!key) return;
      e.preventDefault();
      onClick(key, uiState.highlight!);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const current = (e.target as HTMLElement).closest<HTMLElement>(selector);
    if (!current) return;
    const key = current.dataset[dsKey] ?? '';
    if (!key) return;
    e.preventDefault();
    onCycle(key, e.key === 'ArrowDown' ? 1 : -1, uiState.highlight!);
  });
}

function updateCount(
  key: string,
  cy: Core,
  descriptor: LegendAxisDescriptor,
): number {
  const selector = descriptor.countSelector.replace(/\$\{key\}/g, key);
  const scope = descriptor.countScope === 'nodes' ? cy.nodes() : cy.edges();
  return scope.filter(selector).not('.layer-parent').length;
}

/**
 * Idempotently build the legend containers and wire click handlers.
 * Call once at startup; subsequent calls only refresh counts.
 */
export function buildLegend(cy: Core, descriptor: LegendAxisDescriptor): void {
  const desktop = document.getElementById(descriptor.desktopContainerId);
  const mobile = document.getElementById(descriptor.mobileContainerId);
  if (!desktop && !mobile) return;

  // Filter labels to the range that actually exists in the graph (maxKey).
  const entries = Object.entries(descriptor.labels).filter(
    ([k]) => descriptor.maxKey === undefined || Number(k) <= descriptor.maxKey,
  );

  if (desktop && desktop.children.length === 0) {
    desktop.innerHTML = entries
      .map(([k, v]) => descriptor.desktopRow(k, v))
      .join('');
    Array.from(desktop.children).forEach((c) => decorateRowA11y(c as HTMLElement));
  }
  if (mobile && mobile.children.length === 0) {
    mobile.innerHTML = entries
      .map(([k, v]) => descriptor.mobileChip(k, v))
      .join('');
    Array.from(mobile.children).forEach((c) => decorateRowA11y(c as HTMLElement));
  }

  if (desktop) {
    attachDelegated(
      desktop,
      `.${descriptor.rowClass}[${descriptor.dataKey}]`,
      descriptor.dataKey.replace('data-', ''),
      descriptor.onClick,
      descriptor.onCycle,
    );
  }
  if (mobile) {
    attachDelegated(
      mobile,
      `.bs-chip[${descriptor.dataKey}]`,
      descriptor.dataKey.replace('data-', ''),
      descriptor.onClick,
      descriptor.onCycle,
    );
  }

  for (const key of Object.keys(descriptor.labels)) {
    const count = updateCount(key, cy, descriptor);
    const text = count > 0 ? `${count}` : '';
    const dEl = document.getElementById(`${descriptor.desktopCountPrefix}${key}`);
    const mEl = document.getElementById(`${descriptor.mobileCountPrefix}${key}`);
    if (dEl) dEl.textContent = text;
    if (mEl) mEl.textContent = text;
  }
}