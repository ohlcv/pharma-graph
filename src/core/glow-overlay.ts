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
// 强调层（第二张 canvas，z-index 4）
// ────────────────────────────────────────────────────────────────────────────
// 选中的节点（class `selected-node`）画一团"强光"：贴着节点轮廓向外扩散的柔光
// （两圈：大范围的外圈 + 贴边的亮内圈），颜色读节点当前 border-color（即主题辅色）。
// 只画光、不画线，并且是实心的：样式表里选中边框已经是 4px 的主题色实线，再画一条线会显得像
// "双线边框"；把节点内部擦空则会因为近似轮廓与真实形状不一致露出一圈异色的框。
// 漫游时当前节点额外带 class `tour-pulsing`，强光按 1Hz 起伏——这取代了原来
// tour.ts 里每帧 `node.style({border-width, border-color})` 的 rAF 脉冲：那种写法
// 每帧都把 cytoscape 整张画布标脏，漫游期间等于一个 60fps 满帧重绘的常驻任务。
// 现在漫游脉冲和选中强光都画在这张层上，cytoscape 一次都不重画。
//
// 为什么单独一张 canvas：基础光晕层在节点很多时会停帧（画一张静态图就停），
// 而强调层要一直动，只画寥寥几个节点，成本是 O(选中数)，和图规模无关。
//
// 视觉上：
//   glow — 贴着节点真实形状的实心光晕：按节点形状外扩，径向渐变从中心到
//          边缘淡出，明暗随呼吸。六边形节点就是六边形光晕。
//   flow — 一颗实心光点（双同心圆：外圈淡光晕 + 内芯亮），沿节点轮廓外沿
//          匀速旋转。无渐变对象，成本最低。

import type cytoscape from 'cytoscape';
import { getNodeOutline, polygonPerimeter, pointAtPerimeterDistance, type Point } from './node-shape-outline.js';
import { readThemeColors } from './theme-colors.js';

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
  /**
   * 视口内同类节点数超过这个数就退化成静态（不再逐帧重画）。默认 150。
   * 现在所有 fill 的 defaultStroke 都是 glow，视口里动辄几百个 glow 节点；
   * 每帧为每个节点建径向渐变，iPad 上很容易成为最重的一块，所以别设太高。
   */
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

/** 强调层：漫游脉冲一个周期（毫秒），与旧的 1Hz 边框脉冲一致。 */
const EMPH_PULSE_PERIOD_MS = 1000;
/** 同时画强光的节点数上限（正常只有 1~2 个，防止有人一次选中上百个）。 */
const EMPH_MAX_NODES = 24;
/**
 * 视口内 glow/flow 节点数不超过这个值时，基础光晕层在 cytoscape 每画完一帧后
 * 立刻同步重画（见 onRender）。超过就仍走 30fps 的 rAF 节流，避免几百个径向渐变
 * 每帧都画。漫游时镜头是放大聚焦的，视口内节点很少，正好落在这个范围里。
 */
const SYNC_DRAW_MAX_NODES = 120;

/** `#rrggbb` / `rgb(...)` → `rgba(r,g,b,a)`。解析失败时回退到当前主题的主色。 */
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
  // 解析失败：用当前主题主色兜底；主色本身也解析不了时才落到写死的靛蓝（防递归）。
  const fallback = readThemeColors().accent;
  if (fallback !== color) return withAlpha(fallback, alpha);
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
  private redrawTimer: number | null = null;

  // 强调层（选中强光 / 漫游脉冲），见文件头说明。
  private readonly emphCanvas: HTMLCanvasElement;
  private readonly emphCtx: CanvasRenderingContext2D | null;
  private emphRaf: number | null = null;
  private emphStartedAt = 0;
  private emphLastDrawAt = 0;
  private emphNodes: cytoscape.NodeCollection | null = null;
  private emphDirty = true;
  private readonly reducedMotion: boolean;
  private lastDrawAt = 0;
  private startedAt = 0;
  /** start() 已调用且未 stop()。onRender 只在覆盖层"已启用"时才重画基础层。 */
  private started = false;
  /** 上一次 draw() 画到的视口内 glow+flow 节点数，决定 onRender 能否同步重画。 */
  private lastVisibleCount = 0;
  /** 上一次 draw()/检查时的镜头（pan + zoom），用来判断停帧状态下镜头是否动过。 */
  private lastVp = { x: NaN, y: NaN, z: NaN };
  /** viewport 抖动时最后一次 scheduleStaticRefresh 的时间戳，避免 pan 抖动时反复 clear。 */
  private lastStaticRefreshAt = 0;
  private staleTimer: number | null = null;

  /** 缓存的 glow/flow 节点集合；图变动时置脏，下一帧重新查询。 */
  private glowNodes: cytoscape.NodeCollection | null = null;
  private flowNodes: cytoscape.NodeCollection | null = null;
  private nodesDirty = true;

  /**
   * 强调层 sprite 缓存（按 color|quantizedRadius|intensityBucket 分档）。
   * 强度量化成 8 档，肉眼分辨不出台阶，但缓存命中率大幅提升。
   */
  private emphSpriteCache = new Map<string, HTMLCanvasElement>();

  /** 上一帧画过的区域，用来做局部清除（避免每帧 clearRect 整张画布）。 */
  private lastDirty: { x: number; y: number; w: number; h: number } | null = null;

  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    // 页面切到后台时停掉 rAF（浏览器通常会自己节流，但显式停更省电，
    // 也避免回到前台时 dt 出现一个巨大的跳变）。
    if (document.hidden) {
      this.pause();
      this.pauseEmphasis();
    } else {
      this.resume();
      this.ensureEmphLoop();
    }
  };
  private readonly onEmphChange = (): void => {
    // 大量节点批量加减 class 时这里会被调用上千次，所以只能是 O(1)：
    // 置脏 + 确保循环在跑，真正的集合查询留到下一帧、且一帧只做一次。
    this.emphDirty = true;
    this.ensureEmphLoop();
  };
  /**
   * cytoscape 每画完一帧就同步重画覆盖层（基础层）。
   *
   * 覆盖层有自己的 rAF（30fps 节流），和 cytoscape 的渲染循环互不同步：镜头在
   * pan/zoom 动画中时，节点已经被 cytoscape 画到新位置，覆盖层还停在上一帧甚至上上一帧，
   * 光晕就和节点错开。漫游每一步都有 600ms 的 pan+zoom 动画，所以最明显。
   * cy 的 'render' 事件在它画完一帧后同步触发，此时 renderedPosition() 与刚画出的
   * 画面一致；在这里立即重画，两张画布就落在同一帧里。
   *
   * 强调层（选中强光 / 漫游脉冲）由它自己的 emphTick rAF 循环负责——这里不同步画，
   * 否则会被 30fps 节流在 ProMotion 高帧率场景下漏帧（节流期内的 render 事件全部跳过，
   * 强光就"暂停呼吸"了）。
   */
  private readonly onRender = (): void => {
    if (document.hidden) return;
    const now = performance.now();

    // 基础层（所有 glow / flow 节点的呼吸光晕）。
    if (!this.started) return;
    if (this.lastVisibleCount <= SYNC_DRAW_MAX_NODES) {
      if (now - this.lastDrawAt < this.frameInterval) return; // 帧率节流：把有效重画频率锁回设计好的 30fps
      this.lastDrawAt = now; // 让紧随其后的 rAF tick 跳过这一帧，不重复画
      this.draw(this.reducedMotion ? 0 : now - this.startedAt);
      return;
    }
    // 节点太多、已经停帧成静态图：镜头一动，静态图就和节点错位了。
    // 先清掉（不留错位的鬼影），一帧后再补画（缩短空白窗到 1 帧：150 → 16ms）。
    // 同时给 viewport 抖动加 200ms 节流，避免 pan 中反复 clear + resume 让光晕"边画边抖"。
    if (this.rafId === null && this.viewportMoved()) {
      // 给 viewport 抖动加 200ms 节流，避免 pan 中反复 clear + resume 让光晕"边画边抖"。
      if (now - this.lastStaticRefreshAt >= 200) {
        this.lastStaticRefreshAt = now;
        this.clearAll();
        this.scheduleStaticRefresh(16);
      }
    }
  };

  private viewportMoved(): boolean {
    const p = this.cy.pan();
    const z = this.cy.zoom();
    const moved = p.x !== this.lastVp.x || p.y !== this.lastVp.y || z !== this.lastVp.z;
    this.lastVp = { x: p.x, y: p.y, z };
    return moved;
  }

  private scheduleStaticRefresh(delayMs = 16): void {
    if (this.staleTimer !== null) window.clearTimeout(this.staleTimer);
    this.staleTimer = window.setTimeout(() => {
      this.staleTimer = null;
      this.resume();
    }, delayMs);
  }

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
      maxAnimatedNodes = 150,
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

    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.emphCanvas = document.createElement('canvas');
    this.emphCanvas.setAttribute('data-glow-emphasis', '');
    Object.assign(this.emphCanvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '4', // 在基础光晕层（3）之上
    } as Partial<CSSStyleDeclaration>);
    container.appendChild(this.emphCanvas);
    this.emphCtx = this.emphCanvas.getContext('2d');

    this.syncSize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(container);
    }

    document.addEventListener('visibilitychange', this.onVisibility);
    this.cy.on('add remove', this.onGraphChange);
    this.cy.on('class select unselect add remove', this.onEmphChange);
    this.cy.on('render', this.onRender);
    // 构造时可能已经有选中的节点（例如重建覆盖层）。
    this.ensureEmphLoop();
  }

  // ── 生命周期 ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.rafId !== null || !this.ctx) return;
    this.started = true;

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
    this.started = false;
    this.pause();
    this.clearAll();
    this.pauseEmphasis();
    this.clearEmph();
  }

  /** 图数据变了（比如 render() 整体换图）时调用。 */
  refresh(): void {
    this.nodesDirty = true;
  }

  /**
   * 样式变了（典型：切主题，节点 border-color 换了）后调用，让光晕按新颜色重画。
   *
   * 颜色是每帧从节点 border-color 现读的，所以不用改绘制逻辑，只需要保证
   * 会再画：视口内节点过多时覆盖层画完一帧静态图就停帧（见 draw()），
   * 这里把它重新唤醒。cytoscape 的 border-color 有 200ms 过渡，停帧时容易
   * 停在过渡中途的颜色，所以过渡走完后再补画一次。
   */
  redraw(): void {
    this.resume();
    if (this.redrawTimer !== null) window.clearTimeout(this.redrawTimer);
    this.redrawTimer = window.setTimeout(() => {
      this.redrawTimer = null;
      this.resume();
    }, 260);
  }

  destroy(): void {
    this.started = false;
    if (this.staleTimer !== null) {
      window.clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
    this.pause();
    if (this.redrawTimer !== null) {
      window.clearTimeout(this.redrawTimer);
      this.redrawTimer = null;
    }
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    // cy 可能已经被 destroy 了，off() 在那之后调用是安全的 no-op，
    // 但包一层以防万一。
    this.pauseEmphasis();
    this.emphSpriteCache.clear();
    try {
      this.cy.off('add remove', this.onGraphChange);
      this.cy.off('class select unselect add remove', this.onEmphChange);
      this.cy.off('render', this.onRender);
    } catch {
      /* cy 已销毁 */
    }
    this.canvas.remove();
    this.emphCanvas.remove();
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
    this.emphCanvas.width = this.canvas.width;
    this.emphCanvas.height = this.canvas.height;
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
  // ── 强调层：选中强光 / 漫游脉冲 ───────────────────────────────────────────

  /** 确保强调层的 rAF 循环在跑。没有选中节点时循环会在下一帧自己停掉。 */
  private ensureEmphLoop(): void {
    if (this.emphRaf !== null || !this.emphCtx || document.hidden) return;
    this.emphStartedAt = performance.now();
    this.emphLastDrawAt = 0;
    this.emphRaf = requestAnimationFrame(this.emphTick);
  }

  private pauseEmphasis(): void {
    if (this.emphRaf !== null) {
      cancelAnimationFrame(this.emphRaf);
      this.emphRaf = null;
    }
  }

  private readonly emphTick = (now: number): void => {
    this.emphRaf = requestAnimationFrame(this.emphTick);
    if (now - this.emphLastDrawAt < this.frameInterval) return;
    this.emphLastDrawAt = now;
    this.drawEmphasis(now - this.emphStartedAt);
  };

  /**
   * 按当前强度分档生成/复用离屏 canvas sprite。
   * 用 createRadialGradient 一次性画好（GPU 友好），每帧只做 drawImage，
   * 完全规避 shadowBlur 在 iOS Safari 上的 CPU 软件光栅化。
   * 强度量化成 8 档（bucket 0–7），肉眼分辨不出台阶，但缓存命中率大幅提升。
   */
  private getEmphSprite(color: string, radius: number, intensityBucket: number): HTMLCanvasElement {
    const key = `${color}|${radius}|${intensityBucket}`;
    const cached = this.emphSpriteCache.get(key);
    if (cached) return cached;

    const size = Math.ceil(radius * 2);
    const sprite = document.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    const sctx = sprite.getContext('2d')!;
    const cx = radius;
    const cy = radius;

    // 外圈：大范围柔光，alpha 随强度档位变化
    const outerAlpha = 0.18 + intensityBucket * 0.07;
    const outerGrad = sctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    outerGrad.addColorStop(0, withAlpha(color, outerAlpha));
    outerGrad.addColorStop(0.45, withAlpha(color, outerAlpha * 0.5));
    outerGrad.addColorStop(1, withAlpha(color, 0));
    sctx.fillStyle = outerGrad;
    sctx.beginPath();
    sctx.arc(cx, cy, radius, 0, Math.PI * 2);
    sctx.fill();

    // 内圈：贴着边的亮圈
    const innerR = radius * 0.4;
    const innerAlpha = 0.3 + intensityBucket * 0.06;
    const innerGrad = sctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
    innerGrad.addColorStop(0, withAlpha(color, innerAlpha));
    innerGrad.addColorStop(1, withAlpha(color, 0));
    sctx.fillStyle = innerGrad;
    sctx.beginPath();
    sctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    sctx.fill();

    this.emphSpriteCache.set(key, sprite);
    return sprite;
  }

  /**
   * 整张强调层清空。
   * 这里刻意不用"脏矩形"只擦上一帧画过的区域：阴影的高斯尾巴会延伸到估算的矩形之外，
   * 尾巴每一帧都叠一层、永远擦不掉，最后在矩形边缘露出一圈细细的方框线——这层画布
   * 只画寥寥几个节点，整张清空的开销可以忽略。
   */
  private clearEmph(): void {
    this.emphCtx?.clearRect(0, 0, this.emphCanvas.width, this.emphCanvas.height);
  }

  /**
   * 给选中的节点画强光——纯光，没有任何实线，节点内部实心染色。
   *  - 实心底：整个节点内部均匀的主题色。
   *  - 外圈：大范围的柔光，形状贴合节点轮廓。
   *  - 内圈：贴着节点边缘的一圈更亮的光。
   *  - 起伏：普通选中随基础呼吸周期轻微起伏；漫游当前节点（class tour-pulsing）
   *          按 1Hz 起伏、幅度更大；系统开了"减少动态效果"则保持恒定亮度。
   * 颜色读节点当前的 border-color（选中态由样式表给出主题辅色）。
   *
   * 实现：外/内光圈各用 createRadialGradient 一次性画成离屏 sprite（GPU 合成），
   * 每帧只做 drawImage，完全规避 iOS Safari 上 shadowBlur 的 CPU 软件光栅化。
   * 强度量化成 8 档（bucket 0–7）做缓存键，视觉上无台阶感。
   */
  private drawEmphasis(elapsedMs: number): void {
    const ctx = this.emphCtx;
    if (!ctx) return;

    if (this.emphDirty || !this.emphNodes) {
      this.emphNodes = this.cy.nodes('.selected-node').not('.layer-parent');
      this.emphDirty = false;
    }

    this.clearEmph();

    const nodes = this.emphNodes;
    if (!nodes || nodes.length === 0) {
      this.pauseEmphasis();
      return;
    }

    const w = this.cssWidth;
    const h = this.cssHeight;
    const dpr = this.dpr;
    const TWO_PI = Math.PI * 2;

    ctx.save();
    ctx.scale(dpr, dpr);

    let drawn = 0;
    nodes.forEach((n: cytoscape.NodeSingular) => {
      if (drawn >= EMPH_MAX_NODES) return;
      if (n.removed() || !n.visible()) return;
      const p = n.renderedPosition();
      if (!p) return;
      const halfW = n.renderedOuterWidth() / 2;
      const halfH = n.renderedOuterHeight() / 2;
      const maxHalf = Math.max(halfW, halfH);
      if (maxHalf < 2) return;

      const pulsing = n.hasClass('tour-pulsing');
      const breath = this.reducedMotion
        ? 0.5
        : 0.5 + 0.5 * Math.sin((elapsedMs / (pulsing ? EMPH_PULSE_PERIOD_MS : this.glowPeriodMs)) * TWO_PI);
      const intensity = pulsing ? 0.55 + 0.45 * breath : 0.82 + 0.18 * breath;
      // 强度量化成 8 档（0–7）作为 sprite 缓存键
      const intensityBucket = Math.min(7, Math.max(0, Math.round(intensity * 8)));

      const wideBlur = Math.min(42, Math.max(14, maxHalf * 0.85 * (pulsing ? 0.85 + 0.3 * breath : 1)));
      const bandW = wideBlur * 0.6;
      // 只用于屏幕外剔除：sprite 的可见范围约为外沿 + 模糊尾巴，留足余量。
      const reach = maxHalf + bandW + wideBlur * 2;

      if (p.x + reach < 0 || p.x - reach > w || p.y + reach < 0 || p.y - reach > h) return;

      const color = (n.style('border-color') as string) || readThemeColors().accent2;
      const shape = n.style('shape') as string | undefined;

      // 只画"光"，不画任何一条线；并且是"实心"的，不是空心的。
      // 原因见原实现注释（轮廓近似与真实形状的误差只出现在被模糊掉的边缘）。
      // 做法：用 shadowBlur 把"光源"（画在节点外侧）的阴影投回节点位置——
      // shadowBlur / shadowOffset 是设备像素，不受 ctx.scale 影响，所以乘 dpr。
      // 基础实心底用 shadowBlur（只用一次，节点尺寸通常很小，开销可控）。
      const off = p.x + halfW + wideBlur * 2 + 60;
      ctx.save();
      ctx.shadowOffsetX = off * dpr;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';
      ctx.lineJoin = 'round';
      ctx.shadowColor = withAlpha(color, 0.42 * intensity);
      ctx.shadowBlur = Math.min(9, Math.max(4, maxHalf * 0.18)) * dpr;
      ctx.beginPath();
      this.traceOutline(ctx, p.x - off, p.y, getNodeOutline(shape, halfW, halfH));
      ctx.fill();
      ctx.restore();

      // 外/内光圈：各用一张离屏 sprite，每帧 drawImage（GPU 合成，零 shadowBlur）。
      const outerR = maxHalf + bandW + wideBlur;
      const outerSprite = this.getEmphSprite(color, outerR, intensityBucket);
      ctx.drawImage(outerSprite, p.x - outerR, p.y - outerR, outerR * 2, outerR * 2);

      const innerR = maxHalf + wideBlur * 0.5;
      const innerBucket = Math.min(7, Math.round(intensity * 7));
      const innerSprite = this.getEmphSprite(color, innerR, innerBucket);
      ctx.drawImage(innerSprite, p.x - innerR, p.y - innerR, innerR * 2, innerR * 2);

      drawn++;
    });

    ctx.restore();
  }

  private draw(elapsedMs: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const halos = this.collectHalos();
    const rings = this.collectFlowRings();
    this.lastVisibleCount = halos.length + rings.length;
    this.viewportMoved(); // 记录这一帧对应的镜头，供停帧状态下判断"镜头动过没有"

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

  /** 把多边形顶点连成闭合子路径（配合外层 fill 做实心光晕填充）。 */
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
    // 先用模型坐标做一次粗裁剪，避免为视口外的 ~1000 个节点逐个算 renderedPosition /
    // hasClass / visible。PAD 覆盖最大节点尺寸 + 光晕外扩（都在模型坐标里，不随 zoom 变）。
    const ext = this.cy.extent();
    const PAD = 120;

    nodes.forEach((n: cytoscape.NodeSingular) => {
      const mx = n.position('x');
      const my = n.position('y');
      if (mx < ext.x1 - PAD || mx > ext.x2 + PAD || my < ext.y1 - PAD || my > ext.y2 + PAD) return;
      // dimmed 的节点不该发光/流动 —— 它正被"关掉"。
      if (n.hasClass('dimmed')) return;
      // 选中的节点由强调层负责发光。这里再画一层渐变光晕会叠在节点上面把它染色
      // （类别填充色被盖住，看起来像"整个节点变黄"），也会和强调层的光叠成两圈。
      if (n.hasClass('selected-node')) return;
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
        color: (n.style('border-color') as string) || readThemeColors().accent,
      });
    });

    return out;
  }
}
