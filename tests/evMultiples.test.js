/**
 * P8.1 EV Multiples Valuation Method Tests  -  EV / Forward EBITDAR
 *
 * Covers:
 *  - Capitalized lease basis: operating lease liabilities into EV, rent expense add-back into EBITDAR.
 *  - End-to-end lease-basis consistency gate: recomputes peer EV/EBITDAR from cited raw figures.
 *  - Disclosure of exclusions: RBLX negative EBITDAR excluded from positive multiple median.
 *  - Median multiple and min-max span derivation across available positive peers.
 *  - Duolingo Implied EV -> Capitalized Net Cash -> Implied Equity Value -> Per-Share.
 *  - Fail-closed validation on missing or malformed inputs.
 *  - Purity, immutability, zero bare numeric literals > 999 outside comments.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { valuateEvMultiples } from '../src/engine/methods/evMultiples.js';
import { EngineError } from '../src/data/errors.js';

const PEERS_PATH = fileURLToPath(new URL('../src/data/historical/peers.json', import.meta.url));
const EV_SRC_PATH = fileURLToPath(new URL('../src/engine/methods/evMultiples.js', import.meta.url));

function loadPeers() {
  return JSON.parse(fs.readFileSync(PEERS_PATH, 'utf8'));
}

describe('P8.1  -  EV Multiples: Capitalized Lease Basis & EBITDAR', () => {
  test('recomputes peer capitalized EV and EBITDAR end-to-end from cited components', () => {
    const corpus = loadPeers();

    // End-to-end lease-basis consistency gate on NFLX:
    // EV = MarketCap ($344,156.80M) + SeniorDebt ($14,324M) + LeaseLiabilities ($2,330.40M) - Cash ($9,128M)
    const nflx = corpus.peers.NFLX;
    const computedNflxEv = nflx.marketCap + nflx.debt.total + nflx.operatingLeaseLiabilities.total - nflx.cash.total;
    assert.ok(Math.abs(computedNflxEv - nflx.capitalizedEnterpriseValue) < 1e-2);

    // EBITDAR = EBITDA ($14,727.41M) + Rent ($503.64M) = $15,231.05M
    const computedNflxEbitdar = nflx.ebitda.ttm + nflx.operatingLeaseCost.value;
    assert.ok(Math.abs(computedNflxEbitdar - nflx.ebitdar.ttm) < 1e-2);

    // End-to-end lease-basis consistency gate on SPOT:
    const spot = corpus.peers.SPOT;
    const computedSpotEv = spot.marketCap + spot.debt.total + spot.operatingLeaseLiabilities.total - spot.cash.total;
    assert.ok(Math.abs(computedSpotEv - spot.capitalizedEnterpriseValue) < 1e-2);
    const computedSpotEbitdar = spot.ebitda.ttm + spot.operatingLeaseCost.value;
    assert.ok(Math.abs(computedSpotEbitdar - spot.ebitdar.ttm) < 1e-2);
  });

  test('excludes RBLX due to negative EBITDAR and computes median across positive peers', () => {
    const corpus = loadPeers();
    const duolInputs = {
      forwardEbitdar: 177683.57, // $k ($165,612.57k EBITDA + $12,071.00k rent)
      netCashCapitalized: 1330423.0, // $k
      sharesOutstanding: 50031000
    };

    const res = valuateEvMultiples(corpus, duolInputs);

    assert.equal(res.peerMultiples.RBLX, null);
    assert.ok(res.exclusions.some(e => e.symbol === 'RBLX' && /negative/i.test(e.reason)));
    assert.ok(res.peerMultiples.SPOT > 0);
    assert.ok(res.peerMultiples.NFLX > 0);

    const valid = [res.peerMultiples.SPOT, res.peerMultiples.NFLX].sort((a, b) => a - b);
    const expectedMedian = (valid[0] + valid[1]) / 2;
    assert.ok(Math.abs(res.medianMultiple - expectedMedian) < 1e-6);
    assert.equal(res.multipleRange.min, valid[0]);
    assert.equal(res.multipleRange.max, valid[1]);
  });

  test('Duolingo valuation ties out from forward EBITDAR and capitalized net cash', () => {
    const corpus = loadPeers();
    const forwardEbitdar = 177683.57; // $k
    const netCashCapitalized = 1330423.0; // $k
    const sharesOutstanding = 50031000;

    const res = valuateEvMultiples(corpus, { forwardEbitdar, netCashCapitalized, sharesOutstanding });

    const expectedEv = forwardEbitdar * res.medianMultiple;
    assert.ok(Math.abs(res.impliedEnterpriseValue - expectedEv) < 1e-4);

    const expectedEquity = expectedEv + netCashCapitalized;
    assert.ok(Math.abs(res.impliedEquityValue - expectedEquity) < 1e-4);

    const expectedPerShare = (expectedEquity * 1e3) / sharesOutstanding;
    assert.ok(Math.abs(res.impliedPerShare - expectedPerShare) < 1e-4);

    // R3: Assert leaseConvention disclosure gate
    assert.ok(res.leaseConvention, 'Must export leaseConvention disclosure');
    assert.equal(res.leaseConvention.duolingoLeaseBasis, 'long_term_only');
    assert.ok(/long-term obligation/i.test(res.leaseConvention.note));
    assert.ok(/86,136k/i.test(res.leaseConvention.note));
    assert.ok(res.inputsProvenance.leaseConvention, 'inputsProvenance must include leaseConvention');
  });
});

describe('P8.1  -  EV Multiples: Fail-Closed Discipline & Purity', () => {
  test('fails closed on missing or non-finite inputs', () => {
    const corpus = loadPeers();
    const validInputs = {
      forwardEbitdar: 177683.57,
      netCashCapitalized: 1330423.0,
      sharesOutstanding: 50031000
    };

    assert.throws(() => valuateEvMultiples(null, validInputs), /peersCorpus is required/);
    assert.throws(() => valuateEvMultiples({}, validInputs), /Missing required peer/);
    assert.throws(() => valuateEvMultiples(corpus, null), /duolingoInputs is required/);
    assert.throws(() => valuateEvMultiples(corpus, { ...validInputs, forwardEbitdar: -50 }), /forwardEbitdar must be a positive/);
    assert.throws(() => valuateEvMultiples(corpus, { ...validInputs, forwardEbitdar: 0 }), /forwardEbitdar must be a positive/);
    assert.throws(() => valuateEvMultiples(corpus, { ...validInputs, sharesOutstanding: 0 }), /sharesOutstanding must be a positive/);
    assert.throws(() => valuateEvMultiples(corpus, { ...validInputs, netCashCapitalized: NaN }), /netCashCapitalized must be a finite/);
  });

  test('result contract is deeply frozen and pure', () => {
    const corpus = loadPeers();
    const res = valuateEvMultiples(corpus, {
      forwardEbitdar: 177683.57,
      netCashCapitalized: 1330423.0,
      sharesOutstanding: 50031000
    });

    assert.ok(Object.isFrozen(res));
    assert.ok(Object.isFrozen(res.peerMultiples));
    assert.ok(Object.isFrozen(res.multipleRange));
    assert.ok(Object.isFrozen(res.rangePerShare));
    assert.ok(Object.isFrozen(res.exclusions));
    assert.ok(Object.isFrozen(res.leaseConvention));
    assert.ok(Object.isFrozen(res.inputsProvenance));
  });

  test('quality gate: zero bare numeric literals > 999 outside comments in evMultiples.js', () => {
    const code = fs.readFileSync(EV_SRC_PATH, 'utf8');
    const stripped = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const matches = [...stripped.matchAll(/(?<![a-zA-Z0-9_$])([1-9]\d{3,})(?![a-zA-Z0-9_$])/g)];
    assert.equal(matches.length, 0, `Found bare numeric literals in evMultiples.js: ${matches.map(m => m[0]).join(', ')}`);
  });
});
