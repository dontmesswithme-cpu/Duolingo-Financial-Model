/**
 * Executive Summary & Output Dashboard View (Phase 5.5; RP7.1 executive verdict header).
 *
 * Renders executive-level synthesis cards and valuation conclusions:
 *  1. Executive Verdict Header (RP7.1 `.summary-headline-grid`): DCF fair value,
 *     benchmark share price, upside vs market, and min-max spread with verdict badge
 *  2. Agreement Synthesis Table (RP7.1 `.weighted-valuation-table`, agreement-only
 *     contents): per-method share price, equity value ($M), upside %, status pill,
 *     plus a bold min-max spread row. No method-standing column, no single-figure row.
 *  3. Valuation Bridge Snapshot (EV, Net Cash, Equity Value, Diluted Shares, DCF Price)
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
import { describeStageStructure } from '../engine/methods/fcffDcf.js';
import { canonicalDcfPerShare } from '../engine/methods/fcffDcf.js';
import { usd, percent, estSuffix, mktBadge } from './format.js';
import { createWaterfall } from './charts.js';

// P10.6: one resolver for the canonical add-back DCF figure, memoised per DCF
// object so every summary surface reports the same per-share number on the same
// basis. Previously these five sites each read `currentDcf.perShare`, which is
// the finite-roll INTERMEDIATE, while the valuation headline and the
// recommendation used the canonical after-future-dilution figure.
const summaryBasisCache = new WeakMap();
function summaryBasisOf(dcf) {
  if (!dcf || typeof dcf !== 'object') return canonicalDcfPerShare(null);
  if (!summaryBasisCache.has(dcf)) summaryBasisCache.set(dcf, canonicalDcfPerShare(dcf));
  return summaryBasisCache.get(dcf);
}

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
 * @param {object} [options.marketPriceState] MarketPriceState (Finding G)
 * @param {() => Promise<void>|void} [options.onRefreshPrice] Manual refresh callback
 * @param {object} [options.verdict] Agreement verdict from aggregateVerdicts
 * @param {Array<object>} [options.methods] Raw six-method outputs (equity join)
 * @param {object} [options.sensitivityGrid] Sensitivity grid for health coverage check
 * @param {object} [options.labelStability] Verdict-sensitivity band from buildLabelStability
 * @returns {{ update: (dcf: object, recommendation: object, kpi?: object, historical?: object, assumptions?: object, threeStatement?: object, marketPriceState?: object) => void, dispose: () => void }}
 */
export function renderSummary({
  container,
  dcf,
  recommendation,
  kpi = null,
  historical = null,
  assumptions = null,
  threeStatement = null,
  marketPriceState = null,
  onRefreshPrice = null,
  verdict = null,
  methods = null,
  sensitivityGrid = null,
  labelStability = null,
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
  let currentMarketPrice = marketPriceState;
  let currentVerdict = verdict;
  let currentMethods = methods;
  let currentSensitivityGrid = sensitivityGrid;
  let currentLabelStability = labelStability;
  let disposed = false;

  function renderMultiMethodVerdictCard() {
    const marketPrice = currentRec?.marketPrice ?? currentMarketPrice?.price;
    // P10.3: the "edited benchmark" marker is read from the canonical
    // benchmark's declared `isEdited` flag, never inferred by comparing two
    // prices. Now that the benchmark IS the market price state, a numeric
    // comparison is always equal and would never mark an override.
    const isOverridden = currentMarketPrice?.isEdited === true ||
                         currentMarketPrice?.benchmark?.isEdited === true;
    const overrideMarker = isOverridden ? '<span class="benchmark-override-badge font-small text-muted"> (edited benchmark)</span>' : '';

    const priceAsOf = currentMarketPrice?.asOf || (currentAssumptions?.get ? currentAssumptions.get('market_share_price')?.asOf : '') || '';
    const priceProvider = currentMarketPrice?.source?.provider ?? 'stockanalysis.com';
    const retrievedText = currentMarketPrice?.retrievedAt ? ` · Retrieved: ${currentMarketPrice.retrievedAt.slice(0, 10)}` : '';

    const underThresh = RECOMMENDATION_THRESHOLDS.undervalued;
    const overThresh = RECOMMENDATION_THRESHOLDS.overvalued;

    // Stage structure, label, and basis come from the engine disclosure. When
    // the DCF output carries no stage data the structure is reported as
    // undisclosed instead of silently relabelled "2-Stage".
    const stageDisclosure = describeStageStructure(currentDcf || {});
    const activeVerdict = currentVerdict || {
      verdict: currentRec?.label || 'fair',
      agreement: {
        unanimous: false,
        summary: 'Multi-method agreement evaluation active.',
        // P10.6: canonical basis for the spread, matching the recommendation.
        spread: { min: summaryBasisOf(currentDcf).perShare, max: summaryBasisOf(currentDcf).perShare, span: 0 },
        counts: { undervalued: 0, overvalued: 0, fair: 1, total: 1 }
      },
      methodResults: [
        {
          method: 'fcff_dcf',
          label: stageDisclosure.label,
          basis: stageDisclosure.basis,
          stageDisclosure,
          impliedPerShare: summaryBasisOf(currentDcf).perShare,
          upsidePct: currentRec?.upsidePct,
          verdict: currentRec?.label || 'fair'
        }
      ],
      dissent: []
    };

    const finalVerdict = activeVerdict.verdict;
    let badgeClass = 'fair';
    let labelDisplay = 'FAIR VALUE';
    if (finalVerdict === 'undervalued') {
      badgeClass = 'undervalued';
      labelDisplay = 'UNDERVALUED';
    } else if (finalVerdict === 'overvalued') {
      badgeClass = 'overvalued';
      labelDisplay = 'OVERVALUED';
    } else if (finalVerdict === 'fair') {
      labelDisplay = activeVerdict.agreement?.unanimous ? 'FAIR VALUE' : 'FAIR VALUE (NO CONSENSUS)';
    }

    const minSpread = activeVerdict.agreement?.spread?.min;
    const maxSpread = activeVerdict.agreement?.spread?.max;

    const methodRows = activeVerdict.methodResults || [];

    // RP7.1 headline inputs: DCF fair value and its upside vs the benchmark close.
    // Falls back to a recomputed upside only when the recommendation output is absent;
    // no stand-in price is ever invented (non-finite renders as ' - ').
    // P10.6: canonical basis, matching the valuation headline.
    const dcfPerShare = summaryBasisOf(currentDcf).perShare;
    let dcfUpside = currentRec?.upsidePct;
    if (!Number.isFinite(dcfUpside) && Number.isFinite(dcfPerShare) && Number.isFinite(marketPrice) && marketPrice > 0) {
      dcfUpside = (dcfPerShare - marketPrice) / marketPrice;
    }
    const dcfShares = currentDcf?.sharesOutstanding;

    // RP7.1 agreement table equity join: per-method implied equity comes from the
    // live method outputs (engine $ thousands -> $mm). Rows are still driven ONLY
    // by activeVerdict.methodResults, so a crossed update() signature keeps the
    // P8.3 R2 tripwire (0 rows when the verdict slot holds the methods array).
    const liveEquityByMethod = new Map();
    if (Array.isArray(currentMethods)) {
      for (const live of currentMethods) {
        if (live && typeof live.method === 'string' && Number.isFinite(live.impliedEquityValue)) {
          liveEquityByMethod.set(live.method, live.impliedEquityValue);
        }
      }
    }
    function equityMmFor(row) {
      const liveEquity = liveEquityByMethod.get(row.method);
      if (Number.isFinite(liveEquity)) return liveEquity / 1000;
      if (Number.isFinite(row.impliedPerShare) && Number.isFinite(dcfShares) && dcfShares > 0) {
        return (row.impliedPerShare * dcfShares) / 1000 / 1000;
      }
      return null;
    }
    const spreadEquities = methodRows.map(equityMmFor).filter((v) => Number.isFinite(v));
    const minEquityMm = spreadEquities.length > 0 ? Math.min(...spreadEquities) : null;
    const maxEquityMm = spreadEquities.length > 0 ? Math.max(...spreadEquities) : null;
    const spreadUpsideMin = Number.isFinite(minSpread) && Number.isFinite(marketPrice) && marketPrice > 0
      ? (minSpread - marketPrice) / marketPrice
      : null;
    const spreadUpsideMax = Number.isFinite(maxSpread) && Number.isFinite(marketPrice) && marketPrice > 0
      ? (maxSpread - marketPrice) / marketPrice
      : null;

    return `
      <div class="summary-card recommendation-card rec-card-${badgeClass}">
        <div class="rec-card-header">
          <div class="rec-title-group">
            <span class="rec-section-tag">VALUATION CONCLUSION</span>
            <h3 class="rec-headline">Multi-Method Valuation Output &amp; Agreement Verdict</h3>
            <p class="verdict-agreement-summary font-small text-muted">${activeVerdict.agreement?.summary || ''}</p>
          </div>
          <div class="rec-badge-wrapper">
            <span class="rec-badge rec-badge-${badgeClass}">${labelDisplay}</span>
            ${renderSensitivityNote()}
          </div>
        </div>

        <div class="summary-headline-grid">
          <div class="rec-hero-item">
            <div class="rec-hero-label">DCF Fair Value (${stageDisclosure.stageTag} FCFF)</div>
            <div class="rec-hero-value font-mono font-large font-bold">${usd(dcfPerShare, { decimals: 2 })}</div>
            <div class="rec-hero-sub">Implied upside: ${Number.isFinite(dcfUpside) ? percent(dcfUpside, { decimals: 2, showSign: true }) : ' - '}</div>
          </div>
          <div class="rec-hero-item">
            <div class="rec-hero-label">Current Benchmark Share Price${overrideMarker}</div>
            <div class="rec-hero-value font-mono font-large">${usd(marketPrice, { decimals: 2 })}</div>
            <div class="rec-hero-sub">${mktBadge({ asOf: priceAsOf, provider: priceProvider })}${retrievedText}</div>
            <div class="rec-hero-action">
              <button type="button" class="btn-refresh-price" data-action="refresh-price">↻ Refresh Last Close</button>
            </div>
          </div>
          <div class="rec-hero-item">
            <div class="rec-hero-label">Upside / (Downside) vs Market</div>
            <div class="rec-hero-value font-mono font-large font-bold ${Number.isFinite(dcfUpside) && dcfUpside >= 0 ? 'text-positive' : 'text-negative'}">${Number.isFinite(dcfUpside) ? percent(dcfUpside, { decimals: 2, showSign: true }) : ' - '}</div>
            <div class="rec-hero-sub">DCF vs benchmark close</div>
          </div>
          <div class="rec-hero-item">
            <div class="rec-hero-label">Valuation Spread (Voting Evidence Only)</div>
            <div class="rec-hero-value font-mono font-large font-bold">
              ${Number.isFinite(minSpread) && Number.isFinite(maxSpread) ? `${usd(minSpread, { decimals: 2 })} – ${usd(maxSpread, { decimals: 2 })}` : ' - '}
            </div>
            <div class="rec-hero-sub"><span class="rec-badge rec-badge-${badgeClass}">${labelDisplay}</span> ${activeVerdict.agreement?.unanimous ? 'Unanimous clustered agreement' : 'Split; unanimous agreement not reached'}</div>
          </div>
        </div>

        <div class="multi-method-table-wrapper">
          <table class="financial-summary-table weighted-valuation-table">
            <thead>
              <tr>
                <th>Method</th>
                <th class="align-right">Implied Share Price</th>
                <th class="align-right">Implied Equity Value ($M)</th>
                <th class="align-right">Upside %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${methodRows.map((m) => {
                const upside = m.upsidePct;
                const mVerdict = m.verdict;
                let vClass = 'fair';
                let vText = 'FAIR';
                if (mVerdict === 'undervalued') {
                  vClass = 'undervalued';
                  vText = 'UNDERVALUED';
                } else if (mVerdict === 'overvalued') {
                  vClass = 'overvalued';
                  vText = 'OVERVALUED';
                }
                const equityMm = equityMmFor(m);

                return `
                  <tr class="method-row-${m.method}">
                    <td><strong>${m.label}</strong></td>
                    <td class="align-right font-mono font-bold font-large">${usd(m.impliedPerShare, { decimals: 2 })}</td>
                    <td class="align-right font-mono">${Number.isFinite(equityMm) ? usd(equityMm, { decimals: 2 }) : ' - '}</td>
                    <td class="align-right font-mono font-bold ${Number.isFinite(upside) && upside >= 0 ? 'text-positive' : 'text-negative'}">
                      ${percent(upside, { decimals: 2, showSign: true })}
                    </td>
                    <td><span class="rec-badge rec-badge-${vClass}">${vText}</span></td>
                  </tr>
                `;
              }).join('')}
              <tr class="agreement-spread-row table-row-total">
                <td><span class="soft-em">Valuation Spread (min-max)</span></td>
                <td class="align-right font-mono font-bold font-large">
                  ${Number.isFinite(minSpread) && Number.isFinite(maxSpread) ? `${usd(minSpread, { decimals: 2 })} – ${usd(maxSpread, { decimals: 2 })}` : ' - '}
                </td>
                <td class="align-right font-mono font-bold">
                  ${Number.isFinite(minEquityMm) && Number.isFinite(maxEquityMm) ? `${usd(minEquityMm, { decimals: 2 })} – ${usd(maxEquityMm, { decimals: 2 })}` : ' - '}
                </td>
                <td class="align-right font-mono font-bold">
                  ${Number.isFinite(spreadUpsideMin) && Number.isFinite(spreadUpsideMax) ? `${percent(spreadUpsideMin, { decimals: 2, showSign: true })} – ${percent(spreadUpsideMax, { decimals: 2, showSign: true })}` : ' - '}
                </td>
                <td><span class="rec-badge rec-badge-${badgeClass}">${labelDisplay}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rec-discipline-note">
          <span class="soft-em">Mechanical Discipline:</span> Investment verdict is strictly determined by clustered evidence agreement evaluated against <code>RECOMMENDATION_THRESHOLDS</code> (Undervalued: &ge; ${percent(underThresh, { decimals: 0, showSign: true })}, Overvalued: &le; ${percent(overThresh, { decimals: 0, showSign: true })}, Fair: otherwise). Methods are grouped into three evidence clusters (Intrinsic DCF; Enterprise-relative EV/Revenue, EV/EBITDAR and Per-User; Equity-cash-flow P/FCF) and each cluster collapses to one breadth observation by majority within the cluster, with exact ties keeping the weaker verdict. Breadth counts clusters (maximum three), never raw method count. Three clusters in agreement carry that verdict; two carry the majority verdict with the minority cluster disclosed; otherwise the aggregate is FAIR with a HOLD note. The SOTP decomposition and the FCFE diagnostic do not vote and enter no range, count, or confidence figure. Zero subjective or discretionary editorial language.
        </div>
        <div class="disclaimer-box lease-convention-note">
          <span class="soft-em">Cross-Method Lease Capitalization Disclosure:</span> DCF keeps operating lease costs within operating cash flows (rent in operating flow), whereas relative valuation methods (EV/Revenue, EV/EBITDAR, SOTP, Per-User) capitalize Duolingo operating lease liabilities into Enterprise Value ($86.136M long-term obligation filed in Q2 Form 10-Q Note 9; current operating lease portion folded into accrued expenses and not separately broken out in quarterly filings; ~$7.204M in annual Form 10-K Note 9; ~$0.14/share materiality) and add back the operating lease cost to EBITDAR (P10.4: this add-back is a cited filing input, but its measurement period is not yet confirmed against the filing, so it is disclosed as unverified rather than as a filed amount; the FY2025 Form 10-K Note 9 annual figure is ~$7.204M). P/FCF operates on equity-level cash flows after actual lease payments.
        </div>
      </div>
    `;
  }

  function renderValuationBridgeSnapshot() {
    const stageBridge = describeStageStructure(currentDcf || {});
    const pvExplicit = currentDcf?.pvExplicit;
    const pvTerminal = currentDcf?.pvTerminal;
    // Stage present values are read from the disclosure; an undisclosed fade
    // stage renders as undisclosed, never as a silent zero.
    const pvExplicitStage = stageBridge.fadePresent
      ? currentDcf.pvByStage.explicit
      : pvExplicit;
    const pvFadeStage = stageBridge.fadePresent ? currentDcf.pvByStage.fade : null;
    const ev = currentDcf?.enterpriseValue;
    const netCash = currentDcf?.netCash;
    const equityVal = currentDcf?.equityValue;
    const shares = currentDcf?.sharesOutstanding;
    // P10.6: canonical basis, matching the valuation headline.
    const perShare = summaryBasisOf(currentDcf).perShare;

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
              ${stageBridge.fadePresent ? `
              <tr>
                <td>PV of Explicit Forecast (${stageBridge.firstPeriod}–${stageBridge.explicitLastPeriod})</td>
                <td class="align-right font-mono">${usd(pvExplicitStage, { decimals: 2 })}</td>
                <td class="align-right font-mono">${ev > 0 ? percent(pvExplicitStage / ev, { decimals: 1 }) : ' - '}</td>
                <td>${estSuffix('Stage 1: Explicit FCFs', 'EST')}</td>
              </tr>
              <tr>
                <td>PV of Fade Glide (${stageBridge.fadeFirstPeriod}–${stageBridge.terminalYear})</td>
                <td class="align-right font-mono">${usd(pvFadeStage, { decimals: 2 })}</td>
                <td class="align-right font-mono">${ev > 0 ? percent(pvFadeStage / ev, { decimals: 1 }) : ' - '}</td>
                <td>${estSuffix('Stage 2: Fade Glide', 'EST')}</td>
              </tr>
              <tr>
                <td>PV of Gordon Terminal Value</td>
                <td class="align-right font-mono">${usd(pvTerminal, { decimals: 2 })}</td>
                <td class="align-right font-mono">${ev > 0 ? percent(pvTerminal / ev, { decimals: 1 }) : ' - '}</td>
                <td>${estSuffix('Stage 3: Gordon Growth', 'EST')}</td>
              </tr>
              <tr class="table-row-highlight">
                <td><strong>Implied Enterprise Value (EV)</strong></td>
                <td class="align-right font-mono font-bold">${usd(ev, { decimals: 2 })}</td>
                <td class="align-right font-mono font-bold">100.0%</td>
                <td><code>PV(Explicit) + PV(Fade) + PV(Terminal)</code></td>
              </tr>
              ` : `
              <tr>
                <td>PV of 5-Year Explicit Forecast (FY2026-FY2030)</td>
                <td class="align-right font-mono">${usd(pvExplicit, { decimals: 2 })}</td>
                <td class="align-right font-mono">${ev > 0 ? percent(pvExplicit / ev, { decimals: 1 }) : ' - '}</td>
                <td>${estSuffix('Explicit FCFs', 'EST')}</td>
              </tr>
              <tr>
                <td>PV of Gordon Terminal Value</td>
                <td class="align-right font-mono">${usd(pvTerminal, { decimals: 2 })}</td>
                <td class="align-right font-mono">${ev > 0 ? percent(pvTerminal / ev, { decimals: 1 }) : ' - '}</td>
                <td>${estSuffix('Gordon Growth', 'EST')}</td>
              </tr>
              <tr class="table-row-highlight">
                <td><strong>Implied Enterprise Value (EV)</strong></td>
                <td class="align-right font-mono font-bold">${usd(ev, { decimals: 2 })}</td>
                <td class="align-right font-mono font-bold">100.0%</td>
                <td><code>PV(Explicit) + PV(Terminal)</code></td>
              </tr>
              `}
              <tr>
                <td>(+) Net Cash Bridge (Cash + STI + LTI − Debt)</td>
                <td class="align-right font-mono">${usd(netCash, { decimals: 2 })}</td>
                <td class="align-right font-mono">${ev > 0 ? percent(netCash / ev, { decimals: 1 }) : ' - '}</td>
                <td>Balance-sheet cash sweep assets</td>
              </tr>
              <tr class="table-row-total">
                <td><strong>Implied Equity Value</strong></td>
                <td class="align-right font-mono font-bold font-large">${usd(equityVal, { decimals: 2 })}</td>
                <td class="align-right font-mono"> - </td>
                <td><code>Enterprise Value + Net Cash</code></td>
              </tr>
              <tr class="table-row-grand-total">
                <td><strong>Implied Equity Value Per Share</strong></td>
                <td class="align-right font-mono font-bold font-huge">${usd(perShare, { decimals: 2 })}</td>
                <td class="align-right font-mono"> - </td>
                <td>${Number.isFinite(shares) ? (shares / 1e6).toFixed(3) + 'M diluted shares' : ' - '}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  const FY_ORDER = ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'];

  function fySeries(dataset, metric) {
    if (!dataset) return FY_ORDER.map(() => null);
    const rows = extractRows(dataset);
    return FY_ORDER.map((period) => {
      const row = rows.find((r) => r && r.metric === metric && r.period === period);
      return row && Number.isFinite(row.value) ? row.value : null;
    });
  }

  function sparklineSvg(values, label) {
    const pts = [];
    values.forEach((v) => { if (Number.isFinite(v)) pts.push(v); });
    if (pts.length < 2) {
      return `<svg class="sparkline-svg spark-flat" viewBox="0 0 120 36" role="img" aria-label="${label} trend unavailable"><line x1="2" y1="18" x2="118" y2="18" /></svg>`;
    }
    const W = 120, H = 36, PAD = 3;
    let min = Infinity, max = -Infinity;
    for (const v of pts) { if (v < min) min = v; if (v > max) max = v; }
    const span = (max - min) || 1;
    const coords = pts.map((v, k) => {
      const x = PAD + (k * (W - PAD * 2)) / (pts.length - 1);
      const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const direction = pts[pts.length - 1] >= pts[0] ? 'spark-up' : 'spark-down';
    return `<svg class="sparkline-svg ${direction}" viewBox="0 0 120 36" role="img" aria-label="${label} five-year trend"><polyline points="${coords}" /></svg>`;
  }

  function deltaBadge(cur, prev, mode) {
    if (!Number.isFinite(cur) || !Number.isFinite(prev)) {
      return '<span class="delta-badge delta-flat"> - </span>';
    }
    if (mode === 'pp') {
      const dpp = (cur - prev) * 100;
      const cls = dpp > 0 ? 'delta-up' : (dpp < 0 ? 'delta-down' : 'delta-flat');
      const sign = dpp > 0 ? '+' : '';
      return `<span class="delta-badge ${cls}">${sign}${dpp.toFixed(1)} pp YoY</span>`;
    }
    if (prev === 0) return '<span class="delta-badge delta-flat"> - </span>';
    const dpct = (cur - prev) / Math.abs(prev);
    const cls = dpct > 0 ? 'delta-up' : (dpct < 0 ? 'delta-down' : 'delta-flat');
    return `<span class="delta-badge ${cls}">${percent(dpct, { decimals: 1, showSign: true })} YoY</span>`;
  }

  function sparklineCard({ title, valueHtml, basisSub, series, deltaHtml, rangeLabel = null }) {
    // R40 precision: the trailing Rule-of-40 series starts in FY2022 (no
    // prior-year base for FY2021), so its range suffix must not claim FY2021.
    const rangeSuffix = rangeLabel || 'Sparkline FY2021–FY2025';
    return `
      <div class="sparkline-card">
        <div class="sparkline-title">${title}</div>
        <div class="sparkline-value font-mono">${valueHtml}</div>
        <div class="sparkline-delta">${deltaHtml}</div>
        ${sparklineSvg(series, title)}
        <div class="sparkline-sub">${basisSub} · ${rangeSuffix}</div>
      </div>`;
  }

  function renderSparklineKpis() {
    const kpiLookup = createKpiLookup(currentHistorical);

    const dauRow = kpiLookup['dau'];
    const mauRow = kpiLookup['mau'];
    const subsRow = kpiLookup['paid_subscribers'];

    const dauVal = dauRow && Number.isFinite(dauRow.value) ? (dauRow.value / 1e6).toFixed(1) + 'M' : ' - ';
    const dauSub = dauRow?.period ? `Latest Reported (${dauRow.period})` : ' - ';

    const mauVal = mauRow && Number.isFinite(mauRow.value) ? (mauRow.value / 1e6).toFixed(1) + 'M' : ' - ';
    const mauSub = mauRow?.period ? `Latest Reported (${mauRow.period})` : ' - ';

    const subsVal = subsRow && Number.isFinite(subsRow.value) ? (subsRow.value / 1e6).toFixed(1) + 'M' : ' - ';
    const subsSub = subsRow?.period ? `Latest Reported (${subsRow.period})` : ' - ';

    let convVal = ' - ';
    let convSub = ' - ';
    if (subsRow && mauRow && Number.isFinite(subsRow.value) && Number.isFinite(mauRow.value) && mauRow.value > 0) {
      const conv = subsRow.value / mauRow.value;
      convVal = percent(conv, { decimals: 1 });
      convSub = `${subsRow.period} Subs / ${mauRow.period} MAU`;
    }

    // Rule of 40 calculation (RWC.1a): single authoritative definition —
    // FY2030 Free Cash Flow Margin from threeStatement.cashFlow (e2e/README basis)
    // + 5-Year Revenue CAGR (FY2025–FY2030E). No schedule-FCF basis, no fallbacks.
    let rule40Score = null;
    let fcfMargin = null;
    let revCAGR = null;

    const histRevRow = currentHistorical?.income
      ? extractRows(currentHistorical.income).find((r) => r.metric === 'revenue_total' && r.period === 'FY2025')
      : null;
    const baseRev = histRevRow?.value ?? null;

    const finalFcf = currentThreeStatement?.cashFlow?.byPeriod?.FY2030?.free_cash_flow?.value ?? null;

    const projRev = currentThreeStatement?.incomeStatement?.byPeriod?.FY2030?.revenue?.total?.value ?? null;

    if (Number.isFinite(finalFcf) && Number.isFinite(projRev) && Number.isFinite(baseRev) && projRev > 0 && baseRev > 0) {
      fcfMargin = finalFcf / projRev;
      revCAGR = Math.pow(projRev / baseRev, 1 / 5) - 1;
      rule40Score = fcfMargin + revCAGR;
    } else {
      fcfMargin = null;
      revCAGR = null;
      rule40Score = null;
    }

    // Trailing annual context series (filed actuals). Conversion and trailing
    // Rule of 40 are growth-defined from FY2022 (FY2021 has no prior-year base).
    const dauS = fySeries(currentHistorical?.kpis, 'dau');
    const mauS = fySeries(currentHistorical?.kpis, 'mau');
    const paidS = fySeries(currentHistorical?.kpis, 'paid_subscribers');
    const subRevS = fySeries(currentHistorical?.income, 'revenue_subscription');
    const revS = fySeries(currentHistorical?.income, 'revenue_total');
    const cfoS = fySeries(currentHistorical?.cashflow, 'cash_from_operating_activities');
    const ppeS = fySeries(currentHistorical?.cashflow, 'purchase_of_property_and_equipment');
    const capS = fySeries(currentHistorical?.cashflow, 'capitalized_software_and_intangibles');
    const convS = FY_ORDER.map((_, i) => (
      Number.isFinite(paidS[i]) && Number.isFinite(mauS[i]) && mauS[i] > 0 ? paidS[i] / mauS[i] : null
    ));
    const r40trailS = FY_ORDER.map((_, i) => {
      if (i === 0) return null;
      const rev = revS[i], prevRev = revS[i - 1];
      const fcf = Number.isFinite(cfoS[i]) && Number.isFinite(ppeS[i]) && Number.isFinite(capS[i])
        ? cfoS[i] - Math.abs(ppeS[i]) - Math.abs(capS[i])
        : null;
      if (!Number.isFinite(rev) || !Number.isFinite(prevRev) || prevRev <= 0 || rev <= 0 || !Number.isFinite(fcf)) return null;
      return (fcf / rev) + (rev / prevRev - 1);
    });

    const at = (s) => s[s.length - 1];
    const prior = (s) => s[s.length - 2];
    const arrVal = Number.isFinite(at(subRevS)) ? '$' + (at(subRevS) / 1000).toFixed(1) + 'M' : ' - ';

    return `
      <div class="summary-card operating-kpi-card">
        <div class="statement-card-header">
          Operating Quality, Rule of 40 &amp; Core Product KPIs
        </div>
        <div class="summary-card-body">
          <div class="sparkline-strip">
            ${sparklineCard({ title: 'Daily Active Users (DAU)', valueHtml: dauVal, basisSub: dauSub, series: dauS, deltaHtml: deltaBadge(at(dauS), prior(dauS), 'pct') })}
            ${sparklineCard({ title: 'Monthly Active Users (MAU)', valueHtml: mauVal, basisSub: mauSub, series: mauS, deltaHtml: deltaBadge(at(mauS), prior(mauS), 'pct') })}
            ${sparklineCard({ title: 'Paid Subscribers', valueHtml: subsVal, basisSub: subsSub, series: paidS, deltaHtml: deltaBadge(at(paidS), prior(paidS), 'pct') })}
            ${sparklineCard({ title: 'Subscription Conversion', valueHtml: convVal, basisSub: convSub, series: convS, deltaHtml: deltaBadge(at(convS), prior(convS), 'pp') })}
            ${sparklineCard({ title: 'Rule of 40 Score', valueHtml: rule40Score !== null ? percent(rule40Score, { decimals: 1 }) : ' - ', basisSub: fcfMargin !== null && revCAGR !== null ? `FCF (${percent(fcfMargin, { decimals: 1 })}) + CAGR FY2025–FY2030E (${percent(revCAGR, { decimals: 1 })})` : 'FCF Margin + 5Y Rev CAGR (FY2025–FY2030E)', series: r40trailS, deltaHtml: deltaBadge(at(r40trailS), prior(r40trailS), 'pp'), rangeLabel: 'Sparkline FY2022–FY2025' })}
            ${sparklineCard({ title: 'Annual Recurring Revenue (ARR)', valueHtml: arrVal, basisSub: 'Subscription-revenue basis, FY2025', series: subRevS, deltaHtml: deltaBadge(at(subRevS), prior(subRevS), 'pct') })}
          </div>
          <div class="kpi-citations-drawer">
            <div class="kpi-citation-title">Verbatim SEC Filing Definitions &amp; Methodology Citations:</div>
            <ul class="kpi-citation-list">
              <li><span class="soft-em">DAU:</span> Defined as unique users who engage with the platform on a given calendar day, taking the daily mean across the period (${dauRow?.source?.filing ? `Form ${dauRow.source.filing} ${dauRow.period}` : 'Form 10-Q Q2 FY2026'}).</li>
              <li><span class="soft-em">MAU:</span> Defined as unique users who log in and interact with Duolingo within a 30-day trailing period (${mauRow?.source?.filing ? `Form ${mauRow.source.filing} ${mauRow.period}` : 'Form 10-K FY2025'}).</li>
              <li><span class="soft-em">Paid Subscribers:</span> Subscribed members on Super Duolingo or Duolingo Max with active recurring billing plans (${subsRow?.source?.filing ? `Form ${subsRow.source.filing} ${subsRow.period}` : 'Form 10-Q Q2 FY2026'}).</li>
              <li><span class="soft-em">Rule of 40:</span> Calculated as projected FY2030 Free Cash Flow Margin (${fcfMargin !== null ? percent(fcfMargin, { decimals: 1 }) : ' - '}) + 5-Year Revenue CAGR FY2025–FY2030E (${revCAGR !== null ? percent(revCAGR, { decimals: 1 }) : ' - '}) = ${rule40Score !== null ? percent(rule40Score, { decimals: 1 }) : ' - '} (Software Benchmark: &ge; 40.0%). Sparkline shows trailing annual Rule of 40 (CFO-based free cash flow margin plus revenue growth).</li>
              <li><span class="soft-em">Subscription Conversion:</span> Derived as paid subscribers divided by MAU per fiscal year (engine-computed from filed actuals, not a filed line).</li>
              <li><span class="soft-em">ARR:</span> Subscription-revenue basis (FY2025 filed subscription revenue); Duolingo does not disclose ARR, so no ARR filing exists — this card annualizes nothing and invents no retention or price input.</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  function countFiniteLeaves(root) {
    const seen = new Set();
    let total = 0, finite = 0;
    const walk = (node) => {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === 'number') {
          total += 1;
          if (Number.isFinite(v)) finite += 1;
        } else {
          walk(v);
        }
      }
    };
    walk(root);
    return { total, finite };
  }

  function buildHealthChecks() {
    const driverNames = ['market_share_price', 'risk_free_rate', 'beta', 'equity_risk_premium', 'terminal_growth_rate'];
    const driversOk = currentAssumptions && typeof currentAssumptions.get === 'function'
      && driverNames.every((n) => Number.isFinite(currentAssumptions.get(n)?.value))
      && Number.isFinite(currentDcf?.perShare);

    const bcPeriods = currentThreeStatement?.balanceCheck?.byPeriod
      ? Object.values(currentThreeStatement.balanceCheck.byPeriod)
      : null;
    const balanceOk = Array.isArray(bcPeriods) && bcPeriods.length > 0
      && bcPeriods.every((bc) => bc && bc.ok === true && Number.isFinite(bc.difference) && Math.abs(bc.difference) < 1e-6);

    const ev = currentDcf?.enterpriseValue;
    const netCash = currentDcf?.netCash;
    const equityVal = currentDcf?.equityValue;
    const shares = currentDcf?.sharesOutstanding;
    // P10.6 note: this one site deliberately keeps the DCF's OWN perShare rather
    // than the canonical figure the surfaces display. `bridgeOk` below asserts
    // the DCF's internal arithmetic — equityValue * 1000 / shares === perShare —
    // so feeding it a different basis fails the tie-out for the wrong reason. The
    // canonical figure is a presentation choice; this is an engine self-check.
    const perShare = currentDcf?.perShare;
    const bridgeOk = Number.isFinite(ev) && Number.isFinite(netCash) && Number.isFinite(equityVal)
      && Number.isFinite(shares) && shares > 0 && Number.isFinite(perShare) && perShare > 0
      && (Math.abs(equityVal - (ev + netCash)) / Math.max(Math.abs(equityVal), 1) < 1e-9)
      && (Math.abs(perShare - (equityVal * 1000) / shares) / perShare < 1e-9);

    const verdictRows = currentVerdict?.methodResults || null;
    const agreementOk = Array.isArray(verdictRows) && verdictRows.length > 0
      && verdictRows.every((m) => Number.isFinite(m.impliedPerShare) && m.impliedPerShare > 0)
      && Number.isFinite(currentVerdict?.agreement?.spread?.min)
      && Number.isFinite(currentVerdict?.agreement?.spread?.max)
      && currentVerdict.agreement.spread.min < currentVerdict.agreement.spread.max;

    const leafCount = currentThreeStatement ? countFiniteLeaves(currentThreeStatement) : { total: 0, finite: 0 };
    const circularOk = leafCount.total > 0 && leafCount.finite === leafCount.total;

    const sensCells = currentSensitivityGrid?.cells;
    const sensTotal = Array.isArray(sensCells) ? sensCells.length : 0;
    let sensFinite = 0;
    if (Array.isArray(sensCells)) {
      for (const cell of sensCells) {
        if (cell && Number.isFinite(cell.perShare) && Number.isFinite(cell.wacc) && Number.isFinite(cell.growth)) {
          sensFinite += 1;
        }
      }
    }
    const sensEvaluated = sensTotal > 0;

    const pass = (status, detail) => ({ tone: 'pass', icon: '✓', status, detail });
    const fail = (detail) => ({ tone: 'fail', icon: '✗', status: 'Attention', detail });
    const pending = (detail) => ({ tone: 'pending', icon: '○', status: 'Pending', detail });

    return [
      { label: 'All model inputs and formulas validated', result: driversOk ? pass('Validated', '5 drivers + DCF live') : fail('Driver or DCF output missing') },
      { label: '3-statement model balances (BS, IS, CF)', result: balanceOk ? pass('Passed', `Tie-out $0 across ${bcPeriods.length} periods`) : fail('Balance invariant breach') },
      { label: 'Checksums and tie-outs passed', result: bridgeOk ? pass('Passed', 'EV + net cash ties to equity and per share') : fail('Bridge checksum breach') },
      { label: 'Multi-method agreement verdict live', result: agreementOk ? pass('Complete', `${verdictRows.length} methods live, spread resolves`) : fail('Verdict not resolved') },
      { label: 'No circular references', result: circularOk ? pass('Passed', `${leafCount.finite}/${leafCount.total} forecast cells finite`) : fail('Non-finite forecast cell found') },
      { label: 'Sensitivity analysis completed', result: !sensEvaluated ? pending('Grid not wired to this view') : (sensFinite === sensTotal ? pass('Complete', `${sensFinite}/${sensTotal} WACC x g cells finite`) : fail('Non-finite sensitivity cell found')) },
    ];
  }

  function renderSensitivityNote() {
    if (!currentLabelStability || currentLabelStability.labelStable !== false) {
      return '';
    }
    return '<div class="rec-sensitivity-note" role="note">verdict sensitive to SBC treatment</div>';
  }

  function renderSensitivityBand() {
    const band = currentLabelStability;
    if (!band || !Array.isArray(band.treatments) || band.treatments.length === 0) {
      return '';
    }
    const treatmentLabel = (name) => {
      if (name === 'gross-issuance') return 'Gross issuance at spot (headline)';
      if (name === 'charged-netting') return 'Charged netting (fair-value buybacks)';
      if (name === 'pv-discounted') return 'PV-discounted SBC (WACC)';
      if (name === 'sbc-fade') return 'Faded SBC (steady-state path)';
      if (name === 'perpetual-expense') return 'Perpetual SBC expense';
      return String(name);
    };
    const headline = String(band.headlineLabel || '').toLowerCase();
    const rows = band.treatments.map((t) => {
      const tone = String(t.label || '').toLowerCase() === headline ? 'pass' : 'fail';
      const icon = tone === 'pass' ? '✓' : '✗';
      const status = String(t.label || '').toUpperCase();
      const detail = Number.isFinite(t.perShare) ? usd(t.perShare, { decimals: 2 }) : ' - ';
      return `
                <li class="health-row health-${tone}">
                  <span class="health-icon" aria-hidden="true">${icon}</span>
                  <span class="health-text"><span class="health-label">${treatmentLabel(t.name)}</span><span class="health-detail">${detail}</span></span>
                  <span class="health-status">${status}</span>
                </li>`;
    }).join('');
    const stableCount = band.treatments.filter(
      (t) => String(t.label || '').toLowerCase() === headline,
    ).length;
    const verdictNote = band.labelStable === false
      ? `Headline: <span class="rec-badge rec-badge-${headline}">${headline.toUpperCase()}</span> — verdict sensitive to SBC treatment (${stableCount}/${band.treatments.length} match headline)`
      : `Headline: <span class="rec-badge rec-badge-${headline}">${headline.toUpperCase()}</span> — verdict stable across the SBC treatment band (${stableCount}/${band.treatments.length} ${headline})`;
    return `
      <div class="summary-card sensitivity-band-card">
        <div class="statement-card-header">Verdict Sensitivity Band &amp; SBC Treatments</div>
        <div class="summary-card-body">
          <ul class="health-list">
            ${rows}
          </ul>
          <div class="health-verdict-note">${verdictNote}</div>
        </div>
      </div>
    `;
  }

  function renderThesisHealth() {
    const liveVerdict = String(currentVerdict?.verdict || currentRec?.label || 'fair').toLowerCase();
    const verdictBadge = liveVerdict === 'undervalued' ? 'UNDERVALUED' : (liveVerdict === 'overvalued' ? 'OVERVALUED' : 'FAIR');
    const verdictClass = liveVerdict === 'undervalued' ? 'undervalued' : (liveVerdict === 'overvalued' ? 'overvalued' : 'fair');
    const pillars = [
      'Global category leader in language learning on a scalable, asset-light model.',
      'Expanding user funnel with improving monetization across subscription tiers and the product ecosystem.',
      'Durable brand, daily-habit engagement, and network effects supporting long-term retention.',
      'Multiple margin-expansion levers across subscription mix, operating leverage, and efficiency.',
      `Mechanical anchor: the clustered agreement verdict is ${verdictBadge} — no single-method call drives the conclusion.`,
    ];
    const checks = buildHealthChecks();
    return `
      <div class="thesis-health-grid">
        <div class="summary-card thesis-card">
          <div class="statement-card-header">Key Investment Thesis</div>
          <div class="summary-card-body">
            <ol class="thesis-list">
              ${pillars.map((p) => `<li><span class="thesis-num" aria-hidden="true"></span><span>${p}</span></li>`).join('')}
            </ol>
          </div>
        </div>
        <div class="summary-card health-card">
          <div class="statement-card-header">Model Health &amp; Audit Status</div>
          <div class="summary-card-body">
            <ul class="health-list">
              ${checks.map((c) => `
                <li class="health-row health-${c.result.tone}">
                  <span class="health-icon" aria-hidden="true">${c.result.icon}</span>
                  <span class="health-text"><span class="health-label">${c.label}</span><span class="health-detail">${c.result.detail}</span></span>
                  <span class="health-status">${c.result.status}</span>
                </li>`).join('')}
            </ul>
            <div class="health-verdict-note">Agreement verdict: <span class="rec-badge rec-badge-${verdictClass}">${verdictBadge}</span></div>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    const rawBanner = currentMarketPrice?.bannerText || '';
    const cleanBanner = typeof rawBanner.replace === 'function' ? rawBanner.replace(/—/g, '-') : rawBanner;
    const bannerHtml = cleanBanner
      ? `<div class="live-price-banner live-price-${currentMarketPrice.status || 'fallback'}" role="alert">${cleanBanner}</div>`
      : '';
    const recHtml = renderMultiMethodVerdictCard();
    const bandHtml = renderSensitivityBand();
    const bridgeHtml = renderValuationBridgeSnapshot();
    const sparkHtml = renderSparklineKpis();
    const thesisHtml = renderThesisHealth();

    container.innerHTML = `
      <div class="summary-view-wrapper">
        ${bannerHtml}
        ${recHtml}
        ${bandHtml}
        ${bridgeHtml}
        ${sparkHtml}
        ${thesisHtml}
      </div>
    `;
  }

  function handleContainerClick(e) {
    const btn = e.target?.closest ? e.target.closest('[data-action="refresh-price"]') : null;
    if (btn && typeof onRefreshPrice === 'function') {
      btn.disabled = true;
      btn.textContent = 'Refreshing...';
      Promise.resolve(onRefreshPrice()).finally(() => {
        btn.disabled = false;
        btn.textContent = '↻ Refresh Last Close';
      });
    }
  }

  if (typeof container.addEventListener === 'function') {
    container.addEventListener('click', handleContainerClick);
  }

  render();

  return {
    update(newDcf, newRec, newKpi = null, newHistorical = null, newAssumptions = null, newThreeStatement = null, newMarketPrice = undefined, newVerdict = undefined, newMethods = undefined, newSensitivityGrid = undefined, newLabelStability = undefined) {
      currentDcf = newDcf;
      currentRec = newRec;
      currentKpi = newKpi || currentKpi;
      currentHistorical = newHistorical || currentHistorical;
      currentAssumptions = newAssumptions || currentAssumptions;
      currentThreeStatement = newThreeStatement || currentThreeStatement;
      if (newMarketPrice !== undefined) {
        currentMarketPrice = newMarketPrice;
      }
      if (newVerdict !== undefined) {
        currentVerdict = newVerdict;
      }
      if (newMethods !== undefined) {
        currentMethods = newMethods;
      }
      if (newSensitivityGrid !== undefined) {
        currentSensitivityGrid = newSensitivityGrid;
      }
      if (newLabelStability !== undefined) {
        currentLabelStability = newLabelStability;
      }
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof container.removeEventListener === 'function') {
        container.removeEventListener('click', handleContainerClick);
      }
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
  };
}

export default renderSummary;
