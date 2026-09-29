// src/core/spectacle/e8-overlay.ts
// E8 根系：dim(E8) = 248 = 240 个根 + 8（秩，Cartan 子代数维数）。
//
// 呈现方式是数学界最经典的那张图：把 240 个根投影到 E8 的 Coxeter 平面上——
// Coxeter 元素（8 个单根的反射依次复合）在复特征值 e^{2πi/30} 下的不变
// 2 维子空间（E8 的 Coxeter 数是 30）。投影到这个平面后，240 个点会自动
// 排成 8 圈同心圆、每圈正好 30 个点；内积为 1 的两个根视为"相邻"，连线后
// 正是 Gosset 4_21 多胞体的棱（240 个顶点、6720 条棱、每点连 56 条）——
// 这套代数已经在 Node 里单独跑通验证过：240 根、simple roots 校验通过、
// Coxeter 元素连续作用 30 次回到自身、8 圈每圈恰好 30 点、6720 条边、
// 每点度数恒为 56。这里是把同一份算法搬进浏览器，换成每帧刚性旋转
// 这个固定投影（跟维基百科上那些"E8 旋转"动图是同一种做法）。
//
// 节点生命周期跟 emblem-overlay.ts（太极八卦）是同一套骨架：孤立
// 无边、不 lock()、打 layer-parent 排除出"知识"、stripNodeChrome() 抹掉
// cytoscape 自身的可见样式只留命中盒、canvas 覆盖层读 node.renderedPosition()
// + cy.zoom() 逐帧画。四份骨架目前是各自独立的文件（有一点重复代码），
// 如果以后把"奇观节点"这类东西合并管理，这部分生命周期逻辑值得抽成共享
// 工具——现在先保持每个文件独立、可以单独复制粘贴接入。

import type cytoscape from 'cytoscape';
import { parseFrontmatter } from '../../parser/frontmatter.js';

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

/** 240 个根：112 个"整数型"（两坐标 ±1，其余 0）+ 128 个"半整数型"
 *  （全部坐标 ±0.5，负号个数为偶数）。 */
function buildRoots(): Vec8[] {
  const out: Vec8[] = [];
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) {
      for (const si of [1, -1]) {
        for (const sj of [1, -1]) {
          const v = new Array(8).fill(0);
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

/** 沿 8 个单根依次反射一次——这就是 Coxeter 元素。E8 的 Coxeter 数是 30：
 *  连续作用 30 次，任何向量都会转回自己。 */
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

/** 用幂法从一个随机种子向量里"洗"出 Coxeter 平面的正交基：对种子做 30 步
 *  反射，每步按对应相位累加。m=1 时就是经典的那张 E8 图用的平面。 */
function coxeterPlane(m: number, seed: Vec8): Plane {
  let cur = seed.slice();
  const x = new Array(8).fill(0),
    y = new Array(8).fill(0);
  for (let k = 0; k < 30; k++) {
    const angle = (2 * Math.PI * m * k) / 30;
    const c = Math.cos(angle),
      s = Math.sin(angle);
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

const ROOTS = buildRoots(); // 240
const SEED: Vec8 = [0.31, -0.72, 0.55, 0.13, -0.29, 0.83, -0.41, 0.66];
const PLANE = coxeterPlane(1, SEED);

interface ProjPoint {
  x: number;
  y: number;
  shell: number;
}

const RAW = ROOTS.map((r) => ({ x: dot8(r, PLANE.x), y: dot8(r, PLANE.y) }));
const MAX_R = Math.max(...RAW.map((p) => Math.hypot(p.x, p.y)));
// 按半径分圈：E8 在这个投影下天然落成 8 圈、每圈 30 点，用来给由内而外的色相渐变。
const SHELL_RADII = [...new Set(RAW.map((p) => +(Math.hypot(p.x, p.y) / MAX_R).toFixed(4)))].sort(
  (a, b) => a - b,
);
const PROJ: ProjPoint[] = RAW.map((p) => {
  const r = Math.hypot(p.x, p.y) / MAX_R;
  const shell = SHELL_RADII.findIndex((v) => Math.abs(v - r) < 1e-3);
  return { x: p.x / MAX_R, y: p.y / MAX_R, shell: shell < 0 ? 0 : shell };
});
const SHELL_COUNT = Math.max(1, SHELL_RADII.length - 1);

/** 6720 条棱：内积为 1 的两个根相邻——正是 Gosset 4_21 多胞体的棱结构。 */
const EDGES: Array<[number, number]> = [];
for (let i = 0; i < 240; i++) {
  for (let j = i + 1; j < 240; j++) {
    if (Math.abs(dot8(ROOTS[i], ROOTS[j]) - 1) < 1e-9) EDGES.push([i, j]);
  }
}

// ── 节点生命周期（骨架同 celestial-emblem-node.ts，见文件头说明） ──────────

export const E8_STAR_ID = 'e8-root-system';
const E8_CLASS = 'e8-star-node';
/** 可选内容——没有这份 .md 也完全不影响显示，图上照样是个能点开的空标题。 */
const E8_CONTENT_PATH = '个人成长与生存策略/E8根系.md';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

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
  return clamp(graphSpread(cy).spread * 0.075, 140, 340);
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
    // 这里刻意不设 compound-sizing-* / ghost-color / ghost-shape / ghost-offset-*：
    // cytoscape 的 d.ts 收录了它们，但运行时解析 style 时会逐条报
    // "style property is invalid" 警告（实测：每个 stripNodeChrome 调用刷 6 条
    // warn），而它们描述的是复合父节点尺寸与 ghost 边缘拖影——对一个被压成
    // 全透明的孤立叶子节点，两者都不产生任何可见效果。设了只是白刷警告。
    // tesseract-overlay.ts 的 stripNodeChrome 早就避开了。
  });
}

async function fetchE8Content(node: cytoscape.NodeSingular): Promise<void> {
  try {
    const url =
      '/content/' +
      E8_CONTENT_PATH.split('/')
        .map((s) => encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F'))
        .join('/');
    const res = await fetch(url);
    if (!res.ok) return;
    const text = await res.text();
    const fm = parseFrontmatter(text, E8_CONTENT_PATH);
    node.data('shortSummary', fm.shortSummary);
    node.data('fullSummary', fm.fullSummary);
    node.data('body', fm.body);
    node.data('sourcePath', E8_CONTENT_PATH);
  } catch {
    /* 没这份内容 / 网络失败都无所谓——星星照常转 */
  }
}

// ── 覆盖层：逐帧刚性旋转这个固定投影 ─────────────────────────────────────

export interface E8StarOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  /** 转速（圈/秒）。240 个点很密，转太快会花——默认很慢，像颗真的星。 */
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

  private modelRadius = 220;
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

  constructor(options: E8StarOverlayOptions) {
    this.cy = options.cy;
    this.spinSpeed = options.spinSpeed ?? 0.008;
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    spawnE8StarNode(this.cy);
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
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(container);
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    this.start();
  }

  reroll(): void {
    const node = this.cy.getElementById(E8_STAR_ID);
    if (node.empty()) return;
    const { x, y } = pickSpawnPoint(this.cy);
    node.position({ x, y });
    this.modelRadius = pickRadius(this.cy);
    stripNodeChrome(node, hitboxSize(this.modelRadius));
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
    const node = this.cy.getElementById(E8_STAR_ID);
    if (node.nonempty()) this.cy.remove(node);
  }

  private syncSize(): void {
    const container = this.canvas.parentElement;
    if (!container) return;
    const w = container.clientWidth,
      h = container.clientHeight;
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

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    const node = this.cy.getElementById(E8_STAR_ID);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    if (node.empty()) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    const R = Math.max(this.modelRadius * zoom, 6); // 缩得再远也留一颗看得见的星
    const rx = p.x,
      ry = p.y;

    const reach = R * 1.1 + 20;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    )
      return;

    const breathe = this.reducedMotion ? 1 : 1 + 0.02 * Math.sin(t * 0.35);
    const angle = this.reducedMotion ? 0 : t * this.spinSpeed * Math.PI * 2;
    const cosA = Math.cos(angle),
      sinA = Math.sin(angle);

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(breathe, breathe);

    // 一圈极淡的氛围光，让 240 个小点聚成一团而不是散落的噪点。
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    grad.addColorStop(0, 'rgba(186,166,255,0.10)');
    grad.addColorStop(1, 'rgba(186,166,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    // 6720 条棱：全部塞进一条 path，一次 stroke()，透明度压得很低——
    // 密度本身就是图案，不需要每条边单独发光。
    ctx.beginPath();
    for (const [i, j] of EDGES) {
      const a = PROJ[i],
        b = PROJ[j];
      const ax = (a.x * cosA - a.y * sinA) * R,
        ay = (a.x * sinA + a.y * cosA) * R;
      const bx = (b.x * cosA - b.y * sinA) * R,
        by = (b.x * sinA + b.y * cosA) * R;
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.strokeStyle = 'rgba(196,181,253,0.06)';
    ctx.lineWidth = Math.max(0.4, R * 0.0015);
    ctx.stroke();

    // 240 个根：按所在"圈"（8 圈，内到外）渐变色相，由内而外从冷蓝到紫。
    const dotR = Math.max(0.8, R * 0.012);
    for (const pt of PROJ) {
      const x = (pt.x * cosA - pt.y * sinA) * R,
        y = (pt.x * sinA + pt.y * cosA) * R;
      const hue = 205 + (pt.shell / SHELL_COUNT) * 95;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 82%, 78%, 0.92)`;
      ctx.fill();
    }

    ctx.restore();
  }
}

export function createE8StarOverlay(options: E8StarOverlayOptions): E8StarOverlay {
  return new E8StarOverlay(options);
}
