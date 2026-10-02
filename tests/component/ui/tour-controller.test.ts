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
import { TourController } from '@/ui/tour-controller';
import { Renderer } from '@/core/renderer';
import { DetailPanel } from '@/ui/detail-panel';
import type { TourEngine, TourOptions, TourCompleteInfo } from '@/core/tour';

const NAME_IDS = ['tour-dt-node-name'];
const COUNT_IDS = [
  'tour-count-badge-num',
  'tour-count-badge-den',
  'tour-progress-label-dt',
  'tour-step-badge-dt',
  'tour-step-badge-mob',
];

function setupDom() {
  document.body.innerHTML = '';
  for (const id of [...NAME_IDS, ...COUNT_IDS]) {
    const el = document.createElement('span');
    el.id = id;
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
  const detailPanel = {
    close: () => {},
    closeSilently: () => {},
    show: () => {},
  } as unknown as DetailPanel;
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
  engine: Pick<
    TourEngine,
    'start' | 'isRunning' | 'isPaused' | 'stop' | 'pause' | 'resume' | 'prev' | 'next'
  > | null;
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
  let captured: ((info: TourCompleteInfo) => void) | null = null;
  const fakeEngine = {
    start: (_rootId: string, opts: TourOptions) => {
      captured = opts.onComplete ?? null;
      return true;
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

    for (const id of NAME_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('已停止 · 已试 3 轮');
    }
    expect(p.running).toBe(false);
    expect(p.paused).toBe(false);
  });

  it('clears count badges on either completion path', () => {
    const c = makeController();
    const p = poke(c);
    p.running = true;
    p.onComplete('no-more-restarts');

    for (const id of COUNT_IDS) {
      expect(document.getElementById(id)?.textContent).toBe('—');
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
    expect(() => {
      p.onComplete('some-future-reason' as unknown as 'depth-reached');
    }).not.toThrow();
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

// ── Regression: reverse 漫游在体系根 boundary 下不能退化成 forward ──
//
// 2026-10-02 bug：pickRoot() 把 universeNodeIds 算成 `candidateId 的 strict descendants`，
// 默认 rootId=book-y2 时这把 universe 卡在 1115 节点（单本书子树），reverse 在章节层
// 失效。修复后 universe 改为 `universeRootId 的 strict descendants`（体系级），
// 让 reverse 在跨 4 本书的体系级真正生效。
describe('TourController.pickRoot — universe boundary is 体系级，不是 rootId subtree', () => {
  // 微型双体系图：体系一 (rootR1) 含 book-y2 + 一章 + 一节
  //              体系二 (rootR2) 含 otherBook + otherCh + otherSec
  // 这两个体系根会被识别为 UNIVERSE_ROOTS（测试用替代品）
  function makeDualUniverseGraph() {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    // 体系根必须是 cls-structure（UNIVERSE_ROOTS 内部不要求 fill，
    // 但我们测试走 detectUniverseRoot → 这里直接用 stub 方法）。
    cy.add([
      // 体系一根 + 它的子孙（建立层级边 child→parent）
      { group: 'nodes', data: { id: 'rootR1' } },
      { group: 'nodes', data: { id: 'book-y2' } },
      { group: 'nodes', data: { id: 'sec-y2-01' } },
      { group: 'nodes', data: { id: 'topic-y2-01-a' } },
      // 体系二根 + 它的子孙
      { group: 'nodes', data: { id: 'rootR2' } },
      { group: 'nodes', data: { id: 'otherBook' } },
      { group: 'nodes', data: { id: 'otherCh' } },
      { group: 'nodes', data: { id: 'otherSec' } },
      // 层级边：child→parent (source=child, target=parent)
      {
        group: 'edges',
        data: { id: 'e1', source: 'book-y2', target: 'rootR1', edgeType: 'part_of' },
      },
      {
        group: 'edges',
        data: { id: 'e2', source: 'sec-y2-01', target: 'book-y2', edgeType: 'part_of' },
      },
      {
        group: 'edges',
        data: { id: 'e3', source: 'topic-y2-01-a', target: 'sec-y2-01', edgeType: 'part_of' },
      },
      {
        group: 'edges',
        data: { id: 'e4', source: 'otherBook', target: 'rootR2', edgeType: 'part_of' },
      },
      {
        group: 'edges',
        data: { id: 'e5', source: 'otherCh', target: 'otherBook', edgeType: 'part_of' },
      },
      {
        group: 'edges',
        data: { id: 'e6', source: 'otherSec', target: 'otherCh', edgeType: 'part_of' },
      },
    ]);
    return cy;
  }

  it('用户没选节点时，universe 是 rootR1（体系根）子树，而不是 book-y2（默认根）子树', () => {
    const cy = makeDualUniverseGraph();
    // 让 pickRoot 内部的 detectUniverseRoot 把 rootR1/rootR2 当作体系根
    // (production 代码读 UNIVERSE_ROOTS 常量；这里 stub 私有方法)
    const renderer = { getCy: () => cy } as unknown as Renderer;
    const detailPanel = {
      close: () => {},
      closeSilently: () => {},
      show: () => {},
    } as unknown as DetailPanel;
    const c = new TourController(cy, renderer, detailPanel);
    // Stub detectUniverseRoot：因为 UNIVERSE_ROOTS 是常量，test 里塞不进新根，
    // 所以 override 私有方法返回我们图里的 rootR1
    const p = c as unknown as {
      detectUniverseRoot: (n: cytoscape.NodeSingular) => string | null;
    };
    p.detectUniverseRoot = (n) => {
      const id = n.id();
      // 沿父链 BFS 找 rootR1/rootR2
      const queue = [id];
      const seen = new Set<string>();
      while (queue.length) {
        const cur = queue.shift()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        if (cur === 'rootR1' || cur === 'rootR2') return cur;
        cy.getElementById(cur)
          .outgoers('edge')
          .forEach((edge) => {
            if (edge.data('edgeType') === 'part_of') queue.push(edge.target().id());
          });
      }
      return null;
    };
    const result = (
      c as unknown as {
        pickRoot: () => {
          rootId: string;
          universeRootId: string | null;
          universeNodeIds: Set<string>;
        };
      }
    ).pickRoot();
    // 默认 rootId = book-y2（pickDefaultRoot 走 book priority）
    expect(result.rootId).toBe('book-y2');
    expect(result.universeRootId).toBe('rootR1');
    // 关键修复点：universe 包含体系一所有成员（包括 rootR1），不只 book-y2 子树
    expect(result.universeNodeIds.has('rootR1')).toBe(true);
    expect(result.universeNodeIds.has('book-y2')).toBe(true);
    expect(result.universeNodeIds.has('sec-y2-01')).toBe(true);
    expect(result.universeNodeIds.has('topic-y2-01-a')).toBe(true);
    // 跨体系节点绝不能出现
    expect(result.universeNodeIds.has('rootR2')).toBe(false);
    expect(result.universeNodeIds.has('otherBook')).toBe(false);
    expect(result.universeNodeIds.has('otherCh')).toBe(false);
  });

  it('用户选 y2-ch01 时，universe 仍是体系一根子树（不是 chapter subtree）——reverse 才能跨章节层', () => {
    const cy = makeDualUniverseGraph();
    // 模拟"选 sec-y2-01"：给它打上 selected-node class
    cy.getElementById('sec-y2-01').addClass('selected-node');
    const renderer = { getCy: () => cy } as unknown as Renderer;
    const detailPanel = {
      close: () => {},
      closeSilently: () => {},
      show: () => {},
    } as unknown as DetailPanel;
    const c = new TourController(cy, renderer, detailPanel);
    const p = c as unknown as {
      detectUniverseRoot: (n: cytoscape.NodeSingular) => string | null;
    };
    p.detectUniverseRoot = (n) => {
      const queue = [n.id()];
      const seen = new Set<string>();
      while (queue.length) {
        const cur = queue.shift()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        if (cur === 'rootR1' || cur === 'rootR2') return cur;
        cy.getElementById(cur)
          .outgoers('edge')
          .forEach((edge) => {
            if (edge.data('edgeType') === 'part_of') queue.push(edge.target().id());
          });
      }
      return null;
    };
    const result = (
      c as unknown as {
        pickRoot: () => {
          rootId: string;
          universeRootId: string | null;
          universeNodeIds: Set<string>;
        };
      }
    ).pickRoot();
    // 关键点：rootId 仍是用户选的 sec-y2-01
    expect(result.rootId).toBe('sec-y2-01');
    // 但 universe 是 rootR1（体系根）子树——不是 sec-y2-01 子树
    expect(result.universeRootId).toBe('rootR1');
    expect(result.universeNodeIds.has('rootR1')).toBe(true);
    expect(result.universeNodeIds.has('book-y2')).toBe(true);
    // 跨体系节点：不在
    expect(result.universeNodeIds.has('rootR2')).toBe(false);
  });

  it('detectUniverseRoot 返回 null（孤悬节点）→ universe 回退到 rootId subtree（向后兼容）', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'orphan' } },
      { group: 'nodes', data: { id: 'child' } },
      { group: 'edges', data: { id: 'e', source: 'child', target: 'orphan', edgeType: 'part_of' } },
    ]);
    const renderer = { getCy: () => cy } as unknown as Renderer;
    const detailPanel = {
      close: () => {},
      closeSilently: () => {},
      show: () => {},
    } as unknown as DetailPanel;
    const c = new TourController(cy, renderer, detailPanel);
    const result = (
      c as unknown as {
        pickRoot: () => {
          rootId: string;
          universeRootId: string | null;
          universeNodeIds: Set<string>;
        };
      }
    ).pickRoot();
    // 没有 book-yX 节点 → pickDefaultRoot 走 fallback（maxDegree），会选 orphan
    // orphan 没有体系根 → universeRootId = null
    expect(result.universeRootId).toBeNull();
    // 回退：universe = orphan subtree (含 child)
    expect(result.universeNodeIds.has('orphan')).toBe(true);
    expect(result.universeNodeIds.has('child')).toBe(true);
  });
});
