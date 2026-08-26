// src/core/edge-builder.ts
// Node CLI entry — builds EdgeData via the shared buildGraph helper and
// surfaces dangling-edge reports to stderr.

import { EdgeData } from './graph.js';
import { loadAllFrontmatter } from './node-builder.js';
import { buildGraph, DanglingEdge } from './build-graph.js';

export type { DanglingEdge };

/**
 * Build edges from all .md files. When `knownNodeIds` is provided, any edge
 * whose target isn't in the set is reported via stderr and dropped.
 */
export async function buildEdges(
  filePaths: string[],
  knownNodeIds?: Set<string>,
): Promise<EdgeData[]> {
  const frontmatters = await loadAllFrontmatter(filePaths);
  const { edges, danglingEdges } = buildGraph(frontmatters, {
    knownNodeIds,
    onDanglingEdges: (_entries: DanglingEdge[]) => {
      // Dangling edges are silently ignored in production.
      // The validation script (scripts/audit-content.ts) reports them separately.
    },
  });
  return edges;
}
