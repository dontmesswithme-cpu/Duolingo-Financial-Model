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
  UNITS,
} from '../data/constants.js';
import schedulesEngine from './schedules.js';
import forecastEngine from './forecast.js';
import threeStatementEngine from './threeStatement.js';
import { apply as applyScenario } from './scenarios.js';
import { build as buildWacc } from './wacc.js';
import { valuate as valuateDcf } from './dcf.js';

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
 * Runs the end-to-end full valuation pipeline for a specified scenario.
 *
 * Full Pipeline:
 *  1. Apply scenario deltas to assumptions: `scenarios.apply(assumptions, scenario)`
 *  2. Build supporting schedules: `schedules.build(historical, activeAssumptions)`
 *  3. Project revenue and costs: `forecast.project({ historical, assumptions: activeAssumptions })`
 *  4. Project 3 statements: `threeStatement.project(schedules, activeAssumptions, forecast)`
 *  5. Build WACC: `wacc.build({ assumptions: activeAssumptions, debtSchedule: schedules.debt })`
 *  6. Run DCF valuation: `dcf.valuate(threeStatement, wacc, { assumptions: activeAssumptions })`
 *  7. Evaluate recommendation: `recommend.evaluate(dcf.perShare, marketPrice)`
 *
 * @param {object|Array} historical Historical corpus datasets
 * @param {object} assumptions Base or scenario AssumptionSet
 * @param {'bear'|'base'|'bull'} [scenario=DEFAULT_SCENARIO] Scenario name
 * @returns {object} Frozen FullValuationOutput
 */
export function runFullValuation(historical, assumptions, scenario = DEFAULT_SCENARIO) {
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

  const schedulesOut = schedulesEngine.build(historical, activeAssumptions);
  const forecastOut = forecastEngine.project({ historical, assumptions: activeAssumptions });
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
  });

  const marketPrice = requireDriverValue(activeAssumptions, 'market_share_price').value;

  const recOut = evaluate(dcfOut.perShare, marketPrice);

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
    isComputed: true,
    isEstimate: true,
    marking: EST,
  };

  return deepFreeze(fullOutput);
}

export default Object.freeze({
  evaluate,
  buildSensitivityGrid,
  runFullValuation,
});
