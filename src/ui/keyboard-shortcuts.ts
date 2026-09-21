import cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import { HighlightEngine } from './highlight-engine.js';

export interface ShortcutCallbacks {
  fitGraph: () => void;
  randomize: () => void;
  toggleTour: () => void;
  tourPause: () => void;
  closeNodePanel: () => void;
  tourStop: () => void;
  tourPrev?: () => void;
  tourNext?: () => void;
  /**
   * Optional hook fired right before nodes are deleted. Use it to surface a
   * "press again to confirm" toast. Called with the count of nodes about to be
   * removed.
   */
  requestDelete?: (count: number) => void;
}

/**
 * Two-step delete to avoid catastrophic loss from accidental keystrokes.
 *  - First Backspace/Delete while nodes are selected → arm a 2 s confirmation
 *    window and show a toast. Returns without deleting.
 *  - Second Backspace/Delete within the window → actually delete.
 *  - Any other keypress cancels the armed state.
 */
const DELETE_ARM_WINDOW_MS = 2000;
let deleteArmedAt = 0;

export function initShortcuts(cy: Core, callbacks: ShortcutCallbacks): void {
  const cancelDeleteArm = () => { deleteArmedAt = 0; };
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    ) {
      return;
    }

    // Arm/confirm Backspace + Delete so a stray keystroke can't wipe the graph.
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selected = cy.$(':selected').nodes();
      if (selected.length === 0) return;
      const now = performance.now();
      if (now - deleteArmedAt <= DELETE_ARM_WINDOW_MS) {
        // Second press within window — confirm and delete.
        selected.remove();
        deleteArmedAt = 0;
      } else {
        // First press — arm.
        deleteArmedAt = now;
        callbacks.requestDelete?.(selected.length);
      }
      e.preventDefault();
      return;
    }

    // Any other shortcut cancels the pending delete arm.
    if (deleteArmedAt !== 0 && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Tab')) {
      cancelDeleteArm();
    }

    // 带修饰键的组合（Ctrl+F / Cmd+R / Ctrl+P / Cmd+T …）是浏览器的，
    // 不能当成单键快捷键（否则 Ctrl+F 会触发"适应"、Ctrl+P 会触发"漫游暂停"）。
    // 唯一的例外是下面自己处理的 Ctrl/Cmd+A。
    const isSelectAll = (e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey);
    if ((e.ctrlKey || e.metaKey || e.altKey) && !isSelectAll) return;

    switch (e.key) {
      case 'Escape':
        cy.$(':selected').unselect();
        callbacks.closeNodePanel();
        if (callbacks.tourStop) callbacks.tourStop();
        break;
      case 'f':
      case 'F':
        callbacks.fitGraph();
        break;
      case 'r':
      case 'R':
        callbacks.randomize();
        break;
      case 't':
      case 'T':
        callbacks.toggleTour();
        break;
      case 'a':
      case 'A':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); cy.nodes().not('.layer-parent').select(); }
        break;
      case 'p':
      case 'P':
        callbacks.tourPause();
        break;
      case '[':
        if (callbacks.tourPrev) callbacks.tourPrev();
        break;
      case ']':
        if (callbacks.tourNext) callbacks.tourNext();
        break;
    }
  });
}
