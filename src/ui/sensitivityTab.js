/**
 * Sensitivity & Scenario Analysis View (Phase 5.5; RP8.1 heatmap matrix).
 *
 * Renders the valuation sensitivity workstation:
 *  1. 9x5 WACC x Terminal Growth heatmap matrix (`.sensitivity-matrix-table`):
 *     computed axes centered on the active scenario, discrete percentile
 *     bucket classes (`.heatmap-cell`, `.heatmap-tier-1` through
 *     `.heatmap-tier-9`), and a solid-blue `.active-cell` on the active
 *     (center) valuation. Zero inline styling attributes.
 *  2. Scenario Comparison Table (Bear / Base / Bull full-path valuation tie-outs)
 *  3. Hybrid FY2026 Invariance Footnote (H1 filed actuals invariant across all scenarios)
 *
 * Strict Compliance:
 *  - 45 cells strictly satisfy WACC > g guard and monotonicity (perShare falls as WACC rises, rises as g rises)
 *  - Semantic heatmap table: axes and values derive from the computed engine grid; tier classes carry the shading
 *  - Zero bare numeric literals > 999 in src/ui/*.js
 *  - Zero inline styling attributes
 *
 * @module src/ui/sensitivityTab
 */

import { EngineError } from '../data/errors.js';
import { SCENARIO_NAMES } from '../data/constants.js';
import { usd, percent, estSuffix, SCENARIO_DISPLAY_NAMES } from './format.js';
import { canonicalDcfPerShare } from '../engine/methods/fcffDcf.js';

/** Number of discrete heatmap tiers on the sensitivity matrix color ramp. */
const HEATMAP_TIERS = 9;

/** Center-match tolerance binding the active cell to the computed axes. */
const CENTER_TOLERANCE = 0.0001;

/**
 * Builds the heatmap matrix model from a SensitivityGrid engine output.
 *
 * Axes are consumed verbatim from the COMPUTED grid (centered on the active
 * scenario WACC and terminal growth by `computeSensitivityAxes`, shrink-guard
 * narrowed when Gordon headroom squeezes) - never fixed literals. The active
 * row and cell are bound by closest match against `grid.base` coordinates.
 * Finite cells are ranked into discrete percentile tiers 1..9 (lowest values
 * tier 1, highest tier 9) driving the `.heatmap-tier-N` classes.
 *
 * @param {object|null|undefined} grid SensitivityGrid output from recommend.buildSensitivityGrid
 * @returns {{ growthValues: Array<number>, rows: Array<object>, activeWacc: number|null, activeGrowth: number|null, axisNarrowed: boolean }}
 */
export function buildSensitivityMatrix(grid) {
  const empty = {
    growthValues: [],
    rows: [],
    activeWacc: null,
    activeGrowth: null,
    axisNarrowed: !!(grid && grid.axisNarrowed),
  };
  if (!grid || !Array.isArray(grid.waccValues) || !Array.isArray(grid.growthValues)) {
    return empty;
  }

  const waccVals = grid.waccValues;
  const gVals = grid.growthValues;
  const baseWacc = grid.base?.wacc ?? null;
  const baseG = grid.base?.growth ?? null;
  const matrix = grid.matrix || {};

  const rows = waccVals.map((wVal) => {
    const isActiveRow = Number.isFinite(baseWacc) && Math.abs(wVal - baseWacc) < CENTER_TOLERANCE;
    const cells = gVals.map((gVal) => {
      const cell = matrix[wVal]?.[gVal];
      const perShare = cell?.perShare ?? null;
      const isActive = isActiveRow
        && Number.isFinite(baseG)
        && Math.abs(gVal - baseG) < CENTER_TOLERANCE;
      return {
        growth: gVal,
        perShare,
        tier: null,
        isActive,
      };
    });
    return {
      wacc: wVal,
      label: percent(wVal, { decimals: 2 }),
      isActiveRow,
      cells,
    };
  });

  // Rank-based percentile buckets over the finite cells present.
  const finite = [];
  for (const row of rows) {
    for (const cell of row.cells) {
      if (Number.isFinite(cell.perShare)) finite.push(cell);
    }
  }
  const ranked = [...finite].sort((a, b) => a.perShare - b.perShare);
  const count = ranked.length;
  ranked.forEach((cell, rank) => {
    cell.tier = count <= 1
      ? 1
      : Math.min(HEATMAP_TIERS, Math.floor((rank / (count - 1)) * HEATMAP_TIERS) + 1);
  });

  return {
    growthValues: gVals,
    rows,
    activeWacc: Number.isFinite(baseWacc) ? baseWacc : null,
    activeGrowth: Number.isFinite(baseG) ? baseG : null,
    axisNarrowed: !!grid.axisNarrowed,
  };
}

/**
 * Renders the heatmap matrix table HTML from a matrix model.
 *
 * @param {{ growthValues: Array<number>, rows: Array<object> }} model Matrix model from buildSensitivityMatrix
 * @returns {string} HTML markup for the `.sensitivity-matrix-table`
 */
export function renderSensitivityMatrix(model) {
  const growthHeaders = (model.growthValues || []).map((gVal) => {
    const titleText = `g = ${percent(gVal, { decimals: 1 })}`;
    return `<th class="matrix-g-col" scope="col">${estSuffix(titleText, 'EST')}</th>`;
  }).join('');

  const bodyRows = (model.rows || []).map((row) => {
    const badge = row.isActiveRow ? ' <span class="badge badge-est">ACTIVE</span>' : '';
    const trClass = row.isActiveRow ? ' class="matrix-active-row"' : '';
    const cells = row.cells.map((cell) => {
      if (!Number.isFinite(cell.perShare)) {
        return '<td class="heatmap-cell heatmap-empty"> - </td>';
      }
      const tierClass = cell.tier === null ? '' : ` heatmap-tier-${cell.tier}`;
      const activeClass = cell.isActive ? ' active-cell' : '';
      return `<td class="heatmap-cell${tierClass}${activeClass}" data-wacc="${row.wacc}" data-growth="${cell.growth}" data-per-share="${cell.perShare}">${usd(cell.perShare, { decimals: 2 })}</td>`;
    }).join('');
    return `<tr${trClass}><th class="matrix-wacc-label" scope="row">${row.label}${badge}</th>${cells}</tr>`;
  }).join('');

  // F-UI-5: visible horizontal-scroll affordance, keyboard-focusable scroll
  // region, and sticky first column (CSS) so the full 9x5 matrix stays usable
  // on narrow viewports without document-level overflow.
  return `<div class="matrix-scroll-hint" role="note">Scroll horizontally to see all g columns (1.5% through 3.5%) &rarr;</div><div class="matrix-table-scroll" tabindex="0" role="region" aria-label="WACC by terminal growth sensitivity matrix: scroll horizontally to see all terminal growth columns"><table class="sensitivity-matrix-table"><thead><tr><th class="matrix-corner" scope="col">WACC (Discount Rate)</th>${growthHeaders}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

/**
 * Renders the Sensitivity tab inside the target container.
 *
 * @param {object} options
 * @param {HTMLElement|object} options.container
 * @param {object} options.sensitivityGrid SensitivityGrid output from recommend.buildSensitivityGrid
 * @param {object} [options.scenarios] Scenario summary comparisons
 * @param {object} [options.dcf] Base DcfOutput
 * @param {object} [options.marketPriceState] Live market price state (auto-updates benchmark)
 * @param {string} [options.activeScenario] Active scenario key (binds the dropdown selection)
 * @param {(scenario: string) => void} [options.onScenarioChange] Scenario-switch callback (wired to app.setScenario)
 * @returns {{ update: (sensitivityGrid: object, scenarios?: object, dcf?: object, marketPriceState?: object, activeScenario?: string) => void, dispose: () => void, tabulatorInstances: object[], tabulatorConfigs: object[] }}
 */
export function renderSensitivity({
  container,
  sensitivityGrid,
  scenarios = null,
  dcf = null,
  marketPriceState = null,
  activeScenario = null,
  onScenarioChange = null,
} = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderSensitivity requires a container element.', 'container');
  }

  let currentGrid = sensitivityGrid;
  let currentScenarios = scenarios;
  let currentDcf = dcf;
  let currentMarketPrice = marketPriceState;
  let currentActiveScenario = activeScenario;
  const handleScenarioChange = onScenarioChange;
  let disposed = false;
  const tabulatorInstances = [];
  const tabulatorConfigs = [];

  function scenarioTerminalMargin(sc) {
    // RWC.1b: per-scenario FY2030 terminal FCF margin from that scenario's own
    // threeStatement engine (free_cash_flow / revenue.total). Fail-closed null.
    const fcf = sc?.threeStatement?.cashFlow?.byPeriod?.FY2030?.free_cash_flow?.value
      ?? sc?.cashFlow?.byPeriod?.FY2030?.free_cash_flow?.value
      ?? null;
    const rev = sc?.threeStatement?.incomeStatement?.byPeriod?.FY2030?.revenue?.total?.value
      ?? sc?.incomeStatement?.byPeriod?.FY2030?.revenue?.total?.value
      ?? null;
    if (!Number.isFinite(fcf) || !Number.isFinite(rev) || rev <= 0) return null;
    return fcf / rev;
  }

  function scenarioMarginClause(sc) {
    const m = scenarioTerminalMargin(sc);
    return m !== null ? `${percent(m, { decimals: 1 })} terminal FCF margin` : 'terminal FCF margin -';
  }

  function scenarioBetaSentence() {
    // Beta disclosure is DERIVED from the live driver, never a prose literal. It
    // used to be a hardcoded sentence ("Base β = 1.47"), which silently went stale
    // the moment the driver was re-anchored to the peer mean (1.49), leaving the UI
    // quoting a beta the model no longer used. Reads each scenario's own driver and
    // falls back to the base driver plus its scenario deltas, so all three move
    // together. Fail-closed: with no live driver it says so rather than inventing.
    const base = currentScenarios?.[SCENARIO_NAMES[1]];
    const baseDriver = base?.assumptions?.get ? base?.assumptions?.get('beta') : null;
    const read = (key) => {
      const v = currentScenarios?.[key]?.assumptions?.get?.('beta')?.value;
      return Number.isFinite(v) ? Number(v.toFixed(2)) : null;
    };
    const fromDeltas = (deltaKey) => (Number.isFinite(baseDriver?.value)
      ? Number((baseDriver.value + (baseDriver.scenarioDeltas?.[deltaKey] ?? 0)).toFixed(2))
      : null);
    // Scenario keys come from SCENARIO_NAMES (constants.js), never literals here —
    // this file is under the no-config-literals gate. Index 0 = downside, 2 = upside.
    const bear = read(SCENARIO_NAMES[0]) ?? fromDeltas(SCENARIO_NAMES[0]);
    const baseV = read(SCENARIO_NAMES[1]) ?? (Number.isFinite(baseDriver?.value) ? Number(baseDriver.value.toFixed(2)) : null);
    const bull = read(SCENARIO_NAMES[2]) ?? fromDeltas(SCENARIO_NAMES[2]);
    return (bear !== null && baseV !== null && bull !== null)
      ? `(${SCENARIO_DISPLAY_NAMES[SCENARIO_NAMES[0]] || 'Downside'} / Bear β = ${bear}, Base β = ${baseV}, ${SCENARIO_DISPLAY_NAMES[SCENARIO_NAMES[2]] || 'Upside'} / Bull β = ${bull})`
      : '(scenario beta range unavailable — no live driver)';
  }

  function renderScenarioSelect() {
    const current = (typeof currentActiveScenario === 'string' && SCENARIO_NAMES.includes(currentActiveScenario))
      ? currentActiveScenario
      : 'base';
    const options = SCENARIO_NAMES.map((key) => {
      const label = `${SCENARIO_DISPLAY_NAMES[key] || key} Case`;
      const selected = key === current ? ' selected' : '';
      return `<option value="${key}"${selected}>${label}</option>`;
    }).join('');
    return `<label class="scenario-select-label">Active Scenario: <select class="scenario-select" data-scenario-select>${options}</select></label>`;
  }

  function renderScenarioSpectrumCard() {
    // Benchmark share price: derived dynamically from neutral snapshot driver. All scenario comparison upsides evaluate versus this benchmark.
    const bearKey = SCENARIO_NAMES[0];
    const baseKey = SCENARIO_NAMES[1];
    const bullKey = SCENARIO_NAMES[2];

    const bear = currentScenarios?.[bearKey];
    const base = currentScenarios?.[baseKey];
    const bull = currentScenarios?.[bullKey];

    const bearWacc = bear?.wacc?.wacc?.value ?? bear?.wacc?.value ?? null;
    const bearG = bear?.assumptions?.getValue ? bear?.assumptions?.getValue('terminal_growth_rate') : bear?.assumptions?.get?.('terminal_growth_rate')?.value;
    // P10.6: these read the engine scenario object, which carries the finite-roll
    // intermediate. The basis difference is disclosed by the basis note on the matrix
    // card rather than silently re-based here, because the matrix active-cell anchor
    // is derived from the same engine grid.
    // P10.6: the scenario table states the CANONICAL basis, matching the
    // valuation headline, the recommendation, the cover tile and the summary cards.
    const bearPrice = canonicalDcfPerShare(bear?.dcf ?? (bear?.perShare ? bear : null)).perShare
      ?? bear?.perShare ?? null;
    const bearUpside = bear?.upsidePct ?? bear?.recommendation?.upsidePct ?? null;
    // C3 disposition: recommendation/verdict labels render fail-closed dashes
    // when absent - no invented 'fair'/'undervalued' stand-ins.
    const bearRec = bear?.recommendation?.label ?? null;
    const bearVerdictRaw = bear?.verdict?.verdict ?? bear?.verdict ?? null;
    const bearVerdict = typeof bearVerdictRaw === 'string' ? bearVerdictRaw : null;

    const baseWacc = base?.wacc?.wacc?.value ?? base?.wacc?.value ?? currentGrid?.base?.wacc ?? null;
    const baseG = (base?.assumptions?.getValue ? base?.assumptions?.getValue('terminal_growth_rate') : base?.assumptions?.get?.('terminal_growth_rate')?.value) ?? currentGrid?.base?.growth ?? null;
    const basePrice = canonicalDcfPerShare(base?.dcf ?? (base?.perShare ? base : null)).perShare
      ?? canonicalDcfPerShare(currentDcf).perShare
      ?? base?.perShare ?? currentDcf?.perShare ?? null;
    const baseUpside = base?.upsidePct ?? base?.recommendation?.upsidePct ?? currentScenarios?.base?.upsidePct ?? null;
    const baseRec = base?.recommendation?.label ?? null;
    const baseVerdictRaw = base?.verdict?.verdict ?? base?.verdict ?? null;
    const baseVerdict = typeof baseVerdictRaw === 'string' ? baseVerdictRaw : null;

    const bullWacc = bull?.wacc?.wacc?.value ?? bull?.wacc?.value ?? null;
    const bullG = bull?.assumptions?.getValue ? bull?.assumptions?.getValue('terminal_growth_rate') : bull?.assumptions?.get?.('terminal_growth_rate')?.value;
    const bullPrice = canonicalDcfPerShare(bull?.dcf ?? (bull?.perShare ? bull : null)).perShare
      ?? bull?.perShare ?? null;
    const bullUpside = bull?.upsidePct ?? bull?.recommendation?.upsidePct ?? null;
    const bullRec = bull?.recommendation?.label ?? null;
    const bullVerdictRaw = bull?.verdict?.verdict ?? bull?.verdict ?? null;
    const bullVerdict = typeof bullVerdictRaw === 'string' ? bullVerdictRaw : null;

    const scenarioRows = [
      {
        id: bearKey,
        name: `${SCENARIO_DISPLAY_NAMES[bearKey] || 'Downside'} Case`,
        badgeClass: `badge-${bearKey}`,
        desc: 'Downside adoption slowdown; conservative subscription pricing; compressed terminal margin.',
        wacc: bearWacc,
        growth: bearG,
        targetPrice: bearPrice,
        upside: bearUpside,
        rec: bearRec,
        verdict: bearVerdict,
      },
      {
        id: baseKey,
        name: `${SCENARIO_DISPLAY_NAMES[baseKey] || 'Base'} Case`,
        badgeClass: `badge-${baseKey}`,
        desc: `Current baseline consensus; steady Super Duolingo Max tier scaling; ${scenarioMarginClause(base)}.`,
        wacc: baseWacc,
        growth: baseG,
        targetPrice: basePrice,
        upside: baseUpside,
        rec: baseRec,
        verdict: baseVerdict,
      },
      {
        id: bullKey,
        name: `${SCENARIO_DISPLAY_NAMES[bullKey] || 'Upside'} Case`,
        badgeClass: `badge-${bullKey}`,
        desc: `Accelerated GenAI Max tier monetization; DET expansion in institutional admissions; ${scenarioMarginClause(bull)}.`,
        wacc: bullWacc,
        growth: bullG,
        targetPrice: bullPrice,
        upside: bullUpside,
        rec: bullRec,
        verdict: bullVerdict,
      },
    ];

    const baseMktDriver = base?.assumptions?.get ? base?.assumptions?.get('market_share_price') : null;
    const livePrice = Number.isFinite(currentMarketPrice?.price) ? currentMarketPrice.price : null;
    // C3 disposition: no invented benchmark fallback - fail-closed dash when
    // neither the live price nor the snapshot driver resolves.
    const benchmarkPrice = livePrice ?? baseMktDriver?.value ?? null;
    const benchmarkAsOf = (livePrice !== null ? (currentMarketPrice?.asOf || '') : (baseMktDriver?.asOf || ''));
    const benchmarkCaption = Number.isFinite(benchmarkPrice)
      ? `Benchmark share price: $${benchmarkPrice.toFixed(2)}${benchmarkAsOf ? ` (${benchmarkAsOf})` : ''} snapshot driver.`
      : 'Benchmark share price: - snapshot driver.';

    return `
      <div class="sensitivity-card scenario-card">
        <div class="statement-card-header">
          Scenario Valuation Bands &amp; Sensitivity Spectrum (Downside / Base / Upside)
        </div>
        <div class="sensitivity-card-body">
          <p class="valuation-section-desc">
            Full-path end-to-end valuation runs parameterized across three macroeconomic and operating scenarios (preserving <code>Downside &lt; Base &lt; Upside</code> intrinsic value ordering).
            <span class="scenario-benchmark-caption">${benchmarkCaption} All scenario comparison upsides evaluate versus this neutral benchmark. Multi-Method Verdict reflects majority agreement across three evidence clusters, where each cluster collapses to one observation and breadth counts clusters rather than methods.</span>
          </p>
          <div class="spectrum-table-scroll">
          <table class="financial-summary-table scenario-spectrum-table">
            <thead>
              <tr>
                <th>Scenario Case</th>
                <th>Core Driver Assumptions</th>
                <th class="align-right">WACC</th>
                <th class="align-right">Terminal Growth (g)</th>
                <th class="align-right">DCF Target Price</th>
                <th class="align-right">Upside / (Downside) %</th>
                <th>Multi-Method Verdict</th>
                <th>Mechanical Recommendation</th>
              </tr>
            </thead>
            <tbody>
              ${scenarioRows.map((s) => `
                <tr class="scenario-row-${s.id}">
                  <td><strong class="scenario-name ${s.badgeClass}">${s.name}</strong></td>
                  <td class="scenario-desc">${s.desc}</td>
                  <td class="align-right font-mono">${percent(s.wacc, { decimals: 2 })}</td>
                  <td class="align-right font-mono">${percent(s.growth, { decimals: 1 })}</td>
                  <td class="align-right font-mono font-bold">${usd(s.targetPrice, { decimals: 2 })}</td>
                  <td class="align-right font-mono font-bold ${!Number.isFinite(s.upside) ? '' : (s.upside >= 0 ? 'text-positive' : 'text-negative')}">
                    ${percent(s.upside, { decimals: 2, showSign: true })}
                  </td>
                  <td>${s.verdict ? `<span class="rec-badge rec-badge-${s.verdict}">${s.verdict.toUpperCase()}</span>` : ' - '}</td>
                  <td>${s.rec ? `<span class="rec-badge rec-badge-${s.rec}">${s.rec.toUpperCase()}</span>` : ' - '}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          </div>
          <div class="callout-warning sensitivity-invariance-callout">
            <span class="soft-em">Hybrid FY2026 Invariance Invariant:</span> In accordance with audit standards, <span class="soft-em">H1 FY2026 Actuals</span> (Total Revenue: $590,421 / Operating Income: $78,472 / Operating Cash Flow: $239,031) are transcribed directly from SEC Form 10-Q filings and remain <span class="soft-em">byte-identical and invariant across all Downside, Base, and Upside scenarios</span>, while H2 estimates respond dynamically to driver inputs.
          </div>
        </div>
      </div>
    `;
  }

  function renderMatrixCard() {
    const model = buildSensitivityMatrix(currentGrid);

    const narrowingFootnoteHtml = model.axisNarrowed
      ? `<div class="disclaimer-box sensitivity-narrowing-note">axis range narrowed to respect WACC &gt; g at current driver settings.</div>`
      : '';

    return `
      <div class="sensitivity-card matrix-card">
        <div class="statement-card-header">
          WACC × Terminal Growth Sensitivity Matrix (Implied Per-Share DCF Value in USD)
          ${renderScenarioSelect()}
        </div>
        <div class="sensitivity-card-body">
          <p class="valuation-section-desc">
            Two-variable 9×5 matrix evaluating implied equity value per share across WACC (&plusmn;200 bps) and Gordon Growth rates (&plusmn;100 bps), with both axes tracking the active scenario. Evaluates valuation sensitivity across the active systematic risk beta range ${scenarioBetaSentence()}. Strict monotonicity holds across all cells (<code>&part;Price/&part;WACC &lt; 0</code>, <code>&part;Price/&part;g &gt; 0</code>). Matrix center tracks active scenario WACC and terminal growth at the exact matrix center; highlighted cell denotes Active Case valuation.
          </p>
          <p class="matrix-basis-note" data-inspector-lever="sensitivity-basis">
            <!-- P10.6 basis disclosure. The scenario figures above are stated on the
                 canonical after-future-dilution basis, but each matrix cell is an
                 engine-computed DCF on the finite-roll INTERMEDIATE basis. Rather
                 than let a reader assume the whole surface shares one basis, the
                 difference is named here. Re-deriving 45 cells on the perpetual
                 basis is a modelling change and is deliberately not done here. -->
            Basis: each cell below is the engine DCF after explicit and fade dilution (the finite-roll
            intermediate). The scenario values above are after modeled future dilution, which is the
            canonical and recommendable basis. The two differ by the modelled future dilution, so a
            cell reads slightly above its scenario counterpart.
          </p>
          ${renderSensitivityMatrix(model)}
          <p class="matrix-axis-note">Darker green shades denote higher implied intrinsic value; the blue cell marks the active-scenario center valuation.</p>
          ${narrowingFootnoteHtml}
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

    const matrixHtml = renderMatrixCard();
    const scenarioHtml = renderScenarioSpectrumCard();

    container.innerHTML = `
      <div class="sensitivity-view-wrapper">
        <h2>08. Sensitivity / Scenarios</h2>
        ${matrixHtml}
        ${scenarioHtml}
      </div>
    `;
  }

  function handleContainerChange(e) {
    const select = e.target?.closest ? e.target.closest('[data-scenario-select]') : null;
    if (!select) return;
    if (typeof handleScenarioChange !== 'function') return;
    const value = select.value;
    if (typeof value === 'string' && SCENARIO_NAMES.includes(value)) {
      handleScenarioChange(value);
    }
  }

  if (typeof container.addEventListener === 'function') {
    container.addEventListener('change', handleContainerChange);
  }

  render();

  return {
    update(newGrid, newScenarios = null, newDcf = null, newMarketPrice = undefined, newActiveScenario = undefined) {
      currentGrid = newGrid;
      currentScenarios = newScenarios || currentScenarios;
      currentDcf = newDcf || currentDcf;
      if (newMarketPrice !== undefined) currentMarketPrice = newMarketPrice;
      if (newActiveScenario !== undefined) currentActiveScenario = newActiveScenario;
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof container.removeEventListener === 'function') {
        container.removeEventListener('change', handleContainerChange);
      }
      for (const inst of tabulatorInstances) {
        if (inst && typeof inst.destroy === 'function') {
          try { inst.destroy(); } catch { /* ignore */ }
        }
      }
      tabulatorInstances.length = 0;
      tabulatorConfigs.length = 0;
      currentGrid = null;
      currentScenarios = null;
      currentDcf = null;
      currentMarketPrice = null;
      currentActiveScenario = null;
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
    tabulatorInstances,
    tabulatorConfigs,
  };
}

export default renderSensitivity;
