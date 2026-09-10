/**
 * EP.1 EIG Suite  -  Economic Identity Gates (D & E live here; A/B/C land red in EP.2/EP.3).
 *
 * Covers docs/phases/economy_phase.md §5 EP.1:
 *  - EIG-D forecast articulation + net-cash bridge: GREEN on the current build
 *    (every row re-derived from raw statement lines, corpus anchor, or BOP cites).
 *  - EIG-E pin sync: GREEN since the EP.3 regen rewrote the e2e header (F4 remediated).
 *    The test below pins the live F4 drift as detected-not-green so the suite
 *    stays truthful without silently blessing a stale docstring. EP.3 flips the
 *    pinned expectations to green alongside tools/regen_pins.mjs.
 *  - EIG-C settlement registry: table declared (SBC → EIG-B pending-EP.2,
 *    D&A → ICF capex settled) with coverage enforcement arriving in EP.2.
 *
 * External truth, not just internal consistency: corpus-seam ties re-derive from
 * raw filing rows, the bridge sum re-derives from raw Q2 balance rows, and the
 * tamper probes prove every green gate can actually fail.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SETTLEMENT_REGISTRY,
  checkForecastArticulation,
  checkNetCashBridge,
  checkSettlementRegistry,
  checkPinSync,
} from '../src/engine/invariants.js';
import { projectShares } from '../src/engine/shares.js';
import {
  evaluate as evaluateRec,
  buildLabelStability,
  runFullValuation,
} from '../src/engine/recommend.js';
import { renderSummary } from '../src/ui/summaryTab.js';
import { StubElement } from './_dom_stub.js';
import {
  PIN_CLAIMS,
  EIG_E_RED_KEYS_EP1,
  EIG_E_GREEN_KEYS_EP1,
  POLICY,
  deriveTerminalInputs,
  deriveTerminalGrowthGap,
  readE2eSource,
  readInvariantsSource,
  buildFullModel,
  deriveLivePins,
  flattenHistoricalRows,
  findRow,
} from './_invariants.js';

const modelPromise = buildFullModel();

function findEntry(report, id) {
  return report.find((row) => row && row.id === id);
}

function stubContainer() {
  const listeners = new Map();
  return {
    innerHTML: '',
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
}

describe('EP.1  -  EIG-D Forecast Articulation (green on current build)', () => {
  test('every articulation row passes on the live model (FY2026–FY2030)', async () => {
    const { threeStatement } = await modelPromise;
    const rows = await flattenHistoricalRows((await modelPromise).historical);
    const report = checkForecastArticulation(threeStatement, { historicalRows: rows });

    assert.ok(Array.isArray(report) && report.length > 0, 'articulation report is non-empty');
    const failed = report.filter((row) => row.status !== 'pass');
    assert.deepEqual(
      failed.map((row) => row.id),
      [],
      `EIG-D must be green on the current build; failures: ${JSON.stringify(failed, null, 2)}`,
    );
    for (const period of threeStatement.periods) {
      assert.ok(findEntry(report, `EIG-D:cash-roll:${period}`), `cash-roll row for ${period}`);
      assert.ok(findEntry(report, `EIG-D:balance-identity:${period}`), `balance row for ${period}`);
    }
  });

  test('hybrid FY2026 rolls the H2 leg from the cited Q2 balance (seam documented)', async () => {
    const { threeStatement } = await modelPromise;
    const rows = await flattenHistoricalRows((await modelPromise).historical);
    const report = checkForecastArticulation(threeStatement, { historicalRows: rows });
    const roll = findEntry(report, 'EIG-D:cash-roll:FY2026');
    assert.ok(roll, 'FY2026 cash-roll row exists');
    assert.equal(roll.status, 'pass', 'FY2026 cash-roll passes');
    assert.equal(roll.details.frame, 'hybrid-h2', 'FY2026 uses the H2 roll frame');
    const h1 = findEntry(report, 'EIG-D:flow-articulation:FY2026:h1');
    assert.ok(h1 && h1.status === 'pass', 'cited H1 flows articulate among themselves');
  });

  test('corpus-seam rows tie cited actuals to raw filing rows (external truth)', async () => {
    const { historical, threeStatement } = await modelPromise;
    const rows = flattenHistoricalRows(historical);

    // Independent recomputation directly from raw corpus rows (no engine lines):
    // FY2025 year-end cash + cited 6M net change === cited Q2 cash anchor.
    const fy2025Cash = findRow(rows, 'cash_and_cash_equivalents', 'FY2025').value;
    const h1Change = findRow(rows, 'net_change_in_cash', '6M FY2026').value;
    const q2Cash = findRow(rows, 'cash_and_cash_equivalents', 'Q2 FY2026').value;
    assert.equal(fy2025Cash + h1Change, q2Cash, 'corpus H1 seam articulates from raw rows');

    const report = checkForecastArticulation(threeStatement, { historicalRows: rows });
    const seam = findEntry(report, 'EIG-D:h1-seam:cash-base');
    assert.ok(seam && seam.status === 'pass', 'module seam row agrees with the corpus path');
    for (const tail of ['bop-cash-tie', 'ocf-tie', 'icf-tie', 'cff-tie', 'net-change-tie']) {
      const row = findEntry(report, `EIG-D:h1-seam:${tail}`);
      assert.ok(row && row.status === 'pass', `seam tie ${tail} passes`);
    }
  });

  test('tampered cash and balance lines flip articulation rows to fail (non-tautology)', async () => {
    const { threeStatement } = await modelPromise;

    const brokenCash = structuredClone(threeStatement);
    brokenCash.cashFlow.byPeriod.FY2027.ending_cash.value += 250;
    const cashReport = checkForecastArticulation(brokenCash);
    assert.equal(
      findEntry(cashReport, 'EIG-D:cash-roll:FY2027')?.status,
      'fail',
      'broken ending cash must fail the FY2027 cash roll',
    );

    const brokenBalance = structuredClone(threeStatement);
    brokenBalance.balanceSheet.byPeriod.FY2028.total_assets.value += 400;
    const balanceReport = checkForecastArticulation(brokenBalance);
    assert.equal(
      findEntry(balanceReport, 'EIG-D:assets-bottom-up:FY2028')?.status,
      'fail',
      'corrupted reported total must fail the FY2028 bottom-up re-derivation',
    );
    assert.equal(
      findEntry(balanceReport, 'EIG-D:balance-identity:FY2028')?.status,
      'pass',
      'component-level A=L+E still holds (corruption is isolated to the total line)',
    );
  });
});

describe('EP.1  -  EIG-BRIDGE Net Cash Bridge (re-derived from BOP raw lines)', () => {
  test('bridge re-derivation ties exactly to the DCF net-cash claim', async () => {
    const { threeStatement, dcf } = await modelPromise;
    const bridge = checkNetCashBridge(threeStatement);

    assert.equal(bridge.status, 'pass', 'bridge identity holds on cited BOP lines');
    assert.equal(
      bridge.rederived.netCashToday,
      dcf.netCash,
      're-derived net cash equals the DCF net-cash claim exactly',
    );
    assert.equal(
      bridge.rederived.netCashToday,
      dcf.bridge.netCash,
      're-derived net cash equals the DCF bridge leg exactly',
    );
    assert.equal(bridge.rederived.debtToday, 0, 'proven-free capital structure resolves zero debt');
  });

  test('bridge components tie to raw Q2 corpus rows (independent recomputation)', async () => {
    const { historical, threeStatement } = await modelPromise;
    const rows = flattenHistoricalRows(historical);
    const cash = findRow(rows, 'cash_and_cash_equivalents', 'Q2 FY2026').value;
    const sti = findRow(rows, 'short_term_investments', 'Q2 FY2026').value;
    const lti = findRow(rows, 'long_term_investments', 'Q2 FY2026').value;
    const rawBridge = cash + sti + lti;

    const bridge = checkNetCashBridge(threeStatement);
    assert.equal(bridge.rederived.cashToday, cash, 'cash leg ties to the raw corpus row');
    assert.equal(
      bridge.rederived.shortTermInvestments,
      sti,
      'STI leg ties to the raw corpus row',
    );
    assert.equal(
      bridge.rederived.longTermInvestments,
      lti,
      'LTI leg ties to the raw corpus row',
    );
    assert.equal(bridge.rederived.netCashToday, rawBridge, 'bridge sum ties to raw rows');
  });
});

describe('EP.2  -  EIG-B Share Roll-Forward Settlement (gross issuance at spot)', () => {
  test('roll identity holds exactly: terminal shares equal BOP plus summed issuance', async () => {
    const { assumptions, threeStatement, historical } = await modelPromise;
    const schedule = projectShares(assumptions, threeStatement, historical);

    let running = schedule.bopShares;
    for (const period of schedule.periods) {
      running += schedule.byPeriod[period].issuance;
    }
    assert.equal(
      schedule.sharesDcf,
      running,
      'terminal count equals BOP plus summed per-period issuance exactly',
    );
    assert.ok(schedule.sharesDcf > schedule.bopShares, 'dilution is applied (never static)');
    assert.equal(
      schedule.byPeriod[schedule.terminalPeriod].shares,
      schedule.sharesDcf,
      'terminal period carries the DCF denominator',
    );
  });

  test('issuance re-derives from raw CF SBC lines, price driver, and money scale', async () => {
    const { assumptions, threeStatement, historical } = await modelPromise;
    const schedule = projectShares(assumptions, threeStatement, historical);
    const price = assumptions.get('market_share_price').value;

    assert.equal(schedule.bopShares, assumptions.get('shares_outstanding').value, 'BOP ties driver');
    assert.equal(schedule.price, price, 'price ties the MKT driver');
    for (const period of schedule.periods) {
      const row = schedule.byPeriod[period];
      const rawSbc =
        period === 'FY2026'
          ? findRow(flattenHistoricalRows(historical), 'cf_stock_based_compensation', '6M FY2026')
              .value +
            threeStatement.cashFlow.byPeriod[period].operating_activities.stock_based_compensation
              .value
          : threeStatement.cashFlow.byPeriod[period].operating_activities.stock_based_compensation
              .value;
      assert.equal(row.sbcEmbedded, rawSbc, `SBC embedded re-derives from raw lines (${period})`);
      assert.equal(
        row.issuance,
        (row.sbcEmbedded * 1000) / price,
        `issuance is SBC × scale ÷ price (${period})`,
      );
    }
  });

  test('hybrid FY2026 composes cited H1 corpus row plus the H2 CF leg (never the half line alone)', async () => {
    const { assumptions, threeStatement, historical } = await modelPromise;
    const schedule = projectShares(assumptions, threeStatement, historical);
    const rows = flattenHistoricalRows(historical);

    const h1 = findRow(rows, 'cf_stock_based_compensation', '6M FY2026').value;
    const h2 =
      threeStatement.cashFlow.byPeriod.FY2026.operating_activities.stock_based_compensation.value;
    const row = schedule.byPeriod.FY2026;
    assert.equal(row.sbcH1, h1, 'H1 leg is the cited corpus row');
    assert.equal(row.sbcH2, h2, 'H2 leg is the CF statement leg');
    assert.equal(row.sbcEmbedded, h1 + h2, 'full-year embedded sums both legs');
    assert.ok(
      Math.abs(row.sbcEmbedded - 152.0 * 1000) / 1000 < 1,
      'FY2026 embedded ≈ $152.0m (contract R2), not the $158.2m annualized schedule',
    );
    assert.notEqual(
      row.sbcEmbedded,
      threeStatement.supporting.sbc.byPeriod.FY2026.sbc_expense.value,
      'CF-statement basis differs from the annualized schedule by construction',
    );
  });

  test('MKT provenance survives on every roll line (BOP and price drivers)', async () => {
    const { assumptions, threeStatement, historical } = await modelPromise;
    const schedule = projectShares(assumptions, threeStatement, historical);
    for (const period of schedule.periods) {
      const provenance = schedule.byPeriod[period].provenance;
      assert.equal(provenance.priceDriver.marking, 'MKT', `price stays MKT (${period})`);
      assert.equal(provenance.bopDriver.marking, 'MKT', `BOP stays MKT (${period})`);
      assert.ok(provenance.priceDriver.asOf, `price as-of present (${period})`);
      assert.ok(provenance.bopDriver.asOf, `BOP as-of present (${period})`);
    }
    const shares = schedule.byPeriod.FY2027.shares;
    assert.ok(
      shares > schedule.byPeriod.FY2026.shares,
      'roll increases strictly period over period',
    );
  });

  test('DCF consumes the rolled terminal count on every per-share path (EIG-C liveness)', async () => {
    const { assumptions, threeStatement, historical, dcf, scenarios } = await modelPromise;
    const schedule = projectShares(assumptions, threeStatement, historical);

    assert.equal(
      dcf.sharesOutstanding,
      schedule.sharesDcf,
      'DCF denominator equals the rolled terminal count exactly',
    );
    assert.equal(
      dcf.perShare,
      (dcf.equityValue * 1000) / dcf.sharesOutstanding,
      'headline per-share recomputes from equity over rolled shares',
    );
    assert.equal(
      dcf.fcfe.perShare,
      (dcf.fcfe.equityValue * 1000) / dcf.sharesOutstanding,
      'floor path uses the same denominator',
    );
    assert.equal(
      dcf.legacy.perShare,
      (dcf.legacy.equityValue * 1000) / dcf.sharesOutstanding,
      'legacy path uses the same denominator',
    );
    assert.ok(
      dcf.sharesOutstanding > dcf.bopSharesOutstanding,
      'rolled count exceeds the static BOP count',
    );
    // Per-scenario rolls differ (SBC target carries scenario deltas): the roll
    // is scenario-aware, not a single static schedule.
    assert.notEqual(
      scenarios.bear.dcf.sharesOutstanding,
      dcf.sharesOutstanding,
      'bear roll differs from base roll (scenario SBC deltas flow through)',
    );
    assert.equal(
      scenarios.bear.dcf.sharesOutstanding,
      scenarios.bear.dcf.shares.sharesDcf,
      'bear DCF consumes its own scenario roll',
    );
  });

  test('fail-closed: missing drivers, missing H1 corpus row, malformed dcf shares', async () => {
    const { assumptions, threeStatement, historical } = await modelPromise;

    assert.throws(
      () => projectShares(null, threeStatement, historical),
      (err) => err.name === 'EngineError',
    );
    assert.throws(
      () => projectShares(assumptions, null, historical),
      (err) => err.name === 'EngineError',
    );
    assert.throws(
      () => projectShares(assumptions, threeStatement, null),
      (err) => err.name === 'EngineError' && err.code === 'missing_corpus_row',
    );
    const noPrice = {
      ...assumptions,
      get: (name) => (name === 'market_share_price' ? null : assumptions.get(name)),
    };
    assert.throws(
      () => projectShares(noPrice, threeStatement, historical),
      (err) => err.name === 'EngineError' && err.code === 'missing_driver',
    );
    const { build: buildWaccLocal } = await import('../src/engine/wacc.js');
    const { valuate: valuateLocal } = await import('../src/engine/dcf.js');
    const waccOut = buildWaccLocal({ assumptions, debtSchedule: (await modelPromise).schedules.debt });
    assert.throws(
      () => valuateLocal(threeStatement, waccOut, { assumptions }),
      (err) => err.name === 'EngineError',
      'hybrid model without corpus must fail closed (no static-share fallback)',
    );
    assert.throws(
      () =>
        valuateLocal(threeStatement, waccOut, {
          assumptions,
          corpus: historical,
          shares: { sharesDcf: Number.NaN },
        }),
      (err) => err.name === 'EngineError' && err.code === 'invalid_shares',
    );
  });
});

describe('EP.3  -  EIG-A Terminal Steady-State Normalisation (red→green)', () => {
  test('EIG-A1 hard: DCF terminalValue equals Gordon on the normalised series (raw re-derivation)', async () => {
    const model = await modelPromise;
    const t = deriveTerminalInputs(model);
    const tol = POLICY.eigA;
    const slack = (expected) => Math.max(tol.absolute, tol.relative * Math.abs(expected));

    assert.ok(
      Math.abs(model.dcf.terminalValue - t.expectedTvFcff) <= slack(t.expectedTvFcff),
      `headline TV must equal Gordon on fcffTNormalised (diff ${model.dcf.terminalValue - t.expectedTvFcff})`,
    );
    assert.ok(
      Math.abs(model.dcf.fcfe.terminalValue - t.expectedTvFcfe) <= slack(t.expectedTvFcfe),
      'floor terminalValue equals Gordon on the normalised floor series',
    );
    // The normalised base is strictly below the raw terminal FCF (inflow removed).
    assert.ok(t.fcffNorm < t.fcffT, 'normalised terminal FCF sits below the raw final-year FCF');
    assert.ok(t.wcInflowT > t.wcInflowSS, 'final-year inflow exceeds the steady-state replacement');
    // Engine cross-tie: the DCF block carries the same normalisation legs.
    const legs = model.dcf.fcff.terminalNormalization;
    assert.equal(legs.fcffTerminalNormalised, t.fcffNorm, 'engine legs match the raw re-derivation');
    assert.equal(legs.wcInflowTerminal, t.wcInflowT, 'engine inflow leg matches');
    assert.equal(legs.wcInflowSteadyState, t.wcInflowSS, 'engine steady-state leg matches');
  });

  test('EIG-A1 detection proof: perturbed NWC moves the expected TV off the engine pin', async () => {
    const model = await modelPromise;
    const mutated = structuredClone(model.threeStatement);
    mutated.supporting.workingCapital.byPeriod.FY2030.net_working_capital.value += 1000;
    const t = deriveTerminalInputs({ ...model, threeStatement: mutated });
    assert.ok(
      Math.abs(t.expectedTvFcff - model.dcf.terminalValue) > 1,
      'NWC perturbation must move the re-derived TV (gate can fail)',
    );
  });

  test('EIG-A1 fail-closed: missing WC schedule throws typed EngineError', async () => {
    const model = await modelPromise;
    const { valuate: valuateLocal } = await import('../src/engine/dcf.js');
    const stripped = structuredClone(model.threeStatement);
    delete stripped.supporting.workingCapital;
    assert.throws(
      () =>
        valuateLocal(stripped, model.wacc, {
          assumptions: model.assumptions,
          corpus: model.historical,
        }),
      (err) => err.name === 'EngineError' && err.code === 'missing_input',
    );
  });

  test('EIG-A2 disclosure present: forecast-vs-perpetuity growth gap surfaced (non-failing)', async () => {
    const model = await modelPromise;
    const gap = deriveTerminalGrowthGap(model);
    assert.ok(gap, 'gap disclosure record exists');
    assert.ok(Math.abs(gap.forecastGrowth - 0.17) < 0.005, 'terminal deferred-revenue growth ≈17.0%');
    assert.equal(gap.perpetuityGrowth, 0.025, 'perpetuity rate is the g driver');
    assert.ok(gap.gap > 0.1, 'material gap is disclosed for the EP.4 labelStable band');
    assert.equal(typeof gap.basis, 'string', 'disclosure carries its basis');
  });
});

describe('EP.3  -  Pin Genesis Stamp (§7: stored hash == recomputed hash)', () => {
  test('stored stamp hash matches recomputed hash over assumptions + engine sources', async () => {
    const { readStamp, hashSources, listStampSources } = await import('../tools/regen_pins.mjs');
    const source = readE2eSource();
    const stamp = readStamp(source);
    assert.ok(stamp, 'pin-genesis stamp block is present in the e2e file');
    assert.ok(Array.isArray(stamp.generatedFrom) && stamp.generatedFrom.length > 0, 'stamp names sources');
    assert.ok(
      stamp.generatedFrom.includes('src/data/assumptions.json'),
      'stamp covers assumptions.json',
    );
    assert.ok(
      stamp.generatedFrom.some((f) => f === 'src/engine/dcf.js'),
      'stamp covers engine sources',
    );
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const recomputed = hashSources(root, listStampSources(root));
    assert.equal(recomputed.hash, stamp.hash, 'stored hash equals recomputed hash');
    const moved = Object.keys(recomputed.files).filter((f) => recomputed.files[f] !== stamp.files[f]);
    assert.deepEqual(moved, [], 'no source file moved under the stamp');
  });

  test('regen is idempotent: synced reruns rewrite nothing (determinism gate)', async () => {
    const { execFileSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const before = readE2eSource();
    execFileSync(process.execPath, ['tools/regen_pins.mjs'], { cwd: root, stdio: 'pipe' });
    const afterFirst = readE2eSource();
    execFileSync(process.execPath, ['tools/regen_pins.mjs'], { cwd: root, stdio: 'pipe' });
    const afterSecond = readE2eSource();
    assert.equal(afterFirst, before, 'regen on synced pins rewrites nothing (first rerun)');
    assert.equal(afterSecond, before, 'regen on synced pins rewrites nothing (second rerun)');
  });
});

describe('EP.1  -  EIG-E Pin Sync (GREEN since EP.3 regen — F4 remediated)', () => {
  test('checkPinSync ties every docstring claim to a live pin (header ≡ assertions by construction)', async () => {
    const model = await modelPromise;
    const live = deriveLivePins(model);
    const report = checkPinSync({ docstring: readE2eSource(), claims: PIN_CLAIMS, live });

    assert.equal(report.length, PIN_CLAIMS.length + 1, 'one row per claim plus summary');
    const summary = findEntry(report, 'EIG-E:pin-sync');
    assert.ok(summary, 'summary row exists');
    assert.equal(summary.status, 'pass', 'EIG-E is green after the EP.3 regen');
    assert.deepEqual(summary.details.failedKeys, [], 'no claim drifts');
    assert.equal(
      summary.details.claimsTotal,
      summary.details.claimsPassed,
      'every claim ties to a live pin',
    );
    for (const key of [...EIG_E_RED_KEYS_EP1, ...EIG_E_GREEN_KEYS_EP1]) {
      assert.equal(
        findEntry(report, `EIG-E:claim:${key}`)?.status,
        'pass',
        `claim ${key} ties post-regen`,
      );
    }
  });

  test('green-state spot checks: docstring claim text equals live engine truth', async () => {
    const model = await modelPromise;
    const live = deriveLivePins(model);
    const report = checkPinSync({ docstring: readE2eSource(), claims: PIN_CLAIMS, live });
    const byId = (key) => findEntry(report, `EIG-E:claim:${key}`);

    const perShare = byId('per_share');
    assert.equal(perShare.status, 'pass', 'per-share claim ties');
    assert.equal(
      perShare.details.docstringValue,
      perShare.details.liveValue,
      'docstring per-share is the live full-precision value',
    );

    const beta = byId('beta');
    assert.equal(beta.status, 'pass', 'beta claim ties');

    const upside = byId('upside_and_label');
    assert.equal(upside.status, 'pass', 'upside and label tie to the live verdict');
  });

  test('checkPinSync discriminates synced versus drifted pins on synthetic evidence', () => {
    const synced = checkPinSync({
      docstring: 'perShare $10.50 and rf 1.25%',
      claims: [
        {
          key: 'per_share',
          description: 'synthetic per-share',
          pattern: /perShare \$([\d.]+)/,
          kind: 'perShare',
          liveKey: 'perShare',
          tolerance: 5e-4,
        },
        {
          key: 'risk_free_rate',
          description: 'synthetic rf',
          pattern: /\brf ([\d.]+)%/,
          kind: 'percent',
          liveKey: 'riskFreeRate',
          tolerance: 0.005,
        },
      ],
      live: { perShare: 10.5, riskFreeRate: 0.0125 },
    });
    assert.equal(
      findEntry(synced, 'EIG-E:pin-sync').status,
      'pass',
      'synced evidence must pass',
    );

    const drifted = checkPinSync({
      docstring: 'perShare $10.50',
      claims: [
        {
          key: 'per_share',
          description: 'synthetic drifted per-share',
          pattern: /perShare \$([\d.]+)/,
          kind: 'perShare',
          liveKey: 'perShare',
          tolerance: 5e-4,
        },
      ],
      live: { perShare: 99.99 },
    });
    assert.equal(
      findEntry(drifted, 'EIG-E:pin-sync').status,
      'fail',
      'drifted evidence must fail',
    );

    const absent = checkPinSync({
      docstring: 'nothing to see here',
      claims: [
        {
          key: 'per_share',
          description: 'synthetic absent per-share',
          pattern: /perShare \$([\d.]+)/,
          kind: 'perShare',
          liveKey: 'perShare',
          tolerance: 5e-4,
        },
      ],
      live: { perShare: 1.0 },
    });
    assert.equal(
      findEntry(absent, 'EIG-E:claim:per_share').details.reason,
      'claim-pattern-absent',
      'absent claim must fail loudly, not silently pass',
    );
  });
});

describe('EP.1  -  EIG-C Settlement Registry (table declared; enforcement EP.2)', () => {
  test('registry declares SBC → EIG-B settled and D&A → ICF capex settled', () => {
    assert.deepEqual(
      SETTLEMENT_REGISTRY,
      [
        { addBack: 'sbc', settlement: 'eig-b', status: 'settled' },
        { addBack: 'd_and_a', settlement: 'icf-capex', status: 'settled' },
      ],
      'registry table matches the EP.2 settled state (F1 dilution paid)',
    );
    assert.ok(Object.isFrozen(SETTLEMENT_REGISTRY), 'registry table is frozen');
  });

  test('registry covers every OCF add-back on the live model (no undeclared add-backs)', async () => {
    const { threeStatement } = await modelPromise;
    const report = checkSettlementRegistry(threeStatement);
    const undeclared = report.filter((row) => row.id.startsWith('EIG-C:undeclared-add-back'));
    assert.deepEqual(
      undeclared.map((row) => row.id),
      [],
      'no operating-activity line escapes the registry',
    );
    const coverage = report.filter((row) =>
      row.id.startsWith('EIG-C:add-back-declared:'),
    );
    assert.ok(coverage.length > 0, 'coverage rows exist');
    assert.ok(
      coverage.every((row) => row.status === 'pass'),
      'every live add-back is declared',
    );
  });

  test('SBC settlement is settled via the EIG-B roll-forward (F1 paid)', async () => {
    const { threeStatement } = await modelPromise;
    const report = checkSettlementRegistry(threeStatement);
    const sbcRow = findEntry(report, 'EIG-C:registry-declaration:sbc');
    assert.ok(sbcRow, 'SBC registry declaration row exists');
    assert.equal(sbcRow.status, 'pass', 'SBC settlement is live in EP.2');
    assert.equal(sbcRow.details.status, 'settled', 'settled status is pinned');
    const dnaRow = findEntry(report, 'EIG-C:registry-declaration:d_and_a');
    assert.ok(dnaRow && dnaRow.status === 'pass', 'D&A settlement is settled via ICF capex');
  });

  test('injected add-back fails coverage (tripwire proves the gate can fail)', async () => {
    const { threeStatement } = await modelPromise;
    const mutated = structuredClone(threeStatement);
    mutated.cashFlow.byPeriod.FY2029.operating_activities.amortization_of_intangibles = {
      value: 999,
    };
    const report = checkSettlementRegistry(mutated);
    const trip = findEntry(report, 'EIG-C:undeclared-add-back:FY2029:amortization_of_intangibles');
    assert.ok(trip && trip.status === 'fail', 'undeclared add-back must fail coverage');
  });
});

describe('EP.2  -  Shares Module Quality Gates', () => {
  test('shares.js purity, literals, freeze, determinism, and oracle isolation', async () => {
    const { assumptions, threeStatement, historical } = await modelPromise;
    const source = (
      await import('node:fs').then((fs) =>
        fs.readFileSync(
          new URL('../src/engine/shares.js', import.meta.url),
          'utf8',
        ),
      )
    );
    assert.doesNotMatch(source, /\bwindow\b/, 'must not reference window');
    assert.doesNotMatch(source, /\bdocument\b/, 'must not reference document');
    assert.doesNotMatch(source, /\bfetch\s*\(/, 'must not call fetch');
    assert.doesNotMatch(source, /\bDate\.now\s*\(/, 'must not call Date.now');
    assert.doesNotMatch(source, /\bMath\.random\s*\(/, 'must not call Math.random');
    assert.doesNotMatch(source, /from\s+['"]node:/, 'must not import node builtins');
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    assert.deepEqual(
      codeOnly.match(/\b\d{4,}\b/g) || [],
      [],
      'zero bare numeric literals > 999 outside comments',
    );
    assert.doesNotMatch(codeOnly, /\?\?\s*[\d.]/, 'zero numeric nullish fallbacks on new paths');
    assert.doesNotMatch(
      source,
      /from\s+['"][^'"]*(dcf|wacc|recommend|sensitivity|scenarios|threeStatement)\.js['"]/,
      'roll module never imports valuation engines',
    );

    const first = projectShares(assumptions, threeStatement, historical);
    assert.ok(Object.isFrozen(first), 'schedule frozen');
    assert.ok(Object.isFrozen(first.byPeriod.FY2030), 'period rows frozen');
    assert.throws(() => {
      first.sharesDcf = 0;
    }, TypeError);
    const second = projectShares(assumptions, threeStatement, historical);
    assert.equal(
      JSON.stringify(second),
      JSON.stringify(first),
      'repeated rolls are byte-identical',
    );
  });
});

describe('EP.1  -  Invariants Module Quality Gates', () => {
  test('purity: zero DOM, zero fetch, zero Date.now, zero Math.random, zero node imports', () => {
    const source = readInvariantsSource();
    assert.doesNotMatch(source, /\bwindow\b/, 'must not reference window');
    assert.doesNotMatch(source, /\bdocument\b/, 'must not reference document');
    assert.doesNotMatch(source, /\bfetch\s*\(/, 'must not call fetch');
    assert.doesNotMatch(source, /\bDate\.now\s*\(/, 'must not call Date.now');
    assert.doesNotMatch(source, /\bMath\.random\s*\(/, 'must not call Math.random');
    assert.doesNotMatch(source, /\blocalStorage\b/, 'must not reference localStorage');
    assert.doesNotMatch(source, /from\s+['"]node:/, 'must not import node builtins');
  });

  test('zero bare numeric literals > 999 and zero numeric nullish fallbacks outside comments', () => {
    const source = readInvariantsSource();
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    assert.deepEqual(
      codeOnly.match(/\b\d{4,}\b/g) || [],
      [],
      'zero bare numeric literals > 999 outside comments',
    );
    assert.doesNotMatch(codeOnly, /\?\?\s*[\d.]/, 'zero numeric nullish fallbacks on new paths');
  });

  test('the oracle never imports valuation engines (no second-copy tautology)', () => {
    const source = readInvariantsSource();
    assert.doesNotMatch(
      source,
      /from\s+['"][^'"]*(dcf|wacc|recommend|sensitivity|scenarios|threeStatement)\.js['"]/,
      'invariants must not import valuation engines',
    );
    assert.doesNotMatch(source, /\bGordon\b|terminalValue|terminalFcff/, 'no terminal formula');
  });

  test('reports and registry are deeply frozen (mutation throws)', async () => {
    const { threeStatement } = await modelPromise;
    const articulation = checkForecastArticulation(threeStatement);
    const bridge = checkNetCashBridge(threeStatement);
    const registry = checkSettlementRegistry(threeStatement);

    assert.ok(Object.isFrozen(articulation), 'articulation report frozen');
    assert.ok(Object.isFrozen(articulation[0]), 'articulation rows frozen');
    assert.ok(Object.isFrozen(bridge), 'bridge report frozen');
    assert.ok(Object.isFrozen(bridge.rederived), 'bridge payload frozen');
    assert.ok(Object.isFrozen(registry), 'registry report frozen');
    assert.ok(Object.isFrozen(SETTLEMENT_REGISTRY), 'registry table frozen');

    assert.throws(() => {
      articulation[0].status = 'pass';
    }, TypeError);
    assert.throws(() => {
      bridge.rederived.netCashToday = 0;
    }, TypeError);
  });

  test('deterministic across repeated runs (byte-identical output)', async () => {
    const { threeStatement } = await modelPromise;
    const first = JSON.stringify(checkForecastArticulation(threeStatement));
    const second = JSON.stringify(checkForecastArticulation(threeStatement));
    assert.equal(second, first, 'repeated articulation runs must produce identical JSON');
    const pins = checkPinSync({
      docstring: 'perShare $7.25',
      claims: [
        {
          key: 'per_share',
          description: 'determinism probe',
          pattern: /perShare \$([\d.]+)/,
          kind: 'perShare',
          liveKey: 'perShare',
          tolerance: 5e-4,
        },
      ],
      live: { perShare: 7.25 },
    });
    assert.equal(
      JSON.stringify(pins),
      JSON.stringify(
        checkPinSync({
          docstring: 'perShare $7.25',
          claims: [
            {
              key: 'per_share',
              description: 'determinism probe',
              pattern: /perShare \$([\d.]+)/,
              kind: 'perShare',
              liveKey: 'perShare',
              tolerance: 5e-4,
            },
          ],
          live: { perShare: 7.25 },
        }),
      ),
      'repeated pin-sync runs must produce identical JSON',
    );
  });

  test('fail-closed: malformed inputs throw typed EngineError (two-stage pins)', async () => {
    const { threeStatement } = await modelPromise;

    assert.throws(() => checkForecastArticulation(null), (err) => err.name === 'EngineError');
    assert.throws(
      () => checkForecastArticulation({ periods: [] }),
      (err) => err.name === 'EngineError',
    );
    assert.throws(
      () => checkNetCashBridge({}),
      (err) => err.name === 'EngineError' && err.code === 'missing_input',
    );
    assert.throws(
      () => checkPinSync(null),
      (err) => err.name === 'EngineError' && err.code === 'missing_input',
    );
    assert.throws(
      () =>
        checkPinSync({
          docstring: 'perShare $7.25',
          claims: [
            {
              key: 'per_share',
              description: 'bad-kind probe',
              pattern: /perShare \$([\d.]+)/,
              kind: 'not-a-kind',
              liveKey: 'perShare',
              tolerance: 5e-4,
            },
          ],
          live: { perShare: 7.25 },
        }),
      (err) => err.name === 'EngineError' && err.code === 'invalid_claim_kind',
    );

    // Non-finite live pin (value check) fails closed independently of input shape.
    const broken = structuredClone(threeStatement);
    broken.cashFlow.byPeriod.FY2029.ending_cash.value = Number.NaN;
    assert.throws(() => checkForecastArticulation(broken), (err) => err.name === 'EngineError');
  });
});

describe('EP.4  -  Verdict Sensitivity Band (engine-derived, R5/§8)', () => {
  test('band shape is exact: five engine-derived treatments, all overvalued, stable', async () => {
    const model = await modelPromise;
    const band = buildLabelStability({
      threeStatement: model.threeStatement,
      dcf: model.dcf,
      assumptions: model.assumptions,
      corpus: model.historical,
    });

    assert.deepEqual(
      band.treatments.map((t) => t.name),
      ['gross-issuance', 'charged-netting', 'pv-discounted', 'sbc-fade', 'perpetual-expense'],
      'band carries exactly the five defensible treatments (uncharged netting excluded)',
    );
    assert.equal(band.headlineLabel, 'overvalued', 'headline label is overvalued post-fix');
    assert.equal(band.labelStable, true, 'every band cell lands overvalued → stable');
    for (const treatment of band.treatments) {
      assert.deepEqual(
        Object.keys(treatment).sort(),
        ['label', 'name', 'perShare'],
        'treatment rows carry exactly { name, perShare, label }',
      );
      assert.equal(treatment.label, 'overvalued', `${treatment.name} is overvalued`);
      assert.ok(Number.isFinite(treatment.perShare) && treatment.perShare > 0, `${treatment.name} finite positive`);
    }
    assert.ok(Object.isFrozen(band), 'band report is frozen');
    assert.ok(Object.isFrozen(band.treatments), 'treatment list is frozen');
  });

  test('band pins are engine-true (machine-born EP.4 record)', async () => {
    const model = await modelPromise;
    const band = buildLabelStability({
      threeStatement: model.threeStatement,
      dcf: model.dcf,
      assumptions: model.assumptions,
      corpus: model.historical,
    });
    const byName = (name) => band.treatments.find((t) => t.name === name);
    assert.ok(Math.abs(byName('gross-issuance').perShare - 118.60) < 0.01, 'gross ≈ $118.60');
    assert.ok(Math.abs(byName('charged-netting').perShare - 118.97) < 0.01, 'charged ≈ $118.97');
    assert.ok(Math.abs(byName('pv-discounted').perShare - 122.84) < 0.01, 'pv-discounted ≈ $122.84');
    assert.ok(Math.abs(byName('sbc-fade').perShare - 104.31) < 0.01, 'fade ≈ $104.31');
    assert.ok(Math.abs(byName('perpetual-expense').perShare - 78.18) < 0.01, 'expense ≈ $78.18');
  });

  test('gross ties the headline exactly; charged-netting stays within $1 (verified equivalence)', async () => {
    const model = await modelPromise;
    const band = buildLabelStability({
      threeStatement: model.threeStatement,
      dcf: model.dcf,
      assumptions: model.assumptions,
      corpus: model.historical,
    });
    const byName = (name) => band.treatments.find((t) => t.name === name);
    assert.equal(
      byName('gross-issuance').perShare,
      model.dcf.perShare,
      'gross issuance is the headline computation',
    );
    assert.ok(
      Math.abs(byName('charged-netting').perShare - byName('gross-issuance').perShare) < 1,
      'charged netting is value-neutral at fair price within $1 (§3.3)',
    );
    const ordered = [...band.treatments].sort((a, b) => a.perShare - b.perShare);
    assert.deepEqual(
      ordered.map((t) => t.name),
      ['perpetual-expense', 'sbc-fade', 'gross-issuance', 'charged-netting', 'pv-discounted'],
      'band ordering matches the disclosed economics (expense < fade < gross < charged < pv)',
    );
  });

  test('charged-netting re-derives from raw CF buyback legs (no hand literals)', async () => {
    const model = await modelPromise;
    const { threeStatement, dcf, assumptions, historical } = model;
    const price = assumptions.get('market_share_price').value;
    let spendPv = 0;
    let retired = 0;
    for (const period of threeStatement.periods) {
      const spend = Math.abs(
        threeStatement.cashFlow.byPeriod[period].financing_activities.repurchase_of_common_stock
          .value,
      );
      const df = dcf.schedule.find((s) => s.period === period).discountFactor;
      spendPv += spend * df;
      retired += (spend * 1000) / price;
    }
    const expected = ((dcf.equityValue - spendPv) * 1000) / (dcf.sharesOutstanding - retired);
    const band = buildLabelStability({
      threeStatement,
      dcf,
      assumptions,
      corpus: historical,
    });
    assert.equal(
      band.treatments.find((t) => t.name === 'charged-netting').perShare,
      expected,
      'charged treatment re-derives from raw financing legs in-test',
    );
  });

  test('labels come from the threshold engine, never hand labels', async () => {
    const model = await modelPromise;
    const price = model.assumptions.get('market_share_price').value;
    const band = buildLabelStability({
      threeStatement: model.threeStatement,
      dcf: model.dcf,
      assumptions: model.assumptions,
      corpus: model.historical,
    });
    for (const treatment of band.treatments) {
      assert.equal(
        treatment.label,
        evaluateRec(treatment.perShare, price).label,
        `${treatment.name} label recomputes through evaluate()`,
      );
    }
  });

  test('runFullValuation carries labelStability with the contracted shape', async () => {
    const model = await modelPromise;
    const full = runFullValuation(model.historical, model.assumptions, 'base');
    assert.ok(full.labelStability, 'full valuation carries the band');
    assert.equal(typeof full.labelStability.labelStable, 'boolean', 'labelStable is boolean');
    assert.equal(full.labelStability.headlineLabel, full.recommendation.label, 'headline ties recommendation');
    assert.equal(full.labelStability.treatments.length, 5, 'five treatments');
  });

  test('fail-closed: missing inputs, drivers, corpus, and schedule all throw typed errors', async () => {
    const model = await modelPromise;
    const good = {
      threeStatement: model.threeStatement,
      dcf: model.dcf,
      assumptions: model.assumptions,
      corpus: model.historical,
    };
    assert.throws(
      () => buildLabelStability(null),
      (err) => err.name === 'EngineError' && err.code === 'missing_input',
    );
    assert.throws(
      () => buildLabelStability({ ...good, assumptions: null }),
      (err) => err.name === 'EngineError' && err.code === 'missing_input',
    );
    assert.throws(
      () => buildLabelStability({ ...good, corpus: null }),
      (err) => err.name === 'EngineError' && err.code === 'missing_corpus_row',
    );
    const noPrice = {
      ...model.assumptions,
      get: (name) => (name === 'market_share_price' ? null : model.assumptions.get(name)),
    };
    assert.throws(
      () => buildLabelStability({ ...good, assumptions: noPrice }),
      (err) => err.name === 'EngineError' && err.code === 'missing_driver',
    );
    assert.throws(
      () =>
        buildLabelStability({
          ...good,
          dcf: { ...model.dcf, schedule: null },
        }),
      (err) => err.name === 'EngineError' && err.code === 'missing_input',
    );
  });
});

describe('EP.4  -  Summary Sensitivity Surface (RP7 cards + band)', () => {
  async function liveSummaryProps() {
    const model = await modelPromise;
    const band = buildLabelStability({
      threeStatement: model.threeStatement,
      dcf: model.dcf,
      assumptions: model.assumptions,
      corpus: model.historical,
    });
    return { model, band };
  }

  test('band card renders five treatment rows with no alarm when stable', async () => {
    const { model, band } = await liveSummaryProps();
    const container = stubContainer();
    const view = renderSummary({
      container,
      dcf: model.dcf,
      recommendation: model.recommendation,
      historical: model.historical,
      assumptions: model.assumptions,
      threeStatement: model.threeStatement,
      verdict: null,
      sensitivityGrid: null,
      labelStability: band,
    });
    void view;
    assert.match(container.innerHTML, /Verdict Sensitivity Band/, 'band card renders');
    for (const name of [
      'Gross issuance at spot',
      'Charged netting',
      'PV-discounted SBC',
      'Faded SBC',
      'Perpetual SBC expense',
    ]) {
      assert.ok(container.innerHTML.includes(name), `band row renders: ${name}`);
    }
    assert.doesNotMatch(
      container.innerHTML,
      /verdict sensitive to SBC treatment/,
      'no alarm while stable',
    );
  });

  test('unstable band carries the sensitivity note on the verdict badge', async () => {
    const { model } = await liveSummaryProps();
    const unstable = {
      labelStable: false,
      headlineLabel: 'overvalued',
      treatments: [
        { name: 'gross-issuance', perShare: 118.6, label: 'overvalued' },
        { name: 'charged-netting', perShare: 118.97, label: 'overvalued' },
        { name: 'pv-discounted', perShare: 122.84, label: 'overvalued' },
        { name: 'sbc-fade', perShare: 104.31, label: 'overvalued' },
        { name: 'perpetual-expense', perShare: 200.0, label: 'undervalued' },
      ],
    };
    const container = stubContainer();
    renderSummary({
      container,
      dcf: model.dcf,
      recommendation: model.recommendation,
      historical: model.historical,
      assumptions: model.assumptions,
      threeStatement: model.threeStatement,
      labelStability: unstable,
    });
    assert.match(
      container.innerHTML,
      /verdict sensitive to SBC treatment/,
      'badge carries the sensitivity note when unstable',
    );
  });

  test('legacy callers without the band render no band card and never crash', async () => {
    const model = await modelPromise;
    const container = stubContainer();
    renderSummary({
      container,
      dcf: model.dcf,
      recommendation: model.recommendation,
      historical: model.historical,
      assumptions: model.assumptions,
      threeStatement: model.threeStatement,
    });
    assert.doesNotMatch(container.innerHTML, /Verdict Sensitivity Band/, 'no band without data');
    assert.doesNotMatch(container.innerHTML, /verdict sensitive to SBC treatment/, 'no note without data');
  });

  test('update() with a new band re-renders the surface', async () => {
    const { model, band } = await liveSummaryProps();
    const container = stubContainer();
    const view = renderSummary({
      container,
      dcf: model.dcf,
      recommendation: model.recommendation,
      historical: model.historical,
      assumptions: model.assumptions,
      threeStatement: model.threeStatement,
    });
    assert.doesNotMatch(container.innerHTML, /Verdict Sensitivity Band/, 'band absent before update');
    view.update(
      model.dcf,
      model.recommendation,
      null,
      model.historical,
      model.assumptions,
      model.threeStatement,
      undefined,
      undefined,
      undefined,
      undefined,
      band,
    );
    assert.match(container.innerHTML, /Verdict Sensitivity Band/, 'band renders after update');
  });

  test('app.state() carries labelStability end to end', async () => {
    const { createApp } = await import('../src/app.js');
    const { TAB_KEYS } = await import('../src/ui/tabs.js');
    const { createTabRoot } = await import('./_dom_stub.js');
    const model = await modelPromise;
    const { root } = createTabRoot(TAB_KEYS);
    const app = createApp({
      data: {
        loadHistorical: () => Promise.resolve(model.historical),
        loadAssumptions: () => Promise.resolve(model.assumptions),
      },
      engine: {},
      root,
      now: () => 0,
      historical: model.historical,
      assumptions: model.assumptions,
    });
    const state = app.state();
    assert.ok(state.labelStability, 'state carries the band');
    assert.equal(state.labelStability.headlineLabel, 'overvalued', 'headline label flows to state');
    assert.equal(state.labelStability.treatments.length, 5, 'five treatments flow to state');
    app.dispose();
  });
});

describe('EP.4  -  Warning #2 Disposition (zero split-strings; prose years plain)', () => {
  test('zero adjacent numeric-string concatenations anywhere under src/', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(new URL('../src', import.meta.url));
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.js')) continue;
        const text = fs.readFileSync(full, 'utf8');
        const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
        // Parenthesized and bare adjacent numeric-string concatenations
        // (e.g. ('20' + '26') and 'Sep 1, 20' + '26'): both forms banned.
        const matches = code.match(/['"]\d+['"]\s*\+\s*['"][\d-]+['"]/g);
        if (matches) {
          offenders.push(`${full}: ${matches.join(', ')}`);
        }
      }
    };
    walk(root);
    assert.deepEqual(offenders, [], 'split-string year construction is gone from src/');
  });

  test('Lever-6 BOP citation renders from the cited driver count (allowlisted prose intact)', async () => {
    const model = await modelPromise;
    const { renderValuation } = await import('../src/ui/valuationTab.js');
    const container = stubContainer();
    const view = renderValuation({
      container,
      wacc: model.wacc,
      dcf: model.dcf,
      assumptions: model.assumptions,
      TabulatorConstructor: class MockTabulator {},
    });
    void view;
    assert.ok(
      container.innerHTML.includes('50,031,000'),
      'BOP diluted count citation still renders (P8.0-allowlisted)',
    );
    assert.ok(
      container.innerHTML.includes('56.902M'),
      'rolled count badge renders from live engine output',
    );
  });
});
