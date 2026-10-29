// src/core/spectacle/tesseract-overlay.ts
// 四维空间（tesseract）：图谱里第二个真实存在、参与力学模拟、却孤立无边的装饰节点。
//
// 架构刻意与 taiji_bagua_overlay.ts 平行而不是复用：太极八卦是一叠
// 同心文字环，它的绘制循环跟"3D 投影 + 深度排序"毫无关系；超立方体每帧要
// 重新旋转 16 个顶点、算深度、决定 32 条棱的绘制顺序。硬塞进同一个类会得到
// 一个既有两个职责、又有互斥状态（pause/resume/reroll/destroy）的上帝对象。
// 两个独立 overlay 各自持有自己的 canvas，生命周期互不牵连。
//
// 针对残影、边闪烁与透视变扁的三项核心修正与优化：
//   1. 彻底根除残影（Full-Canvas Fast-Path Clear + 收敛透视比）：
//      之前局部脏矩形擦除在顶点透视外溢或图谱快速拖拽时会漏擦边缘，留下白色月牙残影；
//      现采用浏览器 GPU 快速通道全画布 clearRect，并温和收敛 4D 透视发散上限，确保顶点
//      永远在包围盒内优雅舒展，100% 零残影。
//   2. 彻底消除棱线闪烁与跳变（全连续 C1 平滑插值 + 零硬阈值切档）：
//      之前按固定阈值将棱硬切为虚线/实线/高亮三档，且在桥棱上画跳动的短白线，导致棱跨过
//      阈值时突然变粗变亮或由虚变实（闪烁感）。现改为：零 GC 原地插入排序后，每条棱与每个
//      顶点的线宽、透明度、柔光光晕全部随深度从 0 开始连续平滑线性渐变，无任何跳变。
//   3. 100% 同心保形正交投影 + 四维挠率微旋（彻底杜绝变扁/菱形剪切畸变）：
//      之前混合了非等距的 xw 剪切与绕 X 轴斜切，导致正方形截面被拉扁成细长菱形（如截图所示）。
//      现严格保持每个 (z, w) 截面以原点为中心做纯正交旋转（永远是标准 1:1 的 90° 正方形，
//      数学上绝不可能被压扁或拉成菱形），同时对不同 z' 深度赋予微小的四维挠率角差（Clifford
//      Torsion），使四个嵌套正方形在穿越彼此半径时错开角度、永不共线重叠。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

/** 图上这个节点固定用这个 id。 */
export const TESSERACT_ID = 'tesseract-space';
const TESSERACT_CLASS = 'tesseract-node';

export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

/**
 * 16 个顶点：v 的第 k 位是 1 → 第 k 维取 +1，是 0 → 取 -1。
 * 展开写出来是 [(±1,±1,±1,±1)] 的全部 16 种组合，正是 4D 超立方体的顶点集。
 */
export const VERTICES_4D: readonly Vec4[] = Array.from({ length: 16 }, (_, v) => [
  v & 1 ? 1 : -1,
  v & 2 ? 1 : -1,
  v & 4 ? 1 : -1,
  v & 8 ? 1 : -1,
]);

/**
 * 32 条棱。两个顶点在某一位上不同、其余三位相同 ⇒ 它们相邻，即
 * `v ↔ v ^ (1 << k)`（v 是 4bit 顶点编号，k 取 0..3）。
 */
export const EDGES: readonly (readonly [number, number])[] = (() => {
  const seen = new Set<string>();
  const out: (readonly [number, number])[] = [];
  for (let v = 0; v < 16; v++) {
    for (let k = 0; k < 4; k++) {
      const w = v ^ (1 << k);
      const key = v < w ? `${v}-${w}` : `${w}-${v}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v < w ? [v, w] : [w, v]);
    }
  }
  return out;
})();

/**
 * 四个同心 (z, w) 截面正方环各自的 4 个顶点索引（按逆时针排列），
 * 用于为内层胞腔填充柔和的晶体薄雾感。
 */
const ZW_RINGS: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 3, 2], // z=-1, w=-1
  [4, 5, 7, 6], // z=+1, w=-1
  [8, 9, 11, 10], // z=-1, w=+1
  [12, 13, 15, 14], // z=+1, w=+1
];

/** w 分量为 0 会让透视除法爆掉；限深度窗而不是限角度，这样各轴表现一致。 */
const W_FLOOR = 0.45;
/** 4D→3D 的观察距离。 */
const W_DISTANCE = 2.65;
/** 3D→2D 的观察距离。 */
const Z_DISTANCE = 5.2;

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

/** 尺寸统一由 spectacle-size 决定（五个奇观共用一个视觉半径）。 */
function pickRadius(cy: cytoscape.Core): number {
  return pickSpectacleParam(graphSpread(cy).spread, 'tesseract');
}

/** 命中盒边长——从视觉半径换算，不写死数字。 */
function hitboxSize(radius: number): number {
  return radius * 2 * 1.05;
}

function pickSpawnPoint(cy: cytoscape.Core): { x: number; y: number } {
  const { bb } = graphSpread(cy);
  return {
    x: bb.x1 + Math.random() * (bb.x2 - bb.x1),
    y: bb.y1 + Math.random() * (bb.y2 - bb.y1),
  };
}

/** xy 平面旋转 θ。z/w 分量原样透传。 */
function rotateXY([x, y, z, w]: Vec4, c: number, s: number): Vec4 {
  return [x * c - y * s, x * s + y * c, z, w];
}

/** zw 平面旋转 θ。x/y 分量原样透传。 */
function rotateZW([x, y, z, w]: Vec4, c: number, s: number): Vec4 {
  return [x, y, z * c - w * s, z * s + w * c];
}

/** 4D → 3D 透视投影。 */
function project4D(p: Vec4): Vec3 {
  const [x, y, z, w] = p;
  const k = W_DISTANCE / Math.max(W_FLOOR, W_DISTANCE - w);
  return [x * k, y * k, z * k];
}

/** 3D → 2D 透视投影。canvas y 轴向下，所以第二分量取负。 */
function project3D([x, y, z]: Vec3): Vec3 {
  const k = Z_DISTANCE / (Z_DISTANCE - z);
  return [x * k, -y * k, k];
}

/**
 * 整条投影链纯函数（保留供外部单元测试与几何校验使用）：
 * 16 个 4D 顶点 → 旋转 → 4D→3D → 3D→2D。
 */
export function projectTesseract(alpha: number, beta: number): readonly Vec3[] {
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  const cosB = Math.cos(beta);
  const sinB = Math.sin(beta);
  return VERTICES_4D.map((v) =>
    project3D(project4D(rotateZW(rotateXY(v, cosA, sinA), cosB, sinB))),
  );
}

export interface TesseractOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  ink?: string;
  glow?: string;
  /** 一圈完整旋转的秒数。越小转得越快。 */
  spinSeconds?: number;
  fps?: number;
}

export class TesseractOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly ink: string;
  private readonly glow: string;
  private readonly spinSeconds: number;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  // ── 预分配零 GC 投影工作缓冲区（16 顶点 + 32 棱排序缓冲）──────────────
  private readonly projX = new Float64Array(16);
  private readonly projY = new Float64Array(16);
  /** 综合透视深度系数 k（>1 靠近观察者，<1 远离观察者） */
  private readonly projK = new Float64Array(16);
  /** 旋转后的实时第四维坐标 w' */
  private readonly projW = new Float64Array(16);

  /** 32 条棱的预分配排序索引与深度数组（原地插入排序，0 对象分配） */
  private readonly edgeOrder = new Uint8Array(32);
  private readonly edgeDepth = new Float64Array(32);
  /** 16 个顶点的预分配排序索引 */
  private readonly vertOrder = new Uint8Array(16);

  private tesseractNode: cytoscape.NodeSingular | null = null;
  private modelRadius = 180;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  // 渐变缓存（按渲染半径 R 懒更新，平移动画时零分配）
  private cachedGradR = -1;
  private fieldGlowGrad: CanvasGradient | null = null;
  private coreBloomGrad: CanvasGradient | null = null;

  private rafId: number | null = null;
  private startedAt = 0;
  private lastDrawAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  constructor(options: TesseractOverlayOptions) {
    this.cy = options.cy;
    this.ink = options.ink ?? '#cfe4ff';
    this.glow = options.glow ?? 'rgba(124, 181, 255, 0.5)';
    this.spinSeconds = Math.max(2, options.spinSeconds ?? 26);
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    for (let i = 0; i < 32; i++) this.edgeOrder[i] = i;
    for (let i = 0; i < 16; i++) this.vertOrder[i] = i;

    this.tesseractNode = spawnTesseractNode(this.cy);
    this.modelRadius = pickRadius(this.cy);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-tesseract', '');
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

  /** 传送到新的随机起点；命中盒跟着新半径重新同步。 */
  reroll(): void {
    const node = this.getTesseractNode();
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
    const node = this.getTesseractNode();
    if (node && node.nonempty()) this.cy.remove(node);
    this.tesseractNode = null;
  }

  private getTesseractNode(): cytoscape.NodeSingular | null {
    if (this.tesseractNode && this.tesseractNode.nonempty() && !this.tesseractNode.removed()) {
      return this.tesseractNode;
    }
    const found = this.cy.getElementById(TESSERACT_ID);
    this.tesseractNode = found.nonempty() ? found : null;
    return this.tesseractNode;
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
   * 懒更新径向渐变缓存（零 shadowBlur 方案）。
   */
  private ensureGradients(ctx: CanvasRenderingContext2D, R: number): void {
    if (Math.abs(R - this.cachedGradR) < 0.75 && this.fieldGlowGrad && this.coreBloomGrad) {
      return;
    }
    this.cachedGradR = R;

    // 1. 四维时空度规场背景冷光晕
    const field = ctx.createRadialGradient(0, 0, R * 0.06, 0, 0, R * 1.12);
    field.addColorStop(0, 'rgba(96, 165, 250, 0.14)');
    field.addColorStop(0.42, 'rgba(99, 102, 241, 0.07)');
    field.addColorStop(0.78, 'rgba(30, 58, 138, 0.02)');
    field.addColorStop(1, 'rgba(15, 23, 42, 0)');
    this.fieldGlowGrad = field;

    // 2. 超立方体中心高维晶核柔光
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.44);
    core.addColorStop(0, 'rgba(186, 230, 253, 0.16)');
    core.addColorStop(0.5, 'rgba(125, 211, 252, 0.05)');
    core.addColorStop(1, 'rgba(56, 189, 248, 0)');
    this.coreBloomGrad = core;
  }

  /**
   * 100% 同心保形四维投影管线：
   * - 先在 zw 平面旋转得到 (z1, w1)；
   * - 在 xy 平面旋转时，根据该截面的 z1 深度附加微小的四维挠率角差（z1 * 0.11 rad）：
   *   由于每个 (z, w) 截面的 4 个顶点共享完全相同的 (z1, w1)，它们旋转相同的角度、缩放
   *   相同的比例，因此在屏幕上永远是严格以 (0,0) 为中心的 90° 正方形，绝不可能变扁或被拉成菱形；
   * - 同时因为前后截面的挠率角相差约 12°，四个正方形在由内向外翻转穿越时永远错开角度，
   *   呈现出精密八角晶格般的立体嵌套层次。
   */
  private computeProjection(alpha: number, beta: number): void {
    const cosB = Math.cos(beta);
    const sinB = Math.sin(beta);

    for (let i = 0; i < 16; i++) {
      const v = VERTICES_4D[i];
      // 1. zw 平面四维翻转
      const z1 = v[2] * cosB - v[3] * sinB;
      const w1 = v[2] * sinB + v[3] * cosB;

      // 2. xy 平面同心保形旋转（带 z1 四维挠率角差，保证每个环都是正 90° 正方形且互不重叠）
      const twistAlpha = alpha + z1 * 0.11;
      const cosA = Math.cos(twistAlpha);
      const sinA = Math.sin(twistAlpha);
      const x1 = v[0] * cosA - v[1] * sinA;
      const y1 = v[0] * sinA + v[1] * cosA;

      // 3. 4D → 3D → 2D 同心透视缩放
      const kw = W_DISTANCE / Math.max(W_FLOOR, W_DISTANCE - w1);
      const x3 = x1 * kw;
      const y3 = y1 * kw;
      const z3 = z1 * kw;

      const kz = Z_DISTANCE / (Z_DISTANCE - z3);
      this.projX[i] = x3 * kz;
      this.projY[i] = -y3 * kz;
      this.projK[i] = kz;
      this.projW[i] = w1;
    }

    // 原地插入排序 32 条棱（由远及近画家算法，0 内存分配）
    for (let i = 0; i < 32; i++) {
      const e = EDGES[i];
      this.edgeDepth[i] = (this.projK[e[0]] + this.projK[e[1]]) * 0.5;
    }
    for (let i = 1; i < 32; i++) {
      const idx = this.edgeOrder[i];
      const d = this.edgeDepth[idx];
      let j = i - 1;
      while (j >= 0 && this.edgeDepth[this.edgeOrder[j]] > d) {
        this.edgeOrder[j + 1] = this.edgeOrder[j];
        j--;
      }
      this.edgeOrder[j + 1] = idx;
    }

    // 原地插入排序 16 个顶点（由远及近）
    for (let i = 1; i < 16; i++) {
      const idx = this.vertOrder[i];
      const d = this.projK[idx];
      let j = i - 1;
      while (j >= 0 && this.projK[this.vertOrder[j]] > d) {
        this.vertOrder[j + 1] = this.vertOrder[j];
        j--;
      }
      this.vertOrder[j + 1] = idx;
    }
  }

  // ── 绘制 ──────────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 全画布擦除：走浏览器合成器 GPU 快速清空通道，彻底杜绝任何边缘残影
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const node = this.getTesseractNode();
    if (!node || !isElementShown(node)) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    const R = Math.max(this.modelRadius * zoom, 6);
    const rx = p.x;
    const ry = p.y;

    const reach = R * 1.35 + 24;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    ) {
      return;
    }

    this.ensureGradients(ctx, R);

    // 两个旋转平面的角速度比取无理数近似（√2），使 (α,β) 不在短周期内重复
    const omega = (Math.PI * 2) / this.spinSeconds;
    const alpha = this.reducedMotion ? 0.35 : t * omega;
    const beta = this.reducedMotion ? 0.45 : t * omega * Math.SQRT2;

    this.computeProjection(alpha, beta);

    const unit = R * 0.48;
    const breathe = this.reducedMotion ? 1 : 1 + 0.022 * Math.sin(t * 0.5);

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(breathe, breathe);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ── 1. 四维时空度规场背景冷光晕 + 中心晶核柔光 ───────────────────────
    if (this.fieldGlowGrad) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.12, 0, Math.PI * 2);
      ctx.fillStyle = this.fieldGlowGrad;
      ctx.fill();
    }

    // 为当前处于内圈的正方形截面填充极轻柔的冷青晶格薄雾（随 w' 深度从 0 平滑渐变）
    for (let r = 0; r < 4; r++) {
      const ring = ZW_RINGS[r];
      const wRing = this.projW[ring[0]];
      const ringWeight = clamp((-wRing + 0.5) / 1.8, 0, 1);
      if (ringWeight <= 0.005) continue;

      ctx.beginPath();
      ctx.moveTo(this.projX[ring[0]] * unit, this.projY[ring[0]] * unit);
      ctx.lineTo(this.projX[ring[1]] * unit, this.projY[ring[1]] * unit);
      ctx.lineTo(this.projX[ring[2]] * unit, this.projY[ring[2]] * unit);
      ctx.lineTo(this.projX[ring[3]] * unit, this.projY[ring[3]] * unit);
      ctx.closePath();
      ctx.fillStyle = 'rgba(125, 211, 252, 1)';
      ctx.globalAlpha = 0.045 * ringWeight;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (this.coreBloomGrad) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.44, 0, Math.PI * 2);
      ctx.fillStyle = this.coreBloomGrad;
      ctx.fill();
    }

    // ── 2. 32 条棱：画家算法由远及近绘制（全连续平滑插值，0 闪烁、0 shadowBlur）──
    for (let s = 0; s < 32; s++) {
      const idx = this.edgeOrder[s];
      const e = EDGES[idx];
      const a = e[0];
      const b = e[1];

      const k = this.edgeDepth[idx];
      const near = clamp((k - 0.72) / 0.56, 0, 1);
      const wAvg = (this.projW[a] + this.projW[b]) * 0.5;
      // wFactor 平滑反映当前棱在第四维的前后位置（0=内隐深处，1=外显近处）
      const wFactor = clamp((wAvg + 1.35) / 2.7, 0, 1);

      const ax = this.projX[a] * unit;
      const ay = this.projY[a] * unit;
      const bx = this.projX[b] * unit;
      const by = this.projY[b] * unit;

      // 2.1 近景柔光外衬：透明度从 near=0.45 处的 0.000 连续平滑爬升，绝无阈值跳变闪烁
      const glowWeight = clamp((near - 0.45) / 0.55, 0, 1) * wFactor;
      if (glowWeight > 0.005) {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = this.glow;
        ctx.globalAlpha = 0.34 * glowWeight;
        ctx.lineWidth = (2.2 + 1.8 * near) * Math.max(1, R * 0.0075);
        ctx.stroke();
      }

      // 2.2 棱线核心：全部采用连续实线，依靠线宽与透明度表达四维空气透视
      const alpha = 0.2 + 0.34 * wFactor + 0.4 * near;
      const lineW = (0.72 + 0.52 * wFactor + 0.62 * near) * Math.max(0.85, R * 0.0068);

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = this.ink;
      ctx.globalAlpha = clamp(alpha, 0.16, 0.94);
      ctx.lineWidth = lineW;
      ctx.stroke();
    }

    // ── 3. 16 个四维顶点：光晕与亮核全部随深度平滑连续过渡 ───────────────
    for (let s = 0; s < 16; s++) {
      const i = this.vertOrder[s];
      const near = clamp((this.projK[i] - 0.72) / 0.56, 0, 1);
      const wFactor = clamp((this.projW[i] + 1.35) / 2.7, 0, 1);
      const vx = this.projX[i] * unit;
      const vy = this.projY[i] * unit;

      // 3.1 顶点外围柔光晕（从 near=0.35 处的 0 透明度平滑渐入，替代 shadowBlur）
      const haloWeight = clamp((near - 0.35) / 0.65, 0, 1) * wFactor;
      if (haloWeight > 0.005) {
        const haloR = R * (0.016 + 0.016 * near);
        ctx.beginPath();
        ctx.arc(vx, vy, haloR, 0, Math.PI * 2);
        ctx.fillStyle = this.glow;
        ctx.globalAlpha = 0.42 * haloWeight;
        ctx.fill();
      }

      // 3.2 顶点实心亮核
      const r = R * (0.0075 + 0.005 * wFactor) * (0.68 + 0.48 * near);
      ctx.beginPath();
      ctx.arc(vx, vy, r, 0, Math.PI * 2);
      ctx.fillStyle = this.ink;
      ctx.globalAlpha = 0.3 + 0.32 * wFactor + 0.35 * near;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/**
 * 往图里加这个孤立节点（已存在则直接复用）。不 lock()：交给 euler 的斥力物理
 * 决定落点——见文件头注释。
 */
export function spawnTesseractNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(TESSERACT_ID);
  if (existing.nonempty()) {
    existing.addClass(`layer-parent ${TESSERACT_CLASS}`);
    stripNodeChrome(existing, size);
    return existing;
  }

  const { x, y } = pickSpawnPoint(cy);
  const node = cy.add({
    group: 'nodes',
    data: { id: TESSERACT_ID, label: '四维空间' },
    position: { x, y },
    classes: `layer-parent ${TESSERACT_CLASS}`,
  });
  stripNodeChrome(node, size);

  void fetchTesseractContent(node);
  return node;
}

/**
 * 抹掉 cytoscape 自身画的所有可见 chrome：本体完全透明，只留一个与视觉半径
 * 同步的圆形命中盒。
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
  });
}

async function fetchTesseractContent(node: cytoscape.NodeSingular): Promise<void> {
  await loadDecorContent(node);
}

export function createTesseractOverlay(options: TesseractOverlayOptions): TesseractOverlay {
  return new TesseractOverlay(options);
}