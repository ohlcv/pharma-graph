// src/ui/main.ts
// Application entry. Composes modules and wires them up — nothing more.
//
// Responsibilities:
//   - Load content, build graph, create renderer/highlight/detailPanel/search
//   - Mount the TourController
//   - Install the action dispatcher and register all data-action handlers
//   - Install keyboard shortcuts and resize handler
//   - Boot the music player + onboarding tip
//   - Expose window._dbg for console debugging
//
// Heavier logic lives in dedicated modules:
//   - action-handlers.ts  → registerAppActions
//   - layout-menu.ts     → open/close dropdown
//   - search-ui.ts       → initSearchUI
//   - music-player.ts    → initMusicPlayer
//   - debug-bridge.ts    → installDebugBridge
//
// ============================================================================
// Polyfill strategy:
//   • Modern browsers (Safari ≥15.4 / iOS ≥15.4): zero polyfill, native ES2019
//   • Legacy browsers (Safari <15 / iOS <15): handled by @vitejs/plugin-legacy
//     which generates a separate ES5 bundle with only the polyfills those
//     specific browsers actually lack. This replaces the old "full core-js/stable"
//     import that penalised every modern device.
//   • regenerator-runtime: included in the legacy bundle for async/await support
//     in environments that don't support it natively (iOS <15 / Safari <15).
// ============================================================================

import './styles/index.css';
import type cytoscape from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { GraphManager } from '../core/graph-manager.js';
import { TourController } from './tour-controller.js';
import { HighlightEngine } from './highlight-engine.js';
import { DetailPanel } from './detail-panel.js';
import { Search } from './search.js';
import { LAYOUTS, DEFAULT_LAYOUT } from '../core/config.js';
import { brandCarousel } from './carousel.js';
import { uiState } from './state.js';
import { logInfo } from './logger.js';
import {
  loadGraph,
  type LoadProgress as PrebuiltProgress,
} from '../core/prebuilt-loader.js';
import { detectDeviceCapability } from '../core/device-capability.js';
import { installDispatcher, dispatchAction } from './action-dispatcher.js';
import { updateStats, syncBottomSheetStats } from './graph-stats.js';
import { fitGraph, randomize, syncLayoutDisplay, setCurrentLayout, restoreBsAdvancedPrefs, renderLayoutParams } from './layout-manager.js';
import { initBigscreen, registerFitFn, registerTourController, registerCyAccessor, isBigscreen } from './bigscreen.js';
import { initGraphEvents } from './graph-events.js';
import { initSheetDrag, initPanelDrag, initPanelResize, syncTourBarPosition, initSectionHeights } from './drag-manager.js';
import {
  spawnNodeRipple,
  showZoomIndicator,
  showToast,
} from './ui-helpers.js';
import { initShortcuts } from './keyboard-shortcuts.js';
import {
  initDebugOverlay,
  setPrevSelectedNode,
  debugOverlayActive,
  updateForensicPanel,
} from './app-debug.js';
import { registerAppActions } from './action-handlers.js';
import { initSearchUI } from './search-ui.js';
import { initMusicPlayer } from './music-player.js';
import { installDebugBridge } from './debug-bridge.js';

let tourController: TourController;

// ── Loading Indicator (corner pill) ───────────────────────────────────────────

function updateLoadingIndicator(progress: PrebuiltProgress): void {
  const indicator = document.getElementById('loading-indicator');
  const label = document.getElementById('loading-label');
  const count = document.getElementById('loading-count');
  const percent = document.getElementById('loading-percent');

  if (!indicator) return;

  if (progress.phase === 'done') {
    indicator.classList.add('complete');
    if (label) label.textContent = '大爆炸';
    if (count) count.textContent = '';
    if (percent) percent.textContent = '100%';
    setTimeout(() => {
      indicator.classList.add('hidden');
      setTimeout(() => { indicator.style.display = 'none'; }, 600);
    }, 800);
    return;
  }

  // Phase 'prebuilt' — show single-step progress
  if (label) label.textContent = progress.message;
  if (count) count.textContent = '';
  if (percent) percent.textContent = '';
}

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  // 1) Create GraphManager — will be populated by the prebuilt loader
  const graphManager = new GraphManager({});

  // Brand carousel starts immediately — it has zero dependencies on graph
  // state and only touches the #carousel-text DOM node, which has been in
  // index.html from the start. Letting the carousel sit idle during the
  // loading wait made the topbar feel frozen; the carousel should keep
  // rolling the whole time and only the *dot's* colour is supposed to be
  // tied to the loading phase. The "by meow" mark and its CSS shimmer are
  // already running independently — start() just kicks off the word cycle.
  brandCarousel.start();

  // Email card needs no graph state — wire it before loading starts so the
  // meow word is always interactive, even while the big-bang is in progress.
  initBadgeEmailCard();

  // All panel/sheet drag, resize, section-height, and music-player init functions
  // touch only DOM nodes that exist from the first byte of index.html. They can
  // safely run before loading completes — dragging the sheet while the graph is
  // still streaming is a legitimate and useful interaction.
  initSheetDrag();
  initPanelDrag();
  initPanelResize();
  initSectionHeights();
  initMusicPlayer();
  showOnboardingTip();

  // 2) Load graph data. Two paths:
  //    - Default (prebuilt):  one ~800 KB JSON fetch, instant.
  //    - Fallback (md stream): when graph-data.json is missing/invalid,
  //      stream all 1041 .md files. Slower, but never blocks a deploy.
  const loadResult = await loadGraph(updateLoadingIndicator);
  const collectedFiles: Record<string, string> = loadResult.files;

  if (loadResult.usedPrebuilt) {
    // Fast path — all metadata is already in graph-data.json.
    graphManager.initWithPrebuilt({
      nodes: loadResult.graph.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        rel: n.sourcePath ?? '',
        fill: n.fill,
        stroke: n.stroke,
        shape: n.shape,
        shortSummary: n.shortSummary,
        fullSummary: n.fullSummary,
        summary: n.summary,
        depth: n.depth,
        subtreeRoot: n.subtreeRoot,
        weight: n.weight,
        location: n.location,
        tags: n.tags,
        edges_out: n.edges_out,
      })),
      edges: loadResult.graph.edges,
    });
  } else {
    // Fallback path — frontmatter-parser + BFS/DFS run inside the manager.
    graphManager.addFiles(collectedFiles);
  }

  // 3) Initialise cytoscape from the graph manager's data
  initGraphFromManager(graphManager, collectedFiles);

  // Stats + bottom-sheet counters
  queueMicrotask(() => dumpDiag(graphManager));

  // 4) Post-load: run euler layout to settle the graph (or skip on slow devices)
  const nodeCount = graphManager.getData().nodes.length;
  finishStreamingLayout({ nodeCount });

  // Only the dot's colour is gated on loading completion — carousel words
  // and "by meow" are now running from the top of boot(). See comment there.
  const badgeDot = document.getElementById('badge-dot');
  if (badgeDot) badgeDot.classList.remove('topbar__badge-dot--loading');

  // initResizeHandler() stays after the await — it calls fitGraph(uiState.renderer!)
  // which requires the Cytoscape instance to exist.
  initResizeHandler();
}

/**
 * Initialize cytoscape + event handlers from the current graph state.
 *
 * The graph data is fully available at init time (prebuilt path). For the
 * fallback (md streaming) path we keep the same signature: `collectedFiles`
 * is passed in so cytoscape initialiser can wire per-node body resolution
 * against the same source map (zero cost in the prebuilt path).
 */
function initGraphFromManager(
  graphManager: GraphManager,
  collectedFiles: Record<string, string>,
): void {
  const data = graphManager.getData();

  logInfo('graph build:', {
    nodes: data.nodes.length,
    edges: data.edges.length,
  });

  const container = document.getElementById('cy');
  if (!container) throw new Error('#cy container not found');

  uiState.renderer = new Renderer({
    container,
    data, // 第一批不需要预设位置：appendBatchToGraph 的动画会处理
    layoutName: 'preset', // 不在构造时跑 layout
    layoutConfigs: LAYOUTS,
  });

  uiState.highlight = new HighlightEngine(uiState.renderer.getCy());
  registerFitFn(() => fitGraph(uiState.renderer!));
  registerCyAccessor(() => uiState.renderer!.getCy());

  syncLayoutDisplay(DEFAULT_LAYOUT);
  setCurrentLayout(DEFAULT_LAYOUT);
  restoreBsAdvancedPrefs();

  uiState.detailPanel = new DetailPanel(uiState.renderer.getCy(), uiState.highlight, {
    onNodeClick: (nodeId) => {
      const node = uiState.renderer!.getCy().getElementById(nodeId);
      if (!node.empty()) {
        uiState.highlight!.highlightNode(nodeId);
        uiState.detailPanel!.show(nodeId, true);
        uiState.renderer!.getCy().animate({
          center: { eles: node },
          zoom: 1.5,
          duration: 400,
          easing: 'ease-out-cubic',
        });
      }
    },
    onClose: () => {
      uiState.highlight!.reset();
    },
  });

  uiState.search = new Search(uiState.renderer.getCy(), uiState.highlight);
  const cy = uiState.renderer.getCy();

  tourController = new TourController(cy, uiState.renderer, uiState.detailPanel!);
  tourController.mount();
  registerTourController(() => tourController.isRunning() || tourController.isPaused());

  initGraphEvents({
    cy,
    renderer: uiState.renderer,
    highlight: uiState.highlight!,
    detailPanel: uiState.detailPanel!,
    spawnNodeRipple,
    setPrevSelectedNode,
    showZoomIndicator,
    isDebugOverlayActive: () => debugOverlayActive,
    updateForensicPanel,
    tourController,
    setDragging: (d) => {
      uiState.isDragging = d;
    },
  });

  initDebugOverlay(uiState.renderer);

  // ── Wire up app-wide interactions the moment the graph is live, NOT
  //     after streaming finishes. ─────────────────────────────────────────
  // The streaming loader runs `initGraphFromManager` synchronously as soon
  // as the first batch arrives (so nodes appear to "grow" into view); only
  // later does `boot()` resume after `await loadContentStreaming(...)`.
  // Until now, installDispatcher / registerAppActions / initKeyboardShortcuts
  // / initBigscreen / installDebugBridge / initSearchUI were all called
  // after that await — meaning the moment a user could tap a node (via
  // graph-events.ts, which IS wired up here) they could open the detail
  // panel, but every `data-action` button (close ×, sidebar toggle,
  // bigscreen, toolbar layouts, …) and every keyboard shortcut was dead
  // until streaming fully completed. Symptom: "I opened detail during
  // streaming, can't close it, can't fullscreen, can't hide sidebar."
  //
  // Every dependency these need (uiState.renderer / highlight / detailPanel
  // / search / tourController / registerFitFn / registerCyAccessor) is
  // already initialised above. `installDispatcher` is idempotent, and
  // `initBigscreen` has its own rAF retry if cy isn't ready yet.
  // Sidebar toggle button's initial active state — read the sidebar DOM
  // synchronously so the toggle reflects reality the moment the graph
  // appears. Deferring this to after `await loadContentStreaming` meant
  // users who set sidebar hidden by default would see a stale-active
  // toggle button until streaming finished.
  const sidebar = document.getElementById('sidebar');
  const sidebarBtn = document.getElementById('btn-sidebar-toggle');
  const nodePanel = document.getElementById('node-panel');
  if (sidebar && sidebarBtn)
    sidebarBtn.classList.toggle('active', !sidebar.classList.contains('hidden'));
  if (nodePanel && sidebar)
    nodePanel.classList.toggle('sidebar-hidden-adjust', sidebar.classList.contains('hidden'));

  installDispatcher();
  registerAppActions(uiState.renderer, uiState.highlight!, uiState.detailPanel!);
  initKeyboardShortcuts();
  initBigscreen();
  installDebugBridge(uiState.renderer);
  initSearchUI(uiState.renderer.getCy(), uiState.highlight!, uiState.search!, uiState.detailPanel!);

  // Streaming 期间的初始 zoom——用 0.08 让用户能看到"全图概貌"，
  // 节点从中心爆出时整体框架已铺开。boot 完之后**不再动摄像头**——
  // euler 让节点收敛到哪里，镜头就停在哪里。
  cy.zoom(0.08);
  cy.center();

  // Apply "from-center growth" animation to all nodes simultaneously — prebuilt
  // path loads everything at once but we still want the visual entrance effect.
  cy.nodes().forEach((n, i) => {
    if (n.empty()) return;
    const angle = halton(i, 2) * Math.PI * 2;
    const ringRadius = 50 + halton(i, 3) * 280;
    n.position({ x: 0, y: 0 });
    n.addClass('entering');
    n.animate({
      position: {
        x: Math.cos(angle) * ringRadius,
        y: Math.sin(angle) * ringRadius,
      },
      duration: 520,
      easing: 'ease-out-cubic',
    });
    setTimeout(() => n.removeClass('entering'), 100 + i * 10);
  });

  // ── Populate sidebar the moment the graph is ready — not after layout settles.
  // stats (node/edge/selected/highlighted + essence/edge legend) are accurate as
  // soon as cy.add() has populated the registry; layout params are a pure
  // function of layout name and have nothing to do with physics.  This makes
  // the sidebar show live data during the Euler animation rather than freezing
  // until layoutstop fires.
  updateStats(cy);
  syncBottomSheetStats(cy);
  renderLayoutParams(DEFAULT_LAYOUT);
}

/**
 * After the manifest finishes, kick off the euler force-directed layout
 * once. Euler is allowed to run its full animation so users see nodes
 * drift from their "cosmic" positions into the organic, topology-aware
 * structure. This is the "gravity" phase of the cosmic metaphor: things
 * that "want to be" connected pull toward each other; lone nodes get
 * pushed apart.
 *
 * We deliberately do NOT touch the camera afterwards — euler lets nodes
 * settle where they settle, and the user sees exactly the final state
 * with no forced reframe. `cy.stop` cancels any in-flight position
 * animations from earlier "飞出去" bursts so euler owns the motion
 * without two systems fighting each other.
 *
 * This function ALSO owns the loading pill's fade-out trigger — the pill
 * disappears *after* euler's physical convergence finishes, so the
 * "大爆炸 / 100%" celebration is the last thing the user sees before the
 * graph enters its stable rest state. For small graphs (< 80 nodes) where
 * euler is skipped, the pill still fades out on a 100ms tick so we don't
 * strand it on screen.
 */
/**
 * After the manifest finishes, run the Euler force-directed layout once.
 *
 * Euler is allowed to run its full animation so users see nodes drift from
 * their halo positions into the organic, topology-aware structure. This is
 * the "gravity" phase of the cosmic metaphor.
 *
 * But Euler is expensive on slow devices — on a phone with a slow CPU the
 * simulation can take 25-40 seconds, eat battery, and risk "tab unresponsive"
 * warnings. We therefore:
 *
 *   1. Detect device capability up-front (cores + memory + network). If the
 *      device looks slow (≥2 strong signals), skip Euler entirely — the halo
 *      positions from the burst animation ARE the final positions.
 *
 *   2. As a hard ceiling regardless of device: if Euler hasn't converged
 *      after `EULER_HARD_TIMEOUT_MS`, force-stop the layout and freeze the
 *      in-flight positions. Better a frozen frame than a frozen tab.
 *
 * This function ALSO owns the loading pill's fade-out trigger — the pill
 * disappears after Euler converges (or times out, or is skipped). For small
 * graphs (< 80 nodes) Euler is skipped unconditionally because the halo
 * positions are already pretty and Euler just makes them jitter.
 */
const EULER_HARD_TIMEOUT_MS = 60_000;

function finishStreamingLayout(counts: { nodeCount: number }): void {
  if (!uiState.renderer) return;
  const cy = uiState.renderer.getCy();
  const nodeCount = counts.nodeCount;

  const completeLoading = (): void => {
    updateLoadingIndicator({
      phase: 'done',
      loaded: nodeCount,
      total: nodeCount,
      message: '准备就绪',
    });
  };

  // ── Skip 1: too few nodes — Euler jitter worse than halo positions ─────
  if (nodeCount < 80) {
    setTimeout(completeLoading, 100);
    return;
  }

  // ── Skip 2: device too slow — Euler would block the tab for 25-40s ─────
  const capability = detectDeviceCapability();
  if (!capability.shouldRunEuler) {
    logInfo('Euler skipped (slow device):', capability.reason);
    setTimeout(completeLoading, 100);
    return;
  }

  // ── Run Euler with a hard 10s ceiling ──────────────────────────────────
  cy.stop(undefined, true);
  cy.elements().removeClass('entering');

  let settled = false;
  const finalize = (): void => {
    if (settled) return;
    settled = true;
    waitForGraphToSettle(cy, completeLoading);
  };

  // Hard timeout: if Euler hasn't emitted layoutstop within 10s, kill it.
  // The positions at that moment are frozen as the final layout — better
  // than letting the tab block on physics for 30+ seconds.
  const hardTimeout = setTimeout(() => {
    const inst = uiState.renderer?.getCurrentLayoutInstance?.();
    if (inst) {
      logInfo(`Euler timed out after ${EULER_HARD_TIMEOUT_MS}ms — freezing positions`);
      inst.stop();
    }
    finalize();
  }, EULER_HARD_TIMEOUT_MS);

  uiState.renderer.runLayout(
    DEFAULT_LAYOUT,
    { animate: true, randomize: false },
    {
      skipEntering: true,
      onLayoutStop: () => {
        clearTimeout(hardTimeout);
        finalize();
      },
    },
  );
}

/**
 * Wait until the graph is visibly still before declaring loading complete.
 *
 * Cytoscape's `layoutstop` describes a layout lifecycle event, not a paint
 * guarantee. We therefore sample node positions on animation frames and
 * require 250ms with no movement (and no Cytoscape animation in progress).
 * This makes the loading pill's disappearance follow the user's perception:
 * nodes settle first; only then may the pill celebrate and fade.
 */
function waitForGraphToSettle(cy: cytoscape.Core, onSettled: () => void): void {
  const quietForMs = 250;
  const timeoutMs = 60_000;
  const epsilon = 0.01;
  const startedAt = performance.now();
  let quietSince = startedAt;
  let previous = new Map<string, { x: number; y: number }>();

  const sampleHasMoved = (): boolean => {
    let moved = previous.size !== cy.nodes().length;
    const current = new Map<string, { x: number; y: number }>();

    cy.nodes().forEach((node) => {
      const position = node.position();
      const old = previous.get(node.id());
      if (!old || Math.abs(position.x - old.x) > epsilon || Math.abs(position.y - old.y) > epsilon) {
        moved = true;
      }
      current.set(node.id(), position);
    });

    previous = current;
    return moved;
  };

  const poll = (): void => {
    const now = performance.now();
    const moving = sampleHasMoved();

    if (moving) quietSince = now;

    if (now - quietSince >= quietForMs) {
      onSettled();
      return;
    }

    // Safety net: keep the UI recoverable if a third-party layout or browser
    // bug leaves an animation flag stuck. 60s matches the hard Euler ceiling
    // above — by that point the user has been staring at "大爆炸" long enough;
    // just commit so the page becomes interactive.
    if (now - startedAt >= timeoutMs) {
      console.warn('[loader] graph did not become still within 60s; completing loading indicator');
      onSettled();
      return;
    }

    requestAnimationFrame(poll);
  };

  // Start after at least one paint, so the snapshot observes the real final
  // layout frame rather than the synchronous `layoutstop` call stack.
  requestAnimationFrame(() => requestAnimationFrame(poll));
}

/**
 * Append a batch of newly-arrived nodes to the already-rendered graph.
 * "Cosmic expansion" model — every new batch pushes existing nodes a bit
 * further from the origin (like the universe expanding as new matter is
 * added) and places new nodes on the outer ring. The result reads as
 * continuous outward growth instead of a "load → snap" transition.
 *
 * Edges that connect already-present nodes appear naturally because they
 * were created earlier in the streaming order; we don't re-layout.
 */
function appendBatchToGraph(
  batchFiles: Record<string, string>,
  graphManager: GraphManager,
  _collected: Record<string, string>,
): void {
  if (!uiState.renderer) return;

  const cy = uiState.renderer.getCy();
  const data = graphManager.build();
  const ENTERING = uiState.renderer.CLASSES_ENTERING;

  // 快照 add 之前的节点/边集合，用于 halton 全局索引与 dangling 诊断。
  const beforeNodeIds = new Set<string>();
  for (const n of cy.nodes()) beforeNodeIds.add(n.id());
  const beforeEdgeIds = new Set<string>();
  for (const e of cy.edges()) beforeEdgeIds.add(e.id());
  const existingCount = beforeNodeIds.size;

  // 统一走 renderer 的元素归一化逻辑（stroke 兜底、subtree 色等），
  // 不再在 main.ts 里手写一份会漂移的 node/edge 构造。
  const { addedNodeIds, addedEdgeIds, skippedEdges } = uiState.renderer.addElements(data);

  const diag = ensureDiag();
  diag.skippedEdges.push(...skippedEdges);
  if (diag.skippedEdges.length <= 5) {
    for (const s of skippedEdges) {
      console.warn('[appendBatchToGraph] skipped dangling edge', s.id, '→', s.err);
    }
  }

  // 真正缺失的边：两端节点都还没加载，永远无法 add。
  const allKnownIds = new Set(beforeNodeIds);
  data.nodes.forEach((n) => allKnownIds.add(n.id));
  const trulyDangling = data.edges.filter(
    (e) =>
      !beforeEdgeIds.has(e.id) &&
      !allKnownIds.has(e.source) &&
      !allKnownIds.has(e.target), // 双端都不在 known 里——纯 dangling
  );
  if (trulyDangling.length > 0) {
    diag.filteredDangling.push(...trulyDangling.map((e) => ({ id: e.id, source: e.source, target: e.target })));
  }

  // 渐入 class（在 add 之后立即打上，避免出现一帧全亮再淡出的闪烁）。
  addedNodeIds.forEach((id) => {
    const node = cy.getElementById(id);
    if (!node.empty()) node.addClass(ENTERING);
  });
  addedEdgeIds.forEach((id) => {
    const edge = cy.getElementById(id);
    if (!edge.empty()) edge.addClass(ENTERING);
  });

  // 1. 新节点从原点 (0,0) 飞出到 halton 序列指定的目标位置。
  //    halton 索引是全局的（base 2/3），保证不管分批到达多少次，
  //    整体节点分布都均匀不重叠。
  addedNodeIds.forEach((id, i) => {
    const node = cy.getElementById(id);
    if (node.empty()) return;

    // 全局唯一索引（在总集中的位置）
    const globalIdx = existingCount + i;
    const angle = halton(globalIdx, 2) * Math.PI * 2;
    const ringRadius = 50 + halton(globalIdx, 3) * 280;

    // 先放原点，然后 animate 到目标（视觉上就是"从中心爆出来"）
    node.position({ x: 0, y: 0 });
    node.animate({
      position: {
        x: Math.cos(angle) * ringRadius,
        y: Math.sin(angle) * ringRadius,
      },
      duration: 520,
      easing: 'ease-out-cubic',
    });
  });

  // 2. 节点 + 边的渐入（在动画开始后立即开始，节点到位时刚好可见）
  addedNodeIds.forEach((id, i) => {
    const node = cy.getElementById(id);
    if (node.empty()) return;
    setTimeout(() => node.removeClass(ENTERING), 100 + i * 10);
  });
  addedEdgeIds.forEach((id, i) => {
    const edge = cy.getElementById(id);
    if (edge.empty()) return;
    setTimeout(() => edge.removeClass(ENTERING), 200 + i * 6);
  });
}

/**
 * 诊断汇总：把所有被静默 skip 的边、被 filter 过滤掉的 dangling edge、
 * parser warnings 都收集到 window.__graphDiag 上。调试时一行命令就能看清
 * 整张图到底哪些边丢了、为什么丢。比"容错吞错 + 一片寂静"靠谱得多。
 */
interface GraphDiag {
  skippedEdges: Array<{ id: string; source: string; target: string; err: string }>;
  filteredDangling: Array<{ id: string; source: string; target: string }>;
  parserWarnings: unknown[];
  nodesInCy: number;
  nodesInData: number;
  edgesInCy: number;
  edgesInData: number;
}

function ensureDiag(): GraphDiag {
  const w = window as unknown as { __graphDiag?: GraphDiag };
  if (!w.__graphDiag) {
    w.__graphDiag = {
      skippedEdges: [],
      filteredDangling: [],
      parserWarnings: [],
      nodesInCy: 0,
      nodesInData: 0,
      edgesInCy: 0,
      edgesInData: 0,
    };
  }
  return w.__graphDiag;
}

function dumpDiag(graphManager?: GraphManager): void {
  const diag = ensureDiag();
  if (graphManager) {
    diag.parserWarnings = graphManager.warnings;
  }
  if (uiState.renderer) {
    const cy = uiState.renderer.getCy();
    diag.nodesInCy = cy.nodes().length;
    diag.edgesInCy = cy.edges().length;
    const data = graphManager?.getData();
    if (data) {
      diag.nodesInData = data.nodes.length;
      diag.edgesInData = data.edges.length;
    }
  }
  // 用 console.table 把 parserWarnings 单独列出来（默认 console.info
  // 折叠了，table 会展开）。其它字段用 group 输出。
  if (diag.parserWarnings.length > 0) {
    // eslint-disable-next-line no-console
    console.table(diag.parserWarnings);
  }
  // eslint-disable-next-line no-console
  console.info('[graphDiag] summary:', {
    nodesInCy: diag.nodesInCy,
    nodesInData: diag.nodesInData,
    edgesInCy: diag.edgesInCy,
    edgesInData: diag.edgesInData,
    skippedEdges: diag.skippedEdges.length,
    filteredDangling: diag.filteredDangling.length,
    parserWarnings: diag.parserWarnings.length,
  });
}

/**
 * Halton sequence — low-discrepancy quasi-random number in [0,1).
 * Beats pure random because points never cluster.
 */
function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

// ── Thin glue: keyboard shortcuts + resize handler + onboarding tip ──────────

function initKeyboardShortcuts(): void {
  initShortcuts(uiState.renderer!.getCy(), {
    fitGraph: () => fitGraph(uiState.renderer!),
    randomize: () => {
      randomize(uiState.renderer!, uiState.highlight!);
      const cy = uiState.renderer!.getCy();
      updateStats(cy);
      syncBottomSheetStats(cy);
    },
    toggleTour: () => tourController.toggle(),
    tourPause: () => tourController.togglePause(),
    closeNodePanel: () => {
      uiState.detailPanel?.close();
    },
    tourStop: () => tourController.stop(),
    tourPrev: () => tourController.prev(),
    tourNext: () => tourController.next(),
    requestDelete: (count) => {
      showToast(`再按一次 Backspace/Delete 确认删除 ${count} 个节点`, 'info');
    },
  });
}

function initResizeHandler(): void {
  // 进入 / 退出大屏会切换浏览器全屏，浏览器随后会派发 window resize。
  // 退出时 <html>.bigscreen 已被同步移除，所以下面 150ms 防抖回调里
  // isBigscreen() 已经是 false —— 如果照常 fitGraph，就会把 bigscreen.ts
  // 刚恢复好的「进入前缩放 + 平移」覆盖成"适应全图"，表现为退出后缩放变到最小。
  // 因此：全屏切换后的一小段时间内，resize 不再触发 fit（cy 尺寸同步由
  // bigscreen.ts 的 ResizeObserver 负责）。
  //
  // 注意判断放在防抖回调里（而不是 resize 事件里）：不同浏览器里
  // resize 和 fullscreenchange 谁先谁后不固定，回调执行时两者都已发生。
  const FULLSCREEN_RESIZE_GRACE_MS = 1000;
  let suppressFitUntil = 0;
  document.addEventListener('fullscreenchange', () => {
    suppressFitUntil = performance.now() + FULLSCREEN_RESIZE_GRACE_MS;
  });

  window.addEventListener('resize', () => {
    // macOS 的全屏是动画切换 Space，会连续触发一串 resize（约 0.5s）。
    // 已经处在"全屏切换窗口"内时，每来一次 resize 就把窗口往后顺延，
    // 保证最后一次防抖回调仍然落在窗口里。
    const now = performance.now();
    if (now < suppressFitUntil) suppressFitUntil = Math.max(suppressFitUntil, now + 500);

    if (uiState.resizeTimer) clearTimeout(uiState.resizeTimer);
    uiState.resizeTimer = setTimeout(() => {
      const fullscreenTransition = performance.now() < suppressFitUntil;
      if (!isBigscreen() && !fullscreenTransition) { fitGraph(uiState.renderer!); }
      syncTourBarPosition();
    }, 150);
  });
}

const ONBOARDING_TIPS = [
  { text: '按 T 开始漫游，按 P 暂停，逐节点探索药学知识图谱', icon: 'tip' },
  { text: '按 F 适应视图，或拖拽鼠标滚轮缩放图谱', icon: 'tip' },
  { text: '点击顶部搜索框，输入药名即可快速定位节点', icon: 'tip' },
];
const ONBOARDING_KEY = 'pg_onboarding_tip_shown';

function showOnboardingTip(): void {
  try {
    if (localStorage.getItem(ONBOARDING_KEY)) return;
    const tip = ONBOARDING_TIPS[Math.floor(Math.random() * ONBOARDING_TIPS.length)];
    setTimeout(() => {
      showToast(tip.text, 'info');
      try {
        localStorage.setItem(ONBOARDING_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    }, 3000);
  } catch {
    /* localStorage blocked — skip tip */
  }
}

// Debug-only uiState exposure (kept on window for console introspection).
(window as unknown as Record<string, unknown>).uiState = uiState;
// Suppress unused import warning — dispatchAction is the public programmatic
// API for keyboard shortcuts / tests / future plugins.
void dispatchAction;

/**
 * Wire the "meow" word to a hover-revealed email card.
 *
 * Design notes:
 *   - 300ms open delay avoids flicker when the cursor merely sweeps past.
 *   - 120ms close delay prevents the card from snapping shut the instant the
 *     cursor drifts 1px off the "meow" word.
 *   - pointer:fine gate keeps touch devices from ever showing the card
 *     (they can't hover and a stuck-open card would be a permanent artifact).
 *   - Keyboard users (focus via Tab) get the same 300ms delay for parity
 *     with hover; Escape dismisses.
 *   - All animations are CSS-driven; JS only flips one class.
 */
function initBadgeEmailCard(): void {
  const trigger = document.getElementById('badge-meow');
  const card = document.getElementById('badge-email-card');
  if (!trigger || !card) return;

  // Mobile / touch devices have no hover: tap-toggle instead. Desktop keeps
  // the hover-revealed UX with 300ms / 120ms delays.
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const OPEN_DELAY_MS = 300;
  const CLOSE_DELAY_MS = 120;
  let openTimer: number | undefined;
  let closeTimer: number | undefined;

  const cancelTimers = () => {
    if (openTimer !== undefined) {
      window.clearTimeout(openTimer);
      openTimer = undefined;
    }
    if (closeTimer !== undefined) {
      window.clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  };

  const showCard = () => {
    cancelTimers();
    if (card.classList.contains('is-visible')) return;
    card.classList.add('is-visible');
    card.setAttribute('aria-hidden', 'false');
  };
  const hideCard = () => {
    cancelTimers();
    if (!card.classList.contains('is-visible')) return;
    card.classList.remove('is-visible');
    card.setAttribute('aria-hidden', 'true');
  };

  if (coarse) {
    // Mobile: tap meow to toggle. Tap anywhere else (or the card itself) to
    // close. Listening on document with capture so we always beat the
    // canvas / cytoscape event handlers for the first tap on the meow word
    // itself (toggle on, not open-then-immediately-close).
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (trigger.contains(target) || card.contains(target))) {
        // Tap on trigger or card → toggle.
        if (target && trigger.contains(target)) {
          if (card.classList.contains('is-visible')) hideCard();
          else showCard();
        }
        // Tap on the card body itself → leave open (no toggle).
      } else {
        // Tap anywhere else → close if open.
        hideCard();
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    // Keyboard parity still works on mobile (Bluetooth keyboard etc.).
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (card.classList.contains('is-visible')) hideCard();
        else showCard();
      } else if (e.key === 'Escape') {
        hideCard();
        (trigger as HTMLElement).blur();
      }
    });
    return;
  }

  // Desktop: hover-revealed with debounced open/close + keyboard parity.
  const open = () => {
    if (closeTimer !== undefined) {
      window.clearTimeout(closeTimer);
      closeTimer = undefined;
    }
    if (card.classList.contains('is-visible')) return;
    openTimer = window.setTimeout(() => {
      card.classList.add('is-visible');
      card.setAttribute('aria-hidden', 'false');
      openTimer = undefined;
    }, OPEN_DELAY_MS);
  };

  const close = () => {
    if (openTimer !== undefined) {
      window.clearTimeout(openTimer);
      openTimer = undefined;
    }
    if (!card.classList.contains('is-visible')) return;
    closeTimer = window.setTimeout(() => {
      card.classList.remove('is-visible');
      card.setAttribute('aria-hidden', 'true');
      closeTimer = undefined;
    }, CLOSE_DELAY_MS);
  };

  trigger.addEventListener('mouseenter', open);
  trigger.addEventListener('mouseleave', close);
  // Hovering the card itself keeps it open.
  card.addEventListener('mouseenter', () => {
    if (closeTimer !== undefined) {
      window.clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  });
  card.addEventListener('mouseleave', close);

  trigger.addEventListener('focus', open);
  trigger.addEventListener('blur', close);
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') (trigger as HTMLElement).blur();
  });
}

void boot();
