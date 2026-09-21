// src/ui/layout-menu.ts
// DEPRECATED — all exports have moved to src/ui/layout/layout-switcher.ts.
// This file is kept as a backward-compatibility shim so that action-handlers.ts
// can continue importing from the old path during the migration window.

export {
  toggleLayoutMenu,
  closeLayoutMenu,
  installLayoutMenuDismissHandlers,
  _resetLayoutMenuForTests,
} from './layout/layout-switcher.js';
