/**
 * @vitest-environment jsdom
 */
// Tests for src/ui/search.ts — issue #29 added a screen-reader
// announcer (`#search-announcer`, aria-live polite). The tests
// verify that:
//   1. `search()` announces the result count (incl. zero-result case)
//   2. `navigateNext/Prev` announces "第 N / 共 M 个结果：<label>".
//      The first press on a fresh query lands on index 0 (not 1).
//   3. `clear()` announces "搜索已清除"
//   4. `commit()` (the Enter-key path) selects the current cursor or, when
//      the user has not navigated yet, the first result.

import { describe, it, expect, beforeEach } from 'vitest';
import cytoscape from 'cytoscape';
import { Search } from './search.js';

function makeSearch(): { search: Search; cy: cytoscape.Core } {
  document.body.innerHTML = '<div id="search-announcer" aria-live="polite"></div>';
  const cy = cytoscape({ headless: true, styleEnabled: false });
  cy.add([
    { group: 'nodes', data: { id: 'a', label: '阿司匹林' } },
    { group: 'nodes', data: { id: 'b', label: '阿莫西林' } },
    { group: 'nodes', data: { id: 'c', label: '布洛芬' } },
  ]);
  // Search only depends on cy.getElementById / highlightSearch — we
  // can pass a stub HighlightEngine instead of standing one up.
  const highlight = {
    highlightSearch: (q: string) => {
      if (!q.trim()) return [];
      const ql = q.toLowerCase();
      return cy
        .nodes()
        .map((n) => n.id())
        .filter((id) => {
          const n = cy.getElementById(id);
          return ((n.data('label') ?? '') as string).toLowerCase().includes(ql);
        });
    },
    reset: () => {},
  } as unknown as import('./highlight-engine.js').HighlightEngine;
  return { search: new Search(cy, highlight), cy };
}

function readAnnouncer(): string {
  const el = document.getElementById('search-announcer');
  return el?.textContent ?? '';
}

describe('Search — issue #29 announcer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="search-announcer" aria-live="polite"></div>';
  });

  it('announces result count on search()', () => {
    const { search } = makeSearch();
    search.search('阿');
    expect(readAnnouncer()).toBe('共 2 个结果');
  });

  it('announces "没有匹配的结果" for zero-result queries', () => {
    const { search } = makeSearch();
    search.search('xyz');
    expect(readAnnouncer()).toBe('没有匹配的结果');
  });

  it('first navigateNext lands on result 0, not 1', () => {
    // Behaviour change: previously the index started at 0 inside
    // `search()`, so the first ArrowDown jumped to 1 (skipping the
    // first result). Now index starts at -1 and the first press goes
    // to 0; the second press goes to 1.
    const { search } = makeSearch();
    search.search('阿');
    expect(search.getCurrentId()).toBeNull();
    search.navigateNext();
    expect(search.getCurrentId()).toBe('a');
    expect(readAnnouncer()).toBe('第 1 / 共 2 个结果：阿司匹林');
    search.navigateNext();
    expect(search.getCurrentId()).toBe('b');
    expect(readAnnouncer()).toBe('第 2 / 共 2 个结果：阿莫西林');
  });

  it('first navigatePrev lands on result 0', () => {
    const { search } = makeSearch();
    search.search('阿');
    search.navigatePrev();
    expect(search.getCurrentId()).toBe('a');
    expect(readAnnouncer()).toBe('第 1 / 共 2 个结果：阿司匹林');
    search.navigatePrev();
    expect(search.getCurrentId()).toBe('b');
  });

  it('commit() with no prior navigation falls back to first result', () => {
    const { search } = makeSearch();
    search.search('阿');
    const id = search.commit();
    expect(id).toBe('a');
    expect(search.getCurrentId()).toBe('a');
    expect(readAnnouncer()).toBe('第 1 / 共 2 个结果：阿司匹林');
  });

  it('commit() honours the cursor after manual navigation', () => {
    const { search } = makeSearch();
    search.search('阿');
    search.navigateNext(); // → a
    search.navigateNext(); // → b
    const id = search.commit();
    expect(id).toBe('b');
  });

  it('commit() with no results returns null', () => {
    const { search } = makeSearch();
    expect(search.commit()).toBeNull();
  });

  it('announces "搜索已清除" on clear()', () => {
    const { search } = makeSearch();
    search.search('阿');
    search.clear();
    expect(readAnnouncer()).toBe('搜索已清除');
    expect(search.getCurrentId()).toBeNull();
  });

  it('dedupes consecutive identical messages by clearing first', () => {
    const { search } = makeSearch();
    search.search('阿');
    const first = readAnnouncer();
    search.search('阿');
    expect(readAnnouncer()).toBe(first);
  });
});
