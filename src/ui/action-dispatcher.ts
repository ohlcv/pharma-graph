// src/ui/action-dispatcher.ts
// A tiny delegated event dispatcher that replaces inline `onclick="xxx()"`
// handlers (and the `(window as any).xxx = ...` plumbing they depend on).
//
// Usage in HTML:
//   <button data-action="fit">适应</button>
//   <button data-action="run-layout" data-arg="concentric">同心圆</button>
//   <button data-action="toggle-section" data-arg="stats">…</button>
//
// Usage in TS — register the action once, anywhere during boot:
//   registerAction('fit', () => fitGraph(renderer));
//   registerAction('run-layout', (el) => {
//     const name = el.dataset.arg ?? 'cose';
//     runLayout(name, renderer);
//   });
//
// Why a registry, not direct function bindings on each element:
//   - One document-level click listener, instead of N (44 in this app).
//   - Actions are namespaced, so a stray `data-action="foo"` that wasn't
//     registered is a no-op (won't throw `xxx is not a function`).
//   - Plugins / additional UIs (e.g. search results, dev tools) can dispatch
//     programmatically via `dispatchAction('fit')`.

export type ActionHandler = (el: HTMLElement, args: string[]) => void;

const registry = new Map<string, ActionHandler>();

/** Register a handler for an action name. Replaces any existing handler. */
export function registerAction(name: string, handler: ActionHandler): void {
  registry.set(name, handler);
}

/** Unregister an action. Mostly useful in tests. */
export function unregisterAction(name: string): void {
  registry.delete(name);
}

/** Test helper: read-only view of registered actions. */
export function listActions(): string[] {
  return Array.from(registry.keys());
}

let installed = false;

/**
 * Install the document-level click listener. Idempotent — calling twice
 * doesn't add a second listener.
 */
export function installDispatcher(): void {
  if (installed) return;
  installed = true;

  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
    if (!target) return;

    const name = target.dataset['action'];
    if (!name) return;

    const handler = registry.get(name);
    if (!handler) {
      // Unregistered action — silent no-op so unknown attributes don't crash.
      // Surface in dev console for easier debugging.
      if (import.meta.env?.DEV) {
        console.warn(`[action-dispatcher] no handler for action="${name}"`);
      }
      return;
    }

    const args = readArgs(target);
    handler(target, args);
  });
}

/** Programmatically trigger an action — useful for keyboard shortcuts, tests. */
export function dispatchAction(name: string, args: string[] = []): void {
  const handler = registry.get(name);
  if (!handler) {
    if (import.meta.env?.DEV) {
      console.warn(`[action-dispatcher] dispatch: no handler for action="${name}"`);
    }
    return;
  }
  // Synthesize a throwaway element so the handler signature stays uniform.
  const synthetic = document.createElement('div');
  handler(synthetic, args);
}

// ── Internals ────────────────────────────────────────────────────────────────

/**
 * Read action args from the clicked element.
 *
 * Resolution order:
 *   1. `data-args` — JSON array (preferred for multi-arg)
 *   2. `data-arg`  — single string (most common — "section id", "layout name")
 *   3. neither → empty array
 */
function readArgs(el: HTMLElement): string[] {
  const json = el.dataset['args'];
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fall through to data-arg */
    }
  }
  const single = el.dataset['arg'];
  return single !== undefined ? [single] : [];
}

/** Reset internal state — test-only. */
export function _resetForTests(): void {
  registry.clear();
  installed = false;
}
