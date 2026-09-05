/**
 * @vitest-environment jsdom
 *
 * Tests the issue #16 fix: when the infinite-mode restart loop exhausts
 * itself (3 restart attempts with no progress), the controller must show
 * a clear "stopped" indicator instead of silently pretending the tour
 * finished normally.
 *
 * approach: stub the `TourEngine` entirely. The controller stores its
 * configured `onComplete` callback on the engine, so we can capture it
 * via spy and invoke it as if the engine had finished. We don't care
 * about the engine's internal scheduling — that's covered by the headless
 * tests in src/core/tour-engine.test.ts (which need a real rAF + cy that
 * this layer happily avoids).
 */

// jsdom doesn't define requestAnimationFrame / cancelAnimationFrame —
// stub so the controller's imports don't blow up during construction.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { describe, it, expect, beforeEach, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { TourController } from './tour-controller.js';
import { Renderer } from '../core/renderer.js';
import { DetailPanel } from './detail-panel.js';
import type { TourEngine } from '../core/tour.js';

const BADGE_IDS = [
  'tour-depth-badge',
  'tour-depth-badge-mob2',
  'tour-depth-badge-dt',
  'tour-depth-badge-dt2',
];
const NAME_IDS = ['tour-dt-node-name', 'tour-dt-node-name2'];
const COUNT_IDS = [
  'tour-count-badge',
  'tour-count-badge-mob2',
  'tour-count-badge-dt',
  'tour-count-badge-dt2',
];

function setupDom() {
  document.body.innerHTML = '';
  for (const id of [...BADGE_IDS, ...NAME_IDS, ...COUNT_IDS]) {
    const el = document.createElement('span');
    el.id = id;
    document.body.appendChild(el);
  }
  // tour-progress-fill-dt / dt2 — referenced in onComplete
  for (const suffix of ['', '2']) {
    const el = document.createElement('div');
    el.id = `tour-progress-fill-dt${suffix}`;
    document.body.appendChild(el);
  }
}

// Per-test cleanup: mount() registers keydown + click listeners on
// `document`. Without cleanup, listeners from earlier tests still fire on
// later tests' keydowns — Bug: a fake engine from one test that lacks
// prev/next would throw when invoked by a later test's keydown event.
// jsdom doesn't expose a removeAllListeners, so we register each
// listener through a wrapper that exposes an unbind. The wrapper is
// invoked after each test.
//
// We do this by NOT calling mount() in tests; instead we only invoke the
// `bindActions()` side-effect via a helper that returns an unbind fn.
// The keyboard shortcut logic lives in onTourKey — we drive it directly.
function makeController(): TourController {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  cy.add({ group: 'nodes', data: { id: 'a', label: 'A' } });
  const renderer = { getCy: () => cy } as unknown as Renderer;
  const detailPanel = { close: () => {}, show: () => {} } as unknown as DetailPanel;
  return new TourController(cy, renderer, detailPanel);
}

/**
 * Reach into the controller's private fields. The tests need to flip
 * `running` / `paused` and invoke the private `onComplete` directly
 * because real `start()` requires DOM sliders and a tour engine that
 * wants real cytoscape positions. The cast widens the type via
 * `unknown`, listing each touched field so future renames surface here
 * at compile time rather than as silently-skipped tests.
 */
type PrivateControllerFields = {
  engine: Pick<TourEngine, 'start' | 'isRunning' | 'isPaused' | 'stop' | 'pause' | 'resume' | 'prev' | 'next'> | null;
  running: boolean;
  paused: boolean;
  onComplete: (reason: 'depth-reached' | 'no-more-restarts' | 'no-root') => void;
  onEnginePause: () => void;
  onEngineResume: () => void;
  onTourKey: (e: KeyboardEvent) => void;
  togglePause: () => void;
};
function poke(c: TourController): PrivateControllerFields {
  return c as unknown as PrivateControllerFields;
}

function captureOnComplete(controller: TourController) {
  // Replace `start()` with a stub that never reaches the real engine, but
  // still hands us back the `onComplete` callback the controller would
  // have given to the engine.
  type Reason = 'depth-reached' | 'no-more-restarts' | 'no-root';
  let captured: ((reason: Reason) => void) | null = null;
  const fakeEngine = {
    start: (
      _rootId: string,
      opts: { onComplete?: (reason: Reason) => void },
    ) => {
      captured = opts.onComplete ?? null;
    },
    isRunning: () => false,
    isPaused: () => false,
    stop: () => {},
    pause: () => {},
    resume: () => {},
    prev: () => {},
    next: () => {},
  };
  // Inject the fake engine by reaching into the controller's private
  // `engine` slot — see `poke()` for why this is type-safe at compile
  // time despite going through `unknown`.
  poke(controller).engine = fakeEngine;
  // The `onComplete` callback is what we want to test. We drive the
  // test through it directly via poke(controller).onComplete(reason).
  return { capture: () => captured, fakeEngine };
}

describe('TourController.onComplete — issue #16 reason branching', () => {
  beforeEach(setupDom);

  it('shows ✓ / "完成" on the normal depth-reached path', () => {
    const c = makeController();
    // Mark controller as running so onComplete flips the right state.
    const p = poke(c);
    p.running = true;
    p.paused = false;
    p.onComplete('depth-reached');

    for (const id of BADGE_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('\u2713');
    }
    for (const id of NAME_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('完成');
    }
    expect(p.running).toBe(false);
    expect(p.paused).toBe(false);
  });

  it('shows ⏹ / "已停止 · 已试 3 轮" when the restart loop exhausts itself', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.paused = false;
    p.onComplete('no-more-restarts');

    for (const id of BADGE_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('⏹');
    }
    for (const id of NAME_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('已停止 · 已试 3 轮');
    }
    expect(p.running).toBe(false);
    expect(p.paused).toBe(false);
  });

  it('clears count badges and fills progress bar to 100% on either path', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.onComplete('no-more-restarts');

    for (const id of COUNT_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('—');
    }
    for (const suffix of ['', '2']) {
      const el = document.getElementById(`tour-progress-fill-dt${suffix}`);
      expect(el?.style.width).toBe('100%');
    }
  });

  it('two distinct reasons produce two distinct UI states (no aliasing)', () => {
    const c1 = makeController();
    const p1 = poke(c1);
    p1.running = true;
    p1.onComplete('depth-reached');
    const depthName = document.getElementById('tour-dt-node-name')?.textContent;

    setupDom();
    const c2 = makeController();
    const p2 = poke(c2);
    p2.running = true;
    p2.onComplete('no-more-restarts');
    const exhaustedName = document.getElementById('tour-dt-node-name')?.textContent;

    expect(depthName).toBe('完成');
    expect(exhaustedName).toBe('已停止 · 已试 3 轮');
    expect(depthName).not.toBe(exhaustedName);
  });

  it('does not throw for unknown reason strings (forward-compat)', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    // Cast through unknown to bypass the type narrowing — the controller
    // types the reason as a union, but the JSDoc says future enum values
    // may be added and should not crash.
    expect(() =>
      p.onComplete('some-future-reason' as unknown as 'depth-reached'),
    ).not.toThrow();
    // Default branch: badge stays at the original value (depth-style ✓),
    // name stays at its prior value. We just assert onComplete finishes
    // cleanly and resets the running flag.
    expect(p.running).toBe(false);
  });
});

// ── Bug: prev()/next() flipped engine paused but controller UI was stale ────
//
// When prev()/next() fired, the engine paused itself and invoked onPause —
// but the controller never received onPause, so documentElement's
// tour-state--* class never changed. Play/pause icon stayed on "play" while
// the engine was paused. Fix: wire onPause/onResume callbacks into the
// engine when starting, and have them sync controller state + UI class.

describe('TourController — icon sync after prev()/next()', () => {
  beforeEach(setupDom);

  it('onEnginePause sets paused=true and writes tour-state--paused', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.paused = false;
    document.documentElement.classList.add('tour-state--running');
    p.onEnginePause();
    expect(p.paused).toBe(true);
    expect(p.running).toBe(true);
    expect(document.documentElement.classList.contains('tour-state--paused')).toBe(true);
    expect(document.documentElement.classList.contains('tour-state--running')).toBe(false);
  });

  it('onEngineResume clears paused and writes tour-state--running', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.paused = true;
    document.documentElement.classList.add('tour-state--paused');
    p.onEngineResume();
    expect(p.paused).toBe(false);
    expect(p.running).toBe(true);
    expect(document.documentElement.classList.contains('tour-state--running')).toBe(true);
    expect(document.documentElement.classList.contains('tour-state--paused')).toBe(false);
  });
});

// ── Keyboard shortcuts: Space = pause, ArrowUp/Down = prev/next ─────────────

describe('TourController — keyboard shortcuts', () => {
  beforeEach(setupDom);

  function fireKey(key: string, code?: string): KeyboardEvent {
    return new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true });
  }

  it('Space toggles pause while running', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.paused = false;
    const engine = {
      isRunning: () => true,
      isPaused: () => false,
      pause: vi.fn(),
      resume: vi.fn(),
    };
    p.engine = engine as unknown as typeof p.engine;
    const ev = fireKey(' ', 'Space');
    p.onTourKey(ev);
    expect(engine.pause).toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Space resumes while paused', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.paused = true;
    const engine = {
      isRunning: () => false,
      isPaused: () => true,
      pause: vi.fn(),
      resume: vi.fn(),
    };
    p.engine = engine as unknown as typeof p.engine;
    p.onTourKey(fireKey(' ', 'Space'));
    expect(engine.resume).toHaveBeenCalled();
  });

  it('ArrowUp calls prev while running', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.paused = false;
    const engine = {
      isRunning: () => true,
      isPaused: () => false,
      prev: vi.fn(),
      next: vi.fn(),
    };
    p.engine = engine as unknown as typeof p.engine;
    p.onTourKey(fireKey('ArrowUp'));
    expect(engine.prev).toHaveBeenCalled();
  });

  it('ArrowDown calls next while running', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.paused = false;
    const engine = {
      isRunning: () => true,
      isPaused: () => false,
      prev: vi.fn(),
      next: vi.fn(),
    };
    p.engine = engine as unknown as typeof p.engine;
    p.onTourKey(fireKey('ArrowDown'));
    expect(engine.next).toHaveBeenCalled();
  });

  it('keyboard shortcuts are inert when no tour is active', () => {
    const c = makeController();
    const p = poke(c);
    p.running = false;
    p.paused = false;
    const engine = {
      isRunning: () => false,
      isPaused: () => false,
      pause: vi.fn(),
      resume: vi.fn(),
      prev: vi.fn(),
      next: vi.fn(),
    };
    p.engine = engine as unknown as typeof p.engine;
    p.onTourKey(fireKey(' '));
    p.onTourKey(fireKey('ArrowUp'));
    p.onTourKey(fireKey('ArrowDown'));
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.prev).not.toHaveBeenCalled();
    expect(engine.next).not.toHaveBeenCalled();
  });

  it('Space inside an <input> is NOT hijacked by the tour shortcut', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.paused = false;
    const engine = {
      isRunning: () => true,
      isPaused: () => false,
      pause: vi.fn(),
      resume: vi.fn(),
    };
    p.engine = engine as unknown as typeof p.engine;
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = fireKey(' ', 'Space');
    Object.defineProperty(ev, 'target', { value: input, configurable: true });
    p.onTourKey(ev);
    expect(engine.pause).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  // ── Bug: togglePause must read engine.isPaused(), not its own stale flag ──

  it('togglePause resumes when engine.isPaused() is true even if controller.paused is false (stale-state recovery)', () => {
    // Simulates the desync path: user paused via prev/next while already
    // paused, onPause was skipped → controller.paused stayed false but
    // engine.paused is true. The previous togglePause read controller.paused
    // and called engine.pause() — which short-circuited (already paused) so
    // resume never happened. Now we read engine.isPaused().
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.paused = false; // stale — should be true but isn't
    const engine = {
      isRunning: () => false,
      isPaused: () => true, // truth: engine IS paused
      pause: vi.fn(),
      resume: vi.fn(),
    };
    p.engine = engine as unknown as typeof p.engine;
    p.togglePause();
    expect(engine.resume).toHaveBeenCalled();
    expect(engine.pause).not.toHaveBeenCalled();
  });

  it('togglePause pauses when engine.isPaused() is false even if controller.paused is true (stale-state recovery)', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.paused = true; // stale — engine is actually running
    const engine = {
      isRunning: () => true,
      isPaused: () => false,
      pause: vi.fn(),
      resume: vi.fn(),
    };
    p.engine = engine as unknown as typeof p.engine;
    p.togglePause();
    expect(engine.pause).toHaveBeenCalled();
    expect(engine.resume).not.toHaveBeenCalled();
  });
});
