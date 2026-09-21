/**
 * @vitest-environment jsdom
 *
 * Regression tests for the mobile bottom-sheet accordions (高级设置 / 布局设置).
 *
 * Reported bug: the 高级设置 chevron stayed pointing right after expanding.
 * `toggleBsAdvanced()` toggled only `collapsed` (which hides the body) and
 * never `open`, while the rotation rule is
 * `.bs-advanced.open .bs-advanced__chev { transform: rotate(90deg) }` — so the
 * arrow could never turn. restore() forgot `open` as well, and reset() cleared
 * the stored preference without touching the DOM.
 *
 * Contract pinned here: for both accordions the class pair (`collapsed` /
 * `open`), `aria-expanded` and the stored preference always move together.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  toggleBsAdvanced,
  toggleBsLayoutSetting,
  restoreBsAdvancedPrefs,
  restoreBsLayoutSettingPrefs,
  resetBsAdvancedPrefs,
} from '@/ui/layout/layout-params';
import {
  getMobileAdvancedOpen,
  getMobileLayoutSettingOpen,
  setMobileAdvancedOpen,
  setMobileLayoutSettingOpen,
} from '@/ui/layout/layout-store';

function setupDom(): void {
  document.body.innerHTML = `
    <div class="bs-advanced collapsed" id="bs-advanced">
      <button class="bs-advanced__head" id="bs-advanced-toggle" aria-expanded="false">
        <span class="bs-advanced__title"><svg class="bs-advanced__chev"></svg><span>高级设置</span></span>
      </button>
      <div class="bs-advanced__body" id="bs-advanced-body">
        <div class="bs-layout-setting collapsed" id="bs-layout-setting">
          <button class="bs-layout-setting__head" id="bs-layout-setting-toggle" aria-expanded="false">
            <span class="bs-layout-setting__title">布局设置</span><svg class="bs-layout-setting__chev"></svg>
          </button>
          <div class="bs-layout-setting__body" id="bs-layout-setting-body">
            <div class="bs-layout-params" id="bs-layout-params"></div>
          </div>
        </div>
      </div>
    </div>`;
}

const adv = () => document.getElementById('bs-advanced') as HTMLElement;
const advHead = () => document.getElementById('bs-advanced-toggle') as HTMLElement;
const sub = () => document.getElementById('bs-layout-setting') as HTMLElement;
const subHead = () => document.getElementById('bs-layout-setting-toggle') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  setupDom();
});

describe('mobile bottom-sheet accordions', () => {
  it('高级设置: open/close keeps collapsed, open and aria in sync', () => {
    toggleBsAdvanced();
    expect(adv().classList.contains('open')).toBe(true);
    expect(adv().classList.contains('collapsed')).toBe(false);
    expect(advHead().getAttribute('aria-expanded')).toBe('true');
    expect(getMobileAdvancedOpen()).toBe(true);

    toggleBsAdvanced();
    expect(adv().classList.contains('open')).toBe(false);
    expect(adv().classList.contains('collapsed')).toBe(true);
    expect(advHead().getAttribute('aria-expanded')).toBe('false');
    expect(getMobileAdvancedOpen()).toBe(false);
  });

  it('布局设置: same contract for the nested sub-accordion', () => {
    toggleBsLayoutSetting();
    expect(sub().classList.contains('open')).toBe(true);
    expect(sub().classList.contains('collapsed')).toBe(false);
    expect(subHead().getAttribute('aria-expanded')).toBe('true');
    expect(getMobileLayoutSettingOpen()).toBe(true);

    toggleBsLayoutSetting();
    expect(sub().classList.contains('open')).toBe(false);
    expect(sub().classList.contains('collapsed')).toBe(true);
    expect(subHead().getAttribute('aria-expanded')).toBe('false');
  });

  it('restore replays the stored preference into classes + aria', () => {
    setMobileAdvancedOpen(true);
    setMobileLayoutSettingOpen(true);
    restoreBsAdvancedPrefs();

    expect(adv().classList.contains('open')).toBe(true);
    expect(adv().classList.contains('collapsed')).toBe(false);
    expect(advHead().getAttribute('aria-expanded')).toBe('true');
    expect(sub().classList.contains('open')).toBe(true);
    expect(subHead().getAttribute('aria-expanded')).toBe('true');
  });

  it('restore leaves the accordions collapsed when no preference is stored', () => {
    restoreBsAdvancedPrefs();

    expect(adv().classList.contains('open')).toBe(false);
    expect(adv().classList.contains('collapsed')).toBe(true);
    expect(sub().classList.contains('open')).toBe(false);
    expect(sub().classList.contains('collapsed')).toBe(true);
  });

  it('reset clears the stored flags AND collapses both accordions in the DOM', () => {
    toggleBsAdvanced();
    toggleBsLayoutSetting();
    expect(adv().classList.contains('open')).toBe(true);
    expect(sub().classList.contains('open')).toBe(true);

    resetBsAdvancedPrefs();

    expect(getMobileAdvancedOpen()).toBe(false);
    expect(getMobileLayoutSettingOpen()).toBe(false);
    expect(adv().classList.contains('open')).toBe(false);
    expect(adv().classList.contains('collapsed')).toBe(true);
    expect(advHead().getAttribute('aria-expanded')).toBe('false');
    expect(sub().classList.contains('open')).toBe(false);
    expect(sub().classList.contains('collapsed')).toBe(true);
    expect(subHead().getAttribute('aria-expanded')).toBe('false');
  });

  it('restoreBsLayoutSettingPrefs only touches the sub-accordion', () => {
    setMobileLayoutSettingOpen(true);
    restoreBsLayoutSettingPrefs();

    expect(sub().classList.contains('open')).toBe(true);
    expect(subHead().getAttribute('aria-expanded')).toBe('true');
    expect(adv().classList.contains('collapsed')).toBe(true);
    expect(adv().classList.contains('open')).toBe(false);
  });
});
