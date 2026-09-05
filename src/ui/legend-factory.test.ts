/**
 * @vitest-environment jsdom
 */
// Tests for the legend keyboard-navigation behavior. When a legend row has
// focus, ArrowUp/Down should be routed to the descriptor's `onCycle` handler
// (which cycles through the row's highlighted node set). When `onCycle` is
// not provided, the legacy fallback moves focus to the previous/next row.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attachDelegated } from './legend-factory.js';

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

  it('Enter activates the focused row (existing behavior, regression)', () => {
    const a = makeRow('a');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.focus();
    fireKey(a, 'Enter');
    expect(onClick).toHaveBeenCalledWith('a', null);
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

  it('dataKey prefix is stripped (regression for dataset lookup)', () => {
    const a = makeRow('xyz');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick, onCycle);
    a.focus();
    fireKey(a, 'Enter');
    expect(onClick).toHaveBeenCalledWith('xyz', null);
  });
});
