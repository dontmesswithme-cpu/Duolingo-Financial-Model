/**
 * Canonical Benchmark Engine (P10.3).
 *
 * One immutable benchmark object is the single source of the market price for
 * every consumer: recommendation, scenarios, sensitivity, method verdicts, and
 * the cover / summary / valuation views. There is exactly one of these per
 * controller and it is passed by reference, so a consumer cannot read a
 * different price than its neighbour.
 *
 *   { value, asOf, source, status, isEdited, reason }
 *
 * Precedence (contract §P10.3 "Benchmark Contract"):
 *
 *   1. explicit manual override  — sticky until explicitly cleared; NO live
 *      response, valid or not, may replace an uncleared override;
 *   2. valid live response        — "latest" means the HIGHEST REQUEST SEQUENCE,
 *      not arrival order, so a slow older response can never win;
 *   3. dated snapshot fallback    — a malformed / stale / failed response falls
 *      back VISIBLY without mutating a held override or a newer valid price.
 *
 * The benchmark is a benchmark-only input (P10.0 ruling #1): it never
 * influences FCFF, FCFE, share issuance, terminal dilution, or the intrinsic
 * DCF per-share value. Issuance sensitivity uses the separate, frozen
 * `sbc_issuance_price` driver.
 *
 * Pure, deterministic, deeply frozen. No DOM, no fetch, no Date.now,
 * no Math.random. Zero bare numeric literals > 999 outside comments.
 *
 * @module src/engine/benchmark
 */

import { EngineError } from '../data/errors.js';

/** Benchmark statuses, in precedence order. */
export const BENCHMARK_STATUS = Object.freeze({
  /** An explicit manual override is held. */
  OVERRIDE: 'override',
  /** A validated live response is held. */
  LIVE: 'live',
  /** The dated snapshot driver close is held (initial or fallback state). */
  SNAPSHOT: 'snapshot',
  /** The held live value could not be refreshed; the newer price is preserved. */
  STALE_LIVE: 'stale_live',
});

/** Benchmark source kinds, so a consumer can tell provenance without parsing text. */
export const BENCHMARK_SOURCE = Object.freeze({
  MANUAL: 'manual_override',
  LIVE: 'live_response',
  SNAPSHOT: 'dated_snapshot',
});

/**
 * Deeply freezes an object graph.
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
 * Builds the single canonical benchmark object.
 *
 * Every field is validated here rather than at each consumer, so an invalid
 * benchmark can never reach a view. `source` is frozen so no consumer can
 * mutate the provenance of the object another consumer is reading.
 *
 * @param {object} input
 * @param {number} input.value Benchmark price (finite, strictly positive).
 * @param {string} input.asOf ISO `YYYY-MM-DD` as-of date.
 * @param {object} input.source `{ kind, provider, url? }`.
 * @param {string} input.status One of `BENCHMARK_STATUS`.
 * @param {boolean} [input.isEdited=false] True only for a manual override.
 * @param {string} [input.reason=''] Human-readable provenance / fallback reason.
 * @param {number} [input.sequence=-1] Request sequence that produced this value.
 * @returns {Readonly<object>} The canonical benchmark object.
 * @throws {EngineError} `invalid_benchmark` on any malformed field.
 */
export function createBenchmark(input) {
  if (!input || typeof input !== 'object') {
    throw new EngineError(
      'invalid_benchmark',
      'createBenchmark requires an input object of shape { value, asOf, source, status, reason }.',
      'benchmark',
    );
  }

  const { value, asOf, source, status } = input;
  const isEdited = input.isEdited === true;
  const reason = typeof input.reason === 'string' ? input.reason : '';
  const sequence = Number.isFinite(input.sequence) ? input.sequence : -1;

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new EngineError(
      'invalid_benchmark',
      `Benchmark value must be a positive finite number (received ${JSON.stringify(value)}).`,
      'benchmark.value',
    );
  }
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new EngineError(
      'invalid_benchmark',
      `Benchmark asOf must be an ISO YYYY-MM-DD date (received ${JSON.stringify(asOf)}).`,
      'benchmark.asOf',
    );
  }
  const validStatuses = Object.values(BENCHMARK_STATUS);
  if (!validStatuses.includes(status)) {
    throw new EngineError(
      'invalid_benchmark',
      `Benchmark status must be one of ${validStatuses.join(', ')} (received ${JSON.stringify(status)}).`,
      'benchmark.status',
    );
  }
  if (
    !source ||
    typeof source !== 'object' ||
    typeof source.kind !== 'string' ||
    typeof source.provider !== 'string' ||
    source.provider.length === 0
  ) {
    throw new EngineError(
      'invalid_benchmark',
      'Benchmark source must carry a non-empty { kind, provider } (url optional).',
      'benchmark.source',
    );
  }
  if (isEdited && status !== BENCHMARK_STATUS.OVERRIDE) {
    throw new EngineError(
      'invalid_benchmark',
      'A benchmark may only be marked isEdited when its status is "override".',
      'benchmark.isEdited',
    );
  }
  if (isEdited && source.kind !== BENCHMARK_SOURCE.MANUAL) {
    throw new EngineError(
      'invalid_benchmark',
      'A manual override must declare source.kind "manual_override".',
      'benchmark.source.kind',
    );
  }

  // Presentation-only fields.
  const displayInput = input.display && typeof input.display === 'object' ? input.display : {};
  const display = Object.freeze({
    intradayPrice: null,
    isOfficialClose: true,
    bannerText: typeof displayInput.bannerText === 'string' ? displayInput.bannerText : null,
  });

  return deepFreeze({
    value,
    asOf,
    source: Object.freeze({
      kind: source.kind,
      provider: source.provider,
      url: typeof source.url === 'string' ? source.url : null,
    }),
    status,
    isEdited,
    reason,
    sequence,
    display,
  });
}

/**
 * Creates the initial benchmark from the dated snapshot driver close.
 *
 * @param {object} snapshot
 * @param {number} snapshot.value Snapshot close price.
 * @param {string} snapshot.asOf Snapshot as-of date.
 * @param {string} snapshot.provider Snapshot provider.
 * @param {string} [snapshot.url] Snapshot source URL.
 * @param {string} [reason] Fallback reason to disclose.
 * @returns {Readonly<object>} The canonical snapshot benchmark.
 */
export function createSnapshotBenchmark(snapshot) {
  const reason =
    typeof snapshot?.reason === 'string' && snapshot.reason.length > 0
      ? snapshot.reason
      : 'Dated snapshot close from the MKT driver; no live response has been applied.';
  return createBenchmark({
    value: snapshot?.value,
    asOf: snapshot?.asOf,
    source: {
      kind: BENCHMARK_SOURCE.SNAPSHOT,
      provider: snapshot?.provider,
      url: snapshot?.url,
    },
    status: BENCHMARK_STATUS.SNAPSHOT,
    isEdited: false,
    reason,
    sequence: -1,
  });
}

/**
 * Creates a manual-override benchmark.
 *
 * @param {object} input `{ value, asOf?, provider?, url? }`
 * @returns {Readonly<object>} The canonical override benchmark.
 */
export function createOverrideBenchmark(input) {
  return createBenchmark({
    value: input?.value,
    asOf: input?.asOf,
    source: {
      kind: BENCHMARK_SOURCE.MANUAL,
      provider: input?.provider || 'manual',
      url: input?.url ?? null,
    },
    status: BENCHMARK_STATUS.OVERRIDE,
    isEdited: true,
    reason: 'Manual benchmark override held; no live response can replace it until it is cleared.',
    sequence: Number.isFinite(input?.sequence) ? input.sequence : -1,
  });
}

/**
 * Creates a live-response benchmark.
 *
 * @param {object} input `{ value, asOf, provider, url?, sequence }`
 * @returns {Readonly<object>} The canonical live benchmark.
 */
export function createLiveBenchmark(input) {
  return createBenchmark({
    value: input?.value,
    asOf: input?.asOf,
    source: {
      kind: BENCHMARK_SOURCE.LIVE,
      provider: input?.provider,
      url: input?.url,
    },
    status: BENCHMARK_STATUS.LIVE,
    isEdited: false,
    reason: 'Validated live response: last completed official close.',
    sequence: input?.sequence,
    display: {
      intradayPrice: null,
      isOfficialClose: true,
      bannerText: null,
    },
  });
}

/**
 * Applies a live response to the currently held benchmark under the contract
 * precedence rules. This is the ONLY place a live response can change state.
 *
 * Rules, in order:
 *  1. An uncleared manual override is never replaced. The response is recorded
 *     as seen but the held override is returned unchanged, with the held value
 *     still marked `isEdited`.
 *  2. Among live responses, the highest request sequence wins. A response whose
 *     sequence is not greater than the held live sequence is ignored, so
 *     arrival order cannot matter.
 *  3. A failed / malformed / stale response never downgrades a held live
 *     benchmark: the held value is preserved and the status becomes
 *     `stale_live` with a visible reason.
 *
 * @param {Readonly<object>} held The benchmark currently held.
 * @param {object} response Outcome of a price request.
 * @param {boolean} response.ok True when the response passed every validation.
 * @param {number} response.sequence Request sequence that produced it.
 * @param {number} [response.value] Validated price, required when `ok`.
 * @param {string} [response.asOf] Validated as-of date, required when `ok`.
 * @param {string} [response.provider] Validated provider, required when `ok`.
 * @param {string} [response.url] Validated source URL.
 * @param {string} [response.error] Why the response was rejected, when `!ok`.
 * @returns {{ benchmark: Readonly<object>, accepted: boolean, reason: string }}
 */
export function applyLiveResponse(held, response) {
  if (!held || typeof held !== 'object') {
    throw new EngineError(
      'invalid_benchmark',
      'applyLiveResponse requires the currently held benchmark.',
      'benchmark',
    );
  }
  if (!response || typeof response !== 'object' || !Number.isFinite(response.sequence)) {
    throw new EngineError(
      'invalid_response',
      'applyLiveResponse requires a response carrying a finite request sequence.',
      'response',
    );
  }

  // Rule 1 — a manual override outranks every live response, valid or not.
  if (held.isEdited === true || held.status === BENCHMARK_STATUS.OVERRIDE) {
    return {
      benchmark: held,
      accepted: false,
      reason: 'Manual benchmark override is held; the live response did not replace it.',
    };
  }

  // Rule 3 — an invalid response never downgrades a held live benchmark.
  if (response.ok !== true) {
    const reason =
      typeof response.error === 'string' && response.error.length > 0
        ? response.error
        : 'Live price response was rejected by validation.';
    if (held.status === BENCHMARK_STATUS.LIVE) {
      return {
        benchmark: createBenchmark({
          value: held.value,
          asOf: held.asOf,
          source: held.source,
          status: BENCHMARK_STATUS.STALE_LIVE,
          isEdited: false,
          reason: `Held the newer valid live price; the latest attempt failed. ${reason}`,
          sequence: held.sequence,
        }),
        accepted: false,
        reason,
      };
    }
    // Held state is the snapshot: fall back visibly to the snapshot benchmark.
    return {
      benchmark: createBenchmark({
        value: held.value,
        asOf: held.asOf,
        source: held.source,
        status: BENCHMARK_STATUS.SNAPSHOT,
        isEdited: false,
        reason: `Fell back to the dated snapshot close. ${reason}`,
        sequence: held.sequence,
      }),
      accepted: false,
      reason,
    };
  }

  // Rule 2 — "latest" is the highest request sequence, never arrival order.
  if (held.status === BENCHMARK_STATUS.LIVE && response.sequence <= held.sequence) {
    return {
      benchmark: held,
      accepted: false,
      reason: `Ignored an older response (sequence ${response.sequence} <= held ${held.sequence}).`,
    };
  }

  return {
    benchmark: createLiveBenchmark({
      value: response.value,
      asOf: response.asOf,
      provider: response.provider,
      url: response.url,
      sequence: response.sequence,
      intradayPrice: response.intradayPrice,
      isOfficialClose: response.isOfficialClose,
      bannerText: response.bannerText,
    }),
    accepted: true,
    reason: 'Applied the highest-sequence valid live response.',
  };
}

/**
 * Clears a manual override, restoring precedence to the best available state.
 *
 * @param {Readonly<object>} held The benchmark currently held.
 * @param {Readonly<object>|null} [lastLive=null] Best live benchmark seen while
 *   the override was held, or `null` when none was ever validated.
 * @param {Readonly<object>} snapshot The dated snapshot benchmark.
 * @returns {Readonly<object>} The restored benchmark.
 */
export function clearOverride(held, lastLive, snapshot) {
  if (lastLive && typeof lastLive === 'object' && lastLive.status === BENCHMARK_STATUS.LIVE) {
    return lastLive;
  }
  if (held && held.status === BENCHMARK_STATUS.STALE_LIVE) {
    return createBenchmark({
      value: held.value,
      asOf: held.asOf,
      source: held.source,
      status: BENCHMARK_STATUS.STALE_LIVE,
      isEdited: false,
      reason: held.reason,
      sequence: held.sequence,
    });
  }
  return snapshot;
}

/**
 * True when two benchmarks are the same consumer-visible benchmark.
 *
 * Idempotency (contract gate "Repeated equal values are idempotent") is decided
 * on the consumer-visible fields. `reason` IS one of them: a re-applied
 * identical price that carries a NEW disclosure (a failed refresh, a cleared
 * override) must still surface to the user, so a reason change is a change.
 *
 * @param {Readonly<object>} a
 * @param {Readonly<object>} b
 * @returns {boolean}
 */
export function isSameBenchmark(a, b) {
  if (!a || !b) return a === b;
  return (
    a.value === b.value &&
    a.asOf === b.asOf &&
    a.status === b.status &&
    a.isEdited === b.isEdited &&
    a.reason === b.reason &&
    a.source.kind === b.source.kind &&
    a.source.provider === b.source.provider &&
    a.source.url === b.source.url
  );
}

export default Object.freeze({
  BENCHMARK_STATUS,
  BENCHMARK_SOURCE,
  createBenchmark,
  createSnapshotBenchmark,
  createOverrideBenchmark,
  createLiveBenchmark,
  applyLiveResponse,
  clearOverride,
  isSameBenchmark,
});
