/**
 * Historical Statements & KPIs Tab View (Phase 5.3).
 *
 * Renders audited historical financial datasets via live TabulatorFull grids:
 *  - 4 financial statement grids: Income Statement, Balance Sheet, Cash Flow, and KPIs
 *  - Single visible table implementation: Tabulator is the only rendered table
 *  - Full column set: FY2021..FY2025 + 4 discrete quarters (Q3 FY25, Q4 FY25, Q1 FY26, Q2 FY26) + TTM column
 *  - TTM column header formatted with computed badge via titleFormatter
 *  - 100% cited rows with <sup>[N]</sup> citation links and expandable Source Citation Details Drawer
 *  - TabulatorFull grid configuration:
 *      data: pivoted metric rows
 *      columns: column definitions with frozen: true on label column, headerSort: false, editor: false on all columns
 *      layout: "fitDataFill", selectableRange: true, selectableRangeColumns: true, clipboard: true, keybindings: true
 *  - Zero inline style attributes (CSS classes only)
 *  - Pure and headless-testable via dependency-injected container and Tabulator constructor
 *
 * @module src/ui/historicalsTab
 */

import { EngineError } from '../data/errors.js';
import { extractRows } from '../data/schema.js';
import { usd, estSuffix } from './format.js';
import { compute as computeTtm, deriveDiscreteQuarters } from '../engine/ttm.js';
import { TabulatorFull as DefaultTabulator } from './tabulator.js';

const ANNUAL_PERIODS = Object.freeze(['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025']);
const QUARTERLY_PERIODS = Object.freeze(['Q3 FY2025', 'Q4 FY2025', 'Q1 FY2026', 'Q2 FY2026']);
const ALL_PERIOD_COLUMNS = Object.freeze([...ANNUAL_PERIODS, ...QUARTERLY_PERIODS]);

/**
 * Maps raw dataset rows into a metric-keyed lookup table with annual and discrete quarter values.
 *
 * @param {Array<object>} rows
 * @param {boolean} [isFlow=false]
 * @returns {Record<string, object>}
 */
function pivotRowsByMetric(rows, isFlow = false) {
  const byMetric = {};
  if (!Array.isArray(rows)) return byMetric;

  for (const row of rows) {
    if (!row || !row.metric) continue;
    if (!byMetric[row.metric]) {
      byMetric[row.metric] = {
        metric: row.metric,
        label: row.metric.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        units: row.units || 'thousands_usd',
        scale: row.scale || 1000,
        periods: {},
        source: row.source || null,
        definition: row.definition || '',
        category: row.category || '',
      };
    }
    if (row.period) {
      byMetric[row.metric].periods[row.period] = row.value;
      if (row.source && !byMetric[row.metric].source) {
        byMetric[row.metric].source = row.source;
      }
    }
  }

  // Derive discrete quarters for flow metrics
  if (isFlow) {
    for (const metricKey of Object.keys(byMetric)) {
      try {
        const discreteMap = deriveDiscreteQuarters(rows, metricKey);
        if (discreteMap && typeof discreteMap.forEach === 'function') {
          discreteMap.forEach((qData, qPeriod) => {
            if (qData && Number.isFinite(qData.value)) {
              byMetric[metricKey].periods[qPeriod] = qData.value;
            }
          });
        }
      } catch {
        // Fall back to direct row values if derivation not applicable
      }
    }
  }

  return byMetric;
}

const PRIMARY_CITATIONS_CACHE = new WeakMap();

/**
 * Derives the primary filing citation for each column in a statement dataset.
 * The primary filing is the filing URL cited by the majority of rows in that column.
 *
 * @param {Array<object>} statementRows Raw rows array from dataset
 * @returns {Record<string, object>} Map of period -> primary source object
 */
export function deriveColumnPrimaryCitations(statementRows = []) {
  if (!Array.isArray(statementRows)) return {};
  if (PRIMARY_CITATIONS_CACHE.has(statementRows)) {
    return PRIMARY_CITATIONS_CACHE.get(statementRows);
  }
  const primaryMap = {};

  const byPeriod = {};
  for (const row of statementRows) {
    if (!row || !row.period || !row.source?.url) continue;
    if (!byPeriod[row.period]) byPeriod[row.period] = {};
    const url = row.source.url;
    if (!byPeriod[row.period][url]) {
      byPeriod[row.period][url] = { count: 0, source: row.source };
    }
    byPeriod[row.period][url].count++;
  }

  for (const [period, urlEntries] of Object.entries(byPeriod)) {
    let maxCount = -1;
    let chosenSource = null;
    for (const entry of Object.values(urlEntries)) {
      if (entry.count > maxCount) {
        maxCount = entry.count;
        chosenSource = entry.source;
      }
    }
    if (chosenSource) {
      primaryMap[period] = { ...chosenSource };
    }
  }

  PRIMARY_CITATIONS_CACHE.set(statementRows, primaryMap);
  return primaryMap;
}

/**
 * Builds Tabulator column definitions for a financial statement with hybrid citations.
 *
 * @param {boolean} [isKpi=false]
 * @param {Record<string, object>} [primaryCitations={}] Map of period -> { url, citationHtml, ... }
 * @returns {Array<object>}
 */
export function buildTabulatorColumns(isKpi = false, primaryCitations = {}) {
  const columns = [
    {
      title: 'Metric / Line Item',
      field: 'label',
      frozen: true,
      headerSort: false,
      editor: false,
      minWidth: 260,
      formatter: (cell) => {
        const row = typeof cell.getRow === 'function' ? cell.getRow().getData() : cell;
        if (isKpi) {
          const def = typeof row.definition === 'string' ? row.definition : '';
          const defTitle = def ? ` title="${def.replace(/"/g, '&quot;')}"` : '';
          const defLine = def ? `<div class="kpi-def"${defTitle}>${def.split(/[.!?]\s/, 1)[0]}</div>` : '';
          return `<div class="kpi-metric-title"><div class="kpi-name">${row.label} ${row.citationHtml || ''}</div>${defLine}</div>`;
        }
        return `<div class="metric-title">${row.label} ${row.citationHtml || ''}</div>`;
      },
    },
    ...ANNUAL_PERIODS.map((period) => {
      const primary = primaryCitations[period];
      const colDef = {
        title: period,
        field: period,
        headerSort: false,
        hozAlign: 'right',
        editor: false,
        minWidth: 95,
        formatter: (cell) => {
          const val = typeof cell.getValue === 'function' ? cell.getValue() : cell;
          if (!Number.isFinite(val)) return ' - ';
          return isKpi ? val.toLocaleString() : usd(val, { decimals: 0 });
        },
      };
      if (primary && primary.citationHtml) {
        colDef.titleFormatter = () => `${period} ${primary.citationHtml}`;
      }
      return colDef;
    }),
    ...QUARTERLY_PERIODS.map((period) => {
      const primary = primaryCitations[period];
      const colDef = {
        title: period,
        field: period,
        headerSort: false,
        hozAlign: 'right',
        editor: false,
        minWidth: 95,
        formatter: (cell) => {
          const val = typeof cell.getValue === 'function' ? cell.getValue() : cell;
          if (!Number.isFinite(val)) return ' - ';
          return isKpi ? val.toLocaleString() : usd(val, { decimals: 0 });
        },
      };
      if (primary && primary.citationHtml) {
        colDef.titleFormatter = () => `${period} ${primary.citationHtml}`;
      }
      return colDef;
    }),
    {
      title: 'TTM',
      field: 'TTM',
      headerSort: false,
      hozAlign: 'right',
      editor: false,
      minWidth: 95,
      titleFormatter: () => estSuffix('TTM', 'computed'),
      formatter: (cell) => {
        const val = typeof cell.getValue === 'function' ? cell.getValue() : cell;
        if (!Number.isFinite(val)) return ' - ';
        return isKpi ? val.toLocaleString() : usd(val, { decimals: 0 });
      },
    },
  ];

  return columns;
}

/**
 * Renders the Historicals tab inside the target container.
 *
 * @param {object} options
 * @param {HTMLElement|object} options.container Target DOM element or stub
 * @param {object} options.historical Historical dataset object (income, balance, cashflow, kpis)
 * @param {object} [options.ttm] Precomputed TTM dataset
 * @param {typeof DefaultTabulator} [options.TabulatorConstructor]
 * @returns {{ update: (historical: object, ttm?: object) => void, dispose: () => void, tabulatorInstances: object[], tabulatorConfigs: object[] }}
 */
export function renderHistoricals({
  container,
  historical,
  ttm = null,
  TabulatorConstructor = DefaultTabulator,
} = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderHistoricals requires a container element.', 'container');
  }

  let currentHistorical = historical;
  let currentTtm = ttm || (historical ? computeTtm(historical) : null);
  let disposed = false;
  const tabulatorInstances = [];
  const tabulatorConfigs = [];
  const citationRegistry = [];

  function collectCitation(source, metricLabel, isException = false) {
    if (!source || !source.url) return { id: null, html: '' };
    let existingIndex = citationRegistry.findIndex((c) => c.url === source.url);
    if (existingIndex === -1) {
      citationRegistry.push({
        id: citationRegistry.length + 1,
        metric: metricLabel || 'Primary Filing',
        filing: source.filing || 'SEC Filing',
        period: source.period || '',
        statement: source.statement || 'Consolidated Financial Statements',
        url: source.url,
        accessedAt: source.accessedAt || '',
      });
      existingIndex = citationRegistry.length - 1;
    }
    const citationId = citationRegistry[existingIndex].id;
    const excClass = isException ? ' citation-exception' : '';
    const supHtml = `<sup><a href="${source.url}" target="_blank" rel="noopener noreferrer" class="citation-sup${excClass}" data-citation-id="${citationId}" title="${source.filing || 'Filing'} (${source.period || ''})">[${citationId}]</a></sup>`;
    return { id: citationId, html: supHtml };
  }

  function buildStatementData(rawDataset, isFlow = false, isKpi = false, primaryCitations = {}) {
    const rows = extractRows(rawDataset) || [];
    const metricMap = pivotRowsByMetric(rows, isFlow);
    const metricKeys = Object.keys(metricMap);

    return metricKeys.map((mKey) => {
      const m = metricMap[mKey];

      // Inline row superscripts appear ONLY on exception rows:
      // rows whose source.url differs from their column's primary filing.
      let exceptionCitation = null;
      for (const r of rows) {
        if (r.metric !== mKey || !r.period || !r.source?.url) continue;
        const primary = primaryCitations[r.period];
        if (primary && primary.url && r.source.url !== primary.url) {
          exceptionCitation = collectCitation(r.source, `${m.label} (${r.period})`, true);
          break;
        }
      }

      let ttmVal = null;
      if (currentTtm && currentTtm.records) {
        const ttmRec = currentTtm.records.find((r) => r.metric === mKey);
        if (ttmRec && Number.isFinite(ttmRec.value)) {
          ttmVal = ttmRec.value;
        }
      }

      const rowObj = {
        id: mKey,
        metric: mKey,
        label: m.label,
        definition: m.definition || '',
        category: m.category || '',
        citationHtml: exceptionCitation ? exceptionCitation.html : '',
        TTM: ttmVal,
      };

      for (const col of ALL_PERIOD_COLUMNS) {
        rowObj[col] = m.periods[col] !== undefined ? m.periods[col] : null;
      }

      return rowObj;
    });
  }

  function renderStatementCard(title, statementKey) {
    return `
      <div class="historical-statement-card">
        <div class="statement-card-header">
          ${title}
        </div>
        <div class="tabulator-grid-container financial-table" data-statement="${statementKey}"></div>
      </div>
    `;
  }

  function render() {
    if (!currentHistorical) return;
    citationRegistry.length = 0;

    // Destroy existing instances before rebuilding
    for (const inst of tabulatorInstances) {
      if (inst && typeof inst.destroy === 'function') {
        try { inst.destroy(); } catch { /* ignore */ }
      }
    }
    tabulatorInstances.length = 0;
    tabulatorConfigs.length = 0;

    // Income Statement
    const incomeRows = extractRows(currentHistorical.income) || [];
    const incomePrimaries = deriveColumnPrimaryCitations(incomeRows);
    for (const p of ALL_PERIOD_COLUMNS) {
      if (incomePrimaries[p]) {
        const cit = collectCitation(incomePrimaries[p], `Income Statement; ${p} Primary Filing`);
        incomePrimaries[p].citationHtml = cit.html;
      }
    }
    const incomeData = buildStatementData(currentHistorical.income, true, false, incomePrimaries);
    const incomeCols = buildTabulatorColumns(false, incomePrimaries);
    const incomeConfig = {
      statement: 'income',
      data: incomeData,
      columns: incomeCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(incomeConfig);

    // Balance Sheet
    const balanceRows = extractRows(currentHistorical.balance) || [];
    const balancePrimaries = deriveColumnPrimaryCitations(balanceRows);
    for (const p of ALL_PERIOD_COLUMNS) {
      if (balancePrimaries[p]) {
        const cit = collectCitation(balancePrimaries[p], `Balance Sheet; ${p} Primary Filing`);
        balancePrimaries[p].citationHtml = cit.html;
      }
    }
    const balanceData = buildStatementData(currentHistorical.balance, false, false, balancePrimaries);
    const balanceCols = buildTabulatorColumns(false, balancePrimaries);
    const balanceConfig = {
      statement: 'balance',
      data: balanceData,
      columns: balanceCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(balanceConfig);

    // Cash Flow Statement
    const cashflowRows = extractRows(currentHistorical.cashflow) || [];
    const cashflowPrimaries = deriveColumnPrimaryCitations(cashflowRows);
    for (const p of ALL_PERIOD_COLUMNS) {
      if (cashflowPrimaries[p]) {
        const cit = collectCitation(cashflowPrimaries[p], `Cash Flow Statement; ${p} Primary Filing`);
        cashflowPrimaries[p].citationHtml = cit.html;
      }
    }
    const cashflowData = buildStatementData(currentHistorical.cashflow, true, false, cashflowPrimaries);
    const cashflowCols = buildTabulatorColumns(false, cashflowPrimaries);
    const cashflowConfig = {
      statement: 'cashflow',
      data: cashflowData,
      columns: cashflowCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(cashflowConfig);

    // KPIs
    const kpiRows = extractRows(currentHistorical.kpis) || [];
    const kpiPrimaries = deriveColumnPrimaryCitations(kpiRows);
    for (const p of ALL_PERIOD_COLUMNS) {
      if (kpiPrimaries[p]) {
        const cit = collectCitation(kpiPrimaries[p], `KPIs; ${p} Primary Filing`);
        kpiPrimaries[p].citationHtml = cit.html;
      }
    }
    const kpiData = buildStatementData(currentHistorical.kpis, false, true, kpiPrimaries);
    const kpiCols = buildTabulatorColumns(true, kpiPrimaries);
    const kpiConfig = {
      statement: 'kpis',
      data: kpiData,
      columns: kpiCols,
      layout: 'fitDataFill',
      selectableRange: true,
      selectableRangeColumns: true,
      clipboard: true,
      clipboardCopyConfig: { formatCells: false },
      headerSort: false,
      keybindings: true,
    };
    tabulatorConfigs.push(kpiConfig);

    const incomeHtml = renderStatementCard('Income Statement ($ in thousands)', 'income');
    const balanceHtml = renderStatementCard('Balance Sheet ($ in thousands)', 'balance');
    const cashflowHtml = renderStatementCard('Cash Flow Statement ($ in thousands)', 'cashflow');
    const kpiHtml = renderStatementCard('Key Performance Indicators (KPIs)', 'kpis');

    const drawerRows = citationRegistry.map((c) => `
      <tr>
        <td class="table-num-cell">[${c.id}]</td>
        <td>${c.metric}</td>
        <td>${c.statement || ' - '}</td>
        <td>${c.filing} (${c.period})</td>
        <td>${c.accessedAt || ' - '}</td>
        <td><a href="${c.url}" target="_blank" rel="noopener noreferrer" class="source-link">SEC EDGAR Link</a></td>
      </tr>
    `).join('');

    const sourceDrawerHtml = `
      <details class="source-drawer">
        <summary class="drawer-toggle">Audit &amp; Filing Citations Directory (${citationRegistry.length} cited filings)</summary>
        <div class="drawer-content">
          <p class="drawer-intro">100% of historical metrics are transcribed directly from Duolingo, Inc. SEC Form 10-K and Form 10-Q filings with verified SEC EDGAR permalinks under the Accuracy Gate.</p>
          <table class="citation-table">
            <thead>
              <tr>
                <th class="col-narrow">#</th>
                <th>Metric / Line</th>
                <th>Statement</th>
                <th>Filing &amp; Period</th>
                <th>Accessed Date</th>
                <th>SEC Filing Permalink</th>
              </tr>
            </thead>
            <tbody>
              ${drawerRows}
            </tbody>
          </table>
        </div>
      </details>
    `;

    container.innerHTML = `
      <div class="historicals-view-wrapper">
        ${incomeHtml}
        ${balanceHtml}
        ${cashflowHtml}
        ${kpiHtml}
        ${sourceDrawerHtml}
      </div>
    `;

    // Instantiate Tabulator constructor for each statement container
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
    update(newHistorical, newTtm = null) {
      currentHistorical = newHistorical;
      currentTtm = newTtm || (newHistorical ? computeTtm(newHistorical) : null);
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
      citationRegistry.length = 0;
      currentHistorical = null;
      currentTtm = null;
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
    tabulatorInstances,
    tabulatorConfigs,
  };
}

export default renderHistoricals;
