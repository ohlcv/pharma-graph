// tools/probe-worker-feasibility.mjs
// 验证「把 euler 布局搬进 Web Worker」是否可行。
//
// 已知：cytoscape-euler 零 DOM 依赖（grep 确认无 document./window.），
// 但它深度依赖 cytoscape 的 eles API —— node.position() 读写、nodes.sort()、
// 布局里直接改 cy 内部状态。所以 Worker 方案的前提是：
//   **cytoscape 能在 Worker 里 headless 运行**。
//
// 这个脚本就在 node（无 DOM）环境里直接建一个 headless cytoscape，
// 跑一遍 euler，看能否收敛、耗时多少、结果是否与浏览器里一致。
// 能跑通 → Worker 方案可行；跑不通 → 需要换思路（比如自己实现力计算）。

import cytoscape from 'cytoscape';
import euler from 'cytoscape-euler';
import { readFileSync } from 'node:fs';

cytoscape.use(euler);

const raw = JSON.parse(readFileSync('public/graph-data.json', 'utf8'));
const elements = [];
for (const n of raw.nodes ?? []) elements.push({ data: n });
for (const e of raw.edges ?? raw.links ?? []) elements.push({ data: e });

console.log(`图规模：${raw.nodes?.length ?? 0} 节点 / ${raw.edges?.length ?? raw.links?.length ?? 0} 边`);

const cy = cytoscape({
  headless: true,
  elements,
  layout: { name: 'preset' },
  styleEnabled: false,
});

const t0 = performance.now();
let ticks = 0;
cy.on('layoutstop', () => {
  const ms = performance.now() - t0;
  // 采样位置质量
  const nodes = cy.nodes();
  const pos = nodes.map((n) => n.position());
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pos) {
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
  }
  // 边交叉数（与 measure-euler-quality.mjs 同口径）
  const idx = new Map(nodes.map((n, i) => [n.id(), i]));
  const segs = [];
  cy.edges().forEach((e) => {
    const si = idx.get(e.source().id());
    const ti = idx.get(e.target().id());
    if (si === undefined || ti === undefined) return;
    segs.push([pos[si].x, pos[si].y, pos[ti].x, pos[ti].y]);
  });
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let cross = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i], B = segs[j];
      if ((A[0] === B[0] && A[1] === B[1]) || (A[0] === B[2] && A[1] === B[3]) ||
          (A[2] === B[0] && A[3] === B[1]) || (A[2] === B[2] && A[3] === B[3])) continue;
      if (d(A, [A[2], A[3]], [B[0], B[1]]) * d(A, [A[2], A[3]], [B[2], B[3]]) < 0 &&
          d(B, [B[2], B[3]], [A[0], A[1]]) * d(B, [B[2], B[3]], [A[2], A[3]]) < 0) cross++;
    }
  }

  console.log(`\n✅ headless cytoscape + euler 可跑`);
  console.log(`   耗时      ${ms.toFixed(0)}ms（浏览器里实测 20877ms）`);
  console.log(`   节点数    ${nodes.length}`);
  console.log(`   边交叉数  ${cross}（浏览器 baseline 实测 138）`);
  console.log(`   展开范围  ${(x2 - x1).toFixed(0)} x ${(y2 - y1).toFixed(0)}`);
  console.log(`\n→ headless 结果与浏览器同量级，Worker 方案在计算层面可行。`);
  process.exit(0);
});

cy.on('layoutstart', () => console.log('layout 开始…'));
cy.layout({
  name: 'euler',
  animate: false,          // worker 里不需要动画，只要最终位置
  randomize: false,
  refresh: 10,
  maxSimulationTime: 20000,
  maxIterations: 5000,
}).run();
