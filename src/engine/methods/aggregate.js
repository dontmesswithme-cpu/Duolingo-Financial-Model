/**
 * Multi-Method Agreement Verdict Engine
 *
 * Implements agreement-only aggregation across six valuation methods
 * per Phase 8 Director ruling #1, #5, #7.
 *
 * Directives & Constraints:
 *  - Threshold: imported directly from RECOMMENDATION_THRESHOLDS (zero magic literals).
 *  - Directional verdict issued ONLY on unanimous agreement beyond threshold band:
 *      undervalued <-> EVERY method impliedPerShare >= livePrice * (1 + threshold.undervalued)
 *      overvalued  <-> EVERY method impliedPerShare <= livePrice * (1 + threshold.overvalued)
 *      otherwise   -> fair (no consensus if any method split)
 *  - Per-method dissent rendered method-by-method.
 *  - Equal computational standing for every method.
 *
 * Pure, deterministic, fail-closed, deeply frozen.
 */

import { EngineError } from '../../data/errors.js';
import { RECOMMENDATION_THRESHOLDS } from '../../data/constants.js';

/**
 * Freezes an object graph recursively.
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
 * Generates descriptive agreement and dissent summary text.
 *
 * @param {Object} counts - Breakdown counts by verdict
 * @param {Array<Object>} methodResults - Array of evaluated method entries
 * @param {string} finalVerdict - The aggregated verdict
 * @param {boolean} isUnanimous - True if all methods share the verdict
 * @returns {string} Human-readable summary
 */
function buildAgreementSummary(counts, methodResults, finalVerdict, isUnanimous) {
  if (isUnanimous) {
    return `Unanimous agreement across all ${methodResults.length} methods: ${finalVerdict.toUpperCase()}.`;
  }

  const parts = [];
  if (counts.undervalued > 0) {
    const names = methodResults
      .filter((m) => m.verdict === 'undervalued')
      .map((m) => m.label)
      .join(', ');
    parts.push(`${counts.undervalued} method${counts.undervalued > 1 ? 's' : ''} undervalued [${names}]`);
  }
  if (counts.overvalued > 0) {
    const names = methodResults
      .filter((m) => m.verdict === 'overvalued')
      .map((m) => m.label)
      .join(', ');
    parts.push(`${counts.overvalued} method${counts.overvalued > 1 ? 's' : ''} overvalued [${names}]`);
  }
  if (counts.fair > 0) {
    const names = methodResults
      .filter((m) => m.verdict === 'fair')
      .map((m) => m.label)
      .join(', ');
    parts.push(`${counts.fair} method${counts.fair > 1 ? 's' : ''} fair [${names}]`);
  }

  return `${parts.join(', ')}  -  verdict: FAIR, no consensus.`;
}

/**
 * Evaluates agreement across valuation methods against a live market price.
 *
 * @param {Array<Object>|Object} methods - Valuation method outputs
 * @param {number} livePrice - Live or benchmark share price in USD
 * @param {Object|number} [thresholdInput] - Optional threshold override or object
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

  const methodResults = [];
  let minImplied = Infinity;
  let maxImplied = -Infinity;

  for (let i = 0; i < methodList.length; i += 1) {
    const m = methodList[i];
    if (!m || typeof m !== 'object') {
      throw new EngineError('invalid_method_item', `Method at index ${i} must be a valid object`);
    }

    const perShare = m.impliedPerShare;
    if (typeof perShare !== 'number' || !Number.isFinite(perShare) || perShare <= 0) {
      throw new EngineError(
        'invalid_implied_per_share',
        `Method ${m.method || i} has invalid impliedPerShare: ${perShare}`
      );
    }

    if (perShare < minImplied) minImplied = perShare;
    if (perShare > maxImplied) maxImplied = perShare;

    const upsidePct = (perShare - livePrice) / livePrice;
    let methodVerdict = 'fair';
    if (upsidePct >= underThresh) {
      methodVerdict = 'undervalued';
    } else if (upsidePct <= overThresh) {
      methodVerdict = 'overvalued';
    }

    methodResults.push(Object.freeze({
      method: m.method || `method_${i + 1}`,
      label: m.label || m.method || `Method ${i + 1}`,
      basis: m.basis || 'Unspecified',
      impliedPerShare: perShare,
      rangePerShare: m.rangePerShare ?? null,
      upsidePct,
      verdict: methodVerdict,
      leaseConvention: m.leaseConvention ?? null,
      peerMultiples: m.peerMultiples ?? null,
      medianMultiple: m.medianMultiple ?? null
    }));
  }

  const countUndervalued = methodResults.filter((m) => m.verdict === 'undervalued').length;
  const countOvervalued = methodResults.filter((m) => m.verdict === 'overvalued').length;
  const countFair = methodResults.filter((m) => m.verdict === 'fair').length;
  const totalCount = methodResults.length;

  const allUndervalued = countUndervalued === totalCount;
  const allOvervalued = countOvervalued === totalCount;
  const allFair = countFair === totalCount;

  let finalVerdict = 'fair';
  let isUnanimous = false;

  if (allUndervalued) {
    finalVerdict = 'undervalued';
    isUnanimous = true;
  } else if (allOvervalued) {
    finalVerdict = 'overvalued';
    isUnanimous = true;
  } else {
    finalVerdict = 'fair';
    isUnanimous = allFair;
  }

  let dissentList = [];
  if (finalVerdict === 'undervalued') {
    dissentList = methodResults.filter((m) => m.verdict !== 'undervalued');
  } else if (finalVerdict === 'overvalued') {
    dissentList = methodResults.filter((m) => m.verdict !== 'overvalued');
  } else {
    // For fair verdict: if not unanimous fair, any method that is not fair is a dissenter
    if (!isUnanimous) {
      dissentList = methodResults.filter((m) => m.verdict !== 'fair');
    }
  }

  const counts = Object.freeze({
    undervalued: countUndervalued,
    fair: countFair,
    overvalued: countOvervalued,
    total: totalCount
  });

  const spread = Object.freeze({
    min: minImplied,
    max: maxImplied,
    span: maxImplied - minImplied
  });

  const agreementSummary = buildAgreementSummary(counts, methodResults, finalVerdict, isUnanimous);

  const contract = {
    verdict: finalVerdict,
    livePrice,
    thresholds: Object.freeze({
      undervalued: underThresh,
      overvalued: overThresh
    }),
    methodResults: Object.freeze(methodResults),
    agreement: Object.freeze({
      unanimous: isUnanimous,
      counts,
      spread,
      summary: agreementSummary
    }),
    dissent: Object.freeze(dissentList)
  };

  return deepFreeze(contract);
}

/**
 * Shorthand alias matching the spec specification: aggregate.verdict(methods, livePrice, threshold).
 */
export const verdict = aggregateVerdicts;

export default Object.freeze({
  verdict: aggregateVerdicts,
  aggregateVerdicts
});
