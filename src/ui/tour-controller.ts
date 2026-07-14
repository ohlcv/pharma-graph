// src/ui/tour-controller.ts
// Owns the tour state machine and keeps the (otherwise duplicated) DOM in sync.
//
// Two unrelated sources of complexity motivated this refactor:
//
//   1. The same controls live in two parallel DOM trees — one mobile (`#tour-status`),
//      one desktop (`#tour-dt`) — and earlier code poked them one id at a time.
//      We now use a single delegated event listener keyed on `data-tour-action`
//      and broadcast state via a `.tour-state--{running|paused|idle}` class that
//      affects every matching descendant selector at once.
//
//   2. Visible/Invisible of the two bars is supposed to be a media-query concern
//      (CSS handles desktop-vs-mobile automatically). Previously the JS code
//      toggled `.tour-visible` per bar based on `window.innerWidth`, which
//      fights the cascade and produces flicker on rotate. The class is kept as
//      an extra opt-in for non-media-query reasons (e.g. tour-engine is idle).
//
// Engine lifecycle:
//   stop → idle
//   start → running     → pause/resume toggles ↔ paused/running
//   complete (engine callback) → idle, then auto-hide after 2s

import cytoscape from 'cytoscape';
import { TourEngine, TourStrategy, TourStepInfo } from '../core/tour.js';
import { Renderer } from '../core/renderer.js';
import { DetailPanel } from './detail-panel.js';
import { uiState } from './state.js';
import { UiToggle } from './ui-toggle.js';

const SEARCH_INPUT_DEBOUNCE_MS = 220;

/** Slider drag UI — kept tabular so CSS-only fill can mirror the value live. */
interface SliderBind {
  range: HTMLInputElement;
  fill?: HTMLElement | null;       // optional: vertical track fill (#tour-interval-fill / depth-fill)
  value?: HTMLElement | null;      // optional: external value label
  bgRange?: HTMLInputElement | null;// optional: a second range whose background gradient mirrors this slider (desktop dual-input setup)
  format: (v: number) => string;
  onCommit: (v: number) => void;
}

export class TourController {
  private engine: TourEngine | null = null;
  private running = false;
  private paused = false;
  private readonly sliders: SliderBind[] = [];
  private barToggle!: UiToggle;

  constructor(
    private readonly cy: cytoscape.Core,
    private readonly renderer: Renderer,
    private readonly detailPanel: DetailPanel,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Wire up DOM once. Idempotent — safe to call after hot-reload or re-init. */
  mount(): void {
    this.bindActions();
    this.bindSliders();
    this.bindStrategyToggle();
    this.bindMobileCollapse();
    this.setIdleUI();
  }

  isRunning(): boolean { return this.running; }
  isPaused():  boolean { return this.paused; }

  start(): void {
    if (this.engine?.isRunning() || this.engine?.isPaused()) {
      this.stop();
    }
    const rootId = this.pickRoot();
    this.engine = new TourEngine(this.cy);
    this.engine.start(rootId, {
      interval: this.currentInterval(),
      maxDepth: this.currentMaxDepth(),
      strategy: uiState.tour.strategy,
      onStep:           (info) => this.onStep(info),
      onStepAfterCenter:(info) => { this.detailPanel.show(info.nodeId); },
      onComplete:       () => this.onComplete(),
    });
    this.running = true;
    this.paused = false;
    this.setRunningUI();
  }

  togglePause(): void {
    if (!this.engine) return;
    if (this.paused) this.engine.resume();
    else             this.engine.pause();
    this.paused = !this.paused;
    this.setRunningUI();
  }

  stop(): void {
    if (this.engine) this.engine.stop();
    this.engine = null;
    this.running = false;
    this.paused = false;
    this.detailPanel.close();
    this.setIdleUI();
  }

  prev(): void {
    if (!this.engine) return;
    this.engine.prev();
    this.detailPanel.close();
  }

  next(): void {
    if (!this.engine) return;
    this.engine.next();
    this.detailPanel.close();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private pickRoot(): string {
    const sel = this.cy.nodes('.node-selected').not('.layer-parent');
    if (sel.length > 0) return sel[0].id();
    let best: cytoscape.NodeSingular | null = null;
    let maxDeg = 0;
    this.cy.nodes().not('.layer-parent').forEach((n) => {
      const d = n.degree();
      if (d > maxDeg) { maxDeg = d; best = n; }
    });
    return (best as cytoscape.NodeSingular | null)?.id() ?? '';
  }

  private currentInterval(): number {
    return this.findSlider('interval')?.range.valueAsNumber ?? 3000;
  }

  private currentMaxDepth(): number {
    const v = this.findSlider('maxdepth')?.range.valueAsNumber ?? 10;
    return v >= 10 ? -1 : v;
  }

  private findSlider(which: 'interval' | 'maxdepth'): SliderBind | undefined {
    return this.sliders.find((s) => s.range.dataset['tourSlider'] === which);
  }

  /** Set the tour strategy. If currently running, restart with the new strategy. */
  setStrategy(next: TourStrategy): void {
    uiState.tour.strategy = next;
    const sel = document.getElementById('tour-strategy-select-dt') as HTMLSelectElement | null;
    if (sel) sel.value = next;
    this.syncMobileStrategyLabel(next);
    this.flashStrategyButton(sel);
    this.flashStrategyButton(document.getElementById('tour-strategy-toggle-mob'));
    if (this.running || this.paused) this.start();
  }

  /** Mobile compact-button shortcut: cycle between the two strategies. */
  toggleStrategy(): void {
    const next: TourStrategy = uiState.tour.strategy === 'has-dfs' ? 'topo-prereq' : 'has-dfs';
    this.setStrategy(next);
  }

  // ── DOM binding ────────────────────────────────────────────────────────────

  private bindActions(): void {
    // Action delegation — every control carries data-tour-action.
    document.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-tour-action]');
      if (!target) return;
      const action = target.dataset['tourAction'];
      switch (action) {
        case 'start':  this.start();      break;
        case 'toggle-pause': this.togglePause(); break;
        case 'stop':   this.stop();       break;
        case 'prev':   this.prev();       break;
        case 'next':   this.next();       break;
      }
    });
  }

  private bindSliders(): void {
    // Mobile sliders drive values; desktop sliders mirror them. We bind mobile
    // first and replicate input/change events to the desktop counterparts.
    const mobileInterval = document.getElementById('tour-interval') as HTMLInputElement | null;
    const mobileDepth    = document.getElementById('tour-maxdepth')  as HTMLInputElement | null;
    const desktopInterval = document.getElementById('tour-interval-dt') as HTMLInputElement | null;
    const desktopDepth    = document.getElementById('tour-maxdepth-dt')  as HTMLInputElement | null;

    if (mobileInterval) {
      this.sliders.push(this.bindSlider(
        mobileInterval, desktopInterval,
        document.getElementById('tour-interval-fill'),
        document.getElementById('tour-interval-val'),
        document.getElementById('tour-interval-val-dt'),
        (v) => Math.round(v / 1000) + 's',
        (v) => this.engine?.setInterval(v),
      ));
    }
    if (mobileDepth) {
      this.sliders.push(this.bindSlider(
        mobileDepth, desktopDepth,
        document.getElementById('tour-depth-fill'),
        document.getElementById('tour-depth-val'),
        document.getElementById('tour-depth-val-dt'),
        (v) => v >= 10 ? '\u221e' : String(v),
        (v) => this.engine?.setMaxDepth(v >= 10 ? -1 : v),
      ));
    }

    // Initial paint so the fill heights and background gradients match defaults.
    for (const s of this.sliders) this.paintFill(s);
  }

  /**
   * Bind a primary slider plus its mirror (mobile + desktop dual DOM tree).
   * Any change on either side updates both visual fills, both value labels,
   * and ultimately commits the new value to the running engine.
   */
  private bindSlider(
    primary: HTMLInputElement,
    mirror: HTMLInputElement | null,
    primaryFill: HTMLElement | null,
    primaryValueLabel: HTMLElement | null,
    mirrorValueLabel: HTMLElement | null,
    format: (v: number) => string,
    onCommit: (v: number) => void,
  ): SliderBind {
    const bind: SliderBind = {
      range: primary,
      fill: primaryFill,
      value: primaryValueLabel,
      bgRange: mirror ?? null,
      format,
      onCommit,
    };

    const applyInput = () => {
      if (mirror) mirror.value = primary.value;
      const text = format(primary.valueAsNumber);
      if (primaryValueLabel) primaryValueLabel.textContent = text;
      if (mirrorValueLabel) mirrorValueLabel.textContent = text;
      this.paintFill(bind);
    };

    primary.addEventListener('input', applyInput);
    primary.addEventListener('change', () => onCommit(primary.valueAsNumber));

    if (mirror) {
      mirror.addEventListener('input', () => {
        primary.value = mirror.value;
        applyInput();
      });
      mirror.addEventListener('change', () => onCommit(mirror.valueAsNumber));
    }

    return bind;
  }

  private paintFill(s: SliderBind): void {
    const min = Number(s.range.min), max = Number(s.range.max);
    const pct = ((s.range.valueAsNumber - min) / (max - min)) * 100;
    if (s.fill && s.fill.style.height !== undefined) {
      // Vertical track (mobile)
      s.fill.style.height = pct + '%';
    } else if (s.bgRange) {
      // Horizontal track (desktop) — paint via gradient background
      s.bgRange.style.background =
        `linear-gradient(to right, var(--tour-accent) 0%, var(--tour-accent) ${pct}%, rgba(255,255,255,0.1) ${pct}%, rgba(255,255,255,0.1) 100%)`;
    }
  }

  private bindStrategyToggle(): void {
    // Desktop <select> (change on its own value)
    const sel = document.getElementById('tour-strategy-select-dt') as HTMLSelectElement | null;
    sel?.addEventListener('change', () => this.setStrategy(sel.value as TourStrategy));

    // Mobile compact button (toggles between the two)
    const mobBtn = document.getElementById('tour-strategy-toggle-mob');
    mobBtn?.addEventListener('click', () => this.toggleStrategy());
  }

  private syncMobileStrategyLabel(strategy: TourStrategy): void {
    const valueEl = document.getElementById('tour-strategy-value-mob');
    if (valueEl) {
      valueEl.textContent = strategy === 'has-dfs' ? '教材' : '层级';
    }
  }

  private flashStrategyButton(el: HTMLElement | null): void {
    if (!el) return;
    el.classList.remove('strategy-switched');
    void el.offsetWidth; // force reflow to restart the animation
    el.classList.add('strategy-switched');
    el.addEventListener('animationend', () => el.classList.remove('strategy-switched'), { once: true });
  }

  private bindMobileCollapse(): void {
    const handle = document.getElementById('tour-status-handle');
    if (!handle) return;
    const bar = document.getElementById('tour-status');
    const chev = handle.querySelector<SVGElement>('.tour-mob__chev');
    // Centralised toggle: persists across reloads, applies `collapsed` to
    // both the bar and its chevron, mirrors into uiState.tourBarCollapsed
    // for any legacy readers.
    this.barToggle = new UiToggle({
      initial: uiState.tourBarCollapsed,
      persist: 'tourBar.collapsed',
      cssClass: 'collapsed',
      applyTo: bar && chev ? [bar, chev] : (bar ?? chev ?? handle),
      onChange: (on) => { uiState.tourBarCollapsed = on; },
    });
    handle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.barToggle.toggle();
    });
  }

  // ── Engine callbacks ───────────────────────────────────────────────────────

  private onStep(info: TourStepInfo): void {
    this.running = true;
    this.paused = false;
    // Push to history
    const ph = uiState.tour.pathHistory;
    const prev = info.path.slice(0, -1);
    if (prev.length > 0) ph.push(prev[prev.length - 1], info.nodeId);
    else                 ph.push(info.nodeId);

    // Mobile badges
    this.setText('tour-depth-badge',     String(info.layerIndex));
    this.setText('tour-count-badge',     String(info.layerIndex));
    this.setText('tour-cycle-num',       String(info.cycleCount + 1));
    // Desktop badges
    this.setText('tour-depth-badge-dt',  String(info.layerIndex));
    this.setText('tour-count-badge-dt',  String(info.layerIndex));
    this.setText('tour-cycle-num-dt',    String(info.cycleCount + 1));
    this.setText('tour-dt-node-name',    this.labelOf(info.nodeId) || info.nodeId);
    // Progress: current step / total steps in the sequence. We read totals
    // from the engine rather than info.totalToExplore because totalToExplore
    // shrinks when maxDepth caps the run.
    const total = this.engine?.totalSteps() ?? info.totalToExplore;
    const step  = this.engine?.currentStepIndex() ?? info.currentStep;
    this.renderTimeline(step, total);
  }

  /**
   * Update the progress bar + "N / M" counter + the dot marker showing the
   * current step. The marker is positioned over the progress track by
   * `left:%` so it lines up with the leading edge of the fill.
   */
  private renderTimeline(current: number, total: number): void {
    if (total <= 0) return;
    const ratio = Math.max(0, Math.min(1, current / total));
    this.setProgress('tour-progress-fill-dt', ratio);
    this.setText('tour-progress-label-dt', `${current} / ${total}`);
    const marker = document.getElementById('tour-progress-marker-dt');
    if (marker) marker.style.left = (ratio * 100).toFixed(2) + '%';
    // Mobile uses a compact "current/total" stat in place of the bar.
    this.setText('tour-step-badge', String(current));
    this.setText('tour-step-total', String(total));
  }

  private onComplete(): void {
    this.running = false;
    this.paused = false;

    this.setText('tour-depth-badge',     '\u2713');
    this.setText('tour-count-badge',     '—');
    this.setText('tour-depth-badge-dt',  '\u2713');
    this.setText('tour-count-badge-dt',  '—');
    this.setText('tour-dt-node-name',    '完成');
    const fillEl = document.getElementById('tour-progress-fill-dt');
    if (fillEl) fillEl.style.width = '100%';

    this.setIdleUI();
  }

  // ── UI broadcasting ───────────────────────────────────────────────────────

  /**
   * Toggle the document-level `.tour-state--{idle|running|paused}` class.
   * CSS rules in tour.css map that class to:
   *   - bar visibility (via `.tour-state-target`)
   *   - play vs pause icon (`[data-tour-icon]`)
   *   - dot color
   *   - toolbar button "active" highlight
   * The JS layer never touches `style.display` on these elements.
   */
  private setRunningUI(): void {
    this.applyStateClass(this.paused ? 'paused' : 'running');
  }

  private setIdleUI(): void {
    this.applyStateClass('idle');
  }

  private applyStateClass(state: 'idle' | 'running' | 'paused'): void {
    const root = document.documentElement;
    root.classList.remove('tour-state--idle', 'tour-state--running', 'tour-state--paused');
    root.classList.add(`tour-state--${state}`);
  }

  private setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  private setProgress(id: string, ratio: number): void {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.round(ratio * 100) + '%';
  }

  private labelOf(nodeId: string): string {
    const node = this.cy.getElementById(nodeId);
    return node.empty() ? nodeId : (node.data('label') || nodeId);
  }
}

// Re-exported SEARCH_INPUT_DEBOUNCE_MS kept here for proximity to related tour state.
export { SEARCH_INPUT_DEBOUNCE_MS };
