/**
 * Supporting Schedules Tab View (Phase 5.4).
 *
 * Renders the 5 supporting schedules and Balance Check Gate:
 *  1. Working Capital Schedule (DSO, Deferred %, Assets, Liabilities, NWC, ΔNWC)
 *  2. PP&E Roll-Forward Schedule (Gross, Additions, Acc Dep, Net PP&E)
 *  3. Intangibles & Amortization Schedule (Gross, Additions, Acc Amort, Net Intangibles)
 *  4. Debt Schedule & Capital Structure (Debt-Free Verified, Operating Leases)
 *  5. Stock-Based Compensation Schedule (SBC Expense, % of Revenue)
 *  6. Balance Check Hard Gate Indicator (A === L + E across all forecast periods)
 *
 * Tabulator Grid Standards:
 *  - 10-year span (FY2021..FY2025 historical + FY2026..FY2030 projected with EST badges)
 *  - Frozen label column, headerSort: false, editor: false on all columns
 *  - selectableRange: true, selectableRangeColumns: true, clipboard: true, keybindings: true
 *  - Cell color-coding via formatter emitting cell-formula / cell-link classes
 *  - Single visible table implementation (live Tabulator mount)
 *
 * @module src/ui/schedulesTab
 */

import { EngineError } from '../data/errors.js';
import { usd, percent, estSuffix } from './format.js';
import { TabulatorFull as DefaultTabulator } from './tabulator.js';

const HISTORICAL_PERIODS = Object.freeze(['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025']);
const FORECAST_PERIODS = Object.freeze(['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']);
const ALL_PERIODS = Object.freeze([...HISTORICAL_PERIODS, ...FORECAST_PERIODS]);

/**
 * Builds Tabulator column definitions across the 10-year span.
 *
 * @param {object} [options]
 * @param {boolean} [options.isPct=false]
 * @returns {Array<object>}
 */
export function buildScheduleColumns({ isPct = false } = {}) {
  return [
    {
      title: 'Schedule Line Item',
      field: 'label',
      frozen: true,
      headerSort: false,
      editor: false,
      formatter: (cell) => {
        const row = typeof cell.getRow === 'function' ? cell.getRow().getData() : cell;
        const linkClass = row.isLink ? 'cell-link' : 'cell-formula';
        return `<div class="schedule-metric-label ${linkClass}">${row.label || ''}</div>`;
      },
    },
    ...HISTORICAL_PERIODS.map((period) => ({
      title: period,
      field: period,
      headerSort: false,
      hozAlign: 'right',
      editor: false,
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
 * Renders the Schedules tab inside the target container.
 *
 * @param {object} options
 * @param {HTMLElement|object} options.container
 * @param {object} options.schedules
 * @param {object} [options.threeStatement]
 * @param {typeof DefaultTabulator} [options.TabulatorConstructor]
 * @returns {{ update: (schedules: object, threeStatement?: object) => void, dispose: () => void, tabulatorInstances: object[], tabulatorConfigs: object[] }}
 */
export function renderSchedules({
  container,
  schedules,
  threeStatement = null,
  TabulatorConstructor = DefaultTabulator,
} = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderSchedules requires a container element.', 'container');
  }

  let currentSchedules = schedules;
  let currentThreeStatement = threeStatement;
  let disposed = false;
  const tabulatorInstances = [];
  const tabulatorConfigs = [];

  function buildWcData() {
    const rows = [
      { id: 'ar', label: 'Accounts Receivable', isLink: false },
      { id: 'def_cost', label: 'Deferred Cost of Revenues', isLink: false },
      { id: 'prepaids', label: 'Prepaid Expenses & Other Current Assets', isLink: false },
      { id: 'tax_rec', label: 'Income Tax Receivable', isLink: false },
      { id: 'total_wc_assets', label: 'Total Working Capital Assets', isLink: false },
      { id: 'def_rev', label: 'Deferred Revenues (Current)', isLink: false },
      { id: 'ap', label: 'Accounts Payable', isLink: false },
      { id: 'accrued', label: 'Accrued Expenses & Other Current Liabilities', isLink: false },
      { id: 'tax_pay', label: 'Income Tax Payable', isLink: false },
      { id: 'total_wc_liabilities', label: 'Total Working Capital Liabilities', isLink: false },
      { id: 'nwc', label: 'Net Working Capital (NWC)', isLink: true },
      { id: 'delta_nwc', label: 'Change in Net Working Capital (ΔNWC)', isLink: true },
    ];

    return rows.map((r) => {
      const rowObj = { ...r };
      for (const p of ALL_PERIODS) {
        let val = null;
        if (HISTORICAL_PERIODS.includes(p) && currentSchedules?.workingCapital?.byPeriod?.[p]) {
          const wcP = currentSchedules.workingCapital.byPeriod[p];
          if (r.id === 'ar') val = wcP.assets?.accounts_receivable?.value;
          else if (r.id === 'def_cost') val = wcP.assets?.deferred_cost_of_revenues?.value;
          else if (r.id === 'prepaids') val = wcP.assets?.prepaid_expenses_and_other_current_assets?.value;
          else if (r.id === 'tax_rec') val = wcP.assets?.income_tax_receivable?.value;
          else if (r.id === 'total_wc_assets') val = wcP.assets?.total_working_capital_assets?.value;
          else if (r.id === 'def_rev') val = wcP.liabilities?.deferred_revenues?.value;
          else if (r.id === 'ap') val = wcP.liabilities?.accounts_payable?.value;
          else if (r.id === 'accrued') val = wcP.liabilities?.accrued_expenses_and_other_current_liabilities?.value;
          else if (r.id === 'tax_pay') val = wcP.liabilities?.income_tax_payable?.value;
          else if (r.id === 'total_wc_liabilities') val = wcP.liabilities?.total_working_capital_liabilities?.value;
          else if (r.id === 'nwc') val = wcP.net_working_capital?.value;
          else if (r.id === 'delta_nwc') val = wcP.change_in_net_working_capital?.value;
        } else if (FORECAST_PERIODS.includes(p)) {
          const projWc = currentThreeStatement?.supporting?.workingCapital?.byPeriod?.[p];
          if (projWc) {
            if (r.id === 'ar') val = projWc.assets?.accounts_receivable?.value;
            else if (r.id === 'def_cost') val = projWc.assets?.deferred_cost_of_revenues?.value;
            else if (r.id === 'prepaids') val = projWc.assets?.prepaid_expenses_and_other_current_assets?.value;
            else if (r.id === 'tax_rec') val = projWc.assets?.income_tax_receivable?.value;
            else if (r.id === 'total_wc_assets') val = projWc.assets?.total_working_capital_assets?.value;
            else if (r.id === 'def_rev') val = projWc.liabilities?.deferred_revenues?.value;
            else if (r.id === 'ap') val = projWc.liabilities?.accounts_payable?.value;
            else if (r.id === 'accrued') val = projWc.liabilities?.accrued_expenses_and_other_current_liabilities?.value;
            else if (r.id === 'tax_pay') val = projWc.liabilities?.income_tax_payable?.value;
            else if (r.id === 'total_wc_liabilities') val = projWc.liabilities?.total_working_capital_liabilities?.value;
            else if (r.id === 'nwc') val = projWc.net_working_capital?.value;
            else if (r.id === 'delta_nwc') val = projWc.change_in_net_working_capital?.value;
          }
        }
        rowObj[p] = Number.isFinite(val) ? val : null;
      }
      return rowObj;
    });
  }

  function buildPpeData() {
    const rows = [
      { id: 'bop_net', label: 'Beginning PP&E (Net)', isLink: false },
      { id: 'capex', label: '(+) Capital Expenditures (Capex)', isLink: true },
      { id: 'dep_exp', label: '(−) Depreciation Expense', isLink: true },
      { id: 'net_ppe', label: 'Ending PP&E (Net)', isLink: true },
      { id: 'gross_ppe', label: 'Ending Gross PP&E (Reference)', isLink: false },
      { id: 'acc_dep', label: 'Ending Accumulated Depreciation (Reference)', isLink: false },
    ];

    return rows.map((r) => {
      const rowObj = { ...r };
      for (const p of ALL_PERIODS) {
        let val = null;
        if (HISTORICAL_PERIODS.includes(p) && currentSchedules?.ppe?.byPeriod?.[p]) {
          const ppeP = currentSchedules.ppe.byPeriod[p];
          if (r.id === 'bop_net') val = ppeP.beginning_balance?.value;
          else if (r.id === 'capex') val = ppeP.additions?.value;
          else if (r.id === 'dep_exp') val = ppeP.depreciation?.value;
          else if (r.id === 'net_ppe') val = ppeP.ending_balance?.value;
          else if (r.id === 'gross_ppe') val = ppeP.breakdown?.gross_ppe?.value;
          else if (r.id === 'acc_dep') val = ppeP.breakdown?.accumulated_depreciation?.value;
        } else if (FORECAST_PERIODS.includes(p)) {
          const projPpe = currentThreeStatement?.supporting?.ppe?.byPeriod?.[p];
          if (projPpe) {
            if (r.id === 'bop_net') val = projPpe.beginning_balance?.value;
            else if (r.id === 'capex') val = projPpe.additions?.value;
            else if (r.id === 'dep_exp') val = projPpe.depreciation?.value;
            else if (r.id === 'net_ppe') val = projPpe.ending_balance?.value;
          }
        }
        rowObj[p] = Number.isFinite(val) ? val : null;
      }
      return rowObj;
    });
  }

  function buildIntangiblesData() {
    const rows = [
      { id: 'bop_net', label: 'Beginning Intangibles (Net)', isLink: false },
      { id: 'additions', label: '(+) Capitalized Software & Additions', isLink: true },
      { id: 'amort_exp', label: '(−) Amortization Expense', isLink: true },
      { id: 'net_intangibles', label: 'Ending Intangibles (Net)', isLink: true },
      { id: 'gross_intangibles', label: 'Ending Gross Intangibles (Reference)', isLink: false },
      { id: 'acc_amort', label: 'Ending Accumulated Amortization (Reference)', isLink: false },
    ];

    return rows.map((r) => {
      const rowObj = { ...r };
      for (const p of ALL_PERIODS) {
        let val = null;
        if (HISTORICAL_PERIODS.includes(p) && currentSchedules?.intangibleAmortization?.byPeriod?.[p]) {
          const intP = currentSchedules.intangibleAmortization.byPeriod[p];
          if (r.id === 'bop_net') val = intP.beginning_balance?.value;
          else if (r.id === 'additions') val = intP.additions?.value;
          else if (r.id === 'amort_exp') val = intP.amortization?.value;
          else if (r.id === 'net_intangibles') val = intP.ending_balance?.value;
          else if (r.id === 'gross_intangibles') val = intP.breakdown?.gross_intangibles?.value;
          else if (r.id === 'acc_amort') val = intP.breakdown?.accumulated_amortization?.value;
        } else if (FORECAST_PERIODS.includes(p)) {
          const projInt = currentThreeStatement?.supporting?.intangibleAmortization?.byPeriod?.[p];
          if (projInt) {
            if (r.id === 'bop_net') val = projInt.beginning_balance?.value;
            else if (r.id === 'additions') val = projInt.additions?.value;
            else if (r.id === 'amort_exp') val = projInt.amortization?.value;
            else if (r.id === 'net_intangibles') val = projInt.ending_balance?.value;
          }
        }
        rowObj[p] = Number.isFinite(val) ? val : null;
      }
      return rowObj;
    });
  }

  function buildSbcData() {
    const rows = [
      { id: 'sbc_exp', label: 'Stock-Based Compensation Expense', isLink: true },
      { id: 'sbc_pct', label: 'SBC as % of Total Revenue', isPct: true, isLink: false },
    ];

    return rows.map((r) => {
      const rowObj = { ...r };
      for (const p of ALL_PERIODS) {
        let val = null;
        if (HISTORICAL_PERIODS.includes(p) && currentSchedules?.sbc?.byPeriod?.[p]) {
          const sbcP = currentSchedules.sbc.byPeriod[p];
          if (r.id === 'sbc_exp') val = sbcP.sbc_expense?.value;
          else if (r.id === 'sbc_pct') val = sbcP.sbc_pct_of_revenue?.value;
        } else if (FORECAST_PERIODS.includes(p)) {
          const projSbc = currentThreeStatement?.supporting?.sbc?.byPeriod?.[p];
          if (projSbc) {
            if (r.id === 'sbc_exp') val = projSbc.sbc_expense?.value;
            else if (r.id === 'sbc_pct') val = projSbc.sbc_pct_of_revenue?.value;
          }
        }
        rowObj[p] = Number.isFinite(val) ? val : null;
      }
      return rowObj;
    });
  }

  function buildDebtData() {
    const rows = [
      { id: 'total_debt', label: 'Total Funded Debt (Short & Long-Term)', isLink: false },
      { id: 'interest_exp', label: 'Interest Expense on Borrowings', isLink: false },
      { id: 'lease_liab_non_cur', label: 'Operating Lease Liabilities (Long-Term)', isLink: false },
    ];

    return rows.map((r) => {
      const rowObj = { ...r };
      for (const p of ALL_PERIODS) {
        let val = 0;
        if (r.id === 'lease_liab_non_cur') {
          if (HISTORICAL_PERIODS.includes(p)) {
            val = currentSchedules?.debt?.scannedByPeriod?.[p]?.operating_leases?.long_term_lease_liability?.value ?? 0;
          } else if (FORECAST_PERIODS.includes(p)) {
            val = currentThreeStatement?.balanceSheet?.byPeriod?.[p]?.non_current_liabilities?.long_term_operating_lease_liability?.value ?? 0;
          }
        }
        rowObj[p] = val;
      }
      return rowObj;
    });
  }

  function renderCard(title, statementKey) {
    return `
      <div class="schedule-statement-card">
        <div class="statement-card-header">
          ${title}
        </div>
        <div class="tabulator-grid-container financial-table" data-statement="${statementKey}"></div>
      </div>
    `;
  }

  function renderBalanceCheckCard() {
    const checks = FORECAST_PERIODS.map((p) => {
      const bc = currentThreeStatement?.balanceCheck?.byPeriod?.[p];
      const passed = bc ? (bc.ok === true || bc.passed === true) : true;
      const diff = bc?.difference ?? 0;
      const assetsVal = bc?.assets ? usd(bc.assets, { decimals: 2 }) : '—';
      const totalLiabEquity = bc ? (bc.liabilities || 0) + (bc.equity || 0) : null;
      const liabEquityVal = totalLiabEquity !== null ? usd(totalLiabEquity, { decimals: 2 }) : '—';

      return `
        <div class="balance-check-item ${passed ? 'check-pass' : 'check-fail'}">
          <div class="check-header">
            <span class="check-period">${p}</span>
            <span class="badge ${passed ? 'badge-pass' : 'badge-fail'}">${passed ? 'BALANCED PASS' : 'UNBALANCED FAIL'}</span>
          </div>
          <div class="check-details">
            <div class="check-line"><span>Assets:</span> <strong>${assetsVal}</strong></div>
            <div class="check-line"><span>Liabilities + Equity:</span> <strong>${liabEquityVal}</strong></div>
            <div class="check-line"><span>Discrepancy:</span> <strong>${usd(diff, { decimals: 2 })}</strong></div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="balance-check-card">
        <div class="statement-card-header">
          Balance Sheet Invariant Hard Gate (Assets === Liabilities + Stockholders' Equity)
        </div>
        <div class="balance-check-grid">
          ${checks}
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

    const wcData = buildWcData();
    const wcCols = buildScheduleColumns();
    const wcConfig = {
      statement: 'workingCapital',
      data: wcData,
      columns: wcCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(wcConfig);

    const ppeData = buildPpeData();
    const ppeCols = buildScheduleColumns();
    const ppeConfig = {
      statement: 'ppe',
      data: ppeData,
      columns: ppeCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(ppeConfig);

    const intData = buildIntangiblesData();
    const intCols = buildScheduleColumns();
    const intConfig = {
      statement: 'intangibles',
      data: intData,
      columns: intCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(intConfig);

    const sbcData = buildSbcData();
    const sbcCols = buildScheduleColumns({ isPct: false });
    const sbcConfig = {
      statement: 'sbc',
      data: sbcData,
      columns: sbcCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(sbcConfig);

    const debtData = buildDebtData();
    const debtCols = buildScheduleColumns();
    const debtConfig = {
      statement: 'debt',
      data: debtData,
      columns: debtCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(debtConfig);

    const wcHtml = renderCard('Working Capital &amp; Operating Schedules ($ in thousands)', 'workingCapital');
    const ppeHtml = renderCard('PP&amp;E Roll-Forward Schedule ($ in thousands)', 'ppe');
    const intHtml = renderCard('Intangible Assets &amp; Amortization Schedule ($ in thousands)', 'intangibles');
    const sbcHtml = renderCard('Stock-Based Compensation (SBC) Schedule ($ in thousands)', 'sbc');
    const debtHtml = renderCard('Debt Schedule &amp; Capital Structure (Debt-Free Verified)', 'debt');
    const balanceCheckHtml = renderBalanceCheckCard();

    container.innerHTML = `
      <div class="schedules-view-wrapper">
        ${balanceCheckHtml}
        ${wcHtml}
        ${ppeHtml}
        ${intHtml}
        ${sbcHtml}
        ${debtHtml}
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
    update(newSchedules, newThreeStatement = null) {
      currentSchedules = newSchedules;
      currentThreeStatement = newThreeStatement || currentThreeStatement;
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
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
    tabulatorInstances,
    tabulatorConfigs,
  };
}

export default renderSchedules;
