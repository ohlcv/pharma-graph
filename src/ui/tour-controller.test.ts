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

function makeController(): TourController {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  cy.add({ group: 'nodes', data: { id: 'a', label: 'A' } });
  const renderer = { getCy: () => cy } as any;
  const detailPanel = { close: () => {}, show: () => {} } as any;
  return new TourController(cy, renderer, detailPanel);
}

function captureOnComplete(controller: TourController) {
  // Replace `start()` with a stub that never reaches the real engine, but
  // still hands us back the `onComplete` callback the controller would
  // have given to the engine.
  let captured: ((reason: string) => void) | null = null;
  const fakeEngine = {
    start: (
      _rootId: string,
      opts: { onComplete?: (reason: string) => void },
    ) => {
      captured = opts.onComplete ?? null;
    },
    isRunning: () => false,
    isPaused: () => false,
    stop: () => {},
  };
  // Inject the fake engine: easier to just call `start()` and intercept
  // the engine creation. Since the controller's `start()` constructs the
  // engine, we replace the `pickRoot` path indirectly by stubbing
  // TourEngine. The cleanest way: spy on the constructor.
  // We use vi.mock-equivalent at runtime by replacing the module's
  // exported class — but that requires hoisted mocking. Simpler: use
  // the controller's `start()` method? Actually start() throws because
  // it requires sliders/inputs that don't exist. So:
  // We reach in: poke the controller's onComplete callback by manually
  // swapping the engine after construction.
  (controller as any).engine = fakeEngine;
  // The `onComplete` callback is what we want to test. We grab it from
  // the private method. To avoid exposing it, we drive the test through
  // a different route: call the controller's `onComplete` directly via
  // `(controller as any).onComplete(reason)`.
  return { capture: () => captured, fakeEngine };
}

describe('TourController.onComplete — issue #16 reason branching', () => {
  beforeEach(setupDom);

  it('shows ✓ / "完成" on the normal depth-reached path', () => {
    const c = makeController();
    // Mark controller as running so onComplete flips the right state.
    (c as any).running = true;
    (c as any).paused = false;
    (c as any).onComplete('depth-reached');

    for (const id of BADGE_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('\u2713');
    }
    for (const id of NAME_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('完成');
    }
    expect((c as any).running).toBe(false);
    expect((c as any).paused).toBe(false);
  });

  it('shows ⏹ / "已停止 · 已试 3 轮" when the restart loop exhausts itself', () => {
    const c = makeController();
    (c as any).running = true;
    (c as any).paused = false;
    (c as any).onComplete('no-more-restarts');

    for (const id of BADGE_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('⏹');
    }
    for (const id of NAME_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('已停止 · 已试 3 轮');
    }
    expect((c as any).running).toBe(false);
    expect((c as any).paused).toBe(false);
  });

  it('clears count badges and fills progress bar to 100% on either path', () => {
    const c = makeController();
    (c as any).running = true;
    (c as any).onComplete('no-more-restarts');

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
    (c1 as any).running = true;
    (c1 as any).onComplete('depth-reached');
    const depthName = document.getElementById('tour-dt-node-name')?.textContent;

    setupDom();
    const c2 = makeController();
    (c2 as any).running = true;
    (c2 as any).onComplete('no-more-restarts');
    const exhaustedName = document.getElementById('tour-dt-node-name')?.textContent;

    expect(depthName).toBe('完成');
    expect(exhaustedName).toBe('已停止 · 已试 3 轮');
    expect(depthName).not.toBe(exhaustedName);
  });

  it('does not throw for unknown reason strings (forward-compat)', () => {
    const c = makeController();
    (c as any).running = true;
    // Cast through unknown to bypass the type narrowing — the controller
    // types the reason as a union, but the JSDoc says future enum values
    // may be added and should not crash.
    expect(() =>
      (c as any).onComplete('some-future-reason'),
    ).not.toThrow();
    // Default branch: badge stays at the original value (depth-style ✓),
    // name stays at its prior value. We just assert onComplete finishes
    // cleanly and resets the running flag.
    expect((c as any).running).toBe(false);
  });
});
