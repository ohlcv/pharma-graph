import { describe, it, expect } from 'vitest';
import { knownSilentWebViewLabel } from '@/ui/speech';

describe('knownSilentWebViewLabel — 哑巴/残缺 TTS 内核识别', () => {
  it('苹果设备（iPhone/iPad）一律不点名，避免误导', () => {
    // iOS 夸克/UC/微信其实都是 WebKit，TTS 正常
    expect(
      knownSilentWebViewLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.40',
      ),
    ).toBeNull();
    expect(
      knownSilentWebViewLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Quark/5.9',
      ),
    ).toBeNull();
    expect(
      knownSilentWebViewLabel(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      ),
    ).toBeNull();
  });

  it('macOS（非 iOS）浏览器不点名', () => {
    expect(
      knownSilentWebViewLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      ),
    ).toBeNull();
  });

  it('微信内置浏览器（X5/TBS 内核）点名内核', () => {
    const label = knownSilentWebViewLabel(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile MicroMessenger/8.0.40 XWEB/11300',
    );
    expect(label).toMatch(/微信内置浏览器/);
    expect(label).toMatch(/X5\/TBS/);
  });

  it('夸克浏览器（U4 内核）点名', () => {
    expect(
      knownSilentWebViewLabel(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Quark/5.9.0',
      ),
    ).toMatch(/夸克/);
  });

  it('UC 浏览器点名', () => {
    expect(
      knownSilentWebViewLabel(
        'Mozilla/5.0 (Linux; U; Android 14; zh-cn) AppleWebKit/537.36 UCBrowser/13.4.0',
      ),
    ).toMatch(/UC/);
  });

  it('安卓 Chrome / 常规浏览器不点名', () => {
    expect(
      knownSilentWebViewLabel(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
      ),
    ).toBeNull();
  });
});
