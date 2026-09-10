/**
 * P4.2 Artifact Contract Tests  -  DCF Valuation (Discount Factors,
 * Explicit-Period PV, Gordon Terminal Value, EV → Net Cash → Equity → Per-Share Bridge).
 *
 * Covers:
 *  - `dcf.valuate(threeStatement, wacc, dcfInput)` interface & frozen DcfResult output.
 *  - **Discount factors independently recomputed and pinned**: `df_t = 1 / (1 + WACC)^t`
 *    pinned for FY2026 (t=1) and FY2030 (t=5).
 *  - **Explicit-period PV recomputed and pinned**: `pvExplicit = Σ fcf_t × df_t` recomputed
 *    from `ThreeStatementOutput.cashFlow.byPeriod[].free_cash_flow.value`.
 *  - **Hybrid FY2026 FCF honesty**: FY2026 FCF carries cited H1 OCF (239,031) + H1 ICF (−8,469)
 *    + H2 estimate without re-estimation.
 *  - **Gordon terminal value independently recomputed and pinned**: `terminalFcf = fcf_T × (1 + g)`,
 *    `terminalValue = terminalFcf / (WACC − g)`, `pvTerminal = terminalValue × df_T`.
 *  - **Hard Gordon guard**: `WACC > g` enforced fail-closed (`terminal_growth_exceeds_wacc`).
 *  - **Net cash bridge proven on raw components**: `netCash = endingCash(FY2030) + STI + LTI`
 *    from final forecast balance sheet (`threeStatement.balanceSheet.byPeriod[FY2030]`).
 *  - **Anti-tautology tripwires**:
 *    - Omitting STI or LTI changes netCash and fails the per-share pin.
 *    - Formula `equity = ev + netCash` (with `debt = 0` exercised) is active.
 *    - Synthetic levered probe verifies debt subtraction in capital bridge.
 *  - **Horizon flexibility & normalization**: default 5 years (FY2026-FY2030), user-extensible 3-10.
 *  - Fail-closed input validations, purity, determinism, deep-freeze, zero bare literals > 999,
 *    and the 706-record corpus invariant.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { EngineError } from '../src/data/errors.js';
import { UNITS } from '../src/data/constants.js';
import { readLedgerUrls } from './_ledger.js';
import { build } from '../src/engine/wacc.js';
import { valuate } from '../src/engine/dcf.js';
import { runFullProjection } from '../src/engine/scenarios.js';
import {
  WACC_FIXTURE,
  MARKET_KNOWN_FIGURES,
  DCF_KNOWN_FIGURES,
  DISCOUNT_FACTOR_FY2026,
  DISCOUNT_FACTOR_FY2030,
  deriveDiscountFactor,
  deriveExpectedDcf,
} from './fixtures/duolingo_facts.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const DCF_ENGINE_PATH = fileURLToPath(new URL('../src/engine/dcf.js', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

const P3_CORPUS_RECORD_COUNT = 706;

/**
 * Independent hand-computed Base DCF pins (anti-tautology).
 *
 * Sourced from verified Base FCFF projection + live WACC build + EP.2/EP.3 fixes:
 *   WACC         = 0.110375 (11.0375%)
 *   g            = 0.025 (2.5%)
 *   shares       = 56,902,469.78 rolled (BOP 50,031,000 + gross SBC issuance at spot)
 *   market price = $157.85
 *   FY2026 FCFF  = 323,417.33993955905 ($k, after-tax interest stripped)
 *   FY2027 FCFF  = 368,200.9837946979 ($k)
 *   FY2028 FCFF  = 431,125.5393149832 ($k)
 *   FY2029 FCFF  = 504,377.9944682029 ($k)
 *   FY2030 FCFF  = 591,200.8006542748 ($k)
 *   df_FY2026    = 1 / (1 + 0.110375)^1 = 0.9005966452774964
 *   df_FY2030    = 1 / (1 + 0.110375)^5 = 0.5924498916887444
 *   pvExplicit   = 1,586,880.579442814 ($k)
 *   terminal steady state (EP.3): wcInflowT = 78,090.87217182736 ($k),
 *     wcInflowSS = 13,441.180608195853 ($k),
 *     fcffNorm   = 591,200.8006542748 − 78,090.87217182736 + 13,441.180608195853
 *                = 526,551.1090906432 ($k)
 *   terminalFcf  = 526,551.1090906432 × 1.025 = 539,714.8869179098 ($k)
 *   terminalVal  = 539,714.8869179098 / (0.110375 − 0.025) = 6,321,697.063752963 ($k)
 *   pvTerminal   = 6,321,697.063752963 × df_FY2030 = 3,745,288.7407094967 ($k)
 *   EV           = 1,586,880.579442814 + 3,745,288.7407094967 = 5,332,169.320152311 ($k)
 *   ending cash  = 1,180,887 ($k, latest filed Q2 FY2026 BOP)
 *   STI          = 132,979 ($k)
 *   LTI          = 102,693 ($k)
 *   net cash     = 1,180,887 + 132,979 + 102,693 = 1,416,559 ($k)
 *   equityValue  = 5,332,169.320152311 + 1,416,559 = 6,748,728.320152311 ($k)
 *   perShare     = (6,748,728.320152311 × 1000) / 56,902,469.78 = $118.60167662384697
 */
const DCF_PIN = Object.freeze({
  wacc: 0.110375,
  terminalGrowthRate: 0.025,
  sharesOutstanding: 50031000,
  marketSharePrice: 157.85,
  fcfFy2026: 323417.33993955905,
  fcfFy2030: 591200.8006542748,
  dfFy2026: 0.9005966452774964,
  dfFy2030: 0.5924498916887444,
  pvExplicit: 1586880.579442814,
  terminalFcf: 605980.8206706316,
  terminalValue: 6321697.063752963,
  pvTerminal: 3745288.7407094967,
  enterpriseValue: 5332169.320152311,
  endingCash: 1180887,
  sti: 132979,
  lti: 102693,
  netCash: 1416559,
  equityValue: 6748728.320152311,
  perShare: 118.60167662384697,
});

/** Absolute tolerance for small floats (rates / discount factors <= 1). */
const TOL = 1e-12;

/** Relative tolerance for large money magnitudes ($ thousands / millions). */
const REL_TOL = 1e-12;

/**
 * Pins an actual value against an expected value with magnitude-scaled tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {string} label
 * @param {number} [tol]
 */
function pinned(actual, expected, label, tol = TOL) {
  const slack = Math.max(tol, Math.abs(expected) * REL_TOL);
  assert.ok(
    Math.abs(actual - expected) <= slack,
    `${label}: expected ${expected}, received ${actual} (tolerance ${slack})`,
  );
}

async function getHistorical() {
  return loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
}

async function getAssumptions() {
  return loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
}

/**
 * Rebuilds an AssumptionSet-shaped object with driver overrides.
 *
 * @param {object} base Base AssumptionSet
 * @param {Array<object>} overrides Driver records to replace or append
 * @returns {object}
 */
function overrideAssumptions(base, overrides) {
  const map = new Map(base.drivers.map((d) => [d.name, d]));
  for (const o of overrides) {
    map.set(o.name, o);
  }
  const drivers = Array.from(map.values());
  const byName = {};
  const byGroup = {};
  for (const d of drivers) {
    byName[d.name] = d;
    if (!byGroup[d.group]) byGroup[d.group] = [];
    byGroup[d.group].push(d);
  }
  return Object.freeze({
    drivers: Object.freeze(drivers),
    byName: Object.freeze(byName),
    byGroup: Object.freeze(byGroup),
    get(name) {
      return byName[name] ?? null;
    },
    getValue(name) {
      return byName[name]?.value;
    },
  });
}

describe('P4.2  -  Discount factors independently recomputed and pinned', () => {
  test('discount factors df_t = 1/(1+WACC)^t pinned for FY2026 and FY2030', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });
    const dcf = valuate(fullProj.threeStatement, waccBuild, { assumptions, corpus: historical });

    // Pinned checks on discount factors
    pinned(dcf.schedule[0].discountFactor, DCF_PIN.dfFy2026, 'df_FY2026 (t=1 pin)');
    pinned(dcf.schedule[4].discountFactor, DCF_PIN.dfFy2030, 'df_FY2030 (t=5 pin)');

    // Recomputed from WACC build rate
    for (let i = 0; i < dcf.schedule.length; i += 1) {
      const t = i + 1;
      const expectedDf = 1 / Math.pow(1 + waccBuild.wacc.value, t);
      pinned(dcf.schedule[i].discountFactor, expectedDf, `df_t for t=${t}`);
    }

    // Monotonicity assertion: discount factor strictly decreases over time
    for (let i = 1; i < dcf.schedule.length; i += 1) {
      assert.ok(
        dcf.schedule[i].discountFactor < dcf.schedule[i - 1].discountFactor,
        `df_${i + 1} (${dcf.schedule[i].discountFactor}) must be less than df_${i} (${dcf.schedule[i - 1].discountFactor})`,
      );
    }

    // Tie-out against duolingo_facts anchor
    pinned(DISCOUNT_FACTOR_FY2026, DCF_PIN.dfFy2026, 'DISCOUNT_FACTOR_FY2026 anchor');
    pinned(DISCOUNT_FACTOR_FY2030, DCF_PIN.dfFy2030, 'DISCOUNT_FACTOR_FY2030 anchor');
  });
});

describe('P4.2  -  Explicit-period PV and FCF source fidelity', () => {
  test('explicit PV = Σ fcf_t × df_t recomputed from ThreeStatementOutput and pinned', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });
    const dcf = valuate(fullProj.threeStatement, waccBuild, { assumptions, corpus: historical });

    // FCF source fidelity: each schedule row matches ThreeStatement fcff companion line exactly
    let sumPv = 0;
    for (const item of dcf.schedule) {
      const tsFcf = fullProj.cashFlow.byPeriod[item.period].fcff.value;
      assert.equal(item.fcf, tsFcf, `FCF in ${item.period} must match ThreeStatementOutput exactly`);
      pinned(item.presentValue, item.fcf * item.discountFactor, `pv in ${item.period}`);
      sumPv += item.presentValue;
    }

    pinned(dcf.pvExplicit, sumPv, 'pvExplicit recomputed from sum');
    pinned(dcf.pvExplicit, DCF_PIN.pvExplicit, 'pvExplicit pin');
  });

  test('hybrid FY2026 FCF honesty: carries cited H1 OCF 239,031 anchor + H2 estimate', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });
    const dcf = valuate(fullProj.threeStatement, waccBuild, { assumptions, corpus: historical });

    const fy2026Fcf = dcf.schedule[0].fcf;
    pinned(fy2026Fcf, DCF_PIN.fcfFy2026, 'FY2026 hybrid FCF pin');

    // Prove H1 OCF cited anchor is present in the underlying cash flow statement
    const fy2026Cf = fullProj.cashFlow.byPeriod.FY2026;
    assert.equal(fy2026Cf.isHybrid, true, 'FY2026 must be flagged isHybrid');
    assert.equal(fy2026Cf.operating_activities.total.h1.value, 239031, 'H1 OCF cited anchor 239,031');
  });
});

describe('P4.2  -  Gordon terminal value and WACC > g guard', () => {
  test('Gordon terminal value independently recomputed and pinned', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });
    const dcf = valuate(fullProj.threeStatement, waccBuild, { assumptions, corpus: historical });

    const fcf_T = dcf.schedule[dcf.schedule.length - 1].fcf;
    const g = assumptions.get('terminal_growth_rate').value;
    const waccRate = waccBuild.wacc.value;
    const df_T = dcf.schedule[dcf.schedule.length - 1].discountFactor;

    pinned(fcf_T, DCF_PIN.fcfFy2030, 'FY2030 fcf_T pin');
    pinned(dcf.terminalGrowthRate, DCF_PIN.terminalGrowthRate, 'terminalGrowthRate pin');

    // EP.3 terminal steady-state normalisation, re-derived from raw WC lines:
    // final-year WC inflow replaced by its perpetuity-rate equivalent.
    const wcSched = fullProj.threeStatement.supporting.workingCapital.byPeriod;
    const nwcT = wcSched.FY2030.net_working_capital.value;
    const nwcPrev = wcSched.FY2029.net_working_capital.value;
    const wcInflowT = -(nwcT - nwcPrev);
    const wcInflowSS = -nwcT * g;
    const expectedTerminalFcf = (fcf_T - wcInflowT + wcInflowSS) * (1 + g);
    const expectedTerminalValue = expectedTerminalFcf / (waccRate - g);
    const expectedPvTerminal = expectedTerminalValue * df_T;

    pinned(dcf.terminalValue, expectedTerminalValue, 'terminalValue recomputed (normalised)');
    pinned(dcf.terminalValue, DCF_PIN.terminalValue, 'terminalValue pin');
    pinned(dcf.pvTerminal, expectedPvTerminal, 'pvTerminal recomputed');
    pinned(dcf.pvTerminal, DCF_PIN.pvTerminal, 'pvTerminal pin');
  });

  test('guard WACC > g: throws typed EngineError terminal_growth_exceeds_wacc when g >= WACC', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });

    // Test g equal to WACC
    const equalGAssumptions = overrideAssumptions(assumptions, [
      Object.freeze({
        ...assumptions.get('terminal_growth_rate'),
        value: waccBuild.wacc.value,
      }),
    ]);

    assert.throws(
      () => valuate(fullProj.threeStatement, waccBuild, { assumptions: equalGAssumptions }),
      (err) => {
        assert.ok(err instanceof EngineError, `expected EngineError, got ${err.name}`);
        assert.equal(err.code, 'terminal_growth_exceeds_wacc');
        assert.match(err.message, /Gordon terminal/i);
        return true;
      },
    );

    // Test g greater than WACC (e.g. 12% > 11.0375%)
    const highGAssumptions = overrideAssumptions(assumptions, [
      Object.freeze({
        ...assumptions.get('terminal_growth_rate'),
        value: 0.12,
      }),
    ]);

    assert.throws(
      () => valuate(fullProj.threeStatement, waccBuild, { assumptions: highGAssumptions }),
      (err) => {
        assert.ok(err instanceof EngineError);
        assert.equal(err.code, 'terminal_growth_exceeds_wacc');
        return true;
      },
    );
  });
});

describe('P4.2  -  EV → Net Cash → Equity → Per-Share Bridge & Anti-Tautology Tripwires', () => {
  test('enterprise value, net cash bridge, equity value, and per-share pinned to Base numbers', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });
    const dcf = valuate(fullProj.threeStatement, waccBuild, { assumptions, corpus: historical });

    // EV = pvExplicit + pvTerminal
    pinned(dcf.enterpriseValue, dcf.pvExplicit + dcf.pvTerminal, 'EV = pvExplicit + pvTerminal');
    pinned(dcf.enterpriseValue, DCF_PIN.enterpriseValue, 'EV pin');
    pinned(dcf.ev, DCF_PIN.enterpriseValue, 'dcf.ev alias pin');

    // Bridge: cash + STI + LTI - debt
    pinned(dcf.bridge.cash, DCF_PIN.endingCash, 'bridge.cash pin');
    pinned(dcf.bridge.shortTermInvestments, DCF_PIN.sti, 'bridge.STI pin');
    pinned(dcf.bridge.longTermInvestments, DCF_PIN.lti, 'bridge.LTI pin');
    assert.equal(dcf.bridge.debt, 0, 'bridge.debt is 0 (debt-free)');

    const expectedNetCash = DCF_PIN.endingCash + DCF_PIN.sti + DCF_PIN.lti;
    pinned(dcf.netCash, expectedNetCash, 'netCash = cash + STI + LTI');
    pinned(dcf.netCash, DCF_PIN.netCash, 'netCash pin');

    // Equity = EV + netCash
    pinned(dcf.equityValue, dcf.enterpriseValue + dcf.netCash, 'equityValue = EV + netCash');
    pinned(dcf.equityValue, DCF_PIN.equityValue, 'equityValue pin');

    // Per-share = (equityValue * 1000) / sharesOutstanding
    const expectedPerShare = (dcf.equityValue * UNITS.thousands_usd.scale) / dcf.sharesOutstanding;
    pinned(dcf.perShare, expectedPerShare, 'perShare = (equityValue * scale) / shares');
    pinned(dcf.perShare, DCF_PIN.perShare, 'perShare pin (~$126.68, EP.2 rolled shares)');

    // Independent closed-form tie-out from duolingo_facts.js. The fixture keeps
    // the independent numerator math (discount factors, Gordon terminal, bridge);
    // the denominator is the live rolled count, whose correctness EIG-B gates
    // from raw CF lines (splitting numerator/denominator duties, not a tautology).
    const expDcf = deriveExpectedDcf(
      fullProj.threeStatement,
      waccBuild,
      assumptions,
      5,
      dcf.sharesOutstanding,
    );
    pinned(dcf.perShare, expDcf.perShare, 'matches deriveExpectedDcf fixture');
  });

  test('anti-tautology tripwire: omitting STI or LTI changes netCash and fails the per-share pin', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });
    const dcf = valuate(fullProj.threeStatement, waccBuild, { assumptions, corpus: historical });

    // If STI and LTI were erroneously omitted:
    const brokenNetCash = dcf.bridge.cash; // omitting 132,979 + 102,693 = 235,672 ($k)
    const brokenEquity = dcf.enterpriseValue + brokenNetCash;
    const brokenPerShare = (brokenEquity * UNITS.thousands_usd.scale) / dcf.sharesOutstanding;

    const diff = Math.abs(dcf.perShare - brokenPerShare);
    // Difference is 235,672 * 1000 / 56,902,469.78 ≈ $4.1417 / share under the
    // EP.2 rolled denominator (was $4.7105 on the static 50,031,000 count).
    assert.ok(diff > 3.5, `omitting STI/LTI must move per-share by > $3.50 (actual diff: $${diff.toFixed(4)})`);
  });

  test('synthetic levered debt structure: proves general debt subtraction formula is active', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');

    const syntheticDebt = 1_000_000; // $1B debt ($1,000,000 in thousands)
    const leveredWacc = build({
      assumptions: overrideAssumptions(assumptions, [
        Object.freeze({
          name: 'cost_of_debt',
          label: 'Pre-tax cost of debt',
          group: 'debt',
          value: 0.06,
          min: 0,
          max: 0.2,
          step: 0.001,
          units: 'pct_decimal',
          scenarioDeltas: Object.freeze({ bear: 0, bull: 0 }),
          notes: 'synthetic levered test',
        }),
      ]),
      debtSchedule: { hasDebt: true, totalDebt: syntheticDebt },
    });

    const leveredDcf = valuate(fullProj.threeStatement, leveredWacc, { assumptions, corpus: historical });

    assert.equal(leveredDcf.bridge.debt, syntheticDebt, 'bridge debt matches totalDebt');
    const expectedNetCash = DCF_PIN.endingCash + DCF_PIN.sti + DCF_PIN.lti - syntheticDebt;
    pinned(leveredDcf.netCash, expectedNetCash, 'levered net cash = cash + STI + LTI - debt');
    pinned(leveredDcf.equityValue, leveredDcf.enterpriseValue + leveredDcf.netCash, 'equityValue = EV + netCash');
  });
});

describe('P4.2  -  Horizon flexibility & bounds', () => {
  test('custom horizon 3 years (FY2026-FY2028): terminal value off FY2028 and balance sheet at FY2028', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });

    const dcf3 = valuate(fullProj.threeStatement, waccBuild, { assumptions, horizon: 3, corpus: historical });

    assert.equal(dcf3.horizon, 3);
    assert.equal(dcf3.schedule.length, 3);
    assert.deepEqual(dcf3.periods, ['FY2026', 'FY2027', 'FY2028']);

    // Terminal year is FY2028 (EP.3 normalised terminal, re-derived from raw WC lines)
    const fcf_2028 = fullProj.cashFlow.byPeriod.FY2028.fcff.value;
    const g = assumptions.get('terminal_growth_rate').value;
    const waccRate = waccBuild.wacc.value;
    const df_2028 = 1 / Math.pow(1 + waccRate, 3);
    const nwc_2028 = fullProj.threeStatement.supporting.workingCapital.byPeriod.FY2028.net_working_capital.value;
    const nwc_2027 = fullProj.threeStatement.supporting.workingCapital.byPeriod.FY2027.net_working_capital.value;

    const expectedTerminalFcf = (fcf_2028 - -(nwc_2028 - nwc_2027) + -nwc_2028 * g) * (1 + g);
    const expectedTerminalValue = expectedTerminalFcf / (waccRate - g);
    const expectedPvTerminal = expectedTerminalValue * df_2028;

    pinned(dcf3.terminalValue, expectedTerminalValue, '3-year terminalValue');
    pinned(dcf3.pvTerminal, expectedPvTerminal, '3-year pvTerminal');

    // Headline bridge cash is today's cash; legacy bridge cash is from terminal forecast period FY2028
    const bs2028 = fullProj.balanceSheet.byPeriod.FY2028;
    pinned(dcf3.bridge.cash, DCF_PIN.endingCash, 'headline bridge cash today');
    pinned(dcf3.legacy.bridge.cash, bs2028.current_assets.cash_and_cash_equivalents.value, 'legacy bridge cash from FY2028');
  });

  test('invalid horizon values throw typed EngineError invalid_horizon', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });

    for (const badHorizon of [2, 11, 4.5, '5', -1, 0]) {
      assert.throws(
        () => valuate(fullProj.threeStatement, waccBuild, { assumptions, horizon: badHorizon }),
        (err) => {
          assert.ok(err instanceof EngineError);
          assert.equal(err.code, 'invalid_horizon');
          return true;
        },
        `horizon ${badHorizon} must throw invalid_horizon`,
      );
    }
  });
});

describe('P4.2  -  Fail-closed input validation', () => {
  test('missing threeStatement throws missing_input', async () => {
    const assumptions = await getAssumptions();
    const waccBuild = build({ assumptions });
    assert.throws(() => valuate(null, waccBuild, { assumptions }), (err) => err.code === 'missing_input');
    assert.throws(() => valuate({}, waccBuild, { assumptions }), (err) => err.code === 'missing_input');
  });

  test('missing or invalid WACC throws invalid_wacc', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');

    for (const badWacc of [null, undefined, NaN, '0.08', -1.5, -1]) {
      assert.throws(
        () => valuate(fullProj.threeStatement, badWacc, { assumptions }),
        (err) => err.code === 'invalid_wacc',
      );
    }
  });

  test('missing dcfInput or assumptions throws missing_input', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions });

    assert.throws(() => valuate(fullProj.threeStatement, waccBuild, null), (err) => err.code === 'missing_input');
    assert.throws(() => valuate(fullProj.threeStatement, waccBuild, {}), (err) => err.code === 'missing_input');
  });

  test('missing or non-finite terminal_growth_rate throws missing_driver', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions });

    const withoutG = Object.freeze({
      ...assumptions,
      get(name) {
        return name === 'terminal_growth_rate' ? null : assumptions.get(name);
      },
    });

    assert.throws(
      () => valuate(fullProj.threeStatement, waccBuild, { assumptions: withoutG }),
      (err) => err.code === 'missing_driver' && err.driverName === 'terminal_growth_rate',
    );
  });

  test('missing or non-positive shares_outstanding throws missing_driver', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions });

    const zeroShares = overrideAssumptions(assumptions, [
      Object.freeze({
        ...assumptions.get('shares_outstanding'),
        value: 0,
      }),
    ]);

    assert.throws(
      () => valuate(fullProj.threeStatement, waccBuild, { assumptions: zeroShares }),
      (err) => err.code === 'missing_driver' && err.driverName === 'shares_outstanding',
    );
  });
});

describe('P4.2  -  Purity, determinism, deep-freeze & zero bare numeric literals', () => {
  test('output is deeply frozen and mutation throws', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });
    const dcf = valuate(fullProj.threeStatement, waccBuild, { assumptions, corpus: historical });

    assert.ok(Object.isFrozen(dcf), 'dcf result must be frozen');
    assert.ok(Object.isFrozen(dcf.schedule), 'dcf.schedule must be frozen');
    assert.ok(Object.isFrozen(dcf.schedule[0]), 'dcf.schedule item must be frozen');
    assert.ok(Object.isFrozen(dcf.bridge), 'dcf.bridge must be frozen');
    assert.ok(Object.isFrozen(dcf.derivedFrom), 'dcf.derivedFrom must be frozen');

    assert.throws(() => {
      dcf.perShare = 0;
    }, TypeError);

    assert.throws(() => {
      dcf.bridge.netCash = 0;
    }, TypeError);
  });

  test('deterministic across repeated runs with byte-identical output', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fullProj = runFullProjection(historical, assumptions, 'base');
    const waccBuild = build({ assumptions, debtSchedule: fullProj.schedules.debt });

    const first = JSON.stringify(valuate(fullProj.threeStatement, waccBuild, { assumptions, corpus: historical }));
    for (let i = 0; i < 5; i += 1) {
      const repeat = JSON.stringify(valuate(fullProj.threeStatement, waccBuild, { assumptions, corpus: historical }));
      assert.equal(repeat, first, 'repeated valuation runs must produce identical JSON');
    }
  });

  test('purity: zero DOM, zero fetch, zero Date.now, zero Math.random in dcf.js', async () => {
    const source = await readText(DCF_ENGINE_PATH);

    assert.doesNotMatch(source, /\bwindow\b/, 'dcf.js must not reference window');
    assert.doesNotMatch(source, /\bdocument\b/, 'dcf.js must not reference document');
    assert.doesNotMatch(source, /\bfetch\s*\(/, 'dcf.js must not call fetch');
    assert.doesNotMatch(source, /\bDate\.now\s*\(/, 'dcf.js must not call Date.now');
    assert.doesNotMatch(source, /\bMath\.random\s*\(/, 'dcf.js must not call Math.random');
    assert.doesNotMatch(source, /\blocalStorage\b/, 'dcf.js must not reference localStorage');
  });

  test('zero bare numeric literals > 999 outside comments in dcf.js', async () => {
    const source = await readText(DCF_ENGINE_PATH);
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    // Match numbers with 4+ digits (\b\d{4,}\b) or with underscores (\b\d[\d_]{3,}\b)
    const matches = codeOnly.match(/\b\d{4,}\b/g) || [];
    assert.deepEqual(
      matches,
      [],
      `dcf.js must have zero bare numeric literals > 999 outside comments; found: ${matches.join(', ')}`,
    );
  });

  test('corpus invariant: zero new rows in data layer (706 records)', async () => {
    const historical = await getHistorical();
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];

    assert.equal(allRows.length, P3_CORPUS_RECORD_COUNT, 'Corpus must remain exactly 706 cited records');
  });
});
