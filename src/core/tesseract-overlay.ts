// src/core/tesseract-overlay.ts
// 四维空间（tesseract）：图谱里第二个真实存在、参与力学模拟、却孤立无边的装饰节点。
//
// 架构刻意与 celestial-emblem-overlay.ts 平行而不是复用：太极八卦是一叠
// 同心文字环，它的绘制循环跟"3D 投影 + 深度排序"毫无关系；超立方体每帧要
// 重新旋转 16 个顶点、算深度、决定 32 条棱的绘制顺序。硬塞进同一个类会得到
// 一个既有两个职责、又有互斥状态（pause/resume/reroll/destroy）的上帝对象。
// 两个独立 overlay 各自持有自己的 canvas，生命周期互不牵连。
//
// 数学：
//   超立方体 16 顶点的坐标就是 4D 超立方体的 ±1 组合，32 条棱连接所有
//   相差恰好一个坐标的顶点对。用一个 4bit 整数 v 的第 k 位表示第 k 个坐标
//   的符号（1 → +1，0 → -1），这样"枚举 32 条棱"退化成"枚举 32 组相邻 bit"，
//   构造时不需要任何运行时几何计算。
//   动画用两个互相独立的旋转平面：xy 平面（角 α）与 zw 平面（角 β）。任一
//   单个平面旋转都足以让 tesseract 显形，叠加两个则四个内胞腔都保持可见——
//   只转一个平面时，投影出来的形状会在若干角度退化成"两个同心立方体"
//   （z/w 分量恒定不动），叠加之后这种退化被抹平。
//   投影两步：4D → 3D 做透视除法（w 分量当深度），3D → 2D 再做一次。w 除法
//   正是"内部立方体看起来嵌在外部立方体里"的那一步——不是缩放，是各点
//   朝观察者方向的透视发散。
//
// 与太极八卦一致的部分（保持两个装饰节点行为对称）：
//   - 图上是一个真 cytoscape 节点，打 `layer-parent` class 排除出搜索/统计/
//     漫游/force-drag，但照常参与 euler 斥力物理，被推向最空旷的方向。
//   - cytoscape 自身的 chrome 全部 strip 掉（本体完全透明），只留一个与
//     视觉半径同步的圆形命中盒，保证"看得见的"和"点得到的"是同一块。
//   - 内容从 Markdown 异步拉取，走项目统一的 frontmatter 解析器，失败静默降级。
//   - 命中盒/半径都从全图 boundingBox 推，不写死像素——reroll 或换图谱规模时
//     自动跟着重算，否则画出来的圆盘和能点到的区域会错位。
//
// ⚠️ 接入时机与太极八卦完全相同：main.ts 里必须在"从中心爆出"的入场动画
// 循环【之后】（那段循环遍历 cy.nodes() 不筛选 layer-parent，会把这个节点
// 一起摆到 halo 环上），又要在 finishStreamingLayout() 触发第一次 euler
// 之【前】。两行 create 调用紧挨着放即可。

import type cytoscape from 'cytoscape';
import { parseFrontmatter } from '../parser/frontmatter.js';

/** 图上这个节点固定用这个 id。 */
export const TESSERACT_ID = 'tesseract-space';
const TESSERACT_CLASS = 'tesseract-node';
/** 拉取内容用的 md 路径——跟太极八卦同目录同惯例。 */
const CONTENT_REL_PATH = '个人成长与生存策略/四维空间.md';

type Vec3 = readonly [number, number, number];
type Vec4 = readonly [number, number, number, number];

/**
 * 16 个顶点：v 的第 k 位是 1 → 第 k 维取 +1，是 0 → 取 -1。
 * 展开写出来是 [(±1,±1,±1,±1)] 的全部 16 种组合，正是 4D 超立方体的顶点集。
 */
const VERTICES_4D: readonly Vec4[] = Array.from({ length: 16 }, (_, v) => [
  v & 1 ? 1 : -1,
  v & 2 ? 1 : -1,
  v & 4 ? 1 : -1,
  v & 8 ? 1 : -1,
]);

/**
 * 32 条棱。两个顶点在某一位上不同、其余三位相同 ⇒ 它们相邻，即
 * `v ↔ v ^ (1 << k)`（v 是 4bit 顶点编号，k 取 0..3）。
 *
 * 16 顶点 × 4 位 = 64 个有向邻接对，一条棱被两个方向各数了一次，按无向
 * 去重后正好 32 条。去重键取 `min-max` 排序后的端点对——不能用"只从某个
 * 奇偶性出发"来省掉这一步：k≥1 时翻转高位不改变编号奇偶性，同奇偶顶点
 * 之间同样有棱（k=0 才翻转奇偶位），任何单向枚举都会漏边。
 *
 * 不变式（改动这段时用它们验证）：恰好 32 条；每个顶点度数恰好 4；
 * 无自环、无越界索引；每条棱两端恰好相差一个坐标。
 * 按第四维 w 的符号拆分应为 内胞 12 + 外胞 12 + 跨胞连接棱 8。
 */
const EDGES: readonly (readonly [number, number])[] = (() => {
  const seen = new Set<string>();
  const out: (readonly [number, number])[] = [];
  for (let v = 0; v < 16; v++) {
    for (let k = 0; k < 4; k++) {
      const w = v ^ (1 << k);
      const key = v < w ? `${v}-${w}` : `${w}-${v}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([v, w]);
    }
  }
  return out;
})();

/** w 分量为 0 会让透视除法爆掉；限深度窗而不是限角度，这样各轴表现一致。 */
const W_FLOOR = 0.28;
/** 4D→3D 的观察距离。越大越接近正交投影（内胞腔几乎不动），越小透视越强。 */
const W_DISTANCE = 2.4;
/** 3D→2D 的观察距离。与 w 投影同一量纲的直觉值。 */
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

/** 超立方体的视觉体量比太极八卦那十二重环小一档，半径相应收窄。 */
function pickRadius(cy: cytoscape.Core): number {
  return clamp(graphSpread(cy).spread * 0.052, 96, 230);
}

/** 命中盒边长——从视觉半径换算，不写死数字。见 celestial-emblem-overlay.ts
 *  同样的理由：半径变了必须跟着重算，否则命中盒和画面对不上。
 *  1.05 是给最外圈棱线的余量：正方体投影后角点比包围圆还稍远一点点。 */
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

/**
 * 4D → 3D 透视投影。w 是第四维坐标，它决定这个点在"第四个深度方向"上离观察者
 * 多远；除以 (wDistance - w) 就是沿该方向的透视发散。夹下限而不是夹上限：
 * w 逼近 wDistance 时该点本应冲向观察者，clamp 到 W_FLOOR 后停在"最靠前"的
 * 有限位置，避免除零和贯穿。
 */
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

export interface TesseractOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  ink?: string;
  glow?: string;
  /** 一圈完整旋转的秒数。越小转得越快。 */
  spinSeconds?: number;
  fps?: number;
}

interface ProjectedVertex extends Vec3 {
  /** 第三分量是 2D 缩放系数 k，> 1 表示比中心更靠近观察者。 */
  depth: number;
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

  private modelRadius = 180;
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

  constructor(options: TesseractOverlayOptions) {
    this.cy = options.cy;
    this.ink = options.ink ?? '#cfe4ff';
    this.glow = options.glow ?? 'rgba(124,181,255,0.5)';
    this.spinSeconds = Math.max(2, options.spinSeconds ?? 26);
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    spawnTesseractNode(this.cy);
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
    // 插在太极八卦的 canvas 之后（同为 container.firstChild 语义），两层
    // pointerEvents 都是 none，重叠也不会互相吃掉点击。
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

  /** 传送到新的随机起点；命中盒跟着新半径重新同步。 */
  reroll(): void {
    const node = this.cy.getElementById(TESSERACT_ID);
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
    const node = this.cy.getElementById(TESSERACT_ID);
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

  // ── 绘制 ──────────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    const node = this.cy.getElementById(TESSERACT_ID);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    if (node.empty()) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    // 缩小到一定程度后整体不再继续收缩：作为一颗冷光信标留在线索里。
    // 最外圈半径 floor 在 ~6 CSS px。
    const R = Math.max(this.modelRadius * zoom, 6);
    const rx = p.x,
      ry = p.y;

    const reach = R * 1.3 + 24;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    )
      return;

    // 两个旋转平面的角速度比取无理数近似（√2），使 (α,β) 不会在一个
    // 可感知的周期内回到出发点——否则 tesseract 会显得在原地打转。
    const omega = (Math.PI * 2) / this.spinSeconds;
    const alpha = t * omega;
    const beta = t * omega * Math.SQRT2;

    // 4D → 3D → 2D，预先把 16 个顶点都算好，棱的绘制循环里只做查表。
    // 每个顶点是 [x, y, k]：k 是 3D→2D 那步的透视缩放系数，> 1 靠近观察者，
    // 同时充当深度排序与空气透视的输入。
    const cosA = Math.cos(alpha);
    const sinA = Math.sin(alpha);
    const cosB = Math.cos(beta);
    const sinB = Math.sin(beta);
    const projected: readonly Vec3[] = VERTICES_4D.map((v) => {
      const r = rotateZW(rotateXY(v, cosA, sinA), cosB, sinB);
      return project3D(project4D(r));
    });

    // 棱的单元长度：4D 超立方体棱长 2，旋转保长，两次透视各放大 k，
    // 合成缩放约 modelRadius（归一化基准）——乘半边长得到 2D 下的棱长。
    const unit = R * 0.5;

    const breathe = this.reducedMotion ? 1 : 1 + 0.025 * Math.sin(t * 0.5);

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(breathe, breathe);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 画家算法：远的棱先画、近的后画，交叉处的遮挡关系自然正确。
    // 顶点按第四维"离观察者的远近"分成内外两胞——w=+1 的 8 个是外立方体，
    // w=-1 的 8 个是内立方体，用线型与色深区分，不靠深度排序去猜。
    const sorted = EDGES.map(([a, b]) => ({
      a,
      b,
      z: (projected[a][2] + projected[b][2]) / 2,
      inner: VERTICES_4D[a][3] < 0,
    })).sort((m, n) => m.z - n.z);

    for (const e of sorted) {
      // depth>1 靠前、<1 靠后。用它同时调制透明度与线宽，做出"深处收敛、
      // 近处张开"的空气透视。
      const k = (projected[e.a][2] + projected[e.b][2]) / 2;
      const near = clamp((k - 0.7) / 0.6, 0, 1);
      const alpha = e.inner ? 0.2 + 0.34 * near : 0.42 + 0.46 * near;
      const w = e.inner ? 0.7 + 0.5 * near : 1.1 + 0.9 * near;

      const A = projected[e.a];
      const B = projected[e.b];
      ctx.beginPath();
      ctx.moveTo(A[0] * unit, A[1] * unit);
      ctx.lineTo(B[0] * unit, B[1] * unit);
      if (near > 0.55) {
        ctx.strokeStyle = this.ink;
        ctx.shadowColor = this.glow;
        ctx.shadowBlur = R * 0.05 * near;
      } else {
        ctx.strokeStyle = this.ink;
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = w;
      if (e.inner) {
        // 内立方体的棱用虚线：它在几何上是"同一个立方体走到第四维另一端"，
        // 虚线让这个"同源"关系在视觉上可读，而不与实线的外立方体混淆。
        ctx.setLineDash([R * 0.02, R * 0.016]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // 顶点：小圆点，尺寸与深度同步。8 个外胞顶点稍大、8 个内胞稍小。
    for (let i = 0; i < projected.length; i++) {
      const V = projected[i];
      const near = clamp((V[2] - 0.7) / 0.6, 0, 1);
      const inner = VERTICES_4D[i][3] < 0;
      const r = (inner ? R * 0.008 : R * 0.013) * (0.65 + 0.5 * near);
      ctx.beginPath();
      ctx.arc(V[0] * unit, V[1] * unit, r, 0, Math.PI * 2);
      ctx.globalAlpha = inner ? 0.24 + 0.36 * near : 0.5 + 0.45 * near;
      ctx.fillStyle = this.ink;
      if (near > 0.5) {
        ctx.shadowColor = this.glow;
        ctx.shadowBlur = R * 0.07;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

/**
 * 往图里加这个孤立节点（已存在则直接复用）。不 lock()：交给 euler 的斥力物理
 * 决定落点——见文件头注释。
 *
 * 内容（shortSummary / fullSummary / body）从对应 Markdown 异步加载，走跟其他
 * 所有节点完全相同的 frontmatter 解析器。fetch 未回来前详情面板只显示基本
 * 信息，失败同样静默降级。
 */
export function spawnTesseractNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(TESSERACT_ID);
  if (existing.nonempty()) {
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
  // canvas overlay 自己画，cytoscape 的文本标签会叠在棱线上——关掉。
  // label 仍留在 data.label，详情面板读得到。
  stripNodeChrome(node, size);

  void fetchTesseractContent(node);
  return node;
}

/**
 * 抹掉 cytoscape 自身画的所有可见 chrome：本体完全透明，只留一个与视觉半径
 * 同步的圆形命中盒。逐条属性的理由见 celestial-emblem-overlay.ts 的同名函数。
 *
 * `events`/pointer 相关属性不在这里关——否则点击不到节点，详情面板永远打不开。
 */
function stripNodeChrome(node: cytoscape.NodeSingular, size: number): void {
  // 抹掉属性，让所有 [stroke=...] / [defaultStroke=...] 选择器不命中
  node.data('stroke', '');
  node.data('defaultStroke', '');

  node.style({
    // ── 本体：完全透明 ───────────────────────────────────────
    'background-color': 'rgba(0,0,0,0)',
    'background-opacity': 0,
    'background-fill': 'solid' as const,
    'background-blacken': 0,
    'background-gradient-stop-colors': '',
    'background-gradient-stop-positions': '',
    'background-gradient-direction': '',

    // ── 边框：0px + 完全透明 ──────────────────────────────────
    'border-width': 0,
    'border-color': 'rgba(0,0,0,0)',
    'border-opacity': 0,
    'border-style': 'solid' as cytoscape.Css.LineStyle,

    // ── overlay（二次描边层）：透明 ─────────────────────────
    'overlay-color': 'rgba(0,0,0,0)',
    'overlay-opacity': 0,
    'overlay-shape': 'ellipse' as cytoscape.Css.NodeShape,
    'overlay-padding': 0,

    // ── 文本：空 → cytoscape 不画 ────────────────────────────
    label: '',
    'text-opacity': 0,
    'text-events': 'no' as const,

    // ── 尺寸：跟视觉半径同步的命中盒，圆形贴合圆形画面 ──────
    width: size,
    height: size,
    'min-width': 1,
    'min-height': 1,
    shape: 'ellipse' as cytoscape.Css.NodeShape,

    // ── 其它可能的可见副产物：清掉 ───────────────────────────
    'compound-sizing-w-b': 0,
    'compound-sizing-w-h': 0,
    padding: 0,
    opacity: 0,
    // 不能写 visibility:hidden——cytoscape 会同时让 pointer 命中失效。
    ghost: 'no' as const,
    'ghost-color': 'rgba(0,0,0,0)',
    'ghost-opacity': 0,
    'ghost-shape': 'ellipse' as cytoscape.Css.NodeShape,
    'ghost-offset-x': 0,
    'ghost-offset-y': 0,
  });
}

/** 非阻塞加载——fetch + 正式 frontmatter 解析器，成功后写入 node data。
 *  失败（网络、404、frontmatter 缺 id 等）一律静默降级。 */
async function fetchTesseractContent(node: cytoscape.NodeSingular): Promise<void> {
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

export function createTesseractOverlay(options: TesseractOverlayOptions): TesseractOverlay {
  return new TesseractOverlay(options);
}
