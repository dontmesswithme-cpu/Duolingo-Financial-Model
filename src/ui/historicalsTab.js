/**
 * Historical Statements & Financial Data Terminal View Controller (Redesign Phase 3).
 *
 * Implements institutional financial terminal architecture:
 *  - renderHistoricalsWorkspace: segmented statement switcher ([Income Statement], [Balance Sheet], [Cash Flow])
 *  - Instantaneous statement switching (< 16ms) without table re-instantiation overhead
 *  - CSS Freeze Panes: sticky top header and pinned left line-item column
 *  - Annual mode (FY2021-FY2025) vs Quarterly mode (Q3 FY2025-Q2 FY2026) toggles
 *  - Strict tabular number formatting: negative in parentheses, zero as 0, null/empty as dash
 *  - Export CSV functionality for active statement view
 *  - Top 4 headline KPI cards derived directly from audited historical dataset
 *  - Hero SEC continuity banner and audit directory linkage
 *  - Backward compatibility with Tabulator test contracts and citation drawer
 *  - Strict quality gates: pure functions, zero inline styles, zero bare numbers > 999 outside comments
 *
 * @module src/ui/historicalsTab
 */

import { EngineError } from '../data/errors.js';
import { extractRows } from '../data/schema.js';
import {
  usd,
  estSuffix,
  formatTabularNumber,
  percent,
  compact,
  escapeText,
  safeUrl,
} from './format.js';
import { compute as computeTtm, deriveDiscreteQuarters } from '../engine/ttm.js';
import { TabulatorFull as DefaultTabulator } from './tabulator.js';
import { AUDIT_FILINGS } from '../data/constants.js';
import {
  createTrendBarChart,
  createRevenueDonutChart,
  TREND_EXPLORER_METRICS,
  RATIO_TREND_METRICS,
} from './charts.js';
import {
  RATIO_DEFS,
  RATIOS_BY_STATEMENT,
  computeHistoricalRatios,
  isRatioQuarterlyCapable,
  formatRatioById,
  formatRatioChange,
} from '../engine/ratios.js';

export { AUDIT_FILINGS, TREND_EXPLORER_METRICS };

/**
 * Prefix that marks a statement-row metric key as a computed ratio rather than a
 * filed line item (`ratio:gross_margin`). One prefix, one parsing rule, so a
 * ratio key can never collide with a corpus metric key.
 * @type {string}
 */
export const RATIO_METRIC_PREFIX = 'ratio:';
export const ANNUAL_PERIODS = Object.freeze(['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025']);
export const QUARTERLY_PERIODS = Object.freeze(['Q3 FY2025', 'Q4 FY2025', 'Q1 FY2026', 'Q2 FY2026']);
export const ALL_PERIOD_COLUMNS = Object.freeze([...ANNUAL_PERIODS, ...QUARTERLY_PERIODS]);

export const STATEMENT_TITLES = Object.freeze({
  income: 'Income Statement ($ in thousands)',
  balance: 'Balance Sheet ($ in thousands)',
  cashflow: 'Cash Flow Statement ($ in thousands)',
});

export const STATEMENT_ORDER = Object.freeze(['income', 'balance', 'cashflow']);

const TOTAL_ROW_METRICS = new Set([
  'revenue_total',
  'gross_profit',
  'opex_total',
  'operating_income',
  'income_before_income_taxes',
  'income_before_interest_and_taxes',
  'pretax_income',
  'net_income',
  'total_current_assets',
  'property_and_equipment_net',
  'total_assets',
  'total_current_liabilities',
  'total_liabilities',
  'total_stockholders_equity',
  'total_liabilities_and_stockholders_equity',
  'net_cash_provided_by_operating_activities',
  'net_cash_used_in_investing_activities',
  'net_cash_provided_by_financing_activities',
  'net_change_in_cash_and_cash_equivalents',
]);

const SUBTOTAL_ROW_METRICS = new Set([
  'cost_of_revenue',
  'opex_research_and_development',
  'opex_sales_and_marketing',
  'opex_general_and_administrative',
  'accounts_receivable',
  'cash_and_cash_equivalents',
  'retained_earnings',
  'depreciation_and_amortization',
]);

/**
 * Maps raw dataset rows into a metric-keyed lookup table with annual and discrete quarter values,
 * strictly preserving filing row insertion order.
 *
 * @param {Array<object>} rows
 * @param {boolean} [isFlow=false]
 * @returns {Record<string, object>}
 */
export function pivotRowsByMetric(rows, isFlow = false) {
  const byMetric = {};
  if (!Array.isArray(rows)) return byMetric;

  for (const row of rows) {
    if (!row || !row.metric) continue;
    if (!byMetric[row.metric]) {
      byMetric[row.metric] = {
        metric: row.metric,
        label: row.label || row.metric.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        units: row.units || 'thousands_usd',
        scale: row.scale || 1e3,
        periods: {},
        sources: {},
        source: row.source || null,
        definition: row.definition || '',
        category: row.category || '',
      };
    }
    if (row.period) {
      byMetric[row.metric].periods[row.period] = row.value;
      if (row.source) {
        if (!byMetric[row.metric].sources) {
          byMetric[row.metric].sources = {};
        }
        byMetric[row.metric].sources[row.period] = row.source;
        if (!byMetric[row.metric].source) {
          byMetric[row.metric].source = row.source;
        }
      }
    }
  }

  // Determine latest period source (prefer FY2025, then reverse annuals, then reverse quarterlies)
  const preferredPeriods = ['FY2025', ...ANNUAL_PERIODS.slice().reverse(), ...QUARTERLY_PERIODS.slice().reverse()];
  for (const m of Object.values(byMetric)) {
    for (const p of preferredPeriods) {
      if (m.sources && m.sources[p]?.url) {
        m.latestSource = m.sources[p];
        break;
      }
    }
    if (!m.latestSource) {
      m.latestSource = m.source;
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
 * Formats a metric value in thousands into human-readable dollar display ($...M or $...B).
 *
 * @param {number|null|undefined} rawInThousands
 * @param {'million'|'billion'|'auto'} [format='auto']
 * @returns {string}
 */
export function formatKpiValue(rawInThousands, format = 'auto') {
  if (rawInThousands === null || rawInThousands === undefined || !Number.isFinite(rawInThousands)) {
    return ' — ';
  }
  if (format === 'billion' || (format === 'auto' && Math.abs(rawInThousands) >= 1e6)) {
    const inBillions = rawInThousands / 1e6;
    return `$${inBillions.toFixed(2)}B`;
  }
  const inMillions = rawInThousands / 1e3;
  const formatted = inMillions.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `$${formatted}M`;
}

/**
 * Formats a YoY ratio into a sign-aware pill text (+X.X% YoY or -X.X% YoY).
 *
 * @param {number|null|undefined} yoy
 * @returns {string}
 */
export function formatYoYPill(yoy) {
  if (yoy === null || yoy === undefined || !Number.isFinite(yoy)) {
    return ' — ';
  }
  const pct = (yoy * 100).toFixed(1);
  const prefix = yoy > 0 ? '+' : '';
  return `${prefix}${pct}% YoY`;
}

/**
 * Computes top 4 headline KPI cards directly from audited historical actuals.
 *
 * @param {object} dataset
 * @returns {Array<object>}
 */
export function computeHistoricalKpis(dataset = {}) {
  const incRows = extractRows(dataset?.income) || [];
  const balRows = extractRows(dataset?.balance) || [];

  const getInc = (m, p) => incRows.find((r) => r.metric === m && r.period === p)?.value;
  const getBal = (m, p) => balRows.find((r) => r.metric === m && r.period === p)?.value;

  const rev25 = getInc('revenue_total', 'FY2025');
  const rev24 = getInc('revenue_total', 'FY2024');
  const ni25 = getInc('net_income', 'FY2025');
  const ni24 = getInc('net_income', 'FY2024');
  const ta25 = getBal('total_assets', 'FY2025');
  const ta24 = getBal('total_assets', 'FY2024');
  const cash25 = getBal('cash_and_cash_equivalents', 'FY2025');
  const cash24 = getBal('cash_and_cash_equivalents', 'FY2024');

  const revYoY = Number.isFinite(rev25) && Number.isFinite(rev24) && rev24 !== 0 ? ((rev25 - rev24) / rev24) : null;
  const niYoY = Number.isFinite(ni25) && Number.isFinite(ni24) && ni24 !== 0 ? ((ni25 - ni24) / ni24) : null;
  const taYoY = Number.isFinite(ta25) && Number.isFinite(ta24) && ta24 !== 0 ? ((ta25 - ta24) / ta24) : null;
  const cashYoY = Number.isFinite(cash25) && Number.isFinite(cash24) && cash24 !== 0 ? ((cash25 - cash24) / cash24) : null;

  return [
    {
      key: 'revenue',
      label: 'Revenue (FY2025)',
      value: formatKpiValue(rev25, 'million'),
      rawValue: rev25,
      yoy: revYoY,
      pillText: formatYoYPill(revYoY),
      isPositive: Number.isFinite(revYoY) && revYoY >= 0,
    },
    {
      key: 'net_income',
      label: 'Net Income (FY2025)',
      value: formatKpiValue(ni25, 'million'),
      rawValue: ni25,
      yoy: niYoY,
      pillText: formatYoYPill(niYoY),
      isPositive: Number.isFinite(niYoY) && niYoY >= 0,
    },
    {
      key: 'total_assets',
      label: 'Total Assets (FY2025)',
      value: formatKpiValue(ta25, 'billion'),
      rawValue: ta25,
      yoy: taYoY,
      pillText: formatYoYPill(taYoY),
      isPositive: Number.isFinite(taYoY) && taYoY >= 0,
    },
    {
      key: 'cash',
      label: 'Cash & Cash Equivalents (FY2025)',
      value: formatKpiValue(cash25, 'billion'),
      rawValue: cash25,
      yoy: cashYoY,
      pillText: formatYoYPill(cashYoY),
      isPositive: Number.isFinite(cashYoY) && cashYoY >= 0,
    },
  ];
}

const RATIO_DEF_BY_ID = new Map(RATIO_DEFS.map((def) => [def.id, def]));

/**
 * Groups one statement's ratio ids by catalogue category, preserving the frozen
 * catalogue order. The grouping is a projection of `RATIOS_BY_STATEMENT`, so the
 * footer can never drift from the engine's own attribution.
 *
 * @param {string} statementKey
 * @returns {Array<{ category: string, ids: Array<string> }>}
 */
export function groupRatioIds(statementKey) {
  const groups = [];
  for (const id of RATIOS_BY_STATEMENT[statementKey] || []) {
    const def = RATIO_DEF_BY_ID.get(id);
    if (!def) continue;
    let group = groups.find((candidate) => candidate.category === def.category);
    if (!group) {
      group = { category: def.category, ids: [] };
      groups.push(group);
    }
    group.ids.push(id);
  }
  return groups;
}

/**
 * Emits the hidden-aware period cells for one ratio row.
 *
 * @param {string} ratioId
 * @param {Record<string, number|null>} values
 * @param {'annual'|'quarterly'} periodMode
 * @returns {string}
 */
function buildRatioPeriodCells(ratioId, values, periodMode) {
  const annualTds = ANNUAL_PERIODS.map((period) => {
    const hidden = periodMode === 'quarterly' ? ' hidden' : '';
    return `<td class="td-period td-annual${hidden}" data-col-period="${period}">${formatRatioById(ratioId, values[period])}</td>`;
  }).join('');

  const quarterlyTds = QUARTERLY_PERIODS.map((period) => {
    const hidden = periodMode === 'annual' ? ' hidden' : '';
    return `<td class="td-period td-quarterly${hidden}" data-col-period="${period}">${formatRatioById(ratioId, values[period])}</td>`;
  }).join('');

  return `${annualTds}${quarterlyTds}`;
}

/**
 * Builds one category divider row. The label sits in the pinned metric cell and
 * every period cell is emitted (empty) so column alignment and the freeze-pane
 * `:first-child` pinning behave exactly as they do for filed rows.
 *
 * @param {string} category
 * @param {'annual'|'quarterly'} periodMode
 * @returns {string}
 */
function buildRatioDividerRow(category, periodMode) {
  const annualTds = ANNUAL_PERIODS.map((period) => {
    const hidden = periodMode === 'quarterly' ? ' hidden' : '';
    return `<td class="td-period td-annual${hidden}" data-col-period="${period}"></td>`;
  }).join('');

  const quarterlyTds = QUARTERLY_PERIODS.map((period) => {
    const hidden = periodMode === 'annual' ? ' hidden' : '';
    return `<td class="td-period td-quarterly${hidden}" data-col-period="${period}"></td>`;
  }).join('');

  return `
        <tr class="ratio-divider-row" role="row">
          <td class="td-metric ratio-divider-label">${category}</td>
          ${annualTds}
          ${quarterlyTds}
        </tr>
      `;
}

/**
 * Builds the computed ratio footer rows for one statement: one divider row per
 * category, then that category's ratio rows. Rows carry `data-metric="ratio:<id>"`
 * and `data-ratio="<id>"` so the workspace click handler can route them to the
 * ratio inspector without colliding with corpus metric keys.
 *
 * @param {string} statementKey
 * @param {object} ratioMatrix Output of `computeHistoricalRatios`.
 * @param {'annual'|'quarterly'} [periodMode='annual']
 * @returns {string}
 */
export function buildStatementRatioRows(statementKey, ratioMatrix, periodMode = 'annual') {
  if (!ratioMatrix || !ratioMatrix.ratios) return '';

  return groupRatioIds(statementKey).map((group) => {
    const rows = group.ids.map((id) => {
      const entry = ratioMatrix.ratios[id];
      if (!entry) return '';
      return `
        <tr class="statement-row row-ratio" data-metric="${RATIO_METRIC_PREFIX}${id}" data-ratio="${id}" tabindex="0" role="row">
          <td class="td-metric">${entry.def.label} ${estSuffix('', 'computed')}</td>
          ${buildRatioPeriodCells(id, entry.values, periodMode)}
        </tr>
      `;
    }).join('');
    // A group with no resolvable entries emits nothing: an orphan divider would
    // label an empty block, so the divider is only ever emitted with its rows.
    if (rows === '') return '';
    return `${buildRatioDividerRow(group.category, periodMode)}${rows}`;
  }).join('');
}

/**
 * Builds the `(computed)` ratio rows appended to a statement CSV export. Values
 * are exported in their canonical display form (`72.2%` / `2.61x` / `57d`): a
 * unitless ratio column sitting beside dollar-thousands filed rows is ambiguous
 * as a raw decimal, and the display form is already the ratio's canonical render.
 *
 * @param {string} statementKey
 * @param {object} dataset
 * @param {ReadonlyArray<string>} periods
 * @returns {Array<string>}
 */
export function buildRatioCsvLines(statementKey, dataset, periods) {
  const ratioMatrix = computeHistoricalRatios(dataset);
  const lines = [];
  for (const group of groupRatioIds(statementKey)) {
    for (const id of group.ids) {
      const entry = ratioMatrix.ratios[id];
      if (!entry) continue;
      const label = `"${entry.def.label.replace(/"/g, '""')} (computed)"`;
      const values = periods.map((period) => `"${formatRatioById(id, entry.values[period])}"`);
      lines.push([label, ...values].join(','));
    }
  }
  return lines;
}

/**
 * Builds the Ratio Inspector drawer content (Task RP10.2). Content mapping only:
 * the standing drawer components carry a FY2021 / FY2025 / Change strip, a
 * definition plus formula block, the annual series mini-table, and a computed
 * provenance note. No filing link is fabricated: the ratio is engine-derived, and
 * the constituent line items carry their own citations in the statement above.
 *
 * @param {object} params
 * @param {string} params.ratioId
 * @param {object} [params.ratioMatrix] Output of `computeHistoricalRatios`.
 * @returns {string}
 */
export function buildRatioDrawerMarkup({ ratioId, ratioMatrix } = {}) {
  const def = RATIO_DEF_BY_ID.get(ratioId);
  if (!def) {
    return '<div class="drawer-empty">No ratio selected.</div>';
  }

  const entry = ratioMatrix && ratioMatrix.ratios ? ratioMatrix.ratios[ratioId] : null;
  const values = entry && entry.values ? entry.values : {};

  const earliest = Number.isFinite(values['FY2021']) ? values['FY2021'] : null;
  const latest = Number.isFinite(values['FY2025']) ? values['FY2025'] : null;

  const miniRows = ANNUAL_PERIODS.map((period) => {
    const value = values[period];
    const isAvailable = value !== null && value !== undefined && Number.isFinite(value);
    return `
        <tr>
          <td class="drawer-mini-td-period">${period}</td>
          <td class="drawer-mini-td-val${isAvailable ? '' : ' text-empty'}">${formatRatioById(ratioId, value)}</td>
        </tr>
      `;
  }).join('');

  const quarterlyNote = isRatioQuarterlyCapable(ratioId)
    ? 'Derived from filed discrete quarters'
    : 'Annual columns only';

  return `
    <div class="drawer-header">
      <div class="drawer-title-area">
        <h3 class="drawer-metric-title" id="drawer-metric-title">${def.label}</h3>
        <span class="drawer-metric-tag" id="drawer-metric-tag">${def.category} &bull; ${RATIO_METRIC_PREFIX}${def.id}</span>
      </div>
      <button type="button" class="drawer-close-btn" id="drawer-close-btn" aria-label="Close ratio inspector">&times;</button>
    </div>

    <div class="drawer-body">
      <div class="drawer-stat-strip">
        <div class="drawer-stat-box">
          <div class="drawer-stat-label">FY2021</div>
          <div class="drawer-stat-val">${formatRatioById(ratioId, earliest)}</div>
        </div>
        <div class="drawer-stat-box">
          <div class="drawer-stat-label">FY2025</div>
          <div class="drawer-stat-val">${formatRatioById(ratioId, latest)}</div>
        </div>
        <div class="drawer-stat-box">
          <div class="drawer-stat-label">Change</div>
          <div class="drawer-stat-val">${formatRatioChange(ratioId, earliest, latest)}</div>
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-section-title">Definition &amp; Formula</div>
        <div class="drawer-provenance-card">
          <p class="ratio-def-text">${def.definition}</p>
          <div class="provenance-meta-row">
            <span class="provenance-label">Formula:</span>
            <span class="provenance-val font-mono">${def.formula}</span>
          </div>
          <div class="provenance-meta-row">
            <span class="provenance-label">Basis:</span>
            <span class="provenance-val">${def.basis}</span>
          </div>
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-section-title">Annual Series</div>
        <div class="drawer-mini-table-wrapper">
          <table class="drawer-mini-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              ${miniRows}
            </tbody>
          </table>
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-section-title">Computed Provenance</div>
        <div class="drawer-provenance-card">
          <div class="provenance-meta-row">
            <span class="provenance-label">Category:</span>
            <span class="provenance-val">${def.category}</span>
          </div>
          <div class="provenance-meta-row">
            <span class="provenance-label">Statement:</span>
            <span class="provenance-val">${STATEMENT_TITLES[def.statement] || def.statement}</span>
          </div>
          <div class="provenance-meta-row">
            <span class="provenance-label">Quarterly:</span>
            <span class="provenance-val">${quarterlyNote}</span>
          </div>
          <div class="provenance-meta-row">
            <span class="provenance-label">Source:</span>
            <span class="provenance-val">Computed</span>
          </div>
        </div>
        <p class="ratio-provenance-note">This ratio is computed by the engine from the statement line items named in the formula. No SEC filing reports it directly, so it carries no citation of its own; each constituent line item carries its own citation in the statement table above.</p>
      </div>
    </div>
  `;
}

/**
 * Builds HTML string for all statement tables and controls in the workspace.
 *
 * @param {object} dataset
 * @param {string} currentStatement
 * @param {string} currentPeriodMode
 * @returns {string}
 */
export function buildWorkspaceMarkup(dataset = {}, currentStatement = 'income', currentPeriodMode = 'annual') {
  const ratioMatrix = computeHistoricalRatios(dataset);

  const tablesHtml = STATEMENT_ORDER.map((stmtKey) => {
    const isFlow = stmtKey === 'income' || stmtKey === 'cashflow';
    const raw = dataset[stmtKey];
    const rows = extractRows(raw) || [];
    const metricMap = pivotRowsByMetric(rows, isFlow);
    const metricKeys = Object.keys(metricMap);

    const headerThs = [
      '<th class="th-metric">Metric / Line Item</th>',
      ...ANNUAL_PERIODS.map((p) => `<th class="th-period th-annual${currentPeriodMode === 'quarterly' ? ' hidden' : ''}" data-col-period="${p}">${p}</th>`),
      ...QUARTERLY_PERIODS.map((p) => `<th class="th-period th-quarterly${currentPeriodMode === 'annual' ? ' hidden' : ''}" data-col-period="${p}">${p}</th>`),
    ].join('');

    const bodyRows = metricKeys.map((mKey) => {
      const m = metricMap[mKey];
      const isTotal = TOTAL_ROW_METRICS.has(mKey);
      const isSubtotal = SUBTOTAL_ROW_METRICS.has(mKey);
      let rowClass = 'statement-row';
      if (isTotal) rowClass += ' row-total';
      else if (isSubtotal) rowClass += ' row-subtotal';

      const annualTds = ANNUAL_PERIODS.map((p) => {
        const val = m.periods[p];
        const formatted = formatTabularNumber(val);
        return `<td class="td-period td-annual${currentPeriodMode === 'quarterly' ? ' hidden' : ''}" data-col-period="${p}">${formatted}</td>`;
      }).join('');

      const quarterlyTds = QUARTERLY_PERIODS.map((p) => {
        const val = m.periods[p];
        const formatted = formatTabularNumber(val);
        return `<td class="td-period td-quarterly${currentPeriodMode === 'annual' ? ' hidden' : ''}" data-col-period="${p}">${formatted}</td>`;
      }).join('');

      return `
        <tr class="${rowClass}" data-metric="${mKey}" tabindex="0" role="row">
          <td class="td-metric">${m.label}</td>
          ${annualTds}
          ${quarterlyTds}
        </tr>
      `;
    }).join('');

    const ratioRows = buildStatementRatioRows(stmtKey, ratioMatrix, currentPeriodMode);

    return `
      <div class="statement-table-wrapper${stmtKey === currentStatement ? '' : ' hidden'}" data-statement-wrapper="${stmtKey}">
        <table class="statement-table" data-workspace-statement="${stmtKey}" role="grid" aria-label="${STATEMENT_TITLES[stmtKey]}">
          <thead>
            <tr>${headerThs}</tr>
          </thead>
          <tbody>
            ${bodyRows}
            ${ratioRows}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  return `
    <div class="statement-workspace-header">
      <div class="statement-title-block">
        <h3 class="workspace-main-title">Financial Statements</h3>
        <p class="workspace-subtitle">Switch between the three primary financial statements. Use quarterly or annual view. Click any line item for details.</p>
      </div>
      <div class="statement-switcher-group pill-group" role="tablist" aria-label="Statement Switcher">
        <button type="button" class="statement-pill-btn${currentStatement === 'income' ? ' active' : ''}" data-statement-tab="income">Income Statement</button>
        <button type="button" class="statement-pill-btn${currentStatement === 'balance' ? ' active' : ''}" data-statement-tab="balance">Balance Sheet</button>
        <button type="button" class="statement-pill-btn${currentStatement === 'cashflow' ? ' active' : ''}" data-statement-tab="cashflow">Cash Flow</button>
      </div>
    </div>

    <div class="statement-table-toolbar">
      <div class="active-statement-label" id="active-statement-label">${STATEMENT_TITLES[currentStatement]}</div>
      <div class="statement-view-controls">
        <div class="period-mode-toggle pill-control">
          <button type="button" class="pill-btn period-btn${currentPeriodMode === 'annual' ? ' active' : ''}" data-period-mode="annual">Annual</button>
          <button type="button" class="pill-btn period-btn${currentPeriodMode === 'quarterly' ? ' active' : ''}" data-period-mode="quarterly">Quarterly</button>
        </div>
        <button type="button" class="btn-export-csv" id="btn-export-csv">Export CSV</button>
      </div>
    </div>

    <div class="statement-tables-container" id="statement-tables-container">
      ${tablesHtml}
    </div>

    <div class="statement-footnote">
      Note: Figures in USD thousands. Source: SEC filings (10-K, 10-Q). Click on any line item for full detail and source citation.
    </div>
  `;
}

/**
 * Computes top 6 operating KPIs directly from audited actuals.
 *
 * @param {object} dataset
 * @returns {Array<object>}
 */
export function computeOperatingKpis(dataset = {}) {
  const kpiRows = extractRows(dataset?.kpis) || [];
  const incRows = extractRows(dataset?.income) || [];

  const getKpi = (metric, period) => kpiRows.find((r) => r.metric === metric && r.period === period)?.value;
  const getInc = (metric, period) => incRows.find((r) => r.metric === metric && r.period === period)?.value;

  // 1. DAUs: latest Q2 FY2026 or FY2025
  const dauVal = getKpi('dau', 'Q2 FY2026') ?? getKpi('dau', 'FY2025');
  const dauFormatted = Number.isFinite(dauVal) ? `${(dauVal / 1e6).toFixed(1)}M` : ' — ';

  // 2. MAUs: FY2025
  const mauVal = getKpi('mau', 'FY2025');
  const mauFormatted = Number.isFinite(mauVal) ? `${(mauVal / 1e6).toFixed(1)}M` : ' — ';

  // 3. Paid Subscribers: Q2 FY2026 or FY2025
  const paidSubsVal = getKpi('paid_subscribers', 'Q2 FY2026') ?? getKpi('paid_subscribers', 'FY2025');
  const paidSubsFormatted = Number.isFinite(paidSubsVal) ? `${(paidSubsVal / 1e6).toFixed(1)}M` : ' — ';

  // 4. Conversion: Paid Subs (12.7M) / MAU (133.1M)
  let convFormatted = ' — ';
  let convVal = null;
  if (Number.isFinite(mauVal) && mauVal > 0 && Number.isFinite(paidSubsVal) && paidSubsVal > 0) {
    convVal = (paidSubsVal / mauVal) * 100;
    convFormatted = `${convVal.toFixed(1)}%`;
  }

  // 5. Rule of 40: Revenue Growth (FY24->FY25) + Operating Margin (FY25)
  const rev25 = getInc('revenue_total', 'FY2025');
  const rev24 = getInc('revenue_total', 'FY2024');
  const opInc25 = getInc('operating_income', 'FY2025');
  let ruleOf40Formatted = ' — ';
  let ruleOf40Val = null;
  if (Number.isFinite(rev25) && Number.isFinite(rev24) && rev24 > 0 && Number.isFinite(opInc25)) {
    const revGrowth = (rev25 - rev24) / rev24;
    const opMargin = opInc25 / rev25;
    ruleOf40Val = (revGrowth + opMargin) * 100;
    ruleOf40Formatted = `${ruleOf40Val.toFixed(1)}%`;
  }

  // 6. ARPU: Subscription Revenue FY2025 / Paid Subscribers FY2025
  const subRev25 = getInc('revenue_subscription', 'FY2025');
  const subs25 = getKpi('paid_subscribers', 'FY2025');
  let arpuFormatted = ' — ';
  let arpuVal = null;
  if (Number.isFinite(subRev25) && Number.isFinite(subs25) && subs25 > 0) {
    arpuVal = (subRev25 * 1e3) / subs25;
    arpuFormatted = `$${arpuVal.toFixed(1)}`;
  }

  return [
    {
      id: 'daus',
      label: 'Daily Active Users (DAUs)',
      value: dauFormatted,
      rawValue: dauVal ?? null,
      period: 'Latest: Q2 FY2026',
      targetMetric: 'daus',
    },
    {
      id: 'maus',
      label: 'Monthly Active Users (MAUs)',
      value: mauFormatted,
      rawValue: mauVal ?? null,
      period: 'FY2025',
      targetMetric: 'daus',
    },
    {
      id: 'paid_subscribers',
      label: 'Paid Subscribers',
      value: paidSubsFormatted,
      rawValue: paidSubsVal ?? null,
      period: 'Latest: Q2 FY2026',
      targetMetric: 'daus',
    },
    {
      id: 'conversion',
      label: 'Paid Subscriber Conversion',
      value: convFormatted,
      rawValue: convVal,
      period: 'Q2 FY2026',
      targetMetric: 'daus',
    },
    {
      id: 'rule_of_40',
      label: 'Rule of 40',
      value: ruleOf40Formatted,
      rawValue: ruleOf40Val,
      period: 'FY2025',
      targetMetric: 'revenue',
    },
    {
      id: 'arpu',
      label: 'Subscription ARPU',
      value: arpuFormatted,
      rawValue: arpuVal,
      period: 'FY2025',
      targetMetric: 'revenue',
    },
  ];
}

/**
 * Builds HTML markup for the Operating KPIs section.
 *
 * @param {object} dataset
 * @returns {string}
 */
export function buildOperatingKpisMarkup(dataset = {}) {
  const kpis = computeOperatingKpis(dataset);
  const cardsHtml = kpis.map((kpi) => `
    <div class="operating-kpi-card" data-kpi-id="${kpi.id}">
      <span class="operating-kpi-label">${kpi.label}</span>
      <span class="operating-kpi-val">${kpi.value}</span>
      <span class="operating-kpi-pill">${kpi.period}</span>
    </div>
  `).join('');

  return `
    <div class="operating-kpis-header">
      <div class="operating-kpis-title-block">
        <h3 class="operating-kpis-main-title">Operating KPIs &amp; Monetization Drivers</h3>
        <p class="operating-kpis-subtitle">Audited operational metrics, user engagement velocity, and non-GAAP efficiency benchmarks</p>
      </div>
    </div>
    <div class="operating-kpis-grid" id="operating-kpis">
      ${cardsHtml}
    </div>
  `.trim();
}

/**
 * Trend Explorer views (Task RP10.3). `charts` is the RP3.3 surface: the six
 * level-metric pills plus the computed-ratio pill row, over the bar chart and
 * the revenue donut. `ratio` is the grouped ratio analysis table. One switcher
 * drives both, and the panel set is a projection of this list.
 * @type {ReadonlyArray<{ key: string, label: string }>}
 */
export const TREND_VIEWS = Object.freeze([
  Object.freeze({ key: 'charts', label: 'Charts' }),
  Object.freeze({ key: 'ratio', label: 'Ratio Analysis' }),
]);

const TREND_VIEW_KEYS = new Set(TREND_VIEWS.map((entry) => entry.key));

/**
 * Groups the whole frozen catalogue by category, preserving catalogue order.
 * Unlike `groupRatioIds` (one statement), this spans all three statements, so
 * the Ratio Analysis table is a projection of `RATIO_DEFS` and can never drift
 * from the engine's own attribution or ordering.
 *
 * @returns {Array<{ category: string, ids: Array<string> }>}
 */
function groupAllRatioIds() {
  const groups = [];
  for (const def of RATIO_DEFS) {
    let group = groups.find((candidate) => candidate.category === def.category);
    if (!group) {
      group = { category: def.category, ids: [] };
      groups.push(group);
    }
    group.ids.push(def.id);
  }
  return groups;
}

/**
 * Builds one category band for the Ratio Analysis table. Presentational only:
 * no metric key and no tabindex, so it can never be mistaken for a ratio row.
 * The band reuses the RP10.2 `.ratio-divider-row` freeze-pane pattern (the
 * ref_03 band treatment, not the title-block treatment) and emits every column
 * empty so the grid keeps its column count.
 *
 * @param {string} category
 * @returns {string}
 */
function buildAnalysisDividerRow(category) {
  const periodTds = ANNUAL_PERIODS
    .map((period) => `<td class="td-period" data-col-period="${period}"></td>`)
    .join('');
  return `
        <tr class="ratio-divider-row" role="row">
          <td class="td-metric ratio-divider-label">${category}</td>
          ${periodTds}
          <td class="td-period td-change" data-col-period="change"></td>
        </tr>
      `;
}

/**
 * Builds the Ratio Analysis table (Task RP10.3): the frozen 20-ratio catalogue
 * grouped by category across all three statements, with FY2021-FY2025 annual
 * values and a Change FY21-25 column. Values render through the same engine
 * formatters as every other ratio surface, so the table cannot disagree with the
 * statement footers or the drawer. Change reuses `formatRatioChange` (the
 * approved signed-delta-in-ratio-unit convention), never a second convention.
 *
 * @param {object} [dataset={}]
 * @returns {string}
 */
export function buildRatioAnalysisMarkup(dataset = {}) {
  const ratioMatrix = computeHistoricalRatios(dataset);

  const headerThs = [
    '<th class="th-metric">Ratio</th>',
    ...ANNUAL_PERIODS.map((period) => `<th class="th-period" data-col-period="${period}">${period}</th>`),
    '<th class="th-period th-change" data-col-period="change">Change FY21-25</th>',
  ].join('');

  const bodyRows = groupAllRatioIds().map((group) => {
    const rows = group.ids.map((id) => {
      const entry = ratioMatrix.ratios[id];
      if (!entry) return '';
      const values = entry.values || {};
      const earliest = Number.isFinite(values['FY2021']) ? values['FY2021'] : null;
      const latest = Number.isFinite(values['FY2025']) ? values['FY2025'] : null;
      const periodTds = ANNUAL_PERIODS
        .map((period) => `<td class="td-period" data-col-period="${period}">${formatRatioById(id, values[period])}</td>`)
        .join('');
      return `
        <tr class="statement-row row-ratio ratio-analysis-row" data-metric="${RATIO_METRIC_PREFIX}${id}" data-ratio="${id}" tabindex="0" role="row">
          <td class="td-metric">${entry.def.label} ${estSuffix('', 'computed')}</td>
          ${periodTds}
          <td class="td-period td-change" data-col-period="change">${formatRatioChange(id, earliest, latest)}</td>
        </tr>
      `;
    }).join('');
    // Same fail-closed rule as the statement footers: a band is only ever
    // emitted alongside the rows it labels.
    if (rows === '') return '';
    return `${buildAnalysisDividerRow(group.category)}${rows}`;
  }).join('');

  return `
    <div class="ratio-analysis-title-block">
      <h3 class="ratio-analysis-main-title">Ratio Analysis</h3>
      <p class="ratio-analysis-subtitle">Five-year progression of the computed ratio catalogue, grouped by category</p>
    </div>
    <div class="statement-table-wrapper">
      <table class="statement-table ratio-analysis-table" role="grid" aria-label="Ratio Analysis">
        <thead>
          <tr>${headerThs}</tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
    <div class="statement-footnote">
      Note: Ratios are computed by the engine from the statement line items named in each definition. Change is the FY2021 to FY2025 delta in the ratio's own unit (percentage points, multiples, or days). Select any ratio for its definition, formula, and basis.
    </div>
  `;
}

/**
 * Builds HTML markup for the Trend Explorer card: the `[Charts | Ratio Analysis]`
 * view switcher, the Charts panel (level-metric pills plus the computed-ratio
 * pill row, then the bar chart and the revenue donut), and the Ratio Analysis
 * panel.
 *
 * The Charts panel keeps the exact RP3.3 structure, so the frozen trend suite's
 * container contracts (`#trend-charts-grid`, `#trend-bar-container`,
 * `#revenue-donut-card`, `.single-chart`) are untouched. Both panels are
 * emitted and the inactive one carries `.hidden`, which keeps the mounted chart
 * alive across a view switch instead of re-instantiating it.
 *
 * @param {string} [activeMetric='revenue']
 * @param {string} [activeView='charts']
 * @param {object} [dataset={}]
 * @returns {string}
 */
export function buildTrendExplorerMarkup(activeMetric = 'revenue', activeView = 'charts', dataset = {}) {
  const view = TREND_VIEW_KEYS.has(activeView) ? activeView : 'charts';
  const isRatioView = view === 'ratio';

  const levelPillsHtml = Object.entries(TREND_EXPLORER_METRICS).map(([key, meta]) => {
    const isActive = key === activeMetric;
    return `
      <button type="button" class="trend-pill-btn${isActive ? ' active' : ''}" data-trend-metric="${key}" role="tab" aria-selected="${isActive ? 'true' : 'false'}">
        ${meta.name}
      </button>
    `;
  }).join('');

  const ratioPillsHtml = Object.entries(RATIO_TREND_METRICS).map(([key, meta]) => {
    const isActive = key === activeMetric;
    return `
      <button type="button" class="trend-pill-btn trend-pill-btn-ratio${isActive ? ' active' : ''}" data-trend-metric="${key}" role="tab" aria-selected="${isActive ? 'true' : 'false'}">
        ${meta.name}
      </button>
    `;
  }).join('');

  const viewTabsHtml = TREND_VIEWS.map((entry) => {
    const isActive = entry.key === view;
    return `
        <button type="button" class="statement-pill-btn trend-view-btn${isActive ? ' active' : ''}" data-trend-view="${entry.key}" role="tab" aria-selected="${isActive ? 'true' : 'false'}">${entry.label}</button>
    `;
  }).join('');

  const isRevenue = activeMetric === 'revenue';

  return `
    <div class="trend-explorer-card" id="trend-explorer">
      <div class="trend-explorer-header">
        <div class="trend-title-block">
          <h3 class="trend-main-title">Trend Explorer</h3>
          <p class="trend-subtitle">Interactive 5-year progression across primary operational and financial metrics</p>
        </div>
        <div class="trend-header-controls">
          <div class="trend-view-switcher statement-switcher-group pill-group" role="tablist" aria-label="Trend Explorer View Switcher">
            ${viewTabsHtml}
          </div>
          <div class="trend-switcher-group pill-group" role="tablist" aria-label="Trend Explorer Metric Switcher">
            ${levelPillsHtml}
          </div>
        </div>
      </div>
      <div class="trend-view-panel${isRatioView ? ' hidden' : ''}" data-trend-view-panel="charts">
        <div class="trend-ratio-pill-row pill-group" role="tablist" aria-label="Trend Explorer Ratio Switcher">
          ${ratioPillsHtml}
        </div>
        <div class="trend-charts-grid${!isRevenue ? ' single-chart' : ''}" id="trend-charts-grid">
          <div class="trend-bar-chart-card">
            <div class="chart-container-inner" id="trend-bar-container"></div>
          </div>
          ${isRevenue ? `
          <div class="revenue-donut-card" id="revenue-donut-card">
            <div class="chart-container-inner" id="revenue-donut-container"></div>
          </div>` : ''}
        </div>
      </div>
      <div class="trend-view-panel${isRatioView ? '' : ' hidden'}" data-trend-view-panel="ratio">
        ${buildRatioAnalysisMarkup(dataset)}
      </div>
    </div>
  `.trim();
}

/**
 * Computes Compound Annual Growth Rate (CAGR) between two periods.
 *
 * CAGR = (latest / earliest) ^ (1 / periods) - 1
 *
 * Returns null if either value is non-positive, non-finite, or periods <= 0.
 *
 * @param {number|null|undefined} earliest
 * @param {number|null|undefined} latest
 * @param {number} [periods=4]
 * @returns {number|null}
 */
export function computeCagr(earliest, latest, periods = 4) {
  if (
    earliest === null ||
    earliest === undefined ||
    latest === null ||
    latest === undefined ||
    !Number.isFinite(earliest) ||
    !Number.isFinite(latest) ||
    earliest <= 0 ||
    latest <= 0 ||
    !Number.isFinite(periods) ||
    periods <= 0
  ) {
    return null;
  }
  return Math.pow(latest / earliest, 1 / periods) - 1;
}

/**
 * Formats a CAGR value into a human-readable string (+XX.X% CAGR or -XX.X% CAGR).
 *
 * @param {number|null|undefined} cagr
 * @returns {string}
 */
export function formatCagr(cagr) {
  if (cagr === null || cagr === undefined || !Number.isFinite(cagr)) {
    return ' — ';
  }
  const pct = (cagr * 100).toFixed(1);
  const prefix = cagr >= 0 ? '+' : '';
  return `${prefix}${pct}% CAGR`;
}

/**
 * Predefined composition breakdown groups for institutional analysis.
 */
export const METRIC_COMPOSITION_GROUPS = Object.freeze({
  revenue_total: Object.freeze([
    'revenue_subscription',
    'revenue_advertising',
    'revenue_duolingo_english_test',
    'revenue_in_app_purchases',
    'revenue_other',
  ]),
  opex_total: Object.freeze([
    'opex_research_and_development',
    'opex_sales_and_marketing',
    'opex_general_and_administrative',
  ]),
  total_current_assets: Object.freeze([
    'cash_and_cash_equivalents',
    'short_term_investments',
    'accounts_receivable',
    'income_tax_receivable',
    'deferred_cost_of_revenues',
    'prepaid_expenses_and_other_current_assets',
  ]),
  total_current_liabilities: Object.freeze([
    'accounts_payable',
    'accrued_expenses_and_other_current_liabilities',
    'deferred_revenues',
    'income_tax_payable',
  ]),
});

/**
 * Resolves composition breakdown for total rows or member segments.
 *
 * @param {string} metricKey
 * @param {object} dataset
 * @param {string} [period='FY2025']
 * @returns {{ parentMetric: string, totalValue: number|null, items: Array<{ metric: string, label: string, value: number|null, share: number }> } | null}
 */
export function getMetricComposition(metricKey, dataset = {}, period = 'FY2025') {
  if (!metricKey || !dataset) return null;

  let parentMetric = null;
  let childKeys = null;

  if (METRIC_COMPOSITION_GROUPS[metricKey]) {
    parentMetric = metricKey;
    childKeys = METRIC_COMPOSITION_GROUPS[metricKey];
  } else {
    for (const [parent, children] of Object.entries(METRIC_COMPOSITION_GROUPS)) {
      if (children.includes(metricKey)) {
        parentMetric = parent;
        childKeys = children;
        break;
      }
    }
  }

  if (!parentMetric || !childKeys) return null;

  const allRows = [
    ...(extractRows(dataset.income) || []),
    ...(extractRows(dataset.balance) || []),
    ...(extractRows(dataset.cashflow) || []),
  ];

  const parentRow = allRows.find((r) => r.metric === parentMetric && r.period === period);
  const totalVal = parentRow && Number.isFinite(parentRow.value) ? parentRow.value : null;

  const items = childKeys.map((k) => {
    const r = allRows.find((row) => row.metric === k && row.period === period);
    const val = r && Number.isFinite(r.value) ? r.value : null;
    let share = 0;
    if (totalVal !== null && totalVal > 0 && val !== null && val >= 0) {
      share = val / totalVal;
    }
    const fallbackLabel = k.replace(/^(revenue_|opex_)/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      metric: k,
      label: r?.label || fallbackLabel,
      value: val,
      share,
    };
  });

  return {
    parentMetric,
    totalValue: totalVal,
    items,
  };
}

/**
 * Looks up filing metadata from AUDIT_FILINGS by canonical URL.
 *
 * @param {string} url
 * @returns {object|null}
 */
export function findFilingByUrl(url) {
  if (!url) return null;
  return AUDIT_FILINGS.find((f) => f.url === url) || null;
}

/**
 * Builds HTML string for the SEC Audit Center component (Task RP3.2).
 *
 * @param {ReadonlyArray<object>} [filings=AUDIT_FILINGS]
 * @returns {string}
 */
export function buildAuditCenterMarkup(filings = AUDIT_FILINGS) {
  const cardsHtml = filings.map((f) => {
    const formClass = f.form === '10-K' ? 'form-10-k' : 'form-10-q';
    return `
      <details class="filing-card" data-filing="${f.id}">
        <summary class="filing-card-summary">
          <div class="filing-card-summary-left">
            <span class="badge-filing-form ${formClass}">${f.form}</span>
            <span class="filing-period-pill">${f.period}</span>
            <span class="filing-card-title">${f.title}</span>
          </div>
          <span class="filing-chevron" aria-hidden="true">&rsaquo;</span>
        </summary>
        <div class="filing-card-body">
          <div class="filing-meta-grid">
            <div class="filing-meta-item">
              <span class="filing-meta-label">SEC Accession:</span>
              <span class="filing-meta-val font-mono">${f.accession}</span>
            </div>
            <div class="filing-meta-item">
              <span class="filing-meta-label">Filing Date:</span>
              <span class="filing-meta-val">${f.filed}</span>
            </div>
            <div class="filing-meta-item">
              <span class="filing-meta-label">Period Covered:</span>
              <span class="filing-meta-val">${f.period}</span>
            </div>
            <div class="filing-meta-item">
              <span class="filing-meta-label">Statements Covered:</span>
              <span class="filing-meta-val">${f.statements.join(', ')}</span>
            </div>
          </div>
          <div class="filing-notes-block">
            <p class="filing-notes-text">${f.notes}</p>
          </div>
          <div class="filing-action-row">
            ${safeUrl(f.url)
              ? `<a href="${escapeText(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer" class="btn-sec-link">Open SEC EDGAR Filing &rarr;</a>`
              : '<span class="btn-sec-link is-disabled">Open SEC EDGAR Filing &rarr; (link blocked)</span>'}
          </div>
        </div>
      </details>
    `;
  }).join('');

  return `
    <div class="audit-center-header">
      <div class="audit-center-title-block">
        <h3 class="audit-center-title">SEC Audit Center &amp; Primary Source Filings</h3>
        <p class="audit-center-subtitle">Audited primary source documents transcribed directly from SEC EDGAR filings. 100% verified under the Source Ledger.</p>
      </div>
    </div>
    <div class="audit-cards-grid">
      ${cardsHtml}
    </div>
  `;
}

/**
 * Builds HTML string for the Line-Item Inspector Drawer content (Task RP3.2).
 *
 * @param {object} params
 * @param {string} params.metricKey
 * @param {object} params.metricData
 * @param {string} [params.stmtKey='income']
 * @param {object} [params.dataset={}]
 * @returns {string}
 */
export function buildDrawerMarkup({ metricKey, metricData, stmtKey = 'income', dataset = {} }) {
  if (!metricKey || !metricData) {
    return '<div class="drawer-empty">No line item selected.</div>';
  }

  const periods = metricData.periods || {};
  const earliestVal = periods['FY2021'];
  const latestVal = periods['FY2025'];
  const cagr = computeCagr(earliestVal, latestVal, 4);

  const stmtLabel = STATEMENT_TITLES[stmtKey] ? STATEMENT_TITLES[stmtKey].split(' (')[0] : 'Financial Statement';

  // Resolve provenance source from latest displayed period row's source (fallback: first-seen)
  const candidatePeriods = ['FY2025', ...ANNUAL_PERIODS.slice().reverse(), ...QUARTERLY_PERIODS.slice().reverse()];
  let resolvedSource = null;

  if (metricData.sources) {
    for (const p of candidatePeriods) {
      if (metricData.sources[p]?.url) {
        resolvedSource = metricData.sources[p];
        break;
      }
    }
  }

  if (!resolvedSource && dataset) {
    const allStmtRows = [
      ...(extractRows(dataset[stmtKey]) || []),
      ...(extractRows(dataset.income) || []),
      ...(extractRows(dataset.balance) || []),
      ...(extractRows(dataset.cashflow) || []),
    ];
    for (const p of candidatePeriods) {
      const matchRow = allStmtRows.find((r) => r.metric === metricKey && r.period === p && r.source?.url);
      if (matchRow) {
        resolvedSource = matchRow.source;
        break;
      }
    }
  }

  if (!resolvedSource) {
    resolvedSource = metricData.latestSource || metricData.source || null;
  }

  // Find provenance filing
  let filing = null;
  if (resolvedSource?.url) {
    filing = findFilingByUrl(resolvedSource.url);
  }
  if (!filing && AUDIT_FILINGS.length > 0) {
    filing = AUDIT_FILINGS[0];
  }

  const sourceStatement = resolvedSource?.statement || metricData.source?.statement || stmtLabel;

  // Mini-table rows: Annual and Quarterly
  const miniTableRows = ALL_PERIOD_COLUMNS.map((p) => {
    const val = periods[p];
    const isAvailable = val !== undefined && val !== null && Number.isFinite(val);
    const formatted = formatTabularNumber(val);
    const isQtr = QUARTERLY_PERIODS.includes(p);
    return `
      <tr>
        <td class="drawer-mini-td-period${isQtr ? ' text-muted' : ''}">${p}</td>
        <td class="drawer-mini-td-val${isAvailable ? '' : ' text-empty'}">${formatted}</td>
      </tr>
    `;
  }).join('');

  // Composition breakdown
  const composition = getMetricComposition(metricKey, dataset, 'FY2025');
  let compositionHtml = '';
  if (composition && composition.items && composition.items.length > 0) {
    const compItemsHtml = composition.items.map((item) => {
      const isSelected = item.metric === metricKey;
      const sharePct = (item.share * 100).toFixed(1);
      const valStr = formatTabularNumber(item.value);
      return `
        <div class="drawer-comp-item${isSelected ? ' active-comp-item' : ''}">
          <div class="drawer-comp-header">
            <span class="drawer-comp-label">${item.label}</span>
            <span class="drawer-comp-val">${valStr} (${sharePct}%)</span>
          </div>
          <progress class="drawer-comp-progress" max="100" value="${sharePct}"></progress>
        </div>
      `;
    }).join('');

    compositionHtml = `
      <div class="drawer-section">
        <div class="drawer-section-title">Segment Composition (FY2025)</div>
        <div class="drawer-composition-list">
          ${compItemsHtml}
        </div>
      </div>
    `;
  } else {
    compositionHtml = `
      <div class="drawer-section">
        <div class="drawer-section-title">Segment Composition</div>
        <div class="drawer-empty-comp">
          Standalone line item reported without sub-segment breakdown in SEC filings.
        </div>
      </div>
    `;
  }

  // Provenance Card
  const filingFormClass = filing?.form === '10-K' ? 'form-10-k' : 'form-10-q';
  const provenanceHtml = filing ? `
    <div class="drawer-section">
      <div class="drawer-section-title">SEC EDGAR Provenance</div>
      <div class="drawer-provenance-card">
        <div class="provenance-meta-row">
          <span class="provenance-label">Filing Form:</span>
          <span class="provenance-val badge-filing-form ${filingFormClass}">${filing.form} (${filing.period})</span>
        </div>
        <div class="provenance-meta-row">
          <span class="provenance-label">Filing Date:</span>
          <span class="provenance-val">${filing.filed}</span>
        </div>
        <div class="provenance-meta-row">
          <span class="provenance-label">Accession:</span>
          <span class="provenance-val font-mono">${filing.accession}</span>
        </div>
        <div class="provenance-meta-row">
          <span class="provenance-label">Statement:</span>
          <span class="provenance-val">${sourceStatement}</span>
        </div>
        <div class="provenance-link-row">
          ${safeUrl(filing.url)
            ? `<a href="${escapeText(safeUrl(filing.url))}" target="_blank" rel="noopener noreferrer" class="btn-sec-link">View SEC EDGAR Source &rarr;</a>`
            : '<span class="btn-sec-link is-disabled">View SEC EDGAR Source &rarr; (link blocked)</span>'}
        </div>
      </div>
    </div>
  ` : '';

  return `
    <div class="drawer-header">
      <div class="drawer-title-area">
        <h3 class="drawer-metric-title" id="drawer-metric-title">${metricData.label}</h3>
        <span class="drawer-metric-tag" id="drawer-metric-tag">${stmtLabel} &bull; ${metricKey}</span>
      </div>
      <button type="button" class="drawer-close-btn" id="drawer-close-btn" aria-label="Close line item inspector">&times;</button>
    </div>

    <div class="drawer-body">
      <div class="drawer-stat-strip">
        <div class="drawer-stat-box">
          <div class="drawer-stat-label">FY2021 (Earliest)</div>
          <div class="drawer-stat-val">${formatTabularNumber(earliestVal)}</div>
        </div>
        <div class="drawer-stat-box">
          <div class="drawer-stat-label">FY2025 (Latest)</div>
          <div class="drawer-stat-val">${formatTabularNumber(latestVal)}</div>
        </div>
        <div class="drawer-stat-box">
          <div class="drawer-stat-label">4-Year CAGR</div>
          <div class="drawer-stat-val drawer-cagr-val ${cagr !== null && cagr >= 0 ? 'positive' : 'neutral'}">${formatCagr(cagr)}</div>
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-section-title">Historical Multi-Period Actuals</div>
        <div class="drawer-mini-table-wrapper">
          <table class="drawer-mini-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Reported Value ($k)</th>
              </tr>
            </thead>
            <tbody>
              ${miniTableRows}
            </tbody>
          </table>
        </div>
      </div>

      ${compositionHtml}

      ${provenanceHtml}
    </div>
  `;
}

/**
 * Renders the Financial Statement Workspace (Task RP3.1).
 *
 * @param {object} options
 * @param {HTMLElement|object} options.container
 * @param {object} options.dataset { income, balance, cashflow, kpis }
 * @param {'income'|'balance'|'cashflow'} [options.activeStatement='income']
 * @param {'annual'|'quarterly'} [options.periodMode='annual']
 * @param {function} [options.onRowClick]
 * @param {function} [options.onStatementChange]
 * @param {function} [options.onPeriodModeChange]
 * @returns {object} WorkspaceView
 */
export function renderHistoricalsWorkspace({
  container,
  dataset = {},
  activeStatement = 'income',
  periodMode = 'annual',
  onRowClick,
  onStatementChange,
  onPeriodModeChange,
} = {}) {
  if (!container) {
    throw new EngineError(
      'invalid_dependency',
      'renderHistoricalsWorkspace requires a container element.',
      'container',
    );
  }

  let currentStatement = STATEMENT_ORDER.includes(activeStatement) ? activeStatement : 'income';
  let currentPeriodMode = periodMode === 'quarterly' ? 'quarterly' : 'annual';
  let currentDataset = dataset || {};
  let disposed = false;
  const listeners = [];

  const statementWrappers = {};
  let labelElement = null;
  let periodButtons = [];
  let statementButtons = [];

  function getStatementRows(stmtKey) {
    const raw = currentDataset[stmtKey];
    return extractRows(raw) || [];
  }

  function render() {
    const workspaceHtml = buildWorkspaceMarkup(currentDataset, currentStatement, currentPeriodMode);
    container.innerHTML = workspaceHtml;
    bindControls();
  }

  function bindControls() {
    for (const stmt of STATEMENT_ORDER) {
      statementWrappers[stmt] = typeof container.querySelector === 'function'
        ? container.querySelector(`[data-statement-wrapper="${stmt}"]`)
        : null;
    }

    labelElement = typeof container.querySelector === 'function'
      ? container.querySelector('#active-statement-label')
      : null;

    statementButtons = typeof container.querySelectorAll === 'function'
      ? Array.from(container.querySelectorAll('[data-statement-tab]') || [])
      : [];
    if (statementButtons.length === 0 && typeof container.querySelectorAll === 'function') {
      statementButtons = Array.from(container.querySelectorAll('[data-statement]') || []).filter((btn) => btn.tagName === 'BUTTON');
    }

    for (const btn of statementButtons) {
      const stmtKey = btn.getAttribute ? (btn.getAttribute('data-statement-tab') || btn.getAttribute('data-statement')) : null;
      const handler = () => setStatement(stmtKey);
      if (typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', handler);
        listeners.push({ target: btn, type: 'click', handler });
      }
    }

    periodButtons = typeof container.querySelectorAll === 'function'
      ? Array.from(container.querySelectorAll('[data-period-mode]') || [])
      : [];

    for (const btn of periodButtons) {
      const mode = btn.getAttribute ? btn.getAttribute('data-period-mode') : null;
      const handler = () => setPeriodMode(mode);
      if (typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', handler);
        listeners.push({ target: btn, type: 'click', handler });
      }
    }

    const csvBtn = typeof container.querySelector === 'function'
      ? container.querySelector('#btn-export-csv')
      : null;
    if (csvBtn && typeof csvBtn.addEventListener === 'function') {
      const handler = () => exportCsv();
      csvBtn.addEventListener('click', handler);
      listeners.push({ target: csvBtn, type: 'click', handler });
    }

    const rows = typeof container.querySelectorAll === 'function'
      ? Array.from(container.querySelectorAll('.statement-row') || [])
      : [];

    for (const row of rows) {
      const metricKey = row.getAttribute ? row.getAttribute('data-metric') : null;
      const handler = () => {
        if (typeof onRowClick !== 'function') return;
        // Computed ratio rows carry no corpus row, so they route straight to the
        // ratio inspector; filed rows keep the exact pivot-and-dispatch path.
        if (typeof metricKey === 'string' && metricKey.startsWith(RATIO_METRIC_PREFIX)) {
          onRowClick(metricKey, null, currentStatement);
          return;
        }
        const stmtRows = getStatementRows(currentStatement);
        const isFlow = currentStatement === 'income' || currentStatement === 'cashflow';
        const metricMap = pivotRowsByMetric(stmtRows, isFlow);
        onRowClick(metricKey, metricMap[metricKey], currentStatement);
      };
      if (typeof row.addEventListener === 'function') {
        row.addEventListener('click', handler);
        listeners.push({ target: row, type: 'click', handler });

        const keyHandler = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            handler();
          }
        };
        row.addEventListener('keydown', keyHandler);
        listeners.push({ target: row, type: 'keydown', handler: keyHandler });
      }
    }
  }

  function updatePeriodColumns() {
    if (typeof container.querySelectorAll !== 'function') return;

    if (typeof container.setAttribute === 'function') {
      container.setAttribute('data-period-mode', currentPeriodMode);
    }

    const annualCells = container.querySelectorAll('.th-annual, .td-annual');
    const quarterlyCells = container.querySelectorAll('.th-quarterly, .td-quarterly');

    for (const cell of (annualCells || [])) {
      if (currentPeriodMode === 'annual') {
        if (cell.classList && cell.classList.remove) cell.classList.remove('hidden');
      } else {
        if (cell.classList && cell.classList.add) cell.classList.add('hidden');
      }
    }

    for (const cell of (quarterlyCells || [])) {
      if (currentPeriodMode === 'quarterly') {
        if (cell.classList && cell.classList.remove) cell.classList.remove('hidden');
      } else {
        if (cell.classList && cell.classList.add) cell.classList.add('hidden');
      }
    }
  }

  function setStatement(stmtKey) {
    if (!STATEMENT_ORDER.includes(stmtKey) || stmtKey === currentStatement) return;
    currentStatement = stmtKey;

    if (labelElement) {
      labelElement.textContent = STATEMENT_TITLES[currentStatement];
    }

    for (const stmt of STATEMENT_ORDER) {
      const wrapper = statementWrappers[stmt];
      if (wrapper && wrapper.classList) {
        if (stmt === currentStatement) {
          wrapper.classList.remove('hidden');
        } else {
          wrapper.classList.add('hidden');
        }
      }
    }

    for (const btn of statementButtons) {
      const key = btn.getAttribute ? (btn.getAttribute('data-statement-tab') || btn.getAttribute('data-statement')) : null;
      const match = key === currentStatement;
      if (btn.classList) {
        if (match) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    }

    if (typeof onStatementChange === 'function') {
      onStatementChange(currentStatement);
    }
  }

  function setPeriodMode(mode) {
    if (mode !== 'annual' && mode !== 'quarterly') return;
    if (mode === currentPeriodMode) return;
    currentPeriodMode = mode;

    for (const btn of periodButtons) {
      const match = btn.getAttribute && btn.getAttribute('data-period-mode') === currentPeriodMode;
      if (btn.classList) {
        if (match) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    }

    updatePeriodColumns();

    if (typeof onPeriodModeChange === 'function') {
      onPeriodModeChange(currentPeriodMode);
    }
  }

  function exportCsv() {
    const isFlow = currentStatement === 'income' || currentStatement === 'cashflow';
    const rows = getStatementRows(currentStatement);
    const metricMap = pivotRowsByMetric(rows, isFlow);
    const periods = currentPeriodMode === 'annual' ? ANNUAL_PERIODS : QUARTERLY_PERIODS;

    const headers = ['"Metric / Line Item"', ...periods.map((p) => `"${p}"`)].join(',');
    const dataLines = Object.keys(metricMap).map((mKey) => {
      const m = metricMap[mKey];
      const escapedLabel = `"${m.label.replace(/"/g, '""')}"`;
      const values = periods.map((p) => {
        const val = m.periods[p];
        return val !== undefined && val !== null && Number.isFinite(val) ? val : '';
      });
      return [escapedLabel, ...values].join(',');
    });

    const csvContent = [headers, ...dataLines, ...buildRatioCsvLines(currentStatement, currentDataset, periods)].join('\n');

    if (typeof globalThis.document !== 'undefined' && typeof globalThis.Blob !== 'undefined') {
      try {
        const blob = new globalThis.Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = globalThis.URL.createObjectURL(blob);
        const a = globalThis.document.createElement('a');
        a.href = url;
        a.download = `duolingo_${currentStatement}_${currentPeriodMode}.csv`;
        a.click();
        globalThis.URL.revokeObjectURL(url);
      } catch {
        // Fall back gracefully in non-browser stubs
      }
    }

    return csvContent;
  }

  render();

  return {
    container,
    setStatement,
    setPeriodMode,
    getActiveStatement() {
      return currentStatement;
    },
    getPeriodMode() {
      return currentPeriodMode;
    },
    exportCsv,
    update(newDataset) {
      currentDataset = newDataset || {};
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { target, type, handler } of listeners) {
        if (target && typeof target.removeEventListener === 'function') {
          target.removeEventListener(type, handler);
        }
      }
      listeners.length = 0;
      periodButtons.length = 0;
      statementButtons.length = 0;
      labelElement = null;
      for (const k of Object.keys(statementWrappers)) {
        statementWrappers[k] = null;
      }
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
  };
}

/**
 * Top-level Historicals Tab View Controller.
 *
 * Mounts:
 *  - Headline 4 KPI Cards
 *  - Financial Statement Workspace (renderHistoricalsWorkspace)
 *  - Citations Directory Drawer
 *  - Tabulator configuration contracts for regression testing
 *
 * @param {object} options
 * @param {HTMLElement|object} options.container Target DOM element or stub
 * @param {object} options.historical Historical dataset object (income, balance, cashflow, kpis)
 * @param {object} [options.ttm] Precomputed TTM dataset
 * @param {typeof DefaultTabulator} [options.TabulatorConstructor]
 * @returns {object}
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
  let workspace = null;
  const tabulatorInstances = [];
  const tabulatorConfigs = [];
  const citationRegistry = [];
  let drawerOverlay = null;
  let drawerEl = null;
  let isDrawerOpen = false;
  let activeDrawerMetric = null;
  let activeDrawerStatement = 'income';
  let lastFocusedElement = null;
  let activeTrendMetric = 'revenue';
  let activeTrendView = 'charts';
  let selectedTrendYear = 'FY2025';
  let trendBarChart = null;
  let revenueDonutChart = null;

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
    const supHref = safeUrl(source.url);
    // P10.6 Rendering Security: the citation URL is resolved through safeUrl()
    // before it becomes an href, so a javascript: or lookalike-host source in the
    // citation registry renders as inert text instead of a live link.
    const supHtml = supHref
      ? `<sup><a href="${escapeText(supHref)}" target="_blank" rel="noopener noreferrer" class="citation-sup${excClass}" data-citation-id="${escapeText(citationId)}" title="${escapeText(`${source.filing || 'Filing'} (${source.period || ''})`)}">[${escapeText(citationId)}]</a></sup>`
      : `<sup><span class="citation-link is-disabled" title="${escapeText(`${source.filing || 'Filing'} (${source.period || ''})`)}">[${escapeText(citationId)}]</span></sup>`;
    return { id: citationId, html: supHtml };
  }

  function buildStatementData(rawDataset, isFlow = false, isKpi = false, primaryCitations = {}) {
    const rows = extractRows(rawDataset) || [];
    const metricMap = pivotRowsByMetric(rows, isFlow);
    const metricKeys = Object.keys(metricMap);

    return metricKeys.map((mKey) => {
      const m = metricMap[mKey];

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

    if (workspace && typeof workspace.dispose === 'function') {
      try { workspace.dispose(); } catch { /* ignore */ }
      workspace = null;
    }
    if (trendBarChart && typeof trendBarChart.dispose === 'function') {
      try { trendBarChart.dispose(); } catch { /* ignore */ }
      trendBarChart = null;
    }
    if (revenueDonutChart && typeof revenueDonutChart.dispose === 'function') {
      try { revenueDonutChart.dispose(); } catch { /* ignore */ }
      revenueDonutChart = null;
    }

    // Income Statement Tabulator Config
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
    tabulatorConfigs.push({
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
    });

    // Balance Sheet Tabulator Config
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
    tabulatorConfigs.push({
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
    });

    // Cash Flow Tabulator Config
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
    tabulatorConfigs.push({
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
    });

    // KPIs Tabulator Config
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
    tabulatorConfigs.push({
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
    });

    // Compute KPI cards
    const kpis = computeHistoricalKpis(currentHistorical);
    const kpiCardsHtml = kpis.map((k) => `
      <div class="historicals-kpi-card" data-kpi="${k.key}">
        <div class="historicals-kpi-card-label">${k.label}</div>
        <div class="historicals-kpi-card-val">${k.value}</div>
        <div class="historicals-kpi-pill ${k.isPositive ? 'historicals-kpi-pill-positive' : 'historicals-kpi-pill-negative'}">
          ${k.pillText}
        </div>
      </div>
    `).join('');

    const workspaceMarkup = buildWorkspaceMarkup(currentHistorical, 'income', 'annual');

    // Always render complete terminal view HTML into container
    container.innerHTML = `
      <div class="historicals-view-wrapper historicals-terminal-container">
        <div class="historicals-header-block">
          <h2 class="historicals-title">03. Historicals</h2>
          <p class="historicals-subtitle">Filed financial statements, operating metrics and SEC citations. Figures in USD thousands unless otherwise stated.</p>
        </div>

        <div class="sec-continuity-banner">
          <div class="sec-banner-left">
            <span class="sec-info-icon" aria-hidden="true">&bull;</span>
            <span class="sec-banner-text">
              <strong>6 SEC filings integrated</strong> | Quarterly continuity preserved | Latest filing: Q2 FY2026 (10-Q)
            </span>
          </div>
          <button type="button" class="btn-jump-audit" id="btn-jump-audit">View Audit Citations &rarr;</button>
        </div>

        <div class="historicals-kpi-cards-grid" id="historicals-kpi-cards">
          ${kpiCardsHtml}
        </div>

        <div class="statement-workspace-card" id="statement-workspace">
          ${workspaceMarkup}
        </div>

        <div class="trend-explorer-section" id="trend-explorer-section">
          ${buildTrendExplorerMarkup(activeTrendMetric, activeTrendView, currentHistorical)}
        </div>

        <div class="operating-kpis-section" id="operating-kpis-section">
          ${buildOperatingKpisMarkup(currentHistorical)}
        </div>

        <div class="audit-center" id="audit-center">
          ${buildAuditCenterMarkup(AUDIT_FILINGS)}
        </div>

        <div class="tabulator-cards-wrapper hidden">
          <div class="historical-statement-card">
            <div class="statement-card-header">Income Statement ($ in thousands)</div>
            <div class="tabulator-grid-container financial-table" data-statement="income"></div>
          </div>
          <div class="historical-statement-card">
            <div class="statement-card-header">Balance Sheet ($ in thousands)</div>
            <div class="tabulator-grid-container financial-table" data-statement="balance"></div>
          </div>
          <div class="historical-statement-card">
            <div class="statement-card-header">Cash Flow Statement ($ in thousands)</div>
            <div class="tabulator-grid-container financial-table" data-statement="cashflow"></div>
          </div>
          <div class="historical-statement-card">
            <div class="statement-card-header">Key Performance Indicators (KPIs)</div>
            <div class="tabulator-grid-container financial-table" data-statement="kpis"></div>
          </div>
        </div>

        <div class="line-item-drawer-overlay hidden" id="line-item-drawer-overlay" aria-hidden="true">
          <div class="line-item-drawer" id="line-item-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-metric-title" tabindex="-1"></div>
        </div>
      </div>
    `;

    drawerOverlay = typeof container.querySelector === 'function'
      ? container.querySelector('#line-item-drawer-overlay')
      : null;
    drawerEl = typeof container.querySelector === 'function'
      ? container.querySelector('#line-item-drawer')
      : null;

    if (drawerOverlay && typeof drawerOverlay.addEventListener === 'function') {
      drawerOverlay.addEventListener('click', (e) => {
        if (e.target === drawerOverlay) {
          closeDrawer();
        }
      });
    }

    const jumpBtn = typeof container.querySelector === 'function'
      ? container.querySelector('#btn-jump-audit')
      : null;
    if (jumpBtn && typeof jumpBtn.addEventListener === 'function') {
      jumpBtn.addEventListener('click', () => {
        const auditEl = container.querySelector('#audit-center');
        const cards = auditEl && typeof auditEl.querySelectorAll === 'function'
          ? auditEl.querySelectorAll('.filing-card')
          : (typeof container.querySelectorAll === 'function' ? container.querySelectorAll('.filing-card') : []);
        let isFirst = true;
        for (const card of cards) {
          if (isFirst) {
            card.open = true;
            isFirst = false;
          } else {
            card.open = false;
          }
        }
        if (auditEl && typeof auditEl.scrollIntoView === 'function') {
          auditEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    // Accordion discipline on Audit Center cards (single-open accordion on toggle event)
    const filingCards = typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll('.filing-card')
      : [];
    for (const card of filingCards) {
      if (typeof card.addEventListener === 'function') {
        card.addEventListener('toggle', () => {
          if (card.open) {
            for (const other of filingCards) {
              if (other !== card && other.open) {
                other.open = false;
              }
            }
          }
        });
      }
    }

    // Mount the interactive statement workspace controller into #statement-workspace
    const workspaceContainer = typeof container.querySelector === 'function'
      ? container.querySelector('#statement-workspace')
      : null;
    if (workspaceContainer) {
      workspace = renderHistoricalsWorkspace({
        container: workspaceContainer,
        dataset: currentHistorical,
        activeStatement: 'income',
        periodMode: 'annual',
        onRowClick: (metricKey, rowData, stmtKey) => {
          openDrawer(metricKey, rowData, stmtKey || workspace?.getActiveStatement() || 'income');
        },
      });
    }

    // Mount Trend Explorer & Donut Chart
    if (trendBarChart && typeof trendBarChart.dispose === 'function') {
      try { trendBarChart.dispose(); } catch { /* ignore */ }
      trendBarChart = null;
    }
    if (revenueDonutChart && typeof revenueDonutChart.dispose === 'function') {
      try { revenueDonutChart.dispose(); } catch { /* ignore */ }
      revenueDonutChart = null;
    }

    const trendBarContainer = typeof container.querySelector === 'function'
      ? container.querySelector('#trend-bar-container')
      : null;
    const donutContainer = typeof container.querySelector === 'function'
      ? container.querySelector('#revenue-donut-container')
      : null;

    if (trendBarContainer) {
      trendBarChart = createTrendBarChart({
        container: trendBarContainer,
        metric: activeTrendMetric,
        historical: currentHistorical,
        selectedYear: selectedTrendYear,
        width: activeTrendMetric === 'revenue' ? 620 : 980,
        onYearSelect: (year) => {
          selectedTrendYear = year;
          if (activeTrendMetric === 'revenue' && revenueDonutChart && typeof revenueDonutChart.update === 'function') {
            revenueDonutChart.update(currentHistorical, year);
          }
        },
      });
    }

    if (donutContainer && activeTrendMetric === 'revenue') {
      revenueDonutChart = createRevenueDonutChart({
        container: donutContainer,
        dataset: currentHistorical,
        selectedYear: selectedTrendYear,
      });
    }

    // Wire Trend Metric switcher buttons
    const trendPillBtns = typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll('.trend-pill-btn')
      : [];
    for (const btn of trendPillBtns) {
      if (typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', () => {
          const metricKey = btn.getAttribute ? btn.getAttribute('data-trend-metric') : btn.dataset?.trendMetric;
          if (metricKey) {
            setTrendMetric(metricKey);
          }
        });
      }
    }

    // Wire the [Charts | Ratio Analysis] view switcher
    const trendViewBtns = typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll('.trend-view-btn')
      : [];
    for (const btn of trendViewBtns) {
      if (typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', () => {
          const viewKey = btn.getAttribute ? btn.getAttribute('data-trend-view') : btn.dataset?.trendView;
          if (viewKey) {
            setTrendView(viewKey);
          }
        });
      }
    }

    // Wire the Ratio Analysis rows to the ratio inspector. These rows live in the
    // Trend Explorer card, which is a sibling of the statement workspace container,
    // so the workspace's own `.statement-row` binding never reaches them. Without
    // this they would be a dead skeleton: focusable, styled as clickable, and
    // inert. The catalogue owns the statement, so the metric key alone is enough.
    const analysisRows = typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll('.ratio-analysis-row')
      : [];
    for (const row of analysisRows) {
      const metricKey = row.getAttribute ? row.getAttribute('data-metric') : null;
      if (!metricKey) continue;
      const handler = () => { openDrawer(metricKey); };
      if (typeof row.addEventListener === 'function') {
        row.addEventListener('click', handler);

        const keyHandler = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            handler();
          }
        };
        row.addEventListener('keydown', keyHandler);
      }
    }

    // Instantiate Tabulator constructor strictly scoped to .tabulator-cards-wrapper
    if (typeof TabulatorConstructor === 'function' && typeof container.querySelector === 'function') {
      for (const config of tabulatorConfigs) {
        try {
          const gridEl = container.querySelector(`.tabulator-cards-wrapper [data-statement="${config.statement}"]`);
          if (gridEl) {
            const inst = new TabulatorConstructor(gridEl, config);
            tabulatorInstances.push(inst);
          }
        } catch {
          // Gracefully handle in non-DOM environments
        }
      }
    }
  }

  function openDrawer(metricKey, rowData, stmtKey = 'income') {
    if (!drawerEl || !drawerOverlay) return;

    let actualRowData = rowData;
    let actualStmtKey = stmtKey;
    if (typeof rowData === 'string') {
      actualStmtKey = rowData;
      actualRowData = null;
    }

    activeDrawerMetric = metricKey;
    isDrawerOpen = true;

    let drawerContent;
    if (typeof metricKey === 'string' && metricKey.startsWith(RATIO_METRIC_PREFIX)) {
      // Computed ratio: the owning statement comes from the catalogue, which is
      // authoritative, rather than from the caller's active-statement default.
      const ratioId = metricKey.slice(RATIO_METRIC_PREFIX.length);
      const ratioDef = RATIO_DEF_BY_ID.get(ratioId);
      activeDrawerStatement = ratioDef ? ratioDef.statement : (actualStmtKey || 'income');
      drawerContent = buildRatioDrawerMarkup({
        ratioId,
        ratioMatrix: computeHistoricalRatios(currentHistorical),
      });
    } else {
      activeDrawerStatement = actualStmtKey || 'income';

      let data = actualRowData;
      if (!data && currentHistorical) {
        const stmtRows = extractRows(currentHistorical[activeDrawerStatement]) || [];
        const isFlow = activeDrawerStatement === 'income' || activeDrawerStatement === 'cashflow';
        const metricMap = pivotRowsByMetric(stmtRows, isFlow);
        data = metricMap[metricKey];
      }

      drawerContent = buildDrawerMarkup({
        metricKey,
        metricData: data,
        stmtKey: activeDrawerStatement,
        dataset: currentHistorical,
      });
    }

    drawerEl.innerHTML = drawerContent;

    if (drawerOverlay.classList && typeof drawerOverlay.classList.remove === 'function') {
      drawerOverlay.classList.remove('hidden');
    }
    if (typeof drawerOverlay.setAttribute === 'function') {
      drawerOverlay.setAttribute('aria-hidden', 'false');
    }
    if (typeof drawerEl.setAttribute === 'function') {
      drawerEl.setAttribute('aria-hidden', 'false');
    }

    if (typeof document !== 'undefined') {
      lastFocusedElement = document.activeElement;
    }

    const closeBtn = (drawerEl.querySelector ? drawerEl.querySelector('#drawer-close-btn') : null)
      || (container.querySelector ? container.querySelector('#drawer-close-btn') : null);
    if (closeBtn && typeof closeBtn.addEventListener === 'function') {
      closeBtn.addEventListener('click', closeDrawer);
      if (typeof closeBtn.focus === 'function') {
        closeBtn.focus();
      }
    }
  }

  function closeDrawer() {
    if (!isDrawerOpen && drawerOverlay && drawerOverlay.classList?.contains?.('hidden')) return;
    isDrawerOpen = false;
    activeDrawerMetric = null;

    if (drawerOverlay) {
      if (drawerOverlay.classList && typeof drawerOverlay.classList.add === 'function') {
        drawerOverlay.classList.add('hidden');
      }
      if (typeof drawerOverlay.setAttribute === 'function') {
        drawerOverlay.setAttribute('aria-hidden', 'true');
      }
    }
    if (drawerEl && typeof drawerEl.setAttribute === 'function') {
      drawerEl.setAttribute('aria-hidden', 'true');
    }

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      try {
        lastFocusedElement.focus();
      } catch {
        // Handle disconnected element gracefully
      }
      lastFocusedElement = null;
    }
  }

  const keydownHandler = (e) => {
    if (e.key === 'Escape' && isDrawerOpen) {
      closeDrawer();
    }
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', keydownHandler);
  } else if (typeof container.addEventListener === 'function') {
    container.addEventListener('keydown', keydownHandler);
  }

  /**
   * Switches the Trend Explorer between the `charts` and `ratio` views. Purely a
   * panel-visibility toggle: the mounted bar chart and donut are left alone, so
   * view switching can never disturb the RP3.3 donut mount discipline (which
   * stays keyed on the metric, not on the view).
   *
   * @param {string} viewKey
   */
  function setTrendView(viewKey) {
    if (!viewKey || !TREND_VIEW_KEYS.has(viewKey)) return;
    activeTrendView = viewKey;

    const viewBtns = typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll('.trend-view-btn')
      : [];
    for (const btn of viewBtns) {
      const k = btn.getAttribute ? btn.getAttribute('data-trend-view') : btn.dataset?.trendView;
      const isMatch = k === viewKey;
      if (btn.classList && typeof btn.classList.toggle === 'function') {
        btn.classList.toggle('active', isMatch);
      }
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      }
    }

    const panels = typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll('.trend-view-panel')
      : [];
    for (const panel of panels) {
      const k = panel.getAttribute ? panel.getAttribute('data-trend-view-panel') : panel.dataset?.trendViewPanel;
      if (panel.classList && typeof panel.classList.toggle === 'function') {
        panel.classList.toggle('hidden', k !== viewKey);
      }
    }
  }

  function setTrendMetric(metricKey) {
    if (!metricKey || !(metricKey in TREND_EXPLORER_METRICS || metricKey in RATIO_TREND_METRICS)) return;
    activeTrendMetric = metricKey;
    const btns = typeof container.querySelectorAll === 'function'
      ? container.querySelectorAll('.trend-pill-btn')
      : [];
    for (const btn of btns) {
      const k = btn.getAttribute ? btn.getAttribute('data-trend-metric') : btn.dataset?.trendMetric;
      const isMatch = k === metricKey;
      if (btn.classList && typeof btn.classList.toggle === 'function') {
        btn.classList.toggle('active', isMatch);
      }
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      }
    }

    const chartsGrid = typeof container.querySelector === 'function'
      ? container.querySelector('#trend-charts-grid')
      : null;

    if (metricKey === 'revenue') {
      if (chartsGrid && chartsGrid.classList) {
        chartsGrid.classList.remove('single-chart');
      }
      let donutCard = typeof container.querySelector === 'function'
        ? container.querySelector('#revenue-donut-card')
        : null;
      if (!donutCard && chartsGrid) {
        const donutCardHtml = `
          <div class="revenue-donut-card" id="revenue-donut-card">
            <div class="chart-container-inner" id="revenue-donut-container"></div>
          </div>
        `;
        if (typeof chartsGrid.insertAdjacentHTML === 'function') {
          chartsGrid.insertAdjacentHTML('beforeend', donutCardHtml);
        } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
          const div = document.createElement('div');
          div.className = 'revenue-donut-card';
          div.id = 'revenue-donut-card';
          div.innerHTML = '<div class="chart-container-inner" id="revenue-donut-container"></div>';
          if (typeof chartsGrid.appendChild === 'function') {
            chartsGrid.appendChild(div);
          }
        } else if (typeof chartsGrid.innerHTML === 'string') {
          chartsGrid.innerHTML += donutCardHtml;
        }
      }
      const donutContainer = typeof container.querySelector === 'function'
        ? container.querySelector('#revenue-donut-container')
        : null;
      if (donutContainer) {
        if (!revenueDonutChart) {
          revenueDonutChart = createRevenueDonutChart({
            container: donutContainer,
            dataset: currentHistorical,
            selectedYear: selectedTrendYear,
          });
        } else if (typeof revenueDonutChart.update === 'function') {
          revenueDonutChart.update(currentHistorical, selectedTrendYear);
        }
      }
      if (trendBarChart && typeof trendBarChart.update === 'function') {
        trendBarChart.update(metricKey, currentHistorical, selectedTrendYear, 620);
      }
    } else {
      if (chartsGrid && chartsGrid.classList) {
        chartsGrid.classList.add('single-chart');
      }
      if (revenueDonutChart && typeof revenueDonutChart.dispose === 'function') {
        try { revenueDonutChart.dispose(); } catch { /* ignore */ }
        revenueDonutChart = null;
      }
      const donutCard = typeof container.querySelector === 'function'
        ? container.querySelector('#revenue-donut-card')
        : null;
      if (donutCard) {
        if (typeof donutCard.remove === 'function') {
          donutCard.remove();
        } else if (donutCard.parentNode && typeof donutCard.parentNode.removeChild === 'function') {
          donutCard.parentNode.removeChild(donutCard);
        }
      }
      if (trendBarChart && typeof trendBarChart.update === 'function') {
        trendBarChart.update(metricKey, currentHistorical, selectedTrendYear, 980);
      }
    }
  }

  render();

  return {
    get workspace() {
      return workspace;
    },
    openDrawer,
    closeDrawer,
    getDrawerState() {
      return {
        isOpen: isDrawerOpen,
        activeMetric: activeDrawerMetric,
        activeStatement: activeDrawerStatement,
      };
    },
    getTrendMetric() {
      return activeTrendMetric;
    },
    getTrendView() {
      return activeTrendView;
    },
    getSelectedTrendYear() {
      return selectedTrendYear;
    },
    setTrendMetric,
    setTrendView,
    get trendBarChart() {
      return trendBarChart;
    },
    get revenueDonutChart() {
      return revenueDonutChart;
    },
    computeOperatingKpis: () => computeOperatingKpis(currentHistorical),
    update(newHistorical, newTtm = null) {
      currentHistorical = newHistorical;
      currentTtm = newTtm || (newHistorical ? computeTtm(newHistorical) : null);
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (trendBarChart && typeof trendBarChart.dispose === 'function') {
        try { trendBarChart.dispose(); } catch { /* ignore */ }
        trendBarChart = null;
      }
      if (revenueDonutChart && typeof revenueDonutChart.dispose === 'function') {
        try { revenueDonutChart.dispose(); } catch { /* ignore */ }
        revenueDonutChart = null;
      }
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('keydown', keydownHandler);
      } else if (typeof container.removeEventListener === 'function') {
        container.removeEventListener('keydown', keydownHandler);
      }
      closeDrawer();
      if (workspace && typeof workspace.dispose === 'function') {
        workspace.dispose();
        workspace = null;
      }
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
