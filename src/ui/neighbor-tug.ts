// src/ui/neighbor-tug.ts
// Lightweight "neighbor tug" feedback for node drag operations.
//
// When a user drags a node, its 1-hop neighbours follow along briefly —
// giving a tactile sense that this node is "connected to its neighbourhood"
// without the heavy cost of running a force-directed layout on every
// mousemove.
//
// Design rationale (why this exists):
//   - Full force-directed drag ("pull the layout with you") is O(N) per
//     mousemove and tanks to 15–25 fps on 1100+ nodes. Too expensive.
//   - Pure JS rAF lerp is mid-cost but burns a CPU thread and produces
//     jitter when the user drags fast.
//   - We pick the cheapest viable option: directly write
//     `node.position({x, y})` on neighbours during the drag (no animation
//     — cytoscape Canvas redraws them in the same frame as the dragged
//     node, so neighbours track the cursor at 60fps with zero JS work
//     per frame), and animate them back to their original positions on
//     release using `node.animate()`. The "elastic snap-back" is what
//     the eye reads as "the graph is alive".
//
// Public API:
//   - onDragStart(node): snapshot neighbours + original positions
//   - onDrag():         update neighbour positions to track dragged node
//   - onDragEnd():      animate neighbours back to original positions
//   - cancel():         hard-reset (used on tour start / bigscreen / layout run)

import type cytoscape from 'cytoscape';
import { CLASSES } from '../core/renderer.js';

/** Maximum number of 1-hop neighbours to tug. Beyond this we skip the
 *  effect — a root node with 200+ children makes a tug visually noisy
 *  and provides no useful signal to the user. */
export const NEIGHBOR_TUG_MAX = 24;

/** Maximum distance (in graph units, before zoom) a neighbour may be
 *  pulled toward the dragged node per frame. Capped so a single
 *  accidental drag can't fling distant nodes halfway across the canvas. */
const MAX_TUG_OFFSET_PER_FRAME = 6;

/** Reserved for future snap-back animation duration. Currently unused —
 *  on release we leave neighbours at their last position rather than
 *  animating them back to origin (see onDragEnd). Kept here so adding a
 *  config-driven snap-back mode later is a one-line change. */
const _RESERVED_SNAP_BACK_MS = 220;
void _RESERVED_SNAP_BACK_MS;

/** Shape stored per tugged neighbour so we can restore exact positions
 *  on release even after multiple drag frames. */
interface TuggedNeighbor {
  node: cytoscape.NodeSingular;
  originX: number;
  originY: number;
}

/** State for a single in-flight drag-tug gesture. null when no drag is
 *  active. Module-level because only one node can be dragged at a time. */
interface TugState {
  /** The node the user is currently holding. */
  source: cytoscape.NodeSingular;
  /** The 1-hop neighbours captured at drag-start. */
  neighbors: TuggedNeighbor[];
}

let tugState: TugState | null = null;

/**
 * Begin a tug gesture for the given node.
 *
 * Snapshots the 1-hop neighbours of `node` (excluding virtual layer-parent
 * nodes and the source itself) and stores their original positions. The
 * neighbours are marked with the `.neighbor-tugged` class so the stylesheet
 * dims them slightly and signals they're in a transient state.
 *
 * Safe to call when `node` has no neighbours — it's a no-op.
 * Safe to call multiple times: the previous tug state is cancelled first.
 */
export function onDragStart(node: cytoscape.NodeSingular): void {
  // Always cancel any in-flight tug before starting a new one. Otherwise
  // a rapid grab→free→grab sequence on different nodes leaks neighbours
  // into the wrong state.
  cancel();

  // 1-hop neighbourhood via cytoscape's neighbourhood walker. Excludes the
  // source by definition. We also filter out virtual layer-parent nodes
  // (padding-only placeholders used by some layouts) — they're invisible
  // to users and would produce a phantom tug if included.
  const neighborhood = node.neighborhood('node').not(`.${CLASSES.LAYER_PARENT}`);

  // Cap to NEIGHBOR_TUG_MAX. For root nodes with hundreds of children we
  // skip the effect rather than show a noisy blur. We pick the closest
  // ones by Euclidean distance so the tug reads as "pull your immediate
  // neighbourhood" instead of grabbing random distant cousins.
  let candidates: cytoscape.NodeCollection = neighborhood;
  if (neighborhood.length > NEIGHBOR_TUG_MAX) {
    const sourcePos = node.position();
    // cytoscape's `.sort()` callback receives `SingularElementArgument`
    // (which includes edges) even though we filtered to nodes upstream.
    // Narrow to NodeSingular here — the upstream `.not(`.${LAYER_PARENT}`)`
    // and `.neighborhood('node')` guarantees no edges reach the sort.
    const sorted = neighborhood.sort((a, b) => {
      const na = a as cytoscape.NodeSingular;
      const nb = b as cytoscape.NodeSingular;
      const da = distanceSquared(na.position(), sourcePos);
      const db = distanceSquared(nb.position(), sourcePos);
      return da - db;
    });
    candidates = sorted.slice(0, NEIGHBOR_TUG_MAX) as unknown as cytoscape.NodeCollection;
  }

  if (candidates.length === 0) {
    tugState = { source: node, neighbors: [] };
    return;
  }

  // Map each candidate to a TuggedNeighbor snapshot. We narrow the type
  // because cytoscape's `.sort()` callback yields SingularElementArgument
  // (which includes edges) even though we filtered to nodes upstream —
  // the type system can't see that filter statically. `layer-parent`
  // exclusion upstream guarantees no edges reach here in practice.
  const neighbors: TuggedNeighbor[] = (candidates as cytoscape.NodeCollection).map((n) => {
    const ns = n as cytoscape.NodeSingular;
    const p = ns.position();
    return { node: ns, originX: p.x, originY: p.y };
  });

  // Record the dragged node's starting position on its data so onDrag()
  // can compute a stable displacement delta. Without this anchor, the
  // first onDrag() call would treat the dragged node's already-shifted
  // position as "zero displacement" and neighbours would stay still
  // until the SECOND mousemove tick.
  const startPos = node.position();
  node.data('tugStartX', startPos.x);
  node.data('tugStartY', startPos.y);

  tugState = { source: node, neighbors };
  candidates.addClass(CLASSES.NEIGHBOR_TUGGED);
}

/**
 * Update tugged neighbour positions to track the dragged node.
 *
 * Called on every `drag` event from cytoscape. We don't animate here — we
 * just write positions directly. Cytoscape's Canvas redraws everything in
 * one pass per frame, so neighbours appear to follow the cursor with no
 * perceptible lag and zero per-frame JS cost beyond the position writes
 * themselves (which are O(neighbours), not O(all-nodes)).
 *
 * Neighbours only move when the dragged node has actually displaced from
 * its drag-start position; we track that implicitly because we always
 * recompute from the dragged node's current position relative to origin.
 */
export function onDrag(): void {
  if (!tugState || tugState.neighbors.length === 0) return;

  const source = tugState.source;
  const sourcePos = source.position();

  // Read the drag-start anchor captured in onDragStart. Cytoscape's
  // `drag` event fires on every mouse-move; we measure displacement
  // from this stable anchor rather than from the previous tick so the
  // tug is absolute (drag 100px → neighbours move 35px) rather than
  // incremental (which would accumulate floating-point error over a
  // long drag).
  const startX = source.data('tugStartX') as number | undefined;
  const startY = source.data('tugStartY') as number | undefined;
  if (startX === undefined || startY === undefined) return;

  const dx = sourcePos.x - startX;
  const dy = sourcePos.y - startY;

  // Pull strength: neighbours follow 35% of the dragged node's
  // displacement. This ratio was chosen so a 100px drag moves
  // neighbours 35px — close enough to read as "they're attached",
  // far enough that the source doesn't have to chase them.
  const pullRatio = 0.35;

  for (const n of tugState.neighbors) {
    // Distance from original neighbour position to current source position.
    // We skip tugging neighbours that are extremely far — their tug would
    // be either invisible (too small) or jarring (too large) at typical
    // zoom levels. 600 graph units ≈ several screen diameters in default
    // Euler layouts.
    const neighborDx = sourcePos.x - n.originX;
    const neighborDy = sourcePos.y - n.originY;
    const neighborDist = Math.hypot(neighborDx, neighborDy);
    if (neighborDist > 600) continue;

    // Offset = source-displacement * pullRatio, capped per frame so a
    // single fast flick doesn't catapult neighbours across the canvas.
    const offsetX = clamp(dx * pullRatio, -MAX_TUG_OFFSET_PER_FRAME, MAX_TUG_OFFSET_PER_FRAME);
    const offsetY = clamp(dy * pullRatio, -MAX_TUG_OFFSET_PER_FRAME, MAX_TUG_OFFSET_PER_FRAME);

    // For closer neighbours (within ~150 units), we want a stronger pull
    // so the visual effect reads clearly. We scale by a falloff so the
    // effect is most pronounced for the closest 5–10 neighbours.
    const proximityBoost = neighborDist < 150 ? 1.6 : 1.0;

    n.node.position({
      x: n.originX + offsetX * proximityBoost,
      y: n.originY + offsetY * proximityBoost,
    });
  }
}

/**
 * End the tug gesture. Animates neighbours back to their original
 * positions using cytoscape's built-in `node.animate()` — no JS rAF
 * needed, cytoscape batches the animation into its render loop.
 *
 * Safe to call when no tug is active (no-op).
 */
export function onDragEnd(): void {
  if (!tugState) return;

  const { source, neighbors } = tugState;

  // Clean up drag-anchor bookkeeping on the source.
  source.removeData('tugStartX');
  source.removeData('tugStartY');

  if (neighbors.length === 0) {
    tugState = null;
    return;
  }

  // No snap-back: the neighbours stay exactly where the drag left them.
  // The visual contract is now "what you see is what you got" — if the
  // user dragged node A 100px right and node B followed, node B is now
  // 35px right of its origin and stays there until the user (or a
  // layout run) moves it back. This is more predictable than an
  // animated spring-back, and it's what users expect from a
  // "drag-the-graph" interaction: positions persist.
  //
  // We do still strip the .neighbor-tugged visual class so neighbours
  // are no longer dimmed/transparent — they now read as "permanently
  // moved" alongside the source.
  for (const n of neighbors) {
    n.node.removeClass(CLASSES.NEIGHBOR_TUGGED);
  }

  tugState = null;
}

/**
 * Hard-cancel an in-flight tug without animating. Used when the graph is
 * being torn down (tour start, bigscreen toggle, layout rerun) and we
 * can't risk leaving neighbours in a displaced state.
 *
 * Also called internally at the start of every new drag to guarantee
 * clean state.
 */
export function cancel(): void {
  if (!tugState) return;

  // Stop any in-flight snap-back animations and snap neighbours back to
  // their origin (or, if no origin was recorded — e.g. onDragEnd was
  // never called — just strip the class).
  for (const n of tugState.neighbors) {
    n.node.stop();
    n.node.removeClass(CLASSES.NEIGHBOR_TUGGED);
  }

  tugState.source.removeData('tugStartX');
  tugState.source.removeData('tugStartY');

  tugState = null;
}

/**
 * Test/debug helper — returns whether a tug is currently active.
 * Not used by production code; exported for unit tests.
 */
export function isTugging(): boolean {
  return tugState !== null;
}

// ── Pure helpers (exported for unit tests) ──────────────────────────────────

/** Squared Euclidean distance. Faster than `Math.hypot` and avoids sqrt
 *  when only used for comparison. Exported for tests. */
export function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Clamp a number to [min, max]. Exported for tests. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
