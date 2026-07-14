// src/core/graph-manager.ts
// Browser entry — loads Markdown via Vite glob, parses frontmatter, and
// hands off to the shared buildGraph helper.

import { GraphData } from './graph.js';
import { parseFrontmatter } from '../parser/frontmatter.js';
import { buildGraph } from './build-graph.js';

export class GraphManager {
  private data: GraphData | null = null;

  constructor(private mdFiles: Record<string, string>) {}

  build(): GraphData {
    if (this.data) return this.data;

    const frontmatters = new Map<string, ReturnType<typeof parseFrontmatter>>();
    for (const [fp, raw] of Object.entries(this.mdFiles)) {
      frontmatters.set(fp, parseFrontmatter(raw, fp));
    }

    this.data = buildGraph(frontmatters);
    return this.data;
  }

  getData(): GraphData {
    if (!this.data) return this.build();
    return this.data;
  }
}
