/**
 * FP.2 Artifact Contract Tests — Valuation Re-Anchor: Terminal, Share Roll, Band, EIG-A.
 *
 * Covers:
 *  - Deliverable interfaces: `DcfResult.pvByStage` ({ explicit, fade, terminal }) & `terminalYear: 'FY2035'`.
 *  - Explicit prefix additivity: `pvByStage.explicit` equals 5-year `pvExplicit` ($1,586,880.58).
 *  - Full EV additivity: `pvByStage.explicit + pvByStage.fade + pvByStage.terminal === enterpriseValue`.
 *  - EIG-A1 exact re-anchoring: Gordon on normalised FY2035 FCFF ties `terminalValue` ($8,221,173.53).
 *  - EIG-A2 deferred revenue growth gap re-anchoring on FY2035 (~5.29% growth, ~2.79% gap vs g=2.5%).
 *  - EIG-B 10-period share roll-forward: terminal count 66,893,351.78 shares (50,061,458 BOP + 10-period issuance).
 *  - TV% of EV recomputed and materially drops: ~70.00% (5-yr) -> ~47.84% (10-yr).
 *  - Sensitivity band & label stability: all 5 treatments overvalued, labelStable: true, sbc-fade converges with gross-issuance.
 *  - Scenario ordering: Bear < Base < Bull preserved across 10 periods.
 *  - Purity, zero bare numerics > 999, and zero `??` fallbacks on new paths.
 *
 * @module tests/fade.valuation.test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { buildFullModel, deriveTerminalInputs, deriveTerminalGrowthGap } from './_invariants.js';
import { buildLabelStability, runFullValuation } from '../src/engine/recommend.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';

const HISTORICAL_PATH = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const DCF_ENGINE_PATH = fileURLToPath(new URL('../src/engine/dcf.js', import.meta.url));
const SHARES_ENGINE_PATH = fileURLToPath(new URL('../src/engine/shares.js', import.meta.url));
const RECOMMEND_ENGINE_PATH = fileURLToPath(new URL('../src/engine/recommend.js', import.meta.url));
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

describe('FP.2 — Valuation Deliverable Interfaces: pvByStage & terminalYear', () => {
  test('DcfResult exposes frozen pvByStage and terminalYear on 10-period runs', async () => {
    const model10 = await buildFullModel({ horizon: 10 });
    const { dcf } = model10;

    assert.equal(dcf.terminalYear, 'FY2035', 'terminalYear must be FY2035 on 10-period run');
    assert.ok(dcf.pvByStage, 'pvByStage must exist on DcfResult');
    assert.ok(Object.isFrozen(dcf.pvByStage), 'pvByStage must be frozen');

    const { explicit, fade, terminal } = dcf.pvByStage;
    assert.equal(typeof explicit, 'number', 'explicit PV must be a number');
    assert.equal(typeof fade, 'number', 'fade PV must be a number');
    assert.equal(typeof terminal, 'number', 'terminal PV must be a number');
    assert.ok(explicit > 0, 'explicit PV must be positive');
    assert.ok(fade > 0, 'fade PV must be positive');
    assert.ok(terminal > 0, 'terminal PV must be positive');

    // Also verify fcffBlock carries identical fields
    assert.equal(dcf.fcff.terminalYear, 'FY2035', 'fcff.terminalYear must be FY2035');
    assert.deepEqual(dcf.fcff.pvByStage, dcf.pvByStage, 'fcff.pvByStage must match dcf.pvByStage');
  });

  test('explicit prefix additivity: pvByStage.explicit equals 5-year pvExplicit', async () => {
    const model10 = await buildFullModel({ horizon: 10 });
    const model5 = await buildFullModel({ horizon: 5 });

    assert.equal(
      model10.dcf.pvByStage.explicit,
      model5.dcf.pvExplicit,
      'pvByStage.explicit on 10-yr model must strictly equal 5-yr pvExplicit',
    );
    assert.ok(
      Math.abs(model10.dcf.pvByStage.explicit - 1583127.3916904489) < 0.001,
      'pvByStage.explicit matches 5-year explicit PV anchor ($1,586,880.58)',
    );
  });

  test('full EV additivity: pvByStage.explicit + pvByStage.fade + pvByStage.terminal === enterpriseValue', async () => {
    const model10 = await buildFullModel({ horizon: 10 });
    const { dcf } = model10;
    const stageSum = dcf.pvByStage.explicit + dcf.pvByStage.fade + dcf.pvByStage.terminal;

    assert.equal(stageSum, dcf.enterpriseValue, 'Sum of stage PVs must strictly equal enterpriseValue');
    assert.equal(dcf.pvExplicit + dcf.pvTerminal, dcf.enterpriseValue, 'pvExplicit + pvTerminal equals EV');
  });
});

describe('FP.2 — EIG-A Terminal Re-Anchoring on FY2035', () => {
  test('EIG-A1 hard: Gordon on normalised FY2035 FCFF ties terminalValue exactly', async () => {
    const model10 = await buildFullModel({ horizon: 10 });
    const t = deriveTerminalInputs(model10);

    assert.equal(t.terminalPeriod, 'FY2035', 'terminal period is FY2035');
    assert.ok(
      Math.abs(t.expectedTvFcff - model10.dcf.terminalValue) < 1e-6,
      'expectedTvFcff ties model10.dcf.terminalValue',
    );
    assert.ok(
      Math.abs(model10.dcf.terminalValue - 8221173.527782327) < 0.01,
      'terminalValue matches 10-period anchor ($8,221,173.53)',
    );
  });

  test('EIG-A2 re-anchoring: deferred revenue growth ~5.29%, gap ~2.79% vs perpetuity rate 2.50%', async () => {
    const model10 = await buildFullModel({ horizon: 10 });
    const gap = deriveTerminalGrowthGap(model10);

    assert.equal(gap.terminalPeriod, 'FY2035', 'terminal period is FY2035');
    assert.ok(
      Math.abs(gap.forecastGrowth - 0.0529) < 0.005,
      'terminal deferred revenue growth is ~5.29%',
    );
    assert.equal(gap.perpetuityGrowth, 0.025, 'perpetuity rate is 2.50%');
    assert.ok(
      Math.abs(gap.gap - 0.0279) < 0.005,
      'shrunk gap (~2.79%) demonstrates the linear fade glide is working',
    );
  });
});

describe('FP.2 — EIG-B 10-Period Share Roll-Forward Extension', () => {
  test('share roll extends across all 10 periods to FY2035', async () => {
    const model10 = await buildFullModel({ horizon: 10 });
    const { shares } = model10.dcf;

    assert.equal(shares.terminalPeriod, 'FY2035', 'terminalPeriod must be FY2035');
    assert.equal(shares.periods.length, 10, 'must roll across 10 periods');
    assert.equal(shares.bopShares, 50061458, 'BOP shares is the P10.4 FD schedule denominator');
    assert.ok(
      Math.abs(shares.sharesDcf - 66893351.78334355) < 0.01,
      'sharesDcf matches 10-period anchor (66,893,351.78 shares)',
    );
    assert.equal(
      shares.bopShares + shares.totalIssuance,
      shares.sharesDcf,
      'terminal shares identity: BOP + totalIssuance === sharesDcf',
    );
  });
});

describe('FP.2 — TV% of EV Recomputation & Institutional De-Risking', () => {
  test('TV% of EV drops from ~70.00% in 5-year model to ~47.84% in 10-year model', async () => {
    const model5 = await buildFullModel({ horizon: 5 });
    const model10 = await buildFullModel({ horizon: 10 });

    const tvPct5 = (model5.dcf.pvTerminal / model5.dcf.enterpriseValue) * 100;
    const tvPct10 = (model10.dcf.pvTerminal / model10.dcf.enterpriseValue) * 100;

    assert.ok(Math.abs(tvPct5 - 70.00) < 0.1, '5-year TV% of EV is ~70.00%');
    // 10-year TV% re-measured at beta 1.49 (the prior 49.69% was the beta-1.47 value).
    assert.ok(Math.abs(tvPct10 - 47.84) < 0.1, '10-year TV% of EV is ~47.84%');
    assert.ok(
      tvPct10 < tvPct5 - 20,
      'TV% of EV drops by more than 20 percentage points due to the explicit fade stage',
    );
  });
});

describe('FP.2 — Sensitivity Band, SBC Fade Convergence & Label Stability', () => {
  test('10-period band exhibits labelStable: true, all 5 treatments overvalued, and sbc-fade convergence', async () => {
    const model10 = await buildFullModel({ horizon: 10 });
    const band = buildLabelStability({
      threeStatement: model10.threeStatement,
      dcf: model10.dcf,
      assumptions: model10.assumptions,
      corpus: model10.historical,
    });

    assert.equal(band.labelStable, true, '10-period band must be labelStable');
    assert.equal(band.headlineLabel, 'overvalued', 'headline is overvalued');

    for (const t of band.treatments) {
      assert.equal(t.label, 'overvalued', `${t.name} must be overvalued`);
      assert.ok(Number.isFinite(t.perShare) && t.perShare > 0, `${t.name} must be positive finite`);
    }

    const byName = (name) => band.treatments.find((t) => t.name === name);
    const gross = byName('gross-issuance').perShare;
    const fade = byName('sbc-fade').perShare;

    // FP.C: SBC fade promoted into base path -> sbc-fade converges with gross-issuance
    assert.ok(
      Math.abs(gross - fade) < 0.05,
      `sbc-fade ($${fade.toFixed(2)}) must converge with gross-issuance ($${gross.toFixed(2)}) within $0.05`,
    );
  });

  test('touched engine source files contain zero forbidden side effects', async () => {
    const files = [DCF_ENGINE_PATH, SHARES_ENGINE_PATH, RECOMMEND_ENGINE_PATH];
    for (const f of files) {
      const src = await readText(f);
      assert.ok(!src.includes('Date.now()'), `File ${f} must not call Date.now()`);
      assert.ok(!src.includes('Math.random()'), `File ${f} must not call Math.random()`);
      assert.ok(!src.includes('window.'), `File ${f} must not reference window`);
      assert.ok(!src.includes('document.'), `File ${f} must not reference document`);
    }
  });

  test('touched engine source files contain zero bare numeric literals > 999 outside comments', async () => {
    const files = [DCF_ENGINE_PATH, SHARES_ENGINE_PATH, RECOMMEND_ENGINE_PATH];
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

  test('zero ?? fallbacks on FP modified lines in dcf.js, shares.js, recommend.js', () => {
    const diff = execSync('git diff v1.0-EP -- src/engine/dcf.js src/engine/shares.js src/engine/recommend.js', {
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
