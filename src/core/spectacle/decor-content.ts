/**
 * Shared content plumbing for the four "spectacle" decoration nodes
 * (太极八卦 / 四维空间 / 生命之树 / E8 根系).
 *
 * Why this file exists:
 *   Each decoration node has a markdown file in the content tree, and every
 *   overlay used to carry its own `const CONTENT_REL_PATH = '<dir>/<name>.md'`
 *   plus a hand-copied URL encoder. That meant moving those four files was a
 *   four-file source edit — a content reorg could silently 404 the details
 *   panel of a decoration node.
 *
 * The path now comes from the node itself: build-content.ts writes each
 * markdown's content-relative path into graph-data.json as `rel`, and
 * buildGraphFromPrebuilt maps it to the node's `sourcePath` (see
 * build-graph.ts). No renderer change needed — every content node already
 * carries where it came from. The frontmatter file stays the single source of
 * truth (see AGENTS §1.1).
 */

import type cytoscape from 'cytoscape';
import { parseFrontmatter } from '../../parser/frontmatter.js';

/**
 * Percent-encode a content-relative path into a fetchable URL.
 *
 * Same rules as content-loader.ts, for the same reason: encodeURI handles
 * spaces while leaving `+`, `(`, `)`, `,` literal — Vite's dev server cannot
 * resolve the percent-encoded forms of `(`, `)`, `,` and returns the SPA
 * fallback instead. `#` and `?` are encoded explicitly because encodeURI would
 * leave them intact and break URL semantics.
 */
export function contentUrlForRel(rel: string): string {
  return (
    '/content/' +
    rel
      .split('/')
      .map((s) => encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F'))
      .join('/')
  );
}

/**
 * Non-blocking: fetch the node's markdown and write it into node data using the
 * exact same fields the content nodes use, so the detail panel renders it
 * through the normal path.
 *
 * Degrades silently in three cases, all of which leave the decoration itself
 * fully functional (it is drawn on its own canvas — the markdown only supplies
 * what you read when you click it):
 *   • no `rel` — the node was created by the overlay because it is absent from
 *     the content tree, so there is nothing to fetch;
 *   • the fetch 404s or the network fails;
 *   • frontmatter is missing/invalid — `parseFrontmatter` throws on missing id.
 */
export async function loadDecorContent(node: cytoscape.NodeSingular): Promise<void> {
  // `rel` is set by the streaming (markdown) path, `sourcePath` is the same
  // value under its prebuilt-loader name — either one tells us where the file
  // lives without the code having to know.
  const rel =
    (node.data('rel') as string | undefined) ?? (node.data('sourcePath') as string | undefined);
  if (!rel) return;
  try {
    const res = await fetch(contentUrlForRel(rel));
    if (!res.ok) return;
    const fm = parseFrontmatter(await res.text(), rel);
    node.data('shortSummary', fm.shortSummary);
    node.data('fullSummary', fm.fullSummary);
    node.data('body', fm.body);
    node.data('sourcePath', rel);
  } catch {
    /* 内容缺失/解析失败都不影响显示——装饰照常在画布上转 */
  }
}
