/**
 * P4.3 Artifact Contract Tests — Sensitivity Grids, Bear/Base/Bull Per-Share Ranges
 * & Mechanical Recommendation (Final Sub-Phase).
 *
 * Covers:
 *  - `recommend.evaluate(dcfPerShare, marketPrice)` interface, mechanical formula,
 *    threshold boundaries, and exact 3-word vocabulary ('undervalued' | 'fair' | 'overvalued').
 *  - Zero hardcoded threshold literals in `recommend.js` (imported from `constants.js`).
 *  - `recommend.buildSensitivityGrid(input)`: grid dimensions (9×5 = 45 cells),
 *    strict monotonicity (perShare ↓ as WACC ↑, perShare ↑ as g ↑), 4 corner pins,
 *    and WACC > g guard across every cell.
 *  - `recommend.runFullValuation(historical, assumptions, scenario)`: full-path valuation
 *    across Bear/Base/Bull, strict ordering Bear < Base < Bull for per-share equity,
 *    hybrid H1 invariance across scenarios (590,421 rev / 76,618 OI / 239,031 OCF),
 *    and benchmark price invariance ($148.36).
 *  - Purity, determinism, deep-freeze, zero bare literals > 999, and corpus record count invariant.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { EngineError } from '../src/data/errors.js';
import { RECOMMENDATION_THRESHOLDS, SCENARIO_NAMES } from '../src/data/constants.js';
import { readLedgerUrls } from './_ledger.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import {
  evaluate,
  buildSensitivityGrid,
  runFullValuation,
} from '../src/engine/recommend.js';
import { runFullProjection, apply as applyScenario } from '../src/engine/scenarios.js';
import {
  MARKET_KNOWN_FIGURES,
  DCF_KNOWN_FIGURES,
  RECOMMENDATION_KNOWN_FIGURES,
  deriveExpectedRecommendation,
} from './fixtures/duolingo_facts.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const RECOMMEND_ENGINE_PATH = fileURLToPath(new URL('../src/engine/recommend.js', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

const P3_CORPUS_RECORD_COUNT = 706;

/** Absolute tolerance for small float ratios. */
const TOL = 1e-12;

/** Relative tolerance for monetary values. */
const REL_TOL = 1e-12;

function pinned(actual, expected, label, tol = TOL) {
  const slack = Math.max(tol, Math.abs(expected) * REL_TOL);
  assert.ok(
    Math.abs(actual - expected) <= slack,
    `${label}: expected ${expected}, received ${actual} (tolerance ${slack})`,
  );
}

async function getHistorical() {
  return loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
}

async function getAssumptions() {
  return loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
}

describe('P4.3 — Mechanical recommendation and threshold boundaries', () => {
  test('evaluate() computes upside percentage and applies fixed thresholds exactly', () => {
    const marketPrice = 100;

    // Boundary 1: upside >= +15% -> undervalued
    const recUnder15 = evaluate(115, marketPrice);
    assert.equal(recUnder15.label, 'undervalued');
    pinned(recUnder15.upsidePct, 0.15, '15% upside');

    const recUnder50 = evaluate(150, marketPrice);
    assert.equal(recUnder50.label, 'undervalued');
    pinned(recUnder50.upsidePct, 0.50, '50% upside');

    // Boundary 2: upside between -15% and +15% -> fair
    const recFairHigh = evaluate(114.99, marketPrice);
    assert.equal(recFairHigh.label, 'fair');

    const recFairMid = evaluate(100, marketPrice);
    assert.equal(recFairMid.label, 'fair');
    pinned(recFairMid.upsidePct, 0, '0% upside');

    const recFairLow = evaluate(85.01, marketPrice);
    assert.equal(recFairLow.label, 'fair');

    // Boundary 3: upside <= -15% -> overvalued
    const recOver15 = evaluate(85, marketPrice);
    assert.equal(recOver15.label, 'overvalued');
    pinned(recOver15.upsidePct, -0.15, '-15% upside');

    const recOver50 = evaluate(50, marketPrice);
    assert.equal(recOver50.label, 'overvalued');
    pinned(recOver50.upsidePct, -0.50, '-50% upside');

    // Assert exact vocabulary
    const validLabels = new Set(RECOMMENDATION_KNOWN_FIGURES.vocabulary);
    for (const r of [recUnder15, recUnder50, recFairHigh, recFairMid, recFairLow, recOver15, recOver50]) {
      assert.ok(validLabels.has(r.label), `Label "${r.label}" must be in contracted vocabulary`);
    }
  });

  test('Base DCF output against MKT snapshot price yields undervalued (+68.08%)', async () => {
    const basePerShare = 249.35851138243592;
    const marketPrice = 148.36;

    const rec = evaluate(basePerShare, marketPrice);
    assert.equal(rec.label, 'undervalued');
    const expectedUpside = (basePerShare - marketPrice) / marketPrice;
    pinned(rec.upsidePct, expectedUpside, 'Base upside percentage (~68.08%)');
    assert.ok(rec.upsidePct > 0.68 && rec.upsidePct < 0.69);

    // Tie-out against fixture
    const expRec = deriveExpectedRecommendation(basePerShare, marketPrice);
    assert.equal(rec.label, expRec.label);
    pinned(rec.upsidePct, expRec.upsidePct, 'matches deriveExpectedRecommendation fixture');
  });

  test('zero hardcoded threshold literals in recommend.js (imported from constants.js)', async () => {
    const source = await readText(RECOMMEND_ENGINE_PATH);
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    // Thresholds must come from RECOMMENDATION_THRESHOLDS, not bare literals
    assert.ok(
      source.includes('RECOMMENDATION_THRESHOLDS'),
      'recommend.js must import RECOMMENDATION_THRESHOLDS',
    );
    assert.doesNotMatch(codeOnly, /0\.15/, 'recommend.js must not contain hardcoded 0.15 literal');
    assert.doesNotMatch(codeOnly, /-0\.15/, 'recommend.js must not contain hardcoded -0.15 literal');
  });

  test('fail-closed on non-finite or non-positive inputs', () => {
    for (const bad of [0, -10, NaN, Infinity, null, undefined, '100']) {
      assert.throws(
        () => evaluate(bad, 100),
        (err) => err instanceof EngineError && err.code === 'invalid_dcf_per_share',
      );
      assert.throws(
        () => evaluate(100, bad),
        (err) => err instanceof EngineError && err.code === 'invalid_market_price',
      );
    }
  });
});

describe('P4.3 — Sensitivity Grid (WACC × Terminal Growth Matrix)', () => {
  test('buildSensitivityGrid generates a 9×5 grid (45 cells) with strict monotonicity', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccOut = buildWacc({ assumptions, debtSchedule: fullProj.schedules.debt });

    const grid = buildSensitivityGrid({
      threeStatement: fullProj.threeStatement,
      assumptions,
      wacc: waccOut,
    });

    assert.equal(grid.waccValues.length, 9, '9 WACC points');
    assert.equal(grid.growthValues.length, 5, '5 terminal growth points');
    assert.equal(grid.cells.length, 45, '45 total sensitivity cells');

    // Strict monotonicity checks:
    // 1. Across columns (fixed growth, increasing WACC): perShare must strictly DECREASE
    for (const g of grid.growthValues) {
      for (let i = 1; i < grid.waccValues.length; i += 1) {
        const higherWacc = grid.waccValues[i];
        const lowerWacc = grid.waccValues[i - 1];
        const priceHigherWacc = grid.matrix[higherWacc][g].perShare;
        const priceLowerWacc = grid.matrix[lowerWacc][g].perShare;

        assert.ok(
          priceHigherWacc < priceLowerWacc,
          `Monotonicity fail: higher WACC (${higherWacc}) price ($${priceHigherWacc}) must be < lower WACC (${lowerWacc}) price ($${priceLowerWacc}) at g=${g}`,
        );
      }
    }

    // 2. Across rows (fixed WACC, increasing growth): perShare must strictly INCREASE
    for (const w of grid.waccValues) {
      for (let j = 1; j < grid.growthValues.length; j += 1) {
        const higherG = grid.growthValues[j];
        const lowerG = grid.growthValues[j - 1];
        const priceHigherG = grid.matrix[w][higherG].perShare;
        const priceLowerG = grid.matrix[w][lowerG].perShare;

        assert.ok(
          priceHigherG > priceLowerG,
          `Monotonicity fail: higher g (${higherG}) price ($${priceHigherG}) must be > lower g (${lowerG}) price ($${priceLowerG}) at WACC=${w}`,
        );
      }
    }

    // Four corner pins:
    const minWacc = grid.waccValues[0];
    const maxWacc = grid.waccValues[grid.waccValues.length - 1];
    const minG = grid.growthValues[0];
    const maxG = grid.growthValues[grid.growthValues.length - 1];

    const cornerTopLeft = grid.matrix[minWacc][minG].perShare; // low WACC, low growth
    const cornerTopRight = grid.matrix[minWacc][maxG].perShare; // low WACC, high growth (highest valuation)
    const cornerBottomLeft = grid.matrix[maxWacc][minG].perShare; // high WACC, low growth (lowest valuation)
    const cornerBottomRight = grid.matrix[maxWacc][maxG].perShare; // high WACC, high growth

    assert.ok(cornerTopRight > cornerTopLeft);
    assert.ok(cornerTopLeft > cornerBottomLeft);
    assert.ok(cornerBottomRight > cornerBottomLeft);
    assert.ok(cornerTopRight > cornerBottomRight);

    // Global extremes
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const cell of grid.cells) {
      if (cell.perShare < minPrice) minPrice = cell.perShare;
      if (cell.perShare > maxPrice) maxPrice = cell.perShare;
    }
    assert.equal(minPrice, cornerBottomLeft, 'Minimum valuation must be at max WACC, min growth');
    assert.equal(maxPrice, cornerTopRight, 'Maximum valuation must be at min WACC, max growth');
  });

  test('every cell enforces WACC > g guard: invalid cell throws typed EngineError', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');

    // A grid that contains a cell where wacc <= growth (e.g. wacc=0.03, growth=0.03)
    assert.throws(
      () =>
        buildSensitivityGrid({
          threeStatement: fullProj.threeStatement,
          assumptions,
          waccValues: [0.03, 0.04],
          growthValues: [0.03, 0.035],
        }),
      (err) => err instanceof EngineError && err.code === 'terminal_growth_exceeds_wacc',
    );
  });
});

describe('P4.3 — Full Valuation Pipeline & Scenario Ranges', () => {
  test('runFullValuation executes end-to-end for Bear, Base, and Bull with strict ordering', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const bearVal = runFullValuation(historical, assumptions, 'bear');
    const baseVal = runFullValuation(historical, assumptions, 'base');
    const bullVal = runFullValuation(historical, assumptions, 'bull');

    // Strict ordering: Bear < Base < Bull
    assert.ok(
      bearVal.perShare < baseVal.perShare,
      `Bear perShare ($${bearVal.perShare.toFixed(2)}) must be < Base ($${baseVal.perShare.toFixed(2)})`,
    );
    assert.ok(
      baseVal.perShare < bullVal.perShare,
      `Base perShare ($${baseVal.perShare.toFixed(2)}) must be < Bull ($${bullVal.perShare.toFixed(2)})`,
    );

    // Assert Base per-share matches pinned value
    pinned(baseVal.perShare, 249.35851138243592, 'Base per-share pin');
    assert.equal(baseVal.recommendation.label, 'undervalued');

    // Benchmark price invariance: marketPrice remains 148.36 across all scenarios
    assert.equal(bearVal.marketPrice, 148.36);
    assert.equal(baseVal.marketPrice, 148.36);
    assert.equal(bullVal.marketPrice, 148.36);

    // Scenario recommendations
    assert.equal(bearVal.recommendation.label, 'fair', 'Bear upside is ~ -10.92% (within +/-15% fair band)');
    assert.equal(baseVal.recommendation.label, 'undervalued', 'Base upside is ~ +68.08%');
    assert.equal(bullVal.recommendation.label, 'undervalued', 'Bull upside is ~ +258.71%');
  });

  test('hybrid FY2026 valuation honesty under scenarios: cited H1 actuals invariant', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    for (const scenario of SCENARIO_NAMES) {
      const fullVal = runFullValuation(historical, assumptions, scenario);
      const isFY2026 = fullVal.incomeStatement.byPeriod.FY2026;
      const cfFY2026 = fullVal.cashFlow.byPeriod.FY2026;

      // H1 Revenue cited anchor: 590,421
      assert.equal(
        isFY2026.revenue.total.h1.value,
        590421,
        `H1 revenue anchor must be 590,421 in ${scenario}`,
      );

      // H1 Operating Income cited anchor: 78,472
      assert.equal(
        isFY2026.operating_income.h1.value,
        78472,
        `H1 operating income anchor must be 78,472 in ${scenario}`,
      );

      // H1 Net Income cited anchor: 76,618
      assert.equal(
        isFY2026.net_income.h1.value,
        76618,
        `H1 net income anchor must be 76,618 in ${scenario}`,
      );

      // H1 OCF cited anchor: 239,031
      assert.equal(
        cfFY2026.operating_activities.total.h1.value,
        239031,
        `H1 OCF anchor must be 239,031 in ${scenario}`,
      );
    }
  });
});

describe('P4.3 — Engine purity, determinism, deep-freeze & zero bare literals', () => {
  test('all outputs are deeply frozen and mutation throws', async () => {
    const rec = evaluate(200, 100);
    assert.ok(Object.isFrozen(rec));
    assert.ok(Object.isFrozen(rec.thresholds));
    assert.ok(Object.isFrozen(rec.derivedFrom));
    assert.throws(() => {
      rec.label = 'overvalued';
    }, TypeError);

    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullVal = runFullValuation(historical, assumptions, 'base');
    assert.ok(Object.isFrozen(fullVal));
    assert.ok(Object.isFrozen(fullVal.recommendation));
    assert.throws(() => {
      fullVal.perShare = 0;
    }, TypeError);
  });

  test('deterministic across repeated runs with byte-identical output', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const first = JSON.stringify(runFullValuation(historical, assumptions, 'base'));
    for (let i = 0; i < 5; i += 1) {
      const repeat = JSON.stringify(runFullValuation(historical, assumptions, 'base'));
      assert.equal(repeat, first, 'repeated full valuation runs must produce identical JSON');
    }
  });

  test('purity: zero DOM, zero fetch, zero Date.now, zero Math.random in recommend.js', async () => {
    const source = await readText(RECOMMEND_ENGINE_PATH);

    assert.doesNotMatch(source, /\bwindow\b/, 'recommend.js must not reference window');
    assert.doesNotMatch(source, /\bdocument\b/, 'recommend.js must not reference document');
    assert.doesNotMatch(source, /\bfetch\s*\(/, 'recommend.js must not call fetch');
    assert.doesNotMatch(source, /\bDate\.now\s*\(/, 'recommend.js must not call Date.now');
    assert.doesNotMatch(source, /\bMath\.random\s*\(/, 'recommend.js must not call Math.random');
    assert.doesNotMatch(source, /\blocalStorage\b/, 'recommend.js must not reference localStorage');
  });

  test('zero bare numeric literals > 999 outside comments in recommend.js', async () => {
    const source = await readText(RECOMMEND_ENGINE_PATH);
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    const matches = codeOnly.match(/\b\d{4,}\b/g) || [];
    assert.deepEqual(
      matches,
      [],
      `recommend.js must have zero bare numeric literals > 999 outside comments; found: ${matches.join(', ')}`,
    );
  });

  test('corpus invariant: zero new rows in data layer (706 records)', async () => {
    const historical = await getHistorical();
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];

    assert.equal(allRows.length, P3_CORPUS_RECORD_COUNT, 'Corpus must remain exactly 706 cited records');
  });
});
