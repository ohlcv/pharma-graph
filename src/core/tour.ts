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
  private currentDepth = 0;
  private currentLayerIndex = 0;
  private cycleCount = 0;

  constructor(cy: cytoscape.Core) {
    this.cy = cy;
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
    this.currentDepth = 0;
    this.currentLayerIndex = 0;
    this.cycleCount = 0;

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
    this.onPause?.();
  }

  resume(): void {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    this.onResume?.();
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
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

    // Enqueue unvisited neighbors
    const neighbors = node.neighborhood('node').not('.layer-parent');
    neighbors.forEach((n: cytoscape.NodeSingular) => {
      const nid = n.id();
      if (!this.visited.has(nid)) {
        this.visited.add(nid);
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
    // BFS to find shortest path from any visited node
    // Start from root (first in queue before this node)
    const startId = Array.from(this.visited)[0];
    if (startId === targetId) return [startId];

    const parent = new Map<string, string>();
    const queue: string[] = [startId];
    parent.set(startId, '');

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = this.cy.getElementById(current);
      const neighbors = node.neighborhood('node').not('.layer-parent');

      for (const n of neighbors) {
        const nid = n.id();
        if (!parent.has(nid)) {
          parent.set(nid, current);
          if (nid === targetId) {
            // Reconstruct path
            const path: string[] = [];
            let cur: string = targetId;
            while (cur) {
              path.unshift(cur);
              cur = parent.get(cur)!;
            }
            return path;
          }
          queue.push(nid);
        }
      }
    }

    return [targetId];
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

    // Dim everything first
    this.cy.elements().addClass('dimmed');

    // Highlight current node and its direct neighborhood
    node.removeClass('dimmed').addClass('highlighted');
    node.connectedEdges().removeClass('dimmed').addClass('highlighted-edge');
    node.neighborhood('node').not('.layer-parent').removeClass('dimmed').addClass('highlighted');

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
      maxDepthReached: depth,
      cycleCount: this.cycleCount,
    });
  }
}
