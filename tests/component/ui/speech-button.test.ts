// Regression tests for the DOM side-effects of src/ui/speech.ts.
//
// vi.mock-based tests in speech.test.ts cover the public API surface; this
// file covers the *button* side effects (classList, aria-pressed, disabled,
// title) which require a real DOM.
//
// Specifically: when speechSynthesis is unsupported (e.g. WeChat X5/TBS on
// Android), updateButtonState() must set the button to `disabled` so users
// see a clear visual cue instead of wondering why clicks have no effect.

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * @vitest-environment jsdom
 */

/**
 * @vitest-environment jsdom
 */

// We want to import the REAL speech.ts module (not a vi.mock), then poke at
// its `supported` state via a stub we install on globalThis.speechSynthesis.
// jsdom does not ship SpeechSynthesis, so we have to install a stub before
// the module-under-test is loaded.

interface SpeechStub {
  speakCalls: Array<{ text: string; volume: number }>;
  cancelCalls: number;
}

function installStub(stub: SpeechStub | null) {
  if (!stub) {
    delete (globalThis as Record<string, unknown>).speechSynthesis;
    return;
  }

  // Provide a working utterance factory
  const UtteranceCtor = function (this: Record<string, unknown>, text: string) {
    this.text = text;
    this.volume = 1;
    this.rate = 1;
    this.pitch = 1;
    this.lang = '';
    this.voice = null;
    this.addEventListener = () => {};
    this.removeEventListener = () => {};
  } as unknown as typeof SpeechSynthesisUtterance;

  const synth: SpeechSynthesis = {
    getVoices: () => [],
    speak(u) {
      stub.speakCalls.push({
        text: (u as Record<string, unknown>).text as string,
        volume: (u as Record<string, unknown>).volume as number,
      });
    },
    cancel() { stub.cancelCalls += 1; },
    pause() {},
    resume() {},
    onvoiceschanged: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  };

  (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = UtteranceCtor;
  (globalThis as Record<string, unknown>).speechSynthesis = synth;
}

describe('speech button DOM side-effects (jsdom)', () => {
  beforeEach(() => {
    // Reset the button between tests
    document.body.innerHTML = `
      <button class="tour-dt__btn tour-dt__btn--speech" data-tour-action="toggle-speech">
        <span class="spk-off">off</span>
        <span class="spk-on">on</span>
      </button>
    `;
    // speech.ts is a module-level singleton. Without resetting modules, the
    // SpeechController cached from the previous test would reuse the old
    // speechSynthesis reference (e.g. null after test #1). Reset so each test
    // constructs a fresh controller from its own stub.
    vi.resetModules();
  });

  it('sets disabled=true and aria-disabled=true when API is unsupported', async () => {
    installStub(null);
    const { speechController } = await import('@/ui/speech');

    // The constructor ran probeSpeechApi() which returned false because we
    // deleted speechSynthesis. Calling toggle() exercises updateButtonState().
    speechController.toggle();

    const btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.classList.contains('active')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.title).toMatch(/不支持朗读/);
  });

  it('does NOT set disabled when API is supported and toggle was never called', async () => {
    installStub({ speakCalls: [], cancelCalls: 0 });
    await import('@/ui/speech');

    const btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBeNull();
  });

  it('sets disabled when speak() throws mid-call (X5/TBS fail-silent)', async () => {
    installStub({ speakCalls: [], cancelCalls: 0 });
    const { speechController } = await import('@/ui/speech');

    expect(speechController.isSupported).toBe(true);

    // Make the next speak() throw
    (globalThis.speechSynthesis as unknown as { speak: () => void }).speak = () => {
      throw new Error('speak boom');
    };

    // Trigger toggle() so active=true, then speak() to throw
    speechController.toggle();
    speechController.speak('test');

    const btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(true);
    expect(speechController.isSupported).toBe(false);
  });
});
