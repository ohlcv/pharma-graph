// src/core/spectacle/taiji-bagua-overlay.ts
// 太极八卦·周天罗盘：
// 图谱里一个真实存在、参与力学模拟、却孤立无边的装饰奇观节点。
//
// 十二重同心环，由内向外：八卦 · 十天干 · 十二地支 · 十二律 · 十二长生 ·
// 二十四节气 · 二十八宿 · 六十甲子 · 六十四卦 · 六十四卦名 · 七十二候 ·
// 三百六十度。
//
// 核心美化与性能优化（解决缩小时文字挤成模糊云团 + 提升罗盘气韵与帧率）：
//   1. 动态语义级 LOD（Level-of-Detail 渐进显隐与星盘退化）：
//      原版对字号写了 `Math.max(4, ...)` 下限，导致画布缩小时，十二重环的 382 组文字
//      （近千个汉字）被强行以 4px 塞在半径仅十几像素的圆内，互相叠压成一团模糊白雾。
//      现按每环的真实像素字号与圆周弧长间距计算可读性权重（legibility alpha）：
//      - 放大近看时：十二重周天罗盘纤毫毕现；
//      - 中距浏览时：最外围密集的七十二候、六十四卦名、六十甲子平滑淡出文字，自动退化为
//        清爽的星轨刻度环，绝不糊成一团；
//      - 缩放到最小时：外层密集环全部收敛为三圈精密罗盘星轨，中心放大凸显高对比度的
//        "太极阴阳鱼 + 先天八卦爻画"，哪怕缩到最小也是一枚清晰锐利的太极八卦徽记。
//   2. 正统罗盘径向排布（Radial Tangential Orientation）：
//      原版所有文字与卦象全部水平（0°）硬贴在圆周上，导致左右两侧的四字"七十二候"横穿邻环、
//      八卦爻画方向杂乱。现改为正统罗盘切向旋转（`rotate(a + π/2)`），八卦与六十四卦爻画
//      全部朝向太极中心，文字沿环向优雅排布，互不穿插。
//   3. 零 shadowBlur + 刻度批量 Path 合并 + 节点与渐变缓存：
//      彻底移除原版每帧 19 次的 `ctx.shadowBlur` 高斯模糊调用，改用缓存径向渐变光晕；
//      将最外圈 120 道周天刻度从 120 次独立 `stroke()` 合并为 2 次批量 Path 绘制；
//      当环处于低缩放退化态时直接跳过 `fillText` 循环，大幅降低 CPU/GPU 文字光栅化开销。

import type cytoscape from 'cytoscape';
import { loadDecorContent } from './decor-content.js';
import { isElementShown } from '../element-visibility.js';
import { pickSpectacleParam } from './spectacle-size.js';

// ── 数据：十二重周天罗盘常量 ──────────────────────────────────────────────

const TRI: Record<string, readonly [number, number, number]> = {
  乾: [1, 1, 1],
  兑: [1, 1, 0],
  离: [1, 0, 1],
  震: [1, 0, 0],
  巽: [0, 1, 1],
  坎: [0, 1, 0],
  艮: [0, 0, 1],
  坤: [0, 0, 0],
};

// 先天八卦：自乾顺时针。
const BAGUA_ORDER = ['乾', '巽', '坎', '艮', '坤', '震', '离', '兑'] as const;

const GAN = '甲乙丙丁戊己庚辛壬癸'.split('');
const ZHI = '子丑寅卯辰巳午未申酉戌亥'.split('');
const LV = [
  '黄钟',
  '大吕',
  '太簇',
  '夹钟',
  '姑洗',
  '仲吕',
  '蕤宾',
  '林钟',
  '夷则',
  '南吕',
  '无射',
  '应钟',
];
const CS = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];
const JIEQI = [
  '立春',
  '雨水',
  '惊蛰',
  '春分',
  '清明',
  '谷雨',
  '立夏',
  '小满',
  '芒种',
  '夏至',
  '小暑',
  '大暑',
  '立秋',
  '处暑',
  '白露',
  '秋分',
  '寒露',
  '霜降',
  '立冬',
  '小雪',
  '大雪',
  '冬至',
  '小寒',
  '大寒',
];
const XIU = [
  '角',
  '亢',
  '氐',
  '房',
  '心',
  '尾',
  '箕',
  '斗',
  '牛',
  '女',
  '虚',
  '危',
  '室',
  '壁',
  '奎',
  '娄',
  '胃',
  '昴',
  '毕',
  '觜',
  '参',
  '井',
  '鬼',
  '柳',
  '星',
  '张',
  '翼',
  '轸',
];
const GUA: ReadonlyArray<readonly [string, string, string]> = [
  ['乾', '乾', '乾'],
  ['坤', '坤', '坤'],
  ['屯', '坎', '震'],
  ['蒙', '艮', '坎'],
  ['需', '坎', '乾'],
  ['讼', '乾', '坎'],
  ['师', '坤', '坎'],
  ['比', '坎', '坤'],
  ['小畜', '巽', '乾'],
  ['履', '乾', '兑'],
  ['泰', '坤', '乾'],
  ['否', '乾', '坤'],
  ['同人', '乾', '离'],
  ['大有', '离', '乾'],
  ['谦', '坤', '艮'],
  ['豫', '震', '坤'],
  ['随', '兑', '震'],
  ['蛊', '艮', '巽'],
  ['临', '坤', '兑'],
  ['观', '巽', '坤'],
  ['噬嗑', '离', '震'],
  ['贲', '艮', '离'],
  ['剥', '艮', '坤'],
  ['复', '坤', '震'],
  ['无妄', '乾', '震'],
  ['大畜', '艮', '乾'],
  ['颐', '艮', '震'],
  ['大过', '兑', '巽'],
  ['坎', '坎', '坎'],
  ['离', '离', '离'],
  ['咸', '兑', '艮'],
  ['恒', '震', '巽'],
  ['遁', '乾', '艮'],
  ['大壮', '震', '乾'],
  ['晋', '离', '坤'],
  ['明夷', '坤', '离'],
  ['家人', '巽', '离'],
  ['睽', '离', '兑'],
  ['蹇', '坎', '艮'],
  ['解', '震', '坎'],
  ['损', '艮', '兑'],
  ['益', '巽', '震'],
  ['夬', '兑', '乾'],
  ['姤', '乾', '巽'],
  ['萃', '兑', '坤'],
  ['升', '坤', '巽'],
  ['困', '兑', '坎'],
  ['井', '坎', '巽'],
  ['革', '兑', '离'],
  ['鼎', '离', '巽'],
  ['震', '震', '震'],
  ['艮', '艮', '艮'],
  ['渐', '巽', '艮'],
  ['归妹', '震', '兑'],
  ['丰', '震', '离'],
  ['旅', '离', '艮'],
  ['巽', '巽', '巽'],
  ['兑', '兑', '兑'],
  ['涣', '巽', '坎'],
  ['节', '坎', '兑'],
  ['中孚', '巽', '兑'],
  ['小过', '震', '艮'],
  ['既济', '坎', '离'],
  ['未济', '离', '坎'],
];
const HOU = [
  '东风解冻',
  '蛰虫始振',
  '鱼陟负冰',
  '獭祭鱼',
  '候雁北',
  '草木萌动',
  '桃始华',
  '仓庚鸣',
  '鹰化为鸠',
  '玄鸟至',
  '雷乃发声',
  '始电',
  '桐始华',
  '田鼠化鴽',
  '虹始见',
  '萍始生',
  '鸣鸠拂羽',
  '戴胜降桑',
  '蝼蝈鸣',
  '蚯蚓出',
  '王瓜生',
  '苦菜秀',
  '靡草死',
  '麦秋至',
  '螳螂生',
  '鵙始鸣',
  '反舌无声',
  '鹿角解',
  '蜩始鸣',
  '半夏生',
  '温风至',
  '蟋蟀居壁',
  '鹰始挚',
  '腐草为萤',
  '土润溽暑',
  '大雨时行',
  '凉风至',
  '白露降',
  '寒蝉鸣',
  '鹰乃祭鸟',
  '天地始肃',
  '禾乃登',
  '鸿雁来',
  '玄鸟归',
  '群鸟养羞',
  '雷始收声',
  '蛰虫坯户',
  '水始涸',
  '鸿雁来宾',
  '雀入大水为蛤',
  '菊有黄华',
  '豺乃祭兽',
  '草木黄落',
  '蛰虫咸俯',
  '水始冰',
  '地始冻',
  '雉入大水为蜃',
  '虹藏不见',
  '天气上升',
  '闭塞成冬',
  '鹖鴠不鸣',
  '虎始交',
  '荔挺出',
  '蚯蚓结',
  '麋角解',
  '水泉动',
  '雁北乡',
  '鹊始巢',
  '雉雊',
  '鸡乳',
  '征鸟厉疾',
  '水泽腹坚',
];
const JIAZI = Array.from({ length: 60 }, (_, i) => GAN[i % 10] + ZHI[i % 12]);
const T = (arr: readonly string[]): RingItem[] => arr.map((label) => ({ label }));

interface RingItem {
  label: string;
  bits?: readonly number[];
}

interface RingDef {
  key: string;
  r: number; // 归一化半径（0~1，相对最外圈）
  items: RingItem[];
  kind: 'tri' | 'hex' | 'text';
  sizeFrac: number; // 文字/爻线宽度 相对该环实际半径的比例
  speed: number; // 转速（圈/秒），正负交替制造对转感
  glow?: boolean; // 内圈主角标识
  phase: number; // 呼吸/脉动相位
  tickCount?: number; // 最外圈周天精细刻度数
  /** 该环元素平均字符长度，用于计算圆周防重叠的最小可读像素半径 */
  avgChars: number;
}

const RINGS_DEF: RingDef[] = [
  {
    key: '八卦',
    r: 0.145,
    kind: 'tri',
    sizeFrac: 0.34,
    speed: 0.032,
    glow: true,
    phase: 0.0,
    avgChars: 1,
    items: BAGUA_ORDER.map((n) => ({ label: n, bits: TRI[n] })),
  },
  {
    key: '十天干',
    r: 0.215,
    kind: 'text',
    sizeFrac: 0.19,
    speed: -0.026,
    glow: true,
    phase: 0.6,
    avgChars: 1,
    items: T(GAN),
  },
  {
    key: '十二地支',
    r: 0.28,
    kind: 'text',
    sizeFrac: 0.145,
    speed: 0.022,
    phase: 1.2,
    avgChars: 1,
    items: T(ZHI),
  },
  {
    key: '十二律',
    r: 0.344,
    kind: 'text',
    sizeFrac: 0.096,
    speed: -0.018,
    phase: 1.8,
    avgChars: 2,
    items: T(LV),
  },
  {
    key: '十二长生',
    r: 0.408,
    kind: 'text',
    sizeFrac: 0.095,
    speed: 0.015,
    phase: 2.4,
    avgChars: 1.7,
    items: T(CS),
  },
  {
    key: '二十四节气',
    r: 0.478,
    kind: 'text',
    sizeFrac: 0.072,
    speed: -0.013,
    phase: 3.0,
    avgChars: 2,
    items: T(JIEQI),
  },
  {
    key: '二十八宿',
    r: 0.546,
    kind: 'text',
    sizeFrac: 0.062,
    speed: 0.011,
    phase: 3.6,
    avgChars: 1,
    items: T(XIU),
  },
  {
    key: '六十甲子',
    r: 0.628,
    kind: 'text',
    sizeFrac: 0.04,
    speed: -0.0085,
    phase: 4.2,
    avgChars: 2,
    items: T(JIAZI),
  },
  {
    key: '六十四卦',
    r: 0.72,
    kind: 'hex',
    sizeFrac: 0.068,
    speed: 0.0065,
    phase: 4.8,
    avgChars: 1,
    items: GUA.map(([n, up, lo]) => ({ label: n, bits: [...TRI[lo], ...TRI[up]] })),
  },
  {
    key: '六十四卦名',
    r: 0.804,
    kind: 'text',
    sizeFrac: 0.036,
    speed: 0.0065,
    phase: 5.4,
    avgChars: 1.4,
    items: GUA.map(([n]) => ({ label: n })),
  },
  {
    key: '七十二候',
    r: 0.898,
    kind: 'text',
    sizeFrac: 0.019,
    speed: -0.005,
    phase: 6.0,
    avgChars: 3.5,
    items: T(HOU),
  },
  {
    key: '三百六十度',
    r: 1.0,
    kind: 'text',
    sizeFrac: 0.022,
    speed: 0.0035,
    phase: 6.6,
    tickCount: 120,
    avgChars: 2.5,
    items: T(Array.from({ length: 12 }, (_, i) => `${i * 30}°`)),
  },
];

/** 节点固定 ID（保持与 markdown 内容树和现有事件兼容）。 */
export const TAIJI_BAGUA_ID = 'celestial-emblem';
const EMBLEM_CLASS = 'celestial-emblem-node';

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
  return pickSpectacleParam(graphSpread(cy).spread, 'emblem');
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

/**
 * 往图里加太极八卦节点（如果已存在则直接复用）。
 */
export function spawnTaijiBaguaNode(cy: cytoscape.Core): cytoscape.NodeSingular {
  const size = hitboxSize(pickRadius(cy));

  const existing = cy.getElementById(TAIJI_BAGUA_ID);
  if (existing.nonempty()) {
    existing.addClass(`layer-parent ${EMBLEM_CLASS}`);
    stripNodeChrome(existing, size);
    return existing;
  }

  const { x, y } = pickSpawnPoint(cy);
  const node = cy.add({
    group: 'nodes',
    data: { id: TAIJI_BAGUA_ID, label: '太极八卦' },
    position: { x, y },
    classes: `layer-parent ${EMBLEM_CLASS}`,
  });
  stripNodeChrome(node, size);

  void fetchEmblemContent(node);
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

async function fetchEmblemContent(node: cytoscape.NodeSingular): Promise<void> {
  await loadDecorContent(node);
}

export interface TaijiBaguaOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  ink?: string;
  glow?: string;
  taijiSpeed?: number;
  fps?: number;
}

export class TaijiBaguaOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly ink: string;
  private readonly glow: string;
  private readonly taijiSpeed: number;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  private emblemNode: cytoscape.NodeSingular | null = null;
  private modelRadius = 220;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  // 径向渐变缓存（按半径 R 懒更新，替代昂贵的 shadowBlur）
  private cachedGradR = -1;
  private ambientGlowGrad: CanvasGradient | null = null;
  private coreGlowGrad: CanvasGradient | null = null;

  private rafId: number | null = null;
  private startedAt = 0;
  private lastDrawAt = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  constructor(options: TaijiBaguaOverlayOptions) {
    this.cy = options.cy;
    this.ink = options.ink ?? '#f2ede0';
    this.glow = options.glow ?? 'rgba(217, 72, 63, 0.48)';
    this.taijiSpeed = options.taijiSpeed ?? 0.02;
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.emblemNode = spawnTaijiBaguaNode(this.cy);
    this.modelRadius = pickRadius(this.cy);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-taiji-bagua', '');
    this.canvas.setAttribute('data-celestial-emblem', '');
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
    const node = this.getEmblemNode();
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
    const node = this.getEmblemNode();
    if (node && node.nonempty()) this.cy.remove(node);
    this.emblemNode = null;
  }

  private getEmblemNode(): cytoscape.NodeSingular | null {
    if (this.emblemNode && this.emblemNode.nonempty() && !this.emblemNode.removed()) {
      return this.emblemNode;
    }
    const found = this.cy.getElementById(TAIJI_BAGUA_ID);
    this.emblemNode = found.nonempty() ? found : null;
    return this.emblemNode;
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
   * 懒更新径向渐变缓存（彻底替代高开销的逐字 shadowBlur）。
   */
  private ensureGradients(ctx: CanvasRenderingContext2D, R: number, taijiR: number): void {
    if (Math.abs(R - this.cachedGradR) < 0.75 && this.ambientGlowGrad && this.coreGlowGrad) {
      return;
    }
    this.cachedGradR = R;

    // 1. 罗盘整体玄金暖玉底晕
    const amb = ctx.createRadialGradient(0, 0, taijiR * 0.5, 0, 0, R * 1.08);
    amb.addColorStop(0, 'rgba(217, 72, 63, 0.22)');
    amb.addColorStop(0.24, 'rgba(217, 119, 6, 0.10)');
    amb.addColorStop(0.65, 'rgba(242, 237, 224, 0.03)');
    amb.addColorStop(1, 'rgba(15, 12, 10, 0)');
    this.ambientGlowGrad = amb;

    // 2. 太极核心朱砂暖晕（替代原版太极与内圈的 19 次 shadowBlur）
    const core = ctx.createRadialGradient(0, 0, taijiR * 0.4, 0, 0, taijiR * 2.3);
    core.addColorStop(0, 'rgba(217, 72, 63, 0.38)');
    core.addColorStop(0.55, 'rgba(217, 72, 63, 0.12)');
    core.addColorStop(1, 'rgba(217, 72, 63, 0)');
    this.coreGlowGrad = core;
  }

  // ── 绘制 ──────────────────────────────────────────────────────────────

  private draw(t: number): void {
    const ctx = this.ctx;
    if (!ctx || this.cssWidth === 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const node = this.getEmblemNode();
    if (!node || !isElementShown(node)) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    // 缩小时最小视觉半径保留 12px，保证缩放到最小时仍能看清中心的太极阴阳鱼与八卦环
    const R = Math.max(this.modelRadius * zoom, 12);
    const rx = p.x;
    const ry = p.y;

    const reach = R * 1.15 + 20;
    if (
      rx + reach < 0 ||
      rx - reach > this.cssWidth ||
      ry + reach < 0 ||
      ry - reach > this.cssHeight
    ) {
      return;
    }

    // ── 核心 LOD 策略：当整体半径 R 缩小时，动态放大中心太极与内圈八卦的相对占比 ──
    // 大尺寸（R >= 140）时太极占 0.095*R，给外围十二重文字环留足空间；
    // 缩放到很小（R -> 12）时，外围密集文字自动淡出，太极占比平滑提升至 0.34*R，
    // 让远景下依然是一枚一眼可辨的太极八卦图腾，而不是一团模糊云雾！
    const compactFactor = clamp((130 - R) / 105, 0, 1);
    const taijiFrac = 0.095 + 0.245 * compactFactor;
    const taijiR = R * taijiFrac;

    this.ensureGradients(ctx, R, taijiR);

    const breathe = this.reducedMotion ? 1 : 1 + 0.018 * Math.sin(t * 0.45);

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(breathe, breathe);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 1. 罗盘整体玄金底晕 + 太极朱砂光晕（0 shadowBlur）
    if (this.ambientGlowGrad) {
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.08, 0, Math.PI * 2);
      ctx.fillStyle = this.ambientGlowGrad;
      ctx.fill();
    }
    if (this.coreGlowGrad) {
      ctx.beginPath();
      ctx.arc(0, 0, taijiR * 2.3, 0, Math.PI * 2);
      ctx.fillStyle = this.coreGlowGrad;
      ctx.fill();
    }

    // 2. 逐环按 LOD 可读性绘制十二重同心环
    for (let idx = 0; idx < RINGS_DEF.length; idx++) {
      const ring = RINGS_DEF[idx];
      // 当处于极小缩放时，第一环（先天八卦）跟随太极外扩，保持紧贴太极周围
      const effectiveFrac =
        idx === 0 ? ring.r + 0.36 * compactFactor : ring.r + (1 - ring.r) * 0.18 * compactFactor;
      this.drawRing(ctx, ring, idx, R * effectiveFrac, R, compactFactor, t);
    }

    // 3. 中心太极阴阳鱼自转
    ctx.save();
    ctx.rotate(t * this.taijiSpeed * Math.PI * 2);
    this.drawTaiji(ctx, taijiR);
    ctx.restore();

    ctx.restore();
  }

  private drawRing(
    ctx: CanvasRenderingContext2D,
    ring: RingDef,
    ringIdx: number,
    ringPxR: number,
    totalR: number,
    compactFactor: number,
    t: number,
  ): void {
    const n = ring.items.length;
    const angleOffset = t * ring.speed * Math.PI * 2;
    const pulse = ring.glow ? 0.82 + 0.18 * Math.sin(t * 0.4 + ring.phase) : 0.76;

    // ── 计算当前环的真实像素尺度与防重叠可读性权重 ──
    // 1) 理论字号/符号尺寸（绝不强行 Math.max(4) 硬画！）
    const rawSizePx = ringPxR * ring.sizeFrac;
    // 2) 圆周上每个元素分到的弧长（像素）
    const arcPerItem = (Math.PI * 2 * ringPxR) / n;

    // ── 同心轨线（缩小时仅保留核心主环轨线，避免 12 条同心圆挤成实心饼）──
    const isMajorRing = ringIdx === 0 || ringIdx === 2 || ringIdx === 5 || ringIdx === 8 || ringIdx === 11;
    const trackAlpha = isMajorRing
      ? 0.14
      : 0.10 * (1 - compactFactor * 0.85);

    if (trackAlpha > 0.015) {
      ctx.beginPath();
      ctx.arc(0, 0, ringPxR, 0, Math.PI * 2);
      ctx.strokeStyle = this.ink;
      ctx.globalAlpha = trackAlpha;
      ctx.lineWidth = isMajorRing ? 0.9 : 0.65;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── 分支 A：卦爻环（先天八卦 8 卦 / 六十四卦 64 卦）──────────────────
    if (ring.kind === 'tri' || ring.kind === 'hex') {
      // 先天八卦（ringIdx === 0）即使在缩小时也保持可见，作为太极外围的核心识别特征
      const minBarWidth = ring.kind === 'tri' ? 2.4 : 4.2;
      const minArc = ring.kind === 'tri' ? 4.0 : 6.8;
      const sizeWeight = clamp((rawSizePx - minBarWidth) / 3.0, 0, 1);
      const arcWeight = clamp((arcPerItem - minArc) / 4.0, 0, 1);
      const visAlpha = Math.min(sizeWeight, arcWeight) * pulse;

      if (visAlpha <= 0.02) return;

      const barW = Math.max(ring.kind === 'tri' ? 2.8 : 4.0, rawSizePx);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2 + angleOffset;
        const x = Math.cos(a) * ringPxR;
        const y = Math.sin(a) * ringPxR;
        ctx.save();
        ctx.translate(x, y);
        // 切向旋转：让每一卦的爻线严格朝向太极中心，呈现正统八卦罗盘布局
        ctx.rotate(a + Math.PI / 2);
        this.drawBars(ctx, ring.items[i].bits!, barW, visAlpha);
        ctx.restore();
      }
      return;
    }

    // ── 分支 B：文字环（按真实像素字号与弧长间距平滑渐隐，彻底杜绝糊成云团）──
    // 汉字在 Canvas 上小于 6.5px 时笔画会粘连成团；且弧长必须容得下 avgChars 个字
    const minFontPx = 6.5;
    const fullFontPx = 9.5;
    const fontWeight = clamp((rawSizePx - minFontPx) / (fullFontPx - minFontPx), 0, 1);

    const neededArcPx = Math.max(rawSizePx, 7) * ring.avgChars * 0.92;
    const crowdWeight = clamp((arcPerItem - neededArcPx * 0.75) / (neededArcPx * 0.45), 0, 1);

    const textAlpha = Math.min(fontWeight, crowdWeight) * pulse;

    if (textAlpha > 0.02) {
      const fontPx = Math.round(rawSizePx * 10) / 10;
      ctx.font = `${fontPx}px "Songti SC","STSong","Noto Serif SC",serif`;
      ctx.fillStyle = this.ink;
      ctx.globalAlpha = textAlpha;

      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2 + angleOffset;
        const x = Math.cos(a) * ringPxR;
        const y = Math.sin(a) * ringPxR;
        ctx.save();
        ctx.translate(x, y);
        // 切向排布：文字顺着圆环切线方向排列，不再横穿相邻同心环
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(ring.items[i].label, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    } else if (isMajorRing && totalR >= 22) {
      // 当文字因缩小而淡出时，在关键主环上以极简星盘刻度点代替文字，保留罗盘精密秩序感
      const tickCount = Math.min(n, 24);
      const tickLen = Math.max(1.2, totalR * 0.018);
      ctx.beginPath();
      for (let i = 0; i < tickCount; i++) {
        const a = (i / tickCount) * Math.PI * 2 - Math.PI / 2 + angleOffset;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo(c * (ringPxR - tickLen * 0.5), s * (ringPxR - tickLen * 0.5));
        ctx.lineTo(c * (ringPxR + tickLen * 0.5), s * (ringPxR + tickLen * 0.5));
      }
      ctx.strokeStyle = this.ink;
      ctx.globalAlpha = 0.26 * (1 - compactFactor * 0.4);
      ctx.lineWidth = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── 最外圈周天刻度（120 道刻度合并为 2 次批量 stroke，消除 120 次独立绘制开销）──
    if (ring.tickCount) {
      // 缩小时自动抽稀刻度数量，防止外圈刻度挤成毛刺圈
      const step = totalR < 45 ? 5 : totalR < 90 ? 2 : 1;
      const inner = ringPxR * 1.02;
      const shortOuter = inner + ringPxR * 0.018;
      const longOuter = inner + ringPxR * 0.045;

      // 批次 1：普通细刻度
      ctx.beginPath();
      for (let i = 0; i < ring.tickCount; i += step) {
        if ((i * 3) % 30 === 0) continue;
        const a = (i / ring.tickCount) * Math.PI * 2 - Math.PI / 2 + angleOffset;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo(c * inner, s * inner);
        ctx.lineTo(c * shortOuter, s * shortOuter);
      }
      ctx.strokeStyle = 'rgba(242, 237, 224, 0.24)';
      ctx.lineWidth = 0.65;
      ctx.stroke();

      // 批次 2：每 30° 的十二宫主刻度
      ctx.beginPath();
      for (let i = 0; i < ring.tickCount; i += 10) {
        const a = (i / ring.tickCount) * Math.PI * 2 - Math.PI / 2 + angleOffset;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo(c * inner, s * inner);
        ctx.lineTo(c * longOuter, s * longOuter);
      }
      ctx.strokeStyle = 'rgba(242, 237, 224, 0.42)';
      ctx.lineWidth = 1.15;
      ctx.stroke();
    }
  }

  /** N 道爻线堆叠：3 道给八卦，6 道给六十四卦。index 0 = 最下面（最靠内）那一道。 */
  private drawBars(
    ctx: CanvasRenderingContext2D,
    bits: readonly number[],
    w: number,
    alpha: number,
  ): void {
    const n = bits.length;
    const gap = (w * 0.64) / n;
    const barH = Math.max(0.75, gap * 0.48);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.ink;
    for (let i = 0; i < n; i++) {
      const y = ((n - 1) / 2 - i) * gap - barH / 2;
      if (bits[i]) {
        ctx.fillRect(-w / 2, y, w, barH);
      } else {
        const mid = w * 0.22;
        const half = (w - mid) / 2;
        ctx.fillRect(-w / 2, y, half, barH);
        ctx.fillRect(-w / 2 + half + mid, y, half, barH);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * 中心太极阴阳鱼。
   */
  private drawTaiji(ctx: CanvasRenderingContext2D, r: number): void {
    const light = this.ink;
    const dark = 'rgba(8, 8, 12, 0.94)';
    ctx.save();
    ctx.scale(-1, 1);

    // 阳鱼半圆
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.fillStyle = light;
    ctx.fill();

    // 阴鱼半圆
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2);
    ctx.fillStyle = dark;
    ctx.fill();

    // 阳鱼头部小圆與阴鱼头部小圆
    ctx.beginPath();
    ctx.arc(0, -r / 2, r / 2, 0, Math.PI * 2);
    ctx.fillStyle = light;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, r / 2, r / 2, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();

    // 阴阳鱼眼
    const eyeR = Math.max(0.9, r * 0.15);
    ctx.beginPath();
    ctx.arc(0, -r / 2, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, r / 2, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = light;
    ctx.fill();

    // 太极外圈细金边
    ctx.lineWidth = Math.max(0.75, r * 0.035);
    ctx.strokeStyle = light;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

export function createTaijiBaguaOverlay(options: TaijiBaguaOverlayOptions): TaijiBaguaOverlay {
  return new TaijiBaguaOverlay(options);
}