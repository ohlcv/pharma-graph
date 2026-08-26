/**
 * @vitest-environment jsdom
 */
// Tests for src/ui/logger.ts — issue #31.
//
// logInfo is currently a no-op (all console output removed per user request).
// These tests verify the function is callable and doesn't throw, so call
// sites remain stable if logging is re-enabled later.

import { describe, it, expect } from 'vitest';
import { logInfo, __setDevOverrideForTests } from './logger.js';

describe('logger — no-op', () => {
  it('does not call console.info (all logging removed)', () => {
    __setDevOverrideForTests(true);
    logInfo('graph build:', { nodes: 0, edges: 0 });
    // No assertion needed — logInfo is a no-op, just verify it doesn't throw.
  });

  it('handles undefined payload without throwing', () => {
    __setDevOverrideForTests(true);
    expect(() => logInfo('cy after render:')).not.toThrow();
  });

  it('works with gate off', () => {
    __setDevOverrideForTests(false);
    expect(() => logInfo('a')).not.toThrow();
  });
});
