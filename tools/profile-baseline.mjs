// tools/profile-baseline.mjs
// 定位「关掉全部装饰也只有 18 FPS」的基线开销来源。
//
// profile-decor.mjs 的结论：装饰奇观合计只占 ~4% Script 时间，
// 关掉全部装饰后主线程仍有 12.3% 占用、17.9 FPS。所以卡顿的主因在别处。
// 这里逐项关停嫌疑来源，测出各自的边际贡献：
//   - cytoscape 主画布（1182 节点 + N 条边，每帧重绘）
//   - 星场（预渲染平铺）
//   - glow-overlay（节点的辉光层？）
//   - 三个装饰奇观
//
// 用法：node tools/profile-baseline.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;

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

async function run(label, setup) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');

  // 全部装饰关掉
  await page.goto(`${BASE}/?decor=off`, { waitUntil: 'domcontentloaded' });
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

  const info = await setup(page);

  const get = async () => {
    const { metrics: m } = await cdp.send('Performance.getMetrics');
    const o = {};
    for (const x of m) o[x.name] = x.value;
    return o;
  };

  const a = await get();
  const t0 = Date.now();
  const frames = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const s = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - s < 4000) requestAnimationFrame(tick);
          else res({ n, sec: (performance.now() - s) / 1000 });
        };
        requestAnimationFrame(tick);
      }),
  );
  const b = await get();
  const wall = (Date.now() - t0) / 1000;

  await ctx.close();
  return {
    label,
    fps: +(frames.n / frames.sec).toFixed(1),
    scriptPct: +(((b.ScriptDuration - a.ScriptDuration) / wall) * 100).toFixed(1),
    taskPct: +(((b.TaskDuration - a.TaskDuration) / wall) * 100).toFixed(1),
    extra: info,
  };
}

const cyOf = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('#cy') || document.querySelector('.cy');
    const cy = el && el._cyreg && el._cyreg.cy;
    if (!cy) return null;
    const s = el.querySelector('canvas');
    return {
      nodes: cy.nodes().length,
      edges: cy.edges().length,
      canvasCount: document.querySelectorAll('canvas').length,
      cytoscapeCanvas: s ? `${s.width}x${s.height}` : '?',
    };
  });

const rows = [];

// 1) 基线：什么都不关（装饰已 off）
rows.push(await run('基线（无装饰）', cyOf));

// 2) 关掉 cytoscape 渲染（cy.renderer().off() 不存在，用 hide 全部元素）
rows.push(
  await run('隐藏全部节点/边', (page) =>
    page.evaluate(() => {
      const el = document.querySelector('#cy') || document.querySelector('.cy');
      const cy = el._cyreg.cy;
      // cytoscape 没有「全局停渲染」API，但把容器 visibility 隐藏
      // 不会停止 canvas 绘制……所以改用把画布缩到 0 的等效手段：
      // 直接把 cytoscape 的主 canvas 设为 display:none
      el.style.visibility = 'hidden';
      return { hidden: true };
    }),
  ),
);

// 3) 移走星场 canvas
rows.push(
  await run('移除星场 canvas', (page) =>
    page.evaluate(() => {
      let n = 0;
      for (const c of document.querySelectorAll('canvas')) {
        // 星场是 body 下最底层、非 #cy 容器的画布
        if (c.closest('[class*=cy]') || c.getAttribute('data-tesseract') || c.getAttribute('data-fractal-tree')) continue;
        c.remove();
        n++;
      }
      return { removed: n };
    }),
  ),
);

console.log('变体                  FPS    Script%   Task%   附加信息');
console.log('─'.repeat(72));
for (const r of rows) {
  console.log(
    `${r.label.padEnd(18)} ${String(r.fps).padStart(5)}  ${String(r.scriptPct).padStart(8)}  ${String(r.taskPct).padStart(6)}   ${JSON.stringify(r.extra)}`,
  );
}

await browser.close();
server.kill();
process.exit(0);
