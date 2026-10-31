// src/core/spectacle/indra-net-overlay.ts
// 华严因陀罗宝珠网 · 曼德勃罗分形（indra-net）：第七个装饰奇观。
//
// 为什么用「曼德勃罗集（Mandelbrot Set, z_{n+1} = z_n^2 + c）」呈现因陀罗宝珠网？
//   1. 视觉唯一性：彻底区别于 E8 根系与太极八卦的「同心圆环 + 直线弦网」，以复平面动力学
//      分形独有的「主心形（Cardioid）+ 倍周期级联芽苞（Period Bulbs）+ 海马谷螺旋触须 +
//      针尖无限嵌套婴儿曼德勃罗集（Mini-brots）」构筑极具辨识度的深空奇观。
//   2. 哲学与数学的完美同构（《个人成长与生存策略》第一章《本体全连图：因陀罗网与隐缠序》
//      & 第四章《分形自相似与同构：隐喻为什么能讲道理》）：
//      - 极简生成律涌现无穷复杂性：仅凭一条二次复迭代方程 z_{n+1} = z_n^2 + c（z_0 = 0），
//        便在复平面上自然生长出无穷无尽的精细几何结构；
//      - 珠珠相映（Hyperbolic Bulb Pearls）：主心形周围按有理内角 p/q 相切生长出无穷多颗
//        近似圆形的「周期芽苞（摩尼宝珠）」，每颗芽苞内部都有一颗超吸引周期核（|z_n| -> 0）；
//      - 一珠映全网（Mini-brot Self-Similarity）：沿着任意触须放大，每一颗细若微尘的节点深处，
//        都完整嵌套着一尊与整体拓扑同构的「微缩曼德勃罗集（婴儿集）」——这正是华严因陀罗网
//        「取一珠验之，即此一珠能顿现一切珠影，重重无尽」最严格的现代数学化身！
//
// 核心渲染架构（离屏 DEM 像素着色器烘焙 + 实时临界轨道动力学 + 语义级全息放大镜）：
//   1. 离屏高精度分形烘焙（`ensureFractalCache`，仅首次绘制或 DPR 变化时计算一次）：
//      - 同步迭代 z_{n+1} = z_n^2 + c 与导数 dz_{n+1} = 2 z_n dz_n + 1；
//      - 外部逃逸区：结合平滑迭代势函数 ν = n + 1 - log2(log(|z_n|)) 与解析边界距离估计
//        DEM（d = |z_n| ln|z_n| / |dz_n|），将纤细如发丝的海马谷触须、针尖天线与微缩婴儿集
//        点亮为璀璨的暖金-琉璃青电光丝网，外围等势流线平滑消隐于深空（无生硬圆框边界）；
//      - 内部收敛区（摩尼宝珠内腔）：追踪周期轨道陷阱 min|z_n|（Orbit Trap），让主心形与
//        各级周期芽苞内部呈现出中心暖金、内腔深邃蓝宝石般的立体琉璃摩尼宝珠质感！
//   2. 实时动态层（30fps 轻量级矢量叠加，常态每帧耗时 < 0.15ms）：
//      - 动态临界轨道星链（Live Critical Orbit）：一颗探测参数点 c(t) 沿主心形边界、海马谷与
//        二/三周期芽苞漫游，实时绘出 z_0 -> z_1 -> z_2 -> ... -> z_{20} 的迭代折线轨迹
//        （在主心形内收敛为单点螺旋、在二周期宝珠内化作双星往复桥、在三周期宝珠内化作旋转金三角）；
//      - 语义级 LOD 全息放大镜（R >= 60）：当镜头拉近时，在针尖婴儿集（c = -1.7549 + 0i）处
//        展开一枚全息投影子视窗，直观展示触须微尘中完整重现的微缩曼德勃罗全形！
//   3. 佛光背光层（先于分形绘制；重图层全部离屏烘焙，逐帧仅 drawImage + 少量矢量路径）：
//      - 后光氤氲：以海马谷束腰「心轮」为光心的暖金—玫瑰色径向柔光；
//      - 万丈光芒：七十二道长短错落的金/青/粉光束，双层逆向缓转，彼此叠加出流动的光斑；
//      - 七彩宝光环：峨眉「佛光」式的紫—蓝—青—绿—黄—橙—红同心光环，随呼吸微微涨缩；
//      - 一〇八念珠环：108 颗圆珠沿光环缓缓巡行，四颗母珠金光四射；
//      - 舟形身光（Mandorla）：三重焰边的尖拱形光背，边缘有两粒流光循环游走；
//      - 莲花台：双层莲瓣自葫芦底部绽开，托起主心形；
//      - 光尘升腾：自莲台升向葫芦蒂的金色光点与十字星芒（绘于分形之上）；
//      - 珠网丝线：每颗周期宝珠与最近的三颗宝珠以丝线相连，丝上光点往来——「珠影互映」。
//      性能：佛光各层合计约 10 次 drawImage + 数十条矢量路径；按 R 分级 LOD（R >= 12 氤氲与光芒，
//      R >= 24 光环/念珠/身光，R >= 28 光尘，R >= 40 莲台与流光），低端设备超预算时可上调这些阈值。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

export const INDRA_NET_ID = 'indra-net';
const INDRA_CLASS = 'indra-net-node';

/** 临界轨道漫游与全息呼吸周期（秒） */
const CYCLE = 16;

/**
 * 复平面视窗映射参数：
 * 将单位圆盘 [-1, 1] x [-1, 1] 映射到复平面：
 *   Re(c) = CENTER_RE + nx * SPAN_R  (nx ∈ [-1, 1] -> [-2.08, 0.76])
 *   Im(c) = CENTER_IM + ny * SPAN_R  (ny ∈ [-1, 1] -> [-1.42, 1.42])
 * 使得主心形 [-0.75, 0.25]、二周期主宝珠 [-1.25, -0.75]、针尖婴儿集 (-1.755, 0)
 * 与上下三周期宝珠 (-0.123, ±0.745) 完美居中于奇观视野中央。
 */
export const CENTER_RE = -0.66;
export const CENTER_IM = 0.0;
export const SPAN_R = 1.42;

/** 离屏分形光栅化网格尺寸（逻辑像素边长，兼顾丝滑发丝细节与毫秒级首次生成速度） */
const RASTER_SIZE = 380;
const MAX_ITER = 112;
const ESCAPE_R2 = 256;

// ── 佛光（背光）几何常量 ─────────────────────────────────────────────────────
// 除特别注明外，长度单位均为 span（= R * 1.08，即分形贴图半边长）。

/** 佛光光心纵坐标：落在葫芦重心略偏上，贴近「海马谷束腰」心轮处 */
const HALO_CY = -0.12;
/** 万丈光芒外沿半径 */
const HALO_RAY_REACH = 1.75;
/** 七彩宝光环的内、外沿半径 */
const HALO_GLORY_INNER = 1.14;
const HALO_GLORY_OUTER = 1.42;
/** 念珠环半径与珠数（一百〇八烦恼，一珠一念） */
const HALO_BEAD_RADIUS = 1.28;
const HALO_BEAD_COUNT = 108;
/** 舟形身光：中心纵坐标 / 半高 / 半宽（由主心形 + 二周期宝珠 + 针尖天线的包络拟合） */
const MANDORLA = { cy: -0.13, a: 1.0, w: 0.72 } as const;
/** 光芒/光环/氤氲离屏贴图边长（像素） */
const AURA_CACHE_SIZE = 256;
const RAY_CACHE_SIZE = 640;
const GLORY_CACHE_SIZE = 512;
const SPRITE_SIZE = 64;

/** 确定性伪随机 [0, 1)：让光束长短、光尘位置在每次渲染中稳定，无需 Math.random */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 尖拱形（vesica piscis）几何：由两个等半径圆弧相交而成，
 * 给定半高 a 与半宽 w，返回圆弧半径 rho、圆心水平偏移 d 与尖端半张角 phi0。
 */
function almondGeometry(a: number, w: number): { rho: number; d: number; phi0: number } {
  const rho = (a * a / w + w) / 2;
  const d = (a * a / w - w) / 2;
  return { rho, d, phi0: Math.asin(Math.min(1, a / rho)) };
}

export interface ComplexPoint {
  readonly re: number;
  readonly im: number;
}

export interface BulbPearl {
  readonly name: string;
  readonly re: number;
  readonly im: number;
  readonly radius: number;
  readonly period: number;
}

/**
 * 曼德勃罗集主心形与主天线上的标志性超吸引周期芽苞（摩尼宝珠）精确解析中心：
 * 每一颗芽苞对应有理内角 p/q 的双曲分量中心（满足 f_c^q(0) = 0）。
 */
export const MANDELBROT_BULBS: readonly BulbPearl[] = [
  { name: '主心形 · 一周期母珠', re: 0.0, im: 0.0, radius: 0.32, period: 1 },
  { name: '二周期主宝珠', re: -1.0, im: 0.0, radius: 0.25, period: 2 },
  { name: '三周期北宝珠 (p/q=1/3)', re: -0.122561, im: 0.744862, radius: 0.095, period: 3 },
  { name: '三周期南宝珠 (p/q=2/3)', re: -0.122561, im: -0.744862, radius: 0.095, period: 3 },
  { name: '四周期主轴宝珠', re: -1.310703, im: 0.0, radius: 0.059, period: 4 },
  { name: '四周期北侧宝珠 (p/q=1/4)', re: 0.282271, im: 0.530061, radius: 0.048, period: 4 },
  { name: '四周期南侧宝珠 (p/q=3/4)', re: 0.282271, im: -0.530061, radius: 0.048, period: 4 },
  { name: '五周期北侧宝珠 (p/q=2/5)', re: -0.50434, im: 0.562766, radius: 0.036, period: 5 },
  { name: '五周期南侧宝珠 (p/q=3/5)', re: -0.50434, im: -0.562766, radius: 0.036, period: 5 },
  { name: '针尖三周期婴儿曼德勃罗集', re: -1.754878, im: 0.0, radius: 0.028, period: 3 },
];

export interface MandelbrotSample {
  readonly escaped: boolean;
  readonly iterations: number;
  readonly smoothIter: number;
  /** 外部边界距离估计（归一化到复平面单位） */
  readonly distance: number;
  /** 内部轨道离原点最近距离（用于渲染周期芽苞内部的摩尼宝珠光泽） */
  readonly minOrbitTrap: number;
}

/**
 * 纯函数：计算复平面上单点 c = (cr, ci) 的曼德勃罗迭代、平滑逃逸势、
 * 解析边界距离估计（DEM）以及内部超吸引周期轨道陷阱距离。
 */
export function evaluateMandelbrotPoint(
  cr: number,
  ci: number,
  maxIter: number = MAX_ITER,
): MandelbrotSample {
  let zr = 0;
  let zi = 0;
  let dzr = 0;
  let dzi = 0;
  let minTrap2 = 1e9;
  let n = 0;

  for (; n < maxIter; n++) {
    // dz_{n+1} = 2 * z_n * dz_n + 1
    const nextDzr = 2 * (zr * dzr - zi * dzi) + 1;
    const nextDzi = 2 * (zr * dzi + zi * dzr);
    dzr = nextDzr;
    dzi = nextDzi;

    // z_{n+1} = z_n^2 + c
    const zr2 = zr * zr;
    const zi2 = zi * zi;
    zi = 2 * zr * zi + ci;
    zr = zr2 - zi2 + cr;

    const mag2 = zr * zr + zi * zi;
    if (n >= 1 && mag2 < minTrap2) {
      minTrap2 = mag2;
    }
    if (mag2 > ESCAPE_R2) {
      const mag = Math.sqrt(mag2);
      const dzMag = Math.hypot(dzr, dzi);
      const logMag = Math.log(mag);
      const smooth = n + 1 - Math.log(logMag) / Math.LN2;
      const dist = dzMag > 1e-12 ? (mag * logMag) / dzMag : 0;
      return {
        escaped: true,
        iterations: n,
        smoothIter: smooth,
        distance: dist,
        minOrbitTrap: Math.sqrt(minTrap2),
      };
    }
  }

  return {
    escaped: false,
    iterations: maxIter,
    smoothIter: maxIter,
    distance: 0,
    minOrbitTrap: Math.sqrt(minTrap2),
  };
}

/**
 * 纯函数：生成给定参数 c = (cr, ci) 的前 steps 步临界轨道序列 z_0, z_1, ..., z_steps。
 */
export function computeCriticalOrbit(
  cr: number,
  ci: number,
  steps: number = 20,
): ComplexPoint[] {
  const path: ComplexPoint[] = [{ re: 0, im: 0 }];
  let zr = 0;
  let zi = 0;
  for (let i = 0; i < steps; i++) {
    const nextZr = zr * zr - zi * zi + cr;
    const nextZi = 2 * zr * zi + ci;
    zr = nextZr;
    zi = nextZi;
    // 防止逃逸点在屏幕上飞出无穷远
    const mag = Math.hypot(zr, zi);
    if (mag > 2.2) {
      path.push({ re: (zr / mag) * 2.2, im: (zi / mag) * 2.2 });
      break;
    }
    path.push({ re: zr, im: zi });
  }
  return path;
}

/**
 * 复平面坐标 (re, im) -> 归一化画布坐标 (nx, ny) ∈ [-1, 1]（竖直宝葫芦构图）：
 * - 实轴 Re(c) 沿竖直方向 ny 排布：下方 ny > 0 为主心形大肚（Re ≈ 0），
 *   中间为海马谷束腰（Re = -0.75），上方 ny < 0 为二周期小肚（Re = -1）与葫芦蒂针尖（Re -> -2）；
 * - 虚轴 Im(c) 沿水平方向 nx 左右对称展开。
 */
export function complexToNorm(re: number, im: number): { nx: number; ny: number } {
  return {
    nx: (im - CENTER_IM) / SPAN_R,
    ny: (re - CENTER_RE) / SPAN_R,
  };
}

let pearlThreadsCache: ReadonlyArray<readonly [number, number]> | null = null;

/**
 * 珠网丝线拓扑（只计算一次）：每颗宝珠连向离自己最近的三颗宝珠，去重后得到的无向边集，
 * 即「重重无尽」的因陀罗网在画面上的骨架。
 */
function getPearlThreads(): ReadonlyArray<readonly [number, number]> {
  if (pearlThreadsCache) return pearlThreadsCache;
  const pts = MANDELBROT_BULBS.map((b) => complexToNorm(b.re, b.im));
  const seen = new Set<string>();
  const edges: Array<readonly [number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const nearest = pts
      .map((p, j) => ({ j, d: Math.hypot(p.nx - pts[i].nx, p.ny - pts[i].ny) }))
      .filter((o) => o.j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 3);
    for (const o of nearest) {
      const lo = Math.min(i, o.j);
      const hi = Math.max(i, o.j);
      const key = `${lo}-${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([lo, hi]);
    }
  }
  pearlThreadsCache = edges;
  return edges;
}

// ── 节点生命周期辅助 ──────────────────────────────────────────────────────────

function graphSpread(cy: cytoscape.Core): {
  bb: { x1: number; y1: number; x2: number; y2: number };
  spread: number;
} {
  let bb = { x1: -500, y1: -500, x2: 500, y2: 500 };
  try {
    const real = cy.nodes().not('.layer-parent').boundingBox();
    if (Number.isFinite(real.x1) && Number.isFinite(real.y1) && real.w > 0 && real.h > 0) bb = real;
  } catch {
    /* 图尚未就绪时用兜底范围 */
  }
  return { bb, spread: Math.max(bb.x2 - bb.x1, bb.y2 - bb.y1, 400) };
}

function pickRadius(cy: cytoscape.Core): number {
  return pickSpectacleParam(graphSpread(cy).spread, 'indra-net');
}

function hitboxSize(radius: number): number {
  return radius * 2 * 0.92;
}

function pickSpawnPoint(cy: cytoscape.Core): { x: number; y: number } {
  const { bb } = graphSpread(cy);
  return {
    x: bb.x1 + Math.random() * (bb.x2 - bb.x1),
    y: bb.y1 + Math.random() * (bb.y2 - bb.y1),
  };
}

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
    ghost: 'no' as const,
  });
}

export function spawnIndraNetNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(INDRA_NET_ID);
  if (existing.nonempty()) {
    existing.addClass(`layer-parent ${INDRA_CLASS}`);
    stripNodeChrome(existing, size);
    return existing;
  }

  const { x, y } = pickSpawnPoint(cy);
  const node = cy.add({
    group: 'nodes',
    data: { id: INDRA_NET_ID, label: '华严因陀罗宝珠网' },
    position: { x, y },
    classes: `layer-parent ${INDRA_CLASS}`,
  });
  stripNodeChrome(node, size);
  void loadDecorContent(node);
  return node;
}

// ── 覆盖层主类 ────────────────────────────────────────────────────────────────

export interface IndraNetOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  fps?: number;
}

export class IndraNetOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  private indraNode: cytoscape.NodeSingular | null = null;
  private modelRadius = 220;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  /** 离屏烘焙的高清曼德勃罗分形画布（仅生成一次，缩放/平移零开销） */
  private fractalCache: HTMLCanvasElement | null = null;
  /** 针尖婴儿曼德勃罗集（Mini-brot）特写离屏缓存，用于放大时的全息子视窗 */
  private minibrotCache: HTMLCanvasElement | null = null;
  /** 佛光离屏贴图：后光氤氲 / 万丈光芒 / 七彩宝光环 / 通用金色柔光精灵（均只烘焙一次） */
  private auraCache: HTMLCanvasElement | null = null;
  private rayCache: HTMLCanvasElement | null = null;
  private gloryCache: HTMLCanvasElement | null = null;
  private glowSprite: HTMLCanvasElement | null = null;

  private rafId: number | null = null;
  private startedAt = 0;
  private lastDrawAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  constructor(options: IndraNetOverlayOptions) {
    this.cy = options.cy;
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.indraNode = spawnIndraNetNode(this.cy);
    this.modelRadius = pickRadius(this.cy);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-indra-net-overlay', '');
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
        if (this.reducedMotion) this.draw(CYCLE * 0.25);
      });
      this.resizeObserver.observe(container);
    }
    document.addEventListener('visibilitychange', this.onVisibility);

    if (this.reducedMotion) {
      this.draw(CYCLE * 0.25);
    } else {
      this.start();
    }
  }

  reroll(): void {
    const node = this.getIndraNode();
    if (!node || !isElementShown(node)) return;
    const { x, y } = pickSpawnPoint(this.cy);
    node.position({ x, y });
    this.modelRadius = pickRadius(this.cy);
    stripNodeChrome(node, hitboxSize(this.modelRadius));
    if (this.reducedMotion) this.draw(CYCLE * 0.25);
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
    const node = this.getIndraNode();
    if (node) this.cy.remove(node);
    this.indraNode = null;
  }

  private getIndraNode(): cytoscape.NodeSingular | null {
    if (this.indraNode && this.indraNode.nonempty() && !this.indraNode.removed()) {
      return this.indraNode;
    }
    const found = this.cy.getElementById(INDRA_NET_ID);
    this.indraNode = found.nonempty() ? found : null;
    return this.indraNode;
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
    this.rafId = requestAnimationFrame(this.tick);
  }

  private pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private resume(): void {
    if (this.rafId === null && !this.reducedMotion) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (now: number): void => {
    this.rafId = requestAnimationFrame(this.tick);
    if (now - this.lastDrawAt < this.frameInterval) return;
    this.lastDrawAt = now;
    this.draw((now - this.startedAt) / 1000);
  };

  // ── 离屏烘焙：曼德勃罗集 DEM 边界电光 + 摩尼宝珠内腔轨道陷阱着色 ─────────

  private ensureFractalCache(): HTMLCanvasElement | null {
    if (this.fractalCache) return this.fractalCache;

    const N = RASTER_SIZE;
    const cv = document.createElement('canvas');
    cv.width = N;
    cv.height = N;
    const c = cv.getContext('2d');
    if (!c) return null;

    const img = c.createImageData(N, N);
    const data = img.data;
    const pixelScale = (2 * SPAN_R) / N;

    for (let py = 0; py < N; py++) {
      const ny = (py / (N - 1)) * 2 - 1; // [-1, 1] 竖直方向对应实部 Re(c)：上小肚下大肚
      const cr = CENTER_RE + ny * SPAN_R;

      for (let px = 0; px < N; px++) {
        const nx = (px / (N - 1)) * 2 - 1; // [-1, 1] 水平方向对应虚部 Im(c)：左右对称
        const radial2 = nx * nx + ny * ny;
        const idx = (py * N + px) * 4;

        // 圆形视界边缘平滑羽化（避免出现方形画布切边）
        if (radial2 >= 1.0) {
          data[idx + 3] = 0;
          continue;
        }
        const radialDist = Math.sqrt(radial2);
        const radialFade =
          radialDist < 0.72
            ? 1.0
            : Math.pow(Math.max(0, (1.0 - radialDist) / 0.28), 1.6);

        const ci = CENTER_IM + nx * SPAN_R;
        const sample = evaluateMandelbrotPoint(cr, ci, MAX_ITER);

        if (!sample.escaped) {
          // ── 内部收敛区（摩尼宝珠内腔）：利用 minOrbitTrap 渲染琉璃宝珠光泽 ──
          // 在每个周期芽苞中心，minOrbitTrap -> 0，发出暖金/冰青珠心微光；
          // 靠近分形海岸线处呈现深邃的午夜蓝宝石色，衬托外部金青海岸线。
          const trap = Math.min(1, sample.minOrbitTrap * 2.4);
          const coreGlow = Math.pow(1 - trap, 3.2);
          const rimHint = Math.pow(trap, 1.8);

          const r = Math.round(14 + coreGlow * 235 + rimHint * 28);
          const g = Math.round(24 + coreGlow * 210 + rimHint * 82);
          const b = Math.round(58 + coreGlow * 140 + rimHint * 145);
          const alpha = Math.round(242 * radialFade);

          data[idx] = Math.min(255, r);
          data[idx + 1] = Math.min(255, g);
          data[idx + 2] = Math.min(255, b);
          data[idx + 3] = alpha;
        } else {
          // ── 外部逃逸区：解析距离估计（DEM）发丝电光 + 等势流线色带 ──
          const nu = Math.max(0, sample.smoothIter);
          // 归一化像素距离 d_px = distance / pixelScale
          const dPx = sample.distance / pixelScale;
          // 分形海岸线与海马谷/针尖触须电光高亮（dPx 越小越亮）
          const filamentGlow = Math.exp(-dPx * 0.55);
          // 海岸线外侧的暖色柔光晕（衰减长度约 11 像素），与背光层的佛光自然衔接
          const softGlow = Math.exp(-dPx * 0.09);
          // 对数平滑色相参数
          const logNu = Math.log(nu + 1) / Math.log(MAX_ITER + 1);
          // 等势波纹调制（展现复势函数 G(c) 的伯努利双纽线层级）
          const equipotential = 0.5 + 0.5 * Math.sin(nu * 0.85);

          // 色彩映射：远场深空紫蓝 -> 中场天青/翡翠 -> 近岸璀璨暖金与纯白星芒
          const baseR =
            38 * (1 - logNu) +
            56 * logNu +
            filamentGlow * (250 - 56) +
            softGlow * 26 +
            equipotential * 18 * logNu;
          const baseG =
            22 * (1 - logNu) +
            189 * logNu +
            filamentGlow * (240 - 189) +
            softGlow * 12 +
            equipotential * 28 * logNu;
          const baseB =
            95 * (1 - logNu) +
            248 * logNu +
            filamentGlow * (175 - 248);

          // 外部透明度：越靠近分形边界与触须越实，向外围星空自然消隐
          const outerVisibility = Math.min(
            1,
            Math.pow(logNu, 0.72) * 0.88 + filamentGlow * 0.95 + softGlow * 0.2,
          );
          const alpha = Math.round(255 * outerVisibility * radialFade);

          data[idx] = Math.min(255, Math.max(0, Math.round(baseR)));
          data[idx + 1] = Math.min(255, Math.max(0, Math.round(baseG)));
          data[idx + 2] = Math.min(255, Math.max(0, Math.round(baseB)));
          data[idx + 3] = alpha;
        }
      }
    }

    c.putImageData(img, 0, 0);
    this.fractalCache = cv;
    return cv;
  }

  /**
   * 离屏烘焙针尖三周期「婴儿曼德勃罗集（Mini-brot, c ≈ -1.75488 + 0i）」的微缩特写：
   * 窗口中心 (-1.758, 0)，半径 0.038，用于放大时在全息透镜中展示「微尘中见大千世界」。
   */
  private ensureMinibrotCache(): HTMLCanvasElement | null {
    if (this.minibrotCache) return this.minibrotCache;

    const M = 110;
    const cv = document.createElement('canvas');
    cv.width = M;
    cv.height = M;
    const c = cv.getContext('2d');
    if (!c) return null;

    const img = c.createImageData(M, M);
    const data = img.data;
    const miniCenterRe = -1.7685;
    const miniCenterIm = 0.0;
    const miniSpan = 0.042;
    const miniMaxIter = 180;
    const pixelScale = (2 * miniSpan) / M;

    for (let py = 0; py < M; py++) {
      const ny = (py / (M - 1)) * 2 - 1;
      const cr = miniCenterRe + ny * miniSpan;
      for (let px = 0; px < M; px++) {
        const nx = (px / (M - 1)) * 2 - 1;
        const r2 = nx * nx + ny * ny;
        const idx = (py * M + px) * 4;
        if (r2 > 1.0) {
          data[idx + 3] = 0;
          continue;
        }
        const ci = miniCenterIm + nx * miniSpan;
        const s = evaluateMandelbrotPoint(cr, ci, miniMaxIter);
        const edgeFade = r2 < 0.78 ? 1 : (1 - Math.sqrt(r2)) / 0.22;

        if (!s.escaped) {
          // 婴儿曼德勃罗集本体：耀眼的暖金琥珀色核心
          data[idx] = 254;
          data[idx + 1] = 240;
          data[idx + 2] = 138;
          data[idx + 3] = Math.round(245 * edgeFade);
        } else {
          const dPx = s.distance / pixelScale;
          const glow = Math.exp(-dPx * 0.45);
          data[idx] = Math.round(35 + glow * 215);
          data[idx + 1] = Math.round(110 + glow * 135);
          data[idx + 2] = Math.round(185 + glow * 70);
          data[idx + 3] = Math.round((45 + glow * 205) * edgeFade);
        }
      }
    }

    c.putImageData(img, 0, 0);
    this.minibrotCache = cv;
    return cv;
  }

  // ── 离屏烘焙：佛光各层贴图（各自只生成一次） ───────────────────────────

  /** 通用金色柔光精灵：珠影光点、光尘、流光、念珠母珠共用 */
  private ensureGlowSprite(): HTMLCanvasElement | null {
    if (this.glowSprite) return this.glowSprite;
    const S = SPRITE_SIZE;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const c = cv.getContext('2d');
    if (!c) return null;

    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255, 252, 235, 1)');
    g.addColorStop(0.16, 'rgba(255, 240, 170, 0.8)');
    g.addColorStop(0.42, 'rgba(253, 210, 80, 0.24)');
    g.addColorStop(1, 'rgba(253, 200, 60, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);

    this.glowSprite = cv;
    return cv;
  }

  /** 后光氤氲：暖金 → 琥珀 → 玫瑰 → 靛青的径向柔光（半径 = 贴图半边长） */
  private ensureAuraCache(): HTMLCanvasElement | null {
    if (this.auraCache) return this.auraCache;
    const S = AURA_CACHE_SIZE;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const c = cv.getContext('2d');
    if (!c) return null;

    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255, 244, 200, 0.46)');
    g.addColorStop(0.18, 'rgba(253, 230, 138, 0.30)');
    g.addColorStop(0.42, 'rgba(251, 191, 36, 0.13)');
    g.addColorStop(0.68, 'rgba(244, 114, 182, 0.045)');
    g.addColorStop(1, 'rgba(129, 140, 248, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);

    this.auraCache = cv;
    return cv;
  }

  /**
   * 万丈光芒：72 道长短错落的楔形光束（每 6 道为一道主光），自光心向外渐隐。
   * 主光为暖金，辅光在淡青与淡粉间交替；以 `lighter` 叠加，交汇处自然生出更亮的光斑。
   */
  private ensureRayCache(): HTMLCanvasElement | null {
    if (this.rayCache) return this.rayCache;
    const S = RAY_CACHE_SIZE;
    const h = S / 2;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const c = cv.getContext('2d');
    if (!c) return null;

    c.globalCompositeOperation = 'lighter';
    const COUNT = 72;
    const r0 = h * 0.3;
    for (let i = 0; i < COUNT; i++) {
      const major = i % 6 === 0;
      const ang = (i / COUNT) * Math.PI * 2 + (hash01(i) - 0.5) * 0.05;
      const len = h * (major ? 0.98 : 0.52 + 0.4 * hash01(i + 17));
      const halfW = major ? 0.05 : 0.014 + 0.016 * hash01(i + 31);
      const alpha = major ? 0.3 : 0.1 + 0.1 * hash01(i + 47);
      const rgb = major ? '255, 232, 150' : i % 2 ? '186, 238, 255' : '255, 214, 190';
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);

      const grad = c.createLinearGradient(h + cx * r0, h + cy * r0, h + cx * len, h + cy * len);
      grad.addColorStop(0, `rgba(${rgb}, 0)`);
      grad.addColorStop(0.14, `rgba(${rgb}, ${alpha})`);
      grad.addColorStop(0.45, `rgba(${rgb}, ${alpha * 0.5})`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);

      c.beginPath();
      c.moveTo(h + Math.cos(ang - halfW) * r0, h + Math.sin(ang - halfW) * r0);
      c.lineTo(h + cx * len, h + cy * len);
      c.lineTo(h + Math.cos(ang + halfW) * r0, h + Math.sin(ang + halfW) * r0);
      c.closePath();
      c.fillStyle = grad;
      c.fill();
    }

    this.rayCache = cv;
    return cv;
  }

  /** 七彩宝光环：峨眉「佛光」式同心彩环，内紫外红（半径 = HALO_GLORY_OUTER） */
  private ensureGloryCache(): HTMLCanvasElement | null {
    if (this.gloryCache) return this.gloryCache;
    const S = GLORY_CACHE_SIZE;
    const h = S / 2;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const c = cv.getContext('2d');
    if (!c) return null;

    const inner = HALO_GLORY_INNER / HALO_GLORY_OUTER;
    const bands: ReadonlyArray<readonly [number, number, number]> = [
      [150, 120, 255],
      [96, 165, 250],
      [103, 232, 249],
      [110, 231, 160],
      [253, 224, 71],
      [251, 146, 60],
      [248, 113, 113],
    ];
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, 'rgba(150, 120, 255, 0)');
    g.addColorStop(inner, 'rgba(150, 120, 255, 0)');
    bands.forEach(([cr, cg, cb], k) => {
      const pos = inner + (1 - inner) * (0.1 + 0.8 * (k / (bands.length - 1)));
      g.addColorStop(pos, `rgba(${cr}, ${cg}, ${cb}, 0.17)`);
    });
    g.addColorStop(1, 'rgba(248, 113, 113, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);

    this.gloryCache = cv;
    return cv;
  }

  // ── 逐帧绘制 ──────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const node = this.getIndraNode();
    if (!node || !isElementShown(node)) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    const R = Math.max(this.modelRadius * zoom, 8);
    const rx = p.x;
    const ry = p.y;

    // 佛光万丈光芒外沿可达 HALO_RAY_REACH * 1.08 ≈ 1.9R，裁剪范围需随之放宽
    const reach = R * 2.0 + 24;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    ) {
      return;
    }

    const breathe = this.reducedMotion ? 1 : 1 + 0.012 * Math.sin(t * 0.5);

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(breathe, breathe);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 0. 佛光背光：氤氲 / 万丈光芒 / 七彩宝光环 / 念珠环 / 舟形身光 / 莲花台
    //    （先于分形绘制，使光芒自分形外沿半透明的 DEM 光晕与海岸线缝隙中透出）
    if (R >= 12) {
      this.drawBuddhaHalo(ctx, R, t);
    }

    // 1. 绘制离屏烘焙的高清曼德勃罗集（含 DEM 发丝电光 + 摩尼宝珠内腔）
    const fractal = this.ensureFractalCache();
    if (fractal) {
      const span = R * 1.08;
      ctx.drawImage(fractal, -span, -span, span * 2, span * 2);
    }

    // 2. 绘制主心形与各级周期芽苞中心的「摩尼宝珠星核」谐波呼吸
    if (R >= 24) {
      this.drawPeriodBulbPearls(ctx, R, t);
    }

    // 3. 绘制实时演化的复动力系统临界轨道 z_{n+1} = z_n^2 + c(t)
    if (R >= 32) {
      this.drawLiveCriticalOrbit(ctx, R, t);
    }

    // 3.5 光尘升腾：自莲台升向葫芦蒂的金色光点与十字星芒（浮于分形之上）
    if (R >= 28) {
      this.drawLightMotes(ctx, R, t);
    }

    // 4. 语义级全息 LOD（R >= 65）：开启「针尖婴儿集（Mini-brot）全息放大透镜」
    if (R >= 65) {
      this.drawMinibrotHologramLens(ctx, R, t);
    }

    ctx.restore();
  }

  /**
   * 佛光背光（绘于分形之下）：后光氤氲 → 万丈光芒 → 七彩宝光环与念珠环 → 舟形身光 → 莲花台。
   * 按 R 分级 LOD：最小尺度仅保留氤氲与光芒，R >= 24 加入光环与身光，R >= 40 加入莲台与流光。
   */
  private drawBuddhaHalo(ctx: CanvasRenderingContext2D, R: number, t: number): void {
    const span = R * 1.08;
    const cy = HALO_CY * span;
    const pulse = 0.9 + 0.1 * Math.sin(t * 0.9);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 1) 后光氤氲
    const aura = this.ensureAuraCache();
    if (aura) {
      const ar = span * 1.75;
      ctx.globalAlpha = pulse;
      ctx.drawImage(aura, -ar, cy - ar, ar * 2, ar * 2);
    }

    // 2) 万丈光芒：同一张光束图以两种尺度逆向缓转（周期约 3 分钟 / 4.8 分钟），叠出缓缓流动的光斑
    const rays = this.ensureRayCache();
    if (rays) {
      const rr = span * HALO_RAY_REACH;
      ctx.save();
      ctx.translate(0, cy);
      ctx.rotate(t * 0.035);
      ctx.globalAlpha = 0.9 * pulse;
      ctx.drawImage(rays, -rr, -rr, rr * 2, rr * 2);
      ctx.restore();

      const rr2 = rr * 0.82;
      ctx.save();
      ctx.translate(0, cy);
      ctx.rotate(0.13 - t * 0.022);
      ctx.globalAlpha = 0.55 * pulse;
      ctx.drawImage(rays, -rr2, -rr2, rr2 * 2, rr2 * 2);
      ctx.restore();
    }

    if (R >= 24) {
      // 3) 七彩宝光环：随呼吸微微涨缩
      const glory = this.ensureGloryCache();
      if (glory) {
        const gr = span * HALO_GLORY_OUTER * (1 + 0.015 * Math.sin(t * 0.7));
        ctx.globalAlpha = 0.95;
        ctx.drawImage(glory, -gr, cy - gr, gr * 2, gr * 2);
      }

      // 4) 一〇八念珠环
      const beadR = span * HALO_BEAD_RADIUS;
      const gap = (Math.PI * 2 * beadR) / HALO_BEAD_COUNT;
      const march = 0.35; // 每秒巡行的珠数
      ctx.save();
      ctx.translate(0, cy);

      // 双层发丝导环
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(0.5, R * 0.0026);
      ctx.strokeStyle = 'rgba(253, 230, 138, 0.14)';
      ctx.beginPath();
      ctx.arc(0, 0, beadR * 0.955, 0, Math.PI * 2);
      ctx.moveTo(beadR * 1.045, 0);
      ctx.arc(0, 0, beadR * 1.045, 0, Math.PI * 2);
      ctx.stroke();

      // 108 颗圆珠：零长度虚线 + 圆头线帽 = 一串圆珠；lineDashOffset 驱动整串珠缓缓巡行
      ctx.lineCap = 'round';
      ctx.setLineDash([0.01, gap - 0.01]);
      ctx.lineDashOffset = -t * gap * march;
      ctx.lineWidth = Math.max(1.2, R * 0.011);
      ctx.strokeStyle = `rgba(253, 230, 138, ${0.6 * pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, beadR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 四颗母珠：与圆珠同速巡行，金光四射
      const sprite = this.ensureGlowSprite();
      if (sprite) {
        const base = (t * march * Math.PI * 2) / HALO_BEAD_COUNT;
        const gs = Math.max(4, R * 0.075);
        ctx.globalAlpha = 0.95;
        for (let k = 0; k < 4; k++) {
          const ang = base + (k * Math.PI) / 2;
          ctx.drawImage(
            sprite,
            Math.cos(ang) * beadR - gs,
            Math.sin(ang) * beadR - gs,
            gs * 2,
            gs * 2,
          );
        }
      }
      ctx.restore();
    }

    ctx.restore();

    if (R >= 24) {
      this.drawMandorla(ctx, R, t);
    }
    if (R >= 40) {
      this.drawLotusSeat(ctx, R, t);
    }
  }

  /** 以两段圆弧勾勒尖拱形（vesica piscis）路径：上下为尖端，左右为圆润的腹部 */
  private traceAlmond(ctx: CanvasRenderingContext2D, cy: number, a: number, w: number): void {
    const { rho, d, phi0 } = almondGeometry(a, w);
    ctx.beginPath();
    ctx.arc(-d, cy, rho, -phi0, phi0);
    ctx.arc(d, cy, rho, Math.PI - phi0, Math.PI + phi0);
    ctx.closePath();
  }

  /**
   * 舟形身光：三重焰边由内向外渐淡并各自摇焰；R >= 40 时另有两粒流光
   * 沿边缘循环游走（右缘自下而上、左缘自上而下），周期约 14 秒。
   */
  private drawMandorla(ctx: CanvasRenderingContext2D, R: number, t: number): void {
    const span = R * 1.08;
    const cy = MANDORLA.cy * span;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const strokes = ['rgba(254, 240, 138, 0.55)', 'rgba(253, 224, 71, 0.30)', 'rgba(103, 232, 249, 0.20)'];
    for (let k = 0; k < 3; k++) {
      const s = 1 + k * 0.075 + 0.014 * Math.sin(t * 1.15 + k * 2.1);
      this.traceAlmond(ctx, cy, MANDORLA.a * span * s, MANDORLA.w * span * s);
      ctx.fillStyle = k === 0 ? 'rgba(253, 224, 71, 0.075)' : 'rgba(253, 224, 71, 0.04)';
      ctx.fill();
      ctx.strokeStyle = strokes[k];
      ctx.lineWidth = Math.max(0.7, R * (k === 0 ? 0.006 : 0.0038));
      ctx.stroke();
    }

    const sprite = this.ensureGlowSprite();
    if (sprite && R >= 40) {
      const { rho, d, phi0 } = almondGeometry(MANDORLA.a * span, MANDORLA.w * span);
      const sr = Math.max(5, R * 0.07);
      ctx.globalAlpha = 0.9;
      for (let j = 0; j < 2; j++) {
        const s = (t * 0.07 + j * 0.5) % 1;
        let px: number;
        let py: number;
        if (s < 0.5) {
          const phi = phi0 - s * 4 * phi0; // 右缘：自底尖升向顶尖
          px = -d + rho * Math.cos(phi);
          py = cy + rho * Math.sin(phi);
        } else {
          const th = Math.PI + phi0 - (s - 0.5) * 4 * phi0; // 左缘：自顶尖降向底尖
          px = d + rho * Math.cos(th);
          py = cy + rho * Math.sin(th);
        }
        ctx.drawImage(sprite, px - sr, py - sr, sr * 2, sr * 2);
      }
    }

    ctx.restore();
  }

  /**
   * 莲花台：双层莲瓣自葫芦底部的同一根点向外扇形绽开（外层 9 瓣、内层 8 瓣），
   * 瓣根在分形之后，托起主心形；花瓣以极缓的相位微微开合。
   */
  private drawLotusSeat(ctx: CanvasRenderingContext2D, R: number, t: number): void {
    const span = R * 1.08;
    const rootY = 0.95 * span;
    const rows = [
      { n: 9, fan: 58, h: 0.5, w: 0.06, fill: 0.09, line: 0.3 },
      { n: 8, fan: 47, h: 0.36, w: 0.05, fill: 0.14, line: 0.52 },
    ] as const;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(0.6, R * 0.0034);
    ctx.lineJoin = 'round';

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const h = row.h * span;
      const w = row.w * span;
      ctx.fillStyle = `rgba(255, 200, 225, ${row.fill})`;
      ctx.strokeStyle = `rgba(253, 224, 71, ${row.line})`;
      for (let i = 0; i < row.n; i++) {
        const u = (i / (row.n - 1)) * 2 - 1; // [-1, 1]
        const ang = u * ((row.fan * Math.PI) / 180) + 0.02 * u * Math.sin(t * 0.6 + r);
        ctx.save();
        ctx.translate(0, rootY);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(w * 1.5, -h * 0.22, w * 1.2, -h * 0.78, 0, -h);
        ctx.bezierCurveTo(-w * 1.2, -h * 0.78, -w * 1.5, -h * 0.22, 0, 0);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  /**
   * 光尘升腾：28（R >= 90 时 44）粒金色光点自莲台缓缓升向葫芦蒂，
   * 越近顶端越向中轴收拢；每第 6 粒带十字星芒，随呼吸明灭。
   */
  private drawLightMotes(ctx: CanvasRenderingContext2D, R: number, t: number): void {
    const sprite = this.ensureGlowSprite();
    if (!sprite) return;
    const span = R * 1.08;
    const count = R >= 90 ? 44 : 28;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255, 250, 225, 1)';
    ctx.lineWidth = Math.max(0.6, R * 0.0025);
    ctx.lineCap = 'round';

    for (let i = 0; i < count; i++) {
      const sx = hash01(i * 1.7 + 0.3);
      const sy = hash01(i * 2.3 + 5.1);
      const sz = hash01(i * 3.1 + 9.7);
      const speed = 0.01 + 0.022 * hash01(i * 4.3 + 1.9);

      const life = (((sy - t * speed) % 1) + 1) % 1; // 0 = 莲台，1 = 葫芦蒂（向上游走）
      const yn = 0.98 - life * 2.05;
      const rel = (yn - MANDORLA.cy) / 1.12;
      const halfW = 0.9 * Math.sqrt(Math.max(0.05, 1 - rel * rel));
      const xn = (sx * 2 - 1) * halfW + 0.035 * Math.sin(t * 0.5 + i * 1.9);

      const envelope = Math.pow(Math.sin(Math.PI * life), 1.3);
      const twinkle = 0.55 + 0.45 * Math.sin(t * 2.6 + i * 2.4);
      const alpha = envelope * twinkle * 0.95;
      if (alpha < 0.02) continue;

      const x = xn * span;
      const y = yn * span;
      const s = Math.max(2.5, R * (0.022 + 0.034 * sz));
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - s, y - s, s * 2, s * 2);

      if (i % 6 === 0) {
        const arm = s * 1.9;
        ctx.globalAlpha = alpha * 0.8;
        ctx.beginPath();
        ctx.moveTo(x - arm, y);
        ctx.lineTo(x + arm, y);
        ctx.moveTo(x, y - arm);
        ctx.lineTo(x, y + arm);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * 在曼德勃罗集各级周期芽苞（Period 1, 2, 3, 4, 5）的解析超吸引中心
   * 绘制「摩尼宝珠星核」与心形包络微光，直观呈现倍周期分岔级联的几何层次。
   */
  private drawPeriodBulbPearls(
    ctx: CanvasRenderingContext2D,
    R: number,
    t: number,
  ): void {
    const span = R * 1.08;

    // 2.1 主心形（Main Cardioid: c = e^{iθ}/2 - e^{2iθ}/4）流金包络细线
    ctx.beginPath();
    const steps = 72;
    for (let k = 0; k <= steps; k++) {
      const theta = (k / steps) * Math.PI * 2;
      const cr = 0.5 * Math.cos(theta) - 0.25 * Math.cos(2 * theta);
      const ci = 0.5 * Math.sin(theta) - 0.25 * Math.sin(2 * theta);
      const { nx, ny } = complexToNorm(cr, ci);
      const x = nx * span;
      const y = ny * span;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.32)';
    ctx.lineWidth = Math.max(0.7, R * 0.004);
    ctx.stroke();

    // 2.2 二周期主宝珠圆环（|c + 1| = 1/4）
    const p2 = complexToNorm(-1.0, 0.0);
    const r2Px = (0.25 / SPAN_R) * span;
    ctx.beginPath();
    ctx.arc(p2.nx * span, p2.ny * span, r2Px, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.30)';
    ctx.lineWidth = Math.max(0.7, R * 0.004);
    ctx.stroke();

    // 2.25 珠网丝线：每颗宝珠与最近的三颗宝珠相连，丝上往来的光点即「珠影互映」
    if (R >= 32) {
      const threads = getPearlThreads();
      const sprite = this.ensureGlowSprite();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = Math.max(0.5, R * 0.0026);
      ctx.strokeStyle = 'rgba(165, 243, 252, 0.17)';
      ctx.beginPath();
      for (let k = 0; k < threads.length; k++) {
        const [i, j] = threads[k];
        const pa = complexToNorm(MANDELBROT_BULBS[i].re, MANDELBROT_BULBS[i].im);
        const pb = complexToNorm(MANDELBROT_BULBS[j].re, MANDELBROT_BULBS[j].im);
        ctx.moveTo(pa.nx * span, pa.ny * span);
        ctx.lineTo(pb.nx * span, pb.ny * span);
      }
      ctx.stroke();

      if (sprite) {
        const dotR = Math.max(2.2, R * 0.03);
        ctx.globalAlpha = 0.85;
        for (let k = 0; k < threads.length; k++) {
          const [i, j] = threads[k];
          const pa = complexToNorm(MANDELBROT_BULBS[i].re, MANDELBROT_BULBS[i].im);
          const pb = complexToNorm(MANDELBROT_BULBS[j].re, MANDELBROT_BULBS[j].im);
          // 三角波 0 → 1 → 0：光点沿丝线来回巡行，象征珠与珠彼此映现
          const phase = (t * 0.1 + hash01(k * 5.3)) % 1;
          const s = phase < 0.5 ? phase * 2 : 2 - phase * 2;
          const px = (pa.nx + (pb.nx - pa.nx) * s) * span;
          const py = (pa.ny + (pb.ny - pa.ny) * s) * span;
          ctx.drawImage(sprite, px - dotR, py - dotR, dotR * 2, dotR * 2);
        }
      }
      ctx.restore();
    }

    // 2.3 各级周期宝珠中心的超吸引谐波星核
    for (let i = 0; i < MANDELBROT_BULBS.length; i++) {
      const b = MANDELBROT_BULBS[i];
      const { nx, ny } = complexToNorm(b.re, b.im);
      const bx = nx * span;
      const by = ny * span;
      const pulse = this.reducedMotion
        ? 0.8
        : 0.65 + 0.35 * Math.sin(t * 2.2 - b.period * 0.9);
      const coreR = Math.max(1.1, R * (0.018 / Math.sqrt(b.period)) * pulse);

      // 珠心柔光晕
      ctx.beginPath();
      ctx.arc(bx, by, coreR * 2.4, 0, Math.PI * 2);
      ctx.fillStyle =
        b.period === 1
          ? `rgba(253, 224, 71, ${0.28 * pulse})`
          : `rgba(103, 232, 249, ${0.24 * pulse})`;
      ctx.fill();

      // 珠心亮核
      ctx.beginPath();
      ctx.arc(bx, by, coreR, 0, Math.PI * 2);
      ctx.fillStyle = b.period <= 2 ? '#fef08a' : '#cffafe';
      ctx.fill();
    }
  }

  /**
   * 实时绘制探测点 c(t) 在复平面上的临界迭代轨道 z_0 -> z_1 -> ... -> z_{18}：
   * 让用户亲眼看到同一个方程 z_{n+1} = z_n^2 + c 在不同芽苞区域如何演化出
   * 螺旋吸引子、二周期往复桥与三周期星芒三角形。
   */
  private drawLiveCriticalOrbit(
    ctx: CanvasRenderingContext2D,
    R: number,
    t: number,
  ): void {
    const span = R * 1.08;
    // 探测点 c(t) 沿着跨越主心形边界、海马谷 (-0.75, 0.12)、二周期宝珠 (-0.98, 0)
    // 与三周期北宝珠 (-0.12, 0.72) 的平滑李萨如轨迹巡航
    const u = ((t % CYCLE) / CYCLE) * Math.PI * 2;
    const cr = -0.48 + 0.52 * Math.cos(u) - 0.16 * Math.cos(2 * u);
    const ci = 0.42 * Math.sin(u) + 0.22 * Math.sin(2 * u);

    const orbit = computeCriticalOrbit(cr, ci, 18);
    if (orbit.length < 2) return;

    // 1) 绘制轨道连线折线（金色细激光弦）
    ctx.beginPath();
    for (let i = 0; i < orbit.length; i++) {
      const { nx, ny } = complexToNorm(orbit[i].re, orbit[i].im);
      const ox = nx * span;
      const oy = ny * span;
      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
    }
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.52)';
    ctx.lineWidth = Math.max(0.8, R * 0.0045);
    ctx.stroke();

    // 2) 绘制轨道上的迭代落点星芒
    ctx.beginPath();
    for (let i = 1; i < orbit.length; i++) {
      const { nx, ny } = complexToNorm(orbit[i].re, orbit[i].im);
      const ox = nx * span;
      const oy = ny * span;
      const dotR = Math.max(0.9, R * 0.008 * (1 - i / (orbit.length * 1.4)));
      ctx.moveTo(ox + dotR, oy);
      ctx.arc(ox, oy, dotR, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(254, 249, 195, 0.85)';
    ctx.fill();

    // 3) 高亮当前探测参数点 c(t)（即 z_1 = c）
    const cNorm = complexToNorm(cr, ci);
    const cx = cNorm.nx * span;
    const cy = cNorm.ny * span;
    const probeR = Math.max(1.8, R * 0.015);
    ctx.beginPath();
    ctx.arc(cx, cy, probeR * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, probeR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  /**
   * 语义级全息 LOD（R >= 65）：「一珠映万珠 · 针尖婴儿集（Mini-brot）全息放大镜」。
   * 在左侧针尖触须上的三周期岛屿（c = -1.75488 + 0i）处画出一条引出线与圆形全息放大镜，
   * 展示那颗肉眼几乎看不见的细微节点在放大 35 倍后，内部竟然是一尊分毫不差的完整曼德勃罗集！
   */
  private drawMinibrotHologramLens(
    ctx: CanvasRenderingContext2D,
    R: number,
    t: number,
  ): void {
    const span = R * 1.08;
    const lodAlpha = Math.min(0.95, (R - 65) / 75);

    // 顶部葫芦尖（针尖婴儿集）在主图上的位置：(nx = 0, ny ≈ -0.78)
    const needle = complexToNorm(-1.7685, 0.0);
    const nx = needle.nx * span;
    const ny = needle.ny * span;
    const targetR = Math.max(2.5, R * 0.024);

    // 全息放大镜悬浮在右上方空白星域处，与顶部葫芦蒂自然呼应
    const lensX = R * 0.56;
    const lensY = -R * 0.54;
    const lensR = R * 0.22;

    ctx.save();
    ctx.globalAlpha = lodAlpha;

    // 1) 葫芦尖目标定位小金环 + 指向右上放大镜的双切线光锥
    ctx.beginPath();
    ctx.arc(nx, ny, targetR, 0, Math.PI * 2);
    ctx.moveTo(nx + targetR, ny - targetR * 0.2);
    ctx.lineTo(lensX - lensR * 0.85, lensY - lensR * 0.45);
    ctx.moveTo(nx + targetR * 0.6, ny + targetR * 0.8);
    ctx.lineTo(lensX - lensR * 0.65, lensY + lensR * 0.72);
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.68)';
    ctx.lineWidth = Math.max(0.8, R * 0.0045);
    ctx.stroke();

    // 2) 全息放大镜深空底盘与离屏烘焙的婴儿曼德勃罗集图像
    ctx.beginPath();
    ctx.arc(lensX, lensY, lensR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fill();

    const mini = this.ensureMinibrotCache();
    if (mini) {
      ctx.drawImage(mini, lensX - lensR, lensY - lensR, lensR * 2, lensR * 2);
    }

    // 3) 放大镜双层刻度金环
    const ringPulse = this.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 1.8);
    ctx.beginPath();
    ctx.arc(lensX, lensY, lensR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(253, 224, 71, ${0.85 * ringPulse})`;
    ctx.lineWidth = Math.max(1.0, R * 0.006);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(lensX, lensY, lensR * 1.07, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.38)';
    ctx.lineWidth = Math.max(0.6, R * 0.003);
    ctx.stroke();

    // 4) 当放大到 R >= 95 时，在全息镜下方标注倍率与自相似公式
    if (R >= 95) {
      const fontSize = Math.max(8, Math.round(R * 0.042));
      ctx.font = `600 ${fontSize}px "SF Pro Display","PingFang SC",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(254, 240, 138, 0.92)';
      ctx.fillText('×35 珠中映全形', lensX, lensY + lensR * 1.14);
    }

    ctx.restore();
  }
}

export function createIndraNetOverlay(options: IndraNetOverlayOptions): IndraNetOverlay {
  return new IndraNetOverlay(options);
}
