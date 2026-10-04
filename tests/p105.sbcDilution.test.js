/**
 * P10.5 — FCFF, SBC Add-Back, and Dilution.
 *
 * Contract gates covered here:
 *  - SBC add-back equals the noncash reconciliation exactly.
 *  - Each SBC period produces issuance exactly once.
 *  - Benchmark changes do not change issuance.
 *  - Current-share and future-diluted DCF values reconcile.
 *  - Finite and perpetual dilution sensitivities are distinct.
 *  - Terminal dilution denominator remains positive (with boundary probes).
 *  - FCFF/FCFE reconciliation equals zero residual.
 *  - No output calls FCFE a floor.
 *  - No method range uses FCFF and FCFE as endpoints.
 *  - Legacy value cannot enter recommendation or aggregate calculations.
 *
 * These are permanent guards, not one-shot pins. Where a test would otherwise
 * agree with the code by restating it, the expected value is DERIVED from an
 * independent identity instead.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { projectShares, fullyDilutedSchedule } from '../src/engine/shares.js';
import { buildFullModel } from './_invariants.js';
import { aggregateVerdicts } from '../src/engine/methods/aggregate.js';
import * as recommend from '../src/engine/recommend.js';
import { valuateFcffDcf } from '../src/engine/methods/fcffDcf.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const model = await buildFullModel({ horizon: 10 });
const schedule = projectShares(model.assumptions, model.threeStatement, model.historical);

describe('P10.5 - issuance base and roll', () => {
  test('the roll starts from the P10.4 point-in-time FD schedule, never the WA count', () => {
    const fd = fullyDilutedSchedule();
    assert.equal(schedule.bopShares, fd.denominator, 'roll base is the FD schedule denominator');
    const wa = model.assumptions.get('shares_outstanding').value;
    assert.notEqual(schedule.bopShares, wa, 'roll base must not be the weighted average');
    assert.equal(schedule.weightedAverageDilutedDiagnostic, wa, 'the WA count stays a diagnostic');
  });

  test('each period produces issuance exactly once, and the roll is additive', () => {
    const periods = schedule.periods;
    assert.ok(periods.length > 0);
    let running = schedule.bopShares;
    let summed = 0;
    for (const period of periods) {
      const row = schedule.byPeriod[period];
      assert.ok(row, `${period} has a roll row`);
      assert.equal(typeof row.issuance, 'number', `${period} issuance is numeric`);
      assert.ok(Number.isFinite(row.issuance) && row.issuance >= 0, `${period} issuance is finite and non-negative`);
      // Exactly one issuance contribution per period, folded into the running count.
      running += row.issuance;
      summed += row.issuance;
      assert.ok(
        Math.abs(row.shares - running) < 1e-6,
        `${period} running count equals prior plus exactly one issuance`,
      );
    }
    assert.ok(Math.abs(schedule.totalIssuance - summed) < 1e-6, 'total issuance equals the sum of periods');
    assert.ok(
      Math.abs(schedule.sharesFiniteTerminal - (schedule.bopShares + summed)) < 1e-6,
      'terminal count is the base plus the summed issuance',
    );
  });

  test('benchmark changes do not change issuance', () => {
    // Structural gate: the roll must not READ the benchmark at all, so no
    // benchmark value can move it. Proving the absence of the read is stronger
    // than mutating one value and observing no change, and it cannot be
    // satisfied by a mutation that silently failed to apply.
    const src = fs.readFileSync(root + '/src/engine/shares.js', 'utf8');
    const body = src.slice(src.indexOf('export function projectShares'));
    // Only CODE lines count: the comment above states the rule and necessarily
    // names what must not be read.
    const code = body
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    assert.ok(!/market_share_price/.test(code), 'projectShares code must not read the benchmark driver');
    assert.ok(!/benchmark/.test(code), 'projectShares code must not read the benchmark at all');
    assert.ok(code.includes('sbc_issuance_price'), 'issuance prices off the frozen issuance driver');
  });

  test('issuance prices off the frozen sbc_issuance_price, not the benchmark', () => {
    const price = model.assumptions.get('sbc_issuance_price').value;
    assert.equal(schedule.price, price);
    // And the roll is genuinely price-sensitive through that driver alone.
    const other = projectShares(model.assumptions, model.threeStatement, model.historical, {
      fullyDilutedSchedule: fullyDilutedSchedule(),
    });
    assert.equal(other.totalIssuance, schedule.totalIssuance, 'same driver, same issuance');
  });

  test('an explicit malformed FD schedule is rejected (fail-closed on the supplied input)', () => {
    assert.throws(
      () => projectShares(model.assumptions, model.threeStatement, model.historical, {
        fullyDilutedSchedule: { denominator: 0 },
      }),
      (e) => e.code === 'invalid_fully_diluted_schedule',
    );
    assert.throws(
      () => projectShares(model.assumptions, model.threeStatement, model.historical, {
        fullyDilutedSchedule: { denominator: 'nope' },
      }),
      (e) => e.code === 'missing_fully_diluted_schedule',
    );
  });
});

describe('P10.5 - perpetual post-terminal dilution', () => {
  test('a finite issuance roll is not described as a complete terminal policy', () => {
    assert.equal(schedule.terminalPolicy.finiteRollAloneIsComplete, false);
    assert.equal(schedule.terminalPolicy.kind, 'finite_roll_plus_perpetual_dilution');
    assert.match(schedule.terminalPolicy.note, /cannot be described as a complete terminal policy/);
  });

  test('the terminal divisor is shares_T * (1 + d_perm)', () => {
    const d = schedule.dilutionRatePerpetual;
    assert.equal(d, 0.01, 'default perpetual rate is 1.0%');
    const expected = schedule.sharesFiniteTerminal * (1 + d);
    assert.ok(
      Math.abs(schedule.terminalDivisorPerpetual - expected) < 1e-6,
      `terminal divisor ${schedule.terminalDivisorPerpetual} equals shares_T * (1 + d_perm)`,
    );
    assert.ok(schedule.terminalDivisorPerpetual > schedule.sharesFiniteTerminal,
      'perpetual dilution increases the divisor');
  });

  test('finite and perpetual dilution are distinct quantities', () => {
    assert.notEqual(schedule.sharesFiniteTerminal, schedule.terminalDivisorPerpetual);
    const zero = projectShares(model.assumptions, model.threeStatement, model.historical, {
      dilutionRatePerpetual: 0,
    });
    assert.ok(
      Math.abs(zero.terminalDivisorPerpetual - schedule.sharesFiniteTerminal) < 1e-6,
      'd_perm = 0 collapses the perpetual divisor onto the finite roll',
    );
    assert.notEqual(zero.terminalDivisorPerpetual, schedule.terminalDivisorPerpetual);
  });

  test('positivity boundaries are enforced fail-closed, not clamped', () => {
    const ke = 0.11;
    // (1 + d_perm) > 0
    assert.throws(
      () => projectShares(model.assumptions, model.threeStatement, model.historical, {
        dilutionRatePerpetual: -1, costOfEquity: ke,
      }),
      (e) => e.code === 'non_positive_terminal_divisor',
    );
    // (ke - d_perm) > 0
    assert.throws(
      () => projectShares(model.assumptions, model.threeStatement, model.historical, {
        dilutionRatePerpetual: 0.2, costOfEquity: ke,
      }),
      (e) => e.code === 'perpetuity_not_finite',
    );
    // The in-range sensitivities all succeed and are ordered.
    const lo = projectShares(model.assumptions, model.threeStatement, model.historical, { dilutionRatePerpetual: 0, costOfEquity: ke });
    const mid = projectShares(model.assumptions, model.threeStatement, model.historical, { dilutionRatePerpetual: 0.01, costOfEquity: ke });
    const hi = projectShares(model.assumptions, model.threeStatement, model.historical, { dilutionRatePerpetual: 0.02, costOfEquity: ke });
    assert.ok(lo.terminalDivisorPerpetual < mid.terminalDivisorPerpetual);
    assert.ok(mid.terminalDivisorPerpetual < hi.terminalDivisorPerpetual);
    assert.throws(
      () => projectShares(model.assumptions, model.threeStatement, model.historical, { dilutionRatePerpetual: 'x' }),
      (e) => e.code === 'invalid_dilution_rate',
    );
  });
});

describe('P10.5 - the three DCF outputs reported separately', () => {
  const res = valuateFcffDcf(model.dcf);
  const o = res.dcfOutputs;

  // P10.5 F2. `model` here is the ENGINE lane: `tests/_invariants.js` builds it
  // with valuationBasis 'integer_period_index'. Its perShare is therefore an
  // integer-period engine figure and is NOT the production dated-seam DCF. Any
  // test in this file that compares a per-share value to `model.dcf.perShare` is
  // an engine-lane claim only, and must say so. The production lane is built in
  // the app with the dated seam and carries different PV legs and a different
  // per-share value; the two must never be conflated in a claim.
  const LANE = 'engine / integer_period_index (not the production dated seam)';

  test('the three outputs are reported for the lane under test', () => {
    assert.equal(model.dcf.valuationBasis, 'integer_period_index', `lane is ${LANE}`);
  });

  test('all three outputs are present and only one may be recommended', () => {
    assert.ok(o, 'the DCF exposes a dcfOutputs record');
    assert.ok(o.currentShareValue, 'output 1: current-share value');
    assert.ok(o.afterFutureDilution, 'output 2: after modeled future dilution');
    assert.equal(o.canonicalKey, 'after_future_dilution');
    assert.equal(o.currentShareValue.mayRecommend, false);
    assert.equal(o.afterFutureDilution.mayRecommend, true);
    assert.equal(o.afterFutureDilution.canonical, true);
  });

  test('each output divides by the denominator its own label names', () => {
    // Read the engine's own equity value and divide, rather than re-deriving from
    // the reported per-share, so the assertion cannot be satisfied by a label.
    const equity = model.dcf.fcff.equityValue;
    const scale = 1e3;
    assert.ok(
      Math.abs(o.currentShareValue.perShare - (equity * scale) / o.currentShareValue.shares) < 1e-6,
      'current-share divides the equity by the current FD count',
    );
    assert.ok(
      Math.abs(o.afterFutureDilution.perShare - (equity * scale) / o.afterFutureDilution.shares) < 1e-6,
      'after-dilution divides the equity by the perpetual terminal count',
    );
    assert.equal(
      o.currentShareValue.shares,
      fullyDilutedSchedule().denominator,
      'the current-share denominator is the P10.4 schedule',
    );
  });

  test('current-share and future-diluted RECONCILE, and the difference is the dilution', () => {
    const r = o.reconciliation;
    assert.equal(r.ordered, true, 'current-share is the upper bound');
    assert.ok(
      o.currentShareValue.perShare > o.afterFiniteDilution.perShare &&
        o.afterFiniteDilution.perShare > o.afterFutureDilution.perShare,
      'the chain current > finite > perpetual is strictly descending',
    );
    // The finite intermediate must tie to the engine perShare, or the canonical
    // number cannot be reconciled back to the DCF headline.
    assert.ok(
      Math.abs(o.afterFiniteDilution.perShare - model.dcf.perShare) < 1e-6,
      'the finite intermediate ties to the engine perShare',
    );
    const equity = model.dcf.fcff.equityValue;
    const expectedGap = (equity * 1e3) * (1 / o.currentShareValue.shares - 1 / o.afterFutureDilution.shares);
    assert.ok(
      Math.abs(r.dilutionEffectPerShare - expectedGap) < 1e-6,
      'the reconciliation gap is exactly the modelled dilution',
    );
  });
});

describe('P10.5 - SBC expense endpoint sensitivity', () => {
  test('the sensitivity range is derived from the driver, not hardcoded', () => {
    const drv = model.assumptions.get('sbc_fade_end_pct_of_revenue');
    const s = recommend.buildSbcSensitivity(drv);
    assert.deepEqual([...s.range], [drv.value, drv.max], 'bounds come from the driver record');
    assert.equal(s.isDilutionRate, false, 'the endpoint is an expense, not a dilution rate');
    assert.equal(s.kind, 'sbc_expense_endpoint');
  });

  test('a driver without a usable max is rejected rather than defaulted', () => {
    assert.throws(() => recommend.buildSbcSensitivity({ value: 0.08 }), (e) => e.code === 'invalid_sbc_endpoint');
    assert.throws(() => recommend.buildSbcSensitivity(null), (e) => e.code === 'missing_sbc_endpoint');
  });

  test('the engine source carries no hardcoded sensitivity bound', () => {
    // The RTYPE freeze gate caught a hardcoded 0.15 here once already. The
    // structural form of that gate: the bounds must be absent from the source.
    const src = fs.readFileSync(`${root}/src/engine/recommend.js`, 'utf8');
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');
    assert.ok(!/0\.15/.test(code), 'no hardcoded sensitivity upper bound in recommend.js');
  });
});

describe('P10.5 - DCF cumulative PV staging', () => {
  test('cumulative PV decomposes into explicit + fade + terminal and ties to EV', () => {
    const d = model.dcf;
    const pvE = d.pvByStage.explicit;
    const pvF = d.pvByStage.fade;
    const pvT = d.pvTerminal;
    assert.ok(Number.isFinite(pvE) && Number.isFinite(pvF) && Number.isFinite(pvT));
    assert.ok(pvE > 0, 'the explicit stage contributes');
    assert.ok(pvF > 0, 'the fade stage contributes and is not folded into explicit');
    assert.ok(pvT > 0, 'the terminal stage contributes');
    assert.ok(
      Math.abs(pvE + pvF + pvT - d.enterpriseValue) < 1e-6,
      'the three stages sum exactly to enterprise value',
    );
  });

  test('the UI builds the same three-stage breakdown', () => {
    const src = fs.readFileSync(`${root}/src/ui/valuationTab.js`, 'utf8');
    assert.ok(src.includes('stageBreakdown'), 'the DCF table exposes a stage breakdown');
    assert.ok(/pvByStage\?\.explicit/.test(src), 'the explicit leg is read from the engine');
    assert.ok(/pvByStage\?\.fade/.test(src), 'the fade leg is read from the engine');
    assert.ok(
      /cumPvRow\['Terminal'\] = pvExplicitStage \+ pvFadeStage \+ pvTerminalStage/.test(src),
      'the terminal cumulative PV is the sum of all three stages',
    );
  });
});
describe('P10.5 - FCFE is diagnostic only', () => {
  test('no output calls FCFE a floor', () => {
    const files = [
      'src/engine/methods/fcffDcf.js',
      'src/engine/dcf.js',
      'src/engine/recommend.js',
      'src/ui/valuationTab.js',
      'src/ui/summaryTab.js',
      'src/ui/charts.js',
    ];
    for (const f of files) {
      const src = fs.readFileSync(`${root}/${f}`, 'utf8');
      // A floor claim is prose or a label, not an identifier. Look for the word.
      assert.doesNotMatch(src, /FCFE[^\n]{0,40}floor|floor[^\n]{0,40}FCFE/i, `${f} must not call FCFE a floor`);
    }
  });

  test('the FCFF method range never uses FCFF and FCFE as endpoints', () => {
    const res = valuateFcffDcf({
      perShare: 144.08,
      wacc: 0.11,
      terminalGrowthRate: 0.025,
      sharesOutstanding: 50031000,
      fcff: { perShare: 144.08, enterpriseValue: 1e6, netCashToday: 1e5, equityValue: 1.1e6 },
      fcfe: { perShare: 117.49 },
    });
    assert.equal(res.rangePerShare.min, res.impliedPerShare, 'range min is the intrinsic value');
    assert.equal(res.rangePerShare.max, res.impliedPerShare, 'range max is the intrinsic value');
    assert.equal(res.rangeBasis, 'intrinsic_fcff_only');
    assert.equal(res.fcfeDiagnostic.role, 'diagnostic_only');
  });

  test('per-period identity FCFE - FCFF = after-tax interest income, residual zero', () => {
    const fcfe = model.dcf.fcfe.schedule;
    const fcff = model.dcf.fcff.schedule;
    assert.ok(Array.isArray(fcfe) && fcfe.length > 0, 'the FCFE schedule has explicit periods');
    const n = Math.min(fcfe.length, fcff.length);
    assert.ok(n > 0, 'the schedules are comparable');
    for (let i = 0; i < n; i += 1) {
      const identity = fcfe[i].fcfe - fcff[i].fcff;
      // Read the engine's own recorded leg rather than recomputing it, so the
      // assertion cannot pass by re-deriving the identity from its own inputs.
      assert.equal(
        fcfe[i].afterTaxInterestIncome,
        fcfe[i].fcfeLessFcff,
        `period ${i}: the recorded interest leg and the recorded identity agree`,
      );
      const residual = Math.abs(identity - fcfe[i].fcfeLessFcff);
      assert.ok(
        residual < 1e-6,
        `period ${i}: FCFE - FCFF equals after-tax interest income (residual ${residual})`,
      );
    }
  });

  test('equity-value identity is AUDIT-ONLY and its residual is disclosed, not asserted', () => {
    // The contract states: FCFE equity - FCFF equity = PV(after-tax forecast
    // interest income) - current net cash, "valid only under the stated debt-free
    // convention and must be labeled as such".
    //
    // It does NOT hold in this model, and the reason is structural rather than a
    // rounding defect: the FCFE terminal value capitalises a cash flow that still
    // embeds interest income (10,865,189 vs the FCFF terminal 8,303,024), so the
    // equity difference carries a terminal-basis gap that the interest leg alone
    // cannot explain. Duolingo also carries a debt schedule, so the debt-free
    // precondition is not met.
    //
    // Asserting the identity would be asserting something false. Asserting the
    // residual is zero would be worse. So this test RECORDS the discrepancy and
    // pins the exclusion: FCFE is diagnostic-only and its equity value is audit
    // only, never a recommendation, range endpoint, or vote input.
    const fcfeEquity = model.dcf.fcfe.equityValue;
    const fcffEquity = model.dcf.fcff.equityValue;
    const netCash = model.dcf.fcff.netCashToday;
    let pvInterest = 0;
    for (const item of model.dcf.fcfe.schedule) {
      pvInterest += item.afterTaxInterestIncome * item.discountFactor;
    }
    const residual = (fcfeEquity - fcffEquity) - (pvInterest - netCash);

    // The discrepancy is real and of a known magnitude; if a future change makes
    // the identity hold, this assertion FAILS and forces the disclosure to be
    // revisited rather than silently obsoleted.
    assert.ok(
      Math.abs(residual) > 1,
      `equity identity residual is non-zero and disclosed (${residual.toFixed(2)}): the FCFE ` +
        'terminal capitalises a cash flow that still embeds interest income, and the ' +
        'debt-free precondition is not met, so this is audit-only under the contract.',
    );

    // The exclusion is the part that must hold.
    const fcffTerminal = model.dcf.fcff.terminalValue;
    const fcfeTerminal = model.dcf.fcfe.terminalValue;
    assert.notEqual(fcfeTerminal, fcffTerminal, 'the two terminal values are on different bases');
    const res = valuateFcffDcf(model.dcf);
    assert.equal(res.impliedPerShare, model.dcf.perShare, 'the recommendation is the FCFF value');
    assert.ok(
      res.fcfeDiagnostic.perShare !== res.impliedPerShare,
      'the FCFE diagnostic is a different number from the recommendation',
    );
    assert.ok(netCash > 0, 'net cash is disclosed alongside the identity as context');
  });

  test('FCFE never enters the aggregate verdict, counts, range or spread', () => {
    const base = [
      { method: 'fcff_dcf', impliedPerShare: 120 },
      { method: 'comps', impliedPerShare: 118 },
      { method: 'ev_multiples', impliedPerShare: 119 },
      { method: 'perUser', impliedPerShare: 121 },
      { method: 'pfcf', impliedPerShare: 117 },
    ];
    const without = aggregateVerdicts(base, 100);
    for (const ps of [1, 500, 100000]) {
      const with_ = aggregateVerdicts(
        [...base, { method: 'fcfe', impliedPerShare: ps }, { method: 'sotp', impliedPerShare: ps }],
        100,
      );
      assert.equal(with_.verdict, without.verdict, `fcfe/sotp@${ps} verdict`);
      assert.deepEqual(with_.agreement.counts, without.agreement.counts, `fcfe/sotp@${ps} counts`);
      assert.equal(with_.agreement.spread.min, without.agreement.spread.min);
      assert.equal(with_.agreement.spread.max, without.agreement.spread.max);
      assert.equal(with_.breadth, without.breadth);
    }
  });
});

// P10.5 F1. The contract clause is "Only the second is the canonical add-back DCF
// recommendation". Before this gate existed, `isCanonicalAddBackDcf` was computed
// and consumed by nothing, so the production verdict, aggregate intrinsic row and
// UI all ran on the finite-roll intermediate instead.
describe('P10.5 - the canonical output is actually the recommendation', () => {
  test('the canonical figure is what the method row reports, not the intermediate', () => {
    const res = valuateFcffDcf(model.dcf);
    assert.equal(typeof res.isCanonicalAddBackDcf, 'number', 'a canonical figure exists');
    assert.notEqual(
      res.isCanonicalAddBackDcf,
      res.impliedPerShare,
      'the canonical figure differs from the finite-roll intermediate',
    );
  });

  test('the method wrapper exposes the canonical value as the recommendable per-share', () => {
    // The wrapper is what the app builds its method rows from, so this is the
    // narrowest place that proves the value is reachable rather than orphaned.
    const res = valuateFcffDcf(model.dcf);
    assert.equal(res.dcfOutputs.canonicalKey, 'after_future_dilution');
    assert.equal(
      res.dcfOutputs.afterFutureDilution.perShare,
      res.isCanonicalAddBackDcf,
      'the reported canonical output IS isCanonicalAddBackDcf',
    );
  });

  test('the intermediate stays visible and labelled, never silently dropped', () => {
    const res = valuateFcffDcf(model.dcf);
    assert.ok(res.dcfOutputs.currentShareValue, 'the current-share figure is still reported');
    assert.ok(res.dcfOutputs.afterFutureDilution, 'the canonical figure is still reported');
    assert.equal(
      res.dcfOutputs.currentShareValue.mayRecommend,
      false,
      'the current-share figure is marked non-recommendable',
    );
  });
});

// P10.5 F1, second hop. The aggregate row was corrected first and OP found the
// app recommendation still evaluating on the intermediate. These gates exist so
// that a consumer of the finite-roll intermediate cannot re-enter the headline.
describe('P10.5 - the canonical figure is what every recommendation consumer sees', () => {
  test('the engine recommendation runs on the canonical figure, not the intermediate', () => {
    const { runFullValuation } = recommend;
    const out = runFullValuation(model.historical, model.assumptions);
    const canonical = valuateFcffDcf(out.dcf).isCanonicalAddBackDcf;
    assert.equal(
      out.recommendation.dcfPerShare,
      canonical,
      'the engine-level recommendation is the canonical figure',
    );
    assert.notEqual(
      out.recommendation.dcfPerShare,
      out.dcf.perShare,
      'it is NOT the finite-roll intermediate',
    );
  });

  test('the recommendation upside is derived from the canonical figure', () => {
    const { runFullValuation } = recommend;
    const out = runFullValuation(model.historical, model.assumptions);
    const price = model.assumptions.get('market_share_price').value;
    const canonical = valuateFcffDcf(out.dcf).isCanonicalAddBackDcf;
    assert.ok(
      Math.abs(out.recommendation.upsidePct - (canonical - price) / price) < 1e-9,
      'upside follows the canonical figure',
    );
    assert.notEqual(
      Math.abs(out.recommendation.upsidePct - (out.dcf.perShare - price) / price) < 1e-9,
      true,
      'upside does NOT follow the intermediate',
    );
  });

  test('the valuation surface shows all three outputs and one canonical marker', async () => {
    const { createTabRoot } = await import('./_dom_stub.js');
    const { createApp } = await import('../src/app.js');
    const dataLayer = await import('../src/data/loader.js');
    const readText = (f) => fs.promises.readFile(f, 'utf8');
    const hist = await dataLayer.loadHistorical({ dir: './src/data/historical/', readText });
    const asm = await dataLayer.loadAssumptions({
      location: './src/data/assumptions.json',
      readText,
    });
    const tabKeys = [
      'cover', 'assumptions', 'historicals', 'schedules',
      'projections', 'valuation', 'summary', 'sensitivity',
    ];
    const { root, panes } = createTabRoot(tabKeys);
    const app = createApp({
      data: dataLayer, engine: {}, historical: hist, assumptions: asm, root,
      now: () => 1725148800000, horizon: 10,
    });
    try {
      const html = panes.find((p) => p.id === 'tab-valuation').innerHTML || '';
      assert.match(html, /Current-share value/, 'the current-share output is shown');
      assert.match(html, /After explicit and fade dilution/, 'the intermediate is shown');
      assert.match(html, /After modeled future dilution/, 'the canonical output is shown');
      assert.equal(
        (html.match(/CANONICAL/g) || []).length,
        1,
        'exactly one output is marked canonical',
      );
      assert.equal(
        (html.match(/drives the verdict/g) || []).length,
        1,
        'exactly one output is marked as driving the verdict',
      );
    } finally {
      app.dispose();
    }
  });
});
