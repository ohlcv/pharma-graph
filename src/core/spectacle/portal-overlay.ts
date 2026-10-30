// src/core/spectacle/portal-overlay.ts
// 卡冈图雅（portal-gate）：第五个装饰奇观，也是唯一带交互语义的装饰——
// 连接图谱中各个独立空间（药学宇宙 / 生存策略宇宙 / 奇观散点）的跨宇宙奇点。
//
// 架构与另外五个奇观刻意平行而不是共享基类：卡冈图雅的绘制循环（引力透镜上下拱弧 +
// 相对论多普勒蓝移/红移吸积盘 + 开普勒差速螺旋尾迹 + 事件视界阴影）与其它奇观
// 没有可复用的公共部分，各自的 canvas、各自的生命周期。
//
// 交互不在本文件：节点 tap 由 graph-events 拦截（PORTAL_ID 判定）后交给
// SpaceController 弹出空间菜单。这里只负责"卡冈图雅长什么样"和"节点可点"。
//
// 视觉与相对论天体物理设计（Gargantua + Relativistic Doppler Shift）：
//   1. 修正三维前后图层遮挡顺序（解决黑洞被压扁、被盘面虚线遮挡的问题）：
//      - 根因：上一版把"事件视界暗核 + 光子环"放在了"主吸积盘与螺旋粒子"【之前】绘制；
//        由于主吸积盘处于 `scale(1, DISK_SQUASH = 0.34)` 的纵向压缩坐标系中，它的内孔纵向
//        半径只有 `0.34 * coreR`，后画的吸积盘雾气、虚线椭圆环与粒子尾迹直接盖在了正圆形
//        黑洞暗核脸上，把圆黑洞遮得只剩中间一条扁黑缝！
//      - 修正：严格遵循【远场辉光 → 上下引力透镜拱弧 → 吸积盘流体与差速环 → 螺旋坠入粒子 →
//        正圆形事件视界深渊暗核 + 多普勒光子环 → 前景赤道掠射亮丝】的图层顺序。所有向内坠落
//        的盘面环流与粒子尾迹自然隐入正圆形视界暗核背后，黑洞核心完整深邃、绝不被遮挡。
//   2. 相对论多普勒频移与集束效应（Relativistic Doppler Blueshift & Redshift）：
//      - 迎面侧（左，x < 0）：光子频率升高产生强烈【蓝移】（冰青白 → 电光蓝），且多普勒集束
//        效应使其显著增亮；
//      - 背离侧（右，x > 0）：光子频率降低产生显著【红移】（暖金 → 琥珀橘 → 深绯红）。
//   3. 零 shadowBlur + 渐变缓存 + 全画布 GPU 快速清屏：
//      所有径向与多普勒线性渐变按渲染半径 R 懒缓存，每帧零 GC 分配；采用全画布 clearRect
//      彻底杜绝快速平移与缩放手势下的边缘残影。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

/** 图上这个节点固定用这个 id；内容节点 public/content/装饰奇观/卡冈图雅.md 同名。 */
export const PORTAL_ID = 'portal-gate';
const PORTAL_CLASS = 'portal-node';

/** 吸积盘的透视压缩比（y:x）。0.34 ≈ 从盘面上方 ~20° 掠射观察卡冈图雅。 */
const DISK_SQUASH = 0.34;
/** 盘面相对水平的倾角（弧度）。 */
const DISK_TILT = -0.28;
/** 粒子数：按蓝移侧与红移侧分 2 批批量 stroke 呈现相对论物质流。 */
const PARTICLE_COUNT = 48;

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

/** 卡冈图雅与其它五个奇观同尺寸（统一视觉半径）。 */
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
    // 不能 visibility:hidden——那会连 pointer 命中一起关掉，卡冈图雅就点不开了。
  });
}

/**
 * 往图里放卡冈图雅节点（内容树里已有则复用——它本来就是一份 md）。
 */
export function spawnPortalNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(PORTAL_ID);
  if (existing.nonempty()) {
    existing.data('label', '卡冈图雅');
    existing.addClass(PORTAL_CLASS);
    stripNodeChrome(existing, size);
    return existing;
  }

  const { bb } = graphSpread(cy);
  const view = safeViewCenter(cy, bb);
  const node = cy.add({
    group: 'nodes',
    data: { id: PORTAL_ID, label: '卡冈图雅' },
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
    // 黄金角分层打散初始相位
    phase: ((idx * 2.399963229728653) % (Math.PI * 2)) + (Math.random() - 0.5) * 0.22,
    rate: 0.085 + Math.random() * 0.14,
    offset: (idx + Math.random() * 0.8) / PARTICLE_COUNT,
    spin: 0.72 + Math.random() * 0.88,
    wobble: (Math.random() - 0.5) * 0.05,
  }));

  private portalNode: cytoscape.NodeSingular | null = null;
  private modelRadius = 140;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  // 渐变对象缓存：当渲染半径 R 未发生显著缩放时零 GC 分配复用
  private cachedGradR = -1;
  private ambientGlowGrad: CanvasGradient | null = null;
  private dopplerFluidGrad: CanvasGradient | null = null;
  private dopplerOuterStrokeGrad: CanvasGradient | null = null;
  private dopplerInnerStrokeGrad: CanvasGradient | null = null;
  private dopplerLensGrad: CanvasGradient | null = null;
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
   * 按半径 R 懒更新径向与多普勒线性渐变缓存；缩放不变时完全零对象分配。
   */
  private ensureGradients(ctx: CanvasRenderingContext2D, R: number): void {
    if (
      Math.abs(R - this.cachedGradR) < 0.75 &&
      this.ambientGlowGrad &&
      this.dopplerFluidGrad &&
      this.dopplerOuterStrokeGrad &&
      this.dopplerInnerStrokeGrad &&
      this.dopplerLensGrad &&
      this.horizonGrad
    ) {
      return;
    }
    this.cachedGradR = R;
    const coreR = R * 0.23;

    // 1. 远场引力辉光基底
    const amb = ctx.createRadialGradient(0, 0, coreR * 0.65, 0, 0, R * 1.18);
    amb.addColorStop(0, 'rgba(254, 243, 199, 0.22)');
    amb.addColorStop(0.26, 'rgba(56, 189, 248, 0.14)');
    amb.addColorStop(0.55, 'rgba(234, 88, 12, 0.11)');
    amb.addColorStop(1, 'rgba(15, 10, 25, 0)');
    this.ambientGlowGrad = amb;

    // 2. 吸积盘流体底雾的多普勒水平渐变（左迎面强烈蓝移增亮 → 中央暖金白 → 右背离深红移暗化）
    const fluid = ctx.createLinearGradient(-R * 1.02, 0, R * 1.02, 0);
    fluid.addColorStop(0, 'rgba(14, 165, 233, 0)');
    fluid.addColorStop(0.14, 'rgba(56, 189, 248, 0.34)'); // 迎面外侧：高能电光蓝
    fluid.addColorStop(0.32, 'rgba(224, 242, 254, 0.46)'); // 迎面内侧：多普勒集束炽青白
    fluid.addColorStop(0.5, 'rgba(254, 243, 199, 0.28)'); // 中央正切：本征暖金白
    fluid.addColorStop(0.68, 'rgba(251, 146, 60, 0.26)'); // 背离内侧：红移琥珀橘
    fluid.addColorStop(0.86, 'rgba(220, 38, 38, 0.16)'); // 背离外侧：深红移绯红
    fluid.addColorStop(1, 'rgba(127, 29, 29, 0)');
    this.dopplerFluidGrad = fluid;

    // 3. 外中盘环流的多普勒描边渐变（左蓝青 → 中金 → 右赤红）
    const outerStroke = ctx.createLinearGradient(-R * 0.95, 0, R * 0.95, 0);
    outerStroke.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
    outerStroke.addColorStop(0.28, 'rgba(186, 230, 253, 0.72)');
    outerStroke.addColorStop(0.5, 'rgba(253, 230, 138, 0.52)');
    outerStroke.addColorStop(0.72, 'rgba(249, 115, 22, 0.46)');
    outerStroke.addColorStop(1, 'rgba(185, 28, 28, 0.28)');
    this.dopplerOuterStrokeGrad = outerStroke;

    // 4. 内盘 ISCO（最内稳定圆轨道）高速光子流多普勒渐变（极亮蓝白 → 暖金 → 绯红）
    const innerStroke = ctx.createLinearGradient(-R * 0.48, 0, R * 0.48, 0);
    innerStroke.addColorStop(0, 'rgba(125, 211, 252, 0.95)');
    innerStroke.addColorStop(0.3, 'rgba(240, 249, 255, 0.98)');
    innerStroke.addColorStop(0.52, 'rgba(254, 240, 138, 0.85)');
    innerStroke.addColorStop(0.76, 'rgba(249, 115, 22, 0.72)');
    innerStroke.addColorStop(1, 'rgba(220, 38, 38, 0.52)');
    this.dopplerInnerStrokeGrad = innerStroke;

    // 5. 上下引力透镜背光拱弧的多普勒渐变
    const lens = ctx.createLinearGradient(-coreR * 1.6, 0, coreR * 1.6, 0);
    lens.addColorStop(0, 'rgba(56, 189, 248, 0.78)');
    lens.addColorStop(0.36, 'rgba(224, 242, 254, 0.85)');
    lens.addColorStop(0.55, 'rgba(254, 243, 199, 0.68)');
    lens.addColorStop(0.78, 'rgba(251, 146, 60, 0.55)');
    lens.addColorStop(1, 'rgba(220, 38, 38, 0.36)');
    this.dopplerLensGrad = lens;

    // 6. 事件视界深渊暗核（0 ~ coreR 保持 100% 纯黑不透明，彻底盖住后方吸积盘内圈；coreR 外平滑过渡光子晕）
    const hor = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 1.32);
    hor.addColorStop(0, '#010104');
    hor.addColorStop(0.66, '#030208');
    hor.addColorStop(0.75, '#070310'); // 对应半径 ≈ coreR 处仍为纯黑实体，完美遮挡背后的扁椭圆内圈
    hor.addColorStop(0.82, 'rgba(251, 191, 36, 0.28)');
    hor.addColorStop(0.92, 'rgba(56, 189, 248, 0.12)');
    hor.addColorStop(1, 'rgba(56, 189, 248, 0)');
    this.horizonGrad = hor;
  }

  // ── 绘制 ──────────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 全画布快速清屏：避免快速平移/缩放时产生边缘残影
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

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

    this.ensureGradients(ctx, R);
    const coreR = R * 0.23;
    const pulse = 1 + 0.02 * Math.sin(t * 2.1);

    ctx.save();
    ctx.translate(rx, ry);

    // ── 1. 远场引力辉光基底 ──────────────────────────────────────────────
    if (this.ambientGlowGrad) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.18, 0, Math.PI * 2);
      ctx.fillStyle = this.ambientGlowGrad;
      ctx.fill();
    }

    // 进入卡冈图雅倾角坐标系
    ctx.save();
    ctx.rotate(DISK_TILT);

    // ── 2. 强引力透镜上下双拱弧（Gargantua 标志性的背面吸积盘弯折像）────
    if (this.dopplerLensGrad) {
      const topR = coreR * 1.46 * pulse;
      const botR = coreR * 1.38 * pulse;
      // 外层柔光晕环
      ctx.beginPath();
      ctx.ellipse(0, -coreR * 0.08, topR * 1.12, topR * 0.96, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.moveTo(
        Math.cos(Math.PI * 0.12) * botR * 1.08,
        coreR * 0.08 + Math.sin(Math.PI * 0.12) * botR * 0.92,
      );
      ctx.ellipse(0, coreR * 0.08, botR * 1.08, botR * 0.92, 0, Math.PI * 0.12, Math.PI * 0.88);
      ctx.strokeStyle = this.dopplerLensGrad;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = Math.max(1.6, R * 0.036);
      ctx.stroke();

      // 内层锐利光子透镜弧
      ctx.beginPath();
      ctx.ellipse(0, -coreR * 0.05, topR, topR * 0.88, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.moveTo(
        Math.cos(Math.PI * 0.1) * botR,
        coreR * 0.05 + Math.sin(Math.PI * 0.1) * botR * 0.84,
      );
      ctx.ellipse(0, coreR * 0.05, botR, botR * 0.84, 0, Math.PI * 0.1, Math.PI * 0.9);
      ctx.globalAlpha = 0.88;
      ctx.lineWidth = Math.max(1.1, R * 0.016);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── 3. 主吸积盘：多普勒红移/蓝移连续流体带 + 差速旋转环 ───────────────
    ctx.save();
    ctx.scale(1, DISK_SQUASH);

    // 3.1 吸积盘连续多普勒流体雾带（左蓝右红）
    if (this.dopplerFluidGrad) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.02, 0, Math.PI * 2);
      ctx.fillStyle = this.dopplerFluidGrad;
      ctx.fill();
    }

    // 3.2 外中盘差速湍流环（i = 1..4，共用左蓝右红多普勒描边渐变）
    if (this.dopplerOuterStrokeGrad) {
      ctx.setLineDash([R * 0.18, R * 0.1]);
      ctx.lineDashOffset = t * 0.12 * R;
      ctx.beginPath();
      for (let i = 1; i < 5; i++) {
        const rr = R * (0.31 + i * 0.155);
        ctx.moveTo(rr, 0);
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
      }
      ctx.strokeStyle = this.dopplerOuterStrokeGrad;
      ctx.lineWidth = Math.max(1.1, R * 0.015);
      ctx.stroke();
    }

    // 3.3 内盘 ISCO 高速相对论环流（i = 0 + 内紧贴环）
    if (this.dopplerInnerStrokeGrad) {
      ctx.setLineDash([R * 0.12, R * 0.065]);
      ctx.lineDashOffset = t * 0.26 * R;
      ctx.beginPath();
      const rInner0 = R * 0.27;
      const rInner1 = R * 0.34;
      ctx.moveTo(rInner0, 0);
      ctx.arc(0, 0, rInner0, 0, Math.PI * 2);
      ctx.moveTo(rInner1, 0);
      ctx.arc(0, 0, rInner1, 0, Math.PI * 2);
      ctx.strokeStyle = this.dopplerInnerStrokeGrad;
      ctx.lineWidth = Math.max(1.3, R * 0.018);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // ── 4. 开普勒螺旋坠落物质流（按蓝移迎面侧 vs 红移背离侧分 2 批批量绘制）──
    ctx.lineCap = 'round';

    // 批次 A：左侧迎面旋转半盘（c < 0）—— 相对论【蓝移】高能青白/电光蓝尾迹
    ctx.beginPath();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const pt = this.particles[i];
      const uNow = (t * pt.rate + pt.offset) % 1;
      const angNow = pt.phase - t * pt.spin * (1.15 + uNow * 1.15);
      const c = Math.cos(angNow);
      if (c >= 0) continue;

      const s = Math.sin(angNow);
      const rrNow = R * (0.25 + (1 - uNow) * 0.73) * (1 + pt.wobble * Math.sin(angNow * 2));
      const x0 = c * rrNow;
      const y0 = s * rrNow;

      const dAng = -(0.18 + uNow * 0.24);
      const hAng = dAng * 0.5;
      const rrMid = rrNow * 1.028;
      const rrTail = rrNow * 1.058;

      const c1 = c + s * hAng - 0.5 * c * hAng * hAng;
      const s1 = s - c * hAng - 0.5 * s * hAng * hAng;
      const c2 = c + s * dAng - 0.5 * c * dAng * dAng;
      const s2 = s - c * dAng - 0.5 * s * dAng * dAng;

      ctx.moveTo(c2 * rrTail, s2 * rrTail);
      ctx.lineTo(c1 * rrMid, s1 * rrMid);
      ctx.lineTo(x0, y0);
    }
    ctx.strokeStyle = 'rgba(186, 238, 255, 0.88)';
    ctx.lineWidth = Math.max(1.3, R * 0.018);
    ctx.stroke();

    // 批次 B：右侧背离旋转半盘（c >= 0）—— 相对论【红移】琥珀橘/绯红尾迹
    ctx.beginPath();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const pt = this.particles[i];
      const uNow = (t * pt.rate + pt.offset) % 1;
      const angNow = pt.phase - t * pt.spin * (1.15 + uNow * 1.15);
      const c = Math.cos(angNow);
      if (c < 0) continue;

      const s = Math.sin(angNow);
      const rrNow = R * (0.25 + (1 - uNow) * 0.73) * (1 + pt.wobble * Math.sin(angNow * 2));
      const x0 = c * rrNow;
      const y0 = s * rrNow;

      const dAng = -(0.14 + uNow * 0.16);
      const hAng = dAng * 0.5;
      const rrMid = rrNow * 1.024;
      const rrTail = rrNow * 1.05;

      const c1 = c + s * hAng - 0.5 * c * hAng * hAng;
      const s1 = s - c * hAng - 0.5 * s * hAng * hAng;
      const c2 = c + s * dAng - 0.5 * c * dAng * dAng;
      const s2 = s - c * dAng - 0.5 * s * dAng * dAng;

      ctx.moveTo(c2 * rrTail, s2 * rrTail);
      ctx.lineTo(c1 * rrMid, s1 * rrMid);
      ctx.lineTo(x0, y0);
    }
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.56)';
    ctx.lineWidth = Math.max(1.0, R * 0.014);
    ctx.stroke();

    ctx.restore(); // 退出 DISK_SQUASH 纵向压缩坐标系，回到 1:1 正圆空间！

    // ── 5. 正圆形事件视界深渊暗核 + 多普勒光子环（在吸积盘【之后】绘制！）──
    // 关键层次：必须在退出 DISK_SQUASH 后、在吸积盘之上绘制正圆形暗核（coreR），
    // 才能将盘面中心被压扁的椭圆内圈与后方环线彻底遮盖，呈现饱满深邃的正球形黑洞视界！
    if (this.horizonGrad) {
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 1.32, 0, Math.PI * 2);
      ctx.fillStyle = this.horizonGrad;
      ctx.fill();
    }

    // 额外叠一层 100% 纯黑视界实心核，确保任何高亮环线都不会透出黑洞内部
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = '#020106';
    ctx.fill();

    // 视界边缘光子环（Photon Ring）：左侧迎面蓝移极亮青白月牙，右侧背离红移琥珀绯红弧
    ctx.beginPath();
    ctx.arc(0, 0, coreR * pulse, Math.PI * 0.48, Math.PI * 1.52);
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.96)';
    ctx.lineWidth = Math.max(1.4, R * 0.015);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, coreR * pulse, -Math.PI * 0.48, Math.PI * 0.48);
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.68)';
    ctx.lineWidth = Math.max(1.0, R * 0.01);
    ctx.stroke();

    // ── 6. 前景吸积盘内沿掠过视界下缘的立体交叠亮丝（点到为止，不遮挡黑洞主体）──
    if (this.dopplerInnerStrokeGrad) {
      ctx.save();
      ctx.scale(1, DISK_SQUASH);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.285, 0.12, Math.PI - 0.12);
      ctx.strokeStyle = this.dopplerInnerStrokeGrad;
      ctx.globalAlpha = 0.62;
      ctx.lineWidth = Math.max(1.3, R * 0.018);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // 退出 DISK_TILT 旋转
    ctx.restore(); // 退出 translate(rx, ry)
  }
}

export function createPortalOverlay(options: PortalOverlayOptions): PortalOverlay {
  return new PortalOverlay(options);
}