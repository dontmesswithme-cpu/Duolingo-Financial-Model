/**
 * Sum-of-the-Parts (SOTP) Valuation Method
 *
 * Implements two-segment SOTP valuation per Phase 8 Director ruling #1, #3, #6, #8, #9:
 *  1. Subscriptions (incl. advertising)  -  advertising folded into subscriptions multiple
 *     on the EV / Forward Revenue 3-name median (primary), with EV / Forward EBITDAR median
 *     rendered alongside as sensitivity (margin dispersion across peers disclosed).
 *  2. Duolingo English Test (DET)  -  valued at the same subscriptions-family EV / Forward Revenue
 *     median with constraint disclosed on the row (no separate DET peer group exists, no outside import).
 *
 * Sum of segment EVs + capitalized net cash -> Implied Equity Value ÷ diluted common shares -> Implied Per Share.
 *
 * Pure, deterministic, fail-closed, deeply frozen.
 */

import { EngineError } from '../../data/errors.js';

/**
 * Calculates median and min/max span for an array of numbers.
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
 * Executes the Sum-of-the-Parts (SOTP) valuation method.
 *
 * @param {Object} peersCorpus - The peers object from peers.json
 * @param {Object} duolingoInputs - Duolingo forward figures and segment breakdowns
 * @param {number} [duolingoInputs.forwardRevenue] - FY+1 explicit forecast total revenue in $k
 * @param {number} [duolingoInputs.subscriptionsRevenue] - FY+1 subscriptions (incl. ads) revenue in $k
 * @param {number} duolingoInputs.detRevenue - FY+1 Duolingo English Test revenue in $k
 * @param {number} duolingoInputs.forwardEbitdar - FY+1 explicit forward EBITDAR in $k
 * @param {number} duolingoInputs.netCashCapitalized - Capitalized net cash in $k
 * @param {number} duolingoInputs.sharesOutstanding - Diluted common shares count (e.g. 50,031,000)
 * @returns {Readonly<Object>} Frozen method contract
 */
export function valuateSotp(peersCorpus, duolingoInputs) {
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

  const {
    forwardRevenue,
    detRevenue,
    forwardEbitdar,
    netCashCapitalized,
    sharesOutstanding
  } = duolingoInputs;

  if (!Number.isFinite(detRevenue) || detRevenue <= 0) {
    throw new EngineError('invalid_det_revenue', 'duolingo detRevenue must be a positive finite number');
  }

  // Derive or validate subscriptions revenue
  let subsRev = duolingoInputs.subscriptionsRevenue;
  if (subsRev === undefined) {
    if (!Number.isFinite(forwardRevenue) || forwardRevenue <= detRevenue) {
      throw new EngineError(
        'invalid_forward_revenue',
        'forwardRevenue must be greater than detRevenue when subscriptionsRevenue is not provided'
      );
    }
    subsRev = forwardRevenue - detRevenue;
  } else if (!Number.isFinite(subsRev) || subsRev <= 0) {
    throw new EngineError('invalid_subscriptions_revenue', 'duolingo subscriptionsRevenue must be a positive finite number');
  }

  const totalForwardRev = Number.isFinite(forwardRevenue) ? forwardRevenue : subsRev + detRevenue;

  if (!Number.isFinite(forwardEbitdar) || forwardEbitdar <= 0) {
    throw new EngineError('invalid_forward_ebitdar', 'duolingo forwardEbitdar must be a positive finite number');
  }
  if (!Number.isFinite(netCashCapitalized)) {
    throw new EngineError('invalid_net_cash', 'duolingo netCashCapitalized must be a finite number');
  }
  if (!Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
    throw new EngineError('invalid_shares', 'duolingo sharesOutstanding must be a positive finite number');
  }

  // 1. Primary Multiple: EV / Forward Revenue across 3 peers
  const peerRevMultiples = {};
  const revMultipleList = [];

  for (const sym of symbols) {
    const p = peers[sym];
    const ev = p.capitalizedEnterpriseValue;
    const fwdRev = p.revenue?.fyForward;

    if (!Number.isFinite(ev) || ev <= 0 || !Number.isFinite(fwdRev) || fwdRev <= 0) {
      throw new EngineError('invalid_peer_data', `Peer ${sym} has invalid EV or forward revenue`, sym);
    }

    const mult = ev / fwdRev;
    peerRevMultiples[sym] = mult;
    revMultipleList.push(mult);
  }

  const statsRev = computeStats(revMultipleList);

  // 2. Sensitivity Multiple: EV / Forward EBITDAR across positive peers
  const peerEbitdarMultiples = {};
  const ebitdarMultipleList = [];
  const exclusions = [];

  for (const sym of symbols) {
    const p = peers[sym];
    const ev = p.capitalizedEnterpriseValue;
    const fwdEbitdar = p.ebitdar?.forward;

    if (!Number.isFinite(ev) || ev <= 0) {
      throw new EngineError('invalid_peer_data', `Peer ${sym} has invalid EV for EBITDAR multiple`, sym);
    }

    if (p.ebitdar?.isNegative || !Number.isFinite(fwdEbitdar) || fwdEbitdar <= 0) {
      peerEbitdarMultiples[sym] = null;
      exclusions.push({
        symbol: sym,
        reason: p.ebitdar?.notes || 'Negative or unavailable forward EBITDAR'
      });
      continue;
    }

    const mult = ev / fwdEbitdar;
    peerEbitdarMultiples[sym] = mult;
    ebitdarMultipleList.push(mult);
  }

  const statsEbitdar = computeStats(ebitdarMultipleList);

  // 3. Segment valuations on primary EV / Forward Revenue median
  const subsEv = subsRev * statsRev.median;
  const detEv = detRevenue * statsRev.median;
  const impliedEnterpriseValue = subsEv + detEv;
  const impliedEquityValue = impliedEnterpriseValue + netCashCapitalized;
  const impliedPerShare = (impliedEquityValue * 1e3) / sharesOutstanding;

  // Min / Max range across peer revenue multiples
  const minEv = totalForwardRev * statsRev.min;
  const minEquity = minEv + netCashCapitalized;
  const minPerShare = (minEquity * 1e3) / sharesOutstanding;

  const maxEv = totalForwardRev * statsRev.max;
  const maxEquity = maxEv + netCashCapitalized;
  const maxPerShare = (maxEquity * 1e3) / sharesOutstanding;

  // Sensitivity valuation on EV / Forward EBITDAR
  const sensEv = forwardEbitdar * statsEbitdar.median;
  const sensEquity = sensEv + netCashCapitalized;
  const sensPerShare = (sensEquity * 1e3) / sharesOutstanding;

  const sensMinEv = forwardEbitdar * statsEbitdar.min;
  const sensMinEquity = sensMinEv + netCashCapitalized;
  const sensMinPerShare = (sensMinEquity * 1e3) / sharesOutstanding;

  const sensMaxEv = forwardEbitdar * statsEbitdar.max;
  const sensMaxEquity = sensMaxEv + netCashCapitalized;
  const sensMaxPerShare = (sensMaxEquity * 1e3) / sharesOutstanding;

  const leaseConvention = Object.freeze({
    duolingoLeaseBasis: 'long_term_only',
    note: 'Duolingo operating lease liability reflects the long-term obligation ($86.136M / 86,136k) filed in Q2 Form 10-Q Note 9; current operating lease portion is folded into accrued expenses and not separately broken out in quarterly filings (~$7.204M in annual Form 10-K Note 9; ~$0.14/share materiality). Peers include both current and non-current lease liabilities.'
  });

  const segments = Object.freeze({
    subscriptions: Object.freeze({
      name: 'Subscriptions (incl. advertising)',
      forwardRevenue: subsRev,
      multiple: statsRev.median,
      enterpriseValue: subsEv,
      footnote: `Subscriptions segment comprises subscription revenue + advertising (folded per Director ruling #3.i) + in-app purchases + other revenue ($${Number(subsRev.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}k total; every revenue dollar lands in one of the two segments per the two-segment mandate).`
    }),
    det: Object.freeze({
      name: 'Duolingo English Test (DET)',
      forwardRevenue: detRevenue,
      multiple: statsRev.median,
      enterpriseValue: detEv,
      constraintDisclosure: 'Valued at subscriptions-family multiple; no separate DET peer group exists, no outside multiple imported.'
    })
  });

  return Object.freeze({
    method: 'sotp',
    label: 'Sum-of-the-Parts (SOTP)',
    basis: 'FY+1',
    segments,
    segmentCount: 2,
    primaryMultiple: 'ev_forward_revenue',
    peerMultiples: Object.freeze({ ...peerRevMultiples }),
    medianMultiple: statsRev.median,
    multipleRange: Object.freeze({ min: statsRev.min, max: statsRev.max }),
    impliedEnterpriseValue,
    impliedEquityValue,
    impliedPerShare,
    rangePerShare: Object.freeze({ min: minPerShare, max: maxPerShare }),
    sensitivity: Object.freeze({
      metric: 'ev_forward_ebitdar',
      label: 'EV / Forward EBITDAR Sensitivity',
      peerMultiples: Object.freeze({ ...peerEbitdarMultiples }),
      exclusions: Object.freeze([...exclusions]),
      medianMultiple: statsEbitdar.median,
      multipleRange: Object.freeze({ min: statsEbitdar.min, max: statsEbitdar.max }),
      impliedEnterpriseValue: sensEv,
      impliedEquityValue: sensEquity,
      impliedPerShare: sensPerShare,
      rangePerShare: Object.freeze({ min: sensMinPerShare, max: sensMaxPerShare }),
      marginDispersionNote: 'Margin dispersion across the peer group (-11.7% to 31.5%) makes EBITDAR multiple dispersion wider and less robust as a central valuation anchor than revenue multiples.'
    }),
    leaseConvention,
    inputsProvenance: Object.freeze({
      peersAsOf: peersCorpus.asOf || '',
      peerCount: symbols.length,
      peerSymbols: Object.freeze([...symbols]),
      subscriptionsRevenue: subsRev,
      detRevenue,
      totalForwardRevenue: totalForwardRev,
      forwardEbitdar,
      netCashCapitalized,
      sharesOutstanding,
      leaseConvention: leaseConvention.note
    })
  });
}
