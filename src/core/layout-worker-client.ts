// src/core/layout-worker-client.ts
// 主线程侧封装：在 Worker 里跑 euler，拿到坐标后一次性回填到 cytoscape。
//
// 设计要点：
//   - **必须有兜底**。Worker 可能因任何原因失败（构造失败、超时、浏览器
//     不支持 module worker）。任一情况都要能退回同步布局，否则图永远不出。
//   - **回填是一次性的**，不是逐帧。这是本方案的全部价值：主线程在布局
//     期间完全空闲，拿到结果后写 1182 个 position 只需几毫秒。
//   - 保留原动画路径作为 fallback（`runLayoutInWorker` 返回 null 时调用方
//     应退回 `finishStreamingLayout` 的同步分支）。

import type cytoscape from 'cytoscape';
import type { LayoutWorkerRequest, LayoutWorkerResponse } from './layout-worker.js';

export interface WorkerLayoutResult {
  positions: Record<string, { x: number; y: number }>;
  elapsedMs: number;
}

/**
 * Worker 布局的总时长上限。
 *
 * ⚠️ **必须大于 euler 的 `maxSimulationTime`（config.ts 里是 20000）**，
 * 否则布局还没跑完就被客户端掐掉，`finish(null)` → 退回同步路径 →
 * 主线程冻结 20 秒。Worker 是 headless 的，同样的参数比主线程快得多
 * （实测 3.9s vs 20.9s），20s 的仿真预算通常几秒就跑完；但给足余量，
 * 慢设备上多花十几秒也远好过退回那条冻结路径。
 */
const WORKER_TIMEOUT_MS = 30000;

/**
 * 在 Worker 里算布局。
 *
 * @param onProgress 每次心跳回调（用于「正在计算 Xs」的提示）
 * @returns 成功返回坐标表；**任何**失败路径都返回 null，由调用方退回同步布局。
 *          永不 throw —— 让失败只表现为「退���」，不让它炸掉整个加载流程。
 */
export async function runLayoutInWorker(
  cy: cytoscape.Core,
  params: Record<string, unknown>,
  onProgress?: (elapsedMs: number) => void,
): Promise<WorkerLayoutResult | null> {
  if (typeof Worker === 'undefined') return null;

  let worker: Worker;
  try {
    worker = new Worker(new URL('./layout-worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    // 构造失败：环境不支持 module worker
    return null;
  }

  const nodes: LayoutWorkerRequest['nodes'] = [];
  const edges: LayoutWorkerRequest['edges'] = [];

  try {
    cy.nodes().forEach((n) => {
      if (n.hasClass('layer-parent')) return; // 装饰节点由 overlay 自管位置
      const p = n.position();
      nodes.push({ id: n.id(), x: p.x, y: p.y });
    });
    cy.edges().forEach((e) => {
      const s = e.source();
      const t = e.target();
      if (s.hasClass('layer-parent') || t.hasClass('layer-parent')) return;
      edges.push({ source: s.id(), target: t.id() });
    });
  } catch {
    worker.terminate();
    return null;
  }

  const request: LayoutWorkerRequest = { nodes, edges, params };

  return new Promise<WorkerLayoutResult | null>((resolve) => {
    let settled = false;

    const finish = (r: WorkerLayoutResult | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker.terminate();
      } catch {
        /* 已退出 */
      }
      resolve(r);
    };

    const timer = setTimeout(() => finish(null), WORKER_TIMEOUT_MS);

    worker.onmessage = (ev: MessageEvent<LayoutWorkerResponse>): void => {
      const msg = ev.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.elapsedMs);
        return;
      }
      if (msg.type === 'error') {
        console.warn('[layout-worker] 计算失败，退回同步布局：', msg.message);
        finish(null);
        return;
      }
      // done
      //
      // 入场动画的「起点」是 cy 在 postMessage 时的位置——也就是 halo
      // burst 留下的原点位置（halo 动画 `duration: 0` 又被 `cy.stop()`
      // 掐掉，全部堆在原点）。Worker 路径下没有「等待预动画」再改写过
      // 这个坐标；所以 halo 位置就是入口动画的入口。
      const startPositions: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) startPositions[n.id] = { x: n.x, y: n.y };

      animatePositionsTo(
        cy,
        startPositions,
        msg.positions,
        prefersReducedMotion(),
      );
      finish({ positions: msg.positions, elapsedMs: msg.elapsedMs });
    };

    worker.onerror = (e): void => {
      console.warn('[layout-worker] Worker 异常，退回同步布局：', e.message);
      finish(null);
    };

    worker.postMessage(request);
  });
}

/**
 * 入场动画每节点的时长区间（ms）。
 *
 * **不是**写死单一值——早期版本用 1200ms 写死，发现了两个问题：
 *
 *   1) 近核心节点行程只有 ~50，远外围节点行程 17000+，同样 1200ms 走完，
 *      平均速度差 350 倍——近节点「一闪而过」、远节点「飞过去像撞墙」。
 *
 *   2) 整体动画被 STAGGER_MS 拉满到 1700ms，行程短的小图反而用同样长
 *      的时间，体感拖。
 *
 * 现在改成 [MIN_MS, MAX_MS] 区间、按时长归一化按**终点**到质心的距离：
 *
 *   duration_i = MIN_MS + (dist_i / maxDist) * (MAX_MS - MIN_MS)
 *
 *   dist_i 小的核心节点 → MIN_MS（短程快闪），
 *   dist_i 大的外围节点 → MAX_MS（远程慢飞）。
 *
 * **平均视觉速度 ≈ 常数**：所有节点都是「以同样的速度往终点漂」，
 * 这正是「结构从中心向外结晶」的视觉前提。两端都是「试验」出来的，
 * 改之前先在主仓跑一次 `?layout=worker&motion=always` 看看速度感。
 */
const ENTRANCE_MIN_MS = 600;
const ENTRANCE_MAX_MS = 2500;
/**
 * 错峰延迟的上限（ms）。
 *
 * **不让所有节点同时动**是这段动画的全部意义：同时动的观感是"整张图
 * 平移了一下"，而错峰后是从中心向外一层层绽开，像拓扑结构自己长出来。
 * 延迟按节点到质心的距离归一化——离中心远的先走（它们移动最远，最需要
 * 早开始），近的稍后跟上。
 *
 * 总动画时长 = max(delay_i + duration_i)。因为 duration 也跟距离挂钩，
 * 这两条「距离归一化」是同向放大的：远节点早开始 + 飞得久，近节点
 * 晚开始 + 飞得快，**总时长被 maxDist 节点钉住**（≈ STAGGER_MS + MAX_MS）。
 */
const STAGGER_MS = 500;

/**
 * 把 Worker 算出的坐标一次性写回 cytoscape。
 *
 * 用 `batch()` 包起来：1182 次 position() 写入若逐个触发渲染/通知，
 * 会把主线程占掉一整帧；batch 让它们合并成一次。
 *
 * 这是 `animatePositionsTo` 的终点写法，也是 reduced-motion / 退化情形的
 * 落位路径。
 */
function applyPositions(
  cy: cytoscape.Core,
  positions: Record<string, { x: number; y: number }>,
): void {
  cy.batch(() => {
    for (const id in positions) {
      const n = cy.getElementById(id);
      if (n.empty()) continue;
      const p = positions[id];
      n.position({ x: p.x, y: p.y });
    }
  });
}

/**
 * 把节点从 start 位置动画式地移到 end 位置。
 *
 * ── 为什么自己写 rAF 而不用 `cy.animate()` ──────────────────────────────
 * `cy.animate()` 会给 1182 个节点各建一个 tween 对象并注册进 core 的动画
 * 队列，每帧还要做插值 + 通知，1182 个 tween 同时跑会把主线程占满——正是
 * layout Worker 当初要消除的那类开销。rAF + 一次 `cy.batch()` 自己算插值，
 * 每帧只有 1182 次乘法加一次批量写入，且**不进入 cytoscape 的动画队列**，
 * 因此 `cy.stop()` 不会误杀它，也不会与别的动画系统打架。
 *
 * ── 缓动 ────────────────────────────────────────────────────────────────
 * 用 easeOutCubic（`1-(1-t)³`）：起步快、收尾慢。力布局收敛的物理直觉就是
 * 越接近平衡越慢，easeOut 的曲线与之一致；easeIn 会看起来像"卡了一下才动"。
 *
 * ── reduced motion ──────────────────────────────────────────────────────
 * 系统开了「减弱动态效果」时直接瞬时落位。入场动画是纯装饰，跳过它不损失
 * 任何信息（最终位置一样），而对前庭敏感用户它是真实的负担。
 *
 * ⚠️ 但这个判断**曾经把动画整个吃掉**，而且极难察觉：系统偏好一开，
 * 表现就是「一帧散开」——和动画根本没接上完全一样。`?motion=always`
 * 可以强制播动画，用来区分「代码没跑到」和「被 reduced motion 短路了」
 * 这两种完全不同的故障。
 */
function animatePositionsTo(
  cy: cytoscape.Core,
  start: Record<string, { x: number; y: number }>,
  end: Record<string, { x: number; y: number }>,
  reducedMotion: boolean,
): void {
  const forced =
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('motion') === 'always';
  // 瞬时落位：reduced motion，或环境没有 rAF（SSR / 测试）
  if ((reducedMotion && !forced) || typeof requestAnimationFrame === 'undefined') {
    console.info('[entrance] 跳过入场动画（reduced motion / 无 rAF）');
    applyPositions(cy, end);
    return;
  }

  // 抽成纯函数（见下）后，这一节就只剩「把 schedule 的 id 解析成 cy node
  // 引用 + 跑 rAF 循环」两件事。算法本身在 computeEntranceSchedule 里
  // 100% 单测覆盖（tests/unit/core/layout-worker-client.test.ts）。
  const schedule = computeEntranceSchedule(end, start, {
    staggerMs: STAGGER_MS,
    minMs: ENTRANCE_MIN_MS,
    maxMs: ENTRANCE_MAX_MS,
  });
  if (schedule.perNode.length === 0) {
    applyPositions(cy, end);
    return;
  }

  const anim: {
    node: cytoscape.NodeSingular;
    from: { x: number; y: number };
    to: { x: number; y: number };
    delay: number;
    duration: number;
  }[] = [];
  for (const p of schedule.perNode) {
    const node = cy.getElementById(p.id);
    if (node.empty()) continue;
    anim.push({
      node,
      from: p.from,
      to: p.to,
      delay: p.delay,
      duration: p.duration,
    });
  }
  if (anim.length === 0) {
    applyPositions(cy, end);
    return;
  }

  const t0 = performance.now();
  const total = schedule.totalMs;
  console.info(
    `[entrance] 启动入场动画：${anim.length} 个节点，行程 max=${schedule.maxDist.toFixed(0)}，总时长 ${total}ms（核心 ${ENTRANCE_MIN_MS}ms / 外围 ${ENTRANCE_MAX_MS}ms，自适应）`,
  );

  const step = (now: number): void => {
    const elapsed = now - t0;
    if (elapsed >= total) {
      applyPositions(cy, end);
      return;
    }
    // 1 - (1-t)³：起步快、收尾慢
    cy.batch(() => {
      for (const a of anim) {
        const t = Math.max(0, Math.min(1, (elapsed - a.delay) / a.duration));
        if (t <= 0) {
          a.node.position(a.from);
          continue;
        }
        const k = 1 - (1 - t) * (1 - t) * (1 - t);
        a.node.position({
          x: a.from.x + (a.to.x - a.from.x) * k,
          y: a.from.y + (a.to.y - a.from.y) * k,
        });
      }
    });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * 入场动画调度：纯函数，无 cytoscape 依赖，可单测。
 *
 * 给每个节点算 `delay` + `duration`：
 *
 *   - delay：    dist/maxDist * staggerMs，远的先走
 *   - duration： minMs + (dist/maxDist) * (maxMs - minMs)，远的飞得久
 *
 * dist 用的是**终点**到质心的距离，不是起点。归一化基准用终点后，节点
 * 的「飞多快 / 多早动」完全由它在最终拓扑里的位置决定，跟起点无关——
 * 这是「错峰设计意图」与算法无关的接口契约。
 *
 * 退化情形：
 *
 *   - end 为空：返回空 schedule（调用方瞬时落位）
 *   - maxDist === 0（终点全在同一点 / 单节点）：同样 return 空 schedule，
 *     duration 退化为 minMs 也会失真，不如不播动画
 */
interface EntranceScheduleOptions {
  staggerMs: number;
  minMs: number;
  maxMs: number;
}
interface EntranceScheduleEntry {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
  duration: number;
}
interface EntranceSchedule {
  perNode: EntranceScheduleEntry[];
  totalMs: number;
  maxDist: number;
}
export function computeEntranceSchedule(
  end: Record<string, { x: number; y: number }>,
  start: Record<string, { x: number; y: number }>,
  opts: EntranceScheduleOptions,
): EntranceSchedule {
  let cx = 0;
  let cyy = 0;
  let n = 0;
  for (const id in end) {
    const e = end[id];
    cx += e.x;
    cyy += e.y;
    n++;
  }
  if (n === 0) return { perNode: [], totalMs: 0, maxDist: 0 };
  cx /= n;
  cyy /= n;

  const perNode: EntranceScheduleEntry[] = [];
  const dists: number[] = [];
  let maxDist = 0;
  for (const id in end) {
    const e = end[id];
    const dist = Math.hypot(e.x - cx, e.y - cyy);
    if (dist > maxDist) maxDist = dist;
    const from = start[id] ?? e;
    perNode.push({ id, from, to: e, delay: 0, duration: 0 });
    dists.push(dist);
  }
  if (maxDist === 0) return { perNode: [], totalMs: 0, maxDist: 0 };

  // 用 maxDist 归一化，单次循环同时算 delay 和 duration。
  // 早先版本里这两个值写在一起（一个 t = dist/maxDist），但这里保持
  // 两条独立公式，让 staggerMs / minMs / maxMs 三个常数互相独立——
  // 调参的时候不会互相牵连。
  let totalMs = 0;
  for (let i = 0; i < perNode.length; i++) {
    const t = dists[i] / maxDist;
    const p = perNode[i];
    p.delay = t * opts.staggerMs;
    p.duration = opts.minMs + t * (opts.maxMs - opts.minMs);
    const finishAt = p.delay + p.duration;
    if (finishAt > totalMs) totalMs = finishAt;
  }
  return { perNode, totalMs, maxDist };
}

/** 读系统的「减弱动态效果」偏好；读不到时按 false（正常动画）处理。 */
function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}
