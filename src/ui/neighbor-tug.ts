// src/ui/neighbor-tug.ts
// "Neighbor tug" feedback for node drag operations.
//
// When a user drags a node, its 1-hop neighbours follow along like
// buoys tethered to a moving boat — pulled by a spring force, slowed
// by drag, with enough inertia to "lag" behind the source but not
// enough to overshoot wildly. This is the "水中拖线" feel.
//
// Integration style (d3-force style, NOT Verlet):
//   d3-force uses Euler integration on velocity:
//     1. force = -k * (rest - current)            // Hooke spring
//     2. velocity += force * dt                   // apply acceleration
//     3. velocity *= (1 - velocityDecay)          // friction (water drag)
//     4. position += velocity * dt                // move
//
//   We adopted this style because it produces a "water drag" feel
//   naturally: high velocityDecay → lots of drag → smooth follow,
//   no overshoot. Verlet (v3 attempt) encoded velocity in position
//   difference and over-amplified oscillation; d3-style Euler on
//   velocity is more intuitive to tune and matches what users expect
//   from graphs (Obsidian, D3 examples, etc.).
//
// Why per-neighbour springs (not a full layout rerun):
//   - Force-directed layout on every mousemove is O(N) per frame and
//     tanks to 15-25 fps on 1100+ nodes.
//   - Per-neighbour spring is O(neighbours) per frame, capped at
//     NEIGHBOR_TUG_MAX (24). That's ~24 Hooke calcs + 24 position
//     writes per frame, well within a 16ms budget.
//   - The "tug" reads as "your neighbours are connected to you",
//     not "the entire graph is connected" — a full layout would
//     make every node jiggle.
//
// Public API:
//   - onDragStart(node): snapshot neighbours + initial state
//   - onDrag():         mark that source moved (no-op for spring tick)
//   - onDragEnd():      release — anchor returns to origin
//   - cancel():         hard-reset (tour / bigscreen / layout rerun)

import type cytoscape from 'cytoscape';
import { CLASSES } from '../core/renderer.js';

/** Maximum number of 1-hop neighbours to tug. */
export const NEIGHBOR_TUG_MAX = 24;

/** Per-tick friction. Higher = more drag = smoother, less overshoot.
 *  0.4 = d3-force default (too loose for our use: neighbour lags far
 *        behind when the user drags fast, stretching the edge).
 *  0.6 = heavy drag, smooth follow.
 *  0.86 ≈ critical damping for SPRING_K = 0.5 (no oscillation).
 *
 *  We pick 0.7: tight enough to catch up to a fast-dragged source
 *  within a few ticks, loose enough to feel elastic. */
const VELOCITY_DECAY = 0.7;

/** Hooke spring stiffness (k). The spring connects each neighbour to
 *  a "target" position:
 *    - while dragging: target = source position + neighbour's origin offset
 *    - while released: target = neighbour's origin position
 *  Force per tick: -k * (current - target), applied to velocity.
 *
 *  Steady-state lag under constant source velocity is roughly
 *  v_source / (k * (1 - velocityDecay)). With k=2 and decay=0.7,
 *  a 100-units/tick source drag stabilises at ~167 unit lag —
 *  acceptable, neighbour stays within view. */
const SPRING_K = 2;

// (MAX_TUG_DISTANCE removed — every 1-hop neighbour follows the source
// regardless of how far it has been dragged. The spring just has to
// keep up with the source velocity; otherwise the edge stretches.)

/** Convergence threshold — when neighbour is within this many units of
 *  its target AND its speed is below REST_VELOCITY, the spring stops.
 *  Picked to match human-perceptible "settled" threshold (~1px on screen
 *  at default zoom). */
const REST_DISTANCE = 1.0;
const REST_VELOCITY = 0.05;

/** Shape stored per tugged neighbour. We carry per-neighbour velocity
 *  because d3-style integration mutates velocity each tick. */
interface TuggedNeighbor {
  node: cytoscape.NodeSingular;
  /** Resting position (= origin position). The spring target while
   *  released is exactly origin; while dragging, target shifts with
   *  source by the same offset that existed at grab time. */
  originX: number;
  originY: number;
  /** Velocity (graph units per tick). The spring accelerates the
   *  neighbour, friction slows it. */
  vx: number;
  vy: number;
}

interface TugState {
  source: cytoscape.NodeSingular;
  neighbors: TuggedNeighbor[];
  rafId: number | null;
  /** True while user is dragging (target follows source). False after
   *  release (target returns to origin). */
  active: boolean;
}

let tugState: TugState | null = null;

export function onDragStart(node: cytoscape.NodeSingular): void {
  cancel();

  const neighborhood = node.neighborhood('node').not(`.${CLASSES.LAYER_PARENT}`);

  let candidates: cytoscape.NodeCollection = neighborhood;
  if (neighborhood.length > NEIGHBOR_TUG_MAX) {
    const sourcePos = node.position();
    const sorted = neighborhood.sort((a, b) => {
      const na = a as cytoscape.NodeSingular;
      const nb = b as cytoscape.NodeSingular;
      const da = distanceSquared(na.position(), sourcePos);
      const db = distanceSquared(nb.position(), sourcePos);
      return da - db;
    });
    candidates = sorted.slice(0, NEIGHBOR_TUG_MAX) as unknown as cytoscape.NodeCollection;
  }

  const neighbors: TuggedNeighbor[] = (candidates as cytoscape.NodeCollection).map((n) => {
    const ns = n as cytoscape.NodeSingular;
    const p = ns.position();
    return { node: ns, originX: p.x, originY: p.y, vx: 0, vy: 0 };
  });

  // Record source drag-start anchor so the spring can compute the
  // target position (anchor + origin offset). We keep this even after
  // release — it's the "home" the spring pulls back to.
  const startPos = node.position();
  node.data('tugStartX', startPos.x);
  node.data('tugStartY', startPos.y);

  tugState = { source: node, neighbors, rafId: null, active: true };
  candidates.addClass(CLASSES.NEIGHBOR_TUGGED);

  startSpringLoop();
}

export function onDrag(): void {
  if (!tugState) return;
  tugState.active = true;
  if (tugState.rafId === null) {
    startSpringLoop();
  }
}

export function onDragEnd(): void {
  if (!tugState) return;
  if (!tugState.active) return; // already released
  // Neighbours stay where the spring left them — no snap-back to origin.
  // The drag has permissively rearranged the neighbourhood; the user owns
  // the new layout now.
  cancel();
}

export function cancel(): void {
  if (!tugState) return;
  if (tugState.rafId !== null) {
    cancelAnimationFrame(tugState.rafId);
    tugState.rafId = null;
  }
  for (const n of tugState.neighbors) {
    n.node.stop();
    n.node.removeClass(CLASSES.NEIGHBOR_TUGGED);
  }
  tugState.source.removeData('tugStartX');
  tugState.source.removeData('tugStartY');
  tugState = null;
}

export function isTugging(): boolean {
  // True while the spring is actively running (rAF loop scheduled).
  // False when: no tug started, spring converged naturally, or
  // cancel() was called.
  return tugState !== null && tugState.rafId !== null;
}

// ── Spring loop ──────────────────────────────────────────────────────────────

function startSpringLoop(): void {
  if (!tugState || tugState.rafId !== null) return;

  const tickFn = (): void => {
    if (!tugState) return;

    const source = tugState.source;
    const sourcePos = source.position();
    const sourceStartX = source.data('tugStartX') as number | undefined;
    const sourceStartY = source.data('tugStartY') as number | undefined;

    // Per-neighbour spring step. d3-force style:
    //   force = -k * (current - target)
    //   v += force
    //   v *= (1 - velocityDecay)
    //   pos += v

    let allAtRest = true;

    for (const n of tugState.neighbors) {
      // Compute target position for this tick.
      //   While active: target = source position + neighbour's origin
      //     offset from source's drag-start. This makes the neighbour
      //     "follow along" — its distance from the source is preserved.
      //   While released: target = origin position. Spring pulls back.
      let targetX: number;
      let targetY: number;
      if (tugState.active) {
        const offsetX = n.originX - (sourceStartX ?? sourcePos.x);
        const offsetY = n.originY - (sourceStartY ?? sourcePos.y);
        targetX = sourcePos.x + offsetX;
        targetY = sourcePos.y + offsetY;
      } else {
        targetX = n.originX;
        targetY = n.originY;
      }

      const current = n.node.position();

      // Hooke spring: force points from current toward target.
      // We use k=0.15 and unit mass so force ≈ 0.15 * (target - current).
      const forceX = SPRING_K * (targetX - current.x);
      const forceY = SPRING_K * (targetY - current.y);

      // Apply force to velocity (acceleration).
      n.vx += forceX;
      n.vy += forceY;

      // Friction (water drag): velocity decays by VELOCITY_DECAY per tick.
      n.vx *= 1 - VELOCITY_DECAY;
      n.vy *= 1 - VELOCITY_DECAY;

      // Integrate position.
      const newX = current.x + n.vx;
      const newY = current.y + n.vy;
      n.node.position({ x: newX, y: newY });

      // Convergence check: a neighbour is at rest iff it's near its
      // target AND moving slowly.
      //
      // IMPORTANT: when tugState.active=true (user still dragging), we
      // suppress convergence — the "target" follows the source, so the
      // neighbour is constantly being pulled. We only declare
      // convergence after release (active=false) so the spring can
      // settle the neighbour at its origin and stop running.
      //
      // Without this suppression, the spring would naturally stop
      // after the neighbour reaches `source.position + origin_offset`
      // (the active target) and then never re-engage when the user
      // releases — the neighbour would be stuck at "active target"
      // instead of returning to its origin.
      if (!tugState.active) {
        const distFromTarget = Math.hypot(newX - targetX, newY - targetY);
        const speed = Math.hypot(n.vx, n.vy);
        if (distFromTarget > REST_DISTANCE || speed > REST_VELOCITY) {
          allAtRest = false;
        }
      } else {
        // Active: never at rest until release.
        allAtRest = false;
      }
    }

    if (allAtRest) {
      // Spring converged after release. Stop the rAF loop but keep
      // tugState alive so a subsequent onDrag() can re-engage the
      // spring if the user re-grabs. Strip the visual class.
      if (tugState.rafId !== null) {
        cancelAnimationFrame(tugState.rafId);
        tugState.rafId = null;
      }
      for (const n of tugState.neighbors) {
        n.node.removeClass(CLASSES.NEIGHBOR_TUGGED);
      }
      return;
    }

    if (tugState) {
      tugState.rafId = requestAnimationFrame(tickFn);
    }
  };

  tugState.rafId = requestAnimationFrame(tickFn);
}

// ── Pure helpers (exported for unit tests) ──────────────────────────────────

export function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
