/**
 * P8.1 Comps Valuation Method Tests  -  EV / Forward Revenue
 *
 * Covers:
 *  - Locked 3-peer set (SPOT, RBLX, NFLX) cited with asOf and 100% verified sources.
 *  - Currency honesty: SPOT forward revenue in USD ($22,320.02M) derived from €19.54B at TTM EUR/USD rate.
 *  - Peer EV / Forward Revenue multiple derivation on capitalized lease basis.
 *  - 3-name median multiple and min-max span derivation.
 *  - Duolingo Implied EV -> Capitalized Net Cash -> Implied Equity Value -> Per-Share (~$141.59).
 *  - Lease capitalization disclosure gate: verifies DUOL LT-only lease convention disclosure.
 *  - Fail-closed validation on missing or malformed inputs.
 *  - Purity, immutability, zero bare numeric literals > 999 outside comments.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { valuateComps } from '../src/engine/methods/comps.js';
import { EngineError } from '../src/data/errors.js';

const PEERS_PATH = fileURLToPath(new URL('../src/data/historical/peers.json', import.meta.url));
const COMPS_SRC_PATH = fileURLToPath(new URL('../src/engine/methods/comps.js', import.meta.url));

function loadPeers() {
  return JSON.parse(fs.readFileSync(PEERS_PATH, 'utf8'));
}

describe('P8.1  -  Comps Valuation: Peer Multiples & 3-Name Median', () => {
  test('peers.json contains locked three peers with 100% citations and asOf', () => {
    const corpus = loadPeers();
    assert.equal(corpus.peersCount, 3);
    assert.deepEqual(corpus.peerSymbols, ['SPOT', 'RBLX', 'NFLX']);

    for (const sym of corpus.peerSymbols) {
      const p = corpus.peers[sym];
      assert.ok(p, `Peer ${sym} must exist`);
      assert.ok(p.asOf, `Peer ${sym} must have asOf`);
      assert.ok(p.stockPrice > 0, `Peer ${sym} must have positive stock price`);
      assert.ok(p.sharesOutstanding > 0, `Peer ${sym} must have positive shares count`);
      assert.ok(p.marketCap > 0, `Peer ${sym} must have positive market cap`);
      assert.ok(p.capitalizedEnterpriseValue > 0, `Peer ${sym} must have positive capitalized EV`);
      assert.ok(p.revenue?.fyForward > 0, `Peer ${sym} must have positive forward revenue`);
      assert.ok(p.revenue?.source?.url, `Peer ${sym} forward revenue must have cited URL`);
      assert.ok(p.priceSource?.url, `Peer ${sym} price must have cited URL`);
    }

    // R1: Verify SPOT forward revenue currency honesty
    const spot = corpus.peers.SPOT;
    assert.equal(spot.revenue.fyForwardEur, 19540.0);
    assert.ok(Math.abs(spot.revenue.fyForward - 22320.02) < 0.1);
    assert.ok(/converted to USD/i.test(spot.revenue.source.notes));

    // R2: Verify SPOT EBITDA decomposition note
    assert.ok(spot.ebitda.source.notes.includes('3,030M') && spot.ebitda.source.notes.includes('34.85M'));
  });

  test('peer EV / Forward Revenue multiples match independent math within 1e-6', () => {
    const corpus = loadPeers();
    const duolInputs = {
      forwardRevenue: 1193853.52, // $k
      netCashCapitalized: 1330423.0, // $k
      sharesOutstanding: 50031000
    };

    const res = valuateComps(corpus, duolInputs);

    for (const sym of ['SPOT', 'RBLX', 'NFLX']) {
      const p = corpus.peers[sym];
      const expected = p.capitalizedEnterpriseValue / p.revenue.fyForward;
      assert.ok(
        Math.abs(res.peerMultiples[sym] - expected) < 1e-6,
        `${sym} EV/Rev multiple must match expected: ${res.peerMultiples[sym]} vs ${expected}`
      );
    }

    // Check sorted order and median: RBLX < SPOT < NFLX
    assert.ok(res.peerMultiples.RBLX < res.peerMultiples.SPOT);
    assert.ok(res.peerMultiples.SPOT < res.peerMultiples.NFLX);
    assert.equal(res.medianMultiple, res.peerMultiples.SPOT);
    assert.equal(res.multipleRange.min, res.peerMultiples.RBLX);
    assert.equal(res.multipleRange.max, res.peerMultiples.NFLX);
  });

  test('Duolingo valuation ties out on capitalized lease basis with disclosure gate (R3)', () => {
    const corpus = loadPeers();
    const forwardRevenue = 1193853.52; // $k (FY2026 explicit forecast)
    const netCashCapitalized = 1330423.0; // $k ($1,180,887k cash + $132,979k STI + $102,693k LTI - $86,136k leases)
    const sharesOutstanding = 50031000;

    const res = valuateComps(corpus, { forwardRevenue, netCashCapitalized, sharesOutstanding });

    const expectedEv = forwardRevenue * res.medianMultiple;
    assert.ok(Math.abs(res.impliedEnterpriseValue - expectedEv) < 1e-4);

    const expectedEquity = expectedEv + netCashCapitalized;
    assert.ok(Math.abs(res.impliedEquityValue - expectedEquity) < 1e-4);

    const expectedPerShare = (expectedEquity * 1e3) / sharesOutstanding;
    assert.ok(Math.abs(res.impliedPerShare - expectedPerShare) < 1e-4);
    // P10.7 F2 (ENTAILED, disclosed): SPOT short-term investments corrected from
    // EUR 1,047M to the filed EUR 3,450M (Q2 2026 interim balance sheet, Note 19),
    // lifting cash.total 7,962.90 -> 10,702.32 and cutting SPOT capitalized EV by
    // 2,739.42 (107,561.57 -> 104,822.15). SPOT's EV/FwdRev drops 4.8191x -> 4.6963x,
    // and SPOT remains the 3-name median, so the median multiple and this per-share
    // pin both fall. Derived from the live engine, not hand-typed.
    assert.ok(Math.abs(res.impliedPerShare - 138.66) < 0.1, `Expected ~$138.66, got ${res.impliedPerShare}`);

    // Verify min and max span
    const expectedMinPerShare = ((forwardRevenue * res.multipleRange.min + netCashCapitalized) * 1e3) / sharesOutstanding;
    const expectedMaxPerShare = ((forwardRevenue * res.multipleRange.max + netCashCapitalized) * 1e3) / sharesOutstanding;
    assert.ok(Math.abs(res.rangePerShare.min - expectedMinPerShare) < 1e-4);
    assert.ok(Math.abs(res.rangePerShare.max - expectedMaxPerShare) < 1e-4);
    assert.ok(res.rangePerShare.min < res.impliedPerShare);
    assert.ok(res.impliedPerShare < res.rangePerShare.max);

    // R3: Assert leaseConvention disclosure gate
    assert.ok(res.leaseConvention, 'Must export leaseConvention disclosure');
    assert.equal(res.leaseConvention.duolingoLeaseBasis, 'long_term_only');
    assert.ok(/long-term obligation/i.test(res.leaseConvention.note));
    assert.ok(/86,136k/i.test(res.leaseConvention.note));
    assert.ok(res.inputsProvenance.leaseConvention, 'inputsProvenance must include leaseConvention');
  });
});

describe('P8.1  -  Comps: Fail-Closed Discipline & Purity', () => {
  test('fails closed on missing or non-finite inputs', () => {
    const corpus = loadPeers();
    const validInputs = {
      forwardRevenue: 1193853.52,
      netCashCapitalized: 1330423.0,
      sharesOutstanding: 50031000
    };

    assert.throws(() => valuateComps(null, validInputs), /peersCorpus is required/);
    assert.throws(() => valuateComps({}, validInputs), /Missing required peer/);
    assert.throws(() => valuateComps(corpus, null), /duolingoInputs is required/);
    assert.throws(() => valuateComps(corpus, { ...validInputs, forwardRevenue: -100 }), /forwardRevenue must be a positive/);
    assert.throws(() => valuateComps(corpus, { ...validInputs, forwardRevenue: NaN }), /forwardRevenue must be a positive/);
    assert.throws(() => valuateComps(corpus, { ...validInputs, sharesOutstanding: 0 }), /sharesOutstanding must be a positive/);
    assert.throws(() => valuateComps(corpus, { ...validInputs, netCashCapitalized: Infinity }), /netCashCapitalized must be a finite/);
  });

  test('result contract is deeply frozen and pure', () => {
    const corpus = loadPeers();
    const res = valuateComps(corpus, {
      forwardRevenue: 1193853.52,
      netCashCapitalized: 1330423.0,
      sharesOutstanding: 50031000
    });

    assert.ok(Object.isFrozen(res));
    assert.ok(Object.isFrozen(res.peerMultiples));
    assert.ok(Object.isFrozen(res.multipleRange));
    assert.ok(Object.isFrozen(res.rangePerShare));
    assert.ok(Object.isFrozen(res.leaseConvention));
    assert.ok(Object.isFrozen(res.inputsProvenance));
  });

  test('quality gate: zero bare numeric literals > 999 outside comments in comps.js', () => {
    const code = fs.readFileSync(COMPS_SRC_PATH, 'utf8');
    const stripped = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const matches = [...stripped.matchAll(/(?<![a-zA-Z0-9_$])([1-9]\d{3,})(?![a-zA-Z0-9_$])/g)];
    assert.equal(matches.length, 0, `Found bare numeric literals in comps.js: ${matches.map(m => m[0]).join(', ')}`);
  });
});
