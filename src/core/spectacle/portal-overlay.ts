// src/core/spectacle/portal-overlay.ts
// 虫洞（portal-gate）：第五个装饰奇观，也是唯一带交互语义的装饰——
// 连接图谱中各个独立空间（药学宇宙 / 生存策略宇宙 / 奇观散点）的虫洞。
//
// 架构与另外四个奇观刻意平行而不是共享基类（同 emblem-overlay.ts 文件头的
// 理由）：虫洞的绘制循环（吸积盘 + 螺旋坠入粒子 + 事件视界）跟太极八卦的
// 文字环、超立方体的 4D 投影都没有可复用的公共部分，硬抽基类只会得到一个
// 互斥状态的上帝对象。各自的 canvas、各自的生命周期。
//
// 交互不在本文件：节点 tap 由 graph-events 拦截（PORTAL_ID 判定）后交给
// SpaceController 弹出空间菜单。这里只负责"虫洞长什么样"和"节点可点"。
//
// 视觉：
//   - 吸积盘：5 圈同心椭圆环（透视压缩 y 轴），不同速度反向旋转；
//     内圈青蓝（热）→ 外圈紫（冷）色温梯度。
//   - 螺旋粒子：每个粒子的轨道半径随时间收缩，越靠近核心角速度越快、
//     越亮；尾迹按 t 反推 3 个采样段、分两批合并 path 画衰减线段，
//     纯 t 函数无逐帧状态，掉帧不会累积误差；
//   - 事件视界：径向渐变暗核（中心更深、边缘略透，读作虚空）+ 亮边 +
//     外圈爱因斯坦环（引力透镜暗示）+ 紫色辉光。
//   - prefers-reduced-motion：只画一帧静态图，不起 rAF。
//   - 节点被空间隔离藏起来时（display:none）整帧跳过——canvas 清空即可。

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
/** 粒子数：足够密到像"物质流"，又不会在低端机上拖垮 30fps。 */
const PARTICLE_COUNT = 42;

type Particle = {
  /** 轨道相位（弧度）。 */
  phase: number;
  /** 径向坠落速度（每秒寿命占比）。 */
  rate: number;
  /** 起始寿命偏移，让粒子初始就散布在不同半径上。 */
  offset: number;
  /** 切向基础角速度（弧度/秒）。 */
  spin: number;
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

/** 虫洞与其它四个奇观同尺寸（统一视觉半径）。早期它被刻意画小一圈，但在一屏
 *  上"入口"比装饰小反而读作"次要"，与它承担的空间切换功能不符。 */
function pickRadius(cy: cytoscape.Core): number {
  // 尺寸统一由 spectacle-size 决定（五个奇观共用一个视觉半径）。
  // 吸积盘的 reach 是 R * 1.25，已登记在 DRAWN_EXTENT 里。
  return pickSpectacleParam(graphSpread(cy).spread, 'portal');
}

function hitboxSize(radius: number): number {
  return radius * 2 * 0.92;
}

/**
 * 抹掉 cytoscape 自身为这个节点画的所有可见 chrome（fill 的 defaultStroke、
 * 选中态边框等），只留一个透明的圆形命中盒。骨架同另外四个奇观的
 * stripNodeChrome：per-element style 永远盖过样式表选择器，一次压干净。
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
 * 往图里放传送门节点（内容树里已有则复用——它本来就是一份 md）。位置选
 * 当前视口中心而非随机点：传送门是"来路的锚点"，藏在画面外就没有意义。
 */
export function spawnPortalNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(PORTAL_ID);
  if (existing.nonempty()) {
    // 内容树里已有（它就是一份 md）：补上 portal-node class，让 renderer 的
    // DECOR_NODE 规则与另外四个奇观一视同仁，再压掉 cytoscape 自己的 chrome。
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
 *
 * 手算而不用 cy.center()：typings 里 cy.center(eles) 只有"把镜头移到某集合
 * 中心"这一个签名，无参的取值形态没被声明（3.34），用它会得到 `Core` 而不是
 * 坐标。反过来的换算跟 renderer.fit() 是同一套：rendered = model × zoom + pan。
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
  private readonly particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
    phase: Math.random() * Math.PI * 2,
    rate: 0.1 + Math.random() * 0.16,
    offset: Math.random(),
    spin: 0.5 + Math.random() * 0.9,
  }));

  private modelRadius = 140;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

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

    spawnPortalNode(this.cy);
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
        if (this.reducedMotion) this.draw(0); // 静态模式也要跟着画布尺寸重画
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
    const node = this.cy.getElementById(PORTAL_ID);
    // 只有本 overlay 自己创建的节点才移除（内容树来的归内容树）。
    if (node.nonempty() && node.hasClass(PORTAL_CLASS) && node.hasClass('layer-parent')) {
      this.cy.remove(node);
    }
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

  // ── 绘制 ──────────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    const node = this.cy.getElementById(PORTAL_ID);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    // 空间隔离：节点被藏起来（display:none）= 当前空间不含传送门所在空间——
    // 但 SpaceController 永远保留传送门可见，这里只是防御性兜底。
    if (node.empty() || !isElementShown(node)) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    const R = Math.max(this.modelRadius * zoom, 6);
    const rx = p.x;
    const ry = p.y;

    const reach = R * 1.25 + 20;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    )
      return;

    ctx.save();
    ctx.translate(rx, ry);

    // ── 吸积盘：5 圈色温梯度（内热青 → 外冷紫）+ dash/实线分组绘制 ──
    // 性能：原版每圈 setLineDash + stroke 各一次（5×2 状态切换），
    // 现在 dash 圈一组、实线圈一组各单 path 一次 stroke（2 次切换）。
    // 视觉：色温由内而外从青蓝（hue 200）渐变到紫（hue 270），盘面读出
    // "内热外冷"的层次，而非原来一坨紫雾。
    ctx.save();
    ctx.rotate(DISK_TILT);
    ctx.scale(1, DISK_SQUASH);

    // 第一组：dash 圈（i=0..3），内热青到中紫
    ctx.setLineDash([R * 0.16, R * 0.1]);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const rr = R * (0.34 + i * 0.165);
      ctx.moveTo(rr, 0);
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
    }
    ctx.strokeStyle = 'rgba(170,200,255,0.30)';
    ctx.lineWidth = Math.max(1, R * 0.012);
    ctx.lineDashOffset = -t * 0.06 * R * 2;
    ctx.stroke();

    // 第二组：实线圈（i=4），最外圈收口，冷紫
    ctx.setLineDash([]);
    ctx.beginPath();
    {
      const rr = R * (0.34 + 4 * 0.165);
      ctx.moveTo(rr, 0);
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
    }
    ctx.strokeStyle = 'rgba(167,139,250,0.18)';
    ctx.lineWidth = Math.max(1, R * 0.013);
    ctx.stroke();

    // ── 螺旋坠入的粒子（无尾迹，每粒单点 fill）─────────────────────
    ctx.beginPath();
    for (const pt of this.particles) {
      const uNow = (t * pt.rate + pt.offset) % 1;
      const angNow = pt.phase + t * pt.spin * (1.5 - uNow);
      const rrNow = R * (1 - uNow) * 0.98;
      const xNow = Math.cos(angNow) * rrNow;
      const yNow = Math.sin(angNow) * rrNow;
      const size = Math.max(0.8, R * 0.016 * (0.5 + uNow));
      ctx.moveTo(xNow + size, yNow);
      ctx.arc(xNow, yNow, size, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(196,181,253,0.6)';
    ctx.fill();
    ctx.restore();

    // ── 事件视界 + 爱因斯坦环（引力透镜暗示）─────────────────────────
    const coreR = R * 0.22;
    // 爱因斯坦环：盘面之上的一圈细亮蓝环。先画环再画暗核，让暗核的填色
    // 盖在环的内沿，环只露出 coreR*1.45 之外的那一段。
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 1.45, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(165,220,255,0.42)';
    ctx.lineWidth = Math.max(0.6, R * 0.006);
    ctx.stroke();
    // 暗核：径向渐变（中心更深、边缘略透）——读作"虚空"而非"贴黑片"。
    // 原版 fillStyle = '#0b0614' 是硬色，事件视界像贴了一块黑胶布。
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    core.addColorStop(0, '#04020a');
    core.addColorStop(0.7, '#0b0614');
    core.addColorStop(1, 'rgba(11,6,20,0.86)');
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.shadowColor = 'rgba(139,92,246,0.55)';
    ctx.shadowBlur = coreR * 0.6;
    ctx.fill();
    ctx.shadowBlur = 0;
    // 亮边
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(196,181,253,0.85)';
    ctx.lineWidth = Math.max(1, R * 0.01);
    ctx.stroke();

    ctx.restore();
  }
}

export function createPortalOverlay(options: PortalOverlayOptions): PortalOverlay {
  return new PortalOverlay(options);
}
