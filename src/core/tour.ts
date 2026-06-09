// src/core/tour.ts
// BFS auto-exploration tour engine — pure logic, no UI

export interface TourOptions {
  interval: number;
  maxDepth: number;
  onStep?: (info: TourStepInfo) => void;
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
}

export class TourEngine {
  private cy: cytoscape.Core;
  private interval = 3000;
  private maxDepth = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private stopped = false;
  private onStep?: TourOptions['onStep'];
  private onComplete?: TourOptions['onComplete'];
  private onPause?: TourOptions['onPause'];
  private onResume?: TourOptions['onResume'];

  private visited = new Set<string>();
  private queue: Array<{ id: string; depth: number }> = [];
  private layerCounts: Map<number, number> = new Map();
  private totalExplored = 0;
  private totalToExplore = 0;
  private currentStep = 0;
  private currentDepth = 0;
  private currentLayerIndex = 0;
  private cycleCount = 0;
  private startNode = '';
  private bfsParent = new Map<string, string>();

  constructor(cy: cytoscape.Core) {
    this.cy = cy;
  }

  clearAllNodeInlineStyles(): void {
    this.cy.nodes().forEach((n: cytoscape.NodeSingular) => {
      n.style({
        'border-width': 1.5,
        'border-color': 'rgba(255,255,255,0.06)',
      });
    });
  }

  start(rootId: string, options: TourOptions = { interval: 3000, maxDepth: -1 }): void {
    this.stop();
    this.visited = new Set();
    this.queue = [];
    this.layerCounts = new Map();
    this.interval = options.interval ?? 3000;
    this.maxDepth = options.maxDepth ?? -1;
    this.onStep = options.onStep;
    this.onComplete = options.onComplete;
    this.onPause = options.onPause;
    this.onResume = options.onResume;
    this.paused = false;
    this.stopped = false;
    this.totalExplored = 0;
    this.totalToExplore = this.cy.nodes().size();
    this.currentStep = 0;
    this.currentDepth = 0;
    this.currentLayerIndex = 0;
    this.cycleCount = 0;
    this.startNode = rootId;
    this.bfsParent = new Map();

    this.visited.add(rootId);
    this.queue.push({ id: rootId, depth: 0 });
    this.layerCounts.set(0, 1);

    this.highlightAndFocus(rootId, [rootId], 0, 1, 1);
    this.scheduleNext();
  }

  pause(): void {
    if (this.paused || this.stopped) return;
    this.paused = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.stopTourPulse();
    this.onPause?.();
  }

  resume(): void {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    // 恢复当前节点的脉冲
    if (this.pulsingNode && !this.pulsingNode.removed()) {
      this.startTourPulse(this.pulsingNode);
    }
    this.onResume?.();
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.pulsingNode) this.stopTourPulse();
    this.clearAllNodeInlineStyles(); // 清除所有节点的内联白色边框
    this.stopped = true;
    this.paused = false;
  }

  isRunning(): boolean {
    return !this.paused && !this.stopped;
  }

  isPaused(): boolean {
    return this.paused && !this.stopped;
  }

  setInterval(ms: number): void {
    this.interval = ms;
  }

  setMaxDepth(depth: number): void {
    this.maxDepth = depth;
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => this.visitNext(), this.interval);
  }

  private visitNext(): void {
    if (this.stopped || this.paused) return;

    // Dequeue next node
    const next = this.queue.shift();
    if (!next) {
      if (this.maxDepth < 0) {
        // Unlimited: restart from root
        this.cycleCount++;
        this.visited = new Set();
        this.queue = [];
        this.layerCounts = new Map();
        this.bfsParent = new Map();
        this.bfsParent.set(rootId, '');
        const rootNode = this.cy.nodes().not('.layer-parent')[0];
        if (rootNode) {
          const rootId = rootNode.id();
          this.visited.add(rootId);
          this.queue.push({ id: rootId, depth: 0 });
          this.layerCounts.set(0, 1);
          this.visitNext();
        } else {
          this.stopped = true;
          this.onComplete?.();
        }
      } else {
        this.stopped = true;
        this.onComplete?.();
      }
      return;
    }

    const { id, depth } = next;
    this.currentStep++;
    const node = this.cy.getElementById(id);

    // Skip if node no longer exists in graph
    if (node.empty()) {
      this.visitNext();
      return;
    }

    // Skip layer-parent meta nodes
    if (node.hasClass('layer-parent')) {
      this.visitNext();
      return;
    }

    // Update layer tracking
    if (depth !== this.currentDepth) {
      this.currentDepth = depth;
      this.currentLayerIndex = 1;
    } else {
      this.currentLayerIndex++;
    }

    const layerSize = this.layerCounts.get(depth) || 1;

    // Build path: find shortest path from root
    const path = this.buildPath(id);
    this.highlightAndFocus(id, path, depth, layerSize, this.currentLayerIndex);

    // Enqueue unvisited neighbors — write bfsParent so buildPath is O(path length)
    const neighbors = node.neighborhood('node').not(node).not('.layer-parent');
    neighbors.forEach((n: cytoscape.NodeSingular) => {
      const nid = n.id();
      if (!this.visited.has(nid)) {
        this.visited.add(nid);
        this.bfsParent.set(nid, id);
        this.queue.push({ id: nid, depth: depth + 1 });
        this.totalExplored++;
        // Track layer size
        const count = this.layerCounts.get(depth + 1) || 0;
        this.layerCounts.set(depth + 1, count + 1);
      }
    });

    // Check depth limit
    if (this.maxDepth > 0 && depth >= this.maxDepth) {
      this.stopped = true;
      this.onComplete?.();
      return;
    }

    this.scheduleNext();
  }

  private buildPath(targetId: string): string[] {
    if (!this.bfsParent.has(targetId)) return [targetId];
    const path: string[] = [];
    let cur: string = targetId;
    while (cur) {
      path.unshift(cur);
      cur = this.bfsParent.get(cur) ?? '';
    }
    return path;
  }

  private highlightAndFocus(
    nodeId: string,
    path: string[],
    depth: number,
    layerSize: number,
    layerIdx: number
  ): void {
    const node = this.cy.getElementById(nodeId);
    const pathLabels = path.map((id) => this.cy.getElementById(id).data('label') || id);

    // 停止上一次漫游节点的脉冲动画
    this.stopTourPulse();
    // 清除残留的内联白色边框（stopTourPulse 已清，但保险起见立即清理）
    this.clearAllNodeInlineStyles();

    // 移除所有高亮态，防止前一个主角的边/邻居残留
    this.cy.elements().removeClass('selected-node highlighted highlighted-edge');

    // Dim everything first
    this.cy.elements().addClass('dimmed');

    // Highlight current node and its direct neighborhood
    node.removeClass('dimmed highlighted').addClass('selected-node');
    node.connectedEdges().removeClass('dimmed').addClass('highlighted-edge');
    node.connectedEdges().targets().not('.layer-parent').removeClass('dimmed').addClass('highlighted');

    // 聚光灯脉冲动画：shadow 在节点外围周期性扩散
    this.startTourPulse(node);

    // Animate to center on node
    this.cy.animate({
      center: { eles: node },
      zoom: depth === 0 ? 1.5 : 1.3,
      duration: 600,
      easing: 'ease-out-cubic',
    });

    this.onStep?.({
      nodeId,
      label: node.data('label') || nodeId,
      depth,
      path,
      pathLabels,
      layerSize,
      layerIndex: layerIdx,
      totalExplored: this.totalExplored,
      totalToExplore: this.totalToExplore,
      currentStep: this.currentStep,
      maxDepthReached: depth,
      cycleCount: this.cycleCount,
    });
  }

    // 聚光灯脉冲状态
  private pulseRafId: number | null = null;
  private pulsingNode: cytoscape.NodeSingular | null = null;

  private startTourPulse(node: cytoscape.NodeSingular): void {
    this.pulsingNode = node;
    let frame = 0;

    // 节点边框脉冲（金色）
    const animateBorder = () => {
      if (!node.cy() || node.removed() || this.pulsingNode !== node) {
        this.pulseRafId = null;
        return;
      }
      frame++;
      const t = frame / 60;
      const pulse = (Math.sin(t * Math.PI * 2) + 1) / 2; // 0→1→0
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
      this.pulsingNode.style({
        'border-width': null,
        'border-color': null,
      });
    }
    this.pulsingNode = null;
  }
}
