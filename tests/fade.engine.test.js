/**
 * FP.1 Artifact Contract tests — Fade Driver Architecture + Horizon Extension.
 *
 * Covers:
 *  - Stage identity contract: `forecast.stages` and `output.stages` ({ explicit, fade }).
 *  - Additive non-breaking fade lines: `{ ...line, stage: 'fade' }` on fade periods only.
 *  - Additivity proof: FY2026–FY2030 outputs byte-identical between 5-period and 10-period runs.
 *  - Monotonicity: fade growth non-increasing and lands exactly on the 4.0% floor at FY2035.
 *  - Ordering gate: explicit growth (18.39%) > fade floor (4.0%) > terminal g (2.5%),
 *    asserted from drivers with fail-closed tests on gate breach.
 *  - SBC fade: linear glide to steady-state SBC ratio across FY2031–FY2035.
 *  - EIG-D articulation green across all 10 periods (121/121 checks).
 *  - Engine purity, zero-literal gate, and zero `??` fallbacks on new paths.
 *
 * @module tests/fade.engine.test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import {
  FORECAST_HORIZON_MAX,
  FADE_STAGE_LENGTH,
  FADE_START_INDEX,
  FORECAST_STAGES,
} from '../src/data/constants.js';
import forecast, { stages, project } from '../src/engine/forecast.js';
import { build as buildSchedules } from '../src/engine/schedules.js';
import { project as projectThreeStatement } from '../src/engine/threeStatement.js';
import { checkForecastArticulation } from '../src/engine/invariants.js';
import { EngineError } from '../src/data/errors.js';

const HISTORICAL_PATH = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const FORECAST_ENGINE_PATH = fileURLToPath(new URL('../src/engine/forecast.js', import.meta.url));
const SCHEDULES_ENGINE_PATH = fileURLToPath(new URL('../src/engine/schedules.js', import.meta.url));
const THREE_STATEMENT_PATH = fileURLToPath(new URL('../src/engine/threeStatement.js', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const readText = (p) => fs.promises.readFile(p, 'utf8');

async function getHistorical() {
  return loadHistorical({
    location: HISTORICAL_PATH,
    readText,
  });
}

async function getAssumptions() {
  return loadAssumptions({
    location: ASSUMPTIONS_PATH,
    readText,
  });
}

describe('FP.1 — Stage Identity & Contract Architecture', () => {
  test('constants.js exports required fade stage primitives', () => {
    assert.equal(FORECAST_HORIZON_MAX, 10, 'FORECAST_HORIZON_MAX must be 10');
    assert.equal(FADE_STAGE_LENGTH, 5, 'FADE_STAGE_LENGTH must be 5');
    assert.equal(FADE_START_INDEX, 5, 'FADE_START_INDEX must be 5');
    assert.ok(FORECAST_STAGES.explicit, 'FORECAST_STAGES.explicit must exist');
    assert.ok(FORECAST_STAGES.fade, 'FORECAST_STAGES.fade must exist');
    assert.equal(FORECAST_STAGES.explicit.length, 5);
    assert.equal(FORECAST_STAGES.fade.length, 5);
    assert.equal(FORECAST_STAGES.explicit.startYear, 2026);
    assert.equal(FORECAST_STAGES.explicit.endYear, 2030);
    assert.equal(FORECAST_STAGES.fade.startYear, 2031);
    assert.equal(FORECAST_STAGES.fade.endYear, 2035);
  });

  test('forecast.js exports frozen stages single-source mapping', () => {
    assert.ok(stages, 'forecast.stages must be exported');
    assert.ok(Object.isFrozen(stages), 'stages must be frozen');
    assert.deepEqual(stages.explicit, ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']);
    assert.deepEqual(stages.fade, ['FY2031', 'FY2032', 'FY2033', 'FY2034', 'FY2035']);
    assert.equal(forecast.stages, stages, 'default export must expose stages');
  });

  test('assumptions.json defines additive FP drivers with EST markings and full discipline', async () => {
    const assumptions = await getAssumptions();
    const floor = assumptions.get('paid_subscriber_fade_floor');
    assert.ok(floor, 'paid_subscriber_fade_floor must exist in assumptions.json');
    assert.equal(floor.value, 0.04, 'paid_subscriber_fade_floor default must be 0.04 (4.0%)');
    assert.equal(floor.marking, 'EST', 'paid_subscriber_fade_floor must carry EST marking');
    assert.equal(floor.group, 'revenue', 'paid_subscriber_fade_floor must belong to revenue group');
    assert.ok(floor.notes.includes('FP.D'), 'notes must cite Phase 9 FP.D');

    const sbcFade = assumptions.get('sbc_fade_end_pct_of_revenue');
    assert.ok(sbcFade, 'sbc_fade_end_pct_of_revenue must exist in assumptions.json');
    assert.equal(sbcFade.value, 0.08, 'sbc_fade_end_pct_of_revenue default must be 0.08 (8.0%)');
    assert.equal(sbcFade.marking, 'EST', 'sbc_fade_end_pct_of_revenue must carry EST marking');
    assert.equal(sbcFade.group, 'sbc', 'sbc_fade_end_pct_of_revenue must belong to sbc group');

    const shape = assumptions.get('fade_shape');
    assert.ok(shape, 'fade_shape must exist in assumptions.json');
    assert.equal(shape.value, 'linear', 'fade_shape default must be linear');
    assert.equal(shape.marking, 'EST', 'fade_shape must carry EST marking');
  });
});

describe('FP.1 — Engine Spine Additivity & Invariance', () => {
  test('additivity proof: FY2026–FY2030 outputs are byte-identical between 5-year and 10-year runs', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const output5 = project({
      historical,
      assumptions,
      horizon: 5,
    });

    const output10 = project({
      historical,
      assumptions,
      horizon: 10,
    });

    for (const period of stages.explicit) {
      assert.deepEqual(
        output10.byPeriod[period],
        output5.byPeriod[period],
        `${period} statement block must be strictly identical between 5-year and 10-year forecasts`,
      );
      assert.deepEqual(
        output10.subscribers[period],
        output5.subscribers[period],
        `${period} subscriber block must be strictly identical between 5-year and 10-year forecasts`,
      );
      assert.equal(
        output10.byPeriod[period].stage,
        undefined,
        `Explicit period ${period} must NOT carry stage property (pure additivity)`,
      );
    }
  });

  test('fade periods FY2031–FY2035 carry stage: "fade" additively', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const output = project({
      historical,
      assumptions,
      horizon: 10,
    });

    assert.deepEqual(output.stages.explicit, stages.explicit);
    assert.deepEqual(output.stages.fade, stages.fade);

    for (const period of stages.fade) {
      const pData = output.byPeriod[period];
      assert.equal(pData.stage, 'fade', `${period} byPeriod must have stage: 'fade'`);
      assert.equal(output.subscribers[period].stage, 'fade', `${period} subscribers must have stage: 'fade'`);
      assert.equal(pData.revenue.total.stage, 'fade', `${period} revenue total must have stage: 'fade'`);
      assert.equal(pData.gross_profit.stage, 'fade', `${period} gross profit must have stage: 'fade'`);
      assert.equal(pData.operating_income.stage, 'fade', `${period} operating income must have stage: 'fade'`);
    }
  });
});

describe('FP.1 — Fade Monotonicity & Convergence (FP.D)', () => {
  test('fade growth is monotonically non-increasing and lands exactly on 4.0% floor at FY2035', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const output = project({
      historical,
      assumptions,
      horizon: 10,
    });

    const explicitGrowth = assumptions.getValue('paid_subscriber_growth');
    const floor = assumptions.getValue('paid_subscriber_fade_floor');

    let priorGrowth = explicitGrowth;
    const fadeYears = stages.fade; // FY2031 to FY2035

    fadeYears.forEach((period, idx) => {
      const subs = output.subscribers[period];
      const impliedGrowth = (subs.end / subs.beginning) - 1;

      // Monotonically non-increasing
      assert.ok(
        impliedGrowth <= priorGrowth + 1e-9,
        `Growth in ${period} (${impliedGrowth}) must be <= prior period (${priorGrowth})`,
      );

      // Interpolation formula check: subsGrowth - (subsGrowth - floor) * (step / 5)
      const step = idx + 1;
      const expectedGrowth = explicitGrowth - (explicitGrowth - floor) * (step / 5);
      assert.ok(
        Math.abs(impliedGrowth - expectedGrowth) < 1e-7,
        `Growth in ${period} (${impliedGrowth}) must match linear interpolation (${expectedGrowth})`,
      );

      priorGrowth = impliedGrowth;
    });

    // Exact landing check at FY2035 (step 5 / 5)
    const fy35Subs = output.subscribers.FY2035;
    const fy35Growth = (fy35Subs.end / fy35Subs.beginning) - 1;
    assert.ok(
      Math.abs(fy35Growth - floor) < 1e-9,
      `FY2035 growth (${fy35Growth}) must land exactly on floor (${floor}) without overshoot`,
    );
  });

  test('all revenue segments ride the same fade cascade growth in fade periods', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const output = project({
      historical,
      assumptions,
      horizon: 10,
    });

    const segments = ['advertising', 'duolingo_english_test', 'in_app_purchases', 'other'];

    for (let idx = 0; idx < stages.fade.length; idx++) {
      const period = stages.fade[idx];
      const prevPeriod = idx === 0 ? stages.explicit[stages.explicit.length - 1] : stages.fade[idx - 1];

      const subs = output.subscribers[period];
      const periodGrowth = (subs.end / subs.beginning) - 1;

      for (const seg of segments) {
        const currVal = output.byPeriod[period].revenue.segments[seg].value;
        const prevVal = output.byPeriod[prevPeriod].revenue.segments[seg].value;
        const segGrowth = (currVal / prevVal) - 1;

        assert.ok(
          Math.abs(segGrowth - periodGrowth) < 1e-7,
          `Segment ${seg} growth in ${period} (${segGrowth}) must ride subscriber fade growth (${periodGrowth})`,
        );
      }
    }
  });
});

describe('FP.1 — Ordering Gate & Fail-Closed Discipline', () => {
  test('ordering gate green: explicit (18.39%) > floor (4.0%) > terminal g (2.5%)', async () => {
    const assumptions = await getAssumptions();
    const explicit = assumptions.getValue('paid_subscriber_growth');
    const floor = assumptions.getValue('paid_subscriber_fade_floor');
    const terminal = assumptions.getValue('terminal_growth_rate');

    assert.ok(explicit > floor, `Explicit growth (${explicit}) must be > floor (${floor})`);
    assert.ok(floor > terminal, `Floor (${floor}) must be > terminal growth (${terminal})`);
  });

  test('ordering gate fails closed if floor <= terminal growth rate', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const breachedAssumptions = {
      ...assumptions,
      getValue(name) {
        if (name === 'paid_subscriber_fade_floor') return 0.02; // Breaches terminal (0.025)
        return assumptions.getValue(name);
      },
    };

    assert.throws(
      () => project({ historical, assumptions: breachedAssumptions, horizon: 10 }),
      (err) => err instanceof EngineError && err.code === 'ordering_gate_failed',
      'Must throw ordering_gate_failed when fade floor <= terminal growth rate',
    );
  });

  test('ordering gate fails closed if floor >= explicit subscriber growth', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const breachedAssumptions = {
      ...assumptions,
      getValue(name) {
        if (name === 'paid_subscriber_fade_floor') return 0.25; // Breaches explicit (~0.1839)
        return assumptions.getValue(name);
      },
    };

    assert.throws(
      () => project({ historical, assumptions: breachedAssumptions, horizon: 10 }),
      (err) => err instanceof EngineError && err.code === 'ordering_gate_failed',
      'Must throw ordering_gate_failed when fade floor >= explicit subscriber growth',
    );
  });

  test('ordering gate fails closed if terminal_growth_rate is missing on horizon > 5', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const missingTerminal = {
      ...assumptions,
      getValue(name) {
        if (name === 'terminal_growth_rate') throw new EngineError('missing_driver', 'Missing terminal_growth_rate');
        return assumptions.getValue(name);
      },
    };

    assert.throws(
      () => project({ historical, assumptions: missingTerminal, horizon: 10 }),
      (err) => err instanceof EngineError && err.code === 'missing_driver',
      'Must fail closed when terminal_growth_rate is missing on horizon > 5',
    );
  });
});

describe('FP.1 — SBC Fade Schedule & Three-Statement Extension', () => {
  test('projectSbc glides linearly from explicit target to steady-state endpoint in fade periods', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const forecastOut = project({
      historical,
      assumptions,
      horizon: 10,
    });

    const schedulesOut = buildSchedules(historical, assumptions);

    const threeStatementOut = projectThreeStatement(
      schedulesOut,
      assumptions,
      forecastOut,
    );

    const sbcExplicitPct = assumptions.getValue('sbc_target_pct_of_revenue');
    const sbcEndPct = assumptions.getValue('sbc_fade_end_pct_of_revenue');

    // Explicit periods keep explicit percentage
    for (const period of stages.explicit) {
      const sbcRow = threeStatementOut.supporting.sbc.byPeriod[period];
      assert.ok(Math.abs(sbcRow.sbc_pct_of_revenue.value - sbcExplicitPct) < 1e-6);
    }

    // Fade periods glide linearly to sbcEndPct
    stages.fade.forEach((period, idx) => {
      const sbcRow = threeStatementOut.supporting.sbc.byPeriod[period];
      const step = idx + 1;
      const expectedPct = sbcExplicitPct - (sbcExplicitPct - sbcEndPct) * (step / 5);
      assert.ok(
        Math.abs(sbcRow.sbc_pct_of_revenue.value - expectedPct) < 1e-6,
        `SBC % in ${period} (${sbcRow.sbc_pct_of_revenue.value}) must match glide (${expectedPct})`,
      );
    });

    // Final fade period lands exactly on sbcEndPct
    const fy35Sbc = threeStatementOut.supporting.sbc.byPeriod.FY2035;
    assert.ok(Math.abs(fy35Sbc.sbc_pct_of_revenue.value - sbcEndPct) < 1e-6);
  });

  test('projectSbc fails closed if sbc_fade_end_pct_of_revenue is missing on fade horizon', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const missingSbcFade = {
      ...assumptions,
      getValue(name) {
        if (name === 'sbc_fade_end_pct_of_revenue') throw new EngineError('missing_driver', 'Missing sbc_fade_end_pct_of_revenue');
        return assumptions.getValue(name);
      },
    };

    const forecastOut = project({
      historical,
      assumptions,
      horizon: 10,
    });
    const schedulesOut = buildSchedules(historical, assumptions);

    assert.throws(
      () => projectThreeStatement(schedulesOut, missingSbcFade, forecastOut),
      (err) => err instanceof EngineError,
      'Must throw EngineError when sbc_fade_end_pct_of_revenue is missing on horizon > 5',
    );
  });

  test('EIG-D articulation green on all 10 periods across three-statement model', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const forecastOut = project({
      historical,
      assumptions,
      horizon: 10,
    });

    const schedulesOut = buildSchedules(historical, assumptions);

    const threeStatementOut = projectThreeStatement(
      schedulesOut,
      assumptions,
      forecastOut,
    );

    const articulation = checkForecastArticulation(threeStatementOut);
    const failures = articulation.filter((e) => e.status !== 'pass');
    assert.equal(failures.length, 0, 'Zero articulation failures allowed across 10 periods');
    assert.ok(articulation.length >= 120, 'Must check >= 120 articulation assertions over 10 periods');
  });
});

describe('FP.1 — Quality Gates: Purity & Anti-Literal', () => {
  test('touched engine source files contain zero forbidden side effects', async () => {
    const files = [FORECAST_ENGINE_PATH, SCHEDULES_ENGINE_PATH, THREE_STATEMENT_PATH];
    for (const f of files) {
      const src = await readText(f);
      assert.ok(!src.includes('Date.now()'), `File ${f} must not call Date.now()`);
      assert.ok(!src.includes('Math.random()'), `File ${f} must not call Math.random()`);
      assert.ok(!src.includes('window.'), `File ${f} must not reference window`);
      assert.ok(!src.includes('document.'), `File ${f} must not reference document`);
    }
  });

  test('touched engine source files contain zero bare numeric literals > 999 outside comments', async () => {
    const files = [
      FORECAST_ENGINE_PATH,
      SCHEDULES_ENGINE_PATH,
      THREE_STATEMENT_PATH,
      fileURLToPath(new URL('../src/engine/scenarios.js', import.meta.url)),
    ];
    for (const f of files) {
      const code = await readText(f);
      const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
      const largeNumbers = [...stripped.matchAll(/\b\d{4,}\b/g)].map((m) => m[0]);
      assert.deepEqual(
        largeNumbers,
        [],
        `${f} must contain zero bare numeric literals > 999 outside comments, found: ${largeNumbers.join(', ')}`,
      );
    }
  });

  test('zero ?? or catch-default fallbacks introduced on new FP paths', () => {
    const diff = execSync('git diff v1.0-EP -- src/engine/forecast.js src/engine/schedules.js src/engine/threeStatement.js src/engine/scenarios.js', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const addedLines = diff
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'));

    for (const line of addedLines) {
      assert.ok(
        !line.includes('??'),
        `Forbidden "??" fallback introduced on modified line: ${line}`,
      );
      assert.ok(
        !line.includes('catch') || !line.includes('='),
        `Forbidden catch-default assignment introduced on modified line: ${line}`,
      );
    }
  });
});
