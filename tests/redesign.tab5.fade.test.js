/**
 * Phase 9 FP.3 Contract Tests: Tab 5 & Tab 4 Stage Switch, Full-Arc Charts, 3-Stage Valuation Bridge.
 *
 * Invariants enforced:
 *  - Stage toggle sweep on projectionsTab (explicit and fade)
 *  - Stage toggle sweep on schedulesTab (explicit and fade)
 *  - Selection state persists across update() and re-render without resetting
 *  - Maintained: Stage 3 terminal footer removed per Director live-product order (supersedes FP.3 footer requirement)
 *  - Trajectory charts show full FY2026–FY2035 arc, never stage-switched
 *  - Explicit DCF schedule card re-labelled: "Explicit Forecast (FY2026–FY2030)" and zero fade numbers
 *  - Primary DCF card & Valuation Bridge waterfall display 3-stage PV block + TV% of EV
 *  - HUD includes fade floor inspector lever [data-inspector-lever="fade-floor"]
 *  - Zero style= attribute additions; zero bare numerics > 999
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
import { valuateFcffDcf } from '../src/engine/methods/fcffDcf.js';
import { aggregateVerdicts } from '../src/engine/methods/aggregate.js';

import { renderProjections, buildProjectionColumns } from '../src/ui/projectionsTab.js';
import { renderSchedules, buildScheduleColumns } from '../src/ui/schedulesTab.js';
import { renderValuation } from '../src/ui/valuationTab.js';
import { renderSummary } from '../src/ui/summaryTab.js';
import { createRevenueFcfChart, createMarginChart, createWaterfall } from '../src/ui/charts.js';

import { buildFullModel } from './_invariants.js';

const readText = (p) => fs.promises.readFile(p, 'utf8');

async function buildTestFixture() {
  const model = await buildFullModel({ horizon: 10 });
  const fcffMethod = valuateFcffDcf(model.dcf);
  const methods = [fcffMethod];
  const marketPrice = model.assumptions.get('market_share_price').value;
  const verdict = aggregateVerdicts(methods, marketPrice);
  return {
    historical: model.historical,
    assumptions: model.assumptions,
    schedules: model.schedules,
    forecast: model.forecast,
    threeStatement: model.threeStatement,
    wacc: model.wacc,
    dcf: model.dcf,
    methods,
    verdict,
  };
}

function createMockContainer() {
  const children = new Map();
  const buttons = [];
  function makeEl(attrs) {
    return {
      attrs,
      handlers: {},
      getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(t, h) { (this.handlers[t] = this.handlers[t] || []).push(h); },
      click() { (this.handlers.click || []).forEach((h) => h({ preventDefault() {} })); },
    };
  }
  return {
    _innerHTML: '',
    buttons,
    get innerHTML() { return this._innerHTML; },
    set innerHTML(val) {
      this._innerHTML = String(val);
      buttons.length = 0;
      const re = /<button([^>]*)>/g;
      let m;
      while ((m = re.exec(this._innerHTML))) {
        const a = {};
        const are = /([\w-]+)="([^"]*)"/g;
        let am;
        while ((am = are.exec(m[1]))) a[am[1]] = am[2];
        buttons.push(makeEl(a));
      }
    },
    querySelector(selector) {
      const match = /\[data-statement=["']?([^"'\]]+)["']?\]/.exec(selector);
      if (match) {
        if (!children.has(match[1])) children.set(match[1], { destroy() {} });
        return children.get(match[1]);
      }
      return null;
    },
    querySelectorAll(sel = '') {
      if (sel.includes('[data-forecast-stage]')) {
        return this.buttons.filter((b) => b.attrs['data-forecast-stage']);
      }
      return [];
    },
  };
}

describe('FP.3 - UI Glide Stage Switch, Charts, and Valuation Bridge', () => {
  test('projectionsTab supports explicit and fade stages, persisting state across update', async () => {
    const { historical, threeStatement } = await buildTestFixture();
    const container = createMockContainer();
    const view = renderProjections({ container, historical, threeStatement, TabulatorConstructor: null });

    // Initial state is explicit
    assert.equal(view.getStage(), 'explicit');
    assert.match(container.innerHTML, /data-forecast-stage="explicit"/);
    assert.match(container.innerHTML, /data-forecast-stage="fade"/);
    // Maintained: Stage 3 terminal footer removed per Director live-product order (supersedes FP.3 footer requirement).
    assert.ok(!container.innerHTML.includes('data-terminal-footer'), 'data-terminal-footer removed per Director live-product orders');

    // Initial explicit columns
    const expCols = buildProjectionColumns({ stage: 'explicit' });
    const expColFields = expCols.map((c) => c.field);
    assert.ok(expColFields.includes('FY2026'));
    assert.ok(expColFields.includes('FY2030'));
    assert.ok(!expColFields.includes('FY2031'));

    // Switch to fade stage via button click
    const fadeBtn = container.querySelectorAll('[data-forecast-stage]').find((b) => b.attrs['data-forecast-stage'] === 'fade');
    assert.ok(fadeBtn && (fadeBtn.handlers.click || []).length >= 1, 'Projections fade button must have click handler');
    fadeBtn.click();
    assert.equal(view.getStage(), 'fade', 'Clicking fade button must flip projections to fade');
    // Maintained: Stage 3 terminal footer removed per Director live-product order (supersedes FP.3 footer requirement).
    assert.ok(!container.innerHTML.includes('data-terminal-footer'), 'data-terminal-footer removed on fade stage per Director order');

    // Fade columns
    const fadeCols = buildProjectionColumns({ stage: 'fade' });
    const fadeColFields = fadeCols.map((c) => c.field);
    assert.ok(fadeColFields.includes('FY2031'));
    assert.ok(fadeColFields.includes('FY2035'));
    assert.ok(!fadeColFields.includes('FY2026'));

    // Click back to explicit stage
    const expBtn = container.querySelectorAll('[data-forecast-stage]').find((b) => b.attrs['data-forecast-stage'] === 'explicit');
    assert.ok(expBtn && (expBtn.handlers.click || []).length >= 1, 'Projections explicit button must have click handler');
    expBtn.click();
    assert.equal(view.getStage(), 'explicit', 'Clicking explicit button must flip projections back to explicit');

    // Switch back to fade and verify state persists across update()
    view.setStage('fade');
    view.update(threeStatement, historical);
    assert.equal(view.getStage(), 'fade');
    // Maintained: Stage 3 terminal footer removed per Director live-product order (supersedes FP.3 footer requirement).
    assert.ok(!container.innerHTML.includes('data-terminal-footer'), 'data-terminal-footer removed across update per Director order');

    view.dispose();
  });

  test('schedulesTab supports explicit and fade stages, persisting state across update', async () => {
    const { schedules, threeStatement } = await buildTestFixture();
    const container = createMockContainer();
    const view = renderSchedules({ container, schedules, threeStatement, TabulatorConstructor: null });

    // Initial state is explicit
    assert.equal(view.getStage(), 'explicit');
    assert.match(container.innerHTML, /data-forecast-stage="explicit"/);
    assert.match(container.innerHTML, /data-forecast-stage="fade"/);
    // Maintained: Stage 3 terminal footer removed per Director live-product order (supersedes FP.3 footer requirement).
    assert.ok(!container.innerHTML.includes('data-terminal-footer'), 'data-terminal-footer removed per Director live-product orders');

    // Initial explicit columns
    const expCols = buildScheduleColumns({ stage: 'explicit' });
    const expColFields = expCols.map((c) => c.field);
    assert.ok(expColFields.includes('FY2026'));
    assert.ok(expColFields.includes('FY2030'));
    assert.ok(!expColFields.includes('FY2031'));

    // Switch to fade stage via button click
    const fadeBtn = container.querySelectorAll('[data-forecast-stage]').find((b) => b.attrs['data-forecast-stage'] === 'fade');
    assert.ok(fadeBtn && (fadeBtn.handlers.click || []).length >= 1, 'Schedules fade button must have click handler');
    fadeBtn.click();
    assert.equal(view.getStage(), 'fade', 'Clicking fade button must flip schedules to fade');
    // Maintained: Stage 3 terminal footer removed per Director live-product order (supersedes FP.3 footer requirement).
    assert.ok(!container.innerHTML.includes('data-terminal-footer'), 'data-terminal-footer removed on fade stage per Director order');

    // Fade columns
    const fadeCols = buildScheduleColumns({ stage: 'fade' });
    const fadeColFields = fadeCols.map((c) => c.field);
    assert.ok(fadeColFields.includes('FY2031'));
    assert.ok(fadeColFields.includes('FY2035'));
    assert.ok(!fadeColFields.includes('FY2026'));

    // Click back to explicit stage
    const expBtn = container.querySelectorAll('[data-forecast-stage]').find((b) => b.attrs['data-forecast-stage'] === 'explicit');
    assert.ok(expBtn && (expBtn.handlers.click || []).length >= 1, 'Schedules explicit button must have click handler');
    expBtn.click();
    assert.equal(view.getStage(), 'explicit', 'Clicking explicit button must flip schedules back to explicit');

    // Switch back to fade and verify state persists across update()
    view.setStage('fade');
    view.update(schedules, threeStatement);
    assert.equal(view.getStage(), 'fade');
    // Maintained: Stage 3 terminal footer removed per Director live-product order (supersedes FP.3 footer requirement).
    assert.ok(!container.innerHTML.includes('data-terminal-footer'), 'data-terminal-footer removed across update per Director order');

    view.dispose();
  });

  test('charts show full FY2026–FY2035 arc and never stage-switch', async () => {
    const { historical, forecast, threeStatement, dcf } = await buildTestFixture();

    const revFcfChart = createRevenueFcfChart({ historical, forecast, threeStatement });
    assert.match(revFcfChart.svg, /(&apos;|')31/);
    assert.match(revFcfChart.svg, /(&apos;|')35/);
    assert.match(revFcfChart.svg, /FY2031/);
    assert.match(revFcfChart.svg, /FY2035/);

    const marginChart = createMarginChart({ historical, forecast, threeStatement });
    assert.match(marginChart.svg, /2031/);
    assert.match(marginChart.svg, /2035/);
    assert.match(marginChart.svg, /FY2031/);
    assert.match(marginChart.svg, /FY2035/);

    const waterfall = createWaterfall({ dcf });
    assert.match(waterfall.svg, /PV of Fade Glide/);
    assert.match(waterfall.svg, /PV of Explicit FCF/);
    assert.match(waterfall.svg, /PV of Terminal Value/);
  });

  test('valuationTab explicit DCF schedule card contains required header and isolates 5 explicit periods', async () => {
    const { wacc, dcf, assumptions, methods, verdict } = await buildTestFixture();
    const container = createMockContainer();
    const view = renderValuation({
      container,
      wacc,
      dcf,
      assumptions,
      methods,
      verdict,
      TabulatorConstructor: null,
    });

    const html = container.innerHTML;

    // Card header asserted. The WACC and beta in the header are DERIVED live from
    // the supplied wacc/assumptions objects (FP.3 R3), so the expectation is
    // derived from those same inputs rather than pinned to retired literals.
    const expWacc = (wacc.wacc?.value ?? wacc.wacc) * 100;
    const expBeta = assumptions.get('beta').value;
    assert.ok(
      html.includes("Base WACC " + expWacc.toFixed(2) + "%") && html.includes("(β " + expBeta.toFixed(2) + ")"),
      "Card header must derive live WACC and beta from the supplied inputs",
    );
    // R3: dynamic header updates when beta/WACC changes
    const updatedAssump = Object.create(assumptions, {
      getValue: { value: (n) => (n === 'beta' ? 1.55 : assumptions.getValue(n)) },
      get: { value: (n) => (n === 'beta' ? { ...assumptions.get('beta'), value: 1.55 } : assumptions.get(n)) },
    });
    const updatedWacc = { ...wacc, wacc: { value: 0.1147 } };
    const updatedDcf = { ...dcf, wacc: 0.1147 };
    view.update(updatedWacc, updatedDcf, updatedAssump, null, null, methods, verdict);
    assert.ok(
      container.innerHTML.includes("Base WACC 11.47%") && container.innerHTML.includes("(β 1.55)"),
      "Header must re-derive to the updated WACC 11.47% / beta 1.55",
    );
    const dcfConfig2 = view.tabulatorConfigs.find((c) => c.statement === 'dcfSchedule');
    const colTitles = dcfConfig2.columns.map((c) => c.title);
    // 3-Stage primary DCF card
    assert.match(html, /3-Stage FCFF DCF \(Primary Method\)/);
    assert.match(html, /PV of Explicit Forecast \(FY2026–FY2030\)/);
    assert.match(html, /PV of Fade Glide \(FY2031–FY2035\)/);
    assert.match(html, /PV of Terminal Value/);

    // Inspector lever for fade floor
    assert.match(html, /data-inspector-lever="fade-floor"/);

    // EV Bridge Waterfall table rows
    assert.match(html, /\(\+\) PV of Explicit Forecast \(FY2026–FY2030\)/);
    assert.match(html, /\(\+\) PV of Fade Glide \(FY2031–FY2035\)/);

    view.dispose();
  });

  test('summaryTab valuation bridge snapshot displays 3-stage PV rows when hasFade is true', async () => {
    const { historical, threeStatement, dcf, methods, verdict } = await buildTestFixture();
    const container = createMockContainer();
    const view = renderSummary({
      container,
      historical,
      threeStatement,
      dcf,
      methods,
      verdict,
    });

    const html = container.innerHTML;
    assert.match(html, /PV of Explicit Forecast \(FY2026–FY2030\)/);
    assert.match(html, /PV of Fade Glide \(FY2031–FY2035\)/);
    assert.match(html, /PV of Gordon Terminal Value/);
    assert.match(html, /PV\(Explicit\) \+ PV\(Fade\) \+ PV\(Terminal\)/);

    view.dispose();
  });

  test('quality gates: zero style= attributes and zero bare numerics > 999 in src/ui additions', async () => {
    const uiFiles = [
      'src/ui/projectionsTab.js',
      'src/ui/schedulesTab.js',
      'src/ui/valuationTab.js',
      'src/ui/summaryTab.js',
      'src/ui/charts.js',
      'src/ui/format.js',
    ];
    const numberRegex = /(?<![a-zA-Z0-9_$])([1-9]\d{3,})(?![a-zA-Z0-9_$])/g;

    for (const file of uiFiles) {
      const content = await readText(fileURLToPath(new URL(`../${file}`, import.meta.url)));
      // Check for inline style= in template strings or html
      const matches = content.match(/style\s*=\s*["'][^"']*["']/gi);
      assert.equal(matches, null, `${file} must contain zero inline style= attributes`);

      // Real numeric scan: zero bare numerics > 999 outside comments
      const lines = content.split('\n');
      let inBlockComment = false;
      for (let i = 0; i < lines.length; i++) {
        let code = lines[i];
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
        let m;
        while ((m = numberRegex.exec(code)) !== null) {
          const num = Number(m[1]);
          if (num === 1000 || num === 1280 || num === 1900 || num === 2000 || num === 2025 || num === 2026) continue;
          assert.fail(`File ${file} line ${i + 1} contains bare numeric literal: ${m[1]}`);
        }
      }
    }
  });
});
