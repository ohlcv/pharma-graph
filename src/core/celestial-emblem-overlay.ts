// src/core/celestial-emblem-node.ts
// 太极八卦：图谱里一个真实存在、参与力学模拟、却孤立无边的节点。
//
// 为什么是"真节点 + 覆盖层"而不是纯覆盖层：
//   - cytoscape 节点没法逐帧换贴图（没有这个设计用途，硬做会很卡），所以旋转
//     动画还是得靠一张独立 canvas 画。
//   - 但"它在哪、多大"直接问真实节点要：node.renderedPosition() 已经把
//     zoom/pan 都算进去了，跟其它节点是同一套换算。
//   - 孤立 = 不接任何边。不 lock()——让 euler 布局把它当成真实的力学参与者：
//     没有弹簧拉着它，只受全图所有节点的斥力，物理模拟会把它推向"最空旷的
//     方向"。每次真正重新跑一次 euler（首次加载 / 用户重置布局 / 切换布局
//     再切回来）它都可能落在不同地方——这比用公式算好一个"图谱外圈"更真实。
//   - 排除出"知识"：打上 `layer-parent` 这个 class——项目里已经在用的基础
//     设施，几十处 `.not('.layer-parent')`（搜索 / 统计 / 图例计数 / 漫游
//     序列 / dimUnhighlighted / force-drag 的手动拖拽模拟）会自动把它排除，
//     不需要改任何一处现有逻辑。注意这只影响"手动拖拽"的力学模拟
//     （force-drag.ts），不影响 renderer.ts 里 `this.cy.layout(...)` 触发的
//     euler 自动布局——那是对 `this.cy`（全部元素）跑的，layer-parent 节点
//     照样participate。layer-parent 的样式表规则本身透明 1×1、零边框，
//     cytoscape 原生也基本点不到它——天然满足"不需要聚焦字段"。
//
// ⚠️ 接入时机很重要：main.ts 的 initGraphFromManager() 末尾有一段"从中心
// 爆出"的入场动画，会遍历 cy.nodes()（不筛选 layer-parent）把每个节点摆到
// 一个 halo 环形位置上。必须在那段循环【之后】再调用这里的 spawn/创建覆盖层，
// 否则这个节点会被那段循环一起摆到 halo 位置，白算。同时又要赶在
// finishStreamingLayout() 触发第一次 euler 之【前】——这样它才能参与
// 首次物理模拟，而不是要等用户手动重新布局才第一次挪动。
// 也就是说：加在 initGraphFromManager() 函数体的最后几行（halo 循环之后、
// 函数返回之前）最合适。

import type cytoscape from 'cytoscape';

interface Trigram {
  name: string;
  /** 从下到上：index 0 = 最下面那一爻。1 = 阳爻（实线），0 = 阴爻（断开）。 */
  bits: readonly [number, number, number];
}

// 先天八卦：自乾顺时针。
const BAGUA: readonly Trigram[] = [
  { name: '乾', bits: [1, 1, 1] },
  { name: '巽', bits: [0, 1, 1] },
  { name: '坎', bits: [0, 1, 0] },
  { name: '艮', bits: [0, 0, 1] },
  { name: '坤', bits: [0, 0, 0] },
  { name: '震', bits: [1, 0, 0] },
  { name: '离', bits: [1, 0, 1] },
  { name: '兑', bits: [1, 1, 0] },
];

/** 图上这个节点固定用这个 id，找它/避免重复添加都靠它。 */
export const CELESTIAL_EMBLEM_ID = 'celestial-emblem';
/** 再单独打一个语义清晰的标记，方便一眼看出"这不是真的 layer-parent，
 *  是奇观节点借用了它的隐身效果"。 */
const EMBLEM_CLASS = 'celestial-emblem-node';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** 现有真实节点外接矩形的"跨度"——用来估算这个节点该多大、初始撒在多大范围里。 */
function graphSpread(cy: cytoscape.Core): { bb: { x1: number; y1: number; x2: number; y2: number }; spread: number } {
  let bb = { x1: -500, y1: -500, x2: 500, y2: 500 };
  try {
    const real = cy.nodes().not('.layer-parent').boundingBox();
    if (Number.isFinite(real.x1) && Number.isFinite(real.y1) && real.w > 0 && real.h > 0) bb = real;
  } catch {
    /* 图还没建好时 boundingBox() 可能抛错，用兜底范围 */
  }
  return { bb, spread: Math.max(bb.x2 - bb.x1, bb.y2 - bb.y1, 400) };
}

/** 视觉半径：图谱跨度的一个比例，夹在 [90, 220] 之间，图越大它越"敢"画大一点。 */
function pickRadius(cy: cytoscape.Core): number {
  return clamp(graphSpread(cy).spread * 0.045, 90, 220);
}

/**
 * 初始生成点：现有节点外接矩形内部随机一点，不刻意摆在边缘——
 * 因为不再 lock()，euler 的斥力自然会把它从"人群里"推到空旷处，
 * 初始位置只是给物理模拟一个起点，不必自己算好终点。
 */
function pickSpawnPoint(cy: cytoscape.Core): { x: number; y: number } {
  const { bb } = graphSpread(cy);
  return {
    x: bb.x1 + Math.random() * (bb.x2 - bb.x1),
    y: bb.y1 + Math.random() * (bb.y2 - bb.y1),
  };
}

/**
 * 往图里加这个孤立节点（如果已存在则直接复用）。不 lock()：交给 euler 的
 * 斥力物理去决定它最终落在哪——见文件头注释。
 */
export function spawnCelestialEmblemNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const existing = cy.getElementById(CELESTIAL_EMBLEM_ID);
  if (existing.nonempty()) return existing;

  const { x, y } = pickSpawnPoint(cy);
  return cy.add({
    group: 'nodes',
    data: { id: CELESTIAL_EMBLEM_ID, label: '太极八卦' },
    position: { x, y },
    // layer-parent：白嫖既有的"对知识图谱隐身"基础设施（见文件头注释）。
    // celestial-emblem-node：给这份复用留一个明确的标记，别跟真正的
    // layer-parent 用途混在一起看不出来。
    classes: `layer-parent ${EMBLEM_CLASS}`,
  });
}

export interface CelestialEmblemOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  ink?: string;
  glow?: string;
  taijiSpeed?: number;
  ringSpeed?: number;
  fps?: number;
}

export class CelestialEmblemOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly ink: string;
  private readonly glow: string;
  private readonly taijiSpeed: number;
  private readonly ringSpeed: number;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  private modelRadius = 140;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;
  private readonly twinklePhase: number[];

  private rafId: number | null = null;
  private startedAt = 0;
  private lastDrawAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  constructor(options: CelestialEmblemOverlayOptions) {
    this.cy = options.cy;
    this.ink = options.ink ?? '#f2ede0';
    this.glow = options.glow ?? 'rgba(217,72,63,0.5)';
    this.taijiSpeed = options.taijiSpeed ?? 0.02;
    this.ringSpeed = options.ringSpeed ?? -0.006;
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.twinklePhase = BAGUA.map(() => Math.random() * Math.PI * 2);

    spawnCelestialEmblemNode(this.cy);
    this.modelRadius = pickRadius(this.cy);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-celestial-emblem', '');
    Object.assign(this.canvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    // 不设 z-index：插到第一个子节点之前，排在 cytoscape 自己的画布（auto 层）
    // 后面画——在图谱"身后"的虚空里，不挡任何真实节点的点击视觉焦点。
    container.insertBefore(this.canvas, container.firstChild);

    this.ctx = this.canvas.getContext('2d');
    this.syncSize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(container);
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    this.start();
  }

  /** 直接传送到一个新的随机起点（不用刷新页面测试）；真正落脚点仍由下一次
   *  euler 物理模拟决定，这里只是换个出发点。 */
  reroll(): void {
    const node = this.cy.getElementById(CELESTIAL_EMBLEM_ID);
    if (node.empty()) return;
    const { x, y } = pickSpawnPoint(this.cy);
    node.position({ x, y });
    this.modelRadius = pickRadius(this.cy);
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
    const node = this.cy.getElementById(CELESTIAL_EMBLEM_ID);
    if (node.nonempty()) this.cy.remove(node);
  }

  private syncSize(): void {
    const container = this.canvas.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.cssWidth && h === this.cssHeight && dpr === this.dpr) return;
    this.cssWidth = w;
    this.cssHeight = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  private start(): void {
    if (this.rafId !== null) return;
    this.startedAt = performance.now();
    if (this.reducedMotion) { this.draw(0); return; }
    this.rafId = requestAnimationFrame(this.tick);
  }

  private pause(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  private resume(): void {
    if (this.rafId === null && !this.reducedMotion) this.rafId = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.rafId = requestAnimationFrame(this.tick);
    if (now - this.lastDrawAt < this.frameInterval) return;
    this.lastDrawAt = now;
    this.draw((now - this.startedAt) / 1000);
  };

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    const node = this.cy.getElementById(CELESTIAL_EMBLEM_ID);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    if (node.empty()) return; // 节点还没生成 / 被删了，这帧什么都不画

    // 直接问真实节点要渲染坐标——它已经把 zoom/pan 都算好了，
    // 跟其它节点是同一套换算，包括 euler 物理模拟移动它之后的最新位置。
    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    const rx = p.x, ry = p.y, r = this.modelRadius * zoom;

    const reach = r * 1.6 + 20;
    if (r < 1.5) return;
    if (rx + reach < 0 || rx - reach > this.cssWidth || ry + reach < 0 || ry - reach > this.cssHeight) return;

    const breathe = this.reducedMotion ? 1 : 1 + 0.035 * Math.sin(t * 0.5);
    const taijiR = r * 0.42;
    const ringR = r * 0.92;

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(breathe, breathe);

    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(242,237,224,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const ringAngle = t * this.ringSpeed * Math.PI * 2;
    BAGUA.forEach((g, i) => {
      const a = (i / BAGUA.length) * Math.PI * 2 - Math.PI / 2 + ringAngle;
      const x = Math.cos(a) * ringR, y = Math.sin(a) * ringR;
      const twinkle = this.reducedMotion ? 1 : 0.78 + 0.22 * Math.sin(t * 0.8 + this.twinklePhase[i]);
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = this.glow;
      ctx.shadowBlur = ringR * 0.06;
      this.drawTrigram(ctx, g.bits, ringR * 0.16, twinkle);
      ctx.restore();
    });

    ctx.save();
    ctx.rotate(t * this.taijiSpeed * Math.PI * 2);
    ctx.shadowColor = this.glow;
    ctx.shadowBlur = taijiR * 0.35;
    this.drawTaiji(ctx, taijiR);
    ctx.restore();

    ctx.restore();
  }

  private drawTaiji(ctx: CanvasRenderingContext2D, r: number): void {
    const light = this.ink, dark = 'rgba(5,5,5,0.92)';
    // 倒 S：阳（亮）在左，阴（暗）在右
    ctx.beginPath(); ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2);
    ctx.fillStyle = light; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.fillStyle = dark; ctx.fill();
    ctx.beginPath(); ctx.arc(0, r / 2, r / 2, 0, Math.PI * 2);
    ctx.fillStyle = light; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -r / 2, r / 2, 0, Math.PI * 2);
    ctx.fillStyle = dark; ctx.fill();
    ctx.beginPath(); ctx.arc(0, r / 2, r * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = dark; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -r / 2, r * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = light; ctx.fill();
    ctx.lineWidth = Math.max(0.6, r * 0.02);
    ctx.strokeStyle = light;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  }

  private drawTrigram(
    ctx: CanvasRenderingContext2D,
    bits: readonly [number, number, number],
    size: number,
    alpha: number,
  ): void {
    const barW = size, barH = size * 0.15, gap = size * 0.34, mid = barW * 0.2;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.ink;
    for (let i = 0; i < 3; i++) {
      const y = (1 - i) * gap - barH / 2;
      if (bits[i]) {
        ctx.fillRect(-barW / 2, y, barW, barH);
      } else {
        const half = (barW - mid) / 2;
        ctx.fillRect(-barW / 2, y, half, barH);
        ctx.fillRect(-barW / 2 + half + mid, y, half, barH);
      }
    }
    ctx.globalAlpha = 1;
  }
}

export function createCelestialEmblemOverlay(options: CelestialEmblemOverlayOptions): CelestialEmblemOverlay {
  return new CelestialEmblemOverlay(options);
}