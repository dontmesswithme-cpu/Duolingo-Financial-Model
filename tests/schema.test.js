/**
 * P0.2 Artifact Contract tests  -  `src/data/schema.js`.
 *
 * Covers the happy path for all three schemas, every field-level violation with
 * a precise message, and the totality guarantee that malformed input of any
 * shape returns errors instead of throwing.
 *
 * NOTE ON FIXTURE VALUES: every number below is a synthetic placeholder. Phase 0
 * delivers machinery only  -  no Duolingo figure is transcribed until P1.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SCHEMAS, validateRecord } from '../src/data/schema.js';

/**
 * @param {object} [overrides]
 * @returns {object}
 */
function citation(overrides = {}) {
  return {
    filing: '10-K',
    period: 'Fiscal Year 2023',
    statement: 'Consolidated Statements of Operations',
    url: 'https://www.sec.gov/example-filing.htm',
    accessedAt: '2026-08-31',
    ...overrides,
  };
}

/**
 * @param {object} [overrides]
 * @returns {object}
 */
function statementRow(overrides = {}) {
  return {
    metric: 'revenue',
    label: 'Total Revenue',
    klass: 'flow',
    period: 'FY2023',
    periodType: 'fiscal_year',
    value: 1234567, // synthetic placeholder, not a filed figure
    units: 'thousands_usd',
    scale: 1000,
    isEstimate: false,
    source: citation(),
    ...overrides,
  };
}

/**
 * @param {object} [overrides]
 * @returns {object}
 */
function kpiRow(overrides = {}) {
  return {
    ...statementRow({ metric: 'dau', klass: 'kpi', value: 24200000 }),
    definition: 'Daily active users, as defined in the annual report.',
    category: 'Engagement',
    ...overrides,
  };
}

/**
 * @param {object} rec
 * @param {object} schema
 * @returns {string[]} Field paths reported by the validator.
 */
function fieldsInError(rec, schema) {
  return validateRecord(rec, schema).errors.map((error) => error.field);
}

describe('SCHEMAS  -  happy path', () => {
  test('accepts a fully-formed historical statement row', () => {
    const result = validateRecord(statementRow(), SCHEMAS.historicalStatement);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  test('accepts a fully-formed KPI row', () => {
    const result = validateRecord(kpiRow(), SCHEMAS.kpi);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  test('accepts a standalone source citation', () => {
    const result = validateRecord(citation(), SCHEMAS.source);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  test('registers exactly the three contracted schemas', () => {
    assert.deepEqual(Object.keys(SCHEMAS).sort(), ['historicalStatement', 'kpi', 'source']);
  });

  test('accepts zero and negative values (net loss / zero balances are real)', () => {
    assert.equal(validateRecord(statementRow({ value: 0 }), SCHEMAS.historicalStatement).ok, true);
    assert.equal(validateRecord(statementRow({ value: -98765 }), SCHEMAS.historicalStatement).ok, true);
  });

  test('accepts all three period types including ytd', () => {
    for (const periodType of ['fiscal_year', 'quarter', 'ytd']) {
      const row = statementRow({ periodType });
      assert.equal(
        validateRecord(row, SCHEMAS.historicalStatement).ok,
        true,
        `periodType ${periodType} must be accepted`,
      );
    }
  });
});

describe('Historical statement  -  field violations', () => {
  const schema = SCHEMAS.historicalStatement;

  test('missing metric, label, period, scale, isEstimate are each reported', () => {
    for (const field of ['metric', 'label', 'period', 'scale', 'isEstimate']) {
      const row = statementRow();
      delete row[field];
      assert.deepEqual(fieldsInError(row, schema), [field], `missing ${field} must be reported`);
    }
  });

  test('empty strings do not satisfy required text fields', () => {
    for (const field of ['metric', 'label', 'period']) {
      const row = statementRow({ [field]: '' });
      assert.deepEqual(fieldsInError(row, schema), [field]);
    }
  });

  test('wrong primitive types are reported with the received type', () => {
    assert.deepEqual(fieldsInError(statementRow({ metric: 42 }), schema), ['metric']);
    assert.deepEqual(fieldsInError(statementRow({ value: '1234567' }), schema), ['value']);
    assert.deepEqual(fieldsInError(statementRow({ isEstimate: 'false' }), schema), ['isEstimate']);
    assert.deepEqual(fieldsInError(statementRow({ source: 'a string' }), schema), ['source']);
  });

  test('klass is constrained to flow | stock | kpi', () => {
    assert.deepEqual(fieldsInError(statementRow({ klass: 'revenue' }), schema), ['klass']);
    for (const klass of ['flow', 'stock', 'kpi']) {
      assert.equal(validateRecord(statementRow({ klass }), schema).ok, true);
    }
  });

  test('periodType is constrained to fiscal_year | quarter | ytd', () => {
    assert.deepEqual(fieldsInError(statementRow({ periodType: 'annual' }), schema), ['periodType']);
  });

  test('value must be finite  -  NaN and Infinity are rejected', () => {
    assert.deepEqual(fieldsInError(statementRow({ value: Number.NaN }), schema), ['value']);
    assert.deepEqual(fieldsInError(statementRow({ value: Number.POSITIVE_INFINITY }), schema), ['value']);
  });

  test('units must be a known unit and scale must be positive', () => {
    assert.deepEqual(fieldsInError(statementRow({ units: 'euros' }), schema), ['units']);
    assert.deepEqual(fieldsInError(statementRow({ scale: 0 }), schema), ['scale']);
    assert.deepEqual(fieldsInError(statementRow({ scale: -1000 }), schema), ['scale']);
  });

  test('a historical actual without a source is rejected, naming the field', () => {
    const row = statementRow();
    delete row.source;
    const result = validateRecord(row, schema);
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.errors.map((error) => error.field),
      ['source'],
    );
    assert.match(result.errors[0].message, /source citation/);
  });

  test('nested citation fields are reported with a dotted path', () => {
    const row = statementRow({ source: citation({ url: 'www.sec.gov/no-scheme.htm' }) });
    assert.deepEqual(fieldsInError(row, schema), ['source.url']);

    const badDate = statementRow({ source: citation({ accessedAt: '31-08-2026' }) });
    assert.deepEqual(fieldsInError(badDate, schema), ['source.accessedAt']);

    const noFiling = statementRow({ source: citation({ filing: undefined }) });
    assert.deepEqual(fieldsInError(noFiling, schema), ['source.filing']);
  });
});

describe('KPI schema extensions', () => {
  const schema = SCHEMAS.kpi;

  test('requires definition and category beyond the statement fields', () => {
    const row = kpiRow();
    delete row.definition;
    assert.deepEqual(fieldsInError(row, schema), ['definition']);

    const other = kpiRow();
    delete other.category;
    assert.deepEqual(fieldsInError(other, schema), ['category']);
  });

  test('rejects empty definition text', () => {
    assert.deepEqual(fieldsInError(kpiRow({ definition: '   ' }), schema), ['definition']);
  });

  test('still enforces the inherited statement invariants', () => {
    const row = kpiRow();
    delete row.source;
    assert.deepEqual(fieldsInError(row, schema), ['source']);
  });
});

describe('Estimate rows & conditional source requirement', () => {
  test('an estimate row needs no source object', () => {
    const row = statementRow({ isEstimate: true });
    delete row.source;
    assert.equal(validateRecord(row, SCHEMAS.historicalStatement).ok, true);
  });

  test('an estimate row that carries a source must still have a valid one', () => {
    const row = statementRow({ isEstimate: true, source: citation({ url: 'not-a-url' }) });
    assert.deepEqual(fieldsInError(row, SCHEMAS.historicalStatement), ['source.url']);
  });
});

describe('Totality  -  malformed input never throws', () => {
  const malformed = [null, undefined, 'a string', 42, true, [], [statementRow()]];

  test('returns errors instead of throwing for every malformed record', () => {
    for (const input of malformed) {
      const result = validateRecord(input, SCHEMAS.historicalStatement);
      assert.equal(result.ok, false, `must reject ${String(input)}`);
      assert.ok(result.errors.length > 0);
    }
  });

  test('does not throw when the schema itself is malformed', () => {
    for (const badSchema of [null, undefined, {}, 42]) {
      const result = validateRecord(statementRow(), badSchema);
      assert.equal(result.ok, false);
      assert.equal(result.errors[0].field, '<schema>');
    }
  });
});

describe('ValidationResult shape', () => {
  test('every error carries a field path and a specific message', () => {
    const row = statementRow();
    delete row.metric;
    delete row.source;

    const { errors } = validateRecord(row, SCHEMAS.historicalStatement);
    assert.equal(errors.length, 2);
    for (const error of errors) {
      assert.equal(typeof error.field, 'string');
      assert.equal(typeof error.message, 'string');
      assert.ok(error.message.length > 0, 'message must never be blank');
      assert.doesNotMatch(error.message, /invalid record/i, 'messages must be specific');
    }
    assert.deepEqual(Object.keys(errors[0]).sort(), ['field', 'message']);
  });

  test('attaches the origin as `source` when one is supplied', () => {
    const row = statementRow();
    delete row.metric;

    const { errors } = validateRecord(row, SCHEMAS.historicalStatement, 'src/data/historical/income.json');
    assert.equal(errors[0].source, 'src/data/historical/income.json');
    assert.ok('source' in errors[0]);
  });
});
