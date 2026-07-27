/**
 * @vitest-environment jsdom
 */
// src/ui/__tests__/bigscreen.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isBigscreen, exitBigscreen, enterBigscreen, toggleBigscreen, initBigscreen, registerFitFn } from '../bigscreen.js';

const CLS = 'bigscreen';

function mockFullscreenApi(): void {
  Object.defineProperty(document, 'fullscreenElement', {
    value: null,
    writable: true,
    configurable: true,
  });
  (document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void>; exitFullscreen?: () => Promise<void> }).requestFullscreen = vi.fn().mockResolvedValue(undefined);
  document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
}

function addBigscreenClass(): void {
  document.documentElement.classList.add(CLS);
}
function removeBigscreenClass(): void {
  document.documentElement.classList.remove(CLS);
}

describe('bigscreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset state
    document.documentElement.classList.remove(CLS);
    localStorage.clear();
    // Inject a minimal hint container
    const existing = document.getElementById('bigscreen-hint-root');
    if (existing) existing.remove();
    const root = document.createElement('div');
    root.id = 'bigscreen-hint-root';
    document.body.appendChild(root);
    mockFullscreenApi();
  });

  afterEach(() => {
    const root = document.getElementById('bigscreen-hint-root');
    if (root) root.remove();
  });

  // ── isBigscreen ───────────────────────────────────────────────────────────────

  it('returns false when bigscreen class is absent', () => {
    expect(isBigscreen()).toBe(false);
  });

  it('returns true when bigscreen class is present', () => {
    addBigscreenClass();
    expect(isBigscreen()).toBe(true);
  });

  // ── enterBigscreen ──────────────────────────────────────────────────────────

  it('adds the bigscreen class', async () => {
    await enterBigscreen();
    expect(document.documentElement.classList.contains(CLS)).toBe(true);
  });

  it('calls requestFullscreen', async () => {
    await enterBigscreen();
    expect((document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> }).requestFullscreen).toHaveBeenCalled();
  });

  it('shows the hint toast', async () => {
    await enterBigscreen();
    const hint = document.querySelector('.bigscreen-hint');
    expect(hint).not.toBeNull();
  });

  it('idempotent: second enter is no-op', async () => {
    await enterBigscreen();
    const req = vi.fn();
    (document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> }).requestFullscreen = req;
    await enterBigscreen();
    expect(req).not.toHaveBeenCalled();
  });

  // ── exitBigscreen ───────────────────────────────────────────────────────────

  it('removes the bigscreen class', async () => {
    addBigscreenClass();
    await exitBigscreen();
    expect(document.documentElement.classList.contains(CLS)).toBe(false);
  });

  it('calls exitFullscreen when in fullscreen', async () => {
    addBigscreenClass();
    Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, writable: true, configurable: true });
    await exitBigscreen();
    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it('idempotent: second exit is no-op', async () => {
    const req = vi.fn();
    document.exitFullscreen = req;
    await exitBigscreen();
    expect(req).not.toHaveBeenCalled();
  });

  // ── toggleBigscreen ─────────────────────────────────────────────────────────

  it('toggles from off to on', async () => {
    expect(isBigscreen()).toBe(false);
    await toggleBigscreen();
    expect(isBigscreen()).toBe(true);
  });

  it('toggles from on to off', async () => {
    addBigscreenClass();
    await toggleBigscreen();
    expect(isBigscreen()).toBe(false);
  });

  // ── initBigscreen + ESC key ─────────────────────────────────────────────────

  it('ESC exits bigscreen when active', async () => {
    addBigscreenClass();
    initBigscreen();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    window.dispatchEvent(event);
    // The handler is async, give it a tick.
    await new Promise(r => setTimeout(r, 0));
    expect(isBigscreen()).toBe(false);
  });

  it('ESC does nothing when inactive', async () => {
    initBigscreen();
    const before = isBigscreen();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    window.dispatchEvent(event);
    await new Promise(r => setTimeout(r, 0));
    expect(isBigscreen()).toBe(before);
  });

  // ── initBigscreen + fullscreenchange recovery ────────────────────────────────

  it('fullscreenchange removes class if browser forces exit', async () => {
    addBigscreenClass();
    initBigscreen();
    Object.defineProperty(document, 'fullscreenElement', { value: null, writable: true, configurable: true });
    document.dispatchEvent(new Event('fullscreenchange'));
    await new Promise(r => setTimeout(r, 0));
    expect(document.documentElement.classList.contains(CLS)).toBe(false);
  });

  // ── registerFitFn ───────────────────────────────────────────────────────────

  it('registerFitFn stores the callback', () => {
    const fn = vi.fn();
    registerFitFn(fn);
    // _fitRenderer is internal — just verify no throw.
    expect(() => registerFitFn(vi.fn())).not.toThrow();
  });
});
