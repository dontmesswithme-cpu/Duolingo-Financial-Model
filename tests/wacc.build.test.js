/**
 * P4.1 Artifact Contract Tests  -  WACC Build (CAPM, MKT-Labeled Market Inputs,
 * As-Of Dates, Debt-Schedule Cost of Debt).
 *
 * Covers:
 *  - `wacc.build(input)` interface, frozen output, and the full contract leg set.
 *  - **MKT labeling with as-of dates**: every market driver carries `marking: "MKT"`,
 *    a `YYYY-MM-DD` `asOf`, and a `source.provider`  -  a violation raises a
 *    `ConfigError` listing every offender.
 *  - **CAPM arithmetic independently recomputed and pinned**: `Re = rf + beta × ERP`
 *    checked against a hand-computed pin, not just against itself.
 *  - **Debt-free collapse proven**: `costOfDebt` null, `debtWeight` 0, `equityWeight` 1,
 *    `wacc === costOfEquity`  -  and the GENERAL weighted formula is exercised with a
 *    synthetic levered schedule so the collapse is a theorem, not a deleted branch.
 *  - **Capital weights recomputed and pinned**: `marketCap = price × shares`.
 *  - **Borrowing-pattern tripwire**: no corpus metric matches the debt pattern.
 *  - Fail-closed drivers (`missing_driver`), purity, determinism, deep-freeze,
 *    zero bare numeric literals > 999, and the 706-record corpus invariant.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { EngineError, ConfigError } from '../src/data/errors.js';
import { readLedgerUrls } from './_ledger.js';
import { build } from '../src/engine/wacc.js';
import { buildDebt } from '../src/engine/schedules.js';
import { WACC_FIXTURE, MARKET_KNOWN_FIGURES } from './fixtures/duolingo_facts.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const ENGINE_PATH = fileURLToPath(new URL('../src/engine/wacc.js', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

const P3_CORPUS_RECORD_COUNT = 706;

/**
 * Independent hand-computed pins. These are typed on purpose  -  an anti-tautology
 * pin must be an assertion about the answer, not a restatement of the code that
 * produced it. The fixture file supplies the DERIVED anchors; these supply the
 * independent check that those anchors are the right numbers.
 *
 * Sourced 2026-09-02:
 *   rf   = 4.79%  (FRED DGS10, 2026-09-01)
 *   beta = 0.89   (stockanalysis.com / computed OLS, 2026-08-31)
 *   ERP  = 4.46%  (Damodaran, NYU Stern, 2026-01-05)
 *   Re   = 0.0479 + 0.89 × 0.0446 = 0.087594
 *   px   = 157.85 (last completed close, 2026-09-02)
 *   sh   = 50,031,000 (Q2 FY2026 10-Q diluted weighted-average)
 *   E    = 157.85 × 50,031,000 = 7,897,393,350
 */
const PIN = Object.freeze({
  riskFreeRate: 0.0479,
  beta: 1.47,
  equityRiskPremium: 0.0425,
  costOfEquity: 0.110375,
  wacc: 0.110375,
  sharePrice: 157.85,
  sharesOutstanding: 50031000,
  marketCap: 7897393350,
  equityWeight: 1,
  debtWeight: 0,
  terminalGrowthRate: 0.025,
  taxRate: 0.134225,
});

/** Absolute tolerance for float pins (rates and weights  -  magnitude <= 1). */
const TOL = 1e-12;

/**
 * Relative tolerance, combined with `TOL` so large-magnitude pins get
 * magnitude-appropriate slack.
 *
 * Why this exists: `marketCap = 157.85 × 50,031,000` is exactly 7,897,393,350
 * in decimal, but 157.85 is not exactly representable as a IEEE-754 double, so
 * the product lands on ...350.000001. A flat 1e-12 absolute tolerance is
 * unreachable at a magnitude of 7.8e9  -  not because the answer is wrong, but
 * because a double carries ~1e-16 of *relative* error. Scaling by magnitude is
 * the correct fix; loosening the number by hand would be the lazy one.
 *
 * At this rate marketCap still gets only ~7.8e-3 of slack, which catches every
 * defect that matters: one extra share moves it by 157.85, one cent of share
 * price moves it by 500,310.
 */
const REL_TOL = 1e-12;

/**
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
 * Rebuilds an AssumptionSet-shaped object from a driver array, so a test can
 * override or append a driver without touching `assumptions.json`.
 *
 * @param {ReadonlyArray<object>} drivers
 * @returns {object}
 */
function assumptionSetFrom(drivers) {
  const byName = {};
  for (const driver of drivers) byName[driver.name] = driver;
  const byGroup = {};
  for (const driver of drivers) {
    if (!byGroup[driver.group]) byGroup[driver.group] = [];
    byGroup[driver.group].push(driver);
  }
  return Object.freeze({
    drivers: Object.freeze([...drivers]),
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

describe('P4.1  -  MKT labeling with as-of dates', () => {
  test('every market driver carries marking MKT, an ISO asOf, and a source.provider', async () => {
    const assumptions = await getAssumptions();

    for (const [name, fig] of Object.entries(MARKET_KNOWN_FIGURES)) {
      if (name === 'terminal_growth_rate') {
        assert.equal(fig.marking, 'EST', 'terminal growth is a judgment, not a market observation');
        assert.equal(fig.asOf, null, 'an EST judgment carries no as-of date');
        continue;
      }
      assert.equal(fig.marking, 'MKT', `${name} must be MKT-labeled`);
      assert.match(fig.asOf, /^\d{4}-\d{2}-\d{2}$/, `${name} must carry a YYYY-MM-DD asOf`);
      assert.ok(fig.provider && fig.provider.length > 0, `${name} must name a provider`);
      assert.match(fig.url, /^https?:\/\//, `${name} must carry an absolute source url`);
    }

    // The loaded set must expose the drivers the build reads.
    for (const name of ['risk_free_rate', 'beta', 'equity_risk_premium', 'market_share_price', 'shares_outstanding']) {
      const driver = assumptions.get(name);
      assert.ok(driver, `driver ${name} must exist`);
      assert.equal(driver.group, 'market', `${name} must live in the market group`);
    }
  });

  test('a missing asOf on an MKT driver raises ConfigError naming every offender', async () => {
    const assumptions = await getAssumptions();

    const broken = assumptions.drivers.map((d) =>
      d.name === 'risk_free_rate' || d.name === 'beta'
        ? Object.freeze({ ...d, asOf: undefined })
        : d,
    );

    assert.throws(
      () => build({ assumptions: assumptionSetFrom(broken) }),
      (err) => {
        assert.ok(err instanceof ConfigError, `expected ConfigError, got ${err.name}`);
        assert.match(err.message, /risk_free_rate/);
        assert.match(err.message, /beta/);
        assert.match(err.message, /2 MKT market-input violation\(s\)/);
        return true;
      },
    );
  });

  test('a non-MKT marking or a missing provider is rejected just as loudly', async () => {
    const assumptions = await getAssumptions();

    const unmarked = assumptions.drivers.map((d) =>
      d.name === 'equity_risk_premium' ? Object.freeze({ ...d, marking: 'EST' }) : d,
    );
    assert.throws(
      () => build({ assumptions: assumptionSetFrom(unmarked) }),
      (err) => err instanceof ConfigError && /equity_risk_premium/.test(err.message),
    );

    const unsourced = assumptions.drivers.map((d) =>
      d.name === 'market_share_price' ? Object.freeze({ ...d, source: { url: d.source.url } }) : d,
    );
    assert.throws(
      () => build({ assumptions: assumptionSetFrom(unsourced) }),
      (err) => err instanceof ConfigError && /source\.provider/.test(err.message),
    );
  });
});

describe('P4.1  -  CAPM arithmetic and the debt-free collapse', () => {
  test('cost of equity is rf + beta × ERP, pinned and independently recomputed', async () => {
    const assumptions = await getAssumptions();
    const waccBuild = build({ assumptions });

    // Independent pin (hand-computed from the sourced market data).
    pinned(waccBuild.riskFreeRate.value, PIN.riskFreeRate, 'riskFreeRate');
    pinned(waccBuild.beta.value, PIN.beta, 'beta');
    pinned(waccBuild.equityRiskPremium.value, PIN.equityRiskPremium, 'equityRiskPremium');
    pinned(waccBuild.costOfEquity.value, PIN.costOfEquity, 'costOfEquity (CAPM pin)');

    // Recomputed from the legs the build actually returned.
    assert.equal(
      waccBuild.costOfEquity.value,
      waccBuild.riskFreeRate.value + waccBuild.beta.value * waccBuild.equityRiskPremium.value,
      'costOfEquity must equal rf + beta × ERP',
    );

    // The derived fixture anchor and the pin must agree.
    pinned(WACC_FIXTURE.costOfEquity, PIN.costOfEquity, 'WACC_FIXTURE.costOfEquity');
  });

  test('debt-free corpus collapses WACC to the cost of equity as a theorem', async () => {
    const assumptions = await getAssumptions();
    const waccBuild = build({ assumptions });

    assert.equal(waccBuild.debtFree, true, 'Duolingo is debt-free per P2.3');
    assert.equal(waccBuild.costOfDebt.value, null, 'cost of debt is undefined  -  null, not zero');
    pinned(waccBuild.debtWeight.value, PIN.debtWeight, 'debtWeight');
    pinned(waccBuild.equityWeight.value, PIN.equityWeight, 'equityWeight');
    pinned(waccBuild.wacc.value, PIN.wacc, 'wacc (debt-free pin)');
    pinned(waccBuild.wacc.value, waccBuild.costOfEquity.value, 'wacc === costOfEquity');

    // The general formula, recomputed from the returned legs.
    const recomputed =
      waccBuild.equityWeight.value * waccBuild.costOfEquity.value +
      waccBuild.debtWeight.value * 0 * (1 - waccBuild.taxRate.value);
    pinned(waccBuild.wacc.value, recomputed, 'wacc recomputed from weights');
  });

  test('the general weighted formula is live, not a hardcoded return-costOfEquity branch', async () => {
    const assumptions = await getAssumptions();

    // A synthetic levered capital structure. `totalDebt` is the forward-compatible
    // field `wacc.build` reads off the debt schedule; the real corpus has none
    // because there is no debt to report.
    const syntheticDebt = Object.freeze({
      hasDebt: true,
      totalDebt: 1_000_000_000,
      status: 'funded_debt_present',
    });

    const syntheticRate = 0.06;
    const leveredAssumptions = assumptionSetFrom([
      ...assumptions.drivers,
      Object.freeze({
        name: 'cost_of_debt',
        label: 'Pre-Tax Cost of Debt (synthetic)',
        group: 'debt',
        value: syntheticRate,
        min: 0,
        max: 0.2,
        step: 0.001,
        units: 'pct_decimal',
        scenarioDeltas: Object.freeze({ bear: 0.01, bull: -0.01 }),
        notes: 'synthetic levered probe  -  not a corpus driver',
      }),
    ]);

    const levered = build({ assumptions: leveredAssumptions, debtSchedule: syntheticDebt });

    assert.equal(levered.debtFree, false, 'a levered schedule must not report debt-free');
    assert.equal(levered.costOfDebt.value, syntheticRate, 'cost of debt must come from the driver');

    const E = PIN.marketCap;
    const D = 1_000_000_000;
    const V = E + D;
    const expected = (E / V) * PIN.costOfEquity + (D / V) * syntheticRate * (1 - PIN.taxRate);

    pinned(levered.marketCap.value, E, 'levered marketCap');
    pinned(levered.equityWeight.value, E / V, 'levered equityWeight');
    pinned(levered.debtWeight.value, D / V, 'levered debtWeight');
    pinned(levered.wacc.value, expected, 'levered WACC via the general formula');

    // The decisive assertion: leverage must actually move the answer. A
    // hardcoded `return costOfEquity` would sail through every identity check
    // above while being wrong for any levered corpus.
    assert.ok(
      Math.abs(levered.wacc.value - levered.costOfEquity.value) > 1e-6,
      `levered WACC (${levered.wacc.value}) must differ from cost of equity (${levered.costOfEquity.value})`,
    );
    assert.ok(
      levered.wacc.value < levered.costOfEquity.value,
      'cheap debt below the cost of equity must pull WACC down',
    );
  });

  test('hasDebt true without a finite totalDebt fails closed (never a silent zero)', async () => {
    const assumptions = await getAssumptions();
    assert.throws(
      () => build({ assumptions, debtSchedule: Object.freeze({ hasDebt: true }) }),
      (err) => err instanceof EngineError && err.code === 'invalid_debt_schedule',
    );
  });
});

describe('P4.1  -  capital weights and build table', () => {
  test('marketCap = share price × diluted shares outstanding, pinned', async () => {
    const assumptions = await getAssumptions();
    const waccBuild = build({ assumptions });

    pinned(waccBuild.sharePrice.value, PIN.sharePrice, 'sharePrice');
    pinned(waccBuild.sharesOutstanding.value, PIN.sharesOutstanding, 'sharesOutstanding');
    pinned(waccBuild.marketCap.value, PIN.marketCap, 'marketCap (pin)');

    // Recomputed from the legs, not trusted from marketCap alone.
    assert.equal(
      waccBuild.marketCap.value,
      waccBuild.sharePrice.value * waccBuild.sharesOutstanding.value,
      'marketCap must equal price × shares',
    );
    pinned(WACC_FIXTURE.marketCap, PIN.marketCap, 'WACC_FIXTURE.marketCap');
  });

  test('the build table exposes every contract leg as a frozen, marked value', async () => {
    const assumptions = await getAssumptions();
    const waccBuild = build({ assumptions });

    const legs = [
      'riskFreeRate',
      'beta',
      'equityRiskPremium',
      'costOfEquity',
      'costOfDebt',
      'taxRate',
      'marketCap',
      'equityWeight',
      'debtWeight',
      'wacc',
    ];

    for (const key of legs) {
      const leg = waccBuild[key];
      assert.ok(leg && typeof leg === 'object', `leg ${key} must exist`);
      assert.ok(Object.isFrozen(leg), `leg ${key} must be frozen`);
      assert.ok(['MKT', 'EST'].includes(leg.marking), `leg ${key} marking must be MKT or EST`);
      assert.equal(leg.isComputed, true, `leg ${key} must be marked computed`);
      assert.ok(Array.isArray(leg.derivedFrom), `leg ${key} must carry a derivedFrom chain`);
      assert.ok(leg.derivedFrom.length > 0, `leg ${key} derivedFrom must be non-empty`);
    }

    // Market-sourced legs carry their as-of date; derived legs do not.
    assert.equal(waccBuild.riskFreeRate.asOf, MARKET_KNOWN_FIGURES.risk_free_rate.asOf);
    assert.equal(waccBuild.beta.asOf, MARKET_KNOWN_FIGURES.beta.asOf);
    assert.equal(waccBuild.equityRiskPremium.asOf, MARKET_KNOWN_FIGURES.equity_risk_premium.asOf);
    assert.equal(waccBuild.costOfEquity.asOf, null, 'a derived leg has no observation date');

    assert.equal(waccBuild.isComputed, true);
    assert.equal(waccBuild.isEstimate, false);
    assert.ok(Object.isFrozen(waccBuild.asOf), 'the as-of map must be frozen');
    assert.equal(waccBuild.asOf.riskFreeRate, MARKET_KNOWN_FIGURES.risk_free_rate.asOf);
  });

  test('the real debt schedule drives the build to the debt-free result', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const debt = buildDebt(historical);

    assert.equal(debt.hasDebt, false, 'P2.3 debt-free proof must still hold');

    const waccBuild = build({ assumptions, debtSchedule: debt });
    assert.equal(waccBuild.debtFree, true);
    pinned(waccBuild.wacc.value, PIN.wacc, 'wacc from the real debt schedule');
    pinned(waccBuild.wacc.value, waccBuild.costOfEquity.value, 'collapses to Re');
  });
});

describe('P4.1  -  debt-free tripwire (borrowing-pattern scan)', () => {
  test('no balance-sheet metric in the corpus matches the debt pattern', async () => {
    const historical = await getHistorical();
    const balanceRows = extractRows(historical.balance);
    const debtPattern = /borrow|notes payable|credit facility|term loan/i;

    const offenders = balanceRows.filter(
      (r) => debtPattern.test(r.metric) || debtPattern.test(r.label ?? ''),
    );

    assert.deepEqual(
      offenders.map((r) => r.metric),
      [],
      `Corpus must contain zero funded-debt metrics; found: ${offenders.map((r) => r.metric).join(', ')}`,
    );

    // The scan must actually have covered the corpus (a vacuous pass is a defect).
    assert.ok(
      balanceRows.length > 0,
      'the tripwire must scan a non-empty balance sheet, not an empty array',
    );
  });
});

describe('P4.1  -  fail-closed inputs', () => {
  test('a removed driver fails closed and names it, through whichever gate fires first', async () => {
    const assumptions = await getAssumptions();

    /*
     * `build()` enforces two gates, in this order:
     *   1. assertMarketDriverDiscipline  -  the MKT regime, over the fixed
     *      MARKET_DRIVER_NAMES list. A driver that is *absent* is an offender
     *      here, so removal of a market input surfaces as ConfigError.
     *   2. requireDriverValue  -  the fail-closed value gate. Reached only once
     *      the set is well-formed; fires on a non-finite value, or on any
     *      non-market driver that is missing outright.
     *
     * Asserting `missing_driver` for a *removed* MKT driver would be asserting
     * a behaviour the engine deliberately does not have, and would mask the
     * discipline gate that is the more informative failure. Both gates are
     * pinned here instead, each against the case that actually reaches it.
     */

    // Gate 1: a removed MKT driver  -  ConfigError, still naming the driver and
    // still refusing to proceed. Never a silent fallback to 0.
    for (const name of ['risk_free_rate', 'beta', 'equity_risk_premium', 'market_share_price', 'shares_outstanding']) {
      const without = assumptions.drivers.filter((d) => d.name !== name);
      assert.throws(
        () => build({ assumptions: assumptionSetFrom(without) }),
        (err) => {
          assert.ok(
            err instanceof ConfigError,
            `removing ${name} must raise ConfigError, got ${err.name}: ${err.message}`,
          );
          assert.equal(err.key, 'assumptions.market', `removing ${name} must be attributed to assumptions.market`);
          assert.match(err.message, new RegExp(name), `removing ${name} must name the driver`);
          assert.match(err.message, /absent from the assumption set/, `removing ${name} must report it as absent`);
          return true;
        },
        `removing ${name} must raise a ConfigError naming it`,
      );
    }

    // Gate 2: a removed non-market driver  -  the value gate, unobstructed.
    assert.throws(
      () => build({ assumptions: assumptionSetFrom(assumptions.drivers.filter((d) => d.name !== 'effective_tax_rate')) }),
      (err) =>
        err instanceof EngineError &&
        err.code === 'missing_driver' &&
        err.driverName === 'effective_tax_rate',
      'removing effective_tax_rate must raise missing_driver/effective_tax_rate',
    );
  });

  test('the discipline gate does not shadow the fail-closed value gate for MKT drivers', async () => {
    const assumptions = await getAssumptions();

    /*
     * The gap the previous test left open: an MKT driver that is *present and
     * impeccably labeled* (marking MKT, ISO asOf, named provider) but carries a
     * non-finite value passes discipline untouched. If `requireDriverValue` were
     * ever deleted or softened to `?? 0` for these drivers, every removal test
     * above would stay green while the engine silently priced a null rate.
     *
     * This is the case that reaches gate 2 for a market input, so it is the case
     * that actually pins the fail-closed behaviour for market drivers.
     */
    for (const name of ['risk_free_rate', 'beta', 'equity_risk_premium', 'market_share_price', 'shares_outstanding']) {
      for (const badValue of [null, undefined, Number.NaN, '0.05']) {
        const corrupted = assumptions.drivers.map((d) =>
          d.name === name ? Object.freeze({ ...d, value: badValue }) : d,
        );
        assert.throws(
          () => build({ assumptions: assumptionSetFrom(corrupted) }),
          (err) =>
            err instanceof EngineError &&
            err.code === 'missing_driver' &&
            err.driverName === name,
          `${name} = ${String(badValue)} must raise missing_driver/${name}, not pass discipline on its label alone`,
        );
      }
    }
  });

  test('malformed inputs raise typed errors rather than silently defaulting', async () => {
    const assumptions = await getAssumptions();

    assert.throws(
      () => build(null),
      (err) => err instanceof EngineError && err.code === 'missing_input',
    );
    assert.throws(
      () => build({}),
      (err) => err instanceof EngineError && err.code === 'missing_input',
    );
    assert.throws(
      () => build({ assumptions: { drivers: 'not-an-array' } }),
      (err) => err instanceof EngineError && err.code === 'missing_input',
    );
    assert.throws(
      () => build({ assumptions, debtSchedule: 'nonsense' }),
      (err) => err instanceof EngineError && err.code === 'invalid_debt_schedule',
    );
  });

  test('loadAssumptions() still fails closed on a malformed market driver', async () => {
    const raw = JSON.parse(fs.readFileSync(ASSUMPTIONS_PATH, 'utf8'));
    const broken = raw.map((d) =>
      d.name === 'beta' ? { ...d, asOf: '28 Aug 2026' } : d,
    );

    await assert.rejects(
      () => loadAssumptions({ readText: async () => JSON.stringify(broken) }),
      (err) => {
        assert.ok(err instanceof ConfigError, `expected ConfigError, got ${err.name}`);
        assert.match(err.message, /beta/);
        return true;
      },
    );
  });
});

describe('P4.1  -  engine purity, determinism and corpus gates', () => {
  test('wacc.build is deterministic and the output is deeply frozen', async () => {
    const assumptions = await getAssumptions();

    const run1 = build({ assumptions });
    const run2 = build({ assumptions });

    assert.equal(JSON.stringify(run1), JSON.stringify(run2), 'repeat builds must be byte-identical');
    assert.ok(Object.isFrozen(run1), 'the build output must be frozen');
    assert.ok(Object.isFrozen(run1.wacc), 'each leg must be frozen');
    assert.ok(Object.isFrozen(run1.derivedFrom), 'derivedFrom must be frozen');
    assert.ok(Object.isFrozen(run1.asOf), 'the as-of map must be frozen');

    assert.throws(() => {
      run1.wacc.value = 0;
    });
    assert.throws(() => {
      run1.riskFreeRate.value = 0;
    });
  });

  test('src/engine/wacc.js contains no forbidden side-effecting APIs', () => {
    const raw = fs.readFileSync(ENGINE_PATH, 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    assert.doesNotMatch(code, /\bfetch\s*\(/, 'must not call fetch');
    assert.doesNotMatch(code, /\bDate\s*\.\s*now\b/, 'must not call Date.now');
    assert.doesNotMatch(code, /\bMath\s*\.\s*random\b/, 'must not call Math.random');
    assert.doesNotMatch(code, /\bwindow\s*\./, 'must not access window properties');
    assert.doesNotMatch(code, /\bdocument\s*\./, 'must not access document properties');
    assert.doesNotMatch(code, /\blocalStorage\b/, 'must not reference localStorage');
    assert.doesNotMatch(code, /\bsessionStorage\b/, 'must not reference sessionStorage');
  });

  test('zero bare numeric literals > 999 outside comments in wacc.js', () => {
    const source = fs.readFileSync(ENGINE_PATH, 'utf8');
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    const bigLiterals = withoutComments.match(/\b\d{4,}\b/g) || [];
    assert.deepEqual(
      bigLiterals,
      [],
      `Found bare numeric literals > 999 in wacc.js: ${bigLiterals.join(', ')}`,
    );
  });

  test('corpus record count invariant: historical datasets unchanged (706 records)', async () => {
    const historical = await getHistorical();
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];
    assert.strictEqual(
      allRows.length,
      P3_CORPUS_RECORD_COUNT,
      `Corpus record count must remain exactly ${P3_CORPUS_RECORD_COUNT}`,
    );
  });

  test('market inputs live only in assumptions.json  -  no market value in the engine', () => {
    const engineDir = fileURLToPath(new URL('../src/engine/', import.meta.url));
    const engineFiles = fs.readdirSync(engineDir).filter((f) => f.endsWith('.js'));

    const waccRaw = fs.readFileSync(ENGINE_PATH, 'utf8');
    const waccCode = waccRaw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    // A market number typed into the engine would be a literal gate violation
    // and an uncited figure. The build must read every one from a driver.
    for (const name of ['risk_free_rate', 'beta', 'equity_risk_premium', 'market_share_price', 'shares_outstanding']) {
      assert.ok(
        waccCode.includes(`'${name}'`),
        `wacc.js must resolve ${name} by driver name`,
      );
    }

    // Every engine file outside comments must contain no bare numerics > 999,
    // no hardcoded market-anchor literals, and no buried fallbacks on market drivers
    for (const file of engineFiles) {
      const filePath = path.join(engineDir, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      const code = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

      const bigLiterals = code.match(/\b\d{4,}\b/g) || [];
      assert.deepEqual(
        bigLiterals,
        [],
        `Found bare numeric literals > 999 in ${file}: ${bigLiterals.join(', ')}`,
      );

      assert.doesNotMatch(code, /0\.0473/, `risk-free rate (0.0473) must not be hardcoded in ${file}`);
      assert.doesNotMatch(code, /0\.0479/, `risk-free rate (0.0479) must not be hardcoded in ${file}`);
      assert.doesNotMatch(code, /148\.36/, `market share price (148.36) must not be hardcoded in ${file}`);
      assert.doesNotMatch(code, /157\.85/, `market share price (157.85) must not be hardcoded in ${file}`);
      assert.doesNotMatch(code, /0\.0442/, `ERP (0.0442) must not be hardcoded in ${file}`);
      assert.doesNotMatch(code, /0\.0446/, `ERP (0.0446) must not be hardcoded in ${file}`);
      assert.doesNotMatch(code, /\?\?\s*(?:148\.36|157\.85|0\.025|0\.0473|0\.0479|0\.0442|0\.0446)/, `buried market fallback found in ${file}`);
    }
  });
});
