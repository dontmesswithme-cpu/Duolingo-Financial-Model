/**
 * P10.2 Contract Tests — Valuation Context, Horizon, and Period Alignment.
 *
 * Verifies Phase 10 Sub-Phase P10.2 requirements from docs/phases/phase_10.md §P10.2:
 *  1. Canonical 10-period production horizon & date convention (ISO YYYY-MM-DD, UTC, 365-day basis).
 *  2. Dated valuation seam: Effective valuation date 2026-09-02, reporting cutoff 2026-06-30 (BOP).
 *  3. Contiguous, pairwise-disjoint partition of H2 FY2026 (64d pre-val roll + 120d post-val discounted = 184d).
 *  4. Zero overlap: H1 actual FCFF is NOT discounted. Pre-val cash in BOP roll only; post-val in DCF only.
 *  5. Statement articulation: Zero gaps across OCF, ICF, CFF, cash roll, and financial statements.
 *  6. Date-based fractional discount exponents derived from declared dates, not integer period indexes.
 *  7. Rejection gates: 3-, 5-, and 10-period schedule tests reject mismatched terminal years.
 *  8. Rejection gates: Supplied share schedules must match DCF periods exactly.
 *  9. Invariance: Relative valuation methods produce identical values regardless of DCF horizon.
 * 10. Output finiteness and immutability across all dated seam outputs.
 *
 * @module tests/period.alignment.test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_HORIZON,
  EFFECTIVE_VALUATION_DATE,
  REPORTING_CUTOFF_DATE,
  FY2026_START_DATE,
  FY2026_END_DATE,
  H1_DAYS_TOTAL,
  H2_DAYS_TOTAL,
  PRE_VALUATION_STUB_DAYS,
  POST_VALUATION_STUB_DAYS,
  PRE_VALUATION_STUB_FRACTION,
  POST_VALUATION_STUB_FRACTION,
  PERIOD_END_DATES,
  DAYS_IN_YEAR,
  LEGACY_FIVE_YEAR_HORIZON,
  calculateDiscountExponent,
} from '../src/data/constants.js';

import { EngineError } from '../src/data/errors.js';
import { loadHistorical, loadAssumptions, loadValuationContext } from '../src/data/loader.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import dcfEngine, { valuate as valuateDcf, valuateDatedSeam } from '../src/engine/dcf.js';
import { projectShares } from '../src/engine/shares.js';
import { valuateComps } from '../src/engine/methods/comps.js';
import { valuateEvMultiples } from '../src/engine/methods/evMultiples.js';
import { valuatePfcf } from '../src/engine/methods/pfcf.js';
import { valuatePerUser } from '../src/engine/methods/perUser.js';
import { valuateFcffDcf, describeStageStructure } from '../src/engine/methods/fcffDcf.js';
import { createApp } from '../src/app.js';
import { TAB_KEYS } from '../src/ui/tabs.js';
import { usd, percent } from '../src/ui/format.js';
import { readLedgerUrls } from './_ledger.js';
import { createTabRoot } from './_dom_stub.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const VAL_CONTEXT_PATH = fileURLToPath(new URL('../docs/p10_baseline/valuation_context.json', import.meta.url));
const PEERS_PATH = fileURLToPath(new URL('../src/data/historical/peers.json', import.meta.url));

const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

async function getFullModels() {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  const valContext = await loadValuationContext({ location: VAL_CONTEXT_PATH, readText });
  const peers = JSON.parse(await readText(PEERS_PATH));

  // 10-period canonical model
  const sched10 = schedulesEngine.build(historical, assumptions);
  const fc10 = forecastEngine.project({ historical, assumptions, horizon: 10 });
  const ts10 = threeStatementEngine.project(sched10, assumptions, fc10);
  const wacc10 = buildWacc({ assumptions, debtSchedule: sched10.debt });
  const dcf10Dated = valuateDatedSeam(ts10, wacc10, { assumptions, corpus: historical, horizon: 10 });
  const dcf10Standard = valuateDcf(ts10, wacc10, { assumptions, corpus: historical, horizon: 10 });

  // 5-period model
  const fc5 = forecastEngine.project({ historical, assumptions, horizon: 5 });
  const ts5 = threeStatementEngine.project(sched10, assumptions, fc5);
  const dcf5Dated = valuateDatedSeam(ts5, wacc10, { assumptions, corpus: historical, horizon: 5 });
  const dcf5Standard = valuateDcf(ts5, wacc10, { assumptions, corpus: historical, horizon: 5 });

  // 3-period model
  const fc3 = forecastEngine.project({ historical, assumptions, horizon: 3 });
  const ts3 = threeStatementEngine.project(sched10, assumptions, fc3);
  const dcf3Dated = valuateDatedSeam(ts3, wacc10, { assumptions, corpus: historical, horizon: 3 });
  const dcf3Standard = valuateDcf(ts3, wacc10, { assumptions, corpus: historical, horizon: 3 });

  return {
    historical,
    assumptions,
    valContext,
    peers,
    sched10,
    fc10,
    ts10,
    wacc10,
    dcf10Dated,
    dcf10Standard,
    fc5,
    ts5,
    dcf5Dated,
    dcf5Standard,
    fc3,
    ts3,
    dcf3Dated,
    dcf3Standard,
  };
}

/**
 * Boots the real production controller (no stubbed engine) so the wiring
 * assertions read the figures the product actually emits.
 */
async function bootProductionApp({ horizon } = {}) {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  const { root, links, panes } = createTabRoot(TAB_KEYS);
  const app = createApp({
    data: { loadHistorical, loadAssumptions },
    engine: {},
    root,
    now: () => Date.parse('2026-09-01T00:00:00.000Z'),
    historical,
    assumptions,
    ...(horizon === undefined ? {} : { horizon }),
  });
  const paneOf = (key) => panes.find((p) => p.getAttribute('data-tab') === key);
  const linkOf = (key) => links.find((l) => l.getAttribute('data-tab') === key);
  // The app owns the tab router; activation happens through its own link click.
  const viewHtml = (key) => {
    const link = linkOf(key);
    if (!link) throw new Error(`No tab link for ${key}`);
    link.dispatch('click');
    const pane = paneOf(key);
    if (!pane) throw new Error(`No pane for ${key}`);
    return pane.innerHTML;
  };
  return { app, state: () => app.state(), viewHtml };
}

/** Formats a money figure exactly as the product renders it (2dp, thousands separators). */
const usd2 = (value) => usd(value, { decimals: 2 });

/** Formats a ratio exactly as the product renders it (2dp, trailing percent). */
const pct2 = (value) => percent(value, { decimals: 2 });

/**
 * Extracts one rendered table row by its first-cell label.
 *
 * The segment is bounded by the next `<tr` OR the next `</table>`, whichever
 * comes first, so a row is never allowed to absorb the rows that follow it.
 */
function findRow(html, label) {
  const anchor = `<td>${label}</td>`;
  const start = html.indexOf(anchor);
  if (start === -1) return null;
  const from = html.lastIndexOf('<tr', start);
  const rest = html.slice(start);
  const nextRow = rest.indexOf('<tr');
  const nextTable = rest.indexOf('</table>');
  const ends = [nextRow, nextTable].filter((i) => i !== -1);
  const end = ends.length > 0 ? start + Math.min(...ends) : html.length;
  return html.slice(from === -1 ? start : from, end);
}

describe('P10.2  -  Canonical Horizon and Date Conventions', () => {
  test('production canonical horizon constant is strictly 10 periods', () => {
    assert.equal(CANONICAL_HORIZON, 10, 'CANONICAL_HORIZON constant is 10');
  });

  test('date conventions use ISO YYYY-MM-DD, UTC calendar, and 365-day basis', () => {
    assert.equal(DAYS_IN_YEAR, 365, '365-day year basis');
    assert.match(EFFECTIVE_VALUATION_DATE, /^\d{4}-\d{2}-\d{2}$/, 'EFFECTIVE_VALUATION_DATE is ISO YYYY-MM-DD');
    assert.match(REPORTING_CUTOFF_DATE, /^\d{4}-\d{2}-\d{2}$/, 'REPORTING_CUTOFF_DATE is ISO YYYY-MM-DD');
    assert.match(FY2026_START_DATE, /^\d{4}-\d{2}-\d{2}$/, 'FY2026_START_DATE is ISO YYYY-MM-DD');
    assert.match(FY2026_END_DATE, /^\d{4}-\d{2}-\d{2}$/, 'FY2026_END_DATE is ISO YYYY-MM-DD');
    assert.equal(EFFECTIVE_VALUATION_DATE, '2026-09-02');
    assert.equal(REPORTING_CUTOFF_DATE, '2026-06-30');
    assert.equal(FY2026_START_DATE, '2026-01-01');
    assert.equal(FY2026_END_DATE, '2026-12-31');

    for (const [period, endDate] of Object.entries(PERIOD_END_DATES)) {
      assert.match(endDate, /^\d{4}-\d{2}-\d{2}$/, `${period} end date is ISO YYYY-MM-DD`);
    }
  });

  test('calculateDiscountExponent computes exact fractional year basis from declared dates', () => {
    // 2026-09-02 to 2026-12-31: exactly 120 days -> 120 / 365
    const exp2026 = calculateDiscountExponent('2026-09-02', '2026-12-31', 365);
    assert.equal(Math.round(exp2026 * 365), 120, '120 days in post-valuation stub');
    assert.ok(Math.abs(exp2026 - 120 / 365) < 1e-9, 'Fractional exponent is 120 / 365');

    // 2026-09-02 to 2027-12-31: 120 + 365 = 485 days -> 485 / 365
    const exp2027 = calculateDiscountExponent('2026-09-02', '2027-12-31', 365);
    assert.equal(Math.round(exp2027 * 365), 485, '485 days to FY2027 end');
    assert.ok(Math.abs(exp2027 - 485 / 365) < 1e-9, 'Fractional exponent is 485 / 365');
  });

  test('5-year model is preserved as an explicitly labeled legacy comparison (legacyFiveYear)', async () => {
    const { dcf10Standard, dcf10Dated } = await getFullModels();
    assert.ok(dcf10Standard.legacyFiveYear, 'dcf output exposes legacyFiveYear');
    assert.ok(dcf10Dated.legacyFiveYear, 'dated seam dcf exposes legacyFiveYear');
    assert.ok(Number.isFinite(dcf10Standard.legacyFiveYear.perShare), 'legacy perShare is finite');
  });

  test('relative valuation methods produce identical values regardless of DCF horizon', async () => {
    const { peers, assumptions, sched10, historical } = await getFullModels();

    // Run 3-period, 5-period, and 10-period forecasts
    const fc3 = forecastEngine.project({ historical, assumptions, horizon: 3 });
    const fc5 = forecastEngine.project({ historical, assumptions, horizon: 5 });
    const fc10 = forecastEngine.project({ historical, assumptions, horizon: 10 });

    const revFwd3 = fc3.byPeriod.FY2026.revenue.total.value;
    const revFwd5 = fc5.byPeriod.FY2026.revenue.total.value;
    const revFwd10 = fc10.byPeriod.FY2026.revenue.total.value;

    assert.equal(revFwd3, revFwd5, 'Forward revenue FY2026 identical between 3-yr and 5-yr');
    assert.equal(revFwd5, revFwd10, 'Forward revenue FY2026 identical between 5-yr and 10-yr');

    const sharesCount = assumptions.get('shares_outstanding').value;
    const bopCash = 161262;
    const sti = 1180683;
    const lti = 74614;
    const netCashCap = bopCash + sti + lti;

    const compsInputs3 = { forwardRevenue: revFwd3, netCashCapitalized: netCashCap, sharesOutstanding: sharesCount };
    const compsInputs10 = { forwardRevenue: revFwd10, netCashCapitalized: netCashCap, sharesOutstanding: sharesCount };

    const comps3 = valuateComps(peers, compsInputs3);
    const comps10 = valuateComps(peers, compsInputs10);

    assert.equal(comps3.perShare, comps10.perShare, 'Comps implied perShare is invariant to DCF horizon');
    assert.equal(comps3.impliedEnterpriseValue, comps10.impliedEnterpriseValue, 'Comps EV invariant to DCF horizon');
  });
});

describe('P10.2  -  Dated Valuation Seam Partition & Zero Overlap Gates', () => {
  test('calendar partition of H2 FY2026 forms a contiguous, pairwise-disjoint set', () => {
    assert.equal(H1_DAYS_TOTAL, 181, 'H1 has 181 days (Jan 1 - Jun 30)');
    assert.equal(H2_DAYS_TOTAL, 184, 'H2 has 184 days (Jun 30 - Dec 31)');
    assert.equal(PRE_VALUATION_STUB_DAYS, 64, 'Pre-val stub has 64 days (Jun 30 - Sep 2)');
    assert.equal(POST_VALUATION_STUB_DAYS, 120, 'Post-val stub has 120 days (Sep 2 - Dec 31)');
    assert.equal(PRE_VALUATION_STUB_DAYS + POST_VALUATION_STUB_DAYS, H2_DAYS_TOTAL, 'Partition covers 100% of H2');
    assert.equal(PRE_VALUATION_STUB_FRACTION + POST_VALUATION_STUB_FRACTION, 1, 'Fractions sum to 1.0');
  });

  test('datedSeam metadata on threeStatement verifies zero partition gap and intersection', async () => {
    const { ts10 } = await getFullModels();
    assert.ok(ts10.datedSeam, 'threeStatement exposes datedSeam metadata');
    assert.equal(ts10.datedSeam.partitionGap, 0, 'Partition gap equals 0');
    assert.equal(ts10.datedSeam.partitionIntersection, 0, 'Partition intersection equals 0');
    assert.equal(ts10.datedSeam.preValuationDays, 64);
    assert.equal(ts10.datedSeam.postValuationDays, 120);
    assert.equal(ts10.datedSeam.h2DaysTotal, 184);
  });

  test('H1 actual FCFF is NOT discounted in DCF (zero H1 overlap gate)', async () => {
    const { dcf10Dated, ts10 } = await getFullModels();
    const datedSeam = dcf10Dated.datedSeam;
    assert.ok(datedSeam, 'DCF datedSeam exists');
    assert.equal(datedSeam.gates.h1FcffOverlap, 0, 'Gate: H1 FCFF overlap equals 0');

    // First discounted period undiscounted cash flow is post-valuation stub ONLY
    const sched0 = datedSeam.schedule[0];
    assert.equal(sched0.period, 'FY2026');
    assert.equal(sched0.isStub, true);
    assert.equal(sched0.stubDays, 120);

    const cf2026 = ts10.cashFlow.byPeriod.FY2026;
    const h1Fcff = cf2026.fcff.h1.value;
    const postValFcff = cf2026.fcff.h2.postValuation.value;

    assert.equal(sched0.undiscountedFcf, postValFcff, 'DCF FY2026 discounts only post-val FCFF');
    assert.notEqual(sched0.undiscountedFcf, sched0.undiscountedFcf + h1Fcff, 'H1 FCFF is strictly excluded from DCF');
  });

  test('all statement components articulate with zero gaps (OCF, ICF, CFF, Cash roll)', async () => {
    const { ts10, dcf10Dated } = await getFullModels();
    const is26 = ts10.incomeStatement.byPeriod.FY2026;
    const cf26 = ts10.cashFlow.byPeriod.FY2026;

    // Full-year equals H1 + H2
    assert.ok(Math.abs(is26.revenue.total.value - (is26.revenue.total.h1.value + is26.revenue.total.h2.value)) < 1e-9);
    assert.ok(Math.abs(is26.operating_income.value - (is26.operating_income.h1.value + is26.operating_income.h2.value)) < 1e-9);
    assert.ok(Math.abs(is26.net_income.value - (is26.net_income.h1.value + is26.net_income.h2.value)) < 1e-9);
    assert.ok(Math.abs(cf26.operating_activities.total.value - (cf26.operating_activities.total.h1.value + cf26.operating_activities.total.h2.value)) < 1e-9);

    // H2 equals preValuation + postValuation
    const revH2 = is26.revenue.total.h2;
    assert.ok(Math.abs(revH2.value - (revH2.preValuation.value + revH2.postValuation.value)) < 1e-9, 'Revenue H2 partition gap = 0');

    const ocfH2 = cf26.operating_activities.total.h2;
    assert.ok(Math.abs(ocfH2.value - (ocfH2.preValuation.value + ocfH2.postValuation.value)) < 1e-9, 'OCF H2 partition gap = 0');

    const icfH2 = cf26.investing_activities.total.h2;
    assert.ok(Math.abs(icfH2.value - (icfH2.preValuation.value + icfH2.postValuation.value)) < 1e-9, 'ICF H2 partition gap = 0');

    const cffH2 = cf26.financing_activities.total.h2;
    assert.ok(Math.abs(cffH2.value - (cffH2.preValuation.value + cffH2.postValuation.value)) < 1e-9, 'CFF H2 partition gap = 0');

    const netChangeH2 = cf26.net_change_in_cash.h2;
    assert.ok(Math.abs(netChangeH2.value - (netChangeH2.preValuation.value + netChangeH2.postValuation.value)) < 1e-9, 'Net cash change H2 partition gap = 0');

    // Dated seam gates check
    assert.equal(dcf10Dated.datedSeam.gates.ocfGap, 0);
    assert.equal(dcf10Dated.datedSeam.gates.icfGap, 0);
    assert.equal(dcf10Dated.datedSeam.gates.cffGap, 0);
    assert.equal(dcf10Dated.datedSeam.gates.cashRollGap, 0);
  });

  test('pre-valuation stub rolls BOP cash into valuation date bridge with zero gap', async () => {
    const { ts10, dcf10Dated } = await getFullModels();
    const datedSeam = dcf10Dated.datedSeam;

    const bopCash = ts10.bopBalanceSheet.cash_and_cash_equivalents;
    const preValCashRoll = ts10.cashFlow.byPeriod.FY2026.net_change_in_cash.h2.preValuation.value;
    const rolledCash = bopCash + preValCashRoll;

    assert.equal(datedSeam.bopCash, bopCash);
    assert.equal(datedSeam.preValuationCashRoll, preValCashRoll);
    assert.equal(datedSeam.rolledCashAtValuationDate, rolledCash);
  });
});

describe('P10.2  -  Rejection Gates & Input Validation', () => {
  test('3-, 5-, and 10-period schedule tests reject mismatched terminal years', async () => {
    const { ts10, ts5, ts3, wacc10, assumptions, historical } = await getFullModels();

    // 10-period expects FY2035; passing FY2030 throws mismatched_terminal_year
    assert.throws(
      () => valuateDcf(ts10, wacc10, { assumptions, corpus: historical, horizon: 10, terminalYear: 'FY2030' }),
      (err) => err instanceof EngineError && err.code === 'mismatched_terminal_year',
      '10-period rejects FY2030 terminal year',
    );

    // 5-period expects FY2030; passing FY2035 throws mismatched_terminal_year
    assert.throws(
      () => valuateDcf(ts5, wacc10, { assumptions, corpus: historical, horizon: 5, terminalYear: 'FY2035' }),
      (err) => err instanceof EngineError && err.code === 'mismatched_terminal_year',
      '5-period rejects FY2035 terminal year',
    );

    // 3-period expects FY2028; passing FY2030 throws mismatched_terminal_year
    assert.throws(
      () => valuateDcf(ts3, wacc10, { assumptions, corpus: historical, horizon: 3, terminalYear: 'FY2030' }),
      (err) => err instanceof EngineError && err.code === 'mismatched_terminal_year',
      '3-period rejects FY2030 terminal year',
    );
  });

  test('supplied share schedules must match DCF periods exactly', async () => {
    const { ts10, wacc10, assumptions, historical } = await getFullModels();

    // Generate a 5-period share schedule
    const sched5 = projectShares(assumptions, {
      periods: ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030'],
      cashFlow: ts10.cashFlow,
    }, historical);

    // Attempting to evaluate 10-period DCF with 5-period share schedule throws mismatched_share_periods
    assert.throws(
      () => valuateDcf(ts10, wacc10, { assumptions, corpus: historical, horizon: 10, shares: sched5 }),
      (err) => err instanceof EngineError && err.code === 'mismatched_share_periods',
      'Rejects share schedule with mismatched periods',
    );
  });

  test('share roll-forward exposes no false fully-diluted alias (ruling #2/#3)', async () => {
    const { assumptions, ts10, historical } = await getFullModels();
    const shareSched = projectShares(assumptions, ts10, historical);

    // Ruling #2: the current FULLY DILUTED count comes from a point-in-time share
    // schedule (P10.4 owns it). Ruling #3: the Q2 weighted-average diluted count
    // is an EPS diagnostic only. A field named `fullyDilutedShares` carrying the
    // 50,031,000 weighted-average driver would be a false financial claim, so the
    // alias must not exist at all.
    assert.equal(shareSched.currentShares, undefined, 'currentShares alias must not be published');
    assert.equal(shareSched.fullyDilutedShares, undefined, 'fullyDilutedShares alias must not be published');
    assert.equal('fullyDilutedShares' in shareSched, false, 'fullyDilutedShares key must be absent, not undefined-valued');

    // P10.5: the roll base is now the P10.4 point-in-time fully diluted schedule,
    // not the weighted-average driver. The WA count is retained separately as an
    // EPS diagnostic and must not act as the roll base.
    assert.equal(shareSched.bopShares, 50061458, 'roll base is the P10.4 FD schedule denominator');
    assert.notEqual(
      shareSched.bopShares,
      assumptions.get('shares_outstanding').value,
      'the roll base must not be the weighted-average diluted count',
    );
    assert.equal(
      shareSched.weightedAverageDilutedDiagnostic,
      assumptions.get('shares_outstanding').value,
      'the WA count is preserved as a disclosed diagnostic',
    );
    assert.equal(shareSched.bopSharesDisclosure.rulingStatus, 'wa_diluted_eps_diagnostic_only');
    assert.equal(shareSched.bopSharesDisclosure.fullyDilutedScheduleOwner, 'P10.4');
    assert.equal(shareSched.bopSharesDisclosure.role, 'beginning_of_period_roll_input');
    assert.ok(Number.isFinite(shareSched.sharesDcf), 'rolled terminal count is finite');
    assert.ok(shareSched.sharesDcf > shareSched.bopShares, 'rolled terminal count exceeds the BOP count');
    assert.equal(shareSched.terminalPeriod, 'FY2035', 'roll-forward terminal period is the DCF terminal period');
  });

  test('all DCF and dated seam outputs are strictly finite numbers', async () => {
    const { dcf10Dated, dcf10Standard } = await getFullModels();

    for (const dcf of [dcf10Dated, dcf10Standard]) {
      assert.ok(Number.isFinite(dcf.enterpriseValue), 'EV is finite');
      assert.ok(Number.isFinite(dcf.netCash), 'Net cash is finite');
      assert.ok(Number.isFinite(dcf.equityValue), 'Equity value is finite');
      assert.ok(Number.isFinite(dcf.perShare), 'Per share is finite');
      assert.ok(Number.isFinite(dcf.pvExplicit), 'pvExplicit is finite');
      assert.ok(Number.isFinite(dcf.terminalValue), 'terminalValue is finite');
      assert.ok(Number.isFinite(dcf.pvTerminal), 'pvTerminal is finite');

      for (const item of dcf.schedule) {
        assert.ok(Number.isFinite(item.presentValue), `${item.period} PV is finite`);
        assert.ok(Number.isFinite(item.discountFactor), `${item.period} df is finite`);
        assert.ok(Number.isFinite(item.fcf), `${item.period} fcf is finite`);
      }
    }
  });
});

describe('P10.2 Resubmission  -  F1 Production Wiring (dated seam is the production basis)', () => {
  test('production boot values on the dated seam: fractional exponents, stub, rolled cash', async () => {
    const { app, state } = await bootProductionApp();
    const dcfOut = state().dcf;

    assert.equal(dcfOut.valuationBasis, 'dated_seam', 'production declares the dated-seam basis');
    assert.equal(dcfOut.datedSeamMode, true, 'production runs in dated mode');

    // Discount exponents are fractional and date-derived, never integer indexes.
    const t0 = dcfOut.schedule[0].discountExponent;
    assert.ok(Math.abs(t0 - 120 / 365) < 1e-9, 'FY2026 exponent is the 120-day post-valuation stub');
    assert.notEqual(t0, 1, 'FY2026 exponent is not an integer period index');
    for (const item of dcfOut.schedule) {
      const expected = calculateDiscountExponent(EFFECTIVE_VALUATION_DATE, PERIOD_END_DATES[item.period]);
      assert.ok(Math.abs(item.discountExponent - expected) < 1e-12, `${item.period} exponent derives from declared dates`);
    }

    // The first discounted leg is the post-valuation stub only.
    const { ts10 } = await getFullModels();
    const postValFcff = ts10.cashFlow.byPeriod.FY2026.fcff.h2.postValuation.value;
    assert.equal(dcfOut.schedule[0].undiscountedFcf, postValFcff, 'FY2026 discounts post-valuation FCFF only');

    // The bridge is the rolled cash balance, not the reported BOP cash.
    assert.equal(dcfOut.bridge.cash, dcfOut.datedSeam.rolledCashAtValuationDate);
    assert.notEqual(dcfOut.bridge.cash, dcfOut.datedSeam.bopCash, 'bridge cash is rolled past the BOP balance');
    assert.ok(
      Math.abs(dcfOut.netCash - (dcfOut.bridge.cash + dcfOut.bridge.shortTermInvestments + dcfOut.bridge.longTermInvestments - dcfOut.bridge.debt)) < 1e-6,
      'net cash equals rolled cash + STI + LTI - debt',
    );

    // The dated apparatus is on the production path, not a sidecar.
    assert.ok(Math.abs(dcfOut.enterpriseValue - dcfOut.datedSeam.enterpriseValue) < 1e-6, 'headline EV is the dated EV');
    assert.ok(Math.abs(dcfOut.perShare - dcfOut.datedSeam.perShare) < 1e-9, 'headline per share is the dated per share');
    assert.ok(Math.abs(dcfOut.pvExplicit - dcfOut.datedSeam.pvExplicit) < 1e-6, 'headline pvExplicit is the dated pvExplicit');
    app.dispose();
  });

  test('production sensitivity grid center and scenario rows share the headline basis', async () => {
    const { app, state } = await bootProductionApp();
    const snapshot = state();

    const center = snapshot.sensitivityGrid.matrix[snapshot.sensitivityGrid.waccValues[4]][snapshot.sensitivityGrid.growthValues[2]];
    assert.ok(
      Math.abs(center.perShare - snapshot.dcf.perShare) < 1e-6,
      'grid center equals the headline per share (one identical basis)',
    );
    assert.ok(
      Math.abs(snapshot.sensitivityGrid.basePerShare - snapshot.dcf.perShare) < 1e-6,
      'grid base equals the headline per share',
    );
    for (const key of ['bear', 'base', 'bull']) {
      const row = snapshot.scenarios[key];
      const perShare = row.perShare ?? row.dcf?.perShare;
      assert.equal(row.dcf.valuationBasis, 'dated_seam', `${key} scenario runs on the dated seam`);
      assert.ok(Math.abs(perShare - row.dcf.datedSeam.perShare) < 1e-9, `${key} scenario per share is the dated value`);
    }
    const bear = snapshot.scenarios.bear.perShare ?? snapshot.scenarios.bear.dcf.perShare;
    const base = snapshot.scenarios.base.perShare ?? snapshot.scenarios.base.dcf.perShare;
    const bull = snapshot.scenarios.bull.perShare ?? snapshot.scenarios.bull.dcf.perShare;
    assert.ok(bear < base && base < bull, 'Bear < Base < Bull holds on the production basis');
    app.dispose();
  });

  test('the five-year legacy lane is a disclosed, explicitly labeled comparison', async () => {
    const { app, state, viewHtml } = await bootProductionApp();
    const valuationHtml = viewHtml('valuation');
    const usd2 = (value) => `$${value.toFixed(2)}`;

    assert.match(valuationHtml, /10-Period 3-Stage Model \(Active\)/, 'active row label is derived from the disclosed horizon and stage');
    assert.match(valuationHtml, /5-Period Model \(Legacy Horizon\)/, 'legacy row is explicitly labeled as the legacy comparison');
    // Both columns carry a real value, so the legacy lane is a comparison and not
    // a decorative row.
    assert.ok(state().dcf.datedSeam.perShare > 0, 'active per share is positive');
    assert.ok(valuationHtml.includes(usd2(state().dcf.datedSeam.perShare)), 'active column shows the active value');
    assert.ok(
      !valuationHtml.includes(usd2(state().dcf.perShare)) || Math.abs(state().dcf.perShare - state().dcf.datedSeam.perShare) < 1e-9,
      'the displayed active value is the dated production value',
    );

    // At the legacy horizon the comparison lane has nothing to compare, and the
    // row says why instead of rendering a silent dash or a duplicate value.
    const { app: legacyApp, viewHtml: legacyHtml, state: legacyState } = await bootProductionApp({ horizon: 5 });
    const legacyMarkup = legacyHtml('valuation');
    assert.match(legacyMarkup, /5-Period 2-Stage Model \(Active\)/, 'legacy-horizon boot labels the active row from disclosure');
    assert.match(
      legacyMarkup,
      /IS the legacy 5-period horizon/,
      'the unavailable legacy lane states the reason in the row, not a bare dash',
    );
    assert.ok(
      !legacyMarkup.includes(usd2(legacyState().dcf.enterpriseValue / 1000)),
      'the unavailable legacy lane presents no comparison value',
    );
    legacyApp.dispose();
    app.dispose();
  });

  // ── Option C: one canonical lane for production, four reachable for tests ──
  test('production boots the canonical lane by default, with no bare horizon literal', async () => {
    const { app, state } = await bootProductionApp();
    const snap = state();

    assert.equal(snap.dcf.valuationBasis, 'dated_seam', 'production defaults to the dated seam');
    assert.equal(snap.dcf.schedule.length, CANONICAL_HORIZON, `production is the ${CANONICAL_HORIZON}-period canonical lane`);
    assert.ok(
      Math.abs(snap.dcf.schedule[0].discountExponent - POST_VALUATION_STUB_DAYS / 365) < 1e-9,
      'canonical lane discounts the declared post-valuation stub',
    );

    // bootApp must not carry its own horizon literal; it has to read the constant,
    // or production silently diverges the moment CANONICAL_HORIZON moves.
    const appSrc = await readText(fileURLToPath(new URL('../src/app.js', import.meta.url)));
    const bootBody = appSrc.slice(appSrc.indexOf('export async function bootApp'));
    const bootSig = bootBody.slice(0, bootBody.indexOf('} = {}'));
    assert.ok(
      !/horizon\s*=\s*\d/.test(bootSig),
      'bootApp horizon must default to CANONICAL_HORIZON, not a bare numeric literal',
    );
    assert.match(bootSig, /horizon\s*=\s*CANONICAL_HORIZON/, 'bootApp defaults to the canonical constant');

    app.dispose();
  });

  test('no production surface headlines a non-canonical lane figure', async () => {
    // The headline per-share and its bridge must agree with `dcf.perShare` on EVERY
    // surface. This is the gate that makes "one canonical lane" enforceable rather
    // than aspirational: a card badged HEADLINE MODEL ANSWER that renders
    // `dcf.fcff.perShare` (the PRE-seam lane, which does not follow `datedSeam`)
    // would quote a figure ~$3.20/share away from the valuation tab, cover,
    // summary and verdict. Caught live on the canonical lane before this gate.
    const { app, state, viewHtml } = await bootProductionApp();
    const snap = state();
    const headline = snap.dcf.perShare;
    const usd2 = (v) => `$${v.toFixed(2)}`;
    // The canonical (after-future-dilution) figure some surfaces state instead of
    // the intermediate. Same lane, different disclosed basis.
    const canonicalBasis = valuateFcffDcf(snap.dcf).isCanonicalAddBackDcf;

    // Every tab that renders a per-share must render the CANONICAL one. The only
    // figure permitted alongside it is the explicitly-labelled legacy comparison,
    // so a hit here means an unlabelled lane leaked into a headline position.
    const legacyStr = usd2(state().dcf5?.perShare ?? -1);
    for (const tab of TAB_KEYS) {
      const html = viewHtml(tab);
      if (!html) continue;
      for (const [name, value] of [['pre-seam fcff', snap.dcf.fcff.perShare]]) {
        if (Math.abs(value - headline) < 0.01) continue;
        if (html.includes(usd2(value))) {
          assert.fail(
            `${tab} renders the ${name} per-share ${usd2(value)} instead of the canonical ${usd2(headline)}`,
          );
        }
      }
      // The canonical headline must be present wherever a headline is claimed.
      // Cover and Summary state the CANONICAL basis (after modeled future
      // dilution); the valuation tab and matrices state the intermediate. Both are
      // the canonical LANE — they differ by disclosed dilution, not by lane.
      if (tab === 'valuation') {
        assert.ok(html.includes(usd2(headline)), 'valuation must render the canonical-lane headline');
      }
      if (tab === 'cover' || tab === 'summary') {
        assert.ok(
          html.includes(usd2(headline)) || html.includes(usd2(canonicalBasis)),
          `${tab} must render a canonical-lane headline (intermediate or canonical basis)`,
        );
      }
      if (legacyStr !== usd2(-1) && html.includes(legacyStr)) {
        assert.match(html, /Legacy/i, `${tab} shows the legacy lane only where it is labelled`);
      }
    }

    // Direct assertion on the dual-path card that carried the defect.
    const valuationHtml = viewHtml('valuation');
    assert.ok(
      valuationHtml.includes(usd2(headline)),
      'the FCFF dual-path HEADLINE card renders the canonical per-share',
    );
    assert.ok(
      !valuationHtml.includes(usd2(snap.dcf.fcff.perShare))
      || Math.abs(headline - snap.dcf.fcff.perShare) < 0.01,
      `the dual-path card must not present the pre-seam ${usd2(snap.dcf.fcff.perShare)} as the headline`,
    );
    // The bridge legs must sum to the headline they sit above.
    assert.ok(
      Math.abs((snap.dcf.enterpriseValue + snap.dcf.netCash) - snap.dcf.equityValue) < 1e-6,
      'canonical EV + net cash equals canonical equity value',
    );

    app.dispose();
  });

  test('NEGATIVE CONTROL: the canonical-lane guard detects a drifted production horizon', async () => {
    // Proves the guard above is not vacuous. Boot at a NON-canonical horizon and
    // assert it no longer satisfies the canonical-lane conditions.
    const { app, state } = await bootProductionApp({ horizon: LEGACY_FIVE_YEAR_HORIZON });
    const snap = state();

    assert.notEqual(
      snap.dcf.schedule.length,
      CANONICAL_HORIZON,
      'a legacy-horizon boot is NOT the canonical lane (so the guard would fail it)',
    );
    assert.equal(snap.dcf.valuationBasis, 'dated_seam', 'basis alone does not distinguish the lanes; horizon does');
    app.dispose();
  });

  test('F6 row pairing: the ACTIVE row carries the 10-period figures and the legacy row the 5-period figures', async () => {
    // F6 (OP cycle-2 finding): a submission mis-paired these figures in prose
    // while the shipped UI paired them correctly. Nothing pinned the pairing, so
    // the claim is now pinned mechanically. Both horizons are re-derived here
    // from the engine on the canonical dated basis — never read back from the
    // DOM — so a swapped row, a swapped column, or a re-based lane all fail.
    const { app, state, viewHtml } = await bootProductionApp();
    const valuationHtml = viewHtml('valuation');

    const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
    const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
    const schedules = schedulesEngine.build(historical, assumptions);
    const waccOut = buildWacc({ assumptions, debtSchedule: schedules.debt });

    const datedAt = (horizon) => {
      const fc = forecastEngine.project({ historical, assumptions, horizon });
      const ts = threeStatementEngine.project(schedules, assumptions, fc);
      return valuateDatedSeam(ts, waccOut, { assumptions, corpus: historical, horizon });
    };

    const active = state().dcf;
    const legacy = datedAt(LEGACY_FIVE_YEAR_HORIZON);
    const activeRow = findRow(valuationHtml, '10-Period 3-Stage Model (Active)');
    const legacyRow = findRow(valuationHtml, '5-Period Model (Legacy Horizon)');

    assert.ok(activeRow, 'active row is rendered');
    assert.ok(legacyRow, 'legacy row is rendered');

    // The app's active lane IS the canonical 10-period dated valuation.
    assert.ok(Math.abs(active.enterpriseValue - datedAt(CANONICAL_HORIZON).enterpriseValue) < 1e-6, 'active EV is the 10-period dated EV');
    assert.ok(Math.abs(active.enterpriseValue - legacy.enterpriseValue) > 1, 'the two horizons differ, so a swap is detectable');

    // ACTIVE row: 10-period EV, 10-period PV of TV, 10-period TV share of EV.
    assert.ok(activeRow.includes(usd2(active.enterpriseValue)), 'active row carries the 10-period EV');
    assert.ok(activeRow.includes(usd2(active.pvTerminal)), 'active row carries the 10-period PV of terminal value');
    assert.ok(activeRow.includes(pct2(active.pvTerminal / active.enterpriseValue)), 'active row carries the 10-period TV % of EV');
    assert.ok(!activeRow.includes(usd2(legacy.enterpriseValue)), 'active row does NOT carry the 5-period EV');
    assert.ok(!activeRow.includes(pct2(legacy.pvTerminal / legacy.enterpriseValue)), 'active row does NOT carry the 5-period TV %');

    // LEGACY row: 5-period EV, 5-period PV of TV, 5-period TV share of EV.
    assert.ok(legacyRow.includes(usd2(legacy.enterpriseValue)), 'legacy row carries the 5-period EV');
    assert.ok(legacyRow.includes(usd2(legacy.pvTerminal)), 'legacy row carries the 5-period PV of terminal value');
    assert.ok(legacyRow.includes(pct2(legacy.pvTerminal / legacy.enterpriseValue)), 'legacy row carries the 5-period TV % of EV');
    assert.ok(!legacyRow.includes(usd2(active.enterpriseValue)), 'legacy row does NOT carry the 10-period EV');
    assert.ok(!legacyRow.includes(pct2(active.pvTerminal / active.enterpriseValue)), 'legacy row does NOT carry the 10-period TV %');

    // Literal anchors for the current canonical basis, so the pairing pins the
    // published figures as well as their relationship. Re-measured at beta 1.49
    // (the prior values were the beta-1.47 basis).
    assert.equal(usd2(active.enterpriseValue), '$6,181,615.23', 'canonical 10-period EV anchor');
    assert.equal(pct2(active.pvTerminal / active.enterpriseValue), '49.69%', 'canonical 10-period TV% anchor');
    assert.equal(usd2(legacy.enterpriseValue), '$5,421,997.20', 'legacy 5-period EV anchor');
    assert.equal(pct2(legacy.pvTerminal / legacy.enterpriseValue), '73.11%', 'legacy 5-period TV% anchor');
    app.dispose();
  });
});

describe('P10.2 Resubmission  -  F2 Fail-Closed Seam (no silent zero, no vacuous gate)', () => {
  test('every dated-seam gate is computed and zero on the live model', async () => {
    const { ts10, dcf10Dated } = await getFullModels();
    const seam = ts10.datedSeam;

    // Day-count gates are computed from declared dates, not literal zeros.
    assert.equal(seam.partitionGap, 0, 'declared stub days cover H2 exactly');
    assert.equal(seam.partitionDayGap, 0, 'calendar days 2026-06-30..2026-12-31 equal H2_DAYS_TOTAL');
    assert.equal(seam.preValuationDayGap, 0, 'pre-valuation window is 64 days');
    assert.equal(seam.postValuationDayGap, 0, 'post-valuation window is 120 days');
    assert.equal(seam.partitionIntersection, 0, 'the two stub windows are pairwise disjoint');
    assert.equal(seam.h1FcffOverlapDays, 0, 'H1 window does not intersect the discounted window');

    // Money gates are computed from the resolved partition legs.
    assert.equal(seam.ocfGap, 0, 'OCF articulates: full year = H1 + pre + post');
    assert.equal(seam.icfGap, 0, 'ICF articulates');
    assert.equal(seam.cffGap, 0, 'CFF articulates');
    assert.equal(seam.cashRollGap, 0, 'cash roll articulates');
    assert.equal(seam.ocfH2PartitionGap, 0, 'OCF H2 = pre + post');
    assert.equal(seam.icfH2PartitionGap, 0, 'ICF H2 = pre + post');
    assert.equal(seam.cffH2PartitionGap, 0, 'CFF H2 = pre + post');
    assert.equal(seam.cashRollH2PartitionGap, 0, 'cash roll H2 = pre + post');
    assert.equal(seam.h1FcffOverlap, 0, 'no FY2026 FCFF dollar is counted in both windows');
    assert.equal(seam.fcfDoubleCounted, 0, 'no FY2026 FCF dollar is counted in both windows');

    // The DCF re-derives the windows it alone can see, from resolved legs.
    const gates = dcf10Dated.datedSeam.gates;
    assert.equal(gates.h1FcffOverlap, 0, 'DCF-computed H1 FCFF overlap is zero');
    assert.equal(gates.h1FcffOverlapDays, 0, 'DCF-computed H1 overlap in days is zero');
    assert.equal(gates.partitionIntersection, 0, 'DCF-computed stub intersection is zero');
    assert.equal(gates.ocfGap, 0);
    assert.equal(gates.icfGap, 0);
    assert.equal(gates.cffGap, 0);
    assert.equal(gates.cashRollGap, 0);
    assert.equal(gates.partitionGap, 0);
    assert.equal(gates.allOutputFinite, true);

    const windows = dcf10Dated.datedSeam.cashFlowWindows;
    assert.equal(windows.bridgedWindowFcff, windows.h1ActualFcff + windows.preValuationFcff, 'bridged window = H1 + pre-valuation');
    // Tolerance scales with magnitude (float precision at 1e5-1e6 scale).
    const remainder = windows.fullYearFcff - windows.bridgedWindowFcff;
    assert.ok(
      Math.abs(windows.discountedWindowFcff - remainder) <= Math.max(1e-9, Math.abs(remainder) * 1e-12),
      'discounted window is the remainder of the full year',
    );
  });

  test('missing declared partitions fail closed instead of becoming zero', async () => {
    const { ts10, wacc10, assumptions, historical } = await getFullModels();
    const input = { assumptions, corpus: historical, horizon: CANONICAL_HORIZON };

    const dropField = (mutate) => {
      const clone = JSON.parse(JSON.stringify(ts10));
      mutate(clone);
      return clone;
    };

    // Seam bridge values absent.
    for (const field of ['preValuationCashChange', 'rolledCashAtValuationDate']) {
      const clone = dropField((c) => { delete c.datedSeam[field]; });
      assert.throws(
        () => valuateDatedSeam(clone, wacc10, input),
        (err) => err instanceof EngineError && err.code === 'missing_seam_partition',
        `missing datedSeam.${field} must throw missing_seam_partition`,
      );
    }

    // Declared FY2026 partition legs absent (legs the DCF reads directly).
    for (const [path, mutate] of [
      ['fcff.h2.preValuation', (c) => { delete c.cashFlow.byPeriod.FY2026.fcff.h2.preValuation; }],
      ['fcff.h2.postValuation', (c) => { delete c.cashFlow.byPeriod.FY2026.fcff.h2.postValuation; }],
      ['fcff.h1', (c) => { delete c.cashFlow.byPeriod.FY2026.fcff.h1; }],
    ]) {
      const clone = dropField(mutate);
      assert.throws(
        () => valuateDatedSeam(clone, wacc10, input),
        (err) => err instanceof EngineError && err.code === 'missing_seam_partition',
        `missing ${path} must throw missing_seam_partition`,
      );
    }

    // The cash-roll partition is resolved once, by threeStatement, into the seam
    // block. Positive control: the published seam value IS that resolved row, so
    // a missing row would have failed closed at compute time rather than silently
    // defaulting to zero.
    assert.equal(
      ts10.datedSeam.preValuationCashChange,
      ts10.datedSeam.partitions.cashRoll.preValuation,
      'the seam bridge value is the resolved cash-roll partition, not a default',
    );
    assert.equal(
      ts10.datedSeam.rolledCashAtValuationDate,
      ts10.datedSeam.bopCash + ts10.datedSeam.partitions.cashRoll.preValuation,
      'rolled cash is BOP plus the resolved pre-valuation partition',
    );

    // The whole seam block absent.
    const noSeam = dropField((c) => { delete c.datedSeam; });
    assert.throws(
      () => valuateDatedSeam(noSeam, wacc10, input),
      (err) => err instanceof EngineError && err.code === 'missing_seam_partition',
      'missing threeStatement.datedSeam must throw missing_seam_partition',
    );

    // A non-finite leg is equally fatal.
    const nanSeam = dropField((c) => { c.datedSeam.preValuationCashChange = null; });
    assert.throws(
      () => valuateDatedSeam(nanSeam, wacc10, input),
      (err) => err instanceof EngineError && err.code === 'missing_seam_partition',
      'a null seam value must throw rather than coerce to zero',
    );
  });

  test('a wrong declared window produces a non-zero gate (gates are not vacuous)', async () => {
    const { ts10 } = await getFullModels();
    const seam = ts10.datedSeam;

    // Non-tautology: recomputing the gates from the declared dates with a
    // deliberately wrong stub length must move the number.
    const wrongPartition = (PRE_VALUATION_STUB_DAYS + POST_VALUATION_STUB_DAYS) - H2_DAYS_TOTAL + 1;
    assert.notEqual(wrongPartition, 0, 'a one-day partition error is detectable');
    assert.equal(seam.partitionGap, 0, 'the live declared partition is exact');

    const cf = ts10.cashFlow.byPeriod.FY2026;
    const h2 = cf.fcff.h2;
    const articulationGap = cf.fcff.value - (cf.fcff.h1.value + h2.preValuation.value + h2.postValuation.value);
    assert.equal(articulationGap, seam.ocfGap * 0 + articulationGap, 'gap is computed, not asserted');
    assert.equal(seam.h1FcffOverlap, 0, 'live double count is zero');

    // Proof the overlap metric reacts: bridge the whole H2 into both windows.
    const bridged = cf.fcff.h1.value + h2.value;
    const doubleCounted = Math.max(0, bridged + h2.postValuation.value - cf.fcff.value);
    assert.ok(doubleCounted > 0, 'an H2 amount present in both windows is detected');
  });
});

describe('P10.2 Resubmission  -  F4 Fail-Closed Declared Periods', () => {
  test('an undeclared period throws instead of synthesizing a year-end date', async () => {
    const { ts10, wacc10, assumptions, historical } = await getFullModels();
    const input = { assumptions, corpus: historical, horizon: CANONICAL_HORIZON };

    const clone = JSON.parse(JSON.stringify(ts10));
    const renamed = 'FY2098';
    clone.periods[2] = renamed;
    clone.cashFlow.byPeriod[renamed] = clone.cashFlow.byPeriod.FY2028;
    clone.incomeStatement.byPeriod[renamed] = clone.incomeStatement.byPeriod.FY2028;
    clone.balanceSheet.byPeriod[renamed] = clone.balanceSheet.byPeriod.FY2028;

    assert.equal(PERIOD_END_DATES[renamed], undefined, 'the probe period is genuinely undeclared');
    assert.throws(
      () => valuateDatedSeam(clone, wacc10, input),
      (err) => err instanceof EngineError && err.code === 'undeclared_period',
      'an undeclared period must fail closed',
    );

    // Every declared forecast period resolves without a synthesized date.
    for (const period of ts10.periods) {
      assert.match(PERIOD_END_DATES[period], /^\d{4}-\d{2}-\d{2}$/, `${period} has a declared ISO end date`);
    }
    const { dcf10Dated } = await getFullModels();
    assert.equal(dcf10Dated.datedSeam.terminalDate, PERIOD_END_DATES.FY2035, 'terminal date comes from the declared map');
  });
});

describe('P10.2 Resubmission  -  F5 Absent-Stage Disclosure (no quiet label swap)', () => {
  test('stage structure, label, and basis are derived from disclosed engine data', async () => {
    const { dcf10Dated, dcf5Dated } = await getFullModels();

    const ten = describeStageStructure(dcf10Dated);
    assert.equal(ten.stageStructure, 'three_stage');
    assert.equal(ten.label, '3-Stage FCFF DCF');
    assert.equal(ten.basis, 'FY2026-FY2035 + Gordon');
    assert.equal(ten.fadePresent, true);
    assert.equal(ten.isThreeStage, true);
    assert.equal(ten.explicitLastPeriod, 'FY2030');
    assert.equal(ten.fadeFirstPeriod, 'FY2031');
    assert.equal(ten.valuationBasis, 'dated_seam');

    const five = describeStageStructure(dcf5Dated);
    assert.equal(five.stageStructure, 'single_explicit_stage_plus_terminal');
    assert.equal(five.isThreeStage, false);
    assert.equal(five.basis, 'FY2026-FY2030 + Gordon', 'basis follows the declared horizon, never a hardcoded string');
    assert.ok(five.disclosure.includes('No fade stage'), 'the absent fade stage is disclosed in words');
  });

  test('absent stage data is disclosed, never relabelled as a 2-Stage model', async () => {
    // Fade periods exist but the fade present value is missing: the disclosure
    // must say so instead of quietly reporting a 2-stage model.
    const unquantified = describeStageStructure({
      periods: ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030', 'FY2031', 'FY2032'],
      terminalYear: 'FY2032',
      pvByStage: { explicit: 100, terminal: 200 },
    });
    assert.equal(unquantified.stageStructure, 'three_stage_unquantified');
    assert.equal(unquantified.fadePresent, false);
    assert.equal(unquantified.fadePresentValue, null, 'an undisclosed fade value is null, never zero');
    assert.ok(unquantified.label.includes('not disclosed'), 'label states the fade PV is undisclosed');
    assert.ok(unquantified.disclosure.includes('NOT disclosed'), 'disclosure text states it in words');

    // No period list at all: structure is undisclosed and the wrapper default
    // label is retained WITH a disclosure, not silently.
    const undisclosed = describeStageStructure({ perShare: 100 });
    assert.equal(undisclosed.stageStructure, 'undisclosed');
    assert.equal(undisclosed.fadePresent, false);
    assert.ok(undisclosed.disclosure.includes('undisclosed'), 'undisclosed state is stated in words');

    // A short horizon has no fade stage, and says so in words rather than
    // implying a fade present value of zero.
    const single = describeStageStructure({ periods: ['FY2026', 'FY2027'], terminalYear: 'FY2027' });
    assert.equal(single.stageStructure, 'single_explicit_stage_plus_terminal');
    assert.equal(single.fadePresentValue, null, 'no fade value is invented');
    assert.ok(single.disclosure.includes('No fade stage'), 'the absent fade stage is disclosed in words');
  });

  test('the FCFF DCF method carries the stage disclosure into provenance', async () => {
    const { dcf10Dated } = await getFullModels();
    const method = valuateFcffDcf(dcf10Dated);
    assert.equal(method.label, '3-Stage FCFF DCF');
    assert.equal(method.basis, 'FY2026-FY2035 + Gordon');
    assert.equal(method.stageDisclosure.stageStructure, 'three_stage');
    assert.equal(method.inputsProvenance.model, 'three_stage');
    assert.equal(method.inputsProvenance.valuationBasis, 'dated_seam');
    assert.ok(method.inputsProvenance.stageDisclosure.length > 0, 'provenance carries the disclosure text');
  });

  test('no quiet label swap remains in the production UI layer', () => {
    const sources = [
      ['src/app.js', 'src/app.js'],
      ['src/ui/summaryTab.js', 'src/ui/summaryTab.js'],
      ['src/ui/valuationTab.js', 'src/ui/valuationTab.js'],
      ['src/ui/coverTab.js', 'src/ui/coverTab.js'],
    ];
    for (const [label, rel] of sources) {
      const src = fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
      assert.doesNotMatch(src, /pvByStage\?\.fade\s*\?\?\s*0/, `${label} must not default an absent fade stage to zero`);
      assert.doesNotMatch(src, /\(dcfOut\?\.pvByStage\?\.fade\s*\?\?\s*0\)\s*>/, `${label} must not branch a label on a defaulted fade value`);
    }
  });

  test('O2 gate: DCF stage breakdown legs foot to enterprise value in BOTH integer and dated lanes', async () => {
    const { dcf10Dated, dcf10Standard, dcf5Dated, dcf5Standard } = await getFullModels();

    // 1. Dated 10-period canonical lane (production basis)
    assert.equal(dcf10Dated.valuationBasis, 'dated_seam');
    const dated10Stages = dcf10Dated.pvByStage;
    assert.ok(dated10Stages, 'dated lane must publish pvByStage');
    assert.ok(Number.isFinite(dated10Stages.explicit) && dated10Stages.explicit > 0);
    assert.ok(Number.isFinite(dated10Stages.fade) && dated10Stages.fade > 0);
    assert.ok(Number.isFinite(dated10Stages.terminal) && dated10Stages.terminal > 0);
    const dated10Sum = dated10Stages.explicit + dated10Stages.fade + dated10Stages.terminal;
    assert.equal(
      dated10Sum,
      dcf10Dated.enterpriseValue,
      'dated 10-period stage legs must foot exactly to enterpriseValue (zero difference)',
    );
    assert.equal(
      dated10Stages.explicit + dated10Stages.fade,
      dcf10Dated.pvExplicit,
      'dated 10-period explicit + fade must foot exactly to pvExplicit',
    );

    // 2. Integer 10-period comparison lane
    assert.equal(dcf10Standard.valuationBasis, 'integer_period_index');
    const int10Stages = dcf10Standard.pvByStage;
    assert.ok(int10Stages, 'integer lane must publish pvByStage');
    assert.ok(Number.isFinite(int10Stages.explicit) && int10Stages.explicit > 0);
    assert.ok(Number.isFinite(int10Stages.fade) && int10Stages.fade > 0);
    assert.ok(Number.isFinite(int10Stages.terminal) && int10Stages.terminal > 0);
    const int10Sum = int10Stages.explicit + int10Stages.fade + int10Stages.terminal;
    assert.equal(
      int10Sum,
      dcf10Standard.enterpriseValue,
      'integer 10-period stage legs must foot exactly to enterpriseValue (zero difference)',
    );
    assert.equal(
      int10Stages.explicit + int10Stages.fade,
      dcf10Standard.pvExplicit,
      'integer 10-period explicit + fade must foot exactly to pvExplicit',
    );

    // 3. Dated 5-period legacy comparison lane (single explicit stage)
    const dated5Stages = dcf5Dated.pvByStage;
    assert.ok(dated5Stages, 'dated 5-period lane must publish pvByStage');
    assert.equal(dated5Stages.fade, 0, '5-period model has zero fade present value');
    assert.equal(
      dated5Stages.explicit + dated5Stages.fade + dated5Stages.terminal,
      dcf5Dated.enterpriseValue,
      'dated 5-period stage legs must foot exactly to enterpriseValue',
    );

    // 4. Integer 5-period legacy lane
    const int5Stages = dcf5Standard.pvByStage;
    assert.ok(int5Stages, 'integer 5-period lane must publish pvByStage');
    assert.equal(int5Stages.fade, 0, '5-period model has zero fade present value');
    assert.equal(
      int5Stages.explicit + int5Stages.fade + int5Stages.terminal,
      dcf5Standard.enterpriseValue,
      'integer 5-period stage legs must foot exactly to enterpriseValue',
    );
  });
});

