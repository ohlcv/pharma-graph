// tools/snap-euler.mjs — 给指定变体截图，用于人工确认几何指标可信。
// 用法：node tools/snap-euler.mjs <variant> <outfile>
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const variant = process.argv[2] || '';
const out = process.argv[3] || `/tmp/euler-${variant || 'baseline'}.png`;
const PORT = 4174;
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
const url = variant ? `${BASE}/?quality=${variant}` : `${BASE}/`;
await page.goto(url, { waitUntil: 'domcontentloaded' });

// 等布局停（或 preset 变体直接等一会儿）
await page
  .waitForFunction(
    () => {
      const el = document.querySelector('#cy') || document.querySelector('.cy');
      const cy = el && el._cyreg && el._cyreg.cy;
      if (!cy) return false;
      if (new URLSearchParams(location.search).get('quality') === 'preset') return true;
      return cy.layoutCount && cy.layoutCount() === 0;
    },
    { timeout: 60000 },
  )
  .catch(() => {});
await page.waitForTimeout(2000);

// fit 到全图，让展开范围一眼可见
await page.evaluate(() => {
  const el = document.querySelector('#cy') || document.querySelector('.cy');
  const cy = el && el._cyreg && el._cyreg.cy;
  if (cy) cy.fit(40);
});
await page.waitForTimeout(800);

await page.screenshot({ path: out });
console.log('wrote ' + out);

await browser.close();
server.kill();
process.exit(0);
