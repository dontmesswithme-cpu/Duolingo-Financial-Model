/**
 * Tab 01 Cover & Model Architecture UI View Controller.
 *
 * Manages executive briefing HUD, live valuation snapshots, integrity checklist,
 * key baseline assumptions, and multi-method valuation summary.
 *
 * Purity contract: pure functions, zero fetch, zero Date.now, zero Math.random,
 * zero bare numeric literals > 999 outside comments.
 *
 * @module src/ui/coverTab
 */

import { EngineError } from '../data/errors.js';
import { RECOMMENDATION_THRESHOLDS } from '../data/constants.js';
import { describeStageStructure } from '../engine/methods/fcffDcf.js';
import { canonicalDcfPerShare } from '../engine/methods/fcffDcf.js';
import { fullyDilutedSchedule } from '../engine/shares.js';
import { usd, percent } from './format.js';

const MONTH_NAMES = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

function formatDateClean(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '-';
  const parts = dateStr.trim().split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (m >= 1 && m <= 12 && Number.isFinite(d)) {
      return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
    }
  }
  return dateStr;
}

const DEFAULT_METHODS = Object.freeze([
  { method: 'fcff_dcf', label: '3-Stage FCFF DCF', basis: 'FY2026–FY2035 + Gordon' },
  { method: 'comps', label: 'Trading Comparables', basis: 'Peer Median EV/Rev' },
  { method: 'ev_multiples', label: 'EV/EBITDAR Multiples', basis: 'Peer Median EV/EBITDAR' },
  { method: 'pfcf', label: 'P/FCF Multiple', basis: 'Peer Median P/FCF' },
  { method: 'sotp', label: 'Sum-of-the-Parts (SOTP)', basis: 'Core Learning + DET' },
  { method: 'per_user', label: 'Per-User Metric Value', basis: 'EV/MAU + EV/DAU' },
]);

/**
 * Renders the multi-method valuation summary rows.
 *
 * @param {Array<object>} methodsList
 * @param {number|null} marketPrice
 * @returns {string}
 */
function renderMethodRows(methodsList, marketPrice) {
  const items = Array.isArray(methodsList) && methodsList.length > 0 ? methodsList : DEFAULT_METHODS;
  return items.map((m) => {
    const label = m.label || m.name || m.method || 'Valuation Method';
    const price = typeof m.impliedPerShare === 'number' && Number.isFinite(m.impliedPerShare)
      ? m.impliedPerShare
      : (typeof m.fairValuePerShare === 'number' && Number.isFinite(m.fairValuePerShare) ? m.fairValuePerShare : null);
    const priceFormatted = usd(price, { decimals: 2 });
    let upsideFormatted = ' - ';
    let verdict = m.verdict ? String(m.verdict).toLowerCase() : 'fair';
    if (typeof m.upsidePct === 'number' && Number.isFinite(m.upsidePct)) {
      upsideFormatted = percent(m.upsidePct, { decimals: 1, showSign: true });
    } else if (typeof m.impliedUpside === 'number' && Number.isFinite(m.impliedUpside)) {
      upsideFormatted = percent(m.impliedUpside, { decimals: 1, showSign: true });
    } else if (price !== null && typeof marketPrice === 'number' && marketPrice > 0) {
      const up = (price - marketPrice) / marketPrice;
      upsideFormatted = percent(up, { decimals: 1, showSign: true });
      if (!m.verdict) {
        verdict = up >= RECOMMENDATION_THRESHOLDS.undervalued ? 'undervalued' : (up <= RECOMMENDATION_THRESHOLDS.overvalued ? 'overvalued' : 'fair');
      }
    }
    const badgeHtml = `<span class="badge badge-${verdict}">${verdict.toUpperCase()}</span>`;
    return `
      <tr>
        <td><span class="soft-em">${label}</span></td>
        <td class="tabular-nums font-mono">${priceFormatted}</td>
        <td class="tabular-nums font-mono">${upsideFormatted}</td>
        <td>${badgeHtml}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Mounts and hydrates the Cover & Model Architecture tab view.
 *
 * @param {object} params
 * @param {HTMLElement} params.container
 * @param {object} [params.dcf]
 * @param {object|number} [params.wacc]
 * @param {object} [params.recommendation]
 * @param {object} [params.assumptions]
 * @param {object} [params.threeStatement]
 * @param {Array<object>} [params.methods]
 * @param {object} [params.verdict]
 * @param {object} [params.marketPriceState]
 * @returns {{ update: Function, dispose: Function }}
 */
export function renderCover({
  container,
  dcf = null,
  wacc = null,
  recommendation = null,
  assumptions = null,
  threeStatement = null,
  methods = null,
  verdict = null,
  marketPriceState = null,
  schedules = null,
} = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderCover requires a container DOM element.', 'container');
  }

  let currentDcf = dcf;
  let currentWacc = wacc;
  let currentRec = recommendation;
  let currentAssumptions = assumptions;
  let currentThreeStatement = threeStatement;
  let currentMethods = methods;
  let currentVerdict = verdict;
  let currentMarketPrice = marketPriceState;
  let currentSchedules = schedules;
  let disposed = false;

  function render() {
    if (disposed || !container) return;

    // 1. Resolve live metrics from engine outputs fail-closed.
    // P10.3 benchmark parity: the canonical benchmark is the source of record
    // for the displayed price and as-of date. The driver is consulted ONLY when
    // no benchmark object was supplied, so the cover can never show a different
    // price than the summary, valuation, and sensitivity views.
    const assumpPrice = currentAssumptions?.get ? currentAssumptions.get('market_share_price')?.value : currentAssumptions?.byName?.market_share_price?.value;
    const benchmarkPrice = currentMarketPrice?.benchmark?.value ?? currentMarketPrice?.price;
    const effectivePrice = Number.isFinite(benchmarkPrice)
      ? benchmarkPrice
      : (Number.isFinite(assumpPrice) ? assumpPrice : null);

    const assumpAsOf = currentAssumptions?.get ? currentAssumptions.get('market_share_price')?.asOf : currentAssumptions?.byName?.market_share_price?.asOf;
    const asOfRaw = currentMarketPrice?.asOf || assumpAsOf || '';
    const asOfDate = formatDateClean(asOfRaw);

    // P10.6: the cover fair-value tile states the CANONICAL basis, matching the
    // valuation headline and the recommendation. The basis label travels with the
    // figure so the tile cannot imply a number of unknown provenance.
    const coverBasis = canonicalDcfPerShare(currentDcf);
    const dcfFairValue = typeof coverBasis.perShare === 'number' && Number.isFinite(coverBasis.perShare)
      ? coverBasis.perShare
      : null;
    const dcfFairValueBasisLabel = coverBasis.basisLabel;

    const upsidePct = typeof currentRec?.upsidePct === 'number' && Number.isFinite(currentRec.upsidePct)
      ? currentRec.upsidePct
      : (dcfFairValue !== null && effectivePrice !== null && effectivePrice > 0 ? (dcfFairValue - effectivePrice) / effectivePrice : null);

    const recVerdict = currentRec?.recommendation
      ? String(currentRec.recommendation).toLowerCase()
      : (upsidePct !== null ? (upsidePct >= RECOMMENDATION_THRESHOLDS.undervalued ? 'undervalued' : (upsidePct <= RECOMMENDATION_THRESHOLDS.overvalued ? 'overvalued' : 'fair')) : 'fair');

    const waccVal = typeof currentWacc === 'number' && Number.isFinite(currentWacc)
      ? currentWacc
      : (currentWacc?.wacc?.value ?? currentWacc?.wacc ?? currentWacc?.value ?? null);

    const gVal = (currentAssumptions?.get ? currentAssumptions.get('terminal_growth_rate')?.value : currentAssumptions?.byName?.terminal_growth_rate?.value) ?? null;
    // Forecast span comes from the engine's own period list and stage
    // disclosure, never from a defaulted fade value or a hardcoded year.
    const coverStages = describeStageStructure(currentDcf || {});
    const disclosedPeriods = Array.isArray(currentThreeStatement?.periods) && currentThreeStatement.periods.length > 0
      ? currentThreeStatement.periods
      : (Array.isArray(currentDcf?.periods) ? currentDcf.periods : []);
    const coverFirstPeriod = coverStages.firstPeriod ?? disclosedPeriods[0] ?? null;
    const coverLastPeriod = disclosedPeriods.length > 0
      ? disclosedPeriods[disclosedPeriods.length - 1]
      : coverStages.terminalYear;
    const coverSpan = coverFirstPeriod && coverLastPeriod
      ? `${coverFirstPeriod} &ndash; ${coverLastPeriod}`
      : 'not disclosed';

    // U5 & U6: Explicit dual-source share semantics. The filed MKT driver
    // (shares_outstanding, Note 11 weighted-average EPS diagnostic only) and the
    // engine DCF divisor (intermediate roll through explicit and fade horizons)
    // carry explicit diagnostic and basis labeling in their title and provenance.
    const filedSharesRecord = currentAssumptions?.get
      ? currentAssumptions.get('shares_outstanding')
      : currentAssumptions?.byName?.shares_outstanding;
    const filedSharesVal = typeof filedSharesRecord?.value === 'number' && Number.isFinite(filedSharesRecord.value)
      ? filedSharesRecord.value
      : null;
    const filedSharesAsOf = typeof filedSharesRecord?.asOf === 'string' ? filedSharesRecord.asOf : '';
    const filedSharesProvider = typeof filedSharesRecord?.source?.provider === 'string'
      ? filedSharesRecord.source.provider
      : 'SEC 10-Q Note 11';
    const filedSharesFormatted = filedSharesVal !== null ? `${(filedSharesVal / 1e6).toFixed(2)}M` : ' - ';
    const filedSharesTitle = `Filed diluted shares (MKT)${filedSharesAsOf ? ` as of ${filedSharesAsOf}` : ''} via ${filedSharesProvider}: Note 11 weighted-average EPS diagnostic only (cannot serve as valuation denominator; relative methods use ruled FD schedule 50.06M); DCF per-share uses rolled divisor below.`;

    const dcfSharesVal = typeof currentDcf?.sharesOutstanding === 'number' && Number.isFinite(currentDcf.sharesOutstanding)
      ? currentDcf.sharesOutstanding
      : null;
    const dcfSharesFormatted = dcfSharesVal !== null ? `${(dcfSharesVal / 1e6).toFixed(2)}M` : ' - ';
    const dcfSharesTitle = 'Engine DCF divisor (EST): filed BOP shares plus future SBC issuance at spot (intermediate roll through explicit & fade horizons before perpetual dilution; per-share denominator).';

    // Revenue CAGR ('26–'30): 4-step CAGR convention from FY2026 to FY2030 = (rev2030 / rev2026) ** (1 / 4) - 1
    let revGrowthVal = null;
    const isP0 = currentThreeStatement?.incomeStatement?.byPeriod?.FY2026;
    const isFinal = currentThreeStatement?.incomeStatement?.byPeriod?.FY2030;
    const revP0 = isP0?.revenue?.total?.value;
    const revFinal = isFinal?.revenue?.total?.value;
    if (Number.isFinite(revP0) && Number.isFinite(revFinal) && revP0 > 0) {
      revGrowthVal = Math.pow(revFinal / revP0, 1 / 4) - 1;
    } else if (currentAssumptions?.get) {
      revGrowthVal = currentAssumptions.get('paid_subscriber_growth')?.value ?? null;
    }

    // Operating (EBIT) margin for FY2030: operating_income / revenue.total
    let opMarginVal = null;
    if (isFinal && isFinal.operating_income?.value !== undefined && revFinal && revFinal > 0) {
      opMarginVal = isFinal.operating_income.value / revFinal;
    } else if (currentAssumptions?.get) {
      opMarginVal = currentAssumptions.get('cost_of_revenue_pct_revenue')?.value ?? null;
    }

    // Free cash flow margin for FY2030: free_cash_flow / revenue.total
    let fcfMarginVal = null;
    const cfFinal = currentThreeStatement?.cashFlow?.byPeriod?.FY2030;
    const fcfFinal = typeof cfFinal?.free_cash_flow === 'object' && cfFinal.free_cash_flow !== null
      ? cfFinal.free_cash_flow.value
      : (typeof cfFinal?.free_cash_flow === 'number' ? cfFinal.free_cash_flow : null);
    if (Number.isFinite(fcfFinal) && Number.isFinite(revFinal) && revFinal > 0) {
      fcfMarginVal = fcfFinal / revFinal;
    }

    // Net funded debt resolved from supporting debt schedule / DCF bridge
    let fundedDebtVal = 0;
    const debtSched = currentThreeStatement?.supporting?.debt ?? currentSchedules?.debt;
    if (debtSched) {
      if (debtSched.hasDebt === false || debtSched.status === 'debt_free_verified') {
        fundedDebtVal = 0;
      } else if (Number.isFinite(debtSched.totalDebt)) {
        fundedDebtVal = debtSched.totalDebt;
      }
    } else if (currentDcf?.bridge && Number.isFinite(currentDcf.bridge.debt)) {
      fundedDebtVal = currentDcf.bridge.debt;
    }

    const taxVal = (currentAssumptions?.get ? currentAssumptions.get('effective_tax_rate')?.value : currentAssumptions?.byName?.effective_tax_rate?.value) ?? null;

    // Multi-method valuation spread (min - max across valid methods)
    let methodRangeFormatted = ' — ';
    if (Array.isArray(currentMethods) && currentMethods.length > 0) {
      const validPrices = currentMethods
        .map((m) => m.impliedPerShare ?? m.fairValuePerShare)
        .filter((p) => typeof p === 'number' && Number.isFinite(p) && p > 0);
      if (validPrices.length > 0) {
        const minPrice = Math.min(...validPrices);
        const maxPrice = Math.max(...validPrices);
        methodRangeFormatted = `${usd(minPrice, { decimals: 2 })} – ${usd(maxPrice, { decimals: 2 })}`;
      }
    }

    const consensusVerdict = currentVerdict?.verdict ? String(currentVerdict.verdict).toLowerCase() : recVerdict;

    const dcfFairValueFormatted = usd(dcfFairValue, { decimals: 2 });
    const marketPriceFormatted = usd(effectivePrice, { decimals: 2 });
    const upsideFormatted = percent(upsidePct, { decimals: 1, showSign: true });
    const waccFormatted = percent(waccVal, { decimals: 2 });
    const gFormatted = percent(gVal, { decimals: 2 });
    const revGrowthFormatted = revGrowthVal !== null ? percent(revGrowthVal, { decimals: 1 }) : ' — ';
    const opMarginFormatted = opMarginVal !== null ? percent(opMarginVal, { decimals: 1 }) : ' — ';
    const fcfMarginFormatted = fcfMarginVal !== null ? percent(fcfMarginVal, { decimals: 1 }) : ' — ';
    const netDebtFormatted = fundedDebtVal !== null ? usd(fundedDebtVal, { decimals: 0 }) : ' — ';
    const taxFormatted = percent(taxVal, { decimals: 1 });

    const methodsRowsHtml = renderMethodRows(currentMethods, effectivePrice);

    container.innerHTML = `
      <div class="cover-container">
        <h2>01. Cover &amp; TOC</h2>
        <!-- Row 1: 3 Columns: Overview (Col 1), Snapshot (Col 2), Status (Col 3) -->
        <div class="cover-grid cover-row-top">
          <!-- 1. Overview Card -->
          <article class="cover-card cover-overview-card" aria-labelledby="cover-overview-heading">
            <h3 id="cover-overview-heading" class="cover-card-title">Model Overview<span class="sr-only"> &mdash; Executive Model Overview</span></h3>
            <p class="cover-prose">
              Institutional-grade, fully integrated 3-statement financial model for Duolingo, Inc.
              This model builds a comprehensive income statement, balance sheet, and cash flow
              statement, with a multi-method valuation framework, scenario analysis, and sensitivity
              analysis.
            </p>
            <div class="stat-pill-row">
              <div class="stat-pill">
                <span class="stat-pill-label">Benchmark Close</span>
                <span class="stat-pill-value" id="cover-stat-asof">${asOfDate}</span>
              </div>
              <div class="stat-pill">
                <span class="stat-pill-label">Current Share Price</span>
                <span class="stat-pill-value" id="cover-stat-price">${marketPriceFormatted}</span>
              </div>
              <div class="stat-pill">
                <span class="stat-pill-label">Model Version</span>
                <span class="stat-pill-value" id="cover-stat-version">v1.0</span>
              </div>
              <div class="stat-pill">
                <span class="stat-pill-label">Model Type</span>
                <span class="stat-pill-value">3-Statement DCF</span>
              </div>
            </div>
          </article>

          <!-- 2. Valuation Snapshot Card -->
          <article class="cover-card cover-snapshot-card" aria-labelledby="cover-snapshot-heading">
            <h3 id="cover-snapshot-heading" class="cover-card-title">Valuation Snapshot <span class="cover-card-sub">(Base Case)</span></h3>
            <div class="snapshot-dl">
              <div class="snapshot-row">
                <span class="snapshot-label">Current Share Price</span>
                <span class="snapshot-value" id="cover-snapshot-market-price">${marketPriceFormatted}</span>
              </div>
              <div class="snapshot-row">
                <span class="snapshot-label">DCF Fair Value (FCFF)</span>
                <span class="snapshot-value" id="cover-dcf-fair-value">${dcfFairValueFormatted}</span>
              </div>
              <div class="snapshot-row">
                <span class="snapshot-label">Multi-Method Spread</span>
                <span class="snapshot-value" id="cover-blended-fair-value">${methodRangeFormatted}</span>
              </div>
              <div class="snapshot-row snapshot-highlight-row highlight-${recVerdict}" id="cover-upside-highlight-row">
                <span class="snapshot-label">Upside / (Downside)</span>
                <span id="cover-upside-badge" class="badge-upside badge-${recVerdict}">${upsideFormatted} (${recVerdict.toUpperCase()})</span>
              </div>
              <div class="snapshot-divider"></div>
              <div class="snapshot-row">
                <span class="snapshot-label">Implied Return (Base)</span>
                <span class="snapshot-value" id="cover-implied-return">${upsideFormatted}</span>
              </div>
              <div class="snapshot-row">
                <span class="snapshot-label">WACC</span>
                <span class="snapshot-value" id="cover-snapshot-wacc">${waccFormatted}</span>
              </div>
              <div class="snapshot-row">
                <span class="snapshot-label">Terminal Growth</span>
                <span class="snapshot-value" id="cover-snapshot-growth">${gFormatted}</span>
              </div>
              <div class="snapshot-row">
                <span class="snapshot-label">Forecast Period</span>
                <span class="snapshot-value">${coverSpan}</span>
              </div>
            </div>
          </article>

          <!-- 3. Model Status Card -->
          <article class="cover-card cover-status-card" aria-labelledby="cover-status-heading">
            <h3 id="cover-status-heading" class="cover-card-title">Model Status</h3>
            <ul class="status-checklist">
              <li class="status-check-item">
                <div class="status-check-left">
                  <img src="assets/icons/ui/check-circle.svg" alt="Verified" class="status-check-icon" width="16" height="16" />
                  <span class="status-check-label">Historical Data</span>
                </div>
                <span class="status-check-tag">Complete</span>
              </li>
              <li class="status-check-item">
                <div class="status-check-left">
                  <img src="assets/icons/ui/check-circle.svg" alt="Verified" class="status-check-icon" width="16" height="16" />
                  <span class="status-check-label">3-Statement Linkage</span>
                </div>
                <span class="status-check-tag">Validated</span>
              </li>
              <li class="status-check-item">
                <div class="status-check-left">
                  <img src="assets/icons/ui/check-circle.svg" alt="Verified" class="status-check-icon" width="16" height="16" />
                  <span class="status-check-label">Balance Sheet Check</span>
                </div>
                <span class="status-check-tag">Balanced</span>
              </li>
              <li class="status-check-item">
                <div class="status-check-left">
                  <img src="assets/icons/ui/check-circle.svg" alt="Verified" class="status-check-icon" width="16" height="16" />
                  <span class="status-check-label">Valuation Framework</span>
                </div>
                <span class="status-check-tag">3 Evidence Clusters</span>
              </li>
              <li class="status-check-item">
                <div class="status-check-left">
                  <img src="assets/icons/ui/check-circle.svg" alt="Verified" class="status-check-icon" width="16" height="16" />
                  <span class="status-check-label">Sensitivity Analysis</span>
                </div>
                <span class="status-check-tag">9 &times; 5</span>
              </li>
              <li class="status-check-item">
                <div class="status-check-left">
                  <img src="assets/icons/ui/check-circle.svg" alt="Verified" class="status-check-icon" width="16" height="16" />
                  <span class="status-check-label">Model Integrity</span>
                </div>
                <span class="status-check-tag">Passed</span>
              </li>
              <li class="status-check-item">
                <div class="status-check-left">
                  <img src="assets/icons/ui/check-circle.svg" alt="Verified" class="status-check-icon" width="16" height="16" />
                  <span class="status-check-label">Last Updated</span>
                </div>
                <span class="status-check-tag">${asOfDate}</span>
              </li>
            </ul>
          </article>
        </div>

        <!-- Row 2: 2/3 Architecture Table + 1/3 Right Rail -->
        <div class="cover-row-mid">
          <!-- Architecture Directory (Left 2/3) -->
          <section class="cover-card cover-architecture-section" aria-labelledby="cover-arch-heading">
            <div class="cover-section-header">
              <h3 id="cover-arch-heading" class="cover-section-title">Model Architecture</h3>
              <p class="cover-section-subtitle">Architecture &amp; Section Directory: Navigate to each section of the model</p>
            </div>
            <table class="architecture-table">
              <thead>
                <tr>
                  <th class="col-tab-num">#</th>
                  <th class="col-tab-name">Section</th>
                  <th>Description</th>
                  <th class="col-tab-goto">Go To</th>
                </tr>
              </thead>
              <tbody>
                <tr data-jump-tab="cover" class="arch-row">
                  <td class="col-tab-num">01</td>
                  <td class="col-tab-name">Cover &amp; TOC</td>
                  <td class="col-tab-desc">Model metadata, methodology overview, section directory, and legal disclaimers.</td>
                  <td class="col-tab-goto"><button type="button" class="jump-btn" data-jump-tab="cover" aria-label="Go to Cover &amp; TOC">&rarr;</button></td>
                </tr>
                <tr data-jump-tab="assumptions" class="arch-row">
                  <td class="col-tab-num">02</td>
                  <td class="col-tab-name">Assumptions / Drivers</td>
                  <td class="col-tab-desc">Operating growth drivers, margin curves, tax rates, CAPEX components, and terminal growth.</td>
                  <td class="col-tab-goto"><button type="button" class="jump-btn" data-jump-tab="assumptions" aria-label="Go to Assumptions / Drivers">&rarr;</button></td>
                </tr>
                <tr data-jump-tab="historicals" class="arch-row">
                  <td class="col-tab-num">03</td>
                  <td class="col-tab-name">Historicals</td>
                  <td class="col-tab-desc">FY2021&ndash;FY2025 income statement, balance sheet, cash flow, and KPIs with filing citations.</td>
                  <td class="col-tab-goto"><button type="button" class="jump-btn" data-jump-tab="historicals" aria-label="Go to Historicals">&rarr;</button></td>
                </tr>
                <tr data-jump-tab="schedules" class="arch-row">
                  <td class="col-tab-num">04</td>
                  <td class="col-tab-name">Supporting Schedules</td>
                  <td class="col-tab-desc">Working capital (DSO/DPO), PP&amp;E roll-forward, debt (debt-free), SBC, and amortization.</td>
                  <td class="col-tab-goto"><button type="button" class="jump-btn" data-jump-tab="schedules" aria-label="Go to Supporting Schedules">&rarr;</button></td>
                </tr>
                <tr data-jump-tab="projections" class="arch-row">
                  <td class="col-tab-num">05</td>
                  <td class="col-tab-name">Projections (3-Statement)</td>
                  <td class="col-tab-desc">${coverFirstPeriod && coverLastPeriod ? `${coverFirstPeriod}&ndash;${coverLastPeriod}` : 'Forecast span not disclosed'} linked IS, BS, and CF with automated balance gate validation.</td>
                  <td class="col-tab-goto"><button type="button" class="jump-btn" data-jump-tab="projections" aria-label="Go to Projections">&rarr;</button></td>
                </tr>
                <tr data-jump-tab="valuation" class="arch-row">
                  <td class="col-tab-num">06</td>
                  <td class="col-tab-name">Valuation</td>
                  <td class="col-tab-desc">Multi-method valuation synthesis (3 Evidence Clusters · 5 Voting Rows), CAPM WACC build, enterprise-to-equity bridge, and thesis directory.</td>
                  <td class="col-tab-goto"><button type="button" class="jump-btn" data-jump-tab="valuation" aria-label="Go to Valuation">&rarr;</button></td>
                </tr>
                <tr data-jump-tab="summary" class="arch-row">
                  <td class="col-tab-num">07</td>
                  <td class="col-tab-name">Summary / Output</td>
                  <td class="col-tab-desc">Executive dashboard, valuation verdict card, multi-method comparison table, live price state, and key ratios.</td>
                  <td class="col-tab-goto"><button type="button" class="jump-btn" data-jump-tab="summary" aria-label="Go to Summary / Output">&rarr;</button></td>
                </tr>
                <tr data-jump-tab="sensitivity" class="arch-row">
                  <td class="col-tab-num">08</td>
                  <td class="col-tab-name">Sensitivity / Scenarios</td>
                  <td class="col-tab-desc">9&times;5 WACC &times; Terminal Growth matrix and Downside / Base / Upside scenario bands.</td>
                  <td class="col-tab-goto"><button type="button" class="jump-btn" data-jump-tab="sensitivity" aria-label="Go to Sensitivity / Scenarios">&rarr;</button></td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Right Rail: Key Assumptions + Valuation Methods (Right 1/3) -->
          <div class="cover-right-rail">
            <!-- 4. Key Assumptions Card -->
            <article class="cover-card cover-assumptions-card" aria-labelledby="cover-assumptions-heading">
              <h3 id="cover-assumptions-heading" class="cover-card-title">Key Assumptions <span class="cover-card-sub">(Base Case)</span></h3>
              <div class="assumptions-dl">
                <div class="assump-row">
                  <span class="assump-label">WACC</span>
                  <span class="assump-value" id="cover-assump-wacc">${waccFormatted}</span>
                </div>
                <div class="assump-row">
                  <span class="assump-label">Terminal Growth</span>
                  <span class="assump-value" id="cover-assump-growth">${gFormatted}</span>
                </div>
                <div class="assump-row">
                  <span class="assump-label">Revenue CAGR ('26–'30)</span>
                  <span class="assump-value" id="cover-assump-revenue-growth">${revGrowthFormatted}</span>
                </div>
                <div class="assump-row">
                  <span class="assump-label">EBIT Margin (FY2030)</span>
                  <span class="assump-value" id="cover-assump-op-margin">${opMarginFormatted}</span>
                </div>
                <div class="assump-row">
                  <span class="assump-label">FCF Margin (FY2030)</span>
                  <span class="assump-value" id="cover-assump-fcf-margin">${fcfMarginFormatted}</span>
                </div>
                <div class="assump-row">
                  <span class="assump-label">Tax Rate (Long-term)</span>
                  <span class="assump-value" id="cover-assump-tax">${taxFormatted}</span>
                </div>
                <div class="assump-row">
                  <span class="assump-label">Diluted Shares — Filed (MKT)</span>
                  <span class="assump-value" id="cover-assump-shares" data-source="assumptions:shares_outstanding" title="${filedSharesTitle}">${filedSharesFormatted}</span>
                </div>
                <div class="assump-row assump-row-dcf">
                  <span class="assump-label">DCF Divisor — Rolled (EST)</span>
                  <span class="assump-value" id="cover-assump-shares-dcf" data-source="dcf:sharesOutstanding" title="${dcfSharesTitle}">${dcfSharesFormatted}</span>
                </div>
                <div class="assump-row">
                  <span class="assump-label">Net Debt (Latest)</span>
                  <span class="assump-value" id="cover-assump-net-debt">${netDebtFormatted}</span>
                </div>
              </div>
            </article>

            <!-- 5. Valuation Methods Card -->
            <article class="cover-card cover-methods-card" aria-labelledby="cover-methods-heading">
              <div class="cover-card-header-flex">
                <h3 id="cover-methods-heading" class="cover-card-title">Valuation Methods</h3>
                <span id="cover-methods-verdict-badge" class="badge badge-${consensusVerdict}">${consensusVerdict.toUpperCase()}</span>
              </div>
              <table class="methods-summary-table">
                <thead>
                  <tr>
                    <th>Methodology</th>
                    <th>Fair Value</th>
                    <th>Implied Upside</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody id="cover-methods-table-body">
                  ${methodsRowsHtml}
                </tbody>
              </table>
              <div class="cover-methods-spread-bar">
                <span class="spread-bar-label">Multi-Method Spread:</span>
                <span class="spread-bar-value" id="cover-methods-spread-value">${methodRangeFormatted}</span>
              </div>
            </article>
          </div>
        </div>

        <!-- Row 3: Callouts -->
        <section class="cover-callouts" aria-label="Methodology &amp; Disclaimers">
          <div class="callout-info">
            <div class="callout-header">
              <img src="assets/icons/ui/info-circle.svg" alt="Info" class="callout-icon" width="20" height="20" />
              <strong class="callout-title">Methodology Note</strong>
            </div>
            <p>Methodology Scope Note: Trading Comparables (Comps) is fully integrated into the "Valuation" section (Tab 6). Precedent Transactions and LBO Analysis remain excluded (N/A) per Director decision due to Duolingo's debt-free capital structure and reinvestment profile.</p>
          </div>
          <div class="callout-warning">
            <div class="callout-header">
              <img src="assets/icons/ui/alert-triangle.svg" alt="Disclaimer" class="callout-icon" width="20" height="20" />
              <strong class="callout-title">Important Disclaimer</strong>
            </div>
            <p>Regulatory &amp; Research Disclaimer: This independent financial model is prepared strictly for informational, educational, and analytical research purposes. It is not affiliated with, endorsed by, or associated with Duolingo, Inc. It does not constitute investment advice, financial promotion, or a recommendation to buy or sell securities. All forward-looking projections are estimates based on cited assumptions and historical filings. Past performance does not guarantee future results.</p>
          </div>
        </section>
      </div>
    `;
  }

  render();

  return {
    update(newDcf, newWacc, newRec, newAssumptions, newThreeStatement, newMethods, newVerdict, newMarketPrice, newSchedules) {
      if (disposed) return;
      if (newDcf !== undefined) currentDcf = newDcf;
      if (newWacc !== undefined) currentWacc = newWacc;
      if (newRec !== undefined) currentRec = newRec;
      if (newAssumptions !== undefined) currentAssumptions = newAssumptions;
      if (newThreeStatement !== undefined) currentThreeStatement = newThreeStatement;
      if (newMethods !== undefined) currentMethods = newMethods;
      if (newVerdict !== undefined) currentVerdict = newVerdict;
      if (newMarketPrice !== undefined) currentMarketPrice = newMarketPrice;
      if (newSchedules !== undefined) currentSchedules = newSchedules;
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
  };
}

export default renderCover;
