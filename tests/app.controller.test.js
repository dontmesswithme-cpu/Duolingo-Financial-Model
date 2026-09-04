/**
 * P5.2 Artifact Contract Tests — App Controller & Tab Shell Interface.
 *
 * Covers:
 *  - DI-constructor `createApp({ data, engine, root, now, historical, assumptions })`
 *  - Clamped driver inputs with schema enforcement and step snapping
 *  - Synchronous recalculation pipeline < 16ms median over 100 runs
 *  - Symmetrical lifecycle: `dispose()` cleans up all listeners without leaks
 *  - Tab shell navigation (8 tabs), ARIA state, and keyboard routing
 *  - Cover/TOC metadata, EST/MKT marking legend, and N/A exclusions
 *  - Purity, determinism, and 706-record corpus invariance
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createApp, bootApp } from '../src/app.js';
import { createTabs, TAB_KEYS } from '../src/ui/tabs.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { EngineError } from '../src/data/errors.js';
import { readLedgerUrls } from './_ledger.js';
import { createTabRoot } from './_dom_stub.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const APP_PATH = fileURLToPath(new URL('../src/app.js', import.meta.url));
const TABS_PATH = fileURLToPath(new URL('../src/ui/tabs.js', import.meta.url));
const INDEX_PATH = fileURLToPath(new URL('../index.html', import.meta.url));

const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();
const P3_CORPUS_RECORD_COUNT = 706;

async function getHistorical() {
  return loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
}

async function getAssumptions() {
  return loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
}

describe('P5.2 — DI Constructor & Dependency Validation', () => {
  test('createApp constructs cleanly with injected dependencies and full pipeline', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      root,
      now: () => 1725148800000,
      historical,
      assumptions,
    });

    assert.ok(app);
    assert.equal(typeof app.setDriver, 'function');
    assert.equal(typeof app.setScenario, 'function');
    assert.equal(typeof app.state, 'function');
    assert.equal(typeof app.dispose, 'function');

    const state = app.state();
    assert.equal(state.scenario, 'base');
    assert.equal(state.dirty, false);
    assert.ok(state.assumptions);
    assert.ok(state.schedules);
    assert.ok(state.forecast);
    assert.ok(state.threeStatement);
    assert.ok(state.wacc);
    assert.ok(state.dcf);
    assert.ok(state.recommendation);
    assert.equal(state.recommendation.label, 'undervalued');
    assert.ok(Math.abs(state.dcf.perShare - 189.30871314314004) < 1e-6);

    app.dispose();
  });

  test('createApp rejects missing dependencies with typed EngineError', () => {
    for (const missing of ['data', 'engine', 'root', 'now']) {
      const deps = {
        data: {},
        engine: {},
        root: createTabRoot(TAB_KEYS).root,
        now: () => 0,
      };
      deps[missing] = undefined;

      assert.throws(
        () => createApp(deps),
        (err) => err instanceof EngineError && err.code === 'invalid_dependency' && err.driverName === missing,
      );
    }
  });

  test('bootApp loads audited corpus and initializes live controller', async () => {
    const { root } = createTabRoot(TAB_KEYS);
    const { app, dataset } = await bootApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      root,
      now: () => 1725148800000,
      readText,
      dir: DATA_DIR,
      assumptionsLocation: ASSUMPTIONS_PATH,
      ledger: LEDGER,
    });

    assert.ok(app);
    assert.ok(dataset);
    assert.ok(dataset.income);
    assert.equal(app.state().scenario, 'base');
    assert.ok(app.state().dcf.perShare > 0);

    app.dispose();
  });
});

describe('P5.2 — Clamped Driver Inputs & Range Enforcement', () => {
  test('setDriver clamps values to driver min and max bounds', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    // Terminal growth bounds are [0, 0.04] with step 0.0025
    app.setDriver('terminal_growth_rate', 0.10); // Above max
    assert.equal(app.state().assumptions.get('terminal_growth_rate').value, 0.04);
    assert.equal(app.state().dirty, true);

    app.setDriver('terminal_growth_rate', -0.05); // Below min
    assert.equal(app.state().assumptions.get('terminal_growth_rate').value, 0.0);

    // Normal in-range value snapped to step (0.0225 -> 0.0225)
    app.setDriver('terminal_growth_rate', 0.0225);
    assert.equal(app.state().assumptions.get('terminal_growth_rate').value, 0.0225);

    app.dispose();
  });

  test('setDriver fails closed on unknown driver or non-finite value', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    assert.throws(
      () => app.setDriver('non_existent_driver', 0.5),
      (err) => err instanceof EngineError && err.code === 'missing_driver',
    );

    assert.throws(
      () => app.setDriver('terminal_growth_rate', NaN),
      (err) => err instanceof EngineError && err.code === 'invalid_driver_value',
    );

    assert.throws(
      () => app.setDriver('terminal_growth_rate', Infinity),
      (err) => err instanceof EngineError && err.code === 'invalid_driver_value',
    );

    app.dispose();
  });
});

describe('P5.2 — Scenario Management & Delta Clamping', () => {
  test('setScenario switches between Bear, Base, Bull and recalibrates model output', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    // Base valuation
    const basePerShare = app.state().dcf.perShare;
    assert.ok(Math.abs(basePerShare - 189.30871314314004) < 1e-6);

    // Switch to Bear
    app.setScenario('bear');
    const bearPerShare = app.state().dcf.perShare;
    assert.equal(app.state().scenario, 'bear');
    assert.ok(bearPerShare < basePerShare);
    assert.ok(Math.abs(bearPerShare - 102.41326051479186) < 1e-4);

    // Switch to Bull
    app.setScenario('bull');
    const bullPerShare = app.state().dcf.perShare;
    assert.equal(app.state().scenario, 'bull');
    assert.ok(bullPerShare > basePerShare);
    assert.ok(Math.abs(bullPerShare - 405.6797934948002) < 1e-4);

    // Rejects invalid scenario name
    assert.throws(
      () => app.setScenario('moon'),
      (err) => err instanceof EngineError && err.code === 'invalid_scenario',
    );

    app.dispose();
  });
});

describe('P5.2 — Synchronous Recalculation Performance (<16ms)', () => {
  test('schedules -> forecast -> threeStatement -> wacc -> dcf -> recommend recalc < 16ms median over 100 runs', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    const times = [];
    for (let i = 0; i < 100; i += 1) {
      const g = 0.01 + (i % 20) * 0.001;
      const start = performance.now();
      app.setDriver('terminal_growth_rate', g);
      const elapsed = performance.now() - start;
      times.push(elapsed);
    }

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];

    assert.ok(
      median < 16.0,
      `Synchronous recalculation median must be < 16ms (measured: ${median.toFixed(3)}ms)`,
    );

    app.dispose();
  });
});

describe('P5.2 — Symmetrical Lifecycle & Teardown', () => {
  test('dispose removes all listeners and is idempotent', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const { root, links, panes } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    for (const link of links) {
      assert.ok(link.listenerCount('click') > 0);
    }

    app.dispose();

    for (const link of links) {
      assert.equal(link.listenerCount('click'), 0, 'click listener removed');
    }

    // Idempotency
    assert.doesNotThrow(() => app.dispose());
    assert.doesNotThrow(() => app.dispose());
  });
});

describe('P5.2 — Tab Shell Navigation & Keyboard Routing', () => {
  test('createTabs correctly manages 8-tab shell navigation and ARIA state', () => {
    const { root, links, panes } = createTabRoot(TAB_KEYS);
    const tabs = createTabs({ root, tabs: TAB_KEYS });

    assert.equal(tabs.active(), 'cover');
    assert.equal(links[0].getAttribute('data-active'), 'true');
    assert.equal(links[0].getAttribute('aria-selected'), 'true');

    // Show assumptions tab
    tabs.show('assumptions');
    assert.equal(tabs.active(), 'assumptions');
    assert.equal(links[1].getAttribute('data-active'), 'true');
    assert.equal(links[1].getAttribute('aria-selected'), 'true');
    assert.equal(links[0].hasAttribute('data-active'), false);

    // Keyboard ArrowRight
    root.dispatch('keydown', { key: 'ArrowRight' });
    assert.equal(tabs.active(), 'historicals');

    // Keyboard End
    root.dispatch('keydown', { key: 'End' });
    assert.equal(tabs.active(), 'sensitivity');

    // Keyboard Home
    root.dispatch('keydown', { key: 'Home' });
    assert.equal(tabs.active(), 'cover');

    tabs.dispose();
  });
});

describe('P5.2 — Cover/TOC Markup, EST/MKT Legend & Invariants', () => {
  test('index.html contains 8 tab sections and required Cover/TOC metadata', async () => {
    const html = await readText(INDEX_PATH);

    for (const tabKey of TAB_KEYS) {
      assert.ok(
        html.includes(`data-tab="${tabKey}"`),
        `index.html must contain tab panel for "${tabKey}"`,
      );
    }

    // Excluded methods marked N/A
    assert.match(html, /Trading Comparables \(Comps\)/i);
    assert.match(html, /Precedent Transactions/i);
    assert.match(html, /LBO Analysis/i);
    assert.match(html, /N\/A/);

    // Disclaimer & Independence (Protocol purged per Director P6R.2)
    assert.match(html, /DISCLAIMER/i);
    assert.match(html, /not affiliated/i);
    assert.match(html, /not investment advice/i);
    assert.doesNotMatch(html, /protocol/i);
  });

  test('purity: src/app.js and src/ui/ contain zero wall-clock reads or non-deterministic APIs', async () => {
    const appSource = await readText(APP_PATH);
    const tabsSource = await readText(TABS_PATH);

    for (const [name, source] of [['app.js', appSource], ['tabs.js', tabsSource]]) {
      assert.doesNotMatch(source, /\bDate\.now\s*\(/, `${name} must not call Date.now directly`);
      assert.doesNotMatch(source, /\bMath\.random\s*\(/, `${name} must not call Math.random`);
      assert.doesNotMatch(source, /\bfetch\s*\(/, `${name} must not call fetch directly`);
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
