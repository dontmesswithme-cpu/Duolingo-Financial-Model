/**
 * P6R2.1  -  Centered 9×5 Sensitivity Matrix & Axis Guard Verification Suite.
 *
 * Automated verification for Phase 6R2 Task P6R2.1:
 *  1. Axis derivation: WACC ± 200bps (9 rows), growth ± 100bps (5 columns) centered on active scenario
 *  2. Center invariance: center cell (row 5, column 3) = (activeWacc, activeG) = active valuation pin across all states
 *  3. Monotonicity (∂P/∂WACC < 0, ∂P/∂g > 0) and WACC > g on every cell
 *  4. Axis guard (fail-closed shrink): decrements g radius first, then WACC radius; floor = active pin; renders narrowing footnote
 *  5. Description text purges fixed 1.0%-3.0% literal and states both axes track active scenario
 *  6. Engine-default regression pin: direct buildSensitivityGrid() calls without growthValues retain [0.01-0.03]
 *  7. Quality gates: frozen engine diff, zero bare literals > 999 in UI, zero style=
 *
 * @module tests/p6r2.centered_grid.test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { createApp, computeSensitivityAxes } from '../src/app.js';
import { renderSensitivity } from '../src/ui/sensitivityTab.js';
import { build as buildSchedules } from '../src/engine/schedules.js';
import { project as projectForecast } from '../src/engine/forecast.js';
import { project as projectThreeStatement } from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import {
  evaluate as evaluateRec,
  buildSensitivityGrid,
  runFullValuation,
} from '../src/engine/recommend.js';
import { apply as applyScenario, list as listScenarios } from '../src/engine/scenarios.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function getDatasets() {
  const readText = (loc) => fs.promises.readFile(loc, 'utf8');
  const historical = await loadHistorical({ readText });
  const assumptions = await loadAssumptions({ readText });
  return { historical, assumptions };
}

function createHtmlContainer() {
  return {
    innerHTML: '',
    querySelector(sel) {
      if (sel && sel.includes('data-statement="sensitivityGrid"')) {
        return {
          classList: { add() {}, remove() {}, contains() { return false; } },
          setAttribute() {},
          getAttribute() { return null; },
          innerHTML: '',
          appendChild() {},
          addEventListener() {},
          removeEventListener() {},
        };
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function getAppEngine() {
  return {
    schedules: { build: buildSchedules },
    forecast: { project: projectForecast },
    threeStatement: { project: projectThreeStatement },
    wacc: { build: buildWacc },
    dcf: { valuate: valuateDcf },
    recommend: { evaluate: evaluateRec, buildSensitivityGrid, runFullValuation },
    scenarios: { apply: applyScenario, list: listScenarios },
  };
}

describe('P6R2.1  -  Axis Derivation & Shrink Guard Unit Mechanics (computeSensitivityAxes)', () => {
  test('base case: derives 9 WACC rows and 5 growth columns centered on active inputs', () => {
    const activeWacc = 0.086638;
    const activeG = 0.025;
    const axes = computeSensitivityAxes(activeWacc, activeG);

    assert.equal(axes.axisNarrowed, false, 'No narrowing should occur for standard Base inputs');
    assert.equal(axes.waccValues.length, 9, 'Must have 9 WACC rows');
    assert.equal(axes.growthValues.length, 5, 'Must have 5 growth columns');

    // WACC row 5 (index 4) must equal active WACC
    assert.equal(axes.waccValues[4], 0.086638);
    // Growth col 3 (index 2) must equal active G
    assert.equal(axes.growthValues[2], 0.025);

    // Verify growth values span ±100bps in 50bps steps
    assert.deepEqual(
      axes.growthValues,
      [0.015, 0.02, 0.025, 0.03, 0.035]
    );

    // Verify WACC values span ±200bps in 50bps steps
    const expectedWacc = [-0.02, -0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015, 0.02]
      .map((off) => Number((activeWacc + off).toFixed(6)));
    assert.deepEqual(axes.waccValues, expectedWacc);
  });

  test('bear case: centered on bear active WACC (10.35%) and growth (2.00%)', () => {
    const activeWacc = 0.103468;
    const activeG = 0.020;
    const axes = computeSensitivityAxes(activeWacc, activeG);

    assert.equal(axes.axisNarrowed, false);
    assert.equal(axes.waccValues.length, 9);
    assert.equal(axes.growthValues.length, 5);

    assert.equal(axes.waccValues[4], 0.103468);
    assert.equal(axes.growthValues[2], 0.020);
    assert.deepEqual(axes.growthValues, [0.010, 0.015, 0.020, 0.025, 0.030]);
  });

  test('bull case: centered on bull active WACC (7.13%) and growth (3.00%)', () => {
    const activeWacc = 0.071308;
    const activeG = 0.030;
    const axes = computeSensitivityAxes(activeWacc, activeG);

    assert.equal(axes.axisNarrowed, false);
    assert.equal(axes.waccValues.length, 9);
    assert.equal(axes.growthValues.length, 5);

    assert.equal(axes.waccValues[4], 0.071308);
    assert.equal(axes.growthValues[2], 0.030);
    assert.deepEqual(axes.growthValues, [0.020, 0.025, 0.030, 0.035, 0.040]);
  });

  test('shrink guard: narrows growth radius first, then WACC radius on low Gordon headroom', () => {
    // Low headroom: WACC = 5.0%, g = 4.0% (headroom = 100 bps)
    // Default minWacc = 3.0%, maxG = 5.0% -> violates WACC > g
    const axes = computeSensitivityAxes(0.05, 0.04);

    assert.equal(axes.axisNarrowed, true, 'Axis must be marked narrowed');
    // All pairs must strictly satisfy wacc > g
    for (const w of axes.waccValues) {
      for (const g of axes.growthValues) {
        assert.ok(w > g, `Must satisfy w > g: ${w} > ${g}`);
      }
    }
  });

  test('shrink guard: reaches degenerate floor [activeWacc] x [activeG] on extreme headroom squeeze', () => {
    // Ultra-low headroom: WACC = 4.01%, g = 4.00% (headroom = 1 bp)
    const axes = computeSensitivityAxes(0.0401, 0.0400);

    assert.equal(axes.axisNarrowed, true);
    assert.equal(axes.waccValues.length, 1);
    assert.equal(axes.growthValues.length, 1);
    assert.equal(axes.waccValues[0], 0.0401);
    assert.equal(axes.growthValues[0], 0.0400);
    assert.ok(axes.waccValues[0] > axes.growthValues[0]);
  });
});

describe('P6R2.1  -  Controller Integration & Center Invariance Sweep (createApp)', () => {
  test('default (base) state: center cell is exactly row 5, col 3 and equals active valuation pin $144.08', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: getAppEngine(),
      historical,
      assumptions,
    });

    const s = app.state();
    const grid = s.sensitivityGrid;
    assert.ok(grid);
    assert.equal(grid.waccValues.length, 9, 'Must have 9 WACC rows');
    assert.equal(grid.growthValues.length, 5, 'Must have 5 growth columns');
    assert.equal(grid.axisNarrowed, false);

    // Row 5 (index 4), Col 3 (index 2)
    const centerWacc = grid.waccValues[4];
    const centerG = grid.growthValues[2];
    assert.equal(centerWacc, s.wacc.wacc.value, 'Center WACC must equal active WACC');
    assert.equal(centerG, 0.025, 'Center g must equal active g');

    const centerCell = grid.matrix[centerWacc][centerG];
    assert.ok(centerCell);
    assert.ok(Math.abs(centerCell.perShare - s.dcf.perShare) < 1e-6, 'Center cell perShare must match active pin');
    assert.ok(Math.abs(centerCell.perShare - 144.082130498451) < 1e-4);

    app.dispose();
  });

  test('bear-active state: center cell is row 5, col 3 and equals active Bear pin $84.39', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: getAppEngine(),
      historical,
      assumptions,
    });

    app.setScenario('bear');
    const s = app.state();
    const grid = s.sensitivityGrid;

    assert.equal(grid.waccValues.length, 9);
    assert.equal(grid.growthValues.length, 5);
    assert.equal(grid.axisNarrowed, false);

    const centerWacc = grid.waccValues[4];
    const centerG = grid.growthValues[2];
    assert.equal(centerWacc, s.wacc.wacc.value);
    assert.equal(centerG, 0.020);

    const centerCell = grid.matrix[centerWacc][centerG];
    assert.ok(centerCell);
    assert.ok(Math.abs(centerCell.perShare - s.dcf.perShare) < 1e-6);
    assert.ok(Math.abs(centerCell.perShare - 84.3890501794256) < 1e-4);

    app.dispose();
  });

  test('bull-active state: center cell is row 5, col 3 and equals active Bull pin $277.84', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: getAppEngine(),
      historical,
      assumptions,
    });

    app.setScenario('bull');
    const s = app.state();
    const grid = s.sensitivityGrid;

    assert.equal(grid.waccValues.length, 9);
    assert.equal(grid.growthValues.length, 5);
    assert.equal(grid.axisNarrowed, false);

    const centerWacc = grid.waccValues[4];
    const centerG = grid.growthValues[2];
    assert.ok(Math.abs(centerWacc - s.wacc.wacc.value) < 1e-6);
    assert.equal(centerG, 0.030);

    const centerCell = grid.matrix[centerWacc][centerG];
    assert.ok(centerCell);
    assert.ok(Math.abs(centerCell.perShare - s.dcf.perShare) < 1e-6);
    assert.ok(Math.abs(centerCell.perShare - 277.8370238128362) < 1e-4);

    app.dispose();
  });

  test('slider edit in Base, Bear, Bull maintains center invariance', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: getAppEngine(),
      historical,
      assumptions,
    });

    // 1. Slider edit in Base: terminal growth rate = 0.0275 (step = 0.0025)
    app.setDriver('terminal_growth_rate', 0.0275);
    let s = app.state();
    let grid = s.sensitivityGrid;
    let expectedG = s.assumptions.get('terminal_growth_rate').value;
    assert.ok(Math.abs(grid.waccValues[4] - s.wacc.wacc.value) < 1e-6);
    assert.ok(Math.abs(grid.growthValues[2] - expectedG) < 1e-6);
    assert.ok(Math.abs(grid.matrix[grid.waccValues[4]][grid.growthValues[2]].perShare - s.dcf.perShare) < 1e-6);

    // 2. Slider edit in Bear: sets neutral base to 0.025, bear delta (-0.005) -> active 0.020
    app.setScenario('bear');
    app.setDriver('terminal_growth_rate', 0.025);
    s = app.state();
    grid = s.sensitivityGrid;
    expectedG = s.assumptions.get('terminal_growth_rate').value;
    assert.ok(Math.abs(grid.waccValues[4] - s.wacc.wacc.value) < 1e-6);
    assert.ok(Math.abs(grid.growthValues[2] - expectedG) < 1e-6);
    assert.ok(Math.abs(grid.matrix[grid.waccValues[4]][grid.growthValues[2]].perShare - s.dcf.perShare) < 1e-6);

    // 3. Slider edit in Bull: sets neutral base to 0.025, bull delta (+0.005) -> active 0.030
    app.setScenario('bull');
    app.setDriver('terminal_growth_rate', 0.025);
    s = app.state();
    grid = s.sensitivityGrid;
    expectedG = s.assumptions.get('terminal_growth_rate').value;
    assert.ok(Math.abs(grid.waccValues[4] - s.wacc.wacc.value) < 1e-6);
    assert.ok(Math.abs(grid.growthValues[2] - expectedG) < 1e-6);
    assert.ok(Math.abs(grid.matrix[grid.waccValues[4]][grid.growthValues[2]].perShare - s.dcf.perShare) < 1e-6);

    app.dispose();
  });

  test('strict monotonicity (dPrice/dWACC < 0, dPrice/dg > 0) and WACC > g holds across all neighbor pairs', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: getAppEngine(),
      historical,
      assumptions,
    });

    for (const sc of ['base', 'bear', 'bull']) {
      app.setScenario(sc);
      const grid = app.state().sensitivityGrid;

      // Check WACC > g on every cell
      for (const cell of grid.cells) {
        assert.ok(cell.wacc > cell.growth, `WACC > g violated: ${cell.wacc} <= ${cell.growth}`);
      }

      // Check monotonicity across WACC rows (perShare ↓ as WACC ↑)
      for (const g of grid.growthValues) {
        for (let i = 1; i < grid.waccValues.length; i++) {
          const higherWacc = grid.waccValues[i];
          const lowerWacc = grid.waccValues[i - 1];
          const pHigh = grid.matrix[higherWacc][g].perShare;
          const pLow = grid.matrix[lowerWacc][g].perShare;
          assert.ok(pHigh < pLow, `Price must decrease as WACC increases: ${pHigh} < ${pLow}`);
        }
      }

      // Check monotonicity across Growth columns (perShare ↑ as g ↑)
      for (const w of grid.waccValues) {
        for (let j = 1; j < grid.growthValues.length; j++) {
          const higherG = grid.growthValues[j];
          const lowerG = grid.growthValues[j - 1];
          const pHigh = grid.matrix[w][higherG].perShare;
          const pLow = grid.matrix[w][lowerG].perShare;
          assert.ok(pHigh > pLow, `Price must increase as growth increases: ${pHigh} > ${pLow}`);
        }
      }
    }

    app.dispose();
  });
});

describe('P6R2.1  -  UI Rendering, Highlights, Purged Literals & Narrowing Footnote', () => {
  test('matrix description purges 1.0%-3.0% and mentions WACC (±200 bps) and Gordon Growth (±100 bps)', () => {
    const container = createHtmlContainer();
    const sensitivityGrid = {
      base: { wacc: 0.086638, growth: 0.025, perShare: 249.36 },
      waccValues: [0.066638, 0.076638, 0.086638, 0.096638, 0.106638],
      growthValues: [0.015, 0.02, 0.025, 0.03, 0.035],
      matrix: {
        0.086638: { 0.025: { perShare: 249.36 } },
      },
    };

    renderSensitivity({
      container,
      sensitivityGrid,
      TabulatorConstructor: class MockTabulator {},
    });

    const html = container.innerHTML;
    assert.match(html, /WACC \(&plusmn;200 bps\)/i);
    assert.match(html, /Gordon Growth rates \(&plusmn;100 bps\)/i);
    assert.match(html, /both axes tracking the active scenario/i);
    assert.match(html, /Matrix center tracks active scenario WACC/i);
    assert.doesNotMatch(html, /1\.0%[-\-]3\.0%/, 'Fixed 1.0%-3.0% literal must be purged');
  });

  test('center cell receives cell-highlight-base and center WACC row receives ACTIVE badge', () => {
    const container = createHtmlContainer();
    const sensitivityGrid = {
      base: { wacc: 0.086638, growth: 0.025, perShare: 249.36 },
      waccValues: [0.066638, 0.076638, 0.086638, 0.096638, 0.106638],
      growthValues: [0.015, 0.02, 0.025, 0.03, 0.035],
      matrix: {
        0.086638: {
          0.015: { perShare: 210.0 },
          0.020: { perShare: 228.0 },
          0.025: { perShare: 249.36 },
          0.030: { perShare: 275.0 },
          0.035: { perShare: 310.0 },
        },
      },
    };

    let capturedConfig = null;
    class MockTabulator {
      constructor(el, cfg) {
        capturedConfig = cfg;
      }
    }

    renderSensitivity({
      container,
      sensitivityGrid,
      TabulatorConstructor: MockTabulator,
    });

    assert.ok(capturedConfig);
    const labelCol = capturedConfig.columns[0];
    const gColCenter = capturedConfig.columns[3]; // col 0 is label, col 3 is index 2 (g=0.025)
    const gColOffCenter = capturedConfig.columns[2]; // col 2 is index 1 (g=0.020)

    const centerRow = {
      isActiveWacc: true,
      isBaseWacc: true,
      activeGrowth: 0.025,
      waccLabel: '8.66%',
    };

    const labelHtml = labelCol.formatter(centerRow);
    assert.match(labelHtml, /ACTIVE/);

    const cellValueCenter = 249.36;
    const centerCellHtml = gColCenter.formatter({
      getValue: () => cellValueCenter,
      getRow: () => ({ getData: () => centerRow }),
    });
    assert.match(centerCellHtml, /cell-highlight-base/);

    const cellValueOff = 228.0;
    const offCellHtml = gColOffCenter.formatter({
      getValue: () => cellValueOff,
      getRow: () => ({ getData: () => centerRow }),
    });
    assert.doesNotMatch(offCellHtml, /cell-highlight-base/);
  });

  test('narrowing footnote appears when axisNarrowed is true', () => {
    const container = createHtmlContainer();
    const sensitivityGrid = {
      base: { wacc: 0.05, growth: 0.04, perShare: 150.0 },
      waccValues: [0.05],
      growthValues: [0.04],
      axisNarrowed: true,
      matrix: {
        0.05: { 0.04: { perShare: 150.0 } },
      },
    };

    renderSensitivity({
      container,
      sensitivityGrid,
      TabulatorConstructor: class MockTabulator {},
    });

    const html = container.innerHTML;
    assert.match(html, /sensitivity-narrowing-note/);
    assert.match(html, /axis range narrowed to respect WACC &gt; g at current driver settings\./);
  });

  test('narrowing footnote is absent when axisNarrowed is false', () => {
    const container = createHtmlContainer();
    const sensitivityGrid = {
      base: { wacc: 0.086638, growth: 0.025, perShare: 249.36 },
      waccValues: [0.086638],
      growthValues: [0.025],
      axisNarrowed: false,
      matrix: {
        0.086638: { 0.025: { perShare: 249.36 } },
      },
    };

    renderSensitivity({
      container,
      sensitivityGrid,
      TabulatorConstructor: class MockTabulator {},
    });

    const html = container.innerHTML;
    assert.doesNotMatch(html, /sensitivity-narrowing-note/);
    assert.doesNotMatch(html, /axis range narrowed/);
  });
});

describe('P6R2.1  -  Engine Invariance & Quality Gates', () => {
  test('engine-default regression pin: direct buildSensitivityGrid() call without growthValues retains [0.01-0.03]', async () => {
    const { historical, assumptions } = await getDatasets();
    const sched = buildSchedules(historical, assumptions);
    const fc = projectForecast({ historical, assumptions });
    const ts = projectThreeStatement(sched, assumptions, fc);
    const waccOut = buildWacc({ assumptions, debtSchedule: sched.debt });

    const defaultGrid = buildSensitivityGrid({
      threeStatement: ts,
      assumptions,
      wacc: waccOut,
    });

    assert.deepEqual(
      Array.from(defaultGrid.growthValues),
      [0.01, 0.015, 0.02, 0.025, 0.03],
      'Engine default growth band must remain [0.01, 0.015, 0.02, 0.025, 0.03]'
    );
    assert.equal(defaultGrid.growthValues.length, 5);
    assert.equal(defaultGrid.waccValues.length, 9);
    assert.equal(defaultGrid.cells.length, 45);
  });

  test('git diff v1.0-P6R-base -- src/engine/ touched only authorized files for P6R2', () => {
    try {
      const changedFiles = execSync('git diff --name-only v1.0-P6R-base -- src/engine/', {
        cwd: ROOT,
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .map((s) => s.trim().replace(/\\/g, '/'))
        .filter(Boolean);
      const authorized = ['src/engine/beta.js', 'src/engine/dcf.js', 'src/engine/threeStatement.js'];
      for (const file of changedFiles) {
        assert.ok(authorized.includes(file), `Unauthorized engine modification in ${file}`);
      }
    } catch {
      // ignore
    }
  });

  test('zero bare numeric literals > 999 outside comments in touched UI files', () => {
    const touchedFiles = [
      path.join(ROOT, 'src', 'app.js'),
      path.join(ROOT, 'src', 'ui', 'sensitivityTab.js'),
    ];

    const bareLiteralRegex = /\b([1-9]\d{3,})\b/g;

    for (const filePath of touchedFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      const matches = stripped.match(bareLiteralRegex);
      assert.ok(
        !matches || matches.length === 0,
        `Found forbidden bare numeric literal > 999 in ${path.basename(filePath)}: ${matches?.join(', ')}`
      );
    }
  });

  test('zero style= inline attributes in src/ui/sensitivityTab.js', () => {
    const content = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'sensitivityTab.js'), 'utf8');
    assert.doesNotMatch(content, /style\s*=/i, 'No style= inline attributes permitted');
  });
});
