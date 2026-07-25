// src/core/node-builder.ts
// Node CLI entry — loads frontmatter from disk, derives NodeLocation from
// the file path, and produces NodeData via the shared buildGraph helper.

import fs from 'fs/promises';
import { parseFrontmatter, parseFrontmatterWithWarnings } from '../parser/frontmatter.js';
import { NodeData, NodeLocation } from './graph.js';
import { buildGraph } from './build-graph.js';
import type { ParsedFrontmatter, ParseWarning } from '../parser/frontmatter.js';

/**
 * Load and parse all frontmatter in parallel, returning a reusable map.
 * Soft warnings are dropped — call {@link loadAllFrontmatterWithWarnings}
 * if you need to surface them.
 */
export async function loadAllFrontmatter(filePaths: string[]): Promise<Map<string, ParsedFrontmatter>> {
  const results = await Promise.all(
    filePaths.map(async (fp) => {
      const raw = await fs.readFile(fp, 'utf-8');
      return { fp, fm: parseFrontmatter(raw, fp) };
    })
  );
  return new Map(results.map(({ fp, fm }) => [fp, fm]));
}

/**
 * Same as {@link loadAllFrontmatter} but also returns parser warnings
 * so CLI scripts (audit, export) can surface them in their output.
 */
export async function loadAllFrontmatterWithWarnings(
  filePaths: string[],
): Promise<{ frontmatters: Map<string, ParsedFrontmatter>; warnings: ParseWarning[] }> {
  const warnings: ParseWarning[] = [];
  const entries: Array<{ fp: string; fm: ParsedFrontmatter }> = await Promise.all(
    filePaths.map(async (fp) => {
      const raw = await fs.readFile(fp, 'utf-8');
      const { fm, warnings: fileWarnings } = parseFrontmatterWithWarnings(raw, fp);
      for (const w of fileWarnings) warnings.push(w);
      return { fp, fm };
    }),
  );
  return {
    frontmatters: new Map(entries.map(({ fp, fm }) => [fp, fm])),
    warnings,
  };
}

/**
 * Convert an absolute path to a NodeLocation object based on the content/
 * subdirectory layout:
 *   content/<book>/<part?>/<chapter?>/<section?>/<subsection?>/<item?>
 */
function toLocation(filePath: string): NodeLocation {
  const parts = filePath.split(/[/\\]/);
  const idx = parts.findIndex((p) => p === 'content');
  if (idx === -1) return {};
  const slice = parts.slice(idx + 1);
  return {
    book:      slice[0] ?? undefined,
    part:      slice[1] ?? undefined,
    chapter:   slice[2] ?? undefined,
    section:   slice[3] ?? undefined,
    subsection: slice[4] ?? undefined,
    item:      slice[5] ?? undefined,
  };
}

/**
 * Inject the file-derived location into every node, then delegate to buildGraph.
 * location lives outside frontmatter, so it has to be threaded in here rather
 * than inside the shared builder.
 */
export async function buildNodes(filePaths: string[]): Promise<NodeData[]> {
  const frontmatters = await loadAllFrontmatter(filePaths);
  const { nodes } = buildGraph(frontmatters);
  const pathById = new Map<string, string>();
  for (const fp of filePaths) {
    const fm = frontmatters.get(fp);
    if (fm?.id) pathById.set(fm.id, fp);
  }
  return nodes.map((n) => ({ ...n, location: toLocation(pathById.get(n.id) ?? '') }));
}

/**
 * Re-export so existing CLI scripts keep their `buildEdges` import.
 */
export { buildEdges } from './edge-builder.js';
