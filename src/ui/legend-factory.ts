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
import { staticEls } from './dom-cache.js';

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
  /** Data-attribute name holding the key — e.g. 'data-type', 'data-field'. */
  readonly dataKey: string;
  /** Click handler dispatched with the row's key value. */
  readonly onClick: ClickHandler;
  /** Optional HTML class name applied to the row. */
  readonly rowExtraClass?: string;
  /** Optional list of additional id-prefixes for count badges (e.g. static HTML ids). */
  readonly extraCountIds?: readonly string[];
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

/** Static-row variant: edges don't go through MutationObserver (they only
 * toggle once or twice). Inline aria-pressed sync is enough. */
function decorateStaticRowA11y(row: HTMLElement): void {
  if (row.getAttribute('role') === 'button') return;
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  row.setAttribute('aria-pressed', row.classList.contains('active') ? 'true' : 'false');
}

function attachDelegated(
  container: HTMLElement,
  selector: string,
  dataKey: string,
  onClick: ClickHandler,
): void {
  const host = container as Delegated;
  if (host.__legendDelegated) return;
  host.__legendDelegated = true;
  container.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(selector);
    if (!row) return;
    const key = row.dataset[dataKey] ?? '';
    if (!key) return;
    onClick(key, uiState.highlight!);
  });
  // Keyboard parity: Enter/Space on a focused row activates the same handler.
  // Skip if the user is typing in an inner editable element (none today, but
  // future-proof — legend rows don't host inputs).
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = (e.target as HTMLElement).closest<HTMLElement>(selector);
    if (!row) return;
    const key = row.dataset[dataKey] ?? '';
    if (!key) return;
    e.preventDefault();
    onClick(key, uiState.highlight!);
  });
}

function updateCount(
  key: string,
  cy: Core,
  descriptor: LegendAxisDescriptor,
): number {
  const selector = descriptor.countSelector.replace(/\$\{key\}/g, key);
  const scope = descriptor.countScope === 'nodes' ? cy.nodes() : cy.edges();
  return scope.filter(selector).length;
}

/**
 * Idempotently build the legend containers and wire click handlers.
 * Call once at startup; subsequent calls only refresh counts.
 */
export function buildLegend(cy: Core, descriptor: LegendAxisDescriptor): void {
  const desktop = document.getElementById(descriptor.desktopContainerId);
  const mobile = document.getElementById(descriptor.mobileContainerId);
  if (!desktop && !mobile) return;

  if (desktop && desktop.children.length === 0) {
    desktop.innerHTML = Object.entries(descriptor.labels)
      .map(([k, v]) => descriptor.desktopRow(k, v))
      .join('');
    Array.from(desktop.children).forEach((c) => decorateRowA11y(c as HTMLElement));
  }
  if (mobile && mobile.children.length === 0) {
    mobile.innerHTML = Object.entries(descriptor.labels)
      .map(([k, v]) => descriptor.mobileChip(k, v))
      .join('');
    Array.from(mobile.children).forEach((c) => decorateRowA11y(c as HTMLElement));
  }

  // Static edge-legend rows are hard-coded in index.html (rather than generated
  // via desktopRow()) so they bypass the innerHTML branch above. Decorate them
  // once on first build so they pick up keyboard support too.
  if (descriptor.dataKey === 'data-edge') {
    staticEls('.legend-edge-row[data-edge]').forEach(decorateStaticRowA11y);
    staticEls('.bs-chip[data-edge]').forEach(decorateStaticRowA11y);
  }

  if (desktop) {
    attachDelegated(desktop, `.${descriptor.rowClass}[${descriptor.dataKey}]`, descriptor.dataKey.replace('data-', ''), descriptor.onClick);
  }
  if (mobile) {
    attachDelegated(mobile, `.bs-chip[${descriptor.dataKey}]`, descriptor.dataKey.replace('data-', ''), descriptor.onClick);
  }

  for (const key of Object.keys(descriptor.labels)) {
    const count = updateCount(key, cy, descriptor);
    const text = count > 0 ? `${count}` : '';
    const dEl = document.getElementById(`${descriptor.desktopCountPrefix}${key}`);
    const mEl = document.getElementById(`${descriptor.mobileCountPrefix}${key}`);
    if (dEl) dEl.textContent = text;
    if (mEl) mEl.textContent = text;
    for (const extra of descriptor.extraCountIds ?? []) {
      const el = document.getElementById(`${extra}${key}`);
      if (el) el.textContent = text;
    }
  }
}