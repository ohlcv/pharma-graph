/**
 * @vitest-environment jsdom
 */
// Tests for src/ui/logger.ts — issue #31.
//
// The diagnostic logs in main.ts (`console.info('[pharma-graph] ...')`)
// were always on, dumping parser / render state into the browser console
// even in production. `logInfo` gates on `import.meta.env.DEV`, which
// vitest's vite-based runner sets to `true` by default; we test the gate
// via the `__setDevOverrideForTests` hook rather than mutating
// `import.meta.env` (jsdom refuses to redefine it once read).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logInfo, __setDevOverrideForTests } from './logger.js';

describe('logger — issue #31 DEV gate', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    __setDevOverrideForTests(null);
  });

  it('does NOT call console.info when the gate is off (production)', () => {
    __setDevOverrideForTests(false);
    logInfo('graph build:', { nodes: 0, edges: 0 });
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('DOES call console.info when the gate is on (dev)', () => {
    __setDevOverrideForTests(true);
    logInfo('graph build:', { nodes: 12, edges: 30 });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const args = infoSpy.mock.calls[0];
    expect(args[0]).toBe('[pharma-graph]');
    expect(args[1]).toBe('graph build:');
    expect(args[2]).toEqual({ nodes: 12, edges: 30 });
  });

  it('skips the trailing `undefined` when no payload is passed', () => {
    // console.info collapses omitted args on output, so emitting
    // `undefined` literally would surface as "undefined" in devtools.
    __setDevOverrideForTests(true);
    logInfo('cy after render:');
    const args = infoSpy.mock.calls[0];
    expect(args.length).toBe(2);
  });

  it('lets a fresh override clear itself', () => {
    // First test — gated off.
    __setDevOverrideForTests(false);
    logInfo('a');
    expect(infoSpy).not.toHaveBeenCalled();

    // Override cleared — falls back to the Vite flag. Whatever vitest
    // currently reports is fine; we only assert that the call site
    // doesn't throw.
    __setDevOverrideForTests(null);
    expect(() => logInfo('b')).not.toThrow();
  });
});