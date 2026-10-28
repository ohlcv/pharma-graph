// 一次性调试脚本：同步布局模式下镜头漂移 / portal-gate 位置排查（原根目录 p1.mjs–p5.mjs 合并）。
// 用法（项目根执行，需先起 dev server）：
//   node tools/debug-camera.mjs [1|2|3|4|5|all]   # 默认 all，按 1→5 顺序跑
// 产出截图均在 shots/ 下。
import { chromium } from 'playwright';

const which = process.argv[2] || 'all';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });

async function openGraph() {
  await p.goto('http://127.0.0.1:5173/?layout=sync', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__pg && window.__pg.cy, null, { timeout: 60000 });
}
async function waitLoading() {
  await p.waitForFunction(() => document.getElementById('loading-indicator')?.classList.contains('u-hidden'), null, { timeout: 120000 });
}
const cam = () => p.evaluate(() => {
  const cy = window.__pg.cy;
  const shown = cy.nodes().filter(n => n.style('display') !== 'none');
  const bb = shown.boundingBox();
  return { zoom: +cy.zoom().toFixed(4), pan: { x: +cy.pan().x.toFixed(0), y: +cy.pan().y.toFixed(0) },
           screenW: +(bb.w * cy.zoom()).toFixed(0), screenH: +(bb.h * cy.zoom()).toFixed(0),
           shown: shown.length,
           portal: (() => { const n = cy.getElementById('portal-gate'); return n.empty() ? null : n.renderedPosition(); })() };
});

// —— p1：每 3 秒采样相机，观察加载/动画过程视图是否乱动 ——
async function case1() {
  await openGraph();
  for (let i = 0; i < 6; i++) { console.log(`t~${i * 3}s`, JSON.stringify(await cam())); await p.waitForTimeout(3000); }
  await waitLoading();
  await p.waitForTimeout(600);
  console.log('落定后', JSON.stringify(await cam()));
  await p.screenshot({ path: 'shots/no-move.png' });
}

// —— p2：探针谁在改 zoom（patch cy.zoom/cy.viewport + resize 日志） ——
async function case2() {
  p.on('console', m => { const t = m.text(); if (t.startsWith('PROBE')) console.log(t); });
  await p.addInitScript(() => {
    window.addEventListener('resize', () => {
      const cy = window.__pg && window.__pg.cy;
      console.log('PROBE resize', cy ? cy.zoom().toFixed(4) : 'no-cy');
    });
  });
  await openGraph();
  await p.evaluate(() => {
    const cy = window.__pg.cy;
    const z = cy.zoom.bind(cy);
    cy.zoom = function (...a) { if (a.length) console.log('PROBE cy.zoom(' + a[0] + ')', new Error().stack.split('\n').slice(1, 4).join(' | ')); return z(...a); };
    const vp = cy.viewport.bind(cy);
    cy.viewport = function (...a) { if (a.length) console.log('PROBE cy.viewport()', new Error().stack.split('\n').slice(1, 4).join(' | ')); return vp(...a); };
  });
  await waitLoading();
  await p.waitForTimeout(1500);
}

// —— p3：落定后 portal-gate 是否被侧边栏遮挡 ——
async function case3() {
  await openGraph();
  await waitLoading();
  await p.waitForTimeout(800);
  console.log(JSON.stringify(await p.evaluate(() => {
    const cy = window.__pg.cy;
    const sb = document.getElementById('sidebar').getBoundingClientRect();
    const portal = cy.getElementById('portal-gate').renderedPosition();
    return { zoom: cy.zoom(), pan: cy.pan(), portal, sidebarLeft: sb.left,
             covered: portal.x > sb.left && portal.x < sb.right && portal.y > sb.top && portal.y < sb.bottom };
  })));
  await p.screenshot({ path: 'shots/portal-visible.png' });
}

// —— p4：落定后 portal-gate 是否在屏幕内；进第三个奇观空间 ——
async function case4() {
  await openGraph();
  await waitLoading();
  await p.waitForTimeout(800);
  const st = await p.evaluate(() => {
    const cy = window.__pg.cy;
    const rp = cy.getElementById('portal-gate').renderedPosition();
    return { zoom: +cy.zoom().toFixed(4), pan: cy.pan(), portal: { x: +rp.x.toFixed(0), y: +rp.y.toFixed(0) },
      onScreen: rp.x > 0 && rp.x < cy.width() && rp.y > 0 && rp.y < cy.height() };
  });
  console.log('落定', JSON.stringify(st));
  await p.screenshot({ path: 'shots/scatter.png' });
  await p.evaluate(() => window.__pg.cy.getElementById('portal-gate').emit('tap'));
  await p.waitForTimeout(300);
  const items = await p.$$('.space-menu__item');
  if (items[2]) { await items[2].click(); await p.waitForTimeout(1600); await p.screenshot({ path: 'shots/decor-space.png' }); }
}

// —— p5：Escape 回全图，统计可见节点与全图占屏 ——
async function case5() {
  await openGraph();
  await waitLoading();
  await p.waitForTimeout(600);
  await p.keyboard.press('Escape');   // 药学宇宙 → 全图
  await p.waitForTimeout(1400);
  await p.screenshot({ path: 'shots/full-graph.png' });
  console.log(JSON.stringify(await p.evaluate(() => {
    const cy = window.__pg.cy;
    const shown = cy.nodes().filter(n => n.style('display') !== 'none');
    const bb = shown.boundingBox();
    return { zoom: +cy.zoom().toFixed(4), nodes: shown.length, screenW: +(bb.w * cy.zoom()).toFixed(0), screenH: +(bb.h * cy.zoom()).toFixed(0) };
  })));
}

const cases = { 1: case1, 2: case2, 3: case3, 4: case4, 5: case5 };
const run = which === 'all' ? Object.keys(cases) : [which];
for (const k of run) {
  console.log(`=== case ${k} ===`);
  await cases[k]();
}
await b.close();
