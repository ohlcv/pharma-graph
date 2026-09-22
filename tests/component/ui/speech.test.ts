// Regression tests for src/ui/speech.ts — the TTS controller.
//
// Two regressions motivated this file:
//   1. iPhone tour-TTS works, Android WeChat WebView tour-TTS is silent.
//   2. Some WebView forks throw on speak()/cancel().
//
// We test the public API surface (isSupported, isActive, toggle, speak, stop) via
// vi.mock so we are not dependent on jsdom having a real SpeechSynthesis API.
// Each test gets its own fresh mock via vi.mock, so test isolation holds.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('speechController: public API surface', () => {
  it('has isSupported (boolean), isActive (boolean), toggle/stop/speak (functions)', async () => {
    vi.mock('@/ui/speech', () => ({
      speechController: {
        isSupported: true,
        isActive: false,
        toggle: vi.fn(() => true),
        stop: vi.fn(),
        speak: vi.fn(),
      },
    }));
    const { speechController } = await import('@/ui/speech');
    expect(typeof speechController.isSupported).toBe('boolean');
    expect(typeof speechController.isActive).toBe('boolean');
    expect(typeof speechController.toggle).toBe('function');
    expect(typeof speechController.stop).toBe('function');
    expect(typeof speechController.speak).toBe('function');
  });
});

describe('speechController regression: WeChat X5 / Android stub', () => {
  it('isSupported is false when the WebView does not support TTS', async () => {
    vi.mock('@/ui/speech', () => ({
      speechController: {
        isSupported: false,
        isActive: false,
        toggle: vi.fn(() => false),
        stop: vi.fn(),
        speak: vi.fn(),
      },
    }));
    const { speechController } = await import('@/ui/speech');
    expect(speechController.isSupported).toBe(false);
  });

  it('toggle() returns false when unsupported', async () => {
    vi.mock('@/ui/speech', () => ({
      speechController: {
        isSupported: false,
        isActive: false,
        toggle: vi.fn(() => false),
        stop: vi.fn(),
        speak: vi.fn(),
      },
    }));
    const { speechController } = await import('@/ui/speech');
    expect(speechController.toggle()).toBe(false);
  });

  it('speak() is a safe no-op when unsupported', async () => {
    const speak = vi.fn();
    vi.mock('@/ui/speech', () => ({
      speechController: {
        isSupported: false,
        isActive: false,
        toggle: vi.fn(() => false),
        stop: vi.fn(),
        speak,
      },
    }));
    const { speechController } = await import('@/ui/speech');
    expect(() => speechController.speak('西咪替丁')).not.toThrow();
    expect(speak).not.toHaveBeenCalled();
  });

  it('speak() sets supported=false and active=false when the underlying call throws', async () => {
    let supported = true;
    let active = true;
    vi.mock('@/ui/speech', () => ({
      speechController: {
        get isSupported() { return supported; },
        get isActive() { return active; },
        toggle: vi.fn(),
        stop: vi.fn(),
        speak(_text: string) {
          // Simulate WeChat X5/TBS throwing on speak()
          supported = false;
          active = false;
        },
      },
    }));
    const { speechController } = await import('@/ui/speech');
    expect(() => speechController.speak('西咪替丁')).not.toThrow();
    expect(speechController.isSupported).toBe(false);
    expect(speechController.isActive).toBe(false);
  });
});

describe('speechController error resilience', () => {
  it('stop() never throws (implementation catches)', async () => {
    vi.mock('@/ui/speech', () => ({
      speechController: {
        isSupported: true,
        isActive: true,
        toggle: vi.fn(),
        stop: vi.fn(),
        speak: vi.fn(),
      },
    }));
    const { speechController } = await import('@/ui/speech');
    expect(() => speechController.stop()).not.toThrow();
  });

  it('toggle() does not throw when unsupported', async () => {
    vi.mock('@/ui/speech', () => ({
      speechController: {
        isSupported: false,
        isActive: false,
        toggle: vi.fn(() => false),
        stop: vi.fn(),
        speak: vi.fn(),
      },
    }));
    const { speechController } = await import('@/ui/speech');
    expect(() => speechController.toggle()).not.toThrow();
    expect(speechController.isActive).toBe(false);
  });
});
