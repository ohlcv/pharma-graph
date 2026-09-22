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
// - Graceful degradation on WebViews that expose `speechSynthesis` but never
//   actually produce audio (e.g. WeChat X5/TBS on Android). We probe the API
//   once at boot and short-circuit speak() if it's a stub — see
//   `isSpeechSupported()`. The toggle button then reflects unsupported state
//   in its title so users know to open in a real browser.

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

class SpeechController {
  private active = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  /** True once the voice list is non-empty (immediate or after voiceschanged). */
  private voicesReady = false;
  /** iOS Safari: speech engine must be unlocked once per page session. */
  private unlocked = false;
  /**
   * Consecutive utterance-level failures (asynchronous `error` events).
   * Real browsers fire `error` only on genuine failure; UC/Quark/X5 WebViews
   * fire `error` for *every* speak() even when no audio is produced, so we
   * require multiple consecutive failures before disabling. A single `end`
   * resets the counter.
   */
  private failureStreak = 0;
  /** Threshold of consecutive utterance errors before flipping supported=false. */
  private static readonly FAILURE_THRESHOLD = 3;
  /**
   * False on WebViews that expose `speechSynthesis` but never actually emit
   * audio (notably WeChat X5/TBS on Android). Detected lazily by checking
   * that the API object responds to its core methods without throwing.
   */
  private supported = false;
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
   * Returns whether the underlying Web Speech API can be used at all.
   * False on WebViews that expose a stub `speechSynthesis` (WeChat X5 etc.).
   */
  get isSupported(): boolean {
    return this.supported;
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
   * If the API is not supported, toggle is a no-op and returns false so
   * callers can update UI to show "朗读不可用".
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
   * Failure handling:
   *   - Synchronous throw on speak(): recorded as one failure but does NOT
   *     immediately disable — some WebViews (UC/Quark) throw on the very
   *     first call right after toggle but succeed on the next.
   *   - Asynchronous `error` event on the utterance: increments the failure
   *     streak. After FAILURE_THRESHOLD consecutive failures, we flip
   *     supported=false and disable the button.
   *   - Asynchronous `end` event: resets the failure streak to zero.
   */
  speak(text: string): void {
    if (!this.supported || !this.synth) return;
    if (!this.active || !text.trim()) return;
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

    utterance.addEventListener('end', () => {
      this.currentUtterance = null;
      // Successful playback — clear any previous failure streak.
      this.failureStreak = 0;
    });
    utterance.addEventListener('error', () => {
      this.currentUtterance = null;
      // Async failure path: some WebViews always fire `error` even when they
      // actually played audio. Require multiple consecutive failures before
      // we conclude the engine is non-functional.
      this.failureStreak += 1;
      if (this.failureStreak >= SpeechController.FAILURE_THRESHOLD) {
        this.supported = false;
        this.active = false;
        this.updateButtonState();
      }
    });

    this.currentUtterance = utterance;
    try {
      this.synth.speak(utterance);
    } catch {
      // Synchronous throw — also counts as a failure but does not immediately
      // disable. See failure-streak logic above.
      this.failureStreak += 1;
      if (this.failureStreak >= SpeechController.FAILURE_THRESHOLD) {
        this.supported = false;
        this.active = false;
        this.updateButtonState();
      }
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
   * NOTE: unlock failures (synchronous throws, missing voices) do NOT flip
   * `supported=false`. Some Android browsers (UC/Quark/U4) reject the
   * zero-volume unlock utterance but still speak real text correctly. We
   * reserve `supported=false` for repeated *real-utterance* failures — see
   * the failure-streak logic in `speak()`.
   */
  private unlockIOS(): void {
    if (!this.synth) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      this.synth.speak(u);
    } catch {
      // Intentionally swallow: the unlock utterance is a probe, not a real
      // speak. If real utterances also fail later, the failure-streak in
      // speak() will eventually disable the button.
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
      if (!this.supported) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.title = '当前浏览器不支持朗读（请用 Chrome/Safari 打开）';
      } else {
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.title = this.active ? '关闭朗读' : '开启朗读';
      }
    });
  }
}

/**
 * Detect whether the host's `speechSynthesis` is a working implementation
 * or a non-functional stub. The probe checks:
 *   - API object exists and is non-null
 *   - `getVoices`, `speak`, `cancel` are callable functions
 *   - `new SpeechSynthesisUtterance(' ')` does not throw
 * Failing any of these means we should not attempt to use TTS.
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
