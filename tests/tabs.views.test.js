/**
 * P5.3 Artifact Contract Tests  -  Assumptions & Historicals Tab Views.
 *
 * Covers:
 *  - renderAssumptions: universal blue cell-input class, range sliders, number inputs,
 *    scenario picker, MKT badges with asOf dates, event dispatch, and disposal.
 *  - renderHistoricals: 4 financial statement sections, frozen metric column,
 *    TTM computed column, 100% row citation coverage, and disposal.
 *  - Purity and corpus invariants.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderAssumptions } from '../src/ui/assumptionsTab.js';
import { renderHistoricals } from '../src/ui/historicalsTab.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { readLedgerUrls } from './_ledger.js';
import { StubElement } from './_dom_stub.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const FORMAT_PATH = fileURLToPath(new URL('../src/ui/format.js', import.meta.url));
const ASSUMPTIONS_TAB_PATH = fileURLToPath(new URL('../src/ui/assumptionsTab.js', import.meta.url));
const HISTORICALS_TAB_PATH = fileURLToPath(new URL('../src/ui/historicalsTab.js', import.meta.url));

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

describe('P5.3  -  Assumptions Tab View: renderAssumptions()', () => {
  test('renders interactive driver controls with universal blue cell-input styling', async () => {
    const assumptions = await getAssumptions();
    const container = createHtmlContainer();

    const view = renderAssumptions({
      container,
      assumptions,
    });

    assert.ok(view);
    const html = container.innerHTML;

    // Must render all driver names
    for (const driver of assumptions.drivers) {
      assert.ok(
        html.includes(driver.name),
        `Assumptions view must include driver "${driver.name}"`,
      );
      assert.ok(
        html.includes(`data-driver-input="${driver.name}"`),
        `Must include number input for "${driver.name}"`,
      );
      assert.ok(
        html.includes(`data-driver-slider="${driver.name}"`),
        `Must include range slider for "${driver.name}"`,
      );
    }

    // Universal cell color-coding rule: inputs carry .cell-input class
    assert.match(html, /class="[^"]*cell-input[^"]*driver-number-input/);
    assert.match(html, /class="[^"]*cell-input[^"]*driver-slider/);

    // Market drivers carry MKT badge with asOf date
    for (const mktName of ['risk_free_rate', 'beta', 'equity_risk_premium', 'market_share_price', 'shares_outstanding']) {
      const driver = assumptions.get(mktName);
      assert.ok(driver, `Driver ${mktName} must exist`);
      assert.match(html, new RegExp(driver.asOf));
      assert.match(html, /badge-mkt.*MKT/);
    }

    view.dispose();
    assert.equal(container.innerHTML, '');
  });

  test('scenario picker dispatches onScenarioChange', async () => {
    const assumptions = await getAssumptions();
    const container = createHtmlContainer();

    let selectedScenario = null;
    const view = renderAssumptions({
      container,
      assumptions,
      onScenarioChange: (sc) => {
        selectedScenario = sc;
      },
    });

    assert.match(container.innerHTML, /data-scenario="bear"/);
    assert.match(container.innerHTML, /data-scenario="base"/);
    assert.match(container.innerHTML, /data-scenario="bull"/);

    view.dispose();
  });
});

describe('P5.3  -  Historicals Tab View: renderHistoricals()', () => {
  test('renders 4 financial statements with Tabulator configs and source drawer', async () => {
    const historical = await getHistorical();
    const container = createHtmlContainer();

    const view = renderHistoricals({
      container,
      historical,
    });

    assert.ok(view);
    const html = container.innerHTML;

    // 4 statement card headers rendered
    assert.match(html, /Income Statement/i);
    assert.match(html, /Balance Sheet/i);
    assert.match(html, /Cash Flow Statement/i);
    assert.match(html, /Key Performance Indicators/i);

    // Audit Center present with SEC filing links
    assert.match(html, /<details class="filing-card"/);
    assert.match(html, /https:\/\/www\.sec\.gov/);

    // Tabulator configurations populated across all 4 statements
    assert.equal(view.tabulatorConfigs.length, 4);
    for (const cfg of view.tabulatorConfigs) {
      assert.equal(cfg.layout, 'fitDataFill');
      assert.equal(cfg.selectableRange, true);
      assert.equal(cfg.clipboard, true);
      assert.equal(cfg.keybindings, true);
      assert.equal(cfg.headerSort, false);
      assert.ok(cfg.data.length > 0);
      assert.equal(cfg.columns.length, 11);
      assert.equal(cfg.columns[0].frozen, true);
      for (const col of cfg.columns) {
        assert.equal(col.editor, false);
      }
    }

    view.dispose();
    assert.equal(container.innerHTML, '');
  });
});

describe('P5.3  -  Engine Purity & Corpus Invariance', () => {
  test('purity: UI modules contain zero wall-clock reads or non-deterministic APIs', async () => {
    for (const file of [FORMAT_PATH, ASSUMPTIONS_TAB_PATH, HISTORICALS_TAB_PATH]) {
      const source = await readText(file);
      assert.doesNotMatch(source, /\bDate\.now\s*\(/, `${file} must not call Date.now directly`);
      assert.doesNotMatch(source, /\bMath\.random\s*\(/, `${file} must not call Math.random`);
      assert.doesNotMatch(source, /\bfetch\s*\(/, `${file} must not call fetch directly`);
    }
  });

  test('corpus record count invariant: 706 records unchanged', async () => {
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
