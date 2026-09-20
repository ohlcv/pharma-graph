/**
 * Manual entry point: regenerate public/content-manifest.json + public/sitemap.xml.
 *
 * Usage:
 *   npm run build:manifest
 *
 * (vite build invokes this via the prebuild hook automatically.)
 */

import { buildManifest } from './build-content.js';

const result = await buildManifest();
process.exit(result.files === 0 ? 1 : 0);
