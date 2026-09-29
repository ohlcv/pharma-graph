// tests/unit/core/fractal-tree-geometry.test.ts
// 分形树几何内核的纯函数测试：段数、递推关系、包围盒、色彩标度、可复现性。
import { describe, it, expect } from 'vitest';
import {
  generateTree,
  barkColor,
  foliageColor,
  rgba,
  DEFAULT_TREE_PARAMS,
  type TreeParams,
} from '@/core/spectacle/fractal-tree-geometry';

/** 固定 seed 的伪随机（mulberry32），保证测试完全可复现。 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const p = (over: Partial<TreeParams> = {}): TreeParams => ({
  ...DEFAULT_TREE_PARAMS,
  rand: seeded(42),
  ...over,
});

describe('generateTree — 结构不变量', () => {
  it('段数是 2^(maxDepth+1) - 1（二叉递归）', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const g = generateTree(p({ maxDepth: d }));
      expect(g.branches.length).toBe(Math.pow(2, d + 1) - 1);
    }
  });

  it('每个 depth 层各 2^depth 段', () => {
    const g = generateTree(p({ maxDepth: 4 }));
    for (let d = 0; d <= 4; d++) {
      const atDepth = g.branches.filter((b) => b.depth === d);
      expect(atDepth.length).toBe(Math.pow(2, d));
    }
  });

  it('非末梢枝各产出 2 个子枝：depth<maxDepth 的段数 = 深度 maxDepth 段数的 1.5 倍（几何级数）', () => {
    // maxDepth=3：depth 0,1,2 非末梢共 1+2+4=7 段，depth=3 是末梢 8 段。
    // 非末梢 7 段分出 14 个子枝节点，但 depth=3 只有 8 个位置 —— 因为 depth=2
    // 的 4 段是 depth=3 的直接父节点（4×2=8），depth=0/1 的子枝落在中间深度。
    // 这里验证直接父子关系：depth d 的段数为 depth d+1 的一半。
    const g = generateTree(p({ maxDepth: 3 }));
    for (let d = 0; d < 3; d++) {
      const atD = g.branches.filter((b) => b.depth === d).length;
      const atDp1 = g.branches.filter((b) => b.depth === d + 1).length;
      expect(atDp1).toBe(atD * 2);
    }
  });

  it('每层长度严格按 lengthDecay 衰减', () => {
    const decay = 0.74;
    const g = generateTree(p({ maxDepth: 3, lengthDecay: decay }));
    const root = g.branches.find((b) => b.depth === 0)!;
    const d1 = g.branches.filter((b) => b.depth === 1);
    for (const b of d1) {
      expect(b.length).toBeCloseTo(root.length * decay, 10);
    }
  });

  it('粗细从根到梢单调递减，且末梢不为 0', () => {
    const g = generateTree(p({ maxDepth: 5 }));
    const byDepth = [0, 1, 2, 3, 4, 5].map((d) => {
      const at = g.branches.filter((b) => b.depth === d);
      return at.reduce((s, b) => s + b.width, 0) / at.length;
    });
    for (let i = 1; i < byDepth.length; i++) {
      expect(byDepth[i]).toBeLessThan(byDepth[i - 1]);
    }
    expect(byDepth[byDepth.length - 1]).toBeGreaterThan(0);
  });
});

describe('generateTree — 几何合理性', () => {
  it('枝干朝上生长（根在下方，梢在 y 更小的一侧）', () => {
    const g = generateTree(p({ maxDepth: 4 }));
    // 根 depth 0 的起点应为 (0,0)
    const root = g.branches.find((b) => b.depth === 0)!;
    expect(root.x).toBeCloseTo(0, 10);
    expect(root.y).toBeCloseTo(0, 10);
    // 根朝 -y（angle = -PI/2）
    expect(root.angle).toBeCloseTo(-Math.PI / 2, 10);
    // 所有末梢光点的 y 平均应远小于 0（在根的上方）
    const meanY = g.foliage.reduce((s, f) => s + f.y, 0) / g.foliage.length;
    expect(meanY).toBeLessThan(0);
  });

  it('所有坐标有限（无 NaN / Infinity）', () => {
    const g = generateTree(p({ maxDepth: 8 }));
    for (const b of g.branches) {
      expect(Number.isFinite(b.x)).toBe(true);
      expect(Number.isFinite(b.y)).toBe(true);
      expect(Number.isFinite(b.angle)).toBe(true);
      expect(Number.isFinite(b.length)).toBe(true);
      expect(Number.isFinite(b.width)).toBe(true);
    }
    for (const f of g.foliage) {
      expect(Number.isFinite(f.x)).toBe(true);
      expect(Number.isFinite(f.y)).toBe(true);
    }
  });

  it('包围盒包含全部枝段端点与光点（含粗细余量）', () => {
    const g = generateTree(p({ maxDepth: 5 }));
    const { x1, y1, x2, y2 } = g.bounds;
    for (const b of g.branches) {
      const ex = b.x + Math.cos(b.angle) * b.length;
      const ey = b.y + Math.sin(b.angle) * b.length;
      expect(b.x - b.width / 2).toBeGreaterThanOrEqual(x1 - 1e-6);
      expect(b.y - b.width / 2).toBeGreaterThanOrEqual(y1 - 1e-6);
      expect(ex + b.width / 2).toBeLessThanOrEqual(x2 + 1e-6);
      expect(ey + b.width / 2).toBeLessThanOrEqual(y2 + 1e-6);
    }
    for (const f of g.foliage) {
      expect(f.x - f.size).toBeGreaterThanOrEqual(x1 - 1e-6);
      expect(f.y - f.size).toBeGreaterThanOrEqual(y1 - 1e-6);
      expect(f.x + f.size).toBeLessThanOrEqual(x2 + 1e-6);
      expect(f.y + f.size).toBeLessThanOrEqual(y2 + 1e-6);
    }
  });

  it('包围盒宽高为正（树有实际体积，不是退化线段）', () => {
    const g = generateTree(p({ maxDepth: 5 }));
    expect(g.bounds.x2 - g.bounds.x1).toBeGreaterThan(1);
    expect(g.bounds.y2 - g.bounds.y1).toBeGreaterThan(1);
  });

  it('光点数量 = 末梢枝数量 = 2^maxDepth', () => {
    const g = generateTree(p({ maxDepth: 4 }));
    expect(g.foliage.length).toBe(Math.pow(2, 4));
    expect(g.foliage.every((f) => f.depth === 4)).toBe(true);
  });

  it('BFS 队列保证 depth 全局有序（绘制层可依赖它）', () => {
    // FIFO 队列按层展开：同层全部生成完才进入下一层，因此 branches
    // 数组天然按 depth 升序。绘制层靠倒序遍历即得「由粗到细」，
    // 不必每次帧重排（2047 段的 sort 在 30fps 下是白付的成本）。
    const g = generateTree(p({ maxDepth: 4 }));
    const depths = g.branches.map((b) => b.depth);
    expect(depths.every((d, i) => i === 0 || d >= depths[i - 1])).toBe(true);
    // width 是 depth 的单调函数：depth 升序 → width 非增。
    // 倒序遍历（由粗到细）时 width 应非减。
    const reversed = [...g.branches].reverse();
    expect(reversed.every((b, i) => i === 0 || b.width >= reversed[i - 1].width)).toBe(true);
    // 同层内 width 恒等（粗细只由 depth 决定，不受随机抖动影响）
    for (let d = 0; d <= 4; d++) {
      const ws = new Set(g.branches.filter((b) => b.depth === d).map((b) => b.width));
      expect(ws.size).toBe(1);
    }
  });

  it('FIFO 消除方向偏置：左右两侧枝的水平分布大致对称', () => {
    // LIFO + 固定 seed 时整棵树稳定偏向一侧（所有枝堆向一个方向）。
    // 用「左右两侧末端光点数量差」量化这个偏置。
    const g = generateTree({ ...DEFAULT_TREE_PARAMS, rand: seeded(0x5eed), maxDepth: 9 });
    const midX = (g.bounds.x1 + g.bounds.x2) / 2;
    const left = g.foliage.filter((f) => f.x < midX).length;
    const right = g.foliage.length - left;
    // 允许 20% 偏差（树本身不必严格对称），但不能是 LIFO 那种一边倒
    const skew = Math.abs(left - right) / g.foliage.length;
    expect(skew).toBeLessThan(0.2);
  });
});

describe('generateTree — 可复现性', () => {
  it('同 seed 两次生成完全一致', () => {
    const a = generateTree(p({ maxDepth: 5 }));
    const b = generateTree(p({ maxDepth: 5 }));
    expect(JSON.stringify(a.branches)).toBe(JSON.stringify(b.branches));
    expect(JSON.stringify(a.foliage)).toBe(JSON.stringify(b.foliage));
  });

  it('不同 seed 产生不同的树', () => {
    const a = generateTree({ ...DEFAULT_TREE_PARAMS, rand: seeded(1), maxDepth: 5 });
    const b = generateTree({ ...DEFAULT_TREE_PARAMS, rand: seeded(2), maxDepth: 5 });
    expect(JSON.stringify(a.branches)).not.toBe(JSON.stringify(b.branches));
  });

  it('jitter=0 且 gravity=0 时左右两枝角度严格对称', () => {
    const g = generateTree(p({ maxDepth: 3, jitter: 0, gravity: 0 }));
    // 深度 1 的两枝角度应严格对称
    const d1 = g.branches.filter((b) => b.depth === 1);
    const root = g.branches.find((b) => b.depth === 0)!;
    expect(d1[0].angle - root.angle).toBeCloseTo(-(d1[1].angle - root.angle), 10);
  });

  it('gravity>0 会把两侧枝都往下压（对称破缺，符合预期）', () => {
    const g = generateTree(p({ maxDepth: 2, jitter: 0, gravity: 0.3 }));
    const d1 = g.branches.filter((b) => b.depth === 1);
    const root = g.branches.find((b) => b.depth === 0)!;
    // 两枝不再等量反向：都朝下偏。总偏移 = 2 × gravity × level²，
    // depth 1 在 maxDepth=2 时 level=(0+1)/2=0.5 ⇒ 2×0.3×0.25=0.15
    expect(d1[0].angle + d1[1].angle - 2 * root.angle).toBeCloseTo(0.15, 10);
  });

  it('depthDecay 让分枝角随深度单调收缩（深层趋于沿父枝延伸）', () => {
    const g = generateTree(
      p({ maxDepth: 5, jitter: 0, gravity: 0, spreadAngle: 0.6, depthDecay: 0.8 }),
    );
    const d1 = g.branches.filter((b) => b.depth === 1);
    const d2 = g.branches.filter((b) => b.depth === 2);
    const root = g.branches.find((b) => b.depth === 0)!;
    // 深度 1 相对根张开 spreadAngle*0.8^0
    expect(Math.abs(d1[0].angle - root.angle)).toBeCloseTo(0.6, 10);
    // 深度 2 相对其父张开 spreadAngle*0.8^1，更小
    const parent = d1[0];
    expect(Math.abs(d2[0].angle - parent.angle)).toBeCloseTo(0.48, 10);
  });

  it('depthDecay=1 时角度不随深度变化（对照）', () => {
    const g = generateTree(
      p({ maxDepth: 3, jitter: 0, gravity: 0, spreadAngle: 0.5, depthDecay: 1 }),
    );
    const d1 = g.branches.filter((b) => b.depth === 1);
    const d2 = g.branches.filter((b) => b.depth === 2);
    const root = g.branches.find((b) => b.depth === 0)!;
    expect(Math.abs(d1[0].angle - root.angle)).toBeCloseTo(0.5, 10);
    expect(Math.abs(d2[0].angle - d1[0].angle)).toBeCloseTo(0.5, 10);
  });

  it('gravity 让梢部偏离竖直方向更多（枝条下垂）', () => {
    const g = generateTree(
      p({ maxDepth: 4, jitter: 0, gravity: 0.4, spreadAngle: 0.3, depthDecay: 0.9 }),
    );
    const UP = -Math.PI / 2;
    const tiltOf = (d: number) => {
      const at = g.branches.filter((b) => b.depth === d);
      // 与竖直的最大夹角
      return Math.max(...at.map((b) => Math.abs(b.angle - UP)));
    };
    // 逐层外张，梢部偏离竖直最多
    expect(tiltOf(4)).toBeGreaterThan(tiltOf(1));
  });
});

describe('色标度', () => {
  it('barkColor 在 t=0/0.5/1 命中三段控制点', () => {
    expect(barkColor(0)).toEqual([90, 68, 51]);
    expect(barkColor(1)).toEqual([232, 199, 154]);
    // 中点应介于两段之间
    const mid = barkColor(0.5);
    expect(mid).toEqual([154, 119, 72]);
  });

  it('barkColor 由暗到亮单调递增（每通道）', () => {
    // 色标度是「深度→可辨识度」的第二重编码，方向反了树就没层次
    for (let ch = 0; ch < 3; ch++) {
      let prev = -1;
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const c = barkColor(t)[ch];
        expect(c).toBeGreaterThanOrEqual(prev);
        prev = c;
      }
    }
  });

  it('foliageColor 从暖金过渡到冷青白', () => {
    expect(foliageColor(0)).toEqual([232, 196, 120]);
    expect(foliageColor(1)).toEqual([168, 226, 255]);
  });

  it('色彩分量恒在 0..255（越界输入被夹住）', () => {
    for (const t of [-1, -0.5, 0, 0.33, 0.77, 1, 1.5, 2]) {
      for (const c of [...barkColor(t), ...foliageColor(t)]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
        expect(Number.isInteger(c)).toBe(true);
      }
    }
  });

  it('rgba 拼出合法 CSS 颜色串', () => {
    expect(rgba([1, 2, 3], 0.5)).toBe('rgba(1,2,3,0.5)');
  });
});
