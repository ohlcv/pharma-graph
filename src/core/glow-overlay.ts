// src/core/glow-overlay.ts
// stroke="glow" 的呼吸光晕、stroke="flow" 的旋转光弧，都画在一张独立的
// 覆盖层 canvas 上。
//
// 为什么不直接在 cytoscape 样式上做动画
// ────────────────────────────────────────────────────────────────────────────
// 原来 glow 的实现是每帧 `glowNodes.style('outline-width', ...)`。哪怕只有 3
// 个 glow 节点，改动任何元素的样式都会把 cytoscape 的整张画布标脏，于是
// 1000+ 节点会以 60fps 被无限重绘 —— 等于主线程上挂了一个永久的满负载任务。
// 这正是之前排查"点击卡 1 秒"时清理掉的那类开销，flow 的旋转效果不能重蹈覆辙。
//
// 覆盖层方案：我们自己的 canvas 叠在 cytoscape 画布之上，自己的 rAF，
// 完全不碰 cytoscape 的样式/重绘管线。cytoscape 那 1000+ 个节点在动效运行
// 期间一次都不会重画。
//
// 颜色统一读节点当前渲染出来的 border-color。这个值由 renderer.ts 的
// stylesheet 级联算出来（子树色 / fill 兜底色 / glow 的固定紫），覆盖层
// 只是"读"，不重新判断一遍取色逻辑——边框色只有一处数据源。
//
// 视觉上：
//   glow — 贴着节点真实形状的实心光晕：按节点形状外扩，径向渐变从中心到
//          边缘淡出，明暗随呼吸。六边形节点就是六边形光晕。
//   flow — 一颗实心光点（双同心圆：外圈淡光晕 + 内芯亮），沿节点轮廓外沿
//          匀速旋转。无渐变对象，成本最低。

import type cytoscape from 'cytoscape';
import { getNodeOutline, polygonPerimeter, pointAtPerimeterDistance, type Point } from './node-shape-outline.js';

export interface GlowOverlayOptions {
  /** 传给 cytoscape 的那个 container（覆盖层会作为它的子元素插入）。 */
  container: HTMLElement;
  cy: cytoscape.Core;
  /** 呼吸光晕一个完整周期，毫秒。默认 2400（沉稳）。 */
  glowPeriodMs?: number;
  /** 光点绕节点一整圈的时间，毫秒。默认 2000——比呼吸稍快，看得出"流动"。 */
  flowPeriodMs?: number;
  /** 动画帧率上限。默认 30——呼吸/旋转都是连续慢变化，60fps 看不出区别，成本却翻倍。 */
  fps?: number;
  /** 光晕环相对节点半宽/半高向外扩散的比例。默认 0.75。 */
  glowSpread?: number;
  /** 光点轨道相对节点边框向外的偏移（像素，css 坐标）。默认 3（走外沿）。 */
  flowOffset?: number;
  /** 沿轨道同时分布几颗光点。默认 1。 */
  flowDroplets?: number;
  /** 光点内芯半径（像素，css 坐标）。默认 3；外圈光晕约 1.8 倍。 */
  flowDropletRadius?: number;
  /** 视口内同类节点数超过这个数就退化成静态（不再逐帧重画）。默认 80。 */
  maxAnimatedNodes?: number;
}

interface RenderedNode {
  x: number;
  y: number;
  /** 节点外接半径（含 border），rendered 坐标系；flow 的圆形轨道沿用此值。 */
  r: number;
  /** 形状轮廓的半宽/半高，glow 贴形状绘制用（宽高不一的节点也不外扩失真）。 */
  halfW: number;
  halfH: number;
  /** cytoscape shape 名，交给 node-shape-outline.ts 还原成多边形顶点。 */
  shape: string | undefined;
  color: string;
}

type Halo = RenderedNode;
type FlowRing = RenderedNode;

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
  private readonly glowSpread: number;
  private readonly flowOffset: number;
  private readonly flowDroplets: number;
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
    // 页面切到后台时停掉 rAF（浏览器通常会自己节流，但显式停更省电，
    // 也避免回到前台时 dt 出现一个巨大的跳变）。
    if (document.hidden) this.pause();
    else this.resume();
  };
  private readonly onGraphChange = (): void => {
    // 流式加载会分批 cy.add()，新来的 glow/flow 节点必须被纳入。
    // 原实现只在构造时快照一次集合，所以流式进来的节点永远不会生效。
    this.nodesDirty = true;
  };

  constructor(options: GlowOverlayOptions) {
    const {
      container,
      cy,
      glowPeriodMs = 2400,
      flowPeriodMs = 2000,
      fps = 30,
      glowSpread = 0.75,
      flowOffset = 3,
      flowDroplets = 1,
      flowDropletRadius = 3,
      maxAnimatedNodes = 800,
    } = options;

    this.cy = cy;
    this.container = container;
    this.glowPeriodMs = glowPeriodMs;
    this.flowPeriodMs = flowPeriodMs;
    this.frameInterval = 1000 / Math.max(1, fps);
    this.glowSpread = glowSpread;
    this.flowOffset = flowOffset;
    this.flowDroplets = Math.max(1, flowDroplets);
    this.flowDropletRadius = flowDropletRadius;
    this.maxAnimatedNodes = maxAnimatedNodes;

    // cytoscape 会把 container 设成 position:relative，但它是在 cytoscape()
    // 返回后才生效的，这里兜一层，保证覆盖层定位正确。
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
      // 不接收任何指针事件 —— 点击、拖拽、框选全部照常落到 cytoscape 上。
      pointerEvents: 'none',
      // 盖在 cytoscape 的几层 canvas 之上。glow 是半透明实心光晕、flow 是小光点。
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

    // 尊重系统的"减少动态效果"设置：画一帧静态的就停手（flow 表现为角度
    // 固定在 0 的一段静态光弧，而不是完整旋转）。
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.draw(0);
      return;
    }

    this.startedAt = performance.now();
    this.lastDrawAt = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  /** 暂停但保留已绘制的画面。 */
  pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private resume(): void {
    if (this.rafId === null) this.start();
  }

  /** 停止并清空覆盖层。 */
  stop(): void {
    this.pause();
    this.clearAll();
  }

  /** 图数据变了（比如 render() 整体换图）时调用。 */
  refresh(): void {
    this.nodesDirty = true;
  }

  destroy(): void {
    this.pause();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    // cy 可能已经被 destroy 了，off() 在那之后调用是安全的 no-op，
    // 但包一层以防万一。
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

    // 和 renderer 的 pixelRatio 上限保持一致（高分屏上 dpr=3 会让像素数翻一倍多）。
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.cssWidth && h === this.cssHeight && dpr === this.dpr) return;

    this.cssWidth = w;
    this.cssHeight = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.lastDirty = null; // 尺寸变了，上一帧的脏矩形作废
  }

  private readonly tick = (now: number): void => {
    this.rafId = requestAnimationFrame(this.tick);

    // 帧率节流：呼吸/旋转都是连续慢变化，30fps 完全够看。
    if (now - this.lastDrawAt < this.frameInterval) return;
    this.lastDrawAt = now;

    this.draw(now - this.startedAt);
  };

  /** elapsedMs：从 start() 起经过的毫秒数，用来分别推算呼吸相位和旋转角度。 */
  private draw(elapsedMs: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const halos = this.collectHalos();
    const rings = this.collectFlowRings();

    // 只清上一帧画过的区域。整张 clearRect 在 dpr=2 的 iPad 上每帧也要花掉
    // 不少时间，而 glow/flow 通常只占画面的一小块。
    this.clearLastDirty();

    if (halos.length === 0 && rings.length === 0) {
      this.lastDirty = null;
      return;
    }

    // 超过阈值说明视口里同类节点太多，继续逐帧画性价比太低 —— 画一帧静态的
    // 然后（如果两种效果都不需要再动了）停下。
    const glowActive = halos.length > 0 && halos.length <= this.maxAnimatedNodes;
    const flowActive = rings.length > 0 && rings.length <= this.maxAnimatedNodes;

    const glowSine = Math.sin((elapsedMs / this.glowPeriodMs) * 2 * Math.PI);
    const flowProgress = elapsedMs / this.flowPeriodMs; // 圈数，不取模——走位函数里自己 mod

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

    if (halos.length > 0) {
      const opacity = 0.34 + 0.12 * glowSine;          // 0.22 ↔ 0.46
      const spreadScale = 1 + this.glowSpread * (1 + 0.18 * glowSine);
      for (const h of halos) {
        // 按节点真实形状外扩后整体实心填充：径向渐变从中心到边缘淡出
        // （六边形节点 = 六边形实光晕），不再 evenodd 镂空。
        const outer = getNodeOutline(h.shape, h.halfW * spreadScale, h.halfH * spreadScale);
        const maxHalf = Math.max(h.halfW, h.halfH);

        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, maxHalf * spreadScale);
        g.addColorStop(0, withAlpha(h.color, opacity));
        g.addColorStop(0.55, withAlpha(h.color, opacity * 0.55));
        g.addColorStop(1, withAlpha(h.color, 0));

        ctx.fillStyle = g;
        ctx.beginPath();
        this.traceOutline(ctx, h.x, h.y, outer);
        ctx.fill();

        grow(h.x, h.y, maxHalf * spreadScale);
      }
    }

    if (rings.length > 0) {
      for (const ring of rings) {
        const reach = this.drawFlowDots(ctx, ring, flowProgress);
        grow(ring.x, ring.y, reach);
      }
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

  /** 把多边形顶点连成闭合子路径（配合外层 beginPath + fill('evenodd') 做镂空）。 */
  private traceOutline(ctx: CanvasRenderingContext2D, cx: number, cy: number, pts: Point[]): void {
    if (pts.length === 0) return;
    ctx.moveTo(cx + pts[0].x, cy + pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(cx + pts[i].x, cy + pts[i].y);
    }
    ctx.closePath();
  }

  /**
   * 沿节点轮廓外沿画几颗实心光点（无渐变对象：双同心圆 = 外圈淡光晕 + 内芯亮），
   * 光点随 progress 沿周长均匀旋转。返回本次实际画到的最大外扩半径。
   */
  private drawFlowDots(ctx: CanvasRenderingContext2D, ring: FlowRing, progress: number): number {
    const halfW = ring.halfW + this.flowOffset;
    const halfH = ring.halfH + this.flowOffset;
    const outline = getNodeOutline(ring.shape, halfW, halfH);
    const { segLens, total } = polygonPerimeter(outline);
    if (total <= 0) return Math.max(ring.halfW, ring.halfH);

    const base = (((progress % 1) + 1) % 1) * total;
    const spacing = total / this.flowDroplets;
    const R = this.flowDropletRadius;

    for (let d = 0; d < this.flowDroplets; d++) {
      const p = pointAtPerimeterDistance(outline, segLens, total, base + d * spacing);
      const x = ring.x + p.x;
      const y = ring.y + p.y;
      // 外圈淡光晕（alpha 固定 0.28）+ 内芯亮（alpha 固定 0.95）：两级实心圆，
      // 视觉接近径向渐变，成本是 0 个渐变对象、2 次 fill。
      ctx.fillStyle = withAlpha(ring.color, 0.28);
      ctx.beginPath();
      ctx.arc(x, y, R * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha(ring.color, 0.95);
      ctx.beginPath();
      ctx.arc(x, y, R * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    return Math.max(halfW, halfH) + R * 1.8;
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

  private ensureNodeCache(): void {
    if (!this.nodesDirty && this.glowNodes && this.flowNodes) return;
    // defaultStroke 是"始终生效的底子"：md 显式填了 double 等其它 stroke 时，
    // glow/flow 的覆盖层效果也要跟着 defaultStroke 继续生效，两者叠加。
    this.glowNodes = this.cy.nodes('[stroke = "glow"], [defaultStroke = "glow"]');
    this.flowNodes = this.cy.nodes('[stroke = "flow"], [defaultStroke = "flow"]');
    this.nodesDirty = false;
  }

  /** 取出视口内可见的 glow 节点，换算成 rendered 坐标；颜色读该节点当前的 border-color。 */
  private collectHalos(): Halo[] {
    this.ensureNodeCache();
    return this.collectRenderedNodes(this.glowNodes, this.glowSpread);
  }

  /** 取出视口内可见的 flow 节点，换算成 rendered 坐标；颜色读该节点当前的 border-color。 */
  private collectFlowRings(): FlowRing[] {
    this.ensureNodeCache();
    // flow 的可见半径只需要覆盖 outline 偏移那一点点，不需要 glow 那么大的 spread。
    return this.collectRenderedNodes(this.flowNodes, 0.15);
  }

  private collectRenderedNodes(nodes: cytoscape.NodeCollection | null, reachSpread: number): RenderedNode[] {
    if (!nodes || nodes.length === 0) return [];

    const out: RenderedNode[] = [];
    const w = this.cssWidth;
    const h = this.cssHeight;

    nodes.forEach((n: cytoscape.NodeSingular) => {
      // dimmed 的节点不该发光/流动 —— 它正被"关掉"。
      if (n.hasClass('dimmed')) return;
      // removed / 不可见的节点跳过。
      if (n.removed() || !n.visible()) return;

      const p = n.renderedPosition();
      if (!p) return;
      const halfW = n.renderedOuterWidth() / 2;
      const halfH = n.renderedOuterHeight() / 2;
      const maxHalf = Math.max(halfW, halfH);
      // +14px 固定余量：给 glow 外扩和 flow 的光点外圈（R*1.8≈9px）留够边，
      // 否则小节点会被误判出屏。
      const reach = maxHalf * (1 + reachSpread) * 1.2 + 14;

      // 视口裁剪：缩小到全图时大部分节点都在屏幕外，没必要为它们建渐变/画弧。
      if (p.x + reach < 0 || p.x - reach > w || p.y + reach < 0 || p.y - reach > h) return;
      // 太小的节点（缩得很远）效果已经看不见了，直接跳过。
      if (maxHalf < 2) return;

      out.push({
        x: p.x,
        y: p.y,
        r: halfW, // flow 沿用外接半径（横向半径）
        halfW,
        halfH,
        shape: n.style('shape') as string | undefined,
        // 颜色直接读 cytoscape 渲染出来的 border-color——子树色 / fill 兜底 /
        // glow 固定紫，取色逻辑只在 renderer.ts 的 stylesheet 里维护这一份。
        color: (n.style('border-color') as string) || '#818cf8',
      });
    });

    return out;
  }
}
