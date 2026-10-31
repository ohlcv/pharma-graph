import { describe, it, expect } from 'vitest';
import {
  CHAN_PIVOT_ID,
  BI_VERTICES,
  PIVOT_BOXES,
} from '../../../src/core/spectacle/chan-fractal-pivot-overlay.js';

describe('chan-fractal-pivot-overlay / 缠论自同构几何不变量', () => {
  it('节点 id 固定为 chan-fractal-pivot', () => {
    expect(CHAN_PIVOT_ID).toBe('chan-fractal-pivot');
  });

  it('18 个分型极值点构成 17 段笔，且顶底严格交替（首点为底分型）', () => {
    expect(BI_VERTICES).toHaveLength(18);
    BI_VERTICES.forEach((v, i) => {
      expect(v.fractal).toBe(i % 2 === 0 ? 'bottom' : 'top');
    });
  });

  it('五类买卖点各出现一次，且锚点颜色均已给出', () => {
    const signals = BI_VERTICES.filter((v) => v.signal).map((v) => v.signal!);
    expect(signals.sort()).toEqual(['1B', '1S', '2B', '2S', '3B'].sort());
    for (const v of BI_VERTICES) {
      if (v.signal) expect(v.signalColor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('次级别中枢 A₁ 完整包含于本级别中枢 A，且两者 ZG < ZD', () => {
    const [sub, major] = PIVOT_BOXES;
    expect(sub.x1).toBeGreaterThanOrEqual(major.x1);
    expect(sub.x2).toBeLessThanOrEqual(major.x2);
    expect(sub.zg).toBeGreaterThanOrEqual(major.zg);
    expect(sub.zd).toBeLessThanOrEqual(major.zd);
    for (const box of PIVOT_BOXES) {
      expect(box.zg).toBeLessThan(box.zd);
      expect(box.gg).toBeLessThanOrEqual(box.zg);
      expect(box.dd).toBeGreaterThanOrEqual(box.zd);
    }
  });

  it('中枢 B 位于中枢 A 右侧且高于 A（canvas y 越小越靠上）', () => {
    const [, major, upper] = PIVOT_BOXES;
    expect(upper.x1).toBeGreaterThan(major.x2);
    expect(upper.zd).toBeLessThan(major.zg);
  });
});
