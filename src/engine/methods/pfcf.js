/**
 * P/FCF & FCF Yield Valuation Method
 *
 * Implements relative valuation based on the locked 3-peer set (SPOT, RBLX, NFLX)
 * free cash flow multiples per Phase 8 Director ruling #1, #5, #8.
 *
 * Computes:
 *  - Peer P/FCF (MarketCap ÷ TTM FCF) and FCF Yield (TTM FCF ÷ MarketCap).
 *  - 3-name median multiple and min-max dispersion range.
 *  - Duolingo Implied Market Cap = DUOL TTM FCF × Peer Median P/FCF.
 *  - Duolingo Implied Per Share = Implied Market Cap ÷ Diluted Common Shares.
 *
 * Pure, deterministic, fail-closed, deeply frozen.
 */

import { EngineError } from '../../data/errors.js';

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
 * Executes the P/FCF & FCF Yield valuation method.
 *
 * @param {Object} peersCorpus - The peers object from peers.json
 * @param {Object} duolingoInputs - Duolingo TTM figures and shares
 * @param {number} duolingoInputs.ttmFreeCashFlow - DUOL TTM Free Cash Flow in $k
 * @param {number} duolingoInputs.sharesOutstanding - Diluted common shares count (e.g. 50,031,000)
 * @returns {Readonly<Object>} Frozen method contract
 */
export function valuatePfcf(peersCorpus, duolingoInputs) {
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

  const { ttmFreeCashFlow, sharesOutstanding } = duolingoInputs;

  if (!Number.isFinite(ttmFreeCashFlow) || ttmFreeCashFlow <= 0) {
    throw new EngineError('invalid_ttm_fcf', 'duolingo ttmFreeCashFlow must be a positive finite number');
  }
  if (!Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
    throw new EngineError('invalid_shares', 'duolingo sharesOutstanding must be a positive finite number');
  }

  // Calculate peer P/FCF and FCF Yield
  const peerPfcf = {};
  const peerFcfYield = {};
  const multipleList = [];

  for (const sym of symbols) {
    const p = peers[sym];
    const mcap = p.marketCap;
    const fcf = p.freeCashFlow?.ttm;

    if (!Number.isFinite(mcap) || mcap <= 0 || !Number.isFinite(fcf) || fcf <= 0) {
      throw new EngineError('invalid_peer_data', `Peer ${sym} has invalid market cap or FCF`, sym);
    }

    const pfcfMult = mcap / fcf;
    const fcfYield = fcf / mcap;

    peerPfcf[sym] = pfcfMult;
    peerFcfYield[sym] = fcfYield;
    multipleList.push(pfcfMult);
  }

  const stats = computeStats(multipleList);

  // Duolingo valuation
  // ttmFreeCashFlow is in $k; P/FCF multiple is dimensionless; implied market cap is in $k.
  const impliedMarketCap = ttmFreeCashFlow * stats.median;
  const impliedPerShare = (impliedMarketCap * 1e3) / sharesOutstanding;

  const minMarketCap = ttmFreeCashFlow * stats.min;
  const minPerShare = (minMarketCap * 1e3) / sharesOutstanding;

  const maxMarketCap = ttmFreeCashFlow * stats.max;
  const maxPerShare = (maxMarketCap * 1e3) / sharesOutstanding;

  const leaseConvention = Object.freeze({
    duolingoLeaseBasis: 'equity_level_flow',
    note: 'P/FCF operates on equity free cash flows after actual lease payments; enterprise capitalized lease debt is not added to equity value.'
  });

  return Object.freeze({
    method: 'pfcf',
    label: 'P/Levered FCF & FCF Yield',
    basis: 'TTM',
    peerMultiples: Object.freeze({ ...peerPfcf }),
    peerFcfYields: Object.freeze({ ...peerFcfYield }),
    medianMultiple: stats.median,
    multipleRange: Object.freeze({ min: stats.min, max: stats.max }),
    medianFcfYield: 1 / stats.median,
    impliedMarketCap,
    impliedEquityValue: impliedMarketCap,
    impliedPerShare,
    rangePerShare: Object.freeze({ min: minPerShare, max: maxPerShare }),
    leaseConvention,
    inputsProvenance: Object.freeze({
      peersAsOf: peersCorpus.asOf || '',
      peerCount: symbols.length,
      peerSymbols: Object.freeze([...symbols]),
      ttmFreeCashFlow,
      sharesOutstanding,
      leaseConvention: leaseConvention.note
    })
  });
}
