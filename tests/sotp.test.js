/**
 * P8.2 SOTP Valuation Method Tests  -  Sum-of-the-Parts
 *
 * Covers:
 *  - Segment map asserts exactly TWO segments: Subscriptions (incl. ads) + DET.
 *  - Grep gate: zero AI-tutor surface anywhere in file or return object.
 *  - Fold disclosure: segment table footnote states advertising is folded into subscriptions.
 *  - DET constraint disclosure: DET valued at subscriptions-family multiple, no outside multiple imported.
 *  - EV / Forward Revenue 3-name median primary (SPOT 4.8191x, range [4.1018x, 6.8661x]).
 *  - EV / Forward EBITDAR sensitivity rendered alongside with peer margin dispersion disclosed.
 *  - Capitalized lease basis: capitalized net cash ($1,330,423k) -> implied per share (~$141.59).
 *  - Lease convention disclosure gate (R3).
 *  - Fail-closed validation on missing or malformed inputs.
 *  - Purity, immutability, zero bare numeric literals > 999 outside comments.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { valuateSotp } from '../src/engine/methods/sotp.js';
import { EngineError } from '../src/data/errors.js';

const PEERS_PATH = fileURLToPath(new URL('../src/data/historical/peers.json', import.meta.url));
const SOTP_SRC_PATH = fileURLToPath(new URL('../src/engine/methods/sotp.js', import.meta.url));

function loadPeers() {
  return JSON.parse(fs.readFileSync(PEERS_PATH, 'utf8'));
}

describe('P8.2  -  SOTP Valuation: Two Segments & Multiples', () => {
  test('segment map asserts exactly TWO segments with required disclosures and zero AI tutor surface', () => {
    const corpus = loadPeers();
    const duolInputs = {
      forwardRevenue: 1193853.52, // $k
      detRevenue: 41812.44, // $k
      forwardEbitdar: 177683.57, // $k
      netCashCapitalized: 1330423.0, // $k
      sharesOutstanding: 50031 * 1e3
    };

    const res = valuateSotp(corpus, duolInputs);

    // 1. Exactly TWO segments
    assert.equal(res.segmentCount, 2);
    const segKeys = Object.keys(res.segments);
    assert.deepEqual(segKeys, ['subscriptions', 'det']);

    // 2. Subscriptions segment fold disclosure
    const subs = res.segments.subscriptions;
    assert.ok(subs.name.includes('Subscriptions'));
    assert.ok(subs.name.includes('advertising'));
    assert.ok(/advertising \(folded per Director ruling #3\.i\)/i.test(subs.footnote));
    assert.ok(/in-app purchases \+ other revenue/i.test(subs.footnote));
    assert.ok(/two-segment mandate/i.test(subs.footnote));
    assert.ok(/1,152,041\.08k total/i.test(subs.footnote));

    // 3. DET row constraint disclosure
    const det = res.segments.det;
    assert.ok(det.name.includes('Duolingo English Test'));
    assert.ok(/subscriptions-family multiple/i.test(det.constraintDisclosure));
    assert.ok(/no separate DET peer group/i.test(det.constraintDisclosure));

    // 4. Grep gate: zero AI-tutor surface in source code or output JSON
    const srcCode = fs.readFileSync(SOTP_SRC_PATH, 'utf8');
    assert.doesNotMatch(srcCode, /ai[-_ ]?tutor/i, 'sotp.js must contain zero AI tutor mentions');

    const serializedRes = JSON.stringify(res);
    assert.doesNotMatch(serializedRes, /ai[-_ ]?tutor/i, 'SOTP output must contain zero AI tutor mentions');
  });

  test('SOTP segment valuations and implied per share match independent math', () => {
    const corpus = loadPeers();
    const totalForwardRevenue = 1193853.52; // $k
    const detRevenue = 41812.44; // $k
    const forwardEbitdar = 177683.57; // $k
    const netCashCapitalized = 1330423.0; // $k
    const sharesOutstanding = 50031 * 1e3;

    const res = valuateSotp(corpus, {
      forwardRevenue: totalForwardRevenue,
      detRevenue,
      forwardEbitdar,
      netCashCapitalized,
      sharesOutstanding
    });

    const expectedSubsRev = totalForwardRevenue - detRevenue;
    assert.equal(res.segments.subscriptions.forwardRevenue, expectedSubsRev);
    assert.equal(res.segments.det.forwardRevenue, detRevenue);

    // Primary multiple is EV/Forward Revenue 3-name median (SPOT)
    const spotRevMult = corpus.peers.SPOT.capitalizedEnterpriseValue / corpus.peers.SPOT.revenue.fyForward;
    assert.ok(Math.abs(res.medianMultiple - spotRevMult) < 1e-6);

    const expectedSubsEv = expectedSubsRev * res.medianMultiple;
    const expectedDetEv = detRevenue * res.medianMultiple;
    assert.ok(Math.abs(res.segments.subscriptions.enterpriseValue - expectedSubsEv) < 1e-4);
    assert.ok(Math.abs(res.segments.det.enterpriseValue - expectedDetEv) < 1e-4);

    const expectedEv = expectedSubsEv + expectedDetEv;
    assert.ok(Math.abs(res.impliedEnterpriseValue - expectedEv) < 1e-4);

    const expectedEquity = expectedEv + netCashCapitalized;
    assert.ok(Math.abs(res.impliedEquityValue - expectedEquity) < 1e-4);

    const expectedPerShare = (expectedEquity * 1e3) / sharesOutstanding;
    assert.ok(Math.abs(res.impliedPerShare - expectedPerShare) < 1e-4);
    assert.ok(Math.abs(res.impliedPerShare - 141.59) < 0.1);

    // Min-Max range across peer revenue multiples
    const minEv = totalForwardRevenue * res.multipleRange.min;
    const minPerShare = ((minEv + netCashCapitalized) * 1e3) / sharesOutstanding;
    const maxEv = totalForwardRevenue * res.multipleRange.max;
    const maxPerShare = ((maxEv + netCashCapitalized) * 1e3) / sharesOutstanding;
    assert.ok(Math.abs(res.rangePerShare.min - minPerShare) < 1e-4);
    assert.ok(Math.abs(res.rangePerShare.max - maxPerShare) < 1e-4);
  });

  test('renders EV / Forward EBITDAR sensitivity alongside primary with peer margin dispersion note', () => {
    const corpus = loadPeers();
    const duolInputs = {
      forwardRevenue: 1193853.52,
      detRevenue: 41812.44,
      forwardEbitdar: 177683.57,
      netCashCapitalized: 1330423.0,
      sharesOutstanding: 50031 * 1e3
    };

    const res = valuateSotp(corpus, duolInputs);

    assert.ok(res.sensitivity);
    assert.equal(res.sensitivity.metric, 'ev_forward_ebitdar');
    assert.ok(res.sensitivity.marginDispersionNote.includes('Margin dispersion'));

    // RBLX excluded
    assert.equal(res.sensitivity.peerMultiples.RBLX, null);
    assert.ok(res.sensitivity.exclusions.some(e => e.symbol === 'RBLX'));

    // Median of SPOT and NFLX
    const spotEbitdarMult = corpus.peers.SPOT.capitalizedEnterpriseValue / corpus.peers.SPOT.ebitdar.forward;
    const nflxEbitdarMult = corpus.peers.NFLX.capitalizedEnterpriseValue / corpus.peers.NFLX.ebitdar.forward;
    const expectedEbitdarMedian = (spotEbitdarMult + nflxEbitdarMult) / 2;
    assert.ok(Math.abs(res.sensitivity.medianMultiple - expectedEbitdarMedian) < 1e-6);

    const expectedSensEv = duolInputs.forwardEbitdar * res.sensitivity.medianMultiple;
    const expectedSensEquity = expectedSensEv + duolInputs.netCashCapitalized;
    const expectedSensPerShare = (expectedSensEquity * 1e3) / duolInputs.sharesOutstanding;
    assert.ok(Math.abs(res.sensitivity.impliedPerShare - expectedSensPerShare) < 1e-4);
    assert.ok(Math.abs(res.sensitivity.impliedPerShare - 116.20) < 0.1);
  });

  test('exports leaseConvention disclosure gate (R3)', () => {
    const corpus = loadPeers();
    const duolInputs = {
      forwardRevenue: 1193853.52,
      detRevenue: 41812.44,
      forwardEbitdar: 177683.57,
      netCashCapitalized: 1330423.0,
      sharesOutstanding: 50031 * 1e3
    };

    const res = valuateSotp(corpus, duolInputs);

    assert.ok(res.leaseConvention);
    assert.equal(res.leaseConvention.duolingoLeaseBasis, 'long_term_only');
    assert.ok(/long-term obligation/i.test(res.leaseConvention.note));
    assert.ok(/86,136k/i.test(res.leaseConvention.note));
    assert.ok(res.inputsProvenance.leaseConvention);
  });
});

describe('P8.2  -  SOTP Valuation: Fail-Closed & Purity', () => {
  test('fails closed on missing or invalid inputs', () => {
    const corpus = loadPeers();
    const validInputs = {
      forwardRevenue: 1193853.52,
      detRevenue: 41812.44,
      forwardEbitdar: 177683.57,
      netCashCapitalized: 1330423.0,
      sharesOutstanding: 50031 * 1e3
    };

    assert.throws(() => valuateSotp(null, validInputs), /peersCorpus is required/);
    assert.throws(() => valuateSotp({}, validInputs), /Missing required peer/);
    assert.throws(() => valuateSotp(corpus, null), /duolingoInputs is required/);
    assert.throws(() => valuateSotp(corpus, { ...validInputs, detRevenue: 0 }), /detRevenue must be a positive/);
    assert.throws(() => valuateSotp(corpus, { ...validInputs, detRevenue: -10 }), /detRevenue must be a positive/);
    assert.throws(() => valuateSotp(corpus, { ...validInputs, forwardRevenue: 10000, detRevenue: 20000 }), /forwardRevenue must be greater than detRevenue/);
    assert.throws(() => valuateSotp(corpus, { ...validInputs, forwardEbitdar: -1 }), /forwardEbitdar must be a positive/);
    assert.throws(() => valuateSotp(corpus, { ...validInputs, sharesOutstanding: 0 }), /sharesOutstanding must be a positive/);
    assert.throws(() => valuateSotp(corpus, { ...validInputs, netCashCapitalized: NaN }), /netCashCapitalized must be a finite/);
  });

  test('result object is deeply frozen', () => {
    const corpus = loadPeers();
    const res = valuateSotp(corpus, {
      forwardRevenue: 1193853.52,
      detRevenue: 41812.44,
      forwardEbitdar: 177683.57,
      netCashCapitalized: 1330423.0,
      sharesOutstanding: 50031 * 1e3
    });

    assert.ok(Object.isFrozen(res));
    assert.ok(Object.isFrozen(res.segments));
    assert.ok(Object.isFrozen(res.segments.subscriptions));
    assert.ok(Object.isFrozen(res.segments.det));
    assert.ok(Object.isFrozen(res.peerMultiples));
    assert.ok(Object.isFrozen(res.multipleRange));
    assert.ok(Object.isFrozen(res.rangePerShare));
    assert.ok(Object.isFrozen(res.sensitivity));
    assert.ok(Object.isFrozen(res.leaseConvention));
    assert.ok(Object.isFrozen(res.inputsProvenance));
  });

  test('zero bare numeric literals > 999 in source file', () => {
    let raw = fs.readFileSync(SOTP_SRC_PATH, 'utf8');
    raw = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
    const numberRegex = /(?<![a-zA-Z0-9_$])([1-9]\d{3,})(?![a-zA-Z0-9_$])/g;
    const matches = [];
    let m;
    while ((m = numberRegex.exec(raw)) !== null) {
      matches.push(m[1]);
    }
    assert.deepEqual(matches, [], `Unsanctioned bare numeric literals in sotp.js: ${matches.join(', ')}`);
  });
});
