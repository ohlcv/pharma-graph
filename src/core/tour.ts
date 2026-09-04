// src/core/tour.ts
// Auto-exploration engine — Strategy pattern, 2 built-in strategies.

export type TourCompleteReason = 'depth-reached' | 'no-more-restarts' | 'no-root';

export interface TourOptions {
  interval: number;
  maxDepth: number;
  strategy: TourStrategy;
  onStep?: (info: TourStepInfo) => void;
  /** Called after the pan animation completes */
  onStepAfterCenter?: (info: TourStepInfo) => void;
  /**
   * Called when the engine stops. The reason tells the controller whether
   * the user reached the configured depth (normal completion), the
   * infinite-mode restart loop exhausted itself (issue #16 — the user
   * was getting a silent stop and didn't know why), or there was no
   * root node to start from.
   */
  onComplete?: (reason: TourCompleteReason) => void;
  onPause?: () => void;
  onResume?: () => void;
}

export interface TourStepInfo {
  nodeId: string;
  label: string;
  depth: number;
  path: string[];
  pathLabels: string[];
  layerSize: number;
  layerIndex: number;
  totalExplored: number;
  totalToExplore: number;
  currentStep: number;
  maxDepthReached: number;
  cycleCount: number;
  strategyName: string;
}

// ── Strategy Interface ─────────────────────────────────────────────────────────

// ── Strategy Registry ─────────────────────────────────────────────────────────
//
// 加新漫游策略的唯一入口：调用 registerStrategy() 即可。
// 旧版的 class + ALL_STRATEGIES 数组 + TOUR_STRATEGY_LABELS 三处同步的模式，
// 在加第 3 个策略时已经显出摩擦（要碰 type 联合、labels 表、注册数组 4 个地方）。
//
// 现在：类型由注册表推导，labels 自动从条目中提取，TourEngine 不感知具体策略。

export type TourStrategy = string & { readonly __brand: 'TourStrategy' };

/** 一个漫游策略的最小定义 */
export interface TourStrategyDef {
  id: string;
  label: string;
  buildSequence: (cy: cytoscape.Core) => string[];
  /** 可选钩子集合；详见 StrategyHooks 注释。 */
  hooks?: StrategyHooks;
}

/**
 * 策略钩子——策略可以接管漫游引擎的部分行为。
 * 所有字段可选；TourEngine 在对应阶段检查，有则用，无则走默认逻辑。
 *
 * 好处：把"用什么顺序走"（buildSequence）和"每步怎么动"（钩子）解耦，
 *       加新策略时不必改 TourEngine，往注册表里塞新定义即可。
 */
export interface StrategyHooks {
  /**
   * 在节点进入视野、开始 highlight 之前调用。
   * 返回 true 继续，返回 false 跳过这个节点（不 highlight、不 center）。
   * 可用来按节点类型过滤，或注入自定义日志。
   */
  shouldVisit?: (nodeId: string, cy: cytoscape.Core) => boolean;

  /**
   * 每当一轮完整遍历结束（seqIndex 重置回 0）时调用。
   * 参数 cy 是当前图实例。
   * 可用来统计本轮覆盖量，或触发额外动画。
   */
  onCycleEnd?: (cy: cytoscape.Core) => void;

  /**
   * 允许策略自己控制"最多重启几次"。
   * 默认 TourEngine 的硬上限是 3 次，这个钩子让策略知道当前已重启了几次，
   * 从而决定是否继续——但最终停不停仍由引擎判断（引擎有 3 次绝对上限保底）。
   */
  onRestartAttempt?: (attemptCount: number, cy: cytoscape.Core) => void;

  /**
   * 游览方向：'forward'（从头到尾，默认）或 'reverse'（从尾到头）。
   * 目前只在渲染侧用，引擎本身是无状态的。
   */
  direction?: 'forward' | 'reverse';

  /**
   * 在 seq 走完后、引擎决定是否重启前调用。
   * 返回 true（默认）走引擎内置的 3 次硬上限循环；
   * 返回 false 表示该策略一次性跑完即可（如 topo-prereq 拓扑序，
   * 第二次遍历和第一次完全一样，循环没意义）。
   *
   * 引擎 3 次硬上限始终生效，策略不能调大。
   */
  shouldRestart?: (ctx: { attemptCount: number; maxAttempts: number; cy: cytoscape.Core }) => boolean;
}

const _strategies: TourStrategyDef[] = [];

/** 注册一个漫游策略。重复注册同 id 会覆盖，dev 模式下打 warn。 */
export function registerStrategy(def: TourStrategyDef): void {
  const existing = _strategies.findIndex((s) => s.id === def.id);
  if (existing >= 0) {
    _strategies[existing] = def;
    return;
  }
  _strategies.push(def);
}

/** 列出所有已注册策略（UI 用）。 */
export function listStrategies(): readonly TourStrategyDef[] {
  return _strategies;
}

/**
 * 撤销一个已注册策略（测试用）。
 * 普通业务代码不应调用——注册表是模块级单例，运行时撤销会破坏 UI 状态。
 * 仅供 vitest setup/teardown 使用，避免测试间污染。
 */
export function unregisterStrategy(id: string): void {
  const idx = _strategies.findIndex((s) => s.id === id);
  if (idx >= 0) _strategies.splice(idx, 1);
}

/** 已知策略 id → 中文 label（自动从注册表导出，保持单一来源）。 */
export const TOUR_STRATEGY_LABELS: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  {
    get: (_target, prop: string) => _strategies.find((s) => s.id === prop)?.label ?? prop,
  },
);

/** 按 id 查策略，找不到则 fallback 到第一个注册项。 */
export function getStrategy(id: TourStrategy): TourStrategyDef {
  return _strategies.find((s) => s.id === id) ?? _strategies[0]!;
}

/** 工具：从字符串字面量构造一个 TourStrategy（保留品牌类型，避免到处用 `as`）。 */
export const asStrategy = (id: string): TourStrategy => id as TourStrategy;

/**
 * 按 location 排序的兜底序列：把 cy 里所有非 layer-parent 节点，按
 * `getLocationKey` 全局排序，跳过 `seen` 里的 id，返回剩余节点 id 数组。
 *
 * 用途：所有"主逻辑跑完、还有节点没覆盖到"时用同一套 location 顺序兜底，
 *      避免每个策略各自写一份 sort+filter。
 *
 * @param cy    图实例
 * @param seen  已访问 / 已加入主序列的 id 集合（按引用读，不写）
 */
function buildLocationFallbackSeq(cy: cytoscape.Core, seen: ReadonlySet<string>): string[] {
  return cy.nodes().not('.layer-parent')
    .toArray()
    .sort((a, b) => {
      const la = getLocationKey(a as cytoscape.NodeSingular);
      const lb = getLocationKey(b as cytoscape.NodeSingular);
      return la < lb ? -1 : la > lb ? 1 : 0;
    })
    .filter((n) => !seen.has(n.id()))
    .map((n) => n.id());
}

/**
 * 序列归一化：保证 seq 非空 + 无重复 + 保留首次出现顺序。
 *
 * - 若 seq 为空 → fallback 到"全图节点打乱后"的 id 列表
 * - 否则就只去重，不改顺序
 *
 * 用途：TourEngine 启动 / 重启时调用，避免三处各自手写 fallback + dedupe。
 *
 * @param cy  图实例
 * @param seq 策略返回的原始序列
 * @returns   归一化后的序列（保证非空、无重复、相对顺序不变）
 */
function normalizeSeq(cy: cytoscape.Core, seq: string[]): string[] {
  let result = seq;
  if (result.length === 0) {
    const allNodes = cy.nodes().not('.layer-parent').toArray();
    shuffleInPlace(allNodes);
    result = allNodes.map((n) => n.id());
  }
  const seen = new Set<string>();
  return result.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
}

/**
 * 引擎硬上限：任何策略重启次数都不能超过这个值。
 * `shouldRestart` 钩子可以让策略主动选择更早停止，但不能让策略调大上限。
 */
const MAX_RESTART_ATTEMPTS = 3;

/**
 * 调用策略的 `shouldRestart` 钩子（如果有），决定当前是否要再走一轮。
 * 默认 true（沿用原行为：infinite mode 下一直循环到 3 次硬上限）。
 */
function strategyAllowsRestart(
  strategy: TourStrategyDef,
  attemptCount: number,
  cy: cytoscape.Core,
): boolean {
  return strategy.hooks?.shouldRestart?.({ attemptCount, maxAttempts: MAX_RESTART_ATTEMPTS, cy }) ?? true;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getLocationBook(node: cytoscape.NodeSingular): string {
  const loc = node.data('location');
  if (typeof loc === 'object' && loc !== null) {
    return (loc as Record<string, unknown>)['book'] as string ?? '';
  }
  return '';
}

function getLocationChapter(node: cytoscape.NodeSingular): string {
  const loc = node.data('location');
  if (typeof loc === 'object' && loc !== null) {
    return (loc as Record<string, unknown>)['chapter'] as string ?? '';
  }
  return '';
}

function getLocationPart(node: cytoscape.NodeSingular): string {
  const loc = node.data('location');
  if (typeof loc === 'object' && loc !== null) {
    return (loc as Record<string, unknown>)['part'] as string ?? '';
  }
  return '';
}

function getLocationSection(node: cytoscape.NodeSingular): string {
  const loc = node.data('location');
  if (typeof loc === 'object' && loc !== null) {
    return (loc as Record<string, unknown>)['section'] as string ?? '';
  }
  return '';
}

function getLocationSubsection(node: cytoscape.NodeSingular): string {
  const loc = node.data('location');
  if (typeof loc === 'object' && loc !== null) {
    return (loc as Record<string, unknown>)['subsection'] as string ?? '';
  }
  return '';
}

function getLocationItem(node: cytoscape.NodeSingular): string {
  const loc = node.data('location');
  if (typeof loc === 'object' && loc !== null) {
    return (loc as Record<string, unknown>)['item'] as string ?? '';
  }
  return '';
}

// 汉字数字转阿拉伯数字
const CN_DIGIT_MAP: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
};

// 从"第X节"/"第X章"/"第X篇"格式中提取数字，支持阿拉伯数字和汉字（含十、百）
/** @internal — exported for unit tests only. */
export function extractSectionNumber(section: string): number {
  if (!section) return 0;
  const match = section.match(/第(.+?)[篇章节]/);
  if (!match) return 999;
  const numStr = match[1];

  // 纯阿拉伯数字
  if (/^\d+$/.test(numStr)) return parseInt(numStr, 10);

  // 汉字数字解析：支持 一~九、十、十一~十九、二十~九十九、一百…
  // 算法：从高位到低位累加
  let result = 0;
  let tmp = 0; // 当前位的系数

  for (let i = 0; i < numStr.length; i++) {
    const ch = numStr[i];
    if (ch in CN_DIGIT_MAP) {
      tmp = CN_DIGIT_MAP[ch];
    } else if (ch === '十') {
      // "十" 单独出现（即字符串以"十"开头）时系数为 1
      result += (tmp === 0 ? 1 : tmp) * 10;
      tmp = 0;
    } else if (ch === '百') {
      result += tmp * 100;
      tmp = 0;
    } else {
      // 未知字符，兜底
      return 999;
    }
  }
  result += tmp; // 加上个位

  return result > 0 ? result : 999;
}

// Full location sort key: book > part/chapter > section > subsection > item
// book级总入口（无chapter也无part）用 chapterNum='000'，排在该 book 的最前面。
function getLocationKey(node: cytoscape.NodeSingular): string {
  const book       = getLocationBook(node);
  const chapter    = getLocationChapter(node);
  const part       = getLocationPart(node);
  const section    = getLocationSection(node);
  const subsection = getLocationSubsection(node);
  const item       = getLocationItem(node);
  const label      = node.data('label') ?? node.id();

  // chapter 优先，无 chapter 则用 part，两者都无则为书级入口排最前
  let chapterNum: string;
  if (chapter) {
    chapterNum = extractSectionNumber(chapter).toString().padStart(3, '0');
  } else if (part) {
    chapterNum = extractSectionNumber(part).toString().padStart(3, '0');
  } else {
    chapterNum = '000';
  }

  // 层级缺失时用 '000'，保证入口节点（section/subsection 均空）排在子节点前面
  const sectionNum    = section    ? extractSectionNumber(section).toString().padStart(3, '0')    : '000';
  const subsectionNum = subsection ? extractSectionNumber(subsection).toString().padStart(3, '0') : '000';

  // item 不含序号格式，直接用原文做 tiebreaker；label 兜底
  return book + '\x00' + chapterNum + '\x00' + sectionNum + '\x00' + subsectionNum + '\x00' + item + '\x00' + label;
}



// ── E1: 教材顺序（按 location 全局排序）────────────────────────────────────────
//
// 之前叫 "has-dfs"，但实际是按 location 排序，不依赖 has 边——名字已经误导很久了。
// id 保留 'has-dfs' 是为了不破坏已经持久化的用户偏好；UI label 保留旧文案。

registerStrategy({
  id: 'has-dfs',
  label: '教材顺序（深度优先）',
  buildSequence(cy) {
    // 直接按 location 字段全局排序：book > part > chapter > section > subsection > item
    // 这比 has 边 DFS 更可靠——location 已完整编码教材层级，DFS 反而因边覆盖不均引入乱序。
    // 内部用 seen 做去重（第一次访问全图时 seen 必为空）。
    return buildLocationFallbackSeq(cy, new Set());
  },
});

// ── E2: 层级依赖拓扑排序 ───────────────────────────────────────────────────────

registerStrategy({
  id: 'topo-prereq',
  label: '层级依赖（广度优先）',
  // 拓扑序跑一次就完整覆盖全部节点，再循环一遍得到相同序列，毫无意义。
  // 因此显式拒绝重启——引擎收到 false 后会立即以 'no-more-restarts' 收束。
  hooks: {
    shouldRestart: () => false,
  },
  buildSequence(cy) {
    const nodes = cy.nodes().not('.layer-parent');
    const edges = cy.edges();

    // Build prerequisite graph
    const prereqOut = new Map<string, string[]>();
    const prereqIn = new Map<string, string[]>();
    nodes.toArray().forEach((n) => {
      prereqOut.set(n.id(), []);
      prereqIn.set(n.id(), []);
    });
    edges.forEach((e) => {
      if (e.data('edgeType') === 'prerequisite') {
        const src = e.source().id();
        const tgt = e.target().id();
        prereqOut.get(src)!.push(tgt); // src is prerequisite of tgt
        prereqIn.get(tgt)!.push(src);
      }
    });

    // Topological sort using Kahn's algorithm
    const seq: string[] = [];
    const inDegree = new Map<string, number>();
    nodes.toArray().forEach((n) => inDegree.set(n.id(), (prereqIn.get(n.id()) ?? []).length));

    const noPrereq: string[] = [];
    inDegree.forEach((deg, id) => { if (deg === 0) noPrereq.push(id); });

    // essence 顺序：基础概念/分类早于药物，重点药跟随普通药
    // 走「分类 → 概念 → 普通药 → 重点药 → 疾病 → 口诀 → 总结」的自然学习顺序
    const ESSENCE_ORDER: Record<string, number> = {
      module: 0,
      'umbrella-class': 1,
      'strict-class': 2,
      concept: 3,
      notion: 4,
      drug: 5,
      medication: 6,
      illness: 7,
      mnemonic: 8,
      summary: 9,
    };
    const getEssenceOrder = (id: string): number =>
      ESSENCE_ORDER[cy.getElementById(id).data('essence') as string] ?? 99;

    // 比较函数：先按 essence，再按 location
    const nodeCompare = (a: string, b: string): number => {
      const ta = getEssenceOrder(a), tb = getEssenceOrder(b);
      if (ta !== tb) return ta - tb;
      const la = getLocationKey(cy.getElementById(a));
      const lb = getLocationKey(cy.getElementById(b));
      return la < lb ? -1 : la > lb ? 1 : 0;
    };

    // 初始无前置节点按 essence → location 排序，不再 shuffle
    noPrereq.sort(nodeCompare);

    while (noPrereq.length > 0) {
      const curr = noPrereq.shift()!;
      seq.push(curr);
      for (const dep of prereqOut.get(curr) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          // 动态插入：按 essence → location 找插入位置
          let inserted = false;
          for (let i = 0; i < noPrereq.length; i++) {
            if (nodeCompare(dep, noPrereq[i]) < 0) {
              noPrereq.splice(i, 0, dep); inserted = true; break;
            }
          }
          if (!inserted) noPrereq.push(dep);
        }
      }
    }

    // ── 兜底：把层级依赖未覆盖的节点插入 seq ────────────────────────────────────
    //
    // 策略：
    //   1. 对每个未访问节点，找它在 seq 中"最早出现的后代节点"的位置。
    //      后代定义：seq 中某节点的 location key 以该节点的 location prefix 为前缀。
    //   2. 若找到，就把它插到那个后代之前（入口节点紧贴第一个子节点）。
    //   3. 若找不到，按 location 排序追加到末尾。
    //
    // 这样章级/篇级入口不再被甩到最后，而是紧贴着它的第一个子节点出现。

    const seqSet = new Set(seq);

    // 未访问节点：共享的"按 location 兜底"工具，按 location key 升序
    const unvisited = buildLocationFallbackSeq(cy, seqSet);

    // getLocationPrefix：取 location key 中的层级段（不含 item+label 后缀），
    // 用来做"祖先前缀匹配"
    const getLocationPrefix = (node: cytoscape.NodeSingular): string => {
      const book       = getLocationBook(node);
      const chapter    = getLocationChapter(node);
      const part       = getLocationPart(node);
      const section    = getLocationSection(node);
      const subsection = getLocationSubsection(node);

      let chapterNum: string;
      if (chapter) {
        chapterNum = extractSectionNumber(chapter).toString().padStart(3, '0');
      } else if (part) {
        chapterNum = extractSectionNumber(part).toString().padStart(3, '0');
      } else {
        chapterNum = '000';
      }
      const sectionNum    = section    ? extractSectionNumber(section).toString().padStart(3, '0')    : '';
      const subsectionNum = subsection ? extractSectionNumber(subsection).toString().padStart(3, '0') : '';

      let key = book + '\x00' + chapterNum;
      if (sectionNum)    key += '\x00' + sectionNum;
      if (subsectionNum) key += '\x00' + subsectionNum;
      return key;
    };

    const toAppend: string[] = [];
    const insertions: Array<{ pos: number; id: string }> = [];

    for (const uid of unvisited) {
      const uNode = cy.getElementById(uid);
      const uPrefix = getLocationPrefix(uNode);

      // 在 seq 中找第一个 location key 以 uPrefix 为前缀的节点（即最早的后代）
      let bestPos = -1;
      for (let i = 0; i < seq.length; i++) {
        const seqNode = cy.getElementById(seq[i]);
        const seqKey  = getLocationKey(seqNode);
        if (seqKey.startsWith(uPrefix + '\x00') || seqKey === uPrefix) {
          bestPos = i;
          break;
        }
      }

      if (bestPos >= 0) {
        insertions.push({ pos: bestPos, id: uid });
      } else {
        toAppend.push(uid);
      }
    }

    // 按插入位置倒序处理，避免插入后后续 pos 偏移
    insertions.sort((a, b) => b.pos - a.pos);
    for (const { pos, id } of insertions) {
      seq.splice(pos, 0, id);
    }

    seq.push(...toAppend);

    return seq;
  },
});

// ── TourEngine ────────────────────────────────────────────────────────────────

/**
 * 所有已注册策略（导出别名，保留旧 API 兼容）。
 * 新代码请用 listStrategies() —— 它返回 readonly 视图。
 */
export const ALL_STRATEGIES: readonly TourStrategyDef[] = listStrategies();

export class TourEngine {
  private cy: cytoscape.Core;
  private interval = 3000;
  private maxDepth = -1;
  private timer: ReturnType<typeof setTimeout> | undefined = undefined;
  private paused = false;
  private stopped = false;
  private onStep?: TourOptions['onStep'];
  private onStepAfterCenter?: TourOptions['onStepAfterCenter'];
  private onComplete?: TourOptions['onComplete'];
  private onPause?: TourOptions['onPause'];
  private onResume?: TourOptions['onResume'];

  // Pre-computed sequence
  private seq: string[] = [];
  private seqIndex = 0;
  private cycleCount = 0;
  private totalExplored = 0;
  private currentStep = 0;
  private pulseRafId: number | null = null;
  private pulsingNode: cytoscape.NodeSingular | null = null;
  private strategyId: TourStrategy = 'has-dfs' as TourStrategy;
  /** 当前策略的钩子（start 时从策略 def 注入）。TourEngine 在各阶段检查，有则用。 */
  private _hooks: Partial<StrategyHooks> = {};
  // Tracks how many times we've rebuilt the visit sequence in the *current*
  private _restartAttempts = 0;
  // Bound handlers for cy graph-mutation events. Stored so that stop() can
  // remove them on engine teardown (fixes issue #15: totalExplored was a
  // snapshot from start() and never updated when nodes were added / removed
  // mid-tour — e.g. via the Delete key in keyboard-shortcuts).
  private _onNodeAdded: ((e: cytoscape.EventObject) => void) | null = null;
  private _onNodeRemoved: ((e: cytoscape.EventObject) => void) | null = null;
  // tour invocation, when infinite mode (maxDepth < 0) loops back. Caps at 3
  // to prevent pathological re-runs from locking the UI. Resets in start() and
  // when the tour ends naturally. Previously misnamed `_recursionCount` —
  // it is not a recursion counter in the call-stack sense.

  constructor(cy: cytoscape.Core) {
    this.cy = cy;
  }

  clearAllNodeInlineStyles(): void {
    // Clear inline overrides so the stylesheet's per-field border-color
    // and per-essence background-color take over again. Setting to a
    // "dimmed" border here would leave every node looking dimmed until
    // the user clicks a field/essence legend to reset.
    this.cy.nodes().forEach((n: cytoscape.NodeSingular) => {
      n.style({ 'border-width': null, 'border-color': null });
    });
  }

  start(rootId: string, options: TourOptions): void {
    this.stop();
    this.paused = false;
    this.stopped = false;
    this.interval = options.interval ?? 3000;
    this.maxDepth = options.maxDepth ?? -1;
    this.onStep = options.onStep;
    this.onStepAfterCenter = options.onStepAfterCenter;
    this.onComplete = options.onComplete;
    this.onPause = options.onPause;
    this.onResume = options.onResume;
    // panOffset is NOT reset here — it persists across tour restarts
    this.totalExplored = 0;
    this.currentStep = 0;
    this.cycleCount = 0;
    this._restartAttempts = 0;

    const strategy = getStrategy(options.strategy);
    this.strategyId = options.strategy;
    this._hooks = strategy as Partial<StrategyHooks>;

    // Build full sequence
    this.seq = normalizeSeq(this.cy, strategy.buildSequence(this.cy));
    // If a rootId was specified and not in seq, prepend it
    if (rootId && !this.seq.includes(rootId)) {
      this.seq = [rootId, ...this.seq.filter((id) => id !== rootId)];
    }
    // normalizeSeq 已经做了 dedupe，这里再保险一道（rootId prepend 可能引入重复）
    this.seq = normalizeSeq(this.cy, this.seq);

    this.seqIndex = 1; // seq[0] is visited below; visitNext should start from seq[1]
    this.currentStep = 1;
    this.totalExplored = this.cy.nodes().size();

    // Keep totalExplored in sync with live graph mutations (issue #15).
    // Listeners are removed on stop() so they don't outlive the engine.
    this.attachGraphMutators();

    // silent=false: fire onStep immediately so the detail panel appears right away
    this.highlightAndFocus(this.seq[0], [this.seq[0]], 0, this.seq.length, 1, false);
    this.scheduleNext();
  }

  /** Advance to next node in sequence (for manual prev/next) */
  next(): void {
    if (this.stopped) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    // Mark as paused so the animate-complete callback does NOT auto-schedule
    const wasAlreadyPaused = this.paused;
    this.paused = true;
    this.visitNext();
    // If the tour was already running (not paused), notify UI of pause
    if (!wasAlreadyPaused) this.onPause?.();
  }

  /** Go to previous node in sequence */
  prev(): void {
    if (this.stopped) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.seqIndex <= 0) return;
    // Mark as paused so the animate-complete callback does NOT auto-schedule
    const wasAlreadyPaused = this.paused;
    this.paused = true;
    this.seqIndex -= 2; // back up two: one to undo the last visitNext increment, one more to go back
    if (this.seqIndex < 0) this.seqIndex = 0;
    this.visitNext();
    // If the tour was already running (not paused), notify UI of pause
    if (!wasAlreadyPaused) this.onPause?.();
  }

  pause(): void {
    if (this.paused || this.stopped) return;
    this.paused = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    this.stopTourPulse();
    this.onPause?.();
  }

  resume(): void {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    if (this.pulsingNode && !this.pulsingNode.removed()) {
      this.startTourPulse(this.pulsingNode);
    }
    this.onResume?.();
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.pulsingNode) this.stopTourPulse();
    this.clearAllNodeInlineStyles();
    // Detach graph-mutation listeners (issue #15) so a stale engine
    // doesn't keep rewriting totalExplored after the tour has stopped.
    this.detachGraphMutators();
    this.stopped = true;
    this.paused = false;
  }

  /**
   * Update `totalExplored` to the live node count. Called when the user
   * adds or removes nodes mid-tour (issue #15). The tour *sequence* is
   * not regenerated here — adding a node after `start()` won't make it
   * appear in the visit order, but the UI badge shown to the user stops
   * lying about the graph size.
   */
  private resyncTotalExplored(): void {
    this.totalExplored = this.cy.nodes().size();
  }

  private attachGraphMutators(): void {
    // Defensive: if a previous tour never detached for some reason, clear
    // before re-attaching so we don't leak handlers.
    this.detachGraphMutators();
    this._onNodeAdded = () => { this.resyncTotalExplored(); };
    this._onNodeRemoved = () => { this.resyncTotalExplored(); };
    this.cy.on('add', this._onNodeAdded);
    this.cy.on('remove', this._onNodeRemoved);
  }

  private detachGraphMutators(): void {
    if (this._onNodeAdded) {
      this.cy.removeListener('add', this._onNodeAdded);
      this._onNodeAdded = null;
    }
    if (this._onNodeRemoved) {
      this.cy.removeListener('remove', this._onNodeRemoved);
      this._onNodeRemoved = null;
    }
  }

  isRunning(): boolean {
    return !this.paused && !this.stopped;
  }

  isPaused(): boolean {
    return this.paused && !this.stopped;
  }

  /** Total steps in this tour's sequence (built once at start()). */
  totalSteps(): number {
    return this.seq.length;
  }

  /** Current step in the sequence (1-indexed; matches TourStepInfo.currentStep). */
  currentStepIndex(): number {
    return this.currentStep;
  }

  /**
   * 调试用：列出指定策略（或全部策略）的遍历序列。
   * 控制台调用示例：
   *   uiState.tour.engine.previewSequence()           // 全部两种
   *   uiState.tour.engine.previewSequence('has-dfs')  // 单种
   */
  previewSequence(strategyId?: TourStrategy): void {
    const targets = strategyId
      ? [getStrategy(strategyId)]
      : ALL_STRATEGIES;

    targets.forEach((s) => {
      const seq = s.buildSequence(this.cy);

      if (seq.length === 0) {
        return;
      }

      const lines = seq.map((id, i) => {
        const n = this.cy.getElementById(id);
        const label = n.empty() ? `(missing: ${id})` : (n.data('label') || id);
        const loc = n.empty() ? '' : (() => {
          const l = n.data('location') as Record<string, string> | null;
          if (!l) return '';
          return [l['book'], l['chapter'], l['section']].filter(Boolean).join(' › ');
        })();
        return `  ${String(i + 1).padStart(3)}. ${label}${loc ? `  [${loc}]` : ''}`;
      });

    });
  }

  setInterval(ms: number): void {
    this.interval = ms;
  }

  setMaxDepth(depth: number): void {
    this.maxDepth = depth;
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    clearTimeout(this.timer);
    const t = this;
    this.timer = setTimeout(() => {
      if (!t.stopped && !t.paused) {
        t.visitNext();
      }
    }, this.interval);
  }

  private visitNext(): void {
    if (this.stopped) return;
    let restarted = false;
    let loopSafety = 0;
    while (true) {
      loopSafety++;
      if (loopSafety > 20000) { this.stopped = true; return; }
      while (this.seqIndex < this.seq.length) {
        const id = this.seq[this.seqIndex];
        const node = this.cy.getElementById(id);
        this.seqIndex++;
        // 策略钩子：允许策略在节点进入视野前拦截（过滤或自定义行为）
        if (this._hooks.shouldVisit && !this._hooks.shouldVisit(id, this.cy)) continue;
        if (!node.empty() && !node.hasClass('layer-parent')) {
          this.currentStep++;
          // Use the graph's real BFS depth (0=root/center, higher=outer layers).
          const nodeDepth = (node.data('depth') as number) ?? 0;
          this.highlightAndFocus(id, [id], nodeDepth, this.seq.length, this.seqIndex);
          if (this.maxDepth > 0 && this.seqIndex >= this.maxDepth) {
            this.stopped = true;
            this.onComplete?.('depth-reached');
          }
          return;
        }
      }

      // seq exhausted — restart if infinite mode and haven't already restarted
      if (this.maxDepth < 0 && !restarted) {
        restarted = true;
        this.cycleCount++;
        this._restartAttempts++;
        // 策略钩子：通知策略本次重启（策略可在这里记录日志或更新内部状态）
        this._hooks.onRestartAttempt?.(this._restartAttempts, this.cy);
        if (
          this._restartAttempts < MAX_RESTART_ATTEMPTS &&
          strategyAllowsRestart(getStrategy(this.getStrategyId()), this._restartAttempts, this.cy)
        ) {
          const strategy = getStrategy(this.getStrategyId());
          this.seq = normalizeSeq(this.cy, strategy.buildSequence(this.cy));
          this.seqIndex = 0;
          // 策略钩子：一轮遍历结束（即将开始新一轮）
          this._hooks.onCycleEnd?.(this.cy);
          continue;
        }
      }

      this._restartAttempts = 0;
      this.stopped = true;
      // Distinguish the "tried 3 times, giving up" path from the normal
      // depth-reached path so the controller can tell the user why the
      // tour stopped (issue #16).
      const reason: TourCompleteReason = this.maxDepth < 0 ? 'no-more-restarts' : 'depth-reached';
      this.onComplete?.(reason);
      return;
    }
  }

  private getStrategyId(): TourStrategy {
    return this.strategyId;
  }

  private highlightAndFocus(
    nodeId: string,
    path: string[],
    depth: number,
    total: number,
    layerIdx: number,
    silent = false,
  ): void {
    const node = this.cy.getElementById(nodeId);
    const pathLabels = path.map((id) => this.cy.getElementById(id).data('label') || id);

    this.stopTourPulse();
    this.cy.elements().removeClass('selected-node highlighted highlighted-edge');
    this.cy.elements().addClass('dimmed');
    node.removeClass('dimmed highlighted').addClass('selected-node');
    node.connectedEdges().removeClass('dimmed').addClass('highlighted-edge');
    node.connectedEdges().targets().not('.layer-parent').removeClass('dimmed').addClass('highlighted');

    this.startTourPulse(node);

    this.cy.stop(); // Stop any in-progress pan/zoom animation before starting a new one

    const stepInfo: TourStepInfo = {
      nodeId,
      label: node.data('label') || nodeId,
      depth,
      path,
      pathLabels,
      layerSize: total,
      layerIndex: layerIdx,
      totalExplored: this.totalExplored,
      totalToExplore: total,
      currentStep: this.currentStep,
      maxDepthReached: depth,
      cycleCount: this.cycleCount,
      strategyName: getStrategy(this.strategyId).label,
    };

    // Pan the camera so this node lands at the center of the cy container.
    //
    // cytoscape's `pan` value is in container-LOCAL rendered pixels: it's
    // the offset from the container's top-left corner to the model origin
    // (0, 0). To put a model point `(mx, my)` at the container's center:
    //
    //     pan.x = (containerW / 2) - mx * zoom
    //     pan.y = (containerH / 2) - my * zoom
    //
    // Earlier versions of this code mixed screen-absolute coordinates
    // (bounds.top, bounds.left) with the pan formula, which is a category
    // error: it caused nodes to land below the canvas center by exactly
    // topbar+toolbar height (100px) in normal layout mode, while appearing
    // correct in bigscreen mode (where bounds.top === 0). Bug reports
    // describing "selected node is too low in non-bigscreen mode" traced
    // directly back to this.
    //
    // We use clientWidth / clientHeight (container-local CSS pixel size,
    // excluding topbar/toolbar) — the same numbers cytoscape's own
    // internal center code reads via this.width() / this.height().
    const container = this.cy.container();
    const targetZoom = depth === 0 ? 1.5 : 1.3;
    if (container) {
      // Pan formula uses the TARGET zoom, not the current one — cy.animate
      // applies pan and zoom together, so the formula must reflect the
      // post-animation state. (Earlier versions read this.cy.zoom() here
      // which gave a transient pan that then got shifted when zoom
      // changed mid-animation.)
      const w = container.clientWidth;
      const h = container.clientHeight;
      const targetPan = {
        x: w / 2 - node.position('x') * targetZoom,
        y: h / 2 - node.position('y') * targetZoom,
      };
      this.cy.animate(
        { pan: targetPan, zoom: targetZoom, duration: 600, easing: 'ease-out-cubic' },
        {
          complete: () => {
            this.onStepAfterCenter?.(stepInfo);
            if (!this.stopped && !this.paused) this.scheduleNext();
          },
        },
      );
    } else {
      // Headless / test path — defer to cytoscape's own center math.
      this.cy.animate(
        { center: { eles: node }, zoom: targetZoom, duration: 600, easing: 'ease-out-cubic' },
        {
          complete: () => {
            this.onStepAfterCenter?.(stepInfo);
            if (!this.stopped && !this.paused) this.scheduleNext();
          },
        },
      );
    }

    if (!silent) {
      this.onStep?.(stepInfo);
    }
  }

  private startTourPulse(node: cytoscape.NodeSingular): void {
    this.pulsingNode = node;
    let startTime: number | null = null;

    const animateBorder = (timestamp: number) => {
      if (!node.cy() || node.removed() || this.pulsingNode !== node) {
        this.pulseRafId = null;
        return;
      }
      if (startTime === null) startTime = timestamp;
      const t = (timestamp - startTime) / 1000;
      const pulse = (Math.sin(t * Math.PI * 2) + 1) / 2;
      node.style({
        'border-width': 2.5 + pulse * 2,
        'border-color': `rgba(251,191,36,${0.5 + pulse * 0.5})`,
      });
      this.pulseRafId = requestAnimationFrame(animateBorder);
    };
    this.pulseRafId = requestAnimationFrame(animateBorder);
  }

  private stopTourPulse(): void {
    if (this.pulseRafId !== null) {
      cancelAnimationFrame(this.pulseRafId);
      this.pulseRafId = null;
    }
    if (this.pulsingNode && !this.pulsingNode.removed()) {
      this.pulsingNode.style({ 'border-width': null, 'border-color': null });
    }
    this.pulsingNode = null;
  }
}

// 方法一：先点漫游按钮启动，再跑
// uiState.tour.engine.previewSequence()