/**
 * @vitest-environment jsdom
 */
// Integration tests for src/ui/search-ui.ts — the wiring from the search
// <input> to Search + DetailPanel + focusOnNode.
//
// We can't easily drive the real DOM into a Cytoscape canvas here, so the
// tests verify the observable contract at the boundaries:
//   - Enter in the input calls DetailPanel.show() with the committed id
//   - Escape clears search and resets state
//   - composing events are ignored for Enter
//   - ArrowDown moves the cursor once and shows that result
//   - both inputs (desktop + mobile) are mirrored on `input`

import { describe, it, expect, beforeEach, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { initSearchUI } from './search-ui.js';
import { Search } from './search.js';

function makeGraph(): cytoscape.Core {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  cy.add([
    { group: 'nodes', data: { id: 'a', label: '阿司匹林' } },
    { group: 'nodes', data: { id: 'b', label: '阿莫西林' } },
    { group: 'nodes', data: { id: 'c', label: '布洛芬' } },
  ]);
  return cy;
}

function makeHighlight(cy: cytoscape.Core) {
  return {
    highlightSearch: (q: string) => {
      if (!q.trim()) return [];
      const ql = q.toLowerCase();
      return cy
        .nodes()
        .map((n) => n.id())
        .filter((id) => cy.getElementById(id).data('label')?.toLowerCase().includes(ql) ?? false);
    },
    reset: () => {},
  } as unknown as import('./highlight-engine.js').HighlightEngine;
}

function setupInputs(): {
  cy: cytoscape.Core;
  search: Search;
  show: ReturnType<typeof vi.fn>;
  detailPanel: { show: (id: string) => void };
} {
  document.body.innerHTML = `
    <div id="search-announcer" aria-live="polite"></div>
    <input id="bs-search-input" />
    <input id="bs-mobile-search-input" />
  `;
  const cy = makeGraph();
  // Disable the camera animation so jsdom doesn't blow up.
  vi.spyOn(cy, 'animate').mockImplementation(() => undefined as never);
  vi.spyOn(cy, 'stop').mockImplementation(() => undefined as never);
  const search = new Search(cy, makeHighlight(cy));
  const show = vi.fn();
  const detailPanel = { show } as unknown as { show: (id: string) => void };
  initSearchUI(cy, makeHighlight(cy), search, detailPanel as never);
  return { cy, search, show, detailPanel };
}

type KeyInit = Record<string, unknown>;

function fireKey(el: HTMLInputElement, key: string, opts: KeyInit = {}) {
  const init: KeyInit = { key, bubbles: true, cancelable: true, ...opts };
  const ev = new KeyboardEvent('keydown', init as any);
  el.dispatchEvent(ev);
  return ev;
}

describe('search-ui integration', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('Enter on a fresh query shows the first result', () => {
    const { search, show } = setupInputs();
    const input = document.getElementById('bs-search-input') as HTMLInputElement;
    input.value = '阿';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fireKey(input, 'Enter');
    expect(show).toHaveBeenCalledWith('a');
    expect(search.getCurrentId()).toBe('a');
  });

  it('ArrowDown advances the cursor and shows the next result', () => {
    const { search, show } = setupInputs();
    const input = document.getElementById('bs-search-input') as HTMLInputElement;
    input.value = '阿';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fireKey(input, 'ArrowDown');
    fireKey(input, 'ArrowDown');
    expect(search.getCurrentId()).toBe('b');
    expect(show).toHaveBeenLastCalledWith('b');
  });

  it('Escape clears the search and resets the cursor', () => {
    const { search, show } = setupInputs();
    const input = document.getElementById('bs-search-input') as HTMLInputElement;
    input.value = '阿';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fireKey(input, 'Escape');
    expect(search.getResults()).toEqual([]);
    expect(search.getCurrentId()).toBeNull();
    expect(input.value).toBe('');
    expect(show).not.toHaveBeenCalled();
  });

  it('Enter during compositionstart is ignored until compositionend', () => {
    const { search, show } = setupInputs();
    const input = document.getElementById('bs-search-input') as HTMLInputElement;
    input.value = '阿';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    fireKey(input, 'Enter');
    // Cursor should not move while composition is active.
    expect(search.getCurrentId()).toBeNull();
    expect(show).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));
    // After compositionend, Enter should now navigate.
    fireKey(input, 'Enter');
    expect(search.getCurrentId()).toBe('a');
    expect(show).toHaveBeenCalledWith('a');
  });

  it('mobile input mirrors the desktop input value', () => {
    setupInputs();
    const desktop = document.getElementById('bs-search-input') as HTMLInputElement;
    const mobile = document.getElementById('bs-mobile-search-input') as HTMLInputElement;
    desktop.value = '阿';
    desktop.dispatchEvent(new Event('input', { bubbles: true }));
    expect(mobile.value).toBe('阿');
    mobile.value = '布洛';
    mobile.dispatchEvent(new Event('input', { bubbles: true }));
    expect(desktop.value).toBe('布洛');
  });
});
