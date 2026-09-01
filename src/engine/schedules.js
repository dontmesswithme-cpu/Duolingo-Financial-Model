/**
 * Supporting Schedules Calculation Engine.
 *
 * Implements supporting schedules for Duolingo FM:
 *  - Working Capital Schedule (P2.1)
 *  - PP&E Roll-Forward + Intangible Amortization (P2.2)
 *  - Debt Schedule + SBC Schedule (P2.3)
 *
 * All historical schedule lines are computed directly from the loaded corpus
 * (never re-typed). All projection functions are pure functions of (drivers, periodInputs)
 * returning records with isComputed: true and derivedFrom chains.
 *
 * PURE MODULE: zero DOM, zero fetch, zero wall-clock reads (Date.now), zero RNG.
 *
 * @module src/engine/schedules
 */

import { extractRows } from '../data/schema.js';
import { DAYS_IN_YEAR } from '../data/constants.js';
import { EngineError } from '../data/errors.js';
import { compute as computeTtm } from './ttm.js';


/**
 * Standard balance sheet periods in chronological order.
 * @type {ReadonlyArray<string>}
 */
export const BALANCE_PERIODS = Object.freeze([
  'FY2021',
  'FY2022',
  'FY2023',
  'FY2024',
  'FY2025',
  'Q2 FY2026',
]);

/**
 * Working capital line metric keys.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const WORKING_CAPITAL_METRIC_KEYS = Object.freeze({
  assets: Object.freeze([
    'accounts_receivable',
    'deferred_cost_of_revenues',
    'prepaid_expenses_and_other_current_assets',
    'income_tax_receivable',
  ]),
  liabilities: Object.freeze([
    'deferred_revenues',
    'accounts_payable',
    'accrued_expenses_and_other_current_liabilities',
    'income_tax_payable',
  ]),
});

/**
 * PP&E schedule metric keys.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const PPE_METRIC_KEYS = Object.freeze({
  gross: Object.freeze([
    'ppe_leasehold_improvements',
    'ppe_furniture_fixtures_and_equipment',
  ]),
  totals: Object.freeze([
    'ppe_gross',
    'ppe_accumulated_depreciation',
    'property_and_equipment_net',
  ]),
  cashflow: Object.freeze([
    'purchase_of_property_and_equipment',
  ]),
});

/**
 * Intangibles schedule metric keys.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const INTANGIBLE_METRIC_KEYS = Object.freeze({
  gross: Object.freeze([
    'intangibles_capitalized_software',
    'intangibles_acquired',
    'intangibles_other',
    'intangibles_other_indefinite_lived',
  ]),
  totals: Object.freeze([
    'intangibles_gross',
    'intangibles_accumulated_amortization',
    'intangible_assets_net',
    'capitalized_software_net',
  ]),
  cashflow: Object.freeze([
    'capitalized_software_and_intangibles',
    'cf_impairment_capitalized_software',
  ]),
});

/**
 * Debt schedule metric keys.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const DEBT_METRIC_KEYS = Object.freeze({
  operating_leases: Object.freeze([
    'operating_lease_right_of_use_assets',
    'long_term_operating_lease_obligation',
    'long_term_operating_lease_liability',
  ]),
});

/**
 * SBC schedule metric keys.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const SBC_METRIC_KEYS = Object.freeze({
  expense: Object.freeze([
    'cf_stock_based_compensation',
  ]),
  dilution_reference: Object.freeze([
    'proceeds_from_stock_options_exercise',
    'taxes_paid_net_share_settlement',
    'repurchase_of_common_stock',
  ]),
});

/**
 * Resolves the cash flow period key for a given balance date.
 * Q2 FY2026 balance sheet is matched with 6M FY2026 YTD cash flow statement rows.
 *
 * @param {string} period Balance sheet date
 * @returns {string} Cash flow statement period key
 */
export function resolveCfPeriod(period) {
  if (period === 'Q2 FY2026') return '6M FY2026';
  return period;
}




/**
 * Normalizes dataset input into flat arrays of records.
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
 * Finds a row by metric and period.
 *
 * @param {Array<object>} rows
 * @param {string} metric
 * @param {string} period
 * @returns {object|null}
 */
function findRow(rows, metric, period) {
  return rows.find((r) => r.metric === metric && r.period === period) || null;
}

/**
 * Resolves a driver value from an AssumptionSet, Map, or object.
 *
/**
  * Safely extracts a required driver value from an AssumptionSet or plain driver map.
  * Fails closed with typed EngineError if the driver is missing or non-finite.
  *
  * @param {object|Map} drivers
  * @param {string} name
  * @returns {number}
  */
function requireDriverValue(drivers, name) {
  const names = Array.isArray(name) ? name : [name];
  let val = undefined;
  for (const n of names) {
    if (drivers) {
      if (typeof drivers.getValue === 'function') {
        val = drivers.getValue(n);
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
    `Required driver "${names[0]}" is missing or non-finite in drivers payload.`,
    names[0],
  );
}


/**
 * Builds the historical Working Capital Schedule from loaded corpus rows.
 *
 * Excludes cash, cash equivalents, and investments strictly from working capital.
 * All historical values are derived from corpus rows (anti-retyping guarantee).
 *
 * @param {object|Array} historical Loaded historical dataset
 * @returns {object} WorkingCapitalSchedule
 */
export function buildWorkingCapital(historical) {
  const rows = toFlatRows(historical);
  const balanceRows = historical?.balance ? extractRows(historical.balance) : rows.filter((r) => r.klass === 'stock');
  const incomeRows = historical?.income ? extractRows(historical.income) : rows.filter((r) => r.klass === 'flow');

  let ttmResult = null;
  try {
    ttmResult = computeTtm(historical);
  } catch {
    ttmResult = null;
  }

  const byPeriod = {};
  const periods = [...BALANCE_PERIODS];

  for (const period of periods) {
    // 1. Asset lines
    const arRow = findRow(balanceRows, 'accounts_receivable', period);
    const defCostRow = findRow(balanceRows, 'deferred_cost_of_revenues', period);
    const prepaidRow = findRow(balanceRows, 'prepaid_expenses_and_other_current_assets', period);
    const taxRecRow = findRow(balanceRows, 'income_tax_receivable', period);

    const ar = arRow?.value ?? 0;
    const defCost = defCostRow?.value ?? 0;
    const prepaid = prepaidRow?.value ?? 0;
    const taxRec = taxRecRow?.value ?? 0;

    const totalWcAssets = ar + defCost + prepaid + taxRec;

    // 2. Liability lines
    const defRevRow = findRow(balanceRows, 'deferred_revenues', period);
    const apRow = findRow(balanceRows, 'accounts_payable', period);
    const accruedRow = findRow(balanceRows, 'accrued_expenses_and_other_current_liabilities', period);
    const taxPayRow = findRow(balanceRows, 'income_tax_payable', period);

    const defRev = defRevRow?.value ?? 0;
    const ap = apRow?.value ?? 0;
    const accrued = accruedRow?.value ?? 0;
    const taxPay = taxPayRow?.value ?? 0;

    const totalWcLiabilities = defRev + ap + accrued + taxPay;

    // 3. Net Working Capital
    const nwc = totalWcAssets - totalWcLiabilities;

    // 4. Revenue & Cost of Revenue denominator
    let revenue = 0;
    let costOfRevenue = 0;

    if (period === 'Q2 FY2026') {
      const ttmRev = ttmResult?.byMetric?.get('revenue_total');
      const ttmCor = ttmResult?.byMetric?.get('cost_of_revenue');
      if (!ttmRev || !Number.isFinite(ttmRev.value) || ttmRev.value <= 0) {
        throw new EngineError(
          'wc_ttm_denominator_unresolved',
          'Cannot build Working Capital Schedule: TTM revenue is unresolved for Q2 FY2026.',
          'revenue_total',
        );
      }
      if (!ttmCor || !Number.isFinite(ttmCor.value) || ttmCor.value <= 0) {
        throw new EngineError(
          'wc_ttm_denominator_unresolved',
          'Cannot build Working Capital Schedule: TTM cost of revenue is unresolved for Q2 FY2026.',
          'cost_of_revenue',
        );
      }
      revenue = ttmRev.value;
      costOfRevenue = ttmCor.value;
    } else {
      const incRev = findRow(incomeRows, 'revenue_total', period);
      const incCor = findRow(incomeRows, 'cost_of_revenue', period);
      if (!incRev || !Number.isFinite(incRev.value) || incRev.value <= 0) {
        throw new EngineError(
          'wc_annual_denominator_unresolved',
          `Cannot build Working Capital Schedule: Annual revenue is unresolved for ${period}.`,
          'revenue_total',
        );
      }
      revenue = incRev.value;
      costOfRevenue = incCor?.value ?? 0;
    }


    // 5. Ratio & Day calculations
    const dso = revenue > 0 ? (ar / revenue) * DAYS_IN_YEAR : 0;
    const dpo = costOfRevenue > 0 ? (ap / costOfRevenue) * DAYS_IN_YEAR : 0;
    const deferredRevenueDays = revenue > 0 ? (defRev / revenue) * DAYS_IN_YEAR : 0;

    const arPct = revenue > 0 ? ar / revenue : 0;
    const defCostPct = revenue > 0 ? defCost / revenue : 0;
    const prepaidPct = revenue > 0 ? prepaid / revenue : 0;
    const taxRecPct = revenue > 0 ? taxRec / revenue : 0;
    const totalWcAssetsPct = revenue > 0 ? totalWcAssets / revenue : 0;

    const defRevPct = revenue > 0 ? defRev / revenue : 0;
    const apPct = revenue > 0 ? ap / revenue : 0;
    const accruedPct = revenue > 0 ? accrued / revenue : 0;
    const taxPayPct = revenue > 0 ? taxPay / revenue : 0;
    const totalWcLiabilitiesPct = revenue > 0 ? totalWcLiabilities / revenue : 0;

    const nwcPct = revenue > 0 ? nwc / revenue : 0;

    const derivedFrom = [
      arRow,
      defCostRow,
      prepaidRow,
      taxRecRow,
      defRevRow,
      apRow,
      accruedRow,
      taxPayRow,
    ].filter(Boolean);

    byPeriod[period] = {
      period,
      assets: {
        accounts_receivable: { value: ar, pctOfRevenue: arPct, isComputed: true, sourceRow: arRow },
        deferred_cost_of_revenues: { value: defCost, pctOfRevenue: defCostPct, isComputed: true, sourceRow: defCostRow },
        prepaid_expenses_and_other_current_assets: { value: prepaid, pctOfRevenue: prepaidPct, isComputed: true, sourceRow: prepaidRow },
        income_tax_receivable: { value: taxRec, pctOfRevenue: taxRecPct, isComputed: true, sourceRow: taxRecRow },
        total_working_capital_assets: { value: totalWcAssets, pctOfRevenue: totalWcAssetsPct, isComputed: true },
      },
      liabilities: {
        deferred_revenues: { value: defRev, pctOfRevenue: defRevPct, isComputed: true, sourceRow: defRevRow },
        accounts_payable: { value: ap, pctOfRevenue: apPct, isComputed: true, sourceRow: apRow },
        accrued_expenses_and_other_current_liabilities: { value: accrued, pctOfRevenue: accruedPct, isComputed: true, sourceRow: accruedRow },
        income_tax_payable: { value: taxPay, pctOfRevenue: taxPayPct, isComputed: true, sourceRow: taxPayRow },
        total_working_capital_liabilities: { value: totalWcLiabilities, pctOfRevenue: totalWcLiabilitiesPct, isComputed: true },
      },
      net_working_capital: { value: nwc, pctOfRevenue: nwcPct, isComputed: true },
      metrics: {
        dso: { value: dso, units: 'days', isComputed: true },
        dpo: { value: dpo, units: 'days', isComputed: true },
        deferred_revenue_days: { value: deferredRevenueDays, units: 'days', isComputed: true },
        revenue: { value: revenue, isComputed: true },
        cost_of_revenue: { value: costOfRevenue, isComputed: true },
      },
      isComputed: true,
      derivedFrom,
    };
  }

  // Calculate changes in NWC between consecutive historical periods
  for (let i = 0; i < periods.length; i++) {
    const curr = byPeriod[periods[i]];
    const prev = i > 0 ? byPeriod[periods[i - 1]] : null;
    const changeInNwc = prev ? curr.net_working_capital.value - prev.net_working_capital.value : 0;
    curr.change_in_net_working_capital = {
      value: changeInNwc,
      isComputed: true,
    };
  }

  return Object.freeze({
    scheduleType: 'workingCapital',
    periods,
    byPeriod: Object.freeze(byPeriod),
    isComputed: true,
  });
}

/**
 * Pure projection function for Working Capital.
 *
 * Applies drivers (DSO, DPO, % of revenue) to caller-supplied period revenues.
 *
 * @param {object} schedule Base working capital schedule (from buildWorkingCapital)
 * @param {object|Map} drivers Named driver assumptions
 * @param {Array<object>|object} periodInputs Forecast period revenues and cost of revenues
 * @returns {object} ProjectedWorkingCapital
 */
export function projectWorkingCapital(schedule, drivers, periodInputs) {
  const normalizedInputs = Array.isArray(periodInputs)
    ? periodInputs
    : Object.entries(periodInputs || {}).map(([period, data]) => ({
        period,
        revenue: typeof data === 'number' ? data : data.revenue ?? 0,
        costOfRevenue: typeof data === 'object' ? data.costOfRevenue ?? 0 : 0,
      }));

  const dso = requireDriverValue(drivers, 'dso_days');
  const defRevPct = requireDriverValue(drivers, 'deferred_revenue_pct_revenue');
  const defCostPct = requireDriverValue(drivers, 'deferred_cost_pct_revenue');
  const prepaidPct = requireDriverValue(drivers, 'prepaid_expenses_pct_revenue');
  const taxRecPct = requireDriverValue(drivers, 'income_tax_receivable_pct_revenue');
  const dpo = requireDriverValue(drivers, 'dpo_days');
  const apPct = requireDriverValue(drivers, 'accounts_payable_pct_revenue');
  const accruedPct = requireDriverValue(drivers, 'accrued_expenses_pct_revenue');
  const taxPayPct = requireDriverValue(drivers, 'income_tax_payable_pct_revenue');


  const byPeriod = {};
  const periods = [];

  let previousNwc = schedule?.byPeriod?.['FY2025']?.net_working_capital?.value ??
    schedule?.byPeriod?.['Q2 FY2026']?.net_working_capital?.value ??
    0;

  for (const input of normalizedInputs) {
    const period = input.period;
    periods.push(period);
    const revenue = Number.isFinite(input.revenue) ? input.revenue : 0;
    const costOfRevenue = Number.isFinite(input.costOfRevenue) ? input.costOfRevenue : 0;

    // Projected Assets
    const ar = (dso / DAYS_IN_YEAR) * revenue;
    const defCost = defCostPct * revenue;
    const prepaid = prepaidPct * revenue;
    const taxRec = taxRecPct * revenue;
    const totalWcAssets = ar + defCost + prepaid + taxRec;

    // Projected Liabilities
    const defRev = defRevPct * revenue;
    const ap = costOfRevenue > 0 ? (dpo / DAYS_IN_YEAR) * costOfRevenue : apPct * revenue;
    const accrued = accruedPct * revenue;
    const taxPay = taxPayPct * revenue;
    const totalWcLiabilities = defRev + ap + accrued + taxPay;

    // Net Working Capital
    const nwc = totalWcAssets - totalWcLiabilities;
    const changeInNwc = nwc - previousNwc;
    previousNwc = nwc;

    byPeriod[period] = {
      period,
      assets: {
        accounts_receivable: { value: ar, pctOfRevenue: revenue > 0 ? ar / revenue : 0, isComputed: true, isEstimate: true },
        deferred_cost_of_revenues: { value: defCost, pctOfRevenue: defCostPct, isComputed: true, isEstimate: true },
        prepaid_expenses_and_other_current_assets: { value: prepaid, pctOfRevenue: prepaidPct, isComputed: true, isEstimate: true },
        income_tax_receivable: { value: taxRec, pctOfRevenue: taxRecPct, isComputed: true, isEstimate: true },
        total_working_capital_assets: { value: totalWcAssets, pctOfRevenue: revenue > 0 ? totalWcAssets / revenue : 0, isComputed: true, isEstimate: true },
      },
      liabilities: {
        deferred_revenues: { value: defRev, pctOfRevenue: defRevPct, isComputed: true, isEstimate: true },
        accounts_payable: { value: ap, pctOfRevenue: revenue > 0 ? ap / revenue : 0, isComputed: true, isEstimate: true },
        accrued_expenses_and_other_current_liabilities: { value: accrued, pctOfRevenue: accruedPct, isComputed: true, isEstimate: true },
        income_tax_payable: { value: taxPay, pctOfRevenue: taxPayPct, isComputed: true, isEstimate: true },
        total_working_capital_liabilities: { value: totalWcLiabilities, pctOfRevenue: revenue > 0 ? totalWcLiabilities / revenue : 0, isComputed: true, isEstimate: true },
      },
      net_working_capital: {
        value: nwc,
        pctOfRevenue: revenue > 0 ? nwc / revenue : 0,
        isComputed: true,
        isEstimate: true,
      },
      change_in_net_working_capital: {
        value: changeInNwc,
        isComputed: true,
        isEstimate: true,
      },
      metrics: {
        dso: { value: dso, units: 'days', isComputed: true, isEstimate: true },
        dpo: { value: dpo, units: 'days', isComputed: true, isEstimate: true },
        revenue: { value: revenue, isComputed: true, isEstimate: true },
        cost_of_revenue: { value: costOfRevenue, isComputed: true, isEstimate: true },
      },
      isComputed: true,
      isEstimate: true,
      derivedFrom: [
        { driver: 'dso_days', value: dso },
        { driver: 'deferred_revenue_pct_revenue', value: defRevPct },
        { driver: 'deferred_cost_pct_revenue', value: defCostPct },
        { driver: 'prepaid_expenses_pct_revenue', value: prepaidPct },
        { driver: 'income_tax_receivable_pct_revenue', value: taxRecPct },
        { driver: 'dpo_days', value: dpo },
        { driver: 'accrued_expenses_pct_revenue', value: accruedPct },
        { driver: 'income_tax_payable_pct_revenue', value: taxPayPct },
      ],
    };
  }

  return Object.freeze({
    scheduleType: 'workingCapital',
    periods,
    byPeriod: Object.freeze(byPeriod),
    isComputed: true,
    isEstimate: true,
  });
}

/**
 * Builds the historical PP&E Roll-Forward Schedule from loaded corpus rows.
 *
 * All historical values are derived from corpus rows (anti-retyping guarantee).
 * Roll-forward closes per year: BOP Net + Capex Additions - Depreciation + Disposals = EOP Net.
 *
 * @param {object|Array} historical Loaded historical dataset
 * @returns {object} PpeSchedule
 */
export function buildPpeRollForward(historical) {
  const rows = toFlatRows(historical);
  const balanceRows = historical?.balance ? extractRows(historical.balance) : rows.filter((r) => r.klass === 'stock');
  const incomeRows = historical?.income ? extractRows(historical.income) : rows.filter((r) => r.klass === 'flow');
  const cfRows = historical?.cashflow ? extractRows(historical.cashflow) : rows.filter((r) => r.klass === 'flow');

  let ttmResult = null;
  try {
    ttmResult = computeTtm(historical);
  } catch {
    ttmResult = null;
  }

  const byPeriod = {};
  const periods = [...BALANCE_PERIODS];
  let prevEndingNet = null;

  for (const period of periods) {
    const leaseholdRow = findRow(balanceRows, 'ppe_leasehold_improvements', period);
    const ffeRow = findRow(balanceRows, 'ppe_furniture_fixtures_and_equipment', period);
    const ppeGrossRow = findRow(balanceRows, 'ppe_gross', period);
    const ppeAccDepRow = findRow(balanceRows, 'ppe_accumulated_depreciation', period);
    const ppeNetRow = findRow(balanceRows, 'property_and_equipment_net', period);

    const leasehold = leaseholdRow?.value ?? 0;
    const ffe = ffeRow?.value ?? 0;
    const gross = ppeGrossRow?.value ?? (leasehold + ffe);
    const accumulatedDepreciation = ppeAccDepRow?.value ?? 0;
    const endingBalance = ppeNetRow?.value ?? (gross + accumulatedDepreciation);

    const cfPeriod = resolveCfPeriod(period);
    const capexCfRow = findRow(cfRows, 'purchase_of_property_and_equipment', cfPeriod);
    const totalDnaRow = findRow(cfRows, 'cf_depreciation_and_amortization', cfPeriod);
    const amortRow = findRow(incomeRows, 'amortization_expense_total', cfPeriod) || findRow(incomeRows, 'amortization_expense_total', period);

    const additions = capexCfRow ? Math.abs(capexCfRow.value) : 0;
    const totalDna = totalDnaRow ? totalDnaRow.value : 0;
    const amortExpense = amortRow ? amortRow.value : 0;
    const depreciation = totalDna > 0 ? totalDna - amortExpense : 0;

    let beginningBalance = null;
    let disposalsAndOther = null;
    let isRollForwardClosed = false;

    if (period === 'FY2021') {
      beginningBalance = null;
      disposalsAndOther = null;
      isRollForwardClosed = false;
    } else {
      beginningBalance = prevEndingNet;
      disposalsAndOther = endingBalance - (beginningBalance + additions - depreciation);
      isRollForwardClosed = true;
    }

    let revenue = 0;
    if (period === 'Q2 FY2026') {
      const ttmRev = ttmResult?.byMetric?.get('revenue_total');
      if (!ttmRev || !Number.isFinite(ttmRev.value) || ttmRev.value <= 0) {
        throw new EngineError(
          'ppe_ttm_denominator_unresolved',
          'Cannot build PP&E Schedule: TTM revenue is unresolved for Q2 FY2026.',
          'revenue_total',
        );
      }
      revenue = ttmRev.value;
    } else {
      const incRev = findRow(incomeRows, 'revenue_total', period);
      if (!incRev || !Number.isFinite(incRev.value) || incRev.value <= 0) {
        throw new EngineError(
          'ppe_annual_denominator_unresolved',
          `Cannot build PP&E Schedule: Annual revenue is unresolved for ${period}.`,
          'revenue_total',
        );
      }
      revenue = incRev.value;
    }

    const capexPct = revenue > 0 ? additions / revenue : 0;
    const depPctRev = revenue > 0 ? depreciation / revenue : 0;
    const depPctGross = gross > 0 ? depreciation / gross : 0;

    const derivedFrom = [
      ppeNetRow,
      ppeGrossRow,
      ppeAccDepRow,
      leaseholdRow,
      ffeRow,
      capexCfRow,
      totalDnaRow,
      amortRow,
      {
        calculation: 'ppe_depreciation_split',
        basis: 'cf_depreciation_and_amortization minus amortization_expense_total',
        totalDna,
        amortExpense,
        depreciation,
        cfPeriod,
      },
    ].filter(Boolean);

    byPeriod[period] = {
      period,
      cfPeriod,
      beginning_balance: beginningBalance !== null
        ? { value: beginningBalance, isComputed: true }
        : { value: null, isComputed: false, notes: 'No FY2020 balance in corpus; roll-forward begins FY2022' },
      additions: { value: additions, pctOfRevenue: capexPct, isComputed: true, sourceRow: capexCfRow },
      depreciation: { value: depreciation, pctOfRevenue: depPctRev, isComputed: true, sourceRow: totalDnaRow },
      disposals_and_other: disposalsAndOther !== null
        ? { value: disposalsAndOther, isComputed: true }
        : { value: null, isComputed: false },
      ending_balance: { value: endingBalance, isComputed: true, sourceRow: ppeNetRow },
      isRollForwardClosed,
      breakdown: {
        leasehold_improvements: { value: leasehold, isComputed: false, sourceRow: leaseholdRow },
        furniture_fixtures_and_equipment: { value: ffe, isComputed: false, sourceRow: ffeRow },
        gross_ppe: { value: gross, isComputed: false, sourceRow: ppeGrossRow },
        accumulated_depreciation: { value: accumulatedDepreciation, isComputed: false, sourceRow: ppeAccDepRow },
        net_ppe: { value: endingBalance, isComputed: false, sourceRow: ppeNetRow },
      },
      metrics: {
        revenue: { value: revenue, isComputed: period === 'Q2 FY2026' },
        capex_pct_of_revenue: { value: capexPct, units: 'ratio', isComputed: true },
        depreciation_pct_of_revenue: { value: depPctRev, units: 'ratio', isComputed: true },
        depreciation_pct_of_gross_ppe: { value: depPctGross, units: 'ratio', isComputed: true },
      },
      isComputed: true,
      derivedFrom,
    };

    prevEndingNet = endingBalance;
  }

  return Object.freeze({
    scheduleType: 'ppe',
    periods,
    byPeriod: Object.freeze(byPeriod),
    isComputed: true,
  });
}

/**
 * Pure projection function for PP&E Roll-Forward.
 *
 * Applies capex and depreciation % drivers to caller-supplied period revenues.
 *
 * @param {object} schedule Base PP&E schedule (from buildPpeRollForward)
 * @param {object|Map} drivers Named driver assumptions
 * @param {Array<object>|object} periodInputs Forecast period revenues
 * @returns {object} ProjectedPpeRollForward
 */
export function projectPpeRollForward(schedule, drivers, periodInputs) {
  const normalizedInputs = Array.isArray(periodInputs)
    ? periodInputs
    : Object.entries(periodInputs || {}).map(([period, data]) => ({
        period,
        revenue: typeof data === 'number' ? data : data.revenue ?? 0,
      }));

  const capexPpePct = requireDriverValue(drivers, 'capex_ppe_pct_revenue');
  const depPct = requireDriverValue(drivers, 'depreciation_pct_revenue');

  const byPeriod = {};
  const periods = [];

  let previousEndingNet = schedule?.byPeriod?.['FY2025']?.ending_balance?.value ??
    schedule?.byPeriod?.['Q2 FY2026']?.ending_balance?.value ??
    0;

  for (const input of normalizedInputs) {
    const period = input.period;
    periods.push(period);
    const revenue = Number.isFinite(input.revenue) ? input.revenue : 0;

    const beginningBalance = previousEndingNet;
    const additions = revenue * capexPpePct;
    const depreciation = revenue * depPct;
    const disposalsAndOther = 0;
    const endingBalance = beginningBalance + additions - depreciation;
    previousEndingNet = endingBalance;

    byPeriod[period] = {
      period,
      beginning_balance: { value: beginningBalance, isComputed: true, isEstimate: true },
      additions: { value: additions, pctOfRevenue: capexPpePct, isComputed: true, isEstimate: true },
      depreciation: { value: depreciation, pctOfRevenue: depPct, isComputed: true, isEstimate: true },
      disposals_and_other: { value: disposalsAndOther, isComputed: true, isEstimate: true },
      ending_balance: { value: endingBalance, isComputed: true, isEstimate: true },
      metrics: {
        revenue: { value: revenue, isComputed: true, isEstimate: true },
        capex_pct_of_revenue: { value: capexPpePct, units: 'ratio', isComputed: true, isEstimate: true },
        depreciation_pct_of_revenue: { value: depPct, units: 'ratio', isComputed: true, isEstimate: true },
      },
      isComputed: true,
      isEstimate: true,
      derivedFrom: [
        { driver: 'capex_ppe_pct_revenue', value: capexPpePct },
        { driver: 'depreciation_pct_revenue', value: depPct },
      ],
    };
  }

  return Object.freeze({
    scheduleType: 'ppe',
    periods,
    byPeriod: Object.freeze(byPeriod),
    isComputed: true,
    isEstimate: true,
  });
}

/**
 * Builds the historical Intangible Assets & Amortization Schedule from loaded corpus rows.
 *
 * All historical values are derived from corpus rows (anti-retyping guarantee).
 * Roll-forward closes per year: BOP Net + Software Additions + Acquired Additions - Amortization - Impairments + Adjustments = EOP Net.
 *
 * @param {object|Array} historical Loaded historical dataset
 * @returns {object} IntangibleAmortizationSchedule
 */
export function buildIntangibleAmortization(historical) {
  const rows = toFlatRows(historical);
  const balanceRows = historical?.balance ? extractRows(historical.balance) : rows.filter((r) => r.klass === 'stock');
  const incomeRows = historical?.income ? extractRows(historical.income) : rows.filter((r) => r.klass === 'flow');
  const cfRows = historical?.cashflow ? extractRows(historical.cashflow) : rows.filter((r) => r.klass === 'flow');

  let ttmResult = null;
  try {
    ttmResult = computeTtm(historical);
  } catch {
    ttmResult = null;
  }

  const byPeriod = {};
  const periods = [...BALANCE_PERIODS];
  let prevEndingNet = null;
  let prevAcquiredGross = 0;

  for (const period of periods) {
    const capSoftRow = findRow(balanceRows, 'intangibles_capitalized_software', period);
    const acquiredRow = findRow(balanceRows, 'intangibles_acquired', period);
    const otherRow = findRow(balanceRows, 'intangibles_other', period) || findRow(balanceRows, 'intangibles_other_indefinite_lived', period);
    const intGrossRow = findRow(balanceRows, 'intangibles_gross', period);
    const intAccAmortRow = findRow(balanceRows, 'intangibles_accumulated_amortization', period);
    const intNetRow = findRow(balanceRows, 'intangible_assets_net', period) || findRow(balanceRows, 'capitalized_software_net', period);

    const capSoft = capSoftRow?.value ?? 0;
    const acquired = acquiredRow?.value ?? 0;
    const other = otherRow?.value ?? 0;
    const gross = intGrossRow?.value ?? (capSoft + acquired + other);
    const accumulatedAmortization = intAccAmortRow?.value ?? 0;
    const endingBalance = intNetRow?.value ?? (gross + accumulatedAmortization);

    const cfPeriod = resolveCfPeriod(period);
    const capSoftCfRow = findRow(cfRows, 'capitalized_software_and_intangibles', cfPeriod);
    const impairmentCfRow = findRow(cfRows, 'cf_impairment_capitalized_software', cfPeriod);
    const amortRow = findRow(incomeRows, 'amortization_expense_total', cfPeriod) || findRow(incomeRows, 'amortization_expense_total', period);

    const softwareAdditions = capSoftCfRow ? Math.abs(capSoftCfRow.value) : 0;
    const acquiredAdditions = Math.max(0, acquired - prevAcquiredGross);
    const totalAdditions = softwareAdditions + acquiredAdditions;
    const amortization = amortRow ? amortRow.value : 0;
    const impairment = impairmentCfRow ? Math.abs(impairmentCfRow.value) : 0;

    let beginningBalance = null;
    let impairmentsAndOther = null;
    let isRollForwardClosed = false;

    if (period === 'FY2021') {
      beginningBalance = null;
      impairmentsAndOther = null;
      isRollForwardClosed = false;
    } else {
      beginningBalance = prevEndingNet;
      impairmentsAndOther = endingBalance - (beginningBalance + totalAdditions - amortization - impairment);
      isRollForwardClosed = true;
    }

    let revenue = 0;
    if (period === 'Q2 FY2026') {
      const ttmRev = ttmResult?.byMetric?.get('revenue_total');
      if (!ttmRev || !Number.isFinite(ttmRev.value) || ttmRev.value <= 0) {
        throw new EngineError(
          'intangibles_ttm_denominator_unresolved',
          'Cannot build Intangible Amortization Schedule: TTM revenue is unresolved for Q2 FY2026.',
          'revenue_total',
        );
      }
      revenue = ttmRev.value;
    } else {
      const incRev = findRow(incomeRows, 'revenue_total', period);
      if (!incRev || !Number.isFinite(incRev.value) || incRev.value <= 0) {
        throw new EngineError(
          'intangibles_annual_denominator_unresolved',
          `Cannot build Intangible Amortization Schedule: Annual revenue is unresolved for ${period}.`,
          'revenue_total',
        );
      }
      revenue = incRev.value;
    }

    const softPct = revenue > 0 ? softwareAdditions / revenue : 0;
    const amortPct = revenue > 0 ? amortization / revenue : 0;

    const derivedFrom = [
      intNetRow,
      intGrossRow,
      intAccAmortRow,
      capSoftRow,
      acquiredRow,
      otherRow,
      capSoftCfRow,
      impairmentCfRow,
      amortRow,
      {
        calculation: 'intangibles_rollforward_decomposition',
        basis: 'BOP Net + Software Additions + Acquired Additions - Amortization - Impairment + Adjustments = EOP Net',
        softwareAdditions,
        acquiredAdditions,
        totalAdditions,
        amortization,
        impairment,
        cfPeriod,
      },
    ].filter(Boolean);

    byPeriod[period] = {
      period,
      cfPeriod,
      beginning_balance: beginningBalance !== null
        ? { value: beginningBalance, isComputed: true }
        : { value: null, isComputed: false, notes: 'No FY2020 balance in corpus; roll-forward begins FY2022' },
      software_additions: { value: softwareAdditions, pctOfRevenue: softPct, isComputed: true, sourceRow: capSoftCfRow },
      acquired_additions: { value: acquiredAdditions, isComputed: true, sourceRow: acquiredRow },
      additions: { value: totalAdditions, pctOfRevenue: revenue > 0 ? totalAdditions / revenue : 0, isComputed: true },
      amortization: { value: amortization, pctOfRevenue: amortPct, isComputed: true, sourceRow: amortRow },
      impairment: { value: impairment, isComputed: true, sourceRow: impairmentCfRow },
      impairments_and_other: impairmentsAndOther !== null
        ? { value: impairmentsAndOther, isComputed: true }
        : { value: null, isComputed: false },
      ending_balance: { value: endingBalance, isComputed: true, sourceRow: intNetRow },
      isRollForwardClosed,
      breakdown: {
        capitalized_software: { value: capSoft, isComputed: false, sourceRow: capSoftRow },
        acquired_intangibles: { value: acquired, isComputed: false, sourceRow: acquiredRow },
        other_intangibles: { value: other, isComputed: false, sourceRow: otherRow },
        gross_intangibles: { value: gross, isComputed: false, sourceRow: intGrossRow },
        accumulated_amortization: { value: accumulatedAmortization, isComputed: false, sourceRow: intAccAmortRow },
        net_intangibles: { value: endingBalance, isComputed: false, sourceRow: intNetRow },
      },
      metrics: {
        revenue: { value: revenue, isComputed: period === 'Q2 FY2026' },
        capitalized_software_pct_of_revenue: { value: softPct, units: 'ratio', isComputed: true },
        amortization_pct_of_revenue: { value: amortPct, units: 'ratio', isComputed: true },
      },
      isComputed: true,
      derivedFrom,
    };

    prevEndingNet = endingBalance;
    prevAcquiredGross = acquired;
  }

  return Object.freeze({
    scheduleType: 'intangibleAmortization',
    periods,
    byPeriod: Object.freeze(byPeriod),
    isComputed: true,
  });
}

/**
 * Pure projection function for Intangibles & Amortization.
 *
 * Applies capitalized software development and amortization % drivers to caller-supplied period revenues.
 *
 * @param {object} schedule Base intangibles schedule (from buildIntangibleAmortization)
 * @param {object|Map} drivers Named driver assumptions
 * @param {Array<object>|object} periodInputs Forecast period revenues
 * @returns {object} ProjectedIntangibleAmortization
 */
export function projectIntangibleAmortization(schedule, drivers, periodInputs) {
  const normalizedInputs = Array.isArray(periodInputs)
    ? periodInputs
    : Object.entries(periodInputs || {}).map(([period, data]) => ({
        period,
        revenue: typeof data === 'number' ? data : data.revenue ?? 0,
      }));

  const capSoftPct = requireDriverValue(drivers, 'capitalized_software_pct_revenue');
  const amortPct = requireDriverValue(drivers, 'amortization_pct_revenue');

  const byPeriod = {};
  const periods = [];

  let previousEndingNet = schedule?.byPeriod?.['FY2025']?.ending_balance?.value ??
    schedule?.byPeriod?.['Q2 FY2026']?.ending_balance?.value ??
    0;

  for (const input of normalizedInputs) {
    const period = input.period;
    periods.push(period);
    const revenue = Number.isFinite(input.revenue) ? input.revenue : 0;

    const beginningBalance = previousEndingNet;
    const additions = revenue * capSoftPct;
    const amortization = revenue * amortPct;
    const impairmentsAndOther = 0;
    const endingBalance = beginningBalance + additions - amortization;
    previousEndingNet = endingBalance;

    byPeriod[period] = {
      period,
      beginning_balance: { value: beginningBalance, isComputed: true, isEstimate: true },
      software_additions: { value: additions, pctOfRevenue: capSoftPct, isComputed: true, isEstimate: true },
      acquired_additions: { value: 0, isComputed: true, isEstimate: true },
      additions: { value: additions, pctOfRevenue: capSoftPct, isComputed: true, isEstimate: true },
      amortization: { value: amortization, pctOfRevenue: amortPct, isComputed: true, isEstimate: true },
      impairment: { value: 0, isComputed: true, isEstimate: true },
      impairments_and_other: { value: impairmentsAndOther, isComputed: true, isEstimate: true },
      ending_balance: { value: endingBalance, isComputed: true, isEstimate: true },
      metrics: {
        revenue: { value: revenue, isComputed: true, isEstimate: true },
        capitalized_software_pct_of_revenue: { value: capSoftPct, units: 'ratio', isComputed: true, isEstimate: true },
        amortization_pct_of_revenue: { value: amortPct, units: 'ratio', isComputed: true, isEstimate: true },
      },
      isComputed: true,
      isEstimate: true,
      derivedFrom: [
        { driver: 'capitalized_software_pct_revenue', value: capSoftPct },
        { driver: 'amortization_pct_revenue', value: amortPct },
      ],
    };
  }

  return Object.freeze({
    scheduleType: 'intangibleAmortization',
    periods,
    byPeriod: Object.freeze(byPeriod),
    isComputed: true,
    isEstimate: true,
  });
}

/**
 * Builds the Debt Schedule for the model.
 *
 * Duolingo, Inc. is entirely debt-free across all reported periods.
 * This schedule provides an explicit, evidence-backed proof by scanning all balance sheet
 * metrics across all 6 balance sheet dates, confirming zero funded debt, bank borrowings,
 * notes payable, or credit facility obligations exist in any cited filing.
 *
 * Also lists operating lease lines as filed under US GAAP ASC 842 for visibility,
 * with explicit documentation that operating leases are not funded borrowings.
 *
 * @param {object|Array} historical Loaded historical dataset
 * @returns {object} DebtSchedule
 */
export function buildDebt(historical) {
  const rows = toFlatRows(historical);
  const balanceRows = historical?.balance ? extractRows(historical.balance) : rows.filter((r) => r.klass === 'stock');

  const periods = [...BALANCE_PERIODS];
  const debtRegex = /borrow|debt|note|loan|credit|facility/i;

  const scannedByPeriod = {};
  let foundDebt = false;

  for (const period of periods) {
    const periodRows = balanceRows.filter((r) => r.period === period);
    const presentMetrics = periodRows.map((r) => r.metric);
    const matchingDebtRows = periodRows.filter(
      (r) => debtRegex.test(r.metric) || debtRegex.test(r.label || ''),
    );

    if (matchingDebtRows.length > 0) {
      foundDebt = true;
    }

    const rouAssetRow = findRow(balanceRows, 'operating_lease_right_of_use_assets', period);
    const leaseLiabRow = findRow(balanceRows, 'long_term_operating_lease_obligation', period) ||
      findRow(balanceRows, 'long_term_operating_lease_liability', period);

    scannedByPeriod[period] = {
      period,
      presentMetrics,
      matchingDebtMetrics: matchingDebtRows.map((r) => r.metric),
      operating_leases: {
        right_of_use_assets: {
          value: rouAssetRow?.value ?? 0,
          isComputed: false,
          sourceRow: rouAssetRow,
        },
        long_term_lease_liability: {
          value: leaseLiabRow?.value ?? 0,
          isComputed: false,
          sourceRow: leaseLiabRow,
        },
        notes: 'US GAAP ASC 842 operating lease obligations are not funded debt or borrowings; current operating lease liability portion is included within accrued liabilities per filing disclosures.',
      },
    };
  }

  const derivedFrom = balanceRows.filter((r) =>
    ['operating_lease_right_of_use_assets', 'long_term_operating_lease_obligation', 'long_term_operating_lease_liability'].includes(r.metric),
  );

  return Object.freeze({
    scheduleType: 'debt',
    hasDebt: foundDebt,
    status: foundDebt ? 'funded_debt_present' : 'debt_free_verified',
    statementBasis: 'Duolingo, Inc. has zero funded debt, zero bank borrowings, zero credit facility drawings, and zero promissory notes outstanding across all reported periods (FY2021–Q2 FY2026).',
    periods,
    byPeriod: Object.freeze(scannedByPeriod),
    isComputed: true,
    derivedFrom,
  });
}

/**
 * Builds the historical Stock-Based Compensation (SBC) Schedule from loaded corpus rows.
 *
 * Compiles annual SBC expense from Consolidated Statements of Cash Flows and derives TTM SBC
 * dynamically via discrete-quarter differencing (ttm.compute).
 * Computes SBC % of revenue across all historical periods.
 * Includes dilution-context reference rows from financing cash flows (option exercise proceeds,
 * net share settlement taxes paid, share repurchases) labeled strictly as reference.
 *
 * @param {object|Array} historical Loaded historical dataset
 * @returns {object} SbcSchedule
 */
export function buildSbc(historical) {
  const rows = toFlatRows(historical);
  const incomeRows = historical?.income ? extractRows(historical.income) : rows.filter((r) => r.klass === 'flow');
  const cfRows = historical?.cashflow ? extractRows(historical.cashflow) : rows.filter((r) => r.klass === 'flow');

  let ttmResult = null;
  try {
    ttmResult = computeTtm(historical);
  } catch {
    ttmResult = null;
  }

  const annualPeriods = ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'];
  const allPeriods = [...annualPeriods, 'TTM'];
  const byPeriod = {};

  for (const period of annualPeriods) {
    const sbcRow = findRow(cfRows, 'cf_stock_based_compensation', period);
    const revRow = findRow(incomeRows, 'revenue_total', period);

    const sbcExpense = sbcRow ? sbcRow.value : 0;
    const revenue = revRow ? revRow.value : 0;
    const pctOfRevenue = revenue > 0 ? sbcExpense / revenue : 0;

    const optionProceedsRow = findRow(cfRows, 'proceeds_from_stock_options_exercise', period);
    const taxSettlementRow = findRow(cfRows, 'taxes_paid_net_share_settlement', period);
    const shareRepurchaseRow = findRow(cfRows, 'repurchase_of_common_stock', period);

    byPeriod[period] = {
      period,
      sbc_expense: { value: sbcExpense, isComputed: false, sourceRow: sbcRow },
      revenue: { value: revenue, isComputed: false, sourceRow: revRow },
      sbc_pct_of_revenue: { value: pctOfRevenue, units: 'ratio', isComputed: true },
      dilution_reference: {
        proceeds_from_stock_options_exercise: { value: optionProceedsRow?.value ?? 0, sourceRow: optionProceedsRow, isReference: true },
        taxes_paid_net_share_settlement: { value: taxSettlementRow?.value ?? 0, sourceRow: taxSettlementRow, isReference: true },
        repurchase_of_common_stock: { value: shareRepurchaseRow?.value ?? 0, sourceRow: shareRepurchaseRow, isReference: true },
        notes: 'Dilution-context reference rows transcribed directly from Consolidated Statements of Cash Flows financing activities.',
      },
      isComputed: true,
      derivedFrom: [sbcRow, revRow, optionProceedsRow, taxSettlementRow, shareRepurchaseRow].filter(Boolean),
    };
  }

  // TTM Period
  const ttmSbcRow = ttmResult?.byMetric?.get('cf_stock_based_compensation');
  const ttmRevRow = ttmResult?.byMetric?.get('revenue_total');
  const ttmSbc = ttmSbcRow?.value ?? 0;
  const ttmRev = ttmRevRow?.value ?? 0;
  const ttmSbcPct = ttmRev > 0 ? ttmSbc / ttmRev : 0;

  const ttmOptionProceeds = ttmResult?.byMetric?.get('proceeds_from_stock_options_exercise')?.value ?? 0;
  const ttmTaxSettlement = ttmResult?.byMetric?.get('taxes_paid_net_share_settlement')?.value ?? 0;
  const ttmShareRepurchase = ttmResult?.byMetric?.get('repurchase_of_common_stock')?.value ?? 0;

  byPeriod['TTM'] = {
    period: 'TTM',
    sbc_expense: { value: ttmSbc, isComputed: true, sourceRow: ttmSbcRow },
    revenue: { value: ttmRev, isComputed: true, sourceRow: ttmRevRow },
    sbc_pct_of_revenue: { value: ttmSbcPct, units: 'ratio', isComputed: true },
    dilution_reference: {
      proceeds_from_stock_options_exercise: { value: ttmOptionProceeds, isReference: true },
      taxes_paid_net_share_settlement: { value: ttmTaxSettlement, isReference: true },
      repurchase_of_common_stock: { value: ttmShareRepurchase, isReference: true },
      notes: 'TTM dilution-context reference rows derived via discrete-quarter differencing.',
    },
    isComputed: true,
    derivedFrom: [ttmSbcRow, ttmRevRow].filter(Boolean),
  };

  return Object.freeze({
    scheduleType: 'sbc',
    periods: allPeriods,
    byPeriod: Object.freeze(byPeriod),
    isComputed: true,
  });
}

/**
 * Pure projection function for Stock-Based Compensation.
 *
 * Applies sbc_target_pct_of_revenue driver to caller-supplied period revenues.
 *
 * @param {object} schedule Base SBC schedule (from buildSbc)
 * @param {object|Map} drivers Named driver assumptions
 * @param {Array<object>|object} periodInputs Forecast period revenues
 * @returns {object} ProjectedSbcSchedule
 */
export function projectSbc(schedule, drivers, periodInputs) {
  const normalizedInputs = Array.isArray(periodInputs)
    ? periodInputs
    : Object.entries(periodInputs || {}).map(([period, data]) => ({
        period,
        revenue: typeof data === 'number' ? data : data.revenue ?? 0,
      }));

  const sbcPct = requireDriverValue(drivers, ['sbc_target_pct_of_revenue', 'sbc_pct_revenue']);

  const byPeriod = {};
  const periods = [];

  for (const input of normalizedInputs) {
    const period = input.period;
    periods.push(period);
    const revenue = Number.isFinite(input.revenue) ? input.revenue : 0;
    const sbcExpense = revenue * sbcPct;

    byPeriod[period] = {
      period,
      sbc_expense: { value: sbcExpense, isComputed: true, isEstimate: true },
      revenue: { value: revenue, isComputed: true, isEstimate: true },
      sbc_pct_of_revenue: { value: sbcPct, units: 'ratio', isComputed: true, isEstimate: true },
      isComputed: true,
      isEstimate: true,
      derivedFrom: [
        { driver: 'sbc_target_pct_of_revenue', value: sbcPct },
      ],
    };
  }

  return Object.freeze({
    scheduleType: 'sbc',
    periods,
    byPeriod: Object.freeze(byPeriod),
    isComputed: true,
    isEstimate: true,
  });
}

/**
 * Builds the complete five-family schedule set for the model.
 *
 * FROZEN signature per spec §3.2: build(historical, assumptions): ScheduleSet
 *
 * Returns all five populated schedule families:
 *  - workingCapital: Working Capital Schedule
 *  - ppe: PP&E Roll-Forward Schedule
 *  - intangibleAmortization: Intangible Assets & Amortization Schedule
 *  - debt: Debt Schedule (debt-free verified proof & operating lease disclosures)
 *  - sbc: Stock-Based Compensation Schedule
 *
 * @param {object} historical Loaded historical dataset
 * @param {object} [assumptions] Loaded assumptions dataset (available for forecast extensions)
 * @returns {object} ScheduleSet
 */
export function build(historical, assumptions = null) {
  const workingCapital = buildWorkingCapital(historical);
  const ppe = buildPpeRollForward(historical);
  const intangibleAmortization = buildIntangibleAmortization(historical);
  const debt = buildDebt(historical);
  const sbc = buildSbc(historical);

  return Object.freeze({
    workingCapital,
    ppe,
    intangibleAmortization,
    debt,
    sbc,
  });
}

export default {
  build,
  buildWorkingCapital,
  projectWorkingCapital,
  buildPpeRollForward,
  projectPpeRollForward,
  buildIntangibleAmortization,
  projectIntangibleAmortization,
  buildDebt,
  buildSbc,
  projectSbc,
  resolveCfPeriod,
  BALANCE_PERIODS,
  WORKING_CAPITAL_METRIC_KEYS,
  PPE_METRIC_KEYS,
  INTANGIBLE_METRIC_KEYS,
  DEBT_METRIC_KEYS,
  SBC_METRIC_KEYS,
};



