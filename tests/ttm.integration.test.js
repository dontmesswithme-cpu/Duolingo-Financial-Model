/**
 * P1.4 Full Pipeline Integration Test — `loadHistorical()` -> `ttm.compute()`.
 *
 * Runs over the real 4-dataset corpus: `income.json`, `balance.json`,
 * `cashflow.json`, and `kpis.json`.
 *
 * Asserts:
 * 1. Output structure: `records`, `byMetric`, `discreteQuarters`, `flow`, `stock`, `kpi`.
 * 2. TTM flow sums: Bookings ($1.216B total, $1.055B sub), Operating CF ($430.5M), Adjusted EBITDA ($325.1M).
 * 3. Point-in-time stock metrics resolve to latest quarter-end (Q2 FY2026).
 * 4. Point-in-time KPI metrics resolve to latest reported value (DAU = 58.7M, Paid subs = 12.7M).
 * 5. Full derivation traceability: all computed records have `isComputed: true` and populated `derivedFrom`.
 * 6. Pure module invariant: zero side-effecting globals / fetch / DOM.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical } from '../src/data/loader.js';
import { readLedgerUrls } from './_ledger.js';
import ttm from '../src/engine/ttm.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

async function loadFullCorpus() {
  return loadHistorical({
    dir: DATA_DIR,
    readText,
    requireLedger: true,
    ledger: LEDGER,
  });
}

describe('P1.4 — full pipeline integration (loadHistorical -> ttm.compute)', () => {
  test('ttm.compute runs successfully over real 4-statement corpus', async () => {
    const historical = await loadFullCorpus();
    const result = ttm.compute(historical);

    assert.ok(result, 'result must exist');
    assert.ok(Array.isArray(result.records), 'records must be an array');
    assert.ok(result.records.length > 0, 'records must not be empty');
    assert.ok(typeof result.byMetric === 'object');
    assert.ok(Array.isArray(result.flow));
    assert.ok(Array.isArray(result.stock));
    assert.ok(Array.isArray(result.kpi));
  });

  test('TTM flow sums are exact across cash flow and KPI metrics', async () => {
    const historical = await loadFullCorpus();
    const result = ttm.compute(historical);

    // Cash flow from operating activities: Q3 25 (84,239) + Q4 25 (107,278) + Q1 26 (150,771) + Q2 26 (88,260) = 430,548
    const ocf = result.byMetric.get('cash_from_operating_activities');
    assert.ok(ocf, 'missing TTM cash_from_operating_activities');
    assert.equal(ocf.value, 430_548);
    assert.equal(ocf.period, 'TTM');
    assert.equal(ocf.periodType, 'ttm');
    assert.equal(ocf.units, 'thousands_usd');
    assert.equal(ocf.isComputed, true);
    assert.equal(ocf.derivedFrom.length, 4);

    // Total bookings: Q3 25 (281,919) + Q4 25 (336,838) + Q1 26 (308,484) + Q2 26 (289,054) = 1,216,295
    const totalBookings = result.byMetric.get('total_bookings');
    assert.ok(totalBookings, 'missing TTM total_bookings');
    assert.equal(totalBookings.value, 1_216_295);
    assert.equal(totalBookings.period, 'TTM');
    assert.equal(totalBookings.isComputed, true);
    assert.equal(totalBookings.derivedFrom.length, 4);

    // Subscription bookings: Q3 25 (240,270) + Q4 25 (296,555) + Q1 26 (268,065) + Q2 26 (250,316) = 1,055,206
    const subBookings = result.byMetric.get('subscription_bookings');
    assert.ok(subBookings, 'missing TTM subscription_bookings');
    assert.equal(subBookings.value, 1_055_206);
    assert.equal(subBookings.period, 'TTM');
    assert.equal(subBookings.isComputed, true);
    assert.equal(subBookings.derivedFrom.length, 4);

    // Adjusted EBITDA: Q3 25 (80,046) + Q4 25 (84,348) + Q1 26 (83,432) + Q2 26 (77,315) = 325,141
    const adjEbitda = result.byMetric.get('adjusted_ebitda');
    assert.ok(adjEbitda, 'missing TTM adjusted_ebitda');
    assert.equal(adjEbitda.value, 325_141);
    assert.equal(adjEbitda.period, 'TTM');
    assert.equal(adjEbitda.isComputed, true);
    assert.equal(adjEbitda.derivedFrom.length, 4);
  });

  test('stock metrics resolve to latest balance date (Q2 FY2026)', async () => {
    const historical = await loadFullCorpus();
    const result = ttm.compute(historical);

    const totalAssets = result.byMetric.get('total_assets');
    assert.ok(totalAssets, 'missing total_assets');
    assert.equal(totalAssets.value, 2_073_953);
    assert.equal(totalAssets.period, 'Q2 FY2026');
    assert.equal(totalAssets.isComputed, true);
    assert.equal(totalAssets.derivedFrom.length, 1);

    const cash = result.byMetric.get('cash_and_cash_equivalents');
    assert.ok(cash, 'missing cash_and_cash_equivalents');
    assert.equal(cash.value, 1_180_887);
    assert.equal(cash.period, 'Q2 FY2026');
    assert.equal(cash.isComputed, true);
  });

  test('KPI metrics resolve to latest reported values (DAU=58.7M, Paid subs=12.7M)', async () => {
    const historical = await loadFullCorpus();
    const result = ttm.compute(historical);

    const dau = result.byMetric.get('dau');
    assert.ok(dau, 'missing DAU');
    assert.equal(dau.value, 58_700_000);
    assert.equal(dau.period, 'Q2 FY2026');
    assert.equal(dau.units, 'count');
    assert.equal(dau.isComputed, true);
    assert.equal(dau.derivedFrom.length, 1);

    const subs = result.byMetric.get('paid_subscribers');
    assert.ok(subs, 'missing paid_subscribers');
    assert.equal(subs.value, 12_700_000);
    assert.equal(subs.period, 'Q2 FY2026');
    assert.equal(subs.units, 'count');
    assert.equal(subs.isComputed, true);

    const mau = result.byMetric.get('mau');
    assert.ok(mau, 'missing MAU');
    assert.equal(mau.value, 133_100_000);
    assert.equal(mau.period, 'FY2025');
    assert.equal(mau.units, 'count');
  });

  test('all computed records carry isComputed: true and valid derivedFrom chains', async () => {
    const historical = await loadFullCorpus();
    const result = ttm.compute(historical);

    for (const record of result.records) {
      assert.equal(record.isComputed, true, `${record.metric} must have isComputed: true`);
      assert.ok(Array.isArray(record.derivedFrom), `${record.metric} must have derivedFrom array`);
      assert.ok(record.derivedFrom.length > 0, `${record.metric} derivedFrom must not be empty`);
      for (const origin of record.derivedFrom) {
        assert.ok(origin.period, `${record.metric} origin must have period`);
        assert.ok(typeof origin.value === 'number', `${record.metric} origin must have numeric value`);
      }
    }
  });

  test('all resolvable TTM revenue components are strictly positive and sum to TTM revenue', async () => {
    const historical = await loadFullCorpus();
    const result = ttm.compute(historical);
    const revComponents = [
      'revenue_subscription',
      'revenue_advertising',
      'revenue_duolingo_english_test',
      'revenue_in_app_purchases',
      'revenue_other',
    ];
    let sum = 0;
    for (const metric of revComponents) {
      const record = result.byMetric.get(metric);
      assert.ok(record, `Missing TTM record for ${metric}`);
      assert.ok(record.value > 0, `TTM ${metric} (${record.value}) must be strictly positive`);
      sum += record.value;
    }
    const ttmTotal = result.byMetric.get('revenue_total');
    assert.ok(ttmTotal, 'Missing TTM record for revenue_total');
    assert.equal(sum, ttmTotal.value, `TTM revenue components sum ${sum} != TTM total revenue ${ttmTotal.value}`);
  });

  test('engine purity: ttm.js contains zero DOM, zero fetch, zero wall-clock reads', async () => {
    const code = await readText(new URL('../src/engine/ttm.js', import.meta.url));
    assert.doesNotMatch(code, /\bwindow\./);
    assert.doesNotMatch(code, /\bdocument\b|\bHTMLElement\b/);
    assert.doesNotMatch(code, /\bfetch\s*\(|\bXMLHttpRequest\b/);
    assert.doesNotMatch(code, /\bDate\.now\b|\bnew Date\b/);
    assert.doesNotMatch(code, /\bMath\.random\b/);
  });
});

