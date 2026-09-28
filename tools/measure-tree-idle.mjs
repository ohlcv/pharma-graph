// tools/measure-tree-idle.mjs
// 快速对照：生命之树在**空闲期**（布局收敛后）的持续帧率开销。
// 只跑两档（off / tree），单次采样，够用来判断优化是否奏效。
//
// 用法：node tools/measure-tree-idle.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4177;
const BASE = `http://localhost:${PORT}`;
const VARIANTS = [
  { q: 'off', desc: '无装饰（对照）' },
  { q: 'tree', desc: '只开生命之树' },
  { q: '', desc: '三个全开' },
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

async function measure(q, desc) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(q ? `${BASE}/?decor=${q}` : `${BASE}/`, { waitUntil: 'domcontentloaded' });

  await page
    .waitForFunction(
      () => {
        const el = document.querySelector('#cy') || document.querySelector('.cy');
        return !!(el && el._cyreg && el._cyreg.cy && el._cyreg.cy.nodes().length > 100);
      },
      { timeout: 40000 },
    )
    .catch(() => {});

  // 等布局收敛（大图 ~20s），装饰 overlay 的 rAF 一直在跑
  await page.waitForTimeout(30000);

  const r = await page.evaluate(async () => {
    window.__f = [];
    let last = 0;
    let done;
    const p = new Promise((res) => (done = res));
    const tick = (t) => {
      if (last) window.__f.push(t - last);
      last = t;
      if (window.__f.length < 300) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
    await p;

    const fr = window.__f.filter((f) => f > 0 && f < 5000).sort((a, b) => a - b);
    const med = fr.length ? fr[Math.floor(fr.length / 2)] : null;
    return {
      medFrame: med ? +med.toFixed(1) : null,
      fps: med ? +(1000 / med).toFixed(1) : null,
      longPct: fr.length ? +((fr.filter((f) => f > 50).length / fr.length) * 100).toFixed(1) : null,
      n: fr.length,
    };
  });

  await ctx.close();
  return { ...r, desc };
}

console.log('变体            中位帧  FPS   长帧%   采样帧数');
console.log('─'.repeat(52));
for (const v of VARIANTS) {
  const r = await measure(v.q, v.desc);
  console.log(
    `${v.desc.padEnd(14)} ${String(r.medFrame).padStart(6)}  ${String(r.fps).padStart(5)}  ${String(r.longPct).padStart(5)}   ${r.n}`,
  );
}

await browser.close();
server.kill();
process.exit(0);
