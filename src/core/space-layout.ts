// src/core/space-layout.ts
// 空间分岛——纯几何，不碰 cytoscape。
//
// 问题：三个空间共用同一张画布，而 euler 是**全图**力导——它不知道"空间"
// 这回事，只会把所有连通分量互相排斥着塞进同一团里。实测（2736 节点）：
// 药学宇宙的包围盒是 4479×4139，而四个装饰奇观落在 x∈[-1032, 2274]、
// y∈[-1339, 1076]——整个落在药学宇宙的包围盒内部。于是"全图"和"药学宇宙"
// 在屏幕上几乎没有区别，用户点"返回全图"会以为没生效。
//
// 这个模块不改任何内部结构，只给每个空间**整体平移**，让它们排成一行互不
// 重叠的岛。安全性来自图论本身：空间就是连通分量，分量之间一条边都没有，
// 平移不可能拉断关系，也不可能改变分量内部的相对布局。
//
// 派生自同一个前提（见 spaces.ts）：空间是算出来的，不是存出来的——所以
// 第四个体系出现时，这里零改动，它会自己获得一个岛。

export interface LayoutPoint {
  id: string;
  x: number;
  y: number;
}

export interface SpaceGeometry {
  id: string;
  points: readonly LayoutPoint[];
}

export interface SeparationOptions {
  /** 岛与岛之间的空隙（模型坐标）。缺省按最大岛尺寸的 35% 算，至少 600。 */
  gap?: number;
  /**
   * 锚定的空间 id：它**一个像素都不动**，其它岛排到它右边。
   *
   * 不锚定的话所有岛都从 x=0 重新排起——整张图等于整体平移了一次，镜头
   * 必须跟着飞才能跟上（真实反馈：初始化完成后被强制缩放/平移，"没有必要"）。
   * 锚定主宇宙后，爆炸结束时镜头看到的东西就是它该看到的东西，不用再动。
   */
  anchorId?: string;
}

interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
}

function bounds(points: readonly LayoutPoint[]): Bounds {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of points) {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  if (!Number.isFinite(x1)) return { x1: 0, y1: 0, x2: 0, y2: 0, w: 0, h: 0 };
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
}

/**
 * 计算每个空间里每个节点平移后的最终坐标。
 *
 * 排布规则：按传入顺序从左到右排成一行，每个岛的**左边缘**落在游标上，
 * 垂直方向各自居中于 y=0，相邻岛之间留 gap。传入顺序有意义（调用方按
 * 规模从大到小排），第一屏视线最先落到的就是主宇宙。
 *
 * 幂等：对结果再算一次，坐标不变（已在位时 dx=dy=0）。
 *
 * @param spaces 每个空间的节点与当前坐标
 * @returns nodeId → 最终坐标。只包含传入的节点，传送门之类由调用方自己排除。
 */
export function planSeparation(
  spaces: readonly SpaceGeometry[],
  options: SeparationOptions = {},
): Map<string, { x: number; y: number }> {
  const prepared = spaces
    .map((s) => {
      const points = s.points.map((p) => ({ ...p }));
      return { id: s.id, points, bb: bounds(points) };
    })
    .filter((s) => s.points.length > 0);

  const result = new Map<string, { x: number; y: number }>();
  if (prepared.length === 0) return result;

  let widest = 0;
  let tallest = 0;
  for (const s of prepared) {
    widest = Math.max(widest, s.bb.w);
    tallest = Math.max(tallest, s.bb.h);
  }
  const gap = options.gap ?? Math.max(600, Math.max(widest, tallest) * 0.35);

  const anchor = options.anchorId
    ? (prepared.find((s) => s.id === options.anchorId) ?? null)
    : null;
  // 锚定岛的垂直中心：其余岛以它为基准对齐，居中的"一行"仍然成立。
  const baseY = anchor ? (anchor.bb.y1 + anchor.bb.y2) / 2 : 0;
  let cursor = anchor ? anchor.bb.x2 + gap : 0;

  for (const s of prepared) {
    if (s === anchor) {
      // 锚定岛原样返回：调用方照写即可，坐标一个都不变。
      for (const p of s.points) result.set(p.id, { x: p.x, y: p.y });
      continue;
    }
    const dx = cursor - s.bb.x1;
    const dy = baseY - (s.bb.y1 + s.bb.y2) / 2;
    for (const p of s.points) {
      result.set(p.id, { x: p.x + dx, y: p.y + dy });
    }
    cursor += s.bb.w + gap;
  }
  return result;
}
