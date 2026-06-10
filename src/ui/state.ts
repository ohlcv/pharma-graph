// src/ui/state.ts
// Centralized UI state — single source of truth for all ephemeral UI state.

export const uiState = {
  /** Graph rendering engine */
  renderer: null as import('../core/renderer.js').Renderer | null,

  /** Visual state manager (highlight/dim) */
  highlight: null as import('./highlight-engine.js').HighlightEngine | null,

  /** Node detail panel controller */
  detailPanel: null as import('./detail-panel.js').DetailPanel | null,

  /** Search engine */
  search: null as import('./search.js').Search | null,

  /** Tour engine instance (null when not running) */
  tour: {
    engine: null as import('../core/tour.js').TourEngine | null,
    pathHistory: [] as string[],
    running: false,
    paused: false,
  },

  /** Window resize debounce handle */
  resizeTimer: null as ReturnType<typeof setTimeout> | null,

  /** Drag mode (graph is being dragged by user) */
  isDragging: false,

  /** Section collapse state for node detail panels (both desktop & mobile) */
  sectionState: {
    summary: true,
    tags: true,
    edges: false,
  },

  /** Active tab in desktop detail panel ('overview' | 'body') */
  activeTab: 'overview' as 'overview' | 'body',

  /** Whether the desktop node panel is pinned to its current position */
  isPanelPinned: false,
};
