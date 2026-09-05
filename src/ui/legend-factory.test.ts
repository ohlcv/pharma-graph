/**
 * @vitest-environment jsdom
 */
// Tests for the legend keyboard-navigation behavior added to fix the bug where
// pressing ArrowUp/Down inside a focused legend row scrolled the legend panel
// instead of cycling through to the next/previous node.
//
// We exercise `attachDelegated` directly (it is module-internal but exporting
// it is cheap and worth it for testability) — `buildLegend` also calls it,
// so end-to-end coverage flows from here.

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
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('attachDelegated keyboard navigation', () => {
  let onClick: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onClick = vi.fn();
  });

  it('Enter activates the focused row (existing behavior, regression)', () => {
    const a = makeRow('a');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick);
    a.focus();
    fireKey(a, 'Enter');
    expect(onClick).toHaveBeenCalledWith('a', null);
  });

  it('ArrowDown moves focus to next row AND activates it', () => {
    const a = makeRow('a');
    const b = makeRow('b');
    const c = makeRow('c');
    makeContainer([a, b, c]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick);

    a.focus();
    fireKey(a, 'ArrowDown');

    expect(document.activeElement).toBe(b);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('b', null);
  });

  it('ArrowUp moves focus to previous row AND activates it', () => {
    const a = makeRow('a');
    const b = makeRow('b');
    const c = makeRow('c');
    makeContainer([a, b, c]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick);

    c.focus();
    fireKey(c, 'ArrowUp');

    expect(document.activeElement).toBe(b);
    expect(onClick).toHaveBeenCalledWith('b', null);
  });

  it('ArrowDown on last row is clamped (no wrap, no extra activate)', () => {
    const a = makeRow('a');
    const b = makeRow('b');
    makeContainer([a, b]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick);

    b.focus();
    fireKey(b, 'ArrowDown');

    expect(document.activeElement).toBe(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ArrowUp on first row is clamped (no wrap, no extra activate)', () => {
    const a = makeRow('a');
    const b = makeRow('b');
    makeContainer([a, b]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick);

    a.focus();
    fireKey(a, 'ArrowUp');

    expect(document.activeElement).toBe(a);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('preventDefault is called so the legend container does not scroll', () => {
    const a = makeRow('a');
    const b = makeRow('b');
    makeContainer([a, b]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick);

    a.focus();
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    a.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
  });

  it('dataKey with prefix is correctly stripped (regression for dataset lookup)', () => {
    // Confirms we index dataset with the un-prefixed name; otherwise the
    // click handler that Enter/Space also exercises would silently fail.
    // (Before this fix, the original code did `row.dataset[dataKey]` which
    // returns undefined for "data-type" — Enter worked only because the
    // browser also fired a click event.)
    const a = makeRow('xyz');
    makeContainer([a]);
    attachDelegated(a.parentElement!, '.legend-row[data-type]', 'data-type', onClick);
    a.focus();
    fireKey(a, 'Enter');
    expect(onClick).toHaveBeenCalledWith('xyz', null);
  });
});
