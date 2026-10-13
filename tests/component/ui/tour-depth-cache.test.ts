/**
 * @vitest-environment jsdom
 *
 * 漫游深度档位的默认值（第三档"重点"）与 localStorage 持久化。
 *
 * 注意：import '@/ui/tour-controller' 会经由 graph-stats → perf-monitor 的
 * 模块链，在模块初始化时就调用 requestAnimationFrame——jsdom 默认不提供，
 * 所以必须像 tour-controller.test.ts 那样在导入前打 rAF 桩。
 */

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { describe, it, expect, beforeEach } from 'vitest';
import { loadTourDepth, saveTourDepth, TOUR_DEPTH_DEFAULT } from '@/ui/tour-controller';

describe('漫游深度档位持久化（默认第三档 + localStorage 缓存）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('默认档位为 3（重点），无缓存时返回第三档', () => {
    expect(TOUR_DEPTH_DEFAULT).toBe(3);
    expect(loadTourDepth()).toBe(3);
  });

  it('保存后读取返回用户选择的档位（跨刷新恢复）', () => {
    saveTourDepth(4);
    expect(loadTourDepth()).toBe(4);
    saveTourDepth(1);
    expect(loadTourDepth()).toBe(1);
  });

  it('非法 / 越界缓存值回退到默认第三档', () => {
    localStorage.setItem('pg:tour:depth', '0');
    expect(loadTourDepth()).toBe(3);
    localStorage.setItem('pg:tour:depth', '6');
    expect(loadTourDepth()).toBe(3);
    localStorage.setItem('pg:tour:depth', 'abc');
    expect(loadTourDepth()).toBe(3);
    localStorage.setItem('pg:tour:depth', '2.5');
    expect(loadTourDepth()).toBe(3);
  });
});
