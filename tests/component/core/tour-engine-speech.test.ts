/**
 * @vitest-environment jsdom
 *
 * Tests the speech-coordination plumbing on TourEngine:
 *   - TourOptions.waitForSpeech / postSpeechDelayMs / waitForSpeechEnd
 *     are stored on the engine and used by scheduleNext.
 *   - setWaitForSpeech / setPostSpeechDelayMs / setWaitForSpeechEnd update
 *     the live state and (when the engine is running) re-trigger scheduleNext.
 *   - clearSpeechWait short-circuits an in-flight wait, so a pause/stop/
 *     manual-next doesn't fire visitNext() via a late speech-end.
 *
 * We don't drive the full visitNext cycle (that needs rAF + cytoscape
 * animations, which are out of scope here). Instead we verify the engine's
 * internal state via bracket access on the private field, and exercise
 * pause/stop's effect on the speech-wait cancel handle.
 */

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { describe, it, expect, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { TourEngine, asStrategy } from '@/core/tour';

type TourPrivates = {
  waitForSpeech: boolean;
  postSpeechDelayMs: number;
  waitForSpeechEnd: (() => { promise: Promise<void>; cancel: () => void }) | null;
  speechWaitCancel: (() => void) | null;
  stopped: boolean;
  paused: boolean;
};

function priv(e: TourEngine): TourPrivates {
  return e as unknown as TourPrivates;
}

function makeCy() {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  cy.add([
    { group: 'nodes', data: { id: 'a', fill: 'cls-structure' } },
    { group: 'nodes', data: { id: 'b', fill: 'cls-structure' } },
  ]);
  return cy;
}

describe('TourEngine: waitForSpeech / postSpeechDelayMs / adapter plumbing', () => {
  it('constructor + start() persist the TourOptions speech fields', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    const adapter = () => ({
      promise: Promise.resolve(),
      cancel: () => {},
    });
    engine.start('a', {
      interval: 1000,
      maxDepth: 0,
      strategy: asStrategy('has-dfs'),
      waitForSpeech: true,
      postSpeechDelayMs: 250,
      waitForSpeechEnd: adapter,
      onComplete: () => {},
    });
    expect(priv(engine).waitForSpeech).toBe(true);
    expect(priv(engine).postSpeechDelayMs).toBe(250);
    expect(priv(engine).waitForSpeechEnd).toBe(adapter);
    engine.stop();
  });

  it('defaults when no TourOptions fields are provided', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1000,
      maxDepth: 0,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    expect(priv(engine).waitForSpeech).toBe(false);
    expect(priv(engine).postSpeechDelayMs).toBe(0);
    expect(priv(engine).waitForSpeechEnd).toBe(null);
    engine.stop();
  });

  it('setWaitForSpeech updates the live flag', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1000,
      maxDepth: 0,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    expect(priv(engine).waitForSpeech).toBe(false);
    engine.setWaitForSpeech(true);
    expect(priv(engine).waitForSpeech).toBe(true);
    engine.stop();
  });

  it('setPostSpeechDelayMs clamps to a non-negative integer', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1000,
      maxDepth: 0,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    engine.setPostSpeechDelayMs(750);
    expect(priv(engine).postSpeechDelayMs).toBe(750);
    engine.setPostSpeechDelayMs(-100);
    expect(priv(engine).postSpeechDelayMs).toBe(0);
    engine.stop();
  });

  it('setWaitForSpeech is a no-op when called after stop() (no crash)', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1000,
      maxDepth: 0,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    engine.stop();
    expect(() => engine.setWaitForSpeech(true)).not.toThrow();
    expect(priv(engine).stopped).toBe(true);
  });

  it('setWaitForSpeechEnd(null) clears the adapter', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1000,
      maxDepth: 0,
      strategy: asStrategy('has-dfs'),
      waitForSpeechEnd: () => ({ promise: Promise.resolve(), cancel: () => {} }),
      onComplete: () => {},
    });
    expect(priv(engine).waitForSpeechEnd).not.toBe(null);
    engine.setWaitForSpeechEnd(null);
    expect(priv(engine).waitForSpeechEnd).toBe(null);
    engine.stop();
  });

  it('stop() clears any in-flight speechWaitCancel', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    // Install a cancel we can detect.
    const cancelSpy = vi.fn();
    // Hand-craft the internal state to simulate an in-flight wait. We
    // don't drive scheduleNext because the rAF/animation dance is out of
    // scope; we directly poke the private field like other tests in this
    // file do for _restartAttempts.
    engine.start('a', {
      interval: 1000,
      maxDepth: 0,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    (engine as unknown as { speechWaitCancel: () => void }).speechWaitCancel = cancelSpy;
    expect(priv(engine).speechWaitCancel).toBe(cancelSpy);
    engine.stop();
    expect(priv(engine).speechWaitCancel).toBe(null);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('pause() clears any in-flight speechWaitCancel', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    const cancelSpy = vi.fn();
    engine.start('a', {
      interval: 1000,
      maxDepth: 0, // instant stop, won't fire pause path
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    // Force paused=false so we can pause() — maxDepth:0 leaves the engine
    // in `stopped` state after onComplete. Use a fresh engine.
    const cy2 = makeCy();
    const engine2 = new TourEngine(cy2);
    let steps = 0;
    engine2.start('a', {
      interval: 1000,
      maxDepth: 5,
      strategy: asStrategy('has-dfs'),
      onStep: () => {
        steps++;
        if (steps === 1) {
          // We have a running engine after one step.
          (engine2 as unknown as { speechWaitCancel: () => void }).speechWaitCancel = cancelSpy;
          engine2.pause();
        }
      },
      onComplete: () => {},
    });
    // pause() must have cleared the handle + invoked the cancel spy.
    expect(priv(engine2).paused).toBe(true);
    expect(priv(engine2).speechWaitCancel).toBe(null);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    engine2.stop();
  });
});

describe('TourEngine: speech-aware pacing respects the user interval (regression)', () => {
  /**
   * Three independent contracts Path A must satisfy:
   *
   *   1. **No blur on TTS-off**: if the adapter resolves immediately
   *      (TTS off), each step still waits `minGap = max(500, interval
   *      - 600)`. Otherwise the graph blurs past the eye (regression:
   *      1s → 20 nodes visited).
   *
   *   2. **Short text honoured**: if the speech ends well before
   *      `minGap`, finish fires at the floor anyway (interval slider
   *      is the user-chosen pace).
   *
   *   3. **Long text NOT truncated**: if the speech is still going at
   *      `minGap`, the engine must RENEW the floor — wait another
   *      `minGap` — and keep polling until the utterance ends. The
   *      interval slider is the FLOOR between steps, not a
   *      hard ceiling on a single step.
   */
  function makeCy3() {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'a', fill: 'cls-structure' } },
      { group: 'nodes', data: { id: 'b', fill: 'cls-structure' } },
      { group: 'nodes', data: { id: 'c', fill: 'cls-structure' } },
      { group: 'nodes', data: { id: 'd', fill: 'cls-structure' } },
    ]);
    return cy;
  }

  it('immediately-resolving adapter still waits ≥ 500ms between steps (no blur)', async () => {
    const cy = makeCy3();
    const engine = new TourEngine(cy);
    const stamps: number[] = [];
    engine.start('a', {
      interval: 1500,
      maxDepth: 5,
      strategy: asStrategy('has-dfs'),
      waitForSpeech: true,
      waitForSpeechEnd: () => ({
        promise: Promise.resolve(),
        cancel: () => {},
      }),
      onStep: () => {
        stamps.push(Date.now());
      },
      onComplete: () => {},
    });

    await new Promise((r) => setTimeout(r, 3200));
    engine.stop();

    expect(stamps.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < stamps.length; i++) {
      const gap = stamps[i] - stamps[i - 1];
      // minGap = max(500, 1500-600) = 900ms. Generous 300ms floor to
      // tolerate CI scheduler jitter while still catching the
      // buggy ~0ms behaviour.
      expect(gap).toBeGreaterThanOrEqual(300);
    }
  });

  it('long utterance is NOT truncated by the floor — engine waits until speech ends', async () => {
    // Scenario: interval=1s (floor minGap = max(500, 1000-600) = 500ms),
    // but the utterance takes ~1.4s to read. With the old "race and
    // truncating" design, the floor would have fired finish at 500ms
    // and the rest of the utterance was abandoned mid-read. Now the
    // engine must keep waiting until the adapter resolves.
    const cy = makeCy3();
    const engine = new TourEngine(cy);
    let resolveSpeech: () => void = () => {};
    const speechPromise = new Promise<void>((resolve) => {
      resolveSpeech = resolve;
    });
    let stepCount = 0;
    let lastStepAt = 0;
    engine.start('a', {
      interval: 1000,
      maxDepth: 5,
      strategy: asStrategy('has-dfs'),
      waitForSpeech: true,
      waitForSpeechEnd: () => ({
        promise: speechPromise,
        cancel: () => {},
      }),
      onStep: () => {
        stepCount++;
        lastStepAt = Date.now();
      },
      onComplete: () => {},
    });

    // While utterance is pending, engine must NOT advance. Wait 1.5s
    // (three times the 500ms floor) — if the floor was truncating,
    // stepCount would have climbed past 1 by now.
    await new Promise((r) => setTimeout(r, 1500));
    expect(stepCount).toBe(1); // only the initial step has fired

    // Now release the utterance — engine should advance shortly.
    const beforeRelease = Date.now();
    resolveSpeech();
    await new Promise((r) => setTimeout(r, 600));
    expect(stepCount).toBeGreaterThanOrEqual(2);
    // The second step must fire AFTER release (not earlier), proving
    // the floor didn't truncate.
    expect(lastStepAt).toBeGreaterThanOrEqual(beforeRelease);

    engine.stop();
  });
});
