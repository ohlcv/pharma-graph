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
