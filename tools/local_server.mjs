/**
 * Local development server (run.bat backend).
 *
 * Serves the static app on 0.0.0.0:8484 (PC + LAN/phone access) and exposes
 * the /api/price live-pricing proxy by invoking the production handler from
 * api/price.js directly, so local behavior matches the deployed Vercel site
 * (stockanalysis.com pinned, no-store, close-only gate, fail-closed snapshot
 * fallback).
 *
 * Usage: node tools/local_server.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import priceHandler from '../api/price.js';

const PORT = 8484;
const HOST = '0.0.0.0';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * Adapter giving Node's http.ServerResponse the Vercel-style
 * res.status(code).json(payload) chain the production handler expects.
 *
 * @param {import('node:http').ServerResponse} res
 */
function vercelify(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    pathname = req.url.split('?')[0];
  }

  if (pathname === '/api/price') {
    vercelify(res);
    Promise.resolve(priceHandler(req, res)).catch(() => {
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end('price proxy error');
      }
    });
    return;
  }

  let requestPath = pathname;
  if (requestPath === '/' || requestPath === '') requestPath = '/index.html';

  let filePath;
  try {
    filePath = path.normalize(path.join(root, requestPath));
  } catch {
    filePath = '';
  }

  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  if (stat.isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}).listen(PORT, HOST, () => {
  console.log(`Serving on LAN: http://192.168.0.102:${PORT}/`);
  console.log(`On this PC:      http://localhost:${PORT}/`);
  console.log('Stop: press Ctrl+C');
});
