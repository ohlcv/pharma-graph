// tests/unit/ui/speech-settings.test.ts
// Pure unit tests for the new persistence + event hooks on SpeechController:
// rate / waitForSpeech / postSpeechDelayMs setters + onEnd subscriber +
// isSpeaking query.
//
// We don't exercise the live Web Speech API (jsdom has none); we install
// a stub `speechSynthesis` via vi.stubGlobal so speak() can produce fake
// `end` events. vi.resetModules() isolates each test from any state held
// by the singleton across the previous test.

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('SpeechController persistence + onEnd subscriber (unit)', () => {
  let mod: typeof import('@/ui/speech');

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();

    // jsdom does not provide SpeechSynthesisUtterance; the controller's
    // structural probe (probeSpeechApi) refuses to operate without it.
    // We provide a minimal EventTarget-backed stand-in so the probe
    // passes AND addEventListener('end', …) actually fires.
    class FakeUtterance extends EventTarget {
      rate = 1.0;
      pitch = 1.0;
      volume = 1.0;
      lang = '';
      voice: SpeechSynthesisVoice | null = null;
      text: string;
      constructor(text: string) {
        super();
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal(
      'speechSynthesis',
      makeStubSpeechSynthesis() as unknown as SpeechSynthesis,
    );
    mod = await import('@/ui/speech');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clamps the rate setter to [SPEECH_RATE_MIN, SPEECH_RATE_MAX]', () => {
    const c = mod.speechController;
    c.setRate(0.1);
    expect(c.currentRate).toBe(mod.SPEECH_RATE_MIN);
    c.setRate(99);
    expect(c.currentRate).toBe(mod.SPEECH_RATE_MAX);
    c.setRate(1.25);
    expect(c.currentRate).toBe(1.25);
  });

  it('persists the rate to localStorage under SPEECH_RATE_KEY', () => {
    mod.speechController.setRate(1.5);
    expect(localStorage.getItem(mod.SPEECH_RATE_KEY)).toBe('1.5');
  });

  it('snaps the post-speech delay to the nearest 100ms step', () => {
    const c = mod.speechController;
    c.setPostSpeechDelayMs(247);
    expect(c.currentPostSpeechDelayMs).toBe(200);
    c.setPostSpeechDelayMs(1000);
    expect(c.currentPostSpeechDelayMs).toBe(1000);
    c.setPostSpeechDelayMs(999);
    expect(c.currentPostSpeechDelayMs).toBe(1000);
    c.setPostSpeechDelayMs(-50);
    expect(c.currentPostSpeechDelayMs).toBe(0);
    c.setPostSpeechDelayMs(9999);
    expect(c.currentPostSpeechDelayMs).toBe(mod.SPEECH_POST_DELAY_MAX);
  });

  it('persists wait-for-speech toggle', () => {
    const c = mod.speechController;
    c.setWaitForSpeech(false);
    expect(c.currentWaitForSpeech).toBe(false);
    expect(localStorage.getItem(mod.SPEECH_WAIT_KEY)).toBe('0');
    c.setWaitForSpeech(true);
    expect(c.currentWaitForSpeech).toBe(true);
    expect(localStorage.getItem(mod.SPEECH_WAIT_KEY)).toBe('1');
  });

  it('isSpeaking is false when no utterance has been queued', () => {
    expect(mod.speechController.isSpeaking).toBe(false);
  });

  it('onEnd subscriber fires when an utterance emits `end`', async () => {
    const c = mod.speechController;
    c.toggle();
    expect(c.isActive).toBe(true);
    const listener = vi.fn();
    c.onEnd(listener);
    c.speak('hello');
    const queued = lastQueued();
    queued.dispatchEvent(new Event('end'));
    await flushMicro();
    expect(listener).toHaveBeenCalledTimes(1);
    c.stop();
  });

  it('onEnd subscriber fires when an utterance emits `error`', async () => {
    const c = mod.speechController;
    c.toggle();
    const listener = vi.fn();
    c.onEnd(listener);
    c.speak('oops');
    lastQueued().dispatchEvent(new Event('error'));
    await flushMicro();
    expect(listener).toHaveBeenCalledTimes(1);
    c.stop();
  });

  it('onEnd unsubscribe function actually detaches the listener', async () => {
    const c = mod.speechController;
    c.toggle();
    const listener = vi.fn();
    const off = c.onEnd(listener);
    off();
    c.speak('hello');
    lastQueued().dispatchEvent(new Event('end'));
    await flushMicro();
    expect(listener).not.toHaveBeenCalled();
    c.stop();
  });

  it('multiple onEnd subscribers all fire on a single end event', async () => {
    const c = mod.speechController;
    c.toggle();
    const a = vi.fn();
    const b = vi.fn();
    c.onEnd(a);
    c.onEnd(b);
    c.speak('hi');
    lastQueued().dispatchEvent(new Event('end'));
    await flushMicro();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    c.stop();
  });

  it('onEnd does NOT fire when a later speak() supersedes the in-flight one', async () => {
    const c = mod.speechController;
    c.toggle();
    const listener = vi.fn();
    c.onEnd(listener);
    c.speak('first');
    const firstUtterance = lastQueued();
    c.speak('second');
    const secondUtterance = lastQueued();
    expect(firstUtterance).not.toBe(secondUtterance);
    firstUtterance.dispatchEvent(new Event('end'));
    await flushMicro();
    expect(listener).not.toHaveBeenCalled();
    secondUtterance.dispatchEvent(new Event('end'));
    await flushMicro();
    expect(listener).toHaveBeenCalledTimes(1);
    c.stop();
  });

  it('the loaded defaults match the documented module constants', () => {
    const c = mod.speechController;
    expect(c.currentRate).toBe(mod.SPEECH_RATE_DEFAULT);
    expect(c.currentWaitForSpeech).toBe(true);
    expect(c.currentPostSpeechDelayMs).toBe(mod.SPEECH_POST_DELAY_DEFAULT);
  });

  it('speak() applies the current rate to the new utterance', () => {
    const c = mod.speechController;
    c.toggle();
    c.setRate(1.75);
    c.speak('rate-check');
    expect(lastQueued().rate).toBe(1.75);
    c.stop();
  });

  function lastQueued(): SpeechSynthesisUtterance {
    const synth = speechSynthesis as unknown as { speak: ReturnType<typeof vi.fn> };
    const calls = synth.speak.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][0] as SpeechSynthesisUtterance;
  }
});

function makeStubSpeechSynthesis(): {
  getVoices: () => SpeechSynthesisVoice[];
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  speaking: boolean;
  paused: boolean;
  pending: boolean;
  onvoiceschanged: null;
} {
  return {
    getVoices: () => [
      {
        lang: 'zh-CN',
        name: 'zh',
        voiceURI: 'zh',
        localService: true,
        default: true,
      },
    ] as SpeechSynthesisVoice[],
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    speaking: false,
    paused: false,
    pending: false,
    onvoiceschanged: null,
  };
}

async function flushMicro(): Promise<void> {
  await Promise.resolve();
}
