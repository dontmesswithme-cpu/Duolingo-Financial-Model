/**
 * DCF Valuation Engine (P4.2, EP.3, FP.2).
 *
 * Implements the spec §3.2 frozen interface:
 *   `dcf.valuate(threeStatement: ThreeStatementOutput, wacc: WaccBuild, dcfInput: DcfInput): DcfResult`
 *
 * The valuation pipeline implements the Three-Stage Gordon Growth DCF framework (Phase 9 FP):
 *  1. Discount factors: df_t = 1 / (1 + WACC)^t for forecast years t = 1..horizon
 *  2. Three-Stage PV decomposition:
 *     - Stage 1 Explicit (FY2026–FY2030): pvFcf_t = fcf_t × df_t over periods 0..4
 *     - Stage 2 Fade Glide (FY2031–FY2035): pvFcf_t = fcf_t × df_t over periods 5..9
 *     - pvExplicit = Σ pvFcf_t across all explicit and fade forecast periods
 *     - pvByStage = { explicit, fade, terminal } exposing exact stage breakdown
 *  3. Terminal steady-state normalisation (EP.3, EIG-A) + Gordon terminal value:
 *     wcInflowT = −ΔNWC_T (final-year working-capital inflow from the WC
 *     schedule); wcInflowSS = −NWC_T × g (steady-state replacement at the
 *     perpetuity rate); fcffTNormalised = fcff_T − wcInflowT + wcInflowSS;
 *     terminalFcf = fcffTNormalised × (1 + g);
 *     terminalValue = terminalFcf / (WACC − g); pvTerminal = terminalValue × df_T
 *     (Hard fail-closed guard: WACC > g required; terminalYear = 'FY2035' under 10-year horizon;
 *     the FCFE diagnostic and legacy paths normalise their shared terminal-year cash flow identically)
 *  4. Enterprise value: EV = pvExplicit + pvTerminal = pvByStage.explicit + pvByStage.fade + pvTerminal
 *  5. Net cash bridge: netCash = endingCash(T) + shortTermInvestments(T) + longTermInvestments(T) − debt(T)
 *     from the final forecast balance sheet
 *  6. Equity value: Equity = EV + netCash = EV − debt + cashAndInvestments
 *  7. Per-share value: perShare = (equityValue × scale) / sharesOutstanding
 *     where sharesOutstanding is the EIG-B share roll-forward terminal count
 *     (BOP MKT driver plus gross SBC issuance at spot across the full forecast horizon,
 *     EP.2 & FP.2 — see src/engine/shares.js)
 *
 * Invariants enforced:
 *  - FCF series consumed directly from ThreeStatementOutput.cashFlow.byPeriod[].free_cash_flow
 *  - Hybrid FY2026 FCF consumed as built (H1 cited actuals + H2 engine estimate)
 *  - Fade Stage Law (FP.4): explicit-stage growth converges toward terminal anchor through
 *    declared driver glide; terminal normalisation re-anchored on normalised FY2035 FCFF
 *  - Terminal steady-state law (EP.3, EIG-A): final-year WC inflow replaced by perpetuity equivalent
 *  - Net cash bridge reads raw final balance sheet lines (ending cash + held-constant STI + LTI)
 *  - Gordon guard: WACC > g throws typed EngineError('terminal_growth_exceeds_wacc')
 *  - Debt-free collapse as theorem: debt = 0 exercised in the formula
 *  - Purity: zero DOM, zero fetch, zero Date.now, zero Math.random
 *  - Zero bare numeric literals > 999 outside comments
 *  - Deeply frozen immutable output graph
 *
 * @module src/engine/dcf
 */

import { EngineError } from '../data/errors.js';
import { projectShares, fullyDilutedSchedule } from './shares.js';

import {
  UNITS,
  FORECAST_HORIZON_MIN,
  FORECAST_HORIZON_MAX,
  FORECAST_HORIZON_DEFAULT,
  CANONICAL_HORIZON,
  EFFECTIVE_VALUATION_DATE,
  REPORTING_CUTOFF_DATE,
  PRE_VALUATION_STUB_DAYS,
  POST_VALUATION_STUB_DAYS,
  H2_DAYS_TOTAL,
  PRE_VALUATION_STUB_FRACTION,
  POST_VALUATION_STUB_FRACTION,
  PERIOD_END_DATES,
  MILLISECONDS_PER_DAY,
  calculateDiscountExponent,
} from '../data/constants.js';

/** Derived / judgment marking. */
const EST = 'EST';

/** Market-sourced marking. */
const MKT = 'MKT';

/**
 * Freezes an object graph recursively so no consumer can mutate engine output.
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
 * Reads a required driver from an AssumptionSet, failing closed.
 *
 * @param {object} assumptions AssumptionSet (base or scenario-applied).
 * @param {string} name Driver name.
 * @returns {object} The driver record.
 * @throws {EngineError} `missing_driver` when absent or non-finite.
 */
function requireDriverValue(assumptions, name) {
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
 * Resolves the numeric WACC discount rate from a WaccBuild object or number.
 *
 * @param {object|number} wacc
 * @returns {number}
 * @throws {EngineError} `invalid_wacc` if missing, non-finite, or <= -1.
 */
function resolveWaccRate(wacc) {
  let rate = null;
  if (typeof wacc === 'number') {
    rate = wacc;
  } else if (wacc && typeof wacc === 'object') {
    if (typeof wacc.wacc === 'number') {
      rate = wacc.wacc;
    } else if (wacc.wacc && typeof wacc.wacc.value === 'number') {
      rate = wacc.wacc.value;
    } else if (typeof wacc.value === 'number') {
      rate = wacc.value;
    }
  }

  if (rate === null || !Number.isFinite(rate) || rate <= -1) {
    throw new EngineError(
      'invalid_wacc',
      `WACC must be a finite number greater than -1 (received ${rate !== null ? rate : JSON.stringify(wacc)}).`,
      'wacc',
    );
  }

  return rate;
}

/**
 * Normalizes and validates the forecast horizon.
 *
 * @param {number|undefined|null} requestedHorizon
 * @returns {number}
 * @throws {EngineError} `invalid_horizon` if out of bounds or non-integer.
 */
function normalizeHorizon(requestedHorizon, defaultHorizon = FORECAST_HORIZON_DEFAULT) {
  if (requestedHorizon === undefined || requestedHorizon === null) {
    return defaultHorizon;
  }

  if (
    typeof requestedHorizon !== 'number' ||
    !Number.isInteger(requestedHorizon) ||
    requestedHorizon < FORECAST_HORIZON_MIN ||
    requestedHorizon > FORECAST_HORIZON_MAX
  ) {
    throw new EngineError(
      'invalid_horizon',
      `Forecast horizon must be an integer between ${FORECAST_HORIZON_MIN} and ${FORECAST_HORIZON_MAX} (received ${requestedHorizon}).`,
      'horizon',
    );
  }

  return requestedHorizon;
}

/**
 * Reads one required ISO calendar date from a dated-seam object, failing closed.
 *
 * @param {object} container Dated-seam container.
 * @param {string} key Field name.
 * @param {string} path Dotted engine path used in the error `field`.
 * @returns {string} ISO `YYYY-MM-DD` date.
 * @throws {EngineError} `missing_seam_partition` when absent or malformed.
 */
function requireSeamString(container, key, path) {
  const value = container && typeof container === 'object' ? container[key] : undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new EngineError(
      'missing_seam_partition',
      `Required dated-seam date "${path}" is missing or not an ISO YYYY-MM-DD value.`,
      path,
    );
  }
  return value;
}

/**
 * Computes the overlap, in days, between two half-open calendar date ranges.
 *
 * @param {string} aStart First interval start.
 * @param {string} aEnd First interval end.
 * @param {string} bStart Second interval start.
 * @param {string} bEnd Second interval end.
 * @returns {number} Overlapping days (zero when the windows are disjoint).
 */
function intervalOverlapDays(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(
    new Date(`${aStart}T00:00:00Z`).getTime(),
    new Date(`${bStart}T00:00:00Z`).getTime(),
  );
  const end = Math.min(
    new Date(`${aEnd}T00:00:00Z`).getTime(),
    new Date(`${bEnd}T00:00:00Z`).getTime(),
  );
  return end > start ? Math.round((end - start) / MILLISECONDS_PER_DAY) : 0;
}

/**
 * Reads one required finite number from a dated-seam object, failing closed.
 *
 * @param {object} container Dated-seam container.
 * @param {string} key Field name.
 * @param {string} path Dotted engine path used in the error `field`.
 * @returns {number} Finite value.
 * @throws {EngineError} `missing_seam_partition` when absent or non-finite.
 */
function requireSeamNumber(container, key, path) {
  const value = container && typeof container === 'object' ? container[key] : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EngineError(
      'missing_seam_partition',
      `Required dated-seam value "${path}" is missing or non-finite; the DCF fails closed rather than defaulting the valuation bridge to zero.`,
      path,
    );
  }
  return value;
}

/**
 * Reads one required leg of a hybrid cash-flow line, failing closed.
 *
 * @param {object} periodRow Cash-flow row for the hybrid period.
 * @param {string} lineKey Cash-flow line name (`fcff`, `net_change_in_cash`, ...).
 * @param {string} partition `h1`, `preValuation`, `postValuation`, or `fullYear`.
 * @param {string} path Dotted engine path used in the error `field`.
 * @returns {number} Finite value.
 * @throws {EngineError} `missing_seam_partition` when absent or non-finite.
 */
function requireSeamPartitionValue(periodRow, lineKey, partition, path) {
  const line = periodRow && typeof periodRow === 'object' ? periodRow[lineKey] : null;
  if (!line || typeof line !== 'object') {
    throw new EngineError(
      'missing_seam_partition',
      `Required dated-seam row "${path}" is missing from the three-statement output.`,
      path,
    );
  }
  const leg =
    partition === 'fullYear'
      ? line
      : (partition === 'h1' || partition === 'h2' ? line[partition] : line.h2 && line.h2[partition]);
  if (!leg || typeof leg !== 'object') {
    throw new EngineError(
      'missing_seam_partition',
      `Required dated-seam partition "${path}" is missing; an engine-critical missing row may never silently become zero.`,
      path,
    );
  }
  return requireSeamNumber(leg, 'value', `${path}.value`);
}

/**
 * Resolves a declared period-end date, failing closed on any undeclared period.
 *
 * P10.2 requires that discount exponents derive from declared dates and forbids
 * an implicit stand-in for a declared valuation period. A synthesized
 * `${year}-12-31` fallback would let an undeclared period silently acquire a
 * plausible date, so an undeclared period is an error, not a default.
 *
 * @param {string} period Period key (e.g. `FY2030`).
 * @returns {string} Declared ISO `YYYY-MM-DD` period-end date.
 * @throws {EngineError} `undeclared_period` when the period has no declared date.
 */
function requirePeriodEndDate(period) {
  const declared = PERIOD_END_DATES[period];
  if (typeof declared !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(declared)) {
    throw new EngineError(
      'undeclared_period',
      `Period "${period}" has no declared period-end date in PERIOD_END_DATES. Discount exponents must derive from declared dates; a synthesized date is not permitted.`,
      period,
    );
  }
  return declared;
}

/**
 * Resolves the EIG-B share roll-forward schedule for the per-share division.
 *
 * A caller-supplied schedule (`dcfInput.shares`) is used verbatim after shape
 * validation; otherwise the schedule is built from the live assumptions and
 * three-statement output (plus `dcfInput.corpus` for the hybrid H1 leg).
 * There is no static-share path: every per-share figure divides by the rolled
 * terminal count.
 *
 * @param {object} dcfInput Input configuration `{ assumptions, horizon?, shares?, corpus? }`.
 * @param {object} assumptions AssumptionSet (base or scenario-applied).
 * @param {object} threeStatement ThreeStatementOutput from `threeStatement.project()`.
 * @returns {object} Frozen SharesSchedule.
 * @throws {EngineError} On malformed schedule or unbuildable roll (fail-closed).
 */
function resolveSharesSchedule(dcfInput, assumptions, threeStatement, periods, options) {
  const hasInput = dcfInput && typeof dcfInput === 'object';
  const supplied = hasInput ? dcfInput.shares : null;
  if (supplied && typeof supplied === 'object') {
    if (!Number.isFinite(supplied.sharesDcf) || supplied.sharesDcf <= 0) {
      throw new EngineError(
        'invalid_shares',
        'dcfInput.shares must carry a positive finite sharesDcf terminal count.',
        'shares',
      );
    }
    if (Array.isArray(supplied.periods) && Array.isArray(periods)) {
      if (
        supplied.periods.length !== periods.length ||
        supplied.periods.some((p, idx) => p !== periods[idx])
      ) {
        throw new EngineError(
          'mismatched_share_periods',
          `Supplied share schedule periods [${supplied.periods.join(', ')}] must match DCF periods [${periods.join(', ')}] exactly.`,
          'shares',
        );
      }
    }
    if (
      supplied.terminalPeriod &&
      Array.isArray(periods) &&
      periods.length > 0 &&
      supplied.terminalPeriod !== periods[periods.length - 1]
    ) {
      throw new EngineError(
        'mismatched_share_periods',
        `Supplied share schedule terminal period "${supplied.terminalPeriod}" must match DCF terminal period "${periods[periods.length - 1]}" exactly.`,
        'shares',
      );
    }
    return supplied;
  }
  let corpus = null;
  if (hasInput && typeof dcfInput.corpus !== 'undefined') {
    corpus = dcfInput.corpus;
  }
  // P10.5: issuance rolls from the point-in-time fully diluted schedule, never
  // the Q2 weighted-average count. The perpetual post-terminal rate and the
  // cost of equity are passed so the terminal policy is explicit and the
  // positivity rules are enforced rather than assumed.
  return projectShares(assumptions, threeStatement, corpus, {
    fullyDilutedSchedule: fullyDilutedSchedule(),
    dilutionRatePerpetual: options && options.dilutionRatePerpetual,
    costOfEquity: options && options.costOfEquity,
  });
}

/**
 * Evaluates the discounted cash flow (DCF) valuation model.
 *
 * @param {object} threeStatement ThreeStatementOutput from `threeStatement.project()`
 * @param {object|number} wacc WaccBuild from `wacc.build()` or numeric WACC rate
 * @param {object} dcfInput Input configuration `{ assumptions, horizon?, shares?, corpus? }`
 * @returns {object} Frozen DcfResult
 * @throws {EngineError} On missing inputs, non-finite values, or WACC <= g
 */
export function valuate(threeStatement, wacc, dcfInput, options = {}) {
  // ── Input assertions ───────────────────────────────────────────────────
  if (!threeStatement || typeof threeStatement !== 'object') {
    throw new EngineError(
      'missing_input',
      'dcf.valuate() requires a valid ThreeStatementOutput object.',
      'threeStatement',
    );
  }

  if (!threeStatement.cashFlow || typeof threeStatement.cashFlow !== 'object') {
    throw new EngineError(
      'missing_input',
      'threeStatement.cashFlow is missing or invalid in ThreeStatementOutput.',
      'threeStatement.cashFlow',
    );
  }

  if (!threeStatement.balanceSheet || typeof threeStatement.balanceSheet !== 'object') {
    throw new EngineError(
      'missing_input',
      'threeStatement.balanceSheet is missing or invalid in ThreeStatementOutput.',
      'threeStatement.balanceSheet',
    );
  }

  if (!dcfInput || typeof dcfInput !== 'object' || Array.isArray(dcfInput)) {
    throw new EngineError(
      'missing_input',
      'dcf.valuate() requires a dcfInput object of shape { assumptions, horizon? }.',
      'dcfInput',
    );
  }

  const { assumptions } = dcfInput;
  if (!assumptions || typeof assumptions !== 'object') {
    throw new EngineError(
      'missing_input',
      'dcfInput.assumptions is required and must be a valid AssumptionSet.',
      'assumptions',
    );
  }

  // ── Forecast periods ───────────────────────────────────────────────────
  const availablePeriods =
    threeStatement.periods ||
    (threeStatement.cashFlow && threeStatement.cashFlow.periods) ||
    (threeStatement.cashFlow && typeof threeStatement.cashFlow.byPeriod === 'object'
      ? Object.keys(threeStatement.cashFlow.byPeriod)
      : []);

  const defaultHorizon =
    availablePeriods && availablePeriods.length >= FORECAST_HORIZON_MIN
      ? Math.min(availablePeriods.length, FORECAST_HORIZON_MAX)
      : FORECAST_HORIZON_DEFAULT;

  const horizon = normalizeHorizon(dcfInput.horizon, defaultHorizon);
  const waccRate = resolveWaccRate(wacc);

  // ── Drivers ────────────────────────────────────────────────────────────
  const gDriver = requireDriverValue(assumptions, 'terminal_growth_rate');
  const sharesDriver = requireDriverValue(assumptions, 'shares_outstanding');

  const terminalGrowthRate = gDriver.value;
  const bopSharesOutstanding = sharesDriver.value;

  if (!Number.isFinite(bopSharesOutstanding) || bopSharesOutstanding <= 0) {
    throw new EngineError(
      'missing_driver',
      `shares_outstanding must be a positive finite number (received ${bopSharesOutstanding}).`,
      'shares_outstanding',
    );
  }

  // ── EIG-B share roll-forward (EP.2): resolved late, just before the
  // per-share division (see section 6), so legacy fail-closed precedence holds.

  // ── Gordon Growth Guard: WACC > g ───────────────────────────────────────
  if (waccRate <= terminalGrowthRate) {
    throw new EngineError(
      'terminal_growth_exceeds_wacc',
      `Gordon terminal value requires WACC > g (received WACC=${waccRate}, g=${terminalGrowthRate}).`,
      'terminal_growth_rate',
    );
  }

  if (!availablePeriods || availablePeriods.length < horizon) {
    throw new EngineError(
      'invalid_horizon',
      `threeStatement contains ${availablePeriods ? availablePeriods.length : 0} period(s), but horizon ${horizon} was requested.`,
      'horizon',
    );
  }

  const periods = availablePeriods.slice(0, horizon);

  if (
    dcfInput.terminalYear !== undefined &&
    dcfInput.terminalYear !== null &&
    dcfInput.terminalYear !== periods[periods.length - 1]
  ) {
    throw new EngineError(
      'mismatched_terminal_year',
      `Gordon terminal value terminal year mismatch: expected "${periods[periods.length - 1]}", received "${dcfInput.terminalYear}".`,
      'terminalYear',
    );
  }

// == 1. Explicit-period PV schedules (FCFF headline & FCFE diagnostic) ===
  const fcffSchedule = [];
  const fcfeSchedule = [];
  let pvExplicitFcff = 0;
  let pvExplicitFcfe = 0;
  const effTaxRate = assumptions?.get
    ? (assumptions.get('effective_tax_rate')?.value ?? 0)
    : (assumptions?.effective_tax_rate?.value ?? 0);

  for (let i = 0; i < periods.length; i += 1) {
    const period = periods[i];
    const t = i + 1;
    const cfPeriod = threeStatement.cashFlow.byPeriod?.[period];
    const fcfLine = cfPeriod?.free_cash_flow;
    const fcfeVal =
      fcfLine && typeof fcfLine === 'object' && typeof fcfLine.value === 'number'
        ? fcfLine.value
        : typeof fcfLine === 'number'
          ? fcfLine
          : null;

    if (fcfeVal === null || !Number.isFinite(fcfeVal)) {
      throw new EngineError(
        'missing_fcf',
        `Free cash flow is missing or non-finite for period "${period}".`,
        period,
      );
    }


    // P10.5: the after-tax interest leg is computed for every period, not only
    // where FCFF must be derived from FCFE, so the contract identity
    //   FCFE - FCFF = after-tax interest income
    // is auditable against the statement-supplied FCFF as well.
    // Fail-closed, not defaulted: a missing interest leg must be a typed error
    // rather than a silent zero, because a silent zero makes the FCFE/FCFF
    // identity appear to hold when in fact the leg was never computed.
    const interestIncomeRow =
      threeStatement.incomeStatement?.byPeriod?.[period]?.interest_income;
    if (
      !interestIncomeRow ||
      typeof interestIncomeRow !== 'object' ||
      typeof interestIncomeRow.value !== 'number' ||
      !Number.isFinite(interestIncomeRow.value)
    ) {
      throw new EngineError(
        'missing_interest_income',
        `Interest income is missing or non-finite for period "${period}"; the FCFE/FCFF identity cannot be computed from an absent leg.`,
        period,
      );
    }
    const afterTaxInterest = interestIncomeRow.value * (1 - effTaxRate);
    const fcffLine = cfPeriod?.fcff;
    let fcffVal =
      fcffLine && typeof fcffLine === 'object' && typeof fcffLine.value === 'number'
        ? fcffLine.value
        : typeof fcffLine === 'number'
          ? fcffLine
          : null;

    if (fcffVal === null) {
      const interestVal =
        threeStatement.incomeStatement?.byPeriod?.[period]?.interest_income?.value ?? 0;
      fcffVal = fcfeVal - afterTaxInterest;
    }

    if (!Number.isFinite(fcffVal)) {
      throw new EngineError(
        'missing_fcf',
        `FCFF cash flow is missing or non-finite for period "${period}".`,
        period,
      );
    }

    const discountFactor = 1 / Math.pow(1 + waccRate, t);
    if (!Number.isFinite(discountFactor)) {
      throw new EngineError(
        'invalid_wacc',
        `Discount factor is non-finite in period "${period}" with WACC ${waccRate}.`,
        'wacc',
      );
    }

    const presentValueFcff = fcffVal * discountFactor;
    pvExplicitFcff += presentValueFcff;
    fcffSchedule.push(
      Object.freeze({
        period,
        t,
        fcf: fcffVal,
        fcff: fcffVal,
        discountFactor,
        presentValue: presentValueFcff,
      }),
    );

    const presentValueFcfe = fcfeVal * discountFactor;
    pvExplicitFcfe += presentValueFcfe;
    fcfeSchedule.push(
      Object.freeze({
        period,
        t,
        fcf: fcfeVal,
        // P10.5: the contract identity, recorded per period so the residual can
        // be audited to zero rather than inferred: FCFE - FCFF = after-tax
        // interest income. Storing it is what lets the test read the engine
        // rather than recompute the identity from its own inputs.
        fcfeLessFcff: afterTaxInterest,
        afterTaxInterestIncome: afterTaxInterest,
        fcfe: fcfeVal,
        discountFactor,
        presentValue: presentValueFcfe,
      }),
    );
  }

  // ── 2. Terminal Steady-State Normalisation (EP.3, EIG-A) ───────────────
  // The final forecast year embeds a working-capital inflow priced at the
  // forecast growth rate; the Gordon perpetuity must capitalise the
  // steady-state equivalent instead. NWC reads come from the working-capital
  // schedule (raw schedule lines); a first-period terminal anchors on the
  // cited BOP balance. The same normalisation applies to the FCFE diagnostic and
  // the legacy path, which share the terminal-year cash flow.
  const terminalPeriodKey = periods[periods.length - 1];
  const wcSupporting =
    threeStatement.supporting && typeof threeStatement.supporting === 'object'
      ? threeStatement.supporting.workingCapital
      : null;
  if (!wcSupporting || typeof wcSupporting.byPeriod !== 'object') {
    throw new EngineError(
      'missing_input',
      'dcf.valuate() requires the working-capital schedule at supporting.workingCapital for terminal normalisation.',
      'supporting.workingCapital',
    );
  }
  const nwcTerminalLine = wcSupporting.byPeriod[terminalPeriodKey];
  if (
    !nwcTerminalLine ||
    typeof nwcTerminalLine.net_working_capital !== 'object' ||
    !Number.isFinite(nwcTerminalLine.net_working_capital.value)
  ) {
    throw new EngineError(
      'missing_line',
      `Working-capital schedule line for terminal period "${terminalPeriodKey}" is missing or non-finite.`,
      terminalPeriodKey,
    );
  }
  const nwcTerminal = nwcTerminalLine.net_working_capital.value;
  const terminalIndex = periods.indexOf(terminalPeriodKey);
  let nwcPrior;
  if (terminalIndex > 0) {
    const priorLine = wcSupporting.byPeriod[periods[terminalIndex - 1]];
    if (
      !priorLine ||
      typeof priorLine.net_working_capital !== 'object' ||
      !Number.isFinite(priorLine.net_working_capital.value)
    ) {
      throw new EngineError(
        'missing_line',
        `Working-capital schedule line for period "${periods[terminalIndex - 1]}" is missing or non-finite.`,
        periods[terminalIndex - 1],
      );
    }
    nwcPrior = priorLine.net_working_capital.value;
  } else {
    const bopForNwc =
      threeStatement.bopBalanceSheet ||
      (threeStatement.supporting && threeStatement.supporting.bopBalanceSheet);
    if (!bopForNwc || !Number.isFinite(bopForNwc.net_working_capital)) {
      throw new EngineError(
        'missing_input',
        'A first-period terminal anchors NWC on the cited BOP balance, which is missing.',
        'bopBalanceSheet.net_working_capital',
      );
    }
    nwcPrior = bopForNwc.net_working_capital;
  }
  const deltaNwcTerminal = nwcTerminal - nwcPrior;
  const wcInflowT = -deltaNwcTerminal;
  const wcInflowSS = -nwcTerminal * terminalGrowthRate;

  const finalFcffItem = fcffSchedule[fcffSchedule.length - 1];
  const fcff_T = finalFcffItem.fcf;
  const df_T = finalFcffItem.discountFactor;

  const fcffTNormalised = fcff_T - wcInflowT + wcInflowSS;
  const terminalFcff = fcffTNormalised * (1 + terminalGrowthRate);
  const terminalValueFcff = terminalFcff / (waccRate - terminalGrowthRate);
  const pvTerminalFcff = terminalValueFcff * df_T;

  const finalFcfeItem = fcfeSchedule[fcfeSchedule.length - 1];
  const fcfe_T = finalFcfeItem.fcf;
  const fcfeTNormalised = fcfe_T - wcInflowT + wcInflowSS;
  const terminalFcfe = fcfeTNormalised * (1 + terminalGrowthRate);
  const terminalValueFcfe = terminalFcfe / (waccRate - terminalGrowthRate);
  const pvTerminalFcfe = terminalValueFcfe * df_T;

  if (
    !Number.isFinite(terminalValueFcff) ||
    !Number.isFinite(pvTerminalFcff) ||
    !Number.isFinite(terminalValueFcfe) ||
    !Number.isFinite(pvTerminalFcfe)
  ) {
    throw new EngineError(
      'invalid_terminal_value',
      'Computed Gordon terminal value or its present value is non-finite.',
      'terminalValue',
    );
  }

  // ── 3. Enterprise Value (FCFF Headline) ────────────────────────────────
  const evFcff = pvExplicitFcff + pvTerminalFcff;

  // Debt resolution:
  // Duolingo is debt-free (P2.3). Total funded debt = 0.
  let debtVal = 0;
  if (typeof wacc?.debtBalance === 'number') {
    debtVal = wacc.debtBalance;
  } else if (typeof wacc?.totalDebt === 'number') {
    debtVal = wacc.totalDebt;
  } else if (wacc?.debtSchedule?.hasDebt === true && Number.isFinite(wacc.debtSchedule.totalDebt)) {
    debtVal = wacc.debtSchedule.totalDebt;
  } else if (
    threeStatement.supporting?.debt?.hasDebt === true &&
    Number.isFinite(threeStatement.supporting.debt.totalDebt)
  ) {
    debtVal = threeStatement.supporting.debt.totalDebt;
  } else if (Array.isArray(wacc?.derivedFrom)) {
    const debtProv = wacc.derivedFrom.find((d) => d && d.kind === 'debtSchedule');
    if (debtProv && typeof debtProv.totalDebt === 'number') {
      debtVal = debtProv.totalDebt;
    }
  }

  // ── 4. Today's Net Cash Bridge (Latest filed Q2 FY2026 balance sheet) ──
  const bop = threeStatement.bopBalanceSheet || threeStatement.supporting?.bopBalanceSheet;
  let cashToday = 0;
  let stiToday = 0;
  let ltiToday = 0;
  const debtToday = debtVal;

  if (bop && typeof bop === 'object') {
    cashToday = bop.cash_and_cash_equivalents ?? 0;
    stiToday = bop.short_term_investments ?? 0;
    ltiToday = bop.long_term_investments ?? 0;
  } else {
    const p0Bs = threeStatement.balanceSheet?.byPeriod?.[periods[0]];
    cashToday =
      p0Bs?.current_assets?.cash_and_cash_equivalents?.value ??
      (typeof p0Bs?.current_assets?.cash_and_cash_equivalents === 'number'
        ? p0Bs.current_assets.cash_and_cash_equivalents
        : 0);
    stiToday =
      p0Bs?.current_assets?.short_term_investments?.value ??
      (typeof p0Bs?.current_assets?.short_term_investments === 'number'
        ? p0Bs.current_assets.short_term_investments
        : 0);
    ltiToday =
      p0Bs?.non_current_assets?.long_term_investments?.value ??
      (typeof p0Bs?.non_current_assets?.long_term_investments === 'number'
        ? p0Bs.non_current_assets.long_term_investments
        : 0);
  }
  const netCashToday = cashToday + stiToday + ltiToday - debtToday;

  // ── 5. Terminal Forecast Net Cash Bridge (Legacy mixed-basis) ──────────
  const terminalPeriod = periods[periods.length - 1];
  const finalBs = threeStatement.balanceSheet.byPeriod?.[terminalPeriod];

  if (!finalBs || typeof finalBs !== 'object') {
    throw new EngineError(
      'missing_balance_sheet',
      `Final forecast balance sheet for period "${terminalPeriod}" is missing.`,
      terminalPeriod,
    );
  }

  const cashVal =
    finalBs.current_assets?.cash_and_cash_equivalents?.value ??
    (typeof finalBs.current_assets?.cash_and_cash_equivalents === 'number'
      ? finalBs.current_assets.cash_and_cash_equivalents
      : null);

  const stiVal =
    finalBs.current_assets?.short_term_investments?.value ??
    (typeof finalBs.current_assets?.short_term_investments === 'number'
      ? finalBs.current_assets.short_term_investments
      : null);

  const ltiVal =
    finalBs.non_current_assets?.long_term_investments?.value ??
    (typeof finalBs.non_current_assets?.long_term_investments === 'number'
      ? finalBs.non_current_assets.long_term_investments
      : null);

  if (cashVal === null || !Number.isFinite(cashVal)) {
    throw new EngineError(
      'missing_balance_sheet_line',
      `cash_and_cash_equivalents is missing or non-finite in balance sheet for "${terminalPeriod}".`,
      'cash_and_cash_equivalents',
    );
  }

  if (stiVal === null || !Number.isFinite(stiVal)) {
    throw new EngineError(
      'missing_balance_sheet_line',
      `short_term_investments is missing or non-finite in balance sheet for "${terminalPeriod}".`,
      'short_term_investments',
    );
  }

  if (ltiVal === null || !Number.isFinite(ltiVal)) {
    throw new EngineError(
      'missing_balance_sheet_line',
      `long_term_investments is missing or non-finite in balance sheet for "${terminalPeriod}".`,
      'long_term_investments',
    );
  }

  const netCashLegacy = cashVal + stiVal + ltiVal - debtVal;

  // ── 6. Equity Values & Per Share ───────────────────────────────────────
  // EIG-B share roll-forward (EP.2): the per-share divisor is the rolled
  // terminal count (BOP plus gross SBC issuance at spot), never the static
  // BOP driver alone. Fail-closed: no static-share fallback path exists.
  // Resolved late (after all input/guard validation) so legacy fail-closed
  // error precedence is preserved.
const sharesSchedule = resolveSharesSchedule(
    dcfInput,
    assumptions,
    threeStatement,
    periods,
    options,
  );
  const sharesOutstanding = sharesSchedule.sharesDcf;

  if (!Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
    throw new EngineError(
      'invalid_shares',
      `Rolled share count must be a positive finite number (received ${sharesOutstanding}).`,
      'shares',
    );
  }
  const moneyScale = UNITS.thousands_usd.scale;

  // FCFF Headline (adds today's net cash)
  const equityValueFcff = evFcff + netCashToday;
  const perShareFcff = (equityValueFcff * moneyScale) / sharesOutstanding;

  // FCFE diagnostic (no cash add)
  const evFcfe = pvExplicitFcfe + pvTerminalFcfe;
  const equityValueFcfe = evFcfe;
  const perShareFcfe = (equityValueFcfe * moneyScale) / sharesOutstanding;

  // Legacy mixed-basis (adds terminal forecast cash)
  const evLegacy = evFcfe;
  const equityValueLegacy = evLegacy + netCashLegacy;
  const perShareLegacy = (equityValueLegacy * moneyScale) / sharesOutstanding;

  if (
    !Number.isFinite(perShareFcff) ||
    !Number.isFinite(perShareFcfe) ||
    !Number.isFinite(perShareLegacy)
  ) {
    throw new EngineError(
      'invalid_per_share',
      'Computed per-share equity value is non-finite.',
      'perShare',
    );
  }

  // ── Provenance & Bridge descriptors ────────────────────────────────────
  const bridgeToday = Object.freeze({
    cash: cashToday,
    shortTermInvestments: stiToday,
    longTermInvestments: ltiToday,
    netCash: netCashToday,
    debt: debtToday,
  });

  const bridgeLegacy = Object.freeze({
    cash: cashVal,
    shortTermInvestments: stiVal,
    longTermInvestments: ltiVal,
    netCash: netCashLegacy,
    debt: debtVal,
  });

  const terminalNormalization = Object.freeze({
    terminalPeriod: terminalPeriodKey,
    nwcTerminal,
    nwcPrior,
    deltaNwcTerminal,
    wcInflowTerminal: wcInflowT,
    wcInflowSteadyState: wcInflowSS,
    fcffTerminal: fcff_T,
    fcffTerminalNormalised: fcffTNormalised,
    fcfeTerminal: fcfe_T,
    fcfeTerminalNormalised: fcfeTNormalised,
  });

  const explicitSlice = fcffSchedule.slice(0, Math.min(periods.length, 5));
  const fadeSlice = periods.length > 5 ? fcffSchedule.slice(5, periods.length) : [];

  const pvExplicitStage = explicitSlice.reduce((sum, item) => sum + item.presentValue, 0);
  const pvFadeStage = fadeSlice.reduce((sum, item) => sum + item.presentValue, 0);

  const pvByStage = Object.freeze({
    explicit: pvExplicitStage,
    fade: pvFadeStage,
    terminal: pvTerminalFcff,
  });

  const fcffBlock = Object.freeze({
    schedule: Object.freeze(fcffSchedule),
    pvExplicit: pvExplicitFcff,
    pvByStage,
    terminalYear: terminalPeriodKey,
    terminalNormalization,
    terminalValue: terminalValueFcff,
    pvTerminal: pvTerminalFcff,
    enterpriseValue: evFcff,
    netCashToday,
    equityValue: equityValueFcff,
    perShare: perShareFcff,
  });

  const fcfeBlock = Object.freeze({
    schedule: Object.freeze(fcfeSchedule),
    pvExplicit: pvExplicitFcfe,
    terminalNormalization,
    terminalValue: terminalValueFcfe,
    pvTerminal: pvTerminalFcfe,
    equityValue: equityValueFcfe,
    perShare: perShareFcfe,
  });

  const equivalenceBlock = Object.freeze({
    debtFree: debtVal === 0,
    statement:
      'At D = 0, WACC ≡ Re, so FCFF and FCFE discount at the same rate; both paths value the same equity claim and converge',
    divergence: perShareFcff - perShareFcfe,
  });

  const legacyBlock = Object.freeze({
    schedule: Object.freeze(fcfeSchedule),
    pvExplicit: pvExplicitFcfe,
    terminalValue: terminalValueFcfe,
    pvTerminal: pvTerminalFcfe,
    enterpriseValue: evLegacy,
    netCash: netCashLegacy,
    equityValue: equityValueLegacy,
    perShare: perShareLegacy,
    bridge: bridgeLegacy,
  });

  const derivedFrom = Object.freeze([
    Object.freeze({
      kind: 'wacc',
      wacc: waccRate,
      debtFree: debtVal === 0,
    }),
    Object.freeze({
      kind: 'assumptionDriver',
      name: gDriver.name,
      label: gDriver.label,
      value: terminalGrowthRate,
      marking: gDriver.marking ?? EST,
    }),
    Object.freeze({
      kind: 'assumptionDriver',
      name: sharesDriver.name,
      label: sharesDriver.label,
      value: bopSharesOutstanding,
      marking: sharesDriver.marking ?? MKT,
      asOf: sharesDriver.asOf ?? null,
      provider: sharesDriver.source?.provider ?? null,
    }),
    Object.freeze({
      kind: 'shareRollForward',
      bopShares: sharesSchedule.bopShares,
      price: sharesSchedule.price,
      totalIssuance: sharesSchedule.totalIssuance,
      sharesDcf: sharesSchedule.sharesDcf,
      terminalPeriod: sharesSchedule.terminalPeriod,
    }),
    Object.freeze({
      kind: 'terminalNormalization',
      terminalPeriod: terminalPeriodKey,
      nwcTerminal,
      nwcPrior,
      deltaNwcTerminal,
      wcInflowTerminal: wcInflowT,
      wcInflowSteadyState: wcInflowSS,
      fcffTerminalNormalised: fcffTNormalised,
      fcfeTerminalNormalised: fcfeTNormalised,
    }),
    Object.freeze({
      kind: 'cashFlow',
      periods: Object.freeze(periods.slice()),
      fcffByPeriod: Object.freeze(
        fcffSchedule.reduce((acc, s) => {
          acc[s.period] = s.fcf;
          return acc;
        }, {}),
      ),
      fcfeByPeriod: Object.freeze(
        fcfeSchedule.reduce((acc, s) => {
          acc[s.period] = s.fcf;
          return acc;
        }, {}),
      ),
    }),
    Object.freeze({
      kind: 'balanceSheet',
      terminalPeriod,
      cashToday,
      shortTermInvestmentsToday: stiToday,
      longTermInvestmentsToday: ltiToday,
      netCashToday,
      cashTerminal: cashVal,
      shortTermInvestmentsTerminal: stiVal,
      longTermInvestmentsTerminal: ltiVal,
      debt: debtVal,
      netCashLegacy,
    }),
  ]);

  // ── Dated Valuation Seam Schedule (P10.2) ─────────────────────────────
  const isDatedMode = dcfInput?.datedSeam === true || dcfInput?.mode === 'dated_seam';
  const datedSchedule = [];
  let pvExplicitDated = 0;
  const seamPeriodKey = periods[0];
  const seamPeriods = threeStatement.datedSeam;
  if (!seamPeriods || typeof seamPeriods !== 'object') {
    throw new EngineError(
      'missing_seam_partition',
      'ThreeStatementOutput.datedSeam is required to build the dated valuation seam.',
      'threeStatement.datedSeam',
    );
  }
  const cfSeamYear = threeStatement.cashFlow?.byPeriod?.[seamPeriodKey];

  // Fail-closed reads: a missing declared partition is an error, never a
  // derived stand-in (P10.2 "No engine-critical missing row may silently
  // become zero" / "No implicit stand-in for a declared valuation period").
  const fcff2026PostVal = requireSeamPartitionValue(
    cfSeamYear,
    'fcff',
    'postValuation',
    `${seamPeriodKey}.fcff.h2.postValuation`,
  );
  const fcff2026H1Actual = requireSeamPartitionValue(cfSeamYear, 'fcff', 'h1', `${seamPeriodKey}.fcff.h1`);
  const fcff2026PreValuation = requireSeamPartitionValue(
    cfSeamYear,
    'fcff',
    'preValuation',
    `${seamPeriodKey}.fcff.h2.preValuation`,
  );
  const fcff2026FullYear = requireSeamPartitionValue(cfSeamYear, 'fcff', 'fullYear', `${seamPeriodKey}.fcff`);

  for (let i = 0; i < periods.length; i += 1) {
    const period = periods[i];
    const periodEndDate = requirePeriodEndDate(period);
    const discountExponent = calculateDiscountExponent(EFFECTIVE_VALUATION_DATE, periodEndDate);
    const dfDated = 1 / Math.pow(1 + waccRate, discountExponent);
    const undiscountedFcf = i === 0 ? fcff2026PostVal : fcffSchedule[i].fcf;
    const pvDated = undiscountedFcf * dfDated;
    pvExplicitDated += pvDated;

    datedSchedule.push(Object.freeze({
      period,
      t: discountExponent,
      periodEndDate,
      discountExponent,
      discountFactor: dfDated,
      undiscountedFcf,
      fcf: undiscountedFcf,
      fcff: undiscountedFcf,
      presentValue: pvDated,
      isStub: i === 0,
      stubDays: i === 0 ? seamPeriods.postValuationDays : null,
      stubFraction: i === 0 ? POST_VALUATION_STUB_FRACTION : null,
    }));
  }

  const finalDatedItem = datedSchedule[datedSchedule.length - 1];
  const dfDated_T = finalDatedItem.discountFactor;
  const pvTerminalDated = terminalValueFcff * dfDated_T;
  const evDated = pvExplicitDated + pvTerminalDated;

  const explicitDatedSlice = datedSchedule.slice(0, Math.min(periods.length, 5));
  const fadeDatedSlice = periods.length > 5 ? datedSchedule.slice(5, periods.length) : [];
  const pvExplicitStageDated = explicitDatedSlice.reduce((sum, item) => sum + item.presentValue, 0);
  const pvFadeStageDated = fadeDatedSlice.reduce((sum, item) => sum + item.presentValue, 0);

  const pvByStageDated = Object.freeze({
    explicit: pvExplicitStageDated,
    fade: pvFadeStageDated,
    terminal: pvTerminalDated,
  });

  const bopCash = (bop && typeof bop.cash_and_cash_equivalents === 'number')
    ? bop.cash_and_cash_equivalents
    : cashToday;
  // The pre-valuation roll-forward and the rolled cash balance are resolved by
  // the three-statement seam, which fails closed when the declared partition is
  // absent. The DCF never re-derives them from a defaulted zero.
  const preValuationCashRoll = requireSeamNumber(
    seamPeriods,
    'preValuationCashChange',
    'threeStatement.datedSeam.preValuationCashChange',
  );
  const rolledCashAtValuationDate = requireSeamNumber(
    seamPeriods,
    'rolledCashAtValuationDate',
    'threeStatement.datedSeam.rolledCashAtValuationDate',
  );
  const netCashDated = rolledCashAtValuationDate + stiToday + ltiToday - debtToday;

  const equityValueDated = evDated + netCashDated;
  const perShareDated = (equityValueDated * moneyScale) / sharesOutstanding;

  // Gates are COMPUTED from resolved seam legs and declared windows, never
  // asserted as literal zeros. `threeStatement.datedSeam` owns the statement
  // and day-count gaps (it fails closed on a missing row); the DCF adds the
  // cash-flow-interval checks it alone can see.
  const seamGateValue = (key) => requireSeamNumber(seamPeriods, key, `threeStatement.datedSeam.${key}`);
  const datedStubStart = requireSeamString(
    seamPeriods,
    'effectiveValuationDate',
    'threeStatement.datedSeam.effectiveValuationDate',
  );
  const datedStubEnd = requirePeriodEndDate(seamPeriodKey);
  const bridgedStart = requireSeamString(
    seamPeriods,
    'reportingCutoff',
    'threeStatement.datedSeam.reportingCutoff',
  );
  const h1Start = requireSeamString(seamPeriods, 'fy2026StartDate', 'threeStatement.datedSeam.fy2026StartDate');
  const h1End = bridgedStart;
  // Dollars of FY2026 FCFF represented in BOTH the rolled-forward bridge and
  // the discounted schedule. Genuinely computed: a double-counted stub, an
  // H1 amount left inside the discounted leg, or a wrong day fraction all
  // drive this above zero.
  const bridgedWindowFcff = fcff2026H1Actual + fcff2026PreValuation;
  const discountedWindowFcff = fcff2026PostVal;
  const h1FcffOverlapDollars = Math.max(
    0,
    bridgedWindowFcff + discountedWindowFcff - fcff2026FullYear,
  );
  const h1FcffOverlapDays = intervalOverlapDays(h1Start, h1End, datedStubStart, datedStubEnd);
  const partitionIntersectionDays = intervalOverlapDays(
    bridgedStart,
    datedStubStart,
    datedStubStart,
    seamPeriods.fy2026EndDate,
  );

  const datedSeamBlock = Object.freeze({
    effectiveValuationDate: EFFECTIVE_VALUATION_DATE,
    reportingCutoff: REPORTING_CUTOFF_DATE,
    terminalDate: requirePeriodEndDate(terminalPeriodKey),
    preValuationDays: PRE_VALUATION_STUB_DAYS,
    postValuationDays: POST_VALUATION_STUB_DAYS,
    h2DaysTotal: H2_DAYS_TOTAL,
    preValuationFraction: PRE_VALUATION_STUB_FRACTION,
    postValuationFraction: POST_VALUATION_STUB_FRACTION,
    schedule: Object.freeze(datedSchedule),
    pvExplicit: pvExplicitDated,
    pvByStage: pvByStageDated,
    terminalValue: terminalValueFcff,
    pvTerminal: pvTerminalDated,
    enterpriseValue: evDated,
    netCash: netCashDated,
    rolledCashAtValuationDate,
    bopCash,
    preValuationCashRoll,
    equityValue: equityValueDated,
    perShare: perShareDated,
    sharesOutstanding,
    terminalYear: terminalPeriodKey,
    seamPeriod: seamPeriodKey,
    windows: Object.freeze({
      h1Actual: Object.freeze({ start: h1Start, end: h1End, role: 'bop_reported' }),
      preValuation: Object.freeze({ start: bridgedStart, end: datedStubStart, role: 'bop_roll_forward' }),
      postValuation: Object.freeze({ start: datedStubStart, end: datedStubEnd, role: 'discounted' }),
    }),
    cashFlowWindows: Object.freeze({
      bridgedWindowFcff,
      discountedWindowFcff,
      fullYearFcff: fcff2026FullYear,
      h1ActualFcff: fcff2026H1Actual,
      preValuationFcff: fcff2026PreValuation,
    }),
    gates: Object.freeze({
      h1FcffOverlap: h1FcffOverlapDollars,
      h1FcffOverlapDays,
      ocfGap: seamGateValue('ocfGap'),
      icfGap: seamGateValue('icfGap'),
      cffGap: seamGateValue('cffGap'),
      cashRollGap: seamGateValue('cashRollGap'),
      partitionGap: seamGateValue('partitionGap'),
      partitionIntersection: partitionIntersectionDays,
      allOutputFinite: Number.isFinite(perShareDated) && Number.isFinite(evDated) && Number.isFinite(equityValueDated),
    }),
  });

  const result = {
    // ── Contract outputs (spec §3.2 & Task P4.2 B & Task P6R2.4 B.2) ─────
    wacc: waccRate,
    terminalGrowthRate,
    horizon,
    periods: Object.freeze(periods.slice()),
    schedule: Object.freeze(isDatedMode ? datedSchedule : fcffSchedule),
    pvExplicit: isDatedMode ? pvExplicitDated : pvExplicitFcff,
    terminalValue: terminalValueFcff,
    pvTerminal: isDatedMode ? pvTerminalDated : pvTerminalFcff,
    enterpriseValue: isDatedMode ? evDated : evFcff,
    /** Alias of `enterpriseValue` for convenience. */
    ev: isDatedMode ? evDated : evFcff,
    netCash: isDatedMode ? netCashDated : netCashToday,
    equityValue: isDatedMode ? equityValueDated : equityValueFcff,
    perShare: isDatedMode ? perShareDated : perShareFcff,
    sharesOutstanding,
    bopSharesOutstanding,
    shares: sharesSchedule,
    bridge: isDatedMode
      ? Object.freeze({
          cash: rolledCashAtValuationDate,
          shortTermInvestments: stiToday,
          longTermInvestments: ltiToday,
          netCash: netCashDated,
          debt: debtToday,
        })
      : bridgeToday,
    pvByStage: isDatedMode ? pvByStageDated : pvByStage,
    terminalYear: terminalPeriodKey,

    // ── Dual-Path & Finding F Blocks ─────────────────────────────────────
    fcff: fcffBlock,
    fcfe: fcfeBlock,
    equivalence: equivalenceBlock,
    legacy: legacyBlock,
    legacyFiveYear: legacyBlock,
    datedSeam: datedSeamBlock,
    basis: 'fcff',
    /**
     * Which basis produced the top-level figures above. `dated_seam` means
     * date-derived fractional exponents, the post-valuation stub, and the
     * rolled cash bridge. `integer_period_index` is the legacy comparison
     * lane. Declared explicitly so a consumer can never infer the basis from
     * a label or guess it from a value.
     */
    valuationBasis: isDatedMode ? 'dated_seam' : 'integer_period_index',
    datedSeamMode: isDatedMode,

    // ── Valuation metadata ───────────────────────────────────────────────
    isComputed: true,
    isEstimate: true,
    marking: EST,
    derivedFrom,
  };

  return deepFreeze(result);
}

export { calculateDiscountExponent };

/**
 * Valuates DCF under the Phase 10 dated valuation seam framework.
 *
 * @param {object} threeStatement
 * @param {object|number} wacc
 * @param {object} [dcfInput]
 * @returns {object}
 */
export function valuateDatedSeam(threeStatement, wacc, dcfInput = {}) {
  return valuate(threeStatement, wacc, { ...dcfInput, datedSeam: true });
}

export default Object.freeze({
  valuate,
  valuateDatedSeam,
  calculateDiscountExponent,
});
