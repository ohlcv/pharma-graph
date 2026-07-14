// src/ui/main.ts
// Application entry — assembles all modules and wires up event handlers.

import './styles/index.css';
import cytoscape from 'cytoscape';
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
  updateStats,
  syncBottomSheetStats,
} from './graph-stats.js';

import {
  runLayout,
  applyLayoutParams,
  fitGraph,
  randomize,
  animatePulse,
  toggleBsParams,
  applyBsParams,
} from './layout-manager.js';

import {
  highlightShape,
  clearShapeFilter,
} from './legend-manager.js';

import { initGraphEvents } from './graph-events.js';

import {
  toggleBottomSheet,
  closeBottomSheet,
  syncTourBarPosition,
  initSheetDrag,
  initPanelDrag,
  toggleSidebar,
  toggleSection,
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
  runDebugUpdate,
  setDebugActive,
  setPrevSelectedNode,
  debugOverlayActive,
  updateForensicPanel,
} from './app-debug.js';

let tourController: TourController;

// Tour lifecycle now lives inside TourController. The thin globals below keep
// inline `onclick="…"` handlers in index.html working without a refactor.
function tourStop(): void   { tourController.stop(); }
function tourPause(): void  { tourController.togglePause(); }
function tourPrev(): void   { tourController.prev(); }
function tourNext(): void   { tourController.next(); }
function toggleTour(): void {
  if (tourController.isRunning() || tourController.isPaused()) tourController.stop();
  else                                                          tourController.start();
}
function onTourStrategyToggle(): void { tourController?.toggleStrategy(); }

// Markdown content is fetched at runtime from public/content/ (see
// content-loader.ts). Vite plugin `pharma-graph:content-manifest` writes a
// manifest at build/dev-start so we know which files to fetch.
// ── Music player ───────────────────────────────────────────────────────────────

function initMusicPlayer(): void {
  const btn = document.getElementById('btn-music');
  const bsBtn = document.getElementById('bs-btn-music');
  const audioEl = document.getElementById('bgm');
  const iconPlay = document.getElementById('music-icon-play');
  const iconPause = document.getElementById('music-icon-pause');
  const bsIconPlay = document.getElementById('bs-music-icon-play');
  const bsIconPause = document.getElementById('bs-music-icon-pause');
  if (!audioEl || !btn) return;

  const audio = audioEl as HTMLAudioElement;
  const TRACKS = ['Echoes of the Eye - Travelers Encore.mp3'];
  let queue: string[] = [];
  let trackIdx = 0;
  let playing = false;

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQueue() { queue = shuffle(TRACKS); trackIdx = 0; }

  function setPlaying(v: boolean) {
    playing = v;
    const musicLabel = document.getElementById('music-label');
    if (musicLabel) musicLabel.textContent = v ? '暂停' : '播放';
    const toggle = (b: HTMLElement | null, ip: HTMLElement | null, ipa: HTMLElement | null) => {
      if (!b || !ip || !ipa) return;
      b.classList.toggle('active', v);
      ip.style.display = v ? 'none' : 'block';
      ipa.style.display = v ? 'block' : 'none';
    };
    toggle(btn, iconPlay, iconPause);
    if (bsBtn) toggle(bsBtn, bsIconPlay, bsIconPause);
  }

  function playNext() {
    if (!queue.length) return;
    trackIdx = (trackIdx + 1) % queue.length;
    if (trackIdx === 0) buildQueue();
    audio.src = '/audio/' + queue[trackIdx];
    audio.load();
    audio.play().catch(() => {});
  }

  audio.volume = 0.45;
  audio.addEventListener('ended', playNext);
  buildQueue();
  audio.src = '/audio/' + queue[0];
  audio.load();

  function toggleMusic() {
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  }

  btn.addEventListener('click', toggleMusic);
  if (bsBtn) bsBtn.addEventListener('click', toggleMusic);
}

// ── Search ─────────────────────────────────────────────────────────────────────

// Debounce window for "input" handlers — keeps the graph from re-centering on
// every keystroke while still updating the result count and highlight live.
const SEARCH_INPUT_DEBOUNCE_MS = 220;

function initSearchUI(
  cy: cytoscape.Core,
  highlight: HighlightEngine,
  search: Search,
  detailPanel: DetailPanel,
): void {
  function attachSearchHandlers(input: HTMLInputElement | null) {
    if (!input) return;
    let pendingCenterTimer: ReturnType<typeof setTimeout> | null = null;

    input.addEventListener('input', () => {
      // Run search synchronously so highlight + stats update on every keystroke.
      // The expensive part — centering the camera — is deferred so rapid typing
      // doesn't queue overlapping cy.animate() calls.
      const results = search.search(input.value);
      updateStats(cy);

      if (pendingCenterTimer !== null) clearTimeout(pendingCenterTimer);
      pendingCenterTimer = setTimeout(() => {
        pendingCenterTimer = null;
        if (results.length === 0) return;
        // Skip auto-centering if the input has lost focus or the user has
        // already navigated to a result (which centers the camera itself).
        if (document.activeElement !== input) return;
        if (search.getCurrentIndex() >= 0) return;
        const firstId = results[0];
        const node = cy.getElementById(firstId);
        if (node.empty()) return;
        cy.animate({
          center: { eles: node },
          zoom: 1.5, duration: 400, easing: 'ease-out-cubic',
        });
      }, SEARCH_INPUT_DEBOUNCE_MS);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (pendingCenterTimer !== null) { clearTimeout(pendingCenterTimer); pendingCenterTimer = null; }
        input.value = '';
        search.clear();
        updateStats(cy);
        e.preventDefault();
        return;
      }
      if (search.getResults().length === 0) return;
      if (e.key === 'ArrowDown') {
        const id = search.navigateNext();
        if (id) detailPanel.show(id);
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        const id = search.navigatePrev();
        if (id) detailPanel.show(id);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        if (pendingCenterTimer !== null) { clearTimeout(pendingCenterTimer); pendingCenterTimer = null; }
        const results = search.getResults();
        const idx = search.getCurrentIndex();
        if (results[idx]) {
          detailPanel.show(results[idx]);
          highlight.highlightNode(results[idx]);
        }
        e.preventDefault();
      }
    });
  }

  attachSearchHandlers(document.getElementById('bs-search-input') as HTMLInputElement);
  attachSearchHandlers(document.getElementById('bs-mobile-search-input') as HTMLInputElement);
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────

function initKeyboardShortcuts(renderer: Renderer): void {
  initShortcuts(renderer.getCy(), {
    fitGraph: () => fitGraph(renderer),
    randomize: () => {
      randomize(renderer, uiState.highlight!);
      const cy = renderer.getCy();
      updateStats(cy);
      syncBottomSheetStats(cy);
    },
    toggleTour,
    tourPause,
    closeNodePanel: () => {
      uiState.detailPanel?.close();
    },
    tourStop,
    tourPrev,
    tourNext,
    requestDelete: (count) => {
      showToast(`再按一次 Backspace/Delete 确认删除 ${count} 个节点`, 'info');
    },
  });
}

// ── Window resize ─────────────────────────────────────────────────────────────

function initResizeHandler(renderer: Renderer): void {
  window.addEventListener('resize', () => {
    if (uiState.resizeTimer) clearTimeout(uiState.resizeTimer);
    uiState.resizeTimer = setTimeout(() => {
      fitGraph(renderer);
      syncTourBarPosition();
    }, 150);
  });
}

// ── Global exposure ────────────────────────────────────────────────────────────

function exposeGlobals(renderer: Renderer, highlight: HighlightEngine, detailPanel: DetailPanel): void {
  (window as any).toggleTour = toggleTour;
  (window as any).tourPause = tourPause;
  (window as any).tourStop = tourStop;
  (window as any).tourPrev = tourPrev;
  (window as any).tourNext = tourNext;
  (window as any).onTourStrategyToggle = onTourStrategyToggle;
  (window as any).startPanelDrag = initPanelDrag;
  (window as any).closeNodePanel = () => detailPanel.close();
  (window as any).fitGraph = () => fitGraph(renderer);
  (window as any).randomize = () => {
    randomize(renderer, highlight);
    updateStats(renderer.getCy());
    syncBottomSheetStats(renderer.getCy());
  };
  (window as any).resetAll = () => {
    clearShapeFilter();
    highlight.reset();
    detailPanel.close();
    renderer.runLayout('cose');
    updateStats(renderer.getCy());
    syncBottomSheetStats(renderer.getCy());
  };
  (window as any).animatePulse = () => animatePulse(renderer);
  (window as any).toggleSidebar = () => toggleSidebar(renderer);
  (window as any).closeBottomSheet = closeBottomSheet;
  (window as any).toggleBottomSheet = toggleBottomSheet;
  (window as any).highlightShape = (shape: string) => highlightShape(shape, highlight);
  (window as any).toggleBsParams = toggleBsParams;
(window as any).toggleSection = toggleSection;
  (window as any).applyLayoutParams = () => applyLayoutParams(renderer);
  (window as any).applyBsParams = () => applyBsParams(renderer);
  (window as any).runLayout = (name: string) => runLayout(name, renderer);
  (window as any)._dbg = {
    overlay: () => {
      setDebugActive(!debugOverlayActive);
      const btn = document.getElementById('debug-toggle');
      if (btn) btn.classList.toggle('active', debugOverlayActive);
      const panel = document.getElementById('debug-panel');
      if (panel) panel.style.display = debugOverlayActive ? '' : 'none';
      if (debugOverlayActive) {
        updateForensicPanel(renderer);
      }
    },
    node: (id: string) => {
      const n = renderer?.getCy().getElementById(id);
      if (n.empty()) return `节点 "${id}" 不存在`;
      return {
        id: n.id(), label: n.data('label'),
        type: n.data('type'), category: n.data('category'),
        layer: n.data('layer'),
        weight: n.data('weight'),
        shape: n.style('shape'),
        borderColor: n.style('border-color'),
        borderWidth: n.style('border-width'),
        backgroundColor: n.style('background-color'),
        width: n.renderedWidth(), height: n.renderedHeight(),
      };
    },
    selected: () => {
      const cy = renderer?.getCy();
      if (!cy) return [];
      return cy.$(':selected').nodes().map((n: cytoscape.NodeSingular) => ({
        id: n.id(), label: n.data('label'), dimmed: n.hasClass('dimmed'),
      }));
    },
  };
}

// ── Boot ───────────────────────────────────────────────────────────────────────
// Markdown content is fetched at runtime from public/content/ (see
// content-loader.ts). Vite plugin `pharma-graph:content-manifest` writes a
// manifest at build/dev-start so we know which files to fetch.
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
  const container = document.getElementById('cy');
  if (!container) throw new Error('#cy container not found');

  try {
  uiState.renderer = new Renderer({ container, data, layoutName: 'cose', layoutConfigs: LAYOUTS });
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
          center: { eles: node }, zoom: 1.5, duration: 400, easing: 'ease-out-cubic',
        });
      }
    },
    onClose: () => { uiState.highlight!.reset(); },
  });

  uiState.search = new Search(uiState.renderer.getCy(), uiState.highlight);
  const cy = uiState.renderer.getCy();

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
    onCanvasTapWhileTour: () => tourController.isRunning() || tourController.isPaused(),
    onCanvasTapWhileTourClear: () => tourController.stop(),
    setDragging: (d) => { uiState.isDragging = d; },
    setDragMode: (d) => { uiState.renderer!.setDragMode(d); },
  });

  initEdgeTooltip();
  initDebugOverlay(uiState.renderer);
  // TourController now owns slider binding, strategy toggle, mobile collapse,
  // and DOM broadcasting for both desktop and mobile bars.
  tourController = new TourController(cy, uiState.renderer, uiState.detailPanel!);
  tourController.mount();
  updateStats(cy);
  syncBottomSheetStats(cy);

  const badgeDot = document.getElementById('badge-dot');
  if (badgeDot) badgeDot.classList.remove('topbar__badge-dot--loading');

  brandCarousel.start();

  const sidebar = document.getElementById('sidebar');
  const sidebarBtn = document.getElementById('btn-sidebar-toggle');
  if (sidebar && sidebarBtn) sidebarBtn.classList.toggle('active', !sidebar.classList.contains('hidden'));

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

  // These init functions need cy — only proceed if renderer was created successfully
  initKeyboardShortcuts(uiState.renderer);
  initSearchUI(uiState.renderer.getCy(), uiState.highlight!, uiState.search!, uiState.detailPanel!);
  initResizeHandler(uiState.renderer);
  initMusicPlayer();
  exposeGlobals(uiState.renderer, uiState.highlight!, uiState.detailPanel!);
  // Debug: expose uiState for console diagnostics
  (window as any).uiState = uiState;
}

void boot();