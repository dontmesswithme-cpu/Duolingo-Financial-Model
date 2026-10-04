/**
 * Beta Engine Module (P6R2.2).
 *
 * Implements pure Ordinary Least Squares (OLS) regression of stock simple
 * returns on benchmark (S&P 500 Index) simple returns:
 *
 *   rStock = alphaMonthly + beta * rBenchmark + epsilon
 *
 * Contract guarantees:
 *  - Fail-closed: requires n >= 24 return observations; throws EngineError on
 *    insufficient observations, non-finite values, or degenerate variance.
 *  - Pure & deterministic: zero DOM, zero fetch, zero Date.now, zero Math.random.
 *  - Deeply frozen output.
 *
 * @module src/engine/beta
 */

import { EngineError } from '../data/errors.js';

/** Minimum sample size required for statistical validity (2 full years). */
const MIN_OBSERVATIONS = 24;

/**
 * Recursively freezes an object graph.
 *
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
 * Extracts numeric returns from an observation item.
 * Supports { stockReturn, benchmarkReturn }, { duolReturn, spReturn },
 * { y, x }, or [stockReturn, benchmarkReturn].
 *
 * @param {any} obs
 * @param {number} idx
 * @returns {{ y: number, x: number, period?: string, date?: string }}
 */
function extractReturnPair(obs, idx) {
  if (obs === null || typeof obs !== 'object') {
    throw new EngineError(
      'invalid_observation',
      `Observation at index ${idx} must be an object or tuple.`,
      'observations',
    );
  }

  let y;
  let x;
  let period;
  let date;

  if (Array.isArray(obs)) {
    y = obs[0];
    x = obs[1];
  } else {
    y = obs.stockReturn !== undefined ? obs.stockReturn : (obs.duolReturn !== undefined ? obs.duolReturn : obs.y);
    x = obs.benchmarkReturn !== undefined ? obs.benchmarkReturn : (obs.spReturn !== undefined ? obs.spReturn : (obs.marketReturn !== undefined ? obs.marketReturn : obs.x));
    period = obs.period;
    date = obs.date;
  }

  if (typeof y !== 'number' || !Number.isFinite(y)) {
    throw new EngineError(
      'non_finite_input',
      `Observation at index ${idx} has non-finite stock return: ${y}.`,
      'observations',
    );
  }

  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new EngineError(
      'non_finite_input',
      `Observation at index ${idx} has non-finite benchmark return: ${x}.`,
      'observations',
    );
  }

  return { y, x, period, date };
}

/**
 * Computes OLS regression of stock returns on benchmark returns.
 *
 * @param {Array<object>|{ observations: Array<object> }} input Observations array or dataset container.
 * @returns {Readonly<{
 *   beta: number,
 *   alphaMonthly: number,
 *   r2: number,
 *   stderr: number,
 *   stderrBeta: number,
 *   stderrEstimate: number,
 *   n: number,
 *   windowStart: string,
 *   windowEnd: string,
 *   benchmark: string
 * }>}
 * @throws {EngineError} `insufficient_observations` when n < 24.
 * @throws {EngineError} `non_finite_input` on non-finite values.
 * @throws {EngineError} `zero_variance` when benchmark variance is zero.
 */
export function regress(input) {
  const observations = Array.isArray(input)
    ? input
    : (input && Array.isArray(input.observations) ? input.observations : null);

  if (!observations) {
    throw new EngineError(
      'invalid_observations',
      'beta.regress requires an array of observations or an object containing an observations array.',
      'observations',
    );
  }

  const n = observations.length;
  if (n < MIN_OBSERVATIONS) {
    throw new EngineError(
      'insufficient_observations',
      `beta.regress requires at least ${MIN_OBSERVATIONS} return observations, but received ${n}.`,
      'observations',
    );
  }

  const pairs = new Array(n);
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < n; i++) {
    const pair = extractReturnPair(observations[i], i);
    pairs[i] = pair;
    sumX += pair.x;
    sumY += pair.y;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  let ssXX = 0;
  let ssYY = 0;
  let ssXY = 0;

  for (let i = 0; i < n; i++) {
    const dx = pairs[i].x - meanX;
    const dy = pairs[i].y - meanY;
    ssXX += dx * dx;
    ssYY += dy * dy;
    ssXY += dx * dy;
  }

  if (ssXX <= 1e-12 || !Number.isFinite(ssXX)) {
    throw new EngineError(
      'zero_variance',
      'beta.regress cannot compute slope: benchmark returns have zero or invalid variance.',
      'observations',
    );
  }

  const beta = ssXY / ssXX;
  const alphaMonthly = meanY - beta * meanX;

  // Coefficient of determination R^2
  let r2 = 0;
  if (ssYY > 0) {
    r2 = (ssXY * ssXY) / (ssXX * ssYY);
    if (r2 > 1) r2 = 1;
    if (r2 < 0) r2 = 0;
  }

  // Residual sum of squares and standard errors
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const yHat = alphaMonthly + beta * pairs[i].x;
    const residual = pairs[i].y - yHat;
    sse += residual * residual;
  }

  const degreesOfFreedom = n - 2;
  const meanSquaredError = degreesOfFreedom > 0 ? sse / degreesOfFreedom : 0;
  const stderrEstimate = Math.sqrt(Math.max(0, meanSquaredError));
  const stderrBeta = Math.sqrt(Math.max(0, meanSquaredError / ssXX));

  const windowStart = pairs[0].period || pairs[0].date || '';
  const windowEnd = pairs[n - 1].period || pairs[n - 1].date || '';
  const benchmark = (input && typeof input.benchmark === 'string') ? input.benchmark : 'S&P 500 Index';

  const result = {
    beta,
    alphaMonthly,
    r2,
    stderr: stderrBeta,
    stderrBeta,
    stderrEstimate,
    n,
    windowStart,
    windowEnd,
    benchmark,
  };

  return deepFreeze(result);
}

export default {
  regress,
};
