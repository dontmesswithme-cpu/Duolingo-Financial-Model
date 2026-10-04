/**
 * Dataset audit engine  -  the Accuracy Gate.
 *
 * This module is the enforcement arm of the project's #1 non-negotiable: no
 * uncited number may enter the data layer. It inspects already-schema-validated
 * rows for provenance, unit, and identity invariants and reports **every**
 * offender in one pass.
 *
 * Design rules:
 *  - Total function: never throws on malformed input; unknown shapes are skipped
 *    and reported by the loader instead.
 *  - Every violation message names the metric, the period, and the rule, so the
 *    failure is actionable without a debugger.
 *  - The ledger check is injectable (`requireLedger`) so the gate can be tested
 *    in both ledger-free and ledger-enforced modes, per the P0.3 contract.
 *
 * @module src/data/audit
 */

import { UNITS, UNIT_KEYS } from './constants.js';
import { extractRows } from './schema.js';

/**
 * Matches the `url` requirement in `schema.js`. Duplicated locally rather than
 * exported to keep `schema.js` the single owner of the citation contract; the
 * audit engine applies the same rule at a coarser granularity.
 * @type {RegExp}
 */
const URL_PATTERN = /^https?:\/\/\S+$/;

/** A historical actual carries no source object at all. */
export const RULE_HIST_NO_SOURCE = 'HIST_NO_SOURCE';

/** An estimate sits in the historical dataset without any provenance. */
export const RULE_HIST_MARKED_ESTIMATE = 'HIST_MARKED_ESTIMATE';

/** Two records claim the same metric / period / periodType identity. */
export const RULE_DUP_KEY = 'DUP_KEY';

/** `units` is unknown, or `scale` disagrees with the unit's scale factor. */
export const RULE_BAD_UNITS = 'BAD_UNITS';

/** A source object exists but its `url` is missing or not an http(s) URL. */
export const RULE_SOURCE_URL_MISSING = 'SOURCE_URL_MISSING';

/** A cited URL has no corresponding entry in the source ledger. */
export const RULE_SOURCE_NOT_IN_LEDGER = 'SOURCE_NOT_IN_LEDGER';

/** Informational: the row is an estimate and must render with an EST badge. */
export const FLAG_EST_ROW = 'EST_ROW';

/**
 * @type {ReadonlyArray<string>}
 */
export const AUDIT_RULES = Object.freeze([
  RULE_HIST_NO_SOURCE,
  RULE_HIST_MARKED_ESTIMATE,
  RULE_DUP_KEY,
  RULE_BAD_UNITS,
  RULE_SOURCE_URL_MISSING,
  RULE_SOURCE_NOT_IN_LEDGER,
]);

/**
 * @type {ReadonlyArray<string>}
 */
export const AUDIT_FLAGS = Object.freeze([FLAG_EST_ROW]);

/**
 * Placeholder used when a row is missing identifying fields, so a message can
 * still name the offending row.
 * @type {string}
 */
const UNKNOWN = '<unknown>';

/**
 * @typedef {object} AuditEntry
 * @property {string} metric
 * @property {string} period
 * @property {string} rule
 * @property {string} message Always contains the metric, period, and rule.
 * @property {string} dataset Owning dataset (`income`, `balance`, …)  -  extension
 *   that makes each finding traceable to its source file.
 */

/**
 * @typedef {object} AuditReport
 * @property {boolean} ok True when there are no violations. Flags never affect this.
 * @property {AuditEntry[]} violations Rule breaches; each one blocks the dataset.
 * @property {AuditEntry[]} flags Informational findings (e.g. `EST_ROW`).
 */

/**
 * @typedef {object} AuditOptions
 * @property {boolean} [requireLedger] Enforce `SOURCE_NOT_IN_LEDGER`. Injected so
 *   P0.3 can drive it from `SOURCE_LEDGER_REQUIRED` without the audit engine
 *   importing project configuration.
 * @property {Set<string>|Array<string|{url: string}>} [ledger] Known-good citation URLs.
 */

/**
 * @param {string} metric
 * @param {string} period
 * @param {string} dataset
 * @param {string} rule
 * @param {string} detail
 * @returns {AuditEntry}
 */
function entry(metric, period, dataset, rule, detail) {
  return {
    metric,
    period,
    rule,
    dataset,
    message: `${metric} @ ${period} violates ${rule}: ${detail}`,
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function asLabel(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : UNKNOWN;
}

/**
 * @param {unknown} row
 * @returns {boolean}
 */
function isRecord(row) {
  return row !== null && typeof row === 'object' && !Array.isArray(row);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isSourceObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Accepts a Set of URLs, an array of URL strings, or an array of ledger entries
 * carrying a `url` property  -  so it works with the ledger format P0.3 will define.
 *
 * @param {unknown} ledger
 * @returns {Set<string> | null}
 */
function normalizeLedger(ledger) {
  if (ledger instanceof Set) return ledger;
  if (Array.isArray(ledger)) {
    return new Set(
      ledger.map((item) =>
        isRecord(item) && typeof item.url === 'string' ? item.url : item,
      ),
    );
  }
  return null;
}

/**
 * Audits a historical dataset for citation, unit, and identity invariants.
 *
 * @param {Object.<string, unknown>} ds Historical dataset keyed by dataset name.
 * @param {AuditOptions} [options]
 * @returns {AuditReport}
 */
export function auditDataset(ds, options = {}) {
  const requireLedger = options.requireLedger === true;
  const ledger = normalizeLedger(options.ledger);

  /** @type {AuditEntry[]} */
  const violations = [];
  /** @type {AuditEntry[]} */
  const flags = [];

  /** Identity -> first dataset that claimed it, for duplicate detection. */
  const seenIdentities = new Map();

  for (const [datasetName, datasetValue] of Object.entries(ds ?? {})) {
    const rows = extractRows(datasetValue);
    if (rows === null) continue;

    for (const row of rows) {
      if (!isRecord(row)) continue;

      const metric = asLabel(row.metric);
      const period = asLabel(row.period);
      const periodType = asLabel(row.periodType);
      const isEstimate = row.isEstimate === true;

      const source = row.source;
      const rawUrl = isSourceObject(source) && typeof source.url === 'string'
        ? source.url.trim()
        : '';
      const hasValidUrl = rawUrl !== '' && URL_PATTERN.test(rawUrl);

      // ── Informational marking (never blocks) ──────────────────────────
      if (isEstimate) {
        flags.push(
          entry(
            metric,
            period,
            datasetName,
            FLAG_EST_ROW,
            'row is an estimate and must render with the EST badge.',
          ),
        );
      }

      // ── Provenance invariants ─────────────────────────────────────────
      if (!isEstimate && !isSourceObject(source)) {
        violations.push(
          entry(
            metric,
            period,
            datasetName,
            RULE_HIST_NO_SOURCE,
            'historical actual has no source citation; every filed figure must trace to a filing.',
          ),
        );
      } else if (!isEstimate && !hasValidUrl) {
        violations.push(
          entry(
            metric,
            period,
            datasetName,
            RULE_SOURCE_URL_MISSING,
            'source object is missing a valid absolute http(s) `url`.',
          ),
        );
      } else if (isEstimate && !hasValidUrl) {
        violations.push(
          entry(
            metric,
            period,
            datasetName,
            RULE_HIST_MARKED_ESTIMATE,
            'estimate presented inside the historical dataset without any source provenance.',
          ),
        );
      }

      // ── Unit integrity ────────────────────────────────────────────────
      const unit = typeof row.units === 'string' ? UNITS[row.units] : undefined;
      if (unit === undefined) {
        violations.push(
          entry(
            metric,
            period,
            datasetName,
            RULE_BAD_UNITS,
            `units "${asLabel(row.units)}" is not a recognised unit (expected one of: ${UNIT_KEYS.join(', ')}).`,
          ),
        );
      } else if (row.scale !== unit.scale) {
        violations.push(
          entry(
            metric,
            period,
            datasetName,
            RULE_BAD_UNITS,
            `scale ${String(row.scale)} does not match the scale factor ${unit.scale} defined for units "${row.units}".`,
          ),
        );
      }

      // ── Identity uniqueness ───────────────────────────────────────────
      const identity = `${metric}|${period}|${periodType}`;
      if (seenIdentities.has(identity)) {
        violations.push(
          entry(
            metric,
            period,
            datasetName,
            RULE_DUP_KEY,
            `duplicate record for metric/period/periodType; first seen in dataset "${seenIdentities.get(identity)}".`,
          ),
        );
      } else {
        seenIdentities.set(identity, datasetName);
      }

      // ── Source ledger cross-check (injectable; fails closed) ──────────
      if (requireLedger && hasValidUrl && (ledger === null || !ledger.has(rawUrl))) {
        violations.push(
          entry(
            metric,
            period,
            datasetName,
            RULE_SOURCE_NOT_IN_LEDGER,
            ledger === null
              ? 'ledger enforcement is enabled but no ledger was provided; refusing to pass an unverified citation.'
              : `citation URL "${rawUrl}" has no entry in the source ledger (docs/sources/sources.md).`,
          ),
        );
      }
    }
  }

  return { ok: violations.length === 0, violations, flags };
}
