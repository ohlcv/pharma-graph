// Tests for the `parseBodySections` panel-section parser.
// The parser runs the same marked lexer as the renderer, so headings are
// recognised by Markdown rules (fenced code blocks, setext, etc.) instead of
// a line regex. Content before the first H2 — and bodies with no H2 at all —
// are kept as `intro`, never dropped.
//
// Issue #8: the parser used to drop sections whose title matched a
// hard-coded Chinese question string. The sentinel design hides a section
// only when the author explicitly inserts the `<!-- @np-skip -->` HTML
// comment on the line immediately before its H2.
//
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseBodySections } from '@/ui/detail-panel';

describe('parseBodySections', () => {
  it('returns each H2 as a label/answer pair', () => {
    const body = ['## 第一个问题', '答案是 A。', '', '## 第二个问题', '答案是 B。'].join('\n');
    const { intro, sections } = parseBodySections(body);
    expect(intro).toBe('');
    expect(sections.map((s) => s.label)).toEqual(['第一个问题', '第二个问题']);
    expect(sections.map((s) => s.answer)).toEqual(['答案是 A。', '答案是 B。']);
  });

  it('keeps the preamble before the first H2 instead of dropping it', () => {
    const body = ['# 文档标题', '', '开头导语。', '', '## 第一节', '', '内容 A。'].join('\n');
    const { intro, sections } = parseBodySections(body);
    expect(intro).toContain('# 文档标题');
    expect(intro).toContain('开头导语。');
    expect(sections).toEqual([{ label: '第一节', answer: '内容 A。' }]);
  });

  it('returns a body without H2 as intro, not as an empty result', () => {
    const { intro, sections } = parseBodySections('正文没有 H2 章节。');
    expect(intro).toBe('正文没有 H2 章节。');
    expect(sections).toEqual([]);
  });

  it('does not treat "## " inside a fenced code block as a section boundary', () => {
    const body = ['```md', '## 不是标题', '```', '', '## 真标题', '内容。'].join('\n');
    const { intro, sections } = parseBodySections(body);
    expect(intro).toContain('## 不是标题');
    expect(sections.map((s) => s.label)).toEqual(['真标题']);
  });

  it('keeps H3 and deeper headings inside the enclosing H2 answer', () => {
    const body = ['## 第一节', '', '### 小节', '', '正文。', '', '## 第二节', '答案。'].join('\n');
    const { sections } = parseBodySections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0].answer).toContain('### 小节');
    expect(sections[1].answer).toBe('答案。');
  });

  it('keeps a section whose title coincidentally matches the old hard-coded wording', () => {
    const body = ['## 它在整套框架里属于哪一层、放在哪一块？', '这是一段真实回答，不该被吞。'].join(
      '\n',
    );
    const { sections } = parseBodySections(body);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('它在整套框架里属于哪一层、放在哪一块？');
    expect(sections[0].answer).toBe('这是一段真实回答，不该被吞。');
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
    const { intro, sections } = parseBodySections(body);
    expect(intro).toBe('');
    expect(sections.map((s) => s.label)).toEqual(['保留的问题', '再来一个保留']);
    expect(sections[0].answer).toBe('应保留。');
    expect(sections[1].answer).toBe('也应保留。');
  });

  it('only skips the flagged H2, not every following section', () => {
    const body = [
      '<!-- @np-skip -->',
      '## 第一个被隐藏',
      '隐藏一。',
      '',
      '## 第二个不该被隐藏',
      '保留。',
    ].join('\n');
    const { sections } = parseBodySections(body);
    expect(sections.map((s) => s.label)).toEqual(['第二个不该被隐藏']);
  });

  it('treats the sentinel as a no-op when it appears inside an answer, not before an H2', () => {
    const body = [
      '## 第一个问题',
      '答案里恰好写了 <!-- @np-skip --> 这串文本。',
      '',
      '## 第二个问题',
      '正常回答。',
    ].join('\n');
    const { sections } = parseBodySections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0].answer).toContain('<!-- @np-skip -->');
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
    const { sections } = parseBodySections(body);
    expect(sections.map((s) => s.label)).toEqual(['正常问题']);
  });
});
