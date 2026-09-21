// src/ui/layout/toolbar-actions.ts
// Toolbar actions that touch the graph renderer. Extracted from layout-manager.ts
// so that file's responsibilities are scoped to layout logic only.
//
// Exported so action-handlers.ts can register them as action callbacks.
// The action names (`fit`, `randomize`, `pulse`) are defined there, not here.

import cytoscape from 'cytoscape';
import { Renderer } from '../../core/renderer.js';
import { HighlightEngine } from '../highlight-engine.js';
import { cancel as cancelForceDrag } from '../../core/force-drag.js';

export function fitGraph(renderer: Renderer): void {
  renderer.fit();
}

// Fixed world-space random range. We deliberately do NOT use
// `cy.width()`/`cy.height()` — those are viewport dimensions that vary
// across devices. A constant ±1500 world units matches what cose/dagre produce
// in their defaults, so subsequent layout switches don't yank the camera.
const RANDOMIZE_WORLD_SIZE = 1500;

export function randomize(renderer: Renderer, highlight: HighlightEngine): void {
  highlight.reset();
  const cy = renderer.getCy();
  cy.nodes()
    .not('.layer-parent')
    .forEach((node: cytoscape.NodeSingular) => {
      node.unlock();
    });
  const nodePanel = document.getElementById('node-panel');
  if (nodePanel) nodePanel.classList.remove('visible');
  const container = cy.container();
  if (container) container.style.filter = 'none';
  cy.nodes()
    .not('.layer-parent')
    .positions(() => ({
      x: (Math.random() - 0.5) * 2 * RANDOMIZE_WORLD_SIZE,
      y: (Math.random() - 0.5) * 2 * RANDOMIZE_WORLD_SIZE,
    }));
  renderer.fit();
}

export { pulseSelection as animatePulse } from '../anim-pulse.js';
