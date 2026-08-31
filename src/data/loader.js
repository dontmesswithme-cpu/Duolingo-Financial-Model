/**
 * Historical data loader — Phase 0.1 scaffold.
 *
 * Scope of this sub-phase: **file discovery + JSON parse with typed errors.**
 * Schema validation (`validateRecord`) and the Accuracy Gate (`auditDataset`)
 * are wired in P0.2; `loadHistorical()` is deliberately shaped now so those
 * stages drop into the pipeline without changing its signature.
 *
 * The loader is runtime-agnostic: it never imports `node:fs` at module scope,
 * because the target runtime is a zero-build static browser app where `fetch`
 * is the only file-access mechanism. Tests inject a `readText` reader, which
 * is what makes the loader deterministic and headless-testable.
 *
 * @module src/data/loader
 */

import { DataValidationError, EngineError } from './errors.js';

/**
 * Default directory containing the historical dataset JSON files.
 * Relative to the document root when served statically.
 * @type {string}
 */
const HISTORICAL_DIR = 'src/data/historical/';

/**
 * The known historical datasets, per `docs/spec.md` §3.1.
 * Discovery is an explicit manifest rather than a directory scan: a browser
 * cannot enumerate a directory, so the file list is the single source of truth
 * in both Node and the browser.
 * @type {ReadonlyArray<string>}
 */
const DATASET_FILES = Object.freeze(['income', 'balance', 'cashflow', 'kpis']);

/**
 * Rule id for a dataset file that could not be read.
 * @type {string}
 */
const RULE_FILE_UNREADABLE = 'FILE_UNREADABLE';

/**
 * Rule id for a dataset file that was read but is not valid JSON.
 * @type {string}
 */
const RULE_FILE_UNPARSEABLE = 'FILE_UNPARSEABLE';

/**
 * @typedef {Object.<string, unknown>} HistoricalDataset
 * Parsed dataset keyed by dataset name (`income`, `balance`, `cashflow`, `kpis`).
 */

/**
 * @typedef {object} LoaderOptions
 * @property {string} [dir] Directory prefix for dataset files.
 * @property {(location: string) => Promise<string>} [readText] Injected file
 *   reader; required in Node, defaults to `fetch` in the browser.
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
 * Renders the violation list into the error summary so that a single
 * `DataValidationError` names every offender at once.
 *
 * @param {import('./errors.js').ViolationRecord[]} violations
 * @returns {string}
 */
function formatViolations(violations) {
  const lines = violations.map((violation) => {
    const subject = violation.file ?? `${violation.metric} @ ${violation.period}`;
    return `  - ${subject}: ${violation.rule} — ${violation.message}`;
  });
  return lines.join('\n');
}

/**
 * Loads and parses every historical dataset.
 *
 * P0.1 behaviour: reads each known dataset file and parses it. Every file that
 * cannot be read or parsed is collected — loading does not stop at the first
 * failure, so one run surfaces all offenders. If any violation was collected,
 * a `DataValidationError` listing every offending file is thrown.
 *
 * @param {LoaderOptions} [options]
 * @returns {Promise<HistoricalDataset>} Resolves with the parsed datasets.
 * @throws {DataValidationError} When any dataset file fails to read or parse.
 */
export async function loadHistorical(options = {}) {
  const dir = options.dir ?? HISTORICAL_DIR;
  const readText = options.readText ?? defaultReadText;

  /** @type {import('./errors.js').ViolationRecord[]} */
  const violations = [];
  /** @type {HistoricalDataset} */
  const dataset = {};

  for (const name of DATASET_FILES) {
    const location = `${dir}${name}.json`;

    let text;
    try {
      text = await readText(location);
    } catch (cause) {
      violations.push({
        file: location,
        rule: RULE_FILE_UNREADABLE,
        message: `Could not read dataset file: ${cause.message}`,
      });
      continue;
    }

    try {
      dataset[name] = JSON.parse(text);
    } catch (cause) {
      violations.push({
        file: location,
        rule: RULE_FILE_UNPARSEABLE,
        message: `File is not valid JSON: ${cause.message}`,
      });
    }
  }

  if (violations.length > 0) {
    const summary = `loadHistorical() rejected ${violations.length} of ${DATASET_FILES.length} dataset file(s):\n${formatViolations(violations)}`;
    throw new DataValidationError(summary, violations);
  }

  return dataset;
}

/**
 * The canonical dataset manifest. Exported so the audit layer and tests share
 * a single source of truth for which datasets must exist.
 * @type {ReadonlyArray<string>}
 */
export const HISTORICAL_DATASETS = DATASET_FILES;
