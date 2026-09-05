/**
 * @vitest-environment jsdom
 */
// Tests for legend-manager's cycleHighlightedNodes function: the keyboard
// handler that ArrowUp/Down wires up to cycle through the currently highlighted
// node set within an active legend filter.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { cycleHighlightedNodes } from './legend-manager.js';
import { uiState } from './state.js';
import { CLASSES } from '../core/renderer.js';

function makeGraph() {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  // Add 5 plain nodes
  cy.add([
    { group: 'nodes', data: { id: 'n1' } },
    { group: 'nodes', data: { id: 'n2' } },
    { group: 'nodes', data: { id: 'n3' } },
    { group: 'nodes', data: { id: 'n4' } },
    { group: 'nodes', data: { id: 'n5' } },
  ]);
  return cy;
}

describe('cycleHighlightedNodes', () => {
  let cy: cytoscape.Core;
  let highlight: HighlightEngine;

  beforeEach(() => {
    cy = makeGraph();
    highlight = new HighlightEngine(cy);
  });

  it('returns false when no nodes are highlighted', () => {
    expect(cycleHighlightedNodes(1, highlight)).toBe(false);
    expect(cycleHighlightedNodes(-1, highlight)).toBe(false);
  });

  it('ArrowDown selects the first highlighted node when nothing is selected', () => {
    // Simulate a legend filter by manually adding .highlighted to nodes
    cy.getElementById('n1').addClass(CLASSES.HIGHLIGHTED);
    cy.getElementById('n2').addClass(CLASSES.HIGHLIGHTED);
    cy.getElementById('n3').addClass(CLASSES.HIGHLIGHTED);

    const changed = cycleHighlightedNodes(1, highlight);
    expect(changed).toBe(true);
    expect(cy.$id('n1').hasClass(CLASSES.SELECTED_NODE)).toBe(true);
  });

  it('ArrowUp selects the last highlighted node when nothing is selected', () => {
    cy.getElementById('n1').addClass(CLASSES.HIGHLIGHTED);
    cy.getElementById('n3').addClass(CLASSES.HIGHLIGHTED);
    cy.getElementById('n5').addClass(CLASSES.HIGHLIGHTED);

    const changed = cycleHighlightedNodes(-1, highlight);
    expect(changed).toBe(true);
    expect(cy.$id('n5').hasClass(CLASSES.SELECTED_NODE)).toBe(true);
  });

  it('ArrowDown moves to the next node in the highlighted set', () => {
    cy.getElementById('n1').addClass(CLASSES.HIGHLIGHTED);
    cy.getElementById('n2').addClass(CLASSES.HIGHLIGHTED);
    cy.getElementById('n3').addClass(CLASSES.HIGHLIGHTED);
    cy.$id('n1').addClass(CLASSES.SELECTED_NODE);
    cy.$id('n1').select();

    cycleHighlightedNodes(1, highlight);
    expect(cy.$id('n2').hasClass(CLASSES.SELECTED_NODE)).toBe(true);
  });

  it('ArrowUp moves to the previous node in the highlighted set', () => {
    cy.getElementById('n1').addClass(CLASSES.HIGHLIGHTED);
    cy.getElementById('n3').addClass(CLASSES.HIGHLIGHTED);
    cy.$id('n3').addClass(CLASSES.SELECTED_NODE);
    cy.$id('n3').select();

    cycleHighlightedNodes(-1, highlight);
    expect(cy.$id('n1').hasClass(CLASSES.SELECTED_NODE)).toBe(true);
  });

  it('wraps from last to first on ArrowDown', () => {
    cy.getElementById('n1').addClass(CLASSES.HIGHLIGHTED);
    cy.getElementById('n3').addClass(CLASSES.HIGHLIGHTED);
    cy.$id('n3').addClass(CLASSES.SELECTED_NODE);
    cy.$id('n3').select();

    cycleHighlightedNodes(1, highlight);
    expect(cy.$id('n1').hasClass(CLASSES.SELECTED_NODE)).toBe(true);
  });

  it('wraps from first to last on ArrowUp', () => {
    cy.getElementById('n1').addClass(CLASSES.HIGHLIGHTED);
    cy.getElementById('n3').addClass(CLASSES.HIGHLIGHTED);
    cy.$id('n1').addClass(CLASSES.SELECTED_NODE);
    cy.$id('n1').select();

    cycleHighlightedNodes(-1, highlight);
    expect(cy.$id('n3').hasClass(CLASSES.SELECTED_NODE)).toBe(true);
  });

  it('skips layer-parent nodes (they should not be in the set)', () => {
    cy.add({ group: 'nodes', data: { id: 'lp' } });
    cy.$id('lp').addClass('layer-parent');
    cy.getElementById('n1').addClass(CLASSES.HIGHLIGHTED);
    cy.getElementById('n2').addClass(CLASSES.HIGHLIGHTED);
    cy.$id('lp').addClass(CLASSES.HIGHLIGHTED);

    // ArrowDown should land on n1 (first non-layer-parent)
    const changed = cycleHighlightedNodes(1, highlight);
    expect(changed).toBe(true);
    expect(cy.$id('n1').hasClass(CLASSES.SELECTED_NODE)).toBe(true);
  });

  // ── Detail panel sync (Bug 2: cycling did not update the panel) ──────────

  it('ArrowDown calls detailPanel.show with the new node id', () => {
    const show = vi.fn();
    const original = uiState.detailPanel;
    // Cast through unknown: the real DetailPanel has more methods, but
    // cycleHighlightedNodes only calls .show() on it.
    uiState.detailPanel = { show } as unknown as typeof uiState.detailPanel;

    try {
      cy.getElementById('n1').addClass(CLASSES.HIGHLIGHTED);
      cy.getElementById('n2').addClass(CLASSES.HIGHLIGHTED);
      cycleHighlightedNodes(1, highlight);
      expect(show).toHaveBeenCalledWith('n1');
    } finally {
      uiState.detailPanel = original;
    }
  });

  it('detailPanel.show is called even when cycling to a different node', () => {
    const show = vi.fn();
    const original = uiState.detailPanel;
    uiState.detailPanel = { show } as unknown as typeof uiState.detailPanel;

    try {
      cy.getElementById('n1').addClass(CLASSES.HIGHLIGHTED);
      cy.getElementById('n2').addClass(CLASSES.HIGHLIGHTED);
      cy.getElementById('n3').addClass(CLASSES.HIGHLIGHTED);
      cy.$id('n2').addClass(CLASSES.SELECTED_NODE);
      cy.$id('n2').select();
      cycleHighlightedNodes(1, highlight);
      expect(show).toHaveBeenCalledWith('n3');
    } finally {
      uiState.detailPanel = original;
    }
  });

  it('does not throw when detailPanel is null (e.g. uninitialized)', () => {
    const original = uiState.detailPanel;
    uiState.detailPanel = null;
    try {
      cy.getElementById('n1').addClass(CLASSES.HIGHLIGHTED);
      cy.getElementById('n2').addClass(CLASSES.HIGHLIGHTED);
      expect(() => cycleHighlightedNodes(1, highlight)).not.toThrow();
    } finally {
      uiState.detailPanel = original;
    }
  });
});
