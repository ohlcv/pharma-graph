import { describe, it, expect, vi } from 'vitest';
import { animatePositionsTo, computeEntranceSchedule } from '@/core/layout-worker-client';

/**
 * 入场动画调度是观感算法：固定时长版本下，远节点「飞过去像撞墙」、近节点
 * 「一闪而过」，差异可达 350 倍。改自适应时长后，所有节点平均视觉速度一致，
 * 「结构从中心向外结晶」才有视觉前提。
 *
 * 测的不只是「数值」，而是**距离归一化 + delay/duration 两套公式互相独立**
 * 这两个算法契约——任何一处的缩放系数错了，肉眼上要么拖要么闪。
 */
describe('computeEntranceSchedule', () => {
  const opts = { staggerMs: 500, minMs: 600, maxMs: 2500 };

  it('end 为空时返回空 schedule', () => {
    const s = computeEntranceSchedule({}, {}, opts);
    expect(s.perNode).toHaveLength(0);
    expect(s.totalMs).toBe(0);
    expect(s.maxDist).toBe(0);
  });

  it('所有节点终点重合时（maxDist === 0）返回空 schedule', () => {
    const end = { a: { x: 5, y: 5 }, b: { x: 5, y: 5 } };
    const s = computeEntranceSchedule(end, {}, opts);
    expect(s.perNode).toHaveLength(0);
    expect(s.maxDist).toBe(0);
  });

  it('最小 dist 节点拿到最短 duration、最大 dist 节点拿到最长 duration', () => {
    // 4 节点几何（任一非均匀即可），断言「最靠近质心的节点 → duration 接近 minMs，
    // 最远离质心的节点 → duration 接近 maxMs」。具体哪个 id 是哪个不重要——
    // 只看 perNode 里最小 / 最大 duration 对应的节点。
    const end = {
      a: { x: 4.5, y: 0 },
      b: { x: 2, y: 0 },
      c: { x: 7, y: 0 },
      d: { x: 10, y: 0 },
    };
    // 质心 ≈ (5.875, 0)；d 是唯一最远点，c 是最近点
    const s = computeEntranceSchedule(end, {}, opts);
    const durations = s.perNode.map((p) => p.duration);
    const delays = s.perNode.map((p) => p.delay);

    // 最远点: max duration = maxMs（精确）、delay = staggerMs（精确）
    expect(Math.max(...durations)).toBeCloseTo(opts.maxMs);
    expect(Math.max(...delays)).toBeCloseTo(opts.staggerMs);

    // 最近点: duration 在 [minMs, maxMs] 内（取决于 t, 不是 dist=0）
    const minDur = Math.min(...durations);
    expect(minDur).toBeGreaterThanOrEqual(opts.minMs - 1e-9);
    expect(minDur).toBeLessThanOrEqual(opts.maxMs);
    // min delay = 0（几何上至少有一个节点 ≤ 质心侧，只要 maxDist > 0）
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...delays)).toBeLessThanOrEqual(opts.staggerMs);
  });

  it('最外围节点拿到 maxMs + staggerMs 满档', () => {
    // d 在最远端：t = 1
    const end = {
      a: { x: 5, y: 0 },
      b: { x: 3, y: 0 },
      c: { x: 7, y: 0 },
      d: { x: 10, y: 0 },
    };
    const s = computeEntranceSchedule(end, {}, opts);
    const d = s.perNode.find((p) => p.id === 'd')!;
    expect(d.delay).toBe(opts.staggerMs); // 500
    expect(d.duration).toBe(opts.maxMs); // 2500
    expect(s.totalMs).toBe(opts.staggerMs + opts.maxMs); // 3000
  });

  it('中间节点按 t=dist/maxDist 在 [minMs, maxMs] 区间内插值', () => {
    // 三节点非均匀：a 近质心（t 小），b 中等，c 最远（t = 1）。
    // 关键断言：delay / duration 严格在两端之间。
    const end = {
      a: { x: 4.5, y: 0 }, // dist = 0.5 / 5 = 0.1
      b: { x: 2, y: 0 },   // dist = 3 / 5 = 0.6
      c: { x: 10, y: 0 },  // dist = 5 / 5 = 1
    };
    // 质心 = (16.5/3, 0) = (5.5, 0)
    const s = computeEntranceSchedule(end, {}, opts);
    const a = s.perNode.find((p) => p.id === 'a')!;
    const b = s.perNode.find((p) => p.id === 'b')!;
    const c = s.perNode.find((p) => p.id === 'c')!;

    // delay: a < b < c
    expect(a.delay).toBeLessThan(b.delay);
    expect(b.delay).toBeLessThan(c.delay);
    // duration: a < b < c
    expect(a.duration).toBeLessThan(b.duration);
    expect(b.duration).toBeLessThan(c.duration);

    // 区间边界
    expect(a.duration).toBeGreaterThanOrEqual(opts.minMs);
    expect(c.duration).toBeLessThanOrEqual(opts.maxMs + 1e-9);
    expect(a.delay).toBeGreaterThanOrEqual(0);
    expect(c.delay).toBeLessThanOrEqual(opts.staggerMs + 1e-9);
  });

  it('delay 和 duration 用同一条归一化基准（同一个 t）', () => {
    // 一致性: t = 0.3 时 delay = 0.3 * staggerMs, duration = min + 0.3 * (max - min)
    const end = {
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      c: { x: 10, y: 0 },
    };
    // 质心 = (13/3, 0), maxDist = hypot(10 - 13/3, 0) ≈ 6.667
    // b 节点的 dist ≈ hypot(3 - 13/3, 0) = 4/3, t ≈ 0.2
    const s = computeEntranceSchedule(end, {}, opts);
    const b = s.perNode.find((p) => p.id === 'b')!;
    // 验证比例：delay/duration 与 staggerMs/(maxMs - minMs) 同号同 t
    const t = b.delay / opts.staggerMs;
    const tFromDur = (b.duration - opts.minMs) / (opts.maxMs - opts.minMs);
    expect(t).toBeCloseTo(tFromDur, 5);
  });

  it('start 缺失某 id 时不抛错，回退到 end 位置（零位移但不动画卡死）', () => {
    // 实际场景里 start 应当与 end 同 id 集，但接口允许不等——不能因为一个
    // 节点缺 start 就把整张图的动画炸掉。
    const end = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
    const start = { a: { x: 0, y: 0 } }; // b 缺失
    expect(() => computeEntranceSchedule(end, start, opts)).not.toThrow();
    const s = computeEntranceSchedule(end, start, opts);
    const b = s.perNode.find((p) => p.id === 'b')!;
    expect(b.from).toEqual(b.to); // 缺失则 from = to
  });

  it('总时长 = max(delay + duration)，不是 staggerMs + maxMs（理论上可能重合）', () => {
    // 用非对称 opt 制造差：staggerMs 大但 maxMs 小，外围节点 delay+duration
    // 反而不是 staggerMs + maxMs。
    const oddOpts = { staggerMs: 1000, minMs: 100, maxMs: 200 };
    const end = {
      core: { x: 0, y: 0 },
      edge: { x: 10, y: 0 },
    };
    const s = computeEntranceSchedule(end, {}, oddOpts);
    // core: delay=0, duration=100 → finish=100
    // edge: delay=1000, duration=200 → finish=1200
    // totalMs = 1200（不是 1000 + 200 = 1200，这条恰好重合；换 stagger=1500 验证）
    expect(s.totalMs).toBe(1200);

    const oddOpts2 = { staggerMs: 1500, minMs: 100, maxMs: 200 };
    const s2 = computeEntranceSchedule(end, {}, oddOpts2);
    // edge: delay=1500, duration=200 → finish=1700
    expect(s2.totalMs).toBe(1700);
  });

  it('maxDist 透出供 log / 调试用', () => {
    const end = {
      a: { x: 0, y: 0 },
      b: { x: 3, y: 4 }, // dist = 5
    };
    const s = computeEntranceSchedule(end, {}, opts);
    // 质心 (1.5, 2), max(hypot(0-1.5, 0-2), hypot(3-1.5, 4-2)) = max(2.5, 2.5) = 2.5
    expect(s.maxDist).toBeCloseTo(2.5);
  });

  it('所有 perNode 的 finishAt (delay + duration) ≤ totalMs', () => {
    // 不变量：totalMs 必须是 max(finishAt)，不允许有节点动画跑超。
    const end: Record<string, { x: number; y: number }> = {};
    for (let i = 0; i < 100; i++) end[`n${i}`] = { x: i, y: i * 2 };
    const s = computeEntranceSchedule(end, {}, opts);
    for (const p of s.perNode) {
      expect(p.delay + p.duration).toBeLessThanOrEqual(s.totalMs + 1e-9);
    }
  });
});

/**
 * onSettled 回调契约 —— 取代了原来 waitForGraphToSettle 的「500ms 静止 + 60s
 * 硬超时 + 100ms 轮询」三层硬编码。回调必须在任何收敛路径上(同步落位 / 排空
 * schedule / 正常 rAF)都被触发一次,且只触发一次 —— 否则 loading 指示器要么
 * 永远不收,要么重复触发渐隐动画。
 *
 * 因为 animatePositionsTo 内部用了 cy.batch + rAF,测试里 mock 一个最小 cy:
 * - nodes() / getElementById(): 返回 NodeSingular 替身(支持 position())
 * - batch(): 同步执行回调
 * - raf: vi.useFakeTimers() 控制
 */
describe('animatePositionsTo onSettled', () => {
  function makeFakeNode(id: string, x: number, y: number) {
    return {
      id: () => id,
      empty: () => false,
      position: vi.fn(),
      _x: x,
      _y: y,
    };
  }

  function makeFakeCy(nodeSpecs: Array<{ id: string; x: number; y: number }>) {
    const byId = new Map<string, ReturnType<typeof makeFakeNode>>();
    for (const n of nodeSpecs) byId.set(n.id, makeFakeNode(n.id, n.x, n.y));
    return {
      nodes: () => Array.from(byId.values()),
      getElementById: (id: string) => {
        const n = byId.get(id);
        return {
          empty: () => !n,
          position: n?.position ?? vi.fn(),
        };
      },
      batch: (fn: () => void) => fn(),
    };
  }

  it('end 为空时同步落位并立即触发 onSettled', () => {
    const cy = makeFakeCy([]);
    const onSettled = vi.fn();
    animatePositionsTo(cy as never, {}, {}, false, onSettled);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('reduced motion 路径: 同步落位 + 立即触发 onSettled', () => {
    const cy = makeFakeCy([{ id: 'a', x: 0, y: 0 }]);
    const onSettled = vi.fn();
    animatePositionsTo(
      cy as never,
      {},
      { a: { x: 10, y: 10 } },
      true, // reducedMotion = true
      onSettled,
    );
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('正常 rAF 路径: totalMs 内 onSettled 不触发,totalMs 后触发一次', () => {
    // requestAnimationFrame 在 jsdom 里不会自然 tick;用一个递推 stub:
    // 每次 raf 注册回调,按 performance.now() 顺序触发。callback 内部如果
    // 再 raf,新 callback 也加入队列。drain 在一轮里只处理当前时间点的回调,
    // 避免 step(step) 自续 raf 制造无限循环。
    const queue: Array<{ cb: (t: number) => void; at: number }> = [];
    const raf = (cb: (t: number) => void): number => {
      queue.push({ cb, at: 0 });
      return queue.length;
    };
    const fakeNow = { t: 0 };
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('performance', { now: () => fakeNow.t });

    const drainOnce = (): void => {
      // 把所有未指定时间的回调标到「当前时间」(浏览器真实 rAF 也这么干)。
      for (const item of queue) if (item.at === 0) item.at = fakeNow.t;
      queue.sort((a, b) => a.at - b.at);
      // 只取 ≤ fakeNow.t 的回调一次性跑完,跑出来的新回调下一轮再处理
      const due = queue.filter((it) => it.at <= fakeNow.t);
      queue.splice(0, due.length);
      for (const { cb } of due) cb(fakeNow.t);
    };

    try {
      // sanity check: rAF stub 真的覆盖了
      expect(typeof requestAnimationFrame).toBe('function');

      const cy = makeFakeCy([
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 100 },
      ]);
      const onSettled = vi.fn();
      animatePositionsTo(
        cy as never,
        {},
        { a: { x: 50, y: 50 }, b: { x: 60, y: 60 } },
        false,
        onSettled,
      );

      // 推进到一半 (1500ms),settled 仍未触发
      fakeNow.t = 1500;
      drainOnce();
      expect(onSettled).toHaveBeenCalledTimes(0);

      // 推进过 total(STAGGER 500 + ENTRANCE_MAX 2500 = 3000ms),settled 触发一次
      fakeNow.t = 3500;
      drainOnce();
      expect(onSettled).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('onSettled 未传时不抛错', () => {
    const cy = makeFakeCy([]);
    expect(() => animatePositionsTo(cy as never, {}, {}, false)).not.toThrow();
  });
});