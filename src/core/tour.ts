// src/core/tour.ts
// Auto-exploration engine — Strategy pattern, 2 built-in strategies.

export interface TourOptions {
  interval: number;
  maxDepth: number;
  strategy: TourStrategy;
  onStep?: (info: TourStepInfo) => void;
  /** Called after the pan animation completes */
  onStepAfterCenter?: (info: TourStepInfo) => void;
  onComplete?: () => void;
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

export type TourStrategy =
  | 'has-dfs'
  | 'topo-prereq';

export const TOUR_STRATEGY_LABELS: Record<TourStrategy, string> = {
  'has-dfs':    'E1 教材顺序DFS',
  'topo-prereq':'E2 层级依赖BFS',
};

export interface TourStrategyImpl {
  /** Unique strategy id */
  id: TourStrategy;
  /** Human-readable label shown in the UI */
  label: string;
  /**
   * Build the full traversal sequence before the tour starts.
   * Returns an array of node ids in visit order.
   */
  buildSequence(cy: cytoscape.Core): string[];
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
function extractSectionNumber(section: string): number {
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



class HasDfsStrategy implements TourStrategyImpl {
  id = 'has-dfs' as TourStrategy;
  label = TOUR_STRATEGY_LABELS['has-dfs'];

  buildSequence(cy: cytoscape.Core): string[] {
    // 直接按 location 字段全局排序：book > part > chapter > section > subsection > item
    // 这比 has 边 DFS 更可靠——location 已完整编码教材层级，DFS 反而因边覆盖不均引入乱序。
    const seen = new Set<string>();
    return cy.nodes().not('.layer-parent')
      .toArray()
      .sort((a, b) => {
        const la = getLocationKey(a as cytoscape.NodeSingular);
        const lb = getLocationKey(b as cytoscape.NodeSingular);
        return la < lb ? -1 : la > lb ? 1 : 0;
      })
      .filter((n) => {
        const id = n.id();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((n) => n.id());
  }
}

// ── E2: 层级依赖拓扑排序 ───────────────────────────────────────────────────────

class TopoPrereqStrategy implements TourStrategyImpl {
  id = 'topo-prereq' as TourStrategy;
  label = TOUR_STRATEGY_LABELS['topo-prereq'];

  buildSequence(cy: cytoscape.Core): string[] {
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

    // tier 顺序：低 tier 优先，保证基础概念早于服务/法规节点
    const TIER_ORDER: Record<string, number> = {
      basic: 0, drug: 1, disease: 2, management: 3, service: 4, legal: 5,
    };
    const getTierOrder = (id: string): number =>
      TIER_ORDER[cy.getElementById(id).data('tier') as string] ?? 99;

    // 比较函数：先按 tier，再按 location
    const nodeCompare = (a: string, b: string): number => {
      const ta = getTierOrder(a), tb = getTierOrder(b);
      if (ta !== tb) return ta - tb;
      const la = getLocationKey(cy.getElementById(a));
      const lb = getLocationKey(cy.getElementById(b));
      return la < lb ? -1 : la > lb ? 1 : 0;
    };

    // 初始无前置节点按 tier → location 排序，不再 shuffle
    noPrereq.sort(nodeCompare);

    while (noPrereq.length > 0) {
      const curr = noPrereq.shift()!;
      seq.push(curr);
      for (const dep of prereqOut.get(curr) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          // 动态插入：按 tier → location 找插入位置
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

    // 未访问节点，按 location key 升序（保证同级入口先于子节点处理）
    const unvisited = nodes.toArray()
      .filter((n) => !seqSet.has(n.id()))
      .sort((a, b) => {
        const la = getLocationKey(a as cytoscape.NodeSingular);
        const lb = getLocationKey(b as cytoscape.NodeSingular);
        return la < lb ? -1 : la > lb ? 1 : 0;
      })
      .map((n) => n.id());

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
  }
}

// ── TourEngine ────────────────────────────────────────────────────────────────

export const ALL_STRATEGIES: TourStrategyImpl[] = [
  new HasDfsStrategy(),
  new TopoPrereqStrategy(),
];

export function getStrategy(id: TourStrategy): TourStrategyImpl {
  return ALL_STRATEGIES.find((s) => s.id === id) ?? ALL_STRATEGIES[0];
}

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
  private strategyName = '';
  // Tracks how many times we've rebuilt the visit sequence in the *current*
  // tour invocation, when infinite mode (maxDepth < 0) loops back. Caps at 3
  // to prevent pathological re-runs from locking the UI. Resets in start() and
  // when the tour ends naturally. Previously misnamed `_recursionCount` —
  // it is not a recursion counter in the call-stack sense.
  private _restartAttempts = 0;

  constructor(cy: cytoscape.Core) {
    this.cy = cy;
  }

  clearAllNodeInlineStyles(): void {
    this.cy.nodes().forEach((n: cytoscape.NodeSingular) => {
      n.style({ 'border-width': 1.5, 'border-color': 'rgba(255,255,255,0.06)' });
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
    this.strategyName = strategy.label;

    // Build full sequence
    this.seq = strategy.buildSequence(this.cy);
    // If seq is empty (no roots found), fall back to all non-parent nodes shuffled
    if (this.seq.length === 0) {
      const allNodes = this.cy.nodes().not('.layer-parent').toArray();
      shuffleInPlace(allNodes);
      this.seq = allNodes.map((n) => n.id());
    }
    // If a rootId was specified and not in seq, prepend it
    if (rootId && !this.seq.includes(rootId)) {
      this.seq = [rootId, ...this.seq.filter((id) => id !== rootId)];
    }
    // Remove duplicates while preserving order
    const seen = new Set<string>();
    this.seq = this.seq.filter((id) => { if (seen.has(id)) return false; seen.add(id); return true; });

    this.seqIndex = 1; // seq[0] is visited below; visitNext should start from seq[1]
    this.currentStep = 1;
    this.totalExplored = this.cy.nodes().size();

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
    this.stopped = true;
    this.paused = false;
  }

  isRunning(): boolean {
    return !this.paused && !this.stopped;
  }

  isPaused(): boolean {
    return this.paused && !this.stopped;
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

      console.log(`\n▶ ${s.label}  (${seq.length} 个节点)\n${lines.join('\n')}`);
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
        if (!node.empty() && !node.hasClass('layer-parent')) {
          this.currentStep++;
          const depth = 0;
          this.highlightAndFocus(id, [id], depth, this.seq.length, this.seqIndex);
          if (this.maxDepth > 0 && this.seqIndex >= this.maxDepth) {
            this.stopped = true;
            this.onComplete?.();
          }
          return;
        }
      }

      // seq exhausted — restart if infinite mode and haven't already restarted
      if (this.maxDepth < 0 && !restarted) {
        restarted = true;
        this.cycleCount++;
        this._restartAttempts++;
        if (this._restartAttempts < 3) {
          const strategy = getStrategy(this.getStrategyId());
          this.seq = strategy.buildSequence(this.cy);
          if (this.seq.length === 0) {
            const allNodes = this.cy.nodes().not('.layer-parent').toArray();
            shuffleInPlace(allNodes);
            this.seq = allNodes.map((n) => n.id());
          }
          const seen = new Set<string>();
          this.seq = this.seq.filter((id) => { if (seen.has(id)) return false; seen.add(id); return true; });
          this.seqIndex = 0;
          continue;
        }
      }

      this._restartAttempts = 0;
      this.stopped = true;
      this.onComplete?.();
      return;
    }
  }

  private getStrategyId(): TourStrategy {
    // Try to infer from strategyName
    for (const s of ALL_STRATEGIES) {
      if (s.label === this.strategyName) return s.id;
    }
    return 'has-dfs';
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
      strategyName: this.strategyName,
    };

    this.cy.stop();
    this.cy.animate({
      center: { eles: node },
      zoom: depth === 0 ? 1.5 : 1.3,
      duration: 600,
      easing: 'ease-out-cubic',
      complete: () => {
        this.onStepAfterCenter?.(stepInfo);
        if (!this.stopped && !this.paused) this.scheduleNext();
      },
    } as cytoscape.AnimationOptions);

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