/**
 * P10.6 — Deployment contract.
 *
 * The Pages upload used `path: '.'`, publishing the entire repository (.git,
 * .env, tests/, tools/, docs/logs/) to a public static host. The contract
 * requires a minimal allowlisted artifact and forbids source-control metadata in
 * either deployment. This gate asserts that structurally, plus the API hardening
 * (CORS allowlist, GET-only, rate limit) and the explicit Pages->Vercel endpoint.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const run = (args) => execFileSync(process.execPath, [path.join(ROOT, 'tools/build_pages_artifact.mjs'), ...args], {
  cwd: ROOT, encoding: 'utf8',
});

describe('P10.6 — Pages artifact is a minimal allowlist', () => {
  test('the workflow no longer uploads the repository root', () => {
    const yml = read('.github/workflows/deploy.yml');
    // Match the real YAML key, not a `#` comment that merely mentions the old value.
    const rootUpload = yml.split(/\r?\n/).find((l) => /^\s*path:\s*'\.'\s*$/.test(l));
    assert.equal(rootUpload, undefined, "upload must not use path: '.'");
    assert.match(yml, /^\s*path:\s*'_pages'\s*$/m, 'upload targets the built artifact');
    assert.match(yml, /build_pages_artifact\.mjs/, 'the artifact build step is wired');
    assert.match(yml, /--check/, 'the allowlist assertion runs in CI and fails closed');
  });

  test('building produces only allowlisted entries', () => {
    const out = run([]);
    assert.match(out, /built _pages\//, 'build reports its output');
    const check = run(['--check']);
    assert.match(check, /PASS:/, 'allowlist check passes on a fresh build');
  });

  test('a forbidden entry fails the check closed', () => {
    const pagesDir = path.join(ROOT, '_pages');
    const planted = path.join(pagesDir, 'tests', 'planted.js');
    fs.mkdirSync(path.dirname(planted), { recursive: true });
    fs.writeFileSync(planted, '// planted');
    try {
      let threw = false;
      try {
        run(['--check']);
      } catch {
        threw = true;
      }
      assert.ok(threw, 'the check must FAIL when a forbidden path is present');
    } finally {
      fs.rmSync(path.join(pagesDir, 'tests'), { recursive: true, force: true });
    }
    // And it passes again once removed.
    assert.match(run(['--check']), /PASS:/, 'check passes again after removal');
  });

  test('the built artifact excludes .git, .env, tests, tools, docs and logs', () => {
    run([]);
    const pagesDir = path.join(ROOT, '_pages');
    for (const bad of ['.git', '.env', 'tests', 'tools', 'docs', 'scratch', 'api', 'node_modules']) {
      assert.ok(
        !fs.existsSync(path.join(pagesDir, bad)),
        `_pages must not contain ${bad}`,
      );
    }
  });
});

describe('P10.6 — price API is GET-only, bounded, rate-limited, CORS-allowlisted', () => {
  const api = read('api/price.js');

  test('CORS is an allowlist, not a reflection of the request Origin', () => {
    assert.match(api, /ALLOWED_ORIGINS/, 'an origin allowlist exists');
    assert.match(api, /Origin not allowed/, 'a disallowed origin is refused');
    assert.ok(
      !/res\.setHeader\(\s*['"]Access-Control-Allow-Origin['"]\s*,\s*req/.test(api),
      'Access-Control-Allow-Origin must never echo the request origin',
    );
    assert.match(api, /Access-Control-Allow-Origin/, 'the header is set explicitly for allowed origins');
  });

  test('non-GET methods are rejected before any upstream fetch', () => {
    assert.match(api, /method\s*!==\s*'GET'/, 'a non-GET method is refused');
    assert.match(api, /405/, 'with 405 Method Not Allowed');
    assert.match(api, /Allow['"]\s*,\s*['"]GET, OPTIONS/, 'and an Allow header');
    // The guard must precede the upstream fetch.
    const guardAt = api.indexOf("method !== 'GET'");
    const fetchAt = api.indexOf('await fetch(');
    assert.ok(guardAt > -1 && fetchAt > -1, 'both guard and fetch exist');
    assert.ok(guardAt < fetchAt, 'the method guard runs before the upstream fetch');
  });

  test('a rate limit precedes the upstream fetch', () => {
    assert.match(api, /RATE_LIMIT_MAX/, 'a limit is configured');
    assert.match(api, /429/, 'exceeding it returns 429');
    assert.match(api, /Retry-After/, 'and advertises Retry-After');
    const rlAt = api.indexOf('rateLimited(');
    const fetchAt = api.indexOf('await fetch(');
    assert.ok(rlAt > -1 && rlAt < fetchAt, 'the rate limit runs before the upstream fetch');
  });

  test('the response stays bounded and validated', () => {
    assert.match(api, /no-store/, 'responses are not cached');
    assert.match(api, /maxBodyBytes|content-length|MAX_/, 'the response body is bounded');
    assert.match(api, /FALLBACK_PRICE/, 'a snapshot fallback exists for an unavailable API');
  });
});

describe('P10.6 — Pages obtains the Vercel endpoint explicitly', () => {
  test('the endpoint resolver exists and fails closed when unconfigured', async () => {
    const { resolvePriceEndpoint } = await import('../src/engine/market.js');
    delete globalThis.__PRICE_ENDPOINT__;
    assert.equal(resolvePriceEndpoint(), '/api/price', 'unconfigured resolves to the same-origin path');

    globalThis.__PRICE_ENDPOINT__ = 'https://example.vercel.app/api/price';
    assert.equal(
      resolvePriceEndpoint(),
      'https://example.vercel.app/api/price',
      'an injected absolute endpoint is used',
    );

    // A non-http scheme must never be honoured.
    globalThis.__PRICE_ENDPOINT__ = 'javascript:alert(1)';
    assert.equal(resolvePriceEndpoint(), '/api/price', 'a non-http injected value is ignored');
    delete globalThis.__PRICE_ENDPOINT__;
  });

  test('the static artifact does not bundle the API', () => {
    assert.ok(
      !fs.existsSync(path.join(ROOT, '_pages', 'api')),
      'the serverless function must not ship in the static artifact',
    );
  });
});
