/**
 * Project constants — the single source of truth for shared values.
 *
 * `docs/conventions.md` requires every constant used in `src/data/` and
 * `src/engine/` to originate here, and the P0.3 grep gate forbids bare numeric
 * literals elsewhere. Scale factors below are the documented exception that the
 * gate explicitly allows, and they live here rather than at the call sites.
 *
 * NOTE ON PHASE SCOPE: this file is formally a P0.3 deliverable. `UNITS` is
 * implemented now because P0.2's `BAD_UNITS` audit rule is unimplementable
 * without the canonical unit -> scale mapping. Everything else still owed by
 * P0.3 (fiscal calendar notes, EST badge label, scenario names,
 * `SOURCE_LEDGER_REQUIRED`) remains deferred and is not defined here.
 *
 * @module src/data/constants
 */

/**
 * Canonical unit registry.
 *
 * `scale` is the multiplier that converts a stored `value` into whole US dollars
 * (or whole units for `count`). As-reported filing units are preserved verbatim
 * in the data layer — `scale` documents them, it never converts them.
 *
 * @type {Readonly<Record<string, { scale: number, label: string }>>}
 */
export const UNITS = Object.freeze({
  thousands_usd: Object.freeze({ scale: 1000, label: '$ thousands' }),
  millions_usd: Object.freeze({ scale: 1_000_000, label: '$ millions' }),
  usd: Object.freeze({ scale: 1, label: '$' }),
  count: Object.freeze({ scale: 1, label: '' }),
});

/**
 * The set of legal `units` values, derived from `UNITS` so the two can never
 * drift apart.
 * @type {ReadonlyArray<string>}
 */
export const UNIT_KEYS = Object.freeze(Object.keys(UNITS));

/**
 * The three record classes. Drives TTM handling: `flow` metrics aggregate over
 * four discrete quarters, `stock` metrics report the latest balance date, and
 * `kpi` metrics report the latest reported value.
 * @type {ReadonlyArray<string>}
 */
export const KLASS_VALUES = Object.freeze(['flow', 'stock', 'kpi']);

/**
 * Legal `periodType` values. `ytd` exists so 10-Q cash-flow rows can be
 * transcribed exactly as filed and never relabelled as discrete quarters.
 * @type {ReadonlyArray<string>}
 */
export const PERIOD_TYPE_VALUES = Object.freeze(['fiscal_year', 'quarter', 'ytd']);
