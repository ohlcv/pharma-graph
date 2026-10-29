import { describe, it, expect } from 'vitest';
import {
  pickSpectacleParam,
  spectacleVisualRadius,
  type SpectacleShape,
} from '../../../src/core/spectacle/spectacle-size.js';

/**
 * 这一组数字是**视觉契约**，不是实现细节：五个奇观在屏幕上看起来一样大。
 *
 * 数值 = 统一视觉半径 V ÷ 该形状的绘制外沿倍数。V 在图幅够大时夹到上限 300。
 * 谁改了 DRAWN_EXTENT 或 clamp，这里就该红——因为那意味着某个奇观又比同伴
 * 大一圈或小一圈了（这正是本次修复要解决的问题）。
 */
const VISUAL_MAX = 300;
const VISUAL_MIN = 200;

const SHAPES: { shape: SpectacleShape; expected: number }[] = [
  { shape: 'emblem', expected: VISUAL_MAX / 1.15 }, // ≈ 260.87
  { shape: 'e8', expected: VISUAL_MAX / 1.1 }, // ≈ 272.73
  { shape: 'tesseract', expected: VISUAL_MAX / 1.3 }, // ≈ 230.77
  { shape: 'portal', expected: VISUAL_MAX / 1.25 }, // 240
  { shape: 'tree', expected: VISUAL_MAX / 0.5 }, // 600（树高，外沿是 H/2）
  { shape: 'jade-capital', expected: VISUAL_MAX / 1.15 }, // ≈ 260.87
];

describe('spectacle-size / 统一视觉半径', () => {
  it('图幅足够大时，五种形状的参数都收敛到同一个视觉半径', () => {
    for (const { shape, expected } of SHAPES) {
      expect(pickSpectacleParam(1e6, shape)).toBeCloseTo(expected, 6);
    }
  });

  it('图幅足够小时夹在下限，比例依然成立', () => {
    expect(spectacleVisualRadius(1)).toBeCloseTo(VISUAL_MIN, 9);
    for (const { shape } of SHAPES) {
      const param = pickSpectacleParam(1, shape);
      expect(param).toBeGreaterThan(0);
    }
    // 以 emblem 为基准：其参数就是下限半径 ÷ 1.15
    expect(pickSpectacleParam(1, 'emblem')).toBeCloseTo(VISUAL_MIN / 1.15, 9);
  });

  it('视觉半径随图幅单调不减，且有上界', () => {
    const small = spectacleVisualRadius(500);
    const mid = spectacleVisualRadius(3000);
    const huge = spectacleVisualRadius(1e9);
    expect(mid).toBeGreaterThanOrEqual(small);
    expect(huge).toBeGreaterThanOrEqual(mid);
    expect(huge).toBeCloseTo(VISUAL_MAX, 9);
  });

  it('tree 的参数是高度，恒等于其余形状视觉直径', () => {
    const spread = 1e5;
    const visual = spectacleVisualRadius(spread);
    expect(pickSpectacleParam(spread, 'tree')).toBeCloseTo(visual * 2, 9);
  });
});
