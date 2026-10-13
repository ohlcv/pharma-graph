// src/ui/speech.ts
// Web Speech API (TTS) controller for reading node labels during tour.
//
// Design decisions:
// - Singleton: one global speech controller, reused across all tours.
// - Speaks immediately on the current node label; no buffering or queue.
// - Auto-cancels previous utterance before starting a new one — prevents
//   overlapping voices from rapid step transitions.
// - Voice selection: prefers zh-CN voices, falls back to any available voice.
// - iOS Safari: first speechSynthesis.speak() must be a user gesture AND must
//   use a real (even zero-volume) utterance. Fix: prime the engine with a
//   single-space utterance in the toggle() handler (deferred via microtask if
//   voices are still loading so iOS does not silently drop the unlock
//   utterance).
// - Rate: user-controllable via the 朗读设置 panel (0.5x–2.0x, default
//   1.3x). Was hardcoded to 1.25 historically.
// - State is NOT persisted — TTS is off by default on every page load.
// - Read-aloud field selection IS persisted under one key — the user picks
//   which parts of a node to read (标题/关联/标签/摘要, any combination);
//   survives reloads.
//
// Two layers of degradation, because one probe isn't enough:
//
//   1. STRUCTURAL probe (probeSpeechApi, at construction time) — catches
//      WebViews that don't even expose a working `speechSynthesis` object
//      (missing methods, throwing constructor). Fast, synchronous, cheap.
//
//   2. LIVE probe (speak() + scheduleSilentCheck) — catches the sneakier
//      case: WebViews (notably Android 夸克/Quark, UC, WeChat X5/TBS) whose
//      `speechSynthesis` passes the structural probe — every method exists,
//      nothing throws — but the engine silently swallows every utterance:
//      no audio, and critically, no `start`/`end`/`error` events either.
//      The structural probe alone can't see this; it only shows up once we
//      actually call speak() and wait to see if *anything* happens.
//
//      Three hard-won constraints on this live probe, learned from a real
//      regression against iOS Safari:
//
//        a) The timeout must be generous. iOS Safari can legitimately take
//           several seconds to fire its first `start` event — especially
//           right after the tab returns from background, or on a cold
//           voice load for zh-CN — so a short timeout produces false
//           positives on a browser that was never actually broken.
//
//        b) A "probably silent" verdict must NEVER cancel the in-flight
//           utterance. Calling `cancel()` on a guess is a self-fulfilling
//           prophecy: if the engine was just slow rather than mute, the
//           cancel kills the one utterance that would have proven it
//           alive. The live probe only stops *future* speak() calls and
//           flips the UI off — it never reaches back and silences a
//           genuinely in-flight utterance. It DOES release any tour step
//           waiting on that utterance (fireEnd), so a mute engine can't
//           wedge the tour now that the speech wait has no absolute
//           timeout — releasing a waiter never touches the audio itself.
//
//        c) The detector is armed once per "unknown" phase, not re-armed
//           on every speak() call. If it re-armed every time, a tour
//           stepping faster than the timeout would perpetually reset the
//           clock and the detector would never get a chance to complete —
//           exactly backwards from what we want against a truly silent
//           engine (which never sends a wake-up event to cancel the
//           detector anyway).

import { uiState } from './state.js';
import { showToast } from './ui-helpers.js';

type Voice = SpeechSynthesisVoice | null;

/**
 * Read-aloud field: one independent piece of a node that can be toggled on
 * or off. The user picks any combination in the 漫游设置 panel; the spoken
 * text concatenates the selected fields in SPEECH_FIELD_ORDER.
 */
export type SpeechField =
  /** Node label (标题). */
  | 'label'
  /** Source location path (位置: 书/部/章/节/小节). */
  | 'location'
  /** Outgoing edge reasons (关联). */
  | 'edges'
  /** Node tags (标签). */
  | 'tags'
  /** Full summary text (摘要). */
  | 'summary'
  /** Full body markdown text (正文,「文」页签). */
  | 'body';

/** A selected combination of read-aloud fields. */
export type SpeechFields = readonly SpeechField[];

export const SpeechFieldOptions: ReadonlyArray<SpeechField> = [
  'label',
  'location',
  'edges',
  'tags',
  'summary',
  'body',
] as const;

/** Canonical concatenation order — makes the utterance independent of the
 *  order in which the user toggled the fields on. */
export const SPEECH_FIELD_ORDER: ReadonlyArray<SpeechField> = SpeechFieldOptions;

/** Human label shown on each multi-select chip. */
export const SpeechFieldLabels: Record<SpeechField, string> = {
  label: '标题',
  location: '位置',
  edges: '关联',
  tags: '标签',
  summary: '摘要',
  body: '正文',
};

/** Single localStorage key holding the selected read-aloud field
 *  combination. Value format: fields joined by '+' (e.g. 'label+edges+tags').
 *  Legacy single-select preset values are migrated on read. The literal is
 *  unchanged so existing users keep their preference. */
export const SPEECH_FIELDS_KEY = 'pg:speech:granularity';

/** Single localStorage key holding the chosen read-aloud rate (0.5–2.0). */
export const SPEECH_RATE_KEY = 'pg:speech:rate';

/** Single localStorage key holding the "wait for speech to finish before advancing" toggle. */
export const SPEECH_WAIT_KEY = 'pg:speech:waitForSpeech';

/** Single localStorage key holding the post-speech pause (ms; 0–2000). */
export const SPEECH_POST_DELAY_KEY = 'pg:speech:postDelay';

export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2.0;
export const SPEECH_RATE_DEFAULT = 1.3;
export const SPEECH_POST_DELAY_MIN = 0;
export const SPEECH_POST_DELAY_MAX = 2000;
export const SPEECH_POST_DELAY_STEP = 100;
export const SPEECH_POST_DELAY_DEFAULT = 1000;

function loadRate(): number {
  try {
    const raw = localStorage.getItem(SPEECH_RATE_KEY);
    if (!raw) return SPEECH_RATE_DEFAULT;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= SPEECH_RATE_MIN && n <= SPEECH_RATE_MAX) {
      return n;
    }
  } catch {
    /* ignore */
  }
  return SPEECH_RATE_DEFAULT;
}

function saveRate(r: number): void {
  try {
    localStorage.setItem(SPEECH_RATE_KEY, String(r));
  } catch {
    /* ignore */
  }
}

function loadWaitForSpeech(): boolean {
  try {
    const raw = localStorage.getItem(SPEECH_WAIT_KEY);
    if (raw === null) return true;
    return raw === '1';
  } catch {
    /* ignore */
  }
  return true;
}

function saveWaitForSpeech(wait: boolean): void {
  try {
    localStorage.setItem(SPEECH_WAIT_KEY, wait ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function loadPostDelay(): number {
  try {
    const raw = localStorage.getItem(SPEECH_POST_DELAY_KEY);
    if (!raw) return SPEECH_POST_DELAY_DEFAULT;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= SPEECH_POST_DELAY_MIN && n <= SPEECH_POST_DELAY_MAX) {
      return Math.round(n / SPEECH_POST_DELAY_STEP) * SPEECH_POST_DELAY_STEP;
    }
  } catch {
    /* ignore */
  }
  return SPEECH_POST_DELAY_DEFAULT;
}

function savePostDelay(ms: number): void {
  try {
    localStorage.setItem(SPEECH_POST_DELAY_KEY, String(ms));
  } catch {
    /* ignore */
  }
}

/** Default combination: 标题 + 关联. */
const SPEECH_FIELDS_DEFAULT: SpeechFields = ['label', 'edges'];

/** Legacy single-select presets → the field combination each one stood for,
 *  so a user who saved a preset before the multi-select migration keeps the
 *  same read-aloud output. */
const LEGACY_GRANULARITY_MAP: Record<string, SpeechFields> = {
  label: ['label'],
  'label-edges': ['label', 'edges'],
  'label-edges-tags': ['label', 'edges', 'tags'],
  'label-full-summary': ['label', 'summary'],
};

/** Dedupe a field array and order it into canonical SPEECH_FIELD_ORDER. */
function canonicalizeSpeechFields(fields: SpeechFields): SpeechFields {
  const set = new Set(fields);
  return SPEECH_FIELD_ORDER.filter((f) => set.has(f));
}

/**
 * Parse a persisted granularity value into a field set. Pure (no storage
 * access) so it can be unit-tested directly.
 *
 * Format detection:
 *   - contains '+' → new multi-select format (`label+edges+tags`). Every
 *     token must be valid; one bad token rejects the WHOLE value (no
 *     half-trusted partial parse) and falls back to the default.
 *   - otherwise → legacy single-select preset, mapped via
 *     LEGACY_GRANULARITY_MAP.
 *   - missing / unrecognised → default.
 *
 * Always returns a non-empty set in canonical order.
 */
export function parseSpeechFields(raw: string | null | undefined): SpeechFields {
  if (raw && raw.includes('+')) {
    const tokens = raw.split('+');
    const allValid = tokens.every((t) => (SpeechFieldOptions as readonly string[]).includes(t));
    if (allValid && tokens.length > 0) {
      return canonicalizeSpeechFields(tokens as SpeechField[]);
    }
    return SPEECH_FIELDS_DEFAULT;
  }
  const legacy = raw ? LEGACY_GRANULARITY_MAP[raw] : undefined;
  if (legacy) return canonicalizeSpeechFields(legacy);
  return SPEECH_FIELDS_DEFAULT;
}

function loadSpeechFields(): SpeechFields {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SPEECH_FIELDS_KEY);
  } catch {
    /* ignore */
  }
  return parseSpeechFields(raw);
}

function saveSpeechFields(fields: SpeechFields): void {
  try {
    localStorage.setItem(SPEECH_FIELDS_KEY, fields.join('+'));
  } catch {
    /* ignore */
  }
}

/** Resolve `speechSynthesis` from whatever host object we're running under.
 *  In real browsers this is on `window`; in Node/jsdom test envs we may
 *  install it on `globalThis` instead. */
function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof speechSynthesis !== 'undefined') return speechSynthesis;
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as { speechSynthesis?: SpeechSynthesis };
    if (g.speechSynthesis) return g.speechSynthesis;
  }
  return null;
}

/**
 * How long we wait, from the FIRST speak() call while state is still
 * 'unknown', for ANY event (`start`/`boundary`/`end`/`error`) — from that
 * utterance or any that superseded it — before concluding the engine is a
 * silent stub.
 *
 * 5s is deliberately generous. It's long enough to comfortably cover iOS
 * Safari's worst-case cold-start latency (observed up to ~2-3s in the wild),
 * while still being short enough that a genuinely mute WebView (Quark/UC/
 * WeChat X5) gets caught and disabled within a few tour steps rather than
 * silently failing for the whole session.
 */
const SILENT_ENGINE_TIMEOUT_MS = 5000;

class SpeechController {
  private active = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  /** True once the voice list is non-empty (immediate or after voiceschanged). */
  private voicesReady = false;
  /** iOS Safari: speech engine must be unlocked once per page session. */
  private unlocked = false;
  /**
   * False when the structural probe fails outright (missing methods /
   * throwing constructor). This does NOT catch "silent but well-formed"
   * engines — see `engineState` for that.
   *
   * NOTE: We do NOT disable the toggle button when this is false. The button
   * stays clickable so users can still toggle the active state (the visual
   * `active` highlight works regardless of audio). Disabling caused more
   * problems than it solved — see git log for context.
   */
  private supported = false;
  /**
   * Runtime verdict from actually calling speak(), refined over time:
   *   - 'unknown'  — haven't gotten a real event back yet, can't tell
   *   - 'verified' — at least one speak() produced start/end/error: the
   *                  engine is alive (even if a given utterance errored)
   *   - 'silent'   — no speak() call produced any event within the
   *                  detection window; engine is judged a mute stub and
   *                  TTS has been auto-disabled for future utterances
   *                  (any utterance already in flight is left alone —
   *                  see the file-level comment on why we never cancel
   *                  on a guess)
   */
  private engineState: 'unknown' | 'verified' | 'silent' = 'unknown';
  private silentCheckTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cached speechSynthesis reference; null when unsupported. */
  private readonly synth: SpeechSynthesis | null;
  /**
   * 已知对 Web Speech API 支持残缺的内核/浏览器名（夸克 U4、UC、微信 X5/TBS
   * 等）。检测到时，toast 与按钮 title 会把"推荐用 Chrome/Safari 打开"的文案
   * 降级为指名道姓的提示，让用户少猜到底是哪个浏览器在作怪。iOS 上所有浏览器
   * 都被强制使用 WebKit，引擎是完好的，因此 iOS 一律返回 null（用泛化文案）。
   */
  private readonly unsupportedBrowserHint: string | null;
  /** Current read-aloud fields (persisted under SPEECH_FIELDS_KEY). */
  private fields: SpeechFields = loadSpeechFields();
  /** Current utterance rate (persisted under SPEECH_RATE_KEY). */
  private rate: number = loadRate();
  /**
   * Whether the tour engine should wait for the current utterance to end
   * before advancing. Persisted under SPEECH_WAIT_KEY. Default true: the
   * reason for the toggle to exist is so users can opt OUT, not opt in.
   */
  private waitForSpeech: boolean = loadWaitForSpeech();
  /**
   * Extra pause (ms) inserted after an utterance ends before the next step
   * can fire. Persisted under SPEECH_POST_DELAY_KEY.
   */
  private postSpeechDelayMs: number = loadPostDelay();
  /** Listeners notified on every utterance `end` / `error` event (real only;
   *  the iOS-unlock probe doesn't fire these; the silent-stub verdict fires
   *  them once to release waiting tour steps — see scheduleSilentCheck). */
  private endListeners: Set<() => void> = new Set();
  /**
   * True while speakNode() is fetching a node's body markdown (the 正文
   * field, lazy-loaded in prebuilt mode). The tour engine's speech-wait
   * needs to know about this: while loading, no utterance exists yet, so
   * without this signal makeSpeechWait would fall back to the fixed timer
   * and advance before the body ever gets spoken.
   */
  private bodyLoading = false;
  /** Listeners notified once a body fetch settles (spoken or failed). */
  private bodyLoadListeners: Set<() => void> = new Set();

  constructor() {
    this.synth = getSpeechSynthesis();
    this.unsupportedBrowserHint =
      typeof navigator !== 'undefined' ? knownSilentWebViewLabel(navigator.userAgent) : null;
    if (!this.synth) return;
    this.supported = probeSpeechApi(this.synth);
    if (!this.supported) return;
    // Some browsers load voices asynchronously (Chrome loads from network).
    if (this.synth.getVoices().length > 0) {
      this.voices = this.synth.getVoices();
      this.voicesReady = true;
    }
    this.synth.addEventListener('voiceschanged', () => {
      this.voices = this.synth!.getVoices();
      this.voicesReady = true;
    });
  }

  /** Returns whether TTS is currently enabled. */
  get isActive(): boolean {
    return this.active;
  }

  /**
   * Returns whether the underlying Web Speech API passed the structural
   * probe at all. False on WebViews that expose a stub `speechSynthesis`
   * whose methods are missing or throw outright.
   */
  get isSupported(): boolean {
    return this.supported;
  }

  /**
   * True once a real speak() call has confirmed the engine actually
   * responds (even if a particular utterance errored). Useful for callers
   * that want to distinguish "never tried" from "confirmed working".
   */
  get isVerified(): boolean {
    return this.engineState === 'verified';
  }

  /**
   * True once we've concluded the engine is a "calls succeed, nothing ever
   * plays and no event ever fires" stub (the Quark/WeChat X5 case) and have
   * auto-disabled future speak() calls because of it.
   */
  get isSilentStub(): boolean {
    return this.engineState === 'silent';
  }

  /** Currently selected read-aloud fields. */
  get currentSpeechFields(): SpeechFields {
    return this.fields;
  }

  /**
   * Persist a new field combination. An empty set is rejected (a node is
   * never spoken as nothing); fields are normalised into canonical order
   * before being stored. Returns whether the change was accepted, so the UI
   * can re-read the controller and bounce back on a rejected toggle.
   */
  setSpeechFields(fields: SpeechFields): boolean {
    const normalized = canonicalizeSpeechFields(fields);
    if (normalized.length === 0) return false;
    this.fields = normalized;
    saveSpeechFields(normalized);
    return true;
  }

  /** Current utterance rate (multiplier on the engine default). */
  get currentRate(): number {
    return this.rate;
  }

  /**
   * Persist a new rate. Clamped to [SPEECH_RATE_MIN, SPEECH_RATE_MAX].
   * Subsequent `speak()` calls pick it up.
   */
  setRate(r: number): void {
    if (!Number.isFinite(r)) return;
    const clamped = Math.max(SPEECH_RATE_MIN, Math.min(SPEECH_RATE_MAX, r));
    this.rate = clamped;
    saveRate(clamped);
  }

  /** Whether the tour engine waits for the current utterance to end before advancing. */
  get currentWaitForSpeech(): boolean {
    return this.waitForSpeech;
  }

  /** Persist the "wait for speech" toggle. Safe at any time. */
  setWaitForSpeech(wait: boolean): void {
    this.waitForSpeech = wait;
    saveWaitForSpeech(wait);
  }

  /** Post-speech pause (ms) inserted after each utterance end. */
  get currentPostSpeechDelayMs(): number {
    return this.postSpeechDelayMs;
  }

  /** Persist a new post-speech delay. Snapped to the nearest 100ms step,
   *  clamped to [SPEECH_POST_DELAY_MIN, SPEECH_POST_DELAY_MAX]. */
  setPostSpeechDelayMs(ms: number): void {
    if (!Number.isFinite(ms)) return;
    const snapped = Math.round(ms / SPEECH_POST_DELAY_STEP) * SPEECH_POST_DELAY_STEP;
    const clamped = Math.max(SPEECH_POST_DELAY_MIN, Math.min(SPEECH_POST_DELAY_MAX, snapped));
    this.postSpeechDelayMs = clamped;
    savePostDelay(clamped);
  }

  /** True iff there is currently a real (non-probe) utterance queued or
   *  playing on the engine. Safe to call from any consumer that needs to
   *  coordinate around speech completion (e.g. the tour engine). */
  get isSpeaking(): boolean {
    return this.currentUtterance !== null;
  }

  /**
   * Subscribe to utterance end events. The listener fires once per
   * utterance's natural `end` / `error` event (NOT the iOS-unlock probe,
   * NOT synthetic stops). Returns an unsubscribe function.
   *
   * Use case: the tour engine waits for speech to finish before scheduling
   * the next step. Each subscription covers exactly one end; consumers
   * re-subscribe per step (see tour-controller).
   */
  onEnd(listener: () => void): () => void {
    this.endListeners.add(listener);
    return () => {
      this.endListeners.delete(listener);
    };
  }

  /**
   * True while a node body is being fetched for the 正文 read-aloud field.
   * The tour engine checks this when scheduling the next step — if a fetch
   * is in flight there is no utterance yet, and the step must wait for the
   * load to settle instead of racing ahead on the fixed timer.
   */
  get isBodyLoading(): boolean {
    return this.bodyLoading;
  }

  /**
   * Subscribe to "body fetch settled" — fires once after loadBodyThenSpeak
   * either spoke (with body) or fell back (without body). A single-shot
   * subscription, mirroring onEnd's use in the tour engine.
   */
  onBodyLoaded(listener: () => void): () => void {
    this.bodyLoadListeners.add(listener);
    return () => {
      this.bodyLoadListeners.delete(listener);
    };
  }

  private fireBodyLoaded(): void {
    for (const l of this.bodyLoadListeners) l();
  }

  private fireEnd(): void {
    for (const l of this.endListeners) l();
  }

  /**
   * Toggle TTS on/off.
   *
   * iOS Safari: the first time we turn TTS ON, we send a zero-volume
   * single-space utterance to "unlock" the speech engine. This MUST happen
   * inside the user-gesture call stack (click handler).  If voices are still
   * loading (iOS loads them asynchronously), we defer via queueMicrotask —
   * this keeps the gesture context alive while the event loop processes the
   * voiceschanged notification.
   *
   * If the API fails the structural probe, toggle is a no-op and returns
   * false so callers can update UI to show "朗读不可用".
   */
  toggle(): boolean {
    if (!this.supported || !this.synth) {
      // Surface the failure once, in the button title, so the user knows why
      // clicking has no audible effect. We do NOT flip `active` so the state
      // model stays consistent.
      this.updateButtonState();
      return false;
    }
    this.active = !this.active;
    // Give a previously-judged-silent engine another chance on a fresh
    // manual toggle — a one-off detection hiccup shouldn't permanently lock
    // the user out of retrying, and this keeps the automatic downgrade from
    // being a one-way door the user can't undo.
    if (this.active && this.engineState === 'silent') {
      this.engineState = 'unknown';
    }
    this.updateButtonState();
    if (!this.active) {
      this.stop();
    } else {
      if (!this.unlocked) {
        if (this.voicesReady) {
          this.unlockIOS();
        } else {
          // Voices not ready yet — defer until voiceschanged fires.
          // queueMicrotask keeps us inside the current task (gesture context),
          // so the subsequent unlock utterance still satisfies iOS.
          queueMicrotask(() => this.unlockIOS());
        }
        this.unlocked = true;
      }
    }
    return this.active;
  }

  /**
   * Turn TTS off without changing the toggle state.
   *
   * Only called from a deliberate user action (manual toggle-off) or full
   * teardown — NEVER from the silent-engine guess, which must not cancel an
   * utterance it isn't sure is actually dead. See the file-level comment.
   */
  stop(): void {
    this.clearSilentCheck();
    if (!this.synth) return;
    try {
      this.synth.cancel();
    } catch {
      // Some WebView stubs throw on cancel(). Safe to ignore — we just want
      // to stop emitting.
    }
    this.currentUtterance = null;
  }

  /**
   * Speak the given text immediately.
   * Cancels any in-progress utterance first.
   * If TTS is inactive, does nothing.
   *
   * Safe to call from setTimeout / async callbacks on iOS because
   * unlockIOS() already ran inside the toggle() gesture.
   *
   * Failure handling is intentionally minimal for real errors: we swallow
   * synchronous throws from the speech engine (some Android WebViews —
   * UC/Quark — throw or fire spurious `error` events even when audio
   * actually plays). What we don't swallow is *total, sustained* silence:
   * see scheduleSilentCheck().
   */
  speak(text: string): void {
    if (!this.supported || !this.synth) return;
    if (!this.active || !text.trim()) return;
    // Already judged a mute stub this session — don't keep queueing
    // no-op utterances every tour step.
    if (this.engineState === 'silent') return;

    try {
      this.synth.cancel();
    } catch {
      /* see stop() */
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = this.rate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;

    // Any of these firing — from THIS utterance or one that superseded it —
    // proves the engine is actually alive and responding. That's enough to
    // cancel the silent-stub timer, even if this particular utterance went
    // on to error.
    const markAlive = (): void => {
      this.engineState = 'verified';
      this.clearSilentCheck();
    };
    utterance.addEventListener('start', markAlive);
    utterance.addEventListener('boundary', markAlive);
    const onSettle = (): void => {
      markAlive();
      // Only clear currentUtterance / fire listeners if THIS utterance is
      // still the active one. A subsequent speak() has superseded it, and
      // its own listeners will fire when *it* ends.
      if (this.currentUtterance === utterance) {
        this.currentUtterance = null;
        this.fireEnd();
      }
    };
    utterance.addEventListener('end', onSettle);
    utterance.addEventListener('error', onSettle);

    this.currentUtterance = utterance;
    try {
      this.synth.speak(utterance);
    } catch {
      // Synchronous throw on speak() itself — some WebViews do this.
      // Doesn't necessarily mean the engine is a silent stub (it clearly
      // "responded", just badly), so don't start the silent-check timer.
      return;
    }

    // Arm the detector exactly once per "unknown" phase. Re-arming on every
    // speak() call would mean a tour advancing faster than the timeout keeps
    // resetting the clock and the window never completes — see the
    // file-level comment (c).
    if (this.engineState === 'unknown' && this.silentCheckTimer === null) {
      this.scheduleSilentCheck();
    }
  }

  /**
   * Speak a node according to the current field selection. Composes the
   * utterance text from the node's fields and delegates to speak(). Returns
   * immediately if TTS is inactive, just like speak().
   *
   * The `node` shape is intentionally loose — the call site (tour-controller)
   * passes a cytoscape node data dump (label / shortSummary / fullSummary /
   * tags / edges_out). Missing fields are skipped gracefully.
   *
   * The 正文 (body) field is special: in prebuilt mode the body is NOT in
   * graph-data — it's lazy-loaded from /content/<sourcePath> on demand.
   * speakNode() handles that here: when the user has selected 正文 and the
   * body isn't cached yet, it fetches once, writes the result back onto the
   * node (so DetailPanel and future steps reuse it), then speaks. The fetch
   * is user-opt-in — selecting the 正文 field is an explicit request to read
   * the full body, so a network round-trip is the accepted cost.
   */
  speakNode(node: SpeakableNode | null | undefined): void {
    if (!node) return;
    const wantsBody = this.fields.includes('body');
    const bodyReady = (node.body ?? '').trim().length > 0;
    if (wantsBody && !bodyReady && node.sourcePath) {
      void this.loadBodyThenSpeak(node);
      return;
    }
    const text = composeSpeechText(node, this.fields, uiState.summaryMode);
    if (text) this.speak(text);
  }

  /**
   * Fetch a node's body markdown from /content/<sourcePath>, cache it back
   * onto the node data, then speak with the fresh body. Used only when the
   * 正文 field is selected and the body hasn't been loaded yet.
   */
  private async loadBodyThenSpeak(node: SpeakableNode): Promise<void> {
    this.bodyLoading = true;
    try {
      const path = (node.sourcePath ?? '')
        .split('/')
        .map((s) => encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F'))
        .join('/');
      const res = await fetch(`/content/${path}`);
      let body = '';
      if (res.ok && !(res.headers.get('content-type') ?? '').includes('text/html')) {
        const text = await res.text();
        // Strip the frontmatter block (---…---) — composeSpeechText only
        // wants the markdown body. The same delimiter the parser uses.
        body = text.startsWith('---') ? (text.split(/^---\s*$/m)[2] ?? '') : text;
        node.body = body.trim();
      }
      // TTS may have been toggled off (or the tour moved on) while the
      // fetch was in flight — respect the current state instead of speaking
      // on a stale step.
      if (!this.active) return;
      const composed = composeSpeechText(node, this.fields, uiState.summaryMode);
      if (composed) this.speak(composed);
    } catch {
      // Network failure — fall back to whatever fields are available without
      // the body (silently skip body, keep reading the rest).
      if (!this.active) return;
      const composed = composeSpeechText(
        { ...node, body: undefined },
        this.fields,
        uiState.summaryMode,
      );
      if (composed) this.speak(composed);
    } finally {
      this.bodyLoading = false;
      this.fireBodyLoaded();
    }
  }

  /**
   * Start the one-shot countdown that decides "this engine never says
   * anything back". If no start/boundary/end/error event arrives — from any
   * utterance spoken while this timer is pending, not just the one that
   * armed it — before this fires, we conclude the engine is a mute stub and
   * turn off future speak() calls. We deliberately do NOT cancel whatever is
   * currently queued; see the file-level comment for why.
   */
  private scheduleSilentCheck(): void {
    this.silentCheckTimer = setTimeout(() => {
      this.silentCheckTimer = null;
      if (this.engineState !== 'unknown') return; // an event already arrived
      this.engineState = 'silent';
      this.active = false;
      // 解除等待本次朗读的漫游步进：哑巴引擎不会再发 end/error，若不
      // 释放，去掉绝对上限后漫游会永久卡死。这里只 fireEnd（通知等待者
      // "结束"），不调用 synth.cancel() —— 不触碰可能还在播放的音频
      //（silent 只是"没收到任何事件"，见文件级注释 (b)）。
      if (this.currentUtterance !== null) {
        this.currentUtterance = null;
        this.fireEnd();
      }
      this.updateButtonState();
      showToast(
        this.browserHintText(
          '当前浏览器的朗读引擎无法输出声音，已自动关闭朗读',
          '请用 Chrome/Safari 打开',
        ),
        'info',
      );
    }, SILENT_ENGINE_TIMEOUT_MS);
  }

  private clearSilentCheck(): void {
    if (this.silentCheckTimer !== null) {
      clearTimeout(this.silentCheckTimer);
      this.silentCheckTimer = null;
    }
  }

  /**
   * iOS Safari: send a silent zero-volume utterance to unlock the engine.
   * Must be called inside a user-gesture call stack.
   *
   * We use a single space instead of `''` because some Android WebView forks
   * (notably X5/TBS) reject empty-text utterances synchronously, which would
   * abort the unlock before iOS even gets a chance.
   *
   * Failures here (synchronous throws, missing voices) are swallowed. The
   * button stays clickable regardless — see updateButtonState().
   */
  private unlockIOS(): void {
    if (!this.synth) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      this.synth.speak(u);
    } catch {
      // Intentionally swallow: the unlock utterance is a probe, not a real
      // speak. If real utterances also fail later, scheduleSilentCheck()
      // will catch it on the first actual speak() call.
    }
  }

  private pickVoice(): Voice {
    const zhCN = this.voices.find((v) => v.lang === 'zh-CN');
    if (zhCN) return zhCN;
    const zh = this.voices.find((v) => v.lang.startsWith('zh'));
    if (zh) return zh;
    return this.voices[0] ?? null;
  }

  private updateButtonState(): void {
    document
      .querySelectorAll<HTMLButtonElement>('[data-tour-action="toggle-speech"]')
      .forEach((btn) => {
        btn.classList.toggle('active', this.active);
        btn.setAttribute('aria-pressed', String(this.active));
        // We never set `btn.disabled = true`. On WebViews whose speechSynthesis
        // is broken (X5/TBS, U4/Quark, etc.), users can still toggle the active
        // state — the visual highlight works regardless of audio emission.
        // The title hints at browser compatibility without disabling interaction.
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.title = !this.supported
          ? this.browserHintText('当前浏览器可能不支持朗读', '推荐用 Chrome/Safari 打开')
          : this.engineState === 'silent'
            ? this.browserHintText(
                '此浏览器朗读引擎无声音输出，已自动关闭',
                '推荐用 Chrome/Safari 打开',
              )
            : this.active
              ? '关闭朗读'
              : '开启朗读';
      });
  }

  /**
   * 组合浏览器不兼容提示文案。
   *
   * 检测到已知"哑巴/残缺"内核（夸克 U4、UC、微信 X5/TBS 等）时，把泛化的
   * "推荐用 Chrome/Safari"升级为指名道姓的文案——用户一眼就知道该换哪个
   * 浏览器，而不是把锅甩给"手机不支持"。iOS 上所有浏览器都是完好的 WebKit，
   * 不会走到这里（见 knownSilentWebViewLabel）。
   */
  private browserHintText(before: string, after: string): string {
    if (this.unsupportedBrowserHint) {
      return `${before}（${this.unsupportedBrowserHint}，请用 Chrome/Safari 打开）`;
    }
    return `${before}（${after}）`;
  }
}

/**
 * 识别已知对 Web Speech API 支持残缺的 Android 浏览器内核，返回点名文案；
 * 其他情况返回 null（此时使用泛化的"推荐用 Chrome/Safari 打开"文案）。
 *
 * 判断依据（UA 关键词，顺序重要）：
 *   - iOS 平台（iPhone/iPad/Mac）：强制 WebKit，引擎完好，一律不点名 —— 避免
 *     在 iOS 上出现"夸克不支持"的误导（iOS 夸克其实是 Safari 内核，正常）。
 *   - 微信内置：X5/XWEB（旧）或 TBS（新）内核，speechSynthesis 是"哑巴 stub"。
 *   - 夸克：U4 内核，speak() 可能同步抛错或静默失败。
 *   - UC：UCBrowser，对 TTS 支持残缺。
 *   - 其他安卓 WebView：泛化提示（不点名，因为可能是厂商定制内核）。
 *
 * 纯函数，便于单测直接断言。
 */
export function knownSilentWebViewLabel(ua: string): string | null {
  if (/iPhone|iPad|iPod/i.test(ua)) return null;
  if (/Macintosh|Mac OS X/i.test(ua) && !/Android/i.test(ua)) return null;
  if (/MicroMessenger/i.test(ua)) {
    return /XWEB|TBS|X5/i.test(ua) ? '微信内置浏览器（X5/TBS 内核）' : '微信内置浏览器';
  }
  if (/Quark|U4/i.test(ua)) return '夸克浏览器（U4 内核）';
  if (/UCBrowser/i.test(ua)) return 'UC 浏览器';
  return null;
}

/**
 * Detect whether the host's `speechSynthesis` is at least a structurally
 * working implementation (not necessarily one that actually produces
 * audio — see the class-level `engineState` live probe for that). Checks:
 *   - API object exists and is non-null
 *   - `getVoices`, `speak`, `cancel` are callable functions
 *   - `new SpeechSynthesisUtterance(' ')` does not throw
 * Failing any of these means we should not attempt to use TTS at all.
 */
function probeSpeechApi(api: SpeechSynthesis): boolean {
  if (!api) return false;
  if (typeof api.getVoices !== 'function') return false;
  if (typeof api.speak !== 'function') return false;
  if (typeof api.cancel !== 'function') return false;
  if (typeof SpeechSynthesisUtterance === 'undefined') return false;
  try {
    // Constructing an utterance exercises the constructor; some stubs expose
    // the speak/cancel methods but their constructor throws.
    new SpeechSynthesisUtterance(' ');
    return true;
  } catch {
    return false;
  }
}

/**
 * Minimal contract that speakNode() needs from a node. The tour-controller
 * call site passes a cytoscape data dump; tests pass synthetic literals.
 * Fields are all optional — missing ones are silently skipped at compose time.
 */
export interface SpeakableNode {
  label?: string;
  /**
   * Source location path from frontmatter — which book / part / chapter /
   * section / subsection the node lives in. Values already carry their own
   * Chinese prefixes ("第一章 认知底色"), so we just join the present parts
   * with a pause. Spoken only when the 位置 field is toggled on.
   */
  location?: {
    book?: string;
    part?: string;
    chapter?: string;
    section?: string;
    subsection?: string;
    item?: string;
  };
  /**
   * Outgoing edges. For TTS we read `reason` (the human-readable Chinese
   * rationale from the source frontmatter, e.g. "镇静催眠药的一种分类"),
   * NOT `target` — the target id is meaningless when spoken aloud. Nodes
   * without a reason fall back to target label resolution upstream.
   */
  edges_out?: Array<{ type?: string; target: string; reason?: string }>;
  tags?: string[];
  shortSummary?: string;
  fullSummary?: string;
  /**
   * Full body markdown (「文」页签 content). In prebuilt mode this is
   * `undefined` until fetched from /content/<sourcePath>; speakNode() loads
   * it on demand when the 正文 field is selected.
   */
  body?: string;
  /** Path of the source markdown relative to /content/, used to fetch body. */
  sourcePath?: string;
}

/**
 * Clean a summary's raw Markdown so it reads naturally when spoken aloud.
 *
 * The summary field in source frontmatter is rich text (bold, lists,
 * tables, headings) — the raw text contains symbols that Web Speech API
 * would read out verbatim ("卡马西平，** 是..." or "| 列一 | 列二 |"). This
 * strips the markup and keeps the words:
 *
 *   - `**bold**` / `*italic*` / ~~del~~                  → inner text
 *   - inline code `` `x` `` and escaped `\*`              → inner text
 *   - links `[label](url)`                                → label only
 *   - headings `## ` / list markers / table cells         → text, with a
 *     spoken pause after each structural break
 *
 * Pauses matter: Web Speech API generally ignores raw newlines (it treats
 * them as ordinary whitespace), so a multi-line summary would otherwise be
 * read as one breathless run-on ("零维：一个点一维：一条线段..."). We
 * translate structural line breaks into the punctuation TTS reliably
 * pauses on:
 *   - list items / table rows                                → ；
 *   - headings & paragraph breaks                            → 。
 *   - a soft line break inside a paragraph (e.g. a math formula) → keep
 *     as a plain space, no pause (the sentence continues)
 *
 * Pure function — exported so unit tests can pin down every rule.
 */
export function cleanSummaryForSpeech(raw: string): string {
  let s = raw;

  // 1. Remove HTML-ish artifacts that could be spoken as literal tags
  //    (none in current data, but cheap insurance for future content).
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?>/gi, '');

  // 2. Inline markup: bold/italic/strikethrough/code. Remove the wrapping
  //    symbols, keep the text. `**` must be handled before `*`.
  //    NOTE: `_underscore_` is deliberately NOT stripped — in real data
  //    it's math subscript notation (z_{n+1}, r_s), never emphasis.
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1'); // **bold**
  s = s.replace(/\*([^*\n]+)\*/g, '$1'); // *italic*
  s = s.replace(/~~([^~]+)~~/g, '$1'); // ~~strike~~
  s = s.replace(/`([^`\n]+)`/g, '$1'); // `code`
  // Escaped markdown characters: \* \_ \` \# \| \- etc.
  s = s.replace(/\\([*_`#|~-])/g, '$1');

  // 3. Links: [label](url) → label only; bare urls → keep as text.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');

  // 4-7. Structural breaks → spoken punctuation.
  //
  // We work at TWO levels so the pauses we add are semantically right:
  //   - Paragraph level (`\n\n`): a paragraph is a complete unit — if it
  //     doesn't already end with sentence-final punctuation, append 。
  //     so the boundary is audible.
  //   - Line level (`\n`): list items / table rows / headings are also
  //     complete units — append ；(list/table) or 。(heading). A soft
  //     line break inside a paragraph (e.g. a wrapped math formula) is
  //     NOT a boundary: collapse to a space.
  const paragraphs = s.split(/\n\s*\n/);
  s = paragraphs
    .map((para) => {
      const lines = para.split('\n');
      const out: string[] = [];
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        // Drop markdown-only lines: table separator rows & thematic breaks.
        if (/^\|[\s:|-]+\|$/.test(line)) continue;
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) continue;

        // Inline cleanup.
        let body = line;
        body = body.replace(/^[ \t]*\|/, '').replace(/\|[ \t]*$/, '');
        body = body.replace(/\|/g, '，');
        const isList = /^[-*+][ \t]+/.test(body) || /^\d+[.、）][ \t]+/.test(body);
        body = body.replace(/^[-*+][ \t]+/, '').replace(/^\d+[.、）][ \t]+/, '');
        const isHeading = /^#{1,6}[ \t]+/.test(body);
        body = body.replace(/^#{1,6}[ \t]+/, '');
        body = body.trim();
        if (!body) continue;

        const kind: 'list' | 'table' | 'heading' | 'para' = isList
          ? 'list'
          : line.startsWith('|')
            ? 'table'
            : isHeading
              ? 'heading'
              : 'para';

        // Append a pause at the END of a structural unit.
        const end = kind === 'list' || kind === 'table' ? '；' : '。';
        const alreadyEnds = /[。！？；，、：.?!;,]$/.test(body) || kind === 'para';
        out.push(body + (alreadyEnds ? '' : end));
      }
      // Paragraph-level close: a plain-text paragraph should end with a
      // sentence-final mark. Strip any trailing non-final punctuation (a
      // dangling `，`/`、`), then ensure `。`. List/table paragraphs keep
      // their `；` — each item is an equal sibling; closing the last one
      // with `。` would misread it as a different kind of boundary.
      let joined = out.join(' ');
      if (/[；]$/.test(joined)) return joined;
      joined = joined.replace(/[，、：:,.，]+$/g, '');
      if (joined && !/[。！？]$/.test(joined)) joined += '。';
      return joined;
    })
    .filter(Boolean)
    .map((para, i, arr) => {
      // A list/table paragraph closes with `；`. When ANOTHER paragraph
      // follows, that boundary is a sentence break — promote the `；` to
      // `。` so the transition is audible (otherwise the mid-sentence
      // space-strip below would glue them together; the join adds the
      // single separating space).
      if (i < arr.length - 1 && /；$/.test(para)) return para.replace(/；$/, '。');
      return para;
    })
    .join(' ');

  // 8. Tidy: collapse spaces around punctuation, drop repeated ；, strip
  //    edge noise. Duplicate marks arise where a structural pause meets
  //    punctuation that was already in the source (e.g. a table cell that
  //    ended in `，` right before the row's `；`). Collapse each run to the
  //    STRONGEST mark so a stray `；，，` never reads as a stutter. Spaces
  //    AFTER sentence-final marks (。！？) are KEPT — they're the audible
  //    gap between paragraphs. Spaces before any mark, or after a
  //    mid-sentence mark (，、；), are dropped — those come from source
  //    cell separators, not real pauses.
  s = s.replace(/[ \t]+([。；，、：,.?!])/g, '$1');
  s = s.replace(/([，、；])[ \t]+/g, '$1');
  s = s.replace(/，+/g, '，');
  s = s.replace(/[。！？]+/g, '。');
  s = s.replace(/；[，]+/g, '；');
  s = s.replace(/[，]+；/g, '；');
  s = s.replace(/；+/g, '；');
  s = s.replace(/。；/g, '。');
  s = s.replace(/；。/g, '。');
  s = s.replace(/^[；，。、\s]+/g, '');
  s = s.replace(/[ \t]+$/g, '');

  return s.trim();
}

/**
 * Build the text to be spoken for a node from the selected fields. Pure
 * function — exported so unit tests can exercise every field combination
 * without going through the SpeechController.
 *
 * Fields are concatenated in SPEECH_FIELD_ORDER (label → edges → tags →
 * summary) regardless of the order they appear in `fields`, so the order the
 * user toggled them on never changes the utterance:
 *   - label   → node.label
 *   - location → node.location 各段按 book/part/chapter/section/subsection/
 *                item 顺序拼接,用「。 」停顿;缺失的层级跳过
 *   - edges   → edges_out[*].reason joined with '、'
 *   - tags    → tags joined with '、'
 *   - summary → node.shortSummary 或 node.fullSummary,由 summaryMode 决定;
 *               所选那一段缺失时回落到另一段,绝不把两段都读出来
 *
 * "关联" 朗读的是 edges_out[*].reason (来自 frontmatter 的中文语义说明,
 * 例如 "镇静催眠药的一种分类"),而不是 target id — id 是机器用的,
 * 念出来毫无意义;没有 reason 的边会被静默跳过。
 *
 * Empty trailing parts are dropped so we don't read "卡马西平, " followed by
 * silence. Whitespace-only fields are skipped too.
 */
export function composeSpeechText(
  node: SpeakableNode,
  fields: SpeechFields,
  summaryMode: 'short' | 'full' = 'short',
): string {
  const selected = new Set(fields);
  const parts: string[] = [];

  if (selected.has('label')) {
    const label = (node.label ?? '').trim();
    if (label) parts.push(label);
  }

  if (selected.has('location')) {
    const loc = node.location;
    if (loc) {
      const segments = [loc.book, loc.part, loc.chapter, loc.section, loc.subsection, loc.item]
        .map((s) => (s ?? '').trim())
        .filter((s) => s.length > 0);
      if (segments.length > 0) parts.push(segments.join('。 '));
    }
  }

  if (selected.has('edges')) {
    const edges = (node.edges_out ?? [])
      .map((e) => (e.reason ?? '').trim())
      .filter((s) => s.length > 0);
    if (edges.length > 0) parts.push(edges.join('、'));
  }

  if (selected.has('tags')) {
    const tags = (node.tags ?? []).map((t) => t.trim()).filter((s) => s.length > 0);
    if (tags.length > 0) parts.push(tags.join('、'));
  }

  if (selected.has('summary')) {
    // 摘要跟随详情面板的「简短 / 详细」当前选择(uiState.summaryMode),
    // 与 detail-panel.buildSummaryHtml 的回落逻辑一致:所选模式对应的
    // 摘要缺失时退到另一段。二者只读其一,不拼接。
    const summary =
      summaryMode === 'full'
        ? (node.fullSummary ?? node.shortSummary)
        : (node.shortSummary ?? node.fullSummary);
    const cleaned = (summary ?? '').trim();
    if (cleaned) parts.push(cleanSummaryForSpeech(cleaned));
  }

  if (selected.has('body')) {
    const body = (node.body ?? '').trim();
    if (body) parts.push(cleanSummaryForSpeech(body));
  }

  return parts.join('，');
}

/** Module-level singleton — created on first import. */
export const speechController = new SpeechController();
