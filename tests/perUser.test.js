/**
 * P8.2 Per-User Valuation Method Tests  -  Per-User / Per-Subscriber
 *
 * Covers:
 *  - Three unblended native bases: Spotify (MAU), Roblox (DAU), Netflix (Paid Subs).
 *  - DUOL matching KPIs tied to cited corpus rows (MAU 133.1M, DAU 58.7M, Paid Subs 12.7M).
 *  - Capitalized lease basis: peer EV per user -> DUOL Implied EV + Net Cash ($1,330,423k) -> Implied Per Share.
 *  - Method vote = median of the three native bases ($443.68, Roblox DAU basis).
 *  - Min-max span rendered: [$348.12 (NFLX), $483.70 (SPOT)].
 *  - Lease convention disclosure gate (R3).
 *  - Fail-closed validation on missing or malformed inputs.
 *  - Purity, immutability, zero bare numeric literals > 999 outside comments.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { valuatePerUser } from '../src/engine/methods/perUser.js';
import { buildFullyDilutedSchedule } from '../src/engine/fullyDiluted.js';
import duolFullyDiluted from '../src/data/historical/duolFullyDiluted.json' with { type: 'json' };

const FD_SCHEDULE = buildFullyDilutedSchedule(duolFullyDiluted);
import { EngineError } from '../src/data/errors.js';

const PEERS_PATH = fileURLToPath(new URL('../src/data/historical/peers.json', import.meta.url));
const PER_USER_SRC_PATH = fileURLToPath(new URL('../src/engine/methods/perUser.js', import.meta.url));

function loadPeers() {
  return JSON.parse(fs.readFileSync(PEERS_PATH, 'utf8'));
}

describe('P8.2  -  Per-User Valuation: Three Native Bases & Median Vote', () => {
  test('renders three native bases unblended with peer EV/user and DUOL matching KPIs', () => {
    const corpus = loadPeers();
    const duolInputs = {
      kpis: {
        mau: 133.1e6, // 133,100,000 (FY2025 Form 10-K)
        dau: 58.7e6, // 58,700,000 (Q2 FY2026 Form 10-Q)
        paidSubscribers: 12.7e6 // 12,700,000 (Q2 FY2026 Form 10-Q)
      },
      netCashCapitalized: 1330423.0, // $k
      // P10.4 F3: the production denominator, not the EPS weighted average.
      sharesOutstanding: FD_SCHEDULE.denominator,
      arpuContext: {
        subscriptionArpu: '$6.71 / month ($80.50 / year driver-basis)',
        bookingsPerDau: '$21.98 / year ($1,158,425k FY2025 bookings ÷ 52.7M DAU)'
      }
    };

    const res = valuatePerUser(corpus, duolInputs);

    assert.equal(res.baseCount, 3);
    const baseKeys = Object.keys(res.bases);
    assert.deepEqual(baseKeys, ['spotify_mau', 'roblox_dau', 'netflix_paid_subs']);

    // 1. Spotify MAU basis
    const spotBasis = res.bases.spotify_mau;
    assert.equal(spotBasis.peer, 'SPOT');
    assert.equal(spotBasis.kpiMetric, 'mau');
    assert.equal(spotBasis.peerKpiValue, corpus.peers.SPOT.kpis.mau.value);
    const expectedSpotEvPerUser = (corpus.peers.SPOT.capitalizedEnterpriseValue * 1e6) / corpus.peers.SPOT.kpis.mau.value;
    assert.ok(Math.abs(spotBasis.evPerUser - expectedSpotEvPerUser) < 1e-4);
    // P10.7 F2 (ENTAILED, disclosed): SPOT short-term investments corrected from
    // EUR 1,047M to the filed EUR 3,450M, cutting SPOT capitalized EV by 2,739.42.
    // The Spotify EV/MAU basis therefore falls 394.63 -> 385.26. NFLX and RBLX are
    // unmoved, so the MEDIAN basis (Netflix) and the method vote at 347.91 stand.
    assert.ok(Math.abs(spotBasis.impliedPerShare - 385.26) < 0.1);
    assert.equal(spotBasis.arpuContext.peerArpu, corpus.peers.SPOT.kpis.arpu.display);
    assert.equal(spotBasis.arpuContext.duolArpu, duolInputs.arpuContext.subscriptionArpu);

    // 2. Roblox DAU basis
    const rblxBasis = res.bases.roblox_dau;
    assert.equal(rblxBasis.peer, 'RBLX');
    assert.equal(rblxBasis.kpiMetric, 'dau');
    assert.equal(rblxBasis.peerKpiValue, corpus.peers.RBLX.kpis.dau.value);
    // P10.4 F3: measured on the production fully diluted schedule.
    // P10.4 F3: on the production fully diluted schedule.
    const expectedRblxEvPerUser = (corpus.peers.RBLX.capitalizedEnterpriseValue * 1e6) / corpus.peers.RBLX.kpis.dau.value;
    assert.ok(Math.abs(rblxBasis.evPerUser - expectedRblxEvPerUser) < 1e-4);
    // RBLX is on its own disclosed fully diluted count (752m per the Q2 FY2026
    // 10-Q, accession 0001628280-26-051082) rather than 714.38m, which raises
    // the peer capitalised EV and therefore Duolingo's implied per-user value.
    assert.ok(Math.abs(rblxBasis.impliedPerShare - 310.77) < 0.1);
    assert.equal(rblxBasis.arpuContext.peerArpu, corpus.peers.RBLX.kpis.abpu.display);
    assert.equal(rblxBasis.arpuContext.duolArpu, duolInputs.arpuContext.bookingsPerDau);

    // 3. Netflix Paid Subs basis
    const nflxBasis = res.bases.netflix_paid_subs;
    assert.equal(nflxBasis.peer, 'NFLX');
    assert.equal(nflxBasis.kpiMetric, 'paid_subscribers');
    assert.equal(nflxBasis.peerKpiValue, corpus.peers.NFLX.kpis.paidMemberships.value);
    const expectedNflxEvPerUser = (corpus.peers.NFLX.capitalizedEnterpriseValue * 1e6) / corpus.peers.NFLX.kpis.paidMemberships.value;
    assert.ok(Math.abs(nflxBasis.evPerUser - expectedNflxEvPerUser) < 1e-4);
    assert.ok(Math.abs(nflxBasis.impliedPerShare - 347.91) < 0.1);
    assert.equal(nflxBasis.arpuContext.peerArpu, corpus.peers.NFLX.kpis.arm.display);
    assert.equal(nflxBasis.arpuContext.duolArpu, duolInputs.arpuContext.subscriptionArpu);

    // 4. Method vote = median of the three bases
    assert.equal(res.medianBasis, 'netflix_paid_subs');
    assert.ok(Math.abs(res.impliedPerShare - nflxBasis.impliedPerShare) < 1e-6);
    assert.ok(Math.abs(res.rangePerShare.min - rblxBasis.impliedPerShare) < 1e-6);
    assert.ok(Math.abs(res.rangePerShare.max - spotBasis.impliedPerShare) < 1e-6);
  });

  test('independent math verification: EV/user -> Implied EV -> Net Cash -> Per-Share', () => {
    const corpus = loadPeers();
    const netCashCapitalized = 1330423.0; // $k
    const sharesOutstanding = 50031 * 1e3;
    const duolKpis = {
      mau: 133.1e6,
      dau: 58.7e6,
      paidSubscribers: 12.7e6
    };

    const arpuContext = {
      subscriptionArpu: '$6.71 / month ($80.50 / year driver-basis)',
      bookingsPerDau: '$21.98 / year ($1,158,425k FY2025 bookings ÷ 52.7M DAU)'
    };

    const res = valuatePerUser(corpus, {
      kpis: duolKpis,
      netCashCapitalized,
      sharesOutstanding,
      arpuContext
    });

    for (const [key, basis] of Object.entries(res.bases)) {
      const peer = corpus.peers[basis.peer];
      const peerKpi = key === 'spotify_mau' ? peer.kpis.mau.value
        : key === 'roblox_dau' ? peer.kpis.dau.value
        : peer.kpis.paidMemberships.value;
      const duolKpi = key === 'spotify_mau' ? duolKpis.mau
        : key === 'roblox_dau' ? duolKpis.dau
        : duolKpis.paidSubscribers;

      const evThousand = peer.capitalizedEnterpriseValue * 1e3;
      const evPerUserDollar = (evThousand * 1e3) / peerKpi;
      assert.ok(Math.abs(basis.evPerUser - evPerUserDollar) < 1e-4);

      const expectedImpliedEv = (duolKpi * evPerUserDollar) / 1e3;
      assert.ok(Math.abs(basis.impliedEnterpriseValue - expectedImpliedEv) < 1e-4);

      const expectedEquity = expectedImpliedEv + netCashCapitalized;
      assert.ok(Math.abs(basis.impliedEquityValue - expectedEquity) < 1e-4);

      const expectedPerShare = (expectedEquity * 1e3) / sharesOutstanding;
      assert.ok(Math.abs(basis.impliedPerShare - expectedPerShare) < 1e-4);
    }
  });

  test('exports leaseConvention disclosure gate (R3)', () => {
    const corpus = loadPeers();
    const duolInputs = {
      kpis: {
        mau: 133.1e6,
        dau: 58.7e6,
        paidSubscribers: 12.7e6
      },
      netCashCapitalized: 1330423.0,
      // P10.4 F3: the production denominator, not the EPS weighted average.
      sharesOutstanding: FD_SCHEDULE.denominator,
      arpuContext: {
        subscriptionArpu: '$6.71 / month ($80.50 / year driver-basis)',
        bookingsPerDau: '$21.98 / year ($1,158,425k FY2025 bookings ÷ 52.7M DAU)'
      }
    };

    const res = valuatePerUser(corpus, duolInputs);

    assert.ok(res.leaseConvention);
    assert.equal(res.leaseConvention.duolingoLeaseBasis, 'long_term_only');
    assert.ok(/long-term obligation/i.test(res.leaseConvention.note));
    assert.ok(/86,136k/i.test(res.leaseConvention.note));
    assert.ok(res.inputsProvenance.leaseConvention);
  });
});

describe('P8.2  -  Per-User Valuation: Fail-Closed & Purity', () => {
  test('fails closed on missing or malformed inputs', () => {
    const corpus = loadPeers();
    const validInputs = {
      kpis: {
        mau: 133.1e6,
        dau: 58.7e6,
        paidSubscribers: 12.7e6
      },
      netCashCapitalized: 1330423.0,
      // P10.4 F3: the production denominator, not the EPS weighted average.
      sharesOutstanding: FD_SCHEDULE.denominator,
      arpuContext: {
        subscriptionArpu: '$6.71 / month ($80.50 / year driver-basis)',
        bookingsPerDau: '$21.98 / year ($1,158,425k FY2025 bookings ÷ 52.7M DAU)'
      }
    };

    assert.throws(() => valuatePerUser(null, validInputs), /peersCorpus is required/);
    assert.throws(() => valuatePerUser({}, validInputs), /Missing required peer/);
    assert.throws(() => valuatePerUser(corpus, null), /duolingoInputs is required/);
    assert.throws(() => valuatePerUser(corpus, { ...validInputs, kpis: null }), /kpis object is required/);
    assert.throws(() => valuatePerUser(corpus, { ...validInputs, kpis: { ...validInputs.kpis, mau: 0 } }), /mau must be a positive/);
    assert.throws(() => valuatePerUser(corpus, { ...validInputs, kpis: { ...validInputs.kpis, dau: -5 } }), /dau must be a positive/);
    assert.throws(() => valuatePerUser(corpus, { ...validInputs, kpis: { ...validInputs.kpis, paidSubscribers: NaN } }), /paidSubscribers must be a positive/);
    assert.throws(() => valuatePerUser(corpus, { ...validInputs, sharesOutstanding: 0 }), /sharesOutstanding must be a positive/);
    assert.throws(() => valuatePerUser(corpus, { ...validInputs, netCashCapitalized: Infinity }), /netCashCapitalized must be a finite/);
    assert.throws(() => valuatePerUser(corpus, { ...validInputs, arpuContext: null }), /arpuContext object is required/);
    assert.throws(() => valuatePerUser(corpus, { ...validInputs, arpuContext: { ...validInputs.arpuContext, subscriptionArpu: '' } }), /subscriptionArpu string is required/);
    assert.throws(() => valuatePerUser(corpus, { ...validInputs, arpuContext: { ...validInputs.arpuContext, bookingsPerDau: '   ' } }), /bookingsPerDau string is required/);
  });

  test('result object is deeply frozen', () => {
    const corpus = loadPeers();
    const res = valuatePerUser(corpus, {
      kpis: {
        mau: 133.1e6,
        dau: 58.7e6,
        paidSubscribers: 12.7e6
      },
      netCashCapitalized: 1330423.0,
      // P10.4 F3: the production denominator, not the EPS weighted average.
      sharesOutstanding: FD_SCHEDULE.denominator,
      arpuContext: {
        subscriptionArpu: '$6.71 / month ($80.50 / year driver-basis)',
        bookingsPerDau: '$21.98 / year ($1,158,425k FY2025 bookings ÷ 52.7M DAU)'
      }
    });

    assert.ok(Object.isFrozen(res));
    assert.ok(Object.isFrozen(res.bases));
    assert.ok(Object.isFrozen(res.bases.spotify_mau));
    assert.ok(Object.isFrozen(res.bases.roblox_dau));
    assert.ok(Object.isFrozen(res.bases.netflix_paid_subs));
    assert.ok(Object.isFrozen(res.rangePerShare));
    assert.ok(Object.isFrozen(res.leaseConvention));
    assert.ok(Object.isFrozen(res.inputsProvenance));
    assert.ok(Object.isFrozen(res.inputsProvenance.arpuContext));
  });

  test('zero bare numeric literals > 999 in source file', () => {
    let raw = fs.readFileSync(PER_USER_SRC_PATH, 'utf8');
    raw = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
    const numberRegex = /(?<![a-zA-Z0-9_$])([1-9]\d{3,})(?![a-zA-Z0-9_$])/g;
    const matches = [];
    let m;
    while ((m = numberRegex.exec(raw)) !== null) {
      matches.push(m[1]);
    }
    assert.deepEqual(matches, [], `Unsanctioned bare numeric literals in perUser.js: ${matches.join(', ')}`);
  });
});
