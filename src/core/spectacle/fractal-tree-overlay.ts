// src/core/spectacle/fractal-tree-overlay.ts
// 生命之树：图谱里第三个观赏奇观节点。一棵 L-system 递归生成的分形树，
// 树冠末梢缀着缓慢明灭的光点（果实 / 星子），随节点位置由 euler 斥力吹动。
//
// 架构与 tesseract-overlay.ts / emblem-overlay.ts 完全平行：
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
import { parseFrontmatter } from '../../parser/frontmatter.js';
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

/**
 * 预渲染发光精灵的边距倍数。径向渐变的辉光要溢出光点本身才有"晕"，
 * 3.4 让核心实心区约占精灵直径的 1/3，外圈平滑衰减到全透明。
 */
const GLOW_PAD = 3.4;

export interface FractalTreeOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  /** 覆盖几何默认参数（见 fractal-tree-geometry.ts）。 */
  params?: Partial<Omit<TreeParams, 'rand'>>;
  /** 树的屏幕高度（CSS px）。不给则按图幅推。 */
  height?: number;
  /**
   * 树冠整体的呼吸周期秒数；给 0 关闭所有动态效果（树变成完全静态的一幅画）。
   *
   * 动态层现在只有一层：整树叠加一遍的极轻微加法混合（见 draw）。
   * **逐点异步明灭已不存在** —— 光点与枝干一起烘进了静态位图缓存。
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
  /**
   * 枝干静态层的离屏缓存。
   *
   * **这是最大的性能杠杆。** 2047 根枝的形状与颜色**逐帧完全不变**
   * （树形在构造时一次生成，之后只有光点明灭和整体呼吸在动），但原实现
   * 每帧要重画 2047 次 `stroke()`，其中约 45% 还带 `shadowBlur`——
   * 合计每帧近 3000 次高斯模糊，实测足以把整页拖到十几帧。
   *
   * 缓存成一张离屏 canvas 后，每帧枝干只要 1 次 `drawImage`（走 GPU 合成）。
   * 缓存 key 是 (dpr, 屏上高度)——只有这两个变化会让像素失真：
   *   - dpr 变 → 位图密度不匹配
   *   - 屏上高度变 → 缩放后的线宽/辉光半径不对
   * 树形本身换了（reseed）也要重建。
   */
  private branchCache: HTMLCanvasElement | null = null;
  private branchCacheKey = '';

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
    // **必须失效枝干缓存**：缓存里是旧树的 2047 根枝，换树不重建的话
    // 画面的还是上一棵，节点却已经是一棵新树的命中盒了。
    this.branchCache = null;
    this.branchCacheKey = '';
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
    // 改 canvas.width/height 会**自动清空**画布，所以上一帧的 box 已经
    // 不存在了。必须忘掉它，否则下一帧会对着一个空画布再清一次——
    // 无害，但状态与实际内容不符，同类 bug 很难查。
    this.lastDrawnBox = null;
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

  /**
   * 枝干静态层缓存。命中则直接返回。
   *
   * 缓存里的坐标系与 geometry 局部系一致（未平移未缩放），这样几何数据
   * 与位图解耦：树形变了只需重建位图，代码不必重排。
   *
   * ── 分辨率策略：固定 1×，不跟屏幕走 ──────────────────────────────────
   * 这个方向试错过两次，两次都错在「让缓存追屏幕分辨率」上：
   *
   *   1. 键绑屏上高度（量化 64px 台阶）→ 缩放手势一帧跨几个台阶就重建，
   *      每帧重画 2047 根带辉光的枝。比不缓存还糟。
   *   2. 键绑所需倍率且**只增不减** → 放大到 4× 后每帧都要把一张 4× 大位图
   *      drawImage 缩放绘制，实测放大时中位帧从 17ms 劣化到 100ms（10 FPS）。
   *
   * 结论：**缓存的职责是「把 2047 次 stroke 变成 1 次 drawImage」，
   * 不是「提供高分辨率」。** 位图按 1× 局部单位渲染一次，之后所有缩放
   * 都交给 drawImage 的 GPU 插值。放大后树会略糊——那正是「2047 根细枝
   * 在屏幕上占几百像素」的物理现实，不是缺陷。真正该接受的是成本，
   * 而不是用无限大的位图去掩盖它。
   */
  private ensureBranchCache(dpr: number): HTMLCanvasElement | null {
    const g = this.geometry;
    const { x1, y1, x2, y2 } = g.bounds;

    // **键与屏幕状态完全无关**：树形与 dpr 变了才重建。
    // 这条约束是整个缓存能否生效的关键——一旦把 zoom / 屏上尺寸塞进键，
    // 缩放手势期间就会每帧重建，而这正是「越缩放越卡」的成因。
    const key = `${dpr}|${g.branches.length}`;
    if (this.branchCache && this.branchCacheKey === key) return this.branchCache;

    const geoW = Math.max(1, x2 - x1);
    const geoH = Math.max(1, y2 - y1);
    // 留边统一由 cachePad() 决定（枝干辉光与光点渐变的较大者）。
    // 这里**必须**用同一个函数，否则绘制时的 drawImage 尺寸与位图实际
    // 尺寸对不上，裁切边缘会被插值拉成一片残影。
    const pad = this.cachePad();

    const cv = document.createElement('canvas');
    // 1× 局部单位 → dpr 像素。再高只是让每帧的 drawImage 更贵。
    cv.width = Math.max(1, Math.round((geoW + pad * 2) * dpr));
    cv.height = Math.max(1, Math.round((geoH + pad * 2) * dpr));
    const c = cv.getContext('2d');
    if (!c) return null;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.translate(pad - x1, pad - y1);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    const maxD = Math.max(1, g.maxDepth);
    // **先粗后细**：细枝压在粗枝之上，交叉处遮挡才自然。
    // geometry 用 FIFO 队列生成，depth 全局升序、width 是 depth 的单调
    // 函数，倒序遍历即「由粗到细」。契约由测试「BFS 队列保证 depth 全局
    // 有序」锁住。
    for (let i = g.branches.length - 1; i >= 0; i--) {
      const b = g.branches[i];
      const dep = b.depth / maxD;
      const ex = b.x + Math.cos(b.angle) * b.length;
      const ey = b.y + Math.sin(b.angle) * b.length;
      c.beginPath();
      c.moveTo(b.x, b.y);
      c.lineTo(ex, ey);
      c.strokeStyle = rgba(barkColor(dep), 0.62 + 0.34 * dep);
      c.lineWidth = b.width;
      if (dep > 0.55) {
        c.shadowColor = rgba(foliageColor(dep), 0.5);
        c.shadowBlur = b.width * 3.5;
      } else {
        c.shadowBlur = 0;
      }
      c.stroke();
    }
    c.shadowBlur = 0;

    // ── 末梢光点：**也烘进静态层** ─────────────────────────────────────
    // 这是本轮简化的核心认知：**光点的位置和基准大小同样是静态的**，
    // 逐帧变的只有相位造成的明灭。既然如此，就该和枝干一样缓存起来。
    //
    // 原来每帧要画 2048 次 drawImage（即使已用精灵替掉 shadowBlur，
    // 2048 次调用本身在缩放手势中也会叠加成卡顿）。现在它是一次性的。
    //
    // 画的是**最亮峰值**的形态，动态明灭改由下面叠加的一层整体透明度
    // 呼吸来近似——见 draw 里的 pulseLayer。代价是个别光点不再异步
    // 明灭（原来每点独立相位），换来每帧只剩 2 次 drawImage。
    for (const f of g.foliage) {
      const dep = f.depth / maxD;
      const col = foliageColor(dep);
      const r = f.size * 0.97; // 峰值半径（与动态版的上界一致）
      const g2 = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * GLOW_PAD);
      g2.addColorStop(0, rgba(col, 1));
      g2.addColorStop(0.35, rgba(col, 0.55));
      g2.addColorStop(1, rgba(col, 0));
      c.fillStyle = g2;
      // 中心实心核，让光点在密集枝叶间仍能读出
      c.beginPath();
      c.arc(f.x, f.y, r * 0.42, 0, Math.PI * 2);
      c.fillStyle = rgba(col, 0.9);
      c.fill();
      c.beginPath();
      c.arc(f.x, f.y, r * 0.42, 0, Math.PI * 2);
      c.fillStyle = g2;
      c.fill();
    }

    this.branchCache = cv;
    this.branchCacheKey = key;
    return cv;
  }

  /**
   * 上一帧树的**实际绘制区域**（视口坐标，矩形）。
   *
   * 必须记住它，因为 clearRect 要清的是「上一帧画过的地方」，
   * 而**不是**「这一帧要画的地方」——平移或缩放手势中两者完全不同。
   * 只清当前位置就是残影的来源：上一帧的像素再也不会被覆盖，也永远不会被清。
   *
   * 存**半宽 / 半高**而不是半径：树是 1.59 倍宽的矩形，用一个「半径」
   * 去近似必然清不全两侧（见 draw 里的说明）。
   */
  private lastDrawnBox: { x: number; y: number; hw: number; hh: number } | null = null;

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    const node = this.cy.getElementById(TREE_ID);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    // 缩小到一定程度后整体不再继续收缩：作为一颗冷光信标留在线索里。
    const H = Math.max(this.treeHeight * zoom, 24);
    const rx = p.x,
      ry = p.y;

    // ── 清屏范围必须等于实际绘制范围，一像素都不能少 ──────────────────
    //
    // 这里原来写的是 `reach = H * 0.62 + 24`，把树当成一个**圆**来清。
    // 但树实际画出来是**矩形**，宽高比 1.59（实测 523×329 局部单位）。
    // 于是横向永远清不全：H=220 时两侧各溢出 60px，H=880 时各溢出 311px
    // —— 正是「两侧大量残影」的成因，而纵向一个像素都不溢出。
    //
    // 现在按包围盒的真实比例算半宽 / 半高，**与 drawImage 的目标尺寸
    // 用同一份数据**，结构上不可能再错配。
    const g = this.geometry;
    const { x1, y1, x2, y2 } = g.bounds;
    const geoH = Math.max(1, y2 - y1);
    const geoW = Math.max(1, x2 - x1);
    const scale = H / geoH;
    const cachePad = this.cachePad();
    // 绘制目标尺寸 = 包围盒 + 两侧留边（辉光/渐变的外溢）
    const drawW = (geoW + cachePad * 2) * scale;
    const drawH = (geoH + cachePad * 2) * scale;
    const hw = drawW / 2;
    const hh = drawH / 2;

    const offscreen =
      node.empty() ||
      rx + hw < 0 ||
      rx - hw > this.cssWidth ||
      ry + hh < 0 ||
      ry - hh > this.cssHeight;

    // **清上一帧的实际区域，不是这一帧的区域。** 手势中两者不同：
    // 平移时树已挪位，上一帧的像素留在旧位置；缩放时尺寸变了，上一帧的
    // 区域比现在大。两种情况都只有 clearRect(上一帧的 box) 才能清干净。
    //
    // 早退分支也必须清——树移出视口后，它的像素还留在画布上。
    if (this.lastDrawnBox) {
      const b = this.lastDrawnBox;
      // 落在视口外的部分先夹一下，避免 clearRect 收到天量尺寸
      const cx1 = Math.max(0, b.x - b.hw);
      const cy1 = Math.max(0, b.y - b.hh);
      const cx2 = Math.min(this.cssWidth, b.x + b.hw);
      const cy2 = Math.min(this.cssHeight, b.y + b.hh);
      if (cx2 > cx1 && cy2 > cy1) ctx.clearRect(cx1, cy1, cx2 - cx1, cy2 - cy1);
    }
    this.lastDrawnBox = null;

    if (offscreen) return;

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

    // ── 整棵树：2 次 drawImage 取代 4095 stroke + 2048 sprite ───────────
    // 枝干与光点都已烘进静态层（见 ensureBranchCache），这里每帧只画两次。
    const cache = this.ensureBranchCache(this.dpr);
    if (cache) {
      // 目标尺寸与上面 hw/hh 用的是同一份 geoW/geoH/cachePad，
      // 两者在结构上不可能不一致。
      ctx.drawImage(cache, x1 - cachePad, y1 - cachePad, geoW + cachePad * 2, geoH + cachePad * 2);

      // 第 2 次：呼吸层。同一位图叠加一遍，整体透明度做极轻微起伏——
      // 这是「树在缓慢呼吸」的观感来源。
      //
      // 原来是 2048 个光点各自按独立相位明灭（像真的果实/星子）。现在
      // 退化为整树同步的一层淡入淡出：观感损失很小（幅度只有 12%），
      // 但每帧从 2048 次 drawImage 降到 1 次。
      //
      // 用 `lighter` 叠加而非 alpha 混合：呼吸层是同一份光，加法混合
      // 正好对应「整体更亮 / 更暗」而不是「整棵树变半透明」。
      if (this.swaySeconds > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.06 + 0.06 * Math.sin((t / this.swaySeconds) * Math.PI * 2);
        ctx.drawImage(
          cache,
          x1 - cachePad,
          y1 - cachePad,
          geoW + cachePad * 2,
          geoH + cachePad * 2,
        );
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();

    // 记下本帧实际区域，供下一帧清屏用。
    // **带呼吸的 1.5% 涨缩**：清屏范围若不算进去，呼气到峰值时最外圈
    // 辉光会露在下一帧的清屏区之外——那也是残影，而且只在缓慢呼吸的
    // 节奏里偶发，极难定位。
    this.lastDrawnBox = { x: rx, y: ry, hw: hw * breathe, hh: hh * breathe };
  }

  /**
   * 缓存位图相对包围盒的留边宽度。
   *
   * **必须同时覆盖枝干辉光与光点渐变，取两者较大值。** 这里算错过一次：
   * 原来只按光点算（`foliage[0].size * 6 + 8` = 20px），而枝干的
   * `shadowBlur` 外溢需求是 `最粗枝宽 * 3.5` ≈ 26px。少给的 10px 被位图
   * 裁掉，`drawImage` 放大时裁切边缘被插值拉成一片可见的模糊残留
   * （实测平移后区域外残留 47234 像素）。
   *
   * 构成：
   *   - 枝干：最粗枝的半宽 + 模糊半径（canvas 的 shadowBlur 向两侧各扩 blur）
   *   - 光点：最大光点的渐变外溢半径（size × GLOW_PAD）
   *   - 一点余量，吸收 stroke 的半宽与抗锯齿
   */
  private cachePad(): number {
    const g = this.geometry;
    let maxBranchW = 0;
    for (const b of g.branches) {
      if (b.width > maxBranchW) maxBranchW = b.width;
    }
    // shadowBlur = b.width * 3.5，向外单侧扩这么多，加半宽覆盖 stroke 本身
    const branchNeed = maxBranchW * 3.5 + maxBranchW * 0.5;

    let maxFoliage = 0;
    for (const f of g.foliage) {
      if (f.size > maxFoliage) maxFoliage = f.size;
    }
    // 渐变外溢到 size * GLOW_PAD 处才衰减到全透明
    const foliageNeed = maxFoliage * GLOW_PAD;

    return Math.ceil(Math.max(branchNeed, foliageNeed)) + 4;
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

export function createFractalTreeOverlay(options: FractalTreeOverlayOptions): FractalTreeOverlay {
  return new FractalTreeOverlay(options);
}
