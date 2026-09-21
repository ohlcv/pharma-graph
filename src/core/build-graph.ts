// src/core/build-graph.ts
// Pure graph-builder shared between the browser (Vite glob → strings) and
// the Node CLI (fs.readFile). Both paths normalize raw text into
// ParsedFrontmatter, then hand the map off to this module.
//
// This keeps degree computation, edge dedup, dangling-edge detection and
// new-schema field selection in one place. The old type/category/layer
// fallback is intentionally NOT preserved here — content has been migrated,
// and falling back to legacy fields only hides missing data.
//
// ── Fast path: prebuilt graph-data.json ─────────────────────────────────────
//
// When the browser fetches the pre-built graph-data.json (generated at build
// time by scripts/build-content.ts), it can skip frontmatter parsing and the
// entire BFS/DFS computation — everything is already computed. The only work
// left is mapping GraphNode (build-time shape) to NodeData (runtime shape).
//
// Use buildGraphFromPrebuilt() when loading from graph-data.json.
// Use buildGraph() when loading raw .md files (e.g. during development with
// the content-loader streaming path).

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
  /** Maximum depth seen in the BFS (0 when only the root exists). */
  maxDepth: number;
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

  // ── BFS: compute depth from the roots (root = 0, deeper = larger) ─────────────
  //
  // Edges follow part_of / subclass_of / instance_of semantics: child → parent
  // (A part_of B is stored as an edge whose source is A and target is B).
  //
  //   1. Roots = nodes with out-degree 0, i.e. nodes that have no parent.
  //      (Isolated nodes also land here and get depth 0.)
  //   2. Walk from the roots toward the children (target → source).
  //   3. Roots get depth 0, their children 1, grandchildren 2 …
  //      → the root "执业药师考试体系" is the center (0); depth grows outward.
  //
  // This matches config.ts (LEVEL_LABEL[0] = '中心', NEUTRAL_GRAY_BY_DEPTH[0]).

  // Build forward adjacency (source → targets) for degree computation
  const outDegree: Record<string, number> = {};
  for (const id of nodeIds) outDegree[id] = 0;
  for (const e of edges) outDegree[e.source] = (outDegree[e.source] ?? 0) + 1;

  // Reverse adjacency (target → sources): for walking FROM leaves TOWARD roots.
  // Initialize lazily so dangling-edge targets (not in nodeIds) are also covered.
  const reverseAdj: Record<string, string[]> = {};
  const getReverseChildren = (target: string): string[] => {
    if (!(target in reverseAdj)) reverseAdj[target] = [];
    return reverseAdj[target];
  };
  for (const e of edges) {
    getReverseChildren(e.target).push(e.source);
  }

  // Roots = nodes with out-degree 0 (they point to no parent).
  const roots: string[] = [];
  for (const id of nodeIds) {
    if (outDegree[id] === 0) roots.push(id);
  }

  // BFS from the roots, walking "down" toward the children.
  const depth: Record<string, number> = {};
  const queue: string[] = [];
  for (const root of roots) {
    depth[root] = 0;
    queue.push(root);
  }

  let maxDepth = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currDepth = depth[curr];
    for (const parent of getReverseChildren(curr)) {
      if (parent in depth) continue; // already visited
      const newDepth = currDepth + 1;
      depth[parent] = newDepth;
      if (newDepth > maxDepth) maxDepth = newDepth;
      queue.push(parent);
    }
  }

  // Map raw BFS depth to ring depth: root=0, deeper=larger numbers.
  // This matches the "ring from center" mental model (center=0, rings outward).
  const ringDepth: Record<string, number> = {};
  for (const [id, raw] of Object.entries(depth)) {
    ringDepth[id] = raw;
  }

  // ── Subtree classification (pure structure) ──────────────────────────────
  //
  // Classifier nodes: nodes that receive at least one instance_of edge.
  // Their descendants (reached by walking forward along any edge direction)
  // all belong to the same subtree and share the classifier's border color.
  //
  // Algorithm:
  //   1. Identify all classifiers (node has ≥1 instance_of incoming edge).
  //   2. Multi-source BFS from ALL classifiers at once, walking down to the
  //      children. The first classifier to reach a node is its NEAREST
  //      classifier ancestor, so nested classifiers keep their own subtree.
  //      Ties (equal distance) are broken by classifier id, so the result does
  //      not depend on file order.
  //   3. Nodes with no classifier ancestor keep subtreeRoot = undefined
  //      and fall back to the fill-based border color.

  const instanceIn: Record<string, number> = {};
  for (const id of nodeIds) instanceIn[id] = 0;
  for (const e of edges) {
    if (e.type === 'instance_of') {
      instanceIn[e.target] = (instanceIn[e.target] ?? 0) + 1;
    }
  }

  // Forward adjacency (parent → children): for DFS from classifier roots.
  // Lazy init so dangling-edge targets (not in nodeIds) are also covered.
  const forwardAdj: Record<string, string[]> = {};
  const getChildrenOf = (parent: string): string[] => {
    if (!(parent in forwardAdj)) forwardAdj[parent] = [];
    return forwardAdj[parent];
  };
  // For edge source → target (source is child of target), store source under target's key
  for (const e of edges) getChildrenOf(e.target).push(e.source);

  // Step 1: Classifiers are nodes with ≥1 instance_of incoming edge
  const classifiers = new Set<string>();
  for (const [id, count] of Object.entries(instanceIn)) {
    if (count > 0) classifiers.add(id);
  }

  // Step 2: multi-source BFS from every classifier. BFS visits in distance order,
  // so the first writer of subtreeRoot[node] is the nearest classifier ancestor.
  const subtreeRoot: Record<string, string> = {};
  const subtreeQueue: string[] = [];
  for (const c of [...classifiers].sort()) {
    subtreeRoot[c] = c; // a classifier owns itself
    subtreeQueue.push(c);
  }
  for (let qi = 0; qi < subtreeQueue.length; qi++) {
    const cur = subtreeQueue[qi];
    const owner = subtreeRoot[cur];
    for (const child of getChildrenOf(cur)) {
      if (child in subtreeRoot) continue;
      subtreeRoot[child] = owner;
      subtreeQueue.push(child);
    }
  }

  // Second pass — build nodes with degree-derived weight and BFS-computed depth.
  const nodes: NodeData[] = [];
  const seenNode = new Set<string>();
  for (const [fp, fm] of frontmatters) {
    if (!fm.id || seenNode.has(fm.id)) continue;
    seenNode.add(fm.id);

    // fill/stroke/shape 直接使用新字段
    const fill = fm.fill || '';
    const stroke = fm.stroke;
    const shape = fm.shape;
    
    nodes.push({
      id: fm.id,
      label: fm.label,
      // 新字段
      fill: fill || undefined,
      stroke,
      shape,
      depth: ringDepth[fm.id] ?? 0,
      subtreeRoot: subtreeRoot[fm.id],
      shortSummary: fm.shortSummary,
      fullSummary: fm.fullSummary,
      summary: fm.summary,
      location: fm.location,
      tags: fm.tags,
      body: fm.body,
      // The browser path keys these `../../content/<rel>...`; the CLI uses
      // absolute or repo-relative paths. Strip the well-known prefix when
      // present, otherwise fall back to whatever the caller supplied so we
      // never silently lose the file context.
      sourcePath: fp.startsWith('../../content/') ? fp.slice('../../content/'.length) : fp,
      weight: degree[fm.id] ?? 1,
      edges_out: fm.edges_out ?? [],
    });
  }

  if (danglingEdges.length > 0 && options.onDanglingEdges) {
    options.onDanglingEdges(danglingEdges);
  }

  return { nodes, edges, danglingEdges, maxDepth };
}

// ── Fast path: prebuilt graph-data.json ─────────────────────────────────────

export interface PrebuiltNode {
  id: string;
  label: string;
  rel: string;
  fill?: string;
  stroke?: string;
  shape?: string;
  shortSummary?: string;
  fullSummary?: string;
  summary?: string;
  depth?: number;
  subtreeRoot?: string;
  weight?: number;
  location?: {
    book?: string;
    part?: string;
    chapter?: string;
    section?: string;
    item?: string;
    subsection?: string;
  };
  tags?: string[];
  /** 正文。graph-data.json 里没带的话，详情面板的「正文」页就是空的（见 detail-panel.buildBodyHtml）。 */
  body?: string;
  edges_out?: Array<{ target: string; type: string; reason?: string }>;
}

export interface PrebuiltGraphData {
  nodes: PrebuiltNode[];
  edges: Array<{ id: string; source: string; target: string; type: string; reason?: string }>;
}

/**
 * Build a GraphData from the pre-built graph-data.json (generated at build time).
 *
 * The prebuilt JSON already contains:
 *   - depth (BFS-computed)
 *   - subtreeRoot (DFS-computed)
 *   - weight (degree-computed)
 *   - fill / stroke / shape / summary / location / tags
 *
 * This function only maps GraphNode → NodeData and computes maxDepth.
 * No YAML parsing, no BFS, no DFS — O(n) scan only.
 */
export function buildGraphFromPrebuilt(prebuilt: PrebuiltGraphData): BuildResult {
  const nodes: NodeData[] = prebuilt.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    fill: n.fill || undefined,
    stroke: n.stroke as NodeData['stroke'],
    shape: n.shape as NodeData['shape'],
    shortSummary: n.shortSummary,
    fullSummary: n.fullSummary,
    summary: n.summary,
    depth: n.depth ?? 0,
    subtreeRoot: n.subtreeRoot,
    weight: n.weight ?? 1,
    location: n.location,
    tags: n.tags,
    body: n.body,
    edges_out: n.edges_out,
    // rel from the prebuilt file is the sourcePath relative to public/content/
    sourcePath: n.rel,
  }));

  const maxDepth = nodes.reduce((max, n) => Math.max(max, n.depth ?? 0), 0);

  return {
    nodes,
    edges: prebuilt.edges,
    danglingEdges: [],  // dangling edges were already filtered at build time
    maxDepth,
  };
}
