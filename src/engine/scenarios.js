/**
 * Scenarios & Full-Path Projection Engine.
 *
 * Implements the spec §3.2 & §3.3 scenario application and full-path integration:
 *  - `scenarios.apply(base: AssumptionSet, scenario: 'bear'|'base'|'bull'): AssumptionSet`
 *  - `scenarios.list(): ScenarioMeta[]`
 *  - `runFullProjection(historical, assumptionsOrBase, scenario?): FullProjectionOutput`
 *
 * @module src/engine/scenarios
 */

import { EngineError } from '../data/errors.js';
import { SCENARIO_NAMES, DEFAULT_SCENARIO } from '../data/constants.js';
import { validateRecord, SCHEMAS } from '../data/schema.js';
import schedulesEngine from './schedules.js';
import forecastEngine from './forecast.js';
import threeStatementEngine from './threeStatement.js';

const SCENARIO_DESCRIPTIONS = Object.freeze({
  [SCENARIO_NAMES[0]]: Object.freeze({
    name: SCENARIO_NAMES[0],
    label: 'Bear Case',
    description:
      'Downside case: lower subscriber net additions, compressed ARPU growth, lower monetization conversion, and elevated operating cost ratios.',
  }),
  [SCENARIO_NAMES[1]]: Object.freeze({
    name: SCENARIO_NAMES[1],
    label: 'Base Case',
    description:
      'Baseline consensus projection aligned with management targets, recent historical expansion trajectory, and normalized operating leverage.',
  }),
  [SCENARIO_NAMES[2]]: Object.freeze({
    name: SCENARIO_NAMES[2],
    label: 'Bull Case',
    description:
      'Upside case: accelerating paid subscriber adoption, premium tier (Max) penetration expanding ARPU, and significant operating margin expansion.',
  }),
});

/**
 * Returns metadata describing the supported forecast scenarios.
 *
 * @returns {ReadonlyArray<object>} ScenarioMeta array.
 */
export function list() {
  return Object.freeze(SCENARIO_NAMES.map((name) => SCENARIO_DESCRIPTIONS[name]));
}

/**
 * Applies scenario deltas to a base assumption set, returning an immutable AssumptionSet.
 *
 * @param {object} base Base AssumptionSet from loadAssumptions()
 * @param {string} [scenario=DEFAULT_SCENARIO] Target scenario name
 * @returns {object} Applied AssumptionSet
 */
export function apply(base, scenario = DEFAULT_SCENARIO) {
  if (!base || typeof base !== 'object' || !Array.isArray(base.drivers)) {
    throw new EngineError(
      'missing_input',
      'scenarios.apply() requires a valid base AssumptionSet with a drivers array.',
      'base',
    );
  }

  if (typeof scenario !== 'string' || !SCENARIO_NAMES.includes(scenario)) {
    throw new EngineError(
      'invalid_scenario',
      `Unknown scenario: "${scenario}". Expected one of: ${SCENARIO_NAMES.join(', ')}.`,
      scenario,
    );
  }

  const appliedDrivers = [];
  const byName = {};
  const byGroup = {};
  const clampedDrivers = [];

  for (let i = 0; i < base.drivers.length; i += 1) {
    const driver = base.drivers[i];
    if (!driver || typeof driver !== 'object') {
      throw new EngineError(
        'invalid_assumption_driver',
        `Driver at index ${i} is not a valid driver object.`,
        `driver_${i}`,
      );
    }

    let delta = 0;
    if (scenario === DEFAULT_SCENARIO) {
      delta = driver.scenarioDeltas?.[DEFAULT_SCENARIO] ?? 0;
    } else if (driver.scenarioDeltas && typeof driver.scenarioDeltas === 'object') {
      delta = driver.scenarioDeltas[scenario] ?? 0;
    }

    if (!Number.isFinite(delta)) {
      throw new EngineError(
        'invalid_scenario_delta',
        `Scenario delta for driver "${driver.name}" in scenario "${scenario}" is not finite.`,
        driver.name,
      );
    }

    const rawValue = driver.value + delta;
    const min = driver.min;
    const max = driver.max;

    let clampedValue = rawValue;
    if (rawValue < min) {
      clampedValue = min;
      clampedDrivers.push(
        Object.freeze({
          name: driver.name,
          requested: rawValue,
          applied: clampedValue,
          bound: 'min',
          min,
          max,
        }),
      );
    } else if (rawValue > max) {
      clampedValue = max;
      clampedDrivers.push(
        Object.freeze({
          name: driver.name,
          requested: rawValue,
          applied: clampedValue,
          bound: 'max',
          min,
          max,
        }),
      );
    }

    const appliedDriver = Object.freeze({
      name: driver.name,
      label: driver.label,
      group: driver.group,
      value: clampedValue,
      min: driver.min,
      max: driver.max,
      step: driver.step,
      units: driver.units,
      scenarioDeltas: Object.freeze({ ...driver.scenarioDeltas }),
      notes: driver.notes,
      marking: driver.marking,
      asOf: driver.asOf,
      source: driver.source ? Object.freeze({ ...driver.source }) : undefined,
      baseValue: driver.value,
      appliedDelta: delta,
    });

    const validation = validateRecord(appliedDriver, SCHEMAS.assumptionDriver, `scenarios.apply(${scenario})`);
    if (!validation.ok) {
      const errMsgs = validation.errors.map((e) => e.message).join('; ');
      throw new EngineError(
        'invalid_assumption_driver',
        `Applied driver "${driver.name}" failed schema validation: ${errMsgs}`,
        driver.name,
      );
    }

    appliedDrivers.push(appliedDriver);
    byName[appliedDriver.name] = appliedDriver;

    if (!byGroup[appliedDriver.group]) {
      byGroup[appliedDriver.group] = [];
    }
    byGroup[appliedDriver.group].push(appliedDriver);
  }

  for (const group of Object.keys(byGroup)) {
    byGroup[group] = Object.freeze(byGroup[group]);
  }

  return Object.freeze({
    scenario,
    drivers: Object.freeze(appliedDrivers),
    byName: Object.freeze(byName),
    byGroup: Object.freeze(byGroup),
    clampedDrivers: Object.freeze(clampedDrivers),
    get(name) {
      return byName[name] ?? null;
    },
    getValue(name) {
      const d = byName[name];
      return d !== undefined ? d.value : undefined;
    },
  });
}

/**
 * Runs the complete full-path financial model projection for a given scenario.
 *
 * Pipeline:
 *  1. Resolve assumptions (apply scenario if needed)
 *  2. Build supporting schedules: schedules.build(historical, assumptions)
 *  3. Project revenue and costs: forecast.project({ historical, assumptions })
 *  4. Project 3 statements: threeStatement.project(schedules, assumptions, forecast)
 *
 * @param {object|Array} historical Historical corpus datasets
 * @param {object} assumptions Base or applied AssumptionSet
 * @param {'bear'|'base'|'bull'} [scenario] Optional scenario name
 * @returns {object} FullProjectionOutput
 */
export function runFullProjection(historical, assumptions, scenario = DEFAULT_SCENARIO) {
  if (!historical) {
    throw new EngineError(
      'missing_input',
      'runFullProjection() requires a valid historical dataset.',
      'historical',
    );
  }

  if (!assumptions) {
    throw new EngineError(
      'missing_input',
      'runFullProjection() requires an assumptions set.',
      'assumptions',
    );
  }

  let activeAssumptions = assumptions;
  if (
    typeof scenario === 'string' &&
    SCENARIO_NAMES.includes(scenario) &&
    assumptions.scenario !== scenario
  ) {
    activeAssumptions = apply(assumptions, scenario);
  }

  const schedulesOut = schedulesEngine.build(historical, activeAssumptions);
  const forecastOut = forecastEngine.project({ historical, assumptions: activeAssumptions });
  const threeStatementOut = threeStatementEngine.project(
    schedulesOut,
    activeAssumptions,
    forecastOut,
  );

  return Object.freeze({
    scenario: activeAssumptions.scenario || scenario || DEFAULT_SCENARIO,
    assumptions: activeAssumptions,
    schedules: schedulesOut,
    forecast: forecastOut,
    threeStatement: threeStatementOut,
    incomeStatement: threeStatementOut.incomeStatement,
    cashFlow: threeStatementOut.cashFlow,
    balanceSheet: threeStatementOut.balanceSheet,
    balanceCheck: threeStatementOut.balanceCheck,
    periods: threeStatementOut.periods,
  });
}

export default Object.freeze({
  apply,
  list,
  runFullProjection,
});
