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
 * `console.info(...)` gated on `import.meta.env.DEV`. Use this for
 *   pipeline / boot diagnostics — anything that helps a developer
 *   confirm the wiring but isn't useful to end users. Production
 *   builds tree-shake the call site to a no-op.
 */
export function logInfo(msg: string, payload?: unknown): void {
  if (!isDev()) return;
  if (payload === undefined) console.info(TAG, msg);
  else console.info(TAG, msg, payload);
}
