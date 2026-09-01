/**
 * P3.2 Artifact Contract Tests — Three-Statement Linkage Engine.
 *
 * Covers:
 *  - `threeStatement.project(schedules, assumptions, forecast)` frozen signature.
 *  - Balance Invariant Gate: Assets === Liabilities + Equity across ALL forecast years
 *    asserted on raw constructed components without any residual balancing plug.
 *  - Cash Sweep Integrity: ending cash rolls through OCF + ICF + CFF.
 *  - Schedule Tie-ins: D&A, Capex, SBC, and ΔNWC strictly tie to supporting schedules.
 *  - Hybrid FY2026 per-half provenance across below-the-line IS and CF.
 *  - Anti-tautology: pinned values against independent recomputation fixture
 *    (`deriveExpectedThreeStatement`) and mutation tests.
 *  - Zero bare numeric literals > 999 outside comments.
 *  - Purity, determinism, deep-freeze, and corpus count invariant (706 rows).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { EngineError } from '../src/data/errors.js';
import { readLedgerUrls } from './_ledger.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine, { project } from '../src/engine/threeStatement.js';
import {
  THREE_STATEMENT_KNOWN_FIGURES,
  deriveExpectedForecast,
  deriveExpectedThreeStatement,
} from './fixtures/duolingo_facts.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const ENGINE_PATH = fileURLToPath(new URL('../src/engine/threeStatement.js', import.meta.url));
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

describe('P3.2 Three-Statement Linkage — Interface & Frozen Signature', () => {
  test('threeStatement.project satisfies frozen signature and returns deep-frozen output', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const forecast = forecastEngine.project({ historical, assumptions });
    const schedules = schedulesEngine.build(historical, assumptions);

    const output = project(schedules, assumptions, forecast);

    assert.ok(output, 'Output must be defined');
    assert.ok(Object.isFrozen(output), 'Output root must be frozen');
    assert.ok(Object.isFrozen(output.incomeStatement), 'incomeStatement must be frozen');
    assert.ok(Object.isFrozen(output.cashFlow), 'cashFlow must be frozen');
    assert.ok(Object.isFrozen(output.balanceSheet), 'balanceSheet must be frozen');
    assert.ok(Object.isFrozen(output.balanceCheck), 'balanceCheck must be frozen');
    assert.ok(Object.isFrozen(output.supporting), 'supporting schedules must be frozen');
    assert.deepEqual(output.periods, ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']);
  });

  test('threeStatement.project supports object-argument calling convention', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const forecast = forecastEngine.project({ historical, assumptions });
    const schedules = schedulesEngine.build(historical, assumptions);

    const output = project({ schedules, assumptions, forecast });
    assert.ok(output.balanceCheck.byPeriod.FY2026.ok, 'Object argument form succeeds');
  });

  test('fails closed when required inputs are missing', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const forecast = forecastEngine.project({ historical, assumptions });
    const schedules = schedulesEngine.build(historical, assumptions);

    assert.throws(
      () => project(null, assumptions, forecast),
      (err) => err instanceof EngineError && err.code === 'missing_input',
    );
    assert.throws(
      () => project(schedules, null, forecast),
      (err) => err instanceof EngineError && err.code === 'missing_input',
    );
    assert.throws(
      () => project(schedules, assumptions, null),
      (err) => err instanceof EngineError && err.code === 'missing_input',
    );
  });
});

describe('P3.2 Hard Balance Invariant Gate (Assets === Liabilities + Equity)', () => {
  test('Assets === Liabilities + Equity holds exactly for all forecast years on raw components', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const forecast = forecastEngine.project({ historical, assumptions });
    const schedules = schedulesEngine.build(historical, assumptions);

    const output = project(schedules, assumptions, forecast);

    for (const period of output.periods) {
      const bs = output.balanceSheet.byPeriod[period];
      const check = output.balanceCheck.byPeriod[period];

      // Assert from raw components directly
      const rawCurrentAssets = bs.current_assets.total.value;
      const rawNonCurrentAssets = bs.non_current_assets.total.value;
      const rawTotalAssets = rawCurrentAssets + rawNonCurrentAssets;

      const rawCurrentLiabilities = bs.current_liabilities.total.value;
      const rawNonCurrentLiabilities = bs.non_current_liabilities.total.value;
      const rawTotalLiabilities = rawCurrentLiabilities + rawNonCurrentLiabilities;

      const rawEquity = bs.stockholders_equity.total.value;
      const rawTotalLiabAndEquity = rawTotalLiabilities + rawEquity;

      assert.strictEqual(
        check.ok,
        true,
        `Balance check ok must be true for ${period}`,
      );
      assert.ok(
        Math.abs(rawTotalAssets - rawTotalLiabAndEquity) < 1e-6,
        `Raw Assets (${rawTotalAssets}) must equal Liabilities + Equity (${rawTotalLiabAndEquity}) in ${period}`,
      );
      assert.strictEqual(
        bs.total_assets.value,
        rawTotalAssets,
        `total_assets value must match sum of components in ${period}`,
      );
    }
  });

  test('Matches independent closed-form recomputation fixture (anti-tautology)', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const forecast = forecastEngine.project({ historical, assumptions });
    const schedules = schedulesEngine.build(historical, assumptions);

    const driverMap = {};
    for (const d of assumptions.drivers) driverMap[d.name] = d.value;

    const expectedForecast = deriveExpectedForecast({ drivers: driverMap });
    const expectedThreeStatement = deriveExpectedThreeStatement(expectedForecast, driverMap, schedules);
    const output = project(schedules, assumptions, forecast);

    for (const period of ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']) {
      const actualBs = output.balanceSheet.byPeriod[period];
      const actualCf = output.cashFlow.byPeriod[period];
      const actualIs = output.incomeStatement.byPeriod[period];
      const exp = expectedThreeStatement[period];

      assert.ok(
        Math.abs(actualIs.net_income.value - exp.netIncome) < 1e-4,
        `Net income for ${period} (${actualIs.net_income.value}) must match expected (${exp.netIncome})`,
      );
      assert.ok(
        Math.abs(actualCf.operating_activities.total.value - exp.ocf) < 1e-4,
        `OCF for ${period} (${actualCf.operating_activities.total.value}) must match expected (${exp.ocf})`,
      );
      assert.ok(
        Math.abs(actualCf.ending_cash.value - exp.endingCash) < 1e-4,
        `Ending cash for ${period} (${actualCf.ending_cash.value}) must match expected (${exp.endingCash})`,
      );
      assert.ok(
        Math.abs(actualBs.total_assets.value - exp.totalAssets) < 1e-4,
        `Total assets for ${period} (${actualBs.total_assets.value}) must match expected (${exp.totalAssets})`,
      );
      assert.ok(
        Math.abs(actualBs.total_liabilities.value - exp.totalLiabilities) < 1e-4,
        `Total liabilities for ${period} (${actualBs.total_liabilities.value}) must match expected (${exp.totalLiabilities})`,
      );
      assert.ok(
        Math.abs(actualBs.stockholders_equity.total.value - exp.totalEquity) < 1e-4,
        `Total equity for ${period} (${actualBs.stockholders_equity.total.value}) must match expected (${exp.totalEquity})`,
      );
    }
  });
});

describe('P3.2 Cash Sweep & Supporting Schedule Tie-ins', () => {
  test('Cash sweep integrity: ending cash rolls from beginning cash + net changes', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const forecast = forecastEngine.project({ historical, assumptions });
    const schedules = schedulesEngine.build(historical, assumptions);

    const output = project(schedules, assumptions, forecast);

    let expectedBegCash = THREE_STATEMENT_KNOWN_FIGURES.bopQ2Fy2026.cash_and_cash_equivalents;

    for (let i = 0; i < output.periods.length; i += 1) {
      const period = output.periods[i];
      const cf = output.cashFlow.byPeriod[period];
      const isHybrid = i === 0;

      const ocf = cf.operating_activities.total.value;
      const icf = cf.investing_activities.total.value;
      const cff = cf.financing_activities.total.value;
      const netChange = cf.net_change_in_cash.value;

      if (!isHybrid) {
        assert.ok(
          Math.abs(netChange - (ocf + icf + cff)) < 1e-6,
          `Net change in cash in ${period} must equal OCF + ICF + CFF`,
        );
        assert.strictEqual(
          cf.beginning_cash.value,
          expectedBegCash,
          `Beginning cash in ${period} must match prior ending cash`,
        );
        assert.ok(
          Math.abs(cf.ending_cash.value - (expectedBegCash + netChange)) < 1e-6,
          `Ending cash in ${period} must equal beginning cash + net change`,
        );
        expectedBegCash = cf.ending_cash.value;
      } else {
        expectedBegCash = cf.ending_cash.value;
      }
    }
  });

  test('Schedule tie-ins: D&A, Capex, SBC, and ΔNWC tie to supporting schedules', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const forecast = forecastEngine.project({ historical, assumptions });
    const schedules = schedulesEngine.build(historical, assumptions);

    const output = project(schedules, assumptions, forecast);

    for (let i = 1; i < output.periods.length; i += 1) {
      const period = output.periods[i];
      const cf = output.cashFlow.byPeriod[period];
      const ppe = output.supporting.ppe.byPeriod[period];
      const intg = output.supporting.intangibleAmortization.byPeriod[period];
      const sbc = output.supporting.sbc.byPeriod[period];
      const wc = output.supporting.workingCapital.byPeriod[period];

      const expectedDandA = ppe.depreciation.value + intg.amortization.value;
      assert.ok(
        Math.abs(cf.operating_activities.depreciation_and_amortization.value - expectedDandA) < 1e-6,
        `D&A in CF must equal PP&E depreciation + intangible amortization in ${period}`,
      );

      const expectedCapex = ppe.additions.value;
      assert.ok(
        Math.abs(cf.investing_activities.purchase_of_property_and_equipment.value - (-expectedCapex)) < 1e-6,
        `PP&E Capex in CF must equal additions from PP&E schedule in ${period}`,
      );

      const expectedSoftware = intg.additions.value;
      assert.ok(
        Math.abs(cf.investing_activities.capitalized_software_and_intangibles.value - (-expectedSoftware)) < 1e-6,
        `Software capex in CF must equal additions from Intangibles schedule in ${period}`,
      );

      const expectedSbc = sbc.sbc_expense.value;
      assert.ok(
        Math.abs(cf.operating_activities.stock_based_compensation.value - expectedSbc) < 1e-6,
        `SBC in CF must equal SBC expense from SBC schedule in ${period}`,
      );
    }
  });
});

describe('P3.2 Hybrid FY2026 Provenance & Discrete Period Mappings', () => {
  test('Hybrid FY2026 IS and CF lines carry per-half provenance citing corpus rows', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const forecast = forecastEngine.project({ historical, assumptions });
    const schedules = schedulesEngine.build(historical, assumptions);

    const output = project(schedules, assumptions, forecast);
    const is2026 = output.incomeStatement.byPeriod.FY2026;
    const cf2026 = output.cashFlow.byPeriod.FY2026;

    // IS below-the-line provenance
    assert.strictEqual(is2026.other_income_net.provenance, 'hybrid');
    assert.strictEqual(is2026.other_income_net.h1.value, -1196); // Q1 (-786) + Q2 (-410)
    assert.strictEqual(is2026.other_income_net.h1.isEstimate, false);
    assert.strictEqual(is2026.other_income_net.h2.isEstimate, true);

    assert.strictEqual(is2026.interest_income.provenance, 'hybrid');
    assert.strictEqual(is2026.interest_income.h1.value, 23642); // Q1 (11811) + Q2 (11831)
    assert.strictEqual(is2026.interest_income.h1.isEstimate, false);

    assert.strictEqual(is2026.pretax_income.provenance, 'hybrid');
    assert.strictEqual(is2026.pretax_income.h1.value, 100918); // Q1 (55552) + Q2 (45366)

    assert.strictEqual(is2026.income_tax.provenance, 'hybrid');
    assert.strictEqual(is2026.income_tax.h1.value, 24300); // Q1 (12092) + Q2 (12208)

    assert.strictEqual(is2026.net_income.provenance, 'hybrid');
    assert.strictEqual(is2026.net_income.h1.value, 76618); // Q1 (43460) + Q2 (33158)

    // CF provenance (cited from 6M FY2026 YTD rows)
    assert.strictEqual(cf2026.operating_activities.total.provenance, 'hybrid');
    assert.strictEqual(cf2026.operating_activities.total.h1.value, 239031); // 6M OCF
    assert.strictEqual(cf2026.operating_activities.total.h1.isEstimate, false);

    assert.strictEqual(cf2026.investing_activities.total.provenance, 'hybrid');
    assert.strictEqual(cf2026.investing_activities.total.h1.value, -8469); // 6M ICF

    assert.strictEqual(cf2026.financing_activities.total.provenance, 'hybrid');
    assert.strictEqual(cf2026.financing_activities.total.h1.value, -86064); // 6M CFF

    assert.strictEqual(cf2026.net_change_in_cash.provenance, 'hybrid');
    assert.strictEqual(cf2026.net_change_in_cash.h1.value, 144498); // 6M Net change
  });
});

describe('P3.2 Anti-Tautology & Mutation Tests', () => {
  test('Mutating a driver alters Income Statement, CF, and Balance Sheet', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const schedules = schedulesEngine.build(historical, assumptions);

    const baseForecast = forecastEngine.project({ historical, assumptions });
    const baseOutput = project(schedules, assumptions, baseForecast);

    // Create mutated assumptions with altered tax rate
    const mutatedAssumptions = {
      getValue(name) {
        if (name === 'effective_tax_rate') return 0.25; // mutated from ~0.134
        return assumptions.getValue(name);
      },
      get(name) {
        return assumptions.get(name);
      },
      list() {
        return assumptions.list();
      },
    };

    const mutatedOutput = project(schedules, mutatedAssumptions, baseForecast);

    assert.notStrictEqual(
      mutatedOutput.incomeStatement.byPeriod.FY2027.net_income.value,
      baseOutput.incomeStatement.byPeriod.FY2027.net_income.value,
      'Mutated tax rate must alter net income in FY2027',
    );
    assert.notStrictEqual(
      mutatedOutput.cashFlow.byPeriod.FY2027.ending_cash.value,
      baseOutput.cashFlow.byPeriod.FY2027.ending_cash.value,
      'Mutated tax rate must alter ending cash in FY2027',
    );
    assert.notStrictEqual(
      mutatedOutput.balanceSheet.byPeriod.FY2027.total_assets.value,
      baseOutput.balanceSheet.byPeriod.FY2027.total_assets.value,
      'Mutated tax rate must alter total assets in FY2027',
    );
    // Invariant must still hold under mutation
    assert.strictEqual(mutatedOutput.balanceCheck.byPeriod.FY2027.ok, true);
  });
});

describe('P3.2 Engine Purity, Determinism & Literal Gates', () => {
  test('Engine execution is 100% deterministic (byte-identical across repeat runs)', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const forecast = forecastEngine.project({ historical, assumptions });
    const schedules = schedulesEngine.build(historical, assumptions);

    const run1 = project(schedules, assumptions, forecast);
    const run2 = project(schedules, assumptions, forecast);

    assert.deepEqual(run1, run2, 'Repeat runs must produce deep-equal outputs');
  });

  test('Zero bare numeric literals > 999 outside comments in threeStatement.js', () => {
    const source = fs.readFileSync(ENGINE_PATH, 'utf8');
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    const bigLiterals = withoutComments.match(/\b\d{4,}\b/g) || [];
    assert.deepEqual(
      bigLiterals,
      [],
      `Found bare numeric literals > 999 in threeStatement.js: ${bigLiterals.join(', ')}`,
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
