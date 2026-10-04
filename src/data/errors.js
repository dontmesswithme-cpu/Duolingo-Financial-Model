/**
 * Typed error hierarchy for the Duolingo FM data & engine layers.
 *
 * Design invariants:
 *  - No error anywhere in `src/` is thrown as a bare `Error`. Every throw site
 *    uses one of the classes below so failures are machine-classifiable.
 *  - Every error carries structured, machine-readable context so the audit
 *    layer and the test suite can assert on payloads deterministically.
 *  - Every error serializes cleanly through `toJSON()`. `Error#message` is a
 *    non-enumerable own property, so a bare `JSON.stringify(err)` would yield
 *    `{}`; `toJSON()` is the only way to make assertions on serialized errors
 *    reproducible across Node versions.
 *
 * @module src/data/errors
 */

/**
 * A single audit/validation failure.
 *
 * Violations are scoped either to a **file** (read/parse failures, where no
 * record could be materialized) or to a **record** (schema/audit failures).
 * File-scoped violations populate `file`; record-scoped violations populate
 * `metric` and `period`. A violation always carries `rule` and `message`.
 *
 * @typedef {object} ViolationRecord
 * @property {string} [file]  Path/location of the offending dataset file.
 * @property {string} [metric] Machine metric key of the offending record.
 * @property {string} [period] Period key (e.g. `FY2023`) of the offending record.
 * @property {string} rule    Stable, greppable rule id (e.g. `HIST_NO_SOURCE`).
 * @property {string} message Human-readable description naming the offender.
 */

/**
 * Raised when the data layer refuses a dataset: parse failures, schema
 * violations, or Accuracy Gate (audit) violations.
 *
 * Carries the full violation list so callers can render every offender at once
 * rather than failing one record at a time.
 */
export class DataValidationError extends Error {
  /**
   * @param {string} message Summary message; conventionally lists every offense.
   * @param {ViolationRecord[]} [records] Structured violation list.
   */
  constructor(message, records = []) {
    super(message);
    this.name = 'DataValidationError';
    /** @type {ViolationRecord[]} */
    this.records = Array.isArray(records) ? records : [records];
  }

  /**
   * Deterministic serialization for test assertions and error pages.
   * @returns {{ name: string, message: string, records: ViolationRecord[] }}
   */
  toJSON() {
    return { name: this.name, message: this.message, records: this.records };
  }
}

/**
 * Raised by the calculation engine and the app controller for invariant
 * breaches: unbalanced projections, invalid driver input, divide-by-zero, and
 * (during early phases) deliberately un-wired call sites.
 */
export class EngineError extends Error {
  /**
   * @param {string} code Stable, greppable error code (e.g. `balance_check_failed`).
   * @param {string} message Human-readable description.
   * @param {string} [driverName] Name of the driver/input at fault, when applicable.
   */
  constructor(code, message, driverName) {
    super(message);
    this.name = 'EngineError';
    /** @type {string} */
    this.code = code;
    if (driverName !== undefined) {
      /** @type {string | undefined} */
      this.driverName = driverName;
    }
  }

  /**
   * Deterministic serialization for test assertions.
   * `driverName` is omitted from JSON output when undefined.
   * @returns {{ name: string, message: string, code: string, driverName?: string }}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      driverName: this.driverName,
    };
  }
}

/**
 * Raised when a configuration value is missing or invalid: a required constant
 * is absent, an injected option has the wrong shape, or a scenario/flag name is
 * unknown. Distinct from `EngineError` because the fault is in static
 * configuration rather than a runtime calculation invariant.
 */
export class ConfigError extends Error {
  /**
   * @param {string} message Human-readable description naming the offending entry.
   * @param {string} [key] Dotted path or name of the configuration value at fault.
   */
  constructor(message, key) {
    super(message);
    this.name = 'ConfigError';
    if (key !== undefined) {
      /** @type {string | undefined} */
      this.key = key;
    }
  }

  /**
   * Deterministic serialization for test assertions.
   * `key` is omitted from JSON output when undefined.
   * @returns {{ name: string, message: string, key?: string }}
   */
  toJSON() {
    return { name: this.name, message: this.message, key: this.key };
  }
}
