// tools/measure-decor-idle.mjs
// 测量装饰奇观在**空闲期**（布局收敛之后）的持续帧率开销。
//
// 为什么单独测这个：tools/measure-euler-quality.mjs 测的是「布局期」帧率，
// 当时的结论是「装饰节点对布局帧率无可观测影响」。但那三个 overlay 的 rAF
// 是**永久**跑的（start() 之后没有终点），布局收敛后仍在每帧重绘。所以
// 「布局期无影响」并不等于「空闲期无影响」——这是之前那轮结论的盲区。
//
// 用法：node tools/measure-decor-idle.mjs [repeats]

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4176;
const BASE = `http://localhost:${PORT}`;
const REPEATS = Number(process.argv[2] || 2);

/** 每个变体：URL query + 说明 */
const VARIANTS = [
  { key: 'off', q: 'off', desc: '无装饰（对照）' },
  { key: 'celestial', q: 'celestial', desc: '只开太极八卦' },
  { key: 'tess', q: 'tess', desc: '只开超立方体' },
  { key: 'tree', q: 'tree', desc: '只开生命之树' },
  { key: 'all', q: '', desc: '三个全开' },
];

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
});
const deadline = Date.now() + 30000;
for (;;) {
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
    if (r.ok) break;
  } catch {}
  if (Date.now() > deadline) {
    server.kill();
    throw new Error('server not ready');
  }
  await new Promise((r) => setTimeout(r, 400));
}

const browser = await chromium.launch();

/**
 * 在给定 URL 上等到布局收敛，然后采 3 秒空闲期 rAF 帧时长。
 * 同时统计每个 overlay canvas 的像素面积——shadowBlur 的成本正比于面积。
 */
async function measure(q, desc) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(q ? `${BASE}/?decor=${q}` : `${BASE}/`, { waitUntil: 'domcontentloaded' });

  // 等图建好
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector('#cy') || document.querySelector('.cy');
        return !!(el && el._cyreg && el._cyreg.cy && el._cyreg.cy.nodes().length > 100);
      },
      { timeout: 40000 },
    )
    .catch(() => {});

  // 等布局收敛（大图约 20s）。装饰 overlay 的 rAF 一直在跑，不等它没意义。
  await page.waitForTimeout(28000);

  // 装 rAF 采样，采 3 秒
  const r = await page.evaluate(async () => {
    window.__f = [];
    let last = 0;
    let done;
    const p = new Promise((res) => (done = res));
    const tick = (t) => {
      if (last) window.__f.push(t - last);
      last = t;
      if (window.__f.length < 400) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
    await p;
    await new Promise((r2) => setTimeout(r2, 300));

    const frames = window.__f.filter((f) => f > 0 && f < 5000).sort((a, b) => a - b);
    const med = frames.length ? frames[Math.floor(frames.length / 2)] : null;
    const long = frames.filter((f) => f > 50).length;

    // 每个装饰 canvas 的实际像素面积
    const canvases = [...document.querySelectorAll('canvas')]
      .filter((c) => c.hasAttribute('data-tesseract') || c.hasAttribute('data-fractal-tree') || c.hasAttribute('data-celestial') || c.dataset.decor)
      .map((c) => ({ key: c.getAttribute('data-tesseract') ? 'tesseract' : c.getAttribute('data-fractal-tree') ? 'tree' : 'celestial', w: c.width, h: c.height }));

    return {
      medFrame: med ? +med.toFixed(1) : null,
      fps: med ? +(1000 / med).toFixed(1) : null,
      longPct: frames.length ? +((long / frames.length) * 100).toFixed(1) : null,
      n: frames.length,
      canvases,
    };
  });

  await ctx.close();
  return { ...r, desc };
}

function median(a) {
  const x = a.filter((v) => v !== null).sort((p, q) => p - q);
  return x.length ? x[Math.floor(x.length / 2)] : null;
}

console.log('变体         中位帧  FPS   长帧%   canvas 面积        说明');
console.log('─'.repeat(84));

for (const v of VARIANTS) {
  const runs = [];
  for (let i = 0; i < REPEATS; i++) runs.push(await measure(v.q, v.desc));
  const medFrame = median(runs.map((r) => r.medFrame));
  const area = runs[0].canvases
    .map((c) => `${c.key}:${((c.w * c.h) / 1e6).toFixed(1)}M`)
    .join(' ');
  console.log(
    `${v.key.padEnd(12)} ${String(medFrame).padStart(6)}  ${String(median(runs.map((r) => r.fps))).padStart(5)}  ${String(median(runs.map((r) => r.longPct))).padStart(5)}   ${(area || '—').padEnd(16)}  ${v.desc}`,
  );
}

await browser.close();
server.kill();
process.exit(0);
