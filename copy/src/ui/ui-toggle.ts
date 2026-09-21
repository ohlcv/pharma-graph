/**
 * UiToggle — single source of truth for boolean UI flags.
 *
 * Replaces the previously scattered `uiState.isPanelPinned`, `tourBarCollapsed`,
 * and `sectionState.*` fields. Each toggle owns:
 *  - its persisted value (optional localStorage key)
 *  - the element(s) whose class should mirror its on/off state
 *  - a change callback for cross-module reactions
 *
 * Usage:
 *   const sidebarToggle = new UiToggle({
 *     initial:  false,
 *     persist:  'sidebar.collapsed',
 *     applyTo:  document.getElementById('sidebar'),
 *     onChange: (open) => layout.refresh(),
 *   });
 *   sidebarToggle.toggle();
 *
 * `applyTo` may also be an array of elements; each gets the class added/removed.
 * `cssClass` defaults to 'is-active'.
 */

export interface UiToggleOptions {
  /** Initial state (default false). */
  initial?: boolean;
  /** If set, state is mirrored to localStorage under this key. */
  persist?: string;
  /** Single element or array of elements that get `cssClass` toggled. */
  applyTo?: HTMLElement | HTMLElement[];
  /** Class added when on, removed when off. Default 'is-active'. */
  cssClass?: string;
  /**
   * Attribute that mirrors the state via `aria-pressed`. Default true.
   * Set to false for elements that should advertise themselves as
   * collapse/expand toggles via `aria-expanded` instead
   * (`ariaExpanded: true`).
   */
  ariaPressed?: boolean;
  /**
   * Mirror state via `aria-expanded`. Use for collapse/expand toggles
   * where `aria-pressed` would be semantically wrong. Mutually
   * exclusive with `ariaPressed` — if both are set, `aria-expanded`
   * wins for the elements in `applyTo`. Default false.
   */
  ariaExpanded?: boolean;
  /** Optional change listener. */
  onChange?: (on: boolean) => void;
}

function readPersisted(key: string | undefined): boolean | null {
  if (typeof localStorage === 'undefined' || !key) return null;
  const raw = localStorage.getItem(key);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function writePersisted(key: string | undefined, on: boolean): void {
  if (typeof localStorage === 'undefined' || !key) return;
  try {
    localStorage.setItem(key, String(on));
  } catch {
    // localStorage may be full / disabled — silently keep in-memory state.
  }
}

export class UiToggle {
  private on: boolean;
  private listeners = new Set<(on: boolean) => void>();
  readonly options: Required<Omit<UiToggleOptions, 'persist' | 'applyTo' | 'onChange'>> &
    Pick<UiToggleOptions, 'persist' | 'applyTo' | 'onChange'>;

  constructor(opts: UiToggleOptions = {}) {
    const persisted = readPersisted(opts.persist);
    this.on = persisted ?? opts.initial ?? false;
    this.options = {
      initial: opts.initial ?? false,
      cssClass: opts.cssClass ?? 'is-active',
      ariaPressed: opts.ariaPressed ?? true,
      ariaExpanded: opts.ariaExpanded ?? false,
      persist: opts.persist,
      applyTo: opts.applyTo,
      onChange: opts.onChange,
    };
    // Apply initial visual state without firing onChange (we'd fire later
    // consumers too early on first paint).
    this.syncDom(this.on);
  }

  /** Current state. */
  get value(): boolean {
    return this.on;
  }

  /** Set state explicitly (and persist if configured). */
  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    writePersisted(this.options.persist, on);
    this.syncDom(on);
    this.notify();
  }

  /** Flip the state and return the new value. */
  toggle(): boolean {
    this.set(!this.on);
    return this.on;
  }

  /**
   * Force the toggle's in-memory state (and persisted state) to match
   * whatever the DOM currently says. Does NOT fire onChange — the
   * expectation is that the DOM already reflects the intended state
   * (e.g. it was rewritten directly by another module), and we just
   * need to bring `this.on` into agreement so the next toggle() does
   * the right thing.
   *
   * The case where this was needed in practice:
   *  - bigscreen.ts captures/restores sidebar DOM directly via
   *    `sidebar.classList.toggle('hidden', snap.hidden)`.
   *  - That bypasses the UiToggle's `set()`, so `this.on` stays at
   *    whatever it was before bigscreen.
   *  - After exit, the DOM and memory can disagree.
   *  - First click computes `set(!this.on)` based on stale memory —
   *    possibly toggling in the OPPOSITE direction the user expects.
   *
   * Calling this on every toggleSidebar click closes that loop.
   */
  resyncFromDom(): void {
    const el = this.options.applyTo;
    if (!el) return;
    const target = Array.isArray(el) ? el[0] : el;
    if (!target) return;
    const current = target.classList.contains(this.options.cssClass);
    if (current === this.on) return;
    this.on = current;
    writePersisted(this.options.persist, current);
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  listen(cb: (on: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private syncDom(on: boolean): void {
    const el = this.options.applyTo;
    if (!el) return;
    const ariaExpanded = this.options.ariaExpanded;
    const ariaPressed = this.options.ariaPressed && !ariaExpanded;
    const apply = (e: HTMLElement) => {
      e.classList.toggle(this.options.cssClass, on);
      if ('setAttribute' in e) {
        // `aria-expanded` wins when both are set — see `ariaExpanded`
        // JSDoc. We still emit `aria-pressed` only when `aria-expanded`
        // is off, so the toggle's element doesn't carry both attributes
        // (screen readers can disagree about which to announce).
        if (ariaExpanded) e.setAttribute('aria-expanded', String(on));
        else if (ariaPressed) e.setAttribute('aria-pressed', String(on));
      }
    };
    if (Array.isArray(el)) el.forEach(apply);
    else apply(el);
  }

  private notify(): void {
    this.options.onChange?.(this.on);
    this.listeners.forEach((cb) => cb(this.on));
  }
}