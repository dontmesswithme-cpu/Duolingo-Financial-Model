/**
 * P2.3 Artifact Contract tests  -  Debt Schedule (Debt-Free Proof) + SBC Schedule.
 *
 * Covers:
 *  - Complete Schedules scaffold: schedules.build(historical, assumptions) populated
 *    with all five families (workingCapital, ppe, intangibleAmortization, debt, sbc),
 *    with zero remaining null placeholders.
 *  - Debt Schedule: buildDebt(historical):
 *    - hasDebt: false, proven via enumerated scan over all cited balance sheet dates (FY2021-Q2 FY2026).
 *    - Strict regression tripwire asserting no corpus metric in balance.json matches
 *      borrowing / debt / notes payable / credit facility / term loan patterns.
 *    - Operating-lease transparency lines listed as-filed (ROU assets, long-term lease liabilities)
 *      with explicit disclosure that US GAAP ASC 842 operating leases are not funded borrowings.
 *    - SCHEDULE_FIXTURES tie-outs for FY2025 lease balances.
 *  - SBC Schedule: buildSbc(historical):
 *    - Annual SBC expenses match cf_stock_based_compensation exactly (FY2021-FY2025).
 *    - TTM SBC expense derived dynamically via ttm.compute discrete-quarter differencing (144,684).
 *    - SBC % of revenue computed across all historical periods + TTM.
 *    - Dilution-context reference lines carried honestly from cash flow financing rows.
 *    - Anti-retyping gate on corpus row mutation.
 *    - SCHEDULE_FIXTURES tie-outs for FY2025 SBC and % of revenue.
 *  - Pure projection function: projectSbc(schedule, drivers, periodInputs):
 *    - Applies sbc_target_pct_of_revenue deterministically.
 *    - Fail-closed driver enforcement with EngineError('missing_driver').
 *  - Engine purity & regression gate (zero bare numeric literals > 999).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { EngineError } from '../src/data/errors.js';
import { readLedgerUrls } from './_ledger.js';
import { SCHEDULE_FIXTURES } from './fixtures/duolingo_facts.js';
import schedules, {
  build,
  buildDebt,
  buildSbc,
  projectSbc,
  BALANCE_PERIODS,
  DEBT_METRIC_KEYS,
  SBC_METRIC_KEYS,
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

describe('P2.3  -  Complete Schedules Engine: schedules.build()', () => {
  test('schedules.build returns complete 5-family ScheduleSet with zero null placeholders', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const scheduleSet = build(historical, assumptions);
    assert.ok(scheduleSet);
    assert.ok(scheduleSet.workingCapital, 'workingCapital family must be populated');
    assert.ok(scheduleSet.ppe, 'ppe family must be populated');
    assert.ok(scheduleSet.intangibleAmortization, 'intangibleAmortization family must be populated');
    assert.ok(scheduleSet.debt, 'debt family must be populated (non-null)');
    assert.ok(scheduleSet.sbc, 'sbc family must be populated (non-null)');
    assert.ok(Object.isFrozen(scheduleSet));
  });
});

describe('P2.3  -  Debt Schedule: buildDebt()', () => {
  test('hasDebt is false and status is debt_free_verified across all 6 balance sheet dates', async () => {
    const historical = await getHistorical();
    const debt = buildDebt(historical);

    assert.equal(debt.hasDebt, false);
    assert.equal(debt.status, 'debt_free_verified');
    assert.deepEqual(debt.periods, BALANCE_PERIODS);
    assert.ok(debt.statementBasis.includes('zero funded debt'));
  });

  test('debt-free proof regression gate: zero corpus balance metrics match borrowing/debt patterns', async () => {
    const historical = await getHistorical();
    const balanceRows = extractRows(historical.balance);
    const debtPattern = /borrow|debt|note|loan|credit|facility/i;

    const matchingRows = balanceRows.filter(
      (r) => debtPattern.test(r.metric) || debtPattern.test(r.label || ''),
    );

    assert.deepEqual(
      matchingRows,
      [],
      `Duolingo corpus must contain zero funded debt lines; found unexpected matches: ${matchingRows.map((r) => r.metric).join(', ')}`,
    );
  });

  test('operating lease transparency lines are listed as-filed for visibility', async () => {
    const historical = await getHistorical();
    const debt = buildDebt(historical);

    const expectedLeases = {
      FY2021: { rou: 28369, liab: 29124 },
      FY2022: { rou: 22508, liab: 23503 },
      FY2023: { rou: 19103, liab: 21094 },
      FY2024: { rou: 47495, liab: 54656 },
      FY2025: { rou: 80380, liab: 93779 },
      'Q2 FY2026': { rou: 74830, liab: 86136 },
    };

    for (const [period, expected] of Object.entries(expectedLeases)) {
      const item = debt.byPeriod[period];
      assert.ok(item, `Debt schedule for ${period} must exist`);
      assert.equal(item.operating_leases.right_of_use_assets.value, expected.rou, `${period} ROU mismatch`);
      assert.equal(item.operating_leases.long_term_lease_liability.value, expected.liab, `${period} Lease liability mismatch`);
      assert.ok(item.operating_leases.notes.includes('US GAAP ASC 842'));
    }
  });

  test('FY2025 operating lease anchors tie out to SCHEDULE_FIXTURES', async () => {
    const historical = await getHistorical();
    const debt = buildDebt(historical);
    const fy25 = debt.byPeriod['FY2025'];

    assert.equal(fy25.operating_leases.right_of_use_assets.value, SCHEDULE_FIXTURES.fy2025_lease_rou_asset.value);
    assert.equal(fy25.operating_leases.long_term_lease_liability.value, SCHEDULE_FIXTURES.fy2025_lease_liability.value);
  });
});

describe('P2.3  -  Stock-Based Compensation Schedule: buildSbc()', () => {
  test('annual SBC expenses match cf_stock_based_compensation exactly for FY2021-FY2025', async () => {
    const historical = await getHistorical();
    const sbc = buildSbc(historical);
    const cfRows = extractRows(historical.cashflow);

    const expectedSbc = {
      FY2021: 40804,
      FY2022: 73820,
      FY2023: 95221,
      FY2024: 110477,
      FY2025: 137437,
    };

    for (const [period, expected] of Object.entries(expectedSbc)) {
      const item = sbc.byPeriod[period];
      const cfRow = cfRows.find((r) => r.metric === 'cf_stock_based_compensation' && r.period === period);
      assert.ok(cfRow);
      assert.equal(cfRow.value, expected);
      assert.equal(item.sbc_expense.value, expected);
      assert.equal(item.isComputed, true);
    }
  });

  test('TTM SBC expense is derived dynamically via discrete-quarter differencing (144,684)', async () => {
    const historical = await getHistorical();
    const sbc = buildSbc(historical);

    const ttmItem = sbc.byPeriod['TTM'];
    assert.ok(ttmItem);
    assert.equal(ttmItem.sbc_expense.value, 144684);
    assert.equal(ttmItem.revenue.value, 1145002);
    assert.ok(Math.abs(ttmItem.sbc_pct_of_revenue.value - (144684 / 1145002)) < 1e-6);
  });

  test('FY2025 SBC and % of revenue tie out exactly to SCHEDULE_FIXTURES', async () => {
    const historical = await getHistorical();
    const sbc = buildSbc(historical);
    const fy25 = sbc.byPeriod['FY2025'];

    assert.equal(fy25.sbc_expense.value, SCHEDULE_FIXTURES.fy2025_sbc_expense.value);
    assert.ok(Math.abs(fy25.sbc_pct_of_revenue.value - SCHEDULE_FIXTURES.fy2025_sbc_pct_revenue.value) < 1e-6);
  });

  test('dilution-context reference lines are carried honestly from cash flow financing rows', async () => {
    const historical = await getHistorical();
    const sbc = buildSbc(historical);

    const fy25 = sbc.byPeriod['FY2025'];
    assert.equal(fy25.dilution_reference.proceeds_from_stock_options_exercise.value, 12570);
    assert.equal(fy25.dilution_reference.taxes_paid_net_share_settlement.value, -41617);
    assert.equal(fy25.dilution_reference.repurchase_of_common_stock.value, 0);

    const fy21 = sbc.byPeriod['FY2021'];
    assert.equal(fy21.dilution_reference.repurchase_of_common_stock.value, -868);
  });

  test('anti-retyping gate: mutating corpus SBC row changes schedule output by construction', async () => {
    const historical = await getHistorical();
    const original = buildSbc(historical);
    const origSbc = original.byPeriod['FY2025'].sbc_expense.value;

    const cfRows = extractRows(historical.cashflow);
    const row = cfRows.find(
      (r) => r.metric === 'cf_stock_based_compensation' && r.period === 'FY2025',
    );
    assert.ok(row);
    const mutatedValue = row.value + 10000;
    row.value = mutatedValue;

    const mutatedSchedule = buildSbc(historical);
    const newSbc = mutatedSchedule.byPeriod['FY2025'].sbc_expense.value;

    assert.equal(
      newSbc,
      origSbc + 10000,
      'modifying corpus row must reflect dynamically in schedule output without hardcoding',
    );

    // restore
    row.value = origSbc;
  });
});

describe('P2.3  -  SBC Projections: projectSbc()', () => {
  test('projectSbc applies sbc_target_pct_of_revenue deterministically over forecast revenues', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const sbc = buildSbc(historical);

    const forecastInputs = [
      { period: 'FY2026', revenue: 1_250_000 },
      { period: 'FY2027', revenue: 1_500_000 },
    ];

    const proj = projectSbc(sbc, assumptions, forecastInputs);
    assert.ok(proj);
    assert.deepEqual(proj.periods, ['FY2026', 'FY2027']);

    const sbcPct = assumptions.getValue('sbc_target_pct_of_revenue');
    assert.equal(sbcPct, 0.1325);

    const fy26 = proj.byPeriod['FY2026'];
    assert.equal(fy26.sbc_expense.value, 1_250_000 * 0.1325);
    assert.equal(fy26.sbc_pct_of_revenue.value, 0.1325);

    const fy27 = proj.byPeriod['FY2027'];
    assert.equal(fy27.sbc_expense.value, 1_500_000 * 0.1325);
    assert.equal(fy27.sbc_pct_of_revenue.value, 0.1325);
  });

  test('projectSbc fails closed with EngineError when required driver is missing', async () => {
    const historical = await getHistorical();
    const sbc = buildSbc(historical);

    assert.throws(
      () => projectSbc(sbc, {}, [{ period: 'FY2026', revenue: 1_000_000 }]),
      (err) => {
        assert.ok(err instanceof EngineError);
        assert.equal(err.code, 'missing_driver');
        return true;
      },
    );
  });
});

describe('P2.3  -  Engine purity & anti-literal regression gate: src/engine/schedules.js', () => {
  test('src/engine/schedules.js contains zero forbidden side-effecting APIs', () => {
    const code = fs.readFileSync(fileURLToPath(new URL('../src/engine/schedules.js', import.meta.url)), 'utf8');

    assert.doesNotMatch(code, /\bwindow\b/);
    assert.doesNotMatch(code, /\bdocument\b/);
    assert.doesNotMatch(code, /\bfetch\s*\(/);
    assert.doesNotMatch(code, /\bDate\.now\s*\(/);
    assert.doesNotMatch(code, /\bMath\.random\s*\(/);
    assert.doesNotMatch(code, /\bsetTimeout\s*\(/);
    assert.doesNotMatch(code, /\bsetInterval\s*\(/);
  });

  test('src/engine/schedules.js contains zero bare numeric literals > 999 outside comments', () => {
    const code = fs.readFileSync(fileURLToPath(new URL('../src/engine/schedules.js', import.meta.url)), 'utf8');
    const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const largeNumbers = [...stripped.matchAll(/\b\d{4,}\b/g)].map((m) => m[0]);
    assert.deepEqual(
      largeNumbers,
      [],
      `schedules.js must contain zero bare numeric literals > 999 outside comments, found: ${largeNumbers.join(', ')}`,
    );
  });
});
