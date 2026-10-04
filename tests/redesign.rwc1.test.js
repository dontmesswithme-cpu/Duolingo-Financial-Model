/**
 * RWC.1 Consistency Rework — Cross-Tab Figure, Narrative & Control Conformity.
 *
 * Contract: docs/phases/redesign_phase_rwc.md §§2–5.
 * - RWC.1a: Rule-of-40 reads threeStatement FCF basis (47.4% = 31.4% + 16.1%), null-path dashes, CAGR base named.
 * - RWC.1b: Scenario descs derive margins from scenario engines, zero hardcoded xx.x% literals.
 * - RWC.1c: Units capsule conformance (covered in redesign.tab5.test.js; smoke here).
 * - RWC.1d: Beta block relabelled transparency-only with verbatim footnote, 1.47 anchors.
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
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import { runFullValuation } from '../src/engine/recommend.js';
import { renderSummary } from '../src/ui/summaryTab.js';
import { renderSensitivity } from '../src/ui/sensitivityTab.js';
import { renderValuation } from '../src/ui/valuationTab.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');

async function getModel() {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: readLedgerUrls() });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  const schedules = schedulesEngine.build(historical, assumptions);
  const forecast = forecastEngine.project({ historical, assumptions });
  const threeStatement = threeStatementEngine.project(schedules, assumptions, forecast);
  const wacc = buildWacc({ assumptions, debtSchedule: schedules.debt });
  const dcf = valuateDcf(threeStatement, wacc, { assumptions, corpus: historical });
  return { historical, assumptions, threeStatement, wacc, dcf };
}

function stubContainer() {
  return {
    innerHTML: '',
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
  };
}

describe('RWC.1a — Single Rule-of-40 definition (Tab 07)', () => {
  test('live card reads 47.4% = 31.4% + 16.1% from threeStatement FCF basis', async () => {
    const { historical, assumptions, threeStatement, wacc, dcf } = await getModel();
    const rec = { marketPrice: 157.85, label: 'fair', upsidePct: -8.72 };
    const container = stubContainer();
    const view = renderSummary({ container, dcf, recommendation: rec, historical, assumptions, threeStatement, TabulatorConstructor: null });
    const html = container.innerHTML;
    // Rendered-card read (never re-derivation): card value + sub-label components
    assert.match(html, /47\.4%/, 'Card must render 47.4% Rule of 40');
    assert.match(html, /31\.4%/, 'Card must render 31.4% FCF margin (statement basis)');
    assert.match(html, /16\.1%/, 'Card must render 16.1% CAGR (FY25 base)');
    assert.match(html, /FY2025–FY2030E/, 'Citation must name the CAGR base explicitly');
    // Engine cross-check: statement basis matches
    const rev30 = threeStatement.incomeStatement.byPeriod.FY2030.revenue.total.value;
    const fcfStmt = threeStatement.cashFlow.byPeriod.FY2030.free_cash_flow.value;
    assert.ok(Math.abs(fcfStmt / rev30 - 0.3135) < 0.005, 'Statement FCF margin ~31.35%');
    view.dispose();
  });

  test('null-path renders dashes everywhere, zero hardcoded financial figures', async () => {
    const { historical, assumptions, dcf } = await getModel();
    const rec = { marketPrice: 157.85, label: 'fair', upsidePct: 0 };
    const container = stubContainer();
    // Null threeStatement forces fail-closed path
    const view = renderSummary({ container, dcf, recommendation: rec, historical, assumptions, threeStatement: null, TabulatorConstructor: null });
    const html = container.innerHTML;
    assert.ok(!html.includes('33.9%') && !html.includes('16.5%') && !html.includes('50.4%'), 'Null path must not render vintage literals');
    assert.match(html, / - /, 'Null path must render dashes');
    view.dispose();
    // Source gate: no vintage literals in summaryTab.js
    const src = await readText(fileURLToPath(new URL('../src/ui/summaryTab.js', import.meta.url)));
    assert.ok(!src.includes('33.9%') && !src.includes('16.5%') && !src.includes('50.4%'), 'summaryTab.js must carry zero vintage fallback literals');
  });
});

describe('RWC.1b — Derived scenario narratives (Tab 08)', () => {
  test('base + upside descs match per-scenario engine recomputation, zero hardcodes', async () => {
    const historical = await loadHistorical({ dir: DATA_DIR, readText });
    const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
    const scenarios = {
      bear: runFullValuation(historical, assumptions, 'bear'),
      base: runFullValuation(historical, assumptions, 'base'),
      bull: runFullValuation(historical, assumptions, 'bull'),
    };
    const baseFcf = scenarios.base.threeStatement.cashFlow.byPeriod.FY2030.free_cash_flow.value;
    const baseRev = scenarios.base.threeStatement.incomeStatement.byPeriod.FY2030.revenue.total.value;
    const bullFcf = scenarios.bull.threeStatement.cashFlow.byPeriod.FY2030.free_cash_flow.value;
    const bullRev = scenarios.bull.threeStatement.incomeStatement.byPeriod.FY2030.revenue.total.value;
    const baseMargin = `${(baseFcf / baseRev * 100).toFixed(1)}%`;
    const bullMargin = `${(bullFcf / bullRev * 100).toFixed(1)}%`;
    assert.equal(baseMargin, '31.4%', 'Base engine margin must read 31.4% live');

    const container = stubContainer();
    const grid = { base: { wacc: 0.11, growth: 0.025 }, waccValues: [0.11], growthValues: [0.025], matrix: { 0.11: { 0.025: { perShare: 144.08 } } } };
    const view = renderSensitivity({ container, sensitivityGrid: grid, scenarios, dcf: scenarios.base.dcf, TabulatorConstructor: null });
    const html = container.innerHTML;
    assert.ok(html.includes(baseMargin), `Base desc must render engine margin ${baseMargin}`);
    assert.ok(html.includes(bullMargin), `Upside desc must render engine margin ${bullMargin}`);
    assert.ok(!html.includes('33.9%') && !html.includes('38.0%'), 'Scenario descs must carry zero hardcoded margin literals');
    assert.ok(!html.includes('—'), 'Scenario descs must carry zero em dashes (house style)');
    // P6R3 scenario pins undisturbed (EP.3 normalised terminal)
    assert.ok(Math.abs(scenarios.base.perShare - 117.57506995016278) < 0.01, 'Base pin ~117.58 (Lane A: no horizon, no dated seam)');
    assert.ok(Math.abs(scenarios.bear.perShare - 71.9188395) < 0.01, 'Bear pin ~71.92 (Lane A)');
    assert.ok(Math.abs(scenarios.bull.perShare - 215.4862672511) < 0.01, 'Bull pin ~215.49 (Lane A)');
    view.dispose();
    const src = await readText(fileURLToPath(new URL('../src/ui/sensitivityTab.js', import.meta.url)));
    assert.ok(!src.includes('33.9%') && !src.includes('38.0%'), 'sensitivityTab.js must carry zero hardcoded desc margins');
  });
});

describe('RWC.1c — Canonical units capsule smoke (Tab 05)', () => {
  test('projections markup carries pill-control + pill-btn alongside data-projection-unit contract', async () => {
    const { historical, threeStatement } = await (async () => {
      const h = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: readLedgerUrls() });
      const a = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
      const s = schedulesEngine.build(h, a);
      const f = forecastEngine.project({ historical: h, assumptions: a });
      return { historical: h, threeStatement: threeStatementEngine.project(s, a, f) };
    })();
    const { renderProjections } = await import('../src/ui/projectionsTab.js');
    const container = stubContainer();
    const view = renderProjections({ container, historical, threeStatement, TabulatorConstructor: null });
    assert.match(container.innerHTML, /pill-control/, 'Units toggle must carry pill-control');
    assert.match(container.innerHTML, /pill-btn/, 'Units buttons must carry pill-btn');
    assert.match(container.innerHTML, /data-projection-unit="thousands"/, 'Thousands contract preserved');
    view.dispose();
  });
});

describe('RWC.1d — Beta cross-check relabel + reframe (Tab 06)', () => {
  // The footnote states the PEER MEAN (the live beta basis), not the retired median.
  // The mock below supplies 1.47 so this also proves the copy is DERIVED from the
  // peer corpus rather than from the wacc mock: the rendered figure must be 1.49.
  test('peer-MEAN beta anchors, 0.89 cross-check reads transparency-only with CI + verbatim footnote', async () => {
    const container = stubContainer();
    const mockWacc = {
      beta: { value: 1.47, asOf: '2026-08-31', source: { provider: 'stockanalysis.com / SEC EDGAR', url: 'https://stockanalysis.com/stocks/spot/statistics/' } },
      riskFreeRate: { value: 0.0479, asOf: '2026-09-01', source: { provider: 'FRED' } },
      erp: { value: 0.0425, asOf: '2026-09-01', source: { provider: 'Damodaran' } },
      costOfEquity: { value: 0.111225 },
      wacc: { value: 0.111225 },
      sharesOutstanding: { value: 50.031, asOf: '2026-06-30' },
    };
    const mockDcf = { schedule: [], perShare: 144.08, perShareValue: 144.08, enterpriseValue: 5792014.07 };
    const view = renderValuation({ container, wacc: mockWacc, dcf: mockDcf, TabulatorConstructor: null });
    const html = container.innerHTML;
    assert.ok(html.includes('Single-Stock Regression Cross-Check'), 'Block must carry new title');
    assert.ok(!html.includes('Vasicek'), 'Must not claim shrinkage');
    assert.ok(html.includes('too imprecise') || html.includes('transparency only'), 'Must reframe as too-imprecise transparency-only');
    // RWC.1 resubmission: footnote CI must equal recomputation from the same reg object (never a string pin).
    const { regress } = await import('../src/engine/beta.js');
    const prices = JSON.parse(await readText(fileURLToPath(new URL('../src/data/historical/prices.json', import.meta.url))));
    const reg = regress(prices);
    const tCrit = 2.002; // Student-t 0.975, df = n-2 = 58 — mirrors valuationTab.js source
    const expLo = (reg.beta - tCrit * reg.stderr).toFixed(2);
    const expHi = (reg.beta + tCrit * reg.stderr).toFixed(2);
    assert.ok(html.includes(`${expLo} to ${expHi}`), `Footnote CI must equal reg recomputation (${expLo} to ${expHi})`);
    assert.ok(html.includes('Valuation uses the 1.49 bottom-up peer mean (Spotify / Roblox / Netflix, Hamada-unlevered).'), 'Footnote must name the PEER MEAN (1.49) from the live corpus, not the mock wacc beta');
    assert.ok(html.includes('1.49'), 'Peer mean 1.49 must anchor the derivation block');
    view.dispose();
  });
});
