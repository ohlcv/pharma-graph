/**
 * PrebuiltGraphLoader — loads the pre-built graph-data.json instead of
 * parsing 1041 markdown files at runtime.
 *
 * This is the fast path: a single ~800 KB JSON fetch replaces
 * 1041 individual .md fetches + frontmatter YAML parsing + BFS/DFS.
 *
 * Falls back to the legacy streaming md-loader (optimized-content-loader) if
 * the prebuilt file is missing or invalid (e.g. after a partial build).
 * The fallback still uses the single-fetch graph path (graph-data.json) —
 * see main.ts for how it wires GraphManager with or without md content.
 */

import { buildGraphFromPrebuilt, type PrebuiltGraphData } from './build-graph.js';
import {
  loadContentStreaming,
  type LoadProgress as LegacyProgress,
  type LoadedContent,
} from './optimized-content-loader.js';

const GRAPH_DATA_URL = '/graph-data.json';

export interface LoadProgress {
  phase: 'prebuilt' | 'manifest' | 'content' | 'graph' | 'render' | 'done';
  loaded: number;
  total: number;
  message: string;
}

export type ProgressCallback = (progress: LoadProgress) => void;

export interface LoadResult {
  graph: ReturnType<typeof buildGraphFromPrebuilt>;
  /** Raw markdown content (Record, raw text). Empty if the
   *  prebuilt path succeeded — body is loaded lazily per-node. */
  files: LoadedContent['files'];
  /** True when graph-data.json was used (default); false when we fell
   *  back to streaming md files. */
  usedPrebuilt: boolean;
}

const reportLegacy = (cb: ProgressCallback | undefined) =>
  cb
    ? (p: LegacyProgress) =>
        cb({
          phase: p.phase,
          loaded: p.loaded,
          total: p.total,
          message: p.message,
        })
    : undefined;

/**
 * Load graph data with automatic fallback:
 *
 *   1. Try `/graph-data.json` (prebuilt, ~800 KB, instant). The browser
 *      gets a full GraphData without parsing any markdown.
 *
 *   2. If prebuilt fails (404 / parse error), fall back to streaming all
 *      1041 .md files via the manifest. Slower, but never blocks a deploy
 *      with a stale or missing graph-data.json.
 *
 * Returns the graph + collected md files (empty in the prebuilt path).
 */
export async function loadGraph(
  onProgress?: ProgressCallback,
): Promise<LoadResult> {
  const report = onProgress ?? (() => {});

  // ── Fast path: prebuilt graph-data.json ─────────────────────────────────
  report({ phase: 'prebuilt', loaded: 0, total: 1, message: '加载知识图谱…' });

  try {
    const res = await fetch(GRAPH_DATA_URL);
    if (res.ok) {
      const raw = (await res.json()) as PrebuiltGraphData;
      if (raw?.nodes && Array.isArray(raw.nodes)) {
        const graph = buildGraphFromPrebuilt(raw);
        report({ phase: 'done', loaded: raw.nodes.length, total: raw.nodes.length, message: '准备就绪' });
        return { graph, files: {}, usedPrebuilt: true };
      }
    }
  } catch (err) {
    console.warn('[prebuilt-loader] graph-data.json failed, falling back to md stream:', err);
  }

  // ── Fallback: stream all .md files ─────────────────────────────────────
  const collected = await loadContentStreaming(reportLegacy(report));
  // Caller will populate GraphManager via addFiles(); GraphManager.build()
  // computes BFS/DFS on the full set.
  return {
    graph: null as unknown as ReturnType<typeof buildGraphFromPrebuilt>,
    files: collected.files,
    usedPrebuilt: false,
  };
}
