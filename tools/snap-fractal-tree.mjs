// tools/snap-fractal-tree.mjs
// 在真实图谱里截取生命之树，确认它在力布局背景上的实际观感。
// 用法：node tools/snap-fractal-tree.mjs [outfile]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const out = process.argv[2] || '/tmp/fractal-tree-in-graph.png';
const PORT = 4175;
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
});

// ?decor=tree —— 只留生命之树，排除另两个奇观干扰判断
await page.goto(`${BASE}/?decor=tree`, { waitUntil: 'domcontentloaded' });

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

// 等 euler 收敛（大图约 20s）
await page
  .waitForFunction(
    () => {
      const el = document.querySelector('#cy') || document.querySelector('.cy');
      const cy = el && el._cyreg && el._cyreg.cy;
      return cy && cy.nodes('tree-node').length > 0;
    },
    { timeout: 60000 },
  )
  .catch(() => {});
await page.waitForTimeout(4000);

// 把镜头对到树上
const info = await page.evaluate(() => {
  const el = document.querySelector('#cy') || document.querySelector('.cy');
  const cy = el._cyreg.cy;
  const n = cy.getElementById('tree-of-life');
  if (n.empty()) return { found: false };
  const p = n.position();
  // 拉近到树上看细节
  cy.zoom({ level: 0.55, renderedPosition: p });
  return { found: true, x: p.x, y: p.y, w: n.width(), h: n.height() };
});
console.log('tree node:', JSON.stringify(info));

await page.waitForTimeout(2500);
await page.screenshot({ path: out });
console.log('wrote ' + out);

if (errors.length) {
  console.log('\n--- 页面错误 ---');
  [...new Set(errors)].slice(0, 12).forEach((e) => console.log(' ', e));
} else {
  console.log('无页面错误');
}

await browser.close();
server.kill();
process.exit(0);
