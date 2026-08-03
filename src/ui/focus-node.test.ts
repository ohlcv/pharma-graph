/**
 * @vitest-environment jsdom
 */
// Verifies the shared focusOnNode helper used by every "navigate to a node"
// entry point (search confirm, detail neighbour click, future roam refactors).
//
// We assert the four modes:
//   - default commit:  select + dim others + camera animation
//   - skipHighlight:   camera only, leaves graph classes alone
//   - preserveSelection: skip the unselect/reset when roam owns state
//   - skipCamera:      selection only, no cy.animate

import { describe, it, expect, beforeEach, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { focusOnNode } from './focus-node.js';

function makeGraph(): cytoscape.Core {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  cy.add([
    { group: 'nodes', data: { id: 'a', label: 'A' } },
    { group: 'nodes', data: { id: 'b', label: 'B' } },
    { group: 'nodes', data: { id: 'c', label: 'C' } },
    { group: 'edges', data: { id: 'ab', source: 'a', target: 'b' } },
  ]);
  return cy;
}

describe('focusOnNode', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('returns false for an unknown node id', () => {
    const cy = makeGraph();
    expect(focusOnNode(cy, 'nope')).toBe(false);
  });

  it('default mode marks the node as selected and dims the rest', () => {
    const cy = makeGraph();
    const animateSpy = vi.spyOn(cy, 'animate').mockImplementation(() => undefined as never);
    const ok = focusOnNode(cy, 'a');
    expect(ok).toBe(true);
    const a = cy.getElementById('a');
    const c = cy.getElementById('c');
    expect(a.hasClass('selected-node')).toBe(true);
    expect(c.hasClass('dimmed')).toBe(true);
    expect(animateSpy).toHaveBeenCalledTimes(1);
  });

  it('skipHighlight only moves the camera, preserves classes', () => {
    const cy = makeGraph();
    cy.getElementById('c').addClass('highlighted');
    const animateSpy = vi.spyOn(cy, 'animate').mockImplementation(() => undefined as never);
    focusOnNode(cy, 'a', { skipHighlight: true });
    expect(cy.getElementById('c').hasClass('highlighted')).toBe(true);
    expect(cy.getElementById('a').hasClass('selected-node')).toBe(false);
    expect(animateSpy).toHaveBeenCalledTimes(1);
  });

  it('skipCamera updates selection without calling cy.animate', () => {
    const cy = makeGraph();
    const animateSpy = vi.spyOn(cy, 'animate').mockImplementation(() => undefined as never);
    focusOnNode(cy, 'a', { skipCamera: true });
    expect(cy.getElementById('a').hasClass('selected-node')).toBe(true);
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it('preserveSelection keeps existing classes on other elements', () => {
    const cy = makeGraph();
    const c = cy.getElementById('c');
    c.addClass('highlighted');
    focusOnNode(cy, 'a', { preserveSelection: true, skipCamera: true });
    expect(c.hasClass('highlighted')).toBe(true);
    expect(cy.getElementById('a').hasClass('selected-node')).toBe(true);
  });
});
