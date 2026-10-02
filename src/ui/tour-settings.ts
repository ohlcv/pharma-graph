// src/ui/tour-settings.ts
// Wires the "漫游设置" sub-accordion inside the advanced-settings panel.
// 原 speech-settings.ts,2026-10-02 改名扩域：折叠块改名"漫游设置"以容纳
// 即将加入的"遍历顺序"控件。原模块仍管朗读相关粒度/速率/停顿/等待。
//
// Responsibilities:
//   1. Mobile bottom-sheet collapse/expand (`.bs-tour-setting`) — mirrors
//      the layout-params sheet pattern but lives in its own module so the
//      layout module can stay focused.
//   2. Granularity segmented control: 4 buttons, one per SpeechGranularity.
//      Active state is synced from the controller on mount and pushed back
//      to it on click. The controller already persists the choice to
//      localStorage; this module only mirrors it into the DOM.
//   3. Rate slider (0.5x–2.0x, persisted under SPEECH_RATE_KEY).
//   4. "等读完再跳转" switch (boolean, persisted under SPEECH_WAIT_KEY).
//   5. Post-speech pause slider (0–2000ms in 100ms steps, persisted under
//      SPEECH_POST_DELAY_KEY).
//
// All five controls have parallel desktop (sidebar) + mobile (bottom-sheet)
// DOMs. We bind each one twice with shared state, mirroring the value on
// every change so either UI can drive the other.
//
// Why a separate file (not folded into speech.ts): speech.ts owns the TTS
// engine and its persistence. UI bindings belong next to other UI binding
// modules (initSearchUI, initMusicPlayer, …). Keeping this file small keeps
// speech.ts single-purpose.

import {
  speechController,
  SpeechGranularityOptions,
  type SpeechGranularity,
  SPEECH_RATE_DEFAULT,
  SPEECH_RATE_MIN,
  SPEECH_RATE_MAX,
  SPEECH_POST_DELAY_MIN,
  SPEECH_POST_DELAY_MAX,
  SPEECH_POST_DELAY_STEP,
} from './speech.js';
import { registerAction } from './action-dispatcher.js';

/** Storage key for the mobile-sheet "漫游设置" sub-accordion open state.
 *  Lives here (not in layout-store) because it's not layout-related — speech
 *  module owns the persistence of its own UI prefs. */
const BS_TOUR_SETTING_OPEN_KEY = 'pg:tour:bsSettingOpen';

/** Listener set invoked whenever the user changes a speech setting.
 *  Used by tour-controller to push the new values into the running
 *  TourEngine (so a "wait for speech" toggle mid-tour takes effect on
 *  the current step, not just the next one). */
type SpeechSettingsChangeListener = (kind: SpeechSettingsKind, value: unknown) => void;
const changeListeners: Set<SpeechSettingsChangeListener> = new Set();

export type SpeechSettingsKind = 'rate' | 'waitForSpeech' | 'postSpeechDelayMs';

export function registerSpeechSettingsChange(fn: SpeechSettingsChangeListener): () => void {
  changeListeners.add(fn);
  return () => {
    changeListeners.delete(fn);
  };
}

function fireChange(kind: SpeechSettingsKind, value: unknown): void {
  for (const l of changeListeners) {
    try {
      l(kind, value);
    } catch {
      /* defensive: a listener error must not break the UI binding */
    }
  }
}

function loadBsTourSettingOpen(): boolean {
  try {
    return localStorage.getItem(BS_TOUR_SETTING_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function saveBsTourSettingOpen(open: boolean): void {
  try {
    localStorage.setItem(BS_TOUR_SETTING_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function applyBsTourSettingOpen(open: boolean): void {
  const block = document.getElementById('bs-tour-setting');
  const head = document.getElementById('bs-tour-setting-toggle');
  if (!block) return;
  block.classList.toggle('collapsed', !open);
  block.classList.toggle('open', open);
  head?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/** Toggle handler — registered with the global action dispatcher so the
 *  button in index.html can use `data-action="toggle-bs-tour-setting"`. */
function toggleBsTourSetting(): void {
  const block = document.getElementById('bs-tour-setting');
  if (!block) return;
  const willOpen = block.classList.contains('collapsed');
  applyBsTourSettingOpen(willOpen);
  saveBsTourSettingOpen(willOpen);
}

/** Sync the visible `active` class on all granularity buttons (both sidebar
 *  `.seg-btn` and mobile `.bs-speech-btn`) to the controller's current value.
 *  Called on mount and after every `setGranularity` click. */
function syncGranularityButtons(granularity: SpeechGranularity): void {
  document.querySelectorAll<HTMLButtonElement>('[data-speech-granularity]').forEach((btn) => {
    const active = btn.dataset['speechGranularity'] === granularity;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

/** Bind click handlers to every granularity button in the document.
 *  Both sidebar and mobile sheet share the same data attribute, so one
 *  listener tree covers all of them. */
function bindGranularityButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-speech-granularity]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = btn.dataset['speechGranularity'] as SpeechGranularity | undefined;
      if (!g || !SpeechGranularityOptions.includes(g)) return;
      speechController.setGranularity(g);
      syncGranularityButtons(g);
    });
  });
}

/** Format the rate for display: "1.0x" (one decimal place, always). */
function formatRate(v: number): string {
  return `${v.toFixed(1)}x`;
}

/** Format the post-speech delay for display: "0ms" / "500ms" / "1500ms". */
function formatPostDelay(v: number): string {
  return `${v}ms`;
}

/** Format the wait-for-speech toggle's right-side label. */
function formatWaitLabel(wait: boolean): string {
  return wait ? '开启' : '关闭';
}

/** Bind a single slider across its desktop + mobile DOM copies.
 *  Either side may be absent (e.g. mobile-only deploy); the function is
 *  robust to missing nodes. */
function bindSlider(opts: {
  primaryId: string;
  mirrorId: string | null;
  primaryValueId: string;
  mirrorValueId: string | null;
  format: (v: number) => string;
  clamp: (v: number) => number;
  onCommit: (v: number) => void;
}): void {
  const primary = document.getElementById(opts.primaryId) as HTMLInputElement | null;
  if (!primary) return;
  const mirror = opts.mirrorId
    ? (document.getElementById(opts.mirrorId) as HTMLInputElement | null)
    : null;
  const primaryVal = document.getElementById(opts.primaryValueId);
  const mirrorVal = opts.mirrorValueId ? document.getElementById(opts.mirrorValueId) : null;

  const sync = (raw: number): void => {
    const v = opts.clamp(raw);
    const text = opts.format(v);
    if (primaryVal) primaryVal.textContent = text;
    if (mirrorVal) mirrorVal.textContent = text;
    if (mirror && Number(mirror.value) !== v) mirror.value = String(v);
  };

  // Mount: render the persisted value into both labels.
  sync(Number(primary.value));

  const onInput = (): void => {
    const v = opts.clamp(Number(primary.value));
    if (primaryVal) primaryVal.textContent = opts.format(v);
    if (mirrorVal) mirrorVal.textContent = opts.format(v);
    if (mirror && Number(mirror.value) !== v) mirror.value = String(v);
  };
  const onCommit = (): void => {
    const v = opts.clamp(Number(primary.value));
    opts.onCommit(v);
  };
  primary.addEventListener('input', onInput);
  primary.addEventListener('change', onCommit);
  if (mirror) {
    mirror.addEventListener('input', () => {
      const v = opts.clamp(Number(mirror.value));
      if (primary && Number(primary.value) !== v) primary.value = String(v);
      if (primaryVal) primaryVal.textContent = opts.format(v);
      if (mirrorVal) mirrorVal.textContent = opts.format(v);
    });
    mirror.addEventListener('change', () => {
      opts.onCommit(opts.clamp(Number(mirror.value)));
    });
  }
}

/** Bind the "等读完再跳转" toggle across both desktop + mobile DOMs.
 *  `data-speech-wait` carries the "true" value; aria-pressed is the live state. */
function bindWaitToggle(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-speech-wait]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('aria-pressed') !== 'true';
      applyWaitToggle(next);
      speechController.setWaitForSpeech(next);
      fireChange('waitForSpeech', next);
    });
  });
}

function applyWaitToggle(wait: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('[data-speech-wait]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(wait));
    btn.classList.toggle('active', wait);
    // Update the mobile row's value label too (sidebar row uses .param-label__hint).
    const isMobile = btn.id === 'bs-speech-wait';
    if (isMobile) {
      const label = document.getElementById('bs-speech-wait-val');
      if (label) label.textContent = formatWaitLabel(wait);
    }
  });
}

function syncRateFromController(): void {
  const r = speechController.currentRate;
  const primary = document.getElementById('bs-speech-rate') as HTMLInputElement | null;
  const mirror = document.getElementById('speech-rate') as HTMLInputElement | null;
  if (primary) primary.value = String(r);
  if (mirror) mirror.value = String(r);
  const text = formatRate(r);
  const primLabel = document.getElementById('bs-speech-rate-val');
  const mirrLabel = document.getElementById('speech-rate-val');
  if (primLabel) primLabel.textContent = text;
  if (mirrLabel) mirrLabel.textContent = text;
}

function syncPostDelayFromController(): void {
  const v = speechController.currentPostSpeechDelayMs;
  const primary = document.getElementById('bs-speech-postdelay') as HTMLInputElement | null;
  const mirror = document.getElementById('speech-postdelay') as HTMLInputElement | null;
  if (primary) primary.value = String(v);
  if (mirror) mirror.value = String(v);
  const text = formatPostDelay(v);
  const primLabel = document.getElementById('bs-speech-postdelay-val');
  const mirrLabel = document.getElementById('speech-postdelay-val');
  if (primLabel) primLabel.textContent = text;
  if (mirrLabel) mirrLabel.textContent = text;
}

function clampRate(v: number): number {
  if (!Number.isFinite(v)) return SPEECH_RATE_DEFAULT;
  return Math.max(SPEECH_RATE_MIN, Math.min(SPEECH_RATE_MAX, v));
}

function clampPostDelay(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const snapped = Math.round(v / SPEECH_POST_DELAY_STEP) * SPEECH_POST_DELAY_STEP;
  return Math.max(SPEECH_POST_DELAY_MIN, Math.min(SPEECH_POST_DELAY_MAX, snapped));
}

/** Mount the tour-settings UI. Safe to call once at boot.
 *  Idempotent: re-running rebinds the same listeners (acceptable; only
 *  called from boot()). */
export function initTourSettings(): void {
  registerAction('toggle-bs-tour-setting', () => toggleBsTourSetting());
  bindGranularityButtons();
  syncGranularityButtons(speechController.currentGranularity);
  // Restore the bottom-sheet sub-accordion's previous open/closed state.
  applyBsTourSettingOpen(loadBsTourSettingOpen());

  // "等读完再跳转" — primary id is the mobile one (#bs-speech-wait), the
  // desktop mirror uses the same data attribute and gets picked up by the
  // same querySelectorAll loop in bindWaitToggle().
  applyWaitToggle(speechController.currentWaitForSpeech);
  bindWaitToggle();

  // Rate slider: mobile id first (#bs-speech-rate), desktop mirror (#speech-rate).
  bindSlider({
    primaryId: 'bs-speech-rate',
    mirrorId: 'speech-rate',
    primaryValueId: 'bs-speech-rate-val',
    mirrorValueId: 'speech-rate-val',
    format: formatRate,
    clamp: clampRate,
    onCommit: (v) => {
      speechController.setRate(v);
      fireChange('rate', v);
    },
  });

  // Post-speech delay slider.
  bindSlider({
    primaryId: 'bs-speech-postdelay',
    mirrorId: 'speech-postdelay',
    primaryValueId: 'bs-speech-postdelay-val',
    mirrorValueId: 'speech-postdelay-val',
    format: formatPostDelay,
    clamp: clampPostDelay,
    onCommit: (v) => {
      speechController.setPostSpeechDelayMs(v);
      fireChange('postSpeechDelayMs', v);
    },
  });

  // Initial mirror so the labels show the persisted value (mount-time
  // DOM has the default literal).
  syncRateFromController();
  syncPostDelayFromController();
}