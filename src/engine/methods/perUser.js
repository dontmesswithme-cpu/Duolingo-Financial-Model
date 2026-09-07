/**
 * Per-User / Per-Subscriber Valuation Method
 *
 * Implements relative valuation across three unblended native KPI bases
 * per Phase 8 Director ruling #1, #8, #9:
 *  1. Spotify native basis (MAU & ARPU funnel)
 *  2. Roblox native basis (DAU & bookings-per-user)
 *  3. Netflix native basis (Paid subscribers / memberships & ARPU/ARM)
 *
 * For each native basis:
 *  - Computes peer EV per user on capitalized lease basis (and Market Cap per user).
 *  - Applies DUOL matching KPI from cited corpus rows to derive Implied EV -> Implied Equity -> Implied Per Share.
 *  - The method's single vote is the median of the three bases, rendered with min-max span.
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
 * Executes the Per-User / Per-Subscriber valuation method.
 *
 * @param {Object} peersCorpus - The peers object from peers.json
 * @param {Object} duolingoInputs - Duolingo KPIs and capital structure
 * @param {Object} duolingoInputs.kpis - Duolingo KPI values from cited corpus
 * @param {number} duolingoInputs.kpis.mau - Duolingo MAU count (e.g. 133,100,000)
 * @param {number} duolingoInputs.kpis.dau - Duolingo DAU count (e.g. 58,700,000)
 * @param {number} duolingoInputs.kpis.paidSubscribers - Duolingo Paid Subscribers count (e.g. 12,700,000)
 * @param {number} duolingoInputs.netCashCapitalized - Capitalized net cash in $k
 * @param {number} duolingoInputs.sharesOutstanding - Diluted common shares count (e.g. 50,031,000)
 * @param {Object} [duolingoInputs.arpuContext] - Optional ARPU context figures
 * @returns {Readonly<Object>} Frozen method contract
 */
export function valuatePerUser(peersCorpus, duolingoInputs) {
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

  const { kpis, netCashCapitalized, sharesOutstanding, arpuContext } = duolingoInputs;

  if (!kpis || typeof kpis !== 'object') {
    throw new EngineError('missing_kpis', 'duolingoInputs.kpis object is required');
  }

  const { mau, dau, paidSubscribers } = kpis;

  if (!Number.isFinite(mau) || mau <= 0) {
    throw new EngineError('invalid_mau', 'duolingo kpis.mau must be a positive finite number');
  }
  if (!Number.isFinite(dau) || dau <= 0) {
    throw new EngineError('invalid_dau', 'duolingo kpis.dau must be a positive finite number');
  }
  if (!Number.isFinite(paidSubscribers) || paidSubscribers <= 0) {
    throw new EngineError('invalid_paid_subscribers', 'duolingo kpis.paidSubscribers must be a positive finite number');
  }
  if (!Number.isFinite(netCashCapitalized)) {
    throw new EngineError('invalid_net_cash', 'duolingo netCashCapitalized must be a finite number');
  }
  if (!Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
    throw new EngineError('invalid_shares', 'duolingo sharesOutstanding must be a positive finite number');
  }

  if (!arpuContext || typeof arpuContext !== 'object') {
    throw new EngineError('missing_arpu_context', 'duolingoInputs.arpuContext object is required');
  }
  if (typeof arpuContext.subscriptionArpu !== 'string' || !arpuContext.subscriptionArpu.trim()) {
    throw new EngineError('invalid_arpu_context', 'arpuContext.subscriptionArpu string is required');
  }
  if (typeof arpuContext.bookingsPerDau !== 'string' || !arpuContext.bookingsPerDau.trim()) {
    throw new EngineError('invalid_arpu_context', 'arpuContext.bookingsPerDau string is required');
  }

  // Peer KPI inputs from locked peers
  const spot = peers.SPOT;
  const rblx = peers.RBLX;
  const nflx = peers.NFLX;

  const spotMau = spot.kpis?.mau?.value;
  const rblxDau = rblx.kpis?.dau?.value;
  const nflxPaidSubs = nflx.kpis?.paidMemberships?.value;

  if (!Number.isFinite(spotMau) || spotMau <= 0) {
    throw new EngineError('invalid_peer_kpi', 'SPOT missing valid MAU KPI', 'SPOT');
  }
  if (!Number.isFinite(rblxDau) || rblxDau <= 0) {
    throw new EngineError('invalid_peer_kpi', 'RBLX missing valid DAU KPI', 'RBLX');
  }
  if (!Number.isFinite(nflxPaidSubs) || nflxPaidSubs <= 0) {
    throw new EngineError('invalid_peer_kpi', 'NFLX missing valid paidMemberships KPI', 'NFLX');
  }

  // --- Base 1: Spotify Native Basis (MAU) ---
  // Peer Capitalized EV in $k = ev ($M) * 1e3. Multiple in $ / MAU.
  const spotEvThousand = spot.capitalizedEnterpriseValue * 1e3;
  const spotEvPerMau = (spotEvThousand * 1e3) / spotMau; // $ per MAU
  const spotMcapPerMau = ((spot.marketCap * 1e3) * 1e3) / spotMau; // $ per MAU
  const duolImpliedEvSpot = (mau * spotEvPerMau) / 1e3; // $k
  const duolImpliedEquitySpot = duolImpliedEvSpot + netCashCapitalized; // $k
  const duolPerShareSpot = (duolImpliedEquitySpot * 1e3) / sharesOutstanding; // $

  // --- Base 2: Roblox Native Basis (DAU) ---
  const rblxEvThousand = rblx.capitalizedEnterpriseValue * 1e3;
  const rblxEvPerDau = (rblxEvThousand * 1e3) / rblxDau; // $ per DAU
  const rblxMcapPerDau = ((rblx.marketCap * 1e3) * 1e3) / rblxDau; // $ per DAU
  const duolImpliedEvRblx = (dau * rblxEvPerDau) / 1e3; // $k
  const duolImpliedEquityRblx = duolImpliedEvRblx + netCashCapitalized; // $k
  const duolPerShareRblx = (duolImpliedEquityRblx * 1e3) / sharesOutstanding; // $

  // --- Base 3: Netflix Native Basis (Paid Subscribers) ---
  const nflxEvThousand = nflx.capitalizedEnterpriseValue * 1e3;
  const nflxEvPerPaidSub = (nflxEvThousand * 1e3) / nflxPaidSubs; // $ per Paid Sub
  const nflxMcapPerPaidSub = ((nflx.marketCap * 1e3) * 1e3) / nflxPaidSubs; // $ per Paid Sub
  const duolImpliedEvNflx = (paidSubscribers * nflxEvPerPaidSub) / 1e3; // $k
  const duolImpliedEquityNflx = duolImpliedEvNflx + netCashCapitalized; // $k
  const duolPerShareNflx = (duolImpliedEquityNflx * 1e3) / sharesOutstanding; // $

  const bases = Object.freeze({
    spotify_mau: Object.freeze({
      peer: 'SPOT',
      basisName: 'Spotify MAU Basis',
      kpiMetric: 'mau',
      peerKpiValue: spotMau,
      peerKpiDisplay: spot.kpis?.mau?.display || '626M MAU',
      evPerUser: spotEvPerMau,
      mcapPerUser: spotMcapPerMau,
      duolKpiValue: mau,
      impliedEnterpriseValue: duolImpliedEvSpot,
      impliedEquityValue: duolImpliedEquitySpot,
      impliedPerShare: duolPerShareSpot,
      arpuContext: Object.freeze({
        peerArpu: spot.kpis?.arpu?.display || '',
        duolArpu: arpuContext.subscriptionArpu
      })
    }),
    roblox_dau: Object.freeze({
      peer: 'RBLX',
      basisName: 'Roblox DAU Basis',
      kpiMetric: 'dau',
      peerKpiValue: rblxDau,
      peerKpiDisplay: rblx.kpis?.dau?.display || '',
      evPerUser: rblxEvPerDau,
      mcapPerUser: rblxMcapPerDau,
      duolKpiValue: dau,
      impliedEnterpriseValue: duolImpliedEvRblx,
      impliedEquityValue: duolImpliedEquityRblx,
      impliedPerShare: duolPerShareRblx,
      arpuContext: Object.freeze({
        peerArpu: rblx.kpis?.abpu?.display || '',
        duolArpu: arpuContext.bookingsPerDau
      })
    }),
    netflix_paid_subs: Object.freeze({
      peer: 'NFLX',
      basisName: 'Netflix Paid Subscribers Basis',
      kpiMetric: 'paid_subscribers',
      peerKpiValue: nflxPaidSubs,
      peerKpiDisplay: nflx.kpis?.paidMemberships?.display || '',
      evPerUser: nflxEvPerPaidSub,
      mcapPerUser: nflxMcapPerPaidSub,
      duolKpiValue: paidSubscribers,
      impliedEnterpriseValue: duolImpliedEvNflx,
      impliedEquityValue: duolImpliedEquityNflx,
      impliedPerShare: duolPerShareNflx,
      arpuContext: Object.freeze({
        peerArpu: nflx.kpis?.arm?.display || '',
        duolArpu: arpuContext.subscriptionArpu
      })
    })
  });

  // Method vote = median of the three native bases
  const perShareList = [
    { key: 'spotify_mau', perShare: duolPerShareSpot, ev: duolImpliedEvSpot, equity: duolImpliedEquitySpot },
    { key: 'roblox_dau', perShare: duolPerShareRblx, ev: duolImpliedEvRblx, equity: duolImpliedEquityRblx },
    { key: 'netflix_paid_subs', perShare: duolPerShareNflx, ev: duolImpliedEvNflx, equity: duolImpliedEquityNflx }
  ].sort((a, b) => a.perShare - b.perShare);

  const medianEntry = perShareList[1];
  const minEntry = perShareList[0];
  const maxEntry = perShareList[2];

  const leaseConvention = Object.freeze({
    duolingoLeaseBasis: 'long_term_only',
    note: 'Duolingo operating lease liability reflects the long-term obligation ($86.136M / 86,136k) filed in Q2 Form 10-Q Note 9; current operating lease portion is folded into accrued expenses and not separately broken out in quarterly filings (~$7.204M in annual Form 10-K Note 9; ~$0.14/share materiality). Peers include both current and non-current lease liabilities.'
  });

  return Object.freeze({
    method: 'perUser',
    label: 'Per-User / Per-Subscriber',
    basis: 'native_kpis',
    bases,
    baseCount: 3,
    medianBasis: medianEntry.key,
    impliedEnterpriseValue: medianEntry.ev,
    impliedEquityValue: medianEntry.equity,
    impliedPerShare: medianEntry.perShare,
    rangePerShare: Object.freeze({
      min: minEntry.perShare,
      max: maxEntry.perShare
    }),
    leaseConvention,
    inputsProvenance: Object.freeze({
      peersAsOf: peersCorpus.asOf || '',
      peerCount: symbols.length,
      peerSymbols: Object.freeze([...symbols]),
      duolKpis: Object.freeze({ mau, dau, paidSubscribers }),
      netCashCapitalized,
      sharesOutstanding,
      arpuContext: Object.freeze({ ...arpuContext }),
      leaseConvention: leaseConvention.note
    })
  });
}
