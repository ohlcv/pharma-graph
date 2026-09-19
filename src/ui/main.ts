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
// Safari / 微信 WKWebView 旧内核兼容：polyfill 必须放在**所有业务 import 之前**
//   覆盖对象：Safari ≤ 15.3 / iOS ≤ 15.3 / 微信内置浏览器旧版 WKWebView
//   否则会因 ??=、&&=、Object.hasOwn、Array.prototype.at、structuredClone、
//   regex d-flag 等语法直接 SyntaxError → 入口 type=module 完全不执行 → 白屏
// ============================================================================
import 'core-js/stable';
import 'regenerator-runtime/runtime.js';

import './styles/index.css';
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
  loadContentStreaming,
  type LoadProgress,
} from '../core/optimized-content-loader.js';
import { installDispatcher, dispatchAction } from './action-dispatcher.js';
import { updateStats, syncBottomSheetStats } from './graph-stats.js';
import { fitGraph, randomize, syncLayoutDisplay, setCurrentLayout, restoreBsAdvancedPrefs } from './layout-manager.js';
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

function updateLoadingIndicator(progress: LoadProgress): void {
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
    // Fade-out & remove after a short celebration
    setTimeout(() => {
      indicator.classList.add('hidden');
      setTimeout(() => {
        indicator.style.display = 'none';
      }, 600);
    }, 800);
    return;
  }

  if (label) {
    if (progress.phase === 'manifest') label.textContent = '获取内容';
    else if (progress.phase === 'content') label.textContent = progress.message;
    else if (progress.phase === 'graph') label.textContent = '构建图谱';
    else if (progress.phase === 'render') label.textContent = '渲染画布';
  }

  if (count) {
    if (progress.phase === 'content' && progress.total > 0) {
      count.textContent = `${progress.loaded} / ${progress.total}`;
    } else {
      count.textContent = '';
    }
  }

  if (percent) {
    if (progress.phase === 'content' && progress.total > 0) {
      const pct = Math.min(99, Math.round((progress.loaded / progress.total) * 100));
      percent.textContent = `${pct}%`;
    } else if (progress.phase === 'manifest') {
      percent.textContent = '';
    } else {
      percent.textContent = '';
    }
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  // 1) 创建 GraphManager（先于 manifest 完成，初始为空）
  const graphManager = new GraphManager({} as Record<string, string>);

  // 2) 流式加载内容：每收到一批 .md 就立即增量构建图谱塞进 cytoscape
  //    让用户看到"节点一颗颗长出来"的渐进动画，而不是等全部加载完才显示。
  let lastBatchCount = 0;
  let totalExpected = 0;
  const collectedFiles: Record<string, string> = {};

  await loadContentStreaming(
    updateLoadingIndicator,
    (batchFiles, _loaded, total) => {
      // 累积已加载文件
      Object.assign(collectedFiles, batchFiles);
      totalExpected = total;
      lastBatchCount = Object.keys(collectedFiles).length;

      // 增量构建图谱（GraphManager 现在支持增量 add）
      graphManager.addFiles(batchFiles);

      // 在第一批到达时就初始化 cytoscape（而不是等全部加载完）
      if (!uiState.renderer) {
        initGraphFromManager(graphManager, collectedFiles);
      } else {
        // 已经初始化过 → 增量添加新节点到 cytoscape
        appendBatchToGraph(batchFiles, graphManager, collectedFiles);
      }
    },
  );

  // 加载完成 → 跑一次最终的布局（之前 streaming 期间用的临时圆周位置）。
  // 胶囊的 phase='done' 触发由 finishStreamingLayout 内部负责：
  //   - ≥ 80 节点：等 euler 的 layoutstop（物理收敛完成后）
  //   - < 80 节点：100ms 后立刻触发（不跑 euler）
  finishStreamingLayout({ loaded: lastBatchCount, total: totalExpected });

  if (uiState.renderer) {
    const cy = uiState.renderer.getCy();
    updateStats(cy);
    syncBottomSheetStats(cy);
  }

  // 启动徽章 + 侧栏 + 各种 UI
  const badgeDot = document.getElementById('badge-dot');
  if (badgeDot) badgeDot.classList.remove('topbar__badge-dot--loading');

  brandCarousel.start();

  const sidebar = document.getElementById('sidebar');
  const sidebarBtn = document.getElementById('btn-sidebar-toggle');
  const nodePanel = document.getElementById('node-panel');
  if (sidebar && sidebarBtn)
    sidebarBtn.classList.toggle('active', !sidebar.classList.contains('hidden'));
  if (nodePanel && sidebar)
    nodePanel.classList.toggle('sidebar-hidden-adjust', sidebar.classList.contains('hidden'));

  initSheetDrag();
  initPanelDrag();
  initPanelResize();
  initSectionHeights();
  initKeyboardShortcuts();
  initSearchUI(uiState.renderer!.getCy(), uiState.highlight!, uiState.search!, uiState.detailPanel!);
  initResizeHandler();
  initMusicPlayer();
  initBigscreen();
  installDispatcher();
  registerAppActions(uiState.renderer!, uiState.highlight!, uiState.detailPanel!);
  installDebugBridge(uiState.renderer!);
  showOnboardingTip();

  // 诊断 dump：所有被静默 skip 的边 + parser warnings + 数据计数，
  // 用户在 console 里看 `__graphDiag` 就能看见全貌。
  // 不阻塞 UI，纯调试。
  queueMicrotask(() => dumpDiag(graphManager));
  void lastBatchCount;
}

/**
 * Initialize cytoscape + event handlers from the current graph state.
 * Called once when the first batch arrives. We DO NOT run a full layout
 * here — subsequent batches will keep streaming in, and we'd rather let
 * the cosmic-expansion positioning handle growth naturally than re-fit
 * everything once. After the manifest finishes we just set the initial
 * zoom so the user can see the whole galaxy.
 */
function initGraphFromManager(
  graphManager: GraphManager,
  collectedFiles: Record<string, string>,
): void {
  const data = graphManager.build();

  logInfo('graph build:', {
    mdFiles: Object.keys(collectedFiles).length,
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

  // Streaming 期间的初始 zoom——用 0.08 让用户能看到"全图概貌"，
  // 节点从中心爆出时整体框架已铺开。boot 完之后**不再动摄像头**——
  // euler 让节点收敛到哪里，镜头就停在哪里。
  cy.zoom(0.08);
  cy.center();

  // 第一批节点也走"从中心爆出来"动画，保证统一观感
  // （appendBatchToGraph 已经处理了 init 后的批次，但 init 时的批次还没经过动画）
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
function finishStreamingLayout(counts: { loaded: number; total: number }): void {
  if (!uiState.renderer) return;
  const cy = uiState.renderer.getCy();
  const nodeCount = cy.nodes().length;

  // 太少的节点（比如缓存命中只有 100 个以下）就别折腾 euler 了——
  // 小图上 euler 会乱抖，反而比初始环带位置更难看。直接保留 streaming
  // 期间 halton 序列铺出来的环带作为最终位置；胶囊也按原时机正常淡出。
  if (nodeCount < 80) {
    setTimeout(() => updateLoadingIndicator({ phase: 'done', ...counts, message: '准备就绪' }), 100);
    return;
  }

  cy.stop(undefined, true);
  cy.elements().removeClass('entering');

  // 触发 euler 布局（用 animate:true 让 euler 自己跑位置动画；
  // 我们手动接管入场动画——不要 runLayout 自己的 stagger，避免双层动画打架）
  uiState.renderer.runLayout(DEFAULT_LAYOUT, { animate: true, randomize: false }, { skipEntering: true });

  // 等 euler 的 600ms 物理收敛动画 + layoutstop 触发之后再让胶囊淡出。
  // 这样视觉上就是"节点漂到位 → 胶囊庆祝 → 淡出"，最后用户看到的稳定态
  // 不再被动画打断。
  cy.once('layoutstop', () => {
    updateLoadingIndicator({ phase: 'done', ...counts, message: '准备就绪' });
  });
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

  // Get only the new nodes/edges (those not yet in cy)
  const existingNodeIds = new Set<string>();
  for (const n of cy.nodes()) existingNodeIds.add(n.id());
  const existingEdgeIds = new Set<string>();
  for (const e of cy.edges()) existingEdgeIds.add(e.id());

  const ENTERING = uiState.renderer.CLASSES_ENTERING;

  const newNodeEls = data.nodes
    .filter((n) => !existingNodeIds.has(n.id))
    .map((n) => ({
      group: 'nodes' as const,
      data: {
        id: n.id,
        label: n.label || n.id,
        fill: n.fill,
        stroke: n.stroke,
        shape: n.shape,
        depth: n.depth,
        subtreeRoot: n.subtreeRoot,
        shortSummary: n.shortSummary,
        fullSummary: n.fullSummary,
        summary: n.summary,
        location: n.location,
        tags: n.tags ?? [],
        body: n.body,
        weight: n.weight ?? 60,
        edges_out: n.edges_out ?? [],
      },
    }));

  // 不再因为本批只有边没新节点而提前 return —— 边连接之前已存在的节点是合法且常见的。
  // 不过完全没有节点也没有边的时候（空 batch）就早退，避免无意义的 work。

  // 收集所有"已知"的节点 id（用于过滤边）——包括：
  //   1. 已存在于 cy 的节点（之前的批次加进来的）
  //   2. 当前 batch 的新节点
  // 边可能引用这两种任意一种。之前的 bug 是只检查 (2)，导致引用之前
  // 批次节点的边被错误地过滤掉，连接性丢失。
  const allKnownIds = new Set<string>(existingNodeIds);
  data.nodes.forEach((n) => allKnownIds.add(n.id));

  const newEdgeEls = data.edges
    .filter((e) => !existingEdgeIds.has(e.id) && allKnownIds.has(e.source) && allKnownIds.has(e.target))
    .map((e, idx) => ({
      group: 'edges' as const,
      data: {
        id: e.id ?? `edge-${idx}`,
        source: e.source,
        target: e.target,
        edgeType: e.type,
        reason: e.reason,
      },
    }));

  // 大爆炸：从中心 (0,0) 向外扩散。新节点直接落在 halton 序列
  // 指定的位置上（从原点 animate 飞过去），不挤压已有节点。
  const existingNodes = cy.nodes();
  const existingCount = existingNodes.length;

  // 容错：即使上面 filter 漏掉了 dangling edge（比如某节点解析失败但有边引用），
  // cytoscape 在 batch 里遇到 nonexistent source 会抛错并中断整个 add。
  // 我们对节点和边分别 try/catch，单独失败不影响整体。
  cy.batch(() => {
    if (newNodeEls.length > 0) {
      try {
        cy.add(newNodeEls);
      } catch (err) {
        console.warn('[appendBatchToGraph] failed to add nodes:', err);
      }
      newNodeEls.forEach((el) => {
        const node = cy.getElementById(el.data.id);
        if (!node.empty()) node.addClass(ENTERING);
      });
    }
  });

  // 边单独 add，失败的边计入诊断（不阻断整批）。
  // 多次刷新看到的同一个 dangling edge 计数累加，便于发现真正的根因
  // ——比如某个 frontmatter 没解析成功，导致 source 节点缺失。
  const diag = ensureDiag();
  for (const el of newEdgeEls) {
    try {
      cy.add(el);
      const edge = cy.getElementById(el.data.id);
      if (!edge.empty()) edge.addClass(ENTERING);
    } catch (err) {
      diag.skippedEdges.push({
        id: el.data.id,
        source: el.data.source,
        target: el.data.target,
        err: String(err),
      });
      if (diag.skippedEdges.length <= 5) {
        console.warn('[appendBatchToGraph] skipped dangling edge', el.data.id, '→', err);
      }
    }
  }

  // 同时暴露"被 filter 过滤掉的边"——这些边两端都是 known 节点但因为
  // existingEdgeIds 已经包含而跳过，这种情况是正常的（边已加过），
  // 但 filter 因为两端不是 allKnownIds 而丢的边——那些是真正缺失的。
  const trulyDangling = data.edges.filter(
    (e) =>
      !existingEdgeIds.has(e.id) &&
      !allKnownIds.has(e.source) &&
      !allKnownIds.has(e.target), // 双端都不在 known 里——纯 dangling
  );
  if (trulyDangling.length > 0) {
    diag.filteredDangling.push(...trulyDangling.map((e) => ({ id: e.id, source: e.source, target: e.target })));
  }

  // 1. 新节点从原点 (0,0) 飞出到 halton 序列指定的目标位置。
  //    halton 索引是全局的（base 2/3），保证不管分批到达多少次，
  //    整体节点分布都均匀不重叠。
  newNodeEls.forEach((el, i) => {
    const node = cy.getElementById(el.data.id);
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
  newNodeEls.forEach((el, i) => {
    const node = cy.getElementById(el.data.id);
    if (node.empty()) return;
    setTimeout(() => node.removeClass(ENTERING), 100 + i * 10);
  });
  newEdgeEls.forEach((el, i) => {
    const edge = cy.getElementById(el.data.id);
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
  window.addEventListener('resize', () => {
    if (uiState.resizeTimer) clearTimeout(uiState.resizeTimer);
    uiState.resizeTimer = setTimeout(() => {
      if (!isBigscreen()) { fitGraph(uiState.renderer!); }
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

void boot();
