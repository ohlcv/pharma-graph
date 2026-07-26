/**
 * @vitest-environment jsdom
 */
// Tests for src/ui/ui-toggle.ts — issue #29 added `ariaExpanded`
// support so collapse handles can advertise themselves as
// expand/collapse controls (`aria-expanded="true"`) instead of being
// mis-typed as sticky toggle buttons (`aria-pressed`).

import { describe, it, expect, beforeEach } from 'vitest';
import { UiToggle } from './ui-toggle.js';

describe('UiToggle — issue #29 ARIA semantics', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('defaults to aria-pressed when neither option is set', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    const t = new UiToggle({ applyTo: btn, initial: false });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('aria-expanded')).toBeNull();

    t.toggle();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-expanded')).toBeNull();
  });

  it('emits aria-expanded and suppresses aria-pressed when ariaExpanded is set', () => {
    // Regression: a tour collapse handle used to get `aria-pressed`,
    // which misrepresents it as a sticky on/off button.
    const handle = document.createElement('div');
    document.body.appendChild(handle);
    const t = new UiToggle({ applyTo: handle, ariaExpanded: true, initial: true });
    expect(handle.getAttribute('aria-expanded')).toBe('true');
    expect(handle.getAttribute('aria-pressed')).toBeNull();

    t.toggle();
    expect(handle.getAttribute('aria-expanded')).toBe('false');
    expect(handle.getAttribute('aria-pressed')).toBeNull();
  });

  it('applies aria-expanded to every element when applyTo is an array', () => {
    // Tour status collapses both the bar and its chevron together.
    const bar = document.createElement('div');
    const chev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(bar, chev);
    const t = new UiToggle({
      applyTo: [bar as unknown as HTMLElement, chev as unknown as HTMLElement],
      ariaExpanded: true,
      initial: false,
    });
    expect(bar.getAttribute('aria-expanded')).toBe('false');
    expect(chev.getAttribute('aria-expanded')).toBe('false');
    t.toggle();
    expect(bar.getAttribute('aria-expanded')).toBe('true');
    expect(chev.getAttribute('aria-expanded')).toBe('true');
  });

  it('persisted state restores aria-expanded value on next mount', () => {
    const key = 'test.toggle.collapsed';
    localStorage.setItem(key, 'true');

    const handle = document.createElement('div');
    document.body.appendChild(handle);
    new UiToggle({ applyTo: handle, ariaExpanded: true, persist: key });
    expect(handle.getAttribute('aria-expanded')).toBe('true');

    localStorage.removeItem(key);
  });
});