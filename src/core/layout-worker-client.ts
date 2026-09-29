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
import { halton } from './halton.js';

export interface WorkerLayoutResult {
  positions: Record<string, { x: number; y: number }>;
  elapsedMs: number;
  /**
   * Worker 计算**开始时**各节点的位置（halo 位置），未做任何修改。
   *
   * 入场动画的起点。必须在写回任何坐标之前抓取——一旦 `applyPositions`
   * 跑完，halo 位置就永久消失了，没有任何地方留有备份。
   *
   * ⚠️ 开了预动画（`startWaitingAnimation`）时，这**不再是** cy 里的真实
   * 位置，而是预动画的目标位置（星尘环）。runLayoutInWorker 在发起
   * postMessage 之后就不再动 cy，所以这里读到的值与预动画终点一致，
   * 两段动画天然衔接。
   */
  startPositions: Record<string, { x: number; y: number }>;
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
    // 预动画句柄。postMessage 之后才赋值，所以 finish 里要用可选链——
    // Worker 构造失败 / 抓取坐标抛错时它是 null，那条路径压根没启动过动画。
    let waiting: { targets: Record<string, { x: number; y: number }>; cancel: () => void } | null = null;

    const finish = (r: WorkerLayoutResult | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // 失败 / 超时路径上没有后续动画接手，预动画必须在这里收掉，否则
      // 它会永远自转下去，主线程每帧白写 1182 个 position 直到页面关闭。
      //
      // 成功路径在调用 finish 之前已经让位过了，重复调用无害：
      // `settled` 闸门在这里生效，而 cancel 内部有 `cancelled` 标记、
      // applyPositions 是同值写入。两条路径共用这一处，不必再加状态位。
      if (waiting) stopWaitingAnimation(cy, waiting.targets, waiting.cancel);
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
      // 起点在**此刻**抓取：`nodes` 是发请求时从 cy 读的 halo 位置，
      // 在 applyPositions 覆盖之前它们是唯一一份备份。之后 cytoscape 里
      // 就只剩最终坐标了。
      //
      // 开了预动画时用它当起点，halo 位置就此作废——Worker 的输入和
      // 预动画的起点本来就是同一份坐标，不损失信息。
      const startPositions: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) startPositions[n.id] = { x: n.x, y: n.y };

      // 先让位再放动画：预动画的 rAF 和入场动画都写 position，同一帧里
      // 后写的赢。顺序反了的话，入场动画的头一帧会被预动画的下一帧覆盖，
      // 表现为开头轻微抖动一下才真正动起来。
      if (waiting) stopWaitingAnimation(cy, waiting.targets, waiting.cancel);

      animatePositionsTo(
        cy,
        startPositions,
        msg.positions,
        prefersReducedMotion(),
      );
      finish({ positions: msg.positions, elapsedMs: msg.elapsedMs, startPositions });
    };

    worker.onerror = (e): void => {
      console.warn('[layout-worker] Worker 异常，退回同步布局：', e.message);
      finish(null);
    };

    worker.postMessage(request);

    // 预动画在 postMessage **之后**启动，而不是之前：必须先保证 Worker
    // 拿到了正确的输入坐标。反过来的话 Worker 会读到被预动画改写过的
    // 中间位置，euler 的起始点就错了。
    waiting = startWaitingAnimation(cy);
  });
}

/**
 * 入场动画时长（ms）。
 *
 * 1200ms 的依据：euler 同步路径的入场动画是 `maxSimulationTime` 20s 里
 * 逐帧收敛的，视觉上"从 halo 散开"的过程大约持续 1–2s。取 1200ms 既不
 * 拖沓（加载完成后的等待感），也够看清结构在成形。
 */
const ENTRANCE_ANIMATION_MS = 1200;
/**
 * 错峰延迟的上限（ms）。
 *
 * **不让所有节点同时动**是这段动画的全部意义：同时动的观感是"整张图
 * 平移了一下"，而错峰后是从中心向外一层层绽开，像拓扑结构自己长出来。
 * 延迟按节点到质心的距离归一化——离中心远的先走（它们移动最远，最需要
 * 早开始），近的稍后跟上。
 */
const STAGGER_MS = 500;

/**
 * 「等待预动画」的时长（ms）与半径。
 *
 * Worker 算布局约 4 秒（慢设备可能 10 秒+）。这段时间如果不处理，屏幕上
 * 就是 1182 个节点**完全重叠在原点**、静止不动的一坨——因为 halo burst
 * 的 `duration: 0` 位置动画在 `cy.stop()` 前没来得及应用（见 animatePositionsTo
 * 的注释）。观感是「加载卡住了」，而不是「正在计算」。
 *
 * 预动画把这段空窗填成：节点从原点**缓缓铺开成一片星尘**并持续轻微呼吸。
 * 4 秒后 Worker 回来，真正的入场动画（animatePositionsTo）从星尘位置
 * 接续炸开到最终结构——两段动画首尾相接，看不出接缝。
 *
 * 半径刻意取小（120–340）且远小于最终布局尺度：星尘是「待命的微缩宇宙」，
 * 不是最终结构的粗糙版本。反过来铺得太大，炸开时就没有收缩的空间了。
 */
const WAITING_RADIUS_MIN = 120;
const WAITING_RADIUS_MAX = 340;
/** 铺开到位的时长；比 Worker 计算短，早到就停在原地呼吸。 */
const WAITING_SPREAD_MS = 900;
/** 呼吸周期。约 2.4s 一次，幅度 6% —— 只为让画面「活着」，不抢注意力。 */
const WAITING_BREATH_PERIOD_MS = 2400;
const WAITING_BREATH_RATIO = 0.06;

/**
 * 启动等待预动画：从原点把节点铺成一片缓慢呼吸的星尘。
 *
 * ── 为什么在 core 而不是 ui ────────────────────────────────────────────────
 * 它必须和 Worker 的生命周期绑定：预动画起点是 Worker 的输入（原点），
 * 终点是入场动画的起点（星尘环）。这个衔接关系是本模块的内部知识，交给
 * 调用方拼装只会让两边约定漂移。所以由 runLayoutInWorker 内部启动。
 *
 * ── 为什么用 rAF + cy.batch 而不是 cy.animate ─────────────────────────────
 * 与 animatePositionsTo 同理：1182 个 tween 进 cytoscape 动画队列会占满
 * 主线程，而这台机器**已经被判定为低性能**。这里更不能加重负担。
 *
 * @returns 预动画句柄：`targets` 是终点坐标（入场动画的起点），
 *          `cancel` 用于掐断 rAF 循环。返回 null 表示预动画没启动
 *          （无 rAF / reduced motion / 没有可动的节点），此时调用方
 *          不做任何让位动作，入场动画会退回用 cy 里的实际位置。
 */
function startWaitingAnimation(
  cy: cytoscape.Core,
): { targets: Record<string, { x: number; y: number }>; cancel: () => void } | null {
  if (typeof requestAnimationFrame === 'undefined') return null;
  if (prefersReducedMotion()) return null;

  // 只取真实节点：layer-parent 装饰节点（太极图 / 四维空间 / 生命之树）
  // 各自有独立的 overlay 在管位置和 rAF，这里插手会和它们打架。
  const anim: { node: cytoscape.NodeSingular; x: number; y: number; phase: number }[] = [];
  const targets: Record<string, { x: number; y: number }> = {};
  let i = 0;
  cy.nodes().forEach((n) => {
    if (n.hasClass('layer-parent')) return;
    // Halton 低差异序列铺角度和半径，避免纯随机聚簇成几个斑点。
    const angle = halton(i, 2) * Math.PI * 2;
    const radius = WAITING_RADIUS_MIN + halton(i, 3) * (WAITING_RADIUS_MAX - WAITING_RADIUS_MIN);
    i++;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    targets[n.id()] = { x, y };
    anim.push({ node: n, x, y, phase: halton(i, 5) * Math.PI * 2 });
  });
  if (anim.length === 0) return null;

  const t0 = performance.now();
  console.info(`[entrance] 启动等待预动画：${anim.length} 个节点铺成星尘`);

  // 取消句柄。预动画是一个自续的 rAF 循环，Worker 一回来就必须能掐断它：
  // 它和紧随其后的入场动画都写 position，同时跑会表现为开头几帧抖动。
  let cancelled = false;
  let rafId = 0;

  const step = (now: number): void => {
    if (cancelled) return;
    const t = Math.min(1, (now - t0) / WAITING_SPREAD_MS);
    // easeOutCubic：起步快、收尾慢，和入场动画同一条曲线，两段才不像拼接的。
    const spread = 1 - (1 - t) * (1 - t) * (1 - t);
    // 铺完 900ms 之后进入呼吸，否则只播一次就定格成一张静态图。
    const settled = t >= 1;

    cy.batch(() => {
      for (const a of anim) {
        const ang = Math.atan2(a.y, a.x);
        const base = Math.hypot(a.x, a.y);
        // 呼吸相位按各节点自己错开，否则整片星尘会整齐地一起涨落，
        // 看起来像缩放而不像悬浮。
        const pulse = settled
          ? 1 + Math.cos(((now - t0) / WAITING_BREATH_PERIOD_MS) * 2 * Math.PI + a.phase) * WAITING_BREATH_RATIO
          : 1;
        const rad = base * spread * pulse;
        a.node.position({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad });
      }
    });
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);

  return {
    targets,
    cancel: (): void => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}

/**
 * 停止等待预动画，让位给入场动画。
 *
 * Worker 回来了就立刻收手：cancel 掐断 rAF，`applyPositions` 把节点落到
 * 星尘环的**裸**坐标。
 *
 * ⚠️ 落地的是 targets 而非「呼吸中的实际坐标」，两者差最多 6% 半径。
 * 这是一次 ≤6% 的瞬时位移，一帧内完成，人眼读作「稳了一下」而不是
 * 「跳了一下」；换来的是入场动画的起点完全确定（不依赖 cancel 那一刻
 * 呼吸走到哪个相位）。这个取舍是有意的，不要「优化」成去捕获当前帧坐标
 * —— 那样入场动画的起点就会随 Worker 返回时机抖动。
 */
function stopWaitingAnimation(
  cy: cytoscape.Core,
  targets: Record<string, { x: number; y: number }>,
  cancel: () => void,
): void {
  cancel();
  applyPositions(cy, targets);
}

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

  // 归一化基准用**终点**到质心的距离，不是起点。
  //
  // 起点在正常路径下恒为 (0,0)：halo burst 的位置动画是 `duration: 0`，
  // 紧跟着又被 finishStreamingLayout 里的 `cy.stop(undefined, true)` 掐掉，
  // 1182 个节点全部堆在原点重叠。**这正是"从中心散开"的起点形态**，
  // 不是退化情形。曾经的 `maxDist(起点) === 0 → 跳过动画` 分支把这个
  // 正常情况误判成退化，直接落位，于是表现为一帧散开。
  let cx = 0;
  let cyy = 0;
  let n = 0;
  for (const id in end) {
    const e = end[id];
    cx += e.x;
    cyy += e.y;
    n++;
  }
  if (n === 0) {
    applyPositions(cy, end);
    return;
  }
  cx /= n;
  cyy /= n;

  // 预计算每个节点的延迟与行程，避免每帧重复算
  const anim: {
    node: cytoscape.NodeSingular;
    from: { x: number; y: number };
    to: { x: number; y: number };
    delay: number;
    dist: number;
  }[] = [];
  let maxDist = 0;
  for (const id in end) {
    const s = start[id] ?? end[id];
    const node = cy.getElementById(id);
    if (node.empty()) continue;
    const e = end[id];
    // 按**终点**距离分层：靠近核心的节点先动，外围的稍后跟上，
    // 于是结构像是从中心向外一层层结晶，而不是整张图同时平移。
    const dist = Math.hypot(e.x - cx, e.y - cyy);
    if (dist > maxDist) maxDist = dist;
    anim.push({ node, from: s, to: e, delay: 0, dist });
  }
  if (anim.length === 0 || maxDist === 0) {
    // 终点也全同一点才是真的退化（空图 / 单节点），直接落位。
    applyPositions(cy, end);
    return;
  }
  for (const a of anim) {
    // dist / maxDist ∈ [0,1]：0 = 核心（先动），1 = 最外围（最后动）
    a.delay = (a.dist / maxDist) * STAGGER_MS;
  }

  const t0 = performance.now();
  const total = ENTRANCE_ANIMATION_MS + STAGGER_MS;
  console.info(
    `[entrance] 启动入场动画：${anim.length} 个节点，行程 max=${maxDist.toFixed(0)}，总时长 ${total}ms`,
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
        const t = Math.max(0, Math.min(1, (elapsed - a.delay) / ENTRANCE_ANIMATION_MS));
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
