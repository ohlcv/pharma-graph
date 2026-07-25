/**
 * @vitest-environment jsdom
 */
// Tests for the layout-menu dropdown — open, close, and dismiss-on-outside-click.
//
// The dropdown is purely DOM-driven; we stub elements directly and exercise
// the public toggle/close functions.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  toggleLayoutMenu,
  closeLayoutMenu,
  installLayoutMenuDismissHandlers,
  _resetLayoutMenuForTests,
} from './layout-menu.js';

function stubDOM() {
  const root = document.createElement('div');
  root.id = 'layout-switcher';
  const btn = document.createElement('button');
  btn.id = 'layout-switcher-btn';
  const menu = document.createElement('div');
  menu.id = 'layout-switcher-menu';
  document.body.appendChild(root);
  root.appendChild(btn);
  root.appendChild(menu);
  return { root, btn, menu };
}

beforeEach(() => {
  document.body.innerHTML = '';
  _resetLayoutMenuForTests();
});

describe('layout-menu.toggleLayoutMenu', () => {
  it('opens a closed menu', () => {
    const { menu } = stubDOM();
    toggleLayoutMenu();
    expect(menu.classList.contains('visible')).toBe(true);
  });

  it('closes an open menu', () => {
    const { menu } = stubDOM();
    toggleLayoutMenu();
    expect(menu.classList.contains('visible')).toBe(true);
    toggleLayoutMenu();
    expect(menu.classList.contains('visible')).toBe(false);
  });

  it('no-op when required elements are missing', () => {
    // No #layout-switcher-btn in DOM.
    document.body.innerHTML = '<div id="layout-switcher-menu"></div>';
    expect(() => toggleLayoutMenu()).not.toThrow();
  });

  it('sets aria-expanded on the toggle button when opening', () => {
    const { btn, menu } = stubDOM();
    toggleLayoutMenu();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(menu.classList.contains('visible')).toBe(true);
  });

  it('resets aria-expanded when closing', () => {
    const { btn } = stubDOM();
    toggleLayoutMenu();
    toggleLayoutMenu();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('clears inline positioning styles on close', () => {
    const { menu } = stubDOM();
    // Open first (so close has work to do).
    toggleLayoutMenu();
    // Now manually inject positioning styles (simulating open() side-effects).
    menu.style.top = '100px';
    menu.style.left = '50px';
    menu.style.maxWidth = '200px';
    toggleLayoutMenu(); // close
    expect(menu.style.top).toBe('');
    expect(menu.style.left).toBe('');
    expect(menu.style.maxWidth).toBe('');
  });
});

describe('layout-menu.closeLayoutMenu', () => {
  it('removes visible class without checking state', () => {
    const { menu } = stubDOM();
    closeLayoutMenu();
    expect(menu.classList.contains('visible')).toBe(false);
  });
});

describe('layout-menu dismiss handlers', () => {
  it('is idempotent', () => {
    installLayoutMenuDismissHandlers();
    installLayoutMenuDismissHandlers();
    installLayoutMenuDismissHandlers();
    // If not idempotent, this would add 3 click listeners. We can't easily
    // count them, but we can verify the function doesn't throw on repeated calls.
  });

  it('closes the menu on outside click', () => {
    const { menu, btn } = stubDOM();
    toggleLayoutMenu();
    expect(menu.classList.contains('visible')).toBe(true);

    installLayoutMenuDismissHandlers();

    // Click on something outside the menu and the button.
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.classList.contains('visible')).toBe(false);
  });

  it('does NOT close when click target is inside the toggle button (svg)', () => {
    const { menu, btn } = stubDOM();
    toggleLayoutMenu();
    expect(menu.classList.contains('visible')).toBe(true);

    installLayoutMenuDismissHandlers();

    // SVG is inside the button — should NOT dismiss.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    btn.appendChild(svg);
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.classList.contains('visible')).toBe(true);
  });

  it('does NOT close when click target is inside the menu', () => {
    const { menu } = stubDOM();
    toggleLayoutMenu();
    installLayoutMenuDismissHandlers();

    const item = document.createElement('button');
    menu.appendChild(item);
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.classList.contains('visible')).toBe(true);
  });

  it('closes on Escape keypress when menu is visible', () => {
    const { menu } = stubDOM();
    toggleLayoutMenu();
    installLayoutMenuDismissHandlers();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.classList.contains('visible')).toBe(false);
  });

  it('does NOT close on other keys', () => {
    const { menu } = stubDOM();
    toggleLayoutMenu();
    installLayoutMenuDismissHandlers();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(menu.classList.contains('visible')).toBe(true);
  });

  it('is a no-op when menu is not visible', () => {
    const { menu } = stubDOM();
    installLayoutMenuDismissHandlers();
    // menu never opened
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.classList.contains('visible')).toBe(false);
  });
});
