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
import { TourEngine, TourStrategy, TourStepInfo, getLocationKey, TOUR_DEPTH_CONFIG, isKeyDrug, TourCompleteInfo } from '../core/tour.js';
import { Renderer } from '../core/renderer.js';
import { DetailPanel } from './detail-panel.js';
import { uiState, registerTourBarToggle } from './state.js';
import { UiToggle } from './ui-toggle.js';
import { showToast } from './ui-helpers.js';
import { speechController } from './speech.js';

const SEARCH_INPUT_DEBOUNCE_MS = 220;

/** Slider drag UI — kept tabular so CSS-only fill can mirror the value live. */
interface SliderBind {
  range: HTMLInputElement;
  fill?: HTMLElement | null;       // optional: vertical track fill (#tour-interval-fill / depth-fill)
  value?: HTMLElement | null;      // optional: external value label
  /** All additional mirrors to keep in sync (values + labels) */
  extraMirrors?: HTMLInputElement[];
  /** All additional value labels to update */
  extraMirrorLabels?: (HTMLElement | null)[];
  format: (v: number) => string;
  onCommit: (v: number) => void;
}

export class TourController {
  private engine: TourEngine | null = null;
  private running = false;
  private paused = false;
  private readonly sliders: SliderBind[] = [];
  private barToggle!: UiToggle;
  private _mounted = false;
  private _boundClick: ((e: MouseEvent) => void) | null = null;
  private _boundKeydown: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private readonly cy: cytoscape.Core,
    private readonly renderer: Renderer,
    private readonly detailPanel: DetailPanel,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Wire up DOM. Idempotent — safe to call after hot-reload or re-init. */
  mount(): void {
    if (this._mounted) return;
    this._mounted = true;
    this.bindActions();
    this.bindSliders();
    this.bindStrategyToggle();
    this.bindMobileCollapse();
    this.bindSelectionHint();
    this.setIdleUI();
    // 初始化 fill（DOM 默认 value 不会触发 input 事件，需手动同步 fill）
    for (const s of this.sliders) this.paintFill(s);
  }

  isRunning(): boolean { return this.running; }
  isPaused():  boolean { return this.paused; }

  /** 追踪期望的档位（1-5，5=全部），用于在 start() 时覆盖 DOM 滑块值 */
  private _pendingMaxDepth: number = 5;

  start(): void {
    if (this.engine?.isRunning() || this.engine?.isPaused()) {
      this.stop();
    }
    // 新一次漫游 = 新的用户意图，面板跟随恢复
    uiState.panelClosedByUser = false;
    const rootId = this.pickRoot();
    this.engine = new TourEngine(this.cy);
    const ok = this.engine.start(rootId, {
      interval: this.currentInterval(),
      // 传递档位（5=全部），TourEngine 内部会处理为无限模式
      maxDepth: this._pendingMaxDepth,
      strategy: uiState.tour.strategy,
      onStep:           (info) => this.onStep(info),
      onStepAfterCenter:(info) => {
        if (!uiState.panelClosedByUser) {
          this.detailPanel.show(info.nodeId);
        }
      },
      onPause:          () => this.onEnginePause(),
      onResume:         () => this.onEngineResume(),
      onComplete:       (reason) => this.onComplete(reason),
    });
    // Engine returns false when there's nothing to visit at this depth —
    // e.g. the selected node's fill type doesn't match the slider position.
    // Don't switch the UI to "running" in that case; surface a brief toast
    // and stay idle so the user knows to pick a different node or depth.
    if (!ok) {
      this.engine = null;
      this.running = false;
      this.paused = false;
      this.setIdleUI();
      showToast('当前档位下没有可漫游的节点 — 试试调高档位或点选其他节点', 'info');
      this.announceStatus('漫游启动失败：当前档位无可访问节点');
      return;
    }
    this.running = true;
    this.paused = false;
    this.setRunningUI();
  }

  togglePause(): void {
    if (!this.engine) return;
    // Read the engine's real paused state rather than our cached flag.
    // Previously we toggled `this.paused` based on its own previous value,
    // which could desync from the engine if prev/next were invoked while
    // paused (the engine's onPause was skipped on the 2nd call, leaving
    // the controller stale). Reading `isPaused()` here keeps the source
    // of truth on the engine — Bug: resume-after-paused-prev was a no-op.
    if (this.engine.isPaused()) this.engine.resume();
    else                        this.engine.pause();
    // The engine fires onPause/onResume synchronously, which updates
    // `this.paused` + setRunningUI() via onEnginePause/Resume. No need
    // to mutate flags here.
  }

  /**
   * Toggle the tour on/off. If running or paused, stop. Otherwise start.
   * Replaces the old `toggleTour()` global wrapper in main.ts.
   */
  toggle(): void {
    if (this.running || this.paused) this.stop();
    else                             this.start();
  }

  stop(): void {
    if (this.engine) this.engine.stop();
    this.engine = null;
    this.running = false;
    this.paused = false;
    this.detailPanel.close();
    speechController.stop();
    this.setIdleUI();
  }

  prev(): void {
    if (!this.engine) return;
    this.engine.prev();
    this.detailPanel.closeSilently();
  }

  next(): void {
    if (!this.engine) return;
    this.engine.next();
    this.detailPanel.closeSilently();
  }

  /** 调试用：预览指定策略（或全部策略）的漫游序列。控制台调用：
   *   _dbg.previewSequence()              // 两种策略都打印
   *   _dbg.previewSequence('has-dfs')     // 只看教材顺序
   *   _dbg.previewSequence('topo-prereq') // 只看依赖顺序
   */
  previewSequence(strategyId?: string): void {
    if (!this.engine) {
      // 引擎未启动时也能预览——从图上重建一个临时引擎
      const temp = new TourEngine(this.cy);
      temp.previewSequence(strategyId as TourStrategy | undefined);
      return;
    }
    this.engine.previewSequence(strategyId as TourStrategy | undefined);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private pickRoot(): string {
    // 注意：选中节点用 .selected-node class（不是 .node-selected，也不是 cytoscape 的 :selected）
    const sel = this.cy.nodes('.selected-node').not('.layer-parent');
    if (sel.length > 0) {
      return sel[0].id();
    }

    // 没有选中节点时，按优先级挑"教材入口"作为起点：
    //   1. id 以 'book-' 开头的 structure 节点（书本根入口）
    //   2. fill='cls-structure' 且 id 不是子章节（如 'sec-'、'ch-'）的入口
    //   3. 都没找到时 fallback 到 degree 最高的节点
    const books = this.cy.nodes('[id ^= "book-"]').not('.layer-parent');
    if (books.length > 0) {
      // 按书籍优先级排序：药二(y2) → 药综(y3) → 药一(y1) → 法规(y4)
      const BOOK_PRIORITY: Record<string, number> = { y2: 0, y3: 1, y1: 2, y4: 3 };
      const getBookPriority = (id: string) => {
        const m = id.match(/^book-y(\d)$/);
        return m ? (BOOK_PRIORITY[`y${m[1]}`] ?? 99) : 99;
      };
      const sorted = books.sort((a, b) => getBookPriority(a.id()) - getBookPriority(b.id()));
      return sorted[0].id();
    }
    const structures = this.cy.nodes('[fill = "cls-structure"]').not('.layer-parent')
      .filter((n) => !/^(sec|ch|subsec|part)-/.test(n.id()));
    if (structures.length > 0) {
      return structures[0].id();
    }
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
    const v = this.findSlider('maxdepth')?.range.valueAsNumber ?? 5;
    // 档位 5 = 全部（无限漫游）
    return v >= 5 ? -1 : v;
  }

  private findSlider(which: 'interval' | 'maxdepth'): SliderBind | undefined {
    // 优先通过 data 属性查找（如果有的话）
    const byData = this.sliders.find((s) => s.range.dataset['tourSlider'] === which);
    if (byData) return byData;
    
    // 回退：通过滑块 ID 查找
    const idMap: Record<string, string[]> = {
      interval: ['tour-interval', 'tour-interval-mob2', 'tour-interval-dt', 'tour-interval-dt2'],
      maxdepth: ['tour-maxdepth', 'tour-maxdepth-mob2', 'tour-maxdepth-dt', 'tour-maxdepth-dt2'],
    };
    const ids = idMap[which] ?? [];
    return this.sliders.find((s) => ids.includes(s.range.id));
  }

  /** Set the tour strategy. If currently running, restart with the new strategy. */
  setStrategy(next: TourStrategy): void {
    uiState.tour.strategy = next;
    // Sync both desktop selects
    for (const id of ['tour-strategy-select-dt', 'tour-strategy-select-dt2']) {
      const sel = document.getElementById(id) as HTMLSelectElement | null;
      if (sel) sel.value = next;
    }
    this.syncMobileStrategyLabel(next);
    // Flash all strategy controls
    for (const id of ['tour-strategy-select-dt', 'tour-strategy-select-dt2',
                       'tour-strategy-toggle-mob', 'tour-strategy-toggle-mob2']) {
      this.flashStrategyButton(document.getElementById(id));
    }
    // 策略切换后，序列定义变了 → 进度条必须重置为 0%（即使 idle 状态）
    this.resetProgress();
    if (this.running || this.paused) this.start();
  }

  /** Mobile compact-button shortcut: cycle between the two strategies. */
  toggleStrategy(): void {
    const next: TourStrategy = (uiState.tour.strategy === 'has-dfs' ? 'topo-prereq' : 'has-dfs') as TourStrategy;
    this.setStrategy(next);
  }

  // ── DOM binding ────────────────────────────────────────────────────────────

  private bindActions(): void {
    // Action delegation — every control carries data-tour-action.
    document.addEventListener('click', this._boundClick = (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-tour-action]');
      if (!target) return;
      const action = target.dataset['tourAction'];
      switch (action) {
        case 'start':       this.start();       break;
        case 'toggle':      this.toggle();      break;
        case 'toggle-pause': this.togglePause(); break;
        case 'stop':        this.stop();        break;
        case 'prev':        this.prev();        break;
        case 'next':        this.next();        break;
        case 'toggle-strategy': this.toggleStrategy(); break;
        case 'toggle-speech':   speechController.toggle(); break;
      }
    });

    // Keyboard shortcuts for the active tour. Bound on document so the
    // shortcut works regardless of where focus lives, with the standard
    // "skip if the user is typing" guard.
    document.addEventListener('keydown', this._boundKeydown = (e) => this.onTourKey(e));
  }

  /** Tear down the controller: remove document listeners and stop the tour.
   *  Idempotent and safe to call multiple times. Call this on page
   *  unmount / route change to avoid leaking document-level listeners. */
  dispose(): void {
    if (this._mounted && this._boundClick) {
      document.removeEventListener('click', this._boundClick);
    }
    if (this._boundKeydown) {
      document.removeEventListener('keydown', this._boundKeydown);
    }
    this.stop();
    this._mounted = false;
    this._boundClick = null;
    this._boundKeydown = null;
  }

  /**
   * Tour keyboard shortcuts:
   *   Space       → toggle pause/resume (only while a tour is running)
   *   ArrowUp     → previous step (only while running)
   *   ArrowDown   → next step     (only while running)
   * Ignored when focus is in an editable element so search inputs / sliders
   * (which already use Space) are not hijacked.
   */
  private onTourKey(e: KeyboardEvent): void {
    if (!this.running && !this.paused) return;
    const t = e.target as HTMLElement | null;
    if (t && this.isEditable(t)) return;

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      this.togglePause();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.prev();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.next();
      return;
    }
  }

  private isEditable(el: HTMLElement): boolean {
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return false;
  }

  private bindSliders(): void {
    // Desktop sliders (top + bottom) act as mirrors for all mobile sliders
    const desktopInterval = document.getElementById('tour-interval-dt') as HTMLInputElement | null;
    const desktopDepth    = document.getElementById('tour-maxdepth-dt')  as HTMLInputElement | null;
    const desktopInterval2 = document.getElementById('tour-interval-dt2') as HTMLInputElement | null;
    const desktopDepth2    = document.getElementById('tour-maxdepth-dt2')  as HTMLInputElement | null;

    // Bind ALL mobile interval sliders (there are two: top + bottom bars) to both desktop sliders
    for (const mobileInterval of [
      document.getElementById('tour-interval') as HTMLInputElement | null,
      document.getElementById('tour-interval-mob2') as HTMLInputElement | null,
    ].filter(Boolean) as HTMLInputElement[]) {
      this.sliders.push(this.bindSlider(
        mobileInterval, desktopInterval,
        document.getElementById(mobileInterval.id + '-fill'),
        document.getElementById(mobileInterval.id + '-val'),
        document.getElementById('tour-interval-val-dt'),
        (v) => Math.round(v / 1000) + 's',
        (v) => this.engine?.setInterval(v),
        [desktopInterval2].filter(Boolean) as HTMLInputElement[],
        [document.getElementById('tour-interval-val-dt2')],
      ));
      // 阻止 touchmove 冒泡，防止父容器（tour-mob__inner）把它当作滚动处理
      mobileInterval.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    }

    // Bind ALL mobile depth sliders
    for (const mobileDepth of [
      document.getElementById('tour-maxdepth') as HTMLInputElement | null,
      document.getElementById('tour-maxdepth-mob2') as HTMLInputElement | null,
    ].filter(Boolean) as HTMLInputElement[]) {
      // 移动端深度标签 ID 是 tour-depth-val，不是 mobileDepth.id + '-val'
      const mobileDepthValId = mobileDepth.id === 'tour-maxdepth' ? 'tour-depth-val' : 'tour-depth-val-mob2';
      this.sliders.push(this.bindSlider(
        mobileDepth, desktopDepth,
        document.getElementById(mobileDepth.id + '-fill'),
        document.getElementById(mobileDepthValId),
        document.getElementById('tour-depth-val-dt'),
        (v) => v >= 5 ? '\u221e' : TOUR_DEPTH_CONFIG.getLabel(v),
        (v) => {
          // 同时更新追踪状态和 DOM 滑块值，确保下次 start() 时使用正确的值
          this._pendingMaxDepth = v;
          // 同步更新 DOM 滑块
          const depthSlider = this.findSlider('maxdepth');
          if (depthSlider) {
            depthSlider.range.value = String(v);
            this.paintFill(depthSlider);
          }
          this.engine?.setMaxDepth(v);
        },
        [desktopDepth2].filter(Boolean) as HTMLInputElement[],
        [document.getElementById('tour-depth-val-dt2')],
      ));
      mobileDepth.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    }

    // 节点进度条：移动 + 桌面镜像绑定（详见 bindProgress 注释）
    this.bindProgress();

    // Initial paint so the fill heights and background gradients match defaults.
    for (const s of this.sliders) this.paintFill(s);
  }

  /** 节点进度条 input 的 change 监听 → 反推 seqIdx → engine.jumpToNode
   *  - 镜像（移动 <-> 桌面）双向同步
   *  - Idle 时 listener 不响应（CSS pointer-events: none 已禁掉事件，这里再做兜底）
   *  - 策略切换时由调用方负责把两个 input value 重置为 0 */
  private bindProgress(): void {
    const mob   = document.getElementById('tour-progress')    as HTMLInputElement | null;
    const dt    = document.getElementById('tour-progress-dt') as HTMLInputElement | null;
    if (!mob || !dt) return;

    const onChange = (src: HTMLInputElement, other: HTMLInputElement) => {
      // Idle 兜底：CSS 已经 pointer-events: none，但拖动可能在 release 时
      // 才触发 change 事件，所以这里再判一次
      if (!this.engine || !this.running) return;
      const total = this.engine.totalSteps();
      if (total <= 0) return;
      const pct = Math.max(0, Math.min(100, Number(src.value))) / 100;
      const seqIdx = Math.min(total - 1, Math.max(0, Math.round(pct * (total - 1))));
      // 同步镜像 value（保持视觉一致；不重写自己避免 input 事件循环）
      if (Number(other.value) !== src.valueAsNumber) other.value = src.value;
      // 调用引擎跳转
      this.engine.jumpToNode(seqIdx);
    };

    const onInput = (src: HTMLInputElement, other: HTMLInputElement) => {
      // 拖动时实时同步镜像 fill（仅同步 value，不触发跳转）
      if (Number(other.value) !== src.valueAsNumber) other.value = src.value;
      const fillMob = document.getElementById('tour-progress-fill');
      const fillDt  = document.getElementById('tour-progress-fill-dt');
      const scale = Math.max(0, Math.min(1, Number(src.value) / 100));
      if (fillMob) fillMob.style.transform = `scaleX(${scale})`;
      if (fillDt)  fillDt.style.transform  = `scaleX(${scale})`;
    };

    mob.addEventListener('input',  () => onInput(mob, dt));
    mob.addEventListener('change', () => onChange(mob, dt));
    dt.addEventListener('input',   () => onInput(dt, mob));
    dt.addEventListener('change',  () => onChange(dt, mob));
  }

  /** 策略切换后重置进度条为 0%（fill 缩到 0，value 清零，镜像同步）。
   *  由策略切换的处理逻辑调用。 */
  private resetProgress(): void {
    const mob = document.getElementById('tour-progress')    as HTMLInputElement | null;
    const dt  = document.getElementById('tour-progress-dt') as HTMLInputElement | null;
    const fillMob = document.getElementById('tour-progress-fill');
    const fillDt  = document.getElementById('tour-progress-fill-dt');
    if (mob) mob.value = '0';
    if (dt)  dt.value  = '0';
    if (fillMob) fillMob.style.transform = 'scaleX(0)';
    if (fillDt)  fillDt.style.transform  = 'scaleX(0)';
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
    extraMirrors?: HTMLInputElement[],
    extraMirrorLabels?: (HTMLElement | null)[],
  ): SliderBind {
    const bind: SliderBind = {
      range: primary,
      fill: primaryFill,
      value: primaryValueLabel,
      extraMirrors: extraMirrors ?? [],
      extraMirrorLabels: extraMirrorLabels ?? [],
      format,
      onCommit,
    };

    const applyInput = () => {
      const text = format(primary.valueAsNumber);
      if (primaryValueLabel) primaryValueLabel.textContent = text;
      if (mirrorValueLabel) mirrorValueLabel.textContent = text;
      for (let i = 0; i < (bind.extraMirrors?.length ?? 0); i++) {
        const em = bind.extraMirrors![i];
        const el = bind.extraMirrorLabels![i];
        if (em) em.value = primary.value;
        if (el)  el.textContent = text;
      }
      if (mirror) mirror.value = primary.value;
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

    for (const em of bind.extraMirrors ?? []) {
      em.addEventListener('input', () => {
        primary.value = em.value;
        applyInput();
      });
      em.addEventListener('change', () => onCommit(em.valueAsNumber));
    }

    return bind;
  }

  private paintFill(s: SliderBind): void {
    const min = Number(s.range.min), max = Number(s.range.max);
    const pct = ((s.range.valueAsNumber - min) / (max - min));
    if (s.fill) {
      // Vertical track (mobile) — 原生 <input type="range"> 的 thumb 圆心
      // 实际行程是 [thumbR, containerH - thumbR]（不是 [0, containerH]），
      // 直接用 pct 当 scaleY 会让 fill 顶端穿过 thumb 圆心。
      // 修正：把 pct 映射到 thumb 圆心的实际行程上，让 fill 顶端 = thumb 圆心。
      const container = s.fill.parentElement as HTMLElement | null;
      const trackLen = container?.clientHeight || 80;
      const thumbSize = 18;        // 必须与 ::-webkit-slider-thumb 的 width/height 一致
      const thumbR = thumbSize / 2;
      const travel = Math.max(0, trackLen - thumbSize);
      const centerFromBottom = thumbR + pct * travel;
      // 必须保留 translateX(-50%) 来维持 4px fill 在 32px container 中的居中，
      // 因为 CSS 已经不再用 left:0 定位了。
      s.fill.style.transform = `translateX(-50%) scaleY(${centerFromBottom / trackLen})`;
    } else {
      // Horizontal track (desktop) — paint gradient background on all mirrors
      const bg = `linear-gradient(to right, var(--tour-accent) 0%, var(--tour-accent) ${pct * 100}%, rgba(255,255,255,0.1) ${pct * 100}%, rgba(255,255,255,0.1) 100%)`;
      // Primary mirror (the original desktop slider)
      if (s.range.id.endsWith('-dt') || s.range.id.endsWith('-dt2')) {
        s.range.style.background = bg;
      }
    }
  }

  private bindStrategyToggle(): void {
    // Desktop <select> (top + bottom — both respond to changes)
    for (const sel of [
      document.getElementById('tour-strategy-select-dt') as HTMLSelectElement | null,
      document.getElementById('tour-strategy-select-dt2') as HTMLSelectElement | null,
    ].filter(Boolean) as HTMLSelectElement[]) {
      sel.addEventListener('change', () => this.setStrategy(sel.value as TourStrategy));
    }

    // Mobile compact buttons (top + bottom — both toggle between strategies)
    for (const mobBtn of [
      document.getElementById('tour-strategy-toggle-mob'),
      document.getElementById('tour-strategy-toggle-mob2'),
    ].filter(Boolean) as HTMLElement[]) {
      mobBtn.addEventListener('click', () => this.toggleStrategy());
    }
  }

  private syncMobileStrategyLabel(strategy: TourStrategy): void {
    const label = strategy === 'has-dfs' ? '教材' : '层级';
    for (const id of ['tour-strategy-value-mob', 'tour-strategy-value-mob2']) {
      const el = document.getElementById(id);
      if (el) el.textContent = label;
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
    // both the bar and its chevron. Issue #6: previously this also
    // mirrored into `uiState.tourBarCollapsed`, but nothing ever *read*
    // that field — it was a dead mirror. The toggle is now registered
    // with uiState (as a no-op for `tourBarCollapsed` since the field
    // has been removed) but the live value lives in the toggle alone.
    //
    // Issue #29: advertise as a collapse/expand toggle
    // (`aria-expanded` on the handle, not `aria-pressed`). The handle
    // is a `<div>` styled to look like a button; we add
    // `role="button"` + `tabindex="0"` + Enter/Space keyboard support
    // in HTML so screen-reader users land on it.
    this.barToggle = new UiToggle({
      persist: 'tourBar.collapsed',
      cssClass: 'collapsed',
      // Collapse-handle is a div styled as a button; aria-pressed would
      // suggest a sticky on/off toggle, but collapse semantics need
      // aria-expanded.
      ariaPressed: false,
      ariaExpanded: true,
      applyTo: (bar && chev ? [bar, chev as unknown as HTMLElement] : (bar ?? chev ?? handle)) as HTMLElement | HTMLElement[],
    });
    registerTourBarToggle(this.barToggle);
    handle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.barToggle.toggle();
    });
    // Issue #29: keyboard activation for the div-as-button handle.
    handle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.barToggle.toggle();
      }
    });
  }

  /** 监听节点选中/取消选中，动态显示/隐藏"从这里开始"提示 */
  private bindSelectionHint(): void {
    // 初始化时立即检查一次当前选中状态
    this.updateStartHint();

    // 监听 cytoscape 的 select/unselect 事件（highlightNode 会调用 node.select()）
    this.cy.on('select', 'node', () => { this.updateStartHint(); });
    this.cy.on('unselect', 'node', () => { this.updateStartHint(); });

    // 也监听 class 变化（某些操作可能只改 class）
    this.cy.on('class', 'node', () => {
      // 一旦检测到 selected-node 出现，下一次 updateStartHint 就会打诊断
      (window as unknown as { __tourDiag?: boolean }).__tourDiag = true;
      this.updateStartHint();
    });
  }

  /**
   * Public hook so the graph event layer can re-evaluate the start hint
   * after `highlightNode()` runs (which is the actual code path that adds
   * `.selected-node`). Cytoscape's `select`/`class` events aren't always
   * reliable in every browser when programmatic `node.select()` runs from
   * a `tap` handler, so we trigger the refresh explicitly.
   */
  public refreshStartHintFromHighlight(): void {
    this.updateStartHint();
  }

  // ── Engine callbacks ───────────────────────────────────────────────────────

  /**
   * Engine entered paused state (either via pause(), or implicitly because
   * prev()/next() backs off the auto-schedule). Sync controller flags and
   * flip the play/pause icon CSS so the toolbar button reflects reality —
   * previously the controller's `paused` flag stayed `false` here because
   * prev/next only flipped the engine's internal `paused`, leaving the
   * play/pause icon out of sync.
   */
  private onEnginePause(): void {
    this.paused = true;
    this.running = true;
    this.setRunningUI();
  }

  private onEngineResume(): void {
    this.paused = false;
    this.running = true;
    this.setRunningUI();
  }

  private onStep(info: TourStepInfo): void {
    if (!this.cy) return;
    const loc = this.cy.getElementById(info.nodeId).data('location') as Record<string, string> | null;
    const key = loc ? getLocationKey(this.cy.getElementById(info.nodeId) as cytoscape.NodeSingular) : '(no location)';
    this.running = true;
    this.paused = false;
    // Push to history
    const ph = uiState.tour.pathHistory;
    const prev = info.path.slice(0, -1);
    if (prev.length > 0) ph.push(prev[prev.length - 1], info.nodeId);
    else                 ph.push(info.nodeId);

    // 节点 badge = 已访问节点 / 档位总节点（X/Y 格式）
    const nodeBadge = `${info.currentStep}/${info.totalToExplore}`;
    this.setText('tour-cycle-num',         String(info.cycleCount + 1));
    // Desktop bars
    this.setText('tour-cycle-num-dt',       String(info.cycleCount + 1));
    this.setText('tour-dt-node-name',       this.labelOf(info.nodeId) || info.nodeId);
    // 朗读当前节点名（用户开启后每步自动读）
    speechController.speak(this.labelOf(info.nodeId) || info.nodeId);
    // 进度：current step / total steps in the sequence
    const total = this.engine?.totalSteps() ?? info.totalToExplore;
    const step  = this.engine?.currentStepIndex() ?? info.currentStep;
    this.renderTimeline(step, total);
  }

  /**
   * Update the per-step counter "N / M". The old purple progress bar + marker
   * were removed (issue #?): the fill element routinely outgrew the desktop
   * bar width and read as visual noise. The compact text "current / total"
   * is enough to convey progress.
   */
  private renderTimeline(current: number, total: number): void {
    if (total <= 0) return;
    // 节点显示 X / Y：桌面端横排，移动端用上下两行的分数形式
    const text = `${current} / ${total}`;
    this.setText('tour-progress-label-dt',  text);
    this.setText('tour-count-badge-num',   String(current));
    this.setText('tour-count-badge-den',   String(total));
    // 桌面端"步" = 当前步数（纯数字）
    this.setText('tour-step-badge-dt',      String(current));
    this.setText('tour-step-badge-mob',     String(current));
    // 进度条 fill：scaleX(0~1)
    const pct = Math.max(0, Math.min(1, current / total));
    this.setProgressFill('tour-progress-fill',    pct);
    this.setProgressFill('tour-progress-fill-dt', pct);
    // 进度条 range value：0-100，由 change 监听反推 seqIdx
    const rangeVal = Math.round(pct * 100);
    this.setProgressRange('tour-progress',    rangeVal);
    this.setProgressRange('tour-progress-dt', rangeVal);
  }

  /** Step 2: 直接写 fill 的 scaleX（与 paintFill 一致的纯几何同步，无 input 耦合） */
  private setProgressFill(id: string, pct: number): void {
    const el = document.getElementById(id);
    if (el) el.style.transform = `scaleX(${pct})`;
  }

  private setProgressRange(id: string, value: number): void {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    // 避免触发 input 事件造成循环
    if (Number(el.value) !== value) el.value = String(value);
  }

  private onComplete(
    info: { reason: 'depth-reached' | 'no-more-restarts' | 'no-root'; maxAttempts: number } | 'depth-reached' | 'no-more-restarts' | 'no-root',
  ): void {
    this.running = false;
    this.paused = false;
    // Accept both the new TourCompleteInfo object and the legacy string
    // (tests drive the callback directly via the private field).
    const isString = typeof info === 'string';
    const reason: 'depth-reached' | 'no-more-restarts' | 'no-root' = isString ? info : info.reason;
    // Legacy tests pass a string; the engine always passes TourCompleteInfo.
    const maxAttempts: number = isString ? 3 : info.maxAttempts;
    const exhausted = reason === 'no-more-restarts';
    const badge = exhausted ? '⏹' : '\u2713';
    const nameLabel = exhausted ? '已停止' : '完成';

    this.setText('tour-count-badge-num',   '—');
    this.setText('tour-count-badge-den',   '—');
    this.setText('tour-dt-node-name',      nameLabel);
    // The progress label was previously hardcoded to '完成' regardless of
    // completion reason, which broke the test that asserts all count
    // badges reset to '—'. Match it to the same dash convention.
    this.setText('tour-progress-label-dt',  '—');
    this.setText('tour-step-badge-dt',     '—');
    this.setText('tour-step-badge-mob',    '—');

    // If the tour exhausted itself, surface a title so the bar reads
    // "已停止 · 已试 N 轮" instead of just "已停止". Use the engine's
    // reported maxAttempts — never hardcode the cap here.
    if (exhausted) {
      const label = `已停止 · 已试 ${maxAttempts} 轮`;
      this.setText('tour-dt-node-name',   label);
      this.setText('tour-dt-node-name2', label);
    }

    // Issue #29: announce terminal tour state to screen readers. This
    // is the only tour event that should reach AT — per-step updates
    // would be too noisy.
    this.announceStatus(
      exhausted
        ? `漫游已停止 · 已试 ${maxAttempts} 轮`
        : '漫游已完成',
    );

    this.setIdleUI();
  }

  /** Issue #29: write to the `#tour-status-announcer` live region. */
  private announceStatus(msg: string): void {
    const el = document.getElementById('tour-status-announcer');
    if (!el) return;
    el.textContent = '';
    el.textContent = msg;
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
    this.updateStartHint();
  }

  /** idle + 选中非父层节点 → 显示"从这里开始"提示 */
  private updateStartHint(): void {
    // 注意：选中节点用 .selected-node class（不是 .node-selected，也不是 cytoscape 的 :selected）
    const isIdle = !this.running && !this.paused;
    const hasSelection = this.cy.nodes('.selected-node').not('.layer-parent').length > 0;
    const show = isIdle && hasSelection;
    const hintDt = document.getElementById('tour-start-hint-dt');
    const hintMob = document.getElementById('tour-start-hint');
    hintDt?.classList.toggle('show', show);
    hintMob?.classList.toggle('show', show);
  }

  private setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  private labelOf(nodeId: string): string {
    const node = this.cy.getElementById(nodeId);
    return node.empty() ? nodeId : (node.data('label') || nodeId);
  }
}

// Re-exported SEARCH_INPUT_DEBOUNCE_MS kept here for proximity to related tour state.
export { SEARCH_INPUT_DEBOUNCE_MS };
