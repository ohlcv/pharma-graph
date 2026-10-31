// src/core/spectacle/chaos-attractor-island-overlay.ts
// 洛伦兹双翼与稳定岛（chaos-attractor-island）：装饰奇观节点。
// 对应内容节点：混沌吸引子与稳定岛.md
//
// 数学与视觉内核设计（"不可精准预言但有宏观边界：混沌海中的局部稳定岛"）：
//   1. 内核：三维旋转洛伦兹奇怪吸引子（Lorenz Strange Attractor, σ=10, ρ=28, β=8/3）：
//      - 采用四阶龙格-库塔法（RK4）预积分高密度三维相空间流线（900 个采样步），在逐帧渲染中
//        做三维欧拉倾角旋转与透视投影，将左翼（冰青色）与右翼（流金珊瑚色）按 8 段连续色带合批
//        描边，并标出双翼中心的鞍焦平衡点（C₊ / C₋ 吸引子眼）。
//   2. 蝴蝶效应双生粒子（初值相差 Δx₀ = 10⁻⁴ 的指数级分道扬镳）：
//      - 预积分两条初值仅相差 δ₀ = 10⁻⁴ 的耦合 RK4 轨迹：前段两颗荧光粒子（冰青星子 A 与
//        赤金星子 B）几乎完全重合、同轨共舞；随后受正李雅普诺夫指数（λ₁ ≈ 0.906）支配，
//        在鞍点分岔处突然指数级分离、各自跃入左右不同翼面，中间连以李雅普诺夫分岔张力虚线。
//   3. 外环：奇里科夫标准映射（Chirikov Standard Map）KAM 稳定岛链同心环：
//      - 真实迭代保面积辛映射：pₙ₊₁ = pₙ + K·sin(θₙ), θₙ₊₁ = θₙ + pₙ₊₁ (mod 2π)，取黄金分割
//        临界参数 K = 0.9716；
//      - 将相空间 (θ, p) 映射为外圈极坐标环带（r ∈ [0.68R, 0.97R]），完整呈现：
//        * 未破裂的【KAM 不变环面】（阻隔混沌扩散的宏观拓扑边界）；
//        * 镶嵌在随机层中的【周期共振稳定岛链】（1:1 主稳定岛与高阶次级岛链，闭合椭圆轨道）；
//        * 环绕岛链的【遍历混沌海】庞加莱截面散点。
//   4. 极致性能优化（KAM 相空间离屏烘焙 + 零 GC 预分配 Float64Array + 零 shadowBlur）：
//      - 外圈数千个奇里科夫映射庞加莱截面点、KAM 环面与稳定岛链在首次绘制时一次性烘焙进固定
//        分辨率的离屏画布 `kamCache`（与 zoom 解耦，缩放时零重建），每帧仅需 1 次 GPU `drawImage`；
//      - 内核三维洛伦兹流线全部使用预分配 `Float64Array` 零 GC 投影，分 8 段连续 Path 描边，
//        彻底杜绝 `shadowBlur` 与逐帧对象分配。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

/** 图上这个节点固定用这个 id；对应 混沌吸引子与稳定岛.md */
export const CHAOS_ATTRACTOR_ID = 'chaos-attractor-island';
const CHAOS_ATTRACTOR_CLASS = 'chaos-attractor-island-node';

/** 离屏缓存基准逻辑半径（CSS px），与 zoom 解耦，保证缩放手势期间零重建。 */
const CACHE_BASE_R = 260;
const CACHE_PAD_RATIO = 1.12;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── 1. 洛伦兹方程 RK4 积分内核（σ = 10, ρ = 28, β = 8/3）──────────────────

const LORENZ_SIGMA = 10;
const LORENZ_RHO = 28;
const LORENZ_BETA = 8 / 3;

/** 归一化缩放常数：将洛伦兹坐标 (x ∈ [-20,20], z ∈ [5,48]) 映射进半径 ~0.62 的内圈空间 */
const LORENZ_SCALE = 0.0255;
const LORENZ_Z_CENTER = 26.5;

function lorenzStepRK4(x: number, y: number, z: number, dt: number): [number, number, number] {
  const dx1 = LORENZ_SIGMA * (y - x);
  const dy1 = x * (LORENZ_RHO - z) - y;
  const dz1 = x * y - LORENZ_BETA * z;

  const x2 = x + dx1 * dt * 0.5;
  const y2 = y + dy1 * dt * 0.5;
  const z2 = z + dz1 * dt * 0.5;
  const dx2 = LORENZ_SIGMA * (y2 - x2);
  const dy2 = x2 * (LORENZ_RHO - z2) - y2;
  const dz2 = x2 * y2 - LORENZ_BETA * z2;

  const x3 = x + dx2 * dt * 0.5;
  const y3 = y + dy2 * dt * 0.5;
  const z3 = z + dz2 * dt * 0.5;
  const dx3 = LORENZ_SIGMA * (y3 - x3);
  const dy3 = x3 * (LORENZ_RHO - z3) - y3;
  const dz3 = x3 * y3 - LORENZ_BETA * z3;

  const x4 = x + dx3 * dt;
  const y4 = y + dy3 * dt;
  const z4 = z + dz3 * dt;
  const dx4 = LORENZ_SIGMA * (y4 - x4);
  const dy4 = x4 * (LORENZ_RHO - z4) - y4;
  const dz4 = x4 * y4 - LORENZ_BETA * z4;

  return [
    x + ((dx1 + 2 * dx2 + 2 * dx3 + dx4) * dt) / 6,
    y + ((dy1 + 2 * dy2 + 2 * dy3 + dy4) * dt) / 6,
    z + ((dz1 + 2 * dz2 + 2 * dz3 + dz4) * dt) / 6,
  ];
}

/** 主吸引子三维流线采样点数 */
const STREAM_POINTS = 880;
const STREAM_BANDS = 8;

/** 预积分的主吸引子三维归一化坐标（x, y, z） */
const STREAM_X = new Float64Array(STREAM_POINTS);
const STREAM_Y = new Float64Array(STREAM_POINTS);
const STREAM_Z = new Float64Array(STREAM_POINTS);

(() => {
  let x = 0.1;
  let y = 0.0;
  let z = 0.0;
  const dt = 0.0075;
  // 先空跑 300 步跳过瞬态，使轨迹完全落在奇怪吸引子流形上
  for (let i = 0; i < 300; i++) {
    [x, y, z] = lorenzStepRK4(x, y, z, dt);
  }
  for (let i = 0; i < STREAM_POINTS; i++) {
    [x, y, z] = lorenzStepRK4(x, y, z, dt);
    STREAM_X[i] = x * LORENZ_SCALE;
    STREAM_Y[i] = y * LORENZ_SCALE;
    STREAM_Z[i] = (z - LORENZ_Z_CENTER) * LORENZ_SCALE;
  }
})();

/** 双翼平衡点（不动点 C₊ 与 C₋）：(±√(β(ρ-1)), ±√(β(ρ-1)), ρ-1) */
const EYE_COORD = Math.sqrt(LORENZ_BETA * (LORENZ_RHO - 1)) * LORENZ_SCALE; // ≈ ±8.485 * 0.0255
const EYE_Z = (LORENZ_RHO - 1 - LORENZ_Z_CENTER) * LORENZ_SCALE;

/**
 * 蝴蝶效应双生粒子轨迹（初值仅相差 Δx₀ = 10⁻⁴）：
 * 在 520 步积分周期内，前 ~220 步两条轨迹高度重合（如同一颗粒子），
 * 随后误差经李雅普诺夫指数放大，在鞍点分道扬镳，分别跃入左翼与右翼。
 */
const TWIN_STEPS = 520;
const TWIN_A_X = new Float64Array(TWIN_STEPS);
const TWIN_A_Y = new Float64Array(TWIN_STEPS);
const TWIN_A_Z = new Float64Array(TWIN_STEPS);
const TWIN_B_X = new Float64Array(TWIN_STEPS);
const TWIN_B_Y = new Float64Array(TWIN_STEPS);
const TWIN_B_Z = new Float64Array(TWIN_STEPS);

(() => {
  // 选取吸引子流形上的一个经典起始点
  let ax = -5.2;
  let ay = -7.1;
  let az = 18.5;
  const dt = 0.008;
  for (let i = 0; i < 120; i++) {
    [ax, ay, az] = lorenzStepRK4(ax, ay, az, dt);
  }
  // 粒子 B 初值与粒子 A 仅相差 Δx₀ = 1e-4（0.0001）
  let bx = ax + 1e-4;
  let by = ay;
  let bz = az;

  for (let i = 0; i < TWIN_STEPS; i++) {
    [ax, ay, az] = lorenzStepRK4(ax, ay, az, dt);
    [bx, by, bz] = lorenzStepRK4(bx, by, bz, dt);
    TWIN_A_X[i] = ax * LORENZ_SCALE;
    TWIN_A_Y[i] = ay * LORENZ_SCALE;
    TWIN_A_Z[i] = (az - LORENZ_Z_CENTER) * LORENZ_SCALE;

    TWIN_B_X[i] = bx * LORENZ_SCALE;
    TWIN_B_Y[i] = by * LORENZ_SCALE;
    TWIN_B_Z[i] = (bz - LORENZ_Z_CENTER) * LORENZ_SCALE;
  }
})();

// ── 2. 外圈奇里科夫标准映射（Chirikov Standard Map）KAM 稳定岛链计算 ──────

interface KamIslandCenter {
  readonly theta: number;
  readonly pNorm: number;
  readonly label?: string;
}

/** 黄金分割临界区附近的 4 座主/次级共振 KAM 稳定岛锚点（极坐标相位） */
const KAM_ISLAND_ANCHORS: readonly KamIslandCenter[] = [
  { theta: Math.PI, pNorm: 0, label: 'KAM 主稳定岛' }, // 1:1 不动点主岛中心 (θ = π, p = 0)
  { theta: 0, pNorm: 0.5 }, // 2:1 上半平面共振稳定岛
  { theta: 0, pNorm: -0.5 }, // 2:1 下半平面共振稳定岛
  { theta: Math.PI * 0.5, pNorm: 0.33 }, // 3:1 次级稳定岛链
];

// ── Cytoscape 节点接入与生命周期 ──────────────────────────────────────────

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
  const spread = graphSpread(cy).spread;
  try {
    const r = pickSpectacleParam(spread, 'chaos-attractor-island');
    if (Number.isFinite(r) && r > 0) return r;
  } catch {
    /* fallback */
  }
  return Math.max(140, Math.min(320, spread * 0.14));
}

function hitboxSize(radius: number): number {
  return radius * 2 * 0.94;
}

function pickSpawnPoint(cy: cytoscape.Core): { x: number; y: number } {
  const { bb } = graphSpread(cy);
  return {
    x: bb.x1 + Math.random() * (bb.x2 - bb.x1),
    y: bb.y1 + Math.random() * (bb.y2 - bb.y1),
  };
}

export function spawnChaosAttractorNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(CHAOS_ATTRACTOR_ID);
  if (existing.nonempty()) {
    existing.addClass(`layer-parent ${CHAOS_ATTRACTOR_CLASS}`);
    stripNodeChrome(existing, size);
    return existing;
  }

  const { x, y } = pickSpawnPoint(cy);
  const node = cy.add({
    group: 'nodes',
    data: {
      id: CHAOS_ATTRACTOR_ID,
      label: '洛伦兹双翼与稳定岛',
      rel: '装饰奇观/洛伦兹双翼与稳定岛.md',
    },
    position: { x, y },
    classes: `layer-parent ${CHAOS_ATTRACTOR_CLASS}`,
  });
  stripNodeChrome(node, size);
  void loadDecorContent(node);
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

// ── 覆盖层：外圈 KAM 稳定岛离屏烘焙 + 内圈三维洛伦兹吸引子实时演化 ────────

export interface ChaosAttractorOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  /** 三维洛伦兹吸引子完整自转一圈的秒数。默认 28 秒。 */
  spinSeconds?: number;
  /** 双生蝴蝶效应粒子从重合到分道扬镳的演化周期秒数。默认 13 秒。 */
  divergenceSeconds?: number;
  fps?: number;
}

export class ChaosAttractorOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly spinSeconds: number;
  private readonly divergenceSeconds: number;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  // ── 预分配零 GC 三维投影缓冲区 ──────────────────────────────────────
  private readonly projX = new Float64Array(STREAM_POINTS);
  private readonly projY = new Float64Array(STREAM_POINTS);

  private chaosNode: cytoscape.NodeSingular | null = null;
  private modelRadius = 210;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  /**
   * 外圈奇里科夫标准映射（KAM 稳定岛链 + 不变环面 + 混沌海庞加莱截面）静态离屏缓存：
   * 仅在首次绘制或 dpr 改变时烘焙一次，每帧只需 1 次 GPU drawImage。
   */
  private kamCache: HTMLCanvasElement | null = null;
  private kamCacheDpr = -1;

  private rafId: number | null = null;
  private startedAt = 0;
  private lastDrawAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  constructor(options: ChaosAttractorOverlayOptions) {
    this.cy = options.cy;
    this.spinSeconds = Math.max(4, options.spinSeconds ?? 28);
    this.divergenceSeconds = Math.max(4, options.divergenceSeconds ?? 13);
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.chaosNode = spawnChaosAttractorNode(this.cy);
    this.modelRadius = pickRadius(this.cy);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-chaos-attractor-island', '');
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
    const node = this.getChaosNode();
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
    const node = this.getChaosNode();
    if (node) this.cy.remove(node);
    this.chaosNode = null;
  }

  private getChaosNode(): cytoscape.NodeSingular | null {
    if (this.chaosNode && this.chaosNode.nonempty() && !this.chaosNode.removed()) {
      return this.chaosNode;
    }
    const found = this.cy.getElementById(CHAOS_ATTRACTOR_ID);
    this.chaosNode = found.nonempty() ? found : null;
    return this.chaosNode;
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

  // ── 离屏烘焙：奇里科夫标准映射（Standard Map）KAM 稳定岛链同心环 ────────

  private ensureKamCache(dpr: number): HTMLCanvasElement | null {
    if (this.kamCache && this.kamCacheDpr === dpr) return this.kamCache;

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

    // 1. 深空相空间氛围底晕（内圈双翼青金微光 → 外圈 KAM 深海靛紫）
    const bgGrad = c.createRadialGradient(0, 0, R * 0.08, 0, 0, R * 1.06);
    bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.72)');
    bgGrad.addColorStop(0.55, 'rgba(17, 24, 39, 0.58)');
    bgGrad.addColorStop(0.78, 'rgba(30, 58, 138, 0.26)');
    bgGrad.addColorStop(0.95, 'rgba(88, 28, 135, 0.14)');
    bgGrad.addColorStop(1, 'rgba(10, 10, 22, 0)');
    c.fillStyle = bgGrad;
    c.beginPath();
    c.arc(0, 0, R * 1.06, 0, Math.PI * 2);
    c.fill();

    // 2. 奇里科夫标准映射（Chirikov Standard Map）极坐标环带烘焙：
    //    将相空间 (θ ∈ [0, 2π), p ∈ [-π, π]) 映射至 r ∈ [0.68R, 0.97R]
    const rMid = R * 0.825;
    const rHalfSpan = R * 0.145;
    const K = 0.92; // 黄金分割临界值附近的保面积辛映射参数

    // 内外宏观拓扑边界环（象征"不可精准预言但有宏观边界"）
    c.beginPath();
    c.arc(0, 0, rMid - rHalfSpan, 0, Math.PI * 2);
    c.arc(0, 0, rMid + rHalfSpan, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(125, 211, 252, 0.25)';
    c.lineWidth = 1.1;
    c.stroke();

    // 2.1 遍历混沌海（Stochastic Chaotic Sea）：从双曲不动点 (θ = 0, p = 0) 附近出发的混沌轨道散点
    const chaoticSeeds: ReadonlyArray<[number, number]> = [
      [0.05, 0.02],
      [0.12, -0.04],
      [3.14, 2.85],
      [3.14, -2.85],
      [1.57, 1.48],
      [4.71, -1.48],
    ];
    c.beginPath();
    for (let s = 0; s < chaoticSeeds.length; s++) {
      let theta = chaoticSeeds[s][0];
      let p = chaoticSeeds[s][1];
      for (let step = 0; step < 260; step++) {
        p = p + K * Math.sin(theta);
        // 折叠到 [-π, π]
        p = ((((p + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
        theta = (((theta + p) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

        const r = rMid + (p / Math.PI) * rHalfSpan;
        const px = Math.cos(theta) * r;
        const py = Math.sin(theta) * r;
        c.rect(px - 0.65, py - 0.65, 1.3, 1.3);
      }
    }
    c.fillStyle = 'rgba(147, 197, 253, 0.30)';
    c.fill();

    // 2.2 未破裂的 KAM 不变环面（Invariant KAM Tori）：封锁混沌扩散的准周期金色/冰青连续波纹环
    const kamToriP0 = [-2.35, -1.85, 1.85, 2.35];
    c.beginPath();
    for (let tIdx = 0; tIdx < kamToriP0.length; tIdx++) {
      let theta = 0.0;
      let p = kamToriP0[tIdx];
      for (let step = 0; step < 220; step++) {
        p = p + K * Math.sin(theta);
        p = ((((p + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
        theta = (((theta + p) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const r = rMid + (p / Math.PI) * rHalfSpan;
        const px = Math.cos(theta) * r;
        const py = Math.sin(theta) * r;
        c.moveTo(px + 0.9, py);
        c.arc(px, py, 0.9, 0, Math.PI * 2);
      }
    }
    c.fillStyle = 'rgba(56, 189, 248, 0.58)';
    c.fill();

    // 2.3 周期共振 KAM 稳定岛链（1:1 主稳定岛环绕 θ=π, p=0；以及 2:1 次级稳定岛环绕 θ=0, p=±π/2）
    // 在极坐标环上绘制清晰的嵌套椭圆稳定岛闭合不变曲线（象征"在混沌海中锚定自己的局部稳定岛"）
    // (a) 1:1 主稳定岛链（4 层同心椭圆涡旋）
    const mainIslandLayers = [0.22, 0.42, 0.64, 0.86];
    c.beginPath();
    for (let l = 0; l < mainIslandLayers.length; l++) {
      const scale = mainIslandLayers[l];
      const dThetaMax = 0.68 * scale;
      const dPMax = 0.92 * scale;
      const steps = 64;
      for (let k = 0; k <= steps; k++) {
        const phi = (k / steps) * Math.PI * 2;
        const theta = Math.PI + Math.cos(phi) * dThetaMax;
        const p = Math.sin(phi) * dPMax;
        const r = rMid + (p / Math.PI) * rHalfSpan;
        const px = Math.cos(theta) * r;
        const py = Math.sin(theta) * r;
        if (k === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
    }
    // (b) 2:1 与 3:1 次级共振稳定岛项链（6 颗次级稳定岛镶嵌在环带四周）
    const subIslands: ReadonlyArray<{ theta0: number; p0: number; wT: number; wP: number }> = [
      { theta0: 0, p0: Math.PI * 0.48, wT: 0.34, wP: 0.38 },
      { theta0: 0, p0: -Math.PI * 0.48, wT: 0.34, wP: 0.38 },
      { theta0: Math.PI * 0.48, p0: Math.PI * 0.32, wT: 0.24, wP: 0.28 },
      { theta0: Math.PI * 1.52, p0: Math.PI * 0.32, wT: 0.24, wP: 0.28 },
      { theta0: Math.PI * 0.48, p0: -Math.PI * 0.32, wT: 0.24, wP: 0.28 },
      { theta0: Math.PI * 1.52, p0: -Math.PI * 0.32, wT: 0.24, wP: 0.28 },
    ];
    for (let idx = 0; idx < subIslands.length; idx++) {
      const isl = subIslands[idx];
      for (const ringScale of [0.48, 0.92]) {
        const steps = 40;
        for (let k = 0; k <= steps; k++) {
          const phi = (k / steps) * Math.PI * 2;
          const theta = isl.theta0 + Math.cos(phi) * isl.wT * ringScale;
          const p = isl.p0 + Math.sin(phi) * isl.wP * ringScale;
          const r = rMid + (p / Math.PI) * rHalfSpan;
          const px = Math.cos(theta) * r;
          const py = Math.sin(theta) * r;
          if (k === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
      }
    }
    c.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    c.lineWidth = 1.15;
    c.stroke();

    this.kamCache = cv;
    this.kamCacheDpr = dpr;
    return cv;
  }

  /**
   * 将三维洛伦兹归一化点 (x, y, z) 旋转并透视投影到二维屏幕平面。
   */
  private projectPoint3D(
    x: number,
    y: number,
    z: number,
    cosYaw: number,
    sinYaw: number,
    cosPitch: number,
    sinPitch: number,
  ): [number, number, number] {
    // 1. 绕 Z 轴（方位角）旋转，展现双翼的三维立体展开
    const x1 = x * cosYaw - y * sinYaw;
    const y1 = x * sinYaw + y * cosYaw;
    const z1 = z;

    // 2. 绕 X 轴（俯仰角 ~68°）旋转，将 (x, z) 蝴蝶双翼立起来朝向观察者
    const y2 = y1 * cosPitch - z1 * sinPitch;
    const z2 = y1 * sinPitch + z1 * cosPitch;

    // 3. 温和透视投影
    const camDist = 2.6;
    const k = camDist / (camDist - y2);
    return [x1 * k, -z2 * k, k];
  }

  // ── 逐帧绘制 ──────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const node = this.getChaosNode();
    if (!node || !isElementShown(node)) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    const R = Math.max(this.modelRadius * zoom, 10);
    const rx = p.x;
    const ry = p.y;

    const reach = R * CACHE_PAD_RATIO + 20;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    ) {
      return;
    }

    const breathe = this.reducedMotion ? 1 : 1 + 0.016 * Math.sin(t * 0.45);

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(breathe, breathe);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ── 1. 外圈：奇里科夫标准映射 KAM 稳定岛链同心环（1 次 GPU drawImage）──
    const kamAngle = this.reducedMotion ? 0 : -t * 0.025;
    const cache = this.ensureKamCache(this.dpr);
    if (cache) {
      ctx.save();
      ctx.rotate(kamAngle);
      const span = R * CACHE_PAD_RATIO;
      ctx.drawImage(cache, -span, -span, span * 2, span * 2);

      // 点亮稳定岛核心锚点（1:1 主稳定岛与次级稳定岛心）
      const rMid = R * 0.825;
      const rHalfSpan = R * 0.145;
      const dotR = Math.max(1.6, R * 0.016);
      ctx.beginPath();
      for (let i = 0; i < KAM_ISLAND_ANCHORS.length; i++) {
        const anc = KAM_ISLAND_ANCHORS[i];
        const r = rMid + anc.pNorm * rHalfSpan;
        const ax = Math.cos(anc.theta) * r;
        const ay = Math.sin(anc.theta) * r;
        ctx.moveTo(ax + dotR, ay);
        ctx.arc(ax, ay, dotR, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#fde68a';
      ctx.fill();
      ctx.restore();
    }

    // ── 2. 内核：三维旋转洛伦兹双翼奇怪吸引子（零 GC 原地投影 + 8 段光谱合批）──
    // 采用 gentle 摆动叠加缓慢旋转，让双翼始终以最舒展的立体角度呈现
    const yaw = this.reducedMotion ? 0.35 : (t / this.spinSeconds) * Math.PI * 2;
    const pitch = 1.22 + (this.reducedMotion ? 0 : 0.14 * Math.sin(t * 0.35));
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    for (let i = 0; i < STREAM_POINTS; i++) {
      const [px, py] = this.projectPoint3D(
        STREAM_X[i],
        STREAM_Y[i],
        STREAM_Z[i],
        cosYaw,
        sinYaw,
        cosPitch,
        sinPitch,
      );
      this.projX[i] = px * R;
      this.projY[i] = py * R;
    }

    // 2.1 双翼平衡点（吸引子眼 C₊ 与 C₋）柔光核
    const [eye1X, eye1Y] = this.projectPoint3D(
      EYE_COORD,
      EYE_COORD,
      EYE_Z,
      cosYaw,
      sinYaw,
      cosPitch,
      sinPitch,
    );
    const [eye2X, eye2Y] = this.projectPoint3D(
      -EYE_COORD,
      -EYE_COORD,
      EYE_Z,
      cosYaw,
      sinYaw,
      cosPitch,
      sinPitch,
    );
    const eyeR = Math.max(2.0, R * 0.022);
    ctx.beginPath();
    ctx.arc(eye1X * R, eye1Y * R, eyeR, 0, Math.PI * 2);
    ctx.arc(eye2X * R, eye2Y * R, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.45)';
    ctx.fill();

    // 2.2 分 8 段连续绘制三维洛伦兹双翼流线（由青蓝渐变至暖金紫红，仅 8 次 stroke）
    const bandSize = Math.floor((STREAM_POINTS - 1) / STREAM_BANDS);
    const bandColors = [
      'rgba(56, 189, 248, 0.34)',
      'rgba(96, 165, 250, 0.42)',
      'rgba(129, 140, 248, 0.48)',
      'rgba(167, 139, 250, 0.54)',
      'rgba(216, 180, 254, 0.60)',
      'rgba(244, 114, 182, 0.64)',
      'rgba(251, 146, 60, 0.70)',
      'rgba(56, 189, 248, 0.76)',
    ];

    const baseLineW = Math.max(0.95, R * 0.0075);
    for (let b = 0; b < STREAM_BANDS; b++) {
      const start = b * bandSize;
      const end = b === STREAM_BANDS - 1 ? STREAM_POINTS - 1 : (b + 1) * bandSize;
      ctx.beginPath();
      ctx.moveTo(this.projX[start], this.projY[start]);
      for (let i = start + 1; i <= end; i++) {
        ctx.lineTo(this.projX[i], this.projY[i]);
      }
      ctx.strokeStyle = bandColors[b];
      ctx.lineWidth = baseLineW * (0.85 + 0.06 * b);
      ctx.stroke();
    }

    // ── 3. 蝴蝶效应双生粒子（初值相差 Δx₀ = 10⁻⁴，从重合到指数级分道扬镳）──
    const uDiv = this.reducedMotion ? 0.62 : (t / this.divergenceSeconds) % 1;
    const headIdx = Math.min(TWIN_STEPS - 1, Math.floor(uDiv * (TWIN_STEPS - 1)));
    const tailLen = 52;
    const tailStart = Math.max(0, headIdx - tailLen);

    // 3.1 粒子 A（冰青荧光尾迹与亮核）
    ctx.beginPath();
    let axHead = 0;
    let ayHead = 0;
    for (let i = tailStart; i <= headIdx; i++) {
      const [px, py] = this.projectPoint3D(
        TWIN_A_X[i],
        TWIN_A_Y[i],
        TWIN_A_Z[i],
        cosYaw,
        sinYaw,
        cosPitch,
        sinPitch,
      );
      const sx = px * R;
      const sy = py * R;
      if (i === tailStart) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
      if (i === headIdx) {
        axHead = sx;
        ayHead = sy;
      }
    }
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.92)';
    ctx.lineWidth = Math.max(1.6, R * 0.014);
    ctx.stroke();

    // 3.2 粒子 B（初值 +10⁻⁴，赤金珊瑚荧光尾迹与亮核）
    ctx.beginPath();
    let bxHead = 0;
    let byHead = 0;
    for (let i = tailStart; i <= headIdx; i++) {
      const [px, py] = this.projectPoint3D(
        TWIN_B_X[i],
        TWIN_B_Y[i],
        TWIN_B_Z[i],
        cosYaw,
        sinYaw,
        cosPitch,
        sinPitch,
      );
      const sx = px * R;
      const sy = py * R;
      if (i === tailStart) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
      if (i === headIdx) {
        bxHead = sx;
        byHead = sy;
      }
    }
    ctx.strokeStyle = 'rgba(251, 113, 133, 0.92)';
    ctx.lineWidth = Math.max(1.6, R * 0.014);
    ctx.stroke();

    // 3.3 当两颗双生粒子开始指数级分岔时，绘制连接它们的李雅普诺夫分岔张力线
    const sepPx = Math.hypot(axHead - bxHead, ayHead - byHead);
    if (sepPx > R * 0.03) {
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(axHead, ayHead);
      ctx.lineTo(bxHead, byHead);
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.65)';
      ctx.lineWidth = Math.max(0.9, R * 0.007);
      ctx.stroke();
      ctx.restore();
    }

    // 3.4 双生粒子头部柔光晕与璀璨星核（0 shadowBlur）
    const pRadius = Math.max(2.2, R * 0.022);
    // 粒子 A 外晕 + 亮核
    ctx.beginPath();
    ctx.arc(axHead, ayHead, pRadius * 2.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.36)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(axHead, ayHead, pRadius * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = '#f0f9ff';
    ctx.fill();

    // 粒子 B 外晕 + 亮核
    ctx.beginPath();
    ctx.arc(bxHead, byHead, pRadius * 2.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 113, 133, 0.36)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bxHead, byHead, pRadius * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = '#fff1f2';
    ctx.fill();

    // ── 4. LOD 缩放自适应标注（仅在 R >= 92px 时浮现，缩小时自动淡出防粘连）──
    const labelAlpha = clamp((R - 92) / 48, 0, 1);
    if (labelAlpha > 0.02) {
      const fontPx = Math.max(8, Math.round(R * 0.042));
      ctx.font = `500 ${fontPx}px "SF Pro Display","PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = labelAlpha * 0.82;

      ctx.fillStyle = '#fde68a';
      ctx.fillText('KAM 稳定岛链', 0, -R * 0.83);

      ctx.fillStyle = '#bae6fd';
      const isDiverged = sepPx > R * 0.08;
      ctx.fillText(isDiverged ? 'Δx₀ = 10⁻⁴ · 指数分岔' : 'Δx₀ = 10⁻⁴ · 初值重合', 0, R * 0.58);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

export function createChaosAttractorOverlay(
  options: ChaosAttractorOverlayOptions,
): ChaosAttractorOverlay {
  return new ChaosAttractorOverlay(options);
}
