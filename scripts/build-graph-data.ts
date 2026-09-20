/**
 * Manual entry point: regenerate public/graph-data.json from markdown frontmatter.
 *
 * Usage:
 *   npm run build:graph
 *
 * (vite build invokes this via the prebuild hook automatically.)
 */

import { buildGraphData } from './build-content.js';

const result = await buildGraphData();
process.exit(result.nodes === 0 ? 1 : 0);
