// Tests for the `parseBodyQuestions` panel-section parser.
// Issue #8: the parser used to drop sections whose title matched a
// hard-coded Chinese question string. That was a fragile string-equality
// check that would silently eat any user-written section with the same
// wording. The new sentinel-based design hides a section only when the
// author has explicitly inserted the `<!-- @np-skip -->` HTML comment
// on the line immediately before its H2.
//
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseBodyQuestions } from './detail-panel.js';

describe('parseBodyQuestions', () => {
  it('returns each H2 as a label/answer pair', () => {
    const body = [
      '## 第一个问题',
      '答案是 A。',
      '',
      '## 第二个问题',
      '答案是 B。',
    ].join('\n');
    const qs = parseBodyQuestions(body);
    expect(qs.map(q => q.label)).toEqual(['第一个问题', '第二个问题']);
    expect(qs.map(q => q.answer)).toEqual(['答案是 A。', '答案是 B。']);
  });

  it('keeps a section whose title coincidentally matches the old hard-coded wording', () => {
    // The pre-fix SKIP set would have silently dropped this. With the
    // sentinel design, the title is just data — no string equality
    // filter runs — so the section is preserved verbatim.
    const body = [
      '## 它在整套框架里属于哪一层、放在哪一块？',
      '这是一段真实回答，不该被吞。',
    ].join('\n');
    const qs = parseBodyQuestions(body);
    expect(qs).toHaveLength(1);
    expect(qs[0].label).toBe('它在整套框架里属于哪一层、放在哪一块？');
    expect(qs[0].answer).toBe('这是一段真实回答，不该被吞。');
  });

  it('drops a section preceded by the @np-skip sentinel', () => {
    const body = [
      '## 保留的问题',
      '应保留。',
      '',
      '<!-- @np-skip -->',
      '## 被隐藏的问题',
      '应隐藏。',
      '',
      '## 再来一个保留',
      '也应保留。',
    ].join('\n');
    const qs = parseBodyQuestions(body);
    expect(qs.map(q => q.label)).toEqual(['保留的问题', '再来一个保留']);
  });

  it('treats the sentinel as a no-op when it appears inside an answer, not before an H2', () => {
    // The sentinel is a *per-section* gate, not a global token. If the
    // comment shows up mid-answer (because an author pasted it inside a
    // code block, say), it must not hide any neighbouring section.
    const body = [
      '## 第一个问题',
      '答案里恰好写了 <!-- @np-skip --> 这串文本。',
      '',
      '## 第二个问题',
      '正常回答。',
    ].join('\n');
    const qs = parseBodyQuestions(body);
    expect(qs).toHaveLength(2);
    expect(qs[0].answer).toContain('<!-- @np-skip -->');
  });

  it('tolerates whitespace variations around the sentinel', () => {
    const body = [
      '<!--@np-skip-->',
      '## 紧凑无空格的 sentinel',
      '应隐藏。',
      '',
      '## 正常问题',
      '保留。',
    ].join('\n');
    const qs = parseBodyQuestions(body);
    expect(qs.map(q => q.label)).toEqual(['正常问题']);
  });

  it('returns an empty array when there are no H2 sections', () => {
    expect(parseBodyQuestions('正文没有 H2 章节。')).toEqual([]);
  });
});