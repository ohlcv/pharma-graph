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
// - Rate: 1.25 (slightly faster than default for Chinese pacing). Could be
//   exposed as a setting in future.
// - State is NOT persisted — TTS is off by default on every page load.
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
//      If a real speak() call produces no event at all within
//      SILENT_ENGINE_TIMEOUT_MS, we treat the engine as a silent stub: turn
//      TTS off automatically, update the button, and tell the user via a
//      toast — instead of leaving the button in a confusing dead "toggled
//      on but nothing happens" (or, before the structural probe even runs,
//      a stuck-gray "toggled but never went active") state.

import { showToast } from './ui-helpers.js';

type Voice = SpeechSynthesisVoice | null;

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
 * How long we wait after speak() for ANY event (`start`/`boundary`/`end`/
 * `error`) before concluding the engine is a silent stub. 1.5s is generous
 * enough to survive slow voice-loading on first speak, but short enough
 * that the user doesn't sit through several silent tour steps wondering
 * why nothing is being read.
 */
const SILENT_ENGINE_TIMEOUT_MS = 1500;

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
   *   - 'silent'   — a speak() call produced no event at all within the
   *                  timeout; engine is judged a mute stub and TTS has
   *                  been auto-disabled
   */
  private engineState: 'unknown' | 'verified' | 'silent' = 'unknown';
  private silentCheckTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cached speechSynthesis reference; null when unsupported. */
  private readonly synth: SpeechSynthesis | null;

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
   * auto-disabled TTS because of it.
   */
  get isSilentStub(): boolean {
    return this.engineState === 'silent';
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
    // manual toggle — a one-off event-delivery hiccup shouldn't permanently
    // lock the user out of retrying, and this keeps the automatic
    // downgrade from being a one-way door the user can't undo.
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

  /** Turn TTS off without changing the toggle state. */
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
   * actually plays). What we don't swallow is *total silence*: see
   * scheduleSilentCheck().
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
    utterance.rate = 1.25;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;

    // Any of these firing proves the engine is actually alive and
    // responding — that's enough to cancel the silent-stub timeout, even
    // if this particular utterance went on to error.
    const markAlive = (): void => {
      this.engineState = 'verified';
      this.clearSilentCheck();
    };
    utterance.addEventListener('start', markAlive);
    utterance.addEventListener('boundary', markAlive);
    utterance.addEventListener('end', () => {
      markAlive();
      this.currentUtterance = null;
    });
    utterance.addEventListener('error', () => {
      markAlive();
      this.currentUtterance = null;
    });

    this.currentUtterance = utterance;
    try {
      this.synth.speak(utterance);
    } catch {
      // Synchronous throw on speak() itself — some WebViews do this.
      // Doesn't necessarily mean the engine is a silent stub (it clearly
      // "responded", just badly), so don't start the silent-check timer.
      return;
    }

    // Only arm the timeout while we genuinely don't know yet — once
    // verified, every subsequent utterance skips the timer entirely.
    if (this.engineState === 'unknown') this.scheduleSilentCheck();
  }

  /**
   * Start (or restart) the countdown that decides "this engine never says
   * anything back". If no start/boundary/end/error event arrives before
   * this fires, we conclude the engine is a mute stub, turn TTS off, and
   * tell the user — rather than leaving them staring at a toggled-on
   * button that never produces sound.
   */
  private scheduleSilentCheck(): void {
    this.clearSilentCheck();
    this.silentCheckTimer = setTimeout(() => {
      this.silentCheckTimer = null;
      if (this.engineState !== 'unknown') return; // an event already arrived
      this.engineState = 'silent';
      this.active = false;
      this.stop();
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
    document.querySelectorAll<HTMLButtonElement>('[data-tour-action="toggle-speech"]').forEach((btn) => {
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

/** Module-level singleton — created on first import. */
export const speechController = new SpeechController();