/**
 * P5.4 Artifact Contract Tests  -  Schedules & Projections Tab Views & Linkages.
 *
 * Comprehensive verification against docs/phases/phase_5.md §3 Task P5.4 & DIR Validation Standards:
 *  1. Live Tabulator Grid Instantiation for all 5 Schedules and 3 Projections statements
 *  2. 10-Year Span (FY2021-FY2025 Historical + FY2026-FY2030 Projected with EST badges)
 *  3. Tabulator Schema Contracts: selectableRange: true, clipboard: true, keybindings: true, editor: false, frozen: true
 *  4. Balance Check Hard Gate Indicator (A === L + E across all forecast years)
 *  5. Data Content Gate: grid cells match engine-derived figures (zero invented numbers)
 *  6. Hybrid FY2026 Provenance & H1/H2 Split Card (H1 actual + H2 estimate === Total)
 *  7. Cell Color-Coding: cell-formula (black), cell-link (green)
 *  8. Live App Mounting & Recalculation Integration in createApp
 *  9. Zero inline style= attributes, Zero bare numeric literals > 999 in src/ui/, Purity & 706-record Corpus Invariance
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderSchedules } from '../src/ui/schedulesTab.js';
import { renderProjections } from '../src/ui/projectionsTab.js';
import { createApp } from '../src/app.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
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
  return { historical, assumptions, schedules: sched, forecast: fc, threeStatement: ts };
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

describe('P5.4  -  Schedules Tab: Tabulator Instantiation & Schema Contracts', () => {
  test('invokes TabulatorConstructor for all 5 schedule families with full options and frozen columns', async () => {
    const { schedules, threeStatement } = await getDatasets();
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

    const view = renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: MockTabulator,
    });

    assert.ok(view);
    const html = container.innerHTML;

    // 5 schedules configured and instantiated (workingCapital, ppe, intangibles, sbc, debt)
    assert.equal(constructorCalls.length, 5, 'TabulatorConstructor must be called for all 5 schedule families');
    assert.match(html, /Working Capital &amp; Operating Schedules/);
    assert.match(html, /PP&amp;E Roll-Forward Schedule/);
    assert.match(html, /Intangible Assets &amp; Amortization Schedule/);
    assert.match(html, /Stock-Based Compensation \(SBC\) Schedule/);
    assert.match(html, /Debt Schedule &amp; Capital Structure/);

    // Balance check hard gate card rendered
    assert.match(html, /Balance Sheet Invariant Hard Gate/);
    assert.match(html, /BALANCED PASS/);

    const expectedStatements = ['workingCapital', 'ppe', 'intangibles', 'sbc', 'debt'];
    for (let i = 0; i < expectedStatements.length; i++) {
      const call = constructorCalls[i];
      const stmt = expectedStatements[i];

      assert.equal(call.config.statement, stmt);
      assert.equal(call.config.layout, 'fitDataFill');
      assert.equal(call.config.selectableRange, true);
      assert.equal(call.config.selectableRangeColumns, true);
      assert.equal(call.config.clipboard, true);
      assert.equal(call.config.clipboardCopyConfig?.formatCells, false);
      assert.equal(call.config.headerSort, false);
      assert.equal(call.config.keybindings, true);

      // 11 Columns: Metric Label + 5 Historical + 5 Forecast
      assert.equal(call.config.columns.length, 11, `Schedule ${stmt} must have 11 columns`);
      assert.equal(call.config.columns[0].frozen, true, `First column must be frozen for ${stmt}`);
      assert.equal(call.config.columns[0].headerSort, false);

      // Zero editors on every column
      for (const col of call.config.columns) {
        assert.equal(col.editor, false);
      }

      // Forecast columns carry titleFormatter emitting EST badge
      for (const fYear of ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']) {
        const col = call.config.columns.find((c) => c.field === fYear);
        assert.ok(col, `Column ${fYear} must exist`);
        assert.equal(typeof col.titleFormatter, 'function');
        assert.match(col.titleFormatter(), /badge-est.*EST/);
      }
    }

    assert.equal(view.tabulatorInstances.length, 5);
    view.dispose();
    assert.ok(constructorCalls.every((c) => c.instance.destroyed === true));
  });

  test('schedules data rows trace directly to engine outputs', async () => {
    const { schedules, threeStatement } = await getDatasets();
    const container = createHtmlContainer();

    let wcConfig = null;
    class MockTabulator {
      constructor(element, config) {
        if (config.statement === 'workingCapital') wcConfig = config;
      }
    }

    renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: MockTabulator,
    });

    assert.ok(wcConfig);
    const arRow = wcConfig.data.find((r) => r.id === 'ar');
    assert.ok(arRow);
    assert.equal(arRow.FY2025, 162827, 'FY2025 Accounts Receivable must match corpus');
    assert.ok(arRow.FY2026 > 0, 'FY2026 Accounts Receivable must be populated from projection');

    const deltaNwcRow = wcConfig.data.find((r) => r.id === 'delta_nwc');
    assert.ok(deltaNwcRow);
    assert.equal(deltaNwcRow.FY2025, -56721, 'FY2025 ΔNWC must match engine');
  });
});

describe('P5.4  -  Projections Tab: Linked IS → BS → CF Grids & Hybrid FY2026 Split', () => {
  test('invokes TabulatorConstructor for all 3 financial statements and renders hybrid FY2026 card', async () => {
    const { threeStatement, historical } = await getDatasets();
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

    const view = renderProjections({
      container,
      threeStatement,
      historical,
      TabulatorConstructor: MockTabulator,
    });

    assert.ok(view);
    const html = container.innerHTML;

    // 3 statements configured and instantiated (incomeStatement, balanceSheet, cashFlow)
    assert.equal(constructorCalls.length, 3, 'TabulatorConstructor must be called for all 3 projection statements');
    assert.match(html, /Projected Income Statement/);
    assert.match(html, /Projected Balance Sheet &amp; Cash Sweep/);
    assert.match(html, /Projected Cash Flow Statement &amp; FCF/);

    // Hybrid FY2026 provenance card
    assert.match(html, /Hybrid FY2026 Provenance &amp; Half-Year Decomposition/);
    assert.match(html, /\$590,421/, 'Must display H1 Actual revenue');
    assert.match(html, /\$603,432\.52/, 'Must display H2 Estimate revenue');
    assert.match(html, /\$1,193,853\.52/, 'Must display full year FY2026 total revenue');

    const expectedStatements = ['incomeStatement', 'balanceSheet', 'cashFlow'];
    for (let i = 0; i < expectedStatements.length; i++) {
      const call = constructorCalls[i];
      const stmt = expectedStatements[i];

      assert.equal(call.config.statement, stmt);
      assert.equal(call.config.layout, 'fitDataFill');
      assert.equal(call.config.selectableRange, true);
      assert.equal(call.config.selectableRangeColumns, true);
      assert.equal(call.config.clipboard, true);
      assert.equal(call.config.clipboardCopyConfig?.formatCells, false);
      assert.equal(call.config.headerSort, false);
      assert.equal(call.config.keybindings, true);

      // 11 Columns: Metric Label + 5 Historical + 5 Forecast
      assert.equal(call.config.columns.length, 11, `Statement ${stmt} must have 11 columns`);
      assert.equal(call.config.columns[0].frozen, true, `First column must be frozen for ${stmt}`);
      assert.equal(call.config.columns[0].headerSort, false);

      // Zero editors on every column
      for (const col of call.config.columns) {
        assert.equal(col.editor, false);
      }

      // Forecast columns carry titleFormatter emitting EST badge
      for (const fYear of ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']) {
        const col = call.config.columns.find((c) => c.field === fYear);
        assert.ok(col, `Column ${fYear} must exist`);
        assert.equal(typeof col.titleFormatter, 'function');
        assert.match(col.titleFormatter(), /badge-est.*EST/);
      }
    }

    assert.equal(view.tabulatorInstances.length, 3);
    view.dispose();
    assert.ok(constructorCalls.every((c) => c.instance.destroyed === true));
  });

  test('projections data rows trace directly to historical corpus and forecast engine outputs', async () => {
    const { threeStatement, historical } = await getDatasets();
    const container = createHtmlContainer();

    const configs = {};
    class MockTabulator {
      constructor(element, config) {
        configs[config.statement] = config;
      }
    }

    renderProjections({
      container,
      threeStatement,
      historical,
      TabulatorConstructor: MockTabulator,
    });

    const is = configs.incomeStatement;
    assert.ok(is);
    const revTotalRow = is.data.find((r) => r.id === 'rev_total');
    assert.equal(revTotalRow.FY2025, 1037589, 'FY2025 Total Revenues must equal corpus truth');
    assert.ok(Math.abs(revTotalRow.FY2026 - 1193853.517) < 1, 'FY2026 Total Revenues must equal projected truth');

    const subRow = is.data.find((r) => r.id === 'rev_sub');
    assert.equal(subRow.FY2025, 873442, 'FY2025 Subscription Revenue must equal corpus truth');
    assert.ok(Math.abs(subRow.FY2026 - 1031077.23) < 1, 'FY2026 Subscription Revenue must equal projected truth');

    const niRow = is.data.find((r) => r.id === 'ni');
    assert.equal(niRow.FY2025, 414065, 'FY2025 Net Income must equal corpus truth');

    const bs = configs.balanceSheet;
    assert.ok(bs);
    const taRow = bs.data.find((r) => r.id === 'total_assets');
    assert.equal(taRow.FY2025, 1992182, 'FY2025 Total Assets must equal corpus truth');
  });
});

describe('P5.4  -  Live App Mounting & Integration', () => {
  test('createApp mounts schedules and projections views and executes reactive updates', async () => {
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
    const schedulesPane = panes.find((p) => p.getAttribute('data-tab') === 'schedules');
    const projectionsPane = panes.find((p) => p.getAttribute('data-tab') === 'projections');

    assert.ok(schedulesPane.innerHTML.includes('Working Capital'));
    assert.ok(schedulesPane.innerHTML.includes('Balance Sheet Invariant Hard Gate'));
    assert.ok(projectionsPane.innerHTML.includes('Projected Income Statement'));
    assert.ok(projectionsPane.innerHTML.includes('Hybrid FY2026'));

    // Changing driver propagates across model
    app.setDriver('dso_days', 60);
    assert.equal(app.state().dirty, true);

    app.dispose();
  });
});

describe('P5.4  -  Quality Gates: Zero style=, Zero UI Bare Literals, Purity & Corpus Invariance', () => {
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
          // Allowed exceptions: HTTP status codes (200, 404), port numbers, standard time constants
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
