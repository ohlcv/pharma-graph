// src/ui/force-drag.ts
// 拖动节点时保持一个力导向仿真运行（Obsidian / d3-force 拖拽的做法），
// 替代 neighbor-tug.ts 的"起点 + 35% 位移"刚性牵引。
//
// 手感来源：
//   - 被拖节点被固定在光标处（fx/fy），其余节点通过边弹簧被拉着走，
//     有滞后、过冲、沉降；
//   - 松手后被拖节点仍固定在落点，其余节点继续沉降到新的平衡位置，
//     然后仿真自然停止（不常驻）。
//
// 为什么不直接用 cytoscape 的 euler / cola 布局：
//   - euler 没有确认可用的"持续运行"模式；
//   - 布局扩展的 infinite 模式会常驻跑满 CPU，而这里只需要在
//     拖动 + 沉降期间运行。
//
// 与"默认 euler 布局"的兼容（避免一拖动整张图漂移）：
//   1. 每条边的弹簧静止长度 = 抓起时的当前边长 → 弹簧一开始就在平衡态；
//   2. 斥力很弱且有截断距离，只做局部推开；
//   3. 离被拖节点越远，回到抓起时位置的"锚定力"越强 → 远处节点几乎不动。
//
// 对外接口与 neighbor-tug.ts 同名，graph-events.ts 只需换 import：
//   onDragStart(grabbed) / onDrag() / onDragEnd() / cancel() / isActive()
//
// 依赖：npm i d3-force && npm i -D @types/d3-force

import type cytoscape from 'cytoscape';
import {
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { CLASSES } from '../core/renderer.js';

// ── 可调参数（先按这个顺序调：DRAG_ALPHA → VELOCITY_DECAY → anchorStrength） ──

/** 只把距被拖节点不超过这么多跳的节点放进仿真；更远的完全不动。 */
const MAX_HOPS = 6;
/** 拖动期间仿真的目标热度。越大越"活"，也越容易带动远处。d3 官方示例用 0.3。 */
const DRAG_ALPHA = 0.25;
/** 低于此热度仿真停止。 */
const ALPHA_MIN = 0.02;
/** 松手后的降温速度。越大沉降越快。0.04 ≈ 松手后约 1 秒停。 */
const ALPHA_DECAY = 0.04;
/** 速度衰减（阻尼）。越小越"晃"，越大越"粘"。 */
const VELOCITY_DECAY = 0.45;
/** 节点间斥力（负数 = 排斥）。设为 0 可关闭；漂移严重时先调它。 */
const CHARGE = -25;
/** 斥力作用的最大距离（图坐标单位），同时限制计算量。 */
const CHARGE_MAX_DIST = 200;
/** 弹簧静止长度下限，避免两个节点重叠时长度为 0。 */
const MIN_REST = 20;
/** 位置变化小于此值就不写回 cytoscape，省掉远处几乎不动的节点。 */
const WRITE_EPS = 0.05;
/** 拖着不动超过这么久，就让仿真降温休眠；再动一下会立刻唤醒。 */
const IDLE_COOL_MS = 400;

/** 按跳数给"回到抓起位置"的锚定力：近处自由，远处几乎冻结。 */
function anchorStrength(hop: number): number {
  if (hop <= 1) return 0;
  if (hop === 2) return 0.02;
  if (hop === 3) return 0.06;
  if (hop === 4) return 0.15;
  return 0.35;
}

// ── 类型 ────────────────────────────────────────────────────────────────────

interface SimNode extends SimulationNodeDatum {
  id: string;
  ref: cytoscape.NodeSingular;
  /** 抓起时的位置（锚定力的目标） */
  ox: number;
  oy: number;
  /** 距被拖节点的跳数（0 = 被拖节点本身） */
  hop: number;
  /** 被拖 / 被锁定的节点：位置由 cytoscape 决定，仿真不写回 */
  pinned: boolean;
  /** 上一次写回 cytoscape 的位置 */
  lastX: number;
  lastY: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  rest: number;
}

interface Session {
  cy: cytoscape.Core;
  sim: Simulation<SimNode, SimLink>;
  nodes: SimNode[];
  pinned: SimNode[];
  released: boolean;
  cooling: boolean;
  lastDragAt: number;
}

// ── 状态 ────────────────────────────────────────────────────────────────────

/** grab 已发生但还没真正开始拖动。单击也会触发 grab，所以仿真延迟到第一次 drag 才建。 */
let pending: cytoscape.NodeCollection | null = null;
let session: Session | null = null;

// ── 对外接口 ────────────────────────────────────────────────────────────────

export function onDragStart(grabbed: cytoscape.NodeCollection): void {
  cancel();
  pending = grabbed;
}

export function onDrag(): void {
  if (!session) {
    if (!pending) return;
    session = buildSession(pending);
    pending = null;
    if (!session) return;
  }
  const s = session;
  s.lastDragAt = performance.now();

  // 被拖节点由 cytoscape 自己移动；把它的当前位置同步成仿真里的固定点。
  for (const p of s.pinned) {
    const pos = p.ref.position();
    p.fx = pos.x;
    p.fy = pos.y;
  }

  if (s.cooling) {
    s.cooling = false;
    s.sim.alphaTarget(DRAG_ALPHA).alpha(Math.max(s.sim.alpha(), DRAG_ALPHA)).restart();
  }
}

export function onDragEnd(): void {
  pending = null;
  const s = session;
  if (!s) return;

  // 最后同步一次落点。被拖节点保持固定在落点，直到仿真结束。
  for (const p of s.pinned) {
    const pos = p.ref.position();
    p.fx = pos.x;
    p.fy = pos.y;
  }
  s.released = true;

  // 已经休眠（降温到低于阈值）：不需要再沉降。
  if (s.sim.alpha() < ALPHA_MIN) {
    s.sim.stop();
    session = null;
    return;
  }
  s.cooling = true;
  s.sim.alphaTarget(0).restart();
}

/** 硬取消：切布局、开始漫游等场景。不还原位置，节点停在当前位置。 */
export function cancel(): void {
  pending = null;
  if (session) {
    session.sim.stop();
    session = null;
  }
}

export function isActive(): boolean {
  return session !== null;
}

// ── 内部实现 ────────────────────────────────────────────────────────────────

function buildSession(grabbed: cytoscape.NodeCollection): Session | null {
  const cy = grabbed.cy();
  const roots = grabbed.filter((n) => !n.hasClass(CLASSES.LAYER_PARENT));
  if (roots.empty()) return null;

  // 1) 邻接表：一次遍历所有边。
  const adj = new Map<string, string[]>();
  const addAdj = (a: string, b: string): void => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  cy.edges().forEach((e) => {
    const s = e.data('source') as string;
    const t = e.data('target') as string;
    if (s === t) return;
    addAdj(s, t);
    addAdj(t, s);
  });

  // 2) 从所有被拖节点出发做多源 BFS，得到每个节点的跳数（超过 MAX_HOPS 的不进仿真）。
  const hops = new Map<string, number>();
  const queue: string[] = [];
  roots.forEach((n) => {
    hops.set(n.id(), 0);
    queue.push(n.id());
  });
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi];
    const h = hops.get(id) ?? 0;
    if (h >= MAX_HOPS) continue;
    for (const nb of adj.get(id) ?? []) {
      if (!hops.has(nb)) {
        hops.set(nb, h + 1);
        queue.push(nb);
      }
    }
  }

  // 3) 仿真节点。
  const nodes: SimNode[] = [];
  const byId = new Map<string, SimNode>();
  cy.nodes().forEach((n) => {
    const hop = hops.get(n.id());
    if (hop === undefined || n.hasClass(CLASSES.LAYER_PARENT)) return;
    const p = n.position();
    const pinned = hop === 0 || n.locked();
    const sn: SimNode = {
      id: n.id(),
      ref: n,
      x: p.x,
      y: p.y,
      ox: p.x,
      oy: p.y,
      hop,
      pinned,
      lastX: p.x,
      lastY: p.y,
    };
    if (pinned) {
      sn.fx = p.x;
      sn.fy = p.y;
    }
    nodes.push(sn);
    byId.set(sn.id, sn);
  });
  const pinned = nodes.filter((n) => n.pinned);
  if (pinned.length === 0 || pinned.length === nodes.length) return null; // 没有可动的节点

  // 4) 边 → 弹簧，静止长度取当前边长（起始即平衡态，避免整图漂移）。
  const links: SimLink[] = [];
  cy.edges().forEach((e) => {
    const s = byId.get(e.data('source') as string);
    const t = byId.get(e.data('target') as string);
    if (!s || !t || s === t) return;
    links.push({
      source: s.id,
      target: t.id,
      rest: Math.max(MIN_REST, Math.hypot(s.ox - t.ox, s.oy - t.oy)),
    });
  });

  // 5) 仿真。先 stop()，等 session 建好再 restart()，避免 tick 抢在赋值前触发。
  const sim = forceSimulation<SimNode>(nodes)
    .stop()
    .alpha(DRAG_ALPHA)
    .alphaTarget(DRAG_ALPHA)
    .alphaMin(ALPHA_MIN)
    .alphaDecay(ALPHA_DECAY)
    .velocityDecay(VELOCITY_DECAY)
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((l) => l.rest),
    )
    .force('charge', forceManyBody<SimNode>().strength(CHARGE).distanceMax(CHARGE_MAX_DIST).theta(0.9))
    .force('ax', forceX<SimNode>((d) => d.ox).strength((d) => anchorStrength(d.hop)))
    .force('ay', forceY<SimNode>((d) => d.oy).strength((d) => anchorStrength(d.hop))) as Simulation<
    SimNode,
    SimLink
  >;

  const s: Session = {
    cy,
    sim,
    nodes,
    pinned,
    released: false,
    cooling: false,
    lastDragAt: performance.now(),
  };

  sim.on('tick', () => flush(s));
  sim.on('end', () => {
    // 松手后沉降结束 → 丢弃会话（同时解除落点的固定）。
    // 拖动中途因"拖着不动"而休眠不算结束，等下一次 drag 唤醒。
    if (s.released && session === s) session = null;
  });
  sim.restart();
  return s;
}

/** 每个 tick：把仿真位置批量写回 cytoscape。 */
function flush(s: Session): void {
  if (s.cy.destroyed()) {
    s.sim.stop();
    if (session === s) session = null;
    return;
  }

  // 拖着不动就降温休眠，不空转。
  if (!s.released && !s.cooling && performance.now() - s.lastDragAt > IDLE_COOL_MS) {
    s.cooling = true;
    s.sim.alphaTarget(0);
  }

  s.cy.batch(() => {
    for (const n of s.nodes) {
      if (n.pinned) continue;
      const x = n.x ?? n.ox;
      const y = n.y ?? n.oy;
      if (Math.abs(x - n.lastX) < WRITE_EPS && Math.abs(y - n.lastY) < WRITE_EPS) continue;
      n.lastX = x;
      n.lastY = y;
      n.ref.position({ x, y });
    }
  });
}
