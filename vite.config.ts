import { defineConfig, type Plugin } from 'vite';
import { readdir, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';

const CONTENT_DIR = 'public/content';
const PUBLIC_DIR = 'public';
const MANIFEST_FILENAME = 'content-manifest.json';

/**
 * Walk `content/` recursively and emit a JSON manifest of every .md file's
 * public URL. The app `fetch`es this manifest at boot, then parallel-fetches
 * each path — keeping the markdown payloads out of the JS bundle (saves
 * ~600 KB at the cost of one extra round-trip on cold load).
 */
async function buildManifest(): Promise<void> {
  const root = process.cwd();
  const contentRoot = join(root, CONTENT_DIR);
  const publicRoot = join(root, PUBLIC_DIR);
  if (!existsSync(contentRoot)) return;

  const entries: string[] = [];
  async function walk(dir: string): Promise<void> {
    const items = await readdir(dir);
    for (const name of items) {
      const abs = join(dir, name);
      const s = await stat(abs);
      if (s.isDirectory()) {
        await walk(abs);
      } else if (name.endsWith('.md')) {
        const rel = relative(contentRoot, abs).split(sep).join(posix.sep);
        entries.push(rel);
      }
    }
  }
  await walk(contentRoot);
  entries.sort();

  if (!existsSync(publicRoot)) await mkdir(publicRoot, { recursive: true });
  await writeFile(
    join(publicRoot, MANIFEST_FILENAME),
    JSON.stringify({ files: entries, generatedAt: Date.now() }, null, 2),
    'utf8',
  );
}

function contentManifestPlugin(): Plugin {
  return {
    name: 'pharma-graph:content-manifest',
    apply: () => true,
    async buildStart() {
      await buildManifest();
    },
    async handleHotUpdate(ctx) {
      // Re-emit the manifest whenever a markdown file changes — keeps dev
      // in sync without a full server restart.
      if (ctx.file.endsWith('.md')) {
        await buildManifest();
      }
    },
  };
}

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [contentManifestPlugin()],
  optimizeDeps: {
    include: [
      'cytoscape',
      'cytoscape-cose-bilkent',
      'cytoscape-dagre',
      'cytoscape-euler',
    ],
  },
});