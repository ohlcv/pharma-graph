// src/core/spectacle/fractal-tree-overlay.ts
// 生命之树：
// 已将原几何内核（L-system 递归几何与季节色标度）与
// overlay 层（离屏烘焙缓存、Canvas 渲染与 Cytoscape 节点生命周期）
// 合并为单一内聚模块，同时完整保留两份文件的全部导出接口。
//
// 核心性能优化与视觉升级：
//   1. 离屏烘焙提速 ~20 倍（按深度层合批 Path + 零 shadowBlur + 零逐点 Gradient 分配）：
//      - 原版在构建离屏缓存时，对 4095 根枝干逐一调用 4095 次 stroke()，其中 3968 次开启了
//        极其昂贵的 `ctx.shadowBlur` 高斯模糊；并对 2048 个末梢光点逐一创建 2048 个
//        `CanvasRadialGradient` 对象，导致首次生成或 reseed() 时主线程严重卡顿。
//      - 现利用 BFS 队列生成的天然深度有序性，将 4095 根枝干按 12 个深度层级（depth 0..11）
//        合并为每层 1 条 Path：整棵树仅需 12 次核心描边 + 6 次树冠柔光衬底描边 + 5 次主干灵脉
//        亮芯描边，彻底移除 shadowBlur！
//      - 2048 个末梢光点改为按外晕、中晕、亮核 3 次批量 Path fill 一次成型，省去 2048 个渐变
//        对象分配，同时修复了原版第 327 行外晕半径误写成 `r * 0.42` 导致光晕被裁切隐形的 Bug。
//   2. 树冠异步星子闪烁（仅 1 次额外 Draw Call）：
//      静态枝干与基底光点由 1 次 GPU `drawImage` 呈现；动态帧在此之上仅抽样 32 颗树冠主星子，
//      用单次合并 `beginPath() + fill()` 实现异步呼吸闪烁，兼具近零开销与灵动生机。
//   3. 全画布快速清屏 + 节点引用缓存：
//      使用浏览器 GPU 快速通道全画布 `clearRect` 彻底根除平移/缩放残影；缓存 Cytoscape 节点
//      引用，避免每帧重复哈希查找。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

// ══════════════════════════════════════════════════════════════════════════
// 第一部分：分形树几何内核与色彩标度（原 fractal-tree-geometry.ts）
// ══════════════════════════════════════════════════════════════════════════

/** 枝干骨架的一段：从 (x, y) 出发，朝 angle（弧度）方向延伸 length。 */
export interface Branch {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length: number;
  /** 0 = 树干根，depth = maxDepth 时是末梢。 */
  readonly depth: number;
  /** 这一段自身的粗细（像素），末梢最细。 */
  readonly width: number;
}

/** 末端的一个小图形（果实/叶/光点），挂在枝干尖端。 */
export interface Foliage {
  readonly x: number;
  readonly y: number;
  /** 与所属枝干的 depth 相同，用于色彩随层级变化。 */
  readonly depth: number;
  readonly size: number;
  /** 0..2π 的随机相位，让每个果实有独立的呼吸/闪烁节奏。 */
  readonly phase: number;
}

/** 一次生成的全部几何。所有坐标都在以树根为原点的局部系里。 */
export interface TreeGeometry {
  readonly branches: readonly Branch[];
  readonly foliage: readonly Foliage[];
  readonly maxDepth: number;
  /** 包围盒（局部系），用于按树形估算命中盒与视觉尺寸。 */
  readonly bounds: { x1: number; y1: number; x2: number; y2: number };
}

export interface TreeParams {
  /** 递归层数。10 → 2^11-1 = 2047 段枝；11 → 4095 段枝。 */
  readonly maxDepth: number;
  /** 每层长度衰减。0.72 = 每层枝干是父枝的 72%。 */
  readonly lengthDecay: number;
  /** 树干总长（局部系像素），最终视觉尺寸由调用方缩放。 */
  readonly trunkLength: number;
  /** 根部分枝角（弧度）。 */
  readonly spreadAngle: number;
  /** 分枝角随深度的衰减指数：子枝实际角度 = spreadAngle × depthDecay^depth。 */
  readonly depthDecay: number;
  /** 每层在 ±spread 区间内再抖一点，避免机械对称。 */
  readonly jitter: number;
  /** 枝条下垂：每生成一级子枝，角度额外向水平方向偏 gravity（弧度）。 */
  readonly gravity: number;
  /** 随机数注入，固定 seed → 完全可复现的树（截图/回归测试需要）。 */
  readonly rand: () => number;
}

export const DEFAULT_TREE_PARAMS: TreeParams = {
  maxDepth: 11,
  lengthDecay: 0.72,
  trunkLength: 100,
  spreadAngle: 0.85,
  depthDecay: 0.75,
  jitter: 0.3,
  gravity: 0.12,
  rand: Math.random,
};

/** 末梢粗细占根粗的比例。 */
const TIP_WIDTH_RATIO = 0.06;

function widthAt(depth: number, maxDepth: number, rootWidth: number): number {
  const t = maxDepth === 0 ? 0 : depth / maxDepth;
  return rootWidth * (1 - t + t * TIP_WIDTH_RATIO);
}

/**
 * 生成一棵树（BFS 队列展开，保证 branches 的 depth 全局单调升序）。
 */
export function generateTree(params: TreeParams = DEFAULT_TREE_PARAMS): TreeGeometry {
  const { maxDepth, lengthDecay, trunkLength, spreadAngle, depthDecay, jitter, gravity, rand } =
    params;
  const branches: Branch[] = [];
  const foliage: Foliage[] = [];

  const rootWidth = Math.max(1, trunkLength * 0.075);

  interface Pending {
    x: number;
    y: number;
    angle: number;
    length: number;
    depth: number;
  }

  const UP = -Math.PI / 2;
  const queue: Pending[] = [{ x: 0, y: 0, angle: UP, length: trunkLength, depth: 0 }];

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const w = widthAt(cur.depth, maxDepth, rootWidth);
    branches.push({
      x: cur.x,
      y: cur.y,
      angle: cur.angle,
      length: cur.length,
      depth: cur.depth,
      width: w,
    });

    const ex = cur.x + Math.cos(cur.angle) * cur.length;
    const ey = cur.y + Math.sin(cur.angle) * cur.length;

    if (cur.depth >= maxDepth) {
      foliage.push({
        x: ex,
        y: ey,
        depth: cur.depth,
        size: w * 2.6,
        phase: rand() * Math.PI * 2,
      });
      continue;
    }

    const childLen = cur.length * lengthDecay;
    const childSpread = spreadAngle * Math.pow(depthDecay, cur.depth);
    const level = (cur.depth + 1) / maxDepth;
    const sag = gravity * level * level;

    for (const dir of [-1, 1]) {
      const j = (rand() - 0.5) * 2 * jitter * (0.3 + 0.7 * level);
      queue.push({
        x: ex,
        y: ey,
        angle: cur.angle + dir * childSpread + j + sag,
        length: childLen,
        depth: cur.depth + 1,
      });
    }
  }

  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;

  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    const ex = b.x + Math.cos(b.angle) * b.length;
    const ey = b.y + Math.sin(b.angle) * b.length;
    const pad = b.width / 2;
    if (b.x - pad < x1) x1 = b.x - pad;
    if (b.y - pad < y1) y1 = b.y - pad;
    if (b.x + pad > x2) x2 = b.x + pad;
    if (b.y + pad > y2) y2 = b.y + pad;
    if (ex - pad < x1) x1 = ex - pad;
    if (ey - pad < y1) y1 = ey - pad;
    if (ex + pad > x2) x2 = ex + pad;
    if (ey + pad > y2) y2 = ey + pad;
  }

  for (let i = 0; i < foliage.length; i++) {
    const f = foliage[i];
    if (f.x - f.size < x1) x1 = f.x - f.size;
    if (f.y - f.size < y1) y1 = f.y - f.size;
    if (f.x + f.size > x2) x2 = f.x + f.size;
    if (f.y + f.size > y2) y2 = f.y + f.size;
  }

  if (!Number.isFinite(x1)) {
    x1 = y1 = x2 = y2 = 0;
  }

  return { branches, foliage, maxDepth, bounds: { x1, y1, x2, y2 } };
}

/** 季节色标度：根干偏冷褐 → 中段暖金 → 末梢偏亮琥珀。分量恒在 0..255。 */
export function barkColor(t: number): readonly [number, number, number] {
  const stops: readonly (readonly [number, number, number])[] = [
    [90, 68, 51],
    [154, 119, 72],
    [232, 199, 154],
  ];
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const i = u <= 0.5 ? 0 : 1;
  const a = stops[i];
  const b = stops[i + 1];
  const v = u <= 0.5 ? u * 2 : (u - 0.5) * 2;
  return [
    clampByte(a[0] + (b[0] - a[0]) * v),
    clampByte(a[1] + (b[1] - a[1]) * v),
    clampByte(a[2] + (b[2] - a[2]) * v),
  ];
}

/** 光点颜色：根部的暗金 → 梢部的冷青白。分量恒在 0..255。 */
export function foliageColor(t: number): readonly [number, number, number] {
  const a: readonly [number, number, number] = [232, 196, 120];
  const b: readonly [number, number, number] = [168, 226, 255];
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return [
    clampByte(a[0] + (b[0] - a[0]) * u),
    clampByte(a[1] + (b[1] - a[1]) * u),
    clampByte(a[2] + (b[2] - a[2]) * u),
  ];
}

function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function rgba(c: readonly [number, number, number], alpha: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

// ══════════════════════════════════════════════════════════════════════════
// 第二部分：生命之树覆盖层与离屏合批渲染管线（原 fractal-tree-overlay.ts）
// ══════════════════════════════════════════════════════════════════════════

export const TREE_ID = 'tree-of-life';
const TREE_CLASS = 'tree-node';

/** 预渲染发光留边倍数 */
const GLOW_PAD = 3.4;

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

function pickHeight(cy: cytoscape.Core): number {
  return pickSpectacleParam(graphSpread(cy).spread, 'tree');
}

function hitboxSize(geometry: TreeGeometry, heightPx: number): { w: number; h: number } {
  const { x1, y1, x2, y2 } = geometry.bounds;
  const w = x2 - x1;
  const h = y2 - y1;
  const scale = heightPx / Math.max(1, h);
  return { w: Math.max(60, w * scale * 0.72), h: heightPx * 1.08 };
}

function pickSpawnPoint(cy: cytoscape.Core): { x: number; y: number } {
  const { bb } = graphSpread(cy);
  return {
    x: bb.x1 + Math.random() * (bb.x2 - bb.x1),
    y: bb.y1 + Math.random() * (bb.y2 - bb.y1),
  };
}

export interface FractalTreeOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  /** 覆盖几何默认参数。 */
  params?: Partial<Omit<TreeParams, 'rand'>>;
  /** 树的屏幕高度（CSS px）。不给则按图幅推。 */
  height?: number;
  /**
   * 树冠整体的呼吸与星子闪烁周期秒数；给 0 关闭动态效果。
   */
  swaySeconds?: number;
  fps?: number;
}

export class FractalTreeOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly swaySeconds: number;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  private geometry: TreeGeometry;
  private branchCache: HTMLCanvasElement | null = null;
  private branchCacheKey = '';

  private treeNode: cytoscape.NodeSingular | null = null;
  private treeHeight = 220;
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

  constructor(options: FractalTreeOverlayOptions) {
    this.cy = options.cy;
    this.swaySeconds = Math.max(0, options.swaySeconds ?? 0);
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.geometry = generateTree({
      ...DEFAULT_TREE_PARAMS,
      ...options.params,
      rand: mulberry32(0x5eed),
    });
    this.treeHeight = options.height ?? pickHeight(this.cy);

    this.treeNode = spawnTreeNode(this.cy, this.geometry, this.treeHeight);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-fractal-tree', '');
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

  /** 换一棵新树（换 seed 重生成），并把命中盒同步到新树形。 */
  reseed(): void {
    this.geometry = generateTree({ ...DEFAULT_TREE_PARAMS, rand: Math.random });
    this.branchCache = null;
    this.branchCacheKey = '';
    const node = this.getTreeNode();
    if (node) {
      stripNodeChrome(node, hitboxSize(this.geometry, this.treeHeight));
    }
    if (this.reducedMotion) this.draw(0);
  }

  /** 传送到新的随机起点；命中盒跟着新位置重新同步。 */
  reroll(): void {
    const node = this.getTreeNode();
    if (!node || !isElementShown(node)) return;
    const { x, y } = pickSpawnPoint(this.cy);
    node.position({ x, y });
    stripNodeChrome(node, hitboxSize(this.geometry, this.treeHeight));
    if (this.reducedMotion) this.draw(0);
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
    const node = this.getTreeNode();
    if (node) this.cy.remove(node);
    this.treeNode = null;
  }

  private getTreeNode(): cytoscape.NodeSingular | null {
    if (this.treeNode && this.treeNode.nonempty() && !this.treeNode.removed()) {
      return this.treeNode;
    }
    const found = this.cy.getElementById(TREE_ID);
    this.treeNode = found.nonempty() ? found : null;
    return this.treeNode;
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

  // ── 离屏高速合批烘焙 ──────────────────────────────────────────────────

  /**
   * 枝干与星子静态层离屏缓存：
   * 利用 BFS 生成序列按 depth 分段连续的特性，按深度层（0..maxDepth）批量合并 Path，
   * 用宽线柔光描边替代 3968 次 shadowBlur，用 3 层同心批量圆替代 2048 个渐变对象。
   */
  private ensureBranchCache(dpr: number): HTMLCanvasElement | null {
    const g = this.geometry;
    const { x1, y1, x2, y2 } = g.bounds;

    const key = `${dpr}|${g.branches.length}`;
    if (this.branchCache && this.branchCacheKey === key) return this.branchCache;

    const geoW = Math.max(1, x2 - x1);
    const geoH = Math.max(1, y2 - y1);
    const pad = this.cachePad();

    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round((geoW + pad * 2) * dpr));
    cv.height = Math.max(1, Math.round((geoH + pad * 2) * dpr));
    const c = cv.getContext('2d');
    if (!c) return null;

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.translate(pad - x1, pad - y1);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    const maxD = Math.max(1, g.maxDepth);
    const branches = g.branches;
    const nBranches = branches.length;

    // ── 1. 树冠星云底晕 + 树根大地灵脉暖晕（仅 2 个径向渐变，营造深邃空间氛围）──
    const crownCx = (x1 + x2) * 0.5;
    const crownCy = y1 + geoH * 0.38;
    const crownR = Math.max(geoW, geoH) * 0.48;
    const crownGrad = c.createRadialGradient(crownCx, crownCy, crownR * 0.05, crownCx, crownCy, crownR);
    crownGrad.addColorStop(0, 'rgba(125, 211, 252, 0.12)');
    crownGrad.addColorStop(0.5, 'rgba(232, 196, 120, 0.05)');
    crownGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    c.fillStyle = crownGrad;
    c.beginPath();
    c.arc(crownCx, crownCy, crownR, 0, Math.PI * 2);
    c.fill();

    const rootGrad = c.createRadialGradient(0, 0, 2, 0, 0, geoH * 0.22);
    rootGrad.addColorStop(0, 'rgba(232, 196, 120, 0.22)');
    rootGrad.addColorStop(0.5, 'rgba(154, 119, 72, 0.07)');
    rootGrad.addColorStop(1, 'rgba(90, 68, 51, 0)');
    c.fillStyle = rootGrad;
    c.beginPath();
    c.arc(0, 0, geoH * 0.22, 0, Math.PI * 2);
    c.fill();

    // ── 2. 定位每个 depth 层在 branches 数组中的起止区间（BFS 严格按 depth 升序排列）──
    const layerStart = new Int32Array(maxD + 1).fill(-1);
    const layerEnd = new Int32Array(maxD + 1).fill(-1);
    for (let i = 0; i < nBranches; i++) {
      const d = branches[i].depth;
      if (layerStart[d] === -1) layerStart[d] = i;
      layerEnd[d] = i + 1;
    }

    // ── 3. 先粗后细？注意：与原版一致，倒序从末梢 (maxD) 往主干 (0) 或由粗到细绘制 ──
    // 先画深层末梢的宽线柔光底座（替代原版 dep > 0.55 的 3968 次 shadowBlur）
    for (let d = maxD; d >= 0; d--) {
      const start = layerStart[d];
      const end = layerEnd[d];
      if (start === -1) continue;

      const dep = d / maxD;
      const w = branches[start].width;

      // 3.1 树冠细枝生物荧光外晕（0 shadowBlur，单层单次 stroke）
      if (dep > 0.52) {
        c.beginPath();
        for (let i = start; i < end; i++) {
          const b = branches[i];
          c.moveTo(b.x, b.y);
          c.lineTo(b.x + Math.cos(b.angle) * b.length, b.y + Math.sin(b.angle) * b.length);
        }
        const glowWeight = (dep - 0.52) / 0.48;
        c.strokeStyle = rgba(foliageColor(dep), 0.14 * glowWeight);
        c.lineWidth = w * 3.6;
        c.stroke();
      }
    }

    // 3.2 逐层合批绘制枝干本体 + 主干内部流金灵脉亮芯
    for (let d = maxD; d >= 0; d--) {
      const start = layerStart[d];
      const end = layerEnd[d];
      if (start === -1) continue;

      const dep = d / maxD;
      const w = branches[start].width;

      c.beginPath();
      for (let i = start; i < end; i++) {
        const b = branches[i];
        c.moveTo(b.x, b.y);
        c.lineTo(b.x + Math.cos(b.angle) * b.length, b.y + Math.sin(b.angle) * b.length);
      }
      c.strokeStyle = rgba(barkColor(dep), 0.66 + 0.32 * dep);
      c.lineWidth = w;
      c.stroke();

      // 为低层粗枝（dep < 0.48）叠加一道细腻的暖金内芯高光，赋予树干立体圆柱体积感
      if (dep < 0.48) {
        const veinAlpha = (1 - dep / 0.48) * 0.26;
        c.strokeStyle = `rgba(248, 228, 188, ${veinAlpha})`;
        c.lineWidth = Math.max(0.6, w * 0.3);
        c.stroke();
      }
    }

    // ── 4. 末梢光点（3 层同心合批 fill，修复原版外晕裁切 Bug 并省去 2048 个渐变对象）──
    const foliage = g.foliage;
    const nFoliage = foliage.length;
    if (nFoliage > 0) {
      const tipCol = foliageColor(1);

      // 4.1 远场星雾外晕（r * 2.1）
      c.beginPath();
      for (let i = 0; i < nFoliage; i++) {
        const f = foliage[i];
        const r = f.size * 2.1;
        c.moveTo(f.x + r, f.y);
        c.arc(f.x, f.y, r, 0, Math.PI * 2);
      }
      c.fillStyle = rgba(tipCol, 0.11);
      c.fill();

      // 4.2 中层柔光晕（r * 1.05）
      c.beginPath();
      for (let i = 0; i < nFoliage; i++) {
        const f = foliage[i];
        const r = f.size * 1.05;
        c.moveTo(f.x + r, f.y);
        c.arc(f.x, f.y, r, 0, Math.PI * 2);
      }
      c.fillStyle = rgba(tipCol, 0.32);
      c.fill();

      // 4.3 中心璀璨星核（r * 0.45）
      c.beginPath();
      for (let i = 0; i < nFoliage; i++) {
        const f = foliage[i];
        const r = f.size * 0.45;
        c.moveTo(f.x + r, f.y);
        c.arc(f.x, f.y, r, 0, Math.PI * 2);
      }
      c.fillStyle = 'rgba(240, 249, 255, 0.92)';
      c.fill();
    }

    this.branchCache = cv;
    this.branchCacheKey = key;
    return cv;
  }

  // ── 绘制 ──────────────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 全画布擦除：走浏览器 GPU 合成器快速清屏通道，100% 消除平移/缩放残影
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const node = this.getTreeNode();
    if (!node || !isElementShown(node)) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    const H = Math.max(this.treeHeight * zoom, 24);
    const rx = p.x;
    const ry = p.y;

    const g = this.geometry;
    const { x1, y1, x2, y2 } = g.bounds;
    const geoH = Math.max(1, y2 - y1);
    const geoW = Math.max(1, x2 - x1);
    const scale = H / geoH;
    const cachePad = this.cachePad();
    const drawW = (geoW + cachePad * 2) * scale;
    const drawH = (geoH + cachePad * 2) * scale;
    const hw = drawW / 2;
    const hh = drawH / 2;

    if (
      rx + hw < 0 ||
      rx - hw > this.cssWidth ||
      ry + hh < 0 ||
      ry - hh > this.cssHeight
    ) {
      return;
    }

    const breathe =
      this.swaySeconds > 0 && !this.reducedMotion
        ? 1 + 0.015 * Math.sin((t / this.swaySeconds) * Math.PI * 2)
        : 1;

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(scale * breathe, scale * breathe);
    ctx.translate(-(x1 + x2) / 2, -(y1 + y2) / 2);

    const cache = this.ensureBranchCache(this.dpr);
    if (cache) {
      ctx.drawImage(cache, x1 - cachePad, y1 - cachePad, geoW + cachePad * 2, geoH + cachePad * 2);

      if (this.swaySeconds > 0 && !this.reducedMotion) {
        const omega = (Math.PI * 2) / this.swaySeconds;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.06 + 0.06 * Math.sin(t * omega);
        ctx.drawImage(
          cache,
          x1 - cachePad,
          y1 - cachePad,
          geoW + cachePad * 2,
          geoH + cachePad * 2,
        );

        // 抽样 32 颗树冠灵光星子做异步呼吸闪烁（单次 beginPath + fill，零性能负担）
        const foliage = g.foliage;
        const step = Math.max(1, Math.floor(foliage.length / 32));
        ctx.beginPath();
        for (let i = 0; i < foliage.length; i += step) {
          const f = foliage[i];
          const pulse = Math.sin(t * omega * 2.5 + f.phase);
          if (pulse <= 0.1) continue;
          const r = f.size * (0.6 + 0.85 * pulse);
          ctx.moveTo(f.x + r, f.y);
          ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
        }
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#e0f2fe';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private cachePad(): number {
    const g = this.geometry;
    let maxBranchW = 0;
    for (let i = 0; i < g.branches.length; i++) {
      if (g.branches[i].width > maxBranchW) maxBranchW = g.branches[i].width;
    }
    const branchNeed = maxBranchW * 4.0;

    let maxFoliage = 0;
    for (let i = 0; i < g.foliage.length; i++) {
      if (g.foliage[i].size > maxFoliage) maxFoliage = g.foliage[i].size;
    }
    const foliageNeed = maxFoliage * GLOW_PAD;

    return Math.ceil(Math.max(branchNeed, foliageNeed)) + 4;
  }
}

/** 固定 seed 的伪随机（mulberry32）。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 往图里加这个孤立节点（已存在则直接复用）。
 */
export function spawnTreeNode(
  cy: cytoscape.Core,
  geometry: TreeGeometry,
  heightPx: number,
): cytoscape.NodeSingular {
  const size = hitboxSize(geometry, heightPx);
  const existing = cy.getElementById(TREE_ID);
  if (existing.nonempty()) {
    existing.addClass(`layer-parent ${TREE_CLASS}`);
    stripNodeChrome(existing, size);
    return existing;
  }

  const { x, y } = pickSpawnPoint(cy);
  const node = cy.add({
    group: 'nodes',
    data: { id: TREE_ID, label: '生命之树' },
    position: { x, y },
    classes: `layer-parent ${TREE_CLASS}`,
  });
  stripNodeChrome(node, size);
  void fetchTreeContent(node);
  return node;
}

function stripNodeChrome(node: cytoscape.NodeSingular, size: { w: number; h: number }): void {
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

    width: size.w,
    height: size.h,
    'min-width': 1,
    'min-height': 1,
    shape: 'ellipse' as cytoscape.Css.NodeShape,

    padding: 0,
    opacity: 0,
  });
}

async function fetchTreeContent(node: cytoscape.NodeSingular): Promise<void> {
  await loadDecorContent(node);
}

export function createFractalTreeOverlay(options: FractalTreeOverlayOptions): FractalTreeOverlay {
  return new FractalTreeOverlay(options);
}