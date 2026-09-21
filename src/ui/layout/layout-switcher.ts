// src/ui/layout/layout-switcher.ts
// Desktop layout-switcher dropdown open/close + outside-click + Escape dismissal.
//
// Responsibilities
//   - `toggleLayoutMenu()` — open/close the dropdown
//   - `closeLayoutMenu()` — force-close
//   - `installLayoutMenuDismissHandlers()` — once-per-app click-outside + Esc
//
// This file was migrated from layout-menu.ts. The action registration
// (`registerAction('toggle-layout-menu', …)`) lives in action-handlers.ts and
// does not need to change — only its import path does.

let _dismissInstalled = false;

/**
 * Open the layout-switcher dropdown anchored beneath the toggle button.
 * Closes it if already open.
 */
export function toggleLayoutMenu(): void {
  const root = document.getElementById('layout-switcher');
  const btn = document.getElementById('layout-switcher-btn');
  const menu = document.getElementById('layout-switcher-menu');
  if (!btn || !menu) return;

  const open = !menu.classList.contains('visible');
  if (!open) {
    closeLayoutMenu();
    return;
  }
  const r = btn.getBoundingClientRect();
  menu.style.top = `${r.bottom + 6}px`;
  menu.style.left = `${r.left}px`;
  menu.style.maxWidth = `${r.width}px`;
  btn.setAttribute('aria-expanded', 'true');
  root?.classList.add('visible');
  menu.classList.add('visible');
}

/** Close the dropdown and reset its absolute positioning. */
export function closeLayoutMenu(): void {
  const root = document.getElementById('layout-switcher');
  const btn = document.getElementById('layout-switcher-btn');
  const menu = document.getElementById('layout-switcher-menu');
  root?.classList.remove('visible');
  menu?.classList.remove('visible');
  if (menu) {
    menu.style.top = '';
    menu.style.left = '';
    menu.style.maxWidth = '';
  }
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/**
 * Install the once-per-app outside-click + Escape handlers that close the menu.
 * Idempotent — safe to call from multiple boot paths.
 */
export function installLayoutMenuDismissHandlers(): void {
  if (_dismissInstalled) return;
  _dismissInstalled = true;

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('layout-switcher-menu');
    if (!menu || !menu.classList.contains('visible')) return;
    const btn = document.getElementById('layout-switcher-btn');
    const target = e.target as Node | null;
    // Dismiss when the click is outside both the menu and the toggle button.
    // (Clicking inside the button — including on its inner SVG — must not
    // close the menu, because that's how the user toggles it.)
    if (target && !menu.contains(target) && !(btn?.contains(target) ?? false)) {
      closeLayoutMenu();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const menu = document.getElementById('layout-switcher-menu');
    if (!menu || !menu.classList.contains('visible')) return;
    closeLayoutMenu();
  });
}

/** Test-only: reset the install guard. */
export function _resetLayoutSwitcherForTests(): void {
  _dismissInstalled = false;
}

/** @deprecated alias for _resetLayoutSwitcherForTests — kept for test compatibility */
export const _resetLayoutMenuForTests = _resetLayoutSwitcherForTests;
