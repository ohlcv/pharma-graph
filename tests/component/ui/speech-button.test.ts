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

  it('sets disabled after 3 consecutive speak() throws (failure streak)', async () => {
    installStub({ speakCalls: [], cancelCalls: 0 });
    const { speechController } = await import('@/ui/speech');

    expect(speechController.isSupported).toBe(true);

    // Make every speak() throw synchronously (simulates X5/TBS behavior
    // where the API exists but speak() never produces audio).
    (globalThis.speechSynthesis as unknown as { speak: () => void }).speak = () => {
      throw new Error('speak boom');
    };

    // Trigger toggle() so active=true, then speak() N times to exceed threshold.
    speechController.toggle();

    // 1st failure: still supported (button not disabled)
    speechController.speak('test 1');
    let btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(false);
    expect(speechController.isSupported).toBe(true);

    // 2nd failure: still supported
    speechController.speak('test 2');
    btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(false);
    expect(speechController.isSupported).toBe(true);

    // 3rd failure: threshold reached, now disabled
    speechController.speak('test 3');
    btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(true);
    expect(speechController.isSupported).toBe(false);
  });

  it('does NOT set disabled after a single speak() throw (recovery possible)', async () => {
    // This is the Quark/UC scenario: first speak() throws but later calls
    // succeed. We must not disable the button on a single failure.
    installStub({ speakCalls: [], cancelCalls: 0 });
    const { speechController } = await import('@/ui/speech');

    speechController.toggle();

    // First call throws
    (globalThis.speechSynthesis as unknown as { speak: () => void }).speak = () => {
      throw new Error('speak boom');
    };
    speechController.speak('test 1');

    // Second call succeeds
    (globalThis.speechSynthesis as unknown as { speak: (u: SpeechSynthesisUtterance) => void }).speak = () => {
      // no-op
    };
    speechController.speak('test 2');

    const btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(false);
    expect(speechController.isSupported).toBe(true);
  });

  it('unlock utterance throwing does NOT disable the button', async () => {
    // Quark/UC specifically: rejects unlock utterance (volume=0, single space)
    // but actually speaks real text fine. We must not punish this with disable.
    installStub({ speakCalls: [], cancelCalls: 0 });
    const { speechController } = await import('@/ui/speech');

    // unlock utterance throws; subsequent real-text speaks succeed
    let callCount = 0;
    (globalThis.speechSynthesis as unknown as { speak: (u: SpeechSynthesisUtterance) => void }).speak = () => {
      callCount += 1;
      if (callCount === 1) throw new Error('unlock boom');
      // succeed otherwise
    };

    speechController.toggle();           // calls unlock → throws
    speechController.speak('test 1');    // real speak → succeeds
    speechController.speak('test 2');    // real speak → succeeds

    const btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(false);
    expect(speechController.isSupported).toBe(true);
  });
});
