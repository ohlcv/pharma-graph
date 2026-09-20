// src/core/glow-overlay.ts
// stroke="glow" 的呼吸光晕、stroke="flow" 的流动光效，都画在一张独立的
// 覆盖层 canvas 上，贴着节点的真实轮廓（不是统一画个圆）。
//
// 为什么不直接在 cytoscape 样式上做动画
// ────────────────────────────────────────────────────────────────────────────
// 原来 glow 的实现是每帧 `glowNodes.style('outline-width', ...)`。哪怕只有 3
// 个 glow 节点，改动任何元素的样式都会把 cytoscape 的整张画布标脏，于是
// 1000+ 节点会以 60fps 被无限重绘。覆盖层方案：我们自己的 canvas 叠在
// cytoscape 画布之上，自己的 rAF，完全不碰 cytoscape 的样式/重绘管线。
//
// 颜色统一读节点当前渲染出来的 border-color。这个值由 renderer.ts 的
// stylesheet 级联算出来（子树色 / fill 兜底色 / glow 的固定紫），覆盖层
// 只是"读"，不重新判断一遍取色逻辑——边框色只有一处数据源。
//
// 形状：node-shape-outline.ts 把 cytoscape 的 shape 名（ellipse/hexagon/
// round-rectangle/tag/...）转成一圈多边形顶点，glow 和 flow 都沿着这圈
// 顶点画，而不是统一画个圆——六边形节点的光晕是六边形的，标签形节点的
// 光晕是带尖角的标签形。
//
// 视觉上：
//   glow — 沿轮廓描边好几圈，越往外线越淡、越宽，叠出一层柔和的光晕，
//          明暗随时间呼吸。
//   flow — 不是一条线绕着转。是沿轮廓周长走位的几颗"水珠"，每颗后面拖一段
//          渐隐的尾迹，像水流沿着节点边缘淌过去，而不是指针式的单线旋转。

import type cytoscape from 'cytoscape';
import { getNodeOutline, polygonPerimeter, pointAtPerimeterDistance, type Point } from './node-shape-outline.js';

export interface GlowOverlayOptions {
  /** 传给 cytoscape 的那个 container（覆盖层会作为它的子元素插入）。 */
  container: HTMLElement;
  cy: cytoscape.Core;
  /** 呼吸光晕一个完整周期，毫秒。默认 2400（沉稳）。 */
  glowPeriodMs?: number;
  /** 水珠绕节点一整圈的时间，毫秒。默认 2600——太快会显得毛躁，水流感需要慢一点。 */
  flowPeriodMs?: number;
  /** 动画帧率上限。默认 30——呼吸/流动都是连续慢变化，60fps 看不出区别，成本却翻倍。 */
  fps?: number;
  /** 光晕相对节点轮廓向外扩散的像素上限（css 坐标）。默认 10。 */
  glowSpreadPx?: number;
  /** 流动效果的"轨道"相对节点轮廓向外的偏移（像素，css 坐标）。默认 3。 */
  flowOffset?: number;
  /** 水珠数量（同时沿轨道分布几颗）。默认 3。 */
  flowDroplets?: number;
  /** 每颗水珠身后拖几段渐隐尾迹。默认 4。 */
  flowTrailSteps?: number;
  /** 水珠基础半径（像素，css 坐标）。默认 3。 */
  flowDropletRadius?: number;
  /** 视口内同类节点数超过这个数就退化成静态（不再逐帧重画）。默认 60——
   *  比纯圆形时代低一些，因为现在每个节点的绘制成本更高（多边形 + 多水珠）。 */
  maxAnimatedNodes?: number;
}

interface NodeOutlineInstance {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  shape: string | undefined;
  color: string;
  /** 局部坐标（未平移）的轮廓多边形，已按当前渲染尺寸生成。 */
  outline: Point[];
  segLens: number[];
  perimeter: number;
}

/** `#rrggbb` / `rgb(...)` → `rgba(r,g,b,a)`。解析失败时回退到给定 alpha 的靛蓝。 */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color.trim());
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  return `rgba(129, 140, 248, ${alpha})`;
}

export class GlowOverlay {
  private readonly cy: cytoscape.Core;
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;

  private readonly glowPeriodMs: number;
  private readonly flowPeriodMs: number;
  private readonly frameInterval: number;
  private readonly glowSpreadPx: number;
  private readonly flowOffset: number;
  private readonly flowDroplets: number;
  private readonly flowTrailSteps: number;
  private readonly flowDropletRadius: number;
  private readonly maxAnimatedNodes: number;

  private rafId: number | null = null;
  private lastDrawAt = 0;
  private startedAt = 0;

  /** 缓存的 glow/flow 节点集合；图变动时置脏，下一帧重新查询。 */
  private glowNodes: cytoscape.NodeCollection | null = null;
  private flowNodes: cytoscape.NodeCollection | null = null;
  private nodesDirty = true;

  /** 上一帧画过的区域，用来做局部清除（避免每帧 clearRect 整张画布）。 */
  private lastDirty: { x: number; y: number; w: number; h: number } | null = null;

  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };
  private readonly onGraphChange = (): void => {
    // 流式加载会分批 cy.add()，新来的 glow/flow 节点必须被纳入。
    this.nodesDirty = true;
  };

  constructor(options: GlowOverlayOptions) {
    const {
      container,
      cy,
      glowPeriodMs = 2400,
      flowPeriodMs = 2600,
      fps = 30,
      glowSpreadPx = 10,
      flowOffset = 3,
      flowDroplets = 3,
      flowTrailSteps = 4,
      flowDropletRadius = 3,
      maxAnimatedNodes = 600,
    } = options;

    this.cy = cy;
    this.container = container;
    this.glowPeriodMs = glowPeriodMs;
    this.flowPeriodMs = flowPeriodMs;
    this.frameInterval = 1000 / Math.max(1, fps);
    this.glowSpreadPx = glowSpreadPx;
    this.flowOffset = flowOffset;
    this.flowDroplets = Math.max(1, flowDroplets);
    this.flowTrailSteps = Math.max(1, flowTrailSteps);
    this.flowDropletRadius = flowDropletRadius;
    this.maxAnimatedNodes = maxAnimatedNodes;

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-glow-overlay', '');
    Object.assign(this.canvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '3',
    } as Partial<CSSStyleDeclaration>);
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');

    this.syncSize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(container);
    }

    document.addEventListener('visibilitychange', this.onVisibility);
    this.cy.on('add remove', this.onGraphChange);
  }

  // ── 生命周期 ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.rafId !== null || !this.ctx) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.draw(0);
      return;
    }

    this.startedAt = performance.now();
    this.lastDrawAt = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private resume(): void {
    if (this.rafId === null) this.start();
  }

  stop(): void {
    this.pause();
    this.clearAll();
  }

  refresh(): void {
    this.nodesDirty = true;
  }

  destroy(): void {
    this.pause();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    try {
      this.cy.off('add remove', this.onGraphChange);
    } catch {
      /* cy 已销毁 */
    }
    this.canvas.remove();
  }

  // ── 绘制 ──────────────────────────────────────────────────────────────────

  private syncSize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.cssWidth && h === this.cssHeight && dpr === this.dpr) return;

    this.cssWidth = w;
    this.cssHeight = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.lastDirty = null;
  }

  private readonly tick = (now: number): void => {
    this.rafId = requestAnimationFrame(this.tick);
    if (now - this.lastDrawAt < this.frameInterval) return;
    this.lastDrawAt = now;
    this.draw(now - this.startedAt);
  };

  private ensureNodeCache(): void {
    if (!this.nodesDirty && this.glowNodes && this.flowNodes) return;
    this.glowNodes = this.cy.nodes('[stroke = "glow"]');
    this.flowNodes = this.cy.nodes('[stroke = "flow"]');
    this.nodesDirty = false;
  }

  /** elapsedMs：从 start() 起经过的毫秒数，用来分别推算呼吸相位和水流位移。 */
  private draw(elapsedMs: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    this.ensureNodeCache();
    const glowInstances = this.collectInstances(this.glowNodes, this.glowSpreadPx);
    const flowInstances = this.collectInstances(this.flowNodes, this.flowOffset);

    this.clearLastDirty();

    if (glowInstances.length === 0 && flowInstances.length === 0) {
      this.lastDirty = null;
      return;
    }

    const glowActive = glowInstances.length > 0 && glowInstances.length <= this.maxAnimatedNodes;
    const flowActive = flowInstances.length > 0 && flowInstances.length <= this.maxAnimatedNodes;

    const glowSine = Math.sin((elapsedMs / this.glowPeriodMs) * 2 * Math.PI);
    const flowProgress = elapsedMs / this.flowPeriodMs; // 圈数，不取模——距离计算里自己 mod

    const dpr = this.dpr;
    ctx.save();
    ctx.scale(dpr, dpr);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (x: number, y: number, reach: number): void => {
      if (x - reach < minX) minX = x - reach;
      if (y - reach < minY) minY = y - reach;
      if (x + reach > maxX) maxX = x + reach;
      if (y + reach > maxY) maxY = y + reach;
    };

    for (const inst of glowInstances) {
      const reach = this.drawGlow(ctx, inst, glowSine);
      grow(inst.cx, inst.cy, reach);
    }
    for (const inst of flowInstances) {
      const reach = this.drawFlow(ctx, inst, flowProgress);
      grow(inst.cx, inst.cy, reach);
    }

    ctx.restore();

    const pad = 2;
    this.lastDirty = {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };

    if (!glowActive && !flowActive) this.pause();
  }

  /**
   * 沿节点轮廓描边好几圈，越往外越淡越宽，叠出一层柔和的光晕（贴合节点
   * 真实形状，不是统一画个圆）。呼吸由 sine 调制外扩幅度和整体不透明度。
   * 返回本次实际画到的最大外扩半径，供调用方合并脏矩形范围。
   */
  private drawGlow(ctx: CanvasRenderingContext2D, inst: NodeOutlineInstance, sine: number): number {
    const breath = 0.75 + 0.25 * (sine + 1) / 2; // 0.75 ↔ 1.0，呼吸时光晕整体缩放
    const passes = [
      { pad: this.glowSpreadPx * 1.0, width: 5, alpha: 0.09 },
      { pad: this.glowSpreadPx * 0.62, width: 4, alpha: 0.16 },
      { pad: this.glowSpreadPx * 0.30, width: 3, alpha: 0.24 },
    ];

    let maxReach = 0;
    for (const pass of passes) {
      const pad = pass.pad * breath;
      const halfW = inst.halfW + pad;
      const halfH = inst.halfH + pad;
      const pts = getNodeOutline(inst.shape, halfW, halfH);
      this.strokeClosedPath(ctx, inst.cx, inst.cy, pts);
      ctx.strokeStyle = withAlpha(inst.color, pass.alpha * (0.7 + 0.3 * breath));
      ctx.lineWidth = pass.width;
      ctx.lineJoin = 'round';
      ctx.stroke();
      maxReach = Math.max(maxReach, Math.max(halfW, halfH));
    }
    return maxReach + 4;
  }

  /**
   * 沿节点轮廓的周长走位画几颗带尾迹的"水珠"，制造液体流动的观感，而不是
   * 一条硬邦邦的线绕着转。返回本次实际画到的最大外扩半径。
   */
  private drawFlow(ctx: CanvasRenderingContext2D, inst: NodeOutlineInstance, progress: number): number {
    const total = inst.perimeter;
    if (total <= 0) return inst.halfW;

    // 轨道本身画一道很淡的描边，像水沟一样，衬托水珠的存在感。
    this.strokeClosedPath(ctx, inst.cx, inst.cy, inst.outline);
    ctx.strokeStyle = withAlpha(inst.color, 0.10);
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const trailSpacing = Math.max(4, total * 0.018);
    const dropletSpacing = total / this.flowDroplets;
    const baseDist = (progress % 1) * total;

    let maxReach = inst.halfW + this.flowOffset;

    for (let d = 0; d < this.flowDroplets; d++) {
      const headDist = baseDist + d * dropletSpacing;
      for (let t = 0; t < this.flowTrailSteps; t++) {
        const dist = headDist - t * trailSpacing;
        const p = pointAtPerimeterDistance(inst.outline, inst.segLens, total, dist);
        const x = inst.cx + p.x;
        const y = inst.cy + p.y;
        const falloff = Math.pow(1 - t / this.flowTrailSteps, 1.6);
        const alpha = 0.85 * falloff;
        const radius = this.flowDropletRadius * (1.15 - 0.16 * t);

        const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
        g.addColorStop(0, withAlpha(inst.color, alpha));
        g.addColorStop(0.5, withAlpha(inst.color, alpha * 0.45));
        g.addColorStop(1, withAlpha(inst.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
        ctx.fill();

        const reach = Math.max(inst.halfW, inst.halfH) + this.flowOffset + radius * 2.2;
        if (reach > maxReach) maxReach = reach;
      }
    }

    return maxReach;
  }

  private strokeClosedPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, pts: Point[]): void {
    if (pts.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(cx + pts[0].x, cy + pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(cx + pts[i].x, cy + pts[i].y);
    }
    ctx.closePath();
  }

  private clearLastDirty(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const d = this.lastDirty;
    if (!d) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    ctx.clearRect(d.x * this.dpr, d.y * this.dpr, d.w * this.dpr, d.h * this.dpr);
  }

  private clearAll(): void {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.lastDirty = null;
  }

  /** 取出视口内可见的节点，换算成 rendered 坐标 + 轮廓多边形；颜色读该节点当前的 border-color。 */
  private collectInstances(
    nodes: cytoscape.NodeCollection | null,
    extraReachPx: number,
  ): NodeOutlineInstance[] {
    if (!nodes || nodes.length === 0) return [];

    const out: NodeOutlineInstance[] = [];
    const w = this.cssWidth;
    const h = this.cssHeight;

    nodes.forEach((n: cytoscape.NodeSingular) => {
      if (n.hasClass('dimmed')) return;
      if (n.removed() || !n.visible()) return;

      const p = n.renderedPosition();
      if (!p) return;
      const halfW = n.renderedOuterWidth() / 2;
      const halfH = n.renderedOuterHeight() / 2;
      const reach = Math.max(halfW, halfH) + extraReachPx + 16; // 16px 兜底给多边形尖角/水珠留余量

      if (p.x + reach < 0 || p.x - reach > w || p.y + reach < 0 || p.y - reach > h) return;
      if (halfW < 2 || halfH < 2) return;

      const shape = n.style('shape') as string | undefined;
      const outline = getNodeOutline(shape, halfW, halfH);
      const { segLens, total } = polygonPerimeter(outline);

      out.push({
        cx: p.x,
        cy: p.y,
        halfW,
        halfH,
        shape,
        color: (n.style('border-color') as string) || '#818cf8',
        outline,
        segLens,
        perimeter: total,
      });
    });

    return out;
  }
}