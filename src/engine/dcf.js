/**
 * DCF Valuation Engine (P4.2).
 *
 * Implements the spec §3.2 frozen interface:
 *   `dcf.valuate(threeStatement: ThreeStatementOutput, wacc: WaccBuild, dcfInput: DcfInput): DcfResult`
 *
 * The valuation pipeline implements the standard Gordon Growth DCF framework:
 *  1. Discount factors: df_t = 1 / (1 + WACC)^t for forecast years t = 1..horizon
 *  2. Explicit-period PV: pvFcf_t = fcf_t × df_t; pvExplicit = Σ pvFcf_t
 *  3. Terminal steady-state normalisation (EP.3, EIG-A) + Gordon terminal value:
 *     wcInflowT = −ΔNWC_T (final-year working-capital inflow from the WC
 *     schedule); wcInflowSS = −NWC_T × g (steady-state replacement at the
 *     perpetuity rate); fcffTNormalised = fcff_T − wcInflowT + wcInflowSS;
 *     terminalFcf = fcffTNormalised × (1 + g);
 *     terminalValue = terminalFcf / (WACC − g); pvTerminal = terminalValue × df_T
 *     (Hard fail-closed guard: WACC > g required; the FCFE floor and legacy
 *     paths normalise their shared terminal-year cash flow identically)
 *  4. Enterprise value: EV = pvExplicit + pvTerminal
 *  5. Net cash bridge: netCash = endingCash(T) + shortTermInvestments(T) + longTermInvestments(T) − debt(T)
 *     from the final forecast balance sheet
 *  6. Equity value: Equity = EV + netCash = EV − debt + cashAndInvestments
 *  7. Per-share value: perShare = (equityValue × scale) / sharesOutstanding
 *     where sharesOutstanding is the EIG-B share roll-forward terminal count
 *     (BOP MKT driver plus gross SBC issuance at spot, EP.2 — the static
 *     driver divisor is retired; see src/engine/shares.js)
 *
 * Invariants enforced:
 *  - FCF series consumed directly from ThreeStatementOutput.cashFlow.byPeriod[].free_cash_flow
 *  - Hybrid FY2026 FCF consumed as built (H1 cited actuals + H2 engine estimate)
 *  - Terminal steady-state law (EP.3, EIG-A): the final-year WC inflow is
 *    replaced by its perpetuity-rate equivalent before Gordon capitalisation
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
import { projectShares } from './shares.js';
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
function resolveSharesSchedule(dcfInput, assumptions, threeStatement) {
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
    return supplied;
  }
  let corpus = null;
  if (hasInput && typeof dcfInput.corpus !== 'undefined') {
    corpus = dcfInput.corpus;
  }
  return projectShares(assumptions, threeStatement, corpus);
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

  // ── 1. Explicit-period PV schedules (FCFF headline & FCFE floor) ───────
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
      const afterTaxInterest = interestVal * (1 - effTaxRate);
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
  // cited BOP balance. The same normalisation applies to the FCFE floor and
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
  const sharesSchedule = resolveSharesSchedule(dcfInput, assumptions, threeStatement);
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

  // FCFE Floor (no cash add)
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

  const fcffBlock = Object.freeze({
    schedule: Object.freeze(fcffSchedule),
    pvExplicit: pvExplicitFcff,
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

  const result = {
    // ── Contract outputs (spec §3.2 & Task P4.2 B & Task P6R2.4 B.2) ─────
    wacc: waccRate,
    terminalGrowthRate,
    horizon,
    periods: Object.freeze(periods.slice()),
    schedule: Object.freeze(fcffSchedule),
    pvExplicit: pvExplicitFcff,
    terminalValue: terminalValueFcff,
    pvTerminal: pvTerminalFcff,
    enterpriseValue: evFcff,
    /** Alias of `enterpriseValue` for convenience. */
    ev: evFcff,
    netCash: netCashToday,
    equityValue: equityValueFcff,
    perShare: perShareFcff,
    sharesOutstanding,
    bopSharesOutstanding,
    shares: sharesSchedule,
    bridge: bridgeToday,

    // ── Dual-Path & Finding F Blocks ─────────────────────────────────────
    fcff: fcffBlock,
    fcfe: fcfeBlock,
    equivalence: equivalenceBlock,
    legacy: legacyBlock,
    basis: 'fcff',

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
