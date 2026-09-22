// Regression tests for the DOM side-effects of src/ui/speech.ts.
//
// vi.mock-based tests in speech.test.ts cover the public API surface; this
// file covers the *button* side effects (classList, aria-pressed, disabled,
// title) which require a real DOM.
//
// Design note: We deliberately do NOT set btn.disabled = true when the API
// is unsupported (X5/TBS, U4/Quark, etc.). Disabling caused more problems
// than it solved:
//   - On Quark (U4), unlock throws synchronously; previously this flipped
//     supported=false and greyed out the button — the user couldn't toggle.
//   - On X5/TBS, the API exists but produces no audio; previously greyed
//     out after a failure-streak of 3.
// Now: button stays clickable in all cases. The title hints at compatibility
// ("当前浏览器可能不支持朗读"), but the active-state visual highlight always works.

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

  it('button is NEVER disabled, even when API is unsupported', async () => {
    installStub(null);
    const { speechController } = await import('@/ui/speech');

    expect(speechController.isSupported).toBe(false);
    speechController.toggle();

    const btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(false);
    expect(btn.hasAttribute('aria-disabled')).toBe(false);
    // Title still hints at the compatibility issue
    expect(btn.title).toMatch(/不支持朗读/);
  });

  it('button gets active class + aria-pressed=true when toggled ON (supported API)', async () => {
    installStub({ speakCalls: [], cancelCalls: 0 });
    const { speechController } = await import('@/ui/speech');

    speechController.toggle();
    const btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.classList.contains('active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.disabled).toBe(false);
  });

  it('button stays enabled even after speak() throws (Quark/UC scenario)', async () => {
    installStub({ speakCalls: [], cancelCalls: 0 });
    const { speechController } = await import('@/ui/speech');

    speechController.toggle();

    // Simulate Quark: every speak() throws synchronously
    (globalThis.speechSynthesis as unknown as { speak: () => void }).speak = () => {
      throw new Error('speak boom');
    };

    // Even after many failures the button must stay enabled
    for (let i = 0; i < 10; i += 1) {
      speechController.speak(`test ${i}`);
    }

    const btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains('active')).toBe(true); // user intent preserved
  });

  it('toggle works as expected on a normal browser (iOS/Chrome)', async () => {
    installStub({ speakCalls: [], cancelCalls: 0 });
    const { speechController } = await import('@/ui/speech');

    expect(speechController.isActive).toBe(false);
    speechController.toggle();
    expect(speechController.isActive).toBe(true);
    speechController.toggle();
    expect(speechController.isActive).toBe(false);

    const btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.classList.contains('active')).toBe(false);
    expect(btn.disabled).toBe(false);
  });

  it('unlock utterance throwing does not affect button state', async () => {
    installStub({ speakCalls: [], cancelCalls: 0 });
    const { speechController } = await import('@/ui/speech');

    let callCount = 0;
    (globalThis.speechSynthesis as unknown as { speak: (u: SpeechSynthesisUtterance) => void }).speak = () => {
      callCount += 1;
      if (callCount === 1) throw new Error('unlock boom');
    };

    speechController.toggle();           // unlock → throws

    const btn = document.querySelector<HTMLButtonElement>('[data-tour-action="toggle-speech"]')!;
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains('active')).toBe(true); // active state still applied
  });
});
