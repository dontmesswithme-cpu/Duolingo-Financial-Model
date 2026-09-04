/**
 * Three-Statement Linkage Engine — IS → BS → CF with Cash Sweep & Balance Invariant.
 *
 * Implements the linked 3-statement model:
 *  - Income Statement below-the-line linkage: other income net, interest income
 *    on average invested cash, pretax income, tax, net income.
 *  - Cash Flow Statement: OCF (with D&A, SBC, and ΔNWC), ICF (PP&E and software capex),
 *    FCF, and Financing (options, tax settlement, buybacks).
 *  - Balance Sheet: cash swept from CF; operating assets & liabilities from schedules;
 *    held-constant lines anchored on Q2 FY2026 cited balance with documented notes;
 *    equity roll: common stock held constant, APIC + SBC + options − buybacks − taxes,
 *    retained earnings + net income (0 dividends).
 *  - Balance Invariant (HARD): asserts assets === liabilities + equity per forecast year;
 *    throws typed EngineError('balance_check_failed', year) if broken.
 *    No balancing plug lines permitted anywhere in construction.
 *
 * FROZEN signature per docs/spec.md §3.2:
 *   project(schedules: ScheduleSet, assumptions: AssumptionSet, forecast: ForecastOutput): ThreeStatementOutput
 *
 * PURE MODULE: zero DOM, zero fetch, zero Date.now, zero Math.random.
 * ZERO BARE NUMERIC LITERALS > 999 outside comments.
 *
 * @module src/engine/threeStatement
 */

import { EngineError } from '../data/errors.js';
import { HALVES_PER_YEAR } from '../data/constants.js';
import { extractRows } from '../data/schema.js';

const MONEY_UNITS = 'thousands_usd';
import {
  projectWorkingCapital,
  projectPpeRollForward,
  projectIntangibleAmortization,
  projectSbc,
} from './schedules.js';

/**
 * Normalizes input arguments to support both positional and object-argument calling conventions.
 *
 * @param {object|ScheduleSet} schedulesOrInput
 * @param {object|AssumptionSet} [assumptionsArg]
 * @param {object|ForecastOutput} [forecastArg]
 * @returns {{ schedules: object, assumptions: object, forecast: object, historical: object|null }}
 */
function normalizeInputs(schedulesOrInput, assumptionsArg, forecastArg) {
  if (
    schedulesOrInput &&
    typeof schedulesOrInput === 'object' &&
    'schedules' in schedulesOrInput &&
    'assumptions' in schedulesOrInput &&
    'forecast' in schedulesOrInput
  ) {
    return {
      schedules: schedulesOrInput.schedules,
      assumptions: schedulesOrInput.assumptions,
      forecast: schedulesOrInput.forecast,
      historical:
        schedulesOrInput.historical ||
        schedulesOrInput.schedules?.historical ||
        schedulesOrInput.forecast?.historical ||
        null,
    };
  }

  return {
    schedules: schedulesOrInput,
    assumptions: assumptionsArg,
    forecast: forecastArg,
    historical:
      schedulesOrInput?.historical ||
      forecastArg?.historical ||
      null,
  };
}

/**
 * Normalizes raw historical input into flat arrays of records.
 *
 * @param {object|Array} historical
 * @returns {Array<object>}
 */
function toFlatRows(historical) {
  if (!historical) return [];
  if (Array.isArray(historical)) return historical;

  const rows = [];
  if (historical.income) rows.push(...extractRows(historical.income));
  if (historical.balance) rows.push(...extractRows(historical.balance));
  if (historical.cashflow) rows.push(...extractRows(historical.cashflow));
  if (historical.kpis) rows.push(...extractRows(historical.kpis));
  if (historical.records && Array.isArray(historical.records)) {
    rows.push(...historical.records);
  }
  return rows;
}

/**
 * Resolves a historical row fail-closed with a typed EngineError.
 *
 * @param {Array<object>} rows
 * @param {string} metric
 * @param {string} period
 * @returns {object}
 */
function requireRow(rows, metric, period) {
  const found = rows.find((r) => r.metric === metric && r.period === period);
  if (!found || !Number.isFinite(found.value)) {
    throw new EngineError(
      'missing_historical_row',
      `Required corpus row for metric "${metric}" in period "${period}" is missing or non-finite.`,
      metric,
    );
  }
  return found;
}

/**
 * Builds a citation reference descriptor from a corpus row.
 *
 * @param {object} row
 * @returns {object}
 */
function citationOf(row) {
  if (!row) return null;
  return {
    metric: row.metric,
    period: row.period,
    value: row.value,
    units: row.units || MONEY_UNITS,
    source: row.source,
  };
}

/**
 * Safely extracts a required driver value from an AssumptionSet or plain object.
 *
 * @param {object} drivers
 * @param {string|string[]} name
 * @returns {number}
 */
function requireDriverValue(drivers, name) {
  const names = Array.isArray(name) ? name : [name];
  let val = undefined;

  for (const n of names) {
    if (drivers) {
      if (typeof drivers.getValue === 'function') {
        try {
          val = drivers.getValue(n);
        } catch {
          val = undefined;
        }
      } else if (typeof drivers.get === 'function') {
        const item = drivers.get(n);
        val = typeof item === 'number' ? item : item?.value;
      } else if (typeof drivers[n] === 'number') {
        val = drivers[n];
      } else if (drivers[n] && typeof drivers[n].value === 'number') {
        val = drivers[n].value;
      }
    }
    if (typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
  }

  throw new EngineError(
    'missing_driver',
    `Required driver "${names[0]}" is missing or non-finite in assumptions payload.`,
    names[0],
  );
}

/**
 * Deep freezes an object and its nested properties.
 *
 * @template T
 * @param {T} obj
 * @returns {Readonly<T>}
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

/**
 * Builds a pure forecast estimate line.
 *
 * @param {number} value
 * @param {Array<object>} derivedFrom
 * @param {string} [units]
 * @returns {object}
 */
function estimateLine(value, derivedFrom = [], units = MONEY_UNITS) {
  if (!Number.isFinite(value)) {
    throw new EngineError(
      'non_finite_projection',
      'A projection line resolved to a non-finite value; inputs or drivers are invalid.',
    );
  }
  return Object.freeze({
    value,
    units,
    provenance: 'estimate',
    isComputed: true,
    isEstimate: true,
    derivedFrom: Object.freeze(derivedFrom.slice()),
  });
}

/**
 * Builds a hybrid FY2026 forecast line: H1 actual + H2 estimate.
 *
 * @param {object} args
 * @param {number} args.h1Value Sum of cited actuals
 * @param {number} args.h2Value Driver model estimate for H2
 * @param {Array<object>} args.h1DerivedFrom Citations for actual rows
 * @param {Array<object>} args.h2DerivedFrom Citations/drivers behind H2 estimate
 * @param {string} [args.units]
 * @returns {object}
 */
function hybridLine({
  h1Value,
  h2Value,
  h1DerivedFrom = [],
  h2DerivedFrom = [],
  units = MONEY_UNITS,
}) {
  if (!Number.isFinite(h1Value) || !Number.isFinite(h2Value)) {
    throw new EngineError(
      'non_finite_projection',
      'A hybrid FY2026 line resolved to a non-finite value; corpus anchor or driver input is invalid.',
    );
  }
  return Object.freeze({
    value: h1Value + h2Value,
    units,
    provenance: 'hybrid',
    isComputed: true,
    isEstimate: true,
    h1: Object.freeze({
      value: h1Value,
      units,
      provenance: 'actual',
      isComputed: true,
      isEstimate: false,
      derivedFrom: Object.freeze(h1DerivedFrom.slice()),
    }),
    h2: Object.freeze({
      value: h2Value,
      units,
      provenance: 'estimate',
      isComputed: true,
      isEstimate: true,
      derivedFrom: Object.freeze(h2DerivedFrom.slice()),
    }),
    derivedFrom: Object.freeze([...h1DerivedFrom, ...h2DerivedFrom]),
  });
}

/**
 * Projects the linked three financial statements across the forecast horizon.
 *
 * FROZEN signature: project(schedules, assumptions, forecast): ThreeStatementOutput
 *
 * @param {object|ScheduleSet} schedulesOrInput
 * @param {object|AssumptionSet} [assumptionsArg]
 * @param {object|ForecastOutput} [forecastArg]
 * @returns {object} ThreeStatementOutput
 */
export function project(schedulesOrInput, assumptionsArg, forecastArg) {
  const { schedules, assumptions, forecast, historical } = normalizeInputs(
    schedulesOrInput,
    assumptionsArg,
    forecastArg,
  );

  if (!schedules || typeof schedules !== 'object') {
    throw new EngineError(
      'missing_input',
      'threeStatement.project() requires a valid schedules payload (from schedules.build).',
      'schedules',
    );
  }

  if (!assumptions) {
    throw new EngineError(
      'missing_input',
      'threeStatement.project() requires an assumptions payload.',
      'assumptions',
    );
  }

  if (!forecast || typeof forecast !== 'object' || !Array.isArray(forecast.periods)) {
    throw new EngineError(
      'missing_input',
      'threeStatement.project() requires a valid forecast payload (from forecast.project).',
      'forecast',
    );
  }

  const periods = forecast.periods;
  if (periods.length === 0) {
    throw new EngineError('invalid_horizon', 'Forecast periods array cannot be empty.', 'periods');
  }

  // ── Drivers resolution ───────────────────────────────────────────────────
  const taxRate = requireDriverValue(assumptions, 'effective_tax_rate');
  const interestRate = requireDriverValue(assumptions, 'interest_income_rate');
  const otherIncomePct = requireDriverValue(assumptions, 'other_income_net_pct_revenue');
  const optionProceedsAnnual = requireDriverValue(assumptions, 'option_proceeds');
  const taxSettlementAnnual = requireDriverValue(assumptions, 'net_share_settlement_taxes');
  const shareRepurchasesAnnual = requireDriverValue(assumptions, 'share_repurchases');

  // ── Supporting schedule projections over forecast revenues ──────────────
  const periodRevenues = periods.map((period) => ({
    period,
    revenue: forecast.byPeriod[period].revenue.total.value,
    costOfRevenue: forecast.byPeriod[period].costs.cost_of_revenue.value,
  }));

  const projWc = projectWorkingCapital(schedules.workingCapital, assumptions, periodRevenues);
  const projPpe = projectPpeRollForward(schedules.ppe, assumptions, periodRevenues);
  const projIntangibles = projectIntangibleAmortization(
    schedules.intangibleAmortization,
    assumptions,
    periodRevenues,
  );
  const projSbc = projectSbc(schedules.sbc, assumptions, periodRevenues);

  // ── Balance Sheet anchors from Q2 FY2026 cited balance ────────────────────
  const bopWcSchedule = schedules.workingCapital.byPeriod['Q2 FY2026'];
  const bopPpeSchedule = schedules.ppe.byPeriod['Q2 FY2026'];
  const bopIntgSchedule = schedules.intangibleAmortization.byPeriod['Q2 FY2026'];

  if (!bopWcSchedule || !bopPpeSchedule || !bopIntgSchedule) {
    throw new EngineError(
      'missing_schedule_anchor',
      'Required Q2 FY2026 schedule anchors are missing from supporting schedules.',
      'Q2 FY2026',
    );
  }

  // Sourced dynamically from corpus with zero hardcoded literals > 999
  const flatRows = toFlatRows(historical || schedules.historical || forecast.historical);
  if (flatRows.length === 0) {
    throw new EngineError(
      'missing_input',
      'threeStatement.project() requires historical corpus rows for cited balance anchors and H1 actuals.',
      'historical',
    );
  }

  const rowCash = requireRow(flatRows, 'cash_and_cash_equivalents', 'Q2 FY2026');
  const rowRestrictedCash = requireRow(flatRows, 'restricted_cash', 'Q2 FY2026');
  const rowStInvestments = requireRow(flatRows, 'short_term_investments', 'Q2 FY2026');
  const rowLtInvestments = requireRow(flatRows, 'long_term_investments', 'Q2 FY2026');
  const rowRouAssets = requireRow(flatRows, 'operating_lease_right_of_use_assets', 'Q2 FY2026');
  const rowGoodwill = requireRow(flatRows, 'goodwill', 'Q2 FY2026');
  const rowDtaNet = requireRow(flatRows, 'deferred_tax_assets_net', 'Q2 FY2026');
  const rowOtherAssets = requireRow(flatRows, 'other_assets', 'Q2 FY2026');
  const rowLeaseLiability = requireRow(flatRows, 'long_term_operating_lease_liability', 'Q2 FY2026');
  const rowDtlNet = requireRow(flatRows, 'deferred_tax_liabilities_net', 'Q2 FY2026');
  const rowCommonStock = requireRow(flatRows, 'common_stock', 'Q2 FY2026');
  const rowApic = requireRow(flatRows, 'additional_paid_in_capital', 'Q2 FY2026');
  const rowRetainedEarnings = requireRow(flatRows, 'retained_earnings_accumulated_deficit', 'Q2 FY2026');
  const rowTreasuryStock = requireRow(flatRows, 'treasury_stock', 'Q2 FY2026');

  // Income Statement H1 actual corpus rows
  const rowOtherQ1 = requireRow(flatRows, 'other_income_net', 'Q1 FY2026');
  const rowOtherQ2 = requireRow(flatRows, 'other_income_net', 'Q2 FY2026');
  const rowInterestQ1 = requireRow(flatRows, 'interest_income', 'Q1 FY2026');
  const rowInterestQ2 = requireRow(flatRows, 'interest_income', 'Q2 FY2026');
  const rowPretaxQ1 = requireRow(flatRows, 'pretax_income', 'Q1 FY2026');
  const rowPretaxQ2 = requireRow(flatRows, 'pretax_income', 'Q2 FY2026');
  const rowTaxQ1 = requireRow(flatRows, 'income_tax', 'Q1 FY2026');
  const rowTaxQ2 = requireRow(flatRows, 'income_tax', 'Q2 FY2026');
  const rowNetQ1 = requireRow(flatRows, 'net_income', 'Q1 FY2026');
  const rowNetQ2 = requireRow(flatRows, 'net_income', 'Q2 FY2026');

  // Cash Flow Statement H1 actual corpus rows
  const rowOcf6M = requireRow(flatRows, 'cash_from_operating_activities', '6M FY2026');
  const rowIcf6M = requireRow(flatRows, 'cash_from_investing_activities', '6M FY2026');
  const rowCff6M = requireRow(flatRows, 'cash_from_financing_activities', '6M FY2026');
  const rowNetChange6M = requireRow(flatRows, 'net_change_in_cash', '6M FY2026');

  const HELD_CONSTANT = Object.freeze({
    short_term_investments: rowStInvestments.value,
    long_term_investments: rowLtInvestments.value,
    operating_lease_right_of_use_assets: rowRouAssets.value,
    goodwill: rowGoodwill.value,
    restricted_cash: rowRestrictedCash.value,
    deferred_tax_assets_net: rowDtaNet.value,
    other_assets: rowOtherAssets.value,
    long_term_operating_lease_liability: rowLeaseLiability.value,
    deferred_tax_liabilities_net: rowDtlNet.value,
    common_stock: rowCommonStock.value,
    treasury_stock: rowTreasuryStock.value,
  });

  const BOP_Q2_FY2026 = Object.freeze({
    cash_and_cash_equivalents: rowCash.value,
    restricted_cash: rowRestrictedCash.value,
    total_cash_and_restricted: rowCash.value + rowRestrictedCash.value,
    short_term_investments: rowStInvestments.value,
    long_term_investments: rowLtInvestments.value,
    invested_cash: rowCash.value + rowStInvestments.value + rowLtInvestments.value,
    net_working_capital: bopWcSchedule.net_working_capital.value,
    ppe_net: bopPpeSchedule.ending_balance.value,
    intangibles_net: bopIntgSchedule.ending_balance.value,
    apic: rowApic.value,
    retained_earnings: rowRetainedEarnings.value,
  });

  // ── Period-by-period projection loop ─────────────────────────────────────
  const isByPeriod = {};
  const cfByPeriod = {};
  const bsByPeriod = {};
  const balanceCheckByPeriod = {};

  let priorBs = { ...BOP_Q2_FY2026 };

  for (let i = 0; i < periods.length; i += 1) {
    const period = periods[i];
    const isHybrid = i === 0;
    const fc = forecast.byPeriod[period];
    const wc = projWc.byPeriod[period];
    const ppe = projPpe.byPeriod[period];
    const intg = projIntangibles.byPeriod[period];
    const sbc = projSbc.byPeriod[period];

    const totalRevenue = fc.revenue.total;
    const operatingIncome = fc.operating_income;

    // 1. Supporting schedule additions and D&A
    let dAndA, sbcExpense, capexPpe, capexIntangibles, totalCapex, deltaNwc;
    let endingPpeNet, endingIntangiblesNet;

    if (isHybrid) {
      // In hybrid FY2026, H2 rolls from Q2 FY2026 cited balance sheet stock
      capexPpe = ppe.additions.value / HALVES_PER_YEAR;
      const ppeDeprecH2 = ppe.depreciation.value / HALVES_PER_YEAR;
      endingPpeNet = BOP_Q2_FY2026.ppe_net + capexPpe - ppeDeprecH2;

      capexIntangibles = intg.additions.value / HALVES_PER_YEAR;
      const intgAmortH2 = intg.amortization.value / HALVES_PER_YEAR;
      endingIntangiblesNet = BOP_Q2_FY2026.intangibles_net + capexIntangibles - intgAmortH2;

      dAndA = ppeDeprecH2 + intgAmortH2;
      sbcExpense = sbc.sbc_expense.value / HALVES_PER_YEAR;
      totalCapex = capexPpe + capexIntangibles;
      deltaNwc = wc.net_working_capital.value - priorBs.net_working_capital;
    } else {
      capexPpe = ppe.additions.value;
      const ppeDeprec = ppe.depreciation.value;
      endingPpeNet = priorBs.ppe_net + capexPpe - ppeDeprec;

      capexIntangibles = intg.additions.value;
      const intgAmort = intg.amortization.value;
      endingIntangiblesNet = priorBs.intangibles_net + capexIntangibles - intgAmort;

      dAndA = ppeDeprec + intgAmort;
      sbcExpense = sbc.sbc_expense.value;
      totalCapex = capexPpe + capexIntangibles;
      deltaNwc = wc.net_working_capital.value - priorBs.net_working_capital;
    }

    const optionProceeds = isHybrid ? optionProceedsAnnual / HALVES_PER_YEAR : optionProceedsAnnual;
    const taxSettlement = isHybrid ? taxSettlementAnnual / HALVES_PER_YEAR : taxSettlementAnnual;
    const shareRepurchases = isHybrid ? shareRepurchasesAnnual / HALVES_PER_YEAR : shareRepurchasesAnnual;
    const financingCashFlow = optionProceeds - taxSettlement - shareRepurchases;

    // 2. Below-the-line Income Statement
    let otherIncomeNetLine;
    if (isHybrid) {
      const h1Other = rowOtherQ1.value + rowOtherQ2.value;
      const h2Other = fc.revenue.total.h2.value * otherIncomePct;
      otherIncomeNetLine = hybridLine({
        h1Value: h1Other,
        h2Value: h2Other,
        h1DerivedFrom: [citationOf(rowOtherQ1), citationOf(rowOtherQ2)],
        h2DerivedFrom: [
          { driver: 'other_income_net_pct_revenue', value: otherIncomePct },
          { from: `revenue.total.${period}.h2`, value: fc.revenue.total.h2.value },
        ],
      });
    } else {
      otherIncomeNetLine = estimateLine(
        totalRevenue.value * otherIncomePct,
        [
          { driver: 'other_income_net_pct_revenue', value: otherIncomePct },
          { from: `revenue.total.${period}`, value: totalRevenue.value },
        ],
      );
    }

    // Closed-form linear interest solve against average invested cash
    const bopInvested =
      priorBs.cash_and_cash_equivalents +
      HELD_CONSTANT.short_term_investments +
      HELD_CONSTANT.long_term_investments;
    const otherInvestments = HELD_CONSTANT.short_term_investments + HELD_CONSTANT.long_term_investments;

    const effInterestRate = isHybrid ? interestRate / HALVES_PER_YEAR : interestRate;
    const preIntOpInc = isHybrid ? fc.operating_income.h2.value : operatingIncome.value;
    const preIntOtherInc = isHybrid
      ? fc.revenue.total.h2.value * otherIncomePct
      : otherIncomeNetLine.value;

    const preIntNetIncome = (preIntOpInc + preIntOtherInc) * (1 - taxRate);
    const preIntOcf = preIntNetIncome + dAndA + sbcExpense - deltaNwc;
    const preIntIcf = -totalCapex;
    const preIntFinancing = financingCashFlow;
    const preIntCashChange = preIntOcf + preIntIcf + preIntFinancing;
    const preIntEndingCash = priorBs.cash_and_cash_equivalents + preIntCashChange;
    const preIntEopInvested = preIntEndingCash + otherInvestments;
    const preIntAvgInvested = (bopInvested + preIntEopInvested) / HALVES_PER_YEAR;

    const denominator = 1 - (effInterestRate * (1 - taxRate)) / HALVES_PER_YEAR;
    if (Math.abs(denominator) < 1e-9) {
      throw new EngineError('zero_division_guard', 'Interest rate calculation resulted in singular denominator.', period);
    }
    const interestIncomeValue = (effInterestRate * preIntAvgInvested) / denominator;

    let interestIncomeLine, pretaxIncomeLine, incomeTaxLine, netIncomeLine;

    if (isHybrid) {
      const h1Interest = rowInterestQ1.value + rowInterestQ2.value;
      const h2Interest = interestIncomeValue;
      interestIncomeLine = hybridLine({
        h1Value: h1Interest,
        h2Value: h2Interest,
        h1DerivedFrom: [citationOf(rowInterestQ1), citationOf(rowInterestQ2)],
        h2DerivedFrom: [
          { driver: 'interest_income_rate', value: interestRate },
          { from: 'average_invested_cash_H2', value: (bopInvested + preIntEndingCash + otherInvestments) / 2 },
        ],
      });

      const h1Pretax = rowPretaxQ1.value + rowPretaxQ2.value;
      const h2Pretax = fc.operating_income.h2.value + otherIncomeNetLine.h2.value + h2Interest;
      pretaxIncomeLine = hybridLine({
        h1Value: h1Pretax,
        h2Value: h2Pretax,
        h1DerivedFrom: [citationOf(rowPretaxQ1), citationOf(rowPretaxQ2)],
        h2DerivedFrom: [
          { from: `operating_income.${period}.h2`, value: fc.operating_income.h2.value },
          { from: `other_income_net.${period}.h2`, value: otherIncomeNetLine.h2.value },
          { from: `interest_income.${period}.h2`, value: h2Interest },
        ],
      });

      const h1Tax = rowTaxQ1.value + rowTaxQ2.value;
      const h2Tax = h2Pretax * taxRate;
      incomeTaxLine = hybridLine({
        h1Value: h1Tax,
        h2Value: h2Tax,
        h1DerivedFrom: [citationOf(rowTaxQ1), citationOf(rowTaxQ2)],
        h2DerivedFrom: [
          { driver: 'effective_tax_rate', value: taxRate },
          { from: `pretax_income.${period}.h2`, value: h2Pretax },
        ],
      });

      const h1Net = rowNetQ1.value + rowNetQ2.value;
      const h2Net = h2Pretax - h2Tax;
      netIncomeLine = hybridLine({
        h1Value: h1Net,
        h2Value: h2Net,
        h1DerivedFrom: [citationOf(rowNetQ1), citationOf(rowNetQ2)],
        h2DerivedFrom: [
          { from: `pretax_income.${period}.h2`, value: h2Pretax },
          { from: `income_tax.${period}.h2`, value: h2Tax },
        ],
      });
    } else {
      interestIncomeLine = estimateLine(interestIncomeValue, [
        { driver: 'interest_income_rate', value: interestRate },
        { from: `average_invested_cash.${period}` },
      ]);
      const pretax = operatingIncome.value + otherIncomeNetLine.value + interestIncomeLine.value;
      pretaxIncomeLine = estimateLine(pretax, [
        { from: `operating_income.${period}`, value: operatingIncome.value },
        { from: `other_income_net.${period}`, value: otherIncomeNetLine.value },
        { from: `interest_income.${period}`, value: interestIncomeLine.value },
      ]);
      const tax = pretax * taxRate;
      incomeTaxLine = estimateLine(tax, [
        { driver: 'effective_tax_rate', value: taxRate },
        { from: `pretax_income.${period}`, value: pretax },
      ]);
      netIncomeLine = estimateLine(pretax - tax, [
        { from: `pretax_income.${period}`, value: pretax },
        { from: `income_tax.${period}`, value: tax },
      ]);
    }

    isByPeriod[period] = Object.freeze({
      period,
      isHybrid,
      provenance: isHybrid ? 'hybrid' : 'estimate',
      revenue: fc.revenue,
      costs: fc.costs,
      gross_profit: fc.gross_profit,
      operating_income: fc.operating_income,
      other_income_net: otherIncomeNetLine,
      interest_income: interestIncomeLine,
      pretax_income: pretaxIncomeLine,
      income_tax: incomeTaxLine,
      net_income: netIncomeLine,
      isComputed: true,
      isEstimate: true,
    });

    // 3. Cash Flow Statement
    let ocfLine, icfLine, fcfLine, fcffLine, cffLine, netChangeInCashLine, endingCashLine;
    let endingCashValue;

    if (isHybrid) {
      const h1Ocf = rowOcf6M.value;
      const h2Ocf = netIncomeLine.h2.value + dAndA + sbcExpense - deltaNwc;
      ocfLine = hybridLine({
        h1Value: h1Ocf,
        h2Value: h2Ocf,
        h1DerivedFrom: [citationOf(rowOcf6M)],
        h2DerivedFrom: [
          { from: `net_income.${period}.h2`, value: netIncomeLine.h2.value },
          { from: `depreciation_and_amortization.${period}.h2`, value: dAndA },
          { from: `stock_based_compensation.${period}.h2`, value: sbcExpense },
          { from: `delta_net_working_capital.${period}.h2`, value: deltaNwc },
        ],
      });

      const h1Icf = rowIcf6M.value;
      const h2Icf = -totalCapex;
      icfLine = hybridLine({
        h1Value: h1Icf,
        h2Value: h2Icf,
        h1DerivedFrom: [citationOf(rowIcf6M)],
        h2DerivedFrom: [
          { from: `ppe_capex.${period}.h2`, value: capexPpe },
          { from: `capitalized_software.${period}.h2`, value: capexIntangibles },
        ],
      });

      fcfLine = hybridLine({
        h1Value: h1Ocf + h1Icf,
        h2Value: h2Ocf + h2Icf,
        h1DerivedFrom: [{ from: 'H1_OCF + H1_ICF', value: h1Ocf + h1Icf }],
        h2DerivedFrom: [{ from: 'H2_OCF + H2_ICF', value: h2Ocf + h2Icf }],
      });

      const h1InterestVal = interestIncomeLine.h1.value;
      const h2InterestVal = interestIncomeLine.h2.value;
      const h1AfterTaxInterest = h1InterestVal * (1 - taxRate);
      const h2AfterTaxInterest = h2InterestVal * (1 - taxRate);
      const h1Fcff = h1Ocf + h1Icf - h1AfterTaxInterest;
      const h2Fcff = h2Ocf + h2Icf - h2AfterTaxInterest;
      fcffLine = hybridLine({
        h1Value: h1Fcff,
        h2Value: h2Fcff,
        h1DerivedFrom: [
          { from: 'H1_FCF - H1_Interest_After_Tax', value: h1Fcff },
          { driver: 'effective_tax_rate', value: taxRate },
        ],
        h2DerivedFrom: [
          { from: 'H2_FCF - H2_Interest_After_Tax', value: h2Fcff },
          { driver: 'interest_income_rate', value: interestRate },
          { driver: 'effective_tax_rate', value: taxRate },
        ],
      });

      const h1Cff = rowCff6M.value;
      const h2Cff = financingCashFlow;
      cffLine = hybridLine({
        h1Value: h1Cff,
        h2Value: h2Cff,
        h1DerivedFrom: [citationOf(rowCff6M)],
        h2DerivedFrom: [
          { driver: 'option_proceeds', value: optionProceeds },
          { driver: 'net_share_settlement_taxes', value: taxSettlement },
          { driver: 'share_repurchases', value: shareRepurchases },
        ],
      });

      const h1NetChange = rowNetChange6M.value;
      const h2NetChange = h2Ocf + h2Icf + h2Cff;
      netChangeInCashLine = hybridLine({
        h1Value: h1NetChange,
        h2Value: h2NetChange,
        h1DerivedFrom: [citationOf(rowNetChange6M)],
        h2DerivedFrom: [{ from: 'H2_OCF + H2_ICF + H2_CFF', value: h2NetChange }],
      });

      endingCashValue = priorBs.cash_and_cash_equivalents + h2NetChange;
      endingCashLine = hybridLine({
        h1Value: BOP_Q2_FY2026.cash_and_cash_equivalents,
        h2Value: h2NetChange,
        h1DerivedFrom: [citationOf(rowCash)],
        h2DerivedFrom: [{ from: `net_change_in_cash.${period}.h2`, value: h2NetChange }],
      });
    } else {
      const ocfVal = netIncomeLine.value + dAndA + sbcExpense - deltaNwc;
      ocfLine = estimateLine(ocfVal, [
        { from: `net_income.${period}`, value: netIncomeLine.value },
        { from: `depreciation_and_amortization.${period}`, value: dAndA },
        { from: `stock_based_compensation.${period}`, value: sbcExpense },
        { from: `delta_net_working_capital.${period}`, value: deltaNwc },
      ]);

      const icfVal = -totalCapex;
      icfLine = estimateLine(icfVal, [
        { from: `ppe_capex.${period}`, value: capexPpe },
        { from: `capitalized_software.${period}`, value: capexIntangibles },
      ]);

      fcfLine = estimateLine(ocfVal + icfVal, [
        { from: `cash_from_operating_activities.${period}`, value: ocfVal },
        { from: `cash_from_investing_activities.${period}`, value: icfVal },
      ]);

      const afterTaxInterest = interestIncomeLine.value * (1 - taxRate);
      const fcffVal = ocfVal + icfVal - afterTaxInterest;
      fcffLine = estimateLine(fcffVal, [
        { from: `free_cash_flow.${period}`, value: ocfVal + icfVal },
        { from: `interest_income.${period}`, value: interestIncomeLine.value },
        { driver: 'effective_tax_rate', value: taxRate },
        { driver: 'interest_income_rate', value: interestRate },
      ]);

      const cffVal = financingCashFlow;
      cffLine = estimateLine(cffVal, [
        { driver: 'option_proceeds', value: optionProceeds },
        { driver: 'net_share_settlement_taxes', value: taxSettlement },
        { driver: 'share_repurchases', value: shareRepurchases },
      ]);

      const netChangeVal = ocfVal + icfVal + cffVal;
      netChangeInCashLine = estimateLine(netChangeVal, [
        { from: `cash_from_operating_activities.${period}`, value: ocfVal },
        { from: `cash_from_investing_activities.${period}`, value: icfVal },
        { from: `cash_from_financing_activities.${period}`, value: cffVal },
      ]);

      endingCashValue = priorBs.cash_and_cash_equivalents + netChangeVal;
      endingCashLine = estimateLine(endingCashValue, [
        { from: 'beginning_cash', value: priorBs.cash_and_cash_equivalents },
        { from: `net_change_in_cash.${period}`, value: netChangeVal },
      ]);
    }

    cfByPeriod[period] = Object.freeze({
      period,
      isHybrid,
      provenance: isHybrid ? 'hybrid' : 'estimate',
      operating_activities: Object.freeze({
        net_income: netIncomeLine,
        depreciation_and_amortization: estimateLine(dAndA, []),
        stock_based_compensation: estimateLine(sbcExpense, []),
        change_in_working_capital: estimateLine(-deltaNwc, []),
        total: ocfLine,
      }),
      investing_activities: Object.freeze({
        purchase_of_property_and_equipment: estimateLine(-capexPpe, []),
        capitalized_software_and_intangibles: estimateLine(-capexIntangibles, []),
        total: icfLine,
      }),
      financing_activities: Object.freeze({
        proceeds_from_stock_options_exercise: estimateLine(optionProceeds, []),
        taxes_paid_net_share_settlement: estimateLine(-taxSettlement, []),
        repurchase_of_common_stock: estimateLine(-shareRepurchases, []),
        total: cffLine,
      }),
      // free_cash_flow is FCFE-basis (net-income derived; frozen P4 consumers)
      free_cash_flow: fcfLine,
      // fcff is FCFF companion line (NI-basis FCF minus after-tax interest income; Finding F)
      fcff: fcffLine,
      net_change_in_cash: netChangeInCashLine,
      beginning_cash: estimateLine(priorBs.cash_and_cash_equivalents, []),
      ending_cash: endingCashLine,
      isComputed: true,
      isEstimate: true,
    });

    // 4. Balance Sheet
    const bsCurrentAssets = {
      cash_and_cash_equivalents: endingCashLine,
      short_term_investments: estimateLine(HELD_CONSTANT.short_term_investments, [
        { note: 'Held constant from Q2 FY2026 cited balance; no forecast driver.' },
      ]),
      accounts_receivable: wc.assets.accounts_receivable,
      deferred_cost_of_revenues: wc.assets.deferred_cost_of_revenues,
      prepaid_expenses_and_other_current_assets: wc.assets.prepaid_expenses_and_other_current_assets,
      income_tax_receivable: wc.assets.income_tax_receivable,
    };

    const totalCurrentAssetsVal =
      endingCashValue +
      HELD_CONSTANT.short_term_investments +
      wc.assets.accounts_receivable.value +
      wc.assets.deferred_cost_of_revenues.value +
      wc.assets.prepaid_expenses_and_other_current_assets.value +
      wc.assets.income_tax_receivable.value;

    const bsNonCurrentAssets = {
      operating_lease_right_of_use_assets: estimateLine(HELD_CONSTANT.operating_lease_right_of_use_assets, [
        { note: 'Held constant from Q2 FY2026 cited balance; no forecast driver.' },
      ]),
      long_term_investments: estimateLine(HELD_CONSTANT.long_term_investments, [
        { note: 'Held constant from Q2 FY2026 cited balance; no forecast driver.' },
      ]),
      property_and_equipment_net: estimateLine(endingPpeNet, [
        { from: `schedules.ppe.${period}.ending_balance`, value: endingPpeNet },
      ]),
      intangible_assets_net: estimateLine(endingIntangiblesNet, [
        { from: `schedules.intangibleAmortization.${period}.ending_balance`, value: endingIntangiblesNet },
      ]),
      goodwill: estimateLine(HELD_CONSTANT.goodwill, [
        { note: 'Held constant from Q2 FY2026 cited balance; no forecast driver.' },
      ]),
      restricted_cash: estimateLine(HELD_CONSTANT.restricted_cash, [
        { note: 'Held constant from Q2 FY2026 cited balance; no forecast driver.' },
      ]),
      deferred_tax_assets_net: estimateLine(HELD_CONSTANT.deferred_tax_assets_net, [
        { note: 'Held constant from Q2 FY2026 cited balance; no forecast driver.' },
      ]),
      other_assets: estimateLine(HELD_CONSTANT.other_assets, [
        { note: 'Held constant from Q2 FY2026 cited balance; no forecast driver.' },
      ]),
    };

    const totalNonCurrentAssetsVal =
      HELD_CONSTANT.operating_lease_right_of_use_assets +
      HELD_CONSTANT.long_term_investments +
      endingPpeNet +
      endingIntangiblesNet +
      HELD_CONSTANT.goodwill +
      HELD_CONSTANT.restricted_cash +
      HELD_CONSTANT.deferred_tax_assets_net +
      HELD_CONSTANT.other_assets;

    const totalAssetsVal = totalCurrentAssetsVal + totalNonCurrentAssetsVal;

    const bsCurrentLiabilities = {
      deferred_revenues: wc.liabilities.deferred_revenues,
      accounts_payable: wc.liabilities.accounts_payable,
      accrued_expenses_and_other_current_liabilities: wc.liabilities.accrued_expenses_and_other_current_liabilities,
      income_tax_payable: wc.liabilities.income_tax_payable,
    };

    const totalCurrentLiabilitiesVal =
      wc.liabilities.deferred_revenues.value +
      wc.liabilities.accounts_payable.value +
      wc.liabilities.accrued_expenses_and_other_current_liabilities.value +
      wc.liabilities.income_tax_payable.value;

    const bsNonCurrentLiabilities = {
      long_term_operating_lease_liability: estimateLine(HELD_CONSTANT.long_term_operating_lease_liability, [
        { note: 'Held constant from Q2 FY2026 cited balance; no forecast driver.' },
      ]),
      deferred_tax_liabilities_net: estimateLine(HELD_CONSTANT.deferred_tax_liabilities_net, [
        { note: 'Held constant from Q2 FY2026 cited balance; no forecast driver.' },
      ]),
    };

    const totalNonCurrentLiabilitiesVal =
      HELD_CONSTANT.long_term_operating_lease_liability +
      HELD_CONSTANT.deferred_tax_liabilities_net;

    const totalLiabilitiesVal = totalCurrentLiabilitiesVal + totalNonCurrentLiabilitiesVal;

    const periodNetIncomeForEquity = isHybrid ? netIncomeLine.h2.value : netIncomeLine.value;
    const apicVal = priorBs.apic + sbcExpense + optionProceeds - taxSettlement - shareRepurchases;
    const retainedEarningsVal = priorBs.retained_earnings + periodNetIncomeForEquity;
    const totalEquityVal =
      HELD_CONSTANT.common_stock +
      apicVal +
      retainedEarningsVal +
      HELD_CONSTANT.treasury_stock;

    const bsEquity = {
      common_stock: estimateLine(HELD_CONSTANT.common_stock, [{ note: 'Held constant; no share issuance driver.' }]),
      additional_paid_in_capital: estimateLine(apicVal, [
        { from: 'prior_apic', value: priorBs.apic },
        { from: `sbc_expense.${period}`, value: sbcExpense },
        { driver: 'option_proceeds', value: optionProceeds },
        { driver: 'net_share_settlement_taxes', value: taxSettlement },
        { driver: 'share_repurchases', value: shareRepurchases },
      ]),
      retained_earnings_accumulated_deficit: estimateLine(retainedEarningsVal, [
        { from: 'prior_retained_earnings', value: priorBs.retained_earnings },
        { from: `net_income.${period}`, value: periodNetIncomeForEquity },
        { note: 'Duolingo pays no dividends; retained earnings rolls by net income.' },
      ]),
      treasury_stock: estimateLine(HELD_CONSTANT.treasury_stock, [{ note: 'Held constant.' }]),
      total: estimateLine(totalEquityVal, []),
    };

    const totalLiabilitiesAndEquityVal = totalLiabilitiesVal + totalEquityVal;
    const difference = totalAssetsVal - totalLiabilitiesAndEquityVal;
    const ok = Math.abs(difference) < 1e-6;

    if (!ok) {
      throw new EngineError(
        'balance_check_failed',
        `Balance invariant failed in ${period}: Assets (${totalAssetsVal}) !== Liabilities + Equity (${totalLiabilitiesAndEquityVal}), difference: ${difference}.`,
        period,
      );
    }

    balanceCheckByPeriod[period] = Object.freeze({
      period,
      assets: totalAssetsVal,
      liabilities: totalLiabilitiesVal,
      equity: totalEquityVal,
      difference,
      ok: true,
    });

    bsByPeriod[period] = Object.freeze({
      period,
      isHybrid,
      provenance: isHybrid ? 'hybrid' : 'estimate',
      current_assets: Object.freeze({
        ...bsCurrentAssets,
        total: estimateLine(totalCurrentAssetsVal, []),
      }),
      non_current_assets: Object.freeze({
        ...bsNonCurrentAssets,
        total: estimateLine(totalNonCurrentAssetsVal, []),
      }),
      total_assets: estimateLine(totalAssetsVal, []),
      current_liabilities: Object.freeze({
        ...bsCurrentLiabilities,
        total: estimateLine(totalCurrentLiabilitiesVal, []),
      }),
      non_current_liabilities: Object.freeze({
        ...bsNonCurrentLiabilities,
        total: estimateLine(totalNonCurrentLiabilitiesVal, []),
      }),
      total_liabilities: estimateLine(totalLiabilitiesVal, []),
      stockholders_equity: Object.freeze(bsEquity),
      total_liabilities_and_stockholders_equity: estimateLine(totalLiabilitiesAndEquityVal, []),
      isComputed: true,
      isEstimate: true,
    });

    // Roll prior balances forward for next period
    priorBs = {
      cash_and_cash_equivalents: endingCashValue,
      restricted_cash: HELD_CONSTANT.restricted_cash,
      total_cash_and_restricted: endingCashValue + HELD_CONSTANT.restricted_cash,
      short_term_investments: HELD_CONSTANT.short_term_investments,
      long_term_investments: HELD_CONSTANT.long_term_investments,
      invested_cash: endingCashValue + otherInvestments,
      net_working_capital: wc.net_working_capital.value,
      ppe_net: endingPpeNet,
      intangibles_net: endingIntangiblesNet,
      apic: apicVal,
      retained_earnings: retainedEarningsVal,
    };
  }

  const result = {
    periods: Object.freeze(periods.slice()),
    incomeStatement: Object.freeze({
      periods: Object.freeze(periods.slice()),
      byPeriod: Object.freeze(isByPeriod),
    }),
    cashFlow: Object.freeze({
      periods: Object.freeze(periods.slice()),
      byPeriod: Object.freeze(cfByPeriod),
    }),
    balanceSheet: Object.freeze({
      periods: Object.freeze(periods.slice()),
      byPeriod: Object.freeze(bsByPeriod),
    }),
    balanceCheck: Object.freeze({
      periods: Object.freeze(periods.slice()),
      byPeriod: Object.freeze(balanceCheckByPeriod),
    }),
    supporting: Object.freeze({
      workingCapital: projWc,
      ppe: projPpe,
      intangibleAmortization: projIntangibles,
      debt: schedules.debt,
      sbc: projSbc,
      bopBalanceSheet: BOP_Q2_FY2026,
    }),
    bopBalanceSheet: BOP_Q2_FY2026,
  };

  return deepFreeze(result);
}

export default {
  project,
};
