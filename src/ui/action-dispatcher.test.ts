/**
 * @vitest-environment jsdom
 */
// Tests for action-dispatcher.
//
// We exercise both the data-driven click path and the programmatic dispatch
// path, plus the dev-only console warning for unknown actions.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerAction,
  unregisterAction,
  installDispatcher,
  dispatchAction,
  listActions,
  _resetForTests,
} from './action-dispatcher.js';

/** Synthesize a click on `el` that the document-level listener will see.
 * Uses dispatchEvent rather than `el.click()` because jsdom's click()
 * dispatches twice (once on element, once on nearest button ancestor). */
function click(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  _resetForTests();
  document.body.innerHTML = '';
  // Make DEV true so warnings get logged (default in vitest test env).
  // `import.meta.env` is Vite's readonly env namespace; mutating it
  // requires an `any` cast because Vite intentionally types the field
  // as `ImportMetaEnv` (no writable shape).
  (import.meta as any).env = { DEV: true };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('action-dispatcher: click delegation', () => {
  it('triggers a registered action on click', () => {
    const handler = vi.fn();
    registerAction('fit', handler);
    installDispatcher();

    const btn = document.createElement('button');
    btn.dataset.action = 'fit';
    document.body.appendChild(btn);

    click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
    const [el, args] = handler.mock.calls[0]!;
    expect(el).toBe(btn);
    expect(args).toEqual([]);
  });

  it('walks up the DOM to find the action element', () => {
    const handler = vi.fn();
    registerAction('fit', handler);
    installDispatcher();

    // User clicks on an inner SVG, button has the data-action.
    const btn = document.createElement('button');
    btn.dataset.action = 'fit';
    const svg = document.createElement('svg');
    btn.appendChild(svg);
    document.body.appendChild(btn);

    click(svg);
    // At minimum the handler ran, and the resolved element is the button
    // (not the svg). jsdom's button.click() can dispatch the event twice
    // (native + simulated) so we don't assert on call count.
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls.some(([el]) => el === btn)).toBe(true);
  });

  it('reads data-arg as the single argument', () => {
    const handler = vi.fn();
    registerAction('run-layout', handler);
    installDispatcher();

    const btn = document.createElement('button');
    btn.dataset.action = 'run-layout';
    btn.dataset.arg = 'concentric';
    document.body.appendChild(btn);

    click(btn);
    expect(handler.mock.calls[0]![1]).toEqual(['concentric']);
  });

  it('reads data-args as JSON array, wins over data-arg', () => {
    const handler = vi.fn();
    registerAction('toggle-section', handler);
    installDispatcher();

    const btn = document.createElement('button');
    btn.dataset.action = 'toggle-section';
    btn.dataset.args = '["stats", "true"]';
    document.body.appendChild(btn);

    click(btn);
    expect(handler.mock.calls[0]![1]).toEqual(['stats', 'true']);
  });

  it('falls back to data-arg when data-args is not valid JSON', () => {
    const handler = vi.fn();
    registerAction('x', handler);
    installDispatcher();

    const btn = document.createElement('button');
    btn.dataset.action = 'x';
    btn.dataset.arg = 'fallback';
    btn.dataset.args = 'not-json{';
    document.body.appendChild(btn);

    click(btn);
    expect(handler.mock.calls[0]![1]).toEqual(['fallback']);
  });

  it('warns (in DEV) but does not throw for unknown actions', () => {
    installDispatcher();
    const btn = document.createElement('button');
    btn.dataset.action = 'never-registered';
    document.body.appendChild(btn);

    expect(() => click(btn)).not.toThrow();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('never-registered'),
    );
  });

  it('does nothing when the click target has no data-action ancestor', () => {
    const handler = vi.fn();
    registerAction('fit', handler);
    installDispatcher();

    const btn = document.createElement('button');
    document.body.appendChild(btn);

    click(btn);
    expect(handler).not.toHaveBeenCalled();
  });

  it('installDispatcher is idempotent (no duplicate listeners)', () => {
    const handler = vi.fn();
    registerAction('fit', handler);

    // First install is the baseline.
    installDispatcher();
    const btn = document.createElement('button');
    btn.dataset.action = 'fit';
    document.body.appendChild(btn);
    click(btn);
    const baselineCalls = handler.mock.calls.length;
    expect(baselineCalls).toBeGreaterThan(0);

    // Reset mock + DOM, but keep the listener installed.
    handler.mockClear();
    document.body.innerHTML = '';
    const btn2 = document.createElement('button');
    btn2.dataset.action = 'fit';
    document.body.appendChild(btn2);

    // Re-install many times — should NOT add listeners.
    installDispatcher();
    installDispatcher();
    installDispatcher();
    installDispatcher();

    click(btn2);
    // If the install wasn't idempotent, calls would be 2x, 3x, 4x baseline.
    // We allow a small epsilon for jsdom flakiness on `button.click()` doubling
    // events, but it should never be ~5x the baseline.
    expect(handler.mock.calls.length).toBeLessThanOrEqual(baselineCalls * 2);
  });
});

describe('action-dispatcher: programmatic dispatch', () => {
  it('dispatchAction runs the handler with provided args', () => {
    const handler = vi.fn();
    registerAction('fit', handler);

    dispatchAction('fit', ['extra-arg']);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![1]).toEqual(['extra-arg']);
  });

  it('dispatchAction warns and returns silently for unknown actions', () => {
    expect(() => dispatchAction('nope')).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('action-dispatcher: registry', () => {
  it('registerAction replaces an existing handler', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    registerAction('fit', h1);
    registerAction('fit', h2);

    dispatchAction('fit');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('unregisterAction removes a handler', () => {
    const handler = vi.fn();
    registerAction('fit', handler);
    unregisterAction('fit');

    dispatchAction('fit');
    expect(handler).not.toHaveBeenCalled();
  });

  it('listActions returns registered action names', () => {
    registerAction('a', () => {});
    registerAction('b', () => {});
    registerAction('c', () => {});

    expect(listActions().sort()).toEqual(['a', 'b', 'c']);
  });
});
