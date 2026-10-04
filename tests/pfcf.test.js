/**
 * P8.1 P/FCF & FCF Yield Valuation Method Tests
 *
 * Covers:
 *  - Locked 3-peer set (SPOT, RBLX, NFLX) P/FCF and FCF Yield calculations.
 *  - 3-name median multiple and min-max span derivation.
 *  - Duolingo Implied Market Cap = DUOL TTM FCF × Peer Median P/FCF.
 *  - Duolingo Implied Per Share = Implied Market Cap ÷ Diluted Common Shares.
 *  - Fail-closed validation on missing or malformed inputs.
 *  - Purity, immutability, zero bare numeric literals > 999 outside comments.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { valuatePfcf } from '../src/engine/methods/pfcf.js';
import { EngineError } from '../src/data/errors.js';

const PEERS_PATH = fileURLToPath(new URL('../src/data/historical/peers.json', import.meta.url));
const PFCF_SRC_PATH = fileURLToPath(new URL('../src/engine/methods/pfcf.js', import.meta.url));

function loadPeers() {
  return JSON.parse(fs.readFileSync(PEERS_PATH, 'utf8'));
}

describe('P8.1  -  P/FCF & FCF Yield: Peer Multiples & 3-Name Median', () => {
  test('recomputes peer P/FCF and FCF Yield from cited market cap and TTM FCF', () => {
    const corpus = loadPeers();
    const duolInputs = {
      ttmFreeCashFlow: 397504.0, // $k ($430,548k OCF - $33,044k capex)
      sharesOutstanding: 50031000
    };

    const res = valuatePfcf(corpus, duolInputs);

    for (const sym of ['SPOT', 'RBLX', 'NFLX']) {
      const p = corpus.peers[sym];
      const expectedPfcf = p.marketCap / p.freeCashFlow.ttm;
      const expectedYield = p.freeCashFlow.ttm / p.marketCap;

      assert.ok(
        Math.abs(res.peerMultiples[sym] - expectedPfcf) < 1e-6,
        `${sym} P/FCF must match expected: ${res.peerMultiples[sym]} vs ${expectedPfcf}`
      );
      assert.ok(
        Math.abs(res.peerFcfYields[sym] - expectedYield) < 1e-6,
        `${sym} FCF Yield must match expected: ${res.peerFcfYields[sym]} vs ${expectedYield}`
      );
    }

    // Check sorted order: RBLX < SPOT < NFLX
    assert.ok(res.peerMultiples.RBLX < res.peerMultiples.SPOT);
    assert.ok(res.peerMultiples.SPOT < res.peerMultiples.NFLX);
    assert.equal(res.medianMultiple, res.peerMultiples.SPOT);
    assert.equal(res.multipleRange.min, res.peerMultiples.RBLX);
    assert.equal(res.multipleRange.max, res.peerMultiples.NFLX);
  });

  test('Duolingo valuation ties out from TTM FCF and peer median P/FCF', () => {
    const corpus = loadPeers();
    const ttmFreeCashFlow = 397504.0; // $k
    const sharesOutstanding = 50031000;

    const res = valuatePfcf(corpus, { ttmFreeCashFlow, sharesOutstanding });

    const expectedMarketCap = ttmFreeCashFlow * res.medianMultiple;
    assert.ok(Math.abs(res.impliedMarketCap - expectedMarketCap) < 1e-4);

    const expectedPerShare = (expectedMarketCap * 1e3) / sharesOutstanding;
    assert.ok(Math.abs(res.impliedPerShare - expectedPerShare) < 1e-4);

    // Verify min and max span
    const expectedMinPerShare = (ttmFreeCashFlow * res.multipleRange.min * 1e3) / sharesOutstanding;
    const expectedMaxPerShare = (ttmFreeCashFlow * res.multipleRange.max * 1e3) / sharesOutstanding;
    assert.ok(Math.abs(res.rangePerShare.min - expectedMinPerShare) < 1e-4);
    assert.ok(Math.abs(res.rangePerShare.max - expectedMaxPerShare) < 1e-4);
    assert.ok(res.rangePerShare.min < res.impliedPerShare);
    assert.ok(res.impliedPerShare < res.rangePerShare.max);

    // R3: Assert leaseConvention disclosure gate
    assert.ok(res.leaseConvention, 'Must export leaseConvention disclosure');
    assert.equal(res.leaseConvention.duolingoLeaseBasis, 'equity_level_flow');
    assert.ok(/equity free cash flows/i.test(res.leaseConvention.note));
    assert.ok(res.inputsProvenance.leaseConvention, 'inputsProvenance must include leaseConvention');
  });
});

describe('P8.1  -  P/FCF: Fail-Closed Discipline & Purity', () => {
  test('fails closed on missing or non-finite inputs', () => {
    const corpus = loadPeers();
    const validInputs = {
      ttmFreeCashFlow: 397504.0,
      sharesOutstanding: 50031000
    };

    assert.throws(() => valuatePfcf(null, validInputs), /peersCorpus is required/);
    assert.throws(() => valuatePfcf({}, validInputs), /Missing required peer/);
    assert.throws(() => valuatePfcf(corpus, null), /duolingoInputs is required/);
    assert.throws(() => valuatePfcf(corpus, { ...validInputs, ttmFreeCashFlow: -100 }), /ttmFreeCashFlow must be a positive/);
    assert.throws(() => valuatePfcf(corpus, { ...validInputs, ttmFreeCashFlow: 0 }), /ttmFreeCashFlow must be a positive/);
    assert.throws(() => valuatePfcf(corpus, { ...validInputs, sharesOutstanding: 0 }), /sharesOutstanding must be a positive/);
    assert.throws(() => valuatePfcf(corpus, { ...validInputs, sharesOutstanding: NaN }), /sharesOutstanding must be a positive/);
  });

  test('result contract is deeply frozen and pure', () => {
    const corpus = loadPeers();
    const res = valuatePfcf(corpus, {
      ttmFreeCashFlow: 397504.0,
      sharesOutstanding: 50031000
    });

    assert.ok(Object.isFrozen(res));
    assert.ok(Object.isFrozen(res.peerMultiples));
    assert.ok(Object.isFrozen(res.peerFcfYields));
    assert.ok(Object.isFrozen(res.multipleRange));
    assert.ok(Object.isFrozen(res.rangePerShare));
    assert.ok(Object.isFrozen(res.leaseConvention));
    assert.ok(Object.isFrozen(res.inputsProvenance));
  });

  test('quality gate: zero bare numeric literals > 999 outside comments in pfcf.js', () => {
    const code = fs.readFileSync(PFCF_SRC_PATH, 'utf8');
    const stripped = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const matches = [...stripped.matchAll(/(?<![a-zA-Z0-9_$])([1-9]\d{3,})(?![a-zA-Z0-9_$])/g)];
    assert.equal(matches.length, 0, `Found bare numeric literals in pfcf.js: ${matches.map(m => m[0]).join(', ')}`);
  });
});
