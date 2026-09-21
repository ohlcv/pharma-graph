// Vitest default — pure functions, no DOM, no real-clock.
// A file in this directory MUST NOT:
//   - import from `document`, `window`, `localStorage`
//   - mock `cytoscape`, `setTimeout`, `Date.now`, `fs`
//   - read files from disk under `public/content/**`
// If any of those are needed, move the file to tests/component/.
