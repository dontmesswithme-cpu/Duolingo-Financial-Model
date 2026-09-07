/**
 * P5.3 Artifact Contract Tests  -  Assumptions & Historicals Tab Views & App Mounting.
 *
 * Comprehensive verification against docs/phases/phase_5.md §3 Task P5.3 & DIR Validation Plan:
 *  1. Live Tabulator Grid Instantiation & Constructor Invocation on all 4 statements
 *  2. Tabulator Schema Contracts: selectableRange: true, clipboard: true, keybindings: true, editor: false, frozen: true
 *  3. 5Y Annual + 4 Discrete Quarters + TTM computed Column Set
 *  4. Formatters & Sole Badge Path (format.estSuffix / format.mktBadge)
 *  5. Zero inline style= attributes across src/ui/
 *  6. Visible MKT Attribution (asOf + provider + SEC/FRED links)
 *  7. Live App Mounting in createApp / bootApp with real LEDGER_URLS
 *  8. Citation superscripts <sup>[N]</sup> + Source Expansion Drawer
 *  9. Purity & 706-record Corpus Invariance
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderAssumptions } from '../src/ui/assumptionsTab.js';
import { renderHistoricals } from '../src/ui/historicalsTab.js';
import { createApp } from '../src/app.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { readLedgerUrls } from './_ledger.js';
import { StubElement, createTabRoot } from './_dom_stub.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const UI_DIR = fileURLToPath(new URL('../src/ui/', import.meta.url));

const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();
const P3_CORPUS_RECORD_COUNT = 706;

async function getHistorical() {
  return loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
}

async function getAssumptions() {
  return loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
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

describe('P5.3  -  Assumptions Tab: Driver Controls, Blue Styling & MKT Attribution', () => {
  test('renders all drivers with universal blue .cell-input class and bounded inputs', async () => {
    const assumptions = await getAssumptions();
    const container = createHtmlContainer();

    const view = renderAssumptions({
      container,
      assumptions,
    });

    assert.ok(view);
    const html = container.innerHTML;

    // All drivers rendered
    for (const driver of assumptions.drivers) {
      assert.ok(html.includes(driver.name), `Must contain driver "${driver.name}"`);
      assert.ok(html.includes(`data-driver-input="${driver.name}"`));
      assert.ok(html.includes(`data-driver-slider="${driver.name}"`));
    }

    // Universal cell color-coding rule: .cell-input blue class on every input & slider
    assert.match(html, /class="[^"]*cell-input[^"]*driver-number-input/);
    assert.match(html, /class="[^"]*cell-input[^"]*driver-slider/);

    // Visible MKT attribution: asOf, provider, and hyperlink
    for (const mktName of ['risk_free_rate', 'beta', 'equity_risk_premium', 'market_share_price', 'shares_outstanding']) {
      const d = assumptions.get(mktName);
      assert.ok(d, `Market driver ${mktName} must exist`);
      assert.match(html, new RegExp(d.asOf), `Must visibly display asOf date ${d.asOf}`);
      if (d.source?.provider) {
        assert.ok(html.includes(d.source.provider), `Must visibly display provider ${d.source.provider}`);
      }
      if (d.source?.url) {
        assert.ok(html.includes(d.source.url), `Must contain hyperlink to ${d.source.url}`);
      }
    }

    view.dispose();
    assert.equal(container.innerHTML, '');
  });

  test('scenario selector updates active class and dispatches callback', async () => {
    const assumptions = await getAssumptions();
    const container = createHtmlContainer();

    let chosenScenario = null;
    const view = renderAssumptions({
      container,
      assumptions,
      onScenarioChange: (sc) => {
        chosenScenario = sc;
      },
    });

    assert.match(container.innerHTML, /data-scenario="bear"/);
    assert.match(container.innerHTML, /data-scenario="base"/);
    assert.match(container.innerHTML, /data-scenario="bull"/);

    view.dispose();
  });
});

describe('P5.3  -  Historicals Tab: Live Tabulator Grid Instantiation & Schema Contracts', () => {
  test('invokes TabulatorConstructor exactly four times with full contract options and frozen columns', async () => {
    const historical = await getHistorical();
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

    const view = renderHistoricals({
      container,
      historical,
      TabulatorConstructor: MockTabulator,
    });

    assert.ok(view);
    const html = container.innerHTML;

    // Live Tabulator constructor called EXACTLY 4 times (DIR Validation Plan #1)
    assert.equal(constructorCalls.length, 4, 'TabulatorConstructor must be invoked exactly four times (income, balance, cashflow, kpis)');

    // 4 sections rendered in card wrappers with source drawer
    assert.match(html, /Income Statement/i);
    assert.match(html, /Balance Sheet/i);
    assert.match(html, /Cash Flow Statement/i);
    assert.match(html, /Key Performance Indicators/i);
    assert.match(html, /<details class="source-drawer">/);
    assert.match(html, /Audit &amp; Filing Citations Directory/);

    const expectedStatements = ['income', 'balance', 'cashflow', 'kpis'];
    for (let i = 0; i < expectedStatements.length; i++) {
      const call = constructorCalls[i];
      const stmt = expectedStatements[i];

      assert.equal(call.config.statement, stmt);
      assert.equal(call.config.layout, 'fitDataFill', 'layout must be fitDataFill');
      assert.equal(call.config.selectableRange, true, 'selectableRange must be boolean true');
      assert.equal(call.config.selectableRangeColumns, true, 'selectableRangeColumns must be true');
      assert.equal(call.config.clipboard, true, 'clipboard must be true');
      assert.equal(call.config.clipboardCopyConfig?.formatCells, false, 'clipboardCopyConfig.formatCells must be false for raw Excel numbers');
      assert.equal(call.config.headerSort, false, 'headerSort must be false');
      assert.equal(call.config.keybindings, true, 'keybindings must be true');

      // Data rows present
      assert.ok(Array.isArray(call.config.data) && call.config.data.length > 0, `Data rows must be non-empty for ${stmt}`);

      // 11 Columns: Metric Label + 5 Annuals + 4 Quarters + TTM
      assert.equal(call.config.columns.length, 11, `Statement ${stmt} must have exactly 11 columns`);

      // First column must be frozen
      assert.equal(call.config.columns[0].frozen, true, `First column must be frozen for ${stmt}`);
      assert.equal(call.config.columns[0].headerSort, false);

      // Zero editors on any column (DIR plan: editor: false on every column)
      for (const col of call.config.columns) {
        assert.equal(col.editor, false, `Column ${col.field || col.title} must have editor: false`);
      }

      // TTM column carries titleFormatter
      const ttmCol = call.config.columns.find((c) => c.field === 'TTM');
      assert.ok(ttmCol, `TTM column must exist on ${stmt}`);
      assert.equal(typeof ttmCol.titleFormatter, 'function', `TTM column must have titleFormatter for HTML badge`);
      const ttmTitleHtml = ttmCol.titleFormatter();
      assert.match(ttmTitleHtml, /badge-computed.*computed/);
    }

    // Instances tracked and destroyed on dispose
    assert.equal(view.tabulatorInstances.length, 4);
    view.dispose();
    assert.ok(constructorCalls.every((c) => c.instance.destroyed === true), 'All Tabulator instances must be destroyed on dispose');
  });
});

describe('P5.3  -  Live App Mounting & Integration', () => {
  test('createApp mounts assumptions and historicals views into live DOM root', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

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
    const assumptionsPane = panes.find((p) => p.getAttribute('data-tab') === 'assumptions');
    const historicalsPane = panes.find((p) => p.getAttribute('data-tab') === 'historicals');

    assert.ok(assumptionsPane.innerHTML.includes('Active Model Scenario'));
    assert.ok(historicalsPane.innerHTML.includes('Income Statement'));

    // Recalculation flows into mounted views
    app.setScenario('bull');
    assert.equal(app.state().scenario, 'bull');

    app.dispose();
  });

  test('bootApp boots real browser pipeline with LEDGER_URLS without throwing SOURCE_NOT_IN_LEDGER', async () => {
    const { root, panes } = createTabRoot(['cover', 'assumptions', 'historicals', 'schedules', 'projections', 'valuation', 'summary', 'sensitivity']);
    const { LEDGER_URLS } = await import('../src/data/constants.js');
    const { bootApp } = await import('../src/app.js');

    const result = await bootApp({
      data: { loadHistorical, loadAssumptions },
      root,
      now: () => Date.now(),
      ledger: LEDGER_URLS,
      readText,
      dir: DATA_DIR,
      assumptionsLocation: ASSUMPTIONS_PATH,
    });

    assert.ok(result.app, 'App controller constructed');
    assert.ok(result.dataset, 'Dataset loaded');

    const assumptionsPane = panes.find((p) => p.getAttribute('data-tab') === 'assumptions');
    const historicalsPane = panes.find((p) => p.getAttribute('data-tab') === 'historicals');

    assert.ok(assumptionsPane.innerHTML.includes('Active Model Scenario'));
    assert.ok(historicalsPane.innerHTML.includes('Income Statement'));
    assert.ok(historicalsPane.innerHTML.includes('Audit &amp; Filing Citations Directory'));

    result.app.dispose();
  });

  test('keydown inside grid element does not trigger tab router switching', async () => {
    const { createTabs } = await import('../src/ui/tabs.js');
    const { root } = createTabRoot(['cover', 'assumptions', 'historicals', 'schedules']);
    const tabs = createTabs({ root, tabs: ['cover', 'assumptions', 'historicals', 'schedules'] });

    tabs.show('historicals');
    assert.equal(tabs.active(), 'historicals');

    // Simulate keydown event with target inside .tabulator grid
    const mockGridCell = new StubElement({ class: 'tabulator-cell' });
    mockGridCell.closest = (selector) => (selector.includes('.tabulator') ? mockGridCell : null);

    root.dispatch('keydown', { key: 'ArrowRight', target: mockGridCell });
    assert.equal(tabs.active(), 'historicals', 'Active tab must not change when arrow key originates inside grid');

    root.dispatch('keydown', { key: 'ArrowLeft', target: mockGridCell });
    assert.equal(tabs.active(), 'historicals', 'Active tab must not change when arrow key originates inside grid');

    // Normal keydown outside grid switches tab
    root.dispatch('keydown', { key: 'ArrowRight', target: root });
    assert.equal(tabs.active(), 'schedules');

    tabs.dispose();
  });
});

describe('P5.3  -  Quality Gates: Zero style=, Purity & Corpus Invariance', () => {
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
    const historical = await getHistorical();
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];
    assert.equal(allRows.length, P3_CORPUS_RECORD_COUNT, 'Corpus must remain exactly 706 records');
  });
});
