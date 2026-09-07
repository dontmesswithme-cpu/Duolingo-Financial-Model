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
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg financial-chart svg-revenue-fcf" width="100%" height="100%" role="img" aria-label="Revenue and Free Cash Flow Historical vs Forecast Chart">
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
        <text x="${x}" y="${padTop + chartH + 34}" text-anchor="middle" font-size="9" font-weight="600" fill="${isEst ? '#8b5cf6' : '#64748b'}">
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
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg financial-chart svg-margins" width="100%" height="100%" role="img" aria-label="Gross and Operating Margin Progression Chart">
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

export default Object.freeze({
  createRevenueFcfChart,
  createMarginChart,
  createWaterfall,
});
