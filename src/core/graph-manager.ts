// src/core/graph-manager.ts
// Browser entry — loads Markdown via Vite glob, parses frontmatter, and
// hands off to the shared buildGraph helper.
//
// Supports incremental `addFiles()` so callers can stream content
// into the builder (used by the streaming loader in
// src/core/optimized-content-loader.ts) and re-run build() to get
// an up-to-date GraphData without re-parsing what's already cached.
//
// Also supports direct init via `initWithPrebuilt()` — the fast path when
// graph-data.json is available (pre-built at build time). This skips all
// frontmatter parsing and BFS/DFS computation.

import { GraphData } from './graph.js';
import { parseFrontmatterWithWarnings, type ParseWarning } from '../parser/frontmatter.js';
import { buildGraph, buildGraphFromPrebuilt } from './build-graph.js';
import type { PrebuiltGraphData } from './build-graph.js';

export class GraphManager {
  private mdFiles: Record<string, string>;
  private data: GraphData | null = null;
  /** Last-set of parser warnings emitted during build(). Callers can read
   *  this after build() to surface a toast / debug panel (issue #14). */
  public warnings: ParseWarning[] = [];

  constructor(mdFiles: Record<string, string> = {}) {
    this.mdFiles = mdFiles;
  }

  /**
   * Fast path: initialise directly from pre-built graph-data.json.
   * Bypasses frontmatter parsing and BFS/DFS entirely.
   * Call this instead of the streaming addFiles() path when the prebuilt
   * file is available.
   */
  initWithPrebuilt(prebuilt: PrebuiltGraphData): void {
    this.data = buildGraphFromPrebuilt(prebuilt);
    this.warnings = [];
  }

  /**
   * Adopt a GraphData that was already mapped from graph-data.json
   * (loadGraph() has run buildGraphFromPrebuilt once). Avoids re-mapping every
   * node a second time the way initWithPrebuilt(...) would.
   */
  initWithGraph(graph: GraphData): void {
    this.data = graph;
    this.warnings = [];
  }

  /**
   * Add a batch of file → content pairs and invalidate the cache so
   * the next `build()` re-runs the graph builder on the union.
   *
   * Returns true if any new file was added (used by the streaming
   * caller to decide whether to schedule a graph append).
   */
  addFiles(batch: Record<string, string>): boolean {
    let added = false;
    for (const [fp, raw] of Object.entries(batch)) {
      if (!(fp in this.mdFiles)) {
        this.mdFiles[fp] = raw;
        added = true;
      }
    }
    if (added) {
      this.data = null; // force rebuild
    }
    return added;
  }

  /** Number of files currently loaded — used by the loader progress UI. */
  fileCount(): number {
    return Object.keys(this.mdFiles).length;
  }

  build(): GraphData {
    if (this.data) return this.data;

    const frontmatters = new Map<string, ReturnType<typeof parseFrontmatterWithWarnings>['fm']>();
    const warnings: ParseWarning[] = [];
    for (const [fp, raw] of Object.entries(this.mdFiles)) {
      try {
        const { fm, warnings: fileWarnings } = parseFrontmatterWithWarnings(raw, fp);
        frontmatters.set(fp, fm);
        for (const w of fileWarnings) warnings.push(w);
      } catch (err) {
        // One bad file must not sink the entire graph (issue #14 spirit):
        // turn hard parse errors into warnings so authors see the diagnostic
        // in the debug panel while the rest of the graph still renders.
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push({
          file: fp,
          field: 'frontmatter',
          message: `parse failed: ${msg}`,
          severity: 'error',
        });
      }
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
