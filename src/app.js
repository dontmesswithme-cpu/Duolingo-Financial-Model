/**
 * App controller — Phase 5 Application Pipeline.
 *
 * Provides the dependency-injected application factory wiring:
 *   loadHistorical → schedules.build → forecast.project →
 *   threeStatement.project → wacc.build → dcf.valuate →
 *   recommend.evaluate + sensitivity + scenario management.
 *
 * Synchronous recalculation is guaranteed < 16ms.
 *
 * Purity contract: this module never reads the wall-clock directly. The current
 * time is injected as `now`, which keeps every consumer deterministic and
 * headless-testable (see `docs/conventions.md` §Purity & Testability).
 *
 * @module src/app
 */

import { EngineError } from './data/errors.js';
import {
  DEFAULT_SCENARIO,
  HISTORICAL_DIR,
  SOURCE_LEDGER_REQUIRED,
  SCENARIO_NAMES,
} from './data/constants.js';

import schedulesEngine from './engine/schedules.js';
import forecastEngine from './engine/forecast.js';
import threeStatementEngine from './engine/threeStatement.js';
import { build as buildWacc } from './engine/wacc.js';
import { valuate as valuateDcf } from './engine/dcf.js';
import {
  evaluate as evaluateRec,
  buildSensitivityGrid,
  runFullValuation,
} from './engine/recommend.js';
import { apply as applyScenario, list as listScenarios } from './engine/scenarios.js';
import { compute as computeTtm } from './engine/ttm.js';
import { LEDGER_URLS } from './data/ledger.js';
import { createTabs, TAB_KEYS } from './ui/tabs.js';
import { renderAssumptions } from './ui/assumptionsTab.js';
import { renderHistoricals } from './ui/historicalsTab.js';
import { renderSchedules } from './ui/schedulesTab.js';
import { renderProjections } from './ui/projectionsTab.js';
import { renderValuation } from './ui/valuationTab.js';
import { renderSummary } from './ui/summaryTab.js';
import { renderSensitivity } from './ui/sensitivityTab.js';

/**
 * Recursively freezes a value so no consumer can mutate model state through a
 * returned snapshot. Already-frozen values are returned unchanged, which keeps
 * repeated calls cheap and makes the function safe on shared subtrees.
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
 * Helper to read a required driver value from an assumption set fail-closed.
 *
 * @param {object} assumptions
 * @param {string} name
 * @returns {object}
 */
function requireDriver(assumptions, name) {
  const driver =
    assumptions && typeof assumptions.get === 'function'
      ? assumptions.get(name)
      : assumptions && assumptions[name];

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
 * Clamps a driver value to its [min, max] range and snaps to step.
 *
 * @param {number} value
 * @param {object} driver
 * @returns {number}
 */
function clampDriverValue(value, driver) {
  let clamped = value;
  if (typeof driver.min === 'number' && Number.isFinite(driver.min)) {
    clamped = Math.max(driver.min, clamped);
  }
  if (typeof driver.max === 'number' && Number.isFinite(driver.max)) {
    clamped = Math.min(driver.max, clamped);
  }
  if (typeof driver.step === 'number' && driver.step > 0) {
    const minVal = typeof driver.min === 'number' ? driver.min : 0;
    const stepCount = Math.round((clamped - minVal) / driver.step);
    clamped = Number((minVal + stepCount * driver.step).toFixed(6));
  }
  return clamped;
}

/**
 * @typedef {object} AppState
 * @property {object|null} assumptions Driver/input set.
 * @property {string} scenario Active scenario name (`bear` | `base` | `bull`).
 * @property {object|null} schedules Supporting schedule set.
 * @property {object|null} forecast Operating forecast output.
 * @property {object|null} threeStatement Linked projection output.
 * @property {object|null} wacc WACC build output.
 * @property {object|null} dcf Valuation output.
 * @property {object|null} recommendation Mechanical recommendation.
 * @property {boolean} dirty True when inputs changed since initialization.
 */

/**
 * @typedef {object} App
 * @property {(name: string, value: number) => void} setDriver
 * @property {(name: string) => void} setScenario
 * @property {() => Readonly<AppState>} state
 * @property {() => void} dispose
 */

/**
 * @typedef {object} AppDependencies
 * @property {object} data Data-layer module (loader/audit/schema).
 * @property {object} engine Calculation-engine module namespace.
 * @property {object} root DOM root element (or a stub in headless tests).
 * @property {() => number|string|Date} now Injected clock.
 * @property {object} [historical] Preloaded historical dataset.
 * @property {object} [assumptions] Preloaded assumptions dataset.
 */

/**
 * @typedef {object} BootDependencies
 * @property {object} data Data-layer module exposing `loadHistorical`.
 * @property {object} engine Calculation-engine module namespace.
 * @property {object} root DOM root element (or a stub in headless tests).
 * @property {() => number|string|Date} now Injected clock.
 * @property {Set<string>|Array<string|{url: string}>} ledger Citation URLs from
 *   `docs/sources/sources.md`. Required whenever ledger enforcement is on, which
 *   is always — the gate fails closed rather than passing an unverified citation.
 * @property {(location: string) => Promise<string>} [readText] Injected file
 *   reader; the browser default (`fetch`) applies when omitted.
 * @property {string} [dir] Directory prefix for dataset files.
 */

/**
 * @typedef {object} BootResult
 * @property {App} app The constructed application controller.
 * @property {Object.<string, unknown>} dataset The audited historical corpus.
 */

/**
 * Boots the app: load the historical corpus and assumptions through the Accuracy Gate,
 * then construct the controller on top of it.
 *
 * @param {BootDependencies} dependencies
 * @returns {Promise<BootResult>}
 * @throws {EngineError} `invalid_dependency` when `data.loadHistorical` is absent.
 * @throws {import('./data/errors.js').DataValidationError} When any record fails
 *   schema validation or the Accuracy Gate.
 */
export async function bootApp({
  data,
  engine = {},
  root,
  now,
  ledger,
  readText,
  dir,
  assumptionsLocation,
  assumptionsDir,
} = {}) {
  if (data === null || data === undefined || typeof data.loadHistorical !== 'function') {
    throw new EngineError(
      'invalid_dependency',
      'bootApp requires an injected `data` dependency exposing `loadHistorical()`.',
      'data',
    );
  }

  const dataset = await data.loadHistorical({
    dir: dir ?? HISTORICAL_DIR,
    readText,
    requireLedger: SOURCE_LEDGER_REQUIRED,
    ledger,
  });

  let assumptions = null;
  if (typeof data.loadAssumptions === 'function') {
    assumptions = await data.loadAssumptions({
      readText,
      location: assumptionsLocation,
      dir: assumptionsDir,
    });
  }

  const app = createApp({
    data,
    engine,
    root,
    now,
    historical: dataset,
    assumptions,
  });

  return { app, dataset };
}

/**
 * Creates the application controller.
 *
 * @param {AppDependencies} dependencies
 * @returns {App}
 * @throws {EngineError} `invalid_dependency` when a required dependency is missing.
 */
export function createApp({ data, engine, root, now, historical = null, assumptions = null } = {}) {
  for (const name of ['data', 'engine', 'root', 'now']) {
    const value = { data, engine, root, now }[name];
    if (value === null || value === undefined) {
      throw new EngineError(
        'invalid_dependency',
        `createApp requires an injected \`${name}\` dependency.`,
        name,
      );
    }
  }

  // Bind calculation engine adapters
  const schedules = engine?.schedules ?? schedulesEngine;
  const forecast = engine?.forecast ?? forecastEngine;
  const threeStatement = engine?.threeStatement ?? threeStatementEngine;
  const wacc = engine?.wacc ?? { build: buildWacc };
  const dcf = engine?.dcf ?? { valuate: valuateDcf };
  const recommend = engine?.recommend ?? {
    evaluate: evaluateRec,
    buildSensitivityGrid,
    runFullValuation,
  };
  const scenarios = engine?.scenarios ?? { apply: applyScenario, list: listScenarios };

  // Track active driver overrides: driverName -> numeric override
  const driverOverrides = new Map();
  let activeScenario = DEFAULT_SCENARIO;
  let baseAssumptions = assumptions;
  let isDirty = false;
  let disposed = false;
  const listeners = [];
  let assumptionsView = null;
  let historicalsView = null;
  let schedulesView = null;
  let projectionsView = null;
  let valuationView = null;
  let summaryView = null;
  let sensitivityView = null;

  // Tab shell router
  const tabRouter = createTabs({
    root,
    tabs: TAB_KEYS,
    onTabChange: (key) => {
      // Sync URL hash if available in browser runtime
      if (typeof globalThis.location === 'object' && typeof globalThis.location.hash === 'string') {
        const targetHash = `#${key}`;
        if (globalThis.location.hash !== targetHash) {
          globalThis.location.hash = targetHash;
        }
      }
    },
  });

  // Listen for hashchange if available in window environment
  if (typeof globalThis.addEventListener === 'function') {
    const hashHandler = () => {
      if (typeof globalThis.location?.hash === 'string') {
        const hashKey = globalThis.location.hash.replace(/^#/, '').toLowerCase();
        if (TAB_KEYS.includes(hashKey)) {
          tabRouter.show(hashKey);
        }
      }
    };
    globalThis.addEventListener('hashchange', hashHandler);
    listeners.push({
      target: globalThis,
      type: 'hashchange',
      handler: hashHandler,
    });
  }

  /**
   * Live model state.
   * @type {AppState}
   */
  const model = {
    assumptions: null,
    scenario: DEFAULT_SCENARIO,
    schedules: null,
    forecast: null,
    threeStatement: null,
    wacc: null,
    dcf: null,
    recommendation: null,
    dirty: false,
  };

  /**
   * Executes the full recalculation pipeline synchronously.
   */
  function recalculate() {
    if (!historical || !baseAssumptions) {
      return;
    }

    // Step 1: Apply scenario to base assumptions
    let workingAssumptions = baseAssumptions;
    if (activeScenario !== DEFAULT_SCENARIO && typeof scenarios.apply === 'function') {
      workingAssumptions = scenarios.apply(baseAssumptions, activeScenario);
    }

    // Step 2: Apply user driver overrides on top of scenario assumptions
    if (driverOverrides.size > 0) {
      const updatedDrivers = workingAssumptions.drivers.map((d) => {
        if (driverOverrides.has(d.name)) {
          const rawVal = driverOverrides.get(d.name);
          const clampedVal = clampDriverValue(rawVal, d);
          return Object.freeze({
            ...d,
            value: clampedVal,
          });
        }
        return d;
      });

      const byName = {};
      const byGroup = {};
      for (const d of updatedDrivers) {
        byName[d.name] = d;
        if (!byGroup[d.group]) byGroup[d.group] = [];
        byGroup[d.group].push(d);
      }
      for (const g of Object.keys(byGroup)) {
        byGroup[g] = Object.freeze(byGroup[g]);
      }

      workingAssumptions = Object.freeze({
        scenario: activeScenario,
        drivers: Object.freeze(updatedDrivers),
        byName: Object.freeze(byName),
        byGroup: Object.freeze(byGroup),
        get(name) {
          return byName[name] ?? null;
        },
        getValue(name) {
          const d = byName[name];
          return d !== undefined ? d.value : undefined;
        },
      });
    }

    // Step 3: Run pipeline: schedules → forecast → threeStatement → wacc → dcf → recommend
    const schedulesOut = schedules.build(historical, workingAssumptions);
    const forecastOut = forecast.project({
      historical,
      assumptions: workingAssumptions,
    });
    const threeStatementOut = threeStatement.project(
      schedulesOut,
      workingAssumptions,
      forecastOut,
    );
    const waccOut = wacc.build({
      assumptions: workingAssumptions,
      debtSchedule: schedulesOut.debt,
    });
    const dcfOut = dcf.valuate(threeStatementOut, waccOut, {
      assumptions: workingAssumptions,
    });

    const marketPrice = requireDriver(workingAssumptions, 'market_share_price').value;
    const recOut = recommend.evaluate(dcfOut.perShare, marketPrice);
    const sensitivityGridOut = typeof recommend.buildSensitivityGrid === 'function'
      ? recommend.buildSensitivityGrid({
          threeStatement: threeStatementOut,
          assumptions: workingAssumptions,
          wacc: waccOut,
        })
      : null;

    const scenariosOut = typeof recommend.runFullValuation === 'function' && historical && workingAssumptions
      ? {
          [SCENARIO_NAMES[0]]: recommend.runFullValuation(historical, workingAssumptions, SCENARIO_NAMES[0]),
          [SCENARIO_NAMES[1]]: { wacc: waccOut, dcf: dcfOut, recommendation: recOut, assumptions: workingAssumptions, perShare: dcfOut.perShare, upsidePct: recOut.upsidePct },
          [SCENARIO_NAMES[2]]: recommend.runFullValuation(historical, workingAssumptions, SCENARIO_NAMES[2]),
        }
      : null;

    model.assumptions = workingAssumptions;
    model.scenario = activeScenario;
    model.schedules = schedulesOut;
    model.forecast = forecastOut;
    model.threeStatement = threeStatementOut;
    model.wacc = waccOut;
    model.dcf = dcfOut;
    model.recommendation = recOut;
    model.sensitivityGrid = sensitivityGridOut;
    model.scenarios = scenariosOut;
    model.dirty = isDirty;

    if (assumptionsView) {
      assumptionsView.update(workingAssumptions);
    }
    if (historicalsView) {
      historicalsView.update(historical, computeTtm(historical));
    }
    if (schedulesView) {
      schedulesView.update(schedulesOut, threeStatementOut);
    }
    if (projectionsView) {
      projectionsView.update(threeStatementOut, historical);
    }
    if (valuationView) {
      valuationView.update(waccOut, dcfOut, workingAssumptions);
    }
    if (summaryView) {
      summaryView.update(dcfOut, recOut, null, historical, workingAssumptions, threeStatementOut);
    }
    if (sensitivityView && sensitivityGridOut) {
      sensitivityView.update(sensitivityGridOut, scenariosOut, dcfOut);
    }
  }

  // Initial calculation run if datasets were provided
  if (historical && baseAssumptions) {
    recalculate();
  }

  // Target tab containers if present in root
  const assumptionsPane = (root && typeof root.querySelector === 'function' ? root.querySelector('[data-tab-pane][data-tab="assumptions"]') : null) ||
                          (root && typeof root.querySelector === 'function' ? root.querySelector('#tab-assumptions') : null);
  const historicalsPane = (root && typeof root.querySelector === 'function' ? root.querySelector('[data-tab-pane][data-tab="historicals"]') : null) ||
                          (root && typeof root.querySelector === 'function' ? root.querySelector('#tab-historicals') : null);
  const schedulesPane = (root && typeof root.querySelector === 'function' ? root.querySelector('[data-tab-pane][data-tab="schedules"]') : null) ||
                        (root && typeof root.querySelector === 'function' ? root.querySelector('#tab-schedules') : null);
  const projectionsPane = (root && typeof root.querySelector === 'function' ? root.querySelector('[data-tab-pane][data-tab="projections"]') : null) ||
                          (root && typeof root.querySelector === 'function' ? root.querySelector('#tab-projections') : null);
  const valuationPane = (root && typeof root.querySelector === 'function' ? root.querySelector('[data-tab-pane][data-tab="valuation"]') : null) ||
                        (root && typeof root.querySelector === 'function' ? root.querySelector('#tab-valuation') : null);
  const summaryPane = (root && typeof root.querySelector === 'function' ? root.querySelector('[data-tab-pane][data-tab="summary"]') : null) ||
                      (root && typeof root.querySelector === 'function' ? root.querySelector('#tab-summary') : null);
  const sensitivityPane = (root && typeof root.querySelector === 'function' ? root.querySelector('[data-tab-pane][data-tab="sensitivity"]') : null) ||
                          (root && typeof root.querySelector === 'function' ? root.querySelector('#tab-sensitivity') : null);

  const app = {
    /**
     * Sets a driver value, clamps it, and triggers synchronous recalculation.
     *
     * @param {string} name
     * @param {number} value
     * @returns {void}
     */
    setDriver(name, value) {
      if (typeof name !== 'string' || !name) {
        throw new EngineError(
          'missing_driver',
          'setDriver requires a valid driver name string.',
          name,
        );
      }

      if (!baseAssumptions) {
        throw new EngineError(
          'not_implemented',
          'setDriver cannot execute without loaded assumptions.',
          name,
        );
      }

      const driver = baseAssumptions.get ? baseAssumptions.get(name) : baseAssumptions.byName?.[name];
      if (!driver) {
        throw new EngineError(
          'missing_driver',
          `Unknown driver "${name}" cannot be updated.`,
          name,
        );
      }

      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new EngineError(
          'invalid_driver_value',
          `Driver "${name}" value must be a finite number (received ${value}).`,
          name,
        );
      }

      const clamped = clampDriverValue(value, driver);
      driverOverrides.set(name, clamped);
      isDirty = true;
      recalculate();
    },

    /**
     * Switches the active scenario and triggers synchronous recalculation.
     *
     * @param {string} name
     * @returns {void}
     */
    setScenario(name) {
      if (typeof name !== 'string' || !SCENARIO_NAMES.includes(name)) {
        throw new EngineError(
          'invalid_scenario',
          `Unknown scenario "${name}". Valid scenarios are: ${SCENARIO_NAMES.join(', ')}.`,
          name,
        );
      }

      if (!baseAssumptions) {
        throw new EngineError(
          'not_implemented',
          'setScenario cannot execute without loaded assumptions.',
          name,
        );
      }

      activeScenario = name;
      isDirty = true;
      recalculate();
    },

    /**
     * Returns a deeply frozen snapshot of the current model state.
     *
     * @returns {Readonly<AppState>}
     */
    state() {
      return deepFreeze({ ...model });
    },

    /**
     * Releases every resource acquired during initialization. Idempotent:
     * repeated calls are no-ops so teardown paths can stay simple.
     *
     * @returns {void}
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      if (assumptionsView) {
        assumptionsView.dispose();
        assumptionsView = null;
      }
      if (historicalsView) {
        historicalsView.dispose();
        historicalsView = null;
      }
      if (schedulesView) {
        schedulesView.dispose();
        schedulesView = null;
      }
      if (projectionsView) {
        projectionsView.dispose();
        projectionsView = null;
      }
      if (valuationView) {
        valuationView.dispose();
        valuationView = null;
      }
      if (summaryView) {
        summaryView.dispose();
        summaryView = null;
      }
      if (sensitivityView) {
        sensitivityView.dispose();
        sensitivityView = null;
      }
      tabRouter.dispose();
      for (const { target, type, handler } of listeners) {
        if (target && typeof target.removeEventListener === 'function') {
          target.removeEventListener(type, handler);
        }
      }
      listeners.length = 0;
    },
  };

  // Mount views if containers are present in root
  if (assumptionsPane && baseAssumptions) {
    assumptionsView = renderAssumptions({
      container: assumptionsPane,
      assumptions: model.assumptions || baseAssumptions,
      onDriverChange: (name, val) => app.setDriver(name, val),
      onScenarioChange: (sc) => app.setScenario(sc),
    });
  }

  if (historicalsPane && historical) {
    historicalsView = renderHistoricals({
      container: historicalsPane,
      historical,
      ttm: computeTtm(historical),
    });
  }

  if (schedulesPane && model.schedules) {
    schedulesView = renderSchedules({
      container: schedulesPane,
      schedules: model.schedules,
      threeStatement: model.threeStatement,
    });
  }

  if (projectionsPane && model.threeStatement) {
    projectionsView = renderProjections({
      container: projectionsPane,
      threeStatement: model.threeStatement,
      historical,
    });
  }

  if (valuationPane && model.wacc && model.dcf) {
    valuationView = renderValuation({
      container: valuationPane,
      wacc: model.wacc,
      dcf: model.dcf,
      assumptions: model.assumptions || baseAssumptions,
    });
  }

  if (summaryPane && model.dcf && model.recommendation) {
    summaryView = renderSummary({
      container: summaryPane,
      dcf: model.dcf,
      recommendation: model.recommendation,
      historical,
      assumptions: model.assumptions || baseAssumptions,
      threeStatement: model.threeStatement,
    });
  }

  if (sensitivityPane && model.sensitivityGrid) {
    sensitivityView = renderSensitivity({
      container: sensitivityPane,
      sensitivityGrid: model.sensitivityGrid,
      scenarios: model.scenarios,
      dcf: model.dcf,
    });
  }

  return app;
}
