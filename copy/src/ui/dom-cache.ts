/**
 * Centralized DOM registry — caches one-shot querySelectorAll results so that
 * hot-path code (search, legend reset, layout switch) can iterate a static
 * array instead of re-running a full document scan every event.
 *
 * Pattern in call sites:
 *   // before:
 *   document.querySelectorAll('.legend-row, .bs-chip').forEach(el => el.classList.remove('active'));
 *
 *   // after:
 *   import { staticEls } from './dom-cache.js';
 *   staticEls('legend-row', 'bs-chip').forEach(el => el.classList.remove('active'));
 *
 * The selector list is treated as a key: first call queries and caches; later
 * calls return the same array. Cached array is a snapshot — DOM mutations that
 * add new .legend-row are not picked up automatically. To invalidate (e.g.
 * after re-rendering the legend), call invalidateStatic() or invalidateKeys().
 */
type Selector = string;

const cache = new Map<string, HTMLElement[]>();

function cacheKey(selectors: Selector[]): string {
  return selectors.join('|');
}

/** Get a stable array of elements matching any of `selectors`. */
export function staticEls(...selectors: Selector[]): HTMLElement[] {
  const key = cacheKey(selectors);
  let arr = cache.get(key);
  if (arr) return arr;
  const selector = selectors.join(',');
  arr = Array.from(document.querySelectorAll<HTMLElement>(selector));
  cache.set(key, arr);
  return arr;
}

/**
 * Variant for arrays of selectors paired with a per-select callback. The
 * callback receives each element once even if multiple selectors match.
 */
export function forEachStatic(
  cb: (el: HTMLElement) => void,
  ...selectors: Selector[]
): void {
  staticEls(...selectors).forEach(cb);
}

/** Drop a single cached selector group. */
export function invalidateKey(...selectors: Selector[]): void {
  cache.delete(cacheKey(selectors));
}

/** Drop every cached selector group — call this after a major DOM rebuild. */
export function invalidateStatic(): void {
  cache.clear();
}
