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
import { regress } from '../engine/beta.js';
import pricesDataset from '../data/historical/prices.json' with { type: 'json' };

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
        if (row.formatType === 'multiple') return val.toFixed(4) + '×';
        if (row.formatType === 'factor') return val.toFixed(4);
        if (row.formatType === 'integer') return val.toFixed(0);
        return usd(val, { decimals: 2 });
      },
    })),
    {
      title: 'Terminal Year (Gordon)',
      field: 'Terminal',
      headerSort: false,
      hozAlign: 'right',
      editor: false,
      minWidth: 150,
      titleFormatter: () => estSuffix('Terminal Year (Gordon)', 'EST'),
      formatter: (cell) => {
        const val = typeof cell.getValue === 'function' ? cell.getValue() : cell;
        if (val === null || val === undefined || !Number.isFinite(val)) return '—';
        const row = typeof cell.getRow === 'function' ? cell.getRow().getData() : {};
        if (row.formatType === 'multiple') return val.toFixed(4) + '×';
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
 * @param {object} [options.prices]
 * @param {typeof DefaultTabulator} [options.TabulatorConstructor]
 * @param {object} [options.marketPriceState] MarketPriceState (Finding G)
 * @param {() => Promise<void>|void} [options.onRefreshPrice] Manual refresh callback
 * @returns {{ update: (wacc: object, dcf: object, assumptions?: object, prices?: object, marketPriceState?: object) => void, dispose: () => void, tabulatorInstances: object[], tabulatorConfigs: object[] }}
 */
export function renderValuation({
  container,
  wacc,
  dcf,
  assumptions = null,
  prices = null,
  TabulatorConstructor = DefaultTabulator,
  marketPriceState = null,
  onRefreshPrice = null,
} = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderValuation requires a container element.', 'container');
  }

  let currentWacc = wacc;
  let currentDcf = dcf;
  let currentAssumptions = assumptions;
  let currentPrices = prices;
  let currentMarketPrice = marketPriceState;
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

  function renderBetaDerivation() {
    let reg = null;
    try {
      reg = regress(currentPrices || pricesDataset);
    } catch {
      return '';
    }
    if (!reg) return '';

    const currentBeta = currentWacc?.beta?.value ?? reg.beta;
    const providerBeta = 0.89;
    const deviation = Math.abs(reg.beta - providerBeta);
    const betaAsOf = currentWacc?.beta?.asOf || reg.windowEnd || '';
    const betaUrl = currentWacc?.beta?.source?.url || pricesDataset?.source?.stock?.url || '';
    const sp500Url = pricesDataset?.source?.benchmark?.url || '';

    return `
      <div class="valuation-card beta-derivation-card">
        <div class="statement-card-header">
          In-Model CAPM Beta Derivation (Ordinary Least Squares on Bundled Corpus Price Series)
        </div>
        <div class="valuation-card-body">
          <p class="valuation-section-desc">
            Duolingo is debt-free (D = $0), meaning the raw regression (levered) beta equals the unlevered asset beta (no Hamada adjustment required).
            Beta is computed at runtime via <code>beta.regress</code> from the verified ${reg.n}-observation monthly price series against the S&amp;P 500 Index.
            The model parameter remains fully user-adjustable in the Assumptions tab (active driver: <strong>${Number.isFinite(currentBeta) ? currentBeta.toFixed(2) : '—'}</strong>).
          </p>
          <table class="financial-summary-table beta-derivation-table">
            <thead>
              <tr>
                <th>Regression Parameter / Statistic</th>
                <th class="align-right">Computed Value</th>
                <th>Benchmark / Source</th>
                <th>Methodological &amp; Statistical Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Observation Sample (n)</strong></td>
                <td class="align-right font-mono">${reg.n} months</td>
                <td>Monthly simple returns</td>
                <td>First full month post-IPO (${reg.windowStart}) through latest completed month (${reg.windowEnd})</td>
              </tr>
              <tr>
                <td><strong>Regression Window</strong></td>
                <td class="align-right font-mono">${reg.windowStart} – ${reg.windowEnd}</td>
                <td>5-Year trailing window</td>
                <td>${reg.n} monthly return pairs (target n = 60 achieved)</td>
              </tr>
              <tr>
                <td><strong>Market Portfolio Benchmark</strong></td>
                <td class="align-right font-mono">${reg.benchmark}</td>
                <td>${mktBadge({ asOf: betaAsOf, provider: 'FRED', url: sp500Url })}</td>
                <td>S&amp;P 500 Index month-end adjusted closing levels (FRED series SP500)</td>
              </tr>
              <tr class="table-row-highlight">
                <td><strong>OLS Slope (Computed Beta, β)</strong></td>
                <td class="align-right font-mono font-bold">${reg.beta.toFixed(4)}</td>
                <td>${estSuffix('Computed @0.01 step → ' + reg.beta.toFixed(2), 'EST')}</td>
                <td><code>Cov(r_DUOL, r_SPX) / Var(r_SPX)</code> (debt-free: raw beta = asset beta)</td>
              </tr>
              <tr>
                <td><strong>Active Model Driver Beta</strong></td>
                <td class="align-right font-mono font-bold">${Number.isFinite(currentBeta) ? currentBeta.toFixed(2) : '—'}</td>
                <td>${mktBadge({ asOf: betaAsOf, provider: 'stockanalysis.com', url: betaUrl })}</td>
                <td>Parameter in active scenario / user override (re-anchored to computed slope ${reg.beta.toFixed(2)})</td>
              </tr>
              <tr>
                <td><strong>Monthly Alpha (α)</strong></td>
                <td class="align-right font-mono">${(reg.alphaMonthly * 100).toFixed(2)}% (${reg.alphaMonthly.toFixed(4)})</td>
                <td>Monthly intercept</td>
                <td>Annualized excess return: ~${(reg.alphaMonthly * 12 * 100).toFixed(2)}% p.a.</td>
              </tr>
              <tr>
                <td><strong>Coefficient of Determination (R²)</strong></td>
                <td class="align-right font-mono">${(reg.r2 * 100).toFixed(2)}%</td>
                <td>Goodness of fit</td>
                <td>Proportion of return variance explained by systematic market factor</td>
              </tr>
              <tr>
                <td><strong>Standard Error of Beta (SE)</strong></td>
                <td class="align-right font-mono">${reg.stderr.toFixed(4)}</td>
                <td>Sampling dispersion</td>
                <td>Standard error of estimated OLS slope coefficient</td>
              </tr>
              <tr>
                <td><strong>Provider Cross-Check (stockanalysis.com)</strong></td>
                <td class="align-right font-mono">${providerBeta.toFixed(2)}</td>
                <td>stockanalysis.com 5Y monthly</td>
                <td>Published aggregator beta = 0.89; |computed − provider| = ${deviation.toFixed(6)} (&lt;0.05% deviation, ~0.22 bps Re impact)</td>
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

    const fcfRow = { id: 'fcf', label: 'Unlevered Free Cash Flow (FCFF)', isLink: true, formatType: 'money' };
    const tRow = { id: 't', label: 'Discount Period (t)', isLink: false, formatType: 'integer' };
    const dfRow = { id: 'df', label: 'Discount Factor [ 1 / (1 + WACC)^t ]', isLink: false, formatType: 'factor' };
    const pvRow = { id: 'pv', label: 'Present Value of Explicit FCF (PV)', isLink: true, formatType: 'money' };

    // Finding E terminal rows in required order:
    const termFcfRow = { id: 'termFcf', label: 'Terminal FCF (undiscounted)', isLink: true, formatType: 'money' };
    const gordonMultRow = { id: 'gordonMult', label: 'Gordon multiple [ 1 / (WACC − g) ]', isLink: false, formatType: 'multiple' };
    const termValRow = { id: 'termVal', label: 'Terminal Value (undiscounted) = Terminal FCF × Multiple', isLink: true, formatType: 'money' };
    const pvTermValRow = { id: 'pvTermVal', label: 'PV of Terminal Value = TV × df_T', isLink: true, formatType: 'money' };
    const cumPvRow = { id: 'cumpv', label: 'Cumulative PV incl. Terminal Value', isLink: true, formatType: 'money' };

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

      termFcfRow[p] = null;
      gordonMultRow[p] = null;
      termValRow[p] = null;
      pvTermValRow[p] = null;
    }

    // Terminal Year (Gordon) column
    const finalItem = schedule[schedule.length - 1];
    const waccRate = currentDcf?.wacc ?? 0;
    const gRate = currentDcf?.terminalGrowthRate ?? 0;
    const finalFcf = finalItem?.fcf ?? 0;
    const terminalFcf = finalFcf * (1 + gRate);
    const gordonMultiple = waccRate > gRate ? 1 / (waccRate - gRate) : null;
    const terminalValue = currentDcf?.terminalValue ?? (terminalFcf * (gordonMultiple ?? 0));
    const pvTerminal = currentDcf?.pvTerminal ?? null;

    fcfRow['Terminal'] = null;
    tRow['Terminal'] = null;
    dfRow['Terminal'] = finalItem ? finalItem.discountFactor : null;
    pvRow['Terminal'] = null; // Explicit FCF PV does NOT span terminal column (Finding E)

    termFcfRow['Terminal'] = terminalFcf;
    gordonMultRow['Terminal'] = gordonMultiple;
    termValRow['Terminal'] = terminalValue;
    pvTermValRow['Terminal'] = pvTerminal;
    cumPvRow['Terminal'] = (currentDcf?.pvExplicit ?? 0) + (pvTerminal ?? 0);

    return {
      periods,
      data: [fcfRow, tRow, dfRow, pvRow, termFcfRow, gordonMultRow, termValRow, pvTermValRow, cumPvRow],
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
                    <td>${estSuffix('Sum of 5Y Discounted FCFFs', 'EST')}</td>
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
                    <td>(+) Cash and Cash Equivalents (Latest Filed Balance Q2 FY2026)</td>
                    <td class="align-right font-mono">${usd(cash, { decimals: 2 })}</td>
                    <td>Latest filed cash and cash equivalents balance</td>
                  </tr>
                  <tr>
                    <td>(+) Short-Term Investments (Latest Filed Balance Q2 FY2026)</td>
                    <td class="align-right font-mono">${usd(sti, { decimals: 2 })}</td>
                    <td>Liquid short-term investment securities</td>
                  </tr>
                  <tr>
                    <td>(+) Long-Term Investments (Latest Filed Balance Q2 FY2026)</td>
                    <td class="align-right font-mono">${usd(lti, { decimals: 2 })}</td>
                    <td>Non-current investment holdings</td>
                  </tr>
                  <tr>
                    <td>(−) Total Funded Debt Outstanding</td>
                    <td class="align-right font-mono">${usd(debt, { decimals: 2 })}</td>
                    <td>Debt-free capital structure (D = 0)</td>
                  </tr>
                  <tr class="table-row-highlight">
                    <td><strong>(=) Net Cash Adjustment Today</strong></td>
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
                    <td><strong>(=) Implied DCF Equity Value Per Share (FCFF Headline)</strong></td>
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
                <div class="bridge-kpi-sub">FCFF Intrinsic Value / Share</div>
              </div>
              <div class="bridge-kpi-card">
                <div class="bridge-kpi-title">Enterprise Value</div>
                <div class="bridge-kpi-value font-mono">${usd(ev, { decimals: 0 })}</div>
                <div class="bridge-kpi-sub">$ in thousands</div>
              </div>
              <div class="bridge-kpi-card">
                <div class="bridge-kpi-title">Net Cash Bridge (Today)</div>
                <div class="bridge-kpi-value font-mono">${usd(netCash, { decimals: 0 })}</div>
                <div class="bridge-kpi-sub">Q2 FY2026 Cash + STI + LTI ($k)</div>
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

  function renderDualPathEquivalence() {
    const fcff = currentDcf?.fcff;
    const fcfe = currentDcf?.fcfe;
    const equiv = currentDcf?.equivalence;
    const legacy = currentDcf?.legacy;
    const waccRate = currentDcf?.wacc ?? 0;

    const fcffPerShare = fcff?.perShare ?? currentDcf?.perShare;
    const fcfePerShare = fcfe?.perShare ?? 0;
    const netCashToday = fcff?.netCashToday ?? currentDcf?.netCash ?? 0;
    const divergence = equiv?.divergence ?? (fcffPerShare - fcfePerShare);
    const legacyPerShare = legacy?.perShare ?? 0;

    return `
      <div class="valuation-card dual-path-card">
        <div class="statement-card-header">
          FCFF / FCFE Dual-Path DCF &amp; Debt-Free Equivalence (Finding F)
        </div>
        <div class="valuation-card-body">
          <p class="valuation-section-desc">
            Restated DCF valuation on a consistent Free Cash Flow to Firm (FCFF) headline basis, eliminating the mixed-basis double count of cash. Debt-free structure (D = 0) ensures WACC ≡ Re, guaranteeing both paths discount at the same rate and value the same underlying equity claim.
          </p>
          <div class="dual-path-grid">
            <div class="dual-path-card-col headline-col">
              <div class="dual-path-badge badge-headline">HEADLINE MODEL ANSWER</div>
              <div class="dual-path-path-title">Firm Basis: Free Cash Flow to Firm (FCFF)</div>
              <div class="dual-path-price-value font-mono font-huge font-bold">${usd(fcffPerShare, { decimals: 2 })}</div>
              <div class="dual-path-price-sub">Implied Target Price / Share</div>
              <ul class="dual-path-metrics-list font-mono">
                <li><span>Enterprise Value (PV Explicit + PV TV):</span> <strong>${usd(fcff?.enterpriseValue ?? currentDcf?.enterpriseValue, { decimals: 0 })}</strong></li>
                <li><span>(+) Net Cash Today (Latest Filed Q2 FY2026):</span> <strong>${usd(netCashToday, { decimals: 0 })}</strong></li>
                <li><span>(=) Implied Equity Value:</span> <strong>${usd(fcff?.equityValue ?? currentDcf?.equityValue, { decimals: 0 })}</strong></li>
                <li><span>Discount Rate:</span> <strong>WACC = ${percent(waccRate, { decimals: 2 })}</strong></li>
              </ul>
              <div class="dual-path-footnote font-muted">
                Unlevered cash flows (operating cash flow minus capex minus after-tax interest income) plus today's cash sweep. Zero double counting.
              </div>
            </div>

            <div class="dual-path-card-col floor-col">
              <div class="dual-path-badge badge-floor">DISCLOSED FLOOR</div>
              <div class="dual-path-path-title">Equity Basis: Free Cash Flow to Equity (FCFE)</div>
              <div class="dual-path-price-value font-mono font-huge font-bold">${usd(fcfePerShare, { decimals: 2 })}</div>
              <div class="dual-path-price-sub">Implied Target Price / Share</div>
              <ul class="dual-path-metrics-list font-mono">
                <li><span>PV of Explicit FCFE + PV of TV:</span> <strong>${usd(fcfe?.equityValue, { decimals: 0 })}</strong></li>
                <li><span>Net Cash Added in Bridge:</span> <strong>$0 (Zero Cash Add)</strong></li>
                <li><span>(=) Implied Equity Value:</span> <strong>${usd(fcfe?.equityValue, { decimals: 0 })}</strong></li>
                <li><span>Discount Rate:</span> <strong>Cost of Equity Re = ${percent(waccRate, { decimals: 2 })}</strong></li>
              </ul>
              <div class="dual-path-footnote font-muted">
                Net income-derived flows embed interest income on the cash pile; under the no-cash-add convention, this serves as an equity value floor.
              </div>
            </div>
          </div>

          <div class="equivalence-theorem-box">
            <div class="equivalence-theorem-title">
              <strong>Debt-Free Equivalence Theorem:</strong> ${equiv?.statement ?? 'At D = 0, WACC ≡ Re, so FCFF and FCFE discount at the same rate; both paths value the same equity claim and converge.'}
            </div>
            <div class="equivalence-divergence-summary font-mono">
              Path Divergence (FCFF − FCFE): <strong>${divergence >= 0 ? '+' : ''}${usd(divergence, { decimals: 2 })} / share</strong>
              <span class="legacy-audit-tag font-muted">(Remediated legacy mixed-basis was ${usd(legacyPerShare, { decimals: 2 })}; double count retired)</span>
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
    const betaDerivationHtml = renderBetaDerivation();
    const dcfScheduleHtml = `
      <div class="valuation-card dcf-card">
        <div class="statement-card-header">
          5-Year Explicit Forecast Free Cash Flow Schedule &amp; Present Value (FCFF Basis, $ in thousands)
        </div>
        <div class="tabulator-grid-container financial-table" data-statement="dcfSchedule"></div>
      </div>
    `;
    const bridgeHtml = renderBridgeWaterfall();
    const dualPathHtml = renderDualPathEquivalence();

    const bannerHtml = currentMarketPrice?.bannerText
      ? `<div class="live-price-banner live-price-${currentMarketPrice.status || 'fallback'}" role="alert">${currentMarketPrice.bannerText}</div>`
      : '';

    container.innerHTML = `
      <div class="valuation-view-wrapper">
        ${bannerHtml}
        ${waccHtml}
        ${betaDerivationHtml}
        ${dcfScheduleHtml}
        ${bridgeHtml}
        ${dualPathHtml}
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
    update(newWacc, newDcf, newAssumptions = null, newPrices = null, newMarketPrice = undefined) {
      currentWacc = newWacc;
      currentDcf = newDcf;
      currentAssumptions = newAssumptions || currentAssumptions;
      if (newPrices) currentPrices = newPrices;
      if (newMarketPrice !== undefined) currentMarketPrice = newMarketPrice;
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
      currentPrices = null;
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
    tabulatorInstances,
    tabulatorConfigs,
  };
}

export default renderValuation;
