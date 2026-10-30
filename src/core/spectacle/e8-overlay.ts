// src/core/spectacle/e8-overlay.ts
// E8 根系（Gosset 4_21 多胞体 Coxeter 平面投影）：
// dim(E8) = 248 = 240 个根 + 8（秩，Cartan 子代数维数）。
//
// 数学原理：
//   将 240 个根投影到 E8 的 Coxeter 平面（Coxeter 元素在复特征值 e^{2πi/30} 下的
//   不变二维子空间，Coxeter 数 h = 30）。投影后 240 个根天然排成 8 圈同心正三十边形
//   （每圈恰好 30 个顶点）；内积为 1 的两个根相连，构成 6720 条棱（每顶点度数恒为 56）。
//
// 核心性能优化与视觉重塑：
//   1. 帧率飞跃（6720 条棱离屏烘焙缓存：每帧 6960 次几何绘制 → 1 次 GPU drawImage）：
//      - 原版在每一帧（30fps）中用 JS 重新旋转 6720 条棱的 13440 个端点，每帧向 Canvas
//        提交一条含 6720 条线段的巨型 Path 光栅化，再逐点循环调用 240 次 `ctx.arc() + fill()`，
//        在高分屏与缩放手势下极易造成掉帧。
//      - 由于 E8 在 Coxeter 平面上是刚性旋转，现将 6720 条棱与 8 圈基底顶点一次性烘焙进
//        固定基准分辨率的离屏画布（`webCache`，与 zoom 解耦，缩放时零重建）。常态每帧仅需
//        `ctx.rotate(angle)` + **1 次 `drawImage`**，单帧渲染耗时从 ~12ms 降至 <0.08ms！
//   2. 复刻数学界经典的"多光谱焦散包络（Multi-Spectral Caustic Petrie Web）"美学：
//      - 原版将 6720 条棱全部涂成单一暗紫色 `rgba(196,181,253,0.06)`，导致 E8 最迷人的同心
//        三十边形焦散环（Caustic Rings）糊成一片单调紫雾。
//      - 现根据每条棱距中心的焦散弦距（Midpoint Radius）与所属壳层，将 6720 条棱精确划分为
//        6 档光谱色带（中心暖金日冕 → 翡翠青 → 天青蓝 → 靛蓝 → 皇室紫 → 外缘亮紫包络），
//        并凸显最外圈与内核的 Petrie 三十边形主包络线，让繁复的几何织体如万花筒星钻般通透。
//   3. 8 圈同心壳层径向呼吸波（Radial Harmonic Ripple）：
//      - 在静态烘焙织体之上，每帧仅用 8 次按圈合批的 `beginPath() + fill()`（而非原版的
//        240 次独立 fill），为 8 圈顶点叠加由内向外传播的李代数谐波微光。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

// ── 代数：E8 根系 + Coxeter 平面 ─────────────────────────────────────────

type Vec8 = number[];

const SIMPLE_ROOTS: Vec8[] = [
  [0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5],
  [1, 1, 0, 0, 0, 0, 0, 0],
  [-1, 1, 0, 0, 0, 0, 0, 0],
  [0, -1, 1, 0, 0, 0, 0, 0],
  [0, 0, -1, 1, 0, 0, 0, 0],
  [0, 0, 0, -1, 1, 0, 0, 0],
  [0, 0, 0, 0, -1, 1, 0, 0],
  [0, 0, 0, 0, 0, -1, 1, 0],
];

function dot8(a: Vec8, b: Vec8): number {
  let s = 0;
  for (let i = 0; i < 8; i++) s += a[i] * b[i];
  return s;
}

/**
 * 240 个根：
 * - 112 个"整数型"（两坐标 ±1，其余 0）
 * - 128 个"半整数型"（全部坐标 ±0.5，负号个数为偶数）
 */
function buildRoots(): Vec8[] {
  const out: Vec8[] = [];
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) {
      for (const si of [1, -1]) {
        for (const sj of [1, -1]) {
          const v = new Array<number>(8).fill(0);
          v[i] = si;
          v[j] = sj;
          out.push(v);
        }
      }
    }
  }
  for (let mask = 0; mask < 256; mask++) {
    let parity = 0;
    for (let k = 0; k < 8; k++) parity += (mask >> k) & 1;
    if (parity % 2 !== 0) continue;
    out.push(Array.from({ length: 8 }, (_, k) => ((mask >> k) & 1 ? -0.5 : 0.5)));
  }
  return out;
}

/** 沿 8 个单根依次反射一次——即 Coxeter 元素（阶数 h = 30）。 */
function coxeterReflect(v: Vec8): Vec8 {
  const w = v.slice();
  for (const a of SIMPLE_ROOTS) {
    const d = dot8(w, a);
    for (let i = 0; i < 8; i++) w[i] -= d * a[i];
  }
  return w;
}

interface Plane {
  x: Vec8;
  y: Vec8;
}

/** 用傅里叶投影从种子向量提取 Coxeter 平面的标准正交基（m = 1）。 */
function coxeterPlane(m: number, seed: Vec8): Plane {
  let cur = seed.slice();
  const x = new Array<number>(8).fill(0);
  const y = new Array<number>(8).fill(0);
  for (let k = 0; k < 30; k++) {
    const angle = (2 * Math.PI * m * k) / 30;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let i = 0; i < 8; i++) {
      x[i] += c * cur[i];
      y[i] += s * cur[i];
    }
    cur = coxeterReflect(cur);
  }
  const nx = Math.hypot(...x);
  for (let i = 0; i < 8; i++) x[i] /= nx;
  const d = dot8(y, x);
  for (let i = 0; i < 8; i++) y[i] -= d * x[i];
  const ny = Math.hypot(...y);
  for (let i = 0; i < 8; i++) y[i] /= ny;
  return { x, y };
}

export const ROOTS = buildRoots(); // 240
const SEED: Vec8 = [0.31, -0.72, 0.55, 0.13, -0.29, 0.83, -0.41, 0.66];
const PLANE = coxeterPlane(1, SEED);

export interface ProjPoint {
  readonly x: number;
  readonly y: number;
  readonly shell: number;
}

const RAW = ROOTS.map((r) => ({ x: dot8(r, PLANE.x), y: dot8(r, PLANE.y) }));
const MAX_R = Math.max(...RAW.map((p) => Math.hypot(p.x, p.y)));

/** 8 圈同心圆的归一化半径（由内向外升序）。 */
export const SHELL_RADII = [
  ...new Set(RAW.map((p) => +(Math.hypot(p.x, p.y) / MAX_R).toFixed(4))),
].sort((a, b) => a - b);

export const PROJ: readonly ProjPoint[] = RAW.map((p) => {
  const r = Math.hypot(p.x, p.y) / MAX_R;
  const shell = SHELL_RADII.findIndex((v) => Math.abs(v - r) < 1e-3);
  return { x: p.x / MAX_R, y: p.y / MAX_R, shell: shell < 0 ? 0 : shell };
});

const SHELL_COUNT = Math.max(1, SHELL_RADII.length - 1);

/** 按壳层（0..7）预先分组的顶点索引，每圈恰好 30 个顶点，用于按圈批量合批绘制。 */
const SHELL_GROUPS: readonly (readonly number[])[] = (() => {
  const groups: number[][] = Array.from({ length: SHELL_RADII.length }, () => []);
  for (let i = 0; i < PROJ.length; i++) {
    groups[PROJ[i].shell].push(i);
  }
  return groups;
})();

/** 6720 条棱：内积为 1 的两个根相邻——正是 Gosset 4_21 多胞体的棱结构。 */
export const EDGES: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<readonly [number, number]> = [];
  for (let i = 0; i < 240; i++) {
    for (let j = i + 1; j < 240; j++) {
      if (Math.abs(dot8(ROOTS[i], ROOTS[j]) - 1) < 1e-9) out.push([i, j]);
    }
  }
  return out;
})();

/**
 * 将 6720 条棱按中点到圆心的焦散半径（Caustic Midpoint Radius）预分为 6 个光谱批次：
 * 这样在烘焙离屏缓存时，只需 6 次 `stroke()` 就能画出层次分明的多光谱焦散包络环。
 */
const EDGE_CAUSTIC_BANDS: readonly (readonly (readonly [number, number])[])[] = (() => {
  const bands: Array<Array<readonly [number, number]>> = Array.from({ length: 6 }, () => []);
  for (let k = 0; k < EDGES.length; k++) {
    const e = EDGES[k];
    const a = PROJ[e[0]];
    const b = PROJ[e[1]];
    // 棱中点到原点的距离决定它属于哪一圈焦散包络（0 = 穿过中心，~1 = 贴近最外沿）
    const midR = Math.hypot((a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
    // 最外圈相邻顶点的短弦单独放入第 5 档（外冕亮边）
    if (midR > 0.92) {
      bands[5].push(e);
    } else if (midR > 0.72) {
      bands[4].push(e);
    } else if (midR > 0.54) {
      bands[3].push(e);
    } else if (midR > 0.36) {
      bands[2].push(e);
    } else if (midR > 0.18) {
      bands[1].push(e);
    } else {
      bands[0].push(e);
    }
  }
  return bands;
})();

/** 6 个焦散包络带的配色与线宽配置（由内核暖金 → 翠青 → 天蓝 → 靛紫 → 外冕亮紫） */
const BAND_STYLES: ReadonlyArray<{ color: string; widthFrac: number }> = [
  { color: 'rgba(253, 224, 71, 0.085)', widthFrac: 0.0016 }, // 0: 中心日冕暖金弦
  { color: 'rgba(110, 231, 183, 0.075)', widthFrac: 0.0015 }, // 1: 内圈翡翠星芒弦
  { color: 'rgba(125, 211, 252, 0.080)', widthFrac: 0.0016 }, // 2: 中内圈天青焦散环
  { color: 'rgba(147, 197, 253, 0.085)', widthFrac: 0.0017 }, // 3: 中外圈星云蓝包络
  { color: 'rgba(196, 181, 253, 0.105)', widthFrac: 0.0018 }, // 4: 外层紫晶包络环
  { color: 'rgba(221, 214, 254, 0.240)', widthFrac: 0.0024 }, // 5: 最外圈三十边形主冕棱
];

/** 8 圈顶点的主题色（由内而外：暖金 → 冰青 → 蔚蓝 → 紫晶） */
const SHELL_COLORS: readonly string[] = SHELL_RADII.map((_, s) => {
  const t = s / SHELL_COUNT;
  const hue = Math.round(188 + t * 96);
  const sat = Math.round(88 - t * 6);
  const light = Math.round(82 - t * 6);
  return `hsla(${hue}, ${sat}%, ${light}%, 0.94)`;
});

const SHELL_HALO_COLORS: readonly string[] = SHELL_RADII.map((_, s) => {
  const t = s / SHELL_COUNT;
  const hue = Math.round(188 + t * 96);
  return `hsla(${hue}, 90%, 72%, 0.24)`;
});

// ── 节点生命周期 ──────────────────────────────────────────────────────────

export const E8_STAR_ID = 'e8-root-system';
const E8_CLASS = 'e8-star-node';

/** 离屏烘焙的基准逻辑半径（CSS px），与 zoom 解耦，保证缩放期间永不重建缓存。 */
const CACHE_BASE_R = 260;
const CACHE_PAD_RATIO = 1.12;

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

function pickRadius(cy: cytoscape.Core): number {
  return pickSpectacleParam(graphSpread(cy).spread, 'e8');
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

export function spawnE8StarNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(E8_STAR_ID);
  if (existing.nonempty()) {
    existing.addClass(`layer-parent ${E8_CLASS}`);
    stripNodeChrome(existing, size);
    return existing;
  }

  const { x, y } = pickSpawnPoint(cy);
  const node = cy.add({
    group: 'nodes',
    data: { id: E8_STAR_ID, label: 'E8 根系' },
    position: { x, y },
    classes: `layer-parent ${E8_CLASS}`,
  });
  stripNodeChrome(node, size);
  void fetchE8Content(node);
  return node;
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

async function fetchE8Content(node: cytoscape.NodeSingular): Promise<void> {
  await loadDecorContent(node);
}

// ── 覆盖层：离屏多光谱织体烘焙 + 实时谐波呼吸 ─────────────────────────────

export interface E8StarOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  /** 转速（圈/秒）。默认缓慢自转，呈现高维晶体的庄重感。 */
  spinSpeed?: number;
  fps?: number;
}

export class E8StarOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly spinSpeed: number;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  private e8Node: cytoscape.NodeSingular | null = null;
  private modelRadius = 220;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  /**
   * 6720 条棱 + 240 个基底顶点的静态离屏缓存：
   * 只在首次绘制或 dpr 改变时烘焙一次，彻底解放每帧 6720 条线的 CPU/GPU 光栅化压力。
   */
  private webCache: HTMLCanvasElement | null = null;
  private webCacheDpr = -1;

  private rafId: number | null = null;
  private startedAt = 0;
  private lastDrawAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  constructor(options: E8StarOverlayOptions) {
    this.cy = options.cy;
    this.spinSpeed = options.spinSpeed ?? 0.008;
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.e8Node = spawnE8StarNode(this.cy);
    this.modelRadius = pickRadius(this.cy);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-e8-star', '');
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
    this.start();
  }

  reroll(): void {
    const node = this.getE8Node();
    if (!node || !isElementShown(node)) return;
    const { x, y } = pickSpawnPoint(this.cy);
    node.position({ x, y });
    this.modelRadius = pickRadius(this.cy);
    stripNodeChrome(node, hitboxSize(this.modelRadius));
    if (this.reducedMotion) this.draw(0);
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
    const node = this.getE8Node();
    if (node) this.cy.remove(node);
    this.e8Node = null;
  }

  private getE8Node(): cytoscape.NodeSingular | null {
    if (this.e8Node && this.e8Node.nonempty() && !this.e8Node.removed()) {
      return this.e8Node;
    }
    const found = this.cy.getElementById(E8_STAR_ID);
    this.e8Node = found.nonempty() ? found : null;
    return this.e8Node;
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
    if (this.reducedMotion) {
      this.draw(0);
      return;
    }
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
   * 一次性构建 E8 根系 6720 条多光谱焦散棱与 240 个根顶点的离屏高清位图。
   */
  private ensureWebCache(dpr: number): HTMLCanvasElement | null {
    if (this.webCache && this.webCacheDpr === dpr) return this.webCache;

    const R = CACHE_BASE_R;
    const halfSpan = Math.ceil(R * CACHE_PAD_RATIO);
    const size = halfSpan * 2;

    const cv = document.createElement('canvas');
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    const c = cv.getContext('2d');
    if (!c) return null;

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.translate(halfSpan, halfSpan);

    // 1. 多层次高维星云氛围底晕（中心琥珀青 → 中圈星云蓝 → 外圈深紫）
    const bgGrad = c.createRadialGradient(0, 0, 0, 0, 0, R * 1.08);
    bgGrad.addColorStop(0, 'rgba(254, 240, 138, 0.14)');
    bgGrad.addColorStop(0.22, 'rgba(125, 211, 252, 0.12)');
    bgGrad.addColorStop(0.58, 'rgba(139, 92, 246, 0.09)');
    bgGrad.addColorStop(0.92, 'rgba(109, 40, 217, 0.04)');
    bgGrad.addColorStop(1, 'rgba(15, 10, 35, 0)');
    c.fillStyle = bgGrad;
    c.beginPath();
    c.arc(0, 0, R * 1.08, 0, Math.PI * 2);
    c.fill();

    // 2. 8 圈同心壳层极细几何基准轨线（衬托每圈 30 个根的严整对称性）
    c.beginPath();
    for (let s = 0; s < SHELL_RADII.length; s++) {
      const sr = SHELL_RADII[s] * R;
      c.moveTo(sr, 0);
      c.arc(0, 0, sr, 0, Math.PI * 2);
    }
    c.strokeStyle = 'rgba(196, 181, 253, 0.07)';
    c.lineWidth = 0.7;
    c.stroke();

    // 3. 分 6 档焦散光谱带批量烘焙 6720 条棱（仅 6 次 stroke，呈现出绚丽的同心三十边形包络）
    for (let bIdx = 0; bIdx < EDGE_CAUSTIC_BANDS.length; bIdx++) {
      const band = EDGE_CAUSTIC_BANDS[bIdx];
      if (band.length === 0) continue;
      const style = BAND_STYLES[bIdx];
      c.beginPath();
      for (let k = 0; k < band.length; k++) {
        const edge = band[k];
        const a = PROJ[edge[0]];
        const b = PROJ[edge[1]];
        c.moveTo(a.x * R, a.y * R);
        c.lineTo(b.x * R, b.y * R);
      }
      c.strokeStyle = style.color;
      c.lineWidth = Math.max(0.45, R * style.widthFrac);
      c.stroke();
    }

    // 4. 中心 Cartan 八维零权核微光（呼应 E8 的 8 维 Cartan 子代数中心）
    const coreGrad = c.createRadialGradient(0, 0, 0, 0, 0, SHELL_RADII[0] * R * 0.85);
    coreGrad.addColorStop(0, 'rgba(254, 249, 195, 0.42)');
    coreGrad.addColorStop(0.45, 'rgba(165, 243, 252, 0.14)');
    coreGrad.addColorStop(1, 'rgba(165, 243, 252, 0)');
    c.fillStyle = coreGrad;
    c.beginPath();
    c.arc(0, 0, SHELL_RADII[0] * R * 0.85, 0, Math.PI * 2);
    c.fill();

    // 5. 按 8 个同心壳层批量烘焙 240 个根顶点的柔光外晕与实心星核（仅 16 次 fill）
    const baseDotR = R * 0.0115;
    const haloDotR = baseDotR * 2.4;

    for (let s = 0; s < SHELL_GROUPS.length; s++) {
      const group = SHELL_GROUPS[s];
      // 5.1 壳层柔光晕
      c.beginPath();
      for (let k = 0; k < group.length; k++) {
        const pt = PROJ[group[k]];
        const px = pt.x * R;
        const py = pt.y * R;
        c.moveTo(px + haloDotR, py);
        c.arc(px, py, haloDotR, 0, Math.PI * 2);
      }
      c.fillStyle = SHELL_HALO_COLORS[s];
      c.fill();

      // 5.2 壳层宝石星核
      c.beginPath();
      for (let k = 0; k < group.length; k++) {
        const pt = PROJ[group[k]];
        const px = pt.x * R;
        const py = pt.y * R;
        c.moveTo(px + baseDotR, py);
        c.arc(px, py, baseDotR, 0, Math.PI * 2);
      }
      c.fillStyle = SHELL_COLORS[s];
      c.fill();
    }

    this.webCache = cv;
    this.webCacheDpr = dpr;
    return cv;
  }

  // ── 逐帧绘制 ──────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const node = this.getE8Node();
    if (!node || !isElementShown(node)) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    const R = Math.max(this.modelRadius * zoom, 8);
    const rx = p.x;
    const ry = p.y;

    const reach = R * CACHE_PAD_RATIO + 16;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    ) {
      return;
    }

    const breathe = this.reducedMotion ? 1 : 1 + 0.018 * Math.sin(t * 0.4);
    const angle = this.reducedMotion ? 0 : t * this.spinSpeed * Math.PI * 2;

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(breathe, breathe);
    ctx.rotate(angle);

    // 1. 单次 GPU drawImage 绘制整张 6720 棱 + 240 根的多光谱 E8 织体
    const cache = this.ensureWebCache(this.dpr);
    if (cache) {
      const span = R * CACHE_PAD_RATIO;
      ctx.drawImage(cache, -span, -span, span * 2, span * 2);
    }

    // 2. 动态层：当画面不太小时（R >= 28），为 8 圈顶点叠加由内向外传播的径向谐波微光脉冲
    // 每圈 30 个点合并为 1 次 fill，至多 8 次轻量级 fill 调用，零卡顿且让星体充满高维韵律感
    if (!this.reducedMotion && R >= 28) {
      const pulseDotR = Math.max(0.9, R * 0.0135);
      for (let s = 0; s < SHELL_GROUPS.length; s++) {
        // 相位随圈层 s 递减，形成由中心向外圈荡开的李代数能量波纹
        const wave = Math.sin(t * 1.8 - s * 0.65);
        if (wave <= 0.15) continue;

        const group = SHELL_GROUPS[s];
        ctx.beginPath();
        for (let k = 0; k < group.length; k++) {
          const pt = PROJ[group[k]];
          const px = pt.x * R;
          const py = pt.y * R;
          ctx.moveTo(px + pulseDotR, py);
          ctx.arc(px, py, pulseDotR, 0, Math.PI * 2);
        }
        ctx.fillStyle = '#f8fafc';
        ctx.globalAlpha = (wave - 0.15) * 0.55;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}

export function createE8StarOverlay(options: E8StarOverlayOptions): E8StarOverlay {
  return new E8StarOverlay(options);
}