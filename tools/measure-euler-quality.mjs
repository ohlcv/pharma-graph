// tools/measure-euler-quality.mjs
// 对照测量 euler 降级方案：布局期帧率（速度） × 收敛后布局质量。
//
// 用法：node tools/measure-euler-quality.mjs [variant ...]
//   不带参数 = 跑全部变体（含缺省基线）
//
// 设计要点：
//   - 帧率采样从 layoutstart 起、到 layoutstop 止，用 rAF 计帧。
//   - 布局质量用两个与「视觉可读性」直接相关的几何指标，不靠主观判断：
//       overlapRatio  节点面积重叠率（越低越好，0 = 完全不压）
//       edgeCrossings 边交叉数（越低越好，力布局质量的核心指标）
//     两者都从收敛后的最终位置算。
//   - 同一 variant 跑 N 次取中位数，压掉 preview 冷启动噪声。

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 4173);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const REPEATS = Number(process.env.REPEATS || 3);
/** 布局期最长等待（ms）。euler 缺省上限 20s，留足余量。 */
const LAYOUT_TIMEOUT = 45000;

/**
 * 自己拉起 vite preview，测完再杀。
 *
 * 为什么不复用外部起好的 server：这个 shell 环境里后台进程会随调用结束被回收
 * （nohup + disown 也留不住），所以起服务必须和测量在同一个进程内。
 * 已起好服务时用 SKIP_SERVER=1 + BASE_URL 指向它。
 */
const ownServer = process.env.SKIP_SERVER !== '1' && !process.env.BASE_URL;
let server = null;

if (ownServer) {
  server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', detached: false },
  );
  // 等端口就绪
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      server.kill();
      throw new Error('vite preview 未能在 30s 内就绪：' + BASE);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

const VARIANTS = [
  { key: 'baseline', q: '' },
  { key: 'refresh5', q: 'refresh5' },
  { key: 'refresh2', q: 'refresh2' },
  { key: 'theta', q: 'theta' },
  { key: 'time8s', q: 'time8s' },
  { key: 'frugal', q: 'frugal' },
  { key: 'crippled', q: 'crippled' },
  { key: 'preset', q: 'preset' },
];

const args = process.argv.slice(2);
const picked = args.length
  ? VARIANTS.filter((v) => args.includes(v.key))
  : VARIANTS;

if (!picked.length) {
  console.error('No matching variants:', args.join(', '));
  process.exit(1);
}

/** 页面内注入：在 layoutstart→layoutstop 期间用 rAF 采样帧时长。 */
const SAMPLE_HOOK = `
  window.__perf = { frames: [], started: 0, stopped: 0, running: false };
  (function hook() {
    let raf;
    const cy = window.__cy || (window.__cy = null);
    if (!cy) return false;
    cy.on('layoutstart', () => { window.__perf.running = true; window.__perf.started = performance.now(); });
    cy.on('layoutstop', () => {
      window.__perf.running = false; window.__perf.stopped = performance.now();
    });
    let last = 0;
    const tick = (t) => {
      if (last) window.__perf.frames.push(t - last);
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return true;
  })();
`;

async function measure(page, variant) {
  const url = variant.q ? `${BASE}/?quality=${variant.q}` : `${BASE}/`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // 等 renderer 把 cy 挂到 window（debug-bridge 可能已暴露；否则注入探针）
  await page.waitForFunction(
    () => {
      const w = window;
      if (!w.__cy) {
        // 从 canvas 旁的 cytoscape 实例兜底：cytoscape 注册在 container 上
        const el = document.querySelector('#cy') || document.querySelector('.cy');
        if (el && el._cyreg && el._cyreg.cy) w.__cy = el._cyreg.cy;
      }
      return !!w.__cy;
    },
    { timeout: 30000 },
  );

  // 装帧率采样
  await page.evaluate(SAMPLE_HOOK);
  await page.evaluate(() => {
    const cy = window.__cy;
    if (window.__hooked) return;
    window.__hooked = true;
    cy.on('layoutstart', () => {
      window.__perf.running = true;
      window.__perf.started = performance.now();
    });
    cy.on('layoutstop', () => {
      window.__perf.running = false;
      window.__perf.stopped = performance.now();
    });
  });

  // 预热后再开始计帧——首个 rAF 回调里才装 sampling loop
  await page.evaluate(() => {
    window.__perf.frames = [];
    let last = 0;
    const tick = (t) => {
      if (last) window.__perf.frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // 等布局结束（preset 变体不会触发 layoutstop，单独处理）
  let layoutMs = null;
  if (variant.q === 'preset') {
    await page.waitForTimeout(3000);
    layoutMs = 0;
  } else {
    await page
      .waitForFunction(() => window.__perf && window.__perf.stopped > 0, {
        timeout: LAYOUT_TIMEOUT,
      })
      .catch(() => {});
    const r = await page.evaluate(() => ({
      started: window.__perf.started,
      stopped: window.__perf.stopped,
    }));
    layoutMs = r.stopped > 0 ? Math.round(r.stopped - r.started) : null;
  }

  // 等节点完全静止再量质量
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const cy = window.__cy;
    const frames = window.__perf.frames.filter((f) => f > 0 && f < 5000);
    const sorted = [...frames].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const long = frames.filter((f) => f > 50).length;

    const nodes = cy.nodes().not('.layer-parent');
    const positions = nodes.map((n) => n.position());
    const w = (n) => n.width();
    const h = (n) => n.height();

    // ── 节点重叠率：两两比较 O(n²)，1182 节点 ≈ 70 万次，够快。
    //    overlap = 两个节点矩形的交集面积
    let overlapArea = 0;
    let totalArea = 0;
    for (let i = 0; i < nodes.length; i++) {
      const a = positions[i];
      const wi = w(nodes[i]);
      const hi = h(nodes[i]);
      totalArea += wi * hi;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = positions[j];
        const ox = (wi + w(nodes[j])) / 2 - Math.abs(a.x - b.x);
        const oy = (hi + h(nodes[j])) / 2 - Math.abs(a.y - b.y);
        if (ox > 0 && oy > 0) overlapArea += ox * oy;
      }
    }

    // ── 边交叉数：力布局质量的核心指标。
    //    O(E²)，只统计非 parent 边（本图 parent 边是层级容器线，不参与）。
    const edges = cy.edges().filter((e) => {
      const s = e.source();
      const t = e.target();
      return !s.hasClass('layer-parent') && !t.hasClass('layer-parent');
    });
    const idx = new Map(nodes.map((n, i) => [n.id(), i]));
    const segs = [];
    edges.forEach((e) => {
      const si = idx.get(e.source().id());
      const ti = idx.get(e.target().id());
      if (si === undefined || ti === undefined) return;
      segs.push([positions[si].x, positions[si].y, positions[ti].x, positions[ti].y]);
    });
    // 两两交叉检测（跳过共享端点的边——它们是同一个节点的 fan-out，不算交叉）
    const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const properCross = (A, B) => {
      const d1 = d(A, [A[2], A[3]], [B[0], B[1]]);
      const d2 = d(A, [A[2], A[3]], [B[2], B[3]]);
      const d3 = d(B, [B[2], B[3]], [A[0], A[1]]);
      const d4 = d(B, [B[2], B[3]], [A[2], A[3]]);
      return d1 * d2 < 0 && d3 * d4 < 0;
    };
    let crossings = 0;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const A = segs[i];
        const B = segs[j];
        const share =
          (A[0] === B[0] && A[1] === B[1]) ||
          (A[0] === B[2] && A[1] === B[3]) ||
          (A[2] === B[0] && A[3] === B[1]) ||
          (A[2] === B[2] && A[3] === B[3]);
        if (share) continue;
        if (properCross(A, B)) crossings++;
      }
    }

    const bbox = nodes.boundingBox();
    return {
      fps: median ? +(1000 / median).toFixed(1) : null,
      medianFrame: median ? +median.toFixed(1) : null,
      longFramePct: frames.length ? +((long / frames.length) * 100).toFixed(1) : null,
      frames: frames.length,
      nodeCount: nodes.length,
      edgeCount: segs.length,
      overlapPct: totalArea ? +((overlapArea / totalArea) * 100).toFixed(1) : 0,
      crossings,
      // 展开范围：力布局是否把图铺开（preset 收在一团 vs euler 铺满）
      spread: bbox
        ? +Math.max(bbox.w / 1, 0).toFixed(0) + 'x' + +Math.max(bbox.h, 0).toFixed(0)
        : null,
    };
  });

  return { ...m, layoutMs };
}

function median(arr) {
  const a = arr.filter((x) => x !== null).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

console.log(
  `variant      layoutMs  FPS  medFrame  long%   overlap%  crossings  spread`,
);
console.log('─'.repeat(78));

const rows = [];
for (const v of picked) {
  const runs = [];
  for (let i = 0; i < REPEATS; i++) {
    try {
      runs.push(await measure(page, v));
    } catch (e) {
      console.error(`  ${v.key} run ${i + 1} failed: ${e.message.split('\n')[0]}`);
    }
  }
  if (!runs.length) continue;

  const row = {
    key: v.key,
    n: runs.length,
    layoutMs: median(runs.map((r) => r.layoutMs)),
    fps: median(runs.map((r) => r.fps)),
    medFrame: median(runs.map((r) => r.medianFrame)),
    longFramePct: median(runs.map((r) => r.longFramePct)),
    overlapPct: median(runs.map((r) => r.overlapPct)),
    crossings: median(runs.map((r) => r.crossings)),
    spread: runs[0].spread,
    nodeCount: runs[0].nodeCount,
    edgeCount: runs[0].edgeCount,
  };
  rows.push(row);
  console.log(
    `${row.key.padEnd(12)} ${String(row.layoutMs).padStart(6)}  ` +
      `${String(row.fps).padStart(5)}  ${String(row.medFrame).padStart(7)}  ` +
      `${String(row.longFramePct).padStart(5)}   ${String(row.overlapPct).padStart(7)}  ` +
      `${String(row.crossings).padStart(9)}  ${row.spread}`,
  );
}

console.log('\n(n=' + picked[0].key + '…  每档 ' + REPEATS + ' 次取中位数)');
console.log('overlap% 越低越好 / crossings 越低越好 / spread 越大表示铺得越开');

await browser.close();
if (server) server.kill();

// 输出 JSON 便于后续写进 DEBUG 文档
if (process.env.JSON_OUT) {
  const fs = await import('node:fs');
  fs.writeFileSync(process.env.JSON_OUT, JSON.stringify(rows, null, 2));
  console.log('\nwrote ' + process.env.JSON_OUT);
}

process.exit(0);
