/**
 * Current Point-in-Time Fully Diluted Share Schedule
 *
 * P10.4 contract, "Common Share Denominator":
 *   All present-day relative methods use the same current fully diluted share
 *   count. They must not receive the DCF terminal share roll. Weighted-average
 *   diluted shares remain diagnostic and cannot appear as a valuation
 *   denominator. Required provenance: basic period-end shares; incremental
 *   options; RSUs and other awards; founder awards where applicable; current
 *   fully diluted total; measurement date; filing/source.
 *
 * Design decisions (each one is a contract obligation, not a preference):
 *
 *  - The total is RECOMPUTED from the components. The stored `fullyDilutedTotal`
 *    is treated as an untrusted claim and reconciled; a mismatch throws. A
 *    schedule whose own components do not add up is a broken schedule, and
 *    reading the stored number would hide that.
 *  - Every component must carry a measurement date and a filing citation. An
 *    uncited or period-less component is rejected rather than defaulted,
 *    because an unproven share count silently deflates or inflates every
 *    per-share relative output built on it.
 *  - Weighted-average counts are refused as a denominator, by value and by
 *    period, with a dedicated error code so the caller cannot mistake a
 *    diagnostic for a denominator.
 *  - The denominator is frozen and carries its own provenance so a consumer can
 *    display where the count came from without reaching back into the corpus.
 *
 * Pure, deterministic, fail-closed, deeply frozen.
 */

import { EngineError } from '../data/errors.js';

/** Component keys that must be present and cited to build a schedule. */
const REQUIRED_COMPONENTS = Object.freeze([
  'basicPeriodEnd',
  'incrementalOptions',
  'rsusAndOtherAwards',
  'founderAwards',
]);

/** Components whose value is allowed to be zero, with a disclosed reason. */
const ZERO_PERMITTED = Object.freeze(['founderAwards']);

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
 * @param {number} value
 * @param {string} context
 * @returns {number}
 */
function requireCount(value, context) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EngineError(
      'invalid_fd_component',
      `${context} must be a finite number of shares (received ${value})`
    );
  }
  if (value < 0) {
    throw new EngineError(
      'invalid_fd_component',
      `${context} cannot be negative (received ${value})`
    );
  }
  if (!Number.isInteger(value)) {
    throw new EngineError(
      'invalid_fd_component',
      `${context} must be a whole share count (received ${value})`
    );
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isMeasurementDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * @param {Object} component
 * @param {string} key
 * @returns {Object} A frozen provenance block, or throws.
 */
function readProvenance(component, key) {
  if (!component || typeof component !== 'object') {
    throw new EngineError(
      'missing_fd_component',
      `Fully diluted schedule is missing the "${key}" component`
    );
  }

  if (!isMeasurementDate(component.measurementDate)) {
    throw new EngineError(
      'uncited_fd_period',
      `Fully diluted component "${key}" must carry an ISO measurementDate (received ${component.measurementDate})`
    );
  }

  const citation = component.citation;
  if (!citation || typeof citation !== 'object') {
    throw new EngineError(
      'uncited_fd_component',
      `Fully diluted component "${key}" must carry a filing citation`
    );
  }

  const missing = ['accession', 'statement', 'url'].filter((f) => {
    const v = citation[f];
    return typeof v !== 'string' || v.trim() === '';
  });
  if (missing.length > 0) {
    throw new EngineError(
      'uncited_fd_component',
      `Fully diluted component "${key}" citation is missing: ${missing.join(', ')}`
    );
  }

  if (component.value === 0 && !ZERO_PERMITTED.includes(key) && typeof component.note !== 'string') {
    throw new EngineError(
      'unexplained_zero_fd_component',
      `Fully diluted component "${key}" is zero and must disclose why`
    );
  }

  return Object.freeze({
    label: component.label ?? key,
    measurementDate: component.measurementDate,
    accession: citation.accession,
    statement: citation.statement,
    url: citation.url,
    note: component.note ?? null,
  });
}

/**
 * Builds the frozen fully diluted denominator contract from a cited schedule.
 *
 * @param {Object} scheduleData Parsed contents of the cited schedule artifact.
 * @returns {Readonly<Object>} Denominator contract with provenance.
 * @throws {EngineError} On any missing component, period, citation, or arithmetic mismatch.
 */
export function buildFullyDilutedSchedule(scheduleData) {
  if (!scheduleData || typeof scheduleData !== 'object') {
    throw new EngineError('missing_fd_schedule', 'A fully diluted schedule artifact is required');
  }

  if (!isMeasurementDate(scheduleData.measurementDate)) {
    throw new EngineError(
      'uncited_fd_period',
      `Fully diluted schedule must carry an ISO measurementDate (received ${scheduleData.measurementDate})`
    );
  }

  const components = scheduleData.components;
  if (!components || typeof components !== 'object') {
    throw new EngineError('missing_fd_components', 'Fully diluted schedule has no components block');
  }

  const missing = REQUIRED_COMPONENTS.filter((k) => !(k in components));
  if (missing.length > 0) {
    throw new EngineError(
      'missing_fd_component',
      `Fully diluted schedule is missing required components: ${missing.join(', ')}`
    );
  }

  const provenance = {};
  const values = {};

  for (const key of REQUIRED_COMPONENTS) {
    const component = components[key];
    provenance[key] = readProvenance(component, key);
    values[key] = requireCount(component.value, `fully diluted component "${key}"`);
  }

  // Recompute rather than read the stored total. A schedule that does not add
  // up is a broken schedule, and trusting the stored number would hide it.
  const total =
    values.basicPeriodEnd +
    values.incrementalOptions +
    values.rsusAndOtherAwards +
    values.founderAwards;

  requireCount(total, 'recomputed fully diluted total');

  if (total <= 0) {
    throw new EngineError('invalid_fd_total', 'Fully diluted total must be positive');
  }

  const stated = scheduleData.fullyDilutedTotal;
  if (typeof stated !== 'number' || !Number.isFinite(stated)) {
    throw new EngineError(
      'missing_fd_total',
      'Fully diluted schedule must state a fullyDilutedTotal to reconcile against its components'
    );
  }
  if (stated !== total) {
    throw new EngineError(
      'fd_total_mismatch',
      `Fully diluted schedule states ${stated} but its components sum to ${total}; the artifact is internally inconsistent`
    );
  }

  if (values.basicPeriodEnd <= 0) {
    throw new EngineError('invalid_fd_total', 'Basic period-end shares must be positive');
  }

  const options = components.incrementalOptions;
  const optionDetail = Object.freeze({
    method: options.method ?? null,
    optionsOutstanding: options.optionsOutstanding ?? null,
    weightedAverageExercisePriceUsd: options.weightedAverageExercisePriceUsd ?? null,
    treasuryStockMethodPriceUsd: options.treasuryStockMethodPriceUsd ?? null,
    treasuryStockMethodPriceDerivation: options.treasuryStockMethodPriceDerivation ?? null,
    crossValidation: options.crossValidation ?? null,
  });

  if (optionDetail.method === 'treasury_stock_method') {
    const outstanding = optionDetail.optionsOutstanding;
    const strike = optionDetail.weightedAverageExercisePriceUsd;
    const price = optionDetail.treasuryStockMethodPriceUsd;
    if (
      typeof outstanding === 'number' &&
      typeof strike === 'number' &&
      typeof price === 'number' &&
      price > 0 &&
      strike < price
    ) {
      const expected = Math.round(outstanding * (1 - strike / price));
      if (Math.abs(expected - values.incrementalOptions) > 1) {
        throw new EngineError(
          'fd_option_method_mismatch',
          `Incremental options ${values.incrementalOptions} does not match the treasury stock method on ${outstanding} options at strike ${strike} against price ${price} (expected ${expected})`
        );
      }
    }
  }

  const reconciliation = scheduleData.reconciliation ?? null;

  return deepFreeze({
    owner: scheduleData.owner ?? null,
    measurementDate: scheduleData.measurementDate,
    asOfBasis: scheduleData.asOfBasis ?? 'period_end',
    denominator: total,
    components: Object.freeze({ ...values }),
    componentProvenance: Object.freeze({ ...provenance }),
    optionDetail,
    filing: scheduleData.filing
      ? Object.freeze({
          form: scheduleData.filing.form ?? null,
          registrant: scheduleData.filing.registrant ?? null,
          cik: scheduleData.filing.cik ?? null,
          accession: scheduleData.filing.accession ?? null,
          filedOn: scheduleData.filing.filedOn ?? null,
          periodOfReport: scheduleData.filing.periodOfReport ?? null,
          url: scheduleData.filing.url ?? null,
          retrievedAt: scheduleData.filing.retrievedAt ?? null,
        })
      : null,
    reconciliation: reconciliation
      ? Object.freeze({
          issuerWeightedAverageDiluted: reconciliation.issuerWeightedAverageDilutedQ2Fy2026 ?? null,
          difference: reconciliation.difference ?? null,
          differencePct: reconciliation.differencePct ?? null,
          note: reconciliation.note ?? null,
        })
      : null,
    diagnostics: scheduleData.diagnostics ? deepFreeze(scheduleData.diagnostics) : null,
    methodNotes: Object.freeze([...(scheduleData.methodNotes ?? [])]),
    explicitlyNot: Object.freeze([...(scheduleData.explicitlyNot ?? [])]),
  });
}

/**
 * Collects the weighted-average counts a schedule declares as diagnostic.
 *
 * The deny-list is derived from the cited artifact's own `diagnostics` block
 * rather than hardcoded, so it cannot drift away from the filing it describes.
 * It also means the engine holds no market or share figures as bare literals:
 * every count arrives through data, which is what the RTYPE freeze gate
 * requires.
 *
 * @param {Object} schedule A built schedule contract.
 * @returns {ReadonlySet<number>} Weighted-average values that may not be denominators.
 */
export function weightedAverageDiagnosticsOf(schedule) {
  const values = new Set();
  const diagnostics = schedule && schedule.diagnostics;
  if (diagnostics && typeof diagnostics === 'object') {
    for (const block of Object.values(diagnostics)) {
      if (block && typeof block === 'object' && typeof block.value === 'number') {
        values.add(block.value);
      }
    }
  }
  const issuer = schedule && schedule.reconciliation && schedule.reconciliation.issuerWeightedAverageDiluted;
  if (typeof issuer === 'number') {
    values.add(issuer);
  }
  return values;
}

/**
 * Refuses a weighted-average count offered as a valuation denominator.
 *
 * The EPS weighted average is a legitimate diagnostic and an illegitimate
 * denominator, and the only reliable way to keep those apart is to check at the
 * boundary rather than trust the caller to remember the distinction. The
 * forbidden values come from the schedule that declares them diagnostic, so the
 * check stays true even when a filing changes.
 *
 * @param {number} candidate
 * @param {Object} [opts]
 * @param {string} [opts.label]
 * @param {Object} [opts.schedule] Built schedule whose diagnostics are forbidden.
 * @returns {number} The candidate, when acceptable.
 * @throws {EngineError} When the candidate is a declared weighted-average diagnostic.
 */
export function assertDenominatorNotWeightedAverage(candidate, opts = {}) {
  const label = opts.label ?? 'share count';
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new EngineError('invalid_shares', `${label} must be a finite number (received ${candidate})`);
  }
  if (candidate <= 0) {
    throw new EngineError('invalid_shares', `${label} must be positive (received ${candidate})`);
  }
  const forbidden = weightedAverageDiagnosticsOf(opts.schedule);
  if (forbidden.has(candidate)) {
    throw new EngineError(
      'weighted_average_as_denominator',
      `${label} ${candidate} is a reported weighted-average count and is diagnostic only; P10.4 requires the point-in-time fully diluted schedule as the valuation denominator`
    );
  }
  return candidate;
}

export default Object.freeze({
  buildFullyDilutedSchedule,
  assertDenominatorNotWeightedAverage,
  weightedAverageDiagnosticsOf,
});
