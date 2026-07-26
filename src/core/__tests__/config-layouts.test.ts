/**
 * Configuration guard tests: lock the internal consistency of LAYOUTS and
 * LayoutParam. Any PR touching src/core/config.ts will trip these tests,
 * forcing the author to keep the UI, docs, and field set in sync. Covers:
 *
 *   1. every layout's `cytoscape.name` is one of the extensions actually
 *      registered in renderer.ts
 *   2. cytoscape fields never include dead keys (cose-bilkent / dagre / euler
 *      silently ignore them per the source audit of cytoscape extension packages)
 *   3. every param.key is reachable, either as a cytoscape field or handled
 *      by cytoscape core's layoutPositions step (animationDuration / Easing)
 *   4. type='select' must carry options[] and default must be in options
 *   5. numeric param: default must lie in [min, max], step > 0, min <= max
 *   6. numeric param: default type must be `number`
 *   7. no duplicate param keys inside a single layout
 */
import { describe, it, expect } from 'vitest';
import { LAYOUTS, type LayoutParam, type LayoutConfig } from '../config';

// Dead fields per layout extension (verified against node_modules/cytoscape-*/src/).
// If a new extension version starts reading these keys, update this set and the docs.
const KNOWN_DEAD_FIELDS: Record<string, ReadonlySet<string>> = {
  'cose-bilkent': new Set(['spacingFactor', 'rStep', 'refreshInterval']),
  dagre: new Set(),
  euler: new Set(['springStrength']),
};

// Extensions that forward every option straight to their internal algorithm
// (verified by reading Layout.constructor in node_modules/<ext>/src/layout/index.js,
// where `assign({}, defaults, options)` is used). For these, params are
// automatically reachable without us listing them in the cytoscape block, so
// the "every param.key is reachable" check is relaxed to "key is not in the
// dead-field set".
const PASSTHROUGH_EXTENSIONS = new Set(['euler']);

// Extensions actually registered in renderer.ts.
const REGISTERED_LAYOUTS = new Set([
  'cose-bilkent',
  'dagre',
  'euler',
  'concentric',
  'circle',
  'grid',
  'breadthfirst',
]);

describe('LAYOUTS - config integrity', () => {
  const layoutEntries = Object.entries(LAYOUTS) as [string, LayoutConfig][];

  it('every layout name is a registered cytoscape extension', () => {
    for (const [key, layout] of layoutEntries) {
      expect(typeof layout.name, `${key}.name must be a string`).toBe('string');
      expect(
        REGISTERED_LAYOUTS.has(layout.name),
        `${key}.name="${layout.name}" not registered in renderer.ts`,
      ).toBe(true);
    }
  });

  it.each(layoutEntries)('LAYOUTS[%s].cytoscape.name is defined', (key, layout) => {
    expect(layout.cytoscape?.name ?? layout.name, `${key}.cytoscape.name`).toBeDefined();
  });

  it.each(layoutEntries)(
    'LAYOUTS[%s] cytoscape block never contains known dead fields',
    (key, layout) => {
      const cy = layout.cytoscape ?? {};
      const dead = KNOWN_DEAD_FIELDS[cy.name as string] ?? new Set<string>();
      for (const field of Object.keys(cy)) {
        expect(
          dead.has(field),
          `${key}.cytoscape.${field} is a known dead field for ${cy.name}; remove or update KNOWN_DEAD_FIELDS`,
        ).toBe(false);
      }
    },
  );

  it.each(layoutEntries)(
    'LAYOUTS[%s] every param.key is reachable (cytoscape field, core-handled, or passthrough)',
    (key, layout) => {
      const cy = layout.cytoscape ?? {};
      const cyName = cy.name as string;
      const cyKeys = new Set(Object.keys(cy));
      // animationDuration / animationEasing are consumed by cytoscape core's
      // layoutPositions step (not the extension). They are valid params even
      // when absent from cy.
      const CORE_HANDLED = new Set(['animationDuration', 'animationEasing']);
      const dead = KNOWN_DEAD_FIELDS[cyName] ?? new Set<string>();
      const passthrough = PASSTHROUGH_EXTENSIONS.has(cyName);
      for (const p of layout.params ?? []) {
        const reachable = cyKeys.has(p.key) || CORE_HANDLED.has(p.key) || passthrough;
        const knownBad = dead.has(p.key);
        // Passthrough layouts still must not have a param that we know the
        // extension ignores.
        expect(
          reachable && !knownBad,
          `${key}.params[${p.key}] is unreachable: passthrough=${passthrough}, in cy=${cyKeys.has(p.key)}, core=${CORE_HANDLED.has(p.key)}, dead=${knownBad}`,
        ).toBe(true);
      }
    },
  );

  it.each(layoutEntries.flatMap(([k, l]) => (l.params ?? []).map((p) => [k, p] as const)))(
    'LAYOUTS[%s].params[%s] defaults and ranges are sane',
    (key, p: LayoutParam) => {
      if (p.type === 'select') {
        expect(
          Array.isArray(p.options),
          `${key}.params[${p.key}] type='select' must have options[]`,
        ).toBe(true);
        expect(
          p.options!.length,
          `${key}.params[${p.key}].options must be non-empty`,
        ).toBeGreaterThan(0);
        expect(
          p.options!.includes(String(p.default)),
          `${key}.params[${p.key}].default="${p.default}" not in options`,
        ).toBe(true);
        return;
      }
      if (p.type === 'bool') {
        expect(
          [0, 1, true, false].includes(p.default as number | boolean),
          `${key}.params[${p.key}].default must be boolean-ish`,
        ).toBe(true);
        return;
      }
      // numeric range slider
      expect(typeof p.default, `${key}.params[${p.key}].default must be a number`).toBe('number');
      expect(p.min).toBeDefined();
      expect(p.max).toBeDefined();
      expect(p.min! <= p.max, `${key}.params[${p.key}].min must be <= max`).toBe(true);
      expect((p.step ?? 0) > 0, `${key}.params[${p.key}].step must be > 0`).toBe(true);
      expect(
        (p.default as number) >= p.min!,
        `${key}.params[${p.key}].default=${p.default} < min=${p.min}`,
      ).toBe(true);
      expect(
        (p.default as number) <= p.max!,
        `${key}.params[${p.key}].default=${p.default} > max=${p.max}`,
      ).toBe(true);
    },
  );

  it('no duplicate param keys inside a single layout', () => {
    for (const [key, layout] of layoutEntries) {
      const seen = new Set<string>();
      for (const p of layout.params ?? []) {
        expect(seen.has(p.key), `LAYOUTS[${key}] has duplicate param.key="${p.key}"`).toBe(false);
        seen.add(p.key);
      }
    }
  });
});
