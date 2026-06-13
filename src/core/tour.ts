// src/core/tour.ts
// Auto-exploration engine — Strategy pattern, 5 built-in strategies.

export interface TourOptions {
  interval: number;
  maxDepth: number;
  strategy: TourStrategy;
  onStep?: (info: TourStepInfo) => void;
  onComplete?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onAfterCenter?: (pan: { x: number; y: number }) => { x: number; y: number };
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
  | 'full-bfs'
  | 'field-layer'
  | 'tier-layer'
  | 'topo-prereq';

export const TOUR_STRATEGY_LABELS: Record<TourStrategy, string> = {
  'has-dfs':    'E1 has边优先（深度优先）',
  'full-bfs':   'E2 全边BFS',
  'field-layer': 'E3 学科分块',
  'tier-layer':  'E4 层次分层',
  'topo-prereq':'E5 先修链',
};

export interface StrategyNode {
  id: string;
  depth: number;
}

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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getField(node: cytoscape.NodeSingular): string {
  return node.data('field') ?? node.data('category') ?? '';
}

function getTier(node: cytoscape.NodeSingular): string {
  return node.data('tier') ?? node.data('layer') ?? '';
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

function getLocationSection(node: cytoscape.NodeSingular): string {
  const loc = node.data('location');
  if (typeof loc === 'object' && loc !== null) {
    return (loc as Record<string, unknown>)['section'] as string ?? '';
  }
  return '';
}

// 汉字数字转阿拉伯数字
const CN_DIGIT_MAP: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

// 从"第X节"或"第X章"格式中提取数字
function extractSectionNumber(section: string): number {
  if (!section) return 0; // 没有 section 的节点（如章入口）排在前面
  const match = section.match(/第(.+?)[章节]/);
  if (!match) return 999; // 没有章节号的排后面
  const numStr = match[1];
  if (/^\d+$/.test(numStr)) return parseInt(numStr, 10);
  // 处理"十一"、"二十三"等汉字数字
  let result = 0;
  if (numStr.includes('十')) {
    const parts = numStr.split('十');
    if (parts[0] === '') result = 10;
    else if (parts[1] === '') result = CN_DIGIT_MAP[parts[0]] * 10;
    else result = (CN_DIGIT_MAP[parts[0]] || 1) * 10 + (CN_DIGIT_MAP[parts[1]] || 0);
  } else {
    result = CN_DIGIT_MAP[numStr] ?? 999;
  }
  return result;
}

// Full location sort key: book > chapter > section (章节按数字排序)
function getLocationKey(node: cytoscape.NodeSingular): string {
  const book = getLocationBook(node);
  const chapter = getLocationChapter(node);
  const section = getLocationSection(node);
  // Extract chapter number for proper ordering
  const chapterNum = extractSectionNumber(chapter).toString().padStart(3, '0');
  // Extract section number; use 999 for empty sections (chapter entries come before sections)
  const sectionNum = section ? extractSectionNumber(section).toString().padStart(3, '0') : '000';
  // When chapter is empty (book-level entry), use label as tiebreaker
  // When section is empty (chapter entry), it naturally sorts before sections with the same chapter
  return book + '\x00' + chapterNum + chapter + '\x00' + sectionNum + section + '\x00' + (node.data('label') ?? node.id());
}



class HasDfsStrategy implements TourStrategyImpl {
  id = 'has-dfs' as TourStrategy;
  label = TOUR_STRATEGY_LABELS['has-dfs'];

  buildSequence(cy: cytoscape.Core): string[] {
    const nodes = cy.nodes().not('.layer-parent');
    const edges = cy.edges();
    const seq: string[] = [];
    const visited = new Set<string>();

    // ── 1. Build has-edge adjacency (directed: src → tgt) ──────────────────
    const hasAdj = new Map<string, string[]>();
    // Track which nodes appear as has-edge targets (have an incoming has edge)
    const hasTargets = new Set<string>();

    nodes.forEach((n: cytoscape.NodeSingular) => { void hasAdj.set(n.id(), []); });
    edges.forEach((e) => {
      if (e.data('edgeType') === 'has') {
        const src = e.source().id();
        const tgt = e.target().id();
        hasAdj.get(src)?.push(tgt);
        hasTargets.add(tgt);
      }
    });

    // ── 2. DFS from a root along has-edges, emitting each node once ─────────
    const dfsFromRoot = (rootId: string): void => {
      if (visited.has(rootId)) return;
      const stack: string[] = [rootId];
      visited.add(rootId);
      seq.push(rootId);
      while (stack.length > 0) {
        const curr = stack.pop()!;
        // Sort children by full location key (ascending = smallest first)
        // Stack is LIFO: last pushed is first popped
        // To visit in ascending order, push in reverse order
        const children = (hasAdj.get(curr) ?? []).slice().sort((a, b) => {
          const la = getLocationKey(cy.getElementById(a));
          const lb = getLocationKey(cy.getElementById(b));
          console.log(`[SORT] ${a}: "${la}" vs ${b}: "${lb}" = ${la.localeCompare(lb)}`);
          return la.localeCompare(lb);
        });
        console.log(`[CHILDREN] ${curr} sorted: [${children.join(', ')}]`);
        for (let i = children.length - 1; i >= 0; i--) {
          const nb = children[i];
          if (!visited.has(nb)) {
            visited.add(nb);
            seq.push(nb);
            stack.push(nb);
          }
        }
      }
    };

    // ── 3. Collect all "entry" nodes: nodes with no incoming has-edge ───────
    //    Sort them by full location key (book › part › chapter › section…)
    //    so the traversal strictly follows the textbook hierarchy.
    const entryNodes = nodes
      .toArray()
      .filter((n) => !hasTargets.has(n.id()))
      .sort((a, b) => {
        const la = getLocationKey(a as cytoscape.NodeSingular);
        const lb = getLocationKey(b as cytoscape.NodeSingular);
        return la < lb ? -1 : la > lb ? 1 : 0;
      });

    // ── 4. DFS from each entry in location order ────────────────────────────
    for (const n of entryNodes) {
      dfsFromRoot(n.id());
    }

    // ── 5. Remaining nodes (not reachable via has-edges from any entry) ──────
    //    Sort by full location key, shuffle only within the same section group.
    const unvisited = nodes
      .toArray()
      .filter((n) => !visited.has(n.id()))
      .map((n) => n.id())
      .sort((a, b) => {
        const la = getLocationKey(cy.getElementById(a));
        const lb = getLocationKey(cy.getElementById(b));
        return la < lb ? -1 : la > lb ? 1 : 0;
      });

    // Shuffle within same book+chapter+section group, preserving cross-group order
    if (unvisited.length > 0) {
      const groupKey = (id: string): string => {
        const n = cy.getElementById(id);
        return getLocationBook(n) + '\x00' + getLocationChapter(n) + '\x00' + getLocationSection(n);
      };
      let groupStart = 0;
      for (let i = 1; i <= unvisited.length; i++) {
        const curr = groupKey(unvisited[i - 1]);
        const next = i < unvisited.length ? groupKey(unvisited[i]) : '__end__';
        if (curr !== next) {
          const group = unvisited.slice(groupStart, i);
          shuffleInPlace(group);
          for (const id of group) { if (!visited.has(id)) { visited.add(id); seq.push(id); } }
          groupStart = i;
        }
      }
    }

    // ── 6. Last resort: anything still missed ───────────────────────────────
    nodes.toArray().forEach((n) => {
      if (!visited.has(n.id())) seq.push(n.id());
    });

    return seq;
  }
}

// ── E2: 全边BFS，prerequisite优先 ───────────────────────────────────────────

class FullBfsStrategy implements TourStrategyImpl {
  id = 'full-bfs' as TourStrategy;
  label = TOUR_STRATEGY_LABELS['full-bfs'];

  buildSequence(cy: cytoscape.Core): string[] {
    const nodes = cy.nodes().not('.layer-parent');
    const edges = cy.edges();

    // ── Edge priority (lower = higher priority) ──────────────────────────────
    const PRIORITY: Record<string, number> = {
      prerequisite: 0,
      mechanism: 1,
      has: 2,
      treats: 3,
      relates: 4,
      causes: 5,
      activates: 6,
      inhibits: 7,
      metabolizes: 8,
      interacts: 9,
      contraindicates: 10,
      isa: 11,
    };
    const SEMANTIC_TYPES = new Set(Object.keys(PRIORITY));
    const BOOK_PENALTY = 3;
    const MAX_PRIORITY = 12;

    // ── Semantic-degree map for root selection ───────────────────────────────
    const semDegMap = new Map<string, number>();
    nodes.forEach((n: cytoscape.NodeSingular) => { semDegMap.set(n.id(), 0); });
    edges.forEach((e) => {
      const t: string = e.data('edgeType') ?? '';
      if (SEMANTIC_TYPES.has(t)) {
        semDegMap.set(e.source().id(), (semDegMap.get(e.source().id()) ?? 0) + 1);
        semDegMap.set(e.target().id(), (semDegMap.get(e.target().id()) ?? 0) + 1);
      }
    });

    // ── Build adjacency list with priority + target ──────────────────────────
    const adj = new Map<string, Array<{ target: string; basePriority: number }>>();
    nodes.forEach((n: cytoscape.NodeSingular) => { adj.set(n.id(), []); });
    edges.forEach((e) => {
      const src = e.source().id();
      const tgt = e.target().id();
      const t: string = e.data('edgeType') ?? '';
      const p = PRIORITY[t] ?? MAX_PRIORITY;
      adj.get(src)!.push({ target: tgt, basePriority: p });
      adj.get(tgt)!.push({ target: src, basePriority: p });
    });

    // ── Priority buckets (O(1) dequeue instead of O(n log n) full sort) ───────
    const buckets: Array<Array<{ id: string; depth: number; priority: number }>> =
      Array.from({ length: MAX_PRIORITY + 1 }, () => []);

    const enqueue = (id: string, depth: number, priority: number): void => {
      buckets[Math.min(priority, MAX_PRIORITY)].push({ id, depth, priority });
    };

    const dequeue = (): { id: string; depth: number; priority: number } | undefined => {
      for (const bucket of buckets) {
        if (bucket.length > 0) return bucket.shift()!;
      }
      return undefined;
    };

    // ── Multi-root: top-3 semantic hubs as simultaneous starting points ───────
    const topRoots = [...semDegMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    const visited = new Set<string>();
    const seq: string[] = [];

    if (topRoots.length === 0) {
      // Fallback: no semantic edges at all, visit all nodes in location order
      nodes.toArray()
        .sort((a, b) => (getLocationBook(a as cytoscape.NodeSingular) + getLocationBook(a as cytoscape.NodeSingular))
          .localeCompare(getLocationBook(b as cytoscape.NodeSingular) + getLocationBook(b as cytoscape.NodeSingular)))
        .forEach((n) => { if (!visited.has(n.id())) { visited.add(n.id()); seq.push(n.id()); } });
      return seq;
    }

    for (const rootId of topRoots) {
      if (visited.has(rootId)) continue;
      visited.add(rootId);
      seq.push(rootId);

      const rootNbs = adj.get(rootId) ?? [];
      for (const { target, basePriority } of rootNbs) {
        if (!visited.has(target)) {
          enqueue(target, 1, basePriority);
        }
      }
    }

    // ── Main BFS loop ────────────────────────────────────────────────────────
    while (true) {
      const curr = dequeue();
      if (!curr) break;
      if (visited.has(curr.id)) continue;
      visited.add(curr.id);
      seq.push(curr.id);

      const currBook = getLocationBook(cy.getElementById(curr.id));
      const neighbors = adj.get(curr.id) ?? [];
      for (const { target, basePriority } of neighbors) {
        if (visited.has(target)) continue;
        const targetBook = getLocationBook(cy.getElementById(target));
        const penalty = currBook !== targetBook && currBook !== '' ? BOOK_PENALTY : 0;
        enqueue(target, curr.depth + 1, basePriority + penalty);
      }
    }

    // ── Fill any unvisited nodes ─────────────────────────────────────────────
    nodes.toArray().forEach((n) => {
      if (!visited.has(n.id())) seq.push(n.id());
    });

    return seq;
  }
}

// ── E3: field分块 + has边层级展开 ─────────────────────────────────────────────

class FieldLayerStrategy implements TourStrategyImpl {
  id = 'field-layer' as TourStrategy;
  label = TOUR_STRATEGY_LABELS['field-layer'];

  buildSequence(cy: cytoscape.Core): string[] {
    const nodes = cy.nodes().not('.layer-parent');
    const edges = cy.edges();

    // Group nodes by field
    const fieldMap = new Map<string, string[]>();
    nodes.forEach((n: cytoscape.NodeSingular) => {
      const f = getField(n) || 'other';
      if (!fieldMap.has(f)) fieldMap.set(f, []);
      fieldMap.get(f)!.push(n.id());
    });

    // Sort fields deterministically
    const fields = [...fieldMap.keys()].sort();

    // Build has-edge adjacency
    const hasAdj = new Map<string, string[]>();
    nodes.forEach((n: cytoscape.NodeSingular) => { void hasAdj.set(n.id(), []); });
    edges.forEach((e) => {
      const src = e.source().id();
      const tgt = e.target().id();
      if (e.data('edgeType') === 'has') {
        hasAdj.get(src)?.push(tgt);
      }
    });

    const visited = new Set<string>();
    const seq: string[] = [];

    const bfsFromRoot = (rootId: string, adj: Map<string, string[]>): void => {
      const q: string[] = [rootId];
      const seen = new Set<string>([rootId]);
      while (q.length > 0) {
        const curr = q.shift()!;
        if (!visited.has(curr)) { visited.add(curr); seq.push(curr); }
        const nbs = adj.get(curr) ?? [];
        for (const nb of nbs) {
          if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
        }
      }
    };

    for (const field of fields) {
      const nodeIds = fieldMap.get(field)!;
      // Within each field: find nodes that are roots (no incoming has edges)
      const hasTargets = new Set<string>();
      edges.forEach((e) => {
        if (e.data('edgeType') === 'has') hasTargets.add(e.target().id());
      });
      const roots = nodeIds.filter((id) => !hasTargets.has(id));
      // Sort roots by location
      roots.sort((a, b) => {
        const na = cy.getElementById(a);
        const nb = cy.getElementById(b);
        const la = getLocationBook(na) + getLocationChapter(na);
        const lb = getLocationBook(nb) + getLocationChapter(nb);
        return la < lb ? -1 : la > lb ? 1 : 0;
      });

      for (const root of roots) {
        if (!visited.has(root)) bfsFromRoot(root, hasAdj);
      }

      // Remaining nodes in this field
      const remaining = nodeIds.filter((id) => !visited.has(id));
      remaining.sort((a, b) => {
        const na = cy.getElementById(a);
        const nb = cy.getElementById(b);
        const la = getLocationBook(na) + getLocationChapter(na);
        const lb = getLocationBook(nb) + getLocationChapter(nb);
        if (la < lb) return -1;
        if (la > lb) return 1;
        return 0;
      });
      for (const id of remaining) { if (!visited.has(id)) { visited.add(id); seq.push(id); } }
    }

    // Leftover
    nodes.toArray().forEach((n) => {
      if (!visited.has(n.id())) seq.push(n.id());
    });

    return seq;
  }
}

// ── E4: tier分层 + 连通分量BFS ───────────────────────────────────────────────

class TierLayerStrategy implements TourStrategyImpl {
  id = 'tier-layer' as TourStrategy;
  label = TOUR_STRATEGY_LABELS['tier-layer'];

  buildSequence(cy: cytoscape.Core): string[] {
    const nodes = cy.nodes().not('.layer-parent');
    const edges = cy.edges();

    // Tiers in learning order
    const TIER_ORDER = ['basic', 'drug', 'disease', 'management', 'service', 'legal'];
    const tierOrderMap = new Map<string, number>();
    TIER_ORDER.forEach((t, i) => tierOrderMap.set(t, i));
    const getTierOrder = (t: string) => tierOrderMap.get(t) ?? 99;

    // Build graph adjacency
    const adj = new Map<string, string[]>();
    nodes.toArray().forEach((n) => adj.set(n.id(), []));
    edges.forEach((e) => {
      const src = e.source().id();
      const tgt = e.target().id();
      adj.get(src)!.push(tgt);
      adj.get(tgt)!.push(src);
    });

    // Find connected components
    const visited = new Set<string>();
    const components: string[][] = [];
    nodes.toArray().forEach((n) => {
      if (!visited.has(n.id())) {
        const comp: string[] = [];
        const q: string[] = [n.id()];
        visited.add(n.id());
        while (q.length > 0) {
          const curr = q.shift()!;
          comp.push(curr);
          for (const nb of adj.get(curr) ?? []) {
            if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
          }
        }
        components.push(comp);
      }
    });

    // Sort components by their tier weighted-average (not minimum).
    // A component with 90% drug + 10% basic gets score near drug's order,
    // so it won't be dragged down by a few low-tier nodes.
    const compTierScore = (comp: string[]): number => {
      const counts = new Map<number, number>();
      for (const id of comp) {
        const o = getTierOrder(getTier(cy.getElementById(id)));
        counts.set(o, (counts.get(o) ?? 0) + 1);
      }
      let sum = 0, total = 0;
      for (const [order, count] of counts) {
        sum += order * count;
        total += count;
      }
      return total > 0 ? sum / total : 99;
    };
    components.sort((a, b) => compTierScore(a) - compTierScore(b));

    // Within each component, sort nodes by tier then location
    const nodeTierScore = (id: string): number => {
      return getTierOrder(getTier(cy.getElementById(id)));
    };

    const visitedSeq = new Set<string>();
    const seq: string[] = [];

    // ── Build has-edge reverse map (target → sources) ──────────────────────────
    const hasIn = new Map<string, number>();
    nodes.toArray().forEach((n) => hasIn.set(n.id(), 0));
    edges.forEach((e) => {
      if (e.data('edgeType') === 'has') hasIn.set(e.target().id(), (hasIn.get(e.target().id()) ?? 0) + 1);
    });

    const isEntryNode = (id: string): boolean => hasIn.get(id) === 0;

    for (const comp of components) {
      // ── Step 1: entry nodes first, sorted by location ───────────────────────
      const entryIds = comp.filter(isEntryNode).sort((a, b) => {
        const na = cy.getElementById(a), nb = cy.getElementById(b);
        const la = getLocationBook(na) + getLocationChapter(na);
        const lb = getLocationBook(nb) + getLocationChapter(nb);
        return la < lb ? -1 : la > lb ? 1 : 0;
      });

      // ── Step 2: remaining nodes sorted by tier then location ───────────────
      const restIds = comp.filter((id) => !isEntryNode(id)).sort((a, b) => {
        const ta = nodeTierScore(a), tb = nodeTierScore(b);
        if (ta !== tb) return ta - tb;
        const na = cy.getElementById(a), nb = cy.getElementById(b);
        const la = getLocationBook(na) + getLocationChapter(na);
        const lb = getLocationBook(nb) + getLocationChapter(nb);
        return la < lb ? -1 : la > lb ? 1 : 0;
      });

      // ── Step 3: append to sequence with intra-group shuffle ─────────────────
      for (const bucket of [entryIds, restIds]) {
        let groupStart = 0;
        for (let i = 1; i <= bucket.length; i++) {
          const currKey = i > 0
            ? `${nodeTierScore(bucket[i - 1])}|${getLocationBook(cy.getElementById(bucket[i - 1]))}${getLocationChapter(cy.getElementById(bucket[i - 1]))}`
            : '__end__';
          const nextKey = i < bucket.length
            ? `${nodeTierScore(bucket[i])}|${getLocationBook(cy.getElementById(bucket[i]))}${getLocationChapter(cy.getElementById(bucket[i]))}`
            : '__end__';
          if (currKey !== nextKey) {
            const group = bucket.slice(groupStart, i);
            shuffleInPlace(group);
            for (const id of group) { if (!visitedSeq.has(id)) { visitedSeq.add(id); seq.push(id); } }
            groupStart = i;
          }
        }
      }
    }

    // Leftover
    nodes.toArray().forEach((n) => {
      if (!visitedSeq.has(n.id())) seq.push(n.id());
    });

    return seq;
  }
}

// ── E5: 先修链拓扑排序 ───────────────────────────────────────────────────────

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

    // Sort initial no-prereq nodes by location
    noPrereq.sort((a, b) => {
      const na = cy.getElementById(a);
      const nb = cy.getElementById(b);
      const la = getLocationBook(na) + getLocationChapter(na);
      const lb = getLocationBook(nb) + getLocationChapter(nb);
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
    shuffleInPlace(noPrereq);

    while (noPrereq.length > 0) {
      const curr = noPrereq.shift()!;
      seq.push(curr);
      for (const dep of prereqOut.get(curr) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          // Insert in location order
          const nb = cy.getElementById(dep);
          const loc = getLocationBook(nb) + getLocationChapter(nb);
          let inserted = false;
          for (let i = 0; i < noPrereq.length; i++) {
            const na = cy.getElementById(noPrereq[i]);
            const la = getLocationBook(na) + getLocationChapter(na);
            if (loc < la) { noPrereq.splice(i, 0, dep); inserted = true; break; }
          }
          if (!inserted) noPrereq.push(dep);
        }
      }
    }

    // For nodes with cycles or no prerequisite edges: handle by location
    const unvisited = nodes.filter((n) => !seq.includes(n.id())).map((n) => n.id());
    unvisited.sort((a, b) => {
      const na = cy.getElementById(a);
      const nb = cy.getElementById(b);
      const la = getLocationBook(na) + getLocationChapter(na);
      const lb = getLocationBook(nb) + getLocationChapter(nb);
      if (la < lb) return -1;
      if (la > lb) return 1;
      return 0;
    });
    // Shuffle within same book+chapter group
    let groupStart = 0;
    for (let i = 1; i <= unvisited.length; i++) {
      const currLoc = i < unvisited.length
        ? (() => { const n = cy.getElementById(unvisited[i - 1]); return getLocationBook(n) + getLocationChapter(n); })()
        : '__end__';
      const nextLoc = i < unvisited.length
        ? (() => { const n = cy.getElementById(unvisited[i]); return getLocationBook(n) + getLocationChapter(n); })()
        : '__end__';
      if (currLoc !== nextLoc) {
        const group = unvisited.slice(groupStart, i);
        shuffleInPlace(group);
        seq.push(...group);
        groupStart = i;
      }
    }

    return seq;
  }
}

// ── TourEngine ────────────────────────────────────────────────────────────────

export const ALL_STRATEGIES: TourStrategyImpl[] = [
  new HasDfsStrategy(),
  new FullBfsStrategy(),
  new FieldLayerStrategy(),
  new TierLayerStrategy(),
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
  private onComplete?: TourOptions['onComplete'];
  private onPause?: TourOptions['onPause'];
  private onResume?: TourOptions['onResume'];
  private onAfterCenter?: TourOptions['onAfterCenter'];

  // Pre-computed sequence
  private seq: string[] = [];
  private seqIndex = 0;
  private cycleCount = 0;
  private totalExplored = 0;
  private currentStep = 0;
  private pulseRafId: number | null = null;
  private pulsingNode: cytoscape.NodeSingular | null = null;
  private strategyName = '';
  private _recursionCount = 0;

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
    this.onComplete = options.onComplete;
    this.onPause = options.onPause;
    this.onResume = options.onResume;
    this.onAfterCenter = options.onAfterCenter;
    this.totalExplored = 0;
    this.currentStep = 0;
    this.cycleCount = 0;
    this._recursionCount = 0;

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
   *   uiState.tour.engine.previewSequence()           // 全部五种
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
        this._recursionCount++;
        if (this._recursionCount < 3) {
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

      this._recursionCount = 0;
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

    this.cy.stop();
    this.cy.animate({
      center: { eles: node },
      zoom: depth === 0 ? 1.5 : 1.3,
      duration: 600,
      easing: 'ease-out-cubic',
      complete: () => {
        if (this.onAfterCenter) {
          const currentPan = this.cy.pan();
          const adjusted = this.onAfterCenter(currentPan);
          this.cy.pan(adjusted);
        }
        if (!this.stopped && !this.paused) this.scheduleNext();
      },
    } as cytoscape.AnimationOptions);

    if (!silent) {
      this.onStep?.({
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
      });
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