/**
 * Automated test suite for Task P6R2.4: FCFF/FCFE Dual-Path DCF & DCF Schedule Presentation.
 *
 * Validates:
 * 1. Additive `fcff` companion line in `src/engine/threeStatement.js`.
 * 2. Dual-path DCF engine in `src/engine/dcf.js` (`fcff`, `fcfe`, `equivalence`, `legacy`).
 * 3. Headline switch to FCFF basis (correct economics, eliminating cash pile double count).
 * 4. Finding E terminal column restructure in `src/ui/valuationTab.js` and DOM reconstruction.
 * 5. Basis isolation and debt-free convergence theorem.
 *
 * @module tests/dcf.dualpath.test
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { loadHistorical, loadAssumptions } = await import('../src/data/loader.js');
const { build: buildSchedules } = await import('../src/engine/schedules.js');
const { project: projectForecast } = await import('../src/engine/forecast.js');
const { project: projectThreeStatement } = await import('../src/engine/threeStatement.js');
const { build: buildWacc } = await import('../src/engine/wacc.js');
const { valuate: valuateDcf } = await import('../src/engine/dcf.js');
const { apply: applyScenario } = await import('../src/engine/scenarios.js');
const { buildDcfColumns, renderValuation } = await import('../src/ui/valuationTab.js');

const readText = (loc) => fs.promises.readFile(loc, 'utf8');
const historical = await loadHistorical({ readText });
const assumptions = await loadAssumptions({ readText });

function getValuation(scenName = 'base') {
  const activeAssump = scenName === 'base' ? assumptions : applyScenario(assumptions, scenName);
  const sched = buildSchedules(historical, activeAssump);
  const fc = projectForecast({ historical, assumptions: activeAssump });
  const ts = projectThreeStatement(sched, activeAssump, fc);
  const wacc = buildWacc({ assumptions: activeAssump, debtSchedule: sched.debt });
  const dcf = valuateDcf(ts, wacc, { assumptions: activeAssump, corpus: historical });
  return { sched, fc, ts, wacc, dcf, assump: activeAssump };
}

describe('P6R2.4  -  Three-Statement FCFF Companion Line', () => {
  const { ts, assump } = getValuation('base');
  const taxRate = assump.get('effective_tax_rate').value;

  test('every forecast period in cashFlow.byPeriod gains fcff companion line', () => {
    for (const period of ts.periods) {
      const cfPeriod = ts.cashFlow.byPeriod[period];
      assert.ok(cfPeriod.fcff, `period ${period} must have fcff line`);
      assert.ok(Number.isFinite(cfPeriod.fcff.value), `period ${period} fcff.value must be finite`);
      assert.ok(cfPeriod.free_cash_flow, `period ${period} must preserve free_cash_flow`);
    }
  });

  test('basis isolation: sum of |fcff − fcfe| equals after-tax interest income exactly', () => {
    for (const period of ts.periods) {
      const cfPeriod = ts.cashFlow.byPeriod[period];
      const isPeriod = ts.incomeStatement.byPeriod[period];

      const fcfeVal = cfPeriod.free_cash_flow.value;
      const fcffVal = cfPeriod.fcff.value;
      const interestVal = isPeriod.interest_income.value;
      const expectedDiff = interestVal * (1 - taxRate);

      const actualDiff = fcfeVal - fcffVal;
      assert.ok(
        Math.abs(actualDiff - expectedDiff) < 1e-6,
        `period ${period}: expected after-tax interest ${expectedDiff}, got ${actualDiff}`,
      );
    }
  });

  test('bopBalanceSheet is attached and exposes latest filed Q2 FY2026 cash balances', () => {
    const bop = ts.bopBalanceSheet || ts.supporting?.bopBalanceSheet;
    assert.ok(bop, 'threeStatement must expose bopBalanceSheet');
    assert.equal(bop.cash_and_cash_equivalents, 1180887, 'Q2 FY2026 cash must be 1,180,887');
    assert.equal(bop.short_term_investments, 132979, 'Q2 FY2026 STI must be 132,979');
    assert.equal(bop.long_term_investments, 102693, 'Q2 FY2026 LTI must be 102,693');
  });
});

describe('P6R2.4  -  Dual-Path DCF Engine (FCFF Headline & FCFE Floor)', () => {
  const { dcf } = getValuation('base');

  test('dcf output exposes fcff, fcfe, equivalence, and legacy blocks', () => {
    assert.ok(dcf.fcff, 'dcf must expose fcff block');
    assert.ok(dcf.fcfe, 'dcf must expose fcfe block');
    assert.ok(dcf.equivalence, 'dcf must expose equivalence block');
    assert.ok(dcf.legacy, 'dcf must expose legacy block');
    assert.equal(dcf.basis, 'fcff', 'headline basis must be fcff');
  });

  test('headline fields switch to FCFF basis', () => {
    assert.equal(dcf.perShare, dcf.fcff.perShare, 'headline perShare must match fcff.perShare');
    assert.equal(dcf.enterpriseValue, dcf.fcff.enterpriseValue, 'headline EV must match fcff.enterpriseValue');
    assert.equal(dcf.equityValue, dcf.fcff.equityValue, 'headline equityValue must match fcff.equityValue');
    assert.equal(dcf.netCash, dcf.fcff.netCashToday, 'headline netCash must match fcff.netCashToday');
    assert.equal(dcf.netCash, 1416559, 'today net cash must be 1,416,559');
  });

  test('FCFE path adds ZERO cash in its bridge', () => {
    assert.equal(dcf.fcfe.equityValue, dcf.fcfe.pvExplicit + dcf.fcfe.pvTerminal);
    const shares = dcf.sharesOutstanding;
    assert.equal(dcf.fcfe.perShare, (dcf.fcfe.equityValue * 1000) / shares);
  });

  test('dual-path convergence: FCFF headline < legacy mixed-basis (double-count retired)', () => {
    assert.ok(
      dcf.fcff.perShare < dcf.legacy.perShare,
      `FCFF per share (${dcf.fcff.perShare}) must be less than legacy (${dcf.legacy.perShare})`,
    );
    // Base: $118.60 < $162.34 (EP.3 normalised terminal, rolled shares)
    assert.ok(Math.abs(dcf.fcff.perShare - 118.601677) < 0.01, `Base FCFF perShare ~118.60 (got ${dcf.fcff.perShare})`);
    assert.ok(Math.abs(dcf.legacy.perShare - 162.336313) < 0.01, `Base legacy perShare ~162.34 (got ${dcf.legacy.perShare})`);
  });

  test('equivalence block confirms debt-free theorem and quantifies divergence', () => {
    assert.equal(dcf.equivalence.debtFree, true);
    assert.match(dcf.equivalence.statement, /At D = 0, WACC ≡ Re/);
    const expectedDivergence = dcf.fcff.perShare - dcf.fcfe.perShare;
    assert.ok(
      Math.abs(dcf.equivalence.divergence - expectedDivergence) < 1e-9,
      'equivalence.divergence must match fcff.perShare - fcfe.perShare',
    );
  });

  test('scenario ordering is strictly preserved under FCFF headline', () => {
    const bear = getValuation('bear').dcf;
    const base = getValuation('base').dcf;
    const bull = getValuation('bull').dcf;

    assert.ok(
      bear.perShare < base.perShare && base.perShare < bull.perShare,
      `Strict ordering Bear (${bear.perShare}) < Base (${base.perShare}) < Bull (${bull.perShare})`,
    );
    assert.ok(Math.abs(bear.perShare - 72.383596) < 0.01, `Bear perShare ~72.38 (got ${bear.perShare})`);
    assert.ok(Math.abs(base.perShare - 118.601677) < 0.01, `Base perShare ~118.60 (got ${base.perShare})`);
    assert.ok(Math.abs(bull.perShare - 217.983871) < 0.01, `Bull perShare ~217.98 (got ${bull.perShare})`);
  });
});

describe('P6R2.4  -  Finding E Presentation Restructure & DOM Reconstruction', () => {
  test('buildDcfColumns renders Terminal Year (Gordon) header', () => {
    const cols = buildDcfColumns(['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']);
    const termCol = cols.find((c) => c.field === 'Terminal');
    assert.ok(termCol, 'Terminal column must exist');
    assert.equal(termCol.title, 'Terminal Year (Gordon)', 'Terminal column header must be Terminal Year (Gordon)');
  });

  test('renderValuation DOM reconstruction: terminal capitalization identity holds', () => {
    const { wacc, dcf, assump } = getValuation('base');
    const container = {
      innerHTML: '',
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    renderValuation({
      container,
      wacc,
      dcf,
      assumptions: assump,
      TabulatorConstructor: class MockTabulator {
        constructor(el, config) {
          this.config = config;
        }
      },
    });

    // Check that schedule HTML includes FCFF header and dual-path card
    assert.match(container.innerHTML, /FCFF Basis/i, 'Schedule header must indicate FCFF Basis');
    assert.match(container.innerHTML, /dual-path-card/, 'Dual path card must be present');
    assert.match(container.innerHTML, /HEADLINE MODEL ANSWER/, 'Headline badge must be present');
    assert.match(container.innerHTML, /DISCLOSED FLOOR/, 'Disclosed floor badge must be present');
    assert.match(container.innerHTML, /Debt-Free Equivalence Theorem/, 'Equivalence theorem must be present');

    // DOM Reconstruction of terminal column rows (EP.3 normalised terminal):
    const norm = dcf.fcff.terminalNormalization;
    const termFcf = (dcf.schedule[dcf.schedule.length - 1].fcf - norm.wcInflowTerminal + norm.wcInflowSteadyState) * (1 + dcf.terminalGrowthRate);
    const multiple = 1 / (dcf.wacc - dcf.terminalGrowthRate);
    const tvUndiscounted = termFcf * multiple;
    const df_T = dcf.schedule[dcf.schedule.length - 1].discountFactor;
    const pvTv = tvUndiscounted * df_T;

    assert.ok(Math.abs(pvTv - dcf.pvTerminal) < 1e-6, 'PV(TV) = termFcf * multiple * df_T');
  });
});
