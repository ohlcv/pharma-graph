/**
 * Regression test for the user-reported mobile bug:
 *   "展开底部面板时它先往上跳了一段再回落，底部露出一块黑条"
 *
 * Root cause:
 *   `#bottom-sheet` animated `transform` with `cubic-bezier(0.34, 1.4, 0.64, 1)`
 *   — a "back-out" curve whose progress exceeds 1 (peak ≈ 1.053). The sheet is
 *   anchored to the viewport bottom (`bottom: 0`), so progress > 1 drives
 *   translateY negative: the panel rises above its resting position and the
 *   page background (--bg = #020617, near-black) shows through underneath it
 *   until the curve settles back to 0.
 *
 *   Measured in headless Chrome (390×757 viewport, 548px-tall sheet, animated
 *   value scrubbed via the Web Animations API):
 *     legacy curve  → overshoot 28.99px, bottom gap 28.99px at t≈200/320ms
 *     current curve → overshoot  0.00px, bottom gap −0.01px
 *
 * Invariant pinned here: every cubic-bezier that drives the sheet's own
 * transition must keep its y control points ≤ 1 (no overshoot). Bouncy curves
 * remain fine for icons and scales (#sheet-expand-bar svg, #fab) — those
 * elements can afford to overshoot; the sheet cannot, because it is glued to
 * the viewport bottom.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Strip comments first (they may contain braces/semicolons), then collapse all
// whitespace so every rule reads as `selector { body }` on a single line.
const css = readFileSync(join(process.cwd(), 'src/ui/styles/components.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ');

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.trim(),
  body,
}));

/** Rules whose selector list targets the sheet itself (with or without state). */
const sheetRules = rules.filter((rule) =>
  rule.selector.split(',').some((part) => {
    const s = part.trim();
    return (
      s === '#bottom-sheet' ||
      s.startsWith('#bottom-sheet.') ||
      s === '.bottom-sheet' ||
      s.startsWith('.bottom-sheet.')
    );
  }),
);

describe('mobile bottom-sheet transform easing', () => {
  it('finds the sheet rules and at least one transform transition', () => {
    expect(sheetRules.length).toBeGreaterThan(0);
    expect(sheetRules.some((r) => /transition[^:]*:[^;]*transform/.test(r.body))).toBe(true);
  });

  it('keeps y control points ≤ 1 so the sheet never overshoots translateY(0)', () => {
    const easings = sheetRules.flatMap((rule) =>
      [...rule.body.matchAll(/transition[^:]*:([^;]+)/g)].flatMap(([, decl]) =>
        [...decl.matchAll(/cubic-bezier\(\s*([^)]+)\)/g)].map((m) => m[1]),
      ),
    );

    expect(easings.length).toBeGreaterThan(0);
    for (const raw of easings) {
      const nums = raw.split(',').map((n) => Number(n.trim()));
      expect(nums, `unparseable cubic-bezier(${raw})`).toHaveLength(4);
      const [x1, y1, x2, y2] = nums;
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(1);
      expect(x2).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(1);
      expect(y1, `cubic-bezier(${raw}) overshoots (y1=${y1})`).toBeLessThanOrEqual(1);
      expect(y2, `cubic-bezier(${raw}) overshoots (y2=${y2})`).toBeLessThanOrEqual(1);
    }
  });

  it('rests exactly at translateY(0) in the open state', () => {
    const openRules = sheetRules.filter((r) =>
      r.selector.split(',').some((part) => part.trim().endsWith('.open')),
    );
    expect(openRules.length).toBeGreaterThan(0);
    for (const rule of openRules) {
      expect(rule.body).toMatch(/transform:\s*translateY\(0\)/);
    }
  });
});
