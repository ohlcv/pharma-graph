// Tests for the pure JS frontmatter parser.
// Covers top-level keys, nested `data:` block (post-migration shape),
// both required-field validation, edges_out extraction, location, and tags.

import { describe, it, expect } from 'vitest';
import { parseFrontmatter, parseFrontmatterWithWarnings } from './frontmatter.js';
import { DEFAULT_EDGE_TYPE, EDGE_TYPES } from '../core/edge-types.js';

describe('parseFrontmatter', () => {
  it('parses top-level keys with required fields', () => {
    const raw = `---
id: pharm-1
label: 药剂学基础
essence: discipline
field: pharmacy
tier: basic
summary: 简介
---

正文段落 1。

正文段落 2。`;

    const fm = parseFrontmatter(raw, 'a.md');
    expect(fm.id).toBe('pharm-1');
    expect(fm.label).toBe('药剂学基础');
    expect(fm.essence).toBe('discipline');
    expect(fm.field).toBe('pharmacy');
    expect(fm.tier).toBe('basic');
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
  essence: discipline
  field: pharmacy
  tier: core
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
