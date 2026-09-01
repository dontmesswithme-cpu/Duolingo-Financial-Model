/**
 * DCF Valuation Engine (P4.2).
 *
 * Implements the spec §3.2 frozen interface:
 *   `dcf.valuate(threeStatement: ThreeStatementOutput, wacc: WaccBuild, dcfInput: DcfInput): DcfResult`
 *
 * The valuation pipeline implements the standard Gordon Growth DCF framework:
 *  1. Discount factors: df_t = 1 / (1 + WACC)^t for forecast years t = 1..horizon
 *  2. Explicit-period PV: pvFcf_t = fcf_t × df_t; pvExplicit = Σ pvFcf_t
 *  3. Gordon terminal value: terminalFcf = fcf_T × (1 + g);
 *     terminalValue = terminalFcf / (WACC − g); pvTerminal = terminalValue × df_T
 *     (Hard fail-closed guard: WACC > g required)
 *  4. Enterprise value: EV = pvExplicit + pvTerminal
 *  5. Net cash bridge: netCash = endingCash(T) + shortTermInvestments(T) + longTermInvestments(T) − debt(T)
 *     from the final forecast balance sheet
 *  6. Equity value: Equity = EV + netCash = EV − debt + cashAndInvestments
 *  7. Per-share value: perShare = (equityValue × scale) / sharesOutstanding
 *     where sharesOutstanding is the MKT driver with as-of date
 *
 * Invariants enforced:
 *  - FCF series consumed directly from ThreeStatementOutput.cashFlow.byPeriod[].free_cash_flow
 *  - Hybrid FY2026 FCF consumed as built (H1 cited actuals + H2 engine estimate)
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
import {
  UNITS,
  FORECAST_HORIZON_MIN,
  FORECAST_HORIZON_MAX,
  FORECAST_HORIZON_DEFAULT,
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
function normalizeHorizon(requestedHorizon) {
  if (requestedHorizon === undefined || requestedHorizon === null) {
    return FORECAST_HORIZON_DEFAULT;
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
 * Evaluates the discounted cash flow (DCF) valuation model.
 *
 * @param {object} threeStatement ThreeStatementOutput from `threeStatement.project()`
 * @param {object|number} wacc WaccBuild from `wacc.build()` or numeric WACC rate
 * @param {object} dcfInput Input configuration `{ assumptions, horizon? }`
 * @returns {object} Frozen DcfResult
 * @throws {EngineError} On missing inputs, non-finite values, or WACC <= g
 */
export function valuate(threeStatement, wacc, dcfInput) {
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

  const horizon = normalizeHorizon(dcfInput.horizon);
  const waccRate = resolveWaccRate(wacc);

  // ── Drivers ────────────────────────────────────────────────────────────
  const gDriver = requireDriverValue(assumptions, 'terminal_growth_rate');
  const sharesDriver = requireDriverValue(assumptions, 'shares_outstanding');

  const terminalGrowthRate = gDriver.value;
  const sharesOutstanding = sharesDriver.value;

  if (!Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
    throw new EngineError(
      'missing_driver',
      `shares_outstanding must be a positive finite number (received ${sharesOutstanding}).`,
      'shares_outstanding',
    );
  }

  // ── Gordon Growth Guard: WACC > g ───────────────────────────────────────
  if (waccRate <= terminalGrowthRate) {
    throw new EngineError(
      'terminal_growth_exceeds_wacc',
      `Gordon terminal value requires WACC > g (received WACC=${waccRate}, g=${terminalGrowthRate}).`,
      'terminal_growth_rate',
    );
  }

  // ── Forecast periods ───────────────────────────────────────────────────
  const availablePeriods =
    threeStatement.periods ||
    threeStatement.cashFlow.periods ||
    Object.keys(threeStatement.cashFlow.byPeriod || {});

  if (!availablePeriods || availablePeriods.length < horizon) {
    throw new EngineError(
      'invalid_horizon',
      `threeStatement contains ${availablePeriods ? availablePeriods.length : 0} period(s), but horizon ${horizon} was requested.`,
      'horizon',
    );
  }

  const periods = availablePeriods.slice(0, horizon);

  // ── 1. Explicit-period PV schedule ─────────────────────────────────────
  const schedule = [];
  let pvExplicit = 0;

  for (let i = 0; i < periods.length; i += 1) {
    const period = periods[i];
    const t = i + 1;
    const cfPeriod = threeStatement.cashFlow.byPeriod?.[period];
    const fcfLine = cfPeriod?.free_cash_flow;
    const fcfVal =
      fcfLine && typeof fcfLine === 'object' && typeof fcfLine.value === 'number'
        ? fcfLine.value
        : typeof fcfLine === 'number'
          ? fcfLine
          : null;

    if (fcfVal === null || !Number.isFinite(fcfVal)) {
      throw new EngineError(
        'missing_fcf',
        `Free cash flow is missing or non-finite for period "${period}".`,
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

    const presentValue = fcfVal * discountFactor;
    pvExplicit += presentValue;

    schedule.push(
      Object.freeze({
        period,
        t,
        fcf: fcfVal,
        discountFactor,
        presentValue,
      }),
    );
  }

  // ── 2. Gordon Terminal Value ───────────────────────────────────────────
  const finalScheduleItem = schedule[schedule.length - 1];
  const fcf_T = finalScheduleItem.fcf;
  const df_T = finalScheduleItem.discountFactor;

  const terminalFcf = fcf_T * (1 + terminalGrowthRate);
  const terminalValue = terminalFcf / (waccRate - terminalGrowthRate);
  const pvTerminal = terminalValue * df_T;

  if (!Number.isFinite(terminalValue) || !Number.isFinite(pvTerminal)) {
    throw new EngineError(
      'invalid_terminal_value',
      'Computed Gordon terminal value or its present value is non-finite.',
      'terminalValue',
    );
  }

  // ── 3. Enterprise Value ────────────────────────────────────────────────
  const enterpriseValue = pvExplicit + pvTerminal;

  // ── 4. Net Cash Bridge from final forecast balance sheet ───────────────
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

  // Debt resolution:
  // Duolingo is debt-free (P2.3). Total funded debt = 0.
  // If a synthetic levered schedule is provided in wacc or threeStatement.supporting.debt,
  // evaluate the general debt subtraction formula:
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

  const netCash = cashVal + stiVal + ltiVal - debtVal;

  // ── 5. Equity Value ────────────────────────────────────────────────────
  const equityValue = enterpriseValue + netCash;

  // ── 6. Per-Share Equity Value ──────────────────────────────────────────
  // Statement money lines are in thousands of USD (UNITS.thousands_usd.scale = 1000).
  // Shares outstanding is count of shares.
  // perShare (in USD) = (equityValue × scale) / sharesOutstanding.
  const moneyScale = UNITS.thousands_usd.scale;
  const perShare = (equityValue * moneyScale) / sharesOutstanding;

  if (!Number.isFinite(perShare)) {
    throw new EngineError(
      'invalid_per_share',
      'Computed per-share equity value is non-finite.',
      'perShare',
    );
  }

  // ── Provenance & Bridge descriptors ────────────────────────────────────
  const bridge = Object.freeze({
    cash: cashVal,
    shortTermInvestments: stiVal,
    longTermInvestments: ltiVal,
    netCash,
    debt: debtVal,
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
      value: sharesOutstanding,
      marking: sharesDriver.marking ?? MKT,
      asOf: sharesDriver.asOf ?? null,
      provider: sharesDriver.source?.provider ?? null,
    }),
    Object.freeze({
      kind: 'cashFlow',
      periods: Object.freeze(periods.slice()),
      fcfByPeriod: Object.freeze(
        schedule.reduce((acc, s) => {
          acc[s.period] = s.fcf;
          return acc;
        }, {}),
      ),
    }),
    Object.freeze({
      kind: 'balanceSheet',
      terminalPeriod,
      cash: cashVal,
      shortTermInvestments: stiVal,
      longTermInvestments: ltiVal,
      debt: debtVal,
      netCash,
    }),
  ]);

  const result = {
    // ── Contract outputs (spec §3.2 & Task P4.2 B) ───────────────────────
    wacc: waccRate,
    terminalGrowthRate,
    horizon,
    periods: Object.freeze(periods.slice()),
    schedule: Object.freeze(schedule),
    pvExplicit,
    terminalValue,
    pvTerminal,
    enterpriseValue,
    /** Alias of `enterpriseValue` for convenience. */
    ev: enterpriseValue,
    netCash,
    equityValue,
    perShare,
    sharesOutstanding,
    bridge,

    // ── Valuation metadata ───────────────────────────────────────────────
    isComputed: true,
    isEstimate: true,
    marking: EST,
    derivedFrom,
  };

  return deepFreeze(result);
}

export default Object.freeze({
  valuate,
});
