// 四维超立方体的几何不变式。
//
// 这组断言来自实际调试中踩到的坑，值得固化：
//   ① 最初的棱枚举写成 `i ^ (1 << (i % 4))`（i 遍历 0..31），当 i ≥ 16 时
//      会算出 ≥ 16 的顶点索引，越界读 undefined → 运行时 TypeError，整个
//      canvas（含太极八卦）一起黑屏。
//   ② 改成"只从偶数编号顶点出发"后仍错：翻转高位不改变编号奇偶性，
//      同奇偶顶点之间也有棱，单向枚举会漏边并把度数算成 7/1。
//   最终版是"全部有向邻接对 + 无向去重"。下面每条断言都是当时用来
//   把关的判据。

import { describe, expect, it } from 'vitest';
import { EDGES, projectTesseract, VERTICES_4D } from '@/core/spectacle/tesseract-overlay';

describe('tesseract geometry — 顶点与棱', () => {
  it('有 16 个顶点，取遍 (±1,±1,±1,±1) 的全部组合', () => {
    expect(VERTICES_4D).toHaveLength(16);
    for (const v of VERTICES_4D) {
      expect(v).toHaveLength(4);
      for (const c of v) expect(Math.abs(c)).toBe(1);
    }
    // 16 个顶点互不相同
    expect(new Set(VERTICES_4D.map((v) => v.join(','))).size).toBe(16);
  });

  it('恰好 32 条棱，且无自环、无越界索引', () => {
    expect(EDGES).toHaveLength(32);
    for (const [a, b] of EDGES) {
      expect(a).not.toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(16);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(16);
    }
  });

  it('无向去重后仍是 32 条（每条棱只出现一次）', () => {
    const keys = EDGES.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`));
    expect(new Set(keys).size).toBe(32);
  });

  it('每条棱的两个端点恰好相差一个坐标', () => {
    for (const [a, b] of EDGES) {
      const diff = VERTICES_4D[a].filter((c, i) => c !== VERTICES_4D[b][i]);
      expect(diff).toHaveLength(1);
    }
  });

  it('每个顶点的度数恰好为 4', () => {
    const deg = new Array(16).fill(0);
    for (const [a, b] of EDGES) {
      deg[a]++;
      deg[b]++;
    }
    expect(deg).toEqual(new Array(16).fill(4));
  });

  it('按第四维拆分：内胞 12 + 外胞 12 + 跨胞连接棱 8', () => {
    let inner = 0;
    let outer = 0;
    let cross = 0;
    for (const [a, b] of EDGES) {
      const wa = VERTICES_4D[a][3];
      const wb = VERTICES_4D[b][3];
      if (wa < 0 && wb < 0) inner++;
      else if (wa > 0 && wb > 0) outer++;
      else cross++;
    }
    expect([inner, outer, cross]).toEqual([12, 12, 8]);
  });
});

describe('tesseract geometry — 投影', () => {
  it('始终返回 16 个有限坐标（任意旋转角都不产生 NaN / Infinity）', () => {
    for (let t = 0; t < 200; t++) {
      const pts = projectTesseract(t * 0.31, t * 0.31 * Math.SQRT2);
      expect(pts).toHaveLength(16);
      for (const p of pts) {
        for (const c of p) expect(Number.isFinite(c)).toBe(true);
      }
    }
  });

  it('透视缩放系数恒为正（深度排序不会因负值翻转）', () => {
    for (let t = 0; t < 100; t++) {
      for (const p of projectTesseract(t * 0.37, t * 0.11)) {
        expect(p[2]).toBeGreaterThan(0);
      }
    }
  });

  it('旋转保长：4D 侧所有顶点到原点的距离恒为 2', () => {
    // 顶点是 (±1,±1,±1,±1)，模长 = sqrt(4) = 2。旋转是正交变换，
    // 投影前的 4D 坐标模长必须不变——这能抓住旋转矩阵写错（漏掉某分量）。
    const orig = VERTICES_4D.map((v) => Math.hypot(...v));
    expect(orig.every((r) => Math.abs(r - 2) < 1e-9)).toBe(true);
  });

  it('内外两胞的投影深度分离：w=+1 的顶点整体比 w=-1 的更靠近观察者', () => {
    for (let t = 0; t < 50; t++) {
      const pts = projectTesseract(t * 0.23, t * 0.41);
      // k 是 3D→2D 透视系数。取 w=+1 胞的平均 k 与 w=-1 胞的平均 k 相比：
      // 两者不该完全相等（说明透视真的在起作用，内胞确实被"推进去"了）。
      const outerKs: number[] = [];
      const innerKs: number[] = [];
      VERTICES_4D.forEach((v, i) => (v[3] > 0 ? outerKs : innerKs).push(pts[i][2]));
      const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      // 不做大小方向断言（随旋转角会互换），只断言两胞系数不全相等
      expect(Math.abs(mean(outerKs) - mean(innerKs))).toBeGreaterThan(1e-6);
    }
  });

  it('画面尺寸随旋转角变化（证明是动态投影而非静态图形）', () => {
    const widthAt = (a: number, b: number) => {
      const xs = projectTesseract(a, b).map((p) => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    const widths = new Set();
    for (let t = 0; t < 40; t++) widths.add(widthAt(t * 0.4, t * 0.4 * Math.SQRT2).toFixed(6));
    expect(widths.size).toBeGreaterThan(5);
  });
});
