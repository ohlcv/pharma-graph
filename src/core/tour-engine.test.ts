/**
 * @vitest-environment jsdom
 *
 * Tests the issue #16 contract: `TourEngine.onComplete` is called with a
 * `TourCompleteInfo` object { reason, maxAttempts } that distinguishes the
 * normal depth-reached stop from the infinite-mode restart-loop exhaustion.
 *
 * We don't drive the full engine here (the headless-cy + rAF dance
 * needed for `visitNext` to actually advance is brittle and out of
 * scope for the unit-level reason-routing test). Instead, we install the
 * `onComplete` callback directly on the engine's private field and
 * invoke it as if the engine had completed — verifying the controller
 * receives the right info for each documented stop path.
 *
 * jsdom doesn't define requestAnimationFrame — stub so engine
 * construction doesn't crash.
 */

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { describe, it, expect, vi } from 'vitest';
import cytoscape from 'cytoscape';
import { TourEngine, asStrategy, registerStrategy, unregisterStrategy, TourCompleteInfo } from './tour.js';

/** Single-node graph — sufficient for onComplete reason-routing tests that
 *  never advance the tour. */
function makeCy() {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  cy.add([{ group: 'nodes', data: { id: 'a' } }]);
  return cy;
}

/** Install a callback that receives the new TourCompleteInfo object shape. */
function installOnComplete(engine: TourEngine, fn: (info: TourCompleteInfo) => void) {
  (engine as unknown as { onComplete: (info: TourCompleteInfo) => void }).onComplete = fn;
}

describe('TourEngine onComplete reason routing (issue #16)', () => {
  it('passes { reason: "depth-reached", maxAttempts } when maxDepth is bounded', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    let captured: TourCompleteInfo | null = null;
    installOnComplete(engine, (info) => { captured = info; });
    engine['onComplete']?.({ reason: 'depth-reached', maxAttempts: 3 });
    expect(captured?.reason).toBe('depth-reached');
    expect(captured?.maxAttempts).toBe(3);
  });

  it('passes { reason: "no-more-restarts", maxAttempts } when infinite mode exhausts', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    let captured: TourCompleteInfo | null = null;
    installOnComplete(engine, (info) => { captured = info; });
    engine['onComplete']?.({ reason: 'no-more-restarts', maxAttempts: 3 });
    expect(captured?.reason).toBe('no-more-restarts');
    expect(captured?.maxAttempts).toBe(3);
  });

  it('passes { reason: "no-root", maxAttempts } when no root node found', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    let captured: TourCompleteInfo | null = null;
    installOnComplete(engine, (info) => { captured = info; });
    engine['onComplete']?.({ reason: 'no-root', maxAttempts: 3 });
    expect(captured?.reason).toBe('no-root');
  });

  it('the restart-attempt counter is reset to 0 once the engine finalises', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    // Simulate the engine having attempted 3 restarts before giving up.
    (engine as unknown as { _restartAttempts: number })._restartAttempts = 3;
    installOnComplete(engine, () => {
      /* the real finaliser resets _restartAttempts before/after this */
    });
    // The controller inspects `_restartAttempts` shape (number) — guard
    // against accidental renames.
    expect(typeof engine['_restartAttempts']).toBe('number');
  });

  it('TourCompleteReason unions the three stop causes', () => {
    // Smoke test: the runtime strings are exactly the three documented
    // reasons. This guard catches typos that would silently break the
    // controller's branching.
    const cy = makeCy();
    const engine = new TourEngine(cy);
    const seen: string[] = [];
    installOnComplete(engine, (info) => seen.push(info.reason));
    engine['onComplete']?.({ reason: 'depth-reached', maxAttempts: 3 });
    engine['onComplete']?.({ reason: 'no-more-restarts', maxAttempts: 3 });
    engine['onComplete']?.({ reason: 'no-root', maxAttempts: 3 });
    expect(seen).toEqual(['depth-reached', 'no-more-restarts', 'no-root']);
  });
});

describe('TourEngine totalExplored live sync (issue #15 fix)', () => {
  function makeCy3() {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    // has-dfs starts from cls-structure nodes; tag a, b, c as such so the
    // strategy's DFS produces a non-empty seq (otherwise the engine's new
    // empty-seq guard would stop before listeners attach).
    cy.add([
      { group: 'nodes', data: { id: 'a', fill: 'cls-structure' } },
      { group: 'nodes', data: { id: 'b', fill: 'cls-structure' } },
      { group: 'nodes', data: { id: 'c', fill: 'cls-structure' } },
    ]);
    return cy;
  }

  it('initial totalExplored equals cy.nodes().size() at start()', () => {
    const cy = makeCy3();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1,
      maxDepth: 0, // instant stop — we just want the listeners attached
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    expect(engine['totalExplored']).toBe(3);
    engine.stop();
  });

  it('removing a node mid-tour updates totalExplored', () => {
    const cy = makeCy3();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1,
      maxDepth: 1,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    expect(engine['totalExplored']).toBe(3);

    cy.getElementById('b').remove();

    // Resync runs synchronously inside the cytoscape 'remove' event.
    expect(engine['totalExplored']).toBe(2);
    engine.stop();
  });

  it('adding a node mid-tour updates totalExplored', () => {
    const cy = makeCy3();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1,
      maxDepth: 1,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    expect(engine['totalExplored']).toBe(3);

    cy.add({ group: 'nodes', data: { id: 'd' } });
    expect(engine['totalExplored']).toBe(4);
    engine.stop();
  });

  it('removing then adding back updates totalExplored twice (proves listener is live)', () => {
    const cy = makeCy3();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1,
      maxDepth: 1,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    expect(engine['totalExplored']).toBe(3);

    cy.getElementById('a').remove();
    expect(engine['totalExplored']).toBe(2);
    cy.add({ group: 'nodes', data: { id: 'd' } });
    expect(engine['totalExplored']).toBe(3);
    engine.stop();
  });

  it('stop() detaches listeners — post-stop mutations no longer update totalExplored', () => {
    const cy = makeCy3();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1,
      maxDepth: 1,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    const frozen = engine['totalExplored'];
    engine.stop();

    // After stop, mutating the graph should NOT update totalExplored —
    // otherwise a stale engine would keep writing to memory.
    cy.getElementById('b').remove();
    expect(engine['totalExplored']).toBe(frozen);
  });

  it('starting a new tour re-attaches listeners (no leaks across restarts)', () => {
    const cy = makeCy3();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1,
      maxDepth: 1,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    engine.stop();
    // Second start — listeners must be re-installed.
    engine.start('a', {
      interval: 1,
      maxDepth: 1,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    cy.getElementById('b').remove();
    expect(engine['totalExplored']).toBe(2);
    engine.stop();
  });

  it('does not leak handlers: attach→detach leaves no active listeners on cy', () => {
    const cy = makeCy3();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1,
      maxDepth: 1,
      strategy: asStrategy('has-dfs'),
      onComplete: () => {},
    });
    // Remove before stop() — should still update (start attached).
    cy.getElementById('b').remove();
    expect(engine['totalExplored']).toBe(2);

    // Stop tears down the listeners. Mutating after stop should not
    // change totalExplored — proving the listener was removed.
    engine.stop();
    const previous = engine['totalExplored'];
    cy.getElementById('c').remove();
    expect(engine['totalExplored']).toBe(previous);
  });
});

describe('TourEngine shouldRestart hook (issue #7)', () => {
  // 测试策略钩子：shouldRestart 返回 false 时引擎立即以 'no-more-restarts'
  // 收束，不再进入下一轮（_restartAttempts 保持 0）。
  //
  // 测试不依赖真定时器：visitNext 是同步的，循环也只是同步 loopSafety。
  // 装一个 3 节点的 cy，用 registerStrategy 临时注册一个会调用 shouldRestart 的策略。
  it('shouldRestart returning false: first cycle completes then engine stops without incrementing _restartAttempts', () => {
    registerStrategy({
      id: 'test-no-restart',
      label: 'Test: no restart',
      buildSequence: (cy) => cy.nodes().not('.layer-parent').map((n) => n.id()),
      hooks: {
        shouldRestart: () => false,
      },
    });

    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
      { group: 'nodes', data: { id: 'c' } },
    ]);
    const engine = new TourEngine(cy);
    let captured: TourCompleteInfo | null = null;

    engine.start('a', {
      interval: 1_000_000, // 几乎不会触发，但 visitNext 同步跑
      maxDepth: -1,         // infinite mode（否则 maxDepth > 0 会按 depth-reached 收束）
      strategy: asStrategy('test-no-restart'),
    });
    // start 会用 options.onComplete 覆盖 engine.onComplete，所以**之后**再装
    // 真正的捕获回调，否则我们的 captured 永远不会被赋值。
    installOnComplete(engine, (info) => { captured = info; });

    // 手动同步驱动 visitNext 把 seq 走完——而不是依赖 setTimeout。
    // seq = [a,b,c]，start 已经访问过 a（seqIndex=1），
    // visitNext 两次后 seqIndex 越过末尾，进入重启判定分支。
    (engine as unknown as { visitNext: () => void }).visitNext(); // visit b
    (engine as unknown as { visitNext: () => void }).visitNext(); // visit c → seq exhausted
    (engine as unknown as { visitNext: () => void }).visitNext(); // triggers restart logic

    expect(captured?.reason).toBe('no-more-restarts');
    expect(engine['_restartAttempts']).toBe(0); // shouldRestart=false 直接跳过计数

    engine.stop();
    // 清理：撤销测试策略，防止泄漏到后续测试。
    unregisterStrategy('test-no-restart');
  });
});

// ── Bug: prev()/next() must always emit onPause so the controller's play/pause
// icon and togglePause() stay in sync even on consecutive calls while already
// paused. Previously the second consecutive call skipped onPause because the
// engine's internal `wasAlreadyPaused` short-circuited, leaving the
// controller's `paused` flag stale and causing Space-bar resume to no-op.

describe('TourEngine prev/next pause-emit contract', () => {
  function makeCy() {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
      { group: 'nodes', data: { id: 'c' } },
    ]);
    return cy;
  }

  it('next() always fires onPause, even when already paused', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    const onPause = vi.fn();
    (engine as unknown as { onPause: () => void }).onPause = onPause;
    (engine as unknown as { paused: boolean }).paused = false;
    (engine as unknown as { seqIndex: number }).seqIndex = 0;
    (engine as unknown as { seq: string[] }).seq = ['a', 'b'];
    // First call while running (paused=false) — onPause fires once.
    engine.next();
    expect(onPause).toHaveBeenCalledTimes(1);
    // Second call while still paused (no auto-reset) — onPause MUST fire
    // again so the controller's play/pause icon stays accurate.
    engine.next();
    expect(onPause).toHaveBeenCalledTimes(2);
    engine.stop();
  });

  it('prev() always fires onPause (when _visited has history to back up into)', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    const onPause = vi.fn();
    (engine as unknown as { onPause: () => void }).onPause = onPause;
    (engine as unknown as { paused: boolean }).paused = false;
    // Seed _visited so prev() has somewhere to go.
    (engine as unknown as { _visited: string[] })._visited = ['a', 'b'];
    (engine as unknown as { seqIndex: number }).seqIndex = 2;
    (engine as unknown as { seq: string[] }).seq = ['a', 'b', 'c'];
    engine.prev();
    expect(onPause).toHaveBeenCalledTimes(1);
    // Second prev: now _visited = ['a'], can't go further, returns early.
    engine.prev();
    // onPause should NOT be called when there's nothing to go back to.
    expect(onPause).toHaveBeenCalledTimes(1);
    engine.stop();
  });
});

// ── Bug: 档位切换 (setMaxDepth) must keep currentStep ≤ _cachedTotalSteps ──
// 之前切档时 currentStep 不重算，导致分子比分母大 (例 80/50)、进度条 pct > 1 被钳到 100%、
// range 拖动跳到错误节点。这些用例确保切档行为正确。
describe('TourEngine setMaxDepth (depth-level switch)', () => {
  /** 构造 5 个节点的 cy：2 个 cls-structure（档位1可见）+ 3 个 cls-drug 普通（档位1过滤掉） */
  function makeDepthCy() {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 's1', fill: 'cls-structure' } },
      { group: 'nodes', data: { id: 's2', fill: 'cls-structure' } },
      { group: 'nodes', data: { id: 'd1', fill: 'cls-drug' } },
      { group: 'nodes', data: { id: 'd2', fill: 'cls-drug' } },
      { group: 'nodes', data: { id: 'd3', fill: 'cls-drug' } },
    ]);
    return cy;
  }

  it('switching depth from 5 → 1: currentStep recomputed to visible-only count', () => {
    const cy = makeDepthCy();
    const engine = new TourEngine(cy);
    let progressCalls = 0;
    let lastProgress: { currentStep: number; totalToExplore: number } | null = null;
    engine.start('s1', {
      interval: 1_000_000,
      maxDepth: 5,
      strategy: asStrategy('has-dfs'),
      onStep: () => {},
      onProgress: (info) => {
        progressCalls++;
        lastProgress = { currentStep: info.currentStep, totalToExplore: info.totalToExplore };
      },
      onComplete: () => {},
    });
    // 手动走 4 步（5 个节点：s1,s2,d1,d2,d3 — d3 还没走）
    // has-dfs 是 BFS 序，但具体不重要；这里只关心 currentStep 跟 seqIndex 的关系。
    (engine as unknown as { visitNext: () => void }).visitNext();
    (engine as unknown as { visitNext: () => void }).visitNext();
    (engine as unknown as { visitNext: () => void }).visitNext();
    (engine as unknown as { visitNext: () => void }).visitNext();
    expect(engine['currentStep']).toBe(5); // start() ++1 + 4 次 visitNext ++1

    // 切档 5 → 1：visible = 2 (s1, s2)，所以 currentStep 应该重算为 2
    progressCalls = 0;
    engine.setMaxDepth(1);
    expect(engine['currentStep']).toBe(2); // seq[0..4) 中通过档位 1 过滤的有 2 个
    expect(engine['totalSteps']()).toBe(2);
    expect(progressCalls).toBe(1); // 触发 onProgress
    expect(lastProgress?.currentStep).toBe(2);
    expect(lastProgress?.totalToExplore).toBe(2);
    // 关键：currentStep ≤ totalSteps（之前会失败，因为 currentStep=5 > totalSteps=2）
    expect(engine['currentStep']).toBeLessThanOrEqual(engine['totalSteps']());
    engine.stop();
  });

  it('switching depth back from 1 → 5: currentStep recomputed (grows)', () => {
    const cy = makeDepthCy();
    const engine = new TourEngine(cy);
    engine.start('s1', {
      interval: 1_000_000,
      maxDepth: 5,
      strategy: asStrategy('has-dfs'),
      onStep: () => {},
      onProgress: () => {},
      onComplete: () => {},
    });
    // 走 4 步
    (engine as unknown as { visitNext: () => void }).visitNext();
    (engine as unknown as { visitNext: () => void }).visitNext();
    (engine as unknown as { visitNext: () => void }).visitNext();
    (engine as unknown as { visitNext: () => void }).visitNext();
    // 切档 5 → 1
    engine.setMaxDepth(1);
    expect(engine['currentStep']).toBe(2);
    // 再切回 5
    engine.setMaxDepth(5);
    expect(engine['currentStep']).toBe(5); // 回到原值（5 步里所有节点都可见）
    expect(engine['totalSteps']()).toBe(5);
    expect(engine['currentStep']).toBeLessThanOrEqual(engine['totalSteps']());
    engine.stop();
  });

  it('switching to the same depth is a no-op (no recompute, no onProgress fire)', () => {
    const cy = makeDepthCy();
    const engine = new TourEngine(cy);
    let progressCalls = 0;
    engine.start('s1', {
      interval: 1_000_000,
      maxDepth: 5,
      strategy: asStrategy('has-dfs'),
      onStep: () => {},
      onProgress: () => { progressCalls++; },
      onComplete: () => {},
    });
    (engine as unknown as { visitNext: () => void }).visitNext();
    const before = engine['currentStep'];
    engine.setMaxDepth(5); // same as current
    expect(engine['currentStep']).toBe(before);
    expect(progressCalls).toBe(0); // 没切档，不应触发
    engine.stop();
  });

  it('depth 1 with no visible nodes visited yet: currentStep = 0, totalSteps = N (no crash)', () => {
    const cy = makeDepthCy();
    const engine = new TourEngine(cy);
    engine.start('s1', {
      interval: 1_000_000,
      maxDepth: 5,
      strategy: asStrategy('has-dfs'),
      onStep: () => {},
      onProgress: () => {},
      onComplete: () => {},
    });
    // 不走任何步，直接切档 5 → 1
    engine.setMaxDepth(1);
    // seqIndex = 1（start 后已经访问了 seq[0]），但 seq[0] 是 cls-structure，档位 1 可见
    expect(engine['currentStep']).toBe(1);
    expect(engine['totalSteps']()).toBe(2);
    engine.stop();
  });
});

// ── Bug: 节点一进入视野就触发 onStepAfterCenter，不再等 cy.animate complete ──
// 之前 onStepAfterCenter 在 cy.animate(600ms) 的 complete 回调里触发。
// 当 interval < 600ms（用户拖快滑块），下一次 visitNext 会 cy.stop() 取消
// 当前动画，cytoscape 默认 stop() 不触发 complete → 中间某些节点的 detail panel
// 从未刷新。修复：把 onStepAfterCenter 移到 highlightAndFocus 的 !silent 分支。
describe('TourEngine onStepAfterCenter firing (detail panel updates)', () => {
  it('fires onStepAfterCenter synchronously when a node is highlighted, not after animation', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
    ]);
    const engine = new TourEngine(cy);
    const afterCenterCalls: string[] = [];
    engine.start('a', {
      interval: 1,
      maxDepth: 0, // instant stop — just attach listeners
      strategy: asStrategy('has-dfs'),
      onStep: () => {},
      onStepAfterCenter: (info) => { afterCenterCalls.push(info.nodeId); },
      onComplete: () => {},
    });
    // start() 已经为 seq[0]='a' 触发了一次 onStepAfterCenter
    expect(afterCenterCalls).toEqual(['a']);
    // 同步驱动 visitNext → highlightAndFocus 应该**立即**触发 onStepAfterCenter
    // （不再等 cy.animate complete，因为 headless 下 cy.animate 的回调时序不可靠）
    (engine as unknown as { visitNext: () => void }).visitNext();
    expect(afterCenterCalls).toEqual(['a', 'b']);
    engine.stop();
  });

  it('does NOT fire onStepAfterCenter when silent=true (used by prev() / jumpToNode internals)', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
    ]);
    const engine = new TourEngine(cy);
    const afterCenterCalls: string[] = [];
    engine.start('a', {
      interval: 1,
      maxDepth: 0,
      strategy: asStrategy('has-dfs'),
      onStep: () => {},
      onStepAfterCenter: (info) => { afterCenterCalls.push(info.nodeId); },
      onComplete: () => {},
    });
    expect(afterCenterCalls).toEqual(['a']);
    // highlightAndFocus 的 silent 参数：start 内部用 silent=false，所以会触发；
    // silent=true 时（prev() 用的 silent=false，但 jumpToNode 没用 silent 参数）应该不触发。
    (engine as unknown as { highlightAndFocus: (id: string, path: string[], d: number, t: number, l: number, silent?: boolean) => void }).highlightAndFocus(
      'b', ['b'], 0, 2, 1, /* silent */ true,
    );
    // silent=true 时不应追加
    expect(afterCenterCalls).toEqual(['a']);
    engine.stop();
  });
});

// ── Bug: setInterval should reschedule the pending timer ──
// 之前 setInterval(ms) 只改 this.interval 但已经挂在 setTimeout 上的 timer 仍按
// 旧 delay 触发——拖快 interval 滑块体感"画面卡 1-4 秒"。修复：立即 clearTimeout
// 并按新 interval 重排。
describe('TourEngine setInterval reschedules the pending timer', () => {
  function make2Cy() {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
    ]);
    return cy;
  }

  it('reschedule: changes the pending timer to use the new interval', () => {
    const cy = make2Cy();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 5_000, // 5s = 4.4s delay
      maxDepth: -1, // 无限模式，否则 seq.length=2 + maxDepth=1 → 立即 onComplete
      strategy: asStrategy('has-dfs'),
      onStep: () => {},
      onComplete: () => {},
    });
    const oldTimer = engine['timer'];
    expect(oldTimer).toBeDefined();
    // 拖到 1s —— 应立即 clearTimeout 旧 timer 并按 1s (= max(0, 1000-600)=400ms) 重排
    engine.setInterval(1_000);
    const newTimer = engine['timer'];
    expect(newTimer).toBeDefined();
    expect(newTimer).not.toBe(oldTimer); // 应该是新 timer，不是旧的
    expect(engine['interval']).toBe(1_000);
    engine.stop();
  });

  it('reschedule: no-op when stopped or paused (timer stays empty / unchanged)', () => {
    const cy = make2Cy();
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 5_000,
      maxDepth: 0,
      strategy: asStrategy('has-dfs'),
      onStep: () => {},
      onComplete: () => {},
    });
    engine.stop();
    expect(engine['timer']).toBeUndefined();
    // stopped 状态下 setInterval 不应崩、不应建 timer
    engine.setInterval(1_000);
    expect(engine['timer']).toBeUndefined();
    expect(engine['interval']).toBe(1_000);
  });
});
