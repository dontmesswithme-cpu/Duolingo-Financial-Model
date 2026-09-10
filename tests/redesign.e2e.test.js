/* RP9.1 end-to-end integration: cross-tab sync, driver/scenario propagation, DOM integrity. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { TAB_KEYS } from '../src/ui/tabs.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { readLedgerUrls } from './_ledger.js';
import { createTabRoot } from './_dom_stub.js';
import { settleHeap } from './_gc.js';
import { usd } from '../src/ui/format.js';
import { runGateScan } from '../tools/verify_redesign_gates.mjs';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));

const gcAvailable = typeof globalThis.gc === 'function';

async function getDatasets() {
  const fs = await import('node:fs');
  const read = (location) => fs.promises.readFile(location, 'utf8');
  const historical = await loadHistorical({ dir: DATA_DIR, readText: read, requireLedger: true, ledger: readLedgerUrls() });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText: read });
  return { historical, assumptions };
}

async function bootFullApp() {
  const { historical, assumptions } = await getDatasets();
  const { root, links, panes } = createTabRoot(TAB_KEYS);
  const app = createApp({
    data: { loadHistorical, loadAssumptions },
    engine: {},
    historical,
    assumptions,
    root,
    now: () => Date.parse('2026-09-01T00:00:00.000Z'),
  });
  const paneOf = (key) => panes.find((p) => p.getAttribute('data-tab') === key);
  const linkOf = (key) => links.find((l) => l.getAttribute('data-tab') === key);
  // The app owns the single tab router; activation is asserted via DOM state.
  const activeKey = () => {
    const active = links.find((l) => l.getAttribute('aria-selected') === 'true');
    return active ? active.getAttribute('data-tab') : null;
  };
  return {
    app, root, links, panes, paneOf, linkOf, activeKey,
    visit: (key) => linkOf(key).dispatch('click'),
  };
}

describe('RP9.1 — Boot: all 8 tabs mount with live content', () => {
  test('every pane renders non-empty engine markup at boot', async () => {
    const { app, panes } = await bootFullApp();
    for (const key of TAB_KEYS) {
      const pane = panes.find((p) => p.getAttribute('data-tab') === key);
      assert.ok(pane.innerHTML.length > 500, `Pane ${key} must render live content at boot`);
    }
    app.dispose();
  });

  test('router visits every tab with hidden-pane exclusivity', async () => {
    const { app, panes, activeKey, visit } = await bootFullApp();
    assert.equal(activeKey(), 'cover');
    for (const key of TAB_KEYS) {
      visit(key);
      assert.equal(activeKey(), key);
      for (const pane of panes) {
        const isActive = pane.getAttribute('data-tab') === key;
        assert.equal(pane.hasAttribute('hidden'), !isActive, `Pane visibility exclusive on ${key}`);
      }
    }
    app.dispose();
  });
});

describe('RP9.1 — Cross-tab synchronization on driver changes', () => {
  test('one driver edit propagates the same DCF pin to cover/valuation/summary/sensitivity', async () => {
    const { app, paneOf, visit } = await bootFullApp();
    const pinFor = () => usd(app.state().dcf.perShare, { decimals: 2 });
    for (const key of ['cover', 'valuation', 'summary', 'sensitivity']) {
      assert.ok(paneOf(key).innerHTML.includes(pinFor()), `${key} carries the boot DCF pin ${pinFor()}`);
    }
    app.setDriver('terminal_growth_rate', 0.0275);
    const moved = pinFor();
    assert.notEqual(moved, '$118.60', 'Driver edit must move the DCF pin');
    // Hidden panes refresh on activation; visit each tab, then assert sync.
    for (const key of ['cover', 'valuation', 'summary', 'sensitivity']) {
      visit(key);
      assert.ok(paneOf(key).innerHTML.includes(moved), `${key} carries the moved DCF pin ${moved}`);
    }
    app.setDriver('terminal_growth_rate', 0.025);
    visit('sensitivity');
    assert.ok(paneOf('sensitivity').innerHTML.includes('$118.60'), 'Pin restores on revert');
    app.dispose();
  });

  test('scenario switch propagates to sensitivity center, bands, and assumptions pill', async () => {
    const { app, paneOf, visit } = await bootFullApp();
    app.setScenario('bear');
    visit('sensitivity');
    const sensHtml = paneOf('sensitivity').innerHTML;
    assert.match(sensHtml, /<option value="bear" selected>Downside Case<\/option>/);
    assert.ok(sensHtml.includes('$72.38'), 'Sensitivity re-centers on the Bear pin');
    visit('assumptions');
    assert.match(paneOf('assumptions').innerHTML, /data-scenario="bear"[^>]*active|active[^>]*data-scenario="bear"/, 'Bear pill activates');
    app.setScenario('base');
    visit('sensitivity');
    assert.ok(paneOf('sensitivity').innerHTML.includes('$118.60'), 'Base restores');
    app.dispose();
  });
});

describe('RP9.1 — Rendered DOM integrity across all tabs', () => {
  test('zero style=, zero NaN/undefined, zero Bear/Bull Case strings across all panes', async () => {
    const { app, panes, visit } = await bootFullApp();
    for (const key of TAB_KEYS) visit(key);
    app.setScenario('bull');
    for (const key of TAB_KEYS) visit(key);
    const dom = panes.map((p) => p.innerHTML).join('\n');
    assert.doesNotMatch(dom, /style\s*=/i, 'Zero inline style= across all tabs');
    assert.doesNotMatch(dom, /NaN/, 'Zero NaN across all tabs');
    assert.doesNotMatch(dom, /undefined/, 'Zero undefined across all tabs');
    assert.doesNotMatch(dom, /Bear Case/, 'Zero Bear Case strings');
    assert.doesNotMatch(dom, /Bull Case/, 'Zero Bull Case strings');
    app.setScenario('base');
    app.dispose();
  });

  test('standing gate scanner reports zero violations on the shipped tree', async () => {
    const result = runGateScan();
    assert.equal(result.violations.length, 0, `Gate scanner must be clean: ${JSON.stringify(result.violations.slice(0, 3))}`);
    assert.equal(result.passed, true);
  });
});

describe('RP9.1 — Tab-switch responsiveness without memory accumulation', () => {
  test('round-robin tab switching is median < 16ms', async () => {
    const { app, visit } = await bootFullApp();
    for (let k = 0; k < 3; k++) visit(TAB_KEYS[k % TAB_KEYS.length]);
    const times = [];
    for (let i = 0; i < 24; i++) {
      const key = TAB_KEYS[i % TAB_KEYS.length];
      const start = performance.now();
      visit(key);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    assert.ok(median < 16.0, `Tab-switch median must be < 16ms (measured: ${median.toFixed(3)}ms)`);
    app.dispose();
  });

  (gcAvailable ? test : test.skip)('tab-switch churn retains bounded heap', async () => {
    const { app, visit } = await bootFullApp();
    for (let k = 0; k < 5; k++) visit(TAB_KEYS[k % TAB_KEYS.length]);
    const before = await settleHeap();
    for (let i = 0; i < 30; i++) visit(TAB_KEYS[i % TAB_KEYS.length]);
    const after = await settleHeap();
    const retained = after - before;
    assert.ok(retained < 5 * 1024 * 1024, `Tab-switch retained churn exceeds budget: ${(retained / 1024).toFixed(1)} KB`);
    app.dispose();
  });

  test('dispose clears all panes and detaches tab listeners', async () => {
    const { app, links, panes } = await bootFullApp();
    app.dispose();
    for (const pane of panes) {
      assert.equal(pane.innerHTML, '', 'Every pane must clear on dispose');
    }
    for (const link of links) {
      assert.equal(link.listenerCount('click'), 0, 'Tab link listeners must detach on dispose');
    }
  });
});
