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
//   1.0x). Was hardcoded to 1.25 historically.
// - State is NOT persisted — TTS is off by default on every page load.
// - Granularity (4 modes) IS persisted under one key — the user picks how
//   much of a node to read; survives reloads.
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
//           genuinely in-flight utterance.
//
//        c) The detector is armed once per "unknown" phase, not re-armed
//           on every speak() call. If it re-armed every time, a tour
//           stepping faster than the timeout would perpetually reset the
//           clock and the detector would never get a chance to complete —
//           exactly backwards from what we want against a truly silent
//           engine (which never sends a wake-up event to cancel the
//           detector anyway).

import { showToast } from './ui-helpers.js';

type Voice = SpeechSynthesisVoice | null;

/**
 * Read-aloud granularity for a node. Determines what fields of the node
 * get joined into the utterance. User picks one in the advanced-settings
 * panel; default is 'label-edges' (a step up from the legacy label-only
 * behaviour, but still concise enough not to overwhelm during a tour).
 */
export type SpeechGranularity =
  /** Only the node label. */
  | 'label'
  /** Label + outgoing edges (targets joined by commas). */
  | 'label-edges'
  /** Label + outgoing edges + tags. */
  | 'label-edges-tags'
  /** Label + the full summary text. */
  | 'label-full-summary';

export const SpeechGranularityOptions: ReadonlyArray<SpeechGranularity> = [
  'label',
  'label-edges',
  'label-edges-tags',
  'label-full-summary',
] as const;

/** Human label shown on the granularity segmented control. */
export const SpeechGranularityLabels: Record<SpeechGranularity, string> = {
  label: '仅标题',
  'label-edges': '标题和关联',
  'label-edges-tags': '标题和关联和标签',
  'label-full-summary': '标题和摘要',
};

/** Single localStorage key holding the chosen granularity. */
export const SPEECH_GRANULARITY_KEY = 'pg:speech:granularity';

/** Single localStorage key holding the chosen read-aloud rate (0.5–2.0). */
export const SPEECH_RATE_KEY = 'pg:speech:rate';

/** Single localStorage key holding the "wait for speech to finish before advancing" toggle. */
export const SPEECH_WAIT_KEY = 'pg:speech:waitForSpeech';

/** Single localStorage key holding the post-speech pause (ms; 0–2000). */
export const SPEECH_POST_DELAY_KEY = 'pg:speech:postDelay';

export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2.0;
export const SPEECH_RATE_DEFAULT = 1.25;
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

function loadGranularity(): SpeechGranularity {
  try {
    const raw = localStorage.getItem(SPEECH_GRANULARITY_KEY);
    if (!raw) return 'label-edges-tags';
    if ((SpeechGranularityOptions as readonly string[]).includes(raw)) {
      return raw as SpeechGranularity;
    }
  } catch {
    /* ignore */
  }
  return 'label-edges-tags';
}

function saveGranularity(g: SpeechGranularity): void {
  try {
    localStorage.setItem(SPEECH_GRANULARITY_KEY, g);
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
  /** Current read-aloud granularity (persisted under SPEECH_GRANULARITY_KEY). */
  private granularity: SpeechGranularity = loadGranularity();
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
   *  iOS-unlock probe and silent-check timer don't fire these). */
  private endListeners: Set<() => void> = new Set();

  constructor() {
    this.synth = getSpeechSynthesis();
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

  /** Currently selected read-aloud granularity. */
  get currentGranularity(): SpeechGranularity {
    return this.granularity;
  }

  /**
   * Persist a new granularity. Subsequent `speakNode()` calls use it.
   * Safe to call at any time; the next speak picks it up.
   */
  setGranularity(g: SpeechGranularity): void {
    this.granularity = g;
    saveGranularity(g);
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
   * Speak a node according to the current granularity setting. Composes the
   * utterance text from the node's fields and delegates to speak(). Returns
   * immediately if TTS is inactive, just like speak().
   *
   * The `node` shape is intentionally loose — the call site (tour-controller)
   * passes a cytoscape node data dump (label / shortSummary / fullSummary /
   * tags / edges_out). Missing fields are skipped gracefully.
   */
  speakNode(node: SpeakableNode | null | undefined): void {
    if (!node) return;
    const text = composeSpeechText(node, this.granularity);
    if (text) this.speak(text);
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
      this.updateButtonState();
      showToast(
        '当前浏览器的朗读引擎无法输出声音，已自动关闭朗读（推荐用 Chrome/Safari 打开）',
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
          ? '当前浏览器可能不支持朗读（推荐用 Chrome/Safari 打开）'
          : this.engineState === 'silent'
            ? '此浏览器朗读引擎无声音输出，已自动关闭（推荐用 Chrome/Safari 打开）'
            : this.active
              ? '关闭朗读'
              : '开启朗读';
      });
  }
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
   * Outgoing edges. For TTS we read `reason` (the human-readable Chinese
   * rationale from the source frontmatter, e.g. "镇静催眠药的一种分类"),
   * NOT `target` — the target id is meaningless when spoken aloud. Nodes
   * without a reason fall back to target label resolution upstream.
   */
  edges_out?: Array<{ type?: string; target: string; reason?: string }>;
  tags?: string[];
  shortSummary?: string;
  fullSummary?: string;
}

/**
 * Build the text to be spoken for a node at the given granularity. Pure
 * function — exported so unit tests can exercise every (granularity, fields)
 * combination without going through the SpeechController.
 *
 * Concatenation rules:
 *   - 'label'             → node.label
 *   - 'label-edges'       → label + ', ' + edge reasons joined with '、'
 *   - 'label-edges-tags'  → label-edges + ', ' + tags joined with '、'
 *   - 'label-full-summary' → label + ', ' + fullSummary
 *
 * "关联" 朗读的是 edges_out[*].reason (来自 frontmatter 的中文语义说明,
 * 例如 "镇静催眠药的一种分类"),而不是 target id — id 是机器用的,
 * 念出来毫无意义;没有 reason 的边会被静默跳过。
 *
 * Empty trailing parts are dropped so we don't read "卡马西平, " followed by
 * silence. Whitespace-only fields are skipped too.
 */
export function composeSpeechText(node: SpeakableNode, granularity: SpeechGranularity): string {
  const parts: string[] = [];
  const label = (node.label ?? '').trim();
  if (label) parts.push(label);

  if (granularity === 'label-edges' || granularity === 'label-edges-tags') {
    const edges = (node.edges_out ?? [])
      .map((e) => (e.reason ?? '').trim())
      .filter((s) => s.length > 0);
    if (edges.length > 0) parts.push(edges.join('、'));
  }

  if (granularity === 'label-edges-tags') {
    const tags = (node.tags ?? []).map((t) => t.trim()).filter((s) => s.length > 0);
    if (tags.length > 0) parts.push(tags.join('、'));
  }

  if (granularity === 'label-full-summary') {
    const summary = (node.fullSummary ?? '').trim();
    if (summary) parts.push(summary);
  }

  return parts.join('，');
}

/** Module-level singleton — created on first import. */
export const speechController = new SpeechController();
