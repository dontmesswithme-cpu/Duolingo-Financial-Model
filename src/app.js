/**
 * App controller; Phase 5 Application Pipeline.
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
  buildLabelStability,
  runFullValuation,
} from './engine/recommend.js';
import { apply as applyScenario, list as listScenarios } from './engine/scenarios.js';
import { compute as computeTtm } from './engine/ttm.js';
import { LEDGER_URLS } from './data/ledger.js';
import { createTabs, TAB_KEYS } from './ui/tabs.js';
import { renderCover } from './ui/coverTab.js';
import { renderAssumptions } from './ui/assumptionsTab.js';
import { renderHistoricals } from './ui/historicalsTab.js';
import { renderSchedules } from './ui/schedulesTab.js';
import { renderProjections } from './ui/projectionsTab.js';
import { renderValuation } from './ui/valuationTab.js';
import { renderSummary } from './ui/summaryTab.js';
import { renderSensitivity } from './ui/sensitivityTab.js';
import { createMarketPriceState, fetchLatestPrice } from './engine/market.js';
import peersDataset from './data/historical/peers.json' with { type: 'json' };
import { valuateFcffDcf } from './engine/methods/fcffDcf.js';
import { valuateComps } from './engine/methods/comps.js';
import { valuateEvMultiples } from './engine/methods/evMultiples.js';
import { valuatePfcf } from './engine/methods/pfcf.js';
import { valuateSotp } from './engine/methods/sotp.js';
import { valuatePerUser } from './engine/methods/perUser.js';
import { aggregateVerdicts } from './engine/methods/aggregate.js';

/**
 * Recursively freezes a value so no consumer can mutate model state through a
 * returned snapshot. Already-frozen values are returned unchanged, which keeps
 * repeated calls cheap and makes the function safe on shared subtrees.
 *
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */

/**
 * Evaluates all six multi-method valuation paths and synthesizes agreement verdict.
 *
 * @param {object} params
 * @param {object} params.dcfOut DCF valuation output
 * @param {object} params.threeStatementOut Three-statement projection output
 * @param {object} params.historical Historical dataset
 * @param {Array<object>} [params.peers] Peers dataset
 * @param {number} params.marketPrice Benchmark or fetched market price
 * @returns {{ methods: Array<object>, verdict: object }}
 */
function computeMultiMethodValuation({
  dcfOut,
  threeStatementOut,
  historical,
  peers = peersDataset,
  marketPrice,
}) {
  if (!dcfOut || !threeStatementOut || !historical) {
    return { methods: [], verdict: null };
  }

  const p0 = threeStatementOut.periods[0];
  const isP0 = threeStatementOut.incomeStatement.byPeriod[p0];
  const cfP0 = threeStatementOut.cashFlow.byPeriod[p0];

  const forwardRevenue = isP0.revenue.total.value;
  const detRevenue = isP0.revenue.segments.duolingo_english_test.value;
  const da = cfP0.operating_activities.depreciation_and_amortization.value;
  const opInc = isP0.operating_income.value;
  const rent = (12.071 * 1e3);
  const forwardEbitdar = opInc + da + rent;
  const leaseLiab = (86.136 * 1e3);
  const netCashCapitalized = dcfOut.fcff.netCashToday - leaseLiab;
  const sharesOutstanding = dcfOut.sharesOutstanding;

  const ttm = computeTtm(historical);
  const ocfTtm = ttm.flow.find((x) => x.metric === 'cash_from_operating_activities').value;
  const ppeCapex = Math.abs(ttm.flow.find((x) => x.metric === 'purchase_of_property_and_equipment').value);
  const softCapex = Math.abs(ttm.flow.find((x) => x.metric === 'capitalized_software_and_intangibles').value);
  const ttmFcf = ocfTtm - (ppeCapex + softCapex);

  const dau = ttm.kpi.find((x) => x.metric === 'dau').value;
  const mau = ttm.kpi.find((x) => x.metric === 'mau').value;
  const paidSubs = ttm.kpi.find((x) => x.metric === 'paid_subscribers').value;

  const arpuContext = {
    subscriptionArpu: '$6.71 / month ($80.50 / year driver basis)',
    bookingsPerDau: '$21.98 / year ($1,158,425k FY2025 bookings / 52.7M avg DAU)',
  };

  const resDcf = valuateFcffDcf(dcfOut);
  const resComps = valuateComps(peers, { forwardRevenue, netCashCapitalized, sharesOutstanding });
  const resEv = valuateEvMultiples(peers, { forwardEbitdar, netCashCapitalized, sharesOutstanding });
  const resPfcf = valuatePfcf(peers, { ttmFreeCashFlow: ttmFcf, sharesOutstanding });
  const resSotp = valuateSotp(peers, { forwardRevenue, detRevenue, forwardEbitdar, netCashCapitalized, sharesOutstanding });
  const resPerUser = valuatePerUser(peers, {
    kpis: { mau, dau, paidSubscribers: paidSubs },
    netCashCapitalized,
    sharesOutstanding,
    arpuContext,
  });

  const methods = [resDcf, resComps, resEv, resPfcf, resSotp, resPerUser];
  const verdictOut = aggregateVerdicts(methods, marketPrice);

  return { methods, verdict: verdictOut };
}

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
 * Derives scenario-relative sensitivity axes centered on active WACC and active g,
 * with deterministic fail-closed narrowing to enforce WACC > g on every cell.
 *
 * @param {number} activeWacc Active scenario WACC rate
 * @param {number} activeG Active scenario terminal growth rate
 * @returns {{ waccValues: number[], growthValues: number[], axisNarrowed: boolean, wSteps: number, gSteps: number }}
 */
export function computeSensitivityAxes(activeWacc, activeG) {
  const STEP = 0.005; // 50 bps
  let gSteps = 2;     // ±100 bps (5 columns)
  let wSteps = 4;     // ±200 bps (9 rows)
  let axisNarrowed = false;

  function buildGridValues(wCount, gCount) {
    const wVals = [];
    for (let i = -wCount; i <= wCount; i++) {
      wVals.push(Number((activeWacc + i * STEP).toFixed(6)));
    }
    const gVals = [];
    for (let j = -gCount; j <= gCount; j++) {
      gVals.push(Number((activeG + j * STEP).toFixed(6)));
    }
    return { wVals, gVals };
  }

  function isValid(wVals, gVals) {
    for (const w of wVals) {
      for (const g of gVals) {
        if (w <= g) {
          return false;
        }
      }
    }
    return true;
  }

  let { wVals, gVals } = buildGridValues(wSteps, gSteps);

  while (!isValid(wVals, gVals)) {
    axisNarrowed = true;
    if (gSteps > 0) {
      gSteps -= 1;
    } else if (wSteps > 0) {
      wSteps -= 1;
    } else {
      break;
    }
    ({ wVals, gVals } = buildGridValues(wSteps, gSteps));
  }

  return {
    waccValues: wVals,
    growthValues: gVals,
    axisNarrowed,
    wSteps,
    gSteps,
  };
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
 *   is always, the gate fails closed rather than passing an unverified citation.
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
  transport,
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
    transport,
  });

  if (typeof globalThis.window !== 'undefined' && typeof app.fetchPrice === 'function') {
    app.fetchPrice().catch(() => {});
  }

  return { app, dataset };
}

/**
 * Creates the application controller.
 *
 * @param {AppDependencies} dependencies
 * @returns {App}
 * @throws {EngineError} `invalid_dependency` when a required dependency is missing.
 */
export function createApp({ data, engine, root, now, historical = null, assumptions = null, transport = null } = {}) {
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
    buildLabelStability,
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

  // Initialize market pricing state from snapshot driver (Task P6R2.5 Finding G)
  const snapshotDriver = baseAssumptions?.get ? baseAssumptions.get('market_share_price') : baseAssumptions?.byName?.market_share_price;
  const snapshotPrice = snapshotDriver && Number.isFinite(snapshotDriver.value) ? snapshotDriver.value : 0;
  const snapshotAsOf = snapshotDriver?.asOf || '';
  let marketPriceState = createMarketPriceState(snapshotPrice, snapshotAsOf);
  let coverView = null;
  let assumptionsView = null;
  let historicalsView = null;
  let schedulesView = null;
  let projectionsView = null;
  let valuationView = null;
  let summaryView = null;
  let sensitivityView = null;
  let computeSensitivityGrid = () => null;
  let computeScenarios = () => null;

  // Live model state.
  let currentMethods = null;
  let currentVerdict = null;

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

  Object.defineProperties(model, {
    methods: {
      get() { return currentMethods; },
      set(val) { currentMethods = val; },
      enumerable: false,
      configurable: true,
    },
    verdict: {
      get() { return currentVerdict; },
      set(val) { currentVerdict = val; },
      enumerable: false,
      configurable: true,
    },
    sensitivityGrid: {
      get() { return computeSensitivityGrid(); },
      enumerable: false,
      configurable: true,
    },
    scenarios: {
      get() { return computeScenarios(); },
      enumerable: false,
      configurable: true,
    },
  });

  // Tab shell router
  const tabRouter = createTabs({
    root,
    tabs: TAB_KEYS,
    onTabChange: (key) => {
      // Sync URL hash without triggering browser fragment scrolling (replaceState
      // updates the address bar only; location.hash assignment would scroll).
      if (typeof globalThis.history === 'object' && typeof globalThis.history.replaceState === 'function') {
        const targetHash = `#${key}`;
        if (globalThis.location?.hash !== targetHash) {
          try { globalThis.history.replaceState(null, '', targetHash); } catch { /* non-browser env */ }
        }
      } else if (typeof globalThis.location === 'object' && typeof globalThis.location.hash === 'string') {
        const targetHash = `#${key}`;
        if (globalThis.location.hash !== targetHash) {
          globalThis.location.hash = targetHash;
        }
      }

      // Open each tab at the top of its content (no mid-page jumps on switch).
      if (typeof globalThis.scrollTo === 'function') {
        try { globalThis.scrollTo(0, 0); } catch { /* non-browser env */ }
      }

      // Redraw Tabulator instances in active tab pane so tables initialized while hidden calculate correct layout.
      // Tabulator.redraw(true) focuses its table holder, and the browser natively scrolls
      // the focused element into view (no JS scroll API involved). Every tab must open
      // at the top, so force top before and after the redraw and win the async race.
      const viewMap = {
        historicals: historicalsView,
        schedules: schedulesView,
        projections: projectionsView,
        valuation: valuationView,
        sensitivity: sensitivityView,
      };
      const forceTop = () => {
        if (typeof globalThis.scrollTo === 'function') {
          try { globalThis.scrollTo(0, 0); } catch { /* ignore */ }
        }
        try {
          const ae = globalThis.document?.activeElement;
          const cls = ae && typeof ae.className === 'string' ? ae.className : '';
          if (cls && cls.includes('tabulator-tableholder') && typeof ae.blur === 'function') ae.blur();
        } catch { /* ignore */ }
      };
      const activeView = viewMap[key];
      if (activeView && Array.isArray(activeView.tabulatorInstances)) {
        for (const inst of activeView.tabulatorInstances) {
          if (inst && typeof inst.redraw === 'function') {
            try { inst.redraw(true); } catch { /* ignore */ }
          }
        }
        // Tab switching triggers several async scroll side effects (Tabulator's
        // deferred tableholder focus, Chromium's trusted-click focus fixup, and
        // scroll anchoring after the pane display change; the last one can land
        // ~400ms after the click). Force top after they land.
        forceTop();
        if (typeof globalThis.requestAnimationFrame === 'function') {
          try { globalThis.requestAnimationFrame(forceTop); } catch { /* ignore */ }
        }
        if (typeof globalThis.setTimeout === 'function') {
          for (const delay of [80, 500]) {
            globalThis.setTimeout(forceTop, delay);
          }
        }
      }

      if (model.assumptions) {
        if (key === 'cover' && coverView) {
          coverView.update(model.dcf, model.wacc, model.recommendation, model.assumptions, model.threeStatement, model.methods, model.verdict, marketPriceState, model.schedules);
        } else if (key === 'assumptions' && assumptionsView) {
          assumptionsView.update(model.assumptions);
        } else if (key === 'historicals' && historicalsView) {
          historicalsView.update(historical, computeTtm(historical));
        } else if (key === 'schedules' && schedulesView) {
          schedulesView.update(model.schedules, model.threeStatement);
        } else if (key === 'projections' && projectionsView) {
          projectionsView.update(model.threeStatement, historical);
        } else if (key === 'valuation' && valuationView) {
          valuationView.update(model.wacc, model.dcf, model.assumptions, null, marketPriceState, model.methods, model.verdict);
        } else if (key === 'summary' && summaryView) {
          summaryView.update(model.dcf, model.recommendation, null, historical, model.assumptions, model.threeStatement, marketPriceState, model.verdict, model.methods, model.sensitivityGrid, model.labelStability);
        } else if (key === 'sensitivity' && sensitivityView) {
          sensitivityView.update(computeSensitivityGrid(), computeScenarios(), model.dcf, marketPriceState, model.scenario);
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

  // Suppress focus steal by Tabulator table holders. Tabulator programmatically
  // focuses `.tabulator-tableholder` on redraw/mount, and the browser natively
  // scrolls any focused element into view, yanking the page on every tab switch
  // and recalculation re-render. Blur tableholder focus UNLESS the previously
  // focused element lives inside the same Tabulator table (a user interacting
  // with that grid); Tabulator's internal re-focus passes that test and user
  // interaction keeps working, while app-driven steal from outside is reverted.
  let suppressTabulatorFocus = false;
  if (typeof root.addEventListener === 'function') {
    const focusGuard = (event) => {
      const target = event?.target;
      if (!target || typeof target.blur !== 'function') return;
      const cls = typeof target.className === 'string' ? target.className : '';
      if (!cls.includes('tabulator-tableholder')) return;
      const related = event.relatedTarget;
      const fromSameTable = !!(related && typeof related.closest === 'function' &&
        related.closest('.tabulator'));
      if (!fromSameTable) {
        try { target.blur(); } catch { /* ignore */ }
      }
    };
    const focusRoot = (typeof globalThis.document !== 'undefined' && typeof globalThis.document.addEventListener === 'function')
      ? globalThis.document
      : root;
    if (focusRoot && typeof focusRoot.addEventListener === 'function') {
      focusRoot.addEventListener('focusin', focusGuard, true);
      listeners.push({ target: focusRoot, type: 'focusin', handler: focusGuard });
    }
  }

  // Target tab containers if present in root
  const coverPane = (root && typeof root.querySelector === 'function' ? root.querySelector('[data-tab-pane][data-tab="cover"]') : null) ||
                    (root && typeof root.querySelector === 'function' ? root.querySelector('#tab-cover') : null);
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



/**
 * Applies driver overrides to an AssumptionSet while preserving immutability.
 *
 * @param {object} assumptions
 * @param {Map<string, number>} overrides
 * @returns {object}
 */
function applyDriverOverrides(assumptions, overrides) {
  if (!overrides || overrides.size === 0) {
    return assumptions;
  }
  const updatedDrivers = assumptions.drivers.map((d) => {
    if (overrides.has(d.name)) {
      const rawVal = overrides.get(d.name);
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

  return Object.freeze({
    scenario: assumptions.scenario || 'base',
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

  /**
   * Executes the full recalculation pipeline synchronously.
   */
  function recalculate() {
    if (!historical || !baseAssumptions) {
      return;
    }

    // Step 1: Scenario-neutral driver state (user base drivers with zero scenario deltas applied)
    const neutralAssumptions = applyDriverOverrides(baseAssumptions, driverOverrides);

    // Step 2: Active scenario assumptions (neutral state + active-scenario deltas)
    let workingAssumptions = neutralAssumptions;
    if (activeScenario !== DEFAULT_SCENARIO && typeof scenarios.apply === 'function') {
      workingAssumptions = scenarios.apply(neutralAssumptions, activeScenario);
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
      corpus: historical,
    });

    const effectiveMarketPrice = driverOverrides.has('market_share_price')
      ? driverOverrides.get('market_share_price')
      : marketPriceState.price;
    const recOut = recommend.evaluate(dcfOut.perShare, effectiveMarketPrice);

    // EP.4 verdict-sensitivity band (engine-derived; follows the active drivers).
    let labelStabilityOut = null;
    if (typeof recommend.buildLabelStability === 'function') {
      labelStabilityOut = recommend.buildLabelStability({
        threeStatement: threeStatementOut,
        dcf: dcfOut,
        assumptions: workingAssumptions,
        corpus: historical,
      });
    }

    let cachedSensitivityGrid = null;
    let cachedScenarios = null;

    computeSensitivityGrid = () => {
      if (cachedSensitivityGrid) return cachedSensitivityGrid;
      if (typeof recommend.buildSensitivityGrid === 'function') {
        const activeWacc = typeof waccOut === 'number' ? waccOut : (waccOut.wacc?.value ?? waccOut.wacc ?? waccOut.value);
        const activeG = requireDriver(workingAssumptions, 'terminal_growth_rate').value;
        const axes = computeSensitivityAxes(activeWacc, activeG);

        const gridInput = {
          threeStatement: threeStatementOut,
          assumptions: workingAssumptions,
          wacc: waccOut,
          growthValues: axes.growthValues,
          corpus: historical,
        };
        if (axes.axisNarrowed) {
          gridInput.waccValues = axes.waccValues;
        }

        const rawGrid = recommend.buildSensitivityGrid(gridInput);
        cachedSensitivityGrid = Object.freeze({
          ...rawGrid,
          axisNarrowed: axes.axisNarrowed,
        });
      }
      return cachedSensitivityGrid;
    };

    computeScenarios = () => {
      if (cachedScenarios) return cachedScenarios;
      if (typeof recommend.runFullValuation === 'function' && historical && neutralAssumptions) {
        const baseCase = { scenario: activeScenario, wacc: waccOut, dcf: dcfOut, recommendation: recOut, assumptions: workingAssumptions, perShare: dcfOut.perShare, upsidePct: recOut.upsidePct, threeStatement: threeStatementOut, schedules: schedulesOut, forecast: forecastOut };
        const rawScenarios = {
          [SCENARIO_NAMES[0]]: activeScenario === SCENARIO_NAMES[0]
            ? baseCase
            : recommend.runFullValuation(historical, neutralAssumptions, SCENARIO_NAMES[0]),
          [SCENARIO_NAMES[1]]: activeScenario === SCENARIO_NAMES[1]
            ? baseCase
            : recommend.runFullValuation(historical, neutralAssumptions, SCENARIO_NAMES[1]),
          [SCENARIO_NAMES[2]]: activeScenario === SCENARIO_NAMES[2]
            ? baseCase
            : recommend.runFullValuation(historical, neutralAssumptions, SCENARIO_NAMES[2]),
        };
        for (const k of SCENARIO_NAMES) {
          const sc = rawScenarios[k];
          if (sc && sc.dcf && sc.threeStatement && !sc.methods) {
            const scMulti = computeMultiMethodValuation({
              dcfOut: sc.dcf,
              threeStatementOut: sc.threeStatement,
              historical,
              peers: peersDataset,
              marketPrice: benchmarkPrice,
            });
            rawScenarios[k] = Object.freeze({
              ...sc,
              methods: scMulti.methods,
              verdict: scMulti.verdict,
            });
          }
        }
        cachedScenarios = rawScenarios;
      }
      return cachedScenarios;
    };

    // Step 5: Multi-method valuation synthesis & agreement verdict
    const benchmarkPrice = Number.isFinite(marketPriceState?.price)
      ? marketPriceState.price
      : getDriver('market_share_price', workingAssumptions);

    const multiMethodOut = computeMultiMethodValuation({
      dcfOut,
      threeStatementOut,
      historical,
      peers: peersDataset,
      marketPrice: benchmarkPrice,
    });

    model.assumptions = workingAssumptions;
    model.scenario = activeScenario;
    model.schedules = schedulesOut;
    model.forecast = forecastOut;
    model.threeStatement = threeStatementOut;
    model.wacc = waccOut;
    model.dcf = dcfOut;
    model.recommendation = recOut;
    model.labelStability = labelStabilityOut;
    model.methods = multiMethodOut.methods;
    model.verdict = multiMethodOut.verdict;
    model.dirty = isDirty;

    const isPaneVisible = (pane) => !pane || typeof pane.hasAttribute !== 'function' || !pane.hasAttribute('hidden');

    if (coverView) {
      coverView.update(dcfOut, waccOut, recOut, workingAssumptions, threeStatementOut, multiMethodOut.methods, multiMethodOut.verdict, marketPriceState, schedulesOut);
    }
    if (assumptionsView) {
      assumptionsView.update(workingAssumptions, { historical, threeStatement: threeStatementOut, schedules: schedulesOut });
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
      valuationView.update(waccOut, dcfOut, workingAssumptions, null, marketPriceState, multiMethodOut.methods, multiMethodOut.verdict);
    }
    if (summaryView) {
      summaryView.update(dcfOut, recOut, null, historical, workingAssumptions, threeStatementOut, marketPriceState, multiMethodOut.verdict, multiMethodOut.methods, computeSensitivityGrid(), labelStabilityOut);
    }
    if (sensitivityView && isPaneVisible(sensitivityPane)) {
      sensitivityView.update(computeSensitivityGrid(), computeScenarios(), dcfOut, marketPriceState, activeScenario);
    }
  }

  // Initial calculation run if datasets were provided
  if (historical && baseAssumptions) {
    recalculate();
  }

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
      const snap = { ...model };
      Object.defineProperty(snap, 'marketPrice', {
        value: marketPriceState,
        enumerable: false,
        configurable: true,
      });
      Object.defineProperty(snap, 'methods', {
        value: currentMethods,
        enumerable: false,
        configurable: true,
      });
      Object.defineProperty(snap, 'verdict', {
        value: currentVerdict,
        enumerable: false,
        configurable: true,
      });
      Object.defineProperty(snap, 'sensitivityGrid', {
        value: model.sensitivityGrid,
        enumerable: false,
        configurable: true,
      });
      Object.defineProperty(snap, 'scenarios', {
        value: model.scenarios,
        enumerable: false,
        configurable: true,
      });
      return deepFreeze(snap);
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
      if (coverView) {
        coverView.dispose();
        coverView = null;
      }
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
      for (const k of Object.keys(model)) {
        model[k] = null;
      }
      for (const { target, type, handler } of listeners) {
        if (target && typeof target.removeEventListener === 'function') {
          target.removeEventListener(type, handler);
        }
      }
      listeners.length = 0;
      if (typeof globalThis.gc === 'function') {
        try { globalThis.gc(); } catch { /* ignore */ }
      }
    },
  };

  // Mount views if containers are present in root
  if (coverPane) {
    coverView = renderCover({
      container: coverPane,
      dcf: model.dcf,
      wacc: model.wacc,
      recommendation: model.recommendation,
      assumptions: model.assumptions || baseAssumptions,
      threeStatement: model.threeStatement,
      methods: model.methods,
      verdict: model.verdict,
      marketPriceState,
      schedules: model.schedules,
    });
  }

  if (assumptionsPane && baseAssumptions) {
    assumptionsView = renderAssumptions({
      container: assumptionsPane,
      assumptions: model.assumptions || baseAssumptions,
      historical,
      threeStatement: model.threeStatement,
      schedules: model.schedules,
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
      marketPriceState,
      onRefreshPrice: () => app.fetchPrice(),
      methods: model.methods,
      verdict: model.verdict,
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
      marketPriceState,
      onRefreshPrice: () => app.fetchPrice(),
      methods: model.methods,
      verdict: model.verdict,
      sensitivityGrid: model.sensitivityGrid,
      labelStability: model.labelStability,
    });
  }

  if (sensitivityPane && model.sensitivityGrid) {
    sensitivityView = renderSensitivity({
      container: sensitivityPane,
      sensitivityGrid: model.sensitivityGrid,
      scenarios: model.scenarios,
      dcf: model.dcf,
      marketPriceState,
      activeScenario: model.scenario,
      onScenarioChange: (sc) => app.setScenario(sc),
    });
  }

  async function fetchPrice() {
    const snapDriver = baseAssumptions?.get ? baseAssumptions.get('market_share_price') : baseAssumptions?.byName?.market_share_price;
    const sPrice = snapDriver && Number.isFinite(snapDriver.value) ? snapDriver.value : 0;
    const sAsOf = snapDriver?.asOf || '';
    const activeTransport = transport || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    const res = await fetchLatestPrice(activeTransport, {
      fallbackPrice: sPrice,
      fallbackAsOf: sAsOf,
    });
    marketPriceState = res;
    recalculate();
    return marketPriceState;
  }

  Object.defineProperty(app, 'fetchPrice', {
    value: fetchPrice,
    enumerable: false,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(app, 'refreshPrice', {
    value: fetchPrice,
    enumerable: false,
    writable: true,
    configurable: true,
  });

  return app;
}
