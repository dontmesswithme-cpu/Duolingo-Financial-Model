/**
 * Shared EIG test helper (EP.1) — raw-driver re-derivations + policy tolerances.
 *
 * `_`-prefixed so the Node test runner does not collect it (convention per
 * tests/_ledger.js). R3 oracle split: policy-laden knobs (pin-sync claim map,
 * tolerances, corpus anchors) live HERE, visible for human review; indisputable
 * identity machinery lives in src/engine/invariants.js.
 *
 * The pin-claim map binds templates in the tests/e2e.accuracy.test.js header
 * docstring to live engine values. Number formats follow the F4-era docstring
 * exactly (comma-grouped thousands, 2dp percents, $ per-share). EP.3 regen pins
 * plus a rewritten header will flip the red EIG-E rows green; this map moves in
 * lockstep with tools/regen_pins.mjs then.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { extractRows } from '../src/data/schema.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { readLedgerUrls } from './_ledger.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import {
  evaluate as evaluateRec,
  runFullValuation,
} from '../src/engine/recommend.js';

/**
 * Policy tolerances for the EIG coherence suite (R3 — policy lives here).
 * Percent/money claims state 2dp display numbers (half-unit 0.005 plus float
 * slack → 0.01); per-share claims state full precision or 2dp displays.
 * EIG-A1 is exact construction with float-only slack (module convention).
 * @type {Readonly<object>}
 */
export const POLICY = Object.freeze({
  pinSync: Object.freeze({
    percent: 0.01,
    plain: 0.005,
    moneyThousands: 0.01,
    perShare: 0.01,
  }),
  eigA: Object.freeze({
    absolute: 1e-6,
    relative: 1e-12,
  }),
});

/**
 * EP EIG state ledger — EIG-E greens at the EP.3 regen (economy_phase.md §5
 * EP.3 gate C); EIG-A/B/C enforcement live from EP.2/EP.3 respectively.
 * @type {Readonly<object>}
 */
export const EIG_EP1_LEDGER = Object.freeze({
  eigD: Object.freeze({ status: 'green', landsIn: 'EP.1' }),
  eigE: Object.freeze({ status: 'green-since-EP.3-regen', landsIn: 'EP.3' }),
  eigCEnforcement: Object.freeze({ status: 'active-since-EP.2', landsIn: 'EP.2' }),
  eigB: Object.freeze({ status: 'green-since-EP.2', landsIn: 'EP.2' }),
  eigA: Object.freeze({ status: 'green-since-EP.3', landsIn: 'EP.3' }),
});

/**
 * Pin-claim map: e2e docstring template → live pin. Regexes carry only small
 * literals (test files are not engine-gated, but the habit is cheap).
 * @type {ReadonlyArray<object>}
 */
export const PIN_CLAIMS = Object.freeze([
  Object.freeze({
    key: 'risk_free_rate',
    description: 'Docstring rf claim ties to the live risk-free driver.',
    pattern: /\brf ([\d.]+)%/,
    kind: 'percent',
    liveKey: 'riskFreeRate',
    tolerance: POLICY.pinSync.percent,
  }),
  Object.freeze({
    key: 'beta',
    description: 'Docstring beta claim ties to the live beta driver.',
    pattern: /\bbeta ([\d.]+)/,
    kind: 'plain',
    liveKey: 'beta',
    tolerance: POLICY.pinSync.plain,
  }),
  Object.freeze({
    key: 'equity_risk_premium',
    description: 'Docstring ERP claim ties to the live ERP driver.',
    pattern: /\bERP ([\d.]+)%/,
    kind: 'percent',
    liveKey: 'equityRiskPremium',
    tolerance: POLICY.pinSync.percent,
  }),
  Object.freeze({
    key: 'cost_of_equity',
    description: 'Docstring Re claim ties to the live CAPM cost of equity.',
    pattern: /\bRe ([\d.]+)%/,
    kind: 'percent',
    liveKey: 'costOfEquity',
    tolerance: POLICY.pinSync.percent,
  }),
  Object.freeze({
    key: 'wacc',
    description: 'Docstring WACC claim ties to the live WACC build.',
    pattern: /WACC = ([\d.]+)%/,
    kind: 'percent',
    liveKey: 'wacc',
    tolerance: POLICY.pinSync.percent,
  }),
  Object.freeze({
    key: 'pv_explicit',
    description: 'Docstring explicit-period PV claim ties to the live DCF leg.',
    pattern: /pvExplicit ([\d,]+\.\d{2})/,
    kind: 'moneyThousands',
    liveKey: 'pvExplicit',
    tolerance: POLICY.pinSync.moneyThousands,
  }),
  Object.freeze({
    key: 'terminal_value',
    description: 'Docstring Gordon TV claim ties to the live terminal value.',
    pattern: /Gordon TV ([\d,]+\.\d{2})/,
    kind: 'moneyThousands',
    liveKey: 'terminalValue',
    tolerance: POLICY.pinSync.moneyThousands,
  }),
  Object.freeze({
    key: 'enterprise_value',
    description: 'Docstring EV claim ties to the live enterprise value.',
    pattern: /\bEV ([\d,]+\.\d{2})/,
    kind: 'moneyThousands',
    liveKey: 'enterpriseValue',
    tolerance: POLICY.pinSync.moneyThousands,
  }),
  Object.freeze({
    key: 'net_cash',
    description: 'Docstring net-cash claim ties to the live bridge.',
    pattern: /Net Cash ([\d,]+\.\d{2})/,
    kind: 'moneyThousands',
    liveKey: 'netCash',
    tolerance: POLICY.pinSync.moneyThousands,
  }),
  Object.freeze({
    key: 'equity_value',
    description: 'Docstring equity-value claim ties to the live equity value.',
    pattern: /\bEquity ([\d,]+\.\d{2})/,
    kind: 'moneyThousands',
    liveKey: 'equityValue',
    tolerance: POLICY.pinSync.moneyThousands,
  }),
  Object.freeze({
    key: 'per_share',
    description: 'Docstring per-share claim ties to the live per-share value.',
    pattern: /perShare \$([\d.]+)/,
    kind: 'perShare',
    liveKey: 'perShare',
    tolerance: POLICY.pinSync.perShare,
  }),
  Object.freeze({
    key: 'upside_and_label',
    description: 'Docstring upside claim ties to the live upside and label.',
    pattern: /([+-]?[\d.]+)% (Undervalued|Fair|Overvalued)\)/,
    kind: 'upsideAndLabel',
    liveNumberKey: 'upsidePct',
    liveLabelKey: 'label',
    tolerance: POLICY.pinSync.percent,
  }),
  Object.freeze({
    key: 'bear',
    description: 'Docstring Bear claim ties to the live bear per-share.',
    pattern: /\bBear \$([\d.]+)/,
    kind: 'perShare',
    liveKey: 'bear',
    tolerance: POLICY.pinSync.perShare,
  }),
  Object.freeze({
    key: 'base',
    description: 'Docstring Base claim ties to the live base per-share.',
    pattern: /\bBase \$([\d.]+)/,
    kind: 'perShare',
    liveKey: 'base',
    tolerance: POLICY.pinSync.perShare,
  }),
  Object.freeze({
    key: 'bull',
    description: 'Docstring Bull claim ties to the live bull per-share.',
    pattern: /\bBull \$([\d.]+)/,
    kind: 'perShare',
    liveKey: 'bull',
    tolerance: POLICY.pinSync.perShare,
  }),
]);

/**
 * Red-by-design map at EP.1 (F4 record): claims whose docstring numbers cannot
 * tie to live pins until the EP.3 regen rewrites the header.
 * @type {ReadonlyArray<string>}
 */
export const EIG_E_RED_KEYS_EP1 = Object.freeze([
  'beta',
  'equity_risk_premium',
  'cost_of_equity',
  'wacc',
  'pv_explicit',
  'terminal_value',
  'enterprise_value',
  'equity_value',
  'per_share',
  'upside_and_label',
  'bear',
  'base',
  'bull',
]);

/**
 * Green claims at EP.1 (partially refreshed F4 survivors): claims that still
 * tie today and prove the detector discriminates rather than blanket-failing.
 * @type {ReadonlyArray<string>}
 */
export const EIG_E_GREEN_KEYS_EP1 = Object.freeze(['risk_free_rate', 'net_cash']);

/** Absolute path of the e2e accuracy test carrying the pin docstring. */
export const E2E_TEST_PATH = fileURLToPath(new URL('./e2e.accuracy.test.js', import.meta.url));

/** Absolute path of the invariants engine module. */
export const INVARIANTS_PATH = fileURLToPath(
  new URL('../src/engine/invariants.js', import.meta.url),
);

/**
 * Reads the e2e test source text (docstring claims live in its header).
 * @returns {string}
 */
export function readE2eSource() {
  return fs.readFileSync(E2E_TEST_PATH, 'utf8');
}

/**
 * Reads the invariants engine module source (purity / literal gate scans).
 * @returns {string}
 */
export function readInvariantsSource() {
  return fs.readFileSync(INVARIANTS_PATH, 'utf8');
}

/** Cached full-model build shared by the coherence suite. */
let cachedModel = null;

/**
 * Builds the full pipeline from raw corpus + drivers — no worker fixtures, the
 * loader and every engine recompute from source on every cold run.
 *
 * @returns {Promise<object>} Frozen pipeline outputs for EIG checks.
 */
export async function buildFullModel() {
  if (cachedModel) {
    return cachedModel;
  }
  const readText = (location) => fs.promises.readFile(location, 'utf8');
  const ledger = readLedgerUrls();
  const dataDir = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
  const assumptionsPath = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
  const historical = await loadHistorical({
    dir: dataDir,
    readText,
    requireLedger: true,
    ledger,
  });
  const assumptions = await loadAssumptions({ location: assumptionsPath, readText });
  const schedules = schedulesEngine.build(historical, assumptions);
  const forecast = forecastEngine.project({ historical, assumptions });
  const threeStatement = threeStatementEngine.project(schedules, assumptions, forecast);
  const wacc = buildWacc({ assumptions, debtSchedule: schedules.debt });
  const dcf = valuateDcf(threeStatement, wacc, { assumptions, corpus: historical });
  const marketPrice = assumptions.get('market_share_price').value;
  const recommendation = evaluateRec(dcf.perShare, marketPrice);
  const scenarios = {
    bear: runFullValuation(historical, assumptions, 'bear'),
    base: {
      dcf,
      perShare: dcf.perShare,
      recommendation,
    },
    bull: runFullValuation(historical, assumptions, 'bull'),
  };
  cachedModel = Object.freeze({
    historical,
    assumptions,
    schedules,
    forecast,
    threeStatement,
    wacc,
    dcf,
    recommendation,
    scenarios,
  });
  return cachedModel;
}

/**
 * Derives the EIG-E live pin map from a built model — engine outputs and raw
 * driver reads only, never a re-implementation of engine formulas.
 *
 * @param {object} model Full-model payload from buildFullModel().
 * @returns {object} Frozen live pin map keyed like PIN_CLAIMS live keys.
 */
export function deriveLivePins(model) {
  return Object.freeze({
    riskFreeRate: model.assumptions.get('risk_free_rate').value,
    beta: model.assumptions.get('beta').value,
    equityRiskPremium: model.assumptions.get('equity_risk_premium').value,
    costOfEquity: model.wacc.costOfEquity.value,
    wacc: model.wacc.wacc.value,
    pvExplicit: model.dcf.pvExplicit,
    terminalValue: model.dcf.terminalValue,
    enterpriseValue: model.dcf.enterpriseValue,
    netCash: model.dcf.netCash,
    equityValue: model.dcf.equityValue,
    perShare: model.dcf.perShare,
    upsidePct: model.recommendation.upsidePct,
    label: model.recommendation.label,
    bear: model.scenarios.bear.dcf.perShare,
    base: model.scenarios.base.dcf.perShare,
    bull: model.scenarios.bull.dcf.perShare,
  });
}

/**
 * Flattens the loaded historical corpus into raw rows for seam checks.
 *
 * @param {object} historical Loaded historical dataset.
 * @returns {Array<object>}
 */
export function flattenHistoricalRows(historical) {
  return [
    ...extractRows(historical.income),
    ...extractRows(historical.balance),
    ...extractRows(historical.cashflow),
  ];
}

/**
 * Finds one raw corpus row fail-closed.
 *
 * @param {Array<object>} rows Flat corpus rows.
 * @param {string} metric Metric key.
 * @param {string} period Period label.
 * @returns {object}
 */
export function findRow(rows, metric, period) {
  const found = rows.find((r) => r && r.metric === metric && r.period === period);
  if (!found || !Number.isFinite(found.value)) {
    throw new Error(`Required corpus row ${metric}@${period} is missing or non-finite.`);
  }
  return found;
}

/**
 * Re-derives the EIG-A1 terminal inputs from raw CF/WC-schedule lines plus
 * the WACC build — never from DCF output. The Gordon expectation on the
 * normalised series is the hard identity the coherence suite asserts.
 *
 * @param {object} model Full-model payload from buildFullModel().
 * @returns {object} Frozen terminal re-derivation.
 */
export function deriveTerminalInputs(model) {
  const { threeStatement, wacc, assumptions } = model;
  const periods = threeStatement.periods;
  const terminalPeriod = periods[periods.length - 1];
  const cf = threeStatement.cashFlow.byPeriod[terminalPeriod];
  const fcffT = cf.fcff.value;
  const fcfeT = cf.free_cash_flow.value;
  const wcSchedule = threeStatement.supporting.workingCapital.byPeriod;
  const nwcT = wcSchedule[terminalPeriod].net_working_capital.value;
  const priorPeriod = periods[periods.length - 2];
  const nwcPrev = wcSchedule[priorPeriod].net_working_capital.value;
  const deltaNwc = nwcT - nwcPrev;
  const wcInflowT = -deltaNwc;
  const g = assumptions.get('terminal_growth_rate').value;
  const waccRate = wacc.wacc.value;
  const wcInflowSS = -nwcT * g;
  const fcffNorm = fcffT - wcInflowT + wcInflowSS;
  const fcfeNorm = fcfeT - wcInflowT + wcInflowSS;
  return Object.freeze({
    terminalPeriod,
    priorPeriod,
    fcffT,
    fcfeT,
    nwcT,
    nwcPrev,
    deltaNwc,
    wcInflowT,
    wcInflowSS,
    fcffNorm,
    fcfeNorm,
    g,
    waccRate,
    expectedTvFcff: (fcffNorm * (1 + g)) / (waccRate - g),
    expectedTvFcfe: (fcfeNorm * (1 + g)) / (waccRate - g),
  });
}

/**
 * Derives the EIG-A2 disclosure: terminal-year forecast-vs-perpetuity growth
 * gap (deferred-revenue growth vs g), surfaced for the EP.4 labelStable band.
 * Presence-required, non-failing by design.
 *
 * @param {object} model Full-model payload from buildFullModel().
 * @returns {object} Frozen gap disclosure.
 */
export function deriveTerminalGrowthGap(model) {
  const { threeStatement, assumptions } = model;
  const periods = threeStatement.periods;
  const terminalPeriod = periods[periods.length - 1];
  const priorPeriod = periods[periods.length - 2];
  const bs = threeStatement.balanceSheet.byPeriod;
  const defRevT = bs[terminalPeriod].current_liabilities.deferred_revenues.value;
  const defRevPrior = bs[priorPeriod].current_liabilities.deferred_revenues.value;
  const forecastGrowth = (defRevT - defRevPrior) / defRevPrior;
  const perpetuityGrowth = assumptions.get('terminal_growth_rate').value;
  return Object.freeze({
    terminalPeriod,
    priorPeriod,
    metric: 'deferred_revenues',
    forecastGrowth,
    perpetuityGrowth,
    gap: forecastGrowth - perpetuityGrowth,
    basis: 'BS deferred-revenue lines (forecast) vs terminal_growth_rate driver (perpetuity)',
  });
}
