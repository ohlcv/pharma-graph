// src/ui/search-ui.ts
// Wires the two search inputs (desktop top bar, mobile bottom sheet) to the
// Search + HighlightEngine + DetailPanel pipeline.
//
// The pipeline:
//   onInput  → run search → update stats; auto-center the *first* result
//             after a short debounce so rapid typing doesn't thrash the camera.
//   ArrowUp  → move cursor to prev result + center camera on it (first press
//             lands on result 0, not result 1)
//   ArrowDown → same, other direction
//   Enter    → commit: pick the current/pending result and *navigate* the
//             camera to it (same path as a graph tap / detail neighbour click)
//   Escape   → clear search and cancel any pending auto-center
//
// The desktop and mobile inputs are kept in sync so the user doesn't see two
// divergent result lists.
//
// Input-method composition (`compositionstart` / `compositionend`) is tracked
// so the Enter key pressed while confirming a CJK candidate doesn't trigger
// navigation until the candidate is finalised.

import cytoscape from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';
import { DetailPanel } from './detail-panel.js';
import { Search } from './search.js';
import { updateStats } from './graph-stats.js';
import { focusOnNode } from './focus-node.js';

/** Debounce window for "input" handlers — keeps the graph from re-centering
 *  on every keystroke while still updating the result count and highlight live. */
const SEARCH_INPUT_DEBOUNCE_MS = 220;

export function initSearchUI(
  cy: cytoscape.Core,
  highlight: HighlightEngine,
  search: Search,
  detailPanel: DetailPanel,
): void {
  const desktopInput = document.getElementById('bs-search-input') as HTMLInputElement | null;
  const mobileInput = document.getElementById('bs-mobile-search-input') as HTMLInputElement | null;

  if (desktopInput && mobileInput) {
    wireMirror(desktopInput, mobileInput);
    wireMirror(mobileInput, desktopInput);
  }

  attachSearchHandlers(desktopInput, { cy, highlight, search, detailPanel, mirror: mobileInput });
  attachSearchHandlers(mobileInput, { cy, highlight, search, detailPanel, mirror: desktopInput });
}

interface HandlersCtx {
  cy: cytoscape.Core;
  highlight: HighlightEngine;
  search: Search;
  detailPanel: DetailPanel;
  /** The peer search input (for keep-value-in-sync on Escape). */
  mirror?: HTMLInputElement | null;
}

/**
 * Mirror `value` from `src` to `dst` on every input event so the two search
 * inputs show the same query. Mirror is suppressed while the *destination*
 * is focused, otherwise typing in one input while the other has focus would
 * feel like the cursor is being yanked away from underneath the user.
 */
function wireMirror(src: HTMLInputElement, dst: HTMLInputElement): void {
  src.addEventListener('input', () => {
    if (document.activeElement === dst) return;
    if (dst.value === src.value) return;
    dst.value = src.value;
  });
}

function attachSearchHandlers(input: HTMLInputElement | null, ctx: HandlersCtx): void {
  if (!input) return;
  const { cy, search, detailPanel } = ctx;
  let pendingCenterTimer: ReturnType<typeof setTimeout> | null = null;
  let isComposing = false;

  function cancelPendingCenter(): void {
    if (pendingCenterTimer !== null) {
      clearTimeout(pendingCenterTimer);
      pendingCenterTimer = null;
    }
  }

  input.addEventListener('compositionstart', () => {
    isComposing = true;
    cancelPendingCenter();
  });
  input.addEventListener('compositionend', () => {
    isComposing = false;
    // Browser fires `input` after `compositionend`; nothing else to do here.
  });

  input.addEventListener('input', () => {
    // Run search synchronously so highlight + stats update on every keystroke.
    const results = search.search(input.value);
    updateStats(cy);

    cancelPendingCenter();
    if (results.length === 0) return;
    // Mobile: skip auto-center entirely. The bottom-sheet already gives the
    // user a way to act on results (chips, layout, etc.), and zooming to
    // 1.5 on a ~360px-wide canvas centres the camera on a node that's now
    // visually enormous — covering the bottom-sheet and making its action
    // buttons unreachable until the user dismisses the search.
    if (window.innerWidth <= 768) return;
    pendingCenterTimer = setTimeout(() => {
      pendingCenterTimer = null;
      if (document.activeElement !== input) return;
      if (search.getCurrentId() !== null) return;
      // Preview the first match: move the camera but keep the batch of
      // search-highlighted results visible. `skipHighlight: true` ensures
      // we don't collapse the whole batch down to "the target's neighbours".
      focusOnNode(cy, results[0], { skipHighlight: true });
    }, SEARCH_INPUT_DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (e) => {
    // Escape always works, even mid-composition.
    if (e.key === 'Escape') {
      cancelPendingCenter();
      // Sync the peer input too — `wireMirror` only fires on `input`,
      // so programmatic value clear would otherwise leave the other
      // input showing stale text.
      if (ctx.mirror && ctx.mirror.value !== '') ctx.mirror.value = '';
      input.value = '';
      search.clear();
      updateStats(cy);
      e.preventDefault();
      return;
    }

    // Skip arrow/enter handling while CJK composition is active — the browser
    // is still finishing the candidate and Enter is going to confirm it.
    if (isComposing) return;
    if ((e as unknown as { isComposing?: boolean }).isComposing) return;

    const results = search.getResults();
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      const id = search.navigateNext();
      if (id) detailPanel.show(id);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      const id = search.navigatePrev();
      if (id) detailPanel.show(id);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      cancelPendingCenter();
      const id = search.commit();
      if (id) detailPanel.show(id);
      e.preventDefault();
    }
  });

  // If the user clicks a search result somewhere else (or the input loses
  // focus to the canvas), still cancel any pending auto-center.
  input.addEventListener('blur', () => cancelPendingCenter());
}
