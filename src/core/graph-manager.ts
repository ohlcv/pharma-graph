// src/core/graph-manager.ts
// Browser entry — loads Markdown via Vite glob, parses frontmatter, and
// hands off to the shared buildGraph helper.

import { GraphData } from './graph.js';
import { parseFrontmatterWithWarnings, type ParseWarning } from '../parser/frontmatter.js';
import { buildGraph } from './build-graph.js';

export class GraphManager {
  private data: GraphData | null = null;
  /** Last-set of parser warnings emitted during build(). Callers can read
   *  this after build() to surface a toast / debug panel (issue #14). */
  public warnings: ParseWarning[] = [];

  constructor(private mdFiles: Record<string, string>) {}

  build(): GraphData {
    if (this.data) return this.data;

    const frontmatters = new Map<string, ReturnType<typeof parseFrontmatterWithWarnings>['fm']>();
    const warnings: ParseWarning[] = [];
    for (const [fp, raw] of Object.entries(this.mdFiles)) {
      const { fm, warnings: fileWarnings } = parseFrontmatterWithWarnings(raw, fp);
      frontmatters.set(fp, fm);
      for (const w of fileWarnings) warnings.push(w);
    }
    this.warnings = warnings;

    this.data = buildGraph(frontmatters);
    return this.data;
  }

  getData(): GraphData {
    if (!this.data) this.build();
    return this.data!;
  }
}
