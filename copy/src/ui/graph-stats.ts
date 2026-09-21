// src/ui/graph-stats.ts
// DEPRECATED — most responsibilities have moved to:
//   - src/ui/stats/stat-cards.ts  (stat card counters + debounce)
//   - src/ui/stats/stat-animation.ts (count-up animation)
//
// This file is kept as a backward-compatibility shim so that existing imports
// from action-handlers.ts and main.ts continue to work during the migration
// window. Please migrate imports to the new paths and remove this file.

export {
  updateStats,
  syncBottomSheetStats,
} from './stats/stat-cards.js';