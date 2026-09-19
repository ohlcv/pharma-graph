// Tests for the pure JS frontmatter parser.
// Covers top-level keys, nested `data:` block (post-migration shape),
// both required-field validation, edges_out extraction, location, and tags.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseFrontmatter, parseFrontmatterWithWarnings } from './frontmatter.js';
import { DEFAULT_EDGE_TYPE, EDGE_TYPES } from '../core/edge-types.js';

describe('real-file regression', () => {
  it('reads fullSummary from a migrated A-layout file (top-level full)', () => {
    // 趋同进化 is one of the migrated nodes whose full lives at the top level.
    // Verifies the new fallback path actually surfaces the content.
    const path = '/Users/meow/.tmp/should-not-exist.md';
    const fallbackPath = '/Users/meow/Desktop/Project/pharma-graph/public/content/个人成长与生存策略/第一章 认知底色/趋同进化：相同选择压力下不同起点收敛到同一终点.md';
    let raw: string;
    try {
      raw = readFileSync(path, 'utf-8');
    } catch {
      raw = readFileSync(fallbackPath, 'utf-8');
    }
    const fm = parseFrontmatter(raw, fallbackPath);
    expect(fm.id).toBe('concept-convergent-evolution-p1-01-02');
    expect(fm.shortSummary).toBeTruthy();
    // Either layout should now surface a non-trivial fullSummary.
    expect(fm.fullSummary).toBeTruthy();
    expect(fm.fullSummary!.length).toBeGreaterThan(1000);
  });
});


describe('parseFrontmatter', () => {
  it('parses top-level keys with required fields', () => {
    const raw = `---
id: pharm-1
label: 药剂学基础
fill: cls-concept
summary: 简介
---

正文段落 1。

正文段落 2。`;

    const fm = parseFrontmatter(raw, 'a.md');
    expect(fm.id).toBe('pharm-1');
    expect(fm.label).toBe('药剂学基础');
    expect(fm.fill).toBe('cls-concept');
    expect(fm.summary).toBe('简介');
    expect(fm.body).toBe('正文段落 1。\n\n正文段落 2。');
    expect(fm.edges_out).toBeUndefined();
    expect(fm.tags).toBeUndefined();
  });

  it('parses nested `data:` block (post-migration shape)', () => {
    const raw = `---
data:
  id: pharm-2
  label: 药理学
  fill: cls-concept
  summary: 药理学介绍
  edges_out:
    - target: pharm-1
      type: prerequisite
      reason: 学习药理学前需掌握药剂学
  location:
    book: 药学专业知识一
    chapter: 第一章
  tags:
    - 基础
    - 核心
---

正文内容。`;

    const fm = parseFrontmatter(raw, 'b.md');
    expect(fm.id).toBe('pharm-2');
    expect(fm.edges_out).toHaveLength(1);
    expect(fm.edges_out?.[0]).toEqual({
      target: 'pharm-1',
      type: 'prerequisite',
      reason: '学习药理学前需掌握药剂学',
    });
    expect(fm.location?.book).toBe('药学专业知识一');
    expect(fm.location?.chapter).toBe('第一章');
    expect(fm.tags).toEqual(['基础', '核心']);
  });

  it('throws when required fields are missing', () => {
    const raw = `---
label: 没 id 的文件
---

正文`;
    expect(() => parseFrontmatter(raw, 'c.md')).toThrow(/缺少必需字段/);
  });

  it('throws on empty id', () => {
    const raw = `---
id: "   "
label: empty id
---

body`;
    expect(() => parseFrontmatter(raw, 'd.md')).toThrow(/id 不能为空/);
  });

  it('extracts edges_out from top level even when nested block exists', () => {
    // The migration script puts most fields under `data:` but leaves edges_out
    // at the top level. Parser must respect that.
    const raw = `---
data:
  id: pharm-3
  label: 临床药学
edges_out:
  - target: pharm-2
    type: prerequisite
---

body`;
    const fm = parseFrontmatter(raw, 'e.md');
    expect(fm.edges_out).toHaveLength(1);
    expect(fm.edges_out?.[0].target).toBe('pharm-2');
  });

  it('reports edges with empty target as errors (issue #14)', () => {
    const raw = `---
id: pharm-4
label: edge-test
edges_out:
  - target: ""
    type: subclass_of
  - target: pharm-1
    type: subclass_of
---

body`;
    // Issue #14: previously the parser silently dropped the empty-target
    // edge so the CLI and the browser gave different feedback. Now the
    // parser escalates empty-target edges to errors and the legacy
    // parseFrontmatter() re-throws so callers can't ignore it.
    expect(() => parseFrontmatter(raw, 'f.md')).toThrow(/target 为空/);
  });

  it('parseFrontmatterWithWarnings returns the surviving edges + warnings list', () => {
    const raw = `---
id: pharm-4b
label: edge-test
edges_out:
  - target: ""
    type: subclass_of
  - target: pharm-1
    type: subclass_of
---

body`;
    const { fm, warnings } = parseFrontmatterWithWarnings(raw, 'g.md');
    // The malformed edge is dropped from `fm` (still silent at the graph
    // level) but the warning list carries the diagnostic.
    expect(fm.edges_out).toHaveLength(1);
    expect(fm.edges_out?.[0].target).toBe('pharm-1');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('error');
    expect(warnings[0].field).toBe('edges_out[0].target');
  });

  it('defaults edge type to DEFAULT_EDGE_TYPE when missing', () => {
    const raw = `---
id: pharm-5
label: edge-type-default
edges_out:
  - target: pharm-1
---

body`;
    const fm = parseFrontmatter(raw, 'g.md');
    expect(fm.edges_out?.[0].type).toBe(DEFAULT_EDGE_TYPE);
    // Sanity: the default must be a canonical edge type. If this fails,
    // the parser is emitting a value the validator would reject.
    expect(EDGE_TYPES).toContain(DEFAULT_EDGE_TYPE);
  });

  it('accepts summary as object with short/full fields', () => {
    const raw = `---
id: pharm-6
label: summary-obj
summary:
  short: 简短
  full: 完整长描述
---

body`;
    const fm = parseFrontmatter(raw, 'h.md');
    // Order of preference: short → full
    expect(fm.summary).toBe('简短');

    const raw2 = `---
id: pharm-6b
label: summary-obj-2
summary:
  full: 只有完整
---

body`;
    const fm2 = parseFrontmatter(raw2, 'h2.md');
    expect(fm2.summary).toBe('只有完整');
  });

  it('accepts top-level full (legacy layout, sibling of summary)', () => {
    // Layout A: `full` lives at the top level, next to `summary: { short: ... }`.
    // Old files were migrated this way; the parser must accept both layouts
    // (B = summary.full here, A = top-level full below).
    const raw = `---
id: pharm-6c
label: top-level-full
summary:
  short: 简短
full: |-
  【核心命题】
  长描述的第一行。
    缩进的子句。
  第二段。
---

body`;
    const fm = parseFrontmatter(raw, 'h3.md');
    expect(fm.shortSummary).toBe('简短');
    expect(fm.summary).toBe('简短');
    expect(fm.fullSummary).toBe('【核心命题】\n长描述的第一行。\n  缩进的子句。\n第二段。');
  });

  it('prefers summary.full over top-level full when both present', () => {
    // When both layouts coexist (one was migrated, one was kept), the more
    // explicit `summary.full` wins to avoid silent data loss in either direction.
    const raw = `---
id: pharm-6d
label: both-full
summary:
  full: nested 版本
full: top 版本
---

body`;
    const fm = parseFrontmatter(raw, 'h4.md');
    expect(fm.fullSummary).toBe('nested 版本');
  });

  it('handles BOM at file start', () => {
    const raw = '\uFEFF---\nid: pharm-7\nlabel: BOM 测试\n---\n\nbody';
    const fm = parseFrontmatter(raw, 'i.md');
    expect(fm.id).toBe('pharm-7');
    expect(fm.label).toBe('BOM 测试');
  });

  it('returns empty content when no frontmatter block exists', () => {
    // Design choice: parser still runs required-field validation even when
    // no frontmatter block exists. Documenting the behaviour.
    const raw = 'just markdown, no frontmatter';
    expect(() => parseFrontmatter(raw, 'j.md')).toThrow(/缺少必需字段/);
  });

  it('drops tag entries that are not strings', () => {
    // YAML coerces bare scalars: 123 → number, true → bool, null → null.
    // Only literal strings survive as tags.
    const raw = `---
id: pharm-8
label: tag-mixed
tags:
  - keep
  - 123
  - true
  - null
  - also-string
---

body`;
    const fm = parseFrontmatter(raw, 'k.md');
    expect(fm.tags).toEqual(['keep', 'also-string']);
  });

  it('forces tag values to strings via YAML quoting', () => {
    // Quote them if you want them to remain strings.
    const raw = `---
id: pharm-9
label: tag-quoted
tags:
  - "123"
  - "true"
---

body`;
    const fm = parseFrontmatter(raw, 'l.md');
    expect(fm.tags).toEqual(['123', 'true']);
  });
});
