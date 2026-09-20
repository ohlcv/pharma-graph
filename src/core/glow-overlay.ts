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
//   glow — 中间镂空的径向渐变圆环，明暗呼吸。内圈全透明，节点本体、边框、
//          标签都从中间透出来，不会被糊住。
//   flow — 沿节点外圈绕一圈的光弧（带渐隐尾巴的"彗星"），持续旋转。

import type cytoscape from 'cytoscape';

export interface GlowOverlayOptions {
  /** 传给 cytoscape 的那个 container（覆盖层会作为它的子元素插入）。 */
  container: HTMLElement;
  cy: cytoscape.Core;
  /** 呼吸光晕一个完整周期，毫秒。默认 2400（沉稳）。 */
  glowPeriodMs?: number;
  /** 旋转光弧转一整圈的时间，毫秒。默认 2000——比呼吸稍快，看得出"流动"。 */
  flowPeriodMs?: number;
  /** 动画帧率上限。默认 30——呼吸/旋转都是连续慢变化，60fps 看不出区别，成本却翻倍。 */
  fps?: number;
  /** 光晕环相对节点半径向外扩散的比例。默认 0.55。 */
  glowSpread?: number;
  /** 流动光弧相对节点边框向外的偏移（像素，css 坐标）。默认 3。 */
  flowOffset?: number;
  /** 流动光弧的线宽（像素，css 坐标）。默认 2.5。 */
  flowLineWidth?: number;
  /** 光弧"亮头"占一整圈的比例。默认 0.16。 */
  flowHeadFraction?: number;
  /** 亮头后面渐隐尾巴占一整圈的比例。默认 0.28。 */
  flowTailFraction?: number;
  /** 视口内同类节点数超过这个数就退化成静态（不再逐帧重画）。默认 80。 */
  maxAnimatedNodes?: number;
}

interface RenderedNode {
  x: number;
  y: number;
  /** 节点外接半径（含 border），rendered 坐标系。 */
  r: number;
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

/** 部分旧浏览器（主要是较老的 Firefox/Safari）没有 createConicGradient。 */
type MaybeConicCtx = CanvasRenderingContext2D & {
  createConicGradient?: (startAngle: number, x: number, y: number) => CanvasGradient;
};

export class GlowOverlay {
  private readonly cy: cytoscape.Core;
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: MaybeConicCtx | null;

  private readonly glowPeriodMs: number;
  private readonly flowPeriodMs: number;
  private readonly frameInterval: number;
  private readonly glowSpread: number;
  private readonly flowOffset: number;
  private readonly flowLineWidth: number;
  private readonly flowHeadFraction: number;
  private readonly flowTailFraction: number;
  private readonly maxAnimatedNodes: number;
  private readonly supportsConicGradient: boolean;

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
      glowSpread = 0.55,
      flowOffset = 3,
      flowLineWidth = 2.5,
      flowHeadFraction = 0.16,
      flowTailFraction = 0.28,
      maxAnimatedNodes = 80,
    } = options;

    this.cy = cy;
    this.container = container;
    this.glowPeriodMs = glowPeriodMs;
    this.flowPeriodMs = flowPeriodMs;
    this.frameInterval = 1000 / Math.max(1, fps);
    this.glowSpread = glowSpread;
    this.flowOffset = flowOffset;
    this.flowLineWidth = flowLineWidth;
    this.flowHeadFraction = flowHeadFraction;
    this.flowTailFraction = flowTailFraction;
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
      // 盖在 cytoscape 的几层 canvas 之上。因为 glow/flow 画的都是中空的环，
      // 节点本体和标签仍然完整可见。
      zIndex: '3',
    } as Partial<CSSStyleDeclaration>);
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d') as MaybeConicCtx | null;
    this.supportsConicGradient = typeof this.ctx?.createConicGradient === 'function';

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
    const flowAngle = ((elapsedMs / this.flowPeriodMs) % 1) * 2 * Math.PI;

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
        const outer = h.r * spreadScale;
        // 内圈保持全透明，节点本体/边框/标签从中间透出来，不会被盖住。
        const inner = h.r * 0.92;

        const g = ctx.createRadialGradient(h.x, h.y, inner, h.x, h.y, outer);
        g.addColorStop(0, withAlpha(h.color, 0));
        g.addColorStop(0.18, withAlpha(h.color, opacity));
        g.addColorStop(1, withAlpha(h.color, 0));

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(h.x, h.y, outer, 0, Math.PI * 2);
        ctx.fill();

        grow(h.x, h.y, outer);
      }
    }

    if (rings.length > 0) {
      for (const ring of rings) {
        const outer = ring.r + this.flowOffset;
        this.drawFlowRing(ctx, ring, outer, flowAngle);
        grow(ring.x, ring.y, outer + this.flowLineWidth);
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

  /** 画一段绕圆周旋转、带渐隐尾巴的光弧。 */
  private drawFlowRing(ctx: MaybeConicCtx, ring: FlowRing, outer: number, angle: number): void {
    ctx.lineWidth = this.flowLineWidth;

    if (this.supportsConicGradient && ctx.createConicGradient) {
      // 圆锥渐变——0 到 1 沿圆周分布，startAngle 每帧往前挪就是"转动"。
      // 亮头占 flowHeadFraction，之后渐隐到 0，剩下大半圈完全透明。
      const grad = ctx.createConicGradient(angle, ring.x, ring.y);
      const head = this.flowHeadFraction;
      const tailEnd = Math.min(1, head + this.flowTailFraction);
      grad.addColorStop(0, withAlpha(ring.color, 0.95));
      grad.addColorStop(head, withAlpha(ring.color, 0.95));
      grad.addColorStop(tailEnd, withAlpha(ring.color, 0));
      grad.addColorStop(1, withAlpha(ring.color, 0));
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, outer, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    // 回退：不支持 createConicGradient 的浏览器（较老的 Firefox/Safari），
    // 用几段离散圆弧、透明度递减来手动模拟"彗星尾巴"。
    const segments = 16;
    const litSegments = 5;
    const segAngle = (Math.PI * 2) / segments;
    for (let i = 0; i < litSegments; i++) {
      const start = angle - i * segAngle;
      const alpha = 0.85 * (1 - i / litSegments);
      ctx.strokeStyle = withAlpha(ring.color, alpha);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, outer, start, start + segAngle * 1.05);
      ctx.stroke();
    }
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
    this.glowNodes = this.cy.nodes('[stroke = "glow"]');
    this.flowNodes = this.cy.nodes('[stroke = "flow"]');
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
      const r = n.renderedOuterWidth() / 2;
      const reach = r * (1 + reachSpread) * 1.2;

      // 视口裁剪：缩小到全图时大部分节点都在屏幕外，没必要为它们建渐变/画弧。
      if (p.x + reach < 0 || p.x - reach > w || p.y + reach < 0 || p.y - reach > h) return;
      // 太小的节点（缩得很远）效果已经看不见了，直接跳过。
      if (r < 2) return;

      out.push({
        x: p.x,
        y: p.y,
        r,
        // 颜色直接读 cytoscape 渲染出来的 border-color——子树色 / fill 兜底 /
        // glow 固定紫，取色逻辑只在 renderer.ts 的 stylesheet 里维护这一份。
        color: (n.style('border-color') as string) || '#818cf8',
      });
    });

    return out;
  }
}
