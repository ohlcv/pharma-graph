// src/core/tour.ts
// Auto-exploration engine — Strategy pattern, 2 built-in strategies.

/** 漫游深度层级配置：5档设计，区分重点药和普通药 */
export const TOUR_DEPTH_CONFIG = {
  // 档位 1-5 对应的 fill 类型包含关系
  // 每档包含所有更低档的内容
  levels: [
    {
      level: 1,
      label: '结构',
      description: '快速浏览章节框架',
      includes: ['cls-structure'],
    },
    {
      level: 2,
      label: '概览',
      description: '了解知识分类',
      includes: ['cls-structure', 'cls-classification'],
    },
    {
      level: 3,
      label: '复习',
      description: '只看重点药（跳过普通药）',
      includes: ['cls-structure', 'cls-classification', 'cls-drug-key'], // key = 重点药
    },
    {
      level: 4,
      label: '口诀',
      description: '加入记忆内容',
      includes: ['cls-structure', 'cls-classification', 'cls-drug-key', 'cls-summary', 'cls-mnemonic'],
    },
    {
      level: 5,
      label: '全面',
      description: '完整学习',
      includes: ['all'], // 全部类型
    },
  ] as const,

  /** 从档位获取显示标签（固定两字） */
  getLabel(level: number): string {
    // level 0 或负数 = 档位 5（全部）
    if (level <= 0 || level >= 5) return this.levels[4].label;
    return this.levels[level - 1].label;
  },
};

/** 判断节点是否为"重点药"（有 glow 边框的 cls-drug 节点） */
export function isKeyDrug(node: cytoscape.NodeSingular): boolean {
  const fill = node.data('fill') as string;
  const stroke = node.data('stroke') as string | undefined;
  return fill === 'cls-drug' && stroke === 'glow';
}

/** 判断节点是否属于给定档位的内容范围 */
export function isNodeInLevel(node: cytoscape.NodeSingular, level: number): boolean {
  const fill = node.data('fill') as string;
  const stroke = node.data('stroke') as string | undefined;
  const isKey = fill === 'cls-drug' && stroke === 'glow';

  // 档位 5 = 全部
  if (level >= 5) return true;

  // 档位 4 = structure + classification + 重点药 + summary + mnemonic
  if (level >= 4) {
    return ['cls-structure', 'cls-classification', 'cls-summary', 'cls-mnemonic'].includes(fill) || isKey;
  }

  // 档位 3 = structure + classification + 重点药（跳过普通药）
  if (level >= 3) {
    return ['cls-structure', 'cls-classification'].includes(fill) || isKey;
  }

  // 档位 2 = structure + classification
  if (level >= 2) {
    return ['cls-structure', 'cls-classification'].includes(fill);
  }

  // 档位 1 = structure
  return fill === 'cls-structure';
}

export type TourCompleteReason = 'depth-reached' | 'no-more-restarts' | 'no-root';

/** Payload passed to onComplete — the engine's terminal state. The max
 *  attempt count is exposed so controllers don't hardcode a literal "3"
 *  that would drift out of sync with MAX_RESTART_ATTEMPTS. */
export interface TourCompleteInfo {
  reason: TourCompleteReason;
  maxAttempts: number;
}

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
  onComplete?: (info: TourCompleteInfo) => void;
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
  /** 显示在 UI 策略选择器里的主标签，例如"教材顺序"。 */
  label: string;
  /** 一句话副标题，解释这个策略适合什么场景。显示在 label 下方。 */
  description?: string;
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
      // 无 book 的孤儿节点（完全无 location）排序到末尾，不应排在有定位的节点之前。
      // 空字符串 < '\x00' < 'y2'（字符集序），所以必须显式判断 book 而非依赖 key 比较。
      const aBook = getLocationBook(a as cytoscape.NodeSingular);
      const bBook = getLocationBook(b as cytoscape.NodeSingular);
      if (!aBook && bBook) return  1; // a 无定位，b 有 → a 排后面
      if (!bBook && aBook) return -1; // b 无定位，a 有 → b 排后面
      if (!aBook && !bBook) {
        // 两个都是孤儿，按 label 排序保持稳定
        const la = (a.data('label') ?? a.id()) as string;
        const lb = (b.data('label') ?? b.id()) as string;
        return la < lb ? -1 : la > lb ? 1 : 0;
      }
      const la = getLocationKey(a as cytoscape.NodeSingular);
      const lb = getLocationKey(b as cytoscape.NodeSingular);
      return la < lb ? -1 : la > lb ? 1 : 0;
    })
    .filter((n) => !seen.has(n.id()))
    .map((n) => n.id());
}

/**
 * 把"主序列跑完还没覆盖"的游离节点，按 location 祖先就近原则插入 `seq`。
 *
 * 解决的问题：之前 has-dfs 末尾追加游离节点 → 用户看到"突然跳到无家可归
 * 的药物"。现在统一抽到本工具，两个策略共享一份实现。
 *
 * 算法：
 *   1. 找出所有不在 seq 里的节点，按 location 排序兜底
 *   2. 对每个游离节点，找 seq 中第一个"以该节点 location prefix 为前缀"
 *      的位置（即最早出现的后代），插到那里之前
 *   3. 跳过 cls-classification 节点（粗/细分类是 section 入口，不应被打断）
 *   4. 找不到任何后代的位置就追加到末尾
 *
 * @param cy    图实例
 * @param seq   主序列（in-place 修改；新元素插在合适位置）
 * @param seen  seq 中已存在的 id 集合（用于判定"游离"）
 */
function insertOrphansNearAncestors(
  cy: cytoscape.Core,
  seq: string[],
  seen: ReadonlySet<string>,
): void {
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

  const unvisited = buildLocationFallbackSeq(cy, seen);
  const toAppend: string[] = [];
  const insertions: Array<{ pos: number; id: string }> = [];

  for (const uid of unvisited) {
    const uNode = cy.getElementById(uid);
    const uPrefix = getLocationPrefix(uNode);
    // 没有 book 的"完全孤儿"（比如跨书的总论、口诀）按 fill 顺序追加到
    // 末尾，否则会因 uPrefix='\x00000' 而匹配 seq[0]（book-y2）插到第一位。
    const book = getLocationBook(uNode);
    if (!book) {
      toAppend.push(uid);
      continue;
    }

    // 找 seq 中第一个 location key 以 uPrefix 为前缀的节点（即祖先）。
    // 然后从祖先向后扫到第一个"非结构、非分类"位置，把游离节点插在那里
    // —— 这样它紧贴第一个 sibling，而不是打断章节标题或分类头。
    let ancestorPos = -1;
    for (let i = 0; i < seq.length; i++) {
      const seqNode = cy.getElementById(seq[i]);
      const seqKey  = getLocationKey(seqNode);
      if (seqKey.startsWith(uPrefix + '\x00') || seqKey === uPrefix) {
        ancestorPos = i;
        break;
      }
    }

    if (ancestorPos >= 0) {
      let insertPos = ancestorPos + 1;
      // 跳过 structure / classification 节点：它们是章节入口，不应被游离节点打断
      while (insertPos < seq.length) {
        const fill = cy.getElementById(seq[insertPos]).data('fill') as string;
        if (fill === 'cls-structure' || fill === 'cls-classification') {
          insertPos++;
          continue;
        }
        break;
      }
      insertions.push({ pos: insertPos, id: uid });
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

/** 默认漫游间隔（毫秒） */
const DEFAULT_INTERVAL_MS = 3000;

/** 无限漫游模式的 maxDepth 标记值（< 0 表示无限） */
const INFINITE_DEPTH = -1;

/** 安全循环上限，防止无限循环 */
const LOOP_SAFETY_LIMIT = 20000;

/** previewSequence 控制台输出截断：保留前 N 行 */
const PREVIEW_HEAD_LINES = 20;
/** previewSequence 控制台输出截断：保留后 N 行 */
const PREVIEW_TAIL_LINES = 10;

/**
 * 全图 fill 类型的"教学优先"遍历顺序。
 * 之前 has-dfs 用数组、topo-prereq 用 Record，两处各写一份导致容易漂移；
 * 这里是唯一权威来源，导出供外部（含 isNodeInLevel）使用。
 *
 * 顺序的含义：当父节点下同时有结构/分类/药物等子节点时，按此序访问
 * —— 先看章节结构，再看分类，再看药物，最后看口诀/概念/总结，
 * 跟人脑"先骨架后细节"的复习节奏一致。
 */
export const FILL_VISIT_ORDER = [
  'cls-structure',
  'cls-classification',
  'cls-biomolecule',
  'cls-feature',
  'cls-drug',
  'cls-disease',
  'cls-adverse',
  'cls-mnemonic',
  'cls-concept',
  'cls-summary',
] as const;

/** FILL_VISIT_ORDER 的索引 Map（O(1) 排序比较用），导出方便测试。 */
export const FILL_ORDER_INDEX: ReadonlyMap<string, number> = new Map(
  FILL_VISIT_ORDER.map((fill, i) => [fill, i]),
);

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

function getLocationField(node: cytoscape.NodeSingular, field: string): string {
  const loc = node.data('location');
  if (typeof loc === 'object' && loc !== null) {
    return (loc as Record<string, unknown>)[field] as string ?? '';
  }
  return '';
}

// 便捷包装器，保持 API 兼容性
const getLocationBook      = (n: cytoscape.NodeSingular) => getLocationField(n, 'book');
const getLocationChapter   = (n: cytoscape.NodeSingular) => getLocationField(n, 'chapter');
const getLocationPart      = (n: cytoscape.NodeSingular) => getLocationField(n, 'part');
const getLocationSection   = (n: cytoscape.NodeSingular) => getLocationField(n, 'section');
const getLocationSubsection= (n: cytoscape.NodeSingular) => getLocationField(n, 'subsection');
const getLocationItem      = (n: cytoscape.NodeSingular) => getLocationField(n, 'item');

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
export function getLocationKey(node: cytoscape.NodeSingular): string {
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
  description: '按书 → 章 → 节 → 分类 → 药 → 口诀的顺序走，适合初次复习整本书。',
  buildSequence(cy) {
    // 书籍优先级：y2(药二)→y3(药综)→y1(药一)→y4(法规)
    // key 兼容正则捕获的 'y2'/'2' 两种格式
    const BOOK_ORDER: Record<string, number> = { 'y2': 0, '2': 0, 'y3': 1, '3': 1, 'y1': 2, '1': 2, 'y4': 3, '4': 3 };
    // bookOrder: 兼容 book-y4（末尾无 dash）和 sec-gcs-y2-08-02（末尾有 dash）
    const getBookOrder = (node: cytoscape.NodeSingular): number => {
      const id = node.id();
      const m = id.match(/-y(\d)(?:-|$)/);
      return m ? (BOOK_ORDER[m[1]] ?? 99) : 99;
    };

    const nodes = cy.nodes().not('.layer-parent').toArray() as cytoscape.NodeSingular[];

    // 建立 parentMap[childId] = parentId（通过 subclass_of / instance_of 边）
    const parentMap = new Map<string, string>();
    for (const n of nodes) {
      const edges_out = n.data('edges_out') as Array<Record<string, string>> | undefined;
      if (!edges_out) continue;
      for (const edge of edges_out) {
        if (edge.type === 'subclass_of' || edge.type === 'instance_of') {
          parentMap.set(n.id(), edge.target);
          break;
        }
      }
    }

    // children[parentId] = [所有子节点，按 location key 排序]
    // parentMap 用 subclass_of/instance_of（单父，OWL 语义），children 额外纳入 part_of（多父）
    // —— part_of 一个节点可以挂在多个父下（口诀同时挂在药物 A 和伞 B 下），
    //    多父是 part_of 的天然语义；visited 在 DFS 层防重，不会重复 push。
    const children = new Map<string, cytoscape.NodeSingular[]>();
    for (const n of nodes) {
      const parent = parentMap.get(n.id());
      // 无论有没有子类/实例父，part_of 边都额外建一遍关系
      const edges_out = n.data('edges_out') as Array<Record<string, string>> | undefined;
      const partOfTargets = (edges_out ?? [])
        .filter((e) => e.type === 'part_of')
        .map((e) => e.target);
      if (parent) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent)!.push(n);
      }
      for (const partOf of partOfTargets) {
        // 同一个父不要重复 push（part_of 自身可能有重复条目）
        if (partOf === parent) continue;
        if (!children.has(partOf)) children.set(partOf, []);
        children.get(partOf)!.push(n);
      }
    }
    for (const [, arr] of children) {
      arr.sort((a, b) => {
        const la = getLocationKey(a), lb = getLocationKey(b);
        return la < lb ? -1 : la > lb ? 1 : 0;
      });
    }

    // FILL_VISIT_ORDER 已在模块顶部统一定义；这里直接用
    // （has-dfs 与 topo-prereq 之前各写一份导致漂移风险）。

    // 收集所有 structure 节点（树根/入口）
    const allStructures = nodes.filter((n) => (n.data('fill') as string) === 'cls-structure');
    const collectTree = (parentId: string) => {
      for (const k of children.get(parentId) ?? []) collectTree(k.id());
    };

    // 每次调用 sort 时重置，避免 HMR/多次调用时累加
    const result: string[] = [];
    const visited = new Set<string>();

    // DFS：fill-order 顺序遍历子节点；visited 防重；递归所有子节点以确保树完整遍历
    const dfsChildren = (parentId: string) => {
      for (const fill of FILL_VISIT_ORDER) {
        const kids = (children.get(parentId) ?? []).filter(
          (k) => (k.data('fill') as string) === fill,
        );
        for (const k of kids) {
          if (!visited.has(k.id())) {
            visited.add(k.id());
            result.push(k.id());
          }
          dfsChildren(k.id());
        }
      }
      // 其他所有类型（非 FILL_VISIT_ORDER 中列出的新 fill 值）
      for (const k of (children.get(parentId) ?? []).filter(
        (k) => !FILL_VISIT_ORDER.includes((k.data('fill') ?? '') as typeof FILL_VISIT_ORDER[number]),
      )) {
        if (!visited.has(k.id())) {
          visited.add(k.id());
          result.push(k.id());
        }
        dfsChildren(k.id());
      }
    };

    // ── 第一步：structure 节点作为根入口 ────────────────────────────────
    // 1. 所有 structure 节点（cls-structure = 书籍/章/节入口）
    for (const s of allStructures) collectTree(s.id());

    // 2. structure 排序：
    //   - 先按 book 顺序，再按 location key
    const sortedStructures = allStructures.sort((a, b) => {
      const ba = getBookOrder(a), bb = getBookOrder(b);
      if (ba !== bb) return ba - bb;
      const la = getLocationKey(a), lb = getLocationKey(b);
      return la < lb ? -1 : la > lb ? 1 : 0;
    });

    for (const structure of sortedStructures) {
      if (visited.has(structure.id())) continue;
      visited.add(structure.id());
      result.push(structure.id());
      dfsChildren(structure.id());
    }

    // ── 第二步：把游离节点插入到它们的"语义最近邻"位置 ───────────────────
    // 之前直接按 FILL_ORDER + location 追加到末尾，导致用户看到"突然跳到
    // 一个无家可归的节点"。现在改用共享的 insertOrphansNearAncestors 工具，
    // 让游离节点尽量紧贴它的 location 祖先出现。
    const beforeOrphanLen = result.length;
    insertOrphansNearAncestors(cy, result, visited);
    const afterOrphanLen = result.length;

    return result;
  },
});

// ── E2: 层级依赖拓扑排序 ───────────────────────────────────────────────────────

registerStrategy({
  id: 'topo-prereq',
  label: '层级依赖（广度优先）',
  description: '按知识依赖关系走（基础先于应用），适合查漏补缺单知识点。',
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

    // FILL_VISIT_ORDER 已在模块顶部统一定义；这里直接读索引避免重复声明
    const getFillOrder = (id: string): number =>
      FILL_ORDER_INDEX.get(cy.getElementById(id).data('fill') as string) ?? 99;

    // 比较函数：先按 fill，再按 location
    const nodeCompare = (a: string, b: string): number => {
      const ta = getFillOrder(a), tb = getFillOrder(b);
      if (ta !== tb) return ta - tb;
      const la = getLocationKey(cy.getElementById(a));
      const lb = getLocationKey(cy.getElementById(b));
      return la < lb ? -1 : la > lb ? 1 : 0;
    };

    // 初始无前置节点按 fill → location 排序，不再 shuffle
    noPrereq.sort(nodeCompare);

    while (noPrereq.length > 0) {
      const curr = noPrereq.shift()!;
      seq.push(curr);
      for (const dep of prereqOut.get(curr) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          // 动态插入：按 fill → location 找插入位置
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
    // 之前在这里写了一份 ~80 行的"找 location 祖先插入"逻辑。现在统一抽到
    // insertOrphansNearAncestors，两个策略共享同一份实现。
    insertOrphansNearAncestors(cy, seq, new Set(seq));

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
  private interval = DEFAULT_INTERVAL_MS;
  private maxDepth = INFINITE_DEPTH;
  /** 内容档位：1-5，决定漫游时过滤哪些 fill 类型。独立于 maxDepth（步数限制）。 */
  private _depthLevel = 5;
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
  /** The starting node selected by the user. Persists across restart cycles
   *  so that cycle 2 still begins from the same subtree as cycle 1. */
  private _rootId: string = '';
  /**
   * Stack of nodes the tour has actually visited (emitted via onStep),
   * in chronological order. Used by prev() to reliably step backward
   * without the old `seqIndex -= 2` hack, which broke after the restart
   * path reset `seqIndex` to 0 and produced a "visit the start node again"
   * instead of a true backward step.
   */
  private _visited: string[] = [];
  /** Pre-computed total visit count for the current seq+depth combo.
   *  Without this, totalSteps() would be O(N) on every step (renderer.ts
   *  + tour-controller.ts both call it for the progress badge), turning a
   *  641-step tour into 41万 iterations. Recomputed only when seq or
   *  _depthLevel change. */
  private _cachedTotalSteps = 0;
  // tour invocation, when infinite mode (maxDepth < 0) loops back. Caps at 3
  // to prevent pathological re-runs from locking the UI. Resets in start() and
  // when the tour ends naturally. Previously misnamed `_recursionCount` —
  // it is not a recursion counter in the call-stack sense.

  constructor(cy: cytoscape.Core) {
    this.cy = cy;
  }

  clearAllNodeInlineStyles(): void {
    // Clear inline overrides so the stylesheet's per-field border-color
    // and per-fill background-color take over again. Setting to a
    // "dimmed" border here would leave every node looking dimmed until
    // the user clicks a fill legend to reset.
    this.cy.nodes().forEach((n: cytoscape.NodeSingular) => {
      n.style({ 'border-width': null, 'border-color': null });
    });
  }

  /**
   * Begin a tour starting from `rootId`. Returns `false` if the tour has
   * nothing to visit (empty root, no nodes match the current depth level,
   * or rootId is not in the strategy sequence) — callers should surface
   * a user-visible error rather than letting the UI claim a tour is
   * running when nothing will move.
   */
  start(rootId: string, options: TourOptions): boolean {
    this.stop();
    this.paused = false;
    this.stopped = false;
    this.interval = options.interval ?? DEFAULT_INTERVAL_MS;
    // maxDepth 参数表示档位（1-5），5 或负数 = 全部（无限漫游）
    // 始终使用无限模式（步数不受限制），让档位过滤单独工作
    const level = options.maxDepth ?? INFINITE_DEPTH;
    this._depthLevel = level <= 0 ? 5 : level;
    this.maxDepth = -1; // 始终无限
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

    // Visit history resets on every start (fresh tour).
    this._visited = [];

    // Build full sequence
    this.seq = normalizeSeq(this.cy, strategy.buildSequence(this.cy));
    // Remember the root so subsequent restarts can re-scope the tour to the
    // same subtree instead of jumping back to book-y2.
    this._rootId = rootId;

    // If a rootId was specified, scope the tour to that node's reachable
    // subgraph — otherwise pickRoot would be ignored because the strategy's
    // own DFS already contains every node (e.g. has-dfs starting at book-y2).
    //
    // We keep the strategy's relative ordering but only retain nodes
    // reachable from rootId via cytoscape edges. This way, picking
    // cls-sga-y2-01-07 produces a tour that starts there and walks its
    // subtree, not the entire 641-node graph.
    this.applyRootScope();
    // applyRootScope re-computes the cached total only when seq actually
    // changes (i.e. when rootId sliced the seq). If rootId was empty /
    // already seq[0] the seq is unchanged, so we still need a one-time
    // compute here for the very first start.
    this.recomputeTotal();

    this.seqIndex = 1; // seq[0] is visited below; visitNext should start from seq[1]
    this.currentStep = 1;
    this.totalExplored = this.cy.nodes().size();

    // Keep totalExplored in sync with live graph mutations (issue #15).
    // Listeners are removed on stop() so they don't outlive the engine.
    this.attachGraphMutators();

    // If seq ends up empty or every node is filtered out by depth level,
    // there is nothing to visit. Bail instead of pretending the tour
    // is running. (Can happen when the user picks a node whose fill type
    // doesn't match the current depth slider, e.g. a drug under "structure
    // only" mode.)
    if (this.seq.length === 0 || this._cachedTotalSteps === 0) {
      this.stop();
      return false;
    }

    // silent=false: fire onStep immediately so the detail panel appears right away
    this._visited.push(this.seq[0]);
    this.highlightAndFocus(this.seq[0], [this.seq[0]], 0, this.totalSteps(), 1, false);
    this.scheduleNext();
    return true;
  }

  /** Advance to next node in sequence (for manual prev/next) */
  next(): void {
    if (this.stopped) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    // Mark as paused so the animate-complete callback does NOT auto-schedule
    // the next step. Emit onPause unconditionally so the controller's
    // play/pause icon stays in sync across consecutive prev/next calls; the
    // controller uses the engine's real paused state (not its own cached
    // flag) to decide resume vs pause.
    this.paused = true;
    this.visitNext();
    this.onPause?.();
  }

  /** Go to previous node in sequence.
   *  Uses `_visited` history instead of the old `seqIndex -= 2` hack, which
   *  was unreliable after restart (which resets `seqIndex` to 0). The
   *  history stack also survives restart, so prev() still walks back through
   *  recent visits even mid-cycle. */
  prev(): void {
    if (this.stopped) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this._visited.length <= 1) return; // can't go before start node
    // Pop the current node, then visit the previous one (the new top).
    const target = this._visited[this._visited.length - 2];
    this._visited.pop();
    const node = this.cy.getElementById(target);
    if (node.empty() || node.hasClass('layer-parent')) return;
    // rewind seqIndex so visitNext's internal bookkeeping matches.
    this.seqIndex = Math.max(0, this.seqIndex - 1);
    this.currentStep--;
    this.paused = true;
    this.highlightAndFocus(target, [target], 0, this.totalSteps(), this.seqIndex, /* silent */ false);
    this.onPause?.();
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

  /** Total steps in this tour's sequence, filtered by current depth level.
   *  Returns the cached pre-computed value when seq/_depthLevel are unchanged
   *  since the last compute. recomputeTotal() must be called whenever either
   *  changes (start, depth-level change, restart). */
  totalSteps(): number {
    return this._cachedTotalSteps;
  }

  /** Re-scan the current seq and cache the count of visitable nodes for this
   *  depth level. Call once after applyRootScope()/setMaxDepth()/restart —
   *  anywhere the seq or _depthLevel changes. O(N) but only paid once per
   *  mutation instead of O(N×steps). */
  private recomputeTotal(): void {
    if (this._depthLevel >= 5) {
      this._cachedTotalSteps = this.seq.length;
      return;
    }
    let count = 0;
    for (const id of this.seq) {
      const node = this.cy.getElementById(id);
      if (node.empty() || node.hasClass('layer-parent')) continue;
      if (!isNodeInLevel(node, this._depthLevel)) continue;
      count++;
    }
    this._cachedTotalSteps = count;
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
   *
   * 输出截断：超过 PREVIEW_HEAD + PREVIEW_TAIL 行时中间省略，
   * 避免一次 dump 641 行刷屏控制台。
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

      const formatLine = (id: string, i: number): string => {
        const n = this.cy.getElementById(id);
        const label = n.empty() ? `(missing: ${id})` : (n.data('label') || id);
        const loc = n.empty() ? '' : (() => {
          const l = n.data('location') as Record<string, string> | null;
          if (!l) return '';
          return [l['book'], l['chapter'], l['section']].filter(Boolean).join(' › ');
        })();
        return `  ${String(i + 1).padStart(3)}. ${label}${loc ? `  [${loc}]` : ''}`;
      };

      console.log(`[Tour Preview] ${s.label} (${seq.length} nodes):`);
      const head = PREVIEW_HEAD_LINES;
      const tail = PREVIEW_TAIL_LINES;
      if (seq.length <= head + tail) {
        seq.forEach((id, i) => console.log(formatLine(id, i)));
      } else {
        seq.slice(0, head).forEach((id, i) => console.log(formatLine(id, i)));
        console.log(`  ... (${seq.length - head - tail} nodes omitted) ...`);
        seq.slice(seq.length - tail).forEach((id, i) =>
          console.log(formatLine(id, seq.length - tail + i)),
        );
      }
    });
  }

  setInterval(ms: number): void {
    this.interval = ms;
  }

  setMaxDepth(depth: number): void {
    // 滑块值 1-5 只控制档位（显示层级），始终使用无限模式（步数不受限制）
    // 档位 5 = 全部（无限漫游）
    const newLevel = depth <= 0 ? 5 : depth;
    if (newLevel !== this._depthLevel) {
      this._depthLevel = newLevel;
      // Depth changed — the visible node count for the same seq is now
      // different, so invalidate the cache.
      this.recomputeTotal();
    }
    this.maxDepth = -1; // 始终无限，让档位过滤单独工作
  }

  /**
   * 获取当前档位对应的中文标签
   */
  getDepthLabel(): string {
    return TOUR_DEPTH_CONFIG.getLabel(this._depthLevel);
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    clearTimeout(this.timer);
    const t = this;
    // 总间隔 = 滑块值（包含动画 600ms），所以 setTimeout 延迟 = 滑块值 - 动画时间
    // 如果滑块值小于动画时间，则间隔设为 0（动画完成后立即开始下一步）
    const delay = Math.max(0, this.interval - 600);
    this.timer = setTimeout(() => {
      if (!t.stopped && !t.paused) {
        t.visitNext();
      }
    }, delay);
  }

  /**
   * Scope `this.seq` to the subtree rooted at `this._rootId`.
   * Called both from `start()` (one-time setup) and from the restart path
   * so that every loop cycle still begins from the same selected node.
   *
   * Uses pure position-based slicing on the strategy's existing sequence: find
   * where rootId appears in the full DFS order and drop everything before it.
   * This is robust regardless of graph edge directions, avoids collecting
   * ancestors/descendants via BFS, and guarantees the tour goes FORWARD from
   * rootId (not backward toward book-y2) even when the graph has upstream edges.
   */
  private applyRootScope(): void {
    const rootId = this._rootId;
    if (!rootId || this.seq[0] === rootId) {
      return;
    }

    // Find rootId's position in the strategy's full DFS order
    const idx = this.seq.indexOf(rootId);
    if (idx >= 0) {
      // Drop everything before rootId — this is the "skip to minute 30" logic.
      // The strategy's own DFS already determines the forward traversal order,
      // so we just restart from rootId's position and go forward.
      this.seq = this.seq.slice(idx);
    } else {
      // rootId not in seq (shouldn't happen, but handle defensively)
      this.seq = [rootId, ...this.seq.filter((id) => id !== rootId)];
    }
    // seq changed (length and contents); refresh the cached visit count
    // so totalSteps() returns an accurate value without re-scanning.
    this.recomputeTotal();
  }

  private visitNext(): void {
    if (this.stopped) return;
    let restarted = false;
    let loopSafety = 0;
    while (true) {
      loopSafety++;
      if (loopSafety > LOOP_SAFETY_LIMIT) { this.stopped = true; return; }
      while (this.seqIndex < this.seq.length) {
        const id = this.seq[this.seqIndex];
        const node = this.cy.getElementById(id);
        this.seqIndex++;
        // 策略钩子：允许策略在节点进入视野前拦截（过滤或自定义行为）
        if (this._hooks.shouldVisit && !this._hooks.shouldVisit(id, this.cy)) continue;
        if (!node.empty() && !node.hasClass('layer-parent')) {
          // 档位过滤：检查节点是否属于当前档位的内容范围
          // _depthLevel 1-5，档位 5 = 全部（不过滤）
          if (this._depthLevel < 5) {
            if (!isNodeInLevel(node, this._depthLevel)) {
              continue; // 跳过不在当前档位范围内的节点
            }
          }
          this.currentStep++;
          // Use the graph's real BFS depth (0=root/center, higher=outer layers).
          const nodeDepth = (node.data('depth') as number) ?? 0;
          this._visited.push(id);
          this.highlightAndFocus(id, [id], nodeDepth, this.totalSteps(), this.seqIndex);
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
          // Re-apply the rootId scoping that was set up in start(). Without
          // this, the restart would regenerate the FULL graph sequence (641
          // nodes) and lose the user's "start from here" intent — the tour
          // would suddenly jump back to book-y2 instead of looping over the
          // selected subtree.
          this.applyRootScope();
          this.seqIndex = 0;
          // 新一轮：currentStep 也要重置回 0（visitNext 内会 ++ 到 1）
          this.currentStep = 0;
          // Also reset visit history — start of a new cycle.
          this._visited = [];
          // 策略钩子：一轮遍历结束（即将开始新一轮）
          this._hooks.onCycleEnd?.(this.cy);
          continue;
        }
      }

      this._restartAttempts = 0;
      this.stopped = true;
      // Distinguish between the configured-depth (normal) and the
      // restart-loop exhaustion paths so the controller can tell the user
      // why the tour stopped on its own (issue #16). Include maxAttempts so
      // the controller doesn't have to hardcode "3".
      const reason: TourCompleteReason = this.maxDepth < 0 ? 'no-more-restarts' : 'depth-reached';
      this.onComplete?.({ reason, maxAttempts: MAX_RESTART_ATTEMPTS });
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
    // 与 highlightNode 保持一致：用 neighborhood 而非 connectedEdges().targets()
    // neighborhood 覆盖所有相邻节点（无论边的方向）
    node.neighborhood('node').not('.layer-parent').removeClass('dimmed').addClass('highlighted');

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