// tests/unit/ui/speech-granularity.test.ts
// Pure-function tests for composeSpeechText — the only pure piece in
// src/ui/speech.ts. Every (granularity × field-presence) combination is
// covered so future field additions can't silently regress concatenation.
//
// "关联" reads edges_out[*].reason (the human-readable Chinese rationale
// from frontmatter), NOT target. Reading target id was the original bug —
// ids are noise when spoken aloud.

import { describe, it, expect } from 'vitest';
import { composeSpeechText } from '@/ui/speech';
import type { SpeakableNode } from '@/ui/speech';

describe('composeSpeechText: 4 granularities × full-node payload', () => {
  const fullNode: SpeakableNode = {
    label: '卡马西平',
    edges_out: [
      { type: 'instance_of', target: 'drug-carbamazepine', reason: '是一种抗癫痫药' },
      { type: 'subclass_of', target: 'cls-sedative-hypnotic', reason: '属于镇静催眠药' },
    ],
    tags: ['肝药酶诱导剂', '窄治疗窗'],
    shortSummary: '短摘要',
    fullSummary: '完整摘要文本',
  };

  it('"label" returns just the label', () => {
    expect(composeSpeechText(fullNode, 'label')).toBe('卡马西平');
  });

  it('"label-edges" returns label + edge reasons joined by 、 (NOT target ids)', () => {
    expect(composeSpeechText(fullNode, 'label-edges')).toBe(
      '卡马西平，是一种抗癫痫药、属于镇静催眠药',
    );
  });

  it('"label-edges-tags" returns label + edges + tags joined by 、', () => {
    expect(composeSpeechText(fullNode, 'label-edges-tags')).toBe(
      '卡马西平，是一种抗癫痫药、属于镇静催眠药，肝药酶诱导剂、窄治疗窗',
    );
  });

  it('"label-full-summary" returns label + full summary', () => {
    expect(composeSpeechText(fullNode, 'label-full-summary')).toBe('卡马西平，完整摘要文本');
  });
});

describe('composeSpeechText: missing-field edge cases', () => {
  it('label-only node under "label-edges" returns only the label', () => {
    expect(composeSpeechText({ label: 'X' }, 'label-edges')).toBe('X');
  });

  it('label-only node under "label-edges-tags" returns only the label', () => {
    expect(composeSpeechText({ label: 'X' }, 'label-edges-tags')).toBe('X');
  });

  it('label-only node under "label-full-summary" returns only the label', () => {
    expect(composeSpeechText({ label: 'X' }, 'label-full-summary')).toBe('X');
  });

  it('node with edges but no tags under "label-edges-tags" returns label + edges', () => {
    expect(
      composeSpeechText(
        { label: 'X', edges_out: [{ target: 'Y', reason: '一种关联' }] },
        'label-edges-tags',
      ),
    ).toBe('X，一种关联');
  });

  it('edges_out with empty/whitespace-only reason strings are skipped', () => {
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
        'label-edges',
      ),
    ).toBe('X，真实关联');
  });

  it('edges_out with target but no reason field produces nothing for that edge', () => {
    // 真实场景:有的边没填 reason(老数据 / 简化 frontmatter)。不应念 target id。
    expect(
      composeSpeechText(
        { label: 'X', edges_out: [{ target: 'sec-sedative-y2-01-01' }] },
        'label-edges',
      ),
    ).toBe('X');
  });

  it('tags with whitespace-only entries are skipped', () => {
    expect(
      composeSpeechText(
        {
          label: 'X',
          edges_out: [{ target: 'a', reason: '一种关联' }],
          tags: ['', '  ', '真实标签'],
        },
        'label-edges-tags',
      ),
    ).toBe('X，一种关联，真实标签');
  });

  it('tags with all-whitespace entries leave just label + edges', () => {
    expect(
      composeSpeechText(
        {
          label: 'X',
          edges_out: [{ target: 'a', reason: '一种关联' }],
          tags: ['', '  '],
        },
        'label-edges-tags',
      ),
    ).toBe('X，一种关联');
  });

  it('empty fullSummary under "label-full-summary" returns only the label', () => {
    expect(composeSpeechText({ label: 'X', fullSummary: '   ' }, 'label-full-summary')).toBe('X');
  });

  it('node without a label AND no other fields produces empty string', () => {
    expect(composeSpeechText({}, 'label')).toBe('');
    expect(composeSpeechText({}, 'label-edges')).toBe('');
    expect(composeSpeechText({}, 'label-edges-tags')).toBe('');
    expect(composeSpeechText({}, 'label-full-summary')).toBe('');
  });

  it('label-edges with no label but with edges returns just the edges', () => {
    expect(
      composeSpeechText(
        { edges_out: [{ target: 'a', reason: '一种关联' }] },
        'label-edges',
      ),
    ).toBe('一种关联');
  });

  it('label with surrounding whitespace is trimmed', () => {
    expect(composeSpeechText({ label: '  卡马西平  ' }, 'label')).toBe('卡马西平');
  });
});
