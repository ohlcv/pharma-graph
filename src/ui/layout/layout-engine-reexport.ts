// src/ui/layout/layout-engine-reexport.js
// Thin re-export layer to break a circular import between layout-engine.ts and
// layout-params.ts. layout-params.ts calls _currentLayout() (the getter) while
// layout-engine.ts exports getCurrentLayout/setCurrentLayout.
//
// DO NOT add business logic here. This file exists only to satisfy the import
// graph and will be removed once the migration is complete.

export { getCurrentLayout as _currentLayout } from './layout-engine.js';
