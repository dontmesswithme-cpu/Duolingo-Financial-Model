/**
 * Local development server (run.bat backend).
 *
 * Secure static server and /api/price live-pricing proxy.
 *
 * Security requirements (Phase 10 — P10.1):
 * - Default bind: 127.0.0.1 (local only).
 * - LAN exposure: explicit opt-in via --lan, -l, or DUOLINGO_LAN=1.
 * - Allowlisted static tree only (index.html, src/, assets/, vendor/).
 * - Deny dotfiles, .git, .env, source-control metadata, tests, tools, docs, logs, node_modules.
 * - Deny path traversal, encoded traversal, null bytes.
 * - Deny unexpected extensions and MIME types.
 * - Security headers on all local responses.
 * - Safe port collision handling with owning PID reporting.
 * - Zero force-kill, zero silent firewall rules.
 *
 * Usage: node tools/local_server.mjs [--lan]
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import priceHandler from '../api/price.js';

export const DEFAULT_PORT = 8484;
export const DEFAULT_HOST = '127.0.0.1';
export const LAN_HOST = '0.0.0.0';

export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
});

export const ALLOWED_EXTENSIONS = Object.freeze(new Set(Object.keys(MIME_TYPES)));

export const ALLOWED_PATH_PREFIXES = Object.freeze([
  '/src/',
  '/assets/',
  '/vendor/',
]);

export const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';",
});

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Adapter giving Node's http.ServerResponse the Vercel-style
 * res.status(code).json(payload) chain the production handler expects.
 *
 * @param {import('node:http').ServerResponse} res
 */
export function vercelify(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
        res.setHeader(k, v);
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

/**
 * Sends a generic error response with security headers without disclosing server paths.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {string} message
 */
function sendError(res, statusCode, message) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end(message);
}

/**
 * Inspects a system port and attempts to find the owning process ID.
 *
 * @param {number} port
 * @returns {string|null}
 */
export function findOwningPid(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const lines = out.split(/\r?\n/);
      for (const line of lines) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(parseInt(pid, 10))) {
            return pid;
          }
        }
      }
    } else {
      const out = execSync(`lsof -i :${port} -t`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const pids = out.trim().split(/\s+/).filter(Boolean);
      if (pids.length > 0) return pids[0];
    }
  } catch {}
  return null;
}

/**
 * Creates and configures the HTTP server instance.
 *
 * @param {object} [options]
 * @param {boolean} [options.lan]
 * @param {string} [options.host]
 * @param {number} [options.port]
 * @param {string} [options.root]
 * @returns {{ server: import('node:http').Server, host: string, port: number, isLan: boolean, root: string }}
 */
export function createServer(options = {}) {
  const isLan =
    options.lan !== undefined
      ? options.lan
      : (process.argv.includes('--lan') || process.argv.includes('-l') || process.env.DUOLINGO_LAN === '1');
  const host = options.host || (isLan ? LAN_HOST : DEFAULT_HOST);
  const port = options.port !== undefined ? options.port : (parseInt(process.env.PORT, 10) || DEFAULT_PORT);
  const serverRoot = options.root ? path.resolve(options.root) : defaultRoot;

  const server = http.createServer((req, res) => {
    let decodedPath;
    try {
      const parsed = new URL(req.url, 'http://localhost');
      decodedPath = decodeURIComponent(parsed.pathname);
    } catch {
      return sendError(res, 400, 'Bad Request');
    }

    // Reject null bytes, backslashes, or encoded backslash
    if (
      decodedPath.includes('\0') ||
      decodedPath.includes('\\') ||
      req.url.includes('%00') ||
      req.url.toLowerCase().includes('%5c')
    ) {
      return sendError(res, 400, 'Bad Request');
    }

    // Live pricing API endpoint
    if (decodedPath === '/api/price') {
      vercelify(res);
      Promise.resolve(priceHandler(req, res)).catch(() => {
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'error', error: 'price proxy error' }));
        }
      });
      return;
    }

    // Normalize request path
    let requestPath = decodedPath;
    if (requestPath === '/' || requestPath === '') {
      requestPath = '/index.html';
    } else if (requestPath === '/favicon.ico') {
      requestPath = '/assets/branding/favicon.ico';
    }

    // Directory traversal detection
    if (requestPath.includes('/../') || requestPath.endsWith('/..') || requestPath.includes('/./')) {
      return sendError(res, 403, 'Forbidden');
    }

    // Dotfile protection: deny any dotfile or directory starting with dot
    const segments = requestPath.split('/').filter(Boolean);
    if (segments.some((seg) => seg.startsWith('.'))) {
      return sendError(res, 403, 'Forbidden');
    }

    // Allowlisted static tree check:
    // Only /index.html and paths under /src/, /assets/, /vendor/ are allowed
    const isAllowlisted =
      requestPath === '/index.html' ||
      ALLOWED_PATH_PREFIXES.some((prefix) => requestPath.startsWith(prefix));

    if (!isAllowlisted) {
      return sendError(res, 404, 'Not Found');
    }

    // Resolve physical file path
    const resolvedPath = path.resolve(serverRoot, '.' + requestPath);

    // Verify boundary containment strictly within serverRoot
    if (!resolvedPath.startsWith(serverRoot + path.sep)) {
      return sendError(res, 403, 'Forbidden');
    }

    // Extension validation
    const ext = path.extname(resolvedPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return sendError(res, 404, 'Not Found');
    }

    // File stat verification
    let stat;
    try {
      stat = fs.statSync(resolvedPath);
    } catch {
      return sendError(res, 404, 'Not Found');
    }

    if (!stat.isFile()) {
      return sendError(res, 404, 'Not Found');
    }

    // Serve file with security headers
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
    });

    const stream = fs.createReadStream(resolvedPath);
    stream.on('error', () => {
      sendError(res, 500, 'Internal Server Error');
    });
    stream.pipe(res);
  });

  return { server, host, port, isLan, root: serverRoot };
}

/**
 * Starts the server, attaches error listeners for port collisions, and logs startup details.
 *
 * @param {object} [options]
 * @returns {import('node:http').Server}
 */
export function startServer(options = {}) {
  const { server, host, port, isLan } = createServer(options);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use.`);
      const pid = findOwningPid(port);
      if (pid) {
        console.error(`Owning PID: ${pid}`);
      }
      console.error('Please stop the process using this port or specify another port.');
      process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`\nDuolingo FM local server running:`);
    console.log(`  Local: http://127.0.0.1:${port}/ (or http://localhost:${port}/)`);
    if (isLan) {
      console.log(`  LAN mode enabled: listening on all network interfaces (0.0.0.0:${port})`);
    } else {
      console.log(`  LAN exposure: disabled (binds to 127.0.0.1 only; use --lan to allow network devices)`);
    }
    console.log(`Stop: press Ctrl+C\n`);
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  startServer();
}
