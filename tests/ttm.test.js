/**
 * P1.3 Artifact Contract tests  -  `src/engine/ttm.js`.
 *
 * Covers:
 * - YTD differencing for flow metrics against hand-computed fixture differences.
 * - Q4 discrete derivation (FY - 9M YTD).
 * - TTM window summation (sum of 4 discrete quarters: Q3 FY2025 + Q4 FY2025 + Q1 FY2026 + Q2 FY2026).
 * - Classification rules (flow -> TTM sum, stock -> latest balance date, kpi -> latest reported value).
 * - Output labeling (`isComputed: true` and derived-from chain on every output).
 * - Engine purity (no DOM, no fetch, no Date.now, no Math.random).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical } from '../src/data/loader.js';
import { readLedgerUrls } from './_ledger.js';
import ttm, { compute, deriveDiscreteQuarters, TTM_WINDOW_QUARTERS } from '../src/engine/ttm.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

async function getHistorical() {
  return loadHistorical({
    dir: DATA_DIR,
    readText,
    requireLedger: true,
    ledger: LEDGER,
  });
}

describe('P1.3  -  TTM engine: discrete-quarter derivation and differencing', () => {
  test('deriveDiscreteQuarters correctly differences YTD rows for operating cash flow', async () => {
    const historical = await getHistorical();
    const discrete = deriveDiscreteQuarters(historical.cashflow, 'cash_from_operating_activities');

    assert.ok(discrete.has('Q1 FY2026'));
    assert.ok(discrete.has('Q2 FY2026'));
    assert.ok(discrete.has('Q3 FY2025'));
    assert.ok(discrete.has('Q4 FY2025'));

    // Hand-computed fixture values from EDGAR filings:
    // Q1 FY2026: 3M FY2026 = 150,771
    assert.equal(discrete.get('Q1 FY2026').value, 150_771);

    // Q2 FY2026: 6M FY2026 (239,031) - 3M FY2026 (150,771) = 88,260
    assert.equal(discrete.get('Q2 FY2026').value, 88_260);

    // Q3 FY2025: 9M FY2025 (280,545) - 6M FY2025 (196,306) = 84,239
    assert.equal(discrete.get('Q3 FY2025').value, 84_239);

    // Q4 FY2025: FY2025 (387,823) - 9M FY2025 (280,545) = 107,278
    assert.equal(discrete.get('Q4 FY2025').value, 107_278);
  });

  test('deriveDiscreteQuarters correctly derives Q4 FY2025 net income from FY2025 - 9M FY2025', async () => {
    const historical = await getHistorical();
    // In cashflow.json, cf_net_income is filed for FY2025 (414,065) and 9M FY2025 (372,111)
    const discrete = deriveDiscreteQuarters(historical.cashflow, 'cf_net_income');

    assert.ok(discrete.has('Q4 FY2025'));
    // Q4 FY2025 = 414,065 - 372,111 = 41,954
    assert.equal(discrete.get('Q4 FY2025').value, 41_954);
    assert.equal(discrete.get('Q4 FY2025').isDerived, true);
  });

  test('TTM window covers the four mandated quarters', () => {
    assert.deepEqual(TTM_WINDOW_QUARTERS, [
      'Q3 FY2025',
      'Q4 FY2025',
      'Q1 FY2026',
      'Q2 FY2026',
    ]);
  });
});

describe('P1.3  -  TTM engine: compute() over loaded historical corpus', () => {
  test('ttm.compute produces TTM flow records with isComputed: true and derivedFrom chain', async () => {
    const historical = await getHistorical();
    const result = compute(historical);

    assert.ok(result);
    assert.ok(Array.isArray(result.records));
    assert.ok(result.records.length > 0);
    assert.ok(result.byMetric instanceof Map);

    const ocf = result.byMetric.get('cash_from_operating_activities');
    assert.ok(ocf, 'must compute TTM for cash_from_operating_activities');
    assert.equal(ocf.period, 'TTM');
    assert.equal(ocf.periodType, 'ttm');
    assert.equal(ocf.klass, 'flow');
    assert.equal(ocf.isComputed, true);
    assert.equal(ocf.isEstimate, false);

    // Sum of 4 quarters: 84,239 + 107,278 + 150,771 + 88,260 = 430,548
    assert.equal(ocf.value, 430_548);

    // Verify derivedFrom chain
    assert.ok(Array.isArray(ocf.derivedFrom));
    assert.equal(ocf.derivedFrom.length, 4);
    assert.deepEqual(
      ocf.derivedFrom.map((d) => d.period),
      ['Q3 FY2025', 'Q4 FY2025', 'Q1 FY2026', 'Q2 FY2026']
    );
    assert.deepEqual(
      ocf.derivedFrom.map((d) => d.value),
      [84_239, 107_278, 150_771, 88_260]
    );
  });

  test('ttm.compute correctly resolves stock metrics to latest balance date', async () => {
    const historical = await getHistorical();
    const result = compute(historical);

    const assets = result.byMetric.get('total_assets');
    assert.ok(assets, 'must resolve stock metric total_assets');
    assert.equal(assets.klass, 'stock');
    assert.equal(assets.period, 'Q2 FY2026');
    assert.equal(assets.periodType, 'quarter');
    assert.equal(assets.value, 2_073_953);
    assert.equal(assets.isComputed, true);
    assert.equal(assets.isEstimate, false);
    assert.ok(Array.isArray(assets.derivedFrom));
    assert.equal(assets.derivedFrom[0].period, 'Q2 FY2026');
  });

  test('ttm.compute correctly resolves mock KPI records to latest reported value', () => {
    const mockKpis = [
      {
        metric: 'dau',
        label: 'Daily Active Users',
        klass: 'kpi',
        period: 'Q1 FY2026',
        periodType: 'quarter',
        value: 31_400_000,
        units: 'count',
        scale: 1,
        definition: 'DAUs are defined as...',
        category: 'engagement',
        source: { filing: 'IR', period: 'Q1 2026', statement: 'Release', url: 'https://...', accessedAt: '2026-09-01' },
        isEstimate: false,
      },
      {
        metric: 'dau',
        label: 'Daily Active Users',
        klass: 'kpi',
        period: 'Q2 FY2026',
        periodType: 'quarter',
        value: 34_100_000,
        units: 'count',
        scale: 1,
        definition: 'DAUs are defined as...',
        category: 'engagement',
        source: { filing: 'IR', period: 'Q2 2026', statement: 'Release', url: 'https://...', accessedAt: '2026-09-01' },
        isEstimate: false,
      },
    ];

    const result = compute({ kpis: mockKpis });
    const dau = result.byMetric.get('dau');
    assert.ok(dau);
    assert.equal(dau.klass, 'kpi');
    assert.equal(dau.period, 'Q2 FY2026');
    assert.equal(dau.value, 34_100_000);
    assert.equal(dau.isComputed, true);
    assert.equal(dau.definition, 'DAUs are defined as...');
  });

  test('every output record in result.records is marked isComputed: true', async () => {
    const historical = await getHistorical();
    const result = compute(historical);

    for (const record of result.records) {
      assert.equal(record.isComputed, true, `${record.metric} @ ${record.period} must be isComputed: true`);
      assert.equal(record.isEstimate, false, `${record.metric} @ ${record.period} must be isEstimate: false`);
      assert.ok(record.derivedFrom, `${record.metric} @ ${record.period} must carry derivedFrom chain`);
      assert.ok(Array.isArray(record.derivedFrom) && record.derivedFrom.length > 0);
    }
  });
});

describe('P1.3  -  Engine purity gate: src/engine/ttm.js', () => {
  test('src/engine/ttm.js contains no forbidden side-effecting APIs (DOM, fetch, Date.now, Math.random)', async () => {
    const raw = await readText(new URL('../src/engine/ttm.js', import.meta.url));
    const code = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    assert.doesNotMatch(code, /\bfetch\s*\(/, 'must not call fetch');
    assert.doesNotMatch(code, /\bDate\s*\.\s*now\b/, 'must not call Date.now');
    assert.doesNotMatch(code, /\bMath\s*\.\s*random\b/, 'must not call Math.random');
    assert.doesNotMatch(code, /\bwindow\s*\./, 'must not access window properties');
    assert.doesNotMatch(code, /\bdocument\s*\./, 'must not access document properties');
    assert.doesNotMatch(code, /\blocalStorage\b/, 'must not reference localStorage');
    assert.doesNotMatch(code, /\bsessionStorage\b/, 'must not reference sessionStorage');
  });
});
