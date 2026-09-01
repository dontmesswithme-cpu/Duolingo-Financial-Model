/**
 * P3.1 Artifact Contract tests — Driver-Based Forecast Core.
 *
 * Covers:
 *  - `forecast.project(input)` frozen signature, horizon clamp [3,10], typed errors.
 *  - Revenue cascade: paid subscribers → average subs → × ARPU → subscription
 *    revenue; advertising / DET / IAP / other as growth-driven segment paths.
 *  - Segment-sum totality pinned against an INDEPENDENT recomputation
 *    (`deriveExpectedForecast`) for FY2026 and FY2030 — anti-tautology.
 *  - Hybrid FY2026: H1 actual from the cited Q1/Q2 FY2026 rows (590,421),
 *    H2 = full-year estimate − H1, per-half provenance on every IS line.
 *  - Cascade anti-retyping: mutating a cited anchor or a driver changes output.
 *  - Honest driver defaults re-derived from the corpus; tax + subs growth EST-labeled.
 *  - Fail-closed drivers, purity, determinism, deep freeze, zero-literal gate.
 *  - Engine-only phase: the corpus record count is unchanged.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { EngineError, ConfigError } from '../src/data/errors.js';
import {
  FORECAST_HORIZON_MIN,
  FORECAST_HORIZON_MAX,
  FORECAST_BASE_YEAR,
} from '../src/data/constants.js';
import { readLedgerUrls } from './_ledger.js';
import {
  FORECAST_KNOWN_FIGURES,
  FORECAST_FIXTURES,
  deriveExpectedForecast,
} from './fixtures/duolingo_facts.js';
import forecast, {
  project,
  forecastPeriods,
  normalizeHorizon,
  REVENUE_SEGMENT_KEYS,
  COST_LINE_KEYS,
  COST_DRIVER_BY_KEY,
  OPEX_LINE_KEYS,
} from '../src/engine/forecast.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const ENGINE_PATH = fileURLToPath(new URL('../src/engine/forecast.js', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

const FORECAST_DRIVERS = [
  'paid_subscriber_growth',
  'subscription_arpu',
  'advertising_revenue_growth',
  'det_revenue_growth',
  'iap_revenue_growth',
  'other_revenue_growth',
  'cost_of_revenue_pct_revenue',
  'rd_pct_revenue',
  'sm_pct_revenue',
  'ga_pct_revenue',
];

/** Record count of the P2 corpus — the engine-only phase must not change it. */
const P2_CORPUS_RECORD_COUNT = 706;

async function getHistorical() {
  return loadHistorical({
    dir: DATA_DIR,
    readText,
    requireLedger: true,
    ledger: LEDGER,
  });
}

async function getAssumptions() {
  return loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
}

/**
 * @param {object} assumptions
 * @returns {Record<string, number>}
 */
function driverValues(assumptions) {
  const out = {};
  for (const name of FORECAST_DRIVERS) out[name] = assumptions.getValue(name);
  return out;
}

/**
 * Deep clone via JSON so mutation tests can edit cited rows freely.
 * @param {object} value
 * @returns {object}
 */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ────────────────────────────────────────────────────────────────────────────
describe('P3.1 — Fixture integrity: cited forecast anchors vs corpus', () => {
  test('every FORECAST_KNOWN_FIGURES anchor matches the corpus exactly', async () => {
    const historical = await getHistorical();
    const rows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];

    for (const anchor of FORECAST_KNOWN_FIGURES) {
      const row = rows.find((r) => r.metric === anchor.metric && r.period === anchor.period);
      assert.ok(row, `corpus is missing ${anchor.metric} @ ${anchor.period}`);
      assert.equal(
        row.value,
        anchor.value,
        `${anchor.metric} @ ${anchor.period}: corpus ${row.value} != fixture ${anchor.value}`,
      );
      assert.equal(row.units, anchor.units, `${anchor.metric} @ ${anchor.period}: units drift`);
      assert.equal(row.source.url, anchor.source.url, `${anchor.metric} @ ${anchor.period}: source drift`);
    }
  });

  test('engine-only phase: the corpus record count is unchanged from P2', async () => {
    const historical = await getHistorical();
    const total =
      extractRows(historical.income).length +
      extractRows(historical.balance).length +
      extractRows(historical.cashflow).length +
      extractRows(historical.kpis).length;
    assert.equal(total, P2_CORPUS_RECORD_COUNT);
  });

  test('derived fixtures reproduce the contract anchors', () => {
    // H1 FY2026 revenue = 590,421 (Q1 291,967 + Q2 298,454), derived not typed.
    assert.equal(FORECAST_FIXTURES.h1Fy2026Actuals.revenue_total, 590_421);
    // FY2025 average subs 10.85M → ARPU ≈ $80.50.
    assert.equal(FORECAST_FIXTURES.subscribers.averageFy2025, 10_850_000);
    assert.ok(Math.abs(FORECAST_FIXTURES.arpuFy2025 - 80.5) < 0.01, String(FORECAST_FIXTURES.arpuFy2025));
    // Average invested cash 1,125,751 → interest rate ≈ 4.0%.
    assert.equal(
      (FORECAST_FIXTURES.interest.investedCashFy2024 + FORECAST_FIXTURES.interest.investedCashFy2025) / 2,
      1_125_751,
    );
    // H1 FY2025 comparison base.
    assert.equal(FORECAST_FIXTURES.h1Fy2025Total, 483_008);
    // FY2025 distortion evidence: −126.997% effective rate.
    assert.ok(FORECAST_FIXTURES.tax.fy2025EffectiveRate < -1.2, String(FORECAST_FIXTURES.tax.fy2025EffectiveRate));
  });

  test('H1 FY2026 gross profit and operating income tie to cited quarters', () => {
    // Segment decomposition of H1 must equal the cited revenue_total H1.
    const segSum =
      FORECAST_FIXTURES.h1Fy2026Actuals.revenue_subscription +
      FORECAST_FIXTURES.h1Fy2026Actuals.revenue_advertising +
      FORECAST_FIXTURES.h1Fy2026Actuals.revenue_duolingo_english_test +
      FORECAST_FIXTURES.h1Fy2026Actuals.revenue_in_app_purchases +
      FORECAST_FIXTURES.h1Fy2026Actuals.revenue_other;
    assert.equal(segSum, FORECAST_FIXTURES.h1Fy2026Actuals.revenue_total);

    // Gross profit identity on the H1 actuals.
    assert.equal(
      FORECAST_FIXTURES.h1Fy2026Actuals.revenue_total - FORECAST_FIXTURES.h1Fy2026Actuals.cost_of_revenue,
      FORECAST_FIXTURES.h1Fy2026Actuals.gross_profit,
    );
    // Operating income identity on the H1 actuals.
    assert.equal(
      FORECAST_FIXTURES.h1Fy2026Actuals.gross_profit - FORECAST_FIXTURES.h1Fy2026Actuals.opex_total,
      FORECAST_FIXTURES.h1Fy2026Actuals.operating_income,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('P3.1 — Driver defaults are re-derived from the corpus', () => {
  test('segment growth driver defaults equal the H1 like-for-like YoY observations', async () => {
    const assumptions = await getAssumptions();
    const pairs = [
      ['advertising_revenue_growth', 'advertising'],
      ['det_revenue_growth', 'duolingo_english_test'],
      ['iap_revenue_growth', 'in_app_purchases'],
    ];
    for (const [driverName, segment] of pairs) {
      assert.ok(
        Math.abs(
          assumptions.getValue(driverName) - FORECAST_FIXTURES.segments[segment].h1LikeForLikeGrowth,
        ) < 1e-6,
        `${driverName} does not match the H1 like-for-like observation for ${segment}`,
      );
    }
  });

  test('ARPU driver default equals the FY2025 derived ARPU', async () => {
    const assumptions = await getAssumptions();
    assert.ok(
      Math.abs(assumptions.getValue('subscription_arpu') - FORECAST_FIXTURES.arpuFy2025) < 1e-3,
      String(assumptions.getValue('subscription_arpu')),
    );
  });

  test('cost-ratio driver defaults equal the FY2025 cost ratios', async () => {
    const assumptions = await getAssumptions();
    const pairs = [
      ['cost_of_revenue_pct_revenue', 'cost_of_revenue'],
      ['rd_pct_revenue', 'research_and_development'],
      ['sm_pct_revenue', 'sales_and_marketing'],
      ['ga_pct_revenue', 'general_and_administrative'],
      ['other_income_net_pct_revenue', 'other_income_net'],
    ];
    for (const [driverName, key] of pairs) {
      assert.ok(
        Math.abs(assumptions.getValue(driverName) - FORECAST_FIXTURES.costRatiosFy2025[key]) < 1e-6,
        `${driverName} does not match the FY2025 ratio for ${key}`,
      );
    }
  });

  test('tax driver default is the FY2024 undistorted effective rate, never FY2025', async () => {
    const assumptions = await getAssumptions();
    const rate = assumptions.getValue('effective_tax_rate');
    assert.ok(
      Math.abs(rate - FORECAST_FIXTURES.tax.fy2024EffectiveRate) < 1e-6,
      `effective_tax_rate ${rate} != FY2024 effective rate ${FORECAST_FIXTURES.tax.fy2024EffectiveRate}`,
    );
    assert.ok(rate > 0, 'a normalized structural rate cannot be negative');
    assert.ok(
      Math.abs(rate - FORECAST_FIXTURES.tax.fy2025EffectiveRate) > 1,
      'the tax driver must not be anchored to the FY2025 valuation-allowance artifact',
    );
  });

  test('interest-income rate default is derived from FY2025 interest income / average invested cash', async () => {
    const assumptions = await getAssumptions();
    const avgInvested =
      (FORECAST_FIXTURES.interest.investedCashFy2024 + FORECAST_FIXTURES.interest.investedCashFy2025) / 2;
    const derived = FORECAST_FIXTURES.interest.fy2025InterestIncome / avgInvested;
    assert.ok(Math.abs(assumptions.getValue('interest_income_rate') - derived) < 1e-6);
  });

  test('paid-subscriber growth default is the disclosed blend of the two cited observations', async () => {
    const assumptions = await getAssumptions();
    const blend =
      (FORECAST_FIXTURES.subscribers.fy2025Growth + FORECAST_FIXTURES.subscribers.h1Fy2026AnnualizedGrowth) / 2;
    assert.ok(
      Math.abs(assumptions.getValue('paid_subscriber_growth') - blend) < 1e-6,
      String(assumptions.getValue('paid_subscriber_growth')),
    );
    // …and it is a genuine middle, not one of the two anchors.
    assert.ok(assumptions.getValue('paid_subscriber_growth') < FORECAST_FIXTURES.subscribers.fy2025Growth);
    assert.ok(
      assumptions.getValue('paid_subscriber_growth') > FORECAST_FIXTURES.subscribers.h1Fy2026AnnualizedGrowth,
    );
  });

  test('other-revenue growth defaults to held constant (0), by explicit design', async () => {
    const assumptions = await getAssumptions();
    assert.equal(assumptions.getValue('other_revenue_growth'), 0);
  });

  test('every P3 driver has honest notes, ranges and bear/bull deltas', async () => {
    const assumptions = await getAssumptions();
    const p3Groups = ['revenue', 'costs', 'tax', 'financing'];
    const p3Drivers = assumptions.drivers.filter((d) => p3Groups.includes(d.group));
    assert.ok(p3Drivers.length >= 16, `expected the P3 driver groups, found ${p3Drivers.length}`);

    for (const driver of p3Drivers) {
      assert.ok(driver.notes && driver.notes.trim().length > 20, `${driver.name}: notes too thin`);
      assert.ok(driver.value >= driver.min && driver.value <= driver.max, `${driver.name}: value out of range`);
      assert.ok(driver.min < driver.max, `${driver.name}: empty range`);
      assert.ok(Number.isFinite(driver.scenarioDeltas.bear), `${driver.name}: missing bear delta`);
      assert.ok(Number.isFinite(driver.scenarioDeltas.bull), `${driver.name}: missing bull delta`);
      assert.notEqual(driver.scenarioDeltas.bear, 0, `${driver.name}: bear delta is a no-op`);
      assert.notEqual(driver.scenarioDeltas.bull, 0, `${driver.name}: bull delta is a no-op`);
    }

    // Contract-mandated EST labelling, with the rationale stated in the notes.
    const subsGrowth = assumptions.get('paid_subscriber_growth');
    assert.match(subsGrowth.notes, /EST/);
    assert.match(subsGrowth.notes, /deceleration/i);

    const tax = assumptions.get('effective_tax_rate');
    assert.match(tax.notes, /EST/);
    assert.match(tax.notes, /valuation-allowance/i);
    assert.match(tax.notes, /one-time/i);
  });

  test('loadAssumptions() still fails closed on a malformed driver', async () => {
    const raw = JSON.parse(fs.readFileSync(ASSUMPTIONS_PATH, 'utf8'));
    const broken = raw.map((d) => (d.name === 'subscription_arpu' ? { ...d, value: null } : d));
    await assert.rejects(
      () => loadAssumptions({ readText: async () => JSON.stringify(broken) }),
      ConfigError,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('P3.1 — Interface, horizon clamp & fail-closed inputs', () => {
  test('project() is exported with the frozen single-argument signature', () => {
    assert.equal(typeof project, 'function');
    assert.equal(project.length, 1);
    assert.equal(typeof forecast.project, 'function');
  });

  test('forecastPeriods() builds FY2026…FY2030 for the default horizon', () => {
    assert.deepEqual([...forecastPeriods(5)], ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']);
    assert.equal(forecastPeriods(5)[0], `FY${FORECAST_BASE_YEAR}`);
  });

  test('normalizeHorizon() accepts the full [3, 10] range and defaults to 5', () => {
    assert.equal(normalizeHorizon(undefined), 5);
    assert.equal(normalizeHorizon(FORECAST_HORIZON_MIN), FORECAST_HORIZON_MIN);
    assert.equal(normalizeHorizon(FORECAST_HORIZON_MAX), FORECAST_HORIZON_MAX);
  });

  test('out-of-range and non-integer horizons throw a typed error naming the input', () => {
    for (const bad of [2, 11, 0, -3, 4.5, '5', NaN, Infinity]) {
      assert.throws(
        () => normalizeHorizon(bad),
        (err) =>
          err instanceof EngineError &&
          err.code === 'invalid_horizon' &&
          err.driverName === 'horizon',
        `horizon ${String(bad)} must throw invalid_horizon`,
      );
    }
  });

  test('project() honours an explicit horizon in both directions', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const short = project({ historical, assumptions, horizon: 3 });
    assert.equal(short.horizon, 3);
    assert.deepEqual([...short.periods], ['FY2026', 'FY2027', 'FY2028']);

    const long = project({ historical, assumptions, horizon: 10 });
    assert.equal(long.horizon, 10);
    assert.equal(long.periods.length, 10);
  });

  test('project() rejects a bad horizon rather than clamping it silently', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    assert.throws(
      () => project({ historical, assumptions, horizon: 2 }),
      (err) => err instanceof EngineError && err.code === 'invalid_horizon',
    );
  });

  test('project() fails closed on missing historical / assumptions / input', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    assert.throws(
      () => project(null),
      (err) => err instanceof EngineError && err.code === 'invalid_forecast_input',
    );
    assert.throws(
      () => project({ assumptions }),
      (err) => err instanceof EngineError && err.code === 'missing_historical',
    );
    assert.throws(
      () => project({ historical }),
      (err) => err instanceof EngineError && err.code === 'missing_assumptions',
    );
  });

  test('every driver lookup fails closed with missing_driver naming the driver', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    for (const name of FORECAST_DRIVERS) {
      const stripped = {
        getValue: (key) => (key === name ? undefined : assumptions.getValue(key)),
        get: (key) => assumptions.get(key),
      };
      assert.throws(
        () => project({ historical, assumptions: stripped }),
        (err) =>
          err instanceof EngineError &&
          err.code === 'missing_driver' &&
          err.driverName === name,
        `removing ${name} must throw missing_driver`,
      );
    }
  });

  test('a missing cited corpus anchor fails closed, never silently zeroed', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const broken = clone(historical);
    broken.kpis = broken.kpis.filter(
      (r) => !(r.metric === 'paid_subscribers' && r.period === 'Q2 FY2026'),
    );

    assert.throws(
      () => project({ historical: broken, assumptions }),
      (err) =>
        err instanceof EngineError &&
        err.code === 'missing_corpus_row' &&
        err.driverName === 'paid_subscribers',
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('P3.1 — Hybrid FY2026 per-half provenance', () => {
  test('H1 revenue equals the cited Q1+Q2 FY2026 quarters (590,421)', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const out = project({ historical, assumptions });

    const total = out.byPeriod.FY2026.revenue.total;
    assert.equal(total.h1.value, FORECAST_FIXTURES.h1Fy2026Actuals.revenue_total);
    assert.equal(total.h1.value, 590_421);

    // And it is assembled from the two cited quarter rows, not typed.
    assert.equal(total.h1.derivedFrom.length, 2);
    assert.deepEqual(
      total.h1.derivedFrom.map((c) => c.period),
      ['Q1 FY2026', 'Q2 FY2026'],
    );
    for (const citation of total.h1.derivedFrom) {
      assert.equal(citation.metric, 'revenue_total');
      assert.equal(citation.isEstimate, false);
      assert.ok(citation.source && citation.source.url.startsWith('https://www.sec.gov/'));
    }
  });

  test('every FY2026 IS line carries h1/h2 blocks with h1 + h2 === value', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const out = project({ historical, assumptions });
    const fy2026 = out.byPeriod.FY2026;

    const lines = {
      ...fy2026.revenue.segments,
      revenue_total: fy2026.revenue.total,
      ...fy2026.costs,
      gross_profit: fy2026.gross_profit,
      operating_income: fy2026.operating_income,
    };

    for (const [name, line] of Object.entries(lines)) {
      assert.ok(line.h1, `${name}: missing h1 block`);
      assert.ok(line.h2, `${name}: missing h2 block`);
      assert.equal(line.h1.provenance, 'actual', `${name}: h1 must be an actual`);
      assert.equal(line.h2.provenance, 'estimate', `${name}: h2 must be an estimate`);
      assert.equal(line.h1.isEstimate, false, `${name}: a cited actual is never an estimate`);
      assert.equal(line.h2.isEstimate, true, `${name}: h2 is an estimate`);
      assert.ok(
        Math.abs(line.h1.value + line.h2.value - line.value) < 1e-9,
        `${name}: h1 + h2 !== value`,
      );
      assert.equal(line.h1.derivedFrom.length, 2, `${name}: h1 must cite two quarter rows`);
      assert.deepEqual(
        line.h1.derivedFrom.map((c) => c.period),
        ['Q1 FY2026', 'Q2 FY2026'],
        `${name}: h1 must cite Q1 and Q2 FY2026`,
      );
    }
  });

  test('every FY2026 H1 block equals the cited quarter sums', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const fy2026 = project({ historical, assumptions }).byPeriod.FY2026;
    const actuals = FORECAST_FIXTURES.h1Fy2026Actuals;

    const expectations = {
      subscription: actuals.revenue_subscription,
      advertising: actuals.revenue_advertising,
      duolingo_english_test: actuals.revenue_duolingo_english_test,
      in_app_purchases: actuals.revenue_in_app_purchases,
      other: actuals.revenue_other,
      cost_of_revenue: actuals.cost_of_revenue,
      research_and_development: actuals.opex_research_and_development,
      sales_and_marketing: actuals.opex_sales_and_marketing,
      general_and_administrative: actuals.opex_general_and_administrative,
      opex_total: actuals.opex_total,
      gross_profit: actuals.gross_profit,
      operating_income: actuals.operating_income,
    };

    for (const [segment, expected] of Object.entries(expectations)) {
      const line = fy2026.revenue.segments[segment] ?? fy2026.costs[segment] ?? fy2026[segment];
      assert.ok(line, `missing FY2026 line for ${segment}`);
      assert.equal(line.h1.value, expected, `${segment}: H1 actual drift`);
    }
  });

  test('H2 is the driver model estimate for H2, never a uniform split', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const total = project({ historical, assumptions }).byPeriod.FY2026.revenue.total;

    // H1 is a cited actual; H2 is the driver model estimate for H2.
    assert.notEqual(total.h2.value, total.h1.value, 'a uniform 50/50 split would be a defect');
    assert.ok(total.h2.value > 0, 'H2 revenue must be positive');
    assert.ok(
      Math.abs(total.value - (total.h1.value + total.h2.value)) < 1e-9,
      'Full year must equal H1 actual + H2 estimate',
    );
  });

  test('non-hybrid years carry no half blocks', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const out = project({ historical, assumptions });

    for (const period of out.periods.slice(1)) {
      const block = out.byPeriod[period];
      assert.equal(block.isHybrid, false, `${period} must not be hybrid`);
      assert.equal(block.revenue.total.h1, undefined, `${period} must not carry an h1 block`);
      assert.equal(block.revenue.total.h2, undefined, `${period} must not carry an h2 block`);
      assert.equal(block.revenue.total.provenance, 'estimate');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('P3.1 — Segment-sum totality & pinned values (anti-tautology)', () => {
  test('revenue_total === Σ segments in every forecast year', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const out = project({ historical, assumptions });

    for (const period of out.periods) {
      const block = out.byPeriod[period];
      const sum = REVENUE_SEGMENT_KEYS.reduce((acc, key) => acc + block.revenue.segments[key].value, 0);
      assert.ok(
        Math.abs(sum - block.revenue.total.value) < 1e-9,
        `${period}: segment sum ${sum} !== total ${block.revenue.total.value}`,
      );
      for (const key of REVENUE_SEGMENT_KEYS) {
        assert.ok(block.revenue.segments[key].value > 0, `${period}/${key}: non-positive revenue`);
      }
    }
  });

  test('FY2026 and FY2030 segment values match the independent recomputation', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const out = project({ historical, assumptions });
    const expected = deriveExpectedForecast({ drivers: driverValues(assumptions) });

    for (const period of ['FY2026', 'FY2030']) {
      const block = out.byPeriod[period];
      for (const key of REVENUE_SEGMENT_KEYS) {
        assert.ok(
          Math.abs(block.revenue.segments[key].value - expected[period].revenue.segments[key]) < 1e-6,
          `${period}/${key}: engine ${block.revenue.segments[key].value} != independent ${expected[period].revenue.segments[key]}`,
        );
      }
      assert.ok(
        Math.abs(block.revenue.total.value - expected[period].revenue.total) < 1e-6,
        `${period}: total revenue drift`,
      );
    }
  });

  test('every line of every year matches the independent recomputation', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const out = project({ historical, assumptions });
    const expected = deriveExpectedForecast({ drivers: driverValues(assumptions) });

    for (const period of out.periods) {
      const block = out.byPeriod[period];
      const exp = expected[period];

      for (const key of COST_LINE_KEYS) {
        assert.ok(
          Math.abs(block.costs[key].value - exp.costs[key]) < 1e-6,
          `${period}/costs.${key}: drift`,
        );
      }
      assert.ok(Math.abs(block.costs.opex_total.value - exp.costs.opex_total) < 1e-6, `${period}: opex drift`);
      assert.ok(Math.abs(block.gross_profit.value - exp.gross_profit) < 1e-6, `${period}: gross profit drift`);
      assert.ok(
        Math.abs(block.operating_income.value - exp.operating_income) < 1e-6,
        `${period}: operating income drift`,
      );
      assert.ok(Math.abs(block.subscribers.average - exp.subscribers.average) < 1e-6, `${period}: subs drift`);
    }
  });

  test('cost margins hold the FY2025 driver ratios in every forecast year', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const out = project({ historical, assumptions });

    for (const period of out.periods) {
      const block = out.byPeriod[period];
      for (const key of COST_LINE_KEYS) {
        const driver = assumptions.getValue(COST_DRIVER_BY_KEY[key]);
        if (block.isHybrid) {
          // In hybrid FY2026, the driver ratio applies to the estimated H2 half.
          const h2Ratio = block.costs[key].h2.value / block.revenue.total.h2.value;
          assert.ok(
            Math.abs(h2Ratio - driver) < 1e-12,
            `${period}/${key}: H2 ratio ${h2Ratio} !== driver ${driver}`,
          );
        } else {
          const ratio = block.costs[key].value / block.revenue.total.value;
          assert.ok(
            Math.abs(ratio - driver) < 1e-12,
            `${period}/${key}: effective ratio ${ratio} !== driver ${driver}`,
          );
        }
      }
      // Gross profit + cost of revenue === total revenue (identity, recomputed).
      assert.ok(
        Math.abs(block.gross_profit.value + block.costs.cost_of_revenue.value - block.revenue.total.value) < 1e-9,
        `${period}: gross profit identity broken`,
      );
      // Operating income === gross profit − total opex, and opex === Σ opex lines.
      const opexSum = OPEX_LINE_KEYS.reduce((acc, key) => acc + block.costs[key].value, 0);
      assert.ok(Math.abs(opexSum - block.costs.opex_total.value) < 1e-9, `${period}: opex sum broken`);
      assert.ok(
        Math.abs(block.gross_profit.value - block.costs.opex_total.value - block.operating_income.value) < 1e-9,
        `${period}: operating income identity broken`,
      );
    }
  });

  test('revenue grows monotonically across the horizon within a sane band', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const out = project({ historical, assumptions });

    const totals = out.periods.map((p) => out.byPeriod[p].revenue.total.value);
    for (let i = 1; i < totals.length; i += 1) {
      assert.ok(totals[i] > totals[i - 1], `revenue must grow: ${out.periods[i]}`);
    }

    // Tripwires anchored on cited figures, not on hand-typed forecast numbers.
    const h1Actual = FORECAST_FIXTURES.h1Fy2026Actuals.revenue_total;
    const fy2025Revenue = 1_037_589;
    assert.ok(totals[0] > h1Actual * 2 * 0.95, `FY2026 revenue ${totals[0]} implausibly low`);
    assert.ok(totals[0] < h1Actual * 2 * 1.15, `FY2026 revenue ${totals[0]} implausibly high`);
    assert.ok(totals[totals.length - 1] > fy2025Revenue, 'FY2030 revenue below FY2025');
    assert.ok(totals[totals.length - 1] < fy2025Revenue * 5, 'FY2030 revenue implausibly high');
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('P3.1 — Cascade anti-retyping (mutation tests)', () => {
  test('mutating the paid-subscriber mid-year anchor changes subscription revenue', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const baseline = project({ historical, assumptions });

    const mutated = clone(historical);
    const row = mutated.kpis.find(
      (r) => r.metric === 'paid_subscribers' && r.period === 'Q2 FY2026',
    );
    row.value = row.value + 1_000_000;

    const after = project({ historical: mutated, assumptions });
    assert.notEqual(
      after.byPeriod.FY2026.revenue.segments.subscription.value,
      baseline.byPeriod.FY2026.revenue.segments.subscription.value,
      'the subscription cascade ignored the cited subscriber anchor',
    );
  });

  test('mutating a cited FY2026 quarter changes the H1 actual and the full year', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const baseline = project({ historical, assumptions });

    const mutated = clone(historical);
    const bump = 10_000;
    // The segment decomposition must stay internally consistent with the cited
    // revenue_total rows, so both move together.
    for (const metric of ['revenue_subscription', 'revenue_total']) {
      const row = mutated.income.find((r) => r.metric === metric && r.period === 'Q1 FY2026');
      row.value = row.value + bump;
    }

    const after = project({ historical: mutated, assumptions });
    const baseSubscription = baseline.byPeriod.FY2026.revenue.segments.subscription;
    const nextSubscription = after.byPeriod.FY2026.revenue.segments.subscription;

    assert.equal(
      nextSubscription.h1.value,
      baseSubscription.h1.value + bump,
      'H1 is not computed from the cited quarter rows',
    );
    assert.equal(
      after.byPeriod.FY2026.revenue.total.h1.value,
      baseline.byPeriod.FY2026.revenue.total.h1.value + bump,
      'H1 total is not computed from the cited quarter rows',
    );
    // H2 is invariant to the cited H1 actual: the driver model estimates H2 independently.
    assert.ok(
      Math.abs(nextSubscription.h2.value - baseSubscription.h2.value) < 1e-9,
      'H2 estimate must be invariant to the cited H1 actual',
    );
    // The full-year value carries the H1 surprise 1:1: value = h1 + h2.
    assert.ok(
      Math.abs(nextSubscription.value - (baseSubscription.value + bump)) < 1e-9,
      'the full-year value must move 1:1 when an H1 actual moves',
    );
    assert.ok(
      Math.abs(after.byPeriod.FY2026.revenue.total.value - (baseline.byPeriod.FY2026.revenue.total.value + bump)) < 1e-9,
      'the total revenue value must move 1:1 when an H1 actual moves',
    );
  });

  test('a corpus whose segment decomposition contradicts revenue_total fails closed', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const mutated = clone(historical);
    const row = mutated.income.find(
      (r) => r.metric === 'revenue_subscription' && r.period === 'Q1 FY2026',
    );
    row.value = row.value + 10_000;

    assert.throws(
      () => project({ historical: mutated, assumptions }),
      (err) =>
        err instanceof EngineError &&
        err.code === 'revenue_identity_failed' &&
        err.driverName === 'FY2026',
    );
  });

  test('mutating a driver changes the projection (no hardcoded driver values)', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const baseline = project({ historical, assumptions });

    const shifted = {
      getValue: (key) =>
        key === 'subscription_arpu' ? assumptions.getValue(key) * 1.1 : assumptions.getValue(key),
    };
    const after = project({ historical, assumptions: shifted });

    assert.ok(
      after.byPeriod.FY2028.revenue.segments.subscription.value >
        baseline.byPeriod.FY2028.revenue.segments.subscription.value * 1.05,
      'the ARPU driver did not drive the cascade',
    );
  });

  test('mutating the FY2025 segment base changes the forecast path', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const baseline = project({ historical, assumptions });

    const mutated = clone(historical);
    const row = mutated.income.find(
      (r) => r.metric === 'revenue_advertising' && r.period === 'FY2025',
    );
    row.value = row.value * 2;

    const after = project({ historical: mutated, assumptions });
    assert.ok(
      after.byPeriod.FY2027.revenue.segments.advertising.value >
        baseline.byPeriod.FY2027.revenue.segments.advertising.value * 1.9,
      'the advertising path ignored its cited FY2025 base',
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('P3.1 — Purity, determinism, immutability & literal gate', () => {
  test('src/engine/forecast.js contains zero forbidden side-effecting APIs', () => {
    const code = fs.readFileSync(ENGINE_PATH, 'utf8');
    assert.doesNotMatch(code, /\bwindow\b/);
    assert.doesNotMatch(code, /\bdocument\b/);
    assert.doesNotMatch(code, /\bfetch\s*\(/);
    assert.doesNotMatch(code, /\bDate\.now\s*\(/);
    assert.doesNotMatch(code, /\bMath\.random\s*\(/);
    assert.doesNotMatch(code, /\bsetTimeout\s*\(/);
    assert.doesNotMatch(code, /\bsetInterval\s*\(/);
  });

  test('src/engine/forecast.js contains zero bare numeric literals > 999 outside comments', () => {
    const code = fs.readFileSync(ENGINE_PATH, 'utf8');
    const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const largeNumbers = [...stripped.matchAll(/\b\d{4,}\b/g)].map((m) => m[0]);
    assert.deepEqual(
      largeNumbers,
      [],
      `forecast.js must contain zero bare numeric literals > 999 outside comments, found: ${largeNumbers.join(', ')}`,
    );
  });

  test('repeat runs are byte-identical', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const a = project({ historical, assumptions });
    const b = project({ historical, assumptions });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  test('output is deeply frozen', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const out = project({ historical, assumptions });

    assert.ok(Object.isFrozen(out));
    assert.ok(Object.isFrozen(out.byPeriod));
    assert.ok(Object.isFrozen(out.periods));
    assert.ok(Object.isFrozen(out.byPeriod.FY2026));
    assert.ok(Object.isFrozen(out.byPeriod.FY2026.revenue));
    assert.ok(Object.isFrozen(out.byPeriod.FY2026.revenue.segments));
    assert.ok(Object.isFrozen(out.byPeriod.FY2026.revenue.total));
    assert.ok(Object.isFrozen(out.byPeriod.FY2026.revenue.total.h1));
    assert.ok(Object.isFrozen(out.byPeriod.FY2026.revenue.total.h1.derivedFrom));

    assert.throws(() => {
      'use strict';
      out.byPeriod.FY2026.revenue.total.value = 0;
    }, TypeError);
  });

  test('every forward value carries isEstimate: true; H1 actuals carry provenance', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const out = project({ historical, assumptions });

    for (const period of out.periods) {
      const block = out.byPeriod[period];
      assert.equal(block.isEstimate, true, `${period}: block isEstimate`);
      assert.equal(block.isComputed, true, `${period}: block isComputed`);
      assert.equal(block.revenue.total.isEstimate, true, `${period}: total isEstimate`);
      for (const key of REVENUE_SEGMENT_KEYS) {
        assert.equal(block.revenue.segments[key].isEstimate, true, `${period}/${key}: isEstimate`);
      }
      for (const key of COST_LINE_KEYS) {
        assert.equal(block.costs[key].isEstimate, true, `${period}/costs.${key}: isEstimate`);
      }
      assert.equal(block.gross_profit.isEstimate, true, `${period}: gross profit isEstimate`);
      assert.equal(block.operating_income.isEstimate, true, `${period}: operating income isEstimate`);
    }
  });

  test('project() does not mutate its inputs', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const before = JSON.stringify(driverValues(assumptions));
    project({ historical, assumptions });
    assert.equal(JSON.stringify(driverValues(assumptions)), before);
  });

  test('no forecast value leaks into the data layer', async () => {
    const historical = await getHistorical();
    const rows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];
    const estimates = rows.filter((r) => r.isEstimate === true);
    assert.deepEqual(estimates, [], 'the corpus must contain zero estimate rows');
    assert.equal(rows.length, P2_CORPUS_RECORD_COUNT);
  });
});
