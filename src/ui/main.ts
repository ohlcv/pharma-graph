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

import './styles/index.css';
import { Renderer } from '../core/renderer.js';
import { GraphManager } from '../core/graph-manager.js';
import { TourController } from './tour-controller.js';
import { HighlightEngine } from './highlight-engine.js';
import { DetailPanel } from './detail-panel.js';
import { Search } from './search.js';
import { LAYOUTS } from '../core/config.js';
import { brandCarousel } from './carousel.js';
import { uiState } from './state.js';
import { loadContent } from '../core/content-loader.js';
import {
  installDispatcher,
  dispatchAction,
} from './action-dispatcher.js';
import {
  updateStats,
  syncBottomSheetStats,
} from './graph-stats.js';
import { fitGraph, randomize } from './layout-manager.js';
import { initGraphEvents } from './graph-events.js';
import {
  initSheetDrag,
  initPanelDrag,
  syncTourBarPosition,
} from './drag-manager.js';
import {
  initEdgeTooltip,
  showEdgeTooltip,
  hideEdgeTooltip,
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

// ── Boot ───────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  const { files: mdFiles } = await loadContent();
  const graphManager = new GraphManager(mdFiles as Record<string, string>);
  const data = graphManager.build();
  // Diagnostic — surfaces data shape so we can confirm parser→renderer pipeline
  // is producing edges in the browser. Remove once the missing-edges bug is
  // confirmed resolved.
  console.info('[pharma-graph] graph build:', {
    mdFiles: Object.keys(mdFiles).length,
    nodes: data.nodes.length,
    edges: data.edges.length,
    sampleEdge: data.edges[0],
  });

  // Issue #14: surface parser warnings that the browser used to swallow
  // silently. The CLI validate.ts reports the same warnings, so authors
  // see consistent feedback regardless of which surface they used.
  if (graphManager.warnings.length > 0) {
    const errors = graphManager.warnings.filter((w) => w.severity === 'error');
    const warns  = graphManager.warnings.filter((w) => w.severity === 'warning');
    console.warn(
      `[pharma-graph] frontmatter warnings: ${errors.length} error(s), ${warns.length} warning(s)` +
      ` — details follow. See docs/问题清单.md #14.`,
    );
    for (const w of graphManager.warnings) {
      const tag = w.severity === 'error' ? '[error]' : '[warn]';
      const field = w.field ? ` [${w.field}]` : '';
      // eslint-disable-next-line no-console
      console.warn(`${tag} ${w.file}${field} — ${w.message}`);
    }
  }

  const container = document.getElementById('cy');
  if (!container) throw new Error('#cy container not found');

  try {
    uiState.renderer = new Renderer({
      container,
      data,
      layoutName: 'cose',
      layoutConfigs: LAYOUTS,
    });
    uiState.highlight = new HighlightEngine(uiState.renderer.getCy());
    // Diagnostic — confirm cytoscape loaded the same number of edges as buildGraph produced.
    console.info('[pharma-graph] cy after render:', {
      nodes: uiState.renderer.getCy().nodes().length,
      edges: uiState.renderer.getCy().edges().length,
    });

    uiState.detailPanel = new DetailPanel(uiState.renderer.getCy(), uiState.highlight, {
      onNodeClick: (nodeId) => {
        const node = uiState.renderer!.getCy().getElementById(nodeId);
        if (!node.empty()) {
          uiState.highlight!.highlightNode(nodeId);
          uiState.detailPanel!.show(nodeId);
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

    // TourController must exist before initGraphEvents — the canvas-tap
    // handler reads its `isRunning` / `isPaused` synchronously. Constructing
    // it first fixes the boot-time race that issue #11 flagged: a tap on
    // the canvas between initGraphEvents and the original (later) tour
    // assignment used to dereference `undefined`.
    tourController = new TourController(cy, uiState.renderer, uiState.detailPanel!);
    tourController.mount();

    initGraphEvents({
      cy,
      renderer: uiState.renderer,
      highlight: uiState.highlight!,
      detailPanel: uiState.detailPanel!,
      spawnNodeRipple,
      setPrevSelectedNode,
      showEdgeTooltip,
      hideEdgeTooltip,
      showZoomIndicator,
      isDebugOverlayActive: () => debugOverlayActive,
      updateForensicPanel,
      tourController,
      setDragging: (d) => {
        uiState.isDragging = d;
      },
      setDragMode: (d) => {
        uiState.renderer!.setDragMode(d);
      },
    });

    initEdgeTooltip();
    initDebugOverlay(uiState.renderer);
    updateStats(cy);
    syncBottomSheetStats(cy);

    const badgeDot = document.getElementById('badge-dot');
    if (badgeDot) badgeDot.classList.remove('topbar__badge-dot--loading');

    brandCarousel.start();

    const sidebar = document.getElementById('sidebar');
    const sidebarBtn = document.getElementById('btn-sidebar-toggle');
    if (sidebar && sidebarBtn)
      sidebarBtn.classList.toggle('active', !sidebar.classList.contains('hidden'));

    initSheetDrag();
    initPanelDrag();
  } catch (err) {
    const n = document.getElementById('stat-nodes');
    const e = document.getElementById('stat-edges');
    if (n) n.textContent = 'error';
    if (e) e.textContent = (err as Error).message;
    console.error('[pharma-graph] Boot error:', err);
    return;
  }

  // These init functions need cy — only proceed if renderer was created successfully.
  initKeyboardShortcuts();
  initSearchUI(
    uiState.renderer.getCy(),
    uiState.highlight!,
    uiState.search!,
    uiState.detailPanel!,
  );
  initResizeHandler();
  initMusicPlayer();

  // Install the document-level click dispatcher once (idempotent).
  installDispatcher();
  // Wire every data-action="..." button to its handler.
  registerAppActions(uiState.renderer, uiState.highlight!, uiState.detailPanel!);
  // Console-only debug bridge.
  installDebugBridge(uiState.renderer);

  showOnboardingTip();
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
      fitGraph(uiState.renderer!);
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
