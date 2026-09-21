// src/ui/starfield.ts
// 背景星点层 — 3 层视差 + 无限平铺 + DPR 自适应
//
// 设计目标：给深色背景加"宇宙纵深"——平移图谱时近层星点错位明显、远层
// 几乎不动，模拟视差。星云光晕（layout.css 的 #app::after）和噪点层
// （body 上的 .noise-overlay）一起负责剩下的氛围。
//
// 实现：每层预渲染一张 **tile**（固定尺寸的小 canvas），平移时按
// `pan × 视差系数` 取模后平铺到主 canvas 上。
//   - 无限平移：取模回绕，星点永远不会"走出"边界（旧实现是一张 1.5 倍视口的
//     大 sprite，近层平移约 0.55 个视口宽度就会露出空白）。
//   - 内存与视口无关：tile 尺寸固定（每层 ≤ 1024 css px），dpr=2 时三层合计
//     约 40MB，而不是随视口 × 1.5² × dpr² 增长（2560×1440 的屏幕原先会超过
//     iOS Safari 单张 canvas 约 1677 万像素的上限）。
//   - zoom / resize 不再重建 tile：星点种子固定，重建出来的位置完全一样，
//     纯属浪费。tile 只在 devicePixelRatio 变化时重建。
//   - 三层 tile 尺寸互不相同（896 / 768 / 1024），周期不同，叠在一起看不出网格感。
//
// 性能：
//   - 闲置时 0 占用，只有 pan/zoom/resize 时用 rAF 合并成一帧重画。
//   - 每帧最多约 3 × (4×3) 次 drawImage，全部按整数设备像素对齐，没有接缝。
//
// 视差因子（视差 = 镜头移动 × 因子）：远景 0.10 / 中景 0.22 / 近景 0.45。
// zoom 不参与视差（完整透视成本不值）；但 cytoscape 缩放时 pan 也会变，
// 所以星点会随缩放中心自然漂移。

import type cytoscape from 'cytoscape';

// ── Seeded RNG（mulberry32）───────────────────────────────────────────────
//
// 用种子而不是 Math.random()：刷新后星点位置稳定，且可复现。
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
  /** tile 边长（CSS px）。三层刻意取不同值，避免周期重合。 */
  tile: number;
  /** 每张 tile 里的星点数量（密度 = stars / tile²，与视口大小无关） */
  stars: number;
  /** 星点尺寸范围（CSS px） */
  sizeRange: [number, number];
  /** 不透明度范围 */
  alphaRange: [number, number];
  /** 颜色——越远的层越暗 */
  color: string;
  /** 用于生成位置 RNG 的 seed 偏移 */
  seedOffset: number;
}

const LAYERS: readonly StarLayerConfig[] = [
  { parallax: 0.10, tile: 896,  stars: 21, sizeRange: [0.6, 1.2], alphaRange: [0.35, 0.55], color: '#cbd5e1', seedOffset: 1 },  // 远：冷灰白
  { parallax: 0.22, tile: 768,  stars: 20, sizeRange: [0.9, 1.8], alphaRange: [0.45, 0.70], color: '#e2e8f0', seedOffset: 2 },  // 中：稍亮
  { parallax: 0.45, tile: 1024, stars: 20, sizeRange: [1.4, 2.6], alphaRange: [0.55, 0.85], color: '#f8fafc', seedOffset: 3 },  // 近：近白
] as const;

// ── 单层 tile ─────────────────────────────────────────────────────────────

interface StarLayer {
  config: StarLayerConfig;
  /** tile 画布，尺寸为整数设备像素 */
  tile: HTMLCanvasElement;
  /** tile 的设备像素边长（= tile.width = tile.height） */
  tilePx: number;
}

/** 一颗星的绘制半径（含径向渐变的柔边），用来判断是否跨越 tile 边界。 */
function starReach(size: number): number {
  return size <= 1.2 ? size / 2 : size * 1.4;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
  color: string,
): void {
  ctx.globalAlpha = alpha;
  // 1.2px 以下用方块；更大的用径向渐变模拟柔边光点。
  if (size <= 1.2) {
    ctx.fillStyle = color;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    return;
  }
  const grad = ctx.createRadialGradient(x, y, 0, x, y, size * 1.4);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, size * 1.4, 0, Math.PI * 2);
  ctx.fill();
}

function buildLayer(config: StarLayerConfig, dpr: number): StarLayer {
  // tile 边长取整到设备像素，后面平铺按整数像素对齐，接缝为零。
  const tilePx = Math.max(1, Math.round(config.tile * dpr));
  const tileCss = tilePx / dpr; // 取整之后的真实 CSS 边长，回绕计算用它

  const canvas = document.createElement('canvas');
  canvas.width = tilePx;
  canvas.height = tilePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { config, tile: canvas, tilePx };
  ctx.scale(dpr, dpr);

  const rng = mulberry32(0x517a + config.seedOffset);
  for (let i = 0; i < config.stars; i++) {
    const size = config.sizeRange[0] + rng() * (config.sizeRange[1] - config.sizeRange[0]);
    const alpha = config.alphaRange[0] + rng() * (config.alphaRange[1] - config.alphaRange[0]);
    const x = rng() * tileCss;
    const y = rng() * tileCss;
    const reach = starReach(size);

    // 靠近边缘的星点在对侧也补画一份（3×3 邻域），平铺后才无缝。
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cx = x + dx * tileCss;
        const cy = y + dy * tileCss;
        if (cx < -reach || cx > tileCss + reach || cy < -reach || cy > tileCss + reach) continue;
        drawStar(ctx, cx, cy, size, alpha, config.color);
      }
    }
  }
  ctx.globalAlpha = 1;

  return { config, tile: canvas, tilePx };
}

/** 永远返回 [0, m) 的取模（JS 的 % 对负数会返回负值）。 */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

// ── 主模块 ────────────────────────────────────────────────────────────────

export interface StarfieldController {
  destroy(): void;
}

// 同一个 canvas 只允许有一个实例；重复调用 initStarfield 会先销毁旧的，
// 避免两份 pan/resize 监听同时往同一块画布上画。
let active: StarfieldController | null = null;

export function initStarfield(cy: cytoscape.Core): StarfieldController {
  active?.destroy();
  active = null;

  const canvas = document.getElementById('starfield') as HTMLCanvasElement | null;
  if (!canvas) return { destroy: () => {} };
  const ctxOrNull = canvas.getContext('2d');
  if (!ctxOrNull) return { destroy: () => {} };
  const ctx: CanvasRenderingContext2D = ctxOrNull;

  // 没有定位样式时，canvas 会按文档流占位，还会把内容往下顶一个视口高度。
  // 宁可不启用，也别把布局弄坏——提示一下缺的是哪条规则。
  if (getComputedStyle(canvas).position === 'static') {
    console.warn(
      '[starfield] #starfield has no positioning CSS (expected position:fixed; inset:0; ' +
        'pointer-events:none) — starfield disabled.',
    );
    return { destroy: () => {} };
  }

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let viewportW = 0;
  let viewportH = 0;
  let layers: StarLayer[] = [];

  // 帧调度：pan 事件一帧内可能来很多次，合并成一次绘制。
  let rafId = 0;
  let lastPan = { x: 0, y: 0 };

  function render(): void {
    rafId = 0;
    if (layers.length === 0) return;

    // 全程在设备像素坐标系里画：tile 与偏移都是整数，不会产生亚像素接缝。
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas!.width, canvas!.height);

    const W = canvas!.width;
    const H = canvas!.height;
    for (const layer of layers) {
      const { tile, tilePx, config } = layer;
      const ox = mod(Math.round(lastPan.x * config.parallax * dpr), tilePx);
      const oy = mod(Math.round(lastPan.y * config.parallax * dpr), tilePx);
      for (let x = ox - tilePx; x < W; x += tilePx) {
        for (let y = oy - tilePx; y < H; y += tilePx) {
          ctx.drawImage(tile, x, y);
        }
      }
    }
  }

  function schedule(): void {
    if (rafId) return;
    rafId = requestAnimationFrame(render);
  }

  function buildTiles(): void {
    layers = LAYERS.map((cfg) => buildLayer(cfg, dpr));
  }

  /** 让主 canvas 的像素尺寸跟上视口。改 width/height 会清空画布，所以随后立即同步重画。 */
  function sizeCanvas(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    const dprChanged = nextDpr !== dpr;
    if (!dprChanged && w === viewportW && h === viewportH) return;

    dpr = nextDpr;
    viewportW = w;
    viewportH = h;
    canvas!.width = Math.round(w * dpr);
    canvas!.height = Math.round(h * dpr);
    canvas!.style.width = w + 'px';
    canvas!.style.height = h + 'px';
    if (dprChanged || layers.length === 0) buildTiles();

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    render(); // 同步重画，避免 resize 后闪一帧空白
  }

  function onPan(): void {
    // cy.pan() 是当前的渲染平移量（px）。视差偏移 = 平移量 × 因子。
    // pan 事件高频触发，用方法调用比读事件对象更省。
    const p = cy.pan();
    lastPan = { x: p.x, y: p.y };
    schedule();
  }

  sizeCanvas();
  // 初始同步一次 pan——bigscreen 切换等场景下 cy 可能带着旧的 pan 值。
  onPan();

  // zoom 会同时改变 pan，这里两个都听；onPan 只是记录数值 + 合并一帧，几乎零成本。
  cy.on('pan zoom', onPan);
  window.addEventListener('resize', sizeCanvas);

  const controller: StarfieldController = {
    destroy(): void {
      cy.removeListener('pan zoom', onPan);
      window.removeEventListener('resize', sizeCanvas);
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      layers = [];
      if (active === controller) active = null;
    },
  };
  active = controller;
  return controller;
}
