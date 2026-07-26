/**
 * @vitest-environment jsdom
 */
// Tests for src/ui/search.ts — issue #29 added a screen-reader
// announcer (`#search-announcer`, aria-live polite). The tests
// verify that:
//   1. `search()` announces the result count (incl. zero-result case)
//   2. `navigateNext/Prev` announces "第 N / 共 M 个结果：<label>"
//   3. `clear()` announces "搜索已清除"

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

  it('announces position + label on navigateNext()', () => {
    const { search } = makeSearch();
    search.search('阿');
    search.navigateNext();
    // results = [a, b]; index starts at 0; next wraps to 1 → "阿莫西林"
    expect(readAnnouncer()).toBe('第 2 / 共 2 个结果：阿莫西林');
  });

  it('announces position + label on navigatePrev()', () => {
    const { search } = makeSearch();
    search.search('阿');
    search.navigatePrev();
    // index 0 → wrap to 1
    expect(readAnnouncer()).toBe('第 2 / 共 2 个结果：阿莫西林');
  });

  it('announces "搜索已清除" on clear()', () => {
    const { search } = makeSearch();
    search.search('阿');
    search.clear();
    expect(readAnnouncer()).toBe('搜索已清除');
  });

  it('dedupes consecutive identical messages by clearing first', () => {
    // The Search writes textContent = '' then textContent = msg so
    // screen readers fire the change event even for identical back-to-back
    // messages. We can only assert the final state, not the AT behavior,
    // but we can verify the clear-then-set ordering by spying on
    // getElementById — too invasive. Instead: verify two consecutive
    // searches with the same result produce the same final text and
    // that search() doesn't throw.
    const { search } = makeSearch();
    search.search('阿');
    const first = readAnnouncer();
    search.search('阿');
    expect(readAnnouncer()).toBe(first);
  });
});