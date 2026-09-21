// src/ui/starfield.ts
// 背景星点层 — 3 层视差 + DPR 自适应
//
// 设计目标：给深色背景加"宇宙纵深"——平移图谱时近层星点错位明显、远层
// 几乎不动，模拟视差。星云光晕（layout.css 的 #app::after）和噪点层
// （body 上的 .noise-overlay）一起负责剩下的氛围。
//
// 性能预算：
//   - 星点位置在初始化时一次性生成（seeded RNG → 刷新后位置稳定）
//   - 每层预渲染到 OffscreenCanvas 当 sprite，pan 时只 drawImage
//   - pan 事件用 RAF 节流：连续 pan 一帧画一次，绝不空转
//   - 闲置时 GPU 0 占用，只有 pan 那几帧在画
//
// 视差因子（视差 = 镜头移动 × 因子）：
//   - Layer 1 远景：80–120 颗、0.10（小但远，看起来"沉重"）
//   - Layer 2 中景：100–160 颗、0.22
//   - Layer 3 近景：60–100 颗、0.45（最大、最近、最快响应）
//
// zoom 也参与视差：zoom 缩小时星点应该"远离"——把 pan offset × (1/zoom)
// 就能模拟出近大远小的宇宙感。注意 cytoscape 的 cy.zoom() 不影响
// background-position，只能通过缩放 sprite 比例近似实现：当前实现只
// 做 pan 视差（zoom 时星点静止），跟物理直觉略有偏差但视觉上 OK，
// 真做完整透视的成本不值。
//
// 多解析度：sprite 用 devicePixelRatio 渲染一次后 drawImage 到主 canvas。
// resize 时重新生成 sprite（避免硬切出现锯齿）。

import type cytoscape from 'cytoscape';

// ── Seeded RNG（mulberry32）───────────────────────────────────────────────
//
// 用种子而不是 Math.random() 是因为：
//   1. 每次刷新位置一致——视觉上稳定，不会每次打开图谱星点就"重新洗牌"
//   2. 可复现——测试或者 debug 时给固定 seed 可以定位"哪颗星点在哪"
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 单层配置 ────────────────────────────────────────────────────────────

interface StarLayerConfig {
  /** 视差因子：0=完全不动，1=完全跟随镜头 */
  parallax: number;
  /** 星点数量（基于 viewport area 自动缩放） */
  baseCount: number;
  /** 星点尺寸范围（CSS px） */
  sizeRange: [number, number];
  /** 不透明度范围 */
  alphaRange: [number, number];
  /** sprite 缓存颜色——越远的层越暗 */
  color: string;
  /** 用于生成位置 RNG 的 seed 偏移 */
  seedOffset: number;
}

const LAYERS: readonly StarLayerConfig[] = [
  { parallax: 0.10, baseCount: 120, sizeRange: [0.6, 1.2], alphaRange: [0.35, 0.55], color: '#cbd5e1', seedOffset: 1 },  // 远：冷灰白
  { parallax: 0.22, baseCount: 160, sizeRange: [0.9, 1.8], alphaRange: [0.45, 0.70], color: '#e2e8f0', seedOffset: 2 },  // 中：稍亮
  { parallax: 0.45, baseCount: 90,  sizeRange: [1.4, 2.6], alphaRange: [0.55, 0.85], color: '#f8fafc', seedOffset: 3 },  // 近：近白
] as const;

// ── 单层 sprite：把这一层的所有星点预渲染到一张大 canvas 上 ───────────────

interface StarLayer {
  config: StarLayerConfig;
  /** sprite canvas——比视口大，留出 pan 余量让星点能"走"进来 */
  sprite: HTMLCanvasElement;
  /** sprite 物理尺寸（CSS px） */
  width: number;
  height: number;
}

const PARALLAX_OVERSHOOT = 1.5;

function buildLayer(
  config: StarLayerConfig,
  viewportW: number,
  viewportH: number,
  dpr: number,
): StarLayer {
  // sprite 比视口大 PARALLAX_OVERSHOOT 倍，给视差移动留余量。
  // 这样最近层平移到极值时也不会"走出" sprite 边缘出现黑边。
  const w = viewportW * PARALLAX_OVERSHOOT;
  const h = viewportH * PARALLAX_OVERSHOOT;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { config, sprite: canvas, width: w, height: h };
  }
  ctx.scale(dpr, dpr);

  // 星点数量按 sprite 面积缩放：viewport 越大、layer 越近，星点越多
  const viewportArea = viewportW * viewportH;
  const count = Math.round(config.baseCount * (viewportArea / (1920 * 1080)));
  const finalCount = Math.max(40, Math.min(count, config.baseCount * 2));

  const rng = mulberry32(0x517a + config.seedOffset);
  ctx.fillStyle = config.color;

  for (let i = 0; i < finalCount; i++) {
    const size = config.sizeRange[0] + rng() * (config.sizeRange[1] - config.sizeRange[0]);
    const alpha = config.alphaRange[0] + rng() * (config.alphaRange[1] - config.alphaRange[0]);
    const x = rng() * w;
    const y = rng() * h;

    ctx.globalAlpha = alpha;

    // 用圆 + 高斯径向渐变模拟"星点光晕"。直接 fillRect 是死板的方块，
    // 圆渐变让星点有柔边——比 box-shadow 便宜，比 PNG sprite 灵活。
    // 对 1–2px 的星点来说，径向渐变在大屏上依然能保留"光点"质感。
    if (size <= 1.2) {
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    } else {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, size * 1.4);
      grad.addColorStop(0, config.color);
      grad.addColorStop(0.35, config.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, size * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = config.color;
    }
  }
  ctx.globalAlpha = 1;

  return { config, sprite: canvas, width: w, height: h };
}

// ── 主模块 ────────────────────────────────────────────────────────────────

export interface StarfieldController {
  destroy(): void;
}

export function initStarfield(cy: cytoscape.Core): StarfieldController {
  const canvas = document.getElementById('starfield') as HTMLCanvasElement | null;
  if (!canvas) {
    return { destroy: () => {} };
  }
  // ts narrows `canvas` but `getContext` is non-null returning nullable;
  // we've already verified the element exists, so a missing 2d context
  // means the browser is broken — bail silently like the canvas-missing case.
  const ctxOrNull = canvas.getContext('2d');
  if (!ctxOrNull) {
    return { destroy: () => {} };
  }
  const ctx: CanvasRenderingContext2D = ctxOrNull;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let viewportW = window.innerWidth;
  let viewportH = window.innerHeight;
  let layers: StarLayer[] = [];

  // 帧调度：pan 触发时 schedule 一帧绘制，多个 pan 事件合并成一帧。
  // 不直接画——pan 可能一帧来 5+ 次，直接画会重复清屏。
  let pendingFrame = false;
  let lastPan = { x: 0, y: 0 };

  function render(): void {
    pendingFrame = false;
    if (layers.length === 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportW, viewportH);

    // sprite 中心对齐到视口中心——这样无论 pan 多少，sprite 都能覆盖视口。
    // 重要：每层独立计算偏移，所以近层视差大、远层视差小。
    const centerX = viewportW / 2 - layers[0].width / 2;
    const centerY = viewportH / 2 - layers[0].height / 2;

    for (const layer of layers) {
      const offsetX = centerX + lastPan.x * layer.config.parallax;
      const offsetY = centerY + lastPan.y * layer.config.parallax;
      ctx.drawImage(layer.sprite, offsetX, offsetY, layer.width, layer.height);
    }
  }

  function schedule(): void {
    if (pendingFrame) return;
    pendingFrame = true;
    requestAnimationFrame(render);
  }

  function rebuild(): void {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewportW = window.innerWidth;
    viewportH = window.innerHeight;
    canvas!.width = Math.round(viewportW * dpr);
    canvas!.height = Math.round(viewportH * dpr);
    canvas!.style.width = viewportW + 'px';
    canvas!.style.height = viewportH + 'px';
    layers = LAYERS.map((cfg) => buildLayer(cfg, viewportW, viewportH, dpr));
    schedule();
  }

  function onPan(): void {
    // cytoscape 的 cy.pan() 返回 { x, y }——当前视口左上角在 graph 坐标系
    // 里的位置。直接乘以视差因子就是背景应该偏移的 CSS 像素距离。
    // 这里用 cy.pan() 而不是参数 e，是因为 pan 事件高频触发，方法调用
    // 比读 event 对象字段更便宜。
    const p = cy.pan();
    lastPan = { x: p.x, y: p.y };
    schedule();
  }

  function onZoom(): void {
    // 缩放时近层星点视觉上应该更"散"——但完整透视成本高，
    // 折中方案：近层在 zoom 改变时重新生成 sprite，让它们重新排布。
    // 这是一次性开销，用户感知不到。
    rebuild();
  }

  function onResize(): void {
    rebuild();
  }

  rebuild();
  // 初始就把 pan 同步一次——如果用户已经平移过再加载（理论上不会，
  // 但 bigscreen 切换可能让 cy 残留旧 pan 值），保证背景跟着对齐
  onPan();

  cy.on('pan', onPan);
  cy.on('zoom', onZoom);
  window.addEventListener('resize', onResize);

  return {
    destroy(): void {
      cy.removeListener('pan', onPan);
      cy.removeListener('zoom', onZoom);
      window.removeEventListener('resize', onResize);
    },
  };
}
