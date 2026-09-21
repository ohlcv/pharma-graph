import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { computeGraphData } from '../build/build-content.js';

const ROOT = path.resolve(process.cwd());
// 静态根目录指向构建产物 dist/（含 index.html + graph-data.json + 内容副本）。
// 注意：public/ 是源资产目录，没有 index.html（那是构建产物，Vite 构建时生成到 dist/）。
const STATIC_DIR = path.join(ROOT, 'dist');
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

const server = http.createServer(async (req, res) => {
  const urlPath = req.url!.split('?')[0];

  // ── /api/graph ────────────────────────────────────────────────────────────
  if (urlPath === '/api/graph') {
    try {
      // 动态构建：与预生成 graph-data.json 共享同一份 computeGraphData() 实现。
      // 内容在 public/content/ 下（旧实现错指 content/，会扫到空目录返回空图）。
      const data = await computeGraphData();
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
    // 静态根目录指向 dist/，让 /、/graph-data.json、/content/*.md 命中构建产物。
    let filePath = path.join(STATIC_DIR, decodeURIComponent(urlPath));

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
