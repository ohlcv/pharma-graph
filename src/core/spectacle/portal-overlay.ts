// src/core/spectacle/portal-overlay.ts
// 虫洞（portal-gate）：第五个装饰奇观，也是唯一带交互语义的装饰——
// 连接图谱中各个独立空间（药学宇宙 / 生存策略宇宙 / 奇观散点）的虫洞。
//
// 架构与另外四个奇观刻意平行而不是共享基类（同 taiji_bagua_overlay.ts 文件头的
// 理由）：虫洞的绘制循环（吸积盘 + 螺旋坠入粒子 + 事件视界）跟太极八卦的
// 文字环、超立方体的 4D 投影都没有可复用的公共部分，硬抽基类只会得到一个
// 互斥状态的上帝对象。各自的 canvas、各自的生命周期。
//
// 交互不在本文件：节点 tap 由 graph-events 拦截（PORTAL_ID 判定）后交给
// SpaceController 弹出空间菜单。这里只负责"虫洞长什么样"和"节点可点"。
//
// 视觉与性能优化设计：
//   1. 引力透镜背光拱弧（Gravitational Lensing Halo）：模拟卡冈图雅（Gargantua）
//      吸积盘背面光线被强引力弯曲到视界上下方的透镜光晕，赋予平面节点真实立体感。
//   2. 差速三温区吸积盘（Differential Multi-Thermal Disk）：
//      外盘冷紫 → 中盘星云蓝 → 内盘炽白青（ISCO 最内稳定圆轨道），不同角速度与
//      反向流转，按 3 个色温批次合并 Path，仅 3 次 stroke 调用。
//   3. 螺旋物质流尾迹（Keplerian Spiral Trails）：
//      粒子沿开普勒轨道加速坠落，采用二阶切向泰勒展开反推尾迹采样点（每粒子仅 1 次
//      sin/cos 计算），按外层冷紫与内层炽青分 2 批 stroke 合并绘制，比逐粒子 arc
//      圆点光栅化更快且具备丝滑流线感。
//   4. 零 shadowBlur + 渐变缓存 + 脏矩形局部擦除（Dirty-Rect Clear）：
//      彻底移除昂贵的 Canvas2D 高斯模糊（shadowBlur），改用按半径阈值缓存的多段径向
//      渐变；每帧仅擦除上一帧虫洞包围盒而非全屏画布，大幅降低高分屏 GPU 带宽占用。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

/** 图上这个节点固定用这个 id；内容节点 public/content/装饰奇观/虫洞.md 同名。 */
export const PORTAL_ID = 'portal-gate';
const PORTAL_CLASS = 'portal-node';

/** 吸积盘的透视压缩比（y:x）。0.36 ≈ 从盘面上方 ~21° 观察。 */
const DISK_SQUASH = 0.36;
/** 盘面相对水平的倾角（弧度）。 */
const DISK_TILT = -0.32;
/** 粒子数：配合二阶切向尾迹合并绘制，仅需 2 次批量 stroke 即可呈现高密度物质流。 */
const PARTICLE_COUNT = 44;

type Particle = {
  /** 轨道初始相位（弧度）。 */
  phase: number;
  /** 径向坠落速度（每秒寿命占比）。 */
  rate: number;
  /** 起始寿命偏移，让粒子初始就均匀散布在不同半径上。 */
  offset: number;
  /** 切向基础角速度（弧度/秒）。 */
  spin: number;
  /** 轨道微扰偏心率，打破机械同心感。 */
  wobble: number;
};

function graphSpread(cy: cytoscape.Core): {
  bb: { x1: number; y1: number; x2: number; y2: number };
  spread: number;
} {
  let bb = { x1: -500, y1: -500, x2: 500, y2: 500 };
  try {
    const real = cy.nodes().not('.layer-parent').boundingBox();
    if (Number.isFinite(real.x1) && Number.isFinite(real.y1) && real.w > 0 && real.h > 0) bb = real;
  } catch {
    /* 图还没建好时 boundingBox() 可能抛错，用兜底范围 */
  }
  return { bb, spread: Math.max(bb.x2 - bb.x1, bb.y2 - bb.y1, 400) };
}

/** 虫洞与其它四个奇观同尺寸（统一视觉半径）。 */
function pickRadius(cy: cytoscape.Core): number {
  return pickSpectacleParam(graphSpread(cy).spread, 'portal');
}

function hitboxSize(radius: number): number {
  return radius * 2 * 0.92;
}

/**
 * 抹掉 cytoscape 自身为这个节点画的所有可见 chrome（fill 的 defaultStroke、
 * 选中态边框等），只留一个透明的圆形命中盒。
 */
function stripNodeChrome(node: cytoscape.NodeSingular, size: number): void {
  node.data('stroke', '');
  node.data('defaultStroke', '');
  node.style({
    'background-color': 'rgba(0,0,0,0)',
    'background-opacity': 0,
    'background-fill': 'solid' as const,
    'background-blacken': 0,
    'background-gradient-stop-colors': '',
    'background-gradient-stop-positions': '',
    'background-gradient-direction': '',
    'border-width': 0,
    'border-color': 'rgba(0,0,0,0)',
    'border-opacity': 0,
    'border-style': 'solid' as cytoscape.Css.LineStyle,
    'overlay-color': 'rgba(0,0,0,0)',
    'overlay-opacity': 0,
    'overlay-shape': 'ellipse' as cytoscape.Css.NodeShape,
    'overlay-padding': 0,
    label: '',
    'text-opacity': 0,
    'text-events': 'no' as const,
    width: size,
    height: size,
    'min-width': 1,
    'min-height': 1,
    shape: 'ellipse' as cytoscape.Css.NodeShape,
    padding: 0,
    opacity: 0,
    // 不能 visibility:hidden——那会连 pointer 命中一起关掉，虫洞就点不开了。
  });
}

/**
 * 往图里放传送门节点（内容树里已有则复用——它本来就是一份 md）。
 */
export function spawnPortalNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(PORTAL_ID);
  if (existing.nonempty()) {
    existing.addClass(PORTAL_CLASS);
    stripNodeChrome(existing, size);
    return existing;
  }

  const { bb } = graphSpread(cy);
  const view = safeViewCenter(cy, bb);
  const node = cy.add({
    group: 'nodes',
    data: { id: PORTAL_ID, label: '虫洞' },
    position: view,
    classes: `layer-parent ${PORTAL_CLASS}`,
  });
  stripNodeChrome(node, size);
  void loadDecorContent(node);
  return node;
}

/**
 * 视口中心对应的模型坐标；图还没布局好时退回包围盒中心。
 */
function safeViewCenter(
  cy: cytoscape.Core,
  bb: { x1: number; y1: number; x2: number; y2: number },
): { x: number; y: number } {
  try {
    const zoom = cy.zoom();
    const pan = cy.pan();
    if (zoom > 0 && Number.isFinite(pan.x) && Number.isFinite(pan.y)) {
      const c = {
        x: (cy.width() / 2 - pan.x) / zoom,
        y: (cy.height() / 2 - pan.y) / zoom,
      };
      const inBounds =
        c.x >= bb.x1 - 500 && c.x <= bb.x2 + 500 && c.y >= bb.y1 - 500 && c.y <= bb.y2 + 500;
      if (inBounds) return c;
    }
  } catch {
    /* 极早期 width/height 还没算出来 */
  }
  return { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 };
}

export interface PortalOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  fps?: number;
}

export class PortalOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;
  private readonly particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, idx) => ({
    // 使用黄金角分层打散初始相位，避免随机成团
    phase: ((idx * 2.399963229728653) % (Math.PI * 2)) + (Math.random() - 0.5) * 0.25,
    rate: 0.085 + Math.random() * 0.14,
    offset: (idx + Math.random() * 0.8) / PARTICLE_COUNT,
    spin: 0.65 + Math.random() * 0.85,
    wobble: (Math.random() - 0.5) * 0.06,
  }));

  private portalNode: cytoscape.NodeSingular | null = null;
  private modelRadius = 140;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  // 脏矩形记录：仅清除上一帧绘制区域，避免全屏 clearRect 带宽浪费
  private dirtyX = 0;
  private dirtyY = 0;
  private dirtyR = 0;
  private hasDirty = false;

  // 渐变对象缓存：当渲染半径 R 未发生显著缩放时零 GC 分配复用
  private cachedGradR = -1;
  private ambientGlowGrad: CanvasGradient | null = null;
  private diskGlowGrad: CanvasGradient | null = null;
  private horizonGrad: CanvasGradient | null = null;

  private rafId: number | null = null;
  private startedAt = 0;
  private lastDrawAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  constructor(options: PortalOverlayOptions) {
    this.cy = options.cy;
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.portalNode = spawnPortalNode(this.cy);
    this.modelRadius = pickRadius(this.cy);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-portal-overlay', '');
    Object.assign(this.canvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    container.insertBefore(this.canvas, container.firstChild);

    this.ctx = this.canvas.getContext('2d');
    this.syncSize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.syncSize();
        if (this.reducedMotion) this.draw(0);
      });
      this.resizeObserver.observe(container);
    }
    document.addEventListener('visibilitychange', this.onVisibility);

    if (this.reducedMotion) {
      this.draw(0);
    } else {
      this.start();
    }
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
    const node = this.getPortalNode();
    if (node && node.nonempty() && node.hasClass(PORTAL_CLASS) && node.hasClass('layer-parent')) {
      this.cy.remove(node);
    }
    this.portalNode = null;
  }

  private getPortalNode(): cytoscape.NodeSingular | null {
    if (this.portalNode && this.portalNode.nonempty() && !this.portalNode.removed()) {
      return this.portalNode;
    }
    const found = this.cy.getElementById(PORTAL_ID);
    this.portalNode = found.nonempty() ? found : null;
    return this.portalNode;
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
    this.hasDirty = false;
  }

  private start(): void {
    this.startedAt = performance.now();
    this.lastDrawAt = 0;
    this.pause();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
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

  /**
   * 按半径 R 懒更新径向渐变缓存；缩放不变时完全零对象分配。
   */
  private ensureGradients(ctx: CanvasRenderingContext2D, R: number): void {
    if (
      Math.abs(R - this.cachedGradR) < 0.75 &&
      this.ambientGlowGrad &&
      this.diskGlowGrad &&
      this.horizonGrad
    ) {
      return;
    }
    this.cachedGradR = R;
    const coreR = R * 0.22;

    // 1. 远场引力深空辉光（替代高开销的 shadowBlur）
    const amb = ctx.createRadialGradient(0, 0, coreR * 0.7, 0, 0, R * 1.15);
    amb.addColorStop(0, 'rgba(125, 211, 252, 0.26)');
    amb.addColorStop(0.28, 'rgba(139, 92, 246, 0.22)');
    amb.addColorStop(0.62, 'rgba(91, 33, 182, 0.08)');
    amb.addColorStop(1, 'rgba(15, 10, 35, 0)');
    this.ambientGlowGrad = amb;

    // 2. 吸积盘连续流体基底雾（在椭圆压缩坐标系内绘制，呈现内热青白→外冷紫连续过渡）
    const disk = ctx.createRadialGradient(0, 0, R * 0.22, 0, 0, R * 1.04);
    disk.addColorStop(0, 'rgba(56, 189, 248, 0)');
    disk.addColorStop(0.12, 'rgba(186, 230, 253, 0.28)');
    disk.addColorStop(0.35, 'rgba(129, 140, 248, 0.18)');
    disk.addColorStop(0.72, 'rgba(168, 85, 247, 0.09)');
    disk.addColorStop(1, 'rgba(88, 28, 135, 0)');
    this.diskGlowGrad = disk;

    // 3. 事件视界深渊暗核 + 边缘霍金辐射紫晕（一次 fill 完成暗核与外溢辉光）
    const hor = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 1.38);
    hor.addColorStop(0, '#020107');
    hor.addColorStop(0.54, '#070312');
    hor.addColorStop(0.69, '#120726');
    hor.addColorStop(0.73, 'rgba(167, 139, 250, 0.48)');
    hor.addColorStop(0.84, 'rgba(125, 211, 252, 0.16)');
    hor.addColorStop(1, 'rgba(125, 211, 252, 0)');
    this.horizonGrad = hor;
  }

  // ── 绘制 ──────────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 仅清除上一帧留下的脏矩形区域
    if (this.hasDirty) {
      const pad = 4;
      const x0 = Math.max(0, Math.floor(this.dirtyX - this.dirtyR - pad));
      const y0 = Math.max(0, Math.floor(this.dirtyY - this.dirtyR - pad));
      const x1 = Math.min(this.cssWidth, Math.ceil(this.dirtyX + this.dirtyR + pad));
      const y1 = Math.min(this.cssHeight, Math.ceil(this.dirtyY + this.dirtyR + pad));
      if (x1 > x0 && y1 > y0) {
        ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
      }
      this.hasDirty = false;
    }

    const node = this.getPortalNode();
    if (!node || !isElementShown(node)) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    const R = Math.max(this.modelRadius * zoom, 6);
    const rx = p.x;
    const ry = p.y;

    const reach = R * 1.25 + 16;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    ) {
      return;
    }

    this.dirtyX = rx;
    this.dirtyY = ry;
    this.dirtyR = reach;
    this.hasDirty = true;

    this.ensureGradients(ctx, R);
    const coreR = R * 0.22;
    const pulse = 1 + 0.025 * Math.sin(t * 2.1);

    ctx.save();
    ctx.translate(rx, ry);

    // ── 1. 远场引力辉光基底（零 shadowBlur）─────────────────────────────
    if (this.ambientGlowGrad) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = this.ambientGlowGrad;
      ctx.fill();
    }

    // ── 2. 引力透镜背光拱弧（Gargantua 上下弯曲吸积盘像）────────────────
    // 模拟盘面后方光线被黑洞引力偏折后在视界上下方形成的对称透镜光弧
    ctx.save();
    ctx.rotate(DISK_TILT);
    const lensR = coreR * 1.48 * pulse;
    ctx.beginPath();
    // 上拱弧与下拱弧合并为单次 stroke
    ctx.arc(0, 0, lensR, -Math.PI * 0.82, -Math.PI * 0.18);
    ctx.moveTo(Math.cos(Math.PI * 0.18) * lensR, Math.sin(Math.PI * 0.18) * lensR);
    ctx.arc(0, 0, lensR, Math.PI * 0.18, Math.PI * 0.82);
    ctx.strokeStyle = 'rgba(165, 225, 255, 0.28)';
    ctx.lineWidth = Math.max(1.1, R * 0.022);
    ctx.stroke();

    // ── 3. 吸积盘：连续流体底雾 + 3 温区差速旋转环 ───────────────────────
    ctx.scale(1, DISK_SQUASH);

    // 3.1 吸积盘连续流体雾带
    if (this.diskGlowGrad) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.04, 0, Math.PI * 2);
      ctx.fillStyle = this.diskGlowGrad;
      ctx.fill();
    }

    // 3.2 外盘冷紫带（i = 3, 4）：慢速顺时针 + 最外缘收口柔环
    ctx.setLineDash([R * 0.22, R * 0.12]);
    ctx.lineDashOffset = -t * 0.075 * R;
    ctx.beginPath();
    for (let i = 3; i < 5; i++) {
      const rr = R * (0.31 + i * 0.155);
      ctx.moveTo(rr, 0);
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
    }
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.24)';
    ctx.lineWidth = Math.max(1, R * 0.014);
    ctx.stroke();

    // 3.3 中盘星云靛蓝带（i = 1, 2）：差速反向流转，制造剪切湍流层次
    ctx.setLineDash([R * 0.15, R * 0.095]);
    ctx.lineDashOffset = t * 0.13 * R;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const rr = R * (0.31 + i * 0.155);
      ctx.moveTo(rr, 0);
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
    }
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.36)';
    ctx.lineWidth = Math.max(1.1, R * 0.015);
    ctx.stroke();

    // 3.4 内盘炽白青高速光子带（i = 0 + 内侧紧贴环）：高角速度掠过视界外缘
    ctx.setLineDash([R * 0.11, R * 0.07]);
    ctx.lineDashOffset = -t * 0.24 * R;
    ctx.beginPath();
    const rInner0 = R * 0.27;
    const rInner1 = R * 0.34;
    ctx.moveTo(rInner0, 0);
    ctx.arc(0, 0, rInner0, 0, Math.PI * 2);
    ctx.moveTo(rInner1, 0);
    ctx.arc(0, 0, rInner1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(186, 238, 255, 0.62)';
    ctx.lineWidth = Math.max(1.2, R * 0.016);
    ctx.stroke();

    ctx.setLineDash([]);

    // ── 4. 螺旋坠落物质流（二阶切向展开尾迹，2 批次合并 stroke）─────────
    // 相比逐粒子画圆（42 次完整圆弧光栅化），线段尾迹每粒子仅 3 个顶点，
    // 且只调用 1 次 cos/sin，用切向展开算尾迹点，速度更快且具真实吸入动感。
    ctx.lineCap = 'round';

    // 批次 A：外围冷紫螺旋粒子尾迹（uNow < 0.56）
    ctx.beginPath();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const pt = this.particles[i];
      const uNow = (t * pt.rate + pt.offset) % 1;
      if (uNow >= 0.56) continue;

      // 越靠近中心角速度越快（开普勒加速）
      const angNow = pt.phase + t * pt.spin * (1.15 + uNow * 1.1);
      const rrNow = R * (0.25 + (1 - uNow) * 0.74) * (1 + pt.wobble * Math.sin(angNow * 2));
      const c = Math.cos(angNow);
      const s = Math.sin(angNow);

      const x0 = c * rrNow;
      const y0 = s * rrNow;

      // 沿轨道反方向推算尾迹角跨度 dAng 与半径外扩
      const dAng = 0.14 + uNow * 0.16;
      const rrMid = rrNow * 1.025;
      const rrTail = rrNow * 1.052;

      // 二阶泰勒近似 cos(ang - dAng), sin(ang - dAng)
      const hAng = dAng * 0.5;
      const c1 = c + s * hAng - 0.5 * c * hAng * hAng;
      const s1 = s - c * hAng - 0.5 * s * hAng * hAng;
      const c2 = c + s * dAng - 0.5 * c * dAng * dAng;
      const s2 = s - c * dAng - 0.5 * s * dAng * dAng;

      ctx.moveTo(c2 * rrTail, s2 * rrTail);
      ctx.lineTo(c1 * rrMid, s1 * rrMid);
      ctx.lineTo(x0, y0);
    }
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.46)';
    ctx.lineWidth = Math.max(1.1, R * 0.015);
    ctx.stroke();

    // 批次 B：内圈高能青白螺旋尾迹（uNow >= 0.56）
    ctx.beginPath();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const pt = this.particles[i];
      const uNow = (t * pt.rate + pt.offset) % 1;
      if (uNow < 0.56) continue;

      const angNow = pt.phase + t * pt.spin * (1.15 + uNow * 1.1);
      const rrNow = R * (0.24 + (1 - uNow) * 0.74);
      const c = Math.cos(angNow);
      const s = Math.sin(angNow);

      const x0 = c * rrNow;
      const y0 = s * rrNow;

      const dAng = 0.22 + (uNow - 0.5) * 0.28;
      const hAng = dAng * 0.5;
      const rrMid = rrNow * 1.032;
      const rrTail = rrNow * 1.068;

      const c1 = c + s * hAng - 0.5 * c * hAng * hAng;
      const s1 = s - c * hAng - 0.5 * s * hAng * hAng;
      const c2 = c + s * dAng - 0.5 * c * dAng * dAng;
      const s2 = s - c * dAng - 0.5 * s * dAng * dAng;

      ctx.moveTo(c2 * rrTail, s2 * rrTail);
      ctx.lineTo(c1 * rrMid, s1 * rrMid);
      ctx.lineTo(x0, y0);
    }
    ctx.strokeStyle = 'rgba(207, 250, 254, 0.82)';
    ctx.lineWidth = Math.max(1.3, R * 0.019);
    ctx.stroke();

    ctx.restore(); // 退出盘面透视缩放坐标系

    // ── 5. 事件视界暗核 + 爱因斯坦光子环 + 前景遮挡立体叠层 ─────────────
    // 5.1 外圈引力透镜爱因斯坦环（细亮青环）
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 1.38 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.36)';
    ctx.lineWidth = Math.max(0.7, R * 0.0065);
    ctx.stroke();

    // 5.2 事件视界暗核与边缘辐射晕（单次缓存径向渐变 fill，零 shadowBlur）
    if (this.horizonGrad) {
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 1.38, 0, Math.PI * 2);
      ctx.fillStyle = this.horizonGrad;
      ctx.fill();
    }

    // 5.3 视界光子环（Photon Ring）：基础亮紫环 + 多普勒增亮青白月牙锋面
    ctx.beginPath();
    ctx.arc(0, 0, coreR * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.78)';
    ctx.lineWidth = Math.max(1.1, R * 0.011);
    ctx.stroke();

    // 多普勒相对论增亮弧（模拟朝向观察者旋转一侧的光子堆积增亮）
    const dopplerAngle = DISK_TILT + Math.PI * 0.65 + Math.sin(t * 1.3) * 0.18;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * pulse, dopplerAngle - 0.85, dopplerAngle + 0.85);
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.95)';
    ctx.lineWidth = Math.max(1.4, R * 0.015);
    ctx.stroke();

    // 5.4 前景吸积盘掠过视界前方的透视交叠亮丝（打破"黑球浮在盘面之上"的扁平贴图感）
    ctx.save();
    ctx.rotate(DISK_TILT);
    ctx.scale(1, DISK_SQUASH);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.285, 0.12, Math.PI - 0.12);
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.52)';
    ctx.lineWidth = Math.max(1.2, R * 0.018);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
}

export function createPortalOverlay(options: PortalOverlayOptions): PortalOverlay {
  return new PortalOverlay(options);
}