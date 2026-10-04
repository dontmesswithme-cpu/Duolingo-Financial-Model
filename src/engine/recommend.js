/**
 * Recommendation & Valuation Sensitivity Engine (P4.3).
 *
 * Implements the spec §3.2 frozen interface:
 *   `recommend.evaluate(dcfPerShare: number, marketPrice: number): Recommendation`
 *
 * Plus additive helper functions sanctioned for Phase 4 & Phase 5 UI reuse:
 *   `recommend.buildSensitivityGrid(input: SensitivityInput): SensitivityGrid`
 *   `recommend.runFullValuation(historical, assumptions, scenario?): FullValuationOutput`
 *
 * Mechanical Recommendation Rules:
 *  - upsidePct = (dcfPerShare − marketPrice) / marketPrice
 *  - label is strictly 'undervalued' | 'fair' | 'overvalued' per RECOMMENDATION_THRESHOLDS from constants.js:
 *      upsidePct >= RECOMMENDATION_THRESHOLDS.undervalued (+15%) -> 'undervalued'
 *      upsidePct <= RECOMMENDATION_THRESHOLDS.overvalued (-15%) -> 'overvalued'
 *      otherwise -> 'fair'
 *  - Zero editorial language — the label vocabulary is exactly 'undervalued' | 'fair' | 'overvalued'.
 *
 * Sensitivity Grid Rules:
 *  - WACC × terminal growth per-share matrix
 *  - Default grid: WACC ± 200bps in 50bps steps × terminal growth 1.0%–3.0% in 50bps steps
 *  - Every cell enforces WACC > g guard (no silent overflow / NaN)
 *  - Strict monotonicity: perShare ↓ as WACC ↑, perShare ↑ as g ↑
 *
 * Full-Path Valuation Pipeline:
 *  - assumptions -> scenarios.apply -> schedules.build -> forecast.project ->
 *    threeStatement.project -> wacc.build -> dcf.valuate -> recommend.evaluate
 *
 * Engine Hygiene:
 *  - Pure module: zero DOM, zero fetch, zero Date.now, zero Math.random
 *  - Zero bare numeric literals > 999 outside comments
 *  - Deeply frozen immutable output graph
 *
 * @module src/engine/recommend
 */

import { EngineError } from '../data/errors.js';
import {
  RECOMMENDATION_THRESHOLDS,
  DEFAULT_SCENARIO,
  SCENARIO_NAMES,
  SBC_FADE_STEADY_STATE_PCT,
  UNITS,
} from '../data/constants.js';
import schedulesEngine from './schedules.js';
import forecastEngine from './forecast.js';
import threeStatementEngine from './threeStatement.js';
import { apply as applyScenario } from './scenarios.js';
import { build as buildWacc } from './wacc.js';
import { valuate as valuateDcf } from './dcf.js';
import { projectShares, fullyDilutedSchedule } from './shares.js';
import { valuateFcffDcf } from './methods/fcffDcf.js';

/** Derived / judgment marking. */
const EST = 'EST';

/** Market-sourced marking. */
const MKT = 'MKT';

/**
 * Freezes an object graph recursively so no consumer can mutate engine output.
 *
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/**
 * Reads a driver object from an AssumptionSet and asserts that its value is finite.
 *
 * @param {object} assumptions
 * @param {string} name
 * @returns {object}
 * @throws {EngineError} `missing_driver` when absent or non-finite.
 */
function requireDriverValue(assumptions, name) {
  const driver =
    assumptions && typeof assumptions.get === 'function'
      ? assumptions.get(name)
      : assumptions && typeof assumptions === 'object'
        ? assumptions[name]
        : null;

  if (!driver || typeof driver !== 'object' || !Number.isFinite(driver.value)) {
    throw new EngineError(
      'missing_driver',
      `Required driver "${name}" is missing or non-finite in the assumption set.`,
      name,
    );
  }

  return driver;
}

/**
 * Evaluates the mechanical investment recommendation from DCF intrinsic value vs market price.
 *
 * FROZEN signature per spec §3.2:
 *   `recommend.evaluate(dcfPerShare: number, marketPrice: number): Recommendation`
 *
 * @param {number} dcfPerShare Intrinsic equity value per share from DCF (in USD)
 * @param {number} marketPrice Benchmark market share price from MKT snapshot (in USD)
 * @returns {object} Frozen Recommendation object
 * @throws {EngineError} If inputs are non-finite or non-positive
 */
export function evaluate(dcfPerShare, marketPrice) {
  if (typeof dcfPerShare !== 'number' || !Number.isFinite(dcfPerShare) || dcfPerShare <= 0) {
    throw new EngineError(
      'invalid_dcf_per_share',
      `dcfPerShare must be a positive finite number (received ${dcfPerShare}).`,
      'dcfPerShare',
    );
  }

  if (typeof marketPrice !== 'number' || !Number.isFinite(marketPrice) || marketPrice <= 0) {
    throw new EngineError(
      'invalid_market_price',
      `marketPrice must be a positive finite number (received ${marketPrice}).`,
      'marketPrice',
    );
  }

  const upsidePct = (dcfPerShare - marketPrice) / marketPrice;

  let label = 'fair';
  if (upsidePct >= RECOMMENDATION_THRESHOLDS.undervalued) {
    label = 'undervalued';
  } else if (upsidePct <= RECOMMENDATION_THRESHOLDS.overvalued) {
    label = 'overvalued';
  }

  const result = {
    dcfPerShare,
    marketPrice,
    upsidePct,
    label,
    thresholds: RECOMMENDATION_THRESHOLDS,
    isComputed: true,
    isEstimate: true,
    marking: EST,
    derivedFrom: Object.freeze([
      Object.freeze({
        kind: 'dcfPerShare',
        value: dcfPerShare,
        marking: EST,
      }),
      Object.freeze({
        kind: 'marketPrice',
        value: marketPrice,
        marking: MKT,
      }),
      Object.freeze({
        kind: 'recommendationThresholds',
        undervalued: RECOMMENDATION_THRESHOLDS.undervalued,
        overvalued: RECOMMENDATION_THRESHOLDS.overvalued,
      }),
    ]),
  };

  return deepFreeze(result);
}

/**
 * Builds a WACC × terminal growth sensitivity grid.
 *
 * @param {object} input SensitivityInput
 * @param {object} input.threeStatement ThreeStatementOutput
 * @param {object} input.assumptions Base or scenario AssumptionSet
 * @param {object|number} [input.wacc] Optional base WaccBuild or WACC rate
 * @param {object} [input.shares] Optional prebuilt SharesSchedule (else built from input.corpus)
 * @param {object|Array} [input.corpus] Corpus rows or historical object for the EIG-B roll
 * @param {number[]} [input.waccValues] Custom WACC values
 * @param {number[]} [input.growthValues] Custom terminal growth rates
 * @param {number} [input.horizon] Forecast horizon
 * @returns {object} Frozen SensitivityGrid
 */
export function buildSensitivityGrid(input) {
  if (!input || typeof input !== 'object') {
    throw new EngineError(
      'missing_input',
      'buildSensitivityGrid() requires an input object.',
      'input',
    );
  }

  // Support both canonical and documented alias keys (phase_4.md:110 vs implementation)
  const threeStatement = input.threeStatement ?? input.threeStatementBase;
  const assumptions = input.assumptions ?? input.assumptionsBase;
  const horizon = input.horizon;
  // Production threads the P10.2 dated valuation seam through every cell so the
  // grid center and the headline value are built on one identical basis.
  const datedSeamInput = input.datedSeam === true ? { datedSeam: true } : {};

  if (!threeStatement || typeof threeStatement !== 'object') {
    throw new EngineError(
      'missing_input',
      'buildSensitivityGrid() requires a threeStatement object.',
      'threeStatement',
    );
  }

  if (!assumptions || typeof assumptions !== 'object') {
    throw new EngineError(
      'missing_input',
      'buildSensitivityGrid() requires an assumptions object.',
      'assumptions',
    );
  }

  // Resolve base WACC
  let baseWaccRate = null;
  const waccInput = input.wacc ?? input.waccBase;
  if (typeof waccInput === 'number') {
    baseWaccRate = waccInput;
  } else if (waccInput && typeof waccInput === 'object') {
    baseWaccRate = waccInput.wacc?.value ?? waccInput.wacc ?? waccInput.value ?? null;
  }

  if (baseWaccRate === null) {
    const waccOut = buildWacc({ assumptions, debtSchedule: threeStatement.supporting?.debt });
    baseWaccRate = waccOut.wacc.value;
  }

  const baseGrowth = requireDriverValue(assumptions, 'terminal_growth_rate').value;

  // ── EIG-B share roll-forward (EP.2): one schedule for the whole grid — WACC
  // and g move cell to cell, but the SBC roll does not. A caller-supplied
  // `input.shares` schedule is used verbatim; otherwise it is built once from
  // the live assumptions, three-statement output, and `input.corpus`.
  // Fail-closed: no static-share path exists for grid cells either.
  let gridShares = null;
  if (input.shares && typeof input.shares === 'object') {
    if (!Number.isFinite(input.shares.sharesDcf) || input.shares.sharesDcf <= 0) {
      throw new EngineError(
        'invalid_shares',
        'buildSensitivityGrid() input.shares must carry a positive finite sharesDcf.',
        'shares',
      );
    }
    gridShares = input.shares;
  } else if (typeof input.corpus !== 'undefined') {
    gridShares = projectShares(assumptions, threeStatement, input.corpus, {
      fullyDilutedSchedule: fullyDilutedSchedule(),
    });
  } else {
    throw new EngineError(
      'missing_input',
      'buildSensitivityGrid() requires input.shares or input.corpus for the EIG-B roll-forward.',
      'shares',
    );
  }

  // Default WACC values: WACC ± 200bps in 50bps steps (9 points)
  const defaultWaccOffsets = [-0.02, -0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015, 0.02];
  const customWaccValues = input.waccValues ?? input.waccRange;
  const waccValues = Array.isArray(customWaccValues)
    ? customWaccValues.slice()
    : defaultWaccOffsets.map((offset) => Number((baseWaccRate + offset).toFixed(6)));

  // Default terminal growth values: 1.0% to 3.0% in 50bps steps (5 points)
  const defaultGrowthValues = [0.01, 0.015, 0.02, 0.025, 0.03];
  const customGrowthValues = input.growthValues ?? input.terminalGrowthRange;
  const growthValues = Array.isArray(customGrowthValues)
    ? customGrowthValues.slice()
    : defaultGrowthValues;

  const cells = [];
  const matrix = {};

  for (const waccVal of waccValues) {
    matrix[waccVal] = {};
    for (const gVal of growthValues) {
      if (!Number.isFinite(waccVal) || !Number.isFinite(gVal)) {
        throw new EngineError(
          'invalid_sensitivity_values',
          `Non-finite grid value encountered: wacc=${waccVal}, growth=${gVal}.`,
          'sensitivityGrid',
        );
      }

      if (waccVal <= gVal) {
        throw new EngineError(
          'terminal_growth_exceeds_wacc',
          `Sensitivity cell requires WACC > g (cell has WACC=${waccVal}, g=${gVal}).`,
          'terminal_growth_rate',
        );
      }

      // Re-run valuation with cell WACC and growth rate
      const cellDcf = valuateDcf(threeStatement, waccVal, {
        assumptions: {
          ...assumptions,
          get(name) {
            if (name === 'terminal_growth_rate') {
              const d = assumptions.get(name);
              return d ? { ...d, value: gVal } : { value: gVal };
            }
            return assumptions.get ? assumptions.get(name) : assumptions[name];
          },
        },
        horizon,
        shares: gridShares,
        ...datedSeamInput,
      });

      const cellRecord = Object.freeze({
        wacc: waccVal,
        growth: gVal,
        perShare: cellDcf.perShare,
        enterpriseValue: cellDcf.enterpriseValue,
        equityValue: cellDcf.equityValue,
        pvExplicit: cellDcf.pvExplicit,
        terminalValue: cellDcf.terminalValue,
        pvTerminal: cellDcf.pvTerminal,
      });

      cells.push(cellRecord);
      matrix[waccVal][gVal] = cellRecord;
    }
  }

  // Base case valuation
  const baseDcf = valuateDcf(threeStatement, baseWaccRate, {
    assumptions,
    horizon,
    shares: gridShares,
    ...datedSeamInput,
  });

  const gridResult = {
    waccValues: Object.freeze(waccValues),
    growthValues: Object.freeze(growthValues),
    cells: Object.freeze(cells),
    matrix: Object.freeze(matrix),
    base: Object.freeze({
      wacc: baseWaccRate,
      growth: baseGrowth,
      perShare: baseDcf.perShare,
      enterpriseValue: baseDcf.enterpriseValue,
    }),
    basePerShare: baseDcf.perShare,
    isComputed: true,
    isEstimate: true,
    marking: EST,
  };

  return deepFreeze(gridResult);
}

/**
 * Recomputes per-share value across the SBC-treatment sensitivity band and
 * reports whether the recommendation label is stable (EP.4, R5, §8).
 *
 * Band treatments, all re-derived from drivers and statement lines (the
 * rejected uncharged-netting variant is excluded by construction):
 *  - `gross-issuance`: the headline (BOP plus gross SBC issuance at spot).
 *  - `charged-netting`: buyback shares retired at spot AND buyback spend
 *    charged at present value (value-neutral at fair price, within $1).
 *  - `pv-discounted`: SBC present-valued at WACC, converted at spot.
 *  - `sbc-fade`: SBC ratio fades linearly from the target driver to the
 *    steady-state constant; add-back and issuance dials move together while
 *    statements stay frozen (first-order sensitivity — the coherent rebuild
 *    is the deferred §10.4 revision).
 *  - `perpetual-expense`: SBC treated as pure cash expense (no add-back,
 *    no issuance; BOP shares).
 *
 * Every label comes from `evaluate()` against the MKT price driver — no
 * hand-typed band values anywhere on this path.
 *
 * @param {object} input Band input.
 * @param {object} input.threeStatement ThreeStatementOutput.
 * @param {object} input.dcf DcfResult from `dcf.valuate()`.
 * @param {object} input.assumptions Base or scenario AssumptionSet.
 * @param {object|Array|null} [input.corpus] Corpus rows or historical object
 *   for the hybrid H1 SBC leg (required exactly when the model is hybrid).
 * @returns {object} Frozen `{ labelStable, treatments, headlineLabel }`.
 * @throws {EngineError} On missing inputs, drivers, lines, or non-finite values.
 */
export function buildLabelStability(input) {
  if (!input || typeof input !== 'object') {
    throw new EngineError(
      'missing_input',
      'buildLabelStability() requires an input object.',
      'input',
    );
  }
  const threeStatement = input.threeStatement;
  const dcf = input.dcf;
  const assumptions = input.assumptions;
  if (!threeStatement || typeof threeStatement !== 'object') {
    throw new EngineError(
      'missing_input',
      'buildLabelStability() requires a threeStatement object.',
      'threeStatement',
    );
  }
  if (!dcf || typeof dcf !== 'object') {
    throw new EngineError(
      'missing_input',
      'buildLabelStability() requires a dcf result object.',
      'dcf',
    );
  }
  if (!assumptions || typeof assumptions !== 'object') {
    throw new EngineError(
      'missing_input',
      'buildLabelStability() requires an assumptions object.',
      'assumptions',
    );
  }

  const price = requireDriverValue(assumptions, 'market_share_price').value;
  // P10.5: the band treatments must roll from the SAME base as the share
  // schedule, or the treatments silently diverge from each other. This line
  // still read the `shares_outstanding` weighted-average driver while
  // `gross-issuance` used the point-in-time fully diluted schedule, which is
  // what pushed the sbc-fade / gross-issuance gap from 0.018 to 0.069 and broke
  // the frozen FP.2 convergence gate. The base is now the FD schedule, and the
  // weighted-average count is not a valuation base anywhere in this module.
  const bopShares = fullyDilutedSchedule().denominator;
  const sbcTarget = requireDriverValue(assumptions, 'sbc_target_pct_of_revenue').value;
  const scale = UNITS.thousands_usd.scale;

  const periods =
    threeStatement.periods ||
    threeStatement.cashFlow.periods ||
    Object.keys(threeStatement.cashFlow.byPeriod || {});
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new EngineError(
      'invalid_horizon',
      'buildLabelStability() requires a non-empty forecast period list.',
      'periods',
    );
  }
  const cfByPeriod = threeStatement.cashFlow.byPeriod;
  const isByPeriod = threeStatement.incomeStatement.byPeriod;
  if (!cfByPeriod || !isByPeriod) {
    throw new EngineError(
      'missing_input',
      'buildLabelStability() requires cashFlow.byPeriod and incomeStatement.byPeriod blocks.',
      'threeStatement',
    );
  }

  let corpus = null;
  if (typeof input.corpus !== 'undefined') {
    corpus = input.corpus;
  }
  const sharesSchedule = projectShares(assumptions, threeStatement, corpus, {
    fullyDilutedSchedule: fullyDilutedSchedule(),
  });

  const discountFactorOf = (period) => {
    if (!Array.isArray(dcf.schedule)) {
      throw new EngineError(
        'missing_input',
        'Band recompute needs the DCF explicit schedule array.',
        'dcf.schedule',
      );
    }
    const item = dcf.schedule.find((s) => s && s.period === period);
    if (!item || !Number.isFinite(item.discountFactor)) {
      throw new EngineError(
        'missing_line',
        `DCF schedule is missing a finite discount factor for "${period}".`,
        period,
      );
    }
    return item.discountFactor;
  };
  const fcffOf = (period) => {
    if (!Array.isArray(dcf.schedule)) {
      throw new EngineError(
        'missing_input',
        'Band recompute needs the DCF explicit schedule array.',
        'dcf.schedule',
      );
    }
    const item = dcf.schedule.find((s) => s && s.period === period);
    if (!item || !Number.isFinite(item.fcf)) {
      throw new EngineError(
        'missing_line',
        `DCF schedule is missing a finite FCFF for "${period}".`,
        period,
      );
    }
    return item.fcf;
  };
  const cfLineOf = (period, block, key) => {
    const container = cfByPeriod[period] && cfByPeriod[period][block];
    const line = container ? container[key] : null;
    const value = line && typeof line === 'object' ? line.value : line;
    if (!Number.isFinite(value)) {
      throw new EngineError(
        'missing_line',
        `Cash-flow line "${block}.${key}" for "${period}" is missing or non-finite.`,
        period,
      );
    }
    return value;
  };
  const revenueOf = (period) => {
    const line =
      isByPeriod[period] && isByPeriod[period].revenue && isByPeriod[period].revenue.total;
    if (!line || !Number.isFinite(line.value)) {
      throw new EngineError(
        'missing_line',
        `Revenue line for "${period}" is missing or non-finite.`,
        period,
      );
    }
    return line.value;
  };

  const sbcSeries = periods.map((period) => sharesSchedule.byPeriod[period].sbcEmbedded);
  const spendSeries = periods.map((period) =>
    Math.abs(cfLineOf(period, 'financing_activities', 'repurchase_of_common_stock')),
  );
  const dfSeries = periods.map(discountFactorOf);
  const fcffSeries = periods.map(fcffOf);
  const revenueSeries = periods.map(revenueOf);

  const terminalLegs = dcf.fcff && dcf.fcff.terminalNormalization;
  if (
    !terminalLegs ||
    !Number.isFinite(terminalLegs.wcInflowTerminal) ||
    !Number.isFinite(terminalLegs.wcInflowSteadyState)
  ) {
    throw new EngineError(
      'missing_input',
      'buildLabelStability() requires the DCF terminal-normalisation legs.',
      'dcf.fcff.terminalNormalization',
    );
  }
  const waccRate = requireFiniteBandNumber(dcf.wacc, 'dcf.wacc');
  const growthRate = requireFiniteBandNumber(dcf.terminalGrowthRate, 'dcf.terminalGrowthRate');
  const terminalDf = discountFactorOf(periods[periods.length - 1]);

  const labelOf = (perShare) => evaluate(perShare, price).label;

  const treatments = [];
  const pushTreatment = (name, perShare) => {
    if (!Number.isFinite(perShare) || perShare <= 0) {
      throw new EngineError(
        'invalid_per_share',
        `Band treatment "${name}" recomputed to a non-positive non-finite value.`,
        name,
      );
    }
    treatments.push(Object.freeze({ name, perShare, label: labelOf(perShare) }));
  };

  // 1. Gross issuance at spot (headline — identical computation, tied out).
  const grossPerShare = (dcf.equityValue * scale) / dcf.sharesOutstanding;
  pushTreatment('gross-issuance', grossPerShare);

  // 2. Charged netting: retire buyback shares at spot AND charge the spend.
  let spendPv = 0;
  let retiredShares = 0;
  for (let i = 0; i < periods.length; i += 1) {
    spendPv += spendSeries[i] * dfSeries[i];
    retiredShares += (spendSeries[i] * scale) / price;
  }
  const chargedEquity = dcf.equityValue - spendPv;
  const chargedShares = dcf.sharesOutstanding - retiredShares;
  pushTreatment('charged-netting', (chargedEquity * scale) / chargedShares);

  // 3. PV-discounted SBC converted at spot.
  let pvSbcDollars = 0;
  for (let i = 0; i < periods.length; i += 1) {
    pvSbcDollars += sbcSeries[i] * scale * dfSeries[i];
  }
  const pvShares = bopShares + pvSbcDollars / price;
  pushTreatment('pv-discounted', (dcf.equityValue * scale) / pvShares);

  // 4. Faded SBC path (first-order sensitivity: the SBC add-back and issuance
  // dials fade linearly from the target driver to the steady-state constant
  // while statements stay frozen — the coherent rebuild is the deferred §10.4
  // revision. Direction and level follow the disclosed band (below gross).
  const sbcFadeEndRecord = assumptions && typeof assumptions.get === 'function'
    ? assumptions.get('sbc_fade_end_pct_of_revenue')
    : null;
  const sbcFadeEnd = sbcFadeEndRecord && typeof sbcFadeEndRecord.value === 'number'
    ? sbcFadeEndRecord.value
    : SBC_FADE_STEADY_STATE_PCT;

  const fadeSpan = periods.length - 1;
  const fadePctAt = (index) => {
    if (periods.length > 5) {
      if (index < 5) return sbcTarget;
      return sbcTarget - (sbcTarget - sbcFadeEnd) * ((index - 5 + 1) / 5);
    }
    return fadeSpan > 0
      ? sbcTarget - (sbcTarget - sbcFadeEnd) * (index / fadeSpan)
      : sbcTarget;
  };
  let fadedPvExplicit = 0;
  let fadedIssuance = 0;
  for (let i = 0; i < periods.length; i += 1) {
    const sbcFaded = revenueSeries[i] * fadePctAt(i);
    if (!Number.isFinite(sbcFaded) || sbcFaded < 0) {
      throw new EngineError(
        'invalid_sbc',
        `Faded SBC for "${periods[i]}" is not a finite non-negative number.`,
        periods[i],
      );
    }
    fadedPvExplicit += (fcffSeries[i] - (sbcSeries[i] - sbcFaded)) * dfSeries[i];
    fadedIssuance += (sbcFaded * scale) / price;
  }
  const terminalIndex = periods.length - 1;
  const fadedTerminalBase =
    fcffSeries[terminalIndex] -
    (sbcSeries[terminalIndex] - revenueSeries[terminalIndex] * fadePctAt(terminalIndex)) -
    terminalLegs.wcInflowTerminal +
    terminalLegs.wcInflowSteadyState;
  const fadedTv = (fadedTerminalBase * (1 + growthRate)) / (waccRate - growthRate);
  const fadedEquity = fadedPvExplicit + fadedTv * terminalDf + dcf.netCash;
  pushTreatment('sbc-fade', (fadedEquity * scale) / (bopShares + fadedIssuance));

  // 5. Perpetual SBC expense (no add-back, no issuance; BOP shares).
  let expensePvExplicit = 0;
  for (let i = 0; i < periods.length; i += 1) {
    expensePvExplicit += (fcffSeries[i] - sbcSeries[i]) * dfSeries[i];
  }
  const expenseTerminalBase =
    fcffSeries[terminalIndex] -
    sbcSeries[terminalIndex] -
    terminalLegs.wcInflowTerminal +
    terminalLegs.wcInflowSteadyState;
  const expenseTv = (expenseTerminalBase * (1 + growthRate)) / (waccRate - growthRate);
  const expenseEquity = expensePvExplicit + expenseTv * terminalDf + dcf.netCash;
  pushTreatment('perpetual-expense', (expenseEquity * scale) / bopShares);

  const headlineLabel = treatments[0].label;
  const labelStable = treatments.every((t) => t.label === headlineLabel);

  return deepFreeze({
    labelStable,
    treatments: Object.freeze(treatments),
    headlineLabel,
  });
}

/**
 * Reads a required finite number from a DCF result field, failing closed.
 *
 * @param {unknown} value Candidate value.
 * @param {string} context Greppable path for the typed error.
 * @returns {number}
 * @throws {EngineError} `missing_input` when absent or non-finite.
 */
function requireFiniteBandNumber(value, context) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EngineError(
      'missing_input',
      `Band recompute needs finite "${context}".`,
      context,
    );
  }
  return value;
}

/**
 * Runs the end-to-end full valuation pipeline for a specified scenario.
 *
 * Full Pipeline:
 *  1. Apply scenario deltas to assumptions: `scenarios.apply(assumptions, scenario)`
 *  2. Build supporting schedules: `schedules.build(historical, activeAssumptions)`
 *  3. Project revenue and costs: `forecast.project({ historical, assumptions: activeAssumptions })`
 *  4. Project 3 statements: `threeStatement.project(schedules, activeAssumptions, forecast)`
 *  5. Build WACC: `wacc.build({ assumptions: activeAssumptions, debtSchedule: schedules.debt })`
 *  6. Run DCF valuation: `dcf.valuate(threeStatement, wacc, { assumptions: activeAssumptions, corpus: historical })`
 *     (EIG-B roll built per scenario from the scenario-applied assumptions)
 *  7. Evaluate recommendation: `recommend.evaluate(dcf.perShare, marketPrice)`
 *
 * @param {object|Array} historical Historical corpus datasets
 * @param {object} assumptions Base or scenario AssumptionSet
 * @param {'bear'|'base'|'bull'} [scenario=DEFAULT_SCENARIO] Scenario name
 * @returns {object} Frozen FullValuationOutput
 */
export function runFullValuation(historical, assumptions, scenario = DEFAULT_SCENARIO, options = {}) {
  if (!historical) {
    throw new EngineError(
      'missing_input',
      'runFullValuation() requires a valid historical dataset.',
      'historical',
    );
  }

  if (!assumptions) {
    throw new EngineError(
      'missing_input',
      'runFullValuation() requires an assumptions set.',
      'assumptions',
    );
  }

  let activeAssumptions = assumptions;
  if (
    typeof scenario === 'string' &&
    SCENARIO_NAMES.includes(scenario) &&
    assumptions.scenario !== scenario
  ) {
    activeAssumptions = applyScenario(assumptions, scenario);
  }

  const horizon = options && typeof options.horizon === 'number' ? options.horizon : undefined;
  const datedSeamInput = options && options.datedSeam === true ? { datedSeam: true } : {};

  const schedulesOut = schedulesEngine.build(historical, activeAssumptions);
  const forecastOut = forecastEngine.project({
    historical,
    assumptions: activeAssumptions,
    ...(typeof horizon === 'number' ? { horizon } : {}),
  });
  const threeStatementOut = threeStatementEngine.project(
    schedulesOut,
    activeAssumptions,
    forecastOut,
  );
  const waccOut = buildWacc({
    assumptions: activeAssumptions,
    debtSchedule: schedulesOut.debt,
  });
  const dcfOut = valuateDcf(threeStatementOut, waccOut, {
    assumptions: activeAssumptions,
    corpus: historical,
    ...(typeof horizon === 'number' ? { horizon } : {}),
    ...datedSeamInput,
  });

  // P10.3 benchmark parity: the comparison price is the CANONICAL benchmark the
  // controller holds, not a re-read of the driver. The benchmark is a
  // recommendation input only — it never reaches the DCF above.
  const marketPrice = Number.isFinite(options?.marketPrice) && options.marketPrice > 0
    ? options.marketPrice
    : requireDriverValue(activeAssumptions, 'market_share_price').value;

  // P10.5 F1. The recommendation is driven by the CANONICAL add-back DCF — the
  // after-modelled-future-dilution output — and NOT by `dcfOut.perShare`, which
  // is the finite-roll intermediate. The contract allows only the canonical
  // output to drive a recommendation. This call previously used the
  // intermediate, so the headline, its upside and every consumer of the
  // recommendation were computed on a figure the contract says is not
  // recommendable. Fixing it here rather than in the app means the base case AND
  // every scenario are corrected by one change, since all of them are produced
  // by this function. Falls back to the intermediate only if the engine produced
  // no canonical figure, which its positivity guards make unreachable.
  const canonicalPerShare = valuateFcffDcf(dcfOut).isCanonicalAddBackDcf;
  const recOut = evaluate(
    typeof canonicalPerShare === 'number' ? canonicalPerShare : dcfOut.perShare,
    marketPrice,
  );

  const labelStability = buildLabelStability({
    threeStatement: threeStatementOut,
    dcf: dcfOut,
    assumptions: activeAssumptions,
    corpus: historical,
  });

  const fullOutput = {
    scenario: activeAssumptions.scenario || scenario || DEFAULT_SCENARIO,
    assumptions: activeAssumptions,
    schedules: schedulesOut,
    forecast: forecastOut,
    threeStatement: threeStatementOut,
    incomeStatement: threeStatementOut.incomeStatement,
    balanceSheet: threeStatementOut.balanceSheet,
    cashFlow: threeStatementOut.cashFlow,
    wacc: waccOut,
    dcf: dcfOut,
    perShare: dcfOut.perShare,
    marketPrice,
    upsidePct: recOut.upsidePct,
    recommendation: recOut,
    labelStability,
    isComputed: true,
    isEstimate: true,
    marking: EST,
  };

  return deepFreeze(fullOutput);
}


/**
 * P10.5: the contract requires an explicit SBC/revenue sensitivity around the
 * terminal endpoint. The endpoint is an SBC EXPENSE endpoint, not a dilution
 * rate, and conflating the two is the specific error this naming exists to
 * prevent: a reader who sees "8% dilution" would apply it to the share count
 * instead of to revenue.
 *
 * The range is NOT typed here. It is derived from the driver record own upper
 * bound, so a change to sbc_fade_end_pct_of_revenue in assumptions.json moves
 * the sensitivity with it instead of leaving a stale literal behind. An earlier
 * version hardcoded the bounds and the RTYPE freeze gate caught it.
 *
 * @param {Object} driverRecord The sbc_fade_end_pct_of_revenue driver record.
 * @returns {ReadonlyArray<number>} [endpoint, upperBound]
 */
export function sbcSensitivityRange(driverRecord) {
  if (!driverRecord || typeof driverRecord !== 'object') {
    throw new EngineError(
      'missing_sbc_endpoint',
      'sbcSensitivityRange requires the sbc_fade_end_pct_of_revenue driver record.',
    );
  }
  const endpoint = driverRecord.value;
  const upper = driverRecord.max;
  if (typeof endpoint !== 'number' || !Number.isFinite(endpoint)) {
    throw new EngineError(
      'invalid_sbc_endpoint',
      `sbc_fade_end_pct_of_revenue must be a finite number (received ${endpoint}).`,
    );
  }
  if (typeof upper !== 'number' || !Number.isFinite(upper) || upper <= endpoint) {
    throw new EngineError(
      'invalid_sbc_endpoint',
      `sbc_fade_end_pct_of_revenue must declare a max above its value (value ${endpoint}, max ${upper}).`,
    );
  }
  return Object.freeze([endpoint, upper]);
}

/**
 * Builds the disclosed SBC/revenue sensitivity record.
 *
 * @param {Object} driverRecord The sbc_fade_end_pct_of_revenue driver record.
 * @param {number[]} [scenarios] Scenario deltas already applied by the caller.
 * @returns {Readonly<Object>}
 */
export function buildSbcSensitivity(driverRecord, scenarios = []) {
  const range = sbcSensitivityRange(driverRecord);
  return Object.freeze({
    endpointPctOfRevenue: range[0],
    range,
    scenarios: Object.freeze(scenarios.slice()),
    kind: 'sbc_expense_endpoint',
    isDilutionRate: false,
    disclosure:
      'The SBC fade endpoint is an SBC EXPENSE as a percentage of revenue, not a dilution rate. ' +
      'It sets how much stock compensation the steady state expenses; it does not set how many ' +
      'shares are issued. Share issuance is modelled separately from the frozen sbc_issuance_price ' +
      'and the P10.4 fully diluted schedule. The sensitivity bounds are read from the driver ' +
      'record, so they move with the driver rather than being restated here.',
  });
}

export default Object.freeze({
  evaluate,
  buildSensitivityGrid,
  buildLabelStability,
  runFullValuation,
});
