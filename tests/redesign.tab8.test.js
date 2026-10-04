/* RP8.2 contract tests: spectrum bands valuations, matrix monotonicity, hybrid invariance, dropdown. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSensitivity } from '../src/ui/sensitivityTab.js';
import { createApp } from '../src/app.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { readLedgerUrls } from './_ledger.js';
import { StubElement, createTabRoot } from './_dom_stub.js';
import { runFullValuation } from '../src/engine/recommend.js';
import { SCENARIO_NAMES } from '../src/data/constants.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');

async function getDatasets() {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: readLedgerUrls() });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  return { historical, assumptions };
}

async function getScenarios() {
  const { historical, assumptions } = await getDatasets();
  return {
    bear: runFullValuation(historical, assumptions, 'bear'),
    base: runFullValuation(historical, assumptions, 'base'),
    bull: runFullValuation(historical, assumptions, 'bull'),
  };
}

function stubContainer() {
  const el = new StubElement();
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return html; },
    set(val) { html = String(val); },
  });
  return el;
}

function bootApp(opts = {}) {
  return getDatasets().then(({ historical, assumptions }) => {
    const { root, links, panes } = createTabRoot(['cover', 'assumptions', 'historicals', 'schedules', 'projections', 'valuation', 'summary', 'sensitivity']);
    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      historical,
      assumptions,
      root,
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      horizon: 5,
      ...opts,
    });
    return { app, root, links, panes };
  });
}

const sensPaneOf = (panes) => panes.find((p) => p.getAttribute('data-tab') === 'sensitivity');
const sensLinkOf = (links) => links.find((l) => l.getAttribute('data-tab') === 'sensitivity');

function parseHeatmapCells(html) {
  const cellRe = /<td class="heatmap-cell heatmap-tier-\d+( active-cell)?" data-wacc="([\d.]+)" data-growth="([\d.]+)" data-per-share="([\d.]+)">/g;
  return [...html.matchAll(cellRe)].map((m) => ({ wacc: Number(m[2]), growth: Number(m[3]), perShare: Number(m[4]) }));
}

describe('RP8.2 — Scenario bands: Downside < Base < Upside strictly (engine + rendered)', () => {
  // Two DIFFERENT lanes are asserted in this file and are not interchangeable. Measured:
  //   engine-direct (runFullValuation, no datedSeam -> integer_period_index),
  //     finite-roll intermediate: bear 71.9188 < base 117.5751 < bull 215.4863
  //   app-rendered (createApp at horizon 5 -> dated_seam):
  //     intermediate:  bear 72.0999 < base 120.4478 < bull 223.2163
  //     canonical:     bear 71.3934 < base 119.2612 < bull 221.0123
  test('engine-direct lane per-share ordering holds on the integer-period (no seam) pins 71.92/117.58/215.49', async () => {
    // Engine-direct `runFullValuation` without `{ datedSeam: true }` is the
    // integer-index legacy lane: P10.2 keeps it as the disclosed comparison and
    // the FP.2 five-year regression baseline. The app-rendered lanes below run
    // the canonical dated seam, so the two pin sets deliberately differ.
    const scenarios = await getScenarios();
    assert.equal(scenarios.base.dcf.valuationBasis, 'integer_period_index', 'engine-direct lane declares its basis');
    // This asserts the ENGINE's scenario object, which legitimately carries the
  // finite-roll intermediate. P10.6 changes what the surfaces DISPLAY, not engine
  // data; the displayed spectrum is asserted on the canonical basis separately.
  assert.ok(Math.abs(scenarios.bear.perShare - 71.9188) < 0.01, `Bear pin ~71.92, got ${scenarios.bear.perShare}`);
    assert.ok(Math.abs(scenarios.base.perShare - 117.5751) < 0.01, `Base pin ~117.58, got ${scenarios.base.perShare}`);
    assert.ok(Math.abs(scenarios.bull.perShare - 215.4863) < 0.01, `Bull pin ~215.49, got ${scenarios.bull.perShare}`);
    assert.ok(scenarios.bear.perShare < scenarios.base.perShare, 'Downside < Base');
    assert.ok(scenarios.base.perShare < scenarios.bull.perShare, 'Base < Upside');
  });

  test('spectrum table renders the three bands on the canonical basis', async () => {
    const { app, panes } = await bootApp();
    const html = sensPaneOf(panes).innerHTML;
    assert.match(html, /<table class="financial-summary-table scenario-spectrum-table">/);
    assert.equal((html.match(/<tr class="scenario-row-/g) || []).length, 3);
    assert.match(html, /Downside Case/);
    // P10.6: the spectrum states the CANONICAL after-future-dilution basis, the
    // same basis as the valuation headline, the recommendation, the cover tile and
    // the summary cards. Measured off the live app at horizon 5 (dated_seam):
    //   canonical bear 71.39 < base 119.26 < bull 221.01
    // (distinct from the engine-direct no-seam lane pinned in the test above).
    assert.match(html, /Base Case/);
    assert.match(html, /\$119\.26/);
    assert.match(html, /Upside Case/);
    assert.match(html, /\$221\.01/);
    // The engine's own scenario values are unchanged and still engine-true; only
    // the DISPLAY basis moved. Ordering still holds on the displayed figures.
    const s = app.state().scenarios;
    assert.ok(s.bear.perShare < s.base.perShare, 'engine bear < base');
    assert.ok(s.base.perShare < s.bull.perShare, 'engine base < bull');
    assert.match(html, /Upside \/ \(Downside\) %/);
    assert.doesNotMatch(html, /Bear Case/);
    assert.doesNotMatch(html, /Bull Case/);
    app.dispose();
  });
});

describe('RP8.2 — Matrix monotonicity + tier ramp on the live grid', () => {
  test('rendered 45 cells strictly monotonic on both axes with full 9-tier ramp', async () => {
    const { app, panes } = await bootApp();
    const html = sensPaneOf(panes).innerHTML;
    const cells = parseHeatmapCells(html);
    assert.equal(cells.length, 45);
    const waccVals = [...new Set(cells.map((c) => c.wacc))].sort((a, b) => a - b);
    const gVals = [...new Set(cells.map((c) => c.growth))].sort((a, b) => a - b);
    assert.equal(waccVals.length, 9);
    assert.equal(gVals.length, 5);
    const at = (w, g) => cells.find((c) => c.wacc === w && c.growth === g).perShare;
    for (const g of gVals) {
      for (let i = 1; i < waccVals.length; i += 1) {
        assert.ok(at(waccVals[i], g) < at(waccVals[i - 1], g), 'dPrice/dWACC < 0');
      }
    }
    for (const w of waccVals) {
      for (let j = 1; j < gVals.length; j += 1) {
        assert.ok(at(w, gVals[j]) > at(w, gVals[j - 1]), 'dPrice/dg > 0');
      }
    }
    const tiers = new Set([...html.matchAll(/heatmap-tier-(\d)/g)].map((m) => m[1]));
    assert.deepEqual([...tiers].sort(), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    app.dispose();
  });
});

describe('RP8.2 — Hybrid FY2026 invariance (engine anchors + callout)', () => {
  test('H1 filed actuals byte-identical across all three scenarios', async () => {
    const scenarios = await getScenarios();
    for (const key of SCENARIO_NAMES) {
      const sc = scenarios[key];
      assert.equal(sc.incomeStatement.byPeriod.FY2026.revenue.total.h1.value, 590421, `H1 revenue 590,421 in ${key}`);
      assert.equal(sc.incomeStatement.byPeriod.FY2026.operating_income.h1.value, 78472, `H1 operating income 78,472 in ${key}`);
      assert.equal(sc.incomeStatement.byPeriod.FY2026.net_income.h1.value, 76618, `H1 net income 76,618 in ${key}`);
      assert.equal(sc.cashFlow.byPeriod.FY2026.operating_activities.total.h1.value, 239031, `H1 OCF 239,031 in ${key}`);
    }
  });

  test('invariance callout renders .callout-warning with the filed pins', async () => {
    const { app, panes } = await bootApp();
    const html = sensPaneOf(panes).innerHTML;
    assert.match(html, /<div class="callout-warning sensitivity-invariance-callout">/);
    assert.match(html, /Hybrid FY2026 Invariance Invariant/);
    assert.match(html, /\$590,421/);
    assert.match(html, /\$78,472/);
    assert.match(html, /\$239,031/);
    app.dispose();
  });
});

describe('RP8.2 — Active scenario dropdown (selector + live update)', () => {
  test('dropdown carries bear/base/bull values with Downside/Base/Upside labels, base selected', async () => {
    const { app, panes } = await bootApp();
    const html = sensPaneOf(panes).innerHTML;
    assert.match(html, /<select class="scenario-select" data-scenario-select>/);
    assert.match(html, /<option value="bear">Downside Case<\/option>/);
    assert.match(html, /<option value="base" selected>Base Case<\/option>/);
    assert.match(html, /<option value="bull">Upside Case<\/option>/);
    app.dispose();
  });

  test('change dispatches the scenario key; invalid values ignored; missing callback safe', async () => {
    const { app } = await bootApp();
    const calls = [];
    const container = stubContainer();
    const s = app.state();
    const view = renderSensitivity({
      container,
      sensitivityGrid: s.sensitivityGrid,
      scenarios: s.scenarios,
      dcf: s.dcf,
      activeScenario: 'base',
      onScenarioChange: (key) => calls.push(key),
    });
    const fakeSelect = (value) => ({
      value,
      closest: (sel) => (sel === '[data-scenario-select]' ? fakeSelect(value) : null),
    });
    container.dispatch('change', { target: fakeSelect('bear') });
    container.dispatch('change', { target: fakeSelect('nonsense') });
    container.dispatch('change', { target: { closest: () => null } });
    assert.deepEqual(calls, ['bear']);
    view.dispose();
    // Missing callback renders and absorbs change events without throwing
    const bare = stubContainer();
    const view2 = renderSensitivity({ container: bare, sensitivityGrid: s.sensitivityGrid });
    bare.dispatch('change', { target: fakeSelect('bull') });
    view2.dispose();
    app.dispose();
  });

  test('C1 update-path (P8.3 R2 pattern): render base, update bear real shapes, select + center follow', async () => {
    const { app } = await bootApp();
    const container = stubContainer();
    const sBase = app.state();
    const view = renderSensitivity({
      container,
      sensitivityGrid: sBase.sensitivityGrid,
      scenarios: sBase.scenarios,
      dcf: sBase.dcf,
      activeScenario: sBase.scenario,
    });
    assert.match(container.innerHTML, /<option value="base" selected>Base Case<\/option>/);
    app.setScenario('bear');
    const sBear = app.state();
    // The RP8.2 dropdown supersedes the RP8.1 chip as the active-case
    // indicator (ref single-control structure): selected option + center cell.
    view.update(sBear.sensitivityGrid, sBear.scenarios, sBear.dcf, undefined, sBear.scenario);
    const html = container.innerHTML;
    assert.match(html, /<option value="bear" selected>Downside Case<\/option>/);
    const activeCells = [...html.matchAll(/<td class="heatmap-cell heatmap-tier-\d+ active-cell"[^>]*>([^<]+)<\/td>/g)];
    assert.equal(activeCells.length, 1);
    // P10.6: the WACC x g matrix cells are ENGINE data and remain on the finite-roll
  // intermediate basis by construction. Re-deriving 45 cells on the perpetual basis
  // is a modelling change, not a rendering one, so the surface LABELS its basis
  // explicitly instead (asserted in tests/p106.basisLabeling.test.js).
  assert.equal(activeCells[0][1], '$72.10');
    view.dispose();
    app.setScenario('base');
    app.dispose();
  });

  test('dropdown change drives app.setScenario end-to-end and re-centers Tab 08', async () => {
    const { historical, assumptions } = await getDatasets();
    const { root, links, panes } = createTabRoot(['cover', 'assumptions', 'historicals', 'schedules', 'projections', 'valuation', 'summary', 'sensitivity']);
    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      historical,
      assumptions,
      root,
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      horizon: 5,
    });
    const s = app.state();
    const container = stubContainer();
    const view = renderSensitivity({
      container,
      sensitivityGrid: s.sensitivityGrid,
      scenarios: s.scenarios,
      dcf: s.dcf,
      activeScenario: s.scenario,
      onScenarioChange: (key) => app.setScenario(key),
    });
    const fakeSelect = (value) => ({
      value,
      closest: (sel) => (sel === '[data-scenario-select]' ? fakeSelect(value) : null),
    });
    container.dispatch('change', { target: fakeSelect('bull') });
    assert.equal(app.state().scenario, 'bull');
    assert.ok(Math.abs(app.state().dcf.perShare - 223.21634421221) < 0.01, `DCF target price follows the dropdown, got ${app.state().dcf.perShare}`);
    sensLinkOf(links).dispatch('click');
    const html = sensPaneOf(panes).innerHTML;
    assert.match(html, /<option value="bull" selected>Upside Case<\/option>/);
    assert.ok(html.includes('$223.22'), 'Tab 08 highlights the Upside center');
    view.dispose();
    app.setScenario('base');
    app.dispose();
    void root;
  });
});

describe('RP8.2 — Fail-closed spectrum + render gates', () => {
  test('O-item: base coords absent from the axes render no badge, no error', async () => {
    // Degenerate synthetic vector (unreachable via app construction, which
    // always centers the axes on the active coords): fail-safe pin.
    const container = stubContainer();
    const grid = {
      base: { wacc: 0.5, growth: 0.4, perShare: 1.0 },
      waccValues: [0.08, 0.09, 0.1],
      growthValues: [0.01, 0.02],
      axisNarrowed: true,
      matrix: {
        0.08: { 0.01: { perShare: 200 }, 0.02: { perShare: 220 } },
        0.09: { 0.01: { perShare: 180 }, 0.02: { perShare: 200 } },
        0.1: { 0.01: { perShare: 160 }, 0.02: { perShare: 180 } },
      },
    };
    const view = renderSensitivity({ container, sensitivityGrid: grid });
    const html = container.innerHTML;
    assert.doesNotMatch(html, /active-cell/, 'No active cell when base is off-axes');
    assert.doesNotMatch(html, />ACTIVE</, 'No ACTIVE badge when base is off-axes');
    assert.match(html, /sensitivity-narrowing-note/, 'Narrowing footnote still renders');
    view.dispose();
  });

  test('C3: missing recommendation/verdict/benchmark render dashes, never invented labels', async () => {
    const container = stubContainer();
    const grid = { base: { wacc: 0.11, growth: 0.025 }, waccValues: [0.11], growthValues: [0.025], matrix: { 0.11: { 0.025: { perShare: 144.08 } } } };
    const hollow = { wacc: { wacc: { value: 0.11 } }, perShare: 100, upsidePct: null };
    const view = renderSensitivity({
      container,
      sensitivityGrid: grid,
      scenarios: { bear: hollow, base: hollow, bull: hollow },
      dcf: { perShare: 100 },
    });
    const html = container.innerHTML;
    assert.ok(html.includes(' - '), 'Missing labels/router values render dashes');
    assert.doesNotMatch(html, /rec-badge-(undervalued|fair|overvalued)/, 'No invented verdict/recommendation badges');
    assert.match(html, /Benchmark share price: - snapshot driver\./, 'Missing benchmark renders a dash, never a fallback price');
    assert.doesNotMatch(html, /157\.85/, 'Fallback price 157.85 is not invented');
    view.dispose();
  });

  test('render gates: zero style=, zero em dashes, zero Bear/Bull Case strings', async () => {
    const { app, panes } = await bootApp();
    const html = sensPaneOf(panes).innerHTML;
    assert.doesNotMatch(html, /style\s*=/i);
    assert.ok(!html.includes('—'), 'zero em dashes in rendered html');
    assert.doesNotMatch(html, /Bear Case/);
    assert.doesNotMatch(html, /Bull Case/);
    const src = fs.readFileSync(fileURLToPath(new URL('../src/ui/sensitivityTab.js', import.meta.url)), 'utf8');
    assert.ok(!src.includes('33.9%') && !src.includes('38.0%'), 'zero hardcoded desc margins');
    assert.ok(!src.includes('157.85'), 'C3: benchmark fallback literal retired from source');
    app.dispose();
  });
});
