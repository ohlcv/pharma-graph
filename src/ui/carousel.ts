/**
 * BrandCarousel — 顶部文字渐变轮播模块
 *
 * 使用方式:
 *   import { brandCarousel } from './carousel';
 *   brandCarousel.start();   // 启动轮播
 *   brandCarousel.stop();    // 停止轮播
 *   brandCarousel.setMessages([...]); // 运行时切换词汇表
 *
 * 词汇表分组结构:
 *   每个分组包含 label（分组标签，仅在 DOM 中用于标识，方便维护）和 items（该分组的词汇数组）。
 *   运行时会按顺序遍历所有分组的所有词汇。
 *   只需修改 MESSAGES 常量即可增删分组和词汇，无需动其他代码。
 */

export interface CarouselMessage {
  label: string;
  items: string[];
}

export interface CarouselOptions {
  showMs?: number;   // 每条显示时长（毫秒），默认 3000
  fadeMs?: number;   // 淡入淡出时长（毫秒），默认 450
  gradient?: string;  // CSS linear-gradient，默认紫青粉渐变
  textId?: string;    // 目标元素 id，默认 'carousel-text'
}

const DEFAULT_GRADIENT =
  'linear-gradient(90deg, #a78bfa 0%, #67e8f9 40%, #f9a8d4 70%, #a78bfa 100%)';

const DEFAULT_OPTIONS: Required<CarouselOptions> = {
  showMs: 3000,
  fadeMs: 450,
  gradient: DEFAULT_GRADIENT,
  textId: 'carousel-text',
};

// ─── 词汇表 — 修改这里即可定制轮播内容 ───────────────────────────────────────
const MESSAGES: CarouselMessage[] = [
  // 信息论
  { label: '信息论', items: ['信息熵', '互信息', '信道容量', '条件熵', 'KL散度', '交叉熵', '信息增益', '率失真'] },
  // 系统论
  { label: '系统论', items: ['反馈回路', '涌现性', '自组织', '系统边界', '稳态收敛', '相变临界', '混沌边缘'] },
  // 图论
  { label: '图论', items: ['邻接矩阵', '最短路径', '谱半径', '介数中心', 'PageRank', '社区检测', '团块分解', '欧拉回路'] },
  // 概率论
  { label: '概率论', items: ['贝叶斯推断', '最大似然', '后验分布', '共轭先验', '大数定律', '中心极限定理', '马尔可夫链', '平稳分布'] },
  // 计算机科学
  { label: '计算机', items: ['复杂度类', 'NP完全', '近似算法', '贪心策略', '动态规划', '分布式共识', 'CAP定理', '一致性哈希'] },
  // 神经科学
  { label: '神经科学', items: ['神经振荡', '同步爆发', '默认模式', '工作记忆', '突触可塑', '长时增强', '皮层柱', '格兰杰因果'] },
  // 禅宗
  { label: '禅宗', items: ['平常心', '不住相', '无所得', '应无所住', '生其心', '法尚应舍', '言语道断', '心行处灭'] },
  // 唯识宗
  { label: '唯识宗', items: ['阿赖耶识', '末那识', '我法二执', '三能变', '四分说', '相见二分', '种现熏生', '转识成智'] },
  // 净土宗
  { label: '净土宗', items: ['信愿行', '极乐净土', '名号功德', '三辈九品', '带业往生', '不退转位', '临终助念', '一念往生'] },
];
// ─────────────────────────────────────────────────────────────────────────────

function buildFlatList(): string[] {
  return MESSAGES.flatMap((g) => g.items);
}

export const brandCarousel = (() => {
  let timer: ReturnType<typeof setInterval> | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let opts: Required<CarouselOptions> = { ...DEFAULT_OPTIONS };
  let flat: string[] = [];
  let idx = 0;
  let running = false;

  function cycle(): void {
    const el = document.getElementById(opts.textId);
    if (!el) return;

    el.classList.add('is-hidden');
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      idx = (idx + 1) % flat.length;
      el.textContent = flat[idx];
      el.classList.remove('is-hidden');
    }, opts.fadeMs);
  }

  return {
    /**
     * 启动轮播（幂等：重复调用无副作用）
     */
    start(opt?: CarouselOptions): void {
      if (running) return;
      opts = { ...DEFAULT_OPTIONS, ...opt };
      flat = buildFlatList();

      const el = document.getElementById(opts.textId);
      if (!el) return;

      el.textContent = flat[0];
      el.classList.remove('is-hidden');

      // 应用渐变色
      el.style.background = opts.gradient;
      el.style.webkitBackgroundClip = 'text';
      el.style.backgroundClip = 'text';
      el.style.webkitTextFillColor = 'transparent';

      timer = setInterval(cycle, opts.showMs + opts.fadeMs);
      running = true;
    },

    /**
     * 停止轮播
     */
    stop(): void {
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (fadeTimer !== null) { clearTimeout(fadeTimer); fadeTimer = null; }
      running = false;
    },

    /**
     * 运行时切换词汇表（保持当前进度位置）
     */
    setMessages(groups: CarouselMessage[]): void {
      const newFlat = groups.flatMap((g) => g.items);
      // 如果当前索引超出新列表范围则归零
      if (idx >= newFlat.length) idx = 0;
      flat = newFlat;
      const el = document.getElementById(opts.textId);
      if (el) el.textContent = flat[idx];
    },

    /** 当前是否在运行 */
    isRunning(): boolean {
      return running;
    },

    /** 导出分组数据，供外部引用 */
    getGroups(): CarouselMessage[] {
      return MESSAGES;
    },
  };
})();
