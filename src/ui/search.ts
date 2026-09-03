// src/ui/search.ts
// Search input handling and keyboard navigation.
// Consumes HighlightEngine for the actual graph highlighting.
//
// Search has two separate cursor concepts:
//   - `_activeIndex`: which result is highlighted on the graph (-1 = none).
//   - `_hasNavigated`: whether the user has *manually* moved the cursor with
//     ArrowUp/ArrowDown. Until this flips true, pressing Down on a fresh query
//     lands on the *first* result instead of jumping to the second.
//
// Announcer:
// Writes a screen-reader message on every result change and every navigate
// step. Lives in `#search-announcer` (aria-live polite, hidden visually via
// `.sr-only`).

import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { forEachStatic } from './dom-cache.js';
import { focusOnNode } from './focus-node.js';

export class Search {
  /** IDs of nodes that match the current query, in display order. */
  private results: string[] = [];
  /**
   * Index into `results` currently highlighted/centered. `-1` means "no manual
   * selection yet". Defaults to 0 only after the user explicitly navigates.
   */
  private _activeIndex = -1;
  /** Becomes true the moment the user presses ArrowUp/Down or Enter. */
  private _hasNavigated = false;

  constructor(
    private cy: cytoscape.Core,
    private highlight: HighlightEngine,
  ) {}

  /**
   * Run a new search against the graph. Highlights all matches, resets the
   * cursor, and announces the result count. Does NOT auto-center the camera —
   * the input handler in search-ui.ts decides whether to do that.
   *
   * Returns the ordered list of matching node IDs.
   */
  search(query: string): string[] {
    this.results = this.highlight.highlightSearch(query);
    this._activeIndex = -1;
    this._hasNavigated = false;
    this.announce(
      this.results.length === 0 ? '没有匹配的结果' : `共 ${this.results.length} 个结果`,
    );
    return this.results;
  }

  /**
   * Move the cursor to the next result. The first press on a fresh query lands
   * on index 0; subsequent presses advance cyclically.
   *
   * Returns the focused node id, or `null` if the result list is empty.
   */
  navigateNext(): string | null {
    if (this.results.length === 0) return null;
    this._hasNavigated = true;
    if (this._activeIndex < 0) this._activeIndex = 0;
    else this._activeIndex = (this._activeIndex + 1) % this.results.length;
    const focused = this.focusCurrent();
    this.announcePosition();
    return focused;
  }

  /**
   * Move the cursor to the previous result (cycles the other direction). Same
   * "first press lands on index 0" semantics as `navigateNext`.
   */
  navigatePrev(): string | null {
    if (this.results.length === 0) return null;
    this._hasNavigated = true;
    if (this._activeIndex < 0) this._activeIndex = 0;
    else this._activeIndex = (this._activeIndex - 1 + this.results.length) % this.results.length;
    const focused = this.focusCurrent();
    this.announcePosition();
    return focused;
  }

  /**
   * Commit to a specific result and navigate the camera to it. If the caller
   * hasn't manually chosen yet, fall back to the first result.
   *
   * Returns the committed node id, or `null` if there's nothing to commit to.
   */
  commit(targetId?: string): string | null {
    if (this.results.length === 0) return null;
    const id =
      targetId ??
      (this._hasNavigated && this._activeIndex >= 0
        ? this.results[this._activeIndex]
        : this.results[0]);
    if (!id) return null;
    this._hasNavigated = true;
    this._activeIndex = this.results.indexOf(id);
    this.focusCurrent();
    this.announcePosition();
    return id;
  }

  clear(): void {
    this.results = [];
    this._activeIndex = -1;
    this._hasNavigated = false;
    forEachStatic((el) => el.classList.remove('active'), '.legend-row', '.bs-chip');
    this.highlight.reset();
    this.announce('搜索已清除');
  }

  getResults(): string[] {
    return this.results;
  }

  /**
   * Returns the currently highlighted result id if the user has manually moved
   * the cursor. Returns `null` while the cursor is still at its "unmoved"
   * sentinel state.
   */
  getCurrentId(): string | null {
    if (this._activeIndex < 0 || this._activeIndex >= this.results.length) {
      return null;
    }
    return this.results[this._activeIndex];
  }

  /** @deprecated Kept for backwards compat with the existing tests. */
  getCurrentIndex(): number {
    return this._activeIndex;
  }

  /** Move the camera to the result at `this._activeIndex` without changing it. */
  private focusCurrent(): string | null {
    const id = this.getCurrentId();
    if (!id) return null;
    // Mobile: don't move the camera. The default focus zoom (1.5) on a
    // ~360px-wide canvas centres on a node that visually engulfs the
    // bottom-sheet, hiding its action buttons. Highlights + dimmed
    // classes still mark the match clearly without yanking the camera.
    if (!focusOnNode(this.cy, id, { skipCamera: window.innerWidth <= 768 })) return null;
    return id;
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
    const id = this.getCurrentId();
    if (!id) return;
    const node = this.cy.getElementById(id);
    const label = node.empty() ? id : ((node.data('label') as string | undefined) ?? id);
    this.announce(`第 ${this._activeIndex + 1} / 共 ${this.results.length} 个结果：${label}`);
  }
}
