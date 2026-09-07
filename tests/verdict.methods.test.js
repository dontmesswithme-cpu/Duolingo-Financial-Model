/**
 * P8.3 Multi-Method Agreement Verdict Engine Tests
 *
 * Covers:
 *  - fcffDcf wrapper: exposes 6R2 2-stage FCFF DCF without recomputation; common frozen shape.
 *  - aggregate.js agreement-only verdict engine:
 *      * Truth table: unanimous undervalued, unanimous overvalued, unanimous fair, split/no-consensus.
 *      * Threshold band: ±15% imported from RECOMMENDATION_THRESHOLDS (zero magic literals).
 *      * Dissent rendered method-by-method for split verdicts.
 *      * Grep gate: ZERO mentions of 'weight', 'weighted', 'weights', 'average' in aggregate.js.
 *      * Zero bare numeric literals > 999 outside comments.
 *  - Live 6-method integration tie-out at default baseline:
 *      * DCF $144.08, EV/Rev $141.59, EV/EBITDAR $116.20, P/FCF $240.43, SOTP $141.59, Per-User $443.68.
 *      * Benchmark price $157.85 -> FAIR (no consensus) with 2 undervalued, 1 overvalued, 3 fair.
 *  - Purity, determinism, fail-closed validation on invalid/missing inputs.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { valuateFcffDcf } from '../src/engine/methods/fcffDcf.js';
import { aggregateVerdicts, verdict } from '../src/engine/methods/aggregate.js';
import { valuateComps } from '../src/engine/methods/comps.js';
import { valuateEvMultiples } from '../src/engine/methods/evMultiples.js';
import { valuatePfcf } from '../src/engine/methods/pfcf.js';
import { valuateSotp } from '../src/engine/methods/sotp.js';
import { valuatePerUser } from '../src/engine/methods/perUser.js';
import { RECOMMENDATION_THRESHOLDS } from '../src/data/constants.js';
import { EngineError } from '../src/data/errors.js';

import * as dataLayer from '../src/data/loader.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import { compute as computeTtm } from '../src/engine/ttm.js';
import { renderSummary } from '../src/ui/summaryTab.js';
import { createApp } from '../src/app.js';
import { evaluate as evaluateRec } from '../src/engine/recommend.js';
import { StubElement, createTabRoot } from './_dom_stub.js';

const AGGREGATE_SRC_PATH = fileURLToPath(new URL('../src/engine/methods/aggregate.js', import.meta.url));
const FCFF_DCF_SRC_PATH = fileURLToPath(new URL('../src/engine/methods/fcffDcf.js', import.meta.url));
const PEERS_PATH = fileURLToPath(new URL('../src/data/historical/peers.json', import.meta.url));

function loadPeers() {
  return JSON.parse(fs.readFileSync(PEERS_PATH, 'utf8'));
}

describe('P8.3  -  FCFF DCF Method Wrapper', () => {
  test('wraps dcfOutput into common frozen contract shape without recomputation', () => {
    const mockDcfOutput = {
      perShare: 144.08,
      wacc: 0.110375,
      terminalGrowthRate: 0.025,
      sharesOutstanding: 50031000,
      fcff: {
        enterpriseValue: 5887254.65,
        netCashToday: 1416559.0,
        equityValue: 7208399.78,
        perShare: 144.08
      },
      fcfe: {
        perShare: 117.49
      }
    };

    const res = valuateFcffDcf(mockDcfOutput);
    assert.equal(res.method, 'fcff_dcf');
    assert.equal(res.label, '2-Stage FCFF DCF');
    assert.equal(res.basis, 'FY2026-FY2030 + Gordon');
    assert.equal(res.impliedPerShare, 144.08);
    assert.equal(res.rangePerShare.min, 117.49);
    assert.equal(res.rangePerShare.max, 144.08);
    assert.equal(res.leaseConvention.duolingoLeaseBasis, 'operating_flow');
    assert.ok(res.leaseConvention.note.includes('operating cash flows'));
    assert.ok(Object.isFrozen(res));
    assert.ok(Object.isFrozen(res.rangePerShare));
    assert.ok(Object.isFrozen(res.leaseConvention));
  });

  test('fails closed on missing or invalid dcfOutput', () => {
    assert.throws(() => valuateFcffDcf(null), { code: 'missing_dcf_output' });
    assert.throws(() => valuateFcffDcf({}), { code: 'invalid_dcf_per_share' });
    assert.throws(() => valuateFcffDcf({ perShare: -10 }), { code: 'invalid_dcf_per_share' });
    assert.throws(() => valuateFcffDcf({ perShare: NaN }), { code: 'invalid_dcf_per_share' });
  });
});

describe('P8.3  -  Agreement Engine Truth Table & Invariants', () => {
  const livePrice = 100.0;
  // Threshold band: underThresh = +0.15 (price >= 115), overThresh = -0.15 (price <= 85)

  test('unanimous undervalued: every method implied >= price * (1 + 0.15)', () => {
    const methods = [
      { method: 'm1', label: 'Method 1', impliedPerShare: 120.0 },
      { method: 'm2', label: 'Method 2', impliedPerShare: 130.0 },
      { method: 'm3', label: 'Method 3', impliedPerShare: 116.0 },
      { method: 'm4', label: 'Method 4', impliedPerShare: 140.0 },
      { method: 'm5', label: 'Method 5', impliedPerShare: 125.0 },
      { method: 'm6', label: 'Method 6', impliedPerShare: 150.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    assert.equal(res.verdict, 'undervalued');
    assert.equal(res.agreement.unanimous, true);
    assert.equal(res.agreement.counts.undervalued, 6);
    assert.equal(res.agreement.counts.overvalued, 0);
    assert.equal(res.agreement.counts.fair, 0);
    assert.equal(res.dissent.length, 0);
    assert.ok(res.agreement.summary.includes('Unanimous agreement'));
    assert.ok(res.agreement.summary.includes('UNDERVALUED'));
  });

  test('unanimous overvalued: every method implied <= price * (1 - 0.15)', () => {
    const methods = [
      { method: 'm1', label: 'Method 1', impliedPerShare: 80.0 },
      { method: 'm2', label: 'Method 2', impliedPerShare: 75.0 },
      { method: 'm3', label: 'Method 3', impliedPerShare: 84.0 },
      { method: 'm4', label: 'Method 4', impliedPerShare: 70.0 },
      { method: 'm5', label: 'Method 5', impliedPerShare: 82.0 },
      { method: 'm6', label: 'Method 6', impliedPerShare: 65.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    assert.equal(res.verdict, 'overvalued');
    assert.equal(res.agreement.unanimous, true);
    assert.equal(res.agreement.counts.overvalued, 6);
    assert.equal(res.agreement.counts.undervalued, 0);
    assert.equal(res.agreement.counts.fair, 0);
    assert.equal(res.dissent.length, 0);
    assert.ok(res.agreement.summary.includes('Unanimous agreement'));
    assert.ok(res.agreement.summary.includes('OVERVALUED'));
  });

  test('unanimous fair: every method implied within (-15%, +15%)', () => {
    const methods = [
      { method: 'm1', label: 'Method 1', impliedPerShare: 100.0 },
      { method: 'm2', label: 'Method 2', impliedPerShare: 105.0 },
      { method: 'm3', label: 'Method 3', impliedPerShare: 95.0 },
      { method: 'm4', label: 'Method 4', impliedPerShare: 110.0 },
      { method: 'm5', label: 'Method 5', impliedPerShare: 90.0 },
      { method: 'm6', label: 'Method 6', impliedPerShare: 98.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    assert.equal(res.verdict, 'fair');
    assert.equal(res.agreement.unanimous, true);
    assert.equal(res.agreement.counts.fair, 6);
    assert.equal(res.dissent.length, 0);
  });

  test('split verdict produces FAIR with dissent rendered method-by-method (5 undervalued, 1 fair)', () => {
    const methods = [
      { method: 'm1', label: 'DCF', impliedPerShare: 120.0 },
      { method: 'm2', label: 'Comps', impliedPerShare: 102.0 }, // Fair (within ±15%)
      { method: 'm3', label: 'EV/EBITDAR', impliedPerShare: 125.0 },
      { method: 'm4', label: 'P/FCF', impliedPerShare: 130.0 },
      { method: 'm5', label: 'SOTP', impliedPerShare: 122.0 },
      { method: 'perUser', label: 'Per-User', impliedPerShare: 140.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    assert.equal(res.verdict, 'fair');
    assert.equal(res.agreement.unanimous, false);
    assert.equal(res.agreement.counts.undervalued, 5);
    assert.equal(res.agreement.counts.fair, 1);
    assert.equal(res.dissent.length, 5); // In a fair-by-split verdict, methods that are not fair are reported as dissenters
    assert.ok(res.agreement.summary.includes('5 methods undervalued'));
    assert.ok(res.agreement.summary.includes('1 method fair [Comps]'));
    assert.ok(res.agreement.summary.includes('verdict: FAIR, no consensus'));
  });

  test('split verdict matching DUOL default state: 2 undervalued, 1 overvalued, 3 fair', () => {
    const duolMethods = [
      { method: 'fcff_dcf', label: '2-Stage FCFF DCF', impliedPerShare: 144.08 },
      { method: 'comps', label: 'EV / Forward Revenue (Comps)', impliedPerShare: 141.59 },
      { method: 'ev_multiples', label: 'EV / Forward EBITDAR (Comps)', impliedPerShare: 116.20 },
      { method: 'pfcf', label: 'P/FCF & FCF Yield', impliedPerShare: 240.43 },
      { method: 'sotp', label: 'Sum-of-the-Parts (SOTP)', impliedPerShare: 141.59 },
      { method: 'perUser', label: 'Per-User / Per-Subscriber', impliedPerShare: 443.68 },
    ];
    const duolBenchmarkPrice = 157.85;

    const res = aggregateVerdicts(duolMethods, duolBenchmarkPrice);

    assert.equal(res.verdict, 'fair');
    assert.equal(res.agreement.unanimous, false);
    assert.equal(res.agreement.counts.undervalued, 2);
    assert.equal(res.agreement.counts.overvalued, 1);
    assert.equal(res.agreement.counts.fair, 3);
    assert.equal(res.agreement.counts.total, 6);

    // Dissent list contains all non-fair methods in a split
    assert.equal(res.dissent.length, 3);
    const dissenterMethods = res.dissent.map((d) => d.method);
    assert.ok(dissenterMethods.includes('ev_multiples'));
    assert.ok(dissenterMethods.includes('pfcf'));
    assert.ok(dissenterMethods.includes('perUser'));

    // Check summary prose
    assert.ok(res.agreement.summary.includes('2 methods undervalued'));
    assert.ok(res.agreement.summary.includes('1 method overvalued'));
    assert.ok(res.agreement.summary.includes('3 methods fair'));
    assert.ok(res.agreement.summary.includes('verdict: FAIR, no consensus'));

    // Implied spread
    assert.ok(Math.abs(res.agreement.spread.min - 116.20) < 1e-4);
    assert.ok(Math.abs(res.agreement.spread.max - 443.68) < 1e-4);
    assert.ok(Math.abs(res.agreement.spread.span - (443.68 - 116.20)) < 1e-4);
  });

  test('verdict shorthand alias works identically to aggregateVerdicts', () => {
    const methods = [
      { method: 'm1', label: 'M1', impliedPerShare: 120.0 },
      { method: 'm2', label: 'M2', impliedPerShare: 125.0 },
    ];
    const res1 = aggregateVerdicts(methods, livePrice);
    const res2 = verdict(methods, livePrice);
    assert.deepEqual(res1, res2);
  });

  test('fails closed on invalid inputs', () => {
    assert.throws(() => aggregateVerdicts(null, 100), { code: 'missing_methods' });
    assert.throws(() => aggregateVerdicts([], 100), { code: 'empty_methods' });
    assert.throws(() => aggregateVerdicts([{ method: 'm1', impliedPerShare: 100 }], 0), { code: 'invalid_live_price' });
    assert.throws(() => aggregateVerdicts([{ method: 'm1', impliedPerShare: -5 }], 100), { code: 'invalid_implied_per_share' });
    assert.throws(() => aggregateVerdicts([{ method: 'm1', impliedPerShare: NaN }], 100), { code: 'invalid_implied_per_share' });
  });
});

describe('P8.3  -  End-to-End Live Engine Valuation & Multi-Method Tie-Out', () => {
  test('all 6 valuation methods compute from live engine outputs and tie to OP expected values', async () => {
    const readFile = (p) => fs.promises.readFile(p, 'utf8');
    const dataset = await dataLayer.loadHistorical({ dir: './src/data/historical/', readText: readFile });
    const assumptions = await dataLayer.loadAssumptions({ location: './src/data/assumptions.json', readText: readFile });
    const peers = loadPeers();

    const sched = schedulesEngine.build(dataset, assumptions);
    const fc = forecastEngine.project({ historical: dataset, assumptions });
    const ts = threeStatementEngine.project(sched, assumptions, fc);
    const w = buildWacc({ assumptions, debtSchedule: sched.debt });
    const d = valuateDcf(ts, w, { assumptions });
    const ttm = computeTtm(dataset);

    const p0 = ts.periods[0];
    const isP0 = ts.incomeStatement.byPeriod[p0];
    const cfP0 = ts.cashFlow.byPeriod[p0];

    const forwardRevenue = isP0.revenue.total.value;
    const detRevenue = isP0.revenue.segments.duolingo_english_test.value;
    const da = cfP0.operating_activities.depreciation_and_amortization.value;
    const opInc = isP0.operating_income.value;
    const rent = 12071;
    const forwardEbitdar = opInc + da + rent;
    const leaseLiab = 86136;
    const netCashCapitalized = d.fcff.netCashToday - leaseLiab;
    const sharesOutstanding = d.sharesOutstanding;

    const ocfTtm = ttm.flow.find((x) => x.metric === 'cash_from_operating_activities').value;
    const ppeCapex = Math.abs(ttm.flow.find((x) => x.metric === 'purchase_of_property_and_equipment').value);
    const softCapex = Math.abs(ttm.flow.find((x) => x.metric === 'capitalized_software_and_intangibles').value);
    const ttmFcf = ocfTtm - (ppeCapex + softCapex);

    const dau = ttm.kpi.find((x) => x.metric === 'dau').value;
    const mau = ttm.kpi.find((x) => x.metric === 'mau').value;
    const paidSubs = ttm.kpi.find((x) => x.metric === 'paid_subscribers').value;

    const arpuContext = {
      subscriptionArpu: '$6.71 / month ($80.50 / year driver basis)',
      bookingsPerDau: '$21.98 / year ($1,158,425k FY2025 bookings / 52.7M avg DAU)'
    };

    // Run 6 methods
    const resDcf = valuateFcffDcf(d);
    const resComps = valuateComps(peers, { forwardRevenue, netCashCapitalized, sharesOutstanding });
    const resEv = valuateEvMultiples(peers, { forwardEbitdar, netCashCapitalized, sharesOutstanding });
    const resPfcf = valuatePfcf(peers, { ttmFreeCashFlow: ttmFcf, sharesOutstanding });
    const resSotp = valuateSotp(peers, { forwardRevenue, detRevenue, forwardEbitdar, netCashCapitalized, sharesOutstanding });
    const resPerUser = valuatePerUser(peers, { kpis: { mau, dau, paidSubscribers: paidSubs }, netCashCapitalized, sharesOutstanding, arpuContext });

    // Tie-out each method to OP expected values
    assert.ok(Math.abs(resDcf.impliedPerShare - 144.08) < 0.05, `DCF expected ~144.08, got ${resDcf.impliedPerShare}`);
    assert.ok(Math.abs(resComps.impliedPerShare - 141.59) < 0.05, `Comps expected ~141.59, got ${resComps.impliedPerShare}`);
    assert.ok(Math.abs(resEv.impliedPerShare - 116.20) < 0.05, `EV/EBITDAR expected ~116.20, got ${resEv.impliedPerShare}`);
    assert.ok(Math.abs(resPfcf.impliedPerShare - 240.43) < 0.05, `P/FCF expected ~240.43, got ${resPfcf.impliedPerShare}`);
    assert.ok(Math.abs(resSotp.impliedPerShare - 141.59) < 0.05, `SOTP expected ~141.59, got ${resSotp.impliedPerShare}`);
    assert.ok(Math.abs(resPerUser.impliedPerShare - 443.68) < 0.05, `Per-User expected ~443.68, got ${resPerUser.impliedPerShare}`);

    // Run Agreement Verdict against benchmark price $157.85
    const livePrice = 157.85;
    const methodsList = [resDcf, resComps, resEv, resPfcf, resSotp, resPerUser];
    const verdictOut = aggregateVerdicts(methodsList, livePrice);

    assert.equal(verdictOut.verdict, 'fair');
    assert.equal(verdictOut.agreement.unanimous, false);
    assert.equal(verdictOut.agreement.counts.undervalued, 2);
    assert.equal(verdictOut.agreement.counts.overvalued, 1);
    assert.equal(verdictOut.agreement.counts.fair, 3);
    assert.equal(verdictOut.dissent.length, 3);
  });
});

describe('P8.3  -  Quality Gates & Static Analysis', () => {
  test('GREP GATE: aggregate.js contains zero weight / weighted / average occurrences', () => {
    const src = fs.readFileSync(AGGREGATE_SRC_PATH, 'utf8');
    const weightMatches = src.match(/weight/gi);
    const averageMatches = src.match(/average/gi);

    assert.equal(weightMatches, null, `Found ${weightMatches?.length} occurrences of 'weight' in aggregate.js`);
    assert.equal(averageMatches, null, `Found ${averageMatches?.length} occurrences of 'average' in aggregate.js`);
  });

  test('zero bare numeric literals > 999 outside comments in aggregate.js and fcffDcf.js', () => {
    for (const filePath of [AGGREGATE_SRC_PATH, FCFF_DCF_SRC_PATH]) {
      const code = fs.readFileSync(filePath, 'utf8');
      const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const numberMatches = stripped.match(/\b\d{4,}\b/g);
      assert.equal(
        numberMatches,
        null,
        `${filePath} contains bare numeric literals > 999: ${JSON.stringify(numberMatches)}`
      );
    }
  });

  test('threshold values strictly match RECOMMENDATION_THRESHOLDS import', () => {
    const methods = [
      { method: 'm1', label: 'M1', impliedPerShare: 100.0 }
    ];
    const res = aggregateVerdicts(methods, 100.0);
    assert.equal(res.thresholds.undervalued, RECOMMENDATION_THRESHOLDS.undervalued);
    assert.equal(res.thresholds.overvalued, RECOMMENDATION_THRESHOLDS.overvalued);
    assert.equal(res.thresholds.undervalued, 0.15);
    assert.equal(res.thresholds.overvalued, -0.15);
  });
});

describe('P8.3  -  Summary View Update Wiring & Live App Recalculation Integration (R2 Regression Gate)', () => {
  test('summaryView.update receives (verdict, methods) in correct order and renders exactly 6 method rows', async () => {
    const readFile = (p) => fs.promises.readFile(p, 'utf8');
    const dataset = await dataLayer.loadHistorical({ dir: './src/data/historical/', readText: readFile });
    const assumptions = await dataLayer.loadAssumptions({ location: './src/data/assumptions.json', readText: readFile });
    const peers = loadPeers();

    const sched = schedulesEngine.build(dataset, assumptions);
    const fc = forecastEngine.project({ historical: dataset, assumptions });
    const ts = threeStatementEngine.project(sched, assumptions, fc);
    const w = buildWacc({ assumptions, debtSchedule: sched.debt });
    const d = valuateDcf(ts, w, { assumptions });
    const rec = evaluateRec(d.perShare, 157.85);

    const container = new StubElement();
    let html = '';
    Object.defineProperty(container, 'innerHTML', {
      get: () => html,
      set: (v) => { html = String(v); },
    });

    const view = renderSummary({
      container,
      dcf: d,
      recommendation: rec,
      historical: dataset,
      assumptions,
      threeStatement: ts,
    });

    const resDcf = valuateFcffDcf(d);
    const resComps = valuateComps(peers, { forwardRevenue: 1193853.52, netCashCapitalized: 1330423, sharesOutstanding: d.sharesOutstanding });
    const resEv = valuateEvMultiples(peers, { forwardEbitdar: 177683.57, netCashCapitalized: 1330423, sharesOutstanding: d.sharesOutstanding });
    const resPfcf = valuatePfcf(peers, { ttmFreeCashFlow: 397504, sharesOutstanding: d.sharesOutstanding });
    const resSotp = valuateSotp(peers, { forwardRevenue: 1193853.52, detRevenue: 41812.44, forwardEbitdar: 177683.57, netCashCapitalized: 1330423, sharesOutstanding: d.sharesOutstanding });
    const resPerUser = valuatePerUser(peers, {
      kpis: { mau: 133100000, dau: 58700000, paidSubscribers: 12700000 },
      netCashCapitalized: 1330423,
      sharesOutstanding: d.sharesOutstanding,
      arpuContext: {
        subscriptionArpu: '$6.71 / month ($80.50 / year driver basis)',
        bookingsPerDau: '$21.98 / year ($1,158,425k FY2025 bookings / 52.7M avg DAU)',
      },
    });

    const methods = [resDcf, resComps, resEv, resPfcf, resSotp, resPerUser];
    const verdictObj = aggregateVerdicts(methods, 157.85);

    // Call update with correct order: (newDcf, newRec, newKpi, newHist, newAssumptions, newTs, newMkt, newVerdict, newMethods)
    view.update(d, rec, null, dataset, assumptions, ts, null, verdictObj, methods);

    const rowMatches = html.match(/<tr class="method-row-/g);
    assert.equal(rowMatches?.length, 6, `Expected exactly 6 method rows after update(), got ${rowMatches?.length}`);
    assert.ok(html.includes('$144.08'), 'Must include DCF per share $144.08');
    assert.ok(html.includes('$141.59'), 'Must include Comps per share $141.59');
    assert.ok(html.includes('$116.20'), 'Must include EV/EBITDAR per share $116.20');
    assert.ok(html.includes('$240.43'), 'Must include P/FCF per share $240.43');
    assert.ok(html.includes('$443.68'), 'Must include Per-User per share $443.68');
    assert.ok(html.includes('2 methods undervalued'), 'Must include dissent summary');

    // Prove that swapped order fails (regression gate)
    view.update(d, rec, null, dataset, assumptions, ts, null, methods, verdictObj);
    const swappedRows = html.match(/<tr class="method-row-/g);
    assert.equal(swappedRows, null, 'Swapped arguments must produce 0 method rows (regression tripwire)');

    view.dispose();
  });

  test('createApp recalculation updates Summary tab with all 6 method rows and agreement verdict', async () => {
    const readFile = (p) => fs.promises.readFile(p, 'utf8');
    const dataset = await dataLayer.loadHistorical({ dir: './src/data/historical/', readText: readFile });
    const assumptions = await dataLayer.loadAssumptions({ location: './src/data/assumptions.json', readText: readFile });

    const { root, panes } = createTabRoot(['cover', 'assumptions', 'historicals', 'schedules', 'projections', 'valuation', 'summary', 'sensitivity']);
    const app = createApp({
      data: { loadHistorical: async () => dataset, loadAssumptions: async () => assumptions },
      engine: {},
      historical: dataset,
      assumptions,
      root,
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
    });

    const summaryPane = panes.find((p) => p.getAttribute('data-tab') === 'summary');
    const bootRows = summaryPane.innerHTML.match(/<tr class="method-row-/g);
    assert.equal(bootRows?.length, 6, `createApp post-boot must render 6 method rows, got ${bootRows?.length}`);
    assert.ok(summaryPane.innerHTML.includes('FAIR, no consensus'), 'Must render agreement verdict');

    // Trigger reactive recalculation
    app.setDriver('terminal_growth_rate', 0.025);
    const recalcRows = summaryPane.innerHTML.match(/<tr class="method-row-/g);
    assert.equal(recalcRows?.length, 6, `createApp post-recalculate must maintain 6 method rows, got ${recalcRows?.length}`);
    assert.ok(summaryPane.innerHTML.includes('FAIR, no consensus'), 'Must maintain agreement verdict post-recalculate');

    app.dispose();
  });
});
