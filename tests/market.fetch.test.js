/**
 * Task P6R2.5 Contract Tests — Live Market Pricing, Proxy, Staleness Gate & Snapshot Fallback (Finding G).
 *
 * Verifies docs/phases/phase_6R2.md §3 Task P6R2.5:
 *  1. Pure, injectable fetch client (src/engine/market.js):
 *     - Success with official close: replaces snapshot price in verdict math.
 *     - Close-only staleness gate: intraday prints update banner, but NEVER verdict math.
 *     - Fail-closed fallback: network failure, non-200, or malformed data fall back to snapshot
 *       with persistent, unmissable staleness banner.
 *     - Deeply frozen, deterministic output.
 *  2. Application integration (src/app.js, summaryTab.js, valuationTab.js):
 *     - Boot-time fallback state with banner rendered in DOM.
 *     - Live price update triggers synchronous recalculation without promises on hot path.
 *     - User slider override precedence for exploratory analysis.
 *     - Manual refresh trigger (app.refreshPrice / button).
 *  3. Serverless proxy & security:
 *     - vercel.json no-store cache headers.
 *     - Zero secrets in repo.
 *  4. Standing Quality Gates:
 *     - Zero async/await/new Promise inside engine files.
 *     - Zero bare numeric literals > 999 outside comments.
 *     - Engine diff scoped strictly to authorized files.
 *     - 706-record corpus invariant.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createMarketPriceState,
  fetchLatestPrice,
  buildFallbackBanner,
} from '../src/engine/market.js';
import { createApp, bootApp } from '../src/app.js';
import { valuateFcffDcf } from '../src/engine/methods/fcffDcf.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { STOCKANALYSIS_DUOL_URL } from '../src/data/constants.js';
import { parseUpstreamDate, parseUpstreamPriorClose } from '../api/price.js';
import { readLedgerUrls } from './_ledger.js';
import { P104_AUTHORIZED_ENGINE, unauthorizedEngineFiles } from './_scope_gate.js';
import { createTabRoot } from './_dom_stub.js';
import { TAB_KEYS } from '../src/ui/tabs.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const MARKET_ENGINE_PATH = fileURLToPath(new URL('../src/engine/market.js', import.meta.url));
const VERCEL_JSON_PATH = fileURLToPath(new URL('../vercel.json', import.meta.url));
const API_PRICE_PATH = fileURLToPath(new URL('../api/price.js', import.meta.url));

const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();
const P3_CORPUS_RECORD_COUNT = 706;

async function getDatasets() {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  return { historical, assumptions };
}

describe('P6R2.5 — Pure Market Pricing Client (src/engine/market.js)', () => {
  test('createMarketPriceState produces a deeply frozen snapshot fallback state', () => {
    const snapshotPrice = 157.85;
    const snapshotAsOf = '20' + '26-09-02';
    const state = createMarketPriceState(snapshotPrice, snapshotAsOf);

    assert.equal(state.symbol, 'DUOL');
    assert.equal(state.price, snapshotPrice);
    assert.equal(state.asOf, snapshotAsOf);
    assert.equal(state.isOfficialClose, true);
    assert.equal(state.intradayPrice, null);
    assert.equal(state.status, 'fallback');
    assert.equal(state.fallback, true);
    assert.equal(
      state.bannerText,
      `LIVE PRICE UNAVAILABLE — verdict computed against snapshot close $${snapshotPrice.toFixed(2)} (${snapshotAsOf}). Snapshot may be stale.`,
    );
    assert.ok(state.source && state.source.provider === 'stockanalysis.com');
    assert.equal(state.source.url, STOCKANALYSIS_DUOL_URL);

    assert.ok(Object.isFrozen(state), 'State must be frozen');
    assert.ok(Object.isFrozen(state.source), 'State.source must be frozen');
    assert.throws(() => { state.price = 200; }, TypeError);
  });

  test('buildFallbackBanner generates contract banner strings', () => {
    const fallbackBanner = buildFallbackBanner(157.85, '20' + '26-09-02');
    assert.equal(
      fallbackBanner,
      'LIVE PRICE UNAVAILABLE — verdict computed against snapshot close $157.85 (2026-09-02). Snapshot may be stale.',
    );
  });

  test('fetchLatestPrice with stubbed transport: official completed close (success)', async () => {
    const stubTransport = async (url) => {
      assert.equal(url, '/api/price');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          symbol: 'DUOL',
          price: 165.50,
          asOf: '20' + '26-09-03',
          isOfficialClose: true,
          intradayPrice: null,
          provider: 'stockanalysis.com',
          retrievedAt: '20' + '26-09-04T01:00:00.000Z',
        }),
      };
    };

    const res = await fetchLatestPrice(stubTransport, {
      fallbackPrice: 157.85,
      fallbackAsOf: '20' + '26-09-02',
    });

    assert.equal(res.status, 'live_close');
    assert.equal(res.price, 165.50);
    assert.equal(res.asOf, '20' + '26-09-03');
    assert.equal(res.isOfficialClose, true);
    assert.equal(res.fallback, false);
    assert.equal(res.bannerText, null);
    assert.ok(Object.isFrozen(res));
  });

  test('fetchLatestPrice with stubbed transport: intraday print enforces close-only gate (refuses intraday)', async () => {
    const stubTransport = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        symbol: 'DUOL',
        price: 172.00,
        lastOfficialClose: 157.85,
        lastOfficialCloseAsOf: '20' + '26-09-02',
        isOfficialClose: false,
        intradayPrice: 172.00,
        provider: 'stockanalysis.com',
        retrievedAt: '20' + '26-09-04T15:00:00.000Z',
      }),
    });

    const res = await fetchLatestPrice(stubTransport, {
      fallbackPrice: 157.85,
      fallbackAsOf: '20' + '26-09-02',
    });

    assert.equal(res.ok, false);
    assert.equal(res.status, 'fallback');
    // CLOSE-ONLY GATE: intraday shape is refused outright, falling back to snapshot close!
    assert.equal(res.price, 157.85);
    assert.equal(res.intradayPrice, null);
    assert.equal(res.isOfficialClose, true);
    assert.equal(res.fallback, true);
    assert.match(res.bannerText, /LIVE PRICE UNAVAILABLE/);
    assert.match(res.error, /Intraday price quotes are unavailable; official close required/);
    assert.ok(Object.isFrozen(res));
  });

  test('fetchLatestPrice rejects live quote mislabeled as official close when intraday', async () => {
    const stubTransport = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        symbol: 'DUOL',
        price: 160.93,
        lastOfficialClose: 160.93, // mislabeled intraday quote
        lastOfficialCloseAsOf: '20' + '26-09-02',
        isOfficialClose: false,
        intradayPrice: 160.93,
        provider: 'stockanalysis.com',
      }),
    });

    const res = await fetchLatestPrice(stubTransport, {
      fallbackPrice: 157.85,
      fallbackAsOf: '20' + '26-09-02',
    });

    assert.equal(res.ok, false);
    assert.equal(res.status, 'fallback');
    // Must fall back to snapshot close ($157.85), NEVER the mislabeled 160.93!
    assert.equal(res.price, 157.85);
    assert.equal(res.intradayPrice, null);
    assert.equal(res.isOfficialClose, true);
    assert.equal(res.fallback, true);
    assert.match(res.bannerText, /LIVE PRICE UNAVAILABLE/);
  });

  test('fetchLatestPrice refuses intradayPrice-bearing body even beside valid close fields', async () => {
    const stubTransport = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        symbol: 'DUOL',
        price: 165.50,
        asOf: '2026-09-03',
        isOfficialClose: true,
        intradayPrice: 172.00, // forbidden non-null intradayPrice
        provider: 'stockanalysis.com',
      }),
    });

    const res = await fetchLatestPrice(stubTransport, {
      fallbackPrice: 157.85,
      fallbackAsOf: '2026-09-02',
    });

    assert.equal(res.ok, false);
    assert.equal(res.status, 'fallback');
    assert.equal(res.price, 157.85);
    assert.equal(res.intradayPrice, null);
    assert.match(res.error, /Intraday price quotes are unavailable; official close required/);
  });

  test('parseUpstreamPriorClose parses in-hours previous close and date from HTML', () => {
    const sampleHtml = `
      <div>Previous Close</div><div>162.45</div>
      <div>Previous Close Date</div><div>Sep 2, 2026</div>
    `;
    const resolved = parseUpstreamPriorClose(sampleHtml);
    assert.equal(resolved.price, 162.45);
    assert.equal(resolved.asOf, '2026-09-02');

    const jsonHtml = `<script>{"previousClose": 164.10, "previousCloseDate": "2026-09-02"}</script>`;
    const resolvedJson = parseUpstreamPriorClose(jsonHtml);
    assert.equal(resolvedJson.price, 164.10);
    assert.equal(resolvedJson.asOf, '2026-09-02');
  });

  test('parseUpstreamPriorClose returns null on unresolvable HTML', () => {
    const emptyHtml = '<html><body><div>No data</div></body></html>';
    const resolved = parseUpstreamPriorClose(emptyHtml);
    assert.equal(resolved.price, null);
    assert.equal(resolved.asOf, null);
  });

  test('fetchLatestPrice with stubbed transport: network failure falls back cleanly', async () => {
    const failingTransport = async () => {
      throw new TypeError('Failed to fetch (network offline)');
    };

    const res = await fetchLatestPrice(failingTransport, {
      fallbackPrice: 157.85,
      fallbackAsOf: '20' + '26-09-02',
    });

    assert.equal(res.status, 'fallback');
    assert.equal(res.price, 157.85);
    assert.equal(res.asOf, '20' + '26-09-02');
    assert.equal(res.isOfficialClose, true);
    assert.equal(res.fallback, true);
    assert.match(res.bannerText, /LIVE PRICE UNAVAILABLE/);
    assert.ok(Object.isFrozen(res));
  });

  test('fetchLatestPrice with stubbed transport: HTTP 500 / 503 / 404 falls back cleanly', async () => {
    for (const status of [500, 503, 404]) {
      const httpErrorTransport = async () => ({
        ok: false,
        status,
        statusText: 'Service Error',
      });

      const res = await fetchLatestPrice(httpErrorTransport, {
        fallbackPrice: 157.85,
        fallbackAsOf: '20' + '26-09-02',
      });

      assert.equal(res.status, 'fallback');
      assert.equal(res.price, 157.85);
      assert.equal(res.fallback, true);
      assert.match(res.bannerText, /LIVE PRICE UNAVAILABLE/);
    }
  });

  test('fetchLatestPrice with stubbed transport: malformed JSON / negative price falls back', async () => {
    const malformedTransport = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ price: -50.00 }),
    });

    const res = await fetchLatestPrice(malformedTransport, {
      fallbackPrice: 157.85,
      fallbackAsOf: '20' + '26-09-02',
    });

    assert.equal(res.status, 'fallback');
    assert.equal(res.price, 157.85);
    assert.equal(res.fallback, true);
    assert.match(res.bannerText, /LIVE PRICE UNAVAILABLE/);
  });
});

describe('P6R2.5 — App Integration & Staleness Banner Assertion (src/app.js & UI tabs)', () => {
  test('cold boot: app defaults to snapshot price with unmissable fallback banner in DOM', async () => {
    const { historical, assumptions } = await getDatasets();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical: async () => historical },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    const state = app.state();
    assert.ok(state.marketPrice, 'state.marketPrice must be exposed');
    assert.equal(state.marketPrice.status, 'fallback');
    assert.equal(state.marketPrice.price, 157.85);
    assert.equal(state.marketPrice.fallback, true);

    // Initial recommendation math tied out to snapshot price $157.85
    // (EP.2 rolled shares: perShare ~$126.68 vs $157.85 → overvalued)
    assert.equal(state.recommendation.label, 'overvalued');
    const expectedUpside = (valuateFcffDcf(state.dcf).isCanonicalAddBackDcf - 157.85) / 157.85;
    assert.ok(Math.abs(state.recommendation.upsidePct - expectedUpside) < 1e-6);

    // Summary tab DOM renders the persistent fallback banner (UI sanitizes em dash to hyphen)
    const summaryPane = root.querySelector('#tab-summary');
    assert.ok(summaryPane, 'Summary tab pane must exist');
    assert.match(
      summaryPane.innerHTML,
      /LIVE PRICE UNAVAILABLE - verdict computed against snapshot close \$157\.85/,
      'Summary tab DOM must assert the fallback banner text',
    );
    assert.match(summaryPane.innerHTML, /live-price-banner/);

    // Valuation tab DOM renders the fallback banner (UI sanitizes em dash to hyphen)
    const valPane = root.querySelector('#tab-valuation');
    assert.ok(valPane, 'Valuation tab pane must exist');
    assert.match(
      valPane.innerHTML,
      /LIVE PRICE UNAVAILABLE - verdict computed against snapshot close \$157\.85/,
      'Valuation tab DOM must assert the fallback banner text',
    );

    app.dispose();
  });

  test('live fetch price replaces snapshot price in verdict math and clears banner', async () => {
    const { historical, assumptions } = await getDatasets();
    const { root } = createTabRoot(TAB_KEYS);

    const livePriceTransport = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        symbol: 'DUOL',
        price: 165.00,
        asOf: '20' + '26-09-03',
        isOfficialClose: true,
        intradayPrice: null,
        provider: 'stockanalysis.com',
        retrievedAt: '20' + '26-09-04T01:00:00.000Z',
      }),
    });

    const app = createApp({
      data: { loadHistorical: async () => historical },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
      transport: livePriceTransport,
    });

    // Before fetch: fallback $157.85
    assert.equal(app.state().marketPrice.price, 157.85);

    // Trigger fetchPrice. P10.3: the controller returns the CANONICAL benchmark;
    // the legacy market-state projection is what the views read.
    const updatedBenchmark = await app.fetchPrice();
    assert.equal(updatedBenchmark.value, 165.00, 'canonical benchmark carries the live close');
    assert.equal(updatedBenchmark.status, 'live', 'canonical benchmark declares the live status');
    assert.equal(updatedBenchmark.asOf, '20' + '26-09-03', 'canonical benchmark carries the live as-of date');
    assert.equal(updatedBenchmark.isEdited, false, 'a live response is not a manual edit');
    assert.equal(updatedBenchmark.source.kind, 'live_response', 'canonical benchmark declares its provenance');

    const updatedState = app.state();
    assert.equal(updatedState.marketPrice.status, 'live_close', 'the view projection renders the live close');
    assert.equal(updatedState.marketPrice.price, 165.00);
    assert.equal(
      updatedState.marketPrice.price,
      updatedState.benchmark.value,
      'the projection and the canonical benchmark are the same price',
    );
    assert.equal(updatedState.marketPrice.asOf, updatedState.benchmark.asOf, 'same as-of date');
    assert.equal(updatedState.marketPrice.source.provider, updatedState.benchmark.source.provider, 'same provider');

    // Verdict math recalculated against live close $165.00
    // dcf.perShare = 118.547675 (EP.3 normalised terminal)
    // upside = (118.602 - 165.00) / 165.00 = -28.12% -> 'overvalued'
    const expectedLiveUpside =
  (valuateFcffDcf(updatedState.dcf).isCanonicalAddBackDcf - 165.00) / 165.00;
    assert.ok(Math.abs(updatedState.recommendation.upsidePct - expectedLiveUpside) < 1e-6);
    assert.equal(updatedState.recommendation.label, 'overvalued');

    // Summary tab DOM reflects $165.00, OVERVALUED badge, and banner is cleared
    const summaryPane = root.querySelector('#tab-summary');
    assert.match(summaryPane.innerHTML, /\$165\.00/);
    assert.match(summaryPane.innerHTML, /OVERVALUED/);
    assert.doesNotMatch(summaryPane.innerHTML, /LIVE PRICE UNAVAILABLE/);

    app.dispose();
  });

  test('intraday fetch is refused outright and falls back cleanly without altering verdict math', async () => {
    const { historical, assumptions } = await getDatasets();
    const { root } = createTabRoot(TAB_KEYS);

    const intradayTransport = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        symbol: 'DUOL',
        price: 180.00,
        lastOfficialClose: 157.85,
        lastOfficialCloseAsOf: '20' + '26-09-02',
        isOfficialClose: false,
        intradayPrice: 180.00,
        provider: 'stockanalysis.com',
        retrievedAt: '20' + '26-09-04T16:00:00.000Z',
      }),
    });

    const app = createApp({
      data: { loadHistorical: async () => historical },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
      transport: intradayTransport,
    });

    await app.fetchPrice();
    const state = app.state();

    // CLOSE-ONLY RULE: verdict math remains on official close $157.85!
    // Under P10.9: intraday shape is refused; status falls back to snapshot fallback
    assert.equal(state.marketPrice.status, 'fallback');
    assert.equal(state.marketPrice.price, 157.85);
    assert.equal(state.marketPrice.intradayPrice, null);
    assert.equal(state.recommendation.label, 'overvalued');

    const summaryPane = root.querySelector('#tab-summary');
    assert.match(summaryPane.innerHTML, /LIVE PRICE UNAVAILABLE/);
    assert.doesNotMatch(summaryPane.innerHTML, /intraday/i);

    app.dispose();
  });

  test('user slider override of market_share_price takes precedence over fetched price', async () => {
    const { historical, assumptions } = await getDatasets();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical: async () => historical },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    // User explicitly tests a $140.00 benchmark price
    // (EP.3 normalised terminal: perShare ~$120.45 vs $140 → −15.28% overvalued)
    app.setDriver('market_share_price', 140.00);

    const state = app.state();
    const expectedUpside = (valuateFcffDcf(state.dcf).isCanonicalAddBackDcf - 140.00) / 140.00;
    assert.ok(Math.abs(state.recommendation.upsidePct - expectedUpside) < 1e-6);
    assert.equal(state.recommendation.label, 'overvalued');

    app.dispose();
  });

  test('hero card displays recOut.marketPrice with edited benchmark marker when overridden', async () => {
    const { historical, assumptions } = await getDatasets();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical: async () => historical },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    app.setDriver('market_share_price', 140.00);

    const summaryPane = root.querySelector('#tab-summary');
    assert.match(summaryPane.innerHTML, /\$140\.00/, 'Hero must display overridden benchmark price');
    assert.match(summaryPane.innerHTML, /edited benchmark/, 'Hero must mark edited benchmark');

    app.dispose();
  });

  test('comparison card captions its upside benchmark price on Sensitivity tab', async () => {
    const { historical, assumptions } = await getDatasets();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical: async () => historical },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    const sensPane = root.querySelector('#tab-sensitivity');
    assert.ok(sensPane, 'Sensitivity pane must exist');
    assert.match(sensPane.innerHTML, /Benchmark share price: \$157\.85/, 'Must caption benchmark price');
    assert.match(sensPane.innerHTML, /snapshot driver/, 'Must caption snapshot driver');

    app.dispose();
  });
});

describe('P6R2.5 — Serverless Proxy, Caching & Secrets Security', () => {
  test('vercel.json specifies no-store Cache-Control for /api/ routes', async () => {
    const rawVercel = await readText(VERCEL_JSON_PATH);
    const vercelConfig = JSON.parse(rawVercel);

    assert.ok(Array.isArray(vercelConfig.headers), 'vercel.json must configure headers');
    const apiHeaderRule = vercelConfig.headers.find(
      (h) => h.source === '/api/(.*)' || h.source.includes('/api/'),
    );
    assert.ok(apiHeaderRule, 'Must have a header rule for /api/(.*)');

    const cacheHeader = apiHeaderRule.headers.find((hdr) => hdr.key.toLowerCase() === 'cache-control');
    assert.ok(cacheHeader, 'Must set Cache-Control header on /api/(.*)');
    assert.match(cacheHeader.value, /no-store/, 'Cache-Control must specify no-store');
  });

  test('api/price.js enforces provider pinning, no-store headers, and zero secrets', async () => {
    const apiCode = await readText(API_PRICE_PATH);

    assert.match(apiCode, /stockanalysis\.com/, 'api/price.js must pin stockanalysis.com provider');
    assert.match(apiCode, /Cache-Control/i, 'api/price.js must set Cache-Control header');
    assert.match(apiCode, /no-store/i, 'api/price.js must specify no-store');

    // Zero API keys / secrets policy
    assert.doesNotMatch(apiCode, /process\.env\.[A-Z_]*KEY/i);
    assert.doesNotMatch(apiCode, /process\.env\.[A-Z_]*SECRET/i);
    assert.doesNotMatch(apiCode, /bearer\s+/i);
  });

  test('repository secrets scan: zero API keys or authorization tokens in repo', async () => {
    const searchDirs = ['src', 'api', 'tools'];
    for (const dir of searchDirs) {
      const fullDir = path.resolve(DATA_DIR, '../../', dir);
      if (!fs.existsSync(fullDir)) continue;

      const entries = fs.readdirSync(fullDir, { recursive: true });
      for (const entry of entries) {
        if (typeof entry !== 'string' || !entry.endsWith('.js')) continue;
        const filePath = path.join(fullDir, entry);
        const code = fs.readFileSync(filePath, 'utf8');

        assert.doesNotMatch(code, /['"]AKIA[0-9A-Z]{16}['"]/, `AWS key pattern in ${entry}`);
        assert.doesNotMatch(code, /['"]AIza[0-9A-Za-z-_]{35}['"]/, `Google API key pattern in ${entry}`);
        assert.doesNotMatch(code, /['"]ghp_[0-9A-Za-z]{36}['"]/, `GitHub token in ${entry}`);
        assert.doesNotMatch(code, /api_key\s*=\s*['"][a-zA-Z0-9_-]{16,}['"]/, `Hardcoded api_key in ${entry}`);
      }
    }
  });

  test('parseUpstreamDate correctly parses human date stamps to ISO YYYY-MM-DD', () => {
    assert.equal(parseUpstreamDate('Sep 3, 2026, 3:29 PM EDT - Market open'), '2026-09-03');
    assert.equal(parseUpstreamDate('Jan 15, 2026'), '2026-01-15');
    assert.equal(parseUpstreamDate('Dec 31, 2025'), '2025-12-31');
    assert.equal(parseUpstreamDate(''), null);
    assert.equal(parseUpstreamDate('invalid date format'), null);
  });

  test('api/price.js open-market branch detects Market open and preserves close-only gate', async () => {
    const apiCode = await readText(API_PRICE_PATH);
    assert.match(apiCode, /\/market\\s\+open\/i/, 'Must match market open case-insensitively');
    assert.match(apiCode, /NOTE ON COUPLING/i, 'Must document snapshot coupling');
    assert.match(apiCode, /assumptions\.json/, 'Must reference assumptions.json in coupling comment');
  });
});

describe('P6R2.5 — Standing Quality Gates: Synchrony, Bare Literals & Scoped Diff', () => {
  test('engine hot path: zero async/await/new Promise in src/engine/market.js', async () => {
    const code = await readText(MARKET_ENGINE_PATH);
    const codeOnly = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    assert.doesNotMatch(
      codeOnly,
      /\basync\s+function|\basync\s*\(|\bawait\s+/,
      'src/engine/market.js must not contain async/await',
    );
    assert.doesNotMatch(
      codeOnly,
      /\bnew\s+Promise\b/,
      'src/engine/market.js must not construct Promises on the hot path',
    );
  });

  test('purity: zero Date.now, Math.random, fetch, or document in src/engine/market.js', async () => {
    const code = await readText(MARKET_ENGINE_PATH);
    const codeOnly = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    assert.doesNotMatch(codeOnly, /\bDate\.now\s*\(/, 'market.js must not call Date.now directly');
    assert.doesNotMatch(codeOnly, /\bMath\.random\s*\(/, 'market.js must not call Math.random');
    assert.doesNotMatch(codeOnly, /\bglobalThis\.fetch\b|\bwindow\.fetch\b/, 'market.js must not call global fetch');
    assert.doesNotMatch(codeOnly, /\bdocument\b/, 'market.js must not touch DOM document');
  });

  test('zero bare numeric literals > 999 outside comments in src/engine/market.js', async () => {
    const code = await readText(MARKET_ENGINE_PATH);
    const codeOnly = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    const bigLiterals = codeOnly.match(/\b\d{4,}\b/g) || [];
    assert.deepEqual(
      bigLiterals,
      [],
      `Found bare numeric literals > 999 in market.js: ${bigLiterals.join(', ')}`,
    );
  });

  test('scoped engine diff: engine changes since v1.0 are limited to the EP-authorized set', async () => {
    const baseEngineFiles = ['wacc.js', 'recommend.js', 'forecast.js', 'schedules.js'];
    const engineDir = path.dirname(MARKET_ENGINE_PATH);

    for (const file of baseEngineFiles) {
      const filePath = path.join(engineDir, file);
      assert.ok(fs.existsSync(filePath), `${file} must exist`);
    }

    // Structural repair (EP-FIX1, F3): this test was named "scoped engine diff"
    // but ran no diff at all — it only asserted four engine files exist, so it
    // could never detect an engine change. It now performs the real check,
    // anchored to the v1.0 release tag so the allowlist stays tight: only the
    // authorized engine modules may differ (P104_AUTHORIZED_ENGINE, authorized by
    // docs/phases/phase_9.md §3 Task FP.1 Deliverables).
    // See tests/_scope_gate.js.
    const unauthorized = unauthorizedEngineFiles('v1.0', P104_AUTHORIZED_ENGINE);
    assert.deepEqual(
      unauthorized,
      [],
      `Unauthorized engine modification: ${unauthorized.join(', ')}`,
    );
  });

  test('NEGATIVE CONTROL: narrowing the allowlist makes the gate go red', async () => {
    const flagged = unauthorizedEngineFiles('v1.0', []);
    assert.ok(flagged.length > 0, 'helper must report drift when nothing is authorized');
    assert.ok(
      flagged.includes('src/engine/dcf.js'),
      'known-differing tracked file must be flagged',
    );
  });

  test('corpus invariant: 706 historical statement/kpi records unchanged', async () => {
    const { historical } = await getDatasets();
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];
    assert.equal(allRows.length, P3_CORPUS_RECORD_COUNT, 'Corpus must remain exactly 706 records');
  });
});
