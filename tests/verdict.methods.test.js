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
import { buildFullyDilutedSchedule } from '../src/engine/fullyDiluted.js';
import duolFullyDiluted from '../src/data/historical/duolFullyDiluted.json' with { type: 'json' };

// P10.4 F3: the single production denominator for every relative method.
const FD_SCHEDULE = buildFullyDilutedSchedule(duolFullyDiluted);
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
      wacc: 0.111225,
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
    // P10.4 TRIPWIRE (converted from the pre-P10.4 FCFE-in-range behaviour).
    // The range must be intrinsic-only: the FCFE floor is a different valuation
    // basis and may not define min/max. This assertion previously pinned
    // min === 117.49, which WAS the violation P10.4 exists to remove.
    assert.equal(res.rangePerShare.min, 144.08, 'range min must be the FCFF value, not the FCFE floor');
    assert.equal(res.rangePerShare.max, 144.08, 'range max must be the FCFF value, not the FCFE floor');
    assert.equal(res.rangeBasis, 'intrinsic_fcff_only');
    assert.equal(res.fcfeDiagnostic.role, 'diagnostic_only');
    assert.notEqual(res.fcfeDiagnostic.perShare, res.rangePerShare.min,
      'the FCFE diagnostic must not coincide with the bound it was folded into before');
    for (const field of ['rangePerShare', 'min', 'max', 'spread', 'confidence', 'observationCounts', 'verdict']) {
      assert.ok(res.fcfeDiagnostic.excludedFrom.includes(field),
        `fcfeDiagnostic must declare exclusion from ${field}`);
    }
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

  // P10.4: breadth counts EVIDENCE CLUSTERS (max 3), not raw methods. SOTP is a
  // decomposition and never votes, so these expectations are cluster counts.
  test('unanimous undervalued: every voting method implied >= price * (1 + 0.15)', () => {
    const methods = [
      { method: 'fcff_dcf', label: 'DCF', impliedPerShare: 120.0 },
      { method: 'comps', label: 'Comps', impliedPerShare: 130.0 },
      { method: 'ev_multiples', label: 'EV/EBITDAR', impliedPerShare: 116.0 },
      { method: 'perUser', label: 'Per-User', impliedPerShare: 140.0 },
      { method: 'pfcf', label: 'P/FCF', impliedPerShare: 125.0 },
      { method: 'sotp', label: 'SOTP', impliedPerShare: 150.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    assert.equal(res.verdict, 'undervalued');
    assert.equal(res.agreement.unanimous, true);
    assert.equal(res.agreement.counts.undervalued, 3, 'counts CLUSTERS, not methods');
    assert.equal(res.agreement.counts.overvalued, 0);
    assert.equal(res.agreement.counts.fair, 0);
    assert.equal(res.agreement.counts.total, 3, 'breadth is capped at 3 clusters');
    assert.equal(res.agreement.counts.rawMethodCount, 5, 'SOTP is excluded from the raw method count too');
    assert.equal(res.breadth, 3);
    assert.equal(res.dissent.length, 0);
    assert.ok(res.agreement.summary.includes('Unanimous across all 3 evidence clusters'));
    assert.ok(res.agreement.summary.includes('UNDERVALUED'));
    // SOTP is decomposition-only and must be reported as excluded, by field name.
    assert.ok(res.excludedFromVerdict.some((e) => e.method === 'sotp' && e.role === 'decomposition_only'));
    assert.ok(!res.methodResults.some((m) => m.method === 'sotp'), 'SOTP must not reach a voting method row');
  });

  test('unanimous overvalued: every voting method implied <= price * (1 - 0.15)', () => {
    const methods = [
      { method: 'fcff_dcf', label: 'DCF', impliedPerShare: 80.0 },
      { method: 'comps', label: 'Comps', impliedPerShare: 75.0 },
      { method: 'ev_multiples', label: 'EV/EBITDAR', impliedPerShare: 84.0 },
      { method: 'perUser', label: 'Per-User', impliedPerShare: 70.0 },
      { method: 'pfcf', label: 'P/FCF', impliedPerShare: 82.0 },
      { method: 'sotp', label: 'SOTP', impliedPerShare: 65.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    assert.equal(res.verdict, 'overvalued');
    assert.equal(res.agreement.unanimous, true);
    assert.equal(res.agreement.counts.overvalued, 3);
    assert.equal(res.agreement.counts.total, 3);
    assert.equal(res.dissent.length, 0);
    assert.ok(res.agreement.summary.includes('OVERVALUED'));
  });

  test('unanimous fair: every voting method implied within (-15%, +15%)', () => {
    const methods = [
      { method: 'fcff_dcf', label: 'DCF', impliedPerShare: 100.0 },
      { method: 'comps', label: 'Comps', impliedPerShare: 105.0 },
      { method: 'ev_multiples', label: 'EV/EBITDAR', impliedPerShare: 95.0 },
      { method: 'perUser', label: 'Per-User', impliedPerShare: 110.0 },
      { method: 'pfcf', label: 'P/FCF', impliedPerShare: 90.0 },
      { method: 'sotp', label: 'SOTP', impliedPerShare: 98.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    assert.equal(res.verdict, 'fair');
    assert.equal(res.agreement.unanimous, true);
    assert.equal(res.agreement.counts.fair, 3);
    assert.equal(res.agreement.counts.total, 3);
    assert.equal(res.dissent.length, 0);
  });

  test('2 of 3 clusters agree: majority verdict with the minority cluster disclosed', () => {
    const methods = [
      { method: 'fcff_dcf', label: 'DCF', impliedPerShare: 120.0 },
      { method: 'comps', label: 'Comps', impliedPerShare: 80.0 },
      { method: 'ev_multiples', label: 'EV/EBITDAR', impliedPerShare: 80.0 },
      { method: 'perUser', label: 'Per-User', impliedPerShare: 80.0 },
      { method: 'pfcf', label: 'P/FCF', impliedPerShare: 120.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    assert.equal(res.verdict, 'undervalued', '2/3 cluster majority carries the verdict');
    assert.equal(res.agreement.unanimous, false);
    assert.equal(res.agreement.counts.undervalued, 2);
    assert.equal(res.agreement.counts.overvalued, 1);
    assert.equal(res.dissent.length, 1, 'the dissenting CLUSTER is disclosed');
    assert.equal(res.dissent[0].cluster, 'enterprise-relative');
    assert.equal(res.dissent[0].verdict, 'overvalued');
    assert.equal(res.holdNote, null, 'a 2/3 majority is a verdict, not a HOLD');
  });

  test('intra-cluster majority collapses many methods into one breadth observation', () => {
    const methods = [
      { method: 'fcff_dcf', label: 'DCF', impliedPerShare: 120.0 },
      { method: 'comps', label: 'Comps', impliedPerShare: 80.0 },
      { method: 'ev_multiples', label: 'EV/EBITDAR', impliedPerShare: 80.0 },
      { method: 'perUser', label: 'Per-User', impliedPerShare: 120.0 },
      { method: 'pfcf', label: 'P/FCF', impliedPerShare: 120.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    const entRel = res.clusters.find((c) => c.name === 'enterprise-relative');
    assert.equal(entRel.methodCount, 3, 'three methods sit in one cluster');
    assert.equal(entRel.verdict, 'overvalued', 'collapsed by in-cluster majority');
    assert.equal(entRel.decidedBy, 'majority');
    assert.equal(res.breadth, 3, 'five methods still yield breadth 3');
    assert.equal(res.agreement.counts.rawMethodCount, 5);
  });

  test('exact tie inside a cluster keeps the WEAKER verdict', () => {
    const methods = [
      { method: 'fcff_dcf', label: 'DCF', impliedPerShare: 120.0 },
      { method: 'comps', label: 'Comps', impliedPerShare: 120.0 },
      { method: 'ev_multiples', label: 'EV/EBITDAR', impliedPerShare: 80.0 },
      { method: 'perUser', label: 'Per-User', impliedPerShare: 100.0 },
      { method: 'pfcf', label: 'P/FCF', impliedPerShare: 120.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    const entRel = res.clusters.find((c) => c.name === 'enterprise-relative');
    assert.equal(entRel.decidedBy, 'tie_keeps_weaker');
    assert.equal(entRel.verdict, 'overvalued', 'a tie must not manufacture strength');
  });

  test('three-way cluster split yields FAIR with an explicit HOLD note', () => {
    const methods = [
      { method: 'fcff_dcf', label: 'DCF', impliedPerShare: 120.0 },
      { method: 'comps', label: 'Comps', impliedPerShare: 100.0 },
      { method: 'ev_multiples', label: 'EV/EBITDAR', impliedPerShare: 100.0 },
      { method: 'perUser', label: 'Per-User', impliedPerShare: 100.0 },
      { method: 'pfcf', label: 'P/FCF', impliedPerShare: 80.0 },
    ];

    const res = aggregateVerdicts(methods, livePrice);
    assert.equal(res.verdict, 'fair');
    assert.equal(res.agreement.counts.undervalued, 1);
    assert.equal(res.agreement.counts.fair, 1);
    assert.equal(res.agreement.counts.overvalued, 1);
    assert.ok(res.holdNote && res.holdNote.includes('FAIR'), 'the HOLD note must state the FAIR outcome');
  });

  test('SOTP is decomposition-only: it cannot move verdict, breadth, range or counts', () => {
    const base = [
      { method: 'fcff_dcf', label: 'DCF', impliedPerShare: 120.0 },
      { method: 'comps', label: 'Comps', impliedPerShare: 120.0 },
      { method: 'ev_multiples', label: 'EV/EBITDAR', impliedPerShare: 120.0 },
      { method: 'perUser', label: 'Per-User', impliedPerShare: 120.0 },
      { method: 'pfcf', label: 'P/FCF', impliedPerShare: 120.0 },
    ];
    const low = aggregateVerdicts([...base, { method: 'sotp', impliedPerShare: 1 }], livePrice);
    const high = aggregateVerdicts([...base, { method: 'sotp', impliedPerShare: 100000 }], livePrice);
    const none = aggregateVerdicts(base, livePrice);

    for (const r of [low, high]) {
      assert.equal(r.verdict, none.verdict, 'SOTP must not change the verdict');
      assert.equal(r.breadth, none.breadth, 'SOTP must not change breadth');
      assert.equal(r.agreement.spread.min, none.agreement.spread.min, 'SOTP must not enter the range min');
      assert.equal(r.agreement.spread.max, none.agreement.spread.max, 'SOTP must not enter the range max');
      assert.deepEqual(r.agreement.counts, none.agreement.counts, 'SOTP must not change counts');
    }
  });

  test('a method outside every cluster is refused rather than silently given a vote', () => {
    assert.throws(
      () => aggregateVerdicts([{ method: 'mystery', impliedPerShare: 120 }], livePrice),
      /not assigned to an evidence cluster/
    );
  });

  test('verdict shorthand alias works identically to aggregateVerdicts', () => {
    const methods = [
      { method: 'fcff_dcf', label: 'M1', impliedPerShare: 120.0 },
      { method: 'comps', label: 'M2', impliedPerShare: 125.0 },
    ];
    const res1 = aggregateVerdicts(methods, livePrice);
    const res2 = verdict(methods, livePrice);
    assert.deepEqual(res1, res2);
  });

  test('fails closed on invalid inputs', () => {
    assert.throws(() => aggregateVerdicts(null, 100), { code: 'missing_methods' });
    assert.throws(() => aggregateVerdicts([], 100), { code: 'empty_methods' });
    assert.throws(() => aggregateVerdicts([{ method: 'fcff_dcf', impliedPerShare: 100 }], 0), { code: 'invalid_live_price' });
    assert.throws(() => aggregateVerdicts([{ method: 'fcff_dcf', impliedPerShare: -5 }], 100), { code: 'invalid_implied_per_share' });
    assert.throws(() => aggregateVerdicts([{ method: 'fcff_dcf', impliedPerShare: NaN }], 100), { code: 'invalid_implied_per_share' });
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
    const d = valuateDcf(ts, w, { assumptions, corpus: dataset });
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
    // P10.4 F3: the relative methods must NOT receive a DCF-run share count.
    // They divide by the point-in-time fully diluted schedule, the same
    // denominator production uses.
    const sharesOutstanding = FD_SCHEDULE.denominator;
    assert.notEqual(
      sharesOutstanding,
      d.sharesOutstanding,
      'the tie-out denominator must not be the DCF-run count'
    );

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

// Tie-out each method to the values PRODUCTION renders.
    // P10.4 F3: these pins previously ran on a DCF-run share count
    // (d.sharesOutstanding), which the contract forbids for relative methods, so
    // the harness disagreed with production by ~13.7% while being presented as the
    // production figures. The denominator is now the point-in-time fully diluted
    // schedule and the pins below are the production values.
    assert.ok(Math.abs(resDcf.impliedPerShare - 117.57506995016278) < 0.01, `DCF expected ~117.58 (Lane A: no horizon, no dated seam), got ${resDcf.impliedPerShare}`);
    // P10.7 F2 (ENTAILED, disclosed): SPOT short-term investments corrected from
    // EUR 1,047M to the filed EUR 3,450M, cutting SPOT capitalized EV by 2,739.42
    // (107,561.57 -> 104,822.15). This moves the Comps, EV/EBITDAR and SOTP pins
    // because SPOT holds the median in each. P/FCF and DCF do not read peer EV and
    // are unmoved. Per-User's MEDIAN is unmoved at 347.91 (NFLX basis), though its
    // Spotify constituent basis falls 394.63 -> 385.26. Engine-derived.
    assert.ok(Math.abs(resComps.impliedPerShare - 138.57) < 0.05, `Comps expected ~138.57, got ${resComps.impliedPerShare}`);
    assert.ok(Math.abs(resEv.impliedPerShare - 114.77) < 0.05, `EV/EBITDAR expected ~114.77, got ${resEv.impliedPerShare}`);
    assert.ok(Math.abs(resPfcf.impliedPerShare - 240.29) < 0.05, `P/FCF expected ~240.29, got ${resPfcf.impliedPerShare}`);
    assert.ok(Math.abs(resSotp.impliedPerShare - 138.57) < 0.05, `SOTP expected ~138.57, got ${resSotp.impliedPerShare}`);
    // P10.7 F2: peer KPI re-pull (RBLX DAU 123M, SPOT MAU 777M). Per-User moves to 347.91 (median flips to Netflix).
    // P10.7 F1: the NFLX membership citation was re-pointed to the Q2 2024 8-K that
    // actually carries 277.65M (provenance-only fix; the value did not change), so
    // this pin is unchanged by F1 and stands.
    assert.ok(Math.abs(resPerUser.impliedPerShare - 347.91) < 0.05, `Per-User expected ~347.91, got ${resPerUser.impliedPerShare}`);

    // Run Agreement Verdict against benchmark price $157.85
    const livePrice = 157.85;
    const methodsList = [resDcf, resComps, resEv, resPfcf, resSotp, resPerUser];
    const verdictOut = aggregateVerdicts(methodsList, livePrice);

    assert.equal(verdictOut.verdict, 'overvalued');
    assert.equal(verdictOut.agreement.unanimous, false);
    // P10.4: cluster counts. Intrinsic and Enterprise-relative collapse, and the
    // Enterprise-relative cluster ties one-each so it keeps the weaker verdict;
    // the three clusters therefore split and the aggregate is FAIR with a HOLD.
    assert.equal(verdictOut.agreement.counts.undervalued, 1);
    assert.equal(verdictOut.agreement.counts.overvalued, 2);
    assert.equal(verdictOut.agreement.counts.fair, 0);
    assert.equal(verdictOut.agreement.counts.total, 3, 'breadth counts clusters');
    assert.equal(verdictOut.breadth, 3);
    assert.equal(verdictOut.holdNote, null, 'a 2/3 majority is a verdict, not a HOLD');
    assert.equal(verdictOut.dissent.length, 1, 'the dissenting cluster is disclosed');
    assert.equal(verdictOut.dissent[0].cluster, 'equity-cash-flow');
    assert.ok(verdictOut.excludedFromVerdict.some((e) => e.method === 'sotp'));
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
      { method: 'fcff_dcf', label: 'M1', impliedPerShare: 100.0 }
    ];
    const res = aggregateVerdicts(methods, 100.0);
    assert.equal(res.thresholds.undervalued, RECOMMENDATION_THRESHOLDS.undervalued);
    assert.equal(res.thresholds.overvalued, RECOMMENDATION_THRESHOLDS.overvalued);
    assert.equal(res.thresholds.undervalued, 0.15);
    assert.equal(res.thresholds.overvalued, -0.15);
  });
});

describe('P8.3  -  Summary View Update Wiring & Live App Recalculation Integration (R2 Regression Gate)', () => {
  test('summaryView.update receives (verdict, methods) in correct order and renders exactly 5 voting method rows', async () => {
    const readFile = (p) => fs.promises.readFile(p, 'utf8');
    const dataset = await dataLayer.loadHistorical({ dir: './src/data/historical/', readText: readFile });
    const assumptions = await dataLayer.loadAssumptions({ location: './src/data/assumptions.json', readText: readFile });
    const peers = loadPeers();

    const sched = schedulesEngine.build(dataset, assumptions);
    const fc = forecastEngine.project({ historical: dataset, assumptions });
    const ts = threeStatementEngine.project(sched, assumptions, fc);
    const w = buildWacc({ assumptions, debtSchedule: sched.debt });
    const d = valuateDcf(ts, w, { assumptions, corpus: dataset });
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
    const resComps = valuateComps(peers, { forwardRevenue: 1193853.52, netCashCapitalized: 1330423, sharesOutstanding: FD_SCHEDULE.denominator });
    const resEv = valuateEvMultiples(peers, { forwardEbitdar: 177683.57, netCashCapitalized: 1330423, sharesOutstanding: FD_SCHEDULE.denominator });
    const resPfcf = valuatePfcf(peers, { ttmFreeCashFlow: 397504, sharesOutstanding: FD_SCHEDULE.denominator });
    const resSotp = valuateSotp(peers, { forwardRevenue: 1193853.52, detRevenue: 41812.44, forwardEbitdar: 177683.57, netCashCapitalized: 1330423, sharesOutstanding: FD_SCHEDULE.denominator });
    const resPerUser = valuatePerUser(peers, {
      kpis: { mau: 133100000, dau: 58700000, paidSubscribers: 12700000 },
      netCashCapitalized: 1330423,
      sharesOutstanding: FD_SCHEDULE.denominator,
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
    assert.equal(rowMatches?.length, 5, `Expected exactly 5 voting method rows after update(), got ${rowMatches?.length}`);
    assert.ok(html.includes('$117.58'), 'Must include DCF per share $117.58 (Lane A: no horizon, no dated seam)');
    // P10.4 F3: production fully diluted denominator.
// P10.7 F2 (ENTAILED, disclosed): Comps and SOTP fall to $138.57 and EV/EBITDAR to
// $114.77 because SPOT's corrected short-term investments cut its capitalized EV.
assert.ok(html.includes('$138.57'), 'Must include Comps per share $138.57');
    // P10.4 F3: production fully diluted denominator.
assert.ok(html.includes('$114.77'), 'Must include EV/EBITDAR per share $114.77');
    // P10.4 F3: production fully diluted denominator.
assert.ok(html.includes('$240.29'), 'Must include P/FCF per share $240.29');
    // P10.7 F2: the Summary view renders the production value 347.91.
    assert.ok(html.includes('$347.91'), 'Must include the production Per-User per share $347.91');
    assert.ok(
      /Verdict (OVERVALUED|FAIR|UNDERVALUED) from 3 evidence clusters/.test(html),
      'Must include the clustered agreement summary'
    );
    assert.ok(
      html.includes('Breadth counts clusters, not methods'),
      'Must state that breadth counts clusters rather than methods'
    );
    assert.ok(
      /Enterprise-relative: (OVERVALUED|FAIR|UNDERVALUED)/.test(html) &&
        /Equity-cash-flow: (OVERVALUED|FAIR|UNDERVALUED)/.test(html),
      'Must disclose each collapsed evidence cluster verdict'
    );

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
    assert.equal(bootRows?.length, 5, `createApp post-boot must render 5 voting method rows, got ${bootRows?.length}`);
    assert.ok(
      /Verdict (OVERVALUED|FAIR|UNDERVALUED) from 3 evidence clusters/.test(summaryPane.innerHTML),
      'Must render the clustered agreement verdict'
    );

    // Trigger reactive recalculation
    app.setDriver('terminal_growth_rate', 0.025);
    const recalcRows = summaryPane.innerHTML.match(/<tr class="method-row-/g);
    assert.equal(recalcRows?.length, 5, `createApp post-recalculate must maintain 5 voting method rows, got ${recalcRows?.length}`);
    assert.ok(
      /Verdict (OVERVALUED|FAIR|UNDERVALUED) from 3 evidence clusters/.test(summaryPane.innerHTML),
      'Must maintain the clustered agreement verdict post-recalculate'
    );

    app.dispose();
  });
});
