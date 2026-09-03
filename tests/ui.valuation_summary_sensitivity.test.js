/**
 * P5.5 Artifact Contract Tests — Valuation, Summary, and Sensitivity Tab Views & Linkages.
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
  const dcfOut = valuateDcf(ts, waccOut, { assumptions });
  const marketPrice = assumptions.get('market_share_price').value;
  const recOut = evaluateRec(dcfOut.perShare, marketPrice);
  const sensGrid = buildSensitivityGrid({ threeStatement: ts, assumptions, wacc: waccOut });
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

describe('P5.5 — Valuation Tab: CAPM WACC Build & DCF Waterfall', () => {
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
    assert.match(html, /4\.73%/); // Risk-Free Rate
    assert.match(html, /0\.89/); // Beta
    assert.match(html, /4\.42%/); // ERP
    assert.match(html, /8\.6638%/); // Cost of Equity / WACC
    assert.match(html, /\$7,422,599,160/); // Market Cap
    assert.match(html, /Normalized effective corporate income tax rate/);
    assert.match(html, /13\.42%/); // Engine wacc.taxRate
    assert.match(html, /stockanalysis\.com/); // Beta source provider
    assert.doesNotMatch(html, /Bloomberg/); // No Bloomberg text
    assert.doesNotMatch(html, /21\.00%/); // No 21% statutory tax text

    // Bridge Waterfall assertions
    assert.match(html, /\$1,956,849\.68/); // PV Explicit
    assert.match(html, /\$7,531,035\.94/); // PV Terminal
    assert.match(html, /\$9,487,885\.62/); // EV
    assert.match(html, /\$2,987,770\.06/); // Net Cash
    assert.match(html, /\$12,475,655\.68/); // Equity Value
    assert.match(html, /\$249\.36/); // DCF Target Price

    // DCF schedule Terminal column has valid terminal FCF
    assert.ok(dcfCall.config.data[0].Terminal > 0, 'Terminal FCF must be positive');
    assert.equal(dcfCall.config.data[1].Terminal, null, 'Terminal discount period t must be null');

    view.dispose();
    assert.equal(dcfCall.instance.destroyed, true);
  });
});

describe('P5.5 — Summary Tab: Mechanical Recommendation & KPI Dashboard', () => {
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

    // Recommendation card assertions
    assert.match(html, /UNDERVALUED/);
    assert.match(html, /\$249\.36/); // DCF Target Price
    assert.match(html, /\$148\.36/); // Market Price
    assert.match(html, /\+68\.08%/); // Implied Upside

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
    const finalFcf = dcf.schedule[dcf.schedule.length - 1].fcf;
    const expectedR40 = (finalFcf / projRev) + (Math.pow(projRev / baseRev, 1 / 5) - 1);
    const expectedR40Str = (expectedR40 * 100).toFixed(1) + '%';
    assert.match(html, new RegExp(expectedR40Str.replace('.', '\\.')));

    // Threshold discipline
    assert.match(html, /RECOMMENDATION_THRESHOLDS/);

    view.dispose();
  });
});

describe('P5.5 — Sensitivity Tab: 9×5 WACC × g Matrix & Scenario Bands', () => {
  test('invokes TabulatorConstructor for 9×5 matrix with 45 cells satisfying monotonicity', async () => {
    const { sensitivityGrid, scenarios, dcf } = await getDatasets();
    const container = createHtmlContainer();

    let gridConfig = null;
    class MockTabulator {
      constructor(element, config) {
        gridConfig = config;
      }
    }

    const view = renderSensitivity({
      container,
      sensitivityGrid,
      scenarios,
      dcf,
      TabulatorConstructor: MockTabulator,
    });

    assert.ok(view);
    assert.ok(gridConfig);
    assert.equal(gridConfig.statement, 'sensitivityGrid');
    assert.equal(gridConfig.layout, 'fitDataFill');
    assert.equal(gridConfig.selectableRange, true);
    assert.equal(gridConfig.clipboard, true);

    // 9 WACC rows × 5 Growth columns = 45 data cells
    assert.equal(gridConfig.data.length, 9, 'Must have 9 WACC rows');
    assert.equal(gridConfig.columns.length, 6, 'Must have 1 label column + 5 growth columns');

    // Monotonicity verification
    for (let r = 0; r < gridConfig.data.length; r++) {
      const row = gridConfig.data[r];
      const gKeys = ['g_0_0100', 'g_0_0150', 'g_0_0200', 'g_0_0250', 'g_0_0300'];
      for (let c = 0; c < gKeys.length - 1; c++) {
        const valCurrent = row[gKeys[c]];
        const valNext = row[gKeys[c + 1]];
        assert.ok(valNext > valCurrent, `Price must increase as growth increases: ${valNext} > ${valCurrent}`);
      }
    }

    for (let c = 0; c < 5; c++) {
      const gKey = ['g_0_0100', 'g_0_0150', 'g_0_0200', 'g_0_0250', 'g_0_0300'][c];
      for (let r = 0; r < gridConfig.data.length - 1; r++) {
        const valCurrent = gridConfig.data[r][gKey];
        const valNext = gridConfig.data[r + 1][gKey];
        assert.ok(valCurrent > valNext, `Price must decrease as WACC increases: ${valCurrent} > ${valNext}`);
      }
    }

    const html = container.innerHTML;
    // Scenario Comparison table assertions (P6R.3 display labels: Downside, Base, Upside)
    assert.match(html, /Downside Case/);
    assert.match(html, /\$132\.16/);
    assert.match(html, /Base Case/);
    assert.match(html, /\$249\.36/);
    assert.match(html, /Upside Case/);
    assert.match(html, /\$532\.17/);

    // Hybrid FY2026 Invariance Footnote with OCF $239,031
    assert.match(html, /Hybrid FY2026 Invariance Invariant/);
    assert.match(html, /\$590,421/);
    assert.match(html, /\$78,472/);
    assert.match(html, /\$239,031/);

    view.dispose();
  });
});

describe('P5.5 — Live App Mounting & Integration', () => {
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
    assert.ok(summaryPane.innerHTML.includes('UNDERVALUED'));
    assert.ok(sensitivityPane.innerHTML.includes('Sensitivity Matrix'));

    // Changing driver updates model and views
    app.setDriver('terminal_growth_rate', 0.025);
    assert.equal(app.state().dirty, true);

    app.dispose();
  });
});

describe('P5.5 — Quality Gates: Zero style=, Zero UI Bare Literals, Purity & Corpus Invariance', () => {
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
          if (num === 1000 || num === 1280 || num === 1900 || num === 2000) continue;
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
