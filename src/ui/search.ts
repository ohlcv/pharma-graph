// src/ui/search.ts
// Search input handling and keyboard navigation.
// Consumes HighlightEngine for the actual graph highlighting.
//
// Issue #29: writes a screen-reader announcement on every result change
// and every navigate step. Lives in `#search-announcer` (aria-live
// polite, hidden visually via `.sr-only`).

import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { forEachStatic } from './dom-cache.js';

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
    // Issue #29: announce the result count so screen-reader users know
    // whether the query yielded anything. Replaces the previous
    // silent-graph-only feedback.
    this.announce(
      this.results.length === 0
        ? '没有匹配的结果'
        : `共 ${this.results.length} 个结果`,
    );
    return this.results;
  }

  navigateNext(): string | null {
    if (this.results.length === 0) return null;
    this.index = (this.index + 1) % this.results.length;
    const focused = this.focusCurrent();
    this.announcePosition();
    return focused;
  }

  navigatePrev(): string | null {
    if (this.results.length === 0) return null;
    this.index = (this.index - 1 + this.results.length) % this.results.length;
    const focused = this.focusCurrent();
    this.announcePosition();
    return focused;
  }

  clear(): void {
    this.results = [];
    this.index = -1;
    forEachStatic((el) => el.classList.remove('active'), '.legend-row', '.bs-chip');
    this.highlight.reset();
    this.announce('搜索已清除');
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
    // Cancel any in-flight centering animation so rapid ArrowDown presses
    // don't queue overlapping camera moves that produce a "jitter" effect.
    this.cy.stop();
    this.cy.animate({
      center: { eles: node },
      zoom: 1.5,
      duration: 400,
      easing: 'ease-out-cubic',
    });

    return nodeId;
  }

  /** Write a message to `#search-announcer` for screen-reader pickup. */
  private announce(msg: string): void {
    const el = document.getElementById('search-announcer');
    if (!el) return;
    // Clear first so identical consecutive messages still fire the live
    // region's "changed text" event (otherwise screen readers dedupe).
    el.textContent = '';
    el.textContent = msg;
  }

  private announcePosition(): void {
    if (this.results.length === 0) return;
    const nodeId = this.results[this.index];
    const node = this.cy.getElementById(nodeId);
    const label = node.empty()
      ? nodeId
      : (node.data('label') as string | undefined) || nodeId;
    this.announce(`第 ${this.index + 1} / 共 ${this.results.length} 个结果：${label}`);
  }
}
