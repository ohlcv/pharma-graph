// src/core/build-graph.ts
// Pure graph-builder shared between the browser (Vite glob → strings) and
// the Node CLI (fs.readFile). Both paths normalize raw text into
// ParsedFrontmatter, then hand the map off to this module.
//
// This keeps degree computation, edge dedup, dangling-edge detection and
// new-schema field selection in one place. The old type/category/layer
// fallback is intentionally NOT preserved here — content has been migrated,
// and falling back to legacy fields only hides missing data.

import { GraphData, NodeData, EdgeData } from './graph.js';
import { ParsedFrontmatter } from '../parser/frontmatter.js';

export interface BuildOptions {
  /** Set of node IDs considered "known" — edges pointing elsewhere are flagged. */
  knownNodeIds?: Set<string>;
  /** Stream dangling-edge reports to the caller (CLI uses stderr, browser no-ops). */
  onDanglingEdges?: (entries: DanglingEdge[]) => void;
}

export interface DanglingEdge {
  source: string;
  target: string;
  file: string;
}

export interface BuildResult extends GraphData {
  /** Edges whose target points to a node that wasn't in the input. */
  danglingEdges: DanglingEdge[];
}

/**
 * Build a GraphData object from a filepath → ParsedFrontmatter map.
 * Pure function — no I/O, no side effects beyond the optional dangling-edge hook.
 */
export function buildGraph(
  frontmatters: Map<string, ParsedFrontmatter>,
  options: BuildOptions = {},
): BuildResult {
  // First pass — collect node IDs (file id present?) and raw edges.
  const nodeIds = new Set<string>();
  const rawEdges: EdgeData[] = [];
  const danglingEdges: DanglingEdge[] = [];
  const knownIds = options.knownNodeIds;

  for (const [fp, fm] of frontmatters) {
    if (!fm.id) continue;
    nodeIds.add(fm.id);

    if (!fm.edges_out) continue;
    for (const edge of fm.edges_out) {
      if (knownIds && !knownIds.has(edge.target)) {
        danglingEdges.push({ source: fm.id, target: edge.target, file: fp });
        continue;
      }
      rawEdges.push({
        id: `${fm.id}||${edge.target}||${edge.type}`,
        source: fm.id,
        target: edge.target,
        type: edge.type,
        reason: edge.reason,
      });
    }
  }

  // Deduplicate edges (same source+target+type).
  const seenEdge = new Set<string>();
  const edges: EdgeData[] = [];
  for (const e of rawEdges) {
    if (seenEdge.has(e.id)) continue;
    seenEdge.add(e.id);
    edges.push(e);
  }

  // Degree = total connections (in + out).
  const degree: Record<string, number> = {};
  for (const id of nodeIds) degree[id] = 0;
  for (const e of edges) {
    degree[e.source] = (degree[e.source] ?? 0) + 1;
    degree[e.target] = (degree[e.target] ?? 0) + 1;
  }

  // Second pass — build nodes with degree-derived weight.
  const nodes: NodeData[] = [];
  const seenNode = new Set<string>();
  for (const [, fm] of frontmatters) {
    if (!fm.id || seenNode.has(fm.id)) continue;
    seenNode.add(fm.id);
    nodes.push({
      id: fm.id,
      label: fm.label,
      essence: fm.essence ?? '',
      field: fm.field ?? '',
      tier: fm.tier,
      type: fm.essence ?? '',
      category: fm.field ?? '',
      layer: fm.tier,
      summary: fm.summary,
      location: fm.location,
      tags: fm.tags,
      body: fm.body,
      weight: degree[fm.id] ?? 1,
    });
  }

  if (danglingEdges.length > 0 && options.onDanglingEdges) {
    options.onDanglingEdges(danglingEdges);
  }

  return { nodes, edges, danglingEdges };
}
