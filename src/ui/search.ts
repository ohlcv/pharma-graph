// src/ui/search.ts
// Search input handling and keyboard navigation.
// Consumes HighlightEngine for the actual graph highlighting.

import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';

export class Search {
  private results: string[] = [];
  private index = -1;

  constructor(
    private cy: cytoscape.Core,
    private highlight: HighlightEngine,
  ) {}

  search(query: string): string[] {
    this.results = this.highlight.highlightSearch(query);
    this.index = this.results.length > 0 ? 0 : -1;
    return this.results;
  }

  navigateNext(): string | null {
    if (this.results.length === 0) return null;
    this.index = (this.index + 1) % this.results.length;
    return this.focusCurrent();
  }

  navigatePrev(): string | null {
    if (this.results.length === 0) return null;
    this.index = (this.index - 1 + this.results.length) % this.results.length;
    return this.focusCurrent();
  }

  clear(): void {
    this.results = [];
    this.index = -1;
    this.highlight.reset();
  }

  getResults(): string[] {
    return this.results;
  }

  getCurrentIndex(): number {
    return this.index;
  }

  private focusCurrent(): string | null {
    if (this.index < 0 || this.index >= this.results.length) return null;
    const nodeId = this.results[this.index];
    const node = this.cy.getElementById(nodeId);
    if (node.empty()) return null;

    this.cy.elements().removeClass('selected-node');
    node.addClass('selected-node');
    this.cy.animate({
      center: { eles: node },
      zoom: 1.5,
      duration: 400,
      easing: 'ease-out-cubic',
    });

    return nodeId;
  }
}
