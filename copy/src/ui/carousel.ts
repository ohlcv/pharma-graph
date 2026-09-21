/**
 * BrandCarousel — 顶部文字渐变轮播模块
 *
 * 使用方式:
 *   import { brandCarousel } from './carousel';
 *   brandCarousel.start();   // 启动轮播
 *   brandCarousel.stop();    // 停止轮播
 *   brandCarousel.setMessages([...]); // 运行时切换词汇表（按层筛选）
 *   brandCarousel.setDiscipline(id); // 运行时只看某一学科
 *
 * 词汇表数据来自 src/data/vocabulary.ts，只需修改该文件即可增删内容。
 */

import { MESSAGES, DisciplineLayer } from '../data/vocabulary.js';

export type { Term, DisciplineNode, DisciplineLayer } from '../data/vocabulary.js';

export interface CarouselOptions {
  showMs?: number;
  fadeMs?: number;
  gradient?: string;
  textId?: string;
}

const DEFAULT_GRADIENT =
  'linear-gradient(90deg, #a78bfa 0%, #67e8f9 40%, #f9a8d4 70%, #a78bfa 100%)';

const DEFAULT_OPTIONS: Required<CarouselOptions> = {
  showMs: 3000,
  fadeMs: 450,
  gradient: DEFAULT_GRADIENT,
  textId: 'carousel-text',
};

function buildFlatList(messages: DisciplineLayer[]): string[] {
  return messages.flatMap((l) =>
    l.disciplines.flatMap((d) => d.terms.map((t) => t.name))
  );
}

export const brandCarousel = (() => {
  let timer: ReturnType<typeof setInterval> | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let opts: Required<CarouselOptions> = { ...DEFAULT_OPTIONS };
  let flat: string[] = [];
  let idx = 0;
  let running = false;

  function nextIdx(): number {
    if (flat.length <= 1) return 0;
    let next = Math.floor(Math.random() * flat.length);
    if (next === idx) next = (next + 1) % flat.length;
    return next;
  }

  function cycle(): void {
    const el = document.getElementById(opts.textId);
    if (!el) return;

    el.classList.add('is-hidden');
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      idx = nextIdx();
      el.textContent = flat[idx];
      el.classList.remove('is-hidden');
    }, opts.fadeMs);
  }

  return {
    start(opt?: CarouselOptions): void {
      if (running) return;
      opts = { ...DEFAULT_OPTIONS, ...opt };
      flat = buildFlatList(MESSAGES);

      const el = document.getElementById(opts.textId);
      if (!el) return;

      idx = nextIdx();
      el.textContent = flat[idx];
      el.classList.remove('is-hidden');

      el.style.background = opts.gradient;
      el.style.webkitBackgroundClip = 'text';
      el.style.backgroundClip = 'text';
      el.style.webkitTextFillColor = 'transparent';

      timer = setInterval(cycle, opts.showMs + opts.fadeMs);
      running = true;
    },

    stop(): void {
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (fadeTimer !== null) { clearTimeout(fadeTimer); fadeTimer = null; }
      running = false;
    },

    setMessages(groups: DisciplineLayer[]): void {
      const newFlat = buildFlatList(groups);
      if (idx >= newFlat.length) idx = 0;
      flat = newFlat;
      const el = document.getElementById(opts.textId);
      if (el) el.textContent = flat[idx];
    },

    setDiscipline(id: string): void {
      const node = MESSAGES.flatMap((l) => l.disciplines).find((d) => d.id === id);
      if (node) {
        const newFlat = node.terms.map((t) => t.name);
        if (idx >= newFlat.length) idx = 0;
        flat = newFlat;
        const el = document.getElementById(opts.textId);
        if (el) el.textContent = flat[idx];
      }
    },

    setLayer(name: string): void {
      const layer = MESSAGES.find((l) => l.name === name);
      if (layer) this.setMessages([layer]);
    },

    isRunning(): boolean {
      return running;
    },

    getGroups(): DisciplineLayer[] {
      return MESSAGES;
    },
  };
})();
