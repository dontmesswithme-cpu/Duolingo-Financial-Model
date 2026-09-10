/**
 * RP5.1 contract tests: forward KPI cards and trajectory chart bindings.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { readLedgerUrls } from './_ledger.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { buildProjectionColumns, computeProjectionKpis, renderProjections } from '../src/ui/projectionsTab.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');

async function getThreeStatement() {
  const historical = await loadHistorical({
    dir: DATA_DIR,
    readText,
    requireLedger: true,
    ledger: readLedgerUrls(),
  });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  const schedules = schedulesEngine.build(historical, assumptions);
  const forecast = forecastEngine.project({ historical, assumptions });
  return {
    historical,
    threeStatement: threeStatementEngine.project(schedules, assumptions, forecast),
  };
}

function createContainer() {
  const children = new Map();
  return {
    innerHTML: '',
    querySelector(selector) {
      const match = /\[data-statement=["']?([^"'\]]+)["']?\]/.exec(selector);
      if (!match) return null;
      if (!children.has(match[1])) children.set(match[1], { destroy() {} });
      return children.get(match[1]);
    },
  };
}

function createInteractiveContainer() {
  const elements = [];
  const gridElements = new Map();
  const makeElement = (attributes = {}) => {
    const listeners = new Map();
    const classes = new Set();
    return {
      attributes: { ...attributes },
      hidden: false,
      textContent: '',
      classList: {
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
      getAttribute(name) { return this.attributes[name] ?? null; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      addEventListener(type, handler) { listeners.set(type, handler); },
      click() { listeners.get('click')?.({ target: this }); },
    };
  };
  const container = {
    _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(value) {
      this._innerHTML = String(value);
      elements.length = 0;
      for (const key of ['incomeStatement', 'balanceSheet', 'cashFlow']) {
        const panel = makeElement({ 'data-statement-panel': key });
        elements.push(panel);
        gridElements.set(key, makeElement({ 'data-statement': key }));
      }
      for (const key of ['incomeStatement', 'balanceSheet', 'cashFlow']) elements.push(makeElement({ 'data-projection-statement': key }));
      const millionsActive = value.includes('data-projection-unit="millions" aria-pressed="true"');
      for (const key of ['thousands', 'millions']) {
        elements.push(makeElement({
          'data-projection-unit': key,
          'aria-pressed': String(key === 'millions' ? millionsActive : !millionsActive),
        }));
      }
      const unitLabel = value.includes('$ in millions') ? '$ in millions' : '$ in thousands';
      for (let i = 0; i < 4; i++) {
        const label = makeElement({ 'data-unit-label': '' });
        label.textContent = unitLabel;
        elements.push(label);
      }
    },
    querySelector(selector) {
      const match = /\[data-statement=["']?([^"'\]]+)["']?\]/.exec(selector);
      return match ? gridElements.get(match[1]) : null;
    },
    querySelectorAll(selector) {
      const match = /\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/.exec(selector);
      if (!match) return [];
      return elements.filter((element) => match[1] in element.attributes && (match[2] === undefined || element.attributes[match[1]] === match[2]));
    },
  };
  return container;
}

describe('RP5.1 - Forward KPI Summary Cards & Trajectory Charts', () => {
  test('computes four engine-derived KPI cards with no mock values', async () => {
    const { threeStatement } = await getThreeStatement();
    const kpis = computeProjectionKpis(threeStatement);
    assert.deepEqual(kpis.map((kpi) => kpi.key), [
      'revenue-cagr',
      'operating-margin',
      'fcf-margin',
      'net-income',
    ]);
    assert.ok(kpis.every((kpi) => Number.isFinite(kpi.value)), 'all KPI values must be finite');

    const revenue2026 = threeStatement.incomeStatement.byPeriod.FY2026.revenue.total.value;
    const revenue2030 = threeStatement.incomeStatement.byPeriod.FY2030.revenue.total.value;
    const ebit2030 = threeStatement.incomeStatement.byPeriod.FY2030.operating_income.value;
    const fcf2030 = threeStatement.cashFlow.byPeriod.FY2030.free_cash_flow.value;
    const netIncome2030 = threeStatement.incomeStatement.byPeriod.FY2030.net_income.value;
    assert.ok(Math.abs(kpis[0].value - (Math.pow(revenue2030 / revenue2026, 0.25) - 1)) < 1e-12);
    assert.ok(Math.abs(kpis[1].value - ebit2030 / revenue2030) < 1e-12);
    assert.ok(Math.abs(kpis[2].value - fcf2030 / revenue2030) < 1e-12);
    assert.ok(Math.abs(kpis[3].value - netIncome2030 / 1e3) < 1e-12);

    const missingTerminalRevenue = structuredClone(threeStatement);
    delete missingTerminalRevenue.incomeStatement.byPeriod.FY2030.revenue.total.value;
    assert.equal(computeProjectionKpis(missingTerminalRevenue)[0].value, null);
  });

  test('mounts the KPI strip and both stable chart targets', async () => {
    const { historical, threeStatement } = await getThreeStatement();
    const container = createContainer();
    const view = renderProjections({ container, historical, threeStatement, TabulatorConstructor: null });

    assert.match(container.innerHTML, /class="kpi-strip"/);
    assert.match(container.innerHTML, /data-kpi="revenue-cagr"/);
    assert.match(container.innerHTML, /data-kpi="operating-margin"/);
    assert.match(container.innerHTML, /id="chart-revenue-fcf"/);
    assert.match(container.innerHTML, /id="chart-margin-expansion"/);
    assert.match(container.innerHTML, /id="revenue-fcf-svg"/);
    assert.match(container.innerHTML, /id="margin-expansion-svg"/);
    view.dispose();
    assert.equal(container.innerHTML, '');
  });

  test('re-render update refreshes forward cards and charts synchronously', async () => {
    const { historical, threeStatement } = await getThreeStatement();
    const container = createContainer();
    const view = renderProjections({ container, historical, threeStatement, TabulatorConstructor: null });
    const before = container.innerHTML;
    const changed = structuredClone(threeStatement);
    changed.incomeStatement.byPeriod.FY2030.revenue.total.value *= 1.1;
    view.update(changed, historical);
    assert.ok(container.innerHTML.length > 0);
    assert.equal(container.innerHTML.includes('id="chart-revenue-fcf"'), true);
    assert.notEqual(container.innerHTML, before);
    view.dispose();
  });

  test('statement switcher keeps one panel visible and unit toggle updates labels', async () => {
    const { historical, threeStatement } = await getThreeStatement();
    const container = createInteractiveContainer();
    const view = renderProjections({ container, historical, threeStatement, TabulatorConstructor: null });
    const statementButtons = container.querySelectorAll('[data-projection-statement]');
    const panels = container.querySelectorAll('[data-statement-panel]');
    assert.equal(statementButtons.length, 3);
    assert.equal(panels.filter((panel) => !panel.hidden).length, 1);

    statementButtons[1].click();
    assert.equal(panels.filter((panel) => !panel.hidden).length, 1);
    assert.equal(panels[1].hidden, false);
    assert.equal(statementButtons[1].getAttribute('aria-selected'), 'true');

    const unitButtons = container.querySelectorAll('[data-projection-unit]');
    const thousandsMarkup = container.innerHTML;
    assert.match(thousandsMarkup, /\$1,193,853\.52/);
    unitButtons[1].click();
    assert.equal(container.innerHTML.includes('$1,193,853.52'), false);
    assert.match(container.innerHTML, /\$1,193\.85/);
    assert.equal(container.querySelectorAll('[data-projection-unit]')[1].getAttribute('aria-pressed'), 'true');
    assert.ok(container.querySelectorAll('[data-unit-label]').every((label) => label.textContent === '$ in millions'));
    view.dispose();
  });

  test('RWC.1c: units toggle uses canonical pill-control/pill-btn capsule with rescale preserved (RP0 precedent: one-line rationale — RW2.2 conformance; no expansion: data-projection-unit contract unchanged)', async () => {
    const { historical, threeStatement } = await getThreeStatement();
    const container = createInteractiveContainer();
    const view = renderProjections({ container, historical, threeStatement, TabulatorConstructor: null });
    const html = container.innerHTML;
    assert.match(html, /projection-unit-toggle pill-control/, 'Units toggle container must carry canonical pill-control');
    assert.match(html, /pill-btn projection-unit-btn/, 'Units buttons must carry canonical pill-btn');
    assert.match(html, /data-projection-unit="thousands"/, 'Thousands selector contract preserved (no expansion)');
    assert.match(html, /data-projection-unit="millions"/, 'Millions selector contract preserved (no expansion)');
    // Rescale + round-trip preserved (RP5.2 F1 regression)
    const unitButtons = container.querySelectorAll('[data-projection-unit]');
    assert.match(container.innerHTML, /\$1,193,853\.52/);
    unitButtons[1].click();
    assert.match(container.innerHTML, /\$1,193\.85/);
    unitButtons[0].click();
    assert.match(container.innerHTML, /\$1,193,853\.52/);
    view.dispose();
  });

  test('projection columns freeze the line-item pane and expose estimate headers', () => {
    const thousands = buildProjectionColumns();
    const millions = buildProjectionColumns({ displayUnit: 'millions' });
    assert.equal(thousands[0].frozen, true);
    assert.equal(thousands[6].title, 'FY2026E');
    const cell = { getValue: () => 1234.5, getRow: () => ({ getData: () => ({}) }) };
    assert.equal(thousands[1].formatter(cell), '$1,235');
    assert.equal(millions[1].formatter(cell), '$1');
  });
});
