import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { scanContentDir } from '../parser/content-manager.js';
import { buildNodes } from '../core/node-builder.js';
import { buildEdges } from '../core/edge-builder.js';
import type { GraphData } from '../core/graph.js';

const ROOT = path.resolve(process.cwd());
const PORT = Number(process.env.PORT) || 4173;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function buildGraphData(): Promise<GraphData> {
  const files = await scanContentDir(path.join(ROOT, 'content'));
  const nodes = await buildNodes(files);
  const knownNodeIds = new Set(nodes.map((n) => n.id));
  const edges = await buildEdges(files, knownNodeIds);
  return { nodes, edges };
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url!.split('?')[0];

  // ── /api/graph ────────────────────────────────────────────────────────────
  if (urlPath === '/api/graph') {
    try {
      const data = await buildGraphData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Graph build error: ${msg}`);
    }
    return;
  }

  // ── Static files ──────────────────────────────────────────────────────────
  try {
    let filePath = path.join(ROOT, decodeURIComponent(urlPath));

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    } else if (!path.extname(filePath)) {
      filePath += '.html';
    }

    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
});
