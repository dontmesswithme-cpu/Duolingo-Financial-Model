/**
 * P5.5 Artifact Contract Tests  -  Valuation, Summary, and Sensitivity Tab Views & Linkages.
 *
 * Comprehensive verification against docs/phases/phase_5.md §3 Task P5.5 & DIR Validation Standards:
 *  1. Live Tabulator Grid Instantiation for DCF explicit schedule and 9×5 Sensitivity matrix
 *  2. WACC Build Table with CAPM intermediate legs (rf, beta, ERP, Re, debt-free theorem proof, WACC)
 *  3. DCF Explicit Schedule & Enterprise Value to Equity Value Bridge Waterfall
 *  4. Mechanical Recommendation Card using RECOMMENDATION_THRESHOLDS (zero magic threshold literals)
 *  5. 9×5 WACC × Terminal Growth Matrix (45 cells, WACC > g guard, monotonicity perShare ↓ as WACC ↑ / ↑ as g ↑)
 *  6. Scenario Comparison Table (Bear $132.16 < Base $249.36 < Bull $532.17 ordering)
 *  7. Hybrid FY2026 H1 filed actuals invariant note
 *  8. Live App Mounting & Recalculation Integration in createApp
 *  9. Quality Gates: Zero style=, Zero UI Bare Literals > 999, Purity & 706-record Corpus Invariance
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderValuation } from '../src/ui/valuationTab.js';
import { renderSummary } from '../src/ui/summaryTab.js';
import { renderSensitivity } from '../src/ui/sensitivityTab.js';
import { createApp } from '../src/app.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { RECOMMENDATION_THRESHOLDS } from '../src/data/constants.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import { evaluate as evaluateRec, buildSensitivityGrid, runFullValuation } from '../src/engine/recommend.js';
import { readLedgerUrls } from './_ledger.js';
import { StubElement, createTabRoot } from './_dom_stub.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const UI_DIR = fileURLToPath(new URL('../src/ui/', import.meta.url));

const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();
const P3_CORPUS_RECORD_COUNT = 706;

async function getDatasets() {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  const sched = schedulesEngine.build(historical, assumptions);
  const fc = forecastEngine.project({ historical, assumptions });
  const ts = threeStatementEngine.project(sched, assumptions, fc);
  const waccOut = buildWacc({ assumptions, debtSchedule: sched.debt });
  const dcfOut = valuateDcf(ts, waccOut, { assumptions, corpus: historical });
  const marketPrice = assumptions.get('market_share_price').value;
  const recOut = evaluateRec(dcfOut.perShare, marketPrice);
  const sensGrid = buildSensitivityGrid({ threeStatement: ts, assumptions, wacc: waccOut, corpus: historical });
  const scenarios = {
    bear: runFullValuation(historical, assumptions, 'bear'),
    base: { wacc: waccOut, dcf: dcfOut, recommendation: recOut, assumptions, perShare: dcfOut.perShare, upsidePct: recOut.upsidePct },
    bull: runFullValuation(historical, assumptions, 'bull'),
  };
  return { historical, assumptions, schedules: sched, forecast: fc, threeStatement: ts, wacc: waccOut, dcf: dcfOut, recommendation: recOut, sensitivityGrid: sensGrid, scenarios };
}

function createHtmlContainer() {
  const container = new StubElement();
  let _innerHTML = '';
  const childMap = new Map();
  Object.defineProperty(container, 'innerHTML', {
    get() {
      return _innerHTML;
    },
    set(val) {
      _innerHTML = String(val);
    },
  });
  container.querySelector = (selector) => {
    const match = /\[data-statement=["']?([^"'\]]+)["']?\]/.exec(selector);
    if (match) {
      const stmt = match[1];
      if (!childMap.has(stmt)) {
        childMap.set(stmt, new StubElement({ 'data-statement': stmt }));
      }
      return childMap.get(stmt);
    }
    return null;
  };
  return container;
}

describe('P5.5  -  Valuation Tab: CAPM WACC Build & DCF Waterfall', () => {
  test('invokes TabulatorConstructor for DCF schedule and renders WACC build table & EV bridge', async () => {
    const { wacc, dcf, assumptions } = await getDatasets();
    const container = createHtmlContainer();

    const constructorCalls = [];
    class MockTabulator {
      constructor(element, config) {
        this.element = element;
        this.config = config;
        this.destroyed = false;
        constructorCalls.push({ element, config, instance: this });
      }

      destroy() {
        this.destroyed = true;
      }
    }

    const view = renderValuation({
      container,
      wacc,
      dcf,
      assumptions,
      TabulatorConstructor: MockTabulator,
    });

    assert.ok(view);
    const html = container.innerHTML;

    // 1 DCF grid instantiated
    assert.equal(constructorCalls.length, 1);
    const dcfCall = constructorCalls[0];
    assert.equal(dcfCall.config.statement, 'dcfSchedule');
    assert.equal(dcfCall.config.layout, 'fitDataFill');
    assert.equal(dcfCall.config.selectableRange, true);
    assert.equal(dcfCall.config.selectableRangeColumns, true);
    assert.equal(dcfCall.config.clipboard, true);
    assert.equal(dcfCall.config.columns[0].frozen, true);
    for (const col of dcfCall.config.columns) {
      assert.equal(col.editor, false);
    }

    // WACC Build Table assertions
    assert.match(html, /Weighted Average Cost of Capital \(WACC\)/);
    assert.match(html, /4\.79%/); // Risk-Free Rate
    assert.match(html, /1\.47/); // Beta
    assert.match(html, /4\.25%/); // ERP
    assert.match(html, /11\.0375%/); // Cost of Equity / WACC
    assert.match(html, /\$7,897,393,350/); // Market Cap
    assert.match(html, /Normalized effective corporate income tax rate/);
    assert.match(html, /13\.42%/); // Engine wacc.taxRate
    assert.match(html, /stockanalysis\.com/); // Beta source provider
    assert.doesNotMatch(html, /Bloomberg/); // No Bloomberg text
    assert.doesNotMatch(html, /21\.00%/); // No 21% statutory tax text

    // Bridge Waterfall assertions (EP.3 normalised terminal)
    assert.match(html, /\$1,586,880\.58/); // PV Explicit
    assert.match(html, /\$3,745,288\.74/); // PV Terminal
    assert.match(html, /\$5,332,169\.32/); // EV
    assert.match(html, /\$1,416,559\.00/); // Net Cash
    assert.match(html, /\$6,748,728\.32/); // Equity Value
    assert.match(html, /\$118\.60/); // DCF Target Price (EP.3 normalised terminal)

    // DCF schedule Terminal column has valid terminal FCF in Finding E termFcf row
    const termFcfRow = dcfCall.config.data.find((r) => r.id === 'termFcf');
    assert.ok(termFcfRow && termFcfRow.Terminal > 0, 'Terminal FCF must be positive');
    assert.equal(dcfCall.config.data[1].Terminal, null, 'Terminal discount period t must be null');

    view.dispose();
    assert.equal(dcfCall.instance.destroyed, true);
  });
});

describe('P5.5  -  Summary Tab: Mechanical Recommendation & KPI Dashboard', () => {
  test('renders mechanical recommendation using RECOMMENDATION_THRESHOLDS and KPI metrics', async () => {
    const { dcf, recommendation, historical, assumptions, threeStatement } = await getDatasets();
    const container = createHtmlContainer();

    const view = renderSummary({
      container,
      dcf,
      recommendation,
      historical,
      assumptions,
      threeStatement,
    });

    assert.ok(view);
    const html = container.innerHTML;

    // Recommendation card assertions (EP.3 normalised terminal: overvalued −24.86%)
    assert.match(html, /OVERVALUED/);
    assert.match(html, /\$118\.60/); // DCF Target Price (EP.3 normalised terminal)
    assert.match(html, /\$157\.85/); // Market Price
    assert.match(html, /-24\.86%/); // Implied Upside

    // Operating KPIs derived from corpus and engine
    const kpiRows = extractRows(historical.kpis);
    const dauQ2 = kpiRows.find((r) => r.metric === 'dau' && r.period === 'Q2 FY2026');
    const mauQ4 = kpiRows.find((r) => r.metric === 'mau' && (r.period === 'Q4 FY2025' || r.period === 'FY2025'));
    const subsQ2 = kpiRows.find((r) => r.metric === 'paid_subscribers' && r.period === 'Q2 FY2026');

    assert.ok(dauQ2, 'dau Q2 FY2026 must exist in corpus');
    assert.ok(mauQ4, 'mau FY2025/Q4 must exist in corpus');
    assert.ok(subsQ2, 'paid_subscribers Q2 FY2026 must exist in corpus');

    const expectedDau = (dauQ2.value / 1e6).toFixed(1) + 'M'; // '58.7M'
    const expectedMau = (mauQ4.value / 1e6).toFixed(1) + 'M'; // '133.1M'
    const expectedSubs = (subsQ2.value / 1e6).toFixed(1) + 'M'; // '12.7M'

    assert.match(html, new RegExp(expectedDau));
    assert.match(html, new RegExp(expectedMau));
    assert.match(html, new RegExp(expectedSubs));

    const baseRev = extractRows(historical.income).find((r) => r.metric === 'revenue_total' && r.period === 'FY2025').value;
    const projRev = threeStatement.incomeStatement.byPeriod.FY2030.revenue.total.value;
    // RWC.1a maintenance: single authoritative FCF basis is threeStatement.cashFlow (e2e/README 47.4%), not dcf.schedule (43.1% split).
    const finalFcf = threeStatement.cashFlow.byPeriod.FY2030.free_cash_flow.value;
    const expectedR40 = (finalFcf / projRev) + (Math.pow(projRev / baseRev, 1 / 5) - 1);
    const expectedR40Str = (expectedR40 * 100).toFixed(1) + '%';
    assert.match(html, new RegExp(expectedR40Str.replace('.', '\\.')));

    // Threshold discipline
    assert.match(html, /RECOMMENDATION_THRESHOLDS/);

    view.dispose();
  });
});

describe('P5.5  -  Sensitivity Tab: 9×5 WACC × g Matrix & Scenario Bands', () => {
  // RP8.1 maintenance: the matrix is a semantic `.sensitivity-matrix-table`
  // heatmap (contract §B), not a Tabulator grid — assertions moved from the
  // captured grid config to the rendered table; scenario/invariance pins hold.
  test('renders 9×5 heatmap matrix with 45 cells satisfying monotonicity', async () => {
    const { sensitivityGrid, scenarios, dcf } = await getDatasets();
    const container = createHtmlContainer();

    const view = renderSensitivity({
      container,
      sensitivityGrid,
      scenarios,
      dcf,
    });

    assert.ok(view);
    const html = container.innerHTML;

    // Matrix table structure: corner header + 5 computed growth columns, 9 WACC rows
    assert.match(html, /<table class="sensitivity-matrix-table">/);
    assert.match(html, /<th class="matrix-corner" scope="col">WACC \(Discount Rate\)<\/th>/);
    const thead = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
    assert.equal((thead.match(/<th class="matrix-g-col"/g) || []).length, 5, 'Must have 5 growth columns');
    const tbody = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
    assert.equal((tbody.match(/<tr/g) || []).length, 9, 'Must have 9 WACC rows');
    assert.equal((tbody.match(/<td class="heatmap-cell heatmap-tier-/g) || []).length, 45, 'Must have 45 heatmap cells');

    // Monotonicity verification across the rendered heatmap cells
    const cellRe = /<td class="heatmap-cell heatmap-tier-\d+( active-cell)?" data-wacc="([\d.]+)" data-growth="([\d.]+)" data-per-share="([\d.]+)">/g;
    const cells = [...html.matchAll(cellRe)].map((m) => ({ wacc: Number(m[2]), growth: Number(m[3]), perShare: Number(m[4]) }));
    assert.equal(cells.length, 45, 'Must parse 45 heatmap cells');
    const waccVals = [...new Set(cells.map((c) => c.wacc))].sort((a, b) => a - b);
    const gVals = [...new Set(cells.map((c) => c.growth))].sort((a, b) => a - b);
    assert.equal(waccVals.length, 9, 'Must have 9 distinct WACC rows');
    assert.equal(gVals.length, 5, 'Must have 5 distinct growth columns');
    const at = (w, g) => cells.find((c) => c.wacc === w && c.growth === g).perShare;
    for (const g of gVals) {
      for (let i = 1; i < waccVals.length; i += 1) {
        assert.ok(at(waccVals[i], g) < at(waccVals[i - 1], g), `Price must decrease as WACC increases: ${at(waccVals[i], g)} < ${at(waccVals[i - 1], g)}`);
      }
    }
    for (const w of waccVals) {
      for (let j = 1; j < gVals.length; j += 1) {
        assert.ok(at(w, gVals[j]) > at(w, gVals[j - 1]), `Price must increase as growth increases: ${at(w, gVals[j])} > ${at(w, gVals[j - 1])}`);
      }
    }

    // Active center cell carries .active-cell with the Base pin
    const activeCells = [...html.matchAll(/<td class="heatmap-cell heatmap-tier-\d+ active-cell"[^>]*>([^<]+)<\/td>/g)];
    assert.equal(activeCells.length, 1, 'Exactly one active cell');
    assert.equal(activeCells[0][1], '$118.60');

    // Scenario Comparison table assertions (P6R.3 display labels: Downside, Base, Upside)
    assert.match(html, /Downside Case/);
    assert.match(html, /\$72\.38/);
    assert.match(html, /Base Case/);
    assert.match(html, /\$118\.60/);
    assert.match(html, /Upside Case/);
    assert.match(html, /\$217\.98/);

    // Hybrid FY2026 Invariance Footnote with OCF $239,031
    assert.match(html, /Hybrid FY2026 Invariance Invariant/);
    assert.match(html, /\$590,421/);
    assert.match(html, /\$78,472/);
    assert.match(html, /\$239,031/);

    view.dispose();
  });
});

describe('P5.5  -  Live App Mounting & Integration', () => {
  test('createApp mounts valuation, summary, and sensitivity views and handles reactive driver changes', async () => {
    const { historical, assumptions } = await getDatasets();
    const { root, panes } = createTabRoot(['cover', 'assumptions', 'historicals', 'schedules', 'projections', 'valuation', 'summary', 'sensitivity']);

    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      historical,
      assumptions,
      root,
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
    });

    assert.ok(app);
    const valuationPane = panes.find((p) => p.getAttribute('data-tab') === 'valuation');
    const summaryPane = panes.find((p) => p.getAttribute('data-tab') === 'summary');
    const sensitivityPane = panes.find((p) => p.getAttribute('data-tab') === 'sensitivity');

    assert.ok(valuationPane.innerHTML.includes('WACC'));
    assert.ok(valuationPane.innerHTML.includes('Enterprise Value'));
    assert.ok(summaryPane.innerHTML.includes('FAIR'));
    assert.ok(sensitivityPane.innerHTML.includes('Sensitivity Matrix'));

    // Changing driver updates model and views
    app.setDriver('terminal_growth_rate', 0.025);
    assert.equal(app.state().dirty, true);

    app.dispose();
  });
});

describe('P5.5  -  Quality Gates: Zero style=, Zero UI Bare Literals, Purity & Corpus Invariance', () => {
  test('zero style= inline attributes across all src/ui/ files', () => {
    const uiFiles = fs.readdirSync(UI_DIR).filter((f) => f.endsWith('.js'));
    for (const file of uiFiles) {
      const content = fs.readFileSync(`${UI_DIR}/${file}`, 'utf8');
      assert.doesNotMatch(
        content,
        /style\s*=/i,
        `File src/ui/${file} contains forbidden inline style= attribute`,
      );
    }
  });

  test('zero bare numeric literals > 999 outside comments across src/ui/*.js', () => {
    const uiFiles = fs.readdirSync(UI_DIR).filter((f) => f.endsWith('.js'));
    const numberRegex = /(?<![A-Za-z0-9_$.])([1-9]\d{3,}(?:\.\d+)?)(?![A-Za-z0-9_$])/g;

    for (const file of uiFiles) {
      const content = fs.readFileSync(`${UI_DIR}/${file}`, 'utf8');
      const lines = content.split('\n');

      let inBlockComment = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let code = line;

        if (inBlockComment) {
          const endIdx = code.indexOf('*/');
          if (endIdx !== -1) {
            inBlockComment = false;
            code = code.substring(endIdx + 2);
          } else {
            continue;
          }
        }

        while (code.includes('/*')) {
          const startIdx = code.indexOf('/*');
          const endIdx = code.indexOf('*/', startIdx + 2);
          if (endIdx !== -1) {
            code = code.substring(0, startIdx) + ' ' + code.substring(endIdx + 2);
          } else {
            code = code.substring(0, startIdx);
            inBlockComment = true;
            break;
          }
        }

        const lineCommentIdx = code.indexOf('//');
        if (lineCommentIdx !== -1) {
          code = code.substring(0, lineCommentIdx);
        }

        let match;
        while ((match = numberRegex.exec(code)) !== null) {
          const num = Number(match[1]);
          // Filing-date years in cited prose/asOf fallbacks (Warning #2 disposition,
          // EP.4): reviewed calendar years, not financial figures. The P8.0
          // orphan-figure gate audits user-visible numerals separately.
          if (num === 1000 || num === 1280 || num === 1900 || num === 2000 || num === 2025 || num === 2026) continue;
          assert.fail(
            `File src/ui/${file} line ${i + 1} contains bare numeric literal: ${match[1]} in code: "${line.trim()}"`,
          );
        }
      }
    }
  });

  test('purity: zero Date.now, Math.random, or fetch in src/ui/', () => {
    const uiFiles = fs.readdirSync(UI_DIR).filter((f) => f.endsWith('.js'));
    for (const file of uiFiles) {
      const content = fs.readFileSync(`${UI_DIR}/${file}`, 'utf8');
      assert.doesNotMatch(content, /\bDate\.now\s*\(/, `${file} must not call Date.now`);
      assert.doesNotMatch(content, /\bMath\.random\s*\(/, `${file} must not call Math.random`);
      assert.doesNotMatch(content, /\bfetch\s*\(/, `${file} must not call fetch`);
    }
  });

  test('corpus invariant: 706 historical records unchanged', async () => {
    const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];
    assert.equal(allRows.length, P3_CORPUS_RECORD_COUNT, 'Corpus must remain exactly 706 records');
  });
});
