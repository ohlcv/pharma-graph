// tools/measure-phase.mjs
// 分阶段测帧率，定位「卡」到底发生在哪个阶段。
//
// 真实 GPU 下测到的稳态是满帧（measure-real.mjs 59.9 FPS × 三档），
// 所以用户感受到的卡不在空闲期，而在**加载/布局期**：
// 1182 节点的 euler 布局要跑 ~20s（measure-euler-quality.mjs 实测 20877ms），
// 期间主线程被 layout 独占。
//
// 本脚本沿加载时序采样，输出「加载 → 布局 → 稳态」三段的帧率曲线。
//
// 用法：node tools/measure-phase.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4182;
const BASE = `http://localhost:${PORT}`;
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
  console.error('无法启动有头浏览器，加 HEADED=0 退回无头（绝对值不可信）');
  server.kill();
  process.exit(2);
}

const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

// 页面加载前就装 rAF 采样钩子，捕获整个加载时序
await page.addInitScript(() => {
  window.__samples = [];
  let last = 0;
  const tick = (t) => {
    const now = performance.now();
    if (last) window.__samples.push({ t: now, dt: t - last });
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const t0 = Date.now();
const DECOR = process.env.DECOR || 'off';
await page.goto(`${BASE}/?decor=${DECOR}`, { waitUntil: 'domcontentloaded' });
// 采样 45s，覆盖完整加载 + 布局 + 稳态
await page.waitForTimeout(45000);

const s = await page.evaluate(() => window.__samples);

// 按 1 秒分桶
const buckets = [];
for (let sec = 0; sec * 1000 < s[s.length - 1].t; sec++) {
  const inB = s.filter((x) => x.t >= sec * 1000 && x.t < (sec + 1) * 1000);
  if (inB.length < 2) continue;
  const sorted = inB.map((x) => x.dt).sort((a, b) => a - b);
  buckets.push({
    sec,
    fps: +(1000 / sorted[Math.floor(sorted.length / 2)]).toFixed(1),
    p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
    worst: +sorted[sorted.length - 1].toFixed(1),
  });
}

console.log(`装饰 = ${DECOR}`);
console.log('每秒一桶：FPS（越低越卡）');
const perLine = 10;
for (let i = 0; i < buckets.length; i += perLine) {
  const chunk = buckets.slice(i, i + perLine);
  console.log(
    `${String(chunk[0].sec).padStart(3)}s │ ` +
      chunk.map((b) => String(b.fps).padStart(5)).join(' '),
  );
}
console.log('     │ ' + buckets.slice(0, perLine).map(() => '     ·').join(' '));

// 统计最卡的窗口
const worst = [...buckets].sort((a, b) => a.fps - b.fps).slice(0, 5);
console.log('\n最卡的 5 秒：');
for (const w of worst) console.log(`  ${w.sec}s  FPS=${w.fps}  p95帧=${w.p95}ms  最差单帧=${w.worst}ms`);

await browser.close();
server.kill();
process.exit(0);
