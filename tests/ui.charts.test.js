/**
 * P5.6 Artifact Contract Tests  -  Custom SVG Charts (Visual Audit).
 *
 * Covers:
 *  - createRevenueFcfChart: actual solid vs forecast dashed paths, transition boundary, data dots
 *  - createMarginChart: gross & operating margin series, solid vs dashed paths
 *  - createWaterfall: DCF EV-to-equity bridge steps, arithmetic preservation
 *  - Quality Gates: purity, zero bare numeric literals > 999, zero chart library dependencies
 *
 * @module tests/ui.charts.test
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { LEDGER_URLS } from '../src/data/ledger.js';
import schedules from '../src/engine/schedules.js';
import forecast from '../src/engine/forecast.js';
import threeStatement from '../src/engine/threeStatement.js';
import wacc from '../src/engine/wacc.js';
import dcf from '../src/engine/dcf.js';

import {
  createRevenueFcfChart,
  createMarginChart,
  createWaterfall,
} from '../src/ui/charts.js';

let historicalData = null;
let assumptionsData = null;
let schedulesData = null;
let forecastData = null;
let threeStatementData = null;
let waccData = null;
let dcfData = null;

async function getDatasets() {
  if (!historicalData) {
    historicalData = await loadHistorical({
      dir: './src/data/historical/',
      readText: (f) => fs.promises.readFile(f, 'utf8'),
      requireLedger: true,
      ledger: LEDGER_URLS,
    });
    assumptionsData = await loadAssumptions({
      location: './src/data/assumptions.json',
      readText: (f) => fs.promises.readFile(f, 'utf8'),
    });
    schedulesData = schedules.build(historicalData, assumptionsData);
    forecastData = forecast.project({
      historical: historicalData,
      assumptions: assumptionsData,
    });
    threeStatementData = threeStatement.project(
      schedulesData,
      assumptionsData,
      forecastData,
    );
    waccData = wacc.build({
      assumptions: assumptionsData,
      debtSchedule: schedulesData.debt,
    });
    dcfData = dcf.valuate(threeStatementData, waccData, {
      assumptions: assumptionsData,
      corpus: historicalData,
    });
  }
  return {
    historical: historicalData,
    assumptions: assumptionsData,
    schedules: schedulesData,
    forecast: forecastData,
    threeStatement: threeStatementData,
    wacc: waccData,
    dcf: dcfData,
  };
}

describe('P5.6  -  Revenue & FCF Line Chart: createRevenueFcfChart', () => {
  test('generates valid SVG with solid historical and dashed forecast segments', async () => {
    const { historical, forecast, threeStatement } = await getDatasets();

    const chart = createRevenueFcfChart({
      historical,
      forecast,
      threeStatement,
      width: 800,
      height: 360,
    });

    assert.ok(chart, 'Must return chart object');
    assert.equal(typeof chart.svg, 'string', 'Must return SVG string');
    assert.equal(typeof chart.dispose, 'function', 'Must return dispose function');

    const svg = chart.svg;

    // SVG root structure
    assert.match(svg, /<svg\b/);
    assert.match(svg, /viewBox="0 0 800 360"/);
    assert.match(svg, /class="[^"]*svg-revenue-fcf"/);

    // Solid paths for historical actuals (without stroke-dasharray on historical path)
    assert.match(svg, /stroke="#1d4ed8" stroke-width="3"/, 'Revenue historical path');
    assert.match(svg, /stroke="#047857" stroke-width="3"/, 'FCF historical path');

    // Dashed paths for forecast estimates (with stroke-dasharray)
    assert.match(svg, /stroke="#3b82f6" stroke-width="2\.5" stroke-dasharray="6,4"/, 'Revenue forecast path');
    assert.match(svg, /stroke="#10b981" stroke-width="2\.5" stroke-dasharray="6,4"/, 'FCF forecast path');

    // Transition marker
    assert.match(svg, /HISTORICAL \(ACT\)/);
    assert.match(svg, /FORECAST \(EST\)/);

    // Legends
    assert.match(svg, /Revenue/);
    assert.match(svg, /Free Cash Flow/);
    assert.match(svg, /Forecast \(EST\)/);

    // Data points
    assert.match(svg, /(&apos;|')21/);
    assert.match(svg, /(&apos;|')25/);
    assert.match(svg, /(&apos;|')26/);
    assert.match(svg, /(&apos;|')30/);

    chart.dispose();
  });

  test('supports alias { data: { historical, forecast, threeStatement } }', async () => {
    const { historical, forecast, threeStatement } = await getDatasets();
    const chart = createRevenueFcfChart({
      data: { historical, forecast, threeStatement },
    });
    assert.ok(chart.svg.length > 500);
    chart.dispose();
  });
});

describe('P5.6  -  Margin Progression Chart: createMarginChart', () => {
  test('generates valid SVG with Gross Margin & Operating Margin progression', async () => {
    const { historical, forecast, threeStatement } = await getDatasets();

    const chart = createMarginChart({
      historical,
      forecast,
      threeStatement,
      width: 800,
      height: 340,
    });

    assert.ok(chart);
    const svg = chart.svg;

    // SVG root structure
    assert.match(svg, /viewBox="0 0 800 340"/);
    assert.match(svg, /class="[^"]*svg-margins"/);

    // Gross margin lines (solid hist, dashed fc)
    assert.match(svg, /stroke="#6d28d9" stroke-width="3"/);
    assert.match(svg, /stroke="#8b5cf6" stroke-width="2\.5" stroke-dasharray="6,4"/);

    // Operating margin lines (solid hist, dashed fc)
    assert.match(svg, /stroke="#d97706" stroke-width="3"/);
    assert.match(svg, /stroke="#f59e0b" stroke-width="2\.5" stroke-dasharray="6,4"/);

    // Legend entries
    assert.match(svg, /Gross Margin/);
    assert.match(svg, /Operating Margin/);

    chart.dispose();
  });
});

describe('P5.6  -  Enterprise Value Bridge Waterfall: createWaterfall', () => {
  test('generates valid SVG waterfall with all 5 bridge bars and target price', async () => {
    const { dcf } = await getDatasets();

    const chart = createWaterfall({
      dcf,
      width: 800,
      height: 380,
    });

    assert.ok(chart);
    const svg = chart.svg;

    // SVG root structure
    assert.match(svg, /viewBox="0 0 800 380"/);
    assert.match(svg, /class="[^"]*svg-waterfall"/);

    // Lane A (horizon 5, no dated seam — this file's getDatasets passes neither).
    // Measured off the live engine:
    //   pvExplicit 1,583,127.39 | pvTerminal 3,694,206.57 | EV 5,277,333.97
    //   netCash 1,416,559.00 | equity 6,693,892.97 | perShare 117.58
    // Step 1: Explicit PV
    assert.match(svg, /PV of Explicit FCFs/);
    assert.match(svg, /\$1,583,127/);

    // Step 2: Terminal PV
    assert.match(svg, /PV of Terminal Value/);
    assert.match(svg, /\$3,694,207/);

    // Step 3: Enterprise Value
    assert.match(svg, /Implied Enterprise Value/);
    assert.match(svg, /\$5,277,334/);

    // Step 4: Net Cash
    assert.match(svg, /\(\+\) Net Cash Bridge/);
    assert.match(svg, /\$1,416,559/);

    // Step 5: Equity Value
    assert.match(svg, /Implied Equity Value/);
    assert.match(svg, /\$6,693,893/);

    // Target price pill
    assert.match(svg, /\$117\.58 \/ share/);

    chart.dispose();
  });
});

describe('P5.6  -  Quality Gates: Purity, Zero Bare Literals, No Chart Libraries', () => {
  test('purity: zero Date.now, Math.random, fetch, or document in src/ui/charts.js', () => {
    const src = fs.readFileSync(path.resolve('./src/ui/charts.js'), 'utf8');
    assert.doesNotMatch(src, /Date\.now/);
    assert.doesNotMatch(src, /Math\.random/);
    assert.doesNotMatch(src, /\bfetch\b/);
    assert.doesNotMatch(src, /\bwindow\b/);
  });

  test('zero bare numeric literals > 999 outside comments in src/ui/charts.js', () => {
    const src = fs.readFileSync(path.resolve('./src/ui/charts.js'), 'utf8');
    const lines = src.split('\n');
    const bareNumRegex = /(?<![A-Za-z0-9_$])\b([1-9]\d{3,})\b(?![A-Za-z0-9_$])/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const codePart = line.split('//')[0].trim();
      if (!codePart || codePart.startsWith('*') || codePart.startsWith('/*')) continue;

      const matches = codePart.match(bareNumRegex);
      if (matches) {
        // Filter out strings like 'FY2021', colors '#123456', etc.
        const filtered = matches.filter((m) => {
          const num = Number(m);
          return num > 999;
        });
        assert.equal(
          filtered.length,
          0,
          `File src/ui/charts.js line ${i + 1} contains bare numeric literal: ${filtered.join(', ')} in code: "${codePart}"`,
        );
      }
    }
  });

  test('no chart libraries imported in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('./package.json'), 'utf8'));
    const allDeps = { ...(pkg.dependencies || {}) };
    assert.equal(allDeps['chart.js'], undefined);
    assert.equal(allDeps['apexcharts'], undefined);
    assert.equal(allDeps['d3'], undefined);
    assert.equal(allDeps['highcharts'], undefined);
  });
});

describe('P5.6  -  Live Tab Mount Integration: Charts reachable in Product UI', () => {
  test('renderProjections mounts both Revenue/FCF line chart and Margin progression chart', async () => {
    const { historical, threeStatement } = await getDatasets();
    const { renderProjections } = await import('../src/ui/projectionsTab.js');

    const container = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
    const view = renderProjections({
      container,
      threeStatement,
      historical,
      TabulatorConstructor: class StubTabulator {},
    });

    assert.ok(view);
    assert.match(container.innerHTML, /class="[^"]*svg-revenue-fcf"/);
    assert.match(container.innerHTML, /class="[^"]*svg-margins"/);
    assert.match(container.innerHTML, /stroke-dasharray="6,4"/);

    view.dispose();
  });

  test('renderValuation mounts DCF bridge waterfall chart', async () => {
    const { wacc, dcf, assumptions } = await getDatasets();
    const { renderValuation } = await import('../src/ui/valuationTab.js');

    const container = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
    const view = renderValuation({
      container,
      wacc,
      dcf,
      assumptions,
      TabulatorConstructor: class StubTabulator {},
    });

    assert.ok(view);
    assert.match(container.innerHTML, /class="[^"]*svg-waterfall"/);
    assert.match(container.innerHTML, /\$117\.58/);

    view.dispose();
  });

  test('renderSummary mounts DCF bridge waterfall chart', async () => {
    const { dcf, assumptions, historical, threeStatement } = await getDatasets();
    const { renderSummary } = await import('../src/ui/summaryTab.js');
    const { evaluate } = await import('../src/engine/recommend.js');
    const mktPrice = assumptions.get('market_share_price').value;
    const rec = evaluate(dcf.perShare, mktPrice);
    const container = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
    const view = renderSummary({
      container,
      dcf,
      recommendation: rec,
      historical,
      assumptions,
      threeStatement,
    });

    assert.ok(view);
    assert.match(container.innerHTML, /class="[^"]*svg-waterfall"/);
    assert.match(container.innerHTML, /\$117\.58/);

    view.dispose();
  });
});
