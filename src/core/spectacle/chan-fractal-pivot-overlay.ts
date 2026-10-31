// src/core/spectacle/chan-fractal-pivot-overlay.ts
// 缠论多级别自同构中枢（chan-fractal-pivot）：第六个装饰奇观节点。
// 对应内容节点：缠论：中枢自同构、走势终完美.md
//
// 视觉与数学内核设计（"多主体博弈的筹码引力井 · 走势终完美 · 不测而应"）：
//   1. 四层自同构几何晶体（K线博弈簇 → 顶底分型 → 次级别笔 → 本级别线段 → 三重递归中枢）：
//      - 底层以半透明量子博弈 K 线簇还原多主体无序博弈；
//      - 在局部极值处凝聚为几何"顶分型 / 底分型"晶簇，连点成 15 段次级别【笔】（冰青细线）
//        与高一级别【线段骨干】（流金亮线），直观呈现高低级别同构递归；
//      - 构建完整的"两中枢上涨 + 趋势顶背驰"经典自同构模型：
//        * 【中枢 A（子母双重递归中枢）】：内嵌次级别小中枢盒 A1 与扩展后的本级别大中枢框 A
//          （标注 ZG / ZD 重叠区间、GG / DD 波动极值角标与中枢引力轴）；
//        * 【中枢 B（高级别跃迁中枢）】：突破离开段回抽不触及 ZG_A（确立第三类买点 3B）后，
//          在上方构筑第二个自同构中枢晶匣 B。
//   2. 下方动态相平面动量面积柱（MACD 能量柱衰减对比 & 零轴黄白双线）：
//      - 视界下方开辟相平面动量观测区：绘制 DIF / DEA 双波包络与红绿动量柱；
//      - 直观对比 b 段主升浪的【饱满高能红柱面积 S1】与 c 段冲高时的【衰竭红柱面积 S2（S2 < S1）】，
//        并以金色虚线连接"价格创新高 vs 动量面积衰减"的背驰几何张力线。
//   3. 五大买卖点几何分界锚点（1B / 2B / 3B / 1S / 2S）：
//      - 在底背驰极值（1B）、首次回踩确认（2B）、突破回抽不破 ZG_A（3B）、趋势顶背驰临界点（1S）
//        与次高点确认（2S）处绽放八角星芒几何锚点；当画面缩小时文字标签按 LOD 自动平滑淡出，
//        绝不粘连成团。
//   4. 极致性能优化（离屏静态基底烘焙 + 1 次 GPU drawImage + 零 shadowBlur）：
//      - 引力井网格、博弈 K 线簇、三重中枢底框、MACD 基底柱与笔段骨架一次性烘焙进固定分辨率的
//        离屏画布 `baseCache`（与 zoom 解耦，缩放时零重建）；
//      - 逐帧动画仅执行 1 次 `drawImage` + 沿折线游走的自同构生长流光波包 + 买卖点星芒呼吸，
//        零 `shadowBlur`、零每帧对象分配，高分屏下满帧丝滑。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

/** 图上这个节点固定用这个 id；对应 缠论：中枢自同构、走势终完美.md */
export const CHAN_PIVOT_ID = 'chan-fractal-pivot';
const CHAN_PIVOT_CLASS = 'chan-fractal-pivot-node';

/** 离屏缓存基准逻辑半径（CSS px），与 zoom 解耦，保证缩放手势期间零重建。 */
const CACHE_BASE_R = 260;
const CACHE_PAD_RATIO = 1.12;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── 缠论自同构标准几何数据（归一化局部坐标：x, y ∈ [-1, 1]，y 向上为负） ──

export interface PivotVertex {
  readonly x: number;
  readonly y: number;
  /** 顶底分型类别：'top' = 顶分型，'bottom' = 底分型 */
  readonly fractal: 'top' | 'bottom';
  /** 买卖点锚点标记（若该分型对应核心买卖点） */
  readonly signal?: '1B' | '2B' | '3B' | '1S' | '2S';
  readonly signalColor?: string;
}

/**
 * 16 个顶底分型极值点（构成 15 笔完整自同构走势）：
 * 涵盖：1B 底背驰起涨 → 2B 二买确认 → 中枢 A（含内部次级别中枢 A1 与九段扩展大中枢 A）
 * → b 段主升突破 → 3B 三买回抽不破 ZG_A → 中枢 B → c 段背驰冲顶（1S）→ 2S 二卖确认。
 */
export const BI_VERTICES: readonly PivotVertex[] = [
  { x: -0.78, y: 0.25, fractal: 'bottom', signal: '1B', signalColor: '#34d399' }, // 0: 1B 第一类买点（底背驰极值）
  { x: -0.66, y: 0.02, fractal: 'top' }, // 1: 进中枢前高
  { x: -0.57, y: 0.17, fractal: 'bottom', signal: '2B', signalColor: '#38bdf8' }, // 2: 2B 第二类买点（回踩不破 1B）
  { x: -0.47, y: -0.04, fractal: 'top' }, // 3: 中枢 A 第 1 高点 (ZG_A1)
  { x: -0.38, y: 0.11, fractal: 'bottom' }, // 4: 中枢 A 第 1 低点 (ZD_A1)
  { x: -0.29, y: -0.02, fractal: 'top' }, // 5: 中枢 A 第 2 高点（完成次级别三笔重叠中枢 A1）
  { x: -0.2, y: 0.13, fractal: 'bottom' }, // 6: 中枢 A 扩展低点 (DD_A)
  { x: -0.11, y: -0.06, fractal: 'top' }, // 7: 中枢 A 扩展高点 (GG_A)
  { x: -0.02, y: 0.09, fractal: 'bottom' }, // 8: 中枢 A 离开笔起点（完成本级别扩展大中枢 A）
  { x: 0.14, y: -0.34, fractal: 'top' }, // 9: b 段主升浪高点（强动量突破）
  { x: 0.23, y: -0.16, fractal: 'bottom', signal: '3B', signalColor: '#fbbf24' }, // 10: 3B 第三类买点（回抽高于 ZG_A = -0.02）
  { x: 0.33, y: -0.38, fractal: 'top' }, // 11: 中枢 B 高点
  { x: 0.42, y: -0.2, fractal: 'bottom' }, // 12: 中枢 B 低点
  { x: 0.5, y: -0.35, fractal: 'top' }, // 13: 中枢 B 次高
  { x: 0.58, y: -0.22, fractal: 'bottom' }, // 14: c 段背驰段起点
  { x: 0.71, y: -0.54, fractal: 'top', signal: '1S', signalColor: '#fb7185' }, // 15: 1S 第一类卖点（c 段新高但 MACD 面积衰减）
  { x: 0.78, y: -0.36, fractal: 'bottom' }, // 16: 见顶回落笔
  { x: 0.84, y: -0.46, fractal: 'top', signal: '2S', signalColor: '#f97316' }, // 17: 2S 第二类卖点（次高点确认）
];

/** 高一级别【线段】骨干拐点索引（连接各中枢高低极值，体现自同构骨干） */
const SEGMENT_INDICES = [0, 3, 6, 9, 12, 15, 17] as const;

export interface PivotBoxDef {
  readonly label: string;
  readonly level: 'sub' | 'major' | 'upper';
  readonly x1: number;
  readonly x2: number;
  /** 中枢上沿 ZG（高点中的较低者，canvas y 向上为负） */
  readonly zg: number;
  /** 中枢下沿 ZD（低点中的较高者） */
  readonly zd: number;
  /** 波动最高极值 GG */
  readonly gg: number;
  /** 波动最低极值 DD */
  readonly dd: number;
  readonly stroke: string;
  readonly fill: string;
}

/**
 * 三重级别递归中枢框（[ZD, ZG] 重叠晶匣）：
 * 1. A1：内层次级别三笔中枢（冰青色）
 * 2. A ：外层本级别扩展大中枢（流金琥珀色，包裹 A1，直观展现"中枢递归自同构"）
 * 3. B ：上方跃迁后的第二个同级别中枢（星云紫青色）
 */
export const PIVOT_BOXES: readonly PivotBoxDef[] = [
  {
    label: '次级别中枢 A₁',
    level: 'sub',
    x1: -0.57,
    x2: -0.29,
    zg: -0.02,
    zd: 0.11,
    gg: -0.04,
    dd: 0.17,
    stroke: 'rgba(56, 189, 248, 0.75)',
    fill: 'rgba(56, 189, 248, 0.09)',
  },
  {
    label: '本级别中枢 A [ZD, ZG]',
    level: 'major',
    x1: -0.6,
    x2: -0.02,
    zg: -0.02,
    zd: 0.11,
    gg: -0.06,
    dd: 0.17,
    stroke: 'rgba(251, 191, 36, 0.88)',
    fill: 'rgba(251, 191, 36, 0.07)',
  },
  {
    label: '同构跃迁中枢 B',
    level: 'upper',
    x1: 0.23,
    x2: 0.58,
    zg: -0.35,
    zd: -0.2,
    gg: -0.38,
    dd: -0.16,
    stroke: 'rgba(167, 139, 250, 0.85)',
    fill: 'rgba(167, 139, 250, 0.09)',
  },
];

/** 预计算 17 段笔的累计归一化弧长，供逐帧自同构流光波包 O(1) 查表插值 */
const CUMULATIVE_LEN: readonly number[] = (() => {
  const out = [0];
  let total = 0;
  for (let i = 1; i < BI_VERTICES.length; i++) {
    const a = BI_VERTICES[i - 1];
    const b = BI_VERTICES[i];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    out.push(total);
  }
  return out.map((v) => v / Math.max(1e-6, total));
})();

/**
 * 相平面 MACD 动量柱采样序列（x ∈ [-0.76, 0.82]）：
 * 精确刻画：
 *   - 1B 处绿柱底背驰衰竭抽脚；
 *   - 中枢 A 期间动量在零轴附近反复缠绕；
 *   - b 段突破（x ≈ 0.02..0.18）时绽放高耸饱满的红柱面积簇 S₁（峰值 +0.22）；
 *   - 中枢 B 期间黄白线回抽零轴（绿柱浅谷）；
 *   - c 段冲顶（x ≈ 0.58..0.72）时价格创最高（1S），但红柱面积簇 S₂ 显著缩小（峰值仅 +0.10 < S₁），
 *     构成教科书级的"趋势顶背驰（面积与高度双重衰竭）"。
 */
interface MacdBar {
  readonly x: number;
  /** 正值为零轴上方红柱（多头动量），负值为零轴下方青绿柱（空头动量） */
  readonly val: number;
  readonly dif: number;
  readonly dea: number;
}

const MACD_BARS: readonly MacdBar[] = (() => {
  const count = 44;
  const out: MacdBar[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const x = -0.76 + u * 1.58;
    // 用解析高斯包络合成真实的缠论 a + A + b + B + c 动量面积演化曲线
    const g1B = -0.11 * Math.exp(-Math.pow((x + 0.72) / 0.08, 2)); // 1B 绿柱抽脚
    const gEntry = 0.09 * Math.exp(-Math.pow((x + 0.56) / 0.09, 2)); // a 段进中枢
    const gPivotA = -0.05 * Math.sin((x + 0.32) * 14) * Math.exp(-Math.pow((x + 0.3) / 0.22, 2)); // 中枢 A 零轴缠绕
    const gImpulseB = 0.23 * Math.exp(-Math.pow((x - 0.1) / 0.11, 2)); // b 段主升浪高能面积 S1
    const gPivotB = -0.065 * Math.exp(-Math.pow((x - 0.38) / 0.1, 2)); // 中枢 B 回抽零轴
    const gDivergeC = 0.105 * Math.exp(-Math.pow((x - 0.65) / 0.09, 2)); // c 段冲顶衰竭面积 S2 (S2 << S1)
    const gDrop = -0.08 * Math.exp(-Math.pow((x - 0.8) / 0.06, 2)); // 1S 后转折死叉

    const val = g1B + gEntry + gPivotA + gImpulseB + gPivotB + gDivergeC + gDrop;
    // DIF（快线）与 DEA（慢线）随动量积分缓慢抬升并在 c 段产生顶背驰死叉
    const trendLift = 0.12 * Math.exp(-Math.pow((x - 0.22) / 0.42, 2)) - 0.04;
    const dif = trendLift + val * 0.68;
    const dea = trendLift + val * 0.32;
    out.push({ x, val, dif, dea });
  }
  return out;
})();

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

/** 与其余奇观共用统一视觉半径基准（spectacle-size 的 DRAWN_EXTENT 与本奇观外沿一致）。 */
function pickRadius(cy: cytoscape.Core): number {
  const spread = graphSpread(cy).spread;
  try {
    const r = pickSpectacleParam(spread, 'chan-fractal-pivot');
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

export function spawnChanFractalPivotNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(CHAN_PIVOT_ID);
  if (existing.nonempty()) {
    existing.addClass(`layer-parent ${CHAN_PIVOT_CLASS}`);
    stripNodeChrome(existing, size);
    return existing;
  }

  const { x, y } = pickSpawnPoint(cy);
  const node = cy.add({
    group: 'nodes',
    data: {
      id: CHAN_PIVOT_ID,
      label: '缠论多级别自同构中枢',
      rel: '装饰奇观/缠论：中枢自同构、走势终完美.md',
    },
    position: { x, y },
    classes: `layer-parent ${CHAN_PIVOT_CLASS}`,
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

// ── 覆盖层：静态晶体离屏烘焙 + 动态自同构脉冲演绎 ────────────────────────

export interface ChanFractalPivotOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  /** 一轮完整"分型→笔→线段→中枢→背驰买卖点"自同构生长演绎的周期秒数。默认 14 秒。 */
  cycleSeconds?: number;
  fps?: number;
}

export class ChanFractalPivotOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly cycleSeconds: number;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  private pivotNode: cytoscape.NodeSingular | null = null;
  private modelRadius = 210;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  /**
   * 静态基底离屏缓存（筹码引力井 + 博弈 K 线簇 + 三重中枢晶匣 + 笔段底稿 + MACD 相平面）：
   * 仅在首次绘制或 dpr 变化时烘焙一次，保证每帧主渲染仅需 1 次 GPU drawImage。
   */
  private baseCache: HTMLCanvasElement | null = null;
  private baseCacheDpr = -1;

  private rafId: number | null = null;
  private startedAt = 0;
  private lastDrawAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  constructor(options: ChanFractalPivotOverlayOptions) {
    this.cy = options.cy;
    this.cycleSeconds = Math.max(4, options.cycleSeconds ?? 14);
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.pivotNode = spawnChanFractalPivotNode(this.cy);
    this.modelRadius = pickRadius(this.cy);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-chan-fractal-pivot', '');
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
    const node = this.getPivotNode();
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
    const node = this.getPivotNode();
    if (node) this.cy.remove(node);
    this.pivotNode = null;
  }

  private getPivotNode(): cytoscape.NodeSingular | null {
    if (this.pivotNode && this.pivotNode.nonempty() && !this.pivotNode.removed()) {
      return this.pivotNode;
    }
    const found = this.cy.getElementById(CHAN_PIVOT_ID);
    this.pivotNode = found.nonempty() ? found : null;
    return this.pivotNode;
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

  // ── 离屏烘焙：筹码引力井 + 三重递归中枢晶匣 + 笔段骨架 + MACD 相平面 ──

  private ensureBaseCache(dpr: number): HTMLCanvasElement | null {
    if (this.baseCache && this.baseCacheDpr === dpr) return this.baseCache;

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
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // ── 1. 筹码引力井深空度规场底晕 ─────────────────────────────────────
    const bgGrad = c.createRadialGradient(0, -R * 0.05, R * 0.05, 0, 0, R * 1.06);
    bgGrad.addColorStop(0, 'rgba(14, 28, 54, 0.82)');
    bgGrad.addColorStop(0.45, 'rgba(15, 23, 42, 0.64)');
    bgGrad.addColorStop(0.82, 'rgba(30, 27, 75, 0.24)');
    bgGrad.addColorStop(1, 'rgba(9, 10, 20, 0)');
    c.fillStyle = bgGrad;
    c.beginPath();
    c.arc(0, 0, R * 1.06, 0, Math.PI * 2);
    c.fill();

    // 外圈筹码引力井罗盘细环 + 黄金分割等势纬线
    c.beginPath();
    c.arc(0, 0, R * 0.96, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    c.lineWidth = 1.0;
    c.stroke();

    c.beginPath();
    c.arc(0, 0, R * 0.92, 0, Math.PI * 2);
    c.setLineDash([4, 6]);
    c.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    c.lineWidth = 0.8;
    c.stroke();
    c.setLineDash([]);

    // 圆形视界裁剪区：确保内部引力格网与 MACD 相平面严格收纳在球形力场内
    c.save();
    c.beginPath();
    c.arc(0, 0, R * 0.92, 0, Math.PI * 2);
    c.clip();

    // ── 2. 黄金分割相空间引力经纬线 ─────────────────────────────────────
    c.beginPath();
    const gridY = [-0.55, -0.35, -0.15, 0.05, 0.25];
    for (let i = 0; i < gridY.length; i++) {
      const gy = gridY[i] * R;
      c.moveTo(-R * 0.92, gy);
      c.lineTo(R * 0.92, gy);
    }
    const gridX = [-0.6, -0.3, 0, 0.3, 0.6];
    for (let i = 0; i < gridX.length; i++) {
      const gx = gridX[i] * R;
      c.moveTo(gx, -R * 0.92);
      c.lineTo(gx, R * 0.28);
    }
    c.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    c.lineWidth = 0.7;
    c.stroke();

    // ── 3. 底层多主体无序博弈 K 线簇（还原为分形晶体前的原始筹码轨迹）────
    c.beginPath();
    for (let s = 0; s < BI_VERTICES.length - 1; s++) {
      const a = BI_VERTICES[s];
      const b = BI_VERTICES[s + 1];
      const steps = 4;
      for (let k = 1; k < steps; k++) {
        const u = k / steps;
        const kx = (a.x + (b.x - a.x) * u) * R;
        const ky = (a.y + (b.y - a.y) * u) * R;
        const halfH = (0.022 + ((s * 7 + k * 3) % 5) * 0.006) * R;
        c.moveTo(kx, ky - halfH);
        c.lineTo(kx, ky + halfH);
      }
    }
    c.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    c.lineWidth = 1.2;
    c.stroke();

    // ── 4. 三重级别递归中枢（[ZD, ZG] 重叠框 + GG/DD 极值虚线框 + 引力中心轴）──
    for (let i = 0; i < PIVOT_BOXES.length; i++) {
      const box = PIVOT_BOXES[i];
      const x = box.x1 * R;
      const y = box.zg * R;
      const w = (box.x2 - box.x1) * R;
      const h = (box.zd - box.zg) * R;

      // 4.1 GG ~ DD 波动极值虚线外框（仅对主中枢绘制，体现中枢震荡完整振幅）
      if (box.level !== 'sub') {
        const ggY = box.gg * R;
        const ddH = (box.dd - box.gg) * R;
        c.save();
        c.setLineDash([3, 4]);
        c.strokeStyle = box.stroke;
        c.globalAlpha = 0.28;
        c.lineWidth = 0.85;
        c.strokeRect(x, ggY, w, ddH);
        c.restore();
      }

      // 4.2 [ZD, ZG] 核心重叠晶匣填充与描边
      c.fillStyle = box.fill;
      c.fillRect(x, y, w, h);

      c.strokeStyle = box.stroke;
      c.lineWidth = box.level === 'major' ? 1.8 : 1.25;
      c.strokeRect(x, y, w, h);

      // 4.3 中枢引力中心轴（ZC = (ZG + ZD) / 2）
      const zcY = y + h * 0.5;
      c.save();
      c.setLineDash([5, 4]);
      c.beginPath();
      c.moveTo(x + 4, zcY);
      c.lineTo(x + w - 4, zcY);
      c.strokeStyle = box.stroke;
      c.globalAlpha = 0.45;
      c.lineWidth = 0.9;
      c.stroke();
      c.restore();

      // 4.4 四角精密几何直角卡扣（凸显"中枢晶匣"质感）
      const corner = Math.min(8, w * 0.12, h * 0.28);
      c.beginPath();
      // 左上
      c.moveTo(x, y + corner);
      c.lineTo(x, y);
      c.lineTo(x + corner, y);
      // 右上
      c.moveTo(x + w - corner, y);
      c.lineTo(x + w, y);
      c.lineTo(x + w, y + corner);
      // 左下
      c.moveTo(x, y + h - corner);
      c.lineTo(x, y + h);
      c.lineTo(x + corner, y + h);
      // 右下
      c.moveTo(x + w - corner, y + h);
      c.lineTo(x + w, y + h);
      c.lineTo(x + w, y + h - corner);
      c.strokeStyle = '#fef3c7';
      c.globalAlpha = 0.75;
      c.lineWidth = 1.6;
      c.stroke();
      c.globalAlpha = 1;
    }

    // ── 5. 3B（第三类买点）不触及 ZG_A 的几何验证垂线 ─────────────────────
    const p3B = BI_VERTICES[10];
    const zgA = PIVOT_BOXES[1].zg;
    c.save();
    c.setLineDash([3, 3]);
    c.beginPath();
    // 从中枢 A 的上沿 ZG_A 向右延伸一条水平基准线至 3B 下方
    c.moveTo(PIVOT_BOXES[1].x2 * R, zgA * R);
    c.lineTo(p3B.x * R + 12, zgA * R);
    // 从 3B 低点向下连接到 ZG_A 水平线，直观证明"回抽不进中枢（3B > ZG_A）"
    c.moveTo(p3B.x * R, p3B.y * R);
    c.lineTo(p3B.x * R, zgA * R);
    c.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    c.lineWidth = 1.1;
    c.stroke();
    c.restore();

    // ── 6. 高一级别【线段】骨干（暖金宽光晕底衬 + 金白实线，体现跨级别自同构）──
    c.beginPath();
    for (let i = 0; i < SEGMENT_INDICES.length; i++) {
      const v = BI_VERTICES[SEGMENT_INDICES[i]];
      if (i === 0) c.moveTo(v.x * R, v.y * R);
      else c.lineTo(v.x * R, v.y * R);
    }
    c.strokeStyle = 'rgba(251, 191, 36, 0.20)';
    c.lineWidth = 5.5;
    c.stroke();

    c.strokeStyle = 'rgba(253, 230, 138, 0.52)';
    c.lineWidth = 1.8;
    c.stroke();

    // ── 7. 次级别【笔】序列（冰青亮线连接全部 18 个顶底分型）─────────────
    c.beginPath();
    for (let i = 0; i < BI_VERTICES.length; i++) {
      const v = BI_VERTICES[i];
      if (i === 0) c.moveTo(v.x * R, v.y * R);
      else c.lineTo(v.x * R, v.y * R);
    }
    c.strokeStyle = 'rgba(56, 189, 248, 0.30)';
    c.lineWidth = 3.8;
    c.stroke();

    c.strokeStyle = '#bae6fd';
    c.lineWidth = 1.45;
    c.stroke();

    // ── 8. 顶分型 / 底分型三 K 线几何晶簇（在每个分型拐点画微缩三柱分型符）──
    c.beginPath();
    for (let i = 0; i < BI_VERTICES.length; i++) {
      const v = BI_VERTICES[i];
      const vx = v.x * R;
      const vy = v.y * R;
      const dir = v.fractal === 'top' ? -1 : 1;
      // 中间极值柱 + 左右两根伴随分型柱
      c.moveTo(vx, vy + dir * 6);
      c.lineTo(vx, vy - dir * 2);
      c.moveTo(vx - 3.5, vy + dir * 2);
      c.lineTo(vx - 3.5, vy - dir * 4);
      c.moveTo(vx + 3.5, vy + dir * 2);
      c.lineTo(vx + 3.5, vy - dir * 4);
    }
    c.strokeStyle = 'rgba(224, 242, 254, 0.72)';
    c.lineWidth = 1.1;
    c.stroke();

    // ── 9. 下方相平面动量观测区（MACD 能量柱衰减对比 & DIF/DEA 黄白双线）──
    const macdZeroY = R * 0.54;
    const macdScaleY = R * 0.95;

    // 9.1 相平面分隔视界线与零轴
    c.beginPath();
    c.moveTo(-R * 0.88, R * 0.31);
    c.lineTo(R * 0.88, R * 0.31);
    c.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    c.lineWidth = 0.9;
    c.stroke();

    c.beginPath();
    c.moveTo(-R * 0.85, macdZeroY);
    c.lineTo(R * 0.85, macdZeroY);
    c.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    c.lineWidth = 1.0;
    c.stroke();

    // 9.2 多头红柱（val >= 0，暖赤金）与空头绿柱（val < 0，翡翠青）合批绘制
    const barW = Math.max(2.2, ((R * 1.52) / MACD_BARS.length) * 0.66);

    // 红柱批次（比较 b 段饱满面积 S1 与 c 段衰竭面积 S2）
    c.beginPath();
    for (let i = 0; i < MACD_BARS.length; i++) {
      const m = MACD_BARS[i];
      if (m.val < 0) continue;
      const bx = m.x * R;
      const bh = m.val * macdScaleY;
      c.rect(bx - barW * 0.5, macdZeroY - bh, barW, bh);
    }
    c.fillStyle = 'rgba(244, 63, 94, 0.68)';
    c.fill();

    // 青绿柱批次（1B 抽脚与中枢零轴回抽）
    c.beginPath();
    for (let i = 0; i < MACD_BARS.length; i++) {
      const m = MACD_BARS[i];
      if (m.val >= 0) continue;
      const bx = m.x * R;
      const bh = -m.val * macdScaleY;
      c.rect(bx - barW * 0.5, macdZeroY, barW, bh);
    }
    c.fillStyle = 'rgba(16, 185, 129, 0.62)';
    c.fill();

    // 9.3 DIF（快线，亮白）与 DEA（慢线，暖黄）相平面轨迹
    c.beginPath();
    for (let i = 0; i < MACD_BARS.length; i++) {
      const m = MACD_BARS[i];
      const bx = m.x * R;
      const by = macdZeroY - m.dif * macdScaleY;
      if (i === 0) c.moveTo(bx, by);
      else c.lineTo(bx, by);
    }
    c.strokeStyle = 'rgba(248, 250, 252, 0.86)';
    c.lineWidth = 1.3;
    c.stroke();

    c.beginPath();
    for (let i = 0; i < MACD_BARS.length; i++) {
      const m = MACD_BARS[i];
      const bx = m.x * R;
      const by = macdZeroY - m.dea * macdScaleY;
      if (i === 0) c.moveTo(bx, by);
      else c.lineTo(bx, by);
    }
    c.strokeStyle = 'rgba(250, 204, 21, 0.82)';
    c.lineWidth = 1.2;
    c.stroke();

    // ── 10. 趋势顶背驰（b 段 vs c 段）几何对照斜线与垂直锁相虚线 ───────────
    const pPeakB = BI_VERTICES[9]; // b 段高点
    const pPeakC = BI_VERTICES[15]; // c 段 1S 最高点
    c.save();
    c.setLineDash([4, 4]);
    c.beginPath();
    // 上方价格高点连线（向上倾斜：价格创新高）
    c.moveTo(pPeakB.x * R, pPeakB.y * R - 6);
    c.lineTo(pPeakC.x * R, pPeakC.y * R - 6);
    // 下方 MACD 红柱峰值连线（向下倾斜：动量面积 S2 < S1 显著背驰！）
    c.moveTo(0.1 * R, macdZeroY - 0.23 * macdScaleY - 5);
    c.lineTo(0.65 * R, macdZeroY - 0.105 * macdScaleY - 5);
    // 1S 顶点向下贯穿至 MACD c 段衰竭峰的垂直锁相虚线
    c.moveTo(pPeakC.x * R, pPeakC.y * R);
    c.lineTo(pPeakC.x * R, macdZeroY);
    c.strokeStyle = 'rgba(251, 113, 133, 0.62)';
    c.lineWidth = 1.15;
    c.stroke();
    c.restore();

    c.restore(); // 退出圆形裁剪区

    this.baseCache = cv;
    this.baseCacheDpr = dpr;
    return cv;
  }

  /**
   * 根据归一化进度 u ∈ [0, 1] 在 17 段笔折线上插值求实时坐标。
   */
  private sampleTrajectory(u: number): { x: number; y: number; segIdx: number } {
    const clamped = clamp(u, 0, 1);
    for (let i = 1; i < CUMULATIVE_LEN.length; i++) {
      const u0 = CUMULATIVE_LEN[i - 1];
      const u1 = CUMULATIVE_LEN[i];
      if (clamped <= u1 || i === CUMULATIVE_LEN.length - 1) {
        const local = (clamped - u0) / Math.max(1e-6, u1 - u0);
        const a = BI_VERTICES[i - 1];
        const b = BI_VERTICES[i];
        return {
          x: a.x + (b.x - a.x) * local,
          y: a.y + (b.y - a.y) * local,
          segIdx: i - 1,
        };
      }
    }
    const last = BI_VERTICES[BI_VERTICES.length - 1];
    return { x: last.x, y: last.y, segIdx: BI_VERTICES.length - 2 };
  }

  /**
   * 绘制八角菱形买卖点星芒锚点。
   */
  private drawSignalAnchor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
    pulseBoost: number,
  ): void {
    const outer = r * (1 + 0.35 * pulseBoost);
    const inner = outer * 0.36;

    // 外围柔和光晕圆
    ctx.beginPath();
    ctx.arc(x, y, outer * 1.45, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.22 + 0.25 * pulseBoost;
    ctx.fill();

    // 四芒几何星锚
    ctx.beginPath();
    ctx.moveTo(x, y - outer);
    ctx.lineTo(x + inner, y - inner);
    ctx.lineTo(x + outer, y);
    ctx.lineTo(x + inner, y + inner);
    ctx.lineTo(x, y + outer);
    ctx.lineTo(x - inner, y + inner);
    ctx.lineTo(x - outer, y);
    ctx.lineTo(x - inner, y - inner);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.1, r * 0.22);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── 逐帧绘制 ──────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const node = this.getPivotNode();
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

    const breathe = this.reducedMotion ? 1 : 1 + 0.015 * Math.sin(t * 0.5);

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(breathe, breathe);

    // 1. 单次 GPU drawImage 铺设整张烘焙好的筹码引力井、三重中枢、笔段与 MACD 相平面
    const cache = this.ensureBaseCache(this.dpr);
    if (cache) {
      const span = R * CACHE_PAD_RATIO;
      ctx.drawImage(cache, -span, -span, span * 2, span * 2);
    }

    // 2. 动态演绎层：自同构生长波包（phase ∈ [0, 1] 循环推进）
    const phase = this.reducedMotion ? 0.88 : (t / this.cycleSeconds) % 1;
    const head = this.sampleTrajectory(phase);

    // 2.1 当波包穿过某个中枢区间时，点亮该中枢晶匣的呼吸高光边框
    for (let i = 0; i < PIVOT_BOXES.length; i++) {
      const box = PIVOT_BOXES[i];
      const inBox = head.x >= box.x1 - 0.05 && head.x <= box.x2 + 0.05;
      const boxPulse = inBox ? 0.55 + 0.35 * Math.sin(t * 4.5) : 0.15 + 0.1 * Math.sin(t * 1.6 + i);
      ctx.strokeStyle = box.stroke;
      ctx.globalAlpha = boxPulse;
      ctx.lineWidth = Math.max(1.2, R * (box.level === 'major' ? 0.012 : 0.008));
      ctx.strokeRect(box.x1 * R, box.zg * R, (box.x2 - box.x1) * R, (box.zd - box.zg) * R);
    }
    ctx.globalAlpha = 1;

    // 2.2 沿笔序列游走的高亮自同构生长流光尾迹（截取 [phase - 0.16, phase] 区段）
    if (!this.reducedMotion) {
      const tailStart = Math.max(0, phase - 0.16);
      const samples = 14;
      ctx.beginPath();
      for (let s = 0; s <= samples; s++) {
        const u = tailStart + ((phase - tailStart) * s) / samples;
        const pt = this.sampleTrajectory(u);
        if (s === 0) ctx.moveTo(pt.x * R, pt.y * R);
        else ctx.lineTo(pt.x * R, pt.y * R);
      }
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = Math.max(1.6, R * 0.013);
      ctx.stroke();

      // 游走波包前端的相平面垂直扫描束（同步连接上方分型笔与下方 MACD 动量柱）
      const macdZeroY = R * 0.54;
      ctx.save();
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(head.x * R, head.y * R);
      ctx.lineTo(head.x * R, macdZeroY);
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.42)';
      ctx.lineWidth = 1.0;
      ctx.stroke();
      ctx.restore();
    }

    // 3. 绽放第一、二、三类买卖点（1B / 2B / 3B / 1S / 2S）几何星芒锚点
    const anchorR = Math.max(2.6, R * 0.032);
    // LOD 文字可读性权重：当 R < 75px 时平滑隐藏文字标签，彻底杜绝缩小时文字挤成模糊云团
    const labelAlpha = clamp((R - 75) / 45, 0, 1);

    if (labelAlpha > 0.02) {
      const fontPx = Math.max(9, Math.round(R * 0.052));
      ctx.font = `600 ${fontPx}px "SF Pro Display","PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    for (let i = 0; i < BI_VERTICES.length; i++) {
      const v = BI_VERTICES[i];
      if (!v.signal || !v.signalColor) continue;

      const vx = v.x * R;
      const vy = v.y * R;
      const distToHead = Math.abs(head.x - v.x);
      const boost = this.reducedMotion ? 0.4 : clamp(1 - distToHead / 0.14, 0, 1);

      this.drawSignalAnchor(ctx, vx, vy, anchorR, v.signalColor, boost);

      if (labelAlpha > 0.02) {
        const offsetY = v.fractal === 'top' ? -anchorR * 2.2 : anchorR * 2.3;
        ctx.globalAlpha = labelAlpha * (0.78 + 0.22 * boost);
        ctx.fillStyle = v.signalColor;
        ctx.fillText(v.signal, vx, vy + offsetY);
      }
    }

    // 4. 在大中景下（R >= 95px）标注中枢 ZG/ZD 与 MACD 面积 S₁ vs S₂ 背驰印记
    const detailAlpha = clamp((R - 95) / 50, 0, 1);
    if (detailAlpha > 0.02) {
      const subFontPx = Math.max(8, Math.round(R * 0.042));
      ctx.font = `500 ${subFontPx}px "SF Pro Display","PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.globalAlpha = detailAlpha * 0.78;

      // 中枢 A 与 中枢 B 标签
      const boxA = PIVOT_BOXES[1];
      ctx.fillStyle = '#fde68a';
      ctx.fillText('中枢 A', (boxA.x1 + boxA.x2) * 0.5 * R, (boxA.zd + 0.055) * R);

      const boxB = PIVOT_BOXES[2];
      ctx.fillStyle = '#ddd6fe';
      ctx.fillText('中枢 B', (boxB.x1 + boxB.x2) * 0.5 * R, (boxB.gg - 0.045) * R);

      // 下方相平面动量面积标签：S₁（饱满） vs S₂（背驰衰减）
      const macdZeroY = R * 0.54;
      ctx.fillStyle = '#fda4af';
      ctx.fillText('S₁ 动量饱满', 0.1 * R, macdZeroY - R * 0.25);
      ctx.fillText('S₂ 面积背驰↓', 0.62 * R, macdZeroY - R * 0.14);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

export function createChanFractalPivotOverlay(
  options: ChanFractalPivotOverlayOptions,
): ChanFractalPivotOverlay {
  return new ChanFractalPivotOverlay(options);
}
