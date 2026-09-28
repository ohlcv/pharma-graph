// tools/preview-fractal-tree.mjs
// 离线渲染分形树参数网格，用于人工挑参数。
// 用法：node tools/preview-fractal-tree.mjs [outfile]
// 产物：一张 contact sheet，每格一棵不同参数的树，标注参数组合。
//
// 为什么需要它：分形树的观感几乎全由 (maxDepth, lengthDecay, spreadAngle, jitter)
// 决定，而这些只能在 canvas 上肉眼判断。把参数空间铺成一张图比反复改代码
// 重启 dev server 快得多。

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { generateTree, barkColor, foliageColor, rgba } from '../src/core/fractal-tree-geometry.ts';

// 参数网格：重点探 depthDecay（分枝角随深度的收缩速度）。
// 第一版没有 depthDecay，角度恒定，实测 maxDepth≥10 时整幅糊成灌木噪点。
// 扫过 1.0 / 0.85 / 0.72 / 0.6 后确认 0.72 附近最好：主杆立得住、层次分明。
// 这里在 0.72 附近细扫 spread × decay，锁定最终值。
const GRID = [];
for (const [spreadAngle, depthDecay] of [
  [0.65, 0.75],
  [0.75, 0.75],
  [0.85, 0.75],
  [0.75, 0.7],
  [0.75, 0.78],
  [0.65, 0.72],
  [0.85, 0.72],
  [0.9, 0.7],
  [0.7, 0.8],
  [0.8, 0.8],
  [0.7, 0.68],
  [0.85, 0.68],
]) {
  GRID.push({
    maxDepth: 11,
    lengthDecay: 0.72,
    spreadAngle,
    depthDecay,
    jitter: 0.3,
    gravity: 0.12,
  });
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLS = 4;
const CELL = 320;
const rows = Math.ceil(GRID.length / COLS);

const html = `<!doctype html><meta charset="utf-8">
<style>
  body{margin:0;background:#07080c;font:11px ui-monospace,monospace;color:#8fa}
  .grid{display:grid;grid-template-columns:repeat(${COLS},${CELL}px)}
  .cell{position:relative;width:${CELL}px;height:${CELL}px;border:1px solid #1a2030;box-sizing:border-box}
  .cell b{position:absolute;left:6px;top:5px;color:#5a7;font-weight:400;z-index:2;
    text-shadow:0 0 4px #000}
  canvas{position:absolute;inset:0;width:100%;height:100%}
</style>
<div class="grid">
${GRID.map(
  (g, i) =>
    `<div class="cell"><b>${i}: d${g.maxDepth} A${g.spreadAngle} decay${g.depthDecay}</b><canvas id="c${i}" width="${CELL * 2}" height="${CELL * 2}"></canvas></div>`,
).join('\n')}
</div>
<script type="module">
import { generateTree, barkColor, foliageColor, rgba } from ${JSON.stringify(new URL('../src/core/fractal-tree-geometry.ts', import.meta.url).href)};

const GRID = ${JSON.stringify(GRID)};

function draw(idx, g) {
  const c = document.getElementById('c' + idx);
  const ctx = c.getContext('2d');
  const S = 2; // dpr
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);

  const geo = generateTree({
    maxDepth: g.maxDepth,
    lengthDecay: g.lengthDecay,
    spreadAngle: g.spreadAngle,
    depthDecay: g.depthDecay,
    jitter: g.jitter,
    gravity: g.gravity,
    trunkLength: 100,
    rand: seeded(7),
  });

  // 把局部包围盒 fit 进格子
  const { x1, y1, x2, y2 } = geo.bounds;
  const bw = x2 - x1, bh = y2 - y1;
  const pad = 14;
  const scale = Math.min((CELL - pad * 2) / bw, (CELL - pad * 2) / bh);
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

  ctx.save();
  ctx.translate(CELL / 2, CELL / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.lineCap = 'round';

  // 枝干：粗的先画，细的后画，视觉上细枝压在粗枝之上
  // （geometry 按 BFS 生成、depth 全局升序，倒序即由粗到细）
  const sorted = [...geo.branches].reverse();
  for (const b of sorted) {
    const t = b.depth / Math.max(1, geo.maxDepth);
    const col = barkColor(t);
    const ex = b.x + Math.cos(b.angle) * b.length;
    const ey = b.y + Math.sin(b.angle) * b.length;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = rgba(col, 0.35 + 0.6 * t);
    ctx.lineWidth = b.width;
    ctx.stroke();
  }
  // 末梢光点
  for (const f of geo.foliage) {
    const t = f.depth / Math.max(1, geo.maxDepth);
    const col = foliageColor(t);
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
    ctx.fillStyle = rgba(col, 0.5);
    ctx.shadowColor = rgba(col, 0.8);
    ctx.shadowBlur = f.size * 2;
    ctx.fill();
  }
  ctx.restore();
  ctx.shadowBlur = 0;
}
GRID.forEach(draw);
</script>`;
const out = process.argv[2] || '/tmp/fractal-tree-sheet.html';
writeFileSync(out, html);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: COLS * CELL, height: rows * CELL },
});
await page.goto('file://' + out);
await page.waitForTimeout(1200);
const png = out.replace(/\.html$/, '.png');
await page.screenshot({ path: png, fullPage: true });
console.log('wrote ' + png);
console.log('参数组合:');
GRID.forEach((g, i) =>
  console.log(
    `  ${String(i).padStart(2)}: maxDepth=${g.maxDepth} spread=${g.spreadAngle} depthDecay=${g.depthDecay}`,
  ),
);
await browser.close();
process.exit(0);
