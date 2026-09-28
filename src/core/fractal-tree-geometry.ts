// src/core/fractal-tree-geometry.ts
// 分形树的几何内核：L-system 风格递归生成的枝干骨架 + 季节色标度。
//
// 与 tesseract-overlay.ts / celestial-emblem-overlay.ts 的分工：那两个文件把
// 数学、canvas 绘制、节点生命周期、Markdown 加载全塞在一个类里。这里刻意把
// **几何抽成纯函数**，因为分形树的成败几乎全在参数上（分枝角度/长度衰减/
// 层级/粗细），必须能脱离浏览器反复试——把调参困在 canvas 类里就只能靠
// 肉眼反复刷页面。
//
// 分形树的自相似性说明：L-system 树严格说**不是分形**（粗枝分细枝，各层比例
// 不同，不是自相似）。它满足的是"近似自相似 + 层级递归"，视觉上属于分形家族，
// 但不要在文案里写成严格意义的分形。
//
// 坐标系：canvas y 轴向下，所以数学上"向上"是 -y。生成时以枝干朝上为正。

/** 枝干骨架的一段：从 (x, y) 出发，朝 angle（弧度）方向延伸 length。 */
export interface Branch {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length: number;
  /** 0 = 树干根，depth = maxDepth - 1 时是末梢。 */
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
  /** 0..1 的随机相位，让每个果实有独立的呼吸/闪烁节奏。 */
  readonly phase: number;
}

/** 一次生成的全部几何。所有坐标都在以树根为原点的局部系里，
 *  绘制时再平移到节点屏幕位置并按缩放变换。 */
export interface TreeGeometry {
  readonly branches: readonly Branch[];
  readonly foliage: readonly Foliage[];
  readonly maxDepth: number;
  /** 包围盒（局部系），用于按树形而不是按圆估算命中盒与视觉半径。 */
  readonly bounds: { x1: number; y1: number; x2: number; y2: number };
}

export interface TreeParams {
  /** 递归层数。10 → 2^10-1 = 1023 段枝；11 → 2047。 */
  readonly maxDepth: number;
  /** 每层长度衰减。0.75 = 每层枝干是父枝的 75%。 */
  readonly lengthDecay: number;
  /** 树干总长（局部系像素），最终视觉尺寸由调用方缩放。 */
  readonly trunkLength: number;
  /** 根部分枝角（弧度）。0.42 ≈ 24°。 */
  readonly spreadAngle: number;
  /**
   * 分枝角随深度的衰减指数。子枝实际角度 = spreadAngle × depthDecay^depth。
   *
   * 这个参数是树"看起来像树"的关键：角度恒定时每层都张开同样的扇面，
   * 到深层就叠成一团灌木噪点（实测 maxDepth≥10 时整幅糊掉）。真实树木
   * 是低层枝粗、角度大，高层枝细、角度小，且逐层收敛——加上衰减后
   * 深层自动趋于"沿父枝方向继续延伸"，树形立刻立得住。
   */
  readonly depthDecay: number;
  /** 每层在 ±spread 区间内再抖一点，避免机械对称。 */
  readonly jitter: number;
  /**
   * 枝条下垂：每生成一级子枝，角度额外向水平方向偏 gravity（弧度），
   * 让末梢有"被重力压弯"的趋势。0 = 完全不垂。
   */
  readonly gravity: number;
  /** 随机数注入，固定 seed → 完全可复现的树（截图/回归测试需要）。 */
  readonly rand: () => number;
}

/**
 * 默认参数。取值来自 tools/preview-fractal-tree.mjs 的参数网格实拍对比
 * （1182 节点图谱背景上、按视觉半径缩放后的观感），不是拍脑袋定的。
 *
 * 网格扫过 spreadAngle × depthDecay 两个维度，结论：
 *   - depthDecay 是决定性参数。=1.0（角度不随深度收缩）时深层叠成灌木噪点，
 *     完全看不出树的形态；0.68~0.75 之间主杆立得住、层次分明。
 *   - spreadAngle 控制冠幅开合，0.85 在 d11 下最舒展又不至于散成扇形。
 * 改这三个值前请先重跑一次参数网格看图，别只看数字。
 */
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
/** 粗细随长度的平方根缩放——比线性更接近真实树木（细枝不至于细到不可见）。 */
function widthAt(depth: number, maxDepth: number, rootWidth: number): number {
  const t = maxDepth === 0 ? 0 : depth / maxDepth;
  // t=0 → rootWidth；t=1 → rootWidth * TIP_WIDTH_RATIO
  return rootWidth * (1 - t + t * TIP_WIDTH_RATIO);
}

/**
 * 生成一棵树。
 *
 * 递归方向：从根往下走，每段枝生成两个子枝（左右各一），所以段数是 2^(n+1)-1。
 * maxDepth=10 → 2047 段。对 canvas 逐帧重绘来说偏多，故调用方通常
 * 配 30fps + 可见性暂停（与现有两个奇观一致）。
 */
export function generateTree(params: TreeParams = DEFAULT_TREE_PARAMS): TreeGeometry {
  const {
    maxDepth,
    lengthDecay,
    trunkLength,
    spreadAngle,
    depthDecay,
    jitter,
    gravity,
    rand,
  } = params;
  const branches: Branch[] = [];
  const foliage: Foliage[] = [];

  // 根粗细取树干长度的固定比例，这样改 trunkLength 时整棵树同比缩放。
  // 0.075 而非最初的 0.055：实拍发现在 1182 节点的图谱背景上，
  // 0.055 的根干细到与普通知识节点的描边同量级，树会「消失在节点群里」。
  // 粗细是树在密集背景中保持可辨识的主要手段，不能只靠颜色。
  const rootWidth = Math.max(1, trunkLength * 0.075);

  // 队列式递归（shift 而非 pop），避免 maxDepth 调大时爆栈。
  //
  // **必须用 FIFO 而非 LIFO**：LIFO 下同一根枝的左右两个子枝是连续压入、
  // 连续弹出的，配合固定 seed 时 `rand()` 的调用序列会与"哪一枝长在哪侧"
  // 强相关，整棵树稳定地偏向一侧（实拍：所有枝朝一个方向堆，像被风吹）。
  // FIFO 让同层枝的生成顺序按 BFS 展开，随机序列在左右两侧均匀分配。
  interface Pending {
    x: number;
    y: number;
    angle: number;
    length: number;
    depth: number;
  }
  // 根朝正上：canvas 的 y 轴向下，所以"向上"是 -PI/2。
  const UP = -Math.PI / 2;
  const queue: Pending[] = [{ x: 0, y: 0, angle: UP, length: trunkLength, depth: 0 }];
  // FIFO：每轮把已生成的子枝接到队尾，整体按 BFS 展开
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const w = widthAt(cur.depth, maxDepth, rootWidth);
    branches.push({ x: cur.x, y: cur.y, angle: cur.angle, length: cur.length, depth: cur.depth, width: w });

    // 枝干尖端的世界坐标
    const ex = cur.x + Math.cos(cur.angle) * cur.length;
    const ey = cur.y + Math.sin(cur.angle) * cur.length;

    if (cur.depth >= maxDepth) {
      // 末梢：挂一个小光点
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
    // 关键：分枝角随深度衰减。深层子枝趋于"贴着父枝方向延伸"，
    // 这是树形能立住、而不是糊成灌木噪点的原因。
    const childSpread = spreadAngle * Math.pow(depthDecay, cur.depth);
    // 枝条级深度决定该枝整体离"竖直"有多远——用它算重力下垂的累积量，
    // 让越靠梢的枝越接近水平（真实枝条被自身重量压平）。
    const level = (cur.depth + 1) / maxDepth;
    const sag = gravity * level * level;

    for (const dir of [-1, 1]) {
      // ±childSpread，再叠一点随机抖动。抖动幅度随层级递增——根部要稳，
      // 末梢可以野一点，这样树形有"根部收敛、梢部蓬松"的自然感。
      const j = (rand() - 0.5) * 2 * jitter * (0.3 + 0.7 * level);
      // dir 决定往哪边偏；两边都往"远离竖直方向"走 → 形成外张的伞形。
      queue.push({
        x: ex,
        y: ey,
        angle: cur.angle + dir * childSpread + j + sag,
        length: childLen,
        depth: cur.depth + 1,
      });
    }
  }

  // 局部包围盒：从枝段端点算，再把 rootWidth 的一半留出，避免最粗的树干切边
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const b of branches) {
    const ex = b.x + Math.cos(b.angle) * b.length;
    const ey = b.y + Math.sin(b.angle) * b.length;
    const pad = b.width / 2;
    if (b.x - pad < x1) x1 = b.x - pad;
    if (b.y - pad < y1) y1 = b.y - pad;
    if (ex + pad > x2) x2 = ex + pad;
    if (ey + pad > y2) y2 = ey + pad;
  }
  for (const f of foliage) {
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

/** 季节色标度：根干偏冷褐 → 中段暖金 → 末梢与光点偏亮青。
 *  深度越浅（越靠根）t 越小。
 *  返回 [r, g, b]，分量 0..255。
 *
 *  t 必须夹到 [0,1]——超范围时线性外推会算出负分量或 >255，产出非法
 *  CSS 颜色串。测试「色彩分量恒在 0..255」锁住这个行为。 */
export function barkColor(t: number): readonly [number, number, number] {
  // 三段控制点：#5a4433 → #9a7748 → #e8c79a
  // 比初版（#4a3728→#d9b382）整体提亮：深色背景上初版梢部不够跳，
  // 且根干几乎与背景同色，整棵树显得「没画完」。
  const stops: readonly (readonly [number, number, number])[] = [
    [90, 68, 51],
    [154, 119, 72],
    [232, 199, 154],
  ];
  const u = Math.max(0, Math.min(1, t));
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

/** 光点颜色：根部的暗金 → 梢部的冷青白。 */
export function foliageColor(t: number): readonly [number, number, number] {
  const a: readonly [number, number, number] = [232, 196, 120];
  const b: readonly [number, number, number] = [168, 226, 255];
  const u = Math.max(0, Math.min(1, t));
  return [
    clampByte(a[0] + (b[0] - a[0]) * u),
    clampByte(a[1] + (b[1] - a[1]) * u),
    clampByte(a[2] + (b[2] - a[2]) * u),
  ];
}

/** 夹到合法字节范围并取整。线性插值在 t 越界时能算出负数或 >255，
 *  直接拼进 `rgb()` 会得到浏览器忽略的非法颜色（静默画成黑色/上一次颜色）。 */
function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function rgba(c: readonly [number, number, number], alpha: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}
