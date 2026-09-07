// src/core/node-builder.ts
// Node CLI entry — loads frontmatter from disk and produces NodeData via
// the shared buildGraph helper.  Location is read entirely from frontmatter
// (location.book / chapter / section / item …).  No path inference.

import fs from 'fs/promises';
import { parseFrontmatter, parseFrontmatterWithWarnings } from '../parser/frontmatter.js';
import { NodeData } from './graph.js';
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
 * Build NodeData array.  location comes exclusively from frontmatter —
 * see {@link stringifyFrontmatter} for the migration that populated it.
 */
export async function buildNodes(filePaths: string[]): Promise<NodeData[]> {
  const frontmatters = await loadAllFrontmatter(filePaths);
  const { nodes } = buildGraph(frontmatters);
  const pathById = new Map<string, string>();
  for (const fp of filePaths) {
    const fm = frontmatters.get(fp);
    if (fm?.id) pathById.set(fm.id, fp);
  }
  return nodes.map((n) => {
    const fm = frontmatters.get(pathById.get(n.id) ?? '');
    // location 完全来自 frontmatter，不依赖文件路径
    return { ...n, location: fm?.location };
  });
}

/**
 * Re-export so existing CLI scripts keep their `buildEdges` import.
 */
export { buildEdges } from './edge-builder.js';
