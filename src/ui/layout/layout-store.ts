// src/ui/layout/layout-store.ts
// Single source of truth for all localStorage keys used by the layout module
// and the advanced-settings container (which holds layout params and future
// settings such as speech preferences).
//
// Key categories
//   params  — per-layout slider values, keyed by layout name
//   ui      — sidebar / mobile bottom-sheet collapse/expand preferences
//
// The "advanced" container (高级设置) is intentionally placed in this file
// because its primary resident is layout params.  Future sub-items (e.g. speech
// settings) share the same container and can reuse these persistence helpers.

const PREFIX = 'pharma-graph';
const NS = `${PREFIX}:layout`;

export const AdvancedStorageKeys = {
  /** Per-layout parameter values (JSON map of key → string value). */
  params: (name: string) => `${NS}:params:${name}`,

  /** Whether the "高级设置" accordion container is open (sidebar / bottom-sheet). */
  advancedOpen: 'pg:layout:advancedOpen',

  /** Whether the "布局参数" sub-item inside 高级设置 is open. */
  advancedLayoutParamsOpen: 'pg:layout:advancedLayoutParamsOpen',
} as const;

// ── Read helpers ──────────────────────────────────────────────────────────────────

export function loadStoredParams(name: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(AdvancedStorageKeys.params(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveStoredParams(name: string, values: Record<string, string>): void {
  try {
    localStorage.setItem(AdvancedStorageKeys.params(name), JSON.stringify(values));
  } catch {
    /* localStorage blocked / quota — silently ignore */
  }
}

export function clearStoredParams(name: string): void {
  try {
    localStorage.removeItem(AdvancedStorageKeys.params(name));
  } catch {
    /* ignore */
  }
}

// ── Advanced container (高级设置) ───────────────────────────────────────────────

export function getAdvancedOpen(): boolean {
  try {
    // Migration: accept the old key so existing users' preferences don't reset.
    const old = localStorage.getItem('pg.bs.advancedOpen');
    if (old !== null) {
      localStorage.setItem(AdvancedStorageKeys.advancedOpen, old);
      localStorage.removeItem('pg.bs.advancedOpen');
    }
    return localStorage.getItem(AdvancedStorageKeys.advancedOpen) === '1';
  } catch {
    return false;
  }
}

export function setAdvancedOpen(open: boolean): void {
  try {
    localStorage.setItem(AdvancedStorageKeys.advancedOpen, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getAdvancedLayoutParamsOpen(): boolean {
  try {
    // Migration: accept the old key.
    const old = localStorage.getItem('pg.bs.layoutSettingOpen');
    if (old !== null) {
      localStorage.setItem(AdvancedStorageKeys.advancedLayoutParamsOpen, old);
      localStorage.removeItem('pg.bs.layoutSettingOpen');
    }
    return localStorage.getItem(AdvancedStorageKeys.advancedLayoutParamsOpen) === '1';
  } catch {
    return false;
  }
}

export function setAdvancedLayoutParamsOpen(open: boolean): void {
  try {
    localStorage.setItem(AdvancedStorageKeys.advancedLayoutParamsOpen, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}
