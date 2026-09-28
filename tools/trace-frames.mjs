// tools/trace-frames.mjs
// 抓真实帧构成，回答「空闲期每帧时间花在哪一层」。
//
// 为什么需要这个：Performance.getMetrics 的 ScriptDuration 只统计 JS 执行，
// 实测 TaskDuration（主线程全部任务）比 ScriptDuration 大 4 倍。差额是样式
// 重算、布局、**画布光栅化**、合成——光看指标名字猜不出来。
//
// 用 Playwright 的 context.tracing（底层就是 CDP Tracing，协议细节它封装了）
// 抓 5 秒空闲期，再把 zip 里的 trace 事件按名字归并。
//
// 用法：node tools/trace-frames.mjs [decor query]

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

const PORT = 4180;
const BASE = `http://localhost:${PORT}`;
const DECOR = process.argv[2] ?? 'off';
const OUT_DIR = '/tmp/trace-decor';
mkdirSync(OUT_DIR, { recursive: true });

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
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/?decor=${DECOR}`, { waitUntil: 'domcontentloaded' });
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

// Playwright 的 context.tracing 只记录它自己的 action，**不含** devtools
// timeline 事件（categories 被硬编码）。要拿逐帧时间线必须走 CDP Tracing。
//
// 注意 Tracing.start 只接受 categories + options（traceConfig 等），
// **不认 transferMode** —— 传了会直接报 "Invalid parameters"。
// 数据从 Tracing.dataCollected 事件流里攒，tracingComplete 时收尾。
const cdp = await ctx.newCDPSession(page);
const chunks = [];
cdp.on('Tracing.dataCollected', (e) => chunks.push(...e.value));
const traceDone = new Promise((r) => cdp.once('Tracing.tracingComplete', r));

await cdp.send('Tracing.start', {
  categories: [
    'devtools.timeline',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-devtools.timeline.frame',
  ].join(','),
});
await page.waitForTimeout(5000);
await cdp.send('Tracing.end');
await traceDone;

const zip = `${OUT_DIR}/t-${DECOR || 'all'}.json`;

// 数据已在内存里，不必落盘解压。
const { writeFileSync } = await import('node:fs');
const complete = chunks.filter((e) => e.ph === 'X' && e.dur);

const byName = new Map();
for (const e of complete) {
  const cur = byName.get(e.name) || { total: 0, n: 0, max: 0 };
  cur.total += e.dur;
  cur.n += 1;
  cur.max = Math.max(cur.max, e.dur);
  byName.set(e.name, cur);
}

const rows = [...byName.entries()]
  .map(([name, v]) => ({
    name,
    n: v.n,
    totalMs: +(v.total / 1000).toFixed(1),
    avgMs: +(v.total / v.n / 1000).toFixed(3),
    maxMs: +(v.max / 1000).toFixed(2),
  }))
  .filter((r) => r.totalMs > 15)
  .sort((a, b) => b.totalMs - a.totalMs)
  .slice(0, 24);

console.log(`装饰 = ${DECOR || 'all'}｜空闲期 5 秒内各事件累计耗时`);
console.log(
  '事件'.padEnd(36) + '次数'.padStart(6) + '总ms'.padStart(9) + '均值ms'.padStart(9) + '峰值ms'.padStart(9),
);
console.log('─'.repeat(72));
for (const r of rows) {
  console.log(
    r.name.padEnd(36) + String(r.n).padStart(6) + String(r.totalMs).padStart(9) + String(r.avgMs).padStart(9) + String(r.maxMs).padStart(9),
  );
}
writeFileSync(zip, JSON.stringify(chunks));
console.log('\n原始 trace:', zip, `(${chunks.length} events，speedscope.app 可导入)`);

await browser.close();
server.kill();
process.exit(0);
