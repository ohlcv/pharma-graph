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
//   - layout/layout-switcher.ts → open/close layout dropdown
//   - starfield.ts       → initStarfield (parallax background stars)
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
import { loadGraph, type LoadProgress as PrebuiltProgress } from '../core/prebuilt-loader.js';
import { detectDeviceCapability } from '../core/device-capability.js';
import { halton } from '../core/halton.js';
import { installDispatcher, dispatchAction } from './action-dispatcher.js';
import { updateStats, syncBottomSheetStats } from './graph-stats.js';
import { syncLayoutDisplay, setCurrentLayout } from './layout/layout-engine.js';
import { restoreBsAdvancedPrefs, renderLayoutParams } from './layout/layout-params.js';
import { fitGraph, randomize } from './layout/toolbar-actions.js';
import {
  initBigscreen,
  registerFitFn,
  registerTourController,
  registerCyAccessor,
  isBigscreen,
} from './bigscreen.js';
import { initGraphEvents } from './graph-events.js';
import {
  initSheetDrag,
  initPanelDrag,
  initPanelResize,
  syncTourBarPosition,
  initSectionHeights,
} from './drag-manager.js';
import { spawnNodeRipple, showZoomIndicator, showToast } from './ui-helpers.js';
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
import { initStarfield } from './starfield.js';
import { createCelestialEmblemOverlay } from '../core/spectacle/emblem-overlay.js';
import { createTesseractOverlay } from '../core/spectacle/tesseract-overlay.js';
import { createFractalTreeOverlay } from '../core/spectacle/fractal-tree-overlay.js';
import { createE8StarOverlay } from '../core/spectacle/e8-overlay.js';
import { runLayoutInWorker } from '../core/layout-worker-client.js';
import { initSpeechSettings } from './speech-settings.js';

let tourController: TourController;

/**
 * 装饰节点（太极八卦 / 四维空间）的运行时停用开关（URL 控制）。
 *
 * 背景：两者共用同一套机制（真实 cytoscape 节点 + 独立 canvas 逐帧重绘）。
 * 原假设「四维空间节点大幅拉长初始加载并降低力布局帧数」已被四组对照
 * 实验否证（1182 节点 / 22s 布局期 rAF 采样，preview 构建）：
 *
 *   decor=off     太极关/超立方体关  中位 116.4ms / FPS 8.6 / 长帧 79.9%
 *   decor=celestial  只留太极      中位 104.7ms / FPS 9.6 / 长帧 81.3%
 *   decor=tess      只留超立方体  中位 110.2ms / FPS 9.1 / 长帧 81.8%
 *   缺省（全开）                    中位 120.2ms / FPS 8.3 / 长帧 80.4%
 *
 * 四组差异都在测量噪声内，**装饰节点对布局帧率没有可观测的影响**——真正的
 * 瓶颈是 1182 节点的 euler 力布局本身（详见
 * docs/DEBUG/debug-tesseract-perf-hypothesis-rejected.md）。开关保留是为后续
 * 对照实验方便，并非作为修复手段。
 *
 * URL 参数（无需重新构建）：
 *   ?decor=off        全部关
 *   ?decor=celestial  只留太极八卦
 *   ?decor=tess       只留超立方体
 *   ?decor=tree       只留生命之树
 *   ?decor=e8         只留 E8 根系
 *   缺省              全部开
 *
 * 刻意用白名单集合（`DECOR_KEYS`）而不是逐个 `DISABLE_*` 布尔：负向列举
 * 意味着每加一个奇观就得改四处（新增 DISABLE_ 常量 + 补进其余三个的
 * 关闭条件 + DECOR_STATE + 调用点），漏一处就是「以为关了其实开着」。
 * 第五个奇观 E8 接入时正是被这一点逼着重构的。
 */
const DECOR_OVERRIDE = new URLSearchParams(location.search).get('decor');
/** 合法奇观 key，顺序即 DECOR_STATE 与接入顺序。 */
const DECOR_KEYS = ['celestial', 'tess', 'tree', 'e8'] as const;
const ONLY = DECOR_OVERRIDE && DECOR_OVERRIDE !== 'off' ? DECOR_OVERRIDE : null;
const decorEnabled = (key: string): boolean => (ONLY === null ? true : ONLY === key);
const DISABLE_CELESTIAL = !decorEnabled('celestial');
const DISABLE_TESSERACT = !decorEnabled('tess');
const DISABLE_TREE = !decorEnabled('tree');
const DISABLE_E8 = !decorEnabled('e8');
/** 供调试面板查询当前开关状态。 */
export const DECOR_STATE = {
  override: DECOR_OVERRIDE,
  only: ONLY,
  known: DECOR_KEYS,
  tess: !DISABLE_TESSERACT,
  celestial: !DISABLE_CELESTIAL,
  tree: !DISABLE_TREE,
  e8: !DISABLE_E8,
};

// ── 布局质量降级实验开关 (?quality=) ────────────────────────────────────────
//
// 用于对照测量「布局期帧率」与「布局质量」的取舍。仅改 euler 的运行参数，
// 不动 src/core/config.ts 里的默认值，随时可用缺省 URL 回到原行为。
//
// ⚠️ 基线是 refresh=10 —— euler 自己的默认值（layout/defaults.js）。
// config.ts 的 params[] 里那个 refresh slider 标着 default: 30，但 refresh
// 从未写进 cytoscape 配置块，只有用户手动拖过 slider 存进 localStorage 时才
// 经 coerceStoredParams 生效。所以全新会话里 refresh 一直是 10，别拿 30 当基线。
//
// 降级维度（各自的代价不同，注释标明）：
//   ?quality=refresh5   refresh 10 → 5      每帧 tick 减半，动画卡顿感上升
//   ?quality=refresh2   refresh 10 → 2      每帧 tick 降至 1/5，卡顿明显
//   ?quality=theta      theta 0.666 → 0.9 斥力近似更粗，局部结构变松散
//   ?quality=time8s     maxSimulationTime 20s → 8s   没收敛就被掐断
//   ?quality=iter2000   maxIterations 5000 → 2000   同上，更早
//   ?quality=frugal     refresh 5 + maxSimulationTime 8s（组合）
//   ?quality=crippled   refresh 2 + maxSimulationTime 3s（极端下限探底）
//   ?quality=preset     完全不跑 euler，直接用 halo 位置（最坏情况基线）
const QUALITY_OVERRIDE = new URLSearchParams(location.search).get('quality');
const EULER_TUNING: Record<string, Record<string, unknown>> = {
  refresh5: { refresh: 5 },
  refresh2: { refresh: 2 },
  theta: { theta: 0.9 },
  time8s: { maxSimulationTime: 8000 },
  iter2000: { maxIterations: 2000 },
  frugal: { refresh: 5, maxSimulationTime: 8000 },
  crippled: { refresh: 2, maxSimulationTime: 3000 },
  preset: {},
};
const EULER_OVERRIDE_TUNING = QUALITY_OVERRIDE ? EULER_TUNING[QUALITY_OVERRIDE] : undefined;

/**
 * 传给 layout Worker 的 euler 参数。
 *
 * ⚠️ 这里**必须**取 config.ts 里的真实配置，不能只传 `?quality=` 的覆盖值。
 * 曾经写成 `{ randomize: false, ...EULER_OVERRIDES }`（覆盖值缺省为 undefined），
 * 于是 Worker 拿到的是 cytoscape-euler 的**库默认值**，而不是项目配置的：
 *
 *   库默认 maxSimulationTime = 4000   项目配置 20000  → 布局 4 秒被掐断
 *   库默认 maxIterations    = 1000   项目配置 5000   → 提前 bail
 *   库默认 pull            = 0.001  项目配置 0       → **所有节点被往原点拉**
 *   库默认 gravity         = -1.2   项目配置 -15     → 斥力弱一个数量级
 *
 * `pull` 那条正是用户看到的「节点没有完全分散开、挤在一块」——所有节点被
 * 拉向质心，斥力又推不开。而主线程兜底路径（`runSyncLayout`）走的是
 * `renderer.runLayout` → 读 config.ts，所以**只有 Worker 路径会挤**，这也
 * 解释了为什么这个 bug 一直躲过了同步路径的测试。
 *
 * `randomize: false` 在两条路径上都成立：主线程侧节点已在 halo 位置，
 * Worker 侧则通过 `elements[].position` 传入同一批坐标。
 */
const EULER_WORKER_PARAMS: Record<string, unknown> = {
  ...LAYOUTS[DEFAULT_LAYOUT].cytoscape,
  // animate / fit 是主线程的呈现关注点，Worker 里无意义（headless 无渲染），
  // 且 animate:false 正是 Worker 相比主线程省下 ~16s 的原因，不能开。
  animate: false,
  fit: false,
  ...EULER_OVERRIDE_TUNING,
};

// ── Loading Indicator (corner pill) ───────────────────────────────────────────

/**
 * 只更新 label / count / percent 文字 —— 不触发 fade-out。
 *
 * 「大爆炸」fade-out 由 completeLoading() 单独触发(在入场动画真正收尾时)，
 * 不再让 loader 的 `phase: 'done'` 提前触发。原先两个时机共用同一个 fade-out
 * 会导致: JSON 加载完 → fade 触发(800ms 渐隐) → 4 秒后入场动画才开始,
 * 用户看到「状态条消失 4 秒后图才动」—— 这是 4 秒空窗的真正成因。
 */
function updateLoadingIndicator(progress: PrebuiltProgress): void {
  const label = document.getElementById('loading-label');
  const count = document.getElementById('loading-count');
  const percent = document.getElementById('loading-percent');

  // Phase 'prebuilt' — show single-step progress
  if (label) label.textContent = progress.message;
  if (count) count.textContent = '';
  if (percent) percent.textContent = '';
}

/**
 * 入场动画真正收尾时触发:显示「**大爆炸**」+ 100%,800ms 后用 CSS transitionend
 * 把元素从布局移除。替代原先 updateLoadingIndicator('done') 的 fade-out 逻辑,
 * 让状态条文案/渐隐与入场动画完全同步。
 */
function completeLoadingWithFadeOut(nodeCount: number): void {
  const indicator = document.getElementById('loading-indicator');
  const label = document.getElementById('loading-label');
  const count = document.getElementById('loading-count');
  const percent = document.getElementById('loading-percent');
  if (!indicator) return;

  indicator.classList.add('complete');
  if (label) label.textContent = '大爆炸';
  if (count) count.textContent = '';
  if (percent) percent.textContent = '100%';

  // 等入场动画跑完后再等一拍(让用户看清 100%),然后启动 CSS 渐隐。
  // 时长来自 CSS .loading-indicator 的 transition(0.5s opacity + transform);
  // transitionend 触发后从布局移除,无硬编码 setTimeout。
  indicator.addEventListener(
    'transitionend',
    () => {
      indicator.classList.add('u-hidden');
    },
    { once: true },
  );
  indicator.classList.add('hidden');
}

/**
 * Boot failed before the graph existed — without this the pill sits on
 * "准备中…" with a pulsing yellow dot forever and the user has no idea why.
 * If the graph is already up, a late failure is only logged.
 */
function showBootError(err: unknown): void {
  console.error('[boot] failed:', err);
  if (uiState.renderer) return;
  const label = document.getElementById('loading-label');
  const count = document.getElementById('loading-count');
  const percent = document.getElementById('loading-percent');
  if (label) label.textContent = '加载失败，请刷新重试';
  if (count) count.textContent = '';
  if (percent) percent.textContent = '';
  showToast('图谱加载失败，请刷新页面重试', 'error');
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
  // still loading is a legitimate and useful interaction.
  initSheetDrag();
  initPanelDrag();
  initPanelResize();
  initSectionHeights();
  initMusicPlayer();
  showOnboardingTip();

  // 2) Load graph data. Two paths:
  //    - Default (prebuilt):  one ~800 KB JSON fetch, instant.
  //    - Fallback (md stream): when graph-data.json is missing/invalid,
  //      fetch all 1041 .md files. Slower, but never blocks a deploy.
  //    Both paths `await` to completion and hand back the FULL set — the md
  //    path batches internally only to drive the progress bar, it is not
  //    rendered progressively (no "边下边长"; see prebuilt-loader.ts).
  const loadResult = await loadGraph(updateLoadingIndicator);
  const collectedFiles: Record<string, string> = loadResult.files;

  if (loadResult.usedPrebuilt) {
    // Fast path — all metadata is already in graph-data.json.
    graphManager.initWithGraph(loadResult.graph);
  } else {
    // Fallback path — frontmatter-parser + BFS/DFS run inside the manager.
    graphManager.addFiles(collectedFiles);
  }

  // 3) Initialise cytoscape from the graph manager's data — once, with every
  //    node/edge already present (prebuilt or md fallback both finish above).
  initGraphFromManager(graphManager);

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
 * All graph data is available up front (prebuilt JSON, or the md fallback
 * after `addFiles`), so cytoscape is created once with the full element set.
 *
 * There is deliberately no incremental "append new batch" path here: the
 * graph is built in a single pass and every node is then animated out from
 * the centre together (see the "from-center growth" block below). The old
 * `appendBatchToGraph` helper was never called and has been removed, so
 * nothing is lost — do not reintroduce streaming-append without also wiring
 * `loadContentStreaming`'s onBatch callback (see prebuilt-loader.ts).
 */
function initGraphFromManager(graphManager: GraphManager): void {
  const data = graphManager.getData();

  logInfo('graph build:', {
    nodes: data.nodes.length,
    edges: data.edges.length,
  });

  const container = document.getElementById('cy');
  if (!container) throw new Error('#cy container not found');

  uiState.renderer = new Renderer({
    container,
    data, // 不需要预设位置：下面对所有节点统一做"从中心爆出"动画
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

  // ── Wire up app-wide interactions the moment the graph is live ─────────────
  // These must not wait for boot() to resume after loading: as soon as the
  // graph is on screen a user can tap a node (graph-events.ts is wired above),
  // and every `data-action` button (close ×, sidebar toggle, bigscreen,
  // toolbar layouts, …) and keyboard shortcut has to work at that point too.
  //
  // Every dependency (uiState.renderer / highlight / detailPanel / search /
  // tourController / registerFitFn / registerCyAccessor) is initialised above.
  // `installDispatcher` is idempotent, and `initBigscreen` has its own rAF
  // retry if cy isn't ready yet.
  //
  // Sidebar toggle button's initial active state is read from the DOM here so
  // the button reflects reality the moment the graph appears.
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
  initSpeechSettings();
  initSearchUI(uiState.renderer.getCy(), uiState.highlight!, uiState.search!, uiState.detailPanel!);
  // Background stars follow the camera (pan/zoom) — needs cy, nothing else.
  initStarfield(uiState.renderer.getCy());

  // 初始 zoom——用 0.08 让用户能看到"全图概貌"，
  // 节点从中心爆出时整体框架已铺开。boot 完之后**不再动摄像头**——
  // euler 让节点收敛到哪里，镜头就停在哪里。
  cy.zoom(0.08);
  cy.center();

  // Apply "from-center growth" animation to all nodes simultaneously — prebuilt
  // path loads everything at once but we still want the visual entrance effect.
  //
  // 优化：原来 duration: 520ms 让 641 个 ease-out-cubic 插值与 Euler 物理模拟
  // 并行跑（同一帧 60fps 下两套动画系统同时驱动 cytoscape 渲染管线），大爆炸
  // 期间帧率掉到 ~20fps。现在 duration: 0 让节点瞬时跳到 halo 位置——"从中心
  // 散开"的视觉效果完全由后续 Euler 自己负责（animate: true），不重复实现
  // 一次入场动画，cytoscape 内部只需跑一路动画，帧率恢复正常。
  //
  // 641 个节点各自排 setTimeout 摘 'entering' class 是一次性副作用：用 finishStreamingLayout
  // 里的 `cy.elements().removeClass('entering')` 同步一次清完 + `cy.stop(undefined, true)`
  // 把 position 动画跳到末尾，这里就不再排 setTimeout；既避免冗余的 641 个回调触发
  // glow-overlay.onEmphChange，也避免 race（如果 setTimeout 先跑就让节点淡入再被全局删）。
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
      duration: 0,
    });
  });

  // Celestial emblem: a real cytoscape node with `layer-parent` class (so it
  // is invisible to search/stats/tour/force-drag) but still participates in
  // Euler's repulsion physics. Must come AFTER the halo loop above (which
  // blindly touches every node including this one) and BEFORE
  // finishStreamingLayout() triggers the first Euler run — so it has a
  // position from the very first physics tick. See emblem-overlay.ts
  // header for the full rationale.
  if (!DISABLE_CELESTIAL) createCelestialEmblemOverlay({ container, cy });
  // 四维空间（tesseract）：与太极八卦同机制的第二个装饰节点，独立 overlay +
  // 独立 canvas，生命周期互不牵连。接入时机的两条约束同上。
  if (!DISABLE_TESSERACT) createTesseractOverlay({ container, cy });
  // 生命之树：第三个装饰节点。L-system 递归树 + 末梢光点，
  // 结构与前两者平行（独立 canvas / 独立 rAF / 真 cytoscape 节点挂
  // layer-parent 排除出搜索统计），接入时机的两条约束同样适用。
  if (!DISABLE_TREE) createFractalTreeOverlay({ container, cy });
  // E8 根系：第四个装饰节点。240 个根投影到 Coxeter 平面，6720 条棱
  // 压进单条 path 一次描边。骨架与前三个平行（独立 canvas / 独立 rAF /
  // 命中盒），接入时机的两条约束同样适用。
  if (!DISABLE_E8) createE8StarOverlay({ container, cy });

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

/** Hard ceiling for the Euler simulation; see finishStreamingLayout. */

/**
 * Once the graph is on screen, run the Euler force-directed layout once.
 *
 * Euler is allowed to run its full animation so users see nodes drift from
 * their halo positions into the organic, topology-aware structure. This is
 * the "gravity" phase of the cosmic metaphor.
 *
 * ⚠️ 上面这句只在**同步兜底路径**成立。主路径已改为 layout Worker
 * （见下方 runLayoutInWorker）：euler 在 Worker 里 `animate: false` 纯算
 * 坐标，主线程拿到结果后自己播一段 1.2s 错峰插值。观感等价，但避免了
 * euler 逐帧回写 1182 个节点位置的开销（那占了同步路径 20s 中的 16s）。
 *
 * But Euler is expensive on slow devices — on a phone with a slow CPU the
 * simulation can take 25-40 seconds, eat battery, and risk "tab unresponsive"
 * warnings. We therefore:
 *
 *   1. Detect device capability up-front (cores + memory + network). If the
 *      device looks slow (≥2 strong signals), skip Euler entirely — the halo
 *      positions from the burst animation ARE the final positions.
 *
 *   2. Otherwise let Euler run to completion under its own configuration
 *      (`maxSimulationTime` 20 s + `maxIterations` 5000 in config.ts). It
 *      always emits `layoutstop` on its own; we don't impose a wall-clock
 *      ceiling because freezing mid-flight positions looks worse than letting
 *      the physics finish.
 *
 * This function ALSO owns the loading pill's fade-out trigger — the pill
 * disappears after Euler converges (or is skipped). For small graphs (< 80
 * nodes) Euler is skipped unconditionally because the halo positions are
 * already pretty and Euler just makes them jitter.
 *
 * We deliberately do NOT touch the camera afterwards — Euler lets nodes
 * settle where they settle. `cy.stop(undefined, true)` cancels (and jumps to
 * the end of) any in-flight position animations from the entrance burst so
 * Euler owns the motion without two systems fighting each other.
 */

function finishStreamingLayout(counts: { nodeCount: number }): void {
  // 捕获到局部常量：下面把同步布局包进了 runSyncLayout() 函数里，
  // TS 无法跨函数边界保持 uiState.renderer 的非空收窄。提前取一次，
  // 闭包里直接用这个局部量（属性读取会被重新判空，局部 const 不会）。
  const renderer = uiState.renderer;
  if (renderer === null) return;
  const cy = renderer.getCy();
  const nodeCount = counts.nodeCount;

  // 摘掉 entering（opacity: 0）必须在所有提前 return 之前：节点数 < 80 或
  // 慢设备跳过 Euler 时，如果这里不摘，节点会一直透明只剩边（见 .entering 样式）。
  // 同样把 entrance burst 的位置动画跳到末尾，避免动画在半途被砍导致节点悬在
  // 奇怪的位置。
  cy.stop(undefined, true);
  cy.elements().removeClass('entering');

  // `settled` 是三条路径共用的「已收尾」闸门：任何一条路径开始收尾后，
  // 其他路径的回调都必须变成 no-op，否则加载指示器会被触发多次。
  //
  // 声明在 `completeLoading` 之前 —— 后者闭包按引用读它，而 `let` 有 TDZ，
  // 跳过路径(nodeCount<80 / 慢设备 / quality=preset)会同步调用
  // completeLoading，必须保证 `settled` 已被绑定。
  let settled = false;

  const completeLoading = (): void => {
    if (settled) return;
    settled = true;
    completeLoadingWithFadeOut(nodeCount);
  };

  // ── Skip 1: too few nodes — Euler jitter worse than halo positions ─────
  if (nodeCount < 80) {
    completeLoading();
    return;
  }

  // ── Skip 2: device too slow — Euler would block the tab for 25-40s ─────
  const capability = detectDeviceCapability();
  if (!capability.shouldRunEuler) {
    logInfo('Euler skipped (slow device):', capability.reason);
    completeLoading();
    return;
  }

  // ?quality=preset —— 极端对照组：完全不跑 euler，直接用 halo 位置。
  // 不是"优化"，是给降级方案定一个最坏情况基线（帧率天花板 / 质量地板）。
  if (QUALITY_OVERRIDE === 'preset') {
    logInfo('Euler skipped (?quality=preset):', 'baseline-only control group');
    completeLoading();
    return;
  }

  // ── 三条路径，按「主线程扛不扛得住逐帧」分派 ──────────────────────────
  // 实测（有头 Chromium / 真实 GPU / 1182 节点）：
  //   同步布局占死主线程        20877ms（期间 15–20 FPS，界面冻结）
  //   Worker headless 纯计算      3944ms（主线程全程空闲）
  //   边交叉数：138（同步） vs 83（Worker）—— 质量不降反升
  //
  // 那 20 秒里只有 4 秒是真正的力计算，其余是逐帧动画 + cytoscape 位置
  // 回写 + 画布重绘。搬进 Worker 后主线程阻塞归零，但**代价是失去 euler
  // 自己的逐帧动画**——而那段动画正是原始版本「从中心散开」的全部观感：
  // 1182 个节点在原点重叠，euler 边算边把它们互相推挤着推开，有机、连续、
  // 带物理的节奏，不是任何预计算插值能复现的。
  //
  // 所以按设备能力分叉，而不是二选一：
  //
  //   高性能（≥8 核）→ runSyncLayout()：euler `animate: true` 逐帧跑在主线程。
  //     观感与原始版本**完全一致**，代价是 20s 内界面偏卡。
  //   低性能        → Worker 算坐标 + 主线程 1.2s 错峰插值（animatePositionsTo）。
  //     界面全程可交互，观感是「聚成一点 → 炸开」，比逐帧版少一分有机感。
  //
  // 判据见 device-capability.ts 的 canAnimateOnMainThread —— 只看 CPU 核数。
  //
  // ?quality=preset 之类的实验开关、Worker 任何失败，都退回 runSyncLayout。
  //
  // `?layout=sync` / `?layout=worker` —— 强制指定路径，绕过能力检测。
  // 存在的理由：判据只有 hardwareConcurrency 一条，在高性能开发机上永远
  // 走 sync 分支，没法验证 worker 那条；这条 URL 让两条分支始终可达。
  const LAYOUT_OVERRIDE = new URLSearchParams(location.search).get('layout');
  if (LAYOUT_OVERRIDE === 'sync') {
    logInfo('布局路径被 ?layout=sync 强制指定：主线程逐帧动画');
    runSyncLayout();
    return;
  }
  if (LAYOUT_OVERRIDE !== 'worker') {
    if (capability.canAnimateOnMainThread) {
      logInfo('主线程逐帧动画（高性能设备）：', capability.reason);
      runSyncLayout();
      return;
    }

    logInfo('Worker + 插值入场动画（低性能设备）：', capability.reason);
  } else {
    logInfo('布局路径被 ?layout=worker 强制指定');
  }
  runLayoutInWorker(
    cy,
    { randomize: false, ...EULER_WORKER_PARAMS },
    (elapsedMs) => {
      logInfo(`[layout-worker] 正在计算… ${(elapsedMs / 1000).toFixed(1)}s`);
    },
    completeLoading, // 入场动画收尾即触发,替代 waitForGraphToSettle 的 500ms 静止 + 60s 超时 + 100ms 轮询
  ).then((result) => {
    if (!result) {
      logInfo('[layout-worker] 不可用，退回同步布局');
      runSyncLayout();
      return;
    }
    logInfo(`[layout-worker] 完成，耗时 ${(result.elapsedMs / 1000).toFixed(2)}s`);
    // 注意:这里不要设 settled = true —— settled 是 completeLoading 内部的
    // 闸门,由入场动画收尾时(animatePositionsTo.onSettled)统一触发。
    // 否则此处先设 true 会让 completeLoading 提前 short-circuit,
    // 「**大爆炸**」状态条永远不会出现。
  });

  /**
   * 同步布局：euler 逐帧动画跑在主线程。
   *
   * 两条用途：
   *   1. 高性能设备（≥8 核）的**正式路径** —— 观感与引入 Worker 之前完全一致。
   *   2. 其余情况的兜底 —— Worker 不可用 / 超时 / 异常。
   *
   * 不设硬超时：euler 自己有 `maxSimulationTime`（20s）与 `maxIterations`
   * （5000）两道上限（config.ts），到点必然发 `layoutstop`。外部再加一道
   * 墙钟超时的坏处是「节点冻在半空」，比让它跑完难看得多。
   */
  function runSyncLayout(): void {
    // settled 现在只由 completeLoading 内部设,不再用作「已 resolve」闸门。
    // runSyncLayout 是单次调用入口(同步布局路径 / worker 退化),不重复触发。

    // 非空断言：renderer 在函数开头已做过 `=== null` 早退。TS 仍报是因为
    // runSyncLayout 是函数声明（hoisted），控制流分析无法确定它只在早退之后
    // 被调用。这里的断言是安全的——早退已在调用点之前生效。
    renderer!.runLayout(
      DEFAULT_LAYOUT,
      // 不在这里覆盖 animate —— config.ts 里是 `animate: true`，走
      // cytoscape-euler 自己的 rAF 逐帧 multitick 路径，避免 cytoscape core
      // 再叠一层 tween 插值；也正是这一层动画让节点「从 halo 位置散开」。
      //
      // 这里只覆盖 randomize：流式加载已经把节点放到了 halo 位置上，euler 从
      // 这些位置开始收敛即可，不需要再 randomize 重排。
      //
      // 其余力参数由 renderer.runLayout 从 config.ts 读，这里不必重复传；
      // EULER_OVERRIDE_TUNING 来自 ?quality= 开关，缺省为 undefined，
      // 即完全不影响现有行为。
      { randomize: false, ...EULER_OVERRIDE_TUNING },
      {
        skipEntering: true,
        // euler 跑完 layoutstop 事件触发时即调 completeLoading——
        // 这是 layout 算法的自然收敛信号，替代之前 waitForGraphToSettle
        // 的「500ms 静止 + 60s 硬超时 + 100ms 轮询节流」三层硬编码。
        onLayoutStop: completeLoading,
      },
    );
  }
}

/**
 * 诊断汇总：把所有被静默 skip 的边、被 filter 过滤掉的 dangling edge、
 * parser warnings 都收集到 window.__graphDiag 上。调试时一行命令就能看清
 * 整张图到底哪些边丢了、为什么丢。比"容错吞错 + 一片寂静"靠谱得多。
 *
 * 注意：skippedEdges / filteredDangling 原本由已移除的 streaming 追加路径填充，
 * 现在恒为空；字段保留是为了不破坏 debug-bridge 等外部读取方的数据形状。
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
  // window.__graphDiag 照常填充（debug-bridge 等外部读取方要用），但只在开发环境往控制台输出，
  // 否则生产环境会泄漏内部管线状态（和 logger.ts 的初衷相反）。
  if (!import.meta.env.DEV) return;
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
 *
 * 实现已移到 `@/core/halton`：入场预动画（core/layout-worker-client）也要用，
 * 而 core 不能反向依赖 ui，故共用一份。
 */

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
      if (!isBigscreen() && !fullscreenTransition) {
        fitGraph(uiState.renderer!);
      }
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
  // The "悬停查看" hint is hover wording — drop it where hover doesn't exist.
  if (coarse) card.querySelector('.badge-email-card__hint')?.remove();
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

boot().catch(showBootError);
