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
  /** Attribute that mirrors the state via `aria-pressed`. Default true. */
  ariaPressed?: boolean;
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

  /** Subscribe to state changes. Returns an unsubscribe function. */
  listen(cb: (on: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private syncDom(on: boolean): void {
    const el = this.options.applyTo;
    if (!el) return;
    const apply = (e: HTMLElement) => {
      e.classList.toggle(this.options.cssClass, on);
      if (this.options.ariaPressed && 'setAttribute' in e) {
        e.setAttribute('aria-pressed', String(on));
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