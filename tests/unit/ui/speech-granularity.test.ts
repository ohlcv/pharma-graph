// tests/unit/ui/speech-granularity.test.ts
// Pure-function tests for composeSpeechText + parseSpeechFields — the only
// pure pieces in src/ui/speech.ts. 朗读粒度 is a multi-select field set
// (标题/关联/标签/摘要); these tests pin down both the concatenation order
// (must NOT depend on toggle order) and the legacy single-select → field-set
// migration. 摘要的朗读内容跟随 summaryMode(简短/详细),二者只读其一。
//
// "关联" reads edges_out[*].reason (the human-readable Chinese rationale
// from frontmatter), NOT target. Reading target id was the original bug —
// ids are noise when spoken aloud.

import { describe, it, expect } from 'vitest';
import { composeSpeechText, parseSpeechFields, cleanSummaryForSpeech } from '@/ui/speech';
import type { SpeakableNode } from '@/ui/speech';

describe('cleanSummaryForSpeech: Markdown → speakable plain text', () => {
  it('strips bold / italic / strikethrough / code markers, keeps inner text', () => {
    expect(cleanSummaryForSpeech('**重点**、*斜体*、~~删除~~、`代码`、普通文字')).toBe(
      '重点、斜体、删除、代码、普通文字。',
    );
  });

  it('binds ** before * so bold text is not mangled', () => {
    expect(cleanSummaryForSpeech('**加粗内容**里面的*单个星号*')).toBe('加粗内容里面的单个星号。');
  });

  it('does NOT strip math subscript underscores (z_{n+1}, r_s)', () => {
    // Real data regression: `_x_` is math subscript, not emphasis. Stripping
    // it turned `z_{n+1} = z_n^2` into `z{n+1} = zn^2` — content loss.
    expect(cleanSummaryForSpeech('迭代映射 z_{n+1} = z_n^2 + c')).toBe(
      '迭代映射 z_{n+1} = z_n^2 + c。',
    );
    expect(cleanSummaryForSpeech('光子球 r_s 处有圆轨道')).toBe('光子球 r_s 处有圆轨道。');
  });

  it('turns links into their label only', () => {
    expect(cleanSummaryForSpeech('见[姊妹节点](feat-x)与[文档](https://a.b/c)')).toBe(
      '见姊妹节点与文档。',
    );
  });

  it('flattens GFM table rows to cells joined by ， and rows separated by ；', () => {
    const table = [
      '| 类别 | 等级 | 要求 |',
      '| --- | --- | --- |',
      '| 伴侣 | Class4 | 必须 |',
      '| 父母 | Class3 | 必须 |',
    ].join('\n');
    expect(cleanSummaryForSpeech(table)).toBe(
      '类别，等级，要求；伴侣，Class4，必须；父母，Class3，必须；',
    );
  });

  it('translates heading / list breaks into spoken pauses (。 / ；)', () => {
    const markdown = ['## 头部标题', '', '- 第一项', '- 第二项', '', '1. 有序一', '2. 有序二'].join(
      '\n',
    );
    expect(cleanSummaryForSpeech(markdown)).toBe('头部标题。 第一项；第二项。 有序一；有序二；');
  });

  it('keeps paragraph breaks as 。 so the pause is audible', () => {
    expect(cleanSummaryForSpeech('第一段。\n\n第二段。')).toBe('第一段。 第二段。');
    // A paragraph WITHOUT its own sentence-final punctuation gets one, so
    // the boundary is audible even when the source text omitted it.
    expect(cleanSummaryForSpeech('第一段没有句号\n\n第二段也没有')).toBe(
      '第一段没有句号。 第二段也没有。',
    );
  });

  it('soft line breaks inside a paragraph stay word-joined (no pause)', () => {
    expect(cleanSummaryForSpeech('迭代映射\nz_{n+1} = z_n^2 + c')).toBe(
      '迭代映射 z_{n+1} = z_n^2 + c。',
    );
  });

  it('removes leading/trailing punctuation noise left by stripped rows', () => {
    expect(cleanSummaryForSpeech('---\n正文，\n')).toBe('正文。');
    expect(cleanSummaryForSpeech('，。、正文,')).toBe('正文。');
  });

  it('collapses indentation on list continuation lines', () => {
    expect(cleanSummaryForSpeech('  缩进 文本')).toBe('缩进 文本。');
    expect(cleanSummaryForSpeech('    · 项目符号项')).toBe('· 项目符号项。');
  });
});

describe('composeSpeechText: field combinations × full-node payload', () => {
  const fullNode: SpeakableNode = {
    label: '卡马西平',
    location: {
      book: '个人成长与生存策略',
      chapter: '第一章 认知底色',
      section: '第三节 本体与认知',
    },
    edges_out: [
      { type: 'instance_of', target: 'drug-carbamazepine', reason: '是一种抗癫痫药' },
      { type: 'subclass_of', target: 'cls-sedative-hypnotic', reason: '属于镇静催眠药' },
    ],
    tags: ['肝药酶诱导剂', '窄治疗窗'],
    shortSummary: '短摘要',
    fullSummary: '完整摘要文本',
  };

  it('仅 标题 → 只有 label', () => {
    expect(composeSpeechText(fullNode, ['label'])).toBe('卡马西平');
  });

  it('标题 + 关联 → label + edge reasons joined by 、 (NOT target ids)', () => {
    expect(composeSpeechText(fullNode, ['label', 'edges'])).toBe(
      '卡马西平，是一种抗癫痫药、属于镇静催眠药',
    );
  });

  it('标题 + 关联 + 标签 → 与旧默认预设等价', () => {
    expect(composeSpeechText(fullNode, ['label', 'edges', 'tags'])).toBe(
      '卡马西平，是一种抗癫痫药、属于镇静催眠药，肝药酶诱导剂、窄治疗窗',
    );
  });

  it('标题 + 摘要(详细模式) → label + fullSummary', () => {
    expect(composeSpeechText(fullNode, ['label', 'summary'], 'full')).toBe(
      '卡马西平，完整摘要文本。',
    );
  });

  it('标题 + 摘要(简短模式) → label + shortSummary', () => {
    expect(composeSpeechText(fullNode, ['label', 'summary'], 'short')).toBe('卡马西平，短摘要。');
  });

  it('四项全选(详细模式) → label，edges，tags，summary 依次拼接', () => {
    expect(composeSpeechText(fullNode, ['label', 'edges', 'tags', 'summary'], 'full')).toBe(
      '卡马西平，是一种抗癫痫药、属于镇静催眠药，肝药酶诱导剂、窄治疗窗，完整摘要文本。',
    );
  });

  it('四项全选(简短模式) → 摘要段换成 shortSummary', () => {
    expect(composeSpeechText(fullNode, ['label', 'edges', 'tags', 'summary'], 'short')).toBe(
      '卡马西平，是一种抗癫痫药、属于镇静催眠药，肝药酶诱导剂、窄治疗窗，短摘要。',
    );
  });

  it('位置 → 按 书/部/章/节/小节 顺序拼接，段间用「。 」停顿', () => {
    expect(composeSpeechText(fullNode, ['location'])).toBe(
      '个人成长与生存策略。 第一章 认知底色。 第三节 本体与认知',
    );
  });

  it('标题 + 位置 → 位置紧跟标题之后(位置在 SPEECH_FIELD_ORDER 中排第二)', () => {
    expect(composeSpeechText(fullNode, ['label', 'location'])).toBe(
      '卡马西平，个人成长与生存策略。 第一章 认知底色。 第三节 本体与认知',
    );
  });

  it('位置缺失的层级被跳过,不产生多余停顿', () => {
    expect(
      composeSpeechText({ label: 'X', location: { book: '某书', section: '第三节' } }, [
        'label',
        'location',
      ]),
    ).toBe('X，某书。 第三节');
  });

  it('无 location 字段时勾选位置 → 只剩 label', () => {
    expect(composeSpeechText({ label: 'X' }, ['label', 'location'])).toBe('X');
  });

  it('五项全选 → label，location，edges，tags，summary 依次拼接', () => {
    expect(
      composeSpeechText(fullNode, ['label', 'location', 'edges', 'tags', 'summary'], 'short'),
    ).toBe(
      '卡马西平，个人成长与生存策略。 第一章 认知底色。 第三节 本体与认知，是一种抗癫痫药、属于镇静催眠药，肝药酶诱导剂、窄治疗窗，短摘要。',
    );
  });

  it('输出与勾选顺序无关(位置在任意输入顺序下位置一致)', () => {
    expect(composeSpeechText(fullNode, ['location', 'summary', 'label', 'edges'])).toBe(
      composeSpeechText(fullNode, ['label', 'location', 'edges', 'summary']),
    );
  });

  it('正文 → body 全文，Markdown 符号清理 + 停顿', () => {
    const withBody: SpeakableNode = {
      label: 'X',
      body: '## 小标题\n\n- 第一项\n- 第二项\n\n段落一。',
    };
    expect(composeSpeechText(withBody, ['body'])).toBe('小标题。 第一项；第二项。 段落一。');
  });

  it('摘要 + 正文 → 先摘要后正文(正文在 SPEECH_FIELD_ORDER 中排最后)', () => {
    expect(
      composeSpeechText({ label: 'X', shortSummary: '短句', body: '正文内容。' }, [
        'summary',
        'body',
      ]),
    ).toBe('短句。，正文内容。');
  });

  it('body 缺失(未加载)时勾选正文 → 其余字段照常朗读', () => {
    expect(composeSpeechText({ label: 'X', shortSummary: '短句' }, ['label', 'body'])).toBe('X');
  });

  it('body 为空白字符串时视为无正文', () => {
    expect(composeSpeechText({ label: 'X', body: '   ' }, ['label', 'body'])).toBe('X');
  });

  it('输出与勾选顺序无关(倒序输入结果一致)', () => {
    expect(composeSpeechText(fullNode, ['summary', 'tags', 'edges', 'label'])).toBe(
      composeSpeechText(fullNode, ['label', 'edges', 'tags', 'summary']),
    );
  });

  it('只勾 关联(不勾标题) → 只有关联内容', () => {
    expect(composeSpeechText(fullNode, ['edges'])).toBe('是一种抗癫痫药、属于镇静催眠药');
  });

  it('只勾 标签 → 只有标签', () => {
    expect(composeSpeechText(fullNode, ['tags'])).toBe('肝药酶诱导剂、窄治疗窗');
  });

  it('空集 → 空字符串(纯函数底线;controller 会拒绝写入空集)', () => {
    expect(composeSpeechText(fullNode, [])).toBe('');
  });

  it('重复字段去重后只念一次', () => {
    expect(composeSpeechText(fullNode, ['label', 'label'])).toBe('卡马西平');
  });
});

describe('composeSpeechText: missing-field edge cases', () => {
  it('label-only node 勾 关联 → 只剩 label', () => {
    expect(composeSpeechText({ label: 'X' }, ['label', 'edges'])).toBe('X');
  });

  it('label-only node 勾 标签 → 只剩 label', () => {
    expect(composeSpeechText({ label: 'X' }, ['label', 'tags'])).toBe('X');
  });

  it('label-only node 勾 摘要 → 只剩 label', () => {
    expect(composeSpeechText({ label: 'X' }, ['label', 'summary'])).toBe('X');
  });

  it('有 edges 无 tags,勾 标签 → label + edges', () => {
    expect(
      composeSpeechText({ label: 'X', edges_out: [{ target: 'Y', reason: '一种关联' }] }, [
        'label',
        'edges',
        'tags',
      ]),
    ).toBe('X，一种关联');
  });

  it('edges_out 中空 / 纯空白 reason 被跳过', () => {
    expect(
      composeSpeechText(
        {
          label: 'X',
          edges_out: [
            { target: 'a', reason: '' },
            { target: 'b', reason: '真实关联' },
            { target: 'c', reason: '   ' },
          ],
        },
        ['label', 'edges'],
      ),
    ).toBe('X，真实关联');
  });

  it('edge 只有 target 没有 reason → 该边不发音(不念 target id)', () => {
    expect(
      composeSpeechText({ label: 'X', edges_out: [{ target: 'sec-sedative-y2-01-01' }] }, [
        'label',
        'edges',
      ]),
    ).toBe('X');
  });

  it('tags 中纯空白项被跳过', () => {
    expect(
      composeSpeechText(
        {
          label: 'X',
          edges_out: [{ target: 'a', reason: '一种关联' }],
          tags: ['', '  ', '真实标签'],
        },
        ['label', 'edges', 'tags'],
      ),
    ).toBe('X，一种关联，真实标签');
  });

  it('tags 全为空白 → 只剩 label + edges', () => {
    expect(
      composeSpeechText(
        {
          label: 'X',
          edges_out: [{ target: 'a', reason: '一种关联' }],
          tags: ['', '  '],
        },
        ['label', 'edges', 'tags'],
      ),
    ).toBe('X，一种关联');
  });

  it('详细模式下 fullSummary 为空白且无 short → 只剩 label', () => {
    expect(
      composeSpeechText({ label: 'X', fullSummary: '   ' }, ['label', 'summary'], 'full'),
    ).toBe('X');
  });

  it('简短模式但只有 fullSummary → 回落到 fullSummary', () => {
    expect(
      composeSpeechText({ label: 'X', fullSummary: '完整' }, ['label', 'summary'], 'short'),
    ).toBe('X，完整。');
  });

  it('详细模式但只有 shortSummary → 回落到 shortSummary', () => {
    expect(
      composeSpeechText({ label: 'X', shortSummary: '简短' }, ['label', 'summary'], 'full'),
    ).toBe('X，简短。');
  });

  it('short 与 full 都有时只读所选那一段,绝不拼接两段', () => {
    const both = { label: 'X', shortSummary: '简短', fullSummary: '详细' };
    expect(composeSpeechText(both, ['label', 'summary'], 'short')).toBe('X，简短。');
    expect(composeSpeechText(both, ['label', 'summary'], 'full')).toBe('X，详细。');
  });

  it('无 label 且无其他字段 → 空字符串', () => {
    expect(composeSpeechText({}, ['label'])).toBe('');
    expect(composeSpeechText({}, ['label', 'edges'])).toBe('');
    expect(composeSpeechText({}, ['label', 'edges', 'tags'])).toBe('');
    expect(composeSpeechText({}, ['label', 'summary'])).toBe('');
  });

  it('无 label 但有 edges,只勾 关联 → 只剩 edges 内容', () => {
    expect(composeSpeechText({ edges_out: [{ target: 'a', reason: '一种关联' }] }, ['edges'])).toBe(
      '一种关联',
    );
  });

  it('label 两端空白被 trim', () => {
    expect(composeSpeechText({ label: '  卡马西平  ' }, ['label'])).toBe('卡马西平');
  });
});

describe('parseSpeechFields: 新格式 (multi-select)', () => {
  it('按 + 分割并归一化为规范顺序', () => {
    expect(parseSpeechFields('label+edges+tags')).toEqual(['label', 'edges', 'tags']);
    expect(parseSpeechFields('tags+label')).toEqual(['label', 'tags']);
  });

  it('重复 token 去重', () => {
    expect(parseSpeechFields('label+label+tags')).toEqual(['label', 'tags']);
  });

  it('任一非法 token → 整体回落默认(不做半信任拼接)', () => {
    expect(parseSpeechFields('label+bogus')).toEqual(['label', 'edges']);
  });
});

describe('parseSpeechFields: legacy 预设迁移', () => {
  it('"label" → [label]', () => {
    expect(parseSpeechFields('label')).toEqual(['label']);
  });

  it('"label-edges" → [label, edges]', () => {
    expect(parseSpeechFields('label-edges')).toEqual(['label', 'edges']);
  });

  it('"label-edges-tags" → [label, edges, tags]', () => {
    expect(parseSpeechFields('label-edges-tags')).toEqual(['label', 'edges', 'tags']);
  });

  it('"label-full-summary" → [label, summary]', () => {
    expect(parseSpeechFields('label-full-summary')).toEqual(['label', 'summary']);
  });
});

describe('parseSpeechFields: 缺失 / 非法 → 默认', () => {
  it('null / undefined / 空串 / 未知值 都回落默认 label+edges', () => {
    expect(parseSpeechFields(null)).toEqual(['label', 'edges']);
    expect(parseSpeechFields(undefined)).toEqual(['label', 'edges']);
    expect(parseSpeechFields('')).toEqual(['label', 'edges']);
    expect(parseSpeechFields('nonsense')).toEqual(['label', 'edges']);
  });
});
