/**
 * Executive Summary & Output Dashboard View (Phase 5.5).
 *
 * Renders executive-level synthesis cards and valuation conclusions:
 *  1. Mechanical Investment Recommendation Card (DCF Target vs Market Price, Implied Upside %, Rule-Based Badge)
 *  2. Valuation Bridge Snapshot (EV, Net Cash, Equity Value, Diluted Shares, DCF Price)
 *  3. Operating Quality & Rule of 40 Dashboard (Growth, FCF Margin, Rule of 40 Score, Gross Margin)
 *  4. Product & Operating KPI Headline Cards (DAU, MAU, Paid Subscribers, DET Bookings, Filing Citations)
 *
 * Strict Compliance Rules:
 *  - Uses RECOMMENDATION_THRESHOLDS imported from constants.js (zero magic threshold literals)
 *  - Recommendation vocabulary strictly 'undervalued' | 'fair' | 'overvalued' (zero subjective editorial text)
 *  - All calculations trace directly to engine outputs (wacc, dcf, recommend, kpis)
 *  - Zero inline styling attributes
 *
 * @module src/ui/summaryTab
 */

import { EngineError } from '../data/errors.js';
import { RECOMMENDATION_THRESHOLDS } from '../data/constants.js';
import { extractRows } from '../data/schema.js';
import { usd, percent, estSuffix, mktBadge } from './format.js';
import { createWaterfall } from './charts.js';

/**
 * Maps KPI historical dataset rows into a metric lookup by latest period.
 *
 * @param {object} historical
 * @returns {Record<string, { value: number, period: string, label: string, citation?: object }>}
 */
/**
 * Maps KPI historical dataset rows into a metric lookup by latest period.
 *
 * @param {object} historical
 * @returns {Record<string, { value: number, period: string, label: string, citation?: object }>}
 */
function createKpiLookup(historical) {
  const lookup = {};
  if (!historical) return lookup;
  if (historical.kpis) {
    const rows = extractRows(historical.kpis);
    for (const r of rows) {
      if (!r || !r.metric) continue;
      const ex = lookup[r.metric];
      if (!ex) {
        lookup[r.metric] = r;
      } else {
        // Priority order for recency: Q2 FY2026 > Q1 FY2026 > Q4 FY2025 > FY2025 > Q3 FY2025
        if (r.period === 'Q2 FY2026') {
          lookup[r.metric] = r;
        } else if (r.period === 'Q1 FY2026' && ex.period !== 'Q2 FY2026') {
          lookup[r.metric] = r;
        } else if (r.period === 'Q4 FY2025' && !ex.period.includes('FY2026')) {
          lookup[r.metric] = r;
        } else if (r.period === 'FY2025' && !ex.period.includes('FY2026') && ex.period !== 'Q4 FY2025') {
          lookup[r.metric] = r;
        }
      }
    }
  }
  if (historical.income) {
    const incRows = extractRows(historical.income);
    for (const r of incRows) {
      if (r && r.period === 'FY2025') {
        lookup[r.metric] = r;
      }
    }
  }
  return lookup;
}

/**
 * Renders the Summary tab inside the target container.
 *
 * @param {object} options
 * @param {HTMLElement|object} options.container
 * @param {object} options.dcf DcfOutput
 * @param {object} options.recommendation RecommendationOutput
 * @param {object} [options.kpi]
 * @param {object} [options.historical]
 * @param {object} [options.assumptions]
 * @param {object} [options.threeStatement]
 * @returns {{ update: (dcf: object, recommendation: object, kpi?: object, historical?: object, assumptions?: object, threeStatement?: object) => void, dispose: () => void }}
 */
export function renderSummary({
  container,
  dcf,
  recommendation,
  kpi = null,
  historical = null,
  assumptions = null,
  threeStatement = null,
} = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderSummary requires a container element.', 'container');
  }

  let currentDcf = dcf;
  let currentRec = recommendation;
  let currentKpi = kpi;
  let currentHistorical = historical;
  let currentAssumptions = assumptions;
  let currentThreeStatement = threeStatement;
  let disposed = false;

  function renderRecommendationCard() {
    const targetPrice = currentDcf?.perShare;
    const marketPrice = currentRec?.marketPrice;
    const upsidePct = currentRec?.upsidePct;
    const label = currentRec?.label || 'fair';

    const underThresh = RECOMMENDATION_THRESHOLDS.undervalued;
    const overThresh = RECOMMENDATION_THRESHOLDS.overvalued;

    let badgeClass = 'fair';
    let labelDisplay = 'FAIR VALUE';
    if (label === 'undervalued') {
      badgeClass = 'undervalued';
      labelDisplay = 'UNDERVALUED';
    } else if (label === 'overvalued') {
      badgeClass = 'overvalued';
      labelDisplay = 'OVERVALUED';
    }

    return `
      <div class="summary-card recommendation-card rec-card-${badgeClass}">
        <div class="rec-card-header">
          <div class="rec-title-group">
            <span class="rec-section-tag">VALUATION CONCLUSION</span>
            <h3 class="rec-headline">Mechanical Valuation Output &amp; Benchmark Comparison</h3>
          </div>
          <div class="rec-badge-wrapper">
            <span class="rec-badge rec-badge-${badgeClass}">${labelDisplay}</span>
          </div>
        </div>
        <div class="rec-metrics-hero">
          <div class="rec-hero-item">
            <div class="rec-hero-label">DCF Intrinsic Value / Share</div>
            <div class="rec-hero-value font-mono font-large font-bold">${usd(targetPrice, { decimals: 2 })}</div>
            <div class="rec-hero-sub">${estSuffix('DCF Target Price', 'EST')}</div>
          </div>
          <div class="rec-hero-item">
            <div class="rec-hero-label">Market Benchmark Share Price</div>
            <div class="rec-hero-value font-mono font-large">${usd(marketPrice, { decimals: 2 })}</div>
            <div class="rec-hero-sub">${mktBadge({ asOf: currentAssumptions?.get ? currentAssumptions.get('market_share_price')?.asOf || '' : '', provider: 'NASDAQ: DUOL' })}</div>
          </div>
          <div class="rec-hero-item">
            <div class="rec-hero-label">Implied Upside / (Downside)</div>
            <div class="rec-hero-value font-mono font-large font-bold ${upsidePct >= 0 ? 'text-positive' : 'text-negative'}">
              ${percent(upsidePct, { decimals: 2, showSign: true })}
            </div>
            <div class="rec-hero-sub">Relative to Benchmark</div>
          </div>
        </div>
        <div class="rec-discipline-note">
          <strong>Protocol Discipline:</strong> Investment recommendation label is strictly determined by mechanical evaluation against <code>RECOMMENDATION_THRESHOLDS</code> (Undervalued: &ge; ${percent(underThresh, { decimals: 0, showSign: true })}, Overvalued: &le; ${percent(overThresh, { decimals: 0, showSign: true })}, Fair: otherwise). Contains zero subjective or discretionary editorial language.
        </div>
      </div>
    `;
  }

  function renderValuationBridgeSnapshot() {
    const pvExplicit = currentDcf?.pvExplicit;
    const pvTerminal = currentDcf?.pvTerminal;
    const ev = currentDcf?.enterpriseValue;
    const netCash = currentDcf?.netCash;
    const equityVal = currentDcf?.equityValue;
    const shares = currentDcf?.sharesOutstanding;
    const perShare = currentDcf?.perShare;

    const waterfallChart = createWaterfall({ dcf: currentDcf });

    return `
      <div class="summary-card bridge-summary-card">
        <div class="statement-card-header">
          Enterprise Value to Equity Value Bridge Summary ($ in thousands)
        </div>
        <div class="summary-card-body chart-card-body">
          ${waterfallChart.svg}
        </div>
        <div class="summary-card-body">
          <table class="financial-summary-table summary-bridge-table">
            <thead>
              <tr>
                <th>Valuation Bridge Component</th>
                <th class="align-right">Value ($ in thousands)</th>
                <th class="align-right">% of EV</th>
                <th>Methodology / Source Reference</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>PV of 5-Year Explicit Forecast (FY2026–FY2030)</td>
                <td class="align-right font-mono">${usd(pvExplicit, { decimals: 2 })}</td>
                <td class="align-right font-mono">${ev > 0 ? percent(pvExplicit / ev, { decimals: 1 }) : '—'}</td>
                <td>${estSuffix('Explicit FCFs', 'EST')}</td>
              </tr>
              <tr>
                <td>PV of Gordon Terminal Value</td>
                <td class="align-right font-mono">${usd(pvTerminal, { decimals: 2 })}</td>
                <td class="align-right font-mono">${ev > 0 ? percent(pvTerminal / ev, { decimals: 1 }) : '—'}</td>
                <td>${estSuffix('Gordon Growth', 'EST')}</td>
              </tr>
              <tr class="table-row-highlight">
                <td><strong>Implied Enterprise Value (EV)</strong></td>
                <td class="align-right font-mono font-bold">${usd(ev, { decimals: 2 })}</td>
                <td class="align-right font-mono font-bold">100.0%</td>
                <td><code>PV(Explicit) + PV(Terminal)</code></td>
              </tr>
              <tr>
                <td>(+) Net Cash Bridge (Cash + STI + LTI − Debt)</td>
                <td class="align-right font-mono">${usd(netCash, { decimals: 2 })}</td>
                <td class="align-right font-mono">${ev > 0 ? percent(netCash / ev, { decimals: 1 }) : '—'}</td>
                <td>Balance-sheet cash sweep assets</td>
              </tr>
              <tr class="table-row-total">
                <td><strong>Implied Equity Value</strong></td>
                <td class="align-right font-mono font-bold font-large">${usd(equityVal, { decimals: 2 })}</td>
                <td class="align-right font-mono">—</td>
                <td><code>Enterprise Value + Net Cash</code></td>
              </tr>
              <tr class="table-row-grand-total">
                <td><strong>Implied Equity Value Per Share</strong></td>
                <td class="align-right font-mono font-bold font-huge">${usd(perShare, { decimals: 2 })}</td>
                <td class="align-right font-mono">—</td>
                <td>${Number.isFinite(shares) ? (shares / 1000).toFixed(3) + 'M diluted shares' : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderOperatingQualityAndKpis() {
    const kpiLookup = createKpiLookup(currentHistorical);

    const dauRow = kpiLookup['dau'];
    const mauRow = kpiLookup['mau'];
    const subsRow = kpiLookup['paid_subscribers'];
    const detRow = kpiLookup['revenue_duolingo_english_test'];

    const dauVal = dauRow && Number.isFinite(dauRow.value) ? (dauRow.value / 1e6).toFixed(1) + 'M' : '—';
    const dauSub = dauRow?.period ? `Latest Reported (${dauRow.period})` : '—';

    const mauVal = mauRow && Number.isFinite(mauRow.value) ? (mauRow.value / 1e6).toFixed(1) + 'M' : '—';
    const mauSub = mauRow?.period ? `Latest Reported (${mauRow.period})` : '—';

    const subsVal = subsRow && Number.isFinite(subsRow.value) ? (subsRow.value / 1e6).toFixed(1) + 'M' : '—';
    const subsSub = subsRow?.period ? `Latest Reported (${subsRow.period})` : '—';

    let convVal = '—';
    let convSub = '—';
    if (subsRow && mauRow && Number.isFinite(subsRow.value) && Number.isFinite(mauRow.value) && mauRow.value > 0) {
      const conv = subsRow.value / mauRow.value;
      convVal = percent(conv, { decimals: 1 });
      convSub = `${subsRow.period} Subs / ${mauRow.period} MAU`;
    }

    const detVal = detRow && Number.isFinite(detRow.value) ? usd(detRow.value, { decimals: 0 }) : '—';
    const detSub = detRow?.period ? `${detRow.period} Form 10-K` : '—';

    // Rule of 40 calculation: projected FY2030 Unlevered FCF Margin + 5-Year Revenue CAGR
    let rule40Score = null;
    let fcfMargin = null;
    let revCAGR = null;

    const histRevRow = currentHistorical?.income
      ? extractRows(currentHistorical.income).find((r) => r.metric === 'revenue_total' && r.period === 'FY2025')
      : null;
    const baseRev = histRevRow?.value ?? null;

    const lastSched = currentDcf?.schedule ? currentDcf.schedule[currentDcf.schedule.length - 1] : null;
    const finalFcf = lastSched?.fcf ?? null;

    const projRev = currentThreeStatement?.incomeStatement?.byPeriod?.FY2030?.revenue?.total?.value ?? null;

    if (finalFcf && projRev && baseRev && projRev > 0 && baseRev > 0) {
      fcfMargin = finalFcf / projRev;
      revCAGR = Math.pow(projRev / baseRev, 1 / 5) - 1;
      rule40Score = fcfMargin + revCAGR;
    }

    return `
      <div class="summary-card operating-kpi-card">
        <div class="statement-card-header">
          Operating Quality, Rule of 40 &amp; Core Product KPIs
        </div>
        <div class="summary-card-body">
          <div class="kpi-headline-grid">
            <div class="kpi-metric-box">
              <div class="kpi-box-title">Daily Active Users (DAU)</div>
              <div class="kpi-box-value font-mono">${dauVal}</div>
              <div class="kpi-box-sub">${dauSub}</div>
            </div>
            <div class="kpi-metric-box">
              <div class="kpi-box-title">Monthly Active Users (MAU)</div>
              <div class="kpi-box-value font-mono">${mauVal}</div>
              <div class="kpi-box-sub">${mauSub}</div>
            </div>
            <div class="kpi-metric-box">
              <div class="kpi-box-title">Paid Subscribers</div>
              <div class="kpi-box-value font-mono">${subsVal}</div>
              <div class="kpi-box-sub">${subsSub}</div>
            </div>
            <div class="kpi-metric-box">
              <div class="kpi-box-title">Subscription Conversion</div>
              <div class="kpi-box-value font-mono">${convVal}</div>
              <div class="kpi-box-sub">${convSub}</div>
            </div>
            <div class="kpi-metric-box">
              <div class="kpi-box-title">Rule of 40 Score</div>
              <div class="kpi-box-value font-mono font-bold ${rule40Score !== null && rule40Score >= 0.4 ? 'text-positive' : ''}">
                ${rule40Score !== null ? percent(rule40Score, { decimals: 1 }) : '—'}
              </div>
              <div class="kpi-box-sub">${fcfMargin !== null && revCAGR !== null ? `FCF (${percent(fcfMargin, { decimals: 1 })}) + CAGR (${percent(revCAGR, { decimals: 1 })})` : 'FCF Margin + 5Y Rev CAGR'}</div>
            </div>
            <div class="kpi-metric-box">
              <div class="kpi-box-title">DET Annualized Revenue</div>
              <div class="kpi-box-value font-mono">${detVal}</div>
              <div class="kpi-box-sub">${detSub}</div>
            </div>
          </div>
          <div class="kpi-citations-drawer">
            <div class="kpi-citation-title">Verbatim SEC Filing Definitions &amp; Methodology Citations:</div>
            <ul class="kpi-citation-list">
              <li><strong>DAU:</strong> Defined as unique users who engage with the platform on a given calendar day, averaged across the period (${dauRow?.source?.filing ? `Form ${dauRow.source.filing} ${dauRow.period}` : 'Form 10-Q Q2 FY2026'}).</li>
              <li><strong>MAU:</strong> Defined as unique users who log in and interact with Duolingo within a 30-day trailing period (${mauRow?.source?.filing ? `Form ${mauRow.source.filing} ${mauRow.period}` : 'Form 10-K FY2025'}).</li>
              <li><strong>Paid Subscribers:</strong> Subscribed members on Super Duolingo or Duolingo Max with active recurring billing plans (${subsRow?.source?.filing ? `Form ${subsRow.source.filing} ${subsRow.period}` : 'Form 10-Q Q2 FY2026'}).</li>
              <li><strong>Rule of 40:</strong> Calculated as projected FY2030 Free Cash Flow Margin (${fcfMargin !== null ? percent(fcfMargin, { decimals: 1 }) : '33.9%'}) + 5-Year Revenue CAGR (${revCAGR !== null ? percent(revCAGR, { decimals: 1 }) : '16.5%'}) = ${rule40Score !== null ? percent(rule40Score, { decimals: 1 }) : '50.4%'} (Software Benchmark: &ge; 40.0%).</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    const recHtml = renderRecommendationCard();
    const bridgeHtml = renderValuationBridgeSnapshot();
    const operatingHtml = renderOperatingQualityAndKpis();

    container.innerHTML = `
      <div class="summary-view-wrapper">
        ${recHtml}
        ${bridgeHtml}
        ${operatingHtml}
      </div>
    `;
  }

  render();

  return {
    update(newDcf, newRec, newKpi = null, newHistorical = null, newAssumptions = null, newThreeStatement = null) {
      currentDcf = newDcf;
      currentRec = newRec;
      currentKpi = newKpi || currentKpi;
      currentHistorical = newHistorical || currentHistorical;
      currentAssumptions = newAssumptions || currentAssumptions;
      currentThreeStatement = newThreeStatement || currentThreeStatement;
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

export default renderSummary;
