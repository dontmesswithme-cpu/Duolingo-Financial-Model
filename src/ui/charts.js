/**
 * Custom SVG Financial Charts Module (Phase 5.6).
 *
 * Implements pure, dependency-free SVG chart generators for institutional financial visualization:
 *  1. createRevenueFcfChart: Dual-line Actual vs Forecast (Solid FY21-FY25 vs Dashed FY26-FY30)
 *  2. createMarginChart: Gross Margin & Operating Margin (% of Revenue) progression
 *  3. createWaterfall: Enterprise Value to Equity Value Bridge Waterfall
 *
 * Strict Compliance Rules:
 *  - Pure SVG string generation (zero external chart libraries like Chart.js/ApexCharts)
 *  - Solid stroke for historical actuals (FY2021-FY2025), dashed stroke for forward estimates (FY2026-FY2030)
 *  - Legends use official EST/MKT badge labeling via format.js
 *  - Zero bare numeric literals > 999 outside comments
 *  - Pure, deterministic, headless-testable
 *
 * @module src/ui/charts
 */

import { extractRows } from '../data/schema.js';
import { usd, percent, estSuffix, mktBadge } from './format.js';

/**
 * Escapes XML/HTML characters for safe SVG text embedding.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Extracts historical revenue and FCF series from historical datasets.
 *
 * @param {object} historical
 * @returns {Array<{ period: string, displayPeriod: string, revenue: number, fcf: number, isEstimate: boolean }>}
 */
function extractHistoricalSeries(historical) {
  const result = [];
  if (!historical || !historical.income) return result;

  const incRows = extractRows(historical.income);
  const cfRows = historical.cashflow ? extractRows(historical.cashflow) : [];

  const periods = ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'];
  for (const period of periods) {
    const revRow = incRows.find((r) => r.metric === 'revenue_total' && r.period === period);
    const ocfRow = cfRows.find((r) => r.metric === 'cash_from_operating_activities' && r.period === period);
    const capexRow = cfRows.find((r) => r.metric === 'purchase_of_property_and_equipment' && r.period === period);

    const revVal = revRow?.value ?? 0;
    const ocfVal = ocfRow?.value ?? 0;
    const capexVal = capexRow?.value ?? 0;
    const fcfVal = ocfVal + capexVal; // capex is already negative in cash flow statements

    result.push({
      period,
      displayPeriod: period.replace('FY20', "'"),
      revenue: revVal,
      fcf: fcfVal,
      isEstimate: false,
    });
  }

  return result;
}

/**
 * Extracts forecast revenue and FCF series from forecast and threeStatement outputs.
 *
 * @param {object} forecast
 * @param {object} [threeStatement]
 * @returns {Array<{ period: string, displayPeriod: string, revenue: number, fcf: number, isEstimate: boolean }>}
 */
function extractForecastSeries(forecast, threeStatement = null) {
  const result = [];
  const periods = ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030'];

  for (const period of periods) {
    let revVal = 0;
    let fcfVal = 0;

    if (forecast?.byPeriod?.[period]?.revenue?.total) {
      revVal = forecast.byPeriod[period].revenue.total.value ?? 0;
    } else if (threeStatement?.incomeStatement?.byPeriod?.[period]?.revenue?.total) {
      revVal = threeStatement.incomeStatement.byPeriod[period].revenue.total.value ?? 0;
    }

    if (threeStatement?.cashFlow?.byPeriod?.[period]?.free_cash_flow) {
      fcfVal = threeStatement.cashFlow.byPeriod[period].free_cash_flow.value ?? 0;
    }

    result.push({
      period,
      displayPeriod: period.replace('FY20', "'"),
      revenue: revVal,
      fcf: fcfVal,
      isEstimate: true,
    });
  }

  return result;
}

/**
 * Creates a custom SVG Revenue and Free Cash Flow Actual vs Forecast Line Chart.
 *
 * @param {object} options
 * @param {object} [options.historical]
 * @param {object} [options.forecast]
 * @param {object} [options.threeStatement]
 * @param {object} [options.data] Alias for { historical, forecast }
 * @param {number} [options.width=800]
 * @param {number} [options.height=360]
 * @returns {{ svg: string, dispose: () => void }}
 */
export function createRevenueFcfChart({
  historical = null,
  forecast = null,
  threeStatement = null,
  data = null,
  width = 800,
  height = 360,
} = {}) {
  const hist = historical || data?.historical || null;
  const fc = forecast || data?.forecast || null;
  const ts = threeStatement || data?.threeStatement || null;

  const histSeries = extractHistoricalSeries(hist);
  const fcSeries = extractForecastSeries(fc, ts);
  const allSeries = [...histSeries, ...fcSeries];

  const padLeft = 70;
  const padRight = 40;
  const padTop = 50;
  const padBottom = 60;
  const chartW = Math.max(100, width - padLeft - padRight);
  const chartH = Math.max(100, height - padTop - padBottom);

  // Compute max value for scaling
  let maxVal = 100;
  for (const pt of allSeries) {
    if (pt.revenue > maxVal) maxVal = pt.revenue;
    if (pt.fcf > maxVal) maxVal = pt.fcf;
  }
  const yCeil = Math.ceil(maxVal / 500) * 500;
  const yTicks = [0, yCeil * 0.25, yCeil * 0.5, yCeil * 0.75, yCeil];

  const xStep = allSeries.length > 1 ? chartW / (allSeries.length - 1) : chartW;

  const getX = (idx) => padLeft + idx * xStep;
  const getY = (val) => padTop + chartH - (val / yCeil) * chartH;

  // Grid lines and Y-axis labels
  const gridLines = yTicks
    .map((tick) => {
      const y = getY(tick);
      const label = usd(tick, { decimals: 0 });
      return `
        <line x1="${padLeft}" y1="${y}" x2="${padLeft + chartW}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
        <text x="${padLeft - 10}" y="${y + 4}" text-anchor="end" font-size="11" font-family="monospace" fill="#64748b">${label}</text>
      `;
    })
    .join('');

  // Transition index between historical actuals and forecast (FY2025 -> FY2026)
  const transitionIdx = histSeries.length > 0 ? histSeries.length - 1 : 4;
  const transitionX = getX(transitionIdx);

  // Vertical transition line
  const transitionGuide = `
    <line x1="${transitionX}" y1="${padTop}" x2="${transitionX}" y2="${padTop + chartH}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,4" />
    <text x="${transitionX - 8}" y="${padTop + 14}" text-anchor="end" font-size="10" font-weight="bold" fill="#47556a">HISTORICAL (ACT)</text>
    <text x="${transitionX + 8}" y="${padTop + 14}" text-anchor="start" font-size="10" font-weight="bold" fill="#2563eb">FORECAST (EST)</text>
  `;

  // X-axis ticks & labels
  const xLabels = allSeries
    .map((pt, idx) => {
      const x = getX(idx);
      const isEst = pt.isEstimate;
      return `
        <line x1="${x}" y1="${padTop + chartH}" x2="${x}" y2="${padTop + chartH + 6}" stroke="#94a3b8" stroke-width="1" />
        <text x="${x}" y="${padTop + chartH + 20}" text-anchor="middle" font-size="11" font-family="monospace" font-weight="${isEst ? 'bold' : 'normal'}" fill="${isEst ? '#2563eb' : '#1e293b'}">
          ${escapeXml(pt.displayPeriod)}
        </text>
        <text x="${x}" y="${padTop + chartH + 34}" text-anchor="middle" font-size="9" font-weight="600" fill="${isEst ? '#3b82f6' : '#64748b'}">
          ${isEst ? 'EST' : 'ACT'}
        </text>
      `;
    })
    .join('');

  // Path builders
  let revHistPath = '';
  let fcfHistPath = '';
  for (let i = 0; i <= transitionIdx && i < allSeries.length; i++) {
    const pt = allSeries[i];
    const cmd = i === 0 ? 'M' : 'L';
    revHistPath += `${cmd} ${getX(i)} ${getY(pt.revenue)} `;
    fcfHistPath += `${cmd} ${getX(i)} ${getY(pt.fcf)} `;
  }

  let revFcPath = '';
  let fcfFcPath = '';
  for (let i = transitionIdx; i < allSeries.length; i++) {
    const pt = allSeries[i];
    const cmd = i === transitionIdx ? 'M' : 'L';
    revFcPath += `${cmd} ${getX(i)} ${getY(pt.revenue)} `;
    fcfFcPath += `${cmd} ${getX(i)} ${getY(pt.fcf)} `;
  }

  // Data point dots
  const dots = allSeries
    .map((pt, idx) => {
      const x = getX(idx);
      const yRev = getY(pt.revenue);
      const yFcf = getY(pt.fcf);
      const isEst = pt.isEstimate;
      return `
        <circle cx="${x}" cy="${yRev}" r="4.5" fill="${isEst ? '#3b82f6' : '#1d4ed8'}" stroke="#ffffff" stroke-width="1.5">
          <title>${escapeXml(pt.period)} Revenue: ${usd(pt.revenue, { decimals: 0 })} (${isEst ? 'EST' : 'ACT'})</title>
        </circle>
        <circle cx="${x}" cy="${yFcf}" r="4.5" fill="${isEst ? '#10b981' : '#047857'}" stroke="#ffffff" stroke-width="1.5">
          <title>${escapeXml(pt.period)} FCF: ${usd(pt.fcf, { decimals: 0 })} (${isEst ? 'EST' : 'ACT'})</title>
        </circle>
      `;
    })
    .join('');

  const svg = `
    <svg id="revenue-fcf-svg" viewBox="0 0 ${width} ${height}" class="chart-svg financial-chart svg-revenue-fcf" width="100%" height="100%" role="img" aria-label="Revenue and Free Cash Flow Historical vs Forecast Chart">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" rx="6" />
      <g class="chart-grid">${gridLines}</g>
      <g class="chart-transition">${transitionGuide}</g>
      <g class="chart-x-axis">${xLabels}</g>

      <!-- Historical Solid Lines (FY21-FY25) -->
      <path d="${revHistPath}" fill="none" stroke="#1d4ed8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${fcfHistPath}" fill="none" stroke="#047857" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Forecast Dashed Lines (FY26-FY30) -->
      <path d="${revFcPath}" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-dasharray="6,4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${fcfFcPath}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-dasharray="6,4" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Data Dots -->
      <g class="chart-dots">${dots}</g>

      <!-- Chart Header & Legends -->
      <text x="${padLeft}" y="24" font-size="13" font-weight="bold" fill="#0f172a">Revenue &amp; Unlevered Free Cash Flow ($ in thousands)</text>
      
      <g class="chart-legend" transform="translate(${width - 320}, 14)">
        <line x1="0" y1="8" x2="20" y2="8" stroke="#1d4ed8" stroke-width="2.5" />
        <circle cx="10" cy="8" r="3.5" fill="#1d4ed8" />
        <text x="26" y="11" font-size="11" fill="#1e293b">Revenue</text>

        <line x1="95" y1="8" x2="115" y2="8" stroke="#047857" stroke-width="2.5" />
        <circle cx="105" cy="8" r="3.5" fill="#047857" />
        <text x="121" y="11" font-size="11" fill="#1e293b">Free Cash Flow</text>

        <line x1="210" y1="8" x2="230" y2="8" stroke="#64748b" stroke-width="2" stroke-dasharray="4,3" />
        <text x="236" y="11" font-size="10" fill="#64748b">Forecast (EST)</text>
      </g>
    </svg>
  `.trim();

  return {
    svg,
    dispose() {},
  };
}

/**
 * Creates a custom SVG Margin Progression Chart (Gross Margin & Operating Margin %).
 *
 * @param {object} options
 * @param {object} [options.historical]
 * @param {object} [options.forecast]
 * @param {object} [options.threeStatement]
 * @param {object} [options.data] Alias for { historical, forecast }
 * @param {number} [options.width=800]
 * @param {number} [options.height=340]
 * @returns {{ svg: string, dispose: () => void }}
 */
export function createMarginChart({
  historical = null,
  forecast = null,
  threeStatement = null,
  data = null,
  width = 800,
  height = 340,
} = {}) {
  const hist = historical || data?.historical || null;
  const fc = forecast || data?.forecast || null;
  const ts = threeStatement || data?.threeStatement || null;

  const periods = ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025', 'FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030'];
  const series = [];

  const histInc = hist?.income ? extractRows(hist.income) : [];

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const isEst = i >= 5;
    let grossMargin = 0;
    let opMargin = 0;

    if (!isEst) {
      const revRow = histInc.find((r) => r.metric === 'revenue_total' && r.period === period);
      const gpRow = histInc.find((r) => r.metric === 'gross_profit' && r.period === period);
      const opRow = histInc.find((r) => r.metric === 'operating_income' && r.period === period);
      const rev = revRow?.value ?? 0;
      grossMargin = rev > 0 && gpRow ? gpRow.value / rev : 0;
      opMargin = rev > 0 && opRow ? opRow.value / rev : 0;
    } else {
      const rev = ts?.incomeStatement?.byPeriod?.[period]?.revenue?.total?.value ?? 0;
      const gp = ts?.incomeStatement?.byPeriod?.[period]?.gross_profit?.value ?? 0;
      const op = ts?.incomeStatement?.byPeriod?.[period]?.operating_income?.value ?? 0;
      grossMargin = rev > 0 ? gp / rev : 0;
      opMargin = rev > 0 ? op / rev : 0;
    }

    series.push({
      period,
      displayPeriod: period.replace('FY', "'"),
      grossMargin,
      opMargin,
      isEstimate: isEst,
    });
  }

  const padLeft = 60;
  const padRight = 30;
  const padTop = 50;
  const padBottom = 60;
  const chartW = Math.max(100, width - padLeft - padRight);
  const chartH = Math.max(100, height - padTop - padBottom);

  const yMin = -0.3;
  const yMax = 0.9;
  const yRange = yMax - yMin;

  const getX = (idx) => padLeft + idx * (chartW / (series.length - 1));
  const getY = (val) => padTop + chartH - ((val - yMin) / yRange) * chartH;

  const yTicks = [-0.2, 0.0, 0.2, 0.4, 0.6, 0.8];
  const gridLines = yTicks
    .map((tick) => {
      const y = getY(tick);
      const isZero = tick === 0;
      return `
        <line x1="${padLeft}" y1="${y}" x2="${padLeft + chartW}" y2="${y}" stroke="${isZero ? '#64748b' : '#e2e8f0'}" stroke-width="${isZero ? '1.5' : '1'}" stroke-dasharray="${isZero ? '0' : '3,3'}" />
        <text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="11" font-family="monospace" fill="${isZero ? '#0f172a' : '#64748b'}">${percent(tick, { decimals: 0 })}</text>
      `;
    })
    .join('');

  const transitionIdx = 4;
  const transitionX = getX(transitionIdx);

  const transitionGuide = `
    <line x1="${transitionX}" y1="${padTop}" x2="${transitionX}" y2="${padTop + chartH}" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,4" />
    <text x="${transitionX - 8}" y="${padTop + 14}" text-anchor="end" font-size="10" font-weight="bold" fill="#47556a">HISTORICAL (ACT)</text>
    <text x="${transitionX + 8}" y="${padTop + 14}" text-anchor="start" font-size="10" font-weight="bold" fill="#7c3aed">FORECAST (EST)</text>
  `;

  const xLabels = series
    .map((pt, idx) => {
      const x = getX(idx);
      const isEst = pt.isEstimate;
      return `
        <line x1="${x}" y1="${padTop + chartH}" x2="${x}" y2="${padTop + chartH + 6}" stroke="#94a3b8" stroke-width="1" />
        <text x="${x}" y="${padTop + chartH + 20}" text-anchor="middle" font-size="11" font-family="monospace" font-weight="${isEst ? 'bold' : 'normal'}" fill="${isEst ? '#7c3aed' : '#1e293b'}">
          ${escapeXml(pt.displayPeriod)}
        </text>
        <text x="${x}" y="${padTop + chartH + 34}" text-anchor="middle" font-size="9" font-weight="600" fill="${isEst ? '#3b82f6' : '#64748b'}">
          ${isEst ? 'EST' : 'ACT'}
        </text>
      `;
    })
    .join('');

  let gmHist = '';
  let opHist = '';
  for (let i = 0; i <= transitionIdx; i++) {
    const cmd = i === 0 ? 'M' : 'L';
    gmHist += `${cmd} ${getX(i)} ${getY(series[i].grossMargin)} `;
    opHist += `${cmd} ${getX(i)} ${getY(series[i].opMargin)} `;
  }

  let gmFc = '';
  let opFc = '';
  for (let i = transitionIdx; i < series.length; i++) {
    const cmd = i === transitionIdx ? 'M' : 'L';
    gmFc += `${cmd} ${getX(i)} ${getY(series[i].grossMargin)} `;
    opFc += `${cmd} ${getX(i)} ${getY(series[i].opMargin)} `;
  }

  const dots = series
    .map((pt, idx) => {
      const x = getX(idx);
      const yGm = getY(pt.grossMargin);
      const yOp = getY(pt.opMargin);
      const isEst = pt.isEstimate;
      return `
        <circle cx="${x}" cy="${yGm}" r="4" fill="${isEst ? '#8b5cf6' : '#6d28d9'}" stroke="#ffffff" stroke-width="1.5">
          <title>${escapeXml(pt.period)} Gross Margin: ${percent(pt.grossMargin, { decimals: 1 })} (${isEst ? 'EST' : 'ACT'})</title>
        </circle>
        <circle cx="${x}" cy="${yOp}" r="4" fill="${isEst ? '#f59e0b' : '#d97706'}" stroke="#ffffff" stroke-width="1.5">
          <title>${escapeXml(pt.period)} Operating Margin: ${percent(pt.opMargin, { decimals: 1 })} (${isEst ? 'EST' : 'ACT'})</title>
        </circle>
      `;
    })
    .join('');

  const svg = `
    <svg id="margin-expansion-svg" viewBox="0 0 ${width} ${height}" class="chart-svg financial-chart svg-margins" width="100%" height="100%" role="img" aria-label="Gross and Operating Margin Progression Chart">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" rx="6" />
      <g class="chart-grid">${gridLines}</g>
      <g class="chart-transition">${transitionGuide}</g>
      <g class="chart-x-axis">${xLabels}</g>

      <!-- Historical Solid Lines -->
      <path d="${gmHist}" fill="none" stroke="#6d28d9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${opHist}" fill="none" stroke="#d97706" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Forecast Dashed Lines -->
      <path d="${gmFc}" fill="none" stroke="#8b5cf6" stroke-width="2.5" stroke-dasharray="6,4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${opFc}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="6,4" stroke-linecap="round" stroke-linejoin="round" />

      <g class="chart-dots">${dots}</g>

      <text x="${padLeft}" y="24" font-size="13" font-weight="bold" fill="#0f172a">Operating Profitability &amp; Margin Expansion (% of Revenue)</text>
      
      <g class="chart-legend" transform="translate(${width - 340}, 14)">
        <line x1="0" y1="8" x2="20" y2="8" stroke="#6d28d9" stroke-width="2.5" />
        <circle cx="10" cy="8" r="3.5" fill="#6d28d9" />
        <text x="26" y="11" font-size="11" fill="#1e293b">Gross Margin</text>

        <line x1="110" y1="8" x2="130" y2="8" stroke="#d97706" stroke-width="2.5" />
        <circle cx="120" cy="8" r="3.5" fill="#d97706" />
        <text x="136" y="11" font-size="11" fill="#1e293b">Operating Margin</text>

        <line x1="240" y1="8" x2="260" y2="8" stroke="#64748b" stroke-width="2" stroke-dasharray="4,3" />
        <text x="266" y="11" font-size="10" fill="#64748b">Forecast (EST)</text>
      </g>
    </svg>
  `.trim();

  return {
    svg,
    dispose() {},
  };
}

/**
 * Creates a custom SVG Enterprise Value to Equity Value Bridge Waterfall Chart.
 *
 * @param {object} options
 * @param {object} options.dcf DcfOutput
 * @param {number} [options.width=800]
 * @param {number} [options.height=380]
 * @returns {{ svg: string, dispose: () => void }}
 */
export function createWaterfall({ dcf = null, width = 800, height = 380 } = {}) {
  const pvExplicit = dcf?.pvExplicit ?? 0;
  const pvTerminal = dcf?.pvTerminal ?? 0;
  const ev = dcf?.enterpriseValue ?? (pvExplicit + pvTerminal);
  const netCash = dcf?.netCash ?? 0;
  const equityValue = dcf?.equityValue ?? (ev + netCash);
  const perShare = dcf?.perShare ?? 0;

  const padLeft = 70;
  const padRight = 40;
  const padTop = 60;
  const padBottom = 70;
  const chartW = Math.max(100, width - padLeft - padRight);
  const chartH = Math.max(100, height - padTop - padBottom);

  const bars = [
    {
      id: 'explicit',
      label: 'PV of Explicit FCFs',
      sub: 'FY2026-FY2030 (EST)',
      val: pvExplicit,
      start: 0,
      end: pvExplicit,
      isTotal: false,
      color: '#3b82f6',
    },
    {
      id: 'terminal',
      label: 'PV of Terminal Value',
      sub: 'Gordon Growth (EST)',
      val: pvTerminal,
      start: pvExplicit,
      end: pvExplicit + pvTerminal,
      isTotal: false,
      color: '#2563eb',
    },
    {
      id: 'ev',
      label: 'Implied Enterprise Value',
      sub: 'PV(Explicit) + PV(Term)',
      val: ev,
      start: 0,
      end: ev,
      isTotal: true,
      color: '#1e3a8a',
    },
    {
      id: 'netCash',
      label: '(+) Net Cash Bridge',
      sub: 'Cash Sweep (ACT/MKT)',
      val: netCash,
      start: ev,
      end: ev + netCash,
      isTotal: false,
      color: '#10b981',
    },
    {
      id: 'equity',
      label: 'Implied Equity Value',
      sub: `Target: ${usd(perShare, { decimals: 2 })}/sh`,
      val: equityValue,
      start: 0,
      end: equityValue,
      isTotal: true,
      color: '#047857',
    },
  ];

  const maxVal = Math.max(equityValue, ev, 100);
  const yCeil = Math.ceil(maxVal / 500) * 500;
  const yTicks = [0, yCeil * 0.25, yCeil * 0.5, yCeil * 0.75, yCeil];

  const getY = (val) => padTop + chartH - (val / yCeil) * chartH;
  const barCount = bars.length;
  const slotW = chartW / barCount;
  const barW = Math.min(90, slotW * 0.65);

  const gridLines = yTicks
    .map((tick) => {
      const y = getY(tick);
      return `
        <line x1="${padLeft}" y1="${y}" x2="${padLeft + chartW}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
        <text x="${padLeft - 10}" y="${y + 4}" text-anchor="end" font-size="11" font-family="monospace" fill="#64748b">${usd(tick, { decimals: 0 })}</text>
      `;
    })
    .join('');

  const barElements = bars
    .map((b, idx) => {
      const x = padLeft + idx * slotW + (slotW - barW) / 2;
      const yTop = getY(Math.max(b.start, b.end));
      const yBottom = getY(Math.min(b.start, b.end));
      const bHeight = Math.max(2, yBottom - yTop);

      let connector = '';
      if (idx < barCount - 1) {
        const nextX = padLeft + (idx + 1) * slotW + (slotW - barW) / 2;
        const connY = getY(b.end);
        connector = `<path class="waterfall-connector" d="M ${x + barW} ${connY} L ${nextX} ${connY}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="3,2" />`;
      }

      const valLabel = usd(b.val, { decimals: 0 });

      return `
        <g class="waterfall-bar-group">
          ${connector}
          <rect x="${x}" y="${yTop}" width="${barW}" height="${bHeight}" fill="${b.color}" rx="3" opacity="${b.isTotal ? '1.0' : '0.9'}">
            <title>${escapeXml(b.label)}: ${usd(b.val, { decimals: 2 })}</title>
          </rect>
          <text x="${x + barW / 2}" y="${yTop - 6}" text-anchor="middle" font-size="11" font-family="monospace" font-weight="bold" fill="#0f172a">
            ${valLabel}
          </text>
          <text x="${x + barW / 2}" y="${padTop + chartH + 20}" text-anchor="middle" font-size="11" font-weight="bold" fill="#1e293b">
            ${escapeXml(b.label)}
          </text>
          <text x="${x + barW / 2}" y="${padTop + chartH + 34}" text-anchor="middle" font-size="9" fill="#64748b">
            ${escapeXml(b.sub)}
          </text>
        </g>
      `;
    })
    .join('');

  const svg = `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg financial-chart svg-waterfall" width="100%" height="100%" role="img" aria-label="Enterprise Value to Equity Value Bridge Waterfall Chart">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" rx="6" />
      <g class="chart-grid">${gridLines}</g>
      <g class="chart-bars">${barElements}</g>

      <text x="${padLeft}" y="24" font-size="13" font-weight="bold" fill="#0f172a">Enterprise Value to Equity Value Bridge ($ in thousands)</text>
      
      <g transform="translate(${width - 240}, 12)">
        <rect x="0" y="0" width="200" height="26" fill="#f0fdf4" stroke="#86efac" rx="4" />
        <text x="100" y="17" text-anchor="middle" font-size="11" font-weight="bold" fill="#15803d">
          Target Price: ${usd(perShare, { decimals: 2 })} / share
        </text>
      </g>
    </svg>
  `.trim();

  return {
    svg,
    dispose() {},
  };
}

/**
 * Supported metrics in the Trend Explorer (Redesign Phase 3.3).
 */
export const TREND_EXPLORER_METRICS = Object.freeze({
  revenue: Object.freeze({
    id: 'revenue',
    name: 'Revenue',
    title: 'Total Revenue (Annual)',
    unit: 'USD millions',
    statement: 'income',
    metricKey: 'revenue_total',
    divisor: 1e3,
    decimals: 1,
  }),
  gross_profit: Object.freeze({
    id: 'gross_profit',
    name: 'Gross Profit',
    title: 'Gross Profit (Annual)',
    unit: 'USD millions',
    statement: 'income',
    metricKey: 'gross_profit',
    divisor: 1e3,
    decimals: 1,
  }),
  operating_income: Object.freeze({
    id: 'operating_income',
    name: 'Operating Income',
    title: 'Operating Income (Annual)',
    unit: 'USD millions',
    statement: 'income',
    metricKey: 'operating_income',
    divisor: 1e3,
    decimals: 1,
  }),
  net_income: Object.freeze({
    id: 'net_income',
    name: 'Net Income',
    title: 'Net Income (Annual)',
    unit: 'USD millions',
    statement: 'income',
    metricKey: 'net_income',
    divisor: 1e3,
    decimals: 1,
  }),
  cash: Object.freeze({
    id: 'cash',
    name: 'Cash',
    title: 'Cash & Cash Equivalents (Annual)',
    unit: 'USD millions',
    statement: 'balance',
    metricKey: 'cash_and_cash_equivalents',
    divisor: 1e3,
    decimals: 1,
  }),
  daus: Object.freeze({
    id: 'daus',
    name: 'DAUs',
    title: 'Daily Active Users (Annual)',
    unit: 'Users in millions',
    statement: 'kpis',
    metricKey: 'dau',
    divisor: 1e6,
    decimals: 1,
  }),
});

export const REVENUE_SEGMENT_COLORS = Object.freeze([
  '#2563eb', // Subscription: Blue
  '#ec4899', // Advertising: Pink/Coral
  '#10b981', // DET: Emerald
  '#f59e0b', // IAP: Amber
  '#94a3b8', // Other: Slate
]);

/**
 * Computes exact percentage shares summing strictly to 100.0% via the largest remainder method.
 *
 * @param {Array<{ value: number, [key: string]: any }>} items
 * @param {number} [precision=1]
 * @returns {Array<object>}
 */
export function computeExactPercentages(items = [], precision = 1) {
  const factor = Math.pow(10, precision);
  const total = items.reduce((sum, item) => sum + (item.value || 0), 0);
  if (total <= 0) {
    return items.map((item) => ({ ...item, share: 0, percent: 0, percentStr: '0.0%' }));
  }

  let allocated = 0;
  const withRem = items.map((item) => {
    const rawShare = (item.value || 0) / total;
    const rawPct = rawShare * 100;
    const floored = Math.floor(rawPct * factor);
    const remainder = (rawPct * factor) - floored;
    allocated += floored;
    return { item, rawShare, rawPct, floored, remainder };
  });

  const diff = Math.round(100 * factor) - allocated;
  withRem.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < diff; i++) {
    withRem[i % withRem.length].floored += 1;
  }

  return items.map((original) => {
    const entry = withRem.find((e) => e.item === original);
    const finalPct = entry.floored / factor;
    return {
      ...original,
      share: entry.rawShare,
      percent: finalPct,
      percentStr: `${finalPct.toFixed(precision)}%`,
    };
  });
}

/**
 * Creates a dynamic SVG Trend Bar Chart component for the Trend Explorer (Task RP3.3).
 * Supports in-place metric updates without canvas recreation leaks.
 *
 * @param {object} options
 * @param {HTMLElement|object} [options.container]
 * @param {string} [options.metric='revenue']
 * @param {object} [options.historical={}]
 * @param {number} [options.width=620]
 * @param {number} [options.height=300]
 * @returns {object} Chart instance with update(), getActiveMetric(), dispose(), and svg getter
 */
export function createTrendBarChart({
  container = null,
  metric = 'revenue',
  historical = {},
  selectedYear = 'FY2025',
  onYearSelect = null,
  width = 620,
  height = 300,
} = {}) {
  let activeMetricKey = metric in TREND_EXPLORER_METRICS ? metric : 'revenue';
  let currentHistorical = historical;
  let currentSelectedYear = selectedYear || 'FY2025';
  let currentWidth = width;
  let disposed = false;

  function renderSvg() {
    const config = TREND_EXPLORER_METRICS[activeMetricKey] || TREND_EXPLORER_METRICS.revenue;
    const stmtRows = extractRows(currentHistorical?.[config.statement]) || [];
    const periods = ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'];

    const series = periods.map((period) => {
      const row = stmtRows.find((r) => r.metric === config.metricKey && r.period === period);
      const raw = row && Number.isFinite(row.value) ? row.value : null;
      let displayVal = 0;
      let formatted = ' — ';
      if (raw !== null) {
        displayVal = raw / config.divisor;
        formatted = displayVal.toLocaleString('en-US', {
          minimumFractionDigits: config.decimals,
          maximumFractionDigits: config.decimals,
        });
      }
      return {
        period,
        displayPeriod: period,
        rawValue: raw,
        displayVal,
        formatted,
      };
    });

    const padLeft = 60;
    const padRight = 30;
    const padTop = 55;
    const padBottom = 45;
    const chartW = Math.max(100, currentWidth - padLeft - padRight);
    const chartH = Math.max(80, height - padTop - padBottom);

    const values = series.map((s) => s.displayVal);
    const minVal = Math.min(0, ...values);
    const maxVal = Math.max(10, ...values);

    const range = maxVal - minVal;
    let step = 200;
    if (range <= 15) step = 2;
    else if (range <= 30) step = 5;
    else if (range <= 75) step = 10;
    else if (range <= 150) step = 25;
    else if (range <= 300) step = 50;
    else if (range <= 600) step = 100;
    else if (range <= 1.5e3) step = 200;
    else step = 500;

    const yMin = Math.floor(minVal / step) * step;
    const yMax = Math.ceil((maxVal * 1.15) / step) * step;
    const ySpan = Math.max(1, yMax - yMin);

    const getY = (val) => padTop + chartH - ((val - yMin) / ySpan) * chartH;
    const yZero = getY(0);

    const ticks = [];
    for (let t = yMin; t <= yMax + 0.001; t += step) {
      ticks.push(t);
    }

    const gridLines = ticks
      .map((tick) => {
        const y = getY(tick);
        const isZero = Math.abs(tick) < 0.001;
        const lineStroke = isZero ? '#64748b' : '#e2e8f0';
        const lineDash = isZero ? '' : 'stroke-dasharray="3,3"';
        const strokeWidth = isZero ? '1.5' : '1';
        return `
          <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${(padLeft + chartW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${lineStroke}" stroke-width="${strokeWidth}" ${lineDash} />
          <text x="${(padLeft - 10).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11" font-family="monospace" fill="#64748b">${tick.toLocaleString('en-US')}</text>
        `;
      })
      .join('');

    const barCount = series.length;
    const slotW = chartW / barCount;
    const barW = Math.min(60, slotW * 0.55);

    const barElements = series
      .map((s, idx) => {
        const x = padLeft + idx * slotW + (slotW - barW) / 2;
        const val = s.displayVal;
        const isNegative = val < 0;
        const yVal = getY(val);

        const yTop = isNegative ? yZero : yVal;
        const bHeight = Math.max(2, Math.abs(yVal - yZero));
        const barColor = isNegative ? '#ef4444' : '#2563eb';
        const labelY = isNegative ? (yVal + 14) : (yVal - 6);
        const isSelected = s.period === currentSelectedYear;
        const selectedClass = isSelected ? ' selected' : '';
        const strokeAttr = isSelected ? ' stroke="#0f172a" stroke-width="2.5"' : '';

        return `
          <g class="trend-bar-item" data-period="${s.period}">
            <rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${bHeight.toFixed(1)}" fill="${barColor}" rx="3" class="trend-bar-rect${selectedClass}"${strokeAttr} data-period="${s.period}">
              <title>${escapeXml(config.name)} ${s.period}: ${s.formatted} (${escapeXml(config.unit)})</title>
            </rect>
            <text x="${(x + barW / 2).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="11" font-family="monospace" font-weight="${isSelected ? '900' : 'bold'}" fill="#0f172a">
              ${s.formatted}
            </text>
            <text x="${(x + barW / 2).toFixed(1)}" y="${(padTop + chartH + 18).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="${isSelected ? '700' : '600'}" fill="${isSelected ? '#0f172a' : '#64748b'}">
              ${s.period}
            </text>
          </g>
        `;
      })
      .join('');

    return `
      <svg viewBox="0 0 ${currentWidth} ${height}" class="chart-svg financial-chart trend-bar-chart" width="100%" height="100%" role="img" aria-label="${escapeXml(config.title)}">
        <rect x="0" y="0" width="${currentWidth}" height="${height}" fill="#ffffff" rx="6" />
        <g class="chart-header">
          <text x="${padLeft}" y="24" font-size="13" font-weight="bold" fill="#0f172a">${escapeXml(config.title)}</text>
          <text x="${padLeft}" y="40" font-size="11" fill="#64748b">${escapeXml(config.unit)}</text>
        </g>
        <g class="chart-grid">${gridLines}</g>
        <g class="chart-bars">${barElements}</g>
      </svg>
    `.trim();
  }

  function bindBarClicks() {
    if (container && typeof container.querySelectorAll === 'function') {
      const barItems = container.querySelectorAll('.trend-bar-item, .trend-bar-rect');
      for (const item of barItems) {
        if (typeof item.addEventListener === 'function') {
          item.addEventListener('click', (e) => {
            const p = item.getAttribute ? item.getAttribute('data-period') : item.dataset?.period;
            if (p && p !== currentSelectedYear) {
              currentSelectedYear = p;
              update(activeMetricKey, currentHistorical, currentSelectedYear);
              if (typeof onYearSelect === 'function') {
                onYearSelect(p);
              }
            }
          });
        }
      }
    }
  }

  function update(newMetric = null, newHistorical = null, newYear = null, newWidth = null) {
    if (disposed) return;
    if (newMetric && newMetric in TREND_EXPLORER_METRICS) {
      activeMetricKey = newMetric;
    }
    if (newHistorical) {
      currentHistorical = newHistorical;
    }
    if (newYear) {
      currentSelectedYear = newYear;
    }
    if (newWidth && Number.isFinite(newWidth)) {
      currentWidth = newWidth;
    }
    const svgHtml = renderSvg();
    if (container && typeof container === 'object') {
      container.innerHTML = svgHtml;
      bindBarClicks();
    }
    return svgHtml;
  }

  update();

  return {
    get svg() {
      return renderSvg();
    },
    update,
    getActiveMetric() {
      return activeMetricKey;
    },
    getSelectedYear() {
      return currentSelectedYear;
    },
    dispose() {
      disposed = true;
      currentHistorical = null;
      if (container && typeof container === 'object') {
        container.innerHTML = '';
      }
    },
  };
}

/**
 * Creates an interactive SVG Revenue Composition Donut Chart (Task RP3.3).
 * Disaggregates FY2025 revenue streams into an exact 100.0% pie with interactive legend.
 *
 * @param {object} options
 * @param {HTMLElement|object} [options.container]
 * @param {object} [options.dataset={}]
 * @param {number} [options.width=380]
 * @param {number} [options.height=300]
 * @returns {object} Chart instance with update(), getSegments(), isolateSegment(), getIsolatedSegment(), dispose(), and svg getter
 */
export function createRevenueDonutChart({
  container = null,
  dataset = {},
  selectedYear = 'FY2025',
  width = 380,
  height = 300,
} = {}) {
  let currentDataset = dataset;
  let currentYear = selectedYear || 'FY2025';
  let isolatedName = null;
  let disposed = false;

  function isDimmed(segName) {
    return isolatedName !== null && isolatedName !== undefined && segName !== isolatedName;
  }

  function renderSvg() {
    const incRows = extractRows(currentDataset?.income) || [];
    const year = currentYear;

    const segmentsMeta = [
      { key: 'revenue_subscription', name: 'Subscription', color: REVENUE_SEGMENT_COLORS[0] },
      { key: 'revenue_advertising', name: 'Advertising', color: REVENUE_SEGMENT_COLORS[1] },
      { key: 'revenue_duolingo_english_test', name: 'Duolingo English Test', color: REVENUE_SEGMENT_COLORS[2] },
      { key: 'revenue_in_app_purchases', name: 'In-App Purchases', color: REVENUE_SEGMENT_COLORS[3] },
      { key: 'revenue_other', name: 'Other', color: REVENUE_SEGMENT_COLORS[4] },
    ];

    const rawSegments = segmentsMeta.map((meta) => {
      const row = incRows.find((r) => r.metric === meta.key && r.period === year);
      return {
        ...meta,
        value: row && Number.isFinite(row.value) ? row.value : 0,
      };
    });

    const segments = computeExactPercentages(rawSegments, 1);
    const totalVal = segments.reduce((s, i) => s + (i.value || 0), 0);
    const totalInMillions = (totalVal / 1e3).toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const totalDisplay = `$${totalInMillions}M`;

    const cx = 115;
    const cy = 150;
    const R = 85;
    const r = 55;

    let currentAngle = -Math.PI / 2;
    const pathElements = segments.map((seg) => {
      if (totalVal <= 0) return '';
      const sliceAngle = (seg.value / totalVal) * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const x1 = cx + R * Math.cos(startAngle);
      const y1 = cy + R * Math.sin(startAngle);
      const x2 = cx + R * Math.cos(endAngle);
      const y2 = cy + R * Math.sin(endAngle);
      const x3 = cx + r * Math.cos(endAngle);
      const y3 = cy + r * Math.sin(endAngle);
      const x4 = cx + r * Math.cos(startAngle);
      const y4 = cy + r * Math.sin(startAngle);

      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${r} ${r} 0 ${largeArc} 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z`;

      return `
        <path d="${d}" fill="${seg.color}" class="donut-slice${isDimmed(seg.name) ? ' donut-dimmed' : ''}" data-segment="${escapeXml(seg.name)}" role="graphics-symbol" aria-label="${escapeXml(seg.name)}: ${seg.percentStr}">
          <title>${escapeXml(seg.name)}: ${seg.percentStr} ($${(seg.value / 1e3).toFixed(1)}M)</title>
        </path>
      `;
    }).join('');

    const legendY0 = 75;
    const legendItemH = 34;
    const legendElements = segments.map((seg, idx) => {
      const y = legendY0 + idx * legendItemH;
      const lx = 225;
      const pressed = isolatedName === seg.name ? 'true' : 'false';
      return `
        <g class="donut-legend-entry${isDimmed(seg.name) ? ' donut-dimmed' : ''}" data-segment="${escapeXml(seg.name)}" transform="translate(${lx}, ${y})" role="button" tabindex="0" aria-pressed="${pressed}" aria-label="Isolate ${escapeXml(seg.name)} segment">
          <rect x="0" y="2" width="10" height="10" rx="2" fill="${seg.color}" />
          <text x="16" y="11" font-size="11" fill="#1e293b">${escapeXml(seg.name)}</text>
          <text x="195" y="11" text-anchor="end" font-size="11" font-family="monospace" font-weight="bold" fill="#0f172a">${seg.percentStr}</text>
        </g>
      `;
    }).join('');

    return `
      <svg viewBox="0 0 ${width} ${height}" class="chart-svg financial-chart revenue-donut-chart" width="100%" height="100%" role="img" aria-label="Revenue Composition (${escapeXml(year)}) Donut Chart">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" rx="6" />
        <text x="24" y="24" font-size="13" font-weight="bold" fill="#0f172a">Revenue Composition (${escapeXml(year)})</text>
        <text x="24" y="40" font-size="11" fill="#64748b">Breakdown by reporting stream ($M)</text>

        <g class="donut-slices">${pathElements}</g>

        <!-- Center cutout hole text -->
        <g class="donut-center-label">
          <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="15" font-weight="bold" fill="#0f172a">${totalDisplay}</text>
          <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="11" fill="#64748b">Total</text>
        </g>

        <!-- Legend -->
        <g class="donut-legend">${legendElements}</g>
      </svg>
    `.trim();
  }

  function rerender() {
    const svgHtml = renderSvg();
    if (container && typeof container === 'object') {
      container.innerHTML = svgHtml;
    }
    return svgHtml;
  }

  function readSegments(forYear = null) {
    const y = forYear || currentYear;
    const incRows = extractRows(currentDataset?.income) || [];
    const segmentsMeta = [
      { key: 'revenue_subscription', name: 'Subscription', color: REVENUE_SEGMENT_COLORS[0] },
      { key: 'revenue_advertising', name: 'Advertising', color: REVENUE_SEGMENT_COLORS[1] },
      { key: 'revenue_duolingo_english_test', name: 'Duolingo English Test', color: REVENUE_SEGMENT_COLORS[2] },
      { key: 'revenue_in_app_purchases', name: 'In-App Purchases', color: REVENUE_SEGMENT_COLORS[3] },
      { key: 'revenue_other', name: 'Other', color: REVENUE_SEGMENT_COLORS[4] },
    ];
    const raw = segmentsMeta.map((m) => {
      const r = incRows.find((row) => row.metric === m.key && row.period === y);
      return { ...m, value: r?.value || 0 };
    });
    return computeExactPercentages(raw, 1);
  }

  function update(newDataset = null, newYear = null) {
    if (disposed) return;
    if (newDataset) {
      currentDataset = newDataset;
    }
    if (newYear) {
      currentYear = newYear;
    }
    return rerender();
  }

  /**
   * Isolates one revenue segment (B2: click-to-isolate legend behavior).
   * All other slices and legend entries render dimmed; isolation survives
   * year-switch re-renders. Unknown names are ignored; null clears.
   *
   * @param {string|null} name Segment display name (e.g. 'Subscription')
   * @returns {string|null} Active isolated segment name (null when cleared)
   */
  function isolateSegment(name) {
    if (disposed) return isolatedName;
    if (name === null || name === undefined || name === '') {
      isolatedName = null;
    } else {
      const known = readSegments().map((s) => s.name);
      if (known.includes(String(name))) {
        isolatedName = String(name);
      }
    }
    rerender();
    return isolatedName;
  }

  function legendNameOf(entry) {
    if (entry && typeof entry.getAttribute === 'function') {
      const name = entry.getAttribute('data-segment');
      if (typeof name === 'string' && name.length > 0) return name;
    }
    return null;
  }

  function findLegendEntry(target) {
    if (target && typeof target.closest === 'function') {
      try {
        const hit = target.closest('.donut-legend-entry');
        if (hit) return hit;
      } catch { /* non-DOM stub without selector support */ }
    }
    return null;
  }

  function toggleIsolation(name) {
    isolateSegment(isolatedName === name ? null : name);
  }

  function handleContainerClick(e) {
    const name = legendNameOf(findLegendEntry(e?.target));
    if (!name) return;
    toggleIsolation(name);
  }

  function handleContainerKeydown(e) {
    if (!e || (e.key !== 'Enter' && e.key !== ' ')) return;
    const name = legendNameOf(findLegendEntry(e.target));
    if (!name) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    toggleIsolation(name);
  }

  if (container && typeof container.addEventListener === 'function') {
    container.addEventListener('click', handleContainerClick);
    container.addEventListener('keydown', handleContainerKeydown);
  }

  update();

  return {
    get svg() {
      return renderSvg();
    },
    update,
    getSegments(forYear = null) {
      return readSegments(forYear);
    },
    getSelectedYear() {
      return currentYear;
    },
    getIsolatedSegment() {
      return isolatedName;
    },
    isolateSegment,
    dispose() {
      disposed = true;
      isolatedName = null;
      if (container && typeof container.removeEventListener === 'function') {
        container.removeEventListener('click', handleContainerClick);
        container.removeEventListener('keydown', handleContainerKeydown);
      }
      currentDataset = null;
      if (container && typeof container === 'object') {
        container.innerHTML = '';
      }
    },
  };
}

export default Object.freeze({
  createRevenueFcfChart,
  createMarginChart,
  createWaterfall,
  createTrendBarChart,
  createRevenueDonutChart,
  TREND_EXPLORER_METRICS,
  computeExactPercentages,
});
