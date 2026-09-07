/**
 * EV Multiples Valuation Method  -  EV / Forward EBITDAR
 *
 * Implements relative valuation based on the locked 3-peer set (SPOT, RBLX, NFLX)
 * on a capitalized lease basis per Phase 8 Director ruling #1, #6, #8, #9.
 *
 * Computes:
 *  - Peer EV / Forward EBITDAR multiples on capitalized lease basis.
 *  - Discloses margin dispersion and exclusions (e.g. Roblox negative EBITDAR).
 *  - Computes peer median multiple and min-max dispersion range.
 *  - Duolingo Implied EV = DUOL Forward EBITDAR × Peer Median Multiple.
 *  - Duolingo Implied Equity Value = Implied EV + Capitalized Net Cash.
 *  - Duolingo Implied Per Share = Implied Equity Value ÷ Diluted Common Shares.
 *
 * Pure, deterministic, fail-closed, deeply frozen.
 */

import { EngineError } from '../../data/errors.js';

/**
 * Calculates median and min/max span for an array of positive numbers.
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
 * Executes the EV / Forward EBITDAR Comps valuation method.
 *
 * @param {Object} peersCorpus - The peers object from peers.json
 * @param {Object} duolingoInputs - Duolingo forward figures and capital structure
 * @param {number} duolingoInputs.forwardEbitdar - FY+1 explicit forecast EBITDAR in $k (EBITDA + rent)
 * @param {number} duolingoInputs.netCashCapitalized - Capitalized net cash in $k (Cash + STI + LTI - Debt - LeaseLiabilities)
 * @param {number} duolingoInputs.sharesOutstanding - Diluted common shares count (e.g. 50,031,000)
 * @returns {Readonly<Object>} Frozen method contract
 */
export function valuateEvMultiples(peersCorpus, duolingoInputs) {
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

  if (!duolingoInputs || typeof duolingoInputs !== 'object') {
    throw new EngineError('missing_duolingo_inputs', 'duolingoInputs is required');
  }

  const { forwardEbitdar, netCashCapitalized, sharesOutstanding } = duolingoInputs;

  if (!Number.isFinite(forwardEbitdar) || forwardEbitdar <= 0) {
    throw new EngineError('invalid_forward_ebitdar', 'duolingo forwardEbitdar must be a positive finite number');
  }
  if (!Number.isFinite(netCashCapitalized)) {
    throw new EngineError('invalid_net_cash', 'duolingo netCashCapitalized must be a finite number');
  }
  if (!Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
    throw new EngineError('invalid_shares', 'duolingo sharesOutstanding must be a positive finite number');
  }

  // Calculate peer EV / EBITDAR multiples
  const peerMultiples = {};
  const validMultiples = [];
  const exclusions = [];

  for (const sym of symbols) {
    const p = peers[sym];
    const ev = p.capitalizedEnterpriseValue;
    const ebitdarForward = p.ebitdar?.forward ?? p.ebitdar?.ttm;
    const isNegative = p.ebitdar?.isNegative || (Number.isFinite(ebitdarForward) && ebitdarForward <= 0);

    if (isNegative || !Number.isFinite(ebitdarForward) || ebitdarForward <= 0) {
      peerMultiples[sym] = null;
      exclusions.push({
        symbol: sym,
        reason: 'Negative or non-meaningful EBITDAR'
      });
      continue;
    }

    if (!Number.isFinite(ev) || ev <= 0) {
      throw new EngineError('invalid_peer_data', `Peer ${sym} has invalid enterprise value`, sym);
    }

    const mult = ev / ebitdarForward;
    peerMultiples[sym] = mult;
    validMultiples.push(mult);
  }

  if (validMultiples.length === 0) {
    throw new EngineError('no_positive_multiples', 'No valid positive peer EBITDAR multiples found');
  }

  const stats = computeStats(validMultiples);

  // Duolingo valuation
  const impliedEnterpriseValue = forwardEbitdar * stats.median;
  const impliedEquityValue = impliedEnterpriseValue + netCashCapitalized;
  const impliedPerShare = (impliedEquityValue * 1e3) / sharesOutstanding;

  const minEv = forwardEbitdar * stats.min;
  const minEquity = minEv + netCashCapitalized;
  const minPerShare = (minEquity * 1e3) / sharesOutstanding;

  const maxEv = forwardEbitdar * stats.max;
  const maxEquity = maxEv + netCashCapitalized;
  const maxPerShare = (maxEquity * 1e3) / sharesOutstanding;

  const leaseConvention = Object.freeze({
    duolingoLeaseBasis: 'long_term_only',
    note: 'Duolingo operating lease liability reflects the long-term obligation ($86.136M / 86,136k) filed in Q2 Form 10-Q Note 9; current operating lease portion is folded into accrued expenses and not separately broken out in quarterly filings (~$7.204M in annual Form 10-K Note 9; ~$0.14/share materiality). Peers include both current and non-current lease liabilities.'
  });

  return Object.freeze({
    method: 'ev_multiples',
    label: 'EV / Forward EBITDAR (Comps)',
    basis: 'FY+1',
    peerMultiples: Object.freeze({ ...peerMultiples }),
    medianMultiple: stats.median,
    multipleRange: Object.freeze({ min: stats.min, max: stats.max }),
    impliedEnterpriseValue,
    impliedEquityValue,
    impliedPerShare,
    rangePerShare: Object.freeze({ min: minPerShare, max: maxPerShare }),
    exclusions: Object.freeze([...exclusions]),
    leaseConvention,
    inputsProvenance: Object.freeze({
      peersAsOf: peersCorpus.asOf || '',
      peerCount: symbols.length,
      peerSymbols: Object.freeze([...symbols]),
      forwardEbitdar,
      netCashCapitalized,
      sharesOutstanding,
      leaseConvention: leaseConvention.note
    })
  });
}
