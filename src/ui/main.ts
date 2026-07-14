// src/ui/main.ts
// Application entry — assembles all modules and wires up event handlers.

import './styles/index.css';
import cytoscape from 'cytoscape';
import { Renderer } from '../core/renderer.js';
import { GraphManager } from '../core/graph-manager.js';
import { TourEngine, type TourStrategy } from '../core/tour.js';
import { HighlightEngine } from './highlight-engine.js';
import { DetailPanel } from './detail-panel.js';
import { Search } from './search.js';
import { LAYOUTS } from '../core/config.js';
import { brandCarousel } from './carousel.js';
import { uiState } from './state.js';

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
  initTourBarCollapse,
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

const MD_FILES = import.meta.glob('../../content/**/*.md', { query: '?raw', import: 'default', eager: true });

// ── Tour ───────────────────────────────────────────────────────────────────────

function updateSliderFills(): void {
  // ── Mobile: update fill height in vertical tracks ───────────────────────
  const iFill = document.getElementById('tour-interval-fill');
  if (iFill) {
    const pct = ((parseInt((document.getElementById('tour-interval') as HTMLInputElement)?.value ?? '3000') - 1000) / (10000 - 1000)) * 100;
    iFill.style.height = pct + '%';
  }
  const dFill = document.getElementById('tour-depth-fill');
  if (dFill) {
    const v = parseInt((document.getElementById('tour-maxdepth') as HTMLInputElement)?.value ?? '10');
    const pct = ((v - 1) / (10 - 1)) * 100;
    dFill.style.height = pct + '%';
  }

  // ── Desktop: paint linear-gradient on range input background ─────────────
  const dtInterval = document.getElementById('tour-interval-dt') as HTMLInputElement;
  const dtDepth    = document.getElementById('tour-maxdepth-dt')  as HTMLInputElement;
  if (dtInterval) {
    const ratio = (parseInt(dtInterval.value) - 1000) / (10000 - 1000);
    dtInterval.style.background = `linear-gradient(to right, var(--tour-accent) 0%, var(--tour-accent) ${ratio * 100}%, rgba(255,255,255,0.1) ${ratio * 100}%, rgba(255,255,255,0.1) 100%)`;
  }
  if (dtDepth) {
    const ratio = (parseInt(dtDepth.value) - 1) / (10 - 1);
    dtDepth.style.background = `linear-gradient(to right, var(--tour-accent) 0%, var(--tour-accent) ${ratio * 100}%, rgba(255,255,255,0.1) ${ratio * 100}%, rgba(255,255,255,0.1) 100%)`;
  }
}

function initTourSlider(): void {
  // ── Mobile sliders ───────────────────────────────────────────────────────
  const intervalSliderMob = document.getElementById('tour-interval') as HTMLInputElement;
  const depthSliderMob    = document.getElementById('tour-maxdepth')  as HTMLInputElement;
  const intervalValMob    = document.getElementById('tour-interval-val');
  const depthValMob       = document.getElementById('tour-depth-val');

  updateSliderFills();

  if (intervalSliderMob) {
    intervalSliderMob.addEventListener('input', () => {
      if (intervalValMob) intervalValMob.textContent = Math.round(parseInt(intervalSliderMob.value) / 1000) + 's';
      updateSliderFills();
    });
    intervalSliderMob.addEventListener('change', () => {
      uiState.tour.engine?.setInterval(parseInt(intervalSliderMob.value));
    });
  }
  if (depthSliderMob) {
    depthSliderMob.addEventListener('input', () => {
      const v = parseInt(depthSliderMob.value);
      if (depthValMob) depthValMob.textContent = v >= 10 ? '\u221e' : String(v);
      updateSliderFills();
    });
    depthSliderMob.addEventListener('change', () => {
      const v = parseInt(depthSliderMob.value);
      uiState.tour.engine?.setMaxDepth(v >= 10 ? -1 : v);
    });
  }

  // ── Desktop sliders ───────────────────────────────────────────────────────
  const intervalSliderDt = document.getElementById('tour-interval-dt') as HTMLInputElement;
  const depthSliderDt    = document.getElementById('tour-maxdepth-dt')   as HTMLInputElement;
  const intervalValDt    = document.getElementById('tour-interval-val-dt');
  const depthValDt      = document.getElementById('tour-depth-val-dt');

  // Set initial background gradient on desktop sliders
  updateSliderFills();

  if (intervalSliderDt) {
    intervalSliderDt.addEventListener('input', () => {
      if (intervalValDt) intervalValDt.textContent = Math.round(parseInt(intervalSliderDt.value) / 1000) + 's';
      updateSliderFills();
    });
    intervalSliderDt.addEventListener('change', () => {
      uiState.tour.engine?.setInterval(parseInt(intervalSliderDt.value));
    });
  }
  if (depthSliderDt) {
    depthSliderDt.value = '10';
    depthSliderDt.addEventListener('input', () => {
      const v = parseInt(depthSliderDt.value);
      if (depthValDt) depthValDt.textContent = v >= 10 ? '\u221e' : String(v);
      updateSliderFills();
    });
    depthSliderDt.addEventListener('change', () => {
      const v = parseInt(depthSliderDt.value);
      uiState.tour.engine?.setMaxDepth(v >= 10 ? -1 : v);
    });
  }
}

function syncTourBadgeUI(running: boolean, paused: boolean): void {
  // Mobile
  const playIconMob   = document.getElementById('tour-badge-play');
  const pauseIconMob  = document.getElementById('tour-badge-pause');
  const badgeBtnMob   = document.getElementById('tour-badge-btn');
  if (playIconMob)  playIconMob.style.display  = paused ? '' : (running ? 'none' : '');
  if (pauseIconMob) pauseIconMob.style.display = paused ? 'none' : (running ? '' : 'none');
  if (badgeBtnMob) badgeBtnMob.classList.toggle('tour-active', running || paused);

  // Desktop — .tour-dt bar
  const dtDot    = document.getElementById('tour-dt-dot');
  const dtLabel  = document.getElementById('tour-dt-label');
  const playDt   = document.getElementById('tour-badge-play-dt');
  const pauseDt  = document.getElementById('tour-badge-pause-dt');
  if (dtDot) {
    dtDot.classList.remove('paused', 'stopped');
    if (!running && !paused) dtDot.classList.add('stopped');
    else if (paused) dtDot.classList.add('paused');
  }
  if (dtLabel) dtLabel.textContent = paused ? '已暂停' : (running ? '漫游中' : '漫游');
  if (playDt)  playDt.style.display  = paused ? '' : (running ? 'none' : '');
  if (pauseDt) pauseDt.style.display = paused ? 'none' : (running ? '' : 'none');

  // Toolbar buttons
  const bsTourPlay = document.getElementById('bs-tour-icon-play');
  const bsTourStop = document.getElementById('bs-tour-icon-stop');
  const tourBtn    = document.getElementById('btn-tour');
  const bsTourBtn  = document.getElementById('bs-btn-tour');
  const tourPlaySvg = tourBtn?.querySelector('svg:not(#tour-icon-stop)') as HTMLElement | null;
  const tourStopSvg = document.getElementById('tour-icon-stop');
  if (bsTourPlay) bsTourPlay.style.display = paused ? '' : (running ? 'none' : '');
  if (bsTourStop) bsTourStop.style.display = paused ? 'none' : (running ? '' : 'none');
  if (tourPlaySvg) tourPlaySvg.style.display = paused ? '' : (running ? 'none' : '');
  if (tourStopSvg) tourStopSvg.style.display = paused ? 'none' : (running ? '' : 'none');
  if (tourBtn)   tourBtn.classList.toggle('active', running || paused);
  if (bsTourBtn) bsTourBtn.classList.toggle('active', running || paused);
}

function startTour(): void {
  if (!uiState.renderer) return;
  if (uiState.tour.engine && (uiState.tour.engine.isRunning() || uiState.tour.engine.isPaused())) {
    tourStop();
  }
  const cy = uiState.renderer.getCy();
  uiState.tour.pathHistory = [];

  // Reset mobile badges
  const depthBadge = document.getElementById('tour-depth-badge');
  const countBadge = document.getElementById('tour-count-badge');
  if (depthBadge) depthBadge.textContent = '0';
  if (countBadge) countBadge.textContent = '0';
  // Reset desktop badges
  const depthBadgeDt = document.getElementById('tour-depth-badge-dt');
  const countBadgeDt = document.getElementById('tour-count-badge-dt');
  if (depthBadgeDt) depthBadgeDt.textContent = '0';
  if (countBadgeDt) countBadgeDt.textContent = '0';
  // Progress bars
  const progressBar = document.getElementById('tour-progress-bar');
  const progressFillDt = document.getElementById('tour-progress-fill-dt');
  const progressLabelDt = document.getElementById('tour-progress-label-dt');
  if (progressBar) progressBar.style.width = '0%';
  if (progressFillDt) progressFillDt.style.width = '0%';
  if (progressLabelDt) progressLabelDt.textContent = '0 / 0';
  const cycleNum = document.getElementById('tour-cycle-num');
  const cycleNumDt = document.getElementById('tour-cycle-num-dt');
  if (cycleNum) cycleNum.textContent = '1';
  if (cycleNumDt) cycleNumDt.textContent = '1';

  const selected = cy.nodes('.node-selected').not('.layer-parent');
  let best = cy.nodes().not('.layer-parent')[0];
    let maxDegree = 0;
  if (selected.length > 0) {
    best = selected[0];
  } else {
    cy.nodes().not('.layer-parent').forEach((n) => {
      const d = n.degree();
      if (d > maxDegree) { maxDegree = d; best = n; }
    });
  }
  const rootId = best?.id() ?? '';

  const intervalSlider = (document.getElementById('tour-interval') ?? document.getElementById('tour-interval-dt')) as HTMLInputElement;
  const depthSlider    = (document.getElementById('tour-maxdepth') ?? document.getElementById('tour-maxdepth-dt')) as HTMLInputElement;
  const interval = parseInt(intervalSlider?.value ?? '3000');
  const maxDepth = parseInt(depthSlider?.value ?? '10');
  const strategy = uiState.tour.strategy;

  uiState.tour.engine = new TourEngine(cy);
  uiState.tour.engine.start(rootId, {
    interval,
    maxDepth: maxDepth >= 10 ? -1 : maxDepth,
    strategy,
    onStep: (info) => {
      const prevNodes = info.path.slice(0, -1);
      const currNode = info.path[info.path.length - 1];
      if (prevNodes.length > 0) {
        uiState.tour.pathHistory.push(prevNodes[prevNodes.length - 1], currNode);
      } else {
        uiState.tour.pathHistory.push(currNode);
      }

      // ── Mobile badges ─────────────────────────────────────────────────────
      const depthBadge = document.getElementById('tour-depth-badge');
      const countBadge = document.getElementById('tour-count-badge');
      if (depthBadge) depthBadge.textContent = String(info.layerIndex);
      if (countBadge) countBadge.textContent = String(info.layerIndex);
      const progressBar = document.getElementById('tour-progress-bar');
      if (progressBar && info.totalToExplore > 0) {
        progressBar.style.width = Math.round((info.layerIndex / info.totalToExplore) * 100) + '%';
      }
      // Desktop: update cycle count on mobile bar (tour-cycle-num exists in HTML)
      const cycleNum = document.getElementById('tour-cycle-num');
      if (cycleNum) cycleNum.textContent = String(info.cycleCount + 1);

      // ── Desktop badges ────────────────────────────────────────────────────
      const depthBadgeDt = document.getElementById('tour-depth-badge-dt');
      const countBadgeDt = document.getElementById('tour-count-badge-dt');
      const cycleNumDt   = document.getElementById('tour-cycle-num-dt');
      const nodeNameDt   = document.getElementById('tour-dt-node-name');
      if (depthBadgeDt) depthBadgeDt.textContent = String(info.layerIndex);
      if (countBadgeDt) countBadgeDt.textContent = String(info.layerIndex);
      if (cycleNumDt) cycleNumDt.textContent = String(info.cycleCount + 1);
      if (nodeNameDt) {
        const node = cy.getElementById(info.nodeId);
        nodeNameDt.textContent = node.data('label') ?? info.nodeId;
      }
      const progressFillDt = document.getElementById('tour-progress-fill-dt');
      const progressLabelDt = document.getElementById('tour-progress-label-dt');
      if (progressFillDt && info.totalToExplore > 0) {
        progressFillDt.style.width = Math.round((info.layerIndex / info.totalToExplore) * 100) + '%';
      }
      if (progressLabelDt) {
        progressLabelDt.textContent = `${info.layerIndex} / ${info.totalToExplore}`;
      }
    },
    onStepAfterCenter: (info) => {
      // Show detail panel AFTER pan animation completes — ensures reposition
      // reads the node's final (centered) renderedPosition, not its pre-animation position.
      uiState.detailPanel?.show(info.nodeId);
    },
    onComplete: () => {
      uiState.tour.pathHistory = [];
      // Close detail panel
      uiState.detailPanel?.close();
      // Mobile: show check mark
      const depthBadge = document.getElementById('tour-depth-badge');
      const countBadge = document.getElementById('tour-count-badge');
      if (depthBadge) depthBadge.textContent = '\u2713';
      if (countBadge) countBadge.textContent = '—';
      // Desktop: show check mark + reset node name
      const depthBadgeDt = document.getElementById('tour-depth-badge-dt');
      const countBadgeDt = document.getElementById('tour-count-badge-dt');
      const nodeNameDt   = document.getElementById('tour-dt-node-name');
      const progressFillDt = document.getElementById('tour-progress-fill-dt');
      if (depthBadgeDt) depthBadgeDt.textContent = '\u2713';
      if (countBadgeDt) countBadgeDt.textContent = '—';
      if (nodeNameDt) nodeNameDt.textContent = '完成';
      if (progressFillDt) progressFillDt.style.width = '100%';
      // Clear active state on toolbar buttons
      const tourBtn = document.getElementById('btn-tour');
      const bsTourBtn = document.getElementById('bs-btn-tour');
      if (tourBtn) tourBtn.classList.remove('active');
      if (bsTourBtn) bsTourBtn.classList.remove('active');
      const badgeBtn = document.getElementById('tour-badge-btn');
      const badgeBtnDt = document.getElementById('tour-badge-btn-dt');
      if (badgeBtn) badgeBtn.classList.remove('tour-active');
      if (badgeBtnDt) badgeBtnDt.classList.remove('tour-active');
      // Hide the bar after 2s
      const status = document.getElementById('tour-status');
      const dtBar = document.getElementById('tour-dt');
      if (status && !uiState.tour.engine?.isRunning()) {
        setTimeout(() => {
          if (status) status.classList.remove('tour-visible');
          if (dtBar) dtBar.classList.remove('tour-visible');
        }, 2000);
      }
    },
  });

  uiState.tour.running = true;
  uiState.tour.paused = false;
  syncTourBadgeUI(true, false);
  // CSS 媒体查询控制默认显示，JS class 控制动态显示
  const status = document.getElementById('tour-status');
  const dtBar = document.getElementById('tour-dt');
  if (window.innerWidth <= 640) {
    if (status) status.classList.add('tour-visible');
    if (dtBar) dtBar.classList.remove('tour-visible');
  } else {
    if (dtBar) dtBar.classList.add('tour-visible');
    if (status) status.classList.remove('tour-visible');
  }
}

function tourPause(): void {
  if (!uiState.tour.engine) return;
  const paused = uiState.tour.engine.isPaused();
  if (paused) {
    uiState.tour.engine.resume();
  } else {
    uiState.tour.engine.pause();
  }
  uiState.tour.paused = !paused;
  syncTourBadgeUI(uiState.tour.running, uiState.tour.paused);
}

function tourStop(): void {
  if (!uiState.tour.engine) return;
  uiState.tour.engine.stop();
  uiState.tour.engine = null;
  uiState.tour.pathHistory = [];
  uiState.tour.running = false;
  uiState.tour.paused = false;
  const bsTourPlay = document.getElementById('bs-tour-icon-play');
  const bsTourStop = document.getElementById('bs-tour-icon-stop');
  if (bsTourPlay) bsTourPlay.style.display = '';
  if (bsTourStop) bsTourStop.style.display = 'none';
  const status = document.getElementById('tour-status');
  const dtBar = document.getElementById('tour-dt');
  if (status) status.classList.remove('tour-visible');
  if (dtBar) dtBar.classList.remove('tour-visible');
  syncTourBadgeUI(false, false);
}

function toggleTour(): void {
  if (uiState.tour.engine?.isRunning() || uiState.tour.engine?.isPaused()) tourStop();
  else startTour();
}

function tourPrev(): void {
  if (!uiState.tour.engine) return;
  uiState.tour.engine.prev();
  uiState.detailPanel?.close();
}

function tourNext(): void {
  if (!uiState.tour.engine) return;
  uiState.tour.engine.next();
  uiState.detailPanel?.close();
}

function onTourStrategyChange(value: TourStrategy): void {
  uiState.tour.strategy = value;
  const dtSel = document.getElementById('tour-strategy-select-dt') as HTMLSelectElement;
  if (dtSel) dtSel.value = value;
  syncMobStrategyUI(value);
  if (uiState.tour.engine?.isRunning() || uiState.tour.engine?.isPaused()) {
    startTour();
  }
  const flashEl = (el: HTMLElement | null) => {
    if (!el) return;
    el.classList.remove('strategy-switched');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('strategy-switched');
    el.addEventListener('animationend', () => el.classList.remove('strategy-switched'), { once: true });
  };
  flashEl(dtSel);
  const mobBtn = document.getElementById('tour-strategy-toggle-mob');
  flashEl(mobBtn);
}

function onTourStrategyToggle(): void {
  const current = uiState.tour.strategy;
  const next: TourStrategy = current === 'has-dfs' ? 'topo-prereq' : 'has-dfs';
  onTourStrategyChange(next);
}

function syncMobStrategyUI(strategy: TourStrategy): void {
  const valueEl = document.getElementById('tour-strategy-value-mob');
  if (valueEl) {
    valueEl.textContent = strategy === 'has-dfs' ? '教材' : '层级';
  }
}

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

function initSearchUI(
  cy: cytoscape.Core,
  highlight: HighlightEngine,
  search: Search,
  detailPanel: DetailPanel,
): void {
  function attachSearchHandlers(input: HTMLInputElement | null) {
    if (!input) return;
    input.addEventListener('input', () => {
      const results = search.search(input.value);
      if (results.length > 0) {
        cy.animate({
          center: { eles: cy.getElementById(results[0]) },
          zoom: 1.5, duration: 400, easing: 'ease-out-cubic',
        });
      }
      updateStats(cy);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
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
  (window as any).onTourStrategyChange = (v: string) => onTourStrategyChange(v as TourStrategy);
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

const graphManager = new GraphManager(MD_FILES as Record<string, string>);
const data = graphManager.build();
// Diagnostic — surfaces data shape so we can confirm parser→renderer pipeline
// is producing edges in the browser. Remove once the missing-edges bug is
// confirmed resolved.
console.info('[pharma-graph] graph build:', {
  mdFiles: Object.keys(MD_FILES).length,
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
    onCanvasTapWhileTour: () => Boolean(uiState.tour.engine?.isRunning()) || Boolean(uiState.tour.engine?.isPaused()),
    onCanvasTapWhileTourClear: () => tourStop(),
    setDragging: (d) => { uiState.isDragging = d; },
    setDragMode: (d) => { uiState.renderer!.setDragMode(d); },
  });

  initEdgeTooltip();
  initDebugOverlay(uiState.renderer);
  initTourSlider();
  syncMobStrategyUI(uiState.tour.strategy);
  updateStats(cy);
  syncBottomSheetStats(cy);

  const badgeDot = document.getElementById('badge-dot');
  if (badgeDot) badgeDot.classList.remove('topbar__badge-dot--loading');

  brandCarousel.start();

  const sidebar = document.getElementById('sidebar');
  const sidebarBtn = document.getElementById('btn-sidebar-toggle');
  if (sidebar && sidebarBtn) sidebarBtn.classList.toggle('active', !sidebar.classList.contains('hidden'));

  initSheetDrag();
  initTourBarCollapse();
  initPanelDrag();

} catch (err) {
  const n = document.getElementById('stat-nodes');
  const e = document.getElementById('stat-edges');
  if (n) n.textContent = 'error';
  if (e) e.textContent = (err as Error).message;
  console.error('[pharma-graph] Boot error:', err);
}

// These init functions need cy — only proceed if renderer was created successfully
if (uiState.renderer) {
  const cy = uiState.renderer.getCy();
  initKeyboardShortcuts(uiState.renderer);
  initSearchUI(cy, uiState.highlight!, uiState.search!, uiState.detailPanel!);
  initResizeHandler(uiState.renderer);
  initMusicPlayer();
  exposeGlobals(uiState.renderer, uiState.highlight!, uiState.detailPanel!);
  // Debug: expose uiState for console diagnostics
  (window as any).uiState = uiState;
}