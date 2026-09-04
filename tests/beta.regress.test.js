/**
 * Tests for Task P6R2.2: Computed Beta — Corpus Series, OLS Engine Module, Driver Re-Anchor.
 *
 * Verifies:
 *  1. Pure OLS regression calculation (slope, intercept, R², standard error, sample size, window)
 *  2. Fail-closed gates (insufficient observations n < 24, non-finite values, zero variance)
 *  3. Engine purity, determinism, and deep-freeze contracts
 *  4. Integration with bundled corpus price series src/data/historical/prices.json
 *  5. Driver re-anchor consistency gate: runtime beta rounded to 0.01 step === assumptions.json beta value (0.89)
 *  6. Provider cross-check alignment (|computed - provider| < 0.001) and cost-of-equity materiality (< 1 bp)
 *  7. Corpus 706-record count invariance
 *  8. UI derivation disclosures in Valuation tab and Assumptions tab
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { regress } from '../src/engine/beta.js';
import { EngineError } from '../src/data/errors.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { renderValuation } from '../src/ui/valuationTab.js';
import { renderAssumptions } from '../src/ui/assumptionsTab.js';
import pricesDataset from '../src/data/historical/prices.json' with { type: 'json' };

const P3_CORPUS_RECORD_COUNT = 706;

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const ENGINE_BETA_PATH = fileURLToPath(new URL('../src/engine/beta.js', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const getAssumptions = () => loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
const getHistorical = () => loadHistorical({ dir: DATA_DIR, readText });

function extractRows(dataset) {
  if (!dataset) return [];
  if (Array.isArray(dataset)) return dataset;
  if (Array.isArray(dataset.rows)) return dataset.rows;
  return [];
}

function createHtmlContainer() {
  const listeners = [];
  return {
    innerHTML: '',
    querySelectorAll(selector) {
      if (this.innerHTML.includes(selector.replace(/[[\]"]/g, ''))) {
        return [{ getAttribute: () => 'base', addEventListener: () => {} }];
      }
      return [];
    },
    querySelector(selector) {
      return {
        innerHTML: '',
        appendChild: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
      };
    },
  };
}

describe('P6R2.2 — OLS Beta Engine: Math & Synthetic Fixtures', () => {
  test('exact slope, intercept, R² and zero stderr on perfect linear series (y = 2x + 1)', () => {
    // 30 points: x = 0.01, 0.02, ..., 0.30; y = 2x + 1
    const obs = [];
    for (let i = 1; i <= 30; i++) {
      const x = i * 0.01;
      const y = 2 * x + 1;
      obs.push({
        period: `2024-${String(i).padStart(2, '0')}`,
        stockReturn: y,
        benchmarkReturn: x,
      });
    }

    const res = regress(obs);
    assert.strictEqual(res.n, 30);
    assert.ok(Math.abs(res.beta - 2.0) < 1e-12, `Beta must be 2.0, got ${res.beta}`);
    assert.ok(Math.abs(res.alphaMonthly - 1.0) < 1e-12, `Alpha must be 1.0, got ${res.alphaMonthly}`);
    assert.ok(Math.abs(res.r2 - 1.0) < 1e-12, `R² must be 1.0, got ${res.r2}`);
    assert.ok(res.stderr < 1e-10, `Stderr must be near zero, got ${res.stderr}`);
    assert.strictEqual(res.windowStart, '2024-01');
    assert.strictEqual(res.windowEnd, '2024-30');
  });

  test('negative slope (y = -0.5x + 0.02)', () => {
    const obs = [];
    for (let i = 1; i <= 25; i++) {
      const x = (i - 13) * 0.01;
      const y = -0.5 * x + 0.02;
      obs.push({ y, x, period: `P${i}` });
    }

    const res = regress(obs);
    assert.strictEqual(res.n, 25);
    assert.ok(Math.abs(res.beta - (-0.5)) < 1e-12, `Beta must be -0.5, got ${res.beta}`);
    assert.ok(Math.abs(res.alphaMonthly - 0.02) < 1e-12, `Alpha must be 0.02, got ${res.alphaMonthly}`);
    assert.ok(Math.abs(res.r2 - 1.0) < 1e-12, `R² must be 1.0, got ${res.r2}`);
  });

  test('supports object container with observations property and array of pairs', () => {
    const obs = [];
    for (let i = 1; i <= 24; i++) {
      obs.push([i * 0.02, i * 0.01]);
    }
    const res = regress({ observations: obs, benchmark: 'S&P 500 Index' });
    assert.strictEqual(res.n, 24);
    assert.ok(Math.abs(res.beta - 2.0) < 1e-12);
    assert.strictEqual(res.benchmark, 'S&P 500 Index');
  });
});

describe('P6R2.2 — OLS Beta Engine: Fail-Closed Gates', () => {
  test('rejects missing or invalid observation input with EngineError', () => {
    assert.throws(
      () => regress(null),
      (err) => err instanceof EngineError && err.code === 'invalid_observations',
    );
    assert.throws(
      () => regress(undefined),
      (err) => err instanceof EngineError && err.code === 'invalid_observations',
    );
    assert.throws(
      () => regress({}),
      (err) => err instanceof EngineError && err.code === 'invalid_observations',
    );
  });

  test('rejects sample size n < 24 with insufficient_observations', () => {
    const shortObs = [];
    for (let i = 0; i < 23; i++) {
      shortObs.push({ stockReturn: 0.01, benchmarkReturn: 0.01 });
    }
    assert.throws(
      () => regress(shortObs),
      (err) => {
        assert.ok(err instanceof EngineError);
        assert.strictEqual(err.code, 'insufficient_observations');
        assert.strictEqual(err.driverName, 'observations');
        assert.match(err.message, /at least 24 return observations/);
        return true;
      },
    );
  });

  test('rejects non-finite stock return with non_finite_input', () => {
    const obs = [];
    for (let i = 0; i < 25; i++) {
      obs.push({ stockReturn: i === 10 ? NaN : 0.01, benchmarkReturn: 0.01 });
    }
    assert.throws(
      () => regress(obs),
      (err) => err instanceof EngineError && err.code === 'non_finite_input',
    );
  });

  test('rejects non-finite benchmark return with non_finite_input', () => {
    const obs = [];
    for (let i = 0; i < 25; i++) {
      obs.push({ stockReturn: 0.01, benchmarkReturn: i === 15 ? Infinity : 0.01 });
    }
    assert.throws(
      () => regress(obs),
      (err) => err instanceof EngineError && err.code === 'non_finite_input',
    );
  });

  test('rejects zero benchmark variance with zero_variance', () => {
    const obs = [];
    for (let i = 0; i < 25; i++) {
      // all benchmark returns identical -> Var(x) = 0
      obs.push({ stockReturn: i * 0.01, benchmarkReturn: 0.02 });
    }
    assert.throws(
      () => regress(obs),
      (err) => err instanceof EngineError && err.code === 'zero_variance',
    );
  });
});

describe('P6R2.2 — OLS Beta Engine: Purity, Determinism & Literals', () => {
  test('regress() output is deeply frozen', () => {
    const obs = [];
    for (let i = 0; i < 24; i++) {
      obs.push({ stockReturn: i * 0.02, benchmarkReturn: i * 0.01 });
    }
    const res = regress(obs);
    assert.ok(Object.isFrozen(res), 'Result must be frozen');
    assert.throws(() => {
      res.beta = 1.0;
    });
  });

  test('regress() is deterministic across repeated calls', () => {
    const res1 = regress(pricesDataset);
    const res2 = regress(pricesDataset);
    assert.deepStrictEqual(res1, res2);
  });

  test('src/engine/beta.js contains no forbidden side-effecting APIs', () => {
    const raw = fs.readFileSync(ENGINE_BETA_PATH, 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    assert.doesNotMatch(code, /\bDate\s*\.\s*now\b/, 'Zero Date.now');
    assert.doesNotMatch(code, /\bMath\s*\.\s*random\b/, 'Zero Math.random');
    assert.doesNotMatch(code, /\bfetch\s*\(/, 'Zero fetch');
    assert.doesNotMatch(code, /\bwindow\s*\./, 'Zero window');
    assert.doesNotMatch(code, /\bdocument\s*\./, 'Zero document');
  });

  test('zero bare numeric literals > 999 outside comments in src/engine/beta.js', () => {
    const code = fs.readFileSync(ENGINE_BETA_PATH, 'utf8');
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      const match = stripped.match(/\b(?<![a-zA-Z_$])\d{4,}\b/);
      assert.ok(!match, `Found bare literal > 999 at line ${i + 1}: "${line.trim()}"`);
    }
  });
});

describe('P6R2.2 — Corpus Price Series & Regression Verification', () => {
  test('prices.json dataset carries cited source metadata and 60 observations', () => {
    assert.ok(pricesDataset.source, 'Source block must be present');
    assert.strictEqual(pricesDataset.source.stock.provider, 'stockanalysis.com');
    assert.ok(pricesDataset.source.stock.url.includes('stockanalysis.com'));
    assert.strictEqual(pricesDataset.source.benchmark.provider, 'Federal Reserve Bank of St. Louis (FRED)');
    assert.ok(pricesDataset.source.benchmark.url.includes('fred.stlouisfed.org'));
    assert.strictEqual(pricesDataset.benchmark, 'S&P 500 Index');
    assert.strictEqual(pricesDataset.frequency, 'monthly');
    assert.strictEqual(pricesDataset.basis, 'adjusted_close_simple_returns');
    assert.strictEqual(pricesDataset.n, 60);
    assert.strictEqual(pricesDataset.pricesCount, 61);
    assert.strictEqual(pricesDataset.windowStart, '2021-09');
    assert.strictEqual(pricesDataset.windowEnd, '2026-08');
    assert.strictEqual(pricesDataset.observations.length, 60);
    assert.strictEqual(pricesDataset.prices.length, 61);
  });

  test('regress(pricesDataset) derives beta = 0.890488 matching provider within 0.0005', () => {
    const res = regress(pricesDataset);

    // OLS slope check within 1e-6 of verified value
    assert.ok(
      Math.abs(res.beta - 0.890488) < 1e-5,
      `Beta should be ~0.890488, got ${res.beta}`,
    );

    // Rounded slope at 0.01 step must equal 0.89
    const roundedBeta = Number(res.beta.toFixed(2));
    assert.strictEqual(roundedBeta, 0.89, `Rounded beta must equal 0.89, got ${roundedBeta}`);

    // Regression diagnostics
    assert.strictEqual(res.n, 60);
    assert.strictEqual(res.windowStart, '2021-09');
    assert.strictEqual(res.windowEnd, '2026-08');
    assert.ok(Math.abs(res.alphaMonthly - 0.009421) < 1e-5, `Alpha should be ~0.009421, got ${res.alphaMonthly}`);
    assert.ok(Math.abs(res.r2 - 0.048272) < 1e-5, `R² should be ~0.048272, got ${res.r2}`);
    assert.ok(Math.abs(res.stderr - 0.519187) < 1e-5, `Stderr should be ~0.519187, got ${res.stderr}`);

    // Provider cross-check: stockanalysis.com 5Y monthly beta = 0.89
    const providerBeta = 0.89;
    const deviation = Math.abs(res.beta - providerBeta);
    assert.ok(deviation < 0.001, `Provider deviation must be < 0.001, got ${deviation}`);

    // Materiality check: cost-of-equity impact is ~0.22 bps (< 1 bp)
    const erp = 0.0446; // published Damodaran ERP
    const reImpactBps = deviation * erp * 10000;
    assert.ok(reImpactBps < 1.0, `Cost-of-equity impact must be < 1.0 bps, got ${reImpactBps}`);
  });

  test('consistency gate: runtime beta.js output rounded to 0.01 step === assumptions.json beta driver value', async () => {
    const assumptions = await getAssumptions();
    const betaDriver = assumptions.get('beta');
    assert.ok(betaDriver, 'beta driver must exist');

    const reg = regress(pricesDataset);
    const computedRounded = Number(reg.beta.toFixed(2));

    assert.strictEqual(
      betaDriver.value,
      computedRounded,
      `Driver value (${betaDriver.value}) must equal runtime computed OLS slope rounded to step (${computedRounded})`,
    );

    // Driver metadata verification
    assert.strictEqual(betaDriver.marking, 'MKT');
    assert.strictEqual(betaDriver.asOf, '2026-08-31');
    assert.strictEqual(betaDriver.source.provider, 'stockanalysis.com');
    assert.ok(betaDriver.source.url.includes('stockanalysis.com'));
    assert.ok(betaDriver.notes.includes('MKT snapshot as of 2026-08-31'));
    assert.ok(betaDriver.notes.includes('0.890488'));
    assert.ok(betaDriver.notes.includes('2021-09 to 2026-08'));
    assert.ok(betaDriver.notes.includes('S&P 500 Index'));
    assert.ok(betaDriver.notes.includes('no Hamada adjustment applies'));
  });

  test('corpus invariant: 706 historical records unchanged', async () => {
    const historical = await getHistorical();
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];
    assert.strictEqual(allRows.length, P3_CORPUS_RECORD_COUNT);
  });
});

describe('P6R2.2 — UI Presentation: Beta Derivation Blocks', () => {
  test('valuationTab renders Beta Derivation card with regression statistics and cross-check', () => {
    const container = createHtmlContainer();
    const mockWacc = {
      beta: {
        value: 0.89,
        asOf: '2026-08-31',
        source: { provider: 'stockanalysis.com', url: 'https://stockanalysis.com/stocks/duol/statistics/' },
      },
      riskFreeRate: { value: 0.0479, asOf: '2026-09-01', source: { provider: 'FRED' } },
      erp: { value: 0.0446, asOf: '2026-01-05', source: { provider: 'Damodaran' } },
      costOfEquity: { value: 0.0876 },
      wacc: { value: 0.0876 },
      sharesOutstanding: { value: 43.15, asOf: '2026-06-30' },
    };
    const mockDcf = {
      schedule: [],
      pvExplicit: 100000,
      pvTerminal: 200000,
      terminalValue: 300000,
      terminalGrowthRate: 0.025,
      enterpriseValue: 300000,
      bridge: { cash: 50000, shortTermInvestments: 50000, longTermInvestments: 0, debt: 0 },
      equityValue: 400000,
      sharesOutstanding: 43150000,
      perShareValue: 180.5,
    };

    const view = renderValuation({
      container,
      wacc: mockWacc,
      dcf: mockDcf,
      prices: pricesDataset,
      TabulatorConstructor: null,
    });

    const html = container.innerHTML;
    assert.ok(html.includes('beta-derivation-card'), 'Must render beta derivation card');
    assert.ok(html.includes('60 months'), 'Must display sample size 60');
    assert.ok(html.includes('2021-09 – 2026-08'), 'Must display regression window');
    assert.ok(html.includes('S&amp;P 500 Index') || html.includes('S&P 500 Index'), 'Must display benchmark');
    assert.ok(html.includes('0.8905'), 'Must display computed OLS slope');
    assert.ok(html.includes('0.89'), 'Must display active model driver value');
    assert.ok(html.includes('4.83%'), 'Must display R²');
    assert.ok(html.includes('0.5192'), 'Must display standard error');
    assert.ok(html.includes('no Hamada adjustment required'), 'Must disclose debt-free no-Hamada status');
    assert.ok(html.includes('user-adjustable'), 'Must state driver remains user-adjustable');

    view.dispose();
  });

  test('assumptionsTab displays re-anchored beta provenance notes', async () => {
    const assumptions = await getAssumptions();
    const container = createHtmlContainer();

    const view = renderAssumptions({
      container,
      assumptions,
    });

    const html = container.innerHTML;
    assert.ok(html.includes('0.890488'), 'Assumptions HTML must contain computed OLS slope');
    assert.ok(html.includes('60-observation'), 'Assumptions HTML must contain 60-observation window note');
    assert.ok(html.includes('no Hamada adjustment applies'), 'Assumptions HTML must contain Hamada note');

    view.dispose();
  });
});
