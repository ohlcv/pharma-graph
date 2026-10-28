/**
 * Space computation — pure graph topology, no cytoscape.
 *
 * A "space"（空间/宇宙）is a maximal set of nodes the portal can travel
 * between. Membership is *derived*, never stored in frontmatter (ADR-0003
 * already rejected a `universe` field: the parent chain already implies it):
 *
 *   1. Split the graph into connected components (undirected — edges are
 *      child→parent by ADR-0001, but connectivity is directionless).
 *   2. A component that contains a UNIVERSE_ROOTS member *is* that universe:
 *      it gets the root's label and the root as its camera anchor.
 *   3. Everything else (decoration nodes, future strays) collapses into one
 *      catch-all space so no node is ever unreachable.
 *
 * This module is deliberately dependency-free and unit-testable: `computeSpaces`
 * accepts plain node/edge arrays shaped like graph-data.json.
 */

export interface SpaceNode {
  id: string;
  label?: string;
}

export interface SpaceEdge {
  source: string;
  target: string;
}

export interface SpaceInfo {
  /** Stable key: the universe root id, or 'misc' for the catch-all space. */
  id: string;
  /** Display name: the root's label, or '奇观与散点' for the catch-all. */
  label: string;
  /** Camera anchor — the universe root, or the first node of the misc space. */
  anchorId: string;
  /** All node ids that belong to this space. */
  nodeIds: Set<string>;
}

export const MISC_SPACE_ID = 'misc';
export const MISC_SPACE_LABEL = '奇观与散点';

/**
 * Compute the space partition of a graph.
 *
 * @param nodes    every node (id required, label used for naming universes)
 * @param edges    every edge (only source/target are read)
 * @param roots    UNIVERSE_ROOTS — ids that pin a component to a universe
 */
export function computeSpaces(
  nodes: SpaceNode[],
  edges: SpaceEdge[],
  roots: ReadonlySet<string>,
): SpaceInfo[] {
  // Union-find over node indices.
  const index = new Map<string, number>();
  nodes.forEach((n, i) => index.set(n.id, i));
  const parent = nodes.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (const e of edges) {
    const s = index.get(e.source);
    const t = index.get(e.target);
    if (s !== undefined && t !== undefined) union(s, t);
  }

  // Component id (union-find root index) → member ids, in input order.
  const members = new Map<number, string[]>();
  nodes.forEach((n, i) => {
    const r = find(i);
    const list = members.get(r);
    if (list) list.push(n.id);
    else members.set(r, [n.id]);
  });

  // Root id → its label (roots that exist in this graph).
  const rootLabels = new Map<string, string>();
  for (const n of nodes) {
    if (roots.has(n.id) && n.label) rootLabels.set(n.id, n.label);
  }

  const spaces: SpaceInfo[] = [];
  let misc: SpaceInfo | null = null;

  for (const [rootIdx, ids] of members) {
    const universeRoot = ids.find((id) => roots.has(id));
    if (universeRoot !== undefined) {
      spaces.push({
        id: universeRoot,
        label: rootLabels.get(universeRoot) ?? universeRoot,
        anchorId: universeRoot,
        nodeIds: new Set(ids),
      });
      continue;
    }
    // No universe root → catch-all space.
    if (!misc) {
      misc = {
        id: MISC_SPACE_ID,
        label: MISC_SPACE_LABEL,
        anchorId: ids[0],
        nodeIds: new Set(ids),
      };
    } else {
      ids.forEach((id) => misc!.nodeIds.add(id));
    }
    void rootIdx;
  }

  // Universes first (largest first for a stable, meaningful menu order), misc last.
  spaces.sort((a, b) => b.nodeIds.size - a.nodeIds.size);
  if (misc) spaces.push(misc);
  return spaces;
}

/** 安全区四边留白（CSS px）。按像素而不是按比例：留白是给浮层让位的，
 *  浮层宽度不随视口缩放，比例式留白在 4K 上会留出半屏空白。 */
export interface FitInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface FitTargetInput {
  /** Bounding box in model coordinates: { x1, y1, x2, y2 }. */
  bb: { x1: number; y1: number; x2: number; y2: number };
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
  /** 四边留白（CSS px）。给了就以它为准，`padding`/`topInset` 被忽略。 */
  insets?: FitInsets;
  /** Padding fraction on every side (0.1 = 10% of the viewport). */
  padding?: number;
  /** Extra CSS pixels reserved at the top (toolbar / chrome) — the box is
   *  centred in what's left below it, not in the raw viewport. */
  topInset?: number;
}

export interface FitTarget {
  zoom: number;
  /** Model-space pan such that the box centre lands in the viewport centre. */
  pan: { x: number; y: number };
}

/**
 * Compute the { zoom, pan } that frames a bounding box inside the viewport —
 * the same manual arithmetic renderer.fit() uses (cy.animate has no fit option
 * for the core, and we want the flight animated).
 *
 * 两套留白口径：`insets`（像素，优先）走的是 renderer.fit() 那套，空间传送
 * 用它才能和工具栏上的「适应视图」得到同一个缩放；`padding` + `topInset`
 * （比例）是早期口径，保留给调用方按比例缩放的场景。
 */
export function computeFitTarget(input: FitTargetInput): FitTarget {
  const { bb, width, height } = input;
  const insets = input.insets;
  let availW: number;
  let availH: number;
  let midX: number;
  let midY: number;

  if (insets) {
    const top = insets.top ?? 0;
    const right = insets.right ?? 0;
    const bottom = insets.bottom ?? 0;
    const left = insets.left ?? 0;
    availW = Math.max(1, width - left - right);
    availH = Math.max(1, height - top - bottom);
    midX = left + availW / 2;
    midY = top + availH / 2;
  } else {
    const padding = input.padding ?? 0.12;
    const topInset = input.topInset ?? 0;
    availW = Math.max(1, width * (1 - padding * 2));
    availH = Math.max(1, height * (1 - padding * 2) - topInset);
    midX = width / 2;
    // Vertical centre of the *safe* area (below the top chrome), so reserving
    // space at the top shifts the box down instead of pushing it under the bar.
    midY = (topInset + height) / 2;
  }

  const bbW = Math.max(1, bb.x2 - bb.x1);
  const bbH = Math.max(1, bb.y2 - bb.y1);
  const zoom = Math.min(availW / bbW, availH / bbH);
  const cx = (bb.x1 + bb.x2) / 2;
  const cy = (bb.y1 + bb.y2) / 2;
  return { zoom, pan: { x: midX - zoom * cx, y: midY - zoom * cy } };
}
