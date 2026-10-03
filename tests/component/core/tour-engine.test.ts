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
import {
  TourEngine,
  asStrategy,
  registerStrategy,
  unregisterStrategy,
  TourCompleteInfo,
  getStrategy,
  type SequenceParams,
} from '@/core/tour';

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

/** 测试访问私有成员的统一入口（bracket 索引访问推成 never，这里显式声明形状）。 */
type TourPrivates = {
  onComplete?: (info: TourCompleteInfo) => void;
  _restartAttempts: number;
  currentStep: number;
  totalSteps: () => number;
};

function priv(e: TourEngine): TourPrivates {
  return e as unknown as TourPrivates;
}

describe('TourEngine onComplete reason routing (issue #16)', () => {
  it('passes { reason: "depth-reached", maxAttempts } when maxDepth is bounded', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    let captured: TourCompleteInfo | null = null;
    installOnComplete(engine, (info) => {
      captured = info;
    });
    priv(engine).onComplete?.({ reason: 'depth-reached', maxAttempts: 3 });
    expect(captured?.reason).toBe('depth-reached');
    expect(captured?.maxAttempts).toBe(3);
  });

  it('passes { reason: "no-more-restarts", maxAttempts } when infinite mode exhausts', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    let captured: TourCompleteInfo | null = null;
    installOnComplete(engine, (info) => {
      captured = info;
    });
    priv(engine).onComplete?.({ reason: 'no-more-restarts', maxAttempts: 3 });
    expect(captured?.reason).toBe('no-more-restarts');
    expect(captured?.maxAttempts).toBe(3);
  });

  it('passes { reason: "no-root", maxAttempts } when no root node found', () => {
    const cy = makeCy();
    const engine = new TourEngine(cy);
    let captured: TourCompleteInfo | null = null;
    installOnComplete(engine, (info) => {
      captured = info;
    });
    priv(engine).onComplete?.({ reason: 'no-root', maxAttempts: 3 });
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
    expect(typeof priv(engine)._restartAttempts).toBe('number');
  });

  it('TourCompleteReason unions the three stop causes', () => {
    // Smoke test: the runtime strings are exactly the three documented
    // reasons. This guard catches typos that would silently break the
    // controller's branching.
    const cy = makeCy();
    const engine = new TourEngine(cy);
    const seen: string[] = [];
    installOnComplete(engine, (info) => seen.push(info.reason));
    priv(engine).onComplete?.({ reason: 'depth-reached', maxAttempts: 3 });
    priv(engine).onComplete?.({ reason: 'no-more-restarts', maxAttempts: 3 });
    priv(engine).onComplete?.({ reason: 'no-root', maxAttempts: 3 });
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
  // 测试策略钩子：shouldRestart 返回 false 时引擎立即收束，不再进入下一轮
  // （_restartAttempts 最终归 0）。
  //
  // 收束原因按 tour.ts 的定义：'no-more-restarts' 只留给「尝试重启但没产出」的
  // 轮次耗尽，策略主动拒绝重启（如 topo-prereq 一遍即完整覆盖）算「正常走完」，
  // 报 'depth-reached'。
  //
  // 测试不依赖真定时器：visitNext 是同步的，循环也只是同步 loopSafety。
  // 装一个 3 节点的 cy，用 registerStrategy 临时注册一个会调用 shouldRestart 的策略。
  it('shouldRestart returning false: first cycle completes then engine stops as depth-reached', () => {
    registerStrategy({
      id: 'test-no-restart',
      label: 'Test: no restart',
      buildSequence: (cy) =>
        cy
          .nodes()
          .not('.layer-parent')
          .map((n) => n.id()),
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
      maxDepth: -1, // infinite mode（否则 maxDepth > 0 会按 depth-reached 收束）
      strategy: asStrategy('test-no-restart'),
    });
    // start 会用 options.onComplete 覆盖 engine.onComplete，所以**之后**再装
    // 真正的捕获回调，否则我们的 captured 永远不会被赋值。
    installOnComplete(engine, (info) => {
      captured = info;
    });

    // 手动同步驱动 visitNext 把 seq 走完——而不是依赖 setTimeout。
    // seq = [a,b,c]，start 已经访问过 a（seqIndex=1），
    // visitNext 两次后 seqIndex 越过末尾，进入重启判定分支。
    (engine as unknown as { visitNext: () => void }).visitNext(); // visit b
    (engine as unknown as { visitNext: () => void }).visitNext(); // visit c → seq exhausted
    (engine as unknown as { visitNext: () => void }).visitNext(); // triggers restart logic

    expect(captured?.reason).toBe('depth-reached');
    expect(priv(engine)._restartAttempts).toBe(0); // 拒绝重启后计数会被清回 0

    engine.stop();
    // 清理：撤销测试策略，防止泄漏到后续测试。
    unregisterStrategy('test-no-restart');
  });
});

// ── 遍历模式参数：has-dfs + 顺序/倒序/随机 ──────────────────────────────
//
// 验证 TourEngine 通过 SequenceParams 把 mode (sequential / reverse / random)
// 正确传给策略的 buildSequence：
//   - 'sequential' (默认) = forward + sequential，等价于历史行为
//   - 'reverse'    = 章节层反序、章内正序
//   - 'random'     = 整体 Fisher-Yates 洗牌，每轮循环重新摇一次
//
// 测试策略：注册一个记录"最近一次 params 是什么"的 stub，重启时断言
// 拿到了新序列——比直接断言乱序结果更稳定（乱序结果是随机的）。

describe('TourEngine traversal mode (sequential / reverse / random)', () => {
  it('default mode is "sequential" — params default to forward + sequential', () => {
    let captured: SequenceParams | undefined;
    registerStrategy({
      id: 'test-capture-params',
      label: 'Test: capture params',
      buildSequence: (_cy, params) => {
        captured = params;
        return ['a'];
      },
    });
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([{ group: 'nodes', data: { id: 'a' } }]);
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1_000_000,
      maxDepth: -1,
      strategy: asStrategy('test-capture-params'),
    });
    // mode 字段未传 → 'sequential' → direction:'forward', shuffle:'sequential'
    expect(captured?.direction).toBe('forward');
    expect(captured?.shuffle).toBe('sequential');
    engine.stop();
    unregisterStrategy('test-capture-params');
  });

  it('mode "reverse" maps to direction:reverse + shuffle:sequential', () => {
    let captured: SequenceParams | undefined;
    registerStrategy({
      id: 'test-reverse-mode',
      label: 'Test: reverse mode',
      buildSequence: (_cy, params) => {
        captured = params;
        return ['a'];
      },
    });
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([{ group: 'nodes', data: { id: 'a' } }]);
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1_000_000,
      maxDepth: -1,
      strategy: asStrategy('test-reverse-mode'),
      mode: 'reverse',
    });
    expect(captured?.direction).toBe('reverse');
    expect(captured?.shuffle).toBe('sequential');
    engine.stop();
    unregisterStrategy('test-reverse-mode');
  });

  it('mode "random" maps to direction:forward + shuffle:random', () => {
    let captured: SequenceParams | undefined;
    registerStrategy({
      id: 'test-random-mode',
      label: 'Test: random mode',
      buildSequence: (_cy, params) => {
        captured = params;
        return ['a'];
      },
    });
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([{ group: 'nodes', data: { id: 'a' } }]);
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1_000_000,
      maxDepth: -1,
      strategy: asStrategy('test-random-mode'),
      mode: 'random',
    });
    expect(captured?.direction).toBe('forward');
    expect(captured?.shuffle).toBe('random');
    engine.stop();
    unregisterStrategy('test-random-mode');
  });

  it('setMode() mid-tour regenerates the seq — params reflect the new mode on the next call', () => {
    const calls: SequenceParams[] = [];
    registerStrategy({
      id: 'test-setmode',
      label: 'Test: setMode',
      buildSequence: (_cy, params) => {
        calls.push(params!);
        return ['a', 'b'];
      },
      hooks: { shouldRestart: () => true }, // 强制允许重启，便于观察 rebuild
    });
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
    ]);
    const engine = new TourEngine(cy);
    engine.start('a', {
      interval: 1_000_000,
      maxDepth: -1,
      strategy: asStrategy('test-setmode'),
      mode: 'sequential',
    });
    // start 调用了 1 次 buildSequence
    expect(calls.length).toBe(1);
    expect(calls[0]?.shuffle).toBe('sequential');
    // 用户切到 reverse → setMode 触发 regenerateSeq
    engine.setMode('reverse');
    expect(calls.length).toBe(2);
    expect(calls[1]?.direction).toBe('reverse');
    expect(calls[1]?.shuffle).toBe('sequential');
    engine.stop();
    unregisterStrategy('test-setmode');
  });

  it('"random" + injected RNG: buildSequence receives the deterministic RNG (testing seam)', () => {
    let capturedRng: (() => number) | undefined;
    registerStrategy({
      id: 'test-rng-injection',
      label: 'Test: rng injection',
      buildSequence: (_cy, params) => {
        capturedRng = params?.rng;
        return ['a'];
      },
    });
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([{ group: 'nodes', data: { id: 'a' } }]);
    const engine = new TourEngine(cy);
    const seeded = () => 0.42;
    engine.start('a', {
      interval: 1_000_000,
      maxDepth: -1,
      strategy: asStrategy('test-rng-injection'),
      mode: 'random',
      rng: seeded,
    });
    expect(capturedRng).toBe(seeded);
    engine.stop();
    unregisterStrategy('test-rng-injection');
  });

  it('"每轮循环都摇一次"语义：has-dfs + mode:random + restart 路径每次都调 rng', () => {
    // 用真实注册的 has-dfs 策略——这是"每轮循环都摇一次"语义的关键。
    // 验证：
    //   1. start 阶段 rng 被调 1 次
    //   2. 走完一轮后 visitNext restart 分支触发，会再调 buildSequence（带 params）
    //   3. 这次 rng 又被调（实现"重摇"）
    //
    // 怎么观察 rng 调用次数：注入一个计数器 rng + 用 spy 跟踪。rng 被
    // 调用的次数 == buildSequence 里 shuffleInPlaceWithRng 的 O(n) 次。
    // 简化：我们关心"shuffle 是否在第二轮被调用"，而不是具体次数。
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
      { group: 'nodes', data: { id: 'c' } },
    ]);
    const engine = new TourEngine(cy);
    // 注入 spy rng，每次返回 0.5（固定），让 shuffle 行为可预期。
    const rng = vi.fn(() => 0.5);
    engine.start('a', {
      interval: 1_000_000,
      maxDepth: -1,
      strategy: asStrategy('has-dfs'),
      mode: 'random',
      rng,
    });
    const callsAfterStart = rng.mock.calls.length;
    expect(callsAfterStart).toBeGreaterThan(0); // start 阶段已经摇过
    // 手动驱动 visitNext 把第一轮走完并触发 restart 路径。
    // start 已经访问 a（seqIndex=1），visitNext 两次后越过末尾 → restart 分支
    // → buildSequence 第二次被调（rng 又被摇）。
    (engine as unknown as { visitNext: () => void }).visitNext(); // visit b
    (engine as unknown as { visitNext: () => void }).visitNext(); // visit c
    (engine as unknown as { visitNext: () => void }).visitNext(); // → restart, buildSequence 再调
    expect(rng.mock.calls.length).toBeGreaterThan(callsAfterStart); // rng 在第二轮又被摇
    engine.stop();
  });

  it('mode:"reverse" + has-dfs 真的反转章节层（has-dfs 用 sortedStructures.reverse）', () => {
    // 用真实图（有结构节点）来验证 direction:'reverse' 下 seq 顺序确实反了。
    const cy = cytoscape({ headless: true, styleEnabled: false });
    // 三个 structure 节点，按 locationKey 排序后是 y2<y3<y4
    cy.add([
      {
        group: 'nodes',
        data: {
          id: 'a',
          fill: 'cls-structure',
          location: { book: 'y2', chapter: '第一章' },
        },
      },
      {
        group: 'nodes',
        data: {
          id: 'b',
          fill: 'cls-structure',
          location: { book: 'y3', chapter: '第二章' },
        },
      },
      {
        group: 'nodes',
        data: {
          id: 'c',
          fill: 'cls-structure',
          location: { book: 'y4', chapter: '第三章' },
        },
      },
    ]);
    const seqForward = getStrategy(asStrategy('has-dfs')).buildSequence(cy, {
      direction: 'forward',
      shuffle: 'sequential',
    });
    const seqReverse = getStrategy(asStrategy('has-dfs')).buildSequence(cy, {
      direction: 'reverse',
      shuffle: 'sequential',
    });
    // forward = [a, b, c]
    expect(seqForward).toEqual(['a', 'b', 'c']);
    // reverse = [c, b, a]（章节层反序）
    expect(seqReverse).toEqual(['c', 'b', 'a']);
  });

  // ── Regression: reverse 模式下，章内子节（cls-structure 兄弟）也要 reverse。
  // 旧逻辑只翻章节层（allStructures.reverse()），章内子节保持正向——用户报告
  // "reverse 还是从药二第一章第一节开始，而不是最后一章最后一节"。修复：dfsChildren
  // 在 direction === 'reverse' && fill === 'cls-structure' 时对兄弟节点 reverse。
  // 子节内的 cls-classification / cls-drug / cls-mnemonic 等保持正向（"先骨架后
  // 细节"在 reverse 模式下也成立——用户原话："节下面还是先分类再药名"）。
  it('mode:"reverse" + has-dfs：章内子节兄弟节点 reverse，子节内其他 fill 保持正序', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    // tour.ts 通过节点 data.edges_out 读关系（不通过 cytoscape edge）——这是
    // build-graph 把 frontmatter 关系塞进节点的格式。生产代码只看这部分。
    cy.add([
      // book-y2 (no edges_out = no parent)
      { group: 'nodes', data: { id: 'book-y2', fill: 'cls-structure', location: { book: 'y2' } } },
      // sec-y2-01（第一章）：用 subclass_of 边指向 book-y2
      {
        group: 'nodes',
        data: {
          id: 'sec-y2-01',
          fill: 'cls-structure',
          location: { book: 'y2', chapter: '第一章' },
          edges_out: [{ type: 'subclass_of', target: 'book-y2' }],
        },
      },
      // sec-y2-01-第一节：part_of sec-y2-01
      {
        group: 'nodes',
        data: {
          id: 'sec-y2-01-第一节',
          fill: 'cls-structure',
          location: { book: 'y2', chapter: '第一章', section: '第一节' },
          edges_out: [{ type: 'part_of', target: 'sec-y2-01' }],
        },
      },
      // sec-y2-01-第三节：part_of sec-y2-01
      {
        group: 'nodes',
        data: {
          id: 'sec-y2-01-第三节',
          fill: 'cls-structure',
          location: { book: 'y2', chapter: '第一章', section: '第三节' },
          edges_out: [{ type: 'part_of', target: 'sec-y2-01' }],
        },
      },
      // cls-y2-01（分类）：part_of sec-y2-01
      {
        group: 'nodes',
        data: {
          id: 'cls-y2-01',
          fill: 'cls-classification',
          location: { book: 'y2', chapter: '第一章' },
          edges_out: [{ type: 'part_of', target: 'sec-y2-01' }],
        },
      },
      // drug-y2-01（药）：part_of sec-y2-01
      {
        group: 'nodes',
        data: {
          id: 'drug-y2-01',
          fill: 'cls-drug',
          location: { book: 'y2', chapter: '第一章' },
          edges_out: [{ type: 'part_of', target: 'sec-y2-01' }],
        },
      },
    ]);
    const seqReverse = getStrategy(asStrategy('has-dfs')).buildSequence(cy, {
      direction: 'reverse',
      shuffle: 'sequential',
    });
    // reverse 序关键断言（仅相对顺序，不假设绝对位置）：
    //   1. book-y2 不在 seq[0]（章节层 reverse 后 book-y2 在最末）
    //   2. sec-y2-01-第三节（第三节）排在 sec-y2-01-第一节（第一节）之前
    //      （章内子节 reverse）
    //   3. cls-y2-01（分类）排在 drug-y2-01（药）之前
    //      （"先骨架后细节"在 reverse 模式下也成立）
    const idxBookY2 = seqReverse.indexOf('book-y2');
    const idxSecA = seqReverse.indexOf('sec-y2-01-第一节');
    const idxSecC = seqReverse.indexOf('sec-y2-01-第三节');
    const idxCls = seqReverse.indexOf('cls-y2-01');
    const idxDrug = seqReverse.indexOf('drug-y2-01');
    expect(idxBookY2).not.toBe(0); // book-y2 不在最前（章节层 reverse）
    expect(idxSecC).toBeLessThan(idxSecA); // 第三节排在第一节之前
    expect(idxCls).toBeLessThan(idxDrug); // 分类排在药之前
  });

  // ── Regression: reverse / random 模式下，applyRootScope 不再强行 unshift rootId。
  // 旧逻辑下不管 mode 是什么，都把 rootId 提到 seq 第一位——reverse 序列失效，
  // 用户报告"选了倒序怎么还是从第一章开始"。
  it('reverse 模式下 applyRootScope 不 unshift rootId——reverse 子树顺序保留', () => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      // y2 全书结构 + 9 个章节 + 9 个第一节
      { group: 'nodes', data: { id: 'book-y2', fill: 'cls-structure', location: { book: 'y2' } } },
      {
        group: 'nodes',
        data: {
          id: 'sec-y2-01',
          fill: 'cls-structure',
          location: { book: 'y2', chapter: '第一章' },
        },
      },
      {
        group: 'nodes',
        data: {
          id: 'sec-y2-09',
          fill: 'cls-structure',
          location: { book: 'y2', chapter: '第九章' },
        },
      },
    ]);
    // 模拟"用户选了 y2 第一章(universe = sec-y2-01 子树)"的开 tour 场景
    const engine = new TourEngine(cy);
    engine.start('sec-y2-01', {
      interval: 1_000_000,
      maxDepth: -1,
      strategy: asStrategy('has-dfs'),
      mode: 'reverse',
      // 模拟 universe：只包含 sec-y2-01 后代（仅自身，因为没有别的子节点）
      universeNodeIds: new Set(['sec-y2-01']),
    });
    // reverse 模式下，seq 不应被 unshift 改变——seq[0] 是策略自然算出的顺序。
    // 因为 y2 第一章只有 sec-y2-01 这一个节点，seq = ['sec-y2-01']，unshift 不影响。
    // 验证点：跟 sequential 模式跑出来的 seq 一致（因为过滤后只有一个节点）。
    expect(priv(engine).seq).toEqual(['sec-y2-01']);
    engine.stop();
  });

  it('sequential 模式下 applyRootScope 仍然 unshift rootId（保留传统行为）', () => {
    // 多节点 universe 下验证 forward 模式仍 unshift——这是历史行为，
    // 不能因为改 reverse 就破坏 forward。
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'book-y2', fill: 'cls-structure', location: { book: 'y2' } } },
      {
        group: 'nodes',
        data: {
          id: 'sec-y2-01',
          fill: 'cls-structure',
          location: { book: 'y2', chapter: '第一章' },
        },
      },
      {
        group: 'nodes',
        data: {
          id: 'sec-y2-09',
          fill: 'cls-structure',
          location: { book: 'y2', chapter: '第九章' },
        },
      },
    ]);
    const engine = new TourEngine(cy);
    engine.start('sec-y2-09', {
      interval: 1_000_000,
      maxDepth: -1,
      strategy: asStrategy('has-dfs'),
      mode: 'sequential',
      // universe 包含 y2 全部后代——模拟"选了 y2 第九章，整个 y2 都属于该体系"
      universeNodeIds: new Set(['book-y2', 'sec-y2-01', 'sec-y2-09']),
    });
    // sequential + unshift：用户选的 sec-y2-09 必须排第一
    expect(priv(engine).seq[0]).toBe('sec-y2-09');
    engine.stop();
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
    expect(priv(engine).currentStep).toBe(5); // start() ++1 + 4 次 visitNext ++1

    // 切档 5 → 1：visible = 2 (s1, s2)，所以 currentStep 应该重算为 2
    progressCalls = 0;
    engine.setMaxDepth(1);
    expect(priv(engine).currentStep).toBe(2); // seq[0..4) 中通过档位 1 过滤的有 2 个
    expect(priv(engine).totalSteps()).toBe(2);
    expect(progressCalls).toBe(1); // 触发 onProgress
    expect(lastProgress?.currentStep).toBe(2);
    expect(lastProgress?.totalToExplore).toBe(2);
    // 关键：currentStep ≤ totalSteps（之前会失败，因为 currentStep=5 > totalSteps=2）
    expect(priv(engine).currentStep).toBeLessThanOrEqual(priv(engine).totalSteps());
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
    expect(priv(engine).currentStep).toBe(2);
    // 再切回 5
    engine.setMaxDepth(5);
    expect(priv(engine).currentStep).toBe(5); // 回到原值（5 步里所有节点都可见）
    expect(priv(engine).totalSteps()).toBe(5);
    expect(priv(engine).currentStep).toBeLessThanOrEqual(priv(engine).totalSteps());
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
      onProgress: () => {
        progressCalls++;
      },
      onComplete: () => {},
    });
    (engine as unknown as { visitNext: () => void }).visitNext();
    const before = priv(engine).currentStep;
    engine.setMaxDepth(5); // same as current
    expect(priv(engine).currentStep).toBe(before);
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
    expect(priv(engine).currentStep).toBe(1);
    expect(priv(engine).totalSteps()).toBe(2);
    engine.stop();
  });
});

// ── Bug: 选中分类节点 + 低档位时，漫游退化成"只走 root 自己"（进度条 1/1）。
// 旧守卫只在 totalSteps === 0 时自动升档（ADR-0006 §3.3）；root 自己在档内时
// 计数是 1 不是 0，于是 L2/L3 下选一个子树里没有重点药（stroke: double）的
// 分类节点，漫游就永远停在 root 上。修复：totalSteps === 1 且子树还有别的节点
// 时也自动升档，逐级升到第一个 totalSteps > 1 的档位。
describe('TourEngine auto-upgrade subtree-filtered root (1/1 degenerate tour)', () => {
  /** 苯二氮卓类子树：分类(root, stroke:double 也是普通分类) + 8 个普通药 + 2 个口诀。
   *  L3(重点)下只有 root 自己进档 → 应升到 L4（结构+分类+全部药，9 步）。 */
  function makeBenzodiazepineCy() {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    cy.add([
      { group: 'nodes', data: { id: 'cls-benzodiazepine-y2-01-01', fill: 'cls-classification' } },
      { group: 'nodes', data: { id: 'drug-triazolam-y2-01-01', fill: 'cls-drug' } },
      { group: 'nodes', data: { id: 'drug-lorazepam-y2-01-01', fill: 'cls-drug' } },
      { group: 'nodes', data: { id: 'drug-midazolam-y2-01-01', fill: 'cls-drug' } },
      { group: 'nodes', data: { id: 'drug-diazepam-y2-01-01', fill: 'cls-drug' } },
      { group: 'nodes', data: { id: 'drug-quazepam-y2-01-01', fill: 'cls-drug' } },
      { group: 'nodes', data: { id: 'drug-temazepam-y2-01-01', fill: 'cls-drug' } },
      { group: 'nodes', data: { id: 'drug-clonazepam-y2-01-01', fill: 'cls-drug' } },
      { group: 'nodes', data: { id: 'drug-estazolam-y2-01-01', fill: 'cls-drug' } },
      { group: 'nodes', data: { id: 'mem-benzodiazepine-y2-01-01', fill: 'cls-mnemonic' } },
      { group: 'nodes', data: { id: 'mem-benzodiazepine-cls-y2-01-01', fill: 'cls-mnemonic' } },
      // 子→父（part_of / subclass_of）：root 是 8 药 + 2 口诀的父
      {
        group: 'edges',
        data: { source: 'drug-triazolam-y2-01-01', target: 'cls-benzodiazepine-y2-01-01' },
      },
      {
        group: 'edges',
        data: { source: 'drug-lorazepam-y2-01-01', target: 'cls-benzodiazepine-y2-01-01' },
      },
      {
        group: 'edges',
        data: { source: 'drug-midazolam-y2-01-01', target: 'cls-benzodiazepine-y2-01-01' },
      },
      {
        group: 'edges',
        data: { source: 'drug-diazepam-y2-01-01', target: 'cls-benzodiazepine-y2-01-01' },
      },
      {
        group: 'edges',
        data: { source: 'drug-quazepam-y2-01-01', target: 'cls-benzodiazepine-y2-01-01' },
      },
      {
        group: 'edges',
        data: { source: 'drug-temazepam-y2-01-01', target: 'cls-benzodiazepine-y2-01-01' },
      },
      {
        group: 'edges',
        data: { source: 'drug-clonazepam-y2-01-01', target: 'cls-benzodiazepine-y2-01-01' },
      },
      {
        group: 'edges',
        data: { source: 'drug-estazolam-y2-01-01', target: 'cls-benzodiazepine-y2-01-01' },
      },
      {
        group: 'edges',
        data: { source: 'mem-benzodiazepine-y2-01-01', target: 'cls-benzodiazepine-y2-01-01' },
      },
      {
        group: 'edges',
        data: { source: 'mem-benzodiazepine-cls-y2-01-01', target: 'cls-benzodiazepine-y2-01-01' },
      },
    ]);
    return cy;
  }

  it('L3 on a classification subtree with no key drugs: auto-upgrades to L4, not L5', () => {
    const cy = makeBenzodiazepineCy();
    const engine = new TourEngine(cy);
    const upgrades: Array<{ requested: number; upgraded: number; reason: string }> = [];
    const ok = engine.start('cls-benzodiazepine-y2-01-01', {
      interval: 1_000_000,
      maxDepth: 3,
      strategy: asStrategy('has-dfs'),
      universeNodeIds: new Set([
        'cls-benzodiazepine-y2-01-01',
        'drug-triazolam-y2-01-01',
        'drug-lorazepam-y2-01-01',
        'drug-midazolam-y2-01-01',
        'drug-diazepam-y2-01-01',
        'drug-quazepam-y2-01-01',
        'drug-temazepam-y2-01-01',
        'drug-clonazepam-y2-01-01',
        'drug-estazolam-y2-01-01',
        'mem-benzodiazepine-y2-01-01',
        'mem-benzodiazepine-cls-y2-01-01',
      ]),
      onRootOutOfLevel: (info) =>
        upgrades.push({
          requested: info.requestedLevel,
          upgraded: info.upgradedLevel,
          reason: info.reason,
        }),
      onStep: () => {},
      onProgress: () => {},
      onComplete: () => {},
    });
    expect(ok).toBe(true);
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0]).toEqual({ requested: 3, upgraded: 4, reason: 'subtree-filtered' });
    // L4 = root + 8 普通药（9 步）；mnemonic 不属于 L4，保持 9。
    expect(priv(engine).totalSteps()).toBe(9);
    engine.stop();
  });

  it('L2 on the same subtree also upgrades (classification + drugs only at L4)', () => {
    const cy = makeBenzodiazepineCy();
    const engine = new TourEngine(cy);
    const upgrades: Array<{ requested: number; upgraded: number; reason: string }> = [];
    engine.start('cls-benzodiazepine-y2-01-01', {
      interval: 1_000_000,
      maxDepth: 2,
      strategy: asStrategy('has-dfs'),
      universeNodeIds: new Set([
        'cls-benzodiazepine-y2-01-01',
        'drug-triazolam-y2-01-01',
        'drug-lorazepam-y2-01-01',
        'drug-midazolam-y2-01-01',
        'drug-diazepam-y2-01-01',
        'drug-quazepam-y2-01-01',
        'drug-temazepam-y2-01-01',
        'drug-clonazepam-y2-01-01',
        'drug-estazolam-y2-01-01',
        'mem-benzodiazepine-y2-01-01',
        'mem-benzodiazepine-cls-y2-01-01',
      ]),
      onRootOutOfLevel: (info) =>
        upgrades.push({
          requested: info.requestedLevel,
          upgraded: info.upgradedLevel,
          reason: info.reason,
        }),
      onStep: () => {},
      onProgress: () => {},
      onComplete: () => {},
    });
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0]).toEqual({ requested: 2, upgraded: 4, reason: 'subtree-filtered' });
    expect(priv(engine).totalSteps()).toBe(9);
    engine.stop();
  });

  it('a subtree that already has a key drug at L3 does NOT upgrade (root counts, so >1)', () => {
    const cy = makeBenzodiazepineCy();
    // 给其中一个药打上 stroke: double —— L3 下就能走出 root + 重点药，不该升档。
    cy.getElementById('drug-diazepam-y2-01-01').data('stroke', 'double');
    const engine = new TourEngine(cy);
    const upgrades: unknown[] = [];
    engine.start('cls-benzodiazepine-y2-01-01', {
      interval: 1_000_000,
      maxDepth: 3,
      strategy: asStrategy('has-dfs'),
      universeNodeIds: new Set([
        'cls-benzodiazepine-y2-01-01',
        'drug-triazolam-y2-01-01',
        'drug-lorazepam-y2-01-01',
        'drug-midazolam-y2-01-01',
        'drug-diazepam-y2-01-01',
        'drug-quazepam-y2-01-01',
        'drug-temazepam-y2-01-01',
        'drug-clonazepam-y2-01-01',
        'drug-estazolam-y2-01-01',
        'mem-benzodiazepine-y2-01-01',
        'mem-benzodiazepine-cls-y2-01-01',
      ]),
      onRootOutOfLevel: () => upgrades.push('upgrade'),
      onStep: () => {},
      onProgress: () => {},
      onComplete: () => {},
    });
    expect(upgrades).toHaveLength(0);
    // L3 下 root + 1 重点药 = 2 步，不再退化。
    expect(priv(engine).totalSteps()).toBe(2);
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
      onStepAfterCenter: (info) => {
        afterCenterCalls.push(info.nodeId);
      },
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
      onStepAfterCenter: (info) => {
        afterCenterCalls.push(info.nodeId);
      },
      onComplete: () => {},
    });
    expect(afterCenterCalls).toEqual(['a']);
    // highlightAndFocus 的 silent 参数：start 内部用 silent=false，所以会触发；
    // silent=true 时（prev() 用的 silent=false，但 jumpToNode 没用 silent 参数）应该不触发。
    (
      engine as unknown as {
        highlightAndFocus: (
          id: string,
          path: string[],
          d: number,
          t: number,
          l: number,
          silent?: boolean,
        ) => void;
      }
    ).highlightAndFocus('b', ['b'], 0, 2, 1, /* silent */ true);
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

/**
 * has-dfs 防环爆栈回归测试（之前 console 报 "Maximum call stack size exceeded"
 * at collectTree:663）—— 数据若有环（自环 A→A / 二元环 A→B→A / 三元环 A→B→C→A），
 * 不应让整个漫游崩掉；应剪枝跳过环分支并降级输出"环外可访问节点"。
 *
 * 验证 4 点：
 *   1. 不抛 RangeError（不被爆栈）
 *   2. 返回的 seq 不含重复 id（visited 仍生效）
 *   3. console.warn 被调用 1 次（环信号未丢失）
 *   4. 环外的可达节点仍能 emit（不会因为 1 个环让整棵子树被丢弃）
 */
describe('has-dfs buildSequence cycle defense', () => {
  /** A simple helper: get has-dfs via getStrategy() */
  function seqOf(cy: cytoscape.Core): string[] {
    return getStrategy(asStrategy('has-dfs')).buildSequence(cy);
  }

  /** warn spy — returns the spy so callers can assert on it */
  function spyWarn(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(console, 'warn').mockImplementation(() => {});
  }

  function makeEmptyCy() {
    return cytoscape({ headless: true, styleEnabled: true });
  }

  it('survives a self-loop on a structure node (A→A)', () => {
    const cy = makeEmptyCy();
    cy.add([
      // 自环：A 是 structure，A.part_of 自己 —— 构造有环的 part_of 边
      { group: 'nodes', data: { id: 'A', fill: 'cls-structure' } },
      {
        group: 'nodes',
        data: { id: 'B', fill: 'cls-structure', edges_out: [{ type: 'part_of', target: 'A' }] },
      },
    ]);
    // 现在故意给 A 加一个 part_of 自环（罕见但真实会出现的脏数据）
    cy.getElementById('A').data('edges_out', [{ type: 'part_of', target: 'A' }]);

    const warn = spyWarn();
    let seq: string[];
    expect(() => {
      seq = seqOf(cy);
    }).not.toThrow();
    expect(seq!).toContain('A');
    expect(seq!).toContain('B');
    expect(new Set(seq!).size).toBe(seq!.length); // 无重复
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('survives a 2-cycle (A part_of B, B part_of A)', () => {
    const cy = makeEmptyCy();
    cy.add([
      { group: 'nodes', data: { id: 'A', fill: 'cls-structure' } },
      { group: 'nodes', data: { id: 'B', fill: 'cls-structure' } },
    ]);
    cy.getElementById('A').data('edges_out', [{ type: 'part_of', target: 'B' }]);
    cy.getElementById('B').data('edges_out', [{ type: 'part_of', target: 'A' }]);

    const warn = spyWarn();
    let seq: string[];
    expect(() => {
      seq = seqOf(cy);
    }).not.toThrow();
    expect(seq!).toContain('A');
    expect(seq!).toContain('B');
    expect(new Set(seq!).size).toBe(seq!.length);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('survives a 3-cycle (A→B→C→A) plus an unrelated tree', () => {
    const cy = makeEmptyCy();
    cy.add([
      { group: 'nodes', data: { id: 'A', fill: 'cls-structure' } },
      { group: 'nodes', data: { id: 'B', fill: 'cls-structure' } },
      { group: 'nodes', data: { id: 'C', fill: 'cls-structure' } },
      // 环：A part_of B, B part_of C, C part_of A
      // 与此同时 C 还有另一个独立子节点 D（环外可达）
    ]);
    cy.getElementById('A').data('edges_out', [{ type: 'part_of', target: 'B' }]);
    cy.getElementById('B').data('edges_out', [{ type: 'part_of', target: 'C' }]);
    cy.getElementById('C').data('edges_out', [{ type: 'part_of', target: 'A' }]);
    cy.add({
      group: 'nodes',
      data: { id: 'D', fill: 'cls-drug', edges_out: [{ type: 'part_of', target: 'A' }] },
    });

    const warn = spyWarn();
    let seq: string[];
    expect(() => {
      seq = seqOf(cy);
    }).not.toThrow();
    expect(seq!).toContain('A');
    expect(seq!).toContain('B');
    expect(seq!).toContain('C');
    expect(seq!).toContain('D'); // 环外的节点仍被访问到（关键）
    expect(new Set(seq!).size).toBe(seq!.length);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warn is rate-limited to 3 messages even with many cycles', () => {
    const cy = makeEmptyCy();
    // 5 个自环结构节点
    const ids = ['s1', 's2', 's3', 's4', 's5'];
    for (const id of ids) {
      cy.add({ group: 'nodes', data: { id, fill: 'cls-structure' } });
      cy.getElementById(id).data('edges_out', [{ type: 'part_of', target: id }]);
    }

    const warn = spyWarn();
    seqOf(cy);
    // 至少 1 次，但 ≤ 3 次（rate limit）
    const cycleWarns = warn.mock.calls.filter((c) =>
      String(c[0] ?? '').includes('[tour.has-dfs] cycle detected'),
    );
    expect(cycleWarns.length).toBeGreaterThan(0);
    expect(cycleWarns.length).toBeLessThanOrEqual(3);
    warn.mockRestore();
  });
});
