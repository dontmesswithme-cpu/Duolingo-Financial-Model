/**
 * Minimal static file server for the Chromium suite.
 *
 * P10.6: serves ONLY the built allowlisted artifact (`_pages/`), so the browser
 * tests exercise the exact file set the Pages deployment publishes. Anything
 * outside that root is refused with 404 rather than resolved, and directory
 * traversal is rejected before touching the filesystem.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('_pages');
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // P10.6: stand in for the Vercel function so the browser exercises the real
  // price path. Without this the static host 404s `/api/price`, Chromium logs a
  // resource error, and the contract's "no console errors" gate fails for a reason
  // that is an artefact of the harness rather than the app. The `api-down` spec
  // aborts this route deliberately to prove the fallback banner.
  if (url.pathname === '/api/price') {
    const body = JSON.stringify({
      symbol: 'DUOL',
      price: 157.85,
      asOf: '2026-09-02',
      isOfficialClose: true,
      intradayPrice: null,
      provider: 'stockanalysis.com',
      retrievedAt: new Date().toISOString(),
      status: 'live_close',
      source: { provider: 'stockanalysis.com', url: 'https://stockanalysis.com/stocks/duol/' },
    });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // Resolve inside ROOT and verify containment before reading anything.
  const target = path.resolve(ROOT, `.${rel}`);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(target).pipe(res);
});

if (!fs.existsSync(ROOT)) {
  console.error(`_pages/ not found. Run: node tools/build_pages_artifact.mjs`);
  process.exit(1);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}`);
});
