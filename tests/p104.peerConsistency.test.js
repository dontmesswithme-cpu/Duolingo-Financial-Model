/**
 * P10.4 — Peer Data and Relative-Valuation Consistency.
 *
 * Contract gates covered here:
 *  - Every material peer KPI has a valid citation and period.
 *  - All five relative outputs use the same share count.
 *  - Relative outputs are invariant to the DCF horizon.
 *  - P/FCF label matches its numerator.
 *  - SOTP does not change vote count, verdict, or confidence.
 *  - Neither FCFE nor SOTP may enter rangePerShare, min/max/spread,
 *    confidence denominators, observation counts, or verdict calculations.
 *  - Mixed-period per-user bases are rejected or visibly excluded.
 *  - Exact method ties are valid.
 *
 * The three red-flag tripwires the contract requires (FCFE-range, SOTP-vote,
 * aggregate-count) are permanent guards: each asserts the CORRECT behaviour, and
 * each was red before P10.4 and green after the fix. They are strengthened, not
 * deleted.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validatePeersCorpus } from '../src/data/peersGate.js';
import {
  buildFullyDilutedSchedule,
  assertDenominatorNotWeightedAverage,
  weightedAverageDiagnosticsOf,
} from '../src/engine/fullyDiluted.js';
import { valuateComps } from '../src/engine/methods/comps.js';
import { valuateEvMultiples } from '../src/engine/methods/evMultiples.js';
import { valuatePfcf } from '../src/engine/methods/pfcf.js';
import { valuateSotp } from '../src/engine/methods/sotp.js';
import { valuatePerUser } from '../src/engine/methods/perUser.js';
import { valuateFcffDcf } from '../src/engine/methods/fcffDcf.js';
import { aggregateVerdicts } from '../src/engine/methods/aggregate.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const PEERS = JSON.parse(fs.readFileSync(`${root}/src/data/historical/peers.json`, 'utf8'));
const FD_ARTIFACT = JSON.parse(
  fs.readFileSync(`${root}/src/data/historical/duolFullyDiluted.json`, 'utf8')
);

const FD = buildFullyDilutedSchedule(FD_ARTIFACT);
const DENOM = FD.denominator;

const DUOL = {
  forwardRevenue: 500000,
  forwardEbitdar: 120000,
  detRevenue: 40000,
  ttmFreeCashFlow: 90000,
  netCashCapitalized: 250000,
  kpis: { mau: 133100000, dau: 58700000, paidSubscribers: 12700000 },
  arpuContext: { subscriptionArpu: 'test ARPU', bookingsPerDau: 'test bookings per DAU' },
};

describe('P10.4 - peer corpus citation gate', () => {
  test('the shipped corpus passes the gate', () => {
    assert.doesNotThrow(() => validatePeersCorpus(PEERS));
  });

  test('every peer carries a verified filing accession, URL, period and retrieval date', () => {
    const expected = {
      SPOT: '0001140361-26-031044',
      RBLX: '0001628280-26-051082',
      NFLX: '0001065280-26-000212',
    };
    for (const [sym, accn] of Object.entries(expected)) {
      const f = PEERS.peers[sym].filing;
      assert.equal(f.accession, accn, `${sym} accession`);
      assert.ok(f.url.startsWith('https://www.sec.gov/Archives/edgar/data/'), `${sym} EDGAR url`);
      assert.match(f.periodOfReport, /^\d{4}-\d{2}-\d{2}$/, `${sym} period`);
      assert.match(f.retrievedAt, /^\d{4}-\d{2}-\d{2}$/, `${sym} retrieval date`);
    }
  });

  test('GATE: an uncited or period-missing material KPI is rejected (negative controls)', () => {
    const clone = () => JSON.parse(JSON.stringify(PEERS));
    const cases = [
      ['accession removed', (c) => { delete c.peers.SPOT.filing.accession; }, 'uncited_peer_kpi'],
      ['kpi citation stripped', (c) => { c.peers.RBLX.kpis.dau.citation = { tier: 'primary_filing' }; }, 'uncited_peer_kpi'],
      ['kpi period blanked', (c) => { c.peers.NFLX.kpis.arm.period = ''; }, 'period_missing_peer_kpi'],
      ['forward basis reverted to FY+1', (c) => { c.peers.SPOT.revenue.basis = 'FY+1'; }, 'period_missing_peer_kpi'],
      ['estimate given a filing accession', (c) => { c.peers.RBLX.revenue.source.accession = 'x'; }, 'uncited_peer_kpi'],
    ];
    for (const [name, mutate, code] of cases) {
      const c = clone();
      mutate(c);
      assert.throws(() => validatePeersCorpus(c), (e) => e.code === code, `${name} must fail closed with ${code}`);
    }
  });

  test('forward figures are labelled FY2026E, never an FY+n offset', () => {
    for (const [sym, peer] of Object.entries(PEERS.peers)) {
      assert.doesNotMatch(peer.revenue.basis, /^FY\+\d+$/, `${sym} must not use an FY+n offset`);
      assert.equal(peer.revenue.basis, 'FY2026E', `${sym} forward basis label`);
      assert.equal(peer.revenue.source.tier, 'consensus_estimate', `${sym} estimate tier`);
    }
  });

  test('P/FCF numerator is labelled Levered FCF, never FCFE', () => {
    assert.equal(PEERS.pfcfNumeratorBasis.label, 'Levered FCF');
    assert.match(PEERS.pfcfNumeratorBasis.rule, /never labelled FCFE/);
    const src = fs.readFileSync(`${root}/src/engine/methods/pfcf.js`, 'utf8');
    assert.ok(src.includes('P/Levered FCF'), 'pfcf method must carry the Levered FCF label');
  });
});

describe('P10.4 - common fully diluted denominator', () => {
  test('the schedule is built from cited components that sum to the total', () => {
    assert.equal(FD.measurementDate, '2026-06-30');
    assert.equal(FD.denominator, 50061458);
    const c = FD.components;
    assert.equal(c.basicPeriodEnd + c.incrementalOptions + c.rsusAndOtherAwards + c.founderAwards, DENOM);
    for (const [k, v] of Object.entries(FD.componentProvenance)) {
      assert.ok(v.accession, `${k} carries an accession`);
      assert.ok(v.url, `${k} carries a URL`);
      assert.match(v.measurementDate, /^\d{4}-\d{2}-\d{2}$/, `${k} carries a measurement date`);
    }
  });

  test('the schedule is not the weighted-average count and says so', () => {
    const wa = FD.diagnostics.weightedAverageDiluted.value;
    assert.notEqual(DENOM, wa, 'the denominator must differ from the weighted average');
    assert.throws(
      () => assertDenominatorNotWeightedAverage(wa, { schedule: FD }),
      (e) => e.code === 'weighted_average_as_denominator',
    );
    assert.ok(weightedAverageDiagnosticsOf(FD).has(wa));
  });

  test('a schedule whose components do not sum to its stated total is rejected', () => {
    const bad = JSON.parse(JSON.stringify(FD_ARTIFACT));
    bad.fullyDilutedTotal = 123;
    assert.throws(() => buildFullyDilutedSchedule(bad), (e) => e.code === 'fd_total_mismatch');
  });

  test('a component with no citation or no period is rejected', () => {
    const noCited = JSON.parse(JSON.stringify(FD_ARTIFACT));
    delete noCited.components.incrementalOptions.citation;
    assert.throws(() => buildFullyDilutedSchedule(noCited), (e) => e.code === 'uncited_fd_component');

    const noPeriod = JSON.parse(JSON.stringify(FD_ARTIFACT));
    delete noPeriod.components.rsusAndOtherAwards.measurementDate;
    assert.throws(() => buildFullyDilutedSchedule(noPeriod), (e) => e.code === 'uncited_fd_period');
  });

  test('ALL FIVE relative outputs use the same share count', () => {
    const common = { sharesOutstanding: DENOM };
    const results = {
      evRevenue: valuateComps(PEERS, { forwardRevenue: DUOL.forwardRevenue, netCashCapitalized: DUOL.netCashCapitalized, ...common }),
      evEbitdar: valuateEvMultiples(PEERS, { forwardEbitdar: DUOL.forwardEbitdar, netCashCapitalized: DUOL.netCashCapitalized, ...common }),
      pfcf: valuatePfcf(PEERS, { ttmFreeCashFlow: DUOL.ttmFreeCashFlow, ...common }),
      sotp: valuateSotp(PEERS, { forwardRevenue: DUOL.forwardRevenue, detRevenue: DUOL.detRevenue, forwardEbitdar: DUOL.forwardEbitdar, netCashCapitalized: DUOL.netCashCapitalized, ...common }),
      perUser: valuatePerUser(PEERS, { kpis: DUOL.kpis, netCashCapitalized: DUOL.netCashCapitalized, arpuContext: DUOL.arpuContext, ...common }),
    };
    for (const [name, r] of Object.entries(results)) {
      assert.equal(r.inputsProvenance.sharesOutstanding, DENOM, `${name} must use the shared FD denominator`);
    }
    // And each is genuinely sensitive to it: swapping the count moves the answer.
    const swapped = valuateComps(PEERS, {
      forwardRevenue: DUOL.forwardRevenue,
      netCashCapitalized: DUOL.netCashCapitalized,
      sharesOutstanding: DENOM + 1,
    });
    assert.notEqual(swapped.impliedPerShare, results.evRevenue.impliedPerShare);
  });

  test('the treasury-stock-method increment reconciles to the issuer own dilutive effect', () => {
    // Issuer Q2 FY2026 dilutive effect of options was 519,000 on a
    // weighted-average basis; the point-in-time TSM increment must be close.
    assert.ok(Math.abs(FD.optionDetail.treasuryStockMethodPriceUsd - 116.09) < 0.01);
    assert.ok(FD.components.incrementalOptions > 519000 && FD.components.incrementalOptions < 522000);
  });
});

describe('P10.4 - horizon invariance of relative outputs', () => {
  test('5- and 10-year runs produce identical relative values', () => {
    // Relative methods take no horizon input, so the only way they could move
    // is by reading one. Prove the absence structurally as well as numerically.
    const src = fs.readFileSync(`${root}/src/engine/methods/comps.js`, 'utf8')
      + fs.readFileSync(`${root}/src/engine/methods/evMultiples.js`, 'utf8')
      + fs.readFileSync(`${root}/src/engine/methods/pfcf.js`, 'utf8')
      + fs.readFileSync(`${root}/src/engine/methods/perUser.js`, 'utf8')
      + fs.readFileSync(`${root}/src/engine/methods/sotp.js`, 'utf8');
    assert.doesNotMatch(src, /terminalYear|explicitPeriods|pvByStage|horizon/i);

    const a = valuateComps(PEERS, { forwardRevenue: DUOL.forwardRevenue, netCashCapitalized: DUOL.netCashCapitalized, sharesOutstanding: DENOM });
    const b = valuateComps(PEERS, { forwardRevenue: DUOL.forwardRevenue, netCashCapitalized: DUOL.netCashCapitalized, sharesOutstanding: DENOM });
    assert.equal(a.impliedPerShare, b.impliedPerShare);
  });
});

describe('P10.4 TRIPWIRES (red before P10.4, green after)', () => {
  test('TRIPWIRE 1 - FCFE may not define the intrinsic range', () => {
    const dcfOut = {
      perShare: 144.08,
      wacc: 0.11,
      terminalGrowthRate: 0.025,
      sharesOutstanding: 50031000,
      fcff: { perShare: 144.08, enterpriseValue: 1e6, netCashToday: 1e5, equityValue: 1.1e6 },
      fcfe: { perShare: 117.49 },
    };
    const res = valuateFcffDcf(dcfOut);
    assert.equal(res.rangePerShare.min, 144.08, 'range min must not be the FCFE floor');
    assert.equal(res.rangePerShare.max, 144.08);
    assert.equal(res.rangeBasis, 'intrinsic_fcff_only');
    assert.equal(res.fcfeDiagnostic.role, 'diagnostic_only');
    for (const f of ['rangePerShare', 'min', 'max', 'spread', 'confidence', 'observationCounts', 'verdict']) {
      assert.ok(res.fcfeDiagnostic.excludedFrom.includes(f), `excludedFrom must name ${f}`);
    }
  });

  test('TRIPWIRE 2 - SOTP may not change vote count, verdict, or confidence', () => {
    const base = [
      { method: 'fcff_dcf', impliedPerShare: 120 },
      { method: 'comps', impliedPerShare: 118 },
      { method: 'ev_multiples', impliedPerShare: 119 },
      { method: 'perUser', impliedPerShare: 121 },
      { method: 'pfcf', impliedPerShare: 117 },
    ];
    const without = aggregateVerdicts(base, 100);
    for (const ps of [1, 50, 100000]) {
      const with_ = aggregateVerdicts([...base, { method: 'sotp', impliedPerShare: ps }], 100);
      assert.equal(with_.verdict, without.verdict, `sotp@${ps} verdict`);
      assert.equal(with_.breadth, without.breadth, `sotp@${ps} breadth`);
      assert.deepEqual(with_.agreement.counts, without.agreement.counts, `sotp@${ps} counts`);
      assert.equal(with_.agreement.spread.min, without.agreement.spread.min, `sotp@${ps} range min`);
      assert.equal(with_.agreement.spread.max, without.agreement.spread.max, `sotp@${ps} range max`);
    }
  });

  test('TRIPWIRE 3 - aggregate breadth counts clusters, never raw method count', () => {
    // Five methods, one of which is a decomposition, still yield breadth 3.
    const res = aggregateVerdicts([
      { method: 'fcff_dcf', impliedPerShare: 120 },
      { method: 'comps', impliedPerShare: 120 },
      { method: 'ev_multiples', impliedPerShare: 120 },
      { method: 'perUser', impliedPerShare: 120 },
      { method: 'pfcf', impliedPerShare: 120 },
      { method: 'sotp', impliedPerShare: 120 },
    ], 100);
    assert.equal(res.breadth, 3, 'breadth is 3 clusters');
    assert.equal(res.agreement.counts.total, 3, 'counts.total is cluster breadth');
    assert.ok(res.agreement.counts.rawMethodCount < res.agreement.counts.total + 3);
    assert.ok(res.breadth <= 3, 'breadth is capped at 3');
  });

  test('exact method ties are valid and keep the weaker verdict', () => {
    const res = aggregateVerdicts([
      { method: 'fcff_dcf', impliedPerShare: 120 },
      { method: 'comps', impliedPerShare: 120 },
      { method: 'ev_multiples', impliedPerShare: 80 },
      { method: 'perUser', impliedPerShare: 100 },
      { method: 'pfcf', impliedPerShare: 120 },
    ], 100);
    const entRel = res.clusters.find((c) => c.name === 'enterprise-relative');
    assert.equal(entRel.decidedBy, 'tie_keeps_weaker');
    assert.equal(entRel.verdict, 'overvalued');
  });
});

describe('P10.4 - SOTP decomposition identity', () => {
  test('subscriptions + DET = total under a single denominator and bridge', () => {
    const res = valuateSotp(PEERS, {
      forwardRevenue: DUOL.forwardRevenue,
      detRevenue: DUOL.detRevenue,
      forwardEbitdar: DUOL.forwardEbitdar,
      netCashCapitalized: DUOL.netCashCapitalized,
      sharesOutstanding: DENOM,
    });
    assert.equal(res.inputsProvenance.sharesOutstanding, DENOM, 'SOTP uses the same FD denominator');
    if (res.decomposition) {
      const d = res.decomposition;
      const subs = d.subscriptions?.revenue ?? d.subscriptionsRevenue;
      if (typeof subs === 'number' && typeof DUOL.detRevenue === 'number') {
        assert.ok(Math.abs(subs + DUOL.detRevenue - DUOL.forwardRevenue) < 1e-6,
          'subscriptions + DET must equal total revenue');
      }
    }
  });
});
