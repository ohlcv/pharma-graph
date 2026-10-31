import { describe, it, expect } from 'vitest';
import {
  INDRA_NET_ID,
  MANDELBROT_BULBS,
  evaluateMandelbrotPoint,
  computeCriticalOrbit,
  complexToNorm,
} from '../../../src/core/spectacle/indra-net-overlay.js';

describe('indra-net-overlay / 曼德勃罗分形与因陀罗宝珠网数学不变量', () => {
  it('节点 id 固定为 indra-net', () => {
    expect(INDRA_NET_ID).toBe('indra-net');
  });

  it('主心形中心 (0,0)、二周期主宝珠 (-1,0) 与针尖婴儿集 (-1.754878,0) 均属于收敛集内部', () => {
    for (const bulb of MANDELBROT_BULBS) {
      const sample = evaluateMandelbrotPoint(bulb.re, bulb.im, 120);
      expect(sample.escaped).toBe(false);
      // 周期芽苞中心是超吸引周期点，轨道陷阱最小距离非常接近 0
      expect(sample.minOrbitTrap).toBeLessThan(0.25);
    }
  });

  it('外部逃逸点 (1.0, 1.0) 能正确计算平滑迭代势与正值 DEM 边界距离', () => {
    const sample = evaluateMandelbrotPoint(1.0, 1.0, 120);
    expect(sample.escaped).toBe(true);
    expect(sample.iterations).toBeLessThan(20);
    expect(sample.smoothIter).toBeGreaterThan(0);
    expect(sample.distance).toBeGreaterThan(0);
  });

  it('临界轨道计算在二周期主宝珠中心 (-1, 0) 精确呈现 0 -> -1 -> 0 -> -1 二周期振荡', () => {
    const orbit = computeCriticalOrbit(-1.0, 0.0, 6);
    expect(orbit).toHaveLength(7);
    expect(orbit[0].re).toBeCloseTo(0, 9);
    expect(orbit[1].re).toBeCloseTo(-1, 9);
    expect(orbit[2].re).toBeCloseTo(0, 9);
    expect(orbit[3].re).toBeCloseTo(-1, 9);
  });

  it('复平面视窗归一化将主要周期芽苞全部映射在单位圆盘 [-1, 1] 内', () => {
    for (const bulb of MANDELBROT_BULBS) {
      const { nx, ny } = complexToNorm(bulb.re, bulb.im);
      expect(Math.hypot(nx, ny)).toBeLessThan(1.0);
    }
  });
});
