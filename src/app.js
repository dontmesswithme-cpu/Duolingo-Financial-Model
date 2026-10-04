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
  CANONICAL_HORIZON,
  LEGACY_FIVE_YEAR_HORIZON,
  PRICE_REQUEST_TIMEOUT_MS,
  EFFECTIVE_VALUATION_DATE,
} from './data/constants.js';

const MONTH_NAMES = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

function formatHeaderValuationDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '-';
  const parts = isoDate.trim().split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (m >= 1 && m <= 12 && Number.isFinite(d)) {
      return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
    }
  }
  return isoDate;
}

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
import { createMarketPriceState, benchmarkToMarketState, fetchLatestPrice, nextRequestSequence } from './engine/market.js';
import {
  BENCHMARK_STATUS,
  createSnapshotBenchmark,
  createOverrideBenchmark,
  createLiveBenchmark,
  applyLiveResponse,
  clearOverride,
  isSameBenchmark,
} from './engine/benchmark.js';
import peersCorpusArtifact from './data/historical/peers.json' with { type: 'json' };
import { validatePeersCorpus } from './data/peersGate.js';

// P10.4: the peer corpus is validated on load rather than imported raw. An
// uncited or period-missing material KPI now fails closed at boot instead of
// rendering as a sourced number nobody can re-verify.
const peersDataset = validatePeersCorpus(peersCorpusArtifact);
import { validateLeaseInputs } from './data/leaseGate.js';
import duolLeaseArtifact from './data/historical/duolLeaseInputs.json' with { type: 'json' };

// P10.4 F2: validated on load, so an uncited lease input fails closed at boot.
const LEASE_INPUTS = validateLeaseInputs(duolLeaseArtifact);
import { buildFullyDilutedSchedule, assertDenominatorNotWeightedAverage } from './engine/fullyDiluted.js';
import duolFullyDilutedArtifact from './data/historical/duolFullyDiluted.json' with { type: 'json' };
import { valuateFcffDcf } from './engine/methods/fcffDcf.js';
import { valuateComps } from './engine/methods/comps.js';
import { valuateEvMultiples } from './engine/methods/evMultiples.js';
import { valuatePfcf } from './engine/methods/pfcf.js';
import { valuateSotp } from './engine/methods/sotp.js';
import { valuatePerUser } from './engine/methods/perUser.js';
import { aggregateVerdicts } from './engine/methods/aggregate.js';

/**
 * Production valuation basis.
 *
 * `true` wires the whole production pipeline — headline DCF, sensitivity grid,
 * and scenario lanes — through the P10.2 dated valuation seam. The integer
 * period-index path remains reachable only as the explicitly labeled legacy
 * comparison lane, never as a production figure.
 *
 * @type {boolean}
 */
const PRODUCTION_DATED_SEAM = true;

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
 * Evaluates the multi-method valuation paths and synthesizes the clustered evidence verdict (three clusters; SOTP decomposition-only; FCFE diagnostic-only).
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
  ttm = null,
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
  // P10.4 F2: the lease legs are cited filing inputs, not engine constants.
  // The add-back period is NOT yet confirmed against the filing and the gate
  // reports it as unverified, so it is never described as a filed amount.
  const rent = LEASE_INPUTS.leaseCost.value;
  const forwardEbitdar = opInc + da + rent;
  const leaseLiab = LEASE_INPUTS.leaseLiability.value;
  const netCashCapitalized = dcfOut.fcff.netCashToday - leaseLiab;

  // P10.4: every present-day RELATIVE method divides by the same current
  // point-in-time fully diluted schedule (basic period-end + incremental
  // options + RSUs/other awards + met founder awards, each cited to a filing
  // with a measurement date). It is deliberately NOT `dcfOut.sharesOutstanding`,
  // which is the EPS weighted-average diluted count and is diagnostic only, and
  // it is deliberately NOT the DCF terminal-year roll, which belongs to the DCF
  // divisor alone.
  const fdSchedule = buildFullyDilutedSchedule(duolFullyDilutedArtifact);
  const sharesOutstanding = assertDenominatorNotWeightedAverage(fdSchedule.denominator, {
    label: 'P10.4 fully diluted denominator',
    schedule: fdSchedule,
  });

  const activeTtm = ttm || computeTtm(historical);
  const ocfTtm = activeTtm.flow.find((x) => x.metric === 'cash_from_operating_activities').value;
  const ppeCapex = Math.abs(activeTtm.flow.find((x) => x.metric === 'purchase_of_property_and_equipment').value);
  const softCapex = Math.abs(activeTtm.flow.find((x) => x.metric === 'capitalized_software_and_intangibles').value);
  const ttmFcf = ocfTtm - (ppeCapex + softCapex);

  const dau = activeTtm.kpi.find((x) => x.metric === 'dau').value;
  const mau = activeTtm.kpi.find((x) => x.metric === 'mau').value;
  const paidSubs = activeTtm.kpi.find((x) => x.metric === 'paid_subscribers').value;

  const arpuContext = {
    subscriptionArpu: '$6.71 / month ($80.50 / year driver basis)',
    bookingsPerDau: '$21.98 / year ($1,158,425k FY2025 bookings / 52.7M avg DAU)',
  };

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

  // The FCFF DCF method label, basis, and stage structure come from the
  // engine-owned disclosure in `valuateFcffDcf`. Absent stage data is reported
  // as a disclosed state, never as a quiet downgrade to a "2-Stage" label.
  const baseDcf = valuateFcffDcf(dcfOut);

  // P10.5 F1: the canonical add-back DCF is the AFTER-MODELLED-FUTURE-DILUTION
  // output, and it must be what the verdict, upside and range are computed on.
  // Previously this method reported the engine perShare (the finite-roll
  // intermediate) while declaring a canonical figure that nothing consumed, so the
  // contract clause "only the second is the canonical recommendation" was false in
  // production. The canonical value is now the method value; the intermediate is
  // retained on the row and labelled, so both numbers stay visible.
  const canonicalDcf = {
    ...baseDcf,
    impliedPerShare:
      typeof baseDcf.isCanonicalAddBackDcf === 'number'
        ? baseDcf.isCanonicalAddBackDcf
        : baseDcf.impliedPerShare,
    rangePerShare:
      typeof baseDcf.isCanonicalAddBackDcf === 'number'
        ? { min: baseDcf.isCanonicalAddBackDcf, max: baseDcf.isCanonicalAddBackDcf }
        : baseDcf.rangePerShare,
    valuationBasisLabel:
      typeof baseDcf.isCanonicalAddBackDcf === 'number'
        ? 'After modeled future dilution (CANONICAL add-back DCF)'
        : 'After explicit and fade dilution (intermediate)',
    finiteRollIntermediatePerShare: baseDcf.impliedPerShare,
    dcfOutputs: baseDcf.dcfOutputs ?? null,
  };

  // P10.5 F1 (second hop). The aggregate row was fixed, but the app's own
  // `recommendation` still evaluated on `dcfOut.perShare` — the finite-roll
  // intermediate — so the headline, its upside, and every rec consumer bypassed
  // the canonical figure the contract says may drive a recommendation. The
  // contract allows ONLY the after-modelled-future-dilution output to drive a
  // recommendation. `dcfOut` is frozen by the engine, so the canonical value is
  // read through the engine's own disclosure rather than by attaching a property.

  const methods = [canonicalDcf, resComps, resEv, resPfcf, resSotp, resPerUser];
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
  // CANONICAL_HORIZON, not a bare 10: production is always the canonical lane.
  // A literal here would silently diverge if the constant ever moved, which is
  // the same defect class as the hardcoded beta prose.
  horizon = CANONICAL_HORIZON,
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
    horizon,
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
export function createApp({ data, engine, root, now, historical = null, assumptions = null, transport = null, horizon = CANONICAL_HORIZON } = {}) {
  const runHorizon = (typeof horizon === 'number') ? horizon : CANONICAL_HORIZON;
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
  const snapshotProvider = snapshotDriver?.source?.provider || 'stockanalysis.com';
  const snapshotUrl = snapshotDriver?.source?.url || null;

  /**
   * THE canonical benchmark (P10.3). Exactly one instance exists; every
   * consumer below is handed this same object, so no view can read a different
   * price than its neighbour. It stays `null` until a snapshot driver supplies
   * a positive close, so a controller constructed without assumptions still
   * boots (and has no consumers, because `recalculate` bails without them).
   */
  const hasSnapshotAnchor = Number.isFinite(snapshotPrice) && snapshotPrice > 0 && typeof snapshotAsOf === 'string' && snapshotAsOf.length > 0;
  const snapshotBenchmark = hasSnapshotAnchor
    ? createSnapshotBenchmark({
        value: snapshotPrice,
        asOf: snapshotAsOf,
        provider: snapshotProvider,
        url: snapshotUrl,
      })
    : null;
  let benchmark = snapshotBenchmark;
  /** Best live benchmark seen while an override was held, for override clearing. */
  let lastLiveBenchmark = null;
  /** Last applied field error, surfaced to the assumptions view. */
  let fieldError = null;
  /** Monotonic request-sequence floor for the live-price lifecycle. */
  let priceSequence = 0;
  /** Controllers for in-flight price requests, cancelled on dispose/supersede. */
  let activePriceController = null;

  let marketPriceState = benchmark === null ? null : benchmarkToMarketState(benchmark);
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
  let currentDcf5 = null;
let currentDcf5Disclosure = null;

  const model = {
    assumptions: null,
    scenario: DEFAULT_SCENARIO,
    schedules: null,
    forecast: null,
    threeStatement: null,
    wacc: null,
    dcf: null,
    recommendation: null,
    labelStability: null,
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
          assumptionsView.update(model.assumptions, { historical, threeStatement: model.threeStatement, schedules: model.schedules });
        } else if (key === 'historicals' && historicalsView) {
          historicalsView.update(historical, computeTtm(historical));
        } else if (key === 'schedules' && schedulesView) {
          schedulesView.update(model.schedules, model.threeStatement);
        } else if (key === 'projections' && projectionsView) {
          projectionsView.update(model.threeStatement, historical);
        } else if (key === 'valuation' && valuationView) {
          valuationView.update(model.wacc, model.dcf, model.assumptions, null, marketPriceState, model.methods, model.verdict, {
            forecast: model.forecast,
            dcf5: currentDcf5,
            dcf5Disclosure: currentDcf5Disclosure,
            labelStability: model.labelStability,
            threeStatement: model.threeStatement,
          });
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
  let cachedSchedules = null;
  let cachedTtm = null;

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
    if (!cachedSchedules) {
      cachedSchedules = schedules.build(historical, workingAssumptions);
    }
    const schedulesOut = cachedSchedules;
    const forecastOut = forecast.project({
      historical,
      assumptions: workingAssumptions,
      ...(typeof runHorizon === 'number' ? { horizon: runHorizon } : {}),
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
    // Production values the DCF on the P10.2 dated valuation seam: date-derived
    // fractional discount exponents, the post-valuation stub only, and the
    // BOP balance sheet rolled forward to the effective valuation date. The
    // integer-index path stays reachable only as the labeled legacy lane below.
    const dcfOut = dcf.valuate(threeStatementOut, waccOut, {
      assumptions: workingAssumptions,
      corpus: historical,
      datedSeam: PRODUCTION_DATED_SEAM,
      ...(typeof runHorizon === 'number' ? { horizon: runHorizon } : {}),
    });

    // Five-year legacy comparison. Same valuation basis as production, shorter
    // horizon, so the horizon comparison stays like-for-like. It is disclosed,
    // never inferred: when the production horizon IS the legacy horizon there is
    // nothing to compare, and the lane reports why instead of vanishing behind
    // a quiet `null`.
    const legacyComparisonAvailable = runHorizon !== LEGACY_FIVE_YEAR_HORIZON;
    let dcf5Out = null;
    if (legacyComparisonAvailable) {
      const f5 = forecast.project({ historical, assumptions: workingAssumptions, horizon: LEGACY_FIVE_YEAR_HORIZON });
      const ts5 = threeStatement.project(schedulesOut, workingAssumptions, f5);
      dcf5Out = dcf.valuate(ts5, waccOut, {
        assumptions: workingAssumptions,
        corpus: historical,
        horizon: LEGACY_FIVE_YEAR_HORIZON,
        datedSeam: PRODUCTION_DATED_SEAM,
      });
    }
    const dcf5Disclosure = Object.freeze({
      available: legacyComparisonAvailable,
      label: `${LEGACY_FIVE_YEAR_HORIZON}-Period Model (Legacy Horizon)`,
      horizon: LEGACY_FIVE_YEAR_HORIZON,
      role: 'disclosed_legacy_comparison',
      productionHorizon: runHorizon,
      reason: legacyComparisonAvailable
        ? 'Five-year model disclosed alongside the canonical ten-period production model.'
        : `Production horizon is ${runHorizon}, which IS the legacy ${LEGACY_FIVE_YEAR_HORIZON}-period horizon; a legacy comparison lane would duplicate production and is therefore not built.`,
    });
    currentDcf5 = dcf5Out;
    currentDcf5Disclosure = dcf5Disclosure;

    const effectiveMarketPrice = driverOverrides.has('market_share_price')
      ? driverOverrides.get('market_share_price')
      : marketPriceState.price;
    // P10.5 F1 (second hop). The recommendation must be driven by the canonical
    // add-back DCF, not the finite-roll intermediate. The contract allows ONLY
    // the after-modelled-future-dilution output to drive a recommendation, and
    // this call previously used `dcfOut.perShare`, bypassing that rule for the
    // headline, its upside, and every consumer of the recommendation. `dcfOut`
    // is frozen, so the canonical figure is read from the engine's own
    // disclosure. Falls back to the intermediate only if the engine produced no
    // canonical figure, which its positivity guards make unreachable in practice.
    const canonicalForRec = valuateFcffDcf(dcfOut).isCanonicalAddBackDcf;
    const recommendationPerShare =
      typeof canonicalForRec === 'number' ? canonicalForRec : dcfOut.perShare;
    const recOut = recommend.evaluate(recommendationPerShare, effectiveMarketPrice);

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
          datedSeam: PRODUCTION_DATED_SEAM,
          ...(typeof runHorizon === 'number' ? { horizon: runHorizon } : {}),
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
        // P10.3: every scenario lane is compared against the SAME canonical
        // benchmark the headline and the views read.
        const scenarioOpts = typeof runHorizon === 'number'
          ? { horizon: runHorizon, datedSeam: PRODUCTION_DATED_SEAM, marketPrice: benchmark?.value }
          : { datedSeam: PRODUCTION_DATED_SEAM, marketPrice: benchmark?.value };
        const rawScenarios = {
          [SCENARIO_NAMES[0]]: activeScenario === SCENARIO_NAMES[0]
            ? baseCase
            : recommend.runFullValuation(historical, neutralAssumptions, SCENARIO_NAMES[0], scenarioOpts),
          [SCENARIO_NAMES[1]]: activeScenario === SCENARIO_NAMES[1]
            ? baseCase
            : recommend.runFullValuation(historical, neutralAssumptions, SCENARIO_NAMES[1], scenarioOpts),
          [SCENARIO_NAMES[2]]: activeScenario === SCENARIO_NAMES[2]
            ? baseCase
            : recommend.runFullValuation(historical, neutralAssumptions, SCENARIO_NAMES[2], scenarioOpts),
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

    if (!cachedTtm) cachedTtm = computeTtm(historical);
    const multiMethodOut = computeMultiMethodValuation({
      dcfOut,
      threeStatementOut,
      historical,
      peers: peersDataset,
      marketPrice: benchmarkPrice,
      ttm: cachedTtm,
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
    if (historicalsView && isPaneVisible(historicalsPane)) {
      if (!cachedTtm) cachedTtm = computeTtm(historical);
      historicalsView.update(historical, cachedTtm);
    }
    if (schedulesView && isPaneVisible(schedulesPane)) {
      schedulesView.update(schedulesOut, threeStatementOut);
    }
    if (projectionsView && isPaneVisible(projectionsPane)) {
      projectionsView.update(threeStatementOut, historical);
    }
    if (valuationView && isPaneVisible(valuationPane)) {
      valuationView.update(waccOut, dcfOut, workingAssumptions, null, marketPriceState, multiMethodOut.methods, multiMethodOut.verdict, {
        forecast: forecastOut,
        dcf5: dcf5Out,
        dcf5Disclosure,
        labelStability: labelStabilityOut,
        threeStatement: threeStatementOut,
      });
    }
    if (summaryView) {
      summaryView.update(dcfOut, recOut, null, historical, workingAssumptions, threeStatementOut, marketPriceState, multiMethodOut.verdict, multiMethodOut.methods, undefined, labelStabilityOut);
    }
    if (sensitivityView && isPaneVisible(sensitivityPane)) {
      sensitivityView.update(computeSensitivityGrid(), computeScenarios(), dcfOut, marketPriceState, activeScenario);
    }
    syncHeaderValuationDate();
  }

  function syncHeaderValuationDate() {
    const el = (root && typeof root.querySelector === 'function')
      ? root.querySelector('[data-header-meta="valuation-date"]')
      : null;
    if (el) {
      el.textContent = formatHeaderValuationDate(EFFECTIVE_VALUATION_DATE);
    }
  }

  // Initial calculation run if datasets were provided
  if (historical && baseAssumptions) {
    recalculate();
  }

  /**
   * Captures the model outputs a failed transactional edit must restore.
   * Object references are safe to keep: every model value is deeply frozen by
   * the engines, so restoring a reference restores the exact prior state.
   *
   * @returns {Readonly<object>}
   */
  function captureModelSnapshot() {
    return Object.freeze({
      dcf: model.dcf,
      wacc: model.wacc,
      recommendation: model.recommendation,
      methods: model.methods,
      verdict: model.verdict,
      threeStatement: model.threeStatement,
      forecast: model.forecast,
      assumptions: model.assumptions,
      scenario: model.scenario,
      labelStability: model.labelStability,
      dirty: model.dirty,
    });
  }

  /**
   * Restores every piece of state a failed transactional edit touched, before
   * the candidate recalculation is retried on the restored inputs.
   *
   * @param {Map<string, number>} priorOverrides
   * @param {string} priorScenario
   * @param {boolean} priorDirty
   * @param {Readonly<object>} priorBenchmark
   * @param {Readonly<object>} priorMarketState
   * @param {object|null} priorFieldError
   * @param {Readonly<object>} snapshot
   */
  function rollbackDriverEdit(priorOverrides, priorScenario, priorDirty, priorBenchmark, priorMarketState, priorFieldError, snapshot) {
    driverOverrides.clear();
    for (const [key, val] of priorOverrides) driverOverrides.set(key, val);
    activeScenario = priorScenario;
    isDirty = priorDirty;
    benchmark = priorBenchmark;
    marketPriceState = priorMarketState;
    fieldError = priorFieldError;
    model.dcf = snapshot.dcf;
    model.wacc = snapshot.wacc;
    model.recommendation = snapshot.recommendation;
    model.methods = snapshot.methods;
    model.verdict = snapshot.verdict;
    model.threeStatement = snapshot.threeStatement;
    model.forecast = snapshot.forecast;
    model.assumptions = snapshot.assumptions;
    model.scenario = snapshot.scenario;
    model.labelStability = snapshot.labelStability;
    model.dirty = snapshot.dirty;
  }

  const app = {
    /**
     * Sets a driver value transactionally (P10.3 "Transactional Updates").
     *
     * Clone → validate → recalculate a candidate → commit only on success. On
     * failure the overrides, scenario, dirty flag, and model snapshots are
     * restored byte-for-byte and a visible field error is recorded, so an
     * invalid edit can never leave the controller in a half-applied state.
     *
     * @param {string} name
     * @param {number} value
     * @returns {void}
     */
    setDriver(name, value) {
      if (disposed) {
        throw new EngineError('disposed', 'setDriver was called on a disposed controller.', name);
      }

      /**
       * Records a visible field error and rethrows.
       *
       * EVERY rejection path must go through here, including the early
       * validations that run before the clone/commit block. An error that is
       * thrown but never recorded is invisible to the user (P10.3 F1).
       *
       * @param {EngineError} err
       * @returns {never}
       */
      const rejectWithFieldError = (err) => {
        fieldError = {
          field: typeof name === 'string' && name.length > 0 ? name : 'driver',
          message: err && err.message ? err.message : 'The driver edit was rejected.',
          code: err && err.code ? err.code : 'invalid_driver_edit',
        };
        renderFieldError();
        throw err;
      };

      if (typeof name !== 'string' || !name) {
        rejectWithFieldError(new EngineError(
          'missing_driver',
          'setDriver requires a valid driver name string.',
          name,
        ));
      }

      if (!baseAssumptions) {
        rejectWithFieldError(new EngineError(
          'not_implemented',
          'setDriver cannot execute without loaded assumptions.',
          name,
        ));
      }

      const driver = baseAssumptions.get ? baseAssumptions.get(name) : baseAssumptions.byName?.[name];
      if (!driver) {
        rejectWithFieldError(new EngineError(
          'missing_driver',
          `Unknown driver "${name}" cannot be updated.`,
          name,
        ));
      }

      if (typeof value !== 'number' || !Number.isFinite(value)) {
        rejectWithFieldError(new EngineError(
          'invalid_driver_value',
          `Driver "${name}" value must be a finite number (received ${value}).`,
          name,
        ));
      }

      // ── Clone the candidate state ──────────────────────────────────────
      const priorOverrides = new Map(driverOverrides);
      const priorScenario = activeScenario;
      const priorDirty = isDirty;
      const priorBenchmark = benchmark;
      const priorMarketState = marketPriceState;
      const priorFieldError = fieldError;
      const snapshotPrior = captureModelSnapshot();

      const clamped = clampDriverValue(value, driver);
      driverOverrides.set(name, clamped);
      isDirty = true;

      // A benchmark edit is a manual override: sticky until explicitly cleared,
      // and never replaceable by any live response.
      if (name === 'market_share_price') {
        try {
          const candidate = createOverrideBenchmark({
            value: clamped,
            asOf: driver.asOf || snapshotAsOf,
            provider: snapshotProvider,
            url: snapshotUrl,
          });
          benchmark = candidate;
          marketPriceState = benchmarkToMarketState(candidate);
        } catch (err) {
          rollbackDriverEdit(priorOverrides, priorScenario, priorDirty, priorBenchmark, priorMarketState, priorFieldError, snapshotPrior);
          recalculate();
          return rejectWithFieldError(err);
        }
      }

      // ── Validate + recalculate the candidate; commit only on success ───
      try {
        recalculate();
        fieldError = null;
        renderFieldError();
      } catch (err) {
        rollbackDriverEdit(priorOverrides, priorScenario, priorDirty, priorBenchmark, priorMarketState, priorFieldError, snapshotPrior);
        recalculate();
        return rejectWithFieldError(err);
      }
    },
    /**
     * Switches the active scenario and triggers synchronous recalculation.
     *
     * @param {string} name
     * @returns {void}
     */
    setScenario(name) {
      if (disposed) {
        throw new EngineError('disposed', 'setScenario was called on a disposed controller.', name);
      }
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
      Object.defineProperty(snap, 'benchmark', {
        value: benchmark,
        enumerable: false,
        configurable: true,
      });
      Object.defineProperty(snap, 'fieldError', {
        value: fieldError,
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
      // Cancel any in-flight price request so a late response can never touch
      // state after teardown.
      if (activePriceController && typeof activePriceController.abort === 'function') {
        try {
          activePriceController.abort();
        } catch (_err) {
          /* abort is best-effort */
        }
      }
      activePriceController = null;
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
      forecast: model.forecast,
      dcf5: currentDcf5,
      labelStability: model.labelStability,
      threeStatement: model.threeStatement,
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

  syncHeaderValuationDate();

  /**
   * Fetches a live price under the P10.3 lifecycle and applies it through the
   * canonical precedence rules. A response can never mutate an uncleared manual
   * override or a newer valid live price, and a response that arrives after
   * disposal is discarded.
   *
   * @returns {Promise<Readonly<object>>} The benchmark after the attempt.
   */
  /**
   * Renders the current field error into the Assumptions surface (P10.3
   * "display a visible field error").
   *
   * The error is a live region so assistive technology announces it, and it
   * carries the offending field and message. Rendering is driven by the
   * canonical `fieldError` state — the same value `state()` exposes — so the
   * DOM can never disagree with the model. Called on every rejection path and
   * cleared on the next successful edit.
   *
   * @returns {void}
   */
  function renderFieldError() {
    if (!assumptionsView || typeof assumptionsView.setFieldError !== 'function') {
      return;
    }
    assumptionsView.setFieldError(fieldError);
  }

  /**
   * Clears a manual benchmark override, restoring the best available benchmark
   * (the highest-sequence valid live response seen, else the dated snapshot).
   *
   * Exposed as a non-enumerable controller member so the frozen four-member App
   * interface (setDriver / setScenario / state / dispose) is unchanged.
   *
   * @returns {Readonly<object>} The restored canonical benchmark.
   */
  function clearBenchmarkOverride() {
    if (disposed) {
      throw new EngineError('disposed', 'clearBenchmarkOverride was called on a disposed controller.', 'benchmark');
    }
    const restored = clearOverride(benchmark, lastLiveBenchmark, snapshotBenchmark);
    benchmark = restored;
    marketPriceState = benchmark === null ? null : benchmarkToMarketState(restored);
    driverOverrides.delete('market_share_price');
    isDirty = true;
    recalculate();
    return benchmark;
  }

  /**
   * Races a price request against a wall-clock deadline that spans headers AND
   * body consumption, aborting the transport when it fires. The engine price
   * client deliberately constructs no Promise (hot-path gate), so the deadline
   * lives here in the controller.
   *
   * @param {Promise<Readonly<object>>} request
   * @param {number} timeoutMs
   * @param {object|null} controller
   * @param {() => string} message
   * @returns {Promise<Readonly<object>>}
   */
  function withDeadline(request, timeoutMs, controller, message) {
    let timer = null;
    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        if (controller && typeof controller.abort === 'function') {
          try {
            controller.abort();
          } catch (_err) {
            /* abort is best-effort */
          }
        }
        reject(new Error(message()));
      }, timeoutMs);
      if (timer && typeof timer.unref === 'function') timer.unref();
    });
    return Promise.race([request, deadline]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  async function fetchPrice(options = {}) {
    if (disposed) {
      throw new EngineError('disposed', 'fetchPrice was called on a disposed controller.', 'benchmark');
    }
    const activeTransport = transport || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    const deadlineMs = Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : PRICE_REQUEST_TIMEOUT_MS;

    // Supersede any in-flight request: the new one holds a higher sequence, and
    // the older transport is cancelled rather than left to race.
    if (activePriceController && typeof activePriceController.abort === 'function') {
      try {
        activePriceController.abort();
      } catch (_err) {
        /* abort is best-effort */
      }
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    activePriceController = controller;
    const sequence = nextRequestSequence(priceSequence);
    priceSequence = sequence;

    let outcome;
    try {
      outcome = await withDeadline(
        fetchLatestPrice(activeTransport, {
          fallbackPrice: snapshotPrice,
          fallbackAsOf: snapshotAsOf,
          sequence,
          abortController: controller,
          isAborted: () => disposed,
        }),
        deadlineMs,
        controller,
        () => `Price request timed out after ${deadlineMs}ms.`,
      );
    } catch (err) {
      // A deadline (or transport) failure is a REJECTED OUTCOME, never a throw
      // into the caller: the held benchmark survives and the reason is visible.
      outcome = {
        ok: false,
        sequence,
        value: null,
        asOf: snapshotAsOf,
        provider: snapshotProvider,
        url: null,
        error: err && err.message ? err.message : 'Price request failed.',
      };
    }

    if (disposed) return benchmark;

    // P10.9: The client refuses intraday shapes outright.
    if (
      outcome.isOfficialClose === false ||
      (outcome.intradayPrice !== null && outcome.intradayPrice !== undefined) ||
      outcome.status === 'intraday'
    ) {
      outcome = {
        ok: false,
        sequence: outcome.sequence,
        value: null,
        asOf: snapshotAsOf,
        provider: snapshotProvider,
        url: null,
        error: 'Intraday price quotes are unavailable; official close required.',
      };
    }

    if (outcome.ok === true) {
      // Record the best VALID live response even when an uncleared override wins
      // the precedence contest, so clearing the override later can restore it.
      // Only the highest sequence is kept.
      const candidate = createLiveBenchmark({
        value: outcome.value,
        asOf: outcome.asOf,
        provider: outcome.provider,
        url: outcome.url,
        sequence: outcome.sequence,
      });
      if (lastLiveBenchmark === null || candidate.sequence > lastLiveBenchmark.sequence) {
        lastLiveBenchmark = candidate;
      }
    }

    const applied = applyLiveResponse(benchmark, {
      ok: outcome.ok,
      sequence: outcome.sequence,
      value: outcome.value,
      asOf: outcome.asOf,
      provider: outcome.provider,
      url: outcome.url,
      error: outcome.error,
    });
    if (applied.accepted) {
      lastLiveBenchmark = applied.benchmark;
    }
    if (isSameBenchmark(applied.benchmark, benchmark)) {
      return benchmark;
    }
    benchmark = applied.benchmark;
    marketPriceState = benchmarkToMarketState(benchmark);
    recalculate();
    return benchmark;
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

  // Benchmark control surface, non-enumerable so the frozen four-member App
  // interface (setDriver / setScenario / state / dispose) is unchanged.
  Object.defineProperty(app, 'clearBenchmarkOverride', {
    value: () => clearBenchmarkOverride(),
    enumerable: false,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(app, 'benchmark', {
    get: () => benchmark,
    enumerable: false,
    configurable: true,
  });

  return app;
}
