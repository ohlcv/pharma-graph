// Tests for src/ui/state.ts — the read-only proxy of UI toggle state.
// Issue #6: previously `uiState.isPanelPinned` and `uiState.tourBarCollapsed`
// were flat boolean fields that *mirrored* the live UiToggle instances
// owned by DetailPanel and TourController. Writing to the field, or
// from the toggle, or both, could silently desync. This file freezes
// the new contract: the field is a read-only getter that proxies to
// the registered toggle, and there's no field at all for
// `tourBarCollapsed` (it never had a consumer).
//
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UiToggle } from './ui-toggle.js';

describe('uiState pin-toggle proxy', () => {
  beforeEach(() => {
    // localStorage guard: jsdom provides one but each test should start fresh.
    localStorage.clear();
  });

  afterEach(() => {
    // Reset the module-level binding. We import via require-style 'await' so
    // we can talk to the *same* module instance state lives in.
    vi.resetModules();
  });

  it('uiState.isPanelPinned is false before any toggle is registered', async () => {
    const { uiState } = await import('./state.js');
    expect(uiState.isPanelPinned).toBe(false);
  });

  it('registered toggle is the sole source of truth for uiState.isPanelPinned', async () => {
    const { uiState, registerPinToggle } = await import('./state.js');
    const fakeEl = document.createElement('button');
    const toggle = new UiToggle({ applyTo: fakeEl, persist: 'test.pin' });
    registerPinToggle(toggle);

    expect(uiState.isPanelPinned).toBe(false);

    toggle.set(true);
    expect(uiState.isPanelPinned).toBe(true);
    expect(toggle.value).toBe(true);

    toggle.toggle();
    expect(uiState.isPanelPinned).toBe(false);
    expect(toggle.value).toBe(false);
  });

  it('unsetting the toggle flips uiState.isPanelPinned back', async () => {
    const { uiState, registerPinToggle } = await import('./state.js');
    const fakeEl = document.createElement('button');
    const toggle = new UiToggle({ applyTo: fakeEl, persist: 'test.pin' });
    registerPinToggle(toggle);

    toggle.set(true);
    expect(uiState.isPanelPinned).toBe(true);

    toggle.set(false);
    expect(uiState.isPanelPinned).toBe(false);
  });

  it('writing uiState.isPanelPinned is a compile-time error, not a silent drift', async () => {
    // Issue #6: the old design let `uiState.isPanelPinned = on` succeed at
    // runtime, silently splitting the field from the live toggle. The new
    // design exposes it as a getter only, so any write fails TypeScript.
    //
    // We can't directly assert the compile error here, but we can prove
    // the runtime invariant: every read reflects the toggle's current
    // value, and any mutation against the proxy object is either a
    // silent no-op or a throw — never a successful field write.
    const { uiState, registerPinToggle } = await import('./state.js');
    const fakeEl = document.createElement('button');
    const toggle = new UiToggle({ applyTo: fakeEl, persist: 'test.pin' });
    registerPinToggle(toggle);

    // Cast through any so we can attempt the forbidden write without a
    // compile error in *this* test file. In strict mode (vitest default)
    // assignment to a getter-only property throws; in sloppy mode it's
    // a silent no-op. Either way, the toggle's value never changes.
    const uiStateMutable = uiState as any;
    try {
      uiStateMutable.isPanelPinned = true;
    } catch {
      // Expected: strict mode throws on read-only property assignment.
    }
    expect(uiState.isPanelPinned).toBe(false);
    expect(toggle.value).toBe(false);
  });

  it('registering a new toggle replaces the previous binding', async () => {
    const { uiState, registerPinToggle } = await import('./state.js');
    const a = new UiToggle({ applyTo: document.createElement('button'), persist: 'a' });
    const b = new UiToggle({ applyTo: document.createElement('button'), persist: 'b' });

    registerPinToggle(a);
    a.set(true);
    expect(uiState.isPanelPinned).toBe(true);

    registerPinToggle(b);
    // b starts fresh — a's value doesn't bleed over.
    expect(uiState.isPanelPinned).toBe(false);

    b.set(true);
    expect(uiState.isPanelPinned).toBe(true);
  });

  it('uiState.tourBarCollapsed field is gone (was a dead mirror)', async () => {
    const { uiState } = await import('./state.js');
    expect('tourBarCollapsed' in uiState).toBe(false);
  });
});
