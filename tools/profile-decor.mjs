// tools/profile-decor.mjs
// 用 Chrome DevTools Protocol 抓真实性能数据，回答「50ms 一帧花在哪」。
//
// 为什么不用 rAF 采样：rAF 只告诉你「一帧多久」，不告诉你「谁花的」。
// CDP 的 Performance.getMetrics 给出累计 CPU 时间，能直接对比
// 同一段空闲期内各 overlay 各自的 ScriptDuration 增量。
//
// 用法：node tools/profile-decor.mjs [decor query]

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4178;
const BASE = `http://localhost:${PORT}`;
const VARIANTS = process.argv.slice(2).length ? process.argv.slice(2) : ['off', 'tree', ''];

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

/** 取当前累计 CPU 指标。 */
async function metrics(cdp) {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  const out = {};
  for (const x of m) out[x.name] = x.value;
  return out;
}

async function profile(q) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');

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

  // 等布局收敛，之后进入纯空闲期
  await page.waitForTimeout(30000);

  // 采样窗口：5 秒纯空闲
  const WINDOW_MS = 5000;
  const a = await metrics(cdp);
  const t0 = Date.now();
  await page.waitForTimeout(WINDOW_MS);
  const b = await metrics(cdp);
  const wall = (Date.now() - t0) / 1000;

  // 各类别：LayoutDuration/ScriptDuration 是累计秒
  const delta = {
    script: b.ScriptDuration - a.ScriptDuration,
    layout: b.LayoutDuration - a.LayoutDuration,
    recalcStyle: b.RecalcStyleDuration - a.RecalcStyleDuration,
    task: b.TaskDuration - a.TaskDuration,
  };

  // 帧数：rAF 计一次
  const frames = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
          else res({ n, sec: (performance.now() - t0) / 1000 });
        };
        requestAnimationFrame(tick);
      }),
  );

  await ctx.close();
  return {
    q: q || 'all',
    fps: +(frames.n / frames.sec).toFixed(1),
    // 每秒主线程占用率
    scriptPct: +((delta.script / wall) * 100).toFixed(1),
    layoutPct: +((delta.layout / wall) * 100).toFixed(1),
    taskPct: +((delta.task / wall) * 100).toFixed(1),
  };
}

console.log('空闲期（布局收敛后）主线程占用率 —— 越低越好');
console.log('变体       FPS    Script%   Layout%   Task%');
console.log('─'.repeat(48));
for (const q of VARIANTS) {
  const r = await profile(q);
  console.log(
    `${String(r.q).padEnd(10)} ${String(r.fps).padStart(5)}  ${String(r.scriptPct).padStart(8)}  ${String(r.layoutPct).padStart(8)}  ${String(r.taskPct).padStart(7)}`,
  );
}

await browser.close();
server.kill();
process.exit(0);
