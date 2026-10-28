// computeSpaces: pure partition of a graph into portal-traversable spaces.
// Fixtures mirror graph-data.json's shape (nodes with id/label, edges with
// source/target) so the contract stays honest.

import { describe, it, expect } from 'vitest';
import { computeSpaces, computeFitTarget, MISC_SPACE_ID, MISC_SPACE_LABEL } from '@/core/spaces';

const ROOTS = new Set(['root-a', 'root-b']);

function graph() {
  const nodes = [
    { id: 'root-a', label: '药学宇宙' },
    { id: 'n1', label: '第一章' },
    { id: 'n2', label: '第二章' },
    { id: 'root-b', label: '生存策略宇宙' },
    { id: 'm1', label: '八字命理' },
    { id: 'decor-1', label: '太极八卦' },
    { id: 'decor-2', label: 'E8 根系' },
    { id: 'portal-gate', label: '传送门' },
  ];
  const edges = [
    { source: 'n1', target: 'root-a' },
    { source: 'n2', target: 'root-a' },
    { source: 'm1', target: 'root-b' },
    // decor-1 / decor-2 / portal-gate have no edges at all.
  ];
  return { nodes, edges };
}

describe('computeSpaces', () => {
  it('splits the graph into one space per universe root', () => {
    const spaces = computeSpaces(graph().nodes, graph().edges, ROOTS);
    const ids = spaces.map((s) => s.id);
    expect(ids).toContain('root-a');
    expect(ids).toContain('root-b');
    const a = spaces.find((s) => s.id === 'root-a')!;
    expect([...a.nodeIds].sort()).toEqual(['n1', 'n2', 'root-a']);
    expect(a.label).toBe('药学宇宙');
    expect(a.anchorId).toBe('root-a');
  });

  it('collapses all rootless components into one misc space (decorations + portal)', () => {
    const spaces = computeSpaces(graph().nodes, graph().edges, ROOTS);
    const misc = spaces.find((s) => s.id === MISC_SPACE_ID);
    expect(misc).toBeDefined();
    expect(misc!.label).toBe(MISC_SPACE_LABEL);
    expect([...misc!.nodeIds].sort()).toEqual(['decor-1', 'decor-2', 'portal-gate']);
  });

  it('loses no nodes across the partition', () => {
    const { nodes, edges } = graph();
    const spaces = computeSpaces(nodes, edges, ROOTS);
    const total = spaces.reduce((sum, s) => sum + s.nodeIds.size, 0);
    expect(total).toBe(nodes.length);
  });

  it('orders universes by size and puts misc last', () => {
    const spaces = computeSpaces(graph().nodes, graph().edges, ROOTS);
    expect(spaces[spaces.length - 1].id).toBe(MISC_SPACE_ID);
    const sizes = spaces.slice(0, -1).map((s) => s.nodeIds.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('ignores dangling edges pointing at unknown ids', () => {
    const nodes = [{ id: 'root-a', label: 'A' }];
    const edges = [
      { source: 'ghost', target: 'root-a' },
      { source: 'root-a', target: 'phantom' },
    ];
    const spaces = computeSpaces(nodes, edges, ROOTS);
    expect(spaces).toHaveLength(1);
    expect([...spaces[0].nodeIds]).toEqual(['root-a']);
  });

  it('treats connectivity as undirected (child→parent edges still merge)', () => {
    // ADR-0001: source = child, target = parent. A leaf pointing at a root
    // must end up in the root's space regardless of edge direction.
    const nodes = [{ id: 'root-a', label: 'A' }, { id: 'leaf', label: '叶' }];
    const edges = [{ source: 'leaf', target: 'root-a' }];
    const spaces = computeSpaces(nodes, edges, ROOTS);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].nodeIds.has('leaf')).toBe(true);
  });
});

describe('computeFitTarget', () => {
  it('frames a wide box with zoom limited by width', () => {
    const t = computeFitTarget({ bb: { x1: 0, y1: 0, x2: 2000, y2: 500 }, width: 1000, height: 800 });
    // availW = 760, availH = 608 → zoom = min(760/2000, 608/500) = 0.38
    expect(t.zoom).toBeCloseTo(0.38, 6);
  });

  it('frames a tall box with zoom limited by height', () => {
    const t = computeFitTarget({ bb: { x1: 0, y1: 0, x2: 500, y2: 2000 }, width: 800, height: 1000 });
    // availW = 608, availH = 760 → zoom = min(608/500, 760/2000) = 0.38
    expect(t.zoom).toBeCloseTo(0.38, 6);
  });

  it('centres the box in the viewport', () => {
    const t = computeFitTarget({ bb: { x1: -100, y1: -100, x2: 100, y2: 100 }, width: 1000, height: 800 });
    // box centre (0,0) → pan = viewport centre.
    expect(t.pan.x).toBeCloseTo(500, 6);
    expect(t.pan.y).toBeCloseTo(400, 6);
  });

  it('shifts the box down when the top is reserved for chrome', () => {
    const box = { x1: -100, y1: -100, x2: 100, y2: 100 };
    const plain = computeFitTarget({ bb: box, width: 1000, height: 800 });
    const inset = computeFitTarget({ bb: box, width: 1000, height: 800, topInset: 120 });
    // Box centre (0,0) must land at (1000/2, (120+800)/2) instead of the raw centre.
    expect(inset.pan.x).toBeCloseTo(plain.pan.x, 6);
    expect(inset.pan.y).toBeCloseTo(460, 6);
    // Reserving the top also shrinks the available height, never the width.
    expect(inset.zoom).toBeLessThan(plain.zoom);
  });

  it('never returns zero or negative zoom for degenerate boxes', () => {
    const t = computeFitTarget({ bb: { x1: 5, y1: 5, x2: 5, y2: 5 }, width: 100, height: 100 });
    expect(t.zoom).toBeGreaterThan(0);
  });

  it('pixel insets reproduce renderer.fit() 的算式（空间取景必须和「适应」同缩放）', () => {
    // renderer.fit(): availW = W - p*2, availH = H - (topChrome+p), 中心落在
    // (W/2, topChrome+p+availH/2)。这里用同一组数字对一遍。
    const W = 1600;
    const H = 900;
    const P = 50;
    const chrome = 116;
    const bb = { x1: 0, y1: 0, x2: 21492, y2: 13830 };

    const expectedTop = chrome + P;
    const expectedZoom = Math.min((W - P * 2) / bb.x2, (H - expectedTop - P) / bb.y2);
    const t = computeFitTarget({
      bb,
      width: W,
      height: H,
      insets: { top: expectedTop, right: P, bottom: P, left: P },
    });

    expect(t.zoom).toBeCloseTo(expectedZoom, 9);
    // 中心点在安全区中心，而不是画布中心（顶部让开了浮层）。
    const midX = W / 2;
    const midY = expectedTop + (H - expectedTop - P) / 2;
    expect(t.pan.x + t.zoom * (bb.x2 / 2)).toBeCloseTo(midX, 6);
    expect(t.pan.y + t.zoom * (bb.y2 / 2)).toBeCloseTo(midY, 6);
  });

  it('insets 优先于比例留白（老口径不会被同时叠加）', () => {
    const bb = { x1: 0, y1: 0, x2: 1000, y2: 1000 };
    const a = computeFitTarget({ bb, width: 1000, height: 1000, insets: { top: 100 } });
    // 只让开顶部 100px：availW = 1000, availH = 900 → zoom = 0.9
    expect(a.zoom).toBeCloseTo(0.9, 9);
  });
});
