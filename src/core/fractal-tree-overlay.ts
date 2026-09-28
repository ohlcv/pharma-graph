// src/core/fractal-tree-overlay.ts
// 生命之树：图谱里第三个观赏奇观节点。一棵 L-system 递归生成的分形树，
// 树冠末梢缀着缓慢明灭的光点（果实 / 星子），随节点位置由 euler 斥力吹动。
//
// 架构与 tesseract-overlay.ts / celestial-emblem-overlay.ts 完全平行：
// 独立 canvas + 独立 rAF + 独立节点生命周期。**不**复用它们的基类——三个奇观
// 各自的绘制循环毫无共性（十二重文字环 / 16 顶点 4D 投影 / 递归枝干），
// 抽公共基类只会得到一个塞满互斥状态的上帝对象。
//
// 几何（递归、角度衰减、色标度）在 fractal-tree-geometry.ts 里，因为那些
// 必须能脱离 canvas 单独测试与调参。**本文件只管生命周期与绘制。**
//
// 数学上的诚实说明：L-system 树严格说**不是分形**——粗枝分细枝，各层比例
// 不同，不满足自相似。它满足的是"层级递归 + 近似自相似"，视觉上属分形家族。
// 对外文案不要写成严格意义的分形（详见 docs/ADR 里对应的记录）。
//
// ⚠️ 接入时机与另两个奇观完全相同：main.ts 里必须在"从中心爆出"的入场动画
// 循环【之后】（那段循环遍历 cy.nodes() 不筛选 layer-parent），又要在
// finishStreamingLayout() 触发第一次 euler 之【前】。

import type cytoscape from 'cytoscape';
import { parseFrontmatter } from '../parser/frontmatter.js';
import {
  generateTree,
  barkColor,
  foliageColor,
  rgba,
  DEFAULT_TREE_PARAMS,
  type TreeGeometry,
  type TreeParams,
} from './fractal-tree-geometry.js';

export const TREE_ID = 'tree-of-life';
const TREE_CLASS = 'tree-node';
const CONTENT_REL_PATH = '个人成长与生存策略/生命之树.md';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
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

/**
 * 视觉高度（局部系 trunkLength 的倍数）→ 屏幕高度。
 *
 * 实拍调过两轮：初版按图幅 15%（夹 130–320）在 1182 节点图谱上偏小偏淡，
 * 挤在节点群里几乎看不出是一棵树。抬到 26% / 夹 [190, 460] 后才与超立方体
 * 的视觉体量相当。
 */
function pickHeight(cy: cytoscape.Core): number {
  return clamp(graphSpread(cy).spread * 0.26, 190, 460);
}

/**
 * 命中盒：不按树的包围盒算，用一个"冠幅见方"的高瘦矩形——
 * 树的实际形态是下宽上窄的倒锥，套一个贴合包围盒的矩形会大出很多空白，
 * 导致点击区域和画面对不上（和另两个奇观同样的顾虑，只是形状不同）。
 * 宽 = 冠幅（bounds 宽），高 = 树高 × 1.08（给梢部光点留余量）。
 */
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
  /** 覆盖几何默认参数（见 fractal-tree-geometry.ts）。 */
  params?: Partial<Omit<TreeParams, 'rand'>>;
  /** 树的屏幕高度（CSS px）。不给则按图幅推。 */
  height?: number;
  /** 光点明灭的周期秒数。 */
  pulseSeconds?: number;
  /** 树冠整体的呼吸周期秒数；给 0 关闭。 */
  swaySeconds?: number;
  fps?: number;
}

export class FractalTreeOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly pulseSeconds: number;
  private readonly swaySeconds: number;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  private geometry: TreeGeometry;
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
    this.pulseSeconds = Math.max(0.5, options.pulseSeconds ?? 4.2);
    this.swaySeconds = Math.max(0, options.swaySeconds ?? 0);
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // 树形生成一次就固定下来：每帧重算 2047 段递归纯属浪费，
    // 而且随机重生成会让整棵树每帧变形。这里是**刻意**用固定 seed 的。
    this.geometry = generateTree({
      ...DEFAULT_TREE_PARAMS,
      ...options.params,
      rand: mulberry32(0x5eed),
    });
    this.treeHeight = options.height ?? pickHeight(this.cy);

    spawnTreeNode(this.cy, this.geometry, this.treeHeight);

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
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(container);
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    this.start();
  }

  /** 换一棵新树（换 seed 重生成），并把命中盒同步到新树形。 */
  reseed(): void {
    this.geometry = generateTree({ ...DEFAULT_TREE_PARAMS, rand: Math.random });
    const node = this.cy.getElementById(TREE_ID);
    if (node.nonempty()) {
      stripNodeChrome(node, hitboxSize(this.geometry, this.treeHeight));
    }
  }

  /** 传送到新的随机起点；命中盒跟着新位置重新同步。 */
  reroll(): void {
    const node = this.cy.getElementById(TREE_ID);
    if (node.empty()) return;
    const { x, y } = pickSpawnPoint(this.cy);
    node.position({ x, y });
    stripNodeChrome(node, hitboxSize(this.geometry, this.treeHeight));
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
    const node = this.cy.getElementById(TREE_ID);
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

  // ── 绘制 ──────────────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    const node = this.cy.getElementById(TREE_ID);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    if (node.empty()) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    // 缩小到一定程度后整体不再继续收缩：作为一颗冷光信标留在线索里。
    const H = Math.max(this.treeHeight * zoom, 24);
    const rx = p.x,
      ry = p.y;

    const reach = H * 0.62 + 24;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    )
      return;

    const g = this.geometry;
    const { x1, y1, x2, y2 } = g.bounds;
    const geoH = Math.max(1, y2 - y1);
    const scale = H / geoH;

    // 冠幅呼吸：整体极轻微地涨缩，幅度 1.5%，30s 一次——慢到几乎察觉不到，
    // 但静止的画面在长会话里会显得"死了"。
    const breathe =
      this.swaySeconds > 0 ? 1 + 0.015 * Math.sin((t / this.swaySeconds) * Math.PI * 2) : 1;

    ctx.save();
    // 树的局部系以树根为原点、向上为 -y。把它挪到节点位置，并把包围盒
    // 的中心对到节点上（node 位置视为树的视觉中心，而非树根）。
    ctx.translate(rx, ry);
    ctx.scale(scale * breathe, scale * breathe);
    ctx.translate(-(x1 + x2) / 2, -(y1 + y2) / 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ── 枝干 ────────────────────────────────────────────────────────────
    // **先粗后细**：细枝要压在粗枝之上，交叉处的遮挡关系才自然。
    // geometry 用 FIFO 队列生成，depth 天然全局升序，width 又是 depth 的
    // 单调函数，所以倒序遍历即「由粗到细」——不需要每帧 sort 2047 段
    // （30fps 下那是白付的成本）。契约由测试「BFS 队列保证 depth 全局有序」锁住。
    const maxD = Math.max(1, g.maxDepth);
    for (let i = g.branches.length - 1; i >= 0; i--) {
      const b = g.branches[i];
      const dep = b.depth / maxD;
      const ex = b.x + Math.cos(b.angle) * b.length;
      const ey = b.y + Math.sin(b.angle) * b.length;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = rgba(barkColor(dep), 0.62 + 0.34 * dep);
      ctx.lineWidth = b.width;
      if (dep > 0.55) {
        // 梢部微光：外侧 45% 的枝带辉光，模拟透光的嫩枝。
        // 初版门槛 0.72 太窄，在实拍的深色背景上几乎看不出辉光。
        ctx.shadowColor = rgba(foliageColor(dep), 0.5);
        ctx.shadowBlur = b.width * 3.5;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // ── 末梢光点 ─────────────────────────────────────────────────────────
    // 每个光点有独立相位（geometry 里的 phase），明灭不同步——同步的话
    // 整树会一起闪，像圣诞灯串；异步才像真的果实/星子在呼吸。
    const omega = (Math.PI * 2) / this.pulseSeconds;
    for (const f of g.foliage) {
      const dep = f.depth / maxD;
      const col = foliageColor(dep);
      // phase 来自固定 seed，所以明灭节奏是稳定的（不是每帧重新随机）
      const k = 0.5 + 0.5 * Math.sin(t * omega + f.phase);
      const r = f.size * (0.72 + 0.5 * k);
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.34 + 0.6 * k;
      ctx.fillStyle = rgba(col, 1);
      ctx.shadowColor = rgba(col, 0.85);
      ctx.shadowBlur = f.size * 5 * (0.4 + k);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

/** 固定 seed 的伪随机（mulberry32）。树形只在构造时生成一次，
 *  用真 Math.random 也行，但固定 seed 让同一棵树在 reroll / 截图 / 回归
 *  测试里保持一致，便于比对。 */
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
 * 往图里加这个孤立节点（已存在则直接复用）。不 lock()：交给 euler 的斥力
 * 物理决定落点——理由同 tesseract-overlay.ts。
 */
export function spawnTreeNode(
  cy: cytoscape.Core,
  geometry: TreeGeometry,
  heightPx: number,
): cytoscape.NodeSingular {
  const size = hitboxSize(geometry, heightPx);
  const existing = cy.getElementById(TREE_ID);
  if (existing.nonempty()) {
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

/**
 * 抹掉 cytoscape 自身画的所有可见 chrome：本体完全透明，只留一个与视觉
 * 尺寸同步的命中盒。逐条属性的理由见 tesseract-overlay.ts 的同名函数。
 * 唯一区别是这里用 w/h 分开设（树是竖长的），那边是等边正方形。
 */
function stripNodeChrome(
  node: cytoscape.NodeSingular,
  size: { w: number; h: number },
): void {
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

    // 竖长的命中盒：树冠比树根宽得多，套正方形会多出一大片空白区域
    width: size.w,
    height: size.h,
    'min-width': 1,
    'min-height': 1,
    shape: 'ellipse' as cytoscape.Css.NodeShape,

    padding: 0,
    opacity: 0,
  });
}

/** 非阻塞加载——fetch + 正式 frontmatter 解析器，失败静默降级。
 *  处理与另两个奇观完全一致。 */
async function fetchTreeContent(node: cytoscape.NodeSingular): Promise<void> {
  try {
    const url =
      '/content/' +
      CONTENT_REL_PATH.split('/')
        .map((s) => encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F'))
        .join('/');
    const res = await fetch(url);
    if (!res.ok) return;
    const text = await res.text();
    const fm = parseFrontmatter(text, CONTENT_REL_PATH);
    node.data('shortSummary', fm.shortSummary);
    node.data('fullSummary', fm.fullSummary);
    node.data('body', fm.body);
    node.data('sourcePath', CONTENT_REL_PATH);
  } catch {
    /* fetch / 解析失败不影响图功能，静默降级 */
  }
}

export function createFractalTreeOverlay(
  options: FractalTreeOverlayOptions,
): FractalTreeOverlay {
  return new FractalTreeOverlay(options);
}
