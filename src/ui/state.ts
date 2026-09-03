// src/ui/state.ts
// Centralized UI state — single source of truth for all ephemeral UI state.
//
// Issue #6: previously `uiState.isPanelPinned` and `uiState.tourBarCollapsed`
// held *flat* boolean fields that were intended to mirror the live
// `UiToggle` instances owned by DetailPanel and TourController. Two
// sources for the same fact meant two writes could disagree — the
// toggle's `onChange` callback wrote to `uiState`, and DetailPanel also
// did a manual `uiState.isPanelPinned = this.pinToggle.value` after
// every click. Worse, any external assignment (`uiState.isPanelPinned =
// false` from a stray debug snippet) would silently desync the live
// toggle from the field. `tourBarCollapsed` was an even worse case: it
// was written by the toggle but never read by anyone, so it was an
// honest-to-goodness dead field.
//
// Now: the live value for these flags lives **only** in the
// `UiToggle` instance. `uiState` exposes a read-only getter that
// proxies to whichever toggle was registered for that key. Anything
// that wants to mutate the flag must go through the toggle's `set` /
// `toggle` API, which is the only place that updates the DOM and
// (optionally) persists to localStorage. `uiState.tourBarCollapsed`
// is gone entirely — it had no readers.

import type { TourStrategy } from '../core/tour.js';
import type { UiToggle } from './ui-toggle.js';

/** Toggle registered by DetailPanel for the pin button. */
let _pinToggle: UiToggle | null = null;
/** Toggle registered by TourController for the mobile tour bar. */
let _tourBarToggle: UiToggle | null = null;

/**
 * Register the DetailPanel pin toggle. Called once from DetailPanel's
 * constructor. Subsequent registrations overwrite the previous binding
 * (intentional — tests may re-initialise the module).
 */
export function registerPinToggle(toggle: UiToggle): void {
  _pinToggle = toggle;
}

/**
 * Register the mobile tour bar toggle. Called once from
 * TourController's setup. Same replace-on-rebind semantics.
 */
export function registerTourBarToggle(toggle: UiToggle): void {
  _tourBarToggle = toggle;
}

export const uiState = {
  /** Graph rendering engine */
  renderer: null as import('../core/renderer.js').Renderer | null,

  /** Visual state manager (highlight/dim) */
  highlight: null as import('./highlight-engine.js').HighlightEngine | null,

  /** Node detail panel controller */
  detailPanel: null as import('./detail-panel.js').DetailPanel | null,

  /** Search engine */
  search: null as import('./search.js').Search | null,

  /**
   * Cross-module tour state. TourController owns the engine lifecycle and
   * running/paused flags — but `strategy` and `pathHistory` are read here by
   * other modules (drag-manager uses them; TourController writes back).
   */
  tour: {
    pathHistory: [] as string[],
    /** Currently selected tour strategy */
    strategy: 'has-dfs' as TourStrategy,
  },

  /** Window resize debounce handle */
  resizeTimer: null as ReturnType<typeof setTimeout> | null,

  /** Drag mode (graph is being dragged by user) */
  isDragging: false,

  /** Section collapse state for node detail panel */
  sectionState: {
    summary: true,
    tags: true,
    edges: false,
  },

  /** Active tab in desktop detail panel ('overview' | 'body') */
  activeTab: 'overview' as 'overview' | 'body',

  /** Summary display mode: 'short' or 'full' */
  summaryMode: 'short' as 'short' | 'full',

  /**
   * Whether the desktop node panel is pinned. Read-only proxy to the
   * `UiToggle` registered by DetailPanel. To mutate, call
   * `detailPanel.pinToggle.toggle()` (or set the field directly on
   * the toggle, which is the only writer).
   */
  get isPanelPinned(): boolean {
    return _pinToggle?.value ?? false;
  },
};

/**
 * Test helper — returns the live pin toggle, or null if DetailPanel
 * hasn't initialised yet. Not used in production code.
 */
export function getPinToggleForTesting(): UiToggle | null {
  return _pinToggle;
}

/**
 * Test helper — returns the live tour bar toggle, or null if
 * TourController hasn't initialised yet. Not used in production code.
 */
export function getTourBarToggleForTesting(): UiToggle | null {
  return _tourBarToggle;
}
