/**
 * @vitest-environment jsdom
 */
// Tests for the legend keyboard-navigation behavior. When a legend row has
// focus, ArrowUp/Down should be routed to the descriptor's `onCycle` handler
// (which cycles through the row's highlighted node set). When `onCycle` is
// not provided, the legacy fallback moves focus to the previous/next row.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attachDelegated } from './legend-factory.js';
import { uiState } from './state.js';

function makeRow(key: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'legend-row';
  row.setAttribute('data-type', key);
  row.tabIndex = 0;
  return row;
}

function makeContainer(rows: HTMLElement[]): HTMLElement {
  const c = document.createElement('div');
  rows.forEach((r) => c.appendChild(r));
  document.body.appendChild(c);
  return c;
}

function fireKey(target: HTMLElement, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  }));
}

describe('attachDelegated keyboard navigation', () => {
  let onClick: ReturnType<typeof vi.fn>;
  let onCycle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onClick = vi.fn();
    onCycle = vi.fn();
  });

  // ── Enter / Space ─────────────────────────────────────────────────────────

  it('Enter does NOT re-fire onClick (would toggle the filter off)', () => {
    // Regression: previously Enter ran the click handler, which when the
    // filter was already active called clearAllFilters() — so pressing
    // Enter on the focused legend row wiped the highlight the user just
    // asked for. Enter must be a no-op for the filter; it should open
    // detail-panel.show() for the currently selected node instead.
    const a = makeRow('a');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.focus();
    fireKey(a, 'Enter');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Space does NOT re-fire onClick (same as Enter)', () => {
    const a = makeRow('a');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.focus();
    fireKey(a, ' ');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Enter calls detailPanel.show with the currently selected node id', () => {
    // Stub uiState.highlight.getCy() to return a fake cy whose .nodes()
    // returns a cytoscape-style collection with one selected node, and
    // stub uiState.detailPanel.show as a spy. This proves the Enter handler
    // opens the panel instead of toggling the filter — Bug 1.
    // The fake collection is array-like: `length` and indexed `[i]` give
    // back nodes whose `.id()` returns the node id (matching cy semantics).
    const fakeNode = { id: () => 'selected-1' };
    const fakeCollection = [fakeNode];
    fakeCollection.length = 1;
    const show = vi.fn();
    const fakeHighlight = { getCy: () => ({ nodes: () => fakeCollection }) } as never;
    const fakePanel = { show } as never;
    const savedH = uiState.highlight;
    const savedP = uiState.detailPanel;
    uiState.highlight = fakeHighlight;
    uiState.detailPanel = fakePanel as never;

    try {
      const a = makeRow('a');
      makeContainer([a]);
      attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
      a.focus();
      fireKey(a, 'Enter');
      expect(show).toHaveBeenCalledWith('selected-1');
      expect(onClick).not.toHaveBeenCalled(); // filter must NOT be toggled
    } finally {
      uiState.highlight = savedH;
      uiState.detailPanel = savedP;
    }
  });

  it('Enter is a no-op when no node is selected (no filter toggle)', () => {
    const show = vi.fn();
    const fakeCollection: unknown[] = [];
    fakeCollection.length = 0;
    const fakeHighlight = { getCy: () => ({ nodes: () => fakeCollection }) } as never;
    const savedH = uiState.highlight;
    const savedP = uiState.detailPanel;
    uiState.highlight = fakeHighlight;
    uiState.detailPanel = { show } as never;

    try {
      const a = makeRow('a');
      makeContainer([a]);
      attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
      a.focus();
      fireKey(a, 'Enter');
      expect(show).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    } finally {
      uiState.highlight = savedH;
      uiState.detailPanel = savedP;
    }
  });

  it('Enter preventDefault is called so the page does not scroll', () => {
    const a = makeRow('a');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  // ── Click still works (regression — Enter change must not break click) ──

  it('Click still routes through onClick with the row key', () => {
    const a = makeRow('a');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.click();
    expect(onClick).toHaveBeenCalledWith('a', null);
  });

  it('dataKey prefix is stripped for Click lookups (regression for dataset lookup)', () => {
    const a = makeRow('xyz');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.click();
    expect(onClick).toHaveBeenCalledWith('xyz', null);
  });

  // ── ArrowUp/Down with onCycle ─────────────────────────────────────────────

  it('ArrowDown calls onCycle with delta=+1 and does NOT move focus', () => {
    const a = makeRow('a');
    const b = makeRow('b');
    makeContainer([a, b]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.focus();

    const before = document.activeElement;
    fireKey(a, 'ArrowDown');

    expect(onCycle).toHaveBeenCalledTimes(1);
    expect(onCycle).toHaveBeenCalledWith('a', 1, null);
    // Focus stays on the legend row — we are cycling NODES, not legend rows.
    expect(document.activeElement).toBe(before);
  });

  it('ArrowUp calls onCycle with delta=-1', () => {
    const a = makeRow('a');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.focus();
    fireKey(a, 'ArrowUp');
    expect(onCycle).toHaveBeenCalledWith('a', -1, null);
  });

  it('preventDefault is called so the legend container does not scroll', () => {
    const a = makeRow('a');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.focus();
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  // ── Dataset prefix regression ─────────────────────────────────────────────

  it('ArrowDown on a row with mixed-content key reads it correctly via dataset', () => {
    // Regression: previously `row.dataset['data-type']` returned undefined
    // for keys with the `data-` prefix. Click + Enter worked around this
    // (Enter fired click too, click uses dataset too — actually dataset
    // with prefix returns undefined here too; click worked only by accident
    // via bare attribute access). ArrowDown has no click fallback so it
    // needs the dsKey fix.
    const a = makeRow('weird-key_123');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.focus();
    fireKey(a, 'ArrowDown');
    expect(onCycle).toHaveBeenCalledWith('weird-key_123', 1, null);
  });
});
