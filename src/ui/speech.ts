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
//   use a real (even zero-volume) utterance. Fix: prime the engine with an
//   empty utterance in the toggle() handler (deferred via microtask if voices
//   are still loading so iOS does not silently drop the unlock utterance).
// - Rate: 1.0 (default). Could be exposed as a setting in future.
// - State is NOT persisted — TTS is off by default on every page load.

type Voice = SpeechSynthesisVoice | null;

class SpeechController {
  private active = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  /** True once the voice list is non-empty (immediate or after voiceschanged). */
  private voicesReady = false;
  /** iOS Safari: speech engine must be unlocked once per page session. */
  private unlocked = false;

  constructor() {
    if (typeof speechSynthesis === 'undefined') return;
    // Some browsers load voices asynchronously (Chrome loads from network).
    if (speechSynthesis.getVoices().length > 0) {
      this.voices = speechSynthesis.getVoices();
      this.voicesReady = true;
    }
    speechSynthesis.addEventListener('voiceschanged', () => {
      this.voices = speechSynthesis.getVoices();
      this.voicesReady = true;
    });
  }

  /** Returns whether TTS is currently enabled. */
  get isActive(): boolean {
    return this.active;
  }

  /**
   * Toggle TTS on/off.
   *
   * iOS Safari: the first time we turn TTS ON, we send a zero-volume
   * utterance to "unlock" the speech engine. This MUST happen inside the
   * user-gesture call stack (click handler).  If voices are still loading
   * (iOS loads them asynchronously), we defer via queueMicrotask — this
   * keeps the gesture context alive while the event loop processes the
   * voiceschanged notification.
   */
  toggle(): boolean {
    this.active = !this.active;
    if (!this.active) {
      this.stop();
    } else {
      this.updateButtonState();
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
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    this.currentUtterance = null;
  }

  /**
   * Speak the given text immediately.
   * Cancels any in-progress utterance first.
   * If TTS is inactive, does nothing.
   *
   * Safe to call from setTimeout / async callbacks on iOS because
   * unlockIOS() already ran inside the toggle() gesture.
   */
  speak(text: string): void {
    if (!this.active || !text.trim() || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;

    utterance.addEventListener('end', () => { this.currentUtterance = null; });
    utterance.addEventListener('error', () => { this.currentUtterance = null; });

    this.currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  }

  /**
   * iOS Safari: send a silent zero-volume utterance to unlock the engine.
   * Must be called inside a user-gesture call stack.
   */
  private unlockIOS(): void {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    speechSynthesis.speak(u);
  }

  private pickVoice(): Voice {
    const zhCN = this.voices.find((v) => v.lang === 'zh-CN');
    if (zhCN) return zhCN;
    const zh = this.voices.find((v) => v.lang.startsWith('zh'));
    if (zh) return zh;
    return this.voices[0] ?? null;
  }

  private updateButtonState(): void {
    document.querySelectorAll<HTMLElement>('[data-tour-action="toggle-speech"]').forEach((btn) => {
      btn.classList.toggle('active', this.active);
      btn.setAttribute('aria-pressed', String(this.active));
      btn.title = this.active ? '关闭朗读' : '开启朗读';
    });
  }
}

/** Module-level singleton — created on first import. */
export const speechController = new SpeechController();
