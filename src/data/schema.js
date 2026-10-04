/**
 * Historical record schemas and the record validator.
 *
 * Every historical figure must satisfy one of these schemas before it can enter
 * the data layer. `validateRecord` is total: it never throws on malformed input,
 * it returns the errors  -  that property is what lets the loader collect *every*
 * offender in a single pass instead of failing on the first bad row.
 *
 * @module src/data/schema
 */

import { KLASS_VALUES, PERIOD_TYPE_VALUES, UNIT_KEYS, MARKING_VALUES } from './constants.js';

/**
 * Absolute http(s) URL, as required for every citation link.
 * @type {RegExp}
 */
const URL_PATTERN = /^https?:\/\/\S+$/;

/**
 * Calendar date in `YYYY-MM-DD` form, used by `source.accessedAt`.
 * @type {RegExp}
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Runtime type label used in error messages.
 * @param {unknown} value
 * @returns {string}
 */
function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/**
 * @param {string} field
 * @param {string} message
 * @param {string} [origin]
 * @returns {{ field: string, message: string, source?: string }}
 */
function makeError(field, message, origin) {
  return origin === undefined ? { field, message } : { field, message, source: origin };
}

/**
 * A source citation, per `docs/spec.md` §3.1. This is the object that makes a
 * figure traceable  -  no historical number may exist without one.
 *
 * @type {Readonly<Record<string, object>>}
 */
const SOURCE_FIELDS = Object.freeze({
  filing: { type: 'string', required: true, nonEmpty: true },
  period: { type: 'string', required: true, nonEmpty: true },
  statement: { type: 'string', required: true, nonEmpty: true },
  url: {
    type: 'string',
    required: true,
    pattern: URL_PATTERN,
    patternHint: 'an absolute http(s) URL',
  },
  accessedAt: {
    type: 'string',
    required: true,
    pattern: ISO_DATE_PATTERN,
    patternHint: 'a calendar date (YYYY-MM-DD)',
  },
});

/**
 * Income statement, balance sheet, and cash flow statement rows.
 * @type {Readonly<Record<string, object>>}
 */
const HISTORICAL_STATEMENT_FIELDS = Object.freeze({
  metric: { type: 'string', required: true, nonEmpty: true },
  label: { type: 'string', required: true, nonEmpty: true },
  klass: { type: 'string', required: true, enum: KLASS_VALUES },
  period: { type: 'string', required: true, nonEmpty: true },
  periodType: { type: 'string', required: true, enum: PERIOD_TYPE_VALUES },

  /** Value exactly as filed. Negative numbers are legitimate (e.g. net loss). */
  value: { type: 'number', required: true, finite: true },

  units: { type: 'string', required: true, enum: UNIT_KEYS },
  scale: { type: 'number', required: true, positive: true },

  isEstimate: { type: 'boolean', required: true },

  source: {
    type: 'object',
    requiredWhen: (record) => record.isEstimate === false,
    requiredHint:
      'a historical actual requires a full source citation (filing, period, statement, url, accessedAt)',
    fields: SOURCE_FIELDS,
  },
});

/**
 * KPI rows (DAU, MAU, paid subscribers, bookings, adjusted EBITDA).
 *
 * `klass` deliberately accepts all three classes rather than only `kpi`: several
 * KPIs are flow metrics (bookings, adjusted EBITDA) and must aggregate over four
 * quarters for TTM, while others are point-in-time readings (DAU, MAU, paid
 * subscribers) and must not. The `definition` and `category` fields hold the
 * filing/IR wording verbatim, per spec §3.1.
 *
 * @type {Readonly<Record<string, object>>}
 */
const KPI_FIELDS = Object.freeze({
  ...HISTORICAL_STATEMENT_FIELDS,
  definition: { type: 'string', required: true, nonEmpty: true },
  category: { type: 'string', required: true, nonEmpty: true },
});

/**
 * A market-data source, per the P4.1 Artifact Contract. Distinct from
 * `SOURCE_FIELDS`: a market snapshot is not a filing citation, so it names a
 * `provider` (and optionally a `url`) rather than filing/period/statement.
 *
 * @type {Readonly<Record<string, object>>}
 */
const MARKET_SOURCE_FIELDS = Object.freeze({
  provider: { type: 'string', required: true, nonEmpty: true },
  url: {
    type: 'string',
    pattern: URL_PATTERN,
    patternHint: 'an absolute http(s) URL',
  },
});

/**
 * Scenario delta fields schema.
 * @type {Readonly<Record<string, object>>}
 */
const SCENARIO_DELTAS_FIELDS = Object.freeze({
  bear: { type: 'number', required: true, finite: true },
  bull: { type: 'number', required: true, finite: true },
});

/**
 * Assumption driver fields schema.
 * @type {Readonly<Record<string, object>>}
 */
const ASSUMPTION_DRIVER_FIELDS = Object.freeze({
  name: { type: 'string', required: true, nonEmpty: true },
  label: { type: 'string', required: true, nonEmpty: true },
  group: { type: 'string', required: true, nonEmpty: true },
  value: { types: ['number', 'string'], required: true },
  min: {
    type: 'number',
    requiredWhen: (rec) => typeof rec.value === 'number',
    finite: true,
  },
  max: {
    type: 'number',
    requiredWhen: (rec) => typeof rec.value === 'number',
    finite: true,
  },
  step: {
    type: 'number',
    requiredWhen: (rec) => typeof rec.value === 'number',
    positive: true,
  },
  units: { type: 'string', required: true, nonEmpty: true },
  scenarioDeltas: {
    type: 'object',
    requiredWhen: (rec) => typeof rec.value === 'number',
    fields: SCENARIO_DELTAS_FIELDS,
  },
  notes: { type: 'string', required: true, nonEmpty: true },

  /**
   * P4.1 additive extension  -  the sanctioned key for market-input provenance.
   *
   * `marking` is optional, not `requiredWhen: group === 'market'`: `scenarios.apply`
   * rebuilds each driver from a fixed field list that does not (yet) carry
   * `marking`, so requiring it would make every scenario application fail schema
   * validation on the new market drivers. `wacc.build` enforces the marking
   * discipline fail-closed at the point of use instead  -  see
   * `assertMarketDriverDiscipline`  -  and raises a `ConfigError` naming every
   * offender rather than letting an unmarked market input through silently.
   */
  marking: {
    type: 'string',
    enum: MARKING_VALUES,
  },
  asOf: {
    type: 'string',
    requiredWhen: (record) => record.group === 'market' && record.marking === 'MKT',
    requiredHint: 'an as-of date (YYYY-MM-DD) for every MKT-labeled market driver',
    pattern: ISO_DATE_PATTERN,
    patternHint: 'a calendar date (YYYY-MM-DD)',
  },
  source: {
    type: 'object',
    requiredWhen: (record) => record.group === 'market' && record.marking === 'MKT',
    requiredHint: 'a market source { provider, url? } for every MKT-labeled market driver',
    fields: MARKET_SOURCE_FIELDS,
  },
});

/**
 * @typedef {object} Schema
 * @property {string} name
 * @property {Readonly<Record<string, object>>} fields
 */

/**
 * The registered record schemas.
 * @type {Readonly<Record<string, Schema>>}
 */
const schemasTarget = {
  historicalStatement: Object.freeze({
    name: 'historicalStatement',
    fields: HISTORICAL_STATEMENT_FIELDS,
  }),
  kpi: Object.freeze({ name: 'kpi', fields: KPI_FIELDS }),
  source: Object.freeze({ name: 'source', fields: SOURCE_FIELDS }),
};

Object.defineProperty(schemasTarget, 'assumptionDriver', {
  value: Object.freeze({
    name: 'assumptionDriver',
    fields: ASSUMPTION_DRIVER_FIELDS,
  }),
  enumerable: false,
  writable: false,
  configurable: false,
});

/**
 * Phase 10 Valuation Context schema fields.
 * Validates immutable valuation context artifacts.
 */
export const VALUATION_CONTEXT_FIELDS = Object.freeze({
  canonical: { type: 'boolean', required: true },
  effective_valuation_date: {
    type: 'string',
    required: true,
    pattern: ISO_DATE_PATTERN,
    patternHint: 'a calendar date (YYYY-MM-DD)',
  },
  reporting_cutoff: {
    type: 'string',
    required: true,
    pattern: ISO_DATE_PATTERN,
    patternHint: 'a calendar date (YYYY-MM-DD)',
  },
  terminal_period: { type: 'string', required: true, nonEmpty: true },
  forecast_periods: { type: 'object', required: true },
  dcf_periods: { type: 'object', required: true },
  shares: { type: 'object', required: true },
  share_issuance_policy: { type: 'object', required: true },
  benchmark_price: { type: 'object', required: true },
  evidence_clusters: { type: 'object', required: true },
});

Object.defineProperty(schemasTarget, 'valuationContext', {
  value: Object.freeze({
    name: 'valuationContext',
    fields: VALUATION_CONTEXT_FIELDS,
  }),
  enumerable: false,
  writable: false,
  configurable: false,
});

export const SCHEMAS = Object.freeze(schemasTarget);



/**
 * @param {object} rule
 * @param {object} record
 * @returns {boolean}
 */
function isRequired(rule, record) {
  if (rule.required === true) return true;
  return typeof rule.requiredWhen === 'function' && rule.requiredWhen(record) === true;
}

/**
 * @param {object} rule
 * @returns {string}
 */
function describeRequirement(rule) {
  if (rule.requiredHint) return `is required  -  ${rule.requiredHint}.`;
  return 'is required.';
}

/**
 * @param {unknown} value
 * @param {object} rule
 * @param {string} field
 * @param {Array<{ field: string, message: string, source?: string }>} errors
 * @param {string} [origin]
 * @returns {void}
 */
function validateValue(value, rule, field, errors, origin) {
  const actual = typeOf(value);

  if (rule.types && !rule.types.includes(actual)) {
    errors.push(makeError(field, `must be one of types: ${rule.types.join(', ')} (received ${actual}).`, origin));
    return;
  }

  if (rule.type && actual !== rule.type) {
    errors.push(makeError(field, `must be a ${rule.type} (received ${actual}).`, origin));
    return;
  }

  if (rule.nonEmpty && typeof value === 'string' && value.trim() === '') {
    errors.push(makeError(field, 'must be a non-empty string.', origin));
    return;
  }

  if (rule.enum && !rule.enum.includes(value)) {
    errors.push(
      makeError(field, `must be one of: ${rule.enum.join(', ')} (received "${value}").`, origin),
    );
  }

  if (rule.finite && (typeof value !== 'number' || !Number.isFinite(value))) {
    errors.push(makeError(field, `must be a finite number (received ${value}).`, origin));
  }

  if (rule.positive && !(Number.isFinite(value) && value > 0)) {
    errors.push(makeError(field, `must be a positive number (received ${value}).`, origin));
  }

  if (rule.pattern && !rule.pattern.test(String(value))) {
    errors.push(
      makeError(
        field,
        `must be ${rule.patternHint ?? `matching ${rule.pattern}`} (received "${value}").`,
        origin,
      ),
    );
  }

  if (rule.fields) {
    if (isPlainObject(value)) {
      validateFields(value, rule.fields, field, errors, origin);
    } else {
      errors.push(makeError(field, 'must be an object of citation fields.', origin));
    }
  }
}

/**
 * @param {object} container
 * @param {Readonly<Record<string, object>>} fields
 * @param {string} path
 * @param {Array<{ field: string, message: string, source?: string }>} errors
 * @param {string} [origin]
 * @returns {void}
 */
function validateFields(container, fields, path, errors, origin) {
  for (const [name, rule] of Object.entries(fields)) {
    const field = path ? `${path}.${name}` : name;
    const has = Object.prototype.hasOwnProperty.call(container, name);
    const value = container[name];

    if (!has || value === undefined || value === null) {
      if (isRequired(rule, container)) {
        errors.push(makeError(field, describeRequirement(rule), origin));
      }
      continue;
    }

    validateValue(value, rule, field, errors, origin);
  }
}

/**
 * @typedef {object} ValidationError
 * @property {string} field Dotted path of the offending field (e.g. `source.url`).
 * @property {string} message Precise, field-specific description.
 * @property {string} [source] Origin label (e.g. dataset file path) when supplied.
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean} ok
 * @property {ValidationError[]} errors
 */

/**
 * Validates a single record against a schema.
 *
 * Total function: malformed input of any shape (null, primitive, array, wrong
 * schema) yields `{ ok: false, errors }`  -  it never throws. This is what allows
 * the loader to report every bad row in one pass instead of aborting.
 *
 * @param {unknown} rec Record to validate.
 * @param {Schema} schema Schema to validate against.
 * @param {string} [origin] Optional origin label attached to each error as `source`.
 * @returns {ValidationResult}
 */
export function validateRecord(rec, schema, origin) {
  if (!isPlainObject(schema) || !isPlainObject(schema.fields)) {
    return {
      ok: false,
      errors: [makeError('<schema>', 'A schema object with a `fields` map is required.', origin)],
    };
  }

  if (!isPlainObject(rec)) {
    return {
      ok: false,
      errors: [makeError('<record>', 'Record must be a plain object.', origin)],
    };
  }

  /** @type {ValidationError[]} */
  const errors = [];
  validateFields(rec, schema.fields, '', errors, origin);

  // Invariant range validation for assumptionDriver schema
  if (schema.name === 'assumptionDriver' || schema === SCHEMAS.assumptionDriver) {
    const hasMin = typeof rec.min === 'number' && Number.isFinite(rec.min);
    const hasMax = typeof rec.max === 'number' && Number.isFinite(rec.max);
    const hasValue = typeof rec.value === 'number' && Number.isFinite(rec.value);

    if (hasMin && hasMax && rec.min > rec.max) {
      errors.push(
        makeError(
          'min',
          `must not be greater than max (min: ${rec.min}, max: ${rec.max}).`,
          origin,
        ),
      );
    }
    if (hasMin && hasValue && rec.value < rec.min) {
      errors.push(
        makeError(
          'value',
          `must be >= min (value: ${rec.value}, min: ${rec.min}).`,
          origin,
        ),
      );
    }
    if (hasMax && hasValue && rec.value > rec.max) {
      errors.push(
        makeError(
          'value',
          `must be <= max (value: ${rec.value}, max: ${rec.max}).`,
          origin,
        ),
      );
    }
  }

  return { ok: errors.length === 0, errors };
}


/**
 * Extracts the record rows from a parsed dataset file.
 *
 * Two shapes are accepted: a bare array of records, or an object with a `rows`
 * array. Shared by the loader and the audit engine so both agree on what a
 * dataset looks like.
 *
 * @param {unknown} datasetValue A parsed dataset file.
 * @returns {Array<unknown> | null} The rows, or `null` when the shape is unrecognized.
 */
export function extractRows(datasetValue) {
  if (Array.isArray(datasetValue)) return datasetValue;
  if (isPlainObject(datasetValue) && Array.isArray(datasetValue.rows)) return datasetValue.rows;
  return null;
}
