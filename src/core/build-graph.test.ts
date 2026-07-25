// Tests for buildGraph — pure function that turns frontmatters into
// GraphData (nodes + edges + degree + dangling edges).

import { describe, it, expect, vi } from 'vitest';
import { buildGraph, type DanglingEdge } from '../core/build-graph.js';
import type { ParsedFrontmatter } from '../parser/frontmatter.js';

function fm(
  id: string,
  edges?: Array<{ target: string; type?: string; reason?: string }>,
): ParsedFrontmatter {
  return {
    id,
    label: id,
    edges_out: edges?.map((e) => ({
      target: e.target,
      type: e.type ?? 'related',
      reason: e.reason,
    })),
    body: '',
  };
}

describe('buildGraph', () => {
  it('returns empty graph for empty input', () => {
    const r = buildGraph(new Map());
    expect(r.nodes).toEqual([]);
    expect(r.edges).toEqual([]);
    expect(r.danglingEdges).toEqual([]);
  });

  it('skips files without id', () => {
    const map = new Map<string, ParsedFrontmatter>([
      ['a.md', { id: '', label: 'no id', body: '' }],
      ['b.md', fm('b')],
    ]);
    const r = buildGraph(map);
    expect(r.nodes.map((n) => n.id)).toEqual(['b']);
  });

  it('builds nodes with all frontmatter fields', () => {
    const map = new Map<string, ParsedFrontmatter>([
      [
        'a.md',
        {
          id: 'a',
          label: 'A',
          essence: 'concept',
          field: 'pharmacy',
          tier: 'basic',
          summary: 'A 简介',
          tags: ['x'],
          body: 'body of A',
        },
      ],
    ]);
    const r = buildGraph(map);
    expect(r.nodes).toHaveLength(1);
    expect(r.nodes[0]).toMatchObject({
      id: 'a',
      label: 'A',
      essence: 'concept',
      field: 'pharmacy',
      tier: 'basic',
      summary: 'A 简介',
      tags: ['x'],
      body: 'body of A',
    });
    // node also carries legacy type/category/layer aliases from essence/field/tier
    expect(r.nodes[0].type).toBe('concept');
    expect(r.nodes[0].category).toBe('pharmacy');
    expect(r.nodes[0].layer).toBe('basic');
  });

  it('builds edges from edges_out', () => {
    const map = new Map<string, ParsedFrontmatter>([
      ['a.md', fm('a', [{ target: 'b', type: 'prerequisite', reason: '先学 b' }])],
      ['b.md', fm('b')],
    ]);
    const r = buildGraph(map);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0]).toEqual({
      id: 'a||b||prerequisite',
      source: 'a',
      target: 'b',
      type: 'prerequisite',
      reason: '先学 b',
    });
  });

  it('deduplicates identical edges (same source+target+type)', () => {
    const map = new Map<string, ParsedFrontmatter>([
      [
        'a.md',
        fm('a', [
          { target: 'b', type: 'related' },
          { target: 'b', type: 'related' }, // duplicate
          { target: 'b', type: 'related', reason: 'different reason' }, // still same key
        ]),
      ],
      ['b.md', fm('b')],
    ]);
    const r = buildGraph(map);
    expect(r.edges).toHaveLength(1);
    // First reason wins.
    expect(r.edges[0].reason).toBeUndefined();
  });

  it('counts degree as in + out (exposed via node.weight)', () => {
    // buildGraph doesn't return a degree map directly — it folds the degree
    // into each node's `weight` field for the Cytoscape layout to consume.
    const map = new Map<string, ParsedFrontmatter>([
      [
        'a.md',
        fm('a', [
          { target: 'b' },
          { target: 'c' },
        ]),
      ],
      ['b.md', fm('b', [{ target: 'c' }])],
      ['c.md', fm('c')],
    ]);
    const r = buildGraph(map);
    const weight = Object.fromEntries(r.nodes.map((n) => [n.id, n.weight]));
    expect(weight).toEqual({ a: 2, b: 2, c: 2 });
  });

  it('detects dangling edges against knownNodeIds', () => {
    const map = new Map<string, ParsedFrontmatter>([
      ['a.md', fm('a', [{ target: 'ghost' }])],
    ]);
    const report = vi.fn();
    const r = buildGraph(map, {
      knownNodeIds: new Set(['a']),
      onDanglingEdges: report,
    });
    expect(r.edges).toHaveLength(0);
    expect(r.danglingEdges).toEqual([
      { source: 'a', target: 'ghost', file: 'a.md' },
    ]);
    expect(report).toHaveBeenCalledWith([
      { source: 'a', target: 'ghost', file: 'a.md' },
    ] satisfies DanglingEdge[]);
  });

  it('does not flag dangling edges when knownNodeIds is not provided', () => {
    // Without knownNodeIds, edges pass through and danglingEdges stays empty.
    const map = new Map<string, ParsedFrontmatter>([
      ['a.md', fm('a', [{ target: 'ghost' }])],
    ]);
    const r = buildGraph(map);
    expect(r.edges).toHaveLength(1);
    expect(r.danglingEdges).toEqual([]);
  });
});
