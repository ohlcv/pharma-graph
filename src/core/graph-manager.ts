// src/core/graph-manager.ts
// Loads Markdown files via Vite glob, builds GraphData with degree-based node weights.

import { GraphData, NodeData, EdgeData } from './graph.js';
import { parseFrontmatter } from '../parser/frontmatter.js';

export class GraphManager {
  private data: GraphData | null = null;

  constructor(private mdFiles: Record<string, string>) {}

  build(): GraphData {
    if (this.data) return this.data;

    const rawEdges: EdgeData[] = [];
    const nodeIds = new Set<string>();

    // First pass: collect edges and node IDs
    for (const [fp, raw] of Object.entries(this.mdFiles)) {
      const fm = parseFrontmatter(raw, fp);
      if (fm.id) nodeIds.add(fm.id);
      if (fm.edges_out) {
        for (const edge of fm.edges_out) {
          nodeIds.add(edge.target);
          rawEdges.push({
            id: `${fm.id}||${edge.target}||${edge.type}`,
            source: fm.id,
            target: edge.target,
            type: edge.type,
            reason: edge.reason,
          });
        }
      }
    }

    // Deduplicate edges
    const seen = new Set<string>();
    const edges = rawEdges.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    // Compute degree per node (total connections in + out)
    const degree: Record<string, number> = {};
    for (const id of nodeIds) degree[id] = 0;
    for (const e of edges) {
      degree[e.source] = (degree[e.source] ?? 0) + 1;
      degree[e.target] = (degree[e.target] ?? 0) + 1;
    }

    // Second pass: build nodes with weight from degree
    const nodes: NodeData[] = [];
    for (const [fp, raw] of Object.entries(this.mdFiles)) {
      const fm = parseFrontmatter(raw, fp);
      const essence = fm.essence || fm.type || '';
      const field   = fm.field   || fm.category || '';
      const tier    = fm.tier    || fm.layer;
      nodes.push({
        id: fm.id,
        label: fm.label,
        essence,
        field,
        tier,
        type: essence,
        category: field,
        layer: tier,
        summary: fm.summary,
        location: fm.location,
        tags: fm.tags,
        body: fm.body,
        weight: degree[fm.id] ?? 1,
      });
    }

    this.data = { nodes, edges };
    return this.data;
  }

  getData(): GraphData {
    if (!this.data) return this.build();
    return this.data;
  }
}
