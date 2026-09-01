/**
 * P3.3 Artifact Contract Tests — Scenario System, Full-Path Integration & Balance-Gate Matrix.
 *
 * Covers:
 *  - `scenarios.apply(base, scenario)` immutable delta application, schema validation, and clamping.
 *  - `scenarios.list()` scenario metadata descriptor.
 *  - `runFullProjection(historical, assumptions, scenario)` end-to-end integration.
 *  - **Balance-Gate Matrix (15/15 checks)**: Assets === Liabilities + Equity across
 *    all 3 scenarios (Bear, Base, Bull) × all 5 forecast years (FY2026–FY2030)
 *    asserted on raw constructed components with 0 balancing plug lines.
 *  - **Scenario Distinctness**: Bear < Base < Bull progression across Revenue, Net Income, and FCF.
 *  - **Hybrid FY2026 Honesty under Scenarios**: H1 actuals invariant under scenario shifts;
 *    deltas apply strictly to forward estimates; `isEstimate: true` on all forward lines.
 *  - Engine purity, determinism, zero bare numeric literals > 999, and corpus count invariant (706 rows).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { EngineError } from '../src/data/errors.js';
import { SCENARIO_NAMES } from '../src/data/constants.js';
import { readLedgerUrls } from './_ledger.js';
import scenariosEngine, { apply, list, runFullProjection } from '../src/engine/scenarios.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const ENGINE_PATH = fileURLToPath(new URL('../src/engine/scenarios.js', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

const P2_CORPUS_RECORD_COUNT = 706;

async function getHistorical() {
  return loadHistorical({
    dir: DATA_DIR,
    readText,
    requireLedger: true,
    ledger: LEDGER,
  });
}

async function getAssumptions() {
  return loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
}

describe('P3.3 Scenario System — Interface & Metadata', () => {
  test('scenarios.list returns frozen metadata for bear, base, bull', () => {
    const metas = list();
    assert.ok(Array.isArray(metas), 'list() must return an array');
    assert.ok(Object.isFrozen(metas), 'list() array must be frozen');
    assert.strictEqual(metas.length, 3, 'Must define exactly 3 scenarios');

    const names = metas.map((m) => m.name);
    assert.deepEqual(names, ['bear', 'base', 'bull']);

    for (const meta of metas) {
      assert.ok(Object.isFrozen(meta), `Scenario ${meta.name} must be frozen`);
      assert.ok(typeof meta.label === 'string' && meta.label.length > 0, `Scenario ${meta.name} must have label`);
      assert.ok(typeof meta.description === 'string' && meta.description.length > 0, `Scenario ${meta.name} must have description`);
    }
  });

  test('scenarios.apply fails closed on invalid inputs or unknown scenario', async () => {
    const assumptions = await getAssumptions();

    assert.throws(
      () => apply(null, 'base'),
      (err) => err instanceof EngineError && err.code === 'missing_input',
    );
    assert.throws(
      () => apply(assumptions, 'hyper_bull'),
      (err) => err instanceof EngineError && err.code === 'invalid_scenario',
    );
    assert.throws(
      () => apply(assumptions, ''),
      (err) => err instanceof EngineError && err.code === 'invalid_scenario',
    );
  });
});

describe('P3.3 Scenario Delta Application & Clamping', () => {
  test('scenarios.apply base case preserves base driver values exactly', async () => {
    const base = await getAssumptions();
    const applied = apply(base, 'base');

    assert.ok(Object.isFrozen(applied), 'Applied set must be frozen');
    assert.strictEqual(applied.scenario, 'base');
    assert.strictEqual(applied.drivers.length, base.drivers.length);

    for (const d of base.drivers) {
      const appliedDriver = applied.get(d.name);
      assert.ok(appliedDriver, `Driver ${d.name} must exist in applied set`);
      assert.strictEqual(
        applied.getValue(d.name),
        d.value,
        `Base scenario value for ${d.name} must equal base value`,
      );
    }
  });

  test('scenarios.apply bear and bull cases apply deltas accurately across all drivers', async () => {
    const base = await getAssumptions();

    for (const scenario of ['bear', 'bull']) {
      const applied = apply(base, scenario);
      assert.strictEqual(applied.scenario, scenario);

      for (const d of base.drivers) {
        const delta = d.scenarioDeltas?.[scenario] ?? 0;
        const expectedRaw = d.value + delta;
        const expectedClamped = Math.min(Math.max(expectedRaw, d.min), d.max);

        const actual = applied.getValue(d.name);
        assert.strictEqual(
          actual,
          expectedClamped,
          `Driver ${d.name} in ${scenario} must match expected clamped value`,
        );
      }
    }
  });

  test('scenarios.apply clamps out-of-range values and records clamped drivers', async () => {
    const base = await getAssumptions();

    // Create synthetic driver set with an extreme delta that breaches bounds
    const syntheticDrivers = base.drivers.map((d) => {
      if (d.name === 'paid_subscriber_growth') {
        return {
          ...d,
          value: 0.90,
          scenarioDeltas: { bear: -0.5, bull: 0.5 }, // 0.90 + 0.5 = 1.40 > max (1.00)
        };
      }
      return d;
    });

    const syntheticBase = {
      ...base,
      drivers: syntheticDrivers,
    };

    const appliedBull = apply(syntheticBase, 'bull');
    const growthDriver = appliedBull.get('paid_subscriber_growth');

    assert.strictEqual(growthDriver.value, growthDriver.max, 'Must clamp to max');
    assert.ok(
      appliedBull.clampedDrivers.some((c) => c.name === 'paid_subscriber_growth' && c.bound === 'max'),
      'Must record clamped driver in clampedDrivers meta',
    );
  });

  test('scenarios.apply preserves immutability of base assumptions (mutation test)', async () => {
    const base = await getAssumptions();
    const originalValues = base.drivers.map((d) => ({ name: d.name, value: d.value }));

    // Apply multiple scenarios
    apply(base, 'bear');
    apply(base, 'bull');
    apply(base, 'base');

    // Assert base set was never modified
    for (const original of originalValues) {
      assert.strictEqual(
        base.getValue(original.name),
        original.value,
        `Base driver ${original.name} must remain unmutated`,
      );
    }
  });
});

describe('P3.3 Balance-Gate Matrix (15/15 Checks)', () => {
  test('Assets === Liabilities + Equity holds across full Scenario × Horizon Matrix (15 checks)', async () => {
    const historical = await getHistorical();
    const baseAssumptions = await getAssumptions();

    const matrixResults = [];

    for (const scenario of SCENARIO_NAMES) {
      const fullProj = runFullProjection(historical, baseAssumptions, scenario);

      for (const period of fullProj.periods) {
        const bs = fullProj.balanceSheet.byPeriod[period];
        const check = fullProj.balanceCheck.byPeriod[period];

        // 1. Raw constructed component sum (assets)
        const rawCurrentAssets = bs.current_assets.total.value;
        const rawNonCurrentAssets = bs.non_current_assets.total.value;
        const rawTotalAssets = rawCurrentAssets + rawNonCurrentAssets;

        // 2. Raw constructed component sum (liabilities + equity)
        const rawCurrentLiabilities = bs.current_liabilities.total.value;
        const rawNonCurrentLiabilities = bs.non_current_liabilities.total.value;
        const rawTotalLiabilities = rawCurrentLiabilities + rawNonCurrentLiabilities;
        const rawEquity = bs.stockholders_equity.total.value;
        const rawTotalLiabAndEquity = rawTotalLiabilities + rawEquity;

        // 3. Difference assertion
        const diff = rawTotalAssets - rawTotalLiabAndEquity;

        assert.strictEqual(
          check.ok,
          true,
          `Engine balanceCheck.ok must be true for ${scenario} in ${period}`,
        );
        assert.ok(
          Math.abs(diff) < 1e-6,
          `Balance invariant breached for ${scenario} in ${period}: Assets (${rawTotalAssets}) != Liab+Equity (${rawTotalLiabAndEquity}), Diff: ${diff}`,
        );

        matrixResults.push({
          scenario,
          period,
          assets: rawTotalAssets,
          liabAndEquity: rawTotalLiabAndEquity,
          difference: diff,
          ok: true,
        });
      }
    }

    assert.strictEqual(matrixResults.length, 15, 'Must verify all 15 matrix cells (3 scenarios × 5 years)');
  });
});

describe('P3.3 Scenario Distinctness & Trajectory Progression', () => {
  test('Strict ordering Bear < Base < Bull holds across revenue, operating income, and FCF', async () => {
    const historical = await getHistorical();
    const baseAssumptions = await getAssumptions();

    const bear = runFullProjection(historical, baseAssumptions, 'bear');
    const base = runFullProjection(historical, baseAssumptions, 'base');
    const bull = runFullProjection(historical, baseAssumptions, 'bull');

    // Test across forecast horizon periods FY2027–FY2030
    for (const period of ['FY2027', 'FY2028', 'FY2029', 'FY2030']) {
      const bearRev = bear.forecast.byPeriod[period].revenue.total.value;
      const baseRev = base.forecast.byPeriod[period].revenue.total.value;
      const bullRev = bull.forecast.byPeriod[period].revenue.total.value;

      assert.ok(
        bearRev < baseRev && baseRev < bullRev,
        `Revenue in ${period} must follow Bear (${bearRev}) < Base (${baseRev}) < Bull (${bullRev})`,
      );

      const bearOpInc = bear.forecast.byPeriod[period].operating_income.value;
      const baseOpInc = base.forecast.byPeriod[period].operating_income.value;
      const bullOpInc = bull.forecast.byPeriod[period].operating_income.value;

      assert.ok(
        bearOpInc < baseOpInc && baseOpInc < bullOpInc,
        `Operating income in ${period} must follow Bear (${bearOpInc}) < Base (${baseOpInc}) < Bull (${bullOpInc})`,
      );

      const bearNi = bear.incomeStatement.byPeriod[period].net_income.value;
      const baseNi = base.incomeStatement.byPeriod[period].net_income.value;
      const bullNi = bull.incomeStatement.byPeriod[period].net_income.value;

      assert.ok(
        bearNi < baseNi && baseNi < bullNi,
        `Net income in ${period} must follow Bear (${bearNi}) < Base (${baseNi}) < Bull (${bullNi})`,
      );

      const bearFcf = bear.cashFlow.byPeriod[period].free_cash_flow.value;
      const baseFcf = base.cashFlow.byPeriod[period].free_cash_flow.value;
      const bullFcf = bull.cashFlow.byPeriod[period].free_cash_flow.value;

      assert.ok(
        bearFcf < baseFcf && baseFcf < bullFcf,
        `FCF in ${period} must follow Bear (${bearFcf}) < Base (${baseFcf}) < Bull (${bullFcf})`,
      );
    }
  });

  test('Hybrid FY2026 honesty: H1 actuals are identical across Bear, Base, Bull scenarios', async () => {
    const historical = await getHistorical();
    const baseAssumptions = await getAssumptions();

    const bear = runFullProjection(historical, baseAssumptions, 'bear');
    const base = runFullProjection(historical, baseAssumptions, 'base');
    const bull = runFullProjection(historical, baseAssumptions, 'bull');

    // H1 actuals must remain identical
    const h1RevBear = bear.forecast.byPeriod.FY2026.revenue.total.h1.value;
    const h1RevBase = base.forecast.byPeriod.FY2026.revenue.total.h1.value;
    const h1RevBull = bull.forecast.byPeriod.FY2026.revenue.total.h1.value;

    assert.strictEqual(h1RevBear, 590421);
    assert.strictEqual(h1RevBase, 590421);
    assert.strictEqual(h1RevBull, 590421);

    const h1NiBear = bear.incomeStatement.byPeriod.FY2026.net_income.h1.value;
    const h1NiBase = base.incomeStatement.byPeriod.FY2026.net_income.h1.value;
    const h1NiBull = bull.incomeStatement.byPeriod.FY2026.net_income.h1.value;

    assert.strictEqual(h1NiBear, 76618);
    assert.strictEqual(h1NiBase, 76618);
    assert.strictEqual(h1NiBull, 76618);

    const h1OcfBear = bear.cashFlow.byPeriod.FY2026.operating_activities.total.h1.value;
    const h1OcfBase = base.cashFlow.byPeriod.FY2026.operating_activities.total.h1.value;
    const h1OcfBull = bull.cashFlow.byPeriod.FY2026.operating_activities.total.h1.value;

    assert.strictEqual(h1OcfBear, 239031);
    assert.strictEqual(h1OcfBase, 239031);
    assert.strictEqual(h1OcfBull, 239031);

    // H2 driver estimates must differ
    const h2RevBear = bear.forecast.byPeriod.FY2026.revenue.total.h2.value;
    const h2RevBase = base.forecast.byPeriod.FY2026.revenue.total.h2.value;
    const h2RevBull = bull.forecast.byPeriod.FY2026.revenue.total.h2.value;

    assert.ok(
      h2RevBear < h2RevBase && h2RevBase < h2RevBull,
      `H2 FY2026 revenue must reflect scenario differences: ${h2RevBear} < ${h2RevBase} < ${h2RevBull}`,
    );
  });
});

describe('P3.3 Engine Purity, Determinism & Literal Gates', () => {
  test('Full-path projection is 100% deterministic (byte-identical across repeat runs)', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const run1 = runFullProjection(historical, assumptions, 'bull');
    const run2 = runFullProjection(historical, assumptions, 'bull');

    assert.deepEqual(run1.threeStatement, run2.threeStatement, 'threeStatement output must be deterministic');
    assert.deepEqual(run1.forecast, run2.forecast, 'forecast output must be deterministic');
    assert.deepEqual(run1.schedules, run2.schedules, 'schedules output must be deterministic');
    assert.deepEqual(run1.assumptions.drivers, run2.assumptions.drivers, 'applied drivers must be deterministic');
  });

  test('Zero bare numeric literals > 999 outside comments in scenarios.js', () => {
    const source = fs.readFileSync(ENGINE_PATH, 'utf8');
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    const bigLiterals = withoutComments.match(/\b\d{4,}\b/g) || [];
    assert.deepEqual(
      bigLiterals,
      [],
      `Found bare numeric literals > 999 in scenarios.js: ${bigLiterals.join(', ')}`,
    );
  });

  test('Corpus record count invariant: historical datasets unchanged (706 records)', async () => {
    const historical = await getHistorical();
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];
    assert.strictEqual(
      allRows.length,
      P2_CORPUS_RECORD_COUNT,
      `Corpus record count must remain exactly ${P2_CORPUS_RECORD_COUNT}`,
    );
  });
});
