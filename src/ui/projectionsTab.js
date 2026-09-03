/**
 * Three-Statement Projections Tab View (Phase 5.4).
 *
 * Renders the 3 integrated projection statements and Hybrid FY2026 decomposition:
 *  1. Income Statement Projections (Segment revenue cascade, cost margins, EBIT, tax, net income)
 *  2. Balance Sheet Projections (Cash sweep, operating assets/liabilities, equity roll, A === L + E)
 *  3. Cash Flow Statement Projections (OCF, Capex, FCF, Financing, cash sweep roll)
 *  4. Hybrid FY2026 Provenance Card (H1 actuals + H2 estimates split)
 *
 * All figures flow directly from injected historical dataset and threeStatement engine
 * (ZERO hardcoded fallback literals or invented actuals).
 *
 * Tabulator Grid Standards:
 *  - 10-year span (FY2021..FY2025 historical + FY2026..FY2030 projected with EST badges)
 *  - Frozen label column, headerSort: false, editor: false on all columns
 *  - selectableRange: true, selectableRangeColumns: true, clipboard: true, keybindings: true
 *  - Cell color-coding via formatter emitting cell-formula / cell-link classes
 *  - Single visible table implementation (live Tabulator mount)
 *
 * @module src/ui/projectionsTab
 */

import { EngineError } from '../data/errors.js';
import { extractRows } from '../data/schema.js';
import { usd, percent, estSuffix } from './format.js';
import { TabulatorFull as DefaultTabulator } from './tabulator.js';
import { createRevenueFcfChart, createMarginChart } from './charts.js';

const HISTORICAL_PERIODS = Object.freeze(['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025']);
const FORECAST_PERIODS = Object.freeze(['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']);
const ALL_PERIODS = Object.freeze([...HISTORICAL_PERIODS, ...FORECAST_PERIODS]);

/**
 * Maps historical dataset rows into a metric-keyed lookup table by period.
 *
 * @param {object} historical
 * @returns {Record<string, Record<string, number>>}
 */
function createHistoricalLookup(historical) {
  const lookup = {};
  if (!historical) return lookup;
  const statements = ['income', 'balance', 'cashflow'];
  for (const stmt of statements) {
    if (!historical[stmt]) continue;
    const rows = extractRows(historical[stmt]);
    for (const row of rows) {
      if (!row || !row.metric || !row.period) continue;
      if (!lookup[row.metric]) lookup[row.metric] = {};
      lookup[row.metric][row.period] = row.value;
    }
  }
  return lookup;
}

/**
 * Builds Tabulator column definitions across the 10-year span.
 *
 * @param {object} [options]
 * @param {boolean} [options.isPct=false]
 * @returns {Array<object>}
 */
export function buildProjectionColumns({ isPct = false } = {}) {
  return [
    {
      title: 'Financial Statement Line Item',
      field: 'label',
      frozen: true,
      headerSort: false,
      editor: false,
      minWidth: 260,
      formatter: (cell) => {
        const row = typeof cell.getRow === 'function' ? cell.getRow().getData() : cell;
        const linkClass = row.isLink ? 'cell-link' : 'cell-formula';
        return `<div class="projection-metric-label ${linkClass}">${row.label || ''}</div>`;
      },
    },
    ...HISTORICAL_PERIODS.map((period) => ({
      title: period,
      field: period,
      headerSort: false,
      hozAlign: 'right',
      editor: false,
      minWidth: 95,
      formatter: (cell) => {
        const val = typeof cell.getValue === 'function' ? cell.getValue() : cell;
        if (val === null || val === undefined || !Number.isFinite(val)) return '—';
        const row = typeof cell.getRow === 'function' ? cell.getRow().getData() : {};
        const isRatio = row.isPct || isPct;
        return isRatio ? percent(val) : usd(val, { decimals: 0 });
      },
    })),
    ...FORECAST_PERIODS.map((period) => ({
      title: period,
      field: period,
      headerSort: false,
      hozAlign: 'right',
      editor: false,
      minWidth: 95,
      titleFormatter: () => estSuffix(period, 'EST'),
      formatter: (cell) => {
        const val = typeof cell.getValue === 'function' ? cell.getValue() : cell;
        if (val === null || val === undefined || !Number.isFinite(val)) return '—';
        const row = typeof cell.getRow === 'function' ? cell.getRow().getData() : {};
        const isRatio = row.isPct || isPct;
        return isRatio ? percent(val) : usd(val, { decimals: 0 });
      },
    })),
  ];
}

/**
 * Renders the Projections tab inside the target container.
 *
 * @param {object} options
 * @param {HTMLElement|object} options.container
 * @param {object} options.threeStatement
 * @param {object} [options.historical]
 * @param {typeof DefaultTabulator} [options.TabulatorConstructor]
 * @returns {{ update: (threeStatement: object, historical?: object) => void, dispose: () => void, tabulatorInstances: object[], tabulatorConfigs: object[] }}
 */
export function renderProjections({
  container,
  threeStatement,
  historical = null,
  TabulatorConstructor = DefaultTabulator,
} = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderProjections requires a container element.', 'container');
  }

  let currentThreeStatement = threeStatement;
  let currentHistorical = historical;
  let disposed = false;
  const tabulatorInstances = [];
  const tabulatorConfigs = [];

  function buildIncomeData() {
    const hist = createHistoricalLookup(currentHistorical);
    const rows = [
      { id: 'rev_sub', label: 'Subscription Revenues', isLink: false },
      { id: 'rev_ads', label: 'Advertising Revenues', isLink: false },
      { id: 'rev_det', label: 'Duolingo English Test (DET) Revenues', isLink: false },
      { id: 'rev_iap', label: 'In-App Purchases (IAP) Revenues', isLink: false },
      { id: 'rev_other', label: 'Other Revenues', isLink: false },
      { id: 'rev_total', label: 'Total Revenues', isLink: true },
      { id: 'cor', label: 'Cost of Revenues (excl. D&A)', isLink: false },
      { id: 'gp', label: 'Gross Profit', isLink: true },
      { id: 'rd', label: 'Research and Development (R&D)', isLink: false },
      { id: 'sm', label: 'Sales and Marketing (S&M)', isLink: false },
      { id: 'ga', label: 'General and Administrative (G&A)', isLink: false },
      { id: 'opex_total', label: 'Total Operating Expenses', isLink: true },
      { id: 'ebit', label: 'Operating Income (EBIT)', isLink: true },
      { id: 'interest_inc', label: 'Interest Income (Invested Cash)', isLink: true },
      { id: 'other_inc', label: 'Other Income / (Expense), net', isLink: false },
      { id: 'ebt', label: 'Pretax Income', isLink: true },
      { id: 'tax', label: 'Provision for Income Taxes', isLink: false },
      { id: 'ni', label: 'Net Income', isLink: true },
    ];

    return rows.map((r) => {
      const rowObj = { ...r };
      for (const p of ALL_PERIODS) {
        let val = null;
        if (HISTORICAL_PERIODS.includes(p)) {
          if (r.id === 'rev_sub') val = hist['revenue_subscription']?.[p];
          else if (r.id === 'rev_ads') val = hist['revenue_advertising']?.[p];
          else if (r.id === 'rev_det') val = hist['revenue_duolingo_english_test']?.[p];
          else if (r.id === 'rev_iap') val = hist['revenue_in_app_purchases']?.[p];
          else if (r.id === 'rev_other') val = hist['revenue_other']?.[p];
          else if (r.id === 'rev_total') val = hist['revenue_total']?.[p];
          else if (r.id === 'cor') val = hist['cost_of_revenue']?.[p];
          else if (r.id === 'gp') val = hist['gross_profit']?.[p];
          else if (r.id === 'rd') val = hist['opex_research_and_development']?.[p];
          else if (r.id === 'sm') val = hist['opex_sales_and_marketing']?.[p];
          else if (r.id === 'ga') val = hist['opex_general_and_administrative']?.[p];
          else if (r.id === 'opex_total') val = hist['opex_total']?.[p];
          else if (r.id === 'ebit') val = hist['operating_income']?.[p];
          else if (r.id === 'interest_inc') val = hist['interest_income']?.[p];
          else if (r.id === 'other_inc') val = hist['other_income_net']?.[p];
          else if (r.id === 'ebt') val = hist['pretax_income']?.[p];
          else if (r.id === 'tax') val = hist['income_tax']?.[p];
          else if (r.id === 'ni') val = hist['net_income']?.[p];
        } else if (FORECAST_PERIODS.includes(p) && currentThreeStatement?.incomeStatement?.byPeriod?.[p]) {
          const isP = currentThreeStatement.incomeStatement.byPeriod[p];
          if (r.id === 'rev_sub') val = isP.revenue?.segments?.subscription?.value;
          else if (r.id === 'rev_ads') val = isP.revenue?.segments?.advertising?.value;
          else if (r.id === 'rev_det') val = isP.revenue?.segments?.duolingo_english_test?.value;
          else if (r.id === 'rev_iap') val = isP.revenue?.segments?.in_app_purchases?.value;
          else if (r.id === 'rev_other') val = isP.revenue?.segments?.other?.value;
          else if (r.id === 'rev_total') val = isP.revenue?.total?.value;
          else if (r.id === 'cor') val = isP.costs?.cost_of_revenue?.value;
          else if (r.id === 'gp') val = isP.gross_profit?.value;
          else if (r.id === 'rd') val = isP.costs?.research_and_development?.value;
          else if (r.id === 'sm') val = isP.costs?.sales_and_marketing?.value;
          else if (r.id === 'ga') val = isP.costs?.general_and_administrative?.value;
          else if (r.id === 'opex_total') val = isP.costs?.opex_total?.value;
          else if (r.id === 'ebit') val = isP.operating_income?.value;
          else if (r.id === 'interest_inc') val = isP.interest_income?.value;
          else if (r.id === 'other_inc') val = isP.other_income_net?.value;
          else if (r.id === 'ebt') val = isP.pretax_income?.value;
          else if (r.id === 'tax') val = isP.income_tax?.value;
          else if (r.id === 'ni') val = isP.net_income?.value;
        }
        rowObj[p] = Number.isFinite(val) ? val : null;
      }
      return rowObj;
    });
  }

  function buildBalanceData() {
    const hist = createHistoricalLookup(currentHistorical);
    const rows = [
      { id: 'cash', label: 'Cash and Cash Equivalents (Swept)', isLink: true },
      { id: 'sti', label: 'Short-Term Investments (Held constant)', isLink: false },
      { id: 'ar', label: 'Accounts Receivable', isLink: false },
      { id: 'def_cost', label: 'Deferred Cost of Revenues', isLink: false },
      { id: 'prepaids', label: 'Prepaid Expenses & Other Current Assets', isLink: false },
      { id: 'tax_rec', label: 'Income Tax Receivable', isLink: false },
      { id: 'total_cur_assets', label: 'Total Current Assets', isLink: true },
      { id: 'ppe_net', label: 'Net Property, Plant and Equipment (PP&E)', isLink: true },
      { id: 'intangibles_net', label: 'Net Intangible Assets', isLink: true },
      { id: 'lti', label: 'Long-Term Investments (Held constant)', isLink: false },
      { id: 'rou_assets', label: 'Operating Lease Right-of-Use Assets', isLink: false },
      { id: 'goodwill', label: 'Goodwill', isLink: false },
      { id: 'other_assets', label: 'Other Non-Current Assets', isLink: false },
      { id: 'total_assets', label: 'Total Assets', isLink: true },
      { id: 'ap', label: 'Accounts Payable', isLink: false },
      { id: 'accrued', label: 'Accrued Expenses & Other Current Liabilities', isLink: false },
      { id: 'def_rev', label: 'Deferred Revenues (Current)', isLink: false },
      { id: 'tax_pay', label: 'Income Tax Payable', isLink: false },
      { id: 'total_cur_liab', label: 'Total Current Liabilities', isLink: true },
      { id: 'lease_liab', label: 'Long-Term Operating Lease Liabilities', isLink: false },
      { id: 'total_liab', label: 'Total Liabilities', isLink: true },
      { id: 'common_stock', label: 'Common Stock', isLink: false },
      { id: 'apic', label: 'Additional Paid-in Capital (APIC)', isLink: false },
      { id: 'retained', label: 'Retained Earnings / (Accumulated Deficit)', isLink: false },
      { id: 'total_equity', label: 'Total Stockholders’ Equity', isLink: true },
      { id: 'total_liab_equity', label: 'Total Liabilities & Stockholders’ Equity', isLink: true },
    ];

    return rows.map((r) => {
      const rowObj = { ...r };
      for (const p of ALL_PERIODS) {
        let val = null;
        if (HISTORICAL_PERIODS.includes(p)) {
          if (r.id === 'cash') val = hist['cash_and_cash_equivalents']?.[p];
          else if (r.id === 'sti') val = hist['short_term_investments']?.[p];
          else if (r.id === 'ar') val = hist['accounts_receivable']?.[p];
          else if (r.id === 'def_cost') val = hist['deferred_cost_of_revenues']?.[p];
          else if (r.id === 'prepaids') val = hist['prepaid_expenses_and_other_current_assets']?.[p];
          else if (r.id === 'tax_rec') val = hist['income_tax_receivable']?.[p];
          else if (r.id === 'total_cur_assets') val = hist['total_current_assets']?.[p];
          else if (r.id === 'ppe_net') val = hist['property_and_equipment_net']?.[p];
          else if (r.id === 'intangibles_net') val = hist['intangible_assets_net']?.[p] ?? hist['capitalized_software_net']?.[p];
          else if (r.id === 'lti') val = hist['long_term_investments']?.[p];
          else if (r.id === 'rou_assets') val = hist['operating_lease_right_of_use_assets']?.[p];
          else if (r.id === 'goodwill') val = hist['goodwill']?.[p];
          else if (r.id === 'other_assets') val = hist['other_assets']?.[p];
          else if (r.id === 'total_assets') val = hist['total_assets']?.[p];
          else if (r.id === 'ap') val = hist['accounts_payable']?.[p];
          else if (r.id === 'accrued') val = hist['accrued_expenses_and_other_current_liabilities']?.[p];
          else if (r.id === 'def_rev') val = hist['deferred_revenues']?.[p];
          else if (r.id === 'tax_pay') val = hist['income_tax_payable']?.[p];
          else if (r.id === 'total_cur_liab') val = hist['total_current_liabilities']?.[p];
          else if (r.id === 'lease_liab') val = hist['long_term_operating_lease_liability']?.[p];
          else if (r.id === 'total_liab') val = hist['total_liabilities']?.[p];
          else if (r.id === 'common_stock') val = hist['common_stock']?.[p];
          else if (r.id === 'apic') val = hist['additional_paid_in_capital']?.[p];
          else if (r.id === 'retained') val = hist['retained_earnings_accumulated_deficit']?.[p];
          else if (r.id === 'total_equity') val = hist['total_stockholders_equity']?.[p];
          else if (r.id === 'total_liab_equity') val = hist['total_liabilities_and_stockholders_equity']?.[p];
        } else if (FORECAST_PERIODS.includes(p) && currentThreeStatement?.balanceSheet?.byPeriod?.[p]) {
          const bsP = currentThreeStatement.balanceSheet.byPeriod[p];
          if (r.id === 'cash') val = bsP.current_assets?.cash_and_cash_equivalents?.value;
          else if (r.id === 'sti') val = bsP.current_assets?.short_term_investments?.value;
          else if (r.id === 'ar') val = bsP.current_assets?.accounts_receivable?.value;
          else if (r.id === 'def_cost') val = bsP.current_assets?.deferred_cost_of_revenues?.value;
          else if (r.id === 'prepaids') val = bsP.current_assets?.prepaid_expenses_and_other_current_assets?.value;
          else if (r.id === 'tax_rec') val = bsP.current_assets?.income_tax_receivable?.value;
          else if (r.id === 'total_cur_assets') val = bsP.current_assets?.total?.value;
          else if (r.id === 'ppe_net') val = bsP.non_current_assets?.property_and_equipment_net?.value;
          else if (r.id === 'intangibles_net') val = bsP.non_current_assets?.intangible_assets_net?.value;
          else if (r.id === 'lti') val = bsP.non_current_assets?.long_term_investments?.value;
          else if (r.id === 'rou_assets') val = bsP.non_current_assets?.operating_lease_right_of_use_assets?.value;
          else if (r.id === 'goodwill') val = bsP.non_current_assets?.goodwill?.value;
          else if (r.id === 'other_assets') val = bsP.non_current_assets?.other_assets?.value;
          else if (r.id === 'total_assets') val = bsP.total_assets?.value;
          else if (r.id === 'ap') val = bsP.current_liabilities?.accounts_payable?.value;
          else if (r.id === 'accrued') val = bsP.current_liabilities?.accrued_expenses_and_other_current_liabilities?.value;
          else if (r.id === 'def_rev') val = bsP.current_liabilities?.deferred_revenues?.value;
          else if (r.id === 'tax_pay') val = bsP.current_liabilities?.income_tax_payable?.value;
          else if (r.id === 'total_cur_liab') val = bsP.current_liabilities?.total?.value;
          else if (r.id === 'lease_liab') val = bsP.non_current_liabilities?.long_term_operating_lease_liability?.value;
          else if (r.id === 'total_liab') val = bsP.total_liabilities?.value;
          else if (r.id === 'common_stock') val = bsP.stockholders_equity?.common_stock?.value;
          else if (r.id === 'apic') val = bsP.stockholders_equity?.additional_paid_in_capital?.value;
          else if (r.id === 'retained') val = bsP.stockholders_equity?.retained_earnings_accumulated_deficit?.value;
          else if (r.id === 'total_equity') val = bsP.stockholders_equity?.total?.value;
          else if (r.id === 'total_liab_equity') val = bsP.total_liabilities_and_stockholders_equity?.value;
        }
        rowObj[p] = Number.isFinite(val) ? val : null;
      }
      return rowObj;
    });
  }

  function buildCashFlowData() {
    const hist = createHistoricalLookup(currentHistorical);
    const rows = [
      { id: 'ni', label: 'Net Income', isLink: true },
      { id: 'da', label: '(+) Depreciation & Amortization Expense', isLink: true },
      { id: 'sbc', label: '(+) Stock-Based Compensation Expense', isLink: true },
      { id: 'delta_nwc', label: '(−) Change in Net Working Capital (ΔNWC)', isLink: true },
      { id: 'ocf', label: 'Net Cash from Operating Activities (OCF)', isLink: true },
      { id: 'capex_ppe', label: '(−) Capital Expenditures (PP&E)', isLink: false },
      { id: 'capex_soft', label: '(−) Capitalized Software & Intangibles', isLink: false },
      { id: 'icf', label: 'Net Cash from Investing Activities (ICF)', isLink: true },
      { id: 'fcf', label: 'Free Cash Flow (FCF = OCF − Capex)', isLink: true },
      { id: 'options', label: 'Proceeds from Stock Option Exercises', isLink: false },
      { id: 'taxes_settlement', label: 'Taxes Paid for Net Share Settlement', isLink: false },
      { id: 'buybacks', label: 'Share Repurchases', isLink: false },
      { id: 'cff', label: 'Net Cash from Financing Activities', isLink: true },
      { id: 'net_cash_change', label: 'Net Increase in Cash & Equivalents', isLink: true },
      { id: 'beginning_cash', label: 'Beginning Cash & Cash Equivalents', isLink: false },
      { id: 'ending_cash', label: 'Ending Cash & Cash Equivalents (Swept)', isLink: true },
    ];

    return rows.map((r) => {
      const rowObj = { ...r };
      for (const p of ALL_PERIODS) {
        let val = null;
        if (HISTORICAL_PERIODS.includes(p)) {
          if (r.id === 'ni') val = hist['cf_net_income']?.[p] ?? hist['net_income']?.[p];
          else if (r.id === 'da') val = hist['cf_depreciation_and_amortization']?.[p];
          else if (r.id === 'sbc') val = hist['cf_stock_based_compensation']?.[p];
          else if (r.id === 'delta_nwc') {
            const arC = hist['cf_change_accounts_receivable']?.[p] || 0;
            const defCostC = hist['cf_change_deferred_cost_of_revenues']?.[p] || 0;
            const prepaidC = hist['cf_change_prepaid_expenses_and_other_assets']?.[p] || 0;
            const apC = hist['cf_change_accounts_payable']?.[p] || 0;
            const accC = hist['cf_change_accrued_expenses']?.[p] || 0;
            const defRevC = hist['cf_change_deferred_revenue']?.[p] || 0;
            val = arC + defCostC + prepaidC + apC + accC + defRevC;
          } else if (r.id === 'ocf') val = hist['cash_from_operating_activities']?.[p];
          else if (r.id === 'capex_ppe') val = hist['purchase_of_property_and_equipment']?.[p];
          else if (r.id === 'capex_soft') val = hist['capitalized_software_and_intangibles']?.[p];
          else if (r.id === 'icf') val = hist['cash_from_investing_activities']?.[p];
          else if (r.id === 'fcf') {
            const ocfVal = hist['cash_from_operating_activities']?.[p];
            const ppeC = hist['purchase_of_property_and_equipment']?.[p] || 0;
            const softC = hist['capitalized_software_and_intangibles']?.[p] || 0;
            if (Number.isFinite(ocfVal)) {
              val = ocfVal + ppeC + softC;
            }
          } else if (r.id === 'options') val = hist['proceeds_from_stock_options_exercise']?.[p];
          else if (r.id === 'taxes_settlement') val = hist['taxes_paid_net_share_settlement']?.[p];
          else if (r.id === 'buybacks') val = hist['repurchase_of_common_stock']?.[p];
          else if (r.id === 'cff') val = hist['cash_from_financing_activities']?.[p];
          else if (r.id === 'net_cash_change') val = hist['net_change_in_cash']?.[p];
          else if (r.id === 'beginning_cash') val = hist['cash_beginning_of_period']?.[p];
          else if (r.id === 'ending_cash') val = hist['cash_end_of_period']?.[p];
        } else if (FORECAST_PERIODS.includes(p) && currentThreeStatement?.cashFlow?.byPeriod?.[p]) {
          const cfP = currentThreeStatement.cashFlow.byPeriod[p];
          if (r.id === 'ni') val = cfP.operating_activities?.net_income?.value;
          else if (r.id === 'da') val = cfP.operating_activities?.depreciation_and_amortization?.value;
          else if (r.id === 'sbc') val = cfP.operating_activities?.stock_based_compensation?.value;
          else if (r.id === 'delta_nwc') val = cfP.operating_activities?.change_in_working_capital?.value;
          else if (r.id === 'ocf') val = cfP.operating_activities?.total?.value;
          else if (r.id === 'capex_ppe') val = cfP.investing_activities?.purchase_of_property_and_equipment?.value;
          else if (r.id === 'capex_soft') val = cfP.investing_activities?.capitalized_software_and_intangibles?.value;
          else if (r.id === 'icf') val = cfP.investing_activities?.total?.value;
          else if (r.id === 'fcf') val = cfP.free_cash_flow?.value;
          else if (r.id === 'options') val = cfP.financing_activities?.proceeds_from_stock_options_exercise?.value;
          else if (r.id === 'taxes_settlement') val = cfP.financing_activities?.taxes_paid_net_share_settlement?.value;
          else if (r.id === 'buybacks') val = cfP.financing_activities?.repurchase_of_common_stock?.value;
          else if (r.id === 'cff') val = cfP.financing_activities?.total?.value;
          else if (r.id === 'net_cash_change') val = cfP.net_change_in_cash?.value;
          else if (r.id === 'beginning_cash') val = cfP.beginning_cash?.value;
          else if (r.id === 'ending_cash') val = cfP.ending_cash?.value;
        }
        rowObj[p] = Number.isFinite(val) ? val : null;
      }
      return rowObj;
    });
  }

  function renderCard(title, statementKey) {
    return `
      <div class="projection-statement-card">
        <div class="statement-card-header">
          ${title}
        </div>
        <div class="tabulator-grid-container financial-table" data-statement="${statementKey}"></div>
      </div>
    `;
  }

  function renderHybrid2026Card() {
    const is2026 = currentThreeStatement?.incomeStatement?.byPeriod?.FY2026;
    const revH1 = is2026?.revenue?.total?.h1?.value;
    const revH2 = is2026?.revenue?.total?.h2?.value;
    const revTot = is2026?.revenue?.total?.value;

    const ebitH1 = is2026?.operating_income?.h1?.value;
    const ebitH2 = is2026?.operating_income?.h2?.value;
    const ebitTot = is2026?.operating_income?.value;

    const cf2026 = currentThreeStatement?.cashFlow?.byPeriod?.FY2026;
    const fcfH1 = cf2026?.free_cash_flow?.h1?.value;
    const fcfH2 = cf2026?.free_cash_flow?.h2?.value;
    const fcfTot = cf2026?.free_cash_flow?.value;

    return `
      <div class="hybrid-disclosure-card">
        <div class="statement-card-header">
          Hybrid FY2026 Provenance &amp; Half-Year Decomposition
        </div>
        <div class="hybrid-card-content">
          <p class="hybrid-intro">
            FY2026 is modeled with strict hybrid provenance: <strong>H1 Actuals</strong> are transcribed directly from reported Q1 &amp; Q2 FY2026 SEC filings, while <strong>H2 Estimates</strong> reflect driver-based forecast models (ensuring <code>H1 + H2 === FY2026</code>).
          </p>
          <div class="hybrid-metrics-grid">
            <div class="hybrid-metric-box">
              <div class="hybrid-box-title">Total Revenue ($ in thousands)</div>
              <div class="hybrid-box-row"><span>H1 Actual (Cited):</span> <strong>${usd(revH1, { decimals: 0 })}</strong></div>
              <div class="hybrid-box-row"><span>H2 Driver Estimate:</span> <strong>${usd(revH2, { decimals: 2 })}</strong></div>
              <div class="hybrid-box-row hybrid-total"><span>Full Year FY2026:</span> <strong>${usd(revTot, { decimals: 2 })}</strong></div>
            </div>
            <div class="hybrid-metric-box">
              <div class="hybrid-box-title">Operating Income ($ in thousands)</div>
              <div class="hybrid-box-row"><span>H1 Actual (Cited):</span> <strong>${usd(ebitH1, { decimals: 0 })}</strong></div>
              <div class="hybrid-box-row"><span>H2 Driver Estimate:</span> <strong>${usd(ebitH2, { decimals: 2 })}</strong></div>
              <div class="hybrid-box-row hybrid-total"><span>Full Year FY2026:</span> <strong>${usd(ebitTot, { decimals: 2 })}</strong></div>
            </div>
            <div class="hybrid-metric-box">
              <div class="hybrid-box-title">Free Cash Flow ($ in thousands)</div>
              <div class="hybrid-box-row"><span>H1 Actual (Cited):</span> <strong>${usd(fcfH1, { decimals: 0 })}</strong></div>
              <div class="hybrid-box-row"><span>H2 Driver Estimate:</span> <strong>${usd(fcfH2, { decimals: 2 })}</strong></div>
              <div class="hybrid-box-row hybrid-total"><span>Full Year FY2026:</span> <strong>${usd(fcfTot, { decimals: 2 })}</strong></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    // Destroy existing instances
    for (const inst of tabulatorInstances) {
      if (inst && typeof inst.destroy === 'function') {
        try { inst.destroy(); } catch { /* ignore */ }
      }
    }
    tabulatorInstances.length = 0;
    tabulatorConfigs.length = 0;

    const isData = buildIncomeData();
    const isCols = buildProjectionColumns();
    const isConfig = {
      statement: 'incomeStatement',
      data: isData,
      columns: isCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(isConfig);

    const bsData = buildBalanceData();
    const bsCols = buildProjectionColumns();
    const bsConfig = {
      statement: 'balanceSheet',
      data: bsData,
      columns: bsCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(bsConfig);

    const cfData = buildCashFlowData();
    const cfCols = buildProjectionColumns();
    const cfConfig = {
      statement: 'cashFlow',
      data: cfData,
      columns: cfCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(cfConfig);

    const isHtml = renderCard('Projected Income Statement ($ in thousands)', 'incomeStatement');
    const bsHtml = renderCard('Projected Balance Sheet &amp; Cash Sweep ($ in thousands)', 'balanceSheet');
    const cfHtml = renderCard('Projected Cash Flow Statement &amp; FCF ($ in thousands)', 'cashFlow');
    const hybridHtml = renderHybrid2026Card();

    const revFcfChart = createRevenueFcfChart({
      historical: currentHistorical,
      threeStatement: currentThreeStatement,
    });
    const marginChart = createMarginChart({
      historical: currentHistorical,
      threeStatement: currentThreeStatement,
    });

    const chartsHtml = `
      <div class="projections-charts-grid">
        <div class="summary-card projection-chart-card">
          <div class="statement-card-header">
            Revenue &amp; Unlevered Free Cash Flow Progression (FY2021–FY2030)
          </div>
          <div class="summary-card-body chart-card-body">
            ${revFcfChart.svg}
          </div>
        </div>
        <div class="summary-card projection-chart-card">
          <div class="statement-card-header">
            Operating Profitability &amp; Margin Expansion (% of Revenue)
          </div>
          <div class="summary-card-body chart-card-body">
            ${marginChart.svg}
          </div>
        </div>
      </div>
    `;

    container.innerHTML = `
      <div class="projections-view-wrapper">
        ${hybridHtml}
        ${chartsHtml}
        ${isHtml}
        ${bsHtml}
        ${cfHtml}
      </div>
    `;

    // Instantiate Tabulator instances
    if (typeof TabulatorConstructor === 'function') {
      for (const config of tabulatorConfigs) {
        try {
          const gridEl = container.querySelector ? container.querySelector(`[data-statement="${config.statement}"]`) : null;
          if (gridEl) {
            const inst = new TabulatorConstructor(gridEl, config);
            tabulatorInstances.push(inst);
          }
        } catch {
          // Gracefully handle in stub environments
        }
      }
    }
  }

  render();

  return {
    update(newThreeStatement, newHistorical = null) {
      currentThreeStatement = newThreeStatement;
      currentHistorical = newHistorical || currentHistorical;
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const inst of tabulatorInstances) {
        if (inst && typeof inst.destroy === 'function') {
          try { inst.destroy(); } catch { /* ignore */ }
        }
      }
      tabulatorInstances.length = 0;
      tabulatorConfigs.length = 0;
      currentThreeStatement = null;
      currentHistorical = null;
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
    tabulatorInstances,
    tabulatorConfigs,
  };
}

export default renderProjections;
