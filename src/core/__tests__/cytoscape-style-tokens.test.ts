/**
 * 模拟 cytoscape 的 line-gradient-stop-colors 解析:
 * 1. value.split(/\s+/) 把整个 string 按空白拆 token
 * 2. 每个 token 用 rgba/hex regex 解析
 * 3. 任一 token 失败 → 整个属性 invalid, 输出 warn
 *
 * 这就是浏览器里 "The style property `line-gradient-stop-colors: rgba(149,` is invalid"
 * 出现的原因 — split 把 rgba(...) 拆开了, 首段 "rgba(149," 不匹配.
 *
 * 测所有 EDGE_TYPE_STYLE 的 line-gradient-stop-colors 都能通过 — 不再回退到回滚方案.
 */
import { describe, it, expect } from 'vitest';
import { EDGE_TYPE_STYLE, NODE_TYPE_COLOR } from '../config';

const RGBA_RE = new RegExp(
  '^' +
  'rgb[a]?\\((-?\\d+(?:\\.\\d+)?[%]?)\\s*,\\s*' +
  '(-?\\d+(?:\\.\\d+)?[%]?)\\s*,\\s*' +
  '(-?\\d+(?:\\.\\d+)?[%]?)' +
  '(?:\\s*,\\s*(-?\\d+(?:\\.\\d+)?))?\\)$'
);

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const parseToken = (tok: string): boolean => {
  if (HEX_RE.test(tok)) return true;
  return RGBA_RE.test(tok);
};

describe('cytoscape stylesheet color tokens (split on whitespace)', () => {
  it('EDGE_TYPE_STYLE — every type produces a parseable stop-colors string', () => {
    for (const [type, s] of Object.entries(EDGE_TYPE_STYLE)) {
      // 模拟 renderer 生成的 stop-colors (darken 版本)
      const hex = s.color;
      const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 80);
      const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 80);
      const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 80);
      const dark = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      const stopColors = `${hex} ${dark}`;

      const tokens = stopColors.split(/\s+/);
      for (const tok of tokens) {
        expect(parseToken(tok), `EDGE_TYPE_STYLE[${type}] token "${tok}" not parseable`).toBe(true);
      }
    }
  });

  it('NODE_TYPE_COLOR — every essence produces a parseable hex fill', () => {
    // 节点填充色由 essence 决定（取代已废弃的 NODE_TIER_STYLE）。
    // bgColor 来自 NODE_TYPE_COLOR，必须是合法 hex 才能 cytoscape 渲染。
    for (const [essence, color] of Object.entries(NODE_TYPE_COLOR)) {
      expect(HEX_RE.test(color), `NODE_TYPE_COLOR[${essence}] "${color}" must be hex`).toBe(true);
    }
  });

  it('regression — the OLD rgba-with-spaces pattern WOULD fail (proves split is the bug)', () => {
    // 这是历史 bug: hexToRgba 出来的 "rgba(149, 165, 166, 1) rgba(80, 96, 97, 0.25)"
    // split(/\s+/) 后第一个 token 是 "rgba(149," — 不能 parse.
    const bad = 'rgba(149, 165, 166, 1) rgba(80, 96, 97, 0.25)';
    const tokens = bad.split(/\s+/);
    expect(parseToken(tokens[0])).toBe(false); // "rgba(149," fails
  });
});