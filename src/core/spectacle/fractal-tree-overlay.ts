// src/core/spectacle/fractal-tree-overlay.ts
// 生命之树：
// 几何内核（L-system 递归几何与季节色标度）与 overlay 层（离屏烘焙缓存、
// Canvas 渲染与 Cytoscape 节点生命周期）合并为单一内聚模块，导出接口与原版完全一致。
// 固定 seed 下生成的树形与原版逐点一致（截图/回归测试不受影响）。
//
// ── 性能 ───────────────────────────────────────────────────────────────────
//   1. 离屏烘焙：按深度层合批 Path（BFS 天然按 depth 有序），整棵树 12 层 × 少量 stroke，
//      零 shadowBlur、零逐点 Gradient；同一层的 Path2D 构建一次，辉光/阴影/本体/高光复用。
//   2. 几何派生数据（线段端点、层区间、光点、闪烁星表、缓存留边）只在换树时算一次，
//      之前每帧都会遍历 4095 根枝干 + 2048 个光点去重算 cachePad，现在每帧零遍历。
//   3. 按需重绘：只在 Cytoscape 视口/尺寸变化时重画；无动效（sway=0 或 reduced-motion）时
//      没有常驻 rAF 循环。有动效时 30fps 节流，且平移/缩放时跟随 cy 的 render 即时重画。
//   4. 分辨率自适应缓存：按屏幕实际缩放烘焙（半倍频程分档 + 滞回），放大不糊、缩小不闪烁，
//      并设上限保护显存；动态层的 bloom 以 1/2 分辨率烘焙，仅动画开启时才生成。
//   5. 每帧动态部分只有：1 次本体 drawImage + 1 次 bloom drawImage + ≤40 颗星子 sprite。
//
// ── 视觉 ───────────────────────────────────────────────────────────────────
//   · 末梢光点用高斯衰减的光晕 sprite（按树冠高度分 4 个色带：下暖金 → 上冷青白）
//     + 光点大小随机浮动，取代三层平涂同心圆，光晕边缘不再有色阶；
//   · 树干受光面高光 + 落影，粗枝有圆柱体积感；辉光统一垫在所有枝条之下；
//   · 树根暖光改为压扁的地面光池，树冠星云改为贴合树形的椭圆；
//   · 动效：根部固定的整体摇曳（shear）+ 呼吸，bloom 层随呼吸明暗，
//     星子带四向星芒的 sprite 异步闪烁。
//
// ── 修复 ───────────────────────────────────────────────────────────────────
//   · 原树根光晕半径 > 画布留边，底部被硬切；原树冠光晕同理，现已按画布范围夹紧；
//   · 渐变终点色改为同色相零透明度，避免透明插值产生的灰边；
//   · reseed() 现在沿用构造时传入的 params（原先静默丢弃）；
//   · 30fps 节流在 60Hz 屏上因浮点误差可能退化为 20fps，现加容差；
//   · reduced-motion 下平移/缩放时树不跟随的问题（原先只在 resize 时重绘一次）。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

const TAU = Math.PI * 2;

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
 *
 * 实现上 branches 数组本身就是 BFS 队列（原版另起一个 Pending 队列，会多分配 4095 个临时对象），
 * 每层分枝角提前查表（原版每根枝都 Math.pow 一次）。随机数的调用顺序与运算顺序保持不变，
 * 因此同一 seed 得到的几何与原版逐位一致。
 */
export function generateTree(params: TreeParams = DEFAULT_TREE_PARAMS): TreeGeometry {
  const { maxDepth, lengthDecay, trunkLength, spreadAngle, depthDecay, jitter, gravity, rand } =
    params;
  const branches: Branch[] = [];
  const foliage: Foliage[] = [];

  const rootWidth = Math.max(1, trunkLength * 0.075);

  const spreadTable = new Float64Array(Math.max(0, Math.ceil(maxDepth)) + 1);
  for (let d = 0; d < spreadTable.length; d++) {
    spreadTable[d] = spreadAngle * Math.pow(depthDecay, d);
  }

  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;

  const UP = -Math.PI / 2;
  branches.push({
    x: 0,
    y: 0,
    angle: UP,
    length: trunkLength,
    depth: 0,
    width: widthAt(0, maxDepth, rootWidth),
  });

  for (let head = 0; head < branches.length; head++) {
    const cur = branches[head];
    const ex = cur.x + Math.cos(cur.angle) * cur.length;
    const ey = cur.y + Math.sin(cur.angle) * cur.length;

    // 包围盒与枝干生成合并为一趟（原版需要再遍历一次并重复计算 cos/sin）
    const pad = cur.width / 2;
    if (cur.x - pad < x1) x1 = cur.x - pad;
    if (cur.y - pad < y1) y1 = cur.y - pad;
    if (cur.x + pad > x2) x2 = cur.x + pad;
    if (cur.y + pad > y2) y2 = cur.y + pad;
    if (ex - pad < x1) x1 = ex - pad;
    if (ey - pad < y1) y1 = ey - pad;
    if (ex + pad > x2) x2 = ex + pad;
    if (ey + pad > y2) y2 = ey + pad;

    if (cur.depth >= maxDepth) {
      foliage.push({
        x: ex,
        y: ey,
        depth: cur.depth,
        size: cur.width * 2.6,
        phase: rand() * Math.PI * 2,
      });
      continue;
    }

    const depth = cur.depth + 1;
    const childLen = cur.length * lengthDecay;
    const childSpread = spreadTable[cur.depth];
    const level = depth / maxDepth;
    const sag = gravity * level * level;
    const childWidth = widthAt(depth, maxDepth, rootWidth);

    // 先左后右，与原版 [-1, 1] 的随机数消耗顺序一致
    const jl = (rand() - 0.5) * 2 * jitter * (0.3 + 0.7 * level);
    branches.push({
      x: ex,
      y: ey,
      angle: cur.angle + -childSpread + jl + sag,
      length: childLen,
      depth,
      width: childWidth,
    });
    const jr = (rand() - 0.5) * 2 * jitter * (0.3 + 0.7 * level);
    branches.push({
      x: ex,
      y: ey,
      angle: cur.angle + childSpread + jr + sag,
      length: childLen,
      depth,
      width: childWidth,
    });
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

const BARK_STOPS: readonly (readonly [number, number, number])[] = [
  [90, 68, 51],
  [154, 119, 72],
  [232, 199, 154],
];

/** 季节色标度：根干偏冷褐 → 中段暖金 → 末梢偏亮琥珀。分量恒在 0..255。 */
export function barkColor(t: number): readonly [number, number, number] {
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const i = u <= 0.5 ? 0 : 1;
  const a = BARK_STOPS[i];
  const b = BARK_STOPS[i + 1];
  const v = u <= 0.5 ? u * 2 : (u - 0.5) * 2;
  return [
    clampByte(a[0] + (b[0] - a[0]) * v),
    clampByte(a[1] + (b[1] - a[1]) * v),
    clampByte(a[2] + (b[2] - a[2]) * v),
  ];
}

const FOLIAGE_WARM: readonly [number, number, number] = [232, 196, 120];
const FOLIAGE_COOL: readonly [number, number, number] = [168, 226, 255];

/** 光点颜色：根部的暗金 → 梢部的冷青白。分量恒在 0..255。 */
export function foliageColor(t: number): readonly [number, number, number] {
  const a = FOLIAGE_WARM;
  const b = FOLIAGE_COOL;
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

/** 光点色带数：按树冠高度由下到上 暖金 → 冷青白。 */
const FOLIAGE_BUCKETS = 4;
/** 同时闪烁的树冠星子上限。 */
const TWINKLE_COUNT = 40;
/** bloom 光晕半径 = 光点尺寸 × 该倍数，也是缓存留边的下限依据。 */
const BLOOM_RADIUS = 6.5;
/** 树根地面光池的纵横压扁比。 */
const ROOT_POOL_SQUASH = 0.34;
/** 缓存分辨率（设备像素 / 局部单位）的下限，以及单边像素上限（保护显存）。 */
const MIN_BAKE_RES = 0.25;
const MAX_BAKE_DIM = 2048;

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

// ── 几何派生数据：换树时一次性算好，之后烘焙与每帧绘制都不再遍历/重算 ──────────

interface PreparedTree {
  readonly geometry: TreeGeometry;
  readonly maxD: number;
  /** 每根枝干的线段端点 [x0, y0, x1, y1, ...]。 */
  readonly seg: Float32Array;
  readonly layerStart: Int32Array;
  readonly layerEnd: Int32Array;
  readonly layerWidth: Float32Array;
  /** 光点按色带分组后的紧凑数组 [x, y, size, phase, ...]，色带区间见 bucketStart。 */
  readonly foliage: Float32Array;
  readonly foliageCount: number;
  readonly bucketStart: Int32Array;
  /** 抽样出的闪烁星子 [x, y, size, phase, ...]。 */
  readonly twinkle: Float32Array;
  readonly twinkleCount: number;
  /** 包围盒中心 / 尺寸。 */
  readonly midX: number;
  readonly midY: number;
  readonly geoW: number;
  readonly geoH: number;
  /** 离屏缓存覆盖的局部矩形（包围盒 + 留边）。 */
  readonly rectX: number;
  readonly rectY: number;
  readonly rectW: number;
  readonly rectH: number;
  /** 受显存上限约束的最大烘焙分辨率。 */
  readonly maxBakeRes: number;
  readonly crown: { cx: number; cy: number; rx: number; ry: number };
  readonly pool: { rx: number; ry: number };
}

function frac(v: number): number {
  return v - Math.floor(v);
}

function prepareTree(g: TreeGeometry): PreparedTree {
  const { branches, foliage } = g;
  const { x1, y1, x2, y2 } = g.bounds;
  const geoW = Math.max(1, x2 - x1);
  const geoH = Math.max(1, y2 - y1);
  const maxD = Math.max(1, Math.ceil(g.maxDepth));
  const n = branches.length;

  const seg = new Float32Array(n * 4);
  const layerStart = new Int32Array(maxD + 1).fill(-1);
  const layerEnd = new Int32Array(maxD + 1).fill(-1);
  const layerWidth = new Float32Array(maxD + 1);
  let maxBranchW = 0;
  for (let i = 0; i < n; i++) {
    const b = branches[i];
    const o = i * 4;
    seg[o] = b.x;
    seg[o + 1] = b.y;
    seg[o + 2] = b.x + Math.cos(b.angle) * b.length;
    seg[o + 3] = b.y + Math.sin(b.angle) * b.length;
    const d = b.depth;
    if (layerStart[d] === -1) {
      layerStart[d] = i;
      layerWidth[d] = b.width;
    }
    layerEnd[d] = i + 1;
    if (b.width > maxBranchW) maxBranchW = b.width;
  }

  // 光点：按「树冠高度 + 随机扰动」分入色带（下暖上冷），再计数排序成连续分组，
  // 烘焙时同一色带的 sprite 连续绘制，减少纹理切换。
  const nF = foliage.length;
  let minFy = Infinity;
  let maxFy = -Infinity;
  for (let i = 0; i < nF; i++) {
    const fy = foliage[i].y;
    if (fy < minFy) minFy = fy;
    if (fy > maxFy) maxFy = fy;
  }
  const fRange = Math.max(1e-6, maxFy - minFy);
  const bucketOf = new Uint8Array(nF);
  const bucketStart = new Int32Array(FOLIAGE_BUCKETS + 1);
  for (let i = 0; i < nF; i++) {
    const f = foliage[i];
    const t = (maxFy - f.y) / fRange + (frac(f.phase * 1.618034) - 0.5) * 0.22;
    const b = Math.min(FOLIAGE_BUCKETS - 1, Math.max(0, Math.floor(t * FOLIAGE_BUCKETS)));
    bucketOf[i] = b;
    bucketStart[b + 1]++;
  }
  for (let b = 0; b < FOLIAGE_BUCKETS; b++) bucketStart[b + 1] += bucketStart[b];
  const cursor = bucketStart.slice(0, FOLIAGE_BUCKETS);
  const packed = new Float32Array(nF * 4);
  let maxFoliage = 0;
  for (let i = 0; i < nF; i++) {
    const f = foliage[i];
    const o = cursor[bucketOf[i]]++ * 4;
    // 光点大小在 ±18% 内确定性浮动，树冠不再是整齐划一的点阵
    const size = f.size * (0.82 + 0.36 * frac(f.phase * 2.414214 + 0.37));
    packed[o] = f.x;
    packed[o + 1] = f.y;
    packed[o + 2] = size;
    packed[o + 3] = f.phase;
    if (size > maxFoliage) maxFoliage = size;
  }

  const twinkle = new Float32Array(TWINKLE_COUNT * 4);
  let twinkleCount = 0;
  if (nF > 0) {
    const stride = Math.max(1, Math.floor(nF / TWINKLE_COUNT));
    for (let i = stride >> 1; i < nF && twinkleCount < TWINKLE_COUNT; i += stride) {
      const f = foliage[i];
      const o = twinkleCount * 4;
      twinkle[o] = f.x;
      twinkle[o + 1] = f.y;
      twinkle[o + 2] = f.size;
      twinkle[o + 3] = f.phase;
      twinkleCount++;
    }
  }

  // 缓存留边：覆盖粗枝描边/落影、bloom 光晕与地面光池，保证任何光晕都不被画布边界裁切
  const poolRxWish = geoH * 0.22;
  const pad =
    Math.ceil(
      Math.max(maxBranchW * 4, maxFoliage * BLOOM_RADIUS, poolRxWish * ROOT_POOL_SQUASH + 2),
    ) + 4;
  const rectX = x1 - pad;
  const rectY = y1 - pad;
  const rectW = geoW + pad * 2;
  const rectH = geoH + pad * 2;

  const midX = (x1 + x2) * 0.5;
  const crownCy = y1 + geoH * 0.4;
  const poolRx = Math.max(1, Math.min(poolRxWish, pad - x1 - 1, x2 + pad - 1));
  const poolRy = Math.max(1, Math.min(poolRx * ROOT_POOL_SQUASH, y2 + pad - 1));

  return {
    geometry: g,
    maxD,
    seg,
    layerStart,
    layerEnd,
    layerWidth,
    foliage: packed,
    foliageCount: nF,
    bucketStart,
    twinkle,
    twinkleCount,
    midX,
    midY: (y1 + y2) * 0.5,
    geoW,
    geoH,
    rectX,
    rectY,
    rectW,
    rectH,
    maxBakeRes: MAX_BAKE_DIM / Math.max(rectW, rectH),
    crown: {
      cx: midX,
      cy: crownCy,
      rx: geoW * 0.5 + pad * 0.5,
      ry: Math.min(geoH * 0.46, crownCy - rectY),
    },
    pool: { rx: poolRx, ry: poolRy },
  };
}

// ── Sprite：全局只建一次，所有实例共享 ─────────────────────────────────────

interface SpriteSet {
  /** 每个色带一张高斯光晕。 */
  readonly halo: readonly HTMLCanvasElement[];
  /** 带四向星芒的闪烁星子。 */
  readonly star: HTMLCanvasElement;
}

let spriteCache: SpriteSet | null = null;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/** 高斯衰减的圆形光晕，alpha 在边缘精确归零，无硬边。 */
function makeHaloSprite(col: readonly [number, number, number], px = 64): HTMLCanvasElement {
  const cv = makeCanvas(px, px);
  const c = cv.getContext('2d');
  if (!c) return cv;
  const h = px / 2;
  const g = c.createRadialGradient(h, h, 0, h, h, h);
  const edge = Math.exp(-5);
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    g.addColorStop(t, rgba(col, (Math.exp(-5 * t * t) - edge) / (1 - edge)));
  }
  c.fillStyle = g;
  c.fillRect(0, 0, px, px);
  return cv;
}

function makeStarSprite(px = 96): HTMLCanvasElement {
  const cv = makeCanvas(px, px);
  const c = cv.getContext('2d');
  if (!c) return cv;
  const h = px / 2;
  const glow = c.createRadialGradient(h, h, 0, h, h, h);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.09, 'rgba(238,248,255,0.92)');
  glow.addColorStop(0.26, 'rgba(150,215,255,0.30)');
  glow.addColorStop(0.58, 'rgba(125,211,252,0.07)');
  glow.addColorStop(1, 'rgba(125,211,252,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, px, px);

  // 四向星芒：两片垂直交叉、两端收尖的细长透镜
  c.translate(h, h);
  for (let k = 0; k < 2; k++) {
    const lg = c.createLinearGradient(-h, 0, h, 0);
    lg.addColorStop(0, 'rgba(200,235,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    lg.addColorStop(1, 'rgba(200,235,255,0)');
    c.fillStyle = lg;
    c.beginPath();
    c.moveTo(-h, 0);
    c.quadraticCurveTo(0, -px * 0.05, h, 0);
    c.quadraticCurveTo(0, px * 0.05, -h, 0);
    c.fill();
    c.rotate(Math.PI / 2);
  }
  return cv;
}

function getSprites(): SpriteSet {
  if (spriteCache) return spriteCache;
  const halo: HTMLCanvasElement[] = [];
  for (let b = 0; b < FOLIAGE_BUCKETS; b++) {
    halo.push(makeHaloSprite(foliageColor((b + 0.5) / FOLIAGE_BUCKETS)));
  }
  spriteCache = { halo, star: makeStarSprite() };
  return spriteCache;
}

/** 以 sprite 为模板批量盖章所有光点（按色带分组，同色带连续绘制）。 */
function stampFoliage(
  c: CanvasRenderingContext2D,
  p: PreparedTree,
  sprites: readonly HTMLCanvasElement[],
  radiusMul: number,
): void {
  const f = p.foliage;
  for (let b = 0; b < FOLIAGE_BUCKETS; b++) {
    const sprite = sprites[b];
    const end = p.bucketStart[b + 1];
    for (let i = p.bucketStart[b]; i < end; i++) {
      const o = i * 4;
      const r = f[o + 2] * radiusMul;
      c.drawImage(sprite, f[o] - r, f[o + 1] - r, r * 2, r * 2);
    }
  }
}

type GlowStops = readonly (readonly [number, string])[];

/** 椭圆径向光斑。渐变终点必须与前一档同色相、零透明度，否则透明插值会产生灰边。 */
function fillEllipseGlow(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  stops: GlowStops,
): void {
  c.save();
  c.translate(cx, cy);
  c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g;
  c.fillRect(-rx, -rx, rx * 2, rx * 2);
  c.restore();
}

const CROWN_STOPS: GlowStops = [
  [0, 'rgba(125,211,252,0.13)'],
  [0.55, 'rgba(150,185,240,0.05)'],
  [1, 'rgba(125,211,252,0)'],
];
const POOL_STOPS: GlowStops = [
  [0, 'rgba(255,214,140,0.34)'],
  [0.4, 'rgba(232,170,96,0.12)'],
  [1, 'rgba(232,170,96,0)'],
];
const BLOOM_CROWN_STOPS: GlowStops = [
  [0, 'rgba(140,215,255,0.12)'],
  [0.6, 'rgba(160,190,245,0.04)'],
  [1, 'rgba(140,215,255,0)'],
];

interface BakedLayer {
  readonly canvas: HTMLCanvasElement;
  /** 设备像素 / 局部单位。 */
  readonly res: number;
}

function releaseLayer(l: BakedLayer | null): void {
  // 显式清零尺寸，让浏览器（尤其 Safari）立刻回收画布后备存储
  if (l) {
    l.canvas.width = 0;
    l.canvas.height = 0;
  }
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
  /** 是否有常驻动效（呼吸 / 摇曳 / bloom / 闪烁）。否则只在视口变化时按需重绘。 */
  private readonly animated: boolean;
  private readonly params: Partial<Omit<TreeParams, 'rand'>> | undefined;

  private prep: PreparedTree;
  private body: BakedLayer | null = null;
  private bloom: BakedLayer | null = null;

  private treeNode: cytoscape.NodeSingular | null = null;
  private treeHeight = 220;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  private rafId: number | null = null;
  private dirty = true;
  /** 画布上当前有内容（下一帧才需要 clearRect）。 */
  private painted = false;
  private destroyed = false;
  private startedAt = 0;
  private lastDrawAt = 0;
  private resizeObserver: ResizeObserver | null = null;

  private readonly onVisibility = (): void => {
    if (document.hidden) this.cancelFrame();
    else this.markDirty();
  };

  /** Cytoscape 视口 / 尺寸变化 → 标脏并排一帧。 */
  private readonly markDirty = (): void => {
    this.dirty = true;
    this.requestFrame();
  };

  constructor(options: FractalTreeOverlayOptions) {
    this.cy = options.cy;
    this.params = options.params;
    this.swaySeconds = Math.max(0, options.swaySeconds ?? 0);
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.animated = this.swaySeconds > 0 && !this.reducedMotion;

    this.prep = prepareTree(
      generateTree({
        ...DEFAULT_TREE_PARAMS,
        ...options.params,
        rand: mulberry32(0x5eed),
      }),
    );
    this.treeHeight = options.height ?? pickHeight(this.cy);

    this.treeNode = spawnTreeNode(this.cy, this.prep.geometry, this.treeHeight);

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
        this.markDirty();
      });
      this.resizeObserver.observe(container);
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    this.cy.on('render viewport resize', this.markDirty);

    this.startedAt = performance.now();
    this.markDirty();
  }

  /** 换一棵新树（换 seed 重生成），并把命中盒同步到新树形。 */
  reseed(): void {
    this.prep = prepareTree(
      generateTree({ ...DEFAULT_TREE_PARAMS, ...this.params, rand: Math.random }),
    );
    this.releaseLayers();
    const node = this.getTreeNode();
    if (node) {
      stripNodeChrome(node, hitboxSize(this.prep.geometry, this.treeHeight));
    }
    this.markDirty();
  }

  /** 传送到新的随机起点；命中盒跟着新位置重新同步。 */
  reroll(): void {
    const node = this.getTreeNode();
    if (!node || !isElementShown(node)) return;
    const { x, y } = pickSpawnPoint(this.cy);
    node.position({ x, y });
    stripNodeChrome(node, hitboxSize(this.prep.geometry, this.treeHeight));
    this.markDirty();
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelFrame();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.cy.off('render viewport resize', this.markDirty);
    this.releaseLayers();
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
    this.painted = false;
    // 改画布尺寸会重置 2D 上下文状态，需重新设置
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    }
  }

  // ── 调度 ──────────────────────────────────────────────────────────────────

  private requestFrame(): void {
    if (this.rafId !== null || this.destroyed || document.hidden) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private cancelFrame(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private readonly tick = (now: number): void => {
    this.rafId = null;
    if (this.destroyed) return;
    // 容差 2ms：60Hz 屏上相邻两帧恰好 33.3ms，浮点误差会让「>= 33.33」偶发不成立而掉到 20fps
    const due = now - this.lastDrawAt >= this.frameInterval - 2;
    if (this.dirty || (this.animated && due)) {
      this.dirty = false;
      this.lastDrawAt = now;
      this.draw(this.animated ? (now - this.startedAt) / 1000 : 0);
    }
    if (this.animated) this.requestFrame();
  };

  // ── 离屏高速合批烘焙 ──────────────────────────────────────────────────

  private releaseLayers(): void {
    releaseLayer(this.body);
    releaseLayer(this.bloom);
    this.body = null;
    this.bloom = null;
  }

  /**
   * 取本体缓存。烘焙分辨率跟随屏幕实际缩放，按半个倍频程（×√2）分档，过采样最多 1.41 倍：
   *   · 需要的分辨率超过缓存（会糊）→ 重烘；
   *   · 缓存比所需分档大一倍以上（浪费且缩小采样易闪）→ 重烘；
   *   · 其余情况复用。这个滞回区间保证连续缩放手势里只会在跨档时重烘。
   */
  private ensureBody(need: number): BakedLayer | null {
    const maxRes = this.prep.maxBakeRes;
    const capped = Math.min(need, maxRes);
    const wanted = Math.min(
      Math.max(2 ** (Math.ceil(Math.log2(capped) * 2) / 2), MIN_BAKE_RES),
      maxRes,
    );
    const cur = this.body;
    if (cur && cur.res >= capped * 0.98 && cur.res <= wanted * 2) return cur;

    const baked = this.bakeBody(wanted);
    if (!baked) return cur;
    releaseLayer(cur);
    releaseLayer(this.bloom);
    this.bloom = null;
    this.body = baked;
    return baked;
  }

  private ensureBloom(body: BakedLayer): BakedLayer | null {
    if (!this.bloom) this.bloom = this.bakeBloom(Math.max(MIN_BAKE_RES, body.res * 0.5));
    return this.bloom;
  }

  /** 建一张覆盖 prep.rect 的离屏画布，并把局部坐标系映射好。 */
  private createLayerContext(
    res: number,
  ): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } | null {
    const p = this.prep;
    const cv = makeCanvas(
      Math.max(1, Math.ceil(p.rectW * res)),
      Math.max(1, Math.ceil(p.rectH * res)),
    );
    const c = cv.getContext('2d');
    if (!c) return null;
    const sx = cv.width / p.rectW;
    const sy = cv.height / p.rectH;
    c.setTransform(sx, 0, 0, sy, -p.rectX * sx, -p.rectY * sy);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    return { cv, c };
  }

  /**
   * 静态本体层：环境光 → 树冠辉光 → 落影 → 枝干本体与受光高光 → 末梢光点。
   * 利用 BFS 按 depth 连续的特性，每个深度层合并成一条 Path2D，
   * 辉光 / 落影 / 本体 / 高光共用同一条 Path2D，不再重复构建路径。
   */
  private bakeBody(res: number): BakedLayer | null {
    const made = this.createLayerContext(res);
    if (!made) return null;
    const { cv, c } = made;
    const p = this.prep;
    const { maxD, seg, layerStart, layerEnd, layerWidth } = p;

    // 1. 环境光：贴合树形的椭圆星云 + 压扁的地面暖光池（都已按画布范围夹紧，不会被裁切）
    fillEllipseGlow(c, p.crown.cx, p.crown.cy, p.crown.rx, p.crown.ry, CROWN_STOPS);
    fillEllipseGlow(c, 0, 0, p.pool.rx, p.pool.ry, POOL_STOPS);

    // 2. 每个深度层一条 Path2D
    const paths: (Path2D | null)[] = new Array(maxD + 1).fill(null);
    for (let d = 0; d <= maxD; d++) {
      const start = layerStart[d];
      if (start === -1) continue;
      const path = new Path2D();
      for (let i = start, end = layerEnd[d]; i < end; i++) {
        const o = i * 4;
        path.moveTo(seg[o], seg[o + 1]);
        path.lineTo(seg[o + 2], seg[o + 3]);
      }
      paths[d] = path;
    }

    // 3. 树冠细枝生物荧光：全部垫在枝条本体之下（原版逐层交错，辉光会盖在更深一层的枝条上）
    for (let d = maxD; d >= 0; d--) {
      const path = paths[d];
      const dep = d / maxD;
      if (!path || dep <= 0.52) continue;
      const glowWeight = (dep - 0.52) / 0.48;
      c.strokeStyle = rgba(foliageColor(dep), 0.14 * glowWeight);
      c.lineWidth = layerWidth[d] * 3.6;
      c.stroke(path);
    }

    // 4. 枝干本体：由末梢向主干绘制，主干压在最上层
    for (let d = maxD; d >= 0; d--) {
      const path = paths[d];
      if (!path) continue;
      const dep = d / maxD;
      const w = layerWidth[d];

      // 落影（右下偏移）：只给粗枝，让重叠枝条之间有层次、与底图分离
      if (w >= 1.1) {
        c.save();
        c.translate(w * 0.14, w * 0.18);
        c.strokeStyle = `rgba(6,8,16,${0.34 * (1 - dep)})`;
        c.lineWidth = w * 1.16;
        c.stroke(path);
        c.restore();
      }

      c.strokeStyle = rgba(barkColor(dep), 0.66 + 0.32 * dep);
      c.lineWidth = w;
      c.stroke(path);

      // 受光面高光（偏左上的暖金细线）：粗枝越靠近树干越亮，形成圆柱体积感
      if (dep < 0.48) {
        const lit = 1 - dep / 0.48;
        c.save();
        c.translate(-w * 0.16, -w * 0.06);
        c.strokeStyle = `rgba(255,236,200,${0.1 + 0.3 * lit})`;
        c.lineWidth = Math.max(0.5, w * 0.28);
        c.stroke(path);
        c.restore();
      }
    }

    // 5. 末梢光点：高斯光晕 sprite（加色混合，枝梢密集处自然更亮）+ 一次批量填充的亮核
    if (p.foliageCount > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.25;
      stampFoliage(c, p, getSprites().halo, 2.6);
      c.restore();

      const f = p.foliage;
      c.beginPath();
      for (let i = 0; i < p.foliageCount; i++) {
        const o = i * 4;
        const r = f[o + 2] * 0.4;
        c.moveTo(f[o] + r, f[o + 1]);
        c.arc(f[o], f[o + 1], r, 0, TAU);
      }
      c.fillStyle = 'rgba(240,249,255,0.85)';
      c.fill();
    }

    return { canvas: cv, res };
  }

  /**
   * 动态 bloom 层：只含树冠大范围柔光与光点外晕，以 1/2 分辨率烘焙（本身就是软光，
   * 不需要高分辨率）。运行时用加色混合叠在本体上，仅调节 globalAlpha 就能得到随呼吸
   * 明暗变化的树冠光，而不会像「整层再叠一遍」那样把树干也一起提亮。
   */
  private bakeBloom(res: number): BakedLayer | null {
    const made = this.createLayerContext(res);
    if (!made) return null;
    const { cv, c } = made;
    const p = this.prep;

    c.globalCompositeOperation = 'lighter';
    fillEllipseGlow(c, p.crown.cx, p.crown.cy, p.crown.rx, p.crown.ry, BLOOM_CROWN_STOPS);
    if (p.foliageCount > 0) {
      // 2048 个光晕加色叠加，树冠密处会重叠近十层，单个强度必须很低才不会过曝成一团白
      c.globalAlpha = 0.032;
      stampFoliage(c, p, getSprites().halo, BLOOM_RADIUS);
    }
    return { canvas: cv, res };
  }

  // ── 绘制 ──────────────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 全画布擦除，彻底根除平移/缩放残影；画布上本来就是空的就不必再擦
    if (this.painted) {
      ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
      this.painted = false;
    }

    const node = this.getTreeNode();
    if (!node || !isElementShown(node)) return;

    const pos = node.renderedPosition();
    const zoom = this.cy.zoom();
    const H = Math.max(this.treeHeight * zoom, 24);
    if (!Number.isFinite(H) || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    const rx = pos.x;
    const ry = pos.y;

    const p = this.prep;
    const scale = H / p.geoH;
    const hw = (p.rectW * scale) / 2;
    const hh = (p.rectH * scale) / 2;

    // 视口外整棵树不画（留 8% 余量给摇曳与呼吸）
    const mw = hw * 1.08;
    const mh = hh * 1.08;
    if (rx + mw < 0 || rx - mw > this.cssWidth || ry + mh < 0 || ry - mh > this.cssHeight) {
      return;
    }

    const body = this.ensureBody(scale * this.dpr);
    if (!body) return;

    const animated = this.animated;
    const omega = animated ? TAU / this.swaySeconds : 0;
    let breathe = 1;
    let shear = 0;
    if (animated) {
      breathe = 1 + 0.012 * Math.sin(t * omega);
      // 以树根为不动点的水平剪切 = 树冠整体摇曳；两个不同频率叠加，避免机械的单摆感
      shear = 0.014 * Math.sin(t * omega * 0.62) + 0.006 * Math.sin(t * omega * 1.7 + 1.3);
    }

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(scale * breathe, scale * breathe);
    ctx.translate(-p.midX, -p.midY);
    if (shear !== 0) ctx.transform(1, 0, shear, 1, 0, 0);

    ctx.drawImage(body.canvas, p.rectX, p.rectY, p.rectW, p.rectH);

    if (animated) {
      ctx.globalCompositeOperation = 'lighter';

      const bloom = this.ensureBloom(body);
      if (bloom) {
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * omega);
        ctx.drawImage(bloom.canvas, p.rectX, p.rectY, p.rectW, p.rectH);
      }

      // 抽样的树冠星子异步闪烁：共用一张 sprite，只改位置/尺寸/透明度
      const star = getSprites().star;
      const tw = p.twinkle;
      const twOmega = omega * 2.5;
      for (let i = 0; i < p.twinkleCount; i++) {
        const o = i * 4;
        const s = Math.sin(t * twOmega + tw[o + 3]);
        if (s <= 0.12) continue;
        const e = (s - 0.12) / 0.88;
        const k = e * e * (3 - 2 * e); // smoothstep：亮起与熄灭都更柔和
        const r = tw[o + 2] * (3.2 + 5.2 * k);
        ctx.globalAlpha = 0.25 + 0.7 * k;
        ctx.drawImage(star, tw[o] - r, tw[o + 1] - r, r * 2, r * 2);
      }
    }

    ctx.restore();
    this.painted = true;
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