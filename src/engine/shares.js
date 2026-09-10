/**
 * Share Roll-Forward Schedule (Economy Phase EP.2) — SBC Dilution Settlement.
 *
 * Settles finding F1 at the valuation layer while the statements stay
 * GAAP-clean: the model adds stock-based compensation back to operating cash
 * flow (correct at statement level), and this schedule rolls the offsetting
 * future share issuance forward so the DCF per-share division pays for it.
 *
 * Gross-issuance-at-spot convention (Director ruling R2, locked 2026-09-10):
 *
 *   shares_DCF = shares_BOP + Σ (SBC_t ÷ market_share_price), t = FY2026..FY2030
 *
 *  - `shares_BOP` is the MKT diluted-shares driver with as-of date (grants
 *    already made); the roll adds FUTURE grants only.
 *  - `SBC_t` is the per-period SBC embedded in each period's cash-flow
 *    statement (source of truth: CF statements, not the annualized schedule).
 *    The hybrid first period composes the cited H1 corpus row plus the H2 CF
 *    leg, because the CF SBC line carries the H2 estimate only.
 *  - `market_share_price` is the MKT spot driver with as-of date.
 *  - No buyback netting in the headline path: buybacks remain financing flows,
 *    value-neutral at fair price. Uncharged netting is rejected (see the
 *    phase contract §3.3); this module offers no netting path.
 *
 * FROZEN signature per economy_phase.md §5 EP.2:
 *   projectShares(assumptions, threeStatement): SharesSchedule
 * (corpus rows are additive for the hybrid H1 leg and change no default).
 *
 * PURE MODULE: zero DOM, zero fetch, zero Date.now, zero Math.random.
 * ZERO BARE NUMERIC LITERALS > 999 outside comments.
 * ZERO `??` FALLBACKS on any path (P2.1 permanent rule).
 *
 * @module src/engine/shares
 */

import { EngineError } from '../data/errors.js';
import { UNITS } from '../data/constants.js';
import { extractRows } from '../data/schema.js';

/** Derived / judgment marking. */
const EST = 'EST';

/** Market-sourced marking. */
const MKT = 'MKT';

/** Corpus metric key for the cited H1 SBC row. */
const H1_SBC_METRIC = 'cf_stock_based_compensation';

/** Corpus period label for the cited H1 SBC row (mirrors the engine anchor). */
const H1_SBC_PERIOD = '6M FY2026';

/**
 * Freezes an object graph recursively so no consumer can mutate the schedule.
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
 * Reads a required driver record from an AssumptionSet, failing closed.
 *
 * @param {object} assumptions AssumptionSet (base or scenario-applied).
 * @param {string} name Driver name.
 * @returns {object} The driver record.
 * @throws {EngineError} `missing_driver` when absent or non-finite.
 */
function requireDriverRecord(assumptions, name) {
  const driver =
    assumptions && typeof assumptions.get === 'function' ? assumptions.get(name) : null;
  if (!driver || typeof driver !== 'object' || !Number.isFinite(driver.value)) {
    throw new EngineError(
      'missing_driver',
      `Required driver "${name}" is missing or non-finite in the assumption set.`,
      name,
    );
  }
  return driver;
}

/**
 * Reads a required finite plain number fail-closed.
 *
 * @param {unknown} value Candidate value.
 * @param {string} context Greppable path for the typed error.
 * @returns {number}
 * @throws {EngineError} `missing_input` when absent or non-finite.
 */
function requireFiniteNumber(value, context) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EngineError(
      'missing_input',
      `Required numeric field "${context}" is missing or non-finite.`,
      context,
    );
  }
  return value;
}

/**
 * Normalizes the optional corpus payload into flat rows.
 *
 * @param {object|Array|null} corpus Flat rows or a historical object.
 * @returns {Array<object>}
 */
function toFlatRows(corpus) {
  if (!corpus) {
    return [];
  }
  if (Array.isArray(corpus)) {
    return corpus;
  }
  const rows = [];
  if (corpus.income) {
    rows.push(...extractRows(corpus.income));
  }
  if (corpus.balance) {
    rows.push(...extractRows(corpus.balance));
  }
  if (corpus.cashflow) {
    rows.push(...extractRows(corpus.cashflow));
  }
  if (corpus.kpis) {
    rows.push(...extractRows(corpus.kpis));
  }
  if (Array.isArray(corpus.records)) {
    rows.push(...corpus.records);
  }
  return rows;
}

/**
 * Projects the share roll-forward over the forecast horizon.
 *
 * Per period: shares_t = shares_{t-1} + SBC_t × scale ÷ market_share_price,
 * with SBC_t read from the period's cash-flow statement SBC line. The hybrid
 * first period composes the cited H1 corpus row plus the H2 CF leg, because the
 * CF statement SBC line carries the H2 estimate only while the H1 grants are
 * already embedded in the cited Q2 balance the forecast rolls from.
 *
 * @param {object} assumptions AssumptionSet carrying shares_outstanding + market_share_price.
 * @param {object} threeStatement ThreeStatementOutput from `threeStatement.project()`.
 * @param {object|Array|null} [corpus] Corpus rows or historical object for the hybrid H1 leg.
 * @returns {object} Frozen SharesSchedule with per-period rolls plus the terminal count.
 * @throws {EngineError} On missing drivers, lines, or the cited H1 row (fail-closed).
 */
export function projectShares(assumptions, threeStatement, corpus) {
  if (!assumptions || typeof assumptions !== 'object') {
    throw new EngineError(
      'missing_input',
      'projectShares() requires a valid assumptions payload.',
      'assumptions',
    );
  }
  if (!threeStatement || typeof threeStatement !== 'object') {
    throw new EngineError(
      'missing_input',
      'projectShares() requires a valid ThreeStatementOutput object.',
      'threeStatement',
    );
  }
  const periods = threeStatement.periods;
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new EngineError(
      'invalid_horizon',
      'projectShares() requires a non-empty threeStatement.periods array.',
      'periods',
    );
  }
  const cfByPeriod =
    threeStatement.cashFlow && typeof threeStatement.cashFlow.byPeriod === 'object'
      ? threeStatement.cashFlow.byPeriod
      : null;
  if (!cfByPeriod) {
    throw new EngineError(
      'missing_input',
      'projectShares() requires the cashFlow.byPeriod block.',
      'threeStatement.cashFlow',
    );
  }

  const sharesDriver = requireDriverRecord(assumptions, 'shares_outstanding');
  const priceDriver = requireDriverRecord(assumptions, 'market_share_price');
  const bopShares = sharesDriver.value;
  const marketPrice = priceDriver.value;
  if (!(bopShares > 0)) {
    throw new EngineError(
      'missing_driver',
      `shares_outstanding must be a positive finite number (received ${bopShares}).`,
      'shares_outstanding',
    );
  }
  if (!(marketPrice > 0)) {
    throw new EngineError(
      'missing_driver',
      `market_share_price must be a positive finite number (received ${marketPrice}).`,
      'market_share_price',
    );
  }
  const scale = requireFiniteNumber(
    UNITS && UNITS.thousands_usd ? UNITS.thousands_usd.scale : null,
    'UNITS.thousands_usd.scale',
  );

  const rows = toFlatRows(corpus || null);
  const byPeriod = {};
  let runningShares = bopShares;
  let totalIssuance = 0;

  for (const period of periods) {
    const cf = cfByPeriod[period];
    if (!cf || typeof cf !== 'object' || !cf.operating_activities) {
      throw new EngineError(
        'missing_period',
        `Cash-flow block for forecast period "${period}" is missing.`,
        period,
      );
    }
    const sbcLine = cf.operating_activities.stock_based_compensation;
    if (sbcLine === null || typeof sbcLine !== 'object' || !Number.isFinite(sbcLine.value)) {
      throw new EngineError(
        'missing_line',
        `CF SBC line for "${period}" is missing or non-finite; the roll reads statements, never fallbacks.`,
        `operating_activities.stock_based_compensation.${period}`,
      );
    }
    const isHybrid = cf.isHybrid === true;
    let sbcEmbedded = sbcLine.value;
    let sbcH1 = null;
    let sbcBasis = 'cf-statement';
    if (isHybrid) {
      const h1Row = rows.find((r) => r && r.metric === H1_SBC_METRIC && r.period === H1_SBC_PERIOD);
      if (!h1Row || !Number.isFinite(h1Row.value)) {
        throw new EngineError(
          'missing_corpus_row',
          `Hybrid ${period} needs the cited H1 SBC row (${H1_SBC_METRIC}@${H1_SBC_PERIOD}); supply corpus rows.`,
          H1_SBC_METRIC,
        );
      }
      sbcH1 = h1Row.value;
      sbcEmbedded = sbcH1 + sbcLine.value;
      sbcBasis = 'hybrid-corpus-h1-plus-cf-h2';
    }
    if (!Number.isFinite(sbcEmbedded) || sbcEmbedded < 0) {
      throw new EngineError(
        'invalid_sbc',
        `Embedded SBC for "${period}" must be a finite non-negative number.`,
        period,
      );
    }
    const issuance = (sbcEmbedded * scale) / marketPrice;
    if (!Number.isFinite(issuance) || issuance < 0) {
      throw new EngineError(
        'invalid_issuance',
        `Computed share issuance for "${period}" is not a finite non-negative number.`,
        period,
      );
    }
    runningShares += issuance;
    totalIssuance += issuance;
    byPeriod[period] = Object.freeze({
      period,
      shares: runningShares,
      sbcEmbedded,
      sbcH1,
      sbcH2: isHybrid ? sbcLine.value : null,
      issuance,
      provenance: Object.freeze({
        sbcBasis,
        priceDriver: Object.freeze({
          name: priceDriver.name,
          value: marketPrice,
          marking: priceDriver.marking || MKT,
          asOf: priceDriver.asOf || null,
        }),
        bopDriver: Object.freeze({
          name: sharesDriver.name,
          value: bopShares,
          marking: sharesDriver.marking || MKT,
          asOf: sharesDriver.asOf || null,
        }),
      }),
    });
  }

  const terminalPeriod = periods[periods.length - 1];
  return deepFreeze({
    periods: Object.freeze(periods.slice()),
    byPeriod: Object.freeze(byPeriod),
    bopShares,
    price: marketPrice,
    scale,
    totalIssuance,
    terminalPeriod,
    sharesDcf: runningShares,
    marking: EST,
    isComputed: true,
    derivedFrom: Object.freeze([
      Object.freeze({
        kind: 'assumptionDriver',
        name: sharesDriver.name,
        value: bopShares,
        marking: sharesDriver.marking || MKT,
        asOf: sharesDriver.asOf || null,
      }),
      Object.freeze({
        kind: 'assumptionDriver',
        name: priceDriver.name,
        value: marketPrice,
        marking: priceDriver.marking || MKT,
        asOf: priceDriver.asOf || null,
      }),
      Object.freeze({
        kind: 'cashFlowSbc',
        periods: Object.freeze(periods.slice()),
        hybridH1Row: `${H1_SBC_METRIC}@${H1_SBC_PERIOD}`,
      }),
    ]),
  });
}

export default Object.freeze({ projectShares });
