// src/core/celestial-emblem-node.ts
// 太极八卦（及其余十重）：图谱里一个真实存在、参与力学模拟、却孤立无边的节点。
//
// 十二重同心环，由内向外：八卦 · 十天干 · 十二地支 · 十二律 · 十二长生 ·
// 二十四节气 · 二十八宿 · 六十甲子 · 六十四卦 · 六十四卦名 · 七十二候 ·
// 三百六十度。数据照搬原版 data.js（TRI / BAGUA / GAN / ZHI / LV / CS /
// JIEQI / XIU / GUA / HOU 均为原样迁入），只是渲染从"12 重 3D 网格纹理"
// 换成了"每帧直接在一张 2D canvas 上按角度画"，因为这里要的是一个能跟着
// cytoscape 缩放/平移的轻量奇观，不是独立的 WebGL 场景。
//
// 为什么是"真节点 + 覆盖层"：
//   - cytoscape 节点没法逐帧换贴图，旋转动画只能靠独立 canvas 画。
//   - "它在哪、多大"直接问真实节点要：node.renderedPosition() 已经把
//     zoom/pan 都算进去了，跟其它节点是同一套换算。
//   - 孤立 = 不接任何边。不 lock()——让 euler 布局把它当成真实的力学
//     参与者：没有弹簧拉着它，只受全图所有节点的斥力，物理模拟会把它推向
//     "最空旷的方向"。每次真正重新跑一次 euler 它都可能落在不同地方。
//   - 排除出"知识"：打上 `layer-parent` class——项目里已经在用的基础设施，
//     几十处 `.not('.layer-parent')`（搜索 / 统计 / 图例计数 / 漫游序列 /
//     dimUnhighlighted / force-drag 的手动拖拽模拟）自动把它排除，不需要
//     改任何一处现有逻辑。这不影响 renderer.ts 里 euler 自动布局——那是对
//     `this.cy`（全部元素）跑的，layer-parent 节点照样参与力学。
//
// ⚠️ 接入时机：main.ts 的 initGraphFromManager() 末尾有一段"从中心爆出"的
// 入场动画，会遍历 cy.nodes()（不筛选 layer-parent）把每个节点摆到 halo
// 环形位置。必须在那段循环【之后】再调用这里的创建函数，否则这个节点会被
// 一起摆到 halo 位置；同时又要赶在 finishStreamingLayout() 触发第一次
// euler 之【前】——即加在 initGraphFromManager() 函数体的最后几行。

import type cytoscape from 'cytoscape';
import { parse as yamlParse } from 'yaml';

// ── 数据：原样迁自 data.js ───────────────────────────────────────────────

const TRI: Record<string, readonly [number, number, number]> = {
  乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
  巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
};
// 先天八卦：自乾顺时针。
const BAGUA_ORDER = ['乾', '巽', '坎', '艮', '坤', '震', '离', '兑'] as const;

const GAN = '甲乙丙丁戊己庚辛壬癸'.split('');
const ZHI = '子丑寅卯辰巳午未申酉戌亥'.split('');
const LV = ['黄钟', '大吕', '太簇', '夹钟', '姑洗', '仲吕', '蕤宾', '林钟', '夷则', '南吕', '无射', '应钟'];
const CS = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];
const JIEQI = ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒'];
const XIU = ['角', '亢', '氐', '房', '心', '尾', '箕', '斗', '牛', '女', '虚', '危', '室', '壁', '奎', '娄', '胃', '昴', '毕', '觜', '参', '井', '鬼', '柳', '星', '张', '翼', '轸'];
const GUA: ReadonlyArray<readonly [string, string, string]> = [
  ['乾', '乾', '乾'], ['坤', '坤', '坤'], ['屯', '坎', '震'], ['蒙', '艮', '坎'], ['需', '坎', '乾'], ['讼', '乾', '坎'], ['师', '坤', '坎'], ['比', '坎', '坤'],
  ['小畜', '巽', '乾'], ['履', '乾', '兑'], ['泰', '坤', '乾'], ['否', '乾', '坤'], ['同人', '乾', '离'], ['大有', '离', '乾'], ['谦', '坤', '艮'], ['豫', '震', '坤'],
  ['随', '兑', '震'], ['蛊', '艮', '巽'], ['临', '坤', '兑'], ['观', '巽', '坤'], ['噬嗑', '离', '震'], ['贲', '艮', '离'], ['剥', '艮', '坤'], ['复', '坤', '震'],
  ['无妄', '乾', '震'], ['大畜', '艮', '乾'], ['颐', '艮', '震'], ['大过', '兑', '巽'], ['坎', '坎', '坎'], ['离', '离', '离'], ['咸', '兑', '艮'], ['恒', '震', '巽'],
  ['遁', '乾', '艮'], ['大壮', '震', '乾'], ['晋', '离', '坤'], ['明夷', '坤', '离'], ['家人', '巽', '离'], ['睽', '离', '兑'], ['蹇', '坎', '艮'], ['解', '震', '坎'],
  ['损', '艮', '兑'], ['益', '巽', '震'], ['夬', '兑', '乾'], ['姤', '乾', '巽'], ['萃', '兑', '坤'], ['升', '坤', '巽'], ['困', '兑', '坎'], ['井', '坎', '巽'],
  ['革', '兑', '离'], ['鼎', '离', '巽'], ['震', '震', '震'], ['艮', '艮', '艮'], ['渐', '巽', '艮'], ['归妹', '震', '兑'], ['丰', '震', '离'], ['旅', '离', '艮'],
  ['巽', '巽', '巽'], ['兑', '兑', '兑'], ['涣', '巽', '坎'], ['节', '坎', '兑'], ['中孚', '巽', '兑'], ['小过', '震', '艮'], ['既济', '坎', '离'], ['未济', '离', '坎'],
];
const HOU = ['东风解冻', '蛰虫始振', '鱼陟负冰', '獭祭鱼', '候雁北', '草木萌动', '桃始华', '仓庚鸣', '鹰化为鸠', '玄鸟至', '雷乃发声', '始电', '桐始华', '田鼠化鴽', '虹始见', '萍始生', '鸣鸠拂羽', '戴胜降桑', '蝼蝈鸣', '蚯蚓出', '王瓜生', '苦菜秀', '靡草死', '麦秋至', '螳螂生', '鵙始鸣', '反舌无声', '鹿角解', '蜩始鸣', '半夏生', '温风至', '蟋蟀居壁', '鹰始挚', '腐草为萤', '土润溽暑', '大雨时行', '凉风至', '白露降', '寒蝉鸣', '鹰乃祭鸟', '天地始肃', '禾乃登', '鸿雁来', '玄鸟归', '群鸟养羞', '雷始收声', '蛰虫坯户', '水始涸', '鸿雁来宾', '雀入大水为蛤', '菊有黄华', '豺乃祭兽', '草木黄落', '蛰虫咸俯', '水始冰', '地始冻', '雉入大水为蜃', '虹藏不见', '天气上升', '闭塞成冬', '鹖鴠不鸣', '虎始交', '荔挺出', '蚯蚓结', '麋角解', '水泉动', '雁北乡', '鹊始巢', '雉雊', '鸡乳', '征鸟厉疾', '水泽腹坚'];
const JIAZI = Array.from({ length: 60 }, (_, i) => GAN[i % 10] + ZHI[i % 12]);
const T = (arr: readonly string[]): RingItem[] => arr.map((label) => ({ label }));

interface RingItem { label: string; bits?: readonly number[] }
interface RingDef {
  key: string;
  r: number;                       // 归一化半径（0~1，相对最外圈）
  items: RingItem[];
  kind: 'tri' | 'hex' | 'text';
  sizeFrac: number;                // 文字/爻线宽度 相对该环实际半径的比例
  speed: number;                   // 转速（圈/秒），正负交替制造对转感
  glow?: boolean;                  // 只给内圈"主角"用，外圈密集环不加光晕，省性能也更清爽
  phase: number;                   // 呼吸/脉动相位，环与环错开不同步
  tickCount?: number;              // 只有最外圈有：额外的精细刻度线数量
}

const RINGS_DEF: RingDef[] = [
  { key: '八卦', r: 0.128, kind: 'tri', sizeFrac: 0.34, speed: 0.050, glow: true, phase: 0.0,
    items: BAGUA_ORDER.map((n) => ({ label: n, bits: TRI[n] })) },
  { key: '十天干', r: 0.202, kind: 'text', sizeFrac: 0.20, speed: -0.040, glow: true, phase: 0.6, items: T(GAN) },
  { key: '十二地支', r: 0.268, kind: 'text', sizeFrac: 0.15, speed: 0.034, phase: 1.2, items: T(ZHI) },
  { key: '十二律', r: 0.334, kind: 'text', sizeFrac: 0.10, speed: -0.028, phase: 1.8, items: T(LV) },
  { key: '十二长生', r: 0.400, kind: 'text', sizeFrac: 0.10, speed: 0.024, phase: 2.4, items: T(CS) },
  { key: '二十四节气', r: 0.474, kind: 'text', sizeFrac: 0.075, speed: -0.020, phase: 3.0, items: T(JIEQI) },
  { key: '二十八宿', r: 0.544, kind: 'text', sizeFrac: 0.065, speed: 0.017, phase: 3.6, items: T(XIU) },
  { key: '六十甲子', r: 0.629, kind: 'text', sizeFrac: 0.042, speed: -0.013, phase: 4.2, items: T(JIAZI) },
  { key: '六十四卦', r: 0.722, kind: 'hex', sizeFrac: 0.075, speed: 0.010, phase: 4.8,
    items: GUA.map(([n, up, lo]) => ({ label: n, bits: [...TRI[lo], ...TRI[up]] })) },
  { key: '六十四卦名', r: 0.804, kind: 'text', sizeFrac: 0.038, speed: 0.010, phase: 5.4,
    items: GUA.map(([n]) => ({ label: n })) },
  { key: '七十二候', r: 0.899, kind: 'text', sizeFrac: 0.020, speed: -0.008, phase: 6.0, items: T(HOU) },
  { key: '三百六十度', r: 1.000, kind: 'text', sizeFrac: 0.016, speed: 0.005, phase: 6.6, tickCount: 120,
    items: T(Array.from({ length: 12 }, (_, i) => String(i * 30))) },
];

/** 图上这个节点固定用这个 id，找它/避免重复添加都靠它。 */
export const CELESTIAL_EMBLEM_ID = 'celestial-emblem';
const EMBLEM_CLASS = 'celestial-emblem-node';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function graphSpread(cy: cytoscape.Core): { bb: { x1: number; y1: number; x2: number; y2: number }; spread: number } {
  let bb = { x1: -500, y1: -500, x2: 500, y2: 500 };
  try {
    const real = cy.nodes().not('.layer-parent').boundingBox();
    if (Number.isFinite(real.x1) && Number.isFinite(real.y1) && real.w > 0 && real.h > 0) bb = real;
  } catch {
    /* 图还没建好时 boundingBox() 可能抛错，用兜底范围 */
  }
  return { bb, spread: Math.max(bb.x2 - bb.x1, bb.y2 - bb.y1, 400) };
}

/** 十二重叠在一起，视觉体量比单独一个八卦环大得多，半径基准相应调大。 */
function pickRadius(cy: cytoscape.Core): number {
  return clamp(graphSpread(cy).spread * 0.075, 140, 340);
}

function pickSpawnPoint(cy: cytoscape.Core): { x: number; y: number } {
  const { bb } = graphSpread(cy);
  return {
    x: bb.x1 + Math.random() * (bb.x2 - bb.x1),
    y: bb.y1 + Math.random() * (bb.y2 - bb.y1),
  };
}

/**
 * 往图里加这个孤立节点（如果已存在则直接复用）。不 lock()：交给 euler 的
 * 斥力物理去决定它最终落在哪——见文件头注释。
 *
 * 内容（shortSummary / fullSummary / body）从对应的 Markdown 文件加载，
 * 与其他所有节点走同一套内容管道（写入 node data，供 DetailPanel 渲染）。
 * 节点本身在图中已存在；fetch 失败时静默降级，详情面板只显示基本信息。
 */
export async function spawnCelestialEmblemNode(cy: cytoscape.Core): Promise<cytoscape.NodeSingular> {
  const existing = cy.getElementById(CELESTIAL_EMBLEM_ID);
  if (existing.nonempty()) {
    stripNodeChrome(existing);
    return existing;
  }

  const { x, y } = pickSpawnPoint(cy);
  const node = cy.add({
    group: 'nodes',
    data: { id: CELESTIAL_EMBLEM_ID, label: '太极八卦' },
    position: { x, y },
    classes: `layer-parent ${EMBLEM_CLASS}`,
  });
  // canvas overlay 自己画图，不依赖 cytoscape 的文本标签；关掉避免 4 字 label
  // 叠在装饰画上，盖住内圈八卦/太极。label 仍保留在 data.label，详情面板照样读得到。
  stripNodeChrome(node);

  fetchEmblemContent(node);
  return node;
}

/**
 * 抹掉 cytoscape 自身画的所有可见 chrome：fill 的 defaultStroke="glow" 会让规则
 * `node[stroke = "glow"]` 命中并画 `border-color: accent` + `border-width: 2`，
 * 那条玫红描边就出现在 canvas 画出的图案上。`node.style()` 是 cytoscape 里高于
 * stylesheet 的最终来源（per-element style 始终盖过选择器命中），用它把所有
 * "会画边"的属性一次性塞成 0/transparent / 1px，节点本体彻底隐形。
 *
 * 注意：`events: 'yes'` 不在这里关——否则点击不到节点。pointer 命中沿用 cytoscape
 * 节点的 bounding-box（1×1），配 `min-zoomed-size` 已经够小，不再扩。
 */
function stripNodeChrome(node: cytoscape.NodeSingular): void {
  // 抹掉属性，让所有 [stroke=...] / [defaultStroke=...] 选择器不命中
  node.data('stroke', '');
  node.data('defaultStroke', '');

  // 抹掉样式：cytoscape.style() 是逐元素生效 + 高于 stylesheet 的最终值。
  // background / border / overlay / background-blacken 全压成 0 / transparent。
  node.style({
    // ── 本体：完全透明 ───────────────────────────────────────
    'background-color': 'rgba(0,0,0,0)',
    'background-opacity': 0,
    'background-fill': 'solid' as cytoscape.Css.BackgroundFill,
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
    'text-events': 'no' as cytoscape.Css.TextEvents,

    // ── 尺寸：覆盖整张图案 + 一圈点击余量。
    //   cytoscape 的 pointer hit 用 bounding-box，"画多大就能点多大的范围"。
    //   border / background / overlay / label 全部 transparent + opacity 0，
    //   所以节点本身不会被画出来；用户视觉看到的还是 canvas overlay 那张图。
    //   modelRadius 取 140–340，260 ≈ 中位数 × 1.6，能覆盖"图案 + 外圈光晕"。
    //   比这更大的盒子会吞掉周围真实节点的 hit 区，反而麻烦；260 是权衡。
    width: 260,
    height: 260,
    'min-width': 1,
    'min-height': 1,

    // ── 其它可能的可见副产物：清掉 ───────────────────────────
    'compound-sizing-w-b': 0,
    'compound-sizing-w-h': 0,
    'padding': 0,
    'shape': 'rectangle' as cytoscape.Css.NodeShape,
    opacity: 0,
    // 注意：不能写 visibility:hidden——cytoscape 会同时让 pointer 命中失效，
    // 节点就没法被点击打开详情面板。要"不画"靠 border/bg/overlay 全 transparent
    // + opacity 压 0 已经够了。
    'ghost': 'no' as cytoscape.Css.Ghost,
    'ghost-color': 'rgba(0,0,0,0)',
    'ghost-opacity': 0,
    'ghost-shape': 'ellipse' as cytoscape.Css.NodeShape,
    'ghost-offset-x': 0,
    'ghost-offset-y': 0,
  });
}

/** 非阻塞加载——fetch + 解析成功后把内容写入 node data。失败时静默。 */
async function fetchEmblemContent(node: cytoscape.NodeSingular): Promise<void> {
  try {
    const rel = '个人成长与生存策略/太极八卦.md';
    const url = '/content/' + rel.split('/').map(
      (s) => encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F'),
    ).join('/');
    const res = await fetch(url);
    if (!res.ok) return;
    const text = await res.text();
    const parsed = parseFrontmatter(text);
    if (!parsed) return;
    node.data('shortSummary', parsed.shortSummary ?? undefined);
    node.data('fullSummary', parsed.fullSummary ?? undefined);
    node.data('body', parsed.body ?? undefined);
    node.data('sourcePath', rel);
  } catch {
    /* fetch / 解析失败不影响图功能，静默降级 */
  }
}

/**
 * 解析 Markdown 内容（供运行时 fetch 使用）。
 * 复制自 build/build-content.ts 的解析逻辑，与构建期保持一致。
 */
function parseFrontmatter(raw: string): {
  shortSummary?: string;
  fullSummary?: string;
  body?: string;
} | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    const fm = yamlParse(match[1]) as Record<string, unknown> | null;
    if (!fm || typeof fm !== 'object') return null;
    const rawSummary = fm['summary'] as Record<string, unknown> | string | undefined;
    let shortSummary: string | undefined;
    let fullSummary: string | undefined;
    if (typeof rawSummary === 'object' && rawSummary !== null) {
      shortSummary = typeof rawSummary['short'] === 'string'
        ? String(rawSummary['short']).trim()
        : undefined;
      fullSummary = typeof rawSummary['full'] === 'string'
        ? String(rawSummary['full']).trim()
        : undefined;
    } else if (typeof rawSummary === 'string') {
      shortSummary = rawSummary.trim();
    }
    if (fullSummary === undefined) {
      fullSummary = typeof fm['full'] === 'string' ? String(fm['full']).trim() : undefined;
    }
    const bodyMatch = raw.match(/\n---\r?\n([\s\S]*)$/);
    const body = bodyMatch ? bodyMatch[1].trim() : undefined;
    return { shortSummary, fullSummary, body };
  } catch {
    return null;
  }
}

export interface CelestialEmblemOverlayOptions {
  container: HTMLElement;
  cy: cytoscape.Core;
  ink?: string;
  glow?: string;
  taijiSpeed?: number;
  fps?: number;
}

export class CelestialEmblemOverlay {
  private readonly cy: cytoscape.Core;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly ink: string;
  private readonly glow: string;
  private readonly taijiSpeed: number;
  private readonly frameInterval: number;
  private readonly reducedMotion: boolean;

  private modelRadius = 220;
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

  constructor(options: CelestialEmblemOverlayOptions) {
    this.cy = options.cy;
    this.ink = options.ink ?? '#f2ede0';
    this.glow = options.glow ?? 'rgba(217,72,63,0.5)';
    this.taijiSpeed = options.taijiSpeed ?? 0.02;
    this.frameInterval = 1000 / Math.max(1, options.fps ?? 30);
    this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    spawnCelestialEmblemNode(this.cy);
    this.modelRadius = pickRadius(this.cy);

    const container = options.container;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-celestial-emblem', '');
    Object.assign(this.canvas.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
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

  reroll(): void {
    const node = this.cy.getElementById(CELESTIAL_EMBLEM_ID);
    if (node.empty()) return;
    const { x, y } = pickSpawnPoint(this.cy);
    node.position({ x, y });
    this.modelRadius = pickRadius(this.cy);
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
    const node = this.cy.getElementById(CELESTIAL_EMBLEM_ID);
    if (node.nonempty()) this.cy.remove(node);
  }

  private syncSize(): void {
    const container = this.canvas.parentElement;
    if (!container) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.cssWidth && h === this.cssHeight && dpr === this.dpr) return;
    this.cssWidth = w; this.cssHeight = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  private start(): void {
    if (this.rafId !== null) return;
    this.startedAt = performance.now();
    if (this.reducedMotion) { this.draw(0); return; }
    this.rafId = requestAnimationFrame(this.tick);
  }
  private pause(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
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

    const node = this.cy.getElementById(CELESTIAL_EMBLEM_ID);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    if (node.empty()) return;

    const p = node.renderedPosition();
    const zoom = this.cy.zoom();
    // 缩小到一定程度后整体不再继续收缩：作为"一颗很亮的星"留在线索里。
    // 最外圈半径 floor 在 ~7 CSS px（包含一像素描边 + 几像素光晕），比完全消失好。
    const R = Math.max(this.modelRadius * zoom, 7);
    const rx = p.x, ry = p.y;

    const reach = R * 1.15 + 20;
    if (rx + reach < 0 || rx - reach > this.cssWidth || ry + reach < 0 || ry - reach > this.cssHeight) return;

    const breathe = this.reducedMotion ? 1 : 1 + 0.02 * Math.sin(t * 0.4);

    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(breathe, breathe);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const ring of RINGS_DEF) {
      this.drawRing(ctx, ring, R * ring.r, t);
    }

    // 太极坐镇中心，自转。半径独立于外圈基准，固定占整体的一小块。
    const taijiR = R * 0.10;
    ctx.save();
    ctx.rotate(t * this.taijiSpeed * Math.PI * 2);
    ctx.shadowColor = this.glow;
    ctx.shadowBlur = taijiR * 0.35;
    this.drawTaiji(ctx, taijiR);
    ctx.restore();

    ctx.restore();
  }

  private drawRing(ctx: CanvasRenderingContext2D, ring: RingDef, ringPxR: number, t: number): void {
    ctx.beginPath();
    ctx.arc(0, 0, ringPxR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(242,237,224,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const angleOffset = t * ring.speed * Math.PI * 2;
    const n = ring.items.length;
    const pulse = ring.glow ? 0.78 + 0.22 * Math.sin(t * 0.35 + ring.phase) : 0.72;

    if (ring.kind === 'text') {
      ctx.font = `${Math.max(4, ringPxR * ring.sizeFrac)}px "Songti SC","STSong","Noto Serif SC",serif`;
    }

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2 + angleOffset;
      const x = Math.cos(a) * ringPxR, y = Math.sin(a) * ringPxR;
      ctx.save();
      ctx.translate(x, y);
      if (ring.glow) { ctx.shadowColor = this.glow; ctx.shadowBlur = ringPxR * 0.05; }
      if (ring.kind === 'text') {
        ctx.globalAlpha = pulse;
        ctx.fillStyle = this.ink;
        ctx.fillText(ring.items[i].label, 0, 0);
        ctx.globalAlpha = 1;
      } else {
        this.drawBars(ctx, ring.items[i].bits!, ringPxR * ring.sizeFrac, pulse);
      }
      ctx.restore();
    }

    // 最外圈额外补一圈精细刻度（每 3°一道，每 30°一道长的），呼应原版的"周天刻度"。
    if (ring.tickCount) {
      const inner = ringPxR * 1.02;
      for (let i = 0; i < ring.tickCount; i++) {
        const deg = i * 3;
        const long = deg % 30 === 0;
        const a = (i / ring.tickCount) * Math.PI * 2 - Math.PI / 2 + angleOffset;
        const outer = inner + ringPxR * (long ? 0.045 : 0.018);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
        ctx.strokeStyle = 'rgba(242,237,224,0.3)';
        ctx.lineWidth = long ? 1.2 : 0.6;
        ctx.stroke();
      }
    }
  }

  /** N 道爻线堆叠：3 道给八卦，6 道给六十四卦，同一份逻辑。index 0 = 最下面那一道。 */
  private drawBars(ctx: CanvasRenderingContext2D, bits: readonly number[], w: number, alpha: number): void {
    const n = bits.length;
    const gap = (w * 0.62) / n;
    const barH = gap * 0.46;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.ink;
    for (let i = 0; i < n; i++) {
      const y = ((n - 1) / 2 - i) * gap - barH / 2;
      if (bits[i]) {
        ctx.fillRect(-w / 2, y, w, barH);
      } else {
        const mid = w * 0.2;
        const half = (w - mid) / 2;
        ctx.fillRect(-w / 2, y, half, barH);
        ctx.fillRect(-w / 2 + half + mid, y, half, barH);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * 太极。整体在中心自转；每次绘制时套一层 ctx.scale(-1, 1)，让画好的
   * 几何按 x 轴翻一次，于是 S 分界线在画面上变成"倒 S"。颜色赋值与
   * 原始版相同——镜像由变换矩阵承担，而不是把 light/dark 颜色
   * 互换（互换在大 lobe / 小点的耦合关系上容易出错）。
   */
  private drawTaiji(ctx: CanvasRenderingContext2D, r: number): void {
    const light = this.ink, dark = 'rgba(5,5,5,0.92)';
    // 水平镜像：scale(-1, 1) 让 x 轴反向，几何上的"倒 S"等价于
    // 把已经画好的图像左右翻转一次。比改 arc 起止角度更不容易出错。
    ctx.save();
    ctx.scale(-1, 1);
    ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.fillStyle = light; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2);
    ctx.fillStyle = dark; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -r / 2, r / 2, 0, Math.PI * 2);
    ctx.fillStyle = light; ctx.fill();
    ctx.beginPath(); ctx.arc(0, r / 2, r / 2, 0, Math.PI * 2);
    ctx.fillStyle = dark; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -r / 2, r * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = dark; ctx.fill();
    ctx.beginPath(); ctx.arc(0, r / 2, r * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = light; ctx.fill();
    ctx.lineWidth = Math.max(0.6, r * 0.02);
    ctx.strokeStyle = light;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

export function createCelestialEmblemOverlay(options: CelestialEmblemOverlayOptions): CelestialEmblemOverlay {
  return new CelestialEmblemOverlay(options);
}