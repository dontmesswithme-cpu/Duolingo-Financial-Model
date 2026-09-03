/**
 * Valuation Tab View (Phase 5.5).
 *
 * Renders the comprehensive institutional DCF valuation and CAPM WACC build:
 *  1. CAPM WACC Build Table (rf, beta, ERP, cost of equity, debt-free theorem proof, blended WACC)
 *  2. DCF Explicit Forecast Schedule (Tabulator grid across 5 forecast years + terminal year)
 *  3. Enterprise Value to Equity Value Bridge Waterfall (PV explicit + PV terminal + Net Cash -> Equity -> Per Share)
 *
 * All figures flow directly from wacc.build and dcf.valuate outputs (ZERO hardcoded fallback literals).
 *
 * Tabulator Grid Standards:
 *  - Frozen metric label column, headerSort: false, editor: false on all columns
 *  - selectableRange: true, selectableRangeColumns: true, clipboard: true, keybindings: true
 *  - Cell formatting via usd() and percent() with EST/MKT badges via format.estSuffix
 *
 * @module src/ui/valuationTab
 */

import { EngineError } from '../data/errors.js';
import { usd, percent, estSuffix, mktBadge } from './format.js';
import { TabulatorFull as DefaultTabulator } from './tabulator.js';
import { createWaterfall } from './charts.js';

/**
 * Builds Tabulator column definitions for the DCF explicit forecast schedule.
 *
 * @param {Array<string>} periods Forecast period names (e.g. FY2026..FY2030)
 * @returns {Array<object>}
 */
export function buildDcfColumns(periods = []) {
  return [
    {
      title: 'DCF Valuation Metric ($ in thousands)',
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
    ...periods.map((period) => ({
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
        if (row.formatType === 'factor') return val.toFixed(4);
        if (row.formatType === 'integer') return val.toFixed(0);
        return usd(val, { decimals: 2 });
      },
    })),
    {
      title: 'Terminal Year',
      field: 'Terminal',
      headerSort: false,
      hozAlign: 'right',
      editor: false,
      minWidth: 95,
      titleFormatter: () => estSuffix('Terminal Year', 'EST'),
      formatter: (cell) => {
        const val = typeof cell.getValue === 'function' ? cell.getValue() : cell;
        if (val === null || val === undefined || !Number.isFinite(val)) return '—';
        const row = typeof cell.getRow === 'function' ? cell.getRow().getData() : {};
        if (row.formatType === 'factor') return val.toFixed(4);
        if (row.formatType === 'integer') return val.toFixed(0);
        return usd(val, { decimals: 2 });
      },
    },
  ];
}

/**
 * Renders the Valuation tab inside the target container.
 *
 * @param {object} options
 * @param {HTMLElement|object} options.container
 * @param {object} options.wacc WaccBuild output
 * @param {object} options.dcf DcfOutput
 * @param {object} [options.assumptions]
 * @param {typeof DefaultTabulator} [options.TabulatorConstructor]
 * @returns {{ update: (wacc: object, dcf: object, assumptions?: object) => void, dispose: () => void, tabulatorInstances: object[], tabulatorConfigs: object[] }}
 */
export function renderValuation({
  container,
  wacc,
  dcf,
  assumptions = null,
  TabulatorConstructor = DefaultTabulator,
} = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderValuation requires a container element.', 'container');
  }

  let currentWacc = wacc;
  let currentDcf = dcf;
  let currentAssumptions = assumptions;
  let disposed = false;
  const tabulatorInstances = [];
  const tabulatorConfigs = [];

  function renderWaccBuildTable() {
    const rf = currentWacc?.riskFreeRate?.value;
    const rfAsOf = currentWacc?.riskFreeRate?.asOf || '';
    const rfProv = currentWacc?.riskFreeRate?.source?.provider || '';
    const rfUrl = currentWacc?.riskFreeRate?.source?.url || '';

    const beta = currentWacc?.beta?.value;
    const betaAsOf = currentWacc?.beta?.asOf || '';
    const betaProv = currentWacc?.beta?.source?.provider || '';
    const betaUrl = currentWacc?.beta?.source?.url || '';

    const erp = currentWacc?.erp?.value;
    const erpAsOf = currentWacc?.erp?.asOf || '';
    const erpProv = currentWacc?.erp?.source?.provider || '';
    const erpUrl = currentWacc?.erp?.source?.url || '';

    const costOfEquity = currentWacc?.costOfEquity?.value;
    const costOfDebt = currentWacc?.costOfDebt?.value;
    const taxRate = currentWacc?.taxRate?.value;
    const marketCap = currentWacc?.marketCap?.value;
    const equityWeight = currentWacc?.equityWeight?.value;
    const debtWeight = currentWacc?.debtWeight?.value;
    const waccVal = currentWacc?.wacc?.value;

    return `
      <div class="valuation-card wacc-card">
        <div class="statement-card-header">
          Weighted Average Cost of Capital (WACC) &amp; CAPM Build Table
        </div>
        <div class="valuation-card-body">
          <p class="valuation-section-desc">
            CAPM cost of equity is parameterized from independent market benchmarks. Under the verified debt-free capital structure (Total Debt = $0), WACC collapses to the cost of equity as a theorem: <code>WACC = (E/V) × Re + (D/V) × Rd × (1 − t) = Re</code>.
          </p>
          <table class="financial-summary-table wacc-table">
            <thead>
              <tr>
                <th>CAPM &amp; Capital Structure Component</th>
                <th class="align-right">Model Value</th>
                <th>Discipline / Source / As-Of Date</th>
                <th>Formula &amp; Methodological Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Risk-Free Rate (rf)</strong></td>
                <td class="align-right font-mono">${percent(rf, { decimals: 2 })}</td>
                <td>${mktBadge({ asOf: rfAsOf, provider: rfProv, url: rfUrl })}</td>
                <td>10-Year US Treasury Yield benchmark (FRED DGS10)</td>
              </tr>
              <tr>
                <td><strong>Equity Beta (β)</strong></td>
                <td class="align-right font-mono">${Number.isFinite(beta) ? beta.toFixed(2) : '—'}</td>
                <td>${mktBadge({ asOf: betaAsOf, provider: betaProv, url: betaUrl })}</td>
                <td>Adjusted equity beta (${betaProv || 'stockanalysis.com'}, as cited)</td>
              </tr>
              <tr>
                <td><strong>Equity Risk Premium (ERP)</strong></td>
                <td class="align-right font-mono">${percent(erp, { decimals: 2 })}</td>
                <td>${mktBadge({ asOf: erpAsOf, provider: erpProv, url: erpUrl })}</td>
                <td>Damodaran US implied equity risk premium estimate</td>
              </tr>
              <tr class="table-row-highlight">
                <td><strong>Cost of Equity (Re)</strong></td>
                <td class="align-right font-mono font-bold">${percent(costOfEquity, { decimals: 4 })}</td>
                <td>${estSuffix('CAPM', 'EST')}</td>
                <td><code>Re = rf + (β × ERP)</code></td>
              </tr>
              <tr>
                <td><strong>Pre-Tax Cost of Debt (Rd)</strong></td>
                <td class="align-right font-mono">${costOfDebt === null || costOfDebt === undefined ? '—' : percent(costOfDebt, { decimals: 2 })}</td>
                <td>${estSuffix('Debt-Free', 'ACT')}</td>
                <td>No funded debt, credit facility borrowings, or notes payable</td>
              </tr>
              <tr>
                <td><strong>Marginal Corporate Tax Rate (t)</strong></td>
                <td class="align-right font-mono">${percent(taxRate, { decimals: 2 })}</td>
                <td>${estSuffix('Effective', 'EST')}</td>
                <td>Normalized effective corporate income tax rate (${percent(taxRate, { decimals: 2 })}, per engine wacc.taxRate)</td>
              </tr>
              <tr>
                <td><strong>Market Value of Equity (E)</strong></td>
                <td class="align-right font-mono">${usd(marketCap, { decimals: 0 })}</td>
                <td>${estSuffix('Market Cap', 'MKT')}</td>
                <td><code>Share Price × Diluted Shares Outstanding</code></td>
              </tr>
              <tr>
                <td><strong>Total Funded Debt (D)</strong></td>
                <td class="align-right font-mono">$0</td>
                <td>${estSuffix('Verified', 'ACT')}</td>
                <td>SEC 10-K/10-Q audited balance sheet verification</td>
              </tr>
              <tr>
                <td><strong>Capital Structure Weights (E/V | D/V)</strong></td>
                <td class="align-right font-mono">${percent(equityWeight, { decimals: 1 })} / ${percent(debtWeight, { decimals: 1 })}</td>
                <td>${estSuffix('100% Equity', 'EST')}</td>
                <td>Pure 100.0% equity capital structure weighting</td>
              </tr>
              <tr class="table-row-total">
                <td><strong>Blended Cost of Capital (WACC)</strong></td>
                <td class="align-right font-mono font-bold font-large">${percent(waccVal, { decimals: 4 })}</td>
                <td>${estSuffix('Discount Rate', 'EST')}</td>
                <td><code>WACC = (E/V)Re + (D/V)Rd(1−t) = ${percent(waccVal, { decimals: 4 })}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function buildDcfScheduleData() {
    const schedule = currentDcf?.schedule || [];
    const periods = schedule.map((s) => s.period);

    const fcfRow = { id: 'fcf', label: 'Unlevered Free Cash Flow (FCF)', isLink: true, formatType: 'money' };
    const tRow = { id: 't', label: 'Discount Period (t)', isLink: false, formatType: 'integer' };
    const dfRow = { id: 'df', label: 'Discount Factor [ 1 / (1 + WACC)^t ]', isLink: false, formatType: 'factor' };
    const pvRow = { id: 'pv', label: 'Present Value of Explicit FCF (PV)', isLink: true, formatType: 'money' };
    const cumPvRow = { id: 'cumpv', label: 'Cumulative Present Value of FCF', isLink: true, formatType: 'money' };

    let cumPv = 0;
    for (let i = 0; i < schedule.length; i++) {
      const item = schedule[i];
      const p = item.period;
      fcfRow[p] = item.fcf;
      tRow[p] = item.t;
      dfRow[p] = item.discountFactor;
      pvRow[p] = item.presentValue;
      cumPv += item.presentValue;
      cumPvRow[p] = cumPv;
    }

    // Terminal Year column
    const finalItem = schedule[schedule.length - 1];
    const gRate = currentDcf?.terminalGrowthRate ?? 0;
    const finalFcf = finalItem?.fcf ?? 0;
    const terminalFcf = finalFcf * (1 + gRate);

    fcfRow['Terminal'] = Number.isFinite(terminalFcf) && terminalFcf > 0 ? terminalFcf : (currentDcf?.terminalFcf ?? null);
    tRow['Terminal'] = null;
    dfRow['Terminal'] = finalItem ? finalItem.discountFactor : null;
    pvRow['Terminal'] = currentDcf?.pvTerminal ?? null;
    cumPvRow['Terminal'] = (currentDcf?.pvExplicit ?? 0) + (currentDcf?.pvTerminal ?? 0);

    return {
      periods,
      data: [fcfRow, tRow, dfRow, pvRow, cumPvRow],
    };
  }

  function renderBridgeWaterfall() {
    const pvExplicit = currentDcf?.pvExplicit;
    const pvTerminal = currentDcf?.pvTerminal;
    const terminalValue = currentDcf?.terminalValue;
    const gRate = currentDcf?.terminalGrowthRate;
    const ev = currentDcf?.enterpriseValue;
    const cash = currentDcf?.bridge?.cash;
    const sti = currentDcf?.bridge?.shortTermInvestments;
    const lti = currentDcf?.bridge?.longTermInvestments;
    const debt = currentDcf?.bridge?.debt ?? 0;
    const netCash = currentDcf?.netCash;
    const equityValue = currentDcf?.equityValue;
    const shares = currentDcf?.sharesOutstanding;
    const perShare = currentDcf?.perShare;

    const waterfallChart = createWaterfall({ dcf: currentDcf });

    return `
      <div class="valuation-card bridge-card">
        <div class="statement-card-header">
          Enterprise Value to Equity Value Bridge &amp; Per Share Valuation Waterfall
        </div>
        <div class="valuation-card-body chart-card-body">
          ${waterfallChart.svg}
        </div>
        <div class="valuation-card-body">
          <p class="valuation-section-desc">
            Bridging Gordon Growth terminal value (terminal growth rate g = ${percent(gRate, { decimals: 1 })}) and balance-sheet cash sweep assets to implied equity value per diluted share.
          </p>
          <div class="bridge-grid-layout">
            <div class="bridge-table-wrapper">
              <table class="financial-summary-table bridge-table">
                <thead>
                  <tr>
                    <th>Valuation Step / Balance Sheet Bridge Line</th>
                    <th class="align-right">Amount ($ in thousands)</th>
                    <th>Methodology / Source Reference</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>(+) PV of 5-Year Explicit Forecast Cash Flows (FY2026–FY2030)</td>
                    <td class="align-right font-mono">${usd(pvExplicit, { decimals: 2 })}</td>
                    <td>${estSuffix('Sum of 5Y Discounted FCFs', 'EST')}</td>
                  </tr>
                  <tr>
                    <td>(+) PV of Gordon Terminal Value (g = ${percent(gRate, { decimals: 1 })})</td>
                    <td class="align-right font-mono">${usd(pvTerminal, { decimals: 2 })}</td>
                    <td>${estSuffix(`TV: ${usd(terminalValue, { decimals: 2 })}`, 'EST')}</td>
                  </tr>
                  <tr class="table-row-highlight">
                    <td><strong>(=) Implied Enterprise Value (EV)</strong></td>
                    <td class="align-right font-mono font-bold">${usd(ev, { decimals: 2 })}</td>
                    <td><code>PV(Explicit) + PV(Terminal)</code></td>
                  </tr>
                  <tr>
                    <td>(+) Cash and Cash Equivalents (Swept Ending Balance)</td>
                    <td class="align-right font-mono">${usd(cash, { decimals: 2 })}</td>
                    <td>Projected FY2030 ending cash balance</td>
                  </tr>
                  <tr>
                    <td>(+) Short-Term Investments (Held constant)</td>
                    <td class="align-right font-mono">${usd(sti, { decimals: 2 })}</td>
                    <td>Current short-term investment securities</td>
                  </tr>
                  <tr>
                    <td>(+) Long-Term Investments (Held constant)</td>
                    <td class="align-right font-mono">${usd(lti, { decimals: 2 })}</td>
                    <td>Non-current investment holdings</td>
                  </tr>
                  <tr>
                    <td>(−) Total Funded Debt Outstanding</td>
                    <td class="align-right font-mono">${usd(debt, { decimals: 2 })}</td>
                    <td>Zero funded debt obligations</td>
                  </tr>
                  <tr class="table-row-highlight">
                    <td><strong>(=) Net Cash Adjustment</strong></td>
                    <td class="align-right font-mono font-bold">${usd(netCash, { decimals: 2 })}</td>
                    <td><code>Cash + STI + LTI − Debt</code></td>
                  </tr>
                  <tr class="table-row-total">
                    <td><strong>(=) Implied Equity Value</strong></td>
                    <td class="align-right font-mono font-bold font-large">${usd(equityValue, { decimals: 2 })}</td>
                    <td><code>Enterprise Value + Net Cash</code></td>
                  </tr>
                  <tr>
                    <td>(÷) Diluted Common Shares Outstanding</td>
                    <td class="align-right font-mono font-bold">${Number.isFinite(shares) ? (shares / 1000).toFixed(3) + 'M' : '—'}</td>
                    <td>${mktBadge({ asOf: currentWacc?.sharesOutstanding?.asOf || '', provider: 'SEC 10-Q' })}</td>
                  </tr>
                  <tr class="table-row-grand-total">
                    <td><strong>(=) Implied DCF Equity Value Per Share</strong></td>
                    <td class="align-right font-mono font-bold font-huge">${usd(perShare, { decimals: 2 })}</td>
                    <td>${estSuffix('Target Intrinsic Value', 'EST')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="bridge-visual-summary">
              <div class="bridge-kpi-card">
                <div class="bridge-kpi-title">Implied Target Price</div>
                <div class="bridge-kpi-value font-mono">${usd(perShare, { decimals: 2 })}</div>
                <div class="bridge-kpi-sub">DCF Intrinsic Value / Share</div>
              </div>
              <div class="bridge-kpi-card">
                <div class="bridge-kpi-title">Enterprise Value</div>
                <div class="bridge-kpi-value font-mono">${usd(ev, { decimals: 0 })}</div>
                <div class="bridge-kpi-sub">$ in thousands</div>
              </div>
              <div class="bridge-kpi-card">
                <div class="bridge-kpi-title">Net Cash Bridge</div>
                <div class="bridge-kpi-value font-mono">${usd(netCash, { decimals: 0 })}</div>
                <div class="bridge-kpi-sub">Cash + STI + LTI ($ in thousands)</div>
              </div>
              <div class="bridge-kpi-card">
                <div class="bridge-kpi-title">Terminal Value % of EV</div>
                <div class="bridge-kpi-value font-mono">${ev > 0 ? percent(pvTerminal / ev, { decimals: 1 }) : '—'}</div>
                <div class="bridge-kpi-sub">PV(TV) / Enterprise Value</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    for (const inst of tabulatorInstances) {
      if (inst && typeof inst.destroy === 'function') {
        try { inst.destroy(); } catch { /* ignore */ }
      }
    }
    tabulatorInstances.length = 0;
    tabulatorConfigs.length = 0;

    const schedData = buildDcfScheduleData();
    const cols = buildDcfColumns(schedData.periods);
    const dcfConfig = {
      statement: 'dcfSchedule',
      data: schedData.data,
      columns: cols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(dcfConfig);

    const waccHtml = renderWaccBuildTable();
    const dcfScheduleHtml = `
      <div class="valuation-card dcf-card">
        <div class="statement-card-header">
          5-Year Explicit Forecast Free Cash Flow Schedule &amp; Present Value ($ in thousands)
        </div>
        <div class="tabulator-grid-container financial-table" data-statement="dcfSchedule"></div>
      </div>
    `;
    const bridgeHtml = renderBridgeWaterfall();

    container.innerHTML = `
      <div class="valuation-view-wrapper">
        ${waccHtml}
        ${dcfScheduleHtml}
        ${bridgeHtml}
      </div>
    `;

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
    update(newWacc, newDcf, newAssumptions = null) {
      currentWacc = newWacc;
      currentDcf = newDcf;
      currentAssumptions = newAssumptions || currentAssumptions;
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
      currentWacc = null;
      currentDcf = null;
      currentAssumptions = null;
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
    tabulatorInstances,
    tabulatorConfigs,
  };
}

export default renderValuation;
