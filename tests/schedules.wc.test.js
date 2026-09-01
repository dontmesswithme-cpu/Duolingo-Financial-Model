/**
 * P2.1 Artifact Contract tests — Assumptions Infrastructure + Working Capital Schedule.
 *
 * Covers:
 *  - Assumptions layer: loadAssumptions(), driver schema validation, fail-closed ConfigError
 *    listing all offenders, deep immutability, honest defaults notes.
 *  - Schedules scaffold: schedules.build(historical, assumptions) with frozen signature
 *    and scaffolding null placeholders for other schedule families.
 *  - Working capital schedule: buildWorkingCapital() covering all 6 balance dates,
 *    corpus tie-out by construction (anti-retyping gate), independent ratio math,
 *    SCHEDULE_FIXTURES tie-outs, exclusion of cash & investments.
 *  - Working capital projections: projectWorkingCapital() pure projection functions,
 *    engine purity (zero DOM, fetch, Date.now, Math.random), deterministic outputs.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { SCHEMAS, validateRecord, extractRows } from '../src/data/schema.js';
import { ConfigError, EngineError } from '../src/data/errors.js';
import { readLedgerUrls } from './_ledger.js';
import { SCHEDULE_FIXTURES } from './fixtures/duolingo_facts.js';
import schedules, {
  build,
  buildWorkingCapital,
  projectWorkingCapital,
  BALANCE_PERIODS,
  WORKING_CAPITAL_METRIC_KEYS,
} from '../src/engine/schedules.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
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

async function getAssumptions() {
  return loadAssumptions({
    location: ASSUMPTIONS_PATH,
    readText,
  });
}

describe('P2.1 — Assumptions Infrastructure: schema & validation', () => {
  test('SCHEMAS.assumptionDriver validates valid working capital driver', async () => {
    const validDriver = {
      name: 'test_dso_days',
      label: 'Test DSO',
      group: 'workingCapital',
      value: 50.0,
      min: 10.0,
      max: 100.0,
      step: 0.1,
      units: 'days',
      scenarioDeltas: { bear: 5.0, bull: -5.0 },
      notes: 'Test derivation note',
    };

    const res = validateRecord(validDriver, SCHEMAS.assumptionDriver);
    assert.equal(res.ok, true);
    assert.deepEqual(res.errors, []);
  });

  test('SCHEMAS.assumptionDriver fails closed on out-of-range value (value < min)', () => {
    const bad = {
      name: 'test_driver',
      label: 'Test',
      group: 'workingCapital',
      value: 5.0,
      min: 10.0,
      max: 100.0,
      step: 1.0,
      units: 'days',
      scenarioDeltas: { bear: 1.0, bull: -1.0 },
      notes: 'Note',
    };
    const res = validateRecord(bad, SCHEMAS.assumptionDriver);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.field === 'value' && e.message.includes('>= min')));
  });

  test('SCHEMAS.assumptionDriver fails closed on out-of-range value (value > max)', () => {
    const bad = {
      name: 'test_driver',
      label: 'Test',
      group: 'workingCapital',
      value: 150.0,
      min: 10.0,
      max: 100.0,
      step: 1.0,
      units: 'days',
      scenarioDeltas: { bear: 1.0, bull: -1.0 },
      notes: 'Note',
    };
    const res = validateRecord(bad, SCHEMAS.assumptionDriver);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.field === 'value' && e.message.includes('<= max')));
  });

  test('SCHEMAS.assumptionDriver fails closed on min > max', () => {
    const bad = {
      name: 'test_driver',
      label: 'Test',
      group: 'workingCapital',
      value: 50.0,
      min: 100.0,
      max: 10.0,
      step: 1.0,
      units: 'days',
      scenarioDeltas: { bear: 1.0, bull: -1.0 },
      notes: 'Note',
    };
    const res = validateRecord(bad, SCHEMAS.assumptionDriver);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.field === 'min' && e.message.includes('greater than max')));
  });

  test('SCHEMAS.assumptionDriver fails closed on missing scenarioDeltas', () => {
    const bad = {
      name: 'test_driver',
      label: 'Test',
      group: 'workingCapital',
      value: 50.0,
      min: 10.0,
      max: 100.0,
      step: 1.0,
      units: 'days',
      notes: 'Note',
    };
    const res = validateRecord(bad, SCHEMAS.assumptionDriver);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.field === 'scenarioDeltas'));
  });

  test('SCHEMAS.assumptionDriver fails closed on non-positive step', () => {
    const bad = {
      name: 'test_driver',
      label: 'Test',
      group: 'workingCapital',
      value: 50.0,
      min: 10.0,
      max: 100.0,
      step: 0,
      units: 'days',
      scenarioDeltas: { bear: 1.0, bull: -1.0 },
      notes: 'Note',
    };
    const res = validateRecord(bad, SCHEMAS.assumptionDriver);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.field === 'step'));
  });
});

describe('P2.1 — Assumptions Infrastructure: loadAssumptions() loader', () => {
  test('loads assumptions.json cleanly and validates all drivers', async () => {
    const assumptions = await getAssumptions();
    assert.ok(assumptions);
    assert.ok(Array.isArray(assumptions.drivers));
    assert.ok(assumptions.drivers.length >= 9, 'must contain at least the working capital drivers');

    for (const driver of assumptions.drivers) {
      assert.ok(
        ['workingCapital', 'capexDna', 'sbc'].includes(driver.group),
        `driver "${driver.name}" group "${driver.group}" must be recognized`,
      );
      assert.ok(typeof driver.name === 'string' && driver.name.length > 0);
      assert.ok(typeof driver.label === 'string' && driver.label.length > 0);
      assert.ok(typeof driver.notes === 'string' && driver.notes.length > 0);
      assert.ok(Number.isFinite(driver.value));
      assert.ok(driver.value >= driver.min && driver.value <= driver.max);
      assert.ok(driver.scenarioDeltas && Number.isFinite(driver.scenarioDeltas.bear) && Number.isFinite(driver.scenarioDeltas.bull));
    }
  });

  test('honest-defaults rule: every default notes field documents corpus figures or EST judgment', async () => {
    const assumptions = await getAssumptions();
    for (const driver of assumptions.drivers) {
      assert.ok(
        driver.notes.includes('FY2025 actual') || driver.notes.includes('EST judgment') || driver.notes.includes('actual:'),
        `driver ${driver.name} must carry honest derivation notes: received "${driver.notes}"`
      );
    }
  });

  test('loadAssumptions returns deep-frozen immutable structure', async () => {
    const assumptions = await getAssumptions();
    assert.ok(Object.isFrozen(assumptions));
    assert.ok(Object.isFrozen(assumptions.drivers));
    assert.ok(Object.isFrozen(assumptions.drivers[0]));
    assert.ok(Object.isFrozen(assumptions.drivers[0].scenarioDeltas));

    assert.throws(() => {
      assumptions.dso_days = 999;
    });
  });

  test('loadAssumptions exposes get() and getValue() helpers', async () => {
    const assumptions = await getAssumptions();
    const dso = assumptions.get('dso_days');
    assert.ok(dso);
    assert.equal(dso.name, 'dso_days');
    assert.equal(assumptions.getValue('dso_days'), dso.value);
  });

  test('loadAssumptions fails closed with ConfigError listing multiple offending drivers', async () => {
    const badAssumptionsJson = JSON.stringify([
      {
        name: 'driver_a',
        label: 'Driver A',
        group: 'workingCapital',
        value: 200, // exceeds max 100
        min: 10,
        max: 100,
        step: 1,
        units: 'days',
        scenarioDeltas: { bear: 1, bull: -1 },
        notes: 'Note A',
      },
      {
        name: 'driver_b',
        label: 'Driver B',
        group: 'workingCapital',
        value: 5, // below min 10
        min: 10,
        max: 100,
        step: -1, // negative step
        units: 'days',
        notes: 'Note B', // missing scenarioDeltas
      },
      {
        name: 'driver_a', // duplicate name
        label: 'Driver A Duplicate',
        group: 'workingCapital',
        value: 50,
        min: 10,
        max: 100,
        step: 1,
        units: 'days',
        scenarioDeltas: { bear: 1, bull: -1 },
        notes: 'Note A dup',
      },
    ]);

    await assert.rejects(
      async () => {
        await loadAssumptions({
          readText: async () => badAssumptionsJson,
          location: 'mock_bad_assumptions.json',
        });
      },
      (err) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.message.includes('driver_a'));
        assert.ok(err.message.includes('driver_b'));
        assert.ok(err.message.includes('duplicate'));
        assert.ok(err.message.includes('<= max'));
        return true;
      }
    );
  });
});

describe('P2 — Schedules Engine: schedules.build() scaffold', () => {
  test('schedules.build returns complete ScheduleSet with all five families populated', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const scheduleSet = build(historical, assumptions);
    assert.ok(scheduleSet);
    assert.ok(scheduleSet.workingCapital, 'workingCapital family must be populated');
    assert.ok(scheduleSet.ppe, 'ppe family must be populated');
    assert.ok(scheduleSet.intangibleAmortization, 'intangibleAmortization family must be populated');
    assert.ok(scheduleSet.debt, 'debt family must be populated');
    assert.ok(scheduleSet.sbc, 'sbc family must be populated');
    assert.ok(Object.isFrozen(scheduleSet));
  });
});


describe('P2.1 — Working Capital Schedule: buildWorkingCapital()', () => {
  test('covers all 6 balance sheet dates in chronological order', async () => {
    const historical = await getHistorical();
    const wc = buildWorkingCapital(historical);

    assert.deepEqual(wc.periods, BALANCE_PERIODS);
    assert.deepEqual(wc.periods, [
      'FY2021',
      'FY2022',
      'FY2023',
      'FY2024',
      'FY2025',
      'Q2 FY2026',
    ]);
  });

  test('excludes cash, cash equivalents, and investments strictly from WC assets', async () => {
    const historical = await getHistorical();
    const wc = buildWorkingCapital(historical);

    for (const period of BALANCE_PERIODS) {
      const pData = wc.byPeriod[period];
      const assets = pData.assets;

      // Assert that cash and investment keys are not in WC asset lines
      assert.equal(assets.cash_and_cash_equivalents, undefined);
      assert.equal(assets.short_term_investments, undefined);
      assert.equal(assets.long_term_investments, undefined);

      // Verify total WC assets is exact sum of the 4 defined operating asset lines
      const ar = assets.accounts_receivable.value;
      const defCost = assets.deferred_cost_of_revenues.value;
      const prepaid = assets.prepaid_expenses_and_other_current_assets.value;
      const taxRec = assets.income_tax_receivable.value;

      assert.equal(assets.total_working_capital_assets.value, ar + defCost + prepaid + taxRec);
    }
  });

  test('total WC liabilities equals sum of operating liability lines', async () => {
    const historical = await getHistorical();
    const wc = buildWorkingCapital(historical);

    for (const period of BALANCE_PERIODS) {
      const pData = wc.byPeriod[period];
      const liab = pData.liabilities;

      const defRev = liab.deferred_revenues.value;
      const ap = liab.accounts_payable.value;
      const accrued = liab.accrued_expenses_and_other_current_liabilities.value;
      const taxPay = liab.income_tax_payable.value;

      assert.equal(liab.total_working_capital_liabilities.value, defRev + ap + accrued + taxPay);
    }
  });

  test('net working capital equals total WC assets minus total WC liabilities', async () => {
    const historical = await getHistorical();
    const wc = buildWorkingCapital(historical);

    for (const period of BALANCE_PERIODS) {
      const pData = wc.byPeriod[period];
      const totalAssets = pData.assets.total_working_capital_assets.value;
      const totalLiab = pData.liabilities.total_working_capital_liabilities.value;
      assert.equal(pData.net_working_capital.value, totalAssets - totalLiab);
    }
  });

  test('FY2025 working capital anchors tie out exactly to SCHEDULE_FIXTURES', async () => {
    const historical = await getHistorical();
    const wc = buildWorkingCapital(historical);
    const fy2025 = wc.byPeriod['FY2025'];

    // DSO tie-out
    assert.equal(fy2025.metrics.dso.value, SCHEDULE_FIXTURES.fy2025_dso.value);
    assert.ok(Math.abs(fy2025.metrics.dso.value - 57.278802107578244) < 1e-6);


    // Deferred Revenues % of revenue tie-out
    assert.equal(
      fy2025.liabilities.deferred_revenues.pctOfRevenue,
      SCHEDULE_FIXTURES.fy2025_deferred_revenue_pct.value
    );
    assert.ok(Math.abs(fy2025.liabilities.deferred_revenues.pctOfRevenue - 0.4782288555488734) < 1e-6);

    // Net Working Capital tie-out
    assert.equal(fy2025.net_working_capital.value, SCHEDULE_FIXTURES.fy2025_nwc.value);
    assert.equal(fy2025.net_working_capital.value, -255_009);
  });

  test('Q2 FY2026 deferred revenues % and day metrics tie out to TTM revenue basis', async () => {
    const historical = await getHistorical();
    const wc = buildWorkingCapital(historical);
    const q2 = wc.byPeriod['Q2 FY2026'];

    // 1. TTM Revenue basis verification
    // TTM revenue = Q3 FY2025 (271,713) + Q4 FY2025 (1,037,589 - 754,721 = 282,868) + Q1 FY2026 (291,967) + Q2 FY2026 (298,454) = 1,145,002
    assert.equal(q2.metrics.revenue.value, 1_145_002);
    // Anti-regression: must strictly not fall back to single-quarter revenue (298,454)
    assert.notEqual(q2.metrics.revenue.value, 298_454);

    // 2. TTM Cost of revenue basis verification
    // TTM cost of revenue = Q3 FY2025 (74,802) + Q4 FY2025 (288,132 - 211,133 = 76,999) + Q1 FY2026 (78,871) + Q2 FY2026 (81,714) = 312,386
    assert.equal(q2.metrics.cost_of_revenue.value, 312_386);

    // 3. Deferred revenues % of TTM revenue tie-out (505,102 / 1,145,002 ≈ 44.11%)
    assert.equal(
      q2.liabilities.deferred_revenues.pctOfRevenue,
      SCHEDULE_FIXTURES.q2_fy2026_deferred_revenue_pct.value
    );
    assert.ok(
      Math.abs(q2.liabilities.deferred_revenues.pctOfRevenue - (505_102 / 1_145_002)) < 1e-6
    );

    // 4. Deferred revenue days on TTM basis
    assert.ok(
      Math.abs(q2.metrics.deferred_revenue_days.value - (505_102 / 1_145_002) * 365) < 1e-6
    );

    // 5. DSO on TTM basis (130,979 / 1,145,002 * 365 ≈ 41.75 days)
    assert.ok(
      Math.abs(q2.metrics.dso.value - (130_979 / 1_145_002) * 365) < 1e-6
    );

    // 6. DPO on TTM basis (16,196 / 312,386 * 365 ≈ 18.92 days)
    assert.ok(
      Math.abs(q2.metrics.dpo.value - (16_196 / 312_386) * 365) < 1e-6
    );
  });


  test('buildWorkingCapital fails closed with EngineError when TTM denominator is unresolvable', async () => {
    const historical = await getHistorical();
    const cloned = JSON.parse(JSON.stringify(historical));
    const incomeRows = cloned.income.rows || cloned.income;

    // Filter out 9M FY2025 YTD rows so Q4 FY2025 and TTM revenue cannot be resolved
    const filteredIncome = incomeRows.filter((r) => r.period !== '9M FY2025');
    if (cloned.income.rows) {
      cloned.income.rows = filteredIncome;
    } else {
      cloned.income = filteredIncome;
    }

    assert.throws(
      () => buildWorkingCapital(cloned),
      (err) => {
        assert.ok(err instanceof EngineError, `Expected EngineError, got ${err.constructor.name}`);
        assert.equal(err.code, 'wc_ttm_denominator_unresolved');
        return true;
      }
    );
  });


  test('anti-retyping gate: mutating corpus row in-memory changes schedule output by construction', async () => {
    const historical = await getHistorical();

    // Deep clone the historical datasets to mutate
    const cloned = JSON.parse(JSON.stringify(historical));
    const balanceRows = cloned.balance.rows || cloned.balance;
    const arRow = balanceRows.find((r) => r.metric === 'accounts_receivable' && r.period === 'FY2025');
    assert.ok(arRow);

    // Mutate AR from 162,827 to 999,999
    arRow.value = 999_999;

    const mutatedWc = buildWorkingCapital(cloned);
    const mutatedFy25 = mutatedWc.byPeriod['FY2025'];

    assert.equal(mutatedFy25.assets.accounts_receivable.value, 999_999);
    assert.equal(mutatedFy25.metrics.dso.value, (999_999 / 1_037_589) * 365);
    assert.notEqual(mutatedFy25.net_working_capital.value, -255_009);
  });

  test('all computed records carry isComputed: true and derivedFrom chains', async () => {
    const historical = await getHistorical();
    const wc = buildWorkingCapital(historical);

    for (const period of BALANCE_PERIODS) {
      const p = wc.byPeriod[period];
      assert.equal(p.isComputed, true);
      assert.equal(p.assets.total_working_capital_assets.isComputed, true);
      assert.equal(p.liabilities.total_working_capital_liabilities.isComputed, true);
      assert.equal(p.net_working_capital.isComputed, true);
      assert.equal(p.metrics.dso.isComputed, true);
      assert.equal(p.metrics.dpo.isComputed, true);
      assert.equal(p.metrics.deferred_revenue_days.isComputed, true);
      assert.ok(Array.isArray(p.derivedFrom) && p.derivedFrom.length > 0);
    }
  });
});

describe('P2.1 — Working Capital Projections: projectWorkingCapital()', () => {
  test('pure projection applies DSO, DPO, and % drivers deterministically', async () => {
    const historical = await getHistorical();
    const baseWc = buildWorkingCapital(historical);
    const assumptions = await getAssumptions();

    const periodInputs = [
      { period: 'FY2026', revenue: 1_200_000, costOfRevenue: 300_000 },
      { period: 'FY2027', revenue: 1_500_000, costOfRevenue: 375_000 },
      { period: 'FY2028', revenue: 1_800_000, costOfRevenue: 450_000 },
    ];

    const proj1 = projectWorkingCapital(baseWc, assumptions, periodInputs);
    const proj2 = projectWorkingCapital(baseWc, assumptions, periodInputs);

    // Deterministic byte-identical output
    assert.deepEqual(proj1, proj2);

    // Verify FY2026 projected math
    const fy26 = proj1.byPeriod['FY2026'];
    assert.ok(fy26);

    const dso = assumptions.getValue('dso_days');
    const expectedAr = (dso / 365) * 1_200_000;
    assert.equal(fy26.assets.accounts_receivable.value, expectedAr);

    const defRevPct = assumptions.getValue('deferred_revenue_pct_revenue');
    const expectedDefRev = defRevPct * 1_200_000;
    assert.equal(fy26.liabilities.deferred_revenues.value, expectedDefRev);

    // Verify change in NWC calculation
    const baseNwc = baseWc.byPeriod['FY2025'].net_working_capital.value;
    assert.equal(fy26.change_in_net_working_capital.value, fy26.net_working_capital.value - baseNwc);

    const fy27 = proj1.byPeriod['FY2027'];
    assert.equal(fy27.change_in_net_working_capital.value, fy27.net_working_capital.value - fy26.net_working_capital.value);

    // All projection records carry isComputed: true and isEstimate: true
    assert.equal(fy26.isEstimate, true);
    assert.equal(fy26.isComputed, true);
    assert.equal(fy26.assets.accounts_receivable.isEstimate, true);
    assert.equal(fy26.liabilities.deferred_revenues.isEstimate, true);
  });

  test('projectWorkingCapital fails closed with EngineError when a required driver is missing', async () => {
    const historical = await getHistorical();
    const baseWc = buildWorkingCapital(historical);
    const periodInputs = [{ period: 'FY2026', revenue: 1_200_000, costOfRevenue: 300_000 }];

    // Empty driver set
    assert.throws(
      () => projectWorkingCapital(baseWc, {}, periodInputs),
      (err) => {
        assert.ok(err instanceof EngineError, `Expected EngineError, got ${err.constructor.name}`);
        assert.equal(err.code, 'missing_driver');
        return true;
      }
    );

    // Partial driver set missing deferred_revenue_pct_revenue
    assert.throws(
      () => projectWorkingCapital(baseWc, { dso_days: 57.28 }, periodInputs),
      (err) => {
        assert.ok(err instanceof EngineError, `Expected EngineError, got ${err.constructor.name}`);
        assert.equal(err.code, 'missing_driver');
        return true;
      }
    );
  });

  test('engine purity: schedules.js contains zero forbidden side-effecting APIs', async () => {
    const raw = await readText(new URL('../src/engine/schedules.js', import.meta.url));
    const code = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    assert.doesNotMatch(code, /\bfetch\s*\(/, 'must not call fetch');
    assert.doesNotMatch(code, /\bDate\s*\.\s*now\b/, 'must not call Date.now');
    assert.doesNotMatch(code, /\bMath\s*\.\s*random\b/, 'must not call Math.random');
    assert.doesNotMatch(code, /\bwindow\s*\./, 'must not access window');
    assert.doesNotMatch(code, /\bdocument\s*\./, 'must not access document');
    assert.doesNotMatch(code, /\blocalStorage\b/, 'must not reference localStorage');
    assert.doesNotMatch(code, /\bsessionStorage\b/, 'must not reference sessionStorage');
  });
});

