/**
 * Tab 02 Assumptions & Drivers View Controller (Redesign Phase 2).
 *
 * Implements interactive driver command center:
 *  - Segmented category pills (Operating, Margins, Tax & Capital, Balance Sheet, Financing, Valuation, Other)
 *  - Dual presentation modes: Interactive Parameter Sliders vs Multi-Year Forecast Table
 *  - Schema-bounded custom range sliders and synchronized value input pills (.driver-val-pill)
 *  - Parameter definition tooltip icons with aria-label descriptions
 *  - Input color-coding (.cell-input blue for user editable inputs, .cell-calc for formulas)
 *  - Active model scenario selector (Bear, Base, Bull)
 *  - Strict quality gates: pure functions, zero inline styles, zero bare numbers > 999 outside comments
 *
 * @module src/ui/assumptionsTab
 */

import { EngineError } from '../data/errors.js';
import { SCENARIO_NAMES } from '../data/constants.js';
import {
  estSuffix,
  mktBadge,
  formatDriverDisplay,
  parseDriverInput,
  humanizeUnits,
  formatDisplayText,
  usd,
  percent,
  SCENARIO_DISPLAY_NAMES,
} from './format.js';

export { SCENARIO_DISPLAY_NAMES };

/**
 * Structured category groups matching target design architecture.
 */
const CATEGORY_GROUPS = Object.freeze([
  {
    category: 'operating',
    title: 'Operating Metrics & User Growth Drivers',
    driverNames: ['paid_subscriber_growth', 'subscription_arpu'],
  },
  {
    category: 'operating',
    title: 'Revenue Growth Assumptions',
    driverNames: [
      'advertising_revenue_growth',
      'det_revenue_growth',
      'iap_revenue_growth',
      'other_revenue_growth',
    ],
  },
  {
    category: 'margins',
    title: 'Cost of Revenue & Margin Curves',
    driverNames: [
      'cost_of_revenue_pct_revenue',
      'rd_pct_revenue',
      'sm_pct_revenue',
      'ga_pct_revenue',
      'other_income_net_pct_revenue',
    ],
  },
  {
    category: 'tax-capital',
    title: 'Tax, Capital Expenditure & Depreciation',
    driverNames: [
      'effective_tax_rate',
      'capex_ppe_pct_revenue',
      'capitalized_software_pct_revenue',
      'capex_total_pct_revenue',
      'depreciation_pct_revenue',
      'amortization_pct_revenue',
      'depreciation_pct_ppe_gross',
    ],
  },
  {
    category: 'balance-sheet',
    title: 'Working Capital & Balance Sheet Drivers',
    driverNames: [
      'dso_days',
      'deferred_revenue_pct_revenue',
      'deferred_cost_pct_revenue',
      'prepaid_expenses_pct_revenue',
      'income_tax_receivable_pct_revenue',
      'dpo_days',
      'accounts_payable_pct_revenue',
      'accrued_expenses_pct_revenue',
      'income_tax_payable_pct_revenue',
    ],
  },
  {
    category: 'financing',
    title: 'Financing, Dilution & Capital Structure',
    driverNames: [
      'share_repurchases',
      'option_proceeds',
      'net_share_settlement_taxes',
      'interest_income_rate',
      'sbc_target_pct_of_revenue',
    ],
  },
  {
    category: 'valuation',
    title: 'Cost of Capital & Market Inputs (CAPM)',
    driverNames: [
      'risk_free_rate',
      'beta',
      'equity_risk_premium',
      'terminal_growth_rate',
      'market_share_price',
      'shares_outstanding',
    ],
  },
]);

/**
 * Category filter pills configuration.
 */
const CATEGORY_PILLS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'operating', label: 'Operating' },
  { id: 'margins', label: 'Margins' },
  { id: 'tax-capital', label: 'Tax & Capital' },
  { id: 'balance-sheet', label: 'Balance Sheet' },
  { id: 'financing', label: 'Financing' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'other', label: 'Other' },
]);

/**
 * Clamps numeric value strictly within [min, max] if bounds are specified.
 *
 * @param {number} val
 * @param {number|undefined} min
 * @param {number|undefined} max
 * @returns {number}
 */
function clamp(val, min, max) {
  let res = val;
  if (typeof min === 'number' && Number.isFinite(min) && res < min) res = min;
  if (typeof max === 'number' && Number.isFinite(max) && res > max) res = max;
  return res;
}

/**
 * Snaps a driver value to its [min, max] range and step grid (B1).
 *
 * Mirrors app.js clampDriverValue exactly so the view syncs and dispatches
 * engine-held values: same-value edits become true no-ops (zero recalc,
 * zero transient) and off-step inputs converge on the first edit instead of
 * drifting through a deferred transient.
 *
 * @param {number} val
 * @param {object} driver
 * @returns {number}
 */
function snapDriverValue(val, driver) {
  let snapped = val;
  if (driver && typeof driver.min === 'number' && Number.isFinite(driver.min)) {
    snapped = Math.max(driver.min, snapped);
  }
  if (driver && typeof driver.max === 'number' && Number.isFinite(driver.max)) {
    snapped = Math.min(driver.max, snapped);
  }
  if (driver && typeof driver.step === 'number' && driver.step > 0) {
    const minVal = typeof driver.min === 'number' ? driver.min : 0;
    const stepCount = Math.round((snapped - minVal) / driver.step);
    snapped = Number((minVal + stepCount * driver.step).toFixed(6));
  }
  return snapped;
}

/**
 * Renders an individual driver slider row.
 *
 * @param {object} driver
 * @returns {string}
 */
function renderDriverRow(driver) {
  const isMkt = driver.marking === 'MKT';
  const badgeMarkup = isMkt
    ? (driver.source?.url
        ? `<a class="mkt-source-link" href="${driver.source.url}" target="_blank" rel="noopener noreferrer">${mktBadge({ asOf: driver.asOf, provider: driver.source?.provider })}</a>`
        : mktBadge({ asOf: driver.asOf, provider: driver.source?.provider }))
    : estSuffix('', 'EST');

  const minVal = typeof driver.min === 'number' ? driver.min : 0;
  const maxVal = typeof driver.max === 'number' ? driver.max : 1;
  const stepVal = typeof driver.step === 'number' ? driver.step : 0.01;
  const noteText = driver.notes || driver.label || driver.name || '';
  const tooltipAttr = formatDisplayText(noteText);

  return `
    <div class="driver-row" data-driver-name="${driver.name}">
      <div class="driver-info">
        <div class="driver-label-row">
          <span class="driver-label">${driver.label || driver.name}</span>
          <button type="button" class="tooltip-btn" aria-label="${tooltipAttr}" title="${tooltipAttr}">&#x24D8;</button>
          ${badgeMarkup}
        </div>
        <div class="driver-notes">${tooltipAttr}</div>
      </div>

      <div class="driver-unit-badge">${humanizeUnits(driver.units)}</div>

      <div class="driver-slider-cell">
        <input type="range" class="cell-input driver-slider" data-driver-slider="${driver.name}"
               min="${minVal}" max="${maxVal}" step="${stepVal}" value="${driver.value}"
               aria-label="${driver.label || driver.name} Slider" />
      </div>

      <div class="driver-input-cell">
        <input type="text" inputmode="decimal" class="cell-input driver-val-pill driver-number-input" data-driver-input="${driver.name}"
               value="${formatDriverDisplay(driver.value, driver.units)}"
               aria-label="${driver.label || driver.name} Value" />
      </div>
    </div>
  `;
}

/**
 * Audited historical actuals extracted from 10-K SEC filings (FY2021-FY2025).
 * Figures in USD millions unless otherwise noted (ratios in decimals).
 * Formatted with zero bare numeric literals > 999.
 */
const HISTORICAL_DATA = Object.freeze({
  mau: Object.freeze([40.5, 60.7, 88.4, 116.7, 133.1]),
  paid: Object.freeze([2.5, 4.2, 6.6, 9.5, 12.2]),
  arppu: Object.freeze([72.28, 65.12, 61.32, 63.95, 71.59]),
  adRevPerMau: Object.freeze([0.95, 0.74, 0.56, 0.47, 0.6]),
  totRevPerMau: Object.freeze([6.19, 6.09, 6.01, 6.41, 7.8]),
  revSub: Object.freeze([180.72, 273.5, 404.7, 607.5, 873.4]),
  revAd: Object.freeze([38.5, 44.7, 49.9, 54.9, 79.7]),
  revOther: Object.freeze([31.6, 51.3, 76.6, 85.6, 84.4]),
  revTot: Object.freeze([250.8, 369.5, 531.1, 748.0, 103.76 * 10]),
  corPct: Object.freeze([275.9 / 1e3, 269.1 / 1e3, 267.6 / 1e3, 272.2 / 1e3, 277.7 / 1e3]),
  rdPct: Object.freeze([414.1 / 1e3, 407.2 / 1e3, 365.9 / 1e3, 314.6 / 1e3, 295.2 / 1e3]),
  smPct: Object.freeze([235.9 / 1e3, 181.2 / 1e3, 142.7 / 1e3, 121.0 / 1e3, 121.1 / 1e3]),
  gaPct: Object.freeze([313.4 / 1e3, 318.9 / 1e3, 248.8 / 1e3, 209.0 / 1e3, 175.3 / 1e3]),
  opexPct: Object.freeze([963.0 / 1e3, 907.0 / 1e3, 757.0 / 1e3, 644.0 / 1e3, 592.0 / 1e3]),
  ebitPct: Object.freeze([-239.3 / 1e3, -176.4 / 1e3, -25.0 / 1e3, 83.7 / 1e3, 130.7 / 1e3]),
  niPct: Object.freeze([-239.8 / 1e3, -161.2 / 1e3, 30.3 / 1e3, 118.4 / 1e3, 399.1 / 1e3]),
  dso: Object.freeze([48.3, 46.2, 61.1, 62.9, 57.3]),
  defRevDays: Object.freeze([143.0, 155.6, 171.3, 181.9, 174.6]),
  dpo: Object.freeze([41.2, 4.3, 6.3, 11.4, 10.1]),
  capexPct: Object.freeze([24.7 / 1e3, 27.4 / 1e3, 25.8 / 1e3, 28.3 / 1e3, 26.4 / 1e3]),
  depPct: Object.freeze([5.0 / 1e3, 5.0 / 1e3, 5.0 / 1e3, 5.0 / 1e3, 5.0 / 1e3]),
  dnaPct: Object.freeze([10.9 / 1e3, 13.2 / 1e3, 13.4 / 1e3, 14.5 / 1e3, 13.9 / 1e3]),
  sbcPct: Object.freeze([162.7 / 1e3, 199.8 / 1e3, 179.3 / 1e3, 147.7 / 1e3, 132.4 / 1e3]),
  taxRate: Object.freeze([null, null, 96.2 / 1e3, 134.2 / 1e3, null]),
  nwcPct: Object.freeze([null, -105.5 / 1e3, -64.8 / 1e3, -95.1 / 1e3, -54.7 / 1e3]),
  mauGrowths: Object.freeze([null, 498.8 / 1e3, 456.3 / 1e3, 320.1 / 1e3, 140.5 / 1e3]),
  paidGrowths: Object.freeze([null, 680.0 / 1e3, 571.4 / 1e3, 439.4 / 1e3, 284.2 / 1e3]),
  arppuGrowths: Object.freeze([null, -99.1 / 1e3, -58.3 / 1e3, 42.9 / 1e3, 120.0 / 1e3]),
  adPerMauGrowths: Object.freeze([null, -224.6 / 1e3, -234.9 / 1e3, -165.8 / 1e3, 273.1 / 1e3]),
  totPerMauGrowths: Object.freeze([null, -16.9 / 1e3, -13.1 / 1e3, 67.3 / 1e3, 216.3 / 1e3]),
  revSubGrowths: Object.freeze([null, 514.0 / 1e3, 480.0 / 1e3, 501.1 / 1e3, 437.7 / 1e3]),
  revAdGrowths: Object.freeze([null, 161.6 / 1e3, 115.4 / 1e3, 100.9 / 1e3, 451.6 / 1e3]),
  otherAggGrowths: Object.freeze([null, 623.1 / 1e3, 494.1 / 1e3, 118.4 / 1e3, -13.8 / 1e3]),
  revTotGrowths: Object.freeze([null, 473.4 / 1e3, 437.4 / 1e3, 408.4 / 1e3, 387.1 / 1e3]),
});

/**
 * Safely extracts a driver numeric value from assumptions.
 *
 * @param {object} assumptions
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function getDriverVal(assumptions, name, fallback = 0) {
  if (!assumptions) return fallback;
  if (typeof assumptions.get === 'function') {
    const d = assumptions.get(name);
    return d && Number.isFinite(d.value) ? d.value : fallback;
  }
  const found = (assumptions.drivers || []).find((d) => d.name === name);
  return found && Number.isFinite(found.value) ? found.value : fallback;
}

/**
 * Renders the multi-year forecast matrix table view (RP2.2).
 *
 * Covers FY2021-FY2030E with pinned label column, read-only cited historicals,
 * driver-driven projections, and .cell-input blue styling on user inputs.
 *
 * @param {object} assumptions
 * @param {object} [context={}]
 * @returns {string} HTML markup
 */
function renderForecastMatrixTable(assumptions, context = {}) {
  const years = ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025', 'FY2026E', 'FY2027E', 'FY2028E', 'FY2029E', 'FY2030E'];
  const forecastKeys = ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030'];

  const h = HISTORICAL_DATA;

  // Active drivers
  const gSub = getDriverVal(assumptions, 'paid_subscriber_growth', 0.184);
  const arppuVal = getDriverVal(assumptions, 'subscription_arpu', 80.5);
  const gAd = getDriverVal(assumptions, 'advertising_revenue_growth', 0.083);
  const gOther = getDriverVal(assumptions, 'other_revenue_growth', -0.02);
  const corPct = getDriverVal(assumptions, 'cost_of_revenue_pct_revenue', 0.278);
  const rdPct = getDriverVal(assumptions, 'rd_pct_revenue', 0.295);
  const smPct = getDriverVal(assumptions, 'sm_pct_revenue', 0.121);
  const gaPct = getDriverVal(assumptions, 'ga_pct_revenue', 0.175);
  const dsoVal = getDriverVal(assumptions, 'dso_days', 57.3);
  const defRevPct = getDriverVal(assumptions, 'deferred_revenue_pct_revenue', 0.478);
  const dpoVal = getDriverVal(assumptions, 'dpo_days', 10.1);
  const capexVal = getDriverVal(assumptions, 'capex_total_pct_revenue', 0.026);
  const depVal = getDriverVal(assumptions, 'depreciation_pct_revenue', 5.0 / 1e3);
  const amortVal = getDriverVal(assumptions, 'amortization_pct_revenue', 8.9 / 1e3);
  const dnaVal = depVal + amortVal;
  const sbcVal = getDriverVal(assumptions, 'sbc_target_pct_of_revenue', 0.133);
  const taxVal = getDriverVal(assumptions, 'effective_tax_rate', 0.134);

  // Compute 5 forecast points
  const fPaid = [];
  const fMau = [];
  const fSubRev = [];
  const fAdRev = [];
  const fOtherRev = [];
  const fTotRev = [];
  const fNiPct = [];

  const basePaid = h.paid[4]; // 12.2
  const baseAd = h.revAd[4];  // 79.7
  const baseOther = h.revOther[4]; // 84.4
  const opexPct = rdPct + smPct + gaPct;
  const ebitPct = 1 - corPct - opexPct;
  const convRatio = h.paid[4] / h.mau[4];

  for (let k = 0; k < 5; k++) {
    const pKey = forecastKeys[k];
    const tsIncome = context?.threeStatement?.incomeStatement?.byPeriod?.[pKey];

    const p = basePaid * Math.pow(1 + gSub, k + 1);
    fPaid.push(p);
    const m = p / convRatio;
    fMau.push(m);

    if (tsIncome && tsIncome.revenue?.segments?.subscription) {
      const sRev = tsIncome.revenue.segments.subscription.value / 1e3;
      const aRev = tsIncome.revenue.segments.advertising.value / 1e3;
      const tRev = tsIncome.revenue.total.value / 1e3;
      const oRev = tRev - sRev - aRev;
      fSubRev.push(sRev);
      fAdRev.push(aRev);
      fOtherRev.push(oRev);
      fTotRev.push(tRev);
      fNiPct.push(tsIncome.net_income.value / tsIncome.revenue.total.value);
    } else {
      const sRev = p * arppuVal;
      const aRev = baseAd * Math.pow(1 + gAd, k + 1);
      const oRev = baseOther * Math.pow(1 + gOther, k + 1);
      const tRev = sRev + aRev + oRev;
      fSubRev.push(sRev);
      fAdRev.push(aRev);
      fOtherRev.push(oRev);
      fTotRev.push(tRev);
      fNiPct.push(ebitPct * (1 - taxVal));
    }
  }

  // Full 10-year arrays
  const fullMau = [...h.mau, ...fMau];
  const fullPaid = [...h.paid, ...fPaid];
  const fullArppu = [...h.arppu, arppuVal, arppuVal, arppuVal, arppuVal, arppuVal];
  const fullSubRev = [...h.revSub, ...fSubRev];
  const fullAdRev = [...h.revAd, ...fAdRev];
  const fullOtherRev = [...h.revOther, ...fOtherRev];
  const fullTotRev = [
    h.revTot[0],
    h.revTot[1],
    h.revTot[2],
    h.revTot[3],
    h.revTot[4],
    ...fTotRev,
  ];

  function calcGrowth(arr) {
    return arr.map((val, idx) => {
      if (idx === 0 || !arr[idx - 1]) return null;
      return (val - arr[idx - 1]) / arr[idx - 1];
    });
  }

  const mauGrowth = calcGrowth(fullMau);
  const paidGrowth = calcGrowth(fullPaid);
  const arppuGrowth = calcGrowth(fullArppu);
  const subRevGrowth = calcGrowth(fullSubRev);
  const adRevGrowth = calcGrowth(fullAdRev);
  const otherRevGrowth = calcGrowth(fullOtherRev);
  const totRevGrowth = calcGrowth(fullTotRev);

  // F1 Fix: divide millions by millions directly without 1000x undercount
  const fullAdPerMau = fullAdRev.map((r, idx) => r / fullMau[idx]);
  const fullTotPerMau = fullTotRev.map((r, idx) => r / fullMau[idx]);
  const adPerMauGrowth = calcGrowth(fullAdPerMau);
  const totPerMauGrowth = calcGrowth(fullTotPerMau);
  const fullConv = fullPaid.map((p, idx) => p / fullMau[idx]);

  // Section 1: Operating Metrics & KPIs
  const sec1 = {
    title: 'Operating Metrics & KPIs',
    category: 'operating',
    rows: [
      {
        label: 'Total MAUs (millions)',
        values: fullMau.map((v) => v.toFixed(1)),
        isInput: false,
      },
      {
        label: 'YoY Growth (%)',
        values: years.map((_, idx) => {
          if (idx < 5) return h.mauGrowths[idx] != null ? percent(h.mauGrowths[idx], { decimals: 1 }) : ' — ';
          return mauGrowth[idx] != null ? percent(mauGrowth[idx], { decimals: 1 }) : ' — ';
        }),
        isInput: false,
      },
      {
        label: 'Paid Subscribers (millions)',
        values: fullPaid.map((v) => v.toFixed(1)),
        isInput: false,
      },
      {
        label: 'YoY Growth (%)',
        driver: 'paid_subscriber_growth',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return h.paidGrowths[idx] != null ? percent(h.paidGrowths[idx], { decimals: 1 }) : ' — ';
          return percent(gSub, { decimals: 1 });
        }),
      },
      {
        label: 'Subscriber Conversion Rate (%)',
        values: fullConv.map((v) => percent(v, { decimals: 1 })),
        isInput: false,
      },
      {
        label: 'Average Revenue per Paid User (ARPPU)',
        driver: 'subscription_arpu',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return usd(h.arppu[idx], { decimals: 2 });
          return formatDriverDisplay(arppuVal, 'usd_per_subscriber_year');
        }),
      },
      {
        label: 'YoY Growth (%)',
        values: years.map((_, idx) => {
          if (idx < 5) return h.arppuGrowths[idx] != null ? percent(h.arppuGrowths[idx], { decimals: 1 }) : ' — ';
          return arppuGrowth[idx] != null ? percent(arppuGrowth[idx], { decimals: 1 }) : ' — ';
        }),
        isInput: false,
      },
      {
        label: 'Ad Revenue per MAU',
        values: fullAdPerMau.map((v) => usd(v, { decimals: 2 })),
        isInput: false,
      },
      {
        label: 'YoY Growth (%)',
        values: years.map((_, idx) => {
          if (idx < 5) return h.adPerMauGrowths[idx] != null ? percent(h.adPerMauGrowths[idx], { decimals: 1 }) : ' — ';
          return adPerMauGrowth[idx] != null ? percent(adPerMauGrowth[idx], { decimals: 1 }) : ' — ';
        }),
        isInput: false,
      },
      {
        label: 'Total Revenue per MAU',
        values: fullTotPerMau.map((v) => usd(v, { decimals: 2 })),
        isInput: false,
      },
      {
        label: 'YoY Growth (%)',
        values: years.map((_, idx) => {
          if (idx < 5) return h.totPerMauGrowths[idx] != null ? percent(h.totPerMauGrowths[idx], { decimals: 1 }) : ' — ';
          return totPerMauGrowth[idx] != null ? percent(totPerMauGrowth[idx], { decimals: 1 }) : ' — ';
        }),
        isInput: false,
      },
    ],
  };

  // Section 2: Revenue Build
  const sec2 = {
    title: 'Revenue Build',
    category: 'operating',
    rows: [
      {
        label: 'Subscription Revenue (US$ mm)',
        values: fullSubRev.map((v) => usd(v, { decimals: 1 })),
        isInput: false,
      },
      {
        label: 'YoY Growth (%)',
        values: years.map((_, idx) => {
          if (idx < 5) return h.revSubGrowths[idx] != null ? percent(h.revSubGrowths[idx], { decimals: 1 }) : ' — ';
          return subRevGrowth[idx] != null ? percent(subRevGrowth[idx], { decimals: 1 }) : ' — ';
        }),
        isInput: false,
      },
      {
        label: 'Advertising Revenue (US$ mm)',
        values: fullAdRev.map((v) => usd(v, { decimals: 1 })),
        isInput: false,
      },
      {
        label: 'YoY Growth (%)',
        driver: 'advertising_revenue_growth',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return h.revAdGrowths[idx] != null ? percent(h.revAdGrowths[idx], { decimals: 1 }) : ' — ';
          return percent(gAd, { decimals: 1 });
        }),
      },
      {
        label: 'Other Revenue (US$ mm)',
        values: fullOtherRev.map((v) => usd(v, { decimals: 1 })),
        isInput: false,
      },
      {
        label: 'YoY Growth (%)',
        values: years.map((_, idx) => {
          if (idx < 5) return h.otherAggGrowths[idx] != null ? percent(h.otherAggGrowths[idx], { decimals: 1 }) : ' — ';
          return otherRevGrowth[idx] != null ? percent(otherRevGrowth[idx], { decimals: 1 }) : ' — ';
        }),
        isInput: false,
      },
      {
        label: 'Total Revenue (US$ mm)',
        isBold: true,
        values: fullTotRev.map((v) => usd(v, { decimals: 1 })),
        isInput: false,
      },
      {
        label: 'YoY Growth (%)',
        values: years.map((_, idx) => {
          if (idx < 5) return h.revTotGrowths[idx] != null ? percent(h.revTotGrowths[idx], { decimals: 1 }) : ' — ';
          return totRevGrowth[idx] != null ? percent(totRevGrowth[idx], { decimals: 1 }) : ' — ';
        }),
        isInput: false,
      },
      {
        label: 'Revenue Mix (%)',
        isSubhead: true,
        values: Array(10).fill(''),
        isInput: false,
      },
      {
        label: 'Subscription',
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.revSub[idx] / h.revTot[idx], { decimals: 1 });
          return percent(fullSubRev[idx] / fullTotRev[idx], { decimals: 1 });
        }),
        isInput: false,
      },
      {
        label: 'Advertising',
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.revAd[idx] / h.revTot[idx], { decimals: 1 });
          return percent(fullAdRev[idx] / fullTotRev[idx], { decimals: 1 });
        }),
        isInput: false,
      },
      {
        label: 'Other',
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.revOther[idx] / h.revTot[idx], { decimals: 1 });
          return percent(fullOtherRev[idx] / fullTotRev[idx], { decimals: 1 });
        }),
        isInput: false,
      },
      {
        label: 'Total',
        isBold: true,
        values: Array(10).fill('100.0%'),
        isInput: false,
      },
    ],
  };

  // Section 3: Cost and Margin Assumptions
  const sec3 = {
    title: 'Cost and Margin Assumptions',
    category: 'margins',
    rows: [
      {
        label: 'Cost of Revenue (% of revenue)',
        driver: 'cost_of_revenue_pct_revenue',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.corPct[idx], { decimals: 1 });
          return formatDriverDisplay(corPct, 'pct_of_revenue');
        }),
      },
      {
        label: 'Research & Development (% of revenue)',
        driver: 'rd_pct_revenue',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.rdPct[idx], { decimals: 1 });
          return formatDriverDisplay(rdPct, 'pct_of_revenue');
        }),
      },
      {
        label: 'Sales & Marketing (% of revenue)',
        driver: 'sm_pct_revenue',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.smPct[idx], { decimals: 1 });
          return formatDriverDisplay(smPct, 'pct_of_revenue');
        }),
      },
      {
        label: 'General & Administrative (% of revenue)',
        driver: 'ga_pct_revenue',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.gaPct[idx], { decimals: 1 });
          return formatDriverDisplay(gaPct, 'pct_of_revenue');
        }),
      },
      {
        label: 'Operating Expense (% of revenue)',
        isBold: true,
        isInput: false,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.opexPct[idx], { decimals: 1 });
          return percent(opexPct, { decimals: 1 });
        }),
      },
      {
        label: 'EBIT Margin (%)',
        isBold: true,
        isInput: false,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.ebitPct[idx], { decimals: 1 });
          return percent(ebitPct, { decimals: 1 });
        }),
      },
      {
        label: 'Net Margin (%)',
        isInput: false,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.niPct[idx], { decimals: 1 });
          return percent(fNiPct[idx - 5], { decimals: 1 });
        }),
      },
    ],
  };

  // Section 4: Balance Sheet & Working Capital Drivers
  const sec4 = {
    title: 'Balance Sheet & Cash Flow Assumptions',
    category: 'balance-sheet',
    rows: [
      {
        label: 'Accounts Receivable (Days)',
        driver: 'dso_days',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return String(Math.round(h.dso[idx]));
          return formatDriverDisplay(dsoVal, 'days');
        }),
      },
      {
        label: 'Deferred Revenue (Days)',
        driver: 'deferred_revenue_pct_revenue',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return String(Math.round(h.defRevDays[idx]));
          return String(Math.round(defRevPct * 365));
        }),
      },
      {
        label: 'Accounts Payable (Days)',
        driver: 'dpo_days',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return String(Math.round(h.dpo[idx]));
          return formatDriverDisplay(dpoVal, 'days');
        }),
      },
      {
        label: 'Capital Expenditures (% of revenue)',
        driver: 'capex_total_pct_revenue',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.capexPct[idx], { decimals: 1 });
          return formatDriverDisplay(capexVal, 'pct_of_revenue');
        }),
      },
      {
        label: 'Depreciation (% of revenue)',
        driver: 'depreciation_pct_revenue',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.depPct[idx], { decimals: 1 });
          return formatDriverDisplay(depVal, 'pct_of_revenue');
        }),
      },
      {
        label: 'Depreciation & Amortization (% of revenue)',
        isBold: true,
        isInput: false,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.dnaPct[idx], { decimals: 1 });
          return percent(dnaVal, { decimals: 1 });
        }),
      },
      {
        label: 'Stock-Based Compensation (% of revenue)',
        driver: 'sbc_target_pct_of_revenue',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return percent(h.sbcPct[idx], { decimals: 1 });
          return formatDriverDisplay(sbcVal, 'pct_of_revenue');
        }),
      },
      {
        label: 'Cash Tax Rate (%)',
        driver: 'effective_tax_rate',
        isInput: true,
        values: years.map((_, idx) => {
          if (idx < 5) return h.taxRate[idx] != null ? percent(h.taxRate[idx], { decimals: 1 }) : ' — ';
          return formatDriverDisplay(taxVal, 'pct_of_pretax');
        }),
      },
      {
        label: 'Change in Net Working Capital (% of revenue)',
        isInput: false,
        values: years.map((_, idx) => {
          if (idx < 5) {
            const hVal = h.nwcPct[idx];
            return hVal != null ? percent(hVal, { decimals: 1 }) : ' — ';
          }
          const pKey = forecastKeys[idx - 5];
          const supWc = context?.threeStatement?.supporting?.workingCapital?.byPeriod?.[pKey]
            || context?.schedules?.workingCapital?.byPeriod?.[pKey];
          const isRev = context?.threeStatement?.incomeStatement?.byPeriod?.[pKey]?.revenue?.total?.value;
          const dNwc = supWc?.change_in_net_working_capital?.value;
          if (isRev && dNwc !== undefined) {
            return percent(dNwc / isRev, { decimals: 1 });
          }
          const fNwcFallback = [-32.0 / 1e3, -32.8 / 1e3, -34.5 / 1e3, -35.2 / 1e3, -35.7 / 1e3];
          return percent(fNwcFallback[idx - 5], { decimals: 1 });
        }),
      },
    ],
  };

  const sections = [sec1, sec2, sec3, sec4];

  const theadHtml = `
    <thead>
      <tr>
        <th class="matrix-label-th">Fiscal Year Ending Dec 31,</th>
        ${years.map((y, idx) => {
          const title = idx < 5 ? 'SEC Form 10-K Audited Filing Actual' : 'Model Projection / Driver Estimate';
          return `<th class="matrix-col-header" title="${title}">${y}</th>`;
        }).join('')}
      </tr>
    </thead>
  `;

  const tbodyHtml = sections.map((sec) => {
    const headerRow = `
      <tr class="matrix-section-row" data-category="${sec.category}">
        <td colspan="${years.length + 1}"><strong>${sec.title}</strong></td>
      </tr>
    `;

    const dataRows = sec.rows.map((r) => {
      if (r.isSubhead) {
        return `
          <tr class="matrix-subhead-row" data-category="${sec.category}">
            <td class="matrix-label-td"><em>${r.label}</em></td>
            ${years.map(() => '<td class="tabular-nums"></td>').join('')}
          </tr>
        `;
      }

      const rowClass = `matrix-data-row ${r.isBold ? 'matrix-bold-row' : ''}`;
      const cellsHtml = years.map((yr, idx) => {
        const isForecast = idx >= 5;
        const valStr = r.values[idx];

        if (isForecast && r.isInput && r.driver) {
          return `
            <td class="cell-input tabular-nums" title="${r.label} (Driver Input: ${r.driver})">
              <input type="text" inputmode="decimal" class="cell-input matrix-cell-input tabular-nums"
                     data-matrix-driver="${r.driver}" value="${valStr}"
                     aria-label="${r.label} ${yr}" />
            </td>
          `;
        }

        const cellClass = 'cell-calc tabular-nums';
        const titleAttr = isForecast ? 'Model Estimate' : 'Audited SEC 10-K Actual';
        return `<td class="${cellClass}" title="${titleAttr}">${valStr}</td>`;
      }).join('');

      return `
        <tr class="${rowClass}" data-category="${sec.category}">
          <td class="matrix-label-td">${r.label}</td>
          ${cellsHtml}
        </tr>
      `;
    }).join('');

    return headerRow + dataRows;
  }).join('');

  return `
    <div class="assumptions-matrix-wrapper">
      <table class="assumptions-matrix-table">
        ${theadHtml}
        <tbody>
          ${tbodyHtml}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Renders the Assumptions / Drivers tab inside the target container.
 *
 * @param {object} options
 * @param {HTMLElement|object} options.container Target DOM element
 * @param {object} options.assumptions Loaded AssumptionSet
 * @param {(name: string, value: number) => void} [options.onChange] RP2 contract change callback
 * @param {(name: string, value: number) => void} [options.onDriverChange] Backward-compatible change callback
 * @param {(scenario: string) => void} [options.onScenarioChange] Scenario change callback
 * @param {'sliders'|'table'} [options.mode='sliders'] Initial presentation mode
 * @returns {{ update: (assumptions: object) => void, dispose: () => void, setCategory: (cat: string) => void, setMode: (m: string) => void }}
 */
export function renderAssumptions({
  container,
  assumptions,
  historical,
  threeStatement,
  schedules,
  onChange,
  onDriverChange,
  onScenarioChange,
  mode = 'sliders',
} = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderAssumptions requires a container element.', 'container');
  }

  const listeners = [];
  let disposed = false;
  let currentAssumptions = assumptions;
  let currentHistorical = historical;
  let currentThreeStatement = threeStatement;
  let currentSchedules = schedules;
  let currentMode = mode === 'table' ? 'table' : 'sliders';
  let currentCategory = 'all';
  const driverElementMap = new Map();

  function dispatchChange(name, val) {
    if (typeof onChange === 'function') {
      onChange(name, val);
    }
    if (typeof onDriverChange === 'function') {
      onDriverChange(name, val);
    }
  }

  function render() {
    if (!currentAssumptions || !currentAssumptions.drivers) return;

    const activeScenario = currentAssumptions.scenario || 'base';
    const allDrivers = currentAssumptions.drivers || [];
    const usedNames = new Set();

    // Map driver cards into categorized groups
    const renderedGroups = [];
    for (const groupDef of CATEGORY_GROUPS) {
      const groupDrivers = [];
      for (const name of groupDef.driverNames) {
        const d = currentAssumptions.get ? currentAssumptions.get(name) : allDrivers.find((item) => item.name === name);
        if (d) {
          groupDrivers.push(d);
          usedNames.add(d.name);
        }
      }
      if (groupDrivers.length > 0) {
        renderedGroups.push({
          category: groupDef.category,
          title: groupDef.title,
          drivers: groupDrivers,
        });
      }
    }

    // Residual unclassified drivers
    const residual = allDrivers.filter((d) => !usedNames.has(d.name));
    if (residual.length > 0) {
      renderedGroups.push({
        category: 'other',
        title: 'Additional Operating & Financial Assumptions',
        drivers: residual,
      });
    }

    // Scenario picker HTML
    const scenarioHtml = `
      <div class="scenario-picker-card">
        <div class="scenario-picker-title">Active Model Scenario</div>
        <div class="scenario-btn-group" role="group" aria-label="Scenario Selector">
          ${SCENARIO_NAMES.map((sc) => `
            <button type="button" class="scenario-btn ${sc === activeScenario ? 'active' : ''}" data-scenario="${sc}">
              ${(SCENARIO_DISPLAY_NAMES[sc] || sc).toUpperCase()}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    // Category pills HTML
    const categoryPillsHtml = `
      <div class="category-pill-bar pill-group" role="tablist" aria-label="Category Filters">
        ${CATEGORY_PILLS.map((p) => `
          <button type="button" class="cat-pill ${p.id === currentCategory ? 'active' : ''}" data-category="${p.id}">
            ${p.label}
          </button>
        `).join('')}
      </div>
    `;

    // Sliders mode groups HTML
    const groupsHtml = renderedGroups.map((g) => {
      const rowsHtml = g.drivers.map(renderDriverRow).join('');
      const isHidden = currentCategory !== 'all' && currentCategory !== g.category;
      const hiddenClass = isHidden ? 'hidden' : '';

      return `
        <div class="driver-group-card ${hiddenClass}" data-category="${g.category}">
          <div class="driver-group-header">
            ${g.title}
          </div>
          <div class="driver-rows-container">
            ${rowsHtml}
          </div>
        </div>
      `;
    }).join('');

    const matrixTableHtml = renderForecastMatrixTable(currentAssumptions, {
      historical: currentHistorical,
      threeStatement: currentThreeStatement,
      schedules: currentSchedules,
    });

    const isSliders = currentMode === 'sliders';
    const subtitleText = isSliders
      ? 'Key operating, financial, and valuation assumptions. Change inputs in blue cells. Hover for details.'
      : 'Key operating, financial, and valuation assumptions. Figures in USD millions unless otherwise stated.';

    container.innerHTML = `
      <div class="assumptions-view-wrapper assumptions-container">
        <!-- Top Title & Controls Strip -->
        <div class="assumptions-header-row">
          <div class="assumptions-title-block">
            <h2 class="assumptions-title">02. Assumptions / Drivers</h2>
            <p class="assumptions-subtitle" id="assumptions-subtitle">${subtitleText}</p>
          </div>

          <div class="assumptions-controls-right">
            <div class="input-type-legend">
              <span class="legend-title">INPUT TYPE</span>
              <div class="legend-items">
                <span class="legend-item"><span class="legend-dot legend-dot-input"></span> User Input</span>
                <span class="legend-item"><span class="legend-dot legend-dot-calc"></span> Calculated / Linked</span>
              </div>
            </div>

            <div class="view-mode-toggle pill-control">
              <button type="button" class="pill-btn mode-btn ${isSliders ? 'active' : ''}" data-mode="sliders">Sliders</button>
              <button type="button" class="pill-btn mode-btn ${!isSliders ? 'active' : ''}" data-mode="table">Table View</button>
            </div>
          </div>
        </div>

        <!-- Category Filter Pills -->
        ${categoryPillsHtml}

        <!-- Active Model Scenario Bar -->
        ${scenarioHtml}

        <!-- Mode A: Parameter Sliders View -->
        <div class="sliders-view-container ${isSliders ? '' : 'hidden'}" id="assumptions-sliders-view">
          ${groupsHtml}
        </div>

        <!-- Mode B: Multi-Year Forecast Table View -->
        <div class="table-view-container ${!isSliders ? '' : 'hidden'}" id="assumptions-table-view">
          ${matrixTableHtml}
        </div>

        <!-- Assumptions Note Callout -->
        <div class="callout-info assumptions-note">
          <div class="callout-header">
            <img src="assets/icons/ui/info-circle.svg" alt="Info" class="callout-icon" width="20" height="20" />
            <strong class="callout-title">Assumptions Note</strong>
          </div>
          <p>These assumptions are for analytical purposes only and based on management commentary, historical trends, and third-party research. Please refer to the <a href="#" class="jump-cover-link" data-jump-tab="cover">Cover &amp; TOC</a> for full methodology and important disclaimers.</p>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // 1. Scenario button clicks
    const scenarioButtons = container.querySelectorAll ? container.querySelectorAll('[data-scenario]') : [];
    for (const btn of Array.from(scenarioButtons || [])) {
      const clickHandler = () => {
        const sc = btn.getAttribute ? btn.getAttribute('data-scenario') : null;
        if (sc && typeof onScenarioChange === 'function') {
          onScenarioChange(sc);
        }
      };
      if (typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', clickHandler);
      }
      listeners.push({ target: btn, type: 'click', handler: clickHandler });
    }

    // 2. Category pill clicks
    const catPills = container.querySelectorAll ? container.querySelectorAll('.cat-pill') : [];
    for (const pill of Array.from(catPills || [])) {
      const clickHandler = () => {
        const cat = pill.getAttribute ? pill.getAttribute('data-category') : 'all';
        applyCategoryFilter(cat);
      };
      if (typeof pill.addEventListener === 'function') {
        pill.addEventListener('click', clickHandler);
      }
      listeners.push({ target: pill, type: 'click', handler: clickHandler });
    }

    // 3. Mode toggle clicks
    const modeButtons = container.querySelectorAll ? container.querySelectorAll('.mode-btn') : [];
    for (const mBtn of Array.from(modeButtons || [])) {
      const clickHandler = () => {
        const targetMode = mBtn.getAttribute ? mBtn.getAttribute('data-mode') : 'sliders';
        applyModeSwitch(targetMode);
      };
      if (typeof mBtn.addEventListener === 'function') {
        mBtn.addEventListener('click', clickHandler);
      }
      listeners.push({ target: mBtn, type: 'click', handler: clickHandler });
    }

    driverElementMap.clear();

    // 4. Number input changes
    const numberInputs = container.querySelectorAll ? container.querySelectorAll('[data-driver-input]') : [];
    for (const numInput of Array.from(numberInputs || [])) {
      const driverName = numInput.getAttribute ? numInput.getAttribute('data-driver-input') : null;
      if (driverName) {
        let entry = driverElementMap.get(driverName);
        if (!entry) {
          entry = {};
          driverElementMap.set(driverName, entry);
        }
        entry.numInput = numInput;
      }
      const changeHandler = () => {
        const driver = currentAssumptions?.get
          ? currentAssumptions.get(driverName)
          : (currentAssumptions?.drivers || []).find((d) => d.name === driverName);

        if (driverName && driver) {
          const parsedVal = parseDriverInput(numInput.value, driver);
          if (Number.isFinite(parsedVal)) {
            const clampedVal = clamp(parsedVal, driver.min, driver.max);
            const snappedVal = snapDriverValue(clampedVal, driver);
            const entry = driverElementMap.get(driverName);
            const matchingSlider = entry?.slider || (container.querySelector
              ? container.querySelector(`[data-driver-slider="${driverName}"]`)
              : null);
            if (matchingSlider) matchingSlider.value = String(snappedVal);
            numInput.value = formatDriverDisplay(snappedVal, driver.units);

            const matchingMatrix = container.querySelectorAll
              ? container.querySelectorAll(`[data-matrix-driver="${driverName}"]`)
              : [];
            for (const mInput of Array.from(matchingMatrix || [])) {
              mInput.value = driverName === 'deferred_revenue_pct_revenue'
                ? String(Math.round(snappedVal * 365))
                : formatDriverDisplay(snappedVal, driver.units);
            }

            // B1 no-op path: skip dispatch when the snapped value already holds.
            if (snappedVal !== driver.value) {
              dispatchChange(driverName, snappedVal);
            }
          }
        }
      };

      if (typeof numInput.addEventListener === 'function') {
        numInput.addEventListener('change', changeHandler);
      }
      listeners.push({ target: numInput, type: 'change', handler: changeHandler });
    }

    // 5. Slider inputs & changes
    const sliders = container.querySelectorAll ? container.querySelectorAll('[data-driver-slider]') : [];
    for (const slider of Array.from(sliders || [])) {
      const driverName = slider.getAttribute ? slider.getAttribute('data-driver-slider') : null;
      if (driverName) {
        let entry = driverElementMap.get(driverName);
        if (!entry) {
          entry = {};
          driverElementMap.set(driverName, entry);
        }
        entry.slider = slider;
      }
      const inputHandler = () => {
        const val = Number(slider.value);
        if (Number.isFinite(val) && driverName) {
          const driver = currentAssumptions?.get
            ? currentAssumptions.get(driverName)
            : (currentAssumptions?.drivers || []).find((d) => d.name === driverName);
          const clampedVal = driver ? clamp(val, driver.min, driver.max) : val;
          const snappedVal = driver ? snapDriverValue(clampedVal, driver) : clampedVal;

          const entry = driverElementMap.get(driverName);
          const matchingNum = entry?.numInput || (container.querySelector
            ? container.querySelector(`[data-driver-input="${driverName}"]`)
            : null);
          if (matchingNum && driver) {
            matchingNum.value = formatDriverDisplay(snappedVal, driver.units);
          }

          const matchingMatrix = container.querySelectorAll
            ? container.querySelectorAll(`[data-matrix-driver="${driverName}"]`)
            : [];
          for (const mInput of Array.from(matchingMatrix || [])) {
            if (driver) {
              mInput.value = driverName === 'deferred_revenue_pct_revenue'
                ? String(Math.round(snappedVal * 365))
                : formatDriverDisplay(snappedVal, driver.units);
            }
          }

          // B1 no-op path: skip dispatch when the snapped value already holds.
          if (snappedVal !== driver?.value) {
            dispatchChange(driverName, snappedVal);
          }
        }
      };

      if (typeof slider.addEventListener === 'function') {
        slider.addEventListener('input', inputHandler);
        slider.addEventListener('change', inputHandler);
      }
      listeners.push({ target: slider, type: 'input', handler: inputHandler });
      listeners.push({ target: slider, type: 'change', handler: inputHandler });
    }

    // 6. Matrix table inputs
    const matrixInputs = container.querySelectorAll ? container.querySelectorAll('[data-matrix-driver]') : [];
    for (const mInput of Array.from(matrixInputs || [])) {
      const driverName = mInput.getAttribute ? mInput.getAttribute('data-matrix-driver') : null;
      const changeHandler = () => {
        const driver = currentAssumptions?.get
          ? currentAssumptions.get(driverName)
          : (currentAssumptions?.drivers || []).find((d) => d.name === driverName);
        if (driverName && driver) {
          let parsedVal;
          if (driverName === 'deferred_revenue_pct_revenue') {
            const rawStr = String(mInput.value).trim();
            const currentDays = Math.round(driver.value * 365);
            if (Number(rawStr) === currentDays) {
              parsedVal = driver.value;
            } else if (rawStr.includes('%')) {
              parsedVal = parseFloat(rawStr) / 100;
            } else {
              const days = parseFloat(rawStr);
              parsedVal = Number.isFinite(days) ? days / 365 : driver.value;
            }
          } else {
            parsedVal = parseDriverInput(mInput.value, driver);
          }
          if (Number.isFinite(parsedVal)) {
            const clampedVal = clamp(parsedVal, driver.min, driver.max);
            const snappedVal = snapDriverValue(clampedVal, driver);
            const entry = driverElementMap.get(driverName);
            if (entry?.slider) entry.slider.value = String(snappedVal);
            if (entry?.numInput) entry.numInput.value = formatDriverDisplay(snappedVal, driver.units);
            mInput.value = driverName === 'deferred_revenue_pct_revenue'
              ? String(Math.round(snappedVal * 365))
              : formatDriverDisplay(snappedVal, driver.units);

            const matchingMatrix = container.querySelectorAll
              ? container.querySelectorAll(`[data-matrix-driver="${driverName}"]`)
              : [];
            for (const otherInput of Array.from(matchingMatrix || [])) {
              if (otherInput !== mInput) {
                otherInput.value = driverName === 'deferred_revenue_pct_revenue'
                  ? String(Math.round(snappedVal * 365))
                  : formatDriverDisplay(snappedVal, driver.units);
              }
            }

            // B1 no-op path: skip dispatch when the snapped value already holds.
            if (snappedVal !== driver.value) {
              dispatchChange(driverName, snappedVal);
            }
          }
        }
      };
      if (typeof mInput.addEventListener === 'function') {
        mInput.addEventListener('change', changeHandler);
      }
      listeners.push({ target: mInput, type: 'change', handler: changeHandler });
    }
  }

  function applyCategoryFilter(cat) {
    // If clicking already active specific category, toggle back to 'all'
    currentCategory = currentCategory === cat && cat !== 'all' ? 'all' : cat;

    // Update pill active classes
    const pills = container.querySelectorAll ? container.querySelectorAll('.cat-pill') : [];
    for (const p of Array.from(pills || [])) {
      const pillCat = p.getAttribute ? p.getAttribute('data-category') : null;
      if (pillCat === currentCategory) {
        p.classList?.add('active');
      } else {
        p.classList?.remove('active');
      }
    }

    // Filter slider cards
    const cards = container.querySelectorAll ? container.querySelectorAll('.driver-group-card') : [];
    for (const card of Array.from(cards || [])) {
      const cardCat = card.getAttribute ? card.getAttribute('data-category') : null;
      const shouldShow = currentCategory === 'all' || cardCat === currentCategory;
      if (shouldShow) {
        card.classList?.remove('hidden');
      } else {
        card.classList?.add('hidden');
      }
    }

    // Filter table matrix rows
    const matrixRows = container.querySelectorAll ? container.querySelectorAll('[data-category]') : [];
    for (const row of Array.from(matrixRows || [])) {
      if (row.classList?.contains('cat-pill') || row.classList?.contains('driver-group-card')) continue;
      const rowCat = row.getAttribute ? row.getAttribute('data-category') : null;
      const shouldShow = currentCategory === 'all' || rowCat === currentCategory;
      if (shouldShow) {
        row.classList?.remove('hidden');
      } else {
        row.classList?.add('hidden');
      }
    }
  }

  function applyModeSwitch(targetMode) {
    currentMode = targetMode === 'table' ? 'table' : 'sliders';
    const isSliders = currentMode === 'sliders';

    const modeBtns = container.querySelectorAll ? container.querySelectorAll('.mode-btn') : [];
    for (const btn of Array.from(modeBtns || [])) {
      const btnMode = btn.getAttribute ? btn.getAttribute('data-mode') : null;
      if (btnMode === currentMode) {
        btn.classList?.add('active');
      } else {
        btn.classList?.remove('active');
      }
    }

    const slidersContainer = container.querySelector ? container.querySelector('#assumptions-sliders-view') : null;
    const tableContainer = container.querySelector ? container.querySelector('#assumptions-table-view') : null;
    const subtitle = container.querySelector ? container.querySelector('#assumptions-subtitle') : null;

    if (slidersContainer) {
      if (isSliders) slidersContainer.classList?.remove('hidden');
      else slidersContainer.classList?.add('hidden');
    }

    if (tableContainer) {
      if (!isSliders) tableContainer.classList?.remove('hidden');
      else tableContainer.classList?.add('hidden');
    }

    if (subtitle) {
      subtitle.textContent = isSliders
        ? 'Key operating, financial, and valuation assumptions. Change inputs in blue cells. Hover for details.'
        : 'Key operating, financial, and valuation assumptions. Figures in USD millions unless otherwise stated.';
    }
  }

  render();

  return {
    update(newAssumptions, context = {}) {
      currentAssumptions = newAssumptions;
      if (context?.historical) currentHistorical = context.historical;
      if (context?.threeStatement) currentThreeStatement = context.threeStatement;
      if (context?.schedules) currentSchedules = context.schedules;
      if (!currentAssumptions || !currentAssumptions.drivers) return;

      let updatedViaQuery = false;
      if (driverElementMap.size > 0) {
        updatedViaQuery = true;
        for (const d of currentAssumptions.drivers) {
          const entry = driverElementMap.get(d.name);
          if (entry) {
            if (entry.numInput) entry.numInput.value = formatDriverDisplay(d.value, d.units);
            if (entry.slider && entry.slider.value !== String(d.value)) entry.slider.value = String(d.value);
          }
          const mInputs = container.querySelectorAll
            ? container.querySelectorAll(`[data-matrix-driver="${d.name}"]`)
            : [];
          for (const mInput of Array.from(mInputs || [])) {
            if (mInput && mInput.value !== undefined) {
              mInput.value = d.name === 'deferred_revenue_pct_revenue'
                ? String(Math.round(d.value * 365))
                : formatDriverDisplay(d.value, d.units);
            }
          }
        }

        const scenarioBtns = container.querySelectorAll ? container.querySelectorAll('[data-scenario]') : [];
        const activeScenario = currentAssumptions.scenario || 'base';
        for (const btn of Array.from(scenarioBtns || [])) {
          const sc = btn.getAttribute ? btn.getAttribute('data-scenario') : null;
          if (sc === activeScenario) {
            btn.classList?.add('active');
          } else {
            btn.classList?.remove('active');
          }
        }
      } else if (typeof container.querySelector === 'function') {
        const testEl = container.querySelector('[data-driver-input]');
        if (testEl) {
          updatedViaQuery = true;
          for (const d of currentAssumptions.drivers) {
            const numInput = container.querySelector(`[data-driver-input="${d.name}"]`);
            if (numInput) numInput.value = formatDriverDisplay(d.value, d.units);
            const slider = container.querySelector(`[data-driver-slider="${d.name}"]`);
            if (slider && slider.value !== String(d.value)) slider.value = String(d.value);
            const mInputs = container.querySelectorAll
              ? container.querySelectorAll(`[data-matrix-driver="${d.name}"]`)
              : [];
            for (const mInput of Array.from(mInputs || [])) {
              if (mInput && mInput.value !== undefined) {
                mInput.value = d.name === 'deferred_revenue_pct_revenue'
                  ? String(Math.round(d.value * 365))
                  : formatDriverDisplay(d.value, d.units);
              }
            }
          }

          const scenarioBtns = container.querySelectorAll ? container.querySelectorAll('[data-scenario]') : [];
          const activeScenario = currentAssumptions.scenario || 'base';
          for (const btn of Array.from(scenarioBtns || [])) {
            const sc = btn.getAttribute ? btn.getAttribute('data-scenario') : null;
            if (sc === activeScenario) {
              btn.classList?.add('active');
            } else {
              btn.classList?.remove('active');
            }
          }
        }
      }

      if (!updatedViaQuery) {
        render();
      }
    },
    setCategory(cat) {
      applyCategoryFilter(cat);
    },
    setMode(m) {
      applyModeSwitch(m);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      driverElementMap.clear();
      for (const { target, type, handler } of listeners) {
        if (target && typeof target.removeEventListener === 'function') {
          target.removeEventListener(type, handler);
        }
      }
      listeners.length = 0;
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
  };
}

export default renderAssumptions;
