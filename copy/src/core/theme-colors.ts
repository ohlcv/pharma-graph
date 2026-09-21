// src/core/theme-colors.ts
// 把 CSS 主题变量（base.css 里的 --accent / --accent2）读成 JS 字符串，
// 给 cytoscape 样式表和 glow-overlay 用——它们画在 canvas 上，写不了 `var(--accent)`。
//
// 只有两个"交互状态"色跟主题走：
//   accent  主色  → 悬停边框、glow 兜底色
//   accent2 辅色  → 选中 / 高亮 / 脉冲 / 高亮边 / 漫游路径预览
// 节点填充色、子树边框色、边类型色是语义色，不在这里，不随主题变。
//
// 取不到（测试环境 / CSS 没加载）时回退到改造前写死的靛蓝 + 琥珀，
// 所以没有 DOM 的环境和旧测试的行为与之前完全一致。

export interface ThemeColors {
  accent: string;
  accent2: string;
}

const FALLBACK: ThemeColors = { accent: '#818cf8', accent2: '#fbbf24' };

export function readThemeColors(): ThemeColors {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return { ...FALLBACK };
  }
  const cs = getComputedStyle(document.documentElement);
  return {
    accent: cs.getPropertyValue('--accent').trim() || FALLBACK.accent,
    accent2: cs.getPropertyValue('--accent2').trim() || FALLBACK.accent2,
  };
}

/** 当前主题色的指纹：变了才需要重建样式表。 */
export function themeKey(): string {
  const c = readThemeColors();
  return `${c.accent}|${c.accent2}`;
}
