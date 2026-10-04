/**
 * Comps Valuation Method  -  EV / Forward Revenue
 *
 * Implements relative valuation based on the locked 3-peer set (SPOT, RBLX, NFLX)
 * on a capitalized lease basis per Phase 8 Director ruling #1, #6, #8, #9.
 *
 * Computes:
 *  - Peer EV / Forward Revenue multiples on capitalized lease basis.
 *  - 3-name median multiple and min-max dispersion range.
 *  - Duolingo Implied EV = DUOL Forward Revenue × Peer Median Multiple.
 *  - Duolingo Implied Equity Value = Implied EV + Capitalized Net Cash.
 *  - Duolingo Implied Per Share = Implied Equity Value ÷ Diluted Common Shares.
 *
 * Pure, deterministic, fail-closed, deeply frozen.
 */

import { EngineError } from '../../data/errors.js';
import { forwardBasisLabel } from './forwardBasis.js';

/**
 * Calculates 3-name median and min/max span.
 * @param {number[]} values
 * @returns {{ median: number, min: number, max: number }}
 */
function computeStats(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new EngineError('empty_stats', 'Cannot compute stats on empty array');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { median, min, max };
}

/**
 * Executes the EV / Forward Revenue Comps valuation method.
 *
 * @param {Object} peersCorpus - The peers object from peers.json
 * @param {Object} duolingoInputs - Duolingo forward figures and capital structure
 * @param {number} duolingoInputs.forwardRevenue - the corpus forward estimate period (FY2026E) explicit forecast revenue in $k
 * @param {number} duolingoInputs.netCashCapitalized - Capitalized net cash in $k (Cash + STI + LTI - Debt - LeaseLiabilities)
 * @param {number} duolingoInputs.sharesOutstanding - Diluted common shares count (e.g. 50,031,000)
 * @returns {Readonly<Object>} Frozen method contract
 */
export function valuateComps(peersCorpus, duolingoInputs) {
  if (!peersCorpus || typeof peersCorpus !== 'object') {
    throw new EngineError('missing_peers_corpus', 'peersCorpus is required');
  }

  const peers = peersCorpus.peers || peersCorpus;
  const symbols = ['SPOT', 'RBLX', 'NFLX'];

  for (const sym of symbols) {
    if (!peers[sym]) {
      throw new EngineError('missing_peer', `Missing required peer ${sym} in peer corpus`, sym);
    }

  }

  // P10.4 F1: derived from the corpus AFTER the peer-presence checks, so a
  // missing peer still reports the specific defect, and fail-closed if the peers
  // disagree on the estimate period or the label is an offset such as FY+1.
  const forwardBasis = forwardBasisLabel(peersCorpus);

  if (!duolingoInputs || typeof duolingoInputs !== 'object') {
    throw new EngineError('missing_duolingo_inputs', 'duolingoInputs is required');
  }

  const { forwardRevenue, netCashCapitalized, sharesOutstanding } = duolingoInputs;

  if (!Number.isFinite(forwardRevenue) || forwardRevenue <= 0) {
    throw new EngineError('invalid_forward_revenue', 'duolingo forwardRevenue must be a positive finite number');
  }
  if (!Number.isFinite(netCashCapitalized)) {
    throw new EngineError('invalid_net_cash', 'duolingo netCashCapitalized must be a finite number');
  }
  if (!Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
    throw new EngineError('invalid_shares', 'duolingo sharesOutstanding must be a positive finite number');
  }

  // Calculate peer EV / Forward Revenue multiples
  const peerMultiples = {};
  const multipleList = [];

  for (const sym of symbols) {
    const p = peers[sym];
    const ev = p.capitalizedEnterpriseValue;
    const fwdRev = p.revenue?.fyForward;

    if (!Number.isFinite(ev) || ev <= 0 || !Number.isFinite(fwdRev) || fwdRev <= 0) {
      throw new EngineError('invalid_peer_data', `Peer ${sym} has invalid EV or forward revenue`, sym);
    }

    const mult = ev / fwdRev;
    peerMultiples[sym] = mult;
    multipleList.push(mult);
  }

  const stats = computeStats(multipleList);

  // Duolingo valuation
  // Revenue is in $k; peer multiples are dimensionless; implied EV is in $k.
  const impliedEnterpriseValue = forwardRevenue * stats.median;
  const impliedEquityValue = impliedEnterpriseValue + netCashCapitalized;
  // sharesOutstanding is raw count (e.g. 50,031,000). Convert equity value $k to $: × 1000 ÷ shares.
  const impliedPerShare = (impliedEquityValue * 1e3) / sharesOutstanding;

  const minEv = forwardRevenue * stats.min;
  const minEquity = minEv + netCashCapitalized;
  const minPerShare = (minEquity * 1e3) / sharesOutstanding;

  const maxEv = forwardRevenue * stats.max;
  const maxEquity = maxEv + netCashCapitalized;
  const maxPerShare = (maxEquity * 1e3) / sharesOutstanding;

  const leaseConvention = Object.freeze({
    duolingoLeaseBasis: 'long_term_only',
    note: 'Duolingo operating lease liability reflects the long-term obligation ($86.136M / 86,136k) filed in Q2 Form 10-Q Note 9; current operating lease portion is folded into accrued expenses and not separately broken out in quarterly filings (~$7.204M in annual Form 10-K Note 9; ~$0.14/share materiality). Peers include both current and non-current lease liabilities.'
  });

  return Object.freeze({
    method: 'comps',
    label: 'EV / Forward Revenue (Comps)',
    // P10.4 F1: the label is read from the peer corpus, never typed here.
    // 'FY+1' was an offset rather than a period and disagreed with the
    // corpus, while rendering user-visibly.
    basis: forwardBasis,
    peerMultiples: Object.freeze({ ...peerMultiples }),
    medianMultiple: stats.median,
    multipleRange: Object.freeze({ min: stats.min, max: stats.max }),
    impliedEnterpriseValue,
    impliedEquityValue,
    impliedPerShare,
    rangePerShare: Object.freeze({ min: minPerShare, max: maxPerShare }),
    leaseConvention,
    inputsProvenance: Object.freeze({
      peersAsOf: peersCorpus.asOf || '',
      peerCount: symbols.length,
      peerSymbols: Object.freeze([...symbols]),
      forwardRevenue,
      netCashCapitalized,
      sharesOutstanding,
      leaseConvention: leaseConvention.note
    })
  });
}
