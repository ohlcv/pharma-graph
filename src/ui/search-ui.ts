// src/ui/search-ui.ts
// Wires the two search inputs (desktop top bar, mobile bottom sheet) to the
// Search + HighlightEngine + DetailPanel pipeline.
//
// The pipeline:
//   onInput → run search → update stats + schedule debounced camera center
//   ArrowUp/Down → navigate results + open DetailPanel
//   Enter → confirm highlighted result + show DetailPanel
//   Escape → clear search and cancel pending center

import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { DetailPanel } from './detail-panel.js';
import { Search } from './search.js';
import { updateStats } from './graph-stats.js';

/** Debounce window for "input" handlers — keeps the graph from re-centering
 *  on every keystroke while still updating the result count and highlight live. */
const SEARCH_INPUT_DEBOUNCE_MS = 220;

export function initSearchUI(
  cy: cytoscape.Core,
  highlight: HighlightEngine,
  search: Search,
  detailPanel: DetailPanel,
): void {
  attachSearchHandlers(document.getElementById('bs-search-input') as HTMLInputElement, {
    cy,
    highlight,
    search,
    detailPanel,
  });
  attachSearchHandlers(document.getElementById('bs-mobile-search-input') as HTMLInputElement, {
    cy,
    highlight,
    search,
    detailPanel,
  });
}

interface HandlersCtx {
  cy: cytoscape.Core;
  highlight: HighlightEngine;
  search: Search;
  detailPanel: DetailPanel;
}

function attachSearchHandlers(input: HTMLInputElement | null, ctx: HandlersCtx): void {
  if (!input) return;
  const { cy, highlight, search, detailPanel } = ctx;
  let pendingCenterTimer: ReturnType<typeof setTimeout> | null = null;

  input.addEventListener('input', () => {
    // Run search synchronously so highlight + stats update on every keystroke.
    // The expensive part — centering the camera — is deferred so rapid typing
    // doesn't queue overlapping cy.animate() calls.
    const results = search.search(input.value);
    updateStats(cy);

    if (pendingCenterTimer !== null) clearTimeout(pendingCenterTimer);
    pendingCenterTimer = setTimeout(() => {
      pendingCenterTimer = null;
      if (results.length === 0) return;
      // Skip auto-centering if the input has lost focus or the user has
      // already navigated to a result (which centers the camera itself).
      if (document.activeElement !== input) return;
      if (search.getCurrentIndex() >= 0) return;
      const firstId = results[0];
      const node = cy.getElementById(firstId);
      if (node.empty()) return;
      cy.animate({
        center: { eles: node },
        zoom: 1.5,
        duration: 400,
        easing: 'ease-out-cubic',
      });
    }, SEARCH_INPUT_DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (pendingCenterTimer !== null) {
        clearTimeout(pendingCenterTimer);
        pendingCenterTimer = null;
      }
      input.value = '';
      search.clear();
      updateStats(cy);
      e.preventDefault();
      return;
    }
    if (search.getResults().length === 0) return;
    if (e.key === 'ArrowDown') {
      const id = search.navigateNext();
      if (id) detailPanel.show(id);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      const id = search.navigatePrev();
      if (id) detailPanel.show(id);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (pendingCenterTimer !== null) {
        clearTimeout(pendingCenterTimer);
        pendingCenterTimer = null;
      }
      const results = search.getResults();
      const idx = search.getCurrentIndex();
      if (results[idx]) {
        detailPanel.show(results[idx]);
        highlight.highlightNode(results[idx]);
      }
      e.preventDefault();
    }
  });
}
