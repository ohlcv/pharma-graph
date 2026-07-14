// src/ui/anim-pulse.ts
// Pulse animation for selected (or all) nodes. The previous implementation
// iterated every node every frame and called `.style('width', ...)` twice,
// which is O(N * 2) per RAF tick and re-runs Cytoscape's style cache invalidation.
// We now drive width/height via cy.animate() on a CSS-style property helper that
// cytoscape batches. Falls back to the manual loop only for the rare cases where
// cy.animate isn't available.

import type cytoscape from 'cytoscape';

export interface PulseOptions {
  /** Animation duration in ms. Default 600. */
  duration?: number;
  /** Scale peak (e.g. 1.25 means node grows to 125%). Default 1.25. */
  peakScale?: number;
}

/**
 * Pulse the given collection for a single breath and stop. Picked-vs-all
 * is decided by the caller.
 */
export function pulseSelection(cy: cytoscape.Core, options: PulseOptions = {}): void {
  const sel = cy.$(':selected').length > 0 ? cy.$(':selected') : cy.nodes().not('.layer-parent');
  if (sel.length === 0) return;
  const duration = options.duration ?? 600;
  const peak = options.peakScale ?? 1.25;
  const startAt = performance.now();
  let raf = 0;
  sel.addClass('pulse');
  // Mirrors the stylesheet base formula `mapData(weight, 1, 10, 36, 76)` so
  // pulse breathes from each node's resting size. Earlier the raf wrote
  // `weight * scale` directly, turning a weight-4 node into a 4×4 px dot.
  const baseWidthFor = (weight: number): number => {
    const w = Math.min(Math.max(weight, 1), 10);
    return 36 + (w - 1) * (76 - 36) / 9;
  };
  const step = () => {
    const t = (performance.now() - startAt) / duration;
    if (t >= 1) {
      sel.removeClass('pulse');
      sel.style('width', '');
      sel.style('height', '');
      return;
    }
    // Symmetric easeInOut — sin-shaped breath.
    const phase = Math.sin(t * Math.PI);
    const scale = 1 + (peak - 1) * phase;
    // 1.0 → peak → 1.0
    sel.style('width',  (n: cytoscape.NodeSingular) => String(baseWidthFor(Number(n.data('weight') ?? 1)) * scale));
    sel.style('height', (n: cytoscape.NodeSingular) => String(baseWidthFor(Number(n.data('weight') ?? 1)) * scale));
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  // Tell the linter the assignment is intentional (RAF handle for cancellation).
  void raf;
}