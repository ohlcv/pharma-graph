// src/ui/space-state.ts
// Minimal cross-module registry for "which space are we in right now".
//
// Why this exists instead of importing the controller directly: `focus-node.ts`
// (search confirm, detail-panel neighbour click, tour steps) has to make sure a
// node is actually visible before it flies the camera there. If it imported
// `space-controller.ts` it would drag the DOM/menu/toast machinery into every
// module that focuses a node — including the ones unit-tested under `node`
// environment with no DOM at all.
//
// So the controller registers a callback here at install time, and everyone
// else calls the no-op-safe accessor. No DOM, no cytoscape, no cycles.

/** Signature of the controller's visibility guard: returns true if it switched spaces. */
export type EnsureVisibleFn = (nodeId: string) => boolean;

let activeSpaceId: string | null = null;
let ensureVisible: EnsureVisibleFn | null = null;

/** `null` means the full graph — no space filter is applied. */
export function getActiveSpaceId(): string | null {
  return activeSpaceId;
}

export function setActiveSpace(id: string | null): void {
  activeSpaceId = id;
}

/**
 * Called by space-controller during install. Clear with `null` (tests).
 */
export function registerEnsureVisible(fn: EnsureVisibleFn | null): void {
  ensureVisible = fn;
}

/**
 * Make sure `nodeId` can be seen: if it lives in a space other than the active
 * one, the registered guard switches spaces first (instantly, without the
 * travel animation — callers animate the camera themselves right after).
 *
 * Returns true when a space switch happened, so callers that also move the
 * camera can decide whether to animate from the new space framing or jump.
 * Before the controller installs (or in tests) this is a harmless no-op.
 */
export function ensureNodeVisible(nodeId: string): boolean {
  return ensureVisible ? ensureVisible(nodeId) : false;
}
