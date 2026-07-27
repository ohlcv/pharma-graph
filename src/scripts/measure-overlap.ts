// src/scripts/measure-overlap.ts
//
// 量 LAYOUTS 配置在真实内容下的几何重叠率。开发期调参工具, 不参与 vitest。
//
// 用法:
//   node --import tsx src/scripts/measure-overlap.ts
//
// 数据: 读 public/content/ 下所有 .md 文件 (项目真实节点), 用 90x36 假碰撞盒
//       量化"两个节点中心距离 < (aW + bW) / 2 且 < (aH + bH) / 2"的对数。
//       总可能对数 = n*(n-1)/2 (223 节点下 = 24753)。
//
// 历史: 清单 §12.1 重叠修复 — 由 1.07% (COSE) / 1.85% (Euler) 降到 0.08% / 1.02%。
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import euler from 'cytoscape-euler';
import dagre from 'cytoscape-dagre';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';
import { LAYOUTS } from '../core/config.js';

cytoscape.use(coseBilkent);
cytoscape.use(euler);
cytoscape.use(dagre);

const NODE_W = 90;
const NODE_H = 36;
// 用 layoutDimensions 前的近似 bounding box (节点方形更易重叠)
const DEFAULT_W = NODE_W;
const DEFAULT_H = NODE_H;

const CONTENT_DIR = '/Users/meow/Desktop/Project/pharma-graph/public/content';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

const FILES = walk(CONTENT_DIR);
const nodes: { data: { id: string; label?: string } }[] = [];
const idSet = new Set<string>();
const edges: { data: { id: string; source: string; target: string } }[] = [];

for (const f of FILES) {
  const text = readFileSync(f, 'utf-8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  let fm: any;
  try {
    fm = yamlParse(m[1]);
  } catch {
    continue;
  }
  const data = fm.data ?? fm;
  const id = data.id;
  const edgesList = data.edges_out ?? fm.edges_out;
  if (!id || idSet.has(id)) continue;
  idSet.add(id);
  nodes.push({ data: { id, label: data.label } });
  if (!Array.isArray(edgesList)) continue;
  for (const e of edgesList) {
    const tgt = typeof e === 'string' ? e : e?.target;
    if (typeof tgt === 'string' && idSet.has(tgt)) {
      edges.push({ data: { id: `${id}->${tgt}#${edges.length}`, source: id, target: tgt } });
    }
  }
}

// 第二轮（保留只有当 src 已知才加入边的策略）：再扫一遍吃跨文件边
for (const f of FILES) {
  const text = readFileSync(f, 'utf-8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  let fm: any;
  try {
    fm = yamlParse(m[1]);
  } catch {
    continue;
  }
  const data = fm.data ?? fm;
  const id = data.id;
  if (!id || !idSet.has(id)) continue;
  const edgesList = data.edges_out ?? fm.edges_out;
  if (!Array.isArray(edgesList)) continue;
  for (const e of edgesList) {
    const tgt = typeof e === 'string' ? e : e?.target;
    if (typeof tgt === 'string' && idSet.has(tgt)) {
      const exists = edges.some((x) => x.data.source === id && x.data.target === tgt);
      if (!exists)
        edges.push({ data: { id: `${id}->${tgt}#${edges.length}`, source: id, target: tgt } });
    }
  }
}

console.log(`Nodes: ${nodes.length}, Edges: ${edges.length}`);
// sanity check
let parsedCount = 0,
  hasEdgesOut = 0,
  idSamples: string[] = [];
for (const f of FILES) {
  const text = readFileSync(f, 'utf-8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  let fm: any;
  try {
    fm = yamlParse(m[1]);
  } catch {
    continue;
  }
  parsedCount++;
  const data = fm.data ?? fm;
  const edgesList = data.edges_out ?? fm.edges_out;
  if (Array.isArray(edgesList)) {
    hasEdgesOut++;
    if (idSamples.length < 3) idSamples.push(`${data.id}->${edgesList[0].target}`);
  }
}
console.log(`Parsed: ${parsedCount}, has edges_out: ${hasEdgesOut}`);
console.log(`Sample edges: ${idSamples.join(', ')}`);

function measureOverlap(cy: ReturnType<typeof cytoscape>): void {
  // Force a fixed box size so we measure geometric overlap, not cytoscape's
  // 30x30 default which is too small to register collisions on a real graph.
  // The probe's goal is to detect layout-induced overlap, not font metrics.
  const positions: { id: string; x: number; y: number; w: number; h: number }[] = [];
  cy.nodes().forEach((n) => {
    const pos = n.position();
    positions.push({ id: n.id(), x: pos.x, y: pos.y, w: DEFAULT_W, h: DEFAULT_H });
  });
  let overlapPairs = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i];
      const b = positions[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const minX = (a.w + b.w) / 2;
      const minY = (a.h + b.h) / 2;
      if (dx < minX && dy < minY) overlapPairs++;
    }
  }
  const total = (positions.length * (positions.length - 1)) / 2;
  // bbox to flag spread-out outputs (extreme repulsion ⇒ huge graph)
  let minX = +Infinity,
    minY = +Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  positions.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  console.log(
    `  overlap pairs: ${overlapPairs} / ${total} = ${((overlapPairs / total) * 100).toFixed(
      2,
    )}%, bbox: ${Math.round(maxX - minX)}×${Math.round(maxY - minY)}`,
  );
}

interface Metrics {
  overlap: number;
  bboxW: number;
  bboxH: number;
  score: number;
}

function collectMetrics(cy: ReturnType<typeof cytoscape>): Metrics {
  const positions: { x: number; y: number; w: number; h: number }[] = [];
  cy.nodes().forEach((n) => {
    const pos = n.position();
    positions.push({ x: pos.x, y: pos.y, w: DEFAULT_W, h: DEFAULT_H });
  });
  let overlapPairs = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i];
      const b = positions[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const minX = (a.w + b.w) / 2;
      const minY = (a.h + b.h) / 2;
      if (dx < minX && dy < minY) overlapPairs++;
    }
  }
  const total = (positions.length * (positions.length - 1)) / 2;
  let minX = +Infinity,
    minY = +Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  positions.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  const bboxW = Math.round(maxX - minX);
  const bboxH = Math.round(maxY - minY);
  // Composite score: 0 = best (no overlap AND bbox close to COSE reference 2700×2962).
  // We use L1 distance between (overlap%, bboxW, bboxH) and COSE reference
  // (0.09%, 2695, 2962) — favours layouts that simultaneously beat COSE on
  // overlap and match it on bbox, rather than collapsing to 0/0 with a giant bbox.
  const refOverlap = 0.09;
  const refW = 2695;
  const refH = 2962;
  const score =
    Math.abs((overlapPairs / total) * 100 - refOverlap) +
    Math.abs(bboxW - refW) / refW +
    Math.abs(bboxH - refH) / refH;
  return { overlap: overlapPairs, bboxW, bboxH, score };
}

function avgMetrics(arr: Metrics[]): Metrics {
  const n = arr.length;
  return {
    overlap: arr.reduce((s, m) => s + m.overlap, 0) / n,
    bboxW: arr.reduce((s, m) => s + m.bboxW, 0) / n,
    bboxH: arr.reduce((s, m) => s + m.bboxH, 0) / n,
    score: arr.reduce((s, m) => s + m.score, 0) / n,
  };
}

function runLayoutMeasure(options: Record<string, unknown>): Metrics {
  const cy = cytoscape({
    headless: true,
    styleEnabled: false,
    elements: [...nodes, ...edges],
  });
  const layout = cy.layout({ name: 'euler', ...options, animate: false });
  layout.run();
  const m = collectMetrics(cy);
  cy.destroy();
  return m;
}

const BASE_OPTIONS = {
  randomize: true,
  fit: true,
  padding: 100,
  nodeDimensionsIncludeLabels: true,
};

function runLayout(name: string, options: Record<string, unknown>, label?: string): void {
  const cy = cytoscape({
    headless: true,
    styleEnabled: false,
    elements: [...nodes, ...edges],
  });
  // Force animate:false in headless: cytoscape's layoutPositions animation step
  // tries to call ani.play() which doesn't exist outside the browser. Layout
  // blocks whose cytoscape object sets animate='end' (cose-bilkent etc.) will
  // override via the spread, so we apply animate:false AFTER the spread.
  const layout = cy.layout({ name, ...options, animate: false });
  layout.run();
  if (label) {
    console.log(`=== ${label} ===`);
  }
  measureOverlap(cy);
  cy.destroy();
}

console.log('\n=== baseline (项目当前 LAYOUTS.cose.cytoscape) ===');
runLayout('cose-bilkent', {
  ...BASE_OPTIONS,
  ...LAYOUTS.cose.cytoscape,
});

console.log('\n=== euler baseline (项目当前 LAYOUTS.euler.cytoscape) ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  ...LAYOUTS.euler.cytoscape,
});

console.log('\n=== exp: official default ===');
runLayout('cose-bilkent', {
  ...BASE_OPTIONS,
  nodeRepulsion: 4500,
  idealEdgeLength: 50,
  edgeElasticity: 0.45,
  gravity: 0.25,
  numIter: 2500,
  quality: 'default',
  tile: true,
});

console.log('\n=== exp: high repulsion, weak spring ===');
runLayout('cose-bilkent', {
  ...BASE_OPTIONS,
  nodeRepulsion: 80000,
  idealEdgeLength: 400,
  edgeElasticity: 0.45,
  gravity: 0.05,
  numIter: 5000,
  quality: 'proof',
  tile: true,
});

console.log('\n=== exp: even higher repulsion, stronger gravity ===');
runLayout('cose-bilkent', {
  ...BASE_OPTIONS,
  nodeRepulsion: 200000,
  idealEdgeLength: 400,
  edgeElasticity: 0.45,
  gravity: 0.1,
  numIter: 5000,
  quality: 'proof',
  tile: true,
});

console.log('\n=== exp: ridiculous override to see repulsion effect ===');
runLayout('cose-bilkent', {
  ...BASE_OPTIONS,
  nodeRepulsion: 500000,
  idealEdgeLength: 500,
  edgeElasticity: 0.45,
  gravity: 0.1,
  numIter: 5000,
  quality: 'proof',
  tile: true,
});

console.log('\n=== euler: old parameters (pre-fix) ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 80,
  gravity: -1.2,
  refresh: 30,
  maxIterations: 1000,
  maxSimulationTime: 4000,
});

console.log('\n=== euler: stronger spring, longer springs ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.005,
  springLength: 150,
  gravity: -2,
  refresh: 30,
  maxIterations: 2000,
  maxSimulationTime: 8000,
});

console.log('\n=== euler: weaker spring, MUCH stronger gravity repulsion ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 80,
  gravity: -3,
  refresh: 30,
  maxIterations: 3000,
  maxSimulationTime: 10000,
});

console.log('\n=== euler: aggressive sweep — gravity -5 / -8 ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 80,
  gravity: -5,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 80,
  gravity: -8,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: extreme gravity -15, -25, -40 ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 80,
  gravity: -15,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 80,
  gravity: -25,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 80,
  gravity: -40,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: gravity -8 + force longer springs ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 150,
  gravity: -8,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: gravity -8 + much weaker spring (less pull-together) ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0001,
  springLength: 80,
  gravity: -8,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: gravity -15 + weaker spring, sweep springCoeff ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0005,
  springLength: 80,
  gravity: -15,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0001,
  springLength: 80,
  gravity: -15,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: gravity -25 + springCoeff 0.0001 (best of sweep so far) ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0001,
  springLength: 80,
  gravity: -25,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log(
  '\n=== euler: tuned (best candidate) — gravity -25 + springCoeff 0.0001 + more iters ===',
);
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0001,
  springLength: 80,
  gravity: -25,
  refresh: 30,
  maxIterations: 8000,
  maxSimulationTime: 30000,
});

console.log('\n=== euler: tuned but softer (final production candidate) ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 100,
  gravity: -15,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: production 1 — soft and spread ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0005,
  springLength: 100,
  gravity: -12,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: production 1+ — same but more iters ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0005,
  springLength: 100,
  gravity: -12,
  refresh: 30,
  maxIterations: 10000,
  maxSimulationTime: 30000,
});

console.log('\n=== euler: kill pull=0.001 default (test 1) ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0005,
  springLength: 100,
  gravity: -12,
  pull: 0,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: pull=0 + softer drag ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0005,
  springLength: 100,
  gravity: -12,
  pull: 0,
  dragCoeff: 0.01,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: pull=0 + tweak theta ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0005,
  springLength: 100,
  gravity: -12,
  pull: 0,
  theta: 0.8,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: negative pull = anti-center repulsion (test 1) ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0005,
  springLength: 100,
  gravity: -12,
  pull: -0.001,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: pull -0.005 ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0005,
  springLength: 100,
  gravity: -12,
  pull: -0.005,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: pull -0.005 + drop drag to spread ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0005,
  springLength: 100,
  gravity: -12,
  pull: -0.005,
  dragCoeff: 0.005,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: pull -0.01 + tiny drag ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0005,
  springLength: 100,
  gravity: -12,
  pull: -0.01,
  dragCoeff: 0.005,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: COOSE-style sweet-spot sweep (low-overlap + good bbox) ===');
// COSE baseline: 0.09% / 2695×2962. Try to hit both.
runLayout(
  'euler',
  {
    ...BASE_OPTIONS,
    springCoeff: 0.0001,
    springLength: 100,
    gravity: -15,
    pull: 0,
    maxIterations: 5000,
    maxSimulationTime: 20000,
  },
  'sweep A: coeff 0.0001 / len 100 / gravity -15',
);
runLayout(
  'euler',
  {
    ...BASE_OPTIONS,
    springCoeff: 0.0001,
    springLength: 100,
    gravity: -12,
    pull: 0,
    maxIterations: 5000,
    maxSimulationTime: 20000,
  },
  'sweep B: coeff 0.0001 / len 100 / gravity -12',
);
runLayout(
  'euler',
  {
    ...BASE_OPTIONS,
    springCoeff: 0.0001,
    springLength: 100,
    gravity: -10,
    pull: 0,
    maxIterations: 5000,
    maxSimulationTime: 20000,
  },
  'sweep C: coeff 0.0001 / len 100 / gravity -10',
);
runLayout(
  'euler',
  {
    ...BASE_OPTIONS,
    springCoeff: 0.0002,
    springLength: 100,
    gravity: -15,
    pull: 0,
    maxIterations: 5000,
    maxSimulationTime: 20000,
  },
  'sweep D: coeff 0.0002 / len 100 / gravity -15',
);
runLayout(
  'euler',
  {
    ...BASE_OPTIONS,
    springCoeff: 0.0003,
    springLength: 100,
    gravity: -15,
    pull: 0,
    maxIterations: 5000,
    maxSimulationTime: 20000,
  },
  'sweep E: coeff 0.0003 / len 100 / gravity -15',
);
runLayout(
  'euler',
  {
    ...BASE_OPTIONS,
    springCoeff: 0.0001,
    springLength: 150,
    gravity: -15,
    pull: 0,
    maxIterations: 5000,
    maxSimulationTime: 20000,
  },
  'sweep F: coeff 0.0001 / len 150 / gravity -15',
);

console.log('\n=== euler: production 1b — gentle + slight more repulsion ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0006,
  springLength: 100,
  gravity: -10,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

console.log('\n=== euler: production 2 — even softer ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.001,
  springLength: 100,
  gravity: -10,
  refresh: 30,
  maxIterations: 4000,
  maxSimulationTime: 15000,
});

console.log('\n=== euler: production 3 — keep coeff, push gravity ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 100,
  gravity: -8,
  refresh: 30,
  maxIterations: 4000,
  maxSimulationTime: 15000,
});

console.log('\n=== euler: production 4 — gentle baseline+ ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 120,
  gravity: -6,
  refresh: 30,
  maxIterations: 4000,
  maxSimulationTime: 15000,
});

console.log('\n=== cose: pure-tighter repulsion dominance ===');
runLayout('cose-bilkent', {
  ...BASE_OPTIONS,
  nodeRepulsion: 600000,
  idealEdgeLength: 200,
  edgeElasticity: 0.45,
  gravity: 0.0,
  numIter: 5000,
  quality: 'proof',
  tile: false,
});

console.log('\n=== cose: medium repulsion + tight edges ===');
runLayout('cose-bilkent', {
  ...BASE_OPTIONS,
  nodeRepulsion: 100000,
  idealEdgeLength: 150,
  edgeElasticity: 0.45,
  gravity: 0.05,
  numIter: 5000,
  quality: 'proof',
  tile: true,
});

console.log('\n=== euler: increase pull (center attraction) ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.0008,
  springLength: 80,
  gravity: -1.2,
  pull: 0.05,
  dragCoeff: 0.1,
  refresh: 30,
  maxIterations: 3000,
  maxSimulationTime: 10000,
});

console.log('\n=== euler: bigger springs + tight center ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.001,
  springLength: 120,
  gravity: -2,
  pull: 0.02,
  dragCoeff: 0.05,
  refresh: 30,
  maxIterations: 3000,
  maxSimulationTime: 10000,
});

console.log('\n=== euler: max everything ===');
runLayout('euler', {
  ...BASE_OPTIONS,
  springCoeff: 0.002,
  springLength: 150,
  gravity: -3,
  pull: 0.1,
  dragCoeff: 0.2,
  refresh: 30,
  maxIterations: 5000,
  maxSimulationTime: 20000,
});

// ============================================================================
// §12.4 (2026-07): Dense neighborhood sweep around §12.3 sweet-spot D.
// Euler is a physics simulator — single runs have noticeable variance. Average
// over N=5 to find parameters that are reliably good, not lucky.
// COSE baseline for reference: overlap 0.09%, bbox 2695×2962.
// Score = |overlap% - 0.09| + |bboxW - 2695|/2695 + |bboxH - 2962|/2962.
// Lower = closer to COSE on all axes simultaneously.
// ============================================================================
console.log('\n=== §12.4 dense sweep around sweet-spot D (avg N=5) ===');
const SWEEP_BASE = {
  ...BASE_OPTIONS,
  springLength: 100,
  gravity: -15,
  pull: 0,
  maxIterations: 5000,
  maxSimulationTime: 20000,
};
const SWEEP_AXES: Array<{ axis: string; values: number[]; update: Record<string, number> }> = [
  { axis: 'springCoeff', values: [0.00015, 0.0002, 0.00025, 0.0003], update: {} },
  { axis: 'gravity', values: [-12, -13, -14, -15, -16, -17, -18], update: {} },
  { axis: 'springLength', values: [80, 100, 120, 140], update: {} },
];
const N = 5;
type Row = { label: string; avg: Metrics };
const sweepRows: Row[] = [];
function avgRun(label: string, optOverrides: Record<string, number>): void {
  const opts = { ...SWEEP_BASE, ...optOverrides };
  const samples: Metrics[] = [];
  for (let i = 0; i < N; i++) {
    samples.push(runLayoutMeasure(opts));
  }
  const avg = avgMetrics(samples);
  sweepRows.push({ label, avg });
  console.log(
    `  [${label.padEnd(50)}] avg-of-${N}: overlap=${avg.overlap.toFixed(1)}, bbox=${Math.round(avg.bboxW)}×${Math.round(avg.bboxH)}, score=${avg.score.toFixed(3)}`,
  );
}
console.log('  --- coeff sweep (gravity -15, len 100) ---');
for (const coeff of SWEEP_AXES[0].values) {
  avgRun(`coeff=${coeff}`, { springCoeff: coeff });
}
console.log('  --- gravity sweep (coeff 0.0002, len 100) ---');
for (const g of SWEEP_AXES[1].values) {
  avgRun(`gravity=${g}`, { springCoeff: 0.0002, gravity: g });
}
console.log('  --- springLength sweep (coeff 0.0002, gravity -15) ---');
for (const len of SWEEP_AXES[2].values) {
  avgRun(`len=${len}`, { springCoeff: 0.0002, springLength: len });
}

// COSE reference for the final table.
const coseSamples: Metrics[] = [];
for (let i = 0; i < N; i++) {
  const cy = cytoscape({ headless: true, styleEnabled: false, elements: [...nodes, ...edges] });
  const layout = cy.layout({
    name: 'cose-bilkent',
    ...BASE_OPTIONS,
    ...LAYOUTS.cose.cytoscape,
    animate: false,
  });
  layout.run();
  coseSamples.push(collectMetrics(cy));
  cy.destroy();
}
const coseAvg = avgMetrics(coseSamples);
console.log(
  `\n  [COSE reference (avg ${N})]                                overlap=${coseAvg.overlap.toFixed(1)}, bbox=${Math.round(coseAvg.bboxW)}×${Math.round(coseAvg.bboxH)}, score=${coseAvg.score.toFixed(3)}`,
);

// Sort by score and print top-5 winners.
console.log('\n  --- top 5 by score (lower=better, resembles COSE on all 3 axes) ---');
const winners = [...sweepRows].sort((a, b) => a.avg.score - b.avg.score).slice(0, 5);
winners.forEach((row, i) => {
  console.log(
    `  ${(i + 1).toString().padStart(1)}) ${row.label.padEnd(50)} score=${row.avg.score.toFixed(3)}`,
  );
});

// Final validation: N=10 on the top contenders to capture variance and worst-case.
console.log('\n=== §12.4 final validation: N=10 on top 3 contenders + COSE ===');
const N10 = 10;
const candidates = [
  {
    label: 'A: gravity=-17 (overlap-favoured)',
    opt: { springCoeff: 0.0002, springLength: 100, gravity: -17, pull: 0 },
  },
  {
    label: 'B: len=140 (bbox-favoured)',
    opt: { springCoeff: 0.0002, springLength: 140, gravity: -15, pull: 0 },
  },
  {
    label: 'C: current default (coeff 0.0002, len 100, g -15)',
    opt: { springCoeff: 0.0002, springLength: 100, gravity: -15, pull: 0 },
  },
];
console.log(
  `  ${'candidate'.padEnd(50)} ${'mean overlap'.padStart(13)} ${'worst'.padStart(7)} ${'bboxW×H'.padStart(11)} ${'score'.padStart(8)}`,
);
for (const cand of candidates) {
  const samples: Metrics[] = [];
  for (let i = 0; i < N10; i++) {
    samples.push(runLayoutMeasure({ ...SWEEP_BASE, ...cand.opt }));
  }
  const overlapArr = samples.map((s) => s.overlap);
  const worstOverlap = Math.max(...overlapArr);
  const avg = avgMetrics(samples);
  console.log(
    `  ${cand.label.padEnd(50)} ${avg.overlap.toFixed(2).padStart(13)} ${worstOverlap.toFixed(0).padStart(7)} ${`${Math.round(avg.bboxW)}×${Math.round(avg.bboxH)}`.padStart(11)} ${avg.score.toFixed(3).padStart(8)}`,
  );
}
// COSE for head-to-head
const coseSamples2: Metrics[] = [];
for (let i = 0; i < N10; i++) {
  const cy = cytoscape({ headless: true, styleEnabled: false, elements: [...nodes, ...edges] });
  const layout = cy.layout({
    name: 'cose-bilkent',
    ...BASE_OPTIONS,
    ...LAYOUTS.cose.cytoscape,
    animate: false,
  });
  layout.run();
  coseSamples2.push(collectMetrics(cy));
  cy.destroy();
}
const coseAvg2 = avgMetrics(coseSamples2);
console.log(
  `  ${'COSE reference'.padEnd(50)} ${coseAvg2.overlap.toFixed(2).padStart(13)} ${Math.max(
    ...coseSamples2.map((s) => s.overlap),
  )
    .toFixed(0)
    .padStart(
      7,
    )} ${`${Math.round(coseAvg2.bboxW)}×${Math.round(coseAvg2.bboxH)}`.padStart(11)} ${coseAvg2.score.toFixed(3).padStart(8)}`,
);
