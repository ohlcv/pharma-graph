// src/ui/layout-manager.ts
// DEPRECATED — responsibilities have been split into focused modules:
//
//   - src/ui/layout/layout-engine.ts      (runLayout, getCurrentLayout, setCurrentLayout, syncLayoutDisplay)
//   - src/ui/layout/layout-params.ts     (renderLayoutParams, applyLayoutParams, resetLayoutParams, mobile params)
//   - src/ui/layout/layout-switcher.ts    (toggleLayoutMenu, closeLayoutMenu, installLayoutMenuDismissHandlers)
//   - src/ui/layout/toolbar-actions.ts    (fitGraph, randomize, animatePulse)
//
// This file re-exports everything under the old names so that existing imports
// in action-handlers.ts, main.ts, and drag-manager.ts continue to work during
// the migration window. Please migrate imports to the new paths and remove this file.

export {
  getCurrentLayout,
  setCurrentLayout,
  syncLayoutDisplay,
  runLayout,
} from './layout/layout-engine.js';

export {
  renderLayoutParams,
  applyLayoutParams,
  resetLayoutParams,
  renderBsLayoutParams,
  applyBsParams,
  toggleBsAdvanced,
  restoreBsAdvancedPrefs,
  resetBsAdvancedPrefs,
} from './layout/layout-params.js';

export {
  toggleLayoutMenu,
  closeLayoutMenu,
  installLayoutMenuDismissHandlers,
} from './layout/layout-switcher.js';

export {
  fitGraph,
  randomize,
  animatePulse,
} from './layout/toolbar-actions.js';
