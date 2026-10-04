/**
 * Multi-Method Agreement Verdict Engine — clustered evidence
 *
 * P10.4 contract, "Aggregate Evidence":
 *
 *   Intrinsic:            DCF
 *   Enterprise-relative:  EV/Revenue, EV/EBITDAR, Per-user
 *   Equity-cash-flow:     P/FCF
 *   SOTP:                 decomposition only, no vote
 *   FCFE:                 diagnostic only, no range/count/confidence
 *
 *   Collapse rule: multiple methods in one cluster collapse to one breadth
 *   observation by majority vote within the cluster. Verdict ordering
 *   (weakest/conservative first): `overvalued < fair < undervalued`; exact ties
 *   keep the weaker (minimum) verdict for breadth. Final verdict truth table:
 *   3/3 clusters agree -> that verdict; 2/3 agree -> majority verdict with
 *   minority disclosed; otherwise -> `fair` with HOLD note. Breadth counts
 *   CLUSTERS (max 3), never raw method counts.
 *
 * Why the previous behaviour was wrong: it counted raw methods and required
 * unanimity, so adding a fourth method inside one evidence cluster silently
 * manufactured extra breadth. Three methods that all measure the same thing
 * (enterprise-relative) could outvote the single intrinsic DCF, and a
 * decomposition or a diagnostic floor could vote at all.
 *
 * Pure, deterministic, fail-closed, deeply frozen.
 */

import { EngineError } from '../../data/errors.js';
import { RECOMMENDATION_THRESHOLDS } from '../../data/constants.js';

/**
 * The three evidence clusters, keyed by the method names the caller supplies.
 * @type {Readonly<Object<string, Readonly<string>>>}
 */
export const EVIDENCE_CLUSTERS = Object.freeze({
  intrinsic: Object.freeze({ name: 'intrinsic', label: 'Intrinsic', methods: Object.freeze(['fcff_dcf']) }),
  'enterprise-relative': Object.freeze({
    name: 'enterprise-relative',
    label: 'Enterprise-relative',
    methods: Object.freeze(['comps', 'ev_multiples', 'perUser']),
  }),
  'equity-cash-flow': Object.freeze({
    name: 'equity-cash-flow',
    label: 'Equity-cash-flow',
    methods: Object.freeze(['pfcf']),
  }),
});

/** Methods that may not vote, collapse, or contribute breadth. */
export const NON_VOTING_METHODS = Object.freeze({
  sotp: 'decomposition_only',
  fcfe: 'diagnostic_only',
});

/**
 * Verdict ordering, weakest/conservative first. Index 0 is the weakest.
 * @type {ReadonlyArray<string>}
 */
export const VERDICT_ORDER = Object.freeze(['overvalued', 'fair', 'undervalued']);

/**
 * @param {string} verdict
 * @returns {number} Position in the conservative ordering.
 */
function verdictRank(verdict) {
  const i = VERDICT_ORDER.indexOf(verdict);
  return i < 0 ? 1 : i;
}

/**
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/**
 * Collapses one cluster's method verdicts to a single breadth observation.
 *
 * Majority wins; an exact tie keeps the WEAKER verdict, because a tie is not
 * evidence of strength and must not inflate a directional call.
 *
 * @param {ReadonlyArray<Object>} entries
 * @returns {Readonly<Object>}
 */
function collapseCluster(entries) {
  const counts = { overvalued: 0, fair: 0, undervalued: 0 };
  for (const e of entries) {
    counts[e.verdict] += 1;
  }

  const total = entries.length;
  let collapsed = 'fair';
  let decidedBy = 'majority';

  const maxCount = Math.max(counts.overvalued, counts.fair, counts.undervalued);
  const leaders = VERDICT_ORDER.filter((v) => counts[v] === maxCount && maxCount > 0);

  if (leaders.length === 1) {
    collapsed = leaders[0];
  } else {
    // Exact tie (or all methods fair): keep the weakest among the tied leaders.
    collapsed = VERDICT_ORDER.filter((v) => leaders.includes(v))[0];
    decidedBy = 'tie_keeps_weaker';
  }

  return Object.freeze({
    verdict: collapsed,
    decidedBy,
    methodCount: total,
    counts: Object.freeze({ ...counts }),
    dissenting: Object.freeze(
      entries.filter((e) => e.verdict !== collapsed).map((e) => e.label)
    ),
    members: Object.freeze(entries.map((e) => Object.freeze({
      method: e.method,
      label: e.label,
      basis: e.basis,
      verdict: e.verdict,
      impliedPerShare: e.impliedPerShare,
      upsidePct: e.upsidePct,
      leaseConvention: e.leaseConvention ?? null,
      peerMultiples: e.peerMultiples ?? null,
      medianMultiple: e.medianMultiple ?? null,
    }))),
  });
}

/**
 * Builds the human-readable cluster summary.
 * @param {ReadonlyArray<Object>} clusters
 * @param {string} finalVerdict
 * @param {boolean} unanimous
 * @returns {string}
 */
function buildAgreementSummary(clusters, finalVerdict, unanimous) {
  const parts = clusters.map((c) => `${c.label}: ${c.verdict.toUpperCase()}`);
  const head = unanimous
    ? `Unanimous across all ${clusters.length} evidence clusters: ${finalVerdict.toUpperCase()}.`
    : `Verdict ${finalVerdict.toUpperCase()} from ${clusters.length} evidence clusters (${parts.join(', ')}).`;
  return `${head} Breadth counts clusters, not methods: a cluster with three methods is one observation.`;
}

/**
 * Evaluates agreement across valuation methods against a live market price.
 *
 * @param {Array<Object>|Object} methods - Valuation method outputs
 * @param {number} livePrice - Live or benchmark share price in USD
 * @param {number|Object} [thresholdInput] - Optional threshold override
 * @returns {Readonly<Object>} Aggregation result contract
 */
export function aggregateVerdicts(methods, livePrice, thresholdInput = null) {
  if (!methods) {
    throw new EngineError('missing_methods', 'methods parameter is required');
  }

  const methodList = Array.isArray(methods) ? methods : Object.values(methods);
  if (!Array.isArray(methodList) || methodList.length === 0) {
    throw new EngineError('empty_methods', 'At least one valuation method is required');
  }

  if (typeof livePrice !== 'number' || !Number.isFinite(livePrice) || livePrice <= 0) {
    throw new EngineError(
      'invalid_live_price',
      `livePrice must be a positive finite number (received ${livePrice})`
    );
  }

  let underThresh = RECOMMENDATION_THRESHOLDS.undervalued;
  let overThresh = RECOMMENDATION_THRESHOLDS.overvalued;

  if (typeof thresholdInput === 'number' && Number.isFinite(thresholdInput) && thresholdInput > 0) {
    underThresh = Math.abs(thresholdInput);
    overThresh = -Math.abs(thresholdInput);
  } else if (thresholdInput && typeof thresholdInput === 'object') {
    if (typeof thresholdInput.undervalued === 'number' && Number.isFinite(thresholdInput.undervalued)) {
      underThresh = thresholdInput.undervalued;
    }
    if (typeof thresholdInput.overvalued === 'number' && Number.isFinite(thresholdInput.overvalued)) {
      overThresh = thresholdInput.overvalued;
    }
  }

  const byCluster = { intrinsic: [], 'enterprise-relative': [], 'equity-cash-flow': [] };
  const nonVoting = [];

  for (let i = 0; i < methodList.length; i += 1) {
    const m = methodList[i];
    if (!m || typeof m !== 'object') {
      throw new EngineError('invalid_method_item', `Method at index ${i} must be a valid object`);
    }

    const name = m.method || `method_${i + 1}`;

    // SOTP is a decomposition of EV/Revenue and FCFE is a diagnostic. Neither
    // may vote, collapse into a cluster, or reach a range, count, or
    // confidence. This is decided by FIELD NAME so a renamed method cannot
    // quietly re-enter the vote.
    if (Object.prototype.hasOwnProperty.call(NON_VOTING_METHODS, name)) {
      nonVoting.push(Object.freeze({
        method: name,
        label: m.label ?? name,
        role: NON_VOTING_METHODS[name],
        impliedPerShare: typeof m.impliedPerShare === 'number' ? m.impliedPerShare : null,
      }));
      continue;
    }

    const perShare = m.impliedPerShare;
    if (typeof perShare !== 'number' || !Number.isFinite(perShare) || perShare <= 0) {
      throw new EngineError(
        'invalid_implied_per_share',
        `Method ${name} has invalid impliedPerShare: ${perShare}`
      );
    }

    const clusterKey = Object.keys(byCluster).find((k) =>
      EVIDENCE_CLUSTERS[k].methods.includes(name)
    );
    if (!clusterKey) {
      throw new EngineError(
        'unassigned_method',
        `Method ${name} is not assigned to an evidence cluster and cannot vote; ` +
          `assign it to one of: ${Object.keys(EVIDENCE_CLUSTERS).join(', ')}, ` +
          'or declare it non-voting by field name'
      );
    }

    const upsidePct = (perShare - livePrice) / livePrice;
    let verdict = 'fair';
    if (upsidePct >= underThresh) {
      verdict = 'undervalued';
    } else if (upsidePct <= overThresh) {
      verdict = 'overvalued';
    }

    byCluster[clusterKey].push(Object.freeze({
      method: name,
      label: m.label ?? name,
      basis: m.basis ?? 'Unspecified',
      impliedPerShare: perShare,
      upsidePct,
      verdict,
      leaseConvention: m.leaseConvention ?? null,
      peerMultiples: m.peerMultiples ?? null,
      medianMultiple: m.medianMultiple ?? null,
    }));
  }

  const clusters = Object.keys(byCluster)
    .filter((k) => byCluster[k].length > 0)
    .map((k) => Object.freeze({
      name: k,
      label: EVIDENCE_CLUSTERS[k].label,
      ...collapseCluster(byCluster[k]),
    }));

  if (clusters.length === 0) {
    throw new EngineError(
      'no_voting_methods',
      'No voting evidence cluster survived exclusion; a verdict cannot be formed'
    );
  }

  // Breadth counts clusters, capped at the number of clusters actually present.
  const breadth = Math.min(clusters.length, Object.keys(EVIDENCE_CLUSTERS).length);

  const verdictCounts = { overvalued: 0, fair: 0, undervalued: 0 };
  for (const c of clusters) {
    verdictCounts[c.verdict] += 1;
  }

  const maxCount = Math.max(verdictCounts.overvalued, verdictCounts.fair, verdictCounts.undervalued);
  const leaders = VERDICT_ORDER.filter((v) => verdictCounts[v] === maxCount);

  let finalVerdict = 'fair';
  let isUnanimous = false;
  let holdNote = null;
  let minority = [];

  if (leaders.length === 1 && maxCount === clusters.length && clusters.length >= 2) {
    // 3/3 (or full agreement where all clusters present agree)
    finalVerdict = leaders[0];
    isUnanimous = true;
  } else if (leaders.length === 1 && maxCount >= 2) {
    // 2/3 -> majority, minority disclosed
    finalVerdict = leaders[0];
    minority = clusters
      .filter((c) => c.verdict !== finalVerdict)
      .map((c) => Object.freeze({ cluster: c.name, label: c.label, verdict: c.verdict }));
  } else {
    // No single verdict carries the clusters -> fair with a HOLD note.
    finalVerdict = 'fair';
    isUnanimous = clusters.length > 0 && verdictCounts.fair === clusters.length;
    holdNote = 'No single verdict carries a majority of the evidence clusters; the aggregate is FAIR and the recommendation holds at the live price.';
  }

  if (isUnanimous && clusters.length < 2) {
    holdNote = 'A single evidence cluster cannot establish breadth; treat as directional only.';
  }

  // Spread is built ONLY from voting methods. SOTP and FCFE are excluded by
  // field name above, so they cannot reach min/max either.
  const votingValues = clusters.flatMap((c) => c.members.map((m) => m.impliedPerShare));
  const minImplied = Math.min(...votingValues);
  const maxImplied = Math.max(...votingValues);

  // A flat, voting-only view for display consumers. It is derived from the
  // clusters rather than from the raw input, so SOTP and FCFE are already
  // absent here by construction: a decomposition and a diagnostic cannot reach
  // a method row, a range, or a count just because a tab iterated the input.
  const methodResults = Object.freeze(
    clusters.flatMap((c) => c.members.map((m) => {
      const source = c.members.find((x) => x.method === m.method);
      return Object.freeze({
        method: m.method,
        label: m.label,
        basis: source?.basis ?? 'Unspecified',
        cluster: c.name,
        clusterLabel: c.label,
        impliedPerShare: m.impliedPerShare,
        rangePerShare: Object.freeze({ min: m.impliedPerShare, max: m.impliedPerShare }),
        upsidePct: source?.upsidePct ?? null,
        verdict: m.verdict,
      });
    }))
  );

  const counts = Object.freeze({
    undervalued: verdictCounts.undervalued,
    fair: verdictCounts.fair,
    overvalued: verdictCounts.overvalued,
    total: breadth,
    rawMethodCount: votingValues.length,
  });

  const contract = {
    verdict: finalVerdict,
    livePrice,
    thresholds: Object.freeze({ undervalued: underThresh, overvalued: overThresh }),
    breadth,
    breadthBasis: 'evidence_clusters',
    methodResults,
    clusters: Object.freeze(clusters),
    excludedFromVerdict: Object.freeze(nonVoting),
    agreement: Object.freeze({
      unanimous: isUnanimous,
      counts,
      spread: Object.freeze({
        min: minImplied,
        max: maxImplied,
        span: maxImplied - minImplied,
        basis: 'voting_methods_only',
      }),
      summary: buildAgreementSummary(clusters, finalVerdict, isUnanimous),
    }),
    dissent: Object.freeze(minority),
    holdNote,
  };

  return deepFreeze(contract);
}

export const verdict = aggregateVerdicts;

export default Object.freeze({
  verdict: aggregateVerdicts,
  aggregateVerdicts,
  EVIDENCE_CLUSTERS,
  NON_VOTING_METHODS,
  VERDICT_ORDER,
});
