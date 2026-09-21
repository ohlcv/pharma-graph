// src/ui/layout/layout-store.ts
// Single source of truth for all localStorage keys used by the layout module.
// Grouping them here makes it easy to audit which keys exist, prevents typos
// from silently using the wrong key, and enables future key-versioning if needed.
//
// Key categories
//   params  — per-layout slider values, keyed by layout name
//   ui      — mobile bottom-sheet collapse/expand preferences

const PREFIX = 'pharma-graph';
const NS = `${PREFIX}:layout`;

export const LayoutStorageKeys = {
  /** Per-layout parameter values (JSON map of key → string value). */
  params: (name: string) => `${NS}:params:${name}`,

  /** Whether the mobile "高级设置" accordion section is open. */
  mobileAdvancedOpen: 'pg.bs.advancedOpen',

  /** Whether the mobile "布局设置" sub-accordion inside 高级设置 is open. */
  mobileLayoutSettingOpen: 'pg.bs.layoutSettingOpen',
} as const;

// ── Read helpers ──────────────────────────────────────────────────────────────────

export function loadStoredParams(name: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(LayoutStorageKeys.params(name));
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
    localStorage.setItem(LayoutStorageKeys.params(name), JSON.stringify(values));
  } catch {
    /* localStorage blocked / quota — silently ignore */
  }
}

export function clearStoredParams(name: string): void {
  try {
    localStorage.removeItem(LayoutStorageKeys.params(name));
  } catch {
    /* ignore */
  }
}

export function getMobileAdvancedOpen(): boolean {
  try {
    return localStorage.getItem(LayoutStorageKeys.mobileAdvancedOpen) === '1';
  } catch {
    return false;
  }
}

export function setMobileAdvancedOpen(open: boolean): void {
  try {
    localStorage.setItem(LayoutStorageKeys.mobileAdvancedOpen, open ? '1' : '0');
  } catch { /* ignore */ }
}

export function getMobileLayoutSettingOpen(): boolean {
  try {
    return localStorage.getItem(LayoutStorageKeys.mobileLayoutSettingOpen) === '1';
  } catch {
    return false;
  }
}

export function setMobileLayoutSettingOpen(open: boolean): void {
  try {
    localStorage.setItem(LayoutStorageKeys.mobileLayoutSettingOpen, open ? '1' : '0');
  } catch { /* ignore */ }
}
