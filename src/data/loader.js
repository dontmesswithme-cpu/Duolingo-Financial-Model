/**
 * Historical data loader — full pipeline (P0.2).
 *
 * `loadHistorical()` is the only door into the data layer, and it is locked:
 *
 *   discovery -> parse -> per-record `validateRecord` -> `auditDataset`
 *
 * Any violation at any stage throws a single `DataValidationError` naming every
 * offender. The app therefore cannot boot on uncited or malformed data — this is
 * the mechanical form of the project's Accuracy Gate.
 *
 * The loader is runtime-agnostic: it never imports `node:fs` at module scope,
 * because the target runtime is a zero-build static browser app where `fetch`
 * is the only file-access mechanism. Tests inject a `readText` reader, which is
 * what makes the loader deterministic and headless-testable.
 *
 * @module src/data/loader
 */

import { DataValidationError, EngineError } from './errors.js';
import { SCHEMAS, extractRows, validateRecord } from './schema.js';
import { auditDataset } from './audit.js';
import { HISTORICAL_DIR, HISTORICAL_DATASETS } from './constants.js';

/**
 * Which record schema governs each dataset file.
 * @type {Readonly<Record<string, string>>}
 */
const DATASET_SCHEMAS = Object.freeze({
  income: 'historicalStatement',
  balance: 'historicalStatement',
  cashflow: 'historicalStatement',
  kpis: 'kpi',
});

/** Placeholder used when a malformed row cannot identify itself. */
const UNKNOWN = '<unknown>';

/** Rule id for a dataset file that could not be read. */
const RULE_FILE_UNREADABLE = 'FILE_UNREADABLE';

/** Rule id for a dataset file that was read but is not valid JSON. */
const RULE_FILE_UNPARSEABLE = 'FILE_UNPARSEABLE';

/** Rule id for a parsed file whose top-level shape holds no record rows. */
const RULE_DATASET_SHAPE = 'DATASET_SHAPE';

/** Rule id for a record that failed schema validation. */
const RULE_SCHEMA_VIOLATION = 'SCHEMA_VIOLATION';

/**
 * @typedef {Object.<string, unknown>} HistoricalDataset
 * Parsed dataset keyed by dataset name (`income`, `balance`, `cashflow`, `kpis`).
 */

/**
 * @typedef {object} LoaderOptions
 * @property {string} [dir] Directory prefix for dataset files.
 * @property {(location: string) => Promise<string>} [readText] Injected file
 *   reader; required in Node, defaults to `fetch` in the browser.
 * @property {boolean} [requireLedger] Forward the `SOURCE_NOT_IN_LEDGER` gate to
 *   the audit engine. Injected so P0.3 can drive it from `SOURCE_LEDGER_REQUIRED`.
 * @property {Set<string>|Array<string|{url: string}>} [ledger] Known-good citation URLs.
 */

/**
 * Browser default reader. Resolves text via `fetch`, converting transport and
 * capability failures into typed errors so no bare `Error` escapes `src/`.
 *
 * @param {string} location
 * @returns {Promise<string>}
 */
function defaultReadText(location) {
  if (typeof fetch !== 'function') {
    throw new EngineError(
      'loader_no_reader',
      `Cannot read "${location}": no fetch implementation available. Inject a \`readText\` reader.`,
    );
  }
  return fetch(location).then((response) => {
    if (!response.ok) {
      throw new EngineError(
        'loader_http_error',
        `Request for "${location}" failed with HTTP ${response.status}.`,
      );
    }
    return response.text();
  });
}

/**
 * @param {string} location
 * @param {string} rule
 * @param {string} message
 * @returns {import('./errors.js').ViolationRecord}
 */
function fileViolation(location, rule, message) {
  return { file: location, rule, message };
}

/**
 * Reads an identifying string field off a possibly-malformed row.
 *
 * @param {unknown} row
 * @param {string} field
 * @returns {string}
 */
function readField(row, field) {
  if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
    const value = row[field];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return UNKNOWN;
}

/**
 * Renders the violation list into the error summary so that a single
 * `DataValidationError` names every offender at once.
 *
 * @param {import('./errors.js').ViolationRecord[]} violations
 * @returns {string}
 */
function formatViolations(violations) {
  return violations
    .map((violation) => {
      const parts = [];
      if (violation.file) parts.push(violation.file);
      if (violation.metric || violation.period) {
        parts.push(`${violation.metric ?? UNKNOWN} @ ${violation.period ?? UNKNOWN}`);
      }
      const subject = parts.length > 0 ? parts.join(' :: ') : UNKNOWN;
      return `  - ${subject}: ${violation.rule} — ${violation.message}`;
    })
    .join('\n');
}

/**
 * Loads, validates, and audits every historical dataset.
 *
 * Every stage collects rather than aborts: one call reports every unreadable
 * file, every unparseable file, every schema violation, and every audit breach
 * together. If anything at all was collected, a single `DataValidationError`
 * listing all of it is thrown and the dataset is never returned.
 *
 * @param {LoaderOptions} [options]
 * @returns {Promise<HistoricalDataset>} Resolves with the parsed, verified datasets.
 * @throws {DataValidationError} When any file, record, or citation fails a gate.
 */
export async function loadHistorical(options = {}) {
  const dir = options.dir ?? HISTORICAL_DIR;
  const readText = options.readText ?? defaultReadText;
  const requireLedger = options.requireLedger === true;
  const ledger = options.ledger;

  /** @type {import('./errors.js').ViolationRecord[]} */
  const violations = [];
  /** @type {HistoricalDataset} */
  const dataset = {};
  /**
   * Only schema-valid rows reach the audit engine, so a malformed row is
   * reported once (as a schema violation) instead of tripping every audit rule.
   * @type {Object.<string, { rows: Array<unknown> }>}
   */
  const auditable = {};

  for (const name of HISTORICAL_DATASETS) {
    const location = `${dir}${name}.json`;

    let text;
    try {
      text = await readText(location);
    } catch (cause) {
      violations.push(
        fileViolation(location, RULE_FILE_UNREADABLE, `Could not read dataset file: ${cause.message}`),
      );
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      violations.push(
        fileViolation(location, RULE_FILE_UNPARSEABLE, `File is not valid JSON: ${cause.message}`),
      );
      continue;
    }

    const rows = extractRows(parsed);
    if (rows === null) {
      violations.push(
        fileViolation(
          location,
          RULE_DATASET_SHAPE,
          'Dataset must be an array of records or an object with a `rows` array.',
        ),
      );
      continue;
    }

    const schema = SCHEMAS[DATASET_SCHEMAS[name]];
    /** @type {Array<unknown>} */
    const acceptedRows = [];

    rows.forEach((row, index) => {
      const result = validateRecord(row, schema, location);
      if (result.ok) {
        acceptedRows.push(row);
        return;
      }
      for (const error of result.errors) {
        violations.push({
          file: location,
          metric: readField(row, 'metric'),
          period: readField(row, 'period'),
          rule: RULE_SCHEMA_VIOLATION,
          message: `row ${index + 1}, field \`${error.field}\` ${error.message}`,
        });
      }
    });

    dataset[name] = parsed;
    auditable[name] = { rows: acceptedRows };
  }

  // The Accuracy Gate always runs, even when earlier stages already failed, so
  // a single load surfaces the complete picture instead of one problem at a time.
  const report = auditDataset(auditable, { requireLedger, ledger });
  violations.push(...report.violations);

  if (violations.length > 0) {
    const summary = `loadHistorical() rejected the dataset with ${violations.length} violation(s):\n${formatViolations(violations)}`;
    throw new DataValidationError(summary, violations);
  }

  return dataset;
}

/**
 * The canonical dataset manifest (re-exported from `constants.js`) so the audit
 * layer and tests share a single source of truth for which datasets must exist.
 * @type {ReadonlyArray<string>}
 */
export { HISTORICAL_DATASETS };

/**
 * Which schema governs each dataset. Exported so tests and tooling can assert
 * the mapping without re-declaring it.
 * @type {Readonly<Record<string, string>>}
 */
export const SCHEMA_BY_DATASET = DATASET_SCHEMAS;
