import { describe, it, expect } from 'vitest';
import { halton } from '@/core/halton';

/**
 * halton 是预动画的铺点函数，性质错了会直接变成肉眼可见的观感问题：
 * 分布不均 → 星尘聚成几个斑点而不是均匀一片；越界 → 节点飞出视口。
 */
describe('halton', () => {
  it('返回 [0, 1) 区间内的值', () => {
    for (let i = 1; i <= 500; i++) {
      for (const base of [2, 3, 5]) {
        const v = halton(i, base);
        expect(v).toBeGreaterThanOrEqual(0);
        // 上界必须开：取到 1 会让 cos/sin 落在同一角度上，产生重合点
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('index 为 0 时返回 0', () => {
    expect(halton(0, 2)).toBe(0);
  });

  it('已知取值符合 Radix-Rho 公式', () => {
    // 进制 2：0, 1/2, 1/4, 3/4, 1/8, 5/8 …
    expect(halton(1, 2)).toBeCloseTo(0.5, 10);
    expect(halton(2, 2)).toBeCloseTo(0.25, 10);
    expect(halton(3, 2)).toBeCloseTo(0.75, 10);
    // 进制 3：0, 1/3, 2/3, 1/9, 4/9 …
    expect(halton(1, 3)).toBeCloseTo(1 / 3, 10);
    expect(halton(2, 3)).toBeCloseTo(2 / 3, 10);
  });

  it('不同进制的序列不相关（同一 index 值不同）', () => {
    // 预动画用 base2 铺角度、base3 铺半径。若两序列雷同，半径就成了
    // 角度的函数，节点会排成一条螺旋线而不是一片星尘。
    const i = 7;
    expect(halton(i, 2)).not.toBeCloseTo(halton(i, 3), 3);
  });

  it('覆盖率优于纯随机：桶分布均匀', () => {
    // 取 10 个等宽桶，统计 2000 个样本的落桶次数。
    // 纯随机在 n=2000 时最坏桶与期望（200）可能差 ±100 以上；
    // Halton 的理论偏差是 O(log n)，这里给 60 的余量足够宽松，
    // 足以抓住「序列退化成均匀分布」这类真实回归。
    const buckets = new Array(10).fill(0);
    for (let i = 1; i <= 2000; i++) {
      buckets[Math.floor(halton(i, 2) * 10)]++;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(200 - 60);
      expect(count).toBeLessThan(200 + 60);
    }
  });
});
