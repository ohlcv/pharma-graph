import { describe, it, expect } from 'vitest';
import {
  planSeparation,
  type LayoutPoint,
  type SpaceGeometry,
} from '../../../src/core/space-layout.js';

function space(id: string, points: [string, number, number][]): SpaceGeometry {
  return { id, points: points.map(([pid, x, y]) => ({ id: pid, x, y })) };
}

function boundsOf(pts: LayoutPoint[]): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: Math.min(...pts.map((p) => p.x)),
    y1: Math.min(...pts.map((p) => p.y)),
    x2: Math.max(...pts.map((p) => p.x)),
    y2: Math.max(...pts.map((p) => p.y)),
  };
}

function applyPlan(spaces: SpaceGeometry[], plan: Map<string, { x: number; y: number }>) {
  return spaces.map((s) => ({
    id: s.id,
    points: s.points.map((p) => ({ id: p.id, ...(plan.get(p.id) ?? { x: p.x, y: p.y }) })),
  }));
}

/** 每个空间算包围盒，键是空间 id。 */
function boxes(placed: ReturnType<typeof applyPlan>) {
  const map = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();
  for (const s of placed) map.set(s.id, boundsOf(s.points));
  return map;
}

describe('space-layout / 空间分岛', () => {
  const overlapping: SpaceGeometry[] = [
    // 三个空间刻意叠在同一片区域——这正是真实图里的样子。
    space('pharma', [
      ['a1', -200, -200],
      ['a2', 200, 200],
    ]),
    space('neuro', [
      ['b1', -50, -40],
      ['b2', 60, 30],
    ]),
    space('misc', [
      ['c1', -100, -100],
      ['c2', 100, 100],
    ]),
  ];

  it('分岛后包围盒两两不重叠，且从左到右按传入顺序排列', () => {
    const plan = planSeparation(overlapping);
    const bb = boxes(applyPlan(overlapping, plan));
    const order = ['pharma', 'neuro', 'misc'];
    for (let i = 1; i < order.length; i++) {
      const prev = bb.get(order[i - 1])!;
      const cur = bb.get(order[i])!;
      expect(cur.x1).toBeGreaterThan(prev.x2);
    }
  });

  it('岛之间留有明确空隙（不是刚好贴着）', () => {
    const plan = planSeparation(overlapping, { gap: 800 });
    const bb = boxes(applyPlan(overlapping, plan));
    expect(bb.get('neuro')!.x1 - bb.get('pharma')!.x2).toBeCloseTo(800, 6);
    expect(bb.get('misc')!.x1 - bb.get('neuro')!.x2).toBeCloseTo(800, 6);
  });

  it('每个岛垂直居中于 y=0，横向尺寸原样保留', () => {
    const plan = planSeparation(overlapping);
    const placed = applyPlan(overlapping, plan);
    for (const s of placed) {
      const bb = boundsOf(s.points);
      expect((bb.y1 + bb.y2) / 2).toBeCloseTo(0, 6);
    }
    const before = boxes(overlapping.map((s) => ({ id: s.id, points: [...s.points] })));
    const after = boxes(placed);
    for (const id of ['pharma', 'neuro', 'misc']) {
      const b = before.get(id)!;
      const a = after.get(id)!;
      expect(a.x2 - a.x1).toBeCloseTo(b.x2 - b.x1, 6);
      expect(a.y2 - a.y1).toBeCloseTo(b.y2 - b.y1, 6);
    }
  });

  it('同一空间内部的相对位置完全不变（只整体平移）', () => {
    const plan = planSeparation(overlapping);
    const before = overlapping[0].points;
    const after = before.map((p) => plan.get(p.id)!);
    const d1 = { x: after[1].x - after[0].x, y: after[1].y - after[0].y };
    const d0 = { x: before[1].x - before[0].x, y: before[1].y - before[0].y };
    expect(d1.x).toBeCloseTo(d0.x, 6);
    expect(d1.y).toBeCloseTo(d0.y, 6);
  });

  it('幂等：对已分岛的结果再算一次，坐标不动', () => {
    const first = planSeparation(overlapping);
    const placed = applyPlan(overlapping, first);
    const second = planSeparation(placed, { gap: undefined });
    for (const s of placed) {
      for (const p of s.points) {
        const again = second.get(p.id)!;
        expect(again.x).toBeCloseTo(p.x, 6);
        expect(again.y).toBeCloseTo(p.y, 6);
      }
    }
  });

  it('单节点空间也能排（包围盒退化为点）', () => {
    const single: SpaceGeometry[] = [space('a', [['a1', 5, 5]]), space('b', [['b1', 5, 5]])];
    const plan = planSeparation(single, { gap: 100 });
    const a = plan.get('a1')!;
    const b = plan.get('b1')!;
    expect(b.x - a.x).toBeCloseTo(100, 6);
    expect(a.y).toBeCloseTo(0, 6);
  });

  it('anchorId 指定的岛一个像素都不动，其它岛排到它右边', () => {
    // 锚点刻意不在 y=0：其它岛要对齐的是**它的**中线，不是画布中线。
    const shifted: SpaceGeometry[] = [
      space('pharma', [
        ['a1', -500, 400],
        ['a2', 900, 1600],
      ]),
      space('neuro', [['b1', 0, 0]]),
      space('misc', [['c1', 0, 0]]),
    ];
    const plan = planSeparation(shifted, { anchorId: 'pharma', gap: 800 });

    // 锚点原地不动
    for (const p of shifted[0].points) {
      expect(plan.get(p.id)).toEqual({ x: p.x, y: p.y });
    }

    const bb = boxes(applyPlan(shifted, plan));
    const anchor = bb.get('pharma')!;
    // 其余岛从锚点右沿 + gap 起排，且与锚点同一条中线
    expect(bb.get('neuro')!.x1).toBeCloseTo(anchor.x2 + 800, 6);
    expect(bb.get('misc')!.x1 - bb.get('neuro')!.x2).toBeCloseTo(800, 6);
    const anchorCy = (anchor.y1 + anchor.y2) / 2;
    expect((bb.get('neuro')!.y1 + bb.get('neuro')!.y2) / 2).toBeCloseTo(anchorCy, 6);
    expect(anchorCy).toBeCloseTo(1000, 6);
  });

  it('不anchor 时整张图会整体平移（正是首屏不该发生的那件事）', () => {
    const shifted: SpaceGeometry[] = [space('pharma', [['a1', -500, 400], ['a2', 900, 1600]])];
    const free = planSeparation(shifted);
    const held = planSeparation(shifted, { anchorId: 'pharma' });
    // 无锚点：左沿被拉到 0、中线被拉到 0 —— 全图被搬走了一次
    expect(free.get('a1')!.x).toBeCloseTo(0, 6);
    expect(free.get('a1')!.y).toBeCloseTo(-600, 6);
    // 有锚点：原样
    expect(held.get('a1')).toEqual({ x: -500, y: 400 });
  });

  it('空输入不抛错', () => {
    expect(planSeparation([]).size).toBe(0);
    expect(planSeparation([{ id: 'x', points: [] }]).size).toBe(0);
  });
});
