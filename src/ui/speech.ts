// src/ui/speech.ts
// Web Speech API (TTS) controller for reading node labels during tour.
//
// Design decisions:
// - Singleton: one global speech controller, reused across all tours.
// - Speaks immediately on the current node label; no buffering or queue.
// - Auto-cancels previous utterance before starting a new one — prevents
//   overlapping voices from rapid step transitions.
// - Voice selection: prefers zh-CN voices, falls back to any available voice.
// - Rate: 1.0 (default). Could be exposed as a setting in future.
// - State is NOT persisted — TTS is off by default on every page load.

type Voice = SpeechSynthesisVoice | null;

class SpeechController {
  private active = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private voiceReady = false;

  constructor() {
    if (typeof speechSynthesis === 'undefined') return;
    // Some browsers load voices asynchronously (Chrome loads from network).
    // Populate immediately if already available, otherwise wait for the event.
    if (speechSynthesis.getVoices().length > 0) {
      this.voices = speechSynthesis.getVoices();
      this.voiceReady = true;
    }
    speechSynthesis.addEventListener('voiceschanged', () => {
      this.voices = speechSynthesis.getVoices();
      this.voiceReady = true;
    });
  }

  /** Returns whether TTS is currently enabled. */
  get isActive(): boolean {
    return this.active;
  }

  /** Toggle TTS on/off. Returns the new state. */
  toggle(): boolean {
    this.active = !this.active;
    if (!this.active) {
      this.stop();
    }
    this.updateButtonState();
    return this.active;
  }

  /** Turn TTS off without changing the toggle state. Called on tour stop/complete. */
  stop(): void {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    this.currentUtterance = null;
  }

  /**
   * Speak the given text immediately.
   * Cancels any in-progress utterance first.
   * If TTS is inactive, does nothing.
   */
  speak(text: string): void {
    if (!this.active || !text.trim() || typeof speechSynthesis === 'undefined') return;

    // Cancel any ongoing speech — no overlapping voices
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Prefer a Chinese voice; fall back to the first available voice.
    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;

    // Clean up reference when done (success or interrupted)
    utterance.addEventListener('end', () => { this.currentUtterance = null; });
    utterance.addEventListener('error', () => { this.currentUtterance = null; });

    this.currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  }

  private pickVoice(): Voice {
    // Priority: zh-CN > zh > any
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
