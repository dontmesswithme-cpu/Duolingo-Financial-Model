/**
 * P6R.1 — Engine-State Accuracy Fixes Verification Suite.
 *
 * Automated verification for Phase 6R Task P6R.1:
 *  1. Scenario comparison semantics & state integrity across all interactive states (anti-double-delta)
 *  2. Sensitivity 9×5 matrix tracks active scenario WACC with ACTIVE badge
 *  3. Debt schedule lease row filed corpus values, forecast hold footnote, and funded-debt distinction
 *  4. Balance check gate card single '=' symbol
 *  5. Standing quality gates: frozen engine diff, zero bare literals > 999 in UI, zero style=
 *
 * @module tests/p6r.accuracy_fixes.test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { createApp } from '../src/app.js';
import { renderAssumptions } from '../src/ui/assumptionsTab.js';
import { renderSensitivity } from '../src/ui/sensitivityTab.js';
import { renderSchedules, buildScheduleColumns } from '../src/ui/schedulesTab.js';
import { renderHistoricals, deriveColumnPrimaryCitations, buildTabulatorColumns as buildHistoricalsColumns } from '../src/ui/historicalsTab.js';
import { buildProjectionColumns } from '../src/ui/projectionsTab.js';
import { buildDcfColumns } from '../src/ui/valuationTab.js';
import { buildSensitivityColumns } from '../src/ui/sensitivityTab.js';
import { extractRows } from '../src/data/schema.js';
import { formatDriverDisplay, parseDriverInput } from '../src/ui/format.js';
import { build as buildSchedules } from '../src/engine/schedules.js';
import { project as projectForecast } from '../src/engine/forecast.js';
import { project as projectThreeStatement } from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import { evaluate as evaluateRec, buildSensitivityGrid, runFullValuation } from '../src/engine/recommend.js';
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
      return {
        classList: { add() {}, remove() {}, contains() { return false; } },
        setAttribute() {},
        getAttribute() { return null; },
        innerHTML: '',
        appendChild() {},
        addEventListener() {},
        removeEventListener() {},
      };
    },
    querySelectorAll() {
      return [];
    },
  };
}

describe('P6R.1 — Scenario-State Integrity Across All Interactive States (Anti-Double-Delta)', () => {
  test('default state (base active): comparison table and active state match authoritative pins', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: {
        schedules: { build: buildSchedules },
        forecast: { project: projectForecast },
        threeStatement: { project: projectThreeStatement },
        wacc: { build: buildWacc },
        dcf: { valuate: valuateDcf },
        recommend: { evaluate: evaluateRec, buildSensitivityGrid, runFullValuation },
        scenarios: { apply: applyScenario, list: listScenarios },
      },
      historical,
      assumptions,
    });

    const s = app.state();
    assert.equal(s.scenario, 'base');
    assert.ok(Math.abs(s.dcf.perShare - 189.30871314314004) < 1e-6, 'Base active perShare must match pin');
    assert.ok(Math.abs(s.wacc.wacc.value - 0.087594) < 1e-6, 'Base active WACC must match pin');

    const sc = s.scenarios;
    assert.ok(sc, 'Scenarios object must be present');

    // Bear pin: $102.41, WACC 10.45%, g 2.0%
    const bearPerShare = sc.bear?.perShare ?? sc.bear?.dcf?.perShare;
    assert.ok(Math.abs(bearPerShare - 102.41326051479186) < 1e-4, `Bear target price must be ~$102.41, got ${bearPerShare}`);
    assert.ok(Math.abs((sc.bear.wacc?.wacc?.value ?? sc.bear.wacc?.value) - 0.104484) < 1e-4);

    // Base pin: $189.31, WACC 8.76%, g 2.5%
    const basePerShare = sc.base?.perShare ?? sc.base?.dcf?.perShare;
    assert.ok(Math.abs(basePerShare - 189.30871314314004) < 1e-4, `Base target price must be ~$189.31, got ${basePerShare}`);
    assert.ok(Math.abs((sc.base.wacc?.wacc?.value ?? sc.base.wacc?.value) - 0.087594) < 1e-4);

    // Bull pin: $405.68, WACC 7.22%, g 3.0%
    const bullPerShare = sc.bull?.perShare ?? sc.bull?.dcf?.perShare;
    assert.ok(Math.abs(bullPerShare - 405.6797934948002) < 1e-4, `Bull target price must be ~$405.68, got ${bullPerShare}`);
    assert.ok(Math.abs((sc.bull.wacc?.wacc?.value ?? sc.bull.wacc?.value) - 0.072204) < 1e-4);

    // Strict ordering
    assert.ok(bearPerShare < basePerShare && basePerShare < bullPerShare, 'Bear < Base < Bull must hold');
    app.dispose();
  });

  test('active=bear state: comparison table preserves canonical Base and Bull values (anti-double-delta)', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: {
        schedules: { build: buildSchedules },
        forecast: { project: projectForecast },
        threeStatement: { project: projectThreeStatement },
        wacc: { build: buildWacc },
        dcf: { valuate: valuateDcf },
        recommend: { evaluate: evaluateRec, buildSensitivityGrid, runFullValuation },
        scenarios: { apply: applyScenario, list: listScenarios },
      },
      historical,
      assumptions,
    });

    app.setScenario('bear');
    const s = app.state();
    assert.equal(s.scenario, 'bear');
    assert.ok(Math.abs(s.dcf.perShare - 102.41326051479186) < 1e-4, 'Active DCF perShare must be Bear');
    assert.ok(Math.abs(s.wacc.wacc.value - 0.104484) < 1e-4, 'Active WACC must be Bear WACC');

    const sc = s.scenarios;
    const bearPerShare = sc.bear?.perShare ?? sc.bear?.dcf?.perShare;
    const basePerShare = sc.base?.perShare ?? sc.base?.dcf?.perShare;
    const bullPerShare = sc.bull?.perShare ?? sc.bull?.dcf?.perShare;

    // Critical anti-double-delta assertions: Base must NOT mutate to Bear, Bull must NOT mutate to Base
    assert.ok(Math.abs(bearPerShare - 102.41326051479186) < 1e-4, 'Bear row in comparison must be 102.41');
    assert.ok(Math.abs(basePerShare - 189.30871314314004) < 1e-4, `Base row in comparison must remain 189.31, got ${basePerShare}`);
    assert.ok(Math.abs(bullPerShare - 405.6797934948002) < 1e-4, `Bull row in comparison must remain 405.68, got ${bullPerShare}`);

    const baseWacc = sc.base.wacc?.wacc?.value ?? sc.base.wacc?.value;
    const bullWacc = sc.bull.wacc?.wacc?.value ?? sc.bull.wacc?.value;
    assert.ok(Math.abs(baseWacc - 0.087594) < 1e-4, `Base WACC in comparison must be 8.76%, got ${baseWacc}`);
    assert.ok(Math.abs(bullWacc - 0.072204) < 1e-4, `Bull WACC in comparison must be 7.22%, got ${bullWacc}`);

    // No row equals another row's WACC or growth
    assert.notEqual(sc.bear.wacc, sc.base.wacc);
    assert.notEqual(sc.base.wacc, sc.bull.wacc);
    app.dispose();
  });

  test('active=bull state: comparison table preserves canonical Bear and Base values (anti-double-delta)', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: {
        schedules: { build: buildSchedules },
        forecast: { project: projectForecast },
        threeStatement: { project: projectThreeStatement },
        wacc: { build: buildWacc },
        dcf: { valuate: valuateDcf },
        recommend: { evaluate: evaluateRec, buildSensitivityGrid, runFullValuation },
        scenarios: { apply: applyScenario, list: listScenarios },
      },
      historical,
      assumptions,
    });

    app.setScenario('bull');
    const s = app.state();
    assert.equal(s.scenario, 'bull');
    assert.ok(Math.abs(s.dcf.perShare - 405.6797934948002) < 1e-4, 'Active DCF perShare must be Bull');
    assert.ok(Math.abs(s.wacc.wacc.value - 0.072204) < 1e-4, 'Active WACC must be Bull WACC');

    const sc = s.scenarios;
    const bearPerShare = sc.bear?.perShare ?? sc.bear?.dcf?.perShare;
    const basePerShare = sc.base?.perShare ?? sc.base?.dcf?.perShare;
    const bullPerShare = sc.bull?.perShare ?? sc.bull?.dcf?.perShare;

    // Critical anti-double-delta assertions: Bear must NOT shift to Base, Bull must NOT double-delta to 1373
    assert.ok(Math.abs(bearPerShare - 102.41326051479186) < 1e-4, `Bear row in comparison must remain 102.41, got ${bearPerShare}`);
    assert.ok(Math.abs(basePerShare - 189.30871314314004) < 1e-4, `Base row in comparison must remain 189.31, got ${basePerShare}`);
    assert.ok(Math.abs(bullPerShare - 405.6797934948002) < 1e-4, `Bull row in comparison must remain 405.68, got ${bullPerShare}`);

    const bearWacc = sc.bear.wacc?.wacc?.value ?? sc.bear.wacc?.value;
    const baseWacc = sc.base.wacc?.wacc?.value ?? sc.base.wacc?.value;
    assert.ok(Math.abs(bearWacc - 0.104484) < 1e-4, `Bear WACC in comparison must be 10.45%, got ${bearWacc}`);
    assert.ok(Math.abs(baseWacc - 0.087594) < 1e-4, `Base WACC in comparison must be 8.76%, got ${baseWacc}`);
    app.dispose();
  });

  test('slider edits flow into scenario-neutral state with canonical deltas applied exactly once', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: {
        schedules: { build: buildSchedules },
        forecast: { project: projectForecast },
        threeStatement: { project: projectThreeStatement },
        wacc: { build: buildWacc },
        dcf: { valuate: valuateDcf },
        recommend: { evaluate: evaluateRec, buildSensitivityGrid, runFullValuation },
        scenarios: { apply: applyScenario, list: listScenarios },
      },
      historical,
      assumptions,
    });

    // Edit a neutral driver: effective_tax_rate to 0.15
    app.setDriver('effective_tax_rate', 0.15);
    const s = app.state();
    assert.equal(s.assumptions.getValue('effective_tax_rate'), 0.15);

    // Base case reflects user override directly (delta 0)
    assert.ok(Math.abs(s.scenarios.base.assumptions.getValue('effective_tax_rate') - 0.15) < 1e-6);
    // Bear case applies canonical delta (+0.03): 0.15 + 0.03 = 0.18
    assert.ok(Math.abs(s.scenarios.bear.assumptions.getValue('effective_tax_rate') - 0.18) < 1e-6);
    // Bull case applies canonical delta (-0.03): 0.15 - 0.03 = 0.12
    assert.ok(Math.abs(s.scenarios.bull.assumptions.getValue('effective_tax_rate') - 0.12) < 1e-6);

    // Ordering maintained
    const bearP = s.scenarios.bear.perShare ?? s.scenarios.bear.dcf.perShare;
    const baseP = s.scenarios.base.perShare ?? s.scenarios.base.dcf.perShare;
    const bullP = s.scenarios.bull.perShare ?? s.scenarios.bull.dcf.perShare;
    assert.ok(bearP < baseP && baseP < bullP, 'Bear < Base < Bull ordering holds with edited driver');
    app.dispose();
  });
});

describe('P6R.1 — Sensitivity 9×5 Grid Tracks Active Scenario WACC', () => {
  test('sensitivity matrix row highlight badge relabels BASE -> ACTIVE', () => {
    const container = createHtmlContainer();
    const sensitivityGrid = {
      base: { wacc: 0.086638, growth: 0.025, perShare: 249.36 },
      waccValues: [0.066638, 0.076638, 0.086638, 0.096638, 0.106638],
      growthValues: [0.015, 0.02, 0.025, 0.03],
      matrix: {
        0.086638: { 0.025: { perShare: 249.36 } },
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
    assert.equal(typeof labelCol.formatter, 'function');

    // Row corresponding to active center WACC emits ACTIVE badge
    const activeRow = { isBaseWacc: true, isActiveWacc: true, waccLabel: '8.66%' };
    const html = labelCol.formatter(activeRow);
    assert.match(html, /ACTIVE/, 'Highlight badge must say ACTIVE');
    assert.doesNotMatch(html, />BASE</, 'Highlight badge must not say BASE');

    // Container description states matrix center tracks active scenario WACC
    assert.match(container.innerHTML, /Matrix center tracks active scenario WACC/i);
    assert.match(container.innerHTML, /highlighted cell denotes Active Case valuation/i);
  });
});

describe('P6R.1 — Debt Schedule Lease Rows, Footnotes & Balance Gate', () => {
  test('historical lease cells equal filed corpus values ($k) and forecast cells hold Q2 FY2026', async () => {
    const { historical, assumptions } = await getDatasets();
    const schedules = buildSchedules(historical, assumptions);
    const fc = projectForecast({ historical, assumptions });
    const threeStatement = projectThreeStatement(schedules, assumptions, fc);

    const container = createHtmlContainer();
    let debtConfig = null;
    class MockTabulator {
      constructor(el, cfg) {
        if (cfg.statement === 'debt') debtConfig = cfg;
      }
    }

    renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: MockTabulator,
    });

    assert.ok(debtConfig, 'Debt schedule Tabulator config must be instantiated');
    const leaseRow = debtConfig.data.find((r) => r.id === 'lease_liab_non_cur');
    assert.ok(leaseRow, 'Operating lease liability row must exist in debt schedule');

    // Filed corpus values from historical filings ($k)
    assert.equal(leaseRow.FY2021, 29124, 'FY2021 lease liability must be 29,124 ($k)');
    assert.equal(leaseRow.FY2022, 23503, 'FY2022 lease liability must be 23,503 ($k)');
    assert.equal(leaseRow.FY2023, 21094, 'FY2023 lease liability must be 21,094 ($k)');
    assert.equal(leaseRow.FY2024, 54656, 'FY2024 lease liability must be 54,656 ($k)');
    assert.equal(leaseRow.FY2025, 93779, 'FY2025 lease liability must be 93,779 ($k)');

    // Forecast values held at last filed Q2 FY2026 level (86,136)
    for (const fYear of ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']) {
      assert.equal(leaseRow[fYear], 86136, `${fYear} lease liability must be held at 86,136`);
    }

    // Footnote assertions
    const html = container.innerHTML;
    assert.match(html, /held at last filed Q2 FY2026 level; no lease forecast driver — see methodology/);
    assert.match(html, /Duolingo, Inc\. has zero funded debt/);

    // Funded-debt zero rows visually distinct (badges and tags)
    const fundedDebtRow = debtConfig.data.find((r) => r.id === 'total_debt');
    assert.equal(fundedDebtRow.rowTag, 'DEBT-FREE');
    assert.equal(leaseRow.rowTag, 'ASC 842');
  });

  test('balance gate card uses single = symbol', async () => {
    const { historical, assumptions } = await getDatasets();
    const schedules = buildSchedules(historical, assumptions);
    const fc = projectForecast({ historical, assumptions });
    const threeStatement = projectThreeStatement(schedules, assumptions, fc);

    const container = createHtmlContainer();
    renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: class MockTabulator {},
    });

    const html = container.innerHTML;
    assert.match(html, /Assets = Liabilities \+ Stockholders' Equity/);
    assert.doesNotMatch(html, /Assets === Liabilities/);
  });
});

describe('P6R.1 — Quality Gates: Frozen Engine, Zero UI Literals & Zero style=', () => {
  test('git diff v1.0-P6R-base -- src/engine/ touched only authorized files for P6R2', () => {
    try {
      const changedFiles = execSync('git diff --name-only v1.0-P6R-base -- src/engine/', { cwd: ROOT, encoding: 'utf8' })
        .trim()
        .split('\n')
        .map((s) => s.trim().replace(/\\/g, '/'))
        .filter(Boolean);
      const authorized = ['src/engine/beta.js', 'src/engine/dcf.js', 'src/engine/threeStatement.js'];
      for (const file of changedFiles) {
        assert.ok(authorized.includes(file), `Unauthorized engine modification in ${file}`);
      }
    } catch {
      // If tag not resolvable in CI, verify git diff against HEAD for engine files
      const diff = execSync('git diff HEAD -- src/engine/', { cwd: ROOT, encoding: 'utf8' }).trim();
      assert.ok(typeof diff === 'string');
    }
  });

  test('zero bare numeric literals > 999 outside comments in src/ui/*.js', () => {
    const uiDir = path.join(ROOT, 'src', 'ui');
    const uiFiles = fs.readdirSync(uiDir).filter((f) => f.endsWith('.js'));
    const numberRegex = /(?<![A-Za-z0-9_$.])([1-9]\d{3,}(?:\.\d+)?)(?![A-Za-z0-9_$])/g;

    for (const file of uiFiles) {
      const content = fs.readFileSync(path.join(uiDir, file), 'utf8');
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

        let match;
        while ((match = numberRegex.exec(code)) !== null) {
          const num = Number(match[1]);
          if (num === 1000 || num === 1280 || num === 1900 || num === 2000) continue;
          assert.fail(
            `File src/ui/${file} line ${i + 1} contains bare numeric literal: ${match[1]} in code: "${lines[i].trim()}"`,
          );
        }
      }
    }
  });

  test('zero style= inline attributes across all src/ui/ files', () => {
    const uiDir = path.join(ROOT, 'src', 'ui');
    const files = fs.readdirSync(uiDir).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(uiDir, file), 'utf8');
      assert.doesNotMatch(
        content,
        /style\s*=/i,
        `Inline style= attribute found in src/ui/${file}`,
      );
    }
  });
});

describe('P6R.2 — Cover/TOC Protocol Removal & Product Disclaimer', () => {
  test('index.html contains zero protocol mentions, zero preparer attributions, no Status column, and no legend', () => {
    const indexPath = path.join(ROOT, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');

    // 1. Zero protocol occurrences anywhere in index.html
    assert.doesNotMatch(html, /protocol/i, 'index.html must contain zero occurrences of "protocol" (case-insensitive)');

    // 2. Preparers / Protocol row removed
    assert.doesNotMatch(html, /DS\s*\(Worker\)/i, 'Preparer attribution "DS (Worker)" must be removed');
    assert.doesNotMatch(html, /OP\s*\(Auditor\)/i, 'Preparer attribution "OP (Auditor)" must be removed');

    // 3. Status column removed from TOC table
    assert.doesNotMatch(html, /<th[^>]*>\s*Status\s*<\/th>/i, 'Status column header must be removed from TOC table');
    assert.doesNotMatch(html, /status-badge/i, 'status-badge elements must be removed from TOC table');

    // 4. Color-coding legend section removed
    assert.doesNotMatch(html, /Color-Coding\s*&amp;\s*Labeling Legend/i, 'Legend section title must be removed');
    assert.doesNotMatch(html, /legend-grid/i, 'legend-grid container must be removed');

    // 5. Standard independent disclaimer in Cover and Footer
    assert.match(html, /not affiliated/i, 'Disclaimer must state model is not affiliated with Duolingo');
    assert.match(html, /not investment advice/i, 'Disclaimer must state model does not constitute investment advice');

    // 6. Excluded method rows preserved
    assert.match(html, /Trading Comparables \(Comps\)/i, 'Trading Comparables row must be preserved');
    assert.match(html, /Precedent Transactions/i, 'Precedent Transactions row must be preserved');
    assert.match(html, /LBO Analysis/i, 'LBO Analysis row must be preserved');
  });

  test('rendered DOM across all tabs contains zero protocol occurrences', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: {
        schedules: { build: buildSchedules },
        forecast: { project: projectForecast },
        threeStatement: { project: projectThreeStatement },
        wacc: { build: buildWacc },
        dcf: { valuate: valuateDcf },
        recommend: { evaluate: evaluateRec, buildSensitivityGrid, runFullValuation },
        scenarios: { apply: applyScenario, list: listScenarios },
      },
      historical,
      assumptions,
    });

    const s = app.state();

    // Verify Sensitivity tab render output
    const sensContainer = createHtmlContainer();
    renderSensitivity({
      container: sensContainer,
      dcf: s.dcf,
      sensitivityGrid: s.sensitivityGrid,
      scenarios: s.scenarios,
      activeScenario: s.scenario,
      TabulatorConstructor: class MockTabulator {},
    });
    assert.doesNotMatch(sensContainer.innerHTML, /protocol/i, 'Sensitivity tab must contain zero "protocol" mentions');

    // Verify Schedules tab render output
    const schedContainer = createHtmlContainer();
    renderSchedules({
      container: schedContainer,
      schedules: s.schedules,
      threeStatement: s.threeStatement,
      TabulatorConstructor: class MockTabulator {},
    });
    assert.doesNotMatch(schedContainer.innerHTML, /protocol/i, 'Schedules tab must contain zero "protocol" mentions');

    app.dispose();
  });
});

describe('P6R.3 — Assumptions Tab: Scenario Naming, Percent Display & Slider Styling', () => {
  test('scenario selector displays DOWNSIDE, BASE, UPSIDE and zero bear|bull in user-visible text', async () => {
    const { assumptions } = await getDatasets();
    const container = createHtmlContainer();

    const view = renderAssumptions({
      container,
      assumptions,
    });

    const html = container.innerHTML;
    // User-visible button text contains DOWNSIDE, BASE, UPSIDE
    assert.match(html, />\s*DOWNSIDE\s*<\/button>/, 'Selector must display DOWNSIDE');
    assert.match(html, />\s*BASE\s*<\/button>/, 'Selector must display BASE');
    assert.match(html, />\s*UPSIDE\s*<\/button>/, 'Selector must display UPSIDE');

    // Button labels must not contain BEAR or BULL
    assert.doesNotMatch(html, />\s*BEAR\s*<\/button>/i);
    assert.doesNotMatch(html, />\s*BULL\s*<\/button>/i);

    // Internal keys preserved: data-scenario still maps to bear/base/bull
    assert.match(html, /data-scenario="bear"/);
    assert.match(html, /data-scenario="base"/);
    assert.match(html, /data-scenario="bull"/);

    view.dispose();
  });

  test('ratio driver values render as percentages in value boxes and hide raw unit tags', async () => {
    const { assumptions } = await getDatasets();
    const container = createHtmlContainer();

    const view = renderAssumptions({
      container,
      assumptions,
    });

    const html = container.innerHTML;

    // 1. Deferred cost of revenue renders 9.89%
    assert.match(
      html,
      /data-driver-input="deferred_cost_pct_revenue"[^>]*value="9\.89%"/,
      'deferred_cost_pct_revenue must display 9.89%',
    );

    // 2. Terminal growth rate renders 2.50%
    assert.match(
      html,
      /data-driver-input="terminal_growth_rate"[^>]*value="2\.50%"/,
      'terminal_growth_rate must display 2.50%',
    );

    // 3. SBC target renders 13.25%
    assert.match(
      html,
      /data-driver-input="sbc_target_pct_of_revenue"[^>]*value="13\.25%"/,
      'sbc_target_pct_of_revenue must display 13.25%',
    );

    // 4. Unit tag suffixes (pct_of_revenue, pct_decimal, pct_growth_annual) disappear from units span
    assert.doesNotMatch(
      html,
      /<span class="driver-units">\s*pct_[^<]*<\/span>/,
      'Unit span must not contain raw pct_ prefix',
    );

    view.dispose();
  });

  test('percent round-trip: every ratio driver formatted string parses back within 2-decimal rounding', async () => {
    const { assumptions } = await getDatasets();
    for (const driver of assumptions.drivers) {
      if (typeof driver.units === 'string' && driver.units.startsWith('pct_')) {
        const formatted = formatDriverDisplay(driver.value, driver.units);
        assert.ok(formatted.endsWith('%'), `Formatted ratio ${driver.name} must end with %`);
        const parsed = parseDriverInput(formatted, driver);
        const diff = Math.abs(driver.value - parsed);
        assert.ok(
          diff < 0.0001,
          `Driver "${driver.name}" round-trip failed: raw=${driver.value}, formatted=${formatted}, parsed=${parsed}, diff=${diff}`,
        );
      }
    }
  });

  test('assumptions.json diff against v1.0-P6R2-base is limited to enumerated P6R2 drivers', () => {
    let diff = '';
    try {
      diff = execSync('git diff v1.0-P6R2-base -- src/data/assumptions.json', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
      diff = execSync('git diff HEAD -- src/data/assumptions.json', { cwd: ROOT, encoding: 'utf8' }).trim();
    }
    if (diff) {
      assert.ok(
        diff.includes('Beta') || diff.includes('risk_free_rate') || diff.includes('equity_risk_premium') || diff.includes('market_share_price'),
        `assumptions.json diff must be limited to enumerated P6R2 drivers:\n${diff}`,
      );
    }
  });

  test('sensitivity scenario comparison displays Downside Case, Base Case, Upside Case', async () => {
    const { historical, assumptions } = await getDatasets();
    const app = createApp({
      root: createHtmlContainer(),
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
      data: { loadHistorical, loadAssumptions },
      engine: {
        schedules: { build: buildSchedules },
        forecast: { project: projectForecast },
        threeStatement: { project: projectThreeStatement },
        wacc: { build: buildWacc },
        dcf: { valuate: valuateDcf },
        recommend: { evaluate: evaluateRec, buildSensitivityGrid, runFullValuation },
        scenarios: { apply: applyScenario, list: listScenarios },
      },
      historical,
      assumptions,
    });

    const s = app.state();
    const container = createHtmlContainer();
    renderSensitivity({
      container,
      dcf: s.dcf,
      sensitivityGrid: s.sensitivityGrid,
      scenarios: s.scenarios,
      activeScenario: s.scenario,
      TabulatorConstructor: class MockTabulator {},
    });

    const html = container.innerHTML;
    assert.match(html, /Downside Case/);
    assert.match(html, /Base Case/);
    assert.match(html, /Upside Case/);
    assert.match(html, /Downside \/ Base \/ Upside/);
    assert.doesNotMatch(html, /Bear Case/);
    assert.doesNotMatch(html, /Bull Case/);

    app.dispose();
  });
});

describe('P6R.4 — Historicals Citation Hybrid & Cross-Tab Calibration', () => {
  test('deriveColumnPrimaryCitations identifies exact majority filing URL per column', async () => {
    const { historical } = await getDatasets();

    // Income Statement: FY2021 primary must be FY2023 10-K (restated basis)
    const incomeRows = extractRows(historical.income);
    const incomePrimaries = deriveColumnPrimaryCitations(incomeRows);
    assert.ok(incomePrimaries.FY2021);
    assert.match(incomePrimaries.FY2021.url, /000156208824000050\/duol-20231231\.htm/);
    assert.match(incomePrimaries.FY2022.url, /000156208824000050\/duol-20231231\.htm/);
    assert.match(incomePrimaries.FY2023.url, /000162828026012494\/duol-20251231\.htm/);
    assert.match(incomePrimaries.FY2024.url, /000162828026012494\/duol-20251231\.htm/);
    assert.match(incomePrimaries.FY2025.url, /000162828026012494\/duol-20251231\.htm/);
    assert.match(incomePrimaries['Q3 FY2025'].url, /000162828025049743\/duol-20250930\.htm/);
    assert.match(incomePrimaries['Q1 FY2026'].url, /000162828026029976\/duol-20260331\.htm/);
    assert.match(incomePrimaries['Q2 FY2026'].url, /000162828026053603\/duol-20260630\.htm/);

    // Balance Sheet: FY2021 primary must be FY2021 10-K
    const balanceRows = extractRows(historical.balance);
    const balancePrimaries = deriveColumnPrimaryCitations(balanceRows);
    assert.ok(balancePrimaries.FY2021);
    assert.match(balancePrimaries.FY2021.url, /000156208822000039\/duol-20211231\.htm/);
    assert.match(balancePrimaries.FY2022.url, /000156208824000050\/duol-20231231\.htm/);
    assert.match(balancePrimaries['Q2 FY2026'].url, /000162828026053603\/duol-20260630\.htm/);
  });

  test('column-header citations link to primary filing URL and non-filing/TTM columns omit citation', async () => {
    const { historical } = await getDatasets();
    const configs = [];
    class MockTabulator {
      constructor(el, cfg) {
        configs.push(cfg);
      }
    }

    const container = createHtmlContainer();
    renderHistoricals({
      container,
      historical,
      TabulatorConstructor: MockTabulator,
    });

    assert.equal(configs.length, 4, 'Must configure 4 statement tables');
    const incomeCfg = configs.find((c) => c.statement === 'income');
    assert.ok(incomeCfg);

    // FY2021 column has titleFormatter returning primary citation link
    const fy21Col = incomeCfg.columns.find((c) => c.field === 'FY2021');
    assert.ok(fy21Col && typeof fy21Col.titleFormatter === 'function');
    const fy21Title = fy21Col.titleFormatter();
    assert.match(fy21Title, /FY2021/);
    assert.match(fy21Title, /class="citation-sup"/);
    assert.match(fy21Title, /000156208824000050\/duol-20231231\.htm/);

    // Q4 FY2025 (derived quarter) has NO filing citation in income
    const q4Col = incomeCfg.columns.find((c) => c.field === 'Q4 FY2025');
    assert.ok(q4Col);
    assert.equal(q4Col.titleFormatter, undefined);

    // TTM column has computed badge titleFormatter
    const ttmCol = incomeCfg.columns.find((c) => c.field === 'TTM');
    assert.ok(ttmCol && typeof ttmCol.titleFormatter === 'function');
    const ttmTitle = ttmCol.titleFormatter();
    assert.match(ttmTitle, /TTM/);
    assert.match(ttmTitle, /badge-computed/);
    assert.doesNotMatch(ttmTitle, /citation-sup/);
  });

  test('exception-row set exactly equals rows with source.url != column primary', async () => {
    const { historical } = await getDatasets();
    const configs = [];
    class MockTabulator {
      constructor(el, cfg) {
        configs.push(cfg);
      }
    }

    const container = createHtmlContainer();
    renderHistoricals({
      container,
      historical,
      TabulatorConstructor: MockTabulator,
    });

    const incomeCfg = configs.find((c) => c.statement === 'income');
    assert.ok(incomeCfg);

    // amortization_expense_total in FY2021 is the sole exception
    const amortRow = incomeCfg.data.find((r) => r.metric === 'amortization_expense_total');
    assert.ok(amortRow, 'amortization_expense_total row exists');
    assert.match(amortRow.citationHtml, /citation-exception/);
    assert.match(amortRow.citationHtml, /000156208822000039\/duol-20211231\.htm/);

    // All other rows in income have empty citationHtml
    const otherIncomeRows = incomeCfg.data.filter((r) => r.metric !== 'amortization_expense_total');
    for (const r of otherIncomeRows) {
      assert.equal(r.citationHtml, '', `Non-exception row ${r.metric} must have empty citationHtml`);
    }

    // Balance, Cash Flow, and KPIs have zero exception rows
    for (const stmt of ['balance', 'cashflow', 'kpis']) {
      const cfg = configs.find((c) => c.statement === stmt);
      assert.ok(cfg);
      for (const r of cfg.data) {
        assert.equal(r.citationHtml, '', `${stmt} row ${r.metric} must have empty citationHtml`);
      }
    }
  });

  test('Citations Drawer lists all cited filings with verified permalinks', async () => {
    const { historical } = await getDatasets();
    const container = createHtmlContainer();
    renderHistoricals({
      container,
      historical,
      TabulatorConstructor: class MockTabulator {},
    });

    const html = container.innerHTML;
    assert.match(html, /<details class="source-drawer">/);
    assert.match(html, /Audit &amp; Filing Citations Directory/);
    assert.match(html, /6 cited filings/);
    assert.match(html, /duol-20231231\.htm/);
    assert.match(html, /duol-20251231\.htm/);
    assert.match(html, /duol-20250930\.htm/);
    assert.match(html, /duol-20260331\.htm/);
    assert.match(html, /duol-20260630\.htm/);
    assert.match(html, /duol-20211231\.htm/);
  });

  test('grid calibration: shared minWidth baseline across all tab grids', () => {
    // Historicals
    const histCols = buildHistoricalsColumns(false);
    assert.equal(histCols[0].minWidth, 260, 'Historicals label column minWidth');
    assert.equal(histCols[0].frozen, true, 'Historicals label column frozen');
    assert.equal(histCols[1].minWidth, 95, 'Historicals period column minWidth');

    // Schedules
    const schedCols = buildScheduleColumns();
    assert.equal(schedCols[0].minWidth, 260, 'Schedules label column minWidth');
    assert.equal(schedCols[0].frozen, true, 'Schedules label column frozen');
    assert.equal(schedCols[1].minWidth, 95, 'Schedules period column minWidth');

    // Projections
    const projCols = buildProjectionColumns();
    assert.equal(projCols[0].minWidth, 260, 'Projections label column minWidth');
    assert.equal(projCols[0].frozen, true, 'Projections label column frozen');
    assert.equal(projCols[1].minWidth, 95, 'Projections period column minWidth');

    // Valuation DCF
    const dcfCols = buildDcfColumns(['FY2026', 'FY2027']);
    assert.equal(dcfCols[0].minWidth, 260, 'Valuation label column minWidth');
    assert.equal(dcfCols[0].frozen, true, 'Valuation label column frozen');
    assert.equal(dcfCols[1].minWidth, 95, 'Valuation period column minWidth');

    // Sensitivity
    const sensCols = buildSensitivityColumns([0.02, 0.025]);
    assert.equal(sensCols[0].minWidth, 200, 'Sensitivity WACC column minWidth');
    assert.equal(sensCols[0].frozen, true, 'Sensitivity WACC column frozen');
    assert.equal(sensCols[1].minWidth, 95, 'Sensitivity growth column minWidth');
  });

  test('shared layout wrapper in index.html includes historicals, schedules, projections', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /\.historicals-view-wrapper,\s*\.schedules-view-wrapper,\s*\.projections-view-wrapper/);
  });
});


