// DOM/cytoscape behaviour tests.
//
// A file in this directory typically has a jsdom environment header:
//
//   /**
//    * @vitest-environment jsdom
//    */
//
// Right now this also houses "quasi-integration" tests that read the real
// content directory (e.g. parser/location-audit.test.ts) — they don't
// justify a separate layer, but are clearly more than unit work.
//
// Pure-logic tests belong in tests/unit/.
