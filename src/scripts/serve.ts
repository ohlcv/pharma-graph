import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  try {
    const urlPath = req.url!.split('?')[0];
    let filePath = path.join(ROOT, decodeURIComponent(urlPath));

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    } else if (!path.extname(filePath)) {
      filePath += '.html';
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = err.code === 'ENOENT' ? 404 : 500;
        res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
        return;
      }
      res.setHeader('content-type', (MIME as Record<string, string>)[path.extname(filePath)] || 'application/octet-stream');
      res.end(data);
    });
  } catch {
    res.statusCode = 400;
    res.end('Bad request');
  }
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
});
