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
import { usd, percent, estSuffix, formatAccounting } from './format.js';
import { TabulatorFull as DefaultTabulator } from './tabulator.js';

export const HISTORICAL_PERIODS = Object.freeze(['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025']);
export const FORECAST_PERIODS = Object.freeze(['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']);
export const FADE_PERIODS = Object.freeze(['FY2031', 'FY2032', 'FY2033', 'FY2034', 'FY2035']);
export const ALL_PERIODS = Object.freeze([...HISTORICAL_PERIODS, ...FORECAST_PERIODS]);
export const ALL_SCHEDULE_PERIODS = Object.freeze([...HISTORICAL_PERIODS, ...FORECAST_PERIODS, ...FADE_PERIODS]);

/**
 * Builds Tabulator column definitions across the 10-year span.
 *
 * @param {object} [options]
 * @param {boolean} [options.isPct=false]
 * @param {'thousands'|'millions'} [options.unit='thousands']
 * @param {'explicit'|'fade'} [options.stage='explicit']
 * @returns {Array<object>}
 */
export function buildScheduleColumns({ isPct = false, unit = 'thousands', stage = 'explicit' } = {}) {
  const isMillions = unit === 'millions';
  const scale = isMillions ? 1e3 : 1;
  const decimals = Number(isMillions);
  const isFade = stage === 'fade';
  const targetPeriods = isFade ? FADE_PERIODS : FORECAST_PERIODS;
  const badgeMarking = isFade ? 'FADE' : 'EST';

  return [
    {
      title: 'Schedule Line Item',
      field: 'label',
      frozen: true,
      headerSort: false,
      editor: false,
      minWidth: 260,
      formatter: (cell) => {
        const row = typeof cell.getRow === 'function' ? cell.getRow().getData() : cell;
        const linkClass = row.isLink ? 'cell-link' : 'cell-formula';
        const tag = row.rowTag ? ` <span class="badge ${row.tagClass || 'badge-muted'}">${row.rowTag}</span>` : '';
        return `<div class="schedule-metric-label ${linkClass}">${row.label || ''}${tag}</div>`;
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
        if (val === null || val === undefined || !Number.isFinite(val)) return ' - ';
        const row = typeof cell.getRow === 'function' ? cell.getRow().getData() : {};
        const isRatio = row.isPct || isPct;
        if (isRatio) return percent(val);
        const displayVal = isMillions ? val / scale : val;
        const zeroDisplay = row.isFundedDebt ? '$0' : '—';
        return formatAccounting(displayVal, { decimals, showCurrency: true, zeroDisplay });
      },
    })),
    ...targetPeriods.map((period) => ({
      title: period,
      field: period,
      headerSort: false,
      hozAlign: 'right',
      editor: false,
      minWidth: 95,
      titleFormatter: () => estSuffix(period, badgeMarking),
      formatter: (cell) => {
        const val = typeof cell.getValue === 'function' ? cell.getValue() : cell;
        if (val === null || val === undefined || !Number.isFinite(val)) return ' - ';
        const row = typeof cell.getRow === 'function' ? cell.getRow().getData() : {};
        const isRatio = row.isPct || isPct;
        if (isRatio) return percent(val);
        const displayVal = isMillions ? val / scale : val;
        const zeroDisplay = row.isFundedDebt ? '$0' : '—';
        return formatAccounting(displayVal, { decimals, showCurrency: true, zeroDisplay });
      },
    })),
  ];
}

/**
 * Renders executive Balance Sheet Invariant Hard Gate cards (Task RP4.1).
 * Validates that Assets = Liabilities + Stockholders' Equity across FY2026-FY2030.
 *
 * @param {object} threeStatement Output of threeStatement.project()
 * @param {object} [options]
 * @param {'thousands'|'millions'} [options.unit='thousands']
 * @param {'explicit'|'fade'} [options.stage='explicit']
 * @returns {string} HTML string containing 5 .gate-card elements
 */
export function renderGateCards(threeStatement, { unit = 'thousands', stage = 'explicit' } = {}) {
  const isMillions = unit === 'millions';
  const scale = isMillions ? 1e3 : 1;
  const decimals = Number(isMillions);
  const targetPeriods = stage === 'fade' ? FADE_PERIODS : FORECAST_PERIODS;

  let brokenDependency = false;

  return targetPeriods.map((period) => {
    const bc = threeStatement?.balanceCheck?.byPeriod?.[period];
    const isMissing = !bc || typeof bc !== 'object';
    if (isMissing) {
      brokenDependency = true;
    }

    const hasData = !isMissing && !brokenDependency;
    const diff = hasData && typeof bc.difference === 'number' ? bc.difference : null;
    const isBalanced = hasData && (bc.ok === true || bc.passed === true) && diff !== null && Math.abs(diff) < 1e-4;

    const assets = hasData && typeof bc.assets === 'number' ? bc.assets / scale : null;
    const liabilities = hasData && typeof bc.liabilities === 'number' ? bc.liabilities / scale : null;
    const equity = hasData && typeof bc.equity === 'number' ? bc.equity / scale : null;
    const scaledDiff = diff !== null ? diff / scale : null;

    const formattedAssets = assets !== null ? usd(assets, { decimals }) : ' — ';
    const formattedLiabilities = liabilities !== null ? usd(liabilities, { decimals }) : ' — ';
    const formattedEquity = equity !== null ? usd(equity, { decimals }) : ' — ';
    const formattedDiscrepancy = scaledDiff !== null
      ? (Math.abs(scaledDiff) < 1e-4 ? '$0' : usd(scaledDiff, { decimals }))
      : ' — ';

    const badgeClass = isBalanced ? 'badge-pass' : 'badge-fail';
    const cardClass = isBalanced ? 'gate-card check-pass' : 'gate-card gate-card-fail check-fail';
    const badgeText = isBalanced
      ? '✓ BALANCED (Δ$0)'
      : (!hasData ? '✗ NO DATA' : `✗ UNBALANCED (Δ${usd(scaledDiff, { decimals })})`);
    const ariaLabel = isBalanced
      ? 'BALANCED PASS'
      : (!hasData ? 'NO DATA FAIL' : 'UNBALANCED FAIL');

    return `
      <div class="${cardClass}" data-period="${period}">
        <div class="gate-card-header">
          <span class="gate-card-period">${period}</span>
          <span class="badge ${badgeClass}" data-status="${isBalanced ? 'pass' : 'fail'}" aria-label="${ariaLabel}">
            ${badgeText}
            <span class="sr-only">${ariaLabel}</span>
          </span>
        </div>
        <div class="gate-card-body">
          <div class="gate-ledger-row" data-row="assets">
            <span class="gate-ledger-label"><span class="sr-only">Total </span>Assets</span>
            <span class="gate-ledger-val">${formattedAssets}</span>
          </div>
          <div class="gate-ledger-row" data-row="liabilities">
            <span class="gate-ledger-label"><span class="sr-only">Total </span>Liabilities</span>
            <span class="gate-ledger-val">${formattedLiabilities}</span>
          </div>
          <div class="gate-ledger-row" data-row="equity">
            <span class="gate-ledger-label"><span class="sr-only">Stockholders' </span>Equity</span>
            <span class="gate-ledger-val">${formattedEquity}</span>
          </div>
          <div class="gate-ledger-row gate-discrepancy-row" data-row="discrepancy">
            <span class="gate-ledger-label">Discrepancy</span>
            <span class="gate-ledger-val">${formattedDiscrepancy}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
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
  unit = 'thousands',
  onUnitChange,
} = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderSchedules requires a container element.', 'container');
  }

  let currentSchedules = schedules;
  let currentThreeStatement = threeStatement;
  let currentUnit = unit === 'millions' ? 'millions' : 'thousands';
  let currentScheduleFilter = 'all';
  let currentStage = 'explicit';
  let disposed = false;
  const tabulatorInstances = [];
  const tabulatorConfigs = [];
  const listeners = [];

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
      for (const p of ALL_SCHEDULE_PERIODS) {
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
        } else if (FORECAST_PERIODS.includes(p) || FADE_PERIODS.includes(p)) {
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
      for (const p of ALL_SCHEDULE_PERIODS) {
        let val = null;
        if (HISTORICAL_PERIODS.includes(p) && currentSchedules?.ppe?.byPeriod?.[p]) {
          const ppeP = currentSchedules.ppe.byPeriod[p];
          if (r.id === 'bop_net') val = ppeP.beginning_balance?.value;
          else if (r.id === 'capex') val = ppeP.additions?.value;
          else if (r.id === 'dep_exp') val = ppeP.depreciation?.value;
          else if (r.id === 'net_ppe') val = ppeP.ending_balance?.value;
          else if (r.id === 'gross_ppe') val = ppeP.breakdown?.gross_ppe?.value;
          else if (r.id === 'acc_dep') val = ppeP.breakdown?.accumulated_depreciation?.value;
        } else if (FORECAST_PERIODS.includes(p) || FADE_PERIODS.includes(p)) {
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
      for (const p of ALL_SCHEDULE_PERIODS) {
        let val = null;
        if (HISTORICAL_PERIODS.includes(p) && currentSchedules?.intangibleAmortization?.byPeriod?.[p]) {
          const intP = currentSchedules.intangibleAmortization.byPeriod[p];
          if (r.id === 'bop_net') val = intP.beginning_balance?.value;
          else if (r.id === 'additions') val = intP.additions?.value;
          else if (r.id === 'amort_exp') val = intP.amortization?.value;
          else if (r.id === 'net_intangibles') val = intP.ending_balance?.value;
          else if (r.id === 'gross_intangibles') val = intP.breakdown?.gross_intangibles?.value;
          else if (r.id === 'acc_amort') val = intP.breakdown?.accumulated_amortization?.value;
        } else if (FORECAST_PERIODS.includes(p) || FADE_PERIODS.includes(p)) {
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
      for (const p of ALL_SCHEDULE_PERIODS) {
        let val = null;
        if (HISTORICAL_PERIODS.includes(p) && currentSchedules?.sbc?.byPeriod?.[p]) {
          const sbcP = currentSchedules.sbc.byPeriod[p];
          if (r.id === 'sbc_exp') val = sbcP.sbc_expense?.value;
          else if (r.id === 'sbc_pct') val = sbcP.sbc_pct_of_revenue?.value;
        } else if (FORECAST_PERIODS.includes(p) || FADE_PERIODS.includes(p)) {
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

  const SCHEDULE_CLASS_MAP = {
    workingCapital: 'schedule-working-capital',
    ppe: 'schedule-ppe',
    intangibles: 'schedule-intangibles',
    sbc: 'schedule-sbc',
    debt: 'schedule-debt',
  };

  function buildDebtData() {
    const debtSchedule = currentThreeStatement?.supporting?.debt || currentSchedules?.debt || null;
    const hasDebtSchedule = Boolean(debtSchedule);
    const isDebtFree = Boolean(hasDebtSchedule && debtSchedule.hasDebt === false);

    const debtTag = isDebtFree ? 'DEBT-FREE' : (hasDebtSchedule ? 'DEBT PRESENT' : null);
    const debtTagClass = isDebtFree ? 'badge-pass' : (hasDebtSchedule ? 'badge-fail' : '');

    const rows = [
      { id: 'total_debt', label: 'Total Funded Debt (Short & Long-Term)', isLink: false, isFundedDebt: isDebtFree, rowTag: debtTag, tagClass: debtTagClass },
      { id: 'interest_exp', label: 'Interest Expense on Borrowings', isLink: false, isFundedDebt: isDebtFree, rowTag: debtTag, tagClass: debtTagClass },
      { id: 'lease_liab_non_cur', label: 'Operating Lease Liabilities (Long-Term)', isLink: true, isLease: true, rowTag: 'ASC 842', tagClass: 'badge-est' },
    ];

    return rows.map((r) => {
      const rowObj = { ...r };
      for (const p of ALL_SCHEDULE_PERIODS) {
        let val = null;
        if (r.id === 'total_debt') {
          if (isDebtFree) {
            val = 0;
          } else if (hasDebtSchedule && typeof debtSchedule.totalDebt === 'number') {
            val = debtSchedule.totalDebt;
          }
        } else if (r.id === 'interest_exp') {
          if (isDebtFree) {
            val = 0;
          } else if (hasDebtSchedule && typeof debtSchedule.interestExpense === 'number') {
            val = debtSchedule.interestExpense;
          }
        } else if (r.id === 'lease_liab_non_cur') {
          if (HISTORICAL_PERIODS.includes(p)) {
            const histLease = debtSchedule?.byPeriod?.[p]?.operating_leases?.long_term_lease_liability?.value;
            if (typeof histLease === 'number' && Number.isFinite(histLease)) {
              val = histLease;
            }
          } else if (FORECAST_PERIODS.includes(p) || FADE_PERIODS.includes(p)) {
            const fcLease = currentThreeStatement?.balanceSheet?.byPeriod?.[p]?.non_current_liabilities?.long_term_operating_lease_liability?.value;
            if (typeof fcLease === 'number' && Number.isFinite(fcLease)) {
              val = fcLease;
            }
          }
        }
        rowObj[p] = val;
      }
      return rowObj;
    });
  }

  function renderCard(title, statementKey, footnoteHtml = '') {
    const specificClass = SCHEDULE_CLASS_MAP[statementKey] || '';
    return `
      <div class="schedule-statement-card ${specificClass}" data-statement-card="${statementKey}">
        <div class="statement-card-header">
          ${title}
        </div>
        <div class="tabulator-grid-container financial-table" data-statement="${statementKey}"></div>
        ${footnoteHtml}
      </div>
    `;
  }

  function renderBalanceCheckCard() {
    const cardsHtml = renderGateCards(currentThreeStatement, { unit: currentUnit, stage: currentStage });
    return `
      <div class="hard-gate-section balance-check-card" id="hard-gate-section" data-statement-card="balance">
        <div class="statement-card-header gate-section-header">
          Balance Sheet Invariant Hard Gate (Assets = Liabilities + Stockholders' Equity)
        </div>
        <div class="gate-grid balance-check-grid" id="gate-grid">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  function applyScheduleFilter() {
    const filterButtons = container.querySelectorAll ? container.querySelectorAll('.schedule-pill-btn[data-schedule-tab]') : [];
    for (const btn of filterButtons) {
      const tab = btn.getAttribute ? btn.getAttribute('data-schedule-tab') : null;
      if (tab === currentScheduleFilter) {
        btn.classList?.add('active');
      } else {
        btn.classList?.remove('active');
      }
    }

    const gateSection = container.querySelector ? container.querySelector('#hard-gate-section') : null;
    if (gateSection) {
      if (currentScheduleFilter === 'all' || currentScheduleFilter === 'balance') {
        gateSection.classList?.remove('schedule-hidden');
      } else {
        gateSection.classList?.add('schedule-hidden');
      }
    }

    const cards = container.querySelectorAll ? container.querySelectorAll('[data-statement-card]') : [];
    for (const card of cards) {
      const stmt = card.getAttribute ? card.getAttribute('data-statement-card') : null;
      if (stmt === 'balance') continue;
      if (currentScheduleFilter === 'all' || currentScheduleFilter === stmt) {
        card.classList?.remove('schedule-hidden');
      } else {
        card.classList?.add('schedule-hidden');
      }
    }

    for (const inst of tabulatorInstances) {
      if (inst && typeof inst.redraw === 'function') {
        try { inst.redraw(true); } catch { /* ignore */ }
      }
    }
  }

  function bindEvents() {
    const unitRadios = container.querySelectorAll ? container.querySelectorAll('input[name="schedules-display-unit"]') : [];
    for (const radio of unitRadios) {
      if (radio && typeof radio.addEventListener === 'function') {
        const handler = (e) => {
          const targetVal = e?.target?.value;
          if (targetVal) setUnit(targetVal);
        };
        radio.addEventListener('change', handler);
        listeners.push({ target: radio, type: 'change', handler });
      }
    }

    const unitPills = container.querySelectorAll ? container.querySelectorAll('.pill-btn[data-unit], .units-btn[data-unit], .radio-pill[data-unit]') : [];
    for (const pill of unitPills) {
      if (pill && typeof pill.addEventListener === 'function') {
        const handler = (e) => {
          e?.preventDefault?.();
          const u = pill.getAttribute ? pill.getAttribute('data-unit') : null;
          if (u) setUnit(u);
        };
        pill.addEventListener('click', handler);
        listeners.push({ target: pill, type: 'click', handler });
      }
    }

    const stagePills = container.querySelectorAll ? container.querySelectorAll('.pill-btn[data-forecast-stage], .stage-btn[data-forecast-stage]') : [];
    for (const pill of stagePills) {
      if (pill && typeof pill.addEventListener === 'function') {
        const handler = (e) => {
          e?.preventDefault?.();
          const s = pill.getAttribute ? pill.getAttribute('data-forecast-stage') : null;
          if (s) setStage(s);
        };
        pill.addEventListener('click', handler);
        listeners.push({ target: pill, type: 'click', handler });
      }
    }

    const filterButtons = container.querySelectorAll ? container.querySelectorAll('.schedule-pill-btn[data-schedule-tab]') : [];
    for (const btn of filterButtons) {
      if (btn && typeof btn.addEventListener === 'function') {
        const handler = (e) => {
          e?.preventDefault?.();
          const tab = btn.getAttribute ? btn.getAttribute('data-schedule-tab') : null;
          if (tab) setScheduleFilter(tab);
        };
        btn.addEventListener('click', handler);
        listeners.push({ target: btn, type: 'click', handler });
      }
    }
  }

  function setStage(newStage) {
    if (newStage !== 'explicit' && newStage !== 'fade') return;
    if (newStage === currentStage) return;
    currentStage = newStage;
    render();
  }

  function setUnit(newUnit) {
    if (newUnit !== 'thousands' && newUnit !== 'millions') return;
    if (newUnit === currentUnit) return;
    currentUnit = newUnit;
    if (typeof onUnitChange === 'function') {
      try { onUnitChange(newUnit); } catch { /* ignore */ }
    }
    render();
  }

  function setScheduleFilter(filter) {
    currentScheduleFilter = filter;
    applyScheduleFilter();
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

    // Clean up event listeners before re-render
    for (const { target, type, handler } of listeners) {
      if (target && typeof target.removeEventListener === 'function') {
        try { target.removeEventListener(type, handler); } catch { /* ignore */ }
      }
    }
    listeners.length = 0;

    const wcData = buildWcData();
    const wcCols = buildScheduleColumns({ unit: currentUnit, stage: currentStage });
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
      rowFormatter: (row) => {
        const data = typeof row.getData === 'function' ? row.getData() : row;
        const el = typeof row.getElement === 'function' ? row.getElement() : null;
        if (!el || !el.classList) return;
        if (data.id === 'nwc') {
          el.classList.add('schedule-row-nwc');
        } else if (data.id === 'delta_nwc') {
          el.classList.add('schedule-row-delta-nwc');
        } else if (data.id === 'total_wc_assets' || data.id === 'total_wc_liabilities') {
          el.classList.add('schedule-row-subtotal');
        }
      },
    };
    tabulatorConfigs.push(wcConfig);

    const ppeData = buildPpeData();
    const ppeCols = buildScheduleColumns({ unit: currentUnit, stage: currentStage });
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
      rowFormatter: (row) => {
        const data = typeof row.getData === 'function' ? row.getData() : row;
        const el = typeof row.getElement === 'function' ? row.getElement() : null;
        if (!el || !el.classList) return;
        if (data.id === 'net_ppe') {
          el.classList.add('schedule-row-total');
        }
      },
    };
    tabulatorConfigs.push(ppeConfig);

    const intData = buildIntangiblesData();
    const intCols = buildScheduleColumns({ unit: currentUnit, stage: currentStage });
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
      rowFormatter: (row) => {
        const data = typeof row.getData === 'function' ? row.getData() : row;
        const el = typeof row.getElement === 'function' ? row.getElement() : null;
        if (!el || !el.classList) return;
        if (data.id === 'net_intangibles') {
          el.classList.add('schedule-row-total');
        }
      },
    };
    tabulatorConfigs.push(intConfig);

    const sbcData = buildSbcData();
    const sbcCols = buildScheduleColumns({ isPct: false, unit: currentUnit, stage: currentStage });
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
    const debtCols = buildScheduleColumns({ unit: currentUnit, stage: currentStage });
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
      rowFormatter: (row) => {
        const data = typeof row.getData === 'function' ? row.getData() : row;
        const el = typeof row.getElement === 'function' ? row.getElement() : null;
        if (!el || !el.classList) return;
        if (data.isFundedDebt) {
          el.classList.add('schedule-row-funded-debt');
        }
      },
    };
    tabulatorConfigs.push(debtConfig);

    const unitText = currentUnit === 'millions' ? 'millions' : 'thousands';
    const isThousands = currentUnit === 'thousands';
    const isMillions = currentUnit === 'millions';

    const wcHtml = renderCard(`Working Capital &amp; Operating Schedules ($ in ${unitText})`, 'workingCapital');
    const ppeHtml = renderCard(`PP&amp;E Roll-Forward Schedule ($ in ${unitText})`, 'ppe');
    const intHtml = renderCard(`Intangible Assets &amp; Amortization Schedule ($ in ${unitText})`, 'intangibles');
    const sbcHtml = renderCard(`Stock-Based Compensation (SBC) Schedule ($ in ${unitText})`, 'sbc');

    const debtSchedule = currentThreeStatement?.supporting?.debt || currentSchedules?.debt || null;
    const hasDebtSchedule = Boolean(debtSchedule);
    const isDebtFree = Boolean(hasDebtSchedule && debtSchedule.hasDebt === false);

    const debtTitle = isDebtFree
      ? 'Debt Schedule &amp; Capital Structure (Debt-Free Verified)'
      : (hasDebtSchedule ? 'Debt Schedule &amp; Capital Structure' : 'Debt Schedule &amp; Capital Structure (NO DATA)');

    const debtBasisText = debtSchedule?.statementBasis ||
      (isDebtFree
        ? 'Duolingo, Inc. has zero funded debt, zero bank borrowings, zero credit facility drawings, and zero promissory notes outstanding across all reported periods (FY2021-Q2 FY2026).'
        : 'Schedule data is unavailable.');

    const debtStatusTitle = isDebtFree
      ? 'Funded Debt Status (Debt-Free Verified):'
      : (hasDebtSchedule ? 'Funded Debt Status:' : 'Funded Debt Status (NO DATA):');

    const debtFootnoteHtml = `
      <div class="disclaimer-box schedule-footnote debt-footnote debt-callout-card">
        <div class="debt-callout-content">
          <p class="footnote-line">
            <strong>${debtStatusTitle}</strong> ${debtBasisText}
          </p>
          <p class="footnote-line">
            <span class="soft-em">Operating Leases (ASC 842):</span> Historical values reflect filed non-current operating lease liabilities ($k). FY2026-FY2030 lease values are <em>held at last filed Q2 FY2026 level; no lease forecast driver, see methodology</em>. Operating lease obligations do not constitute funded debt or borrowings.
          </p>
        </div>
      </div>
    `;

    const debtHtml = renderCard(debtTitle, 'debt', debtFootnoteHtml);
    const balanceCheckHtml = renderBalanceCheckCard();

    container.innerHTML = `
      <div class="schedules-view-wrapper schedules-hub-container">
        <div class="schedules-header-block">
          <div class="schedules-title-area">
            <h2 class="schedules-title">04. Supporting Schedules</h2>
            <p class="schedules-subtitle" id="schedules-subtitle">Detailed schedules supporting the 3-statement model. Figures in USD ${unitText} unless otherwise stated.</p>
          </div>
          <div class="schedules-controls-strip">
            <div class="stage-toggle-container">
              <span class="units-toggle-label">FORECAST STAGE</span>
              <div class="stage-mode-toggle pill-control" role="group" aria-label="Forecast Stage">
                <button type="button" class="pill-btn stage-btn ${currentStage === 'explicit' ? 'active' : ''}" data-forecast-stage="explicit" aria-pressed="${currentStage === 'explicit'}">Explicit FY26–30</button>
                <button type="button" class="pill-btn stage-btn ${currentStage === 'fade' ? 'active' : ''}" data-forecast-stage="fade" aria-pressed="${currentStage === 'fade'}">Fade FY31–35</button>
              </div>
            </div>
            <div class="units-toggle-container">
              <span class="units-toggle-label">DISPLAY UNITS</span>
              <div class="units-mode-toggle pill-control" role="group" aria-label="Display Units">
                <button type="button" class="pill-btn units-btn radio-pill ${isThousands ? 'active' : ''}" data-unit="thousands" aria-pressed="${isThousands}">Thousands</button>
                <button type="button" class="pill-btn units-btn radio-pill ${isMillions ? 'active' : ''}" data-unit="millions" aria-pressed="${isMillions}">Millions</button>
              </div>
            </div>
          </div>
        </div>

        <div class="schedules-switcher-bar">
          <div class="schedule-switcher-group pill-group" role="tablist" aria-label="Schedule Switcher">
            <button type="button" class="schedule-pill-btn ${currentScheduleFilter === 'all' ? 'active' : ''}" data-schedule-tab="all">All Schedules</button>
            <button type="button" class="schedule-pill-btn ${currentScheduleFilter === 'balance' ? 'active' : ''}" data-schedule-tab="balance">Balance Sheet</button>
            <button type="button" class="schedule-pill-btn ${currentScheduleFilter === 'workingCapital' ? 'active' : ''}" data-schedule-tab="workingCapital">Working Capital</button>
            <button type="button" class="schedule-pill-btn ${currentScheduleFilter === 'ppe' ? 'active' : ''}" data-schedule-tab="ppe">PP&amp;E</button>
            <button type="button" class="schedule-pill-btn ${currentScheduleFilter === 'intangibles' ? 'active' : ''}" data-schedule-tab="intangibles">Intangibles</button>
            <button type="button" class="schedule-pill-btn ${currentScheduleFilter === 'sbc' ? 'active' : ''}" data-schedule-tab="sbc">Stock-Based Comp</button>
            <button type="button" class="schedule-pill-btn ${currentScheduleFilter === 'debt' ? 'active' : ''}" data-schedule-tab="debt">Debt &amp; Capital Structure</button>
          </div>
        </div>

        ${balanceCheckHtml}

        <div class="schedules-tables-container" id="schedules-tables-container">
          ${wcHtml}
          ${ppeHtml}
          ${intHtml}
          ${sbcHtml}
          ${debtHtml}
        </div>
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

    bindEvents();
    applyScheduleFilter();
  }

  render();

  return {
    update(newSchedules, newThreeStatement = null) {
      currentSchedules = newSchedules;
      currentThreeStatement = newThreeStatement || currentThreeStatement;
      render();
    },
    setUnit,
    getUnit() {
      return currentUnit;
    },
    setStage,
    getStage() {
      return currentStage;
    },
    setScheduleFilter,
    getScheduleFilter() {
      return currentScheduleFilter;
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
      for (const { target, type, handler } of listeners) {
        if (target && typeof target.removeEventListener === 'function') {
          try { target.removeEventListener(type, handler); } catch { /* ignore */ }
        }
      }
      listeners.length = 0;
      currentSchedules = null;
      currentThreeStatement = null;
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
    tabulatorInstances,
    tabulatorConfigs,
  };
}

export default renderSchedules;
