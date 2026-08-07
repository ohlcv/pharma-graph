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

describe('UiToggle.resyncFromDom — DOM was rewritten out-of-band', () => {
  // The case that motivated this method:
  //   1. App loads — UiToggle inits from DOM, this.on = false (sidebar visible).
  //   2. User toggles sidebar hidden — this.on = true, DOM .hidden = true.
  //   3. User enters bigscreen; bigscreen.ts captureSidebar() snapshots
  //      the (already-hidden) state. UI chrome (toolbar/strip) is hidden
  //      so the user can't toggle from here on.
  //   4. User exits bigscreen; bigscreen.ts restoreSidebar() rewrites the
  //      sidebar DOM directly to match the snapshot. This is fine because
  //      the snapshot says hidden=true. BUT — if some other code path
  //      ever changes the sidebar DOM mid-bigscreen, bigscreen.ts would
  //      write that (stale) state back on exit.
  //   5. User toggles sidebar — without resyncFromDom, this.on is still
  //      true (from step 2), so set(!true) = set(false) flips the DOM to
  //      visible. But if step 4 already wrote hidden=false, the user
  //      expected a "show" click to leave it visible — instead they see
  //      sidebar disappear (or vice versa). Looks like the button "doesn't
  //      work".
  // resyncFromDom() re-reads the DOM and updates this.on BEFORE the
  // toggle() runs, so the toggle goes the right direction.

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('brings this.on back into agreement when DOM was set externally', () => {
    const sidebar = document.createElement('div');
    sidebar.id = 'sidebar';
    document.body.appendChild(sidebar);

    const t = new UiToggle({
      applyTo: sidebar,
      cssClass: 'hidden',
      initial: false,
      persist: 'test.sidebar.hidden',
    });
    expect(t.value).toBe(false);

    // User toggles sidebar hidden — UiToggle does the DOM write itself.
    t.toggle();
    expect(sidebar.classList.contains('hidden')).toBe(true);
    expect(t.value).toBe(true);

    // External code (e.g. bigscreen restore) flips the DOM without
    // going through the toggle. This simulates "DOM and memory disagree".
    sidebar.classList.remove('hidden');
    expect(sidebar.classList.contains('hidden')).toBe(false);
    expect(t.value).toBe(true); // still says on, even though DOM is off

    // Without resync: toggle() would call set(!true) = set(false) →
    // sidebar.classList.add('hidden') → user sees sidebar disappear on a
    // button they expected to be a "show" click.
    // With resync: toggle() flips true → false → sidebar goes hidden.
    t.resyncFromDom();
    expect(t.value).toBe(false);

    t.toggle();
    expect(sidebar.classList.contains('hidden')).toBe(true);
    expect(t.value).toBe(true);
  });

  it('persists the resynced value so future page loads agree with the DOM', () => {
    const sidebar = document.createElement('div');
    document.body.appendChild(sidebar);

    const t = new UiToggle({
      applyTo: sidebar,
      cssClass: 'hidden',
      initial: false,
      persist: 'test.sidebar.hidden.2',
    });
    expect(t.value).toBe(false);

    // External rewrite
    sidebar.classList.add('hidden');

    // Resync should update BOTH memory AND persistence (localStorage).
    t.resyncFromDom();
    expect(t.value).toBe(true);
    expect(localStorage.getItem('test.sidebar.hidden.2')).toBe('true');

    // Fresh UiToggle on a new mount reads the persisted value.
    const fresh = new UiToggle({
      applyTo: sidebar,
      cssClass: 'hidden',
      persist: 'test.sidebar.hidden.2',
    });
    expect(fresh.value).toBe(true);

    localStorage.removeItem('test.sidebar.hidden.2');
  });

  it('is a no-op when DOM and memory already agree', () => {
    const sidebar = document.createElement('div');
    document.body.appendChild(sidebar);
    const t = new UiToggle({
      applyTo: sidebar,
      cssClass: 'hidden',
      initial: true,
    });
    expect(t.value).toBe(true);
    expect(sidebar.classList.contains('hidden')).toBe(true);

    // Should not throw, should not fire onChange (which would re-resize cy)
    let fired = 0;
    t.listen(() => { fired++; });
    t.resyncFromDom();
    expect(fired).toBe(0);
    expect(t.value).toBe(true);
  });
});