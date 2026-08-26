// src/ui/logger.ts
// Drop-in replacement for `console.info(...)` that respects Vite's
// dev/prod gate. Issue #31: the diagnostic logs in main.ts
// (graph-build summary, cy render summary) were always on; users in
// production see them by default, which leaks internal pipeline
// state into the browser console. Switch to `logInfo(...)` so they
// only fire during `vite dev`.

const TAG = '[pharma-graph]';

/** Test-only override. The default vitest config sets DEV=true, so
 *  we expose a small switch here rather than mutating `import.meta.env`
 *  (which isn't writable under jsdom). Production code never touches
 *  this — it's prefixed `__set` so it's easy to grep for misuse. */
let devOverride: boolean | null = null;

/** @internal — see `devOverride`. Tests use this to flip the gate
 *  without depending on vitest's `MODE` env. */
export function __setDevOverrideForTests(value: boolean | null): void {
  devOverride = value;
}

/** Read `import.meta.env.DEV` through a narrow cast. */
function devFromVite(): boolean {
  const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
  return env?.DEV === true;
}

function isDev(): boolean {
  if (devOverride !== null) return devOverride;
  return devFromVite();
}

/**
 * Dev-gated log function. Currently a no-op — all console output has been
 *   removed per user request. The function is kept as a stable API so
 *   call sites don't need to change if logging is re-enabled later.
 */
export function logInfo(_msg: string, _payload?: unknown): void {
  // No-op — intentionally silent.
}
