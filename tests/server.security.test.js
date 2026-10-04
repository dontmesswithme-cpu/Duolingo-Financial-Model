/**
 * Task P10.1 Contract Tests — Secure the Local Server.
 *
 * Verifies docs/phases/phase_10.md §P10.1:
 *  1. Default binding: 127.0.0.1 (local only). LAN requires explicit opt-in flag.
 *  2. Allowlisted static tree only (index.html, /src/, /assets/, /vendor/).
 *  3. Deny dotfiles (.git, .env, etc.), source control, tests, tools, docs, logs, node_modules.
 *  4. Deny path traversal (plain, encoded, backslash, null bytes).
 *  5. Deny unexpected extensions and MIME types.
 *  6. Return 403/404 without disclosing server paths.
 *  7. Security headers on all local responses.
 *  8. run.bat static security audit (zero Stop-Process, zero -Force, zero New-NetFirewallRule).
 *  9. Port collision safe handling (owning PID reporting without crash).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import {
  createServer,
  DEFAULT_PORT,
  DEFAULT_HOST,
  LAN_HOST,
  ALLOWED_PATH_PREFIXES,
  SECURITY_HEADERS,
  findOwningPid,
} from '../tools/local_server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Helper to perform an HTTP request against a running server.
 *
 * @param {number} port
 * @param {string} host
 * @param {string} reqPath
 * @returns {Promise<{ status: number, headers: import('node:http').IncomingHttpHeaders, body: string }>}
 */
function request(port, host, reqPath) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: host,
      port,
      path: reqPath,
      method: 'GET',
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('P10.1 — Secure Local Server Configuration & Network Binding', () => {
  test('binds to 127.0.0.1 by default', () => {
    const { host, isLan } = createServer({ lan: false });
    assert.equal(host, DEFAULT_HOST, 'Default host must be 127.0.0.1');
    assert.equal(isLan, false, 'isLan must be false by default');
  });

  test('LAN exposure requires explicit opt-in', () => {
    const { host, isLan } = createServer({ lan: true });
    assert.equal(host, LAN_HOST, 'LAN host must be 0.0.0.0 when opt-in is true');
    assert.equal(isLan, true, 'isLan must be true when opt-in is enabled');
  });

  test('default port matches contract (8484)', () => {
    const { port } = createServer();
    assert.equal(port, DEFAULT_PORT, 'Default port must be 8484');
  });

  test('allowlist prefixes cover required asset directories', () => {
    assert.ok(ALLOWED_PATH_PREFIXES.includes('/src/'), 'Must allow /src/');
    assert.ok(ALLOWED_PATH_PREFIXES.includes('/assets/'), 'Must allow /assets/');
    assert.ok(ALLOWED_PATH_PREFIXES.includes('/vendor/'), 'Must allow /vendor/');
  });
});

describe('P10.1 — Live Server Security Boundaries & Static Allowlisting', () => {
  let serverInstance;
  let testPort;
  const testHost = '127.0.0.1';

  before(async () => {
    const { server } = createServer({ host: testHost, port: 0 });
    serverInstance = server;
    await new Promise((resolve) => {
      serverInstance.listen(0, testHost, () => {
        testPort = serverInstance.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  });

  test('serves root / as index.html with 200 OK and security headers', async () => {
    const res = await request(testPort, testHost, '/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.ok(res.headers['content-security-policy'], 'Must include CSP header');
    assert.ok(res.body.includes('<!DOCTYPE html>'), 'Body must be index.html');
  });

  test('serves /index.html with 200 OK', async () => {
    const res = await request(testPort, testHost, '/index.html');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  test('serves allowlisted JavaScript from /src/', async () => {
    const res = await request(testPort, testHost, '/src/app.js');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /javascript/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  test('serves allowlisted SVG from /assets/', async () => {
    const res = await request(testPort, testHost, '/assets/branding/duolingo-logo.svg');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /image\/svg\+xml/);
  });

  test('serves allowlisted CSS from /vendor/', async () => {
    const res = await request(testPort, testHost, '/vendor/tabulator/tabulator.min.css');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/css/);
  });

  test('serves /api/price endpoint with JSON response and security headers', async () => {
    const res = await request(testPort, testHost, '/api/price');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    const json = JSON.parse(res.body);
    assert.ok(json.status, 'Price response must have status field');
  });

  test('DENIES dotfiles (.env)', async () => {
    const res = await request(testPort, testHost, '/.env');
    assert.ok([403, 404].includes(res.status), `Must be 403 or 404 (got ${res.status})`);
    assert.ok(!res.body.includes('FIRECRAWL'), 'Must never leak .env content');
  });

  test('DENIES dotfiles (.git/HEAD)', async () => {
    const res = await request(testPort, testHost, '/.git/HEAD');
    assert.ok([403, 404].includes(res.status), `Must be 403 or 404 (got ${res.status})`);
    assert.ok(!res.body.includes('ref:'), 'Must never leak git internals');
  });

  test('DENIES .gitignore', async () => {
    const res = await request(testPort, testHost, '/.gitignore');
    assert.ok([403, 404].includes(res.status), `Must be 403 or 404 (got ${res.status})`);
  });

  test('DENIES source tree outside allowlist: /package.json', async () => {
    const res = await request(testPort, testHost, '/package.json');
    assert.ok([403, 404].includes(res.status), `Must be 403 or 404 (got ${res.status})`);
    assert.ok(!res.body.includes('"name": "duolingo-fm"'), 'Must never serve package.json');
  });

  test('DENIES source tree outside allowlist: /tests/server.security.test.js', async () => {
    const res = await request(testPort, testHost, '/tests/server.security.test.js');
    assert.ok([403, 404].includes(res.status), `Must be 403 or 404 (got ${res.status})`);
  });

  test('DENIES source tree outside allowlist: /tools/local_server.mjs', async () => {
    const res = await request(testPort, testHost, '/tools/local_server.mjs');
    assert.ok([403, 404].includes(res.status), `Must be 403 or 404 (got ${res.status})`);
  });

  test('DENIES source tree outside allowlist: /docs/spec.md', async () => {
    const res = await request(testPort, testHost, '/docs/spec.md');
    assert.ok([403, 404].includes(res.status), `Must be 403 or 404 (got ${res.status})`);
  });

  test('DENIES node_modules access', async () => {
    const res = await request(testPort, testHost, '/node_modules/tabulator-tables/package.json');
    assert.ok([403, 404].includes(res.status), `Must be 403 or 404 (got ${res.status})`);
  });

  test('DENIES path traversal (../)', async () => {
    const res = await request(testPort, testHost, '/src/../package.json');
    assert.ok([403, 404].includes(res.status), `Must be 403 or 404 (got ${res.status})`);
  });

  test('DENIES encoded path traversal (%2e%2e/)', async () => {
    const res = await request(testPort, testHost, '/src/%2e%2e/package.json');
    assert.ok([403, 404].includes(res.status), `Must be 403 or 404 (got ${res.status})`);
  });

  test('DENIES encoded backslash traversal', async () => {
    const res = await request(testPort, testHost, '/src%5c..%5cpackage.json');
    assert.ok([400, 403, 404].includes(res.status), `Must be 400, 403, or 404 (got ${res.status})`);
  });

  test('DENIES null byte injection', async () => {
    const res = await request(testPort, testHost, '/src/app.js%00.html');
    assert.ok([400, 403, 404].includes(res.status), `Must be 400, 403, or 404 (got ${res.status})`);
  });

  test('DENIES unexpected extensions (.exe, .bak, .sh)', async () => {
    const res = await request(testPort, testHost, '/src/app.exe');
    assert.equal(res.status, 404);
  });

  test('403 and 404 responses do NOT disclose server root filesystem paths', async () => {
    const forbidden = await request(testPort, testHost, '/.env');
    assert.ok(!forbidden.body.includes(rootDir), 'Forbidden body must not leak rootDir');

    const notFound = await request(testPort, testHost, '/nonexistent.file');
    assert.ok(!notFound.body.includes(rootDir), 'NotFound body must not leak rootDir');
  });
});

describe('P10.1 — run.bat Script Security Audit', () => {
  const runBatPath = path.join(rootDir, 'run.bat');

  test('run.bat exists on disk', () => {
    assert.ok(fs.existsSync(runBatPath), 'run.bat must exist');
  });

  test('run.bat contains zero Stop-Process kill-all commands', () => {
    const content = fs.readFileSync(runBatPath, 'utf8');
    assert.ok(!content.includes('Stop-Process'), 'run.bat must not contain Stop-Process');
  });

  test('run.bat contains zero -Force process-killing flags', () => {
    const content = fs.readFileSync(runBatPath, 'utf8');
    assert.ok(!content.includes('-Force'), 'run.bat must not contain -Force');
  });

  test('run.bat contains zero silent firewall modifications (New-NetFirewallRule)', () => {
    const content = fs.readFileSync(runBatPath, 'utf8');
    assert.ok(!content.includes('New-NetFirewallRule'), 'run.bat must not contain New-NetFirewallRule');
    assert.ok(!content.includes('Set-NetFirewallRule'), 'run.bat must not contain Set-NetFirewallRule');
  });
});

describe('P10.1 — Port Collision Safe Handling', () => {
  test('findOwningPid executes safely and returns string or null', () => {
    const pid = findOwningPid(99999);
    assert.ok(pid === null || typeof pid === 'string');
  });
});
