// tools/measure-real.mjs
// 在**有头**（真实 GPU 合成）Chromium 里测帧率，回答「用户实际感受到的卡」。
//
// 为什么要换有头模式：headless Chromium 走 SwiftShader 软件光栅化，
// trace 里 RasterTask 占到 7870ms/5s（每帧 14 次），而 JS 只占 187ms——
// 这个比例完全是软件渲染的产物，**不能代表用户机器**。有头模式走真实
// GPU 合成路径，测出的数字才对得上「我这边好卡」。
//
// 代价：需要显示器。在纯 CI/无头环境下会失败，此时用 headless 数字做相对
// 比较（相对关系仍有效，绝对值无效）。
//
// 用法：node tools/measure-real.mjs [decor query ...]

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4181;
const BASE = `http://localhost:${PORT}`;
const VARIANTS = process.argv.slice(2).length ? process.argv.slice(2) : ['off', 'tree', 'all'];

// 无头环境下 headless:false 会失败，这里探测一次
const HEADED = process.env.HEADED !== '0';

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

let browser;
try {
  browser = await chromium.launch({ headless: !HEADED });
} catch (e) {
  console.error('无法启动浏览器（无显示器？）:', e.message.split('\n')[0]);
  console.error('加 HEADED=0 退回 headless（注意：绝对帧率不可信，仅可比相对关系）');
  server.kill();
  process.exit(2);
}

async function measure(q) {
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
  await page.waitForTimeout(30000); // 等布局收敛

  const r = await page.evaluate(
    () =>
      new Promise((res) => {
        const fr = [];
        let last = 0;
        const t0 = performance.now();
        const tick = (t) => {
          if (last) fr.push(t - last);
          last = t;
          if (performance.now() - t0 < 5000) requestAnimationFrame(tick);
          else {
            const s = fr.filter((f) => f > 0 && f < 5000).sort((a, b) => a - b);
            const med = s.length ? s[Math.floor(s.length / 2)] : null;
            res({
              fps: med ? +(1000 / med).toFixed(1) : null,
              medFrame: med ? +med.toFixed(1) : null,
              p95: s.length ? +s[Math.floor(s.length * 0.95)].toFixed(1) : null,
              longPct: s.length ? +((s.filter((f) => f > 50).length / s.length) * 100).toFixed(1) : null,
              n: s.length,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  await ctx.close();
  return r;
}

const name = (q) => (q === 'off' ? '无装饰' : q === 'tree' ? '只开树' : q ? q : '三个全开');
console.log(`模式：${HEADED ? '有头（真实 GPU 合成）' : '无头（软件光栅化，绝对值不可信）'}`);
console.log('变体          中位帧   FPS   p95帧   长帧%');
console.log('─'.repeat(50));
for (const q of VARIANTS) {
  const r = await measure(q);
  console.log(
    `${name(q).padEnd(12)} ${String(r.medFrame).padStart(6)}  ${String(r.fps).padStart(5)}  ${String(r.p95).padStart(6)}  ${String(r.longPct).padStart(6)}`,
  );
}

await browser.close();
server.kill();
process.exit(0);
