import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const port = Number(process.env.PORT || 5173);
http.createServer(async (req, res) => {
  try {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (route === '/' ? '/index.html' : route));
    if (!target.startsWith(root) || route.includes('..') || !['.html', '.css', '.js', '.svg'].includes(path.extname(target))) {
      res.writeHead(404).end('Not found'); return;
    }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }).end(data);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Holdem Club is ready → http://localhost:${port}`));
