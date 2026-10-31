import { describe, it, expect } from 'vitest';
import {
  CHAOS_ATTRACTOR_ID,
  ChaosAttractorOverlay,
  createChaosAttractorOverlay,
} from '../../../src/core/spectacle/chaos-attractor-island-overlay.js';

describe('chaos-attractor-island-overlay / 节点与生命周期契约', () => {
  it('节点 id 固定为 chaos-attractor-island', () => {
    expect(CHAOS_ATTRACTOR_ID).toBe('chaos-attractor-island');
  });

  it('导出工厂函数，且实例提供 reroll / destroy 生命周期方法', () => {
    expect(typeof createChaosAttractorOverlay).toBe('function');
    expect(typeof ChaosAttractorOverlay.prototype.reroll).toBe('function');
    expect(typeof ChaosAttractorOverlay.prototype.destroy).toBe('function');
  });
});
